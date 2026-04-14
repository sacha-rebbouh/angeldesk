// New credit system
export {
  checkCredits,
  deductCredits,
  addCredits,
  grantFreeCredits,
  refundCredits,
  getCreditBalance,
  // Legacy compatibility
  checkQuota,
  getUserQuotaInfo,
  recordUsage,
} from './usage-gate';

export type {
  CreditActionType,
  CreditCheckResult,
  CreditBalanceInfo,
  CreditPackConfig,
} from './types';

export {
  CREDIT_COSTS,
  CREDIT_PACKS,
  CREDIT_RULES,
  FREE_TIER,
  FEATURE_ACCESS,
  FULL_DEAL_PACKAGE_CREDITS,
  getActionForAnalysisType,
} from './types';
