/**
 * Market Intelligence Agent - ReAct Version
 *
 * Production-grade implementation using ReAct pattern for:
 * - Traceable market size validation
 * - Benchmark-anchored TAM/SAM/SOM verification
 * - Reproducible market scores (< 5 points variance)
 */

import { z } from "zod";
import {
  createScoredFinding,
  confidenceCalculator,
  type ScoredFinding,
} from "@/scoring";
import type { EnrichedAgentContext, MarketIntelData, MarketIntelResult } from "../../types";
import { createReActEngine, type ReActPrompts, type ReActOutput } from "../index";
import { registerBuiltInTools } from "../tools/built-in";

// Ensure built-in tools are registered
registerBuiltInTools();

// Output schema for Zod validation
const MarketIntelOutputSchema = z.object({
  marketSizeValidation: z.object({
    claimedTAM: z.number().nullable().optional(),
    claimedSAM: z.number().nullable().optional(),
    claimedSOM: z.number().nullable().optional(),
    validatedTAM: z.number().nullable().optional(),
    validatedSAM: z.number().nullable().optional(),
    validatedSOM: z.number().nullable().optional(),
    sources: z.array(z.string()),
    discrepancy: z.enum(["none", "minor", "significant", "major"]),
    assessment: z.string(),
  }),
  marketTrends: z.array(
    z.object({
      trend: z.string(),
      direction: z.enum(["positive", "neutral", "negative"]),
      impact: z.string(),
      confidence: z.number().min(0).max(1),
    })
  ),
  timingAnalysis: z.object({
    marketMaturity: z.enum(["emerging", "growing", "mature", "declining"]),
    adoptionCurve: z.enum(["innovators", "early_adopters", "early_majority", "late_majority"]),
    windowOfOpportunity: z.string(),
    timing: z.enum(["too_early", "good", "optimal", "late"]),
  }),
  regulatoryLandscape: z.string(),
  marketScore: z.number().min(0).max(100),
});

type MarketIntelOutput = z.infer<typeof MarketIntelOutputSchema>;

/**
 * Build ReAct prompts for Market Intelligence
 */
function buildPrompts(
  context: EnrichedAgentContext,
  extractedInfo: Record<string, unknown> | null
): ReActPrompts {
  const deal = context.deal;
  const sector = deal.sector ?? "SaaS B2B";
  const stage = deal.stage ?? "SEED";

  // Get market data from extracted info
  const marketData = {
    tam: extractedInfo?.tam ?? null,
    sam: extractedInfo?.sam ?? null,
    som: extractedInfo?.som ?? null,
    targetMarket: extractedInfo?.targetMarket ?? null,
  };

  // Get market data from Context Engine
  const marketIntelData = context.contextEngine?.marketData ?? null;

  return {
    system: `You are a senior market analyst specializing in startup market validation.

Your role is to:
1. Validate TAM/SAM/SOM claims against real market data
2. Analyze market trends and timing
3. Evaluate the window of opportunity
4. Identify regulatory risks and opportunities

CRITICAL RULES:
- ALWAYS use searchBenchmarks to get REAL market data for the sector
- ALWAYS use crossReference to validate claims against Context Engine
- NEVER accept market size claims without external validation
- Use BOTH top-down (industry reports) and bottom-up (customer count x ACV) methods
- Discrepancy is calculated as: |claimed - validated| / validated

TAM/SAM/SOM VALIDATION:
- TAM (Total Addressable Market): Global market for the solution
- SAM (Serviceable Addressable Market): Reachable market segment
- SOM (Serviceable Obtainable Market): Realistic 3-5 year target

SCORING CRITERIA:
- 80-100: Excellent market - large, growing, good timing
- 60-79: Good market - solid size, positive trends
- 40-59: Average market - some concerns about size or timing
- 20-39: Weak market - small, declining, or bad timing
- 0-19: Critical issues - declining market or major misrepresentation`,

    taskDescription: `Perform a comprehensive market validation for this deal:

## Deal Information
- Company: ${deal.companyName ?? deal.name}
- Sector: ${sector}
- Stage: ${stage}

## Market Claims from Pitch Deck
${JSON.stringify(marketData, null, 2)}

## Market Data from Context Engine
${marketIntelData ? JSON.stringify(marketIntelData, null, 2) : "No external market data available"}

## Your Tasks
1. Use searchBenchmarks to get validated market size data for ${sector}
2. Use crossReference to validate TAM/SAM/SOM claims against Context Engine
3. Use analyzeSection to evaluate market trends and timing
4. Use calculateMetric to compute discrepancy ratios
5. Assess regulatory landscape and risks

Produce a complete market assessment with validated findings.`,

    availableTools: "",

    outputSchema: `{
  "marketSizeValidation": {
    "claimedTAM": number | null (from pitch deck),
    "claimedSAM": number | null,
    "claimedSOM": number | null,
    "validatedTAM": number | null (from benchmarks/Context Engine),
    "validatedSAM": number | null,
    "validatedSOM": number | null,
    "sources": ["source of validation"],
    "discrepancy": "none|minor|significant|major",
    "assessment": "detailed analysis of the gap"
  },
  "marketTrends": [{
    "trend": "trend description",
    "direction": "positive|neutral|negative",
    "impact": "impact on the deal",
    "confidence": 0-1
  }],
  "timingAnalysis": {
    "marketMaturity": "emerging|growing|mature|declining",
    "adoptionCurve": "innovators|early_adopters|early_majority|late_majority",
    "windowOfOpportunity": "analysis of timing window",
    "timing": "too_early|good|optimal|late"
  },
  "regulatoryLandscape": "regulatory analysis",
  "marketScore": 0-100
}`,

    constraints: [
      "MUST use searchBenchmarks to get validated market size data",
      "MUST use crossReference to verify claims against Context Engine",
      "Discrepancy 'major' if claimed > 2x validated",
      "Discrepancy 'significant' if claimed > 1.5x validated",
      "Score < 50 if market is declining OR major discrepancy in claims",
      "If no external data available, flag as 'limited sources' and reduce confidence",
      "SOM > 5% of SAM in 3 years = suspicious, flag as aggressive",
    ],
  };
}

