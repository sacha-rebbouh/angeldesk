import type { Deal, RedFlagCategory, RedFlagSeverity } from "@prisma/client";
import type {
  DealIntelligence,
  MarketData,
  CompetitiveLandscape,
  NewsSentiment,
  PeopleGraph,
  ContextQualityScore,
} from "@/services/context-engine/types";
import type { BAPreferences } from "@/services/benchmarks";

// Agent execution context
export interface AgentContext {
  dealId: string;
  /**
   * Legacy compatibility alias. In orchestrated runtime this should mirror
   * `canonicalDeal` until all agents are migrated away from direct `deal.*` reads.
   */
  deal: Deal;
  /**
   * Canonical T0-first deal summary resolved from facts -> extracted snapshot -> legacy row.
   * This is the explicit source of truth for prompt/runtime consumers.
   */
  canonicalDeal: Deal;
  documents?: {
    id: string;
    name: string;
    type: string;
    extractedText?: string | null;
    extractionMetrics?: unknown;
    /** Date of upload/import — used for document chronology awareness */
    uploadedAt?: Date;
    sourceKind?: string | null;
    corpusRole?: string | null;
    sourceDate?: Date | null;
    receivedAt?: Date | null;
    sourceAuthor?: string | null;
    sourceSubject?: string | null;
    linkedQuestionSource?: string | null;
    linkedQuestionText?: string | null;
    linkedRedFlagId?: string | null;
    corpusParentDocumentId?: string | null;
    corpusParentDocumentName?: string | null;
  }[];
  previousResults?: Record<string, AgentResult>;
}

// Import Fact Store types for agent context
import type { CurrentFact } from "@/services/fact-store/types";
// Import Deck Coherence types for Tier 0 coherence check
import type { DeckCoherenceReport } from "@/agents/tier0/deck-coherence-checker";

// Enriched context with Context Engine data for Tier 1 agents
export interface EnrichedAgentContext extends AgentContext {
  contextEngine?: {
    dealIntelligence?: DealIntelligence;
    marketData?: MarketData;
    competitiveLandscape?: CompetitiveLandscape;
    newsSentiment?: NewsSentiment;
    peopleGraph?: PeopleGraph;
    enrichedAt?: string;
    completeness?: number;
    /** F59: Detailed quality scoring with degradation detection */
    contextQuality?: ContextQualityScore;
    // Traction data from App Store, GitHub, Product Hunt connectors (F71)
    tractionData?: {
      appStore?: {
        rating: number;
        reviewCount: number;
        downloads?: string;
        lastUpdate?: string;
        topComplaints?: string[];
      };
      googlePlay?: {
        rating: number;
        reviewCount: number;
        downloads?: string;
        lastUpdate?: string;
      };
      github?: {
        stars: number;
        forks: number;
        contributors: number;
        lastCommit?: string;
        openIssues?: number;
        language?: string;
      };
      productHunt?: {
        upvotes: number;
        rank?: number;
        launchDate?: string;
        comments?: number;
      };
    };
    // Website content insights (F71)
    websiteContent?: {
      insights?: {
        clients: string[];
        clientCount?: number;
        testimonials: { quote: string; author: string; company?: string }[];
        openPositions: number;
        hiringDepartments: string[];
        hasPricing: boolean;
        pricingModel?: string;
        priceRange?: { min: number; max: number; currency: string };
      };
    };
  };
  // BA preferences for personalized analysis (Tier 3)
  baPreferences?: BAPreferences;

  // Tier 3 coherence result (injected after T3 Batch 1)
  tier3CoherenceResult?: {
    adjusted: boolean;
    adjustments: { rule: string; field: string; before: number; after: number; reason: string }[];
    coherenceScore: number;
    warnings: string[];
  };

  // Fact Store - Verified facts extracted from documents (Tier 0)
  factStore?: CurrentFact[];
  factStoreFormatted?: string;

  // Deck Coherence Report - Tier 0 coherence check result
  deckCoherenceReport?: DeckCoherenceReport;

  // Funding DB context for Tier 2 sector experts
  fundingContext?: {
    competitors?: Array<{
      name: string;
      totalFunding?: number;
      lastRound?: string;
      status?: string;
    }>;
    sectorBenchmarks?: Record<string, unknown>;
    valuationBenchmarks?: Record<string, unknown>;
    similarDeals?: Array<Record<string, unknown>>;
    benchmarks?: {
      valuationMedian?: number;
      arrMultipleMedian?: number;
      [key: string]: unknown;
    };
    potentialCompetitors?: Array<Record<string, unknown>>;
  };

