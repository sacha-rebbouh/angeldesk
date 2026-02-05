import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/sanitize";
import { DealStage } from "@prisma/client";

const createDealSchema = z.object({
  name: z.string().min(1, "Name is required"),
  companyName: z.string().optional(),
  website: z.string().url().optional().or(z.literal("")),
  description: z.string().optional(),
  sector: z.string().optional(),
  stage: z.nativeEnum(DealStage).optional(),
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
          founders: true,
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

    return NextResponse.json({
      data: deals,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + deals.length < total,
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error fetching deals:", error);
    }
    return NextResponse.json(
      { error: "Failed to fetch deals" },
      { status: 500 }
    );
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
        founders: true,
        documents: true,
      },
    });

    return NextResponse.json({ data: deal }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    if (process.env.NODE_ENV === "development") {
      console.error("Error creating deal:", error);
    }
    return NextResponse.json(
      { error: "Failed to create deal" },
      { status: 500 }
    );
  }
}
