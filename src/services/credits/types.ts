// ═══════════════════════════════════════════════════════════════════════
// CREDIT SYSTEM - TYPES
// ═══════════════════════════════════════════════════════════════════════

export type CreditActionType =
  | 'INITIAL_ANALYSIS'
  | 'UPDATE_ANALYSIS'
  | 'AI_BOARD'
  | 'MONTHLY_RESET'
  | 'BONUS'
  | 'REFUND';

export const CREDIT_COSTS: Record<string, number> = {
  INITIAL_ANALYSIS: 5,
  UPDATE_ANALYSIS: 2,
  AI_BOARD: 10,
};

export interface UserCreditsInfo {
  userId: string;
  balance: number;
  monthlyAllocation: number;
  lastResetAt: Date;
  nextResetAt: Date;
  plan: 'FREE' | 'PRO';
}

export interface CreditTransactionRecord {
  id: string;
  userId: string;
  type: CreditActionType;
  amount: number;
  dealId?: string;
  analysisId?: string;
  description: string;
  createdAt: Date;
}

export type CanPerformReason = 'OK' | 'INSUFFICIENT_CREDITS' | 'UPGRADE_REQUIRED';

export interface CanPerformResult {
  allowed: boolean;
  reason: CanPerformReason;
  currentBalance?: number;
  cost?: number;
  resetsAt?: Date;
}

export interface RecordUsageOptions {
  dealId?: string;
  analysisId?: string;
  description?: string;
}
