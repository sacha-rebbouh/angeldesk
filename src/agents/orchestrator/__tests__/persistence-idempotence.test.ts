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
    analysisCheckpoint: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMocks.prisma }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("@/services/storage", () => ({ uploadFile: vi.fn() }));

import { persistDebateRecord, persistScoredFindings, loadLatestCheckpoint } from "../persistence";
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
