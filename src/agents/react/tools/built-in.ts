/**
 * Built-in Tools
 * Core tools available to all ReAct agents
 */

import { benchmarkService } from "@/scoring";
import { complete } from "@/services/openrouter/router";
import type { ToolDefinition, ToolContext, ToolResult } from "../types";
import { toolRegistry } from "./registry";

// ============================================================================
// FALLBACK BENCHMARKS (when database is empty)
// ============================================================================

const FALLBACK_BENCHMARKS: Record<string, Record<string, Record<string, { p25: number; median: number; p75: number }>>> = {
  "SaaS B2B": {
    "PRE_SEED": {
      "ARR Growth YoY": { p25: 80, median: 150, p75: 250 },
      "Net Revenue Retention": { p25: 90, median: 105, p75: 120 },
      "Gross Margin": { p25: 65, median: 75, p75: 85 },
      "Burn Multiple": { p25: 1.5, median: 2.5, p75: 4 },
      "Valuation Multiple": { p25: 20, median: 35, p75: 60 },
      "LTV/CAC Ratio": { p25: 2, median: 3, p75: 5 },
      "CAC Payback": { p25: 18, median: 14, p75: 10 },
    },
    "SEED": {
      "ARR Growth YoY": { p25: 70, median: 120, p75: 200 },
      "Net Revenue Retention": { p25: 95, median: 110, p75: 130 },
      "Gross Margin": { p25: 65, median: 75, p75: 85 },
      "Burn Multiple": { p25: 1.2, median: 2, p75: 3 },
      "Valuation Multiple": { p25: 15, median: 25, p75: 40 },
      "LTV/CAC Ratio": { p25: 2, median: 3, p75: 5 },
      "CAC Payback": { p25: 18, median: 14, p75: 10 },
    },
    "SERIES_A": {
      "ARR Growth YoY": { p25: 50, median: 80, p75: 120 },
      "Net Revenue Retention": { p25: 100, median: 115, p75: 140 },
      "Gross Margin": { p25: 65, median: 75, p75: 85 },
      "Burn Multiple": { p25: 1, median: 1.5, p75: 2.5 },
      "Valuation Multiple": { p25: 10, median: 18, p75: 30 },
      "LTV/CAC Ratio": { p25: 2.5, median: 3.5, p75: 6 },
      "CAC Payback": { p25: 16, median: 12, p75: 8 },
    },
    "SERIES_B": {
      "ARR Growth YoY": { p25: 40, median: 60, p75: 90 },
      "Net Revenue Retention": { p25: 105, median: 120, p75: 150 },
      "Gross Margin": { p25: 70, median: 78, p75: 85 },
      "Burn Multiple": { p25: 0.8, median: 1.2, p75: 2 },
      "Valuation Multiple": { p25: 8, median: 14, p75: 22 },
      "LTV/CAC Ratio": { p25: 3, median: 4, p75: 7 },
      "CAC Payback": { p25: 14, median: 10, p75: 6 },
    },
  },
  "Fintech": {
    "SEED": {
      "ARR Growth YoY": { p25: 80, median: 130, p75: 200 },
      "Net Revenue Retention": { p25: 95, median: 110, p75: 125 },
      "Gross Margin": { p25: 35, median: 50, p75: 65 },
      "Burn Multiple": { p25: 1.5, median: 2.5, p75: 4 },
      "Valuation Multiple": { p25: 12, median: 20, p75: 35 },
    },
    "SERIES_A": {
      "ARR Growth YoY": { p25: 60, median: 100, p75: 150 },
      "Net Revenue Retention": { p25: 100, median: 115, p75: 135 },
      "Gross Margin": { p25: 40, median: 55, p75: 70 },
      "Burn Multiple": { p25: 1.2, median: 2, p75: 3 },
      "Valuation Multiple": { p25: 8, median: 15, p75: 25 },
    },
  },
  "Marketplace": {
    "SEED": {
      "ARR Growth YoY": { p25: 100, median: 180, p75: 300 },
      "Take Rate": { p25: 8, median: 15, p75: 25 },
      "Gross Margin": { p25: 15, median: 25, p75: 40 },
      "Burn Multiple": { p25: 2, median: 3.5, p75: 6 },
      "Valuation Multiple": { p25: 3, median: 5, p75: 10 },
    },
  },
};

