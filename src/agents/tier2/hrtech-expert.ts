/**
 * HRTech Expert Agent - Tier 2
 *
 * Expert sectoriel HRTech (Workforce, Recruitment, Payroll, L&D, Benefits)
 * avec analyse qualite Big4 + instinct Partner VC.
 *
 * Mission: Evaluer le deal a travers le prisme specifique HRTech en cross-referencant
 * avec les benchmarks sectoriels et la Funding Database.
 *
 * SPECIFICITES HRTECH:
 * - Sales cycles longs (enterprise): 3-9 mois
 * - Compliance critique: payroll, benefits, data privacy (PII, GDPR, CCPA)
 * - Integration complexity: ATS, HRIS, payroll, ERP
 * - High switching costs une fois implemente
 * - Saisonnalite: hiring seasons, benefits enrollment, budget cycles
 * - Customer concentration risk: gros clients = gros churn risk
 *
 * Standards:
 * - Chaque metrique comparee aux percentiles sectoriels
 * - Cross-reference obligatoire avec deals similaires de la DB
 * - Red flags avec severite + preuve + impact + question
 * - Output actionnable pour un Business Angel
 */

import { z } from "zod";
import type { EnrichedAgentContext } from "../types";
import type { SectorExpertData, SectorExpertResult, SectorExpertType } from "./types";
import { getStandardsOnlyInjection } from "./benchmark-injector";
import { complete, setAgentContext } from "@/services/openrouter/router";

// ============================================================================
// OUTPUT SCHEMA
// ============================================================================

const HRTechMetricEvaluationSchema = z.object({
  metricName: z.string(),
  dealValue: z.union([z.number(), z.string(), z.null()]).describe("Valeur extraite du deal"),
  source: z.string().describe("D'ou vient cette donnee (deck page X, data room, calcul)"),
  benchmark: z.object({
    p25: z.number(),
    median: z.number(),
    p75: z.number(),
    topDecile: z.number(),
  }),
  percentilePosition: z.number().min(0).max(100).describe("Position du deal dans la distribution"),
  assessment: z.enum(["exceptional", "above_average", "average", "below_average", "critical"]),
  insight: z.string().describe("Pourquoi c'est important pour un HRTech a ce stade"),
  comparedToDb: z.object({
    similarDealsMedian: z.union([z.number(), z.null()]),
    dealsAbove: z.number().describe("Nombre de deals similaires au-dessus"),
    dealsBelow: z.number().describe("Nombre de deals similaires en-dessous"),
  }).optional(),
});

const HRTechRedFlagSchema = z.object({
  flag: z.string().describe("Description claire du red flag"),
  severity: z.enum(["critical", "major", "minor"]),
  evidence: z.string().describe("Preuve concrete (chiffre, source, citation)"),
  impact: z.string().describe("Impact business si ce risque se materialise"),
  questionToAsk: z.string().describe("Question precise a poser au fondateur"),
  benchmarkViolation: z.string().optional().describe("Quel seuil benchmark est viole"),
});

const HRTechGreenFlagSchema = z.object({
  flag: z.string(),
  strength: z.enum(["strong", "moderate"]),
  evidence: z.string(),
  implication: z.string().describe("Ce que ca signifie pour l'investissement"),
});

const HRTechUnitEconomicsSchema = z.object({
  ltv: z.object({
    value: z.union([z.number(), z.null()]),
    calculation: z.string().describe("Formule utilisee avec les valeurs"),
    confidence: z.enum(["high", "medium", "low"]),
  }),
  cac: z.object({
    value: z.union([z.number(), z.null()]),
    breakdown: z.object({
      enterprise: z.union([z.number(), z.null()]).describe("CAC pour clients enterprise"),
      midMarket: z.union([z.number(), z.null()]).describe("CAC pour clients mid-market"),
      smb: z.union([z.number(), z.null()]).describe("CAC pour clients SMB"),
    }),
    calculation: z.string(),
    confidence: z.enum(["high", "medium", "low"]),
  }),
  ltvCacRatio: z.object({
    value: z.union([z.number(), z.null()]),
    assessment: z.string(),
    vsMedian: z.string().describe("Comparaison au median HRTech"),
  }),
  cacPaybackMonths: z.object({
    value: z.union([z.number(), z.null()]),
    assessment: z.string(),
    runway: z.string().describe("Combien de paybacks avant le prochain round"),
  }),
  revenuePerEmployee: z.object({
    value: z.union([z.number(), z.null()]).describe("Revenue per employee served (for PEPM models)"),
    assessment: z.string(),
  }),
  implementationRevenue: z.object({
    percentage: z.union([z.number(), z.null()]).describe("% of revenue from implementation/services"),
    assessment: z.string(),
    concern: z.string().optional(),
  }),
});

