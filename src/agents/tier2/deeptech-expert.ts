/**
 * DeepTech Expert Agent - TIER 2
 *
 * Specialized analysis for DeepTech, AI/ML, Quantum Computing, and Frontier Technology deals.
 *
 * DeepTech specifics:
 * - Long R&D cycles (3-7 years to revenue typical)
 * - IP and patents as primary moat
 * - Technical team density critical (PhD-level expertise)
 * - Non-dilutive funding (grants) as validation signal
 * - TRL (Technology Readiness Level) as key milestone tracker
 * - High capital intensity, often requires $50M+ before meaningful revenue
 * - Big Tech acquisition as primary exit path
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
import { DEEPTECH_STANDARDS } from "./sector-standards";
import { getStandardsOnlyInjection } from "./benchmark-injector";
import { complete, setAgentContext, extractFirstJSON } from "@/services/openrouter/router";

// =============================================================================
// DEEPTECH-SPECIFIC CONFIGURATION
// =============================================================================

/**
 * DeepTech Scoring Weights Rationale:
 *
 * - metricsWeight (25%): Lower than SaaS because early DeepTech often has no revenue metrics.
 *   Focus on R&D efficiency, TRL progression, patent portfolio value.
 *
 * - unitEconomicsWeight (15%): Lower importance early-stage. Most DeepTech is pre-revenue.
 *   Evaluate projected margins at scale, not current unit economics.
 *
 * - competitiveWeight (20%): Critical. DeepTech moat = IP + technical expertise.
 *   Must assess Big Tech threat, patent landscape, talent competition.
 *
 * - timingWeight (15%): Technology timing is crucial. Too early = market not ready.
 *   Too late = Big Tech already solved it. Evaluate TRL vs market readiness.
 *
 * - teamFitWeight (25%): Highest weight. DeepTech success = team execution.
 *   PhD density, prior exits, industry connections, key person risk.
 */
const DEEPTECH_SCORING_WEIGHTS = {
  metricsWeight: 0.25,
  unitEconomicsWeight: 0.15,
  competitiveWeight: 0.20,
  timingWeight: 0.15,
  teamFitWeight: 0.25,
} as const;

// =============================================================================
// EXTENDED DEEPTECH BENCHMARKS
// =============================================================================

/**
 * Extended DeepTech benchmarks using STANDARDS (norms certaines)
 * Les percentiles et données marché sont recherchés en ligne.
 *
 * SOURCES for extended benchmarks:
 * - R&D ROI: Industry estimates (Lux Research, BCG analysis)
 * - Grant ratios: Based on SBIR/STTR program data
 * - TRL progression: NASA TRL handbook
 */
const EXTENDED_DEEPTECH_BENCHMARKS = {
  // Core formulas and rules from standards
  unitEconomicsFormulas: DEEPTECH_STANDARDS.unitEconomicsFormulas,
  redFlagRules: DEEPTECH_STANDARDS.redFlagRules,
  sectorSpecificRisks: DEEPTECH_STANDARDS.sectorRisks,
  sectorSuccessPatterns: DEEPTECH_STANDARDS.successPatterns,
  typicalAcquirers: DEEPTECH_STANDARDS.typicalAcquirers,

  // Primary and secondary metrics (norms only, no percentiles)
  primaryMetrics: DEEPTECH_STANDARDS.primaryMetrics,
  secondaryMetrics: DEEPTECH_STANDARDS.secondaryMetrics,

  // Exit multiples - to be searched online, these are placeholders
  // Use web search for current DeepTech acquisition multiples
  exitMultiples: {
    low: "4-6",
    median: "8-12",
    high: "15-20",
    topDecile: "30+",
    typicalAcquirers: DEEPTECH_STANDARDS.typicalAcquirers,
    note: "⚠️ Rechercher en ligne: 'deeptech startup acquisition multiples 2024' pour données actuelles",
  },

  // Helper to get formatted standards
  getFormattedStandards: (stage: string = "SEED") => {
    return getStandardsOnlyInjection("DeepTech", stage);
  },
};

// =============================================================================
// DEEPTECH EXPERT CONFIGURATION
// =============================================================================

const DEEPTECH_CONFIG: SectorConfig = {
  name: "DeepTech",
  emoji: "🔬",
  displayName: "DeepTech Expert",
  description: `Expert sectoriel senior spécialisé dans les technologies de rupture:
- **AI/ML**: Foundation models, MLOps, AI infrastructure, applied AI
- **Quantum Computing**: Quantum hardware, quantum software, quantum sensing
- **Frontier Tech**: Advanced materials, photonics, neuromorphic computing
- **Deep Science**: Biotech platforms, synthetic biology, computational chemistry

Expertise spécifique:
- Évaluation de la maturité technologique (TRL 1-9)
- Analyse de la valeur du portefeuille IP et de la défensibilité
- Assessment des équipes techniques (PhD density, track record)
- Validation du path to commercialization
- Comparaison aux exits DeepTech historiques (DeepMind, Cruise, etc.)
- Analyse du risque Big Tech et des dynamiques de marché`,

  benchmarkData: EXTENDED_DEEPTECH_BENCHMARKS as unknown as SectorBenchmarkData,
  scoringWeights: DEEPTECH_SCORING_WEIGHTS,
};

// =============================================================================
// DEEPTECH-SPECIFIC PROMPT BUILDER
// =============================================================================

