/**
 * Cap Table Auditor Agent - ReAct Version
 *
 * Production-grade implementation using ReAct pattern for:
 * - Traceable ownership analysis
 * - Deterministic dilution calculations
 * - Reproducible cap table scores (< 5 points variance)
 */

import { z } from "zod";
import type { ScoredFinding } from "@/scoring";
import type { EnrichedAgentContext, CapTableAuditData, CapTableAuditResult } from "../../types";
import { createReActEngine, type ReActPrompts, type ReActOutput } from "../index";
import { registerBuiltInTools } from "../tools/built-in";

// Ensure built-in tools are registered
registerBuiltInTools();

// Output schema for Zod validation
const CapTableAuditOutputSchema = z.object({
  ownershipBreakdown: z.object({
    founders: z.number().min(0).max(100),
    employees: z.number().min(0).max(100),
    investors: z.number().min(0).max(100),
    optionPool: z.number().min(0).max(100),
    other: z.number().min(0).max(100),
  }),
  founderDilution: z.object({
    currentFounderOwnership: z.number().min(0).max(100),
    projectedPostRound: z.number().min(0).max(100),
    atSeriesA: z.number().min(0).max(100).optional(),
    atSeriesB: z.number().min(0).max(100).optional(),
    concern: z.enum(["none", "moderate", "significant"]),
  }),
  investorAnalysis: z.object({
    existingInvestors: z.array(
      z.object({
        name: z.string(),
        ownership: z.number().min(0).max(100),
        reputation: z.enum(["unknown", "low", "medium", "high", "top_tier"]),
        signalValue: z.string(),
      })
    ),
    leadInvestorPresent: z.boolean(),
    followOnCapacity: z.string(),
  }),
  roundTerms: z.object({
    preMoneyValuation: z.number().optional(),
    roundSize: z.number().optional(),
    dilution: z.number().min(0).max(100),
    proRataRights: z.boolean(),
    liquidationPreference: z.string(),
    antiDilution: z.string(),
    participatingPreferred: z.boolean(),
    concerns: z.array(z.string()),
  }),
  optionPoolAnalysis: z.object({
    currentSize: z.number().min(0).max(100),
    adequacy: z.enum(["insufficient", "adequate", "generous"]),
    refreshNeeded: z.boolean(),
  }),
  structuralRedFlags: z.array(z.string()),
  capTableScore: z.number().min(0).max(100),
});

type CapTableAuditOutput = z.infer<typeof CapTableAuditOutputSchema>;

/**
 * Build ReAct prompts for Cap Table Auditor
 */
