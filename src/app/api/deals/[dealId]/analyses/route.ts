import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidCuid } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";

type RouteContext = {
  params: Promise<{ dealId: string }>;
};

/**
 * GET /api/deals/[dealId]/analyses
 * Returns the latest analysis for a deal (used for polling during background analysis)
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

    // Verify deal ownership + fetch latest analysis in one query
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: user.id },
      select: { id: true },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    // Support ?id=xxx to load a specific analysis (for history navigation)
    const specificId = _request.nextUrl.searchParams.get("id");

    const latestAnalysis = specificId
      ? await prisma.analysis.findFirst({
          where: { dealId, id: specificId },
        })
      : await prisma.analysis.findFirst({
          where: { dealId },
          orderBy: { createdAt: "desc" },
        });

    if (!latestAnalysis) {
      return NextResponse.json({ data: null });
    }

    // Auto-expire stuck RUNNING analyses older than 3 hours
    // With reflexion (now capped at 1 iteration), analyses take 15-30 min max.
    // 3h threshold is a safety net for truly stuck processes only.
    // DO NOT set this lower — the API route was marking analyses as FAILED
    // while the Node.js process was still actively running, causing data loss.
    let effectiveStatus = latestAnalysis.status;
    if (latestAnalysis.status === "RUNNING") {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
      if (latestAnalysis.createdAt < threeHoursAgo) {
        await prisma.analysis.update({
          where: { id: latestAnalysis.id },
          data: { status: "FAILED", summary: "Analysis timed out after 3 hours" },
        });
        effectiveStatus = "FAILED";
      }
    }

    // If RUNNING, extract agent-level progress from partial results
    let agentDetails: { name: string; status: string; executionTimeMs?: number }[] | null = null;
    if (effectiveStatus === "RUNNING" && latestAnalysis.results) {
      try {
        const results = latestAnalysis.results as Record<string, {
          agentName?: string;
          success?: boolean;
          executionTimeMs?: number;
        }>;
        agentDetails = Object.entries(results).map(([name, r]) => ({
          name,
          status: r?.success ? "completed" : "failed",
          executionTimeMs: r?.executionTimeMs,
        }));
      } catch {
        // results may not be parseable yet
      }
    }

    // F40/F55: Compute delta + variance if ?compare=true and 2+ analyses
    let analysisDelta = null;
    let varianceReport = null;
    const compare = _request.nextUrl.searchParams.get("compare") === "true";
    if (compare && latestAnalysis.status === "COMPLETED") {
      const previousAnalysis = await prisma.analysis.findFirst({
        where: { dealId, id: { not: latestAnalysis.id }, status: "COMPLETED" },
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
            deltaModule.calculateAnalysisDelta(latestAnalysis.id, previousAnalysis.id),
            varianceModule.detectVariance(latestAnalysis.id, previousAnalysis.id),
          ]);
        } catch (err) {
          console.error("[analyses] Delta/Variance computation failed:", err);
        }
      }
    }

    return NextResponse.json({
      data: {
        id: latestAnalysis.id,
        status: effectiveStatus,
        type: latestAnalysis.type,
        mode: latestAnalysis.mode,
        completedAgents: latestAnalysis.completedAgents,
        totalAgents: latestAnalysis.totalAgents,
        results:
          (latestAnalysis.status === "COMPLETED" || specificId) ? latestAnalysis.results : null,
        summary: latestAnalysis.summary,
        totalCost: latestAnalysis.totalCost?.toString() ?? null,
        totalTimeMs: latestAnalysis.totalTimeMs,
        startedAt: latestAnalysis.startedAt?.toISOString() ?? null,
        completedAt: latestAnalysis.completedAt?.toISOString() ?? null,
        createdAt: latestAnalysis.createdAt.toISOString(),
        agentDetails,
        analysisDelta,
        varianceReport,
      },
    });
  } catch (error) {
    return handleApiError(error, "fetch analysis status");
  }
}
