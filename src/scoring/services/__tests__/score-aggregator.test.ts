// ============================================================================
// SCORE AGGREGATOR TESTS
// Comprehensive tests for the scoring aggregation engine
// ============================================================================

import { describe, it, expect } from 'vitest';
import { scoreAggregator, createScoredFinding } from '../score-aggregator';
import type {
  ScoredFinding,
  ConfidenceScore,
  DimensionScore,
} from '../../types';

// ============================================================================
// TEST HELPERS
// ============================================================================

function makeConfidence(
  score: number,
  level: 'high' | 'medium' | 'low' | 'insufficient' = 'high'
): ConfidenceScore {
  return {
    level,
    score,
    factors: [
      { name: 'Test Factor', weight: 1, score, reason: 'test' },
    ],
  };
}

/**
 * Build a minimal ScoredFinding for testing.
 * Uses createScoredFinding to auto-generate id and createdAt.
 */
function makeFinding(overrides: {
  metric?: string;
  category?: ScoredFinding['category'];
  normalizedValue?: number;
  confidence?: ConfidenceScore;
  percentile?: number;
  value?: number | string | null;
  benchmarkData?: ScoredFinding['benchmarkData'];
}): ScoredFinding {
  return createScoredFinding({
    agentName: 'test-agent',
    metric: overrides.metric ?? 'founder_domain_expertise',
    category: overrides.category ?? 'team',
    value: overrides.value ?? 50,
    unit: 'score',
    normalizedValue: overrides.normalizedValue ?? 50,
    percentile: overrides.percentile,
    assessment: 'average',
    confidence: overrides.confidence ?? makeConfidence(80, 'high'),
    evidence: [
      { type: 'quote', content: 'test evidence', source: 'test', confidence: 0.8 },
    ],
    benchmarkData: overrides.benchmarkData,
  });
}

/**
 * Generate N findings for a given category/dimension.
 */
function makeFindingsForDimension(
  category: ScoredFinding['category'],
  count: number,
  normalizedValue: number,
  confidenceScore = 80
): ScoredFinding[] {
  const metricMap: Record<string, string[]> = {
    team: ['founder_domain_expertise', 'founder_entrepreneurial_exp', 'team_complementarity', 'team_size', 'key_hires_filled', 'network_strength'],
    financial: ['arr', 'arr_growth', 'gross_margin', 'burn_multiple', 'runway', 'cac_payback', 'ltv_cac_ratio', 'valuation_multiple'],
    market: ['tam', 'sam', 'market_growth_rate', 'market_concentration'],
    product: ['product_maturity', 'pmf_score', 'technical_moat'],
    customer: ['nrr', 'churn_rate'],
    competitive: ['competitive_window'],
    legal: ['regulatory_tailwind'],
  };
  const metrics = metricMap[category] ?? ['unknown_metric_1', 'unknown_metric_2', 'unknown_metric_3'];

  return Array.from({ length: count }, (_, i) =>
    makeFinding({
      metric: metrics[i % metrics.length],
      category,
      normalizedValue,
      confidence: makeConfidence(
        confidenceScore,
        confidenceScore >= 75 ? 'high' : confidenceScore >= 50 ? 'medium' : 'low'
      ),
    })
  );
}

// ============================================================================
// 1. NORMAL AGGREGATION WITH VALID SCORES
// ============================================================================

describe('Score Aggregator — Normal aggregation', () => {
  it('should aggregate findings across all dimensions and return a valid ObjectiveDealScore', () => {
    const findings: ScoredFinding[] = [
      ...makeFindingsForDimension('team', 3, 70),
      ...makeFindingsForDimension('market', 3, 60),
      ...makeFindingsForDimension('product', 3, 80),
      ...makeFindingsForDimension('financial', 3, 50),
      // timing uses market/competitive/legal categories
      ...makeFindingsForDimension('competitive', 2, 65),
      ...makeFindingsForDimension('legal', 1, 55),
    ];

    const result = scoreAggregator.aggregateFindings(findings, 'deal-1', 'analysis-1');

    expect(result.dealId).toBe('deal-1');
    expect(result.analysisId).toBe('analysis-1');
    expect(result.globalScore).toBeGreaterThanOrEqual(0);
    expect(result.globalScore).toBeLessThanOrEqual(100);
    expect(result.totalFindings).toBe(findings.length);
    expect(result.analysisTimestamp).toBeInstanceOf(Date);
  });

  it('should produce dimension scores within 0-100 for all 5 dimensions', () => {
    const findings: ScoredFinding[] = [
      ...makeFindingsForDimension('team', 3, 75),
      ...makeFindingsForDimension('market', 3, 65),
      ...makeFindingsForDimension('product', 3, 85),
      ...makeFindingsForDimension('financial', 3, 55),
      ...makeFindingsForDimension('competitive', 2, 60),
      ...makeFindingsForDimension('legal', 1, 50),
    ];

    const result = scoreAggregator.aggregateFindings(findings, 'deal-2', 'analysis-2');

    for (const dim of ['team', 'market', 'product', 'financials', 'timing'] as const) {
      expect(result.dimensions[dim].score).toBeGreaterThanOrEqual(0);
      expect(result.dimensions[dim].score).toBeLessThanOrEqual(100);
    }
  });
});

