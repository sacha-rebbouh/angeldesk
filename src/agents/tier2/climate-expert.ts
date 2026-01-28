/**
 * Climate Expert Agent - TIER 2
 *
 * Expert sectoriel spécialisé dans CleanTech, Climate et Energy Transition.
 *
 * Domaines couverts:
 * - Carbon Tech: DAC (Direct Air Capture), CCUS, enhanced weathering
 * - Renewable Energy: Solar, wind, geothermal, hydro, storage
 * - Energy Efficiency: Building tech, industrial optimization
 * - Sustainable Mobility: EV infrastructure, fleet electrification
 * - Circular Economy: Waste-to-value, recycling tech
 * - Sustainable Agriculture: AgTech, alternative proteins
 * - Carbon Markets: Credits, offsets, MRV (Measurement, Reporting, Verification)
 *
 * Standards: Big4 + Partner VC rigor
 * - Carbon impact measurement and third-party verification
 * - Policy tailwind assessment (IRA, EU Green Deal, carbon pricing)
 * - Technology readiness and commercial scalability
 * - Offtake agreements and revenue visibility
 * - Unit economics vs carbon credit alternatives
 * - Exit landscape (energy majors, industrial acquirers, IPO/SPAC)
 *
 * Cross-reference obligatoire avec Funding DB
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
  mapCategory,
  mapPriority,
} from "./output-mapper";
import { CLIMATE_STANDARDS } from "./sector-standards";
import { getStandardsOnlyInjection } from "./benchmark-injector";
import { complete, setAgentContext } from "@/services/openrouter/router";

// =============================================================================
// CLIMATE-SPECIFIC BENCHMARK DATA (Extended)
// =============================================================================

/**
 * Extended Climate benchmarks using STANDARDS (norms certaines)
 * Les percentiles et données marché sont recherchés en ligne.
 *
 * Sources:
 * - BloombergNEF Climate Tech Investment Reports
 * - IEA World Energy Investment Report
 * - PwC State of Climate Tech Report
 * - Carbon credit prices: web search for current data
 */
export const EXTENDED_CLIMATE_BENCHMARKS = {
  // Core formulas and rules from standards
  unitEconomicsFormulas: CLIMATE_STANDARDS.unitEconomicsFormulas,
  redFlagRules: CLIMATE_STANDARDS.redFlagRules,
  sectorSpecificRisks: CLIMATE_STANDARDS.sectorRisks,
  sectorSuccessPatterns: CLIMATE_STANDARDS.successPatterns,
  typicalAcquirers: CLIMATE_STANDARDS.typicalAcquirers,

  // Primary and secondary metrics (norms only, no percentiles)
  primaryMetrics: CLIMATE_STANDARDS.primaryMetrics,
  secondaryMetrics: CLIMATE_STANDARDS.secondaryMetrics,

  // Exit multiples - to be searched online
  exitMultiples: {
    low: "3-5",
    median: "6-10",
    high: "12-15",
    topDecile: "20+",
    typicalAcquirers: CLIMATE_STANDARDS.typicalAcquirers,
    note: "⚠️ Rechercher en ligne: 'climate tech startup acquisition multiples 2024' pour données actuelles",
  },

  // Helper to get formatted standards
  getFormattedStandards: (stage: string = "SEED") => {
    return getStandardsOnlyInjection("Climate", stage);
  },
};

// =============================================================================
// CLIMATE-SPECIFIC CONFIGURATION
// =============================================================================

/**
 * Climate Scoring Weights Rationale:
 *
 * - metricsWeight (30%): Carbon impact, revenue growth, margins.
 *   Climate tech must prove measurable impact AND commercial viability.
 *
 * - unitEconomicsWeight (25%): Cost per tonne avoided vs alternatives.
 *   Must beat carbon credit prices or alternative solutions to be investable.
 *   Customer ROI must be compelling given long sales cycles.
 *
 * - competitiveWeight (15%): vs other climate solutions and Big Energy.
 *   Energy majors have massive resources - differentiation critical.
 *
 * - timingWeight (15%): Policy windows (IRA sunset, EU Green Deal phases).
 *   Timing is critical - policy tailwinds won't last forever.
 *   Technology readiness must match market readiness.
 *
 * - teamFitWeight (15%): Energy/industrial expertise, regulatory navigation.
 *   Climate tech requires deep domain expertise and long sales cycles.
 *   Team must have patience and connections for enterprise sales.
 */
const CLIMATE_SCORING_WEIGHTS = {
  metricsWeight: 0.30,
  unitEconomicsWeight: 0.25,
  competitiveWeight: 0.15,
  timingWeight: 0.15,
  teamFitWeight: 0.15,
} as const;

// =============================================================================
// CLIMATE-SPECIFIC POLICY DATABASE
// =============================================================================

const CLIMATE_POLICY_LANDSCAPE = {
  ira: {
    name: "Inflation Reduction Act (IRA)",
    region: "USA",
    totalValue: "$369B",
    keyIncentives: [
      { name: "Solar ITC", value: "30% tax credit", applicability: "Solar installations" },
      { name: "Wind PTC", value: "$0.026/kWh", applicability: "Wind generation" },
      { name: "45Q Carbon Capture", value: "$85/tonne DAC, $60/tonne point source", applicability: "CCUS projects" },
      { name: "Clean Hydrogen (45V)", value: "Up to $3/kg", applicability: "Green hydrogen production" },
      { name: "EV Tax Credit", value: "$7,500/vehicle", applicability: "Electric vehicles" },
      { name: "Battery Manufacturing", value: "Advanced manufacturing credit", applicability: "Battery production" },
    ],
    timeline: "2022-2032 (some provisions longer)",
    risks: ["Political risk if administration changes", "Guidance still evolving for some credits"],
  },
  euGreenDeal: {
    name: "EU Green Deal & Fit for 55",
    region: "Europe",
    totalValue: "€1T+ (public + private)",
    keyIncentives: [
      { name: "EU ETS", value: "€80-100/tonne", applicability: "Carbon pricing for industry" },
      { name: "CBAM", value: "Carbon border adjustment", applicability: "Import carbon tariffs" },
      { name: "REPowerEU", value: "€300B", applicability: "Energy independence" },
      { name: "Innovation Fund", value: "€40B", applicability: "Climate tech grants" },
    ],
    timeline: "2020-2050 (net zero target)",
    risks: ["Implementation varies by member state", "Bureaucratic complexity"],
  },
  carbonPricing: {
    compliance: {
      euEts: { price: "€80-100/tonne", trend: "Rising", coverage: "Power, industry, aviation" },
      californiaCapAndTrade: { price: "$30-40/tonne", trend: "Stable", coverage: "Multi-sector" },
      ukEts: { price: "£50-70/tonne", trend: "Rising", coverage: "Industry, power" },
    },
    voluntary: {
      avoidanceCredits: { price: "$2-15/tonne", trend: "Collapsed from peak", quality: "Variable" },
      removalCredits: { price: "$100-1000+/tonne", trend: "Rising", quality: "Premium" },
    },
  },
};

