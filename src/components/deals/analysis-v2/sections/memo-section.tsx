import { PartialBanner } from "../atoms/partial-banner";
import { StatusPill } from "../atoms/status-pill";
import type { MemoSectionModel } from "../lib/selectors";

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article
      className="flex flex-col gap-3 rounded-xl bg-[var(--av-surface)] p-5"
      style={{ border: "1px solid var(--av-line)", boxShadow: "var(--av-shadow-soft)" }}
    >
      <h3 className="av-h3">{title}</h3>
      {children}
    </article>
  );
}

export function MemoSection({ model }: { model: MemoSectionModel }) {
  return (
    <section id="memo" className="flex scroll-mt-44 flex-col gap-5">
      <header className="flex flex-col gap-1">
        <span className="av-eyebrow">Section 5</span>
        <h2 className="av-h2">Mémo synthétique</h2>
        <p className="av-note">
          Document de synthèse pour le comité ou la discussion d'investissement. La décision finale reste à
          l'investisseur.
        </p>
      </header>

      {model.kind === "reconstituted" ? (
        <PartialBanner tone="vigilance" title="Mémo reconstitué à partir des findings">
          {model.reason}
        </PartialBanner>
      ) : null}

      {model.kind === "generated" ? (
        <>
          {model.executiveSummary ? (
            <SectionBlock title="Résumé exécutif">
              <p className="text-[15px] leading-relaxed text-[var(--av-ink)]">{model.executiveSummary}</p>
              {model.keyPoints.length > 0 ? (
                <ul className="mt-3 flex flex-col gap-1.5 text-[14px] text-[var(--av-ink)]">
                  {model.keyPoints.map((p, i) => (
                    <li key={i} className="flex gap-2">
                      <span aria-hidden="true" className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--av-info)]" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </SectionBlock>
          ) : null}
          {model.companyOverview ? (
            <SectionBlock title="Société et proposition de valeur">
              <p className="text-[14px] leading-relaxed text-[var(--av-ink)]">{model.companyOverview}</p>
            </SectionBlock>
          ) : null}
          {model.investmentThesis ? (
            <SectionBlock title="Thèse d'investissement">
              <p className="text-[14px] leading-relaxed text-[var(--av-ink)]">{model.investmentThesis}</p>
            </SectionBlock>
          ) : null}
          {model.criticalRisks.length > 0 ? (
            <SectionBlock title="Risques critiques">
              <ul className="flex flex-col gap-2 text-[14px] text-[var(--av-ink)]">
                {model.criticalRisks.map((r, i) => (
                  <li key={i} className="flex flex-col gap-1">
                    <strong className="text-[14px] font-semibold">{r.title}</strong>
                    {r.detail ? <span className="text-[13px] text-[var(--av-muted)]">{r.detail}</span> : null}
                  </li>
                ))}
              </ul>
            </SectionBlock>
          ) : null}
          {model.nextSteps.length > 0 ? (
            <SectionBlock title="Prochaines étapes">
              <ol className="flex flex-col gap-1.5 text-[14px] text-[var(--av-ink)]">
                {model.nextSteps.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="av-tabular text-[var(--av-muted)]">{i + 1}.</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </SectionBlock>
          ) : null}
        </>
      ) : (
        <>
          <SectionBlock title="Forces étayées par les agents">
            {model.strengths.length === 0 ? (
              <p className="text-[14px] text-[var(--av-muted)]">Aucun signal favorable explicitement remonté.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-[14px] text-[var(--av-ink)]">
                {model.strengths.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden="true" className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--av-favorable)]" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionBlock>

          {model.criticalRisks.length > 0 ? (
            <SectionBlock title="Risques critiques consolidés">
              <ul className="flex flex-col gap-3 text-[14px] text-[var(--av-ink)]">
                {model.criticalRisks.map((r, i) => (
                  <li key={i} className="flex flex-col gap-1">
                    <div className="flex items-start justify-between gap-2">
                      <strong className="text-[14px] font-semibold">{r.title}</strong>
                      <span className="text-[11px] uppercase tracking-wide text-[var(--av-muted)]">{r.sourceAgent}</span>
                    </div>
                    {r.detail ? <span className="text-[13px] text-[var(--av-muted)]">{r.detail}</span> : null}
                  </li>
                ))}
              </ul>
            </SectionBlock>
          ) : null}

          {model.topPriorities.length > 0 ? (
            <SectionBlock title="Priorités d'investigation">
              <ol className="flex flex-col gap-3 text-[14px] text-[var(--av-ink)]">
                {model.topPriorities.map((p, i) => (
                  <li key={i} className="flex flex-col gap-1">
                    <div className="flex items-start justify-between gap-2">
                      <strong className="text-[14px] font-semibold">
                        <span className="av-tabular text-[var(--av-muted)]">{i + 1}. </span>
                        {p.action}
                      </strong>
                      {p.priority ? (
                        <StatusPill
                          severity={
                            p.priority.toUpperCase() === "CRITICAL"
                              ? "CRITICAL"
                              : p.priority.toUpperCase() === "HIGH"
                                ? "HIGH"
                                : p.priority.toUpperCase() === "MEDIUM"
                                  ? "MEDIUM"
                                  : "LOW"
                          }
                          label={p.priority}
                        />
                      ) : null}
                    </div>
                    {p.rationale ? <span className="text-[13px] text-[var(--av-muted)]">{p.rationale}</span> : null}
                    {p.deadline ? (
                      <span className="text-[12px] text-[var(--av-muted)]">Délai indicatif : {p.deadline}</span>
                    ) : null}
                  </li>
                ))}
              </ol>
            </SectionBlock>
          ) : null}

          {model.diligenceItems.length > 0 ? (
            <SectionBlock title="Checklist de due diligence">
              <ul className="flex flex-col gap-2.5 text-[14px] text-[var(--av-ink)]">
                {model.diligenceItems.map((it, i) => (
                  <li key={i} className="flex flex-col gap-0.5">
                    <span className="text-[14px] font-medium">{it.item}</span>
                    {it.documentsNeeded.length > 0 ? (
                      <span className="text-[12px] text-[var(--av-muted)]">Documents : {it.documentsNeeded.join(", ")}</span>
                    ) : null}
                    {it.estimatedEffort ? (
                      <span className="text-[12px] text-[var(--av-muted)]">Effort estimé : {it.estimatedEffort}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </SectionBlock>
          ) : null}

          {model.negotiationPoints.length > 0 ? (
            <SectionBlock title="Points de négociation identifiés">
              <ul className="flex flex-col gap-2.5 text-[14px] text-[var(--av-ink)]">
                {model.negotiationPoints.map((n, i) => (
                  <li key={i} className="flex flex-col gap-0.5">
                    <span className="text-[14px] font-medium">{n.point}</span>
                    {n.category ? (
                      <span className="text-[11px] uppercase tracking-wide text-[var(--av-muted)]">{n.category}</span>
                    ) : null}
                    {n.argument ? <span className="text-[13px] text-[var(--av-muted)]">{n.argument}</span> : null}
                  </li>
                ))}
              </ul>
            </SectionBlock>
          ) : null}
        </>
      )}

      <p className="av-note">
        Les éléments ci-dessus consolident les analyses disponibles à un instant T. La décision reste à
        l'investisseur.
      </p>
    </section>
  );
}
