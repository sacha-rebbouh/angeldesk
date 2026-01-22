/**
 * Tier 3 Sector Expert Types
 * Dynamic agents activated based on deal sector
 */

import type { AgentResult } from "../types";

// Sector categories and their matching patterns
export const SECTOR_MAPPINGS: Record<SectorExpertType, string[]> = {
  "saas-expert": ["SaaS", "B2B Software", "Enterprise Software", "Software"],
  "marketplace-expert": ["Marketplace", "Platform", "Two-sided"],
  "fintech-expert": ["Fintech", "Payments", "Banking", "Insurance", "Insurtech", "Lending"],
  "healthtech-expert": ["HealthTech", "MedTech", "BioTech", "Healthcare", "Digital Health"],
  "deeptech-expert": ["DeepTech", "AI/ML", "AI", "ML", "Quantum", "Blockchain", "Web3"],
  "climate-expert": ["CleanTech", "Climate", "Energy", "Sustainability", "GreenTech"],
  "hardware-expert": ["Hardware", "IoT", "Robotics", "Manufacturing", "Industrial"],
  "gaming-expert": ["Gaming", "Esports", "Metaverse", "VR", "AR"],
  "consumer-expert": ["Consumer", "D2C", "Social", "E-commerce", "Retail", "Food"],
};

export type SectorExpertType =
  | "saas-expert"
  | "marketplace-expert"
  | "fintech-expert"
  | "healthtech-expert"
  | "deeptech-expert"
  | "climate-expert"
  | "hardware-expert"
  | "gaming-expert"
  | "consumer-expert";

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
}

// Helper to determine which sector expert to activate
export function getSectorExpert(dealSector: string | null | undefined): SectorExpertType | null {
  if (!dealSector) return null;

  const normalizedSector = dealSector.toLowerCase().trim();

  for (const [expertType, patterns] of Object.entries(SECTOR_MAPPINGS)) {
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
