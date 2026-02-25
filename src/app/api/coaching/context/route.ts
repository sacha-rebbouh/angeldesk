import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { isValidCuid } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";
import { compileDealContext } from "@/lib/live/context-compiler";

// GET /api/coaching/context?dealId=xxx — Get compiled deal context for coaching
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();

    const searchParams = request.nextUrl.searchParams;
    const dealId = searchParams.get("dealId");

    if (!dealId) {
      return NextResponse.json(
        { error: "Missing required query parameter: dealId" },
        { status: 400 }
      );
    }

    if (!isValidCuid(dealId)) {
      return NextResponse.json(
        { error: "Invalid deal ID format" },
        { status: 400 }
      );
    }

    // Verify deal exists and belongs to user
    const deal = await prisma.deal.findFirst({
      where: {
        id: dealId,
        userId: user.id,
      },
    });

    if (!deal) {
      return NextResponse.json(
        { error: "Deal not found" },
        { status: 404 }
      );
    }

    const context = await compileDealContext(dealId);

    return NextResponse.json({ data: context });
  } catch (error) {
    return handleApiError(error, "compile deal context");
  }
}
