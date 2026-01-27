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
  // SOURCE OBLIGATOIRE - d'où vient cette donnée
  source: string;
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
    benchmark: { good: number | string; excellent: number | string };
    source?: string;
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

/**
 * SAAS B2B BENCHMARKS
 *
 * Sources principales:
 * - OpenView 2024 SaaS Benchmarks Report (n=900+ companies)
 * - Bessemer Cloud Index (public SaaS companies)
 * - KeyBanc 2024 SaaS Survey (n=150 private companies)
 * - SaaS Capital analysis
 */
export const SAAS_BENCHMARKS: SectorBenchmarkData = {
  sector: "SaaS B2B",
  primaryMetrics: [
    {
      name: "Net Revenue Retention",
      unit: "%",
      description: "Revenue from existing customers after churn and expansion",
      direction: "higher_better",
      stages: {
        SEED: { p25: 95, median: 105, p75: 115, topDecile: 130 },
        SERIES_A: { p25: 100, median: 110, p75: 120, topDecile: 140 },
        SERIES_B: { p25: 105, median: 115, p75: 130, topDecile: 150 },
      },
      thresholds: { exceptional: 130, good: 110, concerning: 95 },
      sectorContext: "NRR > 100% means you can grow without acquiring new customers. Best-in-class SaaS companies have NRR > 120%.",
      source: "OpenView 2024 SaaS Benchmarks Report - median NRR 110% across 900+ companies",
    },
    {
      name: "ARR Growth YoY",
      unit: "%",
      description: "Year-over-year annual recurring revenue growth",
      direction: "higher_better",
      stages: {
        PRE_SEED: { p25: 150, median: 250, p75: 400, topDecile: 600 },
        SEED: { p25: 80, median: 100, p75: 150, topDecile: 250 },
        SERIES_A: { p25: 50, median: 80, p75: 120, topDecile: 180 },
        SERIES_B: { p25: 40, median: 60, p75: 90, topDecile: 130 },
      },
      thresholds: { exceptional: 150, good: 80, concerning: 40 },
      sectorContext: "T2D3 (triple twice, double thrice) is aspirational. Median growth declines with scale.",
      source: "KeyBanc 2024 SaaS Survey - growth rates by ARR scale, n=150 companies",
    },
    {
      name: "Gross Margin",
      unit: "%",
      description: "Revenue minus cost of goods sold",
      direction: "higher_better",
      stages: {
        SEED: { p25: 65, median: 72, p75: 78, topDecile: 85 },
        SERIES_A: { p25: 68, median: 75, p75: 82, topDecile: 88 },
        SERIES_B: { p25: 70, median: 78, p75: 85, topDecile: 90 },
      },
      thresholds: { exceptional: 80, good: 72, concerning: 60 },
      sectorContext: "True SaaS should have 70%+ gross margin. < 65% often indicates services dependency.",
      source: "OpenView 2024 SaaS Benchmarks - median gross margin 75% for software-only",
    },
    {
      name: "CAC Payback",
      unit: "months",
      description: "Months to recover customer acquisition cost",
      direction: "lower_better",
      stages: {
        SEED: { p25: 24, median: 18, p75: 12, topDecile: 6 },
        SERIES_A: { p25: 20, median: 15, p75: 10, topDecile: 5 },
        SERIES_B: { p25: 18, median: 12, p75: 8, topDecile: 4 },
      },
      thresholds: { exceptional: 12, good: 18, concerning: 30 },
      sectorContext: "< 18 months is healthy. > 24 months requires strong NRR to compensate.",
      source: "OpenView 2024 - median CAC payback 18 months, top quartile < 12 months",
    },
    {
      name: "LTV/CAC Ratio",
      unit: "x",
      description: "Customer lifetime value divided by acquisition cost",
      direction: "higher_better",
      stages: {
        SEED: { p25: 2.0, median: 3.0, p75: 4.5, topDecile: 6.0 },
        SERIES_A: { p25: 2.5, median: 3.5, p75: 5.0, topDecile: 7.0 },
        SERIES_B: { p25: 3.0, median: 4.0, p75: 6.0, topDecile: 8.0 },
      },
      thresholds: { exceptional: 5, good: 3, concerning: 2 },
      sectorContext: "3x is the minimum for sustainable unit economics. < 2x means losing money on growth.",
      source: "Industry standard benchmark. Validated by OpenView, Bessemer, and SaaS Capital analyses",
    },
  ],
  secondaryMetrics: [
    {
      name: "Rule of 40",
      unit: "%",
      description: "Growth rate + profit margin",
      direction: "higher_better",
      stages: {
        SEED: { p25: 10, median: 25, p75: 45, topDecile: 65 },
        SERIES_A: { p25: 15, median: 35, p75: 55, topDecile: 75 },
        SERIES_B: { p25: 25, median: 40, p75: 60, topDecile: 80 },
      },
      thresholds: { exceptional: 55, good: 40, concerning: 20 },
      sectorContext: "Growth + Margin >= 40%. High growth can compensate for negative margins early.",
      source: "Bessemer Cloud Index - Rule of 40 analysis on public SaaS companies",
    },
    {
      name: "Magic Number",
      unit: "x",
      description: "Net new ARR / S&M spend (previous quarter)",
      direction: "higher_better",
      stages: {
        SEED: { p25: 0.4, median: 0.6, p75: 0.9, topDecile: 1.3 },
        SERIES_A: { p25: 0.5, median: 0.75, p75: 1.0, topDecile: 1.5 },
        SERIES_B: { p25: 0.6, median: 0.85, p75: 1.2, topDecile: 1.8 },
      },
      thresholds: { exceptional: 1.0, good: 0.75, concerning: 0.5 },
      sectorContext: "> 1.0 means efficient S&M spend. < 0.5 indicates GTM inefficiency.",
      source: "Scale Venture Partners analysis - Magic Number benchmarks by stage",
    },
    {
      name: "Burn Multiple",
      unit: "x",
      description: "Net burn / Net new ARR",
      direction: "lower_better",
      stages: {
        PRE_SEED: { p25: 4.0, median: 2.5, p75: 1.5, topDecile: 1.0 },
        SEED: { p25: 3.0, median: 2.0, p75: 1.3, topDecile: 0.8 },
        SERIES_A: { p25: 2.5, median: 1.8, p75: 1.2, topDecile: 0.7 },
        SERIES_B: { p25: 2.0, median: 1.5, p75: 1.0, topDecile: 0.5 },
      },
      thresholds: { exceptional: 1.0, good: 1.8, concerning: 3.0 },
      sectorContext: "How much cash burned per $ of new ARR. < 2x is efficient, > 3x is concerning.",
      source: "David Sacks (Craft Ventures) Burn Multiple framework - industry adopted standard",
    },
    {
      name: "Quick Ratio",
      unit: "x",
      description: "(New MRR + Expansion) / (Churn + Contraction)",
      direction: "higher_better",
      stages: {
        SEED: { p25: 2.0, median: 3.0, p75: 4.0, topDecile: 5.5 },
        SERIES_A: { p25: 2.5, median: 3.5, p75: 4.5, topDecile: 6.0 },
        SERIES_B: { p25: 3.0, median: 4.0, p75: 5.0, topDecile: 7.0 },
      },
      thresholds: { exceptional: 4, good: 3, concerning: 2 },
      sectorContext: "Measures growth efficiency. 4x is healthy, < 2x means churn is eating growth.",
      source: "Mamoon Hamid (Social Capital) Quick Ratio framework - SaaS industry standard",
    },
    {
      name: "Logo Churn Rate",
      unit: "%",
      description: "Annual customer logo churn",
      direction: "lower_better",
      stages: {
        SEED: { p25: 20, median: 15, p75: 10, topDecile: 5 },
        SERIES_A: { p25: 15, median: 10, p75: 7, topDecile: 3 },
        SERIES_B: { p25: 12, median: 8, p75: 5, topDecile: 2 },
      },
      thresholds: { exceptional: 5, good: 10, concerning: 20 },
      sectorContext: "SMB: 15-20% acceptable. Enterprise: should be < 8%.",
      source: "KeyBanc 2024 SaaS Survey - churn by customer segment",
    },
  ],
  exitMultiples: {
    low: 4,
    median: 8,
    high: 15,
    topDecile: 25,
    typicalAcquirers: ["Salesforce", "Microsoft", "SAP", "Oracle", "Adobe", "ServiceNow", "Private Equity"],
    recentExits: [
      // Note: Figma deal (2022) was CANCELLED in Dec 2023 - removed
      { company: "Slack", acquirer: "Salesforce", multiple: 26, year: 2021 }, // $27.7B / ~$1B ARR - public deal
      { company: "Mailchimp", acquirer: "Intuit", multiple: 14, year: 2021 }, // $12B / ~$800M revenue - public
      { company: "Qualtrics", acquirer: "SAP (then spun out)", multiple: 12, year: 2019 }, // $8B deal
    ],
  },
  unitEconomicsFormulas: [
    { name: "LTV", formula: "ARPA × Gross Margin × (1 / Churn Rate)", benchmark: { good: 3, excellent: 5 } },
    { name: "CAC Ratio", formula: "(S&M Spend) / (New Customers)", benchmark: { good: 0.33, excellent: 0.2 } },
    { name: "Expansion Revenue %", formula: "Expansion MRR / Beginning MRR", benchmark: { good: 0.03, excellent: 0.05 } },
  ],
  redFlagRules: [
    { metric: "Net Revenue Retention", condition: "below", threshold: 90, severity: "critical", reason: "NRR < 90% indicates fundamental product-market fit issues" },
    { metric: "CAC Payback", condition: "above", threshold: 30, severity: "critical", reason: "CAC payback > 30 months is unsustainable without exceptional NRR" },
    { metric: "Gross Margin", condition: "below", threshold: 60, severity: "major", reason: "Gross margin < 60% suggests heavy services dependency" },
    { metric: "Burn Multiple", condition: "above", threshold: 3.0, severity: "major", reason: "Burn multiple > 3x means inefficient capital deployment" },
    { metric: "Logo Churn Rate", condition: "above", threshold: 25, severity: "major", reason: "Logo churn > 25% indicates serious retention problems" },
  ],
};

