/**
 * Hardware Expert Agent - TIER 2
 *
 * Expert sectoriel pour les deals Hardware, IoT et Robotics.
 *
 * STANDARDS: Big4 + Partner VC
 * - Chaque métrique comparée aux benchmarks sectoriels avec percentile
 * - Red flags avec evidence, severity, impact quantifié, question de validation
 * - Cross-reference obligatoire avec Funding DB
 * - Output actionnable: nego ammo, killer questions, manufacturing risks
 *
 * SPÉCIFICITÉS HARDWARE:
 * - Unit economics à scale (BOM, NRE, tooling amortis)
 * - Attach rate software/services (clé de la valorisation)
 * - Manufacturing risks (supply chain, certifications, quality)
 * - Time to production (hardware timelines are brutal)
 * - Capital intensity (inventory, tooling, certifications)
 */

import { z } from "zod";
import type { AgentResult, EnrichedAgentContext } from "../types";
import {
  SectorExpertOutputSchema,
  type SectorExpertOutput,
  type SectorConfig,
  type SectorBenchmarkData,
} from "./base-sector-expert";
import type { SectorExpertResult, SectorExpertData } from "./types";
import {
  mapMaturity,
  mapAssessment,
  mapSeverity,
  mapCompetition,
  mapConsolidation,
  mapBarrier,
} from "./output-mapper";
import { HARDWARE_STANDARDS } from "./sector-standards";
import { getStandardsOnlyInjection } from "./benchmark-injector";
import { complete, setAgentContext, extractFirstJSON } from "@/services/openrouter/router";

// =============================================================================
// HARDWARE-SPECIFIC BENCHMARK DATA (Enriched)
// =============================================================================

