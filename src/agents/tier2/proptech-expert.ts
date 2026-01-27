/**
 * PropTech Expert Agent - Tier 2
 *
 * Expert sectoriel Real Estate Tech / Construction Tech avec analyse qualité Big4 + instinct Partner VC.
 *
 * Mission: Évaluer le deal à travers le prisme spécifique PropTech
 * en cross-référençant avec les benchmarks sectoriels et la Funding Database.
 *
 * Segments couverts:
 * - Real Estate Marketplaces (portails, lead gen)
 * - iBuying / Instant Buying (Opendoor model)
 * - Property Management SaaS
 * - Construction Tech (project management, BIM)
 * - Mortgage Tech / Lending
 * - Commercial Real Estate (CRE) Tech
 * - Co-working / Flex Space
 * - Smart Building / PropTech IoT
 *
 * Standards:
 * - Chaque métrique comparée aux percentiles sectoriels
 * - Cross-reference obligatoire avec deals similaires de la DB
 * - Red flags avec sévérité + preuve + impact + question
 * - Output actionnable pour un Business Angel
 *
 * IMPORTANT: PropTech est TRÈS sensible au cycle immobilier.
 * Une analyse PropTech sans considération du cycle est incomplète.
 */

import { z } from "zod";
import type { EnrichedAgentContext } from "../types";
import type { SectorExpertData, SectorExpertResult, SectorExpertType } from "./types";
import { getStandardsOnlyInjection } from "./benchmark-injector";
import { complete, setAgentContext } from "@/services/openrouter/router";

// ============================================================================
// OUTPUT SCHEMA - PropTech Specific
// ============================================================================

const PropTechMetricEvaluationSchema = z.object({
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
  insight: z.string().describe("Pourquoi c'est important pour un PropTech à ce stade"),
  comparedToDb: z.object({
    similarDealsMedian: z.union([z.number(), z.null()]),
    dealsAbove: z.number().describe("Nombre de deals similaires au-dessus"),
    dealsBelow: z.number().describe("Nombre de deals similaires en-dessous"),
  }).optional(),
});

const PropTechRedFlagSchema = z.object({
  flag: z.string().describe("Description claire du red flag"),
  severity: z.enum(["critical", "major", "minor"]),
  evidence: z.string().describe("Preuve concrète (chiffre, source, citation)"),
  impact: z.string().describe("Impact business si ce risque se matérialise"),
  questionToAsk: z.string().describe("Question précise à poser au fondateur"),
  benchmarkViolation: z.string().optional().describe("Quel seuil benchmark est violé"),
});

const PropTechGreenFlagSchema = z.object({
  flag: z.string(),
  strength: z.enum(["strong", "moderate"]),
  evidence: z.string(),
  implication: z.string().describe("Ce que ça signifie pour l'investissement"),
});

