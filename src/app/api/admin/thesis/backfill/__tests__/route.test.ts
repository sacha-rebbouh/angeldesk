import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  dealFindUnique: vi.fn(),
  isValidCuid: vi.fn(),
  runningAnalysis: vi.fn(),
  deductCreditAmount: vi.fn(),
  inngestSend: vi.fn(),
  handleApiError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: {
      findUnique: mocks.dealFindUnique,
    },
  },
}));

vi.mock("@/lib/sanitize", () => ({
  isValidCuid: mocks.isValidCuid,
}));

vi.mock("@/services/analysis/guards", () => ({
  getRunningAnalysisForDeal: mocks.runningAnalysis,
  isFullAnalysisInProgress: (analysis: { status?: string; mode?: string } | null | undefined) =>
    Boolean(analysis && analysis.status === "RUNNING" && analysis.mode === "full_analysis"),
}));

vi.mock("@/services/credits", () => ({
  deductCreditAmount: mocks.deductCreditAmount,
  refundCreditAmount: vi.fn(),
}));

vi.mock("@/lib/inngest", () => ({
  inngest: {
    send: mocks.inngestSend,
  },
}));

vi.mock("@/lib/api-error", () => ({
  handleApiError: mocks.handleApiError,
}));

const { POST } = await import("../route");

describe("POST /api/admin/thesis/backfill", () => {
  const dealId = "c123456789012345678901234";

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ id: "admin_1" });
    mocks.isValidCuid.mockReturnValue(true);
    mocks.runningAnalysis.mockResolvedValue(null);
    mocks.dealFindUnique.mockResolvedValue({
      id: dealId,
      userId: "user_1",
      name: "Deal One",
      theses: [{ id: "thesis_1", verdict: "favorable" }],
      documents: [{ id: "doc_1", processingStatus: "COMPLETED" }],
    });
    mocks.deductCreditAmount.mockResolvedValue({ success: true });
    mocks.inngestSend.mockResolvedValue(undefined);
    mocks.handleApiError.mockImplementation((error: unknown) =>
      new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : "unexpected" }),
        { status: 500, headers: { "content-type": "application/json" } }
      )
    );
  });

  it("refuses admin backfill when a full analysis is still running after thesis decision", async () => {
    mocks.runningAnalysis.mockResolvedValue({
      id: "analysis_running",
      dealId: "deal_1",
      mode: "full_analysis",
      status: "RUNNING",
      thesisId: "thesis_1",
      thesisDecision: "continue",
      createdAt: new Date(),
    });

    const response = await POST(
      new Request("http://localhost/api/admin/thesis/backfill", {
        method: "POST",
        body: JSON.stringify({ dealId, force: true }),
        headers: { "content-type": "application/json" },
      }) as never
    );

    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({
      analysisId: "analysis_running",
      thesisId: "thesis_1",
    });
    expect(String(payload.error)).toContain("analyse Deep Dive");
    expect(mocks.deductCreditAmount).not.toHaveBeenCalled();
    expect(mocks.inngestSend).not.toHaveBeenCalled();
  });

  it("does not enqueue a duplicate admin backfill when the credit charge was already idempotently applied", async () => {
    mocks.deductCreditAmount.mockResolvedValue({
      success: true,
      alreadyDeducted: true,
    });

    const response = await POST(
      new Request("http://localhost/api/admin/thesis/backfill", {
        method: "POST",
        body: JSON.stringify({ dealId, force: true }),
        headers: { "content-type": "application/json" },
      }) as never
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      triggered: false,
      alreadyScheduled: true,
      creditsDeductedFromAdmin: 0,
    });
    expect(mocks.inngestSend).not.toHaveBeenCalled();
  });
});
