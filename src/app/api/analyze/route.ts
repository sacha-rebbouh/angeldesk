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
import { refundCredits, getActionForAnalysisType, CREDIT_COSTS } from "@/services/credits";
import { CUID_PATTERN } from "@/lib/sanitize";
import { evaluateDealDocumentReadiness } from "@/services/documents/extraction-runs";
import { claimFailedAnalysisResume, reserveFullAnalysisDispatch } from "@/services/analysis/guards";
import { inngest } from "@/lib/inngest";
import { logger } from "@/lib/logger";

// Vercel: Allow long-running analysis. Requires Pro plan (300s max).
// Without this, the fire-and-forget promise may be killed after 10s.
export const maxDuration = 300; // 5 minutes

// Thesis-first (2026-04-17) — l'entree publique est desormais full_analysis.
// Les alias legacy quick_scan / tier1_complete / full_dd restent lisibles en
// historique, mais ne sont plus acceptes pour demarrer une nouvelle analyse.
const analyzeSchema = z.object({
  dealId: z.string().min(1, "Deal ID is required").regex(CUID_PATTERN, "Invalid deal ID format"),
  type: z.enum([
    "extraction", // technique, conserve
    "tier2_sector", // re-run ciblee
    "tier3_synthesis", // re-run ciblee
    "full_analysis", // Deep Dive thesis-first
  ]).default("full_analysis"),
  enableTrace: z.boolean().default(true),
  stream: z.boolean().default(true),
});

const LEGACY_TYPE_REPLACEMENTS: Record<string, string> = {
  screening: "full_analysis",
  quick_scan: "full_analysis",
  tier1_complete: "full_analysis",
  full_dd: "full_analysis",
};

// Map analysis types to tiers.
// Thesis-first : Quick Scan (tier 1) retire, Deep Dive est le tier d'entree.
function getAnalysisTier(type: string): AnalysisTier {
  switch (type) {
    case "extraction":
      return 1; // technique, pas d'analyse metier
    case "tier2_sector":
    case "tier3_synthesis":
    case "full_analysis":
      return 3;
    default:
      return 2; // defaut Deep Dive
  }
}

