import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  isValidCuid: vi.fn(),
  liveSessionFindFirst: vi.fn(),
  liveSessionUpdateMany: vi.fn(),
  liveSessionUpdate: vi.fn(),
  createBot: vi.fn(),
  publishSessionStatus: vi.fn(),
  deductCredits: vi.fn(),
  refundCredits: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    liveSession: {
      findFirst: mocks.liveSessionFindFirst,
      updateMany: mocks.liveSessionUpdateMany,
      update: mocks.liveSessionUpdate,
    },
  },
}));

vi.mock("@/lib/sanitize", () => ({
  isValidCuid: mocks.isValidCuid,
}));

vi.mock("@/lib/live/recall-client", () => ({
  createBot: mocks.createBot,
}));

vi.mock("@/lib/live/ably-server", () => ({
  publishSessionStatus: mocks.publishSessionStatus,
}));

vi.mock("@/services/credits", () => ({
  deductCredits: mocks.deductCredits,
  refundCredits: mocks.refundCredits,
}));

vi.mock("@/lib/api-error", () => ({
  handleApiError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

const { POST } = await import("../route");

describe("POST /api/live-sessions/[id]/start", () => {
  const updatedAt = new Date("2026-04-21T10:15:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.isValidCuid.mockReturnValue(true);
    mocks.liveSessionFindFirst.mockResolvedValue({
      id: "session_1",
      userId: "user_1",
      dealId: "deal_1",
      meetingUrl: "https://meet.example.com/room",
      status: "created",
      updatedAt,
    });
    mocks.liveSessionUpdateMany.mockResolvedValue({ count: 1 });
    mocks.deductCredits.mockResolvedValue({
      success: true,
      balanceAfter: 42,
    });
    mocks.createBot.mockResolvedValue({ id: "bot_1" });
    mocks.liveSessionUpdate.mockResolvedValue({
      id: "session_1",
      status: "bot_joining",
      botId: "bot_1",
    });
    mocks.publishSessionStatus.mockResolvedValue(undefined);
    mocks.refundCredits.mockResolvedValue(undefined);
  });

  it("returns 409 without charging when another request already claimed the session", async () => {
    mocks.liveSessionUpdateMany.mockResolvedValue({ count: 0 });

    const response = await POST(
      new Request("http://localhost/api/live-sessions/session_1/start", {
        method: "POST",
      }) as never,
      { params: Promise.resolve({ id: "session_1" }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(String(payload.error)).toContain("cannot be started");
    expect(mocks.deductCredits).not.toHaveBeenCalled();
  });

  it("charges live coaching with a session-scoped idempotency key after claiming the session", async () => {
    const response = await POST(
      new Request("http://localhost/api/live-sessions/session_1/start", {
        method: "POST",
      }) as never,
      { params: Promise.resolve({ id: "session_1" }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      id: "session_1",
      status: "bot_joining",
      botId: "bot_1",
    });
    expect(mocks.deductCredits).toHaveBeenCalledWith(
      "user_1",
      "LIVE_COACHING",
      "deal_1",
      expect.objectContaining({
        idempotencyKey: `live:session_1:${updatedAt.getTime()}`,
        description: "Live coaching session session_1",
      })
    );
  });
});
