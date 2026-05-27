import type { EvidenceSolidity, Orientation } from "@/lib/ui-configs";

import { BadgePair } from "./badge-pair";

export type AgentCardSignal = {
  agentLabel: string;
  agentRole: string;
  oneLiner: string | null;
  orientation: Orientation | null;
  solidity: EvidenceSolidity | null;
  scoreValue: number | null;
  insights: string[];
  redFlagCount: number;
  questionCount: number;
};

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
          Pas de synthèse explicite produite par l'agent.
        </p>
      )}
      {signal.insights.length > 0 ? (
        <ul className="flex flex-col gap-1.5 text-[13px] text-[var(--av-ink)]">
          {signal.insights.slice(0, 3).map((insight, idx) => (
            <li key={idx} className="flex gap-2">
              <span aria-hidden="true" className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-[var(--av-line-strong)]" />
              <span className="leading-snug">{insight}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <footer
        className="mt-auto flex items-center justify-between border-t pt-2 text-[12px] text-[var(--av-muted)]"
        style={{ borderColor: "var(--av-line)" }}
      >
        <span className="av-tabular">
          {signal.redFlagCount} alerte{signal.redFlagCount > 1 ? "s" : ""} · {signal.questionCount} question
          {signal.questionCount > 1 ? "s" : ""}
        </span>
        {signal.scoreValue != null ? (
          <span className="av-tabular text-[var(--av-ink)]">
            <strong className="font-semibold">{signal.scoreValue}</strong>
            <span className="text-[var(--av-muted)]"> /100</span>
          </span>
        ) : (
          <span className="text-[var(--av-muted)]">Score interne indisponible</span>
        )}
      </footer>
    </article>
  );
}
