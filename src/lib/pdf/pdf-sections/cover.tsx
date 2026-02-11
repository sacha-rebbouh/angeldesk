/**
 * Cover Page — Full bleed design with company info, score circle, KPIs
 */

import React from "react";
import { Page, View, Text } from "@react-pdf/renderer";
import { colors, styles as gs } from "../pdf-theme";
import { ScoreCircle, KpiBox } from "../pdf-components";
import { fmtEur } from "../pdf-helpers";
import type { PdfExportData } from "../generate-analysis-pdf";

export function CoverPage({ data }: { data: PdfExportData }) {
  const deal = data.deal;
  const analysis = data.analysis;

  // Extract overall score from synthesis-deal-scorer
  const scorerResult = analysis.results["synthesis-deal-scorer"];
  const scorerData = scorerResult?.success
    ? (scorerResult.data as Record<string, unknown>)
    : null;
  const overallScore = (scorerData?.overallScore as number) ?? 0;
  const verdict = (scorerData?.verdict as string) ?? "";

  const formatDate = () =>
    new Date().toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

  return (
    <Page size="A4" style={gs.coverPage}>
      {/* Top blue band */}
      <View
        style={{
          height: 8,
          backgroundColor: colors.primary,
        }}
      />

      {/* Main content area */}
      <View style={{ paddingHorizontal: 40, paddingTop: 35 }}>
        {/* Brand */}
        <Text style={{ fontSize: 9, fontWeight: 600, color: colors.muted, letterSpacing: 2 }}>
          ANGEL DESK
        </Text>
        <Text style={{ fontSize: 9, color: colors.muted, marginTop: 2 }}>
          Due Diligence Report
        </Text>
        <View
          style={{
            height: 1,
            backgroundColor: colors.border,
            marginTop: 8,
            marginBottom: 20,
          }}
        />

        {/* Company name + score */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ flex: 1, paddingRight: 20 }}>
            <Text
              style={{
                fontSize: 32,
                fontWeight: 700,
                color: colors.dark,
                marginBottom: 8,
              }}
            >
              {deal.companyName ?? deal.name}
            </Text>
            <Text style={{ fontSize: 13, color: colors.text }}>
              {[deal.sector, deal.stage, deal.geography].filter(Boolean).join("  •  ") || "N/A"}
            </Text>
          </View>

          {overallScore > 0 && (
            <View style={{ alignItems: "center" }}>
              <ScoreCircle score={overallScore} size={80} />
              {verdict && (
                <Text
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    color: colors.dark,
                    marginTop: -8,
                    textTransform: "uppercase",
                  }}
                >
                  {verdict.replace(/_/g, " ")}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* KPI Grid */}
        <View style={{ marginTop: 24 }}>
          <View style={{ flexDirection: "row" }}>
            <KpiBox label="VALORISATION PRE-MONEY" value={fmtEur(deal.valuationPre)} />
            <KpiBox label="MONTANT DEMANDE" value={fmtEur(deal.amountRequested)} />
          </View>
          <View style={{ flexDirection: "row" }}>
            <KpiBox label="ARR" value={fmtEur(deal.arr)} />
            <KpiBox
              label="CROISSANCE"
              value={deal.growthRate ? `+${deal.growthRate}% YoY` : "N/A"}
            />
          </View>
        </View>

        {/* Founders */}
        {deal.founders.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <Text style={[gs.label, { marginBottom: 6 }]}>
              EQUIPE FONDATRICE
            </Text>
            {deal.founders.map((f, i) => (
              <Text key={i} style={[gs.body, { marginBottom: 2 }]}>
                {f.name}
                {f.role ? ` — ${f.role}` : ""}
              </Text>
            ))}
          </View>
        )}

        {/* Description */}
        {deal.description && (
          <View style={{ marginTop: 16 }}>
            <Text style={[gs.body, { color: colors.muted }]}>
              {deal.description}
            </Text>
          </View>
        )}

        {/* Website */}
        {deal.website && (
          <Text style={[gs.small, { marginTop: 8 }]}>{deal.website}</Text>
        )}

        {/* Analysis meta */}
        <View style={{ marginTop: 20 }}>
          <Text style={gs.small}>
            Analyse complete: {analysis.completedAgents}/{analysis.totalAgents}{" "}
            agents • {analysis.type.replace(/_/g, " ")}
          </Text>
          <Text style={[gs.small, { marginTop: 2 }]}>
            Genere le {formatDate()}
          </Text>
        </View>
      </View>

      {/* Bottom blue band */}
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 8,
          backgroundColor: colors.primary,
        }}
      />
      <View
        style={{
          position: "absolute",
          bottom: 12,
          left: 0,
          right: 0,
          alignItems: "center",
        }}
      >
        <Text style={{ fontSize: 6.5, color: colors.white }}>
          DOCUMENT CONFIDENTIEL — Angel Desk Due Diligence Platform
        </Text>
      </View>
    </Page>
  );
}
