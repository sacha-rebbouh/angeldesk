/**
 * GET /api/v1/deals - List deals
 * POST /api/v1/deals - Create a deal
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { DealStage } from "@prisma/client";
import { authenticateApiRequest } from "../middleware";
import { apiSuccess, apiError } from "@/lib/api-key-auth";
import { handleApiError } from "@/lib/api-error";
import { createApiTimer } from "@/lib/api-logger";

const createDealSchema = z.object({
  name: z.string().min(1).max(200),
  companyName: z.string().max(200).nullish(),
  sector: z.string().max(100).nullish(),
  stage: z.nativeEnum(DealStage).nullish(),
  geography: z.string().max(100).nullish(),
  description: z.string().max(5000).nullish(),
  website: z.string().url().max(500).nullish().or(z.literal("")),
  arr: z.number().min(0).nullish(),
  growthRate: z.number().nullish(),
  amountRequested: z.number().min(0).nullish(),
  valuationPre: z.number().min(0).nullish(),
});

export async function GET(request: NextRequest) {
  const timer = createApiTimer("GET", "/api/v1/deals");
  try {
    const ctx = await authenticateApiRequest(request);
    if (ctx instanceof Response) return ctx;
    timer.setContext(ctx.userId, ctx.keyId);

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const status = searchParams.get("status");
    const sector = searchParams.get("sector");

    const where: Record<string, unknown> = { userId: ctx.userId };
    if (status) where.status = status;
    if (sector) where.sector = sector;

    const [deals, total] = await Promise.all([
      prisma.deal.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          companyName: true,
          sector: true,
          stage: true,
          status: true,
          geography: true,
          globalScore: true,
          valuationPre: true,
          arr: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { documents: true, redFlags: true } },
        },
      }),
      prisma.deal.count({ where }),
    ]);

    timer.success(200, { count: deals.length, total });
    return apiSuccess({
      deals: deals.map((d) => ({
        ...d,
        valuationPre: d.valuationPre ? Number(d.valuationPre) : null,
        arr: d.arr ? Number(d.arr) : null,
        documentsCount: d._count.documents,
        redFlagsCount: d._count.redFlags,
        _count: undefined,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    timer.error(500, error instanceof Error ? error.message : "Unknown");
    return handleApiError(error, "list deals (v1)");
  }
}

export async function POST(request: NextRequest) {
  const timer = createApiTimer("POST", "/api/v1/deals");
  try {
    const ctx = await authenticateApiRequest(request);
    if (ctx instanceof Response) return ctx;
    timer.setContext(ctx.userId, ctx.keyId);

    const body = await request.json();

    const parsed = createDealSchema.safeParse(body);
    if (!parsed.success) {
      timer.error(400, "Validation failed");
      return apiError(
        "VALIDATION_ERROR",
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "),
        400
      );
    }

    const { name, companyName, sector, stage, geography, description, website, arr, growthRate, amountRequested, valuationPre } = parsed.data;

    const deal = await prisma.deal.create({
      data: {
        userId: ctx.userId,
        name,
        companyName: companyName ?? null,
        sector: sector ?? null,
        stage: stage ?? null,
        geography: geography ?? null,
        description: description ?? null,
        website: website || null,
        arr: arr ?? null,
        growthRate: growthRate ?? null,
        amountRequested: amountRequested ?? null,
        valuationPre: valuationPre ?? null,
      },
    });

    timer.success(201, { dealId: deal.id });
    return apiSuccess(
      {
        ...deal,
        valuationPre: deal.valuationPre ? Number(deal.valuationPre) : null,
        arr: deal.arr ? Number(deal.arr) : null,
        amountRequested: deal.amountRequested ? Number(deal.amountRequested) : null,
      },
      201
    );
  } catch (error) {
    timer.error(500, error instanceof Error ? error.message : "Unknown");
    return handleApiError(error, "create deal (v1)");
  }
}