const HARDWARE_BENCHMARK_DATA: SectorBenchmarkData & {
  sectorSpecificRisks: string[];
  sectorSuccessPatterns: string[];
} = {
  // =========================================================================
  // PRIMARY METRICS - Les 5 KPIs critiques Hardware
  // =========================================================================
  primaryMetrics: [
    {
      name: "Hardware Gross Margin",
      unit: "%",
      description: "Marge brute sur les ventes hardware (hors software/services)",
      direction: "higher_better",
      stages: {
        PRE_SEED: { p25: 20, median: 30, p75: 42, topDecile: 55 },
        SEED: { p25: 25, median: 35, p75: 48, topDecile: 60 },
        SERIES_A: { p25: 30, median: 40, p75: 52, topDecile: 65 },
        SERIES_B: { p25: 35, median: 45, p75: 55, topDecile: 68 },
      },
      thresholds: {
        exceptional: 50,
        good: 35,
        concerning: 20,
      },
      sectorContext:
        "Consumer hardware: 30-40%. Enterprise/Industrial: 40-60%. Apple-tier: 60%+. " +
        "< 25% laisse zéro marge pour erreurs manufacturing ou pricing pressure.",
      source: "First Round Hardware Report 2024, a]6z Hardware Index",
    },
    {
      name: "Attach Rate",
      unit: "%",
      description: "% de clients hardware avec revenu récurrent (software/services/data)",
      direction: "higher_better",
      stages: {
        PRE_SEED: { p25: 10, median: 25, p75: 45, topDecile: 70 },
        SEED: { p25: 15, median: 35, p75: 55, topDecile: 80 },
        SERIES_A: { p25: 25, median: 45, p75: 65, topDecile: 85 },
        SERIES_B: { p25: 35, median: 55, p75: 75, topDecile: 90 },
      },
      thresholds: {
        exceptional: 60,
        good: 40,
        concerning: 15,
      },
      sectorContext:
        "L'attach rate est LE différenciateur entre hardware commodity (2-4x exit) " +
        "et hardware-enabled software (8-15x exit). Ring, Nest, Peloton = 60%+ attach rate. " +
        "Sans software attach, c'est un business de commodity avec zero moat.",
      source: "Bessemer Hardware Index, Lux Capital Hardware Playbook",
    },
    {
      name: "Blended Gross Margin",
      unit: "%",
      description: "Marge combinée hardware + software/services pondérée par revenue mix",
      direction: "higher_better",
      stages: {
        PRE_SEED: { p25: 30, median: 42, p75: 55, topDecile: 68 },
        SEED: { p25: 35, median: 48, p75: 60, topDecile: 72 },
        SERIES_A: { p25: 40, median: 52, p75: 65, topDecile: 75 },
        SERIES_B: { p25: 45, median: 55, p75: 68, topDecile: 78 },
      },
      thresholds: {
        exceptional: 60,
        good: 48,
        concerning: 30,
      },
      sectorContext:
        "La blended margin est la vraie mesure de la qualité du business model. " +
        "Pure hardware: 30-40%. Hardware + SaaS: 50-65%. Apple: 43% mais massive scale. " +
        "Les meilleures hardware companies ont 50%+ grâce au software attach.",
      source: "First Round Hardware Report, public company filings",
    },
    {
      name: "Time to Production",
      unit: "months",
      description: "Temps du prototype fonctionnel à la production de masse (10K+ units)",
      direction: "lower_better",
      stages: {
        PRE_SEED: { p25: 30, median: 24, p75: 18, topDecile: 12 },
        SEED: { p25: 24, median: 18, p75: 12, topDecile: 6 },
        SERIES_A: { p25: 18, median: 12, p75: 8, topDecile: 4 },
        SERIES_B: { p25: 12, median: 9, p75: 6, topDecile: 3 },
      },
      thresholds: {
        exceptional: 9,
        good: 15,
        concerning: 30,
      },
      sectorContext:
        "Hardware timelines are BRUTAL. La règle: multiplier par 2 toute estimation fondateur. " +
        "> 24 mois = risque majeur de runway burnout. > 36 mois = risque critique majeur." +
        "Causes fréquentes de delay: certifications (6-12mo), tooling (4-8mo), supply chain.",
      source: "HAX Accelerator data, Bolt Hardware timing studies",
    },
    {
      name: "Unit Economics at Scale",
      unit: "x",
      description: "Ratio (Revenue per unit / COGS per unit) à 10K+ units produits",
      direction: "higher_better",
      stages: {
        PRE_SEED: { p25: 1.2, median: 1.5, p75: 1.9, topDecile: 2.5 },
        SEED: { p25: 1.3, median: 1.6, p75: 2.0, topDecile: 2.8 },
        SERIES_A: { p25: 1.5, median: 1.8, p75: 2.3, topDecile: 3.2 },
        SERIES_B: { p25: 1.6, median: 2.0, p75: 2.6, topDecile: 3.5 },
      },
      thresholds: {
        exceptional: 2.5,
        good: 1.8,
        concerning: 1.2,
      },
      sectorContext:
        "Les unit economics early-stage sont TOUJOURS pires qu'à scale (30-50% improvement expected). " +
        "< 1.2x à scale = business non viable. Model BOM at 10K, 50K, 100K units. " +
        "Key drivers: component volume discounts (20-40%), assembly efficiency (+15-25%), packaging.",
      source: "Bolt Hardware economics, PCH International benchmarks",
    },
  ],

  // =========================================================================
  // SECONDARY METRICS - Indicateurs de santé opérationnelle
  // =========================================================================
  secondaryMetrics: [
    {
      name: "Return Rate",
      unit: "%",
      description: "% d'unités retournées dans les 30 jours post-livraison",
      direction: "lower_better",
      stages: {
        PRE_SEED: { p25: 15, median: 10, p75: 5, topDecile: 2 },
        SEED: { p25: 12, median: 8, p75: 4, topDecile: 1.5 },
        SERIES_A: { p25: 8, median: 5, p75: 2.5, topDecile: 1 },
        SERIES_B: { p25: 6, median: 4, p75: 2, topDecile: 0.8 },
      },
      thresholds: {
        exceptional: 2,
        good: 5,
        concerning: 12,
      },
      sectorContext:
        "Return rate > 10% = signal de problème qualité ou product-market fit. " +
        "Consumer electronics industry avg: 5-8%. Premium brands: 2-3%. " +
        "Chaque return coûte ~30% du prix de vente (shipping, restock, refurb).",
      source: "Consumer Technology Association, Amazon seller data",
    },
    {
      name: "BOM Cost Reduction YoY",
      unit: "%",
      description: "Réduction annuelle du Bill of Materials à iso-fonctionnalités",
      direction: "higher_better",
      stages: {
        PRE_SEED: { p25: 3, median: 8, p75: 18, topDecile: 30 },
        SEED: { p25: 5, median: 12, p75: 22, topDecile: 35 },
        SERIES_A: { p25: 8, median: 15, p75: 25, topDecile: 40 },
        SERIES_B: { p25: 10, median: 18, p75: 28, topDecile: 45 },
      },
      thresholds: {
        exceptional: 25,
        good: 15,
        concerning: 3,
      },
      sectorContext:
        "10-20% BOM reduction par an est standard avec scale et design iterations. " +
        "< 5% = design figé trop tôt ou manque d'expertise manufacturing. " +
        "Sources: volume discounts (30%), design-for-manufacturing (25%), component consolidation (20%).",
      source: "PCH International, Fictiv manufacturing data",
    },
    {
      name: "Certification Lead Time",
      unit: "months",
      description: "Temps moyen pour obtenir les certifications requises (FCC, CE, UL, etc.)",
      direction: "lower_better",
      stages: {
        PRE_SEED: { p25: 12, median: 9, p75: 6, topDecile: 3 },
        SEED: { p25: 10, median: 7, p75: 5, topDecile: 3 },
        SERIES_A: { p25: 8, median: 5, p75: 3, topDecile: 2 },
        SERIES_B: { p25: 6, median: 4, p75: 2.5, topDecile: 1.5 },
      },
      thresholds: {
        exceptional: 4,
        good: 7,
        concerning: 12,
      },
      sectorContext:
        "Certifications sont souvent le goulot d'étranglement ignoré. " +
        "FCC: 2-4 mois. CE marking: 3-6 mois. UL/safety: 4-8 mois. Medical devices: 12-24 mois. " +
        "Pre-certification testing peut réduire de 40% le temps total.",
      source: "UL Labs, TÜV Rheinland data",
    },
    {
      name: "Inventory Turns",
      unit: "x/year",
      description: "Nombre de fois que l'inventaire est renouvelé par an",
      direction: "higher_better",
      stages: {
        PRE_SEED: { p25: 2, median: 4, p75: 7, topDecile: 12 },
        SEED: { p25: 3, median: 5, p75: 8, topDecile: 14 },
        SERIES_A: { p25: 4, median: 6, p75: 10, topDecile: 16 },
        SERIES_B: { p25: 5, median: 8, p75: 12, topDecile: 18 },
      },
      thresholds: {
        exceptional: 10,
        good: 6,
        concerning: 2,
      },
      sectorContext:
        "Low inventory turns = cash trapped in unsold products. " +
        "Consumer electronics: 6-10x. Fashion/seasonal: 4-6x. Industrial: 3-5x. " +
        "Apple: 40x (best-in-class supply chain). < 3x = major working capital issue.",
      source: "Supply Chain Digest, public company filings",
    },
    {
      name: "Warranty Cost Rate",
      unit: "%",
      description: "Coût des garanties/SAV en % du revenue hardware",
      direction: "lower_better",
      stages: {
        PRE_SEED: { p25: 8, median: 5, p75: 3, topDecile: 1.5 },
        SEED: { p25: 6, median: 4, p75: 2.5, topDecile: 1 },
        SERIES_A: { p25: 5, median: 3, p75: 1.8, topDecile: 0.8 },
        SERIES_B: { p25: 4, median: 2.5, p75: 1.5, topDecile: 0.6 },
      },
      thresholds: {
        exceptional: 1.5,
        good: 3,
        concerning: 6,
      },
      sectorContext:
        "Warranty costs > 5% signalent des problèmes qualité systémiques. " +
        "Industry avg: 2-4%. Premium brands visent < 2%. " +
        "Coûts cachés: support, shipping, diagnosis, remplacement, réputation.",
      source: "Warranty Week, consumer electronics industry data",
    },
    {
      name: "NRE as % of First Production",
      unit: "%",
      description: "Non-Recurring Engineering costs / Revenue première année de production",
      direction: "lower_better",
      stages: {
        PRE_SEED: { p25: 80, median: 50, p75: 30, topDecile: 15 },
        SEED: { p25: 60, median: 40, p75: 25, topDecile: 12 },
        SERIES_A: { p25: 45, median: 30, p75: 18, topDecile: 8 },
        SERIES_B: { p25: 35, median: 22, p75: 12, topDecile: 5 },
      },
      thresholds: {
        exceptional: 20,
        good: 40,
        concerning: 70,
      },
      sectorContext:
        "NRE = tooling, molds, certifications, engineering. " +
        "Amortir sur Year 1 revenue. > 50% = besoin de beaucoup de volume pour breakeven. " +
        "Injection molds: $50K-500K. PCBA tooling: $10K-50K. Certifications: $50K-200K.",
      source: "Bolt Hardware, HAX portfolio data",
    },
  ],

  // =========================================================================
  // RED FLAG RULES - Triggers automatiques
  // =========================================================================
  redFlagRules: [
    {
      metric: "Hardware Gross Margin",
      condition: "<",
      threshold: 15,
      severity: "critical",
      reason:
        "Marge < 15% laisse zéro buffer pour erreurs, returns, price pressure. Business non viable sans pivot pricing ou BOM.",
    },
    {
      metric: "Attach Rate",
      condition: "<",
      threshold: 10,
      severity: "high",
      reason:
        "Sans software/services attach, c'est du pure hardware commodity. Exit multiples 2-3x max. Zero moat.",
    },
    {
      metric: "Time to Production",
      condition: ">",
      threshold: 36,
      severity: "critical",
      reason:
        "> 3 ans pour produire = risque runway critique. La plupart des hardware startups meurent avant production.",
    },
    {
      metric: "Return Rate",
      condition: ">",
      threshold: 15,
      severity: "high",
      reason:
        "Returns > 15% = problème qualité majeur ou product-market fit cassé. Chaque return coûte ~30% du prix.",
    },
    {
      metric: "Unit Economics at Scale",
      condition: "<",
      threshold: 1.15,
      severity: "critical",
      reason:
        "Unit economics < 1.15x à scale = business structurellement déficitaire. Aucune quantité de volume ne peut sauver ça.",
    },
    {
      metric: "Inventory Turns",
      condition: "<",
      threshold: 2,
      severity: "high",
      reason:
        "Inventory turns < 2x = cash trapped dans du stock invendu. Working capital killer.",
    },
    {
      metric: "Warranty Cost Rate",
      condition: ">",
      threshold: 8,
      severity: "high",
      reason:
        "Warranty costs > 8% du revenue = problème qualité systémique qui mange les marges.",
    },
    {
      metric: "NRE as % of First Production",
      condition: ">",
      threshold: 100,
      severity: "high",
      reason:
        "NRE > revenue Year 1 = payback très long sur tooling. Besoin de massive scale pour rentabilité.",
    },
    {
      metric: "Blended Gross Margin",
      condition: "<",
      threshold: 25,
      severity: "critical",
      reason:
        "Blended margin < 25% même avec software = business model fondamentalement cassé.",
    },
  ],

  // =========================================================================
  // UNIT ECONOMICS FORMULAS - Calculs spécifiques Hardware
  // =========================================================================
  unitEconomicsFormulas: [
    {
      name: "LTV Hardware Customer",
      formula: "(Hardware Margin + Lifetime Software Revenue × Software Margin) / CAC",
      benchmark: {
        good: "3x",
        excellent: "5x+",
      },
    },
    {
      name: "Payback in Units",
      formula: "Fixed Costs (NRE + Tooling) / (Revenue per Unit - Variable Cost per Unit)",
      benchmark: {
        good: "< 5,000 units",
        excellent: "< 2,000 units",
      },
    },
    {
      name: "True Contribution Margin",
      formula: "Price - BOM - Assembly - Shipping - Returns - Warranty - Support",
      benchmark: {
        good: "> 25%",
        excellent: "> 40%",
      },
    },
    {
      name: "Working Capital Days",
      formula: "Inventory Days + Receivables Days - Payables Days",
      benchmark: {
        good: "< 90 days",
        excellent: "< 45 days",
      },
    },
    {
      name: "Cash Conversion Cycle",
      formula: "Days from cash-out (inventory) to cash-in (payment)",
      benchmark: {
        good: "< 120 days",
        excellent: "< 60 days",
      },
    },
    {
      name: "Breakeven Volume",
      formula: "Total Fixed Costs / (Price - Variable Cost per Unit)",
      benchmark: {
        good: "< 10,000 units Year 1",
        excellent: "< 3,000 units Year 1",
      },
    },
  ],

  // =========================================================================
  // EXIT MULTIPLES - Réalité du marché Hardware
  // =========================================================================
  exitMultiples: {
    low: 2, // Pure hardware commodity
    median: 4, // Hardware with some differentiation
    high: 10, // Hardware + strong software attach
    topDecile: 20, // Platform play (Nest, Ring tier)
    typicalAcquirers: [
      "Apple",
      "Google/Alphabet",
      "Amazon",
      "Samsung",
      "Sony",
      "Honeywell",
      "Bosch",
      "Philips",
      "Private Equity (Vista, Thoma Bravo)",
      "Industrial conglomerates",
    ],
    recentExits: [
      {
        company: "Nest",
        acquirer: "Google",
        multiple: 15,
        year: 2014,
      },
      {
        company: "Ring",
        acquirer: "Amazon",
        multiple: 10,
        year: 2018,
      },
      {
        company: "Beats",
        acquirer: "Apple",
        multiple: 8,
        year: 2014,
      },
      {
        company: "Fitbit",
        acquirer: "Google",
        multiple: 4,
        year: 2021,
      },
      {
        company: "iRobot",
        acquirer: "Amazon (blocked)",
        multiple: 6,
        year: 2022,
      },
      {
        company: "Tile",
        acquirer: "Life360",
        multiple: 3,
        year: 2021,
      },
    ],
  },

  // =========================================================================
  // SECTOR-SPECIFIC SUCCESS PATTERNS
  // =========================================================================
  sectorSuccessPatterns: [
    "Hardware + Software/Data business model avec attach rate > 50% (Nest, Peloton, Ring model)",
    "Vertically integrated manufacturing pour contrôler qualité et marges (Apple model)",
    "Platform play avec ecosystem lock-in (proprietary accessories, consumables, services)",
    "Design-for-manufacturing dès le début - co-design avec CM/EMS partenaire",
    "Pre-certification testing pour éviter surprises compliance (FCC, CE, UL)",
    "Capital efficient path: crowdfunding validation → small batch → scale production",
    "Multi-SKU strategy pour amortir NRE et tooling sur plusieurs produits",
    "Strategic partnerships avec retailers (Best Buy, Amazon) pour distribution",
    "Strong IP protection: design patents + utility patents + trade dress",
    "Supply chain redundancy: 2+ suppliers pour composants critiques",
    "Inventory management discipline: just-in-time ou consignment deals",
    "Modular architecture permettant upgrades et réduction de SKU complexity",
  ],

  // =========================================================================
  // SECTOR-SPECIFIC RISKS
  // =========================================================================
  sectorSpecificRisks: [
    "Manufacturing delays: hardware timelines dérapent systématiquement (budget 2x)",
    "BOM cost volatility: chip shortages, commodity prices, tariffs peuvent exploser COGS",
    "Supply chain concentration: single-source components = risque existentiel",
    "Certification delays: FCC/CE/UL peuvent bloquer launch de 6-12 mois",
    "Quality issues at scale: ce qui marche sur 100 units peut fail sur 10,000",
    "Inventory risk: overstocking tue le cash, understocking tue le revenue",
    "Returns and warranty: chaque return coûte ~30% du prix, warranty provisions oubliées",
    "Capital intensity: tooling, inventory, certifications = cash burn before revenue",
    "Commodity trap: sans software attach, pure hardware = race to bottom on price",
    "Big Tech competition: Apple/Google/Amazon peuvent copier avec 100x resources",
    "Technology obsolescence: hardware cycles de 2-3 ans vs software continuous updates",
    "Retail dependency: Amazon/Best Buy peuvent modifier terms ou favoriser private label",
    "Geopolitical exposure: manufacturing concentré en Chine = tariffs, IP, supply risks",
    "Customer support costs: hardware requires physical logistics, returns, repairs",
    "Seasonality: consumer hardware = Q4 concentration, inventory planning critique",
  ],
};

