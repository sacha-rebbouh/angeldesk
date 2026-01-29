import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import type { Prisma } from "@prisma/client";

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const resolveSchema = z.object({
  reviewId: z.string().min(1, "reviewId is required"),
  decision: z.enum(["ACCEPT_NEW", "KEEP_EXISTING", "OVERRIDE"]),
  overrideValue: z.unknown().optional(),
  overrideDisplayValue: z.string().optional(),
  reason: z.string().min(1, "reason is required"),
});

// ============================================================================
// GET /api/facts/[dealId]/reviews - List pending reviews for a deal
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
      where: { id: dealId, userId: user.id },
    });
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    // Get pending review facts
    const pendingReviews = await prisma.factEvent.findMany({
      where: {
        dealId,
        eventType: "PENDING_REVIEW",
      },
      orderBy: { createdAt: "desc" },
    });

    // For each pending review, get the conflicting current fact
    const reviewsWithContext = await Promise.all(
      pendingReviews.map(async (review) => {
        const currentFact = await prisma.factEvent.findFirst({
          where: {
            dealId,
            factKey: review.factKey,
            eventType: { notIn: ["DELETED", "SUPERSEDED", "PENDING_REVIEW"] },
          },
          orderBy: { createdAt: "desc" },
        });

        return {
          id: review.id,
          factKey: review.factKey,
          category: review.category,
          newValue: review.value,
          newDisplayValue: review.displayValue,
          newSource: review.source,
          newConfidence: review.sourceConfidence,
          existingValue: currentFact?.value ?? null,
          existingDisplayValue: currentFact?.displayValue ?? null,
          existingSource: currentFact?.source ?? null,
          existingConfidence: currentFact?.sourceConfidence ?? null,
          contradictionReason: review.reason,
          createdAt: review.createdAt,
        };
      })
    );

    return NextResponse.json({ data: reviewsWithContext });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    return NextResponse.json(
      { error: "Failed to fetch reviews" },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST /api/facts/[dealId]/reviews - Resolve a pending review
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

    const parseResult = resolveSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation error", details: parseResult.error.issues },
        { status: 400 }
      );
    }

    const { reviewId, decision, overrideValue, overrideDisplayValue, reason } =
      parseResult.data;

    // Verify deal ownership
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: user.id },
    });
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    // Get the pending review
    const review = await prisma.factEvent.findFirst({
      where: { id: reviewId, dealId, eventType: "PENDING_REVIEW" },
    });
    if (!review) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      if (decision === "ACCEPT_NEW") {
        // Mark current fact as superseded, promote the review to CREATED
        await tx.factEvent.updateMany({
          where: {
            dealId,
            factKey: review.factKey,
            eventType: { notIn: ["DELETED", "SUPERSEDED", "PENDING_REVIEW"] },
          },
          data: { eventType: "SUPERSEDED" },
        });

        await tx.factEvent.update({
          where: { id: reviewId },
          data: {
            eventType: "CREATED",
            reason: `Accepted by user: ${reason}`,
          },
        });
      } else if (decision === "KEEP_EXISTING") {
        // Mark the review as resolved (dismissed)
        await tx.factEvent.update({
          where: { id: reviewId },
          data: {
            eventType: "RESOLVED",
            reason: `Dismissed by user: ${reason}`,
          },
        });
      } else if (decision === "OVERRIDE") {
        // User provides a different value
        await tx.factEvent.updateMany({
          where: {
            dealId,
            factKey: review.factKey,
            eventType: { notIn: ["DELETED", "SUPERSEDED", "PENDING_REVIEW"] },
          },
          data: { eventType: "SUPERSEDED" },
        });

        await tx.factEvent.update({
          where: { id: reviewId },
          data: { eventType: "RESOLVED", reason: `Overridden by user: ${reason}` },
        });

        // Create new BA_OVERRIDE fact
        await tx.factEvent.create({
          data: {
            dealId,
            factKey: review.factKey,
            category: review.category,
            value: (overrideValue ?? review.value) as Prisma.InputJsonValue,
            displayValue: overrideDisplayValue ?? review.displayValue,
            unit: review.unit,
            source: "BA_OVERRIDE",
            sourceConfidence: 100,
            eventType: "CREATED",
            createdBy: user.id,
            reason: reason,
          },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error resolving review:", error);
    return NextResponse.json(
      { error: "Failed to resolve review" },
      { status: 500 }
    );
  }
}
