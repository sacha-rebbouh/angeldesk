import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { orchestrator, type AnalysisType } from "@/agents";
import {
  recordDealAnalysis,
  getUsageStatus,
  type AnalysisTier,
} from "@/services/deal-limits";
import { refundCredits, getActionForAnalysisType } from "@/services/credits";
import { CUID_PATTERN } from "@/lib/sanitize";
import { evaluateDealDocumentReadiness } from "@/services/documents/extraction-runs";
import { inngest } from "@/lib/inngest";
import { logger } from "@/lib/logger";

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

    // P1 — Rate limiting serre: max 2 dispatch/min par user (Deep Dive = 41 agents,
    // un user n'a aucune raison legitime de lancer plus). Persistent cross-instance via DB.
    const recentAnalyses = await prisma.analysis.count({
      where: {
        deal: { userId: user.id },
        createdAt: { gte: new Date(Date.now() - 60000) }, // last minute
      },
    });

    if (recentAnalyses >= 2) {
      return NextResponse.json(
        { error: "Rate limit: maximum 2 analyses par minute" },
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

    const requestedTier = getAnalysisTier(type);
    const documentReadiness = await evaluateDealDocumentReadiness(dealId);
    if (!documentReadiness.ready) {
      return NextResponse.json(
        {
          error: "Document extraction is not ready for analysis",
          documentReadiness,
        },
        { status: 409 }
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
      logger.info(
        {
          analysisId: resumableAnalysis.id,
          dealId,
          completed: resumableAnalysis.completedAgents,
          total: resumableAnalysis.totalAgents,
          alreadyRefunded: !!resumableAnalysis.refundedAt,
        },
        "Found resumable analysis, resuming from checkpoint"
      );

      // P1 — Si l'analyse precedente a deja ete remboursee, elle a couvert
      // l'ancien paiement. On re-facture la reprise (le user avait reçu son refund
      // et decide de re-tenter). Sinon (pas de refund), l'analyse precedente est
      // encore consideree comme "en cours" cote credits, pas de nouvelle facturation.
      if (resumableAnalysis.refundedAt) {
        const resumeDeduction = await recordDealAnalysis(user.id, requestedTier, dealId, type);
        if (!resumeDeduction.success) {
          return NextResponse.json(
            { error: "Credits insuffisants pour la reprise", upgradeRequired: true, remainingDeals: 0 },
            { status: 403 }
          );
        }
      }

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

      // Durable background via Inngest — le request handler rend la main immediatement,
      // le worker Inngest survit au-dela des 5 min de la fonction Vercel.
      try {
        await inngest.send({
          name: "analysis/deal.resume",
          data: {
            analysisId: resumableAnalysis.id,
            dealId,
            userId: user.id,
          },
        });
      } catch (sendErr) {
        // Rollback: remettre l'analyse en FAILED et le deal en IN_DD
        await prisma.analysis.update({
          where: { id: resumableAnalysis.id },
          data: { status: "FAILED", completedAt: new Date() },
        }).catch(() => undefined);
        await prisma.deal.update({
          where: { id: dealId },
          data: { status: "IN_DD" },
        }).catch(() => undefined);
        logger.error({ err: sendErr, dealId, analysisId: resumableAnalysis.id }, "Inngest resume dispatch failed");
        return NextResponse.json(
          { error: "Failed to schedule analysis resume" },
          { status: 502 }
        );
      }

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

    // Check for already running analysis
    const runningAnalysis = await prisma.analysis.findFirst({
      where: { dealId, status: "RUNNING" },
    });

    if (runningAnalysis) {
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
      if (runningAnalysis.createdAt < thirtyMinAgo) {
        await prisma.analysis.update({
          where: { id: runningAnalysis.id },
          data: { status: "FAILED" },
        });
      } else {
        return NextResponse.json({ error: "An analysis is already running for this deal" }, { status: 409 });
      }
    }

    // Deduct credits for this analysis
    const deduction = await recordDealAnalysis(user.id, requestedTier, dealId, type);
    if (!deduction.success) {
      return NextResponse.json(
        { error: "Crédits insuffisants", upgradeRequired: true, remainingDeals: 0 },
        { status: 403 }
      );
    }

    // Update deal status
    await prisma.deal.update({
      where: { id: dealId },
      data: { status: "ANALYZING" },
    });

    // Use the requested analysis type directly — credit check already validated the tier
    const effectiveType: AnalysisType = type as AnalysisType;
    const effectivePlan = requestedTier >= 2 ? "PRO" : "FREE";

    // Durable background via Inngest: le worker encapsule la creation d'analyse,
    // l'orchestration Tier 1/2/3 et le completeAnalysis. Le handler HTTP retourne
    // immediatement sans attendre la fin (utile pour les Deep Dive qui depassent
    // maxDuration=300s du runtime Vercel serverless).
    try {
      await inngest.send({
        name: "analysis/deal.analyze",
        data: {
          dealId,
          type: effectiveType,
          enableTrace,
          userPlan: effectivePlan,
          userId: user.id,
        },
      });
    } catch (sendErr) {
      // Rollback metier: l'event Inngest n'a pas pu etre enfile, on rembourse
      // immediatement et on reset le statut du deal.
      try {
        const creditAction = getActionForAnalysisType(type);
        await refundCredits(user.id, creditAction, dealId);
      } catch (refundErr) {
        logger.error({ err: refundErr, dealId, userId: user.id }, "Refund failed after Inngest dispatch error");
      }
      try {
        await prisma.deal.update({ where: { id: dealId }, data: { status: "IN_DD" } });
      } catch (resetErr) {
        logger.error({ err: resetErr, dealId }, "Deal status reset failed");
      }
      logger.error({ err: sendErr, dealId, userId: user.id }, "Inngest analyze dispatch failed");
      return NextResponse.json(
        { error: "Failed to schedule analysis" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      data: {
        status: "QUEUED",
        dealId,
        remainingDeals: deduction.remainingDeals,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    logger.error({ err: error }, "Error running analysis");
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
    logger.error({ err: error }, "Error fetching analysis types");
    return NextResponse.json(
      { error: "Failed to fetch analysis types" },
      { status: 500 }
    );
  }
}
