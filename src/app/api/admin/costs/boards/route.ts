import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { costMonitor } from "@/services/cost-monitor";

const querySchema = z.object({
  days: z.coerce.number().min(1).max(365).optional().default(30),
  userId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// GET /api/admin/costs/boards - Get board sessions cost data
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const searchParams = request.nextUrl.searchParams;
    const params = querySchema.parse({
      days: searchParams.get("days") ?? undefined,
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
      : { days: params.days };

    const result = await costMonitor.getBoardSessionsCosts({
      userId: params.userId,
      ...dateOptions,
    });

    // Calculate additional stats
    const verdictBreakdown = {
      GO: 0,
      NO_GO: 0,
      NEED_MORE_INFO: 0,
      pending: 0,
    };

    let totalRounds = 0;
    let totalMembers = 0;

    for (const session of result.sessions) {
      if (session.verdict) {
        verdictBreakdown[session.verdict as keyof typeof verdictBreakdown]++;
      } else {
        verdictBreakdown.pending++;
      }
      totalRounds += session.totalRounds;
      totalMembers += session.memberCount;
    }

    const avgCostPerSession = result.totalSessions > 0
      ? result.totalCost / result.totalSessions
      : 0;

    const avgRoundsPerSession = result.totalSessions > 0
      ? totalRounds / result.totalSessions
      : 0;

    return NextResponse.json({
      data: {
        sessions: result.sessions,
        totalCost: result.totalCost,
        totalSessions: result.totalSessions,
        summary: {
          avgCostPerSession,
          avgRoundsPerSession,
          totalRounds,
          totalMembers,
          verdictBreakdown,
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

    console.error("Error fetching board costs:", error);
    return NextResponse.json(
      { error: "Failed to fetch board cost data" },
      { status: 500 }
    );
  }
}