// POST /api/analyze - Start an analysis
export async function POST(request: NextRequest) {
  let reservedDispatchDealId: string | null = null;
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

    // Thesis-first: refuser explicitement les aliases legacy au lieu de les
    // remapper silencieusement, pour verrouiller le contrat public.
    const rawType = body && typeof body === "object" ? String((body as { type?: unknown }).type ?? "") : "";
    const replacementType = LEGACY_TYPE_REPLACEMENTS[rawType];
    if (replacementType) {
      return NextResponse.json(
        {
          error: `Legacy analysis type '${rawType}' is no longer accepted. Use type='${replacementType}' for the thesis-first Deep Dive flow.`,
          retiredType: rawType,
          replacement: replacementType,
        },
        { status: 400 }
      );
    }

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
    const latestThesis = type === "full_analysis"
      ? await prisma.thesis.findFirst({
          where: { dealId, isLatest: true },
          select: { id: true, corpusSnapshotId: true },
          orderBy: { version: "desc" },
        })
      : null;

    const resumableAnalysis = type === "full_analysis"
      ? await prisma.analysis.findFirst({
          where: {
            dealId,
            status: "FAILED",
            mode: "full_analysis",
            completedAgents: { gt: 0 },
            // Thesis-first hardening: ne reprendre que les runs alignés à la
            // thèse canonique active. Si aucune thèse n’existe encore, seuls les
            // runs sans thesisId sont éligibles.
            thesisId: latestThesis?.id ?? null,
            ...(latestThesis?.corpusSnapshotId
              ? { corpusSnapshotId: latestThesis.corpusSnapshotId }
              : {}),
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
        })
      : null;

    // Resume is possible if we have an analysis with results in DB (even without checkpoints,
    // the resume logic merges DB results with checkpoint data)
    const canResume = Boolean(
      resumableAnalysis &&
      latestThesis?.id &&
      latestThesis.corpusSnapshotId &&
      resumableAnalysis.corpusSnapshotId === latestThesis.corpusSnapshotId &&
      (resumableAnalysis.checkpoints.length > 0 || resumableAnalysis.completedAgents > 0)
    );

    const resumeCandidate = canResume ? resumableAnalysis : null;

    if (resumeCandidate) {
      logger.info(
        {
          analysisId: resumeCandidate.id,
          dealId,
          completed: resumeCandidate.completedAgents,
          total: resumeCandidate.totalAgents,
          alreadyRefunded: !!resumeCandidate.refundedAt,
        },
        "Found resumable analysis, resuming from checkpoint"
      );

      const resumeAttemptId = crypto.randomUUID();
      const resumeRefundKey = `refund:resume:${resumeCandidate.id}:${resumeAttemptId}`;
      const resumeChargeKey = `resume:${user.id}:${resumeCandidate.id}:${resumeAttemptId}`;
      const resumeAction = getActionForAnalysisType(type);
      let resumeWasRedebited = false;

      const resumeClaimed = await claimFailedAnalysisResume(resumeCandidate.id, dealId);
      if (!resumeClaimed) {
        return NextResponse.json({
          data: {
            status: "RESUMING",
            dealId,
            resumedFrom: resumeCandidate.id,
            completedAgents: resumeCandidate.completedAgents,
            totalAgents: resumeCandidate.totalAgents,
          },
        });
      }

      // P1 — Si l'analyse precedente a deja ete remboursee, elle a couvert
      // l'ancien paiement. On re-facture la reprise (le user avait reçu son refund
      // et decide de re-tenter). Sinon (pas de refund), l'analyse precedente est
      // encore consideree comme "en cours" cote credits, pas de nouvelle facturation.
      if (resumeCandidate.refundedAt) {
        const resumeDeduction = await recordDealAnalysis(user.id, requestedTier, dealId, type, {
          idempotencyKey: resumeChargeKey,
        });
        if (!resumeDeduction.success) {
          await prisma.analysis.update({
            where: { id: resumeCandidate.id },
            data: {
              status: "FAILED",
              completedAt: new Date(),
              refundedAt: resumeCandidate.refundedAt,
              refundAmount: resumeCandidate.refundAmount,
            },
          }).catch(() => undefined);
          await prisma.deal.update({
            where: { id: dealId },
            data: { status: "IN_DD" },
          }).catch(() => undefined);
          return NextResponse.json(
            { error: "Credits insuffisants pour la reprise", upgradeRequired: true, remainingDeals: 0 },
            { status: 403 }
          );
        }
        resumeWasRedebited = true;
        await prisma.analysis.update({
          where: { id: resumeCandidate.id },
          data: {
            refundedAt: null,
            refundAmount: null,
          },
        });
      }

      try {
        // Durable background via Inngest — le request handler rend la main immediatement,
        // le worker Inngest survit au-dela des 5 min de la fonction Vercel.
        await inngest.send({
          name: "analysis/deal.resume",
          data: {
            analysisId: resumeCandidate.id,
            dealId,
            userId: user.id,
            resumeRefundKey,
          },
        });
      } catch (sendErr) {
        if (resumeWasRedebited) {
          await refundCredits(user.id, resumeAction, dealId, {
            analysisId: resumeCandidate.id,
            idempotencyKey: resumeRefundKey,
          });
        }

        // Rollback: remettre l'analyse en FAILED et le deal en IN_DD
        await prisma.analysis.update({
          where: { id: resumeCandidate.id },
          data: {
            status: "FAILED",
            completedAt: new Date(),
            ...(resumeWasRedebited
              ? {
                  refundedAt: new Date(),
                  refundAmount: CREDIT_COSTS[resumeAction] ?? null,
                }
              : {}),
          },
        }).catch(() => undefined);
        await prisma.deal.update({
          where: { id: dealId },
          data: { status: "IN_DD" },
        }).catch(() => undefined);
        logger.error({ err: sendErr, dealId, analysisId: resumeCandidate.id }, "Inngest resume dispatch failed");
        return NextResponse.json(
          { error: "Failed to schedule analysis resume" },
          { status: 502 }
        );
      }

      return NextResponse.json({
        data: {
          status: "RESUMING",
          dealId,
          resumedFrom: resumeCandidate.id,
          completedAgents: resumeCandidate.completedAgents,
          totalAgents: resumeCandidate.totalAgents,
        },
      });
    }

    // ================================================================
    // NEW ANALYSIS (no resumable analysis found)
    // ================================================================

    const dispatchReservation = await reserveFullAnalysisDispatch(dealId);

    if (dispatchReservation.kind === "pending_thesis") {
      return NextResponse.json(
        {
          error: "Une revue de these est deja en attente pour ce deal. Finalisez-la avant de relancer un Deep Dive.",
          analysisId: dispatchReservation.analysisId,
          thesisId: dispatchReservation.thesisId,
        },
        { status: 409 }
      );
    }

    if (dispatchReservation.kind === "running") {
      return NextResponse.json({ error: "An analysis is already running for this deal" }, { status: 409 });
    }

    if (dispatchReservation.kind === "pending_dispatch") {
      return NextResponse.json({
        data: {
          status: "QUEUED",
          dealId,
        },
      });
    }
    reservedDispatchDealId = dealId;

    // Deduct credits for this analysis
    const analysisAttemptId = crypto.randomUUID();
    const analysisChargeKey = `dd:${dealId}:${latestThesis?.corpusSnapshotId ?? "no-snap"}:${user.id}:${analysisAttemptId}`;
    const deduction = await recordDealAnalysis(user.id, requestedTier, dealId, type, {
      idempotencyKey: analysisChargeKey,
    });
    if (!deduction.success) {
      await prisma.deal.update({
        where: { id: dealId },
        data: { status: "IN_DD" },
      }).catch(() => undefined);
      return NextResponse.json(
        { error: "Crédits insuffisants", upgradeRequired: true, remainingDeals: 0 },
        { status: 403 }
      );
    }

    // Use the requested analysis type directly — credit check already validated the tier
    const effectiveType: AnalysisType = type as AnalysisType;
    const effectivePlan = requestedTier >= 2 ? "PRO" : "FREE";
    const dispatchRefundKey = `refund:analyze-dispatch:${dealId}:${analysisAttemptId}`;
    const dispatchEventId = `analysis:deal.analyze:${dealId}:${analysisAttemptId}`;

    // Durable background via Inngest: le worker encapsule la creation d'analyse,
    // l'orchestration Tier 1/2/3 et le completeAnalysis. Le handler HTTP retourne
    // immediatement sans attendre la fin (utile pour les Deep Dive qui depassent
    // maxDuration=300s du runtime Vercel serverless).
    try {
      await inngest.send({
        id: dispatchEventId,
        name: "analysis/deal.analyze",
        data: {
          dealId,
          type: effectiveType,
          enableTrace,
          userPlan: effectivePlan,
          userId: user.id,
          dispatchRefundKey,
        },
      });
    } catch (sendErr) {
      // Rollback metier: l'event Inngest n'a pas pu etre enfile, on rembourse
      // immediatement et on reset le statut du deal.
      try {
        const creditAction = getActionForAnalysisType(type);
        await refundCredits(user.id, creditAction, dealId, {
          idempotencyKey: dispatchRefundKey,
        });
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
    if (reservedDispatchDealId) {
      await prisma.deal.update({
        where: { id: reservedDispatchDealId },
        data: { status: "IN_DD" },
      }).catch(() => undefined);
    }

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
