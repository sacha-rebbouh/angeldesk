/**
 * Dynamic Sector Expert Agent
 * Fallback expert for sectors without a specialized agent
 * Uses deal context and enrichment data to generate relevant analysis
 */

import { z } from "zod";
import { createReActEngine, type ReActPrompts } from "../react";
import { registerBuiltInTools } from "../react/tools/built-in";
import type { EnrichedAgentContext } from "../types";
import type { SectorExpertData, SectorExpertResult } from "./types";

registerBuiltInTools();

// Zod schema for dynamic expert output (same as other sector experts)
export const DynamicExpertOutputSchema = z.object({
  sectorName: z.string(),
  sectorMaturity: z.enum(["emerging", "growing", "mature", "declining"]),

  keyMetrics: z.array(
    z.object({
      metricName: z.string(),
      value: z.union([z.number(), z.string(), z.null()]),
      sectorBenchmark: z.object({
        p25: z.number(),
        median: z.number(),
        p75: z.number(),
        topDecile: z.number(),
      }),
      assessment: z.enum(["exceptional", "above_average", "average", "below_average", "concerning"]),
      sectorContext: z.string(),
    })
  ),

  sectorRedFlags: z.array(
    z.object({
      flag: z.string(),
      severity: z.enum(["critical", "major", "minor"]),
      sectorReason: z.string(),
    })
  ),

  sectorOpportunities: z.array(
    z.object({
      opportunity: z.string(),
      potential: z.enum(["high", "medium", "low"]),
      reasoning: z.string(),
    })
  ),

  regulatoryEnvironment: z.object({
    complexity: z.enum(["low", "medium", "high", "very_high"]),
    keyRegulations: z.array(z.string()),
    complianceRisks: z.array(z.string()),
    upcomingChanges: z.array(z.string()),
  }),

  sectorDynamics: z.object({
    competitionIntensity: z.enum(["low", "medium", "high", "intense"]),
    consolidationTrend: z.enum(["fragmenting", "stable", "consolidating"]),
    barrierToEntry: z.enum(["low", "medium", "high"]),
    typicalExitMultiple: z.number(),
    recentExits: z.array(z.string()),
  }),

  sectorQuestions: z.array(
    z.object({
      question: z.string(),
      category: z.enum(["technical", "business", "regulatory", "competitive"]),
      priority: z.enum(["must_ask", "should_ask", "nice_to_have"]),
      expectedAnswer: z.string(),
      redFlagAnswer: z.string(),
    })
  ),

  sectorFit: z.object({
    score: z.number().min(0).max(100),
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    sectorTiming: z.enum(["early", "optimal", "late"]),
  }),

  sectorScore: z.number().min(0).max(100),
  executiveSummary: z.string(),
});

export type DynamicExpertOutput = z.infer<typeof DynamicExpertOutputSchema>;

