import { BaseAgent } from "../base-agent";
import type { EnrichedAgentContext, FinancialAuditResult, FinancialAuditData } from "../types";

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
  overallScore: number;
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

METRIQUES CLES A ANALYSER:
1. CROISSANCE
   - ARR Growth YoY: Seed >100%, Series A >70%, Series B >50%
   - MRR Growth MoM: >10% excellent, 5-10% bon, <5% faible

2. RETENTION & UNIT ECONOMICS
   - Net Revenue Retention (NRR): >120% excellent, 100-120% bon, <100% churn net
   - Gross Margin: SaaS >70%, Fintech >40%, Marketplace >20%
   - LTV/CAC Ratio: >3x sain, <3x attention, <1x critique
   - CAC Payback: <12 mois excellent, 12-18 bon, >18 inquietant

3. BURN & EFFICIENCE
   - Burn Multiple: <1x excellent, 1-2x bon, >2x inefficace
   - Rule of 40: Growth% + Margin% > 40% = sain
   - Runway: >18 mois = OK, 12-18 = attention, <12 = urgent

4. VALORISATION
   - Multiple ARR: Seed 15-25x, Series A 10-20x, Series B 8-15x (marche 2024-2025)
   - Comparer aux deals recents du meme secteur/stade

REGLES D'AUDIT:
- Chaque metrique doit etre positionnee en percentile vs le benchmark
- Une metrique "suspicious" = ecart >2 ecarts-types vs median OU incoherence interne
- Les red flags doivent etre factuels et chiffres
- Le score global = moyenne ponderee de la sante financiere

SCORING:
- 80-100: Metriques exceptionnelles, top tier
- 60-79: Solide, au-dessus de la moyenne
- 40-59: Dans la moyenne, quelques concerns
- 20-39: Sous la moyenne, plusieurs red flags
- 0-19: Metriques critiques, dealbreaker potentiel

OUTPUT: JSON structure uniquement.`;
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

    const prompt = `Realise un audit financier complet de ce deal:

${dealContext}
${extractedSection}
${contextEngineData}

## Metriques Disponibles
${JSON.stringify(metrics, null, 2)}

Analyse les metriques et compare-les aux benchmarks du secteur (${deal.sector || "SaaS B2B"}) et du stade (${deal.stage || "SEED"}).

Reponds en JSON avec cette structure exacte:
\`\`\`json
{
  "metricsValidation": [
    {
      "metric": "string (ex: ARR Growth YoY)",
      "reportedValue": number | "N/A",
      "benchmarkP25": number,
      "benchmarkMedian": number,
      "benchmarkP75": number,
      "percentile": number (0-100),
      "assessment": "below_average|average|above_average|exceptional|suspicious",
      "notes": "string (optionnel, si suspicious ou notable)"
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
    "benchmarkMultipleP25": number,
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
  "overallScore": number (0-100)
}
\`\`\`

IMPORTANT:
- Si une metrique n'est pas disponible, indique "N/A" ou null
- Utilise les benchmarks du Context Engine si disponibles
- Le verdict valorisation doit etre base sur des comparables reels
- Les red flags doivent etre factuels (ex: "Burn multiple de 3.5x, bien au-dessus du 2x maximum recommande")`;

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
      benchmarkMultipleP25: data.valuationAnalysis?.benchmarkMultipleP25 ?? 10,
      benchmarkMultipleMedian: data.valuationAnalysis?.benchmarkMultipleMedian ?? 15,
      benchmarkMultipleP75: data.valuationAnalysis?.benchmarkMultipleP75 ?? 25,
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
      financialRedFlags: Array.isArray(data.financialRedFlags) ? data.financialRedFlags : [],
      overallScore: Math.min(100, Math.max(0, data.overallScore ?? 50)),
    };
  }
}

export const financialAuditor = new FinancialAuditorAgent();
