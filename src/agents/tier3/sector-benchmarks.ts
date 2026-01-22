/**
 * Sector-Specific Benchmark Definitions
 * Real data from industry reports for each sector
 */

// ============================================================================
// TYPES
// ============================================================================

export interface SectorMetricBenchmark {
  name: string;
  unit: string;
  description: string;
  direction: "higher_better" | "lower_better" | "target_range";
  targetRange?: { min: number; max: number };
  // Benchmark values by stage
  stages: {
    PRE_SEED?: MetricPercentiles;
    SEED: MetricPercentiles;
    SERIES_A: MetricPercentiles;
    SERIES_B?: MetricPercentiles;
  };
  // Scoring thresholds
  thresholds: {
    exceptional: number; // >= this = exceptional
    good: number; // >= this = good
    concerning: number; // <= this = concerning
  };
  // Why this metric matters in this sector
  sectorContext: string;
}

export interface MetricPercentiles {
  p25: number;
  median: number;
  p75: number;
  topDecile: number;
}

export interface SectorBenchmarkData {
  sector: string;
  // Primary KPIs - the 3-5 most critical metrics
  primaryMetrics: SectorMetricBenchmark[];
  // Secondary metrics - supporting indicators
  secondaryMetrics: SectorMetricBenchmark[];
  // Exit expectations
  exitMultiples: {
    low: number;
    median: number;
    high: number;
    topDecile: number;
    typicalAcquirers: string[];
    recentExits: { company: string; acquirer: string; multiple: number; year: number }[];
  };
  // Unit economics formulas specific to this sector
  unitEconomicsFormulas: {
    name: string;
    formula: string;
    benchmark: { good: number; excellent: number };
  }[];
  // Sector-specific red flag rules with thresholds
  redFlagRules: {
    metric: string;
    condition: "below" | "above";
    threshold: number;
    severity: "critical" | "major" | "minor";
    reason: string;
  }[];
}

// ============================================================================
// SAAS B2B BENCHMARKS
// ============================================================================

export const SAAS_BENCHMARKS: SectorBenchmarkData = {
  sector: "SaaS B2B",
  primaryMetrics: [
    {
      name: "Net Revenue Retention",
      unit: "%",
      description: "Revenue from existing customers after churn and expansion",
      direction: "higher_better",
      stages: {
        SEED: { p25: 95, median: 110, p75: 125, topDecile: 140 },
        SERIES_A: { p25: 100, median: 115, p75: 130, topDecile: 150 },
        SERIES_B: { p25: 105, median: 120, p75: 140, topDecile: 160 },
      },
      thresholds: { exceptional: 130, good: 110, concerning: 95 },
      sectorContext: "NRR > 100% means you can grow without acquiring new customers. Best-in-class SaaS companies have NRR > 130%.",
    },
    {
      name: "ARR Growth YoY",
      unit: "%",
      description: "Year-over-year annual recurring revenue growth",
      direction: "higher_better",
      stages: {
        PRE_SEED: { p25: 150, median: 250, p75: 400, topDecile: 600 },
        SEED: { p25: 80, median: 120, p75: 200, topDecile: 300 },
        SERIES_A: { p25: 60, median: 100, p75: 150, topDecile: 200 },
        SERIES_B: { p25: 40, median: 70, p75: 100, topDecile: 150 },
      },
      thresholds: { exceptional: 150, good: 100, concerning: 50 },
      sectorContext: "T2D3 (triple twice, double thrice) is the gold standard. Seed: 3x, Series A: 3x, Series B: 2x.",
    },
    {
      name: "Gross Margin",
      unit: "%",
      description: "Revenue minus cost of goods sold",
      direction: "higher_better",
      stages: {
        SEED: { p25: 65, median: 75, p75: 82, topDecile: 88 },
        SERIES_A: { p25: 70, median: 78, p75: 85, topDecile: 90 },
        SERIES_B: { p25: 72, median: 80, p75: 87, topDecile: 92 },
      },
      thresholds: { exceptional: 85, good: 75, concerning: 65 },
      sectorContext: "True SaaS should have 75%+ gross margin. < 70% often indicates services dependency.",
    },
    {
      name: "CAC Payback",
      unit: "months",
      description: "Months to recover customer acquisition cost",
      direction: "lower_better",
      stages: {
        SEED: { p25: 18, median: 12, p75: 8, topDecile: 5 },
        SERIES_A: { p25: 15, median: 10, p75: 6, topDecile: 4 },
        SERIES_B: { p25: 12, median: 9, p75: 5, topDecile: 3 },
      },
      thresholds: { exceptional: 6, good: 12, concerning: 24 },
      sectorContext: "< 12 months is healthy. > 18 months requires strong NRR to compensate.",
    },
    {
      name: "LTV/CAC Ratio",
      unit: "x",
      description: "Customer lifetime value divided by acquisition cost",
      direction: "higher_better",
      stages: {
        SEED: { p25: 2.5, median: 3.5, p75: 5.0, topDecile: 7.0 },
        SERIES_A: { p25: 3.0, median: 4.0, p75: 6.0, topDecile: 8.0 },
        SERIES_B: { p25: 3.5, median: 5.0, p75: 7.0, topDecile: 10.0 },
      },
      thresholds: { exceptional: 5, good: 3, concerning: 2 },
      sectorContext: "3x is the minimum for sustainable unit economics. < 3x means you're burning cash on growth.",
    },
  ],
  secondaryMetrics: [
    {
      name: "Rule of 40",
      unit: "%",
      description: "Growth rate + profit margin",
      direction: "higher_better",
      stages: {
        SEED: { p25: 15, median: 30, p75: 50, topDecile: 70 },
        SERIES_A: { p25: 20, median: 40, p75: 60, topDecile: 80 },
        SERIES_B: { p25: 30, median: 45, p75: 65, topDecile: 85 },
      },
      thresholds: { exceptional: 60, good: 40, concerning: 20 },
      sectorContext: "Growth + Margin >= 40%. High growth can compensate for negative margins early.",
    },
    {
      name: "Magic Number",
      unit: "x",
      description: "Net new ARR / S&M spend (previous quarter)",
      direction: "higher_better",
      stages: {
        SEED: { p25: 0.5, median: 0.75, p75: 1.0, topDecile: 1.5 },
        SERIES_A: { p25: 0.6, median: 0.8, p75: 1.2, topDecile: 1.8 },
        SERIES_B: { p25: 0.7, median: 1.0, p75: 1.5, topDecile: 2.0 },
      },
      thresholds: { exceptional: 1.0, good: 0.75, concerning: 0.5 },
      sectorContext: "> 1.0 means you're efficiently converting S&M spend into ARR. < 0.5 indicates GTM inefficiency.",
    },
    {
      name: "Burn Multiple",
      unit: "x",
      description: "Net burn / Net new ARR",
      direction: "lower_better",
      stages: {
        PRE_SEED: { p25: 3.0, median: 2.0, p75: 1.2, topDecile: 0.8 },
        SEED: { p25: 2.5, median: 1.8, p75: 1.2, topDecile: 0.8 },
        SERIES_A: { p25: 2.0, median: 1.5, p75: 1.0, topDecile: 0.6 },
        SERIES_B: { p25: 1.8, median: 1.2, p75: 0.8, topDecile: 0.5 },
      },
      thresholds: { exceptional: 1.0, good: 1.5, concerning: 2.5 },
      sectorContext: "How much cash you burn per $ of new ARR. < 1.5x is efficient, > 2.5x is concerning.",
    },
    {
      name: "Quick Ratio",
      unit: "x",
      description: "(New MRR + Expansion) / (Churn + Contraction)",
      direction: "higher_better",
      stages: {
        SEED: { p25: 2.0, median: 3.0, p75: 4.5, topDecile: 6.0 },
        SERIES_A: { p25: 2.5, median: 3.5, p75: 5.0, topDecile: 7.0 },
        SERIES_B: { p25: 3.0, median: 4.0, p75: 6.0, topDecile: 8.0 },
      },
      thresholds: { exceptional: 4, good: 3, concerning: 2 },
      sectorContext: "Measures growth efficiency. 4x is healthy, < 2x means churn is eating growth.",
    },
    {
      name: "Logo Churn Rate",
      unit: "%",
      description: "Annual customer logo churn",
      direction: "lower_better",
      stages: {
        SEED: { p25: 15, median: 10, p75: 6, topDecile: 3 },
        SERIES_A: { p25: 12, median: 8, p75: 5, topDecile: 2 },
        SERIES_B: { p25: 10, median: 6, p75: 4, topDecile: 2 },
      },
      thresholds: { exceptional: 5, good: 10, concerning: 20 },
      sectorContext: "SMB: 15-20% acceptable. Enterprise: should be < 5%.",
    },
  ],
  exitMultiples: {
    low: 5,
    median: 10,
    high: 20,
    topDecile: 35,
    typicalAcquirers: ["Salesforce", "Microsoft", "SAP", "Oracle", "Adobe", "ServiceNow", "Private Equity"],
    recentExits: [
      { company: "Figma", acquirer: "Adobe", multiple: 50, year: 2022 },
      { company: "Slack", acquirer: "Salesforce", multiple: 26, year: 2021 },
      { company: "Mailchimp", acquirer: "Intuit", multiple: 14, year: 2021 },
    ],
  },
  unitEconomicsFormulas: [
    { name: "LTV", formula: "ARPA × Gross Margin × (1 / Churn Rate)", benchmark: { good: 3, excellent: 5 } },
    { name: "CAC Ratio", formula: "(S&M Spend) / (New Customers)", benchmark: { good: 0.33, excellent: 0.2 } },
    { name: "Expansion Revenue %", formula: "Expansion MRR / Beginning MRR", benchmark: { good: 0.03, excellent: 0.05 } },
  ],
  redFlagRules: [
    { metric: "Net Revenue Retention", condition: "below", threshold: 90, severity: "critical", reason: "NRR < 90% indicates fundamental product-market fit issues" },
    { metric: "CAC Payback", condition: "above", threshold: 24, severity: "critical", reason: "CAC payback > 24 months is unsustainable without massive NRR" },
    { metric: "Gross Margin", condition: "below", threshold: 60, severity: "major", reason: "Gross margin < 60% suggests heavy services dependency" },
    { metric: "Burn Multiple", condition: "above", threshold: 3.0, severity: "major", reason: "Burn multiple > 3x means inefficient capital deployment" },
    { metric: "Logo Churn Rate", condition: "above", threshold: 25, severity: "major", reason: "Logo churn > 25% indicates serious retention problems" },
  ],
};

