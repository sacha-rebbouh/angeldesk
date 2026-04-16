// New credit system
export {
  checkCredits,
  deductCredits,
  deductCreditAmount,
  addCredits,
  grantFreeCredits,
  refundCredits,
  refundCreditAmount,
  getCreditBalance,
  // Legacy compatibility
  checkQuota,
  getUserQuotaInfo,
  recordUsage,
} from './usage-gate';

// Feature access gating (backend enforcement of paid feature unlocks)
export {
  canAccessFeature,
  assertFeatureAccess,
  FeatureAccessError,
  serializeFeatureAccessError,
} from './feature-access';
export type {
  FeatureKey,
  FeatureAccessResult,
} from './feature-access';

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