// ============================================================================
// 2. EDGE CASE: ALL SCORES ARE 0
// ============================================================================

describe('Score Aggregator — All scores 0', () => {
  it('should return globalScore of 0 when all normalizedValues are 0', () => {
    const findings: ScoredFinding[] = [
      ...makeFindingsForDimension('team', 3, 0),
      ...makeFindingsForDimension('market', 3, 0),
      ...makeFindingsForDimension('product', 3, 0),
      ...makeFindingsForDimension('financial', 3, 0),
      ...makeFindingsForDimension('competitive', 2, 0),
      ...makeFindingsForDimension('legal', 1, 0),
    ];

    const result = scoreAggregator.aggregateFindings(findings, 'd', 'a');

    expect(result.globalScore).toBe(0);
    expect(result.dimensions.team.score).toBe(0);
    expect(result.dimensions.market.score).toBe(0);
    expect(result.dimensions.product.score).toBe(0);
    expect(result.dimensions.financials.score).toBe(0);
    expect(result.dimensions.timing.score).toBe(0);
  });
});

// ============================================================================
// 3. EDGE CASE: ALL SCORES ARE 100
// ============================================================================

describe('Score Aggregator — All scores 100', () => {
  it('should return a globalScore of 100 when all normalizedValues are 100', () => {
    const findings: ScoredFinding[] = [
      ...makeFindingsForDimension('team', 3, 100, 100),
      ...makeFindingsForDimension('market', 3, 100, 100),
      ...makeFindingsForDimension('product', 3, 100, 100),
      ...makeFindingsForDimension('financial', 3, 100, 100),
      ...makeFindingsForDimension('competitive', 2, 100, 100),
      ...makeFindingsForDimension('legal', 1, 100, 100),
    ];

    const result = scoreAggregator.aggregateFindings(findings, 'd', 'a');

    expect(result.globalScore).toBe(100);
    expect(result.dimensions.team.score).toBe(100);
    expect(result.dimensions.market.score).toBe(100);
    expect(result.dimensions.product.score).toBe(100);
    expect(result.dimensions.financials.score).toBe(100);
    expect(result.dimensions.timing.score).toBe(100);
  });
});

// ============================================================================
// 4. EDGE CASE: EMPTY INPUT ARRAY
// ============================================================================

describe('Score Aggregator — Empty input', () => {
  it('should handle an empty findings array gracefully', () => {
    const result = scoreAggregator.aggregateFindings([], 'deal-empty', 'a-empty');

    expect(result.globalScore).toBe(0);
    expect(result.totalFindings).toBe(0);
    expect(result.findings).toHaveLength(0);
    expect(result.expectedVariance).toBe(25); // Max variance for no findings
  });

  it('should set all dimension scores to 0 with insufficient confidence', () => {
    const result = scoreAggregator.aggregateFindings([], 'deal-empty', 'a-empty');

    for (const dim of ['team', 'market', 'product', 'financials', 'timing'] as const) {
      expect(result.dimensions[dim].score).toBe(0);
      expect(result.dimensions[dim].aggregatedConfidence.level).toBe('insufficient');
    }
  });
});

// ============================================================================
// 5. SINGLE DIMENSION SCORE
// ============================================================================

