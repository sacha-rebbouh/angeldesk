/**
 * ANALYSIS DELTA SERVICE (F40)
 *
 * Compares two analyses on the same deal to produce a structured delta.
 * Used for re-analyses to show what changed.
 */

export interface AnalysisDelta {
  previousAnalysisId: string;
  previousDate: string;
  currentDate: string;

  scoreDelta: {
    overall: { previous: number; current: number; delta: number; deltaPercent: number };
    dimensions: {
      dimension: string;
      previous: number;
      current: number;
      delta: number;
      significance: "MAJOR_IMPROVEMENT" | "IMPROVEMENT" | "STABLE" | "DECLINE" | "MAJOR_DECLINE";
    }[];
  };

  verdictChange: {
    previous: string;
    current: string;
    changed: boolean;
    direction: "UPGRADE" | "DOWNGRADE" | "STABLE";
  };

  redFlagDelta: {
    new: string[];
    resolved: string[];
    unchanged: string[];
    criticalDelta: number;
  };

  summary: string;
}

export async function calculateAnalysisDelta(
  currentAnalysisId: string,
  previousAnalysisId: string
): Promise<AnalysisDelta | null> {
  const { prisma } = await import("@/lib/prisma");

  const [current, previous] = await Promise.all([
    prisma.analysis.findUnique({ where: { id: currentAnalysisId } }),
    prisma.analysis.findUnique({ where: { id: previousAnalysisId } }),
  ]);

  if (!current?.results || !previous?.results) return null;

  const currentResults = current.results as Record<string, unknown>;
  const previousResults = previous.results as Record<string, unknown>;

  const extractScore = (results: Record<string, unknown>) => {
    const scorer = results["synthesis-deal-scorer"] as {
      data?: { overallScore?: number; verdict?: string; dimensionScores?: { dimension: string; score: number }[] }
    } | undefined;
    return scorer?.data;
  };

  const currScore = extractScore(currentResults);
  const prevScore = extractScore(previousResults);

  if (!currScore || !prevScore) return null;

  const overallDelta = (currScore.overallScore ?? 0) - (prevScore.overallScore ?? 0);

  const dimensionDeltas = (currScore.dimensionScores ?? []).map(curr => {
    const prev = (prevScore.dimensionScores ?? []).find(d => d.dimension === curr.dimension);
    const delta = curr.score - (prev?.score ?? curr.score);
    return {
      dimension: curr.dimension,
      previous: prev?.score ?? 0,
      current: curr.score,
      delta,
      significance: delta > 15 ? "MAJOR_IMPROVEMENT" as const
        : delta > 5 ? "IMPROVEMENT" as const
        : delta < -15 ? "MAJOR_DECLINE" as const
        : delta < -5 ? "DECLINE" as const
        : "STABLE" as const,
    };
  });

  const extractRedFlags = (results: Record<string, unknown>): string[] => {
    const flags: string[] = [];
    for (const result of Object.values(results)) {
      const data = (result as { data?: { redFlags?: { title?: string }[] } })?.data;
      if (Array.isArray(data?.redFlags)) {
        flags.push(...data.redFlags.map(rf => rf.title ?? "").filter(Boolean));
      }
    }
    return [...new Set(flags)];
  };

  const currFlags = extractRedFlags(currentResults);
  const prevFlags = extractRedFlags(previousResults);

  return {
    previousAnalysisId,
    previousDate: previous.completedAt?.toISOString() ?? "",
    currentDate: current.completedAt?.toISOString() ?? "",
    scoreDelta: {
      overall: {
        previous: prevScore.overallScore ?? 0,
        current: currScore.overallScore ?? 0,
        delta: overallDelta,
        deltaPercent: prevScore.overallScore
          ? Math.round((overallDelta / prevScore.overallScore) * 100)
          : 0,
      },
      dimensions: dimensionDeltas,
    },
    verdictChange: {
      previous: prevScore.verdict ?? "unknown",
      current: currScore.verdict ?? "unknown",
      changed: prevScore.verdict !== currScore.verdict,
      direction: (currScore.overallScore ?? 0) > (prevScore.overallScore ?? 0)
        ? "UPGRADE"
        : (currScore.overallScore ?? 0) < (prevScore.overallScore ?? 0)
          ? "DOWNGRADE"
          : "STABLE",
    },
    redFlagDelta: {
      new: currFlags.filter(f => !prevFlags.includes(f)),
      resolved: prevFlags.filter(f => !currFlags.includes(f)),
      unchanged: currFlags.filter(f => prevFlags.includes(f)),
      criticalDelta: 0,
    },
    summary: `Score ${overallDelta >= 0 ? "ameliore" : "degrade"} de ${prevScore.overallScore ?? 0} a ${currScore.overallScore ?? 0} (${overallDelta >= 0 ? "+" : ""}${overallDelta}pts). ${currFlags.filter(f => !prevFlags.includes(f)).length} nouveaux red flags, ${prevFlags.filter(f => !currFlags.includes(f)).length} resolus.`,
  };
}
