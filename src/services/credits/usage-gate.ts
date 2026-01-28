// ═══════════════════════════════════════════════════════════════════════
// USAGE GATE - Credit System Access Control
// ═══════════════════════════════════════════════════════════════════════

import { prisma } from '@/lib/prisma';
import {
  CreditActionType,
  CREDIT_COSTS,
  UserCreditsInfo,
  CreditTransactionRecord,
  CanPerformResult,
  RecordUsageOptions,
} from './types';

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Check if a user has PRO subscription
 * For now, checks the User model's subscriptionStatus field
 */
async function isProUser(userId: string): Promise<boolean> {
  // Allow override via env var for testing
  if (process.env.FORCE_PRO_USER === 'true') {
    return true;
  }

  const user = await prisma.user.findFirst({
    where: { clerkId: userId },
    select: { subscriptionStatus: true },
  });

  return user?.subscriptionStatus === 'PRO' || user?.subscriptionStatus === 'ENTERPRISE';
}

/**
 * Get the cost of a credit action
 */
function getActionCost(action: CreditActionType): number {
  return CREDIT_COSTS[action] ?? 0;
}

/**
 * Calculate the next reset date (30 days from now)
 */
function calculateNextResetDate(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date;
}

/**
 * Get description for a credit action
 */
function getActionDescription(action: CreditActionType, metadata?: RecordUsageOptions): string {
  switch (action) {
    case 'INITIAL_ANALYSIS':
      return metadata?.dealId
        ? `Initial analysis for deal ${metadata.dealId}`
        : 'Initial deal analysis';
    case 'UPDATE_ANALYSIS':
      return metadata?.dealId
        ? `Update analysis for deal ${metadata.dealId}`
        : 'Deal analysis update';
    case 'AI_BOARD':
      return metadata?.dealId
        ? `AI Board session for deal ${metadata.dealId}`
        : 'AI Board session';
    case 'MONTHLY_RESET':
      return 'Monthly credit reset';
    case 'BONUS':
      return metadata?.description ?? 'Bonus credits';
    case 'REFUND':
      return metadata?.description ?? 'Credit refund';
    default:
      return metadata?.description ?? 'Credit transaction';
  }
}

// ═══════════════════════════════════════════════════════════════════════
// USAGE GATE CLASS
// ═══════════════════════════════════════════════════════════════════════

export class UsageGate {
  /**
   * Check if user can perform a credit-consuming action
   * PRO users always allowed, FREE users check balance vs cost
   */
  async canPerform(userId: string, action: CreditActionType): Promise<CanPerformResult> {
    // PRO users bypass credit checks
    const isPro = await isProUser(userId);
    if (isPro) {
      return {
        allowed: true,
        reason: 'OK',
      };
    }

    // Get or create user credits
    const credits = await this.getOrCreateUserCredits(userId);

    // Check for reset
    await this.checkAndResetCredits(userId);

    // Re-fetch after potential reset
    const updatedCredits = await this.getOrCreateUserCredits(userId);
    const cost = getActionCost(action);

    if (updatedCredits.balance >= cost) {
      return {
        allowed: true,
        reason: 'OK',
        currentBalance: updatedCredits.balance,
        cost,
        resetsAt: updatedCredits.nextResetAt,
      };
    }

    return {
      allowed: false,
      reason: 'INSUFFICIENT_CREDITS',
      currentBalance: updatedCredits.balance,
      cost,
      resetsAt: updatedCredits.nextResetAt,
    };
  }

  /**
   * Record a credit usage (atomic transaction)
   * Decrements balance and creates a CreditTransaction record
   */
  async recordUsage(
    userId: string,
    action: CreditActionType,
    metadata?: RecordUsageOptions
  ): Promise<void> {
    // PRO users don't consume credits
    const isPro = await isProUser(userId);
    if (isPro) {
      // Still log the transaction for tracking purposes
      await prisma.creditTransaction.create({
        data: {
          clerkUserId: userId,
          type: action,
          amount: 0, // PRO users don't consume credits
          dealId: metadata?.dealId,
          analysisId: metadata?.analysisId,
          description: `[PRO] ${getActionDescription(action, metadata)}`,
        },
      });
      return;
    }

    const cost = getActionCost(action);
    if (cost === 0) {
      return; // No cost, nothing to record
    }

    // Atomic transaction: decrement balance + create transaction
    await prisma.$transaction(async (tx) => {
      // Get current balance
      const userCredits = await tx.userCredits.findUnique({
        where: { clerkUserId: userId },
      });

      if (!userCredits) {
        throw new Error(`UserCredits not found for user ${userId}`);
      }

      // Prevent negative balance
      if (userCredits.balance < cost) {
        throw new Error(
          `Insufficient credits: balance=${userCredits.balance}, cost=${cost}`
        );
      }

      // Decrement balance
      await tx.userCredits.update({
        where: { clerkUserId: userId },
        data: {
          balance: {
            decrement: cost,
          },
        },
      });

      // Create transaction record
      await tx.creditTransaction.create({
        data: {
          clerkUserId: userId,
          type: action,
          amount: -cost, // Negative for consumption
          dealId: metadata?.dealId,
          analysisId: metadata?.analysisId,
          description: getActionDescription(action, metadata),
        },
      });
    });
  }

