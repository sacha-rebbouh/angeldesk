/**
 * Sector Standards - Normes etablies et regles stables
 *
 * CE FICHIER CONTIENT UNIQUEMENT:
 * - Formules d'unit economics (standards de l'industrie)
 * - Seuils de red flags (regles etablies)
 * - Descriptions et contexte sectoriel
 * - Direction des metriques (higher_better, etc.)
 *
 * CE FICHIER NE CONTIENT PAS:
 * - Percentiles de marche (P25/median/P75) -> Recherche web obligatoire
 * - Exits recents -> Recherche web obligatoire
 * - Multiples de valorisation actuels -> Recherche web obligatoire
 * - Donnees datees ou non verifiables -> Recherche web obligatoire
 *
 * PHILOSOPHIE:
 * - Une norme etablie = une regle qui ne change pas significativement d'annee en annee
 * - Une donnee de marche = doit etre recherchee en temps reel
 * - En cas de doute = recherche web
 */

// ============================================================================
// TYPES
// ============================================================================

export interface MetricDefinition {
  name: string;
  unit: string;
  description: string;
  direction: "higher_better" | "lower_better" | "target_range";
  targetRange?: { min: number; max: number };
  /** Pourquoi cette metrique compte dans ce secteur */
  sectorContext: string;
  /** Mots-cles pour recherche web de benchmarks */
  searchKeywords: string[];
}

export interface RedFlagRule {
  metric: string;
  condition: "below" | "above";
  threshold: number;
  severity: "critical" | "major" | "minor";
  reason: string;
  /** Source de cette regle (standard industrie, etude, etc.) */
  source: string;
}

export interface UnitEconomicsFormula {
  name: string;
  formula: string;
  description: string;
  /** Seuils standards (etablis par l'industrie) */
  thresholds: {
    concerning: number | string;
    good: number | string;
    excellent: number | string;
  };
  source: string;
}

export interface SectorStandards {
  sector: string;
  aliases: string[];

  /** Metriques primaires a evaluer */
  primaryMetrics: MetricDefinition[];

  /** Metriques secondaires */
  secondaryMetrics: MetricDefinition[];

  /** Formules d'unit economics avec seuils standards */
  unitEconomicsFormulas: UnitEconomicsFormula[];

  /** Regles de red flags automatiques */
  redFlagRules: RedFlagRule[];

  /** Risques specifiques au secteur (qualitatifs, stables) */
  sectorRisks: string[];

  /** Patterns de succes du secteur (qualitatifs, stables) */
  successPatterns: string[];

  /** Acquéreurs typiques (relativement stable) */
  typicalAcquirers: string[];

  /** Questions de recherche pour benchmarks dynamiques */
  benchmarkSearchQueries: string[];
}

// ============================================================================
// SAAS B2B STANDARDS
// ============================================================================

export const SAAS_STANDARDS: SectorStandards = {
  sector: "SaaS B2B",
  aliases: ["SaaS", "B2B SaaS", "Software as a Service"],

  primaryMetrics: [
    {
      name: "Net Revenue Retention (NRR)",
      unit: "%",
      description: "Revenue from existing customers after churn and expansion",
      direction: "higher_better",
      sectorContext: "NRR > 100% means growth without new customers. Best-in-class SaaS: NRR > 120%. The most important SaaS metric.",
      searchKeywords: ["SaaS NRR benchmark", "net revenue retention median", "NRR by stage seed series A"],
    },
    {
      name: "ARR Growth YoY",
      unit: "%",
      description: "Year-over-year annual recurring revenue growth",
      direction: "higher_better",
      sectorContext: "T2D3 (triple twice, double thrice) is aspirational. Growth naturally declines with scale.",
      searchKeywords: ["SaaS ARR growth benchmark", "SaaS growth rate by stage", "median ARR growth seed"],
    },
    {
      name: "Gross Margin",
      unit: "%",
      description: "Revenue minus cost of goods sold",
      direction: "higher_better",
      sectorContext: "True SaaS should have 70%+ gross margin. < 65% often indicates services dependency.",
      searchKeywords: ["SaaS gross margin benchmark", "software gross margin median"],
    },
    {
      name: "CAC Payback",
      unit: "months",
      description: "Months to recover customer acquisition cost",
      direction: "lower_better",
      sectorContext: "< 18 months is healthy. > 24 months requires strong NRR to compensate.",
      searchKeywords: ["SaaS CAC payback benchmark", "CAC payback months median"],
    },
    {
      name: "LTV/CAC Ratio",
      unit: "x",
      description: "Customer lifetime value divided by acquisition cost",
      direction: "higher_better",
      sectorContext: "3x is the minimum for sustainable unit economics. < 2x means losing money on growth.",
      searchKeywords: ["LTV CAC ratio benchmark SaaS", "LTV to CAC median"],
    },
  ],

  secondaryMetrics: [
    {
      name: "Rule of 40",
      unit: "%",
      description: "Growth rate + profit margin",
      direction: "higher_better",
      sectorContext: "Growth + Margin >= 40%. High growth can compensate for negative margins early.",
      searchKeywords: ["Rule of 40 benchmark", "SaaS rule of 40 median"],
    },
    {
      name: "Magic Number",
      unit: "x",
      description: "Net new ARR / S&M spend (previous quarter)",
      direction: "higher_better",
      sectorContext: "> 1.0 means efficient S&M spend. < 0.5 indicates GTM inefficiency.",
      searchKeywords: ["SaaS magic number benchmark", "sales efficiency magic number"],
    },
    {
      name: "Burn Multiple",
      unit: "x",
      description: "Net burn / Net new ARR",
      direction: "lower_better",
      sectorContext: "How much cash burned per $ of new ARR. < 2x is efficient, > 3x is concerning.",
      searchKeywords: ["burn multiple benchmark", "SaaS burn multiple median"],
    },
    {
      name: "Logo Churn Rate",
      unit: "%",
      description: "Annual customer logo churn",
      direction: "lower_better",
      sectorContext: "SMB: 15-20% acceptable. Enterprise: should be < 8%.",
      searchKeywords: ["SaaS churn rate benchmark", "logo churn by segment"],
    },
  ],

  unitEconomicsFormulas: [
    {
      name: "LTV",
      formula: "ARPA x Gross Margin x (1 / Churn Rate)",
      description: "Customer Lifetime Value",
      thresholds: { concerning: "< CAC", good: "> 3x CAC", excellent: "> 5x CAC" },
      source: "Industry standard formula",
    },
    {
      name: "CAC Payback",
      formula: "CAC / (ARPA x Gross Margin)",
      description: "Months to recover acquisition cost",
      thresholds: { concerning: "> 24 months", good: "< 18 months", excellent: "< 12 months" },
      source: "Industry standard formula",
    },
    {
      name: "Burn Multiple",
      formula: "Net Burn / Net New ARR",
      description: "Capital efficiency metric",
      thresholds: { concerning: "> 3x", good: "< 2x", excellent: "< 1x" },
      source: "David Sacks (Craft Ventures) framework",
    },
    {
      name: "Magic Number",
      formula: "Net New ARR / S&M Spend (previous quarter)",
      description: "Sales & Marketing efficiency",
      thresholds: { concerning: "< 0.5", good: "> 0.75", excellent: "> 1.0" },
      source: "Scale Venture Partners framework",
    },
    {
      name: "Rule of 40",
      formula: "Revenue Growth % + EBITDA Margin %",
      description: "Balance between growth and profitability",
      thresholds: { concerning: "< 20", good: "> 40", excellent: "> 60" },
      source: "Brad Feld / Bessemer framework",
    },
  ],

  redFlagRules: [
    {
      metric: "NRR",
      condition: "below",
      threshold: 90,
      severity: "critical",
      reason: "NRR < 90% indicates fundamental product-market fit issues - customers are leaving faster than expanding",
      source: "Industry consensus - sub-90% NRR is a major concern for SaaS investors",
    },
    {
      metric: "CAC Payback",
      condition: "above",
      threshold: 30,
      severity: "critical",
      reason: "CAC payback > 30 months is unsustainable - requires too much capital to grow",
      source: "Industry consensus - 18-24 months is acceptable, > 30 is a red flag",
    },
    {
      metric: "Gross Margin",
      condition: "below",
      threshold: 60,
      severity: "major",
      reason: "Gross margin < 60% suggests heavy services dependency or infrastructure costs - not true SaaS economics",
      source: "Industry consensus - true SaaS should be 70%+, < 60% raises questions",
    },
    {
      metric: "Burn Multiple",
      condition: "above",
      threshold: 3,
      severity: "major",
      reason: "Burn multiple > 3x means inefficient capital deployment - burning $3+ for every $1 of new ARR",
      source: "David Sacks Burn Multiple framework",
    },
    {
      metric: "LTV/CAC",
      condition: "below",
      threshold: 2,
      severity: "major",
      reason: "LTV/CAC < 2x means unit economics don't work - losing money on each customer",
      source: "Industry consensus - 3x is healthy, < 2x is concerning",
    },
  ],

  sectorRisks: [
    "Customer concentration: Top 10 customers > 50% of revenue",
    "High churn in early cohorts: First-year cohorts churning > 30%",
    "Services dependency: Professional services > 20% of revenue",
    "Long sales cycles: > 6 months for target segment",
    "Platform risk: Heavy dependency on Salesforce/AWS/Google ecosystem",
    "Competition from incumbents: SAP/Oracle/Microsoft entering the space",
    "Feature parity race: Competitors matching features quickly",
    "SMB focus without expansion path: Low ACV with no upsell potential",
  ],

  successPatterns: [
    "Net negative churn: NRR > 120% driven by expansion",
    "Product-led growth: Viral/self-serve acquisition reducing CAC",
    "Land and expand: Small initial deals growing 3-5x over time",
    "Category creation: Defining a new software category",
    "Deep integrations: Becoming embedded in customer workflows",
    "Strong NPS: > 50 indicating genuine customer love",
    "Efficient GTM: Magic number > 1.0 showing sales efficiency",
    "Multi-product: Second product adding to NRR",
  ],

  typicalAcquirers: [
    "Salesforce", "Microsoft", "SAP", "Oracle", "Adobe",
    "ServiceNow", "Workday", "Intuit", "HubSpot",
    "Private Equity (Thoma Bravo, Vista, Silver Lake)",
  ],

  benchmarkSearchQueries: [
    "SaaS benchmarks {current_year} seed series A median",
    "OpenView SaaS benchmarks report {current_year}",
    "KeyBanc SaaS survey {current_year} metrics",
    "SaaS ARR growth benchmarks by stage {current_year}",
    "SaaS NRR median {current_year}",
    "SaaS exit multiples {current_year}",
    "Recent SaaS acquisitions {current_year} multiples",
  ],
};

// ============================================================================
// FINTECH STANDARDS
// ============================================================================

export const FINTECH_STANDARDS: SectorStandards = {
  sector: "Fintech",
  aliases: ["Financial Technology", "Financial Services Tech"],

  primaryMetrics: [
    {
      name: "Total Payment Volume (TPV)",
      unit: "$M",
      description: "Total value of transactions processed",
      direction: "higher_better",
      sectorContext: "TPV is the north star for payments companies. Revenue = TPV x Take Rate.",
      searchKeywords: ["fintech TPV benchmark", "payment volume by stage"],
    },
    {
      name: "Take Rate",
      unit: "%",
      description: "Net revenue as percentage of transaction volume",
      direction: "higher_better",
      targetRange: { min: 0.5, max: 5 },
      sectorContext: "Card networks: 0.1-0.3%. PSPs: 0.5-2%. PayFacs: 1-3%. Embedded: 2-5%.",
      searchKeywords: ["fintech take rate benchmark", "payment take rate by segment"],
    },
    {
      name: "Net Interest Margin (NIM)",
      unit: "%",
      description: "Interest income minus interest expense / assets (lending)",
      direction: "higher_better",
      sectorContext: "Traditional banks: 2.5-3.5%. Fintech lenders: 6-12%. Higher NIM = higher risk profile.",
      searchKeywords: ["fintech NIM benchmark", "lending net interest margin"],
    },
    {
      name: "Default Rate",
      unit: "%",
      description: "Percentage of loans in default (30+ days)",
      direction: "lower_better",
      sectorContext: "Prime: < 2%. Near-prime: 3-6%. Subprime: 8-15%. Must compare to portfolio risk profile.",
      searchKeywords: ["fintech default rate benchmark", "lending default rates by segment"],
    },
    {
      name: "Fraud Rate",
      unit: "%",
      description: "Fraudulent transactions as % of volume",
      direction: "lower_better",
      sectorContext: "Industry average CNP fraud: 0.1-0.15%. > 0.3% indicates weak controls.",
      searchKeywords: ["payment fraud rate benchmark", "CNP fraud rate industry average"],
    },
  ],

  secondaryMetrics: [
    {
      name: "Cost per Transaction",
      unit: "$",
      description: "Fully loaded cost to process one transaction",
      direction: "lower_better",
      sectorContext: "Must be significantly lower than revenue per transaction for positive economics.",
      searchKeywords: ["payment processing cost benchmark", "transaction cost fintech"],
    },
    {
      name: "Customer Acquisition Cost",
      unit: "$",
      description: "Cost to acquire one customer",
      direction: "lower_better",
      sectorContext: "B2C fintech CAC: $30-80 typical. B2B can be higher if ACV justifies it.",
      searchKeywords: ["fintech CAC benchmark", "neobank customer acquisition cost"],
    },
    {
      name: "Regulatory Capital Ratio",
      unit: "%",
      description: "Capital reserves / Risk-weighted assets",
      direction: "higher_better",
      sectorContext: "Basel III minimum CET1: 4.5%, total capital: 8%. Well-capitalized: 10%+.",
      searchKeywords: ["fintech capital requirements", "Basel III capital ratios"],
    },
  ],

  unitEconomicsFormulas: [
    {
      name: "Revenue per Transaction",
      formula: "TPV x Take Rate / Number of Transactions",
      description: "Average revenue generated per transaction",
      thresholds: { concerning: "< $0.20", good: "> $0.50", excellent: "> $1.50" },
      source: "Industry standard",
    },
    {
      name: "Contribution Margin",
      formula: "(Revenue - Variable Costs) / Revenue",
      description: "Margin after variable costs (interchange, processing)",
      thresholds: { concerning: "< 30%", good: "> 40%", excellent: "> 60%" },
      source: "Industry standard",
    },
    {
      name: "Loss Reserve Ratio",
      formula: "Loss Reserves / Total Loans Outstanding",
      description: "Provision for expected losses",
      thresholds: { concerning: "> 8%", good: "< 5%", excellent: "< 3%" },
      source: "Banking industry standard",
    },
  ],

  redFlagRules: [
    {
      metric: "Default Rate",
      condition: "above",
      threshold: 10,
      severity: "critical",
      reason: "Default rate > 10% indicates broken underwriting model",
      source: "Lending industry consensus - double-digit defaults unsustainable",
    },
    {
      metric: "Fraud Rate",
      condition: "above",
      threshold: 0.3,
      severity: "critical",
      reason: "Fraud > 0.3% suggests weak KYC/AML controls - 2x+ industry average",
      source: "Nilson Report industry benchmarks",
    },
    {
      metric: "Take Rate",
      condition: "below",
      threshold: 0.3,
      severity: "major",
      reason: "Take rate < 0.3% requires massive scale to be viable",
      source: "Unit economics analysis - need huge TPV at low take rates",
    },
    {
      metric: "Regulatory Capital Ratio",
      condition: "below",
      threshold: 8,
      severity: "critical",
      reason: "Below Basel III minimums - license at risk",
      source: "Basel III regulatory requirements",
    },
  ],

  sectorRisks: [
    "Regulatory risk: License revocation, new compliance requirements",
    "Partner bank dependency: Sponsor bank relationship at risk",
    "Interest rate exposure: NIM compression in rate environment changes",
    "Fraud concentration: Single fraud vector can wipe out margins",
    "Credit cycle risk: Recession impact on default rates",
    "Compliance costs: KYC/AML/BSA costs scaling faster than revenue",
    "Big bank competition: JPM/Goldman entering fintech segments",
    "Crypto regulatory uncertainty: Unclear regulatory framework",
  ],

  successPatterns: [
    "Banking license or charter: Own license vs sponsor bank dependency",
    "Embedded finance: B2B2C model with lower CAC",
    "Vertical specialization: Deep expertise in specific industry (healthcare, real estate)",
    "Multiple revenue streams: Interchange + interest + fees",
    "Strong credit data moat: Proprietary underwriting data",
    "Regulatory relationships: Proactive regulator engagement",
    "Low-cost deposits: Checking accounts funding lending",
    "Cross-sell engine: Multiple products per customer",
  ],

  typicalAcquirers: [
    "JPMorgan", "Goldman Sachs", "Visa", "Mastercard",
    "PayPal", "Block", "Fiserv", "FIS", "Global Payments",
  ],

  benchmarkSearchQueries: [
    "fintech benchmarks {current_year}",
    "payment processing take rate {current_year}",
    "neobank unit economics {current_year}",
    "fintech default rates {current_year}",
    "recent fintech acquisitions {current_year} multiples",
    "a16z fintech benchmarks {current_year}",
  ],
};

// ============================================================================
// MARKETPLACE STANDARDS
// ============================================================================

export const MARKETPLACE_STANDARDS: SectorStandards = {
  sector: "Marketplace",
  aliases: ["Two-sided Marketplace", "Platform"],

  primaryMetrics: [
    {
      name: "GMV Growth YoY",
      unit: "%",
      description: "Year-over-year gross merchandise volume growth",
      direction: "higher_better",
      sectorContext: "GMV growth > revenue growth is expected early (take rate expansion). Later, they should converge.",
      searchKeywords: ["marketplace GMV growth benchmark", "marketplace growth by stage"],
    },
    {
      name: "Take Rate",
      unit: "%",
      description: "Net revenue as percentage of GMV",
      direction: "higher_better",
      sectorContext: "B2C product: 10-20%. B2B: 5-15%. Services: 15-30%. Real estate: 1-3%.",
      searchKeywords: ["marketplace take rate benchmark", "platform take rate by category"],
    },
    {
      name: "Liquidity Score",
      unit: "%",
      description: "% of listings that result in transactions within 30 days",
      direction: "higher_better",
      sectorContext: "Measures marketplace health. < 15% = chicken-and-egg problem. > 50% = strong network effects.",
      searchKeywords: ["marketplace liquidity benchmark", "platform liquidity score"],
    },
    {
      name: "Repeat Rate",
      unit: "%",
      description: "% of transactions from repeat buyers (monthly)",
      direction: "higher_better",
      sectorContext: "High repeat = habitual usage. Low repeat might be OK for high-value infrequent purchases.",
      searchKeywords: ["marketplace repeat rate benchmark", "buyer retention rate marketplace"],
    },
    {
      name: "Buyer CAC",
      unit: "$",
      description: "Cost to acquire one active buyer",
      direction: "lower_better",
      sectorContext: "Must be < first transaction contribution. Viral marketplaces achieve CAC < $5.",
      searchKeywords: ["marketplace CAC benchmark", "buyer acquisition cost platform"],
    },
  ],

  secondaryMetrics: [
    {
      name: "Supply/Demand Ratio",
      unit: "x",
      description: "Active sellers per active buyer",
      direction: "target_range",
      targetRange: { min: 0.1, max: 5 },
      sectorContext: "Too low = supply constrained. Too high = demand constrained. Optimal varies by category.",
      searchKeywords: ["marketplace supply demand ratio", "platform balance metrics"],
    },
    {
      name: "Average Order Value (AOV)",
      unit: "$",
      description: "Average transaction value",
      direction: "higher_better",
      sectorContext: "Higher AOV = easier unit economics but longer sales cycles. Must match category norms.",
      searchKeywords: ["marketplace AOV benchmark", "average order value by category"],
    },
  ],

  unitEconomicsFormulas: [
    {
      name: "Buyer LTV",
      formula: "AOV x Take Rate x Purchases/Year x Lifespan (years)",
      description: "Lifetime value of a buyer",
      thresholds: { concerning: "< $50", good: "> $100", excellent: "> $300" },
      source: "Industry standard formula",
    },
    {
      name: "Contribution per Transaction",
      formula: "AOV x Take Rate - Fulfillment Costs",
      description: "Net margin per transaction",
      thresholds: { concerning: "< $2", good: "> $5", excellent: "> $15" },
      source: "Industry standard formula",
    },
    {
      name: "Payback Months",
      formula: "CAC / (Monthly GMV per Buyer x Take Rate x Margin)",
      description: "Months to recover buyer acquisition cost",
      thresholds: { concerning: "> 12", good: "< 6", excellent: "< 3" },
      source: "Industry standard formula",
    },
  ],

  redFlagRules: [
    {
      metric: "Liquidity Score",
      condition: "below",
      threshold: 10,
      severity: "critical",
      reason: "Liquidity < 10% means marketplace isn't working - supply isn't meeting demand",
      source: "NfX Network Effects framework",
    },
    {
      metric: "Take Rate",
      condition: "below",
      threshold: 3,
      severity: "major",
      reason: "Take rate < 3% requires enormous scale to build a business",
      source: "Bill Gurley 'A Rake Too Far' framework",
    },
    {
      metric: "Repeat Rate",
      condition: "below",
      threshold: 10,
      severity: "major",
      reason: "Repeat < 10% indicates no stickiness - one-time usage marketplace",
      source: "a16z Marketplace 100 analysis",
    },
    {
      metric: "Supply/Demand Ratio",
      condition: "below",
      threshold: 0.1,
      severity: "critical",
      reason: "Severe supply constraint - marketplace cannot scale without more suppliers",
      source: "NfX marketplace balance framework",
    },
  ],

  sectorRisks: [
    "Chicken-and-egg problem: Can't grow supply without demand and vice versa",
    "Disintermediation: Buyers and sellers transacting off-platform",
    "Multi-homing: Sellers listing on multiple platforms",
    "Regulatory classification: Worker classification issues (gig economy)",
    "Trust & safety costs: Fraud, disputes, content moderation",
    "Geographic fragmentation: Need to win market by market",
    "Winner-take-most dynamics: Network effects favor dominant player",
    "Vertical integration by suppliers: Large sellers going direct",
  ],

  successPatterns: [
    "Managed marketplace: Adding services layer increases take rate and defensibility",
    "SaaS for suppliers: Tooling that locks in supply side",
    "Payments integration: Capturing payment flow increases take rate",
    "Vertical focus: Deep in one category before expanding",
    "Demand aggregation: Solving demand problem first (buyers)",
    "Trust mechanisms: Reviews, guarantees, escrow building confidence",
    "Network effects: Each new user makes platform more valuable",
    "Data moat: Proprietary data improving matching over time",
  ],

  typicalAcquirers: [
    "Amazon", "eBay", "Uber", "DoorDash", "Booking Holdings",
    "Expedia", "Etsy", "Airbnb", "Private Equity",
  ],

  benchmarkSearchQueries: [
    "marketplace benchmarks {current_year}",
    "a16z marketplace 100 {current_year}",
    "marketplace take rate by category {current_year}",
    "marketplace GMV growth benchmarks {current_year}",
    "recent marketplace acquisitions {current_year}",
  ],
};

