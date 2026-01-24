import { BaseAgent } from "../base-agent";
import type { EnrichedAgentContext, FinancialAuditResult, FinancialAuditData } from "../types";
import { benchmarkService, type BenchmarkData } from "@/scoring";

/**
 * Financial Auditor Agent
 *
 * Mission: Valider les metriques financieres du deal vs benchmarks sectoriels.
 * C'est l'agent le plus critique pour un Business Angel car il repond a:
 * "Est-ce que ces chiffres sont credibles et competitifs?"
 *
 * Input:
 * - Metriques extraites du pitch deck (ARR, growth, burn, etc.)
 * - Benchmarks sectoriels du Context Engine
 * - Deals comparables pour la valorisation
 *
 * Output:
 * - Validation de chaque metrique vs benchmarks (percentile)
 * - Analyse unit economics (LTV/CAC, CAC payback)
 * - Verdict sur la valorisation demandee
 * - Red flags financiers detectes
 */

// ============================================================================
// DETERMINISTIC SCORING WEIGHTS
// ============================================================================

/** Weights for overall score calculation (must sum to 1.0) */
const SCORING_WEIGHTS = {
  growth: 0.25,        // ARR/MRR growth importance
  unitEconomics: 0.25, // LTV/CAC, CAC payback
  retention: 0.20,     // NRR, churn
  burn: 0.15,          // Burn multiple, runway
  valuation: 0.15,     // Valuation vs benchmarks
} as const;

/** Percentile to score mapping (deterministic) */
const PERCENTILE_TO_SCORE: Array<{ min: number; max: number; score: number }> = [
  { min: 90, max: 100, score: 95 },  // Exceptional
  { min: 75, max: 89, score: 80 },   // Above average
  { min: 50, max: 74, score: 65 },   // Average
  { min: 25, max: 49, score: 45 },   // Below average
  { min: 0, max: 24, score: 25 },    // Poor
];

/** Get score from percentile (deterministic) */
function percentileToScore(percentile: number): number {
  for (const range of PERCENTILE_TO_SCORE) {
    if (percentile >= range.min && percentile <= range.max) {
      return range.score;
    }
  }
  return 50; // Default fallback
}

/** Calculate deterministic overall score */
function calculateDeterministicScore(metrics: {
  growthPercentile?: number;
  ltvCacRatio?: number;
  cacPayback?: number;
  nrrPercentile?: number;
  burnMultiple?: number;
  valuationVerdict?: string;
}): number {
  let totalWeight = 0;
  let weightedScore = 0;

  // Growth component
  if (metrics.growthPercentile !== undefined) {
    weightedScore += SCORING_WEIGHTS.growth * percentileToScore(metrics.growthPercentile);
    totalWeight += SCORING_WEIGHTS.growth;
  }

  // Unit Economics component (LTV/CAC ratio)
  if (metrics.ltvCacRatio !== undefined) {
    let ueScore: number;
    if (metrics.ltvCacRatio >= 5) ueScore = 95;
    else if (metrics.ltvCacRatio >= 3) ueScore = 80;
    else if (metrics.ltvCacRatio >= 2) ueScore = 60;
    else if (metrics.ltvCacRatio >= 1) ueScore = 40;
    else ueScore = 20;

    // Adjust for CAC payback if available
    if (metrics.cacPayback !== undefined) {
      let paybackScore: number;
      if (metrics.cacPayback <= 12) paybackScore = 90;
      else if (metrics.cacPayback <= 18) paybackScore = 70;
      else if (metrics.cacPayback <= 24) paybackScore = 50;
      else paybackScore = 30;
      ueScore = (ueScore + paybackScore) / 2;
    }

    weightedScore += SCORING_WEIGHTS.unitEconomics * ueScore;
    totalWeight += SCORING_WEIGHTS.unitEconomics;
  }

  // Retention component
  if (metrics.nrrPercentile !== undefined) {
    weightedScore += SCORING_WEIGHTS.retention * percentileToScore(metrics.nrrPercentile);
    totalWeight += SCORING_WEIGHTS.retention;
  }

  // Burn component
  if (metrics.burnMultiple !== undefined) {
    let burnScore: number;
    if (metrics.burnMultiple < 1) burnScore = 95;
    else if (metrics.burnMultiple <= 1.5) burnScore = 80;
    else if (metrics.burnMultiple <= 2) burnScore = 60;
    else if (metrics.burnMultiple <= 3) burnScore = 40;
    else burnScore = 20;

    weightedScore += SCORING_WEIGHTS.burn * burnScore;
    totalWeight += SCORING_WEIGHTS.burn;
  }

  // Valuation component
  if (metrics.valuationVerdict) {
    const valuationScores: Record<string, number> = {
      undervalued: 95,
      fair: 75,
      aggressive: 45,
      very_aggressive: 25,
    };
    const valScore = valuationScores[metrics.valuationVerdict] ?? 50;
    weightedScore += SCORING_WEIGHTS.valuation * valScore;
    totalWeight += SCORING_WEIGHTS.valuation;
  }

  // Normalize if we have partial data
  if (totalWeight === 0) return 50;
  return Math.round(weightedScore / totalWeight);
}

