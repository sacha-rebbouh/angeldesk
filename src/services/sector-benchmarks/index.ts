/**
 * Sector Benchmarks Service
 *
 * Loads sector-specific benchmarks from database with caching.
 * Benchmarks can be updated in DB without code changes.
 *
 * Cache Strategy:
 * - 10 minute TTL for DB lookups
 * - Fallback to hardcoded defaults if DB empty
 * - Version-based cache invalidation
 */

import { prisma } from "@/lib/prisma";
import { getCacheManager } from "@/services/cache";
import type { SectorBenchmarkData } from "@/agents/tier3/sector-benchmarks";

// Re-export types for consumers
export type { SectorBenchmarkData, SectorMetricBenchmark, MetricPercentiles } from "@/agents/tier3/sector-benchmarks";

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CACHE_NAMESPACE = "benchmarks" as const;

// Sector name normalization map
// IMPORTANT: Values must match exactly what's stored in DB
const SECTOR_ALIASES: Record<string, string> = {
  // SaaS B2B
  saas: "SaaS B2B",
  "saas b2b": "SaaS B2B",
  "b2b saas": "SaaS B2B",
  software: "SaaS B2B",

  // Fintech (note: lowercase 't' to match DB)
  fintech: "Fintech",
  "fin tech": "Fintech",
  financial: "Fintech",
  "financial services": "Fintech",

  // Marketplace
  marketplace: "Marketplace",
  "market place": "Marketplace",
  platform: "Marketplace",

  // HealthTech
  healthtech: "HealthTech",
  "health tech": "HealthTech",
  healthcare: "HealthTech",
  medtech: "HealthTech",
  "med tech": "HealthTech",

  // DeepTech
  deeptech: "DeepTech",
  "deep tech": "DeepTech",
  "deep technology": "DeepTech",
  "hard tech": "DeepTech",
  hardtech: "DeepTech",

  // Climate
  climate: "Climate",
  cleantech: "Climate",
  "clean tech": "Climate",
  greentech: "Climate",
  "green tech": "Climate",
  sustainability: "Climate",

  // Hardware
  hardware: "Hardware",
  hw: "Hardware",
  iot: "Hardware",
  "internet of things": "Hardware",
  devices: "Hardware",

  // Gaming
  gaming: "Gaming",
  games: "Gaming",
  "video games": "Gaming",
  esports: "Gaming",

  // Consumer
  consumer: "Consumer",
  d2c: "Consumer",
  b2c: "Consumer",
  dtc: "Consumer",
  "direct to consumer": "Consumer",
  ecommerce: "Consumer",
  "e-commerce": "Consumer",
};

/**
 * Normalize sector name to canonical form
 */
export function normalizeSectorName(sector: string): string {
  const normalized = sector.toLowerCase().trim();
  return SECTOR_ALIASES[normalized] ?? sector;
}

/**
 * Get benchmark data for a specific sector
 *
 * @param sector - Sector name (will be normalized)
 * @param options - Optional settings
 * @returns Benchmark data or null if not found
 */
export async function getSectorBenchmarks(
  sector: string,
  options: { forceRefresh?: boolean } = {}
): Promise<SectorBenchmarkData | null> {
  const cache = getCacheManager();
  const normalizedSector = normalizeSectorName(sector);
  const cacheKey = `sector:${normalizedSector}`;

  // Check cache first
  if (!options.forceRefresh) {
    const cached = cache.get<SectorBenchmarkData>(CACHE_NAMESPACE, cacheKey);
    if (cached) {
      console.log(`[SectorBenchmarks] Cache HIT: ${normalizedSector}`);
      return cached;
    }
  }

  // Load from database
  try {
    const dbRecord = await prisma.sectorBenchmark.findUnique({
      where: { sector: normalizedSector },
    });

    if (dbRecord?.data) {
      const benchmarkData = dbRecord.data as unknown as SectorBenchmarkData;

      // Cache the result
      cache.set(CACHE_NAMESPACE, cacheKey, benchmarkData, {
        ttlMs: CACHE_TTL_MS,
        tags: [`sector:${normalizedSector}`, `version:${dbRecord.version}`],
      });

      console.log(
        `[SectorBenchmarks] Loaded from DB: ${normalizedSector} (v${dbRecord.version})`
      );
      return benchmarkData;
    }
  } catch (error) {
    console.error(`[SectorBenchmarks] DB error for ${normalizedSector}:`, error);
  }

  // Fallback to hardcoded defaults
  const fallback = await loadFallbackBenchmarks(normalizedSector);
  if (fallback) {
    console.log(`[SectorBenchmarks] Using fallback for: ${normalizedSector}`);
    cache.set(CACHE_NAMESPACE, cacheKey, fallback, { ttlMs: CACHE_TTL_MS });
  }

  return fallback;
}

/**
 * Get all available sector benchmarks
 */
