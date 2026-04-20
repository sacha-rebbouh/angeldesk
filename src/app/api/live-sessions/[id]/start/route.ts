import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { isValidCuid } from "@/lib/sanitize";
import { createBot } from "@/lib/live/recall-client";
import { publishSessionStatus } from "@/lib/live/ably-server";
import { deductCredits, refundCredits } from "@/services/credits";
import { handleApiError } from "@/lib/api-error";

export const maxDuration = 30;

type RouteContext = {
  params: Promise<{ id: string }>;
};

// POST /api/live-sessions/[id]/start — Deploy bot to meeting
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id } = await context.params;

    if (!isValidCuid(id)) {
      return NextResponse.json(
        { error: "Invalid session ID format" },
        { status: 400 }
      );
    }

    // Verify ownership
    const session = await prisma.liveSession.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    if (session.status !== "created") {
      return NextResponse.json(
        { error: `Session cannot be started from status "${session.status}". Must be "created".` },
        { status: 400 }
      );
    }

    const claim = await prisma.liveSession.updateMany({
      where: {
        id,
        userId: user.id,
        status: "created",
      },
      data: {
        status: "bot_joining",
      },
    });

    if (claim.count === 0) {
      const latest = await prisma.liveSession.findFirst({
        where: {
          id,
          userId: user.id,
        },
        select: { status: true },
      });

      return NextResponse.json(
        { error: `Session cannot be started from status "${latest?.status ?? session.status}". Must be "created".` },
        { status: 409 }
      );
    }

    // Deduct credits for live coaching (8 credits)
    const chargeKey = `live:${id}:${session.updatedAt.getTime()}`;
    const deduction = await deductCredits(user.id, 'LIVE_COACHING', session.dealId ?? undefined, {
      idempotencyKey: chargeKey,
      description: `Live coaching session ${id}`,
    });
    if (!deduction.success) {
      await prisma.liveSession.updateMany({
        where: { id, userId: user.id, status: "bot_joining" },
        data: { status: "created" },
      }).catch(() => undefined);
      return NextResponse.json(
        { error: deduction.error ?? "Crédits insuffisants" },
        { status: 402 }
      );
    }

    // Deploy bot via Recall.ai with Deepgram Nova-3 transcription
    // Deepgram handles multilingual (FR/EN) natively via language:"multi"
    // Recall.ai pipes raw audio to Deepgram — no separate WebSocket needed
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const wsRelayUrl = process.env.WS_RELAY_URL; // e.g. wss://angeldesk-ws-relay.fly.dev

    // Webhook for transcript + participant events (video NOT supported via webhook —
    // Recall docs only list participant_events.* and transcript.* for webhooks)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const realtimeEndpoints: any[] = [
      {
        type: "webhook",
        url: `${appUrl}/api/live-sessions/${id}/webhook`,
        events: [
          "transcript.data",
          "transcript.partial_data",
          "participant_events.join",
          "participant_events.leave",
          "participant_events.screenshare_on",
          "participant_events.screenshare_off",
        ],
      },
    ];

    // WebSocket for video frames — video_separate_png.data is WebSocket-only per Recall docs.
    // CRITICAL: trailing "/" before query params is REQUIRED by Recall to avoid HTTP 400.
    // See: https://docs.recall.ai/docs/real-time-websocket-endpoints
    if (wsRelayUrl) {
      realtimeEndpoints.push({
        type: "websocket",
        url: `${wsRelayUrl}/?sessionId=${id}`,
        events: ["video_separate_png.data"],
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recordingConfig: any = {
      transcript: {
        provider: {
          deepgram_streaming: {
            model: "nova-3",
            language: "multi",
            smart_format: true,
            punctuate: true,
            diarize: true,
          },
        },
      },
      realtime_endpoints: realtimeEndpoints,
    };

    // Enable video_separate_png when WS relay is configured
    // gallery_view_v2 is required by Recall docs for video_separate_png
    if (wsRelayUrl) {
      recordingConfig.video_mixed_layout = "gallery_view_v2";
      recordingConfig.video_separate_png = {};
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const botConfig: any = {
      meeting_url: session.meetingUrl,
      bot_name: "AngelDesk Notes",
      automatic_leave: {
        waiting_room_timeout: 300,   // 5 min — Zoom waiting rooms can be slow
        noone_joined_timeout: 600,   // 10 min — BA/founder may be late
        everyone_left_timeout: 30,   // 30s — brief disconnects shouldn't kill the bot
      },
      recording_config: recordingConfig,
    };

    // Try with video_separate_png, fallback without if Recall rejects it
    const refundKey = `refund:LIVE_COACHING:session:${id}:${crypto.randomUUID()}`;
    let bot;
    try {
      bot = await createBot(botConfig);
    } catch (err) {
      if (wsRelayUrl && err instanceof Error && (
        err.message.includes("video_separate_png") ||
        err.message.includes("gallery_view_v2") ||
        err.message.includes("artifact")
      )) {
        console.warn(`[start][${id}] video_separate_png not supported, retrying without`);
        delete recordingConfig.video_separate_png;
        delete recordingConfig.video_mixed_layout;
        // Remove WS endpoint for video frames
        recordingConfig.realtime_endpoints = realtimeEndpoints.filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (ep: any) => ep.type !== "websocket"
        );
        try {
          bot = await createBot(botConfig);
        } catch (retryErr) {
          // Refund credits — bot deploy failed completely
          await refundCredits(user.id, 'LIVE_COACHING', session.dealId ?? undefined, {
            idempotencyKey: refundKey,
          });
          await prisma.liveSession.updateMany({
            where: { id, userId: user.id, status: "bot_joining" },
            data: { status: "created" },
          }).catch(() => undefined);
          throw retryErr;
        }
      } else {
        // Refund credits — bot deploy failed
        await refundCredits(user.id, 'LIVE_COACHING', session.dealId ?? undefined, {
          idempotencyKey: refundKey,
        });
        await prisma.liveSession.updateMany({
          where: { id, userId: user.id, status: "bot_joining" },
          data: { status: "created" },
        }).catch(() => undefined);
        throw err;
      }
    }

    // Update session status and store bot ID
    const updatedSession = await prisma.liveSession.update({
      where: { id },
      data: {
        status: "bot_joining",
        botId: bot.id,
      },
    });

    // Publish real-time status event (best-effort — DB is source of truth)
    try {
      await publishSessionStatus(id, {
        status: "bot_joining",
        message: "Bot is joining the meeting...",
      });
    } catch (ablyErr) {
      console.warn(`[start][${id}] Ably publish failed (non-fatal):`, ablyErr);
    }

    return NextResponse.json({ data: updatedSession });
  } catch (error) {
    return handleApiError(error, "start live session");
  }
}