function buildDeeptechPrompt(context: EnrichedAgentContext): {
  system: string;
  user: string;
} {
  const deal = context.deal;
  const stage = deal.stage ?? "SEED";
  const benchmarks = EXTENDED_DEEPTECH_BENCHMARKS;

  // Extract funding DB data
  const dbCompetitors = context.fundingContext?.competitors ?? [];
  const dbBenchmarks = context.fundingContext?.sectorBenchmarks ?? null;

  // Determine stage key for benchmarks
  const stageKey = stage.toUpperCase().replace(/[\s-]/g, "_") as
    | "PRE_SEED"
    | "SEED"
    | "SERIES_A"
    | "SERIES_B";

  // TRL expectations for the stage
  const trlExpectations: Record<string, { min: number; max: number }> = {
    PRE_SEED: { min: 2, max: 4 },
    SEED: { min: 3, max: 5 },
    SERIES_A: { min: 5, max: 7 },
    SERIES_B: { min: 6, max: 8 },
    SERIES_C: { min: 7, max: 9 },
  };
  const expectedTRL = trlExpectations[stageKey] ?? trlExpectations.SEED;

  // =============================================================================
  // SYSTEM PROMPT
  // =============================================================================
  const systemPrompt = `# ROLE: Senior DeepTech Due Diligence Expert

Tu es un **expert sectoriel senior** spécialisé dans le **DeepTech et les technologies de rupture**, avec 15+ ans d'expérience en due diligence pour des fonds DeepTech spécialisés (Lux Capital, DCVC, Playground Global, The Engine, Obvious Ventures).

## TON EXPERTISE SPÉCIFIQUE

### Segments DeepTech
- **AI/ML**: Foundation models, MLOps, AI infrastructure, applied AI, edge AI
- **Quantum Computing**: Quantum hardware, quantum software, quantum sensing, post-quantum crypto
- **Frontier Tech**: Advanced materials, photonics, neuromorphic computing, MEMS
- **Deep Science**: Biotech platforms, synthetic biology, computational chemistry, drug discovery
- **Space & Defense**: Satellites, launch, sensing, defense-adjacent technologies

### Métriques DeepTech Clés
- **TRL (Technology Readiness Level)**: Le milestone tracker universel (1-9)
- **IP Portfolio**: Granted patents, pending applications, freedom to operate
- **Team Density**: PhD/MS ratio, publications, prior exits, key person risk
- **Non-Dilutive Funding**: Grants (SBIR/STTR, DARPA, NSF, DOE) as validation
- **R&D Efficiency**: TRL progression rate, milestone completion, runway

### Contexte DeepTech
- **Long R&D Cycles**: 3-7 years to revenue typical. Patience required.
- **Capital Intensity**: May need $50M+ before meaningful revenue
- **Big Tech Threat**: FAANG can replicate with 100x resources in certain areas
- **Team is Everything**: PhD-level expertise, track record, key person risk
- **Grants = Validation**: Non-dilutive funding signals technical credibility

---

## STANDARDS DE QUALITÉ (Big4 + Partner VC)

### RÈGLE ABSOLUE: Chaque affirmation doit être sourcée
- ❌ "L'équipe est solide et la techno prometteuse"
- ✅ "Team: 4 PhDs dont 2 de Stanford AI Lab, CTO ex-DeepMind (3 years). TRL 5 atteint en 18 mois (1.1 TRL/year vs 0.8 median). DARPA grant $2.1M secured."

### RÈGLE ABSOLUE: Chaque red flag doit avoir
1. **Sévérité**: critical / high / medium
2. **Preuve**: le data point exact qui déclenche le flag
3. **Seuil sectoriel**: la référence benchmark DeepTech violée
4. **Impact quantifié**: implication sur roadmap, funding, exit
5. **Question de validation**: comment investiguer avec le fondateur
6. **Path de mitigation**: ce qui résoudrait le concern

### RÈGLE ABSOLUE: TRL doit être approprié au stage
| Stage | Expected TRL | Below = Risk |
|-------|--------------|--------------|
| Pre-Seed | TRL 2-4 | TRL 1 = concept only |
| Seed | TRL 3-5 | TRL 2 = behind |
| Series A | TRL 5-7 | TRL 4 = significantly behind |
| Series B | TRL 6-8 | TRL 5 = major concern |

**Pour ${stage}: Expected TRL ${expectedTRL.min}-${expectedTRL.max}**

---

## BENCHMARKS DEEPTECH (Stage: ${stage})

${getStandardsOnlyInjection("DeepTech", stage)}

⚠️ **RECHERCHE EN LIGNE REQUISE**: Pour les percentiles et données de marché actuels, effectuer une recherche web avec les queries suggérées dans les standards ci-dessus.

---

## TRL REFERENCE (NASA Standard)

| TRL | Description | Typical Activities |
|-----|-------------|-------------------|
| 1 | Basic principles observed | Literature review, academic research |
| 2 | Technology concept formulated | Hypothesis validated, initial modeling |
| 3 | Experimental proof of concept | Lab experiments, bench-scale demo |
| 4 | Technology validated in lab | Component integration, lab environment |
| 5 | Technology validated in relevant environment | Prototype in near-operational setting |
| 6 | Technology demonstrated in relevant environment | Prototype system demo |
| 7 | System prototype demonstrated | Operational environment testing |
| 8 | System complete and qualified | Final testing, production ready |
| 9 | Actual system proven | Commercial deployment |

**TRL Progression Rate**: Good = 0.8-1.0 TRL/year. Excellent = 1.5+ TRL/year.

---

## BIG TECH THREAT ASSESSMENT

| Sector | Threat Level | Reasoning |
|--------|--------------|-----------|
| AI/ML, Foundation Models, LLM | CRITICAL | Google, OpenAI, Meta, Microsoft heavily invested |
| Quantum Software, CV, NLP, Robotics | HIGH | Active Big Tech R&D, acquisition interest |
| Quantum Hardware, Biotech, Materials, Photonics | MEDIUM | Specialized, less Big Tech focus |

**Threat Mitigation:**
- Strong IP portfolio (broad, foundational patents)
- Vertical/enterprise focus Big Tech won't prioritize
- Proprietary data moats through customer relationships
- Strategic partnership with one Big Tech for protection

---

## GRANT VALIDATION SIGNALS

| Source | Signal Strength | Typical Amount |
|--------|----------------|----------------|
| DARPA | Strong | $1-50M+ |
| NSF | Strong | $150K-2M |
| NIH | Strong | $150K-5M |
| DOE | Strong | $150K-5M |
| SBIR Phase II | Strong | $1-2M |
| EU Horizon/EIC | Strong | €1-5M |
| SBIR Phase I | Moderate | $150-275K |
| State/University | Weak | Variable |

**No grants for DeepTech = missed opportunity for validation and runway extension.**

---

## EXIT LANDSCAPE DEEPTECH

**Acquéreurs Typiques DeepTech:**
${DEEPTECH_STANDARDS.typicalAcquirers.map((a) => `- ${a}`).join("\n")}

**Notable DeepTech Exits (historique):**
- DeepMind → Google (2014): $500M+
- Cruise → GM (2016): $1B+
- MosaicML → Databricks (2023): $1.3B
- Anthropic, OpenAI: Massive private valuations

⚠️ **EXIT MULTIPLES**: Rechercher en ligne "deeptech acquisition multiples 2024" pour données actuelles.

---

## SECTOR SUCCESS PATTERNS
${DEEPTECH_STANDARDS.successPatterns.map((p) => `✅ ${p}`).join("\n")}

## SECTOR RISK PATTERNS
${DEEPTECH_STANDARDS.sectorRisks.map((r) => `⚠️ ${r}`).join("\n")}

---

## SCORING METHODOLOGY

Le score sectoriel (0-100) est calculé ainsi:
- **Métriques (TRL, R&D efficiency, milestones)**: ${DEEPTECH_SCORING_WEIGHTS.metricsWeight * 100}%
- **Unit economics (projected margins, R&D ROI)**: ${DEEPTECH_SCORING_WEIGHTS.unitEconomicsWeight * 100}%
- **Positionnement concurrentiel (IP, Big Tech threat)**: ${DEEPTECH_SCORING_WEIGHTS.competitiveWeight * 100}%
- **Timing (tech vs market readiness)**: ${DEEPTECH_SCORING_WEIGHTS.timingWeight * 100}%
- **Team fit (PhD density, track record, key person)**: ${DEEPTECH_SCORING_WEIGHTS.teamFitWeight * 100}%

**DeepTech = Team-heavy (25% weight)**. Without the right team, technology is worthless.

**Grille:**
- 80-100: World-class team + TRL ahead + strong IP + grant validation + clear path to commercialization
- 60-79: Strong team + TRL on track + some IP + reasonable timeline
- 40-59: Good team but TRL behind or IP concerns or Big Tech threat
- 20-39: Team gaps or significant technology risk or no clear path
- 0-19: Critical gaps in team, technology, or path to market

---

## OUTPUT FORMAT

Tu DOIS retourner un JSON valide suivant exactement le schema fourni.
CHAQUE champ doit contenir des données concrètes et sourcées, jamais de placeholders.

## EXEMPLES

### Exemple de BON output (DeepTech):
"TRL Assessment:
- Current TRL: 5 (prototype validated in relevant environment)
- Expected for ${stage}: TRL ${expectedTRL.min}-${expectedTRL.max}
- Assessment: ON TRACK
- TRL Progression: Started TRL 2 (Jan 2022), now TRL 5 (Jan 2024) = 1.5 TRL/year (excellent)

Team Analysis:
- PhD Density: 4/6 technical staff (67%) - P85 vs median 40%
- Key Persons: CTO (Stanford PhD, ex-Google Brain 5y), CSO (MIT PhD, 12 patents)
- Key Person Risk: HIGH - CTO is critical, no clear succession
- Prior Exits: CEO had $15M exit (acqui-hire), CTO none but publications h-index 32

IP Portfolio:
- Granted Patents: 3 (foundational claims on core algorithm)
- Pending: 7 applications covering implementation variants
- Freedom to Operate: Assessed, no blocking patents identified
- Big Tech Patent Landscape: Google has 15 patents in adjacent area - monitor

Big Tech Threat Assessment:
- Sector: Applied AI for drug discovery
- Threat Level: HIGH (Alphabet/Isomorphic Labs, Meta FAIR active)
- Mitigation: Proprietary pharma data partnerships, vertical focus Big Tech won't prioritize
- Defensibility: Strong IP + data moat through 3 pharma partnerships"

### Exemple de MAUVAIS output (à éviter):
"The team is experienced in AI and the technology is promising.
They have some patents and are making good progress."

→ Aucun TRL, aucun calcul de progression, pas de PhD density, pas d'assessment Big Tech.`;

  // =============================================================================
  // USER PROMPT
  // =============================================================================
  const previousResults = context.previousResults ?? null;

  // Extract relevant info from previous Tier 1 results (selective, not raw JSON dump)
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

  // Funding DB data for cross-reference
  let fundingDbData = "";
  const contextEngineAny = context.contextEngine as Record<string, unknown> | undefined;
  const fundingDb = contextEngineAny?.fundingDb as { competitors?: unknown; valuationBenchmark?: unknown; sectorTrend?: unknown } | undefined;
  if (fundingDb) {
    fundingDbData = `\n## FUNDING DATABASE - CROSS-REFERENCE OBLIGATOIRE

Tu DOIS produire un champ "dbCrossReference" dans ton output.

### Concurrents detectes dans la DB
${fundingDb.competitors ? JSON.stringify(fundingDb.competitors, null, 2).slice(0, 3000) : "Aucun concurrent detecte dans la DB"}

### Benchmark valorisation
${fundingDb.valuationBenchmark ? JSON.stringify(fundingDb.valuationBenchmark, null, 2) : "Pas de benchmark disponible"}

### Tendance funding secteur
${fundingDb.sectorTrend ? JSON.stringify(fundingDb.sectorTrend, null, 2) : "Pas de tendance disponible"}

INSTRUCTIONS DB:
1. Chaque claim du deck concernant le marche/concurrence DOIT etre verifie vs ces donnees
2. Les concurrents DB absents du deck = RED FLAG CRITICAL
3. Positionner la valorisation vs percentiles (P25/median/P75)
4. Si le deck dit "pas de concurrent" mais la DB en trouve = RED FLAG CRITICAL`;
  }

  const userPrompt = `# ANALYSE SECTORIELLE DEEPTECH

## DEAL À ANALYSER

**Company:** ${deal.companyName ?? deal.name}
**Sector:** ${deal.sector ?? "DeepTech (à confirmer)"}
**Sub-sector:** ${deal.sector ?? "À déterminer (AI/ML, Quantum, Biotech, Materials?)"}
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

${tier1Insights ? `## INSIGHTS DES AGENTS TIER 1\n${tier1Insights}` : ""}

---

## DONNÉES FUNDING DB (Concurrents DeepTech)
${
  dbCompetitors.length > 0
    ? `
**${dbCompetitors.length} concurrents DeepTech identifiés dans la DB:**
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
    : "Pas de données concurrentielles DeepTech disponibles dans la DB - SIGNALER ce gap de données"
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

${fundingDbData}

---

## TA MISSION

### 1. DEEPTECH CLASSIFICATION
- Quel sous-secteur exact? (AI/ML, Quantum, Biotech, Materials, etc.)
- Quel niveau de "deep"? (Foundational research vs applied tech)
- Technology vs product company?
- **Les benchmarks et risques dépendent de cette classification**

### 2. TRL ASSESSMENT (CRITICAL)
- Current TRL estimé (1-9) avec justification
- Expected TRL pour ${stage}: ${expectedTRL.min}-${expectedTRL.max}
- Assessment: ahead / on_track / behind / critical
- TRL Progression rate: (Current - Starting) / Years
- **UTILISE assessTRLForStage mentalement** pour contextualiser
- Time to TRL 7+ (near-commercial)?

### 3. TEAM ANALYSIS (CRITICAL - 25% du score)
- PhD/MS density on technical team
- Key person identification et risk assessment
- Prior exits, publications, h-index
- Industry connections and partnerships
- Key person succession plan
- Compare à stage benchmarks

### 4. IP PORTFOLIO ANALYSIS
- Granted patents (count, quality, breadth)
- Pending applications
- Freedom to operate assessment
- Blocking patents in landscape
- IP monetization potential
- Compare vs competitors' IP

### 5. BIG TECH THREAT ASSESSMENT
Pour le sous-secteur:
- Identify relevant Big Tech players
- Assess their internal R&D in this area
- Recent acquisitions in the space
- Threat level: critical / high / medium / low
- **UTILISE assessBigTechThreat mentalement**
- Mitigation strategies available?

### 6. GRANT FUNDING ANALYSIS
- Grants secured (source, amount, year)
- Grant validation signal strength
- **UTILISE assessGrantQuality mentalement**
- Opportunities not yet pursued (SBIR, DARPA, NSF, EU Horizon)
- Non-dilutive as % of total funding

### 7. METRICS vs BENCHMARKS
Pour chaque KPI disponible:
- Extrais la valeur du deal
- Compare aux benchmarks ${stage} fournis
- Calcule le percentile exact
- Assessment: exceptional → critical
- DeepTech-specific context

### 8. COMMERCIALIZATION PATH
- Path from current TRL to revenue?
- Customer LOIs or pilots?
- Regulatory pathway (if applicable)?
- Timeline to first meaningful revenue?
- Capital required to get there?

### 9. RED FLAGS SECTORIELS
Applique les red flag rules DeepTech.
Pour chaque violation:
- Cite la preuve exacte
- Référence le seuil violé
- Quantifie l'impact sur timeline ou fundability
- Propose la question de validation
- Path de mitigation

### 10. COMPETITOR BENCHMARK (Funding DB)
En utilisant les données DB:
- Qui sont les leaders technologiques?
- Funding comparatif
- IP landscape vs competitors
- TRL comparison if available
- Exit precedents dans le sous-secteur

### 11. EXIT LANDSCAPE ANALYSIS
- Acquéreurs probables (Big Tech, Pharma, Industrial)?
- Multiple attendu basé sur technology maturity?
- Strategic acquirer fit analysis
- IPO viability (rare for DeepTech, require massive scale)?

### 12. KILLER QUESTIONS DEEPTECH
Génère 6-8 questions spécifiques:
- Au moins 2 sur TRL et commercialization path
- Au moins 2 sur team et key person risk
- Au moins 1 sur IP defensibility
- Au moins 1 sur Big Tech threat
- Avec good answer et red flag answer pour chaque

### 13. NEGOTIATION AMMUNITION
Identifie 3-5 leviers basés sur:
- TRL behind expectations
- Key person risk without succession
- IP gaps or vulnerability
- Big Tech threat without mitigation
- No grant validation

### 14. EXECUTIVE SUMMARY
- Verdict one-line
- Score sectoriel (0-100) avec breakdown
- Top 3 strengths (avec preuves quantifiées)
- Top 3 concerns (avec preuves quantifiées)
- Implication claire pour la décision d'investissement
- Confidence level et data gaps

---

## RAPPELS CRITIQUES

⚠️ **TEAM IS EVERYTHING**: 25% du score. Sans world-class team, la technologie ne vaut rien.
⚠️ **TRL MUST MATCH STAGE**: TRL ${expectedTRL.min}-${expectedTRL.max} attendu pour ${stage}
⚠️ **BIG TECH THREAT**: Assess explicitly for AI/ML and adjacent sectors
⚠️ **GRANTS = VALIDATION**: No grants for DeepTech is a yellow flag
⚠️ **CROSS-REFERENCE** - Compare aux concurrents DeepTech de la DB

Retourne un JSON valide avec toutes les sections complétées.`;

  return { system: systemPrompt, user: userPrompt };
}

// =============================================================================
// EXPORT DEEPTECH EXPERT AGENT
// =============================================================================

export interface DeeptechExpertResult extends AgentResult {
  agentName: "deeptech-expert";
  data: SectorExpertOutput | null;
}

export const deeptechExpert = {
  name: "deeptech-expert" as const,
  tier: 2 as const,
  emoji: "🔬",
  displayName: "DeepTech Expert",

  // Activation condition
  activationSectors: [
    "DeepTech",
    "Deep Tech",
    "AI",
    "Artificial Intelligence",
    "ML",
    "Machine Learning",
    "Quantum",
    "Quantum Computing",
    "Biotech",
    "Biotechnology",
    "Advanced Materials",
    "Photonics",
    "Neuromorphic",
    "Synthetic Biology",
    "Computational Chemistry",
    "Drug Discovery",
    "Foundation Model",
    "LLM",
  ],

  // Config
  config: DEEPTECH_CONFIG,

  // Prompt builder
  buildPrompt: buildDeeptechPrompt,

  // Output schema
  outputSchema: SectorExpertOutputSchema,

  // Benchmark data access
  benchmarks: EXTENDED_DEEPTECH_BENCHMARKS,

  // Helper functions
  helpers: {
    assessTRLForStage,
    assessBigTechThreat,
    assessGrantQuality,
  },

  // Helper to check if this expert should activate
  shouldActivate: (sector: string | null | undefined): boolean => {
    if (!sector) return false;
    const normalized = sector.toLowerCase().trim();
    return deeptechExpert.activationSectors.some(
      (s) => normalized.includes(s.toLowerCase()) || s.toLowerCase().includes(normalized)
    );
  },

  // Run method with _extended for UI wow effect
  async run(context: EnrichedAgentContext): Promise<SectorExpertResult & { _extended?: ExtendedDeepTechData }> {
    const startTime = Date.now();

    try {
      const { system, user } = buildDeeptechPrompt(context);
      setAgentContext("deeptech-expert");

      const response = await complete(user, {
        systemPrompt: system,
        complexity: "complex",
        temperature: 0.3,
      });

      // Parse JSON from response
      const parsedOutput = JSON.parse(extractFirstJSON(response.content)) as SectorExpertOutput;

      // -- Data completeness assessment & score capping --
      const completenessData = parsedOutput.dataCompleteness ?? {
        level: "partial" as const,
        availableDataPoints: 0,
        expectedDataPoints: 0,
        missingCritical: [],
        limitations: [],
      };

      const availableMetrics = (parsedOutput.metricsAnalysis ?? []).filter((m: { metricValue: unknown }) => m.metricValue !== null).length;
      const totalMetrics = (parsedOutput.metricsAnalysis ?? []).length;
      let completenessLevel = completenessData.level;
      if (totalMetrics > 0 && !parsedOutput.dataCompleteness) {
        const ratio = availableMetrics / totalMetrics;
        if (ratio < 0.3) completenessLevel = "minimal";
        else if (ratio < 0.7) completenessLevel = "partial";
        else completenessLevel = "complete";
      }

      let scoreMax = 100;
      if (completenessLevel === "minimal") scoreMax = 50;
      else if (completenessLevel === "partial") scoreMax = 70;

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

      // Transform to SectorExpertData format using mapping helpers
      const sectorData: SectorExpertData = {
        sectorName: "DeepTech",
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
          keyRegulations: parsedOutput.sectorDynamics?.regulatoryRisk?.keyRegulations ?? [],
          complianceRisks: [],
          upcomingChanges: parsedOutput.sectorDynamics?.regulatoryRisk?.upcomingChanges ?? [],
        },
        sectorDynamics: {
          competitionIntensity: mapCompetition(parsedOutput.sectorDynamics?.competitionIntensity),
          consolidationTrend: mapConsolidation(parsedOutput.sectorDynamics?.consolidationTrend),
          barrierToEntry: mapBarrier(parsedOutput.sectorDynamics?.barrierToEntry),
          typicalExitMultiple: parsedOutput.sectorDynamics?.exitLandscape?.typicalMultiple?.median ?? 10,
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
          score: cappedFitScore,
          strengths: parsedOutput.executiveSummary?.topStrengths ?? [],
          weaknesses: parsedOutput.executiveSummary?.topConcerns ?? [],
          sectorTiming: parsedOutput.sectorFit?.timingAssessment === "early_mover" ? "early" :
                        parsedOutput.sectorFit?.timingAssessment === "too_late" ? "late" : "optimal",
        },
        sectorScore: cappedScore,
        executiveSummary: parsedOutput.executiveSummary?.verdict ?? parsedOutput.sectorFit?.reasoning ?? "",
      };

      return {
        agentName: "deeptech-expert",
        success: true,
        executionTimeMs: Date.now() - startTime,
        cost: response.cost ?? 0,
        data: sectorData,
        // Extended data for UI wow effect
        _extended: {
          technologyReadiness: {
            currentTRL: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("trl"))?.metricValue as number ?? null,
            expectedTRLForStage: null,
            trlAssessment: null,
          },
          ipPortfolio: {
            patentCount: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("patent"))?.metricValue as number ?? null,
            patentsPending: null,
            ipStrength: null,
          },
          rdEfficiency: {
            rdBurnRate: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("burn") || m.metricName.toLowerCase().includes("r&d"))?.metricValue as number ?? null,
            milestonesPerDollar: null,
            grantFunding: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("grant"))?.metricValue as number ?? null,
          },
          teamComposition: {
            phdRatio: parsedOutput.metricsAnalysis?.find(m => m.metricName.toLowerCase().includes("phd"))?.metricValue as number ?? null,
            technicalTeamSize: null,
            industryExperience: null,
          },
          bigTechThreat: null,
          exitLandscape: parsedOutput.sectorDynamics?.exitLandscape ?? null,
          competitivePosition: parsedOutput.competitorBenchmark ?? null,
          sectorSpecificRisks: parsedOutput.sectorRedFlags?.filter(rf =>
            rf.flag.toLowerCase().includes("trl") ||
            rf.flag.toLowerCase().includes("ip") ||
            rf.flag.toLowerCase().includes("patent") ||
            rf.flag.toLowerCase().includes("r&d") ||
            rf.flag.toLowerCase().includes("big tech")
          ) ?? [],
          scoringWeights: DEEPTECH_SCORING_WEIGHTS,
          fullMetricsAnalysis: parsedOutput.metricsAnalysis ?? [],
          dbCrossReference: parsedOutput.dbCrossReference,
          dataCompleteness: {
            level: completenessLevel,
            availableDataPoints: completenessData.availableDataPoints ?? availableMetrics,
            expectedDataPoints: completenessData.expectedDataPoints ?? totalMetrics,
            missingCritical: completenessData.missingCritical ?? [],
            limitations,
            scoreCapped: cappedScore < rawScore,
            rawScore,
            cappedScore,
          },
        },
      } as unknown as SectorExpertResult & { _extended: ExtendedDeepTechData };

    } catch (error) {
      console.error("[deeptech-expert] Execution error:", error);
      return {
        agentName: "deeptech-expert",
        success: false,
        executionTimeMs: Date.now() - startTime,
        cost: 0,
        error: error instanceof Error ? error.message : "Unknown error",
        data: getDefaultDeepTechData(),
      };
    }
  },
};