// ============================================================================
// FINTECH BENCHMARKS
// ============================================================================

export const FINTECH_BENCHMARKS: SectorBenchmarkData = {
  sector: "Fintech",
  primaryMetrics: [
    {
      name: "Total Payment Volume",
      unit: "$M",
      description: "Total value of transactions processed",
      direction: "higher_better",
      stages: {
        SEED: { p25: 10, median: 50, p75: 150, topDecile: 500 },
        SERIES_A: { p25: 100, median: 500, p75: 1500, topDecile: 5000 },
        SERIES_B: { p25: 500, median: 2000, p75: 8000, topDecile: 25000 },
      },
      thresholds: { exceptional: 1000, good: 100, concerning: 10 },
      sectorContext: "TPV is the north star for payments companies. Revenue = TPV × Take Rate.",
    },
    {
      name: "Take Rate",
      unit: "%",
      description: "Net revenue as percentage of transaction volume",
      direction: "higher_better",
      targetRange: { min: 0.5, max: 5 },
      stages: {
        SEED: { p25: 0.5, median: 1.5, p75: 3.0, topDecile: 5.0 },
        SERIES_A: { p25: 0.8, median: 2.0, p75: 3.5, topDecile: 5.5 },
        SERIES_B: { p25: 1.0, median: 2.5, p75: 4.0, topDecile: 6.0 },
      },
      thresholds: { exceptional: 3, good: 1.5, concerning: 0.3 },
      sectorContext: "Card networks: 0.1-0.3%. Payment facilitators: 0.5-3%. Embedded finance: 2-5%.",
    },
    {
      name: "Net Interest Margin",
      unit: "%",
      description: "Interest income minus interest expense / assets (lending)",
      direction: "higher_better",
      stages: {
        SEED: { p25: 3, median: 5, p75: 8, topDecile: 12 },
        SERIES_A: { p25: 4, median: 6, p75: 9, topDecile: 14 },
        SERIES_B: { p25: 5, median: 7, p75: 10, topDecile: 15 },
      },
      thresholds: { exceptional: 8, good: 5, concerning: 2 },
      sectorContext: "Traditional banks: 2-4%. Fintech lenders: 5-15%. Higher NIM = higher risk profile.",
    },
    {
      name: "Default Rate",
      unit: "%",
      description: "Percentage of loans in default (30+ days)",
      direction: "lower_better",
      stages: {
        SEED: { p25: 8, median: 5, p75: 3, topDecile: 1.5 },
        SERIES_A: { p25: 6, median: 4, p75: 2.5, topDecile: 1 },
        SERIES_B: { p25: 5, median: 3, p75: 2, topDecile: 0.8 },
      },
      thresholds: { exceptional: 2, good: 4, concerning: 8 },
      sectorContext: "Prime: < 2%. Near-prime: 3-6%. Subprime: > 8%. Must compare to portfolio risk profile.",
    },
    {
      name: "Fraud Rate",
      unit: "%",
      description: "Fraudulent transactions as % of volume",
      direction: "lower_better",
      stages: {
        SEED: { p25: 0.5, median: 0.3, p75: 0.15, topDecile: 0.05 },
        SERIES_A: { p25: 0.3, median: 0.15, p75: 0.08, topDecile: 0.03 },
        SERIES_B: { p25: 0.2, median: 0.1, p75: 0.05, topDecile: 0.02 },
      },
      thresholds: { exceptional: 0.05, good: 0.15, concerning: 0.5 },
      sectorContext: "Industry average: 0.1-0.2%. > 0.5% indicates weak KYC/AML processes.",
    },
  ],
  secondaryMetrics: [
    {
      name: "Cost per Transaction",
      unit: "$",
      description: "Fully loaded cost to process one transaction",
      direction: "lower_better",
      stages: {
        SEED: { p25: 0.50, median: 0.25, p75: 0.10, topDecile: 0.05 },
        SERIES_A: { p25: 0.30, median: 0.15, p75: 0.08, topDecile: 0.03 },
        SERIES_B: { p25: 0.20, median: 0.10, p75: 0.05, topDecile: 0.02 },
      },
      thresholds: { exceptional: 0.05, good: 0.15, concerning: 0.50 },
      sectorContext: "Must be significantly lower than take rate to have positive unit economics.",
    },
    {
      name: "Customer Acquisition Cost",
      unit: "$",
      description: "Cost to acquire one customer",
      direction: "lower_better",
      stages: {
        SEED: { p25: 100, median: 50, p75: 25, topDecile: 10 },
        SERIES_A: { p25: 80, median: 40, p75: 20, topDecile: 8 },
        SERIES_B: { p25: 60, median: 30, p75: 15, topDecile: 6 },
      },
      thresholds: { exceptional: 15, good: 50, concerning: 150 },
      sectorContext: "B2C fintech CAC should be < $50. B2B can be higher if ACV justifies it.",
    },
    {
      name: "Regulatory Capital Ratio",
      unit: "%",
      description: "Capital reserves / Risk-weighted assets",
      direction: "higher_better",
      stages: {
        SEED: { p25: 8, median: 12, p75: 18, topDecile: 25 },
        SERIES_A: { p25: 10, median: 15, p75: 22, topDecile: 30 },
        SERIES_B: { p25: 12, median: 18, p75: 25, topDecile: 35 },
      },
      thresholds: { exceptional: 20, good: 12, concerning: 6 },
      sectorContext: "Basel III minimum: 8%. Well-capitalized: > 12%. Critical for licensed entities.",
    },
  ],
  exitMultiples: {
    low: 4,
    median: 8,
    high: 15,
    topDecile: 25,
    typicalAcquirers: ["JPMorgan", "Goldman Sachs", "Visa", "Mastercard", "PayPal", "Block", "Stripe"],
    recentExits: [
      { company: "Plaid", acquirer: "Visa (blocked)", multiple: 25, year: 2020 },
      { company: "Credit Karma", acquirer: "Intuit", multiple: 14, year: 2020 },
      { company: "Honey", acquirer: "PayPal", multiple: 20, year: 2020 },
    ],
  },
  unitEconomicsFormulas: [
    { name: "Revenue per Transaction", formula: "TPV × Take Rate / Transactions", benchmark: { good: 0.5, excellent: 1.5 } },
    { name: "Contribution Margin", formula: "(Revenue - Variable Costs) / Revenue", benchmark: { good: 0.4, excellent: 0.6 } },
    { name: "Loss Reserve Ratio", formula: "Loss Reserves / Total Loans", benchmark: { good: 0.05, excellent: 0.03 } },
  ],
  redFlagRules: [
    { metric: "Default Rate", condition: "above", threshold: 10, severity: "critical", reason: "Default rate > 10% indicates broken underwriting model" },
    { metric: "Fraud Rate", condition: "above", threshold: 0.5, severity: "critical", reason: "Fraud > 0.5% suggests weak KYC/AML compliance" },
    { metric: "Take Rate", condition: "below", threshold: 0.2, severity: "major", reason: "Take rate < 0.2% requires massive scale to be viable" },
    { metric: "Regulatory Capital Ratio", condition: "below", threshold: 6, severity: "critical", reason: "Below regulatory minimums - license at risk" },
  ],
};

