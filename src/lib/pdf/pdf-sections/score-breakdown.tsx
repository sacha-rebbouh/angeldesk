/**
 * Score Breakdown Section — synthesis-deal-scorer results
 *
 * Aligné sur la doctrine V2 : on n'expose plus la décomposition par dimension,
 * le positionnement comparatif (comparativeRanking), la recommandation
 * d'investissement, ni les forces/faiblesses du scorer — le front V2 ignore
 * tous ces champs. On garde le score global + verdict + risques critiques.
 */

import React from "react";
import { View, Text } from "@react-pdf/renderer";
import { colors, styles as gs } from "../pdf-theme";
import {
  PdfPage,
  SectionTitle,
  SubsectionTitle,
  BulletList,
  ScoreCircle,
  BodyText,
} from "../pdf-components";
import { sup } from "../pdf-helpers";
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
      {!thesisGated && (
        <View
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
        </View>
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
