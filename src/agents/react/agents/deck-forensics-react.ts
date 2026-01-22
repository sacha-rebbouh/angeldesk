/**
 * Deck Forensics Agent - ReAct Version
 *
 * Production-grade implementation using ReAct pattern for:
 * - Traceable narrative analysis
 * - Claim verification with evidence
 * - Reproducible quality scores (< 5 points variance)
 */

import { z } from "zod";
import type { ScoredFinding } from "@/scoring";
import type { EnrichedAgentContext, DeckForensicsData, DeckForensicsResult } from "../../types";
import { createReActEngine, type ReActPrompts, type ReActOutput } from "../index";
import { registerBuiltInTools } from "../tools/built-in";

// Ensure built-in tools are registered
registerBuiltInTools();

// Output schema for Zod validation
const DeckForensicsOutputSchema = z.object({
  narrativeAnalysis: z.object({
    storyStrength: z.number().min(0).max(100),
    logicalFlow: z.boolean(),
    emotionalAppeal: z.number().min(0).max(100),
    credibilitySignals: z.array(z.string()),
    inconsistencies: z.array(z.string()),
  }),
  claimVerification: z.array(
    z.object({
      claim: z.string(),
      status: z.enum(["verified", "unverified", "contradicted", "exaggerated"]),
      evidence: z.string().optional(),
      confidenceScore: z.number().min(0).max(100),
    })
  ),
  presentationQuality: z.object({
    designScore: z.number().min(0).max(100),
    clarityScore: z.number().min(0).max(100),
    professionalismScore: z.number().min(0).max(100),
    issues: z.array(z.string()),
  }),
  redFlags: z.array(z.string()),
  overallAssessment: z.string(),
});

type DeckForensicsOutput = z.infer<typeof DeckForensicsOutputSchema>;

/**
 * Build ReAct prompts for Deck Forensics
 */
function buildPrompts(
  context: EnrichedAgentContext,
  extractedInfo: Record<string, unknown> | null
): ReActPrompts {
  const deal = context.deal;
  const documents = context.documents ?? [];

  // Get pitch deck content
  const pitchDeckDoc = documents.find(
    (d) => d.type === "PITCH_DECK" && d.extractedText
  );

  return {
    system: `You are a senior VC analyst specializing in pitch deck forensics and narrative analysis.

Your role is to:
1. Analyze the narrative structure and story strength
2. Verify specific claims against available data
3. Assess presentation quality and professionalism
4. Identify logical inconsistencies and red flags
5. Evaluate emotional appeal and investor readiness

CRITICAL RULES:
- ALWAYS use analyzeSection to examine specific sections of the deck
- ALWAYS use crossReference to verify claims against Context Engine data
- NEVER accept claims without attempting verification
- Red flags must be specific with evidence
- Scores must be deterministic and reproducible

SCORING CRITERIA:
- 80-100: Exceptional deck - compelling story, verified claims, professional
- 60-79: Strong deck - good narrative, some gaps in verification
- 40-59: Average deck - mediocre story, several unverified claims
- 20-39: Weak deck - poor narrative, many red flags
- 0-19: Critical issues - misleading claims, unprofessional`,

    taskDescription: `Perform a comprehensive forensic analysis of this pitch deck:

## Deal Information
- Company: ${deal.companyName ?? deal.name}
- Sector: ${deal.sector ?? "Unknown"}
- Stage: ${deal.stage ?? "Unknown"}

## Pitch Deck Content
${pitchDeckDoc?.extractedText ?? "No pitch deck text available"}

## Extracted Information
${JSON.stringify(extractedInfo, null, 2)}

## Context Engine Data Available
- Deal Intelligence: ${context.contextEngine?.dealIntelligence ? "Yes" : "No"}
- Market Data: ${context.contextEngine?.marketData ? "Yes" : "No"}
- Competitive Landscape: ${context.contextEngine?.competitiveLandscape ? "Yes" : "No"}

## Your Tasks
1. Use analyzeSection to evaluate narrative structure and flow
2. Use crossReference to verify specific claims (e.g., market size, traction, team)
3. Identify all inconsistencies between sections
4. Assess presentation quality
5. Generate specific red flags with evidence

Produce a complete deck forensics report.`,

    availableTools: "",

    outputSchema: `{
  "narrativeAnalysis": {
    "storyStrength": 0-100 (how compelling is the story),
    "logicalFlow": boolean (does the narrative flow logically),
    "emotionalAppeal": 0-100 (investor engagement level),
    "credibilitySignals": ["specific signal like 'Named customers'"],
    "inconsistencies": ["specific inconsistency with evidence"]
  },
  "claimVerification": [{
    "claim": "Specific claim from deck",
    "status": "verified|unverified|contradicted|exaggerated",
    "evidence": "Evidence for verification status",
    "confidenceScore": 0-100
  }],
  "presentationQuality": {
    "designScore": 0-100,
    "clarityScore": 0-100,
    "professionalismScore": 0-100,
    "issues": ["specific issue like 'Typos on slide 3'"]
  },
  "redFlags": ["Specific red flag with evidence"],
  "overallAssessment": "Summary assessment of deck quality"
}`,

    constraints: [
      "MUST analyze each major claim for verification",
      "MUST use crossReference for any verifiable claim",
      "Inconsistencies must cite specific conflicting statements",
      "Red flags must include specific evidence",
      "Design score based on clarity, not aesthetics alone",
      "Unverifiable claims should be flagged, not assumed true",
    ],
  };
}

/**
 * Deck Forensics Agent using ReAct pattern
 */
export class DeckForensicsReAct {
  readonly name = "deck-forensics";
  readonly dependencies = ["document-extractor"];

  /**
   * Run the Deck Forensics agent with ReAct pattern
   */
  async run(context: EnrichedAgentContext): Promise<DeckForensicsResult> {
    const startTime = Date.now();

    // Get extracted info from document-extractor
    const extractedInfo = this.getExtractedInfo(context);

    // Build prompts
    const prompts = buildPrompts(context, extractedInfo);

    // Create ReAct engine
    const engine = createReActEngine<DeckForensicsOutput>(
      prompts,
      DeckForensicsOutputSchema,
      {
        maxIterations: 4,
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
    } as DeckForensicsResult & { _react: unknown };
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
  private calculateExpectedVariance(result: ReActOutput<DeckForensicsOutput>): number {
    const baseVariance = 25 * (1 - result.confidence.score / 100);
    const benchmarkedRatio =
      result.findings.filter((f) => f.benchmarkData).length /
      Math.max(1, result.findings.length);
    return Math.round(baseVariance * (1 - benchmarkedRatio * 0.5) * 10) / 10;
  }

  /**
   * Get default data structure for failed runs
   */
  private getDefaultData(): DeckForensicsData {
    return {
      narrativeAnalysis: {
        storyStrength: 0,
        logicalFlow: false,
        emotionalAppeal: 0,
        credibilitySignals: [],
        inconsistencies: ["Analysis failed"],
      },
      claimVerification: [],
      presentationQuality: {
        designScore: 0,
        clarityScore: 0,
        professionalismScore: 0,
        issues: ["Analysis failed"],
      },
      redFlags: ["Deck forensics could not be completed"],
      overallAssessment: "Analysis failed",
    };
  }
}

// Singleton instance
export const deckForensicsReAct = new DeckForensicsReAct();
