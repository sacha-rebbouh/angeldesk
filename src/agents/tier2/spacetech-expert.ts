/**
 * SpaceTech Expert Agent - TIER 2
 *
 * Specialized analysis for Space Technology, NewSpace, Satellites, Launch, and Space Infrastructure deals.
 *
 * SpaceTech specifics:
 * - Extremely capital intensive ($50M-500M+ to reach orbit for launch, $10-100M+ for constellations)
 * - Very long development cycles (5-10 years to first revenue is normal)
 * - TRL (Technology Readiness Level) and Flight Heritage are critical milestones
 * - Heavy regulatory burden (ITAR/EAR export controls, ITU spectrum, FAA launch licenses)
 * - Government contracts as anchor customers (NASA, DoD, ESA)
 * - SpaceX dominance creates competitive pressure across all segments
 * - Single mission failure can be catastrophic (years of work, customer confidence)
 *
 * Standards: Big4 + Partner VC rigor
 * - Every metric compared to sector benchmarks with percentile positioning
 * - Red flags with evidence, severity, impact, and mitigation
 * - Cross-reference all claims against Funding DB competitors
 * - Actionable output: negotiation ammo, killer questions
 */

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
import { getStandardsOnlyInjection, getBenchmarkInjection } from "./benchmark-injector";
import { complete, setAgentContext } from "@/services/openrouter/router";

// =============================================================================
// SPACETECH-SPECIFIC STANDARDS (INLINE - stable norms)
// =============================================================================

/**
 * SpaceTech Standards - Normes etablies
 *
 * Sources:
 * - Space Capital reports
 * - Bryce Tech annual space reports
 * - NSR (Northern Sky Research) analysis
 * - NASA TRL handbook
 * - Seraphim Space Index
 * - Public filings: Rocket Lab, Planet Labs, Spire Global
 */
const SPACETECH_INLINE_STANDARDS = {
  primaryMetrics: [
    {
      name: "Technology Readiness Level (TRL)",
      unit: "1-9",
      description: "NASA TRL scale for space systems maturity",
      direction: "higher_better" as const,
      sectorContext: "TRL 6+ required for flight hardware. TRL 1-3: Lab. TRL 4-6: Ground testing. TRL 7-9: Flight proven.",
      searchKeywords: ["space TRL benchmark", "satellite technology readiness"],
    },
    {
      name: "Flight Heritage",
      unit: "missions",
      description: "Successful space missions with the technology",
      direction: "higher_better" as const,
      sectorContext: "0 = high risk. 1-3 = emerging. 10+ = proven. Customers require heritage.",
      searchKeywords: ["space flight heritage", "launch success rates"],
    },
    {
      name: "Backlog/Pipeline",
      unit: "$M",
      description: "Signed contracts and launch manifests",
      direction: "higher_better" as const,
      sectorContext: "Long sales cycles (12-36 months). Backlog = derisked revenue.",
      searchKeywords: ["space company backlog", "launch manifest"],
    },
    {
      name: "Government Contract %",
      unit: "%",
      description: "Revenue from gov/defense contracts",
      direction: "target_range" as const,
      sectorContext: "Sweet spot: 30-60%. Too low = missing anchor. Too high = dependency.",
      searchKeywords: ["space government contracts", "NASA commercial"],
    },
  ],

  secondaryMetrics: [
    {
      name: "Cost per kg to Orbit",
      unit: "$/kg",
      description: "Launch cost per kilogram",
      direction: "lower_better" as const,
      sectorContext: "Falcon 9: ~$2,700/kg. Electron: ~$20,000/kg. THE competitive metric for launch.",
      searchKeywords: ["launch cost per kg", "rocket cost comparison"],
    },
    {
      name: "Time to Revenue",
      unit: "months",
      description: "Founding to first commercial revenue",
      direction: "lower_better" as const,
      sectorContext: "Launch: 5-10 years. Satellites: 3-7 years. Ground segment: 1-3 years.",
      searchKeywords: ["space startup time to revenue", "newspace milestones"],
    },
  ],

  unitEconomicsFormulas: [
    {
      name: "Revenue per Satellite",
      formula: "Total Annual Revenue / Active Satellites",
      benchmark: { good: "> $5M/satellite", excellent: "> $20M/satellite" },
      source: "Constellation economics",
    },
    {
      name: "Launch Cost Ratio",
      formula: "Launch Cost / Total Satellite Cost",
      benchmark: { good: "< 30%", excellent: "< 20%" },
      source: "Space economics",
    },
    {
      name: "Constellation Payback",
      formula: "Total CapEx / Annual Revenue",
      benchmark: { good: "< 7 years", excellent: "< 5 years" },
      source: "Satellite financial models",
    },
    {
      name: "Capital Efficiency",
      formula: "Contract Backlog / Total Capital Raised",
      benchmark: { good: "> 1x", excellent: "> 2x" },
      source: "SpaceTech capital benchmarks",
    },
  ],

  redFlagRules: [
    {
      metric: "TRL",
      condition: "<" as const,
      threshold: 4,
      severity: "critical" as const,
      reason: "TRL < 4 at Seed+ = still in lab stage, very long runway to commercialization",
    },
    {
      metric: "Flight Heritage",
      condition: "<" as const,
      threshold: 1,
      severity: "major" as const,
      reason: "Zero heritage = all technology risk ahead, customers hesitant",
    },
    {
      metric: "Time to Revenue",
      condition: ">" as const,
      threshold: 84,
      severity: "critical" as const,
      reason: "7+ years to revenue = extreme execution risk",
    },
    {
      metric: "Government Contract %",
      condition: ">" as const,
      threshold: 90,
      severity: "major" as const,
      reason: "90%+ gov dependency = single customer risk, budget cycle vulnerability",
    },
  ],

  sectorRisks: [
    "Capital intensity: $100M+ to first revenue for launch, $50M+ for constellations",
    "Long development cycles: 5-10 years to orbit is normal",
    "Launch failure risk: Single failure destroys years of work",
    "Regulatory complexity: ITAR/EAR, ITU spectrum, FAA licenses, NOAA permits",
    "SpaceX dominance: Vertical integration, Starlink competition, pricing pressure",
    "Debris and collision risk: LEO congestion increasing",
    "Insurance costs: Expensive and limited for unproven tech",
    "Talent scarcity: Engineers concentrated at SpaceX, Blue Origin, primes",
    "Spectrum interference: ITU disputes, mega-constellation impacts",
    "Geopolitical risk: Launch site access, ITAR restrictions",
  ],

  successPatterns: [
    "Flight heritage: Each mission reduces risk perception dramatically",
    "Government anchor: NASA/DoD/ESA contracts = stable revenue + validation",
    "Vertical integration: SpaceX model for cost control",
    "Asset-light start: Ground segment or software before full space systems",
    "Dual-use: Civil + defense applications expand TAM",
    "Strategic partnerships: Team with primes for distribution",
    "Rideshare: Use Falcon 9/Electron to prove tech cheaply",
    "Data as a service: Sell analytics, not hardware",
    "Non-dilutive: NASA SBIR, DARPA, Space Force grants",
    "Regulatory moat: Secured spectrum/orbital rights = defensibility",
  ],

  typicalAcquirers: [
    "Lockheed Martin", "Northrop Grumman", "Boeing", "Raytheon", "L3Harris",
    "Airbus Defence & Space", "Thales Alenia Space",
    "Rocket Lab", "Planet Labs", "Maxar Technologies",
    "BAE Systems", "General Dynamics",
    "PE (AE Industrial Partners, Veritas)",
  ],
};

