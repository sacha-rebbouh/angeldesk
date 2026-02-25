import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { classifyUtterance, shouldTriggerCoaching } from "@/lib/live/utterance-router";
import { generateCoachingSuggestion, getTranscriptBuffer } from "@/lib/live/coaching-engine";
import { checkAutoDismiss, markCardsAsAddressed } from "@/lib/live/auto-dismiss";
import { compileDealContextCached, compileContextForColdMode } from "@/lib/live/context-compiler";
import { mapSpeakerToRole } from "@/lib/live/speaker-detector";
import { publishCoachingCard } from "@/lib/live/ably-server";
import { handleApiError } from "@/lib/api-error";
import { isValidCuid } from "@/lib/sanitize";
import {
  logCoachingLatency,
  logCoachingError,
  logSessionEvent,
} from "@/lib/live/monitoring";
import type {
  Participant,
  SpeakerRole,
  UtteranceClassification,
  CoachingInput,
  AblyCoachingCardEvent,
} from "@/lib/live/types";

export const maxDuration = 30;

type RouteContext = {
  params: Promise<{ id: string }>;
};

// ---------------------------------------------------------------------------
// Utterance buffer — accumulates micro-chunks from the same speaker before
// triggering the coaching pipeline. Recall.ai sends very granular chunks
// (1-5 words each), which are too small for meaningful classification.
// We buffer until: 15+ words OR 4s gap between chunks OR speaker changes.
// ---------------------------------------------------------------------------
const BUFFER_MIN_WORDS = 8;
const BUFFER_MAX_GAP_MS = 3000;

interface BufferEntry {
  texts: string[];
  speaker: string;
  lastTimestamp: number;
  firstTimestamp: number;
  lastReceivedAt: number;
}

const utteranceBuffers = new Map<string, BufferEntry>();

function flushBuffer(sessionId: string): { text: string; speaker: string; timestampStart: number; timestampEnd: number } | null {
  const buf = utteranceBuffers.get(sessionId);
  if (!buf || buf.texts.length === 0) return null;
  const result = {
    text: buf.texts.join(" ").trim(),
    speaker: buf.speaker,
    timestampStart: buf.firstTimestamp,
    timestampEnd: buf.lastTimestamp,
  };
  utteranceBuffers.delete(sessionId);
  return result;
}

