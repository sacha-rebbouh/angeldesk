import { BaseAgent } from "../base-agent";
import type { EnrichedAgentContext, FinancialAuditResult, FinancialAuditData } from "../types";
import { benchmarkService } from "@/scoring";

/**
 * Financial Auditor Agent
 *
 * Mission: Audit financier EXHAUSTIF pour le BA.
 *
 * RÈGLE ABSOLUE: L'absence de données EST un red flag.
 * Un deck SEED sans métriques claires = score pénalisé.
 *
 * MINIMUM ATTENDU:
 * - 5+ métriques analysées (présentes OU manquantes)
 * - Analyse des projections si disponibles
 * - 5+ red flags
 * - 5+ questions financières
 */

// ============================================================================
// BENCHMARKS
// ============================================================================

const FALLBACK_BENCHMARKS: Record<string, Record<string, { p25: number; median: number; p75: number }>> = {
  "ARR Growth YoY": {
    PRE_SEED: { p25: 80, median: 150, p75: 250 },
    SEED: { p25: 70, median: 120, p75: 200 },
    SERIES_A: { p25: 50, median: 80, p75: 120 },
  },
  "Net Revenue Retention": {
    SEED: { p25: 95, median: 110, p75: 130 },
  },
  "Burn Multiple": {
    SEED: { p25: 1.2, median: 2, p75: 3 },
  },
  "Valuation Multiple": {
    PRE_SEED: { p25: 20, median: 35, p75: 60 },
    SEED: { p25: 15, median: 25, p75: 40 },
  },
  "LTV/CAC Ratio": { default: { p25: 2, median: 3, p75: 5 } },
};

interface LLMFinancialAuditResponse {
  metricsAnalysis: {
    metric: string;
    category: "revenue" | "growth" | "unit_economics" | "burn" | "retention";
    status: "available" | "missing" | "suspicious";
    reportedValue?: number | string;
    benchmarkP25?: number;
    benchmarkMedian?: number;
    benchmarkP75?: number;
    percentile?: number;
    assessment: string;
    investorConcern?: string;
  }[];
  projectionsAnalysis: {
    hasProjections: boolean;
    projectionsRealistic: "yes" | "questionable" | "unrealistic" | "no_data";
    growthAssumptions: string[];
    redFlags: string[];
    keyQuestions: string[];
  };
  unitEconomicsHealth: {
    ltv: number | null;
    cac: number | null;
    ltvCacRatio: number | null;
    cacPayback: number | null;
    dataQuality: "complete" | "partial" | "missing";
    assessment: string;
    concerns: string[];
  };
  valuationAnalysis: {
    requestedValuation: number | null;
    currentRevenue: number | null;
    impliedMultiple: number | null;
    benchmarkMultipleP25: number;
    benchmarkMultipleMedian: number;
    benchmarkMultipleP75: number;
    verdict: "undervalued" | "fair" | "aggressive" | "very_aggressive" | "cannot_assess";
    justification: string;
    comparables: { name: string; multiple: number; stage: string; source: string }[];
  };
  burnAnalysis: {
    monthlyBurn: number | null;
    runway: number | null;
    burnMultiple: number | null;
    efficiency: "efficient" | "moderate" | "inefficient" | "unknown";
    analysisNote: string;
  };
  financialRedFlags: {
    category: "projections" | "metrics" | "valuation" | "unit_economics" | "burn" | "missing_data" | "inconsistency";
    flag: string;
    evidence: string;
    severity: "critical" | "high" | "medium";
    investorConcern: string;
  }[];
  financialQuestions: {
    question: string;
    context: string;
    expectedAnswer: string;
    redFlagIfNo: string;
  }[];
  overallAssessment: {
    score: number;
    dataCompleteness: "complete" | "partial" | "minimal";
    summary: string;
    keyRisks: string[];
    keyStrengths: string[];
  };
}

export class FinancialAuditorAgent extends BaseAgent<FinancialAuditData, FinancialAuditResult> {
  constructor() {
    super({
      name: "financial-auditor",
      description: "Audit financier exhaustif pour le BA",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 120000,
      dependencies: ["document-extractor"],
    });
  }

