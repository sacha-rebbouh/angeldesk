import { Info } from "lucide-react";

import { presentableSource } from "../lib/presentation";

/**
 * Indicateur de provenance — pastille d'info NON cliquable révélant la source
 * (document) au survol via tooltip natif.
 *
 * Règles :
 *  - la source est SANITIZÉE (jamais de nom d'agent technique en tooltip → #7) ;
 *  - si la "source" n'était qu'un nom d'agent / machinerie, on n'affiche RIEN
 *    (pas de fausse pastille → #8 : plus de flèche qui ne mène nulle part) ;
 *  - élément non interactif (icône info), pas un bouton trompeur.
 */
type SourcePinProps = {
  source: string | null | undefined;
  label?: string;
  className?: string;
};

export function SourcePin({ source, label = "Source", className }: SourcePinProps) {
  const clean = presentableSource(source);
  if (!clean) return null;
  const tooltip = `${label} : ${clean}`;
  return (
    <span
      role="note"
      title={tooltip}
      aria-label={tooltip}
      className={`av-transition inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full text-[var(--av-muted)] ${className ?? ""}`}
    >
      <Info size={12} aria-hidden="true" />
    </span>
  );
}
