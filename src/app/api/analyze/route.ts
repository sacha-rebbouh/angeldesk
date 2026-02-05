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
import { checkRateLimit } from "@/lib/sanitize";

// CUID validation pattern
const CUID_PATTERN = /^c[a-z0-9]{20,30}$/;

const analyzeSchema = z.object({
  dealId: z.string().min(1, "Deal ID is required").regex(CUID_PATTERN, "Invalid deal ID format"),
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

    // Rate limiting: 5 analyses per minute per user (analyses are expensive)
    const rateLimit = checkRateLimit(`analyze:${user.id}`, {
      maxRequests: 5,
      windowMs: 60000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.resetIn) },
        }
      );
    }

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
      // Auto-expire stuck analyses older than 30 minutes
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
      if (runningAnalysis.createdAt < thirtyMinAgo) {
        await prisma.analysis.update({
          where: { id: runningAnalysis.id },
          data: { status: "FAILED" },
        });
        if (process.env.NODE_ENV === "development") {
          console.warn(`[analyze] Auto-expired stuck analysis ${runningAnalysis.id} (created ${runningAnalysis.createdAt.toISOString()})`);
        }
      } else {
        return NextResponse.json(
          { error: "An analysis is already running for this deal" },
          { status: 409 }
        );
      }
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
    const effectivePlan = userPlan === "PRO" || userPlan === "ENTERPRISE" ? "PRO" : "FREE";

    // Override analysis type based on server-side subscription status
    // Never trust the frontend type — it can be stale if usage query hasn't resolved yet
    const effectiveType: AnalysisType = effectivePlan === "PRO" ? "full_analysis" : "tier1_complete";

    // Fire-and-forget: start analysis in background, return immediately
    // The orchestrator handles its own persistence (createAnalysis → completeAnalysis)
    orchestrator
      .runAnalysis({
        dealId,
        type: effectiveType,
        useReAct: false, // Always use Standard agents (better results, lower cost)
        enableTrace,
        userPlan: effectivePlan,
      })
      .then((result) => {
        if (process.env.NODE_ENV === "development") {
          console.log(
            `[analyze] Background analysis completed for deal ${dealId}: success=${result.success}, time=${result.totalTimeMs}ms`
          );
        }
      })
      .catch(async (error) => {
        console.error(
          `[analyze] Background analysis failed for deal ${dealId}:`,
          error
        );
        // Reset deal status if analysis failed at a very early stage
        try {
          await prisma.deal.update({
            where: { id: dealId },
            data: { status: "IN_DD" },
          });
        } catch (e) {
          console.error(`[analyze] Failed to reset deal status:`, e);
        }
      });

    return NextResponse.json({
      data: {
        status: "RUNNING",
        dealId,
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

    if (process.env.NODE_ENV === "development") {
      console.error("Error running analysis:", error);
    }
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
    if (process.env.NODE_ENV === "development") {
      console.error("Error fetching analysis types:", error);
    }
    return NextResponse.json(
      { error: "Failed to fetch analysis types" },
      { status: 500 }
    );
  }
}
