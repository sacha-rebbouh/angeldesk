/**
 * Tier 3 Sector Expert Types
 * Dynamic agents activated based on deal sector
 */

import type { AgentResult } from "../types";

// Sector categories and their matching patterns
// Extended to cover more industries with intelligent mapping
export const SECTOR_MAPPINGS: Record<SectorExpertType, string[]> = {
  "saas-expert": ["SaaS", "SaaS B2B", "SaaS B2C", "B2B Software", "Enterprise Software", "Software"],
  "legaltech-expert": ["LegalTech", "Legal Tech", "Law Tech", "Legal Software", "CLM", "Contract Lifecycle Management", "Legal Practice Management", "Legal Research", "E-Discovery", "eDiscovery", "Legal AI", "Legal Marketplace", "Legal Ops", "RegTech"],
  "hrtech-expert": ["HRTech", "HR Tech", "HR Software", "Human Resources", "Human Resources Technology", "People Tech", "Talent Tech", "Workforce", "Workforce Management", "WFM", "Payroll", "Payroll Software", "HRIS", "HCM", "Human Capital Management", "ATS", "Applicant Tracking", "Recruiting", "Recruitment", "Recruiting Software", "Talent Management", "Talent Acquisition", "Benefits Administration", "Benefits Tech", "Employee Engagement", "Performance Management", "L&D", "Learning & Development", "Compensation", "Comp Tech", "PEO", "EOR", "Employer of Record"],
  "marketplace-expert": ["Marketplace", "Platform", "Two-sided"],
  "fintech-expert": ["FinTech", "Payments", "Banking", "Insurance", "InsurTech", "Lending", "WealthTech", "Neobank"],
  "healthtech-expert": ["HealthTech", "MedTech", "Healthcare", "Digital Health", "FemTech", "Mental Health", "Telehealth"],
  "biotech-expert": ["BioTech", "Biotech", "Life Sciences", "Pharma", "Drug Discovery", "Therapeutics", "Biopharma", "Gene Therapy", "Cell Therapy", "Biologics", "Pharmaceuticals", "Oncology", "Immunotherapy"],
  "ai-expert": ["AI", "AI/ML", "AI / Machine Learning", "ML", "Machine Learning", "LLM", "GenAI", "Generative AI", "NLP", "Computer Vision", "Deep Learning", "MLOps"],
  "deeptech-expert": ["DeepTech", "Quantum", "Blockchain / Web3", "Blockchain", "Web3"],
  "climate-expert": ["CleanTech", "Climate", "Energy", "Sustainability", "GreenTech"],
  "hardware-expert": ["Hardware", "Hardware / IoT", "IoT", "Robotics", "Manufacturing", "Industrial", "Drones"],
  "spacetech-expert": ["SpaceTech", "Space Tech", "Space", "Aerospace", "NewSpace", "New Space", "Satellite", "Satellites", "Launch", "Launcher", "Rocket", "Earth Observation", "EO", "LEO", "GEO", "Constellation", "Space Infrastructure", "In-space", "Orbital"],
  "gaming-expert": ["Gaming", "Gaming / Esports", "Esports", "Metaverse", "VR", "AR", "Entertainment", "Media Tech"],
  "consumer-expert": ["Consumer", "D2C", "Social", "E-commerce", "Retail", "Lifestyle"],
  "proptech-expert": ["PropTech", "Prop Tech", "Real Estate Tech", "Real Estate", "Construction Tech", "ConTech", "Mortgage Tech", "CRE Tech", "Commercial Real Estate", "Co-working", "Coworking", "Smart Building"],
  "edtech-expert": ["EdTech", "Ed Tech", "Education", "Education Technology", "E-Learning", "Online Learning", "Learning Platform", "Corporate Learning", "L&D", "K-12", "Higher Ed"],
  "foodtech-expert": ["FoodTech", "Food Tech", "Food", "F&B", "AgTech", "AgriTech", "Alt Protein", "Alternative Protein", "Meal Kit", "Dark Kitchen", "Ghost Kitchen", "Vertical Farming", "Plant-Based", "CPG Food", "Food & Beverage"],
  "mobility-expert": ["Mobility", "Transportation", "Logistics", "Ridesharing", "Rideshare", "Micromobility", "Fleet", "Fleet Management", "Delivery", "Last-mile", "Last Mile", "MaaS", "Mobility as a Service", "Transit", "Freight", "Trucking", "Shipping", "Supply Chain"],
  "cybersecurity-expert": ["Cybersecurity", "Cyber", "InfoSec", "Information Security", "Security Software", "Network Security", "Endpoint Security", "Cloud Security", "Application Security", "AppSec", "DevSecOps", "Security", "SIEM", "SOAR", "XDR", "EDR", "IAM", "Identity", "Zero Trust", "Threat Intelligence", "Vulnerability Management", "MSSP", "SOC"],
  "creator-expert": ["Creator Economy", "Creator", "Media", "Content", "Influencer", "Influencer Marketing", "Social Media", "Podcasting", "Podcast", "Newsletter", "Streaming", "UGC", "User Generated Content", "Creator Tools", "Creator Platform", "Patreon", "Substack", "YouTube", "TikTok", "Twitch", "OnlyFans", "Talent Management", "MCN", "Multi-Channel Network", "Digital Media", "Media Tech"],
  // general-expert has no patterns - it's the fallback for unmatched sectors
  "general-expert": [],
};

