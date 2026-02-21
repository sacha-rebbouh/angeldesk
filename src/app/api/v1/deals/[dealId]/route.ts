/**
 * GET /api/v1/deals/:id - Get deal detail
 * PATCH /api/v1/deals/:id - Update a deal
 * DELETE /api/v1/deals/:id - Delete a deal
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateApiRequest } from "../../middleware";
import { apiSuccess, apiError } from "@/lib/api-key-auth";
import { handleApiError } from "@/lib/api-error";
import { createApiTimer } from "@/lib/api-logger";

const cuidSchema = z.string().cuid();

interface RouteParams {
  params: Promise<{ dealId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const timer = createApiTimer("GET", "/api/v1/deals/:id");
  try {
    const ctx = await authenticateApiRequest(request);
    if (ctx instanceof Response) return ctx;
    timer.setContext(ctx.userId, ctx.keyId);

    const { dealId } = await params;
    if (!cuidSchema.safeParse(dealId).success) {
      timer.error(400, "Invalid deal ID format");
      return apiError("VALIDATION_ERROR", "Invalid deal ID format", 400);
    }

    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: ctx.userId },
      include: {
        founders: {
          select: {
            id: true,
            name: true,
            role: true,
            linkedinUrl: true,
          },
        },
        documents: {
          where: { isLatest: true },
          select: {
            id: true,
            name: true,
            type: true,
            processingStatus: true,
            extractionQuality: true,
            version: true,
            uploadedAt: true,
          },
        },
        redFlags: {
          where: { status: "OPEN" },
          select: {
            id: true,
            title: true,
            description: true,
            severity: true,
            category: true,
            confidenceScore: true,
            questionsToAsk: true,
          },
        },
      },
    });

    if (!deal) {
      timer.error(404, "Deal not found");
      return apiError("NOT_FOUND", "Deal not found", 404);
    }

    timer.success(200);
    return apiSuccess({
      ...deal,
      valuationPre: deal.valuationPre != null ? Number(deal.valuationPre) : null,
      arr: deal.arr != null ? Number(deal.arr) : null,
      amountRequested: deal.amountRequested != null ? Number(deal.amountRequested) : null,
      growthRate: deal.growthRate != null ? Number(deal.growthRate) : null,
    });
  } catch (error) {
    timer.error(500, error instanceof Error ? error.message : "Unknown");
    return handleApiError(error, "get deal (v1)");
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const timer = createApiTimer("PATCH", "/api/v1/deals/:id");
  try {
    const ctx = await authenticateApiRequest(request);
    if (ctx instanceof Response) return ctx;
    timer.setContext(ctx.userId, ctx.keyId);

    const { dealId } = await params;
    if (!cuidSchema.safeParse(dealId).success) {
      timer.error(400, "Invalid deal ID format");
      return apiError("VALIDATION_ERROR", "Invalid deal ID format", 400);
    }

    // Verify ownership
    const existing = await prisma.deal.findFirst({
      where: { id: dealId, userId: ctx.userId },
      select: { id: true },
    });
    if (!existing) {
      timer.error(404, "Deal not found");
      return apiError("NOT_FOUND", "Deal not found", 404);
    }

    const body = await request.json();
    const allowedFields = [
      "name", "companyName", "sector", "stage", "status",
      "geography", "description", "website", "arr",
      "growthRate", "amountRequested", "valuationPre",
    ];

    const data: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        data[field] = body[field];
      }
    }

    const deal = await prisma.deal.update({
      where: { id: dealId },
      data,
    });

    timer.success(200, { fields: Object.keys(data) });
    return apiSuccess({
      ...deal,
      valuationPre: deal.valuationPre != null ? Number(deal.valuationPre) : null,
      arr: deal.arr != null ? Number(deal.arr) : null,
    });
  } catch (error) {
    timer.error(500, error instanceof Error ? error.message : "Unknown");
    return handleApiError(error, "update deal (v1)");
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const timer = createApiTimer("DELETE", "/api/v1/deals/:id");
  try {
    const ctx = await authenticateApiRequest(request);
    if (ctx instanceof Response) return ctx;
    timer.setContext(ctx.userId, ctx.keyId);

    const { dealId } = await params;
    if (!cuidSchema.safeParse(dealId).success) {
      timer.error(400, "Invalid deal ID format");
      return apiError("VALIDATION_ERROR", "Invalid deal ID format", 400);
    }

    const existing = await prisma.deal.findFirst({
      where: { id: dealId, userId: ctx.userId },
      select: { id: true },
    });
    if (!existing) {
      timer.error(404, "Deal not found");
      return apiError("NOT_FOUND", "Deal not found", 404);
    }

    await prisma.deal.delete({ where: { id: dealId } });

    timer.success(200);
    return apiSuccess({ deleted: true });
  } catch (error) {
    timer.error(500, error instanceof Error ? error.message : "Unknown");
    return handleApiError(error, "delete deal (v1)");
  }
}
