import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { costMonitor } from "@/services/cost-monitor";

const querySchema = z.object({
  days: z.coerce.number().min(1).max(365).optional().default(30),
  dealId: z.string().optional(),
  userId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// GET /api/admin/costs - Get cost statistics (admin only)
export async function GET(request: NextRequest) {
  try {
    const user = await requireAdmin();

    const searchParams = request.nextUrl.searchParams;
    const params = querySchema.parse({
      days: searchParams.get("days") ?? undefined,
      dealId: searchParams.get("dealId") ?? undefined,
      userId: searchParams.get("userId") ?? undefined,
      startDate: searchParams.get("startDate") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
    });

    // Parse custom date range if provided
    const dateOptions = params.startDate && params.endDate
      ? {
          startDate: new Date(params.startDate),
          endDate: new Date(params.endDate),
        }
      : undefined;

    // If requesting specific deal costs
    if (params.dealId) {
      const [dealSummary, apiCalls] = await Promise.all([
        costMonitor.getDealCostSummary(params.dealId),
        costMonitor.getDealApiCalls(params.dealId, { limit: 100 }),
      ]);

      if (!dealSummary) {
        return NextResponse.json(
          { error: "Deal not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        data: {
          summary: dealSummary,
          apiCalls: apiCalls.events,
          totalApiCalls: apiCalls.total,
        },
      });
    }

    // If requesting user-specific costs
    if (params.userId) {
      const userStats = await costMonitor.getUserStats(
        params.userId,
        params.days,
        dateOptions
      );
      return NextResponse.json({ data: userStats });
    }

    // Get comprehensive global stats
    const [globalStats, userStats, alerts, boardsCosts] = await Promise.all([
      costMonitor.getGlobalStats(params.days, dateOptions),
      costMonitor.getUserStats(user.id, params.days, dateOptions),
      costMonitor.getActiveAlerts({ limit: 20 }),
      costMonitor.getBoardSessionsCosts({ days: params.days, ...dateOptions }),
    ]);

    const costEstimates = costMonitor.getAllCostEstimates();
    const thresholds = costMonitor.getThresholds();

    return NextResponse.json({
      data: {
        global: globalStats,
        user: userStats,
        alerts,
        estimates: costEstimates,
        thresholds,
        boards: {
          totalCost: boardsCosts.totalCost,
          totalSessions: boardsCosts.totalSessions,
          recentSessions: boardsCosts.sessions.slice(0, 5),
        },
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (error.message === "Admin access required") {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
      }
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    console.error("Error fetching costs:", error);
    // Return detailed error in dev mode
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    return NextResponse.json(
      {
        error: "Failed to fetch cost data",
        message: errorMessage,
        stack: process.env.NODE_ENV === "development" ? errorStack : undefined
      },
      { status: 500 }
    );
  }
}
