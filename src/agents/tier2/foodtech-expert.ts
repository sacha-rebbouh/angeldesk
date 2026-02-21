/**
 * FoodTech Expert Agent - Tier 2
 *
 * Expert sectoriel FoodTech avec analyse qualité Big4 + instinct Partner VC.
 *
 * Mission: Évaluer le deal à travers le prisme spécifique FoodTech
 * (D2C Food, Alt Protein, Meal Kits, AgTech, Restaurant Tech, Food Supply Chain)
 * en cross-référençant avec les benchmarks sectoriels et la Funding Database.
 *
 * Standards:
 * - Chaque métrique comparée aux percentiles sectoriels
 * - Cross-reference obligatoire avec deals similaires de la DB
 * - Red flags avec sévérité + preuve + impact + question
 * - Output actionnable pour un Business Angel
 *
 * Sub-sectors covered:
 * - D2C Food/Beverage Brands (snacks, drinks, supplements)
 * - Alternative Protein (plant-based, cultivated meat)
 * - Meal Kits & Subscription Food
 * - AgTech / Vertical Farming
 * - Restaurant Tech (POS, delivery, dark kitchens)
 * - Food Supply Chain & Logistics
 * - Food Safety / QA Tech
 */

import { z } from "zod";
import type { EnrichedAgentContext } from "../types";
import type { SectorExpertData, SectorExpertResult, SectorExpertType } from "./types";
import { getStandardsOnlyInjection } from "./benchmark-injector";
import { FOODTECH_STANDARDS } from "./sector-standards";
import { complete, setAgentContext, extractFirstJSON } from "@/services/openrouter/router";

// ============================================================================
// OUTPUT SCHEMA
// ============================================================================

const FoodTechMetricEvaluationSchema = z.object({
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
  insight: z.string().describe("Pourquoi c'est important pour ce type de FoodTech"),
  subSectorContext: z.string().optional().describe("Comment interpréter pour ce sous-secteur spécifique"),
});

const FoodTechRedFlagSchema = z.object({
  flag: z.string().describe("Description claire du red flag"),
  severity: z.enum(["critical", "major", "minor"]),
  evidence: z.string().describe("Preuve concrète (chiffre, source, citation)"),
  impact: z.string().describe("Impact business si ce risque se matérialise"),
  questionToAsk: z.string().describe("Question précise à poser au fondateur"),
  benchmarkViolation: z.string().optional().describe("Quel seuil benchmark est violé"),
});

const FoodTechGreenFlagSchema = z.object({
  flag: z.string(),
  strength: z.enum(["strong", "moderate"]),
  evidence: z.string(),
  implication: z.string().describe("Ce que ça signifie pour l'investissement"),
});

const FoodTechUnitEconomicsSchema = z.object({
  contributionMarginPerOrder: z.object({
    value: z.union([z.number(), z.null()]),
    calculation: z.string().describe("Détail: AOV - COGS - Fulfillment - Payment"),
    isPositive: z.boolean(),
    assessment: z.string(),
  }),
  ltv: z.object({
    value: z.union([z.number(), z.null()]),
    calculation: z.string(),
    confidence: z.enum(["high", "medium", "low"]),
  }),
  cac: z.object({
    value: z.union([z.number(), z.null()]),
    calculation: z.string(),
    byChannel: z.array(z.object({
      channel: z.string(),
      cac: z.number(),
    })).optional(),
  }),
  ltvCacRatio: z.object({
    value: z.union([z.number(), z.null()]),
    assessment: z.string(),
    vsMedian: z.string(),
  }),
  cacPaybackOrders: z.object({
    value: z.union([z.number(), z.null()]),
    assessment: z.string(),
    firstOrderProfitable: z.boolean(),
  }),
  grossMargin: z.object({
    value: z.union([z.number(), z.null()]),
    foodCostRatio: z.union([z.number(), z.null()]),
    assessment: z.string(),
    vsSubSectorBenchmark: z.string(),
  }),
});

