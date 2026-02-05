/**
 * Chat Context Service
 *
 * Manages pre-computed context for the deal chat feature.
 * Aggregates facts, agent results, and extracted data for fast chat responses.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// ============================================================================
// TYPES
// ============================================================================

export interface KeyFact {
  factKey: string;
  value: unknown;
  displayValue: string;
  confidence: number;
  source: string;
  category: string;
}

export interface AgentSummary {
  summary: string;
  keyFindings: string[];
  confidence: number;
  redFlags?: Array<{ title: string; severity: string }>;
  score?: number;
}

export interface RedFlagContext {
  title: string;
  severity: string;
  description: string;
  questionsToAsk: string[];
  category: string;
}

export interface DealChatContextData {
  keyFacts: KeyFact[];
  agentSummaries: Record<string, AgentSummary>;
  redFlagsContext: RedFlagContext[];
  extractedData?: Record<string, unknown>;
  benchmarkData?: unknown;
  comparableDeals?: unknown[];
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build or update chat context for a deal
 * Called after analysis completes to pre-compute context for chat
 */
export async function buildChatContext(
  dealId: string,
  analysisId: string,
  analysisMode: string
): Promise<void> {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[ChatContext] Building context for deal ${dealId} from analysis ${analysisId}`);
  }

  // Fetch all required data in parallel
  const [factEvents, redFlags, analysis, documents] = await Promise.all([
    // Get all current facts (latest versions)
    prisma.factEvent.findMany({
      where: {
        dealId,
        eventType: "CREATED",
      },
      orderBy: { createdAt: "desc" },
    }),

    // Get red flags
    prisma.redFlag.findMany({
      where: { dealId },
      orderBy: [{ severity: "asc" }, { detectedAt: "desc" }],
    }),

    // Get analysis results
    prisma.analysis.findUnique({
      where: { id: analysisId },
      select: { results: true, mode: true },
    }),

    // Get documents for extracted data
    prisma.document.findMany({
      where: { dealId, processingStatus: "COMPLETED" },
      select: {
        id: true,
        type: true,
        name: true,
        extractedText: true,
      },
    }),
  ]);

  // Build key facts from FactEvents
  const keyFacts = buildKeyFacts(factEvents);

  // Build agent summaries from analysis results
  const agentSummaries = buildAgentSummaries(analysis?.results as Record<string, unknown> | null);

  // Build red flags context
  const redFlagsContext = buildRedFlagsContext(redFlags);

  // Build extracted data map
  const extractedData = buildExtractedData(documents);

  // Upsert chat context
  await prisma.dealChatContext.upsert({
    where: { dealId },
    create: {
      dealId,
      keyFacts: keyFacts as unknown as Prisma.InputJsonValue,
      agentSummaries: agentSummaries as unknown as Prisma.InputJsonValue,
      redFlagsContext: redFlagsContext as unknown as Prisma.InputJsonValue,
      extractedData: extractedData as Prisma.InputJsonValue,
      lastAnalysisId: analysisId,
      lastAnalysisMode: analysisMode,
      version: 1,
    },
    update: {
      keyFacts: keyFacts as unknown as Prisma.InputJsonValue,
      agentSummaries: agentSummaries as unknown as Prisma.InputJsonValue,
      redFlagsContext: redFlagsContext as unknown as Prisma.InputJsonValue,
      extractedData: extractedData as Prisma.InputJsonValue,
      lastAnalysisId: analysisId,
      lastAnalysisMode: analysisMode,
      version: { increment: 1 },
    },
  });

  if (process.env.NODE_ENV === 'development') {
    console.log(`[ChatContext] Context built: ${keyFacts.length} facts, ${Object.keys(agentSummaries).length} agent summaries, ${redFlagsContext.length} red flags`);
  }
}

/**
 * Get chat context for a deal
 */
export async function getChatContext(dealId: string): Promise<DealChatContextData | null> {
  const context = await prisma.dealChatContext.findUnique({
    where: { dealId },
  });

  if (!context) return null;

  return {
    keyFacts: context.keyFacts as unknown as KeyFact[],
    agentSummaries: context.agentSummaries as unknown as Record<string, AgentSummary>,
    redFlagsContext: context.redFlagsContext as unknown as RedFlagContext[],
    extractedData: context.extractedData as Record<string, unknown> | undefined,
    benchmarkData: context.benchmarkData,
    comparableDeals: context.comparableDeals as unknown[] | undefined,
  };
}

/**
 * Get full context for chat agent (includes raw data)
 * This is the comprehensive context used by DealChatAgent
 */
export async function getFullChatContext(dealId: string): Promise<{
  chatContext: DealChatContextData | null;
  deal: Awaited<ReturnType<typeof getDealBasicInfo>>;
  documents: Awaited<ReturnType<typeof getDocumentSummaries>>;
  latestAnalysis: Awaited<ReturnType<typeof getLatestAnalysisResults>>;
}> {
  const [chatContext, deal, documents, latestAnalysis] = await Promise.all([
    getChatContext(dealId),
    getDealBasicInfo(dealId),
    getDocumentSummaries(dealId),
    getLatestAnalysisResults(dealId),
  ]);

  return {
    chatContext,
    deal,
    documents,
    latestAnalysis,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function buildKeyFacts(factEvents: Array<{
  factKey: string;
  value: Prisma.JsonValue;
  displayValue: string;
  sourceConfidence: number;
  source: string;
  category: string;
}>): KeyFact[] {
  // Deduplicate by factKey, keeping most recent
  const factMap = new Map<string, KeyFact>();

  for (const event of factEvents) {
    if (!factMap.has(event.factKey)) {
      factMap.set(event.factKey, {
        factKey: event.factKey,
        value: event.value,
        displayValue: event.displayValue,
        confidence: event.sourceConfidence,
        source: event.source,
        category: event.category,
      });
    }
  }

  return Array.from(factMap.values());
}

function buildAgentSummaries(
  results: Record<string, unknown> | null
): Record<string, AgentSummary> {
  if (!results) return {};

  const summaries: Record<string, AgentSummary> = {};

  for (const [agentName, result] of Object.entries(results)) {
    if (!result || typeof result !== "object") continue;

    const agentResult = result as Record<string, unknown>;

    // Skip failed agents
    if (agentResult.success === false) continue;

    const data = agentResult.data as Record<string, unknown> | undefined;
    if (!data) continue;

    // Extract summary based on agent type
    const summary = extractAgentSummary(agentName, data);
    if (summary) {
      summaries[agentName] = summary;
    }
  }

  return summaries;
}

function extractAgentSummary(
  agentName: string,
  data: Record<string, unknown>
): AgentSummary | null {
  // Different agents have different output structures
  // This handles the common patterns

  const summary: AgentSummary = {
    summary: "",
    keyFindings: [],
    confidence: 0,
  };

  // Extract confidence
  if (typeof data.confidenceLevel === "number") {
    summary.confidence = data.confidenceLevel;
  } else if (typeof data.confidence === "number") {
    summary.confidence = data.confidence;
  }

  // Extract summary/recommendation
  if (typeof data.summary === "string") {
    summary.summary = data.summary;
  } else if (typeof data.recommendation === "string") {
    summary.summary = data.recommendation;
  } else if (typeof data.verdict === "string") {
    summary.summary = data.verdict;
  }

  // Extract key findings
  if (Array.isArray(data.keyFindings)) {
    summary.keyFindings = data.keyFindings
      .filter((f): f is string => typeof f === "string")
      .slice(0, 5);
  } else if (Array.isArray(data.findings)) {
    summary.keyFindings = data.findings
      .map((f) => (typeof f === "object" && f !== null && "finding" in f ? String(f.finding) : null))
      .filter((f): f is string => f !== null)
      .slice(0, 5);
  } else if (Array.isArray(data.concerns)) {
    summary.keyFindings = data.concerns
      .map((c) => (typeof c === "object" && c !== null && "concern" in c ? String(c.concern) : null))
      .filter((c): c is string => c !== null)
      .slice(0, 5);
  }

  // Extract red flags if present
  if (Array.isArray(data.redFlags)) {
    summary.redFlags = data.redFlags
      .filter((rf): rf is { title: string; severity: string } =>
        typeof rf === "object" && rf !== null && "title" in rf && "severity" in rf
      )
      .slice(0, 5);
  }

  // Extract score if present
  if (typeof data.score === "number") {
    summary.score = data.score;
  }

  // Only return if we have meaningful content
  if (!summary.summary && summary.keyFindings.length === 0) {
    return null;
  }

  return summary;
}

function buildRedFlagsContext(redFlags: Array<{
  title: string;
  severity: string;
  description: string;
  questionsToAsk: string[];
  category: string;
}>): RedFlagContext[] {
  return redFlags.map((rf) => ({
    title: rf.title,
    severity: rf.severity,
    description: rf.description,
    questionsToAsk: rf.questionsToAsk,
    category: rf.category,
  }));
}

function buildExtractedData(
  documents: Array<{
    id: string;
    type: string;
    name: string;
    extractedText: string | null;
  }>
): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  for (const doc of documents) {
    // Store basic info about each document type
    data[doc.type] = {
      documentId: doc.id,
      name: doc.name,
      hasExtractedText: !!doc.extractedText,
      textLength: doc.extractedText?.length ?? 0,
    };
  }

  return data;
}

async function getDealBasicInfo(dealId: string) {
  return prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      id: true,
      name: true,
      companyName: true,
      sector: true,
      stage: true,
      geography: true,
      description: true,
      website: true,
      arr: true,
      growthRate: true,
      amountRequested: true,
      valuationPre: true,
      globalScore: true,
      teamScore: true,
      marketScore: true,
      productScore: true,
      financialsScore: true,
      founders: {
        select: {
          name: true,
          role: true,
        },
      },
    },
  });
}

async function getDocumentSummaries(dealId: string) {
  const documents = await prisma.document.findMany({
    where: { dealId },
    select: {
      id: true,
      name: true,
      type: true,
      processingStatus: true,
    },
  });

  return documents.map((doc) => ({
    id: doc.id,
    name: doc.name,
    type: doc.type,
    isProcessed: doc.processingStatus === "COMPLETED",
  }));
}

async function getLatestAnalysisResults(dealId: string) {
  const analysis = await prisma.analysis.findFirst({
    where: { dealId, status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    select: {
      id: true,
      mode: true,
      results: true,
      summary: true,
      completedAt: true,
    },
  });

  if (!analysis) return null;

  return {
    id: analysis.id,
    mode: analysis.mode,
    summary: analysis.summary,
    completedAt: analysis.completedAt,
    // Don't include full results - too large for context
    hasResults: !!analysis.results,
  };
}

// ============================================================================
// INVALIDATION
// ============================================================================

/**
 * Invalidate chat context for a deal
 * Called when deal data changes significantly
 */
export async function invalidateChatContext(dealId: string): Promise<void> {
  await prisma.dealChatContext.delete({
    where: { dealId },
  }).catch(() => {
    // Ignore if not exists
  });
}

/**
 * Check if chat context is stale
 */
export async function isChatContextStale(
  dealId: string,
  currentAnalysisId: string
): Promise<boolean> {
  const context = await prisma.dealChatContext.findUnique({
    where: { dealId },
    select: { lastAnalysisId: true },
  });

  if (!context) return true;
  return context.lastAnalysisId !== currentAnalysisId;
}
