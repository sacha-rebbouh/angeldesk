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
import {
  getCurrentFactNumber,
  getCurrentFactString,
  loadCanonicalDealSignals,
  resolveCanonicalAnalysisScores,
} from "@/services/deals/canonical-read-model";
import {
  buildDealUpdateData,
  buildManualFactOverrides,
  persistManualFactOverrides,
  updateDealSchema,
} from "@/services/deals/manual-fact-overrides";
import { refreshCurrentFactsView } from "@/services/fact-store/current-facts";

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

    const signals = await loadCanonicalDealSignals([deal.id]);
    const factMap = signals.factMapByDealId.get(deal.id) ?? new Map();
    const scores = resolveCanonicalAnalysisScores(deal.id, signals, {
      globalScore: deal.globalScore,
      teamScore: deal.teamScore,
      marketScore: deal.marketScore,
      productScore: deal.productScore,
      financialsScore: deal.financialsScore,
    });

    timer.success(200);
    return apiSuccess({
      ...deal,
      companyName:
        getCurrentFactString(factMap, "company.name") ?? deal.companyName,
      website: getCurrentFactString(factMap, "other.website") ?? deal.website,
      valuationPre:
        getCurrentFactNumber(factMap, "financial.valuation_pre") ??
        (deal.valuationPre != null ? Number(deal.valuationPre) : null),
      arr:
        getCurrentFactNumber(factMap, "financial.arr") ??
        (deal.arr != null ? Number(deal.arr) : null),
      amountRequested:
        getCurrentFactNumber(factMap, "financial.amount_raising") ??
        (deal.amountRequested != null ? Number(deal.amountRequested) : null),
      growthRate:
        getCurrentFactNumber(factMap, "financial.revenue_growth_yoy") ??
        (deal.growthRate != null ? Number(deal.growthRate) : null),
      globalScore: scores.globalScore,
      teamScore: scores.teamScore,
      marketScore: scores.marketScore,
      productScore: scores.productScore,
      financialsScore: scores.financialsScore,
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
    const parseResult = updateDealSchema.safeParse(body);
    if (!parseResult.success) {
      timer.error(400, "Validation failed");
      return apiError(
        "VALIDATION_ERROR",
        parseResult.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", "),
        400
      );
    }

    const presentKeys = new Set(Object.keys(body));
    const validatedData = parseResult.data;
    const manualFactOverrides = buildManualFactOverrides(validatedData, presentKeys);

    const deal = await prisma.$transaction(async (tx) => {
      const updatedDeal = await tx.deal.update({
        where: { id: dealId },
        data: buildDealUpdateData(validatedData, presentKeys),
      });

      await persistManualFactOverrides(
        tx,
        dealId,
        manualFactOverrides,
        "Updated from public v1 API"
      );

      return updatedDeal;
    });

    if (manualFactOverrides.length > 0) {
      await refreshCurrentFactsView();
    }

    timer.success(200, { fields: Array.from(presentKeys) });
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
