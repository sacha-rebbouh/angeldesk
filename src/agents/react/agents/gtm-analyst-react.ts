/**
 * GTM Analyst Agent - ReAct Version
 *
 * Production-grade implementation using ReAct pattern for:
 * - Traceable go-to-market analysis
 * - Benchmark-anchored sales efficiency metrics
 * - Reproducible GTM scores (< 5 points variance)
 */

import { z } from "zod";
import type { ScoredFinding } from "@/scoring";
import type { EnrichedAgentContext, GTMAnalystData, GTMAnalystResult } from "../../types";
import { createReActEngine, type ReActPrompts, type ReActOutput } from "../index";
import { registerBuiltInTools } from "../tools/built-in";

registerBuiltInTools();

const GTMAnalystOutputSchema = z.object({
  strategyAssessment: z.object({
    primaryChannel: z.string(),
    channels: z.array(z.string()),
    approach: z.enum(["product_led", "sales_led", "hybrid", "unclear"]),
    clarity: z.number().min(0).max(100),
    appropriateness: z.enum(["poor", "acceptable", "good", "excellent"]),
  }),
  salesEfficiency: z.object({
    salesCycle: z.string().optional(),
    acv: z.number().optional(),
    winRate: z.number().min(0).max(100).optional(),
    pipelineCoverage: z.number().optional(),
    assessment: z.string(),
  }),
  marketingEfficiency: z.object({
    cac: z.number().optional(),
    cacPayback: z.number().optional(),
    channelMix: z.array(z.string()),
    scalability: z.enum(["low", "medium", "high"]),
  }),
  growthPotential: z.object({
    currentGrowthRate: z.number(),
    sustainabilityScore: z.number().min(0).max(100),
    growthLevers: z.array(z.string()),
    constraints: z.array(z.string()),
  }),
  gtmRisks: z.array(z.string()),
  gtmScore: z.number().min(0).max(100),
});

type GTMAnalystOutput = z.infer<typeof GTMAnalystOutputSchema>;

