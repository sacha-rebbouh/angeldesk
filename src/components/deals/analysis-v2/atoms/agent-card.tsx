import type { EvidenceSolidity, Orientation } from "@/lib/ui-configs";

import { BadgePair } from "./badge-pair";

export type AgentCardSignal = {
  agentLabel: string;
  agentRole: string;
  oneLiner: string | null;
  orientation: Orientation | null;
  solidity: EvidenceSolidity | null;
  /** Ce qui étaye la thèse (insights non négatifs). */
  supports: string[];
  /** Ce qui alerte (red flags structurés). */
  concerns: string[];
  redFlagCount: number;
  questionCount: number;
};

function MiniList({
  title,
  items,
  dotColor,
}: {
  title: string;
  items: string[];
  dotColor: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--av-muted)]">{title}</span>
      <ul className="flex flex-col gap-1 text-[13px] text-[var(--av-ink)]">
        {items.map((item, idx) => (
          <li key={idx} className="flex gap-2">
            <span aria-hidden="true" className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full" style={{ background: dotColor }} />
            <span className="leading-snug">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AgentCard({ signal }: { signal: AgentCardSignal }) {
  return (
    <article
      className="flex flex-col gap-3 rounded-xl bg-[var(--av-surface)] p-4"
      style={{ border: "1px solid var(--av-line)", boxShadow: "var(--av-shadow-soft)" }}
    >
      <header className="flex flex-col gap-1">
        <span className="av-eyebrow">{signal.agentRole}</span>
        <h4 className="text-[15px] font-semibold leading-snug text-[var(--av-ink)]">{signal.agentLabel}</h4>
      </header>
      <BadgePair orientation={signal.orientation} solidity={signal.solidity} size="sm" />
      {signal.oneLiner ? (
        <p className="text-[13px] leading-relaxed text-[var(--av-ink)]">{signal.oneLiner}</p>
      ) : (
        <p className="text-[13px] leading-relaxed text-[var(--av-muted)]">
          Synthèse textuelle non fournie par le modèle — voir les signaux ci-dessous.
        </p>
      )}
      {/* #14/#15 : séparer ce qui étaye vs ce qui alerte (plus de puces positives sous une orientation d'alerte). */}
      {signal.supports.length > 0 || signal.concerns.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          <MiniList title="Ce qui étaye" items={signal.supports} dotColor="var(--av-favorable)" />
          <MiniList title="Ce qui alerte" items={signal.concerns} dotColor="var(--av-alert)" />
        </div>
      ) : null}
      <footer
        className="mt-auto flex items-center justify-between border-t pt-2 text-[12px] text-[var(--av-muted)]"
        style={{ borderColor: "var(--av-line)" }}
      >
        <span className="av-tabular">
          {signal.redFlagCount} alerte{signal.redFlagCount > 1 ? "s" : ""} · {signal.questionCount} question
          {signal.questionCount > 1 ? "s" : ""}
        </span>
      </footer>
    </article>
  );
}
