import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import type { CreditAction } from '@prisma/client';
import {
  CREDIT_COSTS,
  CREDIT_RULES,
  FREE_TIER,
  type CreditActionType,
  type CreditCheckResult,
  type CreditBalanceInfo,
} from './types';

// ============================================================================
// CREDIT GATE — Enforces credit-based usage limits
// ============================================================================

/**
 * Check if user has enough credits for an action
 */
export async function checkCredits(
  userId: string,
  action: CreditActionType
): Promise<CreditCheckResult> {
  const cost = CREDIT_COSTS[action];

  // Free actions always allowed
  if (cost === 0) {
    return { allowed: true, reason: 'OK', balance: 0, cost: 0, balanceAfter: 0 };
  }

  const balanceRecord = await getOrCreateBalance(userId);

  // Check expiry
  if (balanceRecord.expiresAt && new Date() > balanceRecord.expiresAt) {
    // Credits expired — set balance to 0
    await expireCredits(userId, balanceRecord.balance);
    return {
      allowed: false,
      reason: 'INSUFFICIENT_CREDITS',
      balance: 0,
      cost,
      balanceAfter: 0,
    };
  }

  const allowed = balanceRecord.balance >= cost;

  return {
    allowed,
    reason: allowed ? 'OK' : 'INSUFFICIENT_CREDITS',
    balance: balanceRecord.balance,
    cost,
    balanceAfter: allowed ? balanceRecord.balance - cost : balanceRecord.balance,
  };
}

/**
 * Deduct credits for an action (atomic transaction)
 */
export async function deductCredits(
  userId: string,
  action: CreditActionType,
  dealId?: string
): Promise<{ success: boolean; balanceAfter: number; error?: string }> {
  const cost = CREDIT_COSTS[action];
  return deductCreditAmount(userId, action, cost, { dealId });
}

export interface CreditDeductionContext {
  dealId?: string;
  documentId?: string;
  documentExtractionRunId?: string;
  pageNumber?: number;
  idempotencyKey?: string;
  description?: string;
}

/**
 * Deduct an explicit credit amount for variable-cost operations.
 * This is used for extraction because the billable primitive is page-level.
 */
export async function deductCreditAmount(
  userId: string,
  action: CreditActionType,
  cost: number,
  context: CreditDeductionContext = {}
): Promise<{ success: boolean; balanceAfter: number; error?: string; alreadyDeducted?: boolean }> {
  // Free actions — no deduction needed
  if (cost === 0) {
    return { success: true, balanceAfter: 0 };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (context.idempotencyKey) {
        const existing = await tx.creditTransaction.findUnique({
          where: { idempotencyKey: context.idempotencyKey },
          select: { balanceAfter: true },
        });
        if (existing) {
          return { success: true, balanceAfter: existing.balanceAfter, alreadyDeducted: true };
        }
      }

      const balance = await tx.userCreditBalance.findUnique({
        where: { userId },
      });

      if (!balance) {
        return { success: false, balanceAfter: 0, error: 'Compte crédits non trouvé' };
      }

      // Check expiry
      if (balance.expiresAt && new Date() > balance.expiresAt) {
        return { success: false, balanceAfter: 0, error: 'Crédits expirés' };
      }

      if (balance.balance < cost) {
        return {
          success: false,
          balanceAfter: balance.balance,
          error: `Crédits insuffisants (${balance.balance} disponibles, ${cost} requis)`,
        };
      }

      // Atomic deduction with optimistic locking
      const updated = await tx.userCreditBalance.updateMany({
        where: {
          userId,
          balance: { gte: cost },
        },
        data: {
          balance: { decrement: cost },
        },
      });

      if (updated.count === 0) {
        return { success: false, balanceAfter: balance.balance, error: 'Concurrence détectée' };
      }

      const newBalance = balance.balance - cost;

      // Log the transaction
      await tx.creditTransaction.create({
        data: {
          userId,
          amount: -cost,
          balanceAfter: newBalance,
          action: action as CreditAction,
          description: context.description ?? getActionDescription(action),
          dealId: context.dealId ?? null,
          documentId: context.documentId ?? null,
          documentExtractionRunId: context.documentExtractionRunId ?? null,
          pageNumber: context.pageNumber ?? null,
          idempotencyKey: context.idempotencyKey ?? null,
        },
      });

      return { success: true, balanceAfter: newBalance };
    });

    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    if (msg.includes('does not exist')) {
      if (process.env.NODE_ENV === 'production') {
        logger.error({ userId, action, cost }, 'Credits tables not available in PRODUCTION — blocking action');
        return { success: false, balanceAfter: 0, error: 'Système de crédits indisponible' };
      }
      logger.warn({ userId, action, cost }, 'Credits tables not available — allowing action (dev only)');
      return { success: true, balanceAfter: 9999 };
    }
    logger.error({ err: error, userId, action, cost }, 'deductCreditAmount transaction failed');
    return { success: false, balanceAfter: 0, error: 'Erreur lors de la déduction' };
  }
}