  // Alias for fundingContext (used by some agents)
  fundingDbContext?: {
    competitors?: Array<{
      name: string;
      totalFunding?: number;
      lastRound?: string;
      status?: string;
    }>;
    sectorBenchmarks?: Record<string, unknown>;
    valuationBenchmarks?: Record<string, unknown>;
    similarDeals?: Array<Record<string, unknown>>;
    benchmarks?: {
      valuationMedian?: number;
      arrMultipleMedian?: number;
      [key: string]: unknown;
    };
    potentialCompetitors?: Array<Record<string, unknown>>;
  };

  // Tier 1 cross-validation results (F34/F39)
  tier1CrossValidation?: {
    validations: {
      id: string;
      type: "PROJECTION_VS_GTM" | "METRICS_VS_RETENTION" | "TEAM_VS_TECH";
      severity: "CRITICAL" | "HIGH" | "MEDIUM";
      agent1: string;
      agent1Claim: string;
      agent2: string;
      agent2Data: string;
      verdict: "COHERENT" | "MINOR_DIVERGENCE" | "MAJOR_DIVERGENCE" | "CONTRADICTION";
      detail: string;
      suggestedScoreAdjustment?: number;
    }[];
    adjustments: {
      agentName: string;
      field: string;
      before: number;
      after: number;
      reason: string;
      crossValidationId: string;
    }[];
    warnings: string[];
  };

  // F77: Consolidated red flags from all agents (unified taxonomy)
  consolidatedRedFlags?: import("../red-flag-taxonomy").StandardizedRedFlag[];

  // Extracted data from document-extractor agent
  extractedData?: ExtractedDealInfo;

  // Founder responses for fact extraction (from questionnaire/Q&A)
  founderResponses?: Array<{
    questionId: string;
    question: string;
    answer: string;
    category: string;
  }>;

  // Previous analysis questions (cross-run persistence)
  previousAnalysisQuestions?: Array<{
    question: string;
    priority: string;
    category: string;
    agentSources: string[];
    answered: boolean;
    contexts: Array<{
      sourceAgent?: string;
      redFlagId?: string;
      triggerData?: string;
      whyItMatters?: string;
    }>;
    evaluations: Array<{
      goodAnswer?: string;
      badAnswer?: string;
      redFlagIfBadAnswer?: string;
      followUpIfBad?: string;
    }>;
    timing?: string;
    occurrenceCount: number;
  }>;

  // Deal terms for conditions-analyst
  dealTerms?: {
    valuationPre: number | null;
    amountRaised: number | null;
    dilutionPct: number | null;
    instrumentType: string | null;
    instrumentDetails: string | null;
    liquidationPref: string | null;
    antiDilution: string | null;
    proRataRights: boolean | null;
    informationRights: boolean | null;
    boardSeat: string | null;
    founderVesting: boolean | null;
    vestingDurationMonths: number | null;
    vestingCliffMonths: number | null;
    esopPct: number | null;
    dragAlong: boolean | null;
    tagAlong: boolean | null;
    ratchet: boolean | null;
    payToPlay: boolean | null;
    milestoneTranches: boolean | null;
    nonCompete: boolean | null;
    customConditions: string | null;
    notes: string | null;
  } | null;

  conditionsAnalystMode?: "pipeline" | "standalone";
  conditionsAnalystSummary?: string | null;

  dealStructure?: {
    mode: "SIMPLE" | "STRUCTURED";
    totalInvestment: number;
    tranches: Array<{
      label: string;
      trancheType: string;
      amount: number | null;
      valuationPre: number | null;
      equityPct: number | null;
      triggerType: string | null;
      triggerDetails: string | null;
      status: string;
    }>;
  };
}

// Base result structure for all agents
export interface AgentResult {
  agentName: string;
  success: boolean;
  executionTimeMs: number;
  cost: number;
  error?: string;
}

