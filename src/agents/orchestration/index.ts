/**
 * Orchestration Layer
 * State machine, message bus, memory management, consensus, and reflexion
 */

// Export message types
export * from "./message-types";

// Export message bus
export { AgentMessageBus, messageBus } from "./message-bus";

// Export state machine (with recovery capabilities)
export {
  AnalysisStateMachine,
  type AnalysisState,
  type AnalysisCheckpoint,
} from "./state-machine";

// Export memory management
export {
  WorkingMemory,
  DealMemory,
  ExperientialMemory,
  globalExperientialMemory,
  type DealMemoryData,
  type AnalysisMemory,
  type KeyInsight,
  type Contradiction as MemoryContradiction,
  type CalibrationData,
  type PatternMatch,
} from "./memory";

// Export consensus engine
export {
  ConsensusEngine,
  consensusEngine,
  type DetectedContradiction,
  type ContradictionClaim,
  type DebateRound,
  type DebatePosition,
  type ContradictionResolution,
  type DebateResult,
  type VerificationContext,
} from "./consensus-engine";

// Export reflexion engine
export {
  ReflexionEngine,
  reflexionEngine,
  createReflexionEngine,
  type ReflexionInput,
  type ReflexionOutput,
  type Critique,
  type Improvement,
  type DataRequest,
  type ReflexionConfig,
} from "./reflexion";

// Export schemas
export {
  DebaterResponseSchema,
  ArbitratorResponseSchema,
  QuickResolutionSchema,
  type DebaterResponse,
  type ArbitratorResponse,
  type QuickResolution,
} from "./schemas/consensus-schemas";

export {
  CriticResponseSchema,
  ImproverResponseSchema,
  type CriticResponse,
  type ImproverResponse,
} from "./schemas/reflexion-schemas";

// Export utils
export { completeAndValidate, type ValidationResult } from "./utils/llm-validation";
export {
  calculateARR,
  calculateGrossMargin,
  calculateCAGR,
  calculateLTVCACRatio,
  calculateRuleOf40,
  calculatePercentageDeviation,
  calculatePercentile,
  validateAndCalculate,
  type CalculationResult,
} from "./utils/financial-calculations";

// Export finding extractor (for Standard agents → Consensus/Reflexion)
export {
  extractAgentData,
  extractAllFindings,
  type ExtractedAgentData,
} from "./finding-extractor";
