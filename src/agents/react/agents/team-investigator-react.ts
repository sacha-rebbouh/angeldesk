/**
 * Team Investigator Agent - ReAct Version
 *
 * Production-grade implementation using ReAct pattern for:
 * - Traceable reasoning for team evaluation
 * - Benchmark-anchored founder assessments
 * - Reproducible team scores (< 5 points variance)
 */

import { z } from "zod";
import {
  createScoredFinding,
  confidenceCalculator,
  type ScoredFinding,
} from "@/scoring";
import type { EnrichedAgentContext, TeamInvestigatorData, TeamInvestigatorResult } from "../../types";
import { createReActEngine, type ReActPrompts, type ReActOutput } from "../index";
import { registerBuiltInTools } from "../tools/built-in";

// Ensure built-in tools are registered
registerBuiltInTools();

// Output schema for Zod validation
const TeamInvestigatorOutputSchema = z.object({
  founderProfiles: z.array(
    z.object({
      name: z.string(),
      role: z.string(),
      backgroundVerified: z.boolean(),
      keyExperience: z.array(z.string()),
      previousVentures: z.array(
        z.object({
          name: z.string(),
          outcome: z.enum(["success", "acquihire", "failure", "ongoing", "unknown"]),
          relevance: z.string(),
        })
      ),
      domainExpertise: z.number().min(0).max(100),
      entrepreneurialExperience: z.number().min(0).max(100),
      redFlags: z.array(z.string()),
      networkStrength: z.enum(["weak", "moderate", "strong"]),
    })
  ),
  teamComposition: z.object({
    technicalStrength: z.number().min(0).max(100),
    businessStrength: z.number().min(0).max(100),
    complementarity: z.number().min(0).max(100),
    gaps: z.array(z.string()),
    keyHiresToMake: z.array(z.string()),
  }),
  cofounderDynamics: z.object({
    equitySplit: z.string(),
    vestingInPlace: z.boolean(),
    workingHistory: z.string(),
    potentialConflicts: z.array(z.string()),
  }),
  overallTeamScore: z.number().min(0).max(100),
  criticalQuestions: z.array(z.string()),
});

type TeamInvestigatorOutput = z.infer<typeof TeamInvestigatorOutputSchema>;

/**
 * Build ReAct prompts for Team Investigator
 */