export type SectorExpertType =
  | "saas-expert"
  | "legaltech-expert"
  | "hrtech-expert"
  | "marketplace-expert"
  | "fintech-expert"
  | "healthtech-expert"
  | "biotech-expert"
  | "ai-expert"
  | "deeptech-expert"
  | "climate-expert"
  | "hardware-expert"
  | "spacetech-expert"
  | "gaming-expert"
  | "consumer-expert"
  | "proptech-expert"
  | "edtech-expert"
  | "foodtech-expert"
  | "mobility-expert"
  | "cybersecurity-expert"
  | "creator-expert"
  | "general-expert"; // Fallback for sectors not covered by specialized experts

// Sector expert analysis data
export interface SectorExpertData {
  sectorName: string;
  sectorMaturity: "emerging" | "growing" | "mature" | "declining";

  // Sector-specific metrics evaluation
  keyMetrics: {
    metricName: string;
    value: number | string | null;
    sectorBenchmark: {
      p25: number;
      median: number;
      p75: number;
      topDecile: number;
    };
    assessment: "exceptional" | "above_average" | "average" | "below_average" | "concerning";
    sectorContext: string; // Why this matters in this sector
  }[];

  // Sector-specific red flags
  sectorRedFlags: {
    flag: string;
    severity: "critical" | "major" | "minor";
    sectorReason: string; // Why this is a red flag specifically in this sector
  }[];

  // Sector-specific opportunities
  sectorOpportunities: {
    opportunity: string;
    potential: "high" | "medium" | "low";
    reasoning: string;
  }[];

  // Regulatory environment
  regulatoryEnvironment: {
    complexity: "low" | "medium" | "high" | "very_high";
    keyRegulations: string[];
    complianceRisks: string[];
    upcomingChanges: string[];
  };

  // Competitive dynamics in sector
  sectorDynamics: {
    competitionIntensity: "low" | "medium" | "high" | "intense";
    consolidationTrend: "fragmenting" | "stable" | "consolidating";
    barrierToEntry: "low" | "medium" | "high";
    typicalExitMultiple: number;
    recentExits: string[];
  };

  // Sector-specific due diligence questions
  sectorQuestions: {
    question: string;
    category: "technical" | "business" | "regulatory" | "competitive";
    priority: "must_ask" | "should_ask" | "nice_to_have";
    expectedAnswer: string;
    redFlagAnswer: string;
  }[];

  // Investment thesis fit
  sectorFit: {
    score: number; // 0-100
    strengths: string[];
    weaknesses: string[];
    sectorTiming: "early" | "optimal" | "late";
  };

  // Overall sector score
  sectorScore: number; // 0-100

  // Executive summary
  executiveSummary: string;
}