/**
 * Get fallback benchmark from hardcoded values
 */
function getFallbackBenchmark(
  sector: string,
  stage: string,
  metric: string
): { p25: number; median: number; p75: number; source: string } | null {
  // Try exact match
  const sectorData = FALLBACK_BENCHMARKS[sector];
  if (sectorData) {
    const stageData = sectorData[stage];
    if (stageData && stageData[metric]) {
      return { ...stageData[metric], source: "hardcoded_fallback" };
    }
    // Try SEED as fallback stage
    if (sectorData["SEED"] && sectorData["SEED"][metric]) {
      return { ...sectorData["SEED"][metric], source: "hardcoded_fallback:stage_SEED" };
    }
  }

  // Try SaaS B2B as fallback sector
  const saasData = FALLBACK_BENCHMARKS["SaaS B2B"];
  if (saasData) {
    const stageData = saasData[stage];
    if (stageData && stageData[metric]) {
      return { ...stageData[metric], source: "hardcoded_fallback:sector_SaaS" };
    }
    if (saasData["SEED"] && saasData["SEED"][metric]) {
      return { ...saasData["SEED"][metric], source: "hardcoded_fallback:generic" };
    }
  }

  return null;
}

// ============================================================================
// SEARCH BENCHMARKS TOOL
// ============================================================================

