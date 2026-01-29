'use client';

import { Lock } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface TierLockOverlayProps {
  tierName: string; // "Experts Sectoriels" or "Synthèse Avancée"
  description: string;
}

export function TierLockOverlay({ tierName, description }: TierLockOverlayProps) {
  return (
    <div className="relative rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Lock className="size-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-semibold text-foreground">{tierName}</p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <Button asChild size="sm" className="mt-2">
          <Link href="/pricing">Débloquer avec PRO</Link>
        </Button>
      </div>
    </div>
  );
}
