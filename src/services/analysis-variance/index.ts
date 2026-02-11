/**
 * ANALYSIS VARIANCE DETECTOR (F55)
 *
 * Compare deux analyses sur le meme deal pour detecter des variances
 * inacceptables qui indiqueraient un probleme de reproductibilite.
 *
 * Seuils:
 * - Score global: > 10 points = WARNING, > 20 points = CRITICAL
 * - Score dimension: > 15 points = WARNING, > 25 points = CRITICAL
 * - Verdict change: TOUJOURS CRITICAL
 * - Red flags: CRITICAL flag present/absent entre 2 runs = CRITICAL
 */

export interface VarianceReport {
  dealId: string;
  analysisId1: string;
  analysisId2: string;
  fingerprint1: string | null;
  fingerprint2: string | null;
  fingerprintMatch: boolean;

  overallScoreVariance: {
    score1: number;
    score2: number;
    delta: number;
    severity: "OK" | "WARNING" | "CRITICAL";
  };

  dimensionVariances: {
    dimension: string;
    score1: number;
    score2: number;
    delta: number;
    severity: "OK" | "WARNING" | "CRITICAL";
  }[];

  verdictVariance: {
    verdict1: string;
    verdict2: string;
    changed: boolean;
    severity: "OK" | "CRITICAL";
  };

  redFlagVariance: {
    onlyInRun1: string[];
    onlyInRun2: string[];
    criticalFlipped: boolean;
    severity: "OK" | "WARNING" | "CRITICAL";
  };

  overallSeverity: "OK" | "WARNING" | "CRITICAL";
  reproducible: boolean;
  explanation: string;
  recommendation: string;
}

export async function detectVariance(
  analysisId1: string,
  analysisId2: string
): Promise<VarianceReport | null> {
  const { prisma } = await import("@/lib/prisma");

  const [a1, a2] = await Promise.all([
    prisma.analysis.findUnique({ where: { id: analysisId1 } }),
    prisma.analysis.findUnique({ where: { id: analysisId2 } }),
  ]);

  if (!a1?.results || !a2?.results) return null;
  if (a1.dealId !== a2.dealId) return null;

  const r1 = a1.results as Record<string, unknown>;
  const r2 = a2.results as Record<string, unknown>;

  const extractData = (results: Record<string, unknown>) => {
    const scorer = results["synthesis-deal-scorer"] as {
      data?: { overallScore?: number; verdict?: string; dimensionScores?: { dimension: string; score: number }[] }
    } | undefined;
    return scorer?.data;
  };

  const d1 = extractData(r1);
  const d2 = extractData(r2);
  if (!d1 || !d2) return null;

  const scoreDelta = Math.abs((d1.overallScore ?? 0) - (d2.overallScore ?? 0));
  const scoreSeverity: "OK" | "WARNING" | "CRITICAL" =
    scoreDelta > 20 ? "CRITICAL" : scoreDelta > 10 ? "WARNING" : "OK";

  const verdictChanged = d1.verdict !== d2.verdict;
  const verdictSeverity: "OK" | "CRITICAL" = verdictChanged ? "CRITICAL" : "OK";

  // Dimension variances
  const dimVariances = (d1.dimensionScores ?? []).map(dim1 => {
    const dim2 = (d2.dimensionScores ?? []).find(d => d.dimension === dim1.dimension);
    const delta = Math.abs(dim1.score - (dim2?.score ?? dim1.score));
    return {
      dimension: dim1.dimension,
      score1: dim1.score,
      score2: dim2?.score ?? 0,
      delta,
      severity: (delta > 25 ? "CRITICAL" : delta > 15 ? "WARNING" : "OK") as "OK" | "WARNING" | "CRITICAL",
    };
  });

  // Red flag variance
  const extractFlags = (results: Record<string, unknown>): { title: string; severity: string }[] => {
    const flags: { title: string; severity: string }[] = [];
    for (const result of Object.values(results)) {
      const data = (result as { data?: { redFlags?: { title?: string; severity?: string }[] } })?.data;
      if (Array.isArray(data?.redFlags)) {
        flags.push(...data.redFlags.map(rf => ({ title: rf.title ?? "", severity: rf.severity ?? "MEDIUM" })));
      }
    }
    return flags;
  };

  const flags1 = extractFlags(r1).map(f => f.title);
  const flags2 = extractFlags(r2).map(f => f.title);
  const onlyIn1 = flags1.filter(f => !flags2.includes(f));
  const onlyIn2 = flags2.filter(f => !flags1.includes(f));

  const criticalFlags1 = extractFlags(r1).filter(f => f.severity === "CRITICAL").map(f => f.title);
  const criticalFlags2 = extractFlags(r2).filter(f => f.severity === "CRITICAL").map(f => f.title);
  const criticalFlipped = criticalFlags1.some(f => !criticalFlags2.includes(f)) ||
                          criticalFlags2.some(f => !criticalFlags1.includes(f));

  const overallSeverity: "OK" | "WARNING" | "CRITICAL" =
    scoreSeverity === "CRITICAL" || verdictSeverity === "CRITICAL" || criticalFlipped
      ? "CRITICAL"
      : scoreSeverity === "WARNING" || dimVariances.some(d => d.severity === "WARNING")
        ? "WARNING"
        : "OK";

  return {
    dealId: a1.dealId,
    analysisId1,
    analysisId2,
    fingerprint1: a1.dealFingerprint,
    fingerprint2: a2.dealFingerprint,
    fingerprintMatch: a1.dealFingerprint === a2.dealFingerprint,
    overallScoreVariance: {
      score1: d1.overallScore ?? 0,
      score2: d2.overallScore ?? 0,
      delta: scoreDelta,
      severity: scoreSeverity,
    },
    dimensionVariances: dimVariances,
    verdictVariance: {
      verdict1: d1.verdict ?? "unknown",
      verdict2: d2.verdict ?? "unknown",
      changed: verdictChanged,
      severity: verdictSeverity,
    },
    redFlagVariance: {
      onlyInRun1: onlyIn1,
      onlyInRun2: onlyIn2,
      criticalFlipped,
      severity: criticalFlipped ? "CRITICAL" : onlyIn1.length + onlyIn2.length > 3 ? "WARNING" : "OK",
    },
    overallSeverity,
    reproducible: overallSeverity === "OK",
    explanation: `Variance de ${scoreDelta} points sur le score global. ${verdictChanged ? "Le verdict a change!" : "Verdict stable."} ${criticalFlipped ? "ATTENTION: des red flags CRITICAL ont flip entre les runs." : ""}`,
    recommendation: overallSeverity === "CRITICAL"
      ? "Variance inacceptable. Verifier les prompts et la temperature LLM. Relancer l'analyse."
      : overallSeverity === "WARNING"
        ? "Variance notable. Les resultats sont utilisables mais la reproductibilite devrait etre amelioree."
        : "Variance acceptable. Les resultats sont reproductibles.",
  };
}
