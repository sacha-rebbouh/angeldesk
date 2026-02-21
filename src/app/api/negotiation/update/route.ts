import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { NegotiationStrategy } from "@/services/negotiation/strategist";

export const maxDuration = 30;

// =============================================================================
// Request Validation Schema
// =============================================================================

const updatePointStatusSchema = z.object({
  dealId: z.string().min(1, "dealId is required"),
  analysisId: z.string().min(1, "analysisId is required"),
  pointId: z.string().min(1, "pointId is required"),
  status: z.enum(["to_negotiate", "obtained", "refused", "compromised"]),
  compromiseValue: z.string().optional(), // Required when status is "compromised"
});

// =============================================================================
// PATCH Handler - Update negotiation point status
// =============================================================================

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parseResult = updatePointStatusSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || "Invalid request" },
        { status: 400 }
      );
    }

    const { dealId, analysisId, pointId, status, compromiseValue } = parseResult.data;

    // Validate: compromiseValue required when status is "compromised"
    if (status === "compromised" && !compromiseValue?.trim()) {
      return NextResponse.json(
        { error: "compromiseValue is required when status is 'compromised'" },
        { status: 400 }
      );
    }

    // Fetch the analysis
    const analysis = await prisma.analysis.findFirst({
      where: {
        id: analysisId,
        deal: {
          id: dealId,
          userId: user.id,
        },
      },
      select: {
        id: true,
        negotiationStrategy: true,
      },
    });

    if (!analysis) {
      return NextResponse.json(
        { error: "Analysis not found" },
        { status: 404 }
      );
    }

    if (!analysis.negotiationStrategy) {
      return NextResponse.json(
        { error: "No negotiation strategy found for this analysis" },
        { status: 404 }
      );
    }

    // Parse and update the strategy
    const strategy = analysis.negotiationStrategy as unknown as NegotiationStrategy;

    // Find and update the point
    const pointIndex = strategy.negotiationPoints.findIndex(p => p.id === pointId);
    if (pointIndex === -1) {
      return NextResponse.json(
        { error: "Negotiation point not found" },
        { status: 404 }
      );
    }

    // Update the point status and compromiseValue
    strategy.negotiationPoints[pointIndex] = {
      ...strategy.negotiationPoints[pointIndex],
      status,
      compromiseValue: status === "compromised" ? compromiseValue : undefined,
    };

    // Auto-resolve dealbreakers if linked points are obtained
    strategy.dealbreakers = strategy.dealbreakers.map(db => {
      if (db.linkedPoints.length === 0) return db;

      const allLinkedPointsResolved = db.linkedPoints.every(linkedId => {
        const linkedPoint = strategy.negotiationPoints.find(p => p.id === linkedId);
        return linkedPoint && (linkedPoint.status === "obtained" || linkedPoint.status === "compromised");
      });

      if (allLinkedPointsResolved && db.resolvable) {
        return { ...db, resolved: true };
      }
      return db;
    });

    // Save updated strategy
    await prisma.analysis.update({
      where: { id: analysisId },
      data: { negotiationStrategy: JSON.parse(JSON.stringify(strategy)) },
    });

    return NextResponse.json({
      success: true,
      strategy,
    });
  } catch (error) {
    if (error instanceof Error) {
      const errorMsg = error.message.toLowerCase();
      if (errorMsg === "unauthorized" || errorMsg.includes("unauthenticated") || errorMsg.includes("not authenticated")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    console.error("[Negotiation Update API] Error:", error);
    return NextResponse.json(
      { error: "An error occurred while updating the negotiation point." },
      { status: 500 }
    );
  }
}
