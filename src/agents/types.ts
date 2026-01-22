import type { Deal, RedFlagCategory, RedFlagSeverity } from "@prisma/client";
import type {
  DealContext,
  DealIntelligence,
  MarketData,
  CompetitiveLandscape,
  NewsSentiment,
  PeopleGraph,
} from "@/services/context-engine/types";

// Agent execution context
export interface AgentContext {
  dealId: string;
  deal: Deal;
  documents?: {
    id: string;
    name: string;
    type: string;
    extractedText?: string | null;
  }[];
  previousResults?: Record<string, AgentResult>;
}

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

// Deal Screener specific types
export interface ScreeningResult extends AgentResult {
  agentName: "deal-screener";
  data: {
    shouldProceed: boolean;
    confidenceScore: number; // 0-100
    summary: string;
    strengths: string[];
    concerns: string[];
    missingInfo: string[];
    recommendedNextSteps: string[];
  };
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

  // Financials
  arr?: number;
  mrr?: number;
  revenue?: number;
  growthRateYoY?: number;
  burnRate?: number;
  runway?: number;

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
  techStack?: string[];
  competitiveAdvantage?: string;

  // Market
  targetMarket?: string;
  tam?: number;
  sam?: number;
  som?: number;
  competitors?: string[];
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
// TIER 1 AGENT RESULT TYPES
// ============================================================================

// Deck Forensics Agent
export interface DeckForensicsData {
  narrativeAnalysis: {
    storyStrength: number; // 0-100
    logicalFlow: boolean;
    emotionalAppeal: number;
    credibilitySignals: string[];
    inconsistencies: string[];
  };
  claimVerification: {
    claim: string;
    status: "verified" | "unverified" | "contradicted" | "exaggerated";
    evidence?: string;
    confidenceScore: number;
  }[];
  presentationQuality: {
    designScore: number;
    clarityScore: number;
    professionalismScore: number;
    issues: string[];
  };
  redFlags: string[];
  overallAssessment: string;
}

export interface DeckForensicsResult extends AgentResult {
  agentName: "deck-forensics";
  data: DeckForensicsData;
}

// Financial Auditor Agent
export interface FinancialAuditData {
  metricsValidation: {
    metric: string;
    reportedValue: number | string;
    benchmarkP25: number;
    benchmarkMedian: number;
    benchmarkP75: number;
    percentile: number;
    assessment: "below_average" | "average" | "above_average" | "exceptional" | "suspicious";
    notes?: string;
  }[];
  unitEconomicsHealth: {
    ltv?: number;
    cac?: number;
    ltvCacRatio?: number;
    cacPayback?: number;
    assessment: string;
    concerns: string[];
  };
  valuationAnalysis: {
    requestedValuation: number;
    impliedMultiple: number;
    benchmarkMultipleP25: number;
    benchmarkMultipleMedian: number;
    benchmarkMultipleP75: number;
    verdict: "undervalued" | "fair" | "aggressive" | "very_aggressive";
    comparables: {
      name: string;
      multiple: number;
      stage: string;
    }[];
  };
  burnAnalysis?: {
    monthlyBurn: number;
    runway: number;
    burnMultiple?: number;
    efficiency: "efficient" | "moderate" | "inefficient";
  };
  financialRedFlags: string[];
  overallScore: number; // 0-100
}

export interface FinancialAuditResult extends AgentResult {
  agentName: "financial-auditor";
  data: FinancialAuditData;
}

// Market Intelligence Agent
export interface MarketIntelData {
  marketSizeValidation: {
    claimedTAM?: number;
    claimedSAM?: number;
    claimedSOM?: number;
    validatedTAM?: number;
    validatedSAM?: number;
    validatedSOM?: number;
    sources: string[];
    discrepancy: "none" | "minor" | "significant" | "major";
    assessment: string;
  };
  marketTrends: {
    trend: string;
    direction: "positive" | "neutral" | "negative";
    impact: string;
    confidence: number;
  }[];
  timingAnalysis: {
    marketMaturity: "emerging" | "growing" | "mature" | "declining";
    adoptionCurve: "innovators" | "early_adopters" | "early_majority" | "late_majority";
    windowOfOpportunity: string;
    timing: "too_early" | "good" | "optimal" | "late";
  };
  regulatoryLandscape: string;
  marketScore: number; // 0-100
}

export interface MarketIntelResult extends AgentResult {
  agentName: "market-intelligence";
  data: MarketIntelData;
}

// Competitive Intel Agent
export interface CompetitiveIntelData {
  competitorMap: {
    name: string;
    positioning: string;
    funding?: number;
    estimatedRevenue?: number;
    strengths: string[];
    weaknesses: string[];
    overlap: "direct" | "partial" | "adjacent";
    threat: "low" | "medium" | "high";
  }[];
  marketConcentration: "fragmented" | "moderate" | "concentrated" | "monopolistic";
  competitiveAdvantages: {
    advantage: string;
    defensibility: "weak" | "moderate" | "strong";
    duration: string;
  }[];
  competitiveRisks: string[];
  moatAssessment: {
    type: "none" | "brand" | "network" | "data" | "switching_costs" | "scale" | "technology" | "regulatory";
    strength: number; // 0-100
    sustainability: string;
  };
  competitiveScore: number; // 0-100
}

export interface CompetitiveIntelResult extends AgentResult {
  agentName: "competitive-intel";
  data: CompetitiveIntelData;
}

// Team Investigator Agent
export interface TeamInvestigatorData {
  founderProfiles: {
    name: string;
    role: string;
    backgroundVerified: boolean;
    keyExperience: string[];
    previousVentures: {
      name: string;
      outcome: "success" | "acquihire" | "failure" | "ongoing" | "unknown";
      relevance: string;
    }[];
    domainExpertise: number; // 0-100
    entrepreneurialExperience: number; // 0-100
    redFlags: string[];
    networkStrength: "weak" | "moderate" | "strong";
  }[];
  teamComposition: {
    technicalStrength: number;
    businessStrength: number;
    complementarity: number;
    gaps: string[];
    keyHiresToMake: string[];
  };
  cofounderDynamics: {
    equitySplit: string;
    vestingInPlace: boolean;
    workingHistory: string;
    potentialConflicts: string[];
  };
  overallTeamScore: number; // 0-100
  criticalQuestions: string[];
}

export interface TeamInvestigatorResult extends AgentResult {
  agentName: "team-investigator";
  data: TeamInvestigatorData;
}

// Technical DD Agent
export interface TechnicalDDData {
  techStackAssessment: {
    stack: string[];
    appropriateness: "poor" | "acceptable" | "good" | "excellent";
    scalability: "low" | "medium" | "high";
    concerns: string[];
  };
  technicalDebt: {
    estimated: "low" | "moderate" | "high" | "critical";
    indicators: string[];
  };
  productMaturity: {
    stage: "prototype" | "mvp" | "beta" | "production" | "scale";
    stability: number; // 0-100
    featureCompleteness: number; // 0-100
  };
  technicalRisks: {
    risk: string;
    severity: "low" | "medium" | "high";
    mitigation?: string;
  }[];
  ipProtection: {
    hasPatents: boolean;
    patentsPending: number;
    tradeSecrets: boolean;
    openSourceRisk: "none" | "low" | "medium" | "high";
  };
  securityPosture: {
    assessment: "poor" | "basic" | "good" | "excellent";
    concerns: string[];
  };
  technicalScore: number; // 0-100
}

export interface TechnicalDDResult extends AgentResult {
  agentName: "technical-dd";
  data: TechnicalDDData;
}

// Legal & Regulatory Agent
export interface LegalRegulatoryData {
  structureAnalysis: {
    entityType: string;
    jurisdiction: string;
    appropriateness: "appropriate" | "suboptimal" | "concerning";
    concerns: string[];
  };
  regulatoryExposure: {
    sector: string;
    primaryRegulations: string[];
    complianceStatus: "unknown" | "non_compliant" | "partial" | "compliant";
    upcomingRegulations: string[];
    riskLevel: "low" | "medium" | "high" | "critical";
  };
  ipRisks: {
    patentInfringement: "none" | "possible" | "likely";
    copyrightIssues: string[];
    trademarkConflicts: string[];
  };
  contractualRisks: {
    keyContracts: string[];
    concerningClauses: string[];
    customerConcentrationRisk: boolean;
  };
  litigationRisk: {
    currentLitigation: boolean;
    potentialClaims: string[];
    riskLevel: "low" | "medium" | "high";
  };
  legalScore: number; // 0-100
  criticalIssues: string[];
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

// GTM Analyst Agent
export interface GTMAnalystData {
  strategyAssessment: {
    primaryChannel: string;
    channels: string[];
    approach: "product_led" | "sales_led" | "hybrid" | "unclear";
    clarity: number; // 0-100
    appropriateness: "poor" | "acceptable" | "good" | "excellent";
  };
  salesEfficiency: {
    salesCycle?: string;
    acv?: number;
    winRate?: number;
    pipelineCoverage?: number;
    assessment: string;
  };
  marketingEfficiency: {
    cac?: number;
    cacPayback?: number;
    channelMix: string[];
    scalability: "low" | "medium" | "high";
  };
  growthPotential: {
    currentGrowthRate: number;
    sustainabilityScore: number; // 0-100
    growthLevers: string[];
    constraints: string[];
  };
  gtmRisks: string[];
  gtmScore: number; // 0-100
}

export interface GTMAnalystResult extends AgentResult {
  agentName: "gtm-analyst";
  data: GTMAnalystData;
}

// Customer Intel Agent
export interface CustomerIntelData {
  customerProfile: {
    icp: string;
    segments: string[];
    currentCustomers?: number;
    notableCustomers: string[];
    customerQuality: "low" | "medium" | "high";
  };
  retentionMetrics: {
    churnRate?: number;
    netRevenueRetention?: number;
    grossRetention?: number;
    cohortTrends: "improving" | "stable" | "declining" | "unknown";
    assessment: string;
  };
  productMarketFit: {
    signals: string[];
    strength: "weak" | "emerging" | "moderate" | "strong";
    evidence: string[];
  };
  customerRisks: {
    concentration: number; // % from top customer
    dependencyRisk: "low" | "medium" | "high";
    churnRisk: "low" | "medium" | "high";
    concerns: string[];
  };
  expansionPotential: {
    upsellOpportunity: "low" | "medium" | "high";
    crossSellOpportunity: "low" | "medium" | "high";
    virality: "none" | "low" | "medium" | "high";
  };
  customerScore: number; // 0-100
}

export interface CustomerIntelResult extends AgentResult {
  agentName: "customer-intel";
  data: CustomerIntelData;
}

// Exit Strategist Agent
export interface ExitStrategistData {
  exitScenarios: {
    scenario: "acquisition_early" | "acquisition_growth" | "ipo" | "secondary" | "failure";
    probability: "low" | "medium" | "high";
    timeframe: string;
    estimatedValue?: number;
    potentialBuyers?: string[];
    description: string;
  }[];
  acquirerAnalysis: {
    strategicBuyers: string[];
    financialBuyers: string[];
    buyerMotivation: string;
    comparableAcquisitions: {
      target: string;
      acquirer: string;
      value: number;
      multiple: number;
      year: number;
    }[];
  };
  returnAnalysis: {
    investmentAmount: number;
    ownershipPostRound: number;
    scenarios: {
      scenario: string;
      exitValue: number;
      dilution: number;
      proceeds: number;
      multiple: number;
      irr: number;
    }[];
  };
  liquidityRisks: string[];
  exitScore: number; // 0-100 (attractiveness for exit)
}

export interface ExitStrategistResult extends AgentResult {
  agentName: "exit-strategist";
  data: ExitStrategistData;
}

// Question Master Agent
export interface QuestionMasterData {
  founderQuestions: {
    question: string;
    category: "vision" | "execution" | "team" | "market" | "financials" | "risk";
    priority: "must_ask" | "should_ask" | "nice_to_have";
    redFlagTrigger?: string;
    expectedAnswer?: string;
  }[];
  referenceCheckQuestions: {
    target: "customer" | "former_employee" | "investor" | "industry_expert";
    questions: string[];
  }[];
  diligenceChecklist: {
    category: string;
    items: {
      item: string;
      status: "not_started" | "in_progress" | "completed" | "blocked";
      criticalPath: boolean;
    }[];
  }[];
  negotiationPoints: {
    point: string;
    leverage: string;
    suggestedApproach: string;
  }[];
  dealbreakers: string[];
  topPriorities: string[];
}

export interface QuestionMasterResult extends AgentResult {
  agentName: "question-master";
  data: QuestionMasterData;
}

// ============================================================================
// TIER 2 AGENT RESULT TYPES - Synthesis Agents
// ============================================================================

// Contradiction Detector Agent
export interface ContradictionDetectorData {
  contradictions: {
    id: string;
    sources: string[]; // Agent names that have conflicting info
    topic: string;
    claim1: { agent: string; statement: string };
    claim2: { agent: string; statement: string };
    severity: "minor" | "moderate" | "major" | "critical";
    impact: string;
    resolution?: string;
    needsVerification: boolean;
  }[];
  dataGaps: {
    area: string;
    missingFrom: string[];
    importance: "low" | "medium" | "high";
    recommendation: string;
  }[];
  consistencyScore: number; // 0-100, higher = more consistent
  summaryAssessment: string;
}

export interface ContradictionDetectorResult extends AgentResult {
  agentName: "contradiction-detector";
  data: ContradictionDetectorData;
}

// Scenario Modeler Agent
export interface ScenarioModelerData {
  scenarios: {
    name: "bull" | "base" | "bear";
    probability: number; // 0-100
    description: string;
    keyAssumptions: string[];
    financialProjections: {
      year1: { revenue: number; growth: number };
      year3: { revenue: number; growth: number };
      year5: { revenue: number; growth: number };
    };
    exitScenario: {
      type: "acquisition" | "ipo" | "secondary" | "none";
      timing: string;
      valuation: number;
      multiple: number;
    };
    returnAnalysis: {
      investmentAmount: number;
      ownership: number;
      exitProceeds: number;
      multiple: number;
      irr: number;
    };
    keyRisks: string[];
    keyDrivers: string[];
  }[];
  sensitivityAnalysis: {
    variable: string;
    impact: "low" | "medium" | "high";
    bullValue: number | string;
    baseValue: number | string;
    bearValue: number | string;
  }[];
  breakEvenAnalysis: {
    monthsToBreakeven: number;
    requiredGrowthRate: number;
    burnUntilBreakeven: number;
  };
  recommendedScenario: "bull" | "base" | "bear";
  confidenceLevel: number; // 0-100
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

// Devil's Advocate Agent
export interface DevilsAdvocateData {
  challengedAssumptions: {
    assumption: string;
    challenge: string;
    worstCaseScenario: string;
    probability: "unlikely" | "possible" | "likely";
    impact: "low" | "medium" | "high" | "critical";
    mitigationPossible: boolean;
    mitigation?: string;
  }[];
  blindSpots: {
    area: string;
    description: string;
    whatCouldGoWrong: string;
    historicalPrecedent?: string;
    recommendation: string;
  }[];
  alternativeNarratives: {
    narrative: string;
    plausibility: number; // 0-100
    implications: string;
  }[];
  marketRisks: {
    risk: string;
    trigger: string;
    timeline: string;
    severity: "manageable" | "serious" | "existential";
  }[];
  competitiveThreats: {
    threat: string;
    source: string;
    likelihood: number;
    defensibility: string;
  }[];
  executionChallenges: {
    challenge: string;
    difficulty: "moderate" | "hard" | "very_hard";
    prerequisite: string;
    failureMode: string;
  }[];
  overallSkepticism: number; // 0-100, higher = more skeptical
  topConcerns: string[];
  dealbreakers: string[];
  questionsRequiringAnswers: string[];
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
  | ScreeningResult
  | ExtractionResult
  | RedFlagResult
  | ScoringResult
  | DeckForensicsResult
  | FinancialAuditResult
  | MarketIntelResult
  | CompetitiveIntelResult
  | TeamInvestigatorResult
  | TechnicalDDResult
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
