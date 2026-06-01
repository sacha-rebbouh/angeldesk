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
  };
  return { prisma };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMocks.prisma }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("@/services/storage", () => ({ uploadFile: vi.fn() }));

import { persistDebateRecord } from "../persistence";

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
