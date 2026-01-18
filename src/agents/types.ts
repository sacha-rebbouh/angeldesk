import type { Deal, RedFlagCategory, RedFlagSeverity } from "@prisma/client";

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

// Analysis session types
export type AnalysisAgentResult =
  | ScreeningResult
  | ExtractionResult
  | RedFlagResult
  | ScoringResult;

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
