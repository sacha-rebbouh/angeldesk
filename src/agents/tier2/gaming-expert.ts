/**
 * Gaming Expert Agent - TIER 2
 *
 * Specialized analysis for Gaming, Esports, Metaverse, and Interactive Entertainment deals.
 *
 * Gaming specifics:
 * - Hit-driven business model (1 in 100 games succeed at scale)
 * - Retention metrics are king: D1, D7, D30 determine everything
 * - LTV/CPI ratio is the unit economics holy grail (must be >1.3x)
 * - Platform dependency: Apple/Google/Steam take 30% and control distribution
 * - LiveOps is table stakes: players expect constant content updates
 * - Whale concentration: top 1-5% of players drive 70-90% of revenue
 * - UA costs exploded post-iOS14, organic/viral essential
 * - Exit path: strategic acquirers (Tencent, Microsoft, Sony, EA, Take-Two)
 *
 * Sub-sectors covered:
 * - Mobile gaming (F2P, hypercasual, midcore, strategy)
 * - PC/Console gaming (premium, F2P, live service)
 * - Esports (teams, platforms, infrastructure)
 * - Metaverse/VR/AR gaming
 * - Gaming infrastructure (engines, tools, analytics)
 * - Game streaming and cloud gaming
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
import { GAMING_STANDARDS } from "./sector-standards";
import { getStandardsOnlyInjection } from "./benchmark-injector";
import { complete, setAgentContext } from "@/services/openrouter/router";

// =============================================================================
// GAMING-SPECIFIC CONFIGURATION
// =============================================================================

/**
 * Gaming Scoring Weights Rationale:
 *
 * - metricsWeight (40%): Highest weight. Gaming lives and dies by metrics.
 *   D1/D7/D30 retention, DAU/MAU, ARPDAU are non-negotiable indicators.
 *   Unlike DeepTech, gaming metrics are available early and predictive.
 *
 * - unitEconomicsWeight (30%): Critical. LTV/CPI ratio determines profitability.
 *   Post-iOS14, UA costs have exploded. Must see path to profitable acquisition.
 *   CPI trends, ARPDAU evolution, payback period all matter.
 *
 * - competitiveWeight (15%): Important but less so than metrics.
 *   Gaming is hit-driven - a great game can beat incumbents.
 *   Focus on differentiation and genre positioning, not market share.
 *
 * - timingWeight (10%): Genre trends matter (battle royale, hypercasual waves).
 *   Being late to a saturated genre is death. Being early to new platform (VR) is risky.
 *   But great execution trumps timing in gaming.
 *
 * - teamFitWeight (5%): Lower than other sectors. Gaming team quality shows in metrics.
 *   Shipped titles and metrics speak louder than pedigree.
 *   Exception: zero-shipped teams get scrutinized harder.
 */
const GAMING_SCORING_WEIGHTS = {
  metricsWeight: 0.40,
  unitEconomicsWeight: 0.30,
  competitiveWeight: 0.15,
  timingWeight: 0.10,
  teamFitWeight: 0.05,
} as const;

// =============================================================================
// EXTENDED GAMING BENCHMARKS (using new sector-standards architecture)
// =============================================================================

/**
 * Gaming-specific benchmark configuration.
 * Uses sector-standards for established norms + gaming-specific formulas.
 * Percentiles de marche doivent venir de recherche web, pas de donnees hardcodees.
 */
const EXTENDED_GAMING_BENCHMARKS = {
  sector: "Gaming",

  // Primary metrics from standards (definitions only, no hardcoded percentiles)
  primaryMetrics: GAMING_STANDARDS.primaryMetrics.map(m => ({
    name: m.name,
    unit: m.unit,
    description: m.description,
    direction: m.direction,
    sectorContext: m.sectorContext,
    // Note: percentiles removed - must come from web search
    stages: {
      SEED: { p25: 0, median: 0, p75: 0, topDecile: 0 }, // Placeholder
      SERIES_A: { p25: 0, median: 0, p75: 0, topDecile: 0 },
    },
    thresholds: { exceptional: 0, good: 0, concerning: 0 }, // Use red flag rules instead
  })),

  secondaryMetrics: GAMING_STANDARDS.secondaryMetrics.map(m => ({
    name: m.name,
    unit: m.unit,
    description: m.description,
    direction: m.direction,
    sectorContext: m.sectorContext,
    stages: {
      SEED: { p25: 0, median: 0, p75: 0, topDecile: 0 },
      SERIES_A: { p25: 0, median: 0, p75: 0, topDecile: 0 },
    },
    thresholds: { exceptional: 0, good: 0, concerning: 0 },
  })),

  // Gaming-specific unit economics formulas (qualitative - stable)
  unitEconomicsFormulas: [
    {
      name: "LTV (Lifetime Value)",
      formula: "ARPDAU × Average Lifetime Days",
      benchmark: {
        good: "$3-5 for casual, $8-15 for midcore (sustainable UA at scale)",
        excellent: "$15+ for midcore, $30+ for strategy/RPG (whale-driven)",
      },
    },
    {
      name: "LTV/CPI Ratio",
      formula: "Lifetime Value / Cost Per Install",
      benchmark: {
        good: ">1.3x (profitable UA with margin for error)",
        excellent: ">2.0x (strong unit economics, can scale aggressively)",
      },
    },
    {
      name: "Contribution Margin",
      formula: "(LTV - CPI) / LTV",
      benchmark: {
        good: ">25% ($0.25 profit per $1 LTV)",
        excellent: ">50% (exceptional UA efficiency)",
      },
    },
    {
      name: "Payback Days",
      formula: "CPI / ARPDAU",
      benchmark: {
        good: "<90 days (recover CAC within 3 months)",
        excellent: "<30 days (recover CAC within 1 month)",
      },
    },
    {
      name: "ARPPU/ARPDAU Ratio",
      formula: "Average Revenue Per Paying User / Average Revenue Per DAU",
      benchmark: {
        good: "15-25x (healthy whale/minnow balance)",
        excellent: "10-15x (broad monetization, less whale-dependent)",
      },
    },
    {
      name: "Organic Install Rate",
      formula: "Organic Installs / Total Installs",
      benchmark: {
        good: ">30% (some viral/word-of-mouth traction)",
        excellent: ">50% (strong organic, reduces UA dependency)",
      },
    },
  ],

  // Red flag rules from standards
  redFlagRules: GAMING_STANDARDS.redFlagRules,

  // Exit multiples - placeholder, actual values from web search
  exitMultiples: {
    low: 1,
    median: 4,
    high: 10,
    topDecile: 20,
    typicalAcquirers: GAMING_STANDARDS.typicalAcquirers,
    recentExits: [], // Must come from web search
  },

  // Sector-specific patterns (qualitative - stable)
  sectorSpecificRisks: GAMING_STANDARDS.sectorRisks,
  sectorSuccessPatterns: GAMING_STANDARDS.successPatterns,

  // Function to get formatted standards for prompt
  getFormattedStandards: (stage: string) => getStandardsOnlyInjection("Gaming", stage),
};

