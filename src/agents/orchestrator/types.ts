import type { AgentResult } from "../types";

// Base agents registry type
export type BaseAgentName = "red-flag-detector" | "document-extractor" | "deal-scorer";

// Analysis types with their required agents
export const ANALYSIS_CONFIGS = {
  extraction: {
    agents: ["document-extractor"] as BaseAgentName[],
    description: "Extract structured data from uploaded documents",
    parallel: false,
  },
  full_dd: {
    agents: ["document-extractor", "deal-scorer", "red-flag-detector"] as BaseAgentName[],
    description: "Complete due diligence analysis",
    parallel: false,
  },
  tier1_complete: {
    agents: [] as BaseAgentName[], // Special handling - uses Tier 1 agents
    description: "Investigation complete par 12 agents en parallele",
    parallel: true,
  },
  tier2_sector: {
    agents: [] as BaseAgentName[], // Special handling - sector expert based on deal sector
    description: "Analyse sectorielle par expert specialise (dynamique selon secteur)",
    parallel: false,
  },
  tier3_synthesis: {
    agents: [] as BaseAgentName[], // Special handling - uses Tier 3 agents after Tier 1
    description: "Synthese complete avec 5 agents (requires Tier 1 results)",
    parallel: false, // Tier 3 runs sequentially
  },
  full_analysis: {
    agents: [] as BaseAgentName[], // Special handling - Tier 1 + Tier 2 + Tier 3
    description: "Analyse complete: Tier 1 (12) + Tier 2 Sector Expert (1) + Tier 3 (5)",
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
 */
export type AnalysisMode = "full";

/**
 * User subscription plan - determines which tiers are available
 * - FREE: Tier 1 + synthesis-deal-scorer only
 * - PRO: All tiers (Tier 1 + Tier 2 + full Tier 3)
 */
export type UserPlan = "FREE" | "PRO";

export interface AnalysisOptions {
  dealId: string;
  type: AnalysisType;
  /** @deprecated ReAct agents are no longer used. Standard agents provide better results. */
  useReAct?: boolean;
  /** Enable detailed traces for transparency and reproducibility (default: true) */
  enableTrace?: boolean;
  forceRefresh?: boolean; // Bypass cache and force re-analysis
  mode?: AnalysisMode; // Execution mode (default: "full")
  failFastOnCritical?: boolean; // Stop analysis on critical red flags (default: false)
  maxCostUsd?: number; // Maximum cost in USD before stopping (default: no limit)
  /**
   * If true, this is an update analysis (new documents added).
   * Uses UPDATE_ANALYSIS credits (2) instead of INITIAL_ANALYSIS (5).
   * Existing facts are passed to fact-extractor for contradiction detection.
   */
  isUpdate?: boolean;
  onProgress?: (progress: {
    currentAgent: string;
    completedAgents: number;
    totalAgents: number;
    latestResult?: AgentResult;
    estimatedCostSoFar?: number;
  }) => void;
  onEarlyWarning?: OnEarlyWarning; // Callback when potential dealbreaker detected
  /** User subscription plan - determines tier gating (default: "FREE") */
  userPlan?: UserPlan;
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
  // Recovery metadata
  resumedFromCheckpoint?: boolean; // True if analysis was resumed after crash
  // Tier gating metadata
  tiersExecuted?: string[]; // Which tiers were executed (for UI gating display)
}

/**
 * Advanced options for analysis execution (passed internally)
 */
export interface AdvancedAnalysisOptions {
  mode: AnalysisMode;
  failFastOnCritical: boolean;
  maxCostUsd?: number;
  onEarlyWarning?: OnEarlyWarning;
  /** Enable detailed traces for transparency (default: true) */
  enableTrace?: boolean;
  /** If true, uses UPDATE_ANALYSIS credits instead of INITIAL_ANALYSIS */
  isUpdate?: boolean;
  /** User subscription plan for tier gating */
  userPlan?: UserPlan;
}

// Agent counts by analysis type
export const AGENT_COUNTS: Record<AnalysisType, number> = {
  extraction: 1,
  full_dd: 4,
  tier1_complete: 13, // 13 Tier 1 agents (used for display; actual total includes extractor + fact-extractor)
  tier2_sector: 1, // Dynamic sector expert
  tier3_synthesis: 5,
  full_analysis: 19, // 12 Tier 1 + 1 sector expert + 5 Tier 3 + 1 extractor
};

// Tier 1 agent names (13 agents)
export const TIER1_AGENT_NAMES = [
  "deck-forensics",
  "financial-auditor",
  "market-intelligence",
  "competitive-intel",
  "team-investigator",
  "tech-stack-dd",
  "tech-ops-dd",
  "legal-regulatory",
  "cap-table-auditor",
  "gtm-analyst",
  "customer-intel",
  "exit-strategist",
  "question-master",
] as const;

// ============================================================================
// TIER 1 SEQUENTIAL PHASES
// ============================================================================

/**
 * Tier 1 agents execute in 4 sequential phases.
 * After each phase, outputs are validated via Reflexion and promoted to Fact Store.
 *
 * Phase A: deck-forensics verifies deck claims → establishes factual ground truth
 * Phase B: financial-auditor calculates metrics → using verified claims from Phase A
 * Phase C: team + competitive + market (parallel) → using verified facts from A+B
 * Phase D: remaining 8 agents (parallel) → using all validated facts from A+B+C
 */
export const TIER1_PHASE_A = ["deck-forensics"] as const;
export const TIER1_PHASE_B = ["financial-auditor"] as const;
export const TIER1_PHASE_C = ["team-investigator", "competitive-intel", "market-intelligence"] as const;
export const TIER1_PHASE_D = [
  "tech-stack-dd", "tech-ops-dd", "legal-regulatory", "cap-table-auditor",
  "gtm-analyst", "customer-intel", "exit-strategist", "question-master",
] as const;

/** All phases in execution order */
export const TIER1_PHASES = [TIER1_PHASE_A, TIER1_PHASE_B, TIER1_PHASE_C, TIER1_PHASE_D] as const;

/** Phases where reflexion is ALWAYS applied (regardless of confidence) */
export const TIER1_ALWAYS_REFLECT_PHASES: ReadonlyArray<string> = [...TIER1_PHASE_A, ...TIER1_PHASE_B];

// Tier 3 agent names (5 synthesis agents)
export const TIER3_AGENT_NAMES = [
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
 * Agent dependencies for Tier 3
 * - Empty array = can run in parallel with other independent agents
 * - Array with names = must wait for those agents to complete
 */
export const TIER3_DEPENDENCIES: Record<typeof TIER3_AGENT_NAMES[number], string[]> = {
  "contradiction-detector": [], // No deps - runs immediately
  "scenario-modeler": [],       // No deps - runs immediately
  "devils-advocate": [],        // No deps - runs immediately
  "synthesis-deal-scorer": ["contradiction-detector", "scenario-modeler"], // Needs insights from both
  "memo-generator": ["contradiction-detector", "scenario-modeler", "synthesis-deal-scorer", "devils-advocate"], // Needs all
};

/**
 * Execution batches for Tier 3 (computed from dependencies)
 * Agents in same batch can run in parallel
 *
 * IMPORTANT: synthesis-deal-scorer runs AFTER Tier 2 to include sector expert insights
 * See TIER3_BATCHES_BEFORE_TIER2 and TIER3_BATCHES_AFTER_TIER2
 */
export const TIER3_EXECUTION_BATCHES = [
  // Batch 1: All independent agents (parallel)
  ["contradiction-detector", "scenario-modeler", "devils-advocate"],
  // Batch 2: Depends on contradiction-detector + scenario-modeler
  ["synthesis-deal-scorer"],
  // Batch 3: Depends on all above
  ["memo-generator"],
] as const;

/**
 * NEW: Tier 3 batches BEFORE Tier 2 sector expert
 * These agents don't need sector expert insights
 */
export const TIER3_BATCHES_BEFORE_TIER2 = [
  // Batch 1: All independent agents (parallel)
  ["contradiction-detector", "scenario-modeler", "devils-advocate"],
] as const;

/**
 * NEW: Tier 3 batches AFTER Tier 2 sector expert
 * These agents benefit from sector expert insights for final scoring
 */
export const TIER3_BATCHES_AFTER_TIER2 = [
  // synthesis-deal-scorer: Final scoring with ALL insights including Tier 2
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

// Tier 2 sector expert names
export const TIER2_EXPERT_NAMES = [
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