const searchBenchmarks: ToolDefinition = {
  name: "searchBenchmarks",
  description:
    "Search for industry benchmarks by sector, stage, and metric. Returns P25, median, P75 values and source information. Use this to compare deal metrics against market standards.",
  parameters: [
    {
      name: "sector",
      type: "string",
      description:
        "Industry sector (e.g., 'SaaS B2B', 'Fintech', 'Healthtech', 'AI/ML')",
      required: true,
    },
    {
      name: "stage",
      type: "string",
      description:
        "Funding stage (e.g., 'PRE_SEED', 'SEED', 'SERIES_A', 'SERIES_B')",
      required: true,
    },
    {
      name: "metric",
      type: "string",
      description:
        "Metric name (e.g., 'ARR Growth YoY', 'Net Revenue Retention', 'Burn Multiple')",
      required: true,
    },
  ],
  execute: async (
    params: Record<string, unknown>,
    _context: ToolContext
  ): Promise<ToolResult> => {
    const sector = params.sector as string;
    const stage = params.stage as string;
    const metric = params.metric as string;

    try {
      const result = await benchmarkService.lookup(sector, stage, metric);

      if (result.found && result.benchmark) {
        return {
          success: true,
          data: {
            found: true,
            exact: result.exact,
            benchmark: result.benchmark,
            fallbackUsed: result.fallbackUsed,
          },
          metadata: {
            source: result.benchmark.source ?? "benchmark_database",
            confidence: result.exact ? 100 : 70,
          },
        };
      }

      // Database didn't have it - try hardcoded fallback
      const fallback = getFallbackBenchmark(sector, stage, metric);
      if (fallback) {
        return {
          success: true,
          data: {
            found: true,
            exact: false,
            benchmark: {
              sector,
              stage,
              metric,
              p25: fallback.p25,
              median: fallback.median,
              p75: fallback.p75,
              source: fallback.source,
            },
            fallbackUsed: fallback.source,
          },
          metadata: {
            source: fallback.source,
            confidence: 60, // Lower confidence for hardcoded fallbacks
          },
        };
      }

      // No fallback available
      return {
        success: true,
        data: {
          found: false,
          message: `No benchmark found for ${metric} in ${sector} at ${stage} (checked database and fallbacks)`,
        },
        metadata: {
          source: "benchmark_database",
          confidence: 0,
        },
      };
    } catch (error) {
      // On error, still try fallback
      const fallback = getFallbackBenchmark(sector, stage, metric);
      if (fallback) {
        return {
          success: true,
          data: {
            found: true,
            exact: false,
            benchmark: {
              sector,
              stage,
              metric,
              p25: fallback.p25,
              median: fallback.median,
              p75: fallback.p75,
              source: fallback.source,
            },
            fallbackUsed: `error_fallback:${fallback.source}`,
          },
          metadata: {
            source: fallback.source,
            confidence: 50, // Even lower confidence when DB errored
          },
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : "Benchmark lookup failed",
      };
    }
  },
};

// ============================================================================
// ANALYZE SECTION TOOL
// ============================================================================

const analyzeSection: ToolDefinition = {
  name: "analyzeSection",
  description:
    "Analyze a specific section of deal documents using LLM. Provide the text and specific analysis criteria. Returns structured analysis with findings.",
  parameters: [
    {
      name: "text",
      type: "string",
      description: "The text content to analyze",
      required: true,
    },
    {
      name: "analysisType",
      type: "string",
      description:
        "Type of analysis to perform (e.g., 'financial_metrics', 'team_assessment', 'market_claims', 'risk_identification')",
      required: true,
      enum: [
        "financial_metrics",
        "team_assessment",
        "market_claims",
        "risk_identification",
        "competitive_analysis",
        "product_evaluation",
      ],
    },
    {
      name: "criteria",
      type: "string",
      description:
        "Specific criteria or questions to focus the analysis on",
      required: false,
    },
  ],
  execute: async (
    params: Record<string, unknown>,
    _context: ToolContext
  ): Promise<ToolResult> => {
    const text = params.text as string;
    const analysisType = params.analysisType as string;
    const criteria = (params.criteria as string) ?? "";

    // Truncate very long texts
    const maxLength = 10000;
    const truncatedText =
      text.length > maxLength ? text.substring(0, maxLength) + "..." : text;

    const prompt = `Analyze the following text for ${analysisType}.
${criteria ? `\nFocus specifically on: ${criteria}` : ""}

Text to analyze:
${truncatedText}

Provide your analysis as JSON with the following structure:
{
  "findings": [
    {
      "metric": "metric_name",
      "value": "extracted value or null",
      "unit": "unit if applicable",
      "assessment": "brief assessment",
      "confidence": 0-100,
      "evidence": "direct quote or description"
    }
  ],
  "summary": "overall assessment",
  "gaps": ["list of missing information"],
  "concerns": ["list of potential concerns"]
}`;

    try {
      const result = await complete(prompt, {
        complexity: "medium",
        temperature: 0.2,
        systemPrompt:
          "You are a precise document analyst. Extract factual information and provide objective assessments. Always respond with valid JSON.",
      });

      // Parse JSON response
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          success: false,
          error: "Failed to parse analysis result as JSON",
        };
      }

      const analysisResult = JSON.parse(jsonMatch[0]);

      return {
        success: true,
        data: analysisResult,
        metadata: {
          source: "llm_analysis",
          confidence: 80,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Section analysis failed",
      };
    }
  },
};

// ============================================================================
// CROSS REFERENCE TOOL
// ============================================================================

const crossReference: ToolDefinition = {
  name: "crossReference",
  description:
    "Cross-reference a claim or metric against multiple sources. Verifies consistency and identifies discrepancies.",
  parameters: [
    {
      name: "claim",
      type: "string",
      description: "The claim or metric to verify",
      required: true,
    },
    {
      name: "sources",
      type: "array",
      description:
        "Array of source texts to check against (from different documents or sections)",
      required: true,
    },
    {
      name: "tolerance",
      type: "number",
      description:
        "Acceptable percentage deviation for numeric values (default: 10)",
      required: false,
      default: 10,
    },
  ],
  execute: async (
    params: Record<string, unknown>,
    _context: ToolContext
  ): Promise<ToolResult> => {
    const claim = params.claim as string;
    const sources = params.sources as string[];
    const tolerance = (params.tolerance as number) ?? 10;

    const prompt = `Verify the following claim by cross-referencing it against multiple sources.

Claim to verify: ${claim}

Sources to check:
${sources.map((s, i) => `Source ${i + 1}: ${s.substring(0, 2000)}`).join("\n\n")}

Tolerance for numeric discrepancies: ${tolerance}%

Analyze consistency and provide your findings as JSON:
{
  "verified": true/false,
  "confidence": 0-100,
  "matches": [
    {
      "sourceIndex": 1,
      "matchType": "exact|approximate|contradicts|not_mentioned",
      "evidence": "relevant quote",
      "deviation": null or percentage
    }
  ],
  "discrepancies": ["list of inconsistencies found"],
  "conclusion": "summary of verification result"
}`;

    try {
      const result = await complete(prompt, {
        complexity: "medium",
        temperature: 0.1,
        systemPrompt:
          "You are a fact-checker. Be precise and objective. Always respond with valid JSON.",
      });

      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          success: false,
          error: "Failed to parse cross-reference result",
        };
      }

      const verificationResult = JSON.parse(jsonMatch[0]);

      return {
        success: true,
        data: verificationResult,
        metadata: {
          source: "cross_reference",
          confidence: verificationResult.confidence,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Cross-reference failed",
      };
    }
  },
};

