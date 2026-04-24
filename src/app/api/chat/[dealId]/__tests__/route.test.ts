import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  checkRateLimitDistributed: vi.fn(),
  verifyDealOwnership: vi.fn(),
  verifyConversationOwnershipWithDeal: vi.fn(),
  createConversation: vi.fn(),
  addMessage: vi.fn(),
  getConversationHistoryForLLM: vi.fn(),
  generateConversationTitle: vi.fn(),
  getFullChatContext: vi.fn(),
  normalizeThesisEvaluation: vi.fn(),
  generateResponse: vi.fn(),
  thesisGetLatest: vi.fn(),
  chatConversationUpdate: vi.fn(),
  analysisFindMany: vi.fn(),
  loadResults: vi.fn(),
  getCorpusSnapshotDocumentIds: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/lib/sanitize", () => ({
  checkRateLimitDistributed: mocks.checkRateLimitDistributed,
  isValidCuid: vi.fn(() => true),
  CUID_PATTERN: /.*/,
}));

vi.mock("@/services/chat-context/conversation", () => ({
  createConversation: mocks.createConversation,
  getConversationsForDeal: vi.fn(),
  addMessage: mocks.addMessage,
  getConversation: vi.fn(),
  verifyDealOwnership: mocks.verifyDealOwnership,
  verifyConversationOwnershipWithDeal: mocks.verifyConversationOwnershipWithDeal,
  generateConversationTitle: mocks.generateConversationTitle,
  getConversationHistoryForLLM: mocks.getConversationHistoryForLLM,
}));

vi.mock("@/services/chat-context", () => ({
  getChatContext: vi.fn(),
  getFullChatContext: mocks.getFullChatContext,
}));

vi.mock("@/services/analysis-results/load-results", () => ({
  loadResults: mocks.loadResults,
}));

vi.mock("@/services/corpus", () => ({
  getCorpusSnapshotDocumentIds: mocks.getCorpusSnapshotDocumentIds,
}));

vi.mock("@/services/thesis/normalization", () => ({
  normalizeThesisEvaluation: mocks.normalizeThesisEvaluation,
}));

vi.mock("@/agents/chat", () => ({
  dealChatAgent: {
    generateResponse: mocks.generateResponse,
  },
}));

vi.mock("@/services/thesis", () => ({
  thesisService: {
    getLatest: mocks.thesisGetLatest,
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    chatConversation: {
      update: mocks.chatConversationUpdate,
    },
    analysis: {
      findMany: mocks.analysisFindMany,
    },
  },
}));

