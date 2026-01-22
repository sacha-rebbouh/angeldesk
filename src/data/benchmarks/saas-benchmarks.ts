/**
 * SaaS Benchmarks - Static Data
 *
 * Sources:
 * - OpenView SaaS Benchmarks Report 2024/2025
 * - Bessemer State of the Cloud 2024
 * - KeyBanc SaaS Survey 2024
 * - First Round State of Startups
 *
 * These are publicly available benchmarks used to contextualize
 * startup metrics. Updated periodically based on public reports.
 */

export interface BenchmarkEntry {
  metric: string;
  displayName: string;
  unit: string;
  category: "financial" | "growth" | "efficiency" | "retention" | "sales";
  direction: "higher_better" | "lower_better" | "target_range";
  targetRange?: { min: number; max: number };
  byStage: {
    pre_seed?: StageMetrics;
    seed: StageMetrics;
    series_a: StageMetrics;
    series_b: StageMetrics;
    series_c?: StageMetrics;
    growth?: StageMetrics;
  };
  source: string;
  lastUpdated: string;
}

export interface StageMetrics {
  p10: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
}

/**
 * Core SaaS Metrics Benchmarks
 * Based on OpenView 2024 and Bessemer data
 */
export const SAAS_BENCHMARKS: BenchmarkEntry[] = [
  // ============================================================================
  // GROWTH METRICS
  // ============================================================================
  {
    metric: "arr_growth_rate",
    displayName: "ARR Growth Rate",
    unit: "%",
    category: "growth",
    direction: "higher_better",
    byStage: {
      seed: { p10: 50, p25: 100, median: 150, p75: 250, p90: 400 },
      series_a: { p10: 40, p25: 70, median: 100, p75: 150, p90: 200 },
      series_b: { p10: 30, p25: 50, median: 70, p75: 100, p90: 150 },
      series_c: { p10: 25, p25: 40, median: 50, p75: 70, p90: 100 },
      growth: { p10: 15, p25: 25, median: 35, p75: 50, p90: 70 },
    },
    source: "OpenView SaaS Benchmarks 2024",
    lastUpdated: "2024-Q4",
  },
  {
    metric: "mrr_growth_rate",
    displayName: "MRR Growth Rate (MoM)",
    unit: "%",
    category: "growth",
    direction: "higher_better",
    byStage: {
      seed: { p10: 5, p25: 10, median: 15, p75: 25, p90: 40 },
      series_a: { p10: 3, p25: 6, median: 10, p75: 15, p90: 25 },
      series_b: { p10: 2, p25: 4, median: 7, p75: 10, p90: 15 },
      series_c: { p10: 1, p25: 3, median: 5, p75: 8, p90: 12 },
    },
    source: "OpenView SaaS Benchmarks 2024",
    lastUpdated: "2024-Q4",
  },
  {
    metric: "revenue_per_employee",
    displayName: "ARR per Employee",
    unit: "K€",
    category: "efficiency",
    direction: "higher_better",
    byStage: {
      seed: { p10: 50, p25: 80, median: 120, p75: 180, p90: 250 },
      series_a: { p10: 80, p25: 120, median: 180, p75: 250, p90: 350 },
      series_b: { p10: 100, p25: 150, median: 200, p75: 280, p90: 400 },
      series_c: { p10: 120, p25: 180, median: 250, p75: 350, p90: 500 },
    },
    source: "KeyBanc SaaS Survey 2024",
    lastUpdated: "2024-Q3",
  },

  // ============================================================================
  // RETENTION METRICS
  // ============================================================================
  {
    metric: "net_revenue_retention",
    displayName: "Net Revenue Retention (NRR)",
    unit: "%",
    category: "retention",
    direction: "higher_better",
    byStage: {
      seed: { p10: 80, p25: 95, median: 105, p75: 120, p90: 140 },
      series_a: { p10: 90, p25: 100, median: 110, p75: 125, p90: 145 },
      series_b: { p10: 95, p25: 105, median: 115, p75: 130, p90: 150 },
      series_c: { p10: 100, p25: 110, median: 120, p75: 135, p90: 155 },
    },
    source: "Bessemer State of the Cloud 2024",
    lastUpdated: "2024-Q4",
  },
  {
    metric: "gross_revenue_retention",
    displayName: "Gross Revenue Retention (GRR)",
    unit: "%",
    category: "retention",
    direction: "higher_better",
    byStage: {
      seed: { p10: 70, p25: 80, median: 88, p75: 93, p90: 97 },
      series_a: { p10: 75, p25: 85, median: 90, p75: 95, p90: 98 },
      series_b: { p10: 80, p25: 88, median: 92, p75: 96, p90: 99 },
      series_c: { p10: 85, p25: 90, median: 94, p75: 97, p90: 99 },
    },
    source: "Bessemer State of the Cloud 2024",
    lastUpdated: "2024-Q4",
  },
  {
    metric: "logo_churn_rate",
    displayName: "Logo Churn Rate (Annual)",
    unit: "%",
    category: "retention",
    direction: "lower_better",
    byStage: {
      seed: { p10: 5, p25: 10, median: 18, p75: 30, p90: 45 },
      series_a: { p10: 4, p25: 8, median: 15, p75: 25, p90: 35 },
      series_b: { p10: 3, p25: 6, median: 12, p75: 20, p90: 30 },
      series_c: { p10: 2, p25: 5, median: 10, p75: 15, p90: 25 },
    },
    source: "OpenView SaaS Benchmarks 2024",
    lastUpdated: "2024-Q4",
  },

  // ============================================================================
  // EFFICIENCY METRICS
  // ============================================================================
  {
    metric: "burn_multiple",
    displayName: "Burn Multiple",
    unit: "x",
    category: "efficiency",
    direction: "lower_better",
    byStage: {
      seed: { p10: 0.5, p25: 1.0, median: 2.0, p75: 4.0, p90: 8.0 },
      series_a: { p10: 0.5, p25: 1.0, median: 1.5, p75: 2.5, p90: 5.0 },
      series_b: { p10: 0.3, p25: 0.8, median: 1.2, p75: 2.0, p90: 3.5 },
      series_c: { p10: 0.2, p25: 0.5, median: 1.0, p75: 1.5, p90: 2.5 },
    },
    source: "Bessemer Efficiency Score 2024",
    lastUpdated: "2024-Q4",
  },
  {
    metric: "rule_of_40",
    displayName: "Rule of 40 Score",
    unit: "%",
    category: "efficiency",
    direction: "higher_better",
    byStage: {
      seed: { p10: -20, p25: 0, median: 20, p75: 50, p90: 100 },
      series_a: { p10: -10, p25: 10, median: 30, p75: 50, p90: 80 },
      series_b: { p10: 0, p25: 20, median: 40, p75: 60, p90: 80 },
      series_c: { p10: 10, p25: 25, median: 40, p75: 55, p90: 75 },
    },
    source: "Bessemer State of the Cloud 2024",
    lastUpdated: "2024-Q4",
  },
  {
    metric: "gross_margin",
    displayName: "Gross Margin",
    unit: "%",
    category: "financial",
    direction: "higher_better",
    byStage: {
      seed: { p10: 50, p25: 60, median: 70, p75: 80, p90: 85 },
      series_a: { p10: 55, p25: 65, median: 75, p75: 82, p90: 88 },
      series_b: { p10: 60, p25: 70, median: 78, p75: 84, p90: 90 },
      series_c: { p10: 65, p25: 72, median: 80, p75: 85, p90: 92 },
    },
    source: "OpenView SaaS Benchmarks 2024",
    lastUpdated: "2024-Q4",
  },

  // ============================================================================
  // SALES EFFICIENCY METRICS
  // ============================================================================
  {
    metric: "cac_payback_months",
    displayName: "CAC Payback Period",
    unit: "months",
    category: "sales",
    direction: "lower_better",
    byStage: {
      seed: { p10: 6, p25: 12, median: 18, p75: 30, p90: 48 },
      series_a: { p10: 8, p25: 14, median: 20, p75: 30, p90: 42 },
      series_b: { p10: 10, p25: 16, median: 22, p75: 32, p90: 44 },
      series_c: { p10: 12, p25: 18, median: 24, p75: 34, p90: 46 },
    },
    source: "KeyBanc SaaS Survey 2024",
    lastUpdated: "2024-Q3",
  },
  {
    metric: "ltv_cac_ratio",
    displayName: "LTV:CAC Ratio",
    unit: "x",
    category: "sales",
    direction: "higher_better",
    targetRange: { min: 3, max: 5 },
    byStage: {
      seed: { p10: 1.5, p25: 2.5, median: 3.5, p75: 5.0, p90: 8.0 },
      series_a: { p10: 2.0, p25: 3.0, median: 4.0, p75: 6.0, p90: 10.0 },
      series_b: { p10: 2.5, p25: 3.5, median: 4.5, p75: 6.5, p90: 10.0 },
      series_c: { p10: 3.0, p25: 4.0, median: 5.0, p75: 7.0, p90: 12.0 },
    },
    source: "OpenView SaaS Benchmarks 2024",
    lastUpdated: "2024-Q4",
  },
  {
    metric: "magic_number",
    displayName: "Magic Number (Sales Efficiency)",
    unit: "x",
    category: "sales",
    direction: "higher_better",
    byStage: {
      seed: { p10: 0.3, p25: 0.5, median: 0.8, p75: 1.2, p90: 2.0 },
      series_a: { p10: 0.4, p25: 0.6, median: 0.9, p75: 1.3, p90: 1.8 },
      series_b: { p10: 0.5, p25: 0.7, median: 1.0, p75: 1.4, p90: 1.8 },
      series_c: { p10: 0.5, p25: 0.8, median: 1.0, p75: 1.3, p90: 1.7 },
    },
    source: "Bessemer State of the Cloud 2024",
    lastUpdated: "2024-Q4",
  },
  {
    metric: "sales_efficiency",
    displayName: "Sales Efficiency Ratio",
    unit: "x",
    category: "sales",
    direction: "higher_better",
    byStage: {
      seed: { p10: 0.5, p25: 1.0, median: 1.5, p75: 2.5, p90: 4.0 },
      series_a: { p10: 0.6, p25: 1.0, median: 1.5, p75: 2.0, p90: 3.0 },
      series_b: { p10: 0.7, p25: 1.0, median: 1.4, p75: 2.0, p90: 2.8 },
      series_c: { p10: 0.7, p25: 1.0, median: 1.3, p75: 1.8, p90: 2.5 },
    },
    source: "KeyBanc SaaS Survey 2024",
    lastUpdated: "2024-Q3",
  },

  // ============================================================================
  // FINANCIAL METRICS
  // ============================================================================
  {
    metric: "acv",
    displayName: "Average Contract Value",
    unit: "K€",
    category: "financial",
    direction: "higher_better",
    byStage: {
      seed: { p10: 2, p25: 5, median: 12, p75: 25, p90: 50 },
      series_a: { p10: 5, p25: 15, median: 30, p75: 60, p90: 120 },
      series_b: { p10: 10, p25: 25, median: 50, p75: 100, p90: 200 },
      series_c: { p10: 20, p25: 40, median: 80, p75: 150, p90: 300 },
    },
    source: "KeyBanc SaaS Survey 2024",
    lastUpdated: "2024-Q3",
  },
  {
    metric: "arr_per_fte",
    displayName: "ARR per FTE",
    unit: "K€",
    category: "efficiency",
    direction: "higher_better",
    byStage: {
      seed: { p10: 40, p25: 70, median: 100, p75: 150, p90: 220 },
      series_a: { p10: 60, p25: 100, median: 150, p75: 220, p90: 320 },
      series_b: { p10: 80, p25: 130, median: 180, p75: 260, p90: 380 },
      series_c: { p10: 100, p25: 160, median: 220, p75: 300, p90: 450 },
    },
    source: "OpenView SaaS Benchmarks 2024",
    lastUpdated: "2024-Q4",
  },
];

