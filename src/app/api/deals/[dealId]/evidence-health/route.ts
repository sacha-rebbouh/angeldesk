/**
 * Phase 8 — Evidence Health API.
 *
 * GET /api/deals/[dealId]/evidence-health
 *
 * Returns the full EvidenceHealthReport (deal-level) and a per-document
 * pre-aggregation (`byDocument`) so the documents-tab can render badges
 * without recomputing relationships on the client.
 *
 * Scope: pure read. No mutation, no side-effect, no LLM. Just an
 * aggregation over EvidenceSignal rows already produced by the extraction
 * pipeline (Phases 1-6).
 *
 * Security:
 *   - Clerk auth required (or BYPASS_AUTH in dev).
 *   - Deal ownership enforced (IDOR protection — same pattern as
 *     /api/deals/[dealId]/staleness).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { isValidCuid } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";
import {
  buildDealEvidenceContext,
  buildEvidenceHealthBundle,
  type EvidenceHealthBundle,
} from "@/services/evidence";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  // Codex round 24 P2 — auth contract: return 401 explicitly on unauth so the
  // client surfaces "session expired" cleanly instead of a generic 500.
  // `requireAuth` throws `new Error("Unauthorized")` when Clerk has no userId.
  let user: { id: string };
  try {
    user = await requireAuth();
  } catch (authError) {
    const msg = authError instanceof Error ? authError.message : "";
    if (msg === "Unauthorized" || msg === "Clerk user not found") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handleApiError(authError, "load evidence health");
  }

  try {
    const { dealId } = await params;

    if (!isValidCuid(dealId)) {
      return NextResponse.json({ error: "Invalid deal ID format" }, { status: 400 });
    }

    // IDOR protection — verify the caller owns the deal.
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: user.id },
      select: { id: true },
    });
    if (!deal) {
      return NextResponse.json(
        { error: "Deal not found or access denied" },
        { status: 404 }
      );
    }

    const docContexts = await buildDealEvidenceContext(prisma, dealId);
    const bundle: EvidenceHealthBundle = buildEvidenceHealthBundle(docContexts);

    return NextResponse.json({ data: bundle });
  } catch (error) {
    return handleApiError(error, "load evidence health");
  }
}