// =============================================================================
// GAMING EXPERT CONFIGURATION
// =============================================================================

const GAMING_CONFIG: SectorConfig = {
  name: "Gaming",
  emoji: "🎮",
  displayName: "Gaming Expert",
  description: `Expert sectoriel senior spécialisé dans le gaming et l'entertainment interactif:
- **Mobile Gaming**: F2P, hypercasual, midcore, strategy, puzzle, casino
- **PC/Console**: Premium, live service, early access, indie
- **Esports**: Teams, leagues, betting, streaming infrastructure
- **Metaverse/XR**: VR gaming, AR experiences, social gaming
- **Gaming Infra**: Engines, tools, analytics, anti-cheat, cloud gaming

Expertise spécifique:
- Analyse approfondie des métriques de rétention (D1/D7/D30/D90)
- Évaluation de la monétisation (ARPDAU, ARPPU, conversion rate, whale curves)
- Audit des unit economics (LTV/CPI, payback, contribution margin)
- Assessment de la stratégie UA post-iOS14 (ATT impact, SKAN)
- Analyse du pipeline LiveOps et coûts de content treadmill
- Positionnement genre et timing marché (genre saturation analysis)
- Comparaison aux exits gaming historiques (Supercell, Zynga, Activision)
- Évaluation du risque plateforme (Apple/Google policy, Steam algorithm)`,

  benchmarkData: EXTENDED_GAMING_BENCHMARKS as unknown as SectorBenchmarkData,
  scoringWeights: GAMING_SCORING_WEIGHTS,
};

// =============================================================================
// GAMING-SPECIFIC PROMPT BUILDER
// =============================================================================

