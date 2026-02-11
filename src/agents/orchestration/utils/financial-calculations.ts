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

// ============================================
// F78: IRR (Newton-Raphson) + DILUTION
// ============================================

/**
 * Calculates IRR via Newton-Raphson iteration.
 * Supports multiple cashflows (not just invest -> exit).
 */
export function calculateIRR(
  cashflows: number[],
  periods: number[],
  maxIterations = 100
): CalculationResult | { error: string } {
  if (cashflows.length !== periods.length) {
    return { error: "cashflows et periods doivent avoir la meme taille" };
  }
  if (cashflows.length < 2) {
    return { error: "Au minimum 2 cashflows requis (investissement + sortie)" };
  }

  let rate = 0.1;
  const tolerance = 1e-7;

  for (let i = 0; i < maxIterations; i++) {
    let npv = 0;
    let derivative = 0;

    for (let j = 0; j < cashflows.length; j++) {
      const t = periods[j];
      const discountFactor = Math.pow(1 + rate, -t);
      npv += cashflows[j] * discountFactor;
      derivative -= t * cashflows[j] * Math.pow(1 + rate, -(t + 1));
    }

    if (Math.abs(npv) < tolerance) {
      const irr = rate * 100;
      const cfStr = cashflows.map((cf, idx) => `Y${periods[idx]}:${cf >= 0 ? "+" : ""}${formatCurrency(cf)}`).join(", ");
      return {
        value: Math.round(irr * 10) / 10,
        formula: "IRR via Newton-Raphson: NPV(r) = 0",
        inputs: cashflows.map((cf, idx) => ({
          name: `Cashflow Y${periods[idx]}`,
          value: cf,
          source: "Scenario projection",
        })),
        formatted: `${(Math.round(irr * 10) / 10).toFixed(1)}%`,
        calculation: `IRR(${cfStr}) = ${(Math.round(irr * 10) / 10).toFixed(1)}% (${i + 1} iterations)`,
      };
    }

    if (Math.abs(derivative) < 1e-10) {
      rate += 0.05;
      continue;
    }

    rate = rate - npv / derivative;
    if (rate < -0.99) rate = -0.99;
    if (rate > 10) rate = 10;
  }

  // Fallback: simplified formula if Newton-Raphson doesn't converge
  const totalInvest = Math.abs(cashflows[0]);
  const totalReturn = cashflows[cashflows.length - 1];
  const years = periods[periods.length - 1] - periods[0];

  if (totalInvest > 0 && totalReturn > 0 && years > 0) {
    const multiple = totalReturn / totalInvest;
    const approxIRR = (Math.pow(multiple, 1 / years) - 1) * 100;
    return {
      value: Math.round(approxIRR * 10) / 10,
      formula: "IRR approx = ((Multiple)^(1/years) - 1) x 100",
      inputs: [
        { name: "Investment", value: totalInvest, source: "Scenario" },
        { name: "Return", value: totalReturn, source: "Scenario" },
        { name: "Years", value: years, source: "Scenario" },
      ],
      formatted: `~${(Math.round(approxIRR * 10) / 10).toFixed(1)}% (approx)`,
      calculation: `((${(totalReturn / totalInvest).toFixed(1)}x)^(1/${years}) - 1) x 100 = ~${(Math.round(approxIRR * 10) / 10).toFixed(1)}%`,
    };
  }

  return { error: "IRR non convergent et fallback impossible" };
}

/**
 * Calculates cumulative dilution through multiple rounds.
 */
export function calculateCumulativeDilution(
  initialOwnership: number,
  rounds: { name: string; dilutionPercent: number; source: string }[]
): CalculationResult {
  let currentOwnership = initialOwnership;
  const steps: string[] = [`Initial: ${initialOwnership.toFixed(2)}%`];

  for (const round of rounds) {
    const factor = 1 - round.dilutionPercent / 100;
    const newOwnership = currentOwnership * factor;
    steps.push(`Apres ${round.name} (-${round.dilutionPercent}%): ${currentOwnership.toFixed(2)}% x ${factor.toFixed(3)} = ${newOwnership.toFixed(3)}%`);
    currentOwnership = newOwnership;
  }

  const totalDilution = ((initialOwnership - currentOwnership) / initialOwnership) * 100;

  return {
    value: currentOwnership,
    formula: "Ownership = Initial x (1 - dil_1) x (1 - dil_2) x ...",
    inputs: [
      { name: "Initial ownership", value: initialOwnership, source: "Cap table" },
      ...rounds.map(r => ({ name: r.name, value: r.dilutionPercent, source: r.source })),
    ],
    formatted: `${currentOwnership.toFixed(3)}% (dilution totale: ${totalDilution.toFixed(1)}%)`,
    calculation: steps.join(" → "),
  };
}
