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

// Tier 2 agent names (5 agents)
export const TIER2_AGENT_NAMES = [
  "contradiction-detector",
  "scenario-modeler",
  "synthesis-deal-scorer",
  "devils-advocate",
  "memo-generator",
] as const;

// ============================================================================
// DYNAMIC DEPENDENCY GRAPH
// ============================================================================

/**
 * Agent dependencies for Tier 2
 * - Empty array = can run in parallel with other independent agents
 * - Array with names = must wait for those agents to complete
 */
export const TIER2_DEPENDENCIES: Record<typeof TIER2_AGENT_NAMES[number], string[]> = {
  "contradiction-detector": [], // No deps - runs immediately
  "scenario-modeler": [],       // No deps - runs immediately
  "devils-advocate": [],        // No deps - runs immediately
  "synthesis-deal-scorer": ["contradiction-detector", "scenario-modeler"], // Needs insights from both
  "memo-generator": ["contradiction-detector", "scenario-modeler", "synthesis-deal-scorer", "devils-advocate"], // Needs all
};

/**
 * Execution batches for Tier 2 (computed from dependencies)
 * Agents in same batch can run in parallel
 *
 * IMPORTANT: synthesis-deal-scorer runs AFTER Tier 3 to include sector expert insights
 * See TIER2_BATCHES_BEFORE_TIER3 and TIER2_BATCHES_AFTER_TIER3
 */
export const TIER2_EXECUTION_BATCHES = [
  // Batch 1: All independent agents (parallel)
  ["contradiction-detector", "scenario-modeler", "devils-advocate"],
  // Batch 2: Depends on contradiction-detector + scenario-modeler
  ["synthesis-deal-scorer"],
  // Batch 3: Depends on all above
  ["memo-generator"],
] as const;

/**
 * NEW: Tier 2 batches BEFORE Tier 3 sector expert
 * These agents don't need sector expert insights
 */
export const TIER2_BATCHES_BEFORE_TIER3 = [
  // Batch 1: All independent agents (parallel)
  ["contradiction-detector", "scenario-modeler", "devils-advocate"],
] as const;

/**
 * NEW: Tier 2 batches AFTER Tier 3 sector expert
 * These agents benefit from sector expert insights for final scoring
 */
export const TIER2_BATCHES_AFTER_TIER3 = [
  // synthesis-deal-scorer: Final scoring with ALL insights including Tier 3
  ["synthesis-deal-scorer"],
  // memo-generator: Investment memo with complete analysis
  ["memo-generator"],
] as const;

/**
 * Resolve agent execution order respecting dependencies
 * Returns agents grouped by execution batch (parallel within batch, sequential across batches)
 */
export function resolveAgentDependencies(
  agents: string[],
  dependencies: Record<string, string[]>
): string[][] {
  const batches: string[][] = [];
  const completed = new Set<string>();
  const remaining = new Set(agents);

  while (remaining.size > 0) {
    // Find all agents whose dependencies are satisfied
    const batch: string[] = [];

    for (const agent of remaining) {
      const deps = dependencies[agent] ?? [];
      const allDepsSatisfied = deps.every(dep => completed.has(dep));

      if (allDepsSatisfied) {
        batch.push(agent);
      }
    }

    if (batch.length === 0) {
      // Circular dependency or missing dependency - run remaining sequentially
      console.warn('[DependencyResolver] Circular or missing dependency detected, running remaining sequentially');
      batches.push([...remaining]);
      break;
    }

    batches.push(batch);

    // Mark batch as completed
    for (const agent of batch) {
      completed.add(agent);
      remaining.delete(agent);
    }
  }

  return batches;
}

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
