/**
 * Financial Auditor Agent - ReAct Version
 *
 * Production-grade implementation using ReAct pattern for:
 * - BA-focused financial audit (missing data = red flag)
 * - Benchmark-anchored scores
 * - Projections analysis for early-stage
 */

import { z } from "zod";
import type { ScoredFinding } from "@/scoring";
import type { EnrichedAgentContext, FinancialAuditData, FinancialAuditResult } from "../../types";
import { createReActEngine, type ReActPrompts, type ReActOutput } from "../index";
import { toolRegistry } from "../tools/registry";
import { registerBuiltInTools } from "../tools/built-in";

// Ensure built-in tools are registered
registerBuiltInTools();

// Output schema for Zod validation - matches new BA-focused FinancialAuditData
const FinancialAuditOutputSchema = z.object({
  metricsAnalysis: z.array(
    z.object({
      metric: z.string(),
      category: z.enum(["revenue", "growth", "unit_economics", "burn", "retention"]),
      status: z.enum(["available", "missing", "suspicious"]),
      reportedValue: z.union([z.number(), z.string()]).optional(),
      benchmarkP25: z.number().optional(),
      benchmarkMedian: z.number().optional(),
      benchmarkP75: z.number().optional(),
      percentile: z.number().min(0).max(100).optional(),
      assessment: z.string(),
      investorConcern: z.string().optional(),
    })
  ),
  projectionsAnalysis: z.object({
    hasProjections: z.boolean(),
    projectionsRealistic: z.enum(["yes", "questionable", "unrealistic", "no_data"]),
    growthAssumptions: z.array(z.string()),
    redFlags: z.array(z.string()),
    keyQuestions: z.array(z.string()),
  }),
  unitEconomicsHealth: z.object({
    ltv: z.number().optional(),
    cac: z.number().optional(),
    ltvCacRatio: z.number().optional(),
    cacPayback: z.number().optional(),
    dataQuality: z.enum(["complete", "partial", "missing"]),
    assessment: z.string(),
    concerns: z.array(z.string()),
  }),
  valuationAnalysis: z.object({
    requestedValuation: z.number().optional(),
    currentRevenue: z.number().optional(),
    impliedMultiple: z.number().optional(),
    benchmarkMultipleP25: z.number(),
    benchmarkMultipleMedian: z.number(),
    benchmarkMultipleP75: z.number(),
    verdict: z.enum(["undervalued", "fair", "aggressive", "very_aggressive", "cannot_assess"]),
    justification: z.string(),
    comparables: z.array(
      z.object({
        name: z.string(),
        multiple: z.number(),
        stage: z.string(),
        source: z.string().optional(),
      })
    ),
  }),
  burnAnalysis: z.object({
    monthlyBurn: z.number().optional(),
    runway: z.number().optional(),
    burnMultiple: z.number().optional(),
    efficiency: z.enum(["efficient", "moderate", "inefficient", "unknown"]),
    analysisNote: z.string(),
  }),
  financialRedFlags: z.array(
    z.object({
      category: z.enum(["projections", "metrics", "valuation", "unit_economics", "burn", "missing_data", "inconsistency"]),
      flag: z.string(),
      evidence: z.string(),
      severity: z.enum(["critical", "high", "medium"]),
      investorConcern: z.string(),
    })
  ),
  financialQuestions: z.array(
    z.object({
      question: z.string(),
      context: z.string(),
      expectedAnswer: z.string(),
      redFlagIfNo: z.string(),
    })
  ),
  overallAssessment: z.object({
    score: z.number().min(0).max(100),
    dataCompleteness: z.enum(["complete", "partial", "minimal"]),
    summary: z.string(),
    keyRisks: z.array(z.string()),
    keyStrengths: z.array(z.string()),
  }),
});

type FinancialAuditOutput = z.infer<typeof FinancialAuditOutputSchema>;

/**
 * Build ReAct prompts for Financial Auditor
 */