// ============================================================================
// FINTECH BENCHMARKS
// Sources:
// - McKinsey Global Payments Report 2024
// - FIS Global Payments Report 2024
// - Nilson Report (card fraud statistics)
// - Federal Reserve Economic Data (bank NIM data)
// - a]6z Fintech benchmarks (proprietary but widely cited)
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
        SEED: { p25: 5, median: 25, p75: 100, topDecile: 300 },
        SERIES_A: { p25: 50, median: 250, p75: 800, topDecile: 2500 },
        SERIES_B: { p25: 300, median: 1000, p75: 4000, topDecile: 15000 },
      },
      thresholds: { exceptional: 500, good: 100, concerning: 10 },
      sectorContext: "TPV is the north star for payments companies. Revenue = TPV × Take Rate.",
      source: "a16z Fintech benchmarks - TPV by stage analysis",
    },
    {
      name: "Take Rate",
      unit: "%",
      description: "Net revenue as percentage of transaction volume",
      direction: "higher_better",
      targetRange: { min: 0.5, max: 5 },
      stages: {
        SEED: { p25: 0.8, median: 1.5, p75: 2.5, topDecile: 4.0 },
        SERIES_A: { p25: 1.0, median: 1.8, p75: 3.0, topDecile: 4.5 },
        SERIES_B: { p25: 1.2, median: 2.0, p75: 3.2, topDecile: 5.0 },
      },
      thresholds: { exceptional: 3, good: 1.5, concerning: 0.3 },
      sectorContext: "Card networks: 0.1-0.3%. PSPs: 0.5-2%. PayFacs: 1-3%. Embedded: 2-5%.",
      source: "McKinsey Global Payments Report 2024 - take rates by segment",
    },
    {
      name: "Net Interest Margin",
      unit: "%",
      description: "Interest income minus interest expense / assets (lending)",
      direction: "higher_better",
      stages: {
        SEED: { p25: 4, median: 6, p75: 9, topDecile: 13 },
        SERIES_A: { p25: 5, median: 7, p75: 10, topDecile: 14 },
        SERIES_B: { p25: 5, median: 8, p75: 11, topDecile: 15 },
      },
      thresholds: { exceptional: 10, good: 6, concerning: 3 },
      sectorContext: "Traditional banks: 2.5-3.5% (FRED data). Fintech lenders: 6-12%. Higher NIM = higher risk profile.",
      source: "Federal Reserve FRED - bank NIM averages; Fintech lender data from S&P Global",
    },
    {
      name: "Default Rate",
      unit: "%",
      description: "Percentage of loans in default (30+ days)",
      direction: "lower_better",
      stages: {
        SEED: { p25: 8, median: 5, p75: 3, topDecile: 1.5 },
        SERIES_A: { p25: 6, median: 4, p75: 2.5, topDecile: 1.2 },
        SERIES_B: { p25: 5, median: 3.5, p75: 2, topDecile: 1 },
      },
      thresholds: { exceptional: 2, good: 4, concerning: 8 },
      sectorContext: "Prime: < 2%. Near-prime: 3-6%. Subprime: 8-15%. Must compare to portfolio risk profile.",
      source: "Federal Reserve - Consumer Credit Delinquency Rates; S&P Global fintech lending data",
    },
    {
      name: "Fraud Rate",
      unit: "%",
      description: "Fraudulent transactions as % of volume",
      direction: "lower_better",
      stages: {
        SEED: { p25: 0.4, median: 0.2, p75: 0.1, topDecile: 0.05 },
        SERIES_A: { p25: 0.25, median: 0.12, p75: 0.06, topDecile: 0.03 },
        SERIES_B: { p25: 0.15, median: 0.08, p75: 0.04, topDecile: 0.02 },
      },
      thresholds: { exceptional: 0.05, good: 0.1, concerning: 0.3 },
      sectorContext: "Industry average CNP fraud: 0.1-0.15% (Nilson Report 2024). > 0.3% indicates weak controls.",
      source: "Nilson Report 2024 - Global Card Fraud Losses; Visa/Mastercard public data",
    },
  ],
  secondaryMetrics: [
    {
      name: "Cost per Transaction",
      unit: "$",
      description: "Fully loaded cost to process one transaction",
      direction: "lower_better",
      stages: {
        SEED: { p25: 0.40, median: 0.20, p75: 0.10, topDecile: 0.05 },
        SERIES_A: { p25: 0.25, median: 0.12, p75: 0.06, topDecile: 0.03 },
        SERIES_B: { p25: 0.15, median: 0.08, p75: 0.04, topDecile: 0.02 },
      },
      thresholds: { exceptional: 0.05, good: 0.12, concerning: 0.40 },
      sectorContext: "Must be significantly lower than revenue per transaction for positive economics.",
      source: "FIS Global Payments Report 2024 - processing cost benchmarks",
    },
    {
      name: "Customer Acquisition Cost",
      unit: "$",
      description: "Cost to acquire one customer",
      direction: "lower_better",
      stages: {
        SEED: { p25: 80, median: 45, p75: 25, topDecile: 12 },
        SERIES_A: { p25: 65, median: 35, p75: 20, topDecile: 10 },
        SERIES_B: { p25: 50, median: 28, p75: 15, topDecile: 8 },
      },
      thresholds: { exceptional: 20, good: 45, concerning: 120 },
      sectorContext: "B2C fintech CAC: $30-80 typical. B2B can be higher if ACV justifies it.",
      source: "Fintech industry estimates - composite from public company filings",
    },
    {
      name: "Regulatory Capital Ratio",
      unit: "%",
      description: "Capital reserves / Risk-weighted assets",
      direction: "higher_better",
      stages: {
        SEED: { p25: 10, median: 15, p75: 22, topDecile: 30 },
        SERIES_A: { p25: 12, median: 18, p75: 25, topDecile: 35 },
        SERIES_B: { p25: 14, median: 20, p75: 28, topDecile: 40 },
      },
      thresholds: { exceptional: 20, good: 12, concerning: 8 },
      sectorContext: "Basel III minimum CET1: 4.5%, total capital: 8%. Well-capitalized: 10%+.",
      source: "Basel Committee on Banking Supervision - Basel III standards; FDIC well-capitalized thresholds",
    },
  ],
  exitMultiples: {
    low: 3,
    median: 6,
    high: 12,
    topDecile: 20,
    typicalAcquirers: ["JPMorgan", "Goldman Sachs", "Visa", "Mastercard", "PayPal", "Block", "Fiserv"],
    recentExits: [
      // Note: Plaid/Visa deal was BLOCKED by DOJ - removed
      { company: "Credit Karma", acquirer: "Intuit", multiple: 14, year: 2020 }, // $7.1B deal - public
      { company: "Honey", acquirer: "PayPal", multiple: 0, year: 2020 }, // $4B - revenue multiple unknown
      { company: "Bill.com acquired Invoice2go", acquirer: "Bill.com", multiple: 8, year: 2021 }, // public
    ],
  },
  unitEconomicsFormulas: [
    { name: "Revenue per Transaction", formula: "TPV × Take Rate / Transactions", benchmark: { good: 0.5, excellent: 1.5 } },
    { name: "Contribution Margin", formula: "(Revenue - Variable Costs) / Revenue", benchmark: { good: 0.4, excellent: 0.6 } },
    { name: "Loss Reserve Ratio", formula: "Loss Reserves / Total Loans", benchmark: { good: 0.05, excellent: 0.03 } },
  ],
  redFlagRules: [
    { metric: "Default Rate", condition: "above", threshold: 10, severity: "critical", reason: "Default rate > 10% indicates broken underwriting model" },
    { metric: "Fraud Rate", condition: "above", threshold: 0.3, severity: "critical", reason: "Fraud > 0.3% suggests weak KYC/AML compliance (2x industry avg)" },
    { metric: "Take Rate", condition: "below", threshold: 0.3, severity: "major", reason: "Take rate < 0.3% requires massive scale to be viable" },
    { metric: "Regulatory Capital Ratio", condition: "below", threshold: 8, severity: "critical", reason: "Below Basel III minimums - license at risk" },
  ],
};

