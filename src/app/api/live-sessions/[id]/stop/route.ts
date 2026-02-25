import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { isValidCuid } from "@/lib/sanitize";
import { leaveMeeting } from "@/lib/live/recall-client";
import { publishSessionStatus } from "@/lib/live/ably-server";
import { handleApiError } from "@/lib/api-error";

export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ id: string }>;
};

// POST /api/live-sessions/[id]/stop — Stop session and trigger post-call report
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

    if (session.status !== "live" && session.status !== "bot_joining") {
      return NextResponse.json(
        {
          error: `Session cannot be stopped from status "${session.status}". Must be "live" or "bot_joining".`,
        },
        { status: 400 }
      );
    }

    // Ask bot to leave the meeting (if botId exists)
    // Gracefully handle 404 (bot already left or was on wrong region)
    if (session.botId) {
      try {
        await leaveMeeting(session.botId);
      } catch (err) {
        console.warn(`[stop] leaveMeeting failed for bot ${session.botId}:`, err instanceof Error ? err.message : err);
      }
    }

    // Update session status
    const updatedSession = await prisma.liveSession.update({
      where: { id },
      data: {
        status: "processing",
        endedAt: new Date(),
      },
    });

    // Publish real-time status event
    await publishSessionStatus(id, {
      status: "processing",
      message: "Session ended. Generating post-call report...",
    });

    // Fire-and-forget: generate and save post-call report
    try {
      import("@/lib/live/post-call-generator").then((mod) => {
        mod.generateAndSavePostCallReport(id).catch((err: unknown) => {
          console.error(`[stop] Post-call report failed for session ${id}:`, err);
        });
      });
    } catch (err) {
      console.error(`[stop] Failed to import post-call-generator for session ${id}:`, err);
    }

    return NextResponse.json({ data: updatedSession });
  } catch (error) {
    return handleApiError(error, "stop live session");
  }
}
