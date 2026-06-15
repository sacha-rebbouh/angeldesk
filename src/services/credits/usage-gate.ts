import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { Prisma } from '@prisma/client';
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
 * Check if user has enough credits for an action.
 *
 * Projection lazy reset : si la fenêtre free a expiré (freeResetStartedAt + 7j < now),
 * on projette mentalement balanceFree = weeklyAllowance (10) SANS écrire en DB.
 * L'écriture du reset se fera lors du prochain deductCreditAmount.
 *
 * `balance` retourné = total disponible (free + paid).
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

  // Check expiry sur le paid uniquement (free n'expire pas, il reset hebdo)
  if (balanceRecord.expiresAt && new Date() > balanceRecord.expiresAt) {
    await expireCredits(userId, balanceRecord.balance);
    // Après expiry du paid, totalAvailable = balanceFree projeté
    const projectedFree = projectBalanceFree(balanceRecord);
    const allowed = projectedFree >= cost;
    return {
      allowed,
      reason: allowed ? 'OK' : 'INSUFFICIENT_CREDITS',
      balance: projectedFree,
      cost,
      balanceAfter: allowed ? projectedFree - cost : projectedFree,
    };
  }

  const projectedFree = projectBalanceFree(balanceRecord);
  const totalAvailable = balanceRecord.balance + projectedFree;
  const allowed = totalAvailable >= cost;

  return {
    allowed,
    reason: allowed ? 'OK' : 'INSUFFICIENT_CREDITS',
    balance: totalAvailable,
    cost,
    balanceAfter: allowed ? totalAvailable - cost : totalAvailable,
  };
}

/**
 * Deduct credits for an action (atomic transaction)
 */