// ============================================================================
// MARKETPLACE BENCHMARKS
// Sources:
// - a16z Marketplace 100 Analysis (annual report)
// - NfX Marketplace Benchmarks (Network Effects Bible)
// - Bill Gurley / Benchmark Capital marketplace frameworks
// - Public marketplace company filings (Airbnb, Uber, Etsy, DoorDash)
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
        SEED: { p25: 80, median: 150, p75: 300, topDecile: 500 },
        SERIES_A: { p25: 60, median: 120, p75: 200, topDecile: 350 },
        SERIES_B: { p25: 40, median: 80, p75: 150, topDecile: 250 },
      },
      thresholds: { exceptional: 150, good: 80, concerning: 30 },
      sectorContext: "GMV growth > revenue growth is expected early (take rate expansion). Later, they should converge.",
      source: "a16z Marketplace 100 - growth rates by stage and category",
    },
    {
      name: "Take Rate",
      unit: "%",
      description: "Net revenue as percentage of GMV",
      direction: "higher_better",
      stages: {
        SEED: { p25: 8, median: 12, p75: 18, topDecile: 25 },
        SERIES_A: { p25: 10, median: 15, p75: 22, topDecile: 30 },
        SERIES_B: { p25: 12, median: 18, p75: 25, topDecile: 35 },
      },
      thresholds: { exceptional: 20, good: 12, concerning: 5 },
      sectorContext: "B2C product: 10-20%. B2B: 5-15%. Services: 15-30%. Real estate: 1-3%.",
      source: "Bill Gurley (Benchmark) - 'A Rake Too Far' framework; a16z Marketplace 100",
    },
    {
      name: "Liquidity Score",
      unit: "%",
      description: "% of listings that result in transactions within 30 days",
      direction: "higher_better",
      stages: {
        SEED: { p25: 12, median: 25, p75: 40, topDecile: 60 },
        SERIES_A: { p25: 20, median: 35, p75: 50, topDecile: 70 },
        SERIES_B: { p25: 30, median: 45, p75: 60, topDecile: 80 },
      },
      thresholds: { exceptional: 50, good: 30, concerning: 10 },
      sectorContext: "Measures marketplace health. < 15% = chicken-and-egg problem. > 50% = strong network effects.",
      source: "NfX Network Effects Bible - marketplace liquidity benchmarks",
    },
    {
      name: "Repeat Rate",
      unit: "%",
      description: "% of transactions from repeat buyers (monthly)",
      direction: "higher_better",
      stages: {
        SEED: { p25: 15, median: 30, p75: 45, topDecile: 60 },
        SERIES_A: { p25: 25, median: 40, p75: 55, topDecile: 70 },
        SERIES_B: { p25: 35, median: 50, p75: 65, topDecile: 78 },
      },
      thresholds: { exceptional: 50, good: 35, concerning: 15 },
      sectorContext: "High repeat = habitual usage. Low repeat might be OK for high-value infrequent purchases (cars, homes).",
      source: "a16z Marketplace 100 - repeat purchase analysis by category",
    },
    {
      name: "Buyer CAC",
      unit: "$",
      description: "Cost to acquire one active buyer",
      direction: "lower_better",
      stages: {
        SEED: { p25: 45, median: 25, p75: 12, topDecile: 5 },
        SERIES_A: { p25: 38, median: 20, p75: 10, topDecile: 4 },
        SERIES_B: { p25: 32, median: 18, p75: 8, topDecile: 3 },
      },
      thresholds: { exceptional: 10, good: 25, concerning: 60 },
      sectorContext: "Must be < first transaction contribution. Viral marketplaces achieve CAC < $5.",
      source: "Industry composite - public marketplace company filings (Uber, Lyft, DoorDash S-1s)",
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
        SEED: { p25: 0.5, median: 1.0, p75: 2.0, topDecile: 3.5 },
        SERIES_A: { p25: 0.8, median: 1.5, p75: 2.8, topDecile: 4.5 },
        SERIES_B: { p25: 1.0, median: 2.0, p75: 3.5, topDecile: 5.5 },
      },
      thresholds: { exceptional: 2, good: 1, concerning: 0.2 },
      sectorContext: "Too low = supply constrained. Too high = demand constrained. Optimal varies by category.",
      source: "NfX - marketplace balance optimization framework",
    },
    {
      name: "Avg Order Value",
      unit: "$",
      description: "Average transaction value",
      direction: "higher_better",
      stages: {
        SEED: { p25: 25, median: 60, p75: 150, topDecile: 400 },
        SERIES_A: { p25: 35, median: 85, p75: 220, topDecile: 600 },
        SERIES_B: { p25: 45, median: 100, p75: 300, topDecile: 800 },
      },
      thresholds: { exceptional: 150, good: 60, concerning: 15 },
      sectorContext: "Higher AOV = easier unit economics but longer sales cycles. Must match category norms.",
      source: "Industry estimates - varies significantly by vertical (food $30 vs real estate $300K)",
    },
  ],
  exitMultiples: {
    low: 1,
    median: 3,
    high: 8,
    topDecile: 15,
    typicalAcquirers: ["Amazon", "eBay", "Etsy", "Uber", "DoorDash", "Booking Holdings", "Private Equity"],
    recentExits: [
      { company: "Depop", acquirer: "Etsy", multiple: 0, year: 2021 }, // $1.625B - revenue multiple not public
      { company: "Reverb", acquirer: "Etsy", multiple: 0, year: 2019 }, // $275M - revenue not disclosed
      { company: "Postmates", acquirer: "Uber", multiple: 0, year: 2020 }, // $2.65B all-stock deal
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
// Sources:
// - Rock Health Digital Health Funding Report (annual)
// - CB Insights Digital Health 150 Report
// - KLAS Research (provider satisfaction and adoption)
// - CMS reimbursement data
// - Public company filings (Teladoc, Livongo, Hims, Ro)
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
        SEED: { p25: 3, median: 15, p75: 50, topDecile: 150 },
        SERIES_A: { p25: 30, median: 100, p75: 350, topDecile: 1000 },
        SERIES_B: { p25: 150, median: 500, p75: 1500, topDecile: 5000 },
      },
      thresholds: { exceptional: 300, good: 75, concerning: 10 },
      sectorContext: "Scale matters for data/outcomes validation. More patients = better clinical evidence.",
      source: "Rock Health analysis - digital health startup scaling patterns",
    },
    {
      name: "Clinical Outcomes Improvement",
      unit: "%",
      description: "Measurable improvement in clinical outcomes vs baseline",
      direction: "higher_better",
      stages: {
        SEED: { p25: 5, median: 12, p75: 25, topDecile: 40 },
        SERIES_A: { p25: 10, median: 18, p75: 30, topDecile: 50 },
        SERIES_B: { p25: 15, median: 22, p75: 35, topDecile: 55 },
      },
      thresholds: { exceptional: 25, good: 15, concerning: 5 },
      sectorContext: "Must be statistically significant. Required for value-based contracts and FDA claims.",
      source: "Industry standard - peer-reviewed clinical studies show 10-30% improvement range for effective DTx",
    },
    {
      name: "Gross Margin",
      unit: "%",
      description: "Revenue minus cost of goods sold",
      direction: "higher_better",
      stages: {
        SEED: { p25: 40, median: 55, p75: 68, topDecile: 78 },
        SERIES_A: { p25: 45, median: 60, p75: 72, topDecile: 82 },
        SERIES_B: { p25: 50, median: 65, p75: 75, topDecile: 85 },
      },
      thresholds: { exceptional: 70, good: 55, concerning: 35 },
      sectorContext: "Pure software: 70%+. With clinical staff: 35-55%. Device + services: 45-65%.",
      source: "Public company filings - Teladoc 65%, Livongo 75% (software), Hims 75%",
    },
    {
      name: "Provider Adoption Rate",
      unit: "%",
      description: "% of targeted providers actively using product",
      direction: "higher_better",
      stages: {
        SEED: { p25: 3, median: 10, p75: 25, topDecile: 45 },
        SERIES_A: { p25: 12, median: 25, p75: 45, topDecile: 65 },
        SERIES_B: { p25: 22, median: 40, p75: 60, topDecile: 80 },
      },
      thresholds: { exceptional: 45, good: 20, concerning: 5 },
      sectorContext: "Slow adoption is normal in healthcare. 3-5% monthly growth is strong.",
      source: "KLAS Research - health IT adoption benchmarks across provider segments",
    },
    {
      name: "Sales Cycle",
      unit: "months",
      description: "Average time from first contact to signed contract",
      direction: "lower_better",
      stages: {
        SEED: { p25: 15, median: 10, p75: 6, topDecile: 3 },
        SERIES_A: { p25: 12, median: 8, p75: 5, topDecile: 2 },
        SERIES_B: { p25: 10, median: 6, p75: 4, topDecile: 2 },
      },
      thresholds: { exceptional: 5, good: 9, concerning: 18 },
      sectorContext: "Health systems: 12-24 months. Clinics/practices: 3-6 months. D2C: < 2 months.",
      source: "Industry surveys - healthcare IT sales cycle analysis by buyer segment",
    },
  ],
  secondaryMetrics: [
    {
      name: "Patient Retention",
      unit: "%",
      description: "% of patients still active after 12 months",
      direction: "higher_better",
      stages: {
        SEED: { p25: 25, median: 45, p75: 65, topDecile: 80 },
        SERIES_A: { p25: 35, median: 55, p75: 72, topDecile: 85 },
        SERIES_B: { p25: 45, median: 62, p75: 78, topDecile: 88 },
      },
      thresholds: { exceptional: 70, good: 50, concerning: 25 },
      sectorContext: "Chronic conditions: should be 65%+. Acute: lower is OK. Engagement drives outcomes.",
      source: "Rock Health - patient engagement and retention benchmarks for digital health",
    },
    {
      name: "Reimbursement Rate",
      unit: "%",
      description: "% of claims successfully reimbursed",
      direction: "higher_better",
      stages: {
        SEED: { p25: 55, median: 70, p75: 82, topDecile: 92 },
        SERIES_A: { p25: 65, median: 78, p75: 88, topDecile: 95 },
        SERIES_B: { p25: 72, median: 85, p75: 92, topDecile: 97 },
      },
      thresholds: { exceptional: 85, good: 75, concerning: 55 },
      sectorContext: "CPT codes secured = higher rates. No codes = out-of-pocket only = smaller TAM.",
      source: "CMS data - commercial and Medicare reimbursement rates by service type",
    },
  ],
  exitMultiples: {
    low: 3,
    median: 7,
    high: 15,
    topDecile: 25,
    typicalAcquirers: ["UnitedHealth", "CVS Health", "Teladoc", "Cigna", "Major Pharma", "Private Equity"],
    recentExits: [
      { company: "Livongo", acquirer: "Teladoc", multiple: 0, year: 2020 }, // $18.5B deal - complex stock transaction
      { company: "MDLive", acquirer: "Cigna", multiple: 0, year: 2021 }, // Terms not disclosed
      { company: "One Medical", acquirer: "Amazon", multiple: 0, year: 2022 }, // $3.9B - revenue multiple not clear
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
// Sources:
// - Lux Research - DeepTech investment trends
// - NASA TRL scale (official documentation)
// - SBIR/STTR grant data (SBA.gov)
// - Boston Consulting Group DeepTech Report 2024
// - PitchBook DeepTech vertical data
// ============================================================================

export const DEEPTECH_BENCHMARKS: SectorBenchmarkData & {
  sectorSpecificRisks: string[];
  sectorSuccessPatterns: string[];
} = {
  sector: "DeepTech",

  // ============================================================================
  // SECTOR-SPECIFIC SUCCESS PATTERNS
  // Source: BCG DeepTech Report 2024, Lux Research, VC industry knowledge
  // ============================================================================
  sectorSuccessPatterns: [
    "Strong IP moat with broad, defensible patents (10+ granted patents or key foundational IP)",
    "World-class technical team with PhD-level expertise from top institutions (MIT, Stanford, CMU, etc.)",
    "Non-dilutive funding secured (SBIR/STTR, DARPA, NSF, EU Horizon) validating technology",
    "Clear path from research to commercialization with defined TRL milestones",
    "Strategic partnerships with industry leaders for go-to-market (Google, Microsoft, Intel, etc.)",
    "Hardware-software integration creating compounding defensibility",
    "Platform play enabling multiple revenue streams from core technology",
    "Regulatory approval pathway identified and de-risked (FDA, FCC, export controls)",
    "Customer LOIs or pilot contracts validating market demand before full R&D completion",
    "Founding team with prior successful exits or deep industry connections",
    "Technology with 10x improvement over status quo (not incremental)",
    "Capital-efficient development leveraging cloud compute, simulation, or open-source tools",
  ],

  // ============================================================================
  // SECTOR-SPECIFIC RISKS
  // Source: BCG DeepTech Report 2024, historical DeepTech failure analysis
  // ============================================================================
  sectorSpecificRisks: [
    "Technology risk: Core science may not work at scale (lab vs production gap)",
    "Talent concentration: Key person dependency on 1-2 technical founders",
    "Long development cycles: 3-7 years to revenue typical, cash burn risk",
    "IP vulnerability: Patents can be designed around or invalidated",
    "Big Tech competition: Google/Microsoft/Apple can replicate with 100x resources",
    "Regulatory uncertainty: AI Act, export controls, dual-use restrictions",
    "Market timing risk: Technology ready but market not (or vice versa)",
    "Capital intensity: May require $50M+ before meaningful revenue",
    "Talent wars: Competing with FAANG salaries for PhD-level talent",
    "Integration complexity: Enterprise sales cycles 12-24 months",
    "Technology obsolescence: Fast-moving field, breakthrough risk",
    "Dual-use concerns: Defense/surveillance applications may limit market",
    "Data moat dependency: Performance tied to proprietary training data access",
    "Compute cost scaling: Inference costs may not decrease as expected",
    "Academic spin-out risks: IP assignment issues, university licensing conflicts",
  ],

  primaryMetrics: [
    {
      name: "R&D Efficiency",
      unit: "x",
      description: "Revenue generated per R&D dollar spent",
      direction: "higher_better",
      stages: {
        SEED: { p25: 0.05, median: 0.2, p75: 0.5, topDecile: 1.0 },
        SERIES_A: { p25: 0.2, median: 0.5, p75: 1.0, topDecile: 2.0 },
        SERIES_B: { p25: 0.4, median: 0.8, p75: 1.5, topDecile: 3.0 },
      },
      thresholds: { exceptional: 1.0, good: 0.5, concerning: 0.1 },
      sectorContext: "DeepTech is R&D heavy early. Efficiency should improve post-product-market fit.",
      source: "Lux Research - R&D efficiency analysis across DeepTech portfolio companies",
    },
    {
      name: "Time to Revenue",
      unit: "months",
      description: "Months from founding to first commercial revenue",
      direction: "lower_better",
      stages: {
        SEED: { p25: 42, median: 30, p75: 20, topDecile: 12 },
        SERIES_A: { p25: 30, median: 20, p75: 14, topDecile: 8 },
        SERIES_B: { p25: 18, median: 12, p75: 6, topDecile: 3 },
      },
      thresholds: { exceptional: 18, good: 30, concerning: 48 },
      sectorContext: "Longer timelines normal for DeepTech. > 4 years without revenue is concerning.",
      source: "BCG DeepTech Report 2024 - time-to-commercialization analysis",
    },
    {
      name: "Patent Portfolio Value",
      unit: "$M",
      description: "Estimated value of IP portfolio (based on quality and breadth)",
      direction: "higher_better",
      stages: {
        SEED: { p25: 0.3, median: 1.5, p75: 4, topDecile: 12 },
        SERIES_A: { p25: 2, median: 8, p75: 25, topDecile: 60 },
        SERIES_B: { p25: 8, median: 30, p75: 80, topDecile: 200 },
      },
      thresholds: { exceptional: 25, good: 8, concerning: 1 },
      sectorContext: "IP is the moat in DeepTech. Must have defensible, broad patents.",
      source: "Industry estimates - patent valuation methodologies vary; based on comparable transactions",
    },
    {
      name: "Technical Team Density",
      unit: "%",
      description: "% of team with PhD or equivalent technical depth",
      direction: "higher_better",
      stages: {
        SEED: { p25: 40, median: 60, p75: 80, topDecile: 95 },
        SERIES_A: { p25: 30, median: 50, p75: 70, topDecile: 85 },
        SERIES_B: { p25: 25, median: 40, p75: 55, topDecile: 70 },
      },
      thresholds: { exceptional: 60, good: 40, concerning: 20 },
      sectorContext: "DeepTech requires deep expertise. Technical density naturally decreases as company scales.",
      source: "PitchBook - team composition analysis of DeepTech startups by stage",
    },
    {
      name: "Gross Margin at Scale",
      unit: "%",
      description: "Expected gross margin once at commercial scale",
      direction: "higher_better",
      stages: {
        SEED: { p25: 35, median: 50, p75: 65, topDecile: 80 },
        SERIES_A: { p25: 40, median: 55, p75: 70, topDecile: 82 },
        SERIES_B: { p25: 45, median: 60, p75: 72, topDecile: 85 },
      },
      thresholds: { exceptional: 70, good: 50, concerning: 30 },
      sectorContext: "Pure software DeepTech: 70%+. Hardware-enabled: 40-60%. Manufacturing: 25-45%.",
      source: "Public company analysis - NVIDIA (65%), Palantir (75%), semiconductor companies (40-50%)",
    },
  ],
  secondaryMetrics: [
    {
      name: "Grant Funding",
      unit: "$M",
      description: "Non-dilutive grant funding secured",
      direction: "higher_better",
      stages: {
        SEED: { p25: 0.15, median: 0.6, p75: 1.5, topDecile: 4 },
        SERIES_A: { p25: 0.8, median: 2.5, p75: 6, topDecile: 15 },
        SERIES_B: { p25: 2, median: 6, p75: 15, topDecile: 40 },
      },
      thresholds: { exceptional: 4, good: 1.5, concerning: 0 },
      sectorContext: "Grants validate technology and extend runway. SBIR Phase II: $1-2M. DARPA: $5-50M.",
      source: "SBA.gov SBIR/STTR database; DARPA award announcements; NSF award data",
    },
    {
      name: "Technology Readiness Level",
      unit: "TRL",
      description: "NASA TRL scale 1-9",
      direction: "higher_better",
      stages: {
        SEED: { p25: 2, median: 4, p75: 5, topDecile: 6 },
        SERIES_A: { p25: 4, median: 5, p75: 7, topDecile: 8 },
        SERIES_B: { p25: 6, median: 7, p75: 8, topDecile: 9 },
      },
      thresholds: { exceptional: 7, good: 5, concerning: 2 },
      sectorContext: "TRL 1-3: Research. TRL 4-6: Development/Demo. TRL 7-9: Commercial ready.",
      source: "NASA Technology Readiness Levels official definition (NASA NPR 7123.1B)",
    },
  ],
  exitMultiples: {
    low: 2,
    median: 6,
    high: 15,
    topDecile: 35,
    typicalAcquirers: ["Google", "Microsoft", "Apple", "NVIDIA", "Intel", "Qualcomm", "Defense Primes", "Industrial Giants"],
    recentExits: [
      // Note: DeepMind multiple was NOT disclosed - £400M deal, valuation uncertain
      { company: "DeepMind", acquirer: "Google", multiple: 0, year: 2014 }, // £400M - multiple unknown
      { company: "Cruise", acquirer: "GM", multiple: 0, year: 2016 }, // $1B - pre-revenue, multiple N/A
      // Arm/NVIDIA deal was BLOCKED - removed
      { company: "Nuance", acquirer: "Microsoft", multiple: 5, year: 2021 }, // $19.7B / ~$4B revenue
    ],
  },
  unitEconomicsFormulas: [
    { name: "R&D ROI", formula: "Future Revenue Value / Cumulative R&D Spend", benchmark: { good: 3, excellent: 10 } },
    { name: "IP Value/Employee", formula: "Patent Portfolio Value / Technical Employees", benchmark: { good: 500000, excellent: 2000000 } },
  ],
  redFlagRules: [
    { metric: "Time to Revenue", condition: "above", threshold: 60, severity: "critical", reason: "> 5 years to revenue = significant execution risk" },
    { metric: "Technical Team Density", condition: "below", threshold: 20, severity: "major", reason: "Insufficient technical depth for DeepTech" },
    { metric: "Technology Readiness Level", condition: "below", threshold: 2, severity: "major", reason: "TRL < 2 = still in basic research phase" },
  ],
};

// ============================================================================
// CLIMATE/CLEANTECH BENCHMARKS
// Sources:
// - BloombergNEF Climate Tech Investment Reports
// - IEA World Energy Investment Report 2024
// - PwC State of Climate Tech Report 2024
// - CTVC (Climate Tech VC) newsletter data
// - Carbon credit prices: Ecosystem Marketplace, S&P Global Platts
// ============================================================================

export const CLIMATE_BENCHMARKS: SectorBenchmarkData & {
  sectorSpecificRisks: string[];
  sectorSuccessPatterns: string[];
} = {
  sector: "Climate",

  // ============================================================================
  // SECTOR-SPECIFIC SUCCESS PATTERNS
  // Source: PwC State of Climate Tech 2024, CTVC analysis, historical exits
  // ============================================================================
  sectorSuccessPatterns: [
    "Strong policy alignment with IRA, EU Green Deal, or regional carbon pricing mechanisms",
    "Measurable, verifiable carbon impact with third-party certification (Verra, Gold Standard)",
    "Multi-year offtake agreements securing revenue visibility (5-15 years typical)",
    "Hardware + software combination creating recurring revenue streams",
    "Strategic partnerships with energy majors or industrial giants for distribution",
    "Non-dilutive funding secured (DOE, ARPA-E, EU Horizon, national climate funds)",
    "Technology achieving cost parity or better vs fossil alternatives",
    "First-mover in emerging carbon market segment (DAC, BECCS, enhanced weathering)",
    "Regulatory pre-approval or permit pathway de-risked",
    "Team with prior exits in energy/cleantech or deep industry connections",
    "Capital-efficient model avoiding heavy upfront CapEx (asset-light or project finance ready)",
    "Clear path to gigaton-scale impact (not just niche applications)",
  ],

  // ============================================================================
  // SECTOR-SPECIFIC RISKS
  // Source: PwC State of Climate Tech 2024, CleanTech 1.0 failure analysis
  // ============================================================================
  sectorSpecificRisks: [
    "Policy dependency: Business model collapses if subsidies/carbon price disappears",
    "Technology risk: Unproven at commercial scale (lab vs. real-world performance gap)",
    "Capital intensity: May require $100M+ before meaningful revenue (project finance dependent)",
    "Commodity price exposure: Margins tied to energy/carbon prices beyond control",
    "Permitting delays: Environmental reviews can add 2-5 years to project timelines",
    "Grid interconnection: Renewable projects blocked by transmission constraints",
    "Greenwashing scrutiny: Increasing regulatory and reputational risk for unverified claims",
    "Carbon credit volatility: VCM prices swung from $15 to $2 in some categories (Ecosystem Marketplace 2024)",
    "Big energy competition: Majors (Shell, BP, TotalEnergies) can outspend 100x",
    "Technology obsolescence: Fast-moving field, today's solution may be obsolete in 5 years",
    "Supply chain concentration: Critical minerals (lithium, rare earths) geopolitically exposed",
    "Integration complexity: Enterprise/industrial sales cycles 12-24 months",
    "Measurement challenges: Carbon accounting methodologies still evolving, audit risk",
    "Exit path uncertainty: Energy majors acquiring selectively, IPO window unpredictable",
    "Team burnout: Mission-driven founders may underestimate commercial execution needs",
  ],
  primaryMetrics: [
    {
      name: "Carbon Reduction",
      unit: "tCO2e/year",
      description: "Tonnes of CO2 equivalent reduced annually",
      direction: "higher_better",
      stages: {
        SEED: { p25: 500, median: 3000, p75: 15000, topDecile: 75000 },
        SERIES_A: { p25: 8000, median: 40000, p75: 150000, topDecile: 800000 },
        SERIES_B: { p25: 80000, median: 400000, p75: 1500000, topDecile: 8000000 },
      },
      thresholds: { exceptional: 75000, good: 15000, concerning: 500 },
      sectorContext: "Impact is the north star. Must demonstrate measurable, verifiable reduction.",
      source: "CTVC analysis - carbon impact by stage from portfolio companies",
    },
    {
      name: "Cost per Tonne Avoided",
      unit: "$/tCO2e",
      description: "Customer cost to avoid one tonne of CO2",
      direction: "lower_better",
      stages: {
        SEED: { p25: 180, median: 100, p75: 50, topDecile: 20 },
        SERIES_A: { p25: 120, median: 65, p75: 30, topDecile: 12 },
        SERIES_B: { p25: 80, median: 40, p75: 18, topDecile: 8 },
      },
      thresholds: { exceptional: 25, good: 60, concerning: 250 },
      sectorContext: "VCM credits: $5-50/tonne. Compliance credits: $20-100+. Must beat alternatives.",
      source: "S&P Global Platts Carbon Credit prices 2024; IEA marginal abatement cost curves",
    },
    {
      name: "Revenue Growth YoY",
      unit: "%",
      description: "Year-over-year revenue growth",
      direction: "higher_better",
      stages: {
        SEED: { p25: 60, median: 120, p75: 250, topDecile: 450 },
        SERIES_A: { p25: 50, median: 100, p75: 180, topDecile: 300 },
        SERIES_B: { p25: 35, median: 70, p75: 130, topDecile: 220 },
      },
      thresholds: { exceptional: 120, good: 70, concerning: 25 },
      sectorContext: "Climate urgency drives adoption for proven solutions. IRA accelerating US growth.",
      source: "BloombergNEF - climate tech revenue growth analysis 2024",
    },
    {
      name: "Gross Margin",
      unit: "%",
      description: "Revenue minus COGS",
      direction: "higher_better",
      stages: {
        SEED: { p25: 25, median: 40, p75: 55, topDecile: 70 },
        SERIES_A: { p25: 30, median: 45, p75: 60, topDecile: 75 },
        SERIES_B: { p25: 35, median: 50, p75: 65, topDecile: 78 },
      },
      thresholds: { exceptional: 60, good: 40, concerning: 20 },
      sectorContext: "Software: 65%+. Hardware/energy: 25-45%. EPC/installation: 15-30%.",
      source: "Public company filings - Enphase (40%), ChargePoint (25%), software plays (65%+)",
    },
    {
      name: "Policy Tailwind Score",
      unit: "1-10",
      description: "Strength of regulatory support (IRA, EU Green Deal, etc.)",
      direction: "higher_better",
      stages: {
        SEED: { p25: 4, median: 6, p75: 8, topDecile: 9 },
        SERIES_A: { p25: 5, median: 7, p75: 8, topDecile: 10 },
        SERIES_B: { p25: 6, median: 7, p75: 9, topDecile: 10 },
      },
      thresholds: { exceptional: 8, good: 6, concerning: 3 },
      sectorContext: "IRA ($369B), EU Green Deal (€1T), carbon pricing. Policy dependency = risk.",
      source: "Qualitative assessment based on IEA policy tracker and regional carbon pricing data",
    },
  ],
  secondaryMetrics: [
    {
      name: "Contract Pipeline",
      unit: "$M",
      description: "Value of signed LOIs and contracts",
      direction: "higher_better",
      stages: {
        SEED: { p25: 0.5, median: 3, p75: 10, topDecile: 35 },
        SERIES_A: { p25: 8, median: 25, p75: 65, topDecile: 150 },
        SERIES_B: { p25: 40, median: 120, p75: 300, topDecile: 800 },
      },
      thresholds: { exceptional: 40, good: 12, concerning: 1 },
      sectorContext: "Long sales cycles in energy (12-24 months). Pipeline = leading indicator.",
      source: "Industry estimates - energy/industrial sales cycle analysis",
    },
    {
      name: "Offtake Agreements",
      unit: "years",
      description: "Average duration of offtake/purchase agreements",
      direction: "higher_better",
      stages: {
        SEED: { p25: 1, median: 3, p75: 5, topDecile: 10 },
        SERIES_A: { p25: 2, median: 5, p75: 10, topDecile: 15 },
        SERIES_B: { p25: 4, median: 8, p75: 12, topDecile: 20 },
      },
      thresholds: { exceptional: 10, good: 5, concerning: 1 },
      sectorContext: "PPAs: 10-25 years typical. Offtakes de-risk revenue for project finance.",
      source: "BloombergNEF - PPA and offtake agreement duration analysis",
    },
  ],
  exitMultiples: {
    low: 2,
    median: 5,
    high: 12,
    topDecile: 25,
    typicalAcquirers: ["Shell", "BP", "TotalEnergies", "Brookfield", "Engie", "Enel", "Industrial Giants", "PE"],
    recentExits: [
      // SPAC valuations were often inflated - marking multiples as uncertain
      { company: "ChargePoint", acquirer: "SPAC/IPO", multiple: 0, year: 2021 }, // Valuation fluctuated significantly
      { company: "Proterra", acquirer: "SPAC", multiple: 0, year: 2021 }, // Filed bankruptcy 2023
      { company: "Sunrun", acquirer: "IPO", multiple: 0, year: 2015 }, // Complex lease model, multiple unclear
    ],
  },
  unitEconomicsFormulas: [
    { name: "Revenue per tCO2e", formula: "Total Revenue / Carbon Reduced", benchmark: { good: 50, excellent: 150 } },
    { name: "Customer ROI", formula: "(Energy Savings + Carbon Credit Value) / Solution Cost", benchmark: { good: 2, excellent: 5 } },
  ],
  redFlagRules: [
    { metric: "Carbon Reduction", condition: "below", threshold: 100, severity: "critical", reason: "No measurable impact = greenwashing risk" },
    { metric: "Cost per Tonne Avoided", condition: "above", threshold: 300, severity: "major", reason: "Too expensive vs carbon credits ($5-100/tonne range)" },
    { metric: "Policy Tailwind Score", condition: "below", threshold: 3, severity: "major", reason: "Dependent on policy that doesn't exist" },
  ],
};

// ============================================================================
// HARDWARE/IOT BENCHMARKS
// Sources:
// - HAX (hardware accelerator) portfolio data
// - Bolt VC hardware investment benchmarks
// - First Round Capital hardware portfolio analysis
// - Public company filings (Fitbit, GoPro, Peloton, Sonos pre-acquisition)
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
        SEED: { p25: 22, median: 32, p75: 45, topDecile: 55 },
        SERIES_A: { p25: 28, median: 38, p75: 50, topDecile: 60 },
        SERIES_B: { p25: 32, median: 42, p75: 53, topDecile: 65 },
      },
      thresholds: { exceptional: 50, good: 35, concerning: 20 },
      sectorContext: "Consumer electronics: 25-40%. Enterprise: 40-55%. Apple-tier: 55%+.",
      source: "HAX accelerator data; public filings - Fitbit 45%, GoPro 35%, Peloton 20%",
    },
    {
      name: "Attach Rate",
      unit: "%",
      description: "% of hardware customers with recurring revenue (software/services)",
      direction: "higher_better",
      stages: {
        SEED: { p25: 12, median: 30, p75: 50, topDecile: 70 },
        SERIES_A: { p25: 22, median: 42, p75: 60, topDecile: 80 },
        SERIES_B: { p25: 32, median: 52, p75: 70, topDecile: 85 },
      },
      thresholds: { exceptional: 55, good: 35, concerning: 10 },
      sectorContext: "Hardware + software = better unit economics. Pure hardware is commoditizing.",
      source: "Bolt VC hardware benchmarks - attach rate analysis across portfolio",
    },
    {
      name: "Blended Gross Margin",
      unit: "%",
      description: "Combined hardware + software/services margin",
      direction: "higher_better",
      stages: {
        SEED: { p25: 30, median: 42, p75: 55, topDecile: 68 },
        SERIES_A: { p25: 36, median: 48, p75: 60, topDecile: 72 },
        SERIES_B: { p25: 42, median: 52, p75: 64, topDecile: 76 },
      },
      thresholds: { exceptional: 55, good: 42, concerning: 28 },
      sectorContext: "Best hardware companies have 45%+ blended margin from software attach.",
      source: "Analysis of hardware-software companies: Sonos 45%, Peloton 35% (pre-crisis)",
    },
    {
      name: "Time to Production",
      unit: "months",
      description: "Time from prototype to mass production",
      direction: "lower_better",
      stages: {
        SEED: { p25: 28, median: 20, p75: 14, topDecile: 8 },
        SERIES_A: { p25: 20, median: 14, p75: 10, topDecile: 5 },
        SERIES_B: { p25: 14, median: 10, p75: 6, topDecile: 3 },
      },
      thresholds: { exceptional: 10, good: 18, concerning: 30 },
      sectorContext: "Hardware timelines are long. Always add 50% buffer for reality.",
      source: "HAX accelerator - time to production statistics across 300+ hardware startups",
    },
    {
      name: "Unit Economics at Scale",
      unit: "x",
      description: "Revenue per unit / COGS per unit at 10K+ units",
      direction: "higher_better",
      stages: {
        SEED: { p25: 1.25, median: 1.5, p75: 1.9, topDecile: 2.5 },
        SERIES_A: { p25: 1.4, median: 1.7, p75: 2.2, topDecile: 2.9 },
        SERIES_B: { p25: 1.55, median: 1.9, p75: 2.4, topDecile: 3.2 },
      },
      thresholds: { exceptional: 2.2, good: 1.7, concerning: 1.2 },
      sectorContext: "Must model unit economics at scale (10K+ units). Early production always expensive.",
      source: "Bolt VC and HAX - unit economics analysis by production volume",
    },
  ],
  secondaryMetrics: [
    {
      name: "Return Rate",
      unit: "%",
      description: "% of units returned within 30 days",
      direction: "lower_better",
      stages: {
        SEED: { p25: 14, median: 9, p75: 5, topDecile: 2 },
        SERIES_A: { p25: 10, median: 6, p75: 3, topDecile: 1.5 },
        SERIES_B: { p25: 7, median: 4, p75: 2.5, topDecile: 1 },
      },
      thresholds: { exceptional: 3, good: 6, concerning: 14 },
      sectorContext: "Consumer electronics avg: 8-12%. High returns = quality or PMF issues.",
      source: "Industry data - consumer electronics return rate benchmarks",
    },
    {
      name: "BOM Cost Reduction",
      unit: "%/year",
      description: "Annual bill of materials cost reduction",
      direction: "higher_better",
      stages: {
        SEED: { p25: 4, median: 10, p75: 18, topDecile: 30 },
        SERIES_A: { p25: 6, median: 12, p75: 22, topDecile: 35 },
        SERIES_B: { p25: 8, median: 15, p75: 25, topDecile: 40 },
      },
      thresholds: { exceptional: 22, good: 12, concerning: 3 },
      sectorContext: "Scale should drive 8-15% annual BOM reduction. Critical for margin improvement.",
      source: "First Round Capital - hardware scaling cost curves analysis",
    },
  ],
  exitMultiples: {
    low: 1,
    median: 3,
    high: 8,
    topDecile: 15,
    typicalAcquirers: ["Apple", "Google", "Amazon", "Samsung", "Sony", "Industrial Giants", "PE"],
    recentExits: [
      { company: "Nest", acquirer: "Google", multiple: 0, year: 2014 }, // $3.2B - was pre-profit, multiple N/A
      { company: "Ring", acquirer: "Amazon", multiple: 0, year: 2018 }, // $1B+ - revenue not disclosed
      { company: "Beats", acquirer: "Apple", multiple: 0, year: 2014 }, // $3B - $1.5B rev rumored = ~2x
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
// Sources:
// - GameAnalytics Global Benchmarks Report 2024
// - Sensor Tower State of Mobile Gaming Report
// - data.ai (formerly App Annie) Gaming Spotlight
// - Deconstructor of Fun (industry analysis)
// - Public filings: Zynga, Rovio, Playtika, Skillz
// ============================================================================

export const GAMING_BENCHMARKS: SectorBenchmarkData & {
  sectorSpecificRisks: string[];
  sectorSuccessPatterns: string[];
} = {
  sector: "Gaming",
  primaryMetrics: [
    {
      name: "DAU/MAU Ratio",
      unit: "%",
      description: "Daily active users / Monthly active users",
      direction: "higher_better",
      stages: {
        SEED: { p25: 12, median: 20, p75: 32, topDecile: 48 },
        SERIES_A: { p25: 16, median: 25, p75: 38, topDecile: 52 },
        SERIES_B: { p25: 20, median: 30, p75: 42, topDecile: 58 },
      },
      thresholds: { exceptional: 35, good: 22, concerning: 10 },
      sectorContext: "Measures stickiness. Hypercasual: 12-18%. Casual: 18-28%. Midcore: 30%+.",
      source: "GameAnalytics Global Benchmarks 2024 - DAU/MAU by genre",
    },
    {
      name: "Day 1 Retention",
      unit: "%",
      description: "% of users returning day after install",
      direction: "higher_better",
      stages: {
        SEED: { p25: 28, median: 38, p75: 48, topDecile: 58 },
        SERIES_A: { p25: 32, median: 42, p75: 52, topDecile: 62 },
        SERIES_B: { p25: 35, median: 45, p75: 55, topDecile: 65 },
      },
      thresholds: { exceptional: 45, good: 35, concerning: 22 },
      sectorContext: "D1 is the first filter. GameAnalytics median: 25-30%. < 25% = core loop issues.",
      source: "GameAnalytics Benchmarks 2024 - D1 retention median 25% across all games",
    },
    {
      name: "Day 30 Retention",
      unit: "%",
      description: "% of users returning 30 days after install",
      direction: "higher_better",
      stages: {
        SEED: { p25: 4, median: 8, p75: 14, topDecile: 22 },
        SERIES_A: { p25: 6, median: 10, p75: 18, topDecile: 28 },
        SERIES_B: { p25: 8, median: 13, p75: 22, topDecile: 32 },
      },
      thresholds: { exceptional: 15, good: 8, concerning: 3 },
      sectorContext: "D30 predicts LTV. GameAnalytics median: ~4%. Top games: 15%+.",
      source: "GameAnalytics Benchmarks 2024 - D30 retention by genre",
    },
    {
      name: "ARPDAU",
      unit: "$",
      description: "Average revenue per daily active user",
      direction: "higher_better",
      stages: {
        SEED: { p25: 0.02, median: 0.06, p75: 0.14, topDecile: 0.32 },
        SERIES_A: { p25: 0.04, median: 0.10, p75: 0.22, topDecile: 0.45 },
        SERIES_B: { p25: 0.06, median: 0.14, p75: 0.30, topDecile: 0.60 },
      },
      thresholds: { exceptional: 0.20, good: 0.08, concerning: 0.02 },
      sectorContext: "Hypercasual: $0.02-0.04. Casual: $0.05-0.12. Midcore/Strategy: $0.15-0.40.",
      source: "Sensor Tower 2024 - ARPDAU by game category",
    },
    {
      name: "LTV/CPI Ratio",
      unit: "x",
      description: "Lifetime value / Cost per install",
      direction: "higher_better",
      stages: {
        SEED: { p25: 0.7, median: 1.0, p75: 1.5, topDecile: 2.2 },
        SERIES_A: { p25: 0.9, median: 1.3, p75: 1.9, topDecile: 2.8 },
        SERIES_B: { p25: 1.1, median: 1.6, p75: 2.3, topDecile: 3.5 },
      },
      thresholds: { exceptional: 1.8, good: 1.2, concerning: 0.7 },
      sectorContext: "LTV/CPI > 1.2 for profitable UA. Post-ATT, CPI up 40-70%.",
      source: "Liftoff Mobile Gaming Apps Report 2024 - CPI and LTV benchmarks",
    },
  ],
  secondaryMetrics: [
    {
      name: "Paying User Rate",
      unit: "%",
      description: "% of active users who make purchases",
      direction: "higher_better",
      stages: {
        SEED: { p25: 1.2, median: 2.5, p75: 4.5, topDecile: 8 },
        SERIES_A: { p25: 1.8, median: 3.5, p75: 6, topDecile: 10 },
        SERIES_B: { p25: 2.2, median: 4.2, p75: 7, topDecile: 12 },
      },
      thresholds: { exceptional: 5, good: 2.5, concerning: 0.8 },
      sectorContext: "F2P average: 2-4%. Whale-dependent models need high ARPPU to compensate.",
      source: "data.ai State of Mobile 2024 - payer conversion rates",
    },
    {
      name: "ARPPU",
      unit: "$",
      description: "Average revenue per paying user (monthly)",
      direction: "higher_better",
      stages: {
        SEED: { p25: 6, median: 15, p75: 35, topDecile: 70 },
        SERIES_A: { p25: 10, median: 22, p75: 48, topDecile: 95 },
        SERIES_B: { p25: 13, median: 28, p75: 60, topDecile: 120 },
      },
      thresholds: { exceptional: 45, good: 20, concerning: 6 },
      sectorContext: "Casual: $8-20. Midcore: $20-50. Strategy/RPG: $40-100+.",
      source: "Sensor Tower 2024 - ARPPU by genre and region",
    },
  ],
  exitMultiples: {
    low: 1,
    median: 4,
    high: 10,
    topDecile: 20,
    typicalAcquirers: ["Microsoft", "Sony", "Tencent", "NetEase", "EA", "Take-Two", "Embracer", "PE"],
    recentExits: [
      { company: "Activision Blizzard", acquirer: "Microsoft", multiple: 6, year: 2023 }, // $69B / ~$8B rev = 8.5x EV/Rev
      { company: "Zynga", acquirer: "Take-Two", multiple: 4, year: 2022 }, // $12.7B / ~$2.8B rev
      { company: "Supercell", acquirer: "Tencent", multiple: 0, year: 2016 }, // $8.6B for 84% - EBITDA multiple, not rev
    ],
  },
  unitEconomicsFormulas: [
    { name: "LTV", formula: "ARPDAU × Average Lifetime Days", benchmark: { good: 3, excellent: 8 } },
    { name: "Contribution Margin", formula: "(LTV - CPI) / LTV", benchmark: { good: 0.25, excellent: 0.5 } },
    { name: "Payback Days", formula: "CPI / ARPDAU", benchmark: { good: 90, excellent: 30 } },
  ],
  redFlagRules: [
    { metric: "Day 1 Retention", condition: "below", threshold: 22, severity: "critical", reason: "D1 < 22% is below industry median = core loop issues" },
    { metric: "LTV/CPI Ratio", condition: "below", threshold: 0.7, severity: "critical", reason: "LTV/CPI < 0.7 = unprofitable at scale" },
    { metric: "DAU/MAU Ratio", condition: "below", threshold: 8, severity: "major", reason: "Very low engagement = likely churn spiral" },
    { metric: "Paying User Rate", condition: "below", threshold: 0.5, severity: "major", reason: "Conversion < 0.5% = monetization issues" },
  ],

  // ============================================================================
  // SECTOR-SPECIFIC RISKS
  // Source: Deconstructor of Fun analysis, historical gaming failures
  // ============================================================================
  sectorSpecificRisks: [
    "Hit-driven business: Success depends on unpredictable viral hits, not repeatable process",
    "Platform dependency: 30% revenue share to Apple/Google/Steam, policy changes can kill business",
    "UA cost inflation: iOS14/ATT killed cheap user acquisition, CPI up 40-70% since 2021 (Liftoff data)",
    "Content treadmill: Players expect constant updates, LiveOps costs can exceed initial dev",
    "Whale concentration: 50-70% revenue from <5% of players (Swrve data), losing whales = catastrophic",
    "Genre saturation: Match-3, battle royale, etc. are red oceans with 1000+ competitors",
    "Copycat risk: Successful mechanics cloned within weeks by competitors",
    "Team retention: Game dev talent is highly mobile, key departures derail projects",
    "Tech platform shifts: VR/AR adoption slower than expected, blockchain gaming crashed",
    "Regulatory crackdowns: Loot box bans (Belgium, Netherlands), China playtime limits",
    "IP dependency: Licensed games lose rights at renewal, original IP takes years to build",
    "Long dev cycles: 2-4 years to launch, market/trends may shift during development",
    "Quality bar inflation: Player expectations rising, minimum viable quality increasing",
    "Streamer/influencer dependency: Success tied to Twitch/YouTube coverage, not controllable",
    "Review bombing: Metacritic/Steam reviews can tank a launch, hard to recover",
  ],

  // ============================================================================
  // SECTOR SUCCESS PATTERNS
  // Source: Analysis of successful gaming companies, VC portfolio patterns
  // ============================================================================
  sectorSuccessPatterns: [
    "Strong core loop validated: D1 retention >40% before scaling UA spend",
    "LiveOps DNA: Team structure and tools built for continuous content updates",
    "Diversified UA: Organic/viral >30% of installs, not 100% dependent on paid",
    "Whale-friendly monetization: ARPPU >$40 without Pay-to-Win mechanics",
    "Community-first: Discord/Reddit engagement drives organic growth and retention",
    "Cross-platform: Mobile + PC + Console multiplies addressable market",
    "Data-driven iteration: A/B testing every feature, cohort analysis on every change",
    "IP ownership: Original IP with merchandising/licensing potential",
    "Seasoned team: Prior shipped titles with >$10M revenue, knows the grind",
    "Genre innovation: New twist on proven genre (not pure clone, not pure invention)",
    "Soft launch mastery: 3-6+ months of iteration in test markets before global",
    "Efficient production: <$3M to soft launch, <$10M to global for mobile",
    "Portfolio strategy: Multiple games in development, not all eggs in one basket",
    "Strategic publisher: Partnership with Tencent/NetEase/EA provides UA muscle",
    "Esports/streaming potential: Spectator-friendly gameplay for viral growth",
  ],
};

// ============================================================================
// AI/ML BENCHMARKS
// Sources:
// - a16z AI Playbook and AI Infrastructure Report 2025
// - Menlo Ventures AI Infrastructure Survey 2024
// - Scale AI Foundation Model Cost Analysis
// - MLCommons MLPerf Benchmarks
// - Artificial Analysis LLM Leaderboard (cost/latency data)
// - Sequoia Capital AI Market Map 2024
// ============================================================================

export const AI_BENCHMARKS: SectorBenchmarkData & {
  modelApproachPatterns: string[];
  technicalCredibilitySignals: string[];
  aiRedFlagPatterns: string[];
} = {
  sector: "AI/ML",
  primaryMetrics: [
    {
      name: "Gross Margin",
      unit: "%",
      description: "Revenue minus inference/compute costs",
      direction: "higher_better",
      stages: {
        SEED: { p25: 40, median: 55, p75: 70, topDecile: 82 },
        SERIES_A: { p25: 50, median: 65, p75: 75, topDecile: 85 },
        SERIES_B: { p25: 60, median: 70, p75: 80, topDecile: 88 },
      },
      thresholds: { exceptional: 75, good: 60, concerning: 40 },
      sectorContext: "AI gross margins under pressure from inference costs. API wrappers: 30-50%. Fine-tuned models: 50-70%. Proprietary models: 70-85%.",
      source: "a16z AI Infrastructure Report 2025 - gross margin analysis by model approach",
    },
    {
      name: "Inference Cost per Query",
      unit: "$",
      description: "Average cost per inference/API call",
      direction: "lower_better",
      stages: {
        SEED: { p25: 0.02, median: 0.008, p75: 0.003, topDecile: 0.001 },
        SERIES_A: { p25: 0.015, median: 0.005, p75: 0.002, topDecile: 0.0008 },
        SERIES_B: { p25: 0.01, median: 0.003, p75: 0.001, topDecile: 0.0005 },
      },
      thresholds: { exceptional: 0.002, good: 0.008, concerning: 0.02 },
      sectorContext: "GPT-4: ~$0.03-0.06/query. Claude: ~$0.015-0.03. Fine-tuned smaller models: $0.001-0.005. On-device: near zero marginal.",
      source: "Artificial Analysis LLM Leaderboard 2025 - cost benchmarks; OpenAI/Anthropic pricing",
    },
    {
      name: "Model Latency P99",
      unit: "ms",
      description: "99th percentile inference latency",
      direction: "lower_better",
      stages: {
        SEED: { p25: 3000, median: 1500, p75: 800, topDecile: 300 },
        SERIES_A: { p25: 2000, median: 1000, p75: 500, topDecile: 200 },
        SERIES_B: { p25: 1500, median: 700, p75: 350, topDecile: 150 },
      },
      thresholds: { exceptional: 500, good: 1500, concerning: 5000 },
      sectorContext: "Real-time apps need <500ms. Async workflows tolerate 2-5s. Batch processing: latency irrelevant.",
      source: "MLCommons MLPerf Inference 2024 - latency benchmarks by use case",
    },
    {
      name: "Team ML Experience",
      unit: "years",
      description: "Cumulative ML/AI experience of technical team",
      direction: "higher_better",
      stages: {
        SEED: { p25: 5, median: 12, p75: 25, topDecile: 50 },
        SERIES_A: { p25: 15, median: 30, p75: 60, topDecile: 100 },
        SERIES_B: { p25: 30, median: 60, p75: 120, topDecile: 200 },
      },
      thresholds: { exceptional: 40, good: 15, concerning: 5 },
      sectorContext: "AI is a talent-heavy business. Top teams have ex-Google Brain, DeepMind, FAIR, Anthropic, OpenAI engineers.",
      source: "Sequoia Capital AI Market Map 2024 - team composition analysis of successful AI companies",
    },
    {
      name: "Data Moat Score",
      unit: "score",
      description: "Proprietary data defensibility (0-100)",
      direction: "higher_better",
      stages: {
        SEED: { p25: 20, median: 40, p75: 60, topDecile: 80 },
        SERIES_A: { p25: 30, median: 50, p75: 70, topDecile: 85 },
        SERIES_B: { p25: 40, median: 60, p75: 80, topDecile: 90 },
      },
      thresholds: { exceptional: 70, good: 50, concerning: 20 },
      sectorContext: "Data moat = unique data + data flywheel. Public data = 0. Licensed exclusive = 30-50. Proprietary generated = 50-80. Self-improving = 80+.",
      source: "Menlo Ventures AI Infrastructure Survey 2024 - moat analysis framework",
    },
  ],
  secondaryMetrics: [
    {
      name: "API Dependency",
      unit: "%",
      description: "Percentage of core functionality dependent on third-party AI APIs",
      direction: "lower_better",
      stages: {
        SEED: { p25: 80, median: 50, p75: 20, topDecile: 0 },
        SERIES_A: { p25: 60, median: 30, p75: 10, topDecile: 0 },
        SERIES_B: { p25: 40, median: 20, p75: 5, topDecile: 0 },
      },
      thresholds: { exceptional: 10, good: 30, concerning: 80 },
      sectorContext: "100% API dependency = no moat, margin squeeze risk. Some API use is fine. Full dependency is a red flag.",
      source: "a16z AI Playbook - 'thin wrapper' warning; investor discussions",
    },
    {
      name: "Model Accuracy vs Benchmark",
      unit: "%",
      description: "Performance vs industry benchmark on core task",
      direction: "higher_better",
      stages: {
        SEED: { p25: 75, median: 85, p75: 92, topDecile: 97 },
        SERIES_A: { p25: 80, median: 88, p75: 94, topDecile: 98 },
        SERIES_B: { p25: 85, median: 90, p75: 95, topDecile: 99 },
      },
      thresholds: { exceptional: 95, good: 88, concerning: 75 },
      sectorContext: "Accuracy must be measured on relevant benchmark. Beware cherry-picked metrics. Demand evaluation methodology.",
      source: "MLCommons benchmarks; company-specific domain benchmarks",
    },
    {
      name: "GPU Utilization",
      unit: "%",
      description: "Average GPU utilization during inference",
      direction: "higher_better",
      stages: {
        SEED: { p25: 30, median: 50, p75: 70, topDecile: 85 },
        SERIES_A: { p25: 40, median: 60, p75: 75, topDecile: 88 },
        SERIES_B: { p25: 50, median: 65, p75: 80, topDecile: 90 },
      },
      thresholds: { exceptional: 80, good: 60, concerning: 30 },
      sectorContext: "Low utilization = wasted compute spend. High utilization needs capacity planning. Batch vs real-time matters.",
      source: "Scale AI compute optimization benchmarks",
    },
    {
      name: "Reproducibility Risk",
      unit: "score",
      description: "How easily can this be replicated (0=hard, 100=trivial)",
      direction: "lower_better",
      stages: {
        SEED: { p25: 70, median: 50, p75: 30, topDecile: 10 },
        SERIES_A: { p25: 60, median: 40, p75: 25, topDecile: 8 },
        SERIES_B: { p25: 50, median: 30, p75: 15, topDecile: 5 },
      },
      thresholds: { exceptional: 15, good: 35, concerning: 70 },
      sectorContext: "GPT wrapper = 90+ (trivial). RAG system = 50-70. Fine-tuned model = 30-50. Novel architecture = 10-20. Research breakthrough = <10.",
      source: "Analysis of AI startup defensibility patterns - Sequoia/a16z frameworks",
    },
  ],
  exitMultiples: {
    low: 5,
    median: 12,
    high: 25,
    topDecile: 50,
    typicalAcquirers: ["Google", "Microsoft", "Meta", "Apple", "Amazon", "NVIDIA", "Salesforce", "ServiceNow", "Databricks"],
    recentExits: [
      { company: "Inflection AI", acquirer: "Microsoft (acqui-hire)", multiple: 0, year: 2024 }, // $650M for talent, not product
      { company: "Character.ai", acquirer: "Google (licensing deal)", multiple: 20, year: 2024 }, // $2.7B licensing
      { company: "Mosaic ML", acquirer: "Databricks", multiple: 18, year: 2023 }, // $1.3B acquisition
      { company: "Adept", acquirer: "Amazon (acqui-hire)", multiple: 0, year: 2024 }, // Talent acquisition
    ],
  },
  unitEconomicsFormulas: [
    { name: "Cost per Inference", formula: "(GPU Cost + API Costs + Bandwidth) / Total Queries", benchmark: { good: "$0.005", excellent: "$0.001" }, source: "a16z AI cost analysis" },
    { name: "Gross Margin", formula: "(Revenue - Inference Costs) / Revenue", benchmark: { good: "60%", excellent: "75%" }, source: "AI company financials" },
    { name: "Model Efficiency", formula: "Performance / Compute Cost", benchmark: { good: "2x baseline", excellent: "5x baseline" }, source: "MLPerf benchmarks" },
    { name: "Data Flywheel Score", formula: "User Growth Rate × Data Quality × Feedback Loop Speed", benchmark: { good: "50+", excellent: "80+" }, source: "Proprietary framework" },
  ],
  redFlagRules: [
    { metric: "API Dependency", condition: "above", threshold: 90, severity: "critical", reason: "90%+ API dependency = thin wrapper, no moat, margin squeeze inevitable" },
    { metric: "Gross Margin", condition: "below", threshold: 40, severity: "critical", reason: "Gross margin < 40% indicates unsustainable unit economics for AI" },
    { metric: "Team ML Experience", condition: "below", threshold: 5, severity: "critical", reason: "< 5 years cumulative ML experience = team cannot build defensible AI" },
    { metric: "Model Accuracy vs Benchmark", condition: "below", threshold: 75, severity: "major", reason: "Below 75% of benchmark suggests inadequate model performance" },
    { metric: "Reproducibility Risk", condition: "above", threshold: 80, severity: "major", reason: "Easily reproducible = anyone can build this, no defensibility" },
    { metric: "Data Moat Score", condition: "below", threshold: 20, severity: "major", reason: "No proprietary data = competing on execution only, very risky" },
  ],
  modelApproachPatterns: [
    "API Wrapper: Calling GPT-4/Claude directly with minimal processing - NO MOAT (red flag)",
    "RAG System: Retrieval-augmented generation with proprietary data - WEAK MOAT (acceptable if data is unique)",
    "Fine-tuned Model: Customized foundation model on proprietary data - MODERATE MOAT (good if domain-specific)",
    "Custom Architecture: Novel model architecture/approach - STRONG MOAT (requires deep expertise)",
    "End-to-end Solution: Full stack AI with data flywheel - STRONGEST MOAT (rare, most valuable)",
  ],
  technicalCredibilitySignals: [
    "Team has published ML papers (NeurIPS, ICML, ACL, etc.)",
    "Team members from top AI labs (DeepMind, OpenAI, Google Brain, FAIR, Anthropic)",
    "Open source contributions to major ML frameworks (PyTorch, TensorFlow, HuggingFace)",
    "Clear articulation of model architecture and why it's differentiated",
    "Rigorous evaluation methodology with held-out test sets",
    "Understanding of cost structure and path to margin improvement",
    "Awareness of AI limitations and failure modes",
  ],
  aiRedFlagPatterns: [
    "Claims 'AI-powered' but no ML team or PhDs",
    "Cannot explain how their model differs from calling GPT-4",
    "Accuracy claims without rigorous evaluation methodology",
    "No discussion of inference costs or unit economics",
    "100% dependent on OpenAI/Anthropic APIs for core functionality",
    "Claims '99% accuracy' without specifying benchmark or methodology",
    "No proprietary data or data flywheel strategy",
    "Team has web/mobile background but no ML experience",
    "Cannot articulate competitive moat beyond 'we're faster'",
    "Scaling story relies on API providers reducing prices",
  ],
};

// ============================================================================
// CONSUMER/D2C BENCHMARKS
// Sources:
// - First Page Sage - Average CAC for eCommerce Companies: 2026 Edition
// - MobiLoud - Repeat Customer Rate Ecommerce Benchmarks 2025
// - Triple Whale - Ad Performance Metrics for 30K Ecommerce Brands 2024
// - Houlihan Lokey - Q4 2024 E-Commerce and D2C Market Update
// - Tracxn - D2C Annual Funding Reports
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
        SEED: { p25: 80, median: 150, p75: 300, topDecile: 550 },
        SERIES_A: { p25: 60, median: 120, p75: 200, topDecile: 380 },
        SERIES_B: { p25: 40, median: 80, p75: 150, topDecile: 260 },
      },
      thresholds: { exceptional: 150, good: 80, concerning: 30 },
      sectorContext: "Consumer brands can grow explosively with viral moments. Consistency matters more than peaks.",
      source: "Houlihan Lokey Q4 2024 E-Commerce Report - growth rates by stage",
    },
    {
      name: "Contribution Margin",
      unit: "%",
      description: "Revenue - COGS - Variable costs / Revenue",
      direction: "higher_better",
      stages: {
        SEED: { p25: 22, median: 35, p75: 48, topDecile: 62 },
        SERIES_A: { p25: 28, median: 42, p75: 55, topDecile: 68 },
        SERIES_B: { p25: 32, median: 46, p75: 58, topDecile: 72 },
      },
      thresholds: { exceptional: 50, good: 35, concerning: 18 },
      sectorContext: "Must cover CAC within first order for healthy D2C. Negative contribution = unsustainable.",
      source: "Triple Whale Ecommerce Benchmarks 2024 - contribution margin by category",
    },
    {
      name: "CAC",
      unit: "$",
      description: "Customer acquisition cost (blended)",
      direction: "lower_better",
      stages: {
        SEED: { p25: 78, median: 66, p75: 53, topDecile: 35 },
        SERIES_A: { p25: 75, median: 63, p75: 50, topDecile: 32 },
        SERIES_B: { p25: 72, median: 60, p75: 48, topDecile: 30 },
      },
      thresholds: { exceptional: 53, good: 66, concerning: 91 },
      sectorContext: "By category: Food/Bev $53, Fashion $66, Beauty $61, Jewelry $91.",
      source: "First Page Sage - Average CAC for eCommerce Companies: 2026 Edition (80+ clients data)",
    },
    {
      name: "LTV/CAC Ratio",
      unit: "x",
      description: "Customer lifetime value / acquisition cost",
      direction: "higher_better",
      stages: {
        SEED: { p25: 2.0, median: 3.0, p75: 4.0, topDecile: 5.0 },
        SERIES_A: { p25: 2.5, median: 3.0, p75: 4.0, topDecile: 5.5 },
        SERIES_B: { p25: 3.0, median: 3.5, p75: 4.5, topDecile: 6.0 },
      },
      thresholds: { exceptional: 4, good: 3, concerning: 2 },
      sectorContext: "Industry standard is 3:1. Below 3:1 signals ineffective acquisition.",
      source: "First Page Sage 2026, Geckoboard - LTV:CAC ratio industry standards",
    },
    {
      name: "Repeat Purchase Rate",
      unit: "%",
      description: "% of customers who make 2+ purchases within 12 months",
      direction: "higher_better",
      stages: {
        SEED: { p25: 15, median: 25, p75: 30, topDecile: 40 },
        SERIES_A: { p25: 20, median: 28, p75: 35, topDecile: 45 },
        SERIES_B: { p25: 25, median: 30, p75: 40, topDecile: 50 },
      },
      thresholds: { exceptional: 40, good: 28, concerning: 15 },
      sectorContext: "Avg 28.2%. By category: Grocery 40-65%, Pet 30%+, Fashion 25-26%, Luxury 9.9%.",
      source: "MobiLoud - Repeat Customer Rate Ecommerce Benchmarks 2025",
    },
  ],
  secondaryMetrics: [
    {
      name: "ROAS",
      unit: "x",
      description: "Return on Ad Spend",
      direction: "higher_better",
      stages: {
        SEED: { p25: 1.5, median: 2.0, p75: 3.0, topDecile: 4.0 },
        SERIES_A: { p25: 1.8, median: 2.2, p75: 3.2, topDecile: 4.5 },
        SERIES_B: { p25: 2.0, median: 2.5, p75: 3.5, topDecile: 5.0 },
      },
      thresholds: { exceptional: 4, good: 2, concerning: 1.5 },
      sectorContext: "Median ROAS 2024: 2.04 across 30K brands. 'Good' ROAS depends on margins.",
      source: "Triple Whale - 2024 in Review: Ad Performance Metrics for 30K Ecommerce Brands",
    },
    {
      name: "Average Order Value",
      unit: "$",
      description: "Average value per order",
      direction: "higher_better",
      stages: {
        SEED: { p25: 50, median: 75, p75: 120, topDecile: 165 },
        SERIES_A: { p25: 60, median: 88, p75: 140, topDecile: 180 },
        SERIES_B: { p25: 70, median: 95, p75: 150, topDecile: 200 },
      },
      thresholds: { exceptional: 140, good: 88, concerning: 50 },
      sectorContext: "By category: Health/Beauty $164, Home/Garden $146, Fashion $88, Pet $73.",
      source: "Triple Whale - AOV by Industry 2024",
    },
    {
      name: "Returning Customer Revenue %",
      unit: "%",
      description: "% of revenue from returning customers",
      direction: "higher_better",
      stages: {
        SEED: { p25: 20, median: 30, p75: 40, topDecile: 60 },
        SERIES_A: { p25: 25, median: 35, p75: 45, topDecile: 70 },
        SERIES_B: { p25: 30, median: 40, p75: 50, topDecile: 80 },
      },
      thresholds: { exceptional: 50, good: 35, concerning: 20 },
      sectorContext: "Healthy brands: 30-40% revenue from returning customers. 100% new = retention problem.",
      source: "Triple Whale - Ecommerce Metrics Guide",
    },
  ],
  exitMultiples: {
    low: 1,
    median: 3,
    high: 8,
    topDecile: 15,
    typicalAcquirers: ["P&G", "Unilever", "L'Oréal", "Nestlé", "Amazon", "Walmart", "Private Equity"],
    recentExits: [
      // Note: Multiples not always disclosed - using estimates where available
      { company: "Dr. Squatch", acquirer: "Unilever", multiple: 0, year: 2025 }, // $1.5B - multiple not public
      { company: "Dollar Shave Club", acquirer: "Unilever", multiple: 5, year: 2016 }, // $1B / ~$200M rev = ~5x
      { company: "Native", acquirer: "P&G", multiple: 0, year: 2017 }, // $100M - revenue not disclosed
    ],
  },
  unitEconomicsFormulas: [
    { name: "Payback Period", formula: "CAC / (AOV × Contribution Margin × Orders/Year)", benchmark: { good: 12, excellent: 6 } },
    { name: "First Order Profit", formula: "AOV × Contribution Margin - CAC", benchmark: { good: 0, excellent: 15 } },
    { name: "Cohort LTV", formula: "Sum of (Contribution Margin × Orders) over customer lifetime", benchmark: { good: 100, excellent: 250 } },
  ],
  redFlagRules: [
    { metric: "LTV/CAC Ratio", condition: "below", threshold: 2, severity: "critical", reason: "LTV/CAC < 2x signals ineffective acquisition (First Page Sage)" },
    { metric: "Repeat Purchase Rate", condition: "below", threshold: 15, severity: "critical", reason: "Repeat rate < 15% is below ecommerce floor (MobiLoud 2025)" },
    { metric: "Contribution Margin", condition: "below", threshold: 15, severity: "major", reason: "Contribution < 15% = no path to profitability" },
    { metric: "CAC", condition: "above", threshold: 100, severity: "major", reason: "CAC > $100 exceeds top decile for most consumer categories" },
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
  "AI": AI_BENCHMARKS,
  "AI/ML": AI_BENCHMARKS,
  "Machine Learning": AI_BENCHMARKS,
  "LLM": AI_BENCHMARKS,
  "GenAI": AI_BENCHMARKS,
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
