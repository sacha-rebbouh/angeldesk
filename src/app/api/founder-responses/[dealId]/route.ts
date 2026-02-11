import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { isValidCuid } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";

// ============================================================================
// RATE LIMITING (with bounded Map to prevent memory exhaustion)
// ============================================================================

const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 20; // 20 requests per minute (less than facts as it's heavier)
const MAX_RATE_LIMIT_ENTRIES = 10000; // Prevent unbounded growth
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function lazyCleanup(now: number): void {
  // Only cleanup if map is getting large
  if (requestCounts.size <= MAX_RATE_LIMIT_ENTRIES * 0.8) return;

  // Remove expired entries
  for (const [key, record] of requestCounts) {
    if (now > record.resetAt) {
      requestCounts.delete(key);
    }
  }

  // If still too large, remove oldest 20%
  if (requestCounts.size > MAX_RATE_LIMIT_ENTRIES * 0.8) {
    const entries = Array.from(requestCounts.entries())
      .sort((a, b) => a[1].resetAt - b[1].resetAt);
    const toRemove = Math.floor(entries.length * 0.2);
    for (let i = 0; i < toRemove; i++) {
      requestCounts.delete(entries[i][0]);
    }
  }
}

function checkRateLimit(identifier: string): boolean {
  const now = Date.now();

  // Lazy cleanup to prevent memory exhaustion
  lazyCleanup(now);

  const record = requestCounts.get(identifier);

  if (!record || now > record.resetAt) {
    requestCounts.set(identifier, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }

  record.count++;
  return true;
}

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

    // Rate limiting
    const rateLimitKey = `founder-responses:${user.id}`;
    if (!checkRateLimit(rateLimitKey)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    const { dealId } = await params;

    // Validate dealId format using standard CUID validation
    // CUIDs are 25 chars starting with 'c', e.g., 'cljrxyz123456789012345678'
    if (!isValidCuid(dealId)) {
      return NextResponse.json(
        { error: "Invalid deal ID format" },
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
    return handleApiError(error, "fetch founder responses");
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

    // Rate limiting
    const rateLimitKey = `founder-responses:${user.id}`;
    if (!checkRateLimit(rateLimitKey)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    const { dealId } = await params;
    const body = await request.json();

    // Validate dealId format using standard CUID validation
    // CUIDs are 25 chars starting with 'c', e.g., 'cljrxyz123456789012345678'
    if (!isValidCuid(dealId)) {
      return NextResponse.json(
        { error: "Invalid deal ID format" },
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

    // Process responses in a transaction with batched operations (avoid N+1)
    const result = await prisma.$transaction(async (tx) => {
      // Collect all questionIds including free notes if present
      const allFactKeys = responses.map(r => r.questionId);
      if (freeNotes && freeNotes.trim().length > 0) {
        allFactKeys.push('founder.free_notes');
      }

      // BATCH FETCH: Get all existing facts for these questionIds in one query
      const existingFacts = await tx.factEvent.findMany({
        where: {
          dealId,
          factKey: { in: allFactKeys },
          source: 'FOUNDER_RESPONSE',
          eventType: { notIn: ['DELETED', 'SUPERSEDED'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Build a map of factKey -> most recent fact
      const existingFactsByKey = new Map<string, typeof existingFacts[0]>();
      for (const fact of existingFacts) {
        if (!existingFactsByKey.has(fact.factKey)) {
          existingFactsByKey.set(fact.factKey, fact);
        }
      }

      // BATCH UPDATE: Supersede all existing facts at once
      const idsToSupersede = Array.from(existingFactsByKey.values()).map(f => f.id);
      if (idsToSupersede.length > 0) {
        await tx.factEvent.updateMany({
          where: { id: { in: idsToSupersede } },
          data: { eventType: 'SUPERSEDED' },
        });
      }

      // Prepare data for batch create
      const validCategories = ['FINANCIAL', 'TEAM', 'MARKET', 'PRODUCT', 'LEGAL', 'COMPETITION', 'TRACTION'];
      const factsToCreate = responses.map(response => {
        const categoryFromKey = response.questionId.split('.')[0]?.toUpperCase();
        const category = validCategories.includes(categoryFromKey) ? categoryFromKey : 'OTHER';
        const existingFact = existingFactsByKey.get(response.questionId);

        return {
          dealId,
          factKey: response.questionId,
          category,
          value: response.answer,
          displayValue: response.answer,
          source: 'FOUNDER_RESPONSE' as const,
          sourceConfidence: 60, // DECLARED — reponse fondateur non verifiee (F26)
          eventType: 'CREATED' as const,
          supersedesEventId: existingFact?.id ?? null,
          createdBy: 'system',
          reason: 'Founder response submitted',
        };
      });

      // Add free notes to batch if provided
      let hasFreeNotes = false;
      if (freeNotes && freeNotes.trim().length > 0) {
        hasFreeNotes = true;
        const existingNotes = existingFactsByKey.get('founder.free_notes');
        factsToCreate.push({
          dealId,
          factKey: 'founder.free_notes',
          category: 'OTHER',
          value: freeNotes,
          displayValue: freeNotes,
          source: 'FOUNDER_RESPONSE' as const,
          sourceConfidence: 60, // DECLARED — reponse fondateur non verifiee (F26)
          eventType: 'CREATED' as const,
          supersedesEventId: existingNotes?.id ?? null,
          createdBy: 'system',
          reason: 'Founder free notes submitted',
        });
      }

      // BATCH CREATE: Create all facts at once
      await tx.factEvent.createMany({ data: factsToCreate });

      // Fetch created facts to get their IDs and timestamps
      const createdFacts = await tx.factEvent.findMany({
        where: {
          dealId,
          factKey: { in: allFactKeys },
          source: 'FOUNDER_RESPONSE',
          eventType: 'CREATED',
          reason: { in: ['Founder response submitted', 'Founder free notes submitted'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Build result from created facts
      const responseResults = createdFacts
        .filter(f => f.factKey !== 'founder.free_notes')
        .map(f => ({
          id: f.id,
          questionId: f.factKey,
          answer: f.displayValue,
          category: f.category,
          createdAt: f.createdAt,
        }));

      // Extract free notes result if created
      let freeNotesResult = null;
      if (hasFreeNotes) {
        const notesFact = createdFacts.find(f => f.factKey === 'founder.free_notes');
        if (notesFact) {
          freeNotesResult = {
            id: notesFact.id,
            content: notesFact.displayValue,
            createdAt: notesFact.createdAt,
          };
        }
      }

      return {
        responses: responseResults,
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
    return handleApiError(error, "submit founder responses");
  }
}
