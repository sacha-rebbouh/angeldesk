/**
 * Context Retriever Service
 *
 * Retrieves relevant context for the chat agent based on the user's question and intent.
 * This service is responsible for fetching facts, analysis results, red flags, and benchmarks
 * from the database to provide the chat agent with the necessary context for generating responses.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { CurrentFact } from "@/services/fact-store/types";
import { getCurrentFacts } from "@/services/fact-store/current-facts";

// ============================================================================
// TYPES
// ============================================================================

export interface RetrievedFact {
  key: string;
  value: string;
  source: string;
  confidence: number;
  category: string;
}

export interface RetrievedAgentResult {
  agent: string;
  summary: string;
  findings: string[];
  score?: number;
  confidence?: number;
  fullData?: Record<string, unknown>; // Complete agent output, not just summary
}

export interface RetrievedRedFlag {
  title: string;
  severity: string;
  description: string;
  category: string;
  questionsToAsk: string[];
}

export interface RetrievedDocument {
  name: string;
  type: string;
  extractedText?: string | null;
  relevantExcerpt?: string;
}

export interface RetrievedBenchmarks {
  sector: string;
  stage?: string;
  metrics: Record<string, unknown>;
}

export interface RetrievedFounder {
  name: string;
  role: string;
  linkedinUrl: string | null;
  previousVentures: unknown;
  verifiedInfo: Record<string, unknown> | null;
}

export interface RetrievedScoredFinding {
  agentName: string;
  metric: string;
  category: string;
  value: string | null;
  unit: string;
  normalizedValue: number | null;
  percentile: number | null;
  assessment: string;
  benchmarkData: Record<string, unknown> | null;
  confidenceLevel: string;
  confidenceScore: number;
  evidence: Array<Record<string, unknown>> | null;
}

export interface RetrievedDebateRecord {
  topic: string;
  severity: string;
  participants: string[];
  claims: Array<Record<string, unknown>>;
  resolution: string | null;
  resolvedBy: string | null;
  winner: string | null;
  finalValue: string | null;
  resolutionConfidence: number | null;
  status: string;
}

export interface RetrievedBoardResult {
  verdict: string | null;
  consensusLevel: string | null;
  consensusPoints: unknown[] | null;
  frictionPoints: unknown[] | null;
  questionsForFounder: unknown[] | null;
  totalRounds: number;
  members: Array<{
    modelName: string;
    finalVote: string | null;
    finalConfidence: number | null;
    voteJustification: string | null;
    initialAnalysis: Record<string, unknown> | null;
  }>;
}

export interface RetrievedContext {
  facts: RetrievedFact[];
  agentResults: RetrievedAgentResult[];
  redFlags: RetrievedRedFlag[];
  benchmarks?: RetrievedBenchmarks;
  documents?: RetrievedDocument[];
  founders?: RetrievedFounder[];
  scoredFindings?: RetrievedScoredFinding[];
  debateRecords?: RetrievedDebateRecord[];
  boardResult?: RetrievedBoardResult;
  analysisSummary?: string | null;
  negotiationStrategy?: unknown;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}

// Intent types (matching the chat agent's classification)
export type ChatIntent =
  | "CLARIFICATION"
  | "COMPARISON"
  | "SIMULATION"
  | "DEEP_DIVE"
  | "FOLLOW_UP"
  | "NEGOTIATION"
  | "GENERAL";

// Pre-fetched deal info to avoid redundant queries across enrichment functions
interface DealInfo {
  sector: string | null;
  stage: string | null;
  arr: number | null;
  growthRate: number | null;
  valuationPre: number | null;
  amountRequested: number | null;
  globalScore: number | null;
  teamScore: number | null;
  marketScore: number | null;
  productScore: number | null;
  financialsScore: number | null;
}

// Topic to agent mapping for deep dives
const TOPIC_TO_AGENTS: Record<string, string[]> = {
  // Financial topics
  financial: ["financial-auditor", "cap-table-auditor"],
  finance: ["financial-auditor", "cap-table-auditor"],
  valuation: ["financial-auditor", "exit-strategist"],
  revenue: ["financial-auditor"],
  arr: ["financial-auditor"],
  mrr: ["financial-auditor"],
  burn: ["financial-auditor"],
  runway: ["financial-auditor"],
  cap_table: ["cap-table-auditor"],
  equity: ["cap-table-auditor"],

  // Team topics
  team: ["team-investigator"],
  founder: ["team-investigator"],
  founders: ["team-investigator"],
  experience: ["team-investigator"],

  // Market topics
  market: ["market-intelligence", "competitive-intel"],
  competition: ["competitive-intel"],
  competitors: ["competitive-intel"],
  tam: ["market-intelligence"],
  sam: ["market-intelligence"],
  industry: ["market-intelligence"],

  // Technical topics
  tech: ["tech-stack-dd", "tech-ops-dd"],
  technology: ["tech-stack-dd", "tech-ops-dd"],
  stack: ["tech-stack-dd"],
  security: ["tech-ops-dd"],
  scalability: ["tech-stack-dd"],
  technical: ["tech-stack-dd", "tech-ops-dd"],

  // Product topics
  product: ["customer-intel", "gtm-analyst"],
  customers: ["customer-intel"],
  retention: ["customer-intel"],
  churn: ["customer-intel"],
  pmf: ["customer-intel"],

  // GTM topics
  gtm: ["gtm-analyst"],
  sales: ["gtm-analyst"],
  marketing: ["gtm-analyst"],
  distribution: ["gtm-analyst"],

  // Legal topics
  legal: ["legal-regulatory"],
  regulatory: ["legal-regulatory"],
  compliance: ["legal-regulatory"],
  ip: ["legal-regulatory", "tech-ops-dd"],

  // Exit topics
  exit: ["exit-strategist"],
  acquisition: ["exit-strategist"],
  ipo: ["exit-strategist"],
  liquidity: ["exit-strategist"],

  // Deck topics
  deck: ["deck-forensics"],
  pitch: ["deck-forensics"],
  claims: ["deck-forensics"],
  inconsistencies: ["deck-forensics"],

  // Synthesis topics
  overall: ["synthesis-deal-scorer", "contradiction-detector", "devils-advocate"],
  score: ["synthesis-deal-scorer"],
  risk: ["devils-advocate", "red-flag-detector"],
  risks: ["devils-advocate", "red-flag-detector"],
  contradictions: ["contradiction-detector"],
};

// ============================================================================
// MAIN RETRIEVAL FUNCTION
// ============================================================================

/**
 * Retrieves relevant context for the chat agent based on the user's message and intent.
 *
 * @param dealId - The deal ID
 * @param message - The user's message
 * @param intent - The classified intent of the message
 * @returns Retrieved context containing facts, agent results, red flags, and more
 */
