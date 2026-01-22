/**
 * Exit Strategist Agent - ReAct Version
 *
 * Production-grade implementation using ReAct pattern for:
 * - Traceable exit scenario analysis
 * - Benchmark-anchored return projections
 * - Reproducible exit scores (< 5 points variance)
 */

import { z } from "zod";
import type { ScoredFinding } from "@/scoring";
import type { EnrichedAgentContext, ExitStrategistData, ExitStrategistResult } from "../../types";
import { createReActEngine, type ReActPrompts, type ReActOutput } from "../index";
import { registerBuiltInTools } from "../tools/built-in";

registerBuiltInTools();

const ExitStrategistOutputSchema = z.object({
  exitScenarios: z.array(
    z.object({
      scenario: z.enum(["acquisition_early", "acquisition_growth", "ipo", "secondary", "failure"]),
      probability: z.enum(["low", "medium", "high"]),
      timeframe: z.string(),
      estimatedValue: z.number().optional(),
      potentialBuyers: z.array(z.string()).optional(),
      description: z.string(),
    })
  ),
  acquirerAnalysis: z.object({
    strategicBuyers: z.array(z.string()),
    financialBuyers: z.array(z.string()),
    buyerMotivation: z.string(),
    comparableAcquisitions: z.array(
      z.object({
        target: z.string(),
        acquirer: z.string(),
        value: z.number(),
        multiple: z.number(),
        year: z.number(),
      })
    ),
  }),
  returnAnalysis: z.object({
    investmentAmount: z.number(),
    ownershipPostRound: z.number(),
    scenarios: z.array(
      z.object({
        scenario: z.string(),
        exitValue: z.number(),
        dilution: z.number(),
        proceeds: z.number(),
        multiple: z.number(),
        irr: z.number(),
      })
    ),
  }),
  liquidityRisks: z.array(z.string()),
  exitScore: z.number().min(0).max(100),
});

type ExitStrategistOutput = z.infer<typeof ExitStrategistOutputSchema>;

function buildPrompts(
  context: EnrichedAgentContext,
  extractedInfo: Record<string, unknown> | null
): ReActPrompts {
  const deal = context.deal;
  const sector = deal.sector ?? "SaaS B2B";
  const stage = deal.stage ?? "SEED";

  const valuationPre = extractedInfo?.valuationPre ?? (deal.valuationPre ? Number(deal.valuationPre) : null);
  const amountRaising = extractedInfo?.amountRaising ?? (deal.amountRequested ? Number(deal.amountRequested) : null);

  return {
    system: `You are a senior investment analyst specializing in exit strategy and return modeling.

Your role is to:
1. Model realistic exit scenarios with probabilities
2. Identify potential acquirers and their motivations
3. Calculate return scenarios with dilution assumptions
4. Identify liquidity risks
5. Score exit attractiveness

CRITICAL RULES:
- ALWAYS use searchBenchmarks for comparable M&A data
- ALWAYS use calculateMetric for IRR and return calculations
- Exit multiples must be benchmarked against comparables
- Dilution assumptions must be realistic (typically 40-60% from Seed to exit)
- IPO is rarely realistic before $100M ARR

SCORING CRITERIA:
- 80-100: Exceptional exit potential - clear acquirers, strong comps, high multiples
- 60-79: Good exit potential - identified buyers, reasonable timeframe
- 40-59: Average - some exit paths, uncertain timing
- 20-39: Limited - few acquirers, long timeframe, low multiples
- 0-19: Poor - no clear exit path, distressed sector`,

    taskDescription: `Perform a comprehensive exit strategy analysis:

## Deal Information
- Company: ${deal.companyName ?? deal.name}
- Sector: ${sector}
- Stage: ${stage}
- Pre-money Valuation: ${valuationPre ? `$${(Number(valuationPre) / 1000000).toFixed(1)}M` : "Unknown"}
- Amount Raising: ${amountRaising ? `$${(Number(amountRaising) / 1000000).toFixed(1)}M` : "Unknown"}

## Context Engine Data
- Competitive Landscape: ${context.contextEngine?.competitiveLandscape ? "Available - can identify acquirers" : "Not available"}
- Deal Intelligence: ${context.contextEngine?.dealIntelligence ? "Available" : "Not available"}

## Your Tasks
1. Use searchBenchmarks for M&A multiples in ${sector}
2. Use calculateMetric for IRR calculations
3. Model 3-5 exit scenarios with probabilities
4. Identify strategic and financial buyers
5. Calculate return scenarios with dilution
6. Identify liquidity risks
7. Generate exit score

Produce a complete exit analysis.`,

    availableTools: "",

    outputSchema: `{
  "exitScenarios": [{
    "scenario": "acquisition_early|acquisition_growth|ipo|secondary|failure",
    "probability": "low|medium|high",
    "timeframe": "X-Y years",
    "estimatedValue": exit value in USD (optional),
    "potentialBuyers": ["buyer1", "buyer2"] (optional),
    "description": "Scenario description"
  }],
  "acquirerAnalysis": {
    "strategicBuyers": ["Company 1", "Company 2"],
    "financialBuyers": ["PE Firm 1"],
    "buyerMotivation": "Why would they acquire",
    "comparableAcquisitions": [{
      "target": "Company acquired",
      "acquirer": "Buyer name",
      "value": value in USD,
      "multiple": revenue or ARR multiple,
      "year": year of acquisition
    }]
  },
  "returnAnalysis": {
    "investmentAmount": amount investing,
    "ownershipPostRound": percentage ownership,
    "scenarios": [{
      "scenario": "Base case",
      "exitValue": total exit value,
      "dilution": cumulative dilution percentage,
      "proceeds": investor proceeds,
      "multiple": return multiple (use calculateMetric),
      "irr": IRR percentage (use calculateMetric)
    }]
  },
  "liquidityRisks": ["Specific liquidity risk"],
  "exitScore": 0-100
}`,

    constraints: [
      "MUST use searchBenchmarks for M&A multiples",
      "MUST use calculateMetric for IRR and return calculations",
      "Dilution from Seed to Series B typically 40-60%",
      "Dilution from Seed to exit typically 60-80%",
      "IPO requires $100M+ ARR for most SaaS",
      "5-7 year hold period is typical for VC",
      "3x+ return multiple needed for early stage",
    ],
  };
}

