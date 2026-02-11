/**
 * Benchmarks Service - Configuration par défaut
 *
 * TOUTES les valeurs qui étaient hard-codées dans les agents sont maintenant ici.
 * Sources: OpenVC 2024, First Round State of Startups, Carta, SaaStr
 *
 * Structure: SECTOR -> STAGE -> METRICS
 */

import type { BenchmarkConfig, PercentileBenchmark, SectorStageBenchmarks } from "./types";

// ============================================================================
// BENCHMARKS FINANCIERS PAR DÉFAUT (utilisés si pas de data DB)
// ============================================================================

/**
 * Benchmarks génériques (tous secteurs confondus)
 * Ces valeurs sont utilisées comme fallback quand pas de données sectorielles
 */
const GENERIC_BENCHMARKS: Record<string, Partial<SectorStageBenchmarks>> = {
  PRE_SEED: {
    financial: {
      arrGrowthYoY: { p25: 80, median: 150, p75: 250, source: "First Round State of Startups 2024", sourceUrl: "https://stateofstartups.firstround.com/2024", lastUpdated: "2024-11-01", expiresAt: "2025-11-01", dataYear: 2024 },
      nrr: { p25: 90, median: 100, p75: 115, source: "Estimation early stage", lastUpdated: "2024-06-01", expiresAt: "2025-06-01", dataYear: 2024 },
      grossRetention: { p25: 80, median: 88, p75: 95, source: "Carta State of Private Markets Q3 2024", sourceUrl: "https://carta.com/blog/state-of-private-markets-q3-2024", lastUpdated: "2024-10-15", expiresAt: "2025-10-15", dataYear: 2024 },
      burnMultiple: { p25: 2, median: 3, p75: 5, source: "SaaStr Annual Survey 2024", sourceUrl: "https://www.saastr.com/benchmarks", lastUpdated: "2024-09-01", expiresAt: "2025-09-01", dataYear: 2024 },
      valuationMultiple: { p25: 20, median: 35, p75: 60, source: "Carta State of Private Markets Q3 2024", sourceUrl: "https://carta.com/blog/state-of-private-markets-q3-2024", lastUpdated: "2024-10-15", expiresAt: "2025-10-15", dataYear: 2024 },
      ltvCacRatio: { p25: 1.5, median: 2.5, p75: 4, source: "OpenVC Benchmark Report 2024", sourceUrl: "https://openvc.app/benchmarks", lastUpdated: "2024-07-01", expiresAt: "2025-07-01", dataYear: 2024 },
      cacPaybackMonths: { p25: 8, median: 14, p75: 24, source: "OpenVC Benchmark Report 2024", sourceUrl: "https://openvc.app/benchmarks", lastUpdated: "2024-07-01", expiresAt: "2025-07-01", dataYear: 2024 },
      dilution: { p25: 18, median: 22, p75: 28, source: "Carta State of Private Markets Q3 2024", sourceUrl: "https://carta.com/blog/state-of-private-markets-q3-2024", lastUpdated: "2024-10-15", expiresAt: "2025-10-15", dataYear: 2024 },
    },
    exit: {
      revenueMultiple: { p25: 2, median: 4, p75: 8, source: "PitchBook Annual VC Report 2024", lastUpdated: "2024-12-01", expiresAt: "2025-12-01", dataYear: 2024 },
      timeToLiquidityYears: { bestCase: 5, baseCase: 7, worstCase: 12 },
    },
    team: {
      minFounders: 1,
      optimalFounders: 2,
      technicalCofounderRequired: true,
    },
  },
  SEED: {
    financial: {
      arrGrowthYoY: { p25: 70, median: 120, p75: 200, source: "First Round State of Startups 2024", sourceUrl: "https://stateofstartups.firstround.com/2024", lastUpdated: "2024-11-01", expiresAt: "2025-11-01", dataYear: 2024 },
      nrr: { p25: 95, median: 110, p75: 130, source: "OpenVC Benchmark Report 2024", sourceUrl: "https://openvc.app/benchmarks", lastUpdated: "2024-07-01", expiresAt: "2025-07-01", dataYear: 2024 },
      grossRetention: { p25: 82, median: 90, p75: 95, source: "Carta State of Private Markets Q3 2024", sourceUrl: "https://carta.com/blog/state-of-private-markets-q3-2024", lastUpdated: "2024-10-15", expiresAt: "2025-10-15", dataYear: 2024 },
      burnMultiple: { p25: 1.2, median: 2, p75: 3, source: "SaaStr Annual Survey 2024", sourceUrl: "https://www.saastr.com/benchmarks", lastUpdated: "2024-09-01", expiresAt: "2025-09-01", dataYear: 2024 },
      valuationMultiple: { p25: 15, median: 25, p75: 40, source: "Carta State of Private Markets Q3 2024", sourceUrl: "https://carta.com/blog/state-of-private-markets-q3-2024", lastUpdated: "2024-10-15", expiresAt: "2025-10-15", dataYear: 2024 },
      ltvCacRatio: { p25: 2, median: 3, p75: 5, source: "OpenVC Benchmark Report 2024", sourceUrl: "https://openvc.app/benchmarks", lastUpdated: "2024-07-01", expiresAt: "2025-07-01", dataYear: 2024 },
      cacPaybackMonths: { p25: 6, median: 12, p75: 18, source: "OpenVC Benchmark Report 2024", sourceUrl: "https://openvc.app/benchmarks", lastUpdated: "2024-07-01", expiresAt: "2025-07-01", dataYear: 2024 },
      dilution: { p25: 15, median: 20, p75: 25, source: "Carta State of Private Markets Q3 2024", sourceUrl: "https://carta.com/blog/state-of-private-markets-q3-2024", lastUpdated: "2024-10-15", expiresAt: "2025-10-15", dataYear: 2024 },
    },
    exit: {
      revenueMultiple: { p25: 3, median: 5, p75: 8, source: "PitchBook Annual VC Report 2024", lastUpdated: "2024-12-01", expiresAt: "2025-12-01", dataYear: 2024 },
      timeToLiquidityYears: { bestCase: 4, baseCase: 6, worstCase: 10 },
    },
    team: {
      minFounders: 2,
      optimalFounders: 2,
      technicalCofounderRequired: true,
    },
  },
  SERIES_A: {
    financial: {
      arrGrowthYoY: { p25: 50, median: 80, p75: 120, source: "First Round State of Startups 2024", sourceUrl: "https://stateofstartups.firstround.com/2024", lastUpdated: "2024-11-01", expiresAt: "2025-11-01", dataYear: 2024 },
      nrr: { p25: 100, median: 115, p75: 135, source: "OpenVC Benchmark Report 2024", sourceUrl: "https://openvc.app/benchmarks", lastUpdated: "2024-07-01", expiresAt: "2025-07-01", dataYear: 2024 },
      grossRetention: { p25: 85, median: 92, p75: 97, source: "Carta State of Private Markets Q3 2024", sourceUrl: "https://carta.com/blog/state-of-private-markets-q3-2024", lastUpdated: "2024-10-15", expiresAt: "2025-10-15", dataYear: 2024 },
      burnMultiple: { p25: 1, median: 1.5, p75: 2.5, source: "SaaStr Annual Survey 2024", sourceUrl: "https://www.saastr.com/benchmarks", lastUpdated: "2024-09-01", expiresAt: "2025-09-01", dataYear: 2024 },
      valuationMultiple: { p25: 8, median: 12, p75: 18, source: "Carta State of Private Markets Q3 2024", sourceUrl: "https://carta.com/blog/state-of-private-markets-q3-2024", lastUpdated: "2024-10-15", expiresAt: "2025-10-15", dataYear: 2024 },
      ltvCacRatio: { p25: 2.5, median: 3.5, p75: 6, source: "OpenVC Benchmark Report 2024", sourceUrl: "https://openvc.app/benchmarks", lastUpdated: "2024-07-01", expiresAt: "2025-07-01", dataYear: 2024 },
      cacPaybackMonths: { p25: 6, median: 10, p75: 15, source: "OpenVC Benchmark Report 2024", sourceUrl: "https://openvc.app/benchmarks", lastUpdated: "2024-07-01", expiresAt: "2025-07-01", dataYear: 2024 },
      dilution: { p25: 12, median: 18, p75: 22, source: "Carta State of Private Markets Q3 2024", sourceUrl: "https://carta.com/blog/state-of-private-markets-q3-2024", lastUpdated: "2024-10-15", expiresAt: "2025-10-15", dataYear: 2024 },
    },
    exit: {
      revenueMultiple: { p25: 4, median: 6, p75: 10, source: "PitchBook Annual VC Report 2024", lastUpdated: "2024-12-01", expiresAt: "2025-12-01", dataYear: 2024 },
      timeToLiquidityYears: { bestCase: 3, baseCase: 5, worstCase: 8 },
    },
    team: {
      minFounders: 2,
      optimalFounders: 2,
      technicalCofounderRequired: true,
    },
  },
  SERIES_B: {
    financial: {
      arrGrowthYoY: { p25: 40, median: 60, p75: 100, source: "First Round State of Startups 2024", sourceUrl: "https://stateofstartups.firstround.com/2024", lastUpdated: "2024-11-01", expiresAt: "2025-11-01", dataYear: 2024 },
      nrr: { p25: 105, median: 120, p75: 140, source: "OpenVC Benchmark Report 2024", sourceUrl: "https://openvc.app/benchmarks", lastUpdated: "2024-07-01", expiresAt: "2025-07-01", dataYear: 2024 },
      grossRetention: { p25: 88, median: 93, p75: 97, source: "Carta State of Private Markets Q3 2024", sourceUrl: "https://carta.com/blog/state-of-private-markets-q3-2024", lastUpdated: "2024-10-15", expiresAt: "2025-10-15", dataYear: 2024 },
      burnMultiple: { p25: 0.8, median: 1.2, p75: 2, source: "SaaStr Annual Survey 2024", sourceUrl: "https://www.saastr.com/benchmarks", lastUpdated: "2024-09-01", expiresAt: "2025-09-01", dataYear: 2024 },
      valuationMultiple: { p25: 6, median: 10, p75: 15, source: "Carta State of Private Markets Q3 2024", sourceUrl: "https://carta.com/blog/state-of-private-markets-q3-2024", lastUpdated: "2024-10-15", expiresAt: "2025-10-15", dataYear: 2024 },
      ltvCacRatio: { p25: 3, median: 4, p75: 7, source: "OpenVC Benchmark Report 2024", sourceUrl: "https://openvc.app/benchmarks", lastUpdated: "2024-07-01", expiresAt: "2025-07-01", dataYear: 2024 },
      cacPaybackMonths: { p25: 5, median: 9, p75: 14, source: "OpenVC Benchmark Report 2024", sourceUrl: "https://openvc.app/benchmarks", lastUpdated: "2024-07-01", expiresAt: "2025-07-01", dataYear: 2024 },
      dilution: { p25: 10, median: 15, p75: 20, source: "Carta State of Private Markets Q3 2024", sourceUrl: "https://carta.com/blog/state-of-private-markets-q3-2024", lastUpdated: "2024-10-15", expiresAt: "2025-10-15", dataYear: 2024 },
    },
    exit: {
      revenueMultiple: { p25: 5, median: 8, p75: 12, source: "PitchBook Annual VC Report 2024", lastUpdated: "2024-12-01", expiresAt: "2025-12-01", dataYear: 2024 },
      timeToLiquidityYears: { bestCase: 2, baseCase: 4, worstCase: 7 },
    },
    team: {
      minFounders: 2,
      optimalFounders: 2,
      technicalCofounderRequired: true,
    },
  },
};

