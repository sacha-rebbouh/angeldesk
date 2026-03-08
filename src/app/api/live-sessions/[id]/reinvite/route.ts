import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { isValidCuid } from "@/lib/sanitize";
import { createBot, leaveMeeting } from "@/lib/live/recall-client";
import { publishSessionStatus } from "@/lib/live/ably-server";
import { handleApiError } from "@/lib/api-error";

export const maxDuration = 30;

type RouteContext = {
  params: Promise<{ id: string }>;
};

// POST /api/live-sessions/[id]/reinvite — Re-deploy bot to the same meeting
// Use case: bot left (everyone_left_timeout, error, etc.) but the meeting is still going.
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

    // Allow reinvite from any non-terminal status + recently completed/failed
    const REINVITABLE_STATUSES = ["live", "bot_joining", "processing", "failed", "completed"];
    if (!REINVITABLE_STATUSES.includes(session.status)) {
      return NextResponse.json(
        { error: `Cannot reinvite bot from status "${session.status}".` },
        { status: 400 }
      );
    }

    // Time guard: don't allow reinvite on sessions older than 2h (stale meeting)
    const MAX_REINVITE_AGE_MS = 2 * 60 * 60_000; // 2 hours
    const sessionAge = Date.now() - new Date(session.createdAt).getTime();
    if (sessionAge > MAX_REINVITE_AGE_MS) {
      return NextResponse.json(
        { error: "Session trop ancienne pour réinviter le bot. Créez une nouvelle session." },
        { status: 400 }
      );
    }

    // Try to remove the old bot first (best-effort, ignore failures)
    if (session.botId) {
      try {
        await leaveMeeting(session.botId);
      } catch {
        // Bot probably already left — that's the whole point
      }
    }

    // Deploy a new bot with the same config as start route
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const wsRelayUrl = process.env.WS_RELAY_URL;

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

    // Try with video, fallback without
    let bot;
    try {
      bot = await createBot(botConfig);
    } catch (err) {
      if (wsRelayUrl && err instanceof Error && (
        err.message.includes("video_separate_png") ||
        err.message.includes("gallery_view_v2") ||
        err.message.includes("artifact")
      )) {
        console.warn(`[reinvite][${id}] video_separate_png not supported, retrying without`);
        delete recordingConfig.video_separate_png;
        delete recordingConfig.video_mixed_layout;
        recordingConfig.realtime_endpoints = realtimeEndpoints.filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (ep: any) => ep.type !== "websocket"
        );
        bot = await createBot(botConfig);
      } else {
        throw err;
      }
    }

    // Delete any intermediate report generated when the bot left
    // (so the final report after the full session can be generated fresh)
    await prisma.sessionSummary.deleteMany({
      where: { sessionId: id },
    }).catch(() => {});

    // Reset session to bot_joining with new botId
    const updatedSession = await prisma.liveSession.update({
      where: { id },
      data: {
        status: "bot_joining",
        botId: bot.id,
        // Clear endedAt if it was set (session is being resumed)
        endedAt: null,
      },
    });

    console.log(`[reinvite][${id}] New bot ${bot.id} deployed (previous: ${session.botId})`);

    // Publish real-time status event
    try {
      await publishSessionStatus(id, {
        status: "bot_joining",
        message: "Bot is rejoining the meeting...",
      });
    } catch (ablyErr) {
      console.warn(`[reinvite][${id}] Ably publish failed (non-fatal):`, ablyErr);
    }

    return NextResponse.json({ data: updatedSession });
  } catch (error) {
    return handleApiError(error, "reinvite bot to meeting");
  }
}
