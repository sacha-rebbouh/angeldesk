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
import { CUID_PATTERN } from "@/lib/sanitize";

// Vercel: Allow long-running analysis. Requires Pro plan (300s max).
// Without this, the fire-and-forget promise may be killed after 10s.
export const maxDuration = 300; // 5 minutes

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

    // Rate limiting via DB: persistent across serverless instances
    const recentAnalyses = await prisma.analysis.count({
      where: {
        deal: { userId: user.id },
        createdAt: { gte: new Date(Date.now() - 60000) }, // last minute
      },
    });

    if (recentAnalyses >= 5) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": "60" } }
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

    // ================================================================
    // CHECK FOR RESUMABLE ANALYSIS (FAILED with checkpoints < 1h old)
    // If found, resume from checkpoint instead of starting fresh.
    // This saves LLM cost by not re-running already completed agents.
    // ================================================================
    // Pick the FAILED analysis with the MOST completed agents (best progress)
    const resumableAnalysis = await prisma.analysis.findFirst({
      where: {
        dealId,
        status: "FAILED",
        completedAgents: { gt: 0 },
        // Only resume recent failures (< 6 hours)
        completedAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
      },
      orderBy: { completedAgents: "desc" },
      include: {
        checkpoints: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    // Resume is possible if we have an analysis with results in DB (even without checkpoints,
    // the resume logic merges DB results with checkpoint data)
    const canResume = resumableAnalysis && (
      resumableAnalysis.checkpoints.length > 0 || resumableAnalysis.completedAgents > 0
    );

    if (canResume) {
      console.log(
        `[analyze] Found resumable analysis ${resumableAnalysis.id} ` +
        `(${resumableAnalysis.completedAgents}/${resumableAnalysis.totalAgents} agents). Resuming from checkpoint.`
      );

      // Set analysis back to RUNNING for resumeAnalysis to work
      await prisma.analysis.update({
        where: { id: resumableAnalysis.id },
        data: { status: "RUNNING", completedAt: null },
      });

      // Update deal status
      await prisma.deal.update({
        where: { id: dealId },
        data: { status: "ANALYZING" },
      });

      // Fire-and-forget: resume analysis in background
      orchestrator
        .resumeAnalysis(resumableAnalysis.id)
        .then((result) => {
          console.log(
            `[analyze] Resumed analysis completed for deal ${dealId}: success=${result.success}, time=${result.totalTimeMs}ms`
          );
        })
        .catch(async (error) => {
          console.error(
            `[analyze] Resumed analysis failed for deal ${dealId}:`,
            error
          );
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
          status: "RESUMING",
          dealId,
          resumedFrom: resumableAnalysis.id,
          completedAgents: resumableAnalysis.completedAgents,
          totalAgents: resumableAnalysis.totalAgents,
        },
      });
    }

    // ================================================================
    // NEW ANALYSIS (no resumable analysis found)
    // ================================================================

    // Atomic check: no running analysis + record usage in a single transaction
    // Prevents race conditions (double analysis, double credit consumption)
    const txResult = await prisma.$transaction(async (tx) => {
      // Check if there's already a running analysis
      const runningAnalysis = await tx.analysis.findFirst({
        where: { dealId, status: "RUNNING" },
      });

      if (runningAnalysis) {
        const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
        if (runningAnalysis.createdAt < thirtyMinAgo) {
          await tx.analysis.update({
            where: { id: runningAnalysis.id },
            data: { status: "FAILED" },
          });
        } else {
          return { error: "ALREADY_RUNNING" as const };
        }
      }

      // Record usage atomically (increment within transaction)
      const usage = await tx.userDealUsage.findUnique({ where: { userId: user.id } });
      if (usage && usage.monthlyLimit !== -1 && usage.usedThisMonth >= usage.monthlyLimit) {
        return { error: "LIMIT_REACHED" as const };
      }

      await tx.userDealUsage.upsert({
        where: { userId: user.id },
        create: { userId: user.id, monthlyLimit: 3, usedThisMonth: 1, tier1Count: requestedTier >= 1 ? 1 : 0, tier2Count: requestedTier >= 2 ? 1 : 0, tier3Count: requestedTier >= 3 ? 1 : 0 },
        update: { usedThisMonth: { increment: 1 }, tier1Count: requestedTier >= 1 ? { increment: 1 } : undefined, tier2Count: requestedTier >= 2 ? { increment: 1 } : undefined, tier3Count: requestedTier >= 3 ? { increment: 1 } : undefined },
      });

      const remaining = usage ? Math.max(0, (usage.monthlyLimit === -1 ? Infinity : usage.monthlyLimit) - usage.usedThisMonth - 1) : 2;
      return { success: true as const, remainingDeals: remaining };
    });

    if ("error" in txResult) {
      if (txResult.error === "ALREADY_RUNNING") {
        return NextResponse.json({ error: "An analysis is already running for this deal" }, { status: 409 });
      }
      return NextResponse.json({ error: "Limite mensuelle atteinte", upgradeRequired: true, remainingDeals: 0 }, { status: 403 });
    }

    const usageResult = txResult;

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