export async function deductCredits(
  userId: string,
  action: CreditActionType,
  dealId?: string,
  context: Pick<CreditDeductionContext, "idempotencyKey" | "description"> = {}
): Promise<{ success: boolean; balanceAfter: number; error?: string; alreadyDeducted?: boolean }> {
  const cost = CREDIT_COSTS[action];
  return deductCreditAmount(userId, action, cost, {
    dealId,
    idempotencyKey: context.idempotencyKey,
    description: context.description,
  });
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
 *
 * Doctrine "free hebdo Option B" (depuis 2026-05-29) :
 *   Le free hebdo (10cr/7j use-it-or-lose-it) est réservé aux users qui n'ont jamais
 *   acheté (totalPurchased === 0). Dès le 1er pack acheté, l'user "sort" du free et
 *   vit uniquement sur son balance paid. Empêche cannibalisation des packs.
 *
 * Algo (doctrine money-touching errors.md 2026-03-12 CREDITS) :
 *   1. Idempotency check via UNIQUE constraint sur CreditTransaction.idempotencyKey
 *   2. Read balance, check expiry sur le paid uniquement
 *   3. Si totalPurchased > 0 (acheteur) → SKIP free totalement, deduct = 100% paid
 *   4. Sinon (non-acheteur, free actif) :
 *      a. Lazy reset si freeResetStartedAt + 7j < now → updateMany WHERE = $oldValue
 *      b. Compute split : freeUsed = min(balanceFree, cost), paidUsed = cost - freeUsed
 *      c. Démarre la fenêtre si freeUsed > 0 ET freeResetStartedAt était null
 *   5. Update atomique avec optimistic locking sur (balanceFree, balance, freeResetStartedAt)
 *   6. Log transaction avec balanceAfter = newPaid + newFree (TOTAL)
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

      let balance = await tx.userCreditBalance.findUnique({
        where: { userId },
      });

      if (!balance) {
        return { success: false, balanceAfter: 0, error: 'Compte crédits non trouvé' };
      }

      // Check expiry sur le paid uniquement
      if (balance.expiresAt && new Date() > balance.expiresAt) {
        return { success: false, balanceAfter: balance.balanceFree, error: 'Crédits expirés' };
      }

      const now = new Date();

      // Option B : si l'user a déjà acheté, le free hebdo ne s'applique pas
      const isPaidUser = balance.totalPurchased > 0;

      // Lazy reset (uniquement pour les non-acheteurs)
      if (!isPaidUser) {
        const needsReset =
          balance.freeResetStartedAt !== null &&
          now.getTime() - balance.freeResetStartedAt.getTime() >= FREE_TIER.windowDurationMs;

        if (needsReset && balance.freeResetStartedAt) {
          const resetUpdate = await tx.userCreditBalance.updateMany({
            where: { userId, freeResetStartedAt: balance.freeResetStartedAt },
            data: { balanceFree: FREE_TIER.weeklyAllowance, freeResetStartedAt: null },
          });
          if (resetUpdate.count === 0) {
            balance = await tx.userCreditBalance.findUnique({ where: { userId } });
            if (!balance) {
              return { success: false, balanceAfter: 0, error: 'Compte crédits non trouvé' };
            }
          } else {
            balance = { ...balance, balanceFree: FREE_TIER.weeklyAllowance, freeResetStartedAt: null };
          }
        }
      }

      // Compute split selon le statut de l'user
      // - Acheteur (Option B) : 100% paid, free ignoré
      // - Non-acheteur : free d'abord, puis paid (théoriquement balance=0 mais safe)
      const effectiveFree = isPaidUser ? 0 : balance.balanceFree;
      const freeUsed = Math.min(effectiveFree, cost);
      const paidUsed = cost - freeUsed;
      const totalAvailable = effectiveFree + balance.balance;

      if (totalAvailable < cost) {
        return {
          success: false,
          balanceAfter: totalAvailable,
          error: `Crédits insuffisants (${totalAvailable} disponibles, ${cost} requis)`,
        };
      }

      // Démarre la fenêtre uniquement pour les non-acheteurs au 1er deduct du free
      const shouldStartWindow = !isPaidUser && balance.freeResetStartedAt === null && freeUsed > 0;
      const newFreeResetStartedAt = shouldStartWindow ? now : balance.freeResetStartedAt;

      // Update atomique avec optimistic locking
      const updated = await tx.userCreditBalance.updateMany({
        where: {
          userId,
          balanceFree: { gte: freeUsed },
          balance: { gte: paidUsed },
          freeResetStartedAt: balance.freeResetStartedAt,
        },
        data: {
          balanceFree: { decrement: freeUsed },
          balance: { decrement: paidUsed },
          freeResetStartedAt: newFreeResetStartedAt,
        },
      });

      if (updated.count === 0) {
        return { success: false, balanceAfter: totalAvailable, error: 'Concurrence détectée' };
      }

      const newPaid = balance.balance - paidUsed;
      const newFree = balance.balanceFree - freeUsed;
      // Option B : pour un purchaser, balanceAfter = newPaid only (le free n'est pas
      // exposé à l'user). Pour un non-purchaser, balanceAfter = newPaid + newFree.
      const balanceAfter = isPaidUser ? newPaid : newPaid + newFree;

      // Log la transaction avec le split exact (pour refund pro-rata futur)
      await tx.creditTransaction.create({
        data: {
          userId,
          amount: -cost,
          freeAmount: -freeUsed,
          paidAmount: -paidUsed,
          balanceAfter,
          action: action as CreditAction,
          description: context.description ?? getActionDescription(action),
          dealId: context.dealId ?? null,
          documentId: context.documentId ?? null,
          documentExtractionRunId: context.documentExtractionRunId ?? null,
          pageNumber: context.pageNumber ?? null,
          idempotencyKey: context.idempotencyKey ?? null,
        },
      });

      return { success: true, balanceAfter };
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
 *
 * `idempotencyKey` est OBLIGATOIRE : il réutilise la contrainte UNIQUE
 * `CreditTransaction.idempotencyKey` pour empêcher tout double-crédit sur retry
 * (webhook Stripe rejoué, double soumission). Indispensable AVANT tout câblage
 * Stripe. Un appel avec une clé déjà vue est un no-op idempotent
 * (`alreadyAdded: true`, balance inchangée).
 */
export async function addCredits(
  userId: string,
  packName: string,
  credits: number,
  idempotencyKey: string,
  stripePaymentId?: string,
  isAutoRefill = false
): Promise<{ success: boolean; newBalance: number; alreadyAdded?: boolean }> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Idempotence : une clé déjà enregistrée = crédit déjà appliqué → no-op.
      // La contrainte UNIQUE sur idempotencyKey reste le backstop contre la
      // course concurrente (le perdant throw P2002 → catch externe, jamais de
      // double-crédit).
      const existing = await tx.creditTransaction.findUnique({
        where: { idempotencyKey },
        select: { balanceAfter: true },
      });
      if (existing) {
        return { success: true, newBalance: existing.balanceAfter, alreadyAdded: true };
      }

      let effectiveCredits = credits;

      // Enforce rollover cap only on auto-refill
      if (isAutoRefill) {
        const existing = await tx.userCreditBalance.findUnique({ where: { userId } });
        const currentBalance = existing?.balance ?? 0;
        const maxBalance = credits * CREDIT_RULES.rolloverMax;
        effectiveCredits = Math.min(credits, Math.max(0, maxBalance - currentBalance));
      }

      // Option B : dès qu'un user achète, il "sort" du free hebdo →
      // balanceFree = 0 + freeResetStartedAt = null à la création ET à l'update.
      const balance = await tx.userCreditBalance.upsert({
        where: { userId },
        create: {
          userId,
          balance: effectiveCredits,
          totalPurchased: credits,
          lastPackName: packName,
          expiresAt: getExpiryDate(),
          balanceFree: 0, // purchaser dès le départ
          freeResetStartedAt: null,
        },
        update: {
          balance: { increment: effectiveCredits },
          totalPurchased: { increment: credits },
          lastPackName: packName,
          expiresAt: getExpiryDate(),
          balanceFree: 0, // reset si l'user passait de non-purchaser à purchaser
          freeResetStartedAt: null,
        },
      });

      // Log la transaction (paidAmount = +credits, freeAmount = 0)
      await tx.creditTransaction.create({
        data: {
          userId,
          amount: credits,
          freeAmount: 0,
          paidAmount: credits,
          balanceAfter: balance.balance,
          action: 'PURCHASE',
          description: `Achat pack ${packName}`,
          packName,
          stripePaymentId: stripePaymentId ?? null,
          idempotencyKey,
        },
      });

      return { success: true, newBalance: balance.balance };
    });

    return result;
  } catch (error) {
    // Course concurrente même clé : le perdant prend un P2002 sur la contrainte
    // UNIQUE idempotencyKey (le gagnant a déjà crédité). On renvoie un succès
    // idempotent (re-lecture de la transaction du gagnant), pas une erreur
    // transitoire — cohérent avec le contrat « clé déjà vue = no-op ».
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await prisma.creditTransaction.findUnique({
        where: { idempotencyKey },
        select: { balanceAfter: true },
      });
      if (existing) {
        return { success: true, newBalance: existing.balanceAfter, alreadyAdded: true };
      }
    }
    logger.error({ err: error, userId }, 'addCredits failed');
    return { success: false, newBalance: 0 };
  }
}