// =============================================================================
// CLIMATE-SPECIFIC TECHNOLOGY READINESS
// =============================================================================

const CLIMATE_TECH_READINESS = {
  // TRL-style assessment for climate technologies
  categories: {
    provenCommercial: [
      "Solar PV (utility and distributed)",
      "Onshore wind",
      "Lithium-ion batteries",
      "LED lighting",
      "Heat pumps",
      "Electric vehicles",
    ],
    earlyCommercial: [
      "Offshore wind",
      "Grid-scale storage (non-Li)",
      "Green hydrogen (electrolysis)",
      "Point-source carbon capture",
      "EV charging infrastructure",
      "Building energy management",
    ],
    demonstrationPhase: [
      "Direct Air Capture (DAC)",
      "Long-duration storage (100+ hours)",
      "Green steel",
      "Sustainable aviation fuel (SAF)",
      "Enhanced weathering",
      "Blue/green ammonia",
    ],
    preCommercial: [
      "Fusion energy",
      "Advanced geothermal",
      "Ocean-based carbon removal",
      "Solid-state batteries",
      "Advanced nuclear (SMRs)",
    ],
  },
};

// =============================================================================
// CLIMATE-SPECIFIC PROMPT BUILDER
// =============================================================================

function buildClimatePrompt(context: EnrichedAgentContext): {
  system: string;
  user: string;
} {
  const deal = context.deal;
  const stage = deal.stage ?? "SEED";
  const benchmarks = EXTENDED_CLIMATE_BENCHMARKS;

  // Extract funding DB data
  const dbCompetitors = context.fundingContext?.competitors ?? [];
  const dbBenchmarks = context.fundingContext?.sectorBenchmarks ?? null;

  // Determine stage key for benchmarks
  const stageKey = stage.toUpperCase().replace(/[\s-]/g, "_") as
    | "PRE_SEED"
    | "SEED"
    | "SERIES_A"
    | "SERIES_B";

  // =============================================================================
  // SYSTEM PROMPT
  // =============================================================================
  const systemPrompt = `# ROLE: Senior Climate Tech Due Diligence Expert

Tu es un **expert sectoriel senior** spécialisé dans le secteur **Climate Tech / CleanTech**, avec 15+ ans d'expérience en due diligence pour des fonds Tier 1 spécialisés climat (Breakthrough Energy Ventures, Lowercarbon Capital, Congruent Ventures, Energy Impact Partners).

## TON EXPERTISE SPÉCIFIQUE

### Technologies Climate
- **Carbon Tech**: DAC, CCUS, enhanced weathering, biochar, ocean alkalinity
- **Renewable Energy**: Solar, wind, geothermal, hydro, storage (Li-ion, flow, gravity)
- **Green Hydrogen**: Electrolysis, fuel cells, ammonia, storage/transport
- **Energy Efficiency**: Building tech, industrial optimization, smart grid
- **Sustainable Mobility**: EV infrastructure, fleet electrification, SAF
- **Circular Economy**: Waste-to-value, recycling tech, biomaterials
- **AgTech Climate**: Alternative proteins, regenerative agriculture, methane reduction

### Policy & Regulatory
- **IRA (USA)**: 45Q carbon capture credits ($85/tonne DAC), ITC/PTC, hydrogen 45V
- **EU Green Deal**: ETS (€80-100/tonne), CBAM, REPowerEU, Innovation Fund
- **Carbon Markets**: Compliance (EU ETS, California) vs Voluntary (Verra, Gold Standard)
- **Permitting**: NEPA, environmental review timelines, grid interconnection queues

### Commercial & Finance
- **Project Finance**: Offtake agreements, PPAs, bankability requirements
- **Enterprise Sales**: Utility, industrial, corporate procurement cycles (12-24 months)
- **Grants & Non-Dilutive**: DOE, ARPA-E, EU Horizon, national climate funds
- **Exit Landscape**: Energy majors (Shell, BP, Total), industrial acquirers, SPAC history

---

## STANDARDS DE QUALITÉ (Big4 + Partner VC)

### RÈGLE ABSOLUE: Chaque affirmation doit être sourcée
- ❌ "L'impact carbone est significatif"
- ✅ "Réduction de 15,000 tCO2e/an vérifiée par Verra (certificat #VCS-2024-XXX), P65 vs stage median de 3,000 tCO2e"

### RÈGLE ABSOLUE: Chaque red flag doit avoir
1. **Sévérité**: critical / high / medium
2. **Preuve**: le data point exact qui déclenche le flag
3. **Seuil sectoriel**: la référence benchmark Climate violée
4. **Impact quantifié**: implication business/policy/technology
5. **Question de validation**: comment investiguer avec le fondateur
6. **Path de mitigation**: ce qui résoudrait le concern

### RÈGLE ABSOLUE: Cross-référence obligatoire
- Compare chaque métrique aux concurrents Climate de la Funding DB
- Valide les claims de réduction carbone vs standards de vérification
- Positionne la valorisation vs autres climate tech du même stage

---

## BENCHMARKS CLIMATE (Stage: ${stage})

${getStandardsOnlyInjection("Climate", stage)}

⚠️ **RECHERCHE EN LIGNE REQUISE**: Pour les percentiles et données de marché actuels, effectuer une recherche web avec les queries suggérées dans les standards ci-dessus.

---

## POLICY LANDSCAPE

### IRA (USA) - $369B
| Incentive | Value | Applicability |
|-----------|-------|---------------|
| Solar ITC | 30% tax credit | Solar installations |
| Wind PTC | $0.026/kWh | Wind generation |
| 45Q Carbon Capture | $85/tonne DAC, $60/tonne point source | CCUS projects |
| Clean Hydrogen (45V) | Up to $3/kg | Green hydrogen |
| EV Tax Credit | $7,500/vehicle | Electric vehicles |

### EU Green Deal
| Mechanism | Value | Impact |
|-----------|-------|--------|
| EU ETS | €80-100/tonne | Carbon pricing for industry |
| CBAM | Carbon border adjustment | Import carbon tariffs |
| Innovation Fund | €40B | Climate tech grants |

### Carbon Pricing Reference
- **Compliance credits**: EU ETS €80-100/t, California $30-40/t
- **Voluntary removal**: $100-1000+/t (DAC, biochar)
- **Voluntary avoidance**: $2-15/t (collapsed from 2021 peak)

---

## TECHNOLOGY READINESS REFERENCE

**Proven Commercial**: Solar PV, onshore wind, Li-ion, heat pumps, EVs
**Early Commercial**: Offshore wind, green hydrogen, point-source capture
**Demonstration**: DAC, long-duration storage, green steel, SAF
**Pre-Commercial**: Fusion, advanced geothermal, ocean carbon removal

---

## EXIT LANDSCAPE CLIMATE

**Acquéreurs Typiques:**
${CLIMATE_STANDARDS.typicalAcquirers.map((a) => `- ${a}`).join("\n")}

**Warning SPAC**: Les valorisations SPAC 2020-2021 étaient souvent gonflées. Proterra a fait faillite en 2023.

⚠️ **EXIT MULTIPLES**: Rechercher en ligne "climate tech acquisition multiples 2024" pour données actuelles.

---

## SECTOR SUCCESS PATTERNS
${CLIMATE_STANDARDS.successPatterns.map((p) => `✅ ${p}`).join("\n")}

## SECTOR RISK PATTERNS
${CLIMATE_STANDARDS.sectorRisks.map((r) => `⚠️ ${r}`).join("\n")}

---

## SCORING METHODOLOGY

Le score sectoriel (0-100) est calculé ainsi:
- **Métriques (impact carbone, revenue, margins)**: ${CLIMATE_SCORING_WEIGHTS.metricsWeight * 100}%
- **Unit economics (cost/tonne vs alternatives)**: ${CLIMATE_SCORING_WEIGHTS.unitEconomicsWeight * 100}%
- **Positionnement concurrentiel (vs Big Energy)**: ${CLIMATE_SCORING_WEIGHTS.competitiveWeight * 100}%
- **Timing (policy windows, tech readiness)**: ${CLIMATE_SCORING_WEIGHTS.timingWeight * 100}%
- **Team fit (energy/industrial expertise)**: ${CLIMATE_SCORING_WEIGHTS.teamFitWeight * 100}%

**Grille:**
- 80-100: Impact vérifié gigaton-scale, offtakes signés, policy-aligned, unit economics prouvés
- 60-79: Impact mesuré, technology proven, path to profitability clair, pas de red flag critique
- 40-59: Impact préliminaire, technology en demo, unit economics incertains
- 20-39: Pas d'impact vérifié, technology risk high, policy-dependent
- 0-19: Red flags critiques, greenwashing risk, economics cassés

---

## OUTPUT FORMAT

Tu DOIS retourner un JSON valide suivant exactement le schema fourni.
CHAQUE champ doit contenir des données concrètes et sourcées, jamais de placeholders.

## EXEMPLES

### Exemple de BON output (Climate):
"Carbon Impact Assessment:
- Claimed: 50,000 tCO2e/year reduction
- Verification: Gold Standard certified (certificate #GS-2024-XXX)
- Methodology: Avoided emissions from grid displacement
- Position vs benchmark: P78 (median Seed = 3,000 tCO2e)

Unit Economics:
- Cost per tonne: $45/tCO2e
- vs VCM price ($8-15): Premium justified by additionality + co-benefits
- vs EU ETS ($85): Competitive for compliance buyers
- Customer ROI: 3.2x (energy savings cover 85% of cost)

Policy Alignment:
- IRA 45Q applicable: YES ($60/tonne point-source credit)
- Revenue with IRA: $3M/year additional
- Revenue without IRA: Still profitable at $12/tonne margin"

### Exemple de MAUVAIS output (à éviter):
"The company has good carbon impact and the market is growing.
The team seems experienced in climate tech.
Policy tailwinds are favorable."

→ Aucune quantification, aucune source, aucun benchmark.`;

  // =============================================================================
  // USER PROMPT
  // =============================================================================
  const userPrompt = `# ANALYSE SECTORIELLE CLIMATE TECH

## DEAL À ANALYSER

**Company:** ${deal.companyName ?? deal.name}
**Sector:** ${deal.sector ?? "Climate (à confirmer)"}
**Sub-sector:** ${deal.sector ?? "À déterminer (Carbon Tech, Renewable, Storage, etc.)"}
**Stage:** ${stage}
**Geography:** ${deal.geography ?? "Non spécifié"}
**Valorisation demandée:** ${deal.valuationPre ? `${(Number(deal.valuationPre) / 1_000_000).toFixed(1)}M€` : "Non spécifiée"}
**Montant levé:** ${deal.amountRequested ? `${(Number(deal.amountRequested) / 1_000_000).toFixed(1)}M€` : "Non spécifié"}

---

## DONNÉES EXTRAITES DU DECK
${context.extractedData ? JSON.stringify(context.extractedData, null, 2) : "Pas de données extraites disponibles"}

---

## RÉSULTATS DES AGENTS TIER 1
${
  context.previousResults
    ? Object.entries(context.previousResults)
        .filter(([, v]) => (v as { success?: boolean })?.success)
        .map(([k, v]) => `### ${k}\n${JSON.stringify((v as { data?: unknown })?.data, null, 2)}`)
        .join("\n\n")
    : "Pas de résultats Tier 1 disponibles"
}