  /**
   * Get or create user credits
   * If new user: create with balance=10, nextResetAt=+30 days
   */
  async getOrCreateUserCredits(userId: string): Promise<UserCreditsInfo> {
    const isPro = await isProUser(userId);

    // Try to find existing credits
    let userCredits = await prisma.userCredits.findUnique({
      where: { clerkUserId: userId },
    });

    // Create if not exists
    if (!userCredits) {
      const nextResetAt = calculateNextResetDate();

      userCredits = await prisma.userCredits.create({
        data: {
          clerkUserId: userId,
          balance: 10,
          monthlyAllocation: 10,
          lastResetAt: new Date(),
          nextResetAt,
        },
      });
    }

    return {
      userId: userCredits.clerkUserId,
      balance: userCredits.balance,
      monthlyAllocation: userCredits.monthlyAllocation,
      lastResetAt: userCredits.lastResetAt,
      nextResetAt: userCredits.nextResetAt,
      plan: isPro ? 'PRO' : 'FREE',
    };
  }

  /**
   * Check and reset credits if the reset date has passed
   * If now > nextResetAt: reset balance to monthlyAllocation
   */
  async checkAndResetCredits(userId: string): Promise<void> {
    const userCredits = await prisma.userCredits.findUnique({
      where: { clerkUserId: userId },
    });

    if (!userCredits) {
      return; // Will be created on first getOrCreateUserCredits call
    }

    const now = new Date();
    if (now < userCredits.nextResetAt) {
      return; // Not time to reset yet
    }

    // Perform reset atomically
    await prisma.$transaction(async (tx) => {
      // Double-check inside transaction to avoid race conditions
      const current = await tx.userCredits.findUnique({
        where: { clerkUserId: userId },
      });

      if (!current || now < current.nextResetAt) {
        return; // Already reset by another process
      }

      const newNextResetAt = calculateNextResetDate();

      // Reset balance
      await tx.userCredits.update({
        where: { clerkUserId: userId },
        data: {
          balance: current.monthlyAllocation,
          lastResetAt: now,
          nextResetAt: newNextResetAt,
        },
      });

      // Log the reset transaction
      await tx.creditTransaction.create({
        data: {
          clerkUserId: userId,
          type: 'MONTHLY_RESET',
          amount: current.monthlyAllocation, // Positive: credits added
          description: `Monthly reset: ${current.monthlyAllocation} credits`,
        },
      });
    });
  }

  /**
   * Add bonus credits (promo, compensation, etc.)
   */
  async addBonusCredits(
    userId: string,
    amount: number,
    description: string
  ): Promise<void> {
    if (amount <= 0) {
      throw new Error('Bonus amount must be positive');
    }

    await prisma.$transaction(async (tx) => {
      // Ensure user credits exist
      const userCredits = await tx.userCredits.findUnique({
        where: { clerkUserId: userId },
      });

      if (!userCredits) {
        // Create with bonus included
        const nextResetAt = calculateNextResetDate();
        await tx.userCredits.create({
          data: {
            clerkUserId: userId,
            balance: 10 + amount, // Default + bonus
            monthlyAllocation: 10,
            lastResetAt: new Date(),
            nextResetAt,
          },
        });
      } else {
        // Add to existing balance
        await tx.userCredits.update({
          where: { clerkUserId: userId },
          data: {
            balance: {
              increment: amount,
            },
          },
        });
      }

      // Log the bonus transaction
      await tx.creditTransaction.create({
        data: {
          clerkUserId: userId,
          type: 'BONUS',
          amount, // Positive: credits added
          description,
        },
      });
    });
  }

  /**
   * Refund credits (e.g., failed analysis)
   */
  async refundCredits(
    userId: string,
    amount: number,
    description: string,
    metadata?: { dealId?: string; analysisId?: string }
  ): Promise<void> {
    if (amount <= 0) {
      throw new Error('Refund amount must be positive');
    }

    await prisma.$transaction(async (tx) => {
      // Add credits back
      await tx.userCredits.update({
        where: { clerkUserId: userId },
        data: {
          balance: {
            increment: amount,
          },
        },
      });

      // Log the refund transaction
      await tx.creditTransaction.create({
        data: {
          clerkUserId: userId,
          type: 'REFUND',
          amount, // Positive: credits added back
          dealId: metadata?.dealId,
          analysisId: metadata?.analysisId,
          description,
        },
      });
    });
  }

  /**
   * Get transaction history for a user
   */
  async getTransactionHistory(
    userId: string,
    limit: number = 50
  ): Promise<CreditTransactionRecord[]> {
    const transactions = await prisma.creditTransaction.findMany({
      where: { clerkUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return transactions.map((t) => ({
      id: t.id,
      userId: t.clerkUserId,
      type: t.type as CreditActionType,
      amount: t.amount,
      dealId: t.dealId ?? undefined,
      analysisId: t.analysisId ?? undefined,
      description: t.description,
      createdAt: t.createdAt,
    }));
  }

  /**
   * Get current balance for a user (quick check)
   */
  async getBalance(userId: string): Promise<number> {
    const credits = await this.getOrCreateUserCredits(userId);
    return credits.balance;
  }

  /**
   * Check if user has enough credits for an action (without side effects)
   */
  async hasEnoughCredits(userId: string, action: CreditActionType): Promise<boolean> {
    const result = await this.canPerform(userId, action);
    return result.allowed;
  }
}

// Singleton instance
export const usageGate = new UsageGate();