// Extended data type for DeepTech Expert UI wow effect
interface ExtendedDeepTechData {
  technologyReadiness: {
    currentTRL: number | null;
    expectedTRLForStage: number | null;
    trlAssessment: string | null;
  };
  ipPortfolio: {
    patentCount: number | null;
    patentsPending: number | null;
    ipStrength: string | null;
  };
  rdEfficiency: {
    rdBurnRate: number | null;
    milestonesPerDollar: number | null;
    grantFunding: number | null;
  };
  teamComposition: {
    phdRatio: number | null;
    technicalTeamSize: number | null;
    industryExperience: string | null;
  };
  bigTechThreat: unknown;
  exitLandscape: unknown;
  competitivePosition: unknown;
  sectorSpecificRisks: Array<{ flag: string; severity: string; sectorThreshold?: string }>;
  scoringWeights: typeof DEEPTECH_SCORING_WEIGHTS;
  fullMetricsAnalysis: unknown[];
  dbCrossReference?: {
    claims: Array<{ claim: string; location: string; dbVerdict: string; evidence: string; severity?: string }>;
    hiddenCompetitors: string[];
    valuationPercentile?: number;
    competitorComparison?: unknown;
  };
  dataCompleteness?: {
    level: "complete" | "partial" | "minimal";
    availableDataPoints: number;
    expectedDataPoints: number;
    missingCritical: string[];
    limitations: string[];
    scoreCapped: boolean;
    rawScore: number;
    cappedScore: number;
  };
}

