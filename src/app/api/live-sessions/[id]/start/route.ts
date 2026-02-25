import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { isValidCuid } from "@/lib/sanitize";
import { createBot } from "@/lib/live/recall-client";
import { publishSessionStatus } from "@/lib/live/ably-server";
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

    // Deploy bot via Recall.ai with Deepgram Nova-3 transcription
    // Deepgram handles multilingual (FR/EN) natively via language:"multi"
    // Recall.ai pipes raw audio to Deepgram — no separate WebSocket needed
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const language = session.language ?? "fr";
    const bot = await createBot({
      meeting_url: session.meetingUrl,
      bot_name: "AngelDesk Notes",
      automatic_leave: {
        waiting_room_timeout: 120,
        noone_joined_timeout: 300,
        everyone_left_timeout: 10,
      },
      recording_config: {
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
        realtime_endpoints: [
          {
            type: "webhook",
            url: `${appUrl}/api/live-sessions/${id}/webhook`,
            events: ["transcript.data", "transcript.partial_data"],
          },
        ],
      },
    });

    // Update session status and store bot ID
    const updatedSession = await prisma.liveSession.update({
      where: { id },
      data: {
        status: "bot_joining",
        botId: bot.id,
      },
    });

    // Publish real-time status event
    await publishSessionStatus(id, {
      status: "bot_joining",
      message: "Bot is joining the meeting...",
    });

    return NextResponse.json({ data: updatedSession });
  } catch (error) {
    return handleApiError(error, "start live session");
  }
}
