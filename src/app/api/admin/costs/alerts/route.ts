import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { costMonitor } from "@/services/cost-monitor";
import type { CostAlertType, CostAlertSeverity } from "@prisma/client";

const querySchema = z.object({
  userId: z.string().optional(),
  type: z.enum(["DEAL_THRESHOLD", "USER_DAILY", "ANALYSIS_ANOMALY", "BOARD_COST", "MONTHLY_BUDGET"]).optional(),
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]).optional(),
  acknowledged: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().min(1).max(200).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const acknowledgeSchema = z.object({
  alertId: z.string(),
});

// GET /api/admin/costs/alerts - Get cost alerts
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const searchParams = request.nextUrl.searchParams;
    const params = querySchema.parse({
      userId: searchParams.get("userId") ?? undefined,
      type: searchParams.get("type") ?? undefined,
      severity: searchParams.get("severity") ?? undefined,
      acknowledged: searchParams.get("acknowledged") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
      startDate: searchParams.get("startDate") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
    });

    const result = await costMonitor.getAllAlerts({
      userId: params.userId,
      type: params.type as CostAlertType | undefined,
      severity: params.severity as CostAlertSeverity | undefined,
      acknowledged: params.acknowledged ? params.acknowledged === "true" : undefined,
      limit: params.limit,
      offset: params.offset,
      startDate: params.startDate ? new Date(params.startDate) : undefined,
      endDate: params.endDate ? new Date(params.endDate) : undefined,
    });

    // Get summary counts
    const [activeAlerts, criticalAlerts] = await Promise.all([
      costMonitor.getActiveAlerts({ limit: 1000 }),
      costMonitor.getAllAlerts({ severity: "CRITICAL", acknowledged: false, limit: 1000 }),
    ]);

    return NextResponse.json({
      data: {
        alerts: result.alerts,
        total: result.total,
        summary: {
          activeCount: activeAlerts.length,
          criticalCount: criticalAlerts.alerts.length,
          warningCount: activeAlerts.filter((a) => a.severity === "WARNING").length,
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

    console.error("Error fetching alerts:", error);
    return NextResponse.json(
      { error: "Failed to fetch alerts" },
      { status: 500 }
    );
  }
}

// POST /api/admin/costs/alerts - Acknowledge an alert
export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin();

    const body = await request.json();
    const { alertId } = acknowledgeSchema.parse(body);

    const success = await costMonitor.acknowledgeAlert(alertId, user.id);

    if (!success) {
      return NextResponse.json(
        { error: "Alert not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
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

    console.error("Error acknowledging alert:", error);
    return NextResponse.json(
      { error: "Failed to acknowledge alert" },
      { status: 500 }
    );
  }
}
