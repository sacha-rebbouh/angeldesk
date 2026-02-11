/**
 * Tier 3 Synthesis Section — Contradictions, Devil's Advocate, Scenarios
 */

import React from "react";
import { View, Text } from "@react-pdf/renderer";
import { colors, styles as gs } from "../pdf-theme";
import {
  PdfPage,
  SectionTitle,
  SubsectionTitle,
  H3,
  BulletList,
  LabelValue,
  PdfTable,
  Spacer,
  BodyText,
} from "../pdf-components";
import { s, fmtPct } from "../pdf-helpers";
import type { AgentResult } from "../generate-analysis-pdf";

export function Tier3SynthesisSection({
  tier3Results,
  dealName,
}: {
  tier3Results: Record<string, AgentResult>;
  dealName: string;
}) {
  if (Object.keys(tier3Results).length === 0) return null;

  return (
    <PdfPage dealName={dealName}>
      <SectionTitle>Synthese (Tier 3)</SectionTitle>

      <ContradictionDetector result={tier3Results["contradiction-detector"]} />
      <DevilsAdvocate result={tier3Results["devils-advocate"]} />
      <ScenarioModeler result={tier3Results["scenario-modeler"]} />
    </PdfPage>
  );
}

// --- Contradiction Detector ---

function ContradictionDetector({ result }: { result?: AgentResult }) {
  if (!result?.success || !result.data) return null;

  const data = result.data as Record<string, unknown>;
  const findings = data.findings as Record<string, unknown> | undefined;
  const narrative = data.narrative as { summary?: string } | undefined;
  const cScore = data.score as { value?: number; grade?: string } | undefined;

  const detected = (findings?.contradictions ??
    findings?.detectedContradictions) as Array<{
    type?: string;
    severity?: string;
    description?: string;
    topic?: string;
    statement1?: { text?: string; source?: string };
    statement2?: { text?: string; source?: string };
    sourceA?: string;
    sourceB?: string;
    analysis?: string;
    question?: string;
    agentA?: string;
    agentB?: string;
    confidenceLevel?: number;
    resolution?: { likely?: string; reasoning?: string };
  }> | undefined;

  const consistency = findings?.consistencyAnalysis as {
    overallScore?: number;
    interpretation?: string;
  } | undefined;

  const dataGaps = findings?.dataGaps as Array<{
    area?: string;
    description?: string;
    importance?: string;
  }> | undefined;

  const convergence = findings?.redFlagConvergence as Array<{
    topic?: string;
    consensusLevel?: string;
    agentsAgreeing?: string[];
    recommendation?: string;
  }> | undefined;

  return (
    <>
      <SubsectionTitle>Contradictions detectees</SubsectionTitle>

      {cScore?.value !== undefined && (
        <LabelValue
          label="Score consistance"
          value={`${cScore.value}/100 (${cScore.grade ?? "N/A"})`}
        />
      )}

      {consistency?.overallScore !== undefined && (
        <LabelValue
          label="Consistance globale"
          value={`${consistency.overallScore}/100`}
        />
      )}

      {narrative?.summary && <BodyText>{narrative.summary}</BodyText>}
      {consistency?.interpretation && (
        <BodyText>{consistency.interpretation}</BodyText>
      )}

      {detected && detected.length > 0 && (
        <>
          <Spacer size="sm" />
          <PdfTable
            columns={[
              { header: "Sujet", width: 35 },
              { header: "Severite", width: 15 },
              { header: "Sources", width: 35 },
              { header: "Confiance", width: 15 },
            ]}
            rows={detected.slice(0, 20).map((c) => [
              c.topic ?? c.description ?? "N/A",
              s(c.severity),
              [
                c.statement1?.source ?? c.sourceA ?? c.agentA,
                c.statement2?.source ?? c.sourceB ?? c.agentB,
              ]
                .filter(Boolean)
                .join(" vs "),
              c.confidenceLevel ? `${c.confidenceLevel}%` : "N/A",
            ])}
          />

          {detected.slice(0, 8).map(
            (c, i) =>
              (c.analysis || c.resolution?.reasoning) && (
                <View key={i} style={{ marginBottom: 6 }} wrap={false}>
                  <Text style={gs.bodyBold}>
                    {c.topic ?? "Contradiction"} [{s(c.severity)}]
                  </Text>
                  {c.analysis && <BodyText>{c.analysis}</BodyText>}
                  {c.resolution?.reasoning && (
                    <LabelValue
                      label="Resolution probable"
                      value={c.resolution.reasoning}
                    />
                  )}
                  {c.question && (
                    <LabelValue label="Question" value={c.question} />
                  )}
                </View>
              )
          )}
        </>
      )}

      {dataGaps && dataGaps.length > 0 && (
        <>
          <H3>Lacunes de donnees identifiees</H3>
          <PdfTable
            columns={[
              { header: "Domaine", width: 25 },
              { header: "Description", width: 55 },
              { header: "Importance", width: 20 },
            ]}
            rows={dataGaps
              .slice(0, 10)
              .map((g) => [s(g.area), s(g.description), s(g.importance)])}
          />
        </>
      )}

      {convergence && convergence.length > 0 && (
        <>
          <H3>Convergence des red flags</H3>
          <PdfTable
            columns={[
              { header: "Sujet", width: 25 },
              { header: "Consensus", width: 20 },
              { header: "Agents", width: 20 },
              { header: "Recommandation", width: 35 },
            ]}
            rows={convergence.slice(0, 8).map((c) => [
              s(c.topic),
              s(c.consensusLevel),
              (c.agentsAgreeing ?? []).length > 0
                ? `${c.agentsAgreeing!.length} agents`
                : "N/A",
              s(c.recommendation),
            ])}
          />
        </>
      )}
    </>
  );
}