// PropTech-specific unit economics by segment
const PropTechUnitEconomicsSchema = z.object({
  // General PropTech metrics
  grossMargin: z.object({
    value: z.union([z.number(), z.null()]),
    calculation: z.string(),
    assessment: z.string(),
    segmentContext: z.string().describe("Contexte selon le segment (SaaS vs iBuying vs Marketplace)"),
  }),

  // For SaaS-like models (Property Management, Construction Tech)
  saasMetrics: z.object({
    arr: z.union([z.number(), z.null()]),
    nrr: z.union([z.number(), z.null()]),
    ltv: z.union([z.number(), z.null()]),
    cac: z.union([z.number(), z.null()]),
    ltvCacRatio: z.union([z.number(), z.null()]),
    cacPaybackMonths: z.union([z.number(), z.null()]),
    applicable: z.boolean(),
    assessment: z.string().optional(),
  }),

  // For Marketplace/Portal models
  marketplaceMetrics: z.object({
    gmv: z.union([z.number(), z.null()]),
    takeRate: z.union([z.number(), z.null()]),
    revenuePerLead: z.union([z.number(), z.null()]),
    leadConversionRate: z.union([z.number(), z.null()]),
    applicable: z.boolean(),
    assessment: z.string().optional(),
  }),

  // For iBuying/Inventory models
  iBuyingMetrics: z.object({
    inventoryTurnoverDays: z.union([z.number(), z.null()]),
    grossMarginPerHome: z.union([z.number(), z.null()]),
    holdingCostPerDay: z.union([z.number(), z.null()]),
    serviceMargin: z.union([z.number(), z.null()]),
    applicable: z.boolean(),
    assessment: z.string().optional(),
  }),

  // For Co-working/Flex Space
  flexSpaceMetrics: z.object({
    occupancyRate: z.union([z.number(), z.null()]),
    breakEvenOccupancy: z.union([z.number(), z.null()]),
    revenuePerDesk: z.union([z.number(), z.null()]),
    memberChurnMonthly: z.union([z.number(), z.null()]),
    applicable: z.boolean(),
    assessment: z.string().optional(),
  }),

  // For Mortgage Tech
  mortgageMetrics: z.object({
    loanVolume: z.union([z.number(), z.null()]),
    revenuePerLoan: z.union([z.number(), z.null()]),
    costPerLoanOriginated: z.union([z.number(), z.null()]),
    pullThroughRate: z.union([z.number(), z.null()]),
    daysToClose: z.union([z.number(), z.null()]),
    applicable: z.boolean(),
    assessment: z.string().optional(),
  }),

  overallHealthScore: z.number().min(0).max(100),
  verdict: z.string(),
});

