/**
 * SaaS Expert Agent - Tier 2
 *
 * Expert sectoriel B2B SaaS avec analyse qualité Big4 + instinct Partner VC.
 *
 * Mission: Évaluer le deal à travers le prisme spécifique SaaS/B2B Software
 * en cross-référençant avec les benchmarks sectoriels et la Funding Database.
 *
 * Standards:
 * - Chaque métrique comparée aux percentiles sectoriels
 * - Cross-reference obligatoire avec deals similaires de la DB
 * - Red flags avec sévérité + preuve + impact + question
 * - Output actionnable pour un Business Angel
 */

import { z } from "zod";
import type { EnrichedAgentContext } from "../types";
import type { SectorExpertData, SectorExpertResult, SectorExpertType } from "./types";
import { getStandardsOnlyInjection } from "./benchmark-injector";
import { SAAS_STANDARDS } from "./sector-standards";
import { complete, setAgentContext } from "@/services/openrouter/router";

// ============================================================================
// OUTPUT SCHEMA
// ============================================================================

const SaaSMetricEvaluationSchema = z.object({
  metricName: z.string(),
  dealValue: z.union([z.number(), z.string(), z.null()]).describe("Valeur extraite du deal"),
  source: z.string().describe("D'où vient cette donnée (deck page X, data room, calcul)"),
  benchmark: z.object({
    p25: z.number(),
    median: z.number(),
    p75: z.number(),
    topDecile: z.number(),
  }),
  percentilePosition: z.number().min(0).max(100).describe("Position du deal dans la distribution"),
  assessment: z.enum(["exceptional", "above_average", "average", "below_average", "critical"]),
  insight: z.string().describe("Pourquoi c'est important pour un SaaS à ce stade"),
  comparedToDb: z.object({
    similarDealsMedian: z.union([z.number(), z.null()]),
    dealsAbove: z.number().describe("Nombre de deals similaires au-dessus"),
    dealsBelow: z.number().describe("Nombre de deals similaires en-dessous"),
  }).optional(),
});

const SaaSRedFlagSchema = z.object({
  flag: z.string().describe("Description claire du red flag"),
  severity: z.enum(["critical", "major", "minor"]),
  evidence: z.string().describe("Preuve concrète (chiffre, source, citation)"),
  impact: z.string().describe("Impact business si ce risque se matérialise"),
  questionToAsk: z.string().describe("Question précise à poser au fondateur"),
  benchmarkViolation: z.string().optional().describe("Quel seuil benchmark est violé"),
});

const SaaSGreenFlagSchema = z.object({
  flag: z.string(),
  strength: z.enum(["strong", "moderate"]),
  evidence: z.string(),
  implication: z.string().describe("Ce que ça signifie pour l'investissement"),
});

const SaaSUnitEconomicsSchema = z.object({
  ltv: z.object({
    value: z.union([z.number(), z.null()]),
    calculation: z.string().describe("Formule utilisée avec les valeurs"),
    confidence: z.enum(["high", "medium", "low"]),
  }),
  cac: z.object({
    value: z.union([z.number(), z.null()]),
    calculation: z.string(),
    confidence: z.enum(["high", "medium", "low"]),
  }),
  ltvCacRatio: z.object({
    value: z.union([z.number(), z.null()]),
    assessment: z.string(),
    vsMedian: z.string().describe("Comparaison au median SaaS"),
  }),
  cacPaybackMonths: z.object({
    value: z.union([z.number(), z.null()]),
    assessment: z.string(),
    runway: z.string().describe("Combien de paybacks avant le prochain round"),
  }),
  burnMultiple: z.object({
    value: z.union([z.number(), z.null()]),
    assessment: z.string(),
  }),
  magicNumber: z.object({
    value: z.union([z.number(), z.null()]),
    assessment: z.string(),
  }),
});

