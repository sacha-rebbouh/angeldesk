/**
 * Executive Summary Section — from memo-generator agent
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
  RecommendationBadge,
  BodyText,
} from "../pdf-components";
import { s, sup } from "../pdf-helpers";
import { isThesisAxisUnavailable } from "@/agents/thesis/types";
import type { AgentResult, PdfExportData } from "../generate-analysis-pdf";
import { hasFragileThesis } from "../thesis-gating";

export function ExecutiveSummarySection({
  results,
  dealName,
  thesis,
}: {
  results: Record<string, AgentResult>;
  dealName: string;
  thesis: PdfExportData["thesis"];
}) {
  const memoResult = results["memo-generator"];
  if (!memoResult?.success || !memoResult.data) return null;

  const data = memoResult.data as Record<string, unknown>;
  const exec = data.executiveSummary as {
    oneLiner?: string;
    recommendation?: string;
    keyPoints?: string[];
  } | undefined;
  const overview = data.companyOverview as Record<string, string> | undefined;
  const highlights = data.investmentHighlights as Array<{
    highlight: string;
    evidence: string;
  }> | undefined;
  const risks = data.keyRisks as Array<{
    risk: string;
    mitigation: string;
    residualRisk: string;
  }> | undefined;
  const financial = data.financialSummary as Record<string, unknown> | undefined;
  const memoThesis = data.investmentThesis;
  const ddFindings = data.dueDiligenceFindings;
  const nextSteps = data.nextSteps as string[] | undefined;
  const thesisGated = hasFragileThesis(thesis);

  return (
    <PdfPage dealName={dealName}>
      <View>
      <SectionTitle>Executive Summary</SectionTitle>

      {/* One-liner */}
      {exec?.oneLiner && (
        <Text style={[gs.h3, { marginBottom: 8 }]}>{exec.oneLiner}</Text>
      )}

      {thesis && (
        <View style={{ marginBottom: 10 }}>
          <Text style={[gs.label, { marginBottom: 4 }]}>THÈSE CANONIQUE</Text>
          <BodyText>{thesis.reformulated}</BodyText>
          <LabelValue
            label="Thesis Quality"
            value={isThesisAxisUnavailable(thesis.evaluationAxes.thesisQuality) ? "INDISPONIBLE" : sup(thesis.evaluationAxes.thesisQuality.verdict)}
          />
          <LabelValue
            label="Investor Profile Fit"
            value={isThesisAxisUnavailable(thesis.evaluationAxes.investorProfileFit) ? "INDISPONIBLE" : sup(thesis.evaluationAxes.investorProfileFit.verdict)}
          />
          <LabelValue
            label="Deal Accessibility"
            value={isThesisAxisUnavailable(thesis.evaluationAxes.dealAccessibility) ? "INDISPONIBLE" : sup(thesis.evaluationAxes.dealAccessibility.verdict)}
          />
        </View>
      )}

      {/* Recommendation badge */}
      {exec?.recommendation && !thesisGated && (
        <View style={{ marginBottom: 10 }}>
          <Text style={[gs.label, { marginBottom: 4 }]}>LECTURE TIER 3</Text>
          <RecommendationBadge recommendation={exec.recommendation} />
        </View>
      )}

      {/* Key points */}
      {exec?.keyPoints && exec.keyPoints.length > 0 && (
        <>
          <H3>Points cles</H3>
          <BulletList items={exec.keyPoints} />
        </>
      )}

      {/* Company overview */}
      {!!overview && (
        <>
          <SubsectionTitle>Presentation</SubsectionTitle>
          {overview.description && (
            <BodyText>{overview.description}</BodyText>
          )}
          <Spacer size="sm" />
          {overview.problem && (
            <LabelValue label="Probleme" value={overview.problem} />
          )}
          {overview.solution && (
            <LabelValue label="Solution" value={overview.solution} />
          )}
          {overview.businessModel && (
            <LabelValue label="Business Model" value={overview.businessModel} />
          )}
          {overview.traction && (
            <LabelValue label="Traction" value={overview.traction} />
          )}
        </>
      )}

      {/* Investment highlights */}
      {!!(highlights && highlights.length > 0) && (
        <>
          <SubsectionTitle>Points forts de l&apos;investissement</SubsectionTitle>
          <BulletList
            items={highlights.map((h) => `${h.highlight} — ${h.evidence}`)}
          />
        </>
      )}

      {/* Key risks */}
      {!!(risks && risks.length > 0) && (
        <>
          <SubsectionTitle>Risques principaux</SubsectionTitle>
          <PdfTable
            columns={[
              { header: "Risque", width: 35 },
              { header: "Mitigation", width: 40 },
              { header: "Residuel", width: 25 },
            ]}
            rows={risks.map((r) => [
              r.risk,
              r.mitigation,
              sup(r.residualRisk),
            ])}
          />
        </>
      )}

      {/* Financial summary */}
      {!!financial && (
        <>
          <SubsectionTitle>Resume financier</SubsectionTitle>
          {financial.valuationAssessment && (
            <LabelValue
              label="Valorisation"
              value={String(financial.valuationAssessment)}
            />
          )}
          {financial.projections && (
            <LabelValue
              label="Projections"
              value={String(financial.projections)}
            />
          )}
          {(() => {
            const metrics = financial.currentMetrics as Record<string, string | number> | undefined;
            if (!metrics) return null;
            const entries = Object.entries(metrics).slice(0, 8);
            if (entries.length === 0) return null;
            return (
              <PdfTable
                columns={[
                  { header: "Metrique", width: 50 },
                  { header: "Valeur", width: 50 },
                ]}
                rows={entries.map(([k, v]) => [k, String(v)])}
              />
            );
          })()}
        </>
      )}

      {/* Team & Market */}
      {!!data.teamAssessment && (
        <>
          <SubsectionTitle>Equipe</SubsectionTitle>
          <BodyText>{String(data.teamAssessment)}</BodyText>
        </>
      )}
      {!!data.marketOpportunity && (
        <>
          <SubsectionTitle>Marche</SubsectionTitle>
          <BodyText>{String(data.marketOpportunity)}</BodyText>
        </>
      )}
      {!!data.competitiveLandscape && (
        <>
          <SubsectionTitle>Paysage concurrentiel</SubsectionTitle>
          <BodyText>{String(data.competitiveLandscape)}</BodyText>
        </>
      )}

      {/* Deal terms */}
      {(() => {
        const dt = data.dealTerms as {
          valuation?: string;
          roundSize?: string;
          keyTerms?: string[];
        } | undefined;
        if (!dt) return null;
        return (
          <>
            <SubsectionTitle>Termes du deal</SubsectionTitle>
            {dt.valuation && (
              <LabelValue label="Valorisation" value={dt.valuation} />
            )}
            {dt.roundSize && (
              <LabelValue label="Taille du tour" value={dt.roundSize} />
            )}
            {dt.keyTerms && dt.keyTerms.length > 0 && (
              <>
                <H3>Termes cles</H3>
                <BulletList items={dt.keyTerms} />
              </>
            )}
          </>
        );
      })()}

      {/* Investment thesis */}
      {!!memoThesis && (
        <>
          <SubsectionTitle>These d&apos;investissement (memo)</SubsectionTitle>
          {typeof memoThesis === "string" ? (
            <BodyText>{memoThesis}</BodyText>
          ) : typeof memoThesis === "object" ? (
            <>
              {!!(memoThesis as Record<string, unknown>).thesis && (
                <BodyText>
                  {String((memoThesis as Record<string, unknown>).thesis)}
                </BodyText>
              )}
              {!!(memoThesis as Record<string, unknown>).conviction && (
                <LabelValue
                  label="Conviction"
                  value={sup((memoThesis as Record<string, unknown>).conviction)}
                />
              )}
              {Array.isArray(
                (memoThesis as Record<string, unknown>).keyAssumptions
              ) && (
                <>
                  <H3>Hypotheses cles</H3>
                  <BulletList
                    items={(
                      (memoThesis as Record<string, unknown>)
                        .keyAssumptions as unknown[]
                    ).map(String)}
                  />
                </>
              )}
            </>
          ) : null}
        </>
      )}

      {/* DD findings */}
      {!!(ddFindings && typeof ddFindings === "object" && !Array.isArray(ddFindings)) && (
        <>
          <SubsectionTitle>Conclusions de Due Diligence</SubsectionTitle>
          {(() => {
            const dd = ddFindings as {
              completed?: string[];
              outstanding?: string[];
              redFlags?: string[];
            };
            return (
              <>
                {dd.completed && dd.completed.length > 0 && (
                  <>
                    <H3>DD completee</H3>
                    <BulletList items={dd.completed} />
                  </>
                )}
                {dd.outstanding && dd.outstanding.length > 0 && (
                  <>
                    <H3>DD en cours / a faire</H3>
                    <BulletList items={dd.outstanding} />
                  </>
                )}
                {dd.redFlags && dd.redFlags.length > 0 && (
                  <>
                    <H3>Red flags DD</H3>
                    <BulletList items={dd.redFlags} />
                  </>
                )}
              </>
            );
          })()}
        </>
      )}
      {Array.isArray(ddFindings) && ddFindings.length > 0 && (
        <>
          <SubsectionTitle>Conclusions de Due Diligence</SubsectionTitle>
          <PdfTable
            columns={[
              { header: "Domaine", width: 20 },
              { header: "Constatation", width: thesisGated ? 50 : 35 },
              { header: "Severite", width: 15 },
              ...(!thesisGated ? [{ header: "Recommandation", width: 30 }] : []),
            ]}
            rows={(ddFindings as Array<Record<string, unknown>>)
              .slice(0, 10)
              .map((d) =>
                thesisGated
                  ? [s(d.area), s(d.finding), s(d.severity)]
                  : [s(d.area), s(d.finding), s(d.severity), s(d.recommendation)]
              )}
          />
        </>
      )}

      {/* Next steps */}
      {!!(nextSteps && nextSteps.length > 0) && !thesisGated && (
        <>
          <SubsectionTitle>Prochaines etapes</SubsectionTitle>
          <BulletList items={nextSteps} />
        </>
      )}

      {/* Exit strategy */}
      {!!data.exitStrategy && (
        <>
          <SubsectionTitle>Strategie de sortie</SubsectionTitle>
          <BodyText>{String(data.exitStrategy)}</BodyText>
        </>
      )}
      </View>
    </PdfPage>
  );
}
