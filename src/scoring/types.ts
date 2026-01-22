/**
 * Scoring Service Types
 * Production-grade scoring system with objective, benchmark-anchored scores
 */

// ============================================================================
// CONFIDENCE TYPES
// ============================================================================

export type ConfidenceLevel = "high" | "medium" | "low" | "insufficient";

export interface ConfidenceScore {
  level: ConfidenceLevel;
  score: number; // 0-100
  factors: ConfidenceFactor[];
}

export interface ConfidenceFactor {
  name: string;
  weight: number; // 0-1
  score: number; // 0-100
  reason: string;
}

export interface ConfidenceFactorWeights {
  dataAvailability: number;
  evidenceQuality: number;
  benchmarkMatch: number;
  sourceReliability: number;
  temporalRelevance: number;
}

// ============================================================================
// BENCHMARK TYPES
// ============================================================================

export interface BenchmarkData {
  sector: string;
  stage: string;
  metric: string;
  p25: number;
  median: number;
  p75: number;
  source: string;
  updatedAt?: Date;
}

export interface BenchmarkLookupResult {
  found: boolean;
  exact: boolean; // true if exact sector/stage match, false if fallback
  benchmark?: BenchmarkData;
  fallbackUsed?: string; // e.g., "generic_sector" or "all_stages"
}

export interface PercentileResult {
  percentile: number; // 0-100
  assessment: PercentileAssessment;
  benchmarkUsed: BenchmarkData;
  interpolated: boolean;
}

export type PercentileAssessment =
  | "exceptional" // >90th percentile
  | "above_average" // 75-90th percentile
  | "average" // 25-75th percentile
  | "below_average" // 10-25th percentile
  | "poor" // <10th percentile
  | "suspicious"; // Extreme outlier (>99th or <1st)

// ============================================================================
// SCORED FINDING TYPES
// ============================================================================

export interface ScoredFinding {
  id: string;
  agentName: string;
  metric: string;
  category: FindingCategory;

  // Value
  value: number | string | null;
  unit: string;
  normalizedValue?: number; // 0-100 normalized

  // Benchmark comparison
  percentile?: number;
  assessment: string;
  benchmarkData?: BenchmarkData;

  // Confidence
  confidence: ConfidenceScore;

  // Evidence chain
  evidence: Evidence[];

  // Reasoning trace reference
  reasoningTraceId?: string;

  createdAt: Date;
}

export type FindingCategory =
  | "financial"
  | "team"
  | "market"
  | "product"
  | "competitive"
  | "legal"
  | "technical"
  | "gtm"
  | "customer"
  | "exit"
  | "structure";

export interface Evidence {
  type: "quote" | "calculation" | "benchmark" | "external_data" | "inference";
  content: string;
  source: string;
  confidence: number; // 0-1
}

// ============================================================================
// DIMENSION SCORE TYPES
// ============================================================================

export interface DimensionScore {
  dimension: string;
  score: number; // 0-100
  weight: number; // Weight in final score calculation
  findings: ScoredFinding[];
  aggregatedConfidence: ConfidenceScore;
  contributors: DimensionContributor[];
}

export interface DimensionContributor {
  findingId: string;
  metric: string;
  contribution: number; // How much this finding contributed to the score
  confidence: ConfidenceLevel;
}

// ============================================================================
// AGGREGATED SCORE TYPES
// ============================================================================

export interface ObjectiveDealScore {
  dealId: string;
  analysisId: string;

  // Global score
  globalScore: number; // 0-100
  globalConfidence: ConfidenceScore;

  // Dimension scores
  dimensions: {
    team: DimensionScore;
    market: DimensionScore;
    product: DimensionScore;
    financials: DimensionScore;
    timing: DimensionScore;
  };

  // All findings
  findings: ScoredFinding[];

  // Metadata
  totalFindings: number;
  highConfidenceFindings: number;
  benchmarksUsed: number;
  analysisTimestamp: Date;

  // Variance metrics (for quality tracking)
  expectedVariance: number; // Expected points variance on re-run
}

// ============================================================================
// METRIC DEFINITION TYPES
// ============================================================================

export interface MetricDefinition {
  name: string;
  displayName: string;
  category: FindingCategory;
  dimension: keyof ObjectiveDealScore["dimensions"];

  // Scoring
  weight: number; // Weight within dimension (0-1)
  direction: "higher_better" | "lower_better" | "target_range";
  targetRange?: { min: number; max: number };

  // Validation
  minValue?: number;
  maxValue?: number;
  unit: string;

  // Benchmark lookup key
  benchmarkMetricName: string;

  // Calculation
  calculationType: "direct" | "derived" | "composite";
  formula?: string; // For derived metrics
  dependencies?: string[]; // For composite metrics
}

export interface MetricRegistry {
  metrics: Map<string, MetricDefinition>;
  getMetric(name: string): MetricDefinition | undefined;
  getMetricsByDimension(dimension: string): MetricDefinition[];
  getMetricsByCategory(category: FindingCategory): MetricDefinition[];
}

// ============================================================================
// AGGREGATION TYPES
// ============================================================================

export interface AggregationConfig {
  // Confidence thresholds
  minConfidenceForInclusion: number; // Minimum confidence to include in score
  confidenceWeightingEnabled: boolean; // Weight scores by confidence

  // Dimension weights (must sum to 1)
  dimensionWeights: {
    team: number;
    market: number;
    product: number;
    financials: number;
    timing: number;
  };

  // Missing data handling
  missingDataPenalty: number; // Penalty for each missing required metric
  minMetricsForDimension: number; // Minimum metrics needed to score dimension
}

export interface AggregationResult {
  score: number;
  confidence: ConfidenceScore;
  includedFindings: string[];
  excludedFindings: { id: string; reason: string }[];
  warnings: string[];
}

// ============================================================================
// SERVICE INTERFACES
// ============================================================================

export interface IBenchmarkService {
  lookup(
    sector: string,
    stage: string,
    metric: string
  ): Promise<BenchmarkLookupResult>;
  calculatePercentile(
    value: number,
    benchmark: BenchmarkData
  ): PercentileResult;
  getBenchmarksForSector(sector: string): Promise<BenchmarkData[]>;
  refreshBenchmarks(): Promise<void>;
}

export interface IConfidenceCalculator {
  calculate(factors: Partial<ConfidenceFactorWeights>): ConfidenceScore;
  calculateForFinding(
    finding: Partial<ScoredFinding>,
    context: ConfidenceContext
  ): ConfidenceScore;
  combineConfidences(confidences: ConfidenceScore[]): ConfidenceScore;
}

export interface ConfidenceContext {
  hasDirectEvidence: boolean;
  hasBenchmarkMatch: boolean;
  sourceCount: number;
  dataAge?: number; // Days old
  isVerified: boolean;
}

export interface IScoreAggregator {
  aggregateFindings(
    findings: ScoredFinding[],
    dealId: string,
    analysisId: string,
    config?: Partial<AggregationConfig>
  ): ObjectiveDealScore;
  aggregateDimension(
    findings: ScoredFinding[],
    dimension: string
  ): DimensionScore;
  calculateGlobalScore(dimensions: DimensionScore[]): AggregationResult;
}

export interface IMetricRegistry {
  register(metric: MetricDefinition): void;
  get(name: string): MetricDefinition | undefined;
  getByDimension(dimension: string): MetricDefinition[];
  validateValue(metric: string, value: number): boolean;
}