const SaaSOutputSchema = z.object({
  // Identification
  sectorConfidence: z.number().min(0).max(100).describe("Confiance que c'est bien du SaaS B2B"),
  subSector: z.string().describe("Sous-catégorie: Horizontal SaaS, Vertical SaaS, Infrastructure, etc."),
  businessModel: z.enum(["pure_saas", "saas_plus_services", "usage_based", "hybrid", "unclear"]),

  // Métriques primaires avec benchmark
  primaryMetrics: z.array(SaaSMetricEvaluationSchema).describe("Les 5-6 KPIs critiques SaaS"),

  // Métriques secondaires
  secondaryMetrics: z.array(SaaSMetricEvaluationSchema).describe("Métriques de support"),

  // Unit Economics détaillés
  unitEconomics: SaaSUnitEconomicsSchema,

  // Red Flags sectoriels
  redFlags: z.array(SaaSRedFlagSchema),

  // Green Flags sectoriels
  greenFlags: z.array(SaaSGreenFlagSchema),

  // Cohort Analysis (si données disponibles)
  cohortHealth: z.object({
    dataAvailable: z.boolean(),
    nrrTrend: z.enum(["improving", "stable", "declining", "unknown"]),
    churnTrend: z.enum(["improving", "stable", "worsening", "unknown"]),
    expansionTrend: z.enum(["accelerating", "stable", "decelerating", "unknown"]),
    concern: z.string().optional(),
  }),

  // GTM Efficiency
  gtmAssessment: z.object({
    model: z.enum(["sales_led", "product_led", "hybrid", "unclear"]),
    efficiency: z.enum(["efficient", "acceptable", "inefficient", "unknown"]),
    salesCycleMonths: z.union([z.number(), z.null()]),
    keyInsight: z.string(),
  }),

  // Competitive Moat SaaS-specific
  saasCompetitiveMoat: z.object({
    dataNetworkEffects: z.boolean(),
    switchingCostLevel: z.enum(["high", "medium", "low"]),
    integrationDepth: z.enum(["deep", "medium", "shallow", "unknown"]),
    categoryLeaderPotential: z.boolean(),
    moatAssessment: z.string(),
  }),

  // Valorisation vs Benchmarks SaaS
  valuationAnalysis: z.object({
    askMultiple: z.number().describe("Multiple ARR demandé"),
    medianSectorMultiple: z.number(),
    percentilePosition: z.number(),
    justifiedRange: z.object({
      low: z.number(),
      fair: z.number(),
      high: z.number(),
    }),
    verdict: z.enum(["attractive", "fair", "stretched", "excessive"]),
    negotiationLeverage: z.string().describe("Arguments pour négocier"),
  }),

  // Comparaison aux deals similaires de la DB
  dbComparison: z.object({
    similarDealsFound: z.number(),
    thisDealsPosition: z.string().describe("Où se situe ce deal vs la DB"),
    bestComparable: z.object({
      name: z.string(),
      similarity: z.string(),
      outcome: z.string(),
    }).optional(),
    concerningComparable: z.object({
      name: z.string(),
      similarity: z.string(),
      whatHappened: z.string(),
    }).optional(),
  }),

  // Questions spécifiques SaaS à poser
  sectorQuestions: z.array(z.object({
    question: z.string(),
    category: z.enum(["unit_economics", "retention", "gtm", "product", "competition"]),
    priority: z.enum(["must_ask", "should_ask", "nice_to_have"]),
    why: z.string().describe("Pourquoi cette question est importante"),
    greenFlagAnswer: z.string(),
    redFlagAnswer: z.string(),
  })),

  // Exit potential
  exitPotential: z.object({
    typicalMultiple: z.number(),
    likelyAcquirers: z.array(z.string()),
    timeToExit: z.string(),
    exitReadiness: z.enum(["ready", "needs_work", "far"]),
  }),

  // Score et Synthèse
  sectorScore: z.number().min(0).max(100),
  scoreBreakdown: z.object({
    unitEconomics: z.number().min(0).max(25),
    growth: z.number().min(0).max(25),
    retention: z.number().min(0).max(25),
    gtmEfficiency: z.number().min(0).max(25),
  }),

  executiveSummary: z.string().describe("3-4 phrases: verdict SaaS, métriques clés, principal risque, potentiel"),

  investmentImplication: z.enum([
    "strong_saas_fundamentals",
    "solid_with_concerns",
    "needs_improvement",
    "saas_model_broken"
  ]),

  // DB Cross-Reference (obligatoire si donnees DB disponibles)
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

  // Data completeness assessment
  dataCompleteness: z.object({
    level: z.enum(["complete", "partial", "minimal"]),
    availableDataPoints: z.number(), expectedDataPoints: z.number(),
    missingCritical: z.array(z.string()), limitations: z.array(z.string()),
  }),
});

