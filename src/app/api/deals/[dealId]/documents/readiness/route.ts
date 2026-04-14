import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { isValidCuid } from "@/lib/sanitize";
import { evaluateDealDocumentReadiness } from "@/services/documents/extraction-runs";

type RouteContext = {
  params: Promise<{ dealId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { dealId } = await context.params;

    if (!isValidCuid(dealId)) {
      return NextResponse.json({ error: "Invalid deal ID format" }, { status: 400 });
    }

    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: user.id },
      select: { id: true },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const readiness = await evaluateDealDocumentReadiness(dealId);
    return NextResponse.json({ data: readiness });
  } catch (error) {
    return handleApiError(error, "fetch document readiness");
  }
}