// ============================================================================
// AI/ML STANDARDS
// ============================================================================

export const AI_STANDARDS: SectorStandards = {
  sector: "AI/ML",
  aliases: ["Artificial Intelligence", "Machine Learning", "GenAI", "LLM"],

  primaryMetrics: [
    {
      name: "Gross Margin",
      unit: "%",
      description: "Revenue minus inference/compute costs",
      direction: "higher_better",
      sectorContext: "AI gross margins under pressure from inference costs. API wrappers: 30-50%. Fine-tuned: 50-70%. Proprietary: 70-85%.",
      searchKeywords: ["AI startup gross margin benchmark", "LLM inference cost margins"],
    },
    {
      name: "Inference Cost per Query",
      unit: "$",
      description: "Average cost per inference/API call",
      direction: "lower_better",
      sectorContext: "GPT-4: ~$0.03-0.06/query. Claude: ~$0.015-0.03. Fine-tuned smaller models: $0.001-0.005.",
      searchKeywords: ["LLM inference cost benchmark", "AI API cost comparison {current_year}"],
    },
    {
      name: "API Dependency",
      unit: "%",
      description: "Percentage of core functionality dependent on third-party AI APIs",
      direction: "lower_better",
      sectorContext: "100% API dependency = no moat, margin squeeze risk. Some API use is fine. Full dependency is red flag.",
      searchKeywords: ["AI startup moat analysis", "API wrapper vs proprietary model"],
    },
    {
      name: "Data Moat Score",
      unit: "score",
      description: "Proprietary data defensibility (qualitative 0-100)",
      direction: "higher_better",
      sectorContext: "Public data = 0. Licensed exclusive = 30-50. Proprietary generated = 50-80. Self-improving = 80+.",
      searchKeywords: ["AI startup data moat", "data flywheel AI companies"],
    },
  ],

  secondaryMetrics: [
    {
      name: "Model Latency P99",
      unit: "ms",
      description: "99th percentile inference latency",
      direction: "lower_better",
      sectorContext: "Real-time apps need <500ms. Async workflows tolerate 2-5s. Batch: latency irrelevant.",
      searchKeywords: ["LLM latency benchmarks", "AI inference latency requirements"],
    },
    {
      name: "Reproducibility Risk",
      unit: "score",
      description: "How easily can this be replicated (0=hard, 100=trivial)",
      direction: "lower_better",
      sectorContext: "GPT wrapper = 90+. RAG system = 50-70. Fine-tuned = 30-50. Novel architecture = 10-20.",
      searchKeywords: ["AI startup defensibility", "AI moat analysis framework"],
    },
  ],

  unitEconomicsFormulas: [
    {
      name: "Cost per Inference",
      formula: "(GPU Cost + API Costs + Bandwidth) / Total Queries",
      description: "Fully loaded cost per AI query",
      thresholds: { concerning: "> $0.02", good: "< $0.005", excellent: "< $0.001" },
      source: "a16z AI cost analysis",
    },
    {
      name: "Gross Margin",
      formula: "(Revenue - Inference Costs) / Revenue",
      description: "Margin after compute costs",
      thresholds: { concerning: "< 40%", good: "> 60%", excellent: "> 75%" },
      source: "AI company financial analysis",
    },
    {
      name: "Data Flywheel Score",
      formula: "User Growth Rate x Data Quality x Feedback Loop Speed",
      description: "Strength of data compounding advantage",
      thresholds: { concerning: "< 30", good: "> 50", excellent: "> 80" },
      source: "Proprietary framework",
    },
  ],

  redFlagRules: [
    {
      metric: "API Dependency",
      condition: "above",
      threshold: 90,
      severity: "critical",
      reason: "90%+ API dependency = thin wrapper, no moat, margin squeeze inevitable",
      source: "a16z AI Playbook - 'thin wrapper' warning",
    },
    {
      metric: "Gross Margin",
      condition: "below",
      threshold: 40,
      severity: "critical",
      reason: "Gross margin < 40% indicates unsustainable unit economics for AI",
      source: "AI business model analysis",
    },
    {
      metric: "Data Moat Score",
      condition: "below",
      threshold: 20,
      severity: "major",
      reason: "No proprietary data = competing on execution only, very risky",
      source: "AI defensibility framework",
    },
  ],

  sectorRisks: [
    "Thin wrapper risk: Just calling GPT-4 with no differentiation",
    "Margin compression: Inference costs eating margins",
    "Foundation model dependency: OpenAI/Anthropic can deprecate APIs",
    "Commoditization: Rapidly improving open-source models",
    "Big Tech competition: Google/Microsoft/Meta can replicate",
    "Talent concentration: Key ML engineers can leave",
    "Data quality degradation: Training on AI-generated content",
    "Regulatory uncertainty: AI Act, copyright, liability",
    "Hallucination liability: Factual errors in critical applications",
    "Compute cost scaling: Inference costs may not decrease as expected",
  ],

  successPatterns: [
    "Proprietary model: Custom architecture, not just fine-tuned GPT",
    "Data flywheel: User interactions improving model over time",
    "Vertical specialization: Deep domain (legal, medical, code)",
    "End-to-end workflow: AI embedded in complete solution",
    "Hardware optimization: Custom inference reducing costs",
    "Enterprise lock-in: Integration depth creating switching costs",
    "Research talent: PhD-level team with publications",
    "Compute efficiency: Better performance per dollar than competitors",
  ],

  typicalAcquirers: [
    "Google", "Microsoft", "Meta", "Apple", "Amazon",
    "NVIDIA", "Salesforce", "ServiceNow", "Databricks",
  ],

  benchmarkSearchQueries: [
    "AI startup benchmarks {current_year}",
    "LLM inference cost trends {current_year}",
    "AI startup gross margins {current_year}",
    "GenAI company valuations {current_year}",
    "AI acquisitions {current_year} multiples",
    "a16z AI infrastructure report {current_year}",
  ],
};

// ============================================================================
// HEALTHTECH STANDARDS
// ============================================================================

export const HEALTHTECH_STANDARDS: SectorStandards = {
  sector: "HealthTech",
  aliases: ["Digital Health", "Healthcare Technology", "MedTech"],

  primaryMetrics: [
    {
      name: "Clinical Outcomes Improvement",
      unit: "%",
      description: "Measurable improvement in clinical outcomes vs baseline",
      direction: "higher_better",
      sectorContext: "Must be statistically significant. Required for value-based contracts and FDA claims.",
      searchKeywords: ["digital health outcomes benchmark", "DTx clinical improvement rates"],
    },
    {
      name: "Provider Adoption Rate",
      unit: "%",
      description: "% of targeted providers actively using product",
      direction: "higher_better",
      sectorContext: "Slow adoption is normal in healthcare. 3-5% monthly growth is strong.",
      searchKeywords: ["health IT adoption benchmarks", "digital health provider adoption"],
    },
    {
      name: "Gross Margin",
      unit: "%",
      description: "Revenue minus cost of goods sold",
      direction: "higher_better",
      sectorContext: "Pure software: 70%+. With clinical staff: 35-55%. Device + services: 45-65%.",
      searchKeywords: ["healthtech gross margin benchmark", "digital health unit economics"],
    },
    {
      name: "Sales Cycle",
      unit: "months",
      description: "Average time from first contact to signed contract",
      direction: "lower_better",
      sectorContext: "Health systems: 12-24 months. Clinics: 3-6 months. D2C: < 2 months.",
      searchKeywords: ["healthcare sales cycle benchmark", "health IT sales cycle length"],
    },
  ],

  secondaryMetrics: [
    {
      name: "Patient Retention",
      unit: "%",
      description: "% of patients still active after 12 months",
      direction: "higher_better",
      sectorContext: "Chronic conditions: should be 65%+. Acute: lower is OK. Engagement drives outcomes.",
      searchKeywords: ["digital health retention benchmark", "patient engagement retention rates"],
    },
    {
      name: "Reimbursement Rate",
      unit: "%",
      description: "% of claims successfully reimbursed",
      direction: "higher_better",
      sectorContext: "CPT codes secured = higher rates. No codes = out-of-pocket only = smaller TAM.",
      searchKeywords: ["digital health reimbursement rates", "telehealth reimbursement benchmark"],
    },
  ],

  unitEconomicsFormulas: [
    {
      name: "Revenue per Patient",
      formula: "Total Revenue / Active Patients",
      description: "Average revenue generated per patient",
      thresholds: { concerning: "< $200/year", good: "> $500/year", excellent: "> $1500/year" },
      source: "Rock Health analysis",
    },
    {
      name: "Cost per Outcome",
      formula: "Total Costs / Patients with Improved Outcomes",
      description: "Cost to achieve one positive clinical outcome",
      thresholds: { concerning: "> $2000", good: "< $1000", excellent: "< $500" },
      source: "Health economics standard",
    },
    {
      name: "Implementation ROI",
      formula: "(Savings Generated - Implementation Cost) / Implementation Cost",
      description: "Return on investment for health system buyer",
      thresholds: { concerning: "< 1x", good: "> 2x", excellent: "> 5x" },
      source: "Enterprise health IT analysis",
    },
  ],

  redFlagRules: [
    {
      metric: "Clinical Outcomes Improvement",
      condition: "below",
      threshold: 5,
      severity: "critical",
      reason: "No measurable outcomes = no value-based contracts, no FDA claims, hard to sell",
      source: "Digital therapeutics industry consensus",
    },
    {
      metric: "Sales Cycle",
      condition: "above",
      threshold: 24,
      severity: "major",
      reason: "Sales cycles > 24 months drain cash and limit growth - healthcare is slow but not that slow",
      source: "Healthcare sales benchmarks",
    },
    {
      metric: "Patient Retention",
      condition: "below",
      threshold: 25,
      severity: "major",
      reason: "Poor retention indicates product-market fit issues - patients not seeing value",
      source: "Digital health engagement analysis",
    },
  ],

  sectorRisks: [
    "Regulatory pathway: FDA clearance required, timeline uncertain",
    "Reimbursement uncertainty: No CPT code = limited revenue model",
    "Health system inertia: Extremely long sales cycles, change resistance",
    "EHR integration: Epic/Cerner integration required but difficult",
    "Clinical validation: Need RCTs which are expensive and slow",
    "Privacy compliance: HIPAA, state laws, international (GDPR)",
    "Provider burnout: New tools add cognitive load",
    "Incumbent competition: Epic/Cerner adding features",
  ],

  successPatterns: [
    "Clinical evidence: Published RCTs in peer-reviewed journals",
    "CPT codes secured: Reimbursement pathway established",
    "EHR integration: Deep Epic/Cerner integration",
    "Value-based contracts: Paid on outcomes, not usage",
    "Provider workflow fit: Reduces time, doesn't add burden",
    "Multi-payer support: Medicare, Medicaid, commercial all covered",
    "Patient engagement: High adherence and retention",
    "Regulatory clearance: FDA cleared/approved",
  ],

  typicalAcquirers: [
    "UnitedHealth/Optum", "CVS Health", "Cigna/Evernorth",
    "Teladoc", "Major Pharma", "Health Systems", "Private Equity",
  ],

  benchmarkSearchQueries: [
    "digital health benchmarks {current_year}",
    "Rock Health funding report {current_year}",
    "digital therapeutics outcomes benchmark",
    "healthtech exit multiples {current_year}",
    "telehealth adoption rates {current_year}",
  ],
};

// ============================================================================
// DEEPTECH STANDARDS
// ============================================================================

export const DEEPTECH_STANDARDS: SectorStandards = {
  sector: "DeepTech",
  aliases: ["Deep Technology", "Hard Tech", "Frontier Tech"],

  primaryMetrics: [
    {
      name: "Technology Readiness Level (TRL)",
      unit: "1-9",
      description: "NASA TRL scale measuring technology maturity",
      direction: "higher_better",
      sectorContext: "TRL 1-3: Research. TRL 4-6: Development/Demo. TRL 7-9: Commercial ready.",
      searchKeywords: ["TRL benchmarks by stage", "technology readiness level startup funding"],
    },
    {
      name: "R&D Efficiency",
      unit: "x",
      description: "Revenue generated per R&D dollar spent",
      direction: "higher_better",
      sectorContext: "DeepTech is R&D heavy early. Efficiency should improve post-product-market fit.",
      searchKeywords: ["deeptech R&D efficiency", "R&D to revenue ratio startups"],
    },
    {
      name: "Time to Revenue",
      unit: "months",
      description: "Months from founding to first commercial revenue",
      direction: "lower_better",
      sectorContext: "Longer timelines normal for DeepTech. > 4 years without revenue is concerning.",
      searchKeywords: ["deeptech time to commercialization", "hard tech revenue timeline"],
    },
    {
      name: "Grant Funding Secured",
      unit: "$M",
      description: "Non-dilutive grant funding (SBIR, DARPA, NSF, etc.)",
      direction: "higher_better",
      sectorContext: "Grants validate technology and extend runway. SBIR Phase II: $1-2M. DARPA: $5-50M.",
      searchKeywords: ["SBIR funding benchmarks", "deeptech non-dilutive funding"],
    },
  ],

  secondaryMetrics: [
    {
      name: "Patent Portfolio",
      unit: "count",
      description: "Number of granted patents + pending applications",
      direction: "higher_better",
      sectorContext: "IP is the moat in DeepTech. Must have defensible, broad patents.",
      searchKeywords: ["deeptech patent benchmarks", "startup patent portfolio size"],
    },
    {
      name: "Technical Team Density",
      unit: "%",
      description: "% of team with PhD or equivalent technical depth",
      direction: "higher_better",
      sectorContext: "DeepTech requires deep expertise. Density naturally decreases as company scales.",
      searchKeywords: ["deeptech team composition", "startup PhD density"],
    },
  ],

  unitEconomicsFormulas: [
    {
      name: "R&D ROI",
      formula: "Future Revenue Value / Cumulative R&D Spend",
      description: "Return on research and development investment",
      thresholds: { concerning: "< 2x", good: "> 3x", excellent: "> 10x" },
      source: "Industry standard",
    },
    {
      name: "IP Value per Employee",
      formula: "Patent Portfolio Value / Technical Employees",
      description: "Intellectual property productivity",
      thresholds: { concerning: "< $200K", good: "> $500K", excellent: "> $2M" },
      source: "IP valuation frameworks",
    },
  ],

  redFlagRules: [
    {
      metric: "Time to Revenue",
      condition: "above",
      threshold: 60,
      severity: "critical",
      reason: "> 5 years to revenue = significant execution risk, investor patience limit",
      source: "DeepTech investment analysis",
    },
    {
      metric: "TRL",
      condition: "below",
      threshold: 3,
      severity: "major",
      reason: "TRL < 3 = still in basic research phase, very high technology risk",
      source: "NASA TRL framework",
    },
    {
      metric: "Technical Team Density",
      condition: "below",
      threshold: 30,
      severity: "major",
      reason: "Insufficient technical depth for DeepTech - need domain experts",
      source: "DeepTech team analysis",
    },
  ],

  sectorRisks: [
    "Technology risk: Core science may not work at scale",
    "Long development cycles: 3-7 years to revenue typical",
    "Capital intensity: May require $50M+ before meaningful revenue",
    "Key person dependency: 1-2 technical founders critical",
    "Big Tech competition: Google/Microsoft can replicate with 100x resources",
    "IP vulnerability: Patents can be designed around",
    "Market timing: Technology ready but market not (or vice versa)",
    "Academic spin-out risks: IP assignment, university licensing conflicts",
    "Regulatory hurdles: Export controls, dual-use restrictions",
  ],

  successPatterns: [
    "Strong IP moat: 10+ granted patents or foundational IP",
    "World-class team: PhDs from top institutions (MIT, Stanford, CMU)",
    "Non-dilutive funding: SBIR/STTR, DARPA, NSF validating technology",
    "Strategic partnerships: Industry leaders for go-to-market",
    "Platform play: Core technology enabling multiple products",
    "Clear commercialization path: Defined TRL milestones",
    "Customer LOIs: Demand validated before full R&D completion",
    "10x improvement: Not incremental, order of magnitude better",
  ],

  typicalAcquirers: [
    "Google", "Microsoft", "Apple", "NVIDIA", "Intel",
    "Qualcomm", "Defense Primes (Lockheed, Raytheon)",
    "Industrial Giants (Siemens, GE, Honeywell)",
  ],

  benchmarkSearchQueries: [
    "deeptech funding benchmarks {current_year}",
    "deep technology startup metrics",
    "SBIR STTR funding statistics {current_year}",
    "deeptech exits {current_year}",
    "hard tech VC benchmarks",
  ],
};

// ============================================================================
// CLIMATE/CLEANTECH STANDARDS
// ============================================================================

export const CLIMATE_STANDARDS: SectorStandards = {
  sector: "Climate",
  aliases: ["CleanTech", "Climate Tech", "GreenTech", "Sustainability"],

  primaryMetrics: [
    {
      name: "Carbon Reduction",
      unit: "tCO2e/year",
      description: "Tonnes of CO2 equivalent reduced annually",
      direction: "higher_better",
      sectorContext: "Impact is the north star. Must demonstrate measurable, verifiable reduction.",
      searchKeywords: ["climate tech carbon impact benchmark", "carbon reduction metrics startups"],
    },
    {
      name: "Cost per Tonne Avoided",
      unit: "$/tCO2e",
      description: "Customer cost to avoid one tonne of CO2",
      direction: "lower_better",
      sectorContext: "VCM credits: $5-50/tonne. Compliance credits: $20-100+. Must beat alternatives.",
      searchKeywords: ["carbon abatement cost benchmark", "cost per tonne CO2 avoided"],
    },
    {
      name: "Gross Margin",
      unit: "%",
      description: "Revenue minus COGS",
      direction: "higher_better",
      sectorContext: "Software: 65%+. Hardware/energy: 25-45%. EPC/installation: 15-30%.",
      searchKeywords: ["cleantech gross margin benchmark", "climate tech unit economics"],
    },
    {
      name: "Policy Tailwind Alignment",
      unit: "qualitative",
      description: "Alignment with IRA, EU Green Deal, or regional carbon pricing",
      direction: "higher_better",
      sectorContext: "IRA ($369B), EU Green Deal (1T EUR), carbon pricing. Policy dependency = risk but also opportunity.",
      searchKeywords: ["IRA climate funding {current_year}", "EU Green Deal funding allocations"],
    },
  ],

  secondaryMetrics: [
    {
      name: "Offtake Agreement Duration",
      unit: "years",
      description: "Average duration of offtake/purchase agreements",
      direction: "higher_better",
      sectorContext: "PPAs: 10-25 years typical. Offtakes de-risk revenue for project finance.",
      searchKeywords: ["PPA duration benchmark", "renewable offtake agreement terms"],
    },
    {
      name: "Contract Pipeline",
      unit: "$M",
      description: "Value of signed LOIs and contracts",
      direction: "higher_better",
      sectorContext: "Long sales cycles in energy (12-24 months). Pipeline = leading indicator.",
      searchKeywords: ["cleantech sales pipeline benchmark", "energy project pipeline metrics"],
    },
  ],

  unitEconomicsFormulas: [
    {
      name: "Revenue per tCO2e",
      formula: "Total Revenue / Carbon Reduced (tonnes)",
      description: "Revenue generated per tonne of carbon impact",
      thresholds: { concerning: "< $20", good: "> $50", excellent: "> $150" },
      source: "Climate tech analysis",
    },
    {
      name: "Customer ROI",
      formula: "(Energy Savings + Carbon Credit Value) / Solution Cost",
      description: "Return for customer from climate solution",
      thresholds: { concerning: "< 1x", good: "> 2x", excellent: "> 5x" },
      source: "Energy efficiency standards",
    },
  ],

  redFlagRules: [
    {
      metric: "Carbon Reduction",
      condition: "below",
      threshold: 100,
      severity: "critical",
      reason: "No measurable impact = greenwashing risk, not a climate company",
      source: "Climate tech industry consensus",
    },
    {
      metric: "Cost per Tonne Avoided",
      condition: "above",
      threshold: 500,
      severity: "major",
      reason: "Too expensive vs alternatives - carbon credits much cheaper",
      source: "Carbon credit market pricing",
    },
  ],

  sectorRisks: [
    "Policy dependency: Business model tied to subsidies/carbon price",
    "Technology risk: Unproven at commercial scale",
    "Capital intensity: $100M+ before meaningful revenue possible",
    "Permitting delays: 2-5 years for environmental reviews",
    "Carbon credit volatility: VCM prices can swing dramatically",
    "Commodity exposure: Margins tied to energy prices",
    "Grid interconnection: Transmission constraints blocking projects",
    "Greenwashing scrutiny: Regulatory and reputational risk",
    "Exit path uncertainty: Strategic acquirers selective",
  ],

  successPatterns: [
    "Policy alignment: IRA, EU Green Deal, carbon pricing beneficiary",
    "Multi-year offtakes: 5-15 year contracts securing revenue",
    "Measurable impact: Third-party verified carbon reduction",
    "Cost parity: Cheaper than fossil alternatives",
    "Non-dilutive funding: DOE, ARPA-E, EU Horizon grants",
    "Strategic partnerships: Energy majors for distribution",
    "Hardware + software: Recurring revenue layer on top",
    "First-mover: Leading position in emerging segment",
  ],

  typicalAcquirers: [
    "Shell", "BP", "TotalEnergies", "Chevron",
    "Brookfield", "Engie", "Enel",
    "Industrial Giants", "Private Equity",
  ],

  benchmarkSearchQueries: [
    "climate tech benchmarks {current_year}",
    "BloombergNEF climate investment {current_year}",
    "IEA clean energy investment {current_year}",
    "carbon credit prices {current_year}",
    "climate tech exits {current_year}",
    "PwC State of Climate Tech {current_year}",
  ],
};

