/**
 * Enhanced Benchmark Service
 *
 * Combines multiple benchmark sources:
 * 1. Database benchmarks (from seed data)
 * 2. Static benchmarks (OpenView, Bessemer, KeyBanc)
 *
 * This ensures we always have benchmark data, even without DB seeding.
 */

import { benchmarkService } from "./benchmark-service";
import {
  SAAS_BENCHMARKS,
  VALUATION_MULTIPLES,
  getBenchmark,
  calculatePercentile as calcStaticPercentile,
  getPercentileAssessment as getStaticAssessment,
  normalizeStage,
  type StageName,
} from "@/data/benchmarks/saas-benchmarks";
import type {
  BenchmarkData,
  BenchmarkLookupResult,
  PercentileResult,
  PercentileAssessment,
} from "../types";

// Map metric names from our static benchmarks to standard names
const STATIC_METRIC_MAP: Record<string, string> = {
  arr_growth_rate: "ARR Growth YoY",
  mrr_growth_rate: "MRR Growth Rate",
  net_revenue_retention: "Net Revenue Retention",
  gross_revenue_retention: "Gross Revenue Retention",
  logo_churn_rate: "Logo Churn Rate",
  burn_multiple: "Burn Multiple",
  rule_of_40: "Rule of 40",
  gross_margin: "Gross Margin",
  cac_payback_months: "CAC Payback",
  ltv_cac_ratio: "LTV/CAC Ratio",
  magic_number: "Magic Number",
  sales_efficiency: "Sales Efficiency",
  acv: "Average Contract Value",
  arr_per_fte: "ARR per FTE",
  revenue_per_employee: "Revenue per Employee",
};

// Reverse map for lookups
const REVERSE_METRIC_MAP: Record<string, string> = Object.entries(STATIC_METRIC_MAP).reduce(
  (acc, [key, value]) => {
    acc[value.toLowerCase()] = key;
    return acc;
  },
  {} as Record<string, string>
);

// Sector normalization for static benchmarks
const SECTOR_TO_VALUATION_KEY: Record<string, keyof typeof VALUATION_MULTIPLES> = {
  "saas b2b": "saas_b2b",
  "saas": "saas_b2b",
  "software": "saas_b2b",
  "fintech": "fintech",
  "financial technology": "fintech",
  "marketplace": "marketplace",
  "healthtech": "healthtech",
  "health tech": "healthtech",
  "deeptech": "deeptech",
  "deep tech": "deeptech",
  "consumer": "consumer",
  "b2c": "consumer",
};

class EnhancedBenchmarkService {
  /**
   * Lookup benchmark with fallback to static data
   */
  async lookup(
    sector: string,
    stage: string,
    metric: string
  ): Promise<BenchmarkLookupResult> {
    // First, try the database
    const dbResult = await benchmarkService.lookup(sector, stage, metric);

    if (dbResult.found && dbResult.exact) {
      return dbResult;
    }

    // Try static benchmarks
    const staticResult = this.lookupStatic(sector, stage, metric);

    if (staticResult.found) {
      // If DB had a non-exact match, compare and use better one
      if (dbResult.found && dbResult.benchmark) {
        // Prefer DB if it was sector-matched
        if (!dbResult.fallbackUsed?.includes("sector_fallback")) {
          return dbResult;
        }
      }
      return staticResult;
    }

    // Return DB result even if not exact
    return dbResult;
  }

  /**
   * Lookup in static benchmarks
   */
  private lookupStatic(
    sector: string,
    stage: string,
    metric: string
  ): BenchmarkLookupResult {
    const normalizedStage = normalizeStage(stage);
    if (!normalizedStage) {
      return { found: false, exact: false };
    }

    // Normalize metric name
    const metricLower = metric.toLowerCase();
    const staticMetricKey = REVERSE_METRIC_MAP[metricLower] ?? metricLower;

    // Try to find the benchmark
    const staticBenchmark = getBenchmark(staticMetricKey, normalizedStage);

    if (!staticBenchmark) {
      return { found: false, exact: false };
    }

    // Find the corresponding entry for source info
    const benchmarkEntry = SAAS_BENCHMARKS.find(
      (b) => b.metric === staticMetricKey
    );

    const benchmarkData: BenchmarkData = {
      sector: sector,
      stage: stage,
      metric: STATIC_METRIC_MAP[staticMetricKey] ?? metric,
      p25: staticBenchmark.p25,
      median: staticBenchmark.median,
      p75: staticBenchmark.p75,
      source: benchmarkEntry?.source ?? "OpenView SaaS Benchmarks 2024",
      updatedAt: new Date(benchmarkEntry?.lastUpdated ?? "2024-Q4"),
    };

    return {
      found: true,
      exact: true, // Static benchmarks are considered exact for their stage
      benchmark: benchmarkData,
    };
  }

  /**
   * Calculate percentile with enhanced logic
   */
  calculatePercentile(value: number, benchmark: BenchmarkData): PercentileResult {
    // Use the existing benchmark service logic
    return benchmarkService.calculatePercentile(value, benchmark);
  }