// Document Extractor specific types
export interface ExtractedDealInfo {
  companyName?: string;
  tagline?: string;
  sector?: string;
  stage?: string;
  instrument?: string;
  geography?: string;
  foundedYear?: number;
  teamSize?: number;
  websiteUrl?: string;
  arr?: number;
  mrr?: number;
  revenue?: number;
  growthRateYoY?: number;
  burnRate?: number;
  runway?: number;
  financialDataType?: "historical" | "projected" | "mixed" | "none";
  financialDataAsOf?: string;
  projectionReliability?: "very_low" | "low" | "medium" | "high";
  financialRedFlags?: string[];
  dataClassifications?: Record<string, {
    reliability: "AUDITED" | "VERIFIED" | "DECLARED" | "PROJECTED" | "ESTIMATED" | "UNVERIFIABLE";
    isProjection: boolean;
    reasoning: string;
    documentDate?: string;
    dataPeriodEnd?: string;
    projectionPercent?: number;
  }>;
  amountRaising?: number;
  valuationPre?: number;
  valuationPost?: number;
  previousRounds?: {
    date: string;
    amount: number;
    valuation?: number;
    investors?: string[];
  }[];
  customers?: number;
  users?: number;
  nrr?: number;
  churnRate?: number;
  cac?: number;
  ltv?: number;
  founders?: {
    name: string;
    role: string;
    background?: string;
    linkedinUrl?: string;
  }[];
  productDescription?: string;
  productName?: string;
  techStack?: string[];
  competitiveAdvantage?: string;
  coreValueProposition?: string;
  keyDifferentiators?: string[];
  useCases?: string[];
  targetMarket?: string;
  tam?: number;
  sam?: number;
  som?: number;
  markets?: {
    name: string;
    tamGlobal?: number;
    samEurope?: number;
    somFrance?: number;
    cagr?: number;
    year?: number;
  }[];
  competitors?: string[];
  advisors?: {
    name: string;
    role?: string;
    company?: string;
  }[];
  partners?: string[];
}

export interface ExtractionResult extends AgentResult {
  agentName: "document-extractor";
  data: {
    extractedInfo: ExtractedDealInfo;
    confidence: Record<keyof ExtractedDealInfo, number>;
    sourceReferences: {
      field: string;
      quote: string;
      documentName: string;
    }[];
  };
}

// Red Flag Detector specific types
export interface DetectedRedFlag {
  category: RedFlagCategory;
  title: string;
  description: string;
  severity: RedFlagSeverity;
  confidenceScore: number;
  evidence: {
    type: "quote" | "calculation" | "missing_info" | "external_data";
    content: string;
    source?: string;
  }[];
  questionsToAsk: string[];
  potentialMitigation?: string;
}

export interface RedFlagResult extends AgentResult {
  agentName: "red-flag-detector";
  data: {
    redFlags: DetectedRedFlag[];
    overallRiskLevel: "low" | "medium" | "high" | "critical";
    summary: string;
  };
}

// Scoring Agent types
export interface DealScores {
  global: number;
  team: number;
  market: number;
  product: number;
  financials: number;
  timing: number;
}

export interface ScoreBreakdown {
  dimension: string;
  score: number;
  maxScore: number;
  factors: {
    name: string;
    score: number;
    maxScore: number;
    rationale: string;
  }[];
}

export interface ScoringResult extends AgentResult {
  agentName: "deal-scorer";
  data: {
    scores: DealScores;
    breakdown: ScoreBreakdown[];
    percentileRanking?: {
      overall: number;
      bySector: number;
      byStage: number;
    };
    comparableDeals?: {
      name: string;
      score: number;
      outcome?: string;
    }[];
  };
}

// ============================================================================
// UNIVERSAL AGENT TYPES (v2.0) - Shared across all refactored agents
// ============================================================================

export interface AgentMeta {
  agentName: string;
  analysisDate: string;
  dataCompleteness: "complete" | "partial" | "minimal";
  confidenceLevel: number;
  confidenceIsFallback?: boolean;
  limitations: string[];
}

export interface AgentScore {
  value: number;
  grade: "A" | "B" | "C" | "D" | "F";
  isFallback?: boolean;
  breakdown: {
    criterion: string;
    weight: number;
    score: number;
    justification: string;
  }[];
}

export interface AgentRedFlag {
  id: string;
  category: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  title: string;
  description: string;
  location: string;
  evidence: string;
  contextEngineData?: string;
  impact: string;
  question: string;
  redFlagIfBadAnswer: string;
}

export interface AgentQuestion {
  priority: "CRITICAL" | "HIGH" | "MEDIUM";
  category: string;
  question: string;
  context: string;
  whatToLookFor: string;
}

export interface AgentAlertSignal {
  hasBlocker: boolean;
  blockerReason?: string;
  recommendation: "PROCEED" | "PROCEED_WITH_CAUTION" | "INVESTIGATE_FURTHER" | "STOP";
  justification: string;
}

export interface AgentNarrative {
  oneLiner: string;
  summary: string;
  keyInsights: string[];
  forNegotiation: string[];
}

export interface DbCrossReference {
  claims: {
    claim: string;
    location: string;
    dbVerdict: "VERIFIED" | "CONTRADICTED" | "PARTIAL" | "NOT_VERIFIABLE";
    evidence: string;
    severity?: "CRITICAL" | "HIGH" | "MEDIUM";
  }[];
  uncheckedClaims: string[];
}