export interface SectorExpertResult extends AgentResult {
  agentName: SectorExpertType;
  data: SectorExpertData;
  /** Extended data from refactored agents - contains full richness */
  _extended?: ExtendedSectorData;
}

// =============================================================================
// EXTENDED SECTOR DATA (Rich output from refactored agents)
// =============================================================================

/** Extended data captured from refactored sector experts */
export interface ExtendedSectorData {
  // Common to all experts
  subSector?: {
    primary: string;
    secondary?: string[];
    rationale: string;
  };

  // Unit Economics (SaaS, Fintech)
  unitEconomics?: {
    // SaaS specific
    ltv?: { value: number | null; calculation: string; confidence: string };
    cac?: { value: number | null; calculation: string; confidence: string };
    ltvCacRatio?: { value: number | null; assessment: string; vsMedian: string };
    cacPaybackMonths?: { value: number | null; assessment: string; runway: string };
    burnMultiple?: { value: number | null; assessment: string };
    magicNumber?: { value: number | null; assessment: string };
    // Fintech specific
    revenuePerTransaction?: { value?: number; calculation?: string; benchmark: number; verdict: string };
    contributionMargin?: { value?: number; calculation?: string; benchmark: number; verdict: string };
    lossReserveRatio?: { value?: number; calculation?: string; benchmark: number; verdict: string };
    overallAssessment?: string;
  };

  // Valuation Analysis (SaaS)
  valuationAnalysis?: {
    askMultiple: number;
    medianSectorMultiple: number;
    percentilePosition: number;
    justifiedRange: { low: number; fair: number; high: number };
    verdict: "attractive" | "fair" | "stretched" | "excessive";
    negotiationLeverage: string;
  };

  // DB Comparison
  dbComparison?: {
    similarDealsFound: number;
    thisDealsPosition: string;
    bestComparable?: { name: string; similarity: string; outcome: string };
    concerningComparable?: { name: string; similarity: string; whatHappened: string };
  };

  // Score Breakdown
  scoreBreakdown?: {
    // SaaS
    unitEconomics?: number;
    growth?: number;
    retention?: number;
    gtmEfficiency?: number;
    // Fintech
    metricsScore?: number;
    regulatoryScore?: number;
    businessModelScore?: number;
    marketPositionScore?: number;
    justification?: string;
    // PropTech
    cycleResilience?: number;
    moatStrength?: number;
    growthPotential?: number;
    executionRisk?: number;
  };

  // GTM Assessment (SaaS)
  gtmAssessment?: {
    model: "sales_led" | "product_led" | "hybrid" | "unclear";
    efficiency: "efficient" | "acceptable" | "inefficient" | "unknown";
    salesCycleMonths: number | null;
    keyInsight: string;
  };

  // Cohort Health (SaaS)
  cohortHealth?: {
    dataAvailable: boolean;
    nrrTrend: "improving" | "stable" | "declining" | "unknown";
    churnTrend: "improving" | "stable" | "worsening" | "unknown";
    expansionTrend: "accelerating" | "stable" | "decelerating" | "unknown";
    concern?: string;
  };

  // Competitive Moat (SaaS)
  saasCompetitiveMoat?: {
    dataNetworkEffects: boolean;
    switchingCostLevel: "high" | "medium" | "low";
    integrationDepth: "deep" | "medium" | "shallow" | "unknown";
    categoryLeaderPotential: boolean;
    moatAssessment: string;
  };

  // Business Model Fit (Fintech)
  businessModelFit?: {
    modelType: string;
    modelViability: "proven" | "emerging" | "unproven" | "challenging";
    viabilityRationale: string;
    unitEconomicsPath: string;
    scalingChallenges: string[];
    regulatoryPathway: string;
  };

  // Regulatory Details (Fintech)
  regulatoryDetails?: {
    licenses?: Array<{
      license: string;
      status: "obtained" | "pending" | "not_applied" | "not_required" | "unknown";
      jurisdiction: string;
      risk: string;
    }>;
    overallRisk?: "low" | "medium" | "high" | "critical";
    verdict?: string;
  };

