"use client";

import { memo, useState, useCallback } from "react";
import { AlertTriangle, X } from "lucide-react";
import Link from "next/link";

/**
 * Disclaimer legal permanent affiche en bas du dashboard.
 * OBLIGATOIRE - ne peut pas etre ferme definitivement (revient a chaque session).
 */
export const DisclaimerBanner = memo(function DisclaimerBanner() {
  const [isDismissed, setIsDismissed] = useState(false);

  const handleDismiss = useCallback(() => {
    setIsDismissed(true);
  }, []);

  if (isDismissed) {
    return (
      <div className="border-t bg-muted/50 px-4 py-1.5 text-center">
        <button
          onClick={() => setIsDismissed(false)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <AlertTriangle className="h-3 w-3 inline mr-1" />
          Avertissement legal
        </button>
      </div>
    );
  }

  return (
    <div className="border-t bg-amber-50 dark:bg-amber-950/20 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-xs text-amber-800 dark:text-amber-200">
            <strong>Avertissement</strong> : Angel Desk fournit des analyses automatisees a titre informatif uniquement.
            Ces analyses <strong>ne constituent pas un conseil en investissement</strong>.
            Tout investissement dans des startups comporte un <strong>risque de perte totale du capital investi</strong>.
            Consultez un conseiller financier agree avant toute decision d&apos;investissement.
          </p>
          <div className="flex gap-3 mt-1.5">
            <Link href="/legal/cgu" className="text-xs text-amber-700 underline hover:text-amber-900">
              CGU
            </Link>
            <Link href="/legal/mentions-legales" className="text-xs text-amber-700 underline hover:text-amber-900">
              Mentions legales
            </Link>
            <Link href="/legal/confidentialite" className="text-xs text-amber-700 underline hover:text-amber-900">
              Politique de confidentialite
            </Link>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="shrink-0 p-1 hover:bg-amber-100 rounded transition-colors"
          aria-label="Reduire l'avertissement"
        >
          <X className="h-3.5 w-3.5 text-amber-600" />
        </button>
      </div>
    </div>
  );
});

DisclaimerBanner.displayName = "DisclaimerBanner";
