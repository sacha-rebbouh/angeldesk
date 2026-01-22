/**
 * Metric Registry
 * Defines all metrics with validation, weights, and benchmark mappings
 */

import type {
  FindingCategory,
  IMetricRegistry,
  MetricDefinition,
  ObjectiveDealScore,
} from "../types";

// Type for dimension keys
type DimensionKey = keyof ObjectiveDealScore["dimensions"];

// Built-in metric definitions
const BUILT_IN_METRICS: MetricDefinition[] = [
  // ============================================================================
  // FINANCIAL METRICS
  // ============================================================================
  {
    name: "arr",
    displayName: "Annual Recurring Revenue",
    category: "financial",
    dimension: "financials",
    weight: 0.15,
    direction: "higher_better",
    minValue: 0,
    unit: "€",
    benchmarkMetricName: "ARR",
    calculationType: "direct",
  },
  {
    name: "arr_growth",
    displayName: "ARR Growth (YoY)",
    category: "financial",
    dimension: "financials",
    weight: 0.20,
    direction: "higher_better",
    minValue: -100,
    maxValue: 1000,
    unit: "%",
    benchmarkMetricName: "ARR Growth YoY",
    calculationType: "direct",
  },
  {
    name: "gross_margin",
    displayName: "Gross Margin",
    category: "financial",
    dimension: "financials",
    weight: 0.10,
    direction: "higher_better",
    minValue: 0,
    maxValue: 100,
    unit: "%",
    benchmarkMetricName: "Gross Margin",
    calculationType: "direct",
  },
  {
    name: "burn_multiple",
    displayName: "Burn Multiple",
    category: "financial",
    dimension: "financials",
    weight: 0.15,
    direction: "lower_better",
    minValue: 0,
    unit: "x",
    benchmarkMetricName: "Burn Multiple",
    calculationType: "derived",
    formula: "net_burn / net_new_arr",
  },
  {
    name: "runway",
    displayName: "Runway",
    category: "financial",
    dimension: "financials",
    weight: 0.10,
    direction: "higher_better",
    minValue: 0,
    unit: "months",
    benchmarkMetricName: "Runway",
    calculationType: "derived",
    formula: "cash / monthly_burn",
  },
  {
    name: "cac_payback",
    displayName: "CAC Payback",
    category: "financial",
    dimension: "financials",
    weight: 0.10,
    direction: "lower_better",
    minValue: 0,
    maxValue: 60,
    unit: "months",
    benchmarkMetricName: "CAC Payback",
    calculationType: "derived",
    formula: "cac / (arpu * gross_margin)",
  },
  {
    name: "ltv_cac_ratio",
    displayName: "LTV/CAC Ratio",
    category: "financial",
    dimension: "financials",
    weight: 0.10,
    direction: "higher_better",
    minValue: 0,
    maxValue: 20,
    unit: "x",
    benchmarkMetricName: "LTV/CAC Ratio",
    calculationType: "derived",
    formula: "ltv / cac",
    dependencies: ["ltv", "cac"],
  },
  {
    name: "valuation_multiple",
    displayName: "Valuation Multiple (ARR)",
    category: "financial",
    dimension: "financials",
    weight: 0.10,
    direction: "target_range",
    targetRange: { min: 5, max: 20 },
    minValue: 0,
    unit: "x",
    benchmarkMetricName: "Valuation Multiple",
    calculationType: "derived",
    formula: "pre_money_valuation / arr",
  },

  // ============================================================================
  // TEAM METRICS
  // ============================================================================
  {
    name: "founder_domain_expertise",
    displayName: "Founder Domain Expertise",
    category: "team",
    dimension: "team",
    weight: 0.25,
    direction: "higher_better",
    minValue: 0,
    maxValue: 100,
    unit: "score",
    benchmarkMetricName: "Founder Expertise Score",
    calculationType: "composite",
  },
  {
    name: "founder_entrepreneurial_exp",
    displayName: "Founder Entrepreneurial Experience",
    category: "team",
    dimension: "team",
    weight: 0.20,
    direction: "higher_better",
    minValue: 0,
    maxValue: 100,
    unit: "score",
    benchmarkMetricName: "Entrepreneurial Experience Score",
    calculationType: "composite",
  },
  {
    name: "team_complementarity",
    displayName: "Team Complementarity",
    category: "team",
    dimension: "team",
    weight: 0.20,
    direction: "higher_better",
    minValue: 0,
    maxValue: 100,
    unit: "score",
    benchmarkMetricName: "Team Complementarity Score",
    calculationType: "composite",
  },
  {
    name: "team_size",
    displayName: "Team Size",
    category: "team",
    dimension: "team",
    weight: 0.10,
    direction: "target_range",
    targetRange: { min: 3, max: 15 },
    minValue: 1,
    unit: "people",
    benchmarkMetricName: "Team Size",
    calculationType: "direct",
  },
  {
    name: "key_hires_filled",
    displayName: "Key Hires Filled",
    category: "team",
    dimension: "team",
    weight: 0.15,
    direction: "higher_better",
    minValue: 0,
    maxValue: 100,
    unit: "%",
    benchmarkMetricName: "Key Hires %",
    calculationType: "composite",
  },
  {
    name: "network_strength",
    displayName: "Network Strength",
    category: "team",
    dimension: "team",
    weight: 0.10,
    direction: "higher_better",
    minValue: 0,
    maxValue: 100,
    unit: "score",
    benchmarkMetricName: "Network Score",
    calculationType: "composite",
  },

  // ============================================================================
  // MARKET METRICS
  // ============================================================================
  {
    name: "tam",
    displayName: "Total Addressable Market",
    category: "market",
    dimension: "market",
    weight: 0.15,
    direction: "higher_better",
    minValue: 0,
    unit: "€",
    benchmarkMetricName: "TAM",
    calculationType: "direct",
  },
  {
    name: "sam",
    displayName: "Serviceable Addressable Market",
    category: "market",
    dimension: "market",
    weight: 0.15,
    direction: "higher_better",
    minValue: 0,
    unit: "€",
    benchmarkMetricName: "SAM",
    calculationType: "direct",
  },
  {
    name: "market_growth_rate",
    displayName: "Market Growth Rate (CAGR)",
    category: "market",
    dimension: "market",
    weight: 0.20,
    direction: "higher_better",
    minValue: -50,
    maxValue: 200,
    unit: "%",
    benchmarkMetricName: "Market CAGR",
    calculationType: "direct",
  },
  {
    name: "market_concentration",
    displayName: "Market Concentration",
    category: "market",
    dimension: "market",
    weight: 0.10,
    direction: "target_range",
    targetRange: { min: 20, max: 60 },
    minValue: 0,
    maxValue: 100,
    unit: "%",
    benchmarkMetricName: "Market HHI",
    calculationType: "composite",
  },
  {
    name: "market_timing",
    displayName: "Market Timing Score",
    category: "market",
    dimension: "timing",
    weight: 0.40,
    direction: "higher_better",
    minValue: 0,
    maxValue: 100,
    unit: "score",
    benchmarkMetricName: "Timing Score",
    calculationType: "composite",
  },

  // ============================================================================
  // PRODUCT METRICS
  // ============================================================================
  {
    name: "product_maturity",
    displayName: "Product Maturity",
    category: "product",
    dimension: "product",
    weight: 0.20,
    direction: "higher_better",
    minValue: 0,
    maxValue: 100,
    unit: "score",
    benchmarkMetricName: "Product Maturity Score",
    calculationType: "composite",
  },
  {
    name: "nrr",
    displayName: "Net Revenue Retention",
    category: "customer",
    dimension: "product",
    weight: 0.25,
    direction: "higher_better",
    minValue: 0,
    maxValue: 200,
    unit: "%",
    benchmarkMetricName: "Net Revenue Retention",
    calculationType: "direct",
  },
  {
    name: "churn_rate",
    displayName: "Monthly Churn Rate",
    category: "customer",
    dimension: "product",
    weight: 0.15,
    direction: "lower_better",
    minValue: 0,
    maxValue: 100,
    unit: "%",
    benchmarkMetricName: "Monthly Churn",
    calculationType: "direct",
  },
  {
    name: "pmf_score",
    displayName: "Product-Market Fit Score",
    category: "product",
    dimension: "product",
    weight: 0.25,
    direction: "higher_better",
    minValue: 0,
    maxValue: 100,
    unit: "score",
    benchmarkMetricName: "PMF Score",
    calculationType: "composite",
  },
  {
    name: "technical_moat",
    displayName: "Technical Moat Strength",
    category: "technical",
    dimension: "product",
    weight: 0.15,
    direction: "higher_better",
    minValue: 0,
    maxValue: 100,
    unit: "score",
    benchmarkMetricName: "Moat Score",
    calculationType: "composite",
  },

  // ============================================================================
  // TIMING METRICS
  // ============================================================================
  {
    name: "adoption_curve_position",
    displayName: "Adoption Curve Position",
    category: "market",
    dimension: "timing",
    weight: 0.30,
    direction: "target_range",
    targetRange: { min: 20, max: 50 },
    minValue: 0,
    maxValue: 100,
    unit: "%",
    benchmarkMetricName: "Adoption Position",
    calculationType: "composite",
  },
  {
    name: "regulatory_tailwind",
    displayName: "Regulatory Tailwind",
    category: "legal",
    dimension: "timing",
    weight: 0.15,
    direction: "higher_better",
    minValue: -100,
    maxValue: 100,
    unit: "score",
    benchmarkMetricName: "Regulatory Score",
    calculationType: "composite",
  },
  {
    name: "competitive_window",
    displayName: "Competitive Window",
    category: "competitive",
    dimension: "timing",
    weight: 0.15,
    direction: "higher_better",
    minValue: 0,
    maxValue: 100,
    unit: "score",
    benchmarkMetricName: "Window Score",
    calculationType: "composite",
  },
];

