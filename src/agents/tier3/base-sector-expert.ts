/**
 * Base Sector Expert Agent
 * Template for all Tier 3 sector-specific agents
 * Enhanced with structured benchmarks and sector-specific metrics
 */

import { z } from "zod";
import { createReActEngine, type ReActPrompts } from "../react";
import { registerBuiltInTools } from "../react/tools/built-in";
import type { EnrichedAgentContext } from "../types";
import type { SectorExpertData, SectorExpertResult, SectorExpertType } from "./types";
// Use service for DB-backed benchmarks (with cache + fallback to hardcoded)
import { getSectorBenchmarks, type SectorBenchmarkData, type SectorMetricBenchmark } from "@/services/sector-benchmarks";

registerBuiltInTools();

// Zod schema for sector expert output
export const SectorExpertOutputSchema = z.object({
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

export type SectorExpertOutput = z.infer<typeof SectorExpertOutputSchema>;

// Sector-specific configuration (enhanced with structured benchmarks)
export interface SectorConfig {
  name: string;
  emoji: string;
  displayName: string;
  description: string;

  // Key metrics to evaluate for this sector (kept for backward compatibility)
  keyMetrics: string[];

  // Common red flags in this sector
  typicalRedFlags: string[];

  // Key regulations
  keyRegulations: string[];

  // Typical exit multiples range
  exitMultipleRange: { low: number; typical: number; high: number };

  // Sector-specific scoring criteria
  scoringCriteria: string;

  // NEW: Structured benchmark data (loaded from sector-benchmarks.ts)
  benchmarkData?: SectorBenchmarkData;
}

// Helper to format metric benchmarks for the prompt
function formatMetricBenchmarks(metrics: SectorMetricBenchmark[], stage: string): string {
  const stageKey = stage.toUpperCase().replace(" ", "_").replace("-", "_") as "SEED" | "SERIES_A" | "SERIES_B" | "PRE_SEED";

  return metrics.map(m => {
    const stageData = m.stages[stageKey] || m.stages.SEED;
    const direction = m.direction === "lower_better" ? "↓ lower is better" :
                      m.direction === "target_range" ? "🎯 target range" : "↑ higher is better";

    return `• **${m.name}** (${m.unit}) - ${direction}
  - P25: ${stageData.p25} | Median: ${stageData.median} | P75: ${stageData.p75} | Top 10%: ${stageData.topDecile}
  - Thresholds: Exceptional ≥${m.thresholds.exceptional}, Good ≥${m.thresholds.good}, Concerning ≤${m.thresholds.concerning}
  - Context: ${m.sectorContext}`;
  }).join("\n\n");
}

// Helper to format red flag rules
function formatRedFlagRules(rules: SectorBenchmarkData["redFlagRules"]): string {
  return rules.map(r =>
    `• ${r.metric} ${r.condition} ${r.threshold} → ${r.severity.toUpperCase()}: ${r.reason}`
  ).join("\n");
}

// Helper to format unit economics
function formatUnitEconomics(formulas: SectorBenchmarkData["unitEconomicsFormulas"]): string {
  return formulas.map(f =>
    `• ${f.name} = ${f.formula} (Good: ${f.benchmark.good}, Excellent: ${f.benchmark.excellent})`
  ).join("\n");
}

// Build prompts for a sector expert
export async function buildSectorExpertPrompts(
  context: EnrichedAgentContext,
  config: SectorConfig,
  previousResults: Record<string, unknown> | null
): Promise<ReActPrompts> {
  const deal = context.deal;
  const stage = deal.stage ?? "SEED";

  // Load structured benchmark data from DB (with cache) or fallback to hardcoded
  const benchmarks = config.benchmarkData ?? await getSectorBenchmarks(config.name);

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

  // Build enhanced system prompt with structured benchmarks
  const primaryMetricsSection = benchmarks
    ? `## PRIMARY KPIs for ${config.name} (${stage}):
${formatMetricBenchmarks(benchmarks.primaryMetrics, stage)}`
    : "";

  const secondaryMetricsSection = benchmarks
    ? `## SECONDARY METRICS for ${config.name} (${stage}):
${formatMetricBenchmarks(benchmarks.secondaryMetrics, stage)}`
    : "";

  const redFlagRulesSection = benchmarks
    ? `## AUTOMATIC RED FLAG TRIGGERS:
${formatRedFlagRules(benchmarks.redFlagRules)}`
    : "";

  const unitEconomicsSection = benchmarks
    ? `## UNIT ECONOMICS FORMULAS:
${formatUnitEconomics(benchmarks.unitEconomicsFormulas)}`
    : "";

  const exitSection = benchmarks
    ? `## EXIT EXPECTATIONS:
- Multiples: Low ${benchmarks.exitMultiples.low}x | Median ${benchmarks.exitMultiples.median}x | High ${benchmarks.exitMultiples.high}x | Top 10% ${benchmarks.exitMultiples.topDecile}x
- Typical Acquirers: ${benchmarks.exitMultiples.typicalAcquirers.join(", ")}
- Recent Exits: ${benchmarks.exitMultiples.recentExits.map(e => `${e.company} → ${e.acquirer} (${e.multiple}x, ${e.year})`).join("; ")}`
    : "";

  return {
    system: `You are a senior ${config.displayName}, an expert in evaluating ${config.name} sector investments.

Your deep expertise includes:
- ${config.name} business models and unit economics
- Sector-specific benchmarks and success metrics
- Regulatory landscape and compliance requirements
- Competitive dynamics and market positioning
- Common pitfalls and red flags specific to ${config.name}
- Exit patterns and typical acquirers in the sector

${primaryMetricsSection}

${secondaryMetricsSection}

${redFlagRulesSection}

${unitEconomicsSection}

${exitSection}

${config.scoringCriteria}

CRITICAL RULES:
- USE THE BENCHMARK DATA ABOVE to score metrics objectively
- Compare each metric against the percentile thresholds provided
- A metric at P50 = average, P75 = above_average, P90+ = exceptional
- AUTOMATICALLY flag any metric that violates the red flag triggers above
- Calculate unit economics using the formulas provided
- Questions must probe ${config.name}-specific risks and opportunities

SCORING METHODOLOGY:
- 80-100: ≥3 primary metrics at P75+, no critical red flags, strong unit economics
- 60-79: Most metrics at P50+, no critical red flags, acceptable unit economics
- 40-59: Mixed metrics, some below P25, minor red flags present
- 20-39: Multiple metrics below P25, major red flags, weak unit economics
- 0-19: Critical red flags triggered, fundamentally broken economics`,

    taskDescription: `Perform a comprehensive ${config.name} sector analysis for ${deal.companyName ?? deal.name}:

## Deal Information
- Company: ${deal.companyName ?? deal.name}
- Sector: ${deal.sector ?? "Unknown"}
- Stage: ${stage}
- Geography: ${deal.geography ?? "Unknown"}

## Previous Agent Analysis:
${extractedInfo || "No previous results available"}

## Your Analysis Tasks:

### 1. METRIC EVALUATION
For each PRIMARY and SECONDARY metric:
- Extract the value from the deal data or previous agent analysis
- Compare against the ${stage} benchmarks provided
- Calculate the percentile position
- Apply the threshold rules (exceptional/good/concerning)

### 2. RED FLAG DETECTION
Check each automatic red flag rule:
${benchmarks ? benchmarks.redFlagRules.map(r => `- Is ${r.metric} ${r.condition} ${r.threshold}?`).join("\n") : config.typicalRedFlags.map(rf => `- ${rf}`).join("\n")}

### 3. UNIT ECONOMICS
Calculate using the formulas:
${benchmarks ? benchmarks.unitEconomicsFormulas.map(f => `- ${f.name}: ${f.formula}`).join("\n") : "Standard unit economics analysis"}

### 4. SECTOR-SPECIFIC QUESTIONS
Generate 5-7 questions that probe:
- Technical depth and defensibility
- Business model sustainability
- Regulatory compliance
- Competitive positioning

### 5. EXIT ANALYSIS
Compare to recent ${config.name} exits and assess:
- Realistic exit multiple expectation
- Potential acquirer universe
- Time to exit

Produce a comprehensive, benchmark-anchored ${config.name} sector analysis.`,

    availableTools: "",

    outputSchema: `{
  "sectorName": "${config.name}",
  "sectorMaturity": "emerging|growing|mature|declining",
  "keyMetrics": [{
    "metricName": "Metric name (use exact names from benchmarks)",
    "value": number|string|null,
    "sectorBenchmark": { "p25": number, "median": number, "p75": number, "topDecile": number },
    "assessment": "exceptional|above_average|average|below_average|concerning",
    "sectorContext": "Why this metric matters in ${config.name}"
  }],
  "sectorRedFlags": [{
    "flag": "Red flag description",
    "severity": "critical|major|minor",
    "sectorReason": "Why this is a red flag in ${config.name} (reference threshold if applicable)"
  }],
  "sectorOpportunities": [{
    "opportunity": "Opportunity description",
    "potential": "high|medium|low",
    "reasoning": "Why this is an opportunity in current ${config.name} market"
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
    "typicalExitMultiple": ${benchmarks?.exitMultiples.median ?? config.exitMultipleRange.typical},
    "recentExits": ["Company acquired by X for $Y"]
  },
  "sectorQuestions": [{
    "question": "Specific question for ${config.name}",
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
  "executiveSummary": "2-3 sentence summary with key metrics and verdict"
}`,

    constraints: [
      `MUST use the benchmark percentiles provided to assess each metric`,
      `Red flags must reference specific thresholds from the rules above`,
      `Exit multiple expectation must be justified against ${config.name} comparables`,
      `Unit economics must be calculated using the formulas provided`,
      "Questions must probe sector-specific risks based on the red flag rules",
      ...config.typicalRedFlags.map((rf) => `Watch for: ${rf}`),
    ],
  };
}

// Create a sector expert agent
export function createSectorExpert(
  agentType: SectorExpertType,
  config: SectorConfig
): { name: SectorExpertType; run: (context: EnrichedAgentContext) => Promise<SectorExpertResult> } {
  return {
    name: agentType,

    async run(context: EnrichedAgentContext): Promise<SectorExpertResult> {
      const startTime = Date.now();

      const previousResults = context.previousResults ?? null;
      const prompts = await buildSectorExpertPrompts(context, config, previousResults as Record<string, unknown> | null);

      const engine = createReActEngine<SectorExpertOutput>(prompts, SectorExpertOutputSchema, {
        maxIterations: 4,
        minIterations: 2,
        confidenceThreshold: 70,
        enableSelfCritique: true,
        modelComplexity: "complex",
      });

      const result = await engine.run(context, agentType);

      if (!result.success) {
        return {
          agentName: agentType,
          success: false,
          executionTimeMs: Date.now() - startTime,
          cost: result.cost,
          error: result.error,
          data: getDefaultSectorData(config.name),
        };
      }

      return {
        agentName: agentType,
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
}

// Default data when analysis fails
function getDefaultSectorData(sectorName: string): SectorExpertData {
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
    executiveSummary: "Sector analysis could not be completed.",
  };
}
