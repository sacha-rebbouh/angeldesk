import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  ThesisExtractorOutput,
  ThesisReconcilerOutput,
} from "@/agents/thesis/types";

// ---------------------------------------------------------------------------
// In-memory mock store
// ---------------------------------------------------------------------------
interface MockThesis {
  id: string;
  dealId: string;
  version: number;
  isLatest: boolean;
  verdict: string;
  confidence: number;
  reformulated: string;
  problem: string;
  solution: string;
  whyNow: string;
  moat: string | null;
  pathToExit: string | null;
  loadBearing: unknown;
  ycLens: unknown;
  thielLens: unknown;
  angelDeskLens: unknown;
  alerts: unknown;
  reconciledAt: Date | null;
  reconciliationJson: unknown;
  decision: string | null;
  decisionAt: Date | null;
  rebuttalText: string | null;
  rebuttalVerdict: string | null;
  rebuttalCount: number;
  sourceDocumentIds: string[];
  sourceHash: string;
  createdAt: Date;
  updatedAt: Date;
}

let store: MockThesis[] = [];
let idCounter = 0;

function resetStore() {
  store = [];
  idCounter = 0;
}

function cuid() {
  idCounter++;
  return `thesis_${idCounter}`;
}

const mockPrisma = {
  thesis: {
    findFirst: vi.fn(async ({ where, orderBy }: { where: Record<string, unknown>; orderBy?: Record<string, unknown>; select?: Record<string, unknown> }) => {
      let matches = store.filter((t) => {
        if (where.dealId && t.dealId !== where.dealId) return false;
        if (where.isLatest !== undefined && t.isLatest !== where.isLatest) return false;
        return true;
      });
      if (orderBy) {
        const [key, dir] = Object.entries(orderBy)[0] ?? [];
        if (key === "version") matches = matches.sort((a, b) => dir === "desc" ? b.version - a.version : a.version - b.version);
      }
      return matches[0] ?? null;
    }),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      return store.find((t) => t.id === where.id) ?? null;
    }),
    findMany: vi.fn(async ({ where, orderBy, take, skip }: { where: Record<string, unknown>; orderBy?: Record<string, unknown>; take?: number; skip?: number; include?: Record<string, unknown> }) => {
      let matches = store.filter((t) => {
        if (where.isLatest !== undefined && t.isLatest !== where.isLatest) return false;
        if (where.dealId && t.dealId !== where.dealId) return false;
        return true;
      });
      if (orderBy) {
        const [key, dir] = Object.entries(orderBy)[0] ?? [];
        if (key === "version") matches = matches.sort((a, b) => dir === "desc" ? b.version - a.version : a.version - b.version);
        if (key === "createdAt") matches = matches.sort((a, b) => dir === "desc" ? b.createdAt.getTime() - a.createdAt.getTime() : a.createdAt.getTime() - b.createdAt.getTime());
      }
      if (skip) matches = matches.slice(skip);
      if (take) matches = matches.slice(0, take);
      return matches.map((t) => ({ ...t, deal: { name: "MockDeal", sector: "SAAS", stage: "SEED" } }));
    }),
    count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return store.filter((t) => {
        if (where.isLatest !== undefined && t.isLatest !== where.isLatest) return false;
        if (where.dealId && t.dealId !== where.dealId) return false;
        return true;
      }).length;
    }),
    aggregate: vi.fn(async ({ where }: { where: Record<string, unknown>; _sum: Record<string, boolean> }) => {
      const rebuttalCount = store
        .filter((t) => {
          if (where.dealId && t.dealId !== where.dealId) return false;
          return true;
        })
        .reduce((sum, thesis) => sum + (thesis.rebuttalCount ?? 0), 0);

      return {
        _sum: {
          rebuttalCount,
        },
      };
    }),
    create: vi.fn(async ({ data }: { data: Partial<MockThesis> }) => {
      const created: MockThesis = {
        id: cuid(),
        dealId: data.dealId as string,
        version: (data.version as number) ?? 1,
        isLatest: (data.isLatest as boolean) ?? true,
        verdict: (data.verdict as string) ?? "contrasted",
        confidence: (data.confidence as number) ?? 50,
        reformulated: (data.reformulated as string) ?? "",
        problem: (data.problem as string) ?? "",
        solution: (data.solution as string) ?? "",
        whyNow: (data.whyNow as string) ?? "",
        moat: (data.moat as string | null) ?? null,
        pathToExit: (data.pathToExit as string | null) ?? null,
        loadBearing: data.loadBearing ?? [],
        ycLens: data.ycLens ?? {},
        thielLens: data.thielLens ?? {},
        angelDeskLens: data.angelDeskLens ?? {},
        alerts: data.alerts ?? [],
        reconciledAt: null,
        reconciliationJson: null,
        decision: null,
        decisionAt: null,
        rebuttalText: null,
        rebuttalVerdict: null,
        rebuttalCount: 0,
        sourceDocumentIds: (data.sourceDocumentIds as string[]) ?? [],
        sourceHash: (data.sourceHash as string) ?? "hash",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.push(created);
      return created;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const record = store.find((t) => t.id === where.id);
      if (!record) throw new Error(`Thesis ${where.id} not found`);
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === "object" && value !== null && "increment" in value) {
          const inc = (value as { increment: number }).increment;
          (record as unknown as Record<string, unknown>)[key] = ((record as unknown as Record<string, number>)[key] ?? 0) + inc;
        } else if (typeof value === "object" && value !== null && "decrement" in value) {
          const dec = (value as { decrement: number }).decrement;
          (record as unknown as Record<string, unknown>)[key] = ((record as unknown as Record<string, number>)[key] ?? 0) - dec;
        } else {
          (record as unknown as Record<string, unknown>)[key] = value;
        }
      }
      record.updatedAt = new Date();
      return record;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      let count = 0;
      for (const record of store) {
        if (where.dealId && record.dealId !== where.dealId) continue;
        if (where.isLatest !== undefined && record.isLatest !== where.isLatest) continue;
        for (const [k, v] of Object.entries(data)) {
          (record as unknown as Record<string, unknown>)[k] = v;
        }
        count++;
      }
      return { count };
    }),
  },
  $executeRawUnsafe: vi.fn(async () => 0),
  $queryRaw: vi.fn(async () => []),
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    thesis: {
      findFirst: (args: unknown) => mockPrisma.thesis.findFirst(args as never),
      findUnique: (args: unknown) => mockPrisma.thesis.findUnique(args as never),
      findMany: (args: unknown) => mockPrisma.thesis.findMany(args as never),
      count: (args: unknown) => mockPrisma.thesis.count(args as never),
      aggregate: (args: unknown) => mockPrisma.thesis.aggregate(args as never),
      create: (args: unknown) => mockPrisma.thesis.create(args as never),
      update: (args: unknown) => mockPrisma.thesis.update(args as never),
      updateMany: (args: unknown) => mockPrisma.thesis.updateMany(args as never),
    },
    // $transaction accepts (fn, options?) — ignore options in mock. Tx exposes
    // $executeRawUnsafe since thesisService.create uses it for the advisory lock.
    $transaction: async (fn: (tx: unknown) => Promise<unknown>, _options?: { isolationLevel?: string }) => {
      void _options;
      return fn(mockPrisma);
    },
    $executeRawUnsafe: (..._args: unknown[]) => mockPrisma.$executeRawUnsafe(),
    $queryRaw: (..._args: unknown[]) => mockPrisma.$queryRaw(),
  },
}));