export async function retrieveContext(
  dealId: string,
  message: string,
  intent: ChatIntent
): Promise<RetrievedContext> {
  // Pre-fetch ALL data sources in parallel for maximum DB coverage
  const [facts, redFlags, chatContext, dealInfo, scoredFindings, debateRecords, boardResult, latestAnalysisMeta] = await Promise.all([
    getCurrentFacts(dealId),
    getRedFlags(dealId),
    getDealChatContext(dealId),
    prisma.deal.findUnique({
      where: { id: dealId },
      select: {
        sector: true,
        stage: true,
        arr: true,
        growthRate: true,
        valuationPre: true,
        amountRequested: true,
        globalScore: true,
        teamScore: true,
        marketScore: true,
        productScore: true,
        financialsScore: true,
      },
    }),
    getScoredFindings(dealId),
    getDebateRecords(dealId),
    getBoardResult(dealId),
    getLatestAnalysisMeta(dealId),
  ]);

  // Convert Decimal fields to number | null
  const deal: DealInfo | null = dealInfo
    ? {
        sector: dealInfo.sector,
        stage: dealInfo.stage,
        arr: dealInfo.arr ? Number(dealInfo.arr) : null,
        growthRate: dealInfo.growthRate ? Number(dealInfo.growthRate) : null,
        valuationPre: dealInfo.valuationPre ? Number(dealInfo.valuationPre) : null,
        amountRequested: dealInfo.amountRequested ? Number(dealInfo.amountRequested) : null,
        globalScore: dealInfo.globalScore,
        teamScore: dealInfo.teamScore,
        marketScore: dealInfo.marketScore,
        productScore: dealInfo.productScore,
        financialsScore: dealInfo.financialsScore,
      }
    : null;

  // Convert facts to retrieved format
  const retrievedFacts = facts.map(factToRetrieved);
  const retrievedRedFlags = redFlags.map(redFlagToRetrieved);

  // Build base context with ALL available data
  const context: RetrievedContext = {
    facts: retrievedFacts,
    agentResults: chatContext?.agentSummaries
      ? Object.entries(chatContext.agentSummaries).map(([agent, summary]) => ({
          agent,
          summary: (summary as { summary?: string }).summary ?? "",
          findings: (summary as { keyFindings?: string[] }).keyFindings ?? [],
          score: (summary as { score?: number }).score,
          confidence: (summary as { confidence?: number }).confidence,
        }))
      : [],
    redFlags: retrievedRedFlags,
    scoredFindings: scoredFindings.length > 0 ? scoredFindings : undefined,
    debateRecords: debateRecords.length > 0 ? debateRecords : undefined,
    boardResult: boardResult ?? undefined,
    analysisSummary: latestAnalysisMeta?.summary,
    negotiationStrategy: latestAnalysisMeta?.negotiationStrategy,
  };

  // Intent-specific retrieval (pass pre-fetched deal info to avoid redundant queries)
  switch (intent) {
    case "CLARIFICATION":
      await enrichForClarification(context, dealId, message, facts);
      break;

    case "COMPARISON":
      await enrichForComparison(context, dealId, deal, chatContext);
      break;

    case "SIMULATION":
      await enrichForSimulation(context, dealId, deal);
      break;

    case "DEEP_DIVE":
      await enrichForDeepDive(context, dealId, message);
      break;

    case "FOLLOW_UP":
      await enrichForFollowUp(context, dealId);
      break;

    case "NEGOTIATION":
      await enrichForNegotiation(context, dealId, deal);
      break;

    case "GENERAL":
    default:
      await enrichForGeneral(context, dealId, deal);
      break;
  }

  return context;
}

