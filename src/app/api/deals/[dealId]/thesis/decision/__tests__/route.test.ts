import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  dealFindFirst: vi.fn(),
  analysisFindMany: vi.fn(),
  analysisUpdate: vi.fn(),
  analysisUpdateMany: vi.fn(),
  analysisFindFirst: vi.fn(),
  thesisUpdate: vi.fn(),
  isValidCuid: vi.fn(),
  checkRateLimitDistributed: vi.fn(),
  getLatest: vi.fn(),
  recordDecision: vi.fn(),
  refundCreditAmount: vi.fn(),
  inngestSend: vi.fn(),
  handleApiError: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: {
      findFirst: mocks.dealFindFirst,
    },
    analysis: {
      findMany: mocks.analysisFindMany,
      update: mocks.analysisUpdate,
      updateMany: mocks.analysisUpdateMany,
      findFirst: mocks.analysisFindFirst,
    },
    thesis: {
      update: mocks.thesisUpdate,
    },
  },
}));

vi.mock("@/lib/sanitize", () => ({
  isValidCuid: mocks.isValidCuid,
  checkRateLimitDistributed: mocks.checkRateLimitDistributed,
}));

vi.mock("@/lib/api-error", () => ({
  handleApiError: mocks.handleApiError,
}));

vi.mock("@/services/thesis", () => ({
  thesisService: {
    getLatest: mocks.getLatest,
    recordDecision: mocks.recordDecision,
  },
}));

vi.mock("@/services/credits", () => ({
  refundCreditAmount: mocks.refundCreditAmount,
}));

vi.mock("@/lib/inngest", () => ({
  inngest: {
    send: mocks.inngestSend,
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: mocks.loggerError,
    warn: mocks.loggerWarn,
  },
}));

const jsonError = (message: string, status = 500) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });

const { POST } = await import("../route");

describe("POST /api/deals/[dealId]/thesis/decision", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.isValidCuid.mockReturnValue(true);
    mocks.checkRateLimitDistributed.mockResolvedValue({ allowed: true, resetIn: 0 });
    mocks.dealFindFirst.mockResolvedValue({ id: "deal_1" });
    mocks.analysisFindMany.mockResolvedValue([{ id: "analysis_1" }]);
    mocks.analysisUpdate.mockResolvedValue(undefined);
    mocks.analysisUpdateMany.mockResolvedValue({ count: 1 });
    mocks.analysisFindFirst.mockResolvedValue(null);
    mocks.thesisUpdate.mockResolvedValue(undefined);
    mocks.getLatest.mockResolvedValue({
      id: "thesis_1",
      verdict: "vigilance",
      decision: null,
      decisionAt: null,
      rebuttalVerdict: null,
      rebuttalCount: 0,
      confidence: 55,
    });
    mocks.recordDecision.mockResolvedValue({
      id: "thesis_1",
      verdict: "vigilance",
      confidence: 55,
      decision: "continue",
      rebuttalCount: 0,
    });
    mocks.refundCreditAmount.mockResolvedValue({ success: true });
    mocks.inngestSend.mockResolvedValue(undefined);
    mocks.handleApiError.mockImplementation((error: unknown) =>
      jsonError(error instanceof Error ? error.message : "unexpected")
    );
  });

  it("rollback la decision si l'emission Inngest echoue", async () => {
    mocks.inngestSend.mockRejectedValue(new Error("queue down"));

    const response = await POST(
      new Request("http://localhost/api/deals/deal_1/thesis/decision", {
        method: "POST",
        body: JSON.stringify({ decision: "continue" }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ dealId: "deal_1" }) }
    );

    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.error).toContain("Failed to dispatch thesis decision");
    expect(mocks.thesisUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "thesis_1" },
      data: {
        decision: null,
        decisionAt: null,
      },
    }));
    expect(mocks.analysisUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "analysis_1" },
      data: {
        thesisDecision: null,
        thesisDecisionAt: null,
        thesisBypass: false,
      },
    }));
  });

  it("refuse les etats corrompus avec plusieurs analyses paused pour une meme these", async () => {
    mocks.analysisFindMany.mockResolvedValue([{ id: "analysis_2" }, { id: "analysis_1" }]);

    const response = await POST(
      new Request("http://localhost/api/deals/deal_1/thesis/decision", {
        method: "POST",
        body: JSON.stringify({ decision: "stop" }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ dealId: "deal_1" }) }
    );

    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("Multiple paused analyses found");
    expect(mocks.recordDecision).not.toHaveBeenCalled();
    expect(mocks.inngestSend).not.toHaveBeenCalled();
  });
});
