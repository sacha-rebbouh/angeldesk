/**
 * Score Aggregator
 * Aggregates findings into dimension and global scores
 * Weights scores by confidence to ensure reproducibility
 */

import type {
  AggregationConfig,
  AggregationResult,
  ConfidenceScore,
  DimensionContributor,
  DimensionScore,
  IScoreAggregator,
  ObjectiveDealScore,
  ScoredFinding,
} from "../types";
import { confidenceCalculator } from "./confidence-calculator";
import { metricRegistry } from "./metric-registry";

// Default aggregation configuration
const DEFAULT_CONFIG: AggregationConfig = {
  minConfidenceForInclusion: 25, // Include findings with confidence >= 25%
  confidenceWeightingEnabled: true,
  dimensionWeights: {
    team: 0.25,
    market: 0.20,
    product: 0.20,
    financials: 0.25,
    timing: 0.10,
  },
  missingDataPenalty: 5, // 5 points per missing required metric
  minMetricsForDimension: 2, // Need at least 2 metrics to score dimension
};

// Dimension to finding category mapping
const DIMENSION_CATEGORIES: Record<string, string[]> = {
  team: ["team"],
  market: ["market"],
  product: ["product", "customer", "technical"],
  financials: ["financial"],
  timing: ["market", "competitive", "legal"],
};

class ScoreAggregator implements IScoreAggregator {
  /**
   * Aggregate all findings into a complete deal score
   */
  aggregateFindings(
    findings: ScoredFinding[],
    dealId: string,
    analysisId: string,
    config: Partial<AggregationConfig> = {}
  ): ObjectiveDealScore {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };

    // Filter findings by confidence
    const includedFindings = findings.filter(
      (f) => f.confidence.score >= fullConfig.minConfidenceForInclusion
    );

    const excludedFindings = findings
      .filter((f) => f.confidence.score < fullConfig.minConfidenceForInclusion)
      .map((f) => ({
        id: f.id,
        reason: `Confidence ${f.confidence.score}% below threshold ${fullConfig.minConfidenceForInclusion}%`,
      }));

    // Group findings by dimension
    const findingsByDimension = this.groupByDimension(includedFindings);

    // Calculate dimension scores
    const dimensions = {
      team: this.aggregateDimensionInternal(
        findingsByDimension.team ?? [],
        "team",
        fullConfig
      ),
      market: this.aggregateDimensionInternal(
        findingsByDimension.market ?? [],
        "market",
        fullConfig
      ),
      product: this.aggregateDimensionInternal(
        findingsByDimension.product ?? [],
        "product",
        fullConfig
      ),
      financials: this.aggregateDimensionInternal(
        findingsByDimension.financials ?? [],
        "financials",
        fullConfig
      ),
      timing: this.aggregateDimensionInternal(
        findingsByDimension.timing ?? [],
        "timing",
        fullConfig
      ),
    };

    // Calculate global score
    const globalResult = this.calculateGlobalScoreInternal(
      Object.values(dimensions),
      fullConfig
    );

    // Calculate expected variance
    const expectedVariance = this.calculateExpectedVariance(
      includedFindings,
      globalResult.score
    );

    // Count high confidence findings
    const highConfidenceFindings = includedFindings.filter(
      (f) => f.confidence.level === "high"
    ).length;

    // Count benchmarks used
    const benchmarksUsed = includedFindings.filter(
      (f) => f.benchmarkData !== undefined
    ).length;

