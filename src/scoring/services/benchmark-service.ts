/**
 * Benchmark Service
 * Provides objective benchmark lookups and percentile calculations
 */

import { prisma } from "@/lib/prisma";
import type {
  BenchmarkData,
  BenchmarkLookupResult,
  IBenchmarkService,
  PercentileAssessment,
  PercentileResult,
} from "../types";

// Sector normalization mapping
const SECTOR_ALIASES: Record<string, string> = {
  "saas": "SaaS B2B",
  "saas b2b": "SaaS B2B",
  "b2b saas": "SaaS B2B",
  "software": "SaaS B2B",
  "fintech": "Fintech",
  "financial technology": "Fintech",
  "healthtech": "Healthtech",
  "health tech": "Healthtech",
  "healthcare": "Healthtech",
  "ai": "AI/ML",
  "ai/ml": "AI/ML",
  "machine learning": "AI/ML",
  "artificial intelligence": "AI/ML",
  "marketplace": "Marketplace",
  "marketplaces": "Marketplace",
  "deeptech": "Deeptech",
  "deep tech": "Deeptech",
  "hardware": "Deeptech",
};

// Stage normalization mapping
const STAGE_ALIASES: Record<string, string> = {
  "pre-seed": "PRE_SEED",
  "preseed": "PRE_SEED",
  "pre_seed": "PRE_SEED",
  "seed": "SEED",
  "series a": "SERIES_A",
  "series_a": "SERIES_A",
  "a": "SERIES_A",
  "series b": "SERIES_B",
  "series_b": "SERIES_B",
  "b": "SERIES_B",
  "series c": "SERIES_C",
  "series_c": "SERIES_C",
  "c": "SERIES_C",
  "later": "LATER",
  "growth": "LATER",
};

// Metric name normalization
const METRIC_ALIASES: Record<string, string> = {
  "arr_growth": "ARR Growth YoY",
  "arr growth": "ARR Growth YoY",
  "revenue_growth": "ARR Growth YoY",
  "growth_rate": "ARR Growth YoY",
  "nrr": "Net Revenue Retention",
  "net_revenue_retention": "Net Revenue Retention",
  "retention": "Net Revenue Retention",
  "gross_margin": "Gross Margin",
  "margin": "Gross Margin",
  "cac_payback": "CAC Payback",
  "cac payback": "CAC Payback",
  "payback": "CAC Payback",
  "burn_multiple": "Burn Multiple",
  "burn multiple": "Burn Multiple",
  "valuation_multiple": "Valuation Multiple",
  "valuation": "Valuation Multiple",
  "arr_multiple": "Valuation Multiple",
  "ltv_cac": "LTV/CAC Ratio",
  "ltv/cac": "LTV/CAC Ratio",
  "ltv cac ratio": "LTV/CAC Ratio",
  "magic_number": "Magic Number",
  "magic number": "Magic Number",
  "rule_of_40": "Rule of 40",
  "rule of 40": "Rule of 40",
  "take_rate": "Take Rate",
  "take rate": "Take Rate",
};

class BenchmarkService implements IBenchmarkService {
  private cache: Map<string, BenchmarkData> = new Map();
  private cacheExpiry: Date | null = null;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Normalize sector name to match database
   */
  private normalizeSector(sector: string): string {
    const lower = sector.toLowerCase().trim();
    return SECTOR_ALIASES[lower] ?? sector;
  }

  /**
   * Normalize stage name to match database
   */
  private normalizeStage(stage: string): string {
    const lower = stage.toLowerCase().trim();
    return STAGE_ALIASES[lower] ?? stage;
  }

  /**
   * Normalize metric name to match database
   */
  private normalizeMetric(metric: string): string {
    const lower = metric.toLowerCase().trim();
    return METRIC_ALIASES[lower] ?? metric;
  }

  /**
   * Generate cache key
   */
  private getCacheKey(sector: string, stage: string, metric: string): string {
    return `${sector}:${stage}:${metric}`;
  }

  /**
   * Check if cache is valid
   */
  private isCacheValid(): boolean {
    if (!this.cacheExpiry) return false;
    return new Date() < this.cacheExpiry;
  }

  /**
   * Load all benchmarks into cache
   */
  private async loadCache(): Promise<void> {
    if (this.isCacheValid()) return;

    const benchmarks = await prisma.benchmark.findMany();
    this.cache.clear();

    for (const b of benchmarks) {
      const key = this.getCacheKey(b.sector, b.stage, b.metricName);
      this.cache.set(key, {
        sector: b.sector,
        stage: b.stage,
        metric: b.metricName,
        p25: Number(b.p25),
        median: Number(b.median),
        p75: Number(b.p75),
        source: b.source,
        updatedAt: b.createdAt,
      });
    }

    this.cacheExpiry = new Date(Date.now() + this.CACHE_TTL_MS);
  }