const { thesisService } = await import("../index");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function makeExtractorOutput(overrides: Partial<ThesisExtractorOutput> = {}): ThesisExtractorOutput {
  return {
    reformulated: "Test thesis reformulated",
    problem: "Test problem",
    solution: "Test solution",
    whyNow: "Test why-now",
    moat: "Test moat",
    pathToExit: "Test path",
    verdict: "contrasted",
    confidence: 55,
    loadBearing: [],
    alerts: [],
    ycLens: {
      framework: "yc",
      verdict: "contrasted",
      confidence: 60,
      question: "Q?",
      claims: [],
      failures: [],
      strengths: [],
      summary: "",
    },
    thielLens: {
      framework: "thiel",
      verdict: "vigilance",
      confidence: 50,
      question: "Q?",
      claims: [],
      failures: [],
      strengths: [],
      summary: "",
    },
    angelDeskLens: {
      framework: "angel-desk",
      verdict: "contrasted",
      confidence: 55,
      question: "Q?",
      claims: [],
      failures: [],
      strengths: [],
      summary: "",
    },
    sourceDocumentIds: ["doc1"],
    sourceHash: "hash1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("thesisService.create", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it("cree une these v1 si aucune n'existe", async () => {
    const result = await thesisService.create({
      dealId: "deal_1",
      extractorOutput: makeExtractorOutput(),
    });
    expect(result.version).toBe(1);
    expect(result.isLatest).toBe(true);
    expect(result.dealId).toBe("deal_1");
  });

  it("incremente la version et marque la precedente isLatest=false", async () => {
    await thesisService.create({ dealId: "deal_1", extractorOutput: makeExtractorOutput() });
    const v2 = await thesisService.create({ dealId: "deal_1", extractorOutput: makeExtractorOutput() });
    expect(v2.version).toBe(2);
    expect(v2.isLatest).toBe(true);
    expect(store.find((t) => t.version === 1)?.isLatest).toBe(false);
  });

  it("isole par dealId", async () => {
    await thesisService.create({ dealId: "deal_A", extractorOutput: makeExtractorOutput() });
    const b1 = await thesisService.create({ dealId: "deal_B", extractorOutput: makeExtractorOutput() });
    expect(b1.version).toBe(1);
  });
});