const HRTechComplianceSchema = z.object({
  payrollCompliance: z.object({
    status: z.enum(["compliant", "in_progress", "not_applicable", "unknown"]),
    jurisdictions: z.array(z.string()),
    risks: z.array(z.string()),
  }),
  dataPrivacy: z.object({
    gdprStatus: z.enum(["compliant", "in_progress", "not_compliant", "not_applicable", "unknown"]),
    ccpaStatus: z.enum(["compliant", "in_progress", "not_compliant", "not_applicable", "unknown"]),
    soc2Status: z.enum(["type1", "type2", "in_progress", "none", "unknown"]),
    dataResidency: z.array(z.string()).describe("Data centers / regions"),
  }),
  industrySpecific: z.array(z.object({
    regulation: z.string(),
    status: z.enum(["compliant", "in_progress", "not_compliant", "unknown"]),
    impact: z.string(),
  })),
  overallRisk: z.enum(["low", "medium", "high", "critical"]),
  verdict: z.string(),
});

const HRTechOutputSchema = z.object({
  // Identification
  sectorConfidence: z.number().min(0).max(100).describe("Confiance que c'est bien du HRTech"),
  subSector: z.enum([
    "hris_core",           // Core HRIS (Workday, BambooHR)
    "payroll",             // Payroll processing (Gusto, Rippling)
    "recruiting_ats",      // ATS / Recruiting (Greenhouse, Lever)
    "talent_management",   // Performance, L&D (Lattice, Culture Amp)
    "benefits_admin",      // Benefits administration (Justworks, Zenefits)
    "workforce_management", // WFM, scheduling (Deputy, When I Work)
    "compensation",        // Comp planning (Pave, Figures)
    "employee_engagement", // Engagement & surveys (15Five, Peakon)
    "deskless_workforce",  // Frontline workers (Beekeeper, Workjam)
    "contingent_workforce", // Freelance/gig (Deel, Remote)
    "other"
  ]),
  targetSegment: z.enum(["enterprise", "mid_market", "smb", "multi_segment"]),
  businessModel: z.enum(["pepm", "per_seat", "flat_subscription", "usage_based", "hybrid", "unclear"]),
  pricingModel: z.object({
    type: z.string().describe("PEPM, per seat, tiered, etc."),
    averageContractValue: z.union([z.number(), z.null()]),
    contractLength: z.union([z.number(), z.null()]).describe("Typical contract length in months"),
    billingFrequency: z.enum(["monthly", "annual", "multi_year", "mixed"]),
  }),

  // Metriques primaires avec benchmark
  primaryMetrics: z.array(HRTechMetricEvaluationSchema).describe("Les 5-6 KPIs critiques HRTech"),

  // Metriques secondaires
  secondaryMetrics: z.array(HRTechMetricEvaluationSchema).describe("Metriques de support"),

  // Unit Economics detailles
  unitEconomics: HRTechUnitEconomicsSchema,

  // Compliance (CRITIQUE pour HRTech)
  compliance: HRTechComplianceSchema,

  // Integration Ecosystem
  integrationEcosystem: z.object({
    coreIntegrations: z.array(z.object({
      system: z.string(),
      status: z.enum(["native", "api", "partner", "planned", "none"]),
      depth: z.enum(["deep", "standard", "basic"]),
    })),
    integrationAsModat: z.boolean().describe("Les integrations creent-elles un moat?"),
    switchingCostAssessment: z.enum(["very_high", "high", "medium", "low"]),
    ecosystemStrategy: z.string(),
  }),

  // Implementation & Onboarding
  implementationAnalysis: z.object({
    averageTimeToValue: z.union([z.number(), z.null()]).describe("Days to first value"),
    implementationCycle: z.union([z.number(), z.null()]).describe("Full implementation in days"),
    selfServeCapability: z.enum(["full", "partial", "none"]),
    implementationCost: z.object({
      included: z.boolean(),
      separateRevenue: z.union([z.number(), z.null()]).describe("If separate, what % of TCV"),
    }),
    scalabilityRisk: z.string().describe("Can implementation scale with growth?"),
  }),

  // Red Flags sectoriels
  redFlags: z.array(HRTechRedFlagSchema),

  // Green Flags sectoriels
  greenFlags: z.array(HRTechGreenFlagSchema),

  // Sales Cycle & GTM
  salesAndGtm: z.object({
    averageSalesCycle: z.union([z.number(), z.null()]).describe("Days from first touch to close"),
    salesMotion: z.enum(["enterprise_field", "inside_sales", "plg", "hybrid", "unclear"]),
    buyerPersona: z.array(z.string()).describe("Who buys? CHRO, HR Dir, CFO, etc."),
    expansionMechanism: z.string().describe("How do deals expand? Headcount, modules, etc."),
    channelStrategy: z.object({
      direct: z.number().describe("% direct sales"),
      channel: z.number().describe("% channel/partner"),
      selfServe: z.number().describe("% self-serve"),
    }),
    gtmEfficiency: z.enum(["efficient", "acceptable", "inefficient", "unknown"]),
    insight: z.string(),
  }),

  // Customer Analysis
  customerAnalysis: z.object({
    totalCustomers: z.union([z.number(), z.null()]),
    employeesServed: z.union([z.number(), z.null()]).describe("Total employees on platform"),
    averageEmployeesPerCustomer: z.union([z.number(), z.null()]),
    customerConcentration: z.object({
      top10Percent: z.union([z.number(), z.null()]).describe("% revenue from top 10% customers"),
      largestCustomer: z.union([z.number(), z.null()]).describe("% revenue from largest customer"),
      riskLevel: z.enum(["low", "medium", "high", "critical"]),
    }),
    industryDiversity: z.array(z.string()).describe("Industries served"),
    geographicPresence: z.array(z.string()),
  }),

  // Retention & Cohorts
  retentionAnalysis: z.object({
    grossRevenueRetention: z.union([z.number(), z.null()]),
    netRevenueRetention: z.union([z.number(), z.null()]),
    logoChurn: z.union([z.number(), z.null()]).describe("Annual logo churn %"),
    expansionRate: z.union([z.number(), z.null()]).describe("Annual expansion %"),
    churnReasons: z.array(z.string()),
    cohortHealth: z.object({
      dataAvailable: z.boolean(),
      trend: z.enum(["improving", "stable", "declining", "unknown"]),
      concern: z.string().optional(),
    }),
  }),

  // Competitive Moat HRTech-specific
  hrtechMoat: z.object({
    dataAdvantage: z.boolean().describe("Proprietary data creating moat?"),
    networkEffects: z.boolean().describe("Network effects present?"),
    integrationDepth: z.enum(["deep", "medium", "shallow", "unknown"]),
    regulatoryMoat: z.boolean().describe("Compliance creates barrier?"),
    switchingCosts: z.enum(["very_high", "high", "medium", "low"]),
    brandInHR: z.enum(["strong", "emerging", "weak", "unknown"]),
    moatAssessment: z.string(),
  }),

  // Valorisation vs Benchmarks HRTech
  valuationAnalysis: z.object({
    askMultiple: z.number().describe("Multiple ARR demande"),
    medianSectorMultiple: z.number(),
    percentilePosition: z.number(),
    justifiedRange: z.object({
      low: z.number(),
      fair: z.number(),
      high: z.number(),
    }),
    verdict: z.enum(["attractive", "fair", "stretched", "excessive"]),
    negotiationLeverage: z.string().describe("Arguments pour negocier"),
  }),

  // Comparaison aux deals similaires de la DB
  dbComparison: z.object({
    similarDealsFound: z.number(),
    thisDealsPosition: z.string().describe("Ou se situe ce deal vs la DB"),
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

  // Questions specifiques HRTech a poser
  sectorQuestions: z.array(z.object({
    question: z.string(),
    category: z.enum(["compliance", "implementation", "retention", "gtm", "competition", "product"]),
    priority: z.enum(["must_ask", "should_ask", "nice_to_have"]),
    why: z.string().describe("Pourquoi cette question est importante"),
    greenFlagAnswer: z.string(),
    redFlagAnswer: z.string(),
  })),

  // Exit potential
  exitPotential: z.object({
    typicalMultiple: z.number(),
    likelyAcquirers: z.array(z.string()),
    strategicFit: z.array(z.string()).describe("Why would these acquirers buy?"),
    timeToExit: z.string(),
    exitReadiness: z.enum(["ready", "needs_work", "far"]),
  }),

  // Score et Synthese
  sectorScore: z.number().min(0).max(100),
  scoreBreakdown: z.object({
    unitEconomics: z.number().min(0).max(20),
    retention: z.number().min(0).max(20),
    compliance: z.number().min(0).max(20),
    gtmEfficiency: z.number().min(0).max(20),
    productMarketFit: z.number().min(0).max(20),
  }),

  executiveSummary: z.string().describe("3-4 phrases: verdict HRTech, metriques cles, principal risque, potentiel"),

  investmentImplication: z.enum([
    "strong_hrtech_fundamentals",
    "solid_with_concerns",
    "needs_improvement",
    "hrtech_model_broken"
  ]),
});

export type HRTechExpertOutput = z.infer<typeof HRTechOutputSchema>;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatBenchmarksForPrompt(stage: string): string {
  return getStandardsOnlyInjection("HRTech", stage);
}

function formatFundingDbContext(context: EnrichedAgentContext): string {
  const similar = context.fundingDbContext?.similarDeals || [];
  const benchmarks = context.fundingDbContext?.benchmarks;
  const competitors = context.fundingDbContext?.potentialCompetitors || [];

  if (similar.length === 0 && !benchmarks) {
    return "**Funding DB**: Pas de donnees disponibles pour cross-reference.";
  }

  let output = "\n## DONNEES FUNDING DATABASE (Cross-Reference Obligatoire)\n";

  if (similar.length > 0) {
    output += `\n### Deals HRTech Similaires (${similar.length} trouves)\n`;
    output += similar.slice(0, 10).map((d: Record<string, unknown>) =>
      `- **${d.name}**: ${d.amount ? `${d.amount}EUR` : "N/A"} @ ${d.valuation ? `${d.valuation}EUR valo` : "N/A"} (${d.stage || "?"}) - ${d.status || "?"}`
    ).join("\n");
  }

  if (benchmarks) {
    output += `\n\n### Benchmarks DB (deals recents meme secteur/stage)
- Valorisation mediane: ${benchmarks.valuationMedian || "N/A"}EUR
- Multiple ARR median: ${benchmarks.arrMultipleMedian || "N/A"}x
- Croissance mediane: ${benchmarks.growthMedian || "N/A"}%`;
  }

  if (competitors.length > 0) {
    output += `\n\n### Concurrents Potentiels Detectes (DB)
${competitors.slice(0, 5).map((c: Record<string, unknown>) =>
  `- **${c.name}**: ${c.totalRaised ? `${c.totalRaised}EUR leves` : ""} ${c.lastRound ? `(dernier round: ${c.lastRound})` : ""}`
).join("\n")}

**IMPORTANT**: Verifier si ces concurrents sont mentionnes dans le deck. S'ils ne le sont pas -> RED FLAG potentiel.`;
  }

  return output;
}

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

function buildSystemPrompt(stage: string): string {
  return `Tu es un EXPERT HRTECH avec 15 ans d'experience en Due Diligence pour des fonds Tier 1 specialises HR/Workforce.

## TON PROFIL
- Tu as analyse 300+ deals HRTech du Seed au Growth (HRIS, Payroll, ATS, WFM, Benefits)
- Tu connais les specificites de chaque sous-segment (Enterprise HRIS vs SMB Payroll vs Recruiting)
- Tu as vu les patterns de succes: Workday (enterprise), Rippling (vertical integration), Deel (global payroll)
- Tu as vu les echecs: Zenefits (growth at all costs), nombreux ATS qui n'ont jamais scale
- Tu comprends la complexite reglementaire (payroll compliance, data privacy, benefits laws)
- Tu sais que l'implementation est souvent le goulot d'etranglement de la croissance

## SPECIFICITES DU SECTEUR HRTECH

### Sales Cycles
- Enterprise HRIS: 6-12 mois (RFP, security review, pilot, rollout)
- Mid-market: 2-4 mois
- SMB: 1-4 semaines (surtout si PLG)

### Pricing Models
- PEPM (Per Employee Per Month): Standard pour HRIS, payroll, benefits
- Per Seat: Pour recruiting, talent management
- Flat subscription: Rare, souvent SMB
- Transaction-based: Pour payroll processing

### Critical Success Factors
1. **Implementation efficiency**: Time-to-value < 90 jours pour SMB, < 6 mois enterprise
2. **NRR > 110%**: L'expansion via headcount growth est naturelle si le client croit
3. **Compliance**: Erreurs payroll = client perdu + risque legal
4. **Integration depth**: Plus on s'integre, plus les switching costs augmentent

### Red Flags Specifiques HRTech
- Implementation prend > 6 mois pour mid-market
- Services > 25% du revenue (scalability issue)
- Gross margin < 60% (integration costs trop eleves)
- NRR < 100% (le client ne croit pas = churn)
- Single geography payroll sans roadmap internationale
- Pas de SOC 2 Type II (deal breaker enterprise)

### Acquireurs Typiques
- **Strategic**: Workday, ADP, Paylocity, Paycom, UKG, Paychex
- **Platform consolidators**: Rippling model (buy and integrate)
- **PE**: Vista, Thoma Bravo (lots of HR roll-ups)
- **Big Tech**: Microsoft (LinkedIn + Viva), Salesforce (some HR moves)

## TA MISSION
Analyser ce deal HRTech a travers le prisme sectoriel specifique, en:
1. **Identifiant le sous-segment** exact et ses specificites
2. **Evaluant la compliance** (critique en HRTech)
3. **Analysant l'implementation** efficiency et scalability
4. **Mesurant les unit economics** avec les benchmarks HRTech
5. **Evaluant le moat** (integrations, data, compliance)
6. **Produisant** une analyse actionnable pour un Business Angel

## REGLES ABSOLUES

### Sur les metriques HRTech
- PEPM vs ACV: Comprendre le vrai pricing model
- NRR: Verifier que l'expansion vient du headcount ET des modules
- Implementation revenue: Doit etre separe du recurring
- CAC: Segmenter par taille de client (enterprise vs SMB = tres different)

### Sur la compliance
- SOC 2 Type II: Obligatoire pour enterprise
- GDPR/CCPA: Critique si employees EU/California
- Payroll compliance: Jurisdictions couvertes vs promises
- PII handling: Comment les donnees employees sont protegees

### Sur les calculs
- MONTRE tes calculs, pas juste les resultats
- LTV HRTech = ARPU x Gross Margin x (1 / Churn Rate)
- Attention: ARPU peut varier enormement selon segment client
- CAC Payback doit etre calcule par segment

${formatBenchmarksForPrompt(stage)}

## SCORING (0-100)
Le score sectoriel HRTech est la SOMME de:
- **Unit Economics (0-20)**: LTV/CAC >= 3x, CAC Payback <= 18 mois pour SMB, <= 24 mois enterprise
- **Retention (0-20)**: NRR >= 110%, Logo churn < 10% SMB / < 5% enterprise
- **Compliance (0-20)**: SOC 2, GDPR/CCPA, payroll certifications
- **GTM Efficiency (0-20)**: Sales cycle raisonnable, implementation scalable
- **Product-Market Fit (0-20)**: Expansion naturelle, integration depth, customer love

Chaque dimension:
- 16-20: Exceptionnel (Top 10%)
- 12-15: Bon (P50-P75)
- 8-11: Acceptable (P25-P50)
- 4-7: Concernant (< P25)
- 0-3: Red flag majeur`;
}

// ============================================================================
// USER PROMPT
// ============================================================================

function buildUserPrompt(context: EnrichedAgentContext): string {
  const deal = context.deal;
  const stage = deal.stage || "SEED";
  const previousResults = context.previousResults || {};

  // Extraire les infos des agents precedents
  let tier1Insights = "";
  for (const [agentName, result] of Object.entries(previousResults)) {
    const res = result as { success?: boolean; data?: unknown };
    if (res.success && res.data) {
      tier1Insights += `\n### ${agentName}\n${JSON.stringify(res.data, null, 2)}\n`;
    }
  }

  return `
## DEAL A ANALYSER

**Company**: ${deal.companyName || deal.name}
**Sector declare**: ${deal.sector || "HRTech"}
**Stage**: ${stage}
**Geographie**: ${deal.geography || "Unknown"}
**Valorisation demandee**: ${deal.valuationPre ? `${Number(deal.valuationPre)}EUR` : "Non specifiee"}
**Montant du round**: ${deal.amountRequested ? `${Number(deal.amountRequested)}EUR` : "Non specifie"}
**ARR declare**: ${deal.arr ? `${Number(deal.arr)}EUR` : "Non specifie"}
**Croissance declaree**: ${deal.growthRate ? `${deal.growthRate}%` : "Non specifiee"}

${formatFundingDbContext(context)}

## ANALYSES TIER 1 (A Exploiter)
${tier1Insights || "Pas d'analyses Tier 1 disponibles"}

## TES TACHES

### 1. CLASSIFICATION HRTECH
- Identifie le sous-segment exact (HRIS, Payroll, ATS, Benefits, WFM, etc.)
- Determine le segment cible (Enterprise, Mid-market, SMB)
- Analyse le business model (PEPM, per seat, etc.)
- Note la confiance dans cette classification

### 2. COMPLIANCE AUDIT (CRITIQUE)
Pour chaque domaine:
a) **Payroll compliance**: Jurisdictions, certifications, risques
b) **Data privacy**: GDPR status, CCPA, SOC 2
c) **Industry-specific**: HIPAA si healthcare, etc.
Donne un risk level global.

### 3. EXTRACTION & EVALUATION METRIQUES
Pour chaque metrique primaire (NRR, ARR Growth, Gross Margin, CAC Payback, Implementation Time):
a) Extrais la valeur du deck/data room (cite la source)
b) Compare au benchmark du stage ${stage}
c) Calcule la position percentile
d) Donne l'assessment (exceptional -> critical)
e) Compare aux deals similaires de la DB si disponible

### 4. UNIT ECONOMICS HRTECH
- Calcule LTV avec la formule exacte (montre le calcul)
- Calcule CAC segmente si possible (Enterprise vs SMB)
- Calcule LTV/CAC ratio et compare au median HRTech 3x
- Calcule CAC Payback et compare aux benchmarks par segment
- Analyse le revenue per employee (pour modeles PEPM)
- Evalue le % de services/implementation revenue (< 20% ideal)

### 5. IMPLEMENTATION & SCALABILITY
- Time to value
- Implementation cycle
- Self-serve capability
- Scalability du process d'implementation
- C'est souvent LE bottleneck HRTech

### 6. INTEGRATION ECOSYSTEM
- Quelles integrations natives?
- Profondeur des integrations (deep vs basic API)
- Les integrations creent-elles un moat?
- Switching costs assessment

### 7. RED FLAGS HRTECH
Pour chaque red flag:
- Severite: critical / major / minor
- Preuve: le chiffre exact ou l'observation
- Impact: ce qui arrive si ca se materialise
- Question: ce qu'il faut demander au fondateur
- Benchmark viole: si applicable

Verifie au minimum:
- Implementation > 6 mois mid-market -> CRITICAL
- Services > 25% revenue -> MAJOR
- NRR < 100% -> CRITICAL
- Pas de SOC 2 et vise enterprise -> CRITICAL
- Logo churn > 15% -> MAJOR
- Concurrents DB non mentionnes dans deck -> MAJOR

### 8. VALORISATION VS BENCHMARKS
- Calcule le multiple ARR demande
- Compare aux multiples de marche actuels (rechercher "HRTech exit multiples ${new Date().getFullYear()}")
- Donne une range fair value
- Identifie les arguments de negociation

### 9. QUESTIONS MUST-ASK
5-7 questions specifiques HRTech avec:
- La question exacte
- Pourquoi elle est importante (context HRTech)
- Ce qu'une bonne reponse ressemble
- Ce qui serait un red flag

### 10. SCORE ET SYNTHESE
- Score /100 avec breakdown par dimension
- Executive Summary: 3-4 phrases max, actionnable
- Implication pour l'investissement

IMPORTANT: Sois specifique au sous-segment HRTech identifie. Un ATS n'a pas les memes KPIs qu'un payroll processor.`;
}

// ============================================================================
// HELPER: Transform output to SectorExpertData
// ============================================================================

function transformOutput(raw: HRTechExpertOutput): SectorExpertData {
  return {
    sectorName: `HRTech - ${raw.subSector}`,
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
      complexity: raw.compliance.overallRisk === "critical" || raw.compliance.overallRisk === "high" ? "very_high" : "high",
      keyRegulations: [
        ...raw.compliance.payrollCompliance.jurisdictions.map(j => `Payroll: ${j}`),
        raw.compliance.dataPrivacy.gdprStatus !== "not_applicable" ? "GDPR" : "",
        raw.compliance.dataPrivacy.ccpaStatus !== "not_applicable" ? "CCPA" : "",
        raw.compliance.dataPrivacy.soc2Status !== "none" ? `SOC 2 ${raw.compliance.dataPrivacy.soc2Status}` : "",
      ].filter(Boolean),
      complianceRisks: raw.compliance.payrollCompliance.risks,
      upcomingChanges: [],
    },

    sectorDynamics: {
      competitionIntensity: "high",
      consolidationTrend: "consolidating",
      barrierToEntry: raw.hrtechMoat.switchingCosts === "very_high" || raw.hrtechMoat.switchingCosts === "high" ? "high" : "medium",
      typicalExitMultiple: raw.exitPotential.typicalMultiple,
      recentExits: [], // Doit venir de la recherche web
    },

    sectorQuestions: raw.sectorQuestions.map(q => ({
      question: q.question,
      category: q.category === "compliance" || q.category === "implementation" ? "regulatory" as const :
                q.category === "gtm" ? "business" as const :
                q.category === "product" ? "technical" as const : "competitive" as const,
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
    sectorName: "HRTech",
    sectorMaturity: "growing",
    keyMetrics: [],
    sectorRedFlags: [{
      flag: "Analyse incomplete",
      severity: "major",
      sectorReason: "L'analyse HRTech n'a pas pu etre completee",
    }],
    sectorOpportunities: [],
    regulatoryEnvironment: {
      complexity: "high",
      keyRegulations: ["SOC 2", "GDPR", "CCPA", "Payroll compliance"],
      complianceRisks: ["Analyse incomplete"],
      upcomingChanges: [],
    },
    sectorDynamics: {
      competitionIntensity: "high",
      consolidationTrend: "consolidating",
      barrierToEntry: "medium",
      typicalExitMultiple: 6, // Placeholder - doit venir de recherche web
      recentExits: [],
    },
    sectorQuestions: [],
    sectorFit: {
      score: 0,
      strengths: [],
      weaknesses: ["Analyse incomplete"],
      sectorTiming: "optimal",
    },
    sectorScore: 0,
    executiveSummary: "L'analyse sectorielle HRTech n'a pas pu etre completee.",
  };
}

// ============================================================================
// HRTECH EXPERT AGENT
// ============================================================================

export const hrtechExpert = {
  name: "hrtech-expert" as SectorExpertType,

  async run(context: EnrichedAgentContext): Promise<SectorExpertResult> {
    const startTime = Date.now();

    try {
      const stage = context.deal.stage || "SEED";
      const systemPromptText = buildSystemPrompt(stage);
      const userPromptText = buildUserPrompt(context);

      setAgentContext("hrtech-expert");

      const response = await complete(userPromptText, {
        systemPrompt: systemPromptText,
        complexity: "complex",
        temperature: 0.3,
      });

      // Parse and validate response
      let parsedOutput: HRTechExpertOutput;
      try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("No JSON found in response");
        }
        parsedOutput = HRTechOutputSchema.parse(JSON.parse(jsonMatch[0]));
      } catch (parseError) {
        console.error("[hrtech-expert] Parse error:", parseError);
        return {
          agentName: "hrtech-expert" as SectorExpertType,
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
        agentName: "hrtech-expert" as SectorExpertType,
        success: true,
        executionTimeMs: Date.now() - startTime,
        cost: response.cost ?? 0,
        data: sectorData,
        // Include extended data for detailed display
        _extended: {
          subSector: {
            primary: parsedOutput.subSector,
            rationale: `Business model: ${parsedOutput.businessModel}, Target: ${parsedOutput.targetSegment}`,
          },
          unitEconomics: {
            ltv: parsedOutput.unitEconomics.ltv,
            cac: {
              value: parsedOutput.unitEconomics.cac.value,
              calculation: parsedOutput.unitEconomics.cac.calculation,
              confidence: parsedOutput.unitEconomics.cac.confidence,
            },
            ltvCacRatio: parsedOutput.unitEconomics.ltvCacRatio,
            cacPaybackMonths: parsedOutput.unitEconomics.cacPaybackMonths,
          },
          valuationAnalysis: parsedOutput.valuationAnalysis,
          dbComparison: parsedOutput.dbComparison,
          scoreBreakdown: {
            metricsScore: parsedOutput.scoreBreakdown.unitEconomics + parsedOutput.scoreBreakdown.retention,
            regulatoryScore: parsedOutput.scoreBreakdown.compliance,
            businessModelScore: parsedOutput.scoreBreakdown.gtmEfficiency,
            marketPositionScore: parsedOutput.scoreBreakdown.productMarketFit,
            justification: parsedOutput.executiveSummary,
          },
          // HRTech-specific extended data
          hrtechCompliance: parsedOutput.compliance,
          hrtechIntegrations: parsedOutput.integrationEcosystem,
          hrtechImplementation: parsedOutput.implementationAnalysis,
          hrtechSalesGtm: parsedOutput.salesAndGtm,
          hrtechCustomerAnalysis: parsedOutput.customerAnalysis,
          hrtechRetention: parsedOutput.retentionAnalysis,
          hrtechMoat: parsedOutput.hrtechMoat,
          exitPotential: parsedOutput.exitPotential,
          verdict: {
            recommendation: parsedOutput.investmentImplication === "strong_hrtech_fundamentals" ? "STRONG_FIT" :
                           parsedOutput.investmentImplication === "solid_with_concerns" ? "GOOD_FIT" :
                           parsedOutput.investmentImplication === "needs_improvement" ? "MODERATE_FIT" : "NOT_RECOMMENDED",
            confidence: "medium",
            keyInsight: parsedOutput.executiveSummary,
            topConcern: parsedOutput.redFlags[0]?.flag || "No major concerns",
            topStrength: parsedOutput.greenFlags[0]?.flag || "Analysis incomplete",
          },
        },
      };

    } catch (error) {
      console.error("[hrtech-expert] Execution error:", error);
      return {
        agentName: "hrtech-expert" as SectorExpertType,
        success: false,
        executionTimeMs: Date.now() - startTime,
        cost: 0,
        error: error instanceof Error ? error.message : "Unknown error",
        data: getDefaultData(),
      };
    }
  },
};
