/**
 * Technical DD Agent - ReAct Version
 *
 * Production-grade implementation using ReAct pattern for:
 * - Traceable technical assessment
 * - Benchmark-anchored tech stack evaluation
 * - Reproducible technical scores (< 5 points variance)
 */

import { z } from "zod";
import type { ScoredFinding } from "@/scoring";
import type { EnrichedAgentContext, TechnicalDDData, TechnicalDDResult } from "../../types";
import { createReActEngine, type ReActPrompts, type ReActOutput } from "../index";
import { registerBuiltInTools } from "../tools/built-in";

// Ensure built-in tools are registered
registerBuiltInTools();

// Output schema for Zod validation
const TechnicalDDOutputSchema = z.object({
  techStackAssessment: z.object({
    stack: z.array(z.string()),
    appropriateness: z.enum(["poor", "acceptable", "good", "excellent"]),
    scalability: z.enum(["low", "medium", "high"]),
    concerns: z.array(z.string()),
  }),
  technicalDebt: z.object({
    estimated: z.enum(["low", "moderate", "high", "critical"]),
    indicators: z.array(z.string()),
  }),
  productMaturity: z.object({
    stage: z.enum(["prototype", "mvp", "beta", "production", "scale"]),
    stability: z.number().min(0).max(100),
    featureCompleteness: z.number().min(0).max(100),
  }),
  technicalRisks: z.array(
    z.object({
      risk: z.string(),
      severity: z.enum(["low", "medium", "high"]),
      mitigation: z.string().optional(),
    })
  ),
  ipProtection: z.object({
    hasPatents: z.boolean(),
    patentsPending: z.number(),
    tradeSecrets: z.boolean(),
    openSourceRisk: z.enum(["none", "low", "medium", "high"]),
  }),
  securityPosture: z.object({
    assessment: z.enum(["poor", "basic", "good", "excellent"]),
    concerns: z.array(z.string()),
  }),
  technicalScore: z.number().min(0).max(100),
});

type TechnicalDDOutput = z.infer<typeof TechnicalDDOutputSchema>;

/**
 * Build ReAct prompts for Technical DD
 */
function buildPrompts(
  context: EnrichedAgentContext,
  extractedInfo: Record<string, unknown> | null
): ReActPrompts {
  const deal = context.deal;
  const sector = deal.sector ?? "SaaS B2B";
  const stage = deal.stage ?? "SEED";

  // Extract tech-related info
  const techStack = extractedInfo?.techStack ?? [];
  const productDescription = extractedInfo?.productDescription ?? "";

  return {
    system: `You are a senior technical due diligence analyst specializing in startup technology assessment.

Your role is to:
1. Evaluate tech stack appropriateness for the problem being solved
2. Assess scalability potential and architectural maturity
3. Estimate technical debt based on available signals
4. Identify technical risks and their severity
5. Evaluate IP protection and security posture

CRITICAL RULES:
- ALWAYS use searchBenchmarks to get tech stack standards for the sector
- ALWAYS use analyzeSection to evaluate technical claims in detail
- Tech stack should be evaluated for the SPECIFIC problem, not general popularity
- Technical debt indicators must be evidence-based
- Security concerns must be specific, not generic

SCORING CRITERIA:
- 80-100: Exceptional tech - modern stack, scalable architecture, strong IP
- 60-79: Solid tech - appropriate stack, some concerns but manageable
- 40-59: Average tech - significant concerns, technical debt likely
- 20-39: Weak tech - poor choices, high risk, major refactoring needed
- 0-19: Critical issues - fundamental architectural problems`,

    taskDescription: `Perform a comprehensive technical due diligence for this deal:

## Deal Information
- Company: ${deal.companyName ?? deal.name}
- Sector: ${sector}
- Stage: ${stage}

## Tech Stack (from deck)
${JSON.stringify(techStack, null, 2)}

## Product Description
${productDescription}

## Context Engine Data
- Deal Intelligence: ${context.contextEngine?.dealIntelligence ? "Available" : "Not available"}
- Competitive Landscape: ${context.contextEngine?.competitiveLandscape ? "Available - can compare tech choices" : "Not available"}

## Your Tasks
1. Use searchBenchmarks to get standard tech stacks for ${sector}
2. Use analyzeSection to evaluate technical claims and architecture
3. Assess scalability based on stage and growth trajectory
4. Identify technical debt indicators
5. Evaluate security and IP protection
6. Generate specific technical risks with mitigations

Produce a complete technical assessment.`,

    availableTools: "",

    outputSchema: `{
  "techStackAssessment": {
    "stack": ["Technology 1", "Technology 2"],
    "appropriateness": "poor|acceptable|good|excellent",
    "scalability": "low|medium|high",
    "concerns": ["specific concern with reasoning"]
  },
  "technicalDebt": {
    "estimated": "low|moderate|high|critical",
    "indicators": ["specific indicator like 'No mention of tests'"]
  },
  "productMaturity": {
    "stage": "prototype|mvp|beta|production|scale",
    "stability": 0-100,
    "featureCompleteness": 0-100
  },
  "technicalRisks": [{
    "risk": "Specific technical risk",
    "severity": "low|medium|high",
    "mitigation": "Suggested mitigation"
  }],
  "ipProtection": {
    "hasPatents": boolean,
    "patentsPending": number,
    "tradeSecrets": boolean,
    "openSourceRisk": "none|low|medium|high"
  },
  "securityPosture": {
    "assessment": "poor|basic|good|excellent",
    "concerns": ["specific security concern"]
  },
  "technicalScore": 0-100
}`,

    constraints: [
      "MUST use searchBenchmarks for sector-appropriate tech stack comparison",
      "Tech appropriateness based on problem fit, not popularity",
      "Technical debt estimates must cite specific indicators",
      "Security concerns must be specific (e.g., 'No mention of encryption')",
      "Stage affects expected maturity (MVP at Seed is fine)",
      "Score must reflect actual risk, not tech preferences",
    ],
  };
}

