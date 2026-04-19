import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentFacts: vi.fn(),
  redFlagFindMany: vi.fn(),
  dealChatContextFindUnique: vi.fn(),
  dealFindUnique: vi.fn(),
  analysisFindUnique: vi.fn(),
  analysisFindFirst: vi.fn(),
  scoredFindingFindMany: vi.fn(),
  debateRecordFindMany: vi.fn(),
  founderFindMany: vi.fn(),
  documentFindMany: vi.fn(),
  chatConversationFindFirst: vi.fn(),
  chatMessageFindMany: vi.fn(),
  aiBoardSessionFindFirst: vi.fn(),
}));

vi.mock("@/services/fact-store/current-facts", () => ({
  getCurrentFacts: mocks.getCurrentFacts,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    redFlag: {
      findMany: mocks.redFlagFindMany,
    },
    dealChatContext: {
      findUnique: mocks.dealChatContextFindUnique,
    },
    deal: {
      findUnique: mocks.dealFindUnique,
    },
    analysis: {
      findUnique: mocks.analysisFindUnique,
      findFirst: mocks.analysisFindFirst,
    },
    scoredFinding: {
      findMany: mocks.scoredFindingFindMany,
    },
    debateRecord: {
      findMany: mocks.debateRecordFindMany,
    },
    founder: {
      findMany: mocks.founderFindMany,
    },
    document: {
      findMany: mocks.documentFindMany,
    },
    chatConversation: {
      findFirst: mocks.chatConversationFindFirst,
    },
    chatMessage: {
      findMany: mocks.chatMessageFindMany,
    },
    aIBoardSession: {
      findFirst: mocks.aiBoardSessionFindFirst,
    },
    sectorBenchmark: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    benchmark: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

const { retrieveContext } = await import("../context-retriever");

describe("context-retriever thesis-first analysis binding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentFacts.mockResolvedValue([]);
    mocks.redFlagFindMany.mockResolvedValue([]);
    mocks.dealFindUnique.mockResolvedValue({
      sector: "SaaS",
      stage: "Seed",
      arr: null,
      growthRate: null,
      valuationPre: null,
      amountRequested: null,
      globalScore: 90,
      teamScore: 88,
      marketScore: 84,
      productScore: 82,
      financialsScore: 80,
    });
    mocks.founderFindMany.mockResolvedValue([]);
    mocks.documentFindMany.mockResolvedValue([]);
    mocks.chatConversationFindFirst.mockResolvedValue(null);
    mocks.chatMessageFindMany.mockResolvedValue([]);
    mocks.aiBoardSessionFindFirst.mockResolvedValue(null);
    mocks.scoredFindingFindMany.mockResolvedValue([
      {
        agentName: "financial-auditor",
        metric: "burn_multiple",
        category: "financial",
        value: "2.1",
        unit: "x",
        normalizedValue: 2.1,
        percentile: 55,
        assessment: "acceptable",
        benchmarkData: null,
        confidenceLevel: "medium",
        confidenceScore: 70,
        evidence: null,
      },
    ]);
    mocks.debateRecordFindMany.mockResolvedValue([]);
  });

  it("supports THESIS intent, stays on the requested completed analysis, and suppresses scores when asked", async () => {
    mocks.dealChatContextFindUnique.mockResolvedValue({
      lastAnalysisId: "analysis_linked",
      keyFacts: [],
      agentSummaries: {
        "financial-auditor": {
          summary: "Linked agent summary",
          keyFindings: ["Finding A"],
          confidence: 80,
          score: 44,
        },
      },
      redFlagsContext: [],
      benchmarkData: null,
      comparableDeals: null,
    });
    mocks.analysisFindUnique.mockResolvedValue({
      id: "analysis_linked",
      dealId: "deal_1",
      status: "COMPLETED",
      mode: "full_analysis",
      results: {
        "financial-auditor": {
          success: true,
          data: {
            summary: "Linked full result",
            keyFindings: ["Finding A"],
            score: 44,
            confidence: 80,
          },
        },
      },
      summary: "Linked analysis summary",
      negotiationStrategy: { anchor: "low" },
    });

    const context = await retrieveContext(
      "deal_1",
      "What breaks the thesis?",
      "THESIS",
      {
        analysisId: "analysis_linked",
        includeScores: false,
      }
    );

    expect(mocks.analysisFindUnique).toHaveBeenCalled();
    expect(mocks.analysisFindFirst).not.toHaveBeenCalled();
    expect(context.agentResults[0]?.score).toBeUndefined();
    expect(context.scoredFindings).toBeUndefined();
    expect(context.analysisSummary).toBe("Linked analysis summary");
  });

  it("ignores an explicitly linked analysis that is not completed", async () => {
    mocks.dealChatContextFindUnique.mockResolvedValue({
      lastAnalysisId: "analysis_processing",
      keyFacts: [],
      agentSummaries: {},
      redFlagsContext: [],
      benchmarkData: null,
      comparableDeals: null,
    });
    mocks.analysisFindUnique.mockResolvedValue({
      id: "analysis_processing",
      dealId: "deal_1",
      status: "PROCESSING",
      mode: "full_analysis",
      results: {
        "financial-auditor": {
          success: true,
          data: {
            summary: "Should not leak",
          },
        },
      },
      summary: "Should not leak",
      negotiationStrategy: { anchor: "high" },
    });

    const context = await retrieveContext(
      "deal_1",
      "Explain the thesis",
      "THESIS",
      { analysisId: "analysis_processing" }
    );

    expect(context.agentResults).toEqual([]);
    expect(context.analysisSummary).toBeUndefined();
    expect(context.negotiationStrategy).toBeUndefined();
  });
});
