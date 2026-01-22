/**
 * Triangulation Engine
 *
 * Increases confidence by cross-referencing multiple data sources.
 * When multiple sources agree on a data point, confidence increases.
 *
 * Key principles:
 * 1. More sources = higher confidence
 * 2. Agreement between sources = higher confidence
 * 3. Official sources (Companies House, SEC) = higher weight
 * 4. Recency matters - newer data gets higher confidence
 */

import type { ConfidenceScore, ConfidenceFactor } from "@/scoring/types";
import type { DataSource, SimilarDeal, Competitor, NewsArticle } from "./types";

// ============================================================================
// TYPES
// ============================================================================

export interface TriangulationResult {
  confidence: ConfidenceScore;
  sourcesUsed: DataSource[];
  agreementLevel: "strong" | "moderate" | "weak" | "none";
  dataPoints: TriangulatedDataPoint[];
}

export interface TriangulatedDataPoint {
  field: string;
  values: {
    value: string | number;
    source: string;
    confidence: number;
  }[];
  consensus?: string | number;
  agreement: number; // 0-1
}

export interface TriangulationInput {
  deals?: SimilarDeal[];
  competitors?: Competitor[];
  news?: NewsArticle[];
  sources: DataSource[];
}

// ============================================================================
// SOURCE WEIGHTS
// Official/verified sources get higher weight
// ============================================================================

const SOURCE_WEIGHTS: Record<string, number> = {
  // Official sources (highest)
  "Companies House UK": 1.0,
  "SEC EDGAR": 1.0,
  crunchbase: 0.9,
  dealroom: 0.9,
  pitchbook: 0.9,

  // Verified data sources
  "Y Combinator Companies": 0.85,
  linkedin: 0.8,

  // News and search (medium)
  news_api: 0.7,
  "RSS Feeds (TechCrunch, Maddyness, Sifted)": 0.7,
  web_search: 0.6,
};

function getSourceWeight(source: DataSource | string): number {
  const name = typeof source === "string" ? source : source.name;
  return SOURCE_WEIGHTS[name] ?? 0.5;
}

// ============================================================================
// TRIANGULATION FUNCTIONS
// ============================================================================

/**
 * Calculate confidence based on source triangulation
 */
export function triangulateConfidence(input: TriangulationInput): TriangulationResult {
  const { sources } = input;
  const dataPoints: TriangulatedDataPoint[] = [];

  // Count unique source types
  const sourceTypes = new Set(sources.map((s) => s.type));
  const sourceCount = sourceTypes.size;

  // Calculate weighted source score
  const weightedSourceScore = sources.reduce(
    (sum, s) => sum + getSourceWeight(s) * s.confidence,
    0
  );
  const avgSourceScore = sources.length > 0 ? weightedSourceScore / sources.length : 0;

  // Triangulate deals if provided
  if (input.deals && input.deals.length > 0) {
    const dealTriangulation = triangulateDealData(input.deals);
    dataPoints.push(...dealTriangulation.dataPoints);
  }

  // Triangulate competitors if provided
  if (input.competitors && input.competitors.length > 0) {
    const compTriangulation = triangulateCompetitorData(input.competitors);
    dataPoints.push(...compTriangulation.dataPoints);
  }

  // Calculate overall agreement
  const overallAgreement = dataPoints.length > 0
    ? dataPoints.reduce((sum, dp) => sum + dp.agreement, 0) / dataPoints.length
    : 0;

  // Determine agreement level
  let agreementLevel: "strong" | "moderate" | "weak" | "none" = "none";
  if (overallAgreement >= 0.8) agreementLevel = "strong";
  else if (overallAgreement >= 0.5) agreementLevel = "moderate";
  else if (overallAgreement >= 0.2) agreementLevel = "weak";

  // Calculate confidence factors
  const factors: ConfidenceFactor[] = [
    {
      name: "Source Count",
      weight: 0.25,
      score: Math.min(100, sourceCount * 25), // Max at 4+ sources
      reason: `${sourceCount} source${sourceCount > 1 ? "s" : ""} consulted`,
    },
    {
      name: "Source Quality",
      weight: 0.25,
      score: Math.round(avgSourceScore * 100),
      reason: getSourceQualityReason(avgSourceScore),
    },
    {
      name: "Data Agreement",
      weight: 0.30,
      score: Math.round(overallAgreement * 100),
      reason: getAgreementReason(agreementLevel),
    },
    {
      name: "Data Coverage",
      weight: 0.20,
      score: Math.round(calculateDataCoverage(input) * 100),
      reason: getDataCoverageReason(input),
    },
  ];

  // Calculate final score
  const finalScore = Math.round(
    factors.reduce((sum, f) => sum + f.score * f.weight, 0)
  );

  // Determine confidence level
  let level: "high" | "medium" | "low" | "insufficient" = "insufficient";
  if (finalScore >= 75) level = "high";
  else if (finalScore >= 50) level = "medium";
  else if (finalScore >= 25) level = "low";

  return {
    confidence: {
      level,
      score: finalScore,
      factors,
    },
    sourcesUsed: sources,
    agreementLevel,
    dataPoints,
  };
}