// ============================================================================
// BENCHMARKS SECTORIELS (différences par rapport aux génériques)
// ============================================================================

/**
 * SaaS B2B - Le secteur le mieux documenté
 */
const SAAS_BENCHMARKS: Record<string, Partial<SectorStageBenchmarks>> = {
  SEED: {
    financial: {
      ...GENERIC_BENCHMARKS.SEED!.financial!,
      nrr: { p25: 100, median: 115, p75: 135, source: "SaaStr Annual Survey 2024", sourceUrl: "https://www.saastr.com/benchmarks", lastUpdated: "2024-09-01", expiresAt: "2025-09-01", dataYear: 2024 },
      grossRetention: { p25: 85, median: 92, p75: 97, source: "SaaStr Annual Survey 2024", sourceUrl: "https://www.saastr.com/benchmarks", lastUpdated: "2024-09-01", expiresAt: "2025-09-01", dataYear: 2024 },
    },
  },
  SERIES_A: {
    financial: {
      ...GENERIC_BENCHMARKS.SERIES_A!.financial!,
      nrr: { p25: 105, median: 120, p75: 145, source: "SaaStr Annual Survey 2024", sourceUrl: "https://www.saastr.com/benchmarks", lastUpdated: "2024-09-01", expiresAt: "2025-09-01", dataYear: 2024 },
      grossRetention: { p25: 88, median: 94, p75: 98, source: "SaaStr Annual Survey 2024", sourceUrl: "https://www.saastr.com/benchmarks", lastUpdated: "2024-09-01", expiresAt: "2025-09-01", dataYear: 2024 },
    },
  },
};

