import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateApiRequest: vi.fn(),
  dealFindFirst: vi.fn(),
  analysisFindFirst: vi.fn(),
  analysisFindMany: vi.fn(),
  dealUpdate: vi.fn(),
  apiSuccess: vi.fn(),
  apiError: vi.fn(),
  handleApiError: vi.fn(),
  createApiTimer: vi.fn(),
  evaluateDealDocumentReadiness: vi.fn(),
  recordDealAnalysis: vi.fn(),
  refundCredits: vi.fn(),
  getActionForAnalysisType: vi.fn(),
  inngestSend: vi.fn(),
}));

vi.mock("../../../../middleware", () => ({
  authenticateApiRequest: mocks.authenticateApiRequest,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: {
      findFirst: mocks.dealFindFirst,
      update: mocks.dealUpdate,
    },
    analysis: {
      findFirst: mocks.analysisFindFirst,
      findMany: mocks.analysisFindMany,
    },
  },
}));

vi.mock("@/lib/api-key-auth", () => ({
  apiSuccess: mocks.apiSuccess,
  apiError: mocks.apiError,
}));

vi.mock("@/lib/api-error", () => ({
  handleApiError: mocks.handleApiError,
}));

vi.mock("@/lib/api-logger", () => ({
  createApiTimer: mocks.createApiTimer,
}));

vi.mock("@/services/documents/extraction-runs", () => ({
  evaluateDealDocumentReadiness: mocks.evaluateDealDocumentReadiness,
}));

vi.mock("@/services/deal-limits", () => ({
  recordDealAnalysis: mocks.recordDealAnalysis,
}));

vi.mock("@/services/credits", () => ({
  refundCredits: mocks.refundCredits,
  getActionForAnalysisType: mocks.getActionForAnalysisType,
}));

vi.mock("@/lib/inngest", () => ({
  inngest: {
    send: mocks.inngestSend,
  },
}));

const timer = {
  setContext: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
};

const successResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data, meta: {} }), {
    status,
    headers: { "content-type": "application/json" },
  });

const errorResponse = (code: string, message: string, status: number) =>
  new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "content-type": "application/json" },
  });

const { POST } = await import("../route");

describe("POST /api/v1/deals/[dealId]/analyses", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.authenticateApiRequest.mockResolvedValue({ userId: "user_1", keyId: "key_1" });
    mocks.dealFindFirst.mockResolvedValue({ id: "deal_1", status: "IN_DD" });
    mocks.analysisFindFirst.mockResolvedValue(null);
    mocks.evaluateDealDocumentReadiness.mockResolvedValue({ ready: true });
    mocks.recordDealAnalysis.mockResolvedValue({ success: true });
    mocks.getActionForAnalysisType.mockReturnValue("DEEP_DIVE");
    mocks.inngestSend.mockResolvedValue(undefined);
    mocks.apiSuccess.mockImplementation(successResponse);
    mocks.apiError.mockImplementation(errorResponse);
    mocks.handleApiError.mockImplementation((error: unknown) =>
      errorResponse("INTERNAL_ERROR", error instanceof Error ? error.message : "unknown", 500)
    );
    mocks.createApiTimer.mockReturnValue(timer);
  });

  it("rejects legacy public analysis types instead of mapping them silently", async () => {
    const response = await POST(
      new Request("http://localhost/api/v1/deals/deal_1/analyses", {
        method: "POST",
        body: JSON.stringify({ type: "full_dd" }),
        headers: { "content-type": "application/json" },
      }) as never,
      { params: Promise.resolve({ dealId: "deal_1" }) }
    );

    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("LEGACY_ANALYSIS_TYPE");
    expect(mocks.recordDealAnalysis).not.toHaveBeenCalled();
    expect(mocks.inngestSend).not.toHaveBeenCalled();
  });

  it("queues a thesis-first full_analysis through the canonical Inngest event", async () => {
    const response = await POST(
      new Request("http://localhost/api/v1/deals/deal_1/analyses", {
        method: "POST",
        body: JSON.stringify({ type: "full_analysis" }),
        headers: { "content-type": "application/json" },
      }) as never,
      { params: Promise.resolve({ dealId: "deal_1" }) }
    );

    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(mocks.recordDealAnalysis).toHaveBeenCalledWith("user_1", 3, "deal_1", "full_analysis");
    expect(mocks.inngestSend).toHaveBeenCalledWith({
      name: "analysis/deal.analyze",
      data: {
        dealId: "deal_1",
        type: "full_analysis",
        enableTrace: true,
        userPlan: "PRO",
        userId: "user_1",
      },
    });
    expect(payload.data).toEqual({
      status: "QUEUED",
      dealId: "deal_1",
      type: "full_analysis",
    });
  });
});
