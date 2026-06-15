import { prisma } from "@/lib/prisma";
import { loadResults } from "@/services/analysis-results/load-results";
import { type CanonicalExtractedInfo } from "@/services/analysis-results/score-extraction";
import {
  computeAnalysisSignalSummary,
  readAnalysisSignalSummaries,
  upsertAnalysisSignalSummary,
} from "@/services/deals/analysis-signal-summary";
import { getCurrentFactsFromView } from "@/services/fact-store/current-facts";
import type { CurrentFact } from "@/services/fact-store/types";

export type { CanonicalExtractedInfo };

export interface CanonicalLatestThesis {
  id: string;
  dealId: string;
  verdict: string;
  corpusSnapshotId: string | null;
}

export interface CanonicalCompletedAnalysis {
  id: string;
  dealId: string;
  mode: string | null;
  thesisId: string | null;
  corpusSnapshotId: string | null;
  completedAt: Date | null;
  createdAt: Date;
}

export interface CanonicalDealSignals {
  latestThesisByDealId: Map<string, CanonicalLatestThesis>;
  selectedAnalysisByDealId: Map<string, CanonicalCompletedAnalysis | null>;
  extractedInfoByDealId: Map<string, CanonicalExtractedInfo | null>;
  factMapByDealId: Map<string, Map<string, CurrentFact>>;
}

interface CanonicalFieldFallbacks {
  companyName: string | null;
  website: string | null;
  arr: number | null;
  growthRate: number | null;
  amountRequested: number | null;
  valuationPre: number | null;
  sector: string | null;
  stage: string | null;
  instrument: string | null;
  geography: string | null;
  description: string | null;
}

export type CanonicalDealFields = CanonicalFieldFallbacks;

function buildCurrentFactMap(currentFacts: CurrentFact[]): Map<string, CurrentFact> {
  return new Map(currentFacts.map((fact) => [fact.factKey, fact]));
}

export function getCurrentFactString(
  factMap: Map<string, CurrentFact>,
  factKey: string
): string | null {
  const fact = factMap.get(factKey);
  if (!fact) return null;
  if (typeof fact.currentValue === "string") return fact.currentValue;
  if (typeof fact.currentDisplayValue === "string" && fact.currentDisplayValue.length > 0) {
    return fact.currentDisplayValue;
  }
  return null;
}