/**
 * Fintech - Métriques spécifiques
 */
const FINTECH_BENCHMARKS: Record<string, Partial<SectorStageBenchmarks>> = {
  SEED: {
    financial: {
      ...GENERIC_BENCHMARKS.SEED!.financial!,
      cacPaybackMonths: { p25: 8, median: 14, p75: 22, source: "a16z Fintech State of Fintech 2024", sourceUrl: "https://a16z.com/fintech", lastUpdated: "2024-08-01", expiresAt: "2025-08-01", dataYear: 2024 },
      nrr: { p25: 100, median: 118, p75: 140, source: "a16z Fintech State of Fintech 2024", sourceUrl: "https://a16z.com/fintech", lastUpdated: "2024-08-01", expiresAt: "2025-08-01", dataYear: 2024 },
    },
    exit: {
      revenueMultiple: { p25: 4, median: 7, p75: 12, source: "PitchBook Fintech Annual Report 2024", lastUpdated: "2024-12-01", expiresAt: "2025-12-01", dataYear: 2024 },
      timeToLiquidityYears: { bestCase: 5, baseCase: 7, worstCase: 12 },
    },
  },
};

/**
 * Marketplace - Métriques spécifiques (GMV, take rate)
 */
const MARKETPLACE_BENCHMARKS: Record<string, Partial<SectorStageBenchmarks>> = {
  SEED: {
    financial: {
      ...GENERIC_BENCHMARKS.SEED!.financial!,
      valuationMultiple: { p25: 0.5, median: 1, p75: 2, source: "a16z Marketplace 100 Report 2024", sourceUrl: "https://a16z.com/marketplace-100", lastUpdated: "2024-06-01", expiresAt: "2025-06-01", dataYear: 2024 },
      burnMultiple: { p25: 1.5, median: 2.5, p75: 4, source: "a16z Marketplace 100 Report 2024", sourceUrl: "https://a16z.com/marketplace-100", lastUpdated: "2024-06-01", expiresAt: "2025-06-01", dataYear: 2024 },
    },
    exit: {
      revenueMultiple: { p25: 2, median: 4, p75: 8, source: "PitchBook Annual VC Report 2024", lastUpdated: "2024-12-01", expiresAt: "2025-12-01", dataYear: 2024 },
      timeToLiquidityYears: { bestCase: 5, baseCase: 8, worstCase: 12 },
    },
  },
};

