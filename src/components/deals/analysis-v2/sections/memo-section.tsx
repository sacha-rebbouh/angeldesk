import { PartialBanner } from "../atoms/partial-banner";
import { SourcePin } from "../atoms/source-pin";
import { StatusPill } from "../atoms/status-pill";
import { nextStepOwnerLabel, nextStepPriorityLabel, parseNextStep } from "@/lib/ui-configs";
import { inferRedFlagTopic } from "@/services/red-flag-dedup/dedup";
import type { MemoSectionModel } from "../lib/selectors";

function NextStepItem({ index, raw }: { index: number; raw: string }) {
  const step = parseNextStep(raw);
  const prio = nextStepPriorityLabel(step.priority);
  const owner = nextStepOwnerLabel(step.owner);
  return (
    <li className="flex gap-2">
      <span className="av-tabular text-[var(--av-muted)]">{index + 1}.</span>
      <div className="flex flex-1 flex-col gap-1">
        {prio || owner ? (
          <div className="flex flex-wrap gap-1.5">
            {prio ? (
              <span className="rounded-full bg-[var(--av-surface-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--av-ink)]" style={{ border: "1px solid var(--av-line-strong)" }}>
                {prio}
              </span>
            ) : null}
            {owner ? (
              <span className="rounded-full px-2 py-0.5 text-[11px] text-[var(--av-muted)]" style={{ border: "1px solid var(--av-line)" }}>
                {owner}
              </span>
            ) : null}
          </div>
        ) : null}
        <span>{step.text}</span>
      </div>
    </li>
  );
}

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

/**
 * #21 : pointe vers la liste complète quand le mémo généré n'en montre qu'une
 * sélection éditoriale. Compte les TOPICS CRITICAL DISTINCTS affichés (pas les
 * lignes brutes, qui peuvent contenir des doublons ou des HIGH) et se rend en
 * STANDALONE — même si le bloc éditorial de risques est absent (Codex).
 */
function CompleteRisksHint({
  criticalRisks,
  total,
}: {
  criticalRisks: Array<{ title: string; severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO" }>;
  total: number;
}) {
  const shownCriticalTopics = new Set(
    criticalRisks.filter((r) => r.severity === "CRITICAL").map((r) => inferRedFlagTopic(r.title)),
  ).size;
  if (total <= shownCriticalTopics) return null;
  return (
    <p className="text-[12px] text-[var(--av-muted)]">
      {total} risques critiques identifiés au total — voir{" "}
      <a href="#decision" className="font-medium text-[var(--av-info)] underline-offset-2 hover:underline">
        « Synthèse de décision »
      </a>{" "}
      pour la liste complète.
    </p>
  );
}

type Priority = { action: string; rationale: string | null; deadline: string | null; priority: string | null };

function PrioritiesList({ priorities }: { priorities: Priority[] }) {
  return (
    <ol className="flex flex-col gap-3 text-[14px] text-[var(--av-ink)]">
      {priorities.map((p, i) => (
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
          {p.deadline ? <span className="text-[12px] text-[var(--av-muted)]">Délai indicatif : {p.deadline}</span> : null}
        </li>
      ))}
    </ol>
  );
}

// Phase 5 (Option B) — blocs riches du mémo autonome. Types dérivés du modèle
// (pas de duplication de shape).
type GeneratedMemo = Extract<MemoSectionModel, { kind: "generated" }>;

function ProseBlock({ title, text }: { title: string; text: string | null }) {
  if (!text) return null;
  return (
    <SectionBlock title={title}>
      <p className="text-[14px] leading-relaxed text-[var(--av-ink)]">{text}</p>
    </SectionBlock>
  );
}

function HighlightsBlock({ items }: { items: GeneratedMemo["investmentHighlights"] }) {
  if (items.length === 0) return null;
  return (
    <SectionBlock title="Points forts étayés">
      <ul className="flex flex-col gap-3 text-[14px] text-[var(--av-ink)]">
        {items.map((h, i) => (
          <li key={i} className="flex flex-col gap-1">
            <div className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--av-favorable)]" />
              <strong className="flex-1 text-[14px] font-semibold leading-snug">{h.highlight}</strong>
              {h.source ? <SourcePin source={h.source} className="mt-0.5" /> : null}
            </div>
            {h.evidence ? <span className="pl-3.5 text-[13px] text-[var(--av-muted)]">{h.evidence}</span> : null}
            {h.dbComparable ? <span className="pl-3.5 text-[12px] text-[var(--av-muted)]">Comparable : {h.dbComparable}</span> : null}
          </li>
        ))}
      </ul>
    </SectionBlock>
  );
}