/**
 * Valuation Multiples by Stage and Sector
 * Based on 2024 deal data
 */
export const VALUATION_MULTIPLES = {
  saas_b2b: {
    seed: { p25: 12, median: 20, p75: 35 },
    series_a: { p25: 8, median: 15, p75: 25 },
    series_b: { p25: 6, median: 12, p75: 20 },
    series_c: { p25: 5, median: 10, p75: 18 },
  },
  fintech: {
    seed: { p25: 15, median: 25, p75: 45 },
    series_a: { p25: 10, median: 18, p75: 30 },
    series_b: { p25: 8, median: 15, p75: 25 },
    series_c: { p25: 6, median: 12, p75: 22 },
  },
  marketplace: {
    seed: { p25: 8, median: 15, p75: 30 },
    series_a: { p25: 5, median: 12, p75: 22 },
    series_b: { p25: 4, median: 10, p75: 18 },
    series_c: { p25: 3, median: 8, p75: 15 },
  },
  healthtech: {
    seed: { p25: 10, median: 18, p75: 35 },
    series_a: { p25: 8, median: 14, p75: 25 },
    series_b: { p25: 6, median: 12, p75: 20 },
    series_c: { p25: 5, median: 10, p75: 18 },
  },
  deeptech: {
    seed: { p25: 15, median: 30, p75: 60 },
    series_a: { p25: 12, median: 22, p75: 45 },
    series_b: { p25: 10, median: 18, p75: 35 },
    series_c: { p25: 8, median: 15, p75: 30 },
  },
  consumer: {
    seed: { p25: 5, median: 10, p75: 20 },
    series_a: { p25: 4, median: 8, p75: 15 },
    series_b: { p25: 3, median: 6, p75: 12 },
    series_c: { p25: 2, median: 5, p75: 10 },
  },
};