// ============================================================================
// FALLBACK BENCHMARKS (when DB is empty)
// ============================================================================

const FALLBACK_BENCHMARKS: Record<string, Record<string, { p25: number; median: number; p75: number }>> = {
  "ARR Growth YoY": {
    PRE_SEED: { p25: 80, median: 150, p75: 250 },
    SEED: { p25: 70, median: 120, p75: 200 },
    SERIES_A: { p25: 50, median: 80, p75: 120 },
    SERIES_B: { p25: 40, median: 60, p75: 90 },
  },
  "Net Revenue Retention": {
    PRE_SEED: { p25: 90, median: 105, p75: 120 },
    SEED: { p25: 95, median: 110, p75: 130 },
    SERIES_A: { p25: 100, median: 115, p75: 140 },
    SERIES_B: { p25: 105, median: 120, p75: 150 },
  },
  "Gross Margin": {
    "SaaS B2B": { p25: 65, median: 75, p75: 85 },
    Fintech: { p25: 35, median: 50, p75: 65 },
    Marketplace: { p25: 15, median: 25, p75: 40 },
    default: { p25: 50, median: 65, p75: 80 },
  },
  "Burn Multiple": {
    PRE_SEED: { p25: 1.5, median: 2.5, p75: 4 },
    SEED: { p25: 1.2, median: 2, p75: 3 },
    SERIES_A: { p25: 1, median: 1.5, p75: 2.5 },
    SERIES_B: { p25: 0.8, median: 1.2, p75: 2 },
  },
  "Valuation Multiple": {
    PRE_SEED: { p25: 20, median: 35, p75: 60 },
    SEED: { p25: 15, median: 25, p75: 40 },
    SERIES_A: { p25: 10, median: 18, p75: 30 },
    SERIES_B: { p25: 8, median: 14, p75: 22 },
  },
  "LTV/CAC Ratio": {
    default: { p25: 2, median: 3, p75: 5 },
  },
  "CAC Payback": {
    default: { p25: 18, median: 14, p75: 10 }, // Note: lower is better
  },
};

interface LLMFinancialAuditResponse {
  metricsValidation: {
    metric: string;
    reportedValue: number | string;
    benchmarkP25: number;
    benchmarkMedian: number;
    benchmarkP75: number;
    percentile: number;
    assessment: string;
    notes?: string;
  }[];
  unitEconomicsHealth: {
    ltv?: number;
    cac?: number;
    ltvCacRatio?: number;
    cacPayback?: number;
    assessment: string;
    concerns: string[];
  };
  valuationAnalysis: {
    requestedValuation: number;
    impliedMultiple: number;
    benchmarkMultipleP25: number;
    benchmarkMultipleMedian: number;
    benchmarkMultipleP75: number;
    verdict: string;
    comparables: {
      name: string;
      multiple: number;
      stage: string;
    }[];
  };
  burnAnalysis?: {
    monthlyBurn: number;
    runway: number;
    burnMultiple?: number;
    efficiency: string;
  };
  financialRedFlags: string[];
  crossValidationIssues?: string[]; // Issues detected during cross-validation
  overallScore?: number; // Optional - we calculate deterministically
}

export class FinancialAuditorAgent extends BaseAgent<FinancialAuditData, FinancialAuditResult> {
  constructor() {
    super({
      name: "financial-auditor",
      description: "Audite les metriques financieres vs benchmarks sectoriels",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 90000,
      dependencies: ["document-extractor"],
    });
  }