const PropTechOutputSchema = z.object({
  // Identification du segment
  sectorConfidence: z.number().min(0).max(100).describe("Confiance que c'est bien du PropTech"),
  primarySegment: z.enum([
    "real_estate_marketplace",
    "ibuying",
    "property_management_saas",
    "construction_tech",
    "mortgage_tech",
    "cre_tech",
    "coworking_flex",
    "smart_building_iot",
    "other_proptech"
  ]),
  secondarySegments: z.array(z.string()).describe("Segments secondaires si applicable"),
  businessModel: z.enum(["saas", "marketplace", "inventory_based", "hybrid", "services", "unclear"]),

  // Métriques primaires avec benchmark
  primaryMetrics: z.array(PropTechMetricEvaluationSchema).describe("Les 5-6 KPIs critiques pour ce segment PropTech"),

  // Métriques secondaires
  secondaryMetrics: z.array(PropTechMetricEvaluationSchema).describe("Métriques de support"),

  // Unit Economics détaillés (segment-specific)
  unitEconomics: PropTechUnitEconomicsSchema,

  // Red Flags sectoriels
  redFlags: z.array(PropTechRedFlagSchema),

  // Green Flags sectoriels
  greenFlags: z.array(PropTechGreenFlagSchema),

  // Cycle Analysis (CRITICAL for PropTech)
  cycleAnalysis: z.object({
    currentCyclePhase: z.enum(["expansion", "peak", "contraction", "trough", "unknown"]),
    interestRateSensitivity: z.enum(["very_high", "high", "medium", "low"]),
    cycleRiskAssessment: z.string().describe("Comment le cycle actuel impacte ce deal"),
    worstCaseScenario: z.string().describe("Que se passe-t-il si les taux montent de 200bp ou crash immo"),
    resilienceScore: z.number().min(0).max(100).describe("Résilience au downturn"),
    hedgingStrategy: z.string().optional().describe("Comment le business se protège du cycle"),
  }),

  // Geographic Analysis (PropTech is very local)
  geographicAnalysis: z.object({
    primaryMarkets: z.array(z.string()),
    marketConcentrationRisk: z.enum(["low", "medium", "high", "critical"]),
    expansionPath: z.string(),
    localRegulationRisk: z.enum(["low", "medium", "high", "very_high"]),
    keyRegulations: z.array(z.string()).describe("Régulations locales importantes"),
  }),

  // Capital Intensity Assessment
  capitalIntensity: z.object({
    level: z.enum(["low", "medium", "high", "very_high"]),
    workingCapitalNeed: z.string(),
    inventoryRisk: z.enum(["none", "low", "medium", "high", "critical"]),
    breakEvenTimeline: z.string(),
    fundingRequirements: z.string().describe("Besoins de financement sur 24 mois"),
  }),

  // Competitive Moat PropTech-specific
  propTechMoat: z.object({
    dataAdvantage: z.enum(["strong", "moderate", "weak", "none"]),
    networkEffects: z.enum(["strong", "moderate", "weak", "none"]),
    regulatoryMoat: z.enum(["strong", "moderate", "weak", "none"]).describe("Licenses, compliance barriers"),
    localLockIn: z.enum(["strong", "moderate", "weak", "none"]),
    integrationDepth: z.enum(["deep", "medium", "shallow", "none"]),
    moatAssessment: z.string(),
  }),

  // Valorisation vs Benchmarks PropTech
  valuationAnalysis: z.object({
    askMultiple: z.number().describe("Multiple demandé (ARR pour SaaS, GMV pour marketplace)"),
    multipleType: z.string().describe("Type de multiple utilisé (ARR, GMV, Revenue)"),
    medianSectorMultiple: z.number(),
    percentilePosition: z.number(),
    justifiedRange: z.object({
      low: z.number(),
      fair: z.number(),
      high: z.number(),
    }),
    verdict: z.enum(["attractive", "fair", "stretched", "excessive"]),
    cycleAdjustment: z.string().describe("Ajustement pour le cycle immobilier actuel"),
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
    failedPropTechPattern: z.string().optional().describe("Pattern d'échec PropTech similaire à éviter"),
  }),

  // Questions spécifiques PropTech à poser
  sectorQuestions: z.array(z.object({
    question: z.string(),
    category: z.enum(["unit_economics", "cycle_resilience", "regulatory", "geographic", "competition", "capital"]),
    priority: z.enum(["must_ask", "should_ask", "nice_to_have"]),
    why: z.string().describe("Pourquoi cette question est importante en PropTech"),
    greenFlagAnswer: z.string(),
    redFlagAnswer: z.string(),
  })),

  // Exit potential PropTech
  exitPotential: z.object({
    typicalMultiple: z.number(),
    exitPath: z.enum(["strategic_acquisition", "pe_rollup", "ipo", "unclear"]),
    likelyAcquirers: z.array(z.string()),
    timeToExit: z.string(),
    exitReadiness: z.enum(["ready", "needs_work", "far"]),
    recentComparableExits: z.array(z.object({
      company: z.string(),
      acquirer: z.string(),
      multiple: z.number(),
      year: z.number(),
    })).optional(),
  }),

  // Score et Synthèse
  sectorScore: z.number().min(0).max(100),
  scoreBreakdown: z.object({
    unitEconomics: z.number().min(0).max(20),
    cycleResilience: z.number().min(0).max(20),
    moatStrength: z.number().min(0).max(20),
    growthPotential: z.number().min(0).max(20),
    executionRisk: z.number().min(0).max(20),
  }),

  executiveSummary: z.string().describe("3-4 phrases: verdict PropTech, segment, métriques clés, risque cycle, potentiel"),

  investmentImplication: z.enum([
    "strong_proptech_fundamentals",
    "solid_with_cycle_risk",
    "high_risk_high_reward",
    "needs_improvement",
    "proptech_model_broken"
  ]),
});