describe("thesisService.getLatest", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it("retourne null si aucune these", async () => {
    const result = await thesisService.getLatest("deal_x");
    expect(result).toBeNull();
  });

  it("retourne la latest", async () => {
    await thesisService.create({ dealId: "deal_1", extractorOutput: makeExtractorOutput() });
    await thesisService.create({ dealId: "deal_1", extractorOutput: makeExtractorOutput({ verdict: "alert_dominant" }) });
    const latest = await thesisService.getLatest("deal_1");
    expect(latest?.version).toBe(2);
    expect(latest?.verdict).toBe("alert_dominant");
  });
});

describe("thesisService.applyReconciliation", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it("met a jour verdict + confidence + reconciledAt", async () => {
    const thesis = await thesisService.create({ dealId: "deal_1", extractorOutput: makeExtractorOutput() });
    const reconcilerOutput: ThesisReconcilerOutput = {
      updatedVerdict: "vigilance",
      updatedConfidence: 40,
      verdictChanged: true,
      newRedFlags: [],
      reconciliationNotes: [],
      hiddenStrengths: [],
    };
    const updated = await thesisService.applyReconciliation({
      thesisId: thesis.id,
      reconcilerOutput,
    });
    expect(updated.verdict).toBe("vigilance");
    expect(updated.confidence).toBe(40);
    expect(updated.reconciledAt).toBeInstanceOf(Date);
  });
});

describe("thesisService.recordDecision", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it("stop: enregistre decision sans rebuttal", async () => {
    const thesis = await thesisService.create({ dealId: "deal_1", extractorOutput: makeExtractorOutput() });
    const updated = await thesisService.recordDecision({
      thesisId: thesis.id,
      decision: "stop",
    });
    expect(updated).not.toBeNull();
    expect(updated!.decision).toBe("stop");
    expect(updated!.rebuttalCount).toBe(0);
  });
});

