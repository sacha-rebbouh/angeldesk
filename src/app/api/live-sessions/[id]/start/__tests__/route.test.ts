import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

const SECRET = "live-transcript-test-secret-do-not-leak";

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

    // Phase C C4a — SEC-001 : `buildTranscriptWebhookUrl` requires the
    // secret env var (or the dev bypass). Provide a stable secret + appUrl
    // for every test so the route under test can build a signed URL.
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.angeldesk.test");
    vi.stubEnv("LIVE_TRANSCRIPT_WEBHOOK_SECRET", SECRET);
    vi.stubEnv("LIVE_TRANSCRIPT_BYPASS_SIGNATURE", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("VERCEL", "");

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

  afterEach(() => {
    vi.unstubAllEnvs();
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

  // -------------------------------------------------------------------------
  // Phase C C4a — SEC-001 : URL transcript webhook signée
  // -------------------------------------------------------------------------

  it("envoie une URL transcript webhook SIGNÉE à Recall (sig=HMAC valide)", async () => {
    await POST(
      new Request("http://localhost/api/live-sessions/session_1/start", {
        method: "POST",
      }) as never,
      { params: Promise.resolve({ id: "session_1" }) }
    );

    expect(mocks.createBot).toHaveBeenCalledTimes(1);
    const botConfig = mocks.createBot.mock.calls[0][0];
    const endpoints = botConfig.recording_config.realtime_endpoints;
    const webhookEndpoint = endpoints.find(
      (ep: { type: string }) => ep.type === "webhook"
    );
    expect(webhookEndpoint).toBeDefined();

    const expectedSig = createHmac("sha256", SECRET)
      .update("session_1")
      .digest("hex");
    expect(webhookEndpoint.url).toBe(
      `https://app.angeldesk.test/api/live-sessions/session_1/webhook?sig=${expectedSig}`
    );
  });

  it("l'URL envoyée à Recall NE contient PAS le secret brut", async () => {
    await POST(
      new Request("http://localhost/api/live-sessions/session_1/start", {
        method: "POST",
      }) as never,
      { params: Promise.resolve({ id: "session_1" }) }
    );

    const botConfig = mocks.createBot.mock.calls[0][0];
    const endpoints = botConfig.recording_config.realtime_endpoints;
    const webhookEndpoint = endpoints.find(
      (ep: { type: string }) => ep.type === "webhook"
    );
    expect(webhookEndpoint.url.includes(SECRET)).toBe(false);
    expect(webhookEndpoint.url.includes("LIVE_TRANSCRIPT_WEBHOOK_SECRET")).toBe(
      false
    );
  });

  it("fail-loud (pas de débit/claim) si LIVE_TRANSCRIPT_WEBHOOK_SECRET absent en prod", async () => {
    vi.stubEnv("LIVE_TRANSCRIPT_WEBHOOK_SECRET", "");

    await expect(
      POST(
        new Request("http://localhost/api/live-sessions/session_1/start", {
          method: "POST",
        }) as never,
        { params: Promise.resolve({ id: "session_1" }) }
      )
    ).rejects.toThrow(/LIVE_TRANSCRIPT_WEBHOOK_SECRET/);

    expect(mocks.liveSessionUpdateMany).not.toHaveBeenCalled();
    expect(mocks.deductCredits).not.toHaveBeenCalled();
    expect(mocks.createBot).not.toHaveBeenCalled();
  });
});
