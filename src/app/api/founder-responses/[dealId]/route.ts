import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const responseItemSchema = z.object({
  questionId: z.string().min(1, "questionId is required"),
  answer: z.string().min(1, "answer is required"),
});

const submitResponsesSchema = z.object({
  responses: z.array(responseItemSchema).min(1, "At least one response is required"),
  freeNotes: z.string().optional(),
});

// ============================================================================
// GET /api/founder-responses/[dealId] - List existing responses
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  try {
    const user = await requireAuth();
    const { dealId } = await params;

    // Validate dealId format
    if (!dealId || dealId.length < 10) {
      return NextResponse.json(
        { error: "Invalid deal ID" },
        { status: 400 }
      );
    }

    // Verify deal ownership
    const deal = await prisma.deal.findFirst({
      where: {
        id: dealId,
        userId: user.id,
      },
    });

    if (!deal) {
      return NextResponse.json(
        { error: "Deal not found or access denied" },
        { status: 404 }
      );
    }

    // Get founder response facts from FactEvent
    // Founder responses are stored as FOUNDER_RESPONSE source
    const founderFacts = await prisma.factEvent.findMany({
      where: {
        dealId,
        source: 'FOUNDER_RESPONSE',
        eventType: {
          notIn: ['DELETED', 'SUPERSEDED'],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Group by factKey to get latest response for each question
    const responsesByKey = new Map<string, typeof founderFacts[0]>();
    for (const fact of founderFacts) {
      if (!responsesByKey.has(fact.factKey)) {
        responsesByKey.set(fact.factKey, fact);
      }
    }

    // Format responses
    const responses = Array.from(responsesByKey.values()).map((fact) => ({
      id: fact.id,
      questionId: fact.factKey,
      answer: fact.displayValue,
      value: fact.value,
      category: fact.category,
      confidence: fact.sourceConfidence,
      createdAt: fact.createdAt.toISOString(),
      reason: fact.reason,
    }));

    // Get free notes (stored as a special factKey)
    const freeNotesFact = founderFacts.find(
      (f) => f.factKey === 'founder.free_notes'
    );

    return NextResponse.json({
      data: {
        dealId,
        responsesCount: responses.length,
        responses,
        freeNotes: freeNotesFact ? {
          content: freeNotesFact.displayValue,
          createdAt: freeNotesFact.createdAt.toISOString(),
        } : null,
      },
    });
  } catch (error) {
    console.error("Error fetching founder responses:", error);
    return NextResponse.json(
      { error: "Failed to fetch founder responses" },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST /api/founder-responses/[dealId] - Submit founder responses
// ============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  try {
    const user = await requireAuth();
    const { dealId } = await params;
    const body = await request.json();

    // Validate dealId format
    if (!dealId || dealId.length < 10) {
      return NextResponse.json(
        { error: "Invalid deal ID" },
        { status: 400 }
      );
    }

    // Validate body
    const parseResult = submitResponsesSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation error", details: parseResult.error.issues },
        { status: 400 }
      );
    }

    const { responses, freeNotes } = parseResult.data;

    // Verify deal ownership
    const deal = await prisma.deal.findFirst({
      where: {
        id: dealId,
        userId: user.id,
      },
    });

    if (!deal) {
      return NextResponse.json(
        { error: "Deal not found or access denied" },
        { status: 404 }
      );
    }

    // Process responses in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const createdFacts: Array<{
        id: string;
        questionId: string;
        answer: string;
        category: string;
        createdAt: Date;
      }> = [];

      // For each response, supersede existing and create new
      for (const response of responses) {
        // Find existing response for this question
        const existingFact = await tx.factEvent.findFirst({
          where: {
            dealId,
            factKey: response.questionId,
            source: 'FOUNDER_RESPONSE',
            eventType: {
              notIn: ['DELETED', 'SUPERSEDED'],
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        });

        // Supersede existing if present
        if (existingFact) {
          await tx.factEvent.update({
            where: { id: existingFact.id },
            data: { eventType: 'SUPERSEDED' },
          });
        }

        // Determine category from questionId
        // Format: "category.subcategory" or just use OTHER
        const categoryFromKey = response.questionId.split('.')[0]?.toUpperCase();
        const validCategories = ['FINANCIAL', 'TEAM', 'MARKET', 'PRODUCT', 'LEGAL', 'COMPETITION', 'TRACTION'];
        const category = validCategories.includes(categoryFromKey) ? categoryFromKey : 'OTHER';

        // Create new fact event
        const newFact = await tx.factEvent.create({
          data: {
            dealId,
            factKey: response.questionId,
            category,
            value: response.answer,
            displayValue: response.answer,
            source: 'FOUNDER_RESPONSE',
            sourceConfidence: 90, // Founder responses have high confidence
            eventType: 'CREATED',
            supersedesEventId: existingFact?.id,
            createdBy: 'system',
            reason: 'Founder response submitted',
          },
        });

        createdFacts.push({
          id: newFact.id,
          questionId: newFact.factKey,
          answer: newFact.displayValue,
          category: newFact.category,
          createdAt: newFact.createdAt,
        });
      }

      // Handle free notes if provided
      let freeNotesResult = null;
      if (freeNotes && freeNotes.trim().length > 0) {
        // Find existing free notes
        const existingNotes = await tx.factEvent.findFirst({
          where: {
            dealId,
            factKey: 'founder.free_notes',
            source: 'FOUNDER_RESPONSE',
            eventType: {
              notIn: ['DELETED', 'SUPERSEDED'],
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        });

        // Supersede existing if present
        if (existingNotes) {
          await tx.factEvent.update({
            where: { id: existingNotes.id },
            data: { eventType: 'SUPERSEDED' },
          });
        }

        // Create new free notes fact
        const notesFact = await tx.factEvent.create({
          data: {
            dealId,
            factKey: 'founder.free_notes',
            category: 'OTHER',
            value: freeNotes,
            displayValue: freeNotes,
            source: 'FOUNDER_RESPONSE',
            sourceConfidence: 90,
            eventType: 'CREATED',
            supersedesEventId: existingNotes?.id,
            createdBy: 'system',
            reason: 'Founder free notes submitted',
          },
        });

        freeNotesResult = {
          id: notesFact.id,
          content: notesFact.displayValue,
          createdAt: notesFact.createdAt,
        };
      }

      return {
        responses: createdFacts,
        freeNotes: freeNotesResult,
      };
    });

    return NextResponse.json({
      data: {
        dealId,
        responsesSubmitted: result.responses.length,
        responses: result.responses.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
        })),
        freeNotes: result.freeNotes ? {
          ...result.freeNotes,
          createdAt: result.freeNotes.createdAt.toISOString(),
        } : null,
      },
    });
  } catch (error) {
    console.error("Error submitting founder responses:", error);
    return NextResponse.json(
      { error: "Failed to submit founder responses" },
      { status: 500 }
    );
  }
}
