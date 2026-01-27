import { prisma } from "@/lib/prisma";

// Limits configuration
// Use -1 to represent unlimited (Infinity is not a valid DB integer)
const UNLIMITED = -1;

const LIMITS_CONFIG = {
  FREE: {
    monthlyDeals: 5,
    maxTier: 1, // Only Tier 1
  },
  PRO: {
    monthlyDeals: UNLIMITED,
    maxTier: 3, // All tiers
  },
  ENTERPRISE: {
    monthlyDeals: UNLIMITED,
    maxTier: 3,
  },
} as const;

export type SubscriptionTier = keyof typeof LIMITS_CONFIG;
export type AnalysisTier = 1 | 2 | 3;

export interface DealUsageStatus {
  canAnalyze: boolean;
  reason?: string;

  // Limits
  monthlyLimit: number;
  usedThisMonth: number;
  remainingDeals: number;

  // Tier access
  maxTier: AnalysisTier;
  canUseTier: (tier: AnalysisTier) => boolean;

  // Subscription info
  subscriptionStatus: SubscriptionTier;
  isUnlimited: boolean;

  // Reset info
  nextResetDate: Date;

  // Analytics
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
}

export interface AnalyzePermission {
  allowed: boolean;
  reason?: string;
  upgradeRequired?: boolean;
  maxAllowedTier: AnalysisTier;
}

/**
 * Check if a user can analyze a deal at a specific tier
 */
export async function canAnalyzeDeal(
  userId: string,
  requestedTier: AnalysisTier = 1
): Promise<AnalyzePermission> {
  const status = await getUsageStatus(userId);

  // Check deal limit first
  if (!status.canAnalyze) {
    return {
      allowed: false,
      reason: status.reason,
      upgradeRequired: true,
      maxAllowedTier: status.maxTier,
    };
  }

  // Check tier access
  if (requestedTier > status.maxTier) {
    return {
      allowed: false,
      reason: `Tier ${requestedTier} requiert un abonnement PRO`,
      upgradeRequired: true,
      maxAllowedTier: status.maxTier,
    };
  }

  return {
    allowed: true,
    maxAllowedTier: status.maxTier,
  };
}

/**
 * Get the full usage status for a user
 */
export async function getUsageStatus(userId: string): Promise<DealUsageStatus> {
  // Get user subscription status
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionStatus: true },
  });

  if (!user) {
    return {
      canAnalyze: false,
      reason: "Utilisateur non trouve",
      monthlyLimit: 0,
      usedThisMonth: 0,
      remainingDeals: 0,
      maxTier: 1,
      canUseTier: () => false,
      subscriptionStatus: "FREE",
      isUnlimited: false,
      nextResetDate: getNextResetDate(),
      tier1Count: 0,
      tier2Count: 0,
      tier3Count: 0,
    };
  }

  const subscriptionStatus = user.subscriptionStatus as SubscriptionTier;
  const config = LIMITS_CONFIG[subscriptionStatus];

  // PRO/ENTERPRISE = unlimited
  const isUnlimited = config.monthlyDeals === UNLIMITED;
  if (isUnlimited) {
    // Still get/create usage for analytics
    const usage = await getOrCreateUsage(userId, config.monthlyDeals);

    return {
      canAnalyze: true,
      monthlyLimit: Infinity,
      usedThisMonth: usage.usedThisMonth,
      remainingDeals: Infinity,
      maxTier: config.maxTier as AnalysisTier,
      canUseTier: (tier) => tier <= config.maxTier,
      subscriptionStatus,
      isUnlimited: true,
      nextResetDate: getNextResetDate(),
      tier1Count: usage.tier1Count,
      tier2Count: usage.tier2Count,
      tier3Count: usage.tier3Count,
    };
  }

  // FREE tier - check limits
  let usage = await getOrCreateUsage(userId, config.monthlyDeals);

  // Check if we need to reset monthly usage
  if (shouldResetMonthlyUsage(usage.lastResetAt)) {
    usage = await prisma.userDealUsage.update({
      where: { userId },
      data: {
        usedThisMonth: 0,
        tier1Count: 0,
        tier2Count: 0,
        tier3Count: 0,
        lastResetAt: new Date(),
      },
    });
  }

  const remainingDeals = Math.max(0, config.monthlyDeals - usage.usedThisMonth);
  const canAnalyze = remainingDeals > 0;

  return {
    canAnalyze,
    reason: canAnalyze ? undefined : "Limite mensuelle atteinte (5 deals/mois)",
    monthlyLimit: config.monthlyDeals,
    usedThisMonth: usage.usedThisMonth,
    remainingDeals,
    maxTier: config.maxTier as AnalysisTier,
    canUseTier: (tier) => tier <= config.maxTier,
    subscriptionStatus,
    isUnlimited: false,
    nextResetDate: getNextResetDate(),
    tier1Count: usage.tier1Count,
    tier2Count: usage.tier2Count,
    tier3Count: usage.tier3Count,
  };
}

/**
 * Record a deal analysis (consumes from limit for FREE users)
 */
export async function recordDealAnalysis(
  userId: string,
  tier: AnalysisTier
): Promise<{ success: boolean; remainingDeals: number }> {
  const status = await getUsageStatus(userId);

  // PRO/ENTERPRISE - just record for analytics
  if (status.isUnlimited) {
    await prisma.userDealUsage.upsert({
      where: { userId },
      create: {
        userId,
        monthlyLimit: UNLIMITED,
        usedThisMonth: 1,
        tier1Count: tier >= 1 ? 1 : 0,
        tier2Count: tier >= 2 ? 1 : 0,
        tier3Count: tier >= 3 ? 1 : 0,
      },
      update: {
        usedThisMonth: { increment: 1 },
        tier1Count: tier >= 1 ? { increment: 1 } : undefined,
        tier2Count: tier >= 2 ? { increment: 1 } : undefined,
        tier3Count: tier >= 3 ? { increment: 1 } : undefined,
      },
    });

    return { success: true, remainingDeals: Infinity };
  }

  // FREE - check and consume
  if (!status.canAnalyze) {
    return { success: false, remainingDeals: 0 };
  }

  await prisma.userDealUsage.update({
    where: { userId },
    data: {
      usedThisMonth: { increment: 1 },
      tier1Count: tier >= 1 ? { increment: 1 } : undefined,
    },
  });

  return {
    success: true,
    remainingDeals: status.remainingDeals - 1,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getOrCreateUsage(userId: string, monthlyLimit: number) {
  let usage = await prisma.userDealUsage.findUnique({
    where: { userId },
  });

  if (!usage) {
    usage = await prisma.userDealUsage.create({
      data: {
        userId,
        monthlyLimit,
        usedThisMonth: 0,
      },
    });
  }

  return usage;
}

function shouldResetMonthlyUsage(lastResetAt: Date): boolean {
  const now = new Date();
  const lastReset = new Date(lastResetAt);

  return (
    now.getMonth() !== lastReset.getMonth() ||
    now.getFullYear() !== lastReset.getFullYear()
  );
}

function getNextResetDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

// Export pricing/limits for UI
export const FREE_TIER_LIMITS = {
  MONTHLY_DEALS: 5,
  MAX_TIER: 1,
} as const;

export const PRO_TIER_BENEFITS = {
  UNLIMITED_DEALS: true,
  MAX_TIER: 3,
  AI_BOARD_INCLUDED: 5,
  PRICE_MONTHLY: 249, // EUR
} as const;