export class ExitStrategistReAct {
  readonly name = "exit-strategist";
  readonly dependencies = ["document-extractor"];

  async run(context: EnrichedAgentContext): Promise<ExitStrategistResult> {
    const startTime = Date.now();

    const extractedInfo = this.getExtractedInfo(context);
    const prompts = buildPrompts(context, extractedInfo);

    const engine = createReActEngine<ExitStrategistOutput>(
      prompts,
      ExitStrategistOutputSchema,
      {
        maxIterations: 5,
        minIterations: 3,
        confidenceThreshold: 70,
        enableSelfCritique: true,
        modelComplexity: "complex",
      }
    );

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

    return {
      agentName: this.name,
      success: true,
      executionTimeMs: Date.now() - startTime,
      cost: result.cost,
      data: result.result,
      _react: {
        reasoningTrace: result.reasoningTrace,
        findings: this.enrichFindings(result.findings),
        confidence: result.confidence,
        expectedVariance: this.calculateExpectedVariance(result),
      },
    } as ExitStrategistResult & { _react: unknown };
  }

  private getExtractedInfo(context: EnrichedAgentContext): Record<string, unknown> | null {
    const extractionResult = context.previousResults?.["document-extractor"];
    if (extractionResult?.success && "data" in extractionResult) {
      const data = extractionResult.data as { extractedInfo?: Record<string, unknown> };
      return data.extractedInfo ?? null;
    }
    return null;
  }

  private enrichFindings(findings: ScoredFinding[]): ScoredFinding[] {
    return findings.map((f) => ({ ...f, agentName: this.name, category: "financial" as const }));
  }

  private calculateExpectedVariance(result: ReActOutput<ExitStrategistOutput>): number {
    const baseVariance = 25 * (1 - result.confidence.score / 100);
    const benchmarkedRatio = result.findings.filter((f) => f.benchmarkData).length / Math.max(1, result.findings.length);
    return Math.round(baseVariance * (1 - benchmarkedRatio * 0.5) * 10) / 10;
  }

  private getDefaultData(): ExitStrategistData {
    return {
      exitScenarios: [],
      acquirerAnalysis: { strategicBuyers: [], financialBuyers: [], buyerMotivation: "Unknown", comparableAcquisitions: [] },
      returnAnalysis: { investmentAmount: 0, ownershipPostRound: 0, scenarios: [] },
      liquidityRisks: ["Exit analysis could not be completed"],
      exitScore: 0,
    };
  }
}

export const exitStrategistReAct = new ExitStrategistReAct();
