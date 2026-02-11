'use client';

import { memo } from 'react';
import { AlertTriangle, Lock, Calendar, Zap } from 'lucide-react';
import Link from 'next/link';
import { format, isValid } from 'date-fns';
import { fr } from 'date-fns/locale';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface QuotaModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'LIMIT_REACHED' | 'UPGRADE_REQUIRED' | 'TIER_LOCKED';
  action: string;
  current?: number;
  limit?: number;
  resetDate?: string;
  planName?: 'FREE' | 'PRO';
  isLoading?: boolean;
}

function formatResetDate(dateStr: string, withYear = true): string {
  const d = new Date(dateStr);
  if (!isValid(d)) return '';
  return format(d, withYear ? 'd MMMM yyyy' : 'd MMMM', { locale: fr });
}

const ACTION_MESSAGES: Record<string, string> = {
  ANALYSIS: 'Lancer une analyse',
  UPDATE: 'Mettre a jour l\'analyse',
  BOARD: 'Consulter l\'AI Board',
};

export const CreditModal = memo(function CreditModal({
  isOpen,
  onClose,
  type,
  action,
  current,
  limit,
  resetDate,
  planName,
  isLoading = false,
}: QuotaModalProps) {
  if (type === 'TIER_LOCKED') {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="size-5 text-muted-foreground" />
              Fonctionnalite PRO
            </DialogTitle>
            <DialogDescription>
              {ACTION_MESSAGES[action] || action} est reserve aux abonnes PRO.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Passez a PRO pour debloquer toutes les fonctionnalites :
              experts sectoriels, synthese complete, AI Board, et plus.
            </p>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button asChild className="w-full">
              <Link href="/pricing">
                Passer à PRO - 249 EUR/mois
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

  // LIMIT_REACHED or UPGRADE_REQUIRED
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5" />
            Limite atteinte
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Vous avez utilisé <span className="font-semibold text-foreground">{current}/{limit}</span> de votre quota mensuel.
          </p>

          {resetDate && formatResetDate(resetDate) && (
            <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
              <Calendar className="size-4 text-muted-foreground shrink-0" />
              <p className="text-sm text-muted-foreground">
                Vos crédits seront renouvelés le{' '}
                <span className="font-medium text-foreground">
                  {formatResetDate(resetDate)}
                </span>
              </p>
            </div>
          )}

          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Zap className="size-4 text-primary" />
              <p className="text-sm font-medium">Options pour continuer</p>
            </div>
            <ul className="space-y-1.5 text-sm text-muted-foreground ml-6">
              {planName === 'FREE' && (
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold mt-0.5">1.</span>
                  <span>
                    <span className="font-medium text-foreground">Passer à PRO</span> — 25 analyses/mois,
                    experts sectoriels, AI Board, synthèse complète
                  </span>
                </li>
              )}
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold mt-0.5">{planName === 'FREE' ? '2' : '1'}.</span>
                <span>
                  <span className="font-medium text-foreground">Attendre le renouvellement</span>
                  {resetDate && formatResetDate(resetDate, false) && (
                    <> — le {formatResetDate(resetDate, false)}</>
                  )}
                </span>
              </li>
            </ul>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {planName !== 'PRO' && (
            <Button asChild className="w-full">
              <Link href="/pricing">
                Passer à PRO - 249 EUR/mois
              </Link>
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} className="w-full">
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
