import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { isValidCuid } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const speakerRoleSchema = z.enum([
  "founder",
  "co-founder",
  "ba",
  "investor",
  "lawyer",
  "advisor",
  "other",
]);

const updateParticipantsSchema = z.object({
  participants: z.array(
    z.object({
      name: z.string().min(1, "Participant name is required"),
      role: speakerRoleSchema,
      speakerId: z.string().min(1, "Speaker ID is required"),
    })
  ),
});

// PUT /api/live-sessions/[id]/participants — Update session participants
export async function PUT(request: NextRequest, context: RouteContext) {
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
    const validatedData = updateParticipantsSchema.parse(body);

    const session = await prisma.liveSession.update({
      where: { id },
      data: {
        participants: validatedData.participants,
      },
    });

    return NextResponse.json({ data: session });
  } catch (error) {
    return handleApiError(error, "update session participants");
  }
}