// =============================================================================
// SPACETECH-SPECIFIC CONFIGURATION
// =============================================================================

/**
 * SpaceTech Scoring Weights Rationale:
 *
 * - metricsWeight (20%): Lower because early SpaceTech often pre-revenue.
 *   Focus on TRL, flight heritage, backlog.
 *
 * - unitEconomicsWeight (15%): Lower importance early. Most are pre-revenue.
 *   Evaluate projected constellation economics, not current unit econ.
 *
 * - competitiveWeight (20%): Critical. SpaceX dominance, Big Prime threat,
 *   spectrum/orbit scarcity, technology differentiation.
 *
 * - timingWeight (15%): Important. NewSpace boom timing, government budget cycles,
 *   commercial market readiness.
 *
 * - teamFitWeight (30%): HIGHEST. SpaceTech = execution over years.
 *   Aerospace experience, launch failure recovery, gov contract navigation.
 */
const SPACETECH_SCORING_WEIGHTS = {
  metricsWeight: 0.20,
  unitEconomicsWeight: 0.15,
  competitiveWeight: 0.20,
  timingWeight: 0.15,
  teamFitWeight: 0.30,
} as const;

// =============================================================================
// SPACETECH EXPERT CONFIGURATION
// =============================================================================

const SPACETECH_CONFIG: SectorConfig = {
  name: "SpaceTech",
  emoji: "🚀",
  displayName: "SpaceTech Expert",
  description: `Expert sectoriel senior specialise dans les technologies spatiales:
- **Launch**: Launch vehicles, propulsion, rideshare, small launchers
- **Satellites**: Earth observation, communications, IoT, navigation
- **Constellations**: LEO/MEO mega-constellations, formation flying
- **Ground Segment**: Ground stations, TT&C, data processing
- **Space Infrastructure**: In-space servicing, debris removal, manufacturing
- **Components**: Propulsion, avionics, solar panels, antennas

Expertise specifique:
- Evaluation TRL et Flight Heritage
- Analyse regulatory (ITAR/EAR, ITU, FAA, NOAA)
- Government contracts et budget cycles
- Constellation economics et payback analysis
- SpaceX competitive threat assessment
- Capital intensity et runway planning
- Exit landscape (Primes, PE, SPAC history)`,

  benchmarkData: SPACETECH_INLINE_STANDARDS as unknown as SectorBenchmarkData,
  scoringWeights: SPACETECH_SCORING_WEIGHTS,
};

// =============================================================================
// SPACETECH-SPECIFIC PROMPT BUILDER
// =============================================================================