// ============================================================================
// MARKETPLACE BENCHMARKS
// ============================================================================

export const MARKETPLACE_BENCHMARKS: SectorBenchmarkData = {
  sector: "Marketplace",
  primaryMetrics: [
    {
      name: "GMV Growth YoY",
      unit: "%",
      description: "Year-over-year gross merchandise volume growth",
      direction: "higher_better",
      stages: {
        SEED: { p25: 100, median: 200, p75: 400, topDecile: 700 },
        SERIES_A: { p25: 80, median: 150, p75: 300, topDecile: 500 },
        SERIES_B: { p25: 50, median: 100, p75: 200, topDecile: 350 },
      },
      thresholds: { exceptional: 200, good: 100, concerning: 30 },
      sectorContext: "GMV growth > revenue growth is expected early (take rate expansion). Later, they should converge.",
    },
    {
      name: "Take Rate",
      unit: "%",
      description: "Net revenue as percentage of GMV",
      direction: "higher_better",
      stages: {
        SEED: { p25: 8, median: 15, p75: 22, topDecile: 30 },
        SERIES_A: { p25: 10, median: 18, p75: 25, topDecile: 35 },
        SERIES_B: { p25: 12, median: 20, p75: 28, topDecile: 40 },
      },
      thresholds: { exceptional: 25, good: 15, concerning: 5 },
      sectorContext: "B2C marketplaces: 15-30%. B2B: 5-15%. Services: 20-40%. Lower take rate = more commoditized.",
    },
    {
      name: "Liquidity Score",
      unit: "%",
      description: "% of listings that result in transactions within 30 days",
      direction: "higher_better",
      stages: {
        SEED: { p25: 15, median: 30, p75: 50, topDecile: 70 },
        SERIES_A: { p25: 25, median: 40, p75: 60, topDecile: 80 },
        SERIES_B: { p25: 35, median: 50, p75: 70, topDecile: 85 },
      },
      thresholds: { exceptional: 60, good: 40, concerning: 15 },
      sectorContext: "Measures marketplace health. < 20% = chicken-and-egg problem. > 60% = strong network effects.",
    },
    {
      name: "Repeat Rate",
      unit: "%",
      description: "% of transactions from repeat buyers (monthly)",
      direction: "higher_better",
      stages: {
        SEED: { p25: 20, median: 35, p75: 50, topDecile: 65 },
        SERIES_A: { p25: 30, median: 45, p75: 60, topDecile: 75 },
        SERIES_B: { p25: 40, median: 55, p75: 70, topDecile: 80 },
      },
      thresholds: { exceptional: 60, good: 40, concerning: 20 },
      sectorContext: "High repeat = habitual usage. Low repeat might be OK for high-value infrequent purchases.",
    },
    {
      name: "Buyer CAC",
      unit: "$",
      description: "Cost to acquire one active buyer",
      direction: "lower_better",
      stages: {
        SEED: { p25: 50, median: 25, p75: 12, topDecile: 5 },
        SERIES_A: { p25: 40, median: 20, p75: 10, topDecile: 4 },
        SERIES_B: { p25: 35, median: 18, p75: 8, topDecile: 3 },
      },
      thresholds: { exceptional: 10, good: 25, concerning: 75 },
      sectorContext: "Must be < first transaction margin. Viral marketplaces achieve CAC < $5.",
    },
  ],
  secondaryMetrics: [
    {
      name: "Supply/Demand Ratio",
      unit: "x",
      description: "Active sellers per active buyer",
      direction: "target_range",
      targetRange: { min: 0.1, max: 5 },
      stages: {
        SEED: { p25: 0.5, median: 1.0, p75: 2.0, topDecile: 3.0 },
        SERIES_A: { p25: 0.8, median: 1.5, p75: 3.0, topDecile: 5.0 },
        SERIES_B: { p25: 1.0, median: 2.0, p75: 4.0, topDecile: 6.0 },
      },
      thresholds: { exceptional: 2, good: 1, concerning: 0.2 },
      sectorContext: "Too low = supply constrained. Too high = demand constrained. Optimal varies by category.",
    },
    {
      name: "Avg Order Value",
      unit: "$",
      description: "Average transaction value",
      direction: "higher_better",
      stages: {
        SEED: { p25: 30, median: 75, p75: 200, topDecile: 500 },
        SERIES_A: { p25: 40, median: 100, p75: 300, topDecile: 800 },
        SERIES_B: { p25: 50, median: 120, p75: 400, topDecile: 1000 },
      },
      thresholds: { exceptional: 200, good: 75, concerning: 15 },
      sectorContext: "Higher AOV = easier unit economics but longer sales cycles. Must match category norms.",
    },
  ],
  exitMultiples: {
    low: 1,
    median: 3,
    high: 8,
    topDecile: 15,
    typicalAcquirers: ["Amazon", "eBay", "Etsy", "Uber", "DoorDash", "Booking Holdings", "Private Equity"],
    recentExits: [
      { company: "Depop", acquirer: "Etsy", multiple: 5, year: 2021 },
      { company: "Reverb", acquirer: "Etsy", multiple: 4, year: 2019 },
      { company: "Postmates", acquirer: "Uber", multiple: 3, year: 2020 },
    ],
  },
  unitEconomicsFormulas: [
    { name: "Buyer LTV", formula: "AOV × Take Rate × Purchases/Year × Lifespan", benchmark: { good: 100, excellent: 300 } },
    { name: "Contribution/Transaction", formula: "AOV × Take Rate - Fulfillment Costs", benchmark: { good: 5, excellent: 15 } },
    { name: "Payback Months", formula: "CAC / (Monthly GMV × Take Rate × Margin)", benchmark: { good: 6, excellent: 3 } },
  ],
  redFlagRules: [
    { metric: "Liquidity Score", condition: "below", threshold: 10, severity: "critical", reason: "Liquidity < 10% means marketplace isn't working" },
    { metric: "Take Rate", condition: "below", threshold: 3, severity: "major", reason: "Take rate < 3% requires enormous scale" },
    { metric: "Repeat Rate", condition: "below", threshold: 10, severity: "major", reason: "Repeat < 10% indicates no stickiness" },
    { metric: "Supply/Demand Ratio", condition: "below", threshold: 0.1, severity: "critical", reason: "Severe supply constraint - marketplace can't scale" },
  ],
};

