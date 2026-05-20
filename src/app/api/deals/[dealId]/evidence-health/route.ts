/**
 * Phase 8 — Evidence Health API.
 *
 * GET /api/deals/[dealId]/evidence-health
 *
 * Returns the full EvidenceHealthReport (deal-level) and a per-document
 * pre-aggregation (`byDocument`) so the documents-tab can render badges
 * without recomputing relationships on the client.
 *
 * Phase B9.3 — also returns the user's `resolved` and `ignored` overlay
 * entries (Codex B9.2.1 follow-up). The route applies
 * `partitionBundleByResolutions` server-side so:
 *   - The bundle returned to the client is ALREADY filtered (active
 *     signals only) — the panel can't accidentally show "Marquer
 *     résolu" on a signal that's already resolved.
 *   - The badge in the documents-tab consumes the same filtered
 *     `byDocument`, so per-doc counts reflect only what's still open.
 *   - The resolved/ignored entries are returned alongside for the
 *     "Signaux traités" section.
 *
 * Scope: pure read. No mutation, no side-effect, no LLM. Just an
 * aggregation over EvidenceSignal rows already produced by the extraction
 * pipeline (Phases 1-6) + the overlay from EvidenceSignalResolution.
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
  partitionBundleByResolutions,
  type ResolvedSignalEntry,
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
    const bundle = buildEvidenceHealthBundle(docContexts);

    // Phase B9.3 — load the user's overlay rows and apply
    // partitionBundleByResolutions server-side. Two reasons:
    //   1. The UI ALWAYS sees the active bundle — no client-side
    //      filtering needed, no race window where a freshly-marked
    //      resolved signal still shows the "Marquer résolu" button.
    //   2. The badge in the documents-tab uses the SAME `byDocument`
    //      we ship here, so the active subset is consistent across
    //      surfaces (no per-surface partition duplication).
    //
    // B13 P1 — graceful fallback if the EvidenceSignalResolution
    // migration hasn't been applied to the database yet. Prisma
    // throws `P2021: The table ... does not exist` in that case;
    // without this guard the whole panel breaks (the active signals
    // can't render because the route 500s before reaching the
    // payload). During a normal deploy the migration applies before
    // the new code runs, but if the order is reversed (or a hotfix
    // ships code without `prisma migrate deploy`) we keep the panel
    // alive by treating the overlay as empty.
    let resolutionRows: Array<{
      signalKey: string;
      action: "RESOLVED" | "IGNORED";
      reason: string | null;
      userId: string;
      createdAt: Date;
      updatedAt: Date;
    }> = [];
    try {
      resolutionRows = await prisma.evidenceSignalResolution.findMany({
        where: { dealId },
        select: {
          signalKey: true,
          action: true,
          reason: true,
          userId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (resolutionError) {
      // Only swallow the specific "table does not exist" error code
      // (`P2021`). Any other DB failure (auth, network, etc.) is a
      // genuine problem and must bubble up to the 500 handler.
      const code =
        resolutionError && typeof resolutionError === "object" && "code" in resolutionError
          ? (resolutionError as { code: unknown }).code
          : undefined;
      if (code !== "P2021") {
        throw resolutionError;
      }
      // Migration pending — log once at warn level so ops sees it,
      // but render the panel with active signals only.
      console.warn(
        "[evidence-health] EvidenceSignalResolution table missing (P2021); rendering panel without overlay. Run `prisma migrate deploy`."
      );
    }
    const partitioned = partitionBundleByResolutions(bundle, resolutionRows);

    // Wire shape — kept additive to the B8 contract: `report` and
    // `byDocument` stay at the top level (filtered to active). The
    // `resolved` and `ignored` arrays are new — pre-existing
    // consumers (badges, B8 panel) ignore the extra keys.
    const payload: {
      report: typeof partitioned.active.report;
      byDocument: typeof partitioned.active.byDocument;
      resolved: ResolvedSignalEntry[];
      ignored: ResolvedSignalEntry[];
    } = {
      report: partitioned.active.report,
      byDocument: partitioned.active.byDocument,
      resolved: partitioned.resolved,
      ignored: partitioned.ignored,
    };

    return NextResponse.json({ data: payload });
  } catch (error) {
    return handleApiError(error, "load evidence health");
  }
}