/**
 * Healthtech - Cycles plus longs, réglementation
 */
const HEALTHTECH_BENCHMARKS: Record<string, Partial<SectorStageBenchmarks>> = {
  SEED: {
    financial: {
      ...GENERIC_BENCHMARKS.SEED!.financial!,
      cacPaybackMonths: { p25: 10, median: 18, p75: 30, source: "Rock Health Annual Report 2024", sourceUrl: "https://rockhealth.com/reports", lastUpdated: "2024-07-01", expiresAt: "2025-07-01", dataYear: 2024 },
    },
    exit: {
      revenueMultiple: { p25: 3, median: 6, p75: 12, source: "Rock Health Annual Report 2024", sourceUrl: "https://rockhealth.com/reports", lastUpdated: "2024-07-01", expiresAt: "2025-07-01", dataYear: 2024 },
      timeToLiquidityYears: { bestCase: 6, baseCase: 9, worstCase: 15 },
    },
  },
};

/**
 * Deeptech - R&D intensif, cycles très longs
 */
const DEEPTECH_BENCHMARKS: Record<string, Partial<SectorStageBenchmarks>> = {
  SEED: {
    financial: {
      ...GENERIC_BENCHMARKS.SEED!.financial!,
      burnMultiple: { p25: 3, median: 5, p75: 10, source: "Hello Tomorrow Deep Tech Report 2024", sourceUrl: "https://hello-tomorrow.org/deep-tech-report", lastUpdated: "2024-05-01", expiresAt: "2025-05-01", dataYear: 2024 },
      arrGrowthYoY: { p25: 0, median: 50, p75: 150, source: "Hello Tomorrow Deep Tech Report 2024", sourceUrl: "https://hello-tomorrow.org/deep-tech-report", lastUpdated: "2024-05-01", expiresAt: "2025-05-01", dataYear: 2024 },
    },
    exit: {
      revenueMultiple: { p25: 5, median: 10, p75: 20, source: "Hello Tomorrow Deep Tech Report 2024", sourceUrl: "https://hello-tomorrow.org/deep-tech-report", lastUpdated: "2024-05-01", expiresAt: "2025-05-01", dataYear: 2024 },
      timeToLiquidityYears: { bestCase: 7, baseCase: 10, worstCase: 15 },
    },
    team: {
      minFounders: 2,
      optimalFounders: 3,
      technicalCofounderRequired: true,
    },
  },
};

