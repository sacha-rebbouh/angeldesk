/**
 * Chat Context Service
 *
 * Manages pre-computed context for the deal chat feature.
 * Aggregates facts, agent results, and extracted data for fast chat responses.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { safeDecrypt } from "@/lib/encryption";
import { loadResults } from "@/services/analysis-results/load-results";
import { extractAnalysisScores } from "@/services/analysis-results/score-extraction";
import { getCurrentFactsFromView } from "@/services/fact-store/current-facts";
import type { CurrentFact } from "@/services/fact-store/types";

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
  lastAnalysisId?: string | null;
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
      select: { id: true, mode: true },
    }),

    // Get documents for extracted data
    prisma.document.findMany({
      where: { dealId, processingStatus: "COMPLETED" },
      select: {
        id: true,
        type: true,
        name: true,
        extractedText: true,
        sourceKind: true,
        corpusRole: true,
        sourceDate: true,
        receivedAt: true,
        sourceAuthor: true,
        sourceSubject: true,
        linkedQuestionSource: true,
        linkedQuestionText: true,
        linkedRedFlagId: true,
      },
    }),
  ]);

  // Build key facts from FactEvents
  const keyFacts = buildKeyFacts(factEvents);

  // Build agent summaries from analysis results
  const analysisResults = analysis ? await loadResults(analysis.id) : null;
  const agentSummaries = buildAgentSummaries(analysisResults as Record<string, unknown> | null);

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
export async function getChatContext(
  dealId: string,
  options?: { analysisId?: string | null }
): Promise<DealChatContextData | null> {
  const context = await prisma.dealChatContext.findUnique({
    where: { dealId },
  });

  if (!context) return null;
  if ("analysisId" in (options ?? {}) && context.lastAnalysisId !== options?.analysisId) {
    return null;
  }

  return {
    keyFacts: context.keyFacts as unknown as KeyFact[],
    agentSummaries: context.agentSummaries as unknown as Record<string, AgentSummary>,
    redFlagsContext: context.redFlagsContext as unknown as RedFlagContext[],
    extractedData: context.extractedData as Record<string, unknown> | undefined,
    benchmarkData: context.benchmarkData,
    comparableDeals: context.comparableDeals as unknown[] | undefined,
    lastAnalysisId: context.lastAnalysisId,
  };
}

/**
 * Live session summary data for chat context
 */
export interface LiveSessionContextData {
  sessionId: string;
  startedAt: string | null;
  endedAt: string | null;
  executiveSummary: string;
  keyPoints: unknown[];
  actionItems: unknown[];
  newInformation: unknown[];
  contradictions: unknown[];
  questionsAsked: unknown[];
  remainingQuestions: unknown;
  confidenceDelta: unknown;
}

/**
 * Get full context for chat agent (includes raw data)
 * This is the comprehensive context used by DealChatAgent
 */