// ============================================================================
// CONSUMER/D2C STANDARDS
// ============================================================================

export const CONSUMER_STANDARDS: SectorStandards = {
  sector: "Consumer",
  aliases: ["D2C", "Direct-to-Consumer", "E-commerce", "Consumer Brand"],

  primaryMetrics: [
    {
      name: "LTV/CAC Ratio",
      unit: "x",
      description: "Customer lifetime value / acquisition cost",
      direction: "higher_better",
      sectorContext: "Industry standard is 3:1. Below 3:1 signals ineffective acquisition.",
      searchKeywords: ["D2C LTV CAC benchmark", "ecommerce LTV CAC ratio {current_year}"],
    },
    {
      name: "Contribution Margin",
      unit: "%",
      description: "Revenue - COGS - Variable costs / Revenue",
      direction: "higher_better",
      sectorContext: "Must cover CAC within first order for healthy D2C. Negative contribution = unsustainable.",
      searchKeywords: ["D2C contribution margin benchmark", "ecommerce unit economics"],
    },
    {
      name: "Customer Acquisition Cost (CAC)",
      unit: "$",
      description: "Blended cost to acquire one customer",
      direction: "lower_better",
      sectorContext: "Varies by category: Food/Bev ~$50, Fashion ~$65, Beauty ~$60, Jewelry ~$90.",
      searchKeywords: ["D2C CAC benchmark {current_year}", "ecommerce CAC by category"],
    },
    {
      name: "Repeat Purchase Rate",
      unit: "%",
      description: "% of customers who make 2+ purchases within 12 months",
      direction: "higher_better",
      sectorContext: "Avg ~28%. Grocery: 40-65%. Pet: 30%+. Fashion: 25%. Luxury: ~10%.",
      searchKeywords: ["ecommerce repeat purchase rate benchmark", "D2C retention rates"],
    },
  ],

  secondaryMetrics: [
    {
      name: "ROAS",
      unit: "x",
      description: "Return on Ad Spend",
      direction: "higher_better",
      sectorContext: "Median ~2x. 'Good' ROAS depends on margins.",
      searchKeywords: ["ecommerce ROAS benchmark {current_year}", "D2C ad performance"],
    },
    {
      name: "Average Order Value (AOV)",
      unit: "$",
      description: "Average value per order",
      direction: "higher_better",
      sectorContext: "Varies by category: Health/Beauty ~$160. Home ~$150. Fashion ~$90. Pet ~$75.",
      searchKeywords: ["ecommerce AOV benchmark", "average order value by category"],
    },
  ],

  unitEconomicsFormulas: [
    {
      name: "Payback Period",
      formula: "CAC / (AOV x Contribution Margin x Orders/Year)",
      description: "Months to recover customer acquisition cost",
      thresholds: { concerning: "> 18 months", good: "< 12 months", excellent: "< 6 months" },
      source: "D2C industry standard",
    },
    {
      name: "First Order Profit",
      formula: "AOV x Contribution Margin - CAC",
      description: "Profit (or loss) on first order",
      thresholds: { concerning: "< -$30", good: "> $0", excellent: "> $15" },
      source: "D2C unit economics analysis",
    },
    {
      name: "Cohort LTV",
      formula: "Sum of (Contribution Margin x Orders) over customer lifetime",
      description: "Actual lifetime value from cohort data",
      thresholds: { concerning: "< $50", good: "> $100", excellent: "> $250" },
      source: "D2C cohort analysis",
    },
  ],

  redFlagRules: [
    {
      metric: "LTV/CAC",
      condition: "below",
      threshold: 2,
      severity: "critical",
      reason: "LTV/CAC < 2x means losing money on customer acquisition",
      source: "Industry consensus - 3x is healthy, < 2x is concerning",
    },
    {
      metric: "Repeat Purchase Rate",
      condition: "below",
      threshold: 15,
      severity: "critical",
      reason: "Repeat rate < 15% is below floor - no retention, pure acquisition play",
      source: "D2C retention benchmarks",
    },
    {
      metric: "Contribution Margin",
      condition: "below",
      threshold: 15,
      severity: "major",
      reason: "Contribution < 15% = no path to profitability",
      source: "D2C unit economics analysis",
    },
    {
      metric: "CAC",
      condition: "above",
      threshold: 120,
      severity: "major",
      reason: "CAC > $120 exceeds top decile for most categories - unsustainable",
      source: "D2C CAC benchmarks",
    },
  ],

  sectorRisks: [
    "CAC inflation: iOS14/ATT killed cheap UA, Meta/Google costs rising",
    "Commoditization: Low barriers, Amazon private label competition",
    "Margin pressure: Rising shipping, manufacturing, return costs",
    "Platform dependency: Meta/Google algorithm changes",
    "Inventory risk: Cash tied up in stock, obsolescence",
    "Seasonality: Revenue concentration in Q4",
    "Returns: High return rates (20-30% in fashion) eating margins",
    "Single channel: Over-reliance on one acquisition channel",
  ],

  successPatterns: [
    "Organic brand: Strong word-of-mouth, low CAC",
    "Subscription/replenishment: Recurring revenue, predictable",
    "High repeat rate: 40%+ customers buying again",
    "Diversified acquisition: Not dependent on single channel",
    "Owned audience: Email/SMS list for low-cost marketing",
    "Category creation: Defining new product category",
    "Vertical integration: Manufacturing control improving margins",
    "Community: Strong brand community driving advocacy",
  ],

  typicalAcquirers: [
    "P&G", "Unilever", "L'Oreal", "Nestle", "Coca-Cola",
    "Amazon", "Walmart", "Target", "Private Equity",
  ],

  benchmarkSearchQueries: [
    "D2C benchmarks {current_year}",
    "ecommerce CAC benchmark {current_year}",
    "D2C repeat purchase rates {current_year}",
    "consumer brand acquisitions {current_year}",
    "ecommerce unit economics report {current_year}",
  ],
};

// ============================================================================
// GAMING STANDARDS
// ============================================================================

export const GAMING_STANDARDS: SectorStandards = {
  sector: "Gaming",
  aliases: ["Video Games", "Mobile Gaming", "Game Development"],

  primaryMetrics: [
    {
      name: "DAU/MAU Ratio",
      unit: "%",
      description: "Daily active users / Monthly active users",
      direction: "higher_better",
      sectorContext: "Measures stickiness. Hypercasual: 12-18%. Casual: 18-28%. Midcore: 30%+.",
      searchKeywords: ["gaming DAU MAU benchmark", "mobile game engagement benchmarks"],
    },
    {
      name: "Day 1 Retention",
      unit: "%",
      description: "% of users returning day after install",
      direction: "higher_better",
      sectorContext: "D1 is the first filter. Median ~25-30%. < 25% = core loop issues.",
      searchKeywords: ["mobile game D1 retention benchmark", "game retention benchmarks"],
    },
    {
      name: "Day 30 Retention",
      unit: "%",
      description: "% of users returning 30 days after install",
      direction: "higher_better",
      sectorContext: "D30 predicts LTV. Median ~4%. Top games: 15%+.",
      searchKeywords: ["mobile game D30 retention benchmark", "game retention by genre"],
    },
    {
      name: "LTV/CPI Ratio",
      unit: "x",
      description: "Lifetime value / Cost per install",
      direction: "higher_better",
      sectorContext: "LTV/CPI > 1.2 for profitable UA. Post-ATT, CPI up 40-70%.",
      searchKeywords: ["mobile game LTV CPI benchmark", "game UA economics"],
    },
  ],

  secondaryMetrics: [
    {
      name: "ARPDAU",
      unit: "$",
      description: "Average revenue per daily active user",
      direction: "higher_better",
      sectorContext: "Hypercasual: $0.02-0.04. Casual: $0.05-0.12. Midcore: $0.15-0.40.",
      searchKeywords: ["mobile game ARPDAU benchmark", "game monetization benchmarks"],
    },
    {
      name: "Paying User Rate",
      unit: "%",
      description: "% of active users who make purchases",
      direction: "higher_better",
      sectorContext: "F2P average: 2-4%. High ARPPU can compensate for low conversion.",
      searchKeywords: ["mobile game payer conversion benchmark", "F2P conversion rates"],
    },
  ],

  unitEconomicsFormulas: [
    {
      name: "LTV",
      formula: "ARPDAU x Average Lifetime Days",
      description: "Player lifetime value",
      thresholds: { concerning: "< CPI", good: "> 1.3x CPI", excellent: "> 2x CPI" },
      source: "Gaming industry standard",
    },
    {
      name: "Contribution Margin",
      formula: "(LTV - CPI) / LTV",
      description: "Margin after user acquisition",
      thresholds: { concerning: "< 10%", good: "> 25%", excellent: "> 50%" },
      source: "Gaming unit economics",
    },
    {
      name: "Payback Days",
      formula: "CPI / ARPDAU",
      description: "Days to recover acquisition cost",
      thresholds: { concerning: "> 180", good: "< 90", excellent: "< 30" },
      source: "Gaming industry standard",
    },
  ],

  redFlagRules: [
    {
      metric: "Day 1 Retention",
      condition: "below",
      threshold: 20,
      severity: "critical",
      reason: "D1 < 20% is below industry floor = core loop issues",
      source: "GameAnalytics benchmarks",
    },
    {
      metric: "LTV/CPI Ratio",
      condition: "below",
      threshold: 0.7,
      severity: "critical",
      reason: "LTV/CPI < 0.7 = unprofitable at scale, can't afford to acquire users",
      source: "Gaming UA economics",
    },
    {
      metric: "DAU/MAU Ratio",
      condition: "below",
      threshold: 8,
      severity: "major",
      reason: "Very low engagement = likely churn spiral",
      source: "Gaming engagement benchmarks",
    },
  ],

  sectorRisks: [
    "Hit-driven: Success depends on unpredictable viral hits",
    "Platform dependency: 30% revenue share to Apple/Google",
    "UA cost inflation: iOS14/ATT killed cheap acquisition",
    "Content treadmill: Constant updates expected, LiveOps expensive",
    "Whale concentration: 50-70% revenue from <5% of players",
    "Genre saturation: Red ocean competition",
    "Copycat risk: Successful mechanics cloned quickly",
    "Regulatory: Loot box bans, China playtime limits",
  ],

  successPatterns: [
    "Strong core loop: D1 >40% before scaling UA",
    "LiveOps DNA: Tools and team for continuous content",
    "Diversified UA: Organic/viral >30% of installs",
    "Whale-friendly: High ARPPU without Pay-to-Win",
    "Community: Discord/Reddit driving organic growth",
    "Cross-platform: Mobile + PC + Console",
    "Data-driven: A/B testing everything",
    "Soft launch: 3-6+ months iteration before global",
  ],

  typicalAcquirers: [
    "Microsoft", "Sony", "Tencent", "NetEase",
    "EA", "Take-Two", "Embracer", "Zynga",
  ],

  benchmarkSearchQueries: [
    "mobile game benchmarks {current_year}",
    "game retention benchmarks {current_year}",
    "mobile game CPI {current_year}",
    "gaming acquisitions {current_year} multiples",
    "GameAnalytics benchmarks {current_year}",
  ],
};

// ============================================================================
// HARDWARE/IOT STANDARDS
// ============================================================================

export const HARDWARE_STANDARDS: SectorStandards = {
  sector: "Hardware",
  aliases: ["IoT", "Hardware/IoT", "Consumer Electronics", "Industrial IoT"],

  primaryMetrics: [
    {
      name: "Hardware Gross Margin",
      unit: "%",
      description: "Margin on hardware sales only",
      direction: "higher_better",
      sectorContext: "Consumer: 25-40%. Enterprise: 40-55%. Apple-tier: 55%+.",
      searchKeywords: ["hardware gross margin benchmark", "consumer electronics margins"],
    },
    {
      name: "Attach Rate",
      unit: "%",
      description: "% of hardware customers with recurring revenue (software/services)",
      direction: "higher_better",
      sectorContext: "Hardware + software = better economics. Pure hardware commoditizes.",
      searchKeywords: ["hardware attach rate benchmark", "hardware SaaS attach"],
    },
    {
      name: "Blended Gross Margin",
      unit: "%",
      description: "Combined hardware + software/services margin",
      direction: "higher_better",
      sectorContext: "Best hardware companies have 45%+ blended from software attach.",
      searchKeywords: ["hardware software blended margin", "IoT unit economics"],
    },
    {
      name: "Time to Production",
      unit: "months",
      description: "Time from prototype to mass production",
      direction: "lower_better",
      sectorContext: "Hardware timelines are long. Always add 50% buffer for reality.",
      searchKeywords: ["hardware time to market benchmark", "manufacturing timeline startups"],
    },
  ],

  secondaryMetrics: [
    {
      name: "Return Rate",
      unit: "%",
      description: "% of units returned within 30 days",
      direction: "lower_better",
      sectorContext: "Consumer electronics avg: 8-12%. High returns = quality/PMF issues.",
      searchKeywords: ["consumer electronics return rate", "hardware return benchmarks"],
    },
    {
      name: "BOM Cost Reduction",
      unit: "%/year",
      description: "Annual bill of materials cost reduction",
      direction: "higher_better",
      sectorContext: "Scale should drive 8-15% annual BOM reduction.",
      searchKeywords: ["hardware BOM cost reduction", "manufacturing cost curve"],
    },
  ],

  unitEconomicsFormulas: [
    {
      name: "Hardware + Software LTV",
      formula: "(Hardware Margin + Lifetime Software Revenue) / CAC",
      description: "True LTV including software attach",
      thresholds: { concerning: "< 2x", good: "> 3x", excellent: "> 5x" },
      source: "Hardware business model analysis",
    },
    {
      name: "Break-even Volume",
      formula: "Fixed Costs / (Revenue per Unit - Variable Cost per Unit)",
      description: "Units needed to break even",
      thresholds: { concerning: "> 50K", good: "< 10K", excellent: "< 5K" },
      source: "Hardware manufacturing economics",
    },
  ],

  redFlagRules: [
    {
      metric: "Hardware Gross Margin",
      condition: "below",
      threshold: 15,
      severity: "critical",
      reason: "Margin < 15% leaves no room for error, defects, or returns",
      source: "Hardware economics analysis",
    },
    {
      metric: "Attach Rate",
      condition: "below",
      threshold: 10,
      severity: "major",
      reason: "No software attach = commodity hardware trap",
      source: "Hardware business model analysis",
    },
    {
      metric: "Time to Production",
      condition: "above",
      threshold: 36,
      severity: "critical",
      reason: "> 3 years to production = extreme execution risk",
      source: "Hardware startup benchmarks",
    },
    {
      metric: "Return Rate",
      condition: "above",
      threshold: 15,
      severity: "major",
      reason: "High returns indicate quality or product-market fit issues",
      source: "Consumer electronics benchmarks",
    },
  ],

  sectorRisks: [
    "Manufacturing complexity: Supply chain, quality control issues",
    "Inventory risk: Cash tied up, obsolescence risk",
    "Long development cycles: 18-36 months typical",
    "Capital intensity: Tooling, inventory, certifications",
    "China dependency: Manufacturing concentration risk",
    "Commoditization: Race to bottom on price",
    "Support costs: Physical product support expensive",
    "Certification delays: FCC, CE, UL can delay launch",
  ],

  successPatterns: [
    "Software attach: Recurring revenue layer on hardware",
    "Platform play: Hardware + app ecosystem",
    "Vertical integration: Own manufacturing for margins",
    "Consumables: Razor/blade model",
    "Enterprise focus: Higher margins, longer relationships",
    "Design differentiation: Premium brand commanding margin",
    "Capital efficient: Pre-orders, crowdfunding validation",
    "China+ strategy: Diversified manufacturing",
  ],

  typicalAcquirers: [
    "Apple", "Google", "Amazon", "Samsung", "Sony",
    "Industrial Giants (Siemens, Honeywell, ABB)",
    "Private Equity",
  ],

  benchmarkSearchQueries: [
    "hardware startup benchmarks {current_year}",
    "consumer electronics margins {current_year}",
    "IoT unit economics benchmark",
    "hardware acquisitions {current_year}",
    "HAX hardware benchmarks",
  ],
};

// ============================================================================
// BIOTECH STANDARDS
// ============================================================================

