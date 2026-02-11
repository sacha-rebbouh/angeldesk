import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { z } from "zod";
import { handleApiError } from "@/lib/api-error";

const createFounderSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  role: z.string().min(1, "Le role est requis"),
  linkedinUrl: z.string().url("URL LinkedIn invalide").optional().or(z.literal("")),
});

// CUID validation
const cuidSchema = z.string().cuid();

interface RouteParams {
  params: Promise<{ dealId: string }>;
}

// GET /api/deals/[dealId]/founders - List all founders for a deal
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireAuth();
    const { dealId } = await params;

    // Validate CUID format
    const cuidResult = cuidSchema.safeParse(dealId);
    if (!cuidResult.success) {
      return NextResponse.json({ error: "Invalid deal ID format" }, { status: 400 });
    }

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
    return handleApiError(error, "fetch founders");
  }
}

// POST /api/deals/[dealId]/founders - Create a new founder
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireAuth();
    const { dealId } = await params;

    // Validate CUID format
    const cuidResult = cuidSchema.safeParse(dealId);
    if (!cuidResult.success) {
      return NextResponse.json({ error: "Invalid deal ID format" }, { status: 400 });
    }

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
    return handleApiError(error, "create founder");
  }
}