// =============================================================================
// SECTOR CONFIGURATION
// =============================================================================

const HARDWARE_CONFIG: SectorConfig = {
  name: "Hardware",
  emoji: "🏭",
  displayName: "Hardware, IoT & Robotics Expert",
  description:
    "Expert sectoriel pour hardware consumer et enterprise, IoT devices, " +
    "robotics, wearables et connected products. Analyse des unit economics hardware, " +
    "manufacturing risks, software attach rate et path to scale.",

  benchmarkData: HARDWARE_BENCHMARK_DATA,

  // Scoring weights spécifiques Hardware
  scoringWeights: {
    metricsWeight: 0.30, // Moins lourd car hardware = beaucoup d'incertitude early
    unitEconomicsWeight: 0.30, // CRITIQUE pour hardware - unit economics at scale
    competitiveWeight: 0.15, // Moat hardware souvent faible sauf avec software
    timingWeight: 0.10, // Manufacturing timing risk
    teamFitWeight: 0.15, // Hardware team = crucial (manufacturing expertise)
  },
};

// =============================================================================
// EXTENDED OUTPUT SCHEMA - Hardware Specific
// =============================================================================

export const HardwareExpertExtendedOutputSchema = z.object({
  // Manufacturing Risk Assessment (Hardware-specific)
  manufacturingRiskAssessment: z.object({
    overallRisk: z.enum(["low", "medium", "high", "critical"]),

    supplyChainRisks: z.array(
      z.object({
        component: z.string(),
        risk: z.string(),
        singleSourced: z.boolean(),
        mitigationInPlace: z.boolean(),
        impactIfMaterializes: z.string(),
      })
    ),

    certificationStatus: z.object({
      required: z.array(z.string()),
      obtained: z.array(z.string()),
      pending: z.array(z.string()),
      estimatedCompletionMonths: z.number(),
      riskIfDelayed: z.string(),
    }),

    manufacturingPartner: z.object({
      identified: z.boolean(),
      type: z.enum(["CM", "EMS", "ODM", "in_house", "not_determined"]).nullable(),
      location: z.string().nullable(),
      capacity: z.string().nullable(),
      qualityTrackRecord: z.enum(["proven", "unknown", "concerning"]).nullable(),
    }),

    productionReadiness: z.object({
      currentStage: z.enum([
        "concept",
        "prototype",
        "evt", // Engineering Validation Test
        "dvt", // Design Validation Test
        "pvt", // Production Validation Test
        "mass_production",
      ]),
      estimatedTimeToMassProduction: z.number().describe("months"),
      confidenceInTimeline: z.enum(["high", "medium", "low"]),
      majorBlockers: z.array(z.string()),
    }),
  }),

  // BOM Analysis (Hardware-specific)
  bomAnalysis: z.object({
    currentBOMCost: z.number().nullable(),
    targetBOMAtScale: z.number().nullable(),
    expectedReduction: z.string().nullable(),

    costBreakdown: z.array(
      z.object({
        category: z.string(), // e.g., "Electronics", "Mechanical", "Packaging"
        percentage: z.number(),
        optimization_opportunity: z.string(),
      })
    ),

    criticalComponents: z.array(
      z.object({
        name: z.string(),
        percentOfBOM: z.number(),
        leadTime: z.string(),
        alternatives: z.boolean(),
        priceVolatility: z.enum(["stable", "moderate", "high"]),
      })
    ),
  }),

  // Software/Services Attach Analysis (Key for hardware valuation)
  attachRateAnalysis: z.object({
    currentAttachRate: z.number().nullable(),
    attachRateType: z.enum(["subscription", "one_time", "usage_based", "hybrid", "none"]).nullable(),

    revenueBreakdown: z.object({
      hardwarePercentage: z.number(),
      softwarePercentage: z.number(),
      servicesPercentage: z.number(),
    }).nullable(),

    softwareValueProposition: z.string().nullable(),
    dataMonetizationPotential: z.string().nullable(),
    lockInMechanisms: z.array(z.string()),

    attachRateTrajectory: z.object({
      current: z.number().nullable(),
      target12Months: z.number().nullable(),
      credibilityOfTarget: z.enum(["high", "medium", "low"]).nullable(),
    }),

    valuation_implication: z.string().describe(
      "Impact on exit multiple: pure hardware (2-4x) vs hardware+software (6-15x)"
    ),
  }),

  // Capital Requirements Analysis (Hardware is capital intensive)
  capitalRequirementsAnalysis: z.object({
    nreCosts: z.object({
      tooling: z.number().nullable(),
      certifications: z.number().nullable(),
      engineering: z.number().nullable(),
      total: z.number().nullable(),
    }),

    inventoryCapitalNeeded: z.object({
      firstProductionRun: z.number().nullable(),
      moqRequirements: z.string().nullable(),
      workingCapitalCycle: z.string().nullable(),
    }),

    breakEvenAnalysis: z.object({
      unitsToBreakeven: z.number().nullable(),
      timeToBreakeven: z.string().nullable(),
      assumptions: z.array(z.string()),
    }),

    capitalEfficiency: z.object({
      verdict: z.enum(["efficient", "typical", "capital_heavy"]),
      comparison: z.string().describe("vs similar hardware companies in DB"),
    }),
  }),
});

