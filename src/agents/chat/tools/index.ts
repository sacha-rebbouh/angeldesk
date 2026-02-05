/**
 * Chat Tools Registry
 *
 * Exports all tools available to the chat agent and provides
 * a unified registry for tool execution.
 */

// ============================================================================
// EXPORTS
// ============================================================================

export {
  runValuationSimulation,
  generateStandardScenarios,
  simulationToolDefinition,
  type SimulationParams,
  type SimulationResult,
  type ScenarioResult,
  type YearlyProjection,
} from './simulation-tool';

export {
  compareToBenchmarks,
  getAvailableSectors,
  getMetricAcrossSectors,
  benchmarkToolDefinition,
  type DealData,
  type BenchmarkComparison,
  type MetricComparison,
  type MetricAssessment,
} from './benchmark-tool';

// ============================================================================
// TOOL REGISTRY
// ============================================================================

import {
  runValuationSimulation,
  generateStandardScenarios,
  simulationToolDefinition,
  type SimulationParams
} from './simulation-tool';

import {
  compareToBenchmarks,
  benchmarkToolDefinition,
  type DealData
} from './benchmark-tool';

/**
 * All tool definitions for OpenAI/Anthropic function calling format
 */
export const CHAT_TOOL_DEFINITIONS = [
  simulationToolDefinition,
  benchmarkToolDefinition,
] as const;

/**
 * Tool executor type
 */
export type ToolExecutor = (params: Record<string, unknown>) => Promise<unknown>;

/**
 * Tool registry with execution functions
 */
export const CHAT_TOOL_REGISTRY: Record<string, ToolExecutor> = {
  valuation_simulation: async (params) => {
    const {
      currentArr,
      currentGrowthRate,
      currentValuation,
      scenarios,
      horizonYears = 3,
      stage,
    } = params as {
      currentArr: number;
      currentGrowthRate: number;
      currentValuation: number;
      scenarios?: SimulationParams['scenarios'];
      horizonYears?: number;
      stage?: 'seed' | 'series_a' | 'series_b' | 'later';
    };

    // Generate default scenarios if not provided
    const effectiveScenarios = scenarios || generateStandardScenarios(
      currentGrowthRate,
      stage || 'seed'
    );

    return runValuationSimulation({
      currentArr,
      currentGrowthRate,
      currentValuation,
      scenarios: effectiveScenarios,
      horizonYears,
    });
  },

  benchmark_comparison: async (params) => {
    const typedParams = params as Record<string, unknown>;
    const sector = typedParams.sector as string;
    const arr = typedParams.arr as number | undefined;
    const growthRate = typedParams.growthRate as number | undefined;
    const nrr = typedParams.nrr as number | undefined;
    const grossMargin = typedParams.grossMargin as number | undefined;
    const burnMultiple = typedParams.burnMultiple as number | undefined;
    const ltvCacRatio = typedParams.ltvCacRatio as number | undefined;
    const paybackMonths = typedParams.paybackMonths as number | undefined;
    const churnRate = typedParams.churnRate as number | undefined;
    const arrPerEmployee = typedParams.arrPerEmployee as number | undefined;
    const valuationMultiple = typedParams.valuationMultiple as number | undefined;
    const stage = typedParams.stage as string | undefined;

    const dealData: DealData = {
      arr,
      growthRate,
      nrr,
      grossMargin,
      burnMultiple,
      ltvCacRatio,
      paybackMonths,
      churnRate,
      arrPerEmployee,
      valuationMultiple,
      stage,
    };

    return compareToBenchmarks(dealData, sector);
  },
};

/**
 * Execute a tool by name with given parameters
 */
