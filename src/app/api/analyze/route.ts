import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { orchestrator, type AnalysisType } from "@/agents";

const analyzeSchema = z.object({
  dealId: z.string().min(1, "Deal ID is required"),
  type: z.enum(["screening", "full_dd"]).default("screening"),
});

// POST /api/analyze - Start an analysis
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();

    const { dealId, type } = analyzeSchema.parse(body);

    // Verify deal ownership
    const deal = await prisma.deal.findFirst({
      where: {
        id: dealId,
        userId: user.id,
      },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    // Check if there's already a running analysis
    const runningAnalysis = await prisma.analysis.findFirst({
      where: {
        dealId,
        status: "RUNNING",
      },
    });

    if (runningAnalysis) {
      return NextResponse.json(
        { error: "An analysis is already running for this deal" },
        { status: 409 }
      );
    }

    // Update deal status
    await prisma.deal.update({
      where: { id: dealId },
      data: { status: "ANALYZING" },
    });

    // Run the analysis
    const result = await orchestrator.runAnalysis({
      dealId,
      type: type as AnalysisType,
    });

    return NextResponse.json({
      data: {
        sessionId: result.sessionId,
        success: result.success,
        summary: result.summary,
        totalCost: result.totalCost,
        totalTimeMs: result.totalTimeMs,
        results: result.results,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    console.error("Error running analysis:", error);
    return NextResponse.json(
      { error: "Failed to run analysis" },
      { status: 500 }
    );
  }
}

// GET /api/analyze - Get analysis types
export async function GET() {
  try {
    await requireAuth();

    const types = orchestrator.getAnalysisTypes();

    return NextResponse.json({ data: types });
  } catch (error) {
    console.error("Error fetching analysis types:", error);
    return NextResponse.json(
      { error: "Failed to fetch analysis types" },
      { status: 500 }
    );
  }
}