/**
 * Technical DD Agent using ReAct pattern
 */
export class TechnicalDDReAct {
  readonly name = "technical-dd";
  readonly dependencies = ["document-extractor"];

  /**
   * Run the Technical DD agent with ReAct pattern
   */
  async run(context: EnrichedAgentContext): Promise<TechnicalDDResult> {
    const startTime = Date.now();

    // Get extracted info from document-extractor
    const extractedInfo = this.getExtractedInfo(context);

    // Build prompts
    const prompts = buildPrompts(context, extractedInfo);

    // Create ReAct engine
    const engine = createReActEngine<TechnicalDDOutput>(
      prompts,
      TechnicalDDOutputSchema,
      {
        maxIterations: 4,
        minIterations: 2,
        confidenceThreshold: 70,
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
    const enrichedFindings = this.enrichFindings(result.findings);

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
    } as TechnicalDDResult & { _react: unknown };
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
      category: "product" as const,
    }));
  }

  /**
   * Calculate expected variance based on confidence
   */
  private calculateExpectedVariance(result: ReActOutput<TechnicalDDOutput>): number {
    const baseVariance = 25 * (1 - result.confidence.score / 100);
    const benchmarkedRatio =
      result.findings.filter((f) => f.benchmarkData).length /
      Math.max(1, result.findings.length);
    return Math.round(baseVariance * (1 - benchmarkedRatio * 0.5) * 10) / 10;
  }

  /**
   * Get default data structure for failed runs
   */
  private getDefaultData(): TechnicalDDData {
    return {
      techStackAssessment: {
        stack: [],
        appropriateness: "acceptable",
        scalability: "medium",
        concerns: ["Analysis failed"],
      },
      technicalDebt: {
        estimated: "moderate",
        indicators: ["Unable to assess"],
      },
      productMaturity: {
        stage: "mvp",
        stability: 0,
        featureCompleteness: 0,
      },
      technicalRisks: [
        {
          risk: "Technical assessment incomplete",
          severity: "medium",
        },
      ],
      ipProtection: {
        hasPatents: false,
        patentsPending: 0,
        tradeSecrets: false,
        openSourceRisk: "medium",
      },
      securityPosture: {
        assessment: "basic",
        concerns: ["Unable to assess security posture"],
      },
      technicalScore: 0,
    };
  }
}

// Singleton instance
export const technicalDDReAct = new TechnicalDDReAct();