// ============================================================================
// INTENT-SPECIFIC ENRICHMENT FUNCTIONS
// ============================================================================

/**
 * Enrich context for clarification intents.
 * Focuses on fetching specific facts mentioned in the message.
 */
async function enrichForClarification(
  context: RetrievedContext,
  dealId: string,
  message: string,
  facts: CurrentFact[]
): Promise<void> {
  // Extract keywords from the message
  const keywords = extractKeywords(message);

  // Search for relevant facts
  const relevantFacts = searchFactsByKeywords(facts, keywords);

  // If we found specific relevant facts, prioritize them
  if (relevantFacts.length > 0) {
    const relevantFactKeys = new Set(relevantFacts.map((f) => f.factKey));
    context.facts = [
      ...relevantFacts.map(factToRetrieved),
      ...context.facts.filter((f) => !relevantFactKeys.has(f.key)),
    ];
  }

  // Fetch documents, founders, and relevant agent results in parallel
  const topic = detectTopic(message);
  const [documents, founders, agentResults] = await Promise.all([
    getDocuments(dealId),
    getFounders(dealId),
    getAgentResultsForTopic(dealId, topic),
  ]);

  if (documents.length > 0) {
    context.documents = documents.map((doc) => ({
      name: doc.name,
      type: doc.type,
      extractedText: doc.extractedText,
    }));
  }

  if (founders.length > 0) {
    context.founders = founders;
  }

  if (agentResults.length > 0) {
    const agentNames = new Set(agentResults.map((r) => r.agent));
    context.agentResults = [
      ...agentResults,
      ...context.agentResults.filter((r) => !agentNames.has(r.agent)),
    ];
  }
}

/**
 * Enrich context for comparison intents.
 * Focuses on benchmarks and comparable deals.
 */
async function enrichForComparison(
  context: RetrievedContext,
  dealId: string,
  deal: DealInfo | null,
  chatContext: Awaited<ReturnType<typeof getDealChatContext>> | null
): Promise<void> {
  if (!deal?.sector) return;

  // Fetch benchmarks, founders, and financial agent results in parallel
  const [benchmarks, founders, financialResults] = await Promise.all([
    getBenchmarks(deal.sector, deal.stage ?? undefined),
    getFounders(dealId),
    getAgentResultsForTopic(dealId, "financial"),
  ]);

  if (benchmarks) {
    context.benchmarks = benchmarks;
  }

  if (founders.length > 0) {
    context.founders = founders;
  }

  if (financialResults.length > 0) {
    context.agentResults = [
      ...financialResults,
      ...context.agentResults.filter((r) => !financialResults.some((f) => f.agent === r.agent)),
    ];
  }

  // Use pre-fetched chat context for comparable deals
  if (chatContext?.comparableDeals) {
    if (!context.benchmarks) {
      context.benchmarks = {
        sector: deal.sector,
        stage: deal.stage ?? undefined,
        metrics: {},
      };
    }
    (context.benchmarks.metrics as Record<string, unknown>).comparableDeals =
      chatContext.comparableDeals;
  }
}

/**
 * Enrich context for simulation intents.
 * Focuses on financial data and benchmarks for running scenarios.
 */