export type SaaSExpertOutput = z.infer<typeof SaaSOutputSchema>;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Retourne les standards et benchmarks pour le prompt
 * Utilise le nouveau systeme: standards etablis + indication de rechercher les donnees dynamiques
 */
function formatBenchmarksForPrompt(stage: string): string {
  return getStandardsOnlyInjection("SaaS", stage);
}

function formatFundingDbContext(context: EnrichedAgentContext): string {
  const similar = context.fundingDbContext?.similarDeals || [];
  const benchmarks = context.fundingDbContext?.benchmarks;
  const competitors = context.fundingDbContext?.potentialCompetitors || [];

  if (similar.length === 0 && !benchmarks) {
    return "**Funding DB**: Pas de données disponibles pour cross-reference.";
  }

  let output = "\n## DONNÉES FUNDING DATABASE (Cross-Reference Obligatoire)\n";

  if (similar.length > 0) {
    output += `\n### Deals SaaS Similaires (${similar.length} trouvés)\n`;
    output += similar.slice(0, 10).map((d: Record<string, unknown>) =>
      `- **${d.name}**: ${d.amount ? `${d.amount}€` : "N/A"} @ ${d.valuation ? `${d.valuation}€ valo` : "N/A"} (${d.stage || "?"}) - ${d.status || "?"}`
    ).join("\n");
  }

  if (benchmarks) {
    output += `\n\n### Benchmarks DB (deals récents même secteur/stage)
- Valorisation médiane: ${benchmarks.valuationMedian || "N/A"}€
- Multiple ARR médian: ${benchmarks.arrMultipleMedian || "N/A"}x
- Croissance médiane: ${benchmarks.growthMedian || "N/A"}%`;
  }

  if (competitors.length > 0) {
    output += `\n\n### Concurrents Potentiels Détectés (DB)
${competitors.slice(0, 5).map((c: Record<string, unknown>) =>
  `- **${c.name}**: ${c.totalRaised ? `${c.totalRaised}€ levés` : ""} ${c.lastRound ? `(dernier round: ${c.lastRound})` : ""}`
).join("\n")}

**IMPORTANT**: Vérifier si ces concurrents sont mentionnés dans le deck. S'ils ne le sont pas → RED FLAG potentiel.`;
  }

  return output;
}

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

