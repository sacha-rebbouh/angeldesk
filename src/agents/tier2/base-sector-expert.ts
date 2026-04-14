/**
 * Base Sector Expert Agent - TIER 2
 *
 * Template for all sector-specific expert agents.
 * Applies sector benchmarks, detects sector-specific risks,
 * and cross-references with the Funding DB for competitor analysis.
 *
 * Standards: Big4 + Partner VC rigor
 * - Every metric compared to sector benchmarks with percentile positioning
 * - Red flags with evidence, severity, impact, and mitigation
 * - Cross-reference all claims against Funding DB competitors
 * - Actionable output: negotiation ammo, killer questions
 */

import { z } from "zod";
import type { AgentResult, EnrichedAgentContext } from "../types";
import { sanitizeForLLM, sanitizeName } from "@/lib/sanitize";

// =============================================================================
// OUTPUT SCHEMA - Tier 2 Standard Format
// =============================================================================

export const SectorExpertOutputSchema = z.object({
  // SECTION 1: Sector Fit Assessment
  sectorFit: z.object({
    verdict: z.enum(["strong", "moderate", "weak", "poor"]),
    score: z.number().min(0).max(100),
    reasoning: z.string().describe("2-3 sentences explaining the sector fit verdict"),
    sectorMaturity: z.enum(["emerging", "growth", "mature", "declining"]),
    timingAssessment: z.enum(["early_mover", "right_time", "late_entrant", "too_late"]),
  }),

  // SECTION 2: Key Metrics vs Sector Benchmarks
  metricsAnalysis: z.array(z.object({
    metricName: z.string(),
    metricValue: z.union([z.number(), z.string(), z.null()]),
    unit: z.string(),

    // Benchmark comparison
    benchmark: z.object({
      p25: z.number(),
      median: z.number(),
      p75: z.number(),
      topDecile: z.number(),
      source: z.string().describe("e.g., 'OpenView SaaS Benchmarks 2024', 'Internal DB (n=47)'"),
    }),

    // Calculated position
    percentile: z.number().min(0).max(100).nullable(),
    assessment: z.enum(["exceptional", "above_average", "average", "below_average", "critical"]),

    // Context
    sectorContext: z.string().describe("Why this metric matters specifically in this sector"),
    comparisonNote: z.string().describe("How this compares to specific competitors from DB"),
  })),

  // SECTION 3: Sector-Specific Red Flags
  sectorRedFlags: z.array(z.object({
    flag: z.string(),
    severity: z.enum(["critical", "high", "medium"]),

    // Evidence-based (Big4 standard)
    evidence: z.string().describe("Specific data point or observation that triggers this flag"),
    sectorThreshold: z.string().describe("The sector benchmark/threshold being violated"),

    // Impact analysis
    impact: z.string().describe("Quantified impact if this risk materializes"),

    // Actionable
    questionToAsk: z.string().describe("Specific question to validate/invalidate this flag"),
    mitigationPath: z.string().describe("What would need to be true to resolve this concern"),
  })),

  // SECTION 4: Sector-Specific Opportunities
  sectorOpportunities: z.array(z.object({
    opportunity: z.string(),
    potential: z.enum(["high", "medium", "low"]),
    evidence: z.string(),
    sectorContext: z.string().describe("Why this is particularly valuable in this sector"),
    comparableSuccess: z.string().describe("Example from DB of similar company that captured this"),
  })),

  // SECTION 5: Competitor Benchmark (from Funding DB)
  competitorBenchmark: z.object({
    competitorsAnalyzed: z.number().describe("Number of competitors from DB used for comparison"),

    vsLeader: z.object({
      leaderName: z.string(),
      leaderMetrics: z.string().describe("Key metrics of the sector leader"),
      gap: z.string().describe("Specific gaps vs the leader"),
      catchUpPath: z.string().describe("What would be needed to close the gap"),
    }),

    vsMedianCompetitor: z.object({
      positioning: z.enum(["above", "at", "below"]),
      keyDifferentiators: z.array(z.string()),
      weaknessesVsMedian: z.array(z.string()),
    }),

    fundingComparison: z.object({
      medianRaised: z.number(),
      medianValuation: z.number(),
      thisDealsPosition: z.string().describe("e.g., 'Asking 15M€ vs median 12M€ (P65)'"),
    }),
  }),

  // SECTION 6: Sector Dynamics
  sectorDynamics: z.object({
    competitionIntensity: z.enum(["low", "moderate", "high", "intense"]),
    consolidationTrend: z.enum(["fragmenting", "stable", "consolidating", "winner_take_all"]),
    barrierToEntry: z.enum(["low", "medium", "high", "very_high"]),

    // Exit expectations with evidence
    exitLandscape: z.object({
      typicalMultiple: z.object({
        low: z.number(),
        median: z.number(),
        high: z.number(),
        topDecile: z.number(),
      }),
      recentExits: z.array(z.object({
        company: z.string(),
        acquirer: z.string(),
        multiple: z.number(),
        year: z.number(),
      })),
      potentialAcquirers: z.array(z.string()),
      timeToExitYears: z.object({
        typical: z.number(),
        range: z.string(),
      }),
    }),

    // Regulatory context
    regulatoryRisk: z.object({
      level: z.enum(["low", "medium", "high", "very_high"]),
      keyRegulations: z.array(z.string()),
      upcomingChanges: z.array(z.string()),
      complianceCost: z.string().describe("Estimated compliance burden"),
    }),
  }),

  // SECTION 7: Unit Economics Assessment
  unitEconomics: z.object({
    formulas: z.array(z.object({
      name: z.string(),
      formula: z.string(),
      calculatedValue: z.union([z.number(), z.string(), z.null()]),
      benchmark: z.object({
        good: z.string(),
        excellent: z.string(),
      }),
      assessment: z.enum(["excellent", "good", "acceptable", "concerning", "critical"]),
    })),

    overallHealthScore: z.number().min(0).max(100),
    verdict: z.string(),
  }),

  // SECTION 8: Killer Questions (Sector-Specific)
  mustAskQuestions: z.array(z.object({
    question: z.string(),
    category: z.enum(["technical", "business_model", "regulatory", "competitive", "unit_economics"]),
    priority: z.enum(["critical", "high", "medium"]),

    // What to look for
    goodAnswer: z.string().describe("What a strong answer looks like"),
    redFlagAnswer: z.string().describe("What would be concerning"),

    // Context
    whyImportant: z.string().describe("Why this question matters in this sector"),
    linkedToRisk: z.string().optional().describe("Which red flag this helps validate"),
  })),

  // SECTION 9: Negotiation Ammunition
  negotiationAmmo: z.array(z.object({
    point: z.string(),
    evidence: z.string(),
    usage: z.string().describe("How to use this in negotiation"),
    expectedImpact: z.string().describe("e.g., '-10-15% on valuation'"),
  })),

  // SECTION 10: Executive Summary
  executiveSummary: z.object({
    verdict: z.string().describe("One-line verdict"),
    sectorScore: z.number().min(0).max(100),

    topStrengths: z.array(z.string()).max(3),
    topConcerns: z.array(z.string()).max(3),

    investmentImplication: z.string().describe("What this means for the investment decision"),

    // Confidence
    analysisConfidence: z.enum(["high", "medium", "low"]),
    dataGaps: z.array(z.string()).describe("Missing data that would improve analysis"),
  }),

  // SECTION 11: DB Cross-Reference (obligatoire si donnees DB disponibles)
  dbCrossReference: z.object({
    claims: z.array(z.object({
      claim: z.string(),
      location: z.string(),
      dbVerdict: z.enum(["VERIFIED", "CONTREDIT", "PARTIEL", "NON_VERIFIABLE"]),
      evidence: z.string(),
      severity: z.enum(["CRITICAL", "HIGH", "MEDIUM"]).optional(),
    })),
    hiddenCompetitors: z.array(z.string()),
    valuationPercentile: z.number().optional(),
    competitorComparison: z.object({
      fromDeck: z.object({
        mentioned: z.array(z.string()),
        location: z.string(),
      }),
      fromDb: z.object({
        detected: z.array(z.string()),
        directCompetitors: z.number(),
      }),
      deckAccuracy: z.enum(["ACCURATE", "INCOMPLETE", "MISLEADING"]),
    }).optional(),
  }).optional(),

  // SECTION 12: Data Completeness Assessment
  dataCompleteness: z.object({
    level: z.enum(["complete", "partial", "minimal"]),
    availableDataPoints: z.number(),
    expectedDataPoints: z.number(),
    missingCritical: z.array(z.string()),
    limitations: z.array(z.string()),
  }),
});