describe("thesisService.beginRebuttalAttempt", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it("accepte la premiere contestation et incremente le compteur visible", async () => {
    const thesis = await thesisService.create({ dealId: "deal_1", extractorOutput: makeExtractorOutput() });
    const result = await thesisService.beginRebuttalAttempt({
      dealId: "deal_1",
      thesisId: thesis.id,
      rebuttalText: "  Je conteste avec des faits  ",
    });

    expect(result).not.toBeNull();
    expect(result?.status).toBe("accepted");
    expect(result?.thesis.rebuttalCount).toBe(1);
    expect(result?.thesis.rebuttalText).toBe("Je conteste avec des faits");
    expect(result?.thesis.decision).toBe("contest");
  });

  it("retourne duplicate pour le meme rebuttal deja finalise sans re-incrementer", async () => {
    const thesis = await thesisService.create({ dealId: "deal_1", extractorOutput: makeExtractorOutput() });
    const first = await thesisService.beginRebuttalAttempt({
      dealId: "deal_1",
      thesisId: thesis.id,
      rebuttalText: "Je conteste avec des faits",
    });
    expect(first?.status).toBe("accepted");

    const finalized = await thesisService.finalizeRebuttalAttempt({
      thesisId: thesis.id,
      rebuttalText: "Je conteste avec des faits",
      verdict: "rejected",
    });
    expect(finalized.status).toBe("finalized");

    const duplicate = await thesisService.beginRebuttalAttempt({
      dealId: "deal_1",
      thesisId: thesis.id,
      rebuttalText: "  Je conteste avec des faits  ",
    });

    const latest = await thesisService.getLatest("deal_1");

    expect(duplicate?.status).toBe("duplicate");
    expect(latest?.rebuttalCount).toBe(1);
    expect(latest?.rebuttalVerdict).toBe("rejected");
    expect(latest?.decision).toBe("contest");
  });

  it("hasReachedRebuttalCap: true a 3 rebuttals", async () => {
    for (let i = 0; i < 3; i++) {
      const thesis = await thesisService.create({
        dealId: "deal_1",
        extractorOutput: makeExtractorOutput({ sourceHash: `hash-${i}` }),
      });
      const result = await thesisService.beginRebuttalAttempt({
        dealId: "deal_1",
        thesisId: thesis.id,
        rebuttalText: `rebuttal-${i}`,
      });
      expect(result?.status).toBe("accepted");
      const finalized = await thesisService.finalizeRebuttalAttempt({
        thesisId: thesis.id,
        rebuttalText: `rebuttal-${i}`,
        verdict: "rejected",
      });
      expect(finalized.status).toBe("finalized");
    }

    const latest = await thesisService.create({
      dealId: "deal_1",
      extractorOutput: makeExtractorOutput({ sourceHash: "hash-4" }),
    });

    const blocked = await thesisService.beginRebuttalAttempt({
      dealId: "deal_1",
      thesisId: latest.id,
      rebuttalText: "rebuttal-4",
    });

    expect(blocked?.status).toBe("cap_reached");
    for (let i = 0; i < 3; i++) {
      expect(store[i]?.rebuttalCount).toBe(1);
    }
    expect(await thesisService.hasReachedRebuttalCap("deal_1")).toBe(true);
  });

  it("revertit une tentative finalisee pour permettre un retry propre du rebuttal", async () => {
    const thesis = await thesisService.create({ dealId: "deal_1", extractorOutput: makeExtractorOutput() });

    const first = await thesisService.beginRebuttalAttempt({
      dealId: "deal_1",
      thesisId: thesis.id,
      rebuttalText: "Je conteste avec des faits",
    });
    expect(first?.status).toBe("accepted");

    const finalized = await thesisService.finalizeRebuttalAttempt({
      thesisId: thesis.id,
      rebuttalText: "Je conteste avec des faits",
      verdict: "valid",
    });
    expect(finalized.status).toBe("finalized");

    const reverted = await thesisService.revertRebuttalAttempt({
      thesisId: thesis.id,
      rebuttalText: "Je conteste avec des faits",
      expectedVerdict: "valid",
    });

    expect(reverted).not.toBeNull();
    expect(reverted?.decision).toBeNull();
    expect(reverted?.rebuttalText).toBeNull();
    expect(reverted?.rebuttalVerdict).toBeNull();
    expect(reverted?.rebuttalCount).toBe(0);
  });
});

describe("thesisService.isStale", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it("false si aucune these", async () => {
    expect(await thesisService.isStale({ dealId: "deal_none", currentSourceHash: "h" })).toBe(false);
  });

  it("false si hash match", async () => {
    await thesisService.create({
      dealId: "deal_1",
      extractorOutput: makeExtractorOutput({ sourceHash: "match" }),
    });
    expect(await thesisService.isStale({ dealId: "deal_1", currentSourceHash: "match" })).toBe(false);
  });

  it("true si hash different", async () => {
    await thesisService.create({
      dealId: "deal_1",
      extractorOutput: makeExtractorOutput({ sourceHash: "old" }),
    });
    expect(await thesisService.isStale({ dealId: "deal_1", currentSourceHash: "new" })).toBe(true);
  });
});

describe("thesisService.hasThesis", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it("false pour deal sans these (backfill candidate)", async () => {
    expect(await thesisService.hasThesis("deal_empty")).toBe(false);
  });

  it("true des qu'une these existe (meme non-latest)", async () => {
    await thesisService.create({ dealId: "deal_1", extractorOutput: makeExtractorOutput() });
    expect(await thesisService.hasThesis("deal_1")).toBe(true);
  });
});