---

## DONNÉES FUNDING DB (Concurrents Climate)
${
  dbCompetitors.length > 0
    ? `
**${dbCompetitors.length} concurrents Climate identifiés dans la DB:**
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
    : "Pas de données concurrentielles Climate disponibles dans la DB - SIGNALER ce gap de données"
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

### 1. SECTOR FIT ASSESSMENT
- Ce deal est-il vraiment Climate Tech? (Carbon, Renewable, Efficiency, Mobility, Circular?)
- Sub-sector précis: DAC, solar, storage, hydrogen, building tech, etc.?
- Technology Readiness: proven commercial, early commercial, demonstration, pre-commercial?
- Timing d'entrée: aligned with policy windows or too early/late?
- Score de fit avec justification

### 2. CARBON IMPACT ANALYSIS (CRITICAL)
Pour chaque claim d'impact carbone:
- Quelle est la méthodologie de calcul?
- L'impact est-il vérifié par un tiers (Verra, Gold Standard, SBTi)?
- Avoided emissions vs removed emissions (différent pour les crédits)
- Volume actuel vs projeté
- Compare vs impact claims des concurrents DB
- **Greenwashing risk assessment**

### 3. POLICY ALIGNMENT ASSESSMENT
- IRA applicable? Quels crédits (45Q, ITC, PTC, 45V)?
- EU Green Deal aligned? ETS, CBAM, Innovation Fund eligible?
- Revenue avec vs sans incentives?
- Policy dependency risk score (1-10)
- Timeline des incentives vs business plan

### 4. TECHNOLOGY READINESS ASSESSMENT
- TRL level estimé (1-9)
- Lab vs pilot vs commercial scale?
- Performance claims vs demonstrated results?
- Scale-up risks identifiés?
- Time to commercial deployment?

### 5. OFFTAKE & REVENUE VISIBILITY
- Offtake agreements signés? Durée, valeur?
- LOIs vs binding contracts?
- Pipeline qualifié?
- Customer concentration risk?
- Revenue visibility (months/years)

### 6. METRICS vs BENCHMARKS
Pour chaque KPI disponible:
- Extrais la valeur du deal
- Compare aux benchmarks ${stage} fournis
- Calcule le percentile exact
- Assessment: exceptional → critical
- Note spécifiquement pour Climate pourquoi ça compte

### 7. UNIT ECONOMICS CLIMATE
Calcule (voir formules dans les standards ci-dessus):
- Cost per tonne avoided: Total Cost / tCO2e Reduced
- Customer ROI: (Energy Savings + Carbon Credit Value) / Solution Cost
- Carbon credit arbitrage: vs VCM ($2-15) et compliance ($80-100)
- Offtake coverage ratio: Contracted Revenue / Total Capacity Revenue
- Capital efficiency: Revenue / Total Capital Raised

### 8. RED FLAGS SECTORIELS
Applique les red flag rules Climate.
Pour chaque violation:
- Cite la preuve exacte
- Référence le seuil violé
- Quantifie l'impact (technology, policy, commercial)
- Propose la question de validation
- Path de mitigation si le deal proceed quand même

### 9. COMPETITOR BENCHMARK (Funding DB)
En utilisant les données DB:
- Qui sont les leaders? Funding comparatif?
- Position vs concurrent médian
- Gap de funding vs concurrents au même stage
- Qui a des offtakes/policy alignment et comment?

### 10. EXIT LANDSCAPE ANALYSIS
- Acquéreurs probables pour ce type de deal?
- Multiple attendu basé sur comparables?
- IPO/SPAC viability (avec warning sur track record SPAC)?
- Strategic acquirers (Shell New Energies, BP Ventures, etc.)?

### 11. KILLER QUESTIONS CLIMATE
Génère 6-8 questions spécifiques:
- Au moins 2 sur carbon impact / verification
- Au moins 2 sur policy dependency / timeline
- Au moins 2 sur technology readiness / scale-up
- Avec good answer et red flag answer pour chaque

### 12. NEGOTIATION AMMUNITION
Identifie 3-5 leviers basés sur:
- Métriques sous-benchmark
- Policy uncertainty
- Technology risk
- Comparaison valorisation vs deals Climate DB
- Carbon impact verification gaps

### 13. EXECUTIVE SUMMARY
- Verdict one-line
- Score sectoriel (0-100) avec breakdown
- Top 3 strengths (avec preuves)
- Top 3 concerns (avec preuves)
- Implication claire pour la décision d'investissement
- Confidence level et data gaps

---

## RAPPELS CRITIQUES

⚠️ **CLIMATE-SPECIFIC**: Toujours évaluer carbon impact, policy alignment, technology readiness
⚠️ **GREENWASHING RISK**: Vérifier les claims d'impact avec standards (Verra, Gold Standard)
⚠️ **POLICY DEPENDENCY**: Quantifier le revenue avec et sans incentives
⚠️ **CROSS-REFERENCE** - Compare aux concurrents Climate de la DB
⚠️ **ACTIONNABLE** - Questions et nego ammo utilisables immédiatement

Retourne un JSON valide avec toutes les sections complétées.`;

  return { system: systemPrompt, user: userPrompt };
}

