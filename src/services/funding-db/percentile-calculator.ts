/**
 * DETERMINISTIC DEAL PERCENTILE CALCULATOR (F37)
 *
 * Calcul deterministe du percentile d'un deal vs la DB d'analyses.
 * Aucun LLM utilise - pur calcul statistique.
 */

const RESULTS_LOAD_BATCH_SIZE = 25;
const PERCENTILE_CACHE_TTL_MS = 60_000;

interface ScoredAnalysisCohortEntry {
  score: number;
  sector: string | null;
  stage: string | null;
}

interface ScoredAnalysisCohortCache {
  expiresAt: number;
  entries: ScoredAnalysisCohortEntry[];
}

let scoredAnalysisCohortCache: ScoredAnalysisCohortCache | null = null;

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

export function clearDealPercentileCacheForTests(): void {
  scoredAnalysisCohortCache = null;
}

async function loadScoredAnalysisCohort(): Promise<ScoredAnalysisCohortEntry[]> {
  const now = Date.now();
  if (scoredAnalysisCohortCache && scoredAnalysisCohortCache.expiresAt > now) {
    return scoredAnalysisCohortCache.entries;
  }

  const [
    { prisma },
    { Prisma },
    { loadResults },
    { extractAnalysisScores },
  ] = await Promise.all([
    import("@/lib/prisma"),
    import("@prisma/client"),
    import("@/services/analysis-results/load-results"),
    import("@/services/analysis-results/score-extraction"),
  ]);

  const analyses = await prisma.analysis.findMany({
    where: {
      status: "COMPLETED",
      results: { not: Prisma.JsonNull },
    },
    select: {
      id: true,
      deal: {
        select: { sector: true, stage: true },
      },
    },
    orderBy: { completedAt: "desc" },
    take: 500,
  });

  const entries: ScoredAnalysisCohortEntry[] = [];

  for (let index = 0; index < analyses.length; index += RESULTS_LOAD_BATCH_SIZE) {
    const batch = analyses.slice(index, index + RESULTS_LOAD_BATCH_SIZE);
    const loadedBatch = await Promise.all(
      batch.map(async (analysis) => ({
        analysis,
        results: await loadResults(analysis.id),
      }))
    );

    for (const { analysis, results } of loadedBatch) {
      const score = extractAnalysisScores(results).globalScore;
      if (typeof score !== "number") continue;

      entries.push({
        score,
        sector: analysis.deal?.sector ?? null,
        stage: analysis.deal?.stage ?? null,
      });
    }
  }

  scoredAnalysisCohortCache = {
    expiresAt: now + PERCENTILE_CACHE_TTL_MS,
    entries,
  };

  return entries;
}

export async function calculateDealPercentile(
  dealScore: number,
  dealSector: string | null,
  dealStage: string | null,
): Promise<DealPercentileResult> {
  const cohort = await loadScoredAnalysisCohort();

  // Extract scores
  const allScores: number[] = [];
  const sectorScores: number[] = [];
  const stageScores: number[] = [];

  for (const entry of cohort) {
    allScores.push(entry.score);

    if (
      dealSector &&
      entry.sector?.toLowerCase().includes(dealSector.toLowerCase())
    ) {
      sectorScores.push(entry.score);
    }
    if (
      dealStage &&
      entry.stage?.toLowerCase() === dealStage.toLowerCase()
    ) {
      stageScores.push(entry.score);
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