// ============================================================================
// HEALTHTECH BENCHMARKS
// ============================================================================

export const HEALTHTECH_BENCHMARKS: SectorBenchmarkData = {
  sector: "HealthTech",
  primaryMetrics: [
    {
      name: "Patient/User Volume",
      unit: "K",
      description: "Active patients or users on platform",
      direction: "higher_better",
      stages: {
        SEED: { p25: 5, median: 20, p75: 75, topDecile: 200 },
        SERIES_A: { p25: 50, median: 150, p75: 500, topDecile: 1500 },
        SERIES_B: { p25: 200, median: 750, p75: 2500, topDecile: 8000 },
      },
      thresholds: { exceptional: 500, good: 100, concerning: 10 },
      sectorContext: "Scale matters for data/outcomes validation. More patients = better clinical evidence.",
    },
    {
      name: "Clinical Outcomes Improvement",
      unit: "%",
      description: "Measurable improvement in clinical outcomes vs baseline",
      direction: "higher_better",
      stages: {
        SEED: { p25: 5, median: 15, p75: 30, topDecile: 50 },
        SERIES_A: { p25: 10, median: 20, p75: 35, topDecile: 55 },
        SERIES_B: { p25: 15, median: 25, p75: 40, topDecile: 60 },
      },
      thresholds: { exceptional: 30, good: 15, concerning: 5 },
      sectorContext: "Must be statistically significant. Required for value-based contracts and FDA claims.",
    },
    {
      name: "Gross Margin",
      unit: "%",
      description: "Revenue minus cost of goods sold",
      direction: "higher_better",
      stages: {
        SEED: { p25: 45, median: 60, p75: 72, topDecile: 82 },
        SERIES_A: { p25: 50, median: 65, p75: 75, topDecile: 85 },
        SERIES_B: { p25: 55, median: 68, p75: 78, topDecile: 88 },
      },
      thresholds: { exceptional: 75, good: 60, concerning: 40 },
      sectorContext: "Pure software: 75%+. With clinical staff: 40-60%. Device: 50-70%.",
    },
    {
      name: "Provider Adoption Rate",
      unit: "%",
      description: "% of targeted providers actively using product",
      direction: "higher_better",
      stages: {
        SEED: { p25: 5, median: 15, p75: 35, topDecile: 60 },
        SERIES_A: { p25: 15, median: 30, p75: 50, topDecile: 75 },
        SERIES_B: { p25: 25, median: 45, p75: 65, topDecile: 85 },
      },
      thresholds: { exceptional: 50, good: 25, concerning: 5 },
      sectorContext: "Slow adoption is normal in healthcare. 5%+ monthly growth is strong.",
    },
    {
      name: "Sales Cycle",
      unit: "months",
      description: "Average time from first contact to signed contract",
      direction: "lower_better",
      stages: {
        SEED: { p25: 12, median: 9, p75: 6, topDecile: 3 },
        SERIES_A: { p25: 10, median: 7, p75: 4, topDecile: 2 },
        SERIES_B: { p25: 9, median: 6, p75: 3, topDecile: 2 },
      },
      thresholds: { exceptional: 4, good: 8, concerning: 15 },
      sectorContext: "Health systems: 12-24 months. Clinics: 3-6 months. Direct-to-patient: 1-2 months.",
    },
  ],
  secondaryMetrics: [
    {
      name: "Patient Retention",
      unit: "%",
      description: "% of patients still active after 12 months",
      direction: "higher_better",
      stages: {
        SEED: { p25: 30, median: 50, p75: 70, topDecile: 85 },
        SERIES_A: { p25: 40, median: 60, p75: 75, topDecile: 88 },
        SERIES_B: { p25: 50, median: 68, p75: 82, topDecile: 92 },
      },
      thresholds: { exceptional: 75, good: 55, concerning: 30 },
      sectorContext: "Chronic conditions: should be 70%+. Acute: lower is OK. Engagement drives outcomes.",
    },
    {
      name: "Reimbursement Rate",
      unit: "%",
      description: "% of claims successfully reimbursed",
      direction: "higher_better",
      stages: {
        SEED: { p25: 60, median: 75, p75: 88, topDecile: 95 },
        SERIES_A: { p25: 70, median: 82, p75: 92, topDecile: 97 },
        SERIES_B: { p25: 78, median: 88, p75: 95, topDecile: 98 },
      },
      thresholds: { exceptional: 90, good: 80, concerning: 60 },
      sectorContext: "CPT codes secured = higher rates. No codes = out-of-pocket only = smaller TAM.",
    },
  ],
  exitMultiples: {
    low: 4,
    median: 10,
    high: 20,
    topDecile: 40,
    typicalAcquirers: ["UnitedHealth", "CVS Health", "Teladoc", "Amwell", "Hims & Hers", "Major Pharma", "Private Equity"],
    recentExits: [
      { company: "Livongo", acquirer: "Teladoc", multiple: 18, year: 2020 },
      { company: "MDLive", acquirer: "Cigna", multiple: 10, year: 2021 },
      { company: "Omada Health", acquirer: "IPO", multiple: 8, year: 2021 },
    ],
  },
  unitEconomicsFormulas: [
    { name: "Revenue per Patient", formula: "Total Revenue / Active Patients", benchmark: { good: 500, excellent: 1500 } },
    { name: "Cost per Outcome", formula: "Total Costs / Patients with Improved Outcomes", benchmark: { good: 1000, excellent: 500 } },
    { name: "Implementation ROI", formula: "(Savings Generated - Implementation Cost) / Implementation Cost", benchmark: { good: 2, excellent: 5 } },
  ],
  redFlagRules: [
    { metric: "Clinical Outcomes Improvement", condition: "below", threshold: 5, severity: "critical", reason: "No measurable outcomes = no value-based contracts" },
    { metric: "Sales Cycle", condition: "above", threshold: 18, severity: "major", reason: "Sales cycles > 18 months drain cash and limit growth" },
    { metric: "Reimbursement Rate", condition: "below", threshold: 50, severity: "major", reason: "Low reimbursement severely limits revenue potential" },
    { metric: "Patient Retention", condition: "below", threshold: 25, severity: "major", reason: "Poor retention indicates product-market fit issues" },
  ],
};

// ============================================================================
// DEEPTECH BENCHMARKS
// ============================================================================