export const BIOTECH_STANDARDS: SectorStandards = {
  sector: "BioTech",
  aliases: ["Life Sciences", "Pharma", "Drug Discovery", "Therapeutics", "Biopharma"],

  primaryMetrics: [
    {
      name: "Clinical Phase",
      unit: "phase",
      description: "Current stage in clinical development (Preclinical, Phase I, II, III, NDA/BLA)",
      direction: "higher_better",
      sectorContext: "Each phase has different risk/reward profile. Phase I: 10-15% success. Phase II: 30-35% success. Phase III: 60-70% success to approval.",
      searchKeywords: ["biotech clinical phase success rates", "drug development phase transition probability"],
    },
    {
      name: "Cash Runway",
      unit: "months",
      description: "Months of operating cash remaining at current burn rate",
      direction: "higher_better",
      sectorContext: "CRITICAL in biotech. Clinical trials are capital-intensive. Must have runway to next value inflection (data readout, phase transition). 18+ months is healthy, < 12 months is concerning.",
      searchKeywords: ["biotech cash runway benchmark", "pharma startup burn rate"],
    },
    {
      name: "Pipeline Value (rNPV)",
      unit: "$M",
      description: "Risk-adjusted Net Present Value of the drug pipeline",
      direction: "higher_better",
      sectorContext: "rNPV discounts for clinical success probability at each phase. Early-stage: heavily discounted. Post-Phase II: significant value.",
      searchKeywords: ["biotech pipeline valuation rNPV", "drug pipeline risk-adjusted NPV"],
    },
    {
      name: "Clinical Success Probability",
      unit: "%",
      description: "Probability of current lead asset reaching FDA approval",
      direction: "higher_better",
      sectorContext: "Preclinical→Approval: ~5-10%. Phase I→Approval: ~10-15%. Phase II→Approval: ~25-30%. Phase III→Approval: ~55-65%.",
      searchKeywords: ["clinical trial success rate by phase", "drug development approval probability"],
    },
    {
      name: "Patent Life Remaining",
      unit: "years",
      description: "Years of patent protection remaining on lead asset",
      direction: "higher_better",
      sectorContext: "20 years from filing. Must have 10+ years at approval for viable commercial window. Orphan drug: +7 years exclusivity.",
      searchKeywords: ["pharma patent life benchmark", "drug patent expiration impact"],
    },
  ],

  secondaryMetrics: [
    {
      name: "Patient Enrollment Rate",
      unit: "patients/month",
      description: "Rate of patient enrollment in active clinical trials",
      direction: "higher_better",
      sectorContext: "Slow enrollment = delayed timelines = cash burn. Compare vs trial size targets.",
      searchKeywords: ["clinical trial enrollment rate benchmark", "patient recruitment speed"],
    },
    {
      name: "Monthly Burn Rate",
      unit: "$M",
      description: "Monthly cash consumption",
      direction: "lower_better",
      sectorContext: "Preclinical: $0.5-2M/month. Phase I: $1-3M/month. Phase II: $2-5M/month. Phase III: $5-20M+/month.",
      searchKeywords: ["biotech burn rate by phase", "drug development monthly costs"],
    },
    {
      name: "Number of Indications",
      unit: "count",
      description: "Number of disease indications being pursued",
      direction: "higher_better",
      sectorContext: "Platform technologies can address multiple indications, de-risking the pipeline.",
      searchKeywords: ["biotech pipeline indications benchmark", "multi-indication drug value"],
    },
    {
      name: "Regulatory Designations",
      unit: "count",
      description: "FDA special designations (Orphan, Breakthrough, Fast Track, Priority Review)",
      direction: "higher_better",
      sectorContext: "Designations accelerate review and provide exclusivity. Orphan: 7 years. Breakthrough: FDA engagement.",
      searchKeywords: ["FDA breakthrough designation benefits", "orphan drug designation value"],
    },
  ],

  unitEconomicsFormulas: [
    {
      name: "Risk-Adjusted NPV (rNPV)",
      formula: "Sum of (NPV per indication × Phase success probability × Launch probability)",
      description: "Standard biotech valuation methodology",
      thresholds: { concerning: "< $50M", good: "> $200M", excellent: "> $500M" },
      source: "Industry standard biotech valuation",
    },
    {
      name: "Cash Runway",
      formula: "Current Cash / Monthly Burn Rate",
      description: "Months of runway remaining",
      thresholds: { concerning: "< 12 months", good: "> 18 months", excellent: "> 24 months" },
      source: "Industry standard",
    },
    {
      name: "Cost per Patient Enrolled",
      formula: "Total Trial Costs / Number of Patients Enrolled",
      description: "Efficiency of patient recruitment",
      thresholds: { concerning: "> $50K/patient", good: "< $30K/patient", excellent: "< $15K/patient" },
      source: "Clinical trial benchmarks",
    },
    {
      name: "Pipeline Concentration Risk",
      formula: "Lead Asset rNPV / Total Pipeline rNPV",
      description: "Dependency on single asset",
      thresholds: { concerning: "> 80%", good: "< 60%", excellent: "< 40%" },
      source: "Portfolio diversification analysis",
    },
  ],

  redFlagRules: [
    {
      metric: "Cash Runway",
      condition: "below",
      threshold: 12,
      severity: "critical",
      reason: "< 12 months runway in biotech is emergency territory - will need dilutive financing or partnership",
      source: "Biotech financing consensus",
    },
    {
      metric: "Clinical Success Probability",
      condition: "below",
      threshold: 5,
      severity: "critical",
      reason: "< 5% overall success probability = lottery ticket, not investable for most",
      source: "Clinical development statistics",
    },
    {
      metric: "Patent Life Remaining",
      condition: "below",
      threshold: 8,
      severity: "major",
      reason: "< 8 years patent life at potential approval = limited commercial window",
      source: "Pharma economics analysis",
    },
    {
      metric: "Patient Enrollment Rate",
      condition: "below",
      threshold: 5,
      severity: "major",
      reason: "< 5 patients/month for Phase II+ indicates serious recruitment issues, timeline risk",
      source: "Clinical trial benchmarks",
    },
    {
      metric: "Pipeline Concentration Risk",
      condition: "above",
      threshold: 90,
      severity: "major",
      reason: "> 90% concentration in one asset = single point of failure, binary risk",
      source: "Portfolio risk analysis",
    },
  ],

  sectorRisks: [
    "Binary clinical outcomes: Phase II/III failure can destroy 80%+ of value overnight",
    "Capital intensity: $1-3B average to bring a drug to market",
    "Long timelines: 10-15 years from discovery to approval typical",
    "Regulatory uncertainty: FDA can require additional trials or reject applications",
    "Competition from generics/biosimilars: Patent cliff at exclusivity expiration",
    "Big Pharma competition: Can develop competing assets with vastly more resources",
    "Key person risk: CSO/CMO departure can derail clinical strategy",
    "Manufacturing complexity: CMC (Chemistry, Manufacturing, Controls) issues",
    "Reimbursement risk: Payers may not cover at target price",
    "Clinical hold risk: FDA can halt trials for safety",
    "Data fraud/manipulation: Fabricated clinical data is a death sentence",
    "Platform technology risk: Platform may not translate across indications",
  ],

  successPatterns: [
    "First-in-class mechanism: Novel MoA with clear differentiation",
    "Biomarker-driven development: Selecting patients likely to respond",
    "Orphan drug strategy: Smaller trials, 7-year exclusivity, premium pricing",
    "Platform technology: Multiple shots on goal across indications",
    "Partnership strategy: Big Pharma validation and funding",
    "Fast-to-clinic: Efficient preclinical → Phase I transition",
    "Strong IP moat: Composition of matter patents, freedom to operate",
    "Experienced clinical team: Prior approval experience",
    "Positive Phase I/II data: De-risked with early efficacy signals",
    "Multiple indications: Platform with expansion opportunities",
    "Breakthrough Therapy Designation: FDA engagement, accelerated review",
    "Clear regulatory path: Well-defined endpoints accepted by FDA",
  ],

  typicalAcquirers: [
    "Pfizer", "Merck", "Johnson & Johnson", "Roche/Genentech",
    "Novartis", "Bristol-Myers Squibb", "AbbVie", "AstraZeneca",
    "Eli Lilly", "Gilead", "Amgen", "Biogen", "Sanofi",
    "Private Equity (specialized healthcare funds)",
  ],

  benchmarkSearchQueries: [
    "biotech valuation by clinical phase {current_year}",
    "drug development success rates {current_year}",
    "biotech M&A multiples {current_year}",
    "clinical trial cost benchmarks {current_year}",
    "FDA approval probability by phase {current_year}",
    "biotech IPO valuations {current_year}",
    "orphan drug acquisition multiples {current_year}",
  ],
};

// ============================================================================
// EDTECH STANDARDS
// ============================================================================

export const EDTECH_STANDARDS: SectorStandards = {
  sector: "EdTech",
  aliases: ["Education Technology", "Ed Tech", "E-Learning", "Online Learning", "Learning Platform", "Education"],

  primaryMetrics: [
    {
      name: "Course Completion Rate",
      unit: "%",
      description: "Percentage of enrolled learners who complete a course/module",
      direction: "higher_better",
      sectorContext: "The #1 EdTech metric. Low completion = no outcomes = no retention. MOOC average: 3-15%. Best in class: 40%+. Cohort-based: 60%+.",
      searchKeywords: ["online course completion rate benchmark", "MOOC completion statistics", "e-learning completion rates"],
    },
    {
      name: "Learner Acquisition Cost (LAC)",
      unit: "$",
      description: "Cost to acquire one active learner (B2C) or decision-maker contact (B2B)",
      direction: "lower_better",
      sectorContext: "B2C EdTech CAC is brutal: $50-150 typical. B2B (selling to schools): $500-2000 per school. Corporate L&D: $100-500 per seat.",
      searchKeywords: ["edtech customer acquisition cost", "online education CAC benchmark", "B2B edtech sales cost"],
    },
    {
      name: "Net Revenue Retention (NRR)",
      unit: "%",
      description: "Revenue from existing customers after churn and expansion (B2B)",
      direction: "higher_better",
      sectorContext: "Critical for B2B EdTech. School contracts renew annually. NRR < 90% = product not sticky. Top B2B EdTech: 110%+.",
      searchKeywords: ["edtech NRR benchmark", "B2B education software retention", "school software renewal rates"],
    },
    {
      name: "Monthly Active Learners (MAL)",
      unit: "count",
      description: "Unique learners actively engaging with content per month",
      direction: "higher_better",
      sectorContext: "Engagement is everything in EdTech. Track MAL/Total Enrolled ratio. < 20% = ghost users. > 50% = strong engagement.",
      searchKeywords: ["edtech engagement benchmarks", "online learning active user rates", "e-learning MAU benchmarks"],
    },
    {
      name: "Learner Lifetime Value (LLTV)",
      unit: "$",
      description: "Total revenue from a learner over their relationship",
      direction: "higher_better",
      sectorContext: "B2C subscriptions: $100-500 typical. B2B per-seat: $50-200/year. Bootcamps/ISAs: $5K-20K.",
      searchKeywords: ["edtech LTV benchmark", "online education customer lifetime value", "e-learning ARPU"],
    },
  ],

  secondaryMetrics: [
    {
      name: "Time to First Value (TTFV)",
      unit: "minutes",
      description: "Time from signup to first meaningful learning moment",
      direction: "lower_better",
      sectorContext: "Critical for activation. < 10 min ideal. > 30 min = high drop-off. Onboarding is make-or-break.",
      searchKeywords: ["edtech onboarding benchmark", "time to first value SaaS", "user activation education apps"],
    },
    {
      name: "Learning Outcome Improvement",
      unit: "%",
      description: "Measurable improvement in test scores, skills, or certifications",
      direction: "higher_better",
      sectorContext: "The holy grail. Outcomes-based EdTech commands premium pricing. Efficacy studies are gold.",
      searchKeywords: ["edtech learning outcomes", "education technology efficacy studies", "online learning effectiveness research"],
    },
    {
      name: "Teacher/Instructor NPS",
      unit: "score",
      description: "Net Promoter Score from teachers/instructors (B2B)",
      direction: "higher_better",
      sectorContext: "Teachers are gatekeepers. Low teacher NPS = no adoption. > 40 is strong, < 20 is concerning.",
      searchKeywords: ["edtech teacher satisfaction", "education software NPS benchmark", "teacher technology adoption"],
    },
    {
      name: "Content Production Cost per Hour",
      unit: "$",
      description: "Cost to produce one hour of learning content",
      direction: "lower_better",
      sectorContext: "Traditional: $10K-50K/hour. AI-assisted: $1K-5K/hour. UGC/community: near $0. Impacts margins heavily.",
      searchKeywords: ["e-learning content production cost", "course creation cost benchmark", "instructional design cost per hour"],
    },
    {
      name: "District/School Penetration",
      unit: "%",
      description: "Percentage of teachers/students using product within a contracted school",
      direction: "higher_better",
      sectorContext: "B2B trap: selling to admin but no teacher adoption. > 60% penetration = real usage.",
      searchKeywords: ["edtech school adoption rates", "education software utilization benchmark", "district-wide implementation"],
    },
  ],

  unitEconomicsFormulas: [
    {
      name: "Learner LTV",
      formula: "ARPU x Gross Margin x (1 / Annual Churn Rate)",
      description: "Lifetime value of a learner",
      thresholds: { concerning: "< 2x LAC", good: "> 3x LAC", excellent: "> 5x LAC" },
      source: "Industry standard adapted for EdTech",
    },
    {
      name: "LAC Payback",
      formula: "LAC / (Monthly ARPU x Gross Margin)",
      description: "Months to recover learner acquisition cost",
      thresholds: { concerning: "> 18 months", good: "< 12 months", excellent: "< 6 months" },
      source: "Industry standard adapted for EdTech",
    },
    {
      name: "Engagement Score",
      formula: "(Active Time / Expected Time) x Completion Rate x Return Rate",
      description: "Composite engagement metric",
      thresholds: { concerning: "< 0.3", good: "> 0.5", excellent: "> 0.7" },
      source: "EdTech engagement frameworks",
    },
    {
      name: "Content ROI",
      formula: "Revenue Attributed to Content / Content Production Cost",
      description: "Return on content investment",
      thresholds: { concerning: "< 2x", good: "> 5x", excellent: "> 10x" },
      source: "E-learning economics analysis",
    },
    {
      name: "School Contract Value",
      formula: "Students x Per-Seat Price x Contract Years",
      description: "Total contract value for B2B school deals",
      thresholds: { concerning: "< $5K ACV", good: "> $15K ACV", excellent: "> $50K ACV" },
      source: "B2B EdTech sales benchmarks",
    },
  ],

  redFlagRules: [
    {
      metric: "Course Completion Rate",
      condition: "below",
      threshold: 10,
      severity: "critical",
      reason: "Completion < 10% means learners aren't getting value - product fundamentally broken or wrong audience",
      source: "EdTech industry consensus - even MOOCs average 3-15%, sub-10% is alarming",
    },
    {
      metric: "NRR",
      condition: "below",
      threshold: 85,
      severity: "critical",
      reason: "B2B EdTech with NRR < 85% has fundamental retention problem - schools not renewing",
      source: "B2B SaaS/EdTech benchmarks - education contracts should be sticky",
    },
    {
      metric: "LAC",
      condition: "above",
      threshold: 200,
      severity: "major",
      reason: "B2C LAC > $200 is unsustainable without very high LTV - most EdTech can't support this",
      source: "EdTech unit economics analysis - CAC inflation post-COVID",
    },
    {
      metric: "District Penetration",
      condition: "below",
      threshold: 20,
      severity: "major",
      reason: "Penetration < 20% in contracted schools = shelfware, not real adoption",
      source: "EdTech implementation studies - low usage kills renewals",
    },
    {
      metric: "LLTV/LAC",
      condition: "below",
      threshold: 2,
      severity: "critical",
      reason: "LTV/CAC < 2x means losing money on every learner acquired",
      source: "Unit economics fundamentals",
    },
  ],

  sectorRisks: [
    "Seasonality: K-12 buying concentrated in Q1-Q2, summer is dead",
    "Budget dependency: Public school budgets are political and unpredictable",
    "Procurement complexity: District sales require RFPs, pilots, board approvals (12-18 month cycles)",
    "Teacher adoption: Selling to admin without teacher buy-in kills usage",
    "Free alternatives: Khan Academy, YouTube, ChatGPT competing for attention",
    "Regulatory compliance: COPPA (children), FERPA (student data), accessibility (ADA)",
    "Completion problem: Most learners don't finish courses - industry-wide challenge",
    "Credential recognition: Certificates may not be valued by employers",
    "Platform dependency: App store policies, school IT restrictions",
    "Content commoditization: AI making content creation cheaper for everyone",
  ],

  successPatterns: [
    "Proven outcomes: Published efficacy studies showing learning gains",
    "Teacher champions: Strong teacher NPS driving organic adoption",
    "Cohort-based learning: Community and accountability driving completion",
    "B2B2C hybrid: Sell to institutions, engage individual learners",
    "Freemium funnel: Free tier building habit, premium for outcomes",
    "Credential value: Industry-recognized certifications commanding premium",
    "Embedded in workflow: Integrated into LMS (Canvas, Blackboard, Google Classroom)",
    "Assessment moat: Proprietary adaptive testing or skills assessment",
    "Network effects: Learner-generated content, peer learning",
    "ISA/outcomes-based: Aligned incentives - paid when learner succeeds",
  ],

  typicalAcquirers: [
    "Pearson", "McGraw-Hill", "Wiley", "Cengage",
    "Chegg", "Coursera", "2U", "Duolingo",
    "Google (for Education)", "Microsoft (LinkedIn Learning)",
    "Byju's", "Guild Education",
    "Private Equity (Vista, Providence, TPG)",
  ],

  benchmarkSearchQueries: [
    "edtech benchmarks {current_year}",
    "online education metrics {current_year}",
    "e-learning completion rate statistics {current_year}",
    "K-12 edtech market analysis {current_year}",
    "corporate learning LTV CAC {current_year}",
    "edtech exits acquisitions {current_year}",
    "HolonIQ edtech report {current_year}",
    "GSV edtech funding {current_year}",
  ],
};

// ============================================================================
// FOODTECH STANDARDS
// ============================================================================

export const FOODTECH_STANDARDS: SectorStandards = {
  sector: "FoodTech",
  aliases: ["Food Tech", "F&B Tech", "AgTech", "AgriTech", "Alt Protein", "Alternative Protein", "Food & Beverage", "CPG Food", "Meal Kit", "Dark Kitchen", "Ghost Kitchen", "Food Delivery Tech", "Vertical Farming", "Plant-Based"],

  primaryMetrics: [
    {
      name: "Gross Margin",
      unit: "%",
      description: "Revenue minus cost of goods sold (COGS including food costs)",
      direction: "higher_better",
      sectorContext: "Varies MASSIVELY by sub-sector. CPG/Packaged Food: 30-50%. Restaurant Tech (software): 60-80%. Food Delivery platforms: 5-15%. Alt Protein: 20-40% early, 50%+ at scale. Vertical Farming: negative early, 30-50% at scale.",
      searchKeywords: ["foodtech gross margin benchmark", "CPG food brand margins", "alt protein unit economics"],
    },
    {
      name: "Food Cost Ratio",
      unit: "%",
      description: "Raw ingredient/food costs as percentage of revenue",
      direction: "lower_better",
      sectorContext: "CPG: 25-40% is healthy. Restaurant/meal kit: 25-35%. Alt Protein: 40-60% early stage (scale-dependent). High food cost = commodity business risk.",
      searchKeywords: ["food cost percentage benchmark", "CPG COGS benchmark", "restaurant food cost ratio"],
    },
    {
      name: "Repeat Purchase Rate",
      unit: "%",
      description: "Percentage of customers who make 2+ purchases within 12 months",
      direction: "higher_better",
      sectorContext: "CRITICAL for D2C food. Subscription/meal kits: 60-80% target. D2C brands: 30-45% good. One-time purchases = unsustainable CAC model.",
      searchKeywords: ["D2C food repeat rate benchmark", "meal kit retention rates", "CPG repeat purchase"],
    },
    {
      name: "Customer Acquisition Cost (CAC)",
      unit: "$",
      description: "Blended cost to acquire one customer",
      direction: "lower_better",
      sectorContext: "D2C food: $20-60 typical. Meal kits: $80-150 (high churn = high CAC acceptable only with high LTV). B2B food tech: varies by ACV. Must be < first order contribution margin for sustainability.",
      searchKeywords: ["D2C food CAC benchmark", "meal kit CAC", "CPG customer acquisition cost"],
    },
    {
      name: "Contribution Margin per Order",
      unit: "$",
      description: "Revenue - COGS - Fulfillment - Payment processing per order",
      direction: "higher_better",
      sectorContext: "Must be positive for D2C sustainability. Meal kits: $15-30 target. D2C brands: $5-20. Negative contribution = every order loses money.",
      searchKeywords: ["D2C contribution margin benchmark", "food delivery unit economics", "meal kit contribution margin"],
    },
  ],

  secondaryMetrics: [
    {
      name: "Average Order Value (AOV)",
      unit: "$",
      description: "Average revenue per order",
      direction: "higher_better",
      sectorContext: "Higher AOV helps cover fixed fulfillment costs. D2C food: $40-80 typical. Meal kits: $50-100. Premium brands: $60-150.",
      searchKeywords: ["D2C food AOV benchmark", "meal kit average order value"],
    },
    {
      name: "LTV/CAC Ratio",
      unit: "x",
      description: "Customer lifetime value divided by acquisition cost",
      direction: "higher_better",
      sectorContext: "3:1 minimum for healthy D2C. Meal kits often struggle at 2:1 due to high churn. Subscription models should target 4:1+.",
      searchKeywords: ["D2C food LTV CAC ratio", "meal kit LTV CAC benchmark"],
    },
    {
      name: "Retail Velocity",
      unit: "$/store/week",
      description: "Weekly sales per retail store (for brands in retail distribution)",
      direction: "higher_better",
      sectorContext: "Determines shelf space retention. < $10/week = delisting risk. $25+ = expansion opportunity. Varies by category and placement.",
      searchKeywords: ["CPG retail velocity benchmark", "food brand velocity per store"],
    },
    {
      name: "Spoilage/Waste Rate",
      unit: "%",
      description: "Percentage of inventory lost to spoilage, damage, or expiration",
      direction: "lower_better",
      sectorContext: "Perishables: < 3% target. Frozen: < 1%. Fresh produce/meat: 5-10% common but problematic. High spoilage = broken supply chain or demand forecasting.",
      searchKeywords: ["food waste rate benchmark", "perishable inventory loss rate"],
    },
    {
      name: "Channel Mix (D2C %)",
      unit: "%",
      description: "Percentage of revenue from direct-to-consumer channel",
      direction: "target_range",
      targetRange: { min: 20, max: 60 },
      sectorContext: "Pure D2C is CAC-heavy. Pure retail is margin-thin. Best brands have diversified mix: 30-50% D2C (high margin), 40-60% retail (scale), 10-20% foodservice.",
      searchKeywords: ["CPG channel mix benchmark", "food brand distribution strategy"],
    },
    {
      name: "Certifications Count",
      unit: "count",
      description: "Number of relevant certifications (Organic, Non-GMO, B-Corp, etc.)",
      direction: "higher_better",
      sectorContext: "Certifications drive premium pricing and retailer interest. Organic = 20-40% price premium. B-Corp = brand differentiation.",
      searchKeywords: ["food certification premium pricing", "organic certification value"],
    },
  ],

  unitEconomicsFormulas: [
    {
      name: "Contribution Margin per Order",
      formula: "AOV - COGS - Fulfillment - Payment Processing",
      description: "Net margin per order after variable costs",
      thresholds: { concerning: "< $0 (negative)", good: "> $10", excellent: "> $25" },
      source: "D2C food industry standard",
    },
    {
      name: "Customer Lifetime Value (LTV)",
      formula: "AOV × Contribution Margin % × Orders per Year × Customer Lifespan (years)",
      description: "Total expected revenue from a customer",
      thresholds: { concerning: "< 2x CAC", good: "> 3x CAC", excellent: "> 5x CAC" },
      source: "D2C industry standard",
    },
    {
      name: "CAC Payback (Orders)",
      formula: "CAC / Contribution Margin per Order",
      description: "Number of orders to recover acquisition cost",
      thresholds: { concerning: "> 4 orders", good: "< 3 orders", excellent: "< 2 orders (first order profitable)" },
      source: "D2C food economics",
    },
    {
      name: "Gross Margin per Unit",
      formula: "(Unit Price - Unit COGS) / Unit Price",
      description: "Margin on individual product unit",
      thresholds: { concerning: "< 30%", good: "> 45%", excellent: "> 60%" },
      source: "CPG industry standard",
    },
    {
      name: "Retail Trade Spend Ratio",
      formula: "Trade Spend / Gross Retail Revenue",
      description: "Promotional and slotting fees as % of retail revenue",
      thresholds: { concerning: "> 30%", good: "< 20%", excellent: "< 15%" },
      source: "CPG trade economics",
    },
    {
      name: "Break-even Production Volume",
      formula: "Fixed Costs / (Price per Unit - Variable Cost per Unit)",
      description: "Units needed to break even on production run",
      thresholds: { concerning: "> 100K units", good: "< 50K units", excellent: "< 20K units" },
      source: "Food manufacturing economics",
    },
  ],

  redFlagRules: [
    {
      metric: "Contribution Margin per Order",
      condition: "below",
      threshold: 0,
      severity: "critical",
      reason: "Negative contribution margin = losing money on every order. No path to profitability without fundamental unit economics change.",
      source: "D2C economics - contribution must be positive to scale",
    },
    {
      metric: "Gross Margin",
      condition: "below",
      threshold: 25,
      severity: "critical",
      reason: "Gross margin < 25% for CPG/food brand is commodity territory. No room for marketing, growth, or profitability.",
      source: "CPG industry analysis - healthy brands need 40%+ GM",
    },
    {
      metric: "LTV/CAC Ratio",
      condition: "below",
      threshold: 1.5,
      severity: "critical",
      reason: "LTV/CAC < 1.5x means spending more to acquire customers than they're worth. Unsustainable growth model.",
      source: "D2C industry consensus",
    },
    {
      metric: "Repeat Purchase Rate",
      condition: "below",
      threshold: 20,
      severity: "critical",
      reason: "Repeat rate < 20% for food D2C indicates product-market fit issues. Customers try once and don't return.",
      source: "D2C retention benchmarks",
    },
    {
      metric: "Food Cost Ratio",
      condition: "above",
      threshold: 50,
      severity: "major",
      reason: "Food costs > 50% of revenue leaves no room for other expenses. Need reformulation or pricing power.",
      source: "Food manufacturing economics",
    },
    {
      metric: "Spoilage Rate",
      condition: "above",
      threshold: 5,
      severity: "major",
      reason: "Spoilage > 5% indicates supply chain or demand forecasting problems. Direct margin destruction.",
      source: "Food supply chain benchmarks",
    },
    {
      metric: "Customer Concentration",
      condition: "above",
      threshold: 40,
      severity: "major",
      reason: "Single customer (retailer/distributor) > 40% of revenue = dangerous dependency. They control your pricing.",
      source: "CPG distribution risk analysis",
    },
  ],

  sectorRisks: [
    "Commodity input risk: Ingredient costs can spike 20-50% unpredictably (weather, supply chain)",
    "Retailer dependency: Single retailer (Whole Foods, Costco) can delist overnight",
    "High CAC in D2C: iOS14/ATT killed cheap Facebook acquisition for food brands",
    "Perishability: Short shelf life requires precise demand forecasting and logistics",
    "Regulatory risk: FDA recalls, labeling requirements, health claims restrictions",
    "Low barriers to entry: Easy for competitors to copy products and undercut pricing",
    "Trade spend trap: Retailers demand increasing promotional spend for shelf space",
    "Seasonal demand: Many food categories have significant Q4 or summer peaks",
    "Manufacturing complexity: Co-packer relationships, minimum order quantities, quality control",
    "Alt Protein specific: Consumer adoption slower than projected, taste parity challenges",
    "Delivery/logistics: Last-mile costs for perishables can exceed product margin",
    "Private label competition: Retailers launching own brands at lower prices",
  ],

  successPatterns: [
    "Strong brand = organic acquisition: 50%+ customers from word-of-mouth/organic",
    "Retail distribution secured: Present in major chains (Whole Foods, Target, Costco)",
    "Multi-channel diversified: D2C + retail + foodservice revenue mix",
    "First-order profitable: CAC recovered on first purchase",
    "Proprietary formulation: Defensible IP in recipe, process, or ingredient sourcing",
    "Subscription model: Predictable recurring revenue with low churn",
    "Vertical integration: Own manufacturing for margin and quality control",
    "Category creation: Defining new shelf space (e.g., plant-based meat section)",
    "Celebrity/influencer equity: Authentic founder story or investor as brand ambassador",
    "B-Corp/mission-driven: Premium pricing justified by values alignment",
    "Food service anchor: Large foodservice contracts providing baseline volume",
    "International expansion: US brand with proven European or Asian traction",
  ],

  typicalAcquirers: [
    "Nestlé", "PepsiCo", "Coca-Cola", "Unilever", "Danone",
    "Kraft Heinz", "General Mills", "Kellogg's", "Mars",
    "Tyson Foods", "JBS", "Cargill", "ADM",
    "Conagra", "Mondelez", "Campbell Soup",
    "Private Equity: L Catterton, KKR, Bain Capital, TSG Consumer",
  ],

  benchmarkSearchQueries: [
    "CPG food brand benchmarks {current_year}",
    "D2C food unit economics {current_year}",
    "alt protein market growth {current_year}",
    "food brand acquisition multiples {current_year}",
    "meal kit industry metrics {current_year}",
    "foodtech VC investment trends {current_year}",
    "CPG gross margin benchmarks {current_year}",
    "food startup exits {current_year}",
    "vertical farming unit economics {current_year}",
    "plant-based meat market share {current_year}",
  ],
};

