import { prisma } from '@/lib/prisma';
import { PLAN_LIMITS, type PlanType, type QuotaAction, type QuotaCheckResult, type UserQuotaInfo } from './types';

// ============================================================================
// QUOTA GATE - Enforces usage limits based on plan
// ============================================================================

/**
 * Get user's current plan based on subscription status
 */
function getPlanType(subscriptionStatus: string): PlanType {
  return subscriptionStatus === 'PRO' || subscriptionStatus === 'ENTERPRISE'
    ? 'PRO'
    : 'FREE';
}

/**
 * Check if user can perform an action
 */
export async function checkQuota(
  userId: string,
  subscriptionStatus: string,
  action: QuotaAction,
  dealId?: string
): Promise<QuotaCheckResult> {
  const plan = getPlanType(subscriptionStatus);
  const limits = PLAN_LIMITS[plan];

  // Get or create usage record
  const usage = await getOrCreateUsage(userId);

  // Check monthly reset
  const now = new Date();
  if (now >= usage.lastResetAt && shouldReset(usage.lastResetAt)) {
    await resetMonthlyUsage(userId);
    // Re-fetch after reset
    const refreshed = await getOrCreateUsage(userId);
    return checkAction(refreshed, action, limits, plan, dealId);
  }

  return checkAction(usage, action, limits, plan, dealId);
}

async function checkAction(
  usage: { usedThisMonth: number; tier1Count: number; tier2Count: number; tier3Count: number; id: string },
  action: QuotaAction,
  limits: typeof PLAN_LIMITS['FREE'],
  plan: PlanType,
  dealId?: string
): Promise<QuotaCheckResult> {
  switch (action) {
    case 'ANALYSIS': {
      return {
        allowed: usage.tier1Count < limits.analysesPerMonth,
        reason: usage.tier1Count >= limits.analysesPerMonth ? 'LIMIT_REACHED' : 'OK',
        current: usage.tier1Count,
        limit: limits.analysesPerMonth,
        plan,
      };
    }
    case 'UPDATE': {
      if (limits.updatesPerDeal === -1) {
        return { allowed: true, reason: 'OK', current: 0, limit: -1, plan };
      }
      if (!dealId) {
        return { allowed: false, reason: 'LIMIT_REACHED', current: 0, limit: limits.updatesPerDeal, plan };
      }
      // Count updates for this specific deal this month
      const updateCount = await prisma.analysis.count({
        where: {
          dealId,
          type: 'FULL_DD',
          status: 'COMPLETED',
          createdAt: { gte: getMonthStart() },
        },
      });
      // First analysis doesn't count as update
      const updates = Math.max(0, updateCount - 1);
      return {
        allowed: updates < limits.updatesPerDeal,
        reason: updates >= limits.updatesPerDeal ? 'LIMIT_REACHED' : 'OK',
        current: updates,
        limit: limits.updatesPerDeal,
        plan,
      };
    }
    case 'BOARD': {
      if (limits.boardsPerMonth === 0) {
        return { allowed: false, reason: 'UPGRADE_REQUIRED', current: 0, limit: 0, plan };
      }
      const boardCount = await prisma.aIBoardSession.count({
        where: {
          userId: usage.id,
          status: 'COMPLETED',
          createdAt: { gte: getMonthStart() },
        },
      });
      return {
        allowed: boardCount < limits.boardsPerMonth,
        reason: boardCount >= limits.boardsPerMonth ? 'LIMIT_REACHED' : 'OK',
        current: boardCount,
        limit: limits.boardsPerMonth,
        plan,
      };
    }
  }
}

/**
 * Get user quota info for display
 */
export async function getUserQuotaInfo(
  userId: string,
  subscriptionStatus: string
): Promise<UserQuotaInfo> {
  const plan = getPlanType(subscriptionStatus);
  const limits = PLAN_LIMITS[plan];
  const usage = await getOrCreateUsage(userId);

  // Check monthly reset
  const now = new Date();
  if (now >= usage.lastResetAt && shouldReset(usage.lastResetAt)) {
    await resetMonthlyUsage(userId);
  }

  const boardCount = await prisma.aIBoardSession.count({
    where: {
      userId,
      status: 'COMPLETED',
      createdAt: { gte: getMonthStart() },
    },
  });

  const nextReset = getNextMonthStart();

  return {
    plan,
    analyses: { used: usage.tier1Count, limit: limits.analysesPerMonth },
    boards: { used: boardCount, limit: limits.boardsPerMonth },
    availableTiers: limits.tiers,
    resetsAt: nextReset,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

async function getOrCreateUsage(userId: string) {
  const existing = await prisma.userDealUsage.findUnique({
    where: { userId },
  });

  if (existing) return existing;

  return prisma.userDealUsage.create({
    data: {
      userId,
      monthlyLimit: 3,
      usedThisMonth: 0,
      tier1Count: 0,
      tier2Count: 0,
      tier3Count: 0,
      lastResetAt: new Date(),
    },
  });
}

async function resetMonthlyUsage(userId: string) {
  await prisma.userDealUsage.update({
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

function shouldReset(lastResetAt: Date): boolean {
  const now = new Date();
  const monthStart = getMonthStart();
  return lastResetAt < monthStart && now >= monthStart;
}

function getMonthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function getNextMonthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

/**
 * Record a usage event (increment counters)
 */
export async function recordUsage(
  userId: string,
  action: QuotaAction
): Promise<void> {
  const usage = await getOrCreateUsage(userId);

  const updateData: Record<string, number> = {
    usedThisMonth: usage.usedThisMonth + 1,
  };

  if (action === 'ANALYSIS') {
    updateData.tier1Count = usage.tier1Count + 1;
  }

  await prisma.userDealUsage.update({
    where: { userId },
    data: updateData,
  });
}
