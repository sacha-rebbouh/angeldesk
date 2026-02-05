/**
 * Simulation Tool - Valuation projections with different scenarios
 *
 * Used by the chat agent to run "what-if" scenarios for deal valuations.
 * Example: "Si le growth rate passe à 150%, la valo à 3 ans serait..."
 */

// ============================================================================
// TYPES
// ============================================================================

export interface SimulationParams {
  currentArr: number;
  currentGrowthRate: number; // As percentage (e.g., 100 = 100%)
  currentValuation: number;
  scenarios: Array<{
    name: string;
    growthRate: number; // As percentage
    multiple: number; // Revenue multiple
  }>;
  horizonYears: number; // Default: 3
}

export interface YearlyProjection {
  year: number;
  arr: number;
  growthRate: number;
  valuation: number;
  valuationChange: number; // % change from current
}

export interface ScenarioResult {
  name: string;
  growthRate: number;
  multiple: number;
  projections: YearlyProjection[];
  finalArr: number;
  finalValuation: number;
  totalReturn: number; // x multiple (e.g., 3.5x)
  irr: number; // Internal Rate of Return
  cagr: number; // Compound Annual Growth Rate
}

export interface SimulationResult {
  currentMetrics: {
    arr: number;
    growthRate: number;
    valuation: number;
    impliedMultiple: number;
  };
  scenarios: ScenarioResult[];
  comparison: {
    bestCase: string;
    worstCase: string;
    medianReturn: number;
    returnSpread: number; // Difference between best and worst
  };
  insights: string[];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate ARR for a given year with compounding growth
 */
function calculateFutureArr(
  currentArr: number,
  growthRate: number,
  years: number
): number {
  // Growth rate is a percentage (e.g., 100 = 100% growth)
  const growthMultiplier = 1 + growthRate / 100;
  return currentArr * Math.pow(growthMultiplier, years);
}

/**
 * Calculate IRR (Internal Rate of Return) using Newton-Raphson method
 * Simplified: assumes single investment at t=0, single exit at t=horizon
 */
function calculateIrr(
  initialInvestment: number,
  finalValue: number,
  years: number
): number {
  if (initialInvestment <= 0 || finalValue <= 0 || years <= 0) {
    return 0;
  }

  // IRR = (FinalValue / InitialInvestment)^(1/years) - 1
  const irr = Math.pow(finalValue / initialInvestment, 1 / years) - 1;
  return irr * 100; // Return as percentage
}

/**
 * Calculate CAGR for ARR growth
 */
function calculateCagr(
  startValue: number,
  endValue: number,
  years: number
): number {
  if (startValue <= 0 || endValue <= 0 || years <= 0) {
    return 0;
  }

  const cagr = Math.pow(endValue / startValue, 1 / years) - 1;
  return cagr * 100; // Return as percentage
}

/**
 * Generate insights based on simulation results
 */
function generateInsights(
  params: SimulationParams,
  scenarios: ScenarioResult[]
): string[] {
  const insights: string[] = [];

  // Sort scenarios by final valuation
  const sortedByReturn = [...scenarios].sort(
    (a, b) => b.totalReturn - a.totalReturn
  );

  const best = sortedByReturn[0];
  const worst = sortedByReturn[sortedByReturn.length - 1];

  // Insight 1: Growth rate impact
  const growthImpact = best.finalValuation - worst.finalValuation;
  const growthImpactPct = ((growthImpact / worst.finalValuation) * 100).toFixed(0);
  insights.push(
    `La différence entre le scénario optimiste (${best.name}) et pessimiste (${worst.name}) ` +
    `représente ${formatCurrency(growthImpact)} de valorisation (+${growthImpactPct}%).`
  );

  // Insight 2: Break-even multiple
  const impliedMultiple = params.currentValuation / params.currentArr;
  insights.push(
    `Au multiple actuel de ${impliedMultiple.toFixed(1)}x ARR, ` +
    `l'entreprise doit maintenir un growth rate > ${(impliedMultiple * 10).toFixed(0)}% ` +
    `pour justifier cette valorisation selon la "Rule of 40".`
  );

  // Insight 3: Time to 10M ARR (if not already there)
  if (params.currentArr < 10_000_000) {
    const yearsTo10M = Math.log(10_000_000 / params.currentArr) /
                       Math.log(1 + params.currentGrowthRate / 100);
    insights.push(
      `Au rythme actuel (${params.currentGrowthRate}% YoY), ` +
      `l'entreprise atteindra 10M€ ARR dans ${yearsTo10M.toFixed(1)} ans.`
    );
  }

  // Insight 4: Multiple compression/expansion
  const avgFinalMultiple = scenarios.reduce(
    (sum, s) => sum + s.multiple, 0
  ) / scenarios.length;

  if (avgFinalMultiple < impliedMultiple) {
    insights.push(
      `Attention: les multiples de sortie moyens (${avgFinalMultiple.toFixed(1)}x) ` +
      `sont inférieurs au multiple actuel (${impliedMultiple.toFixed(1)}x). ` +
      `Une compression des multiples pourrait impacter négativement les retours.`
    );
  }

  // Insight 5: IRR comparison with market
  const avgIrr = scenarios.reduce((sum, s) => sum + s.irr, 0) / scenarios.length;
  if (avgIrr < 25) {
    insights.push(
      `L'IRR moyen de ${avgIrr.toFixed(0)}% est en dessous du seuil typique de 25% ` +
      `attendu par les VCs pour un investissement early-stage.`
    );
  } else if (avgIrr > 40) {
    insights.push(
      `L'IRR moyen de ${avgIrr.toFixed(0)}% est attractif et au-dessus ` +
      `des attentes standard (25-40%) pour ce type d'investissement.`
    );
  }

  return insights;
}

/**
 * Format currency in a readable way
 */
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

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Run valuation simulation with multiple scenarios
 *
 * @param params - Simulation parameters including current metrics and scenarios
 * @returns Detailed simulation results with projections and insights
 */
export function runValuationSimulation(
  params: SimulationParams
): SimulationResult {
  const { currentArr, currentGrowthRate, currentValuation, scenarios, horizonYears } = params;

  // Calculate current implied multiple
  const impliedMultiple = currentArr > 0 ? currentValuation / currentArr : 0;

  // Process each scenario
  const scenarioResults: ScenarioResult[] = scenarios.map((scenario) => {
    const projections: YearlyProjection[] = [];

    // Project each year
    for (let year = 1; year <= horizonYears; year++) {
      const arr = calculateFutureArr(currentArr, scenario.growthRate, year);
      const valuation = arr * scenario.multiple;
      const valuationChange = ((valuation - currentValuation) / currentValuation) * 100;

      projections.push({
        year,
        arr: Math.round(arr),
        growthRate: scenario.growthRate,
        valuation: Math.round(valuation),
        valuationChange: Math.round(valuationChange * 10) / 10,
      });
    }

    const finalProjection = projections[projections.length - 1];
    const totalReturn = finalProjection.valuation / currentValuation;
    const irr = calculateIrr(currentValuation, finalProjection.valuation, horizonYears);
    const cagr = calculateCagr(currentArr, finalProjection.arr, horizonYears);

    return {
      name: scenario.name,
      growthRate: scenario.growthRate,
      multiple: scenario.multiple,
      projections,
      finalArr: finalProjection.arr,
      finalValuation: finalProjection.valuation,
      totalReturn: Math.round(totalReturn * 100) / 100,
      irr: Math.round(irr * 10) / 10,
      cagr: Math.round(cagr * 10) / 10,
    };
  });

  // Sort by return for comparison
  const sortedByReturn = [...scenarioResults].sort(
    (a, b) => b.totalReturn - a.totalReturn
  );

  const returns = scenarioResults.map((s) => s.totalReturn);
  const medianReturn = returns.sort((a, b) => a - b)[Math.floor(returns.length / 2)];
  const returnSpread = Math.max(...returns) - Math.min(...returns);

  // Generate insights
  const insights = generateInsights(params, scenarioResults);

  return {
    currentMetrics: {
      arr: currentArr,
      growthRate: currentGrowthRate,
      valuation: currentValuation,
      impliedMultiple: Math.round(impliedMultiple * 10) / 10,
    },
    scenarios: scenarioResults,
    comparison: {
      bestCase: sortedByReturn[0].name,
      worstCase: sortedByReturn[sortedByReturn.length - 1].name,
      medianReturn: Math.round(medianReturn * 100) / 100,
      returnSpread: Math.round(returnSpread * 100) / 100,
    },
    insights,
  };
}

// ============================================================================
// PRESET SCENARIOS
// ============================================================================

/**
 * Generate standard scenarios based on current metrics
 */
export function generateStandardScenarios(
  currentGrowthRate: number,
  stage: 'seed' | 'series_a' | 'series_b' | 'later' = 'seed'
): Array<{ name: string; growthRate: number; multiple: number }> {
  // Stage-appropriate multiples
  const stageMultiples: Record<string, { optimistic: number; base: number; pessimistic: number }> = {
    seed: { optimistic: 20, base: 12, pessimistic: 6 },
    series_a: { optimistic: 15, base: 10, pessimistic: 5 },
    series_b: { optimistic: 12, base: 8, pessimistic: 4 },
    later: { optimistic: 10, base: 6, pessimistic: 3 },
  };

  const multiples = stageMultiples[stage] || stageMultiples.seed;

  return [
    {
      name: 'Scénario optimiste',
      growthRate: Math.min(currentGrowthRate * 1.5, 200), // Cap at 200%
      multiple: multiples.optimistic,
    },
    {
      name: 'Scénario base',
      growthRate: currentGrowthRate,
      multiple: multiples.base,
    },
    {
      name: 'Scénario dégradé',
      growthRate: currentGrowthRate * 0.6,
      multiple: multiples.pessimistic,
    },
    {
      name: 'Scénario stagnation',
      growthRate: 20, // Minimal growth
      multiple: multiples.pessimistic * 0.75,
    },
  ];
}

// ============================================================================
// TOOL DEFINITION (for chat agent)
// ============================================================================

export const simulationToolDefinition = {
  name: 'valuation_simulation',
  description: `Exécute une simulation de valorisation avec différents scénarios de croissance et multiples.
Utile pour répondre aux questions "que se passe-t-il si..." ou projeter la valorisation future.`,
  parameters: {
    type: 'object' as const,
    properties: {
      currentArr: {
        type: 'number',
        description: 'ARR actuel en euros',
      },
      currentGrowthRate: {
        type: 'number',
        description: 'Taux de croissance annuel actuel (en %, ex: 100 pour 100%)',
      },
      currentValuation: {
        type: 'number',
        description: 'Valorisation actuelle (pre-money) en euros',
      },
      scenarios: {
        type: 'array',
        description: 'Liste des scénarios à simuler (optionnel, généré automatiquement si absent)',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            growthRate: { type: 'number' },
            multiple: { type: 'number' },
          },
          required: ['name', 'growthRate', 'multiple'],
        },
      },
      horizonYears: {
        type: 'number',
        description: 'Horizon de projection en années (défaut: 3)',
        default: 3,
      },
      stage: {
        type: 'string',
        enum: ['seed', 'series_a', 'series_b', 'later'],
        description: 'Stage de la startup (pour calibrer les multiples si scénarios non fournis)',
      },
    },
    required: ['currentArr', 'currentGrowthRate', 'currentValuation'],
  },
};