function buildPrompts(
  context: EnrichedAgentContext,
  extractedInfo: Record<string, unknown> | null
): ReActPrompts {
  const deal = context.deal;
  const sector = deal.sector ?? "SaaS B2B";
  const stage = deal.stage ?? "SEED";

  // Get founders info
  const founders = extractedInfo?.founders ?? [];
  const dealWithFounders = deal as unknown as {
    founders?: { name: string; role: string; background?: string; linkedinUrl?: string }[];
  };
  const dbFounders = dealWithFounders.founders ?? [];

  // Get People Graph from Context Engine
  const peopleGraph = context.contextEngine?.peopleGraph ?? null;

  return {
    system: `You are a senior VC analyst specializing in founding team due diligence.

Your role is to:
1. Verify founder backgrounds against available data
2. Evaluate domain expertise and entrepreneurial experience
3. Assess team complementarity and skill coverage
4. Identify red flags and concerns
5. Generate critical reference check questions

CRITICAL RULES:
- ALWAYS use searchBenchmarks to get REAL benchmark data for team metrics
- ALWAYS use crossReference to verify founder claims against Context Engine data
- NEVER accept claims without verification
- Red flags must be specific and evidence-based
- Score founders against industry benchmarks for their stage

SCORING CRITERIA:
- 80-100: Exceptional team - serial entrepreneurs with relevant exits
- 60-79: Strong team - relevant experience, good complementarity
- 40-59: Average team - some gaps or unverified experience
- 20-39: Weak team - major gaps, solo founder without track record
- 0-19: Critical issues - red flags, verification failures`,

    taskDescription: `Perform a comprehensive team investigation for this deal:

## Deal Information
- Company: ${deal.companyName ?? deal.name}
- Sector: ${sector}
- Stage: ${stage}

## Founders from Pitch Deck
${JSON.stringify(founders, null, 2)}

## Founders from Database
${JSON.stringify(dbFounders, null, 2)}

## People Graph (Context Engine)
${peopleGraph ? JSON.stringify(peopleGraph, null, 2) : "No verified data available"}

## Your Tasks
1. Use searchBenchmarks to get team quality benchmarks for ${sector} at ${stage}
2. Use crossReference to verify founder backgrounds against Context Engine data
3. Use analyzeSection to evaluate team complementarity
4. Use calculateMetric for scoring calculations
5. Identify all red flags with specific evidence
6. Generate critical questions for reference checks

Produce a complete team assessment with verified findings.`,

    availableTools: "",

    outputSchema: `{
  "founderProfiles": [{
    "name": "Founder Name",
    "role": "CEO|CTO|COO|etc.",
    "backgroundVerified": boolean (true only if Context Engine confirms),
    "keyExperience": ["verified experience 1", "..."],
    "previousVentures": [{
      "name": "Company Name",
      "outcome": "success|acquihire|failure|ongoing|unknown",
      "relevance": "Relevance to current venture"
    }],
    "domainExpertise": 0-100 (benchmark-anchored),
    "entrepreneurialExperience": 0-100,
    "redFlags": ["specific red flag with evidence"],
    "networkStrength": "weak|moderate|strong"
  }],
  "teamComposition": {
    "technicalStrength": 0-100,
    "businessStrength": 0-100,
    "complementarity": 0-100,
    "gaps": ["critical skill gap"],
    "keyHiresToMake": ["priority hire"]
  },
  "cofounderDynamics": {
    "equitySplit": "50/50|60/40|solo|etc.",
    "vestingInPlace": boolean,
    "workingHistory": "description of prior work together",
    "potentialConflicts": ["specific concern"]
  },
  "overallTeamScore": 0-100,
  "criticalQuestions": ["question for reference checks"]
}`,

    constraints: [
      "MUST use crossReference to verify any founder claim",
      "MUST use searchBenchmarks for team quality benchmarks",
      "backgroundVerified = true ONLY if Context Engine data confirms",
      "Red flags must include specific evidence (e.g., 'LinkedIn shows 6 months, deck claims 3 years')",
      "Solo founder without track record = max score 50",
      "Unverifiable claims = automatic red flag",
      "Score must be deterministic based on verified facts",
    ],
  };
}

/**
 * Team Investigator Agent using ReAct pattern
 */
export class TeamInvestigatorReAct {
  readonly name = "team-investigator";
  readonly dependencies = ["document-extractor"];

  /**
   * Run the Team Investigator with ReAct pattern
   */
  async run(context: EnrichedAgentContext): Promise<TeamInvestigatorResult> {
    const startTime = Date.now();

    // Get extracted info from document-extractor
    const extractedInfo = this.getExtractedInfo(context);

    // Build prompts
    const prompts = buildPrompts(context, extractedInfo);

    // Create ReAct engine
    const engine = createReActEngine<TeamInvestigatorOutput>(
      prompts,
      TeamInvestigatorOutputSchema,
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
    } as TeamInvestigatorResult & { _react: unknown };
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
    _result: TeamInvestigatorOutput
  ): ScoredFinding[] {
    return findings.map((f) => ({
      ...f,
      agentName: this.name,
      category: "team" as const,
    }));
  }

  /**
   * Calculate expected variance based on confidence
   */
  private calculateExpectedVariance(result: ReActOutput<TeamInvestigatorOutput>): number {
    const baseVariance = 25 * (1 - result.confidence.score / 100);
    const benchmarkedRatio =
      result.findings.filter((f) => f.benchmarkData).length /
      Math.max(1, result.findings.length);
    return Math.round(baseVariance * (1 - benchmarkedRatio * 0.5) * 10) / 10;
  }

  /**
   * Get default data structure for failed runs
   */
  private getDefaultData(): TeamInvestigatorData {
    return {
      founderProfiles: [],
      teamComposition: {
        technicalStrength: 0,
        businessStrength: 0,
        complementarity: 0,
        gaps: ["Analysis failed"],
        keyHiresToMake: [],
      },
      cofounderDynamics: {
        equitySplit: "Unknown",
        vestingInPlace: false,
        workingHistory: "Unknown",
        potentialConflicts: [],
      },
      overallTeamScore: 0,
      criticalQuestions: ["Unable to complete team investigation"],
    };
  }
}

// Singleton instance
export const teamInvestigatorReAct = new TeamInvestigatorReAct();
