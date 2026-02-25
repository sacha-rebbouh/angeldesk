// ============================================================================
// Recall.ai API Client — Bot management, transcription, webhook verification
// ============================================================================

import { createHmac, timingSafeEqual } from "crypto";

import type {
  MeetingPlatform,
  RecallBotConfig,
  RecallBotStatus,
  RecallTranscriptChunk,
} from "@/lib/live/types";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RECALL_BASE_URL = process.env.RECALL_API_REGION
  ? `https://${process.env.RECALL_API_REGION}.recall.ai`
  : "https://eu-central-1.recall.ai";

// ---------------------------------------------------------------------------
// Authenticated fetch wrapper
// ---------------------------------------------------------------------------

async function recallFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const apiKey = process.env.RECALL_AI_API_KEY;
  if (!apiKey) {
    throw new Error("RECALL_AI_API_KEY is not set");
  }

  const url = `${RECALL_BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "Unknown error");
    throw new Error(
      `Recall API error ${response.status} on ${options.method ?? "GET"} ${path}: ${body}`
    );
  }

  return response;
}

// ---------------------------------------------------------------------------
// Bot CRUD
// ---------------------------------------------------------------------------

/** Create a Recall.ai bot that will join a meeting and transcribe. */
export async function createBot(
  config: RecallBotConfig
): Promise<RecallBotStatus> {
  const response = await recallFetch("/api/v1/bot/", {
    method: "POST",
    body: JSON.stringify(config),
  });
  return response.json() as Promise<RecallBotStatus>;
}

/** Poll the current status of a bot. */
export async function getBotStatus(botId: string): Promise<RecallBotStatus> {
  const response = await recallFetch(`/api/v1/bot/${botId}/`);
  return response.json() as Promise<RecallBotStatus>;
}

/** Ask the bot to leave the meeting gracefully. */
export async function leaveMeeting(botId: string): Promise<void> {
  await recallFetch(`/api/v1/bot/${botId}/leave/`, {
    method: "POST",
  });
}

/** Delete a bot and all associated data from Recall.ai. */
export async function deleteBot(botId: string): Promise<void> {
  await recallFetch(`/api/v1/bot/${botId}/`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Transcription
// ---------------------------------------------------------------------------

/** Fetch the full transcript for a completed bot session. */
export async function getFullTranscript(
  botId: string
): Promise<RecallTranscriptChunk[]> {
  const response = await recallFetch(`/api/v1/bot/${botId}/transcript/`);
  return response.json() as Promise<RecallTranscriptChunk[]>;
}

// ---------------------------------------------------------------------------
// Webhook verification (Svix standard used by Recall.ai dashboard webhooks)
// ---------------------------------------------------------------------------

const SVIX_TIMESTAMP_TOLERANCE_SECONDS = 300; // 5 minutes

/**
 * Verify Svix webhook signature (used by Recall.ai status webhooks).
 * Svix signs with: HMAC-SHA256(base64_decode(secret), "msg_id.timestamp.body")
 * The secret has a `whsec_` prefix that must be stripped before decoding.
 */
export function verifySvixSignature(
  body: string,
  headers: {
    svixId: string | null;
    svixTimestamp: string | null;
    svixSignature: string | null;
  },
  secret: string
): boolean {
  const { svixId, svixTimestamp, svixSignature } = headers;

  if (!svixId || !svixTimestamp || !svixSignature) {
    return false;
  }

  // Verify timestamp is within tolerance
  const timestampSec = parseInt(svixTimestamp, 10);
  if (isNaN(timestampSec)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestampSec) > SVIX_TIMESTAMP_TOLERANCE_SECONDS) {
    return false;
  }

  // Decode secret: strip "whsec_" prefix, then base64-decode
  const secretBase64 = secret.startsWith("whsec_")
    ? secret.slice(6)
    : secret;
  const secretBytes = Buffer.from(secretBase64, "base64");

  // Sign: "msg_id.timestamp.body"
  const signedContent = `${svixId}.${svixTimestamp}.${body}`;
  const hmac = createHmac("sha256", secretBytes);
  hmac.update(signedContent, "utf8");
  const expected = hmac.digest("base64");

  // Svix signature header may contain multiple signatures: "v1,<sig1> v1,<sig2>"
  const signatures = svixSignature.split(" ");
  for (const sig of signatures) {
    const parts = sig.split(",");
    if (parts.length !== 2 || parts[0] !== "v1") continue;
    const sigValue = parts[1];
    if (sigValue.length !== expected.length) continue;

    if (
      timingSafeEqual(
        Buffer.from(expected, "utf8"),
        Buffer.from(sigValue, "utf8")
      )
    ) {
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Platform detection — uses URL parsing for stricter hostname matching
// ---------------------------------------------------------------------------

/** Detect the meeting platform from a URL, or null if unrecognized. */
export function detectPlatform(url: string): MeetingPlatform | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === "zoom.us" || host.endsWith(".zoom.us")) return "zoom";
    if (host === "meet.google.com") return "meet";
    if (host === "teams.microsoft.com" || host.endsWith(".teams.microsoft.com"))
      return "teams";
    return null;
  } catch {
    return null;
  }
}