// ============================================================================
// MOBILITY/TRANSPORTATION/LOGISTICS STANDARDS
// ============================================================================

export const MOBILITY_STANDARDS: SectorStandards = {
  sector: "Mobility",
  aliases: ["Transportation", "Logistics", "Ridesharing", "Micromobility", "Fleet", "Delivery", "Last-mile", "MaaS", "Transit"],

  primaryMetrics: [
    {
      name: "Contribution Margin per Trip/Ride",
      unit: "€",
      description: "Revenue minus variable costs (driver payout, fuel, maintenance) per trip",
      direction: "higher_better",
      sectorContext: "The north star for unit economics. Must be positive for sustainable growth. Uber/Lyft took years to reach profitability because of negative contribution margins.",
      searchKeywords: ["ridesharing contribution margin", "mobility unit economics benchmark", "delivery contribution margin per order"],
    },
    {
      name: "Take Rate",
      unit: "%",
      description: "Platform fee as percentage of gross transaction value (for marketplace models)",
      direction: "higher_better",
      sectorContext: "Ridesharing: 20-30% typical. Delivery: 15-25%. Micromobility: 100% (own assets). Higher take rate = more room for profitability but driver/rider pushback risk.",
      searchKeywords: ["ridesharing take rate benchmark", "delivery platform take rate", "mobility marketplace commission"],
    },
    {
      name: "Utilization Rate",
      unit: "%",
      description: "Percentage of time assets (vehicles, bikes, scooters) are in revenue-generating use",
      direction: "higher_better",
      sectorContext: "Critical for asset-heavy models. Micromobility: 5-15% typical. Fleet vehicles: 40-60%. Ridesharing (driver time): 50-70%. Higher = better ROI on assets.",
      searchKeywords: ["vehicle utilization rate benchmark", "micromobility utilization", "fleet utilization benchmark"],
    },
    {
      name: "Driver/Rider Retention (30-day)",
      unit: "%",
      description: "Percentage of drivers/riders active after 30 days",
      direction: "higher_better",
      sectorContext: "Supply-side retention is critical. High churn = constant acquisition cost. Uber driver D30: ~50%. Good micromobility: 25-35%.",
      searchKeywords: ["ridesharing driver retention", "delivery rider retention benchmark", "gig worker retention rates"],
    },
    {
      name: "Customer Acquisition Cost (CAC)",
      unit: "€",
      description: "Cost to acquire one active customer (rider/shipper)",
      direction: "lower_better",
      sectorContext: "Mobility CAC varies widely. Ridesharing: €15-40. Delivery: €10-30. B2B logistics: €500-2000. Must recover within reasonable number of trips.",
      searchKeywords: ["mobility CAC benchmark", "ridesharing customer acquisition cost", "delivery app CAC"],
    },
  ],

  secondaryMetrics: [
    {
      name: "Trips per User per Month",
      unit: "trips",
      description: "Average number of trips per active user monthly",
      direction: "higher_better",
      sectorContext: "Indicates stickiness and habit formation. Ridesharing power users: 10+ trips/month. Delivery: 3-6 orders/month. Higher frequency = higher LTV.",
      searchKeywords: ["ridesharing trips per user", "delivery orders per user benchmark", "mobility frequency benchmark"],
    },
    {
      name: "LTV/CAC Ratio",
      unit: "x",
      description: "Customer lifetime value divided by acquisition cost",
      direction: "higher_better",
      sectorContext: "Standard 3:1 minimum applies. Mobility often struggles due to low margins. Must show path to 3:1+ for sustainable growth.",
      searchKeywords: ["mobility LTV CAC benchmark", "ridesharing unit economics", "delivery platform LTV"],
    },
    {
      name: "Dead Miles / Empty Miles Ratio",
      unit: "%",
      description: "Percentage of miles driven without passengers or cargo",
      direction: "lower_better",
      sectorContext: "Directly impacts profitability. Ridesharing: 30-40% typical. Delivery: 20-30%. Logistics: 15-25%. Optimization key differentiator.",
      searchKeywords: ["dead miles ratio benchmark", "empty miles logistics", "ridesharing efficiency metrics"],
    },
    {
      name: "Operating Ratio",
      unit: "%",
      description: "Operating expenses as percentage of revenue (logistics)",
      direction: "lower_better",
      sectorContext: "Trucking/logistics standard metric. < 90% is profitable. 90-95% breakeven zone. > 95% losing money. Best-in-class: < 85%.",
      searchKeywords: ["trucking operating ratio benchmark", "logistics operating ratio", "freight operating ratio"],
    },
    {
      name: "Asset Turnover",
      unit: "x",
      description: "Revenue generated per euro of assets (for asset-heavy models)",
      direction: "higher_better",
      sectorContext: "Measures capital efficiency. Micromobility: 0.5-1.5x. Fleet: 1-3x. Higher = better capital efficiency.",
      searchKeywords: ["fleet asset turnover", "vehicle asset turnover benchmark", "micromobility capital efficiency"],
    },
    {
      name: "Safety Incidents per Million Trips",
      unit: "incidents",
      description: "Reportable safety incidents per million trips/rides",
      direction: "lower_better",
      sectorContext: "Regulatory and insurance implications. Also reputational risk. Benchmark varies by mode. Ridesharing targets < 1 serious incident per million trips.",
      searchKeywords: ["ridesharing safety benchmark", "mobility safety incidents rate", "transportation safety metrics"],
    },
  ],

  unitEconomicsFormulas: [
    {
      name: "Contribution Margin per Trip",
      formula: "Revenue per Trip - (Driver/Rider Payout + Fuel/Energy + Insurance + Platform Fees)",
      description: "True margin after all variable costs",
      thresholds: { concerning: "< €0", good: "> €0.50", excellent: "> €1.50" },
      source: "Mobility unit economics standard",
    },
    {
      name: "Customer LTV",
      formula: "Contribution Margin per Trip × Trips per Month × Customer Lifetime (months)",
      description: "Total value from a customer over their lifetime",
      thresholds: { concerning: "< €50", good: "> €100", excellent: "> €250" },
      source: "Industry standard formula",
    },
    {
      name: "Payback Period (Trips)",
      formula: "CAC / Contribution Margin per Trip",
      description: "Number of trips to recover acquisition cost",
      thresholds: { concerning: "> 50 trips", good: "< 30 trips", excellent: "< 15 trips" },
      source: "Mobility economics analysis",
    },
    {
      name: "Asset ROI",
      formula: "(Annual Revenue per Asset - Annual Cost per Asset) / Asset Cost",
      description: "Return on investment for owned assets",
      thresholds: { concerning: "< 15%", good: "> 25%", excellent: "> 40%" },
      source: "Fleet management standard",
    },
    {
      name: "Supply-Demand Balance",
      formula: "Active Supply (drivers/vehicles) / Active Demand (requests) at peak",
      description: "Marketplace liquidity indicator",
      thresholds: { concerning: "< 0.7 or > 1.5", good: "0.8-1.2", excellent: "0.95-1.05" },
      source: "Marketplace dynamics analysis",
    },
  ],

  redFlagRules: [
    {
      metric: "Contribution Margin per Trip",
      condition: "below",
      threshold: 0,
      severity: "critical",
      reason: "Negative contribution margin = losing money on every trip. Cannot grow to profitability.",
      source: "Basic unit economics - must be positive to have path to profitability",
    },
    {
      metric: "Utilization Rate",
      condition: "below",
      threshold: 5,
      severity: "critical",
      reason: "Sub-5% utilization for owned assets = burning cash on idle inventory. Asset-light or exit.",
      source: "Micromobility industry post-mortems (Bird, Lime early struggles)",
    },
    {
      metric: "Driver/Rider Retention (30-day)",
      condition: "below",
      threshold: 20,
      severity: "critical",
      reason: "D30 < 20% for supply side = constant churn, unsustainable acquisition costs.",
      source: "Gig economy retention benchmarks",
    },
    {
      metric: "Take Rate",
      condition: "below",
      threshold: 10,
      severity: "major",
      reason: "Take rate < 10% leaves insufficient margin for platform costs and profitability.",
      source: "Marketplace economics - need sufficient take rate for sustainable business",
    },
    {
      metric: "LTV/CAC Ratio",
      condition: "below",
      threshold: 1.5,
      severity: "major",
      reason: "LTV/CAC < 1.5x in mobility = unsustainable unit economics given low margins.",
      source: "Mobility investment analysis - lower threshold than SaaS due to lower margins",
    },
    {
      metric: "Operating Ratio",
      condition: "above",
      threshold: 98,
      severity: "critical",
      reason: "Operating ratio > 98% means near-zero or negative margins - business is bleeding.",
      source: "Trucking/logistics industry standard",
    },
    {
      metric: "Dead Miles Ratio",
      condition: "above",
      threshold: 50,
      severity: "major",
      reason: "Dead miles > 50% indicates severe routing inefficiency, destroying margins.",
      source: "Fleet efficiency benchmarks",
    },
  ],

  sectorRisks: [
    "Regulatory risk: Gig worker classification (AB5, EU Platform Work Directive), operating permits, safety regulations",
    "Capital intensity: Asset-heavy models require significant upfront investment and ongoing maintenance",
    "Price sensitivity: Race to bottom on pricing, especially in competitive markets",
    "Driver/rider economics: Pressure to improve gig worker conditions increases costs",
    "Insurance costs: High and volatile, especially for new entrants without track record",
    "Seasonality: Weather-dependent demand (micromobility), holiday peaks (delivery)",
    "Local network effects: Must win city by city, geographic fragmentation",
    "Big Tech competition: Google/Apple Maps, Amazon logistics, Uber/Lyft in adjacent verticals",
    "Autonomous vehicle disruption: Long-term existential risk for driver-based models",
    "Vandalism and theft: Significant issue for shared/micromobility assets",
    "EV transition costs: Fleet electrification requires capital, charging infrastructure",
    "Fuel price volatility: Direct impact on margins for non-EV fleets",
  ],

  successPatterns: [
    "Asset-light model: Platform connecting existing supply vs owning assets",
    "Dense urban markets: Network effects stronger in high-density areas",
    "Multi-modal integration: Offering multiple transport options (MaaS)",
    "B2B focus: Higher margins, stickier contracts than B2C",
    "Vertical specialization: Focus on specific use case (medical transport, corporate)",
    "Supply-side loyalty: Programs/benefits that reduce driver churn",
    "Dynamic pricing sophistication: AI-driven pricing maximizing contribution",
    "Owned demand: Integration with large demand sources (airlines, hotels, employers)",
    "Regulatory moats: First-mover in licensed/regulated markets",
    "Data network effects: Route optimization improving with scale",
    "Subscription models: Predictable revenue from power users",
    "Last-mile for e-commerce: Riding e-commerce growth wave",
  ],

  typicalAcquirers: [
    "Uber", "Lyft", "Grab", "DiDi", "Bolt",
    "Amazon", "FedEx", "UPS", "DHL",
    "Automotive OEMs (GM, Ford, VW, Toyota)",
    "Private Equity",
    "Strategic logistics players",
  ],

  benchmarkSearchQueries: [
    "mobility startup benchmarks {current_year}",
    "ridesharing unit economics {current_year}",
    "delivery platform take rate benchmark {current_year}",
    "micromobility utilization rates {current_year}",
    "logistics operating ratio benchmark {current_year}",
    "mobility acquisitions {current_year} multiples",
    "gig economy driver retention {current_year}",
    "last-mile delivery economics {current_year}",
    "autonomous vehicle investment trends {current_year}",
  ],
};

// ============================================================================
// PROPTECH STANDARDS
// ============================================================================