export const DEEPTECH_BENCHMARKS: SectorBenchmarkData = {
  sector: "DeepTech",
  primaryMetrics: [
    {
      name: "R&D Efficiency",
      unit: "%",
      description: "Revenue generated per R&D dollar spent",
      direction: "higher_better",
      stages: {
        SEED: { p25: 0.1, median: 0.3, p75: 0.6, topDecile: 1.0 },
        SERIES_A: { p25: 0.3, median: 0.6, p75: 1.2, topDecile: 2.0 },
        SERIES_B: { p25: 0.5, median: 1.0, p75: 2.0, topDecile: 3.5 },
      },
      thresholds: { exceptional: 1.0, good: 0.5, concerning: 0.1 },
      sectorContext: "DeepTech is R&D heavy early. Efficiency should improve post-product-market fit.",
    },
    {
      name: "Time to Revenue",
      unit: "months",
      description: "Months from founding to first commercial revenue",
      direction: "lower_better",
      stages: {
        SEED: { p25: 36, median: 24, p75: 18, topDecile: 12 },
        SERIES_A: { p25: 24, median: 18, p75: 12, topDecile: 6 },
        SERIES_B: { p25: 18, median: 12, p75: 6, topDecile: 3 },
      },
      thresholds: { exceptional: 12, good: 24, concerning: 48 },
      sectorContext: "Longer timelines are normal for hard tech. > 4 years without revenue is risky.",
    },
    {
      name: "Patent Portfolio Value",
      unit: "$M",
      description: "Estimated value of IP portfolio",
      direction: "higher_better",
      stages: {
        SEED: { p25: 0.5, median: 2, p75: 5, topDecile: 15 },
        SERIES_A: { p25: 3, median: 10, p75: 30, topDecile: 80 },
        SERIES_B: { p25: 10, median: 40, p75: 100, topDecile: 300 },
      },
      thresholds: { exceptional: 30, good: 10, concerning: 1 },
      sectorContext: "IP is the moat in DeepTech. Must have defensible, broad patents.",
    },
    {
      name: "Technical Team Density",
      unit: "%",
      description: "% of team with PhD or equivalent technical depth",
      direction: "higher_better",
      stages: {
        SEED: { p25: 40, median: 60, p75: 80, topDecile: 95 },
        SERIES_A: { p25: 35, median: 50, p75: 70, topDecile: 85 },
        SERIES_B: { p25: 30, median: 45, p75: 60, topDecile: 75 },
      },
      thresholds: { exceptional: 70, good: 50, concerning: 25 },
      sectorContext: "DeepTech requires deep expertise. Strong technical team is essential early.",
    },
    {
      name: "Gross Margin at Scale",
      unit: "%",
      description: "Expected gross margin once at scale",
      direction: "higher_better",
      stages: {
        SEED: { p25: 40, median: 55, p75: 70, topDecile: 85 },
        SERIES_A: { p25: 45, median: 60, p75: 75, topDecile: 88 },
        SERIES_B: { p25: 50, median: 65, p75: 78, topDecile: 90 },
      },
      thresholds: { exceptional: 75, good: 55, concerning: 35 },
      sectorContext: "Pure software DeepTech: 75%+. Hardware-enabled: 40-60%. Manufacturing: 30-50%.",
    },
  ],
  secondaryMetrics: [
    {
      name: "Grant Funding",
      unit: "$M",
      description: "Non-dilutive grant funding secured",
      direction: "higher_better",
      stages: {
        SEED: { p25: 0.2, median: 0.8, p75: 2, topDecile: 5 },
        SERIES_A: { p25: 1, median: 3, p75: 8, topDecile: 20 },
        SERIES_B: { p25: 3, median: 8, p75: 20, topDecile: 50 },
      },
      thresholds: { exceptional: 5, good: 2, concerning: 0 },
      sectorContext: "Grants validate technology and extend runway. SBIR/STTR, NSF, DARPA, EU Horizon.",
    },
    {
      name: "Technology Readiness Level",
      unit: "TRL",
      description: "NASA TRL scale 1-9",
      direction: "higher_better",
      stages: {
        SEED: { p25: 3, median: 4, p75: 5, topDecile: 6 },
        SERIES_A: { p25: 5, median: 6, p75: 7, topDecile: 8 },
        SERIES_B: { p25: 6, median: 7, p75: 8, topDecile: 9 },
      },
      thresholds: { exceptional: 7, good: 5, concerning: 2 },
      sectorContext: "TRL 1-3: Research. TRL 4-6: Development. TRL 7-9: Commercial ready.",
    },
  ],
  exitMultiples: {
    low: 3,
    median: 8,
    high: 20,
    topDecile: 50,
    typicalAcquirers: ["Google", "Microsoft", "Apple", "NVIDIA", "Intel", "Qualcomm", "Major Defense", "Industrial Giants"],
    recentExits: [
      { company: "DeepMind", acquirer: "Google", multiple: 40, year: 2014 },
      { company: "Cruise", acquirer: "GM", multiple: 12, year: 2016 },
      { company: "Arm", acquirer: "NVIDIA (blocked)", multiple: 25, year: 2020 },
    ],
  },
  unitEconomicsFormulas: [
    { name: "R&D ROI", formula: "Future Revenue Value / Cumulative R&D Spend", benchmark: { good: 3, excellent: 10 } },
    { name: "IP Value/Employee", formula: "Patent Portfolio Value / Technical Employees", benchmark: { good: 500000, excellent: 2000000 } },
  ],
  redFlagRules: [
    { metric: "Time to Revenue", condition: "above", threshold: 60, severity: "critical", reason: "> 5 years to revenue = significant execution risk" },
    { metric: "Technical Team Density", condition: "below", threshold: 20, severity: "major", reason: "Insufficient technical depth for DeepTech" },
    { metric: "Technology Readiness Level", condition: "below", threshold: 3, severity: "major", reason: "TRL < 3 = still in basic research phase" },
  ],
};

// ============================================================================
// CLIMATE/CLEANTECH BENCHMARKS
// ============================================================================

export const CLIMATE_BENCHMARKS: SectorBenchmarkData = {
  sector: "Climate",
  primaryMetrics: [
    {
      name: "Carbon Reduction",
      unit: "tCO2e/year",
      description: "Tonnes of CO2 equivalent reduced annually",
      direction: "higher_better",
      stages: {
        SEED: { p25: 1000, median: 5000, p75: 20000, topDecile: 100000 },
        SERIES_A: { p25: 10000, median: 50000, p75: 200000, topDecile: 1000000 },
        SERIES_B: { p25: 100000, median: 500000, p75: 2000000, topDecile: 10000000 },
      },
      thresholds: { exceptional: 100000, good: 20000, concerning: 500 },
      sectorContext: "Impact is the north star. Must demonstrate measurable, verifiable reduction.",
    },
    {
      name: "Cost per Tonne Avoided",
      unit: "$/tCO2e",
      description: "Customer cost to avoid one tonne of CO2",
      direction: "lower_better",
      stages: {
        SEED: { p25: 150, median: 80, p75: 40, topDecile: 15 },
        SERIES_A: { p25: 100, median: 50, p75: 25, topDecile: 10 },
        SERIES_B: { p25: 70, median: 35, p75: 15, topDecile: 5 },
      },
      thresholds: { exceptional: 20, good: 50, concerning: 200 },
      sectorContext: "Must be competitive with carbon credits ($20-80/tonne) to drive adoption.",
    },
    {
      name: "Revenue Growth YoY",
      unit: "%",
      description: "Year-over-year revenue growth",
      direction: "higher_better",
      stages: {
        SEED: { p25: 80, median: 150, p75: 300, topDecile: 500 },
        SERIES_A: { p25: 60, median: 120, p75: 200, topDecile: 350 },
        SERIES_B: { p25: 40, median: 80, p75: 150, topDecile: 250 },
      },
      thresholds: { exceptional: 150, good: 80, concerning: 30 },
      sectorContext: "Climate urgency drives fast adoption for proven solutions.",
    },
    {
      name: "Gross Margin",
      unit: "%",
      description: "Revenue minus COGS",
      direction: "higher_better",
      stages: {
        SEED: { p25: 30, median: 45, p75: 60, topDecile: 75 },
        SERIES_A: { p25: 35, median: 50, p75: 65, topDecile: 78 },
        SERIES_B: { p25: 40, median: 55, p75: 68, topDecile: 82 },
      },
      thresholds: { exceptional: 65, good: 45, concerning: 25 },
      sectorContext: "Software climate: 70%+. Hardware/energy: 30-50%. Manufacturing: 20-40%.",
    },
    {
      name: "Policy Tailwind Score",
      unit: "1-10",
      description: "Strength of regulatory support (IRA, EU Green Deal, etc.)",
      direction: "higher_better",
      stages: {
        SEED: { p25: 4, median: 6, p75: 8, topDecile: 10 },
        SERIES_A: { p25: 5, median: 7, p75: 9, topDecile: 10 },
        SERIES_B: { p25: 6, median: 8, p75: 9, topDecile: 10 },
      },
      thresholds: { exceptional: 8, good: 6, concerning: 3 },
      sectorContext: "IRA, EU Green Deal, carbon taxes create demand. Policy risk = execution risk.",
    },
  ],
  secondaryMetrics: [
    {
      name: "Contract Pipeline",
      unit: "$M",
      description: "Value of signed LOIs and contracts",
      direction: "higher_better",
      stages: {
        SEED: { p25: 1, median: 5, p75: 15, topDecile: 50 },
        SERIES_A: { p25: 10, median: 30, p75: 80, topDecile: 200 },
        SERIES_B: { p25: 50, median: 150, p75: 400, topDecile: 1000 },
      },
      thresholds: { exceptional: 50, good: 15, concerning: 1 },
      sectorContext: "Long sales cycles in energy. Pipeline = leading indicator of revenue.",
    },
    {
      name: "Offtake Agreements",
      unit: "years",
      description: "Average duration of offtake/purchase agreements",
      direction: "higher_better",
      stages: {
        SEED: { p25: 1, median: 3, p75: 7, topDecile: 15 },
        SERIES_A: { p25: 3, median: 7, p75: 12, topDecile: 20 },
        SERIES_B: { p25: 5, median: 10, p75: 15, topDecile: 25 },
      },
      thresholds: { exceptional: 10, good: 5, concerning: 1 },
      sectorContext: "Long-term offtakes de-risk revenue and support project finance.",
    },
  ],
  exitMultiples: {
    low: 3,
    median: 6,
    high: 15,
    topDecile: 30,
    typicalAcquirers: ["Shell", "BP", "TotalEnergies", "Brookfield", "Engie", "Enel", "Industrial Giants", "Private Equity"],
    recentExits: [
      { company: "ChargePoint", acquirer: "SPAC/IPO", multiple: 8, year: 2021 },
      { company: "Sunrun", acquirer: "IPO", multiple: 10, year: 2015 },
      { company: "Proterra", acquirer: "SPAC", multiple: 6, year: 2021 },
    ],
  },
  unitEconomicsFormulas: [
    { name: "Revenue per tCO2e", formula: "Total Revenue / Carbon Reduced", benchmark: { good: 50, excellent: 150 } },
    { name: "Customer ROI", formula: "(Energy Savings + Carbon Credit Value) / Solution Cost", benchmark: { good: 2, excellent: 5 } },
  ],
  redFlagRules: [
    { metric: "Carbon Reduction", condition: "below", threshold: 100, severity: "critical", reason: "No measurable impact = greenwashing risk" },
    { metric: "Cost per Tonne Avoided", condition: "above", threshold: 300, severity: "major", reason: "Too expensive vs carbon credits" },
    { metric: "Policy Tailwind Score", condition: "below", threshold: 3, severity: "major", reason: "Dependent on policy that doesn't exist" },
  ],
};

