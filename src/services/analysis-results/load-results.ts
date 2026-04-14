/**
 * Shared utility to load analysis results from Blob cache (fast)
 * with DB fallback + automatic backfill.
 *
 * Used by:
 * - GET /api/deals/[dealId]/analyses (client-side results fetch)
 * - GET /api/deals/[dealId]/export-pdf (PDF generation)
 */

import { prisma } from "@/lib/prisma";

/**
 * Load analysis results from Blob cache first, falling back to DB.
 * Automatically backfills the cache on DB fallback for future requests.
 */
export async function loadResults(analysisId: string): Promise<unknown> {
  const blobPath = `analysis-results/${analysisId}.json`;

  // Try cache first
  try {
    const { downloadFile, storageConfig } = await import("@/services/storage");

    if (!storageConfig.isConfigured) {
      // Local dev: read via storage helper so encrypted cache files are decrypted.
      const buffer = await downloadFile(blobPath);
      return JSON.parse(buffer.toString("utf-8"));
    } else {
      // Production: list blobs matching our path prefix to get the full URL
      const { list } = await import("@vercel/blob");
      const { blobs } = await list({ prefix: blobPath, limit: 1 });
      if (blobs.length > 0) {
        const buffer = await downloadFile(blobs[0].url);
        return JSON.parse(buffer.toString("utf-8"));
      }
    }
  } catch {
    // Cache miss — fall through to DB
  }

  // DB fallback (slow for large results, but always works)
  console.warn(`[load-results] Cache miss for ${analysisId}, falling back to DB`);
  const start = Date.now();
  const row = await prisma.analysis.findUnique({
    where: { id: analysisId },
    select: { results: true },
  });
  console.warn(`[load-results] DB fallback took ${Date.now() - start}ms`);

  // Backfill cache for next time
  if (row?.results) {
    try {
      const { uploadFile } = await import("@/services/storage");
      const jsonBuffer = Buffer.from(JSON.stringify(row.results));
      await uploadFile(blobPath, jsonBuffer, { access: "private" });
      console.log(`[load-results] Backfilled cache for ${analysisId}`);
    } catch {
      // Non-critical
    }
  }

  return row?.results ?? null;
}
