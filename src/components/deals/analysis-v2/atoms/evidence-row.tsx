import { EVIDENCE_SOLIDITY_CONFIG, type EvidenceSolidity } from "@/lib/ui-configs";

export type EvidenceStatus =
  | "VERIFIED"
  | "CONTRADICTED"
  | "PARTIAL"
  | "NOT_VERIFIABLE"
  | "EXAGGERATED"
  | "MISLEADING"
  | "PROJECTION_AS_FACT"
  | "DECLARED";

const STATUS_TONE: Record<EvidenceStatus, { bg: string; edge: string; color: string; label: string }> = {
  VERIFIED: { bg: "var(--av-favorable-soft)", edge: "var(--av-favorable-edge)", color: "var(--av-favorable)", label: "Vérifié" },
  CONTRADICTED: { bg: "var(--av-alert-soft)", edge: "var(--av-alert-edge)", color: "var(--av-alert)", label: "Contredit" },
  PARTIAL: { bg: "var(--av-vigilance-soft)", edge: "var(--av-vigilance-edge)", color: "var(--av-vigilance)", label: "Partiel" },
  NOT_VERIFIABLE: { bg: "var(--av-surface-muted)", edge: "var(--av-line)", color: "var(--av-muted)", label: "Non vérifiable" },
  EXAGGERATED: { bg: "var(--av-vigilance-soft)", edge: "var(--av-vigilance-edge)", color: "var(--av-vigilance)", label: "Exagéré" },
  MISLEADING: { bg: "var(--av-alert-soft)", edge: "var(--av-alert-edge)", color: "var(--av-alert)", label: "Trompeur" },
  PROJECTION_AS_FACT: { bg: "var(--av-vigilance-soft)", edge: "var(--av-vigilance-edge)", color: "var(--av-vigilance)", label: "Projection présentée comme fait" },
  DECLARED: { bg: "var(--av-info-soft)", edge: "var(--av-info-edge)", color: "var(--av-info)", label: "Déclaré" },
};

const SOLIDITY_TONE: Record<EvidenceSolidity, { bg: string; edge: string; color: string }> = {
  strong: { bg: "var(--av-favorable-soft)", edge: "var(--av-favorable-edge)", color: "var(--av-favorable)" },
  moderate: { bg: "var(--av-info-soft)", edge: "var(--av-info-edge)", color: "var(--av-info)" },
  low: { bg: "var(--av-vigilance-soft)", edge: "var(--av-vigilance-edge)", color: "var(--av-vigilance)" },
  contradictory: { bg: "var(--av-alert-soft)", edge: "var(--av-alert-edge)", color: "var(--av-alert)" },
  insufficient: { bg: "var(--av-surface-muted)", edge: "var(--av-line)", color: "var(--av-muted)" },
};

export type EvidenceRowProps = {
  claim: string;
  source: string;
  sourceDetail?: string | null;
  freshness?: string | null;
  solidity: EvidenceSolidity | null;
  status: EvidenceStatus | null;
  note?: string | null;
};

function Pill({
  label,
  bg,
  edge,
  color,
}: {
  label: string;
  bg: string;
  edge: string;
  color: string;
}) {
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: bg, border: `1px solid ${edge}`, color }}
    >
      {label}
    </span>
  );
}

export function EvidenceRow({ claim, source, sourceDetail, freshness, solidity, status, note }: EvidenceRowProps) {
  const solidityCfg = solidity ? EVIDENCE_SOLIDITY_CONFIG[solidity] : null;
  const solidityTone = solidity ? SOLIDITY_TONE[solidity] : null;
  const statusTone = status ? STATUS_TONE[status] : null;
  return (
    <tr className="border-t" style={{ borderColor: "var(--av-line)" }}>
      <td className="px-3 py-3 align-top" data-label="Affirmation">
        <p className="text-[14px] leading-snug text-[var(--av-ink)]">{claim}</p>
        {note ? <p className="mt-1 text-[12px] leading-snug text-[var(--av-muted)]">{note}</p> : null}
      </td>
      <td className="px-3 py-3 align-top text-[13px] text-[var(--av-ink)]" data-label="Source">
        <span className="font-medium">{source}</span>
        {sourceDetail ? (
          <span className="block text-[12px] text-[var(--av-muted)]">{sourceDetail}</span>
        ) : null}
      </td>
      <td className="px-3 py-3 align-top text-[12px] text-[var(--av-muted)] av-tabular" data-label="Fraîcheur">
        {freshness ?? "—"}
      </td>
      <td className="px-3 py-3 align-top" data-label="Solidité">
        {solidityCfg && solidityTone ? (
          <Pill label={solidityCfg.shortLabel} bg={solidityTone.bg} edge={solidityTone.edge} color={solidityTone.color} />
        ) : (
          <span className="text-[12px] text-[var(--av-muted)]">Non qualifiée</span>
        )}
      </td>
      <td className="px-3 py-3 align-top" data-label="Status">
        {statusTone ? (
          <Pill label={statusTone.label} bg={statusTone.bg} edge={statusTone.edge} color={statusTone.color} />
        ) : (
          <span className="text-[12px] text-[var(--av-muted)]">—</span>
        )}
      </td>
    </tr>
  );
}
