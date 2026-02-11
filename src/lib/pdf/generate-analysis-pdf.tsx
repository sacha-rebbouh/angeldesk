/**
 * PDF Report Generator — @react-pdf/renderer
 *
 * Entry point for the Due Diligence PDF export.
 * Composes all section components into a single Document,
 * then streams to a Buffer for the API route.
 *
 * Supports two modes:
 * - format="full"    → 30-50 page comprehensive report
 * - format="summary" → 5-7 page executive brief
 */

import React from "react";
import { Document, renderToStream } from "@react-pdf/renderer";
import { categorizeResults } from "@/lib/analysis-constants";

// Section components
import { CoverPage } from "./pdf-sections/cover";
import { EarlyWarningsSection } from "./pdf-sections/early-warnings";
import { ExecutiveSummarySection } from "./pdf-sections/executive-summary";
import { ScoreBreakdownSection } from "./pdf-sections/score-breakdown";
import { Tier3SynthesisSection } from "./pdf-sections/tier3-synthesis";
import { Tier2ExpertSection } from "./pdf-sections/tier2-expert";
import { Tier1AgentsSection } from "./pdf-sections/tier1-agents";
import {
  RedFlagsSection,
  SummaryRedFlagsAndQuestions,
} from "./pdf-sections/red-flags";
import {
  QuestionsSection,
  FounderResponsesSection,
} from "./pdf-sections/questions";
import {
  NegotiationSection,
  SummaryNegotiationSection,
} from "./pdf-sections/negotiation";

// ============================================================================
// TYPES (shared across all section files)
// ============================================================================

export interface DealData {
  name: string;
  companyName: string | null;
  sector: string | null;
  stage: string | null;
  geography: string | null;
  valuationPre: number | null;
  amountRequested: number | null;
  arr: number | null;
  growthRate: number | null;
  website: string | null;
  description: string | null;
  founders: Array<{
    name: string;
    role: string | null;
    linkedinUrl: string | null;
  }>;
  redFlags: Array<{
    title: string;
    description: string;
    severity: string;
    confidenceScore: number | null;
    questionsToAsk: string[];
    status: string;
  }>;
}

export interface AgentResult {
  agentName: string;
  success: boolean;
  executionTimeMs: number;
  cost: number;
  error?: string;
  data?: Record<string, unknown>;
  _extended?: Record<string, unknown>;
}

export interface FounderResponse {
  question: string;
  answer: string;
  category: string;
}

export interface NegotiationData {
  dealName: string;
  overallLeverage: string;
  leverageRationale: string;
  negotiationPoints: Array<{
    priority: string;
    topic: string;
    category: string;
    currentSituation: string;
    marketBenchmark?: string;
    argument: string;
    ask: string;
    fallback?: string;
    status: string;
    compromiseValue?: string;
  }>;
  dealbreakers: Array<{
    condition: string;
    description: string;
    resolvable: boolean;
    resolutionPath?: string;
    resolved?: boolean;
  }>;
  tradeoffs: Array<{
    give: string;
    get: string;
    rationale: string;
    netBenefit: string;
  }>;
  suggestedApproach: string;
  keyArguments: string[];
  improvedDealScore?: {
    before: number;
    after: number;
    improvement: number;
  };
}

export interface EarlyWarningPdf {
  id: string;
  agentName: string;
  severity: string;
  category: string;
  title: string;
  description: string;
  evidence: string[];
  confidence: number;
  recommendation: string;
  questionsToAsk?: string[];
}

export type PdfFormat = "full" | "summary";

export interface PdfExportData {
  deal: DealData;
  analysis: {
    id: string;
    type: string;
    completedAt: string | null;
    totalAgents: number;
    completedAgents: number;
    results: Record<string, AgentResult>;
  };
  founderResponses: FounderResponse[];
  negotiation: NegotiationData | null;
  earlyWarnings?: EarlyWarningPdf[];
  format?: PdfFormat;
}

// ============================================================================
// FULL REPORT DOCUMENT
// ============================================================================

function FullReport({ data }: { data: PdfExportData }) {
  const dealName = data.deal.companyName ?? data.deal.name;
  const results = data.analysis.results;

  const { tier1Results, tier2Results, tier3Results } = categorizeResults(
    results as Record<string, unknown>
  );

  return (
    <Document
      title={`Due Diligence — ${dealName}`}
      author="Angel Desk"
      subject="Rapport de Due Diligence"
    >
      {/* 1. Cover */}
      <CoverPage data={data} />

      {/* 2. Early Warnings (existential risks) */}
      <EarlyWarningsSection
        warnings={data.earlyWarnings}
        dealName={dealName}
      />

      {/* 3. Executive Summary (memo-generator) */}
      <ExecutiveSummarySection results={results} dealName={dealName} />

      {/* 4. Score Breakdown (synthesis-deal-scorer) */}
      <ScoreBreakdownSection results={results} dealName={dealName} />

      {/* 5. Tier 3 Synthesis (contradictions, devil's advocate, scenarios) */}
      <Tier3SynthesisSection
        tier3Results={tier3Results as Record<string, AgentResult>}
        dealName={dealName}
      />

      {/* 6. Tier 2 Sector Expert */}
      <Tier2ExpertSection
        tier2Results={tier2Results as Record<string, AgentResult>}
        dealName={dealName}
      />

      {/* 7. Tier 1 Agents (13 agents with detailed findings) */}
      <Tier1AgentsSection
        tier1Results={tier1Results as Record<string, AgentResult>}
        dealName={dealName}
      />

      {/* 8. Red Flags Consolidated */}
      <RedFlagsSection deal={data.deal} results={results} dealName={dealName} />

      {/* 9. Questions for Founder (question-master) */}
      <QuestionsSection results={results} dealName={dealName} />

      {/* 10. Founder Responses */}
      <FounderResponsesSection
        responses={data.founderResponses}
        dealName={dealName}
      />

      {/* 11. Negotiation Strategy */}
      <NegotiationSection
        negotiation={data.negotiation}
        dealName={dealName}
      />
    </Document>
  );
}

// ============================================================================
// SUMMARY REPORT DOCUMENT (5-7 pages)
// ============================================================================

function SummaryReport({ data }: { data: PdfExportData }) {
  const dealName = data.deal.companyName ?? data.deal.name;
  const results = data.analysis.results;

  return (
    <Document
      title={`DD Resume — ${dealName}`}
      author="Angel Desk"
      subject="Resume Due Diligence"
    >
      {/* 1. Cover */}
      <CoverPage data={data} />

      {/* 2. Executive Summary */}
      <ExecutiveSummarySection results={results} dealName={dealName} />

      {/* 3. Score Breakdown */}
      <ScoreBreakdownSection results={results} dealName={dealName} />

      {/* 4. Red Flags & Key Questions (combined) */}
      <SummaryRedFlagsAndQuestions
        deal={data.deal}
        results={results}
        dealName={dealName}
      />

      {/* 5. Negotiation (compact) */}
      <SummaryNegotiationSection
        negotiation={data.negotiation}
        dealName={dealName}
      />
    </Document>
  );
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function generateAnalysisPdf(
  data: PdfExportData
): Promise<Buffer> {
  const format = data.format ?? "full";

  const doc =
    format === "summary" ? (
      <SummaryReport data={data} />
    ) : (
      <FullReport data={data} />
    );

  const stream = await renderToStream(doc);

  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
