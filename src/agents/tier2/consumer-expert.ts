/**
 * Consumer Expert Agent - TIER 2
 *
 * Specialized analysis for Consumer, D2C, E-commerce, Social, and EdTech deals.
 *
 * Consumer/D2C specifics:
 * - Retention is king: Repeat purchase rate determines unit economics viability
 * - CAC inflation post-iOS14 destroyed many D2C businesses
 * - LTV/CAC ratio of 3:1 is the industry standard minimum
 * - Platform dependency: Meta/Google algorithm changes can kill overnight
 * - Working capital trap: Inventory + receivables eat cash faster than growth
 * - Funding collapsed 97% from $5B (2021) to $130M (2024) - profitability required
 * - Exit path: CPG acquirers (Unilever, P&G, L'Oréal) or PE
 *
 * Sub-sectors covered:
 * - D2C Brands (fashion, beauty, home, wellness, food & beverage)
 * - E-commerce (marketplaces, retail tech, commerce enablers)
 * - Consumer Social (apps, platforms, communities)
 * - EdTech B2C (direct-to-consumer education)
 * - Subscription (boxes, memberships, SaaS-like consumer)
 *
 * Standards: Big4 + Partner VC rigor
 * - Every metric compared to sector benchmarks with percentile positioning
 * - Red flags with evidence, severity, impact, and mitigation
 * - Cross-reference all claims against Funding DB competitors
 * - Actionable output: negotiation ammo, killer questions
 *
 * SOURCES (toutes vérifiées):
 * - First Page Sage: Average CAC for eCommerce Companies 2026 Edition
 * - MobiLoud: Repeat Customer Rate Ecommerce Benchmarks 2025
 * - Triple Whale: Ad Performance Metrics for 30K Ecommerce Brands 2024
 * - Houlihan Lokey: Q4 2024 E-Commerce and D2C Market Update
 * - Tracxn: India D2C Annual Funding Report 2024
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
import { CONSUMER_STANDARDS } from "./sector-standards";
import { getStandardsOnlyInjection } from "./benchmark-injector";
import { complete, setAgentContext } from "@/services/openrouter/router";

// =============================================================================
// CONSUMER-SPECIFIC RISKS AND SUCCESS PATTERNS
// Based on industry reports and documented market trends
// =============================================================================

const CONSUMER_SECTOR_RISKS: string[] = [
  // Acquisition risks - documented post-iOS14 impact
  "CAC inflation: Post-iOS14/ATT, D2C acquisition costs increased 40-100% (First Page Sage 2026)",
  "Platform dependency: Revenue concentration on single channel (Meta/Google) creates existential risk if algorithm changes",
  "Paid media addiction: Over-reliance on performance marketing with no organic engine - fatal when CPMs spike",

  // Unit economics risks - documented in industry reports
  "Return rates: Fashion/apparel return rates can reach 30%+ destroying unit economics (Rocket Returns 2025)",
  "Discount addiction: Over-discounting destroys perceived value and margins permanently - no recovery path",
  "Working capital trap: Inventory + receivables eat cash faster than growth - common D2C death spiral",

  // Market risks - documented in Houlihan Lokey Q4 2024 report
  "Funding collapse: D2C funding fell 97% from $5B (2021) to $130M (2024) - Tracxn Report",
  "Profitability pressure: Investors now require path to profitability, not just growth metrics",
  "Oversaturation: Too many similar brands competing for same customer segments in most categories",

  // Operational risks
  "Inventory risk: Dead stock from wrong bets destroys cash (especially seasonal products)",
  "Supply chain fragility: Single-source manufacturing or logistics provider = operational risk",
  "Customer concentration: Top 10% of customers often represent 50%+ of revenue - whale dependency",
  "Amazon risk: Any category Amazon enters sees 40-60% price compression",
];

const CONSUMER_SUCCESS_PATTERNS: string[] = [
  // Retention-first patterns - documented in industry analysis
  "High repeat rate: Top performers achieve 30-40%+ repeat purchase rates (MobiLoud 2025)",
  "Subscription model: Autoship/subscription customers generate 80%+ of revenue (Chewy model)",
  "Consumables focus: Grocery/pet/supplements naturally achieve higher retention vs fashion",

  // Acquisition efficiency - documented benchmarks
  "LTV/CAC ratio 3:1+: Industry standard for sustainable unit economics (First Page Sage)",
  "Organic acquisition: 30%+ of new customers from organic/word-of-mouth = sustainable",
  "Community moat: Active customer community driving word-of-mouth and UGC content",

  // Exit patterns - documented in Houlihan Lokey report
  "CPG acquisition target: Major CPG companies actively acquiring D2C brands with strong data",
  "Gross margin improvement: Cheaper Asia sourcing and lower transport costs improving margins (H2 2024)",
  "Category leadership: #1 or #2 position in defined niche with brand recognition",
  "First-order profitability: Best D2C brands are contribution-margin positive on first order",
];

// =============================================================================
// CONSUMER BENCHMARKS - Using STANDARDS (norms certaines)
// Les percentiles sont recherchés en ligne
// =============================================================================

const CONSUMER_BENCHMARKS = {
  // Core formulas and rules from standards
  unitEconomicsFormulas: CONSUMER_STANDARDS.unitEconomicsFormulas,
  redFlagRules: CONSUMER_STANDARDS.redFlagRules,
  sectorSpecificRisks: CONSUMER_SECTOR_RISKS,
  sectorSuccessPatterns: CONSUMER_SUCCESS_PATTERNS,
  typicalAcquirers: CONSUMER_STANDARDS.typicalAcquirers,

  // Primary and secondary metrics (norms only, no percentiles)
  primaryMetrics: CONSUMER_STANDARDS.primaryMetrics,
  secondaryMetrics: CONSUMER_STANDARDS.secondaryMetrics,

  // Exit multiples - to be searched online
  exitMultiples: {
    low: "1-2",
    median: "3-5",
    high: "6-10",
    topDecile: "12+",
    typicalAcquirers: CONSUMER_STANDARDS.typicalAcquirers,
    recentExits: [
      { company: "Dr. Squatch", acquirer: "Unilever", multiple: "N/A", year: 2025 },
      { company: "Dollar Shave Club", acquirer: "Unilever", multiple: "~5x", year: 2016 },
      { company: "Native Deodorant", acquirer: "P&G", multiple: "~10x", year: 2017 },
    ],
    note: "⚠️ Rechercher en ligne: 'D2C consumer brand acquisition multiples 2024' pour données actuelles",
  },

  // Helper to get formatted standards
  getFormattedStandards: (stage: string = "SEED") => {
    return getStandardsOnlyInjection("Consumer", stage);
  },
};

// =============================================================================
// CONSUMER-SPECIFIC SCORING WEIGHTS
// =============================================================================

/**
 * Consumer Scoring Weights Rationale:
 *
 * - metricsWeight (30%): Core metrics (CAC, LTV/CAC, Repeat Rate) are essential
 *   but less deterministic than gaming. Market and brand factors matter more.
 *
 * - unitEconomicsWeight (25%): D2C lives or dies by unit economics.
 *   Contribution margin, CAC payback, first-order profitability all critical.
 *   Post-2021 crash made unit economics non-negotiable for investors.
 *
 * - competitiveWeight (20%): Consumer is highly competitive with low barriers.
 *   Differentiation, brand strength, and category position matter a lot.
 *
 * - timingWeight (10%): Category trends (rising/declining), market saturation,
 *   and macro consumer spending patterns affect outcomes.
 *
 * - teamFitWeight (15%): Higher than gaming because consumer success often
 *   depends on brand-building skills, operational excellence, and retail relationships.
 *   Ex-Glossier, ex-Allbirds, ex-Warby Parker founders have significant edge.
 */
