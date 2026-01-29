// ============================================================================
// QUOTA SYSTEM - Simple usage limits (replaces credit system)
// ============================================================================

export type PlanType = 'FREE' | 'PRO';

export interface PlanLimits {
  analysesPerMonth: number;
  updatesPerDeal: number; // -1 = unlimited
  boardsPerMonth: number;
  tiers: ('TIER_1' | 'SYNTHESIS' | 'TIER_2' | 'TIER_3')[];
  extraBoardPrice: number | null; // EUR, null = not available
}

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  FREE: {
    analysesPerMonth: 3,
    updatesPerDeal: 2,
    boardsPerMonth: 0,
    tiers: ['TIER_1', 'SYNTHESIS'],
    extraBoardPrice: null,
  },
  PRO: {
    analysesPerMonth: 20,
    updatesPerDeal: -1, // unlimited
    boardsPerMonth: 5,
    tiers: ['TIER_1', 'TIER_2', 'TIER_3', 'SYNTHESIS'],
    extraBoardPrice: 59,
  },
};

export type QuotaAction = 'ANALYSIS' | 'UPDATE' | 'BOARD';

export interface QuotaCheckResult {
  allowed: boolean;
  reason: 'OK' | 'LIMIT_REACHED' | 'UPGRADE_REQUIRED' | 'TIER_LOCKED';
  current: number;
  limit: number; // -1 = unlimited
  plan: PlanType;
}

export interface UserQuotaInfo {
  plan: PlanType;
  analyses: { used: number; limit: number };
  boards: { used: number; limit: number };
  availableTiers: string[];
  resetsAt: Date;
}
