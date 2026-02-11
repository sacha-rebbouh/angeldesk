import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

const cuidSchema = z.string().cuid();

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const ids = request.nextUrl.searchParams.get("ids")?.split(",") ?? [];

    if (ids.length < 2 || ids.length > 3) {
      return NextResponse.json({ error: "Need 2-3 deal IDs" }, { status: 400 });
    }

    // Validate all IDs are valid CUIDs
    const invalidIds = ids.filter((id) => !cuidSchema.safeParse(id).success);
    if (invalidIds.length > 0) {
      return NextResponse.json({ error: "Invalid deal ID format" }, { status: 400 });
    }

    const deals = await prisma.deal.findMany({
      where: { id: { in: ids }, userId: user.id },
      select: {
        id: true,
        name: true,
        sector: true,
        stage: true,
        globalScore: true,
        teamScore: true,
        marketScore: true,
        productScore: true,
        financialsScore: true,
        valuationPre: true,
        arr: true,
        growthRate: true,
        redFlags: {
          where: { status: "OPEN" },
          select: { severity: true },
        },
      },
    });

    const data = deals.map((deal) => ({
      id: deal.id,
      name: deal.name,
      sector: deal.sector,
      stage: deal.stage,
      globalScore: deal.globalScore,
      teamScore: deal.teamScore,
      marketScore: deal.marketScore,
      productScore: deal.productScore,
      financialsScore: deal.financialsScore,
      valuationPre: deal.valuationPre ? Number(deal.valuationPre) : null,
      arr: deal.arr ? Number(deal.arr) : null,
      growthRate: deal.growthRate ? Number(deal.growthRate) : null,
      redFlagCount: deal.redFlags.length,
      criticalRedFlagCount: deal.redFlags.filter(
        (rf) => rf.severity === "CRITICAL" || rf.severity === "HIGH"
      ).length,
    }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error("[Compare API] Error:", error);
    return NextResponse.json(
      { error: "Failed to compare deals" },
      { status: 500 }
    );
  }
}
