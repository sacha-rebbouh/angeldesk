/**
 * Output Mapper Utilities
 *
 * Transforms SectorExpertOutput (LLM schema) to SectorExpertData (UI schema)
 * Handles enum value mappings and property name differences.
 */

import type { SectorExpertOutput } from "./base-sector-expert";
import type { SectorExpertData } from "./types";

// =============================================================================
// ENUM MAPPERS
// =============================================================================

export const mapMaturity = (m?: string): "emerging" | "growing" | "mature" | "declining" => {
  if (m === "growth") return "growing";
  if (m === "emerging" || m === "mature" || m === "declining" || m === "growing") return m;
  return "emerging";
};

export const mapAssessment = (a?: string): "exceptional" | "above_average" | "average" | "below_average" | "concerning" => {
  if (a === "critical") return "concerning";
  if (a === "exceptional" || a === "above_average" || a === "average" || a === "below_average" || a === "concerning") return a;
  return "average";
};

export const mapSeverity = (s?: string): "critical" | "major" | "minor" => {
  if (s === "high") return "major";
  if (s === "medium") return "minor";
  if (s === "critical" || s === "major" || s === "minor") return s;
  return "minor";
};

export const mapCompetition = (c?: string): "low" | "medium" | "high" | "intense" => {
  if (c === "moderate") return "medium";
  if (c === "low" || c === "medium" || c === "high" || c === "intense") return c;
  return "medium";
};

export const mapConsolidation = (c?: string): "fragmenting" | "stable" | "consolidating" => {
  if (c === "winner_take_all") return "consolidating";
  if (c === "fragmenting" || c === "stable" || c === "consolidating") return c;
  return "stable";
};

export const mapBarrier = (b?: string): "low" | "medium" | "high" => {
  if (b === "very_high") return "high";
  if (b === "low" || b === "medium" || b === "high") return b;
  return "medium";
};

export const mapRegulatoryComplexity = (c?: string): "low" | "medium" | "high" | "very_high" => {
  if (c === "very_high" || c === "low" || c === "medium" || c === "high") return c;
  return "medium";
};

export const mapCategory = (c?: string): "technical" | "business" | "regulatory" | "competitive" => {
  if (c === "business_model" || c === "unit_economics") return "business";
  if (c === "technical" || c === "business" || c === "regulatory" || c === "competitive") return c;
  return "business";
};

export const mapPriority = (p?: string): "must_ask" | "should_ask" | "nice_to_have" => {
  if (p === "critical") return "must_ask";
  if (p === "high") return "should_ask";
  if (p === "medium") return "nice_to_have";
  if (p === "must_ask" || p === "should_ask" || p === "nice_to_have") return p;
  return "should_ask";
};

// =============================================================================
// MAIN TRANSFORMER
// =============================================================================

/**
 * Transform SectorExpertOutput to SectorExpertData
 */
export function transformToSectorData(
  parsedOutput: SectorExpertOutput,
  sectorName: string,
  defaultRegulations: string[] = []
): SectorExpertData {
  return {
    sectorName,
    sectorMaturity: mapMaturity(parsedOutput.sectorFit?.sectorMaturity),
    keyMetrics: parsedOutput.metricsAnalysis?.map(m => ({
      metricName: m.metricName,
      value: m.metricValue ?? m.percentile ?? null,
      sectorBenchmark: {
        p25: m.benchmark?.p25 ?? 0,
        median: m.benchmark?.median ?? 0,
        p75: m.benchmark?.p75 ?? 0,
        topDecile: m.benchmark?.topDecile ?? 0
      },
      assessment: mapAssessment(m.assessment),
      sectorContext: m.sectorContext ?? "",
    })) ?? [],
    sectorRedFlags: parsedOutput.sectorRedFlags?.map(rf => ({
      flag: rf.flag,
      severity: mapSeverity(rf.severity),
      sectorReason: rf.sectorThreshold ?? "",
    })) ?? [],
    sectorOpportunities: parsedOutput.sectorOpportunities?.map(o => ({
      opportunity: o.opportunity,
      potential: o.potential as "high" | "medium" | "low",
      reasoning: o.sectorContext ?? "",
    })) ?? [],
    regulatoryEnvironment: {
      complexity: mapRegulatoryComplexity(parsedOutput.sectorDynamics?.regulatoryRisk?.level),
      keyRegulations: parsedOutput.sectorDynamics?.regulatoryRisk?.keyRegulations ?? defaultRegulations,
      complianceRisks: [],
      upcomingChanges: parsedOutput.sectorDynamics?.regulatoryRisk?.upcomingChanges ?? [],
    },
    sectorDynamics: {
      competitionIntensity: mapCompetition(parsedOutput.sectorDynamics?.competitionIntensity),
      consolidationTrend: mapConsolidation(parsedOutput.sectorDynamics?.consolidationTrend),
      barrierToEntry: mapBarrier(parsedOutput.sectorDynamics?.barrierToEntry),
      typicalExitMultiple: parsedOutput.sectorDynamics?.exitLandscape?.typicalMultiple?.median ?? 5,
      recentExits: parsedOutput.sectorDynamics?.exitLandscape?.recentExits?.map(
        e => `${e.company} → ${e.acquirer} (${e.multiple}x, ${e.year})`
      ) ?? [],
    },
    sectorQuestions: parsedOutput.mustAskQuestions?.map(q => ({
      question: q.question,
      category: mapCategory(q.category),
      priority: mapPriority(q.priority),
      expectedAnswer: q.goodAnswer ?? "",
      redFlagAnswer: q.redFlagAnswer ?? "",
    })) ?? [],
    sectorFit: {
      score: parsedOutput.sectorFit?.score ?? 50,
      strengths: parsedOutput.executiveSummary?.topStrengths ?? [],
      weaknesses: parsedOutput.executiveSummary?.topConcerns ?? [],
      sectorTiming: parsedOutput.sectorFit?.timingAssessment === "early_mover" ? "early" :
                    parsedOutput.sectorFit?.timingAssessment === "too_late" ? "late" : "optimal",
    },
    sectorScore: parsedOutput.executiveSummary?.sectorScore ?? parsedOutput.sectorFit?.score ?? 50,
    executiveSummary: parsedOutput.executiveSummary?.verdict ?? parsedOutput.sectorFit?.reasoning ?? "",
  };
}

/**
 * Get metric value from parsed output by metric name pattern
 */
export function getMetricValue<T>(
  parsedOutput: SectorExpertOutput,
  patterns: string[]
): T | null {
  const metric = parsedOutput.metricsAnalysis?.find(m =>
    patterns.some(p => m.metricName.toLowerCase().includes(p.toLowerCase()))
  );
  return (metric?.metricValue ?? null) as T | null;
}
