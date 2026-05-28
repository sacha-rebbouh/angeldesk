import { Callout } from "../atoms/callout";
import { PartialBanner } from "../atoms/partial-banner";
import { RankRow } from "../atoms/rank-row";
import { SourcePin } from "../atoms/source-pin";
import type { buildDecisionSectionModel } from "../lib/selectors";

type Model = ReturnType<typeof buildDecisionSectionModel>;

export function DecisionSection({ model }: { model: Model }) {
  const { favorable, vigilance, ranks, alertConvergence } = model;
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

      {alertConvergence.total > 0 ? (
        <PartialBanner tone={alertConvergence.STOP >= 4 ? "alert" : alertConvergence.STOP >= 1 ? "vigilance" : "info"} title="Convergence des signaux d'alerte (Tier 1)">
          {alertConvergence.STOP} agent{alertConvergence.STOP > 1 ? "s" : ""} remonte{alertConvergence.STOP > 1 ? "nt" : ""} un signal critique, {alertConvergence.INVESTIGATE_FURTHER} demande{alertConvergence.INVESTIGATE_FURTHER > 1 ? "nt" : ""} investigation, {alertConvergence.PROCEED_WITH_CAUTION} signale{alertConvergence.PROCEED_WITH_CAUTION > 1 ? "nt" : ""} des points d'attention et {alertConvergence.PROCEED} lit{alertConvergence.PROCEED > 1 ? "ent" : ""} la dimension comme conforme.
        </PartialBanner>
      ) : null}
    </section>
  );
}
