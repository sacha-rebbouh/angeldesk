import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { classifyUtterance, shouldTriggerCoaching } from "@/lib/live/utterance-router";
import { generateCoachingSuggestion, getTranscriptBuffer } from "@/lib/live/coaching-engine";
import { checkAutoDismiss, markCardsAsAddressed } from "@/lib/live/auto-dismiss";
import { compileDealContextCached, compileContextForColdMode } from "@/lib/live/context-compiler";
import { mapSpeakerToRole } from "@/lib/live/speaker-detector";
import { publishCoachingCard, publishScreenShareState, publishSessionStatus, publishParticipantJoined } from "@/lib/live/ably-server";
import { setScreenShareState } from "@/lib/live/visual-processor";
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
// Per-session webhook rate limiting — prevent cost amplification via flooding
// Max 30 requests per 10 seconds per session (enough for normal Recall.ai cadence)
// ---------------------------------------------------------------------------
const webhookRateLimit = new Map<string, { count: number; resetAt: number }>();
const WEBHOOK_RATE_WINDOW_MS = 10_000;
const WEBHOOK_RATE_MAX = 30;
const WEBHOOK_RATE_MAX_ENTRIES = 500;
const WEBHOOK_RATE_STALE_MS = 5 * 60_000;

function isWebhookRateLimited(sessionId: string): boolean {
  const now = Date.now();
  const entry = webhookRateLimit.get(sessionId);

  // Periodic cleanup
  if (webhookRateLimit.size > WEBHOOK_RATE_MAX_ENTRIES) {
    for (const [key, e] of webhookRateLimit) {
      if (now - e.resetAt > WEBHOOK_RATE_STALE_MS) webhookRateLimit.delete(key);
    }
  }

  if (!entry || now > entry.resetAt) {
    webhookRateLimit.set(sessionId, { count: 1, resetAt: now + WEBHOOK_RATE_WINDOW_MS });
    return false;
  }

  entry.count++;
  if (entry.count > WEBHOOK_RATE_MAX) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Utterance buffer — accumulates micro-chunks from the same speaker before
// triggering the coaching pipeline. Recall.ai sends very granular chunks
// (1-5 words each), which are too small for meaningful classification.
// We buffer until: 8+ words OR 3s gap between chunks OR speaker changes.
// ---------------------------------------------------------------------------
const BUFFER_MIN_WORDS = 5;
const BUFFER_MAX_GAP_MS = 1500;

interface BufferEntry {
  texts: string[];
  speaker: string;
  lastTimestamp: number;
  firstTimestamp: number;
  lastReceivedAt: number;
}

type FlushedUtterance = {
  text: string;
  speaker: string;
  timestampStart: number;
  timestampEnd: number;
};

const utteranceBuffers = new Map<string, BufferEntry>();
const BUFFER_STALE_MS = 5 * 60_000; // 5 min stale threshold
const BUFFER_MAX_ENTRIES = 500;


function flushBuffer(sessionId: string): FlushedUtterance | null {
  const buf = utteranceBuffers.get(sessionId);
  if (!buf || buf.texts.length === 0) return null;
  const result: FlushedUtterance = {
    text: buf.texts.join(" ").trim(),
    speaker: buf.speaker,
    timestampStart: buf.firstTimestamp,
    timestampEnd: buf.lastTimestamp,
  };
  utteranceBuffers.delete(sessionId);
  return result;
}

// ---------------------------------------------------------------------------
// Pipeline: process a flushed utterance (classify → auto-dismiss → coaching)
// ---------------------------------------------------------------------------

async function processUtterance(
  id: string,
  utterance: FlushedUtterance
): Promise<void> {
  // Re-fetch session to get latest state
  const session = await prisma.liveSession.findFirst({
    where: { id, status: { in: ["live", "bot_joining"] } },
  });
  if (!session) {
    return;
  }
  const participants = (session.participants as Participant[] | null) ?? [];
  const uttSpeakerRole = mapSpeakerToRole(utterance.speaker, participants);
  const pipelineStart = Date.now();
  logSessionEvent(id, "pipeline_start", {
    speaker: utterance.speaker,
    speakerRole: uttSpeakerRole,
    words: utterance.text.split(/\s+/).length,
  });

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
    console.log(
      `[webhook][${id}] CLASSIFIED (${Date.now() - pipelineStart}ms): "${utterance.text.slice(0, 80)}" → ${classification}`
    );
  } catch (error) {
    logCoachingError(id, "classify_utterance", error);
  }

  // 2. Auto-dismiss check
  try {
    if (
      (uttSpeakerRole === "ba" || uttSpeakerRole === "investor") &&
      classification !== "filler" &&
      classification !== "small_talk"
    ) {
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

      const [transcriptBuffer, previousCards, addressedCards, dealContext] = await Promise.all([
        getTranscriptBuffer(id, 5),
        prisma.coachingCard.findMany({
          where: { sessionId: id },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
        prisma.coachingCard.findMany({
          where: { sessionId: id, status: "addressed" },
          select: { content: true },
        }),
        session.dealId
          ? compileDealContextCached(session.dealId)
          : Promise.resolve(compileContextForColdMode()),
      ]);

      const coachingInput: CoachingInput = {
        dealContext,
        sessionId: id,
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
          context: utterance.text,
          reference: coachingResponse.reference || null,
          suggestedQuestion: coachingResponse.suggestedQuestion,
          status: "active",
          createdAt: card.createdAt.toISOString(),
        };

        await publishCoachingCard(id, ablyEvent);
        console.log(
          `[webhook][${id}] CARD PUBLISHED (${Date.now() - pipelineStart}ms total): ${coachingResponse.type} - ${coachingResponse.content.slice(0, 80)}`
        );
      } else {
        console.log(`[webhook][${id}] Coaching decided NOT to respond`);
      }
    }
  } catch (error) {
    logCoachingError(id, "coaching_pipeline", error);
  }

  logCoachingLatency(id, "full_pipeline", pipelineStart);
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

    // ── Rate limiting ──
    if (isWebhookRateLimited(id)) {
      return NextResponse.json({ ok: true, skipped: "rate_limited" });
    }

    // ── Parse body ──
    const rawBody = await request.text();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // Log every webhook call for debugging
    console.log(
      `[webhook][${id}] event=${body.event ?? "unknown"} speaker=${body.data?.data?.participant?.name ?? "?"} words=${body.data?.data?.words?.length ?? 0}`
    );

    // ── Participant join/leave events ──
    if (body.event === "participant_events.join") {
      const participantName = body.data?.data?.participant?.name ?? null;
      if (participantName) {
        console.log(`[webhook][${id}] PARTICIPANT JOINED (event): ${participantName}`);

        // Use participant join as an early signal to auto-promote bot_joining → live
        const sessionForPromo = await prisma.liveSession.findFirst({
          where: { id, status: "bot_joining" },
          select: { id: true, startedAt: true },
        });
        if (sessionForPromo) {
          const promoted = await prisma.liveSession.updateMany({
            where: { id, status: "bot_joining" },
            data: { status: "live", startedAt: sessionForPromo.startedAt ?? new Date() },
          });
          if (promoted.count > 0) {
            console.log(`[webhook][${id}] AUTO-PROMOTE via participant.join: bot_joining → live`);
            try {
              await publishSessionStatus(id, {
                status: "live",
                message: "Bot has joined. Live coaching active.",
              });
            } catch (err) {
              console.warn(`[webhook][${id}] Ably publish failed:`, err);
            }
          }
        }

        // Add participant to session
        const session = await prisma.liveSession.findFirst({
          where: { id, status: { in: ["live", "bot_joining"] } },
          select: { id: true, participants: true },
        });
        if (session) {
          const participants = (session.participants as Participant[] | null) ?? [];
          if (!participants.some((p) => p.name === participantName)) {
            const updated = [
              ...participants,
              {
                name: participantName,
                role: "other" as SpeakerRole,
                speakerId: `spk_${participantName.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
              },
            ];
            await prisma.liveSession.updateMany({
              where: { id, status: { in: ["live", "bot_joining"] } },
              data: { participants: updated as unknown as Prisma.JsonArray },
            }).catch(() => {});
            try {
              const { publishParticipantJoined } = await import("@/lib/live/ably-server");
              await publishParticipantJoined(id, { name: participantName, role: "other" });
            } catch (err) {
              console.warn(`[webhook][${id}] Ably participant publish failed:`, err);
            }
          }
        }
      }
      return NextResponse.json({ ok: true });
    }

    if (body.event === "participant_events.leave") {
      const participantName = body.data?.data?.participant?.name ?? null;
      if (participantName) {
        console.log(`[webhook][${id}] PARTICIPANT LEFT (event): ${participantName}`);

        // Check if all human participants have left → auto-stop session
        // Bot name is "AngelDesk Notes" — exclude it from the count
        const BOT_NAME = "AngelDesk Notes";
        if (participantName !== BOT_NAME) {
          const session = await prisma.liveSession.findFirst({
            where: { id, status: { in: ["live", "bot_joining"] } },
            select: { id: true, botId: true, participants: true },
          });

          if (session) {
            const participants = (session.participants as Participant[] | null) ?? [];
            // Remove the leaving participant from the list
            const remaining = participants.filter(
              (p) => p.name !== participantName && p.name !== BOT_NAME
            );

            // Update participants in DB (remove the one who left)
            const updatedParticipants = participants.filter(
              (p) => p.name !== participantName
            );
            await prisma.liveSession.updateMany({
              where: { id, status: { in: ["live", "bot_joining"] } },
              data: { participants: updatedParticipants as unknown as Prisma.JsonArray },
            }).catch(() => {});

            // Publish leave event
            try {
              const { publishParticipantLeft } = await import("@/lib/live/ably-server");
              await publishParticipantLeft(id, { name: participantName });
            } catch (err) {
              console.warn(`[webhook][${id}] Ably participant leave publish failed:`, err);
            }

            // If no human participants remain, auto-stop the session
            if (remaining.length === 0 && participants.length > 1) {
              console.log(`[webhook][${id}] ALL HUMAN PARTICIPANTS LEFT — auto-stopping session`);

              // Ask bot to leave
              if (session.botId) {
                try {
                  const { leaveMeeting } = await import("@/lib/live/recall-client");
                  await leaveMeeting(session.botId);
                } catch (err) {
                  console.warn(`[webhook][${id}] leaveMeeting failed:`, err instanceof Error ? err.message : err);
                }
              }

              // Atomic transition to processing
              const stopResult = await prisma.liveSession.updateMany({
                where: { id, status: { in: ["live", "bot_joining"] } },
                data: { status: "processing", endedAt: new Date() },
              });

              if (stopResult.count > 0) {
                try {
                  await publishSessionStatus(id, {
                    status: "processing",
                    message: "All participants left. Generating post-call report...",
                  });
                } catch (err) {
                  console.warn(`[webhook][${id}] Ably publish failed:`, err);
                }

                // Generate post-call report
                after(async () => {
                  try {
                    const { generateAndSavePostCallReport } = await import("@/lib/live/post-call-generator");
                    await generateAndSavePostCallReport(id);
                  } catch (err) {
                    logCoachingError(id, "auto_stop_report", err);
                  }
                });
              }
            }
          }
        }
      }
      return NextResponse.json({ ok: true });
    }

    // ── Screen share events ──
    if (body.event === "participant_events.screenshare_on") {
      setScreenShareState(id, true);
      const participantName = body.data?.data?.participant?.name ?? null;
      console.log(`[webhook][${id}] SCREENSHARE ON: ${participantName}`);
      await Promise.all([
        publishScreenShareState(id, { state: "active", participantName }).catch((err) => {
          console.warn(`[webhook][${id}] Ably screenshare publish failed:`, err);
        }),
        prisma.liveSession
          .updateMany({ where: { id, status: { in: ["live", "bot_joining"] } }, data: { screenShareActive: true } })
          .catch((err) => {
            console.warn(`[webhook][${id}] DB screenshare update failed:`, err);
          }),
      ]);
      return NextResponse.json({ ok: true });
    }

    if (body.event === "participant_events.screenshare_off") {
      setScreenShareState(id, false);
      console.log(`[webhook][${id}] SCREENSHARE OFF`);
      await Promise.all([
        publishScreenShareState(id, { state: "inactive", participantName: null }).catch((err) => {
          console.warn(`[webhook][${id}] Ably screenshare publish failed:`, err);
        }),
        prisma.liveSession
          .updateMany({ where: { id, status: { in: ["live", "bot_joining"] } }, data: { screenShareActive: false } })
          .catch((err) => {
            console.warn(`[webhook][${id}] DB screenshare update failed:`, err);
          }),
      ]);
      return NextResponse.json({ ok: true });
    }

    // Partial transcripts — use for fast auto-promote only (not coaching pipeline)
    if (body.event === "transcript.partial_data") {
      const sessionForPromo = await prisma.liveSession.findFirst({
        where: { id, status: "bot_joining" },
        select: { id: true, startedAt: true },
      });
      if (sessionForPromo) {
        const promoted = await prisma.liveSession.updateMany({
          where: { id, status: "bot_joining" },
          data: { status: "live", startedAt: sessionForPromo.startedAt ?? new Date() },
        });
        if (promoted.count > 0) {
          console.log(
            `[webhook][${id}] AUTO-PROMOTE via partial_data: bot_joining → live`
          );
          try {
            await publishSessionStatus(id, {
              status: "live",
              message: "Bot has joined. Live coaching active.",
            });
          } catch (err) {
            console.warn(`[webhook][${id}] Ably publish failed:`, err);
          }
        }
      }
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
      return NextResponse.json({ ok: true });
    }

    // ── Max session duration guard (2h cap to prevent unbounded LLM cost) ──
    const MAX_SESSION_DURATION_MS = 2 * 60 * 60_000; // 2 hours
    if (session.startedAt && Date.now() - session.startedAt.getTime() > MAX_SESSION_DURATION_MS) {
      console.warn(`[webhook][${id}] Session exceeded 2h limit, auto-stopping`);
      const stopResult = await prisma.liveSession.updateMany({
        where: { id, status: { in: ["live", "bot_joining"] } },
        data: { status: "processing", endedAt: new Date() },
      });
      // Only trigger report generation if the status transition succeeded
      if (stopResult.count > 0) {
        after(async () => {
          try {
            const { generateAndSavePostCallReport } = await import("@/lib/live/post-call-generator");
            await generateAndSavePostCallReport(id);
          } catch (err) {
            logCoachingError(id, "auto_stop_report", err);
          }
        });
      }
      return NextResponse.json({ ok: true });
    }

    // ── Auto-promote bot_joining → live if we're receiving transcripts ──
    if (session.status === "bot_joining") {
      // Atomic transition: only promote if still bot_joining (prevents multiple Ably publishes)
      const promoted = await prisma.liveSession.updateMany({
        where: { id, status: "bot_joining" },
        data: { status: "live", startedAt: session.startedAt ?? new Date() },
      });
      if (promoted.count > 0) {
        console.log(
          `[webhook][${id}] AUTO-PROMOTE: bot_joining → live (transcript received from "${speaker}")`
        );
        try {
          await publishSessionStatus(id, {
            status: "live",
            message: "Bot has joined. Live coaching active.",
          });
        } catch (err) {
          console.warn(`[webhook][${id}] Ably publish failed:`, err);
        }
      }
    }

    // ── Auto-populate participants from transcript speaker names ──
    let participants = (session.participants as Participant[] | null) ?? [];
    const speakerAlreadyKnown = participants.some(
      (p) => p.name === speaker || p.speakerId === speaker
    );

    if (!speakerAlreadyKnown && speaker !== "Unknown") {
      const newParticipant: Participant = {
        name: speaker,
        role: "other",
        speakerId: `spk_${speaker.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
      };
      const updatedParticipants = [...participants, newParticipant];

      // Update DB (only if still live/bot_joining)
      try {
        await prisma.liveSession.updateMany({
          where: { id, status: { in: ["live", "bot_joining"] } },
          data: { participants: updatedParticipants as unknown as Prisma.JsonArray },
        });
        participants = updatedParticipants;

        // Publish Ably event for real-time UI update
        try {
          await publishParticipantJoined(id, { name: speaker, role: "other" });
        } catch (err) {
          console.warn(`[webhook][${id}] Ably participant publish failed:`, err);
        }

        console.log(`[webhook][${id}] NEW PARTICIPANT: "${speaker}" added to session (total: ${updatedParticipants.length})`);
      } catch (err) {
        console.warn(`[webhook][${id}] Failed to add participant "${speaker}":`, err);
      }
    }

    // ── Determine speaker role from participants ──
    mapSpeakerToRole(speaker, participants);

    // ── Buffer micro-chunks into meaningful utterances ──
    // Collect all utterances to flush (may be multiple if speaker changes AND word threshold met)
    const toProcess: FlushedUtterance[] = [];

    const now = Date.now();

    // Periodic cleanup of stale buffer entries (sessions that ended abruptly)
    if (utteranceBuffers.size > BUFFER_MAX_ENTRIES) {
      for (const [key, entry] of utteranceBuffers) {
        if (now - entry.lastReceivedAt > BUFFER_STALE_MS) {
          utteranceBuffers.delete(key);
        }
      }
    }

    const existing = utteranceBuffers.get(id);

    // Flush on speaker change or time gap
    if (
      existing &&
      (existing.speaker !== speaker || now - existing.lastReceivedAt > BUFFER_MAX_GAP_MS)
    ) {
      const flushed = flushBuffer(id);
      if (flushed) toProcess.push(flushed);
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
    const totalWords = buf.texts
      .join(" ")
      .split(/\s+/)
      .filter(Boolean).length;
    if (totalWords >= BUFFER_MIN_WORDS) {
      const flushed = flushBuffer(id);
      if (flushed) toProcess.push(flushed);
    }

    // ── Process flushed utterances inline (LLM calls need full runtime context) ──
    if (toProcess.length > 0) {
      for (const utterance of toProcess) {
        console.log(
          `[webhook][${id}] BUFFER FLUSHED: ${utterance.text.split(/\s+/).length} words from "${utterance.speaker}": "${utterance.text.slice(0, 100)}"`
        );
      }

      await Promise.allSettled(
        toProcess.map((utterance) =>
          processUtterance(id, utterance).catch((error) => {
            logCoachingError(id, "process_utterance", error);
          })
        )
      );
    }

    // Note: Visual analysis of screen shares is handled by the WS relay (Fly.io)
    // which receives video_separate_png.data frames and POSTs them to /visual-frame

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "process transcript webhook");
  }
}