// ============================================================================
// CALCULATE METRIC TOOL
// ============================================================================

const calculateMetric: ToolDefinition = {
  name: "calculateMetric",
  description:
    "Perform deterministic calculations for common financial metrics. Returns exact calculated values without LLM variance.",
  parameters: [
    {
      name: "metric",
      type: "string",
      description:
        "The metric to calculate (e.g., 'ltv_cac_ratio', 'burn_multiple', 'runway', 'cac_payback', 'arr_growth')",
      required: true,
      enum: [
        "ltv_cac_ratio",
        "burn_multiple",
        "runway",
        "cac_payback",
        "arr_growth",
        "gross_margin",
        "rule_of_40",
        "magic_number",
        "nrr",
        "dilution",
      ],
    },
    {
      name: "inputs",
      type: "object",
      description:
        "Input values required for the calculation. Keys depend on the metric.",
      required: true,
    },
  ],
  execute: async (
    params: Record<string, unknown>,
    _context: ToolContext
  ): Promise<ToolResult> => {
    const metric = params.metric as string;
    const inputs = params.inputs as Record<string, number>;

    try {
      let result: { value: number; formula: string; unit: string };

      switch (metric) {
        case "ltv_cac_ratio": {
          const { ltv, cac } = inputs;
          if (!ltv || !cac || cac === 0) {
            return { success: false, error: "LTV and CAC required (CAC > 0)" };
          }
          result = {
            value: ltv / cac,
            formula: "LTV / CAC",
            unit: "x",
          };
          break;
        }

        case "burn_multiple": {
          const { netBurn, netNewArr } = inputs;
          if (netBurn === undefined || !netNewArr || netNewArr === 0) {
            return {
              success: false,
              error: "Net burn and net new ARR required",
            };
          }
          result = {
            value: netBurn / netNewArr,
            formula: "Net Burn / Net New ARR",
            unit: "x",
          };
          break;
        }

        case "runway": {
          const { cash, monthlyBurn } = inputs;
          if (!cash || !monthlyBurn || monthlyBurn === 0) {
            return {
              success: false,
              error: "Cash and monthly burn required (burn > 0)",
            };
          }
          result = {
            value: cash / monthlyBurn,
            formula: "Cash / Monthly Burn",
            unit: "months",
          };
          break;
        }

        case "cac_payback": {
          const { cac: cacValue, arpu, grossMargin } = inputs;
          if (!cacValue || !arpu || !grossMargin || arpu === 0) {
            return {
              success: false,
              error: "CAC, ARPU, and gross margin required",
            };
          }
          result = {
            value: cacValue / (arpu * (grossMargin / 100)),
            formula: "CAC / (ARPU × Gross Margin)",
            unit: "months",
          };
          break;
        }

        case "arr_growth": {
          const { currentArr, previousArr } = inputs;
          if (!currentArr || !previousArr || previousArr === 0) {
            return { success: false, error: "Current and previous ARR required" };
          }
          result = {
            value: ((currentArr - previousArr) / previousArr) * 100,
            formula: "(Current ARR - Previous ARR) / Previous ARR × 100",
            unit: "%",
          };
          break;
        }

        case "gross_margin": {
          const { revenue, cogs } = inputs;
          if (revenue === undefined || cogs === undefined || revenue === 0) {
            return { success: false, error: "Revenue and COGS required" };
          }
          result = {
            value: ((revenue - cogs) / revenue) * 100,
            formula: "(Revenue - COGS) / Revenue × 100",
            unit: "%",
          };
          break;
        }

        case "rule_of_40": {
          const { growthRate, profitMargin } = inputs;
          if (growthRate === undefined || profitMargin === undefined) {
            return {
              success: false,
              error: "Growth rate and profit margin required",
            };
          }
          result = {
            value: growthRate + profitMargin,
            formula: "Growth Rate + Profit Margin",
            unit: "%",
          };
          break;
        }

        case "magic_number": {
          const { newArr, salesAndMarketing } = inputs;
          if (!newArr || !salesAndMarketing || salesAndMarketing === 0) {
            return {
              success: false,
              error: "New ARR and S&M spend required",
            };
          }
          result = {
            value: newArr / salesAndMarketing,
            formula: "New ARR / S&M Spend",
            unit: "x",
          };
          break;
        }

        case "nrr": {
          const { startingArr, expansion, contraction, churn } = inputs;
          if (!startingArr || startingArr === 0) {
            return { success: false, error: "Starting ARR required" };
          }
          const endingArr =
            startingArr + (expansion ?? 0) - (contraction ?? 0) - (churn ?? 0);
          result = {
            value: (endingArr / startingArr) * 100,
            formula:
              "(Starting ARR + Expansion - Contraction - Churn) / Starting ARR × 100",
            unit: "%",
          };
          break;
        }

        case "dilution": {
          const { newInvestment, postMoneyValuation } = inputs;
          if (!newInvestment || !postMoneyValuation || postMoneyValuation === 0) {
            return {
              success: false,
              error: "New investment and post-money valuation required",
            };
          }
          result = {
            value: (newInvestment / postMoneyValuation) * 100,
            formula: "New Investment / Post-Money Valuation × 100",
            unit: "%",
          };
          break;
        }

        default:
          return { success: false, error: `Unknown metric: ${metric}` };
      }

      return {
        success: true,
        data: {
          metric,
          ...result,
          inputs,
          calculatedAt: new Date().toISOString(),
        },
        metadata: {
          source: "deterministic_calculation",
          confidence: 100, // Deterministic = 100% confidence
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Calculation failed",
      };
    }
  },
};

// ============================================================================
// MEMORY TOOLS
// ============================================================================

const writeMemory: ToolDefinition = {
  name: "writeMemory",
  description:
    "Store a value in the agent's working memory for later retrieval. Use this to save intermediate results.",
  parameters: [
    {
      name: "key",
      type: "string",
      description: "Unique key to identify the stored value",
      required: true,
    },
    {
      name: "value",
      type: "object",
      description: "The value to store (can be any JSON-serializable object)",
      required: true,
    },
  ],
  execute: async (
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> => {
    const key = params.key as string;
    const value = params.value;

    context.memory.set(key, value);

    return {
      success: true,
      data: { key, stored: true },
      metadata: {
        source: "memory",
        confidence: 100,
      },
    };
  },
};

const readMemory: ToolDefinition = {
  name: "readMemory",
  description:
    "Retrieve a value from the agent's working memory. Returns null if key not found.",
  parameters: [
    {
      name: "key",
      type: "string",
      description: "Key of the value to retrieve",
      required: true,
    },
  ],
  execute: async (
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> => {
    const key = params.key as string;
    const value = context.memory.get(key);

    return {
      success: true,
      data: {
        key,
        found: value !== undefined,
        value: value ?? null,
      },
      metadata: {
        source: "memory",
        confidence: 100,
      },
    };
  },
};

// ============================================================================
// REGISTER ALL BUILT-IN TOOLS
// ============================================================================

export function registerBuiltInTools(): void {
  toolRegistry.register(searchBenchmarks);
  toolRegistry.register(analyzeSection);
  toolRegistry.register(crossReference);
  toolRegistry.register(calculateMetric);
  toolRegistry.register(writeMemory);
  toolRegistry.register(readMemory);
}

// Auto-register on import
registerBuiltInTools();

// Export for direct access if needed
export {
  searchBenchmarks,
  analyzeSection,
  crossReference,
  calculateMetric,
  writeMemory,
  readMemory,
};
