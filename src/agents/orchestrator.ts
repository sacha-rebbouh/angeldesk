/**
 * Agent Orchestrator - Re-export from modular structure
 *
 * This file provides backward compatibility.
 * The orchestrator is now split into:
 * - orchestrator/types.ts - Types and configs
 * - orchestrator/agent-registry.ts - Agent loading
 * - orchestrator/persistence.ts - DB operations
 * - orchestrator/summary.ts - Summary generation
 * - orchestrator/index.ts - Main orchestrator class
 */

export {
  AgentOrchestrator,
  orchestrator,
  type AnalysisOptions,
  type AnalysisResult,
  type AnalysisType,
  ANALYSIS_CONFIGS,
  AGENT_COUNTS,
} from "./orchestrator/index";
