/**
 * Benchmarks Service - API publique
 *
 * Utilisation dans les agents:
 *
 * import { getBenchmark, getExitBenchmark, getBAPreferences } from "@/services/benchmarks";
 *
 * const nrrMedian = getBenchmark(deal.sector, deal.stage, "nrr", "median");
 * const dilutionP25 = getBenchmark(deal.sector, deal.stage, "dilution", "p25");
 * const exitMultiple = getExitBenchmark(deal.sector, deal.stage, "revenueMultiple", "median");
 */

import { getBenchmarksForSectorStage, GENERIC_STAGE_BENCHMARKS } from "./config";
import type {
  PercentileBenchmark,
  FundingStage,
  Sector,
  BAPreferences,
  SectorStageBenchmarks,
} from "./types";
import { DEFAULT_BA_PREFERENCES } from "./types";

// Re-export types
export type {
  PercentileBenchmark,
  FundingStage,
  Sector,
  BAPreferences,
  SectorStageBenchmarks,
};
export { DEFAULT_BA_PREFERENCES };

// ============================================================================
// FONCTIONS PRINCIPALES
// ============================================================================

type FinancialMetric = keyof SectorStageBenchmarks["financial"];
type ExitMetric = "revenueMultiple";
type Percentile = "p25" | "median" | "p75";

/**
 * Récupère un benchmark financier pour un secteur/stage donné
 *
 * @example
 * const nrrMedian = getBenchmark("SaaS", "SEED", "nrr", "median"); // 115
 * const dilutionP25 = getBenchmark("Fintech", "SERIES_A", "dilution", "p25"); // 12
 */
export function getBenchmark(
  sector: string | null | undefined,
  stage: string | null | undefined,
  metric: FinancialMetric,
  percentile: Percentile
): number {
  const benchmarks = getBenchmarksForSectorStage(sector, stage);
  const metricData = benchmarks.financial?.[metric];

  if (!metricData) {
    // Fallback sur les génériques SEED
    const fallback = GENERIC_STAGE_BENCHMARKS.SEED?.financial?.[metric];
    return fallback?.[percentile] ?? 0;
  }

  return metricData[percentile];
}

/**
 * Récupère tous les percentiles d'un benchmark financier
 *
 * @example
 * const nrr = getBenchmarkFull("SaaS", "SEED", "nrr");
 * // { p25: 100, median: 115, p75: 135, source: "SaaStr 2024" }
 */
export function getBenchmarkFull(
  sector: string | null | undefined,
  stage: string | null | undefined,
  metric: FinancialMetric
): PercentileBenchmark {
  const benchmarks = getBenchmarksForSectorStage(sector, stage);
  const metricData = benchmarks.financial?.[metric];

  if (!metricData) {
    const fallback = GENERIC_STAGE_BENCHMARKS.SEED?.financial?.[metric];
    return fallback ?? { p25: 0, median: 0, p75: 0 };
  }

  return metricData;
}

/**
 * Récupère un benchmark de sortie (M&A/IPO)
 *
 * @example
 * const exitMultiple = getExitBenchmark("SaaS", "SEED", "revenueMultiple", "median"); // 5
 */
export function getExitBenchmark(
  sector: string | null | undefined,
  stage: string | null | undefined,
  metric: ExitMetric,
  percentile: Percentile
): number {
  const benchmarks = getBenchmarksForSectorStage(sector, stage);
  const metricData = benchmarks.exit?.[metric];

  if (!metricData) {
    const fallback = GENERIC_STAGE_BENCHMARKS.SEED?.exit?.[metric];
    return (fallback as PercentileBenchmark)?.[percentile] ?? 5;
  }

  return metricData[percentile];
}

/**
 * Récupère tous les percentiles d'un benchmark de sortie
 */
export function getExitBenchmarkFull(
  sector: string | null | undefined,
  stage: string | null | undefined,
  metric: ExitMetric
): PercentileBenchmark {
  const benchmarks = getBenchmarksForSectorStage(sector, stage);
  const metricData = benchmarks.exit?.[metric];

  if (!metricData) {
    const fallback = GENERIC_STAGE_BENCHMARKS.SEED?.exit?.[metric];
    return (fallback as PercentileBenchmark) ?? { p25: 3, median: 5, p75: 8 };
  }

  return metricData;
}

/**
 * Récupère les estimations de time to liquidity
 *
 * @example
 * const liquidity = getTimeToLiquidity("Deeptech", "SEED");
 * // { bestCase: 7, baseCase: 10, worstCase: 15 }
 */