  // Big Tech Threat (Fintech)
  bigTechThreat?: {
    level: "low" | "medium" | "high" | "critical";
    players: string[];
    rationale: string;
  };

  // Exit Potential (SaaS)
  exitPotential?: {
    typicalMultiple: number;
    likelyAcquirers: string[];
    timeToExit: string;
    exitReadiness: "ready" | "needs_work" | "far";
  };

  // Verdict
  verdict?: {
    recommendation: "STRONG_FIT" | "GOOD_FIT" | "MODERATE_FIT" | "POOR_FIT" | "NOT_RECOMMENDED";
    confidence: "high" | "medium" | "low";
    keyInsight: string;
    topConcern: string;
    topStrength: string;
  };

  // Investment Implication (all sectors - mapped to common values)
  investmentImplication?:
    | "strong_saas_fundamentals"
    | "solid_with_concerns"
    | "needs_improvement"
    | "saas_model_broken"
    // Aliases for sector-specific experts (mapped at runtime)
    | "strong_fundamentals"
    | "model_broken";

  // =============================================================================
  // AI EXPERT SPECIFIC FIELDS
  // =============================================================================

  // Infrastructure & Costs (AI)
  aiInfraCosts?: {
    gpuProvider: string;
    monthlyComputeCost: number | null;
    costPerInference: number | null;
    scalingModel: "linear" | "sublinear" | "superlinear" | "unknown";
    projectedCostAtScale: number | null;
    costAssessment: string;
  };

  // Model Approach (AI)
  aiModelApproach?: {
    type: "fine_tuned" | "rag" | "from_scratch" | "api_wrapper" | "hybrid" | "unknown";
    baseModel: string | null;
    proprietaryComponents: string[];
    moatLevel: "none" | "weak" | "moderate" | "strong";
    moatRationale: string;
  };

  // Technical Depth (AI)
  aiTechnicalDepth?: {
    teamMLExperience: number | null;
    hasMLPhD: boolean;
    papersPublished: number;
    openSourceContributions: string[];
    previousAICompanies: string[];
    depthAssessment: "expert" | "competent" | "basic" | "insufficient" | "unknown";
    depthRationale: string;
  };

  // AI Metrics
  aiMetrics?: {
    modelLatency: { p50: number | null; p99: number | null };
    accuracy: { metric: string; value: number | null; benchmark: number | null; assessment: string };
    datasetSize: number | null;
    datasetQuality: "proprietary" | "licensed" | "public" | "synthetic" | "unknown";
    evaluationMethodology: "rigorous" | "basic" | "unclear" | "none";
    metricsAssessment: string;
  };

  // AI Moat & Defensibility
  aiMoat?: {
    dataFlywheel: boolean;
    networkEffects: boolean;
    switchingCosts: "high" | "medium" | "low";
    apiDependency: "none" | "partial" | "full";
    reproducibility: "easy" | "medium" | "hard";
    overallMoatScore: number;
    moatAssessment: string;
  };

  // AI Red Flags
  aiRedFlags?: {
    noMLTeam: boolean;
    justAPIWrapper: boolean;
    noProprietaryData: boolean;
    unrealisticAccuracyClaims: boolean;
    noEvaluation: boolean;
    highAPIDependency: boolean;
    redFlagSummary: string;
  };

  // AI Verdict
  aiVerdict?: {
    isRealAI: boolean;
    technicalCredibility: "high" | "medium" | "low";
    moatStrength: "strong" | "moderate" | "weak" | "none";
    scalabilityRisk: "low" | "medium" | "high";
    recommendation: "STRONG_AI_PLAY" | "SOLID_AI_PLAY" | "AI_CONCERNS" | "NOT_REAL_AI";
    keyInsight: string;
  };

  // =============================================================================
  // PROPTECH EXPERT SPECIFIC FIELDS
  // =============================================================================