function buildSystemPrompt(stage: string): string {
  return `Tu es un EXPERT SAAS B2B avec 15 ans d'expérience en Due Diligence pour des fonds Tier 1 (Bessemer, ICONIQ, Insight).

## TON PROFIL
- Tu as analysé 500+ SaaS B2B du Seed au Growth
- Tu connais les benchmarks par cœur (OpenView, Bessemer Cloud Index, SaaS Capital)
- Tu repères les "vanity metrics" vs les "real metrics" instantanément
- Tu sais qu'un NRR de 95% n'est PAS la même chose qu'un NRR de 130%
- Tu as vu des SaaS échouer malgré une belle croissance (unit economics cassés)
- Tu as vu des SaaS réussir avec une croissance modérée (fondamentaux solides)

## TA MISSION
Analyser ce deal SaaS à travers le prisme sectoriel spécifique, en:
1. **Extrayant et vérifiant** chaque métrique SaaS clé
2. **Comparant aux benchmarks** fournis ci-dessous
3. **Cross-référençant** avec la Funding Database
4. **Identifiant** les red flags spécifiques SaaS
5. **Évaluant** les unit economics avec rigueur
6. **Produisant** une analyse actionnable pour un Business Angel

## RÈGLES ABSOLUES

### Sur les métriques
- JAMAIS accepter un chiffre sans comprendre sa définition exacte
- NRR/NDR: Quelle cohorte? Sur quelle période? Inclut-il les downgrades?
- ARR: Est-ce vraiment récurrent ou y a-t-il du one-shot caché?
- Gross Margin: Inclut-il le support? Le customer success? Les coûts d'infra?
- CAC: Fully loaded ou juste les dépenses marketing?

### Sur les red flags
- Chaque red flag DOIT avoir: sévérité + preuve + impact + question
- Pas de red flags génériques type "le marché est concurrentiel"
- Si un benchmark est violé → c'est un red flag avec le seuil cité

### Sur les calculs
- MONTRE tes calculs, pas juste les résultats
- Si une donnée manque pour un calcul → dis-le explicitement
- LTV = ARPA × Gross Margin × (1 / Churn Rate annuel)
- CAC Payback = CAC / (ARPA × Gross Margin) en mois
- Burn Multiple = Net Burn / Net New ARR

### Sur la DB
- Cross-référence OBLIGATOIRE avec les deals similaires
- Compare les métriques de ce deal aux percentiles de la DB
- Identifie les concurrents dans la DB qui ne sont pas mentionnés dans le deck

${formatBenchmarksForPrompt(stage)}

## SCORING (0-100)
Le score sectoriel SaaS est la SOMME de:
- **Unit Economics (0-25)**: LTV/CAC ≥3x, CAC Payback ≤18 mois, Burn Multiple ≤2x
- **Growth (0-25)**: ARR Growth vs benchmark stage, Magic Number
- **Retention (0-25)**: NRR, Logo Churn, Quick Ratio
- **GTM Efficiency (0-25)**: Sales efficiency, CAC trend, organic vs paid

Chaque dimension:
- 20-25: Exceptionnel (Top 10%)
- 15-19: Bon (P50-P75)
- 10-14: Acceptable (P25-P50)
- 5-9: Concernant (< P25)
- 0-4: Red flag majeur`;
}

// ============================================================================
// USER PROMPT
// ============================================================================

