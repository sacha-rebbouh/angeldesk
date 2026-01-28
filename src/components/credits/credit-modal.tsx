'use client';

import * as React from 'react';
import { Coins, AlertTriangle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import Link from 'next/link';

import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { CreditActionType } from '@/services/credits/types';

interface CreditModalProps {
  isOpen: boolean;
  onClose: () => void;
  action: Extract<CreditActionType, 'INITIAL_ANALYSIS' | 'UPDATE_ANALYSIS' | 'AI_BOARD'>;
  cost: number;
  balance: number;
  resetsAt?: Date;
  onConfirm: () => void;
  isLoading?: boolean;
}

const ACTION_LABELS: Record<CreditModalProps['action'], string> = {
  INITIAL_ANALYSIS: 'Lancer une analyse',
  UPDATE_ANALYSIS: 'Mettre a jour l\'analyse',
  AI_BOARD: 'Consulter l\'AI Board',
};

export function CreditModal({
  isOpen,
  onClose,
  action,
  cost,
  balance,
  resetsAt,
  onConfirm,
  isLoading = false,
}: CreditModalProps) {
  const hasEnoughCredits = balance >= cost;
  const balanceAfter = balance - cost;

  const handleConfirm = React.useCallback(() => {
    if (hasEnoughCredits && !isLoading) {
      onConfirm();
    }
  }, [hasEnoughCredits, isLoading, onConfirm]);

  // Sufficient credits UI
  if (hasEnoughCredits) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="size-5 text-primary" />
              Cette action utilise {cost} credit{cost > 1 ? 's' : ''}
            </DialogTitle>
            <DialogDescription>
              {ACTION_LABELS[action]}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            <div className="flex items-center justify-between rounded-lg bg-muted p-3">
              <span className="text-sm text-muted-foreground">Solde actuel</span>
              <span className="font-medium">{balance} credit{balance > 1 ? 's' : ''}</span>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-muted p-3">
              <span className="text-sm text-muted-foreground">Cout</span>
              <span className="font-medium text-destructive">-{cost}</span>
            </div>

            <div
              className={cn(
                'flex items-center justify-between rounded-lg p-3',
                balanceAfter < 5
                  ? 'bg-amber-100 dark:bg-amber-900/30'
                  : 'bg-primary/10'
              )}
            >
              <span className="text-sm text-muted-foreground">Apres</span>
              <span
                className={cn(
                  'font-semibold',
                  balanceAfter < 5
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-primary'
                )}
              >
                {balanceAfter} credit{balanceAfter !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={onClose} disabled={isLoading}>
              Annuler
            </Button>
            <Button onClick={handleConfirm} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Confirmation...
                </>
              ) : (
                'Confirmer'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Insufficient credits UI
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5" />
            Credits insuffisants
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Cette action necessite <span className="font-semibold text-foreground">{cost} credit{cost > 1 ? 's' : ''}</span>.
          </p>

          <div className="flex items-center justify-between rounded-lg bg-destructive/10 p-3">
            <span className="text-sm text-muted-foreground">Vous avez</span>
            <span className="font-medium text-destructive">
              {balance} credit{balance !== 1 ? 's' : ''}
            </span>
          </div>

          {resetsAt && (
            <p className="text-sm text-muted-foreground">
              Vos credits se renouvellent le{' '}
              <span className="font-medium text-foreground">
                {format(new Date(resetsAt), 'd MMMM yyyy', { locale: fr })}
              </span>.
            </p>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button asChild className="w-full">
            <Link href="/pricing">
              Passer a PRO - Illimite
            </Link>
          </Button>
          <Button variant="ghost" onClick={onClose} className="w-full">
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
