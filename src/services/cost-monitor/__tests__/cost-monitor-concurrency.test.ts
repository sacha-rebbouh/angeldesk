/**
 * Phase E (E4) — isolation par-analyse du CostMonitor.
 *
 * Le slot unique `currentAnalysis` corrompait l'attribution quand deux analyses
 * tournaient en parallèle sur le même runtime serverless réutilisé (la 2e
 * startAnalysis écrasait la 1re). On vérifie ici qu'une Map indexée par
 * analysisId attribue chaque appel à SON analyse, ne devine jamais (drop
 * explicite d'un appel non identifiable), et clôt chaque analyse indépendamment.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  costEvent: { create: vi.fn(), aggregate: vi.fn() },
  deal: { findUnique: vi.fn() },
  analysis: { findUnique: vi.fn(), update: vi.fn() },
  lLMCallLog: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    costEvent: {
      create: (a: unknown) => mockPrisma.costEvent.create(a),
      aggregate: (a: unknown) => mockPrisma.costEvent.aggregate(a),
    },
    deal: { findUnique: (a: unknown) => mockPrisma.deal.findUnique(a) },
    analysis: {
      findUnique: (a: unknown) => mockPrisma.analysis.findUnique(a),
      update: (a: unknown) => mockPrisma.analysis.update(a),
    },
    lLMCallLog: { findMany: (a: unknown) => mockPrisma.lLMCallLog.findMany(a) },
  },
}));

vi.mock("@/lib/logger", () => {
  const loggerMock = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(() => loggerMock),
  };
  return { logger: loggerMock, createLogger: vi.fn(() => loggerMock) };
});

// persistReport importe dynamiquement ces deux modules (dans des try/catch) ;
// on les neutralise pour garder endAnalysis silencieux et hors-réseau.
vi.mock("@/services/analysis-results/load-results", () => ({
  loadResults: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/services/storage", () => ({
  uploadFile: vi.fn().mockResolvedValue(undefined),
}));

const { costMonitor } = await import("../index");

describe("Phase E E4 — CostMonitor par-analyse (attribution concurrente)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.costEvent.create.mockResolvedValue({});
    mockPrisma.costEvent.aggregate.mockResolvedValue({ _sum: { cost: 0 } });
    mockPrisma.deal.findUnique.mockResolvedValue(null); // getDealCostSummary → null (pas d'alerte deal)
    mockPrisma.analysis.findUnique.mockResolvedValue(null);
    mockPrisma.analysis.update.mockResolvedValue({});
    mockPrisma.lLMCallLog.findMany.mockResolvedValue([]);
  });

  it("attribue chaque appel à SON analyse, drop l'appel non identifiable, et clôt indépendamment", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Deux analyses concurrentes sur le même singleton.
    costMonitor.startAnalysis({ analysisId: "an_a", dealId: "deal_a", userId: "user_a", type: "full_analysis" });
    costMonitor.startAnalysis({ analysisId: "an_b", dealId: "deal_b", userId: "user_b", type: "quick_scan" });

    // Appels entrelacés, chacun tagué par l'analysisId (résolu par l'ALS router au runtime).
    costMonitor.recordCall({ analysisId: "an_a", model: "m", agent: "agent-a1", inputTokens: 100, outputTokens: 50, cost: 0.01 });
    costMonitor.recordCall({ analysisId: "an_b", model: "m", agent: "agent-b1", inputTokens: 200, outputTokens: 80, cost: 0.02 });
    costMonitor.recordCall({ analysisId: "an_a", model: "m", agent: "agent-a2", inputTokens: 100, outputTokens: 50, cost: 0.03 });
    // Appel tagué pour une analyse NON enregistrée → drop explicite (jamais
    // attribué à A ou B, même si elles sont actives).
    costMonitor.recordCall({ analysisId: "an_ghost", model: "m", agent: "ghost", inputTokens: 1, outputTokens: 1, cost: 0.99 });

    await new Promise((resolve) => setImmediate(resolve)); // fire-and-forget persist

    const creates = mockPrisma.costEvent.create.mock.calls.map((c) => c[0].data);
    const aEvents = creates.filter((d: { analysisId: string }) => d.analysisId === "an_a");
    const bEvents = creates.filter((d: { analysisId: string }) => d.analysisId === "an_b");
    const ghostEvents = creates.filter((d: { analysisId: string }) => d.analysisId === "an_ghost");

    // Attribution exacte, aucune contamination croisée (le dealId provient de l'accumulateur).
    expect(aEvents.map((d: { agent: string }) => d.agent).sort()).toEqual(["agent-a1", "agent-a2"]);
    expect(aEvents.every((d: { dealId: string }) => d.dealId === "deal_a")).toBe(true);
    expect(bEvents.map((d: { agent: string }) => d.agent)).toEqual(["agent-b1"]);
    expect(bEvents.every((d: { dealId: string }) => d.dealId === "deal_b")).toBe(true);
    // L'appel non identifiable est droppé (pas mis-attribué), avec un warn.
    expect(ghostEvents).toHaveLength(0);
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("an_ghost"));

    // Clôture indépendante : chaque rapport ne porte que SES appels.
    const reportA = await costMonitor.endAnalysis({ analysisId: "an_a" });
    expect(reportA?.totalCalls).toBe(2);
    expect(reportA?.totalCost).toBeCloseTo(0.04, 5);

    // endAnalysis(A) a retiré UNIQUEMENT A : un nouvel appel pour A est droppé,
    // alors que B reste actif et enregistre toujours.
    mockPrisma.costEvent.create.mockClear();
    costMonitor.recordCall({ analysisId: "an_a", model: "m", agent: "late-a", inputTokens: 1, outputTokens: 1, cost: 0.5 });
    costMonitor.recordCall({ analysisId: "an_b", model: "m", agent: "agent-b2", inputTokens: 10, outputTokens: 5, cost: 0.04 });
    await new Promise((resolve) => setImmediate(resolve));
    const afterCreates = mockPrisma.costEvent.create.mock.calls.map((c) => c[0].data);
    expect(afterCreates.filter((d: { analysisId: string }) => d.analysisId === "an_a")).toHaveLength(0);
    expect(afterCreates.filter((d: { analysisId: string }) => d.analysisId === "an_b")).toHaveLength(1);

    const reportB = await costMonitor.endAnalysis({ analysisId: "an_b" });
    expect(reportB?.totalCalls).toBe(2); // agent-b1 + agent-b2
    expect(reportB?.totalCost).toBeCloseTo(0.06, 5);

    consoleWarnSpy.mockRestore();
  });

  it("droppe un appel router SANS contexte (analysisId: undefined) même si une seule analyse est active", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    costMonitor.startAnalysis({ analysisId: "an_solo", dealId: "deal_s", userId: "user_s", type: "full_analysis" });

    // Champ analysisId PRÉSENT mais undefined = appel router hors scope ALS
    // (ex. board / appel orphelin). Ne doit PAS être attribué à an_solo.
    costMonitor.recordCall({ analysisId: undefined, model: "m", agent: "board-ish", inputTokens: 1, outputTokens: 1, cost: 0.5 });
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockPrisma.costEvent.create).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalled();

    await costMonitor.endAnalysis({ analysisId: "an_solo" });
    consoleWarnSpy.mockRestore();
  });

  it("reconstruit le rapport depuis LLMCallLog quand l'accumulateur mémoire a disparu", async () => {
    mockPrisma.lLMCallLog.findMany.mockResolvedValue([
      { model: "model-a", provider: "openrouter", agentName: "agent-alpha", inputTokens: 100, outputTokens: 50, cost: 0.1 },
      { model: "model-b", provider: "openrouter", agentName: "agent-beta", inputTokens: 300, outputTokens: 100, cost: 0.4 },
      { model: "model-a", provider: "openrouter", agentName: "agent-alpha", inputTokens: 200, outputTokens: 50, cost: 0.2 },
    ]);
    mockPrisma.analysis.findUnique.mockResolvedValue({
      dealId: "deal_durable",
      mode: "full_analysis",
      type: "FULL_DD",
      startedAt: new Date(Date.now() - 1_000),
      createdAt: new Date(Date.now() - 2_000),
    });

    const report = await costMonitor.endAnalysis({ analysisId: "an_durable" });

    expect(report).not.toBeNull();
    expect(report?.totalCalls).toBe(3);
    expect(report?.totalInputTokens).toBe(600);
    expect(report?.totalOutputTokens).toBe(200);
    expect(report?.totalCost).toBeCloseTo(0.7, 8);
    expect(report?.byModel).toEqual([
      { model: "model-a", calls: 2, inputTokens: 300, outputTokens: 100, cost: 0.30000000000000004 },
      { model: "model-b", calls: 1, inputTokens: 300, outputTokens: 100, cost: 0.4 },
    ]);
    expect(report?.byAgent).toEqual({
      "agent-alpha": { model: "model-a", calls: 2, inputTokens: 300, outputTokens: 100, cost: 0.30000000000000004 },
      "agent-beta": { model: "model-b", calls: 1, inputTokens: 300, outputTokens: 100, cost: 0.4 },
    });
    expect(mockPrisma.analysis.update.mock.calls[0]?.[0].data.results._costReport).toEqual({
      totalCalls: 3,
      totalInputTokens: 600,
      totalOutputTokens: 200,
      byModel: report?.byModel,
      byAgent: report?.byAgent,
    });
    expect(mockPrisma.lLMCallLog.findMany).toHaveBeenCalledWith({
      where: { analysisId: "an_durable" },
      select: {
        model: true,
        provider: true,
        agentName: true,
        inputTokens: true,
        outputTokens: true,
        cost: true,
      },
      orderBy: { createdAt: "asc" },
    });
  });

  it("remplace un accumulateur incomplet par la source durable", async () => {
    costMonitor.startAnalysis({ analysisId: "an_partial", dealId: "deal_partial", userId: "user_partial", type: "full_analysis" });
    costMonitor.recordCall({ analysisId: "an_partial", model: "model-a", agent: "agent-a", inputTokens: 10, outputTokens: 5, cost: 0.01 });
    mockPrisma.lLMCallLog.findMany.mockResolvedValue([
      { model: "model-a", provider: "openrouter", agentName: "agent-a", inputTokens: 10, outputTokens: 5, cost: 0.01 },
      { model: "model-b", provider: "openrouter", agentName: "agent-b", inputTokens: 20, outputTokens: 10, cost: 0.02 },
    ]);

    const report = await costMonitor.endAnalysis({ analysisId: "an_partial" });

    expect(report?.totalCalls).toBe(2);
    expect(report?.totalCost).toBeCloseTo(0.03, 8);
    expect(report?.byAgent).toHaveProperty("agent-b");
    expect(mockPrisma.analysis.findUnique).not.toHaveBeenCalled();
  });

  it("conserve le chemin mono-invocation sans lecture LLMCallLog", async () => {
    costMonitor.startAnalysis({ analysisId: "an_mono", dealId: "deal_mono", userId: "user_mono", type: "full_analysis" });
    costMonitor.recordCall({ model: "model-mono", agent: "agent-mono", inputTokens: 40, outputTokens: 20, cost: 0.04 });

    const report = await costMonitor.endAnalysis();

    expect(report?.totalCalls).toBe(1);
    expect(report?.totalCost).toBeCloseTo(0.04, 8);
    expect(mockPrisma.lLMCallLog.findMany).not.toHaveBeenCalled();
  });

  it("retourne null sans crash pour une analyse sans accumulateur ni appel durable", async () => {
    await expect(
      costMonitor.endAnalysis({ analysisId: "an_without_calls" })
    ).resolves.toBeNull();
    expect(mockPrisma.analysis.findUnique).not.toHaveBeenCalled();
  });
});