/**
 * Funding Round Sizes by Stage (Europe, 2024)
 */
export const ROUND_SIZES = {
  pre_seed: {
    typical: { min: 200_000, median: 500_000, max: 1_500_000 },
    dilution: { min: 8, median: 12, max: 20 },
  },
  seed: {
    typical: { min: 500_000, median: 2_000_000, max: 5_000_000 },
    dilution: { min: 10, median: 15, max: 25 },
  },
  series_a: {
    typical: { min: 3_000_000, median: 8_000_000, max: 20_000_000 },
    dilution: { min: 15, median: 20, max: 30 },
  },
  series_b: {
    typical: { min: 10_000_000, median: 25_000_000, max: 60_000_000 },
    dilution: { min: 15, median: 20, max: 25 },
  },
  series_c: {
    typical: { min: 25_000_000, median: 50_000_000, max: 150_000_000 },
    dilution: { min: 10, median: 15, max: 20 },
  },
};

/**
 * Team Benchmarks by Stage
 */
export const TEAM_BENCHMARKS = {
  seed: {
    team_size: { p25: 3, median: 6, p75: 12 },
    founders: { min: 1, typical: 2, max: 4 },
    engineering_ratio: { p25: 0.4, median: 0.6, p75: 0.8 },
  },
  series_a: {
    team_size: { p25: 10, median: 20, p75: 40 },
    founders: { min: 1, typical: 2, max: 3 },
    engineering_ratio: { p25: 0.35, median: 0.5, p75: 0.65 },
  },
  series_b: {
    team_size: { p25: 30, median: 60, p75: 120 },
    founders: { min: 1, typical: 2, max: 3 },
    engineering_ratio: { p25: 0.3, median: 0.4, p75: 0.55 },
  },
  series_c: {
    team_size: { p25: 80, median: 150, p75: 300 },
    founders: { min: 1, typical: 2, max: 3 },
    engineering_ratio: { p25: 0.25, median: 0.35, p75: 0.45 },
  },
};