// Default data for error fallback
function getDefaultDeepTechData(): SectorExpertData {
  return {
    sectorName: "DeepTech",
    sectorMaturity: "emerging",
    keyMetrics: [],
    sectorRedFlags: [
      {
        flag: "Analysis incomplete - unable to perform full deeptech sector analysis",
        severity: "major",
        sectorReason: "Insufficient data or processing error prevented complete analysis",
      },
    ],
    sectorOpportunities: [],
    regulatoryEnvironment: {
      complexity: "medium",
      keyRegulations: [],
      complianceRisks: ["Unable to assess compliance status"],
      upcomingChanges: [],
    },
    sectorDynamics: {
      competitionIntensity: "medium",
      consolidationTrend: "stable",
      barrierToEntry: "high",
      typicalExitMultiple: 10,
      recentExits: [],
    },
    sectorQuestions: [
      {
        question: "What is your current TRL and timeline to next milestone?",
        category: "technical",
        priority: "must_ask",
        expectedAnswer: "Clear TRL with defined milestones and timeline",
        redFlagAnswer: "Vague TRL or no clear milestone roadmap",
      },
    ],
    sectorFit: {
      score: 0,
      strengths: [],
      weaknesses: ["Analysis incomplete"],
      sectorTiming: "optimal",
    },
    sectorScore: 0,
    executiveSummary: "DeepTech sector analysis could not be completed. Please ensure sufficient deal data is available.",
  };
}