// ============================================================================
// CONFIGURATION COMPLÈTE EXPORTÉE
// ============================================================================

export const BENCHMARK_CONFIG: BenchmarkConfig = {
  SaaS: SAAS_BENCHMARKS,
  Fintech: FINTECH_BENCHMARKS,
  Marketplace: MARKETPLACE_BENCHMARKS,
  Healthtech: HEALTHTECH_BENCHMARKS,
  Deeptech: DEEPTECH_BENCHMARKS,
  // Les autres secteurs utilisent les benchmarks génériques
  Climate: GENERIC_BENCHMARKS,
  Consumer: GENERIC_BENCHMARKS,
  Hardware: GENERIC_BENCHMARKS,
  Gaming: GENERIC_BENCHMARKS,
  Other: GENERIC_BENCHMARKS,
};

// Export des génériques pour usage direct
export const GENERIC_STAGE_BENCHMARKS = GENERIC_BENCHMARKS;

// ============================================================================
// HELPER: Récupérer les benchmarks avec fallback
// ============================================================================

export function getBenchmarksForSectorStage(
  sector: string | null | undefined,
  stage: string | null | undefined
): Partial<SectorStageBenchmarks> {
  const normalizedSector = normalizeSector(sector);
  const normalizedStage = normalizeStage(stage);

  // 1. Essayer secteur + stage spécifique
  const sectorConfig = BENCHMARK_CONFIG[normalizedSector];
  if (sectorConfig) {
    const stageConfig = sectorConfig[normalizedStage as keyof typeof sectorConfig];
    if (stageConfig) {
      return stageConfig;
    }
  }

  // 2. Fallback sur les génériques pour ce stage
  const genericStageConfig = GENERIC_STAGE_BENCHMARKS[normalizedStage];
  if (genericStageConfig) {
    return genericStageConfig;
  }

  // 3. Fallback ultime: SEED générique
  return GENERIC_STAGE_BENCHMARKS.SEED!;
}

function normalizeSector(sector: string | null | undefined): keyof BenchmarkConfig {
  if (!sector) return "Other";

  const lower = sector.toLowerCase();

  if (lower.includes("saas") || lower.includes("b2b software")) return "SaaS";
  if (lower.includes("fintech") || lower.includes("finance")) return "Fintech";
  if (lower.includes("marketplace")) return "Marketplace";
  if (lower.includes("health") || lower.includes("medtech") || lower.includes("biotech")) return "Healthtech";
  if (lower.includes("deep") || lower.includes("quantum") || lower.includes("space")) return "Deeptech";
  if (lower.includes("climate") || lower.includes("cleantech") || lower.includes("green")) return "Climate";
  if (lower.includes("consumer") || lower.includes("b2c") || lower.includes("d2c")) return "Consumer";
  if (lower.includes("hardware") || lower.includes("iot")) return "Hardware";
  if (lower.includes("gaming") || lower.includes("game")) return "Gaming";

  return "Other";
}

function normalizeStage(stage: string | null | undefined): keyof typeof GENERIC_BENCHMARKS {
  if (!stage) return "SEED";

  const lower = stage.toLowerCase().replace(/[^a-z]/g, "");

  if (lower.includes("preseed") || lower.includes("pre")) return "PRE_SEED";
  if (lower.includes("seed")) return "SEED";
  if (lower.includes("seriesa") || lower === "a") return "SERIES_A";
  if (lower.includes("seriesb") || lower === "b") return "SERIES_B";
  if (lower.includes("seriesc") || lower === "c" || lower.includes("later")) return "SERIES_B"; // Fallback

  return "SEED";
}