export type PropTechExpertOutput = z.infer<typeof PropTechOutputSchema>;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatFundingDbContext(context: EnrichedAgentContext): string {
  const similar = context.fundingDbContext?.similarDeals || [];
  const benchmarks = context.fundingDbContext?.benchmarks;
  const competitors = context.fundingDbContext?.potentialCompetitors || [];

  if (similar.length === 0 && !benchmarks) {
    return "**Funding DB**: Pas de données disponibles pour cross-reference.";
  }

  let output = "\n## DONNÉES FUNDING DATABASE (Cross-Reference Obligatoire)\n";

  if (similar.length > 0) {
    output += `\n### Deals PropTech Similaires (${similar.length} trouvés)\n`;
    output += similar.slice(0, 10).map((d: Record<string, unknown>) =>
      `- **${d.name}**: ${d.amount ? `${d.amount}€` : "N/A"} @ ${d.valuation ? `${d.valuation}€ valo` : "N/A"} (${d.stage || "?"}) - ${d.status || "?"}`
    ).join("\n");
  }

  if (benchmarks) {
    output += `\n\n### Benchmarks DB (deals récents même secteur/stage)
- Valorisation médiane: ${benchmarks.valuationMedian || "N/A"}€
- Multiple médian: ${benchmarks.arrMultipleMedian || "N/A"}x
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
  const standardsInjection = getStandardsOnlyInjection("PropTech", stage);

  return `Tu es un EXPERT PROPTECH avec 15 ans d'expérience en Due Diligence pour des fonds spécialisés Real Estate Tech (Fifth Wall, MetaProp, A/O PropTech).

## TON PROFIL
- Tu as analysé 300+ deals PropTech du Seed au Growth
- Tu as vécu le crash PropTech 2022-2023 (iBuyers, WeWork) et en as tiré les leçons
- Tu connais les spécificités de chaque segment (marketplace vs SaaS vs inventory-based)
- Tu sais que le PropTech est TRÈS sensible au cycle immobilier et aux taux d'intérêt
- Tu as vu des PropTech échouer malgré de belles métriques (capital intensity, cycle timing)
- Tu connais les régulations locales qui peuvent tuer un business (rent control, zoning, licensing)

## TON MINDSET PROPTECH

### Leçons du crash PropTech 2022-2023
- **WeWork**: Confondre croissance et rentabilité, ignorer le break-even occupancy
- **Opendoor/Zillow Offers**: Sous-estimer le risque d'inventaire en downturn
- **Better.com**: Dépendance aux taux, pas de diversification de revenus
- **Compass**: Acquérir de la croissance sans unit economics viables

### Ce qui différencie un bon PropTech
1. **Cycle-resilient**: Business model qui survit à un downturn
2. **Capital-efficient**: Pas de besoin massif d'inventaire ou de capex
3. **Local moat**: Avantage compétitif qui ne se copie pas facilement
4. **Real unit economics**: Pas de "contribution margin" qui ignore le CAC
5. **Regulatory awareness**: Comprend et anticipe les régulations

## TA MISSION
Analyser ce deal PropTech à travers le prisme sectoriel spécifique, en:
1. **Identifiant** le segment exact (marketplace, SaaS, iBuying, etc.)
2. **Évaluant** les métriques appropriées à ce segment
3. **Analysant** la résilience au cycle immobilier (CRITIQUE)
4. **Quantifiant** le capital intensity et le risque d'inventaire
5. **Cross-référençant** avec la Funding Database et les échecs passés
6. **Produisant** une analyse actionnable pour un Business Angel

## RÈGLES ABSOLUES

### Sur les métriques
- JAMAIS accepter un chiffre sans comprendre sa définition exacte
- GMV: Inclut-il les annulations? Les transactions non-closées?
- Gross Margin: Fully loaded avec holding costs? Ou juste marge directe?
- Occupancy: Mesurée comment? Sur quelle période?
- Take Rate: Net ou brut? Inclut-il les frais annexes?

### Sur le cycle
- TOUJOURS demander: "Que se passe-t-il si les taux montent de 200bp?"
- TOUJOURS demander: "Que se passe-t-il si l'immobilier baisse de 20%?"
- Si le fondateur n'a pas de réponse → RED FLAG CRITIQUE

### Sur le capital
- PropTech inventory-based (iBuying) = TRÈS capital intensive
- PropTech SaaS = moins capital intensive mais long sales cycles
- Flex space = TRÈS sensible à l'occupancy threshold

### Sur les red flags
- Chaque red flag DOIT avoir: sévérité + preuve + impact + question
- Pas de red flags génériques
- Si un benchmark est violé → c'est un red flag avec le seuil cité

### Sur la DB
- Cross-référence OBLIGATOIRE avec les deals similaires
- OBLIGATOIRE: mentionner les PropTech qui ont échoué avec un modèle similaire
- Compare les métriques de ce deal aux percentiles de la DB

${standardsInjection}

## SCORING PROPTECH (0-100)
Le score sectoriel PropTech est la SOMME de:
- **Unit Economics (0-20)**: Métriques appropriées au segment
- **Cycle Resilience (0-20)**: Survie en downturn, sensibilité taux
- **Moat Strength (0-20)**: Data, network effects, regulatory barriers
- **Growth Potential (0-20)**: TAM accessible, expansion path
- **Execution Risk (0-20)**: Team, capital needs, regulatory risk

Chaque dimension:
- 16-20: Exceptionnel
- 12-15: Bon
- 8-11: Acceptable
- 4-7: Concernant
- 0-3: Red flag majeur`;
}

// ============================================================================
// USER PROMPT
// ============================================================================

function buildUserPrompt(context: EnrichedAgentContext): string {
  const deal = context.deal;
  const stage = deal.stage || "SEED";
  const previousResults = context.previousResults || {};

  // Extraire les infos des agents précédents
  let tier1Insights = "";
  for (const [agentName, result] of Object.entries(previousResults)) {
    const res = result as { success?: boolean; data?: unknown };
    if (res.success && res.data) {
      tier1Insights += `\n### ${agentName}\n${JSON.stringify(res.data, null, 2)}\n`;
    }
  }

  return `
## DEAL À ANALYSER

**Company**: ${deal.companyName || deal.name}
**Sector déclaré**: ${deal.sector || "PropTech"}
**Stage**: ${stage}
**Géographie**: ${deal.geography || "Unknown"}
**Valorisation demandée**: ${deal.valuationPre ? `${Number(deal.valuationPre)}€` : "Non spécifiée"}
**Montant du round**: ${deal.amountRequested ? `${Number(deal.amountRequested)}€` : "Non spécifié"}
**ARR déclaré**: ${deal.arr ? `${Number(deal.arr)}€` : "Non spécifié"}
**Croissance déclarée**: ${deal.growthRate ? `${deal.growthRate}%` : "Non spécifiée"}

${formatFundingDbContext(context)}

## ANALYSES TIER 1 (À Exploiter)
${tier1Insights || "Pas d'analyses Tier 1 disponibles"}

## TES TÂCHES

### 1. IDENTIFICATION DU SEGMENT
- Identifie le segment PropTech principal (marketplace, SaaS, iBuying, construction tech, mortgage tech, CRE, coworking, smart building)
- Note les segments secondaires si applicable
- Identifie le business model (SaaS, marketplace, inventory-based, hybrid)
- Note ta confiance dans cette classification

### 2. EXTRACTION & ÉVALUATION MÉTRIQUES
Selon le segment identifié, extrais et évalue les métriques appropriées:

**Si Marketplace/Portal:**
- GMV, Take Rate, Revenue per Lead, Lead Conversion, Monthly Uniques

**Si SaaS (Property Management, Construction Tech):**
- ARR, NRR, Gross Margin, CAC, LTV, CAC Payback

**Si iBuying:**
- Inventory Turnover Days, Gross Margin per Home, Holding Costs, Service Margin

**Si Flex Space/Coworking:**
- Occupancy Rate, Break-even Occupancy, Revenue per Desk, Member Churn

**Si Mortgage Tech:**
- Loan Volume, Revenue per Loan, Cost per Origination, Pull-through Rate, Days to Close

### 3. CYCLE ANALYSIS (CRITIQUE)
- Évalue la sensibilité aux taux d'intérêt
- Évalue la résilience à un crash immobilier (-20%)
- Identifie le worst-case scenario
- Note les mécanismes de hedging s'il y en a
- Score de résilience /100

### 4. ANALYSE GÉOGRAPHIQUE
- Identifie les marchés principaux
- Évalue le risque de concentration géographique
- Identifie les régulations locales critiques (rent control, licensing, zoning)
- Évalue le potentiel d'expansion

### 5. CAPITAL INTENSITY
- Évalue le niveau d'intensité en capital
- Identifie les besoins en working capital
- Évalue le risque d'inventaire
- Estime le timeline to break-even
- Estime les besoins de financement sur 24 mois

### 6. RED FLAGS PROPTECH
Pour chaque red flag:
- Sévérité: critical / major / minor
- Preuve: le chiffre exact ou l'observation
- Impact: ce qui arrive si ça se matérialise
- Question: ce qu'il faut demander au fondateur
- Benchmark violé: si applicable

Vérifie au minimum:
- Cycle sensitivity sans hedging → CRITICAL si iBuying ou mortgage
- Gross Margin < 20% pour inventory-based → CRITICAL
- Occupancy break-even > 70% pour flex space → MAJOR
- Inventory turnover > 180 jours pour iBuying → CRITICAL
- NRR < 90% pour SaaS PropTech → CRITICAL
- Concentration géographique > 80% sans expansion plan → MAJOR
- Concurrents DB non mentionnés dans deck → MAJOR

### 7. VALORISATION VS BENCHMARKS
- Calcule le multiple demandé (ARR pour SaaS, GMV pour marketplace, etc.)
- Compare aux multiples de marché actuels PropTech
- Ajuste pour le cycle immobilier actuel
- Donne une range fair value
- Identifie les arguments de négociation

### 8. COMPARAISON AUX ÉCHECS PROPTECH
- Compare ce deal aux PropTech qui ont échoué (WeWork, Zillow Offers, Better, etc.)
- Identifie les similitudes inquiétantes
- Identifie les différences rassurantes

### 9. QUESTIONS MUST-ASK
5-7 questions spécifiques PropTech avec:
- La question exacte
- Pourquoi elle est importante
- Ce qu'une bonne réponse ressemble
- Ce qui serait un red flag

Inclure OBLIGATOIREMENT:
- Question sur résilience au downturn
- Question sur regulatory risk
- Question sur capital needs

### 10. SCORE ET SYNTHÈSE
- Score /100 avec breakdown par dimension
- Executive Summary: 3-4 phrases max, actionnable
- Implication pour l'investissement

IMPORTANT: Sois spécifique. Pas de généralités. Chaque affirmation doit être sourcée ou calculée.
RAPPEL: PropTech = cycle-sensitive. Si tu ne parles pas du cycle, ton analyse est incomplète.`;
}

