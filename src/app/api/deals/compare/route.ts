import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getCurrentFactsFromView } from "@/services/fact-store/current-facts";
import type { CurrentFact } from "@/services/fact-store/types";

const cuidSchema = z.string().cuid();

function buildCurrentFactMap(currentFacts: CurrentFact[]): Map<string, CurrentFact> {
  return new Map(currentFacts.map((fact) => [fact.factKey, fact]));
}

function getCurrentFactNumber(
  factMap: Map<string, CurrentFact>,
  factKey: string
): number | null {
  const fact = factMap.get(factKey);
  if (!fact) return null;
  if (typeof fact.currentValue === "number" && Number.isFinite(fact.currentValue)) {
    return fact.currentValue;
  }
  if (typeof fact.currentValue === "string") {
    const parsed = Number(fact.currentValue);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

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
        valuationPre: true,
        arr: true,
        growthRate: true,
        redFlags: {
          where: { status: "OPEN" },
          select: { severity: true },
        },
      },
    });

    const dealIds = deals.map((deal) => deal.id);

    // Dé-scorisation : la comparaison ne restitue plus aucune note de deal.
    // On ne charge plus les analyses/résultats (servaient uniquement à extraire
    // les scores) — uniquement les métriques OBSERVABLES (valo/ARR/croissance
    // via current facts) et le décompte de red flags.
    const currentFactsEntries = await Promise.all(
      dealIds.map(async (dealId) => [
        dealId,
        await getCurrentFactsFromView(dealId),
      ] as const)
    );
    const currentFactsByDealId = new Map(currentFactsEntries);
    const dealById = new Map(deals.map((deal) => [deal.id, deal]));

    const data = ids
      .map((dealId) => dealById.get(dealId))
      .filter((deal): deal is (typeof deals)[number] => Boolean(deal))
      .map((deal) => {
        const factMap = buildCurrentFactMap(currentFactsByDealId.get(deal.id) ?? []);

        return {
          id: deal.id,
          name: deal.name,
          sector: deal.sector,
          stage: deal.stage,
          valuationPre:
            getCurrentFactNumber(factMap, "financial.valuation_pre") ??
            (deal.valuationPre != null ? Number(deal.valuationPre) : null),
          arr:
            getCurrentFactNumber(factMap, "financial.arr") ??
            (deal.arr != null ? Number(deal.arr) : null),
          growthRate:
            getCurrentFactNumber(factMap, "financial.revenue_growth_yoy") ??
            (deal.growthRate != null ? Number(deal.growthRate) : null),
          redFlagCount: deal.redFlags.length,
          criticalRedFlagCount: deal.redFlags.filter(
            (rf) => rf.severity === "CRITICAL" || rf.severity === "HIGH"
          ).length,
        };
      });

    return NextResponse.json({ data });
  } catch (error) {
    console.error("[Compare API] Error:", error);
    return NextResponse.json(
      { error: "Failed to compare deals" },
      { status: 500 }
    );
  }
}
