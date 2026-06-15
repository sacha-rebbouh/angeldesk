import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { isValidCuid } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";

type RouteContext = {
  params: Promise<{ dealId: string }>;
};

// GET /api/deals/[dealId]/terms/versions — List all versions of deal terms
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { dealId } = await context.params;

    if (!isValidCuid(dealId)) {
      return NextResponse.json({ error: "Invalid deal ID" }, { status: 400 });
    }

    // Verify deal ownership
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: user.id },
      select: { id: true },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const versions = await prisma.dealTermsVersion.findMany({
      where: { dealId },
      orderBy: { version: "desc" },
      select: {
        id: true,
        version: true,
        label: true,
        termsSnapshot: true,
        source: true,
        changeNote: true,
        createdAt: true,
      },
    });

    const result = versions.map((v) => ({
      id: v.id,
      version: v.version,
      label: v.label,
      termsSnapshot: v.termsSnapshot as Record<string, unknown>,
      source: v.source,
      changeNote: v.changeNote,
      createdAt: v.createdAt.toISOString(),
    }));

    return NextResponse.json({ versions: result });
  } catch (error) {
    return handleApiError(error, "GET /api/deals/[dealId]/terms/versions");
  }
}
