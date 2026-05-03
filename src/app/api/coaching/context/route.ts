import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { isValidCuid } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";
import { compileDealContext } from "@/lib/live/context-compiler";
import { evaluateDealCorpusReadinessSoft } from "@/services/documents/readiness-gate";

// GET /api/coaching/context?dealId=xxx — Get compiled deal context for coaching
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();

    const searchParams = request.nextUrl.searchParams;
    const dealId = searchParams.get("dealId");

    if (!dealId) {
      return NextResponse.json(
        { error: "Missing required query parameter: dealId" },
        { status: 400 }
      );
    }

    if (!isValidCuid(dealId)) {
      return NextResponse.json(
        { error: "Invalid deal ID format" },
        { status: 400 }
      );
    }

    // Verify deal exists and belongs to user
    const deal = await prisma.deal.findFirst({
      where: {
        id: dealId,
        userId: user.id,
      },
    });

    if (!deal) {
      return NextResponse.json(
        { error: "Deal not found" },
        { status: 404 }
      );
    }

    // ARC-LIGHT Phase 1 soft-gate: if the corpus is not ready, skip the
    // (toxic) enrichment and return an empty context with a flag. This is a
    // live coaching flow; blocking with 409 would disrupt the coach.
    const readiness = await evaluateDealCorpusReadinessSoft(dealId);
    if (!readiness.ready) {
      console.warn(
        "[extraction.coaching_context.skipped_enrichment]",
        JSON.stringify({ dealId, reasonCode: readiness.reasonCode })
      );
      return NextResponse.json({
        data: null,
        corpusSkipped: true,
        reasonCode: readiness.reasonCode,
      });
    }

    const context = await compileDealContext(dealId);

    return NextResponse.json({ data: context });
  } catch (error) {
    return handleApiError(error, "compile deal context");
  }
}