function buildSpacetechPrompt(context: EnrichedAgentContext): {
  system: string;
  user: string;
} {
  const deal = context.deal;
  const stage = deal.stage ?? "SEED";

  // Extract funding DB data
  const dbCompetitors = context.fundingContext?.competitors ?? [];
  const dbBenchmarks = context.fundingContext?.sectorBenchmarks ?? null;

  // TRL expectations for the stage (SpaceTech is slower than DeepTech)
  const trlExpectations: Record<string, { min: number; max: number }> = {
    PRE_SEED: { min: 2, max: 4 },
    SEED: { min: 3, max: 5 },
    SERIES_A: { min: 4, max: 6 },
    SERIES_B: { min: 5, max: 7 },
    SERIES_C: { min: 6, max: 8 },
  };
  const stageKey = stage.toUpperCase().replace(/[\s-]/g, "_");
  const expectedTRL = trlExpectations[stageKey] ?? trlExpectations.SEED;

  // =============================================================================
  // SYSTEM PROMPT
  // =============================================================================
  const systemPrompt = `# ROLE: Senior SpaceTech Due Diligence Expert

Tu es un **expert sectoriel senior** specialise dans le **SpaceTech et l'industrie spatiale**, avec 15+ ans d'experience en due diligence pour des fonds specialises (Space Capital, Seraphim Space, Airbus Ventures, Lockheed Martin Ventures, In-Q-Tel).

## TON EXPERTISE SPECIFIQUE

### Segments SpaceTech
- **Launch**: Small launchers (Rocket Lab, Astra), medium lift, propulsion systems, rideshare
- **Earth Observation**: Optical, SAR, hyperspectral, analytics platforms
- **Communications**: LEO broadband (Starlink, OneWeb), IoT (Swarm, Kineis)
- **Navigation**: GPS alternatives, PNT services
- **Space Infrastructure**: In-space servicing, debris removal, on-orbit manufacturing
- **Ground Segment**: Ground stations as a service, TT&C, mission control

### Metriques SpaceTech Cles
- **TRL (Technology Readiness Level)**: 1-9 scale, flight hardware needs TRL 6+
- **Flight Heritage**: Number of successful missions, customer confidence driver
- **Backlog**: Signed contracts, critical for capital-intensive development
- **Government Contract Mix**: Balance between anchor stability and commercial growth
- **Cost per kg**: THE competitive metric for launch (Falcon 9 benchmark)
- **Constellation Economics**: Revenue per satellite, payback period

### Contexte SpaceTech
- **Extreme Capital Intensity**: Launch = $100M+ to orbit. Constellations = $50-500M+
- **Very Long Cycles**: 5-10 years to first revenue is normal
- **SpaceX Dominance**: Vertical integration, Starlink, pricing pressure
- **Regulatory Complexity**: ITAR/EAR (export), ITU (spectrum), FAA (launch), NOAA (imaging)
- **Government as Customer**: NASA, DoD, ESA, JAXA - budget cycles, program risk
- **Single Point of Failure**: One launch failure = years of work lost

---

## STANDARDS DE QUALITE (Big4 + Partner VC)

### REGLE ABSOLUE: Chaque affirmation doit etre sourcee
- BAD: "L'equipe a de l'experience spatiale et la techno avance bien"
- GOOD: "Team: CTO ex-SpaceX Propulsion (5y), CEO ex-Planet Labs COO. TRL 5 reached (ground demo Q3 2024). 2 NASA SBIR Phase II ($3.2M). Backlog: $8M DoD contract + 3 commercial LOIs."

### REGLE ABSOLUE: Chaque red flag doit avoir
1. **Severite**: critical / high / medium
2. **Preuve**: le data point exact
3. **Seuil sectoriel**: la reference benchmark SpaceTech
4. **Impact quantifie**: sur timeline, funding, ou customer acquisition
5. **Question de validation**: pour le fondateur
6. **Path de mitigation**: ce qui resoudrait le concern

### REGLE ABSOLUE: TRL doit etre approprie au stage
| Stage | Expected TRL | Risk Level |
|-------|--------------|------------|
| Pre-Seed | TRL 2-4 | TRL 1 = concept only |
| Seed | TRL 3-5 | TRL 2 = very early |
| Series A | TRL 4-6 | TRL 3 = significantly behind |
| Series B | TRL 5-7 | TRL 4 = major concern |
| Series C | TRL 6-8 | TRL 5 = not ready for scale |

**Pour ${stage}: Expected TRL ${expectedTRL.min}-${expectedTRL.max}**

---

## BENCHMARKS SPACETECH (Stage: ${stage})

### PRIMARY METRICS (Normes etablies)
| Metric | Context | Good | Excellent |
|--------|---------|------|-----------|
| TRL | Flight hardware needs 6+ | ${expectedTRL.min}+ | ${expectedTRL.max}+ |
| Flight Heritage | Risk reduction | 1-3 missions | 10+ missions |
| Backlog | Revenue derisking | > 1x burn | > 2x burn |
| Gov Contract % | Anchor balance | 30-60% | 40-50% |

### UNIT ECONOMICS (Standards)
${SPACETECH_INLINE_STANDARDS.unitEconomicsFormulas.map(f => `- **${f.name}** = ${f.formula}\n  - Good: ${f.benchmark.good} | Excellent: ${f.benchmark.excellent}`).join("\n")}

### COST BENCHMARKS (Reference Points)
| Item | Budget | Commercial | Premium |
|------|--------|------------|---------|
| Launch (LEO, small) | $15K-30K/kg | $5K-15K/kg | $2K-5K/kg |
| Launch (LEO, medium) | $5K-10K/kg | $2.5K-5K/kg | < $2.5K/kg |
| Smallsat manufacturing | $0.5-1M | $1-3M | $3-10M |
| CubeSat | $50-150K | $150-300K | $300K+ |
| Ground station network | $5-20M | $20-50M | $50M+ |

**Note**: Falcon 9 rideshare at ~$5,500/kg has reset market expectations.

---

## SPACEX COMPETITIVE THREAT ASSESSMENT

SpaceX is the benchmark and often the competitor. Assess impact on each deal:

| Segment | SpaceX Presence | Threat Level |
|---------|-----------------|--------------|
| Launch (medium+) | Falcon 9/Heavy dominant | CRITICAL |
| Launch (small) | Rideshare alternative | HIGH |
| LEO Broadband | Starlink monopoly-building | CRITICAL |
| Earth Observation | Limited direct, but data | MEDIUM |
| IoT/narrowband | Limited | LOW-MEDIUM |
| Ground segment | Starlink ground network | MEDIUM |
| Components/propulsion | Internal only | LOW |

**Key Questions:**
- Can this survive if SpaceX enters?
- Is this complementary to SpaceX ecosystem?
- What's the moat against Falcon 9 pricing pressure?

---

## REGULATORY LANDSCAPE

| Regulation | Authority | Impact | Timeline |
|------------|-----------|--------|----------|
| ITAR/EAR | State Dept/Commerce | Export controls, US persons only | Ongoing |
| ITU Spectrum | ITU | 5-7 year coordination | Pre-launch |
| FAA Launch License | FAA/AST | Required for US launch | 6-18 months |
| NOAA Remote Sensing | NOAA | Required for US EO | 3-12 months |
| FCC Spectrum | FCC | US ground/space comms | Variable |

**Red Flag**: No regulatory strategy = existential risk for satellites/launch.

---

## EXIT LANDSCAPE SPACETECH

**Typical Acquirers:**
${SPACETECH_INLINE_STANDARDS.typicalAcquirers.slice(0, 8).map(a => `- ${a}`).join("\n")}

**Exit Multiples** (varies significantly by segment and heritage):
| Segment | Revenue Multiple | Context |
|---------|------------------|---------|
| Launch (proven) | 3-8x | Rare exits, strategic |
| EO/Data | 5-15x | Data/analytics premium |
| Comms/IoT | 4-10x | Recurring revenue valued |
| Components | 2-5x | Lower, commoditized |
| Infrastructure | 3-8x | Early market |

**Notable Exits/IPOs:**
- Rocket Lab (SPAC 2021): $4.1B valuation
- Planet Labs (SPAC 2021): $2.8B valuation
- Spire Global (SPAC 2021): $1.6B valuation
- Maxar (PE take-private 2023): $6.4B
- Note: Many SPACs traded down significantly post-IPO

---

## SECTOR SUCCESS PATTERNS
${SPACETECH_INLINE_STANDARDS.successPatterns.map(p => `✅ ${p}`).join("\n")}

## SECTOR RISK PATTERNS
${SPACETECH_INLINE_STANDARDS.sectorRisks.map(r => `⚠️ ${r}`).join("\n")}

---

## SCORING METHODOLOGY

Le score sectoriel (0-100) est calcule ainsi:
- **Team/Execution fit**: ${SPACETECH_SCORING_WEIGHTS.teamFitWeight * 100}% (HIGHEST - SpaceTech = multi-year execution)
- **Metriques (TRL, heritage, backlog)**: ${SPACETECH_SCORING_WEIGHTS.metricsWeight * 100}%
- **Positionnement concurrentiel**: ${SPACETECH_SCORING_WEIGHTS.competitiveWeight * 100}%
- **Timing (market, gov budget)**: ${SPACETECH_SCORING_WEIGHTS.timingWeight * 100}%
- **Unit economics (projected)**: ${SPACETECH_SCORING_WEIGHTS.unitEconomicsWeight * 100}%

**SpaceTech = Team-heavy (30% weight)**. Without aerospace veterans who've been through launch campaigns and failures, execution risk is extreme.

**Grille:**
- 80-100: Aerospace veterans + TRL ahead + flight heritage + gov anchor + SpaceX-defensible niche
- 60-79: Strong team + TRL on track + some backlog + clear regulatory path
- 40-59: Good team but TRL behind or no heritage or SpaceX threat unmitigated
- 20-39: Team gaps or significant technology risk or no clear path to orbit/revenue
- 0-19: Critical gaps in team, technology, or regulatory strategy

---

## OUTPUT FORMAT

Tu DOIS retourner un JSON valide suivant exactement le schema fourni.
CHAQUE champ doit contenir des donnees concretes et sourcees, jamais de placeholders.

## EXEMPLES

### Exemple de BON output (SpaceTech):
"SpaceTech Assessment:

**Sub-sector**: Small satellite propulsion systems (Hall effect thrusters)
**Business Model**: Hardware + recurring propellant services

TRL Assessment:
- Current TRL: 6 (system validated in relevant environment - vacuum chamber testing)
- Expected for ${stage}: TRL ${expectedTRL.min}-${expectedTRL.max}
- Assessment: ON TRACK
- Path to TRL 9: First flight demo Q2 2025 (manifested on Rocket Lab Electron)

Flight Heritage:
- Status: 0 flights (pre-heritage)
- Path to Heritage: First flight booked, rideshare contract signed
- Risk: HIGH until first successful mission

Team Analysis:
- CEO: 12y aerospace (JPL + Planet Labs, 3 missions flown)
- CTO: PhD Stanford Aerospace, 8 patents in electric propulsion
- VP Ops: Ex-Rocket Lab manufacturing (scaled production 10x)
- Aerospace depth: 80% of engineering team with flight experience
- Key Person Risk: MEDIUM - CTO is critical for IP, no clear succession

Government Traction:
- NASA SBIR Phase II: $1.5M (2023) - validates technology approach
- Space Force TACFI: $2M contract (signed Q4 2024)
- Gov %: 60% current, targeting 40% at scale

Backlog Analysis:
- Signed contracts: $4.5M (2 gov + 1 commercial)
- LOIs: $8M in pipeline
- Backlog/Burn: 1.8x (healthy for stage)

SpaceX Threat:
- Direct: LOW (SpaceX uses internal Starlink Hall thrusters, not selling)
- Indirect: MEDIUM (Starlink commoditizes LEO, pressures all smallsat economics)
- Mitigation: Higher performance for constellation maneuvers SpaceX doesn't offer

Regulatory Status:
- ITAR: EAR99 classification (exportable, major advantage)
- No spectrum required (propulsion, not comms)
- Risk: LOW

RED FLAGS:
1. [MEDIUM] No flight heritage - mitigated by booked launch Q2 2025
2. [MEDIUM] CTO key person risk - mitigated by 8 patents assigned to company"

### Exemple de MAUVAIS output (a eviter):
"The team has space experience and the technology is promising.
They have some government contracts and are making progress."

→ Aucun TRL, aucun heritage assessment, pas d'analyse SpaceX threat, pas de backlog detail.`;

  // =============================================================================
  // USER PROMPT
  // =============================================================================
  const userPrompt = `# ANALYSE SECTORIELLE SPACETECH

## DEAL A ANALYSER

**Company:** ${deal.companyName ?? deal.name}
**Sector:** ${deal.sector ?? "SpaceTech (a confirmer)"}
**Sub-sector:** ${deal.sector ?? "A determiner (Launch, EO, Comms, Components?)"}
**Stage:** ${stage}
**Geography:** ${deal.geography ?? "Non specifie"}
**Valorisation demandee:** ${deal.valuationPre ? `${(Number(deal.valuationPre) / 1_000_000).toFixed(1)}M€` : "Non specifiee"}
**Montant leve:** ${deal.amountRequested ? `${(Number(deal.amountRequested) / 1_000_000).toFixed(1)}M€` : "Non specifie"}

---

## DONNEES EXTRAITES DU DECK
${context.extractedData ? JSON.stringify(context.extractedData, null, 2) : "Pas de donnees extraites disponibles"}

---

## RESULTATS DES AGENTS TIER 1
${
  context.previousResults
    ? Object.entries(context.previousResults)
        .filter(([, v]) => (v as { success?: boolean })?.success)
        .map(([k, v]) => `### ${k}\n${JSON.stringify((v as { data?: unknown })?.data, null, 2)}`)
        .join("\n\n")
    : "Pas de resultats Tier 1 disponibles"
}