export function getCurrentFactNumber(
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

export function pickCanonicalAnalysis(
  latestThesis:
    | {
        id: string;
        corpusSnapshotId: string | null;
      }
    | null,
  analyses: CanonicalCompletedAnalysis[]
): CanonicalCompletedAnalysis | null {
  if (analyses.length === 0) {
    return null;
  }

  const completedAnalyses = analyses.filter(
    (analysis) =>
      analysis.completedAt != null &&
      analysis.mode !== "post_call_reanalysis"
  );

  if (completedAnalyses.length === 0) {
    return null;
  }

  if (!latestThesis) {
    return completedAnalyses[0] ?? null;
  }

  const linkedByThesis = completedAnalyses.find(
    (analysis) => analysis.thesisId === latestThesis.id
  );
  if (linkedByThesis) {
    return linkedByThesis;
  }

  if (!latestThesis.corpusSnapshotId) {
    return null;
  }

  return (
    completedAnalyses.find(
      (analysis) =>
        analysis.corpusSnapshotId === latestThesis.corpusSnapshotId
    ) ?? null
  );
}

export async function loadCanonicalDealSignals(
  dealIds: string[]
): Promise<CanonicalDealSignals> {
  if (dealIds.length === 0) {
    return {
      latestThesisByDealId: new Map(),
      selectedAnalysisByDealId: new Map(),
      extractedInfoByDealId: new Map(),
      factMapByDealId: new Map(),
    };
  }

  const [latestTheses, completedAnalyses, currentFactsEntries] = await Promise.all([
    prisma.thesis.findMany({
      where: {
        dealId: { in: dealIds },
        isLatest: true,
      },
      select: {
        id: true,
        dealId: true,
        verdict: true,
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
    Promise.all(
      dealIds.map(async (dealId) => [
        dealId,
        await getCurrentFactsFromView(dealId),
      ] as const)
    ),
  ]);

  const latestThesisByDealId = new Map(
    latestTheses.map((thesis) => [thesis.dealId, thesis])
  );
  const analysesByDealId = completedAnalyses.reduce<
    Map<string, CanonicalCompletedAnalysis[]>
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

  // Read the pre-computed canonical signals from the denormalized read-model
  // (AnalysisSignalSummary) — the hot path does ZERO blob loads.
  const summaryByAnalysisId = await readAnalysisSignalSummaries(selectedAnalysisIds);

  // Self-correcting: any canonical analysis missing from the cache (cold deal,
  // schemaVersion bump, or a completion path that didn't warm the cache) falls
  // back to loadResults + extract, then re-upserts so the next read hits. Misses
  // are transient (write path + backfill keep the cache warm), so this degrades
  // gracefully to the previous behavior instead of ever showing stale data.
  const missingAnalysisIds = selectedAnalysisIds.filter(
    (analysisId) => !summaryByAnalysisId.has(analysisId)
  );
  if (missingAnalysisIds.length > 0) {
    const dealIdByAnalysisId = new Map<string, string>();
    for (const [dealId, analysis] of selectedAnalysisByDealId) {
      if (analysis?.id) {
        dealIdByAnalysisId.set(analysis.id, dealId);
      }
    }
    await Promise.all(
      missingAnalysisIds.map(async (analysisId) => {
        const results = await loadResults(analysisId);
        summaryByAnalysisId.set(analysisId, computeAnalysisSignalSummary(results));
        const dealId = dealIdByAnalysisId.get(analysisId);
        if (dealId) {
          await upsertAnalysisSignalSummary(analysisId, dealId, results);
        }
      })
    );
  }

  const extractedInfoByDealId = new Map(
    dealIds.map((dealId) => {
      const selectedAnalysis = selectedAnalysisByDealId.get(dealId) ?? null;
      const summary = selectedAnalysis
        ? summaryByAnalysisId.get(selectedAnalysis.id) ?? null
        : null;
      return [dealId, summary ? summary.extractedInfo : null] as const;
    })
  );

  const factMapByDealId = new Map(
    currentFactsEntries.map(([dealId, currentFacts]) => [
      dealId,
      buildCurrentFactMap(currentFacts),
    ])
  );

  return {
    latestThesisByDealId,
    selectedAnalysisByDealId,
    extractedInfoByDealId,
    factMapByDealId,
  };
}

export function resolveCanonicalDealFields(
  dealId: string,
  signals: CanonicalDealSignals,
  fallback: CanonicalFieldFallbacks
): CanonicalDealFields {
  const factMap = signals.factMapByDealId.get(dealId) ?? new Map();
  const extractedInfo = signals.extractedInfoByDealId.get(dealId) ?? null;

  return {
    companyName:
      getCurrentFactString(factMap, "company.name") ?? fallback.companyName,
    website: getCurrentFactString(factMap, "other.website") ?? fallback.website,
    arr: getCurrentFactNumber(factMap, "financial.arr") ?? fallback.arr,
    growthRate:
      getCurrentFactNumber(factMap, "financial.revenue_growth_yoy") ??
      fallback.growthRate,
    amountRequested:
      getCurrentFactNumber(factMap, "financial.amount_raising") ??
      fallback.amountRequested,
    valuationPre:
      getCurrentFactNumber(factMap, "financial.valuation_pre") ??
      fallback.valuationPre,
    sector:
      getCurrentFactString(factMap, "other.sector") ??
      extractedInfo?.sector ??
      fallback.sector,
    stage:
      getCurrentFactString(factMap, "product.stage") ??
      extractedInfo?.stage ??
      fallback.stage,
    instrument: fallback.instrument ?? extractedInfo?.instrument ?? null,
    geography:
      getCurrentFactString(factMap, "market.geography_primary") ??
      extractedInfo?.geography ??
      fallback.geography,
    description:
      getCurrentFactString(factMap, "product.tagline") ??
      extractedInfo?.description ??
      fallback.description,
  };
}