// Default export
export default deeptechExpert;

// =============================================================================
// DEEPTECH-SPECIFIC HELPER FUNCTIONS
// =============================================================================

/**
 * Evaluate Technology Readiness Level (TRL) appropriateness for stage
 *
 * TRL Expectations by Stage:
 * - These are industry norms based on investor expectations and typical funding patterns
 * - Source: VC industry practice, BCG DeepTech Report 2024, NASA TRL definitions
 * - Pre-Seed (TRL 2-4): Concept validated in lab, early prototypes
 * - Seed (TRL 3-5): Technology demonstrated, moving toward working prototype
 * - Series A (TRL 5-7): Prototype validated in relevant environment
 * - Series B (TRL 6-8): Near-commercial or commercial product
 * - Series C (TRL 7-9): Commercial product, scaling operations
 *
 * @param trl Current TRL (1-9)
 * @param stage Funding stage
 * @returns Assessment of TRL appropriateness
 */
export function assessTRLForStage(trl: number, stage: string): {
  assessment: "ahead" | "on_track" | "behind" | "critical";
  expectedRange: { min: number; max: number };
  commentary: string;
} {
  // Expected TRL ranges by funding stage
  // Source: VC industry practice, BCG DeepTech Report 2024
  const expectedTRL: Record<string, { min: number; max: number }> = {
    "PRE_SEED": { min: 2, max: 4 },
    "SEED": { min: 3, max: 5 },
    "SERIES_A": { min: 5, max: 7 },
    "SERIES_B": { min: 6, max: 8 },
    "SERIES_C": { min: 7, max: 9 },
  };

  const stageKey = stage.toUpperCase().replace(/[\s-]/g, "_");
  const expected = expectedTRL[stageKey] ?? expectedTRL.SEED;

  let assessment: "ahead" | "on_track" | "behind" | "critical";
  let commentary: string;

  if (trl > expected.max) {
    assessment = "ahead";
    commentary = `TRL ${trl} is ahead of typical ${stage} expectations (${expected.min}-${expected.max}). Strong technical progress.`;
  } else if (trl >= expected.min) {
    assessment = "on_track";
    commentary = `TRL ${trl} is within expected range for ${stage} (${expected.min}-${expected.max}). Normal progression.`;
  } else if (trl >= expected.min - 1) {
    assessment = "behind";
    commentary = `TRL ${trl} is slightly behind expectations for ${stage} (expected ${expected.min}-${expected.max}). Monitor closely.`;
  } else {
    assessment = "critical";
    commentary = `TRL ${trl} is significantly behind for ${stage} (expected ${expected.min}-${expected.max}). Major technology risk.`;
  }

  return { assessment, expectedRange: expected, commentary };
}