/**
 * Market Intelligence Agent using ReAct pattern
 */
export class MarketIntelligenceReAct {
  readonly name = "market-intelligence";
  readonly dependencies = ["document-extractor"];

  /**
   * Run the Market Intelligence with ReAct pattern
   */
  async run(context: EnrichedAgentContext): Promise<MarketIntelResult> {
    const startTime = Date.now();

    // Get extracted info from document-extractor
    const extractedInfo = this.getExtractedInfo(context);

    // Build prompts
    const prompts = buildPrompts(context, extractedInfo);

    // Create ReAct engine
    const engine = createReActEngine<MarketIntelOutput>(
      prompts,
      MarketIntelOutputSchema,
      {
        maxIterations: 5,
        minIterations: 2,
        confidenceThreshold: 75,
        enableSelfCritique: true,
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
    } as MarketIntelResult & { _react: unknown };
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
    _result: MarketIntelOutput
  ): ScoredFinding[] {
    return findings.map((f) => ({
      ...f,
      agentName: this.name,
      category: "market" as const,
    }));
  }

  /**
   * Calculate expected variance based on confidence
   */
  private calculateExpectedVariance(result: ReActOutput<MarketIntelOutput>): number {
    const baseVariance = 25 * (1 - result.confidence.score / 100);
    const benchmarkedRatio =
      result.findings.filter((f) => f.benchmarkData).length /
      Math.max(1, result.findings.length);
    return Math.round(baseVariance * (1 - benchmarkedRatio * 0.5) * 10) / 10;
  }

  /**
   * Get default data structure for failed runs
   */
  private getDefaultData(): MarketIntelData {
    return {
      marketSizeValidation: {
        sources: [],
        discrepancy: "minor",
        assessment: "Analysis failed",
      },
      marketTrends: [],
      timingAnalysis: {
        marketMaturity: "growing",
        adoptionCurve: "early_adopters",
        windowOfOpportunity: "Unable to assess",
        timing: "good",
      },
      regulatoryLandscape: "Unable to assess",
      marketScore: 0,
    };
  }
}

// Singleton instance
export const marketIntelligenceReAct = new MarketIntelligenceReAct();
