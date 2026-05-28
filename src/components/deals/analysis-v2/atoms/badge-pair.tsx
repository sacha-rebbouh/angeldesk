import {
  EVIDENCE_SOLIDITY_CONFIG,
  RECOMMENDATION_CONFIG,
  type EvidenceSolidity,
  type Orientation,
} from "@/lib/ui-configs";

/**
 * Affichage scoring 2 axes — orientation × solidité.
 *
 * Deux badges côte à côte pour rendre VISIBLE que ce sont deux axes
 * indépendants. La couleur de chaque badge vient de la config (jamais
 * recolorée localement). Si l'une des valeurs est absente, son badge
 * affiche "Non qualifié" (état honnête).
 */
type BadgePairProps = {
  orientation: Orientation | null;
  solidity: EvidenceSolidity | null;
  layout?: "horizontal" | "stacked";
  size?: "sm" | "md";
};

const ORIENTATION_TONE: Record<Orientation, { color: string; bg: string; edge: string }> = {
  very_favorable: { color: "var(--av-favorable)", bg: "var(--av-favorable-soft)", edge: "var(--av-favorable-edge)" },
  favorable: { color: "var(--av-favorable)", bg: "var(--av-favorable-soft)", edge: "var(--av-favorable-edge)" },
  contrasted: { color: "var(--av-vigilance)", bg: "var(--av-vigilance-soft)", edge: "var(--av-vigilance-edge)" },
  vigilance: { color: "var(--av-info)", bg: "var(--av-info-soft)", edge: "var(--av-info-edge)" },
  alert_dominant: { color: "var(--av-alert)", bg: "var(--av-alert-soft)", edge: "var(--av-alert-edge)" },
};

const SOLIDITY_TONE: Record<EvidenceSolidity, { color: string; bg: string; edge: string }> = {
  strong: { color: "var(--av-favorable)", bg: "var(--av-favorable-soft)", edge: "var(--av-favorable-edge)" },
  moderate: { color: "var(--av-info)", bg: "var(--av-info-soft)", edge: "var(--av-info-edge)" },
  low: { color: "var(--av-vigilance)", bg: "var(--av-vigilance-soft)", edge: "var(--av-vigilance-edge)" },
  contradictory: { color: "var(--av-alert)", bg: "var(--av-alert-soft)", edge: "var(--av-alert-edge)" },
  insufficient: { color: "var(--av-muted)", bg: "var(--av-surface-muted)", edge: "var(--av-line)" },
};

function Badge({
  label,
  axis,
  tone,
  size,
}: {
  label: string;
  axis: string;
  tone: { color: string; bg: string; edge: string };
  size: "sm" | "md";
}) {
  const padding = size === "sm" ? "px-2.5 py-1" : "px-3 py-1.5";
  const labelSize = size === "sm" ? "text-[12px]" : "text-[13px]";
  return (
    <div
      className={`flex flex-col gap-0.5 rounded-lg ${padding}`}
      style={{ background: tone.bg, border: `1px solid ${tone.edge}` }}
    >
      <span className="av-eyebrow" style={{ color: tone.color, fontSize: 10 }}>
        {axis}
      </span>
      <span className={`${labelSize} font-semibold leading-tight`} style={{ color: tone.color }}>
        {label}
      </span>
    </div>
  );
}

export function BadgePair({ orientation, solidity, layout = "horizontal", size = "md" }: BadgePairProps) {
  const orientationCfg = orientation ? RECOMMENDATION_CONFIG[orientation] : null;
  const solidityCfg = solidity ? EVIDENCE_SOLIDITY_CONFIG[solidity] : null;
  const orientationTone = orientation
    ? ORIENTATION_TONE[orientation]
    : { color: "var(--av-muted)", bg: "var(--av-surface-muted)", edge: "var(--av-line)" };
  const solidityTone = solidity
    ? SOLIDITY_TONE[solidity]
    : { color: "var(--av-muted)", bg: "var(--av-surface-muted)", edge: "var(--av-line)" };

  if (!orientation && !solidity) return null;

  return (
    <div className={`flex ${layout === "stacked" ? "flex-col" : "flex-wrap"} gap-2`}>
      {orientation ? (
        <Badge
          axis="Orientation"
          label={orientationCfg?.label ?? "—"}
          tone={orientationTone}
          size={size}
        />
      ) : null}
      {solidity ? (
        <Badge
          axis="Solidité des preuves"
          label={solidityCfg?.label ?? "—"}
          tone={solidityTone}
          size={size}
        />
      ) : null}
    </div>
  );
}
