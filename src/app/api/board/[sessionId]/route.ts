import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cuidSchema } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

/**
 * GET /api/board/[sessionId]
 * Get a specific board session with all its data
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireAuth();
    const { sessionId: rawSessionId } = await params;

    // Validate sessionId format
    const parseResult = cuidSchema.safeParse(rawSessionId);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "ID de session invalide" },
        { status: 400 }
      );
    }
    const sessionId = parseResult.data;

    const session = await prisma.aIBoardSession.findFirst({
      where: {
        id: sessionId,
        userId: user.id,
      },
      include: {
        members: true,
        rounds: {
          orderBy: { roundNumber: "asc" },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Session non trouvee" },
        { status: 404 }
      );
    }

    // Format response
    const response = {
      id: session.id,
      dealId: session.dealId,
      status: session.status,
      verdict: session.verdict,
      consensusLevel: session.consensusLevel,
      stoppingReason: session.stoppingReason,

      // Votes from members
      votes: session.members.map((member) => ({
        memberId: member.id,
        modelId: member.modelId,
        memberName: member.modelName,
        color: member.color,
        initialAnalysis: member.initialAnalysis,
        finalVote: member.finalVote,
        finalConfidence: member.finalConfidence,
        justification: member.voteJustification,
        totalCost: member.totalCost?.toString(),
      })),

      // Debate rounds
      rounds: session.rounds.map((round) => ({
        roundNumber: round.roundNumber,
        roundType: round.roundType,
        responses: round.responses,
        currentVerdicts: round.currentVerdicts,
        consensusReached: round.consensusReached,
        majorityStable: round.majorityStable,
      })),

      // Summary
      consensusPoints: session.consensusPoints,
      frictionPoints: session.frictionPoints,
      questionsForFounder: session.questionsForFounder,

      // Metadata
      totalRounds: session.totalRounds,
      totalCost: session.totalCost?.toString(),
      totalTimeMs: session.totalTimeMs,
      startedAt: session.startedAt?.toISOString(),
      completedAt: session.completedAt?.toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Get board session error:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/board/[sessionId]/stop
 * Stop a running board session
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireAuth();
    const { sessionId: rawSessionId } = await params;

    // Validate sessionId format
    const parseResult = cuidSchema.safeParse(rawSessionId);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "ID de session invalide" },
        { status: 400 }
      );
    }
    const sessionId = parseResult.data;

    // Verify session exists and belongs to user
    const session = await prisma.aIBoardSession.findFirst({
      where: {
        id: sessionId,
        userId: user.id,
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Session non trouvee" },
        { status: 404 }
      );
    }

    // Only can stop if in progress
    if (!["INITIALIZING", "ANALYZING", "DEBATING", "VOTING"].includes(session.status)) {
      return NextResponse.json(
        { error: "Session ne peut pas etre arretee (deja terminee)" },
        { status: 400 }
      );
    }

    // Update session status
    await prisma.aIBoardSession.update({
      where: { id: sessionId },
      data: {
        status: "STOPPED",
        stoppingReason: "manual_stop",
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Session arretee",
    });
  } catch (error) {
    console.error("Stop board session error:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
