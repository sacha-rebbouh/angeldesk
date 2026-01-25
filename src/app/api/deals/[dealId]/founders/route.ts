import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { z } from "zod";

const createFounderSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  role: z.string().min(1, "Le role est requis"),
  linkedinUrl: z.string().url("URL LinkedIn invalide").optional().or(z.literal("")),
});

interface RouteParams {
  params: Promise<{ dealId: string }>;
}

// GET /api/deals/[dealId]/founders - List all founders for a deal
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireAuth();
    const { dealId } = await params;

    // Verify deal belongs to user
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: user.id },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const founders = await prisma.founder.findMany({
      where: { dealId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ founders });
  } catch (error) {
    console.error("Error fetching founders:", error);
    return NextResponse.json(
      { error: "Failed to fetch founders" },
      { status: 500 }
    );
  }
}

// POST /api/deals/[dealId]/founders - Create a new founder
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireAuth();
    const { dealId } = await params;

    // Verify deal belongs to user
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: user.id },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const body = await request.json();
    const validatedData = createFounderSchema.parse(body);

    const founder = await prisma.founder.create({
      data: {
        dealId,
        name: validatedData.name,
        role: validatedData.role,
        linkedinUrl: validatedData.linkedinUrl || null,
      },
    });

    return NextResponse.json({ founder }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error creating founder:", error);
    return NextResponse.json(
      { error: "Failed to create founder" },
      { status: 500 }
    );
  }
}
