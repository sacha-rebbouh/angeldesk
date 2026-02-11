/**
 * Agent Score Calculator
 * Calcule des scores DETERMINISTES a partir des metriques extraites par le LLM.
 * Le LLM extrait les donnees, le CODE calcule les scores.
 *
 * F03: Separation extraction (LLM) / scoring (code deterministe)
 */

import { benchmarkService } from "./benchmark-service";
import { metricRegistry } from "./metric-registry";
import { confidenceCalculator } from "./confidence-calculator";
import type {
  ScoredFinding,
  FindingCategory,
  ConfidenceScore,
  Evidence,
} from "../types";

// ==========================================================================
// INTERFACES
// ==========================================================================

/** Metrique brute extraite par le LLM */
export interface ExtractedMetric {
  name: string;                // Ex: "arr", "burn_multiple", "ltv_cac_ratio"
  value: number | null;        // Valeur numerique extraite
  unit: string;                // "EUR", "%", "x", "months"
  source: string;              // "Slide 8", "Financial Model Onglet 3"
  dataReliability: "AUDITED" | "VERIFIED" | "DECLARED" | "PROJECTED" | "ESTIMATED" | "UNVERIFIABLE";
  category: FindingCategory;
  calculation?: string;        // Si calcule, montrer la formule
}

/** Resultat du scoring deterministe pour un agent */
export interface DeterministicScoreResult {
  score: number;               // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
  breakdown: {
    criterion: string;
    weight: number;
    score: number;
    justification: string;
  }[];
  findings: ScoredFinding[];
  confidence: number;          // 0-100
  expectedVariance: number;    // Variance attendue entre re-runs
}

/** Mapping des criteres de scoring vers les metriques */
export interface ScoringCriteriaMap {
  [criterion: string]: {
    weight: number;
    metrics: string[];
  };
}

// ==========================================================================
// SCORING CRITERIA BY AGENT
// ==========================================================================

export const FINANCIAL_AUDITOR_CRITERIA: ScoringCriteriaMap = {
  "Data Transparency": {
    weight: 25,
    metrics: ["arr", "mrr", "revenue", "gross_margin", "monthly_burn", "cash_on_hand"],
  },
  "Metrics Health": {
    weight: 25,
    metrics: ["arr_growth_yoy", "nrr", "gross_retention", "burn_multiple"],
  },
  "Valuation Rationality": {
    weight: 20,
    metrics: ["valuation_multiple", "implied_multiple"],
  },
  "Unit Economics Viability": {
    weight: 15,
    metrics: ["ltv_cac_ratio", "cac_payback_months", "ltv", "cac"],
  },
  "Burn Efficiency": {
    weight: 15,
    metrics: ["burn_multiple", "runway_months", "monthly_burn"],
  },
};

export const TEAM_INVESTIGATOR_CRITERIA: ScoringCriteriaMap = {
  "Domain Expertise": {
    weight: 25,
    metrics: ["domain_expertise", "relevant_industry_years"],
  },
  "Entrepreneurial Track": {
    weight: 25,
    metrics: ["entrepreneurial_experience", "successful_exits", "total_ventures"],
  },
  "Execution Capability": {
    weight: 20,
    metrics: ["execution_capability", "team_completeness"],
  },
  "Network & Ecosystem": {
    weight: 15,
    metrics: ["network_strength", "linkedin_verified_ratio"],
  },
  "Team Cohesion": {
    weight: 15,
    metrics: ["team_cohesion", "complementarity"],
  },
};

export const COMPETITIVE_INTEL_CRITERIA: ScoringCriteriaMap = {
  "Competitive Position": {
    weight: 30,
    metrics: ["moat_strength", "differentiation_score"],
  },
  "Market Structure": {
    weight: 20,
    metrics: ["entry_barriers", "market_concentration"],
  },
  "Threat Level": {
    weight: 25,
    metrics: ["direct_threat_level", "competitive_density"],
  },
  "Competitive Awareness": {
    weight: 25,
    metrics: ["competitors_missed_in_deck", "competitive_transparency"],
  },
};