function buildPrompts(
  context: EnrichedAgentContext,
  extractedInfo: Record<string, unknown> | null
): ReActPrompts {
  const deal = context.deal;
  const sector = deal.sector ?? "SaaS B2B";
  const stage = deal.stage ?? "SEED";

  const metrics = {
    arr: extractedInfo?.arr ?? (deal.arr ? Number(deal.arr) : null),
    growthRate: extractedInfo?.growthRateYoY ?? (deal.growthRate ? Number(deal.growthRate) : null),
    cac: extractedInfo?.cac ?? null,
    customers: extractedInfo?.customers ?? null,
  };

  return {
    system: `You are a senior GTM analyst specializing in startup go-to-market strategy evaluation.

Your role is to:
1. Evaluate go-to-market strategy clarity and appropriateness
2. Assess sales and marketing efficiency metrics
3. Analyze growth potential and sustainability
4. Identify GTM risks and constraints
5. Score GTM maturity against stage benchmarks

CRITICAL RULES:
- ALWAYS use searchBenchmarks to get GTM benchmarks for sector/stage
- ALWAYS use calculateMetric for efficiency calculations (CAC payback, etc.)
- Strategy must be appropriate for the target market
- Growth must be evaluated for sustainability, not just rate
- Risks must be specific to the GTM approach

SCORING CRITERIA:
- 80-100: Exceptional GTM - clear strategy, strong metrics, scalable
- 60-79: Solid GTM - good strategy, reasonable metrics
- 40-59: Average GTM - unclear strategy or weak metrics
- 20-39: Weak GTM - major gaps, poor efficiency
- 0-19: Critical issues - no clear GTM, unsustainable`,

    taskDescription: `Perform a comprehensive GTM analysis:

## Deal Information
- Company: ${deal.companyName ?? deal.name}
- Sector: ${sector}
- Stage: ${stage}

## Available Metrics
${JSON.stringify(metrics, null, 2)}

## Context Engine Data
- Market Data: ${context.contextEngine?.marketData ? "Available" : "Not available"}
- Competitive Landscape: ${context.contextEngine?.competitiveLandscape ? "Available" : "Not available"}

## Your Tasks
1. Use searchBenchmarks to get GTM benchmarks for ${sector} at ${stage}
2. Use calculateMetric for CAC payback and efficiency metrics
3. Evaluate strategy clarity and appropriateness
4. Assess sales and marketing efficiency
5. Identify growth levers and constraints
6. Generate GTM score

Produce a complete GTM assessment.`,

    availableTools: "",

    outputSchema: `{
  "strategyAssessment": {
    "primaryChannel": "Direct sales|PLG|Channel|etc.",
    "channels": ["channel1", "channel2"],
    "approach": "product_led|sales_led|hybrid|unclear",
    "clarity": 0-100,
    "appropriateness": "poor|acceptable|good|excellent"
  },
  "salesEfficiency": {
    "salesCycle": "X months" (optional),
    "acv": number (optional),
    "winRate": 0-100 (optional),
    "pipelineCoverage": number (optional),
    "assessment": "Overall sales efficiency assessment"
  },
  "marketingEfficiency": {
    "cac": number (optional),
    "cacPayback": number in months (use calculateMetric),
    "channelMix": ["channel1", "channel2"],
    "scalability": "low|medium|high"
  },
  "growthPotential": {
    "currentGrowthRate": percentage,
    "sustainabilityScore": 0-100,
    "growthLevers": ["specific lever"],
    "constraints": ["specific constraint"]
  },
  "gtmRisks": ["Specific GTM risk"],
  "gtmScore": 0-100
}`,

    constraints: [
      "MUST use searchBenchmarks for GTM benchmarks",
      "MUST use calculateMetric for CAC payback",
      "PLG approach needs low CAC and high viral coefficient",
      "Sales-led B2B needs ACV > $10K to be sustainable",
      "Growth rate without context is meaningless - evaluate sustainability",
      "Early stage can have unclear GTM - adjust expectations",
    ],
  };
}

export class GTMAnalystReAct {
  readonly name = "gtm-analyst";
  readonly dependencies = ["document-extractor"];

  async run(context: EnrichedAgentContext): Promise<GTMAnalystResult> {
    const startTime = Date.now();

    const extractedInfo = this.getExtractedInfo(context);
    const prompts = buildPrompts(context, extractedInfo);

    const engine = createReActEngine<GTMAnalystOutput>(
      prompts,
      GTMAnalystOutputSchema,
      {
        maxIterations: 4,
        minIterations: 2,
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
    } as GTMAnalystResult & { _react: unknown };
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
    return findings.map((f) => ({ ...f, agentName: this.name, category: "market" as const }));
  }

  private calculateExpectedVariance(result: ReActOutput<GTMAnalystOutput>): number {
    const baseVariance = 25 * (1 - result.confidence.score / 100);
    const benchmarkedRatio = result.findings.filter((f) => f.benchmarkData).length / Math.max(1, result.findings.length);
    return Math.round(baseVariance * (1 - benchmarkedRatio * 0.5) * 10) / 10;
  }

  private getDefaultData(): GTMAnalystData {
    return {
      strategyAssessment: {
        primaryChannel: "Unknown",
        channels: [],
        approach: "unclear",
        clarity: 0,
        appropriateness: "acceptable",
      },
      salesEfficiency: { assessment: "Analysis failed" },
      marketingEfficiency: { channelMix: [], scalability: "medium" },
      growthPotential: { currentGrowthRate: 0, sustainabilityScore: 0, growthLevers: [], constraints: ["Analysis failed"] },
      gtmRisks: ["GTM analysis could not be completed"],
      gtmScore: 0,
    };
  }
}

export const gtmAnalystReAct = new GTMAnalystReAct();
