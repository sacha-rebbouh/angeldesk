/**
 * API Route: Deal Analysis Staleness Check
 *
 * GET /api/deals/[dealId]/staleness
 * Returns staleness information for the latest analysis of a deal.
 */

import { NextRequest, NextResponse } from "next/server";
import { getLatestAnalysisStaleness, getUnanalyzedDocuments } from "@/services/analysis-versioning";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  try {
    const { dealId } = await params;

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
    console.error("[API] Staleness check failed:", error);
    return NextResponse.json(
      { error: "Failed to check staleness" },
      { status: 500 }
    );
  }
}
