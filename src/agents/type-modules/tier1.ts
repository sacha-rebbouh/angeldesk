import type {
  AgentResult,
  AgentMeta,
  AgentScore,
  AgentRedFlag,
  AgentQuestion,
  AgentAlertSignal,
  AgentNarrative,
  DbCrossReference,
} from './common';

// ============================================================================
// TIER 1 AGENT RESULT TYPES
// ============================================================================

// ============================================================================
// DECK FORENSICS AGENT - REFONTE v2.0
// ============================================================================

export interface DeckClaimVerification {
  id: string;
  category: "market" | "traction" | "financials" | "tech" | "timing" | "competition" | "team";
  claim: string;
  location: string;
  status: "VERIFIED" | "UNVERIFIED" | "CONTRADICTED" | "EXAGGERATED" | "MISLEADING" | "PROJECTION_AS_FACT";
  evidence: string;
  sourceUsed: string;
  investorImplication: string;
  dataReliability?: "AUDITED" | "VERIFIED" | "DECLARED" | "PROJECTED" | "ESTIMATED" | "UNVERIFIABLE";
}

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

export interface DeckForensicsFindings {
  narrativeAnalysis: {
    storyCoherence: number;
    credibilityAssessment: string;
    narrativeStrengths: { point: string; location: string }[];
    narrativeWeaknesses: { point: string; location: string }[];
    criticalMissingInfo: { info: string; whyItMatters: string }[];
  };
  claimVerification: DeckClaimVerification[];
  inconsistencies: DeckInconsistency[];
  deckQuality: {
    professionalismScore: number;
    completenessScore: number;
    transparencyScore: number;
    issues: string[];
  };
}

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

