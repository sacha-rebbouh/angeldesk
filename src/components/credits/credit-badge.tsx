'use client';

import { useMemo, useState, memo, useCallback } from 'react';
import { Coins, Zap, Search, Users, RefreshCw, ChevronDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { cn } from '@/lib/utils';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { CreditPurchaseModal } from '@/components/credits/credit-purchase-modal';
import type { CreditBalanceInfo } from '@/services/credits/types';

interface CreditApiResponse {
  data: CreditBalanceInfo & {
    costs: Record<string, number>;
    packs: Array<{ name: string; displayName: string; credits: number; priceEur: number }>;
  };
}

interface CreditBadgeProps {
  className?: string;
}

const ACTION_DISPLAY = [
  { key: 'QUICK_SCAN', label: 'Quick Scan', icon: Zap },
  { key: 'DEEP_DIVE', label: 'Deep Dive', icon: Search },
  { key: 'AI_BOARD', label: 'AI Board', icon: Users },
  { key: 'RE_ANALYSIS', label: 'Re-analyse', icon: RefreshCw },
] as const;

export const CreditBadge = memo(function CreditBadge({ className }: CreditBadgeProps) {
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);

  const { data, isLoading } = useQuery<CreditApiResponse>({
    queryKey: queryKeys.quota.all,
    queryFn: async () => {
      const response = await fetch('/api/credits');
      if (!response.ok) throw new Error('Failed to fetch credits');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const creditInfo = data?.data;
  const balance = creditInfo?.balance ?? 0;
  const costs = creditInfo?.costs;

  const colorClass = useMemo(() => {
    if (balance < 1) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    if (balance < 5) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    return 'bg-muted text-foreground';
  }, [balance]);

  const handleOpenPurchase = useCallback(() => setShowPurchaseModal(true), []);
  const handleClosePurchase = useCallback(() => setShowPurchaseModal(false), []);

  if (isLoading) {
    return (
      <div className={cn(
        'flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-sm',
        className,
      )}>
        <Coins className="size-4 animate-pulse text-muted-foreground" />
        <span className="text-muted-foreground">...</span>
      </div>
    );
  }

  if (!creditInfo) return null;

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <button
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors hover:opacity-80',
              colorClass,
              className,
            )}
            aria-label={`${balance} crédits disponibles`}
          >
            <Coins className="size-4" />
            <span>{balance} crédit{balance !== 1 ? 's' : ''}</span>
            <ChevronDown className="size-3 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="end" className="w-56 p-0">
          <div className="p-3 border-b">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Coûts par action
            </div>
          </div>
          <div className="p-2 space-y-0.5">
            {costs && ACTION_DISPLAY.map(({ key, label, icon: Icon }) => {
              const cost = costs[key];
              if (cost === undefined || cost === 0) return null;
              const canAfford = balance >= cost;
              return (
                <div
                  key={key}
                  className={cn(
                    'flex items-center justify-between rounded-md px-2 py-1.5 text-sm',
                    !canAfford && 'opacity-50',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="size-3.5 text-muted-foreground" />
                    <span>{label}</span>
                  </div>
                  <span className="font-medium text-muted-foreground">
                    {cost} cr
                  </span>
                </div>
              );
            })}
          </div>
          <div className="p-2 border-t">
            <Button
              size="sm"
              variant="default"
              className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
              onClick={handleOpenPurchase}
            >
              <Coins className="mr-2 size-3.5" />
              Acheter des crédits
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <CreditPurchaseModal
        isOpen={showPurchaseModal}
        onClose={handleClosePurchase}
        balance={balance}
        totalPurchased={creditInfo.totalPurchased ?? 0}
      />
    </>
  );
});