export const PROPTECH_STANDARDS: SectorStandards = {
  sector: "PropTech",
  aliases: ["Real Estate Tech", "Prop Tech", "Real Estate Technology", "Construction Tech", "ConTech", "CRE Tech", "Mortgage Tech"],

  primaryMetrics: [
    {
      name: "Transaction Volume / GMV",
      unit: "$M",
      description: "Gross Merchandise Value or total transaction volume facilitated (for marketplaces/iBuyers)",
      direction: "higher_better",
      sectorContext: "Core metric for transactional PropTech. iBuying average: $50-500M/quarter. Portals: track leads, not GMV directly. SaaS PropTech: use ARR instead.",
      searchKeywords: ["proptech GMV benchmark", "real estate marketplace transaction volume", "iBuyer volume statistics"],
    },
    {
      name: "Take Rate",
      unit: "%",
      description: "Revenue as percentage of GMV (for marketplaces)",
      direction: "higher_better",
      sectorContext: "RE marketplaces: 1-3% typical (vs 10-15% for other marketplaces). iBuyers: 5-7% service fee. Mortgage: 0.5-1.5% of loan value. Higher = more value capture.",
      searchKeywords: ["real estate marketplace take rate", "proptech monetization benchmark", "real estate platform fees"],
    },
    {
      name: "Units Under Management / Doors",
      unit: "count",
      description: "Number of properties or units managed (for property management SaaS)",
      direction: "higher_better",
      sectorContext: "Core metric for PM SaaS. Revenue per door: $5-15/month typical. Scale matters - margins improve above 50K+ doors.",
      searchKeywords: ["property management software doors benchmark", "proptech units under management"],
    },
    {
      name: "Gross Margin",
      unit: "%",
      description: "Revenue minus direct costs divided by revenue",
      direction: "higher_better",
      sectorContext: "CRITICAL - varies wildly by model. SaaS PropTech: 70-85%. Marketplaces: 60-80%. iBuying: 5-15% (inventory risk!). Flex space: 20-40%. If iBuyer claims >20%, investigate.",
      searchKeywords: ["proptech gross margin by segment", "real estate tech margins", "iBuyer economics"],
    },
    {
      name: "Cycle Sensitivity Score",
      unit: "score 1-10",
      description: "How sensitive revenue is to real estate cycle and interest rates (1=immune, 10=highly exposed)",
      direction: "lower_better",
      sectorContext: "CRITICAL PropTech metric. iBuying/Mortgage: 9-10 (very exposed). PM SaaS: 3-5 (somewhat insulated). Construction SaaS: 5-7. Smart building: 4-6.",
      searchKeywords: ["proptech cycle sensitivity", "real estate tech interest rate impact", "proptech recession performance"],
    },
    {
      name: "Inventory Turnover Days",
      unit: "days",
      description: "Average days to sell inventory (for iBuyers/inventory models)",
      direction: "lower_better",
      sectorContext: "iBuyer survival metric. < 90 days: healthy. 90-180 days: concerning. > 180 days: CRITICAL - holding costs eating margin. Zillow failed at 180+ days.",
      searchKeywords: ["iBuyer inventory turnover", "opendoor days on market", "instant buying holding period"],
    },
  ],

  secondaryMetrics: [
    {
      name: "Net Revenue Retention (NRR)",
      unit: "%",
      description: "Revenue from existing customers after churn and expansion (for SaaS PropTech)",
      direction: "higher_better",
      sectorContext: "SaaS PropTech benchmark. PM SaaS: 100-110% typical. Construction SaaS: 105-115%. < 90% = product not sticky.",
      searchKeywords: ["proptech SaaS NRR benchmark", "property management software retention", "construction tech NRR"],
    },
    {
      name: "Occupancy Rate",
      unit: "%",
      description: "Percentage of available space occupied (for flex space/coworking)",
      direction: "higher_better",
      sectorContext: "Flex space viability metric. Break-even typically 65-75%. WeWork pre-crash: 80%+. COVID trough: 40-50%. Recovery: 60-70%.",
      searchKeywords: ["coworking occupancy benchmark", "flex space occupancy rates", "wework occupancy statistics"],
    },
    {
      name: "Break-even Occupancy",
      unit: "%",
      description: "Occupancy level needed to cover costs (for flex space)",
      direction: "lower_better",
      sectorContext: "Lower = more resilient. < 60%: excellent. 60-70%: good. 70-80%: risky. > 80%: very fragile. WeWork's was ~75%, killed them in downturn.",
      searchKeywords: ["coworking break-even occupancy", "flex space profitability threshold", "office space economics"],
    },
    {
      name: "Lead Conversion Rate",
      unit: "%",
      description: "Percentage of leads that convert to transactions (for portals/marketplaces)",
      direction: "higher_better",
      sectorContext: "RE portal benchmark: 2-5% lead to transaction. Higher-intent verticals (mortgage): 5-15%. Low conversion = poor lead quality.",
      searchKeywords: ["real estate lead conversion benchmark", "property portal conversion rates", "zillow lead quality"],
    },
    {
      name: "Revenue per Square Foot Managed",
      unit: "$",
      description: "Annual revenue divided by total sqft managed (for CRE tech)",
      direction: "higher_better",
      sectorContext: "CRE SaaS metric. Range: $0.10-0.50/sqft/year. Higher-value services (leasing, analytics): $0.30-0.50. Basic management: $0.10-0.20.",
      searchKeywords: ["CRE tech revenue per sqft", "commercial real estate software pricing", "property tech ARPU"],
    },
    {
      name: "Days to Close",
      unit: "days",
      description: "Average time from application to loan closing (for mortgage tech)",
      direction: "lower_better",
      sectorContext: "Mortgage tech value prop. Traditional: 45-60 days. Digital mortgage: 20-35 days. Best in class: < 20 days. Faster = competitive advantage.",
      searchKeywords: ["digital mortgage closing time", "mortgage tech speed benchmark", "loan origination time"],
    },
    {
      name: "Cost per Loan Originated",
      unit: "$",
      description: "Total cost to originate one mortgage loan (for mortgage tech)",
      direction: "lower_better",
      sectorContext: "Traditional lender: $8-10K/loan. Digital mortgage: $4-7K/loan. Best in class: < $4K. Automation reduces cost but volume dependent.",
      searchKeywords: ["mortgage origination cost benchmark", "digital lending cost per loan", "mortgage tech unit economics"],
    },
  ],

  unitEconomicsFormulas: [
    {
      name: "Take Rate Economics",
      formula: "Revenue / GMV x 100",
      description: "Revenue capture rate on transactions",
      thresholds: { concerning: "< 1%", good: "> 2%", excellent: "> 4%" },
      source: "Real estate marketplace benchmarks",
    },
    {
      name: "iBuyer Unit Economics",
      formula: "(Sale Price - Purchase Price - Holding Costs - Renovation - Transaction Costs) / Purchase Price",
      description: "Per-home margin for iBuyers",
      thresholds: { concerning: "< 3%", good: "> 5%", excellent: "> 8%" },
      source: "iBuyer industry analysis - Opendoor, Offerpad, Zillow post-mortems",
    },
    {
      name: "Revenue per Door/Unit",
      formula: "Total ARR / Units Under Management",
      description: "Monthly or annual revenue per managed property",
      thresholds: { concerning: "< $5/month", good: "> $10/month", excellent: "> $20/month" },
      source: "Property management SaaS benchmarks",
    },
    {
      name: "Flex Space Unit Economics",
      formula: "(Revenue per Desk - Cost per Desk) / Revenue per Desk",
      description: "Per-desk contribution margin",
      thresholds: { concerning: "< 20%", good: "> 35%", excellent: "> 50%" },
      source: "Coworking industry analysis",
    },
    {
      name: "Mortgage Spread",
      formula: "(Rate Charged to Borrower - Cost of Funds) x Loan Amount",
      description: "Gross margin per loan originated",
      thresholds: { concerning: "< 50bps", good: "> 100bps", excellent: "> 150bps" },
      source: "Mortgage industry benchmarks",
    },
    {
      name: "Holding Cost Burn",
      formula: "(Property Taxes + Insurance + Maintenance + Opportunity Cost) / Days Held x 30",
      description: "Monthly cost of holding inventory (iBuyers)",
      thresholds: { concerning: "> 2% of value/month", good: "< 1.5%/month", excellent: "< 1%/month" },
      source: "iBuyer financial analysis",
    },
  ],

  redFlagRules: [
    {
      metric: "Inventory Turnover Days",
      condition: "above",
      threshold: 180,
      severity: "critical",
      reason: "iBuyer with > 180 days turnover will hemorrhage cash on holding costs - this killed Zillow Offers",
      source: "Zillow Offers shutdown analysis 2021",
    },
    {
      metric: "Gross Margin (iBuying)",
      condition: "below",
      threshold: 5,
      severity: "critical",
      reason: "iBuyer gross margin < 5% cannot sustain business - no room for execution errors or market dips",
      source: "iBuyer unit economics studies",
    },
    {
      metric: "Break-even Occupancy",
      condition: "above",
      threshold: 75,
      severity: "critical",
      reason: "Flex space with break-even occupancy > 75% is extremely fragile - any downturn is fatal",
      source: "WeWork financial analysis and coworking industry studies",
    },
    {
      metric: "NRR (SaaS PropTech)",
      condition: "below",
      threshold: 85,
      severity: "critical",
      reason: "PropTech SaaS with NRR < 85% has fundamental retention problem - product not sticky for RE professionals",
      source: "B2B SaaS benchmarks adapted for PropTech",
    },
    {
      metric: "Cycle Sensitivity",
      condition: "above",
      threshold: 8,
      severity: "major",
      reason: "High cycle sensitivity (> 8/10) without hedging strategy = existential risk in RE downturn",
      source: "PropTech crash analysis 2022-2023",
    },
    {
      metric: "Geographic Concentration",
      condition: "above",
      threshold: 70,
      severity: "major",
      reason: "PropTech with > 70% revenue from one market is exposed to local regulation/cycle risk",
      source: "Real estate market concentration studies",
    },
    {
      metric: "Gross Margin (SaaS PropTech)",
      condition: "below",
      threshold: 60,
      severity: "major",
      reason: "PropTech SaaS with < 60% gross margin has cost structure problem - should be 70%+ like other SaaS",
      source: "SaaS benchmarks",
    },
  ],

  sectorRisks: [
    "Interest Rate Sensitivity: Most PropTech models are highly correlated with rates - 200bp increase can cut transaction volume 30-50%",
    "Real Estate Cycle: Housing downturns happen every 7-10 years - must survive a -20% price correction",
    "Capital Intensity: iBuying and flex space require massive capital - balance sheet risk is real",
    "Inventory Risk: Holding real estate inventory = mark-to-market losses in downturn (see Zillow)",
    "Regulatory Fragmentation: Real estate is hyper-local - licensing, rent control, zoning vary by jurisdiction",
    "Long Sales Cycles: B2B PropTech selling to brokerages/landlords can take 6-12 months to close",
    "Incumbent Resistance: RE industry is slow to adopt tech - agents, brokers often resist disruption",
    "Network Effect Illusion: Many PropTech marketplaces have weaker network effects than claimed - liquidity hard to achieve",
    "Concentration Risk: Top 5 markets often represent 50%+ of revenue - local downturn can be fatal",
    "WeWork/Zillow Precedent: Investors are traumatized by PropTech failures - harder to raise, lower multiples",
  ],

  successPatterns: [
    "Cycle-resilient model: Revenue not tied to transaction volume (SaaS, analytics, workflow tools)",
    "Capital-light: No inventory, no owned real estate, pure software/marketplace",
    "Regulatory moat: Licenses and compliance as barrier to entry (mortgage, appraisal)",
    "Vertical SaaS depth: Deep workflow integration = high switching costs",
    "Data advantage: Proprietary data improving product over time",
    "Multi-market from day one: Geographic diversification built into model",
    "B2B over B2C: Selling to RE professionals more predictable than consumer",
    "Counter-cyclical element: Some revenue benefits from downturn (default servicing, REO management)",
    "Asset-light flex space: Management contracts not owned locations",
    "Construction tech with GC relationships: Deep integration with general contractors",
  ],

  typicalAcquirers: [
    "CoStar Group", "Zillow Group", "Redfin", "Realogy",
    "RealPage", "AppFolio", "Yardi", "MRI Software",
    "Procore", "Autodesk", "Trimble",
    "Brookfield", "Blackstone", "CBRE", "JLL",
    "Private Equity (Vista, Thoma Bravo for SaaS)",
    "Big Banks (for mortgage tech)",
  ],

  benchmarkSearchQueries: [
    "proptech funding {current_year}",
    "real estate tech valuation multiples {current_year}",
    "iBuyer unit economics {current_year}",
    "property management SaaS benchmarks {current_year}",
    "construction tech market {current_year}",
    "proptech M&A exits {current_year}",
    "coworking occupancy rates {current_year}",
    "mortgage tech cost per loan {current_year}",
    "Fifth Wall proptech report {current_year}",
    "MetaProp proptech report {current_year}",
  ],
};

// ============================================================================
// CYBERSECURITY STANDARDS
// ============================================================================

export const CYBERSECURITY_STANDARDS: SectorStandards = {
  sector: "Cybersecurity",
  aliases: ["InfoSec", "Security Software", "Cyber", "Security", "Information Security", "Network Security", "Endpoint Security"],

  primaryMetrics: [
    {
      name: "Annual Recurring Revenue (ARR)",
      unit: "$M",
      description: "Total annual recurring subscription revenue",
      direction: "higher_better",
      sectorContext: "Security is recurring revenue by nature (subscriptions, licenses). ARR is the north star. Top security companies: 30-50% YoY growth at scale.",
      searchKeywords: ["cybersecurity ARR benchmark", "security software revenue growth", "infosec startup metrics"],
    },
    {
      name: "Net Revenue Retention (NRR)",
      unit: "%",
      description: "Revenue from existing customers after churn and expansion",
      direction: "higher_better",
      sectorContext: "Security has excellent NRR (threat landscape grows, compliance expands). Top quartile: 120%+. < 100% is red flag - customers not expanding or leaving.",
      searchKeywords: ["cybersecurity NRR benchmark", "security software retention rates", "infosec net retention"],
    },
    {
      name: "Gross Margin",
      unit: "%",
      description: "Revenue minus cost of goods sold (hosting, support, MSSP costs)",
      direction: "higher_better",
      sectorContext: "Pure software: 75-85%. MSSP/SOC services: 40-60%. Hardware appliances: 50-70%. Managed detection: 55-70%.",
      searchKeywords: ["cybersecurity gross margin benchmark", "security software margins", "MSSP margins"],
    },
    {
      name: "Logo Churn Rate",
      unit: "%",
      description: "Annual percentage of customers who cancel",
      direction: "lower_better",
      sectorContext: "Security is sticky (switching costs, compliance). SMB: 10-15% acceptable. Enterprise: < 5% expected. > 15% = serious product/market fit issue.",
      searchKeywords: ["cybersecurity churn rate benchmark", "security software customer retention", "SaaS security churn"],
    },
    {
      name: "Average Contract Value (ACV)",
      unit: "$K",
      description: "Average annual contract value per customer",
      direction: "higher_better",
      sectorContext: "SMB: $5-25K. Mid-market: $50-150K. Enterprise: $200K-1M+. Higher ACV = longer sales cycles but better unit economics.",
      searchKeywords: ["cybersecurity ACV benchmark", "enterprise security deal size", "infosec contract values"],
    },
  ],

  secondaryMetrics: [
    {
      name: "Magic Number",
      unit: "x",
      description: "Net new ARR / S&M spend (previous quarter)",
      direction: "higher_better",
      sectorContext: "Security sales are technical and complex. > 0.75 is good. < 0.5 indicates GTM inefficiency.",
      searchKeywords: ["cybersecurity magic number", "security sales efficiency benchmark"],
    },
    {
      name: "CAC Payback",
      unit: "months",
      description: "Months to recover customer acquisition cost",
      direction: "lower_better",
      sectorContext: "Enterprise security: 18-24 months acceptable (high ACV). SMB: < 12 months required. > 30 months = unsustainable.",
      searchKeywords: ["cybersecurity CAC payback benchmark", "security software CAC"],
    },
    {
      name: "Rule of 40",
      unit: "%",
      description: "Growth rate + profit margin",
      direction: "higher_better",
      sectorContext: "High-growth security companies often sacrifice margin for growth. R40 > 40% indicates healthy business.",
      searchKeywords: ["cybersecurity rule of 40", "security software profitability"],
    },
    {
      name: "Free Trial to Paid Conversion",
      unit: "%",
      description: "Percentage of trial users who convert to paid",
      direction: "higher_better",
      sectorContext: "PLG security products: 5-15% conversion. POC-driven enterprise: 20-40% POC-to-close.",
      searchKeywords: ["security software trial conversion", "cybersecurity PLG metrics"],
    },
    {
      name: "Time to Value (TTV)",
      unit: "days",
      description: "Days from purchase to first measurable security outcome",
      direction: "lower_better",
      sectorContext: "Critical for retention. < 7 days ideal for cloud. 30-90 days for enterprise deployments.",
      searchKeywords: ["security software deployment time", "cybersecurity implementation benchmark"],
    },
  ],

  unitEconomicsFormulas: [
    {
      name: "LTV",
      formula: "ACV x Gross Margin x (1 / Annual Churn Rate)",
      description: "Customer Lifetime Value",
      thresholds: { concerning: "< 3x CAC", good: "> 4x CAC", excellent: "> 6x CAC" },
      source: "Industry standard - security has high LTV potential due to stickiness",
    },
    {
      name: "CAC Payback",
      formula: "CAC / (ACV x Gross Margin / 12)",
      description: "Months to recover acquisition cost",
      thresholds: { concerning: "> 24 months", good: "< 18 months", excellent: "< 12 months" },
      source: "SaaS industry standard",
    },
    {
      name: "Magic Number",
      formula: "Net New ARR (Quarter) / S&M Spend (Previous Quarter)",
      description: "Sales & Marketing efficiency",
      thresholds: { concerning: "< 0.5", good: "> 0.75", excellent: "> 1.0" },
      source: "Scale Venture Partners framework",
    },
    {
      name: "Burn Multiple",
      formula: "Net Burn / Net New ARR",
      description: "Capital efficiency metric",
      thresholds: { concerning: "> 3x", good: "< 2x", excellent: "< 1.5x" },
      source: "David Sacks (Craft Ventures) framework",
    },
    {
      name: "Revenue per Security Engineer",
      formula: "ARR / Number of Security Engineers",
      description: "R&D productivity metric",
      thresholds: { concerning: "< $150K", good: "> $250K", excellent: "> $400K" },
      source: "Cybersecurity company benchmarks",
    },
  ],

  redFlagRules: [
    {
      metric: "NRR",
      condition: "below",
      threshold: 95,
      severity: "critical",
      reason: "NRR < 95% in security is alarming - the threat landscape is always expanding, customers should be buying more, not less",
      source: "Security SaaS benchmarks - security typically has NRR 110%+",
    },
    {
      metric: "Logo Churn Rate",
      condition: "above",
      threshold: 20,
      severity: "critical",
      reason: "Logo churn > 20% indicates fundamental product or market fit issues - security products should be sticky",
      source: "B2B SaaS benchmarks - security typically has lower churn",
    },
    {
      metric: "Gross Margin",
      condition: "below",
      threshold: 55,
      severity: "critical",
      reason: "Gross margin < 55% suggests high services component or infrastructure inefficiency - not a scalable security business",
      source: "Security software benchmarks - pure software should be 70%+",
    },
    {
      metric: "CAC Payback",
      condition: "above",
      threshold: 36,
      severity: "critical",
      reason: "CAC payback > 36 months is unsustainable - requires too much capital to grow",
      source: "SaaS industry consensus",
    },
    {
      metric: "Magic Number",
      condition: "below",
      threshold: 0.3,
      severity: "major",
      reason: "Magic number < 0.3 indicates severe GTM inefficiency - spending heavily but not converting",
      source: "B2B SaaS benchmarks",
    },
    {
      metric: "ACV",
      condition: "below",
      threshold: 5,
      severity: "major",
      reason: "ACV < $5K for security product is concerning - may indicate lack of enterprise value or commodity product",
      source: "B2B security product benchmarks",
    },
  ],

  sectorRisks: [
    "Platform consolidation: CrowdStrike, Microsoft, Palo Alto rolling up categories - risk of being feature, not product",
    "Commoditization: Security categories mature quickly, features become table stakes",
    "Big Tech competition: Microsoft bundling security into E5, Google Chronicle, AWS Security Hub",
    "Talent scarcity: Security engineers are expensive and scarce, high salary pressure",
    "Proof of concept fatigue: Enterprise buyers do 5-10 POCs, long and expensive sales cycles",
    "Compliance-driven only: If product only sells for compliance (not real security), vulnerable to checkbox mentality",
    "False positive fatigue: High alert volumes can lead to customer dissatisfaction",
    "Breach liability: Reputational and legal risk if customer gets breached while using product",
    "Rapid threat evolution: Must constantly update for new threats, high R&D burden",
    "Channel dependency: Heavy reliance on VARs and MSSPs can compress margins",
    "RSA/Black Hat dependency: Sales cycle tied to conference calendar",
    "Budget fragmentation: CISOs have 50+ vendors, budget spread thin",
  ],

  successPatterns: [
    "Platform play: Multiple products on single platform, land and expand",
    "Category creation: Define new security category before competition (like ZScaler did with SASE)",
    "Threat intelligence moat: Proprietary data from customer base improving detection",
    "API-first: Easy integration with existing security stack and workflows",
    "Enterprise land-and-expand: Small initial deal growing 3-5x as customer matures",
    "Compliance-plus-security: Solve compliance AND real security problems",
    "Channel mastery: Strong VAR/MSSP relationships for distribution",
    "Automation focus: Reduce security team burden, not add to it",
    "Developer security shift-left: Security for dev teams, riding DevSecOps wave",
    "Cloud-native from start: Built for cloud, not legacy product adapted",
    "High NRR > 120%: Customers expanding faster than any churn",
    "CISO advisory board: Strong relationships with security leaders",
  ],

  typicalAcquirers: [
    "Palo Alto Networks", "CrowdStrike", "Cisco", "Microsoft",
    "Fortinet", "Zscaler", "SentinelOne", "Splunk",
    "Broadcom", "Thoma Bravo", "Vista Equity", "Insight Partners",
    "Google (Mandiant/Chronicle)", "IBM Security", "Proofpoint",
  ],

  benchmarkSearchQueries: [
    "cybersecurity startup benchmarks {current_year}",
    "security software ARR growth {current_year}",
    "cybersecurity NRR benchmark {current_year}",
    "infosec company valuations {current_year}",
    "cybersecurity M&A multiples {current_year}",
    "Momentum Cyber cybersecurity report {current_year}",
    "CISO spending survey {current_year}",
    "cybersecurity market size forecast {current_year}",
    "security software gross margin benchmark",
    "cybersecurity IPO multiples {current_year}",
  ],
};

// ============================================================================
// HRTECH STANDARDS
// ============================================================================