export type HardwareExpertExtendedOutput = z.infer<typeof HardwareExpertExtendedOutputSchema>;

// =============================================================================
// ENHANCED PROMPT BUILDER - Hardware Specific Sections
// =============================================================================

function buildHardwareSpecificPromptSection(): string {
  return `
## HARDWARE-SPECIFIC ANALYSIS SECTIONS

En plus de l'analyse sectorielle standard, tu DOIS inclure:

### A. MANUFACTURING RISK ASSESSMENT

**Supply Chain Analysis:**
- Identifier les composants single-source (RED FLAG si oui)
- Lead times des composants critiques (> 16 semaines = risque)
- Concentration géographique (100% Chine = risque géopolitique)

**Certification Status:**
- FCC (US RF devices) - 2-4 mois typical
- CE marking (EU) - 3-6 mois typical
- UL/safety certifications - 4-8 mois typical
- RoHS/REACH compliance - requis EU
- Wireless (WiFi, Bluetooth, Cellular) - add 2-3 mois chaque
- Pour medical/automotive: 12-24 mois additionnels

**Production Readiness (Engineering stages):**
- Concept → Prototype → EVT → DVT → PVT → Mass Production
- Chaque transition peut prendre 2-4 mois
- DVT est typiquement le "valley of death" pour hardware startups

### B. BOM ANALYSIS

**Current vs Scale Cost Structure:**
| Component Category | Current | At 10K units | At 100K units |
|-------------------|---------|--------------|---------------|
| Electronics (PCBA) | [X]€ | [Y]€ (-20-30%) | [Z]€ (-10-15%) |
| Mechanical (plastic/metal) | ... | ... | ... |
| Packaging | ... | ... | ... |

**Calcul obligatoire:**
\`\`\`
True COGS = BOM + Assembly + Testing + Packaging + Freight + Duties + Returns provision
Expected margin at scale = (ASP - True COGS) / ASP
\`\`\`

### C. ATTACH RATE & SOFTWARE VALUE

**Impact sur la valorisation:**
| Attach Rate | Typical Exit Multiple | Examples |
|------------|----------------------|----------|
| 0-15% | 2-4x revenue | Commodity hardware |
| 15-40% | 4-6x revenue | Hardware + services |
| 40-60% | 6-10x revenue | Hardware + SaaS |
| 60%+ | 8-15x revenue | Nest, Ring, Peloton |

**Questions à évaluer:**
- Quelle est la proposition de valeur du software/service?
- Y a-t-il du lock-in (données, intégrations, consumables)?
- Le software est-il "must-have" ou "nice-to-have"?

### D. CAPITAL REQUIREMENTS

**NRE (Non-Recurring Engineering):**
- Injection molds: $50K-500K selon complexité
- PCBA tooling: $10K-50K
- Certifications: $50K-200K
- Engineering (salaires): variable

**Working Capital:**
\`\`\`
Inventory capital = Units in production × Unit cost × Lead time buffer
Cash cycle = Days inventory + Days receivables - Days payables
\`\`\`

### E. HARDWARE-SPECIFIC RED FLAGS ADDITIONNELS

🚩 **MANUFACTURING:**
- Pas de CM/EMS identifié post-Seed = risque majeur
- Design pas "frozen" avant tooling = scope creep coûteux
- Pas de DFM review = redesigns expensive

🚩 **SUPPLY CHAIN:**
- Single source sur composant critique
- Lead time > 26 semaines sur composant clé
- 100% manufacturing dans une seule région

🚩 **BUSINESS MODEL:**
- Pas de software attach roadmap
- Dependent sur hardware margin seul
- Pas de recurring revenue strategy

🚩 **CAPITAL:**
- NRE > 2x ce qui est levé
- MOQ du CM > ce que le runway permet
- Pas de bridge plan si production delayed
`;
}


// =============================================================================
// EXTENDED OUTPUT SCHEMA - dbCrossReference + dataCompleteness
// =============================================================================

const HardwareExtendedOutputSchema = SectorExpertOutputSchema.extend({
  dbCrossReference: z.object({
    claims: z.array(z.object({
      claim: z.string(), location: z.string(),
      dbVerdict: z.enum(["VERIFIED", "CONTREDIT", "PARTIEL", "NON_VERIFIABLE"]),
      evidence: z.string(), severity: z.enum(["CRITICAL", "HIGH", "MEDIUM"]).optional(),
    })),
    hiddenCompetitors: z.array(z.string()),
    valuationPercentile: z.number().optional(),
    competitorComparison: z.object({
      fromDeck: z.object({ mentioned: z.array(z.string()), location: z.string() }),
      fromDb: z.object({ detected: z.array(z.string()), directCompetitors: z.number() }),
      deckAccuracy: z.enum(["ACCURATE", "INCOMPLETE", "MISLEADING"]),
    }).optional(),
  }).optional(),

  dataCompleteness: z.object({
    level: z.enum(["complete", "partial", "minimal"]),
    availableDataPoints: z.number(), expectedDataPoints: z.number(),
    missingCritical: z.array(z.string()), limitations: z.array(z.string()),
  }),
});
void HardwareExtendedOutputSchema;

// =============================================================================
// HARDWARE-SPECIFIC PROMPT BUILDER
// =============================================================================