async function enrichForSimulation(
  context: RetrievedContext,
  dealId: string,
  deal: DealInfo | null
): Promise<void> {
  if (!deal) return;

  // Fetch benchmarks, scenario results, financial results, and founders in parallel
  const [benchmarks, scenarioResults, financialResults, founders] = await Promise.all([
    deal.sector ? getBenchmarks(deal.sector, deal.stage ?? undefined) : null,
    getAgentResultsForTopic(dealId, "scenario"),
    getAgentResultsForTopic(dealId, "financial"),
    getFounders(dealId),
  ]);

  if (benchmarks) {
    context.benchmarks = benchmarks;
  }

  if (founders.length > 0) {
    context.founders = founders;
  }

  // Merge scenario + financial results
  const mergedResults = [...scenarioResults, ...financialResults];
  if (mergedResults.length > 0) {
    const mergedNames = new Set(mergedResults.map((r) => r.agent));
    context.agentResults = [
      ...mergedResults,
      ...context.agentResults.filter((r) => !mergedNames.has(r.agent)),
    ];
  }
}

/**
 * Enrich context for deep dive intents.
 * Focuses on specific agent analysis results based on the topic.
 */
async function enrichForDeepDive(
  context: RetrievedContext,
  dealId: string,
  message: string
): Promise<void> {
  // Detect topic from message
  const topic = detectTopic(message);

  // Get relevant agent results and documents in parallel
  const [topicAgentResults, documents] = await Promise.all([
    getAgentResultsForTopic(dealId, topic),
    getDocumentsForTopic(dealId, topic),
  ]);

  if (topicAgentResults.length > 0) {
    // Replace or merge with existing agent results
    const topicAgentNames = new Set(topicAgentResults.map((r) => r.agent));
    context.agentResults = [
      ...topicAgentResults,
      ...context.agentResults.filter((r) => !topicAgentNames.has(r.agent)),
    ];
  }

  if (documents.length > 0) {
    context.documents = documents;
  }

  // For team/founder topics, fetch enriched founder data (LinkedIn profiles)
  const teamTopics = new Set(["team", "founder", "founders", "experience"]);
  if (teamTopics.has(topic) || message.toLowerCase().match(/fondateur|founder|ceo|cto|equipe|team/)) {
    const founders = await getFounders(dealId);
    if (founders.length > 0) {
      context.founders = founders;
    }
  }
}

/**
 * Enrich context for follow-up intents.
 * Focuses on previous conversation context + all data for reference.
 */
async function enrichForFollowUp(
  context: RetrievedContext,
  dealId: string
): Promise<void> {
  // Get conversation history, founders, and all agent results in parallel
  const [recentConversation, founders, allResults] = await Promise.all([
    getRecentConversationHistory(dealId),
    getFounders(dealId),
    getAgentResultsForTopic(dealId, "overall"),
  ]);

  if (recentConversation.length > 0) {
    context.conversationHistory = recentConversation;
  }

  if (founders.length > 0) {
    context.founders = founders;
  }

  if (allResults.length > 0) {
    context.agentResults = allResults;
  }
}

/**
 * Enrich context for negotiation intents.
 * Fetches negotiation strategy from the latest analysis.
 */
