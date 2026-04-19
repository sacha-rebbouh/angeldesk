/**
 * POST /api/deals/[dealId]/thesis/decision
 *
 * Enregistre la decision du BA apres verdict thesis (stop | continue).
 * Met a jour la these courante + Analysis.thesisDecision + thesisBypass.
 *
 * Si decision = "stop" : refund partiel (3 credits) pour conserver la valeur
 * du thesis-only deja delivree.
 * Si decision = "continue" : marque thesisBypass=true si verdict fragile
 * (alert_dominant / vigilance), sinon bypass reste false.
 * Le flux contest est gere exclusivement par /thesis/rebuttal.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidCuid, checkRateLimitDistributed } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";
import { thesisService } from "@/services/thesis";
import { refundCreditAmount } from "@/services/credits";
import { inngest } from "@/lib/inngest";
import { logger } from "@/lib/logger";

type RouteContext = {
  params: Promise<{ dealId: string }>;
};

const decisionSchema = z.object({
  decision: z.enum(["stop", "continue"]),
});

// FIX (audit P0 #8) : alignement refund partiel sur stop = 3cr partout
// (modal UI, pricing banner, Inngest phase3, legacy path). 5cr Deep Dive - 2cr consommes
// (Tier0 fact-extractor + thesis-extractor + context-engine) = 3cr a rembourser.
const STOP_PARTIAL_REFUND_CREDITS = 3;

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { dealId } = await context.params;

    if (!isValidCuid(dealId)) {
      return NextResponse.json({ error: "Invalid deal ID format" }, { status: 400 });
    }

    // FIX (audit P1 #3) : rate-limit sur endpoint sensible (money-touching + event emission)
    const rateLimit = await checkRateLimitDistributed(`thesis-decision:${user.id}`, { maxRequests: 10, windowMs: 60000 });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many thesis decisions", retryAfter: rateLimit.resetIn },
        { status: 429, headers: { "Retry-After": String(rateLimit.resetIn) } }
      );
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
    const { decision } = parsed.data;

    const latest = await thesisService.getLatest(dealId);
    if (!latest) {
      return NextResponse.json({ error: "No thesis found for this deal" }, { status: 404 });
    }

    if (latest.decision === "stop" || latest.decision === "continue") {
      return NextResponse.json(
        { error: "Decision already recorded", existing: latest.decision },
        { status: 409 }
      );
    }

    if (latest.decision === "contest" && latest.rebuttalVerdict !== "rejected") {
      return NextResponse.json(
        { error: "A rebuttal is currently in progress for this thesis" },
        { status: 409 }
      );
    }

    // Trouver l'analyse paused correspondante (RUNNING avec thesisId) — la decision
    // va debloquer le step.waitForEvent dans Inngest pour lancer Tier 1/2/3 ou stopper.
    const pausedAnalyses = await prisma.analysis.findMany({
      where: { dealId, thesisId: latest.id, status: "RUNNING" },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });

    if (pausedAnalyses.length > 1) {
      logger.error(
        { dealId, thesisId: latest.id, analysisIds: pausedAnalyses.map((analysis) => analysis.id) },
        "Multiple paused analyses found for one thesis decision"
      );
      return NextResponse.json(
        { error: "Multiple paused analyses found for this thesis. Manual recovery required." },
        { status: 409 }
      );
    }

    const pausedAnalysis = pausedAnalyses[0] ?? null;
    const fragileVerdicts = new Set(["alert_dominant", "vigilance"]);
    const thesisBypass = decision === "continue" && fragileVerdicts.has(latest.verdict);
    const nextDecisionAt = new Date();

    const updated = await thesisService.recordDecision({
      thesisId: latest.id,
      decision,
    });

    if (pausedAnalysis) {
      await prisma.analysis.update({
        where: { id: pausedAnalysis.id },
        data: {
          thesisDecision: decision,
          thesisDecisionAt: nextDecisionAt,
          thesisBypass,
        },
      });
    } else {
      await prisma.analysis.updateMany({
        where: { dealId, thesisId: latest.id },
        data: {
          thesisDecision: decision,
          thesisDecisionAt: nextDecisionAt,
          thesisBypass,
        },
      });
    }

    // FIX (audit P0 #9 inngest emit) : skip emission when no paused analysis — evite
    // d'envoyer un event avec analysisId=null qui peut etre confondu par d'autres workers.
    if (pausedAnalysis) {
      try {
        await inngest.send({
          name: "analysis/thesis.decision",
          data: {
            analysisId: pausedAnalysis.id,
            dealId,
            thesisId: latest.id,
            decision,
            thesisBypass,
          },
        });
      } catch (err) {
        await Promise.allSettled([
          prisma.thesis.update({
            where: { id: latest.id },
            data: {
              decision: latest.decision,
              decisionAt: latest.decisionAt,
            },
          }),
          prisma.analysis.update({
            where: { id: pausedAnalysis.id },
            data: {
              thesisDecision: null,
              thesisDecisionAt: null,
              thesisBypass: false,
            },
          }),
        ]);
        logger.error(
          { err, dealId, thesisId: latest.id, analysisId: pausedAnalysis.id, decision },
          "Failed to emit thesis decision event; rolled back paused analysis state"
        );
        return NextResponse.json(
          { error: "Failed to dispatch thesis decision. No state change was kept." },
          { status: 502 }
        );
      }
    }

    // Refund partiel sur "stop" : uniquement pour les analyses deja COMPLETED de type Deep Dive
    // (legacy/non-paused). Pour les RUNNING (paused), Inngest phase3 gere le refund partiel.
    // FIX (audit P0 #10) : valider que l'analyse etait bien un Deep Dive (5cr) avant de rembourser
    // 3cr ; sinon on minte de la monnaie sur des deals qui n'ont jamais paye Deep Dive.
    let refundApplied = 0;
    if (decision === "stop" && !pausedAnalysis) {
      // Chercher l'analyse Deep Dive liee a cette these (mode="full_analysis", pas le champ type
      // qui est l'enum Prisma SCREENING/FULL_DD). Et pas encore remboursee.
      const completedDeepDive = await prisma.analysis.findFirst({
        where: {
          dealId,
          thesisId: latest.id,
          mode: "full_analysis",
          status: "COMPLETED",
          refundedAt: null,
        },
        select: { id: true },
        orderBy: { createdAt: "desc" },
      });

      if (completedDeepDive) {
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
        if (refund.success) {
          refundApplied = STOP_PARTIAL_REFUND_CREDITS;
          // FIX (audit P2 #18) : marquer Analysis.refundedAt pour l'audit trail
          await prisma.analysis.update({
            where: { id: completedDeepDive.id },
            data: { refundedAt: new Date(), refundAmount: STOP_PARTIAL_REFUND_CREDITS },
          }).catch((err: unknown) =>
            console.warn("[API:thesis/decision] Failed to mark refundedAt:", err)
          );
        }
      }
    }

    return NextResponse.json({
      data: {
        decision,
        thesisBypass,
        refundedCredits: refundApplied,
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
