import { ArrowUpRight } from "lucide-react";

/**
 * Petit ancrage de provenance — affiche un chevron discret qui révèle le
 * nom de l'agent source via tooltip natif au survol.
 *
 * Objectif : ne pas surcharger la lecture avec "source : <agent>" partout.
 * La provenance reste accessible (clavier + screen reader) mais ne pollue
 * pas le texte principal.
 */
type SourcePinProps = {
  source: string;
  label?: string;
  className?: string;
};

export function SourcePin({ source, label = "Source", className }: SourcePinProps) {
  const tooltip = `${label} : ${source}`;
  return (
    <button
      type="button"
      title={tooltip}
      aria-label={tooltip}
      tabIndex={0}
      className={`av-transition inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--av-muted)] hover:bg-[var(--av-surface-muted)] hover:text-[var(--av-info)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--av-info)] ${className ?? ""}`}
    >
      <ArrowUpRight size={12} aria-hidden="true" />
    </button>
  );
}