export type SectorExpertOutput = z.infer<typeof SectorExpertOutputSchema>;

// =============================================================================
// SECTOR CONFIGURATION
// =============================================================================

export interface SectorBenchmarkData {
  primaryMetrics: Array<{
    name: string;
    unit: string;
    description?: string;
    direction: "higher_better" | "lower_better" | "target_range";
    stages: {
      PRE_SEED?: { p25: number; median: number; p75: number; topDecile: number };
      SEED: { p25: number; median: number; p75: number; topDecile: number };
      SERIES_A: { p25: number; median: number; p75: number; topDecile: number };
      SERIES_B?: { p25: number; median: number; p75: number; topDecile: number };
    };
    thresholds: {
      exceptional: number;
      good: number;
      concerning: number;
    };
    sectorContext: string;
    source: string;
  }>;

  secondaryMetrics: Array<{
    name: string;
    unit: string;
    description?: string;
    direction: "higher_better" | "lower_better" | "target_range";
    stages: {
      PRE_SEED?: { p25: number; median: number; p75: number; topDecile: number };
      SEED: { p25: number; median: number; p75: number; topDecile: number };
      SERIES_A: { p25: number; median: number; p75: number; topDecile: number };
      SERIES_B?: { p25: number; median: number; p75: number; topDecile: number };
    };
    thresholds: {
      exceptional: number;
      good: number;
      concerning: number;
    };
    sectorContext: string;
    source: string;
  }>;

