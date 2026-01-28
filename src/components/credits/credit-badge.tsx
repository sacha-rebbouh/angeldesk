'use client';

import * as React from 'react';
import { Coins } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { UserCreditsInfo } from '@/services/credits/types';

interface CreditBadgeProps {
  className?: string;
}

export function CreditBadge({ className }: CreditBadgeProps) {
  const { data: credits, isLoading } = useQuery<UserCreditsInfo>({
    queryKey: ['credits'],
    queryFn: async () => {
      const response = await fetch('/api/credits');
      if (!response.ok) {
        throw new Error('Failed to fetch credits');
      }
      return response.json();
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Ne pas afficher pour les utilisateurs PRO
  if (credits?.plan === 'PRO') {
    return null;
  }

  // Loading state
  if (isLoading) {
    return (
      <div
        className={cn(
          'flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-sm',
          className
        )}
      >
        <Coins className="size-4 animate-pulse text-muted-foreground" />
        <span className="text-muted-foreground">...</span>
      </div>
    );
  }

  // Pas de donnees
  if (!credits) {
    return null;
  }

  const isLowBalance = credits.balance < 5;
  const resetDate = new Date(credits.nextResetAt);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'flex cursor-default items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
            isLowBalance
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
              : 'bg-muted text-foreground',
            className
          )}
          role="status"
          aria-label={`${credits.balance} credits restants`}
        >
          <Coins
            className={cn(
              'size-4',
              isLowBalance
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-muted-foreground'
            )}
          />
          <span>{credits.balance} credits</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end">
        <p>
          Reset le {format(resetDate, 'd MMMM', { locale: fr })}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