  // Cycle Analysis (PropTech - CRITICAL)
  proptechCycleAnalysis?: {
    currentCyclePhase: "expansion" | "peak" | "contraction" | "trough" | "unknown";
    interestRateSensitivity: "very_high" | "high" | "medium" | "low";
    cycleRiskAssessment: string;
    worstCaseScenario: string;
    resilienceScore: number;
    hedgingStrategy?: string;
  };

  // Geographic Analysis (PropTech)
  proptechGeographicAnalysis?: {
    primaryMarkets: string[];
    marketConcentrationRisk: "low" | "medium" | "high" | "critical";
    expansionPath: string;
    localRegulationRisk: "low" | "medium" | "high" | "very_high";
    keyRegulations: string[];
  };

  // Capital Intensity (PropTech)
  proptechCapitalIntensity?: {
    level: "low" | "medium" | "high" | "very_high";
    workingCapitalNeed: string;
    inventoryRisk: "none" | "low" | "medium" | "high" | "critical";
    breakEvenTimeline: string;
    fundingRequirements: string;
  };

  // PropTech Moat
  proptechMoat?: {
    dataAdvantage: "strong" | "moderate" | "weak" | "none";
    networkEffects: "strong" | "moderate" | "weak" | "none";
    regulatoryMoat: "strong" | "moderate" | "weak" | "none";
    localLockIn: "strong" | "moderate" | "weak" | "none";
    integrationDepth: "deep" | "medium" | "shallow" | "none";
    moatAssessment: string;
  };

  // PropTech Unit Economics (segment-specific)
  proptechUnitEconomics?: {
    grossMargin: {
      value: number | null;
      calculation: string;
      assessment: string;
      segmentContext: string;
    };
    saasMetrics?: {
      arr: number | null;
      nrr: number | null;
      ltv: number | null;
      cac: number | null;
      ltvCacRatio: number | null;
      cacPaybackMonths: number | null;
      applicable: boolean;
      assessment?: string;
    };
    marketplaceMetrics?: {
      gmv: number | null;
      takeRate: number | null;
      revenuePerLead: number | null;
      leadConversionRate: number | null;
      applicable: boolean;
      assessment?: string;
    };
    iBuyingMetrics?: {
      inventoryTurnoverDays: number | null;
      grossMarginPerHome: number | null;
      holdingCostPerDay: number | null;
      serviceMargin: number | null;
      applicable: boolean;
      assessment?: string;
    };
    flexSpaceMetrics?: {
      occupancyRate: number | null;
      breakEvenOccupancy: number | null;
      revenuePerDesk: number | null;
      memberChurnMonthly: number | null;
      applicable: boolean;
      assessment?: string;
    };
    mortgageMetrics?: {
      loanVolume: number | null;
      revenuePerLoan: number | null;
      costPerLoanOriginated: number | null;
      pullThroughRate: number | null;
      daysToClose: number | null;
      applicable: boolean;
      assessment?: string;
    };
    overallHealthScore: number;
    verdict: string;
  };

  // =============================================================================
  // EDTECH EXPERT SPECIFIC FIELDS
  // =============================================================================

  // Engagement & Outcomes (EdTech - CRITICAL)
  edtechEngagement?: {
    completionRate: {
      value: number | null;
      vsIndustry: string;
      trend: "improving" | "stable" | "declining" | "unknown";
    };
    activeUsersRatio: {
      mal: number | null;
      totalEnrolled: number | null;
      ratio: number | null;
      assessment: string;
    };
    learningOutcomes: {
      hasEfficacyData: boolean;
      outcomesDescription: string;
      assessment: "proven" | "promising" | "no_data" | "concerning";
    };
    retentionCohorts: {
      dataAvailable: boolean;
      d7Retention: number | null;
      d30Retention: number | null;
      assessment: string;
    };
  };

  // Regulatory & Compliance (EdTech)
  edtechRegulatory?: {
    coppa: "compliant" | "in_progress" | "not_compliant" | "not_applicable" | "unknown";
    ferpa: "compliant" | "in_progress" | "not_compliant" | "not_applicable" | "unknown";
    accessibility: "wcag_aa" | "partial" | "not_compliant" | "unknown";
    dataPrivacy: {
      gdprReady: boolean;
      studentDataPolicy: "strong" | "adequate" | "weak" | "unknown";
    };
    riskLevel: "low" | "medium" | "high" | "critical";
    concerns: string[];
  };