function buildUserPrompt(context: EnrichedAgentContext): string {
  const deal = context.deal;
  const stage = deal.stage || "SEED";
  const previousResults = context.previousResults || {};

  // ── Selective Tier 1 insights (not raw dump) ──
  let tier1Insights = "";
  if (previousResults) {
    const financialAudit = previousResults["financial-auditor"] as { success?: boolean; data?: { findings?: unknown; narrative?: { keyInsights?: string[] } } } | undefined;
    if (financialAudit?.success && financialAudit.data) {
      tier1Insights += `\n### Financial Auditor Findings:\n`;
      if (financialAudit.data.narrative?.keyInsights) tier1Insights += financialAudit.data.narrative.keyInsights.join("\n- ");
      if (financialAudit.data.findings) tier1Insights += `\nFindings: ${JSON.stringify(financialAudit.data.findings, null, 2).slice(0, 2000)}...`;
    }
    const competitiveIntel = previousResults["competitive-intel"] as { success?: boolean; data?: { findings?: { competitors?: unknown[] }; narrative?: { keyInsights?: string[] } } } | undefined;
    if (competitiveIntel?.success && competitiveIntel.data) {
      tier1Insights += `\n### Competitive Intel Findings:\n`;
      if (competitiveIntel.data.narrative?.keyInsights) tier1Insights += competitiveIntel.data.narrative.keyInsights.join("\n- ");
      if (competitiveIntel.data.findings?.competitors) tier1Insights += `\nCompetitors: ${(competitiveIntel.data.findings.competitors as { name: string }[]).slice(0, 5).map(c => c.name).join(", ")}`;
    }
    const legalRegulatory = previousResults["legal-regulatory"] as { success?: boolean; data?: { findings?: { compliance?: unknown[]; regulatoryRisks?: unknown[] } } } | undefined;
    if (legalRegulatory?.success && legalRegulatory.data) {
      tier1Insights += `\n### Legal & Regulatory Findings:\n`;
      if (legalRegulatory.data.findings?.compliance) tier1Insights += `Compliance: ${JSON.stringify(legalRegulatory.data.findings.compliance, null, 2).slice(0, 1500)}`;
      if (legalRegulatory.data.findings?.regulatoryRisks) tier1Insights += `\nRisks: ${JSON.stringify(legalRegulatory.data.findings.regulatoryRisks, null, 2).slice(0, 1000)}`;
    }
    const extractor = previousResults["document-extractor"] as { success?: boolean; data?: { extractedInfo?: Record<string, unknown> } } | undefined;
    if (extractor?.success && extractor.data?.extractedInfo) tier1Insights += `\n### Extracted Deal Data:\n${JSON.stringify(extractor.data.extractedInfo, null, 2).slice(0, 2000)}`;
  }

  // ── Funding DB prompt section ──
  let fundingDbData = "";
  const contextEngineAny = context.contextEngine as Record<string, unknown> | undefined;
  const fundingDb = contextEngineAny?.fundingDb as { competitors?: unknown; valuationBenchmark?: unknown; sectorTrend?: unknown } | undefined;
  if (fundingDb) {
    fundingDbData = `\n## FUNDING DATABASE - CROSS-REFERENCE OBLIGATOIRE\n\nTu DOIS produire un champ "dbCrossReference" dans ton output.\n\n### Concurrents detectes dans la DB\n${fundingDb.competitors ? JSON.stringify(fundingDb.competitors, null, 2).slice(0, 3000) : "Aucun"}\n\n### Benchmark valorisation\n${fundingDb.valuationBenchmark ? JSON.stringify(fundingDb.valuationBenchmark, null, 2) : "N/A"}\n\n### Tendance funding\n${fundingDb.sectorTrend ? JSON.stringify(fundingDb.sectorTrend, null, 2) : "N/A"}\n\nINSTRUCTIONS DB:\n1. Claims deck verifie vs donnees\n2. Concurrents DB absents du deck = RED FLAG CRITICAL\n3. Valo vs percentiles (P25/median/P75)\n4. pas de concurrent + DB en trouve = RED FLAG CRITICAL`;
  }

  return `
## DEAL À ANALYSER

**Company**: ${deal.companyName || deal.name}
**Sector déclaré**: ${deal.sector || "SaaS"}
**Stage**: ${stage}
**Géographie**: ${deal.geography || "Unknown"}
**Valorisation demandée**: ${deal.valuationPre ? `${Number(deal.valuationPre)}€` : "Non spécifiée"}
**Montant du round**: ${deal.amountRequested ? `${Number(deal.amountRequested)}€` : "Non spécifié"}
**ARR déclaré**: ${deal.arr ? `${deal.arr}€` : "Non spécifié"}
**ARR déclaré**: ${deal.arr ? `${Number(deal.arr)}€` : "Non spécifié"}
**Croissance déclarée**: ${deal.growthRate ? `${deal.growthRate}%` : "Non spécifiée"}

${formatFundingDbContext(context)}

${context.factStoreFormatted ? `
## DONNÉES VÉRIFIÉES (Fact Store)

Les données ci-dessous ont été extraites et vérifiées à partir des documents du deal.
Base ton analyse sur ces faits. Si un fait important manque, signale-le.

${context.factStoreFormatted}
` : ""}

## ANALYSES TIER 1 (À Exploiter)
${tier1Insights || "Pas d'analyses Tier 1 disponibles"}

${fundingDbData}

## TES TÂCHES

### 1. VALIDATION BUSINESS MODEL
- Confirme que c'est bien du SaaS B2B (vs SaaS B2C, vs services, vs usage-based pur)
- Identifie le sous-secteur (Horizontal, Vertical, Infrastructure, API-first)
- Note la confiance dans cette classification

### 2. EXTRACTION & ÉVALUATION MÉTRIQUES
Pour chaque métrique primaire (NRR, ARR Growth, Gross Margin, CAC Payback, LTV/CAC):
a) Extrais la valeur du deck/data room (cite la source)
b) Compare au benchmark du stage ${stage}
c) Calcule la position percentile
d) Donne l'assessment (exceptional → critical)
e) Compare aux deals similaires de la DB si disponible

### 3. UNIT ECONOMICS PROFONDS
- Calcule LTV avec la formule exacte (montre le calcul)
- Calcule CAC fully loaded si possible
- Calcule LTV/CAC ratio et compare au median 3.5x
- Calcule CAC Payback en mois et compare aux 12 mois benchmark
- Calcule Burn Multiple si données disponibles
- Calcule Magic Number si données S&M disponibles

### 4. RED FLAGS SAAS
Pour chaque red flag:
- Sévérité: critical / major / minor
- Preuve: le chiffre exact ou l'observation
- Impact: ce qui arrive si ça se matérialise
- Question: ce qu'il faut demander au fondateur
- Benchmark violé: si applicable

Vérifie au minimum:
- NRR < 90% → CRITICAL
- CAC Payback > 24 mois → CRITICAL
- Gross Margin < 60% → MAJOR
- Burn Multiple > 3x → MAJOR
- Concurrents DB non mentionnés dans deck → MAJOR

### 5. VALORISATION VS BENCHMARKS
- Calcule le multiple ARR demandé
- Compare aux multiples de marche actuels (rechercher "SaaS exit multiples ${new Date().getFullYear()}")
- Donne une range fair value
- Identifie les arguments de négociation

### 6. QUESTIONS MUST-ASK
5-7 questions spécifiques SaaS avec:
- La question exacte
- Pourquoi elle est importante
- Ce qu'une bonne réponse ressemble
- Ce qui serait un red flag

### 7. SCORE ET SYNTHÈSE
- Score /100 avec breakdown par dimension
- Executive Summary: 3-4 phrases max, actionnable
- Implication pour l'investissement

IMPORTANT: Sois spécifique. Pas de généralités. Chaque affirmation doit être sourcée ou calculée.`;
}

