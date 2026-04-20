import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { isValidCuid } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";
import {
  loadCanonicalDealSignals,
  resolveCanonicalDealFields,
} from "@/services/deals/canonical-read-model";
import {
  buildDealUpdateData,
  buildManualFactOverrides,
  persistManualFactOverrides,
  updateDealSchema,
} from "@/services/deals/manual-fact-overrides";
import { refreshCurrentFactsView } from "@/services/fact-store/current-facts";

type RouteContext = {
  params: Promise<{ dealId: string }>;
};

function normalizeDealDetail(deal: {
  id: string;
  companyName: string | null;
  website: string | null;
  amountRequested: unknown;
  arr: unknown;
  growthRate: unknown;
  valuationPre: unknown;
  sector: string | null;
  stage: string | null;
  instrument: string | null;
  geography: string | null;
  description: string | null;
  globalScore: number | null;
  teamScore: number | null;
  marketScore: number | null;
  productScore: number | null;
  financialsScore: number | null;
}) {
  return loadCanonicalDealSignals([deal.id]).then((signals) => ({
    ...deal,
    ...resolveCanonicalDealFields(deal.id, signals, {
      companyName: deal.companyName,
      website: deal.website,
      amountRequested:
        deal.amountRequested != null ? Number(deal.amountRequested) : null,
      arr: deal.arr != null ? Number(deal.arr) : null,
      growthRate: deal.growthRate != null ? Number(deal.growthRate) : null,
      valuationPre: deal.valuationPre != null ? Number(deal.valuationPre) : null,
      sector: deal.sector,
      stage: deal.stage,
      instrument: deal.instrument,
      geography: deal.geography,
      description: deal.description,
      globalScore: deal.globalScore,
      teamScore: deal.teamScore,
      marketScore: deal.marketScore,
      productScore: deal.productScore,
      financialsScore: deal.financialsScore,
    }),
  }));
}

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

    return NextResponse.json({ data: await normalizeDealDetail(deal) });
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
    const presentKeys = new Set(Object.keys(body));

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
    const manualFactOverrides = buildManualFactOverrides(validatedData, presentKeys);

    const deal = await prisma.$transaction(async (tx) => {
      const updatedDeal = await tx.deal.update({
        where: { id: dealId },
        data: buildDealUpdateData(validatedData, presentKeys),
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

      await persistManualFactOverrides(tx, dealId, manualFactOverrides);

      return updatedDeal;
    });

    if (manualFactOverrides.length > 0) {
      await refreshCurrentFactsView();
    }

    return NextResponse.json({ data: await normalizeDealDetail(deal) });
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