  /**
   * Get valuation multiple benchmarks for a sector/stage
   */
  getValuationMultiples(
    sector: string,
    stage: string
  ): { p25: number; median: number; p75: number } | null {
    const sectorKey = SECTOR_TO_VALUATION_KEY[sector.toLowerCase()];
    if (!sectorKey) return null;

    const sectorMultiples = VALUATION_MULTIPLES[sectorKey];
    if (!sectorMultiples) return null;

    const normalizedStage = normalizeStage(stage);
    if (!normalizedStage) return null;

    // Map to valuation multiple stages
    const stageMap: Record<StageName, keyof typeof sectorMultiples | null> = {
      pre_seed: "seed",
      seed: "seed",
      series_a: "series_a",
      series_b: "series_b",
      series_c: "series_c",
      growth: "series_c",
    };

    const multipleStage = stageMap[normalizedStage];
    if (!multipleStage) return null;

    return sectorMultiples[multipleStage] ?? null;
  }

  /**
   * Assess valuation against benchmarks
   */
  assessValuation(
    valuationMultiple: number,
    sector: string,
    stage: string
  ): {
    percentile: number;
    assessment: "cheap" | "fair" | "expensive" | "very_expensive";
    benchmarks: { p25: number; median: number; p75: number };
  } | null {
    const benchmarks = this.getValuationMultiples(sector, stage);
    if (!benchmarks) return null;

    const { p25, median, p75 } = benchmarks;

    // Calculate percentile
    let percentile: number;
    if (valuationMultiple <= p25) {
      percentile = 25 * (valuationMultiple / p25);
    } else if (valuationMultiple <= median) {
      percentile = 25 + 25 * ((valuationMultiple - p25) / (median - p25));
    } else if (valuationMultiple <= p75) {
      percentile = 50 + 25 * ((valuationMultiple - median) / (p75 - median));
    } else {
      percentile = 75 + 25 * Math.min(1, (valuationMultiple - p75) / (p75 - median));
    }

    percentile = Math.round(Math.min(100, Math.max(0, percentile)));

    // Determine assessment
    let assessment: "cheap" | "fair" | "expensive" | "very_expensive";
    if (valuationMultiple <= p25) {
      assessment = "cheap";
    } else if (valuationMultiple <= median) {
      assessment = "fair";
    } else if (valuationMultiple <= p75) {
      assessment = "expensive";
    } else {
      assessment = "very_expensive";
    }

    return {
      percentile,
      assessment,
      benchmarks,
    };
  }

  /**
   * Get all available benchmarks for a sector/stage
   */
  async getAllBenchmarks(
    sector: string,
    stage: string
  ): Promise<BenchmarkData[]> {
    const results: BenchmarkData[] = [];

    // Get from database
    const dbBenchmarks = await benchmarkService.getBenchmarksForSector(sector);
    const normalizedStage = normalizeStage(stage);

    // Filter by stage
    const stageBenchmarks = dbBenchmarks.filter(
      (b) => b.stage.toLowerCase() === stage.toLowerCase()
    );
    results.push(...stageBenchmarks);

    // Add static benchmarks that aren't in DB
    if (normalizedStage) {
      const existingMetrics = new Set(results.map((r) => r.metric.toLowerCase()));

      for (const entry of SAAS_BENCHMARKS) {
        const stageData = entry.byStage[normalizedStage];
        if (!stageData) continue;

        const displayName = entry.displayName;
        if (existingMetrics.has(displayName.toLowerCase())) continue;

        results.push({
          sector,
          stage,
          metric: displayName,
          p25: stageData.p25,
          median: stageData.median,
          p75: stageData.p75,
          source: entry.source,
          updatedAt: new Date(entry.lastUpdated),
        });
      }
    }

    return results;
  }

  /**
   * Get quick metric assessment
   */
  async assessMetric(
    metricName: string,
    value: number,
    sector: string,
    stage: string
  ): Promise<{
    percentile: number;
    assessment: PercentileAssessment;
    benchmark: BenchmarkData;
    comparison: string;
  } | null> {
    const lookupResult = await this.lookup(sector, stage, metricName);

    if (!lookupResult.found || !lookupResult.benchmark) {
      return null;
    }

    const percentileResult = this.calculatePercentile(
      value,
      lookupResult.benchmark
    );

    // Generate comparison string
    const { p25, median, p75 } = lookupResult.benchmark;
    let comparison: string;

    if (value < p25) {
      const diff = ((p25 - value) / p25) * 100;
      comparison = `${diff.toFixed(0)}% below P25 (${p25})`;
    } else if (value < median) {
      comparison = `Between P25 (${p25}) and median (${median})`;
    } else if (value < p75) {
      comparison = `Between median (${median}) and P75 (${p75})`;
    } else {
      const diff = ((value - p75) / p75) * 100;
      comparison = `${diff.toFixed(0)}% above P75 (${p75})`;
    }

    return {
      percentile: percentileResult.percentile,
      assessment: percentileResult.assessment,
      benchmark: lookupResult.benchmark,
      comparison,
    };
  }
}

// Singleton instance
export const enhancedBenchmarkService = new EnhancedBenchmarkService();

// Re-export types for convenience
export type { BenchmarkData, BenchmarkLookupResult, PercentileResult };