export async function executeTool(
  toolName: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const executor = CHAT_TOOL_REGISTRY[toolName];

  if (!executor) {
    return {
      success: false,
      error: `Unknown tool: ${toolName}. Available tools: ${Object.keys(CHAT_TOOL_REGISTRY).join(', ')}`,
    };
  }

  try {
    const result = await executor(params);
    return { success: true, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Format tool result for chat response
 */
export function formatToolResult(
  toolName: string,
  result: unknown
): string {
  if (toolName === 'valuation_simulation') {
    return formatSimulationResult(result as Awaited<ReturnType<typeof runValuationSimulation>>);
  }

  if (toolName === 'benchmark_comparison') {
    return formatBenchmarkResult(result as Awaited<ReturnType<typeof compareToBenchmarks>>);
  }

  return JSON.stringify(result, null, 2);
}

/**
 * Format simulation result as readable text
 */
function formatSimulationResult(result: Awaited<ReturnType<typeof runValuationSimulation>>): string {
  const lines: string[] = [];

  lines.push('## Simulation de Valorisation\n');
  lines.push(`**Situation actuelle:**`);
  lines.push(`- ARR: ${formatCurrency(result.currentMetrics.arr)}`);
  lines.push(`- Croissance: ${result.currentMetrics.growthRate}% YoY`);
  lines.push(`- Valorisation: ${formatCurrency(result.currentMetrics.valuation)}`);
  lines.push(`- Multiple implicite: ${result.currentMetrics.impliedMultiple}x ARR\n`);

  lines.push(`**Scénarios sur ${result.scenarios[0]?.projections.length || 3} ans:**\n`);

  for (const scenario of result.scenarios) {
    lines.push(`### ${scenario.name}`);
    lines.push(`- Growth rate: ${scenario.growthRate}%`);
    lines.push(`- Multiple de sortie: ${scenario.multiple}x`);
    lines.push(`- ARR final: ${formatCurrency(scenario.finalArr)}`);
    lines.push(`- Valorisation finale: ${formatCurrency(scenario.finalValuation)}`);
    lines.push(`- Retour: **${scenario.totalReturn}x** (IRR: ${scenario.irr}%)\n`);
  }

  lines.push(`**Comparaison:**`);
  lines.push(`- Meilleur scénario: ${result.comparison.bestCase}`);
  lines.push(`- Pire scénario: ${result.comparison.worstCase}`);
  lines.push(`- Retour médian: ${result.comparison.medianReturn}x`);
  lines.push(`- Écart de retour: ${result.comparison.returnSpread}x\n`);

  lines.push(`**Insights:**`);
  for (const insight of result.insights) {
    lines.push(`- ${insight}`);
  }

  return lines.join('\n');
}

/**
 * Format benchmark result as readable text
 */
function formatBenchmarkResult(result: Awaited<ReturnType<typeof compareToBenchmarks>>): string {
  const lines: string[] = [];

  lines.push(`## Benchmark vs ${result.sectorDisplayName}\n`);
  lines.push(`**Position globale:** ${result.overallPosition}\n`);

  if (result.strengths.length > 0) {
    lines.push(`**Points forts:**`);
    for (const strength of result.strengths) {
      lines.push(`- ${strength}`);
    }
    lines.push('');
  }

  if (result.weaknesses.length > 0) {
    lines.push(`**Points faibles:**`);
    for (const weakness of result.weaknesses) {
      lines.push(`- ${weakness}`);
    }
    lines.push('');
  }

  lines.push(`**Détail des métriques:**`);
  for (const metric of result.metrics) {
    if (metric.assessment !== 'insufficient_data') {
      const emoji = getAssessmentEmoji(metric.assessment);
      lines.push(`- ${emoji} ${metric.displayName}: ${metric.dealValue}${metric.unit} (${metric.percentile}e percentile)`);
      lines.push(`  P25: ${metric.p25} | Médiane: ${metric.median} | P75: ${metric.p75}`);
    }
  }
  lines.push('');

  lines.push(`**Recommandations:**`);
  for (const rec of result.recommendations) {
    lines.push(`- ${rec}`);
  }

  return lines.join('\n');
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}Md€`;
  } else if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M€`;
  } else if (value >= 1_000) {
    return `${(value / 1_000).toFixed(0)}K€`;
  }
  return `${value.toFixed(0)}€`;
}

function getAssessmentEmoji(assessment: string): string {
  const emojis: Record<string, string> = {
    top_quartile: '[++]',
    above_average: '[+]',
    average: '[=]',
    below_average: '[-]',
    bottom_quartile: '[--]',
  };
  return emojis[assessment] || '[?]';
}