function buildGamingPrompt(context: EnrichedAgentContext): {
  system: string;
  user: string;
} {
  const deal = context.deal;
  const stage = deal.stage ?? "SEED";
  const benchmarks = EXTENDED_GAMING_BENCHMARKS;

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
  const systemPrompt = `# ROLE: Senior Gaming Industry Due Diligence Expert

Tu es un **expert sectoriel senior** spécialisé dans le **Gaming et l'Interactive Entertainment**, avec 15+ ans d'expérience en due diligence pour des fonds gaming spécialisés (Makers Fund, BITKRAFT, Griffin Gaming Partners, Galaxy Interactive).

## TON EXPERTISE SPÉCIFIQUE

### Segments Gaming
- **Mobile Gaming**: F2P, hypercasual, midcore, strategy, puzzle, casino
- **PC/Console**: Premium, live service, early access, indie, AAA
- **Esports**: Teams, leagues, betting, streaming infrastructure
- **Metaverse/XR**: VR gaming, AR experiences, social gaming
- **Gaming Infra**: Engines, tools, analytics, anti-cheat, cloud gaming, UGC platforms

### Métriques Gaming Clés
- **Rétention**: D1, D7, D30, D90 (seuls KPIs vraiment prédictifs)
- **Monétisation**: ARPDAU, ARPPU, conversion rate, whale curves, IAP/ads mix
- **UA Economics**: LTV, CPI, LTV/CPI ratio, payback days, organic rate
- **LiveOps**: Update frequency, content velocity, seasonal events performance
- **Plateforme**: iOS/Android/Steam split, ATT impact, SKAN attribution

### Contexte Post-iOS14
- **ATT a tué le cheap UA**: CPI up 50-100% depuis 2021
- **Attribution cassée**: SKAN limits tracking, LTV models moins fiables
- **Shift vers contextuel**: Creative testing, audience modeling, MMM
- **Organic est roi**: Viral/word-of-mouth essentiel pour profitabilité

---

## STANDARDS DE QUALITÉ (Big4 + Partner VC)

### RÈGLE ABSOLUE: Chaque affirmation doit être sourcée
- ❌ "La rétention est bonne"
- ✅ "D1 45% est P72 pour un hypercasual (median genre: 40%, Data.ai Q4 2024), mais D7 18% (P25) suggère un engagement cliff"

### RÈGLE ABSOLUE: Chaque red flag doit avoir
1. **Sévérité**: critical / high / medium
2. **Preuve**: le data point exact qui déclenche le flag
3. **Seuil sectoriel**: la référence benchmark Gaming violée
4. **Impact quantifié**: implication sur unit economics, scalability, exit
5. **Question de validation**: comment investiguer avec le fondateur
6. **Path de mitigation**: ce qui résoudrait le concern

### RÈGLE ABSOLUE: Context matters - Genre-specific analysis
Les benchmarks varient ENORMÉMENT par genre. Un D1 de 40% est:
- **Excellent** pour du casual
- **Acceptable** pour du midcore
- **Concernant** pour du strategy/RPG

---

## BENCHMARKS GAMING (Stage: ${stage})

### RETENTION BENCHMARKS BY GENRE
| Genre | D1 Weak | D1 Acceptable | D1 Strong | D1 Exceptional |
|-------|---------|---------------|-----------|----------------|
| Hypercasual | <30% | 40% | 50% | 60%+ |
| Casual | <25% | 35% | 45% | 55%+ |
| Puzzle | <30% | 40% | 50% | 60%+ |
| Midcore | <30% | 40% | 50% | 60%+ |
| Strategy | <35% | 45% | 55% | 65%+ |
| RPG | <35% | 45% | 55% | 65%+ |
| MMO | <40% | 50% | 60% | 70%+ |

**D7 Rule of Thumb**: 50-60% of D1 is normal. Below 45% = engagement cliff.
**D30 Rule of Thumb**: 20-35% of D1 depending on genre. Strategy/RPG need 30%+.

### MONETIZATION BENCHMARKS BY GENRE
| Genre | ARPDAU Weak | ARPDAU Acceptable | ARPDAU Good | ARPDAU Excellent |
|-------|-------------|-------------------|-------------|------------------|
| Hypercasual | <$0.02 | $0.04 | $0.08 | $0.15+ |
| Casual | <$0.04 | $0.08 | $0.15 | $0.30+ |
| Midcore | <$0.08 | $0.15 | $0.30 | $0.60+ |
| Strategy | <$0.15 | $0.25 | $0.50 | $1.00+ |
| RPG | <$0.15 | $0.25 | $0.50 | $1.00+ |
| Casino | <$0.20 | $0.40 | $0.80 | $1.50+ |

### UA ECONOMICS THRESHOLDS
| Metric | Critical | Marginal | Acceptable | Good | Excellent |
|--------|----------|----------|------------|------|-----------|
| LTV/CPI | <1.0x | 1.0-1.3x | 1.3-1.8x | 1.8-2.5x | >2.5x |
| Payback Days | >180 | 120-180 | 90-120 | 30-90 | <30 |
| Organic Rate | <10% | 10-20% | 20-30% | 30-50% | >50% |

---

## RED FLAG RULES (AUTOMATIQUES)
${benchmarks.redFlagRules.map((r) => `- **${r.severity.toUpperCase()}**: ${r.metric} ${r.condition} ${r.threshold} → ${r.reason}`).join("\n")}

---

## UNIT ECONOMICS FORMULAS
${benchmarks.unitEconomicsFormulas.map((f) => `- **${f.name}** = ${f.formula}\n  - Good: ${f.benchmark.good} | Excellent: ${f.benchmark.excellent}`).join("\n")}

---

## EXIT LANDSCAPE GAMING

**Exit Multiples (Revenue):**
| P25 | Median | P75 | Top 10% |
|-----|--------|-----|---------|
| ${benchmarks.exitMultiples.low}x | ${benchmarks.exitMultiples.median}x | ${benchmarks.exitMultiples.high}x | ${benchmarks.exitMultiples.topDecile}x |

**Acquéreurs Typiques:**
${benchmarks.exitMultiples.typicalAcquirers.map((a) => `- ${a}`).join("\n")}

**Warning**: Gaming exits are highly hit-driven. Most studios exit at 2-4x. Only breakout hits get 10x+.

---

## SECTOR SUCCESS PATTERNS
${benchmarks.sectorSuccessPatterns.map((p) => `✅ ${p}`).join("\n")}

## SECTOR RISK PATTERNS
${benchmarks.sectorSpecificRisks.map((r) => `⚠️ ${r}`).join("\n")}

---

## SCORING METHODOLOGY

Le score sectoriel (0-100) est calculé ainsi:
- **Métriques (D1/D7/D30, DAU/MAU, ARPDAU)**: ${GAMING_SCORING_WEIGHTS.metricsWeight * 100}%
- **Unit economics (LTV/CPI, payback, organic)**: ${GAMING_SCORING_WEIGHTS.unitEconomicsWeight * 100}%
- **Positionnement concurrentiel**: ${GAMING_SCORING_WEIGHTS.competitiveWeight * 100}%
- **Timing (genre saturation, platform trends)**: ${GAMING_SCORING_WEIGHTS.timingWeight * 100}%
- **Team fit (shipped titles, industry connections)**: ${GAMING_SCORING_WEIGHTS.teamFitWeight * 100}%

**Gaming is metrics-first (40% weight)**. Team pedigree matters less - shipped games speak.

**Grille:**
- 80-100: Top-decile retention + LTV/CPI >2x + strong organic + proven team
- 60-79: Strong retention + LTV/CPI >1.5x + some organic traction
- 40-59: Acceptable metrics but concerns on UA efficiency or retention decay
- 20-39: Weak metrics, unprofitable unit economics, or genre saturation
- 0-19: Core loop broken, unprofitable UA, or critical red flags

---

## OUTPUT FORMAT

Tu DOIS retourner un JSON valide suivant exactement le schema fourni.
CHAQUE champ doit contenir des données concrètes et sourcées, jamais de placeholders.

## EXEMPLES

### Exemple de BON output (Gaming):
"Retention Analysis:
- D1: 48% - Strong for casual/puzzle (P75 = 50%). Core loop engaging.
- D7: 28% (58% of D1) - On track. Standard decay curve.
- D30: 14% (29% of D1) - Slightly below typical 35% ratio for puzzle. May indicate meta-game weakness.

Unit Economics:
- LTV: $4.50 (calculated: ARPDAU $0.15 × 30 avg days)
- CPI: $1.80 (iOS $2.50, Android $1.20, blended)
- LTV/CPI: 2.5x - Excellent. Can scale aggressively.
- Payback: 12 days - Top decile.
- Organic rate: 35% - Healthy buffer against CPI increases.

Platform Risk Assessment:
- iOS: 65% of revenue - HIGH concentration post-ATT
- Recommendation: Accelerate Android and consider PC/Steam port"

### Exemple de MAUVAIS output (à éviter):
"The game has good retention and the team is experienced.
The market for mobile gaming is large.
Unit economics look profitable."

→ Aucune quantification, aucun percentile, aucun benchmark par genre.`;

  // =============================================================================
  // USER PROMPT
  // =============================================================================
  const userPrompt = `# ANALYSE SECTORIELLE GAMING

## DEAL À ANALYSER

**Company:** ${deal.companyName ?? deal.name}
**Sector:** ${deal.sector ?? "Gaming (à confirmer)"}
**Sub-sector:** ${deal.sector ?? "À déterminer (Mobile, PC/Console, Esports, Infra?)"}
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

## DONNÉES FUNDING DB (Concurrents Gaming)
${
  dbCompetitors.length > 0
    ? `
**${dbCompetitors.length} concurrents Gaming identifiés dans la DB:**
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
    : "Pas de données concurrentielles Gaming disponibles dans la DB - SIGNALER ce gap de données"
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

### 1. GAME TYPE CLASSIFICATION
- Quel genre précis? (hypercasual, casual, midcore, strategy, RPG, etc.)
- Quelle plateforme? (mobile, PC, console, multi-platform)
- Quel business model? (F2P, premium, live service, hybrid)
- **Les benchmarks à appliquer dépendent de cette classification**

### 2. RETENTION ANALYSIS (CRITICAL)
Pour D1, D7, D30 disponibles:
- Compare au benchmark du genre SPÉCIFIQUE (pas générique mobile)
- Calcule le percentile exact
- Analyse la courbe de decay (D7/D1 ratio, D30/D1 ratio)
- Identifie engagement cliffs ou problèmes de core loop
- **UTILISE assessRetentionForGenre mentalement** pour contextualiser

### 3. MONETIZATION DEEP DIVE
- ARPDAU vs benchmark genre
- Conversion rate et ARPPU
- Model type: whale-driven, broad-based, hybrid, ad-dependent?
- Whale concentration risk (top 5% generating what % of revenue?)
- IAP vs Ads mix
- **UTILISE assessMonetization mentalement** pour évaluer

### 4. UA ECONOMICS AUDIT
- LTV calculation method (show the formula used)
- CPI by platform (iOS vs Android vs other)
- LTV/CPI ratio and assessment
- Payback period in days
- Organic install rate (CRITICAL post-iOS14)
- CPI trend (increasing/stable/decreasing)
- **UTILISE assessUAEfficiency mentalement** pour scorer

### 5. PLATFORM RISK ASSESSMENT
- Revenue breakdown by platform
- iOS concentration (ATT impact vulnerability)
- Single-platform dependency risk
- Platform policy exposure
- **UTILISE assessPlatformRisk mentalement** pour évaluer

### 6. LIVEOPS READINESS
- Team structure for LiveOps
- Update frequency (weekly/biweekly/monthly)
- Content pipeline sustainability
- Burn risk from content treadmill
- **UTILISE assessLiveOpsReadiness mentalement** pour évaluer

### 7. GENRE TIMING & SATURATION
- Is the genre saturated? Growing? Declining?
- Competitive density in genre (how many well-funded competitors?)
- Genre-specific success requirements
- Timing window assessment

### 8. RED FLAGS SECTORIELS
Applique les red flag rules Gaming.
Pour chaque violation:
- Cite la preuve exacte et le percentile
- Référence le benchmark genre violé
- Quantifie l'impact (unit economics, scalability)
- Propose la question de validation
- Path de mitigation

### 9. COMPETITOR BENCHMARK (Funding DB)
En utilisant les données DB:
- Qui sont les leaders du genre? Funding comparatif?
- Position vs concurrent médian
- What metrics differentiate top performers?
- Exit precedents dans le genre?

### 10. EXIT LANDSCAPE ANALYSIS
- Acquéreurs probables pour ce type de deal?
- Multiple attendu basé sur genre et metrics?
- Strategic fit with acquirers (Tencent, EA, Take-Two, Microsoft)?
- IPO viability (rare for gaming, require massive scale)?

### 11. KILLER QUESTIONS GAMING
Génère 6-8 questions spécifiques:
- Au moins 2 sur retention et core loop
- Au moins 2 sur UA economics et post-iOS14 strategy
- Au moins 1 sur LiveOps sustainability
- Au moins 1 sur platform diversification
- Avec good answer et red flag answer pour chaque

### 12. NEGOTIATION AMMUNITION
Identifie 3-5 leviers basés sur:
- Metrics below genre benchmark (with percentiles)
- UA efficiency concerns
- Platform concentration risk
- Genre saturation
- LiveOps sustainability questions

### 13. EXECUTIVE SUMMARY
- Verdict one-line
- Score sectoriel (0-100) avec breakdown
- Top 3 strengths (avec preuves quantifiées)
- Top 3 concerns (avec preuves quantifiées)
- Implication claire pour la décision d'investissement
- Confidence level et data gaps

---

## RAPPELS CRITIQUES

⚠️ **GENRE-SPECIFIC**: Toujours utiliser les benchmarks du genre exact, pas des moyennes gaming génériques
⚠️ **POST-iOS14**: UA economics ont fondamentalement changé - organic rate et LTV/CPI sont critiques
⚠️ **METRICS FIRST**: Gaming is data-driven - metrics trump team pedigree
⚠️ **WHALE RISK**: Assess concentration and sustainability of whale revenue
⚠️ **CROSS-REFERENCE** - Compare aux concurrents Gaming de la DB

Retourne un JSON valide avec toutes les sections complétées.`;

  return { system: systemPrompt, user: userPrompt };
}

// =============================================================================
// EXPORT GAMING EXPERT AGENT
// =============================================================================

export interface GamingExpertResult extends AgentResult {
  agentName: "gaming-expert";
  data: SectorExpertOutput | null;
}

export const gamingExpert = {
  name: "gaming-expert" as const,
  tier: 2 as const,
  emoji: "🎮",
  displayName: "Gaming Expert",

  // Activation condition
  activationSectors: [
    "Gaming",
    "Games",
    "Video Games",
    "Mobile Gaming",
    "Esports",
    "E-Sports",
    "Metaverse",
    "VR Gaming",
    "AR Gaming",
    "Game Studio",
    "Interactive Entertainment",
    "Cloud Gaming",
  ],

  // Config
  config: GAMING_CONFIG,

  // Prompt builder
  buildPrompt: buildGamingPrompt,

  // Output schema
  outputSchema: SectorExpertOutputSchema,

  // Benchmark data access
  benchmarks: EXTENDED_GAMING_BENCHMARKS,

  // Helper functions
  helpers: {
    assessRetentionForGenre,
    assessMonetization,
    assessUAEfficiency,
    assessPlatformRisk,
    assessLiveOpsReadiness,
  },

  // Helper to check if this expert should activate
  shouldActivate: (sector: string | null | undefined): boolean => {
    if (!sector) return false;
    const normalized = sector.toLowerCase().trim();
    return gamingExpert.activationSectors.some(
      (s) => normalized.includes(s.toLowerCase()) || s.toLowerCase().includes(normalized)
    );
  },

  // Run method with _extended for UI wow effect
  async run(context: EnrichedAgentContext): Promise<SectorExpertResult & { _extended?: ExtendedGamingData }> {
    const startTime = Date.now();

    try {
      const { system, user } = buildGamingPrompt(context);
      setAgentContext("gaming-expert");

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

      // Transform to SectorExpertData format using mapping helpers
      const sectorData: SectorExpertData = {
        sectorName: "Gaming",
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
          complexity: parsedOutput.sectorDynamics?.regulatoryRisk?.level === "very_high" ? "high" : (parsedOutput.sectorDynamics?.regulatoryRisk?.level ?? "low") as "low" | "medium" | "high",
          keyRegulations: parsedOutput.sectorDynamics?.regulatoryRisk?.keyRegulations ?? [],
          complianceRisks: [],
          upcomingChanges: parsedOutput.sectorDynamics?.regulatoryRisk?.upcomingChanges ?? [],
        },
        sectorDynamics: {
          competitionIntensity: mapCompetition(parsedOutput.sectorDynamics?.competitionIntensity),
          consolidationTrend: mapConsolidation(parsedOutput.sectorDynamics?.consolidationTrend),
          barrierToEntry: mapBarrier(parsedOutput.sectorDynamics?.barrierToEntry),
          typicalExitMultiple: parsedOutput.sectorDynamics?.exitLandscape?.typicalMultiple?.median ?? 4,
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
        agentName: "gaming-expert",
        success: true,
        executionTimeMs: Date.now() - startTime,
        cost: response.cost ?? 0,
        data: sectorData,
        // Extended data for UI wow effect
        _extended: {
          genre: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("genre"))?.metricValue as string ?? null,
          retentionMetrics: {
            d1: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("d1"))?.metricValue as number ?? null,
            d7: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("d7"))?.metricValue as number ?? null,
            d30: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("d30"))?.metricValue as number ?? null,
          },
          monetization: {
            arpdau: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("arpdau"))?.metricValue as number ?? null,
            payingUserRate: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("conversion") || m.metricName.toLowerCase().includes("paying"))?.metricValue as number ?? null,
            arppu: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("arppu"))?.metricValue as number ?? null,
          },
          uaEconomics: {
            ltv: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("ltv"))?.metricValue as number ?? null,
            cpi: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("cpi"))?.metricValue as number ?? null,
            ltvCpiRatio: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("ltv/cpi") || m.metricName.toLowerCase().includes("roi"))?.metricValue as number ?? null,
            organicRate: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("organic"))?.metricValue as number ?? null,
          },
          platformRisk: null,
          exitLandscape: parsedOutput.sectorDynamics?.exitLandscape ?? null,
          competitivePosition: parsedOutput.competitorBenchmark ?? null,
          sectorSpecificRisks: parsedOutput.sectorRedFlags?.filter(rf =>
            rf.flag.toLowerCase().includes("retention") ||
            rf.flag.toLowerCase().includes("platform") ||
            rf.flag.toLowerCase().includes("whale") ||
            rf.flag.toLowerCase().includes("liveops")
          ) ?? [],
          scoringWeights: GAMING_SCORING_WEIGHTS,
          fullMetricsAnalysis: parsedOutput.metricsAnalysis ?? [],
        },
      } as SectorExpertResult & { _extended: ExtendedGamingData };

    } catch (error) {
      console.error("[gaming-expert] Execution error:", error);
      return {
        agentName: "gaming-expert",
        success: false,
        executionTimeMs: Date.now() - startTime,
        cost: 0,
        error: error instanceof Error ? error.message : "Unknown error",
        data: getDefaultGamingData(),
      };
    }
  },
};

// Extended data type for Gaming Expert UI wow effect
interface ExtendedGamingData {
  genre: string | null;
  retentionMetrics: {
    d1: number | null;
    d7: number | null;
    d30: number | null;
  };
  monetization: {
    arpdau: number | null;
    payingUserRate: number | null;
    arppu: number | null;
  };
  uaEconomics: {
    ltv: number | null;
    cpi: number | null;
    ltvCpiRatio: number | null;
    organicRate: number | null;
  };
  platformRisk: unknown;
  exitLandscape: unknown;
  competitivePosition: unknown;
  sectorSpecificRisks: Array<{ flag: string; severity: string; sectorThreshold?: string }>;
  scoringWeights: typeof GAMING_SCORING_WEIGHTS;
  fullMetricsAnalysis: unknown[];
}

// Default data for error fallback
function getDefaultGamingData(): SectorExpertData {
  return {
    sectorName: "Gaming",
    sectorMaturity: "growing",
    keyMetrics: [],
    sectorRedFlags: [
      {
        flag: "Analysis incomplete - unable to perform full gaming sector analysis",
        severity: "major",
        sectorReason: "Insufficient data or processing error prevented complete analysis",
      },
    ],
    sectorOpportunities: [],
    regulatoryEnvironment: {
      complexity: "low",
      keyRegulations: ["App Store Guidelines", "GDPR for minors"],
      complianceRisks: ["Unable to assess compliance status"],
      upcomingChanges: [],
    },
    sectorDynamics: {
      competitionIntensity: "intense",
      consolidationTrend: "consolidating",
      barrierToEntry: "medium",
      typicalExitMultiple: 4,
      recentExits: [],
    },
    sectorQuestions: [
      {
        question: "What are your D1, D7, and D30 retention rates by cohort?",
        category: "business",
        priority: "must_ask",
        expectedAnswer: "Clear cohort data with D1 >40%, D7 >20%, D30 >10% for midcore",
        redFlagAnswer: "No cohort data or rates below genre benchmarks",
      },
    ],
    sectorFit: {
      score: 0,
      strengths: [],
      weaknesses: ["Analysis incomplete"],
      sectorTiming: "optimal",
    },
    sectorScore: 0,
    executiveSummary: "Gaming sector analysis could not be completed. Please ensure sufficient deal data is available.",
  };
}

// Default export
export default gamingExpert;

// =============================================================================
// GAMING-SPECIFIC HELPER FUNCTIONS
// =============================================================================

/**
 * Assess retention quality based on game genre
 *
 * Different genres have different retention expectations.
 * Hypercasual D1 40% is good, but strategy D1 40% is concerning.
 *
 * @param d1 Day 1 retention %
 * @param d7 Day 7 retention %
 * @param d30 Day 30 retention %
 * @param genre Game genre
 * @returns Retention quality assessment
 */
export function assessRetentionForGenre(
  d1: number,
  d7: number | null,
  d30: number | null,
  genre: string
): {
  assessment: "exceptional" | "strong" | "acceptable" | "weak" | "critical";
  d1Assessment: string;
  d7Assessment: string | null;
  d30Assessment: string | null;
  commentary: string;
  genreContext: string;
} {
  const genreNormalized = genre.toLowerCase();

  // Genre-specific D1 expectations
  const d1Expectations: Record<string, { weak: number; acceptable: number; strong: number; exceptional: number }> = {
    hypercasual: { weak: 30, acceptable: 40, strong: 50, exceptional: 60 },
    casual: { weak: 25, acceptable: 35, strong: 45, exceptional: 55 },
    puzzle: { weak: 30, acceptable: 40, strong: 50, exceptional: 60 },
    midcore: { weak: 30, acceptable: 40, strong: 50, exceptional: 60 },
    strategy: { weak: 35, acceptable: 45, strong: 55, exceptional: 65 },
    rpg: { weak: 35, acceptable: 45, strong: 55, exceptional: 65 },
    mmo: { weak: 40, acceptable: 50, strong: 60, exceptional: 70 },
    shooter: { weak: 30, acceptable: 40, strong: 50, exceptional: 60 },
    default: { weak: 25, acceptable: 35, strong: 45, exceptional: 55 },
  };

  // Find matching genre or use default
  let expectations = d1Expectations.default;
  for (const [key, exp] of Object.entries(d1Expectations)) {
    if (genreNormalized.includes(key)) {
      expectations = exp;
      break;
    }
  }

  // Assess D1
  let d1Assessment: string;
  if (d1 >= expectations.exceptional) {
    d1Assessment = `D1 ${d1}% is exceptional for ${genre} (top decile: ${expectations.exceptional}%+)`;
  } else if (d1 >= expectations.strong) {
    d1Assessment = `D1 ${d1}% is strong for ${genre} (above ${expectations.strong}% threshold)`;
  } else if (d1 >= expectations.acceptable) {
    d1Assessment = `D1 ${d1}% is acceptable for ${genre} (meets ${expectations.acceptable}% minimum)`;
  } else if (d1 >= expectations.weak) {
    d1Assessment = `D1 ${d1}% is weak for ${genre} (below ${expectations.acceptable}%, needs improvement)`;
  } else {
    d1Assessment = `D1 ${d1}% is critical for ${genre} (below ${expectations.weak}%, core loop likely broken)`;
  }

  // Assess D7 (typically 50-60% of D1)
  let d7Assessment: string | null = null;
  if (d7 !== null) {
    const d7RatioExpected = 0.55; // D7 typically 50-60% of D1
    const d7Expected = d1 * d7RatioExpected;
    if (d7 >= d7Expected * 1.2) {
      d7Assessment = `D7 ${d7}% is excellent (${((d7 / d1) * 100).toFixed(0)}% of D1, above ${(d7RatioExpected * 100).toFixed(0)}% expected)`;
    } else if (d7 >= d7Expected * 0.9) {
      d7Assessment = `D7 ${d7}% is on track (${((d7 / d1) * 100).toFixed(0)}% of D1)`;
    } else {
      d7Assessment = `D7 ${d7}% is concerning (${((d7 / d1) * 100).toFixed(0)}% of D1, below expected decay curve)`;
    }
  }

  // Assess D30 (typically 20-35% of D1 depending on genre)
  let d30Assessment: string | null = null;
  if (d30 !== null) {
    const d30RatioGood = genreNormalized.includes("strategy") || genreNormalized.includes("rpg") ? 0.35 : 0.25;
    const d30Expected = d1 * d30RatioGood;
    if (d30 >= d30Expected * 1.3) {
      d30Assessment = `D30 ${d30}% is excellent (${((d30 / d1) * 100).toFixed(0)}% of D1, strong long-term retention)`;
    } else if (d30 >= d30Expected * 0.8) {
      d30Assessment = `D30 ${d30}% is acceptable (${((d30 / d1) * 100).toFixed(0)}% of D1)`;
    } else {
      d30Assessment = `D30 ${d30}% is weak (${((d30 / d1) * 100).toFixed(0)}% of D1, engagement cliff detected)`;
    }
  }

  // Overall assessment
  let assessment: "exceptional" | "strong" | "acceptable" | "weak" | "critical";
  if (d1 >= expectations.exceptional && (d7 === null || d7 >= d1 * 0.5) && (d30 === null || d30 >= d1 * 0.25)) {
    assessment = "exceptional";
  } else if (d1 >= expectations.strong && (d7 === null || d7 >= d1 * 0.45)) {
    assessment = "strong";
  } else if (d1 >= expectations.acceptable) {
    assessment = "acceptable";
  } else if (d1 >= expectations.weak) {
    assessment = "weak";
  } else {
    assessment = "critical";
  }

  const genreContext = `${genre} games typically see D1 retention of ${expectations.acceptable}-${expectations.strong}% at launch, ` +
    `with top performers at ${expectations.exceptional}%+. ` +
    (genreNormalized.includes("hypercasual")
      ? "Hypercasual relies on high D1 but accepts faster decay."
      : genreNormalized.includes("strategy") || genreNormalized.includes("rpg")
        ? "Strategy/RPG games need stronger D30 to monetize deep spenders."
        : "This genre follows standard mobile retention curves.");

  const commentary = assessment === "exceptional"
    ? "Retention profile is exceptional - ready to scale UA aggressively."
    : assessment === "strong"
      ? "Solid retention foundation - continue optimization but can start scaling."
      : assessment === "acceptable"
        ? "Retention is acceptable but should be improved before heavy UA spend."
        : assessment === "weak"
          ? "Retention needs work - do not scale UA until D1 improves."
          : "Core loop is likely broken - fix game design before spending on UA.";

  return { assessment, d1Assessment, d7Assessment, d30Assessment, commentary, genreContext };
}

/**
 * Assess monetization model quality
 *
 * @param arpdau Average revenue per DAU
 * @param payingUserRate % of users who pay
 * @param arppu Average revenue per paying user
 * @param genre Game genre
 * @returns Monetization assessment
 */
export function assessMonetization(
  arpdau: number,
  payingUserRate: number,
  arppu: number,
  genre: string
): {
  assessment: "excellent" | "good" | "acceptable" | "weak" | "critical";
  modelType: "whale-driven" | "broad-based" | "hybrid" | "ad-dependent";
  whaleRisk: "high" | "medium" | "low";
  commentary: string;
  recommendations: string[];
} {
  const genreNormalized = genre.toLowerCase();

  // Determine monetization model type
  let modelType: "whale-driven" | "broad-based" | "hybrid" | "ad-dependent";
  if (payingUserRate < 1 && arppu > 100) {
    modelType = "whale-driven";
  } else if (payingUserRate > 5 && arppu < 30) {
    modelType = "broad-based";
  } else if (arpdau < 0.05 && payingUserRate < 2) {
    modelType = "ad-dependent";
  } else {
    modelType = "hybrid";
  }

  // Assess whale risk
  const whaleConcentration = (arppu * payingUserRate / 100) / arpdau; // Rough proxy
  let whaleRisk: "high" | "medium" | "low";
  if (payingUserRate < 1 || whaleConcentration > 0.9) {
    whaleRisk = "high";
  } else if (payingUserRate < 3 || whaleConcentration > 0.7) {
    whaleRisk = "medium";
  } else {
    whaleRisk = "low";
  }

  // Genre-specific ARPDAU expectations
  const arpdauBenchmarks: Record<string, { weak: number; acceptable: number; good: number; excellent: number }> = {
    hypercasual: { weak: 0.02, acceptable: 0.04, good: 0.08, excellent: 0.15 },
    casual: { weak: 0.04, acceptable: 0.08, good: 0.15, excellent: 0.30 },
    midcore: { weak: 0.08, acceptable: 0.15, good: 0.30, excellent: 0.60 },
    strategy: { weak: 0.15, acceptable: 0.25, good: 0.50, excellent: 1.00 },
    rpg: { weak: 0.15, acceptable: 0.25, good: 0.50, excellent: 1.00 },
    casino: { weak: 0.20, acceptable: 0.40, good: 0.80, excellent: 1.50 },
    default: { weak: 0.05, acceptable: 0.10, good: 0.20, excellent: 0.40 },
  };

  let benchmarks = arpdauBenchmarks.default;
  for (const [key, b] of Object.entries(arpdauBenchmarks)) {
    if (genreNormalized.includes(key)) {
      benchmarks = b;
      break;
    }
  }

  // Overall assessment
  let assessment: "excellent" | "good" | "acceptable" | "weak" | "critical";
  if (arpdau >= benchmarks.excellent && payingUserRate >= 3) {
    assessment = "excellent";
  } else if (arpdau >= benchmarks.good && payingUserRate >= 2) {
    assessment = "good";
  } else if (arpdau >= benchmarks.acceptable) {
    assessment = "acceptable";
  } else if (arpdau >= benchmarks.weak) {
    assessment = "weak";
  } else {
    assessment = "critical";
  }

  // Recommendations
  const recommendations: string[] = [];
  if (whaleRisk === "high") {
    recommendations.push("Diversify monetization to reduce whale dependency - battle passes, cosmetics, subscriptions");
  }
  if (payingUserRate < 2) {
    recommendations.push("Improve first-purchase conversion - consider starter packs, time-limited offers");
  }
  if (arpdau < benchmarks.acceptable) {
    recommendations.push("ARPDAU below genre benchmark - review pricing, offer cadence, and monetization triggers");
  }
  if (modelType === "ad-dependent") {
    recommendations.push("Ad-dependent model has lower LTV ceiling - consider adding IAP layer");
  }

  const commentary = `${modelType.charAt(0).toUpperCase() + modelType.slice(1).replace("-", " ")} monetization model. ` +
    `ARPDAU $${arpdau.toFixed(3)} is ${assessment} for ${genre}. ` +
    `${payingUserRate.toFixed(1)}% conversion with $${arppu.toFixed(0)} ARPPU. ` +
    (whaleRisk === "high" ? "High whale dependency is a concentration risk." : "");

  return { assessment, modelType, whaleRisk, commentary, recommendations };
}

/**
 * Assess UA efficiency and sustainability
 *
 * @param ltv Lifetime value per user
 * @param cpi Cost per install
 * @param organicRate % of installs that are organic
 * @param cpiTrend Whether CPI is increasing, stable, or decreasing
 * @returns UA assessment
 */
export function assessUAEfficiency(
  ltv: number,
  cpi: number,
  organicRate: number,
  cpiTrend: "increasing" | "stable" | "decreasing"
): {
  ltvCpiRatio: number;
  assessment: "excellent" | "good" | "acceptable" | "marginal" | "unprofitable";
  paybackDays: number | null;
  scalability: "highly_scalable" | "scalable" | "limited" | "not_scalable";
  commentary: string;
  risks: string[];
} {
  const ltvCpiRatio = ltv / cpi;
  const paybackDays = cpi > 0 && ltv > 0 ? Math.round(cpi / (ltv / 365)) : null;

  // Assessment based on LTV/CPI
  let assessment: "excellent" | "good" | "acceptable" | "marginal" | "unprofitable";
  if (ltvCpiRatio >= 2.5) {
    assessment = "excellent";
  } else if (ltvCpiRatio >= 1.8) {
    assessment = "good";
  } else if (ltvCpiRatio >= 1.3) {
    assessment = "acceptable";
  } else if (ltvCpiRatio >= 1.0) {
    assessment = "marginal";
  } else {
    assessment = "unprofitable";
  }

  // Scalability assessment
  let scalability: "highly_scalable" | "scalable" | "limited" | "not_scalable";
  if (ltvCpiRatio >= 2.0 && organicRate >= 40) {
    scalability = "highly_scalable";
  } else if (ltvCpiRatio >= 1.5 && organicRate >= 25) {
    scalability = "scalable";
  } else if (ltvCpiRatio >= 1.2) {
    scalability = "limited";
  } else {
    scalability = "not_scalable";
  }

  // Identify risks
  const risks: string[] = [];
  if (ltvCpiRatio < 1.3) {
    risks.push("LTV/CPI <1.3x leaves no margin for error - any LTV degradation or CPI increase kills profitability");
  }
  if (organicRate < 20) {
    risks.push("Low organic rate (<20%) means 100% dependent on paid UA - vulnerable to platform changes");
  }
  if (cpiTrend === "increasing") {
    risks.push("Rising CPI trend threatens unit economics - current LTV/CPI may not hold");
  }
  if (paybackDays !== null && paybackDays > 180) {
    risks.push("Payback >180 days requires significant working capital and increases churn risk");
  }

  const commentary = `LTV/CPI of ${ltvCpiRatio.toFixed(2)}x is ${assessment}. ` +
    `${organicRate.toFixed(0)}% organic rate ${organicRate >= 30 ? "provides cushion" : "is a vulnerability"}. ` +
    (paybackDays !== null ? `~${paybackDays} days to payback. ` : "") +
    `CPI trend is ${cpiTrend}. ` +
    `Scalability: ${scalability.replace("_", " ")}.`;

  return { ltvCpiRatio, assessment, paybackDays, scalability, commentary, risks };
}

/**
 * Assess platform risk for a gaming company
 *
 * @param platforms Platforms the game is on
 * @param revenueShare Revenue share by platform (e.g., { ios: 60, android: 30, steam: 10 })
 * @returns Platform risk assessment
 */
export function assessPlatformRisk(
  platforms: string[],
  revenueShare: Record<string, number>
): {
  riskLevel: "critical" | "high" | "medium" | "low";
  dominantPlatform: string | null;
  concentration: number;
  commentary: string;
  mitigations: string[];
} {
  const platformsNormalized = platforms.map(p => p.toLowerCase());

  // Calculate concentration
  const shares = Object.values(revenueShare);
  const maxShare = Math.max(...shares, 0);
  const dominantPlatform = Object.entries(revenueShare).find(([, share]) => share === maxShare)?.[0] ?? null;

  // Risk level based on concentration and platforms
  let riskLevel: "critical" | "high" | "medium" | "low";
  if (maxShare >= 80) {
    riskLevel = "critical";
  } else if (maxShare >= 60 || platformsNormalized.length === 1) {
    riskLevel = "high";
  } else if (maxShare >= 40) {
    riskLevel = "medium";
  } else {
    riskLevel = "low";
  }

  // Additional risk for iOS-heavy (ATT impact)
  const iosShare = revenueShare.ios ?? revenueShare.iOS ?? 0;
  if (iosShare >= 50) {
    riskLevel = riskLevel === "low" ? "medium" : riskLevel === "medium" ? "high" : riskLevel;
  }

  // Mitigations
  const mitigations: string[] = [];
  if (platformsNormalized.length === 1) {
    mitigations.push("Expand to additional platforms to reduce single-platform dependency");
  }
  if (maxShare >= 60) {
    mitigations.push("Diversify revenue across platforms - no single platform should exceed 50%");
  }
  if (iosShare >= 50) {
    mitigations.push("iOS concentration post-ATT is risky - invest in Android and web/PC alternatives");
  }
  if (!platformsNormalized.some(p => p.includes("pc") || p.includes("steam"))) {
    mitigations.push("Consider PC/Steam for higher LTV players and 70% revenue share (vs 70% mobile)");
  }

  const commentary = `Platform risk is ${riskLevel}. ` +
    (dominantPlatform ? `${dominantPlatform} represents ${maxShare.toFixed(0)}% of revenue. ` : "") +
    `Active on ${platforms.length} platform${platforms.length > 1 ? "s" : ""}. ` +
    (iosShare >= 50 ? "iOS-heavy revenue is vulnerable to ATT/SKAN changes. " : "") +
    (platformsNormalized.length === 1 ? "Single-platform dependency is a major risk." : "");

  return { riskLevel, dominantPlatform, concentration: maxShare, commentary, mitigations };
}

/**
 * Assess LiveOps readiness and content sustainability
 *
 * @param teamSize Total team size
 * @param liveOpsTeamSize Dedicated LiveOps team size
 * @param updateFrequency Content update frequency (weekly, biweekly, monthly, quarterly)
 * @param monthsSinceLaunch Months since global launch
 * @returns LiveOps assessment
 */
export function assessLiveOpsReadiness(
  teamSize: number,
  liveOpsTeamSize: number,
  updateFrequency: "weekly" | "biweekly" | "monthly" | "quarterly" | "none",
  monthsSinceLaunch: number
): {
  readiness: "mature" | "developing" | "basic" | "inadequate";
  liveOpsRatio: number;
  contentVelocity: string;
  burnRisk: "high" | "medium" | "low";
  commentary: string;
} {
  const liveOpsRatio = teamSize > 0 ? liveOpsTeamSize / teamSize : 0;

  // Assess readiness
  let readiness: "mature" | "developing" | "basic" | "inadequate";
  if (liveOpsRatio >= 0.3 && (updateFrequency === "weekly" || updateFrequency === "biweekly")) {
    readiness = "mature";
  } else if (liveOpsRatio >= 0.2 && updateFrequency !== "none" && updateFrequency !== "quarterly") {
    readiness = "developing";
  } else if (liveOpsTeamSize >= 2 || updateFrequency !== "none") {
    readiness = "basic";
  } else {
    readiness = "inadequate";
  }

  // Content velocity assessment
  const velocityMap: Record<string, string> = {
    weekly: "High velocity - weekly updates keep players engaged but require significant resources",
    biweekly: "Good velocity - biweekly updates are sustainable for most teams",
    monthly: "Moderate velocity - monthly updates may lose engaged players to competitors",
    quarterly: "Low velocity - quarterly updates are risky for retention in competitive genres",
    none: "No LiveOps - extremely risky for any F2P game post-launch",
  };
  const contentVelocity = velocityMap[updateFrequency];

  // Burn risk (team burnout from content treadmill)
  let burnRisk: "high" | "medium" | "low";
  if (updateFrequency === "weekly" && liveOpsRatio < 0.25) {
    burnRisk = "high";
  } else if (updateFrequency === "weekly" || (updateFrequency === "biweekly" && liveOpsRatio < 0.2)) {
    burnRisk = "medium";
  } else {
    burnRisk = "low";
  }

  const commentary = `LiveOps readiness: ${readiness}. ` +
    `${liveOpsTeamSize} of ${teamSize} team members dedicated to LiveOps (${(liveOpsRatio * 100).toFixed(0)}%). ` +
    `Update frequency: ${updateFrequency}. ` +
    (monthsSinceLaunch > 6 && readiness === "inadequate"
      ? "6+ months post-launch without LiveOps is a major retention risk. "
      : "") +
    (burnRisk === "high" ? "High burn risk - team may not sustain this pace." : "");

  return { readiness, liveOpsRatio, contentVelocity, burnRisk, commentary };
}