function buildHardwarePrompt(context: EnrichedAgentContext): {
  system: string;
  user: string;
} {
  const deal = context.deal;
  const stage = deal.stage ?? "SEED";
  const benchmarks = HARDWARE_BENCHMARK_DATA;
  void benchmarks;

  // Extract funding DB data
  const dbCompetitors = context.fundingContext?.competitors ?? [];
  const dbBenchmarks = context.fundingContext?.sectorBenchmarks ?? null;

  // Determine stage key for benchmarks
  const stageKey = stage.toUpperCase().replace(/[\s-]/g, "_") as
    | "PRE_SEED"
    | "SEED"
    | "SERIES_A"
    | "SERIES_B";
  void stageKey;

  // =============================================================================
  // SYSTEM PROMPT
  // =============================================================================
  const systemPrompt = `# ROLE: Senior Hardware Due Diligence Expert

Tu es un **expert sectoriel senior** spécialisé dans le **Hardware, IoT et Robotics**, avec 15+ ans d'expérience en due diligence pour des fonds spécialisés hardware (HAX, Bolt, Lux Capital, Eclipse Ventures, Root Ventures).

## TON EXPERTISE SPÉCIFIQUE

### Segments Hardware
- **Consumer Electronics**: Smart home, wearables, audio, personal devices
- **Enterprise/Industrial**: Sensors, automation, industrial IoT
- **Robotics**: Warehouse, manufacturing, service, consumer robots
- **Connected Products**: IoT devices, edge computing, embedded systems
- **Medtech Devices**: Diagnostic devices, monitoring, consumer health

### Métriques Hardware Clés
- **Marges**: Hardware gross margin, blended margin (hw+sw), contribution margin
- **Attach Rate**: % customers avec software/services recurring (LE différenciateur)
- **Unit Economics**: BOM, assembly, COGS at scale, NRE amortization
- **Manufacturing**: Time to production, certification timeline, supply chain
- **Working Capital**: Inventory turns, cash conversion cycle, MOQ impact

### Contexte Manufacturing
- **Timeline Reality**: Hardware timelines ALWAYS slip. Budget 2x any founder estimate.
- **Valley of Death**: DVT (Design Validation Test) kills most hardware startups
- **Capital Intensity**: NRE + tooling + inventory = cash burn before revenue
- **Certification Risk**: FCC/CE/UL can block launch 6-12 months

---

## STANDARDS DE QUALITÉ (Big4 + Partner VC)

### RÈGLE ABSOLUE: Chaque affirmation doit être sourcée
- ❌ "Les marges sont bonnes"
- ✅ "Hardware GM 38% (P65 vs stage median 35%), blended 52% avec 45% attach rate. Comparable à Ring pre-acquisition."

### RÈGLE ABSOLUE: Chaque red flag doit avoir
1. **Sévérité**: critical / high / medium
2. **Preuve**: le data point exact qui déclenche le flag
3. **Seuil sectoriel**: la référence benchmark Hardware violée
4. **Impact quantifié**: implication sur unit economics, timeline, capital needs
5. **Question de validation**: comment investiguer avec le fondateur
6. **Path de mitigation**: ce qui résoudrait le concern

### RÈGLE ABSOLUE: L'attach rate détermine la valorisation
| Attach Rate | Exit Multiple | Example |
|-------------|---------------|---------|
| 0-15% | 2-4x | Commodity hardware |
| 15-40% | 4-6x | Hardware + services |
| 40-60% | 6-10x | Hardware + SaaS |
| 60%+ | 8-15x | Nest, Ring, Peloton |

**Sans software attach, c'est une race to the bottom sur le prix.**

---

## BENCHMARKS HARDWARE (Stage: ${stage})

${getStandardsOnlyInjection("Hardware", stage)}

⚠️ **RECHERCHE EN LIGNE REQUISE**: Pour les percentiles et données de marché actuels, effectuer une recherche web avec les queries suggérées dans les standards ci-dessus.

---

${buildHardwareSpecificPromptSection()}

---

## EXIT LANDSCAPE HARDWARE

**Acquéreurs Typiques:**
${HARDWARE_STANDARDS.typicalAcquirers.map((a) => `- ${a}`).join("\n")}

**Recent Exits (historique):**
- Nest → Google (2014): ~15x
- Ring → Amazon (2018): ~10x
- Beats → Apple (2014): ~8x
- Fitbit → Google (2021): ~4x

⚠️ **EXIT MULTIPLES**: Rechercher en ligne "hardware IoT startup acquisition multiples 2024" pour données actuelles.

---

## SECTOR SUCCESS PATTERNS
${HARDWARE_STANDARDS.successPatterns.map((p) => `✅ ${p}`).join("\n")}

## SECTOR RISK PATTERNS
${HARDWARE_STANDARDS.sectorRisks.map((r) => `⚠️ ${r}`).join("\n")}

---

## SCORING METHODOLOGY

Le score sectoriel (0-100) est calculé ainsi:
- **Métriques (margins, attach rate, unit economics)**: ${HARDWARE_CONFIG.scoringWeights.metricsWeight * 100}%
- **Unit economics (BOM, NRE, breakeven)**: ${HARDWARE_CONFIG.scoringWeights.unitEconomicsWeight * 100}%
- **Positionnement concurrentiel (moat, differentiation)**: ${HARDWARE_CONFIG.scoringWeights.competitiveWeight * 100}%
- **Timing (manufacturing timeline risk)**: ${HARDWARE_CONFIG.scoringWeights.timingWeight * 100}%
- **Team fit (manufacturing expertise, track record)**: ${HARDWARE_CONFIG.scoringWeights.teamFitWeight * 100}%

**Grille:**
- 80-100: Blended margin 50%+, attach rate 50%+, clear path to production, proven team
- 60-79: Solid margins, attach rate 30%+, manufacturing partner identified
- 40-59: Acceptable margins but attach rate concerns or manufacturing risk
- 20-39: Low margins, no software strategy, significant execution risk
- 0-19: Unit economics broken, no attach rate, critical manufacturing blockers

---

## Anti-Hallucination Directive — Abstention Permission
It is perfectly acceptable (and preferred) for you to say "I don't know" or "I'm not confident enough to answer this." I would rather receive an honest "I'm unsure" than a confident answer that might be wrong.
If you are uncertain about any part of your response, flag it clearly with [UNCERTAIN] so I know to verify it independently.
Uncertainty is valued here, not penalised.

## Anti-Hallucination Directive — Self-Audit
After completing your response, perform a self-audit:
1. Identify the 3 claims in your response that you are LEAST confident about
2. For each one, explain what could be wrong and what the alternative might be
3. Rate your overall response confidence: HIGH / MEDIUM / LOW
Be ruthlessly honest. I will not penalise you for uncertainty.

---

## OUTPUT FORMAT

Tu DOIS retourner un JSON valide suivant exactement le schema fourni.
CHAQUE champ doit contenir des données concrètes et sourcées, jamais de placeholders.

## EXEMPLES

### Exemple de BON output (Hardware):
"Unit Economics Analysis:
- Current BOM: €85/unit (100 units batch)
- Projected BOM at 10K: €62/unit (-27% from volume discounts)
- ASP: €199 retail, €180 net after channel margins
- Hardware GM at scale: 66% (€180 - €62) / €180
- True contribution margin: 45% (after assembly €8, packaging €5, shipping €8, returns 5%)

Attach Rate Analysis:
- Current: 35% of customers subscribe to premium features (€9.99/month)
- Software revenue: €3.60/customer/month blended (35% × €9.99 + 65% × €0)
- Annual software: €43/customer at 100% GM
- LTV with attach: Hardware margin €81 + Software €129 (3 year avg lifetime) = €210
- LTV/CAC: 4.2x (CAC €50)

Exit Multiple Implication:
- With 35% attach: expect 5-6x revenue multiple
- Path to 50% attach: new IoT analytics features in roadmap could justify 7-8x"

### Exemple de MAUVAIS output (à éviter):
"The product has good margins and the team has hardware experience.
Manufacturing is on track and they have a software roadmap."

→ Aucun chiffre, aucun calcul de BOM, aucun attach rate, aucun percentile.

## Anti-Hallucination Directive — Confidence Threshold
Answer only if you are >90% confident, since mistakes are penalised 9 points, while correct answers receive 1 point, and an answer of "I don't know" receives 0 points.`;

  // =============================================================================
  // USER PROMPT
  // =============================================================================
  const userPrompt = `# ANALYSE SECTORIELLE HARDWARE

## DEAL À ANALYSER

**Company:** ${deal.companyName ?? deal.name}
**Sector:** ${deal.sector ?? "Hardware (à confirmer)"}
**Sub-sector:** ${deal.sector ?? "À déterminer (Consumer, Enterprise, IoT, Robotics?)"}
**Stage:** ${stage}
**Geography:** ${deal.geography ?? "Non spécifié"}
**Valorisation demandée:** ${deal.valuationPre != null ? `${(Number(deal.valuationPre) / 1_000_000).toFixed(1)}M€` : "Non spécifiée"}
**Montant levé:** ${deal.amountRequested != null ? `${(Number(deal.amountRequested) / 1_000_000).toFixed(1)}M€` : "Non spécifié"}

---

## DONNÉES EXTRAITES DU DECK
${context.extractedData ? JSON.stringify(context.extractedData, null, 2) : "Pas de données extraites disponibles"}

---

${context.factStoreFormatted ? `
## DONNÉES VÉRIFIÉES (Fact Store)

Les données ci-dessous ont été extraites et vérifiées à partir des documents du deal.
Base ton analyse sur ces faits. Si un fait important manque, signale-le.

${context.factStoreFormatted}
` : ''}

## RÉSULTATS DES AGENTS TIER 1
${(() => {
  const previousResults = context.previousResults;
  let tier1Insights = "";
  if (previousResults) {
    const financialAudit = previousResults["financial-auditor"] as { success?: boolean; data?: { findings?: unknown; narrative?: { keyInsights?: string[] } } } | undefined;
    if (financialAudit?.success && financialAudit.data) {
      tier1Insights += `\n### Financial Auditor Findings:\n`;
      if (financialAudit.data.narrative?.keyInsights) {
        tier1Insights += financialAudit.data.narrative.keyInsights.join("\n- ");
      }
      if (financialAudit.data.findings) {
        tier1Insights += `\nFindings: ${JSON.stringify(financialAudit.data.findings, null, 2).slice(0, 2000)}...`;
      }
    }

    const competitiveIntel = previousResults["competitive-intel"] as { success?: boolean; data?: { findings?: { competitors?: unknown[] }; narrative?: { keyInsights?: string[] } } } | undefined;
    if (competitiveIntel?.success && competitiveIntel.data) {
      tier1Insights += `\n### Competitive Intel Findings:\n`;
      if (competitiveIntel.data.narrative?.keyInsights) {
        tier1Insights += competitiveIntel.data.narrative.keyInsights.join("\n- ");
      }
      if (competitiveIntel.data.findings?.competitors) {
        tier1Insights += `\nCompetitors identified: ${(competitiveIntel.data.findings.competitors as { name: string }[]).slice(0, 5).map(c => c.name).join(", ")}`;
      }
    }

    const legalRegulatory = previousResults["legal-regulatory"] as { success?: boolean; data?: { findings?: { compliance?: unknown[]; regulatoryRisks?: unknown[] } } } | undefined;
    if (legalRegulatory?.success && legalRegulatory.data) {
      tier1Insights += `\n### Legal & Regulatory Findings:\n`;
      if (legalRegulatory.data.findings?.compliance) {
        tier1Insights += `Compliance areas: ${JSON.stringify(legalRegulatory.data.findings.compliance, null, 2).slice(0, 1500)}`;
      }
      if (legalRegulatory.data.findings?.regulatoryRisks) {
        tier1Insights += `\nRegulatory risks: ${JSON.stringify(legalRegulatory.data.findings.regulatoryRisks, null, 2).slice(0, 1000)}`;
      }
    }

    const extractor = previousResults["document-extractor"] as { success?: boolean; data?: { extractedInfo?: Record<string, unknown> } } | undefined;
    if (extractor?.success && extractor.data?.extractedInfo) {
      tier1Insights += `\n### Extracted Deal Data:\n${JSON.stringify(extractor.data.extractedInfo, null, 2).slice(0, 2000)}`;
    }
  }
  return tier1Insights || "Pas de résultats Tier 1 disponibles";

})()}