export const MARKET_INTELLIGENCE_CRITERIA: ScoringCriteriaMap = {
  "Market Size Validation": {
    weight: 25,
    metrics: ["tam_validation", "sam_validation", "som_validation"],
  },
  "Growth Dynamics": {
    weight: 25,
    metrics: ["market_cagr", "funding_trend"],
  },
  "Market Timing": {
    weight: 25,
    metrics: ["timing_score", "adoption_stage"],
  },
  "Data Credibility": {
    weight: 25,
    metrics: ["discrepancy_level", "source_quality"],
  },
};

export const DECK_FORENSICS_CRITERIA: ScoringCriteriaMap = {
  "Narrative Coherence": {
    weight: 25,
    metrics: ["story_coherence", "credibility_assessment"],
  },
  "Claim Verification": {
    weight: 30,
    metrics: ["claims_verified_ratio", "claims_contradicted_count"],
  },
  "Deck Quality": {
    weight: 20,
    metrics: ["professionalism_score", "completeness_score", "transparency_score"],
  },
  "Consistency": {
    weight: 25,
    metrics: ["inconsistency_count", "inconsistency_severity"],
  },
};

export const LEGAL_REGULATORY_CRITERIA: ScoringCriteriaMap = {
  "Legal Structure": {
    weight: 25,
    metrics: ["structure_appropriateness", "vesting_status", "shareholder_agreement"],
  },
  "Compliance Status": {
    weight: 30,
    metrics: ["compliance_score", "gaps_count", "compliance_coverage"],
  },
  "IP Protection": {
    weight: 25,
    metrics: ["ip_protection_score", "ip_ownership_clarity"],
  },
  "Regulatory Risk": {
    weight: 20,
    metrics: ["regulatory_risk_level", "litigation_risk"],
  },
};

export const TECH_OPS_DD_CRITERIA: ScoringCriteriaMap = {
  "Product Maturity": {
    weight: 30,
    metrics: ["product_maturity_score", "product_stability"],
  },
  "Tech Team Capability": {
    weight: 30,
    metrics: ["team_seniority", "team_completeness_tech", "key_person_risk"],
  },
  "Security Posture": {
    weight: 25,
    metrics: ["security_score", "security_compliance"],
  },
  "Technical IP": {
    weight: 15,
    metrics: ["ip_tech_score", "open_source_risk"],
  },
};

export const TECH_STACK_DD_CRITERIA: ScoringCriteriaMap = {
  "Stack Quality": {
    weight: 35,
    metrics: ["stack_modernity", "stack_adequacy", "stack_maturity"],
  },
  "Scalability": {
    weight: 35,
    metrics: ["scalability_score", "architecture_quality", "bottleneck_risk"],
  },
  "Technical Debt": {
    weight: 30,
    metrics: ["tech_debt_score", "code_quality", "test_coverage"],
  },
};

export const CAP_TABLE_AUDITOR_CRITERIA: ScoringCriteriaMap = {
  "Ownership Structure": {
    weight: 25,
    metrics: ["founder_ownership", "checksum_valid", "ownership_clarity"],
  },
  "Dilution Protection": {
    weight: 30,
    metrics: ["dilution_projection", "anti_dilution_terms", "esop_adequacy"],
  },
  "Terms Fairness": {
    weight: 25,
    metrics: ["terms_fairness", "preferential_rights", "governance_balance"],
  },
  "Investor Alignment": {
    weight: 20,
    metrics: ["investor_quality", "pro_rata_coverage", "follow_on_capacity"],
  },
};

export const CUSTOMER_INTEL_CRITERIA: ScoringCriteriaMap = {
  "Customer Quality": {
    weight: 25,
    metrics: ["customer_quality_score", "icp_clarity"],
  },
  "Retention Health": {
    weight: 30,
    metrics: ["nrr_customers", "churn_rate", "gross_retention_customers"],
  },
  "PMF Signals": {
    weight: 25,
    metrics: ["pmf_score", "pmf_evidence_count"],
  },
  "Concentration Risk": {
    weight: 20,
    metrics: ["concentration_risk", "top_customer_revenue_pct"],
  },
};

export const EXIT_STRATEGIST_CRITERIA: ScoringCriteriaMap = {
  "Exit Viability": {
    weight: 30,
    metrics: ["exit_viability_score", "scenario_count"],
  },
  "Return Potential": {
    weight: 25,
    metrics: ["expected_multiple", "irr_best_case"],
  },
  "Liquidity Risk": {
    weight: 25,
    metrics: ["liquidity_risk_score", "time_to_liquidity"],
  },
  "Comparable Quality": {
    weight: 20,
    metrics: ["comparable_exits_count", "comparable_relevance"],
  },
};

