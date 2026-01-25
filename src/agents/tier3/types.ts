/**
 * Tier 3 Sector Expert Types
 * Dynamic agents activated based on deal sector
 */

import type { AgentResult } from "../types";

// Sector categories and their matching patterns
// Extended to cover more industries with intelligent mapping
export const SECTOR_MAPPINGS: Record<SectorExpertType, string[]> = {
  "saas-expert": ["SaaS", "SaaS B2B", "SaaS B2C", "B2B Software", "Enterprise Software", "Software", "HRTech", "HR Tech", "LegalTech", "Legal Tech", "RegTech"],
  "marketplace-expert": ["Marketplace", "Platform", "Two-sided", "PropTech", "Prop Tech", "Real Estate Tech"],
  "fintech-expert": ["FinTech", "Payments", "Banking", "Insurance", "InsurTech", "Lending", "WealthTech", "Neobank"],
  "healthtech-expert": ["HealthTech", "MedTech", "BioTech", "Healthcare", "Digital Health", "FemTech", "Mental Health"],
  "deeptech-expert": ["DeepTech", "AI / Machine Learning", "AI/ML", "AI", "ML", "Machine Learning", "Quantum", "Blockchain / Web3", "Blockchain", "Web3", "Cybersecurity", "Cyber"],
  "climate-expert": ["CleanTech", "Climate", "Energy", "Sustainability", "GreenTech", "AgriTech", "AgTech", "FoodTech", "Food Tech"],
  "hardware-expert": ["Hardware", "Hardware / IoT", "IoT", "Robotics", "Manufacturing", "Industrial", "SpaceTech", "Space Tech", "Drones"],
  "gaming-expert": ["Gaming", "Gaming / Esports", "Esports", "Metaverse", "VR", "AR", "Entertainment", "Media Tech"],
  "consumer-expert": ["Consumer", "D2C", "Social", "E-commerce", "Retail", "Food", "EdTech", "Ed Tech", "Education", "Lifestyle"],
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