// ============================================================================
// HARDWARE/IOT BENCHMARKS
// ============================================================================

export const HARDWARE_BENCHMARKS: SectorBenchmarkData = {
  sector: "Hardware",
  primaryMetrics: [
    {
      name: "Hardware Gross Margin",
      unit: "%",
      description: "Margin on hardware sales",
      direction: "higher_better",
      stages: {
        SEED: { p25: 25, median: 35, p75: 48, topDecile: 60 },
        SERIES_A: { p25: 30, median: 40, p75: 52, topDecile: 65 },
        SERIES_B: { p25: 35, median: 45, p75: 55, topDecile: 68 },
      },
      thresholds: { exceptional: 50, good: 35, concerning: 20 },
      sectorContext: "Consumer hardware: 30-40%. Enterprise: 40-60%. Apple-tier: 60%+.",
    },
    {
      name: "Attach Rate",
      unit: "%",
      description: "% of hardware customers with recurring revenue (software/services)",
      direction: "higher_better",
      stages: {
        SEED: { p25: 15, median: 35, p75: 55, topDecile: 80 },
        SERIES_A: { p25: 25, median: 45, p75: 65, topDecile: 85 },
        SERIES_B: { p25: 35, median: 55, p75: 75, topDecile: 90 },
      },
      thresholds: { exceptional: 60, good: 40, concerning: 15 },
      sectorContext: "Hardware + software = better unit economics. Pure hardware is a tough business.",
    },
    {
      name: "Blended Gross Margin",
      unit: "%",
      description: "Combined hardware + software/services margin",
      direction: "higher_better",
      stages: {
        SEED: { p25: 35, median: 48, p75: 60, topDecile: 72 },
        SERIES_A: { p25: 40, median: 52, p75: 65, topDecile: 75 },
        SERIES_B: { p25: 45, median: 55, p75: 68, topDecile: 78 },
      },
      thresholds: { exceptional: 60, good: 48, concerning: 30 },
      sectorContext: "Best hardware companies have 50%+ blended margin from software attach.",
    },
    {
      name: "Time to Production",
      unit: "months",
      description: "Time from prototype to mass production",
      direction: "lower_better",
      stages: {
        SEED: { p25: 24, median: 18, p75: 12, topDecile: 6 },
        SERIES_A: { p25: 18, median: 12, p75: 8, topDecile: 4 },
        SERIES_B: { p25: 12, median: 9, p75: 6, topDecile: 3 },
      },
      thresholds: { exceptional: 9, good: 15, concerning: 30 },
      sectorContext: "Hardware timelines are long. Delays kill companies. Buffer 50% for reality.",
    },
    {
      name: "Unit Economics at Scale",
      unit: "x",
      description: "Revenue per unit / COGS per unit at 10K+ units",
      direction: "higher_better",
      stages: {
        SEED: { p25: 1.3, median: 1.6, p75: 2.0, topDecile: 2.8 },
        SERIES_A: { p25: 1.5, median: 1.8, p75: 2.3, topDecile: 3.2 },
        SERIES_B: { p25: 1.6, median: 2.0, p75: 2.6, topDecile: 3.5 },
      },
      thresholds: { exceptional: 2.5, good: 1.8, concerning: 1.2 },
      sectorContext: "Must model unit economics at scale. Early production is always expensive.",
    },
  ],
  secondaryMetrics: [
    {
      name: "Return Rate",
      unit: "%",
      description: "% of units returned within 30 days",
      direction: "lower_better",
      stages: {
        SEED: { p25: 12, median: 8, p75: 4, topDecile: 1.5 },
        SERIES_A: { p25: 8, median: 5, p75: 2.5, topDecile: 1 },
        SERIES_B: { p25: 6, median: 4, p75: 2, topDecile: 0.8 },
      },
      thresholds: { exceptional: 2, good: 5, concerning: 12 },
      sectorContext: "High returns = quality issues or wrong product-market fit.",
    },
    {
      name: "BOM Cost Reduction",
      unit: "%/year",
      description: "Annual bill of materials cost reduction",
      direction: "higher_better",
      stages: {
        SEED: { p25: 5, median: 12, p75: 22, topDecile: 35 },
        SERIES_A: { p25: 8, median: 15, p75: 25, topDecile: 40 },
        SERIES_B: { p25: 10, median: 18, p75: 28, topDecile: 45 },
      },
      thresholds: { exceptional: 25, good: 15, concerning: 3 },
      sectorContext: "Scale should drive 10-20% annual BOM reduction. Model this in forecasts.",
    },
  ],
  exitMultiples: {
    low: 2,
    median: 4,
    high: 10,
    topDecile: 20,
    typicalAcquirers: ["Apple", "Google", "Amazon", "Samsung", "Sony", "Industrial Giants", "Private Equity"],
    recentExits: [
      { company: "Nest", acquirer: "Google", multiple: 15, year: 2014 },
      { company: "Ring", acquirer: "Amazon", multiple: 10, year: 2018 },
      { company: "Beats", acquirer: "Apple", multiple: 8, year: 2014 },
    ],
  },
  unitEconomicsFormulas: [
    { name: "LTV:Hardware", formula: "(Hardware Margin + Lifetime Software Revenue) / CAC", benchmark: { good: 3, excellent: 5 } },
    { name: "Payback (units)", formula: "Fixed Costs / (Revenue per Unit - Variable Cost per Unit)", benchmark: { good: 5000, excellent: 2000 } },
  ],
  redFlagRules: [
    { metric: "Hardware Gross Margin", condition: "below", threshold: 15, severity: "critical", reason: "Margin < 15% leaves no room for error" },
    { metric: "Attach Rate", condition: "below", threshold: 10, severity: "major", reason: "No software attach = commodity hardware trap" },
    { metric: "Time to Production", condition: "above", threshold: 36, severity: "critical", reason: "> 3 years to production = extreme execution risk" },
    { metric: "Return Rate", condition: "above", threshold: 15, severity: "major", reason: "High returns indicate quality or fit issues" },
  ],
};