  // EdTech Moat
  edtechMoat?: {
    contentDifferentiation: "proprietary" | "licensed" | "ugc" | "commodity";
    adaptiveTechnology: boolean;
    credentialValue: "industry_recognized" | "growing" | "limited" | "none";
    networkEffects: boolean;
    lmsIntegration: {
      integrated: boolean;
      platforms: string[];
    };
    switchingCosts: "high" | "medium" | "low";
    moatAssessment: string;
  };

  // =============================================================================
  // MOBILITY EXPERT SPECIFIC FIELDS
  // =============================================================================

  // Business Model (Mobility)
  businessModel?: {
    type: "asset_light_marketplace" | "asset_heavy_owned_fleet" | "hybrid" | "software_platform" | "infrastructure";
    description: string;
    capitalIntensity: "low" | "medium" | "high" | "very_high";
    capitalImplications: string;
  };

  // Supply-side Analysis (Mobility - CRITICAL)
  supplyAnalysis?: {
    supplyType: string;
    acquisitionCost: number | null;
    retention30Day: number | null;
    churnRate: number | null;
    supplyQuality: "excellent" | "good" | "average" | "concerning" | "unknown";
    supplyChallenges: string[];
    supplyVerdict: string;
  };

  // AV Disruption Risk (Mobility)
  avDisruptionRisk?: {
    level: "low" | "medium" | "high" | "critical";
    timeframe: string;
    rationale: string;
  };

  // Gig Worker Status (Mobility - CRITICAL)
  gigWorkerStatus?: {
    currentStatus: "contractor" | "employee" | "hybrid" | "unclear" | "not_applicable";
    jurisdictionalRisks: string[];
    financialImpact: string;
    mitigationStrategy: string;
  };

  // Mobility Unit Economics
  mobilityUnitEconomics?: {
    contributionMarginPerTrip: {
      value: number | null;
      calculation: string;
      benchmark: string;
      verdict: string;
    };
    takeRate: {
      value: number | null;
      calculation: string;
      benchmark: string;
      verdict: string;
    };
    utilizationRate: {
      value: number | null;
      calculation: string;
      benchmark: string;
      verdict: string;
    };
    ltvCacRatio: {
      value: number | null;
      calculation: string;
      benchmark: string;
      verdict: string;
    };
    pathToProfitability: string;
  };

  // =============================================================================
  // HRTECH EXPERT SPECIFIC FIELDS
  // =============================================================================

  // Compliance (HRTech - CRITICAL)
  hrtechCompliance?: {
    payrollCompliance: {
      status: "compliant" | "in_progress" | "not_applicable" | "unknown";
      jurisdictions: string[];
      risks: string[];
    };
    dataPrivacy: {
      gdprStatus: "compliant" | "in_progress" | "not_compliant" | "not_applicable" | "unknown";
      ccpaStatus: "compliant" | "in_progress" | "not_compliant" | "not_applicable" | "unknown";
      soc2Status: "type1" | "type2" | "in_progress" | "none" | "unknown";
      dataResidency: string[];
    };
    industrySpecific: Array<{
      regulation: string;
      status: "compliant" | "in_progress" | "not_compliant" | "unknown";
      impact: string;
    }>;
    overallRisk: "low" | "medium" | "high" | "critical";
    verdict: string;
  };

  // Integration Ecosystem (HRTech)
  hrtechIntegrations?: {
    coreIntegrations: Array<{
      system: string;
      status: "native" | "api" | "partner" | "planned" | "none";
      depth: "deep" | "standard" | "basic";
    }>;
    integrationAsModat: boolean;
    switchingCostAssessment: "very_high" | "high" | "medium" | "low";
    ecosystemStrategy: string;
  };