  protected buildSystemPrompt(): string {
    return `Tu es un analyste financier VC senior specialise dans l'audit de startups early-stage.

TON ROLE:
- Valider les metriques financieres reportees vs benchmarks du secteur
- Evaluer la sante des unit economics
- Determiner si la valorisation demandee est justifiee
- Identifier les red flags financiers

REGLES D'AUDIT:
- Positionne chaque metrique en percentile vs le benchmark fourni
- Une metrique "suspicious" = ecart >2 ecarts-types vs median OU incoherence interne
- Les red flags doivent etre factuels et chiffres
- Verifie la coherence entre les metriques (ex: ARR vs MRR x12)

INCOHERENCES A DETECTER:
- ARR != MRR * 12 (tolerance 5%)
- Runway calcule vs declare
- Growth implique par ARR historique vs growth declare
- Unit economics vs cohorts

OUTPUT: JSON structure uniquement. Ne calcule PAS le overallScore, il sera calcule de maniere deterministe.`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<FinancialAuditData> {
    // Get deal info
    const dealContext = this.formatDealContext(context);
    const contextEngineData = this.formatContextEngineData(context);

    // Get extracted info from document-extractor
    const extractedInfo = this.getExtractedInfo(context);
    let extractedSection = "";
    if (extractedInfo) {
      extractedSection = `\n## Informations Extraites du Pitch Deck\n${JSON.stringify(extractedInfo, null, 2)}`;
    }

    // Build metrics from deal + extracted info
    const deal = context.deal;
    const sector = deal.sector || "SaaS B2B";
    const stage = deal.stage || "SEED";

    const metrics = {
      arr: extractedInfo?.arr ?? (deal.arr ? Number(deal.arr) : null),
      mrr: extractedInfo?.mrr ?? null,
      growthRate: extractedInfo?.growthRateYoY ?? (deal.growthRate ? Number(deal.growthRate) : null),
      burnRate: extractedInfo?.burnRate ?? null,
      runway: extractedInfo?.runway ?? null,
      nrr: extractedInfo?.nrr ?? null,
      churnRate: extractedInfo?.churnRate ?? null,
      cac: extractedInfo?.cac ?? null,
      ltv: extractedInfo?.ltv ?? null,
      customers: extractedInfo?.customers ?? null,
      valuationPre: extractedInfo?.valuationPre ?? (deal.valuationPre ? Number(deal.valuationPre) : null),
      amountRaising: extractedInfo?.amountRaising ?? (deal.amountRequested ? Number(deal.amountRequested) : null),
    };

    // Fetch real benchmarks from database with fallbacks
    const benchmarks = await this.fetchBenchmarks(sector, stage);

    // Build cross-validation checks (cast to expected types)
    const crossValidation = this.buildCrossValidationChecks({
      arr: typeof metrics.arr === 'number' ? metrics.arr : null,
      mrr: typeof metrics.mrr === 'number' ? metrics.mrr : null,
      growthRate: typeof metrics.growthRate === 'number' ? metrics.growthRate : null,
      burnRate: typeof metrics.burnRate === 'number' ? metrics.burnRate : null,
      runway: typeof metrics.runway === 'number' ? metrics.runway : null,
      ltv: typeof metrics.ltv === 'number' ? metrics.ltv : null,
      cac: typeof metrics.cac === 'number' ? metrics.cac : null,
    });

    const prompt = `Realise un audit financier complet de ce deal:

${dealContext}
${extractedSection}
${contextEngineData}

## Metriques Disponibles
${JSON.stringify(metrics, null, 2)}

## Benchmarks du Secteur (${sector}) et Stage (${stage})
${JSON.stringify(benchmarks, null, 2)}

## Verifications de Coherence a Effectuer
${crossValidation}

Analyse les metriques et compare-les aux benchmarks fournis ci-dessus.

Reponds en JSON avec cette structure exacte:
\`\`\`json
{
  "metricsValidation": [
    {
      "metric": "string (ex: ARR Growth YoY)",
      "reportedValue": number | "N/A",
      "benchmarkP25": number (from benchmarks above),
      "benchmarkMedian": number,
      "benchmarkP75": number,
      "percentile": number (0-100, calculated from position vs benchmarks),
      "assessment": "below_average|average|above_average|exceptional|suspicious",
      "notes": "string (optionnel, si suspicious ou incoherence detectee)"
    }
  ],
  "unitEconomicsHealth": {
    "ltv": number ou null,
    "cac": number ou null,
    "ltvCacRatio": number ou null,
    "cacPayback": number ou null (en mois),
    "assessment": "string (evaluation globale)",
    "concerns": ["string"]
  },
  "valuationAnalysis": {
    "requestedValuation": number,
    "impliedMultiple": number (valorisation / ARR),
    "benchmarkMultipleP25": number (from benchmarks),
    "benchmarkMultipleMedian": number,
    "benchmarkMultipleP75": number,
    "verdict": "undervalued|fair|aggressive|very_aggressive",
    "comparables": [
      {"name": "string", "multiple": number, "stage": "string"}
    ]
  },
  "burnAnalysis": {
    "monthlyBurn": number,
    "runway": number (en mois),
    "burnMultiple": number ou null,
    "efficiency": "efficient|moderate|inefficient"
  },
  "financialRedFlags": ["string (red flag specifique avec chiffres)"],
  "crossValidationIssues": ["string (incoherences detectees entre metriques)"]
}
\`\`\`

IMPORTANT:
- Utilise UNIQUEMENT les benchmarks fournis ci-dessus, ne les invente pas
- Verifie les coherences indiquees et signale toute incoherence
- Les red flags doivent etre factuels (ex: "Burn multiple de 3.5x, bien au-dessus du 2x maximum recommande")
- NE PAS calculer overallScore, il sera calcule de maniere deterministe`;

    const { data } = await this.llmCompleteJSON<LLMFinancialAuditResponse>(prompt);

    // Validate and normalize response
    const validAssessments = ["below_average", "average", "above_average", "exceptional", "suspicious"];
    const validVerdicts = ["undervalued", "fair", "aggressive", "very_aggressive"];
    const validEfficiency = ["efficient", "moderate", "inefficient"];

    const metricsValidation = Array.isArray(data.metricsValidation)
      ? data.metricsValidation.map((m) => ({
          metric: m.metric ?? "Unknown",
          reportedValue: m.reportedValue ?? "N/A",
          benchmarkP25: m.benchmarkP25 ?? 0,
          benchmarkMedian: m.benchmarkMedian ?? 0,
          benchmarkP75: m.benchmarkP75 ?? 0,
          percentile: Math.min(100, Math.max(0, m.percentile ?? 50)),
          assessment: validAssessments.includes(m.assessment)
            ? (m.assessment as FinancialAuditData["metricsValidation"][0]["assessment"])
            : "average",
          notes: m.notes,
        }))
      : [];

    const valuationAnalysis = {
      requestedValuation: data.valuationAnalysis?.requestedValuation ?? metrics.valuationPre ?? 0,
      impliedMultiple: data.valuationAnalysis?.impliedMultiple ?? 0,
      benchmarkMultipleP25: data.valuationAnalysis?.benchmarkMultipleP25 ?? benchmarks["Valuation Multiple"]?.p25 ?? 10,
      benchmarkMultipleMedian: data.valuationAnalysis?.benchmarkMultipleMedian ?? benchmarks["Valuation Multiple"]?.median ?? 15,
      benchmarkMultipleP75: data.valuationAnalysis?.benchmarkMultipleP75 ?? benchmarks["Valuation Multiple"]?.p75 ?? 25,
      verdict: validVerdicts.includes(data.valuationAnalysis?.verdict)
        ? (data.valuationAnalysis.verdict as FinancialAuditData["valuationAnalysis"]["verdict"])
        : "fair",
      comparables: Array.isArray(data.valuationAnalysis?.comparables)
        ? data.valuationAnalysis.comparables
        : [],
    };

    const burnAnalysis = data.burnAnalysis
      ? {
          monthlyBurn: data.burnAnalysis.monthlyBurn ?? 0,
          runway: data.burnAnalysis.runway ?? 0,
          burnMultiple: data.burnAnalysis.burnMultiple,
          efficiency: validEfficiency.includes(data.burnAnalysis.efficiency)
            ? (data.burnAnalysis.efficiency as "efficient" | "moderate" | "inefficient")
            : "moderate",
        }
      : undefined;

    // Find growth percentile from metricsValidation
    const growthMetric = metricsValidation.find(m =>
      m.metric.toLowerCase().includes("growth") || m.metric.toLowerCase().includes("arr")
    );
    const nrrMetric = metricsValidation.find(m =>
      m.metric.toLowerCase().includes("retention") || m.metric.toLowerCase().includes("nrr")
    );

    // Calculate DETERMINISTIC overall score (not from LLM)
    const deterministicScore = calculateDeterministicScore({
      growthPercentile: growthMetric?.percentile,
      ltvCacRatio: data.unitEconomicsHealth?.ltvCacRatio ?? undefined,
      cacPayback: data.unitEconomicsHealth?.cacPayback ?? undefined,
      nrrPercentile: nrrMetric?.percentile,
      burnMultiple: data.burnAnalysis?.burnMultiple ?? undefined,
      valuationVerdict: valuationAnalysis.verdict,
    });

    // Merge cross-validation issues into red flags if any
    const allRedFlags = Array.isArray(data.financialRedFlags) ? [...data.financialRedFlags] : [];
    const crossValidationIssues = (data as { crossValidationIssues?: string[] }).crossValidationIssues;
    if (Array.isArray(crossValidationIssues)) {
      for (const issue of crossValidationIssues) {
        allRedFlags.push(`[Cross-validation] ${issue}`);
      }
    }

    return {
      metricsValidation,
      unitEconomicsHealth: {
        ltv: data.unitEconomicsHealth?.ltv,
        cac: data.unitEconomicsHealth?.cac,
        ltvCacRatio: data.unitEconomicsHealth?.ltvCacRatio,
        cacPayback: data.unitEconomicsHealth?.cacPayback,
        assessment: data.unitEconomicsHealth?.assessment ?? "Donnees insuffisantes",
        concerns: Array.isArray(data.unitEconomicsHealth?.concerns)
          ? data.unitEconomicsHealth.concerns
          : [],
      },
      valuationAnalysis,
      burnAnalysis,
      financialRedFlags: allRedFlags,
      overallScore: deterministicScore, // Deterministic, not from LLM
    };
  }

  /**
   * Fetch benchmarks from database with fallbacks
   */
  private async fetchBenchmarks(
    sector: string,
    stage: string
  ): Promise<Record<string, { p25: number; median: number; p75: number; source: string }>> {
    const metricsToFetch = [
      "ARR Growth YoY",
      "Net Revenue Retention",
      "Gross Margin",
      "Burn Multiple",
      "Valuation Multiple",
      "LTV/CAC Ratio",
      "CAC Payback",
    ];

    const benchmarks: Record<string, { p25: number; median: number; p75: number; source: string }> = {};

    for (const metric of metricsToFetch) {
      const result = await benchmarkService.lookup(sector, stage, metric);

      if (result.found && result.benchmark) {
        benchmarks[metric] = {
          p25: result.benchmark.p25,
          median: result.benchmark.median,
          p75: result.benchmark.p75,
          source: result.exact ? "database" : `fallback:${result.fallbackUsed}`,
        };
      } else {
        // Use hardcoded fallback
        const fallback = this.getFallbackBenchmark(metric, sector, stage);
        if (fallback) {
          benchmarks[metric] = {
            ...fallback,
            source: "hardcoded_fallback",
          };
        }
      }
    }

    return benchmarks;
  }

  /**
   * Get fallback benchmark from hardcoded values
   */
  private getFallbackBenchmark(
    metric: string,
    sector: string,
    stage: string
  ): { p25: number; median: number; p75: number } | null {
    const metricFallbacks = FALLBACK_BENCHMARKS[metric];
    if (!metricFallbacks) return null;

    // Try stage-specific
    if (metricFallbacks[stage]) {
      return metricFallbacks[stage];
    }

    // Try sector-specific
    if (metricFallbacks[sector]) {
      return metricFallbacks[sector];
    }

    // Try default
    if (metricFallbacks.default) {
      return metricFallbacks.default;
    }

    // Try SEED as generic fallback
    if (metricFallbacks.SEED) {
      return metricFallbacks.SEED;
    }

    return null;
  }

  /**
   * Build cross-validation checks based on available metrics
   */
  private buildCrossValidationChecks(metrics: {
    arr: number | null;
    mrr: number | null;
    growthRate: number | null;
    burnRate: number | null;
    runway: number | null;
    ltv: number | null;
    cac: number | null;
  }): string {
    const checks: string[] = [];

    // ARR vs MRR consistency
    if (metrics.arr && metrics.mrr) {
      const expectedArr = metrics.mrr * 12;
      const tolerance = expectedArr * 0.05;
      checks.push(`- ARR (${metrics.arr}) devrait etre proche de MRR * 12 (${expectedArr}). Tolerance: ±5% (${tolerance})`);
    }

    // Runway consistency
    if (metrics.burnRate && metrics.runway) {
      // If we have cash info from context, we could validate runway
      checks.push(`- Runway declare (${metrics.runway} mois) doit etre coherent avec burn rate (${metrics.burnRate}/mois)`);
    }

    // LTV/CAC consistency
    if (metrics.ltv && metrics.cac) {
      const calculatedRatio = metrics.ltv / metrics.cac;
      checks.push(`- LTV/CAC calcule: ${calculatedRatio.toFixed(2)}x (LTV=${metrics.ltv}, CAC=${metrics.cac})`);
    }

    // Growth rate sanity check
    if (metrics.growthRate !== null) {
      if (metrics.growthRate > 500) {
        checks.push(`- Growth rate de ${metrics.growthRate}% est exceptionnellement eleve - verifier les donnees`);
      }
    }

    if (checks.length === 0) {
      return "Pas assez de metriques pour validation croisee.";
    }

    return checks.join("\n");
  }
}

export const financialAuditor = new FinancialAuditorAgent();
