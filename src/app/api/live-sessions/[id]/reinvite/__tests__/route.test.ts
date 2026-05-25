/**
 * Phase C slice C4a — Reinvite route signed webhook URL (SEC-001).
 *
 * Couvre :
 *   - L'URL envoyée à `createBot` contient `?sig=HMAC(secret, id)`.
 *   - L'URL ne contient pas le secret brut.
 *   - Si LIVE_TRANSCRIPT_WEBHOOK_SECRET absent en prod → throw avant `createBot`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

const SECRET = "live-transcript-test-secret-do-not-leak";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  isValidCuid: vi.fn(),
  liveSessionFindFirst: vi.fn(),
  sessionSummaryDeleteMany: vi.fn(),
  liveSessionUpdate: vi.fn(),
  createBot: vi.fn(),
  leaveMeeting: vi.fn(),
  publishSessionStatus: vi.fn(),
  handleApiError: vi.fn((e: unknown) => {
    throw e;
  }),
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    liveSession: {
      findFirst: mocks.liveSessionFindFirst,
      update: mocks.liveSessionUpdate,
    },
    sessionSummary: {
      deleteMany: mocks.sessionSummaryDeleteMany,
    },
  },
}));

vi.mock("@/lib/sanitize", () => ({
  isValidCuid: mocks.isValidCuid,
}));

vi.mock("@/lib/live/recall-client", () => ({
  createBot: mocks.createBot,
  leaveMeeting: mocks.leaveMeeting,
}));

vi.mock("@/lib/live/ably-server", () => ({
  publishSessionStatus: mocks.publishSessionStatus,
}));

vi.mock("@/lib/api-error", () => ({
  handleApiError: mocks.handleApiError,
}));

const { POST } = await import("../route");

describe("POST /api/live-sessions/[id]/reinvite — SEC-001 signed URL", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.angeldesk.test");
    vi.stubEnv("LIVE_TRANSCRIPT_WEBHOOK_SECRET", SECRET);
    vi.stubEnv("LIVE_TRANSCRIPT_BYPASS_SIGNATURE", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("WS_RELAY_URL", "");

    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.isValidCuid.mockReturnValue(true);
    mocks.liveSessionFindFirst.mockResolvedValue({
      id: "session_1",
      userId: "user_1",
      botId: "bot_old",
      status: "failed",
      meetingUrl: "https://meet.example.com/room",
      createdAt: new Date(),
    });
    mocks.sessionSummaryDeleteMany.mockResolvedValue({ count: 0 });
    mocks.createBot.mockResolvedValue({ id: "bot_new" });
    mocks.leaveMeeting.mockResolvedValue(undefined);
    mocks.liveSessionUpdate.mockResolvedValue({
      id: "session_1",
      status: "bot_joining",
      botId: "bot_new",
    });
    mocks.publishSessionStatus.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("envoie une URL webhook signée à `createBot`", async () => {
    await POST(
      new Request("http://localhost/api/live-sessions/session_1/reinvite", {
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

  it("l'URL envoyée à `createBot` NE contient PAS le secret brut", async () => {
    await POST(
      new Request("http://localhost/api/live-sessions/session_1/reinvite", {
        method: "POST",
      }) as never,
      { params: Promise.resolve({ id: "session_1" }) }
    );

    const botConfig = mocks.createBot.mock.calls[0][0];
    const webhookEndpoint = botConfig.recording_config.realtime_endpoints.find(
      (ep: { type: string }) => ep.type === "webhook"
    );
    expect(webhookEndpoint.url.includes(SECRET)).toBe(false);
  });

  it("fail-loud avant `createBot`/`leaveMeeting` si secret absent en prod", async () => {
    vi.stubEnv("LIVE_TRANSCRIPT_WEBHOOK_SECRET", "");

    await expect(
      POST(
        new Request("http://localhost/api/live-sessions/session_1/reinvite", {
          method: "POST",
        }) as never,
        { params: Promise.resolve({ id: "session_1" }) }
      )
    ).rejects.toThrow(/LIVE_TRANSCRIPT_WEBHOOK_SECRET/);

    expect(mocks.leaveMeeting).not.toHaveBeenCalled();
    expect(mocks.createBot).not.toHaveBeenCalled();
  });
});