// Build prompts for the dynamic expert based on deal context
function buildDynamicExpertPrompts(
  context: EnrichedAgentContext,
  previousResults: Record<string, unknown> | null
): ReActPrompts {
  const deal = context.deal;
  const stage = deal.stage ?? "SEED";
  const sector = deal.sector ?? "Unknown";

  // Extract enrichment data if available
  let enrichmentInfo = "";
  if (context.enrichment) {
    const e = context.enrichment;
    enrichmentInfo = `
## Enrichment Data Available:
- Company: ${e.companyName ?? "N/A"}
- Industry: ${e.industry ?? "N/A"}
- Description: ${e.description ?? "N/A"}
- Founded: ${e.foundedYear ?? "N/A"}
- Employees: ${e.employeeCount ?? "N/A"}
- Location: ${e.location ?? "N/A"}
- Technologies: ${e.technologies?.join(", ") ?? "N/A"}
- Competitors: ${e.competitors?.join(", ") ?? "N/A"}
- Funding History: ${e.fundingRounds?.map((r: { round: string; amount: number }) => `${r.round}: $${r.amount}`).join(", ") ?? "N/A"}
`;
  }

  // Extract key data from previous results
  let extractedInfo = "";
  if (previousResults) {
    for (const [agentName, result] of Object.entries(previousResults)) {
      const res = result as { success?: boolean; data?: unknown };
      if (res.success && res.data) {
        extractedInfo += `\n### ${agentName}:\n${JSON.stringify(res.data, null, 2)}\n`;
      }
    }
  }

  return {
    system: `You are a dynamic sector expert analyst, capable of analyzing any industry sector.

Your expertise adapts to the specific sector being analyzed. You use:
1. General business acumen and investment principles
2. Knowledge of typical metrics for the sector type (B2B, B2C, marketplace, etc.)
3. Understanding of regulatory environments across industries
4. Competitive dynamics common to similar sectors

CRITICAL: Since you don't have pre-defined benchmarks for this sector, you must:
1. RESEARCH and INFER appropriate benchmarks based on the business model
2. Use general startup benchmarks as a baseline (e.g., 100%+ YoY growth for Seed, 50%+ for Series A)
3. Identify sector-specific metrics that matter (e.g., GMV for marketplaces, DAU/MAU for consumer apps)
4. Be conservative in your assessments - acknowledge uncertainty where it exists

SCORING METHODOLOGY:
- Base your scoring on fundamentals: team, market, traction, unit economics, defensibility
- 80-100: Exceptional metrics across the board, clear competitive advantage
- 60-79: Strong metrics, some areas need improvement
- 40-59: Mixed results, significant concerns in some areas
- 20-39: Major issues identified, high risk
- 0-19: Critical problems, not investable`,

    taskDescription: `Perform a comprehensive sector analysis for ${deal.companyName ?? deal.name}:

## Deal Information
- Company: ${deal.companyName ?? deal.name}
- Sector: ${sector}
- Stage: ${stage}
- Geography: ${deal.geography ?? "Unknown"}
- Description: ${deal.description ?? "N/A"}

${enrichmentInfo}

## Previous Agent Analysis:
${extractedInfo || "No previous results available"}

## Your Analysis Tasks:

### 1. SECTOR IDENTIFICATION
- Identify the closest comparable sectors for benchmarking
- Determine if this is B2B, B2C, marketplace, or hybrid
- Identify the key success metrics for this specific sector

### 2. METRIC EVALUATION
For each relevant metric identified:
- Extract the value from deal data or previous analysis
- Estimate appropriate benchmarks based on similar companies
- Assess performance relative to estimated benchmarks

### 3. RED FLAG DETECTION
Look for common red flags:
- Unsustainable unit economics
- Weak competitive moat
- Regulatory exposure
- Team gaps for this sector
- Market timing issues

### 4. SECTOR-SPECIFIC QUESTIONS
Generate 5-7 questions that probe:
- Technical depth and defensibility
- Business model sustainability
- Regulatory compliance
- Competitive positioning

### 5. OPPORTUNITY ANALYSIS
Identify sector-specific opportunities:
- Market tailwinds
- Consolidation opportunities
- Geographic expansion potential
- Product expansion possibilities

Produce a comprehensive analysis tailored to the "${sector}" sector.`,

    availableTools: "",

    outputSchema: `{
  "sectorName": "${sector}",
  "sectorMaturity": "emerging|growing|mature|declining",
  "keyMetrics": [{
    "metricName": "Relevant metric for this sector",
    "value": number|string|null,
    "sectorBenchmark": { "p25": number, "median": number, "p75": number, "topDecile": number },
    "assessment": "exceptional|above_average|average|below_average|concerning",
    "sectorContext": "Why this metric matters in ${sector}"
  }],
  "sectorRedFlags": [{
    "flag": "Red flag description",
    "severity": "critical|major|minor",
    "sectorReason": "Why this is a red flag in ${sector}"
  }],
  "sectorOpportunities": [{
    "opportunity": "Opportunity description",
    "potential": "high|medium|low",
    "reasoning": "Why this is an opportunity"
  }],
  "regulatoryEnvironment": {
    "complexity": "low|medium|high|very_high",
    "keyRegulations": ["regulation"],
    "complianceRisks": ["risk"],
    "upcomingChanges": ["change"]
  },
  "sectorDynamics": {
    "competitionIntensity": "low|medium|high|intense",
    "consolidationTrend": "fragmenting|stable|consolidating",
    "barrierToEntry": "low|medium|high",
    "typicalExitMultiple": number,
    "recentExits": ["Example exit if known"]
  },
  "sectorQuestions": [{
    "question": "Specific question",
    "category": "technical|business|regulatory|competitive",
    "priority": "must_ask|should_ask|nice_to_have",
    "expectedAnswer": "What a good answer looks like",
    "redFlagAnswer": "What would be concerning"
  }],
  "sectorFit": {
    "score": 0-100,
    "strengths": ["strength"],
    "weaknesses": ["weakness"],
    "sectorTiming": "early|optimal|late"
  },
  "sectorScore": 0-100,
  "executiveSummary": "2-3 sentence summary with key findings and verdict"
}`,

    constraints: [
      "Be explicit about uncertainty in benchmarks for unfamiliar sectors",
      "Use conservative estimates when data is limited",
      "Focus on fundamental business quality indicators",
      "Questions should probe sector-specific risks",
      "Consider both B2B and B2C dynamics if applicable",
    ],
  };
}