/**
 * Initialise la row UserCreditBalance au signup.
 *
 * Le free tier hebdo (10 crédits, fenêtre 7j use-it-or-lose-it) est appliqué
 * automatiquement par le DEFAULT 10 sur balanceFree dans le schema.
 * Si la row existe déjà : no-op (return false).
 *
 * Le timer de la fenêtre démarre au 1er deduct du free, pas au signup.
 */
export async function grantFreeCredits(userId: string): Promise<boolean> {
  try {
    const existing = await prisma.userCreditBalance.findUnique({
      where: { userId },
    });

    if (existing) {
      return false; // Row déjà initialisée — pas de double grant
    }

    await prisma.$transaction(async (tx) => {
      await tx.userCreditBalance.create({
        data: {
          userId,
          balance: 0, // pas de paid au signup
          totalPurchased: 0,
          // balanceFree = 10 et freeResetStartedAt = null via schema default
        },
      });

      await tx.creditTransaction.create({
        data: {
          userId,
          amount: FREE_TIER.weeklyAllowance,
          freeAmount: FREE_TIER.weeklyAllowance,
          paidAmount: 0,
          balanceAfter: FREE_TIER.weeklyAllowance,
          action: 'FREE_GRANT',
          description: `${FREE_TIER.weeklyAllowance} crédits free hebdomadaires (inscription)`,
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
 * Doctrine Option B-strict : pas de mix free/paid possible au moment d'un deduct
 * (purchaser → 100% paid, non-purchaser → 100% free). Donc le refund cible le
 * même pot : crédite en `balance` paid si purchaser, en `balanceFree` si non-purchaser.
 *
 * Idempotence : scopedKey scope précis (analysisId si dispo, sinon dealId
 * + timestamp arrondi à la minute pour absorber les doubles clics).
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

      const balance = await tx.userCreditBalance.findUnique({
        where: { userId },
        select: { totalPurchased: true },
      });
      const creditToFree = !balance || balance.totalPurchased === 0;

      const updated = await tx.userCreditBalance.update({
        where: { userId },
        data: creditToFree
          ? { balanceFree: { increment: cost } }
          : { balance: { increment: cost } },
      });

      const exposedBalance = updated.totalPurchased > 0
        ? updated.balance
        : updated.balance + updated.balanceFree;

      await tx.creditTransaction.create({
        data: {
          userId,
          amount: cost,
          freeAmount: creditToFree ? cost : 0,
          paidAmount: creditToFree ? 0 : cost,
          balanceAfter: exposedBalance,
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

      // Option B-strict : crédite en free pour non-purchaser, en paid pour purchaser
      const existingBalance = await tx.userCreditBalance.findUnique({
        where: { userId },
        select: { totalPurchased: true },
      });
      const creditToFree = !existingBalance || existingBalance.totalPurchased === 0;

      const updated = await tx.userCreditBalance.update({
        where: { userId },
        data: creditToFree
          ? { balanceFree: { increment: amount } }
          : { balance: { increment: amount } },
      });

      const exposedBalance = updated.totalPurchased > 0
        ? updated.balance
        : updated.balance + updated.balanceFree;

      await tx.creditTransaction.create({
        data: {
          userId,
          amount,
          freeAmount: creditToFree ? amount : 0,
          paidAmount: creditToFree ? 0 : amount,
          balanceAfter: exposedBalance,
          action: 'REFUND',
          description: context.description ?? `Remboursement ${getActionDescription(action)}`,
          dealId: context.dealId ?? null,
          documentId: context.documentId ?? null,
          documentExtractionRunId: context.documentExtractionRunId ?? null,
          pageNumber: context.pageNumber ?? null,
          idempotencyKey: context.idempotencyKey ?? null,
        },
      });

      return { success: true, balanceAfter: exposedBalance };
    });

    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown refund error';
    logger.error({ err: error, userId, action, credits: amount }, 'refundCreditAmount failed');
    return { success: false, balanceAfter: 0, error: msg };
  }
}

/**
 * Get user's credit balance info.
 *
 * Projection lazy reset : si la fenêtre free a expiré, balanceFree projeté = 10
 * (la vraie écriture en DB se fait au prochain deductCreditAmount).
 *
 * totalAvailable = balance + balanceFree (projeté). nextFreeResetAt = freeResetStartedAt + 7j.
 */
export async function getCreditBalance(userId: string): Promise<CreditBalanceInfo> {
  const balance = await getOrCreateBalance(userId);

  // Option B : acheteur → free totalement masqué (0, pas de timer)
  const isPaidUser = balance.totalPurchased > 0;
  const projectedFree = projectBalanceFree(balance);

  const projectedReset = isPaidUser
    ? null
    : balance.freeResetStartedAt !== null &&
      new Date().getTime() - balance.freeResetStartedAt.getTime() >= FREE_TIER.windowDurationMs
      ? null
      : balance.freeResetStartedAt;
  const nextFreeResetAt = projectedReset
    ? new Date(projectedReset.getTime() + FREE_TIER.windowDurationMs)
    : null;

  return {
    balance: balance.balance,
    balanceFree: projectedFree,
    totalAvailable: balance.balance + projectedFree,
    totalPurchased: balance.totalPurchased,
    lastPackName: balance.lastPackName,
    autoRefill: balance.autoRefill,
    expiresAt: balance.expiresAt,
    freeResetStartedAt: projectedReset,
    nextFreeResetAt,
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
          // balanceFree=10 + freeResetStartedAt=null via schema default
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
      id: 'dev-fallback',
      userId,
      balance: 9999,
      balanceFree: 9999,
      freeResetStartedAt: null,
      totalPurchased: 9999,
      lastPackName: null,
      autoRefill: false,
      autoRefillPackName: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

/**
 * Projection mentale du balanceFree post-reset (si la fenêtre a expiré).
 * Pas d'écriture en DB — le reset réel se fait lors du prochain deductCreditAmount.
 *
 * Option B : si l'user est acheteur (totalPurchased > 0), il ne bénéficie plus du free
 * hebdo — on retourne 0 quoi qu'il arrive.
 */
function projectBalanceFree(balance: {
  balanceFree: number;
  freeResetStartedAt: Date | null;
  totalPurchased: number;
}): number {
  if (balance.totalPurchased > 0) {
    return 0;
  }
  if (
    balance.freeResetStartedAt !== null &&
    new Date().getTime() - balance.freeResetStartedAt.getTime() >= FREE_TIER.windowDurationMs
  ) {
    return FREE_TIER.weeklyAllowance;
  }
  return balance.balanceFree;
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