  redFlagRules: Array<{
    metric: string;
    condition: "<" | ">" | "<=" | ">=" | "above" | "below";
    threshold: number;
    severity: "critical" | "high" | "medium" | "major" | "minor";
    reason: string;
  }>;

  unitEconomicsFormulas: Array<{
    name: string;
    formula: string;
    benchmark: {
      good: string;
      excellent: string;
    };
    source?: string;
  }>;

  exitMultiples: {
    low: number;
    median: number;
    high: number;
    topDecile: number;
    typicalAcquirers: string[];
    recentExits: Array<{
      company: string;
      acquirer: string;
      multiple: number;
      year: number;
    }>;
  };

  sectorSpecificRisks: string[];
  sectorSuccessPatterns: string[];
}

export interface SectorConfig {
  name: string;
  emoji: string;
  displayName: string;
  description: string;

  // Benchmark data
  benchmarkData: SectorBenchmarkData;

  // Scoring weights for this sector
  scoringWeights: {
    metricsWeight: number;      // e.g., 0.35
    unitEconomicsWeight: number; // e.g., 0.25
    competitiveWeight: number;  // e.g., 0.20
    timingWeight: number;       // e.g., 0.10
    teamFitWeight: number;      // e.g., 0.10
  };
}

// =============================================================================
// PROMPT BUILDER - Big4 + Partner VC Standards
// =============================================================================

function formatMetricBenchmarks(
  metrics: SectorBenchmarkData["primaryMetrics"],
  stage: string
): string {
  const stageKey = stage.toUpperCase().replace(/[\s-]/g, "_") as "SEED" | "SERIES_A" | "SERIES_B" | "PRE_SEED";

  return metrics.map(m => {
    const stageData = m.stages[stageKey] || m.stages.SEED;
    const direction = m.direction === "lower_better" ? "↓ lower is better" :
                      m.direction === "target_range" ? "🎯 target range" : "↑ higher is better";

    return `| ${m.name} | ${m.unit} | ${stageData.p25} | ${stageData.median} | ${stageData.p75} | ${stageData.topDecile} | ${direction} | ${m.source} |`;
  }).join("\n");
}

