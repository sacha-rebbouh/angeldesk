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
 * Uses atomic transaction to prevent race conditions
 */
export async function consumeCredit(userId: string): Promise<ConsumeResult> {
  try {
    // Use a transaction to atomically check and consume credits
    const result = await prisma.$transaction(async (tx) => {
      // Get current credits with row-level lock (SELECT FOR UPDATE)
      const credits = await tx.userBoardCredits.findUnique({
        where: { userId },
      });

      if (!credits) {
        return {
          success: false,
          creditsRemaining: 0,
          usedFrom: "monthly" as const,
          error: "Credits non initialises",
        };
      }

      // Check if monthly reset is needed
      const shouldReset = shouldResetMonthlyCredits(credits.lastResetAt);
      if (shouldReset) {
        // Get user subscription to know allocation
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { subscriptionStatus: true },
        });
        const subStatus = user?.subscriptionStatus ?? "PRO";
        const config = CREDITS_CONFIG[subStatus] ?? CREDITS_CONFIG.PRO;

        // Reset monthly credits atomically
        await tx.userBoardCredits.update({
          where: { userId },
          data: {
            monthlyAllocation: config.monthlyAllocation,
            usedThisMonth: 0,
            lastResetAt: new Date(),
          },
        });

        // Recalculate after reset
        const remainingMonthly = config.monthlyAllocation;
        const totalAvailable = remainingMonthly + credits.extraCredits;

        if (totalAvailable <= 0) {
          return {
            success: false,
            creditsRemaining: 0,
            usedFrom: "monthly" as const,
            error: "Plus de credits disponibles",
          };
        }

        // Consume from monthly
        await tx.userBoardCredits.update({
          where: { userId },
          data: { usedThisMonth: 1 },
        });

        return {
          success: true,
          creditsRemaining: totalAvailable - 1,
          usedFrom: "monthly" as const,
        };
      }

      // Calculate available credits
      const remainingMonthly = Math.max(0, credits.monthlyAllocation - credits.usedThisMonth);
      const totalAvailable = remainingMonthly + credits.extraCredits;

      if (totalAvailable <= 0) {
        return {
          success: false,
          creditsRemaining: 0,
          usedFrom: "monthly" as const,
          error: "Plus de credits disponibles ce mois-ci",
        };
      }

      // Consume credit atomically - prefer monthly first
      let usedFrom: "monthly" | "extra" = "monthly";

      if (remainingMonthly > 0) {
        // Atomic increment with condition check
        const updated = await tx.userBoardCredits.updateMany({
          where: {
            userId,
            // Ensure we still have credits (prevents race condition)
            usedThisMonth: { lt: credits.monthlyAllocation },
          },
          data: {
            usedThisMonth: { increment: 1 },
          },
        });

        if (updated.count === 0) {
          // Race condition: credits were consumed by another request
          return {
            success: false,
            creditsRemaining: 0,
            usedFrom: "monthly" as const,
            error: "Credits deja consommes (concurrent request)",
          };
        }
        usedFrom = "monthly";
      } else {
        // Use extra credits
        const updated = await tx.userBoardCredits.updateMany({
          where: {
            userId,
            extraCredits: { gt: 0 },
          },
          data: {
            extraCredits: { decrement: 1 },
          },
        });

        if (updated.count === 0) {
          return {
            success: false,
            creditsRemaining: 0,
            usedFrom: "extra" as const,
            error: "Credits extra deja consommes",
          };
        }
        usedFrom = "extra";
      }

      return {
        success: true,
        creditsRemaining: totalAvailable - 1,
        usedFrom,
      };
    });

    return result;
  } catch (error) {
    console.error("[BoardCredits] consumeCredit transaction failed:", error);
    return {
      success: false,
      creditsRemaining: 0,
      usedFrom: "monthly",
      error: "Erreur lors de la consommation du credit",
    };
  }
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
