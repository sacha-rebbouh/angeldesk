import { prisma } from "@/lib/prisma";

// Credits configuration
const CREDITS_CONFIG = {
  FREE: {
    monthlyAllocation: 0, // FREE users cannot use AI Board
  },
  PRO: {
    monthlyAllocation: 5, // 5 boards per month included
  },
  ENTERPRISE: {
    monthlyAllocation: 50, // 50 boards per month
  },
} as const;

export interface BoardCreditsStatus {
  canUseBoard: boolean;
  reason?: string;
  monthlyAllocation: number;
  usedThisMonth: number;
  remainingMonthly: number;
  extraCredits: number;
  totalAvailable: number;
  subscriptionStatus: "FREE" | "PRO" | "ENTERPRISE";
  nextResetDate: Date;
}

export interface ConsumeResult {
  success: boolean;
  creditsRemaining: number;
  usedFrom: "monthly" | "extra";
  error?: string;
}

/**
 * Check if a user can start a new AI Board session
 */
export async function canStartBoard(userId: string): Promise<{
  canStart: boolean;
  status: BoardCreditsStatus;
}> {
  const status = await getCreditsStatus(userId);

  return {
    canStart: status.canUseBoard,
    status,
  };
}

/**
 * Get the full credits status for a user
 */
export async function getCreditsStatus(userId: string): Promise<BoardCreditsStatus> {
  // Get user subscription status
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionStatus: true },
  });

  if (!user) {
    return {
      canUseBoard: false,
      reason: "Utilisateur non trouve",
      monthlyAllocation: 0,
      usedThisMonth: 0,
      remainingMonthly: 0,
      extraCredits: 0,
      totalAvailable: 0,
      subscriptionStatus: "FREE",
      nextResetDate: getNextResetDate(),
    };
  }

  const subscriptionStatus = user.subscriptionStatus;

  // FREE users cannot use board at all
  if (subscriptionStatus === "FREE") {
    return {
      canUseBoard: false,
      reason: "Passez au plan PRO pour acceder au AI Board",
      monthlyAllocation: 0,
      usedThisMonth: 0,
      remainingMonthly: 0,
      extraCredits: 0,
      totalAvailable: 0,
      subscriptionStatus: "FREE",
      nextResetDate: getNextResetDate(),
    };
  }

  // Get or create credits record
  let credits = await prisma.userBoardCredits.findUnique({
    where: { userId },
  });

  // If no record exists, create one
  if (!credits) {
    const config = CREDITS_CONFIG[subscriptionStatus] ?? CREDITS_CONFIG.PRO;
    credits = await prisma.userBoardCredits.create({
      data: {
        userId,
        monthlyAllocation: config.monthlyAllocation,
        usedThisMonth: 0,
        extraCredits: 0,
        lastResetAt: new Date(),
      },
    });
  }

  // Check if we need to reset monthly credits
  const shouldReset = shouldResetMonthlyCredits(credits.lastResetAt);
  if (shouldReset) {
    const config = CREDITS_CONFIG[subscriptionStatus] ?? CREDITS_CONFIG.PRO;
    credits = await prisma.userBoardCredits.update({
      where: { userId },
      data: {
        monthlyAllocation: config.monthlyAllocation,
        usedThisMonth: 0,
        lastResetAt: new Date(),
      },
    });
  }

  const remainingMonthly = Math.max(0, credits.monthlyAllocation - credits.usedThisMonth);
  const totalAvailable = remainingMonthly + credits.extraCredits;

  return {
    canUseBoard: totalAvailable > 0,
    reason: totalAvailable === 0 ? "Plus de credits disponibles ce mois-ci" : undefined,
    monthlyAllocation: credits.monthlyAllocation,
    usedThisMonth: credits.usedThisMonth,
    remainingMonthly,
    extraCredits: credits.extraCredits,
    totalAvailable,
    subscriptionStatus,
    nextResetDate: getNextResetDate(),
  };
}

/**
 * Consume one credit from the user's allocation
 */
export async function consumeCredit(userId: string): Promise<ConsumeResult> {
  const status = await getCreditsStatus(userId);

  if (!status.canUseBoard) {
    return {
      success: false,
      creditsRemaining: 0,
      usedFrom: "monthly",
      error: status.reason ?? "Credits insuffisants",
    };
  }

  // Prefer monthly credits first, then extra
  let usedFrom: "monthly" | "extra" = "monthly";

  if (status.remainingMonthly > 0) {
    // Use monthly credit
    await prisma.userBoardCredits.update({
      where: { userId },
      data: {
        usedThisMonth: { increment: 1 },
      },
    });
    usedFrom = "monthly";
  } else {
    // Use extra credit
    await prisma.userBoardCredits.update({
      where: { userId },
      data: {
        extraCredits: { decrement: 1 },
      },
    });
    usedFrom = "extra";
  }

  return {
    success: true,
    creditsRemaining: status.totalAvailable - 1,
    usedFrom,
  };
}

/**
 * Add extra credits to a user (after purchase)
 */
export async function addExtraCredits(
  userId: string,
  credits: number
): Promise<{ newTotal: number }> {
  const result = await prisma.userBoardCredits.upsert({
    where: { userId },
    create: {
      userId,
      monthlyAllocation: 0,
      usedThisMonth: 0,
      extraCredits: credits,
    },
    update: {
      extraCredits: { increment: credits },
    },
  });

  return { newTotal: result.extraCredits };
}

/**
 * Refund a credit (if board failed)
 */
export async function refundCredit(userId: string): Promise<void> {
  // Get status to know where to refund
  const credits = await prisma.userBoardCredits.findUnique({
    where: { userId },
  });

  if (!credits) return;

  // If we used monthly credits this month, refund there
  if (credits.usedThisMonth > 0) {
    await prisma.userBoardCredits.update({
      where: { userId },
      data: {
        usedThisMonth: { decrement: 1 },
      },
    });
  } else {
    // Otherwise add to extra
    await prisma.userBoardCredits.update({
      where: { userId },
      data: {
        extraCredits: { increment: 1 },
      },
    });
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function shouldResetMonthlyCredits(lastResetAt: Date): boolean {
  const now = new Date();
  const lastReset = new Date(lastResetAt);

  // Reset if we're in a new month
  return (
    now.getMonth() !== lastReset.getMonth() ||
    now.getFullYear() !== lastReset.getFullYear()
  );
}

function getNextResetDate(): Date {
  const now = new Date();
  // First day of next month
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

// Export pricing constants for UI
export const BOARD_PRICING = {
  PRO_MONTHLY: 249, // EUR/month
  EXTRA_BOARD: 79, // EUR/board
  PRO_INCLUDED_BOARDS: 5,
} as const;
