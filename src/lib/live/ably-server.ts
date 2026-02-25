// ============================================================================
// Ably Server-Side Publisher — Real-time event broadcasting for live sessions
// ============================================================================

import Ably from "ably";

import type {
  AblyCardAddressedEvent,
  AblyCoachingCardEvent,
  AblySessionStatusEvent,
} from "@/lib/live/types";

// ---------------------------------------------------------------------------
// Singleton client
// ---------------------------------------------------------------------------

let ablyClient: Ably.Rest | null = null;

/** Get or create the singleton Ably REST client (server-side only). */
export function getAblyClient(): Ably.Rest {
  if (ablyClient) return ablyClient;

  const apiKey = process.env.ABLY_API_KEY;
  if (!apiKey) {
    throw new Error("ABLY_API_KEY is not set");
  }

  ablyClient = new Ably.Rest({ key: apiKey });
  return ablyClient;
}

// ---------------------------------------------------------------------------
// Channel naming
// ---------------------------------------------------------------------------

/** Deterministic channel name for a live session. */
export function getChannelName(sessionId: string): string {
  return `live-session:${sessionId}`;
}

// ---------------------------------------------------------------------------
// Event publishers
// ---------------------------------------------------------------------------

/** Publish a new coaching card to the session channel. */
export async function publishCoachingCard(
  sessionId: string,
  card: AblyCoachingCardEvent
): Promise<void> {
  const client = getAblyClient();
  const channel = client.channels.get(getChannelName(sessionId));
  await channel.publish("coaching-card", card);
}

/** Publish that a coaching card was addressed (auto-dismiss or manual). */
export async function publishCardAddressed(
  sessionId: string,
  data: AblyCardAddressedEvent
): Promise<void> {
  const client = getAblyClient();
  const channel = client.channels.get(getChannelName(sessionId));
  await channel.publish("card-addressed", data);
}

/** Publish a session status change (e.g. bot_joining → live → processing). */
export async function publishSessionStatus(
  sessionId: string,
  data: AblySessionStatusEvent
): Promise<void> {
  const client = getAblyClient();
  const channel = client.channels.get(getChannelName(sessionId));
  await channel.publish("session-status", data);
}

/** Publish when a new participant joins the meeting. */
export async function publishParticipantJoined(
  sessionId: string,
  data: { name: string; role: string }
): Promise<void> {
  const client = getAblyClient();
  const channel = client.channels.get(getChannelName(sessionId));
  await channel.publish("participant-joined", data);
}

/** Publish when a participant leaves the meeting. */
export async function publishParticipantLeft(
  sessionId: string,
  data: { name: string }
): Promise<void> {
  const client = getAblyClient();
  const channel = client.channels.get(getChannelName(sessionId));
  await channel.publish("participant-left", data);
}

// ---------------------------------------------------------------------------
// Token generation (for client-side auth)
// ---------------------------------------------------------------------------

const TOKEN_TTL_MS = 60 * 60 * 1000; // 60 minutes

/**
 * Generate an Ably token scoped to a specific session channel.
 * The client can only subscribe to the channel for this session.
 */
export async function generateAblyToken(
  sessionId: string,
  userId: string
): Promise<Ably.TokenDetails> {
  const client = getAblyClient();
  const channelName = getChannelName(sessionId);

  const tokenRequest = await client.auth.createTokenRequest({
    clientId: userId,
    ttl: TOKEN_TTL_MS,
    capability: {
      [channelName]: ["subscribe", "presence"],
    },
  });

  // Exchange token request for actual token details
  const tokenDetails = await client.auth.requestToken(tokenRequest);
  return tokenDetails;
}
