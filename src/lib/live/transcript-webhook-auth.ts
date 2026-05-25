// ============================================================================
// Live Coaching — Transcript Webhook HMAC Authentication (Phase C C4a)
// ============================================================================
// SEC-001 fix: the Recall.ai transcript webhook
// (`/api/live-sessions/[id]/webhook`) was previously authenticated by the
// sessionId CUID alone (~72 bits entropy). A CUID leak via logs / screen-share /
// copy-paste was enough to (1) flood transcript chunks → coaching LLM cost
// amplification, (2) inject participant_events.leave → trigger post-call
// reanalysis ($1-2 Sonnet+Tier1 each).
//
// Solution: per-session HMAC-SHA256 signature in a `?sig=` query param.
//   sig = HMAC_SHA256(LIVE_TRANSCRIPT_WEBHOOK_SECRET, sessionId).hex
// The raw secret never appears in the URL, only the derived signature. The
// signature is bound to the sessionId so leaking one session's signature does
// not compromise others.
//
// Dev bypass: opt-in via `LIVE_TRANSCRIPT_BYPASS_SIGNATURE=true`, guarded by
// the same quadruple-check as SEC-002 (C1b) to make sure preview / self-hosted
// Docker with NODE_ENV=development can never accidentally disable verification.
// ============================================================================

import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

const HMAC_ALGORITHM = "sha256";
const SIG_QUERY_PARAM = "sig";

// ----------------------------------------------------------------------------
// Bypass — quadruple-guard strict (aligned with SEC-002 / Clerk BYPASS_AUTH).
// Evaluated per call (not at module load) so vi.stubEnv works in tests.
// ----------------------------------------------------------------------------

/**
 * Local-only dev bypass for the transcript webhook HMAC verification.
 *
 * Allowed strictly when ALL four conditions hold:
 *   - `NODE_ENV === "development"`
 *   - `LIVE_TRANSCRIPT_BYPASS_SIGNATURE === "true"` (explicit opt-in)
 *   - `VERCEL_ENV !== "production"` (defense against env override)
 *   - `!VERCEL` (set on any Vercel deployment — preview included)
 */
export function isTranscriptWebhookBypassEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.LIVE_TRANSCRIPT_BYPASS_SIGNATURE === "true" &&
    process.env.VERCEL_ENV !== "production" &&
    !process.env.VERCEL
  );
}

// ----------------------------------------------------------------------------
// HMAC computation
// ----------------------------------------------------------------------------

function readSecret(): string | null {
  const raw = process.env.LIVE_TRANSCRIPT_WEBHOOK_SECRET;
  if (!raw || raw.length === 0) return null;
  return raw;
}

/**
 * Compute the HMAC-SHA256 signature for a given sessionId.
 * Throws if `LIVE_TRANSCRIPT_WEBHOOK_SECRET` is missing (fail-loud: a bot
 * deployed without a valid secret would never reach the webhook).
 *
 * The signature is `HMAC_SHA256(secret, sessionId)` encoded as lowercase hex
 * (64 chars).
 */
export function createTranscriptWebhookSignature(sessionId: string): string {
  const secret = readSecret();
  if (!secret) {
    throw new Error(
      "LIVE_TRANSCRIPT_WEBHOOK_SECRET is not set. Refusing to compute transcript webhook signature."
    );
  }
  return createHmac(HMAC_ALGORITHM, secret).update(sessionId).digest("hex");
}

// ----------------------------------------------------------------------------
// URL builder
// ----------------------------------------------------------------------------

/**
 * Build the authenticated transcript webhook URL Recall.ai will POST to.
 *
 * Strict by default: throws if `LIVE_TRANSCRIPT_WEBHOOK_SECRET` is missing
 * outside of the local dev bypass — this prevents deploying a bot whose
 * webhook URL would always be rejected by the route.
 *
 * In local dev with bypass active and no secret defined, returns the bare
 * URL (no `?sig=`). The route accepts both signed and unsigned requests in
 * bypass mode. In production, the URL always includes `?sig=`.
 *
 * Never interpolates the raw secret into the URL — only the derived
 * HMAC-SHA256 signature.
 */
export function buildTranscriptWebhookUrl(
  appUrl: string,
  sessionId: string
): string {
  const base = `${appUrl}/api/live-sessions/${sessionId}/webhook`;
  const secret = readSecret();

  if (!secret) {
    if (isTranscriptWebhookBypassEnabled()) {
      // Local dev bypass: no signature required, route will accept unsigned.
      return base;
    }
    throw new Error(
      "LIVE_TRANSCRIPT_WEBHOOK_SECRET is required outside of the local dev bypass."
    );
  }

  const sig = createTranscriptWebhookSignature(sessionId);
  // URLSearchParams gives proper encoding; sig is hex so no escaping needed but
  // we go through it for safety + future-proofing.
  const params = new URLSearchParams({ [SIG_QUERY_PARAM]: sig });
  return `${base}?${params.toString()}`;
}

// ----------------------------------------------------------------------------
// Verification (called from the route handler)
// ----------------------------------------------------------------------------

export type TranscriptWebhookVerifyResult =
  | { ok: true; bypassed: boolean }
  | {
      ok: false;
      status: 401;
      reason:
        | "missing_secret"
        | "missing_signature"
        | "invalid_signature";
    };

/**
 * Verify the `?sig=` query param of an incoming transcript webhook request
 * against `HMAC_SHA256(LIVE_TRANSCRIPT_WEBHOOK_SECRET, sessionId)`.
 *
 * Returns `{ ok: true }` on success. Returns a structured `{ ok: false }`
 * with HTTP status 401 and a stable reason code on failure (the route
 * handler maps this to a JSON 401 response).
 *
 * Comparison is timing-safe and never logs the signature.
 *
 * Reads the query param via `new URL(request.url).searchParams` rather than
 * `request.nextUrl` so the helper works with both `NextRequest` (production)
 * and a plain `Request` (unit tests).
 */
export function verifyTranscriptWebhookSignature(
  request: NextRequest | Request,
  sessionId: string
): TranscriptWebhookVerifyResult {
  if (isTranscriptWebhookBypassEnabled()) {
    return { ok: true, bypassed: true };
  }

  const secret = readSecret();
  if (!secret) {
    return { ok: false, status: 401, reason: "missing_secret" };
  }

  let provided: string | null;
  try {
    provided = new URL(request.url).searchParams.get(SIG_QUERY_PARAM);
  } catch {
    return { ok: false, status: 401, reason: "invalid_signature" };
  }
  if (!provided) {
    return { ok: false, status: 401, reason: "missing_signature" };
  }

  const expected = createHmac(HMAC_ALGORITHM, secret)
    .update(sessionId)
    .digest("hex");

  if (provided.length !== expected.length) {
    return { ok: false, status: 401, reason: "invalid_signature" };
  }

  let providedBuf: Buffer;
  let expectedBuf: Buffer;
  try {
    providedBuf = Buffer.from(provided, "hex");
    expectedBuf = Buffer.from(expected, "hex");
  } catch {
    return { ok: false, status: 401, reason: "invalid_signature" };
  }

  // Buffer.from(...,"hex") silently truncates invalid pairs; length check.
  if (providedBuf.length !== expectedBuf.length) {
    return { ok: false, status: 401, reason: "invalid_signature" };
  }

  try {
    const ok = timingSafeEqual(providedBuf, expectedBuf);
    return ok
      ? { ok: true, bypassed: false }
      : { ok: false, status: 401, reason: "invalid_signature" };
  } catch {
    return { ok: false, status: 401, reason: "invalid_signature" };
  }
}
