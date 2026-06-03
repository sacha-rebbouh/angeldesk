import { Callout } from "../atoms/callout";
import { PartialBanner } from "../atoms/partial-banner";
import { RankRow } from "../atoms/rank-row";
import { SourcePin } from "../atoms/source-pin";
import { LEGAL_COVERAGE_GAP_DETAIL, LEGAL_COVERAGE_GAP_TITLE } from "../lib/presentation";
import type { buildDecisionSectionModel } from "../lib/selectors";

type Model = ReturnType<typeof buildDecisionSectionModel>;

export function DecisionSection({ model }: { model: Model }) {
  const { favorable, vigilance, ranks, legalCoverageGap, alertConvergence } = model;
  return (
    <section id="decision" className="flex scroll-mt-44 flex-col gap-5">
      <header className="flex flex-col gap-1">
        <span className="av-eyebrow">Section 1</span>
        <h2 className="av-h2">Synthèse de décision</h2>
        <p className="av-note">
          Les éléments ci-dessous consolident ce qui étaye la thèse et ce qui la fragilise. Les risques sont rangés par
          impact documenté. La décision finale revient à l'investisseur.
        </p>
      </header>

      <div className="grid gap-3 lg:grid-cols-2">
        <Callout tone="favorable" eyebrow="Axe 1" title="Signaux qui étayent la thèse">
          {favorable.length === 0 ? (
            <p>Aucun signal favorable explicitement remonté par les agents.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {favorable.map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span aria-hidden="true" className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--av-favorable)]" />
                  <span className="flex-1">{s.text}</span>
                  <SourcePin source={s.source} className="mt-0.5" />
                </li>
              ))}
            </ul>
          )}
        </Callout>
        <Callout tone="vigilance" eyebrow="Axe 2" title="Points qui la fragilisent">
          {vigilance.length === 0 ? (
            <p>Aucun point de vigilance remonté.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {vigilance.map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span aria-hidden="true" className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--av-vigilance)]" />
                  <span className="flex-1">{s.text}</span>
                  <SourcePin source={s.source} className="mt-0.5" />
                </li>
              ))}
            </ul>
          )}
        </Callout>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="av-h3">Risques rangés par impact documenté</h3>
        {ranks.length === 0 ? (
          <PartialBanner tone="info" title="Aucun risque consolidé">
            Les agents n'ont pas remonté de risque critique ou élevé sur cette analyse.
          </PartialBanner>
        ) : (
          <ol className="flex flex-col gap-2.5">
            {ranks.map((r, idx) => (
              <li key={r.id}>
                <RankRow
                  rank={idx + 1}
                  title={r.title}
                  description={r.description ?? undefined}
                  evidence={r.evidence}
                  severity={r.severity}
                  severityLabel={r.severityLabel}
                  source={r.source}
                  tags={r.tags}
                />
              </li>
            ))}
          </ol>
        )}
      </div>

      {legalCoverageGap ? (
        <Callout tone="info" eyebrow="Couverture" title={LEGAL_COVERAGE_GAP_TITLE}>
          <p>{LEGAL_COVERAGE_GAP_DETAIL}</p>
        </Callout>
      ) : null}

      {alertConvergence.total > 0 ? (
        <div
          className="flex flex-col gap-3 rounded-xl bg-[var(--av-surface)] p-4"
          style={{ border: "1px solid var(--av-line)", boxShadow: "var(--av-shadow-soft)" }}
        >
          <div className="flex flex-col gap-0.5">
            <h3 className="av-h3">Convergence des signaux par dimension</h3>
            <p className="av-note">
              Lecture de chaque lentille d&apos;analyse horizontale ({alertConvergence.total} dimension
              {alertConvergence.total > 1 ? "s" : ""} exploitable{alertConvergence.total > 1 ? "s" : ""}).
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Signal critique", value: alertConvergence.STOP, color: "var(--av-alert)", bg: "var(--av-alert-soft)", edge: "var(--av-alert-edge)" },
              { label: "Investigation", value: alertConvergence.INVESTIGATE_FURTHER, color: "var(--av-vigilance)", bg: "var(--av-vigilance-soft)", edge: "var(--av-vigilance-edge)" },
              { label: "Point d'attention", value: alertConvergence.PROCEED_WITH_CAUTION, color: "var(--av-info)", bg: "var(--av-info-soft)", edge: "var(--av-info-edge)" },
              { label: "Conforme", value: alertConvergence.PROCEED, color: "var(--av-favorable)", bg: "var(--av-favorable-soft)", edge: "var(--av-favorable-edge)" },
            ].map((cell) => (
              <div
                key={cell.label}
                className="flex flex-col gap-0.5 rounded-lg px-3 py-2"
                style={{ background: cell.bg, border: `1px solid ${cell.edge}` }}
              >
                <span className="text-[22px] font-semibold leading-none av-tabular" style={{ color: cell.color }}>
                  {cell.value}
                </span>
                <span className="text-[12px] font-medium" style={{ color: cell.color }}>
                  {cell.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