---

## DONNÉES FUNDING DB (Concurrents Hardware)
${
  dbCompetitors.length > 0
    ? `
**${dbCompetitors.length} concurrents Hardware identifiés dans la DB:**
${dbCompetitors
  .slice(0, 15)
  .map(
    (c: {
      name: string;
      totalFunding?: number;
      lastRound?: string;
      status?: string;
      subSector?: string;
    }) =>
      `- **${c.name}**: ${c.totalFunding ? `${(c.totalFunding / 1_000_000).toFixed(1)}M€ levés` : "funding inconnu"}, ${c.lastRound ?? "stage inconnu"}, ${c.subSector ?? ""}, ${c.status ?? ""}`
  )
  .join("\n")}
`
    : "Pas de données concurrentielles Hardware disponibles dans la DB - SIGNALER ce gap de données"
}

${
  dbBenchmarks
    ? `
**Benchmarks sectoriels de la DB:**
${JSON.stringify(dbBenchmarks, null, 2)}
`
    : ""
}

---

## TA MISSION

### 1. HARDWARE TYPE CLASSIFICATION
- Quel type de hardware? (Consumer, Enterprise, Industrial, Medical?)
- Quel niveau de complexité? (Simple electronics, mixed-signal, mechanical, RF?)
- Certifications requises? (FCC, CE, UL, medical class?)

### 2. UNIT ECONOMICS DEEP DIVE (CRITICAL)
Calcule précisément:
- BOM actuel et projeté à scale (10K, 50K, 100K units)
- True COGS = BOM + Assembly + Testing + Packaging + Freight + Duties + Returns
- Hardware gross margin à chaque niveau de volume
- Breakeven volume (units to recover NRE + tooling)
- Compare à stage benchmarks

### 3. ATTACH RATE ANALYSIS (CRITICAL - Détermine la valorisation)
- Current attach rate (% customers avec recurring revenue)
- Software/services value proposition
- Lock-in mechanisms (data, integrations, consumables)
- Revenue breakdown: hardware vs software vs services
- Target attach rate et crédibilité
- **Impact explicite sur exit multiple**

### 4. MANUFACTURING RISK ASSESSMENT
**Supply Chain:**
- Identifier tous les composants critiques
- Single-source components = RED FLAG
- Lead times (>16 weeks = risque)
- Géographie supply chain (concentration Chine?)

**Certification Status:**
- Quelles certifications requises?
- Lesquelles obtenues vs pending?
- Timeline estimée et confiance

**Production Readiness:**
- Stage actuel: Concept → Prototype → EVT → DVT → PVT → Mass Production
- CM/EMS identifié? Type, location, track record?
- Time to mass production (mois)
- Major blockers identifiés

### 5. BOM ANALYSIS TABLE
Construis le tableau de cost breakdown:
| Category | Current | @10K | @100K | Optimization |
|----------|---------|------|-------|--------------|
| Electronics (PCBA) | ... | ... | ... | ... |
| Mechanical | ... | ... | ... | ... |
| Packaging | ... | ... | ... | ... |
| Assembly | ... | ... | ... | ... |

### 6. CAPITAL REQUIREMENTS
- NRE costs: Tooling + Certifications + Engineering
- Inventory capital needed for first production run
- MOQ impact on cash
- Working capital cycle
- Cash runway vs manufacturing timeline

### 7. METRICS vs BENCHMARKS
Pour chaque KPI disponible:
- Extrais la valeur du deal
- Compare aux benchmarks ${stage} fournis
- Calcule le percentile exact
- Assessment: exceptional → critical
- Context hardware spécifique

### 8. RED FLAGS SECTORIELS
Applique les red flag rules Hardware.
Pour chaque violation:
- Cite la preuve exacte
- Référence le seuil violé
- Quantifie l'impact sur unit economics ou timeline
- Propose la question de validation
- Path de mitigation

### 9. COMPETITOR BENCHMARK (Funding DB)
En utilisant les données DB:
- Qui sont les leaders hardware similaires?
- Funding comparatif
- Attach rates des concurrents si disponible
- Exit precedents dans la catégorie

### 10. EXIT LANDSCAPE ANALYSIS
- Acquéreurs probables pour ce type de hardware?
- Multiple attendu basé sur attach rate?
- Strategic fit avec Big Tech (Apple, Google, Amazon)?
- PE interest (mature hardware businesses)?

### 11. KILLER QUESTIONS HARDWARE
Génère 6-8 questions spécifiques:
- Au moins 2 sur manufacturing et supply chain
- Au moins 2 sur unit economics et BOM
- Au moins 1 sur software attach strategy
- Au moins 1 sur certification timeline
- Avec good answer et red flag answer pour chaque

### 12. NEGOTIATION AMMUNITION
Identifie 3-5 leviers basés sur:
- Margins below benchmark
- Low or no attach rate
- Manufacturing timeline risk
- Supply chain concentration
- NRE/capital intensity

### 13. EXECUTIVE SUMMARY
- Verdict one-line
- Score sectoriel (0-100) avec breakdown
- Top 3 strengths (avec preuves quantifiées)
- Top 3 concerns (avec preuves quantifiées)
- Implication sur exit multiple (attach rate impact)
- Confidence level et data gaps

---

## RAPPELS CRITIQUES

⚠️ **ATTACH RATE = VALUATION**: Sans software, exit à 2-4x. Avec 50%+ attach, 8-15x.
⚠️ **TIMELINES SLIP**: Multiplier par 2 toute estimation fondateur
⚠️ **UNIT ECONOMICS AT SCALE**: Model BOM at 10K, 50K, 100K - les chiffres current sont TOUJOURS pires
⚠️ **CERTIFICATION RISK**: FCC/CE/UL peuvent bloquer 6-12 mois
⚠️ **CROSS-REFERENCE** - Compare aux concurrents Hardware de la DB