---

## DONNEES FUNDING DB (Concurrents SpaceTech)
${
  dbCompetitors.length > 0
    ? `
**${dbCompetitors.length} concurrents SpaceTech identifies dans la DB:**
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
      `- **${c.name}**: ${c.totalFunding ? `${(c.totalFunding / 1_000_000).toFixed(1)}M€ leves` : "funding inconnu"}, ${c.lastRound ?? "stage inconnu"}, ${c.subSector ?? ""}, ${c.status ?? ""}`
  )
  .join("\n")}
`
    : "Pas de donnees concurrentielles SpaceTech disponibles dans la DB - SIGNALER ce gap"
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

### 1. SPACETECH CLASSIFICATION
- Quel sous-secteur exact? (Launch, EO, Comms, IoT, Components, Infrastructure?)
- Quel business model? (Hardware, Data/Analytics, Services, Hybrid?)
- Capital intensity level? (Low = ground/software, High = satellites, Extreme = launch)
- **Les benchmarks et risques dependent de cette classification**

### 2. TRL ASSESSMENT (CRITICAL)
- Current TRL estime (1-9) avec justification detaillee
- Expected TRL pour ${stage}: ${expectedTRL.min}-${expectedTRL.max}
- Assessment: ahead / on_track / behind / critical
- Path to TRL 9 (flight proven): Timeline et milestones
- Funded milestones vs unfunded gaps

### 3. FLIGHT HERITAGE ANALYSIS
- Current heritage: 0, 1-3, 4-9, 10+ missions?
- Path to first flight if pre-heritage
- Launch manifest status (booked, manifested, waiting)
- Heritage risk assessment

### 4. TEAM ANALYSIS (CRITICAL - 30% du score)
- Aerospace experience depth (SpaceX, Blue Origin, primes, NASA/ESA)
- Flight campaign experience (have they launched hardware?)
- Failure recovery experience (critical for SpaceTech)
- Government contract experience (DoD, NASA)
- Key person risk assessment
- Compare to SpaceTech founding team benchmarks

### 5. GOVERNMENT TRACTION
- Current contracts (NASA, DoD, ESA, commercial)
- SBIR/STTR status and amounts
- Government % of revenue/backlog
- Budget cycle dependency risk
- Path to commercial diversification

### 6. BACKLOG & PIPELINE ANALYSIS
- Signed contracts (value, customer, timeline)
- LOIs and pipeline (probability-weighted)
- Backlog/burn ratio assessment
- Customer concentration risk

### 7. SPACEX THREAT ASSESSMENT (CRITICAL)
Pour le sous-secteur:
- Direct competition level
- Indirect impact (Starlink commoditization, Falcon 9 pricing)
- Defensibility vs SpaceX entry
- Complementary opportunity?

### 8. REGULATORY STRATEGY
- ITAR/EAR classification and impact
- Spectrum requirements (if applicable)
- Launch license path (if applicable)
- International customer restrictions
- Regulatory moat potential

### 9. CAPITAL INTENSITY & RUNWAY
- Capital required to key milestones
- Current runway vs milestone timing
- Non-dilutive opportunities (SBIR, DoD)
- Break-even path

### 10. METRICS vs BENCHMARKS
Pour chaque KPI disponible:
- Compare aux benchmarks SpaceTech fournis
- Percentile position vs sector
- Stage-appropriate assessment

### 11. RED FLAGS SECTORIELS
Applique les red flag rules SpaceTech.
Pour chaque violation:
- Cite la preuve exacte
- Reference le seuil viole
- Quantifie l'impact sur timeline ou fundability
- Propose la question de validation
- Path de mitigation

### 12. COMPETITOR BENCHMARK (Funding DB)
En utilisant les donnees DB:
- Qui sont les leaders du segment?
- Funding comparatif
- Heritage comparison
- Exit precedents

### 13. EXIT LANDSCAPE ANALYSIS
- Acquireurs probables (Primes, PE, strategic)?
- Multiple attendu base sur segment et heritage?
- IPO viability (post-SPAC market reality)?
- Strategic acquirer fit analysis

### 14. KILLER QUESTIONS SPACETECH
Genere 6-8 questions specifiques:
- Au moins 2 sur TRL et path to flight
- Au moins 2 sur team et execution experience
- Au moins 1 sur SpaceX threat mitigation
- Au moins 1 sur regulatory strategy
- Au moins 1 sur capital/runway
- Avec good answer et red flag answer pour chaque

### 15. NEGOTIATION AMMUNITION
Identifie 3-5 leviers bases sur:
- TRL behind expectations
- No flight heritage
- SpaceX threat without mitigation
- Regulatory gaps
- Gov dependency
- Capital intensity vs runway

### 16. EXECUTIVE SUMMARY
- Verdict one-line
- Score sectoriel (0-100) avec breakdown
- Top 3 strengths (avec preuves quantifiees)
- Top 3 concerns (avec preuves quantifiees)
- Implication claire pour la decision d'investissement
- Confidence level et data gaps

---

## RAPPELS CRITIQUES

⚠️ **TEAM IS EVERYTHING**: 30% du score. Sans veterans aerospace ayant vecu des campagnes de lancement, le risque est extreme.
⚠️ **TRL MUST MATCH STAGE**: TRL ${expectedTRL.min}-${expectedTRL.max} attendu pour ${stage}
⚠️ **SPACEX THREAT**: Assess explicitly - ignorance = red flag
⚠️ **FLIGHT HERITAGE**: Zero heritage at Series A+ is a major concern
⚠️ **CAPITAL INTENSITY**: SpaceTech burns cash - runway analysis critical
⚠️ **CROSS-REFERENCE** - Compare aux concurrents de la DB

Retourne un JSON valide avec toutes les sections completees.`;

  return { system: systemPrompt, user: userPrompt };
}

// =============================================================================
// EXPORT SPACETECH EXPERT AGENT
// =============================================================================

export interface SpacetechExpertResult extends AgentResult {
  agentName: "spacetech-expert";
  data: SectorExpertOutput | null;
}

export const spacetechExpert = {
  name: "spacetech-expert" as const,
  tier: 2 as const,
  emoji: "🚀",
  displayName: "SpaceTech Expert",

  // Activation condition
  activationSectors: [
    "SpaceTech",
    "Space Tech",
    "Space",
    "Aerospace",
    "NewSpace",
    "New Space",
    "Satellite",
    "Satellites",
    "Launch",
    "Launcher",
    "Rocket",
    "Earth Observation",
    "EO",
    "LEO",
    "GEO",
    "Constellation",
    "Space Infrastructure",
    "In-space",
    "Orbital",
  ],

  // Config
  config: SPACETECH_CONFIG,

  // Prompt builder
  buildPrompt: buildSpacetechPrompt,

  // Output schema
  outputSchema: SectorExpertOutputSchema,

  // Benchmark data access
  benchmarks: SPACETECH_INLINE_STANDARDS,

  // Helper functions
  helpers: {
    assessTRLForStage,
    assessSpaceXThreat,
    assessFlightHeritage,
    assessRegulatoryRisk,
  },

  // Helper to check if this expert should activate
  shouldActivate: (sector: string | null | undefined): boolean => {
    if (!sector) return false;
    const normalized = sector.toLowerCase().trim();
    return spacetechExpert.activationSectors.some(
      (s) => normalized.includes(s.toLowerCase()) || s.toLowerCase().includes(normalized)
    );
  },

  // Run method with _extended for UI wow effect
  async run(context: EnrichedAgentContext): Promise<SectorExpertResult & { _extended?: ExtendedSpaceTechData }> {
    const startTime = Date.now();

    try {
      const { system, user } = buildSpacetechPrompt(context);
      setAgentContext("spacetech-expert");

      const response = await complete(user, {
        systemPrompt: system,
        complexity: "complex",
        maxTokens: 8000,
        temperature: 0.3,
      });

      // Parse JSON from response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const parsedOutput = JSON.parse(jsonMatch[0]) as SectorExpertOutput;

      // Transform to SectorExpertData format
      const sectorData: SectorExpertData = {
        sectorName: "SpaceTech",
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
          complexity: parsedOutput.sectorDynamics?.regulatoryRisk?.level ?? "very_high",
          keyRegulations: parsedOutput.sectorDynamics?.regulatoryRisk?.keyRegulations ?? ["ITAR/EAR", "ITU", "FAA", "FCC"],
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
          category: "technical" as const,
          priority: q.priority as "must_ask" | "should_ask" | "nice_to_have",
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
        sectorScore: parsedOutput.sectorFit?.score ?? 50,
        executiveSummary: parsedOutput.sectorFit?.reasoning ?? "",
      };

      return {
        agentName: "spacetech-expert",
        success: true,
        executionTimeMs: Date.now() - startTime,
        cost: response.cost ?? 0,
        data: sectorData,
        // Extended data for UI wow effect
        _extended: {
          technologyReadiness: {
            currentTRL: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("trl"))?.metricValue as number ?? null,
            flightHeritage: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("flight") || m.metricName.toLowerCase().includes("heritage"))?.metricValue as string ?? null,
            pathToOrbit: null,
          },
          missionProfile: {
            segment: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("segment"))?.metricValue as string ?? null,
            orbit: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("orbit") || m.metricName.toLowerCase().includes("leo") || m.metricName.toLowerCase().includes("geo"))?.metricValue as string ?? null,
            constellationSize: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("constellation"))?.metricValue as number ?? null,
          },
          regulatoryStatus: {
            itarCompliance: null,
            ituSpectrum: null,
            faaLicense: null,
            exportControls: parsedOutput.sectorDynamics?.regulatoryRisk?.level ?? "high",
          },
          capitalRequirements: {
            toFirstRevenue: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("capital") || m.metricName.toLowerCase().includes("funding"))?.metricValue as number ?? null,
            toOrbit: null,
            burnRate: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("burn"))?.metricValue as number ?? null,
          },
          customerBase: {
            anchorCustomers: [],
            govContractValue: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("contract") || m.metricName.toLowerCase().includes("government"))?.metricValue as number ?? null,
            commercialPipeline: null,
          },
          spaceXThreat: null,
          exitLandscape: parsedOutput.sectorDynamics?.exitLandscape ?? null,
          competitivePosition: parsedOutput.competitorBenchmark ?? null,
          sectorSpecificRisks: parsedOutput.sectorRedFlags?.filter(rf =>
            rf.flag.toLowerCase().includes("spacex") ||
            rf.flag.toLowerCase().includes("launch") ||
            rf.flag.toLowerCase().includes("itar") ||
            rf.flag.toLowerCase().includes("orbital") ||
            rf.flag.toLowerCase().includes("mission")
          ) ?? [],
          scoringWeights: SPACETECH_SCORING_WEIGHTS,
          fullMetricsAnalysis: parsedOutput.metricsAnalysis ?? [],
        },
      } as unknown as SectorExpertResult & { _extended: ExtendedSpaceTechData };

    } catch (error) {
      console.error("[spacetech-expert] Execution error:", error);
      return {
        agentName: "spacetech-expert",
        success: false,
        executionTimeMs: Date.now() - startTime,
        cost: 0,
        error: error instanceof Error ? error.message : "Unknown error",
        data: getDefaultSpaceTechData(),
      };
    }
  },
};

// Extended data type for SpaceTech Expert UI wow effect
interface ExtendedSpaceTechData {
  technologyReadiness: {
    currentTRL: number | null;
    flightHeritage: string | null;
    pathToOrbit: string | null;
  };
  missionProfile: {
    segment: string | null;
    orbit: string | null;
    constellationSize: number | null;
  };
  regulatoryStatus: {
    itarCompliance: string | null;
    ituSpectrum: string | null;
    faaLicense: string | null;
    exportControls: string;
  };
  capitalRequirements: {
    toFirstRevenue: number | null;
    toOrbit: number | null;
    burnRate: number | null;
  };
  customerBase: {
    anchorCustomers: string[];
    govContractValue: number | null;
    commercialPipeline: number | null;
  };
  spaceXThreat: unknown;
  exitLandscape: unknown;
  competitivePosition: unknown;
  sectorSpecificRisks: Array<{ flag: string; severity: string; sectorThreshold?: string }>;
  scoringWeights: typeof SPACETECH_SCORING_WEIGHTS;
  fullMetricsAnalysis: unknown[];
}

// Default data for error fallback
function getDefaultSpaceTechData(): SectorExpertData {
  return {
    sectorName: "SpaceTech",
    sectorMaturity: "emerging",
    keyMetrics: [],
    sectorRedFlags: [
      {
        flag: "Analysis incomplete - unable to perform full spacetech sector analysis",
        severity: "major",
        sectorReason: "Insufficient data or processing error prevented complete analysis",
      },
    ],
    sectorOpportunities: [],
    regulatoryEnvironment: {
      complexity: "very_high",
      keyRegulations: ["ITAR/EAR", "ITU", "FAA", "FCC"],
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
        question: "What is your current TRL and flight heritage?",
        category: "technical",
        priority: "must_ask",
        expectedAnswer: "Clear TRL with demonstrated flight heritage or credible path to orbit",
        redFlagAnswer: "No flight heritage and unrealistic timeline to orbit",
      },
    ],
    sectorFit: {
      score: 0,
      strengths: [],
      weaknesses: ["Analysis incomplete"],
      sectorTiming: "optimal",
    },
    sectorScore: 0,
    executiveSummary: "SpaceTech sector analysis could not be completed. Please ensure sufficient deal data is available.",
  };
}

// Default export
export default spacetechExpert;

// =============================================================================
// SPACETECH-SPECIFIC HELPER FUNCTIONS
// =============================================================================

/**
 * Evaluate Technology Readiness Level (TRL) appropriateness for stage
 * SpaceTech has slightly lower TRL expectations than generic DeepTech due to longer cycles
 */
export function assessTRLForStage(trl: number, stage: string): {
  assessment: "ahead" | "on_track" | "behind" | "critical";
  expectedRange: { min: number; max: number };
  commentary: string;
} {
  const expectedTRL: Record<string, { min: number; max: number }> = {
    "PRE_SEED": { min: 2, max: 4 },
    "SEED": { min: 3, max: 5 },
    "SERIES_A": { min: 4, max: 6 },
    "SERIES_B": { min: 5, max: 7 },
    "SERIES_C": { min: 6, max: 8 },
  };

  const stageKey = stage.toUpperCase().replace(/[\s-]/g, "_");
  const expected = expectedTRL[stageKey] ?? expectedTRL.SEED;

  let assessment: "ahead" | "on_track" | "behind" | "critical";
  let commentary: string;

  if (trl > expected.max) {
    assessment = "ahead";
    commentary = `TRL ${trl} ahead of ${stage} expectations (${expected.min}-${expected.max}). Strong technical progress for SpaceTech.`;
  } else if (trl >= expected.min) {
    assessment = "on_track";
    commentary = `TRL ${trl} within expected range for ${stage} (${expected.min}-${expected.max}). Normal SpaceTech progression.`;
  } else if (trl >= expected.min - 1) {
    assessment = "behind";
    commentary = `TRL ${trl} slightly behind for ${stage} (expected ${expected.min}-${expected.max}). May need additional time/capital.`;
  } else {
    assessment = "critical";
    commentary = `TRL ${trl} significantly behind for ${stage} (expected ${expected.min}-${expected.max}). Major execution risk.`;
  }

  return { assessment, expectedRange: expected, commentary };
}

/**
 * Assess SpaceX competitive threat for a SpaceTech segment
 */
export function assessSpaceXThreat(
  segment: string,
  hasDefensibleNiche: boolean
): {
  threatLevel: "critical" | "high" | "medium" | "low";
  reasoning: string;
  mitigation: string[];
} {
  const segmentNormalized = segment.toLowerCase();

  // Threat level by segment
  const criticalSegments = ["launch", "leo broadband", "starlink"];
  const highSegments = ["communications", "comms", "rideshare", "small satellite"];
  const mediumSegments = ["earth observation", "eo", "ground station", "analytics"];
  const lowSegments = ["components", "propulsion", "sensors", "manufacturing"];

  let baseThreat: "critical" | "high" | "medium" | "low";
  if (criticalSegments.some(s => segmentNormalized.includes(s))) baseThreat = "critical";
  else if (highSegments.some(s => segmentNormalized.includes(s))) baseThreat = "high";
  else if (mediumSegments.some(s => segmentNormalized.includes(s))) baseThreat = "medium";
  else if (lowSegments.some(s => segmentNormalized.includes(s))) baseThreat = "low";
  else baseThreat = "medium";

  // Reduce threat if defensible niche
  if (hasDefensibleNiche) {
    const threatLevels: Array<"low" | "medium" | "high" | "critical"> = ["low", "medium", "high", "critical"];
    const currentIndex = threatLevels.indexOf(baseThreat);
    if (currentIndex > 0) {
      baseThreat = threatLevels[currentIndex - 1];
    }
  }

  const mitigation: string[] = [];
  if (baseThreat === "critical" || baseThreat === "high") {
    mitigation.push("Focus on niche SpaceX won't prioritize (specialized payloads, gov-only, international)");
    mitigation.push("Build data/analytics layer SpaceX doesn't offer");
    mitigation.push("Consider complementary positioning (supply to SpaceX ecosystem)");
  }
  mitigation.push("Monitor Starlink pricing and capability announcements");

  const reasoning = `${segment} has ${baseThreat} SpaceX threat. ` +
    (hasDefensibleNiche ? "Defensible niche provides some protection. " : "No clear niche differentiation. ") +
    "SpaceX vertical integration and pricing power affect all segments.";

  return { threatLevel: baseThreat, reasoning, mitigation };
}

/**
 * Assess flight heritage status and risk
 */
export function assessFlightHeritage(
  missionsFlown: number,
  stage: string
): {
  status: "proven" | "emerging" | "pre_heritage";
  riskLevel: "low" | "medium" | "high" | "critical";
  commentary: string;
} {
  let status: "proven" | "emerging" | "pre_heritage";
  let riskLevel: "low" | "medium" | "high" | "critical";
  let commentary: string;

  if (missionsFlown >= 10) {
    status = "proven";
    riskLevel = "low";
    commentary = `${missionsFlown} missions flown - proven flight heritage. Customer confidence high.`;
  } else if (missionsFlown >= 1) {
    status = "emerging";
    riskLevel = "medium";
    commentary = `${missionsFlown} mission(s) flown - emerging heritage. Each additional mission reduces risk.`;
  } else {
    status = "pre_heritage";
    // Risk depends on stage
    const stageKey = stage.toUpperCase().replace(/[\s-]/g, "_");
    if (stageKey === "PRE_SEED" || stageKey === "SEED") {
      riskLevel = "high";
      commentary = "Pre-heritage is acceptable at Seed but first flight is critical milestone.";
    } else {
      riskLevel = "critical";
      commentary = `Pre-heritage at ${stage} is concerning. Government/enterprise customers expect heritage.`;
    }
  }

  return { status, riskLevel, commentary };
}

/**
 * Assess regulatory risk for SpaceTech company
 */
export function assessRegulatoryRisk(
  hasITARStrategy: boolean,
  needsSpectrum: boolean,
  hasSpectrumRights: boolean,
  needsLaunchLicense: boolean,
  hasLaunchPath: boolean
): {
  riskLevel: "low" | "medium" | "high" | "critical";
  gaps: string[];
  commentary: string;
} {
  const gaps: string[] = [];

  if (!hasITARStrategy) {
    gaps.push("No ITAR/EAR export control strategy - limits international customers and hiring");
  }
  if (needsSpectrum && !hasSpectrumRights) {
    gaps.push("Spectrum required but not secured - ITU coordination takes 5-7 years");
  }
  if (needsLaunchLicense && !hasLaunchPath) {
    gaps.push("Launch license required but path unclear - FAA process is 6-18 months");
  }

  let riskLevel: "low" | "medium" | "high" | "critical";
  if (gaps.length === 0) {
    riskLevel = "low";
  } else if (gaps.length === 1) {
    riskLevel = "medium";
  } else if (gaps.length === 2) {
    riskLevel = "high";
  } else {
    riskLevel = "critical";
  }

  const commentary = gaps.length === 0
    ? "Regulatory strategy appears sound."
    : `${gaps.length} regulatory gap(s) identified: ${gaps.join("; ")}`;

  return { riskLevel, gaps, commentary };
}