async function enrichForNegotiation(
  context: RetrievedContext,
  dealId: string,
  deal: DealInfo | null
): Promise<void> {
  // Get the latest completed analysis with negotiation strategy
  const analysis = await prisma.analysis.findFirst({
    where: { dealId, status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    select: {
      id: true,
      negotiationStrategy: true,
      results: true,
    },
  });

  if (analysis?.negotiationStrategy) {
    // Add negotiation strategy to benchmarks for access in chat
    if (!context.benchmarks) {
      context.benchmarks = {
        sector: deal?.sector ?? "unknown",
        stage: deal?.stage ?? undefined,
        metrics: {},
      };
    }
    (context.benchmarks.metrics as Record<string, unknown>).negotiationStrategy =
      analysis.negotiationStrategy;
  }

  // Add financial data for negotiation context (using pre-fetched deal info)
  if (deal) {
    if (!context.benchmarks) {
      context.benchmarks = {
        sector: deal.sector ?? "unknown",
        stage: deal.stage ?? undefined,
        metrics: {},
      };
    }
    (context.benchmarks.metrics as Record<string, unknown>).dealFinancials = {
      valuationPre: deal.valuationPre,
      amountRequested: deal.amountRequested,
      arr: deal.arr,
      growthRate: deal.growthRate,
    };
  }

  // Get founders and all agent results for negotiation context
  const [founders, allResults] = await Promise.all([
    getFounders(dealId),
    getAgentResultsForTopic(dealId, "overall"),
  ]);

  if (founders.length > 0) {
    context.founders = founders;
  }

  if (allResults.length > 0) {
    context.agentResults = allResults;
  }
}

/**
 * Enrich context for general intents.
 * Provides a balanced overview of all relevant data.
 */
async function enrichForGeneral(
  context: RetrievedContext,
  dealId: string,
  deal: DealInfo | null
): Promise<void> {
  // Fetch benchmarks, documents, founders, and ALL agent results in parallel
  const [benchmarks, documents, founders, allAgentResults] = await Promise.all([
    deal?.sector ? getBenchmarks(deal.sector, deal.stage ?? undefined) : null,
    getDocuments(dealId),
    getFounders(dealId),
    getAgentResultsForTopic(dealId, "overall"),
  ]);

  if (benchmarks) {
    context.benchmarks = benchmarks;
  }

  if (documents.length > 0) {
    context.documents = documents.map((doc) => ({
      name: doc.name,
      type: doc.type,
      extractedText: doc.extractedText,
    }));
  }

  if (founders.length > 0) {
    context.founders = founders;
  }

  // Include ALL agent results for general questions
  if (allAgentResults.length > 0) {
    context.agentResults = allAgentResults;
  }
}

// ============================================================================
// DATA FETCHING FUNCTIONS
// ============================================================================

/**
 * Search FactEvent table for relevant facts based on keywords.
 */
export async function searchFacts(
  dealId: string,
  keywords: string[]
): Promise<RetrievedFact[]> {
  if (keywords.length === 0) return [];

  // Get all current facts and filter by keywords
  const facts = await getCurrentFacts(dealId);
  const relevantFacts = searchFactsByKeywords(facts, keywords);

  return relevantFacts.map(factToRetrieved);
}

/**
 * Filter facts by keywords (in-memory search).
 */
function searchFactsByKeywords(
  facts: CurrentFact[],
  keywords: string[]
): CurrentFact[] {
  if (keywords.length === 0) return facts;

  const normalizedKeywords = keywords.map((k) => k.toLowerCase());

  return facts.filter((fact) => {
    const factText = [
      fact.factKey,
      fact.currentDisplayValue,
      fact.category,
      String(fact.currentValue),
    ]
      .join(" ")
      .toLowerCase();

    return normalizedKeywords.some((keyword) => factText.includes(keyword));
  });
}

/**
 * Get agent analysis results for a specific topic.
 */
export async function getAgentResultsForTopic(
  dealId: string,
  topic: string
): Promise<RetrievedAgentResult[]> {
  // Get relevant agent names for this topic
  const agentNames = TOPIC_TO_AGENTS[topic.toLowerCase()] ?? [];

  if (agentNames.length === 0) {
    // If no specific mapping, return all agent results
    const analysis = await getLatestAnalysis(dealId);
    if (!analysis?.results) return [];

    return extractAgentResults(analysis.results as Record<string, unknown>);
  }

  // Get the latest analysis
  const analysis = await getLatestAnalysis(dealId);
  if (!analysis?.results) return [];

  const results = analysis.results as Record<string, unknown>;
  const retrievedResults: RetrievedAgentResult[] = [];

  for (const agentName of agentNames) {
    const agentResult = results[agentName];
    if (agentResult && typeof agentResult === "object") {
      const extracted = extractSingleAgentResult(
        agentName,
        agentResult as Record<string, unknown>
      );
      if (extracted) {
        retrievedResults.push(extracted);
      }
    }
  }

  return retrievedResults;
}

/**
 * Get red flags for a deal.
 */
async function getRedFlags(
  dealId: string
): Promise<
  Array<{
    title: string;
    severity: string;
    description: string;
    category: string;
    questionsToAsk: string[];
  }>
> {
  const redFlags = await prisma.redFlag.findMany({
    where: { dealId },
    orderBy: [{ severity: "asc" }, { detectedAt: "desc" }],
    select: {
      title: true,
      severity: true,
      description: true,
      category: true,
      questionsToAsk: true,
    },
  });

  return redFlags;
}

/**
 * Get pre-computed chat context for a deal.
 */
async function getDealChatContext(dealId: string): Promise<{
  keyFacts: unknown[];
  agentSummaries: Record<string, unknown>;
  redFlagsContext: unknown[];
  benchmarkData?: unknown;
  comparableDeals?: unknown[];
} | null> {
  const context = await prisma.dealChatContext.findUnique({
    where: { dealId },
  });

  if (!context) return null;

  return {
    keyFacts: context.keyFacts as unknown[],
    agentSummaries: context.agentSummaries as Record<string, unknown>,
    redFlagsContext: context.redFlagsContext as unknown[],
    benchmarkData: context.benchmarkData,
    comparableDeals: context.comparableDeals as unknown[] | undefined,
  };
}

/**
 * Get benchmarks for a sector and stage.
 */
async function getBenchmarks(
  sector: string,
  stage?: string
): Promise<RetrievedBenchmarks | null> {
  // Try sector benchmark first
  const sectorBenchmark = await prisma.sectorBenchmark.findUnique({
    where: { sector },
  });

  if (sectorBenchmark) {
    return {
      sector,
      stage,
      metrics: sectorBenchmark.data as Record<string, unknown>,
    };
  }

  // Fallback to generic benchmarks
  const benchmarks = await prisma.benchmark.findMany({
    where: {
      sector,
      ...(stage && { stage }),
    },
  });

  if (benchmarks.length === 0) return null;

  const metrics: Record<string, unknown> = {};
  for (const benchmark of benchmarks) {
    metrics[benchmark.metricName] = {
      p25: Number(benchmark.p25),
      median: Number(benchmark.median),
      p75: Number(benchmark.p75),
      source: benchmark.source,
    };
  }

  return { sector, stage, metrics };
}

/**
 * Get founders for a deal (including enriched LinkedIn data).
 */
async function getFounders(dealId: string): Promise<RetrievedFounder[]> {
  const founders = await prisma.founder.findMany({
    where: { dealId },
    select: {
      name: true,
      role: true,
      linkedinUrl: true,
      previousVentures: true,
      verifiedInfo: true,
    },
  });

  return founders.map((f) => ({
    name: f.name,
    role: f.role,
    linkedinUrl: f.linkedinUrl,
    previousVentures: f.previousVentures,
    verifiedInfo: f.verifiedInfo as Record<string, unknown> | null,
  }));
}

/**
 * Get documents for a deal (including extracted text for full context).
 */
async function getDocuments(
  dealId: string
): Promise<Array<{ id: string; name: string; type: string; extractedText: string | null }>> {
  return prisma.document.findMany({
    where: { dealId },
    select: { id: true, name: true, type: true, extractedText: true },
  });
}

/**
 * Get documents relevant to a specific topic (including extracted text).
 */
async function getDocumentsForTopic(
  dealId: string,
  topic: string
): Promise<RetrievedDocument[]> {
  const documents = await getDocuments(dealId);

  // Map topics to relevant document types
  const topicToDocTypes: Record<string, string[]> = {
    financial: ["FINANCIAL_MODEL", "FINANCIAL_STATEMENTS"],
    finance: ["FINANCIAL_MODEL", "FINANCIAL_STATEMENTS"],
    valuation: ["FINANCIAL_MODEL", "PITCH_DECK"],
    cap_table: ["CAP_TABLE"],
    equity: ["CAP_TABLE"],
    legal: ["LEGAL_DOCS"],
    regulatory: ["LEGAL_DOCS"],
    market: ["MARKET_STUDY", "PITCH_DECK"],
    product: ["PRODUCT_DEMO", "PITCH_DECK"],
    deck: ["PITCH_DECK"],
    pitch: ["PITCH_DECK"],
  };

  const relevantTypes = topicToDocTypes[topic.toLowerCase()] ?? [];

  if (relevantTypes.length === 0) {
    // Return all documents with extractedText
    return documents.map((doc) => ({ name: doc.name, type: doc.type, extractedText: doc.extractedText }));
  }

  // Filter by relevant types
  const relevantDocs = documents.filter((doc) =>
    relevantTypes.includes(doc.type)
  );

  return relevantDocs.map((doc) => ({ name: doc.name, type: doc.type, extractedText: doc.extractedText }));
}

/**
 * Get recent conversation history for follow-up context.
 */
async function getRecentConversationHistory(
  dealId: string,
  limit: number = 10
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  // Get the most recent conversation for this deal
  const conversation = await prisma.chatConversation.findFirst({
    where: { dealId, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  if (!conversation) return [];

  // Get recent messages
  const messages = await prisma.chatMessage.findMany({
    where: {
      conversationId: conversation.id,
      role: { in: ["USER", "ASSISTANT"] },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { role: true, content: true },
  });

  // Return in chronological order
  return messages.reverse().map((m) => ({
    role: m.role === "USER" ? "user" : "assistant",
    content: m.content,
  }));
}

/**
 * Get the latest completed analysis for a deal.
 */
async function getLatestAnalysis(
  dealId: string
): Promise<{ id: string; mode: string | null; results: Prisma.JsonValue } | null> {
  return prisma.analysis.findFirst({
    where: { dealId, status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    select: { id: true, mode: true, results: true },
  });
}

/**
 * Get latest analysis metadata (summary + negotiation strategy).
 */
async function getLatestAnalysisMeta(
  dealId: string
): Promise<{ summary: string | null; negotiationStrategy: unknown } | null> {
  const analysis = await prisma.analysis.findFirst({
    where: { dealId, status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    select: { summary: true, negotiationStrategy: true },
  });
  return analysis;
}

/**
 * Get scored findings for a deal (quantified metrics with benchmarks).
 */
async function getScoredFindings(
  dealId: string
): Promise<RetrievedScoredFinding[]> {
  // Get the latest analysis ID first
  const analysis = await prisma.analysis.findFirst({
    where: { dealId, status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    select: { id: true },
  });
  if (!analysis) return [];

  const findings = await prisma.scoredFinding.findMany({
    where: { analysisId: analysis.id },
    orderBy: { createdAt: "desc" },
  });

  return findings.map((f) => ({
    agentName: f.agentName,
    metric: f.metric,
    category: f.category,
    value: f.value,
    unit: f.unit,
    normalizedValue: f.normalizedValue,
    percentile: f.percentile,
    assessment: f.assessment,
    benchmarkData: f.benchmarkData as Record<string, unknown> | null,
    confidenceLevel: f.confidenceLevel,
    confidenceScore: f.confidenceScore,
    evidence: f.evidence as Array<Record<string, unknown>> | null,
  }));
}

/**
 * Get debate records for a deal (contradiction resolutions).
 */
async function getDebateRecords(
  dealId: string
): Promise<RetrievedDebateRecord[]> {
  const analysis = await prisma.analysis.findFirst({
    where: { dealId, status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    select: { id: true },
  });
  if (!analysis) return [];

  const records = await prisma.debateRecord.findMany({
    where: { analysisId: analysis.id },
    orderBy: { createdAt: "desc" },
  });

  return records.map((r) => ({
    topic: r.topic,
    severity: r.severity,
    participants: r.participants,
    claims: r.claims as Array<Record<string, unknown>>,
    resolution: r.resolution,
    resolvedBy: r.resolvedBy,
    winner: r.winner,
    finalValue: r.finalValue,
    resolutionConfidence: r.resolutionConfidence,
    status: r.status,
  }));
}

/**
 * Get AI Board results for a deal (multi-LLM deliberation).
 */
async function getBoardResult(
  dealId: string
): Promise<RetrievedBoardResult | null> {
  const session = await prisma.aIBoardSession.findFirst({
    where: { dealId, status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    select: {
      verdict: true,
      consensusLevel: true,
      consensusPoints: true,
      frictionPoints: true,
      questionsForFounder: true,
      totalRounds: true,
      members: {
        select: {
          modelName: true,
          finalVote: true,
          finalConfidence: true,
          voteJustification: true,
          initialAnalysis: true,
        },
      },
    },
  });

  if (!session) return null;

  return {
    verdict: session.verdict,
    consensusLevel: session.consensusLevel,
    consensusPoints: session.consensusPoints as unknown[] | null,
    frictionPoints: session.frictionPoints as unknown[] | null,
    questionsForFounder: session.questionsForFounder as unknown[] | null,
    totalRounds: session.totalRounds,
    members: session.members.map((m) => ({
      modelName: m.modelName,
      finalVote: m.finalVote,
      finalConfidence: m.finalConfidence,
      voteJustification: m.voteJustification,
      initialAnalysis: m.initialAnalysis as Record<string, unknown> | null,
    })),
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract keywords from a message for searching.
 */
function extractKeywords(message: string): string[] {
  // Remove common words and extract meaningful keywords
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "must",
    "shall",
    "can",
    "need",
    "to",
    "of",
    "in",
    "for",
    "on",
    "with",
    "at",
    "by",
    "from",
    "as",
    "into",
    "through",
    "during",
    "before",
    "after",
    "above",
    "below",
    "between",
    "under",
    "again",
    "further",
    "then",
    "once",
    "here",
    "there",
    "when",
    "where",
    "why",
    "how",
    "all",
    "each",
    "few",
    "more",
    "most",
    "other",
    "some",
    "such",
    "no",
    "nor",
    "not",
    "only",
    "own",
    "same",
    "so",
    "than",
    "too",
    "very",
    "just",
    "what",
    "which",
    "who",
    "this",
    "that",
    "these",
    "those",
    "am",
    "and",
    "but",
    "if",
    "or",
    "because",
    "until",
    "while",
    "about",
    "tell",
    "me",
    "about",
    "explain",
    "describe",
    "show",
    "give",
    "find",
    "get",
  ]);

  const words = message
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));

  // Return unique keywords
  return [...new Set(words)];
}

/**
 * Detect the topic from a message.
 */
function detectTopic(message: string): string {
  const normalizedMessage = message.toLowerCase();

  // Check for topic keywords in order of specificity
  const topicKeywords: Array<[string, string[]]> = [
    ["cap_table", ["cap table", "captable", "cap-table", "equity", "dilution", "ownership"]],
    ["financial", ["financial", "revenue", "arr", "mrr", "burn", "runway", "cash"]],
    ["valuation", ["valuation", "multiple", "worth", "value"]],
    ["team", ["team", "founder", "founders", "ceo", "cto", "experience", "background"]],
    ["competition", ["competitor", "competitors", "competition", "competitive"]],
    ["market", ["market", "tam", "sam", "som", "industry", "sector"]],
    ["tech", ["tech", "technology", "stack", "technical", "engineering"]],
    ["security", ["security", "secure", "vulnerability", "compliance"]],
    ["product", ["product", "feature", "roadmap", "mvp"]],
    ["customers", ["customer", "customers", "client", "clients", "user", "users"]],
    ["retention", ["retention", "churn", "nrr", "ltv", "cac"]],
    ["gtm", ["gtm", "go-to-market", "sales", "marketing", "distribution"]],
    ["legal", ["legal", "regulatory", "compliance", "ip", "patent", "trademark"]],
    ["exit", ["exit", "acquisition", "ipo", "liquidity", "m&a"]],
    ["deck", ["deck", "pitch", "presentation", "claims"]],
    ["risk", ["risk", "risks", "red flag", "concern", "warning"]],
    ["contradictions", ["contradiction", "contradictions", "inconsistent", "conflict"]],
    ["overall", ["overall", "summary", "overview", "general", "score"]],
  ];

  for (const [topic, keywords] of topicKeywords) {
    if (keywords.some((keyword) => normalizedMessage.includes(keyword))) {
      return topic;
    }
  }

  return "overall";
}

/**
 * Convert a CurrentFact to RetrievedFact format.
 */
function factToRetrieved(fact: CurrentFact): RetrievedFact {
  return {
    key: fact.factKey,
    value: fact.currentDisplayValue,
    source: fact.currentSource,
    confidence: fact.currentConfidence,
    category: fact.category,
  };
}

/**
 * Convert a red flag to RetrievedRedFlag format.
 */
function redFlagToRetrieved(redFlag: {
  title: string;
  severity: string;
  description: string;
  category: string;
  questionsToAsk: string[];
}): RetrievedRedFlag {
  return {
    title: redFlag.title,
    severity: redFlag.severity,
    description: redFlag.description,
    category: redFlag.category,
    questionsToAsk: redFlag.questionsToAsk,
  };
}

/**
 * Extract agent results from analysis results.
 */
function extractAgentResults(
  results: Record<string, unknown>
): RetrievedAgentResult[] {
  const retrievedResults: RetrievedAgentResult[] = [];

  for (const [agentName, result] of Object.entries(results)) {
    if (!result || typeof result !== "object") continue;

    const extracted = extractSingleAgentResult(
      agentName,
      result as Record<string, unknown>
    );
    if (extracted) {
      retrievedResults.push(extracted);
    }
  }

  return retrievedResults;
}

/**
 * Extract a single agent result.
 */
function extractSingleAgentResult(
  agentName: string,
  result: Record<string, unknown>
): RetrievedAgentResult | null {
  // Skip failed agents
  if (result.success === false) return null;

  const data = result.data as Record<string, unknown> | undefined;
  if (!data) return null;

  // Extract summary
  let summary = "";
  if (typeof data.summary === "string") {
    summary = data.summary;
  } else if (typeof data.recommendation === "string") {
    summary = data.recommendation;
  } else if (typeof data.verdict === "string") {
    summary = data.verdict;
  }

  // Extract findings
  let findings: string[] = [];
  if (Array.isArray(data.keyFindings)) {
    findings = data.keyFindings.filter((f): f is string => typeof f === "string");
  } else if (Array.isArray(data.findings)) {
    findings = data.findings
      .map((f) =>
        typeof f === "object" && f !== null && "finding" in f
          ? String((f as { finding: unknown }).finding)
          : null
      )
      .filter((f): f is string => f !== null);
  } else if (Array.isArray(data.concerns)) {
    findings = data.concerns
      .map((c) =>
        typeof c === "object" && c !== null && "concern" in c
          ? String((c as { concern: unknown }).concern)
          : null
      )
      .filter((c): c is string => c !== null);
  }

  // Skip if no meaningful content at all
  if (!summary && findings.length === 0 && Object.keys(data).length === 0) return null;

  return {
    agent: agentName,
    summary,
    findings: findings.slice(0, 10),
    score: typeof data.score === "number" ? data.score : undefined,
    confidence:
      typeof data.confidenceLevel === "number"
        ? data.confidenceLevel
        : typeof data.confidence === "number"
        ? data.confidence
        : undefined,
    fullData: data, // Pass the COMPLETE agent output
  };
}
