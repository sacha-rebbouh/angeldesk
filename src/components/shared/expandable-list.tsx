"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ExpandableListProps<T> {
  /** Liste complète — JAMAIS tronquée silencieusement : tout est accessible via le bouton. */
  items: T[];
  /** Nombre d'items visibles avant expansion. */
  initialCount?: number;
  /** Rendu d'un item (clé gérée par le parent). */
  renderItem: (item: T, index: number) => ReactNode;
  /** Classe du conteneur de liste. */
  className?: string;
  /** Classe du bouton voir plus / voir moins. */
  buttonClassName?: string;
  moreLabel?: (remaining: number) => string;
  lessLabel?: string;
}

/**
 * Liste avec divulgation progressive : affiche `initialCount` items puis un bouton
 * « Voir les N autres » qui révèle le reste. Remplace les `slice(0, N)` muets afin
 * de ne jamais masquer de finding sans affordance (doctrine : pas de fausse complétude).
 */
export function ExpandableList<T>({
  items,
  initialCount = 8,
  renderItem,
  className,
  buttonClassName,
  moreLabel = (n) => `Voir les ${n} autres`,
  lessLabel = "Voir moins",
}: ExpandableListProps<T>) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, initialCount);
  const remaining = items.length - initialCount;

  return (
    <>
      <div className={className}>{visible.map((item, i) => renderItem(item, i))}</div>
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            "mt-2 text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground",
            buttonClassName,
          )}
        >
          {expanded ? lessLabel : moreLabel(remaining)}
        </button>
      )}
    </>
  );
}
