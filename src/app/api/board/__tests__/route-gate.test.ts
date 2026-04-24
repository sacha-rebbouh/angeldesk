import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  dealFindFirst: vi.fn(),
  boardRequestSchema: { safeParse: vi.fn() },
  checkRateLimit: vi.fn(),
  assertDealCorpusReady: vi.fn(),
  aiBoardSessionFindFirst: vi.fn(),
  aiBoardSessionCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: { findFirst: mocks.dealFindFirst },
    aIBoardSession: {
      findFirst: mocks.aiBoardSessionFindFirst,
      create: mocks.aiBoardSessionCreate,
    },
    $transaction: mocks.transaction,
    $executeRawUnsafe: vi.fn(),
  },
}));

vi.mock("@/lib/sanitize", () => ({
  boardRequestSchema: mocks.boardRequestSchema,
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock("@/services/documents/readiness-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/documents/readiness-gate")>();
  return {
    ...actual,
    assertDealCorpusReady: mocks.assertDealCorpusReady,
  };
});

vi.mock("@/agents/board", () => ({
  BoardOrchestrator: class {},
}));

vi.mock("@/services/board-credits", () => ({
  canStartBoard: vi.fn(),
  consumeCredit: vi.fn(),
  refundCredit: vi.fn(),
  getCreditsStatus: vi.fn(),
}));

vi.mock("@/lib/api-error", () => ({
  handleApiError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

const { POST } = await import("../route");
const { CorpusNotReadyError } = await import("@/services/documents/readiness-gate");

function buildPostRequest(body: unknown) {
  return new Request("http://localhost/api/board", {
    method: "POST",
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

describe("POST /api/board - ARC-LIGHT Phase 1 gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.boardRequestSchema.safeParse.mockReturnValue({
      success: true,
      data: { dealId: "deal_1" },
    });
    mocks.checkRateLimit.mockReturnValue({ allowed: true, remaining: 1, resetIn: 0 });
    mocks.dealFindFirst.mockResolvedValue({ id: "deal_1", userId: "user_1" });
  });

  it("returns 409 with reasonCode UNVERIFIED_ARTIFACT and does not reserve a board session", async () => {
    mocks.assertDealCorpusReady.mockRejectedValue(
      new CorpusNotReadyError("UNVERIFIED_ARTIFACT", {
        ready: false,
        dealId: "deal_1",
        checkedAt: new Date().toISOString(),
        documentCount: 1,
        readyDocumentCount: 0,
        runIds: ["run_1"],
        warnings: [],
        blockers: [
          {
            documentId: "doc_1",
            documentName: "deck.pdf",
            runId: "run_1",
            pageNumber: 16,
            code: "UNVERIFIED_ARTIFACT",
            message: "page 16 unverified",
            actionRequired: "REPROCESS",
            canBypass: false,
          },
        ],
      })
    );

    const response = await POST(buildPostRequest({ dealId: "deal_1" }));

    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload.reasonCode).toBe("UNVERIFIED_ARTIFACT");
    expect(payload.error).toContain("Corpus extraction not ready");

    // Fail-closed: no session reserved, no $transaction attempted.
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.aiBoardSessionCreate).not.toHaveBeenCalled();
  });

  it("invokes the gate with the correct dealId before any transaction", async () => {
    mocks.assertDealCorpusReady.mockResolvedValue(undefined);
    // Force the downstream transaction to fail so we can stop early - we only
    // care that the gate is called with the right dealId and that the
    // transaction attempt happens AFTER, not before.
    mocks.transaction.mockRejectedValue(new Error("stop-after-gate"));

    await expect(POST(buildPostRequest({ dealId: "deal_1" }))).rejects.toThrow("stop-after-gate");

    expect(mocks.assertDealCorpusReady).toHaveBeenCalledWith("deal_1");
    expect(mocks.assertDealCorpusReady).toHaveBeenCalledBefore(mocks.transaction);
  });
});
