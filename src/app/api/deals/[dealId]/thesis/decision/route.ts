/**
 * POST /api/deals/[dealId]/thesis/decision
 *
 * Enregistre la decision du BA apres verdict thesis (stop | continue | contest).
 * Met a jour la these courante + Analysis.thesisDecision + thesisBypass.
 *
 * Si decision = "stop" : refund partiel (2 credits) pour conserver la valeur
 * du thesis-only deja delivree.
 * Si decision = "continue" : marque thesisBypass=true si verdict fragile
 * (alert_dominant / vigilance), sinon bypass reste false.
 * Si decision = "contest" : le BA doit ensuite appeler /rebuttal endpoint avec
 * rebuttalText. On marque juste decision=contest ici.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidCuid } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";
import { thesisService } from "@/services/thesis";
import { refundCreditAmount } from "@/services/credits";
import { inngest } from "@/lib/inngest";

type RouteContext = {
  params: Promise<{ dealId: string }>;
};

const decisionSchema = z.object({
  decision: z.enum(["stop", "continue", "contest"]),
  rebuttalText: z.string().max(4000).optional(),
});

const STOP_PARTIAL_REFUND_CREDITS = 2;

export async function POST(request: Request, context: RouteContext) {
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

    const body = await request.json();
    const parsed = decisionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid decision payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { decision, rebuttalText } = parsed.data;

    const latest = await thesisService.getLatest(dealId);
    if (!latest) {
      return NextResponse.json({ error: "No thesis found for this deal" }, { status: 404 });
    }

    if (latest.decision) {
      return NextResponse.json(
        { error: "Decision already recorded", existing: latest.decision },
        { status: 409 }
      );
    }

    if (decision === "contest" && !rebuttalText?.trim()) {
      return NextResponse.json(
        { error: "rebuttalText requis pour 'contest'" },
        { status: 400 }
      );
    }

    if (decision === "contest") {
      const reached = await thesisService.hasReachedRebuttalCap(dealId);
      if (reached) {
        return NextResponse.json(
          { error: "Limite de rebuttals atteinte pour ce deal (3 max)" },
          { status: 429 }
        );
      }
    }

    const updated = await thesisService.recordDecision({
      thesisId: latest.id,
      decision,
      rebuttalText,
    });

    const fragileVerdicts = new Set(["alert_dominant", "vigilance"]);
    const thesisBypass = decision === "continue" && fragileVerdicts.has(latest.verdict);
    await prisma.analysis.updateMany({
      where: { dealId, thesisId: latest.id },
      data: {
        thesisDecision: decision,
        thesisDecisionAt: new Date(),
        thesisBypass,
      },
    });

    // Trouver l'analyse paused correspondante (RUNNING avec thesisId) — la decision
    // va debloquer le step.waitForEvent dans Inngest pour lancer Tier 1/2/3 ou stopper.
    const pausedAnalysis = await prisma.analysis.findFirst({
      where: { dealId, thesisId: latest.id, status: "RUNNING" },
      select: { id: true },
    });

    // Emit l'evenement Inngest pour debloquer le pipeline paused (si applicable).
    // Si aucune analyse RUNNING matching, l'event est absorbe sans effet (predicate if: false).
    try {
      await inngest.send({
        name: "analysis/thesis.decision",
        data: {
          analysisId: pausedAnalysis?.id ?? null,
          dealId,
          thesisId: latest.id,
          decision,
          thesisBypass,
        },
      });
    } catch (err) {
      console.warn("[API:thesis/decision] Failed to emit Inngest event:", err);
    }

    // Refund partiel sur "stop" : uniquement pour les analyses deja COMPLETED (legacy/non-paused).
    // Pour les analyses RUNNING (paused), Inngest phase3 gere le refund partiel (3cr sur 5).
    let refundApplied = 0;
    if (decision === "stop" && !pausedAnalysis) {
      const refund = await refundCreditAmount(
        user.id,
        "DEEP_DIVE",
        STOP_PARTIAL_REFUND_CREDITS,
        {
          dealId,
          idempotencyKey: `thesis:stop-refund:${latest.id}`,
          description: `Thesis stop decision — refund ${STOP_PARTIAL_REFUND_CREDITS}cr (deal ${dealId})`,
        }
      );
      if (refund.success) refundApplied = STOP_PARTIAL_REFUND_CREDITS;
    }

    return NextResponse.json({
      data: {
        decision,
        thesisBypass,
        refundedCredits: refundApplied,
        rebuttalSubmitted: decision === "contest",
        thesis: {
          id: updated.id,
          verdict: updated.verdict,
          confidence: updated.confidence,
          decision: updated.decision,
          rebuttalCount: updated.rebuttalCount,
        },
      },
    });
  } catch (error) {
    return handleApiError(error, "record thesis decision");
  }
}