/**
 * Triangulate deal data from multiple sources
 */
function triangulateDealData(deals: SimilarDeal[]): {
  dataPoints: TriangulatedDataPoint[];
} {
  const dataPoints: TriangulatedDataPoint[] = [];

  // Group deals by company name
  const byCompany = new Map<string, SimilarDeal[]>();
  for (const deal of deals) {
    const key = deal.companyName.toLowerCase();
    const list = byCompany.get(key) ?? [];
    list.push(deal);
    byCompany.set(key, list);
  }

  // Check for funding amount agreement
  for (const [company, companyDeals] of byCompany.entries()) {
    if (companyDeals.length > 1) {
      const fundingValues = companyDeals
        .filter((d) => d.fundingAmount)
        .map((d) => ({
          value: d.fundingAmount,
          source: d.source.name,
          confidence: d.source.confidence,
        }));

      if (fundingValues.length > 1) {
        const agreement = calculateNumericAgreement(
          fundingValues.map((v) => v.value)
        );
        dataPoints.push({
          field: `${company}:fundingAmount`,
          values: fundingValues,
          consensus: getMedian(fundingValues.map((v) => v.value)),
          agreement,
        });
      }
    }
  }

  // Check for valuation multiple agreement
  const multiples = deals
    .filter((d) => d.valuationMultiple)
    .map((d) => ({
      value: d.valuationMultiple!,
      source: d.source.name,
      confidence: d.source.confidence,
    }));

  if (multiples.length > 1) {
    const agreement = calculateNumericAgreement(multiples.map((v) => v.value));
    dataPoints.push({
      field: "market:valuationMultiple",
      values: multiples,
      consensus: getMedian(multiples.map((v) => v.value)),
      agreement,
    });
  }

  return { dataPoints };
}

/**
 * Triangulate competitor data from multiple sources
 */
