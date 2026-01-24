/**
 * Financial Auditor Agent - ReAct Version
 *
 * Production-grade implementation using ReAct pattern for:
 * - Traceable reasoning
 * - Benchmark-anchored scores
 * - Reproducible results (< 5 points variance)
 */

import { z } from "zod";
import {
  createScoredFinding,
  confidenceCalculator,
  type ScoredFinding,
  type ConfidenceScore,
} from "@/scoring";
import type { EnrichedAgentContext, FinancialAuditData, FinancialAuditResult } from "../../types";
import { createReActEngine, type ReActPrompts, type ReActOutput } from "../index";
import { toolRegistry } from "../tools/registry";
import { registerBuiltInTools } from "../tools/built-in";

// Ensure built-in tools are registered
registerBuiltInTools();

// Output schema for Zod validation
const FinancialAuditOutputSchema = z.object({
  metricsValidation: z.array(
    z.object({
      metric: z.string(),
      reportedValue: z.union([z.number(), z.string()]),
      benchmarkP25: z.number(),
      benchmarkMedian: z.number(),
      benchmarkP75: z.number(),
      percentile: z.number().min(0).max(100),
      assessment: z.enum([
        "below_average",
        "average",
        "above_average",
        "exceptional",
        "suspicious",
      ]),
      notes: z.string().optional(),
    })
  ),
  unitEconomicsHealth: z.object({
    ltv: z.number().nullable().optional(),
    cac: z.number().nullable().optional(),
    ltvCacRatio: z.number().nullable().optional(),
    cacPayback: z.number().nullable().optional(),
    assessment: z.string(),
    concerns: z.array(z.string()),
  }),
  valuationAnalysis: z.object({
    requestedValuation: z.number(),
    impliedMultiple: z.number(),
    benchmarkMultipleP25: z.number(),
    benchmarkMultipleMedian: z.number(),
    benchmarkMultipleP75: z.number(),
    verdict: z.enum(["undervalued", "fair", "aggressive", "very_aggressive"]),
    comparables: z.array(
      z.object({
        name: z.string(),
        multiple: z.number(),
        stage: z.string(),
      })
    ),
  }),
  burnAnalysis: z
    .object({
      monthlyBurn: z.number(),
      runway: z.number(),
      burnMultiple: z.number().nullable().optional(),
      efficiency: z.enum(["efficient", "moderate", "inefficient"]),
    })
    .optional(),
  financialRedFlags: z.array(z.string()),
  overallScore: z.number().min(0).max(100),
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
  };

  return {
    system: `You are a senior VC financial analyst specializing in early-stage startup audits.

Your role is to:
1. Validate reported financial metrics against industry benchmarks
2. Evaluate unit economics health (LTV/CAC, CAC payback, etc.)
3. Assess whether the requested valuation is justified
4. Identify financial red flags with specific evidence

CRITICAL RULES:
- ALWAYS use the searchBenchmarks tool to get REAL benchmark data before making assessments
- ALWAYS use calculateMetric for deterministic calculations (LTV/CAC ratio, burn multiple, etc.)
- NEVER guess benchmark values - look them up
- Position each metric as a percentile against the benchmark
- A "suspicious" metric = deviation > 2 standard deviations OR internal inconsistency
- Red flags must be factual and include specific numbers
- Your final score must be reproducible - same inputs should give same outputs

SCORING CRITERIA:
- 80-100: Exceptional metrics, top tier
- 60-79: Solid, above average
- 40-59: Average, some concerns
- 20-39: Below average, multiple red flags
- 0-19: Critical issues, potential dealbreaker`,

    taskDescription: `Perform a comprehensive financial audit of this deal:

## Deal Information
- Company: ${deal.companyName ?? deal.name}
- Sector: ${sector}
- Stage: ${stage}

## Available Metrics
${JSON.stringify(metrics, null, 2)}

## Your Tasks
1. Use searchBenchmarks to get P25/median/P75 for key metrics in ${sector} at ${stage}
2. Use calculateMetric for derived metrics (LTV/CAC ratio, burn multiple, etc.)
3. Compare each available metric to benchmarks and assign percentile
4. Analyze unit economics health
5. Evaluate the valuation (${metrics.valuationPre ?? "unknown"}) against ARR multiples
6. Identify all financial red flags with specific evidence

Produce a complete financial audit with benchmark-anchored assessments.`,

    availableTools: toolRegistry.getToolDescriptions(),

    outputSchema: `{
  "metricsValidation": [{
    "metric": "Metric Name",
    "reportedValue": number | "N/A",
    "benchmarkP25": number (from searchBenchmarks),
    "benchmarkMedian": number,
    "benchmarkP75": number,
    "percentile": 0-100 (calculated from value vs benchmark),
    "assessment": "below_average|average|above_average|exceptional|suspicious",
    "notes": "optional explanation"
  }],
  "unitEconomicsHealth": {
    "ltv": number | null,
    "cac": number | null,
    "ltvCacRatio": number | null (use calculateMetric),
    "cacPayback": number | null,
    "assessment": "overall health assessment",
    "concerns": ["specific concern 1", "..."]
  },
  "valuationAnalysis": {
    "requestedValuation": number,
    "impliedMultiple": number (valuation / ARR),
    "benchmarkMultipleP25": number (from searchBenchmarks),
    "benchmarkMultipleMedian": number,
    "benchmarkMultipleP75": number,
    "verdict": "undervalued|fair|aggressive|very_aggressive",
    "comparables": [{"name": "Company", "multiple": 15, "stage": "Seed"}]
  },
  "burnAnalysis": {
    "monthlyBurn": number,
    "runway": number (use calculateMetric),
    "burnMultiple": number | null,
    "efficiency": "efficient|moderate|inefficient"
  },
  "financialRedFlags": ["Factual red flag with numbers"],
  "overallScore": 0-100
}`,

    constraints: [
      "MUST use searchBenchmarks before assessing any metric - no guessing benchmarks",
      "MUST use calculateMetric for LTV/CAC ratio, burn multiple, runway, CAC payback",
      "Percentiles must be calculated from actual benchmark P25/median/P75 values",
      "Red flags must include specific numbers (e.g., 'Burn multiple of 3.5x exceeds 2x threshold')",
      "The overallScore must be deterministic - weighted average of metric assessments",
      "If a metric is not available, mark as 'N/A' and exclude from scoring",
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
    // minIterations: 1 allows early exit if confident (was 3, forcing unnecessary iterations)
    // earlyStopConfidence: 85 allows stopping early when confident
    const engine = createReActEngine<FinancialAuditOutput>(
      prompts,
      FinancialAuditOutputSchema,
      {
        maxIterations: 5,
        minIterations: 1,  // Changed from 3 - allow early exit if confident
        confidenceThreshold: 80,
        earlyStopConfidence: 85, // Can stop early if very confident
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

    // Enrich findings with proper categories
    const enrichedFindings = this.enrichFindings(result.findings, result.result);

    return {
      agentName: this.name,
      success: true,
      executionTimeMs: Date.now() - startTime,
      cost: result.cost,
      data: result.result,
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
  private enrichFindings(
    findings: ScoredFinding[],
    result: FinancialAuditOutput
  ): ScoredFinding[] {
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
    // Higher confidence = lower variance
    const baseVariance = 25 * (1 - result.confidence.score / 100);

    // Reduce variance for benchmark-anchored findings
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
      metricsValidation: [],
      unitEconomicsHealth: {
        assessment: "Analysis failed",
        concerns: ["Unable to complete financial audit"],
      },
      valuationAnalysis: {
        requestedValuation: 0,
        impliedMultiple: 0,
        benchmarkMultipleP25: 10,
        benchmarkMultipleMedian: 15,
        benchmarkMultipleP75: 25,
        verdict: "fair",
        comparables: [],
      },
      financialRedFlags: ["Financial audit could not be completed"],
      overallScore: 0,
    };
  }
}

// Singleton instance
export const financialAuditorReAct = new FinancialAuditorReAct();
