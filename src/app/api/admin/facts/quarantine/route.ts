import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { isValidCuid } from "@/lib/sanitize";
import {
  listSuspiciousCurrentFacts,
  quarantineSuspiciousCurrentFacts,
} from "@/services/fact-store";

const quarantineSchema = z.object({
  dealId: z.string().optional(),
  dealIds: z.array(z.string()).optional(),
  dryRun: z.boolean().optional().default(true),
  limit: z.number().int().min(1).max(1000).optional().default(200),
});

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const searchParams = new URL(request.url).searchParams;
    const dealId = searchParams.get("dealId") ?? undefined;
    const take = Number(searchParams.get("take") ?? "200");

    if (dealId && !isValidCuid(dealId)) {
      return NextResponse.json({ error: "Invalid deal ID format" }, { status: 400 });
    }

    const result = await listSuspiciousCurrentFacts({
      ...(dealId ? { dealId } : {}),
      limit: Number.isFinite(take) ? take : 200,
    });

    return NextResponse.json({
      data: {
        admin: { id: admin.id },
        ...result,
      },
    });
  } catch (error) {
    return handleApiError(error, "list suspicious facts");
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const parsed = quarantineSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { dealId, dealIds, dryRun, limit } = parsed.data;

    if (dealId && !isValidCuid(dealId)) {
      return NextResponse.json({ error: "Invalid deal ID format" }, { status: 400 });
    }
    if (dealIds?.some((id) => !isValidCuid(id))) {
      return NextResponse.json({ error: "Invalid deal ID format" }, { status: 400 });
    }

    const targetDealIds = dealIds?.length
      ? [...new Set(dealIds)]
      : dealId
        ? [dealId]
        : undefined;

    const result = await quarantineSuspiciousCurrentFacts({
      ...(targetDealIds ? { dealIds: targetDealIds } : {}),
      dryRun,
      limit,
    });

    return NextResponse.json({
      data: {
        admin: { id: admin.id },
        ...result,
      },
    });
  } catch (error) {
    return handleApiError(error, "quarantine suspicious facts");
  }
}
