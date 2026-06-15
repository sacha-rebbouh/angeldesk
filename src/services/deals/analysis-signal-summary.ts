/**
 * AnalysisSignalSummary — denormalized read-model (Phase H2).
 *
 * The canonical extracted-info (extractCanonicalExtractedInfo) is a PURE,
 * deterministic function of an analysis' `results`, which is immutable once
 * the analysis is COMPLETED.
 * So caching them per analysisId is staleness-free: the read path recomputes
 * the canonical analysis selection cheaply (no blob) and looks the signals up
 * here instead of calling loadResults(blob) per deal on the hot SSR pages.
 *
 * The write is a best-effort OPTIMISATION (warm the cache at completion and on
 * read-miss), never the source of truth — a missed completion path simply makes
 * the read self-correct via loadResults + re-upsert. schemaVersion turns a future
 * change to the extraction logic into controlled cache misses (no data migration).
 */
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  extractCanonicalExtractedInfo,
  type CanonicalExtractedInfo,
} from "@/services/analysis-results/score-extraction";

export const CURRENT_SIGNAL_SUMMARY_SCHEMA_VERSION = 1;

export interface AnalysisSignalSummaryData {
  extractedInfo: CanonicalExtractedInfo | null;
}

/** Derive the cached signals from an analysis' results map. Pure. */
export function computeAnalysisSignalSummary(
  results: unknown
): AnalysisSignalSummaryData {
  return {
    extractedInfo: extractCanonicalExtractedInfo(results),
  };
}

type SummaryRow = {
  sector: string | null;
  stage: string | null;
  instrument: string | null;
  geography: string | null;
  description: string | null;
};

function rowToData(row: SummaryRow): AnalysisSignalSummaryData {
  // Mirror extractCanonicalExtractedInfo's contract: null when every field is null.
  const extractedInfo: CanonicalExtractedInfo | null =
    row.sector ?? row.stage ?? row.instrument ?? row.geography ?? row.description
      ? {
          sector: row.sector,
          stage: row.stage,
          instrument: row.instrument,
          geography: row.geography,
          description: row.description,
        }
      : null;
  return { extractedInfo };
}

/**
 * Bulk-read cached signals for the given analysisIds at the current schema
 * version. Rows at an older schemaVersion are intentionally excluded (treated
 * as misses by the caller, which recomputes and re-upserts them).
 *
 * Best-effort, like the upsert: a missing table (the prod deploy window before
 * the migration is applied by hand, D4 pattern) or any transient query failure
 * returns an empty map so EVERY id becomes a miss and falls back to loadResults,
 * never crashing the SSR pages. The read-model is an optimisation, not a hard
 * dependency.
 */
export async function readAnalysisSignalSummaries(
  analysisIds: string[]
): Promise<Map<string, AnalysisSignalSummaryData>> {
  if (analysisIds.length === 0) {
    return new Map();
  }
  try {
    const rows = await prisma.analysisSignalSummary.findMany({
      where: {
        analysisId: { in: analysisIds },
        schemaVersion: CURRENT_SIGNAL_SUMMARY_SCHEMA_VERSION,
      },
      select: {
        analysisId: true,
        sector: true,
        stage: true,
        instrument: true,
        geography: true,
        description: true,
      },
    });
    return new Map(rows.map((row) => [row.analysisId, rowToData(row)]));
  } catch (err) {
    logger.warn(
      { err, count: analysisIds.length },
      "Failed to read AnalysisSignalSummary cache; treating all as misses (loadResults fallback)"
    );
    return new Map();
  }
}

/**
 * Best-effort upsert of the cached signals for one analysis. NEVER throws (logs
 * on failure) — the caller (completeAnalysis write path, or read-miss backfill)
 * must not be impacted by a cache write. Cleanup is handled by the FK cascade
 * (analysisId -> Analysis ON DELETE CASCADE).
 */
export async function upsertAnalysisSignalSummary(
  analysisId: string,
  dealId: string,
  results: unknown
): Promise<void> {
  try {
    const { extractedInfo } = computeAnalysisSignalSummary(results);
    const data = {
      dealId,
      sector: extractedInfo?.sector ?? null,
      stage: extractedInfo?.stage ?? null,
      instrument: extractedInfo?.instrument ?? null,
      geography: extractedInfo?.geography ?? null,
      description: extractedInfo?.description ?? null,
      schemaVersion: CURRENT_SIGNAL_SUMMARY_SCHEMA_VERSION,
    };
    await prisma.analysisSignalSummary.upsert({
      where: { analysisId },
      create: { analysisId, ...data },
      update: data,
    });
  } catch (err) {
    logger.warn(
      { err, analysisId, dealId },
      "Failed to upsert AnalysisSignalSummary (non-blocking)"
    );
  }
}
