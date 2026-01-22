/**
 * Scoring Service
 * Production-grade scoring system with objective, benchmark-anchored scores
 */

// Export types
export * from "./types";

// Export services
export { benchmarkService } from "./services/benchmark-service";
export {
  confidenceCalculator,
  createConfidenceCalculator,
} from "./services/confidence-calculator";
export { metricRegistry } from "./services/metric-registry";
export { scoreAggregator, createScoredFinding } from "./services/score-aggregator";
