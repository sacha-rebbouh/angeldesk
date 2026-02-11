/**
 * Red Flags Consolidated Section — DB + agent red flags
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
  PdfTable,
  Spacer,
  BodyText,
} from "../pdf-components";
import { severityOrder, sup } from "../pdf-helpers";
import { AGENT_DISPLAY_NAMES } from "@/lib/format-utils";
import type { AgentResult, DealData } from "../generate-analysis-pdf";

export function RedFlagsSection({
  deal,
  results,
  dealName,
}: {
  deal: DealData;
  results: Record<string, AgentResult>;
  dealName: string;
}) {
  return (
    <PdfPage dealName={dealName}>
      <SectionTitle>Red Flags — Vue consolidee</SectionTitle>

      <DbRedFlags deal={deal} />
      <AgentRedFlags results={results} />
    </PdfPage>
  );
}

function DbRedFlags({ deal }: { deal: DealData }) {
  const openFlags = deal.redFlags.filter((f) => f.status === "OPEN");
  if (openFlags.length === 0) return null;

  return (
    <>
      <SubsectionTitle>Red Flags actifs ({openFlags.length})</SubsectionTitle>
      <PdfTable
        columns={[
          { header: "Red Flag", width: 25 },
          { header: "Severite", width: 12 },
          { header: "Confiance", width: 13 },
          { header: "Description", width: 50 },
        ]}
        rows={openFlags.map((f) => [
          f.title,
          f.severity,
          f.confidenceScore
            ? `${Math.round(Number(f.confidenceScore) * 100)}%`
            : "N/A",
          f.description,
        ])}
      />

      {/* Questions associated with red flags */}
      {(() => {
        const flagsWithQ = openFlags.filter(
          (f) => f.questionsToAsk.length > 0
        );
        if (flagsWithQ.length === 0) return null;
        return (
          <>
            <H3>Questions associees aux red flags</H3>
            {flagsWithQ.map((f, i) => (
              <View key={i} style={{ marginBottom: 4 }}>
                <Text style={gs.bodyBold}>{f.title}:</Text>
                <BulletList items={f.questionsToAsk} indent={8} />
              </View>
            ))}
          </>
        );
      })()}
    </>
  );
}

function AgentRedFlags({
  results,
}: {
  results: Record<string, AgentResult>;
}) {
  let agentFlags: Array<{
    agent: string;
    title: string;
    severity: string;
  }> = [];

  for (const [agentName, result] of Object.entries(results)) {
    if (!result.success || !result.data) continue;
    const data = result.data as Record<string, unknown>;

    const flags = data.redFlags as Array<{
      title?: string;
      severity?: string;
    }> | undefined;
    if (flags) {
      for (const f of flags) {
        agentFlags.push({
          agent: AGENT_DISPLAY_NAMES[agentName] ?? agentName,
          title: f.title ?? "",
          severity: f.severity ?? "MEDIUM",
        });
      }
    }

    const sectorFlags = data.sectorRedFlags as Array<{
      flag?: string;
      severity?: string;
      sectorReason?: string;
    }> | undefined;
    if (sectorFlags) {
      for (const sf of sectorFlags) {
        agentFlags.push({
          agent: AGENT_DISPLAY_NAMES[agentName] ?? agentName,
          title: sf.flag ?? "",
          severity: sf.severity ?? "MEDIUM",
        });
      }
    }
  }

  agentFlags = agentFlags.sort(
    (a, b) => severityOrder(a.severity) - severityOrder(b.severity)
  );

  if (agentFlags.length === 0) return null;

  return (
    <>
      <SubsectionTitle>
        Red Flags des agents ({agentFlags.length})
      </SubsectionTitle>
      <PdfTable
        columns={[
          { header: "Agent", width: 25 },
          { header: "Red Flag", width: 55 },
          { header: "Severite", width: 20 },
        ]}
        rows={agentFlags
          .slice(0, 30)
          .map((f) => [f.agent, f.title, f.severity])}
      />
    </>
  );
}

// --- Summary mode variant ---

export function SummaryRedFlagsAndQuestions({
  deal,
  results,
  dealName,
}: {
  deal: DealData;
  results: Record<string, AgentResult>;
  dealName: string;
}) {
  // Collect all flags
  let allFlags: Array<{
    title: string;
    severity: string;
    source: string;
  }> = [];
  for (const f of deal.redFlags.filter((f) => f.status === "OPEN")) {
    allFlags.push({ title: f.title, severity: f.severity, source: "DB" });
  }
  for (const [agentName, result] of Object.entries(results)) {
    if (!result.success || !result.data) continue;
    const data = result.data as Record<string, unknown>;
    const flags = data.redFlags as Array<{
      title?: string;
      severity?: string;
    }> | undefined;
    if (flags) {
      for (const f of flags) {
        allFlags.push({
          title: f.title ?? "",
          severity: f.severity ?? "MEDIUM",
          source: AGENT_DISPLAY_NAMES[agentName] ?? agentName,
        });
      }
    }
    const sectorFlags = data.sectorRedFlags as Array<{
      flag?: string;
      severity?: string;
    }> | undefined;
    if (sectorFlags) {
      for (const sf of sectorFlags) {
        allFlags.push({
          title: sf.flag ?? "",
          severity: sf.severity ?? "MEDIUM",
          source: AGENT_DISPLAY_NAMES[agentName] ?? agentName,
        });
      }
    }
  }
  allFlags = allFlags.sort(
    (a, b) => severityOrder(a.severity) - severityOrder(b.severity)
  );

  // Top questions
  const qmResult = results["question-master"];
  const qmData = qmResult?.success
    ? (qmResult.data as Record<string, unknown>)
    : null;
  const findings = qmData?.findings as Record<string, unknown> | undefined;
  const questions = (findings?.founderQuestions ?? []) as Array<{
    question: string;
    priority: string;
    category: string;
  }>;
  const pOrder: Record<string, number> = {
    CRITICAL: 0,
    MUST_ASK: 0,
    HIGH: 1,
    SHOULD_ASK: 1,
    MEDIUM: 2,
    LOW: 3,
  };
  const sortedQ = [...questions].sort(
    (a, b) => (pOrder[a.priority] ?? 4) - (pOrder[b.priority] ?? 4)
  );

  return (
    <PdfPage dealName={dealName}>
      <SectionTitle>Red Flags &amp; Questions cles</SectionTitle>

      {allFlags.length > 0 && (
        <>
          <SubsectionTitle>
            Top Red Flags ({Math.min(allFlags.length, 10)}/{allFlags.length})
          </SubsectionTitle>
          <PdfTable
            columns={[
              { header: "Red Flag", width: 45 },
              { header: "Severite", width: 18 },
              { header: "Source", width: 37 },
            ]}
            rows={allFlags
              .slice(0, 10)
              .map((f) => [f.title, sup(f.severity), f.source])}
          />
        </>
      )}

      {sortedQ.length > 0 && (
        <>
          <SubsectionTitle>
            Questions cles ({Math.min(sortedQ.length, 10)}/{sortedQ.length})
          </SubsectionTitle>
          <PdfTable
            columns={[
              { header: "#", width: 5 },
              { header: "Priorite", width: 15 },
              { header: "Question", width: 80 },
            ]}
            rows={sortedQ.slice(0, 10).map((q, i) => [
              String(i + 1),
              q.priority.replace(/_/g, " "),
              q.question,
            ])}
          />
        </>
      )}
    </PdfPage>
  );
}