/**
 * Add credits from a pack purchase.
 * On auto-refill, enforces rollover cap: balance cannot exceed 2x the pack size.
 * Manual purchases have no cap.
 */
export async function addCredits(
  userId: string,
  packName: string,
  credits: number,
  stripePaymentId?: string,
  isAutoRefill = false
): Promise<{ success: boolean; newBalance: number }> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      let effectiveCredits = credits;

      // Enforce rollover cap only on auto-refill
      if (isAutoRefill) {
        const existing = await tx.userCreditBalance.findUnique({ where: { userId } });
        const currentBalance = existing?.balance ?? 0;
        const maxBalance = credits * CREDIT_RULES.rolloverMax;
        effectiveCredits = Math.min(credits, Math.max(0, maxBalance - currentBalance));
      }

      const balance = await tx.userCreditBalance.upsert({
        where: { userId },
        create: {
          userId,
          balance: effectiveCredits,
          totalPurchased: credits,
          lastPackName: packName,
          freeCreditsGranted: false,
          expiresAt: getExpiryDate(),
        },
        update: {
          balance: { increment: effectiveCredits },
          totalPurchased: { increment: credits },
          lastPackName: packName,
          expiresAt: getExpiryDate(), // Reset expiry on new purchase
        },
      });

      // Log the transaction
      await tx.creditTransaction.create({
        data: {
          userId,
          amount: credits,
          balanceAfter: balance.balance,
          action: 'PURCHASE',
          description: `Achat pack ${packName}`,
          packName,
          stripePaymentId: stripePaymentId ?? null,
        },
      });

      return { success: true, newBalance: balance.balance };
    });

    return result;
  } catch (error) {
    logger.error({ err: error, userId }, 'addCredits failed');
    return { success: false, newBalance: 0 };
  }
}

/**
 * Grant free credits at signup (1 Deep Dive = 5 credits)
 */
export async function grantFreeCredits(userId: string): Promise<boolean> {
  try {
    const existing = await prisma.userCreditBalance.findUnique({
      where: { userId },
    });

    if (existing?.freeCreditsGranted) {
      return false; // Already granted
    }

    const credits = FREE_TIER.initialCredits;

    await prisma.$transaction(async (tx) => {
      await tx.userCreditBalance.upsert({
        where: { userId },
        create: {
          userId,
          balance: credits,
          totalPurchased: 0,
          freeCreditsGranted: true,
          expiresAt: getExpiryDate(),
        },
        update: {
          balance: { increment: credits },
          freeCreditsGranted: true,
          expiresAt: getExpiryDate(),
        },
      });

      await tx.creditTransaction.create({
        data: {
          userId,
          amount: credits,
          balanceAfter: credits,
          action: 'FREE_GRANT',
          description: '1 Deep Dive offert (inscription)',
        },
      });
    });

    return true;
  } catch (error) {
    logger.error({ err: error, userId }, 'grantFreeCredits failed');
    return false;
  }
}

/**
 * Refund credits for a failed action.
 *
 * P1 — Idempotence fine: l'ancienne cle `(userId, dealId, action='REFUND')`
 * bloquait tout refund ulterieur sur le MEME deal meme si plusieurs analyses
 * echouaient (cas resumable qui re-fail). On utilise maintenant un
 * idempotencyKey scope precis (analysisId si dispo, sinon dealId + timestamp
 * arrondi a la minute pour absorber les doubles clics).
 */
