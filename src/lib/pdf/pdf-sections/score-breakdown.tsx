/**
 * Score Breakdown Section — synthesis-deal-scorer results
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
  ScoreCircle,
  ScoreBar,
  Spacer,
  RecommendationBadge,
  TwoColumn,
  BodyText,
} from "../pdf-components";
import { fmtWeight, sup } from "../pdf-helpers";
import type { AgentResult, PdfExportData } from "../generate-analysis-pdf";
import { hasFragileThesis } from "../thesis-gating";

export function ScoreBreakdownSection({
  results,
  dealName,
  thesis,
}: {
  results: Record<string, AgentResult>;
  dealName: string;
  thesis: PdfExportData["thesis"];
}) {
  const scorerResult = results["synthesis-deal-scorer"];
  if (!scorerResult?.success || !scorerResult.data) return null;

  const data = scorerResult.data as Record<string, unknown>;
  const score = (data.overallScore as number) ?? 0;
  const verdict = (data.verdict as string) ?? "N/A";
  const confidence = (data.confidence as number) ?? 0;

  const breakdown = data.scoreBreakdown as {
    strengthsContribution?: number;
    weaknessesDeduction?: number;
    riskAdjustment?: number;
    opportunityBonus?: number;
  } | undefined;

  const ranking = data.comparativeRanking as {
    percentileOverall?: number;
    percentileSector?: number;
    percentileStage?: number;
    similarDealsAnalyzed?: number;
  } | undefined;

  const dimensions = data.dimensionScores as Array<{
    dimension: string;
    score: number;
    weight: number;
    weightedScore: number;
    keyFactors?: string[];
  }> | undefined;

  const rec = data.investmentRecommendation as {
    action?: string;
    rationale?: string;
    conditions?: string[];
  } | undefined;

  const strengths = data.keyStrengths as string[] | undefined;
  const weaknesses = data.keyWeaknesses as string[] | undefined;
  const criticalRisks = data.criticalRisks as string[] | undefined;
  const thesisQuality = thesis?.evaluationAxes.thesisQuality;
  const thesisGated = hasFragileThesis(thesis);

  return (
    <PdfPage dealName={dealName}>
      <SectionTitle>Score &amp; Verdict</SectionTitle>

      {thesisGated && thesisQuality && (
        <View style={{ marginBottom: 16 }}>
          <BodyText>
            Le score global est secondaire tant que la thèse reste fragile. Référence canonique: Thesis Quality = {thesisQuality.verdict}.
          </BodyText>
          <BodyText>{thesisQuality.summary}</BodyText>
        </View>
      )}

      {/* Score display */}
      {!thesisGated && <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <ScoreCircle score={score} size={70} />
        <View style={{ marginLeft: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: 700, color: colors.dark }}>
            {sup(verdict).replace(/_/g, " ")}
          </Text>
          <Text style={[gs.body, { marginTop: 2 }]}>
            Score global: {score}/100 — Confiance: {confidence}%
          </Text>
        </View>
      </View>}

      {/* Score breakdown */}
      {breakdown && !thesisGated && (
        <>
          <SubsectionTitle>Decomposition du score</SubsectionTitle>
          <PdfTable
            columns={[
              { header: "Composante", width: 60 },
              { header: "Points", width: 40 },
            ]}
            rows={[
              ...(breakdown.strengthsContribution !== undefined
                ? [["Forces (contribution)", `+${breakdown.strengthsContribution}`]]
                : []),
              ...(breakdown.weaknessesDeduction !== undefined
                ? [["Faiblesses (deduction)", `${breakdown.weaknessesDeduction}`]]
                : []),
              ...(breakdown.riskAdjustment !== undefined
                ? [["Ajustement risque", `${breakdown.riskAdjustment}`]]
                : []),
              ...(breakdown.opportunityBonus !== undefined
                ? [["Bonus opportunite", `+${breakdown.opportunityBonus}`]]
                : []),
              ["Score final", `${score}/100`],
            ]}
          />
        </>
      )}

      {/* Comparative ranking */}
      {ranking && !thesisGated && (
        <>
          <SubsectionTitle>Positionnement comparatif</SubsectionTitle>
          {ranking.percentileOverall !== undefined && (
            <LabelValue
              label="Percentile global"
              value={`Top ${100 - ranking.percentileOverall}%`}
            />
          )}
          {ranking.percentileSector !== undefined && (
            <LabelValue
              label="Percentile secteur"
              value={`Top ${100 - ranking.percentileSector}%`}
            />
          )}
          {ranking.percentileStage !== undefined && (
            <LabelValue
              label="Percentile stage"
              value={`Top ${100 - ranking.percentileStage}%`}
            />
          )}
          {ranking.similarDealsAnalyzed !== undefined && (
            <LabelValue
              label="Deals compares"
              value={String(ranking.similarDealsAnalyzed)}
            />
          )}
        </>
      )}

      {/* Dimension scores with score bars */}
      {dimensions && dimensions.length > 0 && !thesisGated && (
        <>
          <SubsectionTitle>Scores par dimension</SubsectionTitle>
          {dimensions.map((d, i) => (
            <ScoreBar
              key={i}
              score={d.score}
              label={`${d.dimension} (${fmtWeight(d.weight)})`}
            />
          ))}
          <Spacer />
          <PdfTable
            columns={[
              { header: "Dimension", width: 25 },
              { header: "Score", width: 15 },
              { header: "Poids", width: 15 },
              { header: "Pondere", width: 15 },
              { header: "Facteurs cles", width: 30 },
            ]}
            rows={dimensions.map((d) => [
              d.dimension,
              `${d.score}/100`,
              fmtWeight(d.weight),
              `${d.weightedScore.toFixed(1)}`,
              (d.keyFactors ?? []).slice(0, 2).join(", "),
            ])}
          />
        </>
      )}

      {/* Investment recommendation */}
      {rec && !thesisGated && (
        <>
          <SubsectionTitle>Recommandation d&apos;investissement</SubsectionTitle>
          {rec.action && <RecommendationBadge recommendation={rec.action} />}
          {rec.rationale && (
            <BodyText>{rec.rationale}</BodyText>
          )}
          {rec.conditions && rec.conditions.length > 0 && (
            <>
              <H3>Conditions</H3>
              <BulletList items={rec.conditions} />
            </>
          )}
        </>
      )}

      {/* Strengths & Weaknesses */}
      {((strengths && strengths.length > 0) ||
        (weaknesses && weaknesses.length > 0)) && (
        <TwoColumn
          left={
            strengths && strengths.length > 0 ? (
              <>
                <SubsectionTitle>Forces</SubsectionTitle>
                <BulletList items={strengths} />
              </>
            ) : null
          }
          right={
            weaknesses && weaknesses.length > 0 ? (
              <>
                <SubsectionTitle>Faiblesses</SubsectionTitle>
                <BulletList items={weaknesses} />
              </>
            ) : null
          }
        />
      )}

      {/* Critical risks */}
      {criticalRisks && criticalRisks.length > 0 && (
        <>
          <SubsectionTitle>Risques critiques</SubsectionTitle>
          <BulletList items={criticalRisks} />
        </>
      )}
    </PdfPage>
  );
}
