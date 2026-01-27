/**
 * ReAct Engine
 * Reasoning-Action-Observation loop implementation
 */

// Export types
export * from "./types";
export * from "./tools/types";

// Export engine
export { ReActEngine, createReActEngine } from "./engine";

// Export tool registry
export { toolRegistry } from "./tools/registry";

// Export and register built-in tools
export {
  registerBuiltInTools,
  searchBenchmarks,
  analyzeSection,
  crossReference,
  calculateMetric,
  writeMemory,
  readMemory,
} from "./tools/built-in";

// Note: ReAct agents have been removed in favor of Standard agents
// which provide better results at 20x lower cost.
// The ReAct engine is still available for Tier 3 sector experts.
