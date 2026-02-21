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

interface RouteParams {
  params: Promise<{ dealId: string }>;
}

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
        status: true,
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
    const type = body.type === "quick" ? "SCREENING" : "FULL_DD";

    // Create analysis record
    const totalAgents = type === "SCREENING" ? 4 : 18;
    const analysis = await prisma.analysis.create({
      data: {
        dealId,
        type,
        status: "PENDING",
        totalAgents,
      },
      select: {
        id: true,
        type: true,
        status: true,
        createdAt: true,
      },
    });

    // Trigger analysis via Inngest (same as internal route)
    try {
      const { inngest } = await import("@/lib/inngest");
      await inngest.send({
        name: "deal/analyze",
        data: {
          dealId,
          analysisId: analysis.id,
          userId: ctx.userId,
          analysisType: type,
        },
      });
    } catch {
      // If Inngest not configured, mark as failed
      await prisma.analysis.update({
        where: { id: analysis.id },
        data: { status: "FAILED" },
      });
      timer.error(500, "Failed to trigger analysis");
      return apiError("INTERNAL_ERROR", "Failed to trigger analysis", 500);
    }

    timer.success(202, { analysisId: analysis.id, type });
    return apiSuccess(analysis, 202);
  } catch (error) {
    timer.error(500, error instanceof Error ? error.message : "Unknown");
    return handleApiError(error, "launch analysis (v1)");
  }
}