// ============================================================================
// HELPER: Transform output to SectorExpertData
// ============================================================================

function transformOutput(raw: PropTechExpertOutput): SectorExpertData {
  return {
    sectorName: `PropTech - ${raw.primarySegment.replace(/_/g, " ")}`,
    sectorMaturity: raw.cycleAnalysis.currentCyclePhase === "contraction" || raw.cycleAnalysis.currentCyclePhase === "trough"
      ? "declining"
      : raw.cycleAnalysis.currentCyclePhase === "peak"
        ? "mature"
        : "growing",

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
      complexity: raw.geographicAnalysis.localRegulationRisk === "very_high" ? "very_high"
        : raw.geographicAnalysis.localRegulationRisk === "high" ? "high"
        : raw.geographicAnalysis.localRegulationRisk === "medium" ? "medium" : "low",
      keyRegulations: raw.geographicAnalysis.keyRegulations,
      complianceRisks: raw.redFlags
        .filter(rf => rf.flag.toLowerCase().includes("regulat") || rf.flag.toLowerCase().includes("compliance"))
        .map(rf => rf.flag),
      upcomingChanges: [],
    },

    sectorDynamics: {
      competitionIntensity: "high",
      consolidationTrend: "consolidating",
      barrierToEntry: raw.propTechMoat.regulatoryMoat === "strong" || raw.capitalIntensity.level === "very_high"
        ? "high" : "medium",
      typicalExitMultiple: raw.exitPotential.typicalMultiple,
      recentExits: raw.exitPotential.recentComparableExits?.map(e => `${e.company} → ${e.acquirer} (${e.multiple}x, ${e.year})`) || [],
    },

    sectorQuestions: raw.sectorQuestions.map(q => ({
      question: q.question,
      category: q.category === "unit_economics" ? "business" as const
        : q.category === "cycle_resilience" ? "business" as const
        : q.category === "regulatory" ? "regulatory" as const
        : q.category === "geographic" ? "business" as const
        : q.category === "capital" ? "business" as const
        : "competitive" as const,
      priority: q.priority,
      expectedAnswer: q.greenFlagAnswer,
      redFlagAnswer: q.redFlagAnswer,
    })),

    sectorFit: {
      score: raw.sectorScore,
      strengths: raw.greenFlags.map(gf => gf.flag),
      weaknesses: raw.redFlags.map(rf => rf.flag),
      sectorTiming: raw.cycleAnalysis.currentCyclePhase === "expansion" ? "optimal"
        : raw.cycleAnalysis.currentCyclePhase === "peak" ? "late"
        : "early",
    },

    sectorScore: raw.sectorScore,
    executiveSummary: raw.executiveSummary,
  };
}