// ============================================================================
// GAMING BENCHMARKS
// ============================================================================

export const GAMING_BENCHMARKS: SectorBenchmarkData = {
  sector: "Gaming",
  primaryMetrics: [
    {
      name: "DAU/MAU Ratio",
      unit: "%",
      description: "Daily active users / Monthly active users",
      direction: "higher_better",
      stages: {
        SEED: { p25: 15, median: 25, p75: 40, topDecile: 55 },
        SERIES_A: { p25: 20, median: 30, p75: 45, topDecile: 60 },
        SERIES_B: { p25: 25, median: 35, p75: 50, topDecile: 65 },
      },
      thresholds: { exceptional: 40, good: 25, concerning: 10 },
      sectorContext: "Measures stickiness. Casual: 15-25%. Midcore: 25-40%. Hardcore: 40%+.",
    },
    {
      name: "Day 1 Retention",
      unit: "%",
      description: "% of users returning day after install",
      direction: "higher_better",
      stages: {
        SEED: { p25: 30, median: 40, p75: 50, topDecile: 65 },
        SERIES_A: { p25: 35, median: 45, p75: 55, topDecile: 70 },
        SERIES_B: { p25: 38, median: 48, p75: 58, topDecile: 72 },
      },
      thresholds: { exceptional: 50, good: 40, concerning: 25 },
      sectorContext: "D1 is the first filter. < 30% usually means core loop issues.",
    },
    {
      name: "Day 30 Retention",
      unit: "%",
      description: "% of users returning 30 days after install",
      direction: "higher_better",
      stages: {
        SEED: { p25: 5, median: 10, p75: 18, topDecile: 28 },
        SERIES_A: { p25: 8, median: 14, p75: 22, topDecile: 32 },
        SERIES_B: { p25: 10, median: 16, p75: 25, topDecile: 35 },
      },
      thresholds: { exceptional: 20, good: 12, concerning: 4 },
      sectorContext: "D30 predicts long-term LTV. Casual: 5-10%. Strategy: 15-25%.",
    },
    {
      name: "ARPDAU",
      unit: "$",
      description: "Average revenue per daily active user",
      direction: "higher_better",
      stages: {
        SEED: { p25: 0.03, median: 0.08, p75: 0.18, topDecile: 0.40 },
        SERIES_A: { p25: 0.05, median: 0.12, p75: 0.25, topDecile: 0.55 },
        SERIES_B: { p25: 0.08, median: 0.18, p75: 0.35, topDecile: 0.70 },
      },
      thresholds: { exceptional: 0.25, good: 0.10, concerning: 0.02 },
      sectorContext: "Hypercasual: $0.02-0.05. Casual: $0.05-0.15. Midcore: $0.15-0.50.",
    },
    {
      name: "LTV/CPI Ratio",
      unit: "x",
      description: "Lifetime value / Cost per install",
      direction: "higher_better",
      stages: {
        SEED: { p25: 0.8, median: 1.2, p75: 1.8, topDecile: 2.5 },
        SERIES_A: { p25: 1.0, median: 1.5, p75: 2.2, topDecile: 3.2 },
        SERIES_B: { p25: 1.2, median: 1.8, p75: 2.6, topDecile: 3.8 },
      },
      thresholds: { exceptional: 2.0, good: 1.3, concerning: 0.8 },
      sectorContext: "LTV/CPI > 1.3 for profitable UA. < 1.0 means burning cash on every install.",
    },
  ],
  secondaryMetrics: [
    {
      name: "Paying User Rate",
      unit: "%",
      description: "% of active users who make purchases",
      direction: "higher_better",
      stages: {
        SEED: { p25: 1.5, median: 3, p75: 5, topDecile: 10 },
        SERIES_A: { p25: 2, median: 4, p75: 7, topDecile: 12 },
        SERIES_B: { p25: 2.5, median: 5, p75: 8, topDecile: 15 },
      },
      thresholds: { exceptional: 6, good: 3, concerning: 1 },
      sectorContext: "F2P average: 2-5%. Whale-dependent models can work with 1% at high ARPPU.",
    },
    {
      name: "ARPPU",
      unit: "$",
      description: "Average revenue per paying user (monthly)",
      direction: "higher_better",
      stages: {
        SEED: { p25: 8, median: 18, p75: 40, topDecile: 80 },
        SERIES_A: { p25: 12, median: 25, p75: 55, topDecile: 110 },
        SERIES_B: { p25: 15, median: 32, p75: 70, topDecile: 140 },
      },
      thresholds: { exceptional: 50, good: 25, concerning: 8 },
      sectorContext: "Casual: $10-25. Midcore: $25-60. Strategy/RPG: $50-150.",
    },
  ],
  exitMultiples: {
    low: 2,
    median: 5,
    high: 12,
    topDecile: 25,
    typicalAcquirers: ["Microsoft", "Sony", "Tencent", "NetEase", "EA", "Take-Two", "Embracer Group", "Private Equity"],
    recentExits: [
      { company: "Activision Blizzard", acquirer: "Microsoft", multiple: 8, year: 2022 },
      { company: "Zynga", acquirer: "Take-Two", multiple: 6, year: 2022 },
      { company: "Supercell", acquirer: "Tencent", multiple: 10, year: 2016 },
    ],
  },
  unitEconomicsFormulas: [
    { name: "LTV", formula: "ARPDAU × Average Lifetime Days", benchmark: { good: 3, excellent: 8 } },
    { name: "Contribution Margin", formula: "(LTV - CPI) / LTV", benchmark: { good: 0.25, excellent: 0.5 } },
    { name: "Payback Days", formula: "CPI / ARPDAU", benchmark: { good: 90, excellent: 30 } },
  ],
  redFlagRules: [
    { metric: "Day 1 Retention", condition: "below", threshold: 25, severity: "critical", reason: "D1 < 25% = broken core loop" },
    { metric: "LTV/CPI Ratio", condition: "below", threshold: 0.7, severity: "critical", reason: "LTV/CPI < 0.7 = unprofitable at scale" },
    { metric: "DAU/MAU Ratio", condition: "below", threshold: 8, severity: "major", reason: "Very low engagement = likely churn spiral" },
    { metric: "Paying User Rate", condition: "below", threshold: 0.5, severity: "major", reason: "Conversion < 0.5% = monetization issues" },
  ],
};

// ============================================================================
// CONSUMER/D2C BENCHMARKS
// ============================================================================

