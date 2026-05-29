/**
 * Tier 3 Synthesis Section — Contradictions, Devil's Advocate
 */

import React from "react";
import { View, Text } from "@react-pdf/renderer";
import { styles as gs } from "../pdf-theme";
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
import { s, severityOrder } from "../pdf-helpers";
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
      <SectionTitle>Synthèse (Tier 3)</SectionTitle>

      <ContradictionDetector result={tier3Results["contradiction-detector"]} />
      <DevilsAdvocate result={tier3Results["devils-advocate"]} />
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
  const detectedSorted = [...(detected ?? [])].sort(
    (a, b) => severityOrder(a.severity ?? "") - severityOrder(b.severity ?? ""),
  );

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
      <SubsectionTitle>Contradictions détectées</SubsectionTitle>

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
              { header: "Sévérité", width: 15 },
              { header: "Sources", width: 35 },
              { header: "Confiance", width: 15 },
            ]}
            rows={detectedSorted.map((c) => [
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

          {detectedSorted.map(
            (c, i) =>
              (c.analysis || c.resolution?.reasoning) && (
                <View key={i} style={{ marginBottom: 6 }} wrap={false}>
                  <Text style={gs.bodyBold}>
                    {c.topic ?? "Contradiction"} [{s(c.severity)}]
                  </Text>
                  {c.analysis && <BodyText>{c.analysis}</BodyText>}
                  {c.resolution?.reasoning && (
                    <LabelValue
                      label="Résolution probable"
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
          <H3>Lacunes de données identifiées</H3>
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

  // Phase A slice A3 — `structuralRisks` (D1) remplace `killReasons` legacy.
  const structuralRisks = findings?.structuralRisks as Array<{
    description?: string;
    severity?: string;
    impact?: string;
  }> | undefined;
  const structuralRisksSorted = [...(structuralRisks ?? [])].sort(
    (a, b) => severityOrder(a.severity ?? "") - severityOrder(b.severity ?? ""),
  );

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

      {structuralRisks && structuralRisks.length > 0 && (
        <>
          <H3>Signaux d&apos;alerte critiques</H3>
          <PdfTable
            columns={[
              { header: "Risque", width: 40 },
              { header: "Sévérité", width: 25 },
              { header: "Impact", width: 35 },
            ]}
            rows={structuralRisksSorted.map((r) => [
              s(r.description),
              s(r.severity).replace(/_/g, " "),
              s(r.impact),
            ])}
          />
        </>
      )}

      {worstCase && (
        <>
          <H3>Scénario catastrophe</H3>
          {worstCase.name && <Text style={gs.bodyBold}>{worstCase.name}</Text>}
          {worstCase.description && (
            <BodyText>{worstCase.description}</BodyText>
          )}
          {worstCase.probability !== undefined && (
            <LabelValue
              label="Probabilité"
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
                      label="Perte estimée"
                      value={worstCase.lossAmount.estimatedLoss}
                    />
                  )}
                </>
              ) : (
                <LabelValue
                  label="Perte estimée"
                  value={String(worstCase.lossAmount)}
                />
              )}
            </>
          )}
          {worstCase.triggers && worstCase.triggers.length > 0 && (
            <PdfTable
              columns={[
                { header: "Déclencheur", width: 50 },
                { header: "Probabilité", width: 25 },
                { header: "Délai", width: 25 },
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
          <H3>Angles morts identifiés</H3>
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
          <H3>Objections détaillées</H3>
          {objections.slice(0, 8).map((obj, i) => (
            <View key={i} style={{ marginBottom: 6 }} wrap={false}>
              <Text style={gs.bodyBold}>{obj.title ?? "Objection"}</Text>
              {obj.argument && <BodyText>{obj.argument}</BodyText>}
              {obj.counterpoint && (
                <LabelValue label="Contre-argument" value={obj.counterpoint} />
              )}
              {obj.comparableFailure?.company && (
                <LabelValue
                  label="Échec comparable"
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
                  <Text style={gs.label}>Interprétation alternative:</Text>
                  <Text style={gs.bodyBold}>
                    {alt.alternativeNarrative ?? alt.narrative ?? ""}
                  </Text>
                </>
              )}
              {alt.plausibility !== undefined && (
                <LabelValue
                  label="Plausibilité"
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
          <H3>Synthèse des préoccupations</H3>
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
        "Risques critiques",
        concerns.absolute,
        concerns.absoluteDealbreakers
      )}
      {render(
        "Risques conditionnels",
        concerns.conditional,
        concerns.conditionalDealbreakers
      )}
      {render(
        "Préoccupations sérieuses",
        concerns.serious,
        concerns.seriousConcerns
      )}
      {render(
        "Préoccupations mineures",
        concerns.minor,
        concerns.minorConcerns
      )}
    </>
  );
}