export async function refundCredits(
  userId: string,
  action: CreditActionType,
  dealId?: string,
  options?: { analysisId?: string; idempotencyKey?: string }
): Promise<void> {
  const cost = CREDIT_COSTS[action];
  if (cost === 0) return;

  const scopedKey = options?.idempotencyKey
    ?? (options?.analysisId
        ? `refund:${action}:analysis:${options.analysisId}`
        : dealId
          ? `refund:${action}:deal:${dealId}:${Math.floor(Date.now() / 60_000)}`
          : undefined);

  try {
    await prisma.$transaction(async (tx) => {
      if (scopedKey) {
        const existing = await tx.creditTransaction.findUnique({
          where: { idempotencyKey: scopedKey },
          select: { id: true },
        });
        if (existing) {
          logger.warn({ userId, dealId, action, scopedKey }, 'Refund idempotency hit — skipping');
          return;
        }
      }

      const updated = await tx.userCreditBalance.update({
        where: { userId },
        data: {
          balance: { increment: cost },
        },
      });

      await tx.creditTransaction.create({
        data: {
          userId,
          amount: cost,
          balanceAfter: updated.balance,
          action: 'REFUND',
          description: `Remboursement ${getActionDescription(action)}`,
          dealId: dealId ?? null,
          idempotencyKey: scopedKey ?? null,
        },
      });
    });
  } catch (error) {
    logger.error({ err: error, userId, action, dealId }, 'refundCredits failed');
  }
}

/**
 * Refund d'un montant arbitraire avec idempotence cle-a-cle.
 * Utilise pour les deltas d'extraction (pre-estime surestime vs reel) ou pour
 * rembourser seulement une fraction du coût initial.
 */
export async function refundCreditAmount(
  userId: string,
  action: CreditActionType,
  credits: number,
  context: CreditDeductionContext = {}
): Promise<{ success: boolean; balanceAfter: number; alreadyRefunded?: boolean; error?: string }> {
  const amount = Math.max(0, Math.floor(credits));
  if (amount === 0) {
    return { success: true, balanceAfter: 0 };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (context.idempotencyKey) {
        const existing = await tx.creditTransaction.findUnique({
          where: { idempotencyKey: context.idempotencyKey },
          select: { balanceAfter: true },
        });
        if (existing) {
          return { success: true, balanceAfter: existing.balanceAfter, alreadyRefunded: true };
        }
      }

      const updated = await tx.userCreditBalance.update({
        where: { userId },
        data: { balance: { increment: amount } },
      });

      await tx.creditTransaction.create({
        data: {
          userId,
          amount,
          balanceAfter: updated.balance,
          action: 'REFUND',
          description: context.description ?? `Remboursement ${getActionDescription(action)}`,
          dealId: context.dealId ?? null,
          documentId: context.documentId ?? null,
          documentExtractionRunId: context.documentExtractionRunId ?? null,
          pageNumber: context.pageNumber ?? null,
          idempotencyKey: context.idempotencyKey ?? null,
        },
      });

      return { success: true, balanceAfter: updated.balance };
    });

    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown refund error';
    logger.error({ err: error, userId, action, credits: amount }, 'refundCreditAmount failed');
    return { success: false, balanceAfter: 0, error: msg };
  }
}

/**
 * Get user's credit balance info
 */
export async function getCreditBalance(userId: string): Promise<CreditBalanceInfo> {
  const balance = await getOrCreateBalance(userId);

  return {
    balance: balance.balance,
    totalPurchased: balance.totalPurchased,
    lastPackName: balance.lastPackName,
    autoRefill: balance.autoRefill,
    expiresAt: balance.expiresAt,
    freeCreditsGranted: balance.freeCreditsGranted,
  };
}

// ============================================================================
// BACKWARD COMPATIBILITY — Maps old quota API to new credit system
// These functions maintain the same interface for callers that haven't migrated
// ============================================================================

/**
 * Legacy: Check if user can perform an action (maps to checkCredits)
 */