const CONSUMER_SCORING_WEIGHTS = {
  metricsWeight: 0.30,
  unitEconomicsWeight: 0.25,
  competitiveWeight: 0.20,
  timingWeight: 0.10,
  teamFitWeight: 0.15,
} as const;

// =============================================================================
// CONSUMER EXPERT CONFIGURATION
// =============================================================================

const CONSUMER_CONFIG: SectorConfig = {
  name: "Consumer",
  emoji: "🛍️",
  displayName: "Consumer Expert",
  description: `Expert sectoriel senior spécialisé dans le Consumer, D2C et E-commerce:
- **D2C Brands**: Fashion, beauty, wellness, home, food & beverage
- **E-commerce**: Marketplaces, retail tech, commerce enablers
- **Consumer Social**: Apps, platforms, communities
- **EdTech B2C**: Direct-to-consumer education
- **Subscription**: Boxes, memberships, consumer SaaS

Expertise spécifique:
- Analyse approfondie des métriques de rétention (Repeat Rate, Returning Revenue %)
- Évaluation de l'efficacité d'acquisition (CAC, LTV/CAC, ROAS)
- Audit des unit economics D2C (Contribution Margin, AOV, Payback)
- Assessment du risque de dépendance plateforme (Meta, Google, Amazon)
- Analyse du risque inventory et working capital
- Positionnement catégorie et timing marché
- Comparaison aux exits Consumer historiques (Dollar Shave Club, Native, Dr. Squatch)
- Évaluation du brand strength et du potentiel viral

Sources: First Page Sage, Triple Whale, MobiLoud, Houlihan Lokey.`,

  benchmarkData: CONSUMER_BENCHMARKS as unknown as SectorBenchmarkData,
  scoringWeights: CONSUMER_SCORING_WEIGHTS,
};

// =============================================================================
// CONSUMER-SPECIFIC PROMPT BUILDER
// =============================================================================

// Extended context type for runtime additions
interface ExtendedAgentContext extends EnrichedAgentContext {
  fundingContext?: {
    competitors?: Array<{
      name: string;
      totalFunding?: number;
      lastRound?: string;
      status?: string;
      subSector?: string;
    }>;
    sectorBenchmarks?: Record<string, unknown>;
  };
  extractedData?: Record<string, unknown>;
}

