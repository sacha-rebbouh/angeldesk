/**
 * POST /api/v1/deals/:id/analyses - Launch analysis
 * GET /api/v1/deals/:id/analyses - List analyses
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiRequest } from "../../../middleware";
import { apiSuccess, apiError } from "@/lib/api-key-auth";
import { handleApiError } from "@/lib/api-error";
import { createApiTimer } from "@/lib/api-logger";
import { evaluateDealDocumentReadiness } from "@/services/documents/extraction-runs";
import { recordDealAnalysis } from "@/services/deal-limits";
import { refundCredits, getActionForAnalysisType } from "@/services/credits";
import { reserveFullAnalysisDispatch } from "@/services/analysis/guards";
import { logger } from "@/lib/logger";
import { loadResults } from "@/services/analysis-results/load-results";

interface RouteParams {
  params: Promise<{ dealId: string }>;
}

const LEGACY_TYPE_REPLACEMENTS: Record<string, string> = {
  quick: "full_analysis",
  full: "full_analysis",
  screening: "full_analysis",
  quick_scan: "full_analysis",
  full_dd: "full_analysis",
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const timer = createApiTimer("GET", "/api/v1/deals/:id/analyses");
  try {
    const ctx = await authenticateApiRequest(request);
    if (ctx instanceof Response) return ctx;
    timer.setContext(ctx.userId, ctx.keyId);

    const { dealId } = await params;

    // Verify ownership
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: ctx.userId },
      select: { id: true },
    });
    if (!deal) {
      timer.error(404, "Deal not found");
      return apiError("NOT_FOUND", "Deal not found", 404);
    }

    const analyses = await prisma.analysis.findMany({
      where: { dealId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        mode: true,
        status: true,
        thesisDecision: true,
        startedAt: true,
        completedAt: true,
        totalCost: true,
        createdAt: true,
      },
    });

    const analysesWithResults = await Promise.all(
      analyses.map(async (analysis) => ({
        ...analysis,
        results: await loadResults(analysis.id),
      }))
    );

    timer.success(200, { count: analysesWithResults.length });
    return apiSuccess(
      analysesWithResults.map((a) => ({
        ...a,
        totalCost: a.totalCost != null ? Number(a.totalCost) : null,
      }))
    );
  } catch (error) {
    timer.error(500, error instanceof Error ? error.message : "Unknown");
    return handleApiError(error, "list analyses (v1)");
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const timer = createApiTimer("POST", "/api/v1/deals/:id/analyses");
  let reservedDispatchDealId: string | null = null;
  try {
    const ctx = await authenticateApiRequest(request);
    if (ctx instanceof Response) return ctx;
    timer.setContext(ctx.userId, ctx.keyId);

    const { dealId } = await params;

    // Verify ownership
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: ctx.userId },
      select: { id: true, status: true },
    });
    if (!deal) {
      timer.error(404, "Deal not found");
      return apiError("NOT_FOUND", "Deal not found", 404);
    }

    const body = await request.json().catch(() => ({}));
    const rawType = typeof body?.type === "string" ? body.type : "full_analysis";
    const replacement = LEGACY_TYPE_REPLACEMENTS[rawType];
    if (replacement) {
      timer.error(400, `Legacy analysis type ${rawType}`);
      return apiError(
        "LEGACY_ANALYSIS_TYPE",
        `Legacy analysis type '${rawType}' is no longer accepted. Use '${replacement}' for the thesis-first Deep Dive flow.`,
        400
      );
    }
    if (rawType !== "full_analysis") {
      timer.error(400, `Unsupported analysis type ${rawType}`);
      return apiError(
        "INVALID_ANALYSIS_TYPE",
        "Only type='full_analysis' is supported on the public API.",
        400
      );
    }

    const documentReadiness = await evaluateDealDocumentReadiness(dealId);
    if (!documentReadiness.ready) {
      timer.error(409, "Document extraction not ready");
      return apiError(
        "DOCUMENT_EXTRACTION_NOT_READY",
        "Document extraction is not ready for analysis.",
        409
      );
    }

    const dispatchReservation = await reserveFullAnalysisDispatch(dealId);
    if (dispatchReservation.kind === "pending_thesis") {
      timer.error(409, "Thesis review already pending");
      return apiError(
        "THESIS_REVIEW_PENDING",
        "A thesis review is already pending for this deal.",
        409
      );
    }
    if (dispatchReservation.kind === "running") {
      timer.error(409, "Analysis already running");
      return apiError(
        "ANALYSIS_IN_PROGRESS",
        "An analysis is already running for this deal",
        409
      );
    }
    if (dispatchReservation.kind === "pending_dispatch") {
      timer.success(202, { type: "full_analysis", duplicate: true });
      return apiSuccess(
        {
          status: "QUEUED",
          dealId,
          type: "full_analysis",
        },
        202
      );
    }
    reservedDispatchDealId = dealId;

    const analysisAttemptId = crypto.randomUUID();
    const analysisChargeKey = `dd:${dealId}:no-snap:${ctx.userId}:${analysisAttemptId}`;
    const deduction = await recordDealAnalysis(ctx.userId, 3, dealId, "full_analysis", {
      idempotencyKey: analysisChargeKey,
    });
    if (!deduction.success) {
      await prisma.deal.update({
        where: { id: dealId },
        data: { status: "IN_DD" },
      }).catch(() => undefined);
      timer.error(403, "Insufficient credits");
      return apiError("INSUFFICIENT_CREDITS", "Insufficient credits for this analysis.", 403);
    }

    const dispatchRefundKey = `refund:v1-analyze-dispatch:${dealId}:${analysisAttemptId}`;
    const dispatchEventId = `analysis:v1.deal.analyze:${dealId}:${analysisAttemptId}`;

    // Trigger thesis-first Deep Dive via the same worker contract as /api/analyze
    try {
      const { inngest } = await import("@/lib/inngest");
      await inngest.send({
        id: dispatchEventId,
        name: "analysis/deal.analyze",
        data: {
          dealId,
          type: "full_analysis",
          enableTrace: true,
          userPlan: "PRO",
          userId: ctx.userId,
          dispatchRefundKey,
        },
      });
    } catch (sendErr) {
      logger.error({ err: sendErr, dealId, userId: ctx.userId }, "Failed to dispatch v1 analysis");
      try {
        const creditAction = getActionForAnalysisType("full_analysis");
        await refundCredits(ctx.userId, creditAction, dealId, {
          idempotencyKey: dispatchRefundKey,
        });
      } catch (refundErr) {
        logger.error({ err: refundErr, dealId, userId: ctx.userId }, "Refund failed after v1 analysis dispatch error");
      }
      await prisma.deal.update({
        where: { id: dealId },
        data: { status: "IN_DD" },
      }).catch(() => undefined);
      timer.error(500, "Failed to trigger analysis");
      return apiError("INTERNAL_ERROR", "Failed to trigger analysis", 500);
    }

    timer.success(202, { type: "full_analysis" });
    return apiSuccess(
      {
        status: "QUEUED",
        dealId,
        type: "full_analysis",
      },
      202
    );
  } catch (error) {
    if (reservedDispatchDealId) {
      await prisma.deal.update({
        where: { id: reservedDispatchDealId },
        data: { status: "IN_DD" },
      }).catch(() => undefined);
    }
    timer.error(500, error instanceof Error ? error.message : "Unknown");
    return handleApiError(error, "launch analysis (v1)");
  }
}