export interface FinancialAuditFindings {
  metrics: {
    metric: string;
    status: "available" | "missing" | "suspicious";
    reportedValue?: number;
    calculatedValue?: number;
    calculation?: string;
    benchmarkP25?: number;
    benchmarkMedian?: number;
    benchmarkP75?: number;
    percentile?: number;
    source: string;
    assessment: string;
    dataReliability?: "AUDITED" | "VERIFIED" | "DECLARED" | "PROJECTED" | "ESTIMATED" | "UNVERIFIABLE";
  }[];
  projections: { realistic: boolean; assumptions: string[]; concerns: string[] };
  valuation: {
    requested?: number;
    impliedMultiple?: number;
    benchmarkMultiple: number | null;
    benchmarkMultipleIsFallback?: boolean;
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

export interface FinancialAuditData {
  meta: AgentMeta; score: AgentScore; findings: FinancialAuditFindings;
  dbCrossReference: DbCrossReference; redFlags: AgentRedFlag[]; questions: AgentQuestion[];
  alertSignal: AgentAlertSignal; narrative: AgentNarrative;
}

export interface FinancialAuditResult extends AgentResult {
  agentName: "financial-auditor"; data: FinancialAuditData;
}

// ============================================================================
// MARKET INTELLIGENCE AGENT - REFONTE v2.0
// ============================================================================

export interface MarketClaimValidation {
  id: string;
  claimType: "tam" | "sam" | "som" | "growth" | "market_position" | "timing";
  claimedValue: string; claimedSource?: string; location: string;
  validatedValue?: string; validationSource: string;
  status: "VERIFIED" | "CONTRADICTED" | "PARTIAL" | "EXAGGERATED" | "NOT_VERIFIABLE";
  discrepancyPercent?: number; analysis: string; investorImplication: string;
}

export interface MarketCompetitorSignal {
  name: string; totalFunding: number; lastRoundDate?: string;
  lastRoundAmount?: number; status: "active" | "acquired" | "shutdown"; signal: string;
}

export interface MarketIntelFindings {
  marketSize: {
    tam: { claimed?: number; validated?: number; source: string; year: number; methodology: "top_down" | "bottom_up" | "unknown"; confidence: "high" | "medium" | "low" };
    sam: { claimed?: number; validated?: number; source: string; calculation: string };
    som: { claimed?: number; validated?: number; source: string; calculation: string; realisticAssessment: string };
    growthRate: { claimed?: number; validated?: number; cagr: number; source: string; period: string };
    discrepancyLevel: "NONE" | "MINOR" | "SIGNIFICANT" | "MAJOR";
    overallAssessment: string;
  };
  fundingTrends: {
    sectorName: string; period: string;
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
    reasoning: string; windowRemaining: string;
    competitorActivity: MarketCompetitorSignal[];
  };
  regulatoryLandscape: {
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    keyRegulations: string[]; upcomingChanges: string[]; impact: string;
  };
  claimValidations: MarketClaimValidation[];
}

export interface MarketIntelData {
  meta: AgentMeta; score: AgentScore; findings: MarketIntelFindings;
  dbCrossReference: DbCrossReference; redFlags: AgentRedFlag[]; questions: AgentQuestion[];
  alertSignal: AgentAlertSignal; narrative: AgentNarrative;
}

export interface MarketIntelResult extends AgentResult {
  agentName: "market-intelligence"; data: MarketIntelData;
}

// ============================================================================
// COMPETITIVE INTEL AGENT - REFONTE v2.0
// ============================================================================

export interface CompetitorAnalysis {
  id: string; name: string; website?: string;
  positioning: string; targetCustomer: string;
  overlap: "direct" | "indirect" | "adjacent" | "future_threat"; overlapExplanation: string;
  funding: { total?: number; lastRound?: number; lastRoundDate?: string; stage?: string; investors?: string[]; source: string };
  estimatedRevenue?: { value: number; basis: string };
  strengths: { point: string; evidence: string }[];
  weaknesses: { point: string; evidence: string }[];
  threatLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"; threatRationale: string; timeToThreat: string;
  differentiationVsUs: { ourAdvantage: string; theirAdvantage: string; verdict: "WE_WIN" | "THEY_WIN" | "PARITY" | "DIFFERENT_SEGMENT" };
}

export interface MoatAnalysis {
  primaryMoatType: "network_effects" | "data_moat" | "brand" | "switching_costs" | "scale" | "technology" | "regulatory" | "none";
  secondaryMoatTypes: string[];
  moatScoring: { moatType: string; score: number; evidence: string; sustainability: "strong" | "moderate" | "weak"; timeframe: string }[];
  overallMoatStrength: number;
  moatVerdict: "STRONG_MOAT" | "EMERGING_MOAT" | "WEAK_MOAT" | "NO_MOAT";
  moatJustification: string;
  moatRisks: { risk: string; probability: "HIGH" | "MEDIUM" | "LOW"; impact: string }[];
}

export interface CompetitiveClaim {
  id: string; claim: string; location: string;
  claimType: "no_competition" | "market_leader" | "unique_tech" | "first_mover" | "better_product" | "cheaper" | "other";
  verificationStatus: "VERIFIED" | "CONTRADICTED" | "EXAGGERATED" | "UNVERIFIABLE";
  verificationEvidence: string; sourceUsed: string;
  investorImplication: string; severityIfFalse: "CRITICAL" | "HIGH" | "MEDIUM";
}

export interface CompetitiveIntelFindings {
  competitors: CompetitorAnalysis[];
  competitorsMissedInDeck: { name: string; funding?: number; whyRelevant: string; severity: "CRITICAL" | "HIGH" | "MEDIUM" }[];
  marketStructure: { concentration: "fragmented" | "moderate" | "concentrated" | "monopolistic"; totalPlayers: number; topPlayersMarketShare: string; entryBarriers: "low" | "medium" | "high"; entryBarriersExplanation: string };
  moatAnalysis: MoatAnalysis;
  competitivePositioning: { ourPosition: string; nearestCompetitor: string; differentiationStrength: "strong" | "moderate" | "weak" | "unclear"; sustainabilityOfPosition: string };
  claimsAnalysis: CompetitiveClaim[];
  competitiveThreats: { threat: string; source: string; probability: "HIGH" | "MEDIUM" | "LOW"; timeframe: string; potentialImpact: string; mitigation: string }[];
  fundingBenchmark: { ourFunding: number; competitorsFunding: { name: string; funding: number }[]; percentileVsCompetitors: number; verdict: string };
}

export interface CompetitiveIntelData {
  meta: AgentMeta; score: AgentScore; findings: CompetitiveIntelFindings;
  dbCrossReference: DbCrossReference; redFlags: AgentRedFlag[]; questions: AgentQuestion[];
  alertSignal: AgentAlertSignal; narrative: AgentNarrative;
}

export interface CompetitiveIntelResult extends AgentResult {
  agentName: "competitive-intel"; data: CompetitiveIntelData;
}

// ============================================================================
// TEAM INVESTIGATOR AGENT - REFONTE v2.0
// ============================================================================

export interface LinkedInEnrichedProfile {
  linkedinUrl: string; scrapedAt: string; fullName: string;
  headline?: string; location?: string; about?: string; profilePicture?: string;
  experiences: { title: string; company: string; companyUrl?: string; companyIndustry?: string; companySize?: string; location?: string; startDate?: string; endDate?: string; duration?: string; description?: string; isCurrentPosition?: boolean }[];
  education: { school: string; degree?: string; fieldOfStudy?: string; startDate?: string; endDate?: string }[];
  skills?: string[]; email?: string; phone?: string;
  highlights: { yearsExperience: number; educationLevel: "highschool" | "bachelor" | "master" | "phd" | "other"; hasRelevantIndustryExp: boolean; hasFounderExperience: boolean; hasTechBackground: boolean; isSerialFounder: boolean; topCompanies: string[]; longestTenure: number; averageTenure: number; jobHoppingRisk: boolean };
}

export interface TeamInvestigatorFindings {
  founderProfiles: {
    name: string; role: string; linkedinUrl?: string; linkedinVerified: boolean; linkedinScrapedAt?: string;
    background: { yearsExperience: number; headline?: string; currentTitle?: string; educationHighlight?: string; topPreviousCompanies: string[]; domainExpertiseYears: number; relevantRoles: string[]; keySkills: string[] };
    entrepreneurialTrack: { isFirstTimeFounder: boolean; previousVentures: { name: string; role: string; outcome: "big_success" | "success" | "acquihire" | "pivot" | "failure" | "ongoing" | "unknown"; exitValue?: number; duration?: string; relevance: string; source: string }[]; totalVentures: number; successfulExits: number };
    scores: { domainExpertise: number; entrepreneurialExperience: number; executionCapability: number; networkStrength: number; overallFounderScore: number };
    redFlags: { type: string; severity: "CRITICAL" | "HIGH" | "MEDIUM"; description: string; evidence: string }[];
    strengths: string[]; concerns: string[];
  }[];
  teamMemberProfiles?: { name: string; role: string; category: "development" | "business" | "operations" | "other"; isFullTime: boolean; seniorityLevel: "junior" | "mid" | "senior" | "lead" | "unknown"; linkedinUrl?: string; linkedinVerified: boolean; background?: { yearsExperience?: number; relevantExperience?: string; keySkills?: string[] }; assessment: string; concerns?: string[] }[];
  teamComposition: { size: number; rolesPresent: string[]; rolesMissing: string[]; technicalStrength: number; businessStrength: number; complementarityScore: number; gaps: { gap: string; severity: "CRITICAL" | "HIGH" | "MEDIUM"; impact: string; recommendation: string }[]; keyHiresToMake: { role: string; priority: "IMMEDIATE" | "NEXT_6M" | "NEXT_12M"; rationale: string }[] };
  cofounderDynamics: { foundersCount: number; equitySplit: string; equitySplitAssessment: "healthy" | "concerning" | "red_flag" | "unknown"; vestingInPlace: boolean; workingHistoryTogether: { duration: string; context: string; assessment: string }; relationshipStrength: "strong" | "moderate" | "weak" | "unknown"; potentialConflicts: string[]; soloFounderRisk?: string; decisionMaking?: { primaryDecisionMaker: string; decisionProcess: string; conflictResolutionHistory: string; vetoRights: string; riskIfDisagreement: string } };
  referenceCheckTemplate?: { whoToCall: { name: string; relationship: string; contactMethod: string; priority: "CRITICAL" | "HIGH" | "MEDIUM" }[]; scriptTemplate: { introduction: string; questions: { question: string; whatToLookFor: string; redFlagAnswer: string }[]; closingQuestion: string }; minimumReferencesNeeded: number; founderSpecificQuestions: { founderName: string; specificQuestions: string[] }[] };
  networkAnalysis: { overallNetworkStrength: "strong" | "moderate" | "weak"; notableConnections: { name: string; relevance: string; type: "investor" | "advisor" | "industry_expert" | "potential_customer" | "other" }[]; advisors: { name: string; role: string; relevance: string; credibilityScore: number }[]; investorRelationships: string[]; industryConnections: string[] };
  benchmarkComparison: { vsSuccessfulFounders: string; percentileInSector: number; similarSuccessfulTeams: { company: string; similarity: string; outcome: string }[] };
}

export interface TeamInvestigatorData {
  meta: AgentMeta; score: AgentScore; findings: TeamInvestigatorFindings;
  dbCrossReference: DbCrossReference; redFlags: AgentRedFlag[]; questions: AgentQuestion[];
  alertSignal: AgentAlertSignal; narrative: AgentNarrative;
}

export interface TeamInvestigatorResult extends AgentResult {
  agentName: "team-investigator"; data: TeamInvestigatorData;
}

// ============================================================================
// TECHNICAL DD AGENTS
// ============================================================================

export interface TechStackAnalysis { frontend: { technologies: string[]; assessment: string; modernityScore: number }; backend: { technologies: string[]; languages: string[]; frameworks: string[]; assessment: string; modernityScore: number }; infrastructure: { cloud: string; containerization: boolean; orchestration?: string; cicd?: string; assessment: string }; databases: { primary: string; secondary?: string[]; appropriateness: string }; thirdPartyDependencies: { critical: { name: string; risk: string; alternative?: string }[]; vendorLockIn: "LOW" | "MEDIUM" | "HIGH"; assessment: string }; overallAssessment: "MODERN" | "ADEQUATE" | "OUTDATED" | "CONCERNING"; stackAppropriatenessForUseCase: string }

export interface ScalabilityAnalysis { currentArchitecture: "monolith" | "modular_monolith" | "microservices" | "serverless" | "hybrid" | "unknown"; currentCapacity: { estimatedUsers: string; estimatedRequests: string; dataVolume: string }; bottlenecks: { component: string; issue: string; severity: "CRITICAL" | "HIGH" | "MEDIUM"; estimatedCostToFix: string }[]; scalingStrategy: { horizontal: boolean; vertical: boolean; autoScaling: boolean; assessment: string }; readinessForGrowth: { x10: { ready: boolean; blockers: string[] }; x100: { ready: boolean; blockers: string[] } }; scalabilityScore: number }

export interface TechnicalDebtAnalysis { level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; indicators: { indicator: string; evidence: string; severity: "HIGH" | "MEDIUM" | "LOW" }[]; estimatedCost: { toFix: string; ifIgnored: string; timeline: string }; codeQuality: { testCoverage: string; documentation: "NONE" | "POOR" | "ADEQUATE" | "GOOD"; codeReview: boolean; assessment: string }; debtSources: { source: string; impact: string; recommendation: string }[] }

export interface ProductMaturityAnalysis { stage: "concept" | "prototype" | "mvp" | "beta" | "production" | "scale"; stageEvidence: string; stability: { score: number; incidentFrequency: string; uptimeEstimate: string; assessment: string }; featureCompleteness: { score: number; coreFeatures: { feature: string; status: "complete" | "partial" | "missing" }[]; roadmapClarity: string }; releaseVelocity: { frequency: string; assessment: string; concern?: string } }

export interface TechTeamCapability { teamSize: { current: number; breakdown: { role: string; count: number }[] }; seniorityLevel: { assessment: "JUNIOR" | "MID" | "SENIOR" | "MIXED" | "UNKNOWN"; evidence: string }; gaps: { gap: string; severity: "CRITICAL" | "HIGH" | "MEDIUM"; impact: string; recommendation: string }[]; keyPersonRisk: { exists: boolean; persons: string[]; mitigation: string }; hiringNeeds: { role: string; priority: "IMMEDIATE" | "NEXT_6M" | "NEXT_12M"; rationale: string }[]; overallCapabilityScore: number }

export interface SecurityAnalysis { posture: "POOR" | "BASIC" | "GOOD" | "EXCELLENT" | "UNKNOWN"; compliance: { gdpr: "COMPLIANT" | "PARTIAL" | "NON_COMPLIANT" | "NOT_APPLICABLE" | "UNKNOWN"; soc2: "CERTIFIED" | "IN_PROGRESS" | "NOT_STARTED" | "NOT_APPLICABLE" | "UNKNOWN"; other: string[] }; practices: { practice: string; status: "YES" | "NO" | "PARTIAL" | "UNKNOWN" }[]; vulnerabilities: { area: string; severity: "CRITICAL" | "HIGH" | "MEDIUM"; description: string }[]; assessment: string; securityScore: number }

export interface TechIPAnalysis { patents: { granted: number; pending: number; domains: string[]; strategicValue: string }; tradeSecrets: { exists: boolean; protected: boolean; description: string }; openSourceRisk: { level: "NONE" | "LOW" | "MEDIUM" | "HIGH"; licenses: string[]; concerns: string[] }; proprietaryTech: { exists: boolean; description: string; defensibility: string }; ipScore: number }

export interface TechnicalDDFindings { techStack: TechStackAnalysis; scalability: ScalabilityAnalysis; technicalDebt: TechnicalDebtAnalysis; productMaturity: ProductMaturityAnalysis; teamCapability: TechTeamCapability; security: SecurityAnalysis; ipProtection: TechIPAnalysis; technicalRisks: { id: string; risk: string; category: "architecture" | "scalability" | "security" | "team" | "dependency" | "debt" | "other"; severity: "CRITICAL" | "HIGH" | "MEDIUM"; probability: "HIGH" | "MEDIUM" | "LOW"; impact: string; mitigation: string; estimatedCostToMitigate: string; timelineToMitigate: string }[]; sectorBenchmark: { stackVsSector: string; maturityVsSector: string; teamSizeVsSector: string; overallPosition: "ABOVE_AVERAGE" | "AVERAGE" | "BELOW_AVERAGE" } }

export interface TechnicalDDData { meta: AgentMeta; score: AgentScore; findings: TechnicalDDFindings; dbCrossReference: DbCrossReference; redFlags: AgentRedFlag[]; questions: AgentQuestion[]; alertSignal: AgentAlertSignal; narrative: AgentNarrative }
export interface TechnicalDDResult extends AgentResult { agentName: "technical-dd"; data: TechnicalDDData }

export interface TechStackDDFindings { techStack: TechStackAnalysis; scalability: ScalabilityAnalysis; technicalDebt: TechnicalDebtAnalysis; technicalRisks: { id: string; risk: string; category: "architecture" | "scalability" | "dependency" | "debt"; severity: "CRITICAL" | "HIGH" | "MEDIUM"; probability: "HIGH" | "MEDIUM" | "LOW"; impact: string; mitigation: string; estimatedCostToMitigate: string; timelineToMitigate: string }[]; sectorBenchmark: { stackVsSector: string; debtVsSector: string; scalabilityVsSector: string; overallPosition: "ABOVE_AVERAGE" | "AVERAGE" | "BELOW_AVERAGE" } }
export interface TechStackDDData { meta: AgentMeta; score: AgentScore; findings: TechStackDDFindings; dbCrossReference: DbCrossReference; redFlags: AgentRedFlag[]; questions: AgentQuestion[]; alertSignal: AgentAlertSignal; narrative: AgentNarrative }
export interface TechStackDDResult extends AgentResult { agentName: "tech-stack-dd"; data: TechStackDDData }

export interface TechOpsDDFindings { productMaturity: ProductMaturityAnalysis; teamCapability: TechTeamCapability; security: SecurityAnalysis; ipProtection: TechIPAnalysis; technicalRisks: { id: string; risk: string; category: "team" | "security" | "ip" | "operations"; severity: "CRITICAL" | "HIGH" | "MEDIUM"; probability: "HIGH" | "MEDIUM" | "LOW"; impact: string; mitigation: string; estimatedCostToMitigate: string; timelineToMitigate: string }[]; sectorBenchmark: { teamSize: { thisCompany: number; sectorP25: number; sectorMedian: number; sectorP75: number; percentile: string; source: string }; maturity: { thisCompany: string; sectorTypical: string; assessment: string }; security: { thisCompany: string; sectorExpected: string; assessment: string }; maturityVsSector: string; teamSizeVsSector: string; securityVsSector: string; overallPosition: "ABOVE_AVERAGE" | "AVERAGE" | "BELOW_AVERAGE" } }
export interface TechOpsDDData { meta: AgentMeta; score: AgentScore; findings: TechOpsDDFindings; dbCrossReference: DbCrossReference; redFlags: AgentRedFlag[]; questions: AgentQuestion[]; alertSignal: AgentAlertSignal; narrative: AgentNarrative }
export interface TechOpsDDResult extends AgentResult { agentName: "tech-ops-dd"; data: TechOpsDDData }

// ============================================================================
// LEGAL & REGULATORY, CAP TABLE, GTM, CUSTOMER INTEL, EXIT STRATEGIST, QUESTION MASTER
// ============================================================================

export interface ComplianceArea { area: string; status: "COMPLIANT" | "PARTIAL" | "NON_COMPLIANT" | "UNKNOWN"; requirements: string[]; gaps: string[]; risk: "HIGH" | "MEDIUM" | "LOW"; evidence: string; remediation?: { action: string; estimatedCost: string; timeline: string } }
export interface IPStatusAnalysis { patents: { count: number; status: "granted" | "pending" | "none" | "unknown"; value: string; domains: string[]; risks: string[] }; trademarks: { count: number; status: "registered" | "pending" | "none" | "unknown"; territories: string[]; conflicts: string[] }; tradeSecrets: { protected: boolean; measures: string[]; risks: string[] }; copyrights: { openSourceRisk: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN"; licenses: string[]; concerns: string[] }; overallIPStrength: number; ipVerdict: string }
export interface RegulatoryRisk { id: string; risk: string; regulation: string; probability: "HIGH" | "MEDIUM" | "LOW"; impact: string; timeline: string; mitigation: string; estimatedCost: string; precedent?: string }
export interface LegalStructureAnalysis { entityType: string; jurisdiction: string; appropriateness: "APPROPRIATE" | "SUBOPTIMAL" | "CONCERNING" | "UNKNOWN"; concerns: string[]; recommendations: string[]; vestingInPlace: boolean; vestingDetails?: string; shareholderAgreement: "YES" | "NO" | "UNKNOWN"; shareholderConcerns: string[] }
export interface ContractualRisksAnalysis { keyContracts: { type: string; parties: string; concerns: string[]; risk: "HIGH" | "MEDIUM" | "LOW" }[]; customerConcentration: { exists: boolean; topCustomerPercent?: number; risk: string }; vendorDependencies: { vendor: string; criticality: "HIGH" | "MEDIUM" | "LOW"; alternatives: string }[]; concerningClauses: string[] }
export interface LitigationRiskAnalysis { currentLitigation: boolean; currentLitigationDetails?: string[]; potentialClaims: { area: string; probability: "HIGH" | "MEDIUM" | "LOW"; potentialExposure: string }[]; founderDisputes: { exists: boolean; details?: string; severity?: "CRITICAL" | "HIGH" | "MEDIUM" }; riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" }
export interface SectorRegulatoryPrecedent { company: string; issue: string; outcome: string; relevance: string; source: string }
export interface LegalRegulatoryFindings { structureAnalysis: LegalStructureAnalysis; compliance: ComplianceArea[]; ipStatus: IPStatusAnalysis; regulatoryRisks: RegulatoryRisk[]; contractualRisks: ContractualRisksAnalysis; litigationRisk: LitigationRiskAnalysis; sectorPrecedents: { issues: SectorRegulatoryPrecedent[]; structureNorms: { typicalStructure: string; comparisonVerdict: string } }; upcomingRegulations: { regulation: string; effectiveDate: string; impact: "HIGH" | "MEDIUM" | "LOW"; preparedness: "READY" | "IN_PROGRESS" | "NOT_STARTED" | "UNKNOWN"; action: string }[] }
export interface LegalRegulatoryData { meta: AgentMeta; score: AgentScore; findings: LegalRegulatoryFindings; dbCrossReference: DbCrossReference; redFlags: AgentRedFlag[]; questions: AgentQuestion[]; alertSignal: AgentAlertSignal; narrative: AgentNarrative }
export interface LegalRegulatoryResult extends AgentResult { agentName: "legal-regulatory"; data: LegalRegulatoryData }

export interface CapTableAuditData { ownershipBreakdown: { founders: number; employees: number; investors: number; optionPool: number; other: number }; founderDilution: { currentFounderOwnership: number; projectedPostRound: number; atSeriesA?: number; atSeriesB?: number; concern: "none" | "moderate" | "significant" }; investorAnalysis: { existingInvestors: { name: string; ownership: number; reputation: "unknown" | "low" | "medium" | "high" | "top_tier"; signalValue: string }[]; leadInvestorPresent: boolean; followOnCapacity: string }; roundTerms: { preMoneyValuation?: number; roundSize?: number; dilution: number; proRataRights: boolean; liquidationPreference: string; antiDilution: string; participatingPreferred: boolean; concerns: string[] }; optionPoolAnalysis: { currentSize: number; adequacy: "insufficient" | "adequate" | "generous"; refreshNeeded: boolean }; structuralRedFlags: string[]; capTableScore: number }
export interface CapTableAuditResult extends AgentResult { agentName: "cap-table-auditor"; data: CapTableAuditData }

export interface GTMChannelAnalysis { id: string; channel: string; type: "organic" | "paid" | "sales" | "partnership" | "referral" | "viral"; contribution: { revenuePercent?: number; customerPercent?: number; source: string }; economics: { cac?: number; cacCalculation?: string; cacPaybackMonths?: number; ltv?: number; ltvCacRatio?: number; benchmarkCac?: { sectorMedian: number; percentile: number; source: string } }; efficiency: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN"; efficiencyRationale: string; scalability: { level: "HIGH" | "MEDIUM" | "LOW"; constraints: string[]; investmentRequired: string }; risks: string[]; verdict: string }
export interface GTMSalesMotionAnalysis { type: "PLG" | "SALES_LED" | "HYBRID" | "COMMUNITY_LED" | "UNCLEAR"; typeEvidence: string; appropriateness: { verdict: "APPROPRIATE" | "QUESTIONABLE" | "INAPPROPRIATE"; rationale: string; benchmark: string }; salesCycle: { length?: number; benchmark?: number; assessment: string }; acv: { value?: number; benchmark?: number; assessment: string }; winRate?: { value: number; benchmark?: number; assessment: string }; pipelineCoverage?: { value: number; target: number; assessment: string }; bottlenecks: { bottleneck: string; impact: "CRITICAL" | "HIGH" | "MEDIUM"; recommendation: string }[]; magicNumber?: { value: number; interpretation: string } }
export interface GTMExpansionAnalysis { currentGrowthRate: { value?: number; period: string; source: string; sustainability: "SUSTAINABLE" | "QUESTIONABLE" | "UNSUSTAINABLE"; sustainabilityRationale: string }; expansion: { strategy: string; markets: { market: string; status: "current" | "planned" | "potential"; timeline?: string; rationale: string }[]; risks: string[]; feasibilityAssessment: string }; growthLevers: { lever: string; potential: "HIGH" | "MEDIUM" | "LOW"; prerequisite: string; timeline: string }[]; scalingConstraints: { constraint: string; severity: "CRITICAL" | "HIGH" | "MEDIUM"; mitigation: string }[] }
export interface GTMCompetitorPattern { company: string; channel: string; success: "HIGH" | "MEDIUM" | "LOW"; insight: string; source: string }
export interface GTMCacBenchmark { sector: string; stage: string; p25: number; median: number; p75: number; source: string; thisDeal?: { cac: number; percentile: number } }
export interface GTMAnalystFindings { channels: GTMChannelAnalysis[]; channelSummary: { primaryChannel: string; channelDiversification: "GOOD" | "MODERATE" | "POOR"; diversificationRationale: string; overallChannelHealth: number }; salesMotion: GTMSalesMotionAnalysis; expansion: GTMExpansionAnalysis; competitorPatterns: { patterns: GTMCompetitorPattern[]; insight: string; gapsVsCompetitors: string[]; advantagesVsCompetitors: string[] }; cacBenchmark: GTMCacBenchmark; unitEconomics: { overall: "HEALTHY" | "ACCEPTABLE" | "CONCERNING" | "UNKNOWN"; rationale: string; keyMetrics: { metric: string; value?: number; benchmark?: number; assessment: string }[] }; deckClaimsAnalysis: { claim: string; location: string; status: "VERIFIED" | "CONTRADICTED" | "EXAGGERATED" | "NOT_VERIFIABLE"; evidence: string; investorImplication: string }[] }
export interface GTMAnalystData { meta: AgentMeta; score: AgentScore; findings: GTMAnalystFindings; dbCrossReference: DbCrossReference; redFlags: AgentRedFlag[]; questions: AgentQuestion[]; alertSignal: AgentAlertSignal; narrative: AgentNarrative }
export interface GTMAnalystResult extends AgentResult { agentName: "gtm-analyst"; data: GTMAnalystData }

export interface CustomerAnalysis { id: string; name: string; type: "enterprise" | "mid_market" | "smb" | "startup" | "unknown"; verified: boolean; verificationSource?: string; relationship: { status: "active" | "pilot" | "churned" | "prospect" | "unknown"; since?: string; contractType?: "subscription" | "one_time" | "usage_based" | "unknown"; dealSize?: "enterprise" | "mid" | "small" | "unknown"; revenueContribution?: number }; satisfaction: { isReference: boolean; hasTestimonial: boolean; hasExpanded: boolean; hasReferred: boolean; publicEndorsement?: string }; risks: string[] }
export interface CustomerClaimValidation { id: string; claim: string; location: string; claimType: "customer_count" | "logo" | "testimonial" | "metric" | "pmf_signal"; status: "VERIFIED" | "UNVERIFIED" | "EXAGGERATED" | "MISLEADING"; evidence: string; investorImplication: string }
export interface RetentionAnalysis { nrr: { reported?: number; source: string; benchmarkP25: number; benchmarkMedian: number; benchmarkP75: number; percentile?: number; verdict: "EXCELLENT" | "GOOD" | "CONCERNING" | "CRITICAL" | "UNKNOWN"; calculation?: string }; grossRetention: { reported?: number; churnRate?: number; source: string; benchmarkMedian: number; verdict: "EXCELLENT" | "GOOD" | "CONCERNING" | "CRITICAL" | "UNKNOWN" }; cohortTrends: { trend: "IMPROVING" | "STABLE" | "DECLINING" | "UNKNOWN"; evidence: string; concern?: string }; dataQuality: { timespan: string; cohortCount: string; reliability: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN"; limitations: string[] } }
export interface PMFAnalysis { pmfScore: number; pmfVerdict: "STRONG" | "EMERGING" | "WEAK" | "NOT_DEMONSTRATED"; pmfJustification: string; positiveSignals: { signal: string; evidence: string; source: string; strength: "STRONG" | "MODERATE" | "WEAK" }[]; negativeSignals: { signal: string; evidence: string; source: string; severity: "CRITICAL" | "HIGH" | "MEDIUM" }[]; pmfTests: { test: string; result: "PASS" | "FAIL" | "PARTIAL" | "NOT_TESTABLE"; evidence: string; dataCollectionProtocol?: { dataNeeded: string; howToRequest: string; questionForFounder: string; acceptableFormats: string[]; redFlagIfRefused: string; estimatedTimeToCollect: string; alternativeProxy?: string } }[] }
export interface ConcentrationAnalysis { topCustomerRevenue: number; top3CustomersRevenue: number; top10CustomersRevenue: number; concentrationLevel: "CRITICAL" | "HIGH" | "MODERATE" | "HEALTHY"; concentrationRationale: string; atRiskRevenue: { customerId: string; customerName: string; revenueAtRisk: number; riskReason: string; probability: "HIGH" | "MEDIUM" | "LOW" }[]; diversificationTrend: "IMPROVING" | "STABLE" | "WORSENING" | "UNKNOWN"; trendEvidence: string }
export interface ExpansionAnalysis { upsell: { potential: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN"; mechanisms: string[]; evidence: string; blockers: string[] }; crossSell: { potential: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN"; opportunities: string[]; evidence: string }; virality: { coefficient?: number; mechanism: string; evidence: string; verdict: "STRONG" | "MODERATE" | "WEAK" | "NONE" }; landAndExpand: { strategy: string; successRate?: number; averageExpansion?: number; evidence: string } }
export interface CustomerIntelFindings { icp: { description: string; segments: string[]; verticals: string[]; companySize: string; buyerPersona: string; icpClarity: "CLEAR" | "PARTIAL" | "UNCLEAR" }; customerBase: { totalCustomers?: number; payingCustomers?: number; activeUsers?: number; customerQuality: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN"; qualityJustification: string; notableCustomers: CustomerAnalysis[]; customersMissedInDeck: string[] }; claimsValidation: CustomerClaimValidation[]; retention: RetentionAnalysis; pmf: PMFAnalysis; concentration: ConcentrationAnalysis; expansion: ExpansionAnalysis; benchmark?: { vsMedianNRR: string; vsMedianChurn: string; vsMedianPMFScore: string; percentileOverall: number; comparableDeals: { name: string; nrr?: number; churn?: number; pmfStrength: string; outcome: string }[] } }
export interface CustomerIntelData { meta: AgentMeta; score: AgentScore; findings: CustomerIntelFindings; dbCrossReference: DbCrossReference; redFlags: AgentRedFlag[]; questions: AgentQuestion[]; alertSignal: AgentAlertSignal; narrative: AgentNarrative }
export interface CustomerIntelResult extends AgentResult { agentName: "customer-intel"; data: CustomerIntelData }

export interface ExitScenario { id: string; type: "acquisition_strategic" | "acquisition_pe" | "ipo" | "secondary" | "acquihire" | "failure"; name: string; description: string; probability: { level: "HIGH" | "MEDIUM" | "LOW" | "VERY_LOW"; percentage: number; rationale: string; basedOn: string }; timeline: { estimatedYears: number; range: string; milestones: string[]; assumptions: string[] }; exitValuation: { estimated: number; range: { min: number; max: number }; methodology: string; multipleUsed: number; multipleSource: string; calculation: string }; potentialBuyers?: { name: string; type: "strategic" | "pe" | "corporate_vc"; rationale: string; recentAcquisitions?: string[]; likelihoodToBuy: "HIGH" | "MEDIUM" | "LOW" }[]; investorReturn: { initialInvestment: number; ownershipAtEntry: number; dilutionToExit: number; dilutionCalculation: string; ownershipAtExit: number; grossProceeds: number; proceedsCalculation: string; multiple: number; irr: number; irrCalculation: string } }
export interface ComparableExit { id: string; target: string; acquirer: string; year: number; sector: string; stage: string; exitValue: number; revenueAtExit?: number; arrAtExit?: number; multipleRevenue?: number; multipleArr?: number; multipleEbitda?: number; source: string; sourceUrl?: string; relevance: { score: number; similarities: string[]; differences: string[] } }
export interface MnAMarketAnalysis { sectorName: string; period: string; activity: { totalDeals: number; totalValue: number; trend: "HEATING" | "STABLE" | "COOLING"; trendRationale: string }; multiples: { revenueMultiple: { p25: number; median: number; p75: number }; arrMultiple?: { p25: number; median: number; p75: number }; ebitdaMultiple?: { p25: number; median: number; p75: number }; source: string }; activeBuyers: { name: string; type: string; recentDeals: number; focusAreas: string[] }[]; exitWindow: { assessment: "EXCELLENT" | "GOOD" | "NEUTRAL" | "POOR" | "CLOSED"; rationale: string; timeRemaining: string } }
export interface LiquidityRisk { id: string; risk: string; category: "market" | "company" | "structural" | "timing" | "dilution"; severity: "CRITICAL" | "HIGH" | "MEDIUM"; probability: "HIGH" | "MEDIUM" | "LOW"; impact: string; mitigation?: string; questionToAsk: string }
export interface ExitStrategistFindings { scenarios: ExitScenario[]; comparableExits: ComparableExit[]; mnaMarket: MnAMarketAnalysis; liquidityAnalysis: { overallLiquidity: "HIGH" | "MEDIUM" | "LOW" | "VERY_LOW"; rationale: string; risks: LiquidityRisk[]; timeToLiquidity: { bestCase: string; baseCase: string; worstCase: string } }; deckClaimsAnalysis: { claimsFound: { claim: string; location: string; status: "VERIFIED" | "EXAGGERATED" | "UNREALISTIC" | "NOT_VERIFIABLE"; evidence: string }[]; deckRealism: "REALISTIC" | "OPTIMISTIC" | "VERY_OPTIMISTIC" | "UNREALISTIC"; deckRealismRationale: string }; returnSummary: { expectedCase: { scenario: string; probability: number; multiple: number; irr: number }; upside: { scenario: string; probability: number; multiple: number; irr: number }; downside: { scenario: string; probability: number; multiple: number; irr: number }; probabilityWeightedReturn: { expectedMultiple: number; calculation: string } } }
export interface ExitStrategistData { meta: AgentMeta; score: AgentScore; findings: ExitStrategistFindings; dbCrossReference: DbCrossReference; redFlags: AgentRedFlag[]; questions: AgentQuestion[]; alertSignal: AgentAlertSignal; narrative: AgentNarrative }
export interface ExitStrategistResult extends AgentResult { agentName: "exit-strategist"; data: ExitStrategistData }

// ============================================================================
// QUESTION MASTER AGENT
// ============================================================================

export interface FounderQuestion { id: string; priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"; category: "vision" | "execution" | "team" | "market" | "financials" | "tech" | "legal" | "risk" | "exit"; question: string; context: { sourceAgent: string; redFlagId?: string; triggerData: string; whyItMatters: string }; evaluation: { goodAnswer: string; badAnswer: string; redFlagIfBadAnswer: string; followUpIfBad: string }; timing: "first_meeting" | "second_meeting" | "dd_phase" | "pre_term_sheet" }
export interface ReferenceCheck { id: string; targetType: "customer" | "former_employee" | "co_investor" | "industry_expert" | "former_board_member" | "former_cofounder"; priority: "CRITICAL" | "HIGH" | "MEDIUM"; targetProfile: { description: string; idealPerson?: string; howToFind: string }; questions: { question: string; whatToLookFor: string; redFlagAnswer: string }[]; rationale: string; linkedToRedFlag?: string }
export interface DiligenceChecklistItem { id: string; category: "documents" | "financials" | "legal" | "tech" | "team" | "market" | "customers" | "competitors"; item: string; description: string; status: "NOT_DONE" | "PARTIAL" | "DONE" | "BLOCKED" | "NOT_APPLICABLE"; criticalPath: boolean; blockingForDecision: boolean; responsibleParty: "founder" | "ba" | "third_party"; estimatedEffort: "quick" | "moderate" | "significant"; documentsNeeded: string[]; deadline?: string; blockerDetails?: string }
export interface NegotiationPoint { id: string; priority: "HIGH_LEVERAGE" | "MEDIUM_LEVERAGE" | "NICE_TO_HAVE"; category: "valuation" | "terms" | "governance" | "information_rights" | "pro_rata" | "vesting" | "other"; point: string; leverage: { argument: string; evidence: string; sourceAgent: string }; suggestedApproach: string; fallbackPosition: string; walkAwayPoint: string; estimatedImpact?: { description: string; valueRange: string } }

/** Dealbreaker identifie */
export interface Dealbreaker { id: string; severity: "ABSOLUTE" | "CONDITIONAL"; condition: string; description: string; sourceAgent: string; linkedRedFlags: string[]; resolvable: boolean; resolutionPath?: string; timeToResolve?: string; riskIfIgnored: string }
/** CriticalQuestion — alias for Dealbreaker (renamed for clarity) */
export type CriticalQuestion = Dealbreaker;

export interface AgentFindingsSummary { agentName: string; score: number; grade: "A" | "B" | "C" | "D" | "F"; criticalRedFlagsCount: number; highRedFlagsCount: number; topConcerns: string[]; topStrengths: string[]; questionsGenerated: number }

export interface QuestionMasterFindings { founderQuestions: FounderQuestion[]; referenceChecks: ReferenceCheck[]; diligenceChecklist: { totalItems: number; doneItems: number; blockedItems: number; criticalPathItems: number; items: DiligenceChecklistItem[] }; negotiationPoints: NegotiationPoint[]; criticalQuestions: CriticalQuestion[]; /** @deprecated Use criticalQuestions */ dealbreakers: Dealbreaker[]; tier1Summary: { agentsAnalyzed: AgentFindingsSummary[]; totalCriticalRedFlags: number; totalHighRedFlags: number; overallReadiness: "READY_TO_INVEST" | "NEEDS_MORE_DD" | "SIGNIFICANT_CONCERNS" | "DO_NOT_PROCEED"; readinessRationale: string }; topPriorities: { priority: number; action: string; rationale: string; deadline: string }[]; suggestedTimeline: { phase: string; duration: string; activities: string[]; deliverables: string[] }[] }
export interface QuestionMasterData { meta: AgentMeta; score: AgentScore; findings: QuestionMasterFindings; dbCrossReference: DbCrossReference; redFlags: AgentRedFlag[]; questions: AgentQuestion[]; alertSignal: AgentAlertSignal; narrative: AgentNarrative }
export interface QuestionMasterResult extends AgentResult { agentName: "question-master"; data: QuestionMasterData }
