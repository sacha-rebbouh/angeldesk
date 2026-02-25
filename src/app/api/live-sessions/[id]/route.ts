import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { isValidCuid } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const updateSessionSchema = z.object({
  language: z.string().optional(),
  llmModel: z.enum(["claude-sonnet-4-5", "claude-sonnet-4-6", "claude-haiku-4-5"]).optional(),
  participants: z
    .array(
      z.object({
        name: z.string().min(1),
        role: z.string(),
        speakerId: z.string(),
      })
    )
    .optional(),
});

// GET /api/live-sessions/[id] — Get session detail
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id } = await context.params;

    if (!isValidCuid(id)) {
      return NextResponse.json(
        { error: "Invalid session ID format" },
        { status: 400 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const includeTranscript = searchParams.get("includeTranscript") === "true";

    const session = await prisma.liveSession.findFirst({
      where: {
        id,
        userId: user.id,
      },
      include: {
        ...(includeTranscript && {
          transcriptChunks: {
            orderBy: { timestampStart: "asc" as const },
          },
        }),
        coachingCards: {
          orderBy: { createdAt: "desc" as const },
        },
        summary: true,
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: session });
  } catch (error) {
    return handleApiError(error, "fetch live session");
  }
}

// PATCH /api/live-sessions/[id] — Update session
export async function PATCH(request: NextRequest, context: RouteContext) {
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
    const existingSession = await prisma.liveSession.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });

    if (!existingSession) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validatedData = updateSessionSchema.parse(body);

    const session = await prisma.liveSession.update({
      where: { id },
      data: {
        ...(validatedData.language !== undefined && {
          language: validatedData.language,
        }),
        ...(validatedData.llmModel !== undefined && {
          llmModel: validatedData.llmModel,
        }),
        ...(validatedData.participants !== undefined && {
          participants: validatedData.participants,
        }),
      },
      include: {
        coachingCards: {
          orderBy: { createdAt: "desc" as const },
        },
        summary: true,
      },
    });

    return NextResponse.json({ data: session });
  } catch (error) {
    return handleApiError(error, "update live session");
  }
}