${(() => {
  let fundingDbData = "";
  const contextEngineAny = context.contextEngine as Record<string, unknown> | undefined;
  const fundingDb = contextEngineAny?.fundingDb as { competitors?: unknown; valuationBenchmark?: unknown; sectorTrend?: unknown } | undefined;
  if (fundingDb) {
    fundingDbData = `\n## FUNDING DATABASE - CROSS-REFERENCE OBLIGATOIRE

Tu DOIS produire un champ "dbCrossReference" dans ton output.

### Concurrents détectés dans la DB
${fundingDb.competitors ? JSON.stringify(fundingDb.competitors, null, 2).slice(0, 3000) : "Aucun concurrent détecté dans la DB"}

### Benchmark valorisation
${fundingDb.valuationBenchmark ? JSON.stringify(fundingDb.valuationBenchmark, null, 2) : "Pas de benchmark disponible"}

### Tendance funding secteur
${fundingDb.sectorTrend ? JSON.stringify(fundingDb.sectorTrend, null, 2) : "Pas de tendance disponible"}

INSTRUCTIONS DB:
1. Chaque claim du deck concernant le marché/concurrence DOIT être vérifié vs ces données
2. Les concurrents DB absents du deck = RED FLAG CRITICAL "Omission volontaire"
3. Positionner la valorisation vs percentiles (P25/median/P75)
4. Si le deck dit "pas de concurrent" mais la DB en trouve = RED FLAG CRITICAL`;
  }
  return fundingDbData;
})()}

