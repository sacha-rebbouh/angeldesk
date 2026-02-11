/**
 * Early Warnings Section — Existential deal risks
 */

import React from "react";
import { View, Text } from "@react-pdf/renderer";
import { colors, styles as gs } from "../pdf-theme";
import {
  PdfPage,
  SectionTitle,
  H3,
  BulletList,
  LabelValue,
  Spacer,
  RedFlagCard,
} from "../pdf-components";
import { priorityOrder } from "../pdf-helpers";
import { AGENT_DISPLAY_NAMES } from "@/lib/format-utils";
import type { EarlyWarningPdf } from "../generate-analysis-pdf";

export function EarlyWarningsSection({
  warnings,
  dealName,
}: {
  warnings: EarlyWarningPdf[] | undefined;
  dealName: string;
}) {
  if (!warnings || warnings.length === 0) return null;

  const sorted = [...warnings].sort(
    (a, b) => priorityOrder(a.recommendation) - priorityOrder(b.recommendation)
  );

  return (
    <PdfPage dealName={dealName}>
      <SectionTitle>Alertes Precoces (Early Warnings)</SectionTitle>
      <Text style={[gs.bodyBold, { marginBottom: 8 }]}>
        {warnings.length} alerte(s) detectee(s) pendant l&apos;analyse —
        risques existentiels potentiels.
      </Text>

      {sorted.map((w, i) => {
        const sevLabel =
          w.severity === "critical"
            ? "CRITIQUE"
            : w.severity === "high"
              ? "HAUT"
              : "MOYEN";
        const recLabel =
          w.recommendation === "absolute_dealbreaker"
            ? "DEALBREAKER ABSOLU"
            : w.recommendation === "likely_dealbreaker"
              ? "DEALBREAKER PROBABLE"
              : "A INVESTIGUER";

        return (
          <RedFlagCard key={i} title={w.title} severity={w.severity}>
            <LabelValue label="Categorie" value={w.category.replace(/_/g, " ")} />
            <LabelValue label="Recommandation" value={recLabel} />
            <LabelValue label="Confiance" value={`${w.confidence}%`} />
            <LabelValue
              label="Agent source"
              value={AGENT_DISPLAY_NAMES[w.agentName] ?? w.agentName}
            />
            <Text style={[gs.body, { marginTop: 4 }]}>{w.description}</Text>

            {w.evidence.length > 0 && (
              <>
                <H3>Preuves</H3>
                <BulletList items={w.evidence.slice(0, 5)} />
              </>
            )}
            {w.questionsToAsk && w.questionsToAsk.length > 0 && (
              <>
                <H3>Questions a poser</H3>
                <BulletList items={w.questionsToAsk} />
              </>
            )}
          </RedFlagCard>
        );
      })}
    </PdfPage>
  );
}