// ============================================================================
// DEFAULT DATA
// ============================================================================

function getDefaultData(): SectorExpertData {
  return {
    sectorName: "PropTech",
    sectorMaturity: "growing",
    keyMetrics: [],
    sectorRedFlags: [{
      flag: "Analyse incomplète",
      severity: "major",
      sectorReason: "L'analyse PropTech n'a pas pu être complétée",
    }],
    sectorOpportunities: [],
    regulatoryEnvironment: {
      complexity: "high",
      keyRegulations: ["Rent control laws", "Real estate licensing", "Zoning regulations"],
      complianceRisks: ["Analyse incomplète"],
      upcomingChanges: [],
    },
    sectorDynamics: {
      competitionIntensity: "high",
      consolidationTrend: "consolidating",
      barrierToEntry: "medium",
      typicalExitMultiple: 4,
      recentExits: [],
    },
    sectorQuestions: [{
      question: "Comment votre business survit-il à une hausse des taux de 200bp et une baisse de l'immobilier de 20%?",
      category: "business",
      priority: "must_ask",
      expectedAnswer: "Diversification des revenus, faible exposition au cycle, hedging",
      redFlagAnswer: "Pas de réponse claire ou dépendance totale au volume de transactions",
    }],
    sectorFit: {
      score: 0,
      strengths: [],
      weaknesses: ["Analyse incomplète"],
      sectorTiming: "optimal",
    },
    sectorScore: 0,
    executiveSummary: "L'analyse sectorielle PropTech n'a pas pu être complétée.",
  };
}

