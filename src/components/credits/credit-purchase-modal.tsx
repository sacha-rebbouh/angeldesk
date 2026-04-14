'use client';

import { memo, useState, useCallback, useMemo } from 'react';
import { Coins, Check, ArrowRight, AlertTriangle } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CREDIT_PACKS, FEATURE_ACCESS, type CreditPackConfig } from '@/services/credits/types';

interface CreditPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Current credit balance */
  balance: number;
  /** Total credits purchased (lifetime) for feature gating */
  totalPurchased: number;
  /** Cost of the action that triggered the modal (optional) */
  requiredCredits?: number;
  /** Description of the action that triggered the modal */
  actionLabel?: string;
}

export const CreditPurchaseModal = memo(function CreditPurchaseModal({
  isOpen,
  onClose,
  balance,
  totalPurchased,
  requiredCredits,
  actionLabel,
}: CreditPurchaseModalProps) {
  const [selectedPack, setSelectedPack] = useState<string>(() => {
    // Auto-select the cheapest pack that covers the deficit
    if (requiredCredits && requiredCredits > balance) {
      const deficit = requiredCredits - balance;
      const sufficient = CREDIT_PACKS.find(p => p.credits >= deficit);
      return sufficient?.name ?? 'standard';
    }
    // Default to highlighted pack
    return CREDIT_PACKS.find(p => p.highlight)?.name ?? 'standard';
  });

  const deficit = useMemo(() => {
    if (!requiredCredits) return 0;
    return Math.max(0, requiredCredits - balance);
  }, [requiredCredits, balance]);

  const handleSelectPack = useCallback((packName: string) => {
    setSelectedPack(packName);
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {deficit > 0 ? (
              <>
                <AlertTriangle className="size-5 text-amber-500" />
                Crédits insuffisants
              </>
            ) : (
              <>
                <Coins className="size-5 text-amber-500" />
                Acheter des crédits
              </>
            )}
          </DialogTitle>
          {deficit > 0 && actionLabel && (
            <DialogDescription>
              {actionLabel} nécessite {requiredCredits} crédit{requiredCredits !== 1 ? 's' : ''}.
              Votre solde : {balance} crédit{balance !== 1 ? 's' : ''}.
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-3 py-2">
          {CREDIT_PACKS.map((pack) => (
            <PackOption
              key={pack.name}
              pack={pack}
              isSelected={selectedPack === pack.name}
              onSelect={handleSelectPack}
              deficit={deficit}
              totalPurchased={totalPurchased}
            />
          ))}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full"
            onClick={() => {
              const pack = CREDIT_PACKS.find(p => p.name === selectedPack);
              const subject = encodeURIComponent(`Achat pack ${pack?.displayName ?? selectedPack} — Angel Desk`);
              window.location.href = `mailto:contact@angeldesk.io?subject=${subject}`;
            }}
          >
            <ArrowRight className="mr-2 size-4" />
            Contactez-nous
          </Button>
          <Button variant="ghost" onClick={onClose} className="w-full">
            Annuler
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

const PackOption = memo(function PackOption({
  pack,
  isSelected,
  onSelect,
  deficit,
  totalPurchased,
}: {
  pack: CreditPackConfig;
  isSelected: boolean;
  onSelect: (name: string) => void;
  deficit: number;
  totalPurchased: number;
}) {
  const coversDeficit = deficit === 0 || pack.credits >= deficit;
  const unlocksNegotiation =
    totalPurchased < FEATURE_ACCESS.negotiation.minTotalPurchased &&
    totalPurchased + pack.credits >= FEATURE_ACCESS.negotiation.minTotalPurchased;
  const unlocksApi =
    totalPurchased < FEATURE_ACCESS.api.minTotalPurchased &&
    totalPurchased + pack.credits >= FEATURE_ACCESS.api.minTotalPurchased;

  return (
    <button
      type="button"
      onClick={() => onSelect(pack.name)}
      className={cn(
        'w-full flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-all',
        isSelected
          ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/20'
          : 'border-border hover:border-amber-300 hover:bg-muted/50',
        pack.highlight && !isSelected && 'border-amber-200 dark:border-amber-800',
      )}
    >
      {/* Radio indicator */}
      <div
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
          isSelected
            ? 'border-amber-500 bg-amber-500'
            : 'border-muted-foreground/30',
        )}
      >
        {isSelected && <Check className="size-3 text-white" />}
      </div>

      {/* Pack info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{pack.displayName}</span>
          <span className="text-xs text-muted-foreground">
            {pack.credits} crédits
          </span>
          {pack.highlight && (
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white">
              Populaire
            </span>
          )}
          {deficit > 0 && coversDeficit && (
            <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
              Suffisant
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">{pack.description}</span>
        </div>
        {(unlocksNegotiation || unlocksApi) && (
          <div className="flex gap-2 mt-1">
            {unlocksNegotiation && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                + Débloque Négociation
              </span>
            )}
            {unlocksApi && (
              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">
                + Débloque API
              </span>
            )}
          </div>
        )}
      </div>

      {/* Price */}
      <div className="text-right shrink-0">
        <div className="font-bold text-sm">{pack.priceEur} €</div>
        <div className="text-[10px] text-muted-foreground">
          {pack.perCredit.toFixed(2)} €/cr
        </div>
      </div>
    </button>
  );
});
