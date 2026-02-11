import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { isValidCuid } from "@/lib/sanitize";
import { DealStage, DealStatus } from "@prisma/client";
import { handleApiError } from "@/lib/api-error";

const updateDealSchema = z.object({
  name: z.string().min(1).optional(),
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
  status: z.nativeEnum(DealStatus).optional(),
});

type RouteContext = {
  params: Promise<{ dealId: string }>;
};

// GET /api/deals/[dealId] - Get a specific deal
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { dealId } = await context.params;

    // Validate dealId format (CUID)
    if (!isValidCuid(dealId)) {
      return NextResponse.json(
        { error: "Invalid deal ID format" },
        { status: 400 }
      );
    }

    const deal = await prisma.deal.findFirst({
      where: {
        id: dealId,
        userId: user.id,
      },
      include: {
        founders: {
          select: {
            id: true,
            name: true,
            role: true,
            linkedinUrl: true,
            previousVentures: true,
            verifiedInfo: true,
            createdAt: true,
          },
        },
        documents: {
          select: {
            id: true,
            name: true,
            type: true,
            customType: true,
            comments: true,
            storageUrl: true,
            mimeType: true,
            sizeBytes: true,
            processingStatus: true,
            extractionQuality: true,
            requiresOCR: true,
            ocrProcessed: true,
          },
        },
        redFlags: {
          orderBy: [{ severity: "asc" }, { detectedAt: "desc" }],
        },
        analyses: {
          select: {
            id: true,
            type: true,
            mode: true,
            status: true,
            completedAgents: true,
            totalAgents: true,
            summary: true,
            totalCost: true,
            createdAt: true,
            completedAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    return NextResponse.json({ data: deal });
  } catch (error) {
    return handleApiError(error, "fetch deal");
  }
}

// PATCH /api/deals/[dealId] - Update a deal
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { dealId } = await context.params;

    // Validate dealId format (CUID)
    if (!isValidCuid(dealId)) {
      return NextResponse.json(
        { error: "Invalid deal ID format" },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Verify ownership
    const existingDeal = await prisma.deal.findFirst({
      where: {
        id: dealId,
        userId: user.id,
      },
    });

    if (!existingDeal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const validatedData = updateDealSchema.parse(body);

    const deal = await prisma.deal.update({
      where: { id: dealId },
      data: {
        ...validatedData,
        website: validatedData.website || null,
      },
      include: {
        founders: {
          select: {
            id: true,
            name: true,
            role: true,
            linkedinUrl: true,
            previousVentures: true,
            verifiedInfo: true,
            createdAt: true,
          },
        },
        documents: {
          select: {
            id: true,
            name: true,
            type: true,
            customType: true,
            comments: true,
            storageUrl: true,
            mimeType: true,
            sizeBytes: true,
            processingStatus: true,
            extractionQuality: true,
            requiresOCR: true,
            ocrProcessed: true,
          },
        },
        redFlags: true,
        analyses: {
          select: {
            id: true,
            type: true,
            mode: true,
            status: true,
            completedAgents: true,
            totalAgents: true,
            summary: true,
            totalCost: true,
            createdAt: true,
            completedAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    return NextResponse.json({ data: deal });
  } catch (error) {
    return handleApiError(error, "update deal");
  }
}

// DELETE /api/deals/[dealId] - Delete a deal
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { dealId } = await context.params;

    // Validate dealId format (CUID)
    if (!isValidCuid(dealId)) {
      return NextResponse.json(
        { error: "Invalid deal ID format" },
        { status: 400 }
      );
    }

    // Verify ownership
    const existingDeal = await prisma.deal.findFirst({
      where: {
        id: dealId,
        userId: user.id,
      },
    });

    if (!existingDeal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    await prisma.deal.delete({
      where: { id: dealId },
    });

    return NextResponse.json({ message: "Deal deleted successfully" });
  } catch (error) {
    return handleApiError(error, "delete deal");
  }
}