  protected buildSystemPrompt(): string {
    return `Tu es un analyste financier VC senior avec 20+ ans d'experience.

TON ROLE: Produire un audit financier EXHAUSTIF pour un Business Angel.

RÈGLE CRITIQUE: TU DOIS EXTRAIRE ET CITER LES CHIFFRES DES DOCUMENTS.
- Si un document contient "Revenue: 62,842€", tu DOIS le reporter
- Si un budget dit "Total 12 mois: 198,980€", tu DOIS calculer le burn mensuel (~16.5K€)
- Ne JAMAIS dire "missing" si le chiffre est dans un document

MÉTHODOLOGIE D'AUDIT:

1. EXTRACTION DES DONNÉES (OBLIGATOIRE):
   Pour CHAQUE métrique, cherche dans les documents:
   - Revenue/ARR: cherche "Revenue", "Total Revenue", "ARR", "MRR", des montants mensuels
   - Burn rate: cherche "Budget", "Cost", "Expenses", total des coûts mensuels
   - Growth: compare les chiffres sur différentes périodes
   - Si tu trouves un chiffre → status = "available" + reportedValue = le chiffre exact
   - Si vraiment absent → status = "missing"

2. CALCULS À FAIRE:
   - Si tu vois des revenues mensuels (ex: 62K€/mois) → ARR = 62K × 12 = 744K€
   - Si tu vois un budget annuel (ex: 199K€/an) → Burn mensuel = 199K / 12 = 16.5K€
   - Si tu as ARR et Burn → Burn Multiple = Burn / New ARR
   - MONTRE TES CALCULS dans l'assessment

3. ANALYSE DES PROJECTIONS:
   - Regarde les onglets Excel: CF, CALCULS, GRAPHIQUES, etc.
   - Identifie les hypothèses de croissance
   - Compare période N vs période N+1
   - Note les chiffres trop ronds (100K, 1M = suspect)

4. RED FLAGS À CHERCHER:
   - Incohérences entre documents (deck vs Excel)
   - Projections hockey stick sans justification
   - Chiffres ronds suspects
   - Unit economics non soutenables
   - Données critiques vraiment absentes

5. CITATIONS OBLIGATOIRES:
   - Pour CHAQUE donnée, cite la source: "Onglet CF: Revenue Aug-22 = 62,842€"
   - Pour CHAQUE calcul, montre le raisonnement: "ARR calculé = 62,842 × 12 = 754,112€"

SCORING:
- dataCompleteness "minimal" → score max 40
- dataCompleteness "partial" → score max 60
- dataCompleteness "complete" → score basé sur qualité des métriques`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<FinancialAuditData> {
    const dealContext = this.formatDealContext(context);
    const contextEngineData = this.formatContextEngineData(context);
    const extractedInfo = this.getExtractedInfo(context);

    let extractedSection = "";
    if (extractedInfo) {
      extractedSection = `\n## Données Extraites du Pitch Deck\n${JSON.stringify(extractedInfo, null, 2)}`;
    }

    // Get raw financial model content (Excel with multiple sheets)
    const financialModelContent = this.getFinancialModelContent(context);
    let financialModelSection = "";
    if (financialModelContent) {
      financialModelSection = `\n## FINANCIAL MODEL EXCEL (ANALYSE CHAQUE ONGLET)\n${financialModelContent}`;
    }

    const deal = context.deal;
    const sector = deal.sector || "SaaS B2B";
    const stage = deal.stage || "SEED";

    // Build metrics object for context
    const metrics = {
      arr: extractedInfo?.arr ?? null,
      mrr: extractedInfo?.mrr ?? null,
      revenue: extractedInfo?.revenue ?? null,
      growthRate: extractedInfo?.growthRateYoY ?? null,
      burnRate: extractedInfo?.burnRate ?? null,
      runway: extractedInfo?.runway ?? null,
      nrr: extractedInfo?.nrr ?? null,
      churnRate: extractedInfo?.churnRate ?? null,
      cac: extractedInfo?.cac ?? null,
      ltv: extractedInfo?.ltv ?? null,
      customers: extractedInfo?.customers ?? null,
      valuationPre: extractedInfo?.valuationPre ?? null,
      amountRaising: extractedInfo?.amountRaising ?? null,
      // Financial data context
      financialDataType: extractedInfo?.financialDataType ?? "unknown",
      financialDataAsOf: extractedInfo?.financialDataAsOf ?? null,
      projectionReliability: extractedInfo?.projectionReliability ?? null,
      financialRedFlags: extractedInfo?.financialRedFlags ?? [],
    };

    const benchmarks = await this.fetchBenchmarks(sector, stage);

    // Count available metrics
    const availableMetrics = Object.entries(metrics)
      .filter(([k, v]) => v !== null && !k.startsWith("financial"))
      .length;

    const prompt = `AUDIT FINANCIER EXHAUSTIF:

${dealContext}
${extractedSection}
${financialModelSection}
${contextEngineData}

## Métriques Pré-extraites (${availableMetrics} sur 13)
${JSON.stringify(metrics, null, 2)}

## Benchmarks ${sector} - ${stage}
${JSON.stringify(benchmarks, null, 2)}

═══════════════════════════════════════════════════════════════
INSTRUCTIONS CRITIQUES - LIS ATTENTIVEMENT
═══════════════════════════════════════════════════════════════

⚠️ TU DOIS EXTRAIRE LES CHIFFRES DES DOCUMENTS CI-DESSUS.
⚠️ NE DIS PAS "missing" SI UN CHIFFRE EST DANS UN DOCUMENT.
⚠️ CITE tes sources: "Onglet CF: Total Revenue Aug-22 = 62,842€"

ÉTAPE 1 - EXTRACTION (OBLIGATOIRE):
Relis les documents et TROUVE:
- Revenue/MRR: cherche "Total Revenue", montants en €
- Burn/Costs: cherche "Budget", "Cost", "Expenses"
- Projections: cherche les chiffres par période (mois, année)

ÉTAPE 2 - CALCULS:
- ARR = MRR × 12 (ou Revenue mensuel × 12)
- Burn mensuel = Budget annuel / 12
- Growth = (Revenue N+1 - Revenue N) / Revenue N

ÉTAPE 3 - ANALYSE:
- Compare aux benchmarks fournis
- Identifie les incohérences
- Note les chiffres suspects (trop ronds, croissance irréaliste)

MINIMUM REQUIS:
- 5 métriques analysées avec chiffres RÉELS extraits des documents
- 5 red flags avec preuves CHIFFRÉES
- 5 questions financières pertinentes

FORMAT JSON ATTENDU:
\`\`\`json
{
  "metricsAnalysis": [
    {
      "metric": "Revenue Mensuel",
      "category": "revenue",
      "status": "available",
      "reportedValue": 62842,
      "benchmarkP25": null,
      "benchmarkMedian": null,
      "benchmarkP75": null,
      "percentile": null,
      "assessment": "Onglet CF montre Total Revenue Aug-22 = 62,842€. ARR implicite = 754K€. Croissance visible: 62,842€ → 65,856€ sur 5 mois (+4.8%).",
      "investorConcern": null
    },
    {
      "metric": "Burn Rate Mensuel",
      "category": "burn",
      "status": "available",
      "reportedValue": 16582,
      "assessment": "Budget total 12 mois = 198,980€ (onglet BUDGET). Burn mensuel = 16,582€. Principaux coûts: Technical Team 49%, Legal Fees 14%.",
      "investorConcern": null
    }
  ],
  "projectionsAnalysis": {
    "hasProjections": boolean,
    "projectionsRealistic": "yes|questionable|unrealistic|no_data",
    "growthAssumptions": ["Hypothèses de croissance identifiées"],
    "redFlags": ["Problèmes dans les projections"],
    "keyQuestions": ["Questions sur les projections"]
  },
  "unitEconomicsHealth": {
    "ltv": number | null,
    "cac": number | null,
    "ltvCacRatio": number | null,
    "cacPayback": number | null,
    "dataQuality": "complete|partial|missing",
    "assessment": "Évaluation détaillée",
    "concerns": ["Problèmes identifiés"]
  },
  "valuationAnalysis": {
    "requestedValuation": number | null,
    "currentRevenue": number | null,
    "impliedMultiple": number | null (valo/revenue),
    "benchmarkMultipleP25": 15,
    "benchmarkMultipleMedian": 25,
    "benchmarkMultipleP75": 40,
    "verdict": "undervalued|fair|aggressive|very_aggressive|cannot_assess",
    "justification": "Pourquoi ce verdict (2-3 phrases)",
    "comparables": [{"name": "Startup", "multiple": 20, "stage": "SEED", "source": "Crunchbase"}]
  },
  "burnAnalysis": {
    "monthlyBurn": number | null,
    "runway": number | null,
    "burnMultiple": number | null,
    "efficiency": "efficient|moderate|inefficient|unknown",
    "analysisNote": "Analyse du burn (ou pourquoi données manquantes)"
  },
  "financialRedFlags": [
    {
      "category": "projections|metrics|valuation|unit_economics|burn|missing_data|inconsistency",
      "flag": "Nom du red flag",
      "evidence": "Preuve concrète avec chiffres",
      "severity": "critical|high|medium",
      "investorConcern": "Impact pour le BA"
    }
  ],
  "financialQuestions": [
    {
      "question": "Question précise à poser",
      "context": "Pourquoi cette question est critique",
      "expectedAnswer": "Ce qu'un bon fondateur devrait répondre",
      "redFlagIfNo": "Signal d'alarme si mauvaise réponse"
    }
  ],
  "overallAssessment": {
    "score": number (0-100, pénalisé si données manquantes),
    "dataCompleteness": "complete|partial|minimal",
    "summary": "Résumé en 4-5 phrases pour le BA",
    "keyRisks": ["3-5 risques financiers majeurs"],
    "keyStrengths": ["Points positifs si applicable"]
  }
}
\`\`\`

RAPPEL: Analyse EXHAUSTIVE requise. Moins de 5 métriques, 5 red flags, ou 5 questions = INCOMPLET.`;

    const { data } = await this.llmCompleteJSON<LLMFinancialAuditResponse>(prompt);

    // Validate response
    const validCategories = ["revenue", "growth", "unit_economics", "burn", "retention"];
    const validStatuses = ["available", "missing", "suspicious"];
    const validRedFlagCategories = ["projections", "metrics", "valuation", "unit_economics", "burn", "missing_data", "inconsistency"];
    const validVerdicts = ["undervalued", "fair", "aggressive", "very_aggressive", "cannot_assess"];
    const validEfficiency = ["efficient", "moderate", "inefficient", "unknown"];
    const validCompleteness = ["complete", "partial", "minimal"];
    const validProjectionRealism = ["yes", "questionable", "unrealistic", "no_data"];

    const metricsAnalysis = Array.isArray(data.metricsAnalysis)
      ? data.metricsAnalysis.map(m => ({
          metric: m.metric ?? "Unknown",
          category: validCategories.includes(m.category) ? m.category : "revenue",
          status: validStatuses.includes(m.status) ? m.status : "missing",
          reportedValue: m.reportedValue,
          benchmarkP25: m.benchmarkP25,
          benchmarkMedian: m.benchmarkMedian,
          benchmarkP75: m.benchmarkP75,
          percentile: m.percentile,
          assessment: m.assessment ?? "",
          investorConcern: m.investorConcern,
        }))
      : [];

    const projectionsAnalysis = {
      hasProjections: data.projectionsAnalysis?.hasProjections ?? false,
      projectionsRealistic: validProjectionRealism.includes(data.projectionsAnalysis?.projectionsRealistic ?? "")
        ? data.projectionsAnalysis!.projectionsRealistic
        : "no_data",
      growthAssumptions: Array.isArray(data.projectionsAnalysis?.growthAssumptions)
        ? data.projectionsAnalysis.growthAssumptions
        : [],
      redFlags: Array.isArray(data.projectionsAnalysis?.redFlags)
        ? data.projectionsAnalysis.redFlags
        : [],
      keyQuestions: Array.isArray(data.projectionsAnalysis?.keyQuestions)
        ? data.projectionsAnalysis.keyQuestions
        : [],
    };

    const unitEconomicsHealth = {
      ltv: data.unitEconomicsHealth?.ltv ?? undefined,
      cac: data.unitEconomicsHealth?.cac ?? undefined,
      ltvCacRatio: data.unitEconomicsHealth?.ltvCacRatio ?? undefined,
      cacPayback: data.unitEconomicsHealth?.cacPayback ?? undefined,
      dataQuality: validCompleteness.includes(data.unitEconomicsHealth?.dataQuality ?? "")
        ? data.unitEconomicsHealth!.dataQuality
        : "missing",
      assessment: data.unitEconomicsHealth?.assessment ?? "Données insuffisantes",
      concerns: Array.isArray(data.unitEconomicsHealth?.concerns)
        ? data.unitEconomicsHealth.concerns
        : [],
    };

    const valuationAnalysis = {
      requestedValuation: data.valuationAnalysis?.requestedValuation ?? undefined,
      currentRevenue: data.valuationAnalysis?.currentRevenue ?? undefined,
      impliedMultiple: data.valuationAnalysis?.impliedMultiple ?? undefined,
      benchmarkMultipleP25: data.valuationAnalysis?.benchmarkMultipleP25 ?? 15,
      benchmarkMultipleMedian: data.valuationAnalysis?.benchmarkMultipleMedian ?? 25,
      benchmarkMultipleP75: data.valuationAnalysis?.benchmarkMultipleP75 ?? 40,
      verdict: validVerdicts.includes(data.valuationAnalysis?.verdict ?? "")
        ? data.valuationAnalysis!.verdict
        : "cannot_assess",
      justification: data.valuationAnalysis?.justification ?? "",
      comparables: Array.isArray(data.valuationAnalysis?.comparables)
        ? data.valuationAnalysis.comparables.map(c => ({
            name: c.name ?? "Unknown",
            multiple: c.multiple ?? 0,
            stage: c.stage ?? "SEED",
            source: c.source,
          }))
        : [],
    };

    const burnAnalysis = {
      monthlyBurn: data.burnAnalysis?.monthlyBurn ?? undefined,
      runway: data.burnAnalysis?.runway ?? undefined,
      burnMultiple: data.burnAnalysis?.burnMultiple ?? undefined,
      efficiency: validEfficiency.includes(data.burnAnalysis?.efficiency ?? "")
        ? data.burnAnalysis!.efficiency
        : "unknown",
      analysisNote: data.burnAnalysis?.analysisNote ?? "",
    };

    const financialRedFlags = Array.isArray(data.financialRedFlags)
      ? data.financialRedFlags.map(rf => ({
          category: validRedFlagCategories.includes(rf.category) ? rf.category : "metrics",
          flag: rf.flag ?? "",
          evidence: rf.evidence ?? "",
          severity: (["critical", "high", "medium"] as const).includes(rf.severity as "critical" | "high" | "medium")
            ? rf.severity
            : "medium",
          investorConcern: rf.investorConcern ?? "",
        }))
      : [];

    const financialQuestions = Array.isArray(data.financialQuestions)
      ? data.financialQuestions.map(q => ({
          question: q.question ?? "",
          context: q.context ?? "",
          expectedAnswer: q.expectedAnswer ?? "",
          redFlagIfNo: q.redFlagIfNo ?? "",
        }))
      : [];

    // Determine data completeness and cap score
    const dataCompleteness = validCompleteness.includes(data.overallAssessment?.dataCompleteness ?? "")
      ? data.overallAssessment!.dataCompleteness
      : "minimal";

    let score = data.overallAssessment?.score ?? 50;
    // Cap score based on data completeness
    if (dataCompleteness === "minimal") {
      score = Math.min(score, 40);
    } else if (dataCompleteness === "partial") {
      score = Math.min(score, 60);
    }

    const overallAssessment = {
      score,
      dataCompleteness,
      summary: data.overallAssessment?.summary ?? "",
      keyRisks: Array.isArray(data.overallAssessment?.keyRisks)
        ? data.overallAssessment.keyRisks
        : [],
      keyStrengths: Array.isArray(data.overallAssessment?.keyStrengths)
        ? data.overallAssessment.keyStrengths
        : [],
    };

    return {
      metricsAnalysis,
      projectionsAnalysis,
      unitEconomicsHealth,
      valuationAnalysis,
      burnAnalysis,
      financialRedFlags,
      financialQuestions,
      overallAssessment,
    };
  }

  private async fetchBenchmarks(
    sector: string,
    stage: string
  ): Promise<Record<string, { p25: number; median: number; p75: number; source: string }>> {
    const metricsToFetch = [
      "ARR Growth YoY",
      "Net Revenue Retention",
      "Burn Multiple",
      "Valuation Multiple",
      "LTV/CAC Ratio",
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
        const fallback = this.getFallbackBenchmark(metric, stage);
        if (fallback) {
          benchmarks[metric] = { ...fallback, source: "hardcoded_fallback" };
        }
      }
    }

    return benchmarks;
  }

  private getFallbackBenchmark(
    metric: string,
    stage: string
  ): { p25: number; median: number; p75: number } | null {
    const metricFallbacks = FALLBACK_BENCHMARKS[metric];
    if (!metricFallbacks) return null;

    if (metricFallbacks[stage]) return metricFallbacks[stage];
    if (metricFallbacks.default) return metricFallbacks.default;
    if (metricFallbacks.SEED) return metricFallbacks.SEED;

    return null;
  }
}

export const financialAuditor = new FinancialAuditorAgent();
