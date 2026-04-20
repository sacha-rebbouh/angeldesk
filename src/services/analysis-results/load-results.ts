/**
 * Shared utility to load analysis results from Blob cache (fast)
 * with DB fallback + automatic backfill.
 *
 * Used by:
 * - GET /api/deals/[dealId]/analyses (client-side results fetch)
 * - GET /api/deals/[dealId]/export-pdf (PDF generation)
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export interface LoadResultsOptions {
  preferDb?: boolean;
  backfillCache?: boolean;
}

/**
 * Load analysis results from Blob cache first, falling back to DB.
 * Automatically backfills the cache on DB fallback for future requests.
 */
export async function loadResults(
  analysisId: string,
  options: LoadResultsOptions = {}
): Promise<unknown> {
  const blobPath = `analysis-results/${analysisId}.json`;
  const shouldBackfillCache = options.backfillCache !== false;

  if (!options.preferDb) {
    // Try cache first
    try {
      const { downloadFile, storageConfig } = await import("@/services/storage");

      if (!storageConfig.isConfigured) {
        // Local dev: read via storage helper so encrypted cache files are decrypted.
        const buffer = await downloadFile(blobPath);
        try {
          return JSON.parse(buffer.toString("utf-8"));
        } catch (error) {
          logger.warn(
            { err: error, analysisId, blobPath, reason: "blob_json_parse_failed", storageMode: "local" },
            "Failed to parse cached analysis results; falling back to DB"
          );
        }
      } else {
        // Production: list blobs matching our path prefix to get the full URL
        const { list } = await import("@vercel/blob");
        const { blobs } = await list({ prefix: blobPath, limit: 1 });
        if (blobs.length > 0) {
          const buffer = await downloadFile(blobs[0].url);
          try {
            return JSON.parse(buffer.toString("utf-8"));
          } catch (error) {
            logger.warn(
              { err: error, analysisId, blobPath, reason: "blob_json_parse_failed", storageMode: "vercel_blob" },
              "Failed to parse cached analysis results; falling back to DB"
            );
          }
        } else {
          logger.info(
            { analysisId, blobPath, reason: "blob_not_found" },
            "Cached analysis results not found; falling back to DB"
          );
        }
      }
    } catch (error) {
      logger.warn(
        { err: error, analysisId, blobPath, reason: "blob_load_failed" },
        "Failed to load cached analysis results; falling back to DB"
      );
    }
  }

  // DB fallback (slow for large results, but always works)
  const start = Date.now();
  const row = await prisma.analysis.findUnique({
    where: { id: analysisId },
    select: { results: true },
  });
  logger.info(
    {
      analysisId,
      reason: options.preferDb ? "prefer_db" : "cache_fallback",
      durationMs: Date.now() - start,
      hasResults: row?.results != null,
    },
    "Loaded analysis results from DB"
  );

  // Backfill cache for next time
  if (shouldBackfillCache && row?.results) {
    try {
      const { uploadFile } = await import("@/services/storage");
      const jsonBuffer = Buffer.from(JSON.stringify(row.results));
      await uploadFile(blobPath, jsonBuffer, { access: "private" });
      logger.info({ analysisId, blobPath }, "Backfilled analysis results cache");
    } catch (error) {
      logger.warn(
        { err: error, analysisId, blobPath, reason: "cache_backfill_failed" },
        "Failed to backfill analysis results cache"
      );
    }
  }

  return row?.results ?? null;
}