function formatRedFlagRules(rules: SectorBenchmarkData["redFlagRules"]): string {
  return rules.map(r =>
    `- **${r.severity.toUpperCase()}**: ${r.metric} ${r.condition} ${r.threshold} → ${r.reason}`
  ).join("\n");
}

function formatUnitEconomicsFormulas(formulas: SectorBenchmarkData["unitEconomicsFormulas"]): string {
  return formulas.map(f =>
    `- **${f.name}** = ${f.formula}\n  - Good: ${f.benchmark.good} | Excellent: ${f.benchmark.excellent}`
  ).join("\n");
}

function formatExitData(exits: SectorBenchmarkData["exitMultiples"]): string {
  const recentExitsStr = exits.recentExits
    .slice(0, 5)
    .map(e => `  - ${e.company} → ${e.acquirer} at ${e.multiple}x (${e.year})`)
    .join("\n");

  return `
**Exit Multiples (Revenue/ARR):**
| P25 | Median | P75 | Top 10% |
|-----|--------|-----|---------|
| ${exits.low}x | ${exits.median}x | ${exits.high}x | ${exits.topDecile}x |

**Typical Acquirers:** ${exits.typicalAcquirers.join(", ")}

**Recent Exits:**
${recentExitsStr}`;
}

export function buildSectorExpertPrompt(
  context: EnrichedAgentContext,
  config: SectorConfig
): { system: string; user: string } {
  const deal = context.deal;
  const stage = deal.stage ?? "SEED";
  const benchmarks = config.benchmarkData;

  // Extract competitors from context if available
  const dbCompetitors = context.fundingContext?.competitors ?? [];
  const dbBenchmarks = context.fundingContext?.sectorBenchmarks ?? null;

  // =============================================================================
  // SYSTEM PROMPT
  // =============================================================================
  const systemPrompt = `# ROLE: Senior ${config.displayName}

Tu es un **expert sectoriel senior** spécialisé dans le secteur **${config.name}**, avec 15+ ans d'expérience en due diligence pour des fonds Tier 1.

## TON EXPERTISE
- Unit economics et business models spécifiques au ${config.name}
- Benchmarks sectoriels et métriques de succès
- Paysage réglementaire et exigences de conformité
- Dynamiques concurrentielles et positionnement marché
- Patterns d'échec et red flags spécifiques au ${config.name}
- Historique des exits et acquéreurs typiques

## STANDARDS DE QUALITÉ (Big4 + Partner VC)

### RÈGLE ABSOLUE: Chaque affirmation doit être sourcée
- ❌ "La croissance est forte"
- ✅ "ARR growth de 180% YoY, P85 vs sector median de 120% (source: OpenView SaaS Benchmarks 2024)"

### RÈGLE ABSOLUE: Chaque red flag doit avoir
1. **Sévérité**: critical / high / medium
2. **Preuve**: le data point exact qui déclenche le flag
3. **Seuil sectoriel**: la référence benchmark violée
4. **Impact quantifié**: ce qui se passe si le risque se matérialise
5. **Question de validation**: comment investiguer davantage

### RÈGLE ABSOLUE: Cross-référence avec la DB
- Compare chaque métrique aux concurrents de la Funding DB
- Positionne la valorisation vs deals similaires
- Identifie les patterns de succès/échec du secteur

---

## BENCHMARKS SECTORIELS ${config.name.toUpperCase()} (Stage: ${stage})

### PRIMARY KPIs
| Métrique | Unité | P25 | Median | P75 | Top 10% | Direction | Source |
|----------|-------|-----|--------|-----|---------|-----------|--------|
${formatMetricBenchmarks(benchmarks.primaryMetrics, stage)}

### SECONDARY KPIs
| Métrique | Unité | P25 | Median | P75 | Top 10% | Direction | Source |
|----------|-------|-----|--------|-----|---------|-----------|--------|
${formatMetricBenchmarks(benchmarks.secondaryMetrics, stage)}

---

## RED FLAG RULES (AUTOMATIQUES)
${formatRedFlagRules(benchmarks.redFlagRules)}

---

## UNIT ECONOMICS FORMULAS
${formatUnitEconomicsFormulas(benchmarks.unitEconomicsFormulas)}

---

## EXIT LANDSCAPE ${config.name.toUpperCase()}
${formatExitData(benchmarks.exitMultiples)}

---

## SECTOR-SPECIFIC SUCCESS PATTERNS
${benchmarks.sectorSuccessPatterns.map(p => `- ${p}`).join("\n")}

## SECTOR-SPECIFIC RISKS TO WATCH
${benchmarks.sectorSpecificRisks.map(r => `- ${r}`).join("\n")}

---

## SCORING METHODOLOGY

Le score sectoriel (0-100) est calculé ainsi:
- **Métriques vs benchmarks**: ${config.scoringWeights.metricsWeight * 100}%
- **Unit economics**: ${config.scoringWeights.unitEconomicsWeight * 100}%
- **Positionnement concurrentiel**: ${config.scoringWeights.competitiveWeight * 100}%
- **Timing marché**: ${config.scoringWeights.timingWeight * 100}%
- **Team/sector fit**: ${config.scoringWeights.teamFitWeight * 100}%

**Grille de scoring:**
- 80-100: ≥3 primary KPIs au P75+, unit economics excellent, timing optimal
- 60-79: KPIs majoritairement au P50+, unit economics acceptable, pas de red flag critique
- 40-59: KPIs mixtes, quelques en dessous P25, red flags medium présents
- 20-39: Plusieurs KPIs sous P25, red flags high présents, unit economics faibles
- 0-19: Red flags critiques, economics fondamentalement cassés

---

## CLASSIFICATION DE FIABILITÉ DES DONNÉES (OBLIGATOIRE)
Chaque donnée que tu analyses a un niveau de fiabilité. Tu DOIS en tenir compte dans ton analyse.

**6 niveaux (du plus fiable au moins fiable) :**
- **AUDITED** : Donnée auditée par un tiers indépendant (commissaire aux comptes, expert). Confiance maximale.
- **VERIFIED** : Donnée vérifiable via source externe (registre, API, base publique). Haute confiance.
- **DECLARED** : Donnée déclarée par le fondateur dans le deck, non vérifiée. Confiance modérée.
- **PROJECTED** : Projection future (CA prévisionnel, croissance attendue). Confiance faible — traiter comme hypothèse.
- **ESTIMATED** : Estimation dérivée ou calculée à partir d'autres données. Confiance faible.
- **UNVERIFIABLE** : Donnée impossible à vérifier (claims sans source, opinions). Confiance minimale.

**Règles impératives :**
1. Ne JAMAIS traiter une donnée PROJECTED ou ESTIMATED comme un fait établi.
2. Si une projection est présentée comme un fait dans le deck, le signaler comme red flag (PROJECTION_AS_FACT).
3. Pour chaque métrique clé de ton analyse, indiquer le niveau de fiabilité de la source.
4. Pondérer tes conclusions : une conclusion basée uniquement sur des données DECLARED ou inférieures doit être marquée avec prudence.
5. Si le Tier 0 (fact-extractor) a fourni des classifications de fiabilité, les RESPECTER et ne pas les surclasser.

## TON ANALYTIQUE OBLIGATOIRE (RÈGLE N°1)
Angel Desk ANALYSE et GUIDE. Angel Desk ne DÉCIDE JAMAIS. Le Business Angel est le seul décideur.

**INTERDIT dans TOUT texte généré (narrative, nextSteps, forNegotiation, rationale, summary) :**
- "Investir" / "Ne pas investir" / "Rejeter l'opportunité" / "Passer ce deal"
- "GO" / "NO-GO" / "Dealbreaker"
- Tout impératif adressé à l'investisseur ("Fuyez", "N'investissez pas", "Rejetez")
- Tout langage qui prescrit une décision

**OBLIGATOIRE :**
- Ton analytique : "Les données montrent...", "Les signaux indiquent...", "X dimensions présentent..."
- Constater des faits, rapporter des signaux, laisser le BA conclure
- Chaque phrase doit pouvoir se terminer par "...à vous de décider" sans être absurde

## Anti-Hallucination Directive — Confidence Threshold
Answer only if you are >90% confident, since mistakes are penalised 9 points, while correct answers receive 1 point, and an answer of "I don't know" receives 0 points.

## Anti-Hallucination Directive — Abstention Permission
It is perfectly acceptable (and preferred) for you to say "I don't know" or "I'm not confident enough to answer this." I would rather receive an honest "I'm unsure" than a confident answer that might be wrong.
If you are uncertain about any part of your response, flag it clearly with [UNCERTAIN] so I know to verify it independently.
Uncertainty is valued here, not penalised.

## Anti-Hallucination Directive — Citation Demand
For every factual claim in your response:
1. Cite a specific, verifiable source (name, publication, date)
2. If you cannot cite a specific source, mark the claim as [UNVERIFIED] and explain why you believe it to be true
3. If you are relying on general training data rather than a specific source, say so explicitly
Do not present unverified information as established fact.

## Anti-Hallucination Directive — Self-Audit
After completing your response, perform a self-audit:
1. Identify the 3 claims in your response that you are LEAST confident about
2. For each one, explain what could be wrong and what the alternative might be
3. Rate your overall response confidence: HIGH / MEDIUM / LOW
Be ruthlessly honest. I will not penalise you for uncertainty.

## Anti-Hallucination Directive — Structured Uncertainty
Structure your response in three clearly labelled sections:
**CONFIDENT:** Claims where you have strong evidence and high certainty (>90%)
**PROBABLE:** Claims where you believe this is likely correct but acknowledge uncertainty (50-90%)
**SPECULATIVE:** Claims where you are filling in gaps, making inferences, or relying on pattern-matching rather than direct knowledge (<50%)
Every claim must be placed in one of these three categories.
Do not present speculative claims as confident ones.

---

## OUTPUT FORMAT

Tu DOIS retourner un JSON valide suivant exactement le schema fourni.
Chaque champ doit être rempli avec des données concrètes, pas de placeholders.`;

  // =============================================================================
  // USER PROMPT - Sanitize all user-provided data
  // =============================================================================
  const sanitizedCompanyName = sanitizeName(deal.companyName ?? deal.name);
  const sanitizedSector = sanitizeName(deal.sector);
  const sanitizedGeography = sanitizeName(deal.geography);

  const userPrompt = `# ANALYSE SECTORIELLE ${config.name.toUpperCase()}

## DEAL À ANALYSER

**Company:** ${sanitizedCompanyName}
**Sector:** ${sanitizedSector || "Non spécifié"}
**Stage:** ${stage}
**Geography:** ${sanitizedGeography || "Non spécifié"}
**Valorisation demandée:** ${deal.valuationPre != null ? `${(Number(deal.valuationPre) / 1_000_000).toFixed(1)}M€` : "Non spécifiée"}
**Montant levé:** ${deal.amountRequested != null ? `${(Number(deal.amountRequested) / 1_000_000).toFixed(1)}M€` : "Non spécifié"}

---

## DONNÉES EXTRAITES DU DECK
${context.extractedData ? sanitizeForLLM(JSON.stringify(context.extractedData, null, 2), { maxLength: 50000 }) : "Pas de données extraites disponibles"}

---

## RÉSULTATS DES AGENTS TIER 1
${context.previousResults ? Object.entries(context.previousResults)
  .filter(([, v]) => (v as { success?: boolean })?.success)
  .map(([k, v]) => `### ${k}\n${JSON.stringify((v as { data?: unknown })?.data, null, 2)}`)
  .join("\n\n") : "Pas de résultats Tier 1 disponibles"}

