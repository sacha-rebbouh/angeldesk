/**
 * Benchmark Freshness Checker
 * Alerte quand les benchmarks sont expires ou proches de l'expiration.
 */

import { BENCHMARK_CONFIG, GENERIC_STAGE_BENCHMARKS } from "./config";
import type { PercentileBenchmark } from "./types";

export interface FreshnessReport {
  totalBenchmarks: number;
  expired: BenchmarkStatus[];
  expiringSoon: BenchmarkStatus[]; // < 3 mois
  fresh: number;
  overallStatus: "FRESH" | "STALE" | "EXPIRED";
}

interface BenchmarkStatus {
  sector: string;
  stage: string;
  metric: string;
  lastUpdated: string;
  expiresAt: string;
  daysUntilExpiry: number;
}

export function checkBenchmarkFreshness(): FreshnessReport {
  const now = new Date();
  const expired: BenchmarkStatus[] = [];
  const expiringSoon: BenchmarkStatus[] = [];
  let totalBenchmarks = 0;

  function checkBenchmark(sector: string, stage: string, metric: string, b: PercentileBenchmark) {
    totalBenchmarks++;
    if (!b.expiresAt) {
      expired.push({
        sector, stage, metric,
        lastUpdated: b.lastUpdated || "UNKNOWN",
        expiresAt: "NEVER_SET",
        daysUntilExpiry: -999,
      });
      return;
    }

    const expiresDate = new Date(b.expiresAt);
    const daysUntilExpiry = Math.floor((expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      expired.push({ sector, stage, metric, lastUpdated: b.lastUpdated ?? "UNKNOWN", expiresAt: b.expiresAt, daysUntilExpiry });
    } else if (daysUntilExpiry < 90) {
      expiringSoon.push({ sector, stage, metric, lastUpdated: b.lastUpdated ?? "UNKNOWN", expiresAt: b.expiresAt, daysUntilExpiry });
    }
  }

  // Parcourir les benchmarks sectoriels
  for (const [sector, stages] of Object.entries(BENCHMARK_CONFIG)) {
    for (const [stage, benchmarks] of Object.entries(stages ?? {})) {
      if (benchmarks?.financial) {
        for (const [metric, data] of Object.entries(benchmarks.financial)) {
          if (data && typeof data === "object" && "median" in data) {
            checkBenchmark(sector, stage, metric, data as PercentileBenchmark);
          }
        }
      }
      if (benchmarks?.exit) {
        for (const [metric, data] of Object.entries(benchmarks.exit)) {
          if (data && typeof data === "object" && "median" in data) {
            checkBenchmark(sector, stage, metric, data as PercentileBenchmark);
          }
        }
      }
    }
  }

  // Parcourir les benchmarks generiques
  for (const [stage, benchmarks] of Object.entries(GENERIC_STAGE_BENCHMARKS)) {
    if (benchmarks?.financial) {
      for (const [metric, data] of Object.entries(benchmarks.financial)) {
        if (data && typeof data === "object" && "median" in data) {
          checkBenchmark("GENERIC", stage, metric, data as PercentileBenchmark);
        }
      }
    }
  }

  const fresh = totalBenchmarks - expired.length - expiringSoon.length;
  const overallStatus: "FRESH" | "STALE" | "EXPIRED" =
    expired.length > 0 ? "EXPIRED" :
    expiringSoon.length > totalBenchmarks * 0.3 ? "STALE" :
    "FRESH";

  return { totalBenchmarks, expired, expiringSoon, fresh, overallStatus };
}

/**
 * Formate un warning de freshness pour injection dans les limitations d'un agent.
 */
export function formatFreshnessWarning(report: FreshnessReport): string | null {
  if (report.overallStatus === "FRESH") return null;

  if (report.overallStatus === "EXPIRED") {
    return `ATTENTION: ${report.expired.length} benchmark(s) expire(s). Les scores de positionnement vs marche peuvent etre desalignes. Benchmarks expires: ${report.expired.map(e => `${e.metric} (${e.sector}/${e.stage}, expire depuis ${Math.abs(e.daysUntilExpiry)}j)`).slice(0, 5).join(", ")}.`;
  }

  return `INFO: ${report.expiringSoon.length} benchmark(s) expirent dans moins de 3 mois. Mise a jour recommandee.`;
}
