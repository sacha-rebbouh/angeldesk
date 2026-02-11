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

    const latestAnalysis = await prisma.analysis.findFirst({
      where: { dealId },
      orderBy: { createdAt: "desc" },
    });

    if (!latestAnalysis) {
      return NextResponse.json({ data: null });
    }

    // Auto-expire stuck RUNNING analyses older than 30 minutes
    // Only expire if no progress (completedAgents == 0) or absolute timeout (30 min)
    let effectiveStatus = latestAnalysis.status;
    if (latestAnalysis.status === "RUNNING") {
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
      if (latestAnalysis.createdAt < thirtyMinAgo) {
        await prisma.analysis.update({
          where: { id: latestAnalysis.id },
          data: { status: "FAILED", summary: "Analysis timed out" },
        });
        effectiveStatus = "FAILED";
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
          latestAnalysis.status === "COMPLETED" ? latestAnalysis.results : null,
        summary: latestAnalysis.summary,
        totalCost: latestAnalysis.totalCost?.toString() ?? null,
        totalTimeMs: latestAnalysis.totalTimeMs,
        startedAt: latestAnalysis.startedAt?.toISOString() ?? null,
        completedAt: latestAnalysis.completedAt?.toISOString() ?? null,
        createdAt: latestAnalysis.createdAt.toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error, "fetch analysis status");
  }
}
