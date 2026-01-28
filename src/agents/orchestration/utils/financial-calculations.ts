/**
 * Financial calculations module
 * ALL financial calculations are done in TypeScript code - LLMs never calculate.
 */

export interface CalculationResult {
  value: number;
  formula: string;
  inputs: { name: string; value: number; source: string }[];
  formatted: string;
  calculation: string;
}

// ============================================
// METRIQUES SaaS
// ============================================

export function calculateARR(
  mrr: number,
  source: string
): CalculationResult {
  const arr = mrr * 12;
  return {
    value: arr,
    formula: "ARR = MRR x 12",
    inputs: [{ name: "MRR", value: mrr, source }],
    formatted: formatCurrency(arr),
    calculation: `MRR ${formatCurrency(mrr)} x 12 = ${formatCurrency(arr)}`,
  };
}

export function calculateGrossMargin(
  revenue: number,
  cogs: number,
  revenueSource: string,
  cogsSource: string
): CalculationResult {
  const grossProfit = revenue - cogs;
  const margin = (grossProfit / revenue) * 100;

  return {
    value: margin,
    formula: "Gross Margin = (Revenue - COGS) / Revenue x 100",
    inputs: [
      { name: "Revenue", value: revenue, source: revenueSource },
      { name: "COGS", value: cogs, source: cogsSource },
    ],
    formatted: `${margin.toFixed(1)}%`,
    calculation: `(${formatCurrency(revenue)} - ${formatCurrency(cogs)}) / ${formatCurrency(revenue)} x 100 = ${margin.toFixed(1)}%`,
  };
}

export function calculateCAGR(
  startValue: number,
  endValue: number,
  years: number,
  startSource: string,
  endSource: string
): CalculationResult {
  const cagr = (Math.pow(endValue / startValue, 1 / years) - 1) * 100;

  return {
    value: cagr,
    formula: "CAGR = ((End Value / Start Value)^(1/Years) - 1) x 100",
    inputs: [
      { name: "Start Value", value: startValue, source: startSource },
      { name: "End Value", value: endValue, source: endSource },
      { name: "Years", value: years, source: "Periode de projection" },
    ],
    formatted: `${cagr.toFixed(1)}%`,
    calculation: `(${formatCurrency(endValue)} / ${formatCurrency(startValue)})^(1/${years}) - 1 = ${cagr.toFixed(1)}%`,
  };
}

export function calculateLTVCACRatio(
  ltv: number,
  cac: number,
  ltvSource: string,
  cacSource: string
): CalculationResult {
  const ratio = ltv / cac;

  return {
    value: ratio,
    formula: "LTV/CAC = LTV / CAC",
    inputs: [
      { name: "LTV", value: ltv, source: ltvSource },
      { name: "CAC", value: cac, source: cacSource },
    ],
    formatted: `${ratio.toFixed(1)}x`,
    calculation: `${formatCurrency(ltv)} / ${formatCurrency(cac)} = ${ratio.toFixed(1)}x`,
  };
}

export function calculateRuleOf40(
  revenueGrowth: number,
  profitMargin: number,
  growthSource: string,
  marginSource: string
): CalculationResult {
  const score = revenueGrowth + profitMargin;

  return {
    value: score,
    formula: "Rule of 40 = Revenue Growth % + Profit Margin %",
    inputs: [
      { name: "Revenue Growth", value: revenueGrowth, source: growthSource },
      { name: "Profit Margin", value: profitMargin, source: marginSource },
    ],
    formatted: `${score.toFixed(0)}%`,
    calculation: `${revenueGrowth.toFixed(1)}% + ${profitMargin.toFixed(1)}% = ${score.toFixed(0)}%`,
  };
}

// ============================================
// COMPARAISONS
// ============================================

export function calculatePercentageDeviation(
  valueA: number,
  valueB: number
): { deviation: number; formatted: string; significant: boolean } {
  const avg = (valueA + valueB) / 2;
  const deviation = (Math.abs(valueA - valueB) / avg) * 100;

  return {
    deviation,
    formatted: `${deviation.toFixed(1)}%`,
    significant: deviation > 30, // Seuil de contradiction
  };
}

export function calculatePercentile(
  value: number,
  benchmarks: { p25: number; median: number; p75: number; p90?: number }
): { percentile: number; interpretation: string } {
  // Guard: avoid division by zero when p25 === 0
  if (benchmarks.p25 === 0) {
    return {
      percentile: 0,
      interpretation: "Cannot calculate (benchmark P25 = 0)",
    };
  }

  if (value <= benchmarks.p25) {
    return {
      percentile: 25 * (value / benchmarks.p25),
      interpretation: "Bottom quartile",
    };
  }
  if (value <= benchmarks.median) {
    return {
      percentile:
        25 +
        25 *
          ((value - benchmarks.p25) / (benchmarks.median - benchmarks.p25)),
      interpretation: "Below median",
    };
  }
  if (value <= benchmarks.p75) {
    return {
      percentile:
        50 +
        25 *
          ((value - benchmarks.median) /
            (benchmarks.p75 - benchmarks.median)),
      interpretation: "Above median",
    };
  }
  if (benchmarks.p90 && value <= benchmarks.p90) {
    return {
      percentile:
        75 +
        15 *
          ((value - benchmarks.p75) / (benchmarks.p90 - benchmarks.p75)),
      interpretation: "Top quartile",
    };
  }
  return { percentile: 95, interpretation: "Top decile" };
}

// ============================================
// HELPERS
// ============================================

function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M\u20AC`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(0)}K\u20AC`;
  }
  return `${value.toFixed(0)}\u20AC`;
}

// ============================================
// VALIDATION
// ============================================

export function validateAndCalculate(
  calculationFn: () => CalculationResult,
  validation: {
    minValue?: number;
    maxValue?: number;
    mustBePositive?: boolean;
  }
): CalculationResult | { error: string } {
  try {
    const result = calculationFn();

    if (validation.mustBePositive && result.value < 0) {
      return { error: `Resultat negatif inattendu: ${result.value}` };
    }

    if (
      validation.minValue !== undefined &&
      result.value < validation.minValue
    ) {
      return {
        error: `Valeur ${result.value} inferieure au minimum ${validation.minValue}`,
      };
    }

    if (
      validation.maxValue !== undefined &&
      result.value > validation.maxValue
    ) {
      return {
        error: `Valeur ${result.value} superieure au maximum ${validation.maxValue}`,
      };
    }

    return result;
  } catch (e) {
    return { error: `Erreur de calcul: ${e}` };
  }
}