export const GTM_ANALYST_CRITERIA: ScoringCriteriaMap = {
  "Channel Effectiveness": {
    weight: 30,
    metrics: ["channel_effectiveness", "primary_channel_efficiency"],
  },
  "Sales Economics": {
    weight: 25,
    metrics: ["cac_efficiency", "cac_payback_gtm", "ltv_cac_gtm"],
  },
  "GTM Scalability": {
    weight: 25,
    metrics: ["gtm_scalability", "channel_diversification"],
  },
  "Execution Quality": {
    weight: 20,
    metrics: ["gtm_execution_score", "motion_clarity"],
  },
};

export const QUESTION_MASTER_CRITERIA: ScoringCriteriaMap = {
  "Questions Relevance": {
    weight: 30,
    metrics: ["questions_relevance", "critical_questions_count"],
  },
  "DD Completeness": {
    weight: 25,
    metrics: ["dd_completeness", "checklist_coverage"],
  },
  "Negotiation Leverage": {
    weight: 20,
    metrics: ["negotiation_leverage", "leverage_points_count"],
  },
  "Risk Identification": {
    weight: 15,
    metrics: ["dealbreakers_identified", "risk_coverage"],
  },
  "Actionability": {
    weight: 10,
    metrics: ["actionability_score"],
  },
};

// ==========================================================================
// CALCULATOR
// ==========================================================================