describe('Score Aggregator — Single dimension', () => {
  it('should score a single dimension via aggregateDimension()', () => {
    const findings = makeFindingsForDimension('team', 3, 70);
    const dimScore = scoreAggregator.aggregateDimension(findings, 'team');

    expect(dimScore.dimension).toBe('team');
    expect(dimScore.score).toBeGreaterThanOrEqual(0);
    expect(dimScore.score).toBeLessThanOrEqual(100);
    expect(dimScore.findings).toHaveLength(3);
    expect(dimScore.contributors).toHaveLength(3);
  });

  it('should return insufficient when only 1 finding (below minMetrics=2)', () => {
    const findings = makeFindingsForDimension('team', 1, 70);
    const dimScore = scoreAggregator.aggregateDimension(findings, 'team');

    expect(dimScore.score).toBe(0);
    expect(dimScore.aggregatedConfidence.level).toBe('insufficient');
    expect(dimScore.contributors).toHaveLength(0);
  });
});

// ============================================================================
// 6. WEIGHT DISTRIBUTION VERIFICATION
// ============================================================================

describe('Score Aggregator — Weight distribution', () => {
  it('default dimension weights should sum to 1.0', () => {
    const weights = {
      team: 0.25,
      market: 0.20,
      product: 0.20,
      financials: 0.20,
      timing: 0.15,
    };
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('dimension weights should be reflected in the DimensionScore objects', () => {
    const findings: ScoredFinding[] = [
      ...makeFindingsForDimension('team', 3, 70),
      ...makeFindingsForDimension('market', 3, 60),
      ...makeFindingsForDimension('product', 3, 80),
      ...makeFindingsForDimension('financial', 3, 50),
      ...makeFindingsForDimension('competitive', 2, 65),
      ...makeFindingsForDimension('legal', 1, 55),
    ];

    const result = scoreAggregator.aggregateFindings(findings, 'd', 'a');

    expect(result.dimensions.team.weight).toBe(0.25);
    expect(result.dimensions.market.weight).toBe(0.20);
    expect(result.dimensions.product.weight).toBe(0.20);
    expect(result.dimensions.financials.weight).toBe(0.20);
    expect(result.dimensions.timing.weight).toBe(0.15);
  });

  it('should accept custom dimension weights via config', () => {
    const customWeights = {
      team: 0.10,
      market: 0.10,
      product: 0.10,
      financials: 0.60,
      timing: 0.10,
    };

    const findings: ScoredFinding[] = [
      ...makeFindingsForDimension('team', 3, 70),
      ...makeFindingsForDimension('market', 3, 60),
      ...makeFindingsForDimension('product', 3, 80),
      ...makeFindingsForDimension('financial', 3, 50),
      ...makeFindingsForDimension('competitive', 2, 65),
      ...makeFindingsForDimension('legal', 1, 55),
    ];

    const result = scoreAggregator.aggregateFindings(findings, 'd', 'a', {
      dimensionWeights: customWeights,
    });

    expect(result.dimensions.financials.weight).toBe(0.60);
    expect(result.dimensions.team.weight).toBe(0.10);
  });
});

// ============================================================================
// 7. SCORE CLAMPING (normalizedValue outside 0-100)
// ============================================================================

describe('Score Aggregator — Score clamping', () => {
  it('should handle normalizedValue > 100 without crashing', () => {
    // The aggregator does not clamp normalizedValue itself (it trusts the input),
    // but should not produce NaN or crash
    const findings = [
      makeFinding({ category: 'team', metric: 'founder_domain_expertise', normalizedValue: 150 }),
      makeFinding({ category: 'team', metric: 'founder_entrepreneurial_exp', normalizedValue: 120 }),
    ];

    const dimScore = scoreAggregator.aggregateDimension(findings, 'team');

    // Score may be > 100 since the aggregator uses raw normalizedValue without clamping
    expect(dimScore.score).toBeGreaterThan(0);
    expect(typeof dimScore.score).toBe('number');
    expect(Number.isNaN(dimScore.score)).toBe(false);
  });

  it('should handle negative normalizedValue without crashing', () => {
    const findings = [
      makeFinding({ category: 'team', metric: 'founder_domain_expertise', normalizedValue: -10 }),
      makeFinding({ category: 'team', metric: 'founder_entrepreneurial_exp', normalizedValue: -5 }),
    ];

    const dimScore = scoreAggregator.aggregateDimension(findings, 'team');

    expect(typeof dimScore.score).toBe('number');
    expect(Number.isNaN(dimScore.score)).toBe(false);
  });
});

// ============================================================================
// 8. MISSING DIMENSIONS HANDLING
// ============================================================================

describe('Score Aggregator — Missing dimensions', () => {
  it('should produce warnings when some dimensions have no findings', () => {
    // Only provide team findings, missing market/product/financials/timing
    const findings = makeFindingsForDimension('team', 3, 70);

    const result = scoreAggregator.aggregateFindings(findings, 'd', 'a');

    // Dimensions without findings should be marked insufficient
    expect(result.dimensions.market.aggregatedConfidence.level).toBe('insufficient');
    expect(result.dimensions.product.aggregatedConfidence.level).toBe('insufficient');
    expect(result.dimensions.financials.aggregatedConfidence.level).toBe('insufficient');
    expect(result.dimensions.timing.aggregatedConfidence.level).toBe('insufficient');
  });

  it('should still produce a valid global score when only one dimension has data', () => {
    const findings = makeFindingsForDimension('team', 3, 70);
    const result = scoreAggregator.aggregateFindings(findings, 'd', 'a');

    expect(result.globalScore).toBeGreaterThanOrEqual(0);
    expect(result.globalScore).toBeLessThanOrEqual(100);
    expect(typeof result.globalScore).toBe('number');
    expect(Number.isNaN(result.globalScore)).toBe(false);
  });

  it('calculateGlobalScore should warn about missing dimensions', () => {
    // Build dimension scores with only team having real data
    const teamDim: DimensionScore = {
      dimension: 'team',
      score: 70,
      weight: 0.25,
      findings: makeFindingsForDimension('team', 3, 70),
      aggregatedConfidence: makeConfidence(80, 'high'),
      contributors: [],
    };
    const emptyDim = (dim: string, weight: number): DimensionScore => ({
      dimension: dim,
      score: 0,
      weight,
      findings: [],
      aggregatedConfidence: { level: 'insufficient', score: 0, factors: [] },
      contributors: [],
    });

    const globalResult = scoreAggregator.calculateGlobalScore([
      teamDim,
      emptyDim('market', 0.20),
      emptyDim('product', 0.20),
      emptyDim('financials', 0.20),
      emptyDim('timing', 0.15),
    ]);

    expect(globalResult.warnings.length).toBeGreaterThan(0);
    expect(globalResult.warnings.some(w => w.includes('Missing data'))).toBe(true);
  });
});

// ============================================================================
// 9. CONFIDENCE FILTERING (minConfidenceForInclusion)
// ============================================================================

describe('Score Aggregator — Confidence filtering', () => {
  it('should exclude findings below the confidence threshold', () => {
    const highConfFindings = makeFindingsForDimension('team', 2, 70, 80);
    const lowConfFindings = makeFindingsForDimension('team', 2, 70, 10); // Below default 25

    const allFindings = [...highConfFindings, ...lowConfFindings];
    const result = scoreAggregator.aggregateFindings(allFindings, 'd', 'a');

    // totalFindings counts ALL input findings
    expect(result.totalFindings).toBe(4);
    // But only 2 high-confidence findings are included
    expect(result.findings).toHaveLength(2);
  });

  it('should respect custom minConfidenceForInclusion', () => {
    // 3 findings at confidence=60, 2 at confidence=40
    const medium = makeFindingsForDimension('team', 3, 70, 60);
    const lower = makeFindingsForDimension('team', 2, 70, 40);

    const allFindings = [...medium, ...lower];

    // Set threshold to 50: should exclude the 2 findings at 40
    const result = scoreAggregator.aggregateFindings(allFindings, 'd', 'a', {
      minConfidenceForInclusion: 50,
    });

    expect(result.findings).toHaveLength(3);
  });
});

// ============================================================================
// 10. RESULT STRUCTURE VALIDATION
// ============================================================================

describe('Score Aggregator — Result structure', () => {
  it('ObjectiveDealScore should contain all required fields', () => {
    const findings: ScoredFinding[] = [
      ...makeFindingsForDimension('team', 3, 70),
      ...makeFindingsForDimension('market', 3, 60),
      ...makeFindingsForDimension('product', 3, 80),
      ...makeFindingsForDimension('financial', 3, 50),
      ...makeFindingsForDimension('competitive', 2, 65),
      ...makeFindingsForDimension('legal', 1, 55),
    ];

    const result = scoreAggregator.aggregateFindings(findings, 'deal-x', 'analysis-x');

    // Top-level fields
    expect(result).toHaveProperty('dealId', 'deal-x');
    expect(result).toHaveProperty('analysisId', 'analysis-x');
    expect(result).toHaveProperty('globalScore');
    expect(result).toHaveProperty('globalConfidence');
    expect(result).toHaveProperty('dimensions');
    expect(result).toHaveProperty('findings');
    expect(result).toHaveProperty('totalFindings');
    expect(result).toHaveProperty('highConfidenceFindings');
    expect(result).toHaveProperty('benchmarksUsed');
    expect(result).toHaveProperty('analysisTimestamp');
    expect(result).toHaveProperty('expectedVariance');

    // Dimension structure
    for (const dim of ['team', 'market', 'product', 'financials', 'timing'] as const) {
      expect(result.dimensions[dim]).toHaveProperty('dimension', dim);
      expect(result.dimensions[dim]).toHaveProperty('score');
      expect(result.dimensions[dim]).toHaveProperty('weight');
      expect(result.dimensions[dim]).toHaveProperty('findings');
      expect(result.dimensions[dim]).toHaveProperty('aggregatedConfidence');
      expect(result.dimensions[dim]).toHaveProperty('contributors');
    }

    // Confidence structure
    expect(result.globalConfidence).toHaveProperty('level');
    expect(result.globalConfidence).toHaveProperty('score');
    expect(result.globalConfidence).toHaveProperty('factors');
  });

  it('AggregationResult from calculateGlobalScore should have correct shape', () => {
    const dims: DimensionScore[] = [
      {
        dimension: 'team',
        score: 70,
        weight: 0.25,
        findings: makeFindingsForDimension('team', 3, 70),
        aggregatedConfidence: makeConfidence(80, 'high'),
        contributors: [],
      },
    ];

    const globalResult = scoreAggregator.calculateGlobalScore(dims);

    expect(globalResult).toHaveProperty('score');
    expect(globalResult).toHaveProperty('confidence');
    expect(globalResult).toHaveProperty('includedFindings');
    expect(globalResult).toHaveProperty('excludedFindings');
    expect(globalResult).toHaveProperty('warnings');
    expect(Array.isArray(globalResult.includedFindings)).toBe(true);
    expect(Array.isArray(globalResult.excludedFindings)).toBe(true);
    expect(Array.isArray(globalResult.warnings)).toBe(true);
  });
});

// ============================================================================
// 11. WEIGHTED AVERAGE CALCULATION ACCURACY
// ============================================================================

describe('Score Aggregator — Weighted average accuracy', () => {
  it('should produce a global score that is a weighted average of dimension scores', () => {
    // Use equal confidence (100%) so confidence weighting doesn't distort
    const findings: ScoredFinding[] = [
      ...makeFindingsForDimension('team', 3, 80, 100),
      ...makeFindingsForDimension('market', 3, 60, 100),
      ...makeFindingsForDimension('product', 3, 40, 100),
      ...makeFindingsForDimension('financial', 3, 20, 100),
      ...makeFindingsForDimension('competitive', 2, 70, 100),
      ...makeFindingsForDimension('legal', 1, 50, 100),
    ];

    const result = scoreAggregator.aggregateFindings(findings, 'd', 'a');

    // With confidence=100, the dimension-level confidence multiplier is 1.0.
    // So the global score should be:
    // sum(dimension.score * dimension.weight) / sum(dimension.weight)
    // Which simplifies to a standard weighted average since all dims are scorable.
    const dimWeights = { team: 0.25, market: 0.20, product: 0.20, financials: 0.20, timing: 0.15 };
    let weightedSum = 0;
    let totalWeight = 0;
    for (const dim of ['team', 'market', 'product', 'financials', 'timing'] as const) {
      const ds = result.dimensions[dim];
      if (ds.aggregatedConfidence.level !== 'insufficient') {
        // At 100% confidence, confidenceMultiplier = aggregatedConfidence.score / 100
        const confMul = ds.aggregatedConfidence.score / 100;
        const effWeight = dimWeights[dim] * confMul;
        weightedSum += ds.score * effWeight;
        totalWeight += effWeight;
      }
    }
    const expectedGlobal = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

    expect(result.globalScore).toBe(expectedGlobal);
  });

  it('higher-confidence dimensions should influence global score more', () => {
    // Team has high confidence, market has low confidence
    // Both have same raw score — the high-confidence one should dominate
    const teamFindings = makeFindingsForDimension('team', 3, 90, 95);
    const marketFindings = makeFindingsForDimension('market', 3, 10, 30);

    const result = scoreAggregator.aggregateFindings(
      [...teamFindings, ...marketFindings],
      'd', 'a'
    );

    // Global score should lean toward team's 90 rather than being 50
    // because team has much higher confidence weight
    expect(result.globalScore).toBeGreaterThan(50);
  });
});

// ============================================================================
// 12. CONFIDENCE WEIGHTING TOGGLE
// ============================================================================

describe('Score Aggregator — Confidence weighting toggle', () => {
  it('should ignore confidence weighting when confidenceWeightingEnabled=false', () => {
    const findings: ScoredFinding[] = [
      ...makeFindingsForDimension('team', 3, 80, 30), // low confidence
      ...makeFindingsForDimension('market', 3, 80, 90), // high confidence
    ];

    scoreAggregator.aggregateFindings(findings, 'd', 'a', {
      confidenceWeightingEnabled: true,
    });
    const withoutWeighting = scoreAggregator.aggregateFindings(findings, 'd', 'a', {
      confidenceWeightingEnabled: false,
    });

    // Without confidence weighting, both dimensions should have the same
    // effective score (80), so global should be closer to 80
    // With confidence weighting, the low-confidence dimension is discounted
    expect(withoutWeighting.dimensions.team.score).toBe(
      withoutWeighting.dimensions.market.score
    );
  });
});

// ============================================================================
// 13. EXPECTED VARIANCE CALCULATION
// ============================================================================

describe('Score Aggregator — Expected variance', () => {
  it('should return max variance (25) when no findings', () => {
    const result = scoreAggregator.aggregateFindings([], 'd', 'a');
    expect(result.expectedVariance).toBe(25);
  });

  it('should return lower variance with higher confidence findings', () => {
    const highConf = [
      ...makeFindingsForDimension('team', 3, 70, 95),
      ...makeFindingsForDimension('market', 3, 60, 95),
    ];
    const lowConf = [
      ...makeFindingsForDimension('team', 3, 70, 30),
      ...makeFindingsForDimension('market', 3, 60, 30),
    ];

    const highResult = scoreAggregator.aggregateFindings(highConf, 'd', 'a');
    const lowResult = scoreAggregator.aggregateFindings(lowConf, 'd', 'a');

    expect(highResult.expectedVariance).toBeLessThan(lowResult.expectedVariance);
  });

  it('should further reduce variance when findings have benchmark data', () => {
    const benchmark = {
      sector: 'saas',
      stage: 'seed',
      metric: 'ARR',
      p25: 100000,
      median: 500000,
      p75: 1500000,
      source: 'test-benchmark',
    };

    const withBenchmark = makeFindingsForDimension('team', 3, 70, 80).map(f => ({
      ...f,
      benchmarkData: benchmark,
    }));
    const withoutBenchmark = makeFindingsForDimension('market', 3, 70, 80);

    const benchResult = scoreAggregator.aggregateFindings(
      [...withBenchmark, ...withoutBenchmark],
      'd', 'a'
    );
    const noBenchResult = scoreAggregator.aggregateFindings(
      [...makeFindingsForDimension('team', 3, 70, 80), ...withoutBenchmark],
      'd', 'a'
    );

    // With benchmarks, variance should be reduced
    expect(benchResult.expectedVariance).toBeLessThanOrEqual(noBenchResult.expectedVariance);
  });
});

// ============================================================================
// 14. CATEGORY-TO-DIMENSION MAPPING
// ============================================================================

describe('Score Aggregator — Category to dimension mapping', () => {
  it('should map "team" category to team dimension', () => {
    const findings = makeFindingsForDimension('team', 3, 70);
    const result = scoreAggregator.aggregateFindings(findings, 'd', 'a');

    expect(result.dimensions.team.findings.length).toBe(3);
  });

  it('should map "financial" category to financials dimension', () => {
    const findings = makeFindingsForDimension('financial', 3, 70);
    const result = scoreAggregator.aggregateFindings(findings, 'd', 'a');

    expect(result.dimensions.financials.findings.length).toBe(3);
  });

  it('should map "customer" and "technical" categories to product dimension', () => {
    const customerFindings = makeFindingsForDimension('customer', 2, 60);
    const technicalFindings = [
      makeFinding({ category: 'technical', metric: 'technical_moat', normalizedValue: 55 }),
    ];

    const result = scoreAggregator.aggregateFindings(
      [...customerFindings, ...technicalFindings],
      'd', 'a'
    );

    // customer + technical -> product dimension
    expect(result.dimensions.product.findings.length).toBe(3);
  });

  it('should map "competitive" and "legal" categories to timing dimension', () => {
    const competitiveFindings = makeFindingsForDimension('competitive', 2, 60);
    const legalFindings = makeFindingsForDimension('legal', 2, 50);

    const result = scoreAggregator.aggregateFindings(
      [...competitiveFindings, ...legalFindings],
      'd', 'a'
    );

    // competitive + legal -> timing dimension
    expect(result.dimensions.timing.findings.length).toBe(4);
  });
});

// ============================================================================
// 15. createScoredFinding UTILITY
// ============================================================================

describe('createScoredFinding utility', () => {
  it('should auto-generate id and createdAt', () => {
    const finding = createScoredFinding({
      agentName: 'test-agent',
      metric: 'arr',
      category: 'financial',
      value: 1000000,
      unit: '€',
      normalizedValue: 75,
      assessment: 'above_average',
      confidence: makeConfidence(80, 'high'),
      evidence: [],
    });

    expect(finding.id).toBeDefined();
    expect(typeof finding.id).toBe('string');
    expect(finding.id.length).toBeGreaterThan(0);
    expect(finding.createdAt).toBeInstanceOf(Date);
  });

  it('should preserve all provided fields', () => {
    const conf = makeConfidence(90, 'high');
    const finding = createScoredFinding({
      agentName: 'financial-auditor',
      metric: 'arr_growth',
      category: 'financial',
      value: 150,
      unit: '%',
      normalizedValue: 85,
      assessment: 'exceptional',
      confidence: conf,
      evidence: [{ type: 'calculation', content: '150%', source: 'deck', confidence: 0.9 }],
    });

    expect(finding.agentName).toBe('financial-auditor');
    expect(finding.metric).toBe('arr_growth');
    expect(finding.category).toBe('financial');
    expect(finding.value).toBe(150);
    expect(finding.unit).toBe('%');
    expect(finding.normalizedValue).toBe(85);
    expect(finding.confidence).toEqual(conf);
  });
});

// ============================================================================
// 16. HIGH CONFIDENCE FINDINGS COUNT
// ============================================================================

describe('Score Aggregator — Metadata counters', () => {
  it('should correctly count high confidence findings', () => {
    const findings: ScoredFinding[] = [
      ...makeFindingsForDimension('team', 2, 70, 90),  // high (>= 75)
      ...makeFindingsForDimension('market', 2, 60, 50), // medium (< 75)
    ];

    const result = scoreAggregator.aggregateFindings(findings, 'd', 'a');

    expect(result.highConfidenceFindings).toBe(2);
  });

  it('should correctly count benchmarks used', () => {
    const benchmark = {
      sector: 'saas',
      stage: 'seed',
      metric: 'ARR',
      p25: 100000,
      median: 500000,
      p75: 1500000,
      source: 'test',
    };

    const findings: ScoredFinding[] = [
      makeFinding({ category: 'team', metric: 'founder_domain_expertise', normalizedValue: 70, benchmarkData: benchmark }),
      makeFinding({ category: 'team', metric: 'founder_entrepreneurial_exp', normalizedValue: 60 }),
      makeFinding({ category: 'team', metric: 'team_complementarity', normalizedValue: 80, benchmarkData: benchmark }),
    ];

    const result = scoreAggregator.aggregateFindings(findings, 'd', 'a');

    expect(result.benchmarksUsed).toBe(2);
  });
});

// ============================================================================
// 17. CUSTOM minMetricsForDimension
// ============================================================================

describe('Score Aggregator — Custom minMetricsForDimension', () => {
  it('should mark dimension as insufficient when below custom minMetrics', () => {
    const findings = makeFindingsForDimension('team', 2, 70);

    // Default minMetricsForDimension=2, so 2 findings should work
    const result2 = scoreAggregator.aggregateFindings(findings, 'd', 'a', {
      minMetricsForDimension: 2,
    });
    expect(result2.dimensions.team.aggregatedConfidence.level).not.toBe('insufficient');

    // But with minMetricsForDimension=3, 2 findings is insufficient
    const result3 = scoreAggregator.aggregateFindings(findings, 'd', 'a', {
      minMetricsForDimension: 3,
    });
    expect(result3.dimensions.team.aggregatedConfidence.level).toBe('insufficient');
    expect(result3.dimensions.team.score).toBe(0);
  });
});