export const CONSUMER_BENCHMARKS: SectorBenchmarkData = {
  sector: "Consumer",
  primaryMetrics: [
    {
      name: "Revenue Growth YoY",
      unit: "%",
      description: "Year-over-year revenue growth",
      direction: "higher_better",
      stages: {
        SEED: { p25: 100, median: 200, p75: 400, topDecile: 700 },
        SERIES_A: { p25: 80, median: 150, p75: 250, topDecile: 450 },
        SERIES_B: { p25: 50, median: 100, p75: 180, topDecile: 300 },
      },
      thresholds: { exceptional: 200, good: 100, concerning: 40 },
      sectorContext: "Consumer brands can grow explosively with viral moments. Consistency matters more than peaks.",
    },
    {
      name: "Contribution Margin",
      unit: "%",
      description: "Revenue - COGS - Variable costs / Revenue",
      direction: "higher_better",
      stages: {
        SEED: { p25: 25, median: 40, p75: 55, topDecile: 70 },
        SERIES_A: { p25: 30, median: 45, p75: 60, topDecile: 72 },
        SERIES_B: { p25: 35, median: 50, p75: 62, topDecile: 75 },
      },
      thresholds: { exceptional: 55, good: 40, concerning: 20 },
      sectorContext: "Must cover CAC within first order for DTC. Negative contribution = burning cash.",
    },
    {
      name: "CAC",
      unit: "$",
      description: "Customer acquisition cost (blended)",
      direction: "lower_better",
      stages: {
        SEED: { p25: 60, median: 35, p75: 18, topDecile: 8 },
        SERIES_A: { p25: 50, median: 30, p75: 15, topDecile: 6 },
        SERIES_B: { p25: 45, median: 28, p75: 14, topDecile: 5 },
      },
      thresholds: { exceptional: 15, good: 35, concerning: 80 },
      sectorContext: "iOS14 killed cheap acquisition. Organic/viral essential. Paid CAC > $50 is challenging.",
    },
    {
      name: "LTV/CAC Ratio",
      unit: "x",
      description: "Customer lifetime value / acquisition cost",
      direction: "higher_better",
      stages: {
        SEED: { p25: 1.5, median: 2.5, p75: 4.0, topDecile: 6.0 },
        SERIES_A: { p25: 2.0, median: 3.0, p75: 4.5, topDecile: 7.0 },
        SERIES_B: { p25: 2.5, median: 3.5, p75: 5.0, topDecile: 8.0 },
      },
      thresholds: { exceptional: 4, good: 2.5, concerning: 1.5 },
      sectorContext: "Consumer LTV/CAC must be > 2.5x to scale profitably. 3x+ is sustainable.",
    },
    {
      name: "Repeat Purchase Rate",
      unit: "%",
      description: "% of customers who make 2+ purchases within 12 months",
      direction: "higher_better",
      stages: {
        SEED: { p25: 15, median: 28, p75: 42, topDecile: 60 },
        SERIES_A: { p25: 22, median: 35, p75: 50, topDecile: 68 },
        SERIES_B: { p25: 28, median: 42, p75: 58, topDecile: 75 },
      },
      thresholds: { exceptional: 45, good: 30, concerning: 12 },
      sectorContext: "Repeat buyers are 9x more valuable. < 20% = leaky bucket problem.",
    },
  ],
  secondaryMetrics: [
    {
      name: "Net Promoter Score",
      unit: "NPS",
      description: "Customer satisfaction and referral likelihood",
      direction: "higher_better",
      stages: {
        SEED: { p25: 20, median: 40, p75: 60, topDecile: 80 },
        SERIES_A: { p25: 30, median: 50, p75: 70, topDecile: 85 },
        SERIES_B: { p25: 35, median: 55, p75: 72, topDecile: 88 },
      },
      thresholds: { exceptional: 60, good: 40, concerning: 10 },
      sectorContext: "NPS > 50 = strong word-of-mouth potential. < 20 = product issues.",
    },
    {
      name: "Organic Traffic %",
      unit: "%",
      description: "% of traffic from organic (non-paid) sources",
      direction: "higher_better",
      stages: {
        SEED: { p25: 20, median: 35, p75: 55, topDecile: 75 },
        SERIES_A: { p25: 30, median: 45, p75: 62, topDecile: 80 },
        SERIES_B: { p25: 38, median: 52, p75: 68, topDecile: 85 },
      },
      thresholds: { exceptional: 60, good: 40, concerning: 15 },
      sectorContext: "High organic = brand strength. Over-reliance on paid = fragile growth.",
    },
    {
      name: "Average Order Value",
      unit: "$",
      description: "Average value per order",
      direction: "higher_better",
      stages: {
        SEED: { p25: 35, median: 65, p75: 120, topDecile: 200 },
        SERIES_A: { p25: 45, median: 80, p75: 140, topDecile: 250 },
        SERIES_B: { p25: 55, median: 95, p75: 160, topDecile: 300 },
      },
      thresholds: { exceptional: 120, good: 70, concerning: 25 },
      sectorContext: "Higher AOV = easier economics. Bundle strategies can boost AOV 30-50%.",
    },
  ],
  exitMultiples: {
    low: 1,
    median: 3,
    high: 8,
    topDecile: 15,
    typicalAcquirers: ["P&G", "Unilever", "L'Oréal", "Nestlé", "Amazon", "Walmart", "Private Equity"],
    recentExits: [
      { company: "Dollar Shave Club", acquirer: "Unilever", multiple: 5, year: 2016 },
      { company: "Native", acquirer: "P&G", multiple: 4, year: 2017 },
      { company: "RXBAR", acquirer: "Kellogg", multiple: 3, year: 2017 },
    ],
  },
  unitEconomicsFormulas: [
    { name: "Payback Period", formula: "CAC / (AOV × Contribution Margin × Orders/Year)", benchmark: { good: 12, excellent: 6 } },
    { name: "First Order Profit", formula: "AOV × Contribution Margin - CAC", benchmark: { good: 0, excellent: 15 } },
    { name: "Cohort LTV", formula: "Sum of (Contribution Margin × Orders) over customer lifetime", benchmark: { good: 100, excellent: 250 } },
  ],
  redFlagRules: [
    { metric: "LTV/CAC Ratio", condition: "below", threshold: 1.2, severity: "critical", reason: "LTV/CAC < 1.2 = losing money on each customer" },
    { metric: "Repeat Purchase Rate", condition: "below", threshold: 10, severity: "critical", reason: "No repeat = no sustainable business" },
    { metric: "Contribution Margin", condition: "below", threshold: 15, severity: "major", reason: "Contribution < 15% = no path to profitability" },
    { metric: "CAC", condition: "above", threshold: 100, severity: "major", reason: "CAC > $100 is rarely sustainable for consumer" },
  ],
};

// ============================================================================
// EXPORT ALL SECTOR BENCHMARKS
// ============================================================================

export const SECTOR_BENCHMARK_DATA: Record<string, SectorBenchmarkData> = {
  "SaaS": SAAS_BENCHMARKS,
  "SaaS B2B": SAAS_BENCHMARKS,
  "Fintech": FINTECH_BENCHMARKS,
  "Marketplace": MARKETPLACE_BENCHMARKS,
  "HealthTech": HEALTHTECH_BENCHMARKS,
  "DeepTech": DEEPTECH_BENCHMARKS,
  "Climate": CLIMATE_BENCHMARKS,
  "CleanTech": CLIMATE_BENCHMARKS,
  "Hardware": HARDWARE_BENCHMARKS,
  "IoT": HARDWARE_BENCHMARKS,
  "Gaming": GAMING_BENCHMARKS,
  "Consumer": CONSUMER_BENCHMARKS,
  "D2C": CONSUMER_BENCHMARKS,
  "E-commerce": CONSUMER_BENCHMARKS,
};

// Helper to get benchmarks for a sector
export function getSectorBenchmarks(sector: string): SectorBenchmarkData | null {
  const normalized = sector.toLowerCase().trim();

  // Try exact match first
  for (const [key, data] of Object.entries(SECTOR_BENCHMARK_DATA)) {
    if (key.toLowerCase() === normalized) {
      return data;
    }
  }

  // Try partial match
  for (const [key, data] of Object.entries(SECTOR_BENCHMARK_DATA)) {
    if (normalized.includes(key.toLowerCase()) || key.toLowerCase().includes(normalized)) {
      return data;
    }
  }

  return null;
}
