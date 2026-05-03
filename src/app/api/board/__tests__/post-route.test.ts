import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  dealFindFirst: vi.fn(),
  boardSessionDelete: vi.fn(),
  boardSessionUpdate: vi.fn(),
  transaction: vi.fn(),
  txExecuteRawUnsafe: vi.fn(),
  txBoardSessionFindFirst: vi.fn(),
  txBoardSessionCreate: vi.fn(),
  boardRequestSafeParse: vi.fn(),
  checkRateLimit: vi.fn(),
  canStartBoard: vi.fn(),
  consumeCredit: vi.fn(),
  refundCredit: vi.fn(),
  runBoard: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: {
      findFirst: mocks.dealFindFirst,
    },
    aIBoardSession: {
      delete: mocks.boardSessionDelete,
      update: mocks.boardSessionUpdate,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/agents/board", () => ({
  BoardOrchestrator: class {
    async runBoard() {
      return mocks.runBoard();
    }
  },
}));

vi.mock("@/services/board-credits", () => ({
  canStartBoard: mocks.canStartBoard,
  consumeCredit: mocks.consumeCredit,
  refundCredit: mocks.refundCredit,
  getCreditsStatus: vi.fn(),
}));

vi.mock("@/lib/sanitize", () => ({
  boardRequestSchema: { safeParse: mocks.boardRequestSafeParse },
  checkRateLimit: mocks.checkRateLimit,
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

describe("POST /api/board", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.dealFindFirst.mockResolvedValue({ id: "deal_1", userId: "user_1" });
    mocks.boardRequestSafeParse.mockReturnValue({
      success: true,
      data: { dealId: "deal_1" },
    });
    mocks.checkRateLimit.mockReturnValue({ allowed: true, remaining: 1, resetIn: 0 });
    mocks.txExecuteRawUnsafe.mockResolvedValue(undefined);
    mocks.txBoardSessionFindFirst.mockResolvedValue(null);
    mocks.txBoardSessionCreate.mockResolvedValue({ id: "session_123" });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        $executeRawUnsafe: mocks.txExecuteRawUnsafe,
        aIBoardSession: {
          findFirst: mocks.txBoardSessionFindFirst,
          create: mocks.txBoardSessionCreate,
        },
      })
    );
    mocks.canStartBoard.mockResolvedValue({
      canStart: true,
      status: { canUseBoard: true },
    });
    mocks.consumeCredit.mockResolvedValue({
      success: true,
      creditsRemaining: 12,
      usedFrom: "monthly",
    });
    mocks.refundCredit.mockResolvedValue(undefined);
    mocks.runBoard.mockResolvedValue({
      recommendation: "FAVORABLE",
    });
  });

  it("returns 409 without charging when another board session is already active", async () => {
    mocks.txBoardSessionFindFirst.mockResolvedValue({
      id: "session_active",
      status: "ANALYZING",
    });

    const response = await POST(
      new Request("http://localhost/api/board", {
        method: "POST",
        body: JSON.stringify({ dealId: "deal_1" }),
        headers: { "content-type": "application/json" },
      }) as never
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({
      error: expect.stringContaining("AI Board est deja en cours"),
      sessionId: "session_active",
    });
    expect(mocks.consumeCredit).not.toHaveBeenCalled();
  });

  it("charges the reserved session with a session-scoped idempotency key", async () => {
    const response = await POST(
      new Request("http://localhost/api/board", {
        method: "POST",
        body: JSON.stringify({ dealId: "deal_1" }),
        headers: { "content-type": "application/json" },
      }) as never
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    expect(mocks.consumeCredit).toHaveBeenCalledWith(
      "user_1",
      expect.objectContaining({
        dealId: "deal_1",
        idempotencyKey: "board:session_123",
        description: "AI Board for deal deal_1",
      })
    );
  });
});