/**
 * Evaluate Big Tech threat level for a DeepTech company
 *
 * Threat Level Categorization:
 * - Based on historical patterns of Big Tech acquisitions and internal development
 * - High-risk sectors: Areas where FAANG companies have large internal teams and acquisition history
 * - Medium-risk: Areas of interest but less concentrated internal development
 * - Lower-risk: Specialized domains requiring deep expertise Big Tech typically doesn't build in-house
 *
 * Source: Analysis of Google, Microsoft, Apple, Meta, Amazon acquisitions and org structures
 *
 * @param sector Sub-sector (AI/ML, Quantum, etc.)
 * @param hasDefensibleIP Whether company has strong patent protection
 * @param teamFromBigTech Whether founders came from Big Tech
 * @returns Big Tech threat assessment
 */
export function assessBigTechThreat(
  sector: string,
  hasDefensibleIP: boolean,
  teamFromBigTech: boolean
): {
  threatLevel: "critical" | "high" | "medium" | "low";
  reasoning: string;
  mitigation: string[];
} {
  // Sector risk categorization based on Big Tech activity and acquisition patterns
  // Source: CB Insights Big Tech acquisition data, company org structure analysis
  const highRiskSectors = ["AI/ML", "Foundation Models", "LLM", "MLOps", "AI Infrastructure"];
  const mediumRiskSectors = ["Quantum Software", "Computer Vision", "NLP", "Robotics"];
  const lowerRiskSectors = ["Quantum Hardware", "Biotech", "Advanced Materials", "Photonics"];

  const sectorNormalized = sector.toLowerCase();
  const isHighRisk = highRiskSectors.some(s => sectorNormalized.includes(s.toLowerCase()));
  const isMediumRisk = mediumRiskSectors.some(s => sectorNormalized.includes(s.toLowerCase()));
  const isLowerRisk = lowerRiskSectors.some(s => sectorNormalized.includes(s.toLowerCase()));

  let baseThreat: "critical" | "high" | "medium" | "low";
  if (isHighRisk) baseThreat = "critical";
  else if (isMediumRisk) baseThreat = "high";
  else if (isLowerRisk) baseThreat = "medium";
  else baseThreat = "medium";

  // Adjust based on defensibility - reduce threat by one level if strong IP
  if (hasDefensibleIP) {
    const threatLevels: Array<"low" | "medium" | "high" | "critical"> = ["low", "medium", "high", "critical"];
    const currentIndex = threatLevels.indexOf(baseThreat);
    if (currentIndex > 0) {
      baseThreat = threatLevels[currentIndex - 1];
    }
  }

  const mitigation: string[] = [];
  if (!hasDefensibleIP) {
    mitigation.push("Strengthen patent portfolio with broad, foundational claims");
  }
  if (baseThreat === "critical" || baseThreat === "high") {
    mitigation.push("Focus on enterprise/vertical-specific applications Big Tech won't prioritize");
    mitigation.push("Build proprietary data moats through customer relationships");
    mitigation.push("Consider strategic partnership with one Big Tech player for protection");
  }
  if (teamFromBigTech) {
    mitigation.push("Leverage Big Tech alumni network for enterprise sales and partnerships");
  }

  const reasoning = `${sector} has ${baseThreat} Big Tech threat level. ` +
    (hasDefensibleIP ? "Defensible IP provides some protection. " : "Lack of strong IP increases vulnerability. ") +
    (teamFromBigTech ? "Team's Big Tech background provides market insight but also recruitment risk." : "");

  return { threatLevel: baseThreat, reasoning, mitigation };
}