function buildPrompts(
  context: EnrichedAgentContext,
  extractedInfo: Record<string, unknown> | null
): ReActPrompts {
  const deal = context.deal;
  const stage = deal.stage ?? "SEED";

  // Extract cap table related info
  const valuationPre = extractedInfo?.valuationPre ?? (deal.valuationPre ? Number(deal.valuationPre) : null);
  const amountRaising = extractedInfo?.amountRaising ?? (deal.amountRequested ? Number(deal.amountRequested) : null);
  const previousRounds = extractedInfo?.previousRounds ?? [];

  return {
    system: `You are a senior VC analyst specializing in cap table analysis and deal structure.

Your role is to:
1. Analyze ownership structure and dilution trajectory
2. Evaluate round terms against market standards
3. Assess investor quality and signal value
4. Identify structural red flags in cap table
5. Calculate deterministic dilution projections

CRITICAL RULES:
- ALWAYS use calculateMetric for dilution and ownership calculations
- ALWAYS use searchBenchmarks to compare terms against market standards
- Dilution calculations must be mathematically accurate
- Term analysis must cite specific concerning clauses
- Red flags must be specific and consequential

SCORING CRITERIA:
- 80-100: Clean cap table - founder-friendly terms, quality investors
- 60-79: Acceptable structure - standard terms, some optimization possible
- 40-59: Concerning structure - aggressive terms, high dilution
- 20-39: Problematic structure - investor-unfriendly terms, red flags
- 0-19: Critical issues - liquidation preference stack, control issues`,

    taskDescription: `Perform a comprehensive cap table audit for this deal:

## Deal Information
- Company: ${deal.companyName ?? deal.name}
- Stage: ${stage}
- Pre-money Valuation: ${valuationPre ? `$${(Number(valuationPre) / 1000000).toFixed(1)}M` : "Not specified"}
- Amount Raising: ${amountRaising ? `$${(Number(amountRaising) / 1000000).toFixed(1)}M` : "Not specified"}

## Previous Rounds
${JSON.stringify(previousRounds, null, 2)}

## Context Engine Data
- Deal Intelligence: ${context.contextEngine?.dealIntelligence ? "Available" : "Not available"}

## Your Tasks
1. Use calculateMetric to compute exact dilution percentages
2. Use searchBenchmarks to compare terms against ${stage} market standards
3. Analyze investor quality and signal value
4. Project dilution trajectory through Series A/B
5. Identify all structural red flags
6. Score the cap table health

Produce a complete cap table assessment.`,

    availableTools: "",

    outputSchema: `{
  "ownershipBreakdown": {
    "founders": percentage (calculated via calculateMetric),
    "employees": percentage,
    "investors": percentage,
    "optionPool": percentage,
    "other": percentage
  },
  "founderDilution": {
    "currentFounderOwnership": percentage (before this round),
    "projectedPostRound": percentage (after this round),
    "atSeriesA": projected percentage at Series A (optional),
    "atSeriesB": projected percentage at Series B (optional),
    "concern": "none|moderate|significant"
  },
  "investorAnalysis": {
    "existingInvestors": [{
      "name": "Investor Name",
      "ownership": percentage,
      "reputation": "unknown|low|medium|high|top_tier",
      "signalValue": "What this investment signals"
    }],
    "leadInvestorPresent": boolean,
    "followOnCapacity": "Assessment of follow-on funding potential"
  },
  "roundTerms": {
    "preMoneyValuation": number,
    "roundSize": number,
    "dilution": percentage (use calculateMetric),
    "proRataRights": boolean,
    "liquidationPreference": "1x non-participating|1x participating|2x|etc.",
    "antiDilution": "none|broad-based|full-ratchet",
    "participatingPreferred": boolean,
    "concerns": ["specific concerning term"]
  },
  "optionPoolAnalysis": {
    "currentSize": percentage,
    "adequacy": "insufficient|adequate|generous",
    "refreshNeeded": boolean
  },
  "structuralRedFlags": ["Specific red flag with impact"],
  "capTableScore": 0-100
}`,

    constraints: [
      "MUST use calculateMetric for all dilution calculations",
      "MUST use searchBenchmarks for term comparison",
      "All percentages must sum correctly (ownership should = 100%)",
      "Dilution = roundSize / (preMoneyValuation + roundSize)",
      "Participating preferred is a red flag unless stage justifies",
      ">1x liquidation preference is typically a red flag at Seed",
      "Founder ownership < 60% post-Seed is a concern",
    ],
  };
}

/**
 * Cap Table Auditor Agent using ReAct pattern
 */
export class CapTableAuditorReAct {
  readonly name = "cap-table-auditor";
  readonly dependencies = ["document-extractor"];

  async run(context: EnrichedAgentContext): Promise<CapTableAuditResult> {
    const startTime = Date.now();

    const extractedInfo = this.getExtractedInfo(context);
    const prompts = buildPrompts(context, extractedInfo);

    const engine = createReActEngine<CapTableAuditOutput>(
      prompts,
      CapTableAuditOutputSchema,
      {
        maxIterations: 4,
        minIterations: 2,
        confidenceThreshold: 80,
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

    const enrichedFindings = this.enrichFindings(result.findings);

    return {
      agentName: this.name,
      success: true,
      executionTimeMs: Date.now() - startTime,
      cost: result.cost,
      data: result.result,
      _react: {
        reasoningTrace: result.reasoningTrace,
        findings: enrichedFindings,
        confidence: result.confidence,
        expectedVariance: this.calculateExpectedVariance(result),
      },
    } as CapTableAuditResult & { _react: unknown };
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
    return findings.map((f) => ({
      ...f,
      agentName: this.name,
      category: "financial" as const,
    }));
  }

  private calculateExpectedVariance(result: ReActOutput<CapTableAuditOutput>): number {
    const baseVariance = 25 * (1 - result.confidence.score / 100);
    const benchmarkedRatio =
      result.findings.filter((f) => f.benchmarkData).length /
      Math.max(1, result.findings.length);
    return Math.round(baseVariance * (1 - benchmarkedRatio * 0.5) * 10) / 10;
  }

  private getDefaultData(): CapTableAuditData {
    return {
      ownershipBreakdown: { founders: 0, employees: 0, investors: 0, optionPool: 0, other: 0 },
      founderDilution: { currentFounderOwnership: 0, projectedPostRound: 0, concern: "none" },
      investorAnalysis: { existingInvestors: [], leadInvestorPresent: false, followOnCapacity: "Unknown" },
      roundTerms: {
        dilution: 0, proRataRights: false, liquidationPreference: "Unknown",
        antiDilution: "Unknown", participatingPreferred: false, concerns: ["Analysis failed"],
      },
      optionPoolAnalysis: { currentSize: 0, adequacy: "adequate", refreshNeeded: false },
      structuralRedFlags: ["Cap table audit could not be completed"],
      capTableScore: 0,
    };
  }
}

export const capTableAuditorReAct = new CapTableAuditorReAct();