class MetricRegistry implements IMetricRegistry {
  private metrics: Map<string, MetricDefinition> = new Map();
  private byDimension: Map<DimensionKey, MetricDefinition[]> = new Map();
  private byCategory: Map<FindingCategory, MetricDefinition[]> = new Map();

  constructor() {
    // Register built-in metrics
    for (const metric of BUILT_IN_METRICS) {
      this.register(metric);
    }
  }

  /**
   * Register a metric definition
   */
  register(metric: MetricDefinition): void {
    this.metrics.set(metric.name, metric);

    // Index by dimension
    const dimensionKey = metric.dimension as DimensionKey;
    const dimensionMetrics = this.byDimension.get(dimensionKey) ?? [];
    dimensionMetrics.push(metric);
    this.byDimension.set(dimensionKey, dimensionMetrics);

    // Index by category
    const categoryMetrics = this.byCategory.get(metric.category) ?? [];
    categoryMetrics.push(metric);
    this.byCategory.set(metric.category, categoryMetrics);
  }

  /**
   * Get metric by name
   */
  get(name: string): MetricDefinition | undefined {
    return this.metrics.get(name);
  }

  /**
   * Get all metrics for a dimension
   */
  getByDimension(dimension: string): MetricDefinition[] {
    return this.byDimension.get(dimension as DimensionKey) ?? [];
  }