    return {
      dealId,
      analysisId,
      globalScore: globalResult.score,
      globalConfidence: globalResult.confidence,
      dimensions,
      findings: includedFindings,
      totalFindings: findings.length,
      highConfidenceFindings,
      benchmarksUsed,
      analysisTimestamp: new Date(),
      expectedVariance,
    };
  }

  /**
   * Aggregate findings for a single dimension
   */
  aggregateDimension(
    findings: ScoredFinding[],
    dimension: string
  ): DimensionScore {
    return this.aggregateDimensionInternal(findings, dimension, DEFAULT_CONFIG);
  }

  /**
   * Calculate global score from dimension scores
   */
  calculateGlobalScore(dimensions: DimensionScore[]): AggregationResult {
    return this.calculateGlobalScoreInternal(dimensions, DEFAULT_CONFIG);
  }

  /**
   * Internal dimension aggregation with full config
   */
  private aggregateDimensionInternal(
    findings: ScoredFinding[],
    dimension: string,
    config: AggregationConfig
  ): DimensionScore {
    const weight =
      config.dimensionWeights[dimension as keyof typeof config.dimensionWeights] ??
      0.2;

    // Handle case with insufficient findings
    if (findings.length < config.minMetricsForDimension) {
      return {
        dimension,
        score: 0,
        weight,
        findings,
        aggregatedConfidence: {
          level: "insufficient",
          score: 0,
          factors: [
            {
              name: "Data Coverage",
              weight: 1,
              score: 0,
              reason: `Only ${findings.length} findings, need at least ${config.minMetricsForDimension}`,
            },
          ],
        },
        contributors: [],
      };
    }

    // Calculate weighted average score
    let weightedSum = 0;
    let totalWeight = 0;
    const contributors: DimensionContributor[] = [];

    for (const finding of findings) {
      // Get metric definition for weight
      const metricDef = metricRegistry.get(finding.metric);
      const metricWeight = metricDef?.weight ?? 0.1;

      // Get normalized value (0-100)
      let score = finding.normalizedValue ?? 0;
      if (finding.percentile !== undefined) {
        // Use percentile-based score if available
        score = metricRegistry.scoreValue(
          finding.metric,
          Number(finding.value) || 0,
          finding.percentile
        );
      }

      // Apply confidence weighting if enabled
      const confidenceMultiplier = config.confidenceWeightingEnabled
        ? finding.confidence.score / 100
        : 1;

      const effectiveWeight = metricWeight * confidenceMultiplier;
      weightedSum += score * effectiveWeight;
      totalWeight += effectiveWeight;

      contributors.push({
        findingId: finding.id,
        metric: finding.metric,
        contribution: (score * effectiveWeight) / 100,
        confidence: finding.confidence.level,
      });
    }

    const dimensionScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Aggregate confidence from all findings
    const aggregatedConfidence = confidenceCalculator.combineConfidences(
      findings.map((f) => f.confidence)
    );

    return {
      dimension,
      score: Math.round(dimensionScore),
      weight,
      findings,
      aggregatedConfidence,
      contributors,
    };
  }

  /**
   * Internal global score calculation with full config
   */
  private calculateGlobalScoreInternal(
    dimensions: DimensionScore[],
    config: AggregationConfig
  ): AggregationResult {
    const includedFindings: string[] = [];
    const excludedFindings: { id: string; reason: string }[] = [];
    const warnings: string[] = [];

    // Filter dimensions with sufficient data
    const scorableDimensions = dimensions.filter((d) => {
      if (d.aggregatedConfidence.level === "insufficient") {
        warnings.push(
          `Dimension ${d.dimension} has insufficient data (${d.findings.length} findings)`
        );
        for (const f of d.findings) {
          excludedFindings.push({
            id: f.id,
            reason: `Dimension ${d.dimension} excluded due to insufficient data`,
          });
        }
        return false;
      }

      for (const f of d.findings) {
        includedFindings.push(f.id);
      }
      return true;
    });

    // Handle case where no dimensions are scorable
    if (scorableDimensions.length === 0) {
      return {
        score: 0,
        confidence: {
          level: "insufficient",
          score: 0,
          factors: [
            {
              name: "Dimension Coverage",
              weight: 1,
              score: 0,
              reason: "No dimensions have sufficient data for scoring",
            },
          ],
        },
        includedFindings,
        excludedFindings,
        warnings,
      };
    }

    // Calculate weighted global score
    let weightedSum = 0;
    let totalWeight = 0;

    for (const dimension of scorableDimensions) {
      // Apply confidence weighting at dimension level too
      const confidenceMultiplier = config.confidenceWeightingEnabled
        ? dimension.aggregatedConfidence.score / 100
        : 1;

      const effectiveWeight = dimension.weight * confidenceMultiplier;
      weightedSum += dimension.score * effectiveWeight;
      totalWeight += effectiveWeight;
    }

    const globalScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Calculate global confidence
    const globalConfidence = confidenceCalculator.combineConfidences(
      scorableDimensions.map((d) => d.aggregatedConfidence)
    );

    // Warn if some dimensions are missing
    const missingDimensions = Object.keys(config.dimensionWeights).filter(
      (d) => !scorableDimensions.find((sd) => sd.dimension === d)
    );
    if (missingDimensions.length > 0) {
      warnings.push(
        `Missing data for dimensions: ${missingDimensions.join(", ")}`
      );
    }

    return {
      score: Math.round(globalScore),
      confidence: globalConfidence,
      includedFindings,
      excludedFindings,
      warnings,
    };
  }

  /**
   * Group findings by dimension
   */
  private groupByDimension(
    findings: ScoredFinding[]
  ): Record<string, ScoredFinding[]> {
    const groups: Record<string, ScoredFinding[]> = {};

    for (const finding of findings) {
      // Determine dimension from metric definition or category
      const metricDef = metricRegistry.get(finding.metric);
      let dimension: string;

      if (metricDef) {
        dimension = metricDef.dimension;
      } else {
        // Fallback: map category to dimension
        dimension = this.categoryToDimension(finding.category);
      }

      if (!groups[dimension]) {
        groups[dimension] = [];
      }
      groups[dimension].push(finding);
    }

    return groups;
  }

  /**
   * Map category to dimension
   */
  private categoryToDimension(category: string): string {
    for (const [dimension, categories] of Object.entries(DIMENSION_CATEGORIES)) {
      if (categories.includes(category)) {
        return dimension;
      }
    }
    return "product"; // Default fallback
  }

  /**
   * Calculate expected variance based on confidence distribution
   * Lower confidence = higher expected variance
   */
  private calculateExpectedVariance(
    findings: ScoredFinding[],
    globalScore: number
  ): number {
    if (findings.length === 0) return 25; // Max variance if no findings

    // Calculate variance based on confidence distribution
    const avgConfidence =
      findings.reduce((sum, f) => sum + f.confidence.score, 0) / findings.length;

    // Expected variance inversely proportional to confidence
    // At 100% confidence: ~0 variance
    // At 0% confidence: ~25 variance
    const baseVariance = 25 * (1 - avgConfidence / 100);

    // Reduce variance if we have many benchmark-anchored findings
    const benchmarkedRatio =
      findings.filter((f) => f.benchmarkData !== undefined).length /
      findings.length;
    const benchmarkReduction = benchmarkedRatio * 0.5; // Up to 50% reduction

    const finalVariance = baseVariance * (1 - benchmarkReduction);

    return Math.round(finalVariance * 10) / 10; // Round to 1 decimal
  }
}

// Singleton instance
export const scoreAggregator = new ScoreAggregator();

/**
 * Create a ScoredFinding from raw data
 * Utility function for agents to use
 */
export function createScoredFinding(
  data: Omit<ScoredFinding, "id" | "createdAt">
): ScoredFinding {
  return {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date(),
  };
}