const FoodTechOutputSchema = z.object({
  // Identification du sous-secteur
  sectorConfidence: z.number().min(0).max(100).describe("Confiance que c'est bien du FoodTech"),
  subSector: z.enum([
    "d2c_food_brand",
    "alt_protein",
    "meal_kit",
    "agtech_vertical_farming",
    "restaurant_tech",
    "food_delivery",
    "food_supply_chain",
    "food_safety_qa",
    "hybrid",
    "other"
  ]).describe("Sous-catégorie FoodTech identifiée"),
  subSectorRationale: z.string().describe("Pourquoi ce sous-secteur"),
  businessModel: z.enum([
    "d2c_subscription",
    "d2c_one_time",
    "retail_distribution",
    "b2b_saas",
    "marketplace",
    "b2b_ingredients",
    "vertical_integration",
    "hybrid"
  ]),

  // Métriques primaires avec benchmark
  primaryMetrics: z.array(FoodTechMetricEvaluationSchema).describe("Les 5-6 KPIs critiques FoodTech"),

  // Métriques secondaires
  secondaryMetrics: z.array(FoodTechMetricEvaluationSchema).describe("Métriques de support"),

  // Unit Economics détaillés
  unitEconomics: FoodTechUnitEconomicsSchema,

  // Red Flags sectoriels
  redFlags: z.array(FoodTechRedFlagSchema),

  // Green Flags sectoriels
  greenFlags: z.array(FoodTechGreenFlagSchema),

  // Distribution & Channels
  distributionAnalysis: z.object({
    channels: z.array(z.object({
      channel: z.enum(["d2c_website", "amazon", "retail_grocery", "retail_specialty", "foodservice", "subscription", "other"]),
      revenueShare: z.number().describe("% du revenu"),
      marginProfile: z.enum(["high", "medium", "low"]),
      scalability: z.enum(["high", "medium", "low"]),
    })),
    channelDiversification: z.enum(["well_diversified", "moderately_diversified", "concentrated", "single_channel"]),
    retailPresence: z.object({
      retailers: z.array(z.string()),
      velocity: z.union([z.number(), z.null()]).describe("$/store/week si disponible"),
      delistingRisk: z.enum(["low", "medium", "high"]),
    }).optional(),
    keyInsight: z.string(),
  }),

  // Supply Chain & Operations
  supplyChainAssessment: z.object({
    manufacturingModel: z.enum(["own_facility", "copacker", "hybrid", "asset_light", "unknown"]),
    copackerDependency: z.enum(["none", "low", "medium", "high", "critical"]),
    supplyChainResilience: z.enum(["strong", "adequate", "fragile", "unknown"]),
    spoilageWasteRate: z.union([z.number(), z.null()]),
    keyRisks: z.array(z.string()),
    keyInsight: z.string(),
  }),

  // Regulatory & Certifications
  regulatoryStatus: z.object({
    fdaCompliance: z.enum(["compliant", "in_process", "issues_identified", "unknown"]),
    certifications: z.array(z.object({
      name: z.string(),
      status: z.enum(["obtained", "pending", "not_applicable"]),
      value: z.string().describe("Valeur commerciale de cette certification"),
    })),
    regulatoryRisks: z.array(z.string()),
    healthClaimsIssues: z.boolean().describe("Problèmes potentiels avec les claims santé"),
  }),

  // Brand & Customer
  brandAnalysis: z.object({
    brandStrength: z.enum(["strong", "moderate", "weak", "unknown"]),
    organicAcquisitionShare: z.union([z.number(), z.null()]).describe("% acquisition organique"),
    repeatPurchaseRate: z.union([z.number(), z.null()]),
    nps: z.union([z.number(), z.null()]),
    socialMediaPresence: z.object({
      followers: z.number().optional(),
      engagement: z.enum(["high", "medium", "low", "unknown"]),
    }).optional(),
    keyInsight: z.string(),
  }),

  // Competitive Position
  competitivePosition: z.object({
    directCompetitors: z.array(z.object({
      name: z.string(),
      funding: z.string().optional(),
      positioning: z.string(),
      threatLevel: z.enum(["high", "medium", "low"]),
    })),
    competitorsMentionedInDeck: z.array(z.string()),
    competitorsFromDb: z.array(z.string()),
    hiddenCompetitors: z.array(z.string()).describe("Concurrents DB non mentionnés - RED FLAG si présents"),
    differentiators: z.array(z.string()),
    moatStrength: z.enum(["strong", "moderate", "weak", "none"]),
    privateLabelThreat: z.enum(["low", "medium", "high"]).describe("Risque de copie par marques distributeur"),
  }),

  // Valorisation vs Benchmarks
  valuationAnalysis: z.object({
    askMultiple: z.string().describe("Multiple demandé (Revenue, EBITDA, etc.)"),
    multipleType: z.enum(["revenue", "gross_profit", "ebitda", "other"]),
    medianSectorMultiple: z.number(),
    percentilePosition: z.number(),
    justifiedRange: z.object({
      low: z.number(),
      fair: z.number(),
      high: z.number(),
    }),
    verdict: z.enum(["attractive", "fair", "stretched", "excessive"]),
    negotiationLeverage: z.string(),
  }),

  // DB Comparison
  dbComparison: z.object({
    similarDealsFound: z.number(),
    thisDealsPosition: z.string(),
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

  // Questions spécifiques FoodTech
  sectorQuestions: z.array(z.object({
    question: z.string(),
    category: z.enum(["unit_economics", "supply_chain", "distribution", "regulatory", "brand", "competition"]),
    priority: z.enum(["must_ask", "should_ask", "nice_to_have"]),
    why: z.string(),
    greenFlagAnswer: z.string(),
    redFlagAnswer: z.string(),
  })),

  // Exit potential
  exitPotential: z.object({
    typicalMultiple: z.number(),
    multipleType: z.enum(["revenue", "ebitda"]),
    likelyAcquirers: z.array(z.string()),
    strategicFit: z.array(z.object({
      acquirer: z.string(),
      rationale: z.string(),
    })),
    timeToExit: z.string(),
    exitReadiness: z.enum(["ready", "needs_work", "far"]),
    ipoViability: z.boolean(),
  }),

  // Score et Synthèse
  sectorScore: z.number().min(0).max(100),
  scoreBreakdown: z.object({
    unitEconomics: z.number().min(0).max(25),
    brandRetention: z.number().min(0).max(25),
    distribution: z.number().min(0).max(25),
    supplyChainOps: z.number().min(0).max(25),
  }),

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


  executiveSummary: z.string().describe("3-4 phrases: verdict FoodTech, métriques clés, principal risque, potentiel"),

  investmentImplication: z.enum([
    "strong_foodtech_fundamentals",
    "solid_with_concerns",
    "needs_improvement",
    "unit_economics_broken",
    "interesting_but_early"
  ]),
});

export type FoodTechExpertOutput = z.infer<typeof FoodTechOutputSchema>;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatBenchmarksForPrompt(stage: string): string {
  return getStandardsOnlyInjection("FoodTech", stage);
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
    output += `\n### Deals FoodTech Similaires (${similar.length} trouvés)\n`;
    output += similar.slice(0, 10).map((d: Record<string, unknown>) =>
      `- **${d.name}**: ${d.amount ? `${d.amount}€` : "N/A"} @ ${d.valuation ? `${d.valuation}€ valo` : "N/A"} (${d.stage || "?"}) - ${d.status || "?"}`
    ).join("\n");
  }

  if (benchmarks) {
    output += `\n\n### Benchmarks DB (deals récents même secteur/stage)
- Valorisation médiane: ${benchmarks.valuationMedian || "N/A"}€
- Multiple Revenue médian: ${benchmarks.revenueMultipleMedian || "N/A"}x
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
  return `Tu es un EXPERT FOODTECH avec 15 ans d'expérience en Due Diligence pour des fonds spécialisés (SOSV, Acre VP, Unovis, S2G Ventures, Agronomics).

## TON PROFIL
- Tu as analysé 300+ deals FoodTech du Seed au Growth
- Tu connais les unit economics par sous-secteur: D2C brands, alt protein, meal kits, agtech, restaurant tech
- Tu sais que "food is hard" - les marges sont fines, la logistique complexe, les consommateurs inconstants
- Tu as vu des brands D2C exploser leur CAC sans repeat, des startups alt protein brûler du cash sans scale
- Tu connais les success stories (Oatly, Beyond Meat IPO, Impossible exit, Athletic Greens scale)
- Tu sais évaluer la vélocité retail, les risques co-packer, les pièges du trade spend

## TA MISSION
Analyser ce deal FoodTech à travers le prisme sectoriel spécifique, en:
1. **Identifiant le sous-secteur** précis (D2C, alt protein, agtech, etc.)
2. **Évaluant les unit economics** avec rigueur (contribution margin, CAC payback)
3. **Analysant la distribution** (D2C vs retail vs foodservice)
4. **Évaluant supply chain & ops** (co-packer, spoilage, certifications)
5. **Comparant aux benchmarks** fournis ci-dessous
6. **Cross-référençant** avec la Funding Database
7. **Produisant** une analyse actionnable pour un Business Angel

## RÈGLES ABSOLUES

### Sur les unit economics FoodTech
- CONTRIBUTION MARGIN PAR COMMANDE est LA métrique D2C - doit être POSITIVE
- GROSS MARGIN varie énormément: CPG 35-50%, Restaurant Tech 60%+, Delivery <10%
- CAC PAYBACK en nombre de commandes (pas en mois) pour D2C
- FOOD COST RATIO: si > 50% du revenu, c'est un commodity business

### Sur la distribution
- RETAIL VELOCITY ($$/store/semaine) détermine si tu restes en rayon
- TRADE SPEND peut manger 20-30% du revenu retail - demander le détail
- CHANNEL MIX: pure D2C = CAC hell, pure retail = margin hell, mix optimal

### Sur les red flags FoodTech spécifiques
- Contribution margin négative → CRITICAL (chaque commande perd de l'argent)
- Repeat rate < 20% → CRITICAL (produit pas aimé)
- Single retailer > 40% revenue → MAJOR (dépendance dangereuse)
- Spoilage > 5% → MAJOR (supply chain cassée)
- Pas de certifications clés (Organic, Non-GMO si relevant) → à investiguer

### Sur les calculs
- MONTRE tes calculs, pas juste les résultats
- Contribution = AOV - COGS - Fulfillment - Payment
- LTV = AOV × Contribution % × Orders/Year × Lifespan
- CAC Payback = CAC / Contribution par Order

${formatBenchmarksForPrompt(stage)}

## SCORING (0-100)
Le score sectoriel FoodTech est la SOMME de:
- **Unit Economics (0-25)**: Contribution positive, LTV/CAC ≥3x, GM healthy vs sous-secteur
- **Brand & Retention (0-25)**: Repeat rate, organic %, brand strength
- **Distribution (0-25)**: Channel mix, retail velocity, diversification
- **Supply Chain & Ops (0-25)**: Manufacturing, spoilage, certifications, resilience

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

  
    let fundingDbData = "";
    const contextEngineAny = context.contextEngine as Record<string, unknown> | undefined;
    const fundingDb = contextEngineAny?.fundingDb as { competitors?: unknown; valuationBenchmark?: unknown; sectorTrend?: unknown } | undefined;
    if (fundingDb) {
      fundingDbData = `\n## FUNDING DATABASE - CROSS-REFERENCE OBLIGATOIRE\n\nTu DOIS produire un champ "dbCrossReference" dans ton output.\n\n### Concurrents détectés dans la DB\n${fundingDb.competitors ? JSON.stringify(fundingDb.competitors, null, 2).slice(0, 3000) : "Aucun"}\n\n### Benchmark valorisation\n${fundingDb.valuationBenchmark ? JSON.stringify(fundingDb.valuationBenchmark, null, 2) : "N/A"}\n\n### Tendance funding\n${fundingDb.sectorTrend ? JSON.stringify(fundingDb.sectorTrend, null, 2) : "N/A"}\n\nINSTRUCTIONS DB:\n1. Claims deck \u2192 v\u00e9rifi\u00e9 vs donn\u00e9es\n2. Concurrents DB absents du deck = RED FLAG CRITICAL\n3. Valo vs percentiles\n4. "pas de concurrent" + DB en trouve = RED FLAG CRITICAL`;
    }

    return `
## DEAL À ANALYSER

**Company**: ${deal.companyName || deal.name}
**Sector déclaré**: ${deal.sector || "FoodTech"}
**Stage**: ${stage}
**Géographie**: ${deal.geography || "Unknown"}
**Valorisation demandée**: ${deal.valuationPre != null ? `${Number(deal.valuationPre)}€` : "Non spécifiée"}
**Montant du round**: ${deal.amountRequested != null ? `${Number(deal.amountRequested)}€` : "Non spécifié"}
**Revenue déclaré**: ${deal.arr != null ? `${Number(deal.arr)}€ ARR` : "Non spécifié"}
**Croissance déclarée**: ${deal.growthRate != null ? `${Number(deal.growthRate)}%` : "Non spécifiée"}

${formatFundingDbContext(context)}

${context.factStoreFormatted ? `
## DONNÉES VÉRIFIÉES (Fact Store)

Les données ci-dessous ont été extraites et vérifiées à partir des documents du deal.
Base ton analyse sur ces faits. Si un fait important manque, signale-le.

${context.factStoreFormatted}
` : ""}

${fundingDbData}

## ANALYSES TIER 1 (À Exploiter)
${tier1Insights || "Pas d'analyses Tier 1 disponibles"}

## TES TÂCHES

### 1. IDENTIFICATION SOUS-SECTEUR
- Identifie précisément le sous-secteur: D2C brand, alt protein, meal kit, agtech, restaurant tech, etc.
- Adapte ton analyse aux benchmarks spécifiques de ce sous-secteur
- Note que les unit economics varient ÉNORMÉMENT entre sous-secteurs

### 2. UNIT ECONOMICS PROFONDS
Pour le FoodTech, calcule avec précision:
a) **Contribution Margin par Commande** = AOV - COGS - Fulfillment - Payment
   - DOIT être positive pour D2C viable
   - Cite chaque composant avec source
b) **Gross Margin** et compare au sous-secteur
c) **Food Cost Ratio** (COGS food / Revenue)
d) **LTV** avec formule complète
e) **CAC** par canal si disponible
f) **CAC Payback en nombre de commandes** (pas en mois)
g) **LTV/CAC Ratio**

### 3. ANALYSE DISTRIBUTION
- Identifie les canaux: D2C, Amazon, Retail (lesquels?), Foodservice
- Évalue le channel mix (% par canal)
- Pour retail: vélocité, trade spend, risque delisting
- Concentration: dépendance à un seul retailer?

### 4. SUPPLY CHAIN & OPS
- Modèle manufacturing: propre vs co-packer
- Dépendance co-packer (risque si unique)
- Spoilage/waste rate
- Résilience supply chain
- Certifications (Organic, Non-GMO, B-Corp, etc.)

### 5. BRAND & CUSTOMER
- Force de la brand
- Part acquisition organique vs paid
- Repeat purchase rate (CRITIQUE)
- NPS si disponible

### 6. RED FLAGS FOODTECH
Pour chaque red flag:
- Sévérité: critical / major / minor
- Preuve exacte
- Impact quantifié
- Question à poser

Vérifie au minimum:
- Contribution margin négative → CRITICAL
- Repeat rate < 20% → CRITICAL
- Single retailer > 40% revenue → MAJOR
- Spoilage > 5% → MAJOR
- Gross Margin < 25% (hors delivery) → CRITICAL
- LTV/CAC < 1.5x → CRITICAL
- Concurrents DB non mentionnés dans deck → MAJOR

### 7. COMPETITIVE POSITION
- Liste les concurrents directs
- Compare avec ceux dans la DB
- Identifie les concurrents "cachés" (dans DB mais pas dans deck)
- Évalue la menace private label

### 8. VALORISATION
- Calcule le multiple demandé (sur Revenue ou Gross Profit)
- Compare aux multiples FoodTech du marché actuel (rechercher benchmarks récents)
- Identifie les arguments de négociation

### 9. QUESTIONS MUST-ASK
5-7 questions spécifiques FoodTech:
- Unit economics détaillés
- Distribution strategy
- Supply chain risks
- Retail relationships
- Certification status

### 10. SCORE ET SYNTHÈSE
- Score /100 avec breakdown par dimension
- Executive Summary: 3-4 phrases max, actionnable
- Implication pour l'investissement

IMPORTANT: Sois spécifique au sous-secteur FoodTech identifié. Un D2C snack brand n'a pas les mêmes benchmarks qu'une startup alt protein ou un SaaS restaurant tech.`;
}

// ============================================================================
// HELPER: Transform output to SectorExpertData
// ============================================================================

function transformOutput(raw: FoodTechExpertOutput): SectorExpertData {
  return {
    sectorName: `FoodTech - ${raw.subSector.replace(/_/g, " ")}`,
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
      complexity: raw.regulatoryStatus.healthClaimsIssues ? "high" : "medium",
      keyRegulations: ["FDA Food Safety", "Labeling Requirements", "Health Claims Regulations"],
      complianceRisks: raw.regulatoryStatus.regulatoryRisks,
      upcomingChanges: [],
    },

    sectorDynamics: {
      competitionIntensity: raw.competitivePosition.moatStrength === "none" ? "intense" :
                           raw.competitivePosition.moatStrength === "weak" ? "high" : "medium",
      consolidationTrend: "consolidating",
      barrierToEntry: raw.competitivePosition.moatStrength === "strong" ? "high" :
                      raw.competitivePosition.moatStrength === "moderate" ? "medium" : "low",
      typicalExitMultiple: raw.exitPotential.typicalMultiple,
      recentExits: [],
    },

    sectorQuestions: raw.sectorQuestions.map(q => ({
      question: q.question,
      category: q.category === "unit_economics" || q.category === "supply_chain" ? "business" as const :
                q.category === "regulatory" ? "regulatory" as const :
                q.category === "competition" ? "competitive" as const : "business" as const,
      priority: q.priority,
      expectedAnswer: q.greenFlagAnswer,
      redFlagAnswer: q.redFlagAnswer,
    })),

    sectorFit: {
      score: raw.sectorScore,
      strengths: raw.greenFlags.map(gf => gf.flag),
      weaknesses: raw.redFlags.map(rf => rf.flag),
      sectorTiming: "optimal",
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
    sectorName: "FoodTech",
    sectorMaturity: "growing",
    keyMetrics: [],
    sectorRedFlags: [{
      flag: "Analyse incomplète",
      severity: "major",
      sectorReason: "L'analyse FoodTech n'a pas pu être complétée",
    }],
    sectorOpportunities: [],
    regulatoryEnvironment: {
      complexity: "medium",
      keyRegulations: ["FDA Food Safety", "Labeling Requirements"],
      complianceRisks: ["Analyse incomplète"],
      upcomingChanges: [],
    },
    sectorDynamics: {
      competitionIntensity: "high",
      consolidationTrend: "consolidating",
      barrierToEntry: "low",
      typicalExitMultiple: 2.5,
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
    executiveSummary: "L'analyse sectorielle FoodTech n'a pas pu être complétée.",
  };
}

// ============================================================================
// FOODTECH EXPERT AGENT
// ============================================================================

export const foodtechExpert = {
  name: "foodtech-expert" as SectorExpertType,

  async run(context: EnrichedAgentContext): Promise<SectorExpertResult> {
    const startTime = Date.now();

    try {
      const stage = context.deal.stage || "SEED";
      const systemPromptText = buildSystemPrompt(stage);
      const userPromptText = buildUserPrompt(context);

      setAgentContext("foodtech-expert");

      const response = await complete(userPromptText, {
        systemPrompt: systemPromptText,
        complexity: "complex",
        temperature: 0.3,
      });

      // Parse and validate response
      let parsedOutput: FoodTechExpertOutput;
      try {
        const rawJson = JSON.parse(extractFirstJSON(response.content));
        const parseResult = FoodTechOutputSchema.safeParse(rawJson);
        if (parseResult.success) {
          parsedOutput = parseResult.data;
        } else {
          console.warn(`[foodtech-expert] Strict parse failed (${parseResult.error.issues.length} issues), using raw JSON with defaults`);
          parsedOutput = rawJson as FoodTechExpertOutput;
        }
      } catch (parseError) {
        console.error("[foodtech-expert] Parse error:", parseError);
        return {
          agentName: "foodtech-expert" as SectorExpertType,
          success: false,
          executionTimeMs: Date.now() - startTime,
          cost: response.cost ?? 0,
          error: `Failed to parse LLM response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
          data: getDefaultData(),
        };
      }

      
      // === SCORE CAPPING based on data completeness ===
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
      // Override scores with capped values
      parsedOutput.sectorScore = cappedScore;

      // Transform to SectorExpertData format
      const sectorData = transformOutput(parsedOutput);

      return {
        agentName: "foodtech-expert" as SectorExpertType,
        success: true,
        executionTimeMs: Date.now() - startTime,
        cost: response.cost ?? 0,
        data: sectorData,
        _extended: {
          subSector: {
            primary: parsedOutput.subSector.replace(/_/g, " "),
            rationale: parsedOutput.subSectorRationale,
          },
          unitEconomics: {
            ltv: parsedOutput.unitEconomics.ltv,
            cac: {
              value: parsedOutput.unitEconomics.cac.value,
              calculation: parsedOutput.unitEconomics.cac.calculation,
              confidence: "medium",
            },
            ltvCacRatio: parsedOutput.unitEconomics.ltvCacRatio,
          },
          valuationAnalysis: {
            askMultiple: parseFloat(parsedOutput.valuationAnalysis.askMultiple) || 0,
            medianSectorMultiple: parsedOutput.valuationAnalysis.medianSectorMultiple,
            percentilePosition: parsedOutput.valuationAnalysis.percentilePosition,
            justifiedRange: parsedOutput.valuationAnalysis.justifiedRange,
            verdict: parsedOutput.valuationAnalysis.verdict,
            negotiationLeverage: parsedOutput.valuationAnalysis.negotiationLeverage,
          },
          dbComparison: parsedOutput.dbComparison,
          scoreBreakdown: {
            unitEconomics: parsedOutput.scoreBreakdown.unitEconomics,
            growth: parsedOutput.scoreBreakdown.brandRetention,
            retention: parsedOutput.scoreBreakdown.distribution,
            gtmEfficiency: parsedOutput.scoreBreakdown.supplyChainOps,
          },
          exitPotential: {
            typicalMultiple: parsedOutput.exitPotential.typicalMultiple,
            likelyAcquirers: parsedOutput.exitPotential.likelyAcquirers,
            timeToExit: parsedOutput.exitPotential.timeToExit,
            exitReadiness: parsedOutput.exitPotential.exitReadiness,
          },
          investmentImplication: parsedOutput.investmentImplication === "strong_foodtech_fundamentals" ? "strong_saas_fundamentals" :
                                 parsedOutput.investmentImplication === "solid_with_concerns" ? "solid_with_concerns" :
                                 parsedOutput.investmentImplication === "needs_improvement" ? "needs_improvement" : "saas_model_broken",
          // FoodTech specific extended data
          foodtechSpecific: {
            subSector: parsedOutput.subSector,
            businessModel: parsedOutput.businessModel,
            distributionAnalysis: parsedOutput.distributionAnalysis,
            supplyChainAssessment: parsedOutput.supplyChainAssessment,
            regulatoryStatus: parsedOutput.regulatoryStatus,
            brandAnalysis: parsedOutput.brandAnalysis,
            competitivePosition: parsedOutput.competitivePosition,
            unitEconomicsDetailed: parsedOutput.unitEconomics,
          },
        },
      };

    } catch (error) {
      console.error("[foodtech-expert] Execution error:", error);
      return {
        agentName: "foodtech-expert" as SectorExpertType,
        success: false,
        executionTimeMs: Date.now() - startTime,
        cost: 0,
        error: error instanceof Error ? error.message : "Unknown error",
        data: getDefaultData(),
      };
    }
  },
};
