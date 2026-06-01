import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase D — précondition replay-safety des side-effects de persistance.
// persistDebateRecord : create → upsert par contradictionId (@unique). Re-persister le
// MÊME objet contradiction (retry de step, ou contradiction portée par le StepState
// snapshot — cf. blocker #1) ne crée alors pas de doublon ni de violation de clé.
// La réutilisation des mêmes ids au replay est garantie par le carry des contradictions
// (étape D ultérieure), pas par ce helper (les ids sont des UUID aléatoires). Sur run
// neuf (1er write), le comportement reste identique à l'ancien `create`.

const prismaMocks = vi.hoisted(() => {
  const prisma = {
    debateRecord: { upsert: vi.fn() },
    scoredFinding: { deleteMany: vi.fn(), createMany: vi.fn() },
    analysisCheckpoint: { findFirst: vi.fn(), groupBy: vi.fn() },
    analysis: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    $executeRawUnsafe: vi.fn(),
    $transaction: vi.fn(),
  };
  return { prisma };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMocks.prisma }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("@/services/storage", () => ({ uploadFile: vi.fn() }));

import { persistDebateRecord, persistScoredFindings, loadLatestCheckpoint, findInterruptedAnalyses, createAnalysis } from "../persistence";
import type { ScoredFinding } from "@/scoring/types";

const debateResult = {
  contradiction: {
    id: "contra_1",
    topic: "valuation gap",
    severity: "high",
    claims: [{ agentName: "financial-auditor" }, { agentName: "market-intelligence" }],
    status: "resolved",
  },
  rounds: [{ round: 1 }],
  resolution: {
    resolvedBy: "arbitrator",
    winner: "financial-auditor",
    resolution: "Le multiple retenu est défendable sous réserve de croissance.",
    confidence: { score: 0.82 },
  },
};

describe("persistence idempotence (Phase D replay-safety)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMocks.prisma.debateRecord.upsert.mockResolvedValue({ id: "debate_1" });
  });

  it("persistDebateRecord upserts par contradictionId (clé @unique), pas de create brut", async () => {
    await persistDebateRecord("analysis_1", debateResult);

    expect(prismaMocks.prisma.debateRecord.upsert).toHaveBeenCalledTimes(1);
    const arg = prismaMocks.prisma.debateRecord.upsert.mock.calls[0][0] as {
      where: { contradictionId: string };
      create: { contradictionId: string; analysisId: string; participants: string[] };
      update: { contradictionId: string };
    };
    expect(arg.where).toEqual({ contradictionId: "contra_1" });
    expect(arg.create.contradictionId).toBe("contra_1");
    expect(arg.create.analysisId).toBe("analysis_1");
    expect(arg.create.participants).toEqual(["financial-auditor", "market-intelligence"]);
    // create et update partagent le même payload → l'enregistrement converge vers le même état.
    expect(arg.update.contradictionId).toBe("contra_1");
  });

  it("persistDebateRecord re-persistant le MÊME objet contradiction cible la même clé unique (DB collapse → 1 row)", async () => {
    await persistDebateRecord("analysis_1", debateResult);
    await persistDebateRecord("analysis_1", debateResult); // re-persist du même objet (retry de step / contradiction portée par snapshot)

    expect(prismaMocks.prisma.debateRecord.upsert).toHaveBeenCalledTimes(2);
    const where0 = (prismaMocks.prisma.debateRecord.upsert.mock.calls[0][0] as { where: unknown }).where;
    const where1 = (prismaMocks.prisma.debateRecord.upsert.mock.calls[1][0] as { where: unknown }).where;
    expect(where0).toEqual({ contradictionId: "contra_1" });
    expect(where1).toEqual({ contradictionId: "contra_1" });
  });
});

const scoredFindings = [
  {
    metric: "ARR growth",
    category: "financial",
    value: 120,
    unit: "%",
    normalizedValue: 0.8,
    percentile: 75,
    assessment: "strong",
    benchmarkData: null,
    confidence: { level: "high", score: 0.9, factors: [] },
    evidence: [],
  },
] as unknown as ScoredFinding[];

describe("persistScoredFindings — delete+insert transactionnel (Phase D replay-safety)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMocks.prisma.$transaction.mockResolvedValue([]);
    prismaMocks.prisma.scoredFinding.deleteMany.mockReturnValue({ __op: "deleteMany" });
    prismaMocks.prisma.scoredFinding.createMany.mockReturnValue({ __op: "createMany" });
  });

  it("supprime puis réinsère, scopé par (analysisId, agentName), dans une seule transaction", async () => {
    await persistScoredFindings("analysis_1", "financial-auditor", scoredFindings);

    expect(prismaMocks.prisma.scoredFinding.deleteMany).toHaveBeenCalledWith({
      where: { analysisId: "analysis_1", agentName: "financial-auditor" },
    });
    expect(prismaMocks.prisma.scoredFinding.createMany).toHaveBeenCalledTimes(1);
    expect(prismaMocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    const txArg = prismaMocks.prisma.$transaction.mock.calls[0][0];
    expect(Array.isArray(txArg)).toBe(true);
    expect(txArg).toHaveLength(2); // [deleteMany, createMany] atomiques
  });

  it("re-persist (retry de step) répète delete+insert → set final identique, pas d'accumulation", async () => {
    await persistScoredFindings("analysis_1", "financial-auditor", scoredFindings);
    await persistScoredFindings("analysis_1", "financial-auditor", scoredFindings);

    expect(prismaMocks.prisma.scoredFinding.deleteMany).toHaveBeenCalledTimes(2);
    expect(prismaMocks.prisma.scoredFinding.deleteMany).toHaveBeenNthCalledWith(1, {
      where: { analysisId: "analysis_1", agentName: "financial-auditor" },
    });
    expect(prismaMocks.prisma.scoredFinding.deleteMany).toHaveBeenNthCalledWith(2, {
      where: { analysisId: "analysis_1", agentName: "financial-auditor" },
    });
  });

  it("no-op si aucun finding (early return, ne supprime PAS les findings existants)", async () => {
    await persistScoredFindings("analysis_1", "financial-auditor", []);
    expect(prismaMocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(prismaMocks.prisma.scoredFinding.deleteMany).not.toHaveBeenCalled();
  });
});

