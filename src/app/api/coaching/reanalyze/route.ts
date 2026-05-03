import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { isValidCuid, checkRateLimit } from "@/lib/sanitize";
import { deductCredits, refundCredits } from "@/services/credits";
import { handleApiError } from "@/lib/api-error";
import {
  triggerTargetedReanalysis,
  generateDeltaReport,
  identifyImpactedAgents,
} from "@/lib/live/post-call-reanalyzer";
import type { PostCallReport } from "@/lib/live/types";
import { assertDealCorpusReady, CorpusNotReadyError } from "@/services/documents/readiness-gate";
import { corpusNotReadyResponse } from "@/lib/api/corpus-not-ready-response";

const REANALYSIS_STALE_WINDOW_MS = 30 * 60 * 1000;

function hashStringToBigInt(input: string): string {
  const digest = createHash("sha256").update(input).digest();
  return digest.readBigInt64BE(0).toString();
}

async function reserveSessionReanalysis(sessionId: string, userId: string, mode: "targeted" | "full"): Promise<
  | { kind: "reserved"; requestId: string }
  | { kind: "active" }
> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${hashStringToBigInt(`session-reanalysis:${sessionId}`)})`);

    const session = await tx.liveSession.findFirst({
      where: {
        id: sessionId,
        userId,
        status: { in: ["completed", "processing"] },
      },
      select: {
        id: true,
        reanalysisRequestId: true,
        reanalysisRequestedAt: true,
      },
    });

    if (!session) {
      throw new Error("SESSION_NOT_FOUND_OR_INVALID_STATE");
    }

    if (
      session.reanalysisRequestId &&
      session.reanalysisRequestedAt &&
      session.reanalysisRequestedAt >= new Date(Date.now() - REANALYSIS_STALE_WINDOW_MS)
    ) {
      return { kind: "active" as const };
    }

    const requestId = randomUUID();
    await tx.liveSession.update({
      where: { id: sessionId },
      data: {
        reanalysisRequestId: requestId,
        reanalysisMode: mode,
        reanalysisRequestedAt: new Date(),
      },
    });

    return {
      kind: "reserved" as const,
      requestId,
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

async function clearSessionReanalysisReservation(sessionId: string, requestId: string): Promise<void> {
  await prisma.liveSession.updateMany({
    where: {
      id: sessionId,
      reanalysisRequestId: requestId,
    },
    data: {
      reanalysisRequestId: null,
      reanalysisMode: null,
      reanalysisRequestedAt: null,
    },
  });
}

// ---------------------------------------------------------------------------
// Full list of Tier 1 + Tier 3 agent names for "full" reanalysis mode
// ---------------------------------------------------------------------------

const ALL_AGENT_NAMES = [
  // Tier 1
  "financial-auditor",
  "deck-forensics",
  "team-investigator",
  "market-intelligence",
  "competitive-intel",
  "exit-strategist",
  "tech-stack-dd",
  "tech-ops-dd",
  "legal-regulatory",
  "gtm-analyst",
  "customer-intel",
  "cap-table-auditor",
  "question-master",
  // Tier 3
  "contradiction-detector",
  "synthesis-deal-scorer",
  "devils-advocate",
  "scenario-modeler",
  "memo-generator",
];

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

const reanalyzeSchema = z.object({
  sessionId: z.string(),
  mode: z.enum(["delta", "targeted", "full"]),
});

// POST /api/coaching/reanalyze — Trigger post-call re-analysis
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();

    // Limit to 3 reanalyze calls per hour per user
    const rateCheck = checkRateLimit(`coaching-reanalyze:${user.id}`, { maxRequests: 3, windowMs: 3600000 });
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: "Trop de demandes. Réessayez plus tard." }, { status: 429 });
    }

    const body = await request.json();
    const { sessionId, mode } = reanalyzeSchema.parse(body);

    if (!isValidCuid(sessionId)) {
      return NextResponse.json(
        { error: "Invalid session ID format" },
        { status: 400 }
      );
    }

    // Verify session exists, belongs to user, and has valid status
    const session = await prisma.liveSession.findFirst({
      where: {
        id: sessionId,
        userId: user.id,
        status: { in: ["completed", "processing"] },
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Session not found, access denied, or session not in completed/processing status" },
        { status: 404 }
      );
    }

    if (!session.dealId) {
      return NextResponse.json(
        { error: "Cannot reanalyze a session without an associated deal" },
        { status: 400 }
      );
    }

    // ARC-LIGHT Phase 1 gate: block re-analysis (free or paid) on toxic corpus,
    // before credit deduction and before any orchestration.
    try {
      await assertDealCorpusReady(session.dealId);
    } catch (error) {
      if (error instanceof CorpusNotReadyError) {
        return corpusNotReadyResponse(error);
      }
      throw error;
    }

    // --- Delta mode: lightweight comparison, no agent re-run (free) ---
    if (mode === "delta") {
      const deltaReport = await generateDeltaReport(sessionId, session.dealId);
      return NextResponse.json({ data: deltaReport });
    }

    // --- Targeted mode: verify summary exists BEFORE deducting credits ---
    let agentNames: string[];
    if (mode === "targeted") {
      const summary = await prisma.sessionSummary.findUnique({
        where: { sessionId },
      });

      if (!summary) {
        return NextResponse.json(
          { error: "Post-call report not generated yet. Wait for processing to complete." },
          { status: 400 }
        );
      }

      // Reconstruct a PostCallReport from the summary data
      const postCallReport: PostCallReport = {
        executiveSummary: summary.executiveSummary,
        keyPoints: summary.keyPoints as PostCallReport["keyPoints"],
        actionItems: summary.actionItems as PostCallReport["actionItems"],
        newInformation: summary.newInformation as PostCallReport["newInformation"],
        contradictions: summary.contradictions as PostCallReport["contradictions"],
        questionsAsked: summary.questionsAsked as PostCallReport["questionsAsked"],
        remainingQuestions: summary.remainingQuestions as PostCallReport["remainingQuestions"],
        confidenceDelta: summary.confidenceDelta as PostCallReport["confidenceDelta"],
        sessionStats: summary.sessionStats as PostCallReport["sessionStats"],
      };

      agentNames = identifyImpactedAgents(postCallReport);
    } else {
      // Full mode
      agentNames = ALL_AGENT_NAMES;
    }

    const reanalysisReservation = await reserveSessionReanalysis(sessionId, user.id, mode);
    if (reanalysisReservation.kind === "active") {
      return NextResponse.json(
        { error: "Une re-analyse est deja en cours pour cette session" },
        { status: 409 }
      );
    }

    const reanalysisRequestId = reanalysisReservation.requestId;

    // --- Deduct credits (RE_ANALYSIS = 3 credits) — after all preconditions pass ---
    const deduction = await deductCredits(user.id, 'RE_ANALYSIS', session.dealId, {
      idempotencyKey: `reanalysis:${reanalysisRequestId}`,
      description: `Post-call reanalysis (${mode}) for session ${sessionId}`,
    });
    if (!deduction.success) {
      await clearSessionReanalysisReservation(sessionId, reanalysisRequestId).catch(() => undefined);
      return NextResponse.json(
        { error: deduction.error ?? "Crédits insuffisants pour la re-analyse" },
        { status: 402 }
      );
    }

    // --- Trigger re-analysis (refund on failure) ---
    const refundKey = `refund:RE_ANALYSIS:session:${sessionId}:${reanalysisRequestId}`;
    try {
      const reanalysis = await triggerTargetedReanalysis(
        session.dealId,
        agentNames,
        sessionId
      );

      await clearSessionReanalysisReservation(sessionId, reanalysisRequestId).catch(() => undefined);

      return NextResponse.json({
        data: {
          agents: agentNames,
          analysisId: reanalysis.analysisId,
        },
      });
    } catch (reanalysisError) {
      // Refund credits — re-analysis failed to start.
      // P1 — idempotency scope fine: par (sessionId, dealId) pour permettre plusieurs
      // tentatives successives sans bloquer les refunds legitimes.
      await refundCredits(user.id, 'RE_ANALYSIS', session.dealId, {
        idempotencyKey: refundKey,
      });
      await clearSessionReanalysisReservation(sessionId, reanalysisRequestId).catch(() => undefined);
      throw reanalysisError;
    }

  } catch (error) {
    return handleApiError(error, "trigger post-call reanalysis");
  }
}