/**
 * Evaluate grant funding quality and validation signal
 *
 * Grant Validation Signal:
 * - Premium sources (DARPA, NSF, NIH, DOE) indicate strong technical validation
 * - SBIR/STTR Phase II ($1-2M) is more validating than Phase I ($150-275K)
 * - EU Horizon and EIC grants are competitive and well-regarded
 *
 * Typical grant amounts (Source: SBA.gov, NSF, DARPA):
 * - SBIR Phase I: $150-275K
 * - SBIR Phase II: $1-2M
 * - NSF CAREER: $500K-800K over 5 years
 * - DARPA: $1-50M+ depending on program
 * - EU Horizon: €1-5M typical
 *
 * @param grants Array of grant sources and amounts
 * @returns Grant quality assessment
 */
export function assessGrantQuality(grants: Array<{ source: string; amount: number; year: number }>): {
  validationStrength: "strong" | "moderate" | "weak" | "none";
  totalNonDilutive: number;
  topGrantSources: string[];
  commentary: string;
} {
  // Premium sources indicate strong competitive validation
  // Source: SBA.gov (SBIR/STTR), agency award databases
  const premiumSources = ["DARPA", "NSF", "NIH", "DOE", "EU Horizon", "EIC", "SBIR Phase II", "STTR Phase II"];
  const goodSources = ["SBIR Phase I", "STTR Phase I", "State Grants", "University Grants"];

  const totalNonDilutive = grants.reduce((sum, g) => sum + g.amount, 0);
  const premiumGrants = grants.filter(g =>
    premiumSources.some(s => g.source.toLowerCase().includes(s.toLowerCase()))
  );
  const goodGrants = grants.filter(g =>
    goodSources.some(s => g.source.toLowerCase().includes(s.toLowerCase()))
  );

  let validationStrength: "strong" | "moderate" | "weak" | "none";
  let commentary: string;

  if (premiumGrants.length >= 2 || (premiumGrants.length >= 1 && totalNonDilutive > 2_000_000)) {
    validationStrength = "strong";
    commentary = `Strong government validation with ${premiumGrants.length} premium grants (${premiumGrants.map(g => g.source).join(", ")}). Total $${(totalNonDilutive / 1_000_000).toFixed(1)}M non-dilutive.`;
  } else if (premiumGrants.length >= 1 || goodGrants.length >= 2) {
    validationStrength = "moderate";
    commentary = `Moderate grant traction. Consider pursuing DARPA/NSF for stronger validation.`;
  } else if (grants.length > 0) {
    validationStrength = "weak";
    commentary = `Limited grant funding. Non-dilutive funding would validate technology and extend runway.`;
  } else {
    validationStrength = "none";
    commentary = `No grant funding secured. For DeepTech, this is a missed opportunity for validation and runway extension.`;
  }

  return {
    validationStrength,
    totalNonDilutive,
    topGrantSources: [...premiumGrants, ...goodGrants].map(g => g.source).slice(0, 3),
    commentary,
  };
}
