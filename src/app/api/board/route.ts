import { NextRequest, NextResponse } from "next/server";
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

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes max (Vercel limit)

/**
 * POST /api/board
 * Start a new AI Board deliberation session
 *
 * Body: { dealId: string }
 * Returns: SSE stream of progress events
 */
export async function POST(req: NextRequest) {
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

    // Check credits
    const { canStart, status: creditsStatus } = await canStartBoard(user.id);

    if (!canStart) {
      return NextResponse.json(
        {
          error: creditsStatus.reason ?? "Credits insuffisants",
          creditsStatus,
        },
        { status: 402 } // Payment Required
      );
    }

    // Consume a credit before starting
    const consumeResult = await consumeCredit(user.id);

    if (!consumeResult.success) {
      return NextResponse.json(
        { error: consumeResult.error },
        { status: 402 }
      );
    }

    // Create SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let sessionId: string | null = null;

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

          // Refund credit on failure
          await refundCredit(user.id);

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
    if (process.env.NODE_ENV === "development") {
      console.error("Board API error:", error);
    }
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/board
 * Get user's board credits status
 */
export async function GET() {
  try {
    const user = await requireAuth();
    const status = await getCreditsStatus(user.id);

    return NextResponse.json({ status });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Board credits API error:", error);
    }
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
