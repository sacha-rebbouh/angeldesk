/**
 * Competitive Intel Agent - ReAct Version
 *
 * Production-grade implementation using ReAct pattern for:
 * - Traceable competitive analysis
 * - Benchmark-anchored moat assessment
 * - Reproducible competitive scores (< 5 points variance)
 */

import { z } from "zod";
import {
  createScoredFinding,
  confidenceCalculator,
  type ScoredFinding,
} from "@/scoring";
import type { EnrichedAgentContext, CompetitiveIntelData, CompetitiveIntelResult } from "../../types";
import { createReActEngine, type ReActPrompts, type ReActOutput } from "../index";
import { registerBuiltInTools } from "../tools/built-in";

// Ensure built-in tools are registered
registerBuiltInTools();

// Output schema for Zod validation
const CompetitiveIntelOutputSchema = z.object({
  competitorMap: z.array(
    z.object({
      name: z.string(),
      positioning: z.string(),
      funding: z.number().nullable().optional(),
      estimatedRevenue: z.number().nullable().optional(),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
      overlap: z.enum(["direct", "partial", "adjacent"]),
      threat: z.enum(["low", "medium", "high"]),
    })
  ),
  marketConcentration: z.enum(["fragmented", "moderate", "concentrated", "monopolistic"]),
  competitiveAdvantages: z.array(
    z.object({
      advantage: z.string(),
      defensibility: z.enum(["weak", "moderate", "strong"]),
      duration: z.string(),
    })
  ),
  competitiveRisks: z.array(z.string()),
  moatAssessment: z.object({
    type: z.enum([
      "none",
      "brand",
      "network",
      "data",
      "switching_costs",
      "scale",
      "technology",
      "regulatory",
    ]),
    strength: z.number().min(0).max(100),
    sustainability: z.string(),
  }),
  competitiveScore: z.number().min(0).max(100),
});

type CompetitiveIntelOutput = z.infer<typeof CompetitiveIntelOutputSchema>;

/**
 * Build ReAct prompts for Competitive Intel
 */