export async function getAllSectorBenchmarks(): Promise<SectorBenchmarkData[]> {
  const cache = getCacheManager();
  const cacheKey = "all-sectors";

  // Check cache
  const cached = cache.get<SectorBenchmarkData[]>(CACHE_NAMESPACE, cacheKey);
  if (cached) {
    return cached;
  }

  // Load from database
  try {
    const dbRecords = await prisma.sectorBenchmark.findMany({
      orderBy: { sector: "asc" },
    });

    if (dbRecords.length > 0) {
      const benchmarks = dbRecords.map(
        (r) => r.data as unknown as SectorBenchmarkData
      );
      cache.set(CACHE_NAMESPACE, cacheKey, benchmarks, { ttlMs: CACHE_TTL_MS });
      return benchmarks;
    }
  } catch (error) {
    console.error("[SectorBenchmarks] Failed to load all sectors:", error);
  }

  // Fallback to all hardcoded
  return loadAllFallbackBenchmarks();
}

/**
 * Get list of available sectors
 */
export async function getAvailableSectors(): Promise<string[]> {
  try {
    const dbRecords = await prisma.sectorBenchmark.findMany({
      select: { sector: true },
      orderBy: { sector: "asc" },
    });

    if (dbRecords.length > 0) {
      return dbRecords.map((r) => r.sector);
    }
  } catch (error) {
    console.error("[SectorBenchmarks] Failed to get sectors:", error);
  }

  // Fallback
  return [
    "SaaS B2B",
    "FinTech",
    "Marketplace",
    "HealthTech",
    "DeepTech",
    "Climate",
    "Hardware",
    "Gaming",
    "Consumer",
  ];
}

/**
 * Invalidate cache for a specific sector
 */
export function invalidateSectorCache(sector: string): void {
  const cache = getCacheManager();
  const normalizedSector = normalizeSectorName(sector);

  cache.delete(CACHE_NAMESPACE, `sector:${normalizedSector}`);
  cache.delete(CACHE_NAMESPACE, "all-sectors");

  console.log(`[SectorBenchmarks] Cache invalidated for: ${normalizedSector}`);
}

/**
 * Invalidate all sector benchmark caches
 */
export function invalidateAllSectorCaches(): void {
  const cache = getCacheManager();
  cache.invalidateNamespace(CACHE_NAMESPACE);
  console.log("[SectorBenchmarks] All caches invalidated");
}

// ============================================================================
// FALLBACK LOADERS (use hardcoded data when DB is empty)
// ============================================================================

async function loadFallbackBenchmarks(
  sector: string
): Promise<SectorBenchmarkData | null> {
  // Dynamic import to avoid loading all benchmarks if not needed
  const {
    SAAS_BENCHMARKS,
    FINTECH_BENCHMARKS,
    MARKETPLACE_BENCHMARKS,
    HEALTHTECH_BENCHMARKS,
    DEEPTECH_BENCHMARKS,
    CLIMATE_BENCHMARKS,
    HARDWARE_BENCHMARKS,
    GAMING_BENCHMARKS,
    CONSUMER_BENCHMARKS,
  } = await import("@/agents/tier3/sector-benchmarks");

  const fallbackMap: Record<string, SectorBenchmarkData> = {
    "SaaS B2B": SAAS_BENCHMARKS,
    Fintech: FINTECH_BENCHMARKS,
    Marketplace: MARKETPLACE_BENCHMARKS,
    HealthTech: HEALTHTECH_BENCHMARKS,
    DeepTech: DEEPTECH_BENCHMARKS,
    Climate: CLIMATE_BENCHMARKS,
    Hardware: HARDWARE_BENCHMARKS,
    Gaming: GAMING_BENCHMARKS,
    Consumer: CONSUMER_BENCHMARKS,
  };

  return fallbackMap[sector] ?? null;
}

async function loadAllFallbackBenchmarks(): Promise<SectorBenchmarkData[]> {
  const {
    SAAS_BENCHMARKS,
    FINTECH_BENCHMARKS,
    MARKETPLACE_BENCHMARKS,
    HEALTHTECH_BENCHMARKS,
    DEEPTECH_BENCHMARKS,
    CLIMATE_BENCHMARKS,
    HARDWARE_BENCHMARKS,
    GAMING_BENCHMARKS,
    CONSUMER_BENCHMARKS,
  } = await import("@/agents/tier3/sector-benchmarks");

  return [
    SAAS_BENCHMARKS,
    FINTECH_BENCHMARKS,
    MARKETPLACE_BENCHMARKS,
    HEALTHTECH_BENCHMARKS,
    DEEPTECH_BENCHMARKS,
    CLIMATE_BENCHMARKS,
    HARDWARE_BENCHMARKS,
    GAMING_BENCHMARKS,
    CONSUMER_BENCHMARKS,
  ];
}