---

## DONNÉES FUNDING DB (Concurrents Sectoriels)
${dbCompetitors.length > 0 ? `
**${dbCompetitors.length} concurrents identifiés dans la DB:**
${dbCompetitors.slice(0, 10).map((c: { name: string; totalFunding?: number; lastRound?: string; status?: string }) =>
  `- ${c.name}: ${c.totalFunding ? `${(c.totalFunding / 1_000_000).toFixed(1)}M€ levés` : "funding inconnu"}, ${c.lastRound ?? "stage inconnu"}, ${c.status ?? ""}`
).join("\n")}
` : "Pas de données concurrentielles disponibles dans la DB"}

${context.factStoreFormatted ? `
## DONNÉES VÉRIFIÉES (Fact Store)

Les données ci-dessous ont été extraites et vérifiées à partir des documents du deal.
Base ton analyse sur ces faits. Si un fait important manque, signale-le.

${context.factStoreFormatted}
` : ""}

${dbBenchmarks ? `
**Benchmarks sectoriels de la DB:**
${JSON.stringify(dbBenchmarks, null, 2)}
` : ""}

---

## TA MISSION

### 1. SECTOR FIT ASSESSMENT
- Évalue l'adéquation du deal avec le secteur ${config.name}
- Détermine la maturité du secteur et le timing d'entrée
- Score de fit avec justification

