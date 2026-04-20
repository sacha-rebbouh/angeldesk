import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { loadResults } from "@/services/analysis-results/load-results";
import { extractAnalysisScores } from "@/services/analysis-results/score-extraction";
import { getCurrentFactsFromView } from "@/services/fact-store/current-facts";
import type { CurrentFact } from "@/services/fact-store/types";
import { pickCanonicalAnalysis } from "@/services/deals/canonical-read-model";

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

    const dealIds = deals.map((deal) => deal.id);

    let latestTheses: Array<{
      id: string;
      dealId: string;
      corpusSnapshotId: string | null;
    }> = [];
    let completedAnalyses: Array<{
      id: string;
      dealId: string;
      mode: string | null;
      thesisId: string | null;
      corpusSnapshotId: string | null;
      completedAt: Date | null;
      createdAt: Date;
    }> = [];

    if (dealIds.length > 0) {
      [latestTheses, completedAnalyses] = await Promise.all([
        prisma.thesis.findMany({
          where: {
            dealId: { in: dealIds },
            isLatest: true,
          },
          select: {
            id: true,
            dealId: true,
            corpusSnapshotId: true,
          },
        }),
        prisma.analysis.findMany({
          where: {
            dealId: { in: dealIds },
            status: "COMPLETED",
            completedAt: { not: null },
          },
          select: {
            id: true,
            dealId: true,
            mode: true,
            thesisId: true,
            corpusSnapshotId: true,
            completedAt: true,
            createdAt: true,
          },
          orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
        }),
      ]);
    }

    const latestThesisByDealId = new Map(
      latestTheses.map((thesis) => [thesis.dealId, thesis])
    );

    const analysesByDealId = completedAnalyses.reduce<
      Map<
        string,
        Array<{
          id: string;
          dealId: string;
          mode: string | null;
          thesisId: string | null;
          corpusSnapshotId: string | null;
          completedAt: Date | null;
          createdAt: Date;
        }>
      >
    >((map, analysis) => {
      const existing = map.get(analysis.dealId) ?? [];
      existing.push(analysis);
      map.set(analysis.dealId, existing);
      return map;
    }, new Map());

    const selectedAnalysisByDealId = new Map(
      dealIds.map((dealId) => [
        dealId,
        pickCanonicalAnalysis(
          latestThesisByDealId.get(dealId) ?? null,
          analysesByDealId.get(dealId) ?? []
        ),
      ])
    );

    const selectedAnalysisIds = [
      ...new Set(
        [...selectedAnalysisByDealId.values()]
          .map((analysis) => analysis?.id)
          .filter((analysisId): analysisId is string => Boolean(analysisId))
      ),
    ];

    const [resultsEntries, currentFactsEntries] = await Promise.all([
      Promise.all(
        selectedAnalysisIds.map(async (analysisId) => [
          analysisId,
          await loadResults(analysisId),
        ] as const)
      ),
      Promise.all(
        dealIds.map(async (dealId) => [
          dealId,
          await getCurrentFactsFromView(dealId),
        ] as const)
      ),
    ]);
    const resultsByAnalysisId = new Map(resultsEntries);
    const currentFactsByDealId = new Map(currentFactsEntries);
    const dealById = new Map(deals.map((deal) => [deal.id, deal]));

    const data = ids
      .map((dealId) => dealById.get(dealId))
      .filter((deal): deal is (typeof deals)[number] => Boolean(deal))
      .map((deal) => {
        const latestThesis = latestThesisByDealId.get(deal.id) ?? null;
        const selectedAnalysis = selectedAnalysisByDealId.get(deal.id) ?? null;
        const factMap = buildCurrentFactMap(currentFactsByDealId.get(deal.id) ?? []);
        const analysisScores = selectedAnalysis
          ? extractAnalysisScores(resultsByAnalysisId.get(selectedAnalysis.id))
          : {
              globalScore: null,
              teamScore: null,
              marketScore: null,
              productScore: null,
              financialsScore: null,
            };
        const canFallbackToDealScores = !latestThesis || !!selectedAnalysis;

        return {
          id: deal.id,
          name: deal.name,
          sector: deal.sector,
          stage: deal.stage,
          globalScore:
            analysisScores.globalScore ??
            (canFallbackToDealScores ? deal.globalScore : null),
          teamScore:
            analysisScores.teamScore ??
            (canFallbackToDealScores ? deal.teamScore : null),
          marketScore:
            analysisScores.marketScore ??
            (canFallbackToDealScores ? deal.marketScore : null),
          productScore:
            analysisScores.productScore ??
            (canFallbackToDealScores ? deal.productScore : null),
          financialsScore:
            analysisScores.financialsScore ??
            (canFallbackToDealScores ? deal.financialsScore : null),
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
