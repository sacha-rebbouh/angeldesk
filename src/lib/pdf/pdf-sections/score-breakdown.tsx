/**
 * Signal Profile Section — synthesis-deal-scorer results (scoreless).
 *
 * Doctrine dé-scorisation (§ « Restitution analytique — aucune note de deal ») :
 * AUCUNE note de deal restituée. On présente le modèle à 2 axes verbal —
 * orientation du signal (taxonomie doctrine 4 valeurs, lue via le bi-reader
 * scoreless `readDoctrineOrientation`, jamais dérivée d'un score) × solidité des
 * preuves (déterministe, service evidence-solidity) — puis les risques critiques.
 * Plus de score /100, plus de grade, plus de « Confiance » globale.
 */

import React from "react";
import { View, Text } from "@react-pdf/renderer";
import { colors, styles as gs } from "../pdf-theme";
import {
  PdfPage,
  SectionTitle,
  SubsectionTitle,
  BulletList,
  BodyText,
} from "../pdf-components";
import { proofLabel } from "../pdf-helpers";
import type { AgentResult, PdfExportData } from "../generate-analysis-pdf";
import { hasFragileThesis } from "../thesis-gating";
import {
  readDoctrineOrientation,
  DOCTRINE_ORIENTATION_CONFIG,
} from "@/services/signal-profile";

function AxisValue({ eyebrow, value }: { eyebrow: string; value: string }) {
  return (
    <View>
      <Text style={gs.label}>{eyebrow}</Text>
      <Text style={{ fontSize: 14, fontWeight: 700, color: colors.dark, marginTop: 2 }}>
        {value}
      </Text>
    </View>
  );
}

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
  const criticalRisks = data.criticalRisks as string[] | undefined;
  const thesisQuality = thesis?.evaluationAxes.thesisQuality;
  const thesisGated = hasFragileThesis(thesis);

  // Axe 1 — orientation du signal (doctrine 4 valeurs) via le bi-reader
  // scoreless : forme nouvelle (signalProfile) puis verdict legacy, jamais
  // dérivée d'un score.
  const { orientation } = readDoctrineOrientation(results);
  const orientationLabel = orientation
    ? DOCTRINE_ORIENTATION_CONFIG[orientation].label.toUpperCase()
    : "ORIENTATION INDISPONIBLE";

  // Axe 2 — solidité des preuves (catégorielle, déterministe — jamais un score).
  const signalProfile = data.signalProfile as
    | { evidenceSolidity?: string | null; evidenceSolidityRationale?: string | null }
    | undefined;
  const signalContribution = data.signalContribution as
    | { evidenceSolidity?: string | null }
    | undefined;
  const solidityValue =
    signalProfile?.evidenceSolidity ?? signalContribution?.evidenceSolidity ?? null;
  const solidityLabel = proofLabel(solidityValue);
  const solidityRationale = signalProfile?.evidenceSolidityRationale ?? null;

  return (
    <PdfPage dealName={dealName}>
      <SectionTitle>Profil du signal</SectionTitle>

      {thesisGated && thesisQuality && (
        <View style={{ marginBottom: 16 }}>
          <BodyText>
            L&apos;orientation du signal est secondaire tant que la thèse reste fragile. Référence canonique: Thesis Quality = {thesisQuality.verdict}.
          </BodyText>
          <BodyText>{thesisQuality.summary}</BodyText>
        </View>
      )}

      {/* Modèle 2 axes verbal — orientation × solidité (aucune note de deal). */}
      {!thesisGated && (
        <View style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: "row", gap: 28 }}>
            <AxisValue eyebrow="Orientation du signal" value={orientationLabel} />
            {solidityLabel && (
              <AxisValue eyebrow="Solidité des preuves" value={solidityLabel} />
            )}
          </View>
          {solidityRationale && (
            <View style={{ marginTop: 6 }}>
              <BodyText italic>{solidityRationale}</BodyText>
            </View>
          )}
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