function buildPrompts(
  context: EnrichedAgentContext,
  extractedInfo: Record<string, unknown> | null
): ReActPrompts {
  const deal = context.deal;
  const sector = deal.sector ?? "SaaS B2B";
  const stage = deal.stage ?? "SEED";

  const metrics = {
    arr: extractedInfo?.arr ?? (deal.arr ? Number(deal.arr) : null),
    mrr: extractedInfo?.mrr ?? null,
    growthRate:
      extractedInfo?.growthRateYoY ?? (deal.growthRate ? Number(deal.growthRate) : null),
    burnRate: extractedInfo?.burnRate ?? null,
    runway: extractedInfo?.runway ?? null,
    nrr: extractedInfo?.nrr ?? null,
    churnRate: extractedInfo?.churnRate ?? null,
    cac: extractedInfo?.cac ?? null,
    ltv: extractedInfo?.ltv ?? null,
    customers: extractedInfo?.customers ?? null,
    valuationPre:
      extractedInfo?.valuationPre ?? (deal.valuationPre ? Number(deal.valuationPre) : null),
    amountRaising:
      extractedInfo?.amountRaising ??
      (deal.amountRequested ? Number(deal.amountRequested) : null),
    // Financial data quality
    financialDataType: extractedInfo?.financialDataType ?? "unknown",
    financialDataAsOf: extractedInfo?.financialDataAsOf ?? null,
    projectionReliability: extractedInfo?.projectionReliability ?? null,
    financialRedFlags: extractedInfo?.financialRedFlags ?? [],
  };

  return {
    system: `Tu es un analyste financier VC senior avec 20+ ans d'experience.

TON ROLE: Produire un audit financier EXHAUSTIF pour un Business Angel.

RÈGLE ABSOLUE: L'ABSENCE DE DONNÉES EST UN RED FLAG.
- Un deck SEED sans ARR/MRR clair = red flag "missing_data" + question
- Pas de burn rate = red flag + question
- Pas de valorisation claire = red flag + question

METHODOLOGIE D'AUDIT OBLIGATOIRE:

1. METRIQUES A ANALYSER (minimum 5):
   Même si une metrique est absente, tu DOIS l'analyser comme "missing":
   - Revenue/ARR/MRR: présent ou absent?
   - Growth rate: calculable? réaliste?
   - Unit economics: LTV, CAC, ratio?
   - Burn rate et runway: mentionnés?
   - Retention/Churn: données disponibles?

2. PROJECTIONS (CRITIQUE pour early-stage):
   - Les startups early-stage n'ont QUE des projections
   - Analyse les projections du financial model
   - Sont-elles réalistes vs benchmarks?
   - Croissance de 200% YoY = suspect sans justification
   - Chiffres ronds (100K, 1M) = suspect

3. VALORISATION:
   - Multiple implicite = valorisation / revenue
   - Comparer aux benchmarks SEED (15x-40x ARR)
   - Si pas de revenue, comment justifier la valo?

4. RED FLAGS (minimum 5):
   - Projections hockey stick
   - Métriques manquantes critiques
   - Chiffres trop ronds
   - Incohérences entre chiffres
   - Unit economics non soutenables

5. QUESTIONS FINANCIERES (minimum 5):
   Pour CHAQUE donnée manquante ou suspecte:
   - Question précise
   - Pourquoi c'est important
   - Réponse attendue
   - Red flag si mauvaise réponse

SCORING:
- dataCompleteness "minimal" → score max 40
- dataCompleteness "partial" → score max 60
- dataCompleteness "complete" → score basé sur métriques

CRITICAL RULES:
- ALWAYS use searchBenchmarks to get REAL benchmark data
- ALWAYS use calculateMetric for deterministic calculations
- Missing data is ALWAYS a red flag
- Your final score must reflect data quality`,

    taskDescription: `AUDIT FINANCIER EXHAUSTIF:

## Deal Information
- Company: ${deal.companyName ?? deal.name}
- Sector: ${sector}
- Stage: ${stage}

## Metrics Disponibles
${JSON.stringify(metrics, null, 2)}

## Your Tasks
1. Analyse MINIMUM 5 métriques (présentes comme "available", absentes comme "missing")
2. Analyse les PROJECTIONS du financial model - sont-elles réalistes?
3. Identifie MINIMUM 5 red flags financiers
4. Génère MINIMUM 5 questions financières pour le fondateur
5. Le score doit REFLÉTER la qualité des données:
   - Données minimales (1-3 métriques) → score max 40
   - Données partielles (4-6 métriques) → score max 60
   - Données complètes (7+) → score selon performance

RAPPEL: Analyse EXHAUSTIVE requise. Moins de 5 métriques, 5 red flags, ou 5 questions = INCOMPLET.`,

    availableTools: toolRegistry.getToolDescriptions(),

    outputSchema: `{
  "metricsAnalysis": [{
    "metric": "ARR (Annual Recurring Revenue)",
    "category": "revenue|growth|unit_economics|burn|retention",
    "status": "available|missing|suspicious",
    "reportedValue": number | string | null,
    "benchmarkP25": number | null,
    "benchmarkMedian": number | null,
    "benchmarkP75": number | null,
    "percentile": 0-100 | null,
    "assessment": "Analyse DÉTAILLÉE (2-3 phrases)",
    "investorConcern": "Pourquoi le BA devrait s'inquiéter (si problème)"
  }],
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
    "impliedMultiple": number | null,
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
    "analysisNote": "Analyse du burn"
  },
  "financialRedFlags": [{
    "category": "projections|metrics|valuation|unit_economics|burn|missing_data|inconsistency",
    "flag": "Nom du red flag",
    "evidence": "Preuve concrète avec chiffres",
    "severity": "critical|high|medium",
    "investorConcern": "Impact pour le BA"
  }],
  "financialQuestions": [{
    "question": "Question précise à poser",
    "context": "Pourquoi cette question est critique",
    "expectedAnswer": "Ce qu'un bon fondateur devrait répondre",
    "redFlagIfNo": "Signal d'alarme si mauvaise réponse"
  }],
  "overallAssessment": {
    "score": 0-100 (pénalisé si données manquantes),
    "dataCompleteness": "complete|partial|minimal",
    "summary": "Résumé en 4-5 phrases pour le BA",
    "keyRisks": ["3-5 risques financiers majeurs"],
    "keyStrengths": ["Points positifs si applicable"]
  }
}`,

    constraints: [
      "MUST analyze at least 5 metrics (available OR missing)",
      "MUST analyze projections - they are critical for early-stage",
      "MUST identify at least 5 financial red flags",
      "MUST generate at least 5 financial questions",
      "Missing metrics MUST be flagged as red flags",
      "Score MUST be capped based on data completeness",
      "MUST use searchBenchmarks before making valuations assessments",
    ],
  };
}

