/**
 * GET /api/v1/deals/:id/red-flags - List red flags
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
  const timer = createApiTimer("GET", "/api/v1/deals/:id/red-flags");
  try {
    const ctx = await authenticateApiRequest(request);
    if (ctx instanceof Response) return ctx;
    timer.setContext(ctx.userId, ctx.keyId);

    const { dealId } = await params;

    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: ctx.userId },
      select: { id: true },
    });
    if (!deal) {
      timer.error(404, "Deal not found");
      return apiError("NOT_FOUND", "Deal not found", 404);
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status") as "OPEN" | "INVESTIGATING" | "RESOLVED" | "ACCEPTED" | null;

    const redFlags = await prisma.redFlag.findMany({
      where: {
        dealId,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      orderBy: [{ severity: "asc" }, { detectedAt: "desc" }],
      select: {
        id: true,
        title: true,
        description: true,
        severity: true,
        category: true,
        status: true,
        confidenceScore: true,
        questionsToAsk: true,
        detectedAt: true,
      },
    });

    timer.success(200, { count: redFlags.length });
    return apiSuccess(
      redFlags.map((rf) => ({
        ...rf,
        confidenceScore: rf.confidenceScore ? Number(rf.confidenceScore) : null,
      }))
    );
  } catch (error) {
    timer.error(500, error instanceof Error ? error.message : "Unknown");
    return handleApiError(error, "list red flags (v1)");
  }
}