### 2. METRICS vs BENCHMARKS
Pour chaque KPI primary et secondary disponible:
- Extrais la valeur du deal
- Compare aux benchmarks ${stage} fournis
- Calcule le percentile exact
- Donne l'assessment (exceptional → critical)
- Note la comparaison vs concurrents DB

### 3. RED FLAGS SECTORIELS
Applique les red flag rules automatiques ci-dessus.
Pour chaque violation:
- Cite la preuve exacte
- Référence le seuil violé
- Quantifie l'impact
- Propose la question de validation

### 4. UNIT ECONOMICS
Calcule chaque formule avec les données disponibles:
${benchmarks.unitEconomicsFormulas.map(f => `- ${f.name} = ${f.formula}`).join("\n")}

### 5. COMPETITOR BENCHMARK
En utilisant les données DB:
- Compare au leader sectoriel
- Position vs concurrent médian
- Analyse le gap de funding

### 6. SECTOR DYNAMICS
- Intensité concurrentielle
- Tendance consolidation
- Barrières à l'entrée
- Paysage exit avec comparables récents

### 7. KILLER QUESTIONS
Génère 5-7 questions spécifiques ${config.name}:
- Liées aux red flags identifiés
- Avec good answer et red flag answer
- Priorité critical/high/medium

### 8. NEGOTIATION AMMO
Identifie 2-4 leviers de négociation basés sur:
- Métriques sous-benchmark
- Red flags identifiés
- Comparaison valorisation vs DB

