/**
 * GET /api/deals/[dealId]/thesis
 *
 * Retourne la these courante (version latest) du deal + historique versions.
 * Auth + ownership check obligatoires.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidCuid } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";
import { thesisService } from "@/services/thesis";

type RouteContext = {
  params: Promise<{ dealId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { dealId } = await context.params;

    if (!isValidCuid(dealId)) {
      return NextResponse.json({ error: "Invalid deal ID format" }, { status: 400 });
    }

    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: user.id },
      select: { id: true },
    });
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const [latest, history] = await Promise.all([
      thesisService.getLatest(dealId),
      thesisService.getHistory(dealId),
    ]);

    if (!latest) {
      return NextResponse.json({
        data: {
          thesis: null,
          history: [],
          hasPendingDecision: false,
        },
      });
    }

    const hasPendingDecision = latest.decision === null;

    return NextResponse.json({
      data: {
        thesis: latest,
        history: history.map((h) => ({
          id: h.id,
          version: h.version,
          isLatest: h.isLatest,
          verdict: h.verdict,
          confidence: h.confidence,
          createdAt: h.createdAt,
          decision: h.decision,
        })),
        hasPendingDecision,
      },
    });
  } catch (error) {
    return handleApiError(error, "get thesis");
  }
}