// --- Devil's Advocate ---

function DevilsAdvocate({ result }: { result?: AgentResult }) {
  if (!result?.success || !result.data) return null;

  const data = result.data as Record<string, unknown>;
  const findings = data.findings as Record<string, unknown> | undefined;
  const narrative = data.narrative as { summary?: string } | undefined;
  const dScore = data.score as { value?: number; grade?: string } | undefined;

  const skepticism = findings?.skepticismAssessment as {
    score?: number;
    verdict?: string;
    verdictRationale?: string;
  } | undefined;

  const killReasons = findings?.killReasons as Array<{
    reason?: string;
    dealBreakerLevel?: string;
    impactIfIgnored?: string;
  }> | undefined;

  const worstCase = findings?.worstCaseScenario as {
    name?: string;
    description?: string;
    probability?: number | string;
    probabilityRationale?: string;
    lossAmount?:
      | { totalLoss?: boolean; estimatedLoss?: string; calculation?: string }
      | string;
    triggers?: Array<{
      trigger?: string;
      probability?: string;
      timeframe?: string;
    }>;
    cascadeEffects?: string[];
  } | undefined;

  const blindSpots = findings?.blindSpots as Array<{
    area?: string;
    description?: string;
    whatCouldGoWrong?: string;
  }> | undefined;

  const objections = (findings?.objections ??
    findings?.counterArguments) as Array<{
    title?: string;
    argument?: string;
    counterpoint?: string;
    comparableFailure?: { company?: string; outcome?: string };
  }> | undefined;

  const altNarratives = findings?.alternativeNarratives as Array<{
    currentNarrative?: string;
    alternativeNarrative?: string;
    narrative?: string;
    plausibility?: number;
    probability?: string;
    plausibilityRationale?: string;
    implications?: string;
    implication?: string;
    testToValidate?: string;
    evidenceSupporting?: string[];
  }> | undefined;

  const concerns = findings?.concernsSummary as {
    absolute?: string[] | number;
    conditional?: string[] | number;
    serious?: string[] | number;
    minor?: string[] | number;
    absoluteDealbreakers?: number;
    conditionalDealbreakers?: number;
    seriousConcerns?: number;
    minorConcerns?: number;
  } | undefined;

  return (
    <>
      <SubsectionTitle>Avocat du Diable</SubsectionTitle>

      {dScore?.value !== undefined && (
        <LabelValue
          label="Score"
          value={`${dScore.value}/100 (${dScore.grade ?? "N/A"})`}
        />
      )}

      {skepticism && (
        <>
          {skepticism.score !== undefined && (
            <LabelValue
              label="Score scepticisme"
              value={`${skepticism.score}/100`}
            />
          )}
          {skepticism.verdict && (
            <LabelValue
              label="Verdict"
              value={skepticism.verdict.replace(/_/g, " ")}
            />
          )}
          {skepticism.verdictRationale && (
            <BodyText>{skepticism.verdictRationale}</BodyText>
          )}
        </>
      )}

      {!skepticism && narrative?.summary && (
        <BodyText>{narrative.summary}</BodyText>
      )}

      {killReasons && killReasons.length > 0 && (
        <>
          <H3>Raisons de ne PAS investir</H3>
          <PdfTable
            columns={[
              { header: "Raison", width: 40 },
              { header: "Niveau", width: 25 },
              { header: "Impact si ignore", width: 35 },
            ]}
            rows={killReasons.slice(0, 8).map((k) => [
              s(k.reason),
              s(k.dealBreakerLevel).replace(/_/g, " "),
              s(k.impactIfIgnored),
            ])}
          />
        </>
      )}

      {worstCase && (
        <>
          <H3>Scenario catastrophe</H3>
          {worstCase.name && <Text style={gs.bodyBold}>{worstCase.name}</Text>}
          {worstCase.description && (
            <BodyText>{worstCase.description}</BodyText>
          )}
          {worstCase.probability !== undefined && (
            <LabelValue
              label="Probabilite"
              value={
                typeof worstCase.probability === "number"
                  ? `${worstCase.probability}%`
                  : String(worstCase.probability)
              }
            />
          )}
          {worstCase.lossAmount != null && (
            <>
              {typeof worstCase.lossAmount === "object" ? (
                <>
                  {worstCase.lossAmount.totalLoss && (
                    <LabelValue label="Perte totale" value="OUI" />
                  )}
                  {worstCase.lossAmount.estimatedLoss && (
                    <LabelValue
                      label="Perte estimee"
                      value={worstCase.lossAmount.estimatedLoss}
                    />
                  )}
                </>
              ) : (
                <LabelValue
                  label="Perte estimee"
                  value={String(worstCase.lossAmount)}
                />
              )}
            </>
          )}
          {worstCase.triggers && worstCase.triggers.length > 0 && (
            <PdfTable
              columns={[
                { header: "Declencheur", width: 50 },
                { header: "Probabilite", width: 25 },
                { header: "Delai", width: 25 },
              ]}
              rows={worstCase.triggers
                .slice(0, 5)
                .map((t) => [
                  s(t.trigger),
                  s(t.probability),
                  s(t.timeframe),
                ])}
            />
          )}
          {worstCase.cascadeEffects && worstCase.cascadeEffects.length > 0 && (
            <BulletList items={worstCase.cascadeEffects.slice(0, 5)} />
          )}
        </>
      )}

      {blindSpots && blindSpots.length > 0 && (
        <>
          <H3>Angles morts identifies</H3>
          <BulletList
            items={blindSpots.slice(0, 5).map(
              (b) =>
                `${s(b.area)}: ${s(b.description)}${b.whatCouldGoWrong ? ` — Risque: ${b.whatCouldGoWrong}` : ""}`
            )}
          />
        </>
      )}

      {objections && objections.length > 0 && (
        <>
          <H3>Objections detaillees</H3>
          {objections.slice(0, 8).map((obj, i) => (
            <View key={i} style={{ marginBottom: 6 }} wrap={false}>
              <Text style={gs.bodyBold}>{obj.title ?? "Objection"}</Text>
              {obj.argument && <BodyText>{obj.argument}</BodyText>}
              {obj.counterpoint && (
                <LabelValue label="Contre-argument" value={obj.counterpoint} />
              )}
              {obj.comparableFailure?.company && (
                <LabelValue
                  label="Echec comparable"
                  value={`${obj.comparableFailure.company} — ${s(obj.comparableFailure.outcome)}`}
                />
              )}
            </View>
          ))}
        </>
      )}

      {altNarratives && altNarratives.length > 0 && (
        <>
          <H3>Narratifs alternatifs</H3>
          {altNarratives.slice(0, 5).map((alt, i) => (
            <View key={i} style={{ marginBottom: 6 }} wrap={false}>
              {alt.currentNarrative && (
                <>
                  <Text style={gs.label}>Narratif du fondateur:</Text>
                  <BodyText>{alt.currentNarrative}</BodyText>
                </>
              )}
              {(alt.alternativeNarrative || alt.narrative) && (
                <>
                  <Text style={gs.label}>Interpretation alternative:</Text>
                  <Text style={gs.bodyBold}>
                    {alt.alternativeNarrative ?? alt.narrative ?? ""}
                  </Text>
                </>
              )}
              {alt.plausibility !== undefined && (
                <LabelValue
                  label="Plausibilite"
                  value={`${alt.plausibility}%`}
                />
              )}
              {alt.implications && (
                <LabelValue label="Implications" value={alt.implications} />
              )}
              {alt.testToValidate && (
                <LabelValue
                  label="Test de validation"
                  value={alt.testToValidate}
                />
              )}
            </View>
          ))}
        </>
      )}

      {concerns && (
        <>
          <H3>Synthese des preoccupations</H3>
          <ConcernsList concerns={concerns} />
        </>
      )}
    </>
  );
}