Retourne un JSON valide avec toutes les sections complétées.`;

  return { system: systemPrompt, user: userPrompt };
}

// =============================================================================
// EXPORT THE AGENT
// =============================================================================

export interface HardwareExpertResult extends AgentResult {
  agentName: "hardware-expert";
  data: SectorExpertOutput | null;
}

export const hardwareExpert = {
  name: "hardware-expert" as const,
  tier: 2 as const,
  emoji: "🏭",
  displayName: "Hardware, IoT & Robotics Expert",

  // Activation condition
  activationSectors: [
    "Hardware",
    "IoT",
    "Robotics",
    "Consumer Electronics",
    "Wearables",
    "Smart Home",
    "Connected Devices",
    "Industrial IoT",
    "Embedded Systems",
    "Sensors",
    "Manufacturing Tech",
  ],

  // Config
  config: HARDWARE_CONFIG,

  // Prompt builder
  buildPrompt: buildHardwarePrompt,

  // Output schema
  outputSchema: SectorExpertOutputSchema,

  // Extended schema for hardware-specific analysis
  extendedOutputSchema: HardwareExpertExtendedOutputSchema,

  // Benchmark data access
  benchmarks: HARDWARE_BENCHMARK_DATA,

  // Helper functions
  helpers: {
    buildHardwareSpecificPromptSection,
  },

  // Helper to check if this expert should activate
  shouldActivate: (sector: string | null | undefined): boolean => {
    if (!sector) return false;
    const normalized = sector.toLowerCase().trim();
    return hardwareExpert.activationSectors.some(
      (s) => normalized.includes(s.toLowerCase()) || s.toLowerCase().includes(normalized)
    );
  },

  // Run method with _extended for UI wow effect
  async run(context: EnrichedAgentContext): Promise<SectorExpertResult & { _extended?: ExtendedHardwareData }> {
    const startTime = Date.now();

    try {
      const { system, user } = buildHardwarePrompt(context);
      // Data Reliability & Analytical Tone directives
      const dataReliability = "\n\n## CLASSIFICATION DE FIABILITÉ DES DONNÉES (OBLIGATOIRE)\nChaque donnée que tu analyses a un niveau de fiabilité. Tu DOIS en tenir compte.\n\n**6 niveaux :** AUDITED (auditée) > VERIFIED (vérifiable) > DECLARED (déclarée, non vérifiée) > PROJECTED (projection future) > ESTIMATED (estimation dérivée) > UNVERIFIABLE (invérifiable).\n\n**Règles :** Ne JAMAIS traiter PROJECTED/ESTIMATED comme un fait. Signaler toute projection présentée comme fait (PROJECTION_AS_FACT). Indiquer le niveau de fiabilité pour chaque métrique clé. Respecter les classifications du Tier 0.\n";
      const analyticalTone = "\n\n## TON ANALYTIQUE OBLIGATOIRE (RÈGLE N°1)\nAngel Desk ANALYSE et GUIDE, ne DÉCIDE JAMAIS. Le BA est le seul décideur.\n\n**INTERDIT :** \"Investir\", \"Ne pas investir\", \"Rejeter\", \"Passer\", \"GO/NO-GO\", \"Dealbreaker\", tout impératif.\n**OBLIGATOIRE :** Ton analytique (\"Les données montrent...\", \"Les signaux indiquent...\"). Constater des faits, laisser le BA conclure.\n";
      // Anti-Hallucination Directive — Citation Demand (Prompt 3/5)
      const citationDemand = "\n\n## Anti-Hallucination Directive — Citation Demand\nFor every factual claim in your response:\n1. Cite a specific, verifiable source (name, publication, date)\n2. If you cannot cite a specific source, mark the claim as [UNVERIFIED] and explain why you believe it to be true\n3. If you are relying on general training data rather than a specific source, say so explicitly\nDo not present unverified information as established fact.\n";
      const structuredUncertainty = "\n\n## Anti-Hallucination Directive — Structured Uncertainty\nStructure your response in three clearly labelled sections:\n**CONFIDENT:** Claims where you have strong evidence and high certainty (>90%)\n**PROBABLE:** Claims where you believe this is likely correct but acknowledge uncertainty (50-90%)\n**SPECULATIVE:** Claims where you are filling in gaps, making inferences, or relying on pattern-matching rather than direct knowledge (<50%)\nEvery claim must be placed in one of these three categories.\nDo not present speculative claims as confident ones.\n";
      setAgentContext("hardware-expert");

      const response = await complete(user, {
        systemPrompt: system + dataReliability + analyticalTone + citationDemand + structuredUncertainty,
        complexity: "complex",
        temperature: 0.3,
      });

      // Parse JSON from response
      const parsedOutput = JSON.parse(extractFirstJSON(response.content)) as SectorExpertOutput;

      // -- Data completeness assessment and score capping --
      const completenessData = (parsedOutput as unknown as { dataCompleteness?: { level: "complete" | "partial" | "minimal"; availableDataPoints: number; expectedDataPoints: number; missingCritical: string[]; limitations: string[] } }).dataCompleteness ?? {
        level: 'partial' as const, availableDataPoints: 0, expectedDataPoints: 0, missingCritical: [], limitations: [],
      };
      const availableMetrics = (parsedOutput.metricsAnalysis ?? []).filter((m: { metricValue?: unknown }) => m.metricValue !== null).length;
      const totalMetrics = (parsedOutput.metricsAnalysis ?? []).length;
      let completenessLevel = completenessData.level;
      if (totalMetrics > 0 && !parsedOutput.dataCompleteness) {
        const ratio = availableMetrics / totalMetrics;
        if (ratio < 0.3) completenessLevel = 'minimal';
        else if (ratio < 0.7) completenessLevel = 'partial';
        else completenessLevel = 'complete';
      }
      let scoreMax = 100;
      if (completenessLevel === 'minimal') scoreMax = 50;
      else if (completenessLevel === 'partial') scoreMax = 70;
      const rawScore = parsedOutput.executiveSummary?.sectorScore ?? parsedOutput.sectorFit?.score ?? 0;
      const cappedScore = Math.min(rawScore, scoreMax);
      const rawFitScore = parsedOutput.sectorFit?.score ?? 0;
      const cappedFitScore = Math.min(rawFitScore, scoreMax);
      const limitations: string[] = [
        ...(completenessData.limitations ?? []),
        ...(completenessData.missingCritical ?? []).map((m: string) => `Missing critical data: ${m}`),
      ];
      if (cappedScore < rawScore) {
        limitations.push(`Score capped from ${rawScore} to ${cappedScore} due to ${completenessLevel} data completeness`);
      }



      // Transform to SectorExpertData format
      const sectorData: SectorExpertData = {
        sectorName: "Hardware",
        sectorMaturity: mapMaturity(parsedOutput.sectorFit?.sectorMaturity),
        keyMetrics: parsedOutput.metricsAnalysis?.map(m => ({
          metricName: m.metricName,
          value: m.percentile ?? null,
          sectorBenchmark: m.benchmark ?? { p25: 0, median: 0, p75: 0, topDecile: 0 },
          assessment: mapAssessment(m.assessment),
          sectorContext: m.sectorContext ?? "",
        })) ?? [],
        sectorRedFlags: parsedOutput.sectorRedFlags?.map(rf => ({
          flag: rf.flag,
          severity: mapSeverity(rf.severity),
          sectorReason: rf.sectorThreshold ?? "",
        })) ?? [],
        sectorOpportunities: parsedOutput.sectorOpportunities?.map(o => ({
          opportunity: o.opportunity,
          potential: o.potential as "high" | "medium" | "low",
          reasoning: o.sectorContext ?? "",
        })) ?? [],
        regulatoryEnvironment: {
          complexity: parsedOutput.sectorDynamics?.regulatoryRisk?.level ?? "medium",
          keyRegulations: parsedOutput.sectorDynamics?.regulatoryRisk?.keyRegulations ?? ["FCC", "CE Mark", "UL"],
          complianceRisks: [],
          upcomingChanges: parsedOutput.sectorDynamics?.regulatoryRisk?.upcomingChanges ?? [],
        },
        sectorDynamics: {
          competitionIntensity: mapCompetition(parsedOutput.sectorDynamics?.competitionIntensity),
          consolidationTrend: mapConsolidation(parsedOutput.sectorDynamics?.consolidationTrend),
          barrierToEntry: mapBarrier(parsedOutput.sectorDynamics?.barrierToEntry),
          typicalExitMultiple: parsedOutput.sectorDynamics?.exitLandscape?.typicalMultiple?.median ?? 5,
          recentExits: parsedOutput.sectorDynamics?.exitLandscape?.recentExits?.map(e => `${e.company} → ${e.acquirer} (${e.multiple}x, ${e.year})`) ?? [],
        },
        sectorQuestions: parsedOutput.mustAskQuestions?.map(q => ({
          question: q.question,
          category: "technical" as const,
          priority: q.priority as "must_ask" | "should_ask" | "nice_to_have",
          expectedAnswer: q.goodAnswer ?? "",
          redFlagAnswer: q.redFlagAnswer ?? "",
        })) ?? [],
        sectorFit: {
          score: cappedFitScore,
          strengths: parsedOutput.executiveSummary?.topStrengths ?? [],
          weaknesses: parsedOutput.executiveSummary?.topConcerns ?? [],
          sectorTiming: parsedOutput.sectorFit?.timingAssessment === "early_mover" ? "early" :
                        parsedOutput.sectorFit?.timingAssessment === "too_late" ? "late" : "optimal",
        },
        sectorScore: cappedScore,
        executiveSummary: parsedOutput.sectorFit?.reasoning ?? "",
      };

      return {
        agentName: "hardware-expert",
        success: true,
        executionTimeMs: Date.now() - startTime,
        cost: response.cost ?? 0,
        data: sectorData,
        // Extended data for UI wow effect
        _extended: {
          bomEconomics: {
            currentBom: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("bom"))?.metricValue as number ?? null,
            targetBomAtScale: null,
            bomReductionPath: null,
          },
          manufacturingReadiness: {
            currentStage: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("manufacturing") || m.metricName.toLowerCase().includes("production"))?.metricValue as string ?? null,
            supplyChainRisk: null,
            manufacturingPartner: null,
          },
          softwareAttach: {
            attachRate: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("attach") || m.metricName.toLowerCase().includes("software"))?.metricValue as number ?? null,
            recurringRevenue: null,
            blendedMargin: null,
          },
          certifications: {
            obtained: [],
            pending: [],
            timeline: null,
          },
          unitEconomicsAtScale: {
            asp: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("asp") || m.metricName.toLowerCase().includes("price"))?.metricValue as number ?? null,
            grossMarginTarget: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("margin"))?.metricValue as number ?? null,
            breakEvenUnits: null,
          },
          capitalIntensity: {
            nreRequired: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("nre"))?.metricValue as number ?? null,
            toolingCost: null,
            inventoryFloat: null,
          },
          exitLandscape: parsedOutput.sectorDynamics?.exitLandscape ?? null,
          competitivePosition: parsedOutput.competitorBenchmark ?? null,
          sectorSpecificRisks: parsedOutput.sectorRedFlags?.filter(rf =>
            rf.flag.toLowerCase().includes("bom") ||
            rf.flag.toLowerCase().includes("manufacturing") ||
            rf.flag.toLowerCase().includes("supply chain") ||
            rf.flag.toLowerCase().includes("certification") ||
            rf.flag.toLowerCase().includes("inventory")
          ) ?? [],
          fullMetricsAnalysis: parsedOutput.metricsAnalysis ?? [],
        },
      } as SectorExpertResult & { _extended: ExtendedHardwareData };

    } catch (error) {
      console.error("[hardware-expert] Execution error:", error);
      return {
        agentName: "hardware-expert",
        success: false,
        executionTimeMs: Date.now() - startTime,
        cost: 0,
        error: error instanceof Error ? error.message : "Unknown error",
        data: getDefaultHardwareData(),
      };
    }
  },
};

// Extended data type for Hardware Expert UI wow effect
interface ExtendedHardwareData {
  bomEconomics: {
    currentBom: number | null;
    targetBomAtScale: number | null;
    bomReductionPath: string | null;
  };
  manufacturingReadiness: {
    currentStage: string | null;
    supplyChainRisk: string | null;
    manufacturingPartner: string | null;
  };
  softwareAttach: {
    attachRate: number | null;
    recurringRevenue: number | null;
    blendedMargin: number | null;
  };
  certifications: {
    obtained: string[];
    pending: string[];
    timeline: string | null;
  };
  unitEconomicsAtScale: {
    asp: number | null;
    grossMarginTarget: number | null;
    breakEvenUnits: number | null;
  };
  capitalIntensity: {
    nreRequired: number | null;
    toolingCost: number | null;
    inventoryFloat: number | null;
  };
  exitLandscape: unknown;
  competitivePosition: unknown;
  sectorSpecificRisks: Array<{ flag: string; severity: string; sectorThreshold?: string }>;
  fullMetricsAnalysis: unknown[];
}

// Default data for error fallback
function getDefaultHardwareData(): SectorExpertData {
  return {
    sectorName: "Hardware",
    sectorMaturity: "growing",
    keyMetrics: [],
    sectorRedFlags: [
      {
        flag: "Analysis incomplete - unable to perform full hardware sector analysis",
        severity: "major",
        sectorReason: "Insufficient data or processing error prevented complete analysis",
      },
    ],
    sectorOpportunities: [],
    regulatoryEnvironment: {
      complexity: "medium",
      keyRegulations: ["FCC", "CE Mark", "UL"],
      complianceRisks: ["Unable to assess compliance status"],
      upcomingChanges: [],
    },
    sectorDynamics: {
      competitionIntensity: "medium",
      consolidationTrend: "consolidating",
      barrierToEntry: "high",
      typicalExitMultiple: 5,
      recentExits: [],
    },
    sectorQuestions: [
      {
        question: "What is your BOM cost at current volume and projected at 10x scale?",
        category: "technical",
        priority: "must_ask",
        expectedAnswer: "Clear BOM breakdown with credible cost reduction roadmap",
        redFlagAnswer: "No BOM visibility or unrealistic cost projections",
      },
    ],
    sectorFit: {
      score: 0,
      strengths: [],
      weaknesses: ["Analysis incomplete"],
      sectorTiming: "optimal",
    },
    sectorScore: 0,
    executiveSummary: "Hardware sector analysis could not be completed. Please ensure sufficient deal data is available.",
  };
}

// Default export
export default hardwareExpert;

// Export additional utilities for hardware-specific analysis
export { HARDWARE_BENCHMARK_DATA, buildHardwareSpecificPromptSection };
