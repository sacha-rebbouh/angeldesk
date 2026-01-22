/**
 * ReAct Engine Types
 * Types for Reasoning-Action-Observation loop pattern
 */

import type { ScoredFinding, ConfidenceScore } from "@/scoring/types";
import type { AgentContext, EnrichedAgentContext } from "../types";

// ============================================================================
// CORE REACT TYPES
// ============================================================================

/**
 * A thought in the reasoning process
 */
export interface Thought {
  id: string;
  content: string;
  type: ThoughtType;
  timestamp: Date;
}

export type ThoughtType =
  | "planning" // Initial planning of approach
  | "analysis" // Analyzing information
  | "hypothesis" // Forming a hypothesis
  | "evaluation" // Evaluating results
  | "synthesis" // Synthesizing findings
  | "self_critique"; // Critiquing own work

/**
 * An action to be executed
 */
export interface Action {
  id: string;
  toolName: string;
  parameters: Record<string, unknown>;
  reasoning: string; // Why this action was chosen
  timestamp: Date;
}

/**
 * Result of an action execution
 */
export interface Observation {
  id: string;
  actionId: string;
  success: boolean;
  result: unknown;
  error?: string;
  executionTimeMs: number;
  timestamp: Date;
}

/**
 * A single step in the reasoning trace
 */
export interface ReasoningStep {
  stepNumber: number;
  thought: Thought;
  action?: Action;
  observation?: Observation;
  confidenceAfterStep: number; // 0-100
}

/**
 * Complete reasoning trace for an agent run
 */
export interface ReasoningTrace {
  id: string;
  agentName: string;
  taskDescription: string;
  steps: ReasoningStep[];
  totalIterations: number;
  finalConfidence: number;
  executionTimeMs: number;
  timestamp: Date;
}

// ============================================================================
// TOOL TYPES
// ============================================================================

/**
 * Definition of a tool that can be used by agents
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute: (params: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
}

export interface ToolParameter {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  required: boolean;
  default?: unknown;
  enum?: string[];
}

export interface ToolContext {
  dealId: string;
  agentContext: AgentContext | EnrichedAgentContext;
  previousSteps: ReasoningStep[];
  memory: Map<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: {
    source?: string;
    confidence?: number;
    cached?: boolean;
    cacheSource?: "cross-agent" | "local"; // Where cache hit came from
  };
}

// ============================================================================
// ENGINE CONFIGURATION
// ============================================================================

/**
 * Configuration for ReAct engine behavior
 */
export interface ReActConfig {
  // Iteration limits
  maxIterations: number;
  minIterations: number;

  // Confidence thresholds
  confidenceThreshold: number; // Stop when confidence reaches this
  earlyStopConfidence: number; // Can stop early if confidence is high

  // Timeouts
  totalTimeoutMs: number;
  toolTimeoutMs: number;

  // Validation
  enableZodValidation: boolean;
  maxValidationRetries: number;

  // Self-critique
  enableSelfCritique: boolean;
  selfCritiqueThreshold: number; // Only self-critique if below this confidence

  // LLM settings
  temperature: number;
  modelComplexity: "simple" | "medium" | "complex" | "critical";
}

export const DEFAULT_REACT_CONFIG: ReActConfig = {
  maxIterations: 5,
  minIterations: 2,
  confidenceThreshold: 80,
  earlyStopConfidence: 90,
  totalTimeoutMs: 120000, // 2 minutes
  toolTimeoutMs: 30000, // 30 seconds per tool
  enableZodValidation: true,
  maxValidationRetries: 2,
  enableSelfCritique: true,
  selfCritiqueThreshold: 75,
  temperature: 0.3,
  modelComplexity: "complex",
};

// ============================================================================
// AGENT OUTPUT TYPES
// ============================================================================

/**
 * Output from a ReAct agent run
 */
export interface ReActOutput<T = unknown> {
  success: boolean;
  result: T;
  findings: ScoredFinding[];
  confidence: ConfidenceScore;
  reasoningTrace: ReasoningTrace;
  executionTimeMs: number;
  cost: number;
  error?: string;
}

/**
 * Synthesis result after ReAct loop completes
 */
export interface SynthesisResult<T> {
  data: T;
  findings: ScoredFinding[];
  confidence: number;
  supportingEvidence: string[];
  uncertainties: string[];
}

// ============================================================================
// VALIDATION TYPES
// ============================================================================

/**
 * Result of output validation
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
  suggestions: string[];
}

export interface ValidationError {
  field: string;
  message: string;
  received: unknown;
  expected: string;
}

// ============================================================================
// SELF-CRITIQUE TYPES
// ============================================================================

/**
 * Result of self-critique phase
 */
export interface SelfCritiqueResult {
  critiques: Critique[];
  overallAssessment: "acceptable" | "needs_improvement" | "requires_revision";
  suggestedImprovements: string[];
  confidenceAdjustment: number; // Positive or negative adjustment
}

export interface Critique {
  area: string;
  issue: string;
  severity: "minor" | "moderate" | "significant";
  suggestion: string;
}

// ============================================================================
// PROMPT TYPES
// ============================================================================

/**
 * Structured prompts for ReAct agents
 */
export interface ReActPrompts {
  system: string;
  taskDescription: string;
  availableTools: string;
  outputSchema: string;
  constraints: string[];
}

/**
 * Response format expected from LLM
 */
export interface LLMReActResponse {
  thought: string;
  thoughtType: ThoughtType;
  action?: {
    tool: string;
    parameters: Record<string, unknown>;
    reasoning: string;
  };
  confidence: number;
  readyToSynthesize: boolean;
}

export interface LLMSynthesisResponse<T> {
  result: T;
  findings: Array<{
    metric: string;
    value: unknown;
    unit: string;
    assessment: string;
    evidence: string[];
    confidence: number;
  }>;
  confidence: number;
  uncertainties: string[];
}

export interface LLMSelfCritiqueResponse {
  critiques: Array<{
    area: string;
    issue: string;
    severity: "minor" | "moderate" | "significant";
    suggestion: string;
  }>;
  overallAssessment: "acceptable" | "needs_improvement" | "requires_revision";
  suggestedImprovements: string[];
  confidenceAdjustment: number;
}
