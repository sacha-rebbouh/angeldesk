/**
 * API Route: Deal Analysis Staleness Check
 *
 * GET /api/deals/[dealId]/staleness
 * Returns staleness information for the latest analysis of a deal.
 */

import { NextRequest, NextResponse } from "next/server";
import { getLatestAnalysisStaleness, getUnanalyzedDocuments } from "@/services/analysis-versioning";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidCuid } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  try {
    const user = await requireAuth();
    const { dealId } = await params;

    // Validate dealId format (CUID)
    if (!isValidCuid(dealId)) {
      return NextResponse.json(
        { error: "Invalid deal ID format" },
        { status: 400 }
      );
    }

    // Verify deal ownership (IDOR protection)
    const deal = await prisma.deal.findFirst({
      where: {
        id: dealId,
        userId: user.id,
      },
      select: { id: true },
    });

    if (!deal) {
      return NextResponse.json(
        { error: "Deal not found or access denied" },
        { status: 404 }
      );
    }

    // Get staleness info for the latest analysis
    const staleness = await getLatestAnalysisStaleness(dealId);

    if (!staleness) {
      return NextResponse.json({
        hasAnalysis: false,
        staleness: null,
        unanalyzedDocuments: [],
      });
    }

    // Get details of unanalyzed documents if any
    let unanalyzedDocuments: Array<{
      id: string;
      name: string;
      type: string;
      uploadedAt: Date;
    }> = [];

    if (staleness.isStale) {
      unanalyzedDocuments = await getUnanalyzedDocuments(dealId, staleness.analysisId);
    }

    return NextResponse.json({
      hasAnalysis: true,
      staleness: {
        isStale: staleness.isStale,
        newDocumentCount: staleness.newDocumentCount,
        message: staleness.message,
        analyzedDocumentIds: staleness.analyzedDocumentIds,
        analysisId: staleness.analysisId,
        analysisType: staleness.analysisType,
      },
      unanalyzedDocuments,
    });
  } catch (error) {
    return handleApiError(error, "check staleness");
  }
}