### 9. EXECUTIVE SUMMARY
- Verdict one-line
- Score sectoriel (0-100)
- Top 3 strengths
- Top 3 concerns
- Implication pour la décision d'investissement

---

## RAPPELS CRITIQUES

⚠️ **JAMAIS de phrases vagues** - Chaque point doit être sourcé et quantifié
⚠️ **CROSS-REFERENCE OBLIGATOIRE** - Compare aux données DB quand disponibles
⚠️ **IMPACT QUANTIFIÉ** - Chaque red flag doit avoir un impact chiffré
⚠️ **ACTIONNABLE** - Chaque output doit aider à la décision

Retourne un JSON valide avec toutes les sections complétées.`;

  return { system: systemPrompt, user: userPrompt };
}

// =============================================================================
// AGENT FACTORY
// =============================================================================

export type SectorExpertType =
  | "saas-expert"
  | "fintech-expert"
  | "marketplace-expert"
  | "healthtech-expert"
  | "deeptech-expert"
  | "climate-expert"
  | "consumer-expert"
  | "hardware-expert"
  | "gaming-expert"
  | "base-sector-expert";

export interface SectorExpertResult extends AgentResult {
  agentName: SectorExpertType;
  data: SectorExpertOutput | null;
}

export function createSectorExpert(
  agentType: SectorExpertType,
  config: SectorConfig
): {
  name: SectorExpertType;
  config: SectorConfig;
  buildPrompt: (context: EnrichedAgentContext) => { system: string; user: string };
  outputSchema: typeof SectorExpertOutputSchema;
} {
  return {
    name: agentType,
    config,
    buildPrompt: (context: EnrichedAgentContext) => buildSectorExpertPrompt(context, config),
    outputSchema: SectorExpertOutputSchema,
  };
}

// =============================================================================
// DEFAULT FALLBACK DATA
// =============================================================================

export function getDefaultSectorData(sectorName: string): SectorExpertOutput {
  void sectorName;
  return {
    sectorFit: {
      verdict: "weak",
      score: 0,
      reasoning: "Analyse sectorielle incomplète - données insuffisantes",
      sectorMaturity: "growth",
      timingAssessment: "right_time",
    },
    metricsAnalysis: [],
    sectorRedFlags: [{
      flag: "Analyse incomplète",
      severity: "high",
      evidence: "Données insuffisantes pour compléter l'analyse sectorielle",
      sectorThreshold: "N/A",
      impact: "Impossible d'évaluer le sector fit correctement",
      questionToAsk: "Pouvez-vous fournir les métriques sectorielles clés?",
      mitigationPath: "Obtenir les données manquantes pour refaire l'analyse",
    }],
    sectorOpportunities: [],
    competitorBenchmark: {
      competitorsAnalyzed: 0,
      vsLeader: {
        leaderName: "N/A",
        leaderMetrics: "Données non disponibles",
        gap: "Impossible à évaluer",
        catchUpPath: "N/A",
      },
      vsMedianCompetitor: {
        positioning: "below",
        keyDifferentiators: [],
        weaknessesVsMedian: ["Données insuffisantes"],
      },
      fundingComparison: {
        medianRaised: 0,
        medianValuation: 0,
        thisDealsPosition: "Impossible à évaluer",
      },
    },
    sectorDynamics: {
      competitionIntensity: "moderate",
      consolidationTrend: "stable",
      barrierToEntry: "medium",
      exitLandscape: {
        typicalMultiple: { low: 0, median: 0, high: 0, topDecile: 0 },
        recentExits: [],
        potentialAcquirers: [],
        timeToExitYears: { typical: 0, range: "N/A" },
      },
      regulatoryRisk: {
        level: "medium",
        keyRegulations: [],
        upcomingChanges: [],
        complianceCost: "Non évalué",
      },
    },
    unitEconomics: {
      formulas: [],
      overallHealthScore: 0,
      verdict: "Impossible à évaluer - données manquantes",
    },
    mustAskQuestions: [{
      question: "Pouvez-vous fournir vos métriques sectorielles clés (ARR, growth, churn, etc.)?",
      category: "business_model",
      priority: "critical",
      goodAnswer: "Métriques complètes avec historique",
      redFlagAnswer: "Refus de partager ou métriques incomplètes",
      whyImportant: "Nécessaire pour évaluer le sector fit",
    }],
    negotiationAmmo: [],
    dataCompleteness: {
      level: "minimal" as const,
      availableDataPoints: 0,
      expectedDataPoints: 0,
      missingCritical: ["All sector metrics missing"],
      limitations: ["Analysis could not be completed"],
    },
    executiveSummary: {
      verdict: "Analyse sectorielle incomplète - données insuffisantes pour conclure",
      sectorScore: 0,
      topStrengths: [],
      topConcerns: ["Données insuffisantes pour l'analyse"],
      investmentImplication: "Impossible de conclure sans données sectorielles",
      analysisConfidence: "low",
      dataGaps: ["Métriques sectorielles clés manquantes"],
    },
  };
}