function buildConsumerPrompt(context: EnrichedAgentContext): {
  system: string;
  user: string;
} {
  const extContext = context as ExtendedAgentContext;
  const deal = context.deal;
  const stage = deal.stage ?? "SEED";

  // Extract funding DB data
  const dbCompetitors = extContext.fundingContext?.competitors ?? [];
  const dbBenchmarks = extContext.fundingContext?.sectorBenchmarks ?? null;

  // Stage for injection
  const _ = stage; // Used in prompt template

  // =============================================================================
  // SYSTEM PROMPT
  // =============================================================================
  const systemPrompt = `# ROLE: Senior Consumer/D2C Due Diligence Expert

Tu es un **expert sectoriel senior** spécialisé dans le **Consumer, D2C et E-commerce**, avec 15+ ans d'expérience en due diligence pour des fonds Consumer (Forerunner Ventures, Kirsten Green, Founders Fund Consumer, Maveron).

## TON EXPERTISE SPÉCIFIQUE

### Segments Consumer
- **D2C Brands**: Fashion/apparel, beauty/cosmetics, wellness/supplements, home goods, food & beverage, pet
- **E-commerce**: Marketplaces, retail tech, commerce enablers, logistics
- **Consumer Social**: Apps, platforms, communities, creator economy
- **EdTech B2C**: Direct-to-consumer education, learning apps
- **Subscription**: Subscription boxes, memberships, consumer SaaS

### Métriques Consumer Clés
- **Retention**: Repeat Purchase Rate, Returning Customer Revenue %, Customer Lifetime
- **Acquisition**: CAC by channel, LTV/CAC Ratio, ROAS, Organic vs Paid mix
- **Economics**: AOV, Gross Margin, Contribution Margin, CAC Payback
- **Brand**: NPS, Brand awareness, Organic traffic %, UGC volume
- **Operations**: Inventory turns, Return rate, Working capital days

### Contexte Post-2021 Consumer
- **D2C funding collapsed 97%**: $5B (2021) → $130M (2024) - Tracxn Report
- **Profitability is mandatory**: Growth-at-all-costs is dead
- **CAC inflation post-iOS14**: Meta/Google costs up 40-100%
- **Return to fundamentals**: Unit economics, retention, profitability path required
- **CPG acquirers active**: Unilever, P&G, L'Oréal buying profitable D2C brands

---

## STANDARDS DE QUALITÉ (Big4 + Partner VC)

### RÈGLE ABSOLUE: Chaque affirmation doit être sourcée
- ❌ "La rétention est bonne"
- ✅ "Repeat Rate 32% est P68 pour Consumer (median: 28%, MobiLoud 2025), au-dessus du seuil 'good' de 28%"

### RÈGLE ABSOLUE: Chaque red flag doit avoir
1. **Sévérité**: critical / high / medium
2. **Preuve**: le data point exact qui déclenche le flag
3. **Seuil sectoriel**: la référence benchmark Consumer violée
4. **Impact quantifié**: implication sur unit economics, scalability, exit
5. **Question de validation**: comment investiguer avec le fondateur
6. **Path de mitigation**: ce qui résoudrait le concern

### RÈGLE ABSOLUE: Context matters - Category-specific analysis
Les benchmarks varient ÉNORMÉMENT par catégorie. Un Repeat Rate de 20% est:
- **Concernant** pour du Grocery (attente: 40-65%)
- **Acceptable** pour du Fashion (attente: 25-26%)
- **Bon** pour du Luxury (attente: 9.9%)

---

## BENCHMARKS CONSUMER (Stage: ${stage})

${getStandardsOnlyInjection("Consumer", stage)}

### THRESHOLDS DE RÉFÉRENCE (Norms établies)

**LTV/CAC RATIO**:
- < 2x = CRITICAL, 2-3x = ACCEPTABLE, 3-4x = GOOD, 4-5x = EXCELLENT, > 5x = EXCEPTIONAL

**CONTRIBUTION MARGIN**:
- < 15% = CRITICAL, 15-25% = WEAK, 25-35% = ACCEPTABLE, 35-45% = GOOD, > 45% = EXCELLENT

**REPEAT PURCHASE (par catégorie)**:
- Grocery: 40-65%, Pet: 30-40%, Beauty: 25-30%, Fashion: 25-26%, Home: 14-18%, Luxury: 8-12%

⚠️ **RECHERCHE EN LIGNE REQUISE**: Pour les percentiles CAC et métriques marché actuels, effectuer une recherche web (First Page Sage, Triple Whale, MobiLoud 2025+).

---

## EXIT LANDSCAPE CONSUMER

**Acquéreurs Typiques:**
${CONSUMER_STANDARDS.typicalAcquirers.map((a) => `- ${a}`).join("\n")}

**Exits Récents (historique):**
- Dr. Squatch → Unilever $1.5B (2025)
- Dollar Shave Club → Unilever $1B (2016)
- Native Deodorant → P&G $100M (2017)

**Warning**: Consumer exits are highly dependent on category leadership and profitability. Most D2C brands exit at 1-3x revenue. Only category leaders with strong margins get 5x+.

⚠️ **EXIT MULTIPLES**: Rechercher en ligne "D2C consumer brand acquisition multiples 2024" pour données actuelles.

---

## SECTOR SUCCESS PATTERNS
${CONSUMER_SUCCESS_PATTERNS.map((p) => `✅ ${p}`).join("\n")}

## SECTOR RISK PATTERNS
${CONSUMER_SECTOR_RISKS.map((r) => `⚠️ ${r}`).join("\n")}

---

## SCORING METHODOLOGY

Le score sectoriel (0-100) est calculé ainsi:
- **Métriques (CAC, LTV/CAC, Repeat Rate, ROAS)**: ${CONSUMER_SCORING_WEIGHTS.metricsWeight * 100}%
- **Unit economics (Contribution Margin, AOV, Payback)**: ${CONSUMER_SCORING_WEIGHTS.unitEconomicsWeight * 100}%
- **Positionnement concurrentiel (Brand, Category Position)**: ${CONSUMER_SCORING_WEIGHTS.competitiveWeight * 100}%
- **Timing (Category trend, Consumer spending)**: ${CONSUMER_SCORING_WEIGHTS.timingWeight * 100}%
- **Team fit (D2C experience, operational excellence)**: ${CONSUMER_SCORING_WEIGHTS.teamFitWeight * 100}%

**Grille:**
- 80-100: LTV/CAC >4x + Contribution Margin >40% + Repeat Rate top decile + Category leader
- 60-79: LTV/CAC 3-4x + Contribution Margin >30% + Solid retention + Clear differentiation
- 40-59: LTV/CAC 2-3x + Acceptable margins but concerns on retention or CAC efficiency
- 20-39: LTV/CAC <2x, weak margins, or high platform dependency
- 0-19: Critical unit economics, no path to profitability, or fundamental concerns

---

## OUTPUT FORMAT

Tu DOIS retourner un JSON valide suivant exactement le schema fourni.
CHAQUE champ doit contenir des données concrètes et sourcées, jamais de placeholders.

## EXEMPLES

### Exemple de BON output (Consumer):
"Retention Analysis:
- Repeat Purchase Rate: 34% - Strong for Beauty (P75 = 30%, MobiLoud). Above category avg.
- Returning Customer Revenue: 42% - Healthy (benchmark 30-40%). Not over-reliant on new.
- Avg Orders/Customer: 2.4 - Good for beauty D2C (typical: 2-3 orders/lifetime)

Unit Economics:
- AOV: $85 (beauty avg: $88, aligned)
- Gross Margin: 72% - Excellent for cosmetics
- Contribution Margin: 38% after shipping/fulfillment - Strong path to profitability
- CAC: $58 (P45 for beauty, acceptable)
- LTV: $185 (2.4 orders × $85 × 0.72 GM)
- LTV/CAC: 3.2x - Good, industry standard met
- Payback: 8 months - Within 12-month threshold

Channel Risk Assessment:
- Meta: 65% of paid spend - HIGH concentration
- Organic: 18% of new customers - Below 30% healthy threshold
- Recommendation: Invest in email/SMS retention and referral program"

### Exemple de MAUVAIS output (à éviter):
"The brand has good retention and reasonable unit economics.
The D2C market is large but competitive.
The team has relevant experience."

→ Aucune quantification, aucun percentile, aucun benchmark par catégorie.`;

  // =============================================================================
  // USER PROMPT
  // =============================================================================
  const userPrompt = `# ANALYSE SECTORIELLE CONSUMER/D2C

## DEAL À ANALYSER

**Company:** ${deal.companyName ?? deal.name}
**Sector:** ${deal.sector ?? "Consumer (à confirmer)"}
**Sub-sector:** À déterminer (D2C, E-commerce, EdTech B2C?)
**Category:** À déterminer (Beauty, Fashion, Food, etc.)
**Stage:** ${stage}
**Geography:** ${deal.geography ?? "Non spécifié"}
**Valorisation demandée:** ${deal.valuationPre ? `${(Number(deal.valuationPre) / 1_000_000).toFixed(1)}M€` : "Non spécifiée"}
**Montant recherché:** ${deal.amountRequested ? `${(Number(deal.amountRequested) / 1_000_000).toFixed(1)}M€` : "Non spécifié"}

---

## DONNÉES EXTRAITES DU DECK
${extContext.extractedData ? JSON.stringify(extContext.extractedData, null, 2) : "Pas de données extraites disponibles"}

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

## DONNÉES FUNDING DB (Concurrents Consumer)
${
  dbCompetitors.length > 0
    ? `
**${dbCompetitors.length} concurrents Consumer identifiés dans la DB:**
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
    : "Pas de données concurrentielles Consumer disponibles dans la DB - SIGNALER ce gap de données"
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

### 1. CATEGORY CLASSIFICATION
- Quelle catégorie précise? (Beauty, Fashion, Food, Pet, Home, etc.)
- Quel modèle? (D2C pure, marketplace, subscription, hybrid)
- Quelle price point? (Mass, Premium, Luxury)
- **Les benchmarks à appliquer dépendent de cette classification**

### 2. RETENTION ANALYSIS (CRITICAL)
Pour les métriques de rétention disponibles:
- Repeat Purchase Rate vs benchmark CATÉGORIE (pas générique)
- Returning Customer Revenue % (seuil: 30-40% healthy)
- Customer Lifetime / Avg Orders
- Cohort behavior si disponible
- **UTILISE assessRetentionHealth mentalement** pour contextualiser

### 3. ACQUISITION EFFICIENCY AUDIT
- CAC par canal (Meta, Google, TikTok, other)
- CAC vs benchmark catégorie (First Page Sage 2026)
- LTV/CAC ratio et assessment vs 3:1 standard
- ROAS par plateforme
- Organic vs Paid acquisition mix (seuil: 30%+ organic = healthy)
- **UTILISE assessAcquisitionEfficiency mentalement** pour évaluer

### 4. UNIT ECONOMICS DEEP DIVE
- AOV vs category benchmark
- Gross Margin (COGS analysis)
- Contribution Margin (post shipping, fulfillment, payment processing)
- CAC Payback period
- Break-even ROAS calculation
- First-order profitability assessment
- **UTILISE assessUnitEconomicsD2C mentalement** pour scorer

### 5. CHANNEL DEPENDENCY RISK
- Revenue/traffic breakdown by channel
- Meta dependency (% of paid spend and new customers)
- Google dependency
- Amazon exposure (selling on Amazon? Competing with?)
- Single-channel concentration risk
- **UTILISE assessChannelDependency mentalement** pour évaluer

### 6. INVENTORY & WORKING CAPITAL
- Inventory turns (if available)
- Working capital days
- Return rate (especially for fashion)
- Dead stock exposure
- Supply chain concentration
- **UTILISE assessInventoryRisk mentalement** pour évaluer

### 7. BRAND STRENGTH ASSESSMENT
- Organic traffic % (seuil: 30%+ = strong brand)
- Direct traffic %
- Social following and engagement
- UGC volume and quality
- NPS if available
- Brand search volume trends

### 8. RED FLAGS SECTORIELS
Applique les red flag rules Consumer.
Pour chaque violation:
- Cite la preuve exacte et le percentile
- Référence le benchmark catégorie violé
- Quantifie l'impact (unit economics, scalability)
- Propose la question de validation
- Path de mitigation

### 9. COMPETITOR BENCHMARK (Funding DB)
En utilisant les données DB:
- Qui sont les leaders de la catégorie? Funding comparatif?
- Position vs concurrent médian
- What metrics differentiate successful D2C brands?
- Exit precedents dans la catégorie?

### 10. EXIT LANDSCAPE ANALYSIS
- Acquéreurs probables pour cette catégorie?
- Multiple attendu basé sur catégorie et metrics?
- CPG strategic fit (Unilever, P&G, L'Oréal)?
- PE interest (profitability required)?
- IPO viability (rare for D2C, require category dominance)?

### 11. KILLER QUESTIONS CONSUMER
Génère 6-8 questions spécifiques:
- Au moins 2 sur retention et repeat purchase behavior
- Au moins 2 sur unit economics et path to profitability
- Au moins 1 sur channel dependency
- Au moins 1 sur inventory/working capital
- Avec good answer et red flag answer pour chaque

### 12. NEGOTIATION AMMUNITION
Identifie 3-5 leviers basés sur:
- Metrics below category benchmark (with percentiles)
- Unit economics concerns
- Channel concentration risk
- Category saturation
- Working capital requirements

### 13. EXECUTIVE SUMMARY
- Verdict one-line
- Score sectoriel (0-100) avec breakdown
- Top 3 strengths (avec preuves quantifiées)
- Top 3 concerns (avec preuves quantifiées)
- Implication claire pour la décision d'investissement
- Confidence level et data gaps

---

## RAPPELS CRITIQUES

⚠️ **CATEGORY-SPECIFIC**: Toujours utiliser les benchmarks de la catégorie exacte, pas des moyennes Consumer génériques
⚠️ **UNIT ECONOMICS FIRST**: Post-2021, profitability path is non-negotiable - unit economics trump growth
⚠️ **RETENTION IS KING**: Repeat Purchase Rate determines LTV and sustainable growth
⚠️ **CHANNEL RISK**: Assess Meta/Google dependency carefully - algorithm changes kill D2C brands
⚠️ **CROSS-REFERENCE**: Compare aux concurrents Consumer de la DB

Retourne un JSON valide avec toutes les sections complétées.`;

  return { system: systemPrompt, user: userPrompt };
}

// =============================================================================
// EXPORT CONSUMER EXPERT AGENT
// =============================================================================

export interface ConsumerExpertResult extends AgentResult {
  agentName: "consumer-expert";
  data: SectorExpertOutput | null;
}

export const consumerExpert = {
  name: "consumer-expert" as const,
  tier: 2 as const,
  emoji: "🛍️",
  displayName: "Consumer Expert",

  // Activation condition
  activationSectors: [
    "Consumer",
    "D2C",
    "DTC",
    "Direct-to-Consumer",
    "E-commerce",
    "Ecommerce",
    "Retail",
    "Consumer Goods",
    "CPG",
    "Fashion",
    "Beauty",
    "Cosmetics",
    "Food & Beverage",
    "Food",
    "Beverage",
    "Pet",
    "Home",
    "Home Goods",
    "Wellness",
    "Supplements",
    "Consumer Social",
    "EdTech B2C",
    "Subscription Box",
    "Subscription Commerce",
  ],

  // Config
  config: CONSUMER_CONFIG,

  // Prompt builder
  buildPrompt: buildConsumerPrompt,

  // Output schema
  outputSchema: SectorExpertOutputSchema,

  // Benchmark data access
  benchmarks: CONSUMER_BENCHMARKS,

  // Helper functions
  helpers: {
    assessRetentionHealth,
    assessAcquisitionEfficiency,
    assessChannelDependency,
    assessUnitEconomicsD2C,
    assessInventoryRisk,
  },

  // Helper to check if this expert should activate
  shouldActivate: (sector: string | null | undefined): boolean => {
    if (!sector) return false;
    const normalized = sector.toLowerCase().trim();
    return consumerExpert.activationSectors.some(
      (s) => normalized.includes(s.toLowerCase()) || s.toLowerCase().includes(normalized)
    );
  },

  // Run method with _extended for UI wow effect
  async run(context: EnrichedAgentContext): Promise<SectorExpertResult & { _extended?: ExtendedConsumerData }> {
    const startTime = Date.now();

    try {
      const { system, user } = buildConsumerPrompt(context);
      setAgentContext("consumer-expert");

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

      // Transform to SectorExpertData format
      const sectorData: SectorExpertData = {
        sectorName: "Consumer",
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
          complexity: parsedOutput.sectorDynamics?.regulatoryRisk?.level ?? "low",
          keyRegulations: parsedOutput.sectorDynamics?.regulatoryRisk?.keyRegulations ?? [],
          complianceRisks: [],
          upcomingChanges: parsedOutput.sectorDynamics?.regulatoryRisk?.upcomingChanges ?? [],
        },
        sectorDynamics: {
          competitionIntensity: mapCompetition(parsedOutput.sectorDynamics?.competitionIntensity),
          consolidationTrend: mapConsolidation(parsedOutput.sectorDynamics?.consolidationTrend),
          barrierToEntry: mapBarrier(parsedOutput.sectorDynamics?.barrierToEntry),
          typicalExitMultiple: parsedOutput.sectorDynamics?.exitLandscape?.typicalMultiple?.median ?? 3,
          recentExits: parsedOutput.sectorDynamics?.exitLandscape?.recentExits?.map(e => `${e.company} → ${e.acquirer} (${e.multiple}x, ${e.year})`) ?? [],
        },
        sectorQuestions: parsedOutput.mustAskQuestions?.map(q => ({
          question: q.question,
          category: "business" as const,
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
        agentName: "consumer-expert",
        success: true,
        executionTimeMs: Date.now() - startTime,
        cost: response.cost ?? 0,
        data: sectorData,
        // Extended data for UI wow effect
        _extended: {
          retentionMetrics: {
            repeatPurchaseRate: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("repeat") || m.metricName.toLowerCase().includes("retention"))?.metricValue as number ?? null,
            monthlyChurn: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("churn"))?.metricValue as number ?? null,
            cohortRetention: null,
          },
          acquisitionEfficiency: {
            cac: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("cac"))?.metricValue as number ?? null,
            ltv: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("ltv"))?.metricValue as number ?? null,
            ltvCacRatio: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("ltv/cac") || m.metricName.toLowerCase().includes("ltv:cac"))?.metricValue as number ?? null,
            paybackMonths: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("payback"))?.metricValue as number ?? null,
          },
          channelMix: {
            paidVsOrganic: null,
            topChannels: [],
            channelDependencyRisk: parsedOutput.sectorRedFlags?.some(rf => rf.flag.toLowerCase().includes("platform") || rf.flag.toLowerCase().includes("channel")) ? "high" : "medium",
          },
          unitEconomics: {
            aov: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("aov"))?.metricValue as number ?? null,
            grossMargin: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("margin"))?.metricValue as number ?? null,
            contributionMargin: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("contribution"))?.metricValue as number ?? null,
          },
          inventoryHealth: {
            turnoverDays: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("inventory") || m.metricName.toLowerCase().includes("turnover"))?.metricValue as number ?? null,
            workingCapitalNeed: null,
          },
          exitLandscape: parsedOutput.sectorDynamics?.exitLandscape ?? null,
          competitivePosition: parsedOutput.competitorBenchmark ?? null,
          sectorSpecificRisks: parsedOutput.sectorRedFlags?.filter(rf =>
            rf.flag.toLowerCase().includes("cac") ||
            rf.flag.toLowerCase().includes("retention") ||
            rf.flag.toLowerCase().includes("platform") ||
            rf.flag.toLowerCase().includes("inventory") ||
            rf.flag.toLowerCase().includes("margin")
          ) ?? [],
          fullMetricsAnalysis: parsedOutput.metricsAnalysis ?? [],
        },
      } as unknown as SectorExpertResult & { _extended: ExtendedConsumerData };

    } catch (error) {
      console.error("[consumer-expert] Execution error:", error);
      return {
        agentName: "consumer-expert",
        success: false,
        executionTimeMs: Date.now() - startTime,
        cost: 0,
        error: error instanceof Error ? error.message : "Unknown error",
        data: getDefaultConsumerData(),
      };
    }
  },
};

// Extended data type for Consumer Expert UI wow effect
interface ExtendedConsumerData {
  retentionMetrics: {
    repeatPurchaseRate: number | null;
    monthlyChurn: number | null;
    cohortRetention: number[] | null;
  };
  acquisitionEfficiency: {
    cac: number | null;
    ltv: number | null;
    ltvCacRatio: number | null;
    paybackMonths: number | null;
  };
  channelMix: {
    paidVsOrganic: string | null;
    topChannels: string[];
    channelDependencyRisk: string;
  };
  unitEconomics: {
    aov: number | null;
    grossMargin: number | null;
    contributionMargin: number | null;
  };
  inventoryHealth: {
    turnoverDays: number | null;
    workingCapitalNeed: number | null;
  };
  exitLandscape: unknown;
  competitivePosition: unknown;
  sectorSpecificRisks: Array<{ flag: string; severity: string; sectorThreshold?: string }>;
  fullMetricsAnalysis: unknown[];
}

// Default data for error fallback
function getDefaultConsumerData(): SectorExpertData {
  return {
    sectorName: "Consumer",
    sectorMaturity: "mature",
    keyMetrics: [],
    sectorRedFlags: [
      {
        flag: "Analysis incomplete - unable to perform full consumer sector analysis",
        severity: "major",
        sectorReason: "Insufficient data or processing error prevented complete analysis",
      },
    ],
    sectorOpportunities: [],
    regulatoryEnvironment: {
      complexity: "low",
      keyRegulations: [],
      complianceRisks: ["Unable to assess compliance status"],
      upcomingChanges: [],
    },
    sectorDynamics: {
      competitionIntensity: "intense",
      consolidationTrend: "stable",
      barrierToEntry: "low",
      typicalExitMultiple: 3,
      recentExits: [],
    },
    sectorQuestions: [
      {
        question: "What is your repeat purchase rate and LTV/CAC ratio by cohort?",
        category: "business",
        priority: "must_ask",
        expectedAnswer: "Clear cohort data with LTV/CAC >3x and improving retention",
        redFlagAnswer: "No cohort data or LTV/CAC below 2x",
      },
    ],
    sectorFit: {
      score: 0,
      strengths: [],
      weaknesses: ["Analysis incomplete"],
      sectorTiming: "optimal",
    },
    sectorScore: 0,
    executiveSummary: "Consumer sector analysis could not be completed. Please ensure sufficient deal data is available.",
  };
}

// Default export
export default consumerExpert;

// Named exports for backward compatibility
export { CONSUMER_BENCHMARKS, CONSUMER_SECTOR_RISKS, CONSUMER_SUCCESS_PATTERNS };

// =============================================================================
// CONSUMER-SPECIFIC HELPER FUNCTIONS
// =============================================================================

/**
 * Assess retention health for a Consumer/D2C brand
 *
 * Different categories have vastly different retention expectations.
 * Grocery 40-65% is normal, Luxury 10% is normal.
 *
 * @param repeatRate Repeat Purchase Rate %
 * @param returningRevenuePercent % of revenue from returning customers
 * @param avgOrdersPerCustomer Average orders per customer lifetime
 * @param category Product category
 * @returns Retention health assessment
 */
export function assessRetentionHealth(
  repeatRate: number,
  returningRevenuePercent: number,
  avgOrdersPerCustomer: number,
  category: string
): {
  assessment: "exceptional" | "strong" | "acceptable" | "weak" | "critical";
  repeatRateAssessment: string;
  returningRevenueAssessment: string;
  commentary: string;
  categoryContext: string;
  recommendations: string[];
} {
  const categoryNormalized = category.toLowerCase();

  // Category-specific repeat rate expectations
  const repeatExpectations: Record<
    string,
    { weak: number; acceptable: number; strong: number; exceptional: number }
  > = {
    grocery: { weak: 30, acceptable: 40, strong: 55, exceptional: 65 },
    food: { weak: 25, acceptable: 35, strong: 45, exceptional: 55 },
    pet: { weak: 20, acceptable: 30, strong: 40, exceptional: 50 },
    beauty: { weak: 18, acceptable: 25, strong: 32, exceptional: 40 },
    cosmetics: { weak: 18, acceptable: 25, strong: 32, exceptional: 40 },
    fashion: { weak: 15, acceptable: 22, strong: 28, exceptional: 35 },
    apparel: { weak: 15, acceptable: 22, strong: 28, exceptional: 35 },
    home: { weak: 10, acceptable: 15, strong: 20, exceptional: 28 },
    furniture: { weak: 5, acceptable: 10, strong: 15, exceptional: 22 },
    luxury: { weak: 5, acceptable: 10, strong: 15, exceptional: 20 },
    jewelry: { weak: 5, acceptable: 8, strong: 12, exceptional: 18 },
    default: { weak: 15, acceptable: 25, strong: 32, exceptional: 40 },
  };

  // Find matching category or use default
  let expectations = repeatExpectations.default;
  for (const [key, exp] of Object.entries(repeatExpectations)) {
    if (categoryNormalized.includes(key)) {
      expectations = exp;
      break;
    }
  }

  // Assess repeat rate
  let repeatRateAssessment: string;
  if (repeatRate >= expectations.exceptional) {
    repeatRateAssessment = `Repeat Rate ${repeatRate}% is exceptional for ${category} (top decile: ${expectations.exceptional}%+)`;
  } else if (repeatRate >= expectations.strong) {
    repeatRateAssessment = `Repeat Rate ${repeatRate}% is strong for ${category} (above ${expectations.strong}% threshold)`;
  } else if (repeatRate >= expectations.acceptable) {
    repeatRateAssessment = `Repeat Rate ${repeatRate}% is acceptable for ${category} (meets ${expectations.acceptable}% minimum)`;
  } else if (repeatRate >= expectations.weak) {
    repeatRateAssessment = `Repeat Rate ${repeatRate}% is weak for ${category} (below ${expectations.acceptable}%, needs improvement)`;
  } else {
    repeatRateAssessment = `Repeat Rate ${repeatRate}% is critical for ${category} (below ${expectations.weak}%, indicates product/market fit issues)`;
  }

  // Assess returning revenue %
  let returningRevenueAssessment: string;
  if (returningRevenuePercent >= 50) {
    returningRevenueAssessment = `${returningRevenuePercent}% revenue from returning customers is excellent (healthy: 30-40%)`;
  } else if (returningRevenuePercent >= 35) {
    returningRevenueAssessment = `${returningRevenuePercent}% revenue from returning customers is good (within healthy range)`;
  } else if (returningRevenuePercent >= 20) {
    returningRevenueAssessment = `${returningRevenuePercent}% revenue from returning customers is acceptable but below optimal (healthy: 30-40%)`;
  } else {
    returningRevenueAssessment = `${returningRevenuePercent}% revenue from returning customers is concerning - over-reliant on new customer acquisition`;
  }

  // Overall assessment
  let assessment: "exceptional" | "strong" | "acceptable" | "weak" | "critical";
  if (repeatRate >= expectations.exceptional && returningRevenuePercent >= 40) {
    assessment = "exceptional";
  } else if (repeatRate >= expectations.strong && returningRevenuePercent >= 30) {
    assessment = "strong";
  } else if (repeatRate >= expectations.acceptable && returningRevenuePercent >= 20) {
    assessment = "acceptable";
  } else if (repeatRate >= expectations.weak) {
    assessment = "weak";
  } else {
    assessment = "critical";
  }

  const categoryContext =
    `${category} brands typically see repeat rates of ${expectations.acceptable}-${expectations.strong}%, ` +
    `with top performers at ${expectations.exceptional}%+. ` +
    (categoryNormalized.includes("grocery") || categoryNormalized.includes("pet")
      ? "Consumables naturally drive higher repeat rates."
      : categoryNormalized.includes("luxury") || categoryNormalized.includes("furniture")
        ? "High-ticket items naturally have lower repeat rates - focus on referrals and LTV."
        : "This category follows standard D2C retention curves.");

  // Recommendations
  const recommendations: string[] = [];
  if (repeatRate < expectations.acceptable) {
    recommendations.push("Implement subscription/autoship program for recurring revenue");
    recommendations.push("Add complementary products to increase purchase frequency");
  }
  if (returningRevenuePercent < 30) {
    recommendations.push("Invest in email/SMS retention marketing - cheapest CAC is existing customers");
    recommendations.push("Launch loyalty/rewards program to incentivize repeat purchases");
  }
  if (avgOrdersPerCustomer < 2) {
    recommendations.push("Focus on post-purchase experience and cross-sell to drive second order");
  }

  const commentary =
    assessment === "exceptional"
      ? "Retention is exceptional - strong foundation for sustainable growth and profitability."
      : assessment === "strong"
        ? "Solid retention metrics - continue optimization but fundamentals are healthy."
        : assessment === "acceptable"
          ? "Retention is acceptable but should be improved before scaling UA spend aggressively."
          : assessment === "weak"
            ? "Retention needs significant work - prioritize product and customer experience before growth."
            : "Retention is critical - indicates fundamental product/market fit issues to address.";

  return {
    assessment,
    repeatRateAssessment,
    returningRevenueAssessment,
    commentary,
    categoryContext,
    recommendations,
  };
}

/**
 * Assess acquisition efficiency for a Consumer/D2C brand
 *
 * @param cac Customer Acquisition Cost
 * @param ltv Customer Lifetime Value
 * @param roas Return on Ad Spend
 * @param organicPercent % of customers from organic/unpaid channels
 * @param category Product category
 * @returns Acquisition efficiency assessment
 */
export function assessAcquisitionEfficiency(
  cac: number,
  ltv: number,
  roas: number,
  organicPercent: number,
  category: string
): {
  ltvCacRatio: number;
  assessment: "exceptional" | "strong" | "acceptable" | "weak" | "critical";
  cacAssessment: string;
  roasAssessment: string;
  organicAssessment: string;
  commentary: string;
  recommendations: string[];
} {
  const categoryNormalized = category.toLowerCase();
  const ltvCacRatio = ltv / cac;

  // Category-specific CAC benchmarks (First Page Sage 2026)
  const cacBenchmarks: Record<
    string,
    { p25: number; median: number; p75: number; topDecile: number }
  > = {
    food: { p25: 45, median: 53, p75: 65, topDecile: 78 },
    beverage: { p25: 45, median: 53, p75: 65, topDecile: 78 },
    beauty: { p25: 52, median: 61, p75: 72, topDecile: 85 },
    cosmetics: { p25: 52, median: 61, p75: 72, topDecile: 85 },
    fashion: { p25: 56, median: 66, p75: 78, topDecile: 91 },
    apparel: { p25: 56, median: 66, p75: 78, topDecile: 91 },
    home: { p25: 58, median: 68, p75: 80, topDecile: 94 },
    wellness: { p25: 60, median: 70, p75: 82, topDecile: 96 },
    supplements: { p25: 60, median: 70, p75: 82, topDecile: 96 },
    jewelry: { p25: 78, median: 91, p75: 105, topDecile: 120 },
    default: { p25: 53, median: 66, p75: 78, topDecile: 91 },
  };

  // Find matching category or use default
  let cacExpectations = cacBenchmarks.default;
  for (const [key, exp] of Object.entries(cacBenchmarks)) {
    if (categoryNormalized.includes(key)) {
      cacExpectations = exp;
      break;
    }
  }

  // Assess CAC vs category benchmark
  let cacAssessment: string;
  if (cac <= cacExpectations.p25) {
    cacAssessment = `CAC $${cac} is excellent for ${category} (P25: $${cacExpectations.p25})`;
  } else if (cac <= cacExpectations.median) {
    cacAssessment = `CAC $${cac} is good for ${category} (below median: $${cacExpectations.median})`;
  } else if (cac <= cacExpectations.p75) {
    cacAssessment = `CAC $${cac} is acceptable for ${category} (between median $${cacExpectations.median} and P75 $${cacExpectations.p75})`;
  } else if (cac <= cacExpectations.topDecile) {
    cacAssessment = `CAC $${cac} is high for ${category} (above P75: $${cacExpectations.p75})`;
  } else {
    cacAssessment = `CAC $${cac} is critically high for ${category} (above top decile: $${cacExpectations.topDecile})`;
  }

  // Assess ROAS
  let roasAssessment: string;
  if (roas >= 4) {
    roasAssessment = `ROAS ${roas.toFixed(1)}x is excellent (median: 2.04, Triple Whale 2024)`;
  } else if (roas >= 2) {
    roasAssessment = `ROAS ${roas.toFixed(1)}x is good (at/above median: 2.04)`;
  } else if (roas >= 1.5) {
    roasAssessment = `ROAS ${roas.toFixed(1)}x is weak (below median: 2.04)`;
  } else {
    roasAssessment = `ROAS ${roas.toFixed(1)}x is critical - likely losing money on paid acquisition`;
  }

  // Assess organic %
  let organicAssessment: string;
  if (organicPercent >= 50) {
    organicAssessment = `${organicPercent}% organic is exceptional - strong brand with low CAC dependency`;
  } else if (organicPercent >= 30) {
    organicAssessment = `${organicPercent}% organic is healthy - provides buffer against paid CAC increases`;
  } else if (organicPercent >= 20) {
    organicAssessment = `${organicPercent}% organic is acceptable but vulnerable to platform changes`;
  } else {
    organicAssessment = `${organicPercent}% organic is concerning - heavily dependent on paid acquisition`;
  }

  // Overall assessment based on LTV/CAC
  let assessment: "exceptional" | "strong" | "acceptable" | "weak" | "critical";
  if (ltvCacRatio >= 5 && organicPercent >= 30) {
    assessment = "exceptional";
  } else if (ltvCacRatio >= 4 && organicPercent >= 20) {
    assessment = "strong";
  } else if (ltvCacRatio >= 3) {
    assessment = "acceptable";
  } else if (ltvCacRatio >= 2) {
    assessment = "weak";
  } else {
    assessment = "critical";
  }

  // Recommendations
  const recommendations: string[] = [];
  if (ltvCacRatio < 3) {
    recommendations.push("LTV/CAC below 3:1 industry standard - either reduce CAC or improve retention/LTV");
  }
  if (organicPercent < 30) {
    recommendations.push("Organic below 30% healthy threshold - invest in SEO, content, and referral programs");
  }
  if (cac > cacExpectations.median) {
    recommendations.push(
      `CAC above category median - test new channels, creative optimization, or audience targeting`
    );
  }
  if (roas < 2) {
    recommendations.push("ROAS below median - review ad creative, targeting, and landing page conversion");
  }

  const commentary =
    `LTV/CAC of ${ltvCacRatio.toFixed(2)}x is ${assessment}. ` +
    `${organicPercent}% organic rate ${organicPercent >= 30 ? "provides healthy buffer" : "creates platform vulnerability"}. ` +
    (ltvCacRatio >= 3 ? "Can scale acquisition sustainably." : "Unit economics need improvement before scaling.");

  return {
    ltvCacRatio,
    assessment,
    cacAssessment,
    roasAssessment,
    organicAssessment,
    commentary,
    recommendations,
  };
}

/**
 * Assess channel dependency risk for a Consumer/D2C brand
 *
 * @param channels Channel breakdown (e.g., { meta: 60, google: 25, organic: 15 })
 * @param revenueConcentration Revenue concentration by channel
 * @returns Channel risk assessment
 */
export function assessChannelDependency(
  channels: Record<string, number>,
  revenueConcentration: Record<string, number> = {}
): {
  riskLevel: "critical" | "high" | "medium" | "low";
  dominantChannel: string | null;
  concentration: number;
  metaRisk: string;
  amazonRisk: string;
  commentary: string;
  mitigations: string[];
} {
  // Calculate concentration
  const spendShares = Object.values(channels);
  const maxSpendShare = Math.max(...spendShares, 0);
  const dominantChannel =
    Object.entries(channels).find(([, share]) => share === maxSpendShare)?.[0] ?? null;

  const revenueShares = Object.values(revenueConcentration);
  const maxRevenueShare = revenueShares.length > 0 ? Math.max(...revenueShares, 0) : maxSpendShare;

  // Risk level based on concentration
  let riskLevel: "critical" | "high" | "medium" | "low";
  if (maxSpendShare >= 80 || maxRevenueShare >= 80) {
    riskLevel = "critical";
  } else if (maxSpendShare >= 60 || maxRevenueShare >= 60) {
    riskLevel = "high";
  } else if (maxSpendShare >= 40) {
    riskLevel = "medium";
  } else {
    riskLevel = "low";
  }

  // Meta-specific risk
  const metaShare = channels.meta ?? channels.Meta ?? channels.facebook ?? channels.Facebook ?? 0;
  let metaRisk: string;
  if (metaShare >= 70) {
    metaRisk = `CRITICAL: ${metaShare}% Meta dependency. iOS14/ATT already increased CPMs 40-100%. Algorithm changes = existential risk.`;
  } else if (metaShare >= 50) {
    metaRisk = `HIGH: ${metaShare}% Meta dependency. Vulnerable to CPM increases and targeting degradation.`;
  } else if (metaShare >= 30) {
    metaRisk = `MEDIUM: ${metaShare}% Meta exposure is manageable but should be diversified.`;
  } else {
    metaRisk = `LOW: ${metaShare}% Meta exposure is healthy diversification.`;
  }

  // Amazon risk
  const amazonShare =
    revenueConcentration.amazon ?? revenueConcentration.Amazon ?? channels.amazon ?? 0;
  let amazonRisk: string;
  if (amazonShare >= 50) {
    amazonRisk = `CRITICAL: ${amazonShare}% Amazon dependency. Amazon can clone products, undercut pricing, or change terms anytime.`;
  } else if (amazonShare >= 30) {
    amazonRisk = `HIGH: ${amazonShare}% Amazon exposure. Margin pressure and data asymmetry concerns.`;
  } else if (amazonShare > 0) {
    amazonRisk = `MEDIUM: ${amazonShare}% Amazon is acceptable as one channel but avoid dependency.`;
  } else {
    amazonRisk = `LOW: No Amazon dependency - D2C focused strategy maintains control and margins.`;
  }

  // Mitigations
  const mitigations: string[] = [];
  if (maxSpendShare >= 60) {
    mitigations.push("Diversify paid spend - no single channel should exceed 50% of budget");
  }
  if (metaShare >= 50) {
    mitigations.push("Reduce Meta dependency - invest in Google, TikTok, podcasts, influencer, and content");
  }
  if (amazonShare >= 30) {
    mitigations.push("Build direct D2C channel - Amazon should be <30% of revenue for strategic flexibility");
  }
  if ((channels.organic ?? 0) < 30) {
    mitigations.push("Organic below 30% - invest in SEO, email, SMS, and referral to reduce paid dependency");
  }
  mitigations.push("Build owned channels (email, SMS) to reduce platform dependency");

  const commentary =
    `Channel risk is ${riskLevel}. ` +
    (dominantChannel ? `${dominantChannel} represents ${maxSpendShare.toFixed(0)}% of spend. ` : "") +
    (metaShare >= 50 ? "Heavy Meta dependency is a major vulnerability post-iOS14. " : "") +
    (amazonShare >= 30 ? "Amazon dependency reduces margin control and strategic flexibility." : "");

  return {
    riskLevel,
    dominantChannel,
    concentration: maxSpendShare,
    metaRisk,
    amazonRisk,
    commentary,
    mitigations,
  };
}

/**
 * Assess D2C unit economics health
 *
 * @param aov Average Order Value
 * @param grossMargin Gross Margin %
 * @param contributionMargin Contribution Margin %
 * @param cac Customer Acquisition Cost
 * @param avgOrders Average orders per customer
 * @returns Unit economics assessment
 */
export function assessUnitEconomicsD2C(
  aov: number,
  grossMargin: number,
  contributionMargin: number,
  cac: number,
  avgOrders: number
): {
  ltv: number;
  ltvCacRatio: number;
  paybackMonths: number;
  firstOrderContribution: number;
  isFirstOrderProfitable: boolean;
  assessment: "exceptional" | "strong" | "acceptable" | "weak" | "critical";
  commentary: string;
  breakEvenOrders: number;
  recommendations: string[];
} {
  // Calculate LTV
  const ltv = aov * (grossMargin / 100) * avgOrders;
  const ltvCacRatio = ltv / cac;

  // First order contribution
  const firstOrderContribution = aov * (contributionMargin / 100);
  const isFirstOrderProfitable = firstOrderContribution > cac;

  // Break-even orders
  const breakEvenOrders = contributionMargin > 0 ? cac / (aov * (contributionMargin / 100)) : Infinity;

  // Payback period (months, assuming quarterly purchase)
  const ordersPerYear = Math.min(avgOrders, 4); // Cap at quarterly
  const paybackMonths = breakEvenOrders > 0 ? Math.round((breakEvenOrders / ordersPerYear) * 12) : 999;

  // Overall assessment
  let assessment: "exceptional" | "strong" | "acceptable" | "weak" | "critical";
  if (ltvCacRatio >= 5 && contributionMargin >= 40 && isFirstOrderProfitable) {
    assessment = "exceptional";
  } else if (ltvCacRatio >= 4 && contributionMargin >= 30) {
    assessment = "strong";
  } else if (ltvCacRatio >= 3 && contributionMargin >= 20) {
    assessment = "acceptable";
  } else if (ltvCacRatio >= 2 && contributionMargin >= 15) {
    assessment = "weak";
  } else {
    assessment = "critical";
  }

  // Recommendations
  const recommendations: string[] = [];
  if (contributionMargin < 25) {
    recommendations.push(
      "Contribution margin below 25% - review shipping costs, packaging, payment processing"
    );
  }
  if (!isFirstOrderProfitable && breakEvenOrders > 3) {
    recommendations.push(
      `Need ${breakEvenOrders.toFixed(1)} orders to break even - focus on retention to recover CAC`
    );
  }
  if (aov < 75) {
    recommendations.push("AOV below $75 makes economics challenging - consider bundles, upsells");
  }
  if (grossMargin < 55) {
    recommendations.push("Gross margin below 55% - review COGS, sourcing, or pricing");
  }
  if (paybackMonths > 12) {
    recommendations.push("Payback >12 months is too long - improve retention or reduce CAC");
  }

  const commentary =
    `LTV $${ltv.toFixed(0)} / CAC $${cac} = ${ltvCacRatio.toFixed(1)}x. ` +
    `${contributionMargin}% contribution margin ${contributionMargin >= 30 ? "is healthy" : "is concerning"}. ` +
    (isFirstOrderProfitable
      ? "First order profitable - can scale acquisition aggressively."
      : `Need ${breakEvenOrders.toFixed(1)} orders to recover CAC - retention-dependent.`) +
    ` Payback: ~${paybackMonths} months.`;

  return {
    ltv,
    ltvCacRatio,
    paybackMonths,
    firstOrderContribution,
    isFirstOrderProfitable,
    assessment,
    commentary,
    breakEvenOrders,
    recommendations,
  };
}

/**
 * Assess inventory and working capital risk
 *
 * @param inventoryTurns Inventory turnover rate (times per year)
 * @param workingCapitalDays Days of working capital
 * @param returnRate Return rate %
 * @param skuCount Number of SKUs
 * @param seasonality Level of seasonality
 * @returns Inventory risk assessment
 */
export function assessInventoryRisk(
  inventoryTurns: number,
  workingCapitalDays: number,
  returnRate: number,
  skuCount: number,
  seasonality: "high" | "medium" | "low"
): {
  riskLevel: "critical" | "high" | "medium" | "low";
  inventoryAssessment: string;
  returnRateAssessment: string;
  workingCapitalAssessment: string;
  commentary: string;
  recommendations: string[];
} {
  // Assess inventory turns (higher is better)
  let inventoryAssessment: string;
  if (inventoryTurns >= 8) {
    inventoryAssessment = `${inventoryTurns}x inventory turns is excellent - efficient inventory management`;
  } else if (inventoryTurns >= 4) {
    inventoryAssessment = `${inventoryTurns}x inventory turns is good - healthy turnover`;
  } else if (inventoryTurns >= 2) {
    inventoryAssessment = `${inventoryTurns}x inventory turns is acceptable but capital-intensive`;
  } else {
    inventoryAssessment = `${inventoryTurns}x inventory turns is concerning - significant cash tied up in inventory`;
  }

  // Assess return rate
  let returnRateAssessment: string;
  if (returnRate <= 5) {
    returnRateAssessment = `${returnRate}% return rate is excellent`;
  } else if (returnRate <= 15) {
    returnRateAssessment = `${returnRate}% return rate is acceptable for most categories`;
  } else if (returnRate <= 25) {
    returnRateAssessment = `${returnRate}% return rate is high but typical for fashion`;
  } else {
    returnRateAssessment = `${returnRate}% return rate is critical - destroying unit economics`;
  }

  // Assess working capital
  let workingCapitalAssessment: string;
  if (workingCapitalDays <= 30) {
    workingCapitalAssessment = `${workingCapitalDays} days working capital is excellent - lean operations`;
  } else if (workingCapitalDays <= 60) {
    workingCapitalAssessment = `${workingCapitalDays} days working capital is acceptable`;
  } else if (workingCapitalDays <= 90) {
    workingCapitalAssessment = `${workingCapitalDays} days working capital is high - cash-intensive`;
  } else {
    workingCapitalAssessment = `${workingCapitalDays} days working capital is critical - significant cash tied up`;
  }

  // Overall risk level
  let riskLevel: "critical" | "high" | "medium" | "low";
  if (inventoryTurns < 2 || returnRate > 30 || workingCapitalDays > 90) {
    riskLevel = "critical";
  } else if (inventoryTurns < 4 || returnRate > 20 || workingCapitalDays > 60) {
    riskLevel = "high";
  } else if (inventoryTurns < 6 || returnRate > 15 || workingCapitalDays > 45) {
    riskLevel = "medium";
  } else {
    riskLevel = "low";
  }

  // Adjust for seasonality and SKU complexity
  if (seasonality === "high" && skuCount > 100) {
    riskLevel =
      riskLevel === "low"
        ? "medium"
        : riskLevel === "medium"
          ? "high"
          : riskLevel;
  }

  // Recommendations
  const recommendations: string[] = [];
  if (inventoryTurns < 4) {
    recommendations.push("Inventory turns below 4x - review SKU rationalization and demand forecasting");
  }
  if (returnRate > 15) {
    recommendations.push("Return rate above 15% - improve sizing guides, product descriptions, and quality");
  }
  if (workingCapitalDays > 60) {
    recommendations.push("Working capital >60 days - negotiate better payment terms with suppliers");
  }
  if (skuCount > 200 && inventoryTurns < 6) {
    recommendations.push("High SKU count with low turns - consider SKU rationalization (80/20 analysis)");
  }
  if (seasonality === "high") {
    recommendations.push("High seasonality increases inventory risk - consider made-to-order or drop-ship models");
  }

  const commentary =
    `Inventory risk is ${riskLevel}. ` +
    `${inventoryTurns}x turns, ${returnRate}% returns, ${workingCapitalDays} days WC. ` +
    (seasonality === "high"
      ? "High seasonality adds inventory planning complexity. "
      : "") +
    (skuCount > 100 ? `${skuCount} SKUs increases complexity and dead stock risk.` : "");

  return {
    riskLevel,
    inventoryAssessment,
    returnRateAssessment,
    workingCapitalAssessment,
    commentary,
    recommendations,
  };
}