  // Implementation Analysis (HRTech - Key Bottleneck)
  hrtechImplementation?: {
    averageTimeToValue: number | null;
    implementationCycle: number | null;
    selfServeCapability: "full" | "partial" | "none";
    implementationCost: {
      included: boolean;
      separateRevenue: number | null;
    };
    scalabilityRisk: string;
  };

  // Sales & GTM (HRTech)
  hrtechSalesGtm?: {
    averageSalesCycle: number | null;
    salesMotion: "enterprise_field" | "inside_sales" | "plg" | "hybrid" | "unclear";
    buyerPersona: string[];
    expansionMechanism: string;
    channelStrategy: {
      direct: number;
      channel: number;
      selfServe: number;
    };
    gtmEfficiency: "efficient" | "acceptable" | "inefficient" | "unknown";
    insight: string;
  };

  // Customer Analysis (HRTech)
  hrtechCustomerAnalysis?: {
    totalCustomers: number | null;
    employeesServed: number | null;
    averageEmployeesPerCustomer: number | null;
    customerConcentration: {
      top10Percent: number | null;
      largestCustomer: number | null;
      riskLevel: "low" | "medium" | "high" | "critical";
    };
    industryDiversity: string[];
    geographicPresence: string[];
  };

  // Retention Analysis (HRTech)
  hrtechRetention?: {
    grossRevenueRetention: number | null;
    netRevenueRetention: number | null;
    logoChurn: number | null;
    expansionRate: number | null;
    churnReasons: string[];
    cohortHealth: {
      dataAvailable: boolean;
      trend: "improving" | "stable" | "declining" | "unknown";
      concern?: string;
    };
  };

  // HRTech Moat
  hrtechMoat?: {
    dataAdvantage: boolean;
    networkEffects: boolean;
    integrationDepth: "deep" | "medium" | "shallow" | "unknown";
    regulatoryMoat: boolean;
    switchingCosts: "very_high" | "high" | "medium" | "low";
    brandInHR: "strong" | "emerging" | "weak" | "unknown";
    moatAssessment: string;
  };

  // =============================================================================
  // FOODTECH EXPERT SPECIFIC FIELDS
  // =============================================================================

  // FoodTech specific data container - permissive type to accommodate agent output
  foodtechSpecific?: Record<string, unknown>;
}

// Helper to determine which sector expert to activate
// Returns general-expert as fallback when no specialized expert matches
export function getSectorExpert(dealSector: string | null | undefined): SectorExpertType | null {
  if (!dealSector) return null;

  const normalizedSector = dealSector.toLowerCase().trim();

  for (const [expertType, patterns] of Object.entries(SECTOR_MAPPINGS)) {
    // Skip general-expert in the loop (it's the fallback)
    if (expertType === "general-expert") continue;

    for (const pattern of patterns) {
      if (normalizedSector.includes(pattern.toLowerCase())) {
        return expertType as SectorExpertType;
      }
    }
  }

  // No specialized expert found - use general-expert as fallback
  return "general-expert";
}

// Helper to determine sector expert WITHOUT fallback (returns null if no match)
export function getSectorExpertStrict(dealSector: string | null | undefined): SectorExpertType | null {
  if (!dealSector) return null;

  const normalizedSector = dealSector.toLowerCase().trim();

  for (const [expertType, patterns] of Object.entries(SECTOR_MAPPINGS)) {
    if (expertType === "general-expert") continue;

    for (const pattern of patterns) {
      if (normalizedSector.includes(pattern.toLowerCase())) {
        return expertType as SectorExpertType;
      }
    }
  }

  return null;
}

// Get all matching sector experts (a deal might match multiple)
export function getAllMatchingSectorExperts(dealSector: string | null | undefined): SectorExpertType[] {
  if (!dealSector) return [];

  const normalizedSector = dealSector.toLowerCase().trim();
  const matches: SectorExpertType[] = [];

  for (const [expertType, patterns] of Object.entries(SECTOR_MAPPINGS)) {
    for (const pattern of patterns) {
      if (normalizedSector.includes(pattern.toLowerCase())) {
        matches.push(expertType as SectorExpertType);
        break; // Only add each expert once
      }
    }
  }

  return matches;
}