export async function getFullChatContext(
  dealId: string,
  options?: { analysisId?: string | null; documentIds?: string[] | null }
): Promise<{
  chatContext: DealChatContextData | null;
  canonicalDeal: Awaited<ReturnType<typeof getDealBasicInfo>>;
  deal: Awaited<ReturnType<typeof getDealBasicInfo>>;
  documents: Awaited<ReturnType<typeof getDocumentSummaries>>;
  latestAnalysis: Awaited<ReturnType<typeof getLatestAnalysisResults>>;
  liveSessions: LiveSessionContextData[];
}> {
  const [chatContext, deal, documents, latestAnalysis, liveSessions] = await Promise.all([
    getChatContext(dealId, options),
    getDealBasicInfo(dealId),
    getDocumentSummaries(dealId, options),
    getLatestAnalysisResults(dealId, options),
    getCompletedLiveSessions(dealId),
  ]);

  const canonicalDeal = deal
    ? {
        ...deal,
        globalScore: latestAnalysis?.scores.globalScore ?? deal.globalScore,
        teamScore: latestAnalysis?.scores.teamScore ?? deal.teamScore,
        marketScore: latestAnalysis?.scores.marketScore ?? deal.marketScore,
        productScore: latestAnalysis?.scores.productScore ?? deal.productScore,
        financialsScore:
          latestAnalysis?.scores.financialsScore ?? deal.financialsScore,
      }
    : deal;

  return {
    chatContext,
    canonicalDeal,
    deal: canonicalDeal,
    documents,
    latestAnalysis,
    liveSessions,
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

function buildCurrentFactMap(currentFacts: CurrentFact[]): Map<string, CurrentFact> {
  return new Map(currentFacts.map((fact) => [fact.factKey, fact]));
}

function getCurrentFactString(
  factMap: Map<string, CurrentFact>,
  factKey: string
): string | null {
  const fact = factMap.get(factKey);
  if (!fact) return null;
  if (typeof fact.currentValue === "string") return fact.currentValue;
  if (typeof fact.currentDisplayValue === "string" && fact.currentDisplayValue.length > 0) {
    return fact.currentDisplayValue;
  }
  return null;
}

function getCurrentFactNumber(
  factMap: Map<string, CurrentFact>,
  factKey: string
): number | null {
  const fact = factMap.get(factKey);
  if (!fact) return null;
  if (typeof fact.currentValue === "number" && Number.isFinite(fact.currentValue)) {
    return fact.currentValue;
  }
  if (typeof fact.currentValue === "string") {
    const parsed = Number(fact.currentValue);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

async function getDealBasicInfo(dealId: string) {
  const [deal, currentFacts] = await Promise.all([
    prisma.deal.findUnique({
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
            linkedinUrl: true,
            verifiedInfo: true,
            previousVentures: true,
          },
        },
      },
    }),
    getCurrentFactsFromView(dealId),
  ]);

  if (!deal) {
    return null;
  }

  const factMap = buildCurrentFactMap(currentFacts);

  return {
    ...deal,
    companyName: getCurrentFactString(factMap, "company.name") ?? deal.companyName,
    website: getCurrentFactString(factMap, "other.website") ?? deal.website,
    arr: getCurrentFactNumber(factMap, "financial.arr") ?? (deal.arr != null ? Number(deal.arr) : null),
    growthRate:
      getCurrentFactNumber(factMap, "financial.revenue_growth_yoy") ??
      (deal.growthRate != null ? Number(deal.growthRate) : null),
    amountRequested:
      getCurrentFactNumber(factMap, "financial.amount_raising") ??
      (deal.amountRequested != null ? Number(deal.amountRequested) : null),
    valuationPre:
      getCurrentFactNumber(factMap, "financial.valuation_pre") ??
      (deal.valuationPre != null ? Number(deal.valuationPre) : null),
  };
}

async function getDocumentSummaries(
  dealId: string,
  options?: { documentIds?: string[] | null }
) {
  const requestedDocumentIds = options?.documentIds?.length ? options.documentIds : null;
  const documents = await prisma.document.findMany({
    where: {
      dealId,
      ...(requestedDocumentIds
        ? { id: { in: requestedDocumentIds } }
        : { isLatest: true }),
    },
    select: {
      id: true,
      name: true,
      type: true,
      processingStatus: true,
      extractedText: true,
      sourceKind: true,
      corpusRole: true,
      sourceDate: true,
      receivedAt: true,
      sourceAuthor: true,
      sourceSubject: true,
      linkedQuestionSource: true,
      linkedQuestionText: true,
      linkedRedFlagId: true,
    },
  });

  const documentOrder = requestedDocumentIds
    ? new Map(requestedDocumentIds.map((documentId, index) => [documentId, index]))
    : null;

  const orderedDocuments = requestedDocumentIds
    ? documents
        .slice()
        .sort(
          (left, right) =>
            (documentOrder?.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
            (documentOrder?.get(right.id) ?? Number.MAX_SAFE_INTEGER)
        )
    : documents;

  return orderedDocuments.map((doc) => ({
    id: doc.id,
    name: doc.name,
    type: doc.type,
    isProcessed: doc.processingStatus === "COMPLETED",
    extractedText: doc.extractedText ? safeDecrypt(doc.extractedText) : null,
    sourceKind: doc.sourceKind,
    corpusRole: doc.corpusRole,
    sourceDate: doc.sourceDate,
    receivedAt: doc.receivedAt,
    sourceAuthor: doc.sourceAuthor,
    sourceSubject: doc.sourceSubject,
    linkedQuestionSource: doc.linkedQuestionSource,
    linkedQuestionText: doc.linkedQuestionText,
    linkedRedFlagId: doc.linkedRedFlagId,
  }));
}

async function getLatestAnalysisResults(
  dealId: string,
  options?: { analysisId?: string | null }
) {
  const analysis = "analysisId" in (options ?? {})
    ? options?.analysisId
      ? await prisma.analysis.findUnique({
          where: { id: options.analysisId },
          select: {
            id: true,
            dealId: true,
            status: true,
            mode: true,
            summary: true,
            completedAt: true,
            negotiationStrategy: true,
          },
        })
      : null
    : await prisma.analysis.findFirst({
        where: { dealId, status: "COMPLETED" },
        orderBy: { completedAt: "desc" },
        select: {
          id: true,
          dealId: true,
          status: true,
          mode: true,
          summary: true,
          completedAt: true,
          negotiationStrategy: true,
        },
      });

  if (!analysis || analysis.dealId !== dealId || analysis.status !== "COMPLETED") return null;

  const results = await loadResults(analysis.id);
  const scores = extractAnalysisScores(results);

  return {
    id: analysis.id,
    mode: analysis.mode,
    summary: analysis.summary,
    completedAt: analysis.completedAt,
    hasResults: !!results,
    scores,
  };
}

// ============================================================================
// LIVE SESSION CONTEXT
// ============================================================================

/**
 * Get completed live sessions with summaries for a deal
 * Used to inject live coaching context into the chat agent
 */
async function getCompletedLiveSessions(dealId: string): Promise<LiveSessionContextData[]> {
  const sessions = await prisma.liveSession.findMany({
    where: {
      dealId,
      status: "completed",
      summary: { isNot: null },
    },
    orderBy: { endedAt: "desc" },
    take: 5, // Last 5 sessions max
    select: {
      id: true,
      startedAt: true,
      endedAt: true,
      summary: {
        select: {
          executiveSummary: true,
          keyPoints: true,
          actionItems: true,
          newInformation: true,
          contradictions: true,
          questionsAsked: true,
          remainingQuestions: true,
          confidenceDelta: true,
        },
      },
    },
  });

  return sessions
    .filter((s) => s.summary)
    .map((s) => ({
      sessionId: s.id,
      startedAt: s.startedAt?.toISOString() ?? null,
      endedAt: s.endedAt?.toISOString() ?? null,
      executiveSummary: s.summary!.executiveSummary,
      keyPoints: s.summary!.keyPoints as unknown[],
      actionItems: s.summary!.actionItems as unknown[],
      newInformation: s.summary!.newInformation as unknown[],
      contradictions: s.summary!.contradictions as unknown[],
      questionsAsked: s.summary!.questionsAsked as unknown[],
      remainingQuestions: s.summary!.remainingQuestions,
      confidenceDelta: s.summary!.confidenceDelta,
    }));
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
