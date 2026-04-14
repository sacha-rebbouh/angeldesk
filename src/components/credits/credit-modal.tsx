'use client';

import { memo } from 'react';
import { CreditPurchaseModal } from '@/components/credits/credit-purchase-modal';
import { CREDIT_COSTS, type CreditActionType } from '@/services/credits/types';

const ACTION_LABELS: Record<string, string> = {
  ANALYSIS: 'Lancer une analyse',
  UPDATE: 'Mettre à jour l\'analyse',
  BOARD: 'Consulter l\'AI Board',
  QUICK_SCAN: 'Quick Scan',
  DEEP_DIVE: 'Deep Dive',
  AI_BOARD: 'AI Board',
  RE_ANALYSIS: 'Re-analyse',
  LIVE_COACHING: 'Live Coaching',
};

// Map legacy actions to credit actions
function resolveAction(action: string): CreditActionType {
  switch (action) {
    case 'ANALYSIS': return 'DEEP_DIVE';
    case 'UPDATE': return 'RE_ANALYSIS';
    case 'BOARD': return 'AI_BOARD';
    default: return action as CreditActionType;
  }
}

interface CreditModalProps {
  isOpen: boolean;
  onClose: () => void;
  action: string;
  balance?: number;
  totalPurchased?: number;
}

/**
 * CreditModal — Wrapper around CreditPurchaseModal for backward compatibility.
 * Shows the purchase modal with the cost of the attempted action.
 */
export const CreditModal = memo(function CreditModal({
  isOpen,
  onClose,
  action,
  balance = 0,
  totalPurchased = 0,
}: CreditModalProps) {
  const creditAction = resolveAction(action);
  const cost = CREDIT_COSTS[creditAction] ?? 0;

  return (
    <CreditPurchaseModal
      isOpen={isOpen}
      onClose={onClose}
      balance={balance}
      totalPurchased={totalPurchased}
      requiredCredits={cost}
      actionLabel={ACTION_LABELS[action] ?? ACTION_LABELS[creditAction] ?? action}
    />
  );
});