// =============================================================================
// CLIMATE-SPECIFIC HELPER FUNCTIONS
// =============================================================================

/**
 * Assess policy alignment for a climate deal
 *
 * @param geography Deal geography
 * @param technology Technology type
 * @param revenueFromIncentives % of revenue from policy incentives
 * @returns Policy alignment assessment
 */
export function assessPolicyAlignment(
  geography: string | null,
  technology: string | null,
  revenueFromIncentives: number
): {
  alignmentScore: number; // 1-10
  applicableIncentives: string[];
  policyDependencyRisk: "critical" | "high" | "medium" | "low";
  commentary: string;
  recommendations: string[];
} {
  const geo = (geography ?? "").toLowerCase();
  const tech = (technology ?? "").toLowerCase();

  const applicableIncentives: string[] = [];

  // Check IRA applicability (USA)
  if (geo.includes("us") || geo.includes("america") || geo.includes("états-unis")) {
    if (tech.includes("solar")) applicableIncentives.push("IRA Solar ITC (30%)");
    if (tech.includes("wind")) applicableIncentives.push("IRA Wind PTC ($0.026/kWh)");
    if (tech.includes("carbon") || tech.includes("capture") || tech.includes("dac")) {
      applicableIncentives.push("IRA 45Q ($85/tonne DAC, $60/tonne point source)");
    }
    if (tech.includes("hydrogen")) applicableIncentives.push("IRA 45V (up to $3/kg)");
    if (tech.includes("ev") || tech.includes("electric")) applicableIncentives.push("IRA EV Credit ($7,500)");
    if (tech.includes("battery") || tech.includes("storage")) {
      applicableIncentives.push("IRA Battery Manufacturing Credit");
    }
  }

  // Check EU Green Deal applicability
  if (
    geo.includes("eu") ||
    geo.includes("europe") ||
    geo.includes("france") ||
    geo.includes("germany") ||
    geo.includes("netherlands")
  ) {
    applicableIncentives.push("EU ETS eligible (€80-100/tonne)");
    applicableIncentives.push("EU Innovation Fund eligible");
    if (tech.includes("hydrogen")) applicableIncentives.push("REPowerEU hydrogen support");
  }

  // Calculate alignment score
  let alignmentScore = 5; // Base score
  if (applicableIncentives.length >= 3) alignmentScore = 9;
  else if (applicableIncentives.length >= 2) alignmentScore = 7;
  else if (applicableIncentives.length >= 1) alignmentScore = 6;
  else alignmentScore = 3;

  // Assess policy dependency risk
  let policyDependencyRisk: "critical" | "high" | "medium" | "low";
  if (revenueFromIncentives >= 80) policyDependencyRisk = "critical";
  else if (revenueFromIncentives >= 50) policyDependencyRisk = "high";
  else if (revenueFromIncentives >= 25) policyDependencyRisk = "medium";
  else policyDependencyRisk = "low";

  // Generate recommendations
  const recommendations: string[] = [];
  if (policyDependencyRisk === "critical" || policyDependencyRisk === "high") {
    recommendations.push("Diversify revenue to reduce policy dependency below 50%");
    recommendations.push("Model scenarios with 50% reduction in incentives");
  }
  if (applicableIncentives.length === 0) {
    recommendations.push("Explore applicable incentives in target geography");
    recommendations.push("Consider pivot to geography with stronger policy support");
  }
  if (geo.includes("us") && !applicableIncentives.some((i) => i.includes("IRA"))) {
    recommendations.push("Investigate IRA eligibility - significant upside if applicable");
  }

  const commentary =
    `Policy alignment score: ${alignmentScore}/10. ` +
    `${applicableIncentives.length} applicable incentives identified. ` +
    `${revenueFromIncentives}% of revenue from incentives = ${policyDependencyRisk} dependency risk. ` +
    (policyDependencyRisk === "critical"
      ? "CRITICAL: Business model collapses if incentives disappear."
      : policyDependencyRisk === "high"
        ? "HIGH RISK: Significant exposure to policy changes."
        : "");

  return { alignmentScore, applicableIncentives, policyDependencyRisk, commentary, recommendations };
}