export async function checkQuota(
  userId: string,
  action: 'ANALYSIS' | 'UPDATE' | 'BOARD'
): Promise<{ allowed: boolean; reason: string; current: number; limit: number; plan: string }> {
  const creditAction = mapLegacyAction(action);
  const result = await checkCredits(userId, creditAction);

  return {
    allowed: result.allowed,
    reason: result.reason === 'OK' ? 'OK' : 'LIMIT_REACHED',
    current: result.balance,
    limit: result.balance, // No fixed limit in credit system
    plan: 'CREDITS',
  };
}

/**
 * Legacy: Record a usage event (maps to deductCredits)
 */
export async function recordUsage(
  userId: string,
  action: 'ANALYSIS' | 'UPDATE' | 'BOARD'
): Promise<void> {
  const creditAction = mapLegacyAction(action);
  await deductCredits(userId, creditAction);
}

/**
 * Legacy: Get user quota info
 */
export async function getUserQuotaInfo(
  userId: string
) {
  const balance = await getCreditBalance(userId);
  return {
    plan: 'CREDITS' as const,
    analyses: { used: 0, limit: balance.balance },
    boards: { used: 0, limit: balance.balance >= CREDIT_COSTS.AI_BOARD ? 999 : 0 },
    availableTiers: ['TIER_1', 'TIER_2', 'TIER_3', 'SYNTHESIS'],
    resetsAt: balance.expiresAt ?? new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    // New fields
    creditBalance: balance.balance,
    totalPurchased: balance.totalPurchased,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

async function getOrCreateBalance(userId: string) {
  try {
    let balance = await prisma.userCreditBalance.findUnique({
      where: { userId },
    });

    if (!balance) {
      balance = await prisma.userCreditBalance.create({
        data: {
          userId,
          balance: 0,
          totalPurchased: 0,
          freeCreditsGranted: false,
        },
      });
    }

    return balance;
  } catch {
    if (process.env.NODE_ENV === 'production') {
      logger.error({ userId }, 'Credit tables not available in PRODUCTION');
      throw new Error('Credit tables not available');
    }
    logger.warn({ userId }, 'Credit tables not available — returning unlimited balance (dev only)');
    return {
      userId,
      balance: 9999,
      totalPurchased: 9999,
      lastPackName: null,
      freeCreditsGranted: true,
      autoRefill: false,
      autoRefillPackName: null,
      expiresAt: null,
    };
  }
}

async function expireCredits(userId: string, currentBalance: number) {
  if (currentBalance <= 0) return;

  await prisma.$transaction(async (tx) => {
    await tx.userCreditBalance.update({
      where: { userId },
      data: { balance: 0 },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        amount: -currentBalance,
        balanceAfter: 0,
        action: 'EXPIRED',
        description: `${currentBalance} crédits expirés`,
      },
    });
  });
}

function getExpiryDate(): Date {
  const date = new Date();
  date.setMonth(date.getMonth() + CREDIT_RULES.expiryMonths);
  return date;
}

function getActionDescription(action: CreditActionType): string {
  const descriptions: Record<CreditActionType, string> = {
    QUICK_SCAN: 'Quick Scan (DEPRECATED — tier retire)',
    DEEP_DIVE: 'Deep Dive (Tier 0.5 thesis + Tier 1+2+3 + reconciler)',
    AI_BOARD: 'AI Board (4 LLMs + round thesis)',
    LIVE_COACHING: 'Live Coaching',
    RE_ANALYSIS: 'Re-analyse',
    THESIS_REBUTTAL: 'Thesis rebuttal (action BA one-shot)',
    THESIS_REEXTRACT: 'Thesis re-extraction (auto sur nouveau doc)',
    EXTRACTION_STANDARD_PAGE: 'Extraction standard page',
    EXTRACTION_HIGH_PAGE: 'Extraction high fidelity page',
    EXTRACTION_SUPREME_PAGE: 'Extraction supreme page',
    CHAT: 'Chat IA',
    PDF_EXPORT: 'Export PDF',
  };
  return descriptions[action];
}

function mapLegacyAction(action: 'ANALYSIS' | 'UPDATE' | 'BOARD'): CreditActionType {
  switch (action) {
    case 'ANALYSIS': return 'DEEP_DIVE';
    case 'UPDATE': return 'RE_ANALYSIS';
    case 'BOARD': return 'AI_BOARD';
  }
}
