import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocks alignés sur persistence-progress-monotone.test.ts ($transaction → callback(prisma)).
const prismaMocks = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
    analysis: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };

  prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) =>
    callback(prisma)
  );

  return { prisma };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMocks.prisma }));
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock("@/services/storage", () => ({ uploadFile: vi.fn() }));
vi.mock("@/services/deals/analysis-signal-summary", () => ({
  upsertAnalysisSignalSummary: vi.fn(),
}));

import { completeAnalysis, markAnalysisAsFailed, salvageAnalysisFromSnapshot } from "../persistence";
import { logger } from "@/lib/logger";
import { uploadFile } from "@/services/storage";
import { upsertAnalysisSignalSummary } from "@/services/deals/analysis-signal-summary";

const SNAPSHOT_RESULTS = {
  "financial-auditor": { agentName: "financial-auditor", success: true, cost: 0.1, executionTimeMs: 10 },
  "synthesis-deal-scorer": { agentName: "synthesis-deal-scorer", success: true, cost: 0.2, executionTimeMs: 20 },
  "memo-generator": { agentName: "memo-generator", success: false, cost: 0, executionTimeMs: 0, error: "Interrompu" },
};

function runningCurrent(over: Record<string, unknown> = {}) {
  return {
    status: "RUNNING",
    dealId: "deal_1",
    completedAgents: 21,
    totalCost: "0.50",
    results: null,
    ...over,
  };
}

const PARAMS = {
  analysisId: "analysis_1",
  results: SNAPSHOT_RESULTS as unknown as Record<string, unknown>,
  summary: "Analyse finalisée automatiquement (dégradée)",
  totalCost: 1.5,
  totalTimeMs: 600_000,
};

// Salvage watchdog : flip RUNNING→COMPLETED GATE sur le statut. Contrairement à
// completeAnalysis (re-complétion permise), seul le gagnant du gate écrit + applique
// les effets post-complétion. Invariants money-critical : jamais d'écrasement d'un
// terminal, merge monotone des results, effets seulement si le flip a gagné.
describe("salvageAnalysisFromSnapshot — flip RUNNING-gated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMocks.prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prismaMocks.prisma) => unknown) => callback(prismaMocks.prisma)
    );
    prismaMocks.prisma.analysis.updateMany.mockResolvedValue({ count: 1 });
  });

  it("flip gagné : COMPLETED + merge results + compteurs monotones + effets post-complétion", async () => {
    prismaMocks.prisma.analysis.findUnique.mockResolvedValue(runningCurrent());

    const res = await salvageAnalysisFromSnapshot(PARAMS);

    expect(res).toEqual({ salvaged: true, dealId: "deal_1" });

    // Écriture gated sur status RUNNING (jamais d'écrasement d'un terminal).
    const update = prismaMocks.prisma.analysis.updateMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(update.where).toEqual({ id: "analysis_1", status: "RUNNING" });
    expect(update.data.status).toBe("COMPLETED");
    expect(update.data.summary).toBe(PARAMS.summary);
    expect(update.data.totalTimeMs).toBe(600_000);
    // monotone : 2 succès dans le snapshot < 21 déjà persistés → garde 21
    expect(update.data.completedAgents).toBe(21);
    // monotone : max(0.50 existant, 1.5 snapshot)
    expect(update.data.totalCost).toBe(1.5);
    expect(update.data.results).toMatchObject({
      "financial-auditor": { success: true },
      "memo-generator": { success: false },
    });

    // Effets post-complétion : cache blob + read-model H2.
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(vi.mocked(uploadFile).mock.calls[0][0]).toBe("analysis-results/analysis_1.json");
    expect(upsertAnalysisSignalSummary).toHaveBeenCalledWith(
      "analysis_1",
      "deal_1",
      expect.objectContaining({ "memo-generator": expect.objectContaining({ success: false }) })
    );

    // Signal I1 « completed degraded » : memo en échec dans le set livré.
    const errorCalls = vi.mocked(logger.error).mock.calls as unknown as Array<
      [Record<string, unknown>, string]
    >;
    const degraded = errorCalls.filter((c) => c[1] === "Analysis completed degraded");
    expect(degraded).toHaveLength(1);
    expect((degraded[0][0] as { failedAgents: string[] }).failedAgents).toContain("memo-generator");
  });

  it("merge monotone : un agent présent en DB mais absent du snapshot est CONSERVÉ", async () => {
    prismaMocks.prisma.analysis.findUnique.mockResolvedValue(
      runningCurrent({
        results: { "legal-regulatory": { agentName: "legal-regulatory", success: true } },
      })
    );

    await salvageAnalysisFromSnapshot(PARAMS);

    const update = prismaMocks.prisma.analysis.updateMany.mock.calls[0][0] as {
      data: { results: Record<string, unknown> };
    };
    expect(update.data.results["legal-regulatory"]).toMatchObject({ success: true });
    expect(update.data.results["financial-auditor"]).toMatchObject({ success: true });
  });

  it("analyse plus RUNNING au read → aucun write, aucun effet, salvaged:false", async () => {
    prismaMocks.prisma.analysis.findUnique.mockResolvedValue(runningCurrent({ status: "FAILED" }));

    const res = await salvageAnalysisFromSnapshot(PARAMS);

    expect(res.salvaged).toBe(false);
    expect(prismaMocks.prisma.analysis.updateMany).not.toHaveBeenCalled();
    expect(uploadFile).not.toHaveBeenCalled();
    expect(upsertAnalysisSignalSummary).not.toHaveBeenCalled();
  });

  it("course perdue au WRITE (read RUNNING mais updateMany count=0) → aucun effet post-complétion", async () => {
    prismaMocks.prisma.analysis.findUnique.mockResolvedValue(runningCurrent());
    prismaMocks.prisma.analysis.updateMany.mockResolvedValue({ count: 0 });

    const res = await salvageAnalysisFromSnapshot(PARAMS);

    expect(res.salvaged).toBe(false);
    expect(uploadFile).not.toHaveBeenCalled();
    expect(upsertAnalysisSignalSummary).not.toHaveBeenCalled();
  });

  it("analyse introuvable → salvaged:false, dealId:null, aucun write", async () => {
    prismaMocks.prisma.analysis.findUnique.mockResolvedValue(null);

    const res = await salvageAnalysisFromSnapshot(PARAMS);

    expect(res).toEqual({ salvaged: false, dealId: null });
    expect(prismaMocks.prisma.analysis.updateMany).not.toHaveBeenCalled();
  });
});