// ============================================================================
// HELPER: Transform output to SectorExpertData
// ============================================================================

function transformOutput(raw: SaaSExpertOutput, cappedScore: number, cappedFitScore: number): SectorExpertData {
    // Transformer vers le format SectorExpertData attendu
    return {
      sectorName: "SaaS B2B",
      sectorMaturity: "growing",

      keyMetrics: [
        ...raw.primaryMetrics.map(m => ({
          metricName: m.metricName,
          value: m.dealValue,
          sectorBenchmark: m.benchmark,
          assessment: m.assessment === "critical" ? "concerning" as const : m.assessment,
          sectorContext: m.insight,
        })),
        ...raw.secondaryMetrics.map(m => ({
          metricName: m.metricName,
          value: m.dealValue,
          sectorBenchmark: m.benchmark,
          assessment: m.assessment === "critical" ? "concerning" as const : m.assessment,
          sectorContext: m.insight,
        })),
      ],

      sectorRedFlags: raw.redFlags.map(rf => ({
        flag: rf.flag,
        severity: rf.severity,
        sectorReason: `${rf.evidence}. Impact: ${rf.impact}. Question: ${rf.questionToAsk}`,
      })),

      sectorOpportunities: raw.greenFlags.map(gf => ({
        opportunity: gf.flag,
        potential: gf.strength === "strong" ? "high" as const : "medium" as const,
        reasoning: `${gf.evidence}. ${gf.implication}`,
      })),

      regulatoryEnvironment: {
        complexity: "medium",
        keyRegulations: ["GDPR", "SOC 2 Type II", "ISO 27001"],
        complianceRisks: [],
        upcomingChanges: [],
      },

      sectorDynamics: {
        competitionIntensity: "high",
        consolidationTrend: "consolidating",
        barrierToEntry: raw.saasCompetitiveMoat.switchingCostLevel === "high" ? "high" : "medium",
        typicalExitMultiple: raw.exitPotential.typicalMultiple,
        // Exits recents: doivent venir de la recherche web, pas de donnees hardcodees
        recentExits: [],
      },

      sectorQuestions: raw.sectorQuestions.map(q => ({
        question: q.question,
        category: q.category === "unit_economics" || q.category === "retention" ? "business" as const :
                  q.category === "gtm" ? "business" as const :
                  q.category === "product" ? "technical" as const : "competitive" as const,
        priority: q.priority,
        expectedAnswer: q.greenFlagAnswer,
        redFlagAnswer: q.redFlagAnswer,
      })),

      sectorFit: {
        score: cappedFitScore,
        strengths: raw.greenFlags.map(gf => gf.flag),
        weaknesses: raw.redFlags.map(rf => rf.flag),
        sectorTiming: "optimal",
      },

      sectorScore: cappedScore,
      executiveSummary: raw.executiveSummary,
    };
  }

