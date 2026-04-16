/**
 * POST /api/deals/[dealId]/thesis/rebuttal
 *
 * Invoque le rebuttal-judge pour evaluer un rebuttal ecrit du BA.
 * Facture 1 credit (THESIS_REBUTTAL). Si valide, regenere la these.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidCuid } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";
import { thesisService } from "@/services/thesis";
import { thesisRebuttalJudgeAgent } from "@/agents/thesis/rebuttal-judge";
import { deductCreditAmount, refundCreditAmount } from "@/services/credits";
import type { ThesisExtractorOutput } from "@/agents/thesis/types";

type RouteContext = {
  params: Promise<{ dealId: string }>;
};

const rebuttalSchema = z.object({
  rebuttalText: z.string().min(20).max(4000),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { dealId } = await context.params;

    if (!isValidCuid(dealId)) {
      return NextResponse.json({ error: "Invalid deal ID format" }, { status: 400 });
    }

    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: user.id },
      select: { id: true, name: true, sector: true, stage: true },
    });
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = rebuttalSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid rebuttal payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { rebuttalText } = parsed.data;

    const latest = await thesisService.getLatest(dealId);
    if (!latest) {
      return NextResponse.json({ error: "No thesis found for this deal" }, { status: 404 });
    }

    const reached = await thesisService.hasReachedRebuttalCap(dealId);
    if (reached) {
      return NextResponse.json(
        { error: "Limite de rebuttals atteinte pour ce deal (3 max)" },
        { status: 429 }
      );
    }

    const idempotencyKey = `thesis:rebuttal:${latest.id}:${latest.rebuttalCount}`;
    const deduction = await deductCreditAmount(user.id, "THESIS_REBUTTAL", 1, {
      dealId,
      idempotencyKey,
      description: `Thesis rebuttal judge for deal ${dealId}`,
    });
    if (!deduction.success) {
      return NextResponse.json(
        {
          error: "Credits insuffisants pour le rebuttal (1 credit requis)",
          required: 1,
        },
        { status: 402 }
      );
    }

    const originalThesis: ThesisExtractorOutput = {
      reformulated: latest.reformulated,
      problem: latest.problem,
      solution: latest.solution,
      whyNow: latest.whyNow,
      moat: latest.moat,
      pathToExit: latest.pathToExit,
      verdict: latest.verdict as ThesisExtractorOutput["verdict"],
      confidence: latest.confidence,
      loadBearing: (latest.loadBearing as ThesisExtractorOutput["loadBearing"]) ?? [],
      alerts: (latest.alerts as ThesisExtractorOutput["alerts"]) ?? [],
      ycLens: latest.ycLens as ThesisExtractorOutput["ycLens"],
      thielLens: latest.thielLens as ThesisExtractorOutput["thielLens"],
      angelDeskLens: latest.angelDeskLens as ThesisExtractorOutput["angelDeskLens"],
      sourceDocumentIds: latest.sourceDocumentIds,
      sourceHash: latest.sourceHash,
    };

    let judgeResult: Awaited<ReturnType<typeof thesisRebuttalJudgeAgent.run>>;
    try {
      judgeResult = await thesisRebuttalJudgeAgent.run({
        dealId,
        deal: { id: deal.id, name: deal.name, sector: deal.sector, stage: deal.stage },
        documents: [],
        previousResults: {},
        rebuttalInput: {
          originalThesis,
          rebuttalText,
          dealName: deal.name,
          dealSector: deal.sector ?? undefined,
          dealStage: deal.stage ?? undefined,
        },
      } as unknown as Parameters<typeof thesisRebuttalJudgeAgent.run>[0]);
    } catch (err) {
      await refundCreditAmount(user.id, "THESIS_REBUTTAL", 1, {
        dealId,
        idempotencyKey: `thesis:rebuttal-refund:${latest.id}:${latest.rebuttalCount}`,
        description: `Thesis rebuttal refund (judge crash)`,
      }).catch(() => undefined);
      throw err;
    }

    if (!judgeResult.success || !("data" in judgeResult)) {
      await refundCreditAmount(user.id, "THESIS_REBUTTAL", 1, {
        dealId,
        idempotencyKey: `thesis:rebuttal-refund:${latest.id}:${latest.rebuttalCount}`,
        description: `Thesis rebuttal refund (judge failed)`,
      }).catch(() => undefined);
      return NextResponse.json(
        { error: "Rebuttal judge failed", details: judgeResult.error },
        { status: 500 }
      );
    }

    const judgment = judgeResult.data as { verdict: "valid" | "rejected"; reasoning: string; regenerate: boolean };

    await thesisService.recordDecision({
      thesisId: latest.id,
      decision: "contest",
      rebuttalText,
    });
    await thesisService.recordRebuttalVerdict({
      thesisId: latest.id,
      verdict: judgment.verdict,
    });

    return NextResponse.json({
      data: {
        verdict: judgment.verdict,
        reasoning: judgment.reasoning,
        regenerate: judgment.regenerate,
        creditsCharged: 1,
      },
    });
  } catch (error) {
    return handleApiError(error, "thesis rebuttal");
  }
}