export const HRTECH_STANDARDS: SectorStandards = {
  sector: "HRTech",
  aliases: ["HR Tech", "Workforce", "HR Software", "Human Resources Technology", "People Tech", "Talent Tech", "Payroll", "HRIS", "HCM"],

  primaryMetrics: [
    {
      name: "Net Revenue Retention (NRR)",
      unit: "%",
      description: "Revenue from existing customers after churn and expansion (headcount growth + modules)",
      direction: "higher_better",
      sectorContext: "HRTech benefits from natural expansion via headcount growth. NRR < 100% is alarming because growing companies = more employees = more revenue. Top quartile: 115%+. Enterprise HRIS: 110-120%.",
      searchKeywords: ["HRTech NRR benchmark", "HR software net retention", "HRIS retention rates"],
    },
    {
      name: "Gross Margin",
      unit: "%",
      description: "Revenue minus COGS (hosting, support, implementation labor if included)",
      direction: "higher_better",
      sectorContext: "Pure SaaS HRTech: 75-85%. With implementation services included: 60-70%. Payroll processing: 50-70% (higher compliance/ops costs). If < 60%, check implementation cost structure.",
      searchKeywords: ["HR software gross margin", "HRTech SaaS margins", "payroll software margins"],
    },
    {
      name: "Implementation Time (Days to Value)",
      unit: "days",
      description: "Average days from contract signing to customer going live",
      direction: "lower_better",
      sectorContext: "CRITICAL bottleneck in HRTech. SMB: < 30 days. Mid-market: 60-90 days. Enterprise HRIS: 120-180 days. > 180 days for mid-market = scaling problem. Self-serve < 7 days is exceptional.",
      searchKeywords: ["HR software implementation time", "HRIS deployment benchmark", "HRTech time to value"],
    },
    {
      name: "Logo Churn Rate",
      unit: "%",
      description: "Annual percentage of customers who cancel",
      direction: "lower_better",
      sectorContext: "HRTech is sticky (data migration pain, employee disruption). SMB: 10-15% acceptable. Mid-market: 5-10%. Enterprise: < 5%. > 15% = product or support issues.",
      searchKeywords: ["HR software churn rate", "HRTech customer retention", "HRIS churn benchmark"],
    },
    {
      name: "Average Contract Value (ACV)",
      unit: "$K",
      description: "Average annual contract value per customer",
      direction: "higher_better",
      sectorContext: "Varies by segment. SMB: $3-15K. Mid-market: $30-100K. Enterprise: $150K-1M+. PEPM models: ACV = employees × monthly rate × 12. Higher ACV = longer sales cycles.",
      searchKeywords: ["HRTech ACV benchmark", "HR software deal size", "HRIS contract value"],
    },
    {
      name: "CAC Payback Period",
      unit: "months",
      description: "Months to recover customer acquisition cost",
      direction: "lower_better",
      sectorContext: "Enterprise HRTech: 18-24 months acceptable (high ACV, sticky). SMB: < 12 months required. > 30 months = unsustainable, especially if churn is high.",
      searchKeywords: ["HRTech CAC payback", "HR software customer acquisition cost", "HRIS sales efficiency"],
    },
  ],

  secondaryMetrics: [
    {
      name: "Revenue per Employee Served",
      unit: "$/employee/month",
      description: "For PEPM models: monthly revenue divided by total employees on platform",
      direction: "higher_better",
      sectorContext: "PEPM pricing varies by product. Core HRIS: $5-15/emp/mo. Payroll: $10-30/emp/mo. Full suite (HRIS+Payroll+Benefits): $20-50/emp/mo. Premium enterprise: $50-100/emp/mo.",
      searchKeywords: ["PEPM pricing benchmark", "HR software per employee pricing", "HRIS PEPM rates"],
    },
    {
      name: "Services Revenue Percentage",
      unit: "%",
      description: "Implementation and professional services as percentage of total revenue",
      direction: "lower_better",
      sectorContext: "< 15%: healthy SaaS model. 15-25%: acceptable for enterprise. > 25%: services dependency, scalability concern. > 40%: this is a services business, not SaaS.",
      searchKeywords: ["HR software services revenue", "HRTech professional services mix", "HRIS implementation revenue"],
    },
    {
      name: "Sales Cycle Length",
      unit: "days",
      description: "Average days from first contact to closed-won deal",
      direction: "lower_better",
      sectorContext: "SMB: 30-60 days. Mid-market: 60-120 days. Enterprise: 120-270 days. Payroll replacement: add 30-60 days (timing with payroll cycles). RFP-driven: add 60-90 days.",
      searchKeywords: ["HRTech sales cycle", "HR software buying cycle", "enterprise HR software sales length"],
    },
    {
      name: "Customer Expansion Rate",
      unit: "%",
      description: "Annual revenue increase from existing customers (headcount + upsell)",
      direction: "higher_better",
      sectorContext: "Natural expansion from customer headcount growth + cross-sell modules. > 20% is strong. < 10% indicates limited expansion opportunity or customer base not growing.",
      searchKeywords: ["HRTech expansion revenue", "HR software upsell rate", "HRIS cross-sell benchmark"],
    },
    {
      name: "Integration Depth Score",
      unit: "count",
      description: "Number of deep integrations with major systems (ATS, ERP, benefits carriers, payroll)",
      direction: "higher_better",
      sectorContext: "HRTech lives in an ecosystem. More integrations = higher switching costs. Critical integrations: ADP, Workday, SAP, major ATS (Greenhouse, Lever), benefits carriers.",
      searchKeywords: ["HR software integrations", "HRIS integration ecosystem", "HRTech API connections"],
    },
    {
      name: "Compliance Certification Count",
      unit: "count",
      description: "Number of security/compliance certifications (SOC 2, GDPR, ISO, etc.)",
      direction: "higher_better",
      sectorContext: "Table stakes for enterprise: SOC 2 Type II. International: GDPR required. Healthcare customers: HIPAA. Financial services: additional requirements. More certs = larger addressable market.",
      searchKeywords: ["HR software compliance", "HRTech security certifications", "HRIS SOC 2 requirements"],
    },
  ],

  unitEconomicsFormulas: [
    {
      name: "LTV",
      formula: "ACV x Gross Margin x (1 / Annual Churn Rate)",
      description: "Customer Lifetime Value",
      thresholds: { concerning: "< 3x CAC", good: "> 4x CAC", excellent: "> 6x CAC" },
      source: "Industry standard - HRTech typically has high LTV due to stickiness",
    },
    {
      name: "CAC Payback",
      formula: "CAC / (ACV x Gross Margin / 12)",
      description: "Months to recover acquisition cost",
      thresholds: { concerning: "> 24 months (SMB) / > 30 months (Enterprise)", good: "< 18 months (SMB) / < 24 months (Enterprise)", excellent: "< 12 months (SMB) / < 18 months (Enterprise)" },
      source: "B2B SaaS industry standard, adjusted for HRTech sales cycles",
    },
    {
      name: "Revenue per Employee Served",
      formula: "Total ARR / Total Employees on Platform",
      description: "PEPM equivalent annual revenue",
      thresholds: { concerning: "< $60/emp/year", good: "> $120/emp/year", excellent: "> $240/emp/year" },
      source: "HRTech pricing benchmarks",
    },
    {
      name: "Implementation Efficiency Ratio",
      formula: "Implementation Revenue / Implementation Cost",
      description: "Margin on implementation services",
      thresholds: { concerning: "< 1.0 (losing money)", good: "> 1.2", excellent: "> 1.5" },
      source: "Enterprise software implementation economics",
    },
    {
      name: "Magic Number",
      formula: "Net New ARR (Quarter) / S&M Spend (Previous Quarter)",
      description: "Sales & Marketing efficiency",
      thresholds: { concerning: "< 0.5", good: "> 0.75", excellent: "> 1.0" },
      source: "Scale Venture Partners framework",
    },
    {
      name: "Burn Multiple",
      formula: "Net Burn / Net New ARR",
      description: "Capital efficiency metric",
      thresholds: { concerning: "> 3x", good: "< 2x", excellent: "< 1.5x" },
      source: "David Sacks (Craft Ventures) framework",
    },
  ],

  redFlagRules: [
    {
      metric: "NRR",
      condition: "below",
      threshold: 100,
      severity: "critical",
      reason: "NRR < 100% in HRTech is alarming - natural headcount growth should drive expansion. Indicates product not sticky or customer base shrinking.",
      source: "HRTech industry consensus - growing companies = more employees = more revenue",
    },
    {
      metric: "Implementation Time",
      condition: "above",
      threshold: 180,
      severity: "critical",
      reason: "Implementation > 180 days for mid-market is unsustainable - ties up resources, delays revenue recognition, limits growth capacity",
      source: "Enterprise software implementation benchmarks - 6 months is breaking point",
    },
    {
      metric: "Logo Churn Rate",
      condition: "above",
      threshold: 20,
      severity: "critical",
      reason: "Logo churn > 20% in HRTech indicates fundamental product or support issues - HR software should be very sticky",
      source: "B2B SaaS benchmarks - HRTech typically has lower churn than average SaaS",
    },
    {
      metric: "Services Revenue Percentage",
      condition: "above",
      threshold: 35,
      severity: "major",
      reason: "Services > 35% of revenue indicates this is a services business, not SaaS - different valuation multiple, different scalability",
      source: "Software valuation frameworks - pure SaaS valued 3-5x services businesses",
    },
    {
      metric: "Gross Margin",
      condition: "below",
      threshold: 55,
      severity: "major",
      reason: "Gross margin < 55% suggests heavy implementation burden or infrastructure inefficiency - not scalable HRTech business",
      source: "SaaS benchmarks - pure HR SaaS should be 70%+, even with services 60%+",
    },
    {
      metric: "CAC Payback Period",
      condition: "above",
      threshold: 36,
      severity: "critical",
      reason: "CAC payback > 36 months is unsustainable regardless of segment - requires too much capital to grow",
      source: "SaaS industry consensus",
    },
    {
      metric: "Sales Cycle Length",
      condition: "above",
      threshold: 365,
      severity: "major",
      reason: "Sales cycle > 12 months indicates extremely complex sale - difficult to scale, capital intensive",
      source: "Enterprise software sales benchmarks",
    },
  ],

  sectorRisks: [
    "Long implementation cycles: Can take 6-12 months for enterprise, limiting growth velocity",
    "Payroll compliance complexity: Multi-state/country payroll requires constant regulatory updates",
    "Data migration friction: Customer data (employee records, payroll history) makes switching painful - cuts both ways",
    "Seasonal sales patterns: Q4 budget decisions, Q1 implementations aligned with fiscal years",
    "HR buyer conservatism: HR departments are risk-averse, slow to adopt new vendors",
    "Platform competition: Workday, SAP, Oracle dominate enterprise with integrated suites",
    "Point solution fatigue: Too many HR tools - consolidation pressure",
    "Employee data sensitivity: PII, salary data, health info - high security bar",
    "Economic sensitivity: HR headcount correlates with economic cycles - recession = fewer employees = less revenue",
    "Implementation resource constraints: Hard to scale implementation teams, limits growth",
    "Benefits carrier relationships: Complex integrations with insurance carriers, EDI standards",
    "Payroll tax liability: Errors in payroll tax = direct liability, reputational risk",
  ],

  successPatterns: [
    "Self-serve onboarding: SMB can go live without implementation team = unlimited scale",
    "Land-and-expand: Start with one module, expand to full suite over time",
    "Payroll as anchor: Payroll creates highest switching costs, opens upsell",
    "Vertical specialization: Deep expertise in specific industry (healthcare, restaurants, staffing)",
    "International expansion: Global payroll/compliance is high-value, limited competition",
    "Employee-facing value: Features employees love (mobile app, benefits navigation) drive retention",
    "Ecosystem integrations: Deep API connections create switching costs",
    "Embedded benefits: Insurance, 401k, HSA create additional revenue streams",
    "PLG motion: Free tier or self-serve trial for SMB, scales without sales team",
    "Channel partnerships: PEO, broker, benefits consultant relationships for distribution",
    "Compliance automation: Tax filing, ACA reporting, etc. - high value, high switching cost",
    "M&A roll-up: Acquiring point solutions to build suite (Rippling model)",
  ],

  typicalAcquirers: [
    "Workday", "ADP", "Paylocity", "Paycom", "Paychex",
    "UKG (Ultimate Kronos Group)", "Ceridian", "SAP SuccessFactors",
    "Oracle HCM", "Deel", "Rippling", "Gusto",
    "Private Equity (Vista, Thoma Bravo, Hellman & Friedman)",
    "Insurance carriers (for benefits tech)",
  ],

  benchmarkSearchQueries: [
    "HRTech benchmarks {current_year}",
    "HR software metrics {current_year}",
    "HRIS market size {current_year}",
    "HRTech valuation multiples {current_year}",
    "HR software M&A {current_year}",
    "payroll software market {current_year}",
    "HRTech NRR benchmark {current_year}",
    "enterprise HR software sales cycle {current_year}",
    "PEPM pricing benchmark {current_year}",
    "HRTech IPO {current_year}",
    "Workday competitor analysis {current_year}",
    "HR software implementation time benchmark",
  ],
};

// ============================================================================
// LEGALTECH STANDARDS
// ============================================================================

export const LEGALTECH_STANDARDS: SectorStandards = {
  sector: "LegalTech",
  aliases: ["Legal Technology", "Legal Tech", "Law Tech", "RegTech", "Compliance Tech"],

  primaryMetrics: [
    {
      name: "ARR Growth YoY",
      unit: "%",
      description: "Year-over-year annual recurring revenue growth",
      direction: "higher_better",
      sectorContext: "LegalTech sales cycles are long (6-18 months for enterprise). Growth rates may be lower than typical SaaS but should still be strong.",
      searchKeywords: ["legaltech ARR growth benchmark", "legal software growth rate", "CLM growth benchmark"],
    },
    {
      name: "Net Revenue Retention (NRR)",
      unit: "%",
      description: "Revenue from existing customers after churn and expansion",
      direction: "higher_better",
      sectorContext: "Legal workflows are sticky once adopted. Best legaltech companies achieve 110-120% NRR through seat expansion and module upsell.",
      searchKeywords: ["legaltech NRR benchmark", "legal software retention", "CLM NRR"],
    },
    {
      name: "User Adoption Rate",
      unit: "%",
      description: "Percentage of licensed users actively using the product",
      direction: "higher_better",
      sectorContext: "CRITICAL: Lawyers are notoriously resistant to change. Adoption rates below 60% indicate serious risk. Industry average is 40-60%.",
      searchKeywords: ["legaltech adoption rate", "legal software user adoption", "lawyer technology adoption"],
    },
    {
      name: "Gross Margin",
      unit: "%",
      description: "Revenue minus cost of goods sold",
      direction: "higher_better",
      sectorContext: "Pure SaaS legaltech should have 75%+ margins. Heavy implementation/services can drag this to 60-70%.",
      searchKeywords: ["legaltech gross margin benchmark", "legal software margins"],
    },
    {
      name: "Professional Services Ratio",
      unit: "%",
      description: "Professional services revenue as percentage of total revenue",
      direction: "lower_better",
      sectorContext: "High services ratio (>25%) indicates complex implementation and limits scalability. Target <15% for enterprise, <10% for SMB.",
      searchKeywords: ["legaltech services ratio", "enterprise software PS ratio"],
    },
  ],

  secondaryMetrics: [
    {
      name: "Sales Cycle Length",
      unit: "months",
      description: "Average time from first contact to closed deal",
      direction: "lower_better",
      sectorContext: "BigLaw: 9-18 months. Midmarket: 3-6 months. SMB: 1-3 months. Long cycles require strong balance sheet.",
      searchKeywords: ["legaltech sales cycle", "enterprise legal software sales cycle"],
    },
    {
      name: "Implementation Time",
      unit: "months",
      description: "Time from contract to go-live",
      direction: "lower_better",
      sectorContext: "Enterprise CLM: 3-9 months typical. SMB practice management: 2-4 weeks. Long implementations delay TTV.",
      searchKeywords: ["CLM implementation time", "legal software implementation benchmark"],
    },
    {
      name: "Customer Concentration (Top 10%)",
      unit: "%",
      description: "Revenue from top 10% of customers",
      direction: "lower_better",
      sectorContext: "BigLaw customers can represent outsized revenue. >40% concentration is risky. AmLaw 100 accounts are valuable but concentrated.",
      searchKeywords: ["enterprise software customer concentration", "B2B SaaS concentration risk"],
    },
    {
      name: "Logo Churn Rate",
      unit: "%",
      description: "Annual customer logo churn",
      direction: "lower_better",
      sectorContext: "Legal workflows are sticky. Enterprise churn should be <5%. SMB can be 10-15%. Higher indicates product issues.",
      searchKeywords: ["legaltech churn rate", "legal software churn benchmark"],
    },
    {
      name: "Revenue Per Seat",
      unit: "$",
      description: "Annual revenue per licensed user seat",
      direction: "higher_better",
      sectorContext: "BigLaw: $500-2000/seat. Midmarket: $200-500/seat. SMB: $50-200/seat. Higher indicates pricing power.",
      searchKeywords: ["legaltech pricing benchmark", "legal software seat pricing"],
    },
  ],

  unitEconomicsFormulas: [
    {
      name: "LTV",
      formula: "ARPA x Gross Margin x (1 / Churn Rate)",
      description: "Customer Lifetime Value",
      thresholds: { concerning: "< 2x CAC", good: "> 3x CAC", excellent: "> 5x CAC" },
      source: "Industry standard formula",
    },
    {
      name: "CAC Payback",
      formula: "CAC / (ARPA x Gross Margin)",
      description: "Months to recover acquisition cost",
      thresholds: { concerning: "> 24 months", good: "< 18 months", excellent: "< 12 months" },
      source: "Industry standard - may be longer for enterprise legaltech due to sales cycles",
    },
    {
      name: "Implementation Payback",
      formula: "(Implementation Cost + Sales Cost) / First Year Revenue",
      description: "Time to recover full customer acquisition and onboarding cost",
      thresholds: { concerning: "> 18 months", good: "< 12 months", excellent: "< 6 months" },
      source: "Enterprise SaaS benchmark",
    },
    {
      name: "Magic Number",
      formula: "Net New ARR / S&M Spend (previous quarter)",
      description: "Sales & Marketing efficiency",
      thresholds: { concerning: "< 0.5", good: "> 0.75", excellent: "> 1.0" },
      source: "Scale Venture Partners framework - may be lower for enterprise legaltech",
    },
  ],

  redFlagRules: [
    {
      metric: "User Adoption Rate",
      condition: "below",
      threshold: 50,
      severity: "critical",
      reason: "User adoption < 50% indicates lawyers are not using the product - renewal risk is high regardless of contract terms",
      source: "Industry consensus - failed legaltech implementations typically show < 40% adoption",
    },
    {
      metric: "Professional Services Ratio",
      condition: "above",
      threshold: 30,
      severity: "major",
      reason: "Services > 30% of revenue indicates implementation complexity limiting scalability and margin potential",
      source: "Enterprise SaaS benchmarks - successful companies target < 15%",
    },
    {
      metric: "Sales Cycle Length",
      condition: "above",
      threshold: 18,
      severity: "major",
      reason: "Sales cycles > 18 months require significant capital efficiency and limit growth velocity",
      source: "Enterprise legaltech benchmarks",
    },
    {
      metric: "Customer Concentration (Top 10%)",
      condition: "above",
      threshold: 50,
      severity: "major",
      reason: "Top 10% customers > 50% of revenue creates existential risk if key accounts churn",
      source: "Enterprise SaaS risk assessment",
    },
    {
      metric: "NRR",
      condition: "below",
      threshold: 95,
      severity: "major",
      reason: "NRR < 95% in legaltech suggests product issues - legal workflows should be sticky once adopted",
      source: "LegalTech industry - sticky products should maintain 100%+",
    },
  ],

  sectorRisks: [
    "Unauthorized Practice of Law (UPL): Product features that cross into legal advice territory",
    "Bar compliance: Varying state bar regulations on technology use and fee arrangements",
    "Attorney-client privilege: Data security and confidentiality requirements for privileged communications",
    "Lawyer adoption resistance: Notoriously conservative profession slow to adopt new technology",
    "Long sales cycles: 6-18 months for enterprise deals requires capital efficiency",
    "Implementation complexity: Deep workflow integration increases time-to-value",
    "BigLaw incumbent power: Thomson Reuters, LexisNexis dominate with bundled offerings",
    "AI hallucination risk: Legal research AI citing non-existent cases (see Mata v. Avianca)",
    "Regulatory fragmentation: Different rules across jurisdictions complicate go-to-market",
    "Customer concentration: AmLaw 100 accounts valuable but create concentration risk",
  ],

  successPatterns: [
    "Workflow integration: Deep integration into existing legal workflows increases stickiness",
    "Land and expand: Start with single practice area, expand across firm",
    "Champion program: Legal ops or innovation partners driving internal adoption",
    "Time savings proof: Quantified ROI showing hours saved per matter",
    "Compliance automation: Reducing regulatory burden creates immediate value",
    "AI with human-in-the-loop: Augmenting lawyers rather than replacing them",
    "Multi-product platform: CLM + analytics + automation creates switching costs",
    "SMB focus: Shorter sales cycles, faster iteration, lower CAC",
  ],

  typicalAcquirers: [
    "Thomson Reuters",
    "LexisNexis (RELX)",
    "Wolters Kluwer",
    "Litera",
    "Intapp",
    "Clio",
    "Thoma Bravo",
    "Vista Equity Partners",
    "Insight Partners",
  ],

  benchmarkSearchQueries: [
    "legaltech benchmarks {current_year}",
    "CLM market size growth {current_year}",
    "legal software ARR benchmarks {current_year}",
    "legaltech M&A activity {current_year}",
    "legal tech valuations multiples {current_year}",
    "law firm technology adoption survey {current_year}",
    "legaltech funding trends {current_year}",
    "ALM Intelligence legaltech report {current_year}",
  ],
};

// ============================================================================
// CREATOR ECONOMY STANDARDS
// ============================================================================

