import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { costMonitor } from "@/services/cost-monitor";

const querySchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  userId: z.string().optional(),
  format: z.enum(["events", "summary"]).optional().default("summary"),
  fileFormat: z.enum(["csv", "json"]).optional().default("csv"),
});

// GET /api/admin/costs/export - Export cost data as CSV or JSON
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const searchParams = request.nextUrl.searchParams;
    const params = querySchema.parse({
      startDate: searchParams.get("startDate") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
      userId: searchParams.get("userId") ?? undefined,
      format: searchParams.get("format") ?? undefined,
      fileFormat: searchParams.get("fileFormat") ?? undefined,
    });

    const data = await costMonitor.exportCostData({
      startDate: new Date(params.startDate),
      endDate: new Date(params.endDate),
      userId: params.userId,
      format: params.format,
    });

    if (params.fileFormat === "json") {
      return NextResponse.json({ data });
    }

    // Convert to CSV
    if (data.length === 0) {
      return new NextResponse("No data to export", {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="costs-${params.format}-${params.startDate}-${params.endDate}.csv"`,
        },
      });
    }

    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(","),
      ...data.map((row) =>
        headers
          .map((h) => {
            const val = row[h];
            // Escape quotes and wrap in quotes if contains comma or quote
            if (typeof val === "string" && (val.includes(",") || val.includes('"'))) {
              return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
          })
          .join(",")
      ),
    ];

    const csv = csvRows.join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="costs-${params.format}-${params.startDate}-${params.endDate}.csv"`,
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

    console.error("Error exporting costs:", error);
    return NextResponse.json(
      { error: "Failed to export cost data" },
      { status: 500 }
    );
  }
}
