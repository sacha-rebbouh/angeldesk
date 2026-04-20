import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  randomUUID: vi.fn(),
  requireAuth: vi.fn(),
  checkRateLimit: vi.fn(),
  liveSessionFindFirst: vi.fn(),
  liveSessionUpdateMany: vi.fn(),
  sessionSummaryFindUnique: vi.fn(),
  transaction: vi.fn(),
  txExecuteRawUnsafe: vi.fn(),
  txLiveSessionFindFirst: vi.fn(),
  txLiveSessionUpdate: vi.fn(),
  deductCredits: vi.fn(),
  refundCredits: vi.fn(),
  triggerTargetedReanalysis: vi.fn(),
  identifyImpactedAgents: vi.fn(),
  generateDeltaReport: vi.fn(),
}));

vi.mock("crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("crypto")>();
  return {
    ...actual,
    randomUUID: mocks.randomUUID,
  };
});

vi.mock("@/lib/auth", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    liveSession: {
      findFirst: mocks.liveSessionFindFirst,
      updateMany: mocks.liveSessionUpdateMany,
    },
    sessionSummary: {
      findUnique: mocks.sessionSummaryFindUnique,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/sanitize", () => ({
  isValidCuid: vi.fn(() => true),
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock("@/services/credits", () => ({
  deductCredits: mocks.deductCredits,
  refundCredits: mocks.refundCredits,
}));

vi.mock("@/lib/live/post-call-reanalyzer", () => ({
  triggerTargetedReanalysis: mocks.triggerTargetedReanalysis,
  generateDeltaReport: mocks.generateDeltaReport,
  identifyImpactedAgents: mocks.identifyImpactedAgents,
}));

vi.mock("@/lib/api-error", () => ({
  handleApiError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

const { POST } = await import("../route");

describe("POST /api/coaching/reanalyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.randomUUID.mockReturnValue("request_uuid");
    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.checkRateLimit.mockReturnValue({ allowed: true });
    mocks.liveSessionFindFirst.mockResolvedValue({
      id: "session_1",
      userId: "user_1",
      dealId: "deal_1",
      status: "completed",
    });
    mocks.liveSessionUpdateMany.mockResolvedValue({ count: 1 });
    mocks.sessionSummaryFindUnique.mockResolvedValue({
      sessionId: "session_1",
      executiveSummary: "summary",
      keyPoints: [],
      actionItems: [],
      newInformation: [],
      contradictions: [],
      questionsAsked: [],
      remainingQuestions: [],
      confidenceDelta: {},
      sessionStats: {},
    });
    mocks.txExecuteRawUnsafe.mockResolvedValue(undefined);
    mocks.txLiveSessionFindFirst.mockResolvedValue({
      id: "session_1",
      reanalysisRequestId: null,
      reanalysisRequestedAt: null,
    });
    mocks.txLiveSessionUpdate.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      $executeRawUnsafe: mocks.txExecuteRawUnsafe,
      liveSession: {
        findFirst: mocks.txLiveSessionFindFirst,
        update: mocks.txLiveSessionUpdate,
      },
    }));
    mocks.deductCredits.mockResolvedValue({ success: true, balanceAfter: 7 });
    mocks.refundCredits.mockResolvedValue(undefined);
    mocks.triggerTargetedReanalysis.mockResolvedValue({
      analysisId: "analysis_1",
      baselineAnalysisId: "analysis_base",
      documentIds: ["doc_1"],
    });
    mocks.generateDeltaReport.mockResolvedValue({ delta: true });
    mocks.identifyImpactedAgents.mockReturnValue(["financial-auditor"]);
  });

  it("reserves the session and charges with a request-scoped idempotency key", async () => {
    const request = new Request("http://localhost/api/coaching/reanalyze", {
      method: "POST",
      body: JSON.stringify({ sessionId: "session_1", mode: "full" }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      analysisId: "analysis_1",
      agents: expect.arrayContaining(["financial-auditor"]),
    });
    expect(mocks.deductCredits).toHaveBeenCalledWith(
      "user_1",
      "RE_ANALYSIS",
      "deal_1",
      expect.objectContaining({
        idempotencyKey: "reanalysis:request_uuid",
      })
    );
    expect(mocks.liveSessionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "session_1",
        reanalysisRequestId: "request_uuid",
      },
      data: {
        reanalysisRequestId: null,
        reanalysisMode: null,
        reanalysisRequestedAt: null,
      },
    }));
  });

  it("returns 409 when another reanalysis reservation is already active", async () => {
    mocks.txLiveSessionFindFirst.mockResolvedValue({
      id: "session_1",
      reanalysisRequestId: "existing_request",
      reanalysisRequestedAt: new Date(),
    });

    const request = new Request("http://localhost/api/coaching/reanalyze", {
      method: "POST",
      body: JSON.stringify({ sessionId: "session_1", mode: "full" }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(String(payload.error)).toContain("re-analyse est deja en cours");
    expect(mocks.deductCredits).not.toHaveBeenCalled();
    expect(mocks.triggerTargetedReanalysis).not.toHaveBeenCalled();
  });

  it("refunds and clears the reservation when reanalysis startup fails", async () => {
    mocks.triggerTargetedReanalysis.mockRejectedValue(new Error("boom"));

    const request = new Request("http://localhost/api/coaching/reanalyze", {
      method: "POST",
      body: JSON.stringify({ sessionId: "session_1", mode: "full" }),
      headers: { "content-type": "application/json" },
    });

    await expect(POST(request as never)).rejects.toThrow("boom");

    expect(mocks.refundCredits).toHaveBeenCalledWith(
      "user_1",
      "RE_ANALYSIS",
      "deal_1",
      expect.objectContaining({
        idempotencyKey: "refund:RE_ANALYSIS:session:session_1:request_uuid",
      })
    );
    expect(mocks.liveSessionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "session_1",
        reanalysisRequestId: "request_uuid",
      },
      data: {
        reanalysisRequestId: null,
        reanalysisMode: null,
        reanalysisRequestedAt: null,
      },
    }));
  });
});
