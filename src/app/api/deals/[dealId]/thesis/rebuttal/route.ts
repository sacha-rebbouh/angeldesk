/**
 * POST /api/deals/[dealId]/thesis/rebuttal
 *
 * Invoque le rebuttal-judge pour evaluer un rebuttal ecrit du BA.
 * Facture 1 credit (THESIS_REBUTTAL). Si valide, declenche une vraie
 * re-extraction thesis-first avec nouvelle version et nouvelle pause review.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidCuid, checkRateLimitDistributed } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";
import { thesisService } from "@/services/thesis";
import { thesisRebuttalJudgeAgent } from "@/agents/thesis/rebuttal-judge";
import { deductCreditAmount, refundCreditAmount } from "@/services/credits";
import { inngest } from "@/lib/inngest";
import { logger } from "@/lib/logger";
import { getCurrentFactsFromView } from "@/services/fact-store/current-facts";
import { getCurrentFactString } from "@/services/deals/canonical-read-model";
import type { RebuttalJudgeOutput, ThesisExtractorOutput } from "@/agents/thesis/types";
type RouteContext = {
  params: Promise<{ dealId: string }>;
};

const rebuttalSchema = z.object({
  rebuttalText: z.string().min(20).max(4000),
});

const REBUTTAL_CONFIRMATION_CHAIN = ["CLAUDE_SONNET_45", "GEMINI_PRO", "HAIKU"] as const;
const REBUTTAL_STRUCTURAL_PATTERNS = [
  /\breformulation\b/i,
  /\bth[eè]se\b/i,
  /\bprobl[eè]me\b/i,
  /\bsolution\b/i,
  /\bwhy[\s-]?now\b/i,
  /\bmoat\b/i,
  /\bpath to exit\b/i,
  /\bexit\b/i,
  /\bhypoth[eè]se\b/i,
  /\bassumption\b/i,
  /\bload[-\s]?bearing\b/i,
] as const;
const REBUTTAL_EVIDENCE_PATTERNS = [
  /\bslide\b/i,
  /\bpage\b/i,
  /\bdocument\b/i,
  /\bdeck\b/i,
  /\bfact\b/i,
  /\bpreuve\b/i,
  /\bcitation\b/i,
  /\bbenchmark\b/i,
  /\bcontrat\b/i,
  /\bcohorte\b/i,
  /\bARR\b/i,
  /\bMRR\b/i,
  /\bCAC\b/i,
  /\bLTV\b/i,
  /["“”]/,
] as const;
const REBUTTAL_VERDICT_ONLY_PATTERNS = [
  /\bverdict\b/i,
  /\brecommandation\b/i,
  /\bscore\b/i,
  /\bnote\b/i,
  /\bfavorable\b/i,
  /\bvigilance\b/i,
  /\bcontrasted\b/i,
  /\balert[_\s-]?dominant\b/i,
  /\binvestir\b/i,
  /\bcontinuer\b/i,
] as const;
const REBUTTAL_GENERIC_PATTERNS = [
  /\bc['’]est faux\b/i,
  /\bvous avez tort\b/i,
  /\btu te trompes\b/i,
  /\bje ne suis pas d['’]accord\b/i,
  /\bn['’]importe quoi\b/i,
] as const;

function getDeterministicRebuttalRejection(rebuttalText: string): string | null {
  const wordCount = rebuttalText.trim().split(/\s+/).filter(Boolean).length;
  const hasStructuralAnchor = REBUTTAL_STRUCTURAL_PATTERNS.some((pattern) => pattern.test(rebuttalText));
  const hasEvidenceAnchor = REBUTTAL_EVIDENCE_PATTERNS.some((pattern) => pattern.test(rebuttalText));
  const isVerdictOnly = REBUTTAL_VERDICT_ONLY_PATTERNS.some((pattern) => pattern.test(rebuttalText));
  const isGenericComplaint = REBUTTAL_GENERIC_PATTERNS.some((pattern) => pattern.test(rebuttalText));

  if (isVerdictOnly && !hasStructuralAnchor && !hasEvidenceAnchor) {
    return "Le rebuttal conteste surtout le verdict ou la recommandation. Il doit corriger la reformulation de la these avec un element structurel precis ou une preuve.";
  }

  if (isGenericComplaint && !hasStructuralAnchor && !hasEvidenceAnchor) {
    return "Le rebuttal est trop generique pour etre juge. Citez le champ de these conteste (problem, solution, whyNow, moat, exit, load-bearing) et la preuve qui corrige l'AI.";
  }

  if (wordCount < 8 && !hasEvidenceAnchor) {
    return "Le rebuttal est trop court pour corriger la reformulation. Ajoutez une correction precise et, idealement, une reference deck/fact/document.";
  }

  return null;
}

function buildJudgeContext(params: {
  dealId: string;
  deal: { id: string; name: string; sector?: string; stage?: string };
  originalThesis: ThesisExtractorOutput;
  rebuttalText: string;
  judgeCallOptions?: {
    fallbackChain?: readonly ("CLAUDE_SONNET_45" | "GEMINI_PRO" | "GEMINI_3_FLASH" | "HAIKU")[];
  };
}) {
  return {
    dealId: params.dealId,
    deal: params.deal,
    documents: [],
    previousResults: {},
    rebuttalInput: {
      originalThesis: params.originalThesis,
      rebuttalText: params.rebuttalText,
      dealName: params.deal.name,
      dealSector: params.deal.sector,
      dealStage: params.deal.stage,
    },
    judgeCallOptions: params.judgeCallOptions,
  } as unknown as Parameters<typeof thesisRebuttalJudgeAgent.run>[0];
}

function mergeAdjustedElements(
  primary?: RebuttalJudgeOutput["adjustedElements"],
  confirmation?: RebuttalJudgeOutput["adjustedElements"]
): RebuttalJudgeOutput["adjustedElements"] {
  const merged = {
    ...(confirmation ?? {}),
    ...(primary ?? {}),
  };

  return Object.keys(merged).length > 0 ? merged : undefined;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { dealId } = await context.params;

    if (!isValidCuid(dealId)) {
      return NextResponse.json({ error: "Invalid deal ID format" }, { status: 400 });
    }

    // FIX (audit P1 #3) : rate-limit car endpoint LLM + touches credits
    const rateLimit = await checkRateLimitDistributed(`thesis-rebuttal:${user.id}`, { maxRequests: 5, windowMs: 60000 });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many rebuttals", retryAfter: rateLimit.resetIn },
        { status: 429, headers: { "Retry-After": String(rateLimit.resetIn) } }
      );
    }

    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: user.id },
      select: { id: true, name: true, sector: true, stage: true },
    });
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const currentFacts = await getCurrentFactsFromView(dealId);
    const factMap = new Map(currentFacts.map((fact) => [fact.factKey, fact]));
    const canonicalDealName = getCurrentFactString(factMap, "company.name") ?? deal.name;
    const canonicalSector =
      getCurrentFactString(factMap, "other.sector") ??
      getCurrentFactString(factMap, "market.vertical") ??
      deal.sector ??
      undefined;
    const canonicalStage = getCurrentFactString(factMap, "product.stage") ?? deal.stage ?? undefined;

    const body = await request.json();
    const parsed = rebuttalSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid rebuttal payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const rebuttalText = parsed.data.rebuttalText.trim();

    let latest = await thesisService.getLatest(dealId);
    if (!latest) {
      return NextResponse.json({ error: "No thesis found for this deal" }, { status: 404 });
    }

    const staleRebuttalCutoff = new Date(Date.now() - 10 * 60 * 1000);
    if (
      latest.decision === "contest" &&
      latest.rebuttalVerdict == null &&
      latest.rebuttalText &&
      latest.updatedAt < staleRebuttalCutoff
    ) {
      const staleRebuttalHash = createHash("sha256").update(latest.rebuttalText).digest("hex").slice(0, 16);
      logger.warn(
        {
          dealId,
          thesisId: latest.id,
          updatedAt: latest.updatedAt,
        },
        "Releasing stale rebuttal attempt before accepting a new rebuttal request"
      );

      await thesisService.cancelRebuttalAttempt({
        thesisId: latest.id,
        rebuttalText: latest.rebuttalText,
      }).catch((err) => {
        logger.error({ err, dealId, thesisId: latest?.id }, "Failed to release stale rebuttal attempt");
      });

      await refundCreditAmount(user.id, "THESIS_REBUTTAL", 1, {
        dealId,
        idempotencyKey: `thesis:rebuttal-refund:${latest.id}:${staleRebuttalHash}`,
        description: "Refund stale thesis rebuttal attempt",
      }).catch((err) => {
        logger.error({ err, dealId, thesisId: latest?.id }, "Failed to refund stale rebuttal attempt");
      });

      latest = await thesisService.getLatest(dealId);
      if (!latest) {
        return NextResponse.json({ error: "No thesis found for this deal" }, { status: 404 });
      }
    }

    if (latest.decision === "stop" || latest.decision === "continue") {
      return NextResponse.json(
        { error: "This thesis is no longer contestable", existing: latest.decision },
        { status: 409 }
      );
    }

    const pausedAnalyses = await prisma.analysis.findMany({
      where: {
        dealId,
        thesisId: latest.id,
        status: "RUNNING",
        ...(latest.corpusSnapshotId ? { corpusSnapshotId: latest.corpusSnapshotId } : {}),
      },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    if (pausedAnalyses.length === 0) {
      return NextResponse.json(
        { error: "No paused thesis-first analysis found for this thesis" },
        { status: 409 }
      );
    }
    if (pausedAnalyses.length > 1) {
      logger.error(
        { dealId, thesisId: latest.id, pausedAnalysisIds: pausedAnalyses.map((analysis) => analysis.id) },
        "Refusing rebuttal dispatch because multiple paused analyses exist for the same thesis"
      );
      return NextResponse.json(
        { error: "Corrupted thesis state: multiple paused analyses found for this thesis" },
        { status: 409 }
      );
    }
    const pausedAnalysis = pausedAnalyses[0];

    const deterministicRejection = getDeterministicRebuttalRejection(rebuttalText);
    if (deterministicRejection) {
      return NextResponse.json(
        {
          error: deterministicRejection,
          code: "REBUTTAL_NOT_SPECIFIC",
        },
        { status: 422 }
      );
    }

    const beginAttempt = await thesisService.beginRebuttalAttempt({
      dealId,
      thesisId: latest.id,
      rebuttalText,
    });
    if (!beginAttempt) {
      return NextResponse.json({ error: "Thesis not found" }, { status: 404 });
    }

    if (beginAttempt.status === "cap_reached") {
      return NextResponse.json(
        { error: "Limite de rebuttals atteinte pour ce deal (3 max)" },
        { status: 429 }
      );
    }

    if (beginAttempt.status === "duplicate") {
      return NextResponse.json({
        data: {
          verdict: beginAttempt.thesis.rebuttalVerdict,
          reasoning: null,
          regenerate: beginAttempt.thesis.rebuttalVerdict === "valid",
          creditsCharged: 0,
          thesisId: beginAttempt.thesis.id,
        },
      });
    }

    if (beginAttempt.status === "in_progress") {
      return NextResponse.json(
        { error: "A rebuttal for this thesis is already being processed" },
        { status: 409 }
      );
    }

    if (beginAttempt.status === "not_contestable") {
      return NextResponse.json(
        { error: "This thesis state is no longer contestable" },
        { status: 409 }
      );
    }

    const rebuttalHash = createHash("sha256").update(rebuttalText).digest("hex").slice(0, 16);
    const chargeKey = `thesis:rebuttal:${latest.id}:${rebuttalHash}`;
    const refundKey = `thesis:rebuttal-refund:${latest.id}:${rebuttalHash}`;

    const deduction = await deductCreditAmount(user.id, "THESIS_REBUTTAL", 1, {
      dealId,
      idempotencyKey: chargeKey,
      description: `Thesis rebuttal judge for deal ${dealId}`,
    });
    if (!deduction.success) {
      await thesisService.cancelRebuttalAttempt({
        thesisId: latest.id,
        rebuttalText,
      });
      return NextResponse.json(
        {
          error: "Credits insuffisants pour le rebuttal (1 credit requis)",
          required: 1,
        },
        { status: 402 }
      );
    }

    const latestSourceScope = await thesisService.resolveSourceScope(latest);
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
      sourceDocumentIds: latestSourceScope!.sourceDocumentIds,
      sourceHash: latestSourceScope!.sourceHash,
    };
    const judgeBaseContext = {
      dealId,
      deal: {
        id: deal.id,
        name: canonicalDealName,
        sector: canonicalSector,
        stage: canonicalStage,
      },
      originalThesis,
      rebuttalText,
    };

    let judgeResult: Awaited<ReturnType<typeof thesisRebuttalJudgeAgent.run>>;
    try {
      judgeResult = await thesisRebuttalJudgeAgent.run(buildJudgeContext(judgeBaseContext));
    } catch (err) {
      await refundCreditAmount(user.id, "THESIS_REBUTTAL", 1, {
        dealId,
        idempotencyKey: refundKey,
        description: `Thesis rebuttal refund (judge crash)`,
      }).catch(() => undefined);
      await thesisService.cancelRebuttalAttempt({
        thesisId: latest.id,
        rebuttalText,
      }).catch(() => undefined);
      throw err;
    }

    if (!judgeResult.success || !("data" in judgeResult)) {
      await refundCreditAmount(user.id, "THESIS_REBUTTAL", 1, {
        dealId,
        idempotencyKey: refundKey,
        description: `Thesis rebuttal refund (judge failed)`,
      }).catch(() => undefined);
      await thesisService.cancelRebuttalAttempt({
        thesisId: latest.id,
        rebuttalText,
      }).catch(() => undefined);
      logger.error(
        {
          dealId,
          thesisId: latest.id,
          judgeError: judgeResult.error,
        },
        "Rebuttal judge unavailable after fallback chain exhausted"
      );
      return NextResponse.json(
        {
          error: "Juge temporairement indisponible. Votre crédit a été remboursé, vous pouvez réessayer.",
          retryable: true,
          refundedCredits: 1,
        },
        { status: 503, headers: { "Retry-After": "60" } }
      );
    }

    let judgment = judgeResult.data as RebuttalJudgeOutput;
    if (judgment.verdict === "valid") {
      let confirmationResult: Awaited<ReturnType<typeof thesisRebuttalJudgeAgent.run>>;
      try {
        confirmationResult = await thesisRebuttalJudgeAgent.run(
          buildJudgeContext({
            ...judgeBaseContext,
            judgeCallOptions: {
              fallbackChain: REBUTTAL_CONFIRMATION_CHAIN,
            },
          })
        );
      } catch (err) {
        await refundCreditAmount(user.id, "THESIS_REBUTTAL", 1, {
          dealId,
          idempotencyKey: refundKey,
          description: `Thesis rebuttal refund (confirmation judge crash)`,
        }).catch(() => undefined);
        await thesisService.cancelRebuttalAttempt({
          thesisId: latest.id,
          rebuttalText,
        }).catch(() => undefined);
        throw err;
      }

      if (!confirmationResult.success || !("data" in confirmationResult)) {
        await refundCreditAmount(user.id, "THESIS_REBUTTAL", 1, {
          dealId,
          idempotencyKey: refundKey,
          description: `Thesis rebuttal refund (confirmation judge failed)`,
        }).catch(() => undefined);
        await thesisService.cancelRebuttalAttempt({
          thesisId: latest.id,
          rebuttalText,
        }).catch(() => undefined);
        logger.error(
          {
            dealId,
            thesisId: latest.id,
            judgeError: confirmationResult.error,
          },
          "Rebuttal confirmation judge unavailable after primary valid verdict"
        );
        return NextResponse.json(
          {
            error: "Verification croisee du rebuttal temporairement indisponible. Votre credit a ete rembourse, vous pouvez reessayer.",
            retryable: true,
            refundedCredits: 1,
          },
          { status: 503, headers: { "Retry-After": "60" } }
        );
      }

      const confirmedJudgment = confirmationResult.data as RebuttalJudgeOutput;
      if (confirmedJudgment.verdict !== "valid") {
        judgment = {
          verdict: "rejected",
          reasoning:
            `Le rebuttal n'a pas ete confirme par la contre-evaluation independante. ` +
            `${confirmedJudgment.reasoning}`,
          regenerate: false,
        };
      } else {
        judgment = {
          verdict: "valid",
          reasoning: judgment.reasoning,
          regenerate: judgment.regenerate && confirmedJudgment.regenerate,
          adjustedElements: mergeAdjustedElements(
            judgment.adjustedElements,
            confirmedJudgment.adjustedElements
          ),
        };
      }
    }

    const finalized = await thesisService.finalizeRebuttalAttempt({
      thesisId: latest.id,
      rebuttalText,
      verdict: judgment.verdict,
    });
    if (finalized.status === "not_found") {
      await refundCreditAmount(user.id, "THESIS_REBUTTAL", 1, {
        dealId,
        idempotencyKey: refundKey,
        description: `Thesis rebuttal refund (finalization failed)`,
      }).catch(() => undefined);
      await thesisService.cancelRebuttalAttempt({
        thesisId: latest.id,
        rebuttalText,
      }).catch(() => undefined);
      return NextResponse.json(
        { error: "Could not finalize rebuttal" },
        { status: 409 }
      );
    }
    if (finalized.status === "stale" || finalized.status === "conflict") {
      await refundCreditAmount(user.id, "THESIS_REBUTTAL", 1, {
        dealId,
        idempotencyKey: refundKey,
        description: `Thesis rebuttal refund (finalization ${finalized.status})`,
      }).catch(() => undefined);
      await thesisService.cancelRebuttalAttempt({
        thesisId: latest.id,
        rebuttalText,
      }).catch(() => undefined);
      return NextResponse.json(
        { error: `Could not finalize rebuttal (${finalized.status})` },
        { status: 409 }
      );
    }

    if (judgment.verdict === "valid") {
      try {
        await inngest.send({
          name: "analysis/thesis.reextract",
          data: {
            dealId,
            userId: user.id,
            previousThesisId: latest.id,
            supersededAnalysisId: pausedAnalysis.id,
            triggeredByRebuttal: true,
          },
        });
      } catch (err) {
        await refundCreditAmount(user.id, "THESIS_REBUTTAL", 1, {
          dealId,
          idempotencyKey: refundKey,
          description: `Thesis rebuttal refund (reextract enqueue failed)`,
        }).catch(() => undefined);
        await thesisService.revertRebuttalAttempt({
          thesisId: latest.id,
          rebuttalText,
          expectedVerdict: "valid",
        }).catch(() => undefined);
        logger.error(
          { err, dealId, thesisId: latest.id, pausedAnalysisId: pausedAnalysis.id },
          "Failed to dispatch thesis reextract after valid rebuttal; reverted rebuttal state"
        );
        throw err;
      }
    }

    return NextResponse.json({
      data: {
        verdict: judgment.verdict,
        reasoning: judgment.reasoning,
        regenerate: judgment.regenerate,
        creditsCharged: 1,
        thesisId: finalized.thesis?.id ?? latest.id,
      },
    });
  } catch (error) {
    return handleApiError(error, "thesis rebuttal");
  }
}
