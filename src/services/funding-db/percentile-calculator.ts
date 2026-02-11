/**
 * DETERMINISTIC DEAL PERCENTILE CALCULATOR (F37)
 *
 * Calcul deterministe du percentile d'un deal vs la DB d'analyses.
 * Aucun LLM utilise - pur calcul statistique.
 */

export interface DealPercentileResult {
  percentileOverall: number;
  percentileSector: number;
  percentileStage: number;
  similarDealsAnalyzed: number;
  sectorDealsCount: number;
  stageDealsCount: number;
  scoreDistribution: {
    p25: number;
    median: number;
    p75: number;
  };
  method: "EXACT" | "INTERPOLATED" | "INSUFFICIENT_DATA";
  calculationDetail: string;
}

export async function calculateDealPercentile(
  dealScore: number,
  dealSector: string | null,
  dealStage: string | null,
): Promise<DealPercentileResult> {
  const { prisma } = await import("@/lib/prisma");
  const { Prisma } = await import("@prisma/client");

  // Retrieve completed analyses with scores
  const analyses = await prisma.analysis.findMany({
    where: {
      status: "COMPLETED",
      results: { not: Prisma.JsonNull },
    },
    include: {
      deal: {
        select: { sector: true, stage: true },
      },
    },
    orderBy: { completedAt: "desc" },
    take: 500,
  });

  // Extract scores
  const allScores: number[] = [];
  const sectorScores: number[] = [];
  const stageScores: number[] = [];

  for (const analysis of analyses) {
    const results = analysis.results as Record<string, unknown> | null;
    if (!results) continue;

    const scorer = results["synthesis-deal-scorer"] as { data?: { overallScore?: number } } | undefined;
    const score = scorer?.data?.overallScore;
    if (typeof score !== "number") continue;

    allScores.push(score);

    if (dealSector && analysis.deal?.sector?.toLowerCase().includes(dealSector.toLowerCase())) {
      sectorScores.push(score);
    }
    if (dealStage && analysis.deal?.stage?.toLowerCase() === dealStage.toLowerCase()) {
      stageScores.push(score);
    }
  }

  const calcPercentile = (scores: number[], value: number): number => {
    if (scores.length === 0) return 50;
    const sorted = [...scores].sort((a, b) => a - b);
    const below = sorted.filter(s => s < value).length;
    return Math.round((below / sorted.length) * 100);
  };

  const calcDistribution = (scores: number[]) => {
    if (scores.length === 0) return { p25: 0, median: 0, p75: 0 };
    const sorted = [...scores].sort((a, b) => a - b);
    return {
      p25: sorted[Math.floor(sorted.length * 0.25)] ?? 0,
      median: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
      p75: sorted[Math.floor(sorted.length * 0.75)] ?? 0,
    };
  };

  const percentileOverall = calcPercentile(allScores, dealScore);
  const percentileSector = sectorScores.length >= 5
    ? calcPercentile(sectorScores, dealScore)
    : percentileOverall;
  const percentileStage = stageScores.length >= 5
    ? calcPercentile(stageScores, dealScore)
    : percentileOverall;

  const method = allScores.length >= 20 ? "EXACT"
    : allScores.length >= 5 ? "INTERPOLATED"
    : "INSUFFICIENT_DATA";

  return {
    percentileOverall,
    percentileSector,
    percentileStage,
    similarDealsAnalyzed: allScores.length,
    sectorDealsCount: sectorScores.length,
    stageDealsCount: stageScores.length,
    scoreDistribution: calcDistribution(allScores),
    method,
    calculationDetail: `Score ${dealScore} positionne au P${percentileOverall} sur ${allScores.length} deals (${sectorScores.length} dans le secteur, ${stageScores.length} au meme stage). Methode: ${method}.`,
  };
}
