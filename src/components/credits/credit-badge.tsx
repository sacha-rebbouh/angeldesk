'use client';

import { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

import { cn } from '@/lib/utils';
import { queryKeys } from '@/lib/query-keys';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface UserQuotaInfo {
  plan: 'FREE' | 'PRO';
  analyses: { used: number; limit: number };
  boards: { used: number; limit: number };
  availableTiers: string[];
  resetsAt: string;
}

interface QuotaBadgeProps {
  className?: string;
}

export function CreditBadge({ className }: QuotaBadgeProps) {
  const { data: quota, isLoading } = useQuery<UserQuotaInfo>({
    queryKey: queryKeys.quota.all,
    queryFn: async () => {
      const response = await fetch('/api/credits');
      if (!response.ok) throw new Error('Failed to fetch quota');
      const json = await response.json();
      return json.data;
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const isLow = useMemo(() => {
    if (!quota) return false;
    return quota.analyses.limit - quota.analyses.used <= 1;
  }, [quota]);

  // PRO users: simple badge
  if (quota?.plan === 'PRO') {
    return (
      <div className={cn(
        'flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1.5 text-sm font-medium text-primary',
        className
      )}>
        PRO
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={cn(
        'flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-sm',
        className
      )}>
        <BarChart3 className="size-4 animate-pulse text-muted-foreground" />
        <span className="text-muted-foreground">...</span>
      </div>
    );
  }

  if (!quota) return null;

  const remaining = quota.analyses.limit - quota.analyses.used;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'flex cursor-default items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
            isLow
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
              : 'bg-muted text-foreground',
            className
          )}
          role="status"
          aria-label={`${remaining} analyses restantes`}
        >
          <BarChart3 className={cn('size-4', isLow ? 'text-amber-600' : 'text-muted-foreground')} />
          <span>{remaining}/{quota.analyses.limit} analyses</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end">
        <p>
          Reset le {format(new Date(quota.resetsAt), 'd MMMM', { locale: fr })}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
