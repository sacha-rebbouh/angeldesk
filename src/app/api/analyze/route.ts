import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { orchestrator, type AnalysisType } from "@/agents";
import {
  canAnalyzeDeal,
  recordDealAnalysis,
  getUsageStatus,
  type AnalysisTier,
  type SubscriptionTier,
} from "@/services/deal-limits";

const analyzeSchema = z.object({
  dealId: z.string().min(1, "Deal ID is required"),
  type: z.enum([
    "screening",
    "extraction",
    "full_dd",
    "tier1_complete",
    "tier2_sector",
    "tier3_synthesis",
    "full_analysis"
  ]).default("screening"),
  // Legacy: useReAct is deprecated, traces are now always enabled on Standard agents
  useReAct: z.boolean().optional(),
  enableTrace: z.boolean().default(true),
  // New: stream mode returns immediately with analysisId
  stream: z.boolean().default(true),
});

// Map analysis types to tiers
function getAnalysisTier(type: string): AnalysisTier {
  switch (type) {
    case "screening":
    case "extraction":
    case "tier1_complete":
      return 1;
    case "tier2_sector":
    case "full_dd":
      return 2;
    case "tier3_synthesis":
    case "full_analysis":
      return 3;
    default:
      return 1;
  }
}

// POST /api/analyze - Start an analysis
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();

    const { dealId, type, enableTrace } = analyzeSchema.parse(body);

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

    // Check tier and limits
    const requestedTier = getAnalysisTier(type);
    const permission = await canAnalyzeDeal(user.id, requestedTier);

    if (!permission.allowed) {
      return NextResponse.json(
        {
          error: permission.reason,
          upgradeRequired: permission.upgradeRequired,
          maxAllowedTier: permission.maxAllowedTier,
        },
        { status: 403 }
      );
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

    // Record the analysis usage (consumes from limit for FREE users)
    const usageResult = await recordDealAnalysis(user.id, requestedTier);

    if (!usageResult.success) {
      return NextResponse.json(
        {
          error: "Limite mensuelle atteinte",
          upgradeRequired: true,
          remainingDeals: 0,
        },
        { status: 403 }
      );
    }

    // Update deal status
    await prisma.deal.update({
      where: { id: dealId },
      data: { status: "ANALYZING" },
    });

    // Get user subscription status for tier gating
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: { subscriptionStatus: true },
    });
    const userPlan = (userData?.subscriptionStatus as SubscriptionTier) || "FREE";

    // Run the analysis (Standard agents with traces enabled)
    const result = await orchestrator.runAnalysis({
      dealId,
      type: type as AnalysisType,
      useReAct: false, // Always use Standard agents (better results, lower cost)
      enableTrace,
      userPlan: userPlan === "PRO" || userPlan === "ENTERPRISE" ? "PRO" : "FREE",
    });

    return NextResponse.json({
      data: {
        sessionId: result.sessionId,
        success: result.success,
        summary: result.summary,
        totalCost: result.totalCost,
        totalTimeMs: result.totalTimeMs,
        results: result.results,
        earlyWarnings: result.earlyWarnings,
        hasCriticalWarnings: result.hasCriticalWarnings,
        tiersExecuted: result.tiersExecuted,
        remainingDeals: usageResult.remainingDeals,
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

// GET /api/analyze - Get analysis types and usage status
export async function GET() {
  try {
    const user = await requireAuth();

    const [types, usageStatus] = await Promise.all([
      Promise.resolve(orchestrator.getAnalysisTypes()),
      getUsageStatus(user.id),
    ]);

    return NextResponse.json({
      data: types,
      usage: {
        canAnalyze: usageStatus.canAnalyze,
        monthlyLimit: usageStatus.monthlyLimit,
        usedThisMonth: usageStatus.usedThisMonth,
        remainingDeals: usageStatus.remainingDeals,
        maxTier: usageStatus.maxTier,
        subscriptionStatus: usageStatus.subscriptionStatus,
        isUnlimited: usageStatus.isUnlimited,
        nextResetDate: usageStatus.nextResetDate.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error fetching analysis types:", error);
    return NextResponse.json(
      { error: "Failed to fetch analysis types" },
      { status: 500 }
    );
  }
}