function buildPrompts(
  context: EnrichedAgentContext,
  extractedInfo: Record<string, unknown> | null
): ReActPrompts {
  const deal = context.deal;
  const sector = deal.sector ?? "SaaS B2B";
  const stage = deal.stage ?? "SEED";

  // Get competitors from extracted info
  const competitors = extractedInfo?.competitors ?? [];
  const competitiveAdvantage = extractedInfo?.competitiveAdvantage ?? null;

  // Get competitive landscape from Context Engine
  const competitiveLandscape = context.contextEngine?.competitiveLandscape ?? null;

  return {
    system: `You are a senior competitive intelligence analyst specializing in startup market positioning.

Your role is to:
1. Map all competitors (direct, indirect, adjacent, future)
2. Evaluate competitive positioning and differentiation
3. Assess the moat (defensible competitive advantage)
4. Identify competitive risks

CRITICAL RULES:
- ALWAYS use searchBenchmarks to get competitive landscape data
- ALWAYS use crossReference to verify competitor data against Context Engine
- NEVER accept "no competitors" - there are always alternatives
- Missing competitors in the deck = potential red flag
- Moat must be justified with concrete evidence

COMPETITOR TYPES:
1. DIRECT: Same problem, same solution, same customer
2. INDIRECT: Same problem, different solution
3. ADJACENT: Similar solution, different customer
4. FUTURE: Large players who might enter (Google, Microsoft, etc.)

MOAT TYPES (with typical strength ranges):
1. NETWORK EFFECTS: Value increases with users (90-100)
2. DATA MOAT: Proprietary data hard to replicate (80-95)
3. BRAND: Established brand recognition (70-85)
4. SWITCHING COSTS: Expensive to change (60-80)
5. SCALE: Economies of scale (50-70)
6. TECHNOLOGY: Proprietary tech/patents (40-70)
7. REGULATORY: Licenses/regulations (30-60)
8. NONE: No identifiable moat (0-30)

SCORING CRITERIA:
- 80-100: Market leader or strong differentiation with clear moat
- 60-79: Good positioning, some competitive advantage
- 40-59: Average position, weak moat
- 20-39: Weak position, many stronger competitors
- 0-19: Critical issues - commoditized or outcompeted`,

    taskDescription: `Perform a comprehensive competitive analysis for this deal:

## Deal Information
- Company: ${deal.companyName ?? deal.name}
- Sector: ${sector}
- Stage: ${stage}

## Competitors from Pitch Deck
${JSON.stringify(competitors, null, 2)}

## Claimed Competitive Advantage
${competitiveAdvantage ?? "Not specified"}

## Competitive Landscape from Context Engine
${competitiveLandscape ? JSON.stringify(competitiveLandscape, null, 2) : "No external competitive data available"}

## Your Tasks
1. Use searchBenchmarks to get competitive landscape data for ${sector}
2. Use crossReference to verify competitor info against Context Engine
3. Use analyzeSection to evaluate moat strength and sustainability
4. Identify competitors NOT mentioned in the deck (red flag if significant)
5. Assess defensibility of claimed advantages

Produce a complete competitive assessment with verified findings.`,

    availableTools: "",

    outputSchema: `{
  "competitorMap": [{
    "name": "Competitor Name",
    "positioning": "How they position themselves",
    "funding": number | null (total raised in EUR),
    "estimatedRevenue": number | null,
    "strengths": ["strength 1", "..."],
    "weaknesses": ["weakness 1", "..."],
    "overlap": "direct|partial|adjacent",
    "threat": "low|medium|high"
  }],
  "marketConcentration": "fragmented|moderate|concentrated|monopolistic",
  "competitiveAdvantages": [{
    "advantage": "specific advantage",
    "defensibility": "weak|moderate|strong",
    "duration": "how long this advantage lasts"
  }],
  "competitiveRisks": ["specific competitive risk"],
  "moatAssessment": {
    "type": "none|brand|network|data|switching_costs|scale|technology|regulatory",
    "strength": 0-100 (within type range),
    "sustainability": "analysis of moat durability"
  },
  "competitiveScore": 0-100
}`,

    constraints: [
      "MUST use searchBenchmarks to get competitive data",
      "MUST use crossReference to verify competitor information",
      "MUST include at least 3-5 competitors if the market exists",
      "'No competitors' is NEVER acceptable - always find alternatives",
      "Competitor missing from deck but found in Context Engine = red flag",
      "Moat type determines strength range - enforce boundaries",
      "Score must reflect relative position vs identified competitors",
      "High threat = well-funded competitor with similar product and same target",
    ],
  };
}

/**
 * Competitive Intel Agent using ReAct pattern
 */
export class CompetitiveIntelReAct {
  readonly name = "competitive-intel";
  readonly dependencies = ["document-extractor"];

  /**
   * Run the Competitive Intel with ReAct pattern
   */
  async run(context: EnrichedAgentContext): Promise<CompetitiveIntelResult> {
    const startTime = Date.now();

    // Get extracted info from document-extractor
    const extractedInfo = this.getExtractedInfo(context);

    // Build prompts
    const prompts = buildPrompts(context, extractedInfo);

    // Create ReAct engine
    const engine = createReActEngine<CompetitiveIntelOutput>(
      prompts,
      CompetitiveIntelOutputSchema,
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
    } as CompetitiveIntelResult & { _react: unknown };
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
    _result: CompetitiveIntelOutput
  ): ScoredFinding[] {
    return findings.map((f) => ({
      ...f,
      agentName: this.name,
      category: "competitive" as const,
    }));
  }

  /**
   * Calculate expected variance based on confidence
   */
  private calculateExpectedVariance(result: ReActOutput<CompetitiveIntelOutput>): number {
    const baseVariance = 25 * (1 - result.confidence.score / 100);
    const benchmarkedRatio =
      result.findings.filter((f) => f.benchmarkData).length /
      Math.max(1, result.findings.length);
    return Math.round(baseVariance * (1 - benchmarkedRatio * 0.5) * 10) / 10;
  }

  /**
   * Get default data structure for failed runs
   */
  private getDefaultData(): CompetitiveIntelData {
    return {
      competitorMap: [],
      marketConcentration: "moderate",
      competitiveAdvantages: [],
      competitiveRisks: ["Analysis failed"],
      moatAssessment: {
        type: "none",
        strength: 0,
        sustainability: "Unable to assess",
      },
      competitiveScore: 0,
    };
  }
}

// Singleton instance
export const competitiveIntelReAct = new CompetitiveIntelReAct();