describe("loadLatestCheckpoint — ignore les checkpoints STEPWISE:* (garde resume legacy, Phase D)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMocks.prisma.analysisCheckpoint.findFirst.mockResolvedValue(null);
  });

  it("filtre OUT state STEPWISE:* dans la requête (le resume legacy + restoreFromDb ne voient jamais un StepState)", async () => {
    await loadLatestCheckpoint("analysis_1");

    expect(prismaMocks.prisma.analysisCheckpoint.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { analysisId: "analysis_1", state: { not: { startsWith: "STEPWISE:" } } },
      })
    );
  });
});

describe("findInterruptedAnalyses — n'offre pas le resume legacy sur des checkpoints STEPWISE:* seuls (Phase D)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMocks.prisma.analysis.findMany.mockResolvedValue([
      {
        id: "a1",
        dealId: "d1",
        deal: { name: "Acme" },
        type: "full_analysis",
        mode: null,
        startedAt: new Date("2026-06-01T00:00:00.000Z"),
        completedAgents: 3,
        totalAgents: 21,
        totalCost: 1,
      },
    ]);
    prismaMocks.prisma.analysisCheckpoint.groupBy.mockResolvedValue([]);
  });

  it("le groupBy de checkpoints filtre OUT STEPWISE:* (canResume legacy ne compte que des checkpoints réels)", async () => {
    await findInterruptedAnalyses("user_1");

    expect(prismaMocks.prisma.analysisCheckpoint.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { analysisId: { in: ["a1"] }, state: { not: { startsWith: "STEPWISE:" } } },
      })
    );
  });
});

describe("createAnalysis — init idempotent par dispatchEventId (Phase D)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // createAnalysis utilise la forme CALLBACK de $transaction.
    prismaMocks.prisma.$transaction.mockImplementation(async (cb: unknown) =>
      typeof cb === "function" ? (cb as (tx: unknown) => unknown)(prismaMocks.prisma) : cb
    );
  });

  it("réutilise l'analyse RUNNING du même run (dispatchEventId) au lieu de créer", async () => {
    const existing = { id: "analysis_existing", dealId: "deal_1", status: "RUNNING", dispatchEventId: "evt_1" };
    prismaMocks.prisma.analysis.findFirst.mockResolvedValueOnce(existing); // reuse check: hit

    const result = await createAnalysis({
      dealId: "deal_1",
      type: "full_analysis",
      totalAgents: 21,
      dispatchEventId: "evt_1",
      documentIds: [],
    });

    expect(result).toBe(existing);
    expect(prismaMocks.prisma.analysis.create).not.toHaveBeenCalled();
    expect(prismaMocks.prisma.analysis.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { dealId: "deal_1", status: "RUNNING", dispatchEventId: "evt_1" },
      })
    );
  });

  it("crée avec dispatchEventId si aucun run existant (reuse manqué + garde libre)", async () => {
    prismaMocks.prisma.analysis.findFirst
      .mockResolvedValueOnce(null) // reuse check: aucun run identique
      .mockResolvedValueOnce(null); // garde: aucun autre RUNNING
    prismaMocks.prisma.analysis.create.mockResolvedValue({ id: "analysis_new" });

    const result = await createAnalysis({
      dealId: "deal_1",
      type: "full_analysis",
      totalAgents: 21,
      dispatchEventId: "evt_1",
      documentIds: [],
    });

    expect(result).toEqual({ id: "analysis_new" });
    expect(prismaMocks.prisma.analysis.create).toHaveBeenCalledTimes(1);
    const createArg = prismaMocks.prisma.analysis.create.mock.calls[0][0] as { data: { dispatchEventId: string | null } };
    expect(createArg.data.dispatchEventId).toBe("evt_1");
  });

  it("sans dispatchEventId : comportement inchangé (pas de reuse check, garde + create dispatchEventId null)", async () => {
    prismaMocks.prisma.analysis.findFirst.mockResolvedValueOnce(null); // garde uniquement
    prismaMocks.prisma.analysis.create.mockResolvedValue({ id: "analysis_legacy" });

    await createAnalysis({
      dealId: "deal_1",
      type: "full_analysis",
      totalAgents: 21,
      documentIds: [],
    });

    expect(prismaMocks.prisma.analysis.findFirst).toHaveBeenCalledTimes(1); // un seul findFirst = la garde
    const createArg = prismaMocks.prisma.analysis.create.mock.calls[0][0] as { data: { dispatchEventId: string | null } };
    expect(createArg.data.dispatchEventId).toBeNull();
  });
});