/**
 * Assess carbon impact quality
 *
 * @param claimedReduction Annual tCO2e reduction claimed
 * @param verificationStandard Verification standard (Verra, Gold Standard, etc.)
 * @param methodology Impact methodology
 * @param stage Funding stage
 * @returns Carbon impact assessment
 */
export function assessCarbonImpact(
  claimedReduction: number | null,
  verificationStandard: string | null,
  methodology: string | null,
  stage: string
): {
  qualityScore: "verified" | "partially_verified" | "unverified" | "greenwashing_risk";
  percentileVsBenchmark: number | null;
  verificationStatus: string;
  methodologyAssessment: string;
  recommendations: string[];
} {
  const benchmarks: Record<string, number> = {
    PRE_SEED: 1000,
    SEED: 3000,
    SERIES_A: 40000,
    SERIES_B: 400000,
  };

  const stageKey = stage.toUpperCase().replace(/[\s-]/g, "_");
  const stageMedian = benchmarks[stageKey] ?? benchmarks.SEED;

  // Calculate percentile (rough)
  let percentileVsBenchmark: number | null = null;
  if (claimedReduction !== null) {
    if (claimedReduction >= stageMedian * 25) percentileVsBenchmark = 95;
    else if (claimedReduction >= stageMedian * 5) percentileVsBenchmark = 85;
    else if (claimedReduction >= stageMedian * 1.5) percentileVsBenchmark = 70;
    else if (claimedReduction >= stageMedian) percentileVsBenchmark = 50;
    else if (claimedReduction >= stageMedian * 0.3) percentileVsBenchmark = 25;
    else percentileVsBenchmark = 10;
  }

  // Assess verification
  const premiumStandards = ["verra", "gold standard", "sbti", "cdp", "iso 14064"];
  const verification = (verificationStandard ?? "").toLowerCase();
  const hasVerification = premiumStandards.some((s) => verification.includes(s));

  // Determine quality score
  let qualityScore: "verified" | "partially_verified" | "unverified" | "greenwashing_risk";
  let verificationStatus: string;

  if (hasVerification && claimedReduction !== null) {
    qualityScore = "verified";
    verificationStatus = `Third-party verified by ${verificationStandard}`;
  } else if (claimedReduction !== null && methodology) {
    qualityScore = "partially_verified";
    verificationStatus = "Methodology documented but not third-party verified";
  } else if (claimedReduction !== null) {
    qualityScore = "unverified";
    verificationStatus = "Claims not verified - greenwashing risk";
  } else {
    qualityScore = "greenwashing_risk";
    verificationStatus = "No quantified impact claims";
  }

  // Assess methodology
  const meth = (methodology ?? "").toLowerCase();
  let methodologyAssessment: string;
  if (meth.includes("removal") || meth.includes("sequestration")) {
    methodologyAssessment = "Removal methodology (higher value credits)";
  } else if (meth.includes("avoided") || meth.includes("displacement")) {
    methodologyAssessment = "Avoided emissions (standard methodology)";
  } else if (meth.includes("reduction")) {
    methodologyAssessment = "Emission reduction (needs baseline clarity)";
  } else {
    methodologyAssessment = "Methodology unclear - requires clarification";
  }

  // Recommendations
  const recommendations: string[] = [];
  if (!hasVerification) {
    recommendations.push("Obtain third-party verification (Verra, Gold Standard) for credibility");
  }
  if (qualityScore === "unverified" || qualityScore === "greenwashing_risk") {
    recommendations.push("Document carbon accounting methodology transparently");
    recommendations.push("Consider SBTi validation for corporate credibility");
  }
  if (percentileVsBenchmark !== null && percentileVsBenchmark < 25) {
    recommendations.push("Carbon impact below stage benchmark - may limit premium positioning");
  }

  return {
    qualityScore,
    percentileVsBenchmark,
    verificationStatus,
    methodologyAssessment,
    recommendations,
  };
}

/**
 * Assess technology readiness for climate tech
 *
 * @param technology Technology description
 * @param demonstratedScale Scale demonstrated (e.g., "pilot", "commercial")
 * @param yearsToCommercial Estimated years to commercial scale
 * @returns Technology readiness assessment
 */