export function getTimeToLiquidity(
  sector: string | null | undefined,
  stage: string | null | undefined
): { bestCase: number; baseCase: number; worstCase: number } {
  const benchmarks = getBenchmarksForSectorStage(sector, stage);
  const exitData = benchmarks.exit?.timeToLiquidityYears;

  if (!exitData) {
    return { bestCase: 4, baseCase: 6, worstCase: 10 };
  }

  return exitData;
}

/**
 * Récupère les benchmarks d'équipe
 */
export function getTeamBenchmarks(
  sector: string | null | undefined,
  stage: string | null | undefined
): SectorStageBenchmarks["team"] {
  const benchmarks = getBenchmarksForSectorStage(sector, stage);

  return (
    benchmarks.team ?? {
      minFounders: 1,
      optimalFounders: 2,
      technicalCofounderRequired: true,
    }
  );
}

// ============================================================================
// PRÉFÉRENCES BA (Business Angel)
// ============================================================================

/**
 * Récupère les préférences BA depuis la DB ou retourne les valeurs par défaut
 *
 * @param userPreferences - Préférences stockées en DB (JSON)
 * @returns Préférences complètes avec fallback sur les défauts
 */
export function getBAPreferences(
  userPreferences: Partial<BAPreferences> | null | undefined
): BAPreferences {
  if (!userPreferences) {
    return DEFAULT_BA_PREFERENCES;
  }

  return {
    ...DEFAULT_BA_PREFERENCES,
    ...userPreferences,
  };
}

/**
 * Calcule le ticket size typique pour un BA
 *
 * @param roundAmount - Montant du round
 * @param baPreferences - Préférences du BA
 * @returns Ticket size calculé
 */
export function calculateBATicketSize(
  roundAmount: number,
  baPreferences: BAPreferences = DEFAULT_BA_PREFERENCES
): number {
  const calculated = roundAmount * baPreferences.typicalTicketPercent;
  return Math.max(
    baPreferences.minTicketAmount,
    Math.min(calculated, baPreferences.maxTicketAmount)
  );
}

// ============================================================================
// UTILITAIRES DE PERCENTILE
// ============================================================================

/**
 * Calcule le percentile d'une valeur par rapport à un benchmark
 *
 * @example
 * const percentile = calculatePercentile(120, { p25: 95, median: 110, p75: 130 });
 * // ~70 (entre median et p75)
 */
export function calculatePercentile(
  value: number,
  benchmark: PercentileBenchmark
): number {
  const { p25, median, p75 } = benchmark;

  if (value <= p25) {
    // 0-25
    return Math.round((value / p25) * 25);
  } else if (value <= median) {
    // 25-50
    return Math.round(25 + ((value - p25) / (median - p25)) * 25);
  } else if (value <= p75) {
    // 50-75
    return Math.round(50 + ((value - median) / (p75 - median)) * 25);
  } else {
    // 75-100
    const excess = value - p75;
    const range = p75 - median; // Utiliser le même écart que 50-75
    return Math.min(100, Math.round(75 + (excess / range) * 25));
  }
}

/**
 * Évalue une valeur par rapport à un benchmark et retourne un verdict
 */
export function assessValueVsBenchmark(
  value: number,
  benchmark: PercentileBenchmark,
  higherIsBetter = true
): {
  percentile: number;
  verdict: "EXCELLENT" | "GOOD" | "AVERAGE" | "BELOW_AVERAGE" | "POOR";
  verdictFr: string;
} {
  const percentile = calculatePercentile(value, benchmark);

  // Si higher is better (ex: NRR, Growth), on utilise le percentile direct
  // Si lower is better (ex: CAC, Burn), on inverse
  const effectivePercentile = higherIsBetter ? percentile : 100 - percentile;

  let verdict: "EXCELLENT" | "GOOD" | "AVERAGE" | "BELOW_AVERAGE" | "POOR";
  let verdictFr: string;

  if (effectivePercentile >= 75) {
    verdict = "EXCELLENT";
    verdictFr = "Excellent (Top 25%)";
  } else if (effectivePercentile >= 50) {
    verdict = "GOOD";
    verdictFr = "Bon (Au-dessus de la médiane)";
  } else if (effectivePercentile >= 25) {
    verdict = "AVERAGE";
    verdictFr = "Moyen (En-dessous de la médiane)";
  } else if (effectivePercentile >= 10) {
    verdict = "BELOW_AVERAGE";
    verdictFr = "Faible (Bottom 25%)";
  } else {
    verdict = "POOR";
    verdictFr = "Préoccupant (Bottom 10%)";
  }

  return { percentile, verdict, verdictFr };
}