/**
 * Time Between Rounds (months)
 */
export const TIME_BETWEEN_ROUNDS = {
  seed_to_series_a: { p25: 12, median: 18, p75: 24 },
  series_a_to_b: { p25: 15, median: 20, p75: 28 },
  series_b_to_c: { p25: 18, median: 24, p75: 32 },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export type StageName = "pre_seed" | "seed" | "series_a" | "series_b" | "series_c" | "growth";

/**
 * Get benchmark for a specific metric and stage
 */
export function getBenchmark(
  metric: string,
  stage: StageName
): StageMetrics | null {
  const benchmark = SAAS_BENCHMARKS.find((b) => b.metric === metric);
  if (!benchmark) return null;
  return benchmark.byStage[stage] ?? null;
}

/**
 * Calculate percentile for a given value against benchmark
 */
export function calculatePercentile(
  value: number,
  metrics: StageMetrics,
  direction: "higher_better" | "lower_better" | "target_range"
): number {
  const { p10, p25, median, p75, p90 } = metrics;

  // Linear interpolation between percentile points
  const points = [
    { percentile: 10, value: p10 },
    { percentile: 25, value: p25 },
    { percentile: 50, value: median },
    { percentile: 75, value: p75 },
    { percentile: 90, value: p90 },
  ];

  // For "lower_better" metrics, invert the scale
  if (direction === "lower_better") {
    // Lower value = higher percentile
    if (value <= p10) return 95;
    if (value >= p90) return 5;

    // Interpolate
    for (let i = 0; i < points.length - 1; i++) {
      const curr = points[i];
      const next = points[i + 1];
      if (value >= curr.value && value <= next.value) {
        const ratio = (value - curr.value) / (next.value - curr.value);
        // Invert: as value increases, percentile decreases
        return Math.round(curr.percentile + (next.percentile - curr.percentile) * (1 - ratio));
      }
    }
    return 50;
  }

  // For "higher_better" metrics
  if (value <= p10) return 5;
  if (value >= p90) return 95;

  // Interpolate
  for (let i = 0; i < points.length - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];
    if (value >= curr.value && value <= next.value) {
      const ratio = (value - curr.value) / (next.value - curr.value);
      return Math.round(curr.percentile + (next.percentile - curr.percentile) * ratio);
    }
  }

  return 50;
}