// POST /api/live-sessions/[id]/webhook — Receive real-time transcription from Recall.ai
// Note: This webhook URL is set per-bot via createBot() real_time_transcription config.
// Security: session ID (CUID, 25 chars, ~72 bits entropy) acts as bearer token.
// The Svix signing secret only applies to the dashboard-configured status webhook.
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!isValidCuid(id)) {
      return NextResponse.json(
        { error: "Invalid session ID format" },
        { status: 400 }
      );
    }

    // ── Parse body ──
    // Recall.ai realtime_endpoints payload structure:
    // {
    //   event: "transcript.data" | "transcript.partial_data",
    //   data: {
    //     data: { words: [{ text, start_timestamp: { relative }, end_timestamp: { relative } }], participant: { name, id } },
    //     transcript: { id },
    //     bot: { id }
    //   }
    // }
    const rawBody = await request.text();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // Log every webhook call for debugging
    console.log(`[webhook][${id}] event=${body.event ?? "unknown"} speaker=${body.data?.data?.participant?.name ?? "?"} words=${body.data?.data?.words?.length ?? 0}`);

    // Skip partial transcripts — only process final ("transcript.data")
    if (body.event === "transcript.partial_data") {
      return NextResponse.json({ ok: true });
    }

    // Extract transcript data from Recall.ai's nested structure
    const transcriptData = body.data?.data;
    if (!transcriptData) {
      return NextResponse.json({ ok: true });
    }

    const words = transcriptData.words ?? [];
    if (words.length === 0) {
      return NextResponse.json({ ok: true });
    }

    // Concatenate words into full text
    const text = words.map((w: { text: string }) => w.text).join(" ").trim();
    if (!text) {
      return NextResponse.json({ ok: true });
    }

    // Extract timestamps (Recall uses start_timestamp.relative in seconds)
    const timestampStart = words[0].start_timestamp?.relative ?? 0;
    const timestampEnd = words[words.length - 1].end_timestamp?.relative ?? 0;

    // Speaker from participant info
    const speaker = transcriptData.participant?.name ?? "Unknown";

    // ── Look up session ──
    const session = await prisma.liveSession.findFirst({
      where: {
        id,
        status: { in: ["live", "bot_joining"] },
      },
    });

    if (!session) {
      // Session not found or not in active state — ignore gracefully
      return NextResponse.json({ ok: true });
    }

    // ── Auto-promote bot_joining → live if we're receiving transcripts ──
    if (session.status === "bot_joining") {
      console.log(`[webhook][${id}] AUTO-PROMOTE: bot_joining → live (transcript received from "${speaker}")`);
      await prisma.liveSession.update({
        where: { id },
        data: { status: "live", startedAt: session.startedAt ?? new Date() },
      });
      // Best-effort Ably notification
      try {
        const { publishSessionStatus } = await import("@/lib/live/ably-server");
        await publishSessionStatus(id, { status: "live", message: "Bot has joined. Live coaching active." });
      } catch (err) {
        console.warn(`[webhook][${id}] Ably publish failed:`, err);
      }
    }

    // ── Determine speaker role from participants ──
    const participants = (session.participants as Participant[] | null) ?? [];
    const speakerRole: SpeakerRole = mapSpeakerToRole(speaker, participants);

    // ── Buffer micro-chunks into meaningful utterances ──
    const now = Date.now();
    const existing = utteranceBuffers.get(id);
    const wordCount = text.split(/\s+/).filter(Boolean).length;

    // Check if we should flush the buffer first (speaker change or time gap)
    let flushed: { text: string; speaker: string; timestampStart: number; timestampEnd: number } | null = null;
    if (existing && (existing.speaker !== speaker || (now - existing.lastReceivedAt) > BUFFER_MAX_GAP_MS)) {
      flushed = flushBuffer(id);
    }

    // Add current chunk to buffer
    const buf: BufferEntry = utteranceBuffers.get(id) ?? {
      texts: [] as string[],
      speaker,
      firstTimestamp: timestampStart,
      lastTimestamp: timestampEnd,
      lastReceivedAt: now,
    };
    buf.texts.push(text);
    buf.lastTimestamp = timestampEnd;
    buf.lastReceivedAt = now;
    utteranceBuffers.set(id, buf);

    // Check if buffer is ready to flush (enough words)
    const totalWords = buf.texts.join(" ").split(/\s+/).filter(Boolean).length;
    if (totalWords >= BUFFER_MIN_WORDS) {
      flushed = flushBuffer(id);
    }

    // ── Return 200 immediately — don't make Recall.ai wait ──
    const response = NextResponse.json({ ok: true });

    // ── If we have a flushed utterance, process it ──
    if (flushed) {
      const utterance = flushed;
      const uttSpeakerRole = mapSpeakerToRole(utterance.speaker, participants);
      console.log(`[webhook][${id}] BUFFER FLUSHED: ${utterance.text.split(/\s+/).length} words from "${utterance.speaker}" (role: ${uttSpeakerRole}): "${utterance.text.slice(0, 100)}"`);

      void (async () => {
        const pipelineStart = Date.now();
        logSessionEvent(id, "pipeline_start", { speaker: utterance.speaker, speakerRole: uttSpeakerRole, words: utterance.text.split(/\s+/).length });

        // Store the buffered utterance as a single chunk
        let chunkId: string | undefined;
        try {
          const chunk = await prisma.transcriptChunk.create({
            data: {
              sessionId: id,
              speaker: utterance.speaker,
              speakerRole: uttSpeakerRole,
              text: utterance.text,
              isFinal: true,
              timestampStart: utterance.timestampStart,
              timestampEnd: utterance.timestampEnd,
            },
          });
          chunkId = chunk.id;
        } catch (error) {
          logCoachingError(id, "store_chunk", error);
          return;
        }

        // 1. Classify the full utterance
        let classification: UtteranceClassification = "strategy_reveal";
        try {
          const result = await classifyUtterance(utterance.text, uttSpeakerRole);
          classification = result.classification;
          await prisma.transcriptChunk.update({
            where: { id: chunkId },
            data: { classification },
          });
          console.log(`[webhook][${id}] CLASSIFIED (${Date.now() - pipelineStart}ms): "${utterance.text.slice(0, 80)}" → ${classification}`);
        } catch (error) {
          logCoachingError(id, "classify_utterance", error);
        }

        // 2. Auto-dismiss check
        try {
          if ((uttSpeakerRole === "ba" || uttSpeakerRole === "investor") &&
              classification !== "filler" && classification !== "small_talk") {
            const activeCards = await prisma.coachingCard.findMany({
              where: { sessionId: id, status: "active" },
              select: { id: true, type: true, content: true, suggestedQuestion: true },
            });
            if (activeCards.length > 0) {
              const addressedIds = await checkAutoDismiss(utterance.text, activeCards);
              if (addressedIds.length > 0) {
                await markCardsAsAddressed(id, addressedIds);
              }
            }
          }
        } catch (error) {
          logCoachingError(id, "auto_dismiss", error);
        }

        // 3. Coaching trigger
        try {
          if (shouldTriggerCoaching(classification, uttSpeakerRole)) {
            console.log(`[webhook][${id}] COACHING TRIGGERED for: "${utterance.text.slice(0, 80)}"`);
            const coachingStart = Date.now();

            const [transcriptBuffer, allCards, dealContext] = await Promise.all([
              getTranscriptBuffer(id, 5),
              prisma.coachingCard.findMany({
                where: { sessionId: id },
                orderBy: { createdAt: "desc" },
              }),
              session.dealId
                ? compileDealContextCached(session.dealId)
                : Promise.resolve(compileContextForColdMode()),
            ]);

            const previousCards = allCards.slice(0, 10);
            const addressedCards = allCards.filter((c) => c.status === "addressed");

            const coachingInput: CoachingInput = {
              dealContext,
              recentTranscript: transcriptBuffer.map((tc) => ({
                speaker: tc.speaker,
                role: tc.speakerRole,
                text: tc.text,
              })),
              currentUtterance: {
                speaker: utterance.speaker,
                role: uttSpeakerRole,
                text: utterance.text,
                classification,
              },
              previousSuggestions: previousCards.map((c) => ({
                type: c.type,
                content: c.content,
              })),
              addressedTopics: addressedCards.map((c) => c.content),
            };

            const coachingResponse = await generateCoachingSuggestion(coachingInput);
            logCoachingLatency(id, "coaching_generation", coachingStart);

            if (coachingResponse.shouldRespond) {
              const card = await prisma.coachingCard.create({
                data: {
                  sessionId: id,
                  type: coachingResponse.type,
                  priority: coachingResponse.priority,
                  content: coachingResponse.content,
                  context: utterance.text,
                  reference: coachingResponse.reference || null,
                  suggestedQuestion: coachingResponse.suggestedQuestion,
                  status: "active",
                  triggeredByChunkId: chunkId,
                },
              });

              const ablyEvent: AblyCoachingCardEvent = {
                id: card.id,
                type: coachingResponse.type,
                priority: coachingResponse.priority,
                content: coachingResponse.content,
                context: coachingResponse.reference || null,
                reference: coachingResponse.reference || null,
                suggestedQuestion: coachingResponse.suggestedQuestion,
                status: "active",
                createdAt: card.createdAt.toISOString(),
              };

              await publishCoachingCard(id, ablyEvent);
              console.log(`[webhook][${id}] CARD PUBLISHED (${Date.now() - pipelineStart}ms total): ${coachingResponse.type} - ${coachingResponse.content.slice(0, 80)}`);
            } else {
              console.log(`[webhook][${id}] Coaching decided NOT to respond`);
            }
          }
        } catch (error) {
          logCoachingError(id, "coaching_pipeline", error);
        }

        logCoachingLatency(id, "full_pipeline", pipelineStart);
      })();
    }

    return response;
  } catch (error) {
    return handleApiError(error, "process transcript webhook");
  }
}
