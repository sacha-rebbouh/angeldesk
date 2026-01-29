'use client';

import { AlertTriangle, Lock } from 'lucide-react';
import Link from 'next/link';

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
  action: string; // "analyse", "mise à jour", "AI Board"
  current?: number;
  limit?: number;
  onUpgrade?: () => void;
  isLoading?: boolean;
}

const ACTION_MESSAGES: Record<string, string> = {
  ANALYSIS: 'Lancer une analyse',
  UPDATE: 'Mettre a jour l\'analyse',
  BOARD: 'Consulter l\'AI Board',
};

export function CreditModal({
  isOpen,
  onClose,
  type,
  action,
  current,
  limit,
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
                Passer a PRO - 279EUR/mois
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
            Vous avez utilise <span className="font-semibold text-foreground">{current}/{limit}</span> de votre quota mensuel.
          </p>

          <p className="text-sm text-muted-foreground">
            Passez a PRO pour augmenter vos limites.
          </p>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button asChild className="w-full">
            <Link href="/pricing">
              Passer a PRO - 279EUR/mois
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
