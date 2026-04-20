import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getCreditsStatus: vi.fn(),
  boardSessionFindFirst: vi.fn(),
  thesisFindFirst: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aIBoardSession: {
      findFirst: mocks.boardSessionFindFirst,
    },
    thesis: {
      findFirst: mocks.thesisFindFirst,
    },
  },
}));

vi.mock("@/agents/board", () => ({
  BoardOrchestrator: class {},
}));

vi.mock("@/services/board-credits", () => ({
  canStartBoard: vi.fn(),
  consumeCredit: vi.fn(),
  refundCredit: vi.fn(),
  getCreditsStatus: mocks.getCreditsStatus,
}));

vi.mock("@/lib/sanitize", () => ({
  boardRequestSchema: { safeParse: vi.fn() },
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/api-error", () => ({
  handleApiError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

const { GET } = await import("../route");

describe("GET /api/board", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.getCreditsStatus.mockResolvedValue({
      canUseBoard: true,
      monthlyAllocation: 2,
      usedThisMonth: 0,
      remainingMonthly: 2,
      extraCredits: 0,
      totalAvailable: 2,
      subscriptionStatus: "PRO",
      nextResetDate: "2026-05-01T00:00:00.000Z",
    });
    mocks.boardSessionFindFirst.mockResolvedValue(null);
    mocks.thesisFindFirst.mockResolvedValue(null);
  });

  it("returns a staleSession instead of latestSession when the saved board session is no longer aligned", async () => {
    mocks.boardSessionFindFirst.mockResolvedValue({
      id: "session_old",
      dealId: "deal_1",
      userId: "user_1",
      status: "COMPLETED",
      thesisId: "thesis_old",
      corpusSnapshotId: "snap_old",
      verdict: "FAVORABLE",
      consensusLevel: "HIGH",
      stoppingReason: "consensus",
      members: [],
      rounds: [],
      consensusPoints: [],
      frictionPoints: [],
      questionsForFounder: [],
      totalRounds: 2,
      totalCost: "10",
      totalTimeMs: 1200,
      completedAt: new Date("2026-04-20T12:00:00.000Z"),
    });
    mocks.thesisFindFirst.mockResolvedValue({
      id: "thesis_latest",
      corpusSnapshotId: "snap_latest",
    });

    const response = await GET({
      nextUrl: new URL("http://localhost/api/board?dealId=deal_1"),
    } as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.latestSession).toBeNull();
    expect(payload.staleSession).toMatchObject({
      id: "session_old",
      thesisId: "thesis_old",
      corpusSnapshotId: "snap_old",
      verdict: "FAVORABLE",
    });
  });

  it("returns latestSession when the saved board session is still aligned to the current thesis", async () => {
    mocks.boardSessionFindFirst.mockResolvedValue({
      id: "session_latest",
      dealId: "deal_1",
      userId: "user_1",
      status: "COMPLETED",
      thesisId: "thesis_latest",
      corpusSnapshotId: "snap_latest",
      verdict: "FAVORABLE",
      consensusLevel: "HIGH",
      stoppingReason: "consensus",
      members: [],
      rounds: [],
      consensusPoints: [],
      frictionPoints: [],
      questionsForFounder: [],
      totalRounds: 2,
      totalCost: "10",
      totalTimeMs: 1200,
      completedAt: new Date("2026-04-20T12:00:00.000Z"),
    });
    mocks.thesisFindFirst.mockResolvedValue({
      id: "thesis_latest",
      corpusSnapshotId: "snap_latest",
    });

    const response = await GET({
      nextUrl: new URL("http://localhost/api/board?dealId=deal_1"),
    } as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.staleSession).toBeNull();
    expect(payload.latestSession).toMatchObject({
      id: "session_latest",
      thesisId: "thesis_latest",
      corpusSnapshotId: "snap_latest",
      verdict: "FAVORABLE",
    });
  });

  it("marks a saved session stale when the thesis matches but the corpus snapshot no longer does", async () => {
    mocks.boardSessionFindFirst.mockResolvedValue({
      id: "session_snapshot_old",
      dealId: "deal_1",
      userId: "user_1",
      status: "COMPLETED",
      thesisId: "thesis_latest",
      corpusSnapshotId: "snap_old",
      verdict: "FAVORABLE",
      consensusLevel: "HIGH",
      stoppingReason: "consensus",
      members: [],
      rounds: [],
      consensusPoints: [],
      frictionPoints: [],
      questionsForFounder: [],
      totalRounds: 2,
      totalCost: "10",
      totalTimeMs: 1200,
      completedAt: new Date("2026-04-20T12:00:00.000Z"),
    });
    mocks.thesisFindFirst.mockResolvedValue({
      id: "thesis_latest",
      corpusSnapshotId: "snap_latest",
    });

    const response = await GET({
      nextUrl: new URL("http://localhost/api/board?dealId=deal_1"),
    } as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.latestSession).toBeNull();
    expect(payload.staleSession).toMatchObject({
      id: "session_snapshot_old",
      thesisId: "thesis_latest",
      corpusSnapshotId: "snap_old",
    });
  });
});