export const CREATOR_STANDARDS: SectorStandards = {
  sector: "Creator Economy",
  aliases: ["Creator", "Creator Economy", "Media", "Content", "Influencer", "Influencer Marketing", "Social Media", "Podcasting", "Newsletter", "Streaming", "UGC", "Creator Tools", "Creator Platform", "Digital Media", "Media Tech", "MCN", "Talent Management"],

  primaryMetrics: [
    {
      name: "Creator Retention Rate",
      unit: "%",
      description: "Percentage of creators remaining active on platform after 12 months",
      direction: "higher_better",
      sectorContext: "THE critical metric for creator platforms. Creator churn = audience churn = revenue collapse. Top platforms: 70%+ YoY. < 50% = platform not delivering value.",
      searchKeywords: ["creator platform retention benchmark", "creator churn rate", "influencer platform retention"],
    },
    {
      name: "Revenue per Creator (RPC)",
      unit: "$",
      description: "Monthly revenue generated per active creator on platform",
      direction: "higher_better",
      sectorContext: "For B2B creator tools: $10-50/month typical SaaS. For platforms taking cut: varies by monetization model. Key LTV driver.",
      searchKeywords: ["creator platform ARPU", "creator monetization benchmarks", "creator economy revenue per user"],
    },
    {
      name: "Platform Dependency Score",
      unit: "%",
      description: "Percentage of revenue dependent on single external platform (YouTube, TikTok, Instagram, etc.)",
      direction: "lower_better",
      sectorContext: "CRITICAL RISK METRIC. > 70% from one platform = existential risk. Algorithm changes, demonetization, or policy changes can kill business overnight. Diversification is survival.",
      searchKeywords: ["creator platform dependency risk", "social media algorithm risk", "creator revenue diversification"],
    },
    {
      name: "Creator Acquisition Cost (CAC)",
      unit: "$",
      description: "Cost to acquire one active creator on platform",
      direction: "lower_better",
      sectorContext: "B2B tools: $50-200 typical. Platforms: varies by tier (micro vs mega creators). High CAC acceptable only with high LTV/retention.",
      searchKeywords: ["creator platform CAC benchmark", "influencer acquisition cost", "creator marketing cost"],
    },
    {
      name: "Engagement Rate",
      unit: "%",
      description: "Average engagement (likes + comments + shares) / followers across creators",
      direction: "higher_better",
      sectorContext: "Proxy for audience quality. Instagram: 1-3% median, 6%+ excellent. TikTok: 3-9% median. YouTube: 2-5% good. Low engagement = fake followers or dead audience.",
      searchKeywords: ["social media engagement rate benchmark", "influencer engagement rate", "creator engagement statistics"],
    },
  ],

  secondaryMetrics: [
    {
      name: "CPM / RPM",
      unit: "$",
      description: "Cost/Revenue per thousand views or impressions",
      direction: "higher_better",
      sectorContext: "Monetization efficiency. YouTube: $2-10 typical, $15-30 premium niches. TikTok: $0.50-2. Podcasts: $15-50 CPM. Higher CPM = more valuable audience.",
      searchKeywords: ["YouTube CPM benchmark", "TikTok RPM", "podcast CPM rates", "creator CPM by niche"],
    },
    {
      name: "Payout Ratio",
      unit: "%",
      description: "Percentage of revenue shared with creators (for platforms)",
      direction: "target_range",
      targetRange: { min: 50, max: 80 },
      sectorContext: "Balance between creator attraction and platform economics. YouTube: 55%. Twitch: 50-70%. Patreon: 88-95%. Too low = creators leave. Too high = unsustainable.",
      searchKeywords: ["creator platform payout ratio", "YouTube revenue share", "creator economy take rate"],
    },
    {
      name: "Owned Audience Ratio",
      unit: "%",
      description: "Percentage of audience on owned channels (email, SMS, website) vs rented (social media)",
      direction: "higher_better",
      sectorContext: "Owned audience = true moat. Email list is 10x more valuable than Instagram followers. > 20% owned = strong. < 5% = fully platform-dependent.",
      searchKeywords: ["creator owned audience benchmark", "email list value creator", "newsletter subscriber value"],
    },
    {
      name: "Monetization Diversification Score",
      unit: "count",
      description: "Number of significant revenue streams (ads, sponsors, merch, courses, memberships, etc.)",
      direction: "higher_better",
      sectorContext: "Diversification = resilience. Top creators have 4-6 streams. Single-stream (ads only) = vulnerable to demonetization.",
      searchKeywords: ["creator monetization strategies", "influencer revenue streams", "creator economy business model"],
    },
    {
      name: "Content Velocity",
      unit: "posts/week",
      description: "Average publishing frequency of creators on platform",
      direction: "higher_better",
      sectorContext: "Indicates platform engagement. YouTube: 1-2/week typical. TikTok: 3-7/week. Instagram: 3-5/week. Higher velocity = more engaged creators.",
      searchKeywords: ["content publishing frequency benchmark", "social media posting frequency", "creator content velocity"],
    },
    {
      name: "Creator NPS",
      unit: "score",
      description: "Net Promoter Score from creators on the platform",
      direction: "higher_better",
      sectorContext: "Creator satisfaction drives retention and referrals. > 50 = excellent. 20-50 = good. < 20 = churn risk.",
      searchKeywords: ["creator platform satisfaction", "influencer tool NPS", "creator economy NPS benchmark"],
    },
  ],

  unitEconomicsFormulas: [
    {
      name: "Creator LTV",
      formula: "RPC x Gross Margin x (1 / Annual Churn Rate)",
      description: "Lifetime value of a creator on platform",
      thresholds: { concerning: "< 3x CAC", good: "> 5x CAC", excellent: "> 8x CAC" },
      source: "SaaS-adapted for creator economy",
    },
    {
      name: "Platform Take Rate",
      formula: "(Platform Revenue / Creator GMV) x 100",
      description: "Percentage platform captures of total creator transactions",
      thresholds: { concerning: "> 30% (unless exceptional value)", good: "10-20%", excellent: "5-12% with volume" },
      source: "Creator platform economics",
    },
    {
      name: "Audience Value",
      formula: "Total Followers x Engagement Rate x CPM / 1000",
      description: "Estimated monetization potential of audience",
      thresholds: { concerning: "< $0.10/follower", good: "> $0.50/follower", excellent: "> $2/follower" },
      source: "Influencer marketing valuations",
    },
    {
      name: "Creator ROI",
      formula: "(Creator Earnings - Creator Costs) / Creator Costs",
      description: "Return on creator's time and investment",
      thresholds: { concerning: "< 2x", good: "> 5x", excellent: "> 10x" },
      source: "Creator economy analysis",
    },
    {
      name: "Monetization Efficiency",
      formula: "Total Revenue / Total Views x 1000",
      description: "Revenue generated per thousand views",
      thresholds: { concerning: "< $1", good: "> $5", excellent: "> $15" },
      source: "Creator monetization benchmarks",
    },
  ],

  redFlagRules: [
    {
      metric: "Platform Dependency",
      condition: "above",
      threshold: 80,
      severity: "critical",
      reason: "Platform dependency > 80% is existential risk - single algorithm change, policy update, or demonetization can destroy the business overnight",
      source: "Numerous creator business collapses after platform changes (Vine, YouTube adpocalypse, TikTok bans)",
    },
    {
      metric: "Creator Retention Rate",
      condition: "below",
      threshold: 40,
      severity: "critical",
      reason: "Creator retention < 40% means platform not delivering value - creators are the product, losing them = losing everything",
      source: "Creator platform economics - retention is the fundamental metric",
    },
    {
      metric: "Creator Concentration",
      condition: "above",
      threshold: 50,
      severity: "critical",
      reason: "Top 10 creators representing > 50% of revenue = single point of failure. One creator departure can crater the business",
      source: "MCN/creator business analysis - creator concentration killed many early MCNs",
    },
    {
      metric: "Payout Ratio",
      condition: "below",
      threshold: 40,
      severity: "major",
      reason: "Payout ratio < 40% may signal creator exploitation - competitors offering better deals will poach top creators",
      source: "Creator platform competitive dynamics",
    },
    {
      metric: "Engagement Rate",
      condition: "below",
      threshold: 1,
      severity: "major",
      reason: "Engagement rate < 1% suggests fake followers, bot activity, or dead audience - no real monetization potential",
      source: "Social media authenticity benchmarks",
    },
    {
      metric: "Owned Audience Ratio",
      condition: "below",
      threshold: 5,
      severity: "major",
      reason: "Owned audience < 5% means 95%+ dependent on social platforms - no direct relationship with audience, no moat",
      source: "Creator business sustainability analysis",
    },
  ],

  sectorRisks: [
    "Algorithm dependency: Platform algorithm changes can cut reach 50-90% overnight (Facebook Reach, YouTube Adpocalypse, TikTok recommendations)",
    "Demonetization risk: Content policy violations can instantly stop revenue (YouTube demonetization, Twitch bans)",
    "Platform risk: Platform decline or ban destroys businesses (Vine shutdown, potential TikTok ban)",
    "Creator concentration: Top creators can leave, taking audience with them - especially if not contractually locked",
    "Authenticity crisis: Fake followers, engagement fraud undermine influencer marketing effectiveness",
    "Brand safety: Creator scandals damage brand partnerships for entire platform/category",
    "Rate deflation: Oversupply of creators pushing down sponsorship rates",
    "AI content competition: AI-generated content threatening human creators in some categories",
    "Attention fragmentation: New platforms constantly splitting audience attention",
    "Regulatory risk: FTC disclosure rules, COPPA for kids content, international content regulations",
    "Burnout and mental health: Creator burnout leads to account abandonment and churn",
    "Copycat risk: Successful creator formats easily copied by competitors",
  ],

  successPatterns: [
    "Multi-platform presence: Audience diversified across 3+ platforms reduces single-platform risk",
    "Owned audience: Strong email list (100K+), SMS, or community platform for direct audience access",
    "Diversified monetization: 4+ revenue streams (ads, sponsors, merch, courses, memberships, licensing)",
    "Creator exclusivity: Exclusive contracts with top creators creating moat (but costly)",
    "Vertical niche dominance: #1 platform for specific creator category (finance creators, gaming streamers)",
    "Tools that increase earnings: Products that measurably improve creator income have strongest retention",
    "Community and network effects: Creator communities creating peer value beyond platform features",
    "B2B enterprise pivot: Selling creator-related services to brands/agencies (higher ACV, more stable)",
    "Data and analytics moat: Proprietary data on creator performance and audience insights",
    "Content licensing: Owning or licensing content for broader distribution rights",
    "Subscription/membership model: Recurring revenue from creators or fans more stable than transaction-based",
    "Cross-platform tools: Tools that work across platforms are more valuable than single-platform tools",
  ],

  typicalAcquirers: [
    "Meta (Facebook/Instagram)", "Google (YouTube)", "ByteDance (TikTok)", "Amazon (Twitch)",
    "Spotify", "Apple", "Netflix", "Disney",
    "WPP", "Omnicom", "Publicis", "IPG (agency holding companies)",
    "Patreon", "Substack", "Kajabi", "Teachable",
    "Canva", "Adobe", "HubSpot (for creator marketing tools)",
    "Private Equity (for roll-ups of creator tools/agencies)",
  ],

  benchmarkSearchQueries: [
    "creator economy market size {current_year}",
    "influencer marketing benchmark {current_year}",
    "creator monetization statistics {current_year}",
    "YouTube CPM rates {current_year}",
    "TikTok creator fund payouts {current_year}",
    "podcast advertising CPM {current_year}",
    "newsletter monetization benchmark {current_year}",
    "creator platform retention rates {current_year}",
    "influencer engagement rate benchmark {current_year}",
    "creator economy exits acquisitions {current_year}",
    "SignalFire creator economy report {current_year}",
    "Goldman Sachs creator economy {current_year}",
  ],
};

// ============================================================================
// EXPORT & LOOKUP
// ============================================================================

export const SECTOR_STANDARDS: Record<string, SectorStandards> = {
  // SaaS
  "SaaS": SAAS_STANDARDS,
  "SaaS B2B": SAAS_STANDARDS,
  "B2B SaaS": SAAS_STANDARDS,

  // Fintech
  "Fintech": FINTECH_STANDARDS,
  "Financial Technology": FINTECH_STANDARDS,

  // Marketplace
  "Marketplace": MARKETPLACE_STANDARDS,
  "Platform": MARKETPLACE_STANDARDS,

  // AI
  "AI": AI_STANDARDS,
  "AI/ML": AI_STANDARDS,
  "Machine Learning": AI_STANDARDS,
  "GenAI": AI_STANDARDS,
  "LLM": AI_STANDARDS,

  // HealthTech
  "HealthTech": HEALTHTECH_STANDARDS,
  "Digital Health": HEALTHTECH_STANDARDS,
  "Healthcare": HEALTHTECH_STANDARDS,

  // DeepTech
  "DeepTech": DEEPTECH_STANDARDS,
  "Deep Technology": DEEPTECH_STANDARDS,
  "Hard Tech": DEEPTECH_STANDARDS,

  // Climate
  "Climate": CLIMATE_STANDARDS,
  "CleanTech": CLIMATE_STANDARDS,
  "Climate Tech": CLIMATE_STANDARDS,

  // Consumer
  "Consumer": CONSUMER_STANDARDS,
  "D2C": CONSUMER_STANDARDS,
  "E-commerce": CONSUMER_STANDARDS,

  // Gaming
  "Gaming": GAMING_STANDARDS,
  "Mobile Gaming": GAMING_STANDARDS,
  "Video Games": GAMING_STANDARDS,

  // Hardware
  "Hardware": HARDWARE_STANDARDS,
  "IoT": HARDWARE_STANDARDS,
  "Hardware/IoT": HARDWARE_STANDARDS,

  // BioTech
  "BioTech": BIOTECH_STANDARDS,
  "Biotech": BIOTECH_STANDARDS,
  "Life Sciences": BIOTECH_STANDARDS,
  "Pharma": BIOTECH_STANDARDS,
  "Drug Discovery": BIOTECH_STANDARDS,
  "Therapeutics": BIOTECH_STANDARDS,
  "Biopharma": BIOTECH_STANDARDS,

  // EdTech
  "EdTech": EDTECH_STANDARDS,
  "Ed Tech": EDTECH_STANDARDS,
  "Education": EDTECH_STANDARDS,
  "Education Technology": EDTECH_STANDARDS,
  "E-Learning": EDTECH_STANDARDS,
  "Online Learning": EDTECH_STANDARDS,
  "Learning Platform": EDTECH_STANDARDS,

  // FoodTech
  "FoodTech": FOODTECH_STANDARDS,
  "Food Tech": FOODTECH_STANDARDS,
  "Food": FOODTECH_STANDARDS,
  "F&B": FOODTECH_STANDARDS,
  "Food & Beverage": FOODTECH_STANDARDS,
  "AgTech": FOODTECH_STANDARDS,
  "AgriTech": FOODTECH_STANDARDS,
  "Alt Protein": FOODTECH_STANDARDS,
  "Alternative Protein": FOODTECH_STANDARDS,
  "Plant-Based": FOODTECH_STANDARDS,
  "Meal Kit": FOODTECH_STANDARDS,
  "Dark Kitchen": FOODTECH_STANDARDS,
  "Ghost Kitchen": FOODTECH_STANDARDS,
  "Vertical Farming": FOODTECH_STANDARDS,
  "CPG Food": FOODTECH_STANDARDS,

  // Mobility
  "Mobility": MOBILITY_STANDARDS,
  "Transportation": MOBILITY_STANDARDS,
  "Logistics": MOBILITY_STANDARDS,
  "Ridesharing": MOBILITY_STANDARDS,
  "Rideshare": MOBILITY_STANDARDS,
  "Micromobility": MOBILITY_STANDARDS,
  "Fleet": MOBILITY_STANDARDS,
  "Fleet Management": MOBILITY_STANDARDS,
  "Delivery": MOBILITY_STANDARDS,
  "Last-mile": MOBILITY_STANDARDS,
  "Last Mile": MOBILITY_STANDARDS,
  "MaaS": MOBILITY_STANDARDS,
  "Mobility as a Service": MOBILITY_STANDARDS,
  "Transit": MOBILITY_STANDARDS,
  "Freight": MOBILITY_STANDARDS,
  "Trucking": MOBILITY_STANDARDS,
  "Shipping": MOBILITY_STANDARDS,
  "Supply Chain": MOBILITY_STANDARDS,

  // PropTech
  "PropTech": PROPTECH_STANDARDS,
  "Prop Tech": PROPTECH_STANDARDS,
  "Real Estate Tech": PROPTECH_STANDARDS,
  "Real Estate Technology": PROPTECH_STANDARDS,
  "Real Estate": PROPTECH_STANDARDS,
  "Construction Tech": PROPTECH_STANDARDS,
  "ConTech": PROPTECH_STANDARDS,
  "Mortgage Tech": PROPTECH_STANDARDS,
  "CRE Tech": PROPTECH_STANDARDS,
  "Commercial Real Estate": PROPTECH_STANDARDS,
  "Property Management": PROPTECH_STANDARDS,
  "Co-working": PROPTECH_STANDARDS,
  "Coworking": PROPTECH_STANDARDS,
  "Smart Building": PROPTECH_STANDARDS,
  "iBuying": PROPTECH_STANDARDS,

  // Cybersecurity
  "Cybersecurity": CYBERSECURITY_STANDARDS,
  "Cyber": CYBERSECURITY_STANDARDS,
  "InfoSec": CYBERSECURITY_STANDARDS,
  "Information Security": CYBERSECURITY_STANDARDS,
  "Security Software": CYBERSECURITY_STANDARDS,
  "Network Security": CYBERSECURITY_STANDARDS,
  "Endpoint Security": CYBERSECURITY_STANDARDS,
  "Cloud Security": CYBERSECURITY_STANDARDS,
  "Application Security": CYBERSECURITY_STANDARDS,
  "AppSec": CYBERSECURITY_STANDARDS,
  "DevSecOps": CYBERSECURITY_STANDARDS,
  "Security": CYBERSECURITY_STANDARDS,
  "SIEM": CYBERSECURITY_STANDARDS,
  "SOAR": CYBERSECURITY_STANDARDS,
  "XDR": CYBERSECURITY_STANDARDS,
  "EDR": CYBERSECURITY_STANDARDS,
  "IAM": CYBERSECURITY_STANDARDS,
  "Identity": CYBERSECURITY_STANDARDS,
  "Zero Trust": CYBERSECURITY_STANDARDS,
  "Threat Intelligence": CYBERSECURITY_STANDARDS,
  "Vulnerability Management": CYBERSECURITY_STANDARDS,
  "Penetration Testing": CYBERSECURITY_STANDARDS,
  "MSSP": CYBERSECURITY_STANDARDS,
  "SOC": CYBERSECURITY_STANDARDS,

  // HRTech
  "HRTech": HRTECH_STANDARDS,
  "HR Tech": HRTECH_STANDARDS,
  "HR Software": HRTECH_STANDARDS,
  "Human Resources": HRTECH_STANDARDS,
  "Human Resources Technology": HRTECH_STANDARDS,
  "People Tech": HRTECH_STANDARDS,
  "Talent Tech": HRTECH_STANDARDS,
  "Workforce": HRTECH_STANDARDS,
  "Workforce Management": HRTECH_STANDARDS,
  "WFM": HRTECH_STANDARDS,
  "Payroll": HRTECH_STANDARDS,
  "Payroll Software": HRTECH_STANDARDS,
  "HRIS": HRTECH_STANDARDS,
  "HCM": HRTECH_STANDARDS,
  "Human Capital Management": HRTECH_STANDARDS,
  "ATS": HRTECH_STANDARDS,
  "Applicant Tracking": HRTECH_STANDARDS,
  "Recruiting": HRTECH_STANDARDS,
  "Recruitment": HRTECH_STANDARDS,
  "Recruiting Software": HRTECH_STANDARDS,
  "Talent Management": HRTECH_STANDARDS,
  "Talent Acquisition": HRTECH_STANDARDS,
  "Benefits Administration": HRTECH_STANDARDS,
  "Benefits Tech": HRTECH_STANDARDS,
  "Employee Engagement": HRTECH_STANDARDS,
  "Performance Management": HRTECH_STANDARDS,
  "L&D": HRTECH_STANDARDS,
  "Learning & Development": HRTECH_STANDARDS,
  "Compensation": HRTECH_STANDARDS,
  "Comp Tech": HRTECH_STANDARDS,
  "PEO": HRTECH_STANDARDS,
  "Professional Employer Organization": HRTECH_STANDARDS,
  "EOR": HRTECH_STANDARDS,
  "Employer of Record": HRTECH_STANDARDS,

  // LegalTech
  "LegalTech": LEGALTECH_STANDARDS,
  "Legal Tech": LEGALTECH_STANDARDS,
  "Legal Technology": LEGALTECH_STANDARDS,
  "Law Tech": LEGALTECH_STANDARDS,
  "Legal Software": LEGALTECH_STANDARDS,
  "CLM": LEGALTECH_STANDARDS,
  "Contract Lifecycle Management": LEGALTECH_STANDARDS,
  "Contract Management": LEGALTECH_STANDARDS,
  "Legal Practice Management": LEGALTECH_STANDARDS,
  "Practice Management": LEGALTECH_STANDARDS,
  "Legal Research": LEGALTECH_STANDARDS,
  "E-Discovery": LEGALTECH_STANDARDS,
  "eDiscovery": LEGALTECH_STANDARDS,
  "Document Automation": LEGALTECH_STANDARDS,
  "Legal Document Automation": LEGALTECH_STANDARDS,
  "Legal AI": LEGALTECH_STANDARDS,
  "Legal Analytics": LEGALTECH_STANDARDS,
  "Litigation Analytics": LEGALTECH_STANDARDS,
  "Legal Marketplace": LEGALTECH_STANDARDS,
  "Law Firm Software": LEGALTECH_STANDARDS,
  "Legal Billing": LEGALTECH_STANDARDS,
  "Legal Ops": LEGALTECH_STANDARDS,
  "Legal Operations": LEGALTECH_STANDARDS,
  "IP Management": LEGALTECH_STANDARDS,
  "Intellectual Property": LEGALTECH_STANDARDS,

  // Creator Economy
  "Creator Economy": CREATOR_STANDARDS,
  "Creator": CREATOR_STANDARDS,
  "Media": CREATOR_STANDARDS,
  "Content": CREATOR_STANDARDS,
  "Influencer": CREATOR_STANDARDS,
  "Influencer Marketing": CREATOR_STANDARDS,
  "Social Media": CREATOR_STANDARDS,
  "Podcasting": CREATOR_STANDARDS,
  "Podcast": CREATOR_STANDARDS,
  "Newsletter": CREATOR_STANDARDS,
  "Streaming": CREATOR_STANDARDS,
  "UGC": CREATOR_STANDARDS,
  "User Generated Content": CREATOR_STANDARDS,
  "Creator Tools": CREATOR_STANDARDS,
  "Creator Platform": CREATOR_STANDARDS,
  "Patreon": CREATOR_STANDARDS,
  "Substack": CREATOR_STANDARDS,
  "YouTube": CREATOR_STANDARDS,
  "TikTok": CREATOR_STANDARDS,
  "Twitch": CREATOR_STANDARDS,
  "OnlyFans": CREATOR_STANDARDS,
  "Creator Talent": CREATOR_STANDARDS,
  "MCN": CREATOR_STANDARDS,
  "Multi-Channel Network": CREATOR_STANDARDS,
  "Digital Media": CREATOR_STANDARDS,
  "Media Tech": CREATOR_STANDARDS,
};

/**
 * Get sector standards by name (case-insensitive, with partial matching)
 */
export function getSectorStandards(sector: string): SectorStandards | null {
  const normalized = sector.toLowerCase().trim();

  // Try exact match first
  for (const [key, data] of Object.entries(SECTOR_STANDARDS)) {
    if (key.toLowerCase() === normalized) {
      return data;
    }
  }

  // Try alias match
  for (const data of Object.values(SECTOR_STANDARDS)) {
    if (data.aliases.some(alias => alias.toLowerCase() === normalized)) {
      return data;
    }
  }

  // Try partial match
  for (const [key, data] of Object.entries(SECTOR_STANDARDS)) {
    if (normalized.includes(key.toLowerCase()) || key.toLowerCase().includes(normalized)) {
      return data;
    }
  }

  return null;
}

/**
 * Get benchmark search queries with current year substituted
 */
export function getBenchmarkSearchQueries(sector: string): string[] {
  const standards = getSectorStandards(sector);
  if (!standards) return [];

  const currentYear = new Date().getFullYear();
  return standards.benchmarkSearchQueries.map(query =>
    query.replace("{current_year}", String(currentYear))
  );
}