/**
 * Get assessment label for a percentile
 */
export function getPercentileAssessment(
  percentile: number
): "exceptional" | "above_average" | "average" | "below_average" | "poor" {
  if (percentile >= 90) return "exceptional";
  if (percentile >= 75) return "above_average";
  if (percentile >= 25) return "average";
  if (percentile >= 10) return "below_average";
  return "poor";
}

/**
 * Get all benchmarks for a given stage
 */
export function getBenchmarksForStage(stage: StageName): BenchmarkEntry[] {
  return SAAS_BENCHMARKS.filter((b) => b.byStage[stage] !== undefined);
}

/**
 * Normalize stage name from various formats
 */
export function normalizeStage(stage: string): StageName | null {
  const normalized = stage.toLowerCase().replace(/[^a-z0-9]/g, "_");

  const mappings: Record<string, StageName> = {
    pre_seed: "pre_seed",
    preseed: "pre_seed",
    "pre-seed": "pre_seed",
    seed: "seed",
    series_a: "series_a",
    seriesa: "series_a",
    "series-a": "series_a",
    a: "series_a",
    series_b: "series_b",
    seriesb: "series_b",
    "series-b": "series_b",
    b: "series_b",
    series_c: "series_c",
    seriesc: "series_c",
    "series-c": "series_c",
    c: "series_c",
    growth: "growth",
    late: "growth",
    late_stage: "growth",
  };

  return mappings[normalized] ?? null;
}