vi.mock("@/lib/api-error", () => ({
  handleApiError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

// ARC-LIGHT Phase 1 gate: neutralize for these flow tests. Dedicated gate
// coverage lives in __tests__/route-gate.test.ts.
vi.mock("@/services/documents/readiness-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/documents/readiness-gate")>();
  return {
    ...actual,
    assertDealCorpusReady: vi.fn().mockResolvedValue(undefined),
    assertAnalysisCorpusReady: vi.fn().mockResolvedValue(undefined),
  };
});

const { POST } = await import("../route");

const thesisRecord = {
  id: "thesis_1",
  version: 3,
  reformulated: "Strong thesis",
  problem: "Painful workflow",
  solution: "Automation",
  whyNow: "Regulatory shift",
  moat: "Distribution moat",
  pathToExit: "Strategic M&A",
  verdict: "fragile",
  confidence: 62,
  loadBearing: [],
  alerts: [],
  ycLens: { verdict: "fragile", confidence: 60, summary: "YC", failures: [], strengths: [] },
  thielLens: { verdict: "fragile", confidence: 58, summary: "Thiel", failures: [], strengths: [] },
  angelDeskLens: { verdict: "fragile", confidence: 55, summary: "AD", failures: [], strengths: [] },
  decision: null,
  rebuttalCount: 0,
};

const baseFullChatContext = {
  chatContext: {
    keyFacts: [],
    agentSummaries: {
      "financial-auditor": {
        summary: "Scored summary",
        keyFindings: ["Revenue quality"],
        confidence: 80,
        score: 41,
      },
    },
    redFlagsContext: [],
    lastAnalysisId: "analysis_stale",
  },
  deal: {
    id: "deal_1",
    name: "Deal 1",
    companyName: "Company 1",
    sector: "SaaS",
    stage: "Seed",
    geography: "FR",
    description: "Test deal",
    website: "https://example.com",
    arr: null,
    growthRate: null,
    amountRequested: null,
    valuationPre: null,
    globalScore: 88,
    teamScore: 82,
    marketScore: 84,
    productScore: 79,
    financialsScore: 77,
    founders: [],
  },
  documents: [],
  latestAnalysis: {
    id: "analysis_stale",
    mode: "full_analysis",
    summary: "Stale summary",
    completedAt: new Date("2026-04-10T10:00:00Z"),
    hasResults: true,
  },
  liveSessions: [],
};

describe("POST /api/chat/[dealId] thesis-first pairing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.checkRateLimitDistributed.mockResolvedValue({ allowed: true });
    mocks.verifyDealOwnership.mockResolvedValue(true);
    mocks.verifyConversationOwnershipWithDeal.mockResolvedValue(true);
    mocks.createConversation.mockResolvedValue({ id: "conv_1" });
    mocks.addMessage
      .mockResolvedValueOnce({ id: "msg_user_1" })
      .mockResolvedValueOnce({ id: "msg_assistant_1" });
    mocks.generateConversationTitle.mockReturnValue("Title");
    mocks.getConversationHistoryForLLM.mockResolvedValue([]);
    mocks.normalizeThesisEvaluation.mockReturnValue({
      thesisQuality: { verdict: "vigilance", summary: "Gate it" },
      investorProfileFit: { verdict: "good", summary: "" },
      dealAccessibility: { verdict: "good", summary: "" },
    });
    mocks.generateResponse.mockResolvedValue({
      response: "Answer",
      intent: "THESIS",
      intentConfidence: 0.9,
      sourcesUsed: [],
      suggestedFollowUps: [],
    });
    mocks.thesisGetLatest.mockResolvedValue(thesisRecord);
    mocks.getFullChatContext.mockResolvedValue(baseFullChatContext);
    mocks.analysisFindMany.mockResolvedValue([]);
    mocks.getCorpusSnapshotDocumentIds.mockResolvedValue(["doc_a", "doc_b"]);
    mocks.loadResults.mockResolvedValue({ ok: true });
  });

  it("ignores stale unrelated analysis context when the latest thesis has no completed linked analysis", async () => {
    mocks.analysisFindMany.mockResolvedValue([]);

    const request = new Request("http://localhost/api/chat/deal_1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Explain the thesis" }),
    });

    const response = await POST(request as never, {
      params: Promise.resolve({ dealId: "deal_1" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.getFullChatContext).toHaveBeenCalledWith("deal_1", { analysisId: null });

    const agentContext = mocks.generateResponse.mock.calls[0]?.[1];
    expect(agentContext.latestAnalysis).toBeNull();
    expect(agentContext.deal.globalScore).toBeNull();
    expect(agentContext.chatContext.agentSummaries["financial-auditor"].score).toBeUndefined();
  });

  it("pins chat to the completed analysis linked to the active thesis", async () => {
    mocks.analysisFindMany.mockResolvedValue([
      {
        thesisBypass: true,
        id: "analysis_linked",
        mode: "full_analysis",
        summary: "Linked summary",
        completedAt: new Date("2026-04-15T10:00:00Z"),
        createdAt: new Date("2026-04-15T09:00:00Z"),
        thesisId: "thesis_1",
        corpusSnapshotId: null,
      },
    ]);

    const request = new Request("http://localhost/api/chat/deal_1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "What breaks the thesis?" }),
    });

    await POST(request as never, {
      params: Promise.resolve({ dealId: "deal_1" }),
    });

    expect(mocks.getFullChatContext).toHaveBeenCalledWith("deal_1", { analysisId: "analysis_linked" });

    const agentContext = mocks.generateResponse.mock.calls[0]?.[1];
    expect(agentContext.latestAnalysis).toMatchObject({
      id: "analysis_linked",
      summary: "Linked summary",
    });
  });

  it("falls back to snapshot-aligned completed analysis when thesisId link is missing", async () => {
    mocks.thesisGetLatest.mockResolvedValue({
      ...thesisRecord,
      corpusSnapshotId: "snap_1",
    });
    mocks.analysisFindMany.mockResolvedValue([
      {
        thesisBypass: false,
        id: "analysis_old",
        mode: "full_analysis",
        summary: "Old unrelated summary",
        completedAt: new Date("2026-04-10T10:00:00Z"),
        createdAt: new Date("2026-04-10T09:00:00Z"),
        thesisId: "thesis_old",
        corpusSnapshotId: "snap_old",
      },
      {
        thesisBypass: true,
        id: "analysis_snapshot",
        mode: "full_analysis",
        summary: "Snapshot aligned summary",
        completedAt: new Date("2026-04-15T10:00:00Z"),
        createdAt: new Date("2026-04-15T09:00:00Z"),
        thesisId: null,
        corpusSnapshotId: "snap_1",
      },
    ]);

    const request = new Request("http://localhost/api/chat/deal_1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Give me the aligned context" }),
    });

    await POST(request as never, {
      params: Promise.resolve({ dealId: "deal_1" }),
    });

    expect(mocks.getFullChatContext).toHaveBeenCalledWith("deal_1", {
      analysisId: "analysis_snapshot",
      documentIds: ["doc_a", "doc_b"],
    });

    const agentContext = mocks.generateResponse.mock.calls.at(-1)?.[1];
    expect(agentContext.latestAnalysis).toMatchObject({
      id: "analysis_snapshot",
      summary: "Snapshot aligned summary",
    });
  });
});