// Create the dynamic sector expert
export const dynamicExpert = {
  name: "dynamic-expert" as const,

  async run(context: EnrichedAgentContext): Promise<SectorExpertResult> {
    const startTime = Date.now();
    const sectorName = context.deal.sector ?? "Unknown Sector";

    const previousResults = context.previousResults ?? null;
    const prompts = buildDynamicExpertPrompts(context, previousResults as Record<string, unknown> | null);

    const engine = createReActEngine<DynamicExpertOutput>(prompts, DynamicExpertOutputSchema, {
      maxIterations: 4,
      minIterations: 2,
      confidenceThreshold: 60, // Lower threshold since we're less certain
      enableSelfCritique: true,
      modelComplexity: "complex",
    });

    const result = await engine.run(context, "dynamic-expert");

    if (!result.success) {
      return {
        agentName: "dynamic-expert",
        success: false,
        executionTimeMs: Date.now() - startTime,
        cost: result.cost,
        error: result.error,
        data: getDefaultDynamicData(sectorName),
      };
    }

    return {
      agentName: "dynamic-expert",
      success: true,
      executionTimeMs: Date.now() - startTime,
      cost: result.cost,
      data: result.result,
      _react: {
        reasoningTrace: result.reasoningTrace,
        findings: result.findings,
        confidence: result.confidence,
      },
    } as SectorExpertResult & { _react: unknown };
  },
};

// Default data when analysis fails
function getDefaultDynamicData(sectorName: string): SectorExpertData {
  return {
    sectorName,
    sectorMaturity: "growing",
    keyMetrics: [],
    sectorRedFlags: [{ flag: "Analysis incomplete", severity: "major", sectorReason: "Unable to complete sector analysis" }],
    sectorOpportunities: [],
    regulatoryEnvironment: {
      complexity: "medium",
      keyRegulations: [],
      complianceRisks: ["Analysis incomplete"],
      upcomingChanges: [],
    },
    sectorDynamics: {
      competitionIntensity: "medium",
      consolidationTrend: "stable",
      barrierToEntry: "medium",
      typicalExitMultiple: 5,
      recentExits: [],
    },
    sectorQuestions: [],
    sectorFit: {
      score: 0,
      strengths: [],
      weaknesses: ["Analysis incomplete"],
      sectorTiming: "optimal",
    },
    sectorScore: 0,
    executiveSummary: "Sector analysis could not be completed for this industry.",
  };
}