export async function calculateAgentScore(
  agentName: string,
  extractedMetrics: ExtractedMetric[],
  sector: string,
  stage: string,
  scoringCriteria: ScoringCriteriaMap,
): Promise<DeterministicScoreResult> {
  const findings: ScoredFinding[] = [];

  // 1. Pour chaque metrique extraite, creer un ScoredFinding
  for (const metric of extractedMetrics) {
    if (metric.value === null) continue;

    // Lookup benchmark
    const benchmarkResult = await benchmarkService.lookup(sector, stage, metric.name);
    let percentile: number | undefined;
    if (benchmarkResult.found && benchmarkResult.benchmark) {
      const percentileResult = benchmarkService.calculatePercentile(
        metric.value,
        benchmarkResult.benchmark
      );
      percentile = percentileResult.percentile;
    }

    // Calculer la confidence basee sur la fiabilite des donnees
    const confidenceContext = {
      hasDirectEvidence: metric.dataReliability === "AUDITED" || metric.dataReliability === "VERIFIED",
      hasBenchmarkMatch: benchmarkResult.found,
      sourceCount: metric.dataReliability === "VERIFIED" ? 2 : 1,
      isVerified: metric.dataReliability !== "UNVERIFIABLE" && metric.dataReliability !== "ESTIMATED",
    };
    const confidence = confidenceCalculator.calculateForFinding({}, confidenceContext);

    // Calculer le score normalise via le metric registry
    let normalizedValue: number;
    const metricDef = metricRegistry.get(metric.name);
    if (metricDef && percentile !== undefined) {
      normalizedValue = percentile; // Use percentile as normalized score
    } else if (percentile !== undefined) {
      normalizedValue = percentile;
    } else {
      normalizedValue = 50; // Default when no benchmark
    }

    // Penalite si donnees projetees
    const reliabilityPenalty =
      metric.dataReliability === "PROJECTED" ? 0.7 :
      metric.dataReliability === "ESTIMATED" ? 0.8 :
      metric.dataReliability === "UNVERIFIABLE" ? 0.5 :
      1.0;

    const evidence: Evidence[] = [{
      type: metric.calculation ? "calculation" : "quote",
      content: metric.calculation || `${metric.name}: ${metric.value}`,
      source: metric.source,
      confidence: confidence.score / 100,
    }];

    if (benchmarkResult.found && benchmarkResult.benchmark) {
      evidence.push({
        type: "benchmark",
        content: `P25=${benchmarkResult.benchmark.p25} Median=${benchmarkResult.benchmark.median} P75=${benchmarkResult.benchmark.p75}`,
        source: benchmarkResult.benchmark.source,
        confidence: 0.9,
      });
    }

    const finding: ScoredFinding = {
      id: `${agentName}-${metric.name}-${Date.now()}`,
      agentName,
      metric: metric.name,
      category: metric.category,
      value: metric.value,
      unit: metric.unit,
      normalizedValue: Math.round(normalizedValue * reliabilityPenalty),
      percentile,
      assessment: `${metric.source} | Reliability: ${metric.dataReliability}`,
      benchmarkData: benchmarkResult.benchmark,
      confidence,
      evidence,
      createdAt: new Date(),
    };

    findings.push(finding);
  }

  // 2. Agreger par critere de scoring
  const breakdown: DeterministicScoreResult["breakdown"] = [];
  let totalWeightedScore = 0;
  let totalWeight = 0;

  for (const [criterion, config] of Object.entries(scoringCriteria)) {
    const relevantFindings = findings.filter(f =>
      config.metrics.includes(f.metric)
    );

    if (relevantFindings.length === 0) {
      breakdown.push({
        criterion,
        weight: config.weight,
        score: 0,
        justification: "Aucune donnee disponible pour ce critere",
      });
      continue;
    }

    // Moyenne ponderee par confidence des findings
    const totalConfWeight = relevantFindings.reduce((sum, f) => sum + (f.confidence.score / 100), 0);
    const criterionScore = totalConfWeight > 0
      ? relevantFindings.reduce((sum, f) => {
          const weight = (f.confidence.score / 100);
          return sum + (f.normalizedValue ?? 0) * weight;
        }, 0) / totalConfWeight
      : 0;

    const clampedScore = Math.min(100, Math.max(0, Math.round(criterionScore)));

    breakdown.push({
      criterion,
      weight: config.weight,
      score: clampedScore,
      justification: relevantFindings.map(f =>
        `${f.metric}: ${f.value} (P${f.percentile ?? "N/A"}, conf: ${f.confidence.score}%)`
      ).join(" | "),
    });

    totalWeightedScore += clampedScore * config.weight;
    totalWeight += config.weight;
  }

  // 3. Score final
  const rawScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 50;
  const score = Math.min(100, Math.max(0, Math.round(rawScore)));

  const getGrade = (s: number): "A" | "B" | "C" | "D" | "F" => {
    if (s >= 80) return "A";
    if (s >= 65) return "B";
    if (s >= 50) return "C";
    if (s >= 35) return "D";
    return "F";
  };

  // 4. Confidence et variance
  const avgConfidence = findings.length > 0
    ? findings.reduce((sum, f) => sum + f.confidence.score, 0) / findings.length
    : 30;

  const benchmarkedRatio = findings.filter(f => f.benchmarkData).length / Math.max(1, findings.length);
  const expectedVariance = 25 * (1 - avgConfidence / 100) * (1 - benchmarkedRatio * 0.5);

  return {
    score,
    grade: getGrade(score),
    breakdown,
    findings,
    confidence: Math.round(avgConfidence),
    expectedVariance: Math.round(expectedVariance * 10) / 10,
  };
}

/**
 * Normalise le nom d'une metrique LLM vers le format du metric registry.
 */
export function normalizeMetricName(metric: string): string {
  const lower = metric.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_");

  const mappings: Record<string, string> = {
    arr: "arr",
    annual_recurring_revenue: "arr",
    mrr: "mrr",
    monthly_recurring_revenue: "mrr",
    arr_growth: "arr_growth_yoy",
    arr_growth_yoy: "arr_growth_yoy",
    revenue_growth: "arr_growth_yoy",
    nrr: "nrr",
    net_revenue_retention: "nrr",
    gross_retention: "gross_retention",
    gross_margin: "gross_margin",
    burn_multiple: "burn_multiple",
    burn_rate: "monthly_burn",
    monthly_burn: "monthly_burn",
    runway: "runway_months",
    runway_months: "runway_months",
    valuation_multiple: "valuation_multiple",
    ltv_cac_ratio: "ltv_cac_ratio",
    ltv_cac: "ltv_cac_ratio",
    cac_payback: "cac_payback_months",
    cac_payback_months: "cac_payback_months",
    ltv: "ltv",
    cac: "cac",
    dilution: "dilution",
    revenue: "revenue",
  };

  return mappings[lower] || lower;
}
