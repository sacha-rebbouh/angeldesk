/**
 * POST /api/admin/thesis/backfill
 *
 * Declenche la re-extraction de these pour un deal existant (admin-only).
 * Pour les deals pre-migration thesis-first qui n'ont pas encore de these persistee.
 *
 * Cost : 2 credits deduits de l'admin (pour eviter de penaliser le BA proprio du deal).
 * Idempotent par dealId : si une these latest existe deja, retourne 409.
 *
 * GET /api/admin/thesis/backfill
 *  Liste les deals sans these (candidats au backfill).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidCuid } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";
import { inngest } from "@/lib/inngest";
import { deductCreditAmount, refundCreditAmount } from "@/services/credits";
import { getRunningAnalysisForDeal, isFullAnalysisInProgress } from "@/services/analysis/guards";

const backfillSchema = z.object({
  dealId: z.string().regex(/^c[a-z0-9]{24,}$/, "Invalid CUID"),
  /** Si true, force re-extract meme si une these latest existe (override admin) */
  force: z.boolean().optional().default(false),
});

const ADMIN_BACKFILL_COST = 2;

export async function GET() {
  try {
    const admin = await requireAdmin();

    const deals = await prisma.deal.findMany({
      where: {
        theses: { none: {} },
      },
      select: {
        id: true,
        name: true,
        companyName: true,
        sector: true,
        stage: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { documents: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });

    return NextResponse.json({
      data: {
        deals: deals.map((d) => ({
          id: d.id,
          name: d.name,
          companyName: d.companyName,
          sector: d.sector,
          stage: d.stage,
          userId: d.userId,
          documentCount: d._count.documents,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        })),
        total: deals.length,
        admin: { id: admin.id },
      },
    });
  } catch (error) {
    return handleApiError(error, "list thesis backfill candidates");
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const parsed = backfillSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { dealId, force } = parsed.data;

    if (!isValidCuid(dealId)) {
      return NextResponse.json({ error: "Invalid deal ID format" }, { status: 400 });
    }

    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        theses: { where: { isLatest: true }, select: { id: true, verdict: true } },
        documents: { select: { id: true, processingStatus: true } },
      },
    });
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const runningAnalysis = await getRunningAnalysisForDeal(dealId);
    if (runningAnalysis && isFullAnalysisInProgress(runningAnalysis)) {
      return NextResponse.json(
        {
          error: "Une analyse Deep Dive est deja en cours sur ce deal. Le backfill admin est differe tant que le run n'est pas termine.",
          analysisId: runningAnalysis.id,
          thesisId: runningAnalysis.thesisId,
        },
        { status: 409 }
      );
    }

    if (deal.theses.length > 0 && !force) {
      return NextResponse.json(
        {
          error: "Thesis already exists for this deal",
          existingVerdict: deal.theses[0].verdict,
          hint: "Set force=true to re-extract",
        },
        { status: 409 }
      );
    }

    const completedDocs = deal.documents.filter((d) => d.processingStatus === "COMPLETED");
    if (completedDocs.length === 0) {
      return NextResponse.json(
        { error: "Deal has no processed documents — cannot extract thesis" },
        { status: 400 }
      );
    }

    // FIX (audit P0 #2) : idempotencyKey stable par (admin, deal, previousThesisId).
    // Avant : Date.now() = double-charge sur double-click. Maintenant un admin ne peut
    // plus payer 2x pour le meme backfill tant que la these n'a pas evolue.
    const idempotencyKey = `admin-thesis-backfill:${admin.id}:${dealId}:${deal.theses[0]?.id ?? "none"}`;

    // Facture l'admin (pas le BA proprietaire du deal)
    const creditResult = await deductCreditAmount(admin.id, "THESIS_REEXTRACT", ADMIN_BACKFILL_COST, {
      dealId,
      idempotencyKey,
      description: `Admin backfill these pour deal ${dealId} (${ADMIN_BACKFILL_COST}cr admin)`,
    });

    if (!creditResult.success) {
      return NextResponse.json(
        { error: "Credit deduction failed", details: creditResult.error },
        { status: 402 }
      );
    }

    if (creditResult.alreadyDeducted) {
      return NextResponse.json({
        data: {
          dealId,
          dealName: deal.name,
          adminId: admin.id,
          creditsDeductedFromAdmin: 0,
          previousThesisId: deal.theses[0]?.id ?? null,
          triggered: false,
          alreadyScheduled: true,
        },
      });
    }

    // FIX (audit P0 #5) : passer triggeredByAdminId pour que thesisReextractFunction
    // NE PAS re-debiter le BA (sinon admin 2cr + BA 1cr pour le meme backfill).
    try {
      await inngest.send({
        name: "analysis/thesis.reextract",
        data: {
          dealId,
          userId: deal.userId,
          triggeredByDocumentId: completedDocs[0].id,
          previousThesisId: deal.theses[0]?.id,
          triggeredByAdminId: admin.id, // flag utilise par l'Inngest handler pour skip deduct
        },
      });
    } catch (enqueueError) {
      await refundCreditAmount(admin.id, "THESIS_REEXTRACT", ADMIN_BACKFILL_COST, {
        dealId,
        idempotencyKey: `admin-thesis-backfill-refund:${admin.id}:${dealId}:${deal.theses[0]?.id ?? "none"}`,
        description: `Rollback admin backfill these pour deal ${dealId} (enqueue Inngest echoue)`,
      }).catch(() => undefined);

      console.error("[admin/thesis/backfill] Failed to enqueue thesis re-extract, admin refunded:", {
        adminId: admin.id,
        dealId,
        previousThesisId: deal.theses[0]?.id ?? null,
        error: enqueueError,
      });

      return NextResponse.json(
        {
          error: "Failed to enqueue thesis re-extraction",
          refundedAdminCredits: ADMIN_BACKFILL_COST,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      data: {
        dealId,
        dealName: deal.name,
        adminId: admin.id,
        creditsDeductedFromAdmin: ADMIN_BACKFILL_COST,
        previousThesisId: deal.theses[0]?.id ?? null,
        triggered: true,
      },
    });
  } catch (error) {
    return handleApiError(error, "admin thesis backfill");
  }
}