/**
 * Financial Auditor Agent using ReAct pattern
 */
export class FinancialAuditorReAct {
  readonly name = "financial-auditor";
  readonly dependencies = ["document-extractor"];

  /**
   * Run the Financial Auditor with ReAct pattern
   */
  async run(context: EnrichedAgentContext): Promise<FinancialAuditResult> {
    const startTime = Date.now();

    // Get extracted info from document-extractor
    const extractedInfo = this.getExtractedInfo(context);

    // Build prompts
    const prompts = buildPrompts(context, extractedInfo);

    // Create ReAct engine
    const engine = createReActEngine<FinancialAuditOutput>(
      prompts,
      FinancialAuditOutputSchema,
      {
        maxIterations: 5,
        minIterations: 1,
        confidenceThreshold: 80,
        earlyStopConfidence: 85,
        enableSelfCritique: true,
        selfCritiqueThreshold: 75,
        modelComplexity: "complex",
      }
    );

    // Run the engine
    const result = await engine.run(context, this.name);

    if (!result.success) {
      return {
        agentName: this.name,
        success: false,
        executionTimeMs: Date.now() - startTime,
        cost: result.cost,
        error: result.error,
        data: this.getDefaultData(),
      };
    }

    // Apply score capping based on data completeness
    const cappedResult = this.applyScoreCapping(result.result);

    // Enrich findings with proper categories
    const enrichedFindings = this.enrichFindings(result.findings);

    return {
      agentName: this.name,
      success: true,
      executionTimeMs: Date.now() - startTime,
      cost: result.cost,
      data: cappedResult,
      // Extended data for production
      _react: {
        reasoningTrace: result.reasoningTrace,
        findings: enrichedFindings,
        confidence: result.confidence,
        expectedVariance: this.calculateExpectedVariance(result),
      },
    } as FinancialAuditResult & { _react: unknown };
  }

