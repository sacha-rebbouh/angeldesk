/**
 * Phase C slice C4a — Transcript webhook HMAC auth (SEC-001).
 *
 * Couvre :
 *   - `createTranscriptWebhookSignature` : stable per sessionId, distinct
 *     across sessionIds, never exposes the raw secret, throws if secret
 *     absent.
 *   - `buildTranscriptWebhookUrl` : inclut `?sig=...` quand secret défini,
 *     URL nue en bypass dev sans secret, fail-loud sinon.
 *   - `verifyTranscriptWebhookSignature` : accept sig valide, reject sig
 *     absent / invalide / secret absent, bypass local strictement limité
 *     aux 4 conditions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  buildTranscriptWebhookUrl,
  createTranscriptWebhookSignature,
  isTranscriptWebhookBypassEnabled,
  verifyTranscriptWebhookSignature,
} from "@/lib/live/transcript-webhook-auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const APP_URL = "https://app.angeldesk.test";
const SECRET = "test-secret-value-do-not-leak-32-chars-long-string";
const SESSION_ID = "csessionidexample0123456";

function makeReq(url: string) {
  // The helper reads `new URL(request.url).searchParams`, so a minimal
  // `{ url }` shape is sufficient. Cast satisfies the NextRequest type
  // expected by callers.
  return { url } as unknown as import("next/server").NextRequest;
}

function hmacHex(secret: string, sessionId: string): string {
  return createHmac("sha256", secret).update(sessionId).digest("hex");
}

// Tests must be isolated from any ambient env. Default state: production-ish
// (no bypass, no secret) unless the test overrides.
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("LIVE_TRANSCRIPT_WEBHOOK_SECRET", "");
  vi.stubEnv("LIVE_TRANSCRIPT_BYPASS_SIGNATURE", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("VERCEL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// 1. createTranscriptWebhookSignature
// ---------------------------------------------------------------------------

describe("Phase C C4a — createTranscriptWebhookSignature", () => {
  it("retourne une signature stable pour un même sessionId", () => {
    vi.stubEnv("LIVE_TRANSCRIPT_WEBHOOK_SECRET", SECRET);
    const a = createTranscriptWebhookSignature(SESSION_ID);
    const b = createTranscriptWebhookSignature(SESSION_ID);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("retourne des signatures différentes pour deux sessionIds", () => {
    vi.stubEnv("LIVE_TRANSCRIPT_WEBHOOK_SECRET", SECRET);
    const a = createTranscriptWebhookSignature(SESSION_ID);
    const b = createTranscriptWebhookSignature("canothersessionid01234567");
    expect(a).not.toBe(b);
  });

  it("ne contient JAMAIS le secret brut", () => {
    vi.stubEnv("LIVE_TRANSCRIPT_WEBHOOK_SECRET", SECRET);
    const sig = createTranscriptWebhookSignature(SESSION_ID);
    expect(sig.includes(SECRET)).toBe(false);
    // Tightened: not even a substring of the secret >8 chars.
    expect(sig.toLowerCase().includes(SECRET.slice(0, 8).toLowerCase())).toBe(
      false
    );
  });

  it("throw si LIVE_TRANSCRIPT_WEBHOOK_SECRET absent", () => {
    expect(() => createTranscriptWebhookSignature(SESSION_ID)).toThrow(
      /LIVE_TRANSCRIPT_WEBHOOK_SECRET/
    );
  });

  it("matche exactement HMAC_SHA256(secret, sessionId) hex", () => {
    vi.stubEnv("LIVE_TRANSCRIPT_WEBHOOK_SECRET", SECRET);
    const sig = createTranscriptWebhookSignature(SESSION_ID);
    expect(sig).toBe(hmacHex(SECRET, SESSION_ID));
  });
});

// ---------------------------------------------------------------------------
// 2. buildTranscriptWebhookUrl
// ---------------------------------------------------------------------------

describe("Phase C C4a — buildTranscriptWebhookUrl", () => {
  it("inclut `?sig=...` quand le secret est défini", () => {
    vi.stubEnv("LIVE_TRANSCRIPT_WEBHOOK_SECRET", SECRET);
    const url = buildTranscriptWebhookUrl(APP_URL, SESSION_ID);
    expect(url).toContain(`/api/live-sessions/${SESSION_ID}/webhook?sig=`);
    expect(url).toContain(`sig=${hmacHex(SECRET, SESSION_ID)}`);
  });

  it("ne contient JAMAIS le secret brut", () => {
    vi.stubEnv("LIVE_TRANSCRIPT_WEBHOOK_SECRET", SECRET);
    const url = buildTranscriptWebhookUrl(APP_URL, SESSION_ID);
    expect(url.includes(SECRET)).toBe(false);
    expect(url.includes("LIVE_TRANSCRIPT_WEBHOOK_SECRET")).toBe(false);
  });

  it("throw si secret absent en prod (pas de bypass)", () => {
    expect(() => buildTranscriptWebhookUrl(APP_URL, SESSION_ID)).toThrow(
      /LIVE_TRANSCRIPT_WEBHOOK_SECRET/
    );
  });

  it("retourne URL nue en bypass dev sans secret", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LIVE_TRANSCRIPT_BYPASS_SIGNATURE", "true");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("VERCEL", "");
    const url = buildTranscriptWebhookUrl(APP_URL, SESSION_ID);
    expect(url).toBe(`${APP_URL}/api/live-sessions/${SESSION_ID}/webhook`);
    expect(url).not.toContain("sig=");
  });

  it("en bypass dev AVEC secret, signe quand même (compat strict-ready)", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LIVE_TRANSCRIPT_BYPASS_SIGNATURE", "true");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("LIVE_TRANSCRIPT_WEBHOOK_SECRET", SECRET);
    const url = buildTranscriptWebhookUrl(APP_URL, SESSION_ID);
    expect(url).toContain("sig=");
  });
});

// ---------------------------------------------------------------------------
// 3. isTranscriptWebhookBypassEnabled — quadruple-guard strict
// ---------------------------------------------------------------------------

describe("Phase C C4a — isTranscriptWebhookBypassEnabled (quadruple-guard)", () => {
  it("true uniquement quand les 4 conditions sont réunies", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LIVE_TRANSCRIPT_BYPASS_SIGNATURE", "true");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("VERCEL", "");
    expect(isTranscriptWebhookBypassEnabled()).toBe(true);
  });

  it("false si NODE_ENV !== development", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LIVE_TRANSCRIPT_BYPASS_SIGNATURE", "true");
    expect(isTranscriptWebhookBypassEnabled()).toBe(false);
  });

  it("false si LIVE_TRANSCRIPT_BYPASS_SIGNATURE !== 'true' (strict)", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LIVE_TRANSCRIPT_BYPASS_SIGNATURE", "1");
    expect(isTranscriptWebhookBypassEnabled()).toBe(false);
  });

  it("false si VERCEL_ENV === production (defense override)", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LIVE_TRANSCRIPT_BYPASS_SIGNATURE", "true");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(isTranscriptWebhookBypassEnabled()).toBe(false);
  });

  it("false si VERCEL set (preview/prod déploiement)", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LIVE_TRANSCRIPT_BYPASS_SIGNATURE", "true");
    vi.stubEnv("VERCEL", "1");
    expect(isTranscriptWebhookBypassEnabled()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. verifyTranscriptWebhookSignature
// ---------------------------------------------------------------------------

describe("Phase C C4a — verifyTranscriptWebhookSignature", () => {
  it("ok=true pour sig valide", () => {
    vi.stubEnv("LIVE_TRANSCRIPT_WEBHOOK_SECRET", SECRET);
    const sig = hmacHex(SECRET, SESSION_ID);
    const req = makeReq(
      `${APP_URL}/api/live-sessions/${SESSION_ID}/webhook?sig=${sig}`
    );
    const result = verifyTranscriptWebhookSignature(req, SESSION_ID);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bypassed).toBe(false);
  });

  it("ok=false reason 'missing_signature' si sig absent", () => {
    vi.stubEnv("LIVE_TRANSCRIPT_WEBHOOK_SECRET", SECRET);
    const req = makeReq(
      `${APP_URL}/api/live-sessions/${SESSION_ID}/webhook`
    );
    const result = verifyTranscriptWebhookSignature(req, SESSION_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.reason).toBe("missing_signature");
    }
  });

  it("ok=false reason 'invalid_signature' si sig mismatch", () => {
    vi.stubEnv("LIVE_TRANSCRIPT_WEBHOOK_SECRET", SECRET);
    const wrongSig = hmacHex(SECRET, "different-session");
    const req = makeReq(
      `${APP_URL}/api/live-sessions/${SESSION_ID}/webhook?sig=${wrongSig}`
    );
    const result = verifyTranscriptWebhookSignature(req, SESSION_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_signature");
  });

  it("ok=false reason 'invalid_signature' si sig length mismatch", () => {
    vi.stubEnv("LIVE_TRANSCRIPT_WEBHOOK_SECRET", SECRET);
    const req = makeReq(
      `${APP_URL}/api/live-sessions/${SESSION_ID}/webhook?sig=tooshort`
    );
    const result = verifyTranscriptWebhookSignature(req, SESSION_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_signature");
  });

  it("ok=false reason 'invalid_signature' si sig contient des caractères non-hex", () => {
    vi.stubEnv("LIVE_TRANSCRIPT_WEBHOOK_SECRET", SECRET);
    // 64-char string but invalid hex (z is not hex).
    const bogus = "z".repeat(64);
    const req = makeReq(
      `${APP_URL}/api/live-sessions/${SESSION_ID}/webhook?sig=${bogus}`
    );
    const result = verifyTranscriptWebhookSignature(req, SESSION_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_signature");
  });

  it("ok=false reason 'missing_secret' si secret env absent (hors bypass)", () => {
    const sig = hmacHex(SECRET, SESSION_ID);
    const req = makeReq(
      `${APP_URL}/api/live-sessions/${SESSION_ID}/webhook?sig=${sig}`
    );
    const result = verifyTranscriptWebhookSignature(req, SESSION_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing_secret");
  });

  it("ok=true (bypassed) en bypass dev — sig absent OK", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LIVE_TRANSCRIPT_BYPASS_SIGNATURE", "true");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("VERCEL", "");
    const req = makeReq(
      `${APP_URL}/api/live-sessions/${SESSION_ID}/webhook`
    );
    const result = verifyTranscriptWebhookSignature(req, SESSION_ID);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bypassed).toBe(true);
  });

  it("bypass refusé en production même si LIVE_TRANSCRIPT_BYPASS_SIGNATURE=true", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LIVE_TRANSCRIPT_BYPASS_SIGNATURE", "true");
    const req = makeReq(
      `${APP_URL}/api/live-sessions/${SESSION_ID}/webhook`
    );
    const result = verifyTranscriptWebhookSignature(req, SESSION_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing_secret");
  });

  it("bypass refusé en VERCEL preview/prod (VERCEL set)", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LIVE_TRANSCRIPT_BYPASS_SIGNATURE", "true");
    vi.stubEnv("VERCEL", "1");
    const req = makeReq(
      `${APP_URL}/api/live-sessions/${SESSION_ID}/webhook`
    );
    const result = verifyTranscriptWebhookSignature(req, SESSION_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing_secret");
  });

  it("la signature dans l'URL n'est jamais le secret brut", () => {
    // Cross-check that even if a leaked URL is reverse-engineered, the secret
    // cannot be derived from sig (HMAC is one-way).
    vi.stubEnv("LIVE_TRANSCRIPT_WEBHOOK_SECRET", SECRET);
    const url = buildTranscriptWebhookUrl(APP_URL, SESSION_ID);
    expect(url.toLowerCase().includes(SECRET.toLowerCase())).toBe(false);
  });
});