// ===== completeAnalysis — override FAILED terminal-safe (gate Codex salvage) =====
// Un worker Inngest tardif qui échoue APRÈS livraison (complétion normale ou salvage
// watchdog) ne doit JAMAIS dé-livrer : pas d'écrasement COMPLETED→FAILED, pas d'effets.
describe("completeAnalysis — statusOverride FAILED ne peut pas écraser une analyse livrée", () => {
  const FAILED_PARAMS = {
    analysisId: "analysis_1",
    success: false,
    totalCost: 0.1,
    totalTimeMs: 1_000,
    summary: "crash tardif",
    results: {} as Record<string, never>,
    statusOverride: "FAILED" as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMocks.prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prismaMocks.prisma) => unknown) => callback(prismaMocks.prisma)
    );
    prismaMocks.prisma.analysis.updateMany.mockResolvedValue({ count: 1 });
  });

  it("analyse déjà COMPLETED → AUCUN write (update/updateMany), AUCUN effet", async () => {
    prismaMocks.prisma.analysis.findUnique.mockResolvedValue(
      runningCurrent({ status: "COMPLETED", completedAgents: 22 })
    );

    await completeAnalysis(FAILED_PARAMS);

    expect(prismaMocks.prisma.analysis.update).not.toHaveBeenCalled();
    expect(prismaMocks.prisma.analysis.updateMany).not.toHaveBeenCalled();
    expect(uploadFile).not.toHaveBeenCalled();
    expect(upsertAnalysisSignalSummary).not.toHaveBeenCalled();
  });

  it("analyse RUNNING → écrit FAILED via updateMany CONDITIONNEL (NOT COMPLETED), blob mais pas de read-model", async () => {
    prismaMocks.prisma.analysis.findUnique.mockResolvedValue(runningCurrent());

    await completeAnalysis(FAILED_PARAMS);

    const call = prismaMocks.prisma.analysis.updateMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(call.where).toEqual({ id: "analysis_1", NOT: { status: "COMPLETED" } });
    expect(call.data.status).toBe("FAILED");
    // Effets FAILED : cache blob oui (comportement existant), read-model H2 non.
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(upsertAnalysisSignalSummary).not.toHaveBeenCalled();
  });

  it("course read→write : complétée entre le read et le write (count=0) → aucun effet", async () => {
    prismaMocks.prisma.analysis.findUnique.mockResolvedValue(runningCurrent());
    prismaMocks.prisma.analysis.updateMany.mockResolvedValue({ count: 0 });

    await completeAnalysis(FAILED_PARAMS);

    expect(uploadFile).not.toHaveBeenCalled();
    expect(upsertAnalysisSignalSummary).not.toHaveBeenCalled();
  });

  it("complétion normale (sans override) : update inchangé, pas de gate", async () => {
    prismaMocks.prisma.analysis.findUnique.mockResolvedValue(runningCurrent());
    prismaMocks.prisma.analysis.update.mockResolvedValue({ id: "analysis_1", dealId: "deal_1" });

    await completeAnalysis({ ...FAILED_PARAMS, statusOverride: undefined });

    expect(prismaMocks.prisma.analysis.update).toHaveBeenCalledTimes(1);
    expect(prismaMocks.prisma.analysis.updateMany).not.toHaveBeenCalled();
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(upsertAnalysisSignalSummary).toHaveBeenCalledTimes(1);
  });
});

// markAnalysisAsFailed (chemin resume) : même invariant terminal-safe que l'override
// FAILED de completeAnalysis — un salvage watchdog commis entre le read RUNNING du
// resume et ce write ne doit jamais être écrasé.
describe("markAnalysisAsFailed — terminal-safe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("écrit FAILED via updateMany CONDITIONNEL (NOT COMPLETED)", async () => {
    prismaMocks.prisma.analysis.updateMany.mockResolvedValue({ count: 1 });

    await markAnalysisAsFailed("analysis_1", "No checkpoint available for recovery");

    const call = prismaMocks.prisma.analysis.updateMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(call.where).toEqual({ id: "analysis_1", NOT: { status: "COMPLETED" } });
    expect(call.data.status).toBe("FAILED");
  });

  it("analyse déjà COMPLETED (count=0) → warn, pas de crash", async () => {
    prismaMocks.prisma.analysis.updateMany.mockResolvedValue({ count: 0 });

    await expect(markAnalysisAsFailed("analysis_1", "raison")).resolves.toBeUndefined();
  });
});