function ConcernsList({
  concerns,
}: {
  concerns: {
    absolute?: string[] | number;
    conditional?: string[] | number;
    serious?: string[] | number;
    minor?: string[] | number;
    absoluteDealbreakers?: number;
    conditionalDealbreakers?: number;
    seriousConcerns?: number;
    minorConcerns?: number;
  };
}) {
  const render = (
    label: string,
    val: string[] | number | undefined,
    fallback: number | undefined
  ) => {
    if (Array.isArray(val) && val.length > 0) {
      return (
        <>
          <Text style={gs.label}>
            {label} ({val.length}):
          </Text>
          <BulletList items={val.slice(0, 5)} />
        </>
      );
    }
    const count = typeof val === "number" ? val : fallback;
    if (count && count > 0) {
      return (
        <BulletList items={[`${label}: ${count}`]} />
      );
    }
    return null;
  };

  return (
    <>
      {render(
        "Dealbreakers absolus",
        concerns.absolute,
        concerns.absoluteDealbreakers
      )}
      {render(
        "Dealbreakers conditionnels",
        concerns.conditional,
        concerns.conditionalDealbreakers
      )}
      {render(
        "Preoccupations serieuses",
        concerns.serious,
        concerns.seriousConcerns
      )}
      {render(
        "Preoccupations mineures",
        concerns.minor,
        concerns.minorConcerns
      )}
    </>
  );
}

