/**
 * Negotiation Strategy Section
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
import { sup } from "../pdf-helpers";
import type { NegotiationData } from "../generate-analysis-pdf";

export function NegotiationSection({
  negotiation,
  dealName,
}: {
  negotiation: NegotiationData | null;
  dealName: string;
}) {
  if (!negotiation) return null;

  return (
    <PdfPage dealName={dealName}>
      <SectionTitle>Stratégie de Négociation</SectionTitle>

      {/* Leverage */}
      <LabelValue
        label="Levier global"
        value={sup(negotiation.overallLeverage)}
      />
      <BodyText>{negotiation.leverageRationale}</BodyText>
      <Spacer />

      {/* Suggested approach */}
      <SubsectionTitle>Approche recommandée</SubsectionTitle>
      <BodyText>{negotiation.suggestedApproach}</BodyText>

      {/* Key arguments */}
      {negotiation.keyArguments.length > 0 && (
        <>
          <H3>Arguments clés</H3>
          <BulletList items={negotiation.keyArguments} />
        </>
      )}

      {/* Improved score */}
      {negotiation.improvedDealScore && (
        <>
          <H3>Impact sur le score</H3>
          <LabelValue
            label="Avant"
            value={`${negotiation.improvedDealScore.before}/100`}
          />
          <LabelValue
            label="Après"
            value={`${negotiation.improvedDealScore.after}/100`}
          />
          <LabelValue
            label="Amélioration"
            value={`+${negotiation.improvedDealScore.improvement} points`}
          />
        </>
      )}

      {/* Negotiation points */}
      {negotiation.negotiationPoints.length > 0 && (
        <>
          <SubsectionTitle>Points de négociation</SubsectionTitle>
          <PdfTable
            columns={[
              { header: "Priorité", width: 14 },
              { header: "Sujet", width: 20 },
              { header: "Demande", width: 26 },
              { header: "Fallback", width: 20 },
              { header: "Statut", width: 20 },
            ]}
            rows={negotiation.negotiationPoints.map((p) => [
              sup(p.priority).replace(/_/g, " "),
              p.topic,
              p.ask,
              p.fallback ?? "—",
              p.status === "to_negotiate"
                ? "À négocier"
                : p.status === "obtained"
                  ? "Obtenu"
                  : p.status === "refused"
                    ? "Refusé"
                    : `Compromis: ${p.compromiseValue ?? ""}`,
            ])}
          />

          {/* Detail for each point */}
          {negotiation.negotiationPoints.map((p, i) => (
            <View key={i} style={{ marginBottom: 6 }} wrap={false}>
              <H3>
                {p.topic} [{p.category}]
              </H3>
              <LabelValue
                label="Situation actuelle"
                value={p.currentSituation}
              />
              {p.marketBenchmark && (
                <LabelValue label="Benchmark" value={p.marketBenchmark} />
              )}
              <LabelValue label="Argument" value={p.argument} />
            </View>
          ))}
        </>
      )}

      {/* Dealbreakers */}
      {negotiation.dealbreakers.length > 0 && (
        <>
          <SubsectionTitle>Risques critiques</SubsectionTitle>
          <PdfTable
            columns={[
              { header: "Condition", width: 25 },
              { header: "Description", width: 35 },
              { header: "Résolvable", width: 12 },
              { header: "Résolution", width: 28 },
            ]}
            rows={negotiation.dealbreakers.map((d) => [
              d.condition,
              d.description,
              d.resolvable ? "Oui" : "Non",
              d.resolutionPath ?? "—",
            ])}
          />
        </>
      )}

      {/* Trade-offs */}
      {negotiation.tradeoffs.length > 0 && (
        <>
          <SubsectionTitle>Trade-offs possibles</SubsectionTitle>
          <PdfTable
            columns={[
              { header: "Donner", width: 25 },
              { header: "Obtenir", width: 25 },
              { header: "Justification", width: 30 },
              { header: "Bénéfice net", width: 20 },
            ]}
            rows={negotiation.tradeoffs.map((t) => [
              t.give,
              t.get,
              t.rationale,
              t.netBenefit,
            ])}
          />
        </>
      )}
    </PdfPage>
  );
}

// --- Summary mode variant ---

export function SummaryNegotiationSection({
  negotiation,
  dealName,
}: {
  negotiation: NegotiationData | null;
  dealName: string;
}) {
  if (!negotiation) return null;

  return (
    <PdfPage dealName={dealName}>
      <SectionTitle>Négociation — Résumé</SectionTitle>

      <LabelValue
        label="Levier global"
        value={sup(negotiation.overallLeverage)}
      />
      <BodyText>{negotiation.leverageRationale}</BodyText>
      <Spacer />

      {negotiation.keyArguments.length > 0 && (
        <>
          <H3>Arguments clés</H3>
          <BulletList items={negotiation.keyArguments} />
        </>
      )}

      {negotiation.negotiationPoints.length > 0 && (
        <>
          <SubsectionTitle>Points de négociation</SubsectionTitle>
          <PdfTable
            columns={[
              { header: "Priorité", width: 15 },
              { header: "Sujet", width: 30 },
              { header: "Demande", width: 55 },
            ]}
            rows={negotiation.negotiationPoints.slice(0, 8).map((p) => [
              sup(p.priority).replace(/_/g, " "),
              p.topic,
              p.ask,
            ])}
          />
        </>
      )}

      {negotiation.dealbreakers.length > 0 && (
        <>
          <H3>Risques critiques</H3>
          <BulletList
            items={negotiation.dealbreakers.map(
              (d) => `${d.condition}: ${d.description}`
            )}
          />
        </>
      )}
    </PdfPage>
  );
}
