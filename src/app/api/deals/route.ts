import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
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

// GET /api/deals - List all deals for the current user
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const stage = searchParams.get("stage");

    const deals = await prisma.deal.findMany({
      where: {
        userId: user.id,
        ...(status && { status: status as never }),
        ...(stage && { stage: stage as never }),
      },
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
    });

    return NextResponse.json({ data: deals });
  } catch (error) {
    console.error("Error fetching deals:", error);
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

    console.error("Error creating deal:", error);
    return NextResponse.json(
      { error: "Failed to create deal" },
      { status: 500 }
    );
  }
}