  /**
   * Lookup benchmark with fallback strategy
   */
  async lookup(
    sector: string,
    stage: string,
    metric: string
  ): Promise<BenchmarkLookupResult> {
    await this.loadCache();

    const normalizedSector = this.normalizeSector(sector);
    const normalizedStage = this.normalizeStage(stage);
    const normalizedMetric = this.normalizeMetric(metric);

    // Try exact match
    const exactKey = this.getCacheKey(
      normalizedSector,
      normalizedStage,
      normalizedMetric
    );
    const exactMatch = this.cache.get(exactKey);

    if (exactMatch) {
      return {
        found: true,
        exact: true,
        benchmark: exactMatch,
      };
    }

    // Fallback 1: Try different stage in same sector
    const sectorBenchmarks = Array.from(this.cache.values()).filter(
      (b) =>
        b.sector === normalizedSector && b.metric === normalizedMetric
    );

    if (sectorBenchmarks.length > 0) {
      // Prefer closest stage (SEED is closest to PRE_SEED, etc.)
      const stageOrder = ["PRE_SEED", "SEED", "SERIES_A", "SERIES_B", "SERIES_C", "LATER"];
      const targetIndex = stageOrder.indexOf(normalizedStage);

      let closestBenchmark = sectorBenchmarks[0];
      let closestDistance = Infinity;

      for (const b of sectorBenchmarks) {
        const benchmarkIndex = stageOrder.indexOf(b.stage);
        const distance = Math.abs(benchmarkIndex - targetIndex);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestBenchmark = b;
        }
      }

      return {
        found: true,
        exact: false,
        benchmark: closestBenchmark,
        fallbackUsed: `stage_fallback:${closestBenchmark.stage}`,
      };
    }

    // Fallback 2: Try generic sector (SaaS B2B as default)
    const genericSector = "SaaS B2B";
    const genericKey = this.getCacheKey(
      genericSector,
      normalizedStage,
      normalizedMetric
    );
    const genericMatch = this.cache.get(genericKey);

    if (genericMatch) {
      return {
        found: true,
        exact: false,
        benchmark: genericMatch,
        fallbackUsed: `sector_fallback:${genericSector}`,
      };
    }

    // Fallback 3: Try generic sector with any stage
    const allGeneric = Array.from(this.cache.values()).filter(
      (b) => b.sector === genericSector && b.metric === normalizedMetric
    );

    if (allGeneric.length > 0) {
      return {
        found: true,
        exact: false,
        benchmark: allGeneric[0],
        fallbackUsed: `generic_fallback:${genericSector}:${allGeneric[0].stage}`,
      };
    }

    // No benchmark found
    return {
      found: false,
      exact: false,
    };
  }

  /**
   * Calculate percentile using linear interpolation
   */
  calculatePercentile(value: number, benchmark: BenchmarkData): PercentileResult {
    const { p25, median, p75 } = benchmark;

    let percentile: number;
    const interpolated = true;

    // Handle edge cases
    if (value <= p25) {
      // Below P25 - extrapolate down
      const range = median - p25;
      if (range > 0) {
        const belowP25 = (p25 - value) / range;
        percentile = Math.max(0, 25 - belowP25 * 25);
      } else {
        percentile = value < p25 ? 10 : 25;
      }
    } else if (value <= median) {
      // Between P25 and median
      percentile = 25 + ((value - p25) / (median - p25)) * 25;
    } else if (value <= p75) {
      // Between median and P75
      percentile = 50 + ((value - median) / (p75 - median)) * 25;
    } else {
      // Above P75 - extrapolate up
      const range = p75 - median;
      if (range > 0) {
        const aboveP75 = (value - p75) / range;
        percentile = Math.min(100, 75 + aboveP75 * 25);
      } else {
        percentile = value > p75 ? 90 : 75;
      }
    }

    // Round to nearest integer
    percentile = Math.round(percentile);

    // Determine assessment
    const assessment = this.getPercentileAssessment(percentile, value, benchmark);

    return {
      percentile,
      assessment,
      benchmarkUsed: benchmark,
      interpolated,
    };
  }

  /**
   * Get assessment category for percentile
   */
  private getPercentileAssessment(
    percentile: number,
    value: number,
    benchmark: BenchmarkData
  ): PercentileAssessment {
    // Check for suspicious outliers first
    const range = benchmark.p75 - benchmark.p25;
    const iqr = range;

    if (value > benchmark.p75 + 3 * iqr || value < benchmark.p25 - 3 * iqr) {
      return "suspicious";
    }

    // Normal assessment
    if (percentile >= 90) return "exceptional";
    if (percentile >= 75) return "above_average";
    if (percentile >= 25) return "average";
    if (percentile >= 10) return "below_average";
    return "poor";
  }

  /**
   * Get all benchmarks for a sector
   */
  async getBenchmarksForSector(sector: string): Promise<BenchmarkData[]> {
    await this.loadCache();

    const normalizedSector = this.normalizeSector(sector);

    return Array.from(this.cache.values()).filter(
      (b) => b.sector === normalizedSector
    );
  }

  /**
   * Force refresh benchmarks from database
   */
  async refreshBenchmarks(): Promise<void> {
    this.cacheExpiry = null;
    await this.loadCache();
  }

  /**
   * Get benchmark by exact key (for testing)
   */
  async getExact(
    sector: string,
    stage: string,
    metric: string
  ): Promise<BenchmarkData | undefined> {
    await this.loadCache();
    const key = this.getCacheKey(sector, stage, metric);
    return this.cache.get(key);
  }

  /**
   * Get all available metrics for a sector/stage
   */
  async getAvailableMetrics(sector: string, stage: string): Promise<string[]> {
    await this.loadCache();

    const normalizedSector = this.normalizeSector(sector);
    const normalizedStage = this.normalizeStage(stage);

    return Array.from(this.cache.values())
      .filter(
        (b) => b.sector === normalizedSector && b.stage === normalizedStage
      )
      .map((b) => b.metric);
  }
}

// Singleton instance
export const benchmarkService = new BenchmarkService();
