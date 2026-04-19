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
import { logger } from "@/lib/logger";

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
        results: true,
        startedAt: true,
        completedAt: true,
        totalCost: true,
        createdAt: true,
      },
    });

    timer.success(200, { count: analyses.length });
    return apiSuccess(
      analyses.map((a) => ({
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

    // Check for running analysis
    const running = await prisma.analysis.findFirst({
      where: {
        dealId,
        status: { in: ["PENDING", "RUNNING"] },
      },
    });
    if (running) {
      timer.error(409, "Analysis already running");
      return apiError(
        "ANALYSIS_IN_PROGRESS",
        "An analysis is already running for this deal",
        409
      );
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

    const deduction = await recordDealAnalysis(ctx.userId, 3, dealId, "full_analysis");
    if (!deduction.success) {
      timer.error(403, "Insufficient credits");
      return apiError("INSUFFICIENT_CREDITS", "Insufficient credits for this analysis.", 403);
    }

    await prisma.deal.update({
      where: { id: dealId },
      data: { status: "ANALYZING" },
    });

    // Trigger thesis-first Deep Dive via the same worker contract as /api/analyze
    try {
      const { inngest } = await import("@/lib/inngest");
      await inngest.send({
        name: "analysis/deal.analyze",
        data: {
          dealId,
          type: "full_analysis",
          enableTrace: true,
          userPlan: "PRO",
          userId: ctx.userId,
        },
      });
    } catch (sendErr) {
      try {
        const creditAction = getActionForAnalysisType("full_analysis");
        await refundCredits(ctx.userId, creditAction, dealId);
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
    timer.error(500, error instanceof Error ? error.message : "Unknown");
    return handleApiError(error, "launch analysis (v1)");
  }
}