  /**
   * Apply score capping based on data completeness
   */
  private applyScoreCapping(data: FinancialAuditOutput): FinancialAuditOutput {
    const { dataCompleteness, score } = data.overallAssessment;
    let cappedScore = score;

    if (dataCompleteness === "minimal") {
      cappedScore = Math.min(score, 40);
    } else if (dataCompleteness === "partial") {
      cappedScore = Math.min(score, 60);
    }

    return {
      ...data,
      overallAssessment: {
        ...data.overallAssessment,
        score: cappedScore,
      },
    };
  }

  /**
   * Get extracted info from previous document-extractor run
   */
  private getExtractedInfo(
    context: EnrichedAgentContext
  ): Record<string, unknown> | null {
    const extractionResult = context.previousResults?.["document-extractor"];
    if (extractionResult?.success && "data" in extractionResult) {
      const data = extractionResult.data as { extractedInfo?: Record<string, unknown> };
      return data.extractedInfo ?? null;
    }
    return null;
  }

  /**
   * Enrich findings with proper categories and agent name
   */
  private enrichFindings(findings: ScoredFinding[]): ScoredFinding[] {
    return findings.map((f) => ({
      ...f,
      agentName: this.name,
      category: "financial" as const,
    }));
  }

  /**
   * Calculate expected variance based on confidence
   */
  private calculateExpectedVariance(result: ReActOutput<FinancialAuditOutput>): number {
    const baseVariance = 25 * (1 - result.confidence.score / 100);
    const benchmarkedRatio =
      result.findings.filter((f) => f.benchmarkData).length /
      Math.max(1, result.findings.length);
    return Math.round(baseVariance * (1 - benchmarkedRatio * 0.5) * 10) / 10;
  }

  /**
   * Get default data structure for failed runs
   */
  private getDefaultData(): FinancialAuditData {
    return {
      metricsAnalysis: [],
      projectionsAnalysis: {
        hasProjections: false,
        projectionsRealistic: "no_data",
        growthAssumptions: [],
        redFlags: [],
        keyQuestions: [],
      },
      unitEconomicsHealth: {
        dataQuality: "missing",
        assessment: "Analysis failed",
        concerns: ["Unable to complete financial audit"],
      },
      valuationAnalysis: {
        benchmarkMultipleP25: 15,
        benchmarkMultipleMedian: 25,
        benchmarkMultipleP75: 40,
        verdict: "cannot_assess",
        justification: "Unable to complete analysis",
        comparables: [],
      },
      burnAnalysis: {
        efficiency: "unknown",
        analysisNote: "Unable to analyze burn",
      },
      financialRedFlags: [{
        category: "missing_data",
        flag: "Financial audit could not be completed",
        evidence: "Analysis failed",
        severity: "critical",
        investorConcern: "No financial data available for review",
      }],
      financialQuestions: [],
      overallAssessment: {
        score: 0,
        dataCompleteness: "minimal",
        summary: "Analysis failed - unable to complete financial audit",
        keyRisks: ["Unable to assess financial health"],
        keyStrengths: [],
      },
    };
  }
}

// Singleton instance
export const financialAuditorReAct = new FinancialAuditorReAct();
