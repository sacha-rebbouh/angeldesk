import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidCuid } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";

type RouteContext = {
  params: Promise<{ dealId: string }>;
};

/**
 * Try to load results from local cache or Vercel Blob (fast, <1s).
 * Falls back to DB if cache miss (old analyses before caching was added).
 */
async function loadResults(analysisId: string): Promise<unknown> {
  const blobPath = `analysis-results/${analysisId}.json`;

  // Try cache first
  try {
    const { storageConfig } = await import("@/services/storage");

    if (!storageConfig.isConfigured) {
      // Local dev: read from filesystem
      const { readFile } = await import("fs/promises");
      const { join } = await import("path");
      const localPath = join(process.cwd(), "public", "uploads", blobPath);
      const buffer = await readFile(localPath);
      return JSON.parse(buffer.toString("utf-8"));
    } else {
      // Production: list blobs matching our path prefix to get the full URL
      const { list } = await import("@vercel/blob");
      const { blobs } = await list({ prefix: blobPath, limit: 1 });
      if (blobs.length > 0) {
        const res = await fetch(blobs[0].url);
        if (res.ok) {
          return await res.json();
        }
      }
    }
  } catch {
    // Cache miss — fall through to DB
  }

  // DB fallback (slow for large results, but always works)
  console.warn(`[analyses] Cache miss for ${analysisId}, falling back to DB`);
  const start = Date.now();
  const row = await prisma.analysis.findUnique({
    where: { id: analysisId },
    select: { results: true },
  });
  console.warn(`[analyses] DB fallback took ${Date.now() - start}ms`);

  // Backfill cache for next time
  if (row?.results) {
    try {
      const { uploadFile } = await import("@/services/storage");
      const jsonBuffer = Buffer.from(JSON.stringify(row.results));
      await uploadFile(blobPath, jsonBuffer);
      console.log(`[analyses] Backfilled cache for ${analysisId}`);
    } catch {
      // Non-critical
    }
  }

  return row?.results ?? null;
}

/**
 * GET /api/deals/[dealId]/analyses
 *
 * Default (no params): Returns metadata only — NO results blob. Used for polling.
 * ?id=xxx:             Returns metadata + full results for a specific analysis.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { dealId } = await context.params;

    if (!isValidCuid(dealId)) {
      return NextResponse.json(
        { error: "Invalid deal ID format" },
        { status: 400 }
      );
    }

    // Verify deal ownership
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: user.id },
      select: { id: true },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const specificId = _request.nextUrl.searchParams.get("id");

    // PERF: Always query metadata WITHOUT the results blob.
    const metaSelect = {
      id: true,
      status: true,
      type: true,
      mode: true,
      completedAgents: true,
      totalAgents: true,
      summary: true,
      totalCost: true,
      totalTimeMs: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
    } as const;

    const analysisMeta = specificId
      ? await prisma.analysis.findFirst({
          where: { dealId, id: specificId },
          select: metaSelect,
        })
      : await prisma.analysis.findFirst({
          where: { dealId },
          orderBy: { createdAt: "desc" },
          select: metaSelect,
        });

    if (!analysisMeta) {
      return NextResponse.json({ data: null });
    }

    // Auto-expire stuck RUNNING analyses older than 3 hours
    let effectiveStatus = analysisMeta.status;
    if (analysisMeta.status === "RUNNING") {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
      if (analysisMeta.createdAt < threeHoursAgo) {
        await prisma.analysis.update({
          where: { id: analysisMeta.id },
          data: { status: "FAILED", summary: "Analysis timed out after 3 hours" },
        });
        effectiveStatus = "FAILED";
      }
    }

    // Only load results when explicitly requested via ?id=xxx.
    // The default poll NEVER loads the blob — it's several MB and takes 30s+ from Neon.
    let results: unknown = null;
    if (specificId) {
      results = await loadResults(analysisMeta.id);
    }

    // F40/F55: Compute delta + variance if ?compare=true and 2+ analyses
    let analysisDelta = null;
    let varianceReport = null;
    const compare = _request.nextUrl.searchParams.get("compare") === "true";
    if (compare && effectiveStatus === "COMPLETED") {
      const previousAnalysis = await prisma.analysis.findFirst({
        where: { dealId, id: { not: analysisMeta.id }, status: "COMPLETED" },
        orderBy: { completedAt: "desc" },
        select: { id: true },
      });
      if (previousAnalysis) {
        try {
          const [deltaModule, varianceModule] = await Promise.all([
            import("@/services/analysis-delta"),
            import("@/services/analysis-variance"),
          ]);
          [analysisDelta, varianceReport] = await Promise.all([
            deltaModule.calculateAnalysisDelta(analysisMeta.id, previousAnalysis.id),
            varianceModule.detectVariance(analysisMeta.id, previousAnalysis.id),
          ]);
        } catch (err) {
          console.error("[analyses] Delta/Variance computation failed:", err);
        }
      }
    }

    return NextResponse.json({
      data: {
        id: analysisMeta.id,
        status: effectiveStatus,
        type: analysisMeta.type,
        mode: analysisMeta.mode,
        completedAgents: analysisMeta.completedAgents,
        totalAgents: analysisMeta.totalAgents,
        results,
        summary: analysisMeta.summary,
        totalCost: analysisMeta.totalCost?.toString() ?? null,
        totalTimeMs: analysisMeta.totalTimeMs,
        startedAt: analysisMeta.startedAt?.toISOString() ?? null,
        completedAt: analysisMeta.completedAt?.toISOString() ?? null,
        createdAt: analysisMeta.createdAt.toISOString(),
        analysisDelta,
        varianceReport,
      },
    });
  } catch (error) {
    return handleApiError(error, "fetch analysis status");
  }
}
