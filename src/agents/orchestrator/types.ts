import type { AgentResult } from "../types";

// Base agents registry type
export type BaseAgentName = "deal-screener" | "red-flag-detector" | "document-extractor" | "deal-scorer";

// Analysis types with their required agents
export const ANALYSIS_CONFIGS = {
  screening: {
    agents: ["deal-screener"] as BaseAgentName[],
    description: "Quick screening to determine if deal warrants full DD",
    parallel: false,
  },
  extraction: {
    agents: ["document-extractor"] as BaseAgentName[],
    description: "Extract structured data from uploaded documents",
    parallel: false,
  },
  full_dd: {
    agents: ["document-extractor", "deal-screener", "deal-scorer", "red-flag-detector"] as BaseAgentName[],
    description: "Complete due diligence analysis",
    parallel: false,
  },
  tier1_complete: {
    agents: [] as BaseAgentName[], // Special handling - uses Tier 1 agents
    description: "Investigation complete par 12 agents en parallele",
    parallel: true,
  },
  tier2_synthesis: {
    agents: [] as BaseAgentName[], // Special handling - uses Tier 2 agents after Tier 1
    description: "Synthese complete avec 5 agents (requires Tier 1 results)",
    parallel: false, // Tier 2 runs sequentially
  },
  tier3_sector: {
    agents: [] as BaseAgentName[], // Special handling - sector expert based on deal sector
    description: "Analyse sectorielle par expert specialise (dynamique selon secteur)",
    parallel: false,
  },
  full_analysis: {
    agents: [] as BaseAgentName[], // Special handling - Tier 1 + Tier 2 + Tier 3
    description: "Analyse complete: Tier 1 (12) + Tier 2 (5) + Tier 3 Sector Expert (1)",
    parallel: false,
  },
} as const;

export type AnalysisType = keyof typeof ANALYSIS_CONFIGS;

// ============================================================================
// EARLY WARNING SYSTEM (Soft Fail-Fast)
// ============================================================================

/**
 * Severity levels for early warnings
 * - critical: Potential absolute dealbreaker (fraud, litigation, license revoked)
 * - high: Serious concern requiring investigation (metrics way below benchmarks)
 * - medium: Notable issue to discuss with founders
 */
export type EarlyWarningSeverity = "critical" | "high" | "medium";

/**
 * Categories of early warnings
 */
export type EarlyWarningCategory =
  | "founder_integrity"    // Fraud, criminal history, conflicts of interest
  | "legal_existential"    // Litigation threatening existence, license issues
  | "financial_critical"   // Metrics indicating non-viable business
  | "market_dead"          // Market doesn't exist or is dying
  | "product_broken"       // No differentiation, tech won't work
  | "deal_structure";      // Terms that are absolute no-go

/**
 * An early warning emitted when an agent detects a potential dealbreaker
 */
export interface EarlyWarning {
  id: string;
  timestamp: Date;
  agentName: string;
  severity: EarlyWarningSeverity;
  category: EarlyWarningCategory;
  title: string;
  description: string;
  evidence: string[];
  confidence: number; // 0-100
  recommendation: "investigate" | "likely_dealbreaker" | "absolute_dealbreaker";
  questionsToAsk?: string[];
}

/**
 * Callback for early warning events
 */
export type OnEarlyWarning = (warning: EarlyWarning) => void;

/**
 * Analysis execution mode
 * - "full": Complete analysis with consensus debates, reflexion, and all features
 * - "lite": Skip consensus debates and reflexion for faster/cheaper execution
 * - "express": Minimal analysis - parallel agents only, no synthesis phases
 */
export type AnalysisMode = "full" | "lite" | "express";

export interface AnalysisOptions {
  dealId: string;
  type: AnalysisType;
  useReAct?: boolean; // Use ReAct agents for traceable, benchmark-anchored scores
  forceRefresh?: boolean; // Bypass cache and force re-analysis
  mode?: AnalysisMode; // Execution mode (default: "full")
  failFastOnCritical?: boolean; // Stop analysis on critical red flags (default: false)
  maxCostUsd?: number; // Maximum cost in USD before stopping (default: no limit)
  onProgress?: (progress: {
    currentAgent: string;
    completedAgents: number;
    totalAgents: number;
    latestResult?: AgentResult;
    estimatedCostSoFar?: number;
  }) => void;
  onEarlyWarning?: OnEarlyWarning; // Callback when potential dealbreaker detected
}

export interface AnalysisResult {
  sessionId: string;
  dealId: string;
  type: AnalysisType;
  success: boolean;
  results: Record<string, AgentResult>;
  totalCost: number;
  totalTimeMs: number;
  summary?: string;
  // Cache metadata
  fromCache?: boolean;
  cacheAge?: number; // ms since cached result was created
  // Early warnings collected during analysis
  earlyWarnings?: EarlyWarning[];
  hasCriticalWarnings?: boolean; // Quick check for UI
}

/**
 * Advanced options for analysis execution (passed internally)
 */
export interface AdvancedAnalysisOptions {
  mode: AnalysisMode;
  failFastOnCritical: boolean;
  maxCostUsd?: number;
  onEarlyWarning?: OnEarlyWarning;
}

// Agent counts by analysis type
export const AGENT_COUNTS: Record<AnalysisType, number> = {
  screening: 1,
  extraction: 1,
  full_dd: 4,
  tier1_complete: 13, // 12 Tier 1 + extractor
  tier2_synthesis: 5,
  tier3_sector: 1, // Dynamic sector expert
  full_analysis: 19, // 12 Tier 1 + 5 Tier 2 + 1 extractor + 1 sector expert
};

// Tier 1 agent names (12 agents)
export const TIER1_AGENT_NAMES = [
  "deck-forensics",
  "financial-auditor",
  "market-intelligence",
  "competitive-intel",
  "team-investigator",
  "technical-dd",
  "legal-regulatory",
  "cap-table-auditor",
  "gtm-analyst",
  "customer-intel",
  "exit-strategist",
  "question-master",
] as const;

// Tier 2 agent names (5 agents) - in execution order
export const TIER2_AGENT_NAMES = [
  "contradiction-detector",  // First: find inconsistencies
  "scenario-modeler",        // Second: build scenarios
  "synthesis-deal-scorer",   // Third: calculate final score
  "devils-advocate",         // Fourth: challenge the thesis
  "memo-generator",          // Fifth: generate memo (needs all above)
] as const;

// Tier 3 sector expert names
export const TIER3_EXPERT_NAMES = [
  "saas-expert",
  "marketplace-expert",
  "fintech-expert",
  "healthtech-expert",
  "deeptech-expert",
  "climate-expert",
  "hardware-expert",
  "gaming-expert",
  "consumer-expert",
] as const;
