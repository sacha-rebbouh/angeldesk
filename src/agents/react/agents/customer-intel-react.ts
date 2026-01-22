/**
 * Customer Intel Agent - ReAct Version
 *
 * Production-grade implementation using ReAct pattern for:
 * - Traceable customer analysis
 * - Product-market fit assessment
 * - Reproducible customer scores (< 5 points variance)
 */

import { z } from "zod";
import type { ScoredFinding } from "@/scoring";
import type { EnrichedAgentContext, CustomerIntelData, CustomerIntelResult } from "../../types";
import { createReActEngine, type ReActPrompts, type ReActOutput } from "../index";
import { registerBuiltInTools } from "../tools/built-in";

registerBuiltInTools();

const CustomerIntelOutputSchema = z.object({
  customerProfile: z.object({
    icp: z.string(),
    segments: z.array(z.string()),
    currentCustomers: z.number().optional(),
    notableCustomers: z.array(z.string()),
    customerQuality: z.enum(["low", "medium", "high"]),
  }),
  retentionMetrics: z.object({
    churnRate: z.number().min(0).max(100).optional(),
    netRevenueRetention: z.number().optional(),
    grossRetention: z.number().optional(),
    cohortTrends: z.enum(["improving", "stable", "declining", "unknown"]),
    assessment: z.string(),
  }),
  productMarketFit: z.object({
    signals: z.array(z.string()),
    strength: z.enum(["weak", "emerging", "moderate", "strong"]),
    evidence: z.array(z.string()),
  }),
  customerRisks: z.object({
    concentration: z.number().min(0).max(100),
    dependencyRisk: z.enum(["low", "medium", "high"]),
    churnRisk: z.enum(["low", "medium", "high"]),
    concerns: z.array(z.string()),
  }),
  expansionPotential: z.object({
    upsellOpportunity: z.enum(["low", "medium", "high"]),
    crossSellOpportunity: z.enum(["low", "medium", "high"]),
    virality: z.enum(["none", "low", "medium", "high"]),
  }),
  customerScore: z.number().min(0).max(100),
});

type CustomerIntelOutput = z.infer<typeof CustomerIntelOutputSchema>;

function buildPrompts(
  context: EnrichedAgentContext,
  extractedInfo: Record<string, unknown> | null
): ReActPrompts {
  const deal = context.deal;
  const sector = deal.sector ?? "SaaS B2B";
  const stage = deal.stage ?? "SEED";

  const metrics = {
    customers: extractedInfo?.customers ?? null,
    nrr: extractedInfo?.nrr ?? null,
    churnRate: extractedInfo?.churnRate ?? null,
    ltv: extractedInfo?.ltv ?? null,
  };

  return {
    system: `You are a senior customer analytics specialist evaluating product-market fit and customer health.

Your role is to:
1. Analyze customer profile and ICP clarity
2. Evaluate retention metrics against benchmarks
3. Assess product-market fit strength
4. Identify customer concentration and dependency risks
5. Evaluate expansion potential

CRITICAL RULES:
- ALWAYS use searchBenchmarks for retention benchmarks
- ALWAYS use calculateMetric for NRR and retention calculations
- PMF signals must be evidence-based, not aspirational
- Customer concentration > 20% from top customer is a risk
- NRR < 100% at Seed is a red flag for B2B SaaS

SCORING CRITERIA:
- 80-100: Strong customer health - high NRR, clear PMF, quality customers
- 60-79: Good customer health - decent retention, emerging PMF
- 40-59: Average - some PMF signals, retention concerns
- 20-39: Weak - poor retention, unclear PMF
- 0-19: Critical - high churn, no PMF evidence`,

    taskDescription: `Perform a comprehensive customer intelligence analysis:

## Deal Information
- Company: ${deal.companyName ?? deal.name}
- Sector: ${sector}
- Stage: ${stage}

## Available Metrics
${JSON.stringify(metrics, null, 2)}

## Context Engine Data
- Deal Intelligence: ${context.contextEngine?.dealIntelligence ? "Available" : "Not available"}
- Market Data: ${context.contextEngine?.marketData ? "Available" : "Not available"}

## Your Tasks
1. Use searchBenchmarks for retention benchmarks in ${sector}
2. Use calculateMetric for retention metrics
3. Evaluate product-market fit signals
4. Assess customer concentration risk
5. Identify expansion opportunities
6. Generate customer score

Produce a complete customer analysis.`,

    availableTools: "",

    outputSchema: `{
  "customerProfile": {
    "icp": "Ideal Customer Profile description",
    "segments": ["segment1", "segment2"],
    "currentCustomers": number (optional),
    "notableCustomers": ["named customer"],
    "customerQuality": "low|medium|high"
  },
  "retentionMetrics": {
    "churnRate": percentage (optional),
    "netRevenueRetention": percentage (optional),
    "grossRetention": percentage (optional),
    "cohortTrends": "improving|stable|declining|unknown",
    "assessment": "Overall retention assessment"
  },
  "productMarketFit": {
    "signals": ["specific PMF signal"],
    "strength": "weak|emerging|moderate|strong",
    "evidence": ["specific evidence"]
  },
  "customerRisks": {
    "concentration": percentage from top customer,
    "dependencyRisk": "low|medium|high",
    "churnRisk": "low|medium|high",
    "concerns": ["specific concern"]
  },
  "expansionPotential": {
    "upsellOpportunity": "low|medium|high",
    "crossSellOpportunity": "low|medium|high",
    "virality": "none|low|medium|high"
  },
  "customerScore": 0-100
}`,

    constraints: [
      "MUST use searchBenchmarks for retention benchmarks",
      "NRR > 120% is exceptional for B2B SaaS",
      "NRR < 100% means net customer value is declining",
      "Named enterprise customers increase customer quality score",
      "Customer concentration > 20% is yellow flag, > 40% is red flag",
      "PMF signals: organic growth, low churn, customer referrals, high NPS",
    ],
  };
}

export class CustomerIntelReAct {
  readonly name = "customer-intel";
  readonly dependencies = ["document-extractor"];

  async run(context: EnrichedAgentContext): Promise<CustomerIntelResult> {
    const startTime = Date.now();

    const extractedInfo = this.getExtractedInfo(context);
    const prompts = buildPrompts(context, extractedInfo);

    const engine = createReActEngine<CustomerIntelOutput>(
      prompts,
      CustomerIntelOutputSchema,
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
    } as CustomerIntelResult & { _react: unknown };
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

  private calculateExpectedVariance(result: ReActOutput<CustomerIntelOutput>): number {
    const baseVariance = 25 * (1 - result.confidence.score / 100);
    const benchmarkedRatio = result.findings.filter((f) => f.benchmarkData).length / Math.max(1, result.findings.length);
    return Math.round(baseVariance * (1 - benchmarkedRatio * 0.5) * 10) / 10;
  }

  private getDefaultData(): CustomerIntelData {
    return {
      customerProfile: { icp: "Unknown", segments: [], notableCustomers: [], customerQuality: "medium" },
      retentionMetrics: { cohortTrends: "unknown", assessment: "Analysis failed" },
      productMarketFit: { signals: [], strength: "weak", evidence: [] },
      customerRisks: { concentration: 0, dependencyRisk: "medium", churnRisk: "medium", concerns: ["Analysis failed"] },
      expansionPotential: { upsellOpportunity: "medium", crossSellOpportunity: "medium", virality: "none" },
      customerScore: 0,
    };
  }
}

export const customerIntelReAct = new CustomerIntelReAct();
