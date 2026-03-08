import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual, createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { processVisualFrame } from "@/lib/live/visual-processor";
import { compileDealContextCached, compileContextForColdMode } from "@/lib/live/context-compiler";
import { publishCoachingCard, publishVisualAnalysis } from "@/lib/live/ably-server";
import { isValidCuid } from "@/lib/sanitize";
import { logCoachingError } from "@/lib/live/monitoring";
import type { AblyCoachingCardEvent, AblyVisualAnalysisEvent } from "@/lib/live/types";

// PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_FRAME_SIZE = 5 * 1024 * 1024; // 5MB max per frame

// Per-session rate limiting (max 1 frame per 3 seconds — matches processing time)
const lastFrameTime = new Map<string, number>();
const RATE_LIMIT_MS = 3_000;
const RATE_LIMIT_MAX_ENTRIES = 1_000;
const RATE_LIMIT_TTL_MS = 60 * 60_000; // 1 hour

function timingSafeCompare(a: string, b: string): boolean {
  // HMAC both values to produce fixed-length outputs, eliminating length oracle
  const key = "timing-safe-compare";
  const hashA = createHmac("sha256", key).update(a).digest();
  const hashB = createHmac("sha256", key).update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

export const maxDuration = 30;

type RouteContext = {
  params: Promise<{ id: string }>;
};

// POST /api/live-sessions/[id]/visual-frame
// Receives PNG frames from the Fly.io WebSocket relay.
// Auth: Bearer token (WS_RELAY_SECRET shared with relay)
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!isValidCuid(id)) {
      return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
    }

    // Verify relay secret (timing-safe comparison)
    const authHeader = request.headers.get("authorization");
    const expectedSecret = process.env.WS_RELAY_SECRET;
    if (!expectedSecret || !authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!timingSafeCompare(authHeader, `Bearer ${expectedSecret}`)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Per-session rate limiting
    const now = Date.now();
    const lastTime = lastFrameTime.get(id) ?? 0;
    if (now - lastTime < RATE_LIMIT_MS) {
      return NextResponse.json({ ok: true, skipped: "rate_limited" });
    }
    lastFrameTime.set(id, now);

    // Periodic cleanup of stale rate limit entries
    if (lastFrameTime.size > RATE_LIMIT_MAX_ENTRIES) {
      for (const [key, time] of lastFrameTime) {
        if (now - time > RATE_LIMIT_TTL_MS) lastFrameTime.delete(key);
      }
    }

    // Extract metadata from headers
    const timestampMs = parseInt(request.headers.get("x-timestamp-ms") ?? "0", 10);
    const timestamp = timestampMs / 1000; // Convert to seconds

    // Read PNG body with size limit
    const contentLength = parseInt(request.headers.get("content-length") ?? "0", 10);
    if (contentLength > MAX_FRAME_SIZE) {
      return NextResponse.json({ error: "Frame too large" }, { status: 413 });
    }

    const arrayBuffer = await request.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length < 100 || buffer.length > MAX_FRAME_SIZE) {
      return NextResponse.json({ error: "Invalid frame size" }, { status: 400 });
    }

    // Validate PNG magic bytes
    if (!buffer.subarray(0, 8).equals(PNG_MAGIC)) {
      return NextResponse.json({ error: "Invalid PNG" }, { status: 400 });
    }

    // Verify session is active (accept "bot_joining" too — video frames may arrive
    // before the Svix webhook transitions the status from "bot_joining" to "live")
    const session = await prisma.liveSession.findFirst({
      where: { id, status: { in: ["live", "bot_joining"] } },
      select: { id: true, dealId: true },
    });

    if (!session) {
      return NextResponse.json({ ok: true }); // Graceful ignore
    }

    const imageBase64 = buffer.toString("base64");

    // Process inline (NOT in after() — LLM calls fail silently inside after() in dev mode)
    // The relay is fire-and-forget so response latency doesn't matter
    try {
      const dealContext = session.dealId
        ? await compileDealContextCached(session.dealId)
        : compileContextForColdMode();

      const result = await processVisualFrame(id, imageBase64, timestamp, dealContext);

      if (!result.analyzed || !result.analysis) {
        console.log(`[visual-frame][${id}] Frame skipped (not new content), cost: ${result.cost}`);
        return NextResponse.json({ ok: true, analyzed: false });
      }

      const analysis = result.analysis;
      console.log(`[visual-frame][${id}] Frame analyzed: ${analysis.contentType} — ${analysis.description}`);

      // Store ScreenCapture in DB (includes suggestedQuestion)
      await prisma.screenCapture.create({
        data: {
          sessionId: id,
          timestamp: analysis.timestamp,
          contentType: analysis.contentType,
          description: analysis.description,
          keyData: analysis.keyData,
          contradictions: analysis.contradictions,
          newInsights: analysis.newInsights,
          suggestedQuestion: analysis.suggestedQuestion,
          perceptualHash: analysis.frameId,
          analysisCost: analysis.analysisCost,
        },
      });

      // Publish visual analysis event via Ably
      const ablyEvent: AblyVisualAnalysisEvent = {
        frameId: analysis.frameId,
        contentType: analysis.contentType,
        description: analysis.description,
        hasContradictions: analysis.contradictions.length > 0,
        keyDataCount: analysis.keyData.length,
        timestamp: analysis.timestamp,
      };
      await publishVisualAnalysis(id, ablyEvent);

      // Proactive coaching card for high-severity visual contradictions
      const highContradictions = analysis.contradictions.filter(
        (c) => c.severity === "high"
      );

      if (highContradictions.length > 0) {
        // Dedup: check existing active visual contradiction cards
        const existingVisualCards = await prisma.coachingCard.findMany({
          where: {
            sessionId: id,
            isVisualTrigger: true,
            status: "active",
          },
          select: { content: true },
        });
        const existingContents = new Set(existingVisualCards.map((c) => c.content));

        for (const contradiction of highContradictions) {
          // Professional card content: cite the discrepancy with both data points
          const content = `Écart détecté — La slide indique "${contradiction.visualClaim}" alors que l'analyse du deal fait état de "${contradiction.analysisClaim}".`;

          // Per-contradiction question, fallback to global if missing
          const question = contradiction.suggestedQuestion || analysis.suggestedQuestion;

          // Skip if a card with the same content already exists
          if (existingContents.has(content)) continue;

          const card = await prisma.coachingCard.create({
            data: {
              sessionId: id,
              type: "contradiction",
              priority: "high",
              content,
              reference: "visual-analysis",
              suggestedQuestion: question,
              isVisualTrigger: true,
              status: "active",
            },
          });

          const cardEvent: AblyCoachingCardEvent = {
            id: card.id,
            type: "contradiction",
            priority: "high",
            content: card.content,
            context: "visual-analysis",
            reference: "visual-analysis",
            suggestedQuestion: question,
            status: "active",
            createdAt: card.createdAt.toISOString(),
          };

          await publishCoachingCard(id, cardEvent);
          console.log(
            `[visual-frame][${id}] PROACTIVE CARD: ${contradiction.visualClaim} vs ${contradiction.analysisClaim}`
          );
        }
      }
    } catch (error) {
      logCoachingError(id, "visual_frame_processing", error);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[visual-frame] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