// ============================================================================
// PROPTECH EXPERT AGENT
// ============================================================================

export const proptechExpert = {
  name: "proptech-expert" as SectorExpertType,

  async run(context: EnrichedAgentContext): Promise<SectorExpertResult> {
    const startTime = Date.now();

    try {
      const stage = context.deal.stage || "SEED";
      const systemPromptText = buildSystemPrompt(stage);
      const userPromptText = buildUserPrompt(context);

      setAgentContext("proptech-expert");

      const response = await complete(userPromptText, {
        systemPrompt: systemPromptText,
        complexity: "complex",
        maxTokens: 8000,
        temperature: 0.3,
      });

      // Parse and validate response
      let parsedOutput: PropTechExpertOutput;
      try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("No JSON found in response");
        }
        parsedOutput = PropTechOutputSchema.parse(JSON.parse(jsonMatch[0]));
      } catch (parseError) {
        console.error("[proptech-expert] Parse error:", parseError);
        return {
          agentName: "proptech-expert" as SectorExpertType,
          success: false,
          executionTimeMs: Date.now() - startTime,
          cost: response.cost ?? 0,
          error: `Failed to parse LLM response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
          data: getDefaultData(),
        };
      }

      // Transform to SectorExpertData format
      const sectorData = transformOutput(parsedOutput);

      return {
        agentName: "proptech-expert" as SectorExpertType,
        success: true,
        executionTimeMs: Date.now() - startTime,
        cost: response.cost ?? 0,
        data: sectorData,
        // Include extended data for detailed display
        _extended: {
          subSector: {
            primary: parsedOutput.primarySegment.replace(/_/g, " "),
            secondary: parsedOutput.secondarySegments,
            rationale: `Business model: ${parsedOutput.businessModel}`,
          },
          // PropTech-specific extended data
          proptechCycleAnalysis: parsedOutput.cycleAnalysis,
          proptechGeographicAnalysis: parsedOutput.geographicAnalysis,
          proptechCapitalIntensity: parsedOutput.capitalIntensity,
          proptechMoat: parsedOutput.propTechMoat,
          proptechUnitEconomics: parsedOutput.unitEconomics,
          valuationAnalysis: {
            askMultiple: parsedOutput.valuationAnalysis.askMultiple,
            medianSectorMultiple: parsedOutput.valuationAnalysis.medianSectorMultiple,
            percentilePosition: parsedOutput.valuationAnalysis.percentilePosition,
            justifiedRange: parsedOutput.valuationAnalysis.justifiedRange,
            verdict: parsedOutput.valuationAnalysis.verdict,
            negotiationLeverage: parsedOutput.valuationAnalysis.negotiationLeverage,
          },
          dbComparison: parsedOutput.dbComparison,
          scoreBreakdown: {
            unitEconomics: parsedOutput.scoreBreakdown.unitEconomics,
            cycleResilience: parsedOutput.scoreBreakdown.cycleResilience,
            moatStrength: parsedOutput.scoreBreakdown.moatStrength,
            growthPotential: parsedOutput.scoreBreakdown.growthPotential,
            executionRisk: parsedOutput.scoreBreakdown.executionRisk,
          },
          exitPotential: {
            typicalMultiple: parsedOutput.exitPotential.typicalMultiple,
            likelyAcquirers: parsedOutput.exitPotential.likelyAcquirers,
            timeToExit: parsedOutput.exitPotential.timeToExit,
            exitReadiness: parsedOutput.exitPotential.exitReadiness,
          },
          verdict: {
            recommendation: parsedOutput.investmentImplication === "strong_proptech_fundamentals" ? "STRONG_FIT"
              : parsedOutput.investmentImplication === "solid_with_cycle_risk" ? "GOOD_FIT"
              : parsedOutput.investmentImplication === "high_risk_high_reward" ? "MODERATE_FIT"
              : parsedOutput.investmentImplication === "needs_improvement" ? "POOR_FIT"
              : "NOT_RECOMMENDED",
            confidence: "medium",
            keyInsight: parsedOutput.executiveSummary,
            topConcern: parsedOutput.redFlags[0]?.flag || "Aucun red flag identifié",
            topStrength: parsedOutput.greenFlags[0]?.flag || "Aucun green flag identifié",
          },
        },
      };

    } catch (error) {
      console.error("[proptech-expert] Execution error:", error);
      return {
        agentName: "proptech-expert" as SectorExpertType,
        success: false,
        executionTimeMs: Date.now() - startTime,
        cost: 0,
        error: error instanceof Error ? error.message : "Unknown error",
        data: getDefaultData(),
      };
    }
  },
};