function triangulateCompetitorData(competitors: Competitor[]): {
  dataPoints: TriangulatedDataPoint[];
} {
  const dataPoints: TriangulatedDataPoint[] = [];

  // Group by competitor name
  const byName = new Map<string, Competitor[]>();
  for (const comp of competitors) {
    const key = comp.name.toLowerCase();
    const list = byName.get(key) ?? [];
    list.push(comp);
    byName.set(key, list);
  }

  // Check for funding total agreement
  for (const [name, comps] of byName.entries()) {
    if (comps.length > 1) {
      const fundingValues = comps
        .filter((c) => c.totalFunding)
        .map((c) => ({
          value: c.totalFunding!,
          source: c.source.name,
          confidence: c.source.confidence,
        }));

      if (fundingValues.length > 1) {
        const agreement = calculateNumericAgreement(
          fundingValues.map((v) => v.value)
        );
        dataPoints.push({
          field: `competitor:${name}:funding`,
          values: fundingValues,
          consensus: getMedian(fundingValues.map((v) => v.value)),
          agreement,
        });
      }
    }
  }

  return { dataPoints };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate agreement for numeric values (0-1)
 * Values within 20% of median are considered agreeing
 */
function calculateNumericAgreement(values: number[]): number {
  if (values.length < 2) return 1;

  const median = getMedian(values);
  const threshold = median * 0.2; // 20% tolerance

  const agreeing = values.filter((v) => Math.abs(v - median) <= threshold);
  return agreeing.length / values.length;
}

/**
 * Get median of numeric array
 */
function getMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calculate data coverage score (0-1)
 */
function calculateDataCoverage(input: TriangulationInput): number {
  let coverage = 0;
  let total = 4;

  if (input.deals && input.deals.length > 0) coverage += 1;
  if (input.competitors && input.competitors.length > 0) coverage += 1;
  if (input.news && input.news.length > 0) coverage += 1;
  if (input.sources.length >= 3) coverage += 1;

  return coverage / total;
}

/**
 * Get human-readable reason for source quality
 */
function getSourceQualityReason(score: number): string {
  if (score >= 0.9) return "Official and verified sources (Companies House, Crunchbase)";
  if (score >= 0.7) return "Mix of verified and news sources";
  if (score >= 0.5) return "Primarily news and web search sources";
  return "Limited or unverified data sources";
}

/**
 * Get human-readable reason for agreement level
 */
function getAgreementReason(level: string): string {
  switch (level) {
    case "strong":
      return "Multiple sources agree on key data points";
    case "moderate":
      return "Some agreement between sources";
    case "weak":
      return "Limited agreement, data may be inconsistent";
    default:
      return "Single source or no cross-validation possible";
  }
}

/**
 * Get human-readable reason for data coverage
 */
function getDataCoverageReason(input: TriangulationInput): string {
  const types: string[] = [];
  if (input.deals && input.deals.length > 0) types.push("deals");
  if (input.competitors && input.competitors.length > 0) types.push("competitors");
  if (input.news && input.news.length > 0) types.push("news");

  if (types.length >= 3) return "Comprehensive data across all categories";
  if (types.length === 2) return `Data available for ${types.join(" and ")}`;
  if (types.length === 1) return `Limited to ${types[0]} data only`;
  return "No structured data available";
}

// ============================================================================
// UTILITY FUNCTIONS FOR EXTERNAL USE
// ============================================================================

/**
 * Quick confidence boost calculation for when sources agree
 */
export function calculateSourceAgreementBoost(
  sourceCount: number,
  agreementLevel: "strong" | "moderate" | "weak" | "none"
): number {
  const countBoost = Math.min(sourceCount * 5, 20); // Max 20 points for 4+ sources

  const agreementBoost: Record<string, number> = {
    strong: 15,
    moderate: 8,
    weak: 3,
    none: 0,
  };

  return countBoost + agreementBoost[agreementLevel];
}

/**
 * Check if a finding should be flagged as low confidence
 */
export function isLowConfidence(confidence: ConfidenceScore): boolean {
  return confidence.level === "low" || confidence.level === "insufficient";
}

/**
 * Get improvement suggestions based on confidence factors
 */
export function getConfidenceImprovementSuggestions(
  confidence: ConfidenceScore
): string[] {
  const suggestions: string[] = [];

  for (const factor of confidence.factors) {
    if (factor.score < 50) {
      switch (factor.name) {
        case "Source Count":
          suggestions.push("Add more data sources (Crunchbase, Companies House)");
          break;
        case "Source Quality":
          suggestions.push("Verify data with official sources");
          break;
        case "Data Agreement":
          suggestions.push("Cross-check key metrics with multiple sources");
          break;
        case "Data Coverage":
          suggestions.push("Gather more data types (competitors, news, financials)");
          break;
        case "Data Availability":
          suggestions.push("Request missing information from founder");
          break;
        case "Temporal Relevance":
          suggestions.push("Update with more recent data");
          break;
      }
    }
  }

  return suggestions;
}
