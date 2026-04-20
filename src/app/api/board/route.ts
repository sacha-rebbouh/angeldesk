import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BoardOrchestrator, type BoardProgressEvent } from "@/agents/board";
import {
  canStartBoard,
  consumeCredit,
  refundCredit,
  getCreditsStatus,
} from "@/services/board-credits";
import { boardRequestSchema, checkRateLimit } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes max (Vercel limit)

function hashStringToBigInt(input: string): string {
  const digest = createHash("sha256").update(input).digest();
  return digest.readBigInt64BE(0).toString();
}

/**
 * POST /api/board
 * Start a new AI Board deliberation session
 *
 * Body: { dealId: string }
 * Returns: SSE stream of progress events
 */
export async function POST(req: NextRequest) {
  let reservedSessionId: string | null = null;
  try {
    const user = await requireAuth();

    // Parse and validate request body with Zod
    const body = await req.json();
    const parseResult = boardRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Requete invalide",
          details: parseResult.error.issues.map((e) => e.message),
        },
        { status: 400 }
      );
    }

    const { dealId } = parseResult.data;

    // Rate limiting: max 2 board sessions per minute per user
    const rateLimit = checkRateLimit(user.id, {
      maxRequests: 2,
      windowMs: 60000, // 1 minute
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Rate limit atteint. Reessayez dans ${rateLimit.resetIn}s`,
          retryAfter: rateLimit.resetIn,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.resetIn),
            "X-RateLimit-Remaining": String(rateLimit.remaining),
          },
        }
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
        { error: "Deal non trouve ou acces refuse" },
        { status: 404 }
      );
    }

    const boardReservation = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${hashStringToBigInt(`board:${dealId}:${user.id}`)})`);

      const activeSession = await tx.aIBoardSession.findFirst({
        where: {
          dealId,
          userId: user.id,
          status: { in: ["INITIALIZING", "ANALYZING", "DEBATING", "VOTING"] },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true },
      });

      if (activeSession) {
        return {
          kind: "active" as const,
          sessionId: activeSession.id,
          status: activeSession.status,
        };
      }

      const session = await tx.aIBoardSession.create({
        data: {
          dealId,
          userId: user.id,
          status: "INITIALIZING",
          startedAt: new Date(),
        },
        select: { id: true },
      });

      return {
        kind: "reserved" as const,
        sessionId: session.id,
      };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    if (boardReservation.kind === "active") {
      return NextResponse.json(
        {
          error: "Une session AI Board est deja en cours pour ce deal",
          sessionId: boardReservation.sessionId,
        },
        { status: 409 }
      );
    }

    reservedSessionId = boardReservation.sessionId;

    // Check credits
    const { canStart, status: creditsStatus } = await canStartBoard(user.id);

    if (!canStart) {
      await prisma.aIBoardSession.delete({
        where: { id: reservedSessionId },
      }).catch(() => undefined);
      return NextResponse.json(
        {
          error: creditsStatus.reason ?? "Credits insuffisants",
          creditsStatus,
        },
        { status: 402 } // Payment Required
      );
    }

    // Consume a credit before starting
    const consumeResult = await consumeCredit(user.id, {
      dealId,
      idempotencyKey: `board:${reservedSessionId}`,
      description: `AI Board for deal ${dealId}`,
    });

    if (!consumeResult.success) {
      await prisma.aIBoardSession.delete({
        where: { id: reservedSessionId },
      }).catch(() => undefined);
      return NextResponse.json(
        { error: consumeResult.error },
        { status: 402 }
      );
    }

    // Create SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let sessionId: string | null = reservedSessionId;

        const sendEvent = (event: BoardProgressEvent) => {
          const data = JSON.stringify(event);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        };

        try {
          const orchestrator = new BoardOrchestrator({
            dealId,
            userId: user.id,
            onProgress: (event) => {
              if (event.sessionId && !sessionId) {
                sessionId = event.sessionId;
              }
              sendEvent(event);
            },
          });

          const result = await orchestrator.runBoard({
            dealId,
            userId: user.id,
            sessionId: reservedSessionId ?? undefined,
          });

          // Send final result
          sendEvent({
            type: "verdict_reached",
            timestamp: Date.now(),
            sessionId: sessionId ?? "",
            verdict: result,
            message: "Deliberation terminee",
          });

          controller.close();
        } catch (error) {
          if (process.env.NODE_ENV === "development") {
            console.error("Board orchestration error:", error);
          }

          if (sessionId) {
            await prisma.aIBoardSession.update({
              where: { id: sessionId },
              data: {
                status: "FAILED",
                completedAt: new Date(),
              },
            }).catch(() => undefined);
          }

          // Refund credit on failure (scope par sessionId pour dedup fin)
          await refundCredit(user.id, sessionId ?? undefined, dealId);

          sendEvent({
            type: "error",
            timestamp: Date.now(),
            sessionId: sessionId ?? "",
            error: error instanceof Error ? error.message : "Erreur inconnue",
          });

          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    if (reservedSessionId) {
      await prisma.aIBoardSession.delete({
        where: { id: reservedSessionId },
      }).catch(() => undefined);
    }
    return handleApiError(error, "start board session");
  }
}

/**
 * GET /api/board
 * Get user's board credits status
 * Optional: ?dealId=xxx to also return the latest completed session for that deal
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const status = await getCreditsStatus(user.id);

    const dealId = req.nextUrl.searchParams.get("dealId");

    // If dealId provided, also fetch the latest completed session
    let latestSession = null;
    let staleSession = null;
    if (dealId) {
      const [session, latestThesis] = await Promise.all([
        prisma.aIBoardSession.findFirst({
          where: {
            dealId,
            userId: user.id,
            status: "COMPLETED",
          },
          orderBy: { completedAt: "desc" },
          include: {
            members: true,
            rounds: {
              orderBy: { roundNumber: "asc" },
            },
          },
        }),
        prisma.thesis.findFirst({
          where: { dealId, isLatest: true },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            corpusSnapshotId: true,
          },
        }),
      ]);

      if (session) {
        const serializedSession = {
          id: session.id,
          dealId: session.dealId,
          status: session.status,
          thesisId: session.thesisId,
          corpusSnapshotId: session.corpusSnapshotId,
          verdict: session.verdict,
          consensusLevel: session.consensusLevel,
          stoppingReason: session.stoppingReason,
          votes: session.members.map((member) => ({
            memberId: member.id,
            modelId: member.modelId,
            memberName: member.modelName,
            color: member.color,
            initialAnalysis: member.initialAnalysis,
            finalVote: member.finalVote,
            finalConfidence: member.finalConfidence,
            justification: member.voteJustification,
          })),
          rounds: session.rounds.map((round) => ({
            roundNumber: round.roundNumber,
            roundType: round.roundType,
            responses: round.responses,
          })),
          consensusPoints: session.consensusPoints,
          frictionPoints: session.frictionPoints,
          questionsForFounder: session.questionsForFounder,
          totalRounds: session.totalRounds,
          totalCost: session.totalCost?.toString(),
          totalTimeMs: session.totalTimeMs,
          completedAt: session.completedAt?.toISOString(),
        };

        const isStale =
          (Boolean(latestThesis?.id) && session.thesisId !== latestThesis?.id) ||
          (Boolean(latestThesis?.corpusSnapshotId) &&
            session.corpusSnapshotId !== latestThesis?.corpusSnapshotId);

        if (isStale) {
          staleSession = serializedSession;
        } else {
          latestSession = serializedSession;
        }
      }
    }

    return NextResponse.json({ status, latestSession, staleSession });
  } catch (error) {
    return handleApiError(error, "fetch board status");
  }
}
