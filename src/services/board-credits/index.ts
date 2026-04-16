import { checkCredits, deductCredits, refundCredits, getCreditBalance, CREDIT_COSTS } from "@/services/credits";

// ============================================================================
// BOARD CREDITS — Now uses unified credit system
// ============================================================================

export interface BoardCreditsStatus {
  canUseBoard: boolean;
  reason?: string;
  // Legacy fields
  monthlyAllocation: number;
  usedThisMonth: number;
  remainingMonthly: number;
  extraCredits: number;
  totalAvailable: number;
  subscriptionStatus: "FREE" | "PRO" | "ENTERPRISE";
  nextResetDate: Date;
  // New fields
  creditBalance: number;
  creditCost: number;
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
  const result = await checkCredits(userId, 'AI_BOARD');
  const balance = await getCreditBalance(userId);

  return {
    canUseBoard: result.allowed,
    reason: result.allowed ? undefined : `Crédits insuffisants (${result.balance} disponibles, ${CREDIT_COSTS.AI_BOARD} requis)`,
    creditBalance: result.balance,
    creditCost: CREDIT_COSTS.AI_BOARD,
    // Legacy fields
    monthlyAllocation: 999,
    usedThisMonth: 0,
    remainingMonthly: result.balance,
    extraCredits: 0,
    totalAvailable: result.balance,
    subscriptionStatus: balance.totalPurchased > 0 ? "PRO" : "FREE",
    nextResetDate: balance.expiresAt ?? new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
  };
}

/**
 * Consume credits for a board session
 */
export async function consumeCredit(userId: string): Promise<ConsumeResult> {
  const result = await deductCredits(userId, 'AI_BOARD');

  return {
    success: result.success,
    creditsRemaining: result.balanceAfter,
    usedFrom: "monthly",
    error: result.error,
  };
}

/**
 * Add extra credits (legacy — now use addCredits from credit service)
 */
export async function addExtraCredits(): Promise<{ newTotal: number }> {
  // Legacy — individual board credit purchases are replaced by pack purchases
  console.warn('[BoardCredits] addExtraCredits is deprecated. Use addCredits() from credit service.');
  return { newTotal: 0 };
}

/**
 * Refund a credit (if board failed).
 * P1 — passe un idempotencyKey scope par sessionId (ou timestamp minute) pour
 * eviter les double-refunds silencieux mais aussi les blocages d'ancien refund
 * deja enregistre.
 */
export async function refundCredit(userId: string, sessionId?: string): Promise<void> {
  const idempotencyKey = sessionId
    ? `refund:AI_BOARD:session:${sessionId}`
    : `refund:AI_BOARD:user:${userId}:${Math.floor(Date.now() / 60_000)}`;
  await refundCredits(userId, 'AI_BOARD', undefined, { idempotencyKey });
}

// Legacy export
export const BOARD_PRICING = {
  PRO_MONTHLY: 0, // Credit-based now
  EXTRA_BOARD: CREDIT_COSTS.AI_BOARD,
  PRO_INCLUDED_BOARDS: 999,
} as const;
