import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { costMonitor } from "@/services/cost-monitor";

const querySchema = z.object({
  days: z.coerce.number().min(1).max(365).optional().default(30),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  sortBy: z.enum(["totalCost", "dealCount", "analysisCount"]).optional().default("totalCost"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

// GET /api/admin/costs/users - Get all users cost stats (leaderboard)
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const searchParams = request.nextUrl.searchParams;
    const params = querySchema.parse({
      days: searchParams.get("days") ?? undefined,
      startDate: searchParams.get("startDate") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      sortBy: searchParams.get("sortBy") ?? undefined,
      sortOrder: searchParams.get("sortOrder") ?? undefined,
    });

    // Parse custom date range if provided
    const dateOptions = params.startDate && params.endDate
      ? {
          startDate: new Date(params.startDate),
          endDate: new Date(params.endDate),
        }
      : undefined;

    const result = await costMonitor.getAllUsersStats(params.days, {
      ...dateOptions,
      limit: params.limit,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
    });

    // Calculate summary stats
    const summary = {
      totalUsers: result.total,
      activeUsers: result.users.filter((u) => u.totalCost > 0).length,
      totalCost: result.users.reduce((sum, u) => sum + u.totalCost, 0),
      totalDeals: result.users.reduce((sum, u) => sum + u.dealCount, 0),
      totalAnalyses: result.users.reduce((sum, u) => sum + u.analysisCount, 0),
      totalApiCalls: result.users.reduce((sum, u) => sum + u.apiCallCount, 0),
      totalBoardSessions: result.users.reduce((sum, u) => sum + u.boardSessionCount, 0),
    };

    return NextResponse.json({
      data: {
        users: result.users,
        total: result.total,
        summary,
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

    console.error("Error fetching user costs:", error);
    return NextResponse.json(
      { error: "Failed to fetch user cost data" },
      { status: 500 }
    );
  }
}
