import type { Deal, RedFlagCategory, RedFlagSeverity } from "@prisma/client";
import type {
  DealContext,
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
  deal: Deal;
  documents?: {
    id: string;
    name: string;
    type: string;
    extractedText?: string | null;
    /** Date of upload/import — used for document chronology awareness */
    uploadedAt?: Date;
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
  // Contains structured, typed facts with confidence scoring
  factStore?: CurrentFact[];
  // Pre-formatted version for direct injection into prompts
  factStoreFormatted?: string;

  // Deck Coherence Report - Tier 0 coherence check result
  // Contains detected issues, missing data, and reliability grade
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
    // Additional properties used by saas-expert
    similarDeals?: Array<Record<string, unknown>>;
    benchmarks?: {
      valuationMedian?: number;
      arrMultipleMedian?: number;
      [key: string]: unknown;
    };
    potentialCompetitors?: Array<Record<string, unknown>>;
  };

  // Tier 1 cross-validation results (injected between Tier 1 and Tier 3) (F34/F39)
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
  consolidatedRedFlags?: import("./red-flag-taxonomy").StandardizedRedFlag[];

  // Extracted data from document-extractor agent
  extractedData?: ExtractedDealInfo;

  // Founder responses for fact extraction (from questionnaire/Q&A)
  founderResponses?: Array<{
    questionId: string;
    question: string;
    answer: string;
    category: string;
  }>;
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
  geography?: string;
  foundedYear?: number;
  teamSize?: number;
  /** Website URL extracted from documents */
  websiteUrl?: string;

  // Financials
  arr?: number;
  mrr?: number;
  revenue?: number;
  growthRateYoY?: number;
  burnRate?: number;
  runway?: number;

  // Financial Data Context (CRITICAL for early-stage)
  financialDataType?: "historical" | "projected" | "mixed" | "none";
  financialDataAsOf?: string; // Date of the most recent REAL data (not projections)
  projectionReliability?: "very_low" | "low" | "medium" | "high";
  financialRedFlags?: string[]; // Detected issues: absurd growth, inconsistencies, etc.

  // Per-field reliability classification (CRITICAL - prevents treating projections as facts)
  // Maps field names to their reliability classification
  dataClassifications?: Record<string, {
    reliability: "AUDITED" | "VERIFIED" | "DECLARED" | "PROJECTED" | "ESTIMATED" | "UNVERIFIABLE";
    isProjection: boolean;
    reasoning: string; // Why this classification
    documentDate?: string; // When the document was created
    dataPeriodEnd?: string; // End of the period this data covers
    projectionPercent?: number; // % of the period that is projected
  }>;

  // Fundraising
  amountRaising?: number;
  valuationPre?: number;
  valuationPost?: number;
  previousRounds?: {
    date: string;
    amount: number;
    valuation?: number;
    investors?: string[];
  }[];

  // Traction
  customers?: number;
  users?: number;
  nrr?: number; // Net Revenue Retention
  churnRate?: number;
  cac?: number;
  ltv?: number;

  // Team
  founders?: {
    name: string;
    role: string;
    background?: string;
    linkedinUrl?: string;
  }[];

  // Product
  productDescription?: string;
  productName?: string; // Nom du produit principal (ex: Axiom)
  techStack?: string[];
  competitiveAdvantage?: string;

  // Value Proposition
  coreValueProposition?: string; // Concept clé / proposition de valeur centrale
  keyDifferentiators?: string[]; // Avantages compétitifs uniques
  useCases?: string[]; // Cas d'usage adressés

  // Market - Support pour marchés multiples
  targetMarket?: string;
  tam?: number; // TAM global (deprecated, use markets[])
  sam?: number; // SAM Europe (deprecated, use markets[])
  som?: number; // SOM France (deprecated, use markets[])
  markets?: {
    name: string; // Ex: "Cyber-sécurité", "Blockchain", "Data Room"
    tamGlobal?: number;
    samEurope?: number;
    somFrance?: number;
    cagr?: number;
    year?: number;
  }[];

  // Competitors - ONLY explicit competitors mentioned
  // DO NOT include: advisors, partners, previous employers, investors
  competitors?: string[];

  // Advisors & Partners - Separate from competitors
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
    confidence: Record<keyof ExtractedDealInfo, number>; // Confidence per field
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
  confidenceScore: number; // 0-1
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

/** Structure universelle meta pour tous les agents */
export interface AgentMeta {
  agentName: string;
  analysisDate: string;
  dataCompleteness: "complete" | "partial" | "minimal";
  confidenceLevel: number; // 0-100
  confidenceIsFallback?: boolean; // true si le LLM n'a pas retourné de confidence (F43)
  limitations: string[]; // Ce qui n'a pas pu être analysé
}

/** Structure universelle score pour tous les agents */
export interface AgentScore {
  value: number; // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
  isFallback?: boolean; // true si le LLM n'a pas retourné de score (F43)
  breakdown: {
    criterion: string;
    weight: number;
    score: number;
    justification: string;
  }[];
}

/** Structure universelle red flag pour tous les agents */
export interface AgentRedFlag {
  id: string;
  category: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  title: string;
  description: string;
  location: string; // "Slide 12" ou "Financial Model, onglet CF"
  evidence: string; // Citation exacte ou donnée
  contextEngineData?: string; // Cross-reference si disponible
  impact: string; // Pourquoi c'est un problème pour le BA
  question: string; // Question à poser au fondateur
  redFlagIfBadAnswer: string;
}

/** Structure universelle question pour tous les agents */
export interface AgentQuestion {
  priority: "CRITICAL" | "HIGH" | "MEDIUM";
  category: string;
  question: string;
  context: string; // Pourquoi on pose cette question
  whatToLookFor: string; // Ce qui révèlerait un problème
}

/** Structure universelle signal d'alerte */
export interface AgentAlertSignal {
  hasBlocker: boolean;
  blockerReason?: string;
  recommendation: "PROCEED" | "PROCEED_WITH_CAUTION" | "INVESTIGATE_FURTHER" | "STOP";
  justification: string;
}

/** Structure universelle narrative */
export interface AgentNarrative {
  oneLiner: string; // Résumé en 1 phrase
  summary: string; // 3-4 phrases
  keyInsights: string[]; // 3-5 insights majeurs
  forNegotiation: string[]; // Arguments pour négocier si on proceed
}

/** Cross-reference deck vs DB */
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

// ============================================================================
// TIER 1 AGENT RESULT TYPES
// ============================================================================

// ============================================================================
// DECK FORENSICS AGENT - REFONTE v2.0
// ============================================================================
// Mission: Analyse forensique APPROFONDIE du pitch deck
// Standard: Big4 + Partner VC - Chaque affirmation sourcée
// Minimum: 8+ claims, 3+ red flags si problèmes, 8+ questions

/** Verification d'un claim du deck */
export interface DeckClaimVerification {
  id: string;
  category: "market" | "traction" | "financials" | "tech" | "timing" | "competition" | "team";
  claim: string; // Citation EXACTE du deck
  location: string; // "Slide 5" ou "Executive Summary, p.2"
  status: "VERIFIED" | "UNVERIFIED" | "CONTRADICTED" | "EXAGGERATED" | "MISLEADING" | "PROJECTION_AS_FACT";
  evidence: string; // POURQUOI ce status
  sourceUsed: string; // "Context Engine", "Calcul: X/Y = Z", "Analyse temporelle", etc.
  investorImplication: string;
  dataReliability?: "AUDITED" | "VERIFIED" | "DECLARED" | "PROJECTED" | "ESTIMATED" | "UNVERIFIABLE";
}

/** Inconsistance narrative détectée */
export interface DeckInconsistency {
  id: string;
  issue: string;
  location1: string;
  location2: string;
  quote1: string;
  quote2: string;
  severity: "CRITICAL" | "MAJOR" | "MINOR";
  investorImplication: string;
}

/** Findings spécifiques Deck Forensics */
export interface DeckForensicsFindings {
  narrativeAnalysis: {
    storyCoherence: number; // 0-100
    credibilityAssessment: string; // 4-5 phrases détaillées
    narrativeStrengths: { point: string; location: string }[];
    narrativeWeaknesses: { point: string; location: string }[];
    criticalMissingInfo: { info: string; whyItMatters: string }[];
  };
  claimVerification: DeckClaimVerification[];
  inconsistencies: DeckInconsistency[];
  deckQuality: {
    professionalismScore: number; // 0-100
    completenessScore: number; // 0-100
    transparencyScore: number; // 0-100
    issues: string[];
  };
}

/** Deck Forensics Data - Structure v2.0 avec format universel */
export interface DeckForensicsData {
  meta: AgentMeta;
  score: AgentScore;
  findings: DeckForensicsFindings;
  dbCrossReference: DbCrossReference;
  redFlags: AgentRedFlag[];
  questions: AgentQuestion[];
  alertSignal: AgentAlertSignal;
  narrative: AgentNarrative;
}

export interface DeckForensicsResult extends AgentResult {
  agentName: "deck-forensics";
  data: DeckForensicsData;
}

// ============================================================================
// FINANCIAL AUDITOR AGENT - REFONTE v2.0
// ============================================================================
// Mission: Audit financier EXHAUSTIF standard Big4 + Partner VC
// Standard de qualité: Chaque affirmation sourcée, calculs montrés
// Minimum: 5+ métriques analysées, 3+ red flags, 5+ questions

// Financial Auditor - Findings spécifiques (Section 5.2)
export interface FinancialAuditFindings {
  metrics: {
    metric: string;
    status: "available" | "missing" | "suspicious";
    reportedValue?: number;
    calculatedValue?: number;
    calculation?: string; // Montrer le calcul
    benchmarkP25?: number;
    benchmarkMedian?: number;
    benchmarkP75?: number;
    percentile?: number;
    source: string;
    assessment: string;
    dataReliability?: "AUDITED" | "VERIFIED" | "DECLARED" | "PROJECTED" | "ESTIMATED" | "UNVERIFIABLE";
  }[];
  projections: {
    realistic: boolean;
    assumptions: string[];
    concerns: string[];
  };
  valuation: {
    requested?: number;
    impliedMultiple?: number;
    benchmarkMultiple: number | null;
    benchmarkMultipleIsFallback?: boolean; // true si le LLM n'a pas retourné de benchmark (F43)
    percentile?: number;
    verdict: "UNDERVALUED" | "FAIR" | "AGGRESSIVE" | "VERY_AGGRESSIVE" | "CANNOT_ASSESS";
    comparables: { name: string; multiple: number; stage: string; source: string }[];
  };
  unitEconomics: {
    ltv?: { value: number; calculation: string };
    cac?: { value: number; calculation: string };
    ltvCacRatio?: number;
    paybackMonths?: number;
    assessment: string;
  };
  burn: {
    monthlyBurn?: number;
    runway?: number;
    burnMultiple?: number;
    efficiency: "EFFICIENT" | "MODERATE" | "INEFFICIENT" | "UNKNOWN";
    assessment: string;
  };
}

// Financial Auditor Agent - Audit COMPLET pour le BA (REFONTE v2.0)
export interface FinancialAuditData {
  // === META ===
  meta: AgentMeta;

  // === SCORE PRINCIPAL ===
  score: AgentScore;

  // === FINDINGS SPECIFIQUES ===
  findings: FinancialAuditFindings;

  // === DB CROSS-REFERENCE ===
  dbCrossReference: DbCrossReference;

  // === RED FLAGS ===
  redFlags: AgentRedFlag[];

  // === QUESTIONS POUR LE FONDATEUR ===
  questions: AgentQuestion[];

  // === SIGNAL D'ALERTE ===
  alertSignal: AgentAlertSignal;

  // === RESUME NARRATIF ===
  narrative: AgentNarrative;
}

export interface FinancialAuditResult extends AgentResult {
  agentName: "financial-auditor";
  data: FinancialAuditData;
}

// ============================================================================
// MARKET INTELLIGENCE AGENT - REFONTE v2.0
// ============================================================================
// Mission: Valider les claims de marché et analyser le timing/tendances
// Standard: Big4 + Partner VC - Chaque affirmation sourcée, cross-ref DB obligatoire
// Minimum: 3+ claims vérifiés, 2+ red flags si problèmes, 5+ questions

/** Validation d'un claim de marché (TAM/SAM/SOM/croissance) */
export interface MarketClaimValidation {
  id: string;
  claimType: "tam" | "sam" | "som" | "growth" | "market_position" | "timing";
  claimedValue: string; // Citation exacte du deck
  claimedSource?: string; // Source citée par le fondateur
  location: string; // "Slide X"
  validatedValue?: string; // Valeur trouvée via Context Engine/DB
  validationSource: string; // Source de validation
  status: "VERIFIED" | "CONTRADICTED" | "PARTIAL" | "EXAGGERATED" | "NOT_VERIFIABLE";
  discrepancyPercent?: number; // Écart en %
  analysis: string; // Explication détaillée
  investorImplication: string; // Impact pour le BA
}

/** Analyse d'un concurrent pour validation marché */
export interface MarketCompetitorSignal {
  name: string;
  totalFunding: number;
  lastRoundDate?: string;
  lastRoundAmount?: number;
  status: "active" | "acquired" | "shutdown";
  signal: string; // Ce que ça dit du marché
}

/** Findings spécifiques Market Intelligence (Section 5.2) */
export interface MarketIntelFindings {
  marketSize: {
    tam: {
      claimed?: number;
      validated?: number;
      source: string;
      year: number;
      methodology: "top_down" | "bottom_up" | "unknown";
      confidence: "high" | "medium" | "low";
    };
    sam: {
      claimed?: number;
      validated?: number;
      source: string;
      calculation: string;
    };
    som: {
      claimed?: number;
      validated?: number;
      source: string;
      calculation: string;
      realisticAssessment: string;
    };
    growthRate: {
      claimed?: number;
      validated?: number;
      cagr: number;
      source: string;
      period: string;
    };
    discrepancyLevel: "NONE" | "MINOR" | "SIGNIFICANT" | "MAJOR";
    overallAssessment: string;
  };
  fundingTrends: {
    sectorName: string;
    period: string;
    totalFunding: { value: number; yoyChange: number };
    dealCount: { value: number; yoyChange: number };
    averageDealSize: { value: number; percentile?: number };
    medianValuation: { value: number; trend: string };
    trend: "HEATING" | "STABLE" | "COOLING" | "FROZEN";
    trendAnalysis: string;
    topDeals: { company: string; amount: number; date: string }[];
  };
  timing: {
    marketMaturity: "emerging" | "growing" | "mature" | "declining";
    adoptionCurve: "innovators" | "early_adopters" | "early_majority" | "late_majority";
    assessment: "EXCELLENT" | "GOOD" | "NEUTRAL" | "POOR" | "TERRIBLE";
    reasoning: string;
    windowRemaining: string;
    competitorActivity: MarketCompetitorSignal[];
  };
  regulatoryLandscape: {
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    keyRegulations: string[];
    upcomingChanges: string[];
    impact: string;
  };
  claimValidations: MarketClaimValidation[];
}

/** Market Intelligence Data - Structure v2.0 avec format universel */
export interface MarketIntelData {
  // === META ===
  meta: AgentMeta;

  // === SCORE PRINCIPAL ===
  score: AgentScore;

  // === FINDINGS SPECIFIQUES ===
  findings: MarketIntelFindings;

  // === DB CROSS-REFERENCE ===
  dbCrossReference: DbCrossReference;

  // === RED FLAGS ===
  redFlags: AgentRedFlag[];

  // === QUESTIONS POUR LE FONDATEUR ===
  questions: AgentQuestion[];

  // === SIGNAL D'ALERTE ===
  alertSignal: AgentAlertSignal;

  // === RESUME NARRATIF ===
  narrative: AgentNarrative;
}

export interface MarketIntelResult extends AgentResult {
  agentName: "market-intelligence";
  data: MarketIntelData;
}

// ============================================================================
// COMPETITIVE INTEL AGENT - REFONTE v2.0
// ============================================================================
// Mission: Cartographie COMPLETE du paysage concurrentiel + Cross-ref DB
// Standard: Big4 + Partner VC - Chaque concurrent sourcé, moat justifié
// Minimum: 5+ concurrents analysés, 3+ red flags, 5+ questions, cross-ref DB

/** Concurrent analysé en détail */
export interface CompetitorAnalysis {
  id: string;
  name: string;
  website?: string;

  // Positionnement
  positioning: string; // Comment ils se positionnent
  targetCustomer: string; // À qui ils vendent
  overlap: "direct" | "indirect" | "adjacent" | "future_threat";
  overlapExplanation: string; // POURQUOI ce niveau d'overlap

  // Données financières (si disponibles)
  funding: {
    total?: number;
    lastRound?: number;
    lastRoundDate?: string;
    stage?: string;
    investors?: string[];
    source: string; // "Funding DB", "Crunchbase", "News", "Unknown"
  };
  estimatedRevenue?: {
    value: number;
    basis: string; // Comment on estime (employees, funding, news)
  };

  // Forces et faiblesses
  strengths: {
    point: string;
    evidence: string;
  }[];
  weaknesses: {
    point: string;
    evidence: string;
  }[];

  // Évaluation de la menace
  threatLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  threatRationale: string;
  timeToThreat: string; // "Immédiat", "6-12 mois", "12-24 mois", "Long terme"

  // Différenciation vs notre deal
  differentiationVsUs: {
    ourAdvantage: string;
    theirAdvantage: string;
    verdict: "WE_WIN" | "THEY_WIN" | "PARITY" | "DIFFERENT_SEGMENT";
  };
}

/** Analyse du moat (avantage concurrentiel défendable) */
export interface MoatAnalysis {
  primaryMoatType: "network_effects" | "data_moat" | "brand" | "switching_costs" | "scale" | "technology" | "regulatory" | "none";
  secondaryMoatTypes: string[];

  // Scoring détaillé par type de moat
  moatScoring: {
    moatType: string;
    score: number; // 0-100
    evidence: string;
    sustainability: "strong" | "moderate" | "weak";
    timeframe: string; // Combien de temps ce moat tient
  }[];

  // Score global
  overallMoatStrength: number; // 0-100
  moatVerdict: "STRONG_MOAT" | "EMERGING_MOAT" | "WEAK_MOAT" | "NO_MOAT";
  moatJustification: string; // 3-4 phrases

  // Risques sur le moat
  moatRisks: {
    risk: string;
    probability: "HIGH" | "MEDIUM" | "LOW";
    impact: string;
  }[];
}

/** Analyse des claims concurrentiels du deck */
export interface CompetitiveClaim {
  id: string;
  claim: string; // Citation exacte du deck
  location: string; // "Slide 8", "Executive Summary"
  claimType: "no_competition" | "market_leader" | "unique_tech" | "first_mover" | "better_product" | "cheaper" | "other";

  // Vérification
  verificationStatus: "VERIFIED" | "CONTRADICTED" | "EXAGGERATED" | "UNVERIFIABLE";
  verificationEvidence: string;
  sourceUsed: string; // "Funding DB", "Context Engine", "Web Search"

  // Impact pour l'investisseur
  investorImplication: string;
  severityIfFalse: "CRITICAL" | "HIGH" | "MEDIUM";
}

/** Findings spécifiques Competitive Intel */
export interface CompetitiveIntelFindings {
  // Map des concurrents (minimum 5)
  competitors: CompetitorAnalysis[];

  // Concurrents manqués dans le deck (RED FLAG si présents)
  competitorsMissedInDeck: {
    name: string;
    funding?: number;
    whyRelevant: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
  }[];

  // Analyse du marché
  marketStructure: {
    concentration: "fragmented" | "moderate" | "concentrated" | "monopolistic";
    totalPlayers: number;
    topPlayersMarketShare: string; // Ex: "Top 3 = 60%"
    entryBarriers: "low" | "medium" | "high";
    entryBarriersExplanation: string;
  };

  // Analyse du moat
  moatAnalysis: MoatAnalysis;

  // Positionnement relatif
  competitivePositioning: {
    ourPosition: string; // Où on se situe
    nearestCompetitor: string;
    differentiationStrength: "strong" | "moderate" | "weak" | "unclear";
    sustainabilityOfPosition: string;
  };

  // Vérification des claims du deck
  claimsAnalysis: CompetitiveClaim[];

  // Risques concurrentiels majeurs
  competitiveThreats: {
    threat: string;
    source: string; // Nom du concurrent ou "Nouveau entrant"
    probability: "HIGH" | "MEDIUM" | "LOW";
    timeframe: string;
    potentialImpact: string;
    mitigation: string;
  }[];

  // Benchmark funding vs concurrents
  fundingBenchmark: {
    ourFunding: number;
    competitorsFunding: { name: string; funding: number }[];
    percentileVsCompetitors: number;
    verdict: string;
  };
}

/** Competitive Intel Data v2.0 - Structure standardisée */
export interface CompetitiveIntelData {
  // === META ===
  meta: AgentMeta;

  // === SCORE PRINCIPAL ===
  score: AgentScore;

  // === FINDINGS SPECIFIQUES ===
  findings: CompetitiveIntelFindings;

  // === DB CROSS-REFERENCE ===
  dbCrossReference: DbCrossReference;

  // === RED FLAGS ===
  redFlags: AgentRedFlag[];

  // === QUESTIONS POUR LE FONDATEUR ===
  questions: AgentQuestion[];

  // === SIGNAL D'ALERTE ===
  alertSignal: AgentAlertSignal;

  // === RESUME NARRATIF ===
  narrative: AgentNarrative;
}

export interface CompetitiveIntelResult extends AgentResult {
  agentName: "competitive-intel";
  data: CompetitiveIntelData;
}

// ============================================================================
// TEAM INVESTIGATOR AGENT - REFONTE v2.0
// ============================================================================
// Mission: Investigation approfondie de l'équipe fondatrice
// Standard: LinkedIn vérifié via RapidAPI Fresh LinkedIn, cross-reference DB, détection red flags
// Minimum: Profil complet par fondateur, 3+ red flags, 5+ questions

/** Profil LinkedIn enrichi via RapidAPI Fresh LinkedIn */
export interface LinkedInEnrichedProfile {
  linkedinUrl: string;
  scrapedAt: string;
  fullName: string;
  headline?: string;
  location?: string;
  about?: string;
  profilePicture?: string;

  // Expérience professionnelle (via RapidAPI Fresh LinkedIn)
  experiences: {
    title: string;
    company: string;
    companyUrl?: string;
    companyIndustry?: string;
    companySize?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    duration?: string;
    description?: string;
    isCurrentPosition?: boolean;
  }[];

  // Formation
  education: {
    school: string;
    degree?: string;
    fieldOfStudy?: string;
    startDate?: string;
    endDate?: string;
  }[];

  // Compétences
  skills?: string[];

  // Contact enrichi
  email?: string;
  phone?: string;

  // Métriques calculées après scraping
  highlights: {
    yearsExperience: number;
    educationLevel: "highschool" | "bachelor" | "master" | "phd" | "other";
    hasRelevantIndustryExp: boolean;
    hasFounderExperience: boolean;
    hasTechBackground: boolean;
    isSerialFounder: boolean;
    topCompanies: string[]; // FAANG, Big4, unicorns
    longestTenure: number; // mois
    averageTenure: number; // mois
    jobHoppingRisk: boolean; // < 18 mois de moyenne
  };
}

/** Findings spécifiques du Team Investigator */
export interface TeamInvestigatorFindings {
  founderProfiles: {
    name: string;
    role: string;
    linkedinUrl?: string;
    linkedinVerified: boolean;
    linkedinScrapedAt?: string;

    // Background professionnel (from LinkedIn)
    background: {
      yearsExperience: number;
      headline?: string;
      currentTitle?: string;
      educationHighlight?: string;
      topPreviousCompanies: string[];
      domainExpertiseYears: number;
      relevantRoles: string[];
      keySkills: string[];
    };

    // Track record entrepreneurial
    entrepreneurialTrack: {
      isFirstTimeFounder: boolean;
      previousVentures: {
        name: string;
        role: string;
        outcome: "big_success" | "success" | "acquihire" | "pivot" | "failure" | "ongoing" | "unknown";
        exitValue?: number;
        duration?: string;
        relevance: string;
        source: string;
      }[];
      totalVentures: number;
      successfulExits: number;
    };

    // Scores individuels (0-100)
    scores: {
      domainExpertise: number;
      entrepreneurialExperience: number;
      executionCapability: number;
      networkStrength: number;
      overallFounderScore: number;
    };

    // Red flags spécifiques au fondateur
    redFlags: {
      type: string;
      severity: "CRITICAL" | "HIGH" | "MEDIUM";
      description: string;
      evidence: string;
    }[];

    // Qualités remarquables
    strengths: string[];

    // Points d'attention
    concerns: string[];
  }[];

  // Profils des membres non-fondateurs (équipe opérationnelle)
  teamMemberProfiles?: {
    name: string;
    role: string;
    category: "development" | "business" | "operations" | "other";
    isFullTime: boolean;
    seniorityLevel: "junior" | "mid" | "senior" | "lead" | "unknown";
    linkedinUrl?: string;
    linkedinVerified: boolean;
    background?: {
      yearsExperience?: number;
      relevantExperience?: string;
      keySkills?: string[];
    };
    assessment: string;
    concerns?: string[];
  }[];

  teamComposition: {
    size: number;
    rolesPresent: string[];
    rolesMissing: string[];
    technicalStrength: number; // 0-100
    businessStrength: number; // 0-100
    complementarityScore: number; // 0-100
    gaps: {
      gap: string;
      severity: "CRITICAL" | "HIGH" | "MEDIUM";
      impact: string;
      recommendation: string;
    }[];
    keyHiresToMake: {
      role: string;
      priority: "IMMEDIATE" | "NEXT_6M" | "NEXT_12M";
      rationale: string;
    }[];
  };

  cofounderDynamics: {
    foundersCount: number;
    equitySplit: string;
    equitySplitAssessment: "healthy" | "concerning" | "red_flag" | "unknown";
    vestingInPlace: boolean;
    workingHistoryTogether: {
      duration: string;
      context: string;
      assessment: string;
    };
    relationshipStrength: "strong" | "moderate" | "weak" | "unknown";
    potentialConflicts: string[];
    soloFounderRisk?: string;
    // Decision-making dynamics (F35)
    decisionMaking?: {
      primaryDecisionMaker: string;
      decisionProcess: string;
      conflictResolutionHistory: string;
      vetoRights: string;
      riskIfDisagreement: string;
    };
  };

  // Reference check template (F35)
  referenceCheckTemplate?: {
    whoToCall: {
      name: string;
      relationship: string;
      contactMethod: string;
      priority: "CRITICAL" | "HIGH" | "MEDIUM";
    }[];
    scriptTemplate: {
      introduction: string;
      questions: {
        question: string;
        whatToLookFor: string;
        redFlagAnswer: string;
      }[];
      closingQuestion: string;
    };
    minimumReferencesNeeded: number;
    founderSpecificQuestions: {
      founderName: string;
      specificQuestions: string[];
    }[];
  };

  networkAnalysis: {
    overallNetworkStrength: "strong" | "moderate" | "weak";
    notableConnections: {
      name: string;
      relevance: string;
      type: "investor" | "advisor" | "industry_expert" | "potential_customer" | "other";
    }[];
    advisors: {
      name: string;
      role: string;
      relevance: string;
      credibilityScore: number;
    }[];
    investorRelationships: string[];
    industryConnections: string[];
  };

  benchmarkComparison: {
    vsSuccessfulFounders: string;
    percentileInSector: number;
    similarSuccessfulTeams: {
      company: string;
      similarity: string;
      outcome: string;
    }[];
  };
}

/** Team Investigator Data v2.0 - Structure standardisée */
export interface TeamInvestigatorData {
  // === META ===
  meta: AgentMeta;

  // === SCORE PRINCIPAL ===
  score: AgentScore;

  // === FINDINGS SPECIFIQUES ===
  findings: TeamInvestigatorFindings;

  // === DB CROSS-REFERENCE ===
  dbCrossReference: DbCrossReference;

  // === RED FLAGS ===
  redFlags: AgentRedFlag[];

  // === QUESTIONS POUR LE FONDATEUR ===
  questions: AgentQuestion[];

  // === SIGNAL D'ALERTE ===
  alertSignal: AgentAlertSignal;

  // === RESUME NARRATIF ===
  narrative: AgentNarrative;
}

export interface TeamInvestigatorResult extends AgentResult {
  agentName: "team-investigator";
  data: TeamInvestigatorData;
}

// ============================================================================
// TECHNICAL DD AGENT - REFONTE v2.0
// ============================================================================
// Mission: Due diligence technique EXHAUSTIVE standard CTO/VPE senior
// Standard: Big4 + Partner VC - Chaque affirmation sourcée, risques quantifiés
// Minimum: 5+ composants stack analysés, 3+ red flags si problèmes, 5+ questions

/** Analyse détaillée de la stack technique */
export interface TechStackAnalysis {
  frontend: {
    technologies: string[];
    assessment: string;
    modernityScore: number; // 0-100
  };
  backend: {
    technologies: string[];
    languages: string[];
    frameworks: string[];
    assessment: string;
    modernityScore: number;
  };
  infrastructure: {
    cloud: string; // AWS, GCP, Azure, On-prem, Hybrid
    containerization: boolean;
    orchestration?: string; // K8s, ECS, etc.
    cicd?: string;
    assessment: string;
  };
  databases: {
    primary: string;
    secondary?: string[];
    appropriateness: string;
  };
  thirdPartyDependencies: {
    critical: { name: string; risk: string; alternative?: string }[];
    vendorLockIn: "LOW" | "MEDIUM" | "HIGH";
    assessment: string;
  };
  overallAssessment: "MODERN" | "ADEQUATE" | "OUTDATED" | "CONCERNING";
  stackAppropriatenessForUseCase: string;
}

/** Analyse de la scalabilité */
export interface ScalabilityAnalysis {
  currentArchitecture: "monolith" | "modular_monolith" | "microservices" | "serverless" | "hybrid" | "unknown";
  currentCapacity: {
    estimatedUsers: string;
    estimatedRequests: string;
    dataVolume: string;
  };
  bottlenecks: {
    component: string;
    issue: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
    estimatedCostToFix: string;
  }[];
  scalingStrategy: {
    horizontal: boolean;
    vertical: boolean;
    autoScaling: boolean;
    assessment: string;
  };
  readinessForGrowth: {
    x10: { ready: boolean; blockers: string[] };
    x100: { ready: boolean; blockers: string[] };
  };
  scalabilityScore: number; // 0-100
}

/** Analyse de la dette technique */
export interface TechnicalDebtAnalysis {
  level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  indicators: {
    indicator: string;
    evidence: string;
    severity: "HIGH" | "MEDIUM" | "LOW";
  }[];
  estimatedCost: {
    toFix: string;
    ifIgnored: string;
    timeline: string;
  };
  codeQuality: {
    testCoverage: string; // "Unknown", "None", "Low (<30%)", "Medium (30-70%)", "High (>70%)"
    documentation: "NONE" | "POOR" | "ADEQUATE" | "GOOD";
    codeReview: boolean;
    assessment: string;
  };
  debtSources: {
    source: string;
    impact: string;
    recommendation: string;
  }[];
}

/** Analyse de la maturité produit */
export interface ProductMaturityAnalysis {
  stage: "concept" | "prototype" | "mvp" | "beta" | "production" | "scale";
  stageEvidence: string;
  stability: {
    score: number; // 0-100
    incidentFrequency: string;
    uptimeEstimate: string;
    assessment: string;
  };
  featureCompleteness: {
    score: number; // 0-100
    coreFeatures: { feature: string; status: "complete" | "partial" | "missing" }[];
    roadmapClarity: string;
  };
  releaseVelocity: {
    frequency: string;
    assessment: string;
    concern?: string;
  };
}

/** Analyse de la capacité technique de l'équipe */
export interface TechTeamCapability {
  teamSize: {
    current: number;
    breakdown: { role: string; count: number }[];
  };
  seniorityLevel: {
    assessment: "JUNIOR" | "MID" | "SENIOR" | "MIXED" | "UNKNOWN";
    evidence: string;
  };
  gaps: {
    gap: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
    impact: string;
    recommendation: string;
  }[];
  keyPersonRisk: {
    exists: boolean;
    persons: string[];
    mitigation: string;
  };
  hiringNeeds: {
    role: string;
    priority: "IMMEDIATE" | "NEXT_6M" | "NEXT_12M";
    rationale: string;
  }[];
  overallCapabilityScore: number; // 0-100
}

/** Analyse de la sécurité */
export interface SecurityAnalysis {
  posture: "POOR" | "BASIC" | "GOOD" | "EXCELLENT" | "UNKNOWN";
  compliance: {
    gdpr: "COMPLIANT" | "PARTIAL" | "NON_COMPLIANT" | "NOT_APPLICABLE" | "UNKNOWN";
    soc2: "CERTIFIED" | "IN_PROGRESS" | "NOT_STARTED" | "NOT_APPLICABLE" | "UNKNOWN";
    other: string[];
  };
  practices: {
    practice: string;
    status: "YES" | "NO" | "PARTIAL" | "UNKNOWN";
  }[];
  vulnerabilities: {
    area: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
    description: string;
  }[];
  assessment: string;
  securityScore: number; // 0-100
}

/** Analyse de la propriété intellectuelle technique */
export interface TechIPAnalysis {
  patents: {
    granted: number;
    pending: number;
    domains: string[];
    strategicValue: string;
  };
  tradeSecrets: {
    exists: boolean;
    protected: boolean;
    description: string;
  };
  openSourceRisk: {
    level: "NONE" | "LOW" | "MEDIUM" | "HIGH";
    licenses: string[];
    concerns: string[];
  };
  proprietaryTech: {
    exists: boolean;
    description: string;
    defensibility: string;
  };
  ipScore: number; // 0-100
}

/** Findings spécifiques Technical DD (Section 5.2 + extensions) */
export interface TechnicalDDFindings {
  techStack: TechStackAnalysis;
  scalability: ScalabilityAnalysis;
  technicalDebt: TechnicalDebtAnalysis;
  productMaturity: ProductMaturityAnalysis;
  teamCapability: TechTeamCapability;
  security: SecurityAnalysis;
  ipProtection: TechIPAnalysis;

  // Risques techniques majeurs consolidés
  technicalRisks: {
    id: string;
    risk: string;
    category: "architecture" | "scalability" | "security" | "team" | "dependency" | "debt" | "other";
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
    probability: "HIGH" | "MEDIUM" | "LOW";
    impact: string;
    mitigation: string;
    estimatedCostToMitigate: string;
    timelineToMitigate: string;
  }[];

  // Comparaison avec standards du secteur
  sectorBenchmark: {
    stackVsSector: string;
    maturityVsSector: string;
    teamSizeVsSector: string;
    overallPosition: "ABOVE_AVERAGE" | "AVERAGE" | "BELOW_AVERAGE";
  };
}

/** Technical DD Data v2.0 - Structure standardisée */
export interface TechnicalDDData {
  // === META ===
  meta: AgentMeta;

  // === SCORE PRINCIPAL ===
  score: AgentScore;

  // === FINDINGS SPECIFIQUES ===
  findings: TechnicalDDFindings;

  // === DB CROSS-REFERENCE ===
  dbCrossReference: DbCrossReference;

  // === RED FLAGS ===
  redFlags: AgentRedFlag[];

  // === QUESTIONS POUR LE FONDATEUR ===
  questions: AgentQuestion[];

  // === SIGNAL D'ALERTE ===
  alertSignal: AgentAlertSignal;

  // === RESUME NARRATIF ===
  narrative: AgentNarrative;
}

export interface TechnicalDDResult extends AgentResult {
  agentName: "technical-dd";
  data: TechnicalDDData;
}

// ============================================================================
// TECH-STACK-DD AGENT - Split from Technical DD v2.0
// ============================================================================
// Mission: Analyse Stack Technique + Scalabilité + Dette Technique (55% de l'ancien Technical DD)
// Standard: Big4 + Partner VC - Chaque affirmation sourcée, risques quantifiés
// Minimum: 5+ composants stack analysés, 3+ bottlenecks/dettes identifiés, 3+ questions

/** Findings spécifiques Tech-Stack-DD */
export interface TechStackDDFindings {
  techStack: TechStackAnalysis;
  scalability: ScalabilityAnalysis;
  technicalDebt: TechnicalDebtAnalysis;

  // Risques techniques (stack, scalabilité, dette uniquement)
  technicalRisks: {
    id: string;
    risk: string;
    category: "architecture" | "scalability" | "dependency" | "debt";
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
    probability: "HIGH" | "MEDIUM" | "LOW";
    impact: string;
    mitigation: string;
    estimatedCostToMitigate: string;
    timelineToMitigate: string;
  }[];

  // Comparaison avec standards du secteur
  sectorBenchmark: {
    stackVsSector: string;
    debtVsSector: string;
    scalabilityVsSector: string;
    overallPosition: "ABOVE_AVERAGE" | "AVERAGE" | "BELOW_AVERAGE";
  };
}

/** Tech-Stack-DD Data - Structure standardisée */
export interface TechStackDDData {
  meta: AgentMeta;
  score: AgentScore;
  findings: TechStackDDFindings;
  dbCrossReference: DbCrossReference;
  redFlags: AgentRedFlag[];
  questions: AgentQuestion[];
  alertSignal: AgentAlertSignal;
  narrative: AgentNarrative;
}

export interface TechStackDDResult extends AgentResult {
  agentName: "tech-stack-dd";
  data: TechStackDDData;
}

// ============================================================================
// TECH-OPS-DD AGENT - Split from Technical DD v2.0
// ============================================================================
// Mission: Analyse Maturité Produit + Équipe Tech + Sécurité + IP (45% de l'ancien Technical DD)
// Standard: Big4 + Partner VC - Chaque affirmation sourcée, risques quantifiés
// Minimum: 3+ gaps équipe, posture sécu évaluée, IP analysée, 3+ questions

/** Findings spécifiques Tech-Ops-DD */
export interface TechOpsDDFindings {
  productMaturity: ProductMaturityAnalysis;
  teamCapability: TechTeamCapability;
  security: SecurityAnalysis;
  ipProtection: TechIPAnalysis;

  // Risques techniques (ops, équipe, sécu, IP uniquement)
  technicalRisks: {
    id: string;
    risk: string;
    category: "team" | "security" | "ip" | "operations";
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
    probability: "HIGH" | "MEDIUM" | "LOW";
    impact: string;
    mitigation: string;
    estimatedCostToMitigate: string;
    timelineToMitigate: string;
  }[];

  // Comparaison avec standards du secteur (enrichi avec P25/median/P75)
  sectorBenchmark: {
    // Benchmark taille équipe avec percentiles
    teamSize: {
      thisCompany: number;
      sectorP25: number;
      sectorMedian: number;
      sectorP75: number;
      percentile: string; // "P25", "P50", "P75", etc.
      source: string;
    };
    // Benchmark maturité produit
    maturity: {
      thisCompany: string;
      sectorTypical: string;
      assessment: string;
    };
    // Benchmark sécurité
    security: {
      thisCompany: string;
      sectorExpected: string;
      assessment: string;
    };
    // Résumés textuels (rétrocompatibilité)
    maturityVsSector: string;
    teamSizeVsSector: string;
    securityVsSector: string;
    overallPosition: "ABOVE_AVERAGE" | "AVERAGE" | "BELOW_AVERAGE";
  };
}

/** Tech-Ops-DD Data - Structure standardisée */
export interface TechOpsDDData {
  meta: AgentMeta;
  score: AgentScore;
  findings: TechOpsDDFindings;
  dbCrossReference: DbCrossReference;
  redFlags: AgentRedFlag[];
  questions: AgentQuestion[];
  alertSignal: AgentAlertSignal;
  narrative: AgentNarrative;
}

export interface TechOpsDDResult extends AgentResult {
  agentName: "tech-ops-dd";
  data: TechOpsDDData;
}

// ============================================================================
// LEGAL & REGULATORY AGENT - REFONTE v2.0
// ============================================================================
// Mission: Analyse juridique et réglementaire EXHAUSTIVE standard avocat M&A + Partner VC
// Standard: Big4 + Partner VC - Chaque risque sourcé, chaque gap identifié
// Minimum: 3+ zones compliance, IP status complet, 3+ risques réglementaires, 5+ questions

/** Analyse de conformité par domaine */
export interface ComplianceArea {
  area: string; // Ex: "RGPD", "DSP2", "AI Act"
  status: "COMPLIANT" | "PARTIAL" | "NON_COMPLIANT" | "UNKNOWN";
  requirements: string[]; // Exigences applicables
  gaps: string[]; // Manquements identifiés
  risk: "HIGH" | "MEDIUM" | "LOW";
  evidence: string; // Ce qui permet d'affirmer ce status
  remediation?: {
    action: string;
    estimatedCost: string;
    timeline: string;
  };
}

/** Analyse du statut IP */
export interface IPStatusAnalysis {
  patents: {
    count: number;
    status: "granted" | "pending" | "none" | "unknown";
    value: string; // Évaluation qualitative
    domains: string[]; // Domaines couverts
    risks: string[]; // Risques identifiés (FTO, etc.)
  };
  trademarks: {
    count: number;
    status: "registered" | "pending" | "none" | "unknown";
    territories: string[];
    conflicts: string[];
  };
  tradeSecrets: {
    protected: boolean;
    measures: string[]; // Mesures de protection
    risks: string[];
  };
  copyrights: {
    openSourceRisk: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
    licenses: string[]; // Licences utilisées
    concerns: string[];
  };
  overallIPStrength: number; // 0-100
  ipVerdict: string;
}

/** Risque réglementaire identifié */
export interface RegulatoryRisk {
  id: string;
  risk: string;
  regulation: string; // Ex: "AI Act Article 5"
  probability: "HIGH" | "MEDIUM" | "LOW";
  impact: string;
  timeline: string; // Quand le risque se matérialise
  mitigation: string;
  estimatedCost: string;
  precedent?: string; // Cas similaire connu
}

/** Structure juridique */
export interface LegalStructureAnalysis {
  entityType: string;
  jurisdiction: string;
  appropriateness: "APPROPRIATE" | "SUBOPTIMAL" | "CONCERNING" | "UNKNOWN";
  concerns: string[];
  recommendations: string[];
  vestingInPlace: boolean;
  vestingDetails?: string;
  shareholderAgreement: "YES" | "NO" | "UNKNOWN";
  shareholderConcerns: string[];
}

/** Risques contractuels */
export interface ContractualRisksAnalysis {
  keyContracts: {
    type: string;
    parties: string;
    concerns: string[];
    risk: "HIGH" | "MEDIUM" | "LOW";
  }[];
  customerConcentration: {
    exists: boolean;
    topCustomerPercent?: number;
    risk: string;
  };
  vendorDependencies: {
    vendor: string;
    criticality: "HIGH" | "MEDIUM" | "LOW";
    alternatives: string;
  }[];
  concerningClauses: string[];
}

/** Risques litige */
export interface LitigationRiskAnalysis {
  currentLitigation: boolean;
  currentLitigationDetails?: string[];
  potentialClaims: {
    area: string;
    probability: "HIGH" | "MEDIUM" | "LOW";
    potentialExposure: string;
  }[];
  founderDisputes: {
    exists: boolean;
    details?: string;
    severity?: "CRITICAL" | "HIGH" | "MEDIUM";
  };
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

/** Précédents sectoriels (DB cross-reference) */
export interface SectorRegulatoryPrecedent {
  company: string;
  issue: string;
  outcome: string;
  relevance: string;
  source: string;
}

/** Findings spécifiques Legal Regulatory */
export interface LegalRegulatoryFindings {
  structureAnalysis: LegalStructureAnalysis;
  compliance: ComplianceArea[];
  ipStatus: IPStatusAnalysis;
  regulatoryRisks: RegulatoryRisk[];
  contractualRisks: ContractualRisksAnalysis;
  litigationRisk: LitigationRiskAnalysis;

  // Cross-reference DB (LOW priority mais obligatoire)
  sectorPrecedents: {
    issues: SectorRegulatoryPrecedent[];
    structureNorms: {
      typicalStructure: string;
      comparisonVerdict: string;
    };
  };

  // Réglementations à venir
  upcomingRegulations: {
    regulation: string;
    effectiveDate: string;
    impact: "HIGH" | "MEDIUM" | "LOW";
    preparedness: "READY" | "IN_PROGRESS" | "NOT_STARTED" | "UNKNOWN";
    action: string;
  }[];
}

/** Legal Regulatory Data v2.0 - Structure standardisée */
export interface LegalRegulatoryData {
  // === META ===
  meta: AgentMeta;

  // === SCORE PRINCIPAL ===
  score: AgentScore;

  // === FINDINGS SPECIFIQUES ===
  findings: LegalRegulatoryFindings;

  // === DB CROSS-REFERENCE ===
  dbCrossReference: DbCrossReference;

  // === RED FLAGS ===
  redFlags: AgentRedFlag[];

  // === QUESTIONS POUR LE FONDATEUR ===
  questions: AgentQuestion[];

  // === SIGNAL D'ALERTE ===
  alertSignal: AgentAlertSignal;

  // === RESUME NARRATIF ===
  narrative: AgentNarrative;
}

export interface LegalRegulatoryResult extends AgentResult {
  agentName: "legal-regulatory";
  data: LegalRegulatoryData;
}

// Cap Table Auditor Agent
export interface CapTableAuditData {
  ownershipBreakdown: {
    founders: number;
    employees: number;
    investors: number;
    optionPool: number;
    other: number;
  };
  founderDilution: {
    currentFounderOwnership: number;
    projectedPostRound: number;
    atSeriesA?: number;
    atSeriesB?: number;
    concern: "none" | "moderate" | "significant";
  };
  investorAnalysis: {
    existingInvestors: {
      name: string;
      ownership: number;
      reputation: "unknown" | "low" | "medium" | "high" | "top_tier";
      signalValue: string;
    }[];
    leadInvestorPresent: boolean;
    followOnCapacity: string;
  };
  roundTerms: {
    preMoneyValuation?: number;
    roundSize?: number;
    dilution: number;
    proRataRights: boolean;
    liquidationPreference: string;
    antiDilution: string;
    participatingPreferred: boolean;
    concerns: string[];
  };
  optionPoolAnalysis: {
    currentSize: number;
    adequacy: "insufficient" | "adequate" | "generous";
    refreshNeeded: boolean;
  };
  structuralRedFlags: string[];
  capTableScore: number; // 0-100
}

export interface CapTableAuditResult extends AgentResult {
  agentName: "cap-table-auditor";
  data: CapTableAuditData;
}

// ============================================================================
// GTM ANALYST AGENT - REFONTE v2.0
// ============================================================================
// Mission: Analyser la stratégie Go-to-Market et l'efficacité commerciale
// Standard: Big4 + Partner VC - Chaque claim sourcé, benchmarks DB obligatoires
// Minimum: 3+ canaux analysés, 3+ red flags si problèmes, 5+ questions, cross-ref DB

/** Analyse détaillée d'un canal d'acquisition */
export interface GTMChannelAnalysis {
  id: string;
  channel: string; // Ex: "SEO", "Paid Ads", "Outbound Sales", "Partnerships"
  type: "organic" | "paid" | "sales" | "partnership" | "referral" | "viral";

  // Contribution et performance
  contribution: {
    revenuePercent?: number; // % du CA
    customerPercent?: number; // % des clients
    source: string; // "Deck Slide 12", "Extrait", "Estimé"
  };

  // Coûts d'acquisition
  economics: {
    cac?: number;
    cacCalculation?: string; // Calcul montré
    cacPaybackMonths?: number;
    ltv?: number;
    ltvCacRatio?: number;
    benchmarkCac?: {
      sectorMedian: number;
      percentile: number;
      source: string;
    };
  };

  // Efficacité et scalabilité
  efficiency: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  efficiencyRationale: string;
  scalability: {
    level: "HIGH" | "MEDIUM" | "LOW";
    constraints: string[];
    investmentRequired: string;
  };

  // Risques spécifiques au canal
  risks: string[];

  // Verdict
  verdict: string;
}

/** Analyse de la motion de vente */
export interface GTMSalesMotionAnalysis {
  type: "PLG" | "SALES_LED" | "HYBRID" | "COMMUNITY_LED" | "UNCLEAR";
  typeEvidence: string; // Ce qui justifie cette classification
  appropriateness: {
    verdict: "APPROPRIATE" | "QUESTIONABLE" | "INAPPROPRIATE";
    rationale: string; // Pourquoi ce type est adapté ou pas
    benchmark: string; // Comparaison avec succès du secteur
  };

  // Métriques du cycle de vente
  salesCycle: {
    length?: number; // jours
    benchmark?: number; // benchmark secteur
    assessment: string;
  };
  acv: {
    value?: number;
    benchmark?: number;
    assessment: string;
  };
  winRate?: {
    value: number;
    benchmark?: number;
    assessment: string;
  };
  pipelineCoverage?: {
    value: number;
    target: number; // 3-4x généralement
    assessment: string;
  };

  // Bottlenecks identifiés
  bottlenecks: {
    bottleneck: string;
    impact: "CRITICAL" | "HIGH" | "MEDIUM";
    recommendation: string;
  }[];

  // Magic Number (pour SaaS)
  magicNumber?: {
    value: number;
    interpretation: string; // > 0.75 = efficient
  };
}

/** Analyse de l'expansion et croissance */
export interface GTMExpansionAnalysis {
  currentGrowthRate: {
    value?: number;
    period: string;
    source: string;
    sustainability: "SUSTAINABLE" | "QUESTIONABLE" | "UNSUSTAINABLE";
    sustainabilityRationale: string;
  };

  // Stratégie d'expansion
  expansion: {
    strategy: string; // Description de la stratégie
    markets: {
      market: string;
      status: "current" | "planned" | "potential";
      timeline?: string;
      rationale: string;
    }[];
    risks: string[];
    feasibilityAssessment: string;
  };

  // Leviers de croissance
  growthLevers: {
    lever: string;
    potential: "HIGH" | "MEDIUM" | "LOW";
    prerequisite: string;
    timeline: string;
  }[];

  // Contraintes de scaling
  scalingConstraints: {
    constraint: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
    mitigation: string;
  }[];
}

/** Patterns GTM des concurrents (cross-ref DB) */
export interface GTMCompetitorPattern {
  company: string;
  channel: string;
  success: "HIGH" | "MEDIUM" | "LOW";
  insight: string;
  source: string; // "Funding DB", "Context Engine"
}

/** Benchmark CAC sectoriel (cross-ref DB) */
export interface GTMCacBenchmark {
  sector: string;
  stage: string;
  p25: number;
  median: number;
  p75: number;
  source: string;
  thisDeal?: {
    cac: number;
    percentile: number;
  };
}

/** Findings spécifiques GTM Analyst */
export interface GTMAnalystFindings {
  // Analyse des canaux (minimum 3)
  channels: GTMChannelAnalysis[];

  // Synthèse canaux
  channelSummary: {
    primaryChannel: string;
    channelDiversification: "GOOD" | "MODERATE" | "POOR";
    diversificationRationale: string;
    overallChannelHealth: number; // 0-100
  };

  // Motion de vente
  salesMotion: GTMSalesMotionAnalysis;

  // Expansion et croissance
  expansion: GTMExpansionAnalysis;

  // Cross-ref DB: Patterns concurrents
  competitorPatterns: {
    patterns: GTMCompetitorPattern[];
    insight: string; // Ce que ça nous apprend
    gapsVsCompetitors: string[]; // Où notre deal est en retard
    advantagesVsCompetitors: string[]; // Où notre deal excelle
  };

  // Cross-ref DB: Benchmark CAC
  cacBenchmark: GTMCacBenchmark;

  // Unit economics global
  unitEconomics: {
    overall: "HEALTHY" | "ACCEPTABLE" | "CONCERNING" | "UNKNOWN";
    rationale: string;
    keyMetrics: {
      metric: string;
      value?: number;
      benchmark?: number;
      assessment: string;
    }[];
  };

  // Analyse claims GTM du deck
  deckClaimsAnalysis: {
    claim: string;
    location: string;
    status: "VERIFIED" | "CONTRADICTED" | "EXAGGERATED" | "NOT_VERIFIABLE";
    evidence: string;
    investorImplication: string;
  }[];
}

/** GTM Analyst Data v2.0 - Structure standardisée */
export interface GTMAnalystData {
  // === META ===
  meta: AgentMeta;

  // === SCORE PRINCIPAL ===
  score: AgentScore;

  // === FINDINGS SPECIFIQUES ===
  findings: GTMAnalystFindings;

  // === DB CROSS-REFERENCE ===
  dbCrossReference: DbCrossReference;

  // === RED FLAGS ===
  redFlags: AgentRedFlag[];

  // === QUESTIONS POUR LE FONDATEUR ===
  questions: AgentQuestion[];

  // === SIGNAL D'ALERTE ===
  alertSignal: AgentAlertSignal;

  // === RESUME NARRATIF ===
  narrative: AgentNarrative;
}

export interface GTMAnalystResult extends AgentResult {
  agentName: "gtm-analyst";
  data: GTMAnalystData;
}

// ============================================================================
// CUSTOMER INTEL AGENT - REFONTE v2.0
// ============================================================================
// Mission: Analyse APPROFONDIE de la base clients et signaux PMF
// Standard: Big4 + Partner VC - Chaque affirmation sourcée, métriques benchmarkées
// Minimum: 5+ clients analysés, 3+ red flags si problèmes, 5+ questions

/** Analyse d'un client notable */
export interface CustomerAnalysis {
  id: string;
  name: string;
  type: "enterprise" | "mid_market" | "smb" | "startup" | "unknown";
  verified: boolean;
  verificationSource?: string; // "Website", "LinkedIn", "News", "Deck claim only"

  // Relation commerciale
  relationship: {
    status: "active" | "pilot" | "churned" | "prospect" | "unknown";
    since?: string;
    contractType?: "subscription" | "one_time" | "usage_based" | "unknown";
    dealSize?: "enterprise" | "mid" | "small" | "unknown";
    revenueContribution?: number; // % of total revenue
  };

  // Signaux de satisfaction
  satisfaction: {
    isReference: boolean;
    hasTestimonial: boolean;
    hasExpanded: boolean;
    hasReferred: boolean;
    publicEndorsement?: string;
  };

  // Risques spécifiques
  risks: string[];
}

/** Analyse d'un claim client du deck */
export interface CustomerClaimValidation {
  id: string;
  claim: string; // Citation exacte
  location: string; // "Slide X"
  claimType: "customer_count" | "logo" | "testimonial" | "metric" | "pmf_signal";
  status: "VERIFIED" | "UNVERIFIED" | "EXAGGERATED" | "MISLEADING";
  evidence: string;
  investorImplication: string;
}

/** Analyse des métriques de rétention */
export interface RetentionAnalysis {
  // Net Revenue Retention
  nrr: {
    reported?: number;
    source: string;
    benchmarkP25: number;
    benchmarkMedian: number;
    benchmarkP75: number;
    percentile?: number;
    verdict: "EXCELLENT" | "GOOD" | "CONCERNING" | "CRITICAL" | "UNKNOWN";
    calculation?: string;
  };

  // Gross Retention / Churn
  grossRetention: {
    reported?: number;
    churnRate?: number;
    source: string;
    benchmarkMedian: number;
    verdict: "EXCELLENT" | "GOOD" | "CONCERNING" | "CRITICAL" | "UNKNOWN";
  };

  // Cohort analysis
  cohortTrends: {
    trend: "IMPROVING" | "STABLE" | "DECLINING" | "UNKNOWN";
    evidence: string;
    concern?: string;
  };

  // Data quality
  dataQuality: {
    timespan: string; // "6 months", "12 months", etc.
    cohortCount: string;
    reliability: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
    limitations: string[];
  };
}

/** Analyse Product-Market Fit */
export interface PMFAnalysis {
  // Score PMF
  pmfScore: number; // 0-100
  pmfVerdict: "STRONG" | "EMERGING" | "WEAK" | "NOT_DEMONSTRATED";
  pmfJustification: string;

  // Signaux positifs (sourcés)
  positiveSignals: {
    signal: string;
    evidence: string;
    source: string; // "Deck Slide X", "Calculated", "Context Engine"
    strength: "STRONG" | "MODERATE" | "WEAK";
  }[];

  // Signaux négatifs (red flags)
  negativeSignals: {
    signal: string;
    evidence: string;
    source: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
  }[];

  // Tests PMF classiques
  pmfTests: {
    test: string; // "Sean Ellis Test", "NRR > 120%", "Organic Growth"
    result: "PASS" | "FAIL" | "PARTIAL" | "NOT_TESTABLE";
    evidence: string;
    // F36: Data collection protocol for NOT_TESTABLE tests
    dataCollectionProtocol?: {
      dataNeeded: string;
      howToRequest: string;
      questionForFounder: string;
      acceptableFormats: string[];
      redFlagIfRefused: string;
      estimatedTimeToCollect: string;
      alternativeProxy?: string;
    };
  }[];
}

/** Analyse de la concentration client */
export interface ConcentrationAnalysis {
  // Top customers
  topCustomerRevenue: number; // % from #1 customer
  top3CustomersRevenue: number; // % from top 3
  top10CustomersRevenue: number; // % from top 10

  // Verdict
  concentrationLevel: "CRITICAL" | "HIGH" | "MODERATE" | "HEALTHY";
  concentrationRationale: string;

  // Risques spécifiques
  atRiskRevenue: {
    customerId: string;
    customerName: string;
    revenueAtRisk: number;
    riskReason: string;
    probability: "HIGH" | "MEDIUM" | "LOW";
  }[];

  // Tendance
  diversificationTrend: "IMPROVING" | "STABLE" | "WORSENING" | "UNKNOWN";
  trendEvidence: string;
}

/** Analyse du potentiel d'expansion */
export interface ExpansionAnalysis {
  // Upsell
  upsell: {
    potential: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
    mechanisms: string[];
    evidence: string;
    blockers: string[];
  };

  // Cross-sell
  crossSell: {
    potential: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
    opportunities: string[];
    evidence: string;
  };

  // Virality / Referral
  virality: {
    coefficient?: number;
    mechanism: string;
    evidence: string;
    verdict: "STRONG" | "MODERATE" | "WEAK" | "NONE";
  };

  // Land & Expand
  landAndExpand: {
    strategy: string;
    successRate?: number;
    averageExpansion?: number;
    evidence: string;
  };
}

/** Findings spécifiques Customer Intel */
export interface CustomerIntelFindings {
  // Profil client idéal (ICP)
  icp: {
    description: string;
    segments: string[];
    verticals: string[];
    companySize: string;
    buyerPersona: string;
    icpClarity: "CLEAR" | "PARTIAL" | "UNCLEAR";
  };

  // Base clients analysée
  customerBase: {
    totalCustomers?: number;
    payingCustomers?: number;
    activeUsers?: number;
    customerQuality: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
    qualityJustification: string;
    notableCustomers: CustomerAnalysis[];
    customersMissedInDeck: string[]; // Clients qu'on aurait aimé voir
  };

  // Claims du deck vérifiés
  claimsValidation: CustomerClaimValidation[];

  // Métriques de rétention
  retention: RetentionAnalysis;

  // Product-Market Fit
  pmf: PMFAnalysis;

  // Concentration
  concentration: ConcentrationAnalysis;

  // Expansion
  expansion: ExpansionAnalysis;

  // Benchmark vs deals similaires (si Context Engine disponible)
  benchmark?: {
    vsMedianNRR: string;
    vsMedianChurn: string;
    vsMedianPMFScore: string;
    percentileOverall: number;
    comparableDeals: {
      name: string;
      nrr?: number;
      churn?: number;
      pmfStrength: string;
      outcome: string;
    }[];
  };
}

/** Customer Intel Data v2.0 - Structure standardisée */
export interface CustomerIntelData {
  // === META ===
  meta: AgentMeta;

  // === SCORE PRINCIPAL ===
  score: AgentScore;

  // === FINDINGS SPECIFIQUES ===
  findings: CustomerIntelFindings;

  // === DB CROSS-REFERENCE ===
  dbCrossReference: DbCrossReference;

  // === RED FLAGS ===
  redFlags: AgentRedFlag[];

  // === QUESTIONS POUR LE FONDATEUR ===
  questions: AgentQuestion[];

  // === SIGNAL D'ALERTE ===
  alertSignal: AgentAlertSignal;

  // === RESUME NARRATIF ===
  narrative: AgentNarrative;
}

export interface CustomerIntelResult extends AgentResult {
  agentName: "customer-intel";
  data: CustomerIntelData;
}

// ============================================================================
// EXIT STRATEGIST AGENT - REFONTE v2.0
// ============================================================================
// Mission: Modéliser les scénarios de sortie et calculer les retours potentiels
// Standard: Big4 + Partner VC - Chaque projection sourcée, calculs montrés
// Minimum: 4+ scénarios, 3+ comparables réels, 3+ red flags, 5+ questions

/** Scénario d'exit détaillé avec calculs montrés */
export interface ExitScenario {
  id: string;
  type: "acquisition_strategic" | "acquisition_pe" | "ipo" | "secondary" | "acquihire" | "failure";
  name: string;
  description: string;

  // Probabilité avec justification
  probability: {
    level: "HIGH" | "MEDIUM" | "LOW" | "VERY_LOW";
    percentage: number; // 0-100
    rationale: string; // POURQUOI cette probabilité
    basedOn: string; // Source: "DB comparables", "Sector avg", etc.
  };

  // Timeline avec jalons
  timeline: {
    estimatedYears: number;
    range: string; // "4-6 ans"
    milestones: string[]; // Ce qui doit se passer avant
    assumptions: string[];
  };

  // Valorisation à l'exit
  exitValuation: {
    estimated: number;
    range: { min: number; max: number };
    methodology: string; // "Multiple ARR", "Multiple EBITDA", etc.
    multipleUsed: number;
    multipleSource: string; // "DB median SaaS exits 2024"
    calculation: string; // Calcul montré
  };

  // Acheteurs potentiels (si applicable)
  potentialBuyers?: {
    name: string;
    type: "strategic" | "pe" | "corporate_vc";
    rationale: string; // Pourquoi ils achèteraient
    recentAcquisitions?: string[];
    likelihoodToBuy: "HIGH" | "MEDIUM" | "LOW";
  }[];

  // Retour pour le BA
  investorReturn: {
    initialInvestment: number;
    ownershipAtEntry: number;
    dilutionToExit: number;
    dilutionCalculation: string; // Calcul montré
    ownershipAtExit: number;
    grossProceeds: number;
    proceedsCalculation: string; // Calcul montré
    multiple: number;
    irr: number;
    irrCalculation: string; // Calcul montré
  };
}

/** Acquisition comparable réelle (sourcée) */
export interface ComparableExit {
  id: string;
  target: string;
  acquirer: string;
  year: number;
  sector: string;
  stage: string;

  // Métriques
  exitValue: number;
  revenueAtExit?: number;
  arrAtExit?: number;
  multipleRevenue?: number;
  multipleArr?: number;
  multipleEbitda?: number;

  // Source obligatoire
  source: string; // "Funding DB", "Crunchbase", "TechCrunch", etc.
  sourceUrl?: string;

  // Pertinence pour notre deal
  relevance: {
    score: number; // 0-100
    similarities: string[];
    differences: string[];
  };
}

/** Analyse du marché M&A du secteur */
export interface MnAMarketAnalysis {
  sectorName: string;
  period: string; // "2023-2025"

  // Volume d'activité
  activity: {
    totalDeals: number;
    totalValue: number;
    trend: "HEATING" | "STABLE" | "COOLING";
    trendRationale: string;
  };

  // Multiples observés
  multiples: {
    revenueMultiple: { p25: number; median: number; p75: number };
    arrMultiple?: { p25: number; median: number; p75: number };
    ebitdaMultiple?: { p25: number; median: number; p75: number };
    source: string;
  };

  // Acheteurs actifs
  activeBuyers: {
    name: string;
    type: string;
    recentDeals: number;
    focusAreas: string[];
  }[];

  // Fenêtre de sortie
  exitWindow: {
    assessment: "EXCELLENT" | "GOOD" | "NEUTRAL" | "POOR" | "CLOSED";
    rationale: string;
    timeRemaining: string;
  };
}

/** Risques de liquidité détaillés */
export interface LiquidityRisk {
  id: string;
  risk: string;
  category: "market" | "company" | "structural" | "timing" | "dilution";
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  probability: "HIGH" | "MEDIUM" | "LOW";
  impact: string;
  mitigation?: string;
  questionToAsk: string;
}

/** Findings spécifiques Exit Strategist */
export interface ExitStrategistFindings {
  // Scénarios d'exit (minimum 4: base, optimiste, pessimiste, failure)
  scenarios: ExitScenario[];

  // Comparables réels sourcés
  comparableExits: ComparableExit[];

  // Analyse du marché M&A
  mnaMarket: MnAMarketAnalysis;

  // Analyse de la liquidité
  liquidityAnalysis: {
    overallLiquidity: "HIGH" | "MEDIUM" | "LOW" | "VERY_LOW";
    rationale: string;
    risks: LiquidityRisk[];
    timeToLiquidity: {
      bestCase: string;
      baseCase: string;
      worstCase: string;
    };
  };

  // Analyse des claims d'exit du deck
  deckClaimsAnalysis: {
    claimsFound: {
      claim: string;
      location: string;
      status: "VERIFIED" | "EXAGGERATED" | "UNREALISTIC" | "NOT_VERIFIABLE";
      evidence: string;
    }[];
    deckRealism: "REALISTIC" | "OPTIMISTIC" | "VERY_OPTIMISTIC" | "UNREALISTIC";
    deckRealismRationale: string;
  };

  // Synthèse retour investisseur
  returnSummary: {
    expectedCase: {
      scenario: string;
      probability: number;
      multiple: number;
      irr: number;
    };
    upside: {
      scenario: string;
      probability: number;
      multiple: number;
      irr: number;
    };
    downside: {
      scenario: string;
      probability: number;
      multiple: number;
      irr: number;
    };
    probabilityWeightedReturn: {
      expectedMultiple: number;
      calculation: string;
    };
  };
}

/** Exit Strategist Data v2.0 - Structure standardisée */
export interface ExitStrategistData {
  // === META ===
  meta: AgentMeta;

  // === SCORE PRINCIPAL ===
  score: AgentScore;

  // === FINDINGS SPECIFIQUES ===
  findings: ExitStrategistFindings;

  // === DB CROSS-REFERENCE ===
  dbCrossReference: DbCrossReference;

  // === RED FLAGS ===
  redFlags: AgentRedFlag[];

  // === QUESTIONS POUR LE FONDATEUR ===
  questions: AgentQuestion[];

  // === SIGNAL D'ALERTE ===
  alertSignal: AgentAlertSignal;

  // === RESUME NARRATIF ===
  narrative: AgentNarrative;
}

export interface ExitStrategistResult extends AgentResult {
  agentName: "exit-strategist";
  data: ExitStrategistData;
}

// ============================================================================
// QUESTION MASTER AGENT - REFONTE v2.0
// ============================================================================
// Mission: Synthetiser TOUS les findings Tier 1 en questions actionnables
// Standard: Big4 + Partner VC - Questions qui debloquent des deals ou revelent des dealbreakers
// Minimum: 15+ questions fondateur, 5+ reference checks, checklist complete, 5+ points negociation
// Dependances: TOUS les agents Tier 1

/** Question fondateur enrichie avec contexte complet */
export interface FounderQuestion {
  id: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  category: "vision" | "execution" | "team" | "market" | "financials" | "tech" | "legal" | "risk" | "exit";

  // La question elle-meme
  question: string;

  // Contexte pour le BA (pourquoi cette question)
  context: {
    sourceAgent: string; // Quel agent a genere cette question
    redFlagId?: string; // Si lie a un red flag
    triggerData: string; // Donnee qui a declenche cette question
    whyItMatters: string; // Pourquoi c'est important pour le BA
  };

  // Comment interpreter la reponse
  evaluation: {
    goodAnswer: string; // Ce qui rassure
    badAnswer: string; // Ce qui inquiete
    redFlagIfBadAnswer: string; // Implication si mauvaise reponse
    followUpIfBad: string; // Question de suivi si reponse insuffisante
  };

  // Timing
  timing: "first_meeting" | "second_meeting" | "dd_phase" | "pre_term_sheet";
}

/** Reference check structure */
export interface ReferenceCheck {
  id: string;
  targetType: "customer" | "former_employee" | "co_investor" | "industry_expert" | "former_board_member" | "former_cofounder";
  priority: "CRITICAL" | "HIGH" | "MEDIUM";

  // Profil cible
  targetProfile: {
    description: string; // Ex: "Client enterprise utilisant le produit depuis >6 mois"
    idealPerson?: string; // Si identifie: nom ou poste precis
    howToFind: string; // Comment trouver ce contact
  };

  // Questions a poser
  questions: {
    question: string;
    whatToLookFor: string;
    redFlagAnswer: string;
  }[];

  // Pourquoi ce reference check
  rationale: string;
  linkedToRedFlag?: string; // Si lie a un red flag specifique
}

/** Item de checklist DD avec tracking */
export interface DiligenceChecklistItem {
  id: string;
  category: "documents" | "financials" | "legal" | "tech" | "team" | "market" | "customers" | "competitors";
  item: string;
  description: string;

  // Status et criticite
  status: "NOT_DONE" | "PARTIAL" | "DONE" | "BLOCKED" | "NOT_APPLICABLE";
  criticalPath: boolean;
  blockingForDecision: boolean;

  // Details
  responsibleParty: "founder" | "ba" | "third_party";
  estimatedEffort: "quick" | "moderate" | "significant";
  documentsNeeded: string[];
  deadline?: string;

  // Si bloque
  blockerDetails?: string;
}

/** Point de negociation avec leverage calcule */
export interface NegotiationPoint {
  id: string;
  priority: "HIGH_LEVERAGE" | "MEDIUM_LEVERAGE" | "NICE_TO_HAVE";
  category: "valuation" | "terms" | "governance" | "information_rights" | "pro_rata" | "vesting" | "other";

  // Le point
  point: string;

  // Pourquoi on peut negocier
  leverage: {
    argument: string; // L'argument de negociation
    evidence: string; // Preuve a l'appui (benchmark, red flag, etc.)
    sourceAgent: string; // Quel agent a fourni le leverage
  };

  // Strategie
  suggestedApproach: string;
  fallbackPosition: string;
  walkAwayPoint: string;

  // Impact financier estime
  estimatedImpact?: {
    description: string;
    valueRange: string;
  };
}

/** Dealbreaker identifie */
export interface Dealbreaker {
  id: string;
  severity: "ABSOLUTE" | "CONDITIONAL";
  condition: string;

  // Details
  description: string;
  sourceAgent: string;
  linkedRedFlags: string[];

  // Resolution possible
  resolvable: boolean;
  resolutionPath?: string;
  timeToResolve?: string;

  // Impact si on ignore
  riskIfIgnored: string;
}

/** Synthese des findings par agent */
export interface AgentFindingsSummary {
  agentName: string;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  criticalRedFlagsCount: number;
  highRedFlagsCount: number;
  topConcerns: string[];
  topStrengths: string[];
  questionsGenerated: number;
}

/** Findings specifiques Question Master */
export interface QuestionMasterFindings {
  // Questions fondateur (minimum 15, dont 3+ CRITICAL et 5+ HIGH)
  founderQuestions: FounderQuestion[];

  // Reference checks (minimum 5)
  referenceChecks: ReferenceCheck[];

  // Checklist DD complete
  diligenceChecklist: {
    totalItems: number;
    doneItems: number;
    blockedItems: number;
    criticalPathItems: number;
    items: DiligenceChecklistItem[];
  };

  // Points de negociation (minimum 5)
  negotiationPoints: NegotiationPoint[];

  // Dealbreakers identifies
  dealbreakers: Dealbreaker[];

  // Synthese des findings Tier 1
  tier1Summary: {
    agentsAnalyzed: AgentFindingsSummary[];
    totalCriticalRedFlags: number;
    totalHighRedFlags: number;
    overallReadiness: "READY_TO_INVEST" | "NEEDS_MORE_DD" | "SIGNIFICANT_CONCERNS" | "DO_NOT_PROCEED";
    readinessRationale: string;
  };

  // Top priorities pour le BA (3-5 actions)
  topPriorities: {
    priority: number;
    action: string;
    rationale: string;
    deadline: string;
  }[];

  // Timeline suggeree
  suggestedTimeline: {
    phase: string;
    duration: string;
    activities: string[];
    deliverables: string[];
  }[];
}

/** Question Master Data v2.0 - Structure standardisee */
export interface QuestionMasterData {
  // === META ===
  meta: AgentMeta;

  // === SCORE PRINCIPAL ===
  score: AgentScore;

  // === FINDINGS SPECIFIQUES ===
  findings: QuestionMasterFindings;

  // === DB CROSS-REFERENCE ===
  dbCrossReference: DbCrossReference;

  // === RED FLAGS (synthese de tous les agents) ===
  redFlags: AgentRedFlag[];

  // === QUESTIONS (resume des plus critiques) ===
  questions: AgentQuestion[];

  // === SIGNAL D'ALERTE ===
  alertSignal: AgentAlertSignal;

  // === RESUME NARRATIF ===
  narrative: AgentNarrative;
}

export interface QuestionMasterResult extends AgentResult {
  agentName: "question-master";
  data: QuestionMasterData;
}

// ============================================================================
// TIER 2 AGENT RESULT TYPES - Synthesis Agents
// ============================================================================

// ============================================================================
// CONTRADICTION DETECTOR AGENT - REFONTE v2.0 (TIER 3)
// ============================================================================
// Mission: Detecter TOUTES les contradictions entre deck, DB, et outputs agents
// Standard: Big4 + Partner VC - Chaque contradiction sourcee, impact quantifie
// Minimum: 5+ contradictions analysees, cross-ref DB obligatoire, 5+ questions
// Dependances: TOUS les agents Tier 1 et Tier 2 (expert sectoriel)

/** Type de contradiction detectee */
export type ContradictionType =
  | "INTERNAL" // Contradiction dans le deck lui-meme
  | "DECK_VS_DB" // Deck contredit par la Funding DB
  | "CLAIM_VS_DATA" // Claim contredit par donnees calculees
  | "TIER1_VS_TIER1" // Deux agents Tier 1 se contredisent
  | "TIER1_VS_TIER2" // Agent Tier 1 vs Expert sectoriel
  | "DECK_VS_CONTEXT_ENGINE"; // Deck vs Context Engine data

/** Contradiction detectee avec analyse complete */
export interface DetectedContradiction {
  id: string;
  type: ContradictionType;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";

  // Les deux statements en conflit
  statement1: {
    text: string; // Citation exacte
    location: string; // "Slide 5", "financial-auditor output", "Funding DB"
    source: string; // "deck", "financial-auditor", "funding-db", "context-engine"
  };
  statement2: {
    text: string;
    location: string;
    source: string;
  };

  // Analyse de la contradiction
  topic: string; // "ARR", "Concurrents", "Valorisation", etc.
  analysis: string; // Explication detaillee
  implication: string; // Impact pour le BA
  confidenceLevel: number; // 0-100 - confiance dans la detection

  // Resolution
  resolution?: {
    likely: "statement1" | "statement2" | "unknown";
    reasoning: string;
    needsVerification: boolean;
  };

  // Question pour le fondateur
  question: string;
  redFlagIfBadAnswer: string;
}

/** Gap de donnees identifie */
export interface DataGap {
  id: string;
  area: string; // "Unit Economics", "Cap Table", etc.
  description: string;
  missingFrom: string[]; // Agents qui n'ont pas cette info
  expectedSource: string; // Ou on aurait du trouver cette info
  importance: "CRITICAL" | "HIGH" | "MEDIUM";
  impactOnAnalysis: string;
  recommendation: string;
  questionToAsk: string;
}

/** Cross-reference agregee de tous les agents vs DB */
export interface AggregatedDbComparison {
  totalClaimsChecked: number;
  verified: number;
  contradicted: number;
  partiallyVerified: number;
  notVerifiable: number;

  // Detail par source
  bySource: {
    source: string; // "deck", "financial-auditor", etc.
    claims: number;
    verified: number;
    contradicted: number;
  }[];

  // Comparaison concurrents deck vs DB (CRITIQUE)
  competitorComparison: {
    competitorsInDeck: string[];
    competitorsInDb: string[];
    hiddenCompetitors: string[]; // Dans DB mais pas dans deck = RED FLAG
    deckCompetitorsNotInDb: string[]; // Dans deck mais pas dans DB = a rechercher
    deckAccuracy: "ACCURATE" | "INCOMPLETE" | "MISLEADING";
    impactOnCredibility: string;
  };

  // Verdict global
  overallVerdict: "COHERENT" | "MINOR_ISSUES" | "SIGNIFICANT_CONCERNS" | "MAJOR_DISCREPANCIES";
  verdictRationale: string;
}

/** Synthese des outputs de chaque agent */
export interface AgentOutputSummary {
  agentName: string;
  tier: 1 | 2 | 3;
  score?: number;
  grade?: string;
  criticalRedFlags: number;
  highRedFlags: number;
  mediumRedFlags: number;
  keyFindings: string[];
  concernsRaised: string[];
  claimsMade: { claim: string; confidence: number }[];
}

/** Findings specifiques Contradiction Detector */
export interface ContradictionDetectorFindings {
  // Contradictions detectees (minimum 5 analysees)
  contradictions: DetectedContradiction[];

  // Resume par type
  contradictionSummary: {
    byType: { type: ContradictionType; count: number; criticalCount: number }[];
    bySeverity: { severity: string; count: number }[];
    topicsMostContradicted: string[];
  };

  // Gaps de donnees
  dataGaps: DataGap[];

  // Cross-reference DB agregee de tous les agents
  aggregatedDbComparison: AggregatedDbComparison;

  // Synthese des outputs agents
  agentOutputsSummary: AgentOutputSummary[];

  // Score de consistance avec decomposition
  consistencyAnalysis: {
    overallScore: number; // 0-100
    breakdown: {
      dimension: string; // "internal_consistency", "deck_vs_db", etc.
      score: number;
      weight: number;
      issues: string[];
    }[];
    interpretation: string;
  };

  // Pattern de red flags (convergence des agents)
  redFlagConvergence: {
    topic: string;
    agentsAgreeing: string[];
    agentsDisagreeing: string[];
    consensusLevel: "STRONG" | "MODERATE" | "WEAK" | "CONFLICTING";
    recommendation: string;
  }[];
}

/** Contradiction Detector Data v2.0 - Structure standardisee */
export interface ContradictionDetectorData {
  // === META ===
  meta: AgentMeta;

  // === SCORE PRINCIPAL ===
  score: AgentScore;

  // === FINDINGS SPECIFIQUES ===
  findings: ContradictionDetectorFindings;

  // === DB CROSS-REFERENCE (agregee de tous les agents) ===
  dbCrossReference: DbCrossReference;

  // === RED FLAGS ===
  redFlags: AgentRedFlag[];

  // === QUESTIONS POUR LE FONDATEUR ===
  questions: AgentQuestion[];

  // === SIGNAL D'ALERTE ===
  alertSignal: AgentAlertSignal;

  // === RESUME NARRATIF ===
  narrative: AgentNarrative;
}

export interface ContradictionDetectorResult extends AgentResult {
  agentName: "contradiction-detector";
  data: ContradictionDetectorData;
}

// ============================================================================
// SCENARIO MODELER AGENT - REFONTE v2.0
// ============================================================================
// Mission: Modéliser 4 scénarios (BASE, BULL, BEAR, CATASTROPHIC) basés sur
// des trajectoires RÉELLES d'entreprises comparables - NE JAMAIS INVENTER
// Standard: Big4 + Partner VC - Chaque hypothèse sourcée, calculs montrés
// Minimum: 4 scénarios, 3+ comparables réels, calculs IRR explicites

/** Hypothèse sourcée - CHAQUE HYPOTHESE DOIT AVOIR UNE SOURCE */
export interface SourcedAssumption {
  assumption: string;
  value: number | string;
  source: string; // "Deck Slide X", "DB median SaaS Seed", "financial-auditor", etc.
  confidence: "high" | "medium" | "low";
}

/** Métriques annuelles projetées avec source */
export interface ScenarioYearMetrics {
  year: number;
  revenue: number;
  revenueSource: string; // Comment on arrive à ce chiffre
  valuation: number;
  valuationSource: string; // Multiple utilisé + source
  employeeCount: number;
  employeeCountSource: string;
}

/** Calcul de retour investisseur avec formules explicites */
export interface InvestorReturnCalculation {
  initialInvestment: number;
  initialInvestmentSource: string;
  ownershipAtEntry: number;
  ownershipCalculation: string; // "50K / (2M pre + 500K round) = 2.0%"
  dilutionToExit: number;
  dilutionSource: string; // "Standard Seed→A→B = ~60% dilution (DB median)"
  ownershipAtExit: number;
  ownershipAtExitCalculation: string;
  grossProceeds: number;
  proceedsCalculation: string; // "2.0% × (1-0.60) × 50M exit = 400K"
  multiple: number;
  multipleCalculation: string; // "400K / 50K = 8.0x"
  irr: number;
  irrCalculation: string; // "((8.0)^(1/6) - 1) × 100 = 41.4%"
  holdingPeriodYears: number;
}

/** Scénario complet v2.0 avec sourcing obligatoire */
export interface ScenarioV2 {
  name: "BASE" | "BULL" | "BEAR" | "CATASTROPHIC";
  description: string;

  // Probabilité avec source
  probability: {
    value: number; // 0-100
    rationale: string;
    source: string; // "DB: X% des Seed SaaS atteignent Series A"
  };

  // Hypothèses clés - CHACUNE SOURCÉE
  assumptions: SourcedAssumption[];

  // Métriques par année (Y1, Y3, Y5)
  metrics: ScenarioYearMetrics[];

  // Exit outcome avec calculs montrés
  exitOutcome: {
    type: "acquisition_strategic" | "acquisition_pe" | "ipo" | "secondary" | "acquihire" | "shutdown" | "zombie";
    typeRationale: string;
    timing: string;
    timingSource: string;
    exitValuation: number;
    exitValuationCalculation: string; // "15M ARR × 5x (DB median SaaS exit) = 75M"
    exitMultiple: number;
    exitMultipleSource: string;
  };

  // Retour investisseur avec TOUS les calculs montrés
  investorReturn: InvestorReturnCalculation;

  // Risques et drivers spécifiques à ce scénario
  keyRisks: { risk: string; source: string }[];
  keyDrivers: { driver: string; source: string }[];

  // Comparable réel qui ancre ce scénario
  basedOnComparable?: {
    company: string;
    trajectory: string;
    relevance: string;
    source: string;
  };
}

/** Analyse de sensibilité v2.0 */
export interface SensitivityAnalysisV2 {
  variable: string;
  baseCase: {
    value: number;
    source: string;
  };
  impactOnValuation: {
    change: string; // "+20%", "-30%", etc.
    newValuation: number;
    calculation: string;
  }[];
  impactLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  impactRationale: string;
}

/** Comparable réel de la DB avec trajectoire */
export interface ScenarioComparable {
  company: string;
  sector: string;
  stage: string;
  trajectory: string; // "Seed 2020 → Series A 2021 (2.5M) → Acquired 2023 (45M)"
  outcome: "success" | "moderate_success" | "struggle" | "failure";
  relevance: string; // Pourquoi ce comparable est pertinent
  source: string; // "Funding DB", "Crunchbase", etc.
  keyMetrics?: {
    seedValuation?: number;
    exitValuation?: number;
    timeToExit?: number;
    peakEmployees?: number;
  };
}

/** Findings spécifiques Scenario Modeler v2.0 */
export interface ScenarioModelerFindings {
  // 4 scénarios obligatoires
  scenarios: ScenarioV2[];

  // Analyse de sensibilité
  sensitivityAnalysis: SensitivityAnalysisV2[];

  // OBLIGATOIRE: Comparables réels qui ancrent les scénarios
  basedOnComparables: ScenarioComparable[];

  // Break-even analysis
  breakEvenAnalysis: {
    monthsToBreakeven: number;
    breakEvenCalculation: string;
    requiredGrowthRate: number;
    growthRateSource: string;
    burnUntilBreakeven: number;
    burnCalculation: string;
    achievability: "ACHIEVABLE" | "CHALLENGING" | "UNLIKELY" | "UNKNOWN";
    achievabilityRationale: string;
  };

  // Synthèse probabilité-pondérée
  probabilityWeightedOutcome: {
    expectedMultiple: number;
    expectedMultipleCalculation: string; // "30%×12x + 40%×4x + 20%×0.5x + 10%×0x = 5.3x"
    expectedIRR: number;
    expectedIRRCalculation: string;
    riskAdjustedAssessment: string;
  };

  // Recommandation scénario le plus probable
  mostLikelyScenario: "BASE" | "BULL" | "BEAR" | "CATASTROPHIC";
  mostLikelyRationale: string;
}

/** Scenario Modeler Data v2.0 - Structure standardisée */
export interface ScenarioModelerData {
  // === META ===
  meta: AgentMeta;

  // === SCORE PRINCIPAL ===
  score: AgentScore;

  // === FINDINGS SPECIFIQUES ===
  findings: ScenarioModelerFindings;

  // === DB CROSS-REFERENCE ===
  dbCrossReference: DbCrossReference;

  // === RED FLAGS ===
  redFlags: AgentRedFlag[];

  // === QUESTIONS POUR LE FONDATEUR ===
  questions: AgentQuestion[];

  // === SIGNAL D'ALERTE ===
  alertSignal: AgentAlertSignal;

  // === RESUME NARRATIF ===
  narrative: AgentNarrative;
}

export interface ScenarioModelerResult extends AgentResult {
  agentName: "scenario-modeler";
  data: ScenarioModelerData;
}

// Synthesis Deal Scorer Agent
export interface SynthesisDealScorerData {
  overallScore: number; // 0-100
  verdict: "strong_pass" | "pass" | "conditional_pass" | "weak_pass" | "no_go";
  confidence: number; // 0-100
  dimensionScores: {
    dimension: string;
    score: number;
    weight: number;
    weightedScore: number;
    sourceAgents: string[];
    keyFactors: string[];
  }[];
  scoreBreakdown: {
    strengthsContribution: number;
    weaknessesDeduction: number;
    riskAdjustment: number;
    opportunityBonus: number;
  };
  comparativeRanking: {
    percentileOverall: number;
    percentileSector: number;
    percentileStage: number;
    similarDealsAnalyzed: number;
  };
  investmentRecommendation: {
    action: "invest" | "pass" | "wait" | "negotiate";
    rationale: string;
    conditions?: string[];
    suggestedTerms?: string;
  };
  keyStrengths: string[];
  keyWeaknesses: string[];
  criticalRisks: string[];
}

export interface SynthesisDealScorerResult extends AgentResult {
  agentName: "synthesis-deal-scorer";
  data: SynthesisDealScorerData;
}

// ============================================================================
// DEVIL'S ADVOCATE AGENT - REFONTE v2.0
// ============================================================================
// Mission: Challenge systematique de la these d'investissement
// Standard: Partner VC skeptique + comparables echecs reels (DB)
// Minimum: 5+ counter-arguments sources, 3+ kill reasons, worst case scenario, 5+ questions

/** Contre-argument structure avec comparable echec reel */
export interface CounterArgument {
  id: string;
  thesis: string; // La these positive qu'on challenge
  thesisSource: string; // Quel agent Tier 1/2 a produit cette these
  counterArgument: string; // POURQUOI ca pourrait echouer
  evidence: string; // Preuve a l'appui (donnees, calculs, sources)

  // Comparable echec REEL (source: Funding DB ou recherche)
  comparableFailure: {
    company: string;
    sector: string;
    fundingRaised?: number;
    similarity: string; // En quoi c'est similaire a notre deal
    outcome: string; // Ce qui s'est passe (shutdown, pivot, acquihire, etc.)
    lessonsLearned: string;
    source: string; // "Funding DB", "Crunchbase", "TechCrunch", etc.
    verified?: boolean; // Added by fact-checker
    verificationUrl?: string; // URL found during verification
  };

  probability: "HIGH" | "MEDIUM" | "LOW";
  probabilityRationale: string; // POURQUOI cette probabilite
  mitigationPossible: boolean;
  mitigation?: string;
}

/** Scenario catastrophe detaille */
export interface WorstCaseScenario {
  name: string; // Ex: "Effondrement du marche"
  description: string; // Description complete du scenario
  triggers: {
    trigger: string;
    probability: "HIGH" | "MEDIUM" | "LOW";
    timeframe: string;
  }[];
  cascadeEffects: string[]; // Effets en cascade
  probability: number; // 0-100
  probabilityRationale: string;
  lossAmount: {
    totalLoss: boolean; // Perte totale de l'investissement?
    estimatedLoss: string; // Ex: "80-100% de l'investissement"
    calculation?: string; // Si calculable
  };
  comparableCatastrophes: {
    company: string;
    whatHappened: string;
    investorLosses: string;
    source: string;
    verified?: boolean; // Added by fact-checker
    verificationUrl?: string; // URL found during verification
  }[];
  earlyWarningSigns: string[]; // Signes avant-coureurs a surveiller
}

/** Raison de ne pas investir (kill reason) */
export interface KillReason {
  id: string;
  reason: string;
  category: "team" | "market" | "product" | "financials" | "competition" | "timing" | "structural";
  evidence: string; // Preuve concrete
  sourceAgent: string; // Quel agent a detecte ca
  dealBreakerLevel: "ABSOLUTE" | "CONDITIONAL" | "CONCERN";
  // ABSOLUTE = Ne jamais investir peu importe les reponses
  // CONDITIONAL = Dealbreaker SI la reponse du fondateur est mauvaise
  // CONCERN = Preoccupation serieuse mais pas bloquante

  condition?: string; // Si CONDITIONAL, quelle condition
  resolutionPossible: boolean;
  resolutionPath?: string;

  // Impact financier
  impactIfIgnored: string;

  // Question associee
  questionToFounder: string;
  redFlagAnswer: string; // Reponse qui confirme le dealbreaker
}

/** Blind spot identifie */
export interface BlindSpot {
  id: string;
  area: string; // Domaine non/mal analyse
  description: string;
  whyMissed: string; // Pourquoi les autres agents ont manque ca
  whatCouldGoWrong: string;
  historicalPrecedent?: {
    company: string;
    whatHappened: string;
    source: string;
    verified?: boolean; // Added by fact-checker
    verificationUrl?: string; // URL found during verification
  };
  recommendedAction: string;
  urgency: "IMMEDIATE" | "BEFORE_DECISION" | "DURING_DD";
}

/** Narrative alternative plausible */
export interface AlternativeNarrative {
  id: string;
  currentNarrative: string; // Ce que le fondateur raconte
  alternativeNarrative: string; // Autre interpretation des memes faits
  plausibility: number; // 0-100
  plausibilityRationale: string;
  evidenceSupporting: string[];
  implications: string; // Ce que ca implique pour l'investissement
  testToValidate: string; // Comment verifier quelle narrative est vraie
}

/** Findings specifiques Devil's Advocate (Section 5.4 + extensions) */
export interface DevilsAdvocateFindings {
  // Contre-arguments structures (minimum 5)
  counterArguments: CounterArgument[];

  // Scenario catastrophe detaille
  worstCaseScenario: WorstCaseScenario;

  // Kill reasons (minimum 3)
  killReasons: KillReason[];

  // Blind spots identifies (minimum 3)
  blindSpots: BlindSpot[];

  // Narratives alternatives (minimum 2)
  alternativeNarratives: AlternativeNarrative[];

  // Risques marche non couverts par market-intelligence
  additionalMarketRisks: {
    risk: string;
    trigger: string;
    timeline: string;
    severity: "EXISTENTIAL" | "SERIOUS" | "MANAGEABLE";
    notCoveredBecause: string;
  }[];

  // Menaces competitives non detectees par competitive-intel
  hiddenCompetitiveThreats: {
    threat: string;
    source: string; // D'ou vient la menace
    whyHidden: string; // Pourquoi competitive-intel l'a manque
    likelihood: number; // 0-100
    defensibility: string;
    evidenceSource: string;
  }[];

  // Defis d'execution sous-estimes
  executionChallenges: {
    challenge: string;
    currentAssessment: string; // Ce que les autres agents ont dit
    realDifficulty: "EXTREME" | "VERY_HARD" | "HARD" | "MODERATE";
    whyUnderestimated: string;
    prerequisite: string;
    failureMode: string;
    comparableFailure?: string;
  }[];

  // Score de scepticisme global
  skepticismAssessment: {
    score: number; // 0-100 (higher = more skeptical)
    scoreBreakdown: {
      factor: string;
      contribution: number; // Points ajoutes au scepticisme
      rationale: string;
    }[];
    verdict: "VERY_SKEPTICAL" | "SKEPTICAL" | "CAUTIOUS" | "NEUTRAL" | "CAUTIOUSLY_OPTIMISTIC";
    verdictRationale: string;
  };

  // Synthese des concerns
  concernsSummary: {
    absolute: string[]; // Dealbreakers absolus
    conditional: string[]; // Dealbreakers conditionnels
    serious: string[]; // Preoccupations serieuses
    minor: string[]; // Preoccupations mineures
  };

  // Cross-reference avec findings positifs des autres agents
  positiveClaimsChallenged: {
    claim: string;
    sourceAgent: string;
    challenge: string;
    verdict: "STANDS" | "WEAKENED" | "INVALIDATED";
    verdictRationale: string;
  }[];
}

/** Devil's Advocate Data v2.0 - Structure standardisee Tier 3 */
export interface DevilsAdvocateData {
  // === META ===
  meta: AgentMeta;

  // === SCORE PRINCIPAL ===
  score: AgentScore;

  // === FINDINGS SPECIFIQUES ===
  findings: DevilsAdvocateFindings;

  // === DB CROSS-REFERENCE ===
  dbCrossReference: DbCrossReference;

  // === RED FLAGS (aggreges + nouveaux) ===
  redFlags: AgentRedFlag[];

  // === QUESTIONS POUR LE FONDATEUR ===
  questions: AgentQuestion[];

  // === SIGNAL D'ALERTE ===
  alertSignal: AgentAlertSignal;

  // === RESUME NARRATIF ===
  narrative: AgentNarrative;
}

export interface DevilsAdvocateResult extends AgentResult {
  agentName: "devils-advocate";
  data: DevilsAdvocateData;
}

// Memo Generator Agent
export interface MemoGeneratorData {
  executiveSummary: {
    oneLiner: string;
    recommendation: "invest" | "pass" | "more_dd_needed";
    keyPoints: string[];
  };
  companyOverview: {
    description: string;
    problem: string;
    solution: string;
    businessModel: string;
    traction: string;
  };
  investmentHighlights: {
    highlight: string;
    evidence: string;
  }[];
  keyRisks: {
    risk: string;
    mitigation: string;
    residualRisk: "low" | "medium" | "high";
  }[];
  financialSummary: {
    currentMetrics: Record<string, string | number>;
    projections: string;
    valuationAssessment: string;
  };
  teamAssessment: string;
  marketOpportunity: string;
  competitiveLandscape: string;
  dealTerms: {
    valuation: string;
    roundSize: string;
    keyTerms: string[];
    negotiationPoints: string[];
  };
  dueDiligenceFindings: {
    completed: string[];
    outstanding: string[];
    redFlags: string[];
  };
  investmentThesis: string;
  exitStrategy: string;
  nextSteps: string[];
  appendix: {
    financialModel?: string;
    comparableDeals?: string;
    referencesChecked?: string[];
  };
}

export interface MemoGeneratorResult extends AgentResult {
  agentName: "memo-generator";
  data: MemoGeneratorData;
}

// Analysis session types
export type AnalysisAgentResult =
  | ExtractionResult
  | RedFlagResult
  | ScoringResult
  | DeckForensicsResult
  | FinancialAuditResult
  | MarketIntelResult
  | CompetitiveIntelResult
  | TeamInvestigatorResult
  | TechnicalDDResult
  | TechStackDDResult
  | TechOpsDDResult
  | LegalRegulatoryResult
  | CapTableAuditResult
  | GTMAnalystResult
  | CustomerIntelResult
  | ExitStrategistResult
  | QuestionMasterResult
  | ContradictionDetectorResult
  | ScenarioModelerResult
  | SynthesisDealScorerResult
  | DevilsAdvocateResult
  | MemoGeneratorResult;

// Tier 1 agent names
export type Tier1AgentName =
  | "deck-forensics"
  | "financial-auditor"
  | "market-intelligence"
  | "competitive-intel"
  | "team-investigator"
  | "technical-dd"
  | "tech-stack-dd"
  | "tech-ops-dd"
  | "legal-regulatory"
  | "cap-table-auditor"
  | "gtm-analyst"
  | "customer-intel"
  | "exit-strategist"
  | "question-master";

// Tier 2 agent names
export type Tier2AgentName =
  | "contradiction-detector"
  | "scenario-modeler"
  | "synthesis-deal-scorer"
  | "devils-advocate"
  | "memo-generator";

export interface AnalysisSession {
  id: string;
  dealId: string;
  type: "screening" | "full_dd";
  status: "pending" | "running" | "completed" | "failed";
  agents: {
    name: string;
    status: "pending" | "running" | "completed" | "failed";
    result?: AnalysisAgentResult;
  }[];
  totalCost: number;
  startedAt: Date;
  completedAt?: Date;
}

// Agent configuration
export interface AgentConfig {
  name: string;
  description: string;
  modelComplexity: "simple" | "medium" | "complex" | "critical";
  maxRetries: number;
  timeoutMs: number;
  dependencies?: string[]; // Other agents that must run first
}

// ============================================================================
// STANDARD TRACE TYPES - Transparency & Reproducibility
// ============================================================================

/**
 * Trace d'un appel LLM individuel
 */
export interface LLMCallTrace {
  /** Identifiant unique de l'appel */
  id: string;
  /** Timestamp de l'appel */
  timestamp: string;
  /** Prompt envoyé (system + user) */
  prompt: {
    system: string;
    user: string;
  };
  /** Réponse brute du LLM */
  response: {
    raw: string;
    parsed?: unknown;
  };
  /** Métriques de l'appel */
  metrics: {
    inputTokens: number;
    outputTokens: number;
    cost: number;
    latencyMs: number;
  };
  /** Modèle utilisé */
  model: string;
  /** Température utilisée */
  temperature: number;
}

/**
 * Contexte utilisé par l'agent
 */
export interface ContextUsed {
  /** Documents analysés */
  documents: {
    name: string;
    type: string;
    charCount: number;
  }[];
  /** Données du Context Engine */
  contextEngine?: {
    similarDeals: number;
    competitors: number;
    newsArticles: number;
    completeness: number;
  };
  /** Données extraites utilisées */
  extractedData?: {
    fields: string[];
    confidence: Record<string, number>;
  };
}

/**
 * Trace complète d'une exécution d'agent Standard
 * Permet la transparence et la reproductibilité sans le coût de ReAct
 */
export interface StandardTrace {
  /** Identifiant unique de la trace */
  id: string;
  /** Nom de l'agent */
  agentName: string;
  /** Timestamp de début */
  startedAt: string;
  /** Timestamp de fin */
  completedAt: string;
  /** Durée totale en ms */
  totalDurationMs: number;
  /** Appels LLM effectués */
  llmCalls: LLMCallTrace[];
  /** Contexte utilisé */
  contextUsed: ContextUsed;
  /** Métriques agrégées */
  metrics: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCost: number;
    llmCallCount: number;
  };
  /** Hash du contexte pour reproductibilité */
  contextHash: string;
  /** Version du prompt utilisé (hash SHA-256 tronqué) */
  promptVersion: string;
  /** Détails du prompt pour audit (optionnel) */
  promptVersionDetails?: {
    systemPromptHash: string;
    modelComplexity: string;
    agentName: string;
  };
}

/**
 * F80: Lightweight trace metrics, ALWAYS present on every agent result.
 * Full trace (prompts/responses) remains optional.
 */
export interface AgentTraceMetrics {
  id: string;
  agentName: string;
  totalDurationMs: number;
  llmCallCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  contextHash: string;
  promptVersion: string;
  startedAt: string;
  completedAt: string;
}

/**
 * Résultat d'agent avec trace
 */
export interface AgentResultWithTrace extends AgentResult {
  /** F80: Lightweight metrics (ALWAYS present) */
  _traceMetrics: AgentTraceMetrics;
  /** Full trace with prompts/responses (opt-in, can be large) */
  _traceFull?: StandardTrace;
}