export function assessTechnologyReadiness(
  technology: string | null,
  demonstratedScale: string | null,
  yearsToCommercial: number | null
): {
  trlEstimate: number; // 1-9
  readinessCategory: "proven_commercial" | "early_commercial" | "demonstration" | "pre_commercial";
  scaleUpRisk: "low" | "medium" | "high" | "critical";
  commentary: string;
} {
  const tech = (technology ?? "").toLowerCase();
  const scale = (demonstratedScale ?? "").toLowerCase();

  // Categorize technology
  let readinessCategory: "proven_commercial" | "early_commercial" | "demonstration" | "pre_commercial";
  let baseTRL: number;

  // Check against known categories
  if (
    tech.includes("solar pv") ||
    tech.includes("onshore wind") ||
    tech.includes("lithium-ion") ||
    tech.includes("heat pump") ||
    tech.includes("led")
  ) {
    readinessCategory = "proven_commercial";
    baseTRL = 9;
  } else if (
    tech.includes("offshore wind") ||
    tech.includes("green hydrogen") ||
    tech.includes("electrolysis") ||
    tech.includes("point-source") ||
    tech.includes("ev charging")
  ) {
    readinessCategory = "early_commercial";
    baseTRL = 7;
  } else if (
    tech.includes("dac") ||
    tech.includes("direct air") ||
    tech.includes("long-duration") ||
    tech.includes("green steel") ||
    tech.includes("saf") ||
    tech.includes("sustainable aviation") ||
    tech.includes("enhanced weathering")
  ) {
    readinessCategory = "demonstration";
    baseTRL = 5;
  } else if (
    tech.includes("fusion") ||
    tech.includes("advanced geothermal") ||
    tech.includes("ocean") ||
    tech.includes("solid-state battery") ||
    tech.includes("smr") ||
    tech.includes("small modular")
  ) {
    readinessCategory = "pre_commercial";
    baseTRL = 3;
  } else {
    // Default based on scale
    if (scale.includes("commercial") || scale.includes("deployed")) {
      readinessCategory = "early_commercial";
      baseTRL = 7;
    } else if (scale.includes("pilot") || scale.includes("demo")) {
      readinessCategory = "demonstration";
      baseTRL = 5;
    } else {
      readinessCategory = "pre_commercial";
      baseTRL = 4;
    }
  }

  // Adjust TRL based on demonstrated scale
  let trlEstimate = baseTRL;
  if (scale.includes("commercial") && baseTRL < 8) trlEstimate = Math.min(baseTRL + 2, 9);
  else if (scale.includes("pilot") && baseTRL < 6) trlEstimate = Math.min(baseTRL + 1, 7);
  else if (scale.includes("lab") && baseTRL > 4) trlEstimate = Math.max(baseTRL - 1, 3);

  // Assess scale-up risk
  let scaleUpRisk: "low" | "medium" | "high" | "critical";
  if (readinessCategory === "proven_commercial") scaleUpRisk = "low";
  else if (readinessCategory === "early_commercial") scaleUpRisk = "medium";
  else if (readinessCategory === "demonstration") scaleUpRisk = "high";
  else scaleUpRisk = "critical";

  // Adjust for timeline
  if (yearsToCommercial !== null) {
    if (yearsToCommercial > 5 && scaleUpRisk !== "critical") {
      scaleUpRisk = scaleUpRisk === "low" ? "medium" : scaleUpRisk === "medium" ? "high" : "critical";
    }
  }

  const commentary =
    `TRL estimate: ${trlEstimate}/9 (${readinessCategory.replace("_", " ")}). ` +
    `Scale-up risk: ${scaleUpRisk}. ` +
    (yearsToCommercial !== null ? `${yearsToCommercial} years to commercial scale estimated. ` : "") +
    (scaleUpRisk === "critical"
      ? "CRITICAL: Technology has not been proven at scale - significant execution risk."
      : scaleUpRisk === "high"
        ? "HIGH: Lab-to-commercial gap remains a significant risk."
        : "");

  return { trlEstimate, readinessCategory, scaleUpRisk, commentary };
}

/**
 * Assess unit economics vs carbon credit alternatives
 *
 * @param costPerTonne Cost per tonne CO2e avoided
 * @param customerROI Customer ROI (savings / cost)
 * @returns Unit economics assessment
 */
export function assessUnitEconomicsVsAlternatives(
  costPerTonne: number | null,
  customerROI: number | null
): {
  competitiveness: "highly_competitive" | "competitive" | "marginal" | "uncompetitive";
  vsVoluntaryCredits: string;
  vsComplianceCredits: string;
  commentary: string;
  recommendations: string[];
} {
  // Reference prices (2024)
  const vcmPrice = { low: 2, mid: 8, high: 15 }; // Voluntary avoidance
  const vcmRemoval = { low: 100, mid: 300, high: 1000 }; // Voluntary removal
  const compliancePrice = { eu: 85, california: 35 }; // Compliance credits

  let competitiveness: "highly_competitive" | "competitive" | "marginal" | "uncompetitive";
  let vsVoluntaryCredits: string;
  let vsComplianceCredits: string;
  const recommendations: string[] = [];

  if (costPerTonne === null) {
    competitiveness = "marginal";
    vsVoluntaryCredits = "Cannot assess - cost per tonne not provided";
    vsComplianceCredits = "Cannot assess - cost per tonne not provided";
    recommendations.push("Calculate and document cost per tonne CO2e avoided");
  } else {
    // vs Voluntary credits
    if (costPerTonne <= vcmPrice.mid) {
      vsVoluntaryCredits = `$${costPerTonne}/tonne vs $${vcmPrice.mid} VCM median - competitive`;
    } else if (costPerTonne <= vcmRemoval.low) {
      vsVoluntaryCredits = `$${costPerTonne}/tonne - premium over avoidance ($${vcmPrice.mid}) but competitive with removal ($${vcmRemoval.low}+)`;
    } else {
      vsVoluntaryCredits = `$${costPerTonne}/tonne - expensive vs alternatives`;
    }

    // vs Compliance credits
    if (costPerTonne <= compliancePrice.california) {
      vsComplianceCredits = `Competitive with compliance markets (CA: $${compliancePrice.california}, EU: $${compliancePrice.eu})`;
    } else if (costPerTonne <= compliancePrice.eu) {
      vsComplianceCredits = `Competitive in EU ETS ($${compliancePrice.eu}), expensive in California ($${compliancePrice.california})`;
    } else {
      vsComplianceCredits = `Expensive vs compliance credits - needs co-benefits justification`;
    }

    // Overall competitiveness
    if (costPerTonne <= 25 && (customerROI ?? 0) >= 3) {
      competitiveness = "highly_competitive";
    } else if (costPerTonne <= 60 && (customerROI ?? 0) >= 2) {
      competitiveness = "competitive";
    } else if (costPerTonne <= 100) {
      competitiveness = "marginal";
    } else {
      competitiveness = "uncompetitive";
    }
  }

  // Customer ROI assessment
  if (customerROI !== null && customerROI < 2) {
    recommendations.push("Customer ROI < 2x makes purchase decision difficult for enterprises");
  }
  if (competitiveness === "uncompetitive" || competitiveness === "marginal") {
    recommendations.push("Focus on co-benefits beyond carbon to justify premium");
    recommendations.push("Target compliance markets where prices are higher");
  }

  const commentary =
    `Unit economics: ${competitiveness}. ` +
    (costPerTonne !== null ? `Cost: $${costPerTonne}/tonne. ` : "") +
    (customerROI !== null ? `Customer ROI: ${customerROI}x. ` : "") +
    (competitiveness === "uncompetitive"
      ? "WARNING: Economics don't work vs carbon credit alternatives."
      : "");

  return { competitiveness, vsVoluntaryCredits, vsComplianceCredits, commentary, recommendations };
}

