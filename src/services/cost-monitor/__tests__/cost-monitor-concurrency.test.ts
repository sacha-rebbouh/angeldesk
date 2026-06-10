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
  analysis: { update: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    costEvent: {
      create: (a: unknown) => mockPrisma.costEvent.create(a),
      aggregate: (a: unknown) => mockPrisma.costEvent.aggregate(a),
    },
    deal: { findUnique: (a: unknown) => mockPrisma.deal.findUnique(a) },
    analysis: { update: (a: unknown) => mockPrisma.analysis.update(a) },
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
    mockPrisma.analysis.update.mockResolvedValue({});
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
});