// ============================================================================
// DEFAULT DATA
// ============================================================================

function getDefaultData(): SectorExpertData {
  return {
    sectorName: "SaaS B2B",
    sectorMaturity: "growing",
    keyMetrics: [],
    sectorRedFlags: [{
      flag: "Analyse incomplète",
      severity: "major",
      sectorReason: "L'analyse SaaS n'a pas pu être complétée",
    }],
    sectorOpportunities: [],
    regulatoryEnvironment: {
      complexity: "medium",
      keyRegulations: [],
      complianceRisks: ["Analyse incomplète"],
      upcomingChanges: [],
    },
    sectorDynamics: {
      competitionIntensity: "medium",
      consolidationTrend: "stable",
      barrierToEntry: "medium",
      typicalExitMultiple: 8, // Placeholder - les multiples actuels doivent venir de recherche web
      recentExits: [],
    },
    sectorQuestions: [],
    sectorFit: {
      score: 0,
      strengths: [],
      weaknesses: ["Analyse incomplète"],
      sectorTiming: "optimal",
    },
    sectorScore: 0,
    executiveSummary: "L'analyse sectorielle SaaS n'a pas pu être complétée.",
  };
}

// ============================================================================
// SAAS EXPERT AGENT (Object-based like fintechExpert)
// ============================================================================