// =============================================================================
// CLIMATE EXPERT CONFIGURATION
// =============================================================================

const CLIMATE_CONFIG: SectorConfig = {
  name: "Climate",
  emoji: "🌱",
  displayName: "Climate Expert",
  description: `Expert sectoriel senior spécialisé dans la CleanTech et les technologies climatiques:
- **Carbon Tech**: DAC, CCUS, enhanced weathering, biochar
- **Renewable Energy**: Solar, wind, geothermal, hydro, storage
- **Green Hydrogen**: Electrolysis, fuel cells, ammonia
- **Energy Efficiency**: Building tech, industrial optimization
- **Sustainable Mobility**: EV infrastructure, fleet electrification, SAF
- **Circular Economy**: Waste-to-value, recycling tech

Expertise spécifique:
- Évaluation de l'impact carbone et vérification (Verra, Gold Standard)
- Analyse de l'alignement policy (IRA, EU Green Deal, carbon pricing)
- Assessment de la maturité technologique (TRL, scale-up risk)
- Validation des offtakes et revenue visibility
- Comparaison unit economics vs carbon credit alternatives
- Exit landscape (energy majors, industrial acquirers)`,

  benchmarkData: EXTENDED_CLIMATE_BENCHMARKS as unknown as SectorBenchmarkData,
  scoringWeights: CLIMATE_SCORING_WEIGHTS,
};

// =============================================================================
// AGENT EXPORT
// =============================================================================

export interface ClimateExpertResult extends AgentResult {
  agentName: "climate-expert";
  data: SectorExpertOutput | null;
}

