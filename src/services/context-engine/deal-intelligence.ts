/**
 * Deal Intelligence — agrégation des deals similaires en contexte de valorisation.
 *
 * Règle d'honnêteté (audit HelloCoco 2026-07-20) : une médiane de multiple
 * valo/ARR n'est restituée QUE si un échantillon suffisant de multiples
 * VÉRIFIÉS existe, calibré sur le stage du deal analysé. En dessous du seuil,
 * la donnée est marquée indisponible — un chiffre faux est pire qu'une absence.
 * Interdiction de fabriquer un multiple depuis une heuristique (ex-bug :
 * french-tech `valuation/(montant×10)` → « médiane sectorielle 1.15x »).
 */
import type { ConnectorQuery, DealIntelligence, FundingContext, SimilarDeal } from "./types";

/** Seuil minimal de multiples vérifiés pour restituer une médiane défendable. */
export const MIN_MULTIPLE_SAMPLE = 5;

function normalizeStage(stage: string | undefined): string | null {
  if (!stage) return null;

  const stageLower = stage.toLowerCase().replace(/[^a-z0-9]/g, "");

  const mappings: Record<string, string> = {
    preseed: "pre_seed",
    seed: "seed",
    seriesa: "series_a",
    seriesb: "series_b",
    seriesc: "series_c",
    seriesd: "series_d",
    growth: "growth",
    latestage: "late_stage",
  };

  return mappings[stageLower] || stage.toLowerCase();
}

/**
 * Garde-fou de restitution : une médiane n'est défendable que si elle est
 * complète (médiane + quartiles) et accompagnée de sa taille d'échantillon
 * >= seuil. Les snapshots legacy (médiane fabriquée persistée sans
 * `multiplesSampleSize`) et les objets partiels (JSON persisté sans
 * quartiles) sont rejetés.
 */
export function hasDefensibleMultiples(
  fc: FundingContext | undefined
): fc is FundingContext & {
  medianValuationMultiple: number;
  p25ValuationMultiple: number;
  p75ValuationMultiple: number;
  multiplesSampleSize: number;
} {
  return (
    fc != null &&
    typeof fc.medianValuationMultiple === "number" &&
    typeof fc.p25ValuationMultiple === "number" &&
    typeof fc.p75ValuationMultiple === "number" &&
    typeof fc.multiplesSampleSize === "number" &&
    fc.multiplesSampleSize >= MIN_MULTIPLE_SAMPLE
  );
}

/**
 * Nettoie un `DealIntelligence` persisté avant toute restitution.
 *
 * Les champs de tendance sont toujours supprimés tant qu'aucun calcul réel ne
 * les produit. Un contexte sans `multiplesSampleSize` perd aussi les multiples,
 * verdicts et fourchettes non défendables ; un contexte récent incomplet perd
 * uniquement ses quartiles.
 */
export function sanitizeDealIntelligence(
  di: DealIntelligence | undefined | null
): DealIntelligence | undefined {
  if (!di) return undefined;

  const fc = di.fundingContext;
  if (fc == null) return di;

  const isLegacy = typeof fc.multiplesSampleSize !== "number";
  const cleanedFc: FundingContext = { ...fc };
  delete cleanedFc.trend;
  delete cleanedFc.trendPercentage;
  delete cleanedFc.downRoundCount;
  delete cleanedFc.period;

  if (!isLegacy) {
    // Un échantillon identifié peut conserver ses multiples vérifiés ; un
    // objet partiel sans quartiles reste impropre à la restitution.
    if (
      cleanedFc.medianValuationMultiple != null &&
      !hasDefensibleMultiples(cleanedFc)
    ) {
      delete cleanedFc.medianValuationMultiple;
      delete cleanedFc.p25ValuationMultiple;
      delete cleanedFc.p75ValuationMultiple;
    }
    return { ...di, fundingContext: cleanedFc };
  }

  delete cleanedFc.medianValuationMultiple;
  delete cleanedFc.p25ValuationMultiple;
  delete cleanedFc.p75ValuationMultiple;
  cleanedFc.multiplesSampleSize = 0;

  return {
    ...di,
    fundingContext: cleanedFc,
    similarDeals: (di.similarDeals ?? []).map((deal) =>
      deal.valuationMultiple != null ? { ...deal, valuationMultiple: undefined } : deal
    ),
    percentileRank: undefined,
    fairValueRange: undefined,
    verdict: undefined,
  };
}

export function buildDealIntelligence(
  deals: SimilarDeal[],
  query: ConnectorQuery
): DealIntelligence {
  // Calibration de stage : seuls les deals du même stage que la query portent
  // des multiples comparables (un multiple Growth ne calibre pas un Seed).
  const queryStage = normalizeStage(query.stage);
  const calibrated = queryStage
    ? deals.filter((d) => normalizeStage(d.stage) === queryStage)
    : deals;

  const multiples = calibrated
    .map((d) => d.valuationMultiple)
    .filter((m): m is number => typeof m === "number" && Number.isFinite(m) && m > 0)
    .sort((a, b) => a - b);

  const sampleSize = multiples.length;

  const fundingContext: FundingContext = {
    totalDealsInPeriod: deals.length,
    multiplesSampleSize: sampleSize,
    multiplesStage: queryStage ?? "all",
  };

  if (sampleSize >= MIN_MULTIPLE_SAMPLE) {
    fundingContext.medianValuationMultiple = multiples[Math.floor(sampleSize / 2)];
    fundingContext.p25ValuationMultiple = multiples[Math.floor(sampleSize * 0.25)];
    fundingContext.p75ValuationMultiple = multiples[Math.floor(sampleSize * 0.75)];
  }

  return {
    similarDeals: deals.slice(0, 10), // Top 10
    fundingContext,
    // percentileRank / fairValueRange / verdict volontairement absents :
    // aucun calcul réel n'existe encore — ne jamais restituer de valeur fabriquée.
  };
}
