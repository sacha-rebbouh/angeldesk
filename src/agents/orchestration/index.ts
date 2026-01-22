/**
 * Orchestration Layer
 * State machine, message bus, memory management, consensus, and reflexion
 */

// Export message types
export * from "./message-types";

// Export message bus
export { AgentMessageBus, messageBus } from "./message-bus";

// Export state machine
export { AnalysisStateMachine, type AnalysisState, type AnalysisCheckpoint } from "./state-machine";

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