  /**
   * Get all metrics for a category
   */
  getByCategory(category: FindingCategory): MetricDefinition[] {
    return this.byCategory.get(category) ?? [];
  }

  /**
   * Validate a value against metric constraints
   */
  validateValue(metricName: string, value: number): boolean {
    const metric = this.metrics.get(metricName);
    if (!metric) return true; // Unknown metric, allow

    if (metric.minValue !== undefined && value < metric.minValue) {
      return false;
    }
    if (metric.maxValue !== undefined && value > metric.maxValue) {
      return false;
    }

    return true;
  }

  /**
   * Get score for a metric value based on its definition
   * Returns 0-100 normalized score
   */
  scoreValue(metricName: string, value: number, percentile?: number): number {
    const metric = this.metrics.get(metricName);
    if (!metric) return 50; // Unknown metric, neutral score

    // If we have a percentile from benchmark comparison, use it
    if (percentile !== undefined) {
      return this.percentileToScore(percentile, metric);
    }

    // Otherwise, calculate based on direction and ranges
    switch (metric.direction) {
      case "higher_better":
        return this.scoreHigherBetter(value, metric);
      case "lower_better":
        return this.scoreLowerBetter(value, metric);
      case "target_range":
        return this.scoreTargetRange(value, metric);
      default:
        return 50;
    }
  }

  /**
   * Convert percentile to score based on metric direction
   */
  private percentileToScore(
    percentile: number,
    metric: MetricDefinition
  ): number {
    switch (metric.direction) {
      case "higher_better":
        return percentile; // Direct mapping
      case "lower_better":
        return 100 - percentile; // Inverse mapping
      case "target_range":
        // Peak at 50th percentile, drops off at extremes
        const deviation = Math.abs(percentile - 50);
        return Math.max(0, 100 - deviation * 2);
      default:
        return percentile;
    }
  }

  /**
   * Score for "higher is better" metrics
   */
  private scoreHigherBetter(value: number, metric: MetricDefinition): number {
    if (metric.minValue === undefined) return 50;

    const min = metric.minValue;
    const max = metric.maxValue ?? min * 10;

    if (value <= min) return 0;
    if (value >= max) return 100;

    return ((value - min) / (max - min)) * 100;
  }

  /**
   * Score for "lower is better" metrics
   */
  private scoreLowerBetter(value: number, metric: MetricDefinition): number {
    if (metric.maxValue === undefined) return 50;

    const min = metric.minValue ?? 0;
    const max = metric.maxValue;

    if (value >= max) return 0;
    if (value <= min) return 100;

    return ((max - value) / (max - min)) * 100;
  }

  /**
   * Score for target range metrics
   */
  private scoreTargetRange(value: number, metric: MetricDefinition): number {
    if (!metric.targetRange) return 50;

    const { min, max } = metric.targetRange;
    const mid = (min + max) / 2;

    if (value >= min && value <= max) {
      // Within range - score based on distance from center
      const distanceFromCenter = Math.abs(value - mid);
      const halfRange = (max - min) / 2;
      return 100 - (distanceFromCenter / halfRange) * 20; // 80-100 within range
    }

    // Outside range - penalty based on distance
    if (value < min) {
      const distance = min - value;
      const penalty = Math.min(80, (distance / min) * 100);
      return Math.max(0, 80 - penalty);
    }

    // value > max
    const distance = value - max;
    const penalty = Math.min(80, (distance / max) * 100);
    return Math.max(0, 80 - penalty);
  }

  /**
   * Get all registered metric names
   */
  getAllMetricNames(): string[] {
    return Array.from(this.metrics.keys());
  }

  /**
   * Get dimension weight for final score calculation
   */
  getDimensionWeight(dimension: string): number {
    const metrics = this.getByDimension(dimension);
    if (metrics.length === 0) return 0.2; // Default weight

    // Sum up weights of metrics in this dimension
    const totalWeight = metrics.reduce((sum, m) => sum + m.weight, 0);
    return totalWeight;
  }
}

// Singleton instance
export const metricRegistry = new MetricRegistry();
