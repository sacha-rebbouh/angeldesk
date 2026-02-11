"use client";

import { memo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { findGlossaryEntry } from "@/lib/glossary";

interface GlossaryTermProps {
  /** La cle du terme dans le dictionnaire GLOSSARY */
  term: string;
  /** Le texte affiche (si different de la cle). Par defaut = term */
  children?: React.ReactNode;
}

/**
 * Composant reutilisable qui affiche un tooltip explicatif sur un terme technique.
 * Utilise le dictionnaire GLOSSARY pour la definition.
 *
 * Usage: <GlossaryTerm term="Burn Multiple">3.42</GlossaryTerm>
 * ou:    <GlossaryTerm term="Burn Multiple" />
 */
export const GlossaryTerm = memo(function GlossaryTerm({
  term,
  children,
}: GlossaryTermProps) {
  const entry = findGlossaryEntry(term);

  // Si pas de definition, affiche le texte sans tooltip
  if (!entry) {
    return <>{children ?? term}</>;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="underline decoration-dotted decoration-muted-foreground/50 underline-offset-2 cursor-help">
            {children ?? term}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="font-semibold text-xs mb-1">{term} — {entry.short}</p>
          <p className="text-xs text-muted-foreground">{entry.full}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

GlossaryTerm.displayName = "GlossaryTerm";
