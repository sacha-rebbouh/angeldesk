/**
 * Phase C slice C4a — Transcript webhook auth route test (SEC-001).
 *
 * Couvre :
 *   - sig absent → 401 ;
 *   - sig invalide → 401 ;
 *   - sig valide → traitement normal (pas 401) ;
 *   - bypass local strict (NODE_ENV=development + opt-in + !VERCEL +
 *     VERCEL_ENV!=production) → pas 401 ;
 *   - bypass refusé en VERCEL même avec opt-in true → 401.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createHmac } from "node:crypto";

const SESSION_ID = "csessionwebhooktest012345";
const SECRET = "live-transcript-test-secret-do-not-leak";

const mocks = vi.hoisted(() => ({
  isValidCuid: vi.fn(() => true),
  liveSessionFindFirst: vi.fn(),
  classifyUtterance: vi.fn(),
  generateCoachingSuggestion: vi.fn(),
  checkAutoDismiss: vi.fn(),
  markCardsAsAddressed: vi.fn(),
  getTranscriptBuffer: vi.fn(),
  setScreenShareState: vi.fn(),
  publishScreenShareState: vi.fn(),
  publishSessionStatus: vi.fn(),
  publishCoachingCard: vi.fn(),
  publishParticipantJoined: vi.fn(),
  publishParticipantLeft: vi.fn(),
  compileDealContextCached: vi.fn(),
  compileContextForColdMode: vi.fn(),
  mapSpeakerToRole: vi.fn(),
  logCoachingLatency: vi.fn(),
  logCoachingError: vi.fn(),
  logSessionEvent: vi.fn(),
  handleApiError: vi.fn((e: unknown) => {
    throw e;
  }),
}));

vi.mock("@/lib/sanitize", () => ({
  isValidCuid: mocks.isValidCuid,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    liveSession: {
      findFirst: mocks.liveSessionFindFirst,
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    transcriptChunk: { create: vi.fn(), update: vi.fn() },
    coachingCard: { create: vi.fn(), findMany: vi.fn(() => []) },
  },
}));

vi.mock("@/lib/live/utterance-router", () => ({
  classifyUtterance: mocks.classifyUtterance,
  shouldTriggerCoaching: vi.fn(() => false),
}));

vi.mock("@/lib/live/coaching-engine", () => ({
  generateCoachingSuggestion: mocks.generateCoachingSuggestion,
  getTranscriptBuffer: mocks.getTranscriptBuffer,
}));

vi.mock("@/lib/live/auto-dismiss", () => ({
  checkAutoDismiss: mocks.checkAutoDismiss,
  markCardsAsAddressed: mocks.markCardsAsAddressed,
}));

vi.mock("@/lib/live/context-compiler", () => ({
  compileDealContextCached: mocks.compileDealContextCached,
  compileContextForColdMode: mocks.compileContextForColdMode,
}));

vi.mock("@/lib/live/speaker-detector", () => ({
  mapSpeakerToRole: mocks.mapSpeakerToRole,
}));

vi.mock("@/lib/live/ably-server", () => ({
  publishCoachingCard: mocks.publishCoachingCard,
  publishScreenShareState: mocks.publishScreenShareState,
  publishSessionStatus: mocks.publishSessionStatus,
  publishParticipantJoined: mocks.publishParticipantJoined,
  publishParticipantLeft: mocks.publishParticipantLeft,
}));

vi.mock("@/lib/live/visual-processor", () => ({
  setScreenShareState: mocks.setScreenShareState,
}));

vi.mock("@/lib/live/monitoring", () => ({
  logCoachingLatency: mocks.logCoachingLatency,
  logCoachingError: mocks.logCoachingError,
  logSessionEvent: mocks.logSessionEvent,
}));

vi.mock("@/lib/api-error", () => ({
  handleApiError: mocks.handleApiError,
}));

const { POST } = await import("../route");

function hmacHex(secret: string, sessionId: string) {
  return createHmac("sha256", secret).update(sessionId).digest("hex");
}

function makeUnknownEventBody() {
  return JSON.stringify({ event: "unknown.event" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isValidCuid.mockReturnValue(true);
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("LIVE_TRANSCRIPT_WEBHOOK_SECRET", "");
  vi.stubEnv("LIVE_TRANSCRIPT_BYPASS_SIGNATURE", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("VERCEL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Phase C C4a — Transcript webhook auth (SEC-001)", () => {
  it("sig absent → 401", async () => {
    vi.stubEnv("LIVE_TRANSCRIPT_WEBHOOK_SECRET", SECRET);

    const request = new Request(
      `http://localhost/api/live-sessions/${SESSION_ID}/webhook`,
      {
        method: "POST",
        body: makeUnknownEventBody(),
        headers: { "content-type": "application/json" },
      }
    );

    const response = await POST(request as never, {
      params: Promise.resolve({ id: SESSION_ID }),
    });

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.error).toBe("Unauthorized");
  });

  it("sig invalide → 401", async () => {
    vi.stubEnv("LIVE_TRANSCRIPT_WEBHOOK_SECRET", SECRET);

    const wrongSig = hmacHex(SECRET, "different-session-id");
    const request = new Request(
      `http://localhost/api/live-sessions/${SESSION_ID}/webhook?sig=${wrongSig}`,
      {
        method: "POST",
        body: makeUnknownEventBody(),
        headers: { "content-type": "application/json" },
      }
    );

    const response = await POST(request as never, {
      params: Promise.resolve({ id: SESSION_ID }),
    });

    expect(response.status).toBe(401);
  });

  it("sig valide → pas 401 (200 ok)", async () => {
    vi.stubEnv("LIVE_TRANSCRIPT_WEBHOOK_SECRET", SECRET);

    const sig = hmacHex(SECRET, SESSION_ID);
    const request = new Request(
      `http://localhost/api/live-sessions/${SESSION_ID}/webhook?sig=${sig}`,
      {
        method: "POST",
        body: makeUnknownEventBody(),
        headers: { "content-type": "application/json" },
      }
    );

    const response = await POST(request as never, {
      params: Promise.resolve({ id: SESSION_ID }),
    });

    expect(response.status).not.toBe(401);
    expect(response.status).toBe(200);
  });

  it("bypass local (NODE_ENV=development + opt-in + !VERCEL) → pas 401 sans sig", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LIVE_TRANSCRIPT_BYPASS_SIGNATURE", "true");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("VERCEL", "");

    const request = new Request(
      `http://localhost/api/live-sessions/${SESSION_ID}/webhook`,
      {
        method: "POST",
        body: makeUnknownEventBody(),
        headers: { "content-type": "application/json" },
      }
    );

    const response = await POST(request as never, {
      params: Promise.resolve({ id: SESSION_ID }),
    });

    expect(response.status).not.toBe(401);
  });

  it("bypass refusé en VERCEL preview/prod même avec opt-in true → 401", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LIVE_TRANSCRIPT_BYPASS_SIGNATURE", "true");
    vi.stubEnv("VERCEL", "1"); // simule Vercel runtime

    const request = new Request(
      `http://localhost/api/live-sessions/${SESSION_ID}/webhook`,
      {
        method: "POST",
        body: makeUnknownEventBody(),
        headers: { "content-type": "application/json" },
      }
    );

    const response = await POST(request as never, {
      params: Promise.resolve({ id: SESSION_ID }),
    });

    expect(response.status).toBe(401);
  });

  it("secret absent (hors bypass) → 401 même avec sig fournie", async () => {
    // env reset (default): no secret defined, no bypass.
    const sig = hmacHex(SECRET, SESSION_ID); // signed with what user thinks is the secret
    const request = new Request(
      `http://localhost/api/live-sessions/${SESSION_ID}/webhook?sig=${sig}`,
      {
        method: "POST",
        body: makeUnknownEventBody(),
        headers: { "content-type": "application/json" },
      }
    );

    const response = await POST(request as never, {
      params: Promise.resolve({ id: SESSION_ID }),
    });

    expect(response.status).toBe(401);
  });

  it("CUID invalide → 400 (court-circuit avant verify, comportement préservé)", async () => {
    mocks.isValidCuid.mockReturnValue(false);
    vi.stubEnv("LIVE_TRANSCRIPT_WEBHOOK_SECRET", SECRET);

    const request = new Request(
      `http://localhost/api/live-sessions/bad-id/webhook`,
      {
        method: "POST",
        body: makeUnknownEventBody(),
        headers: { "content-type": "application/json" },
      }
    );

    const response = await POST(request as never, {
      params: Promise.resolve({ id: "bad-id" }),
    });

    expect(response.status).toBe(400);
  });
});