export const climateExpert = {
  name: "climate-expert" as const,
  tier: 2 as const,
  emoji: "🌱",
  displayName: "Climate Expert",

  // Activation condition
  activationSectors: [
    "Climate",
    "CleanTech",
    "Clean Tech",
    "Carbon",
    "Renewable",
    "Energy",
    "Solar",
    "Wind",
    "Storage",
    "Battery",
    "Hydrogen",
    "GreenTech",
    "Green Tech",
    "Sustainability",
    "Circular Economy",
    "AgTech",
    "EV",
    "Electric Vehicle",
  ],

  // Config
  config: CLIMATE_CONFIG,

  // Prompt builder
  buildPrompt: buildClimatePrompt,

  // Output schema
  outputSchema: SectorExpertOutputSchema,

  // Benchmark data access
  benchmarks: EXTENDED_CLIMATE_BENCHMARKS,

  // Policy reference
  policyLandscape: CLIMATE_POLICY_LANDSCAPE,

  // Tech readiness reference
  techReadiness: CLIMATE_TECH_READINESS,

  // Helper functions
  helpers: {
    assessPolicyAlignment,
    assessCarbonImpact,
    assessTechnologyReadiness,
    assessUnitEconomicsVsAlternatives,
  },

  // Helper to check if this expert should activate
  shouldActivate: (sector: string | null | undefined): boolean => {
    if (!sector) return false;
    const normalized = sector.toLowerCase().trim();
    return climateExpert.activationSectors.some(
      (s) => normalized.includes(s.toLowerCase()) || s.toLowerCase().includes(normalized)
    );
  },

  // Run method with _extended for UI wow effect
  async run(context: EnrichedAgentContext): Promise<SectorExpertResult & { _extended?: ExtendedClimateData }> {
    const startTime = Date.now();

    try {
      const { system, user } = buildClimatePrompt(context);
      setAgentContext("climate-expert");

      const response = await complete(user, {
        systemPrompt: system,
        complexity: "complex",
        temperature: 0.3,
      });

      // Parse JSON from response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const parsedOutput = JSON.parse(jsonMatch[0]) as SectorExpertOutput;

      // Transform to SectorExpertData format using mapping helpers
      const sectorData: SectorExpertData = {
        sectorName: "Climate",
        sectorMaturity: mapMaturity(parsedOutput.sectorFit?.sectorMaturity),
        keyMetrics: parsedOutput.metricsAnalysis?.map(m => ({
          metricName: m.metricName,
          value: m.metricValue ?? m.percentile ?? null,
          sectorBenchmark: { p25: m.benchmark?.p25 ?? 0, median: m.benchmark?.median ?? 0, p75: m.benchmark?.p75 ?? 0, topDecile: m.benchmark?.topDecile ?? 0 },
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
          complexity: parsedOutput.sectorDynamics?.regulatoryRisk?.level === "very_high" ? "high" : (parsedOutput.sectorDynamics?.regulatoryRisk?.level ?? "medium") as "low" | "medium" | "high",
          keyRegulations: parsedOutput.sectorDynamics?.regulatoryRisk?.keyRegulations ?? ["IRA", "EU Green Deal", "Carbon Tax"],
          complianceRisks: [],
          upcomingChanges: parsedOutput.sectorDynamics?.regulatoryRisk?.upcomingChanges ?? [],
        },
        sectorDynamics: {
          competitionIntensity: mapCompetition(parsedOutput.sectorDynamics?.competitionIntensity),
          consolidationTrend: mapConsolidation(parsedOutput.sectorDynamics?.consolidationTrend),
          barrierToEntry: mapBarrier(parsedOutput.sectorDynamics?.barrierToEntry),
          typicalExitMultiple: parsedOutput.sectorDynamics?.exitLandscape?.typicalMultiple?.median ?? 8,
          recentExits: parsedOutput.sectorDynamics?.exitLandscape?.recentExits?.map(e => `${e.company} → ${e.acquirer} (${e.multiple}x, ${e.year})`) ?? [],
        },
        sectorQuestions: parsedOutput.mustAskQuestions?.map(q => ({
          question: q.question,
          category: mapCategory(q.category),
          priority: mapPriority(q.priority),
          expectedAnswer: q.goodAnswer ?? "",
          redFlagAnswer: q.redFlagAnswer ?? "",
        })) ?? [],
        sectorFit: {
          score: parsedOutput.sectorFit?.score ?? 50,
          strengths: parsedOutput.executiveSummary?.topStrengths ?? [],
          weaknesses: parsedOutput.executiveSummary?.topConcerns ?? [],
          sectorTiming: parsedOutput.sectorFit?.timingAssessment === "early_mover" ? "early" :
                        parsedOutput.sectorFit?.timingAssessment === "too_late" ? "late" : "optimal",
        },
        sectorScore: parsedOutput.executiveSummary?.sectorScore ?? parsedOutput.sectorFit?.score ?? 50,
        executiveSummary: parsedOutput.executiveSummary?.verdict ?? parsedOutput.sectorFit?.reasoning ?? "",
      };

      return {
        agentName: "climate-expert",
        success: true,
        executionTimeMs: Date.now() - startTime,
        cost: response.cost ?? 0,
        data: sectorData,
        // Extended data for UI wow effect
        _extended: {
          carbonImpact: {
            annualCO2Reduction: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("co2") || m.metricName.toLowerCase().includes("carbon"))?.metricValue as number ?? null,
            costPerTonCO2: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("cost per ton"))?.metricValue as number ?? null,
            verificationMethod: null,
          },
          policyAlignment: {
            iraEligible: null,
            euGreenDealAligned: null,
            carbonCreditPotential: null,
          },
          technologyReadiness: {
            currentTRL: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("trl"))?.metricValue as number ?? null,
            commercialReadiness: null,
            scaleUpPath: null,
          },
          unitEconomicsVsAlternatives: {
            lcoe: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("lcoe"))?.metricValue as number ?? null,
            vsGridParity: null,
            vsCarbonCredits: null,
          },
          offtakeAgreements: {
            contracted: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("offtake") || m.metricName.toLowerCase().includes("contracted"))?.metricValue as number ?? null,
            pipeline: null,
            averageTermYears: null,
          },
          policyTailwinds: CLIMATE_POLICY_LANDSCAPE ?? null,
          exitLandscape: parsedOutput.sectorDynamics?.exitLandscape ?? null,
          competitivePosition: parsedOutput.competitorBenchmark ?? null,
          sectorSpecificRisks: parsedOutput.sectorRedFlags?.filter(rf =>
            rf.flag.toLowerCase().includes("policy") ||
            rf.flag.toLowerCase().includes("carbon") ||
            rf.flag.toLowerCase().includes("subsidy") ||
            rf.flag.toLowerCase().includes("permitting") ||
            rf.flag.toLowerCase().includes("grid")
          ) ?? [],
          fullMetricsAnalysis: parsedOutput.metricsAnalysis ?? [],
        },
      } as SectorExpertResult & { _extended: ExtendedClimateData };

    } catch (error) {
      console.error("[climate-expert] Execution error:", error);
      return {
        agentName: "climate-expert",
        success: false,
        executionTimeMs: Date.now() - startTime,
        cost: 0,
        error: error instanceof Error ? error.message : "Unknown error",
        data: getDefaultClimateData(),
      };
    }
  },
};

// Extended data type for Climate Expert UI wow effect
interface ExtendedClimateData {
  carbonImpact: {
    annualCO2Reduction: number | null;
    costPerTonCO2: number | null;
    verificationMethod: string | null;
  };
  policyAlignment: {
    iraEligible: boolean | null;
    euGreenDealAligned: boolean | null;
    carbonCreditPotential: number | null;
  };
  technologyReadiness: {
    currentTRL: number | null;
    commercialReadiness: string | null;
    scaleUpPath: string | null;
  };
  unitEconomicsVsAlternatives: {
    lcoe: number | null;
    vsGridParity: string | null;
    vsCarbonCredits: string | null;
  };
  offtakeAgreements: {
    contracted: number | null;
    pipeline: number | null;
    averageTermYears: number | null;
  };
  policyTailwinds: unknown;
  exitLandscape: unknown;
  competitivePosition: unknown;
  sectorSpecificRisks: Array<{ flag: string; severity: string; sectorThreshold?: string }>;
  fullMetricsAnalysis: unknown[];
}

// Default data for error fallback
function getDefaultClimateData(): SectorExpertData {
  return {
    sectorName: "Climate",
    sectorMaturity: "growing",
    keyMetrics: [],
    sectorRedFlags: [
      {
        flag: "Analysis incomplete - unable to perform full climate sector analysis",
        severity: "major",
        sectorReason: "Insufficient data or processing error prevented complete analysis",
      },
    ],
    sectorOpportunities: [],
    regulatoryEnvironment: {
      complexity: "medium",
      keyRegulations: ["IRA", "EU Green Deal", "Carbon Tax"],
      complianceRisks: ["Unable to assess compliance status"],
      upcomingChanges: [],
    },
    sectorDynamics: {
      competitionIntensity: "medium",
      consolidationTrend: "consolidating",
      barrierToEntry: "high",
      typicalExitMultiple: 8,
      recentExits: [],
    },
    sectorQuestions: [
      {
        question: "What is your carbon impact measurement methodology and third-party verification?",
        category: "technical",
        priority: "must_ask",
        expectedAnswer: "Clear methodology with third-party verification (e.g., SBTi, CDP)",
        redFlagAnswer: "No verification or vague impact claims",
      },
    ],
    sectorFit: {
      score: 0,
      strengths: [],
      weaknesses: ["Analysis incomplete"],
      sectorTiming: "optimal",
    },
    sectorScore: 0,
    executiveSummary: "Climate sector analysis could not be completed. Please ensure sufficient deal data is available.",
  };
}

// Default export
export default climateExpert;
