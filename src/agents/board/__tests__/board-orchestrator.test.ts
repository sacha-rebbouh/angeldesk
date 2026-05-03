import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dealFindUnique: vi.fn(),
  documentFindMany: vi.fn(),
  getCurrentFacts: vi.fn(),
  getDisputedFacts: vi.fn(),
  loadResults: vi.fn(),
  getCorpusSnapshotDocumentIds: vi.fn(),
  enrichDeal: vi.fn(),
  thesisGetLatest: vi.fn(),
  thesisGetById: vi.fn(),
  formatFactStoreForAgents: vi.fn(() => ""),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: {
      findUnique: mocks.dealFindUnique,
    },
    document: {
      findMany: mocks.documentFindMany,
    },
  },
}));

vi.mock("@/lib/encryption", () => ({
  safeDecrypt: (value: string) => value,
}));

vi.mock("@/services/context-engine", () => ({
  enrichDeal: mocks.enrichDeal,
}));

vi.mock("@/services/fact-store", () => ({
  getCurrentFacts: mocks.getCurrentFacts,
  getDisputedFacts: mocks.getDisputedFacts,
  formatFactStoreForAgents: mocks.formatFactStoreForAgents,
}));

vi.mock("@/services/analysis-results/load-results", () => ({
  loadResults: mocks.loadResults,
}));

vi.mock("@/services/corpus", () => ({
  getCorpusSnapshotDocumentIds: mocks.getCorpusSnapshotDocumentIds,
}));

vi.mock("@/services/openrouter/router", () => ({
  completeJSON: vi.fn(),
  runWithLLMContext: vi.fn((_ctx, fn) => fn()),
}));

vi.mock("@/services/thesis/normalization", () => ({
  normalizeThesisEvaluation: vi.fn(() => []),
}));

vi.mock("@/services/thesis", () => ({
  thesisService: {
    getLatest: mocks.thesisGetLatest,
    getById: mocks.thesisGetById,
  },
}));

const { BoardOrchestrator } = await import("../board-orchestrator");

function makeLatestThesis(overrides: Record<string, unknown> = {}) {
  return {
    id: "thesis_latest",
    dealId: "deal_1",
    corpusSnapshotId: "snap_latest",
    reformulated: "Canonical thesis",
    problem: "Problem",
    solution: "Solution",
    whyNow: "Why now",
    moat: null,
    pathToExit: null,
    verdict: "contrasted",
    confidence: 62,
    loadBearing: [],
    alerts: [],
    ycLens: { verdict: "contrasted", strengths: [], failures: [], claims: [] },
    thielLens: { verdict: "contrasted", strengths: [], failures: [], claims: [] },
    angelDeskLens: { verdict: "contrasted", strengths: [], failures: [], claims: [] },
    ...overrides,
  };
}

function makeDeal(overrides: Record<string, unknown> = {}) {
  return {
    id: "deal_1",
    name: "Deal One",
    companyName: "Canonical Co",
    sector: "SAAS",
    stage: "SEED",
    geography: "France",
    website: "https://canonical.example",
    founders: [],
    redFlags: [],
    analyses: [],
    ...overrides,
  };
}

describe("BoardOrchestrator canonical pairing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentFacts.mockResolvedValue([]);
    mocks.getDisputedFacts.mockResolvedValue([]);
    mocks.loadResults.mockResolvedValue({});
    mocks.getCorpusSnapshotDocumentIds.mockResolvedValue(["doc_1"]);
    mocks.documentFindMany.mockResolvedValue([
      {
        id: "doc_1",
        name: "Deck",
        type: "PITCH_DECK",
        extractedText: "plain text",
      },
    ]);
    mocks.enrichDeal.mockResolvedValue(null);
    mocks.thesisGetById.mockResolvedValue(null);
  });

  it("uses the analysis aligned to the latest thesis, not the newest completed one", async () => {
    mocks.dealFindUnique.mockResolvedValue(
      makeDeal({
        analyses: [
          {
            id: "analysis_newest_unrelated",
            dealId: "deal_1",
            thesisId: "thesis_old",
            corpusSnapshotId: "snap_old",
            completedAt: new Date("2026-04-20T12:00:00.000Z"),
            createdAt: new Date("2026-04-20T11:00:00.000Z"),
          },
          {
            id: "analysis_canonical",
            dealId: "deal_1",
            thesisId: "thesis_latest",
            corpusSnapshotId: "snap_latest",
            completedAt: new Date("2026-04-19T12:00:00.000Z"),
            createdAt: new Date("2026-04-19T11:00:00.000Z"),
          },
        ],
      })
    );
    mocks.thesisGetLatest.mockResolvedValue(makeLatestThesis());

    const orchestrator = new BoardOrchestrator({ dealId: "deal_1", userId: "user_1" });
    const input = await (orchestrator as unknown as { prepareInputPackage: (dealId: string) => Promise<unknown> })
      .prepareInputPackage("deal_1") as { thesis: { id: string } | null };

    expect(mocks.loadResults).toHaveBeenCalledWith("analysis_canonical");
    expect(mocks.getCorpusSnapshotDocumentIds).toHaveBeenCalledWith("snap_latest");
    expect(input.thesis?.id).toBe("thesis_latest");
  });

  it("refuses to build a board input when the latest thesis has no aligned completed analysis", async () => {
    mocks.dealFindUnique.mockResolvedValue(
      makeDeal({
        analyses: [
          {
            id: "analysis_old",
            dealId: "deal_1",
            thesisId: "thesis_old",
            corpusSnapshotId: "snap_old",
            completedAt: new Date("2026-04-19T12:00:00.000Z"),
            createdAt: new Date("2026-04-19T11:00:00.000Z"),
          },
        ],
      })
    );
    mocks.thesisGetLatest.mockResolvedValue(makeLatestThesis());

    const orchestrator = new BoardOrchestrator({ dealId: "deal_1", userId: "user_1" });

    await expect(
      (orchestrator as unknown as { prepareInputPackage: (dealId: string) => Promise<unknown> })
        .prepareInputPackage("deal_1")
    ).rejects.toThrow("completed analysis aligned to the latest thesis");
  });
});