function KeyRisksBlock({ items }: { items: GeneratedMemo["keyRisks"] }) {
  if (items.length === 0) return null;
  return (
    <SectionBlock title="Risques clés et mitigation">
      <ul className="flex flex-col gap-3 text-[14px] text-[var(--av-ink)]">
        {items.map((r, i) => (
          <li key={i} className="flex flex-col gap-1">
            <div className="flex items-start gap-2">
              {r.severity && r.severityLabel ? <StatusPill severity={r.severity} label={r.severityLabel} /> : null}
              <strong className="flex-1 text-[14px] font-semibold leading-snug">{r.risk}</strong>
              {r.source ? <SourcePin source={r.source} className="mt-0.5" /> : null}
            </div>
            {r.mitigation ? <span className="pl-1 text-[13px] text-[var(--av-muted)]">Mitigation : {r.mitigation}</span> : null}
            {r.residualRisk ? <span className="pl-1 text-[12px] text-[var(--av-muted)]">Risque résiduel : {r.residualRisk}</span> : null}
          </li>
        ))}
      </ul>
    </SectionBlock>
  );
}

function FinancialSummaryBlock({ data }: { data: GeneratedMemo["financialSummary"] }) {
  if (!data) return null;
  return (
    <SectionBlock title="Synthèse financière">
      {data.metrics.length > 0 ? (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {data.metrics.map((m, i) => (
            <div
              key={i}
              className="flex flex-col rounded-lg bg-[var(--av-surface-muted)] px-3 py-2"
              style={{ border: "1px solid var(--av-line)" }}
            >
              <dt className="text-[11px] uppercase tracking-wide text-[var(--av-muted)]">{m.label}</dt>
              <dd className="av-tabular text-[14px] font-semibold text-[var(--av-ink)]">{m.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {data.valuationAssessment ? <p className="text-[13px] text-[var(--av-ink)]">{data.valuationAssessment}</p> : null}
      {data.projections ? <p className="text-[13px] text-[var(--av-muted)]">{data.projections}</p> : null}
    </SectionBlock>
  );
}

function TermItems({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] uppercase tracking-wide text-[var(--av-muted)]">{label}</span>
      <ul className="flex flex-col gap-1">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden="true" className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-[var(--av-muted)]" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DealTermsBlock({ data }: { data: GeneratedMemo["dealTerms"] }) {
  if (!data) return null;
  return (
    <SectionBlock title="Termes du deal">
      <div className="flex flex-col gap-2 text-[14px] text-[var(--av-ink)]">
        {data.valuation ? (
          <div>
            <span className="text-[var(--av-muted)]">Valorisation : </span>
            {data.valuation}
          </div>
        ) : null}
        {data.roundSize ? (
          <div>
            <span className="text-[var(--av-muted)]">Tour : </span>
            {data.roundSize}
          </div>
        ) : null}
        <TermItems label="Termes clés" items={data.keyTerms} />
        <TermItems label="Points de négociation" items={data.negotiationPoints} />
      </div>
    </SectionBlock>
  );
}

function DueDiligenceBlock({ data }: { data: GeneratedMemo["dueDiligence"] }) {
  if (!data) return null;
  return (
    <SectionBlock title="Due diligence">
      <div className="flex flex-col gap-3">
        {data.completed.length > 0 ? (
          <div className="flex flex-col gap-1">
            <span className="text-[12px] uppercase tracking-wide text-[var(--av-muted)]">Réalisée</span>
            <ul className="flex flex-col gap-1 text-[13px] text-[var(--av-ink)]">
              {data.completed.map((t, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden="true" className="text-[var(--av-favorable)]">✓</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {data.outstanding.length > 0 ? (
          <div className="flex flex-col gap-1">
            <span className="text-[12px] uppercase tracking-wide text-[var(--av-muted)]">À compléter</span>
            <ul className="flex flex-col gap-1 text-[13px] text-[var(--av-ink)]">
              {data.outstanding.map((t, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden="true" className="text-[var(--av-muted)]">○</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </SectionBlock>
  );
}

export function MemoSection({ model }: { model: MemoSectionModel }) {
  return (
    <section id="memo" className="flex scroll-mt-44 flex-col gap-5">
      <header className="flex flex-col gap-1">
        <span className="av-eyebrow">Section 5</span>
        <h2 className="av-h2">Mémo synthétique</h2>
        <p className="av-note">
          Synthèse factuelle des signaux, preuves et zones d'incertitude.
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
          <HighlightsBlock items={model.investmentHighlights} />
          <ProseBlock title="Opportunité de marché" text={model.marketOpportunity} />
          <ProseBlock title="Paysage concurrentiel" text={model.competitiveLandscape} />
          <ProseBlock title="Évaluation de l'équipe" text={model.teamAssessment} />
          <FinancialSummaryBlock data={model.financialSummary} />
          <DealTermsBlock data={model.dealTerms} />
          {model.criticalRisks.length > 0 ? (
            <SectionBlock title="Risques critiques">
              <ul className="flex flex-col gap-3 text-[14px] text-[var(--av-ink)]">
                {model.criticalRisks.map((r, i) => (
                  <li key={i} className="flex flex-col gap-1">
                    <div className="flex items-start gap-2">
                      <StatusPill severity={r.severity} label={r.severityLabel} />
                      <strong className="flex-1 text-[14px] font-semibold leading-snug">{r.title}</strong>
                      {r.source ? <SourcePin source={r.source} className="mt-0.5" /> : null}
                    </div>
                    {r.detail ? <span className="pl-1 text-[13px] text-[var(--av-muted)]">{r.detail}</span> : null}
                  </li>
                ))}
              </ul>
            </SectionBlock>
          ) : null}
          {/* Standalone : se rend même si le bloc éditorial de risques est absent (#21). */}
          <CompleteRisksHint criticalRisks={model.criticalRisks} total={model.totalCriticalRisks} />
          <KeyRisksBlock items={model.keyRisks} />
          <DueDiligenceBlock data={model.dueDiligence} />
          {model.nextSteps.length > 0 ? (
            <SectionBlock title="Prochaines étapes">
              <ol className="flex flex-col gap-2.5 text-[14px] text-[var(--av-ink)]">
                {model.nextSteps.map((s, i) => (
                  <NextStepItem key={i} index={i} raw={s} />
                ))}
              </ol>
            </SectionBlock>
          ) : null}
          {model.topPriorities.length > 0 ? (
            <SectionBlock title="Priorités d'investigation">
              <PrioritiesList priorities={model.topPriorities} />
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
                  <li key={i} className="flex items-start gap-2">
                    <span aria-hidden="true" className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--av-favorable)]" />
                    <span className="flex-1">{s.text}</span>
                    <SourcePin source={s.source} className="mt-0.5" />
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
                    <div className="flex items-start gap-1.5">
                      <strong className="text-[14px] font-semibold flex-1">{r.title}</strong>
                      <SourcePin source={r.source} className="mt-0.5" />
                    </div>
                    {r.detail ? <span className="text-[13px] text-[var(--av-muted)]">{r.detail}</span> : null}
                  </li>
                ))}
              </ul>
            </SectionBlock>
          ) : null}

          {model.topPriorities.length > 0 ? (
            <SectionBlock title="Priorités d'investigation">
              <PrioritiesList priorities={model.topPriorities} />
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
        Les éléments ci-dessus consolident les analyses disponibles à un instant T.
      </p>
    </section>
  );
}