export const saasExpert = {
  name: "saas-expert" as SectorExpertType,

  async run(context: EnrichedAgentContext): Promise<SectorExpertResult> {
    const startTime = Date.now();

    try {
      const stage = context.deal.stage || "SEED";
      const systemPromptText = buildSystemPrompt(stage);
      const userPromptText = buildUserPrompt(context);

      setAgentContext("saas-expert");

      const response = await complete(userPromptText, {
        systemPrompt: systemPromptText,
        complexity: "complex",
        temperature: 0.3,
      });

      // Parse and validate response
      let parsedOutput: SaaSExpertOutput;
      try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("No JSON found in response");
        }
        const rawJson = JSON.parse(jsonMatch[0]);
        const parseResult = SaaSOutputSchema.safeParse(rawJson);
        if (parseResult.success) {
          parsedOutput = parseResult.data;
        } else {
          console.warn(`[saas-expert] Strict parse failed (${parseResult.error.issues.length} issues), using raw JSON with defaults`);
          parsedOutput = rawJson as SaaSExpertOutput;
        }
      } catch (parseError) {
        console.error("[saas-expert] Parse error:", parseError);
        return {
          agentName: "saas-expert",
          success: false,
          executionTimeMs: Date.now() - startTime,
          cost: response.cost ?? 0,
          error: `Failed to parse LLM response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
          data: getDefaultData(),
        };
      }

      // ── Data completeness assessment & score capping ──
      const completenessData = parsedOutput.dataCompleteness ?? {
        level: "partial" as const, availableDataPoints: 0, expectedDataPoints: 0, missingCritical: [], limitations: [],
      };
      const availableMetrics = (parsedOutput.primaryMetrics ?? []).filter((m: { dealValue: unknown }) => m.dealValue !== null).length;
      const totalMetrics = (parsedOutput.primaryMetrics ?? []).length;
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
      const rawScore = parsedOutput.sectorScore ?? 0;
      const cappedScore = Math.min(rawScore, scoreMax);
      const rawFitScore = parsedOutput.sectorScore ?? 0;
      const cappedFitScore = Math.min(rawFitScore, scoreMax);
      const limitations: string[] = [
        ...(completenessData.limitations ?? []),
        ...(completenessData.missingCritical ?? []).map((m: string) => `Missing critical data: ${m}`),
      ];
      if (cappedScore < rawScore) {
        limitations.push(`Score capped from ${rawScore} to ${cappedScore} due to ${completenessLevel} data completeness`);
      }

      // Transform to SectorExpertData format
      const sectorData = transformOutput(parsedOutput, cappedScore, cappedFitScore);

      return {
        agentName: "saas-expert",
        success: true,
        executionTimeMs: Date.now() - startTime,
        cost: response.cost ?? 0,
        data: sectorData,
        // Include extended data for detailed display
        _extended: {
          subSector: {
            primary: parsedOutput.subSector,
            rationale: `Business model: ${parsedOutput.businessModel}`,
          },
          unitEconomics: {
            ltv: parsedOutput.unitEconomics.ltv,
            cac: parsedOutput.unitEconomics.cac,
            ltvCacRatio: parsedOutput.unitEconomics.ltvCacRatio,
            cacPaybackMonths: parsedOutput.unitEconomics.cacPaybackMonths,
            burnMultiple: parsedOutput.unitEconomics.burnMultiple,
            magicNumber: parsedOutput.unitEconomics.magicNumber,
          },
          valuationAnalysis: parsedOutput.valuationAnalysis,
          dbComparison: parsedOutput.dbComparison,
          scoreBreakdown: parsedOutput.scoreBreakdown,
          gtmAssessment: parsedOutput.gtmAssessment,
          cohortHealth: parsedOutput.cohortHealth,
          saasCompetitiveMoat: parsedOutput.saasCompetitiveMoat,
          exitPotential: parsedOutput.exitPotential,
          investmentImplication: parsedOutput.investmentImplication,
          dbCrossReference: parsedOutput.dbCrossReference,
          dataCompleteness: {
            level: completenessLevel as "complete" | "partial" | "minimal",
            availableDataPoints: parsedOutput.dataCompleteness?.availableDataPoints ?? 0,
            expectedDataPoints: parsedOutput.dataCompleteness?.expectedDataPoints ?? 0,
            missingCritical: parsedOutput.dataCompleteness?.missingCritical ?? [],
            limitations,
            scoreCapped: cappedScore < rawScore,
            rawScore,
            cappedScore,
          },
        },
      };

    } catch (error) {
      console.error("[saas-expert] Execution error:", error);
      return {
        agentName: "saas-expert",
        success: false,
        executionTimeMs: Date.now() - startTime,
        cost: 0,
        error: error instanceof Error ? error.message : "Unknown error",
        data: getDefaultData(),
      };
    }
  },
};
