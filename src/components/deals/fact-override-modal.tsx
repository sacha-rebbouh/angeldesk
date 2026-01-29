'use client';

import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Edit3 } from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { queryKeys } from '@/lib/query-keys';

interface FactOverrideModalProps {
  dealId: string;
  fact: {
    factKey: string;
    category: string;
    currentValue: unknown;
    currentDisplayValue: string;
    currentSource: string;
    currentConfidence: number;
  };
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

function formatFactKey(factKey: string): string {
  return factKey
    .replace(/\./g, ' > ')
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function FactOverrideModal({
  dealId,
  fact,
  isOpen,
  onClose,
  onSuccess,
}: FactOverrideModalProps) {
  const queryClient = useQueryClient();
  const [newValue, setNewValue] = useState('');
  const [reason, setReason] = useState('');

  const overrideMutation = useMutation({
    mutationFn: async (data: {
      factKey: string;
      value: unknown;
      displayValue: string;
      reason: string;
    }) => {
      const res = await fetch(`/api/facts/${dealId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to override fact');
      }
      return res.json();
    },
    onSuccess: () => {
      // Granular invalidation - only facts-related queries for this deal
      queryClient.invalidateQueries({ queryKey: queryKeys.facts.byDeal(dealId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.factReviews.byDeal(dealId) });
      // Also invalidate the deal detail in case fact data is displayed there
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });

      toast.success('Fait corrige avec succes');
      setNewValue('');
      setReason('');
      onClose();
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = useCallback(() => {
    if (!newValue.trim() || !reason.trim()) return;

    // Try to parse as number if it looks like one
    let parsedValue: unknown = newValue.trim();
    const numValue = parseFloat(newValue.replace(/[^0-9.-]/g, ''));
    if (!isNaN(numValue) && /^[\d.,\s%KMB-]+$/.test(newValue)) {
      parsedValue = numValue;
    }

    overrideMutation.mutate({
      factKey: fact.factKey,
      value: parsedValue,
      displayValue: newValue.trim(),
      reason: reason.trim(),
    });
  }, [newValue, reason, fact.factKey, overrideMutation]);

  const handleClose = useCallback(() => {
    if (!overrideMutation.isPending) {
      setNewValue('');
      setReason('');
      onClose();
    }
  }, [onClose, overrideMutation.isPending]);

  const handleNewValueChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewValue(e.target.value);
  }, []);

  const handleReasonChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setReason(e.target.value);
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit3 className="h-5 w-5" />
            Corriger une valeur
          </DialogTitle>
          <DialogDescription>
            Remplacer la valeur actuelle par une information plus fiable.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Fact Key */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">{formatFactKey(fact.factKey)}</Badge>
            <Badge variant="secondary">{fact.category}</Badge>
          </div>

          {/* Current Value */}
          <div className="p-3 bg-muted rounded-lg space-y-1">
            <p className="text-xs text-muted-foreground">Valeur actuelle</p>
            <p className="font-medium">{fact.currentDisplayValue}</p>
            <p className="text-xs text-muted-foreground">
              Source: {fact.currentSource} ({fact.currentConfidence}% confidence)
            </p>
          </div>

          {/* New Value Input */}
          <div className="space-y-2">
            <Label htmlFor="new-value">Nouvelle valeur</Label>
            <Input
              id="new-value"
              value={newValue}
              onChange={handleNewValueChange}
              placeholder="Ex: 500K EUR, 25%, Oui..."
              disabled={overrideMutation.isPending}
            />
          </div>

          {/* Reason Input */}
          <div className="space-y-2">
            <Label htmlFor="reason">
              Raison de la correction <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={handleReasonChange}
              placeholder="Ex: Information confirmee lors du call avec le fondateur..."
              rows={3}
              disabled={overrideMutation.isPending}
            />
          </div>

          {/* Error display */}
          {overrideMutation.isError && (
            <p className="text-sm text-destructive">
              {overrideMutation.error.message}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={overrideMutation.isPending}
          >
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!newValue.trim() || !reason.trim() || overrideMutation.isPending}
          >
            {overrideMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Enregistrement...
              </>
            ) : (
              'Confirmer la correction'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
