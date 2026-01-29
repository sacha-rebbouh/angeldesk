'use client';

import { useState, useCallback, memo } from 'react';
import { Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FactOverrideModal } from './fact-override-modal';

interface FactItemProps {
  dealId: string;
  fact: {
    factKey: string;
    category: string;
    currentValue: unknown;
    currentDisplayValue: string;
    currentSource: string;
    currentConfidence: number;
  };
  showEditButton?: boolean;
  onOverrideSuccess?: () => void;
}

function FactItemComponent({
  dealId,
  fact,
  showEditButton = true,
  onOverrideSuccess,
}: FactItemProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleOpenModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const handleSuccess = useCallback(() => {
    onOverrideSuccess?.();
  }, [onOverrideSuccess]);

  return (
    <>
      <div className="flex items-center justify-between py-2">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{fact.currentDisplayValue}</span>
            <Badge variant="outline" className="text-xs shrink-0">
              {fact.currentSource}
            </Badge>
            {fact.currentSource === 'BA_OVERRIDE' && (
              <Badge variant="secondary" className="text-xs shrink-0">
                Corrige
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {fact.factKey} - {fact.currentConfidence}% confidence
          </p>
        </div>
        {showEditButton && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenModal}
            className="shrink-0 ml-2"
          >
            <Edit2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <FactOverrideModal
        dealId={dealId}
        fact={fact}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSuccess={handleSuccess}
      />
    </>
  );
}

// Memoize with stable props comparison
export const FactItem = memo(FactItemComponent);
