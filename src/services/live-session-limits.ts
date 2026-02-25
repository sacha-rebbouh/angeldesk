import { prisma } from "@/lib/prisma";

// =============================================================================
// Constants
// =============================================================================

const MAX_ACTIVE_SESSIONS = 1;
const MAX_SESSIONS_PER_DAY = 3;

/** Estimated cost per hour of live coaching (transcription + LLM) */
const COST_PER_HOUR = 2.4;

// =============================================================================
// canStartLiveSession
// =============================================================================

/**
 * Check whether a user can start a new live coaching session.
 * - Max 1 active session (status: created, bot_joining, live)
 * - Max 3 sessions in the last 24 hours
 */
export async function canStartLiveSession(
  userId: string
): Promise<{ allowed: boolean; reason?: string }> {
  // Check 1: No more than 1 active session
  const activeCount = await prisma.liveSession.count({
    where: {
      userId,
      status: { in: ["created", "bot_joining", "live"] },
    },
  });

  if (activeCount >= MAX_ACTIVE_SESSIONS) {
    return {
      allowed: false,
      reason: "Vous avez deja une session active. Terminez-la avant d'en lancer une nouvelle.",
    };
  }

  // Check 2: No more than 3 sessions in the last 24 hours
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const todayCount = await prisma.liveSession.count({
    where: {
      userId,
      createdAt: { gte: twentyFourHoursAgo },
    },
  });

  if (todayCount >= MAX_SESSIONS_PER_DAY) {
    return {
      allowed: false,
      reason: "Limite quotidienne atteinte (3 sessions par 24h). Reessayez plus tard.",
    };
  }

  return { allowed: true };
}

// =============================================================================
// getSessionUsage
// =============================================================================

/**
 * Return current usage stats for display in the UI.
 */
export async function getSessionUsage(
  userId: string
): Promise<{ activeCount: number; todayCount: number; todayLimit: number }> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [activeCount, todayCount] = await Promise.all([
    prisma.liveSession.count({
      where: {
        userId,
        status: { in: ["created", "bot_joining", "live"] },
      },
    }),
    prisma.liveSession.count({
      where: {
        userId,
        createdAt: { gte: twentyFourHoursAgo },
      },
    }),
  ]);

  return {
    activeCount,
    todayCount,
    todayLimit: MAX_SESSIONS_PER_DAY,
  };
}

// =============================================================================
// recordSessionDuration
// =============================================================================

/**
 * Update a session with cost estimate based on duration.
 * Cost formula: durationMinutes / 60 * $2.40/hour
 */
export async function recordSessionDuration(
  sessionId: string,
  durationMinutes: number
): Promise<void> {
  const totalCost = (durationMinutes / 60) * COST_PER_HOUR;

  await prisma.liveSession.update({
    where: { id: sessionId },
    data: {
      totalCost,
    },
  });
}
