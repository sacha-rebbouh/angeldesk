import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/sanitize";
import { DealStage, FundingInstrument } from "@prisma/client";
import { handleApiError } from "@/lib/api-error";
import {
  getCurrentFactNumber,
  getCurrentFactString,
  loadCanonicalDealSignals,
  resolveCanonicalAnalysisScores,
} from "@/services/deals/canonical-read-model";

const createDealSchema = z.object({
  name: z.string().min(1, "Name is required"),
  companyName: z.string().optional(),
  website: z.string().url().optional().or(z.literal("")),
  description: z.string().optional(),
  sector: z.string().optional(),
  stage: z.nativeEnum(DealStage).optional(),
  instrument: z.nativeEnum(FundingInstrument).optional(),
  geography: z.string().optional(),
  arr: z.number().positive().optional(),
  growthRate: z.number().optional(),
  amountRequested: z.number().positive().optional(),
  valuationPre: z.number().positive().optional(),
});

// GET /api/deals - List all deals for the current user (with pagination)
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();

    // Rate limiting: max 60 requests per minute
    const rateLimit = checkRateLimit(`deals-get:${user.id}`, { maxRequests: 60, windowMs: 60000 });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfter: rateLimit.resetIn },
        { status: 429, headers: { "Retry-After": String(rateLimit.resetIn) } }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const stage = searchParams.get("stage");
    // Pagination params (optional - defaults to all deals for backward compatibility)
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100); // Max 100 per page
    const skip = (page - 1) * limit;

    const where = {
      userId: user.id,
      ...(status && { status: status as never }),
      ...(stage && { stage: stage as never }),
    };

    // Execute count and findMany in parallel for efficiency
    const [total, deals] = await Promise.all([
      prisma.deal.count({ where }),
      prisma.deal.findMany({
        where,
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
            select: {
              id: true,
              name: true,
              type: true,
              processingStatus: true,
            },
          },
          redFlags: {
            where: { status: "OPEN" },
            select: {
              id: true,
              severity: true,
            },
          },
          _count: {
            select: {
              analyses: true,
            },
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
        skip,
        take: limit,
      }),
    ]);

    const signals = await loadCanonicalDealSignals(deals.map((deal) => deal.id));

    const canonicalDeals = deals.map((deal) => {
      const factMap = signals.factMapByDealId.get(deal.id) ?? new Map();
      const scores = resolveCanonicalAnalysisScores(deal.id, signals, {
        globalScore: deal.globalScore,
        teamScore: deal.teamScore,
        marketScore: deal.marketScore,
        productScore: deal.productScore,
        financialsScore: deal.financialsScore,
      });

      return {
        ...deal,
        companyName:
          getCurrentFactString(factMap, "company.name") ?? deal.companyName,
        website: getCurrentFactString(factMap, "other.website") ?? deal.website,
        arr:
          getCurrentFactNumber(factMap, "financial.arr") ??
          (deal.arr != null ? Number(deal.arr) : null),
        growthRate:
          getCurrentFactNumber(factMap, "financial.revenue_growth_yoy") ??
          (deal.growthRate != null ? Number(deal.growthRate) : null),
        amountRequested:
          getCurrentFactNumber(factMap, "financial.amount_raising") ??
          (deal.amountRequested != null ? Number(deal.amountRequested) : null),
        valuationPre:
          getCurrentFactNumber(factMap, "financial.valuation_pre") ??
          (deal.valuationPre != null ? Number(deal.valuationPre) : null),
        globalScore: scores.globalScore,
        teamScore: scores.teamScore,
        marketScore: scores.marketScore,
        productScore: scores.productScore,
        financialsScore: scores.financialsScore,
      };
    });

    return NextResponse.json({
      data: canonicalDeals,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + deals.length < total,
      },
    });
  } catch (error) {
    return handleApiError(error, "fetch deals");
  }
}

// POST /api/deals - Create a new deal
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();

    // Rate limiting: max 20 deal creations per minute
    const rateLimit = checkRateLimit(`deals-post:${user.id}`, { maxRequests: 20, windowMs: 60000 });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfter: rateLimit.resetIn },
        { status: 429, headers: { "Retry-After": String(rateLimit.resetIn) } }
      );
    }

    const body = await request.json();

    const validatedData = createDealSchema.parse(body);

    const deal = await prisma.deal.create({
      data: {
        ...validatedData,
        website: validatedData.website || null,
        userId: user.id,
      },
      include: {
        founders: {
          select: { id: true, name: true, role: true, linkedinUrl: true },
        },
        documents: {
          select: { id: true, name: true, type: true, processingStatus: true },
        },
      },
    });

    return NextResponse.json({ data: deal }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create deal");
  }
}