// --- Scenario Modeler ---

function ScenarioModeler({ result }: { result?: AgentResult }) {
  if (!result?.success || !result.data) return null;

  const data = result.data as Record<string, unknown>;
  const findings = data.findings as Record<string, unknown> | undefined;
  const narrative = data.narrative as { summary?: string } | undefined;
  const sScore = data.score as { value?: number; grade?: string } | undefined;

  const weighted = findings?.probabilityWeightedOutcome as {
    expectedMultiple?: number;
    expectedMultipleCalculation?: string;
    expectedIRR?: number;
    expectedIrr?: number;
    riskAdjustedAssessment?: string;
  } | undefined;

  const mostLikely = findings?.mostLikelyScenario as string | undefined;
  const mostLikelyRationale = findings?.mostLikelyRationale as
    | string
    | undefined;

  const scenariosList = (findings?.scenarios ?? []) as Array<{
    name?: string;
    description?: string;
    probability?: { value?: number } | number;
    exitOutcome?: {
      exitValuation?: number;
      exitValuationCalculation?: string;
    };
    investorReturn?: {
      multiple?: number;
      irr?: number;
      multipleCalculation?: string;
      irrCalculation?: string;
    };
    basedOnComparable?: { company?: string; similarity?: string };
  }>;

  const sensitivity = findings?.sensitivityAnalysis as Array<{
    variable?: string;
    baseCase?: { value?: number; source?: string } | string;
    impactOnValuation?: Array<{
      change?: string;
      newValuation?: number;
      calculation?: string;
    }>;
    impactLevel?: string;
    impactRationale?: string;
    bestCase?: string;
    worstCase?: string;
    impact?: string;
  }> | undefined;

  const breakEven = findings?.breakEvenAnalysis as {
    monthsToBreakeven?: number;
    requiredGrowthRate?: string;
    burnAssessment?: string;
  } | undefined;

  return (
    <>
      <SubsectionTitle>Scenarios d&apos;investissement</SubsectionTitle>

      {sScore?.value !== undefined && (
        <LabelValue
          label="Score"
          value={`${sScore.value}/100 (${sScore.grade ?? "N/A"})`}
        />
      )}

      {narrative?.summary && <BodyText>{narrative.summary}</BodyText>}

      {weighted && (
        <>
          <H3>Resultat probabiliste</H3>
          {weighted.expectedMultiple !== undefined && (
            <LabelValue
              label="Multiple attendu"
              value={`${weighted.expectedMultiple.toFixed(1)}x`}
            />
          )}
          {weighted.expectedMultipleCalculation && (
            <LabelValue
              label="Calcul"
              value={weighted.expectedMultipleCalculation}
            />
          )}
          {(() => {
            const irr = weighted.expectedIRR ?? weighted.expectedIrr;
            return irr !== undefined ? (
              <LabelValue
                label="IRR attendu"
                value={`${irr.toFixed(1)}%`}
              />
            ) : null;
          })()}
          {weighted.riskAdjustedAssessment && (
            <LabelValue
              label="Eval. risque-ajustee"
              value={weighted.riskAdjustedAssessment}
            />
          )}
        </>
      )}

      {mostLikely && (
        <>
          <LabelValue label="Scenario le + probable" value={mostLikely} />
          {mostLikelyRationale && (
            <BodyText>{mostLikelyRationale}</BodyText>
          )}
        </>
      )}

      {scenariosList.length > 0 && (
        <>
          <PdfTable
            columns={[
              { header: "Scenario", width: 25 },
              { header: "Prob.", width: 12 },
              { header: "Exit Valo", width: 20 },
              { header: "Multiple", width: 18 },
              { header: "IRR", width: 15 },
            ]}
            rows={scenariosList.map((sc) => {
              const prob =
                typeof sc.probability === "number"
                  ? sc.probability
                  : sc.probability?.value;
              const ret = sc.investorReturn;
              return [
                s(sc.name),
                prob !== undefined ? `${prob}%` : "N/A",
                sc.exitOutcome?.exitValuation
                  ? `${(sc.exitOutcome.exitValuation / 1_000_000).toFixed(1)}M`
                  : "N/A",
                ret?.multiple !== undefined
                  ? `${ret.multiple.toFixed(1)}x`
                  : "N/A",
                ret?.irr !== undefined ? `${ret.irr.toFixed(1)}%` : "N/A",
              ];
            })}
          />

          {scenariosList.map((sc, i) => (
            <View key={i} style={{ marginBottom: 6 }} wrap={false}>
              <H3>{s(sc.name)}</H3>
              {sc.description && <BodyText>{sc.description}</BodyText>}
              {sc.investorReturn?.multipleCalculation && (
                <LabelValue
                  label="Calcul multiple"
                  value={s(sc.investorReturn.multipleCalculation)}
                />
              )}
              {sc.exitOutcome?.exitValuationCalculation && (
                <LabelValue
                  label="Calcul exit"
                  value={sc.exitOutcome.exitValuationCalculation}
                />
              )}
              {sc.basedOnComparable?.company && (
                <LabelValue
                  label="Comparable"
                  value={`${sc.basedOnComparable.company} (${s(sc.basedOnComparable.similarity)})`}
                />
              )}
            </View>
          ))}
        </>
      )}

      {sensitivity && sensitivity.length > 0 && (
        <>
          <H3>Analyse de sensibilite</H3>
          {sensitivity.some(
            (sv) => sv.impactOnValuation && Array.isArray(sv.impactOnValuation)
          )
            ? sensitivity.slice(0, 6).map((sv, i) => (
                <View key={i} style={{ marginBottom: 6 }} wrap={false}>
                  <Text style={gs.bodyBold}>
                    {s(sv.variable)} [{s(sv.impactLevel)}]
                  </Text>
                  {typeof sv.baseCase === "object" && sv.baseCase ? (
                    <LabelValue
                      label="Cas de base"
                      value={`${s(sv.baseCase.value)} (source: ${s(sv.baseCase.source)})`}
                    />
                  ) : sv.baseCase ? (
                    <LabelValue
                      label="Cas de base"
                      value={String(sv.baseCase)}
                    />
                  ) : null}
                  {sv.impactRationale && (
                    <BodyText>{sv.impactRationale}</BodyText>
                  )}
                  {sv.impactOnValuation && sv.impactOnValuation.length > 0 && (
                    <PdfTable
                      columns={[
                        { header: "Variation", width: 20 },
                        { header: "Nouvelle valo", width: 25 },
                        { header: "Calcul", width: 55 },
                      ]}
                      rows={sv.impactOnValuation.slice(0, 4).map((iv) => [
                        s(iv.change),
                        iv.newValuation
                          ? `${(iv.newValuation / 1_000_000).toFixed(1)}M`
                          : "N/A",
                        s(iv.calculation),
                      ])}
                    />
                  )}
                </View>
              ))
            : (
              <PdfTable
                columns={[
                  { header: "Variable", width: 25 },
                  { header: "Base", width: 18 },
                  { header: "Meilleur", width: 18 },
                  { header: "Pire", width: 18 },
                  { header: "Impact", width: 21 },
                ]}
                rows={sensitivity.slice(0, 8).map((sv) => [
                  s(sv.variable),
                  typeof sv.baseCase === "object"
                    ? s(
                        (sv.baseCase as Record<string, unknown>)?.value
                      )
                    : s(sv.baseCase),
                  s(sv.bestCase),
                  s(sv.worstCase),
                  s(sv.impact),
                ])}
              />
            )}
        </>
      )}

      {breakEven && (
        <>
          <H3>Analyse du break-even</H3>
          {breakEven.monthsToBreakeven != null && (
            <LabelValue
              label="Mois jusqu'au break-even"
              value={String(breakEven.monthsToBreakeven)}
            />
          )}
          {breakEven.requiredGrowthRate != null && (
            <LabelValue
              label="Croissance requise"
              value={breakEven.requiredGrowthRate}
            />
          )}
          {breakEven.burnAssessment && (
            <LabelValue
              label="Evaluation burn"
              value={breakEven.burnAssessment}
            />
          )}
        </>
      )}
    </>
  );
}
