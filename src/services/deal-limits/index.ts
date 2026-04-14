import { checkCredits, deductCredits, getCreditBalance, type CreditActionType } from "@/services/credits";
import { CREDIT_COSTS, getActionForAnalysisType } from "@/services/credits/types";

// ============================================================================
// DEAL LIMITS — Credit-based (replaces old monthly quota system)
// ============================================================================

export type SubscriptionTier = 'FREE' | 'PRO' | 'ENTERPRISE';
export type AnalysisTier = 1 | 2 | 3;

export interface DealUsageStatus {
  canAnalyze: boolean;
  reason?: string;

  // Credit info
  creditBalance: number;
  totalPurchased: number;

  // Tier access — with credits, all tiers are available
  maxTier: AnalysisTier;
  canUseTier: (tier: AnalysisTier) => boolean;

  // Legacy fields for backward compat
  monthlyLimit: number;
  usedThisMonth: number;
  remainingDeals: number;
  subscriptionStatus: SubscriptionTier;
  isUnlimited: boolean;
  nextResetDate: Date;
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
}

export interface AnalyzePermission {
  allowed: boolean;
  reason?: string;
  upgradeRequired?: boolean;
  maxAllowedTier: AnalysisTier;
  creditCost?: number;
}

/**
 * Check if a user can analyze a deal at a specific tier
 */
export async function canAnalyzeDeal(
  userId: string,
  requestedTier: AnalysisTier = 1
): Promise<AnalyzePermission> {
  // Map tier to credit action
  const action: CreditActionType = requestedTier <= 1 ? 'QUICK_SCAN' : 'DEEP_DIVE';
  const result = await checkCredits(userId, action);

  if (!result.allowed) {
    return {
      allowed: false,
      reason: `Crédits insuffisants (${result.balance} disponibles, ${result.cost} requis)`,
      upgradeRequired: true,
      maxAllowedTier: 3, // All tiers available with credits
      creditCost: result.cost,
    };
  }

  return {
    allowed: true,
    maxAllowedTier: 3,
    creditCost: result.cost,
  };
}

/**
 * Get the full usage status for a user
 */
export async function getUsageStatus(userId: string): Promise<DealUsageStatus> {
  const balance = await getCreditBalance(userId);

  return {
    canAnalyze: balance.balance >= CREDIT_COSTS.QUICK_SCAN,
    reason: balance.balance < CREDIT_COSTS.QUICK_SCAN ? "Crédits insuffisants" : undefined,
    creditBalance: balance.balance,
    totalPurchased: balance.totalPurchased,
    maxTier: 3,
    canUseTier: (tier: AnalysisTier) => balance.balance >= (tier <= 1 ? CREDIT_COSTS.QUICK_SCAN : CREDIT_COSTS.DEEP_DIVE),
    // Legacy fields
    monthlyLimit: balance.balance,
    usedThisMonth: 0,
    remainingDeals: balance.balance,
    subscriptionStatus: balance.totalPurchased > 0 ? 'PRO' : 'FREE',
    isUnlimited: false,
    nextResetDate: balance.expiresAt ?? new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    tier1Count: 0,
    tier2Count: 0,
    tier3Count: 0,
  };
}

/**
 * Record a deal analysis — deducts credits
 */
export async function recordDealAnalysis(
  userId: string,
  tier: AnalysisTier,
  dealId?: string,
  analysisType?: string
): Promise<{ success: boolean; remainingDeals: number }> {
  // Determine credit action from analysis type or tier
  let action: CreditActionType;
  if (analysisType) {
    action = getActionForAnalysisType(analysisType);
  } else {
    action = tier <= 1 ? 'QUICK_SCAN' : 'DEEP_DIVE';
  }

  const result = await deductCredits(userId, action, dealId);

  return {
    success: result.success,
    remainingDeals: result.balanceAfter,
  };
}

// Legacy exports for backward compatibility
export const FREE_TIER_LIMITS = {
  MONTHLY_DEALS: 999,
  MAX_TIER: 3,
} as const;

export const PRO_TIER_BENEFITS = {
  UNLIMITED_DEALS: true,
  MAX_TIER: 3,
  AI_BOARD_INCLUDED: 999,
  PRICE_MONTHLY: 0, // Credit-based now
} as const;
