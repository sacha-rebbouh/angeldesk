import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { z } from "zod";

const updateFounderSchema = z.object({
  name: z.string().min(1, "Le nom est requis").optional(),
  role: z.string().min(1, "Le role est requis").optional(),
  linkedinUrl: z.string().url("URL LinkedIn invalide").optional().or(z.literal("")).nullable(),
});

// CUID validation
const cuidSchema = z.string().cuid();

interface RouteParams {
  params: Promise<{ dealId: string; founderId: string }>;
}

// GET /api/deals/[dealId]/founders/[founderId] - Get a founder
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireAuth();
    const { dealId, founderId } = await params;

    // Validate CUID format
    const dealCuidResult = cuidSchema.safeParse(dealId);
    const founderCuidResult = cuidSchema.safeParse(founderId);
    if (!dealCuidResult.success || !founderCuidResult.success) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }

    // Verify deal belongs to user
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: user.id },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const founder = await prisma.founder.findFirst({
      where: { id: founderId, dealId },
    });

    if (!founder) {
      return NextResponse.json({ error: "Founder not found" }, { status: 404 });
    }

    return NextResponse.json({ founder });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error fetching founder:", error);
    }
    return NextResponse.json(
      { error: "Failed to fetch founder" },
      { status: 500 }
    );
  }
}

// PUT /api/deals/[dealId]/founders/[founderId] - Update a founder
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireAuth();
    const { dealId, founderId } = await params;

    // Validate CUID format
    const dealCuidResult = cuidSchema.safeParse(dealId);
    const founderCuidResult = cuidSchema.safeParse(founderId);
    if (!dealCuidResult.success || !founderCuidResult.success) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }

    // Verify deal belongs to user
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: user.id },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    // Verify founder belongs to deal
    const existingFounder = await prisma.founder.findFirst({
      where: { id: founderId, dealId },
    });

    if (!existingFounder) {
      return NextResponse.json({ error: "Founder not found" }, { status: 404 });
    }

    const body = await request.json();
    const validatedData = updateFounderSchema.parse(body);

    const founder = await prisma.founder.update({
      where: { id: founderId },
      data: {
        ...(validatedData.name && { name: validatedData.name }),
        ...(validatedData.role && { role: validatedData.role }),
        ...(validatedData.linkedinUrl !== undefined && {
          linkedinUrl: validatedData.linkedinUrl || null,
        }),
      },
    });

    return NextResponse.json({ founder });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    if (process.env.NODE_ENV === "development") {
      console.error("Error updating founder:", error);
    }
    return NextResponse.json(
      { error: "Failed to update founder" },
      { status: 500 }
    );
  }
}

// DELETE /api/deals/[dealId]/founders/[founderId] - Delete a founder
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireAuth();
    const { dealId, founderId } = await params;

    // Validate CUID format
    const dealCuidResult = cuidSchema.safeParse(dealId);
    const founderCuidResult = cuidSchema.safeParse(founderId);
    if (!dealCuidResult.success || !founderCuidResult.success) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }

    // Verify deal belongs to user
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: user.id },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    // Verify founder belongs to deal
    const existingFounder = await prisma.founder.findFirst({
      where: { id: founderId, dealId },
    });

    if (!existingFounder) {
      return NextResponse.json({ error: "Founder not found" }, { status: 404 });
    }

    await prisma.founder.delete({
      where: { id: founderId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error deleting founder:", error);
    }
    return NextResponse.json(
      { error: "Failed to delete founder" },
      { status: 500 }
    );
  }
}
