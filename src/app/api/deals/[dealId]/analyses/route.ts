import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidCuid } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";
import { loadResults } from "@/services/analysis-results/load-results";
import { pickCanonicalAnalysis } from "@/services/deals/canonical-read-model";

type RouteContext = {
  params: Promise<{ dealId: string }>;
};

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
    if (specificId && !isValidCuid(specificId)) {
      return NextResponse.json({ error: "Invalid analysis ID format" }, { status: 400 });
    }

    // PERF: Always query metadata WITHOUT the results blob.
    const metaSelect = {
      id: true,
      status: true,
      type: true,
      mode: true,
      thesisId: true,
      thesisBypass: true,
      corpusSnapshotId: true,
      completedAgents: true,
      totalAgents: true,
      summary: true,
      totalCost: true,
      totalTimeMs: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
    } as const;

    let analysisMeta = specificId
      ? await prisma.analysis.findFirst({
          where: { dealId, id: specificId },
          select: metaSelect,
        })
      : null;

    if (!specificId) {
      const activeAnalysis = await prisma.analysis.findFirst({
        where: {
          dealId,
          status: { in: ["PENDING", "RUNNING"] },
          mode: { not: "post_call_reanalysis" },
        },
        orderBy: { createdAt: "desc" },
        select: metaSelect,
      });

      if (activeAnalysis) {
        analysisMeta = activeAnalysis;
      } else {
        const [latestThesis, completedAnalyses] = await Promise.all([
          prisma.thesis.findFirst({
            where: { dealId, isLatest: true },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              corpusSnapshotId: true,
            },
          }),
          prisma.analysis.findMany({
            where: {
              dealId,
              status: "COMPLETED",
              completedAt: { not: null },
            },
            orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
            select: {
              ...metaSelect,
              dealId: true,
            },
          }),
        ]);

        const canonical = pickCanonicalAnalysis(latestThesis, completedAnalyses);
        analysisMeta = canonical
          ? completedAnalyses.find((analysis) => analysis.id === canonical.id) ?? null
          : null;
      }
    }

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
        thesisId: analysisMeta.thesisId,
        thesisBypass: analysisMeta.thesisBypass ?? false,
        corpusSnapshotId: analysisMeta.corpusSnapshotId,
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
