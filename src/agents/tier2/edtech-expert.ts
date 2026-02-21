/**
 * EdTech Expert Agent - Tier 2
 *
 * Expert sectoriel Education Technology avec analyse qualité Big4 + instinct Partner VC.
 *
 * Mission: Évaluer le deal à travers le prisme spécifique EdTech
 * en cross-référençant avec les benchmarks sectoriels et la Funding Database.
 *
 * Standards:
 * - Chaque métrique comparée aux percentiles sectoriels
 * - Cross-reference obligatoire avec deals similaires de la DB
 * - Red flags avec sévérité + preuve + impact + question
 * - Output actionnable pour un Business Angel
 *
 * Spécificités EdTech:
 * - B2C vs B2B (schools) vs B2B2C (corporate) - modèles très différents
 * - Completion rates sont LE metric clé - pas d'outcomes sans completion
 * - Cycles de vente école: longs (12-18 mois), saisonniers (Q1-Q2)
 * - Réglementation: COPPA, FERPA, accessibilité
 * - Free alternatives: Khan Academy, YouTube, ChatGPT
 */

import { z } from "zod";
import type { EnrichedAgentContext } from "../types";
import type { SectorExpertData, SectorExpertResult, SectorExpertType } from "./types";
import { getStandardsOnlyInjection } from "./benchmark-injector";
import { EDTECH_STANDARDS } from "./sector-standards";
import { complete, setAgentContext, extractFirstJSON } from "@/services/openrouter/router";

// ============================================================================
// OUTPUT SCHEMA
// ============================================================================

const EdTechMetricEvaluationSchema = z.object({
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
  insight: z.string().describe("Pourquoi c'est important pour un EdTech à ce stade"),
  comparedToDb: z.object({
    similarDealsMedian: z.union([z.number(), z.null()]),
    dealsAbove: z.number().describe("Nombre de deals similaires au-dessus"),
    dealsBelow: z.number().describe("Nombre de deals similaires en-dessous"),
  }).optional(),
});

const EdTechRedFlagSchema = z.object({
  flag: z.string().describe("Description claire du red flag"),
  severity: z.enum(["critical", "major", "minor"]),
  evidence: z.string().describe("Preuve concrète (chiffre, source, citation)"),
  impact: z.string().describe("Impact business si ce risque se matérialise"),
  questionToAsk: z.string().describe("Question précise à poser au fondateur"),
  benchmarkViolation: z.string().optional().describe("Quel seuil benchmark est violé"),
});

const EdTechGreenFlagSchema = z.object({
  flag: z.string(),
  strength: z.enum(["strong", "moderate"]),
  evidence: z.string(),
  implication: z.string().describe("Ce que ça signifie pour l'investissement"),
});

const EdTechUnitEconomicsSchema = z.object({
  learnerLtv: z.object({
    value: z.union([z.number(), z.null()]),
    calculation: z.string().describe("Formule utilisée avec les valeurs"),
    confidence: z.enum(["high", "medium", "low"]),
  }),
  lac: z.object({
    value: z.union([z.number(), z.null()]),
    calculation: z.string(),
    confidence: z.enum(["high", "medium", "low"]),
    segment: z.enum(["b2c", "b2b_schools", "b2b_corporate", "mixed"]).describe("Quel segment"),
  }),
  ltvLacRatio: z.object({
    value: z.union([z.number(), z.null()]),
    assessment: z.string(),
    vsMedian: z.string().describe("Comparaison au median EdTech"),
  }),
  lacPaybackMonths: z.object({
    value: z.union([z.number(), z.null()]),
    assessment: z.string(),
  }),
  contentRoi: z.object({
    value: z.union([z.number(), z.null()]),
    assessment: z.string(),
  }).optional(),
  engagementScore: z.object({
    value: z.union([z.number(), z.null()]),
    calculation: z.string(),
    assessment: z.string(),
  }).optional(),
});

const EdTechOutputSchema = z.object({
  // Identification
  sectorConfidence: z.number().min(0).max(100).describe("Confiance que c'est bien de l'EdTech"),
  subSector: z.enum([
    "k12_b2b",           // Selling to schools/districts
    "k12_b2c",           // Parents/students direct
    "higher_ed_b2b",     // Universities
    "corporate_learning", // L&D, upskilling
    "bootcamp_iSA",      // Coding bootcamps, ISA model
    "language_learning", // Duolingo-type
    "test_prep",         // SAT, GMAT, etc.
    "early_childhood",   // Pre-K
    "creator_tools",     // Course creation platforms
    "tutoring",          // 1:1 or small group
    "mixed",             // Multiple segments
  ]),
  businessModel: z.enum([
    "subscription_b2c",    // Learner pays monthly/yearly
    "subscription_b2b",    // School/company pays per seat
    "freemium",            // Free tier + premium
    "isa",                 // Income Share Agreement
    "one_time_purchase",   // Course purchase
    "transaction",         // Per lesson/session
    "hybrid",              // Multiple models
    "unclear",
  ]),

  // Métriques primaires avec benchmark
  primaryMetrics: z.array(EdTechMetricEvaluationSchema).describe("Les 5-6 KPIs critiques EdTech"),

  // Métriques secondaires
  secondaryMetrics: z.array(EdTechMetricEvaluationSchema).describe("Métriques de support"),

  // Unit Economics détaillés
  unitEconomics: EdTechUnitEconomicsSchema,

  // Red Flags sectoriels
  redFlags: z.array(EdTechRedFlagSchema),

  // Green Flags sectoriels
  greenFlags: z.array(EdTechGreenFlagSchema),

  // Engagement & Outcomes Analysis
  engagementAnalysis: z.object({
    completionRate: z.object({
      value: z.union([z.number(), z.null()]),
      vsIndustry: z.string(),
      trend: z.enum(["improving", "stable", "declining", "unknown"]),
    }),
    activeUsersRatio: z.object({
      mal: z.union([z.number(), z.null()]).describe("Monthly Active Learners"),
      totalEnrolled: z.union([z.number(), z.null()]),
      ratio: z.union([z.number(), z.null()]),
      assessment: z.string(),
    }),
    learningOutcomes: z.object({
      hasEfficacyData: z.boolean(),
      outcomesDescription: z.string(),
      assessment: z.enum(["proven", "promising", "no_data", "concerning"]),
    }),
    retentionCohorts: z.object({
      dataAvailable: z.boolean(),
      d7Retention: z.union([z.number(), z.null()]),
      d30Retention: z.union([z.number(), z.null()]),
      assessment: z.string(),
    }),
  }),

  // Go-to-Market Assessment (EdTech specific)
  gtmAssessment: z.object({
    model: z.enum(["direct_to_consumer", "direct_to_school", "channel_partners", "plg", "hybrid", "unclear"]),
    salesCycle: z.object({
      lengthMonths: z.union([z.number(), z.null()]),
      seasonality: z.string().describe("Quand les achats se font"),
      complexity: z.enum(["simple", "moderate", "complex", "very_complex"]),
    }),
    teacherAdoption: z.object({
      status: z.enum(["strong", "moderate", "weak", "not_applicable", "unknown"]),
      nps: z.union([z.number(), z.null()]),
      insight: z.string(),
    }),
    keyInsight: z.string(),
  }),

  // Regulatory & Compliance (critical for EdTech)
  regulatoryStatus: z.object({
    coppaCompliance: z.enum(["compliant", "in_progress", "not_compliant", "not_applicable", "unknown"]).describe("Children's Online Privacy Protection Act"),
    ferpaCompliance: z.enum(["compliant", "in_progress", "not_compliant", "not_applicable", "unknown"]).describe("Family Educational Rights and Privacy Act"),
    accessibilityStatus: z.enum(["wcag_aa", "partial", "not_compliant", "unknown"]).describe("WCAG 2.1 AA for accessibility"),
    dataPrivacy: z.object({
      gdprReady: z.boolean(),
      studentDataPolicy: z.enum(["strong", "adequate", "weak", "unknown"]),
    }),
    riskLevel: z.enum(["low", "medium", "high", "critical"]),
    concerns: z.array(z.string()),
  }),

  // Competitive Moat EdTech-specific
  edtechCompetitiveMoat: z.object({
    contentDifferentiation: z.enum(["proprietary", "licensed", "ugc", "commodity"]),
    adaptiveTechnology: z.boolean().describe("AI-driven personalization"),
    credentialValue: z.enum(["industry_recognized", "growing", "limited", "none"]),
    networkEffects: z.boolean().describe("Peer learning, community, UGC"),
    lmsIntegration: z.object({
      integrated: z.boolean(),
      platforms: z.array(z.string()).describe("Canvas, Blackboard, Google Classroom, etc."),
    }),
    switchingCosts: z.enum(["high", "medium", "low"]),
    moatAssessment: z.string(),
  }),

  // Valorisation vs Benchmarks EdTech
  valuationAnalysis: z.object({
    askMultiple: z.number().describe("Multiple demandé (ARR ou Revenue)"),
    basisMetric: z.enum(["arr", "revenue", "gmv", "learners"]),
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

  // Questions spécifiques EdTech à poser
  sectorQuestions: z.array(z.object({
    question: z.string(),
    category: z.enum(["engagement", "outcomes", "gtm", "regulatory", "competition", "unit_economics"]),
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
    bestExitPath: z.enum(["strategic_acquisition", "pe_buyout", "ipo", "unclear"]),
  }),

  // Score et Synthèse
  sectorScore: z.number().min(0).max(100),
  scoreBreakdown: z.object({
    engagement: z.number().min(0).max(25).describe("Completion, MAL, retention"),
    unitEconomics: z.number().min(0).max(25).describe("LTV/CAC, payback"),
    gtmEfficiency: z.number().min(0).max(25).describe("Sales cycle, teacher adoption"),
    moatRegulatory: z.number().min(0).max(25).describe("Differentiation, compliance"),
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


  executiveSummary: z.string().describe("3-4 phrases: verdict EdTech, métriques clés, principal risque, potentiel"),

  investmentImplication: z.enum([
    "strong_edtech_fundamentals",
    "solid_with_concerns",
    "needs_improvement",
    "edtech_model_broken"
  ]),
});

export type EdTechExpertOutput = z.infer<typeof EdTechOutputSchema>;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Retourne les standards et benchmarks pour le prompt
 */
function formatBenchmarksForPrompt(stage: string): string {
  return getStandardsOnlyInjection("EdTech", stage);
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
    output += `\n### Deals EdTech Similaires (${similar.length} trouvés)\n`;
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
  return `Tu es un EXPERT EDTECH avec 15 ans d'expérience en Due Diligence pour des fonds spécialisés éducation (Reach Capital, GSV, Learn Capital, Owl Ventures).

## TON PROFIL
- Tu as analysé 300+ EdTech du Pre-Seed au Growth
- Tu connais les différences critiques entre B2C, B2B schools, et Corporate L&D
- Tu sais que le COMPLETION RATE est la métrique #1 - pas d'outcomes sans completion
- Tu as vu des EdTech échouer malgré de beaux téléchargements (pas d'engagement)
- Tu as vu des EdTech réussir en vendant aux écoles malgré des cycles de 18 mois
- Tu connais les pièges: shelfware, teacher resistance, free alternatives

## TON EXPERTISE SPÉCIFIQUE
- K-12 B2B: Cycles de vente longs, décisions politiques, COPPA/FERPA
- Corporate Learning: CAC élevé mais rétention forte, ROI mesurable
- B2C Education: CAC brutal, churns élevés, but LTV potentiel via subscriptions
- Bootcamps/ISA: Model aligné sur outcomes mais risque de défaut
- Content economics: Coût de production vs. scalabilité du contenu

## TA MISSION
Analyser ce deal EdTech à travers le prisme sectoriel spécifique, en:
1. **Identifiant** le sous-segment exact (K-12 B2B, Corporate, B2C, etc.)
2. **Évaluant** le COMPLETION RATE et l'ENGAGEMENT - les metrics qui comptent vraiment
3. **Vérifiant** les preuves d'OUTCOMES - l'EdTech vend des résultats, pas du contenu
4. **Analysant** le GTM - est-ce que ça marche avec les enseignants/formateurs?
5. **Checkant** la compliance COPPA/FERPA si applicable
6. **Cross-référençant** avec la Funding Database
7. **Produisant** une analyse actionnable pour un Business Angel

## RÈGLES ABSOLUES

### Sur les métriques EdTech
- COMPLETION RATE est ROI: Un cours pas fini = pas de valeur = pas de retention
- MAL (Monthly Active Learners) > Downloads ou inscriptions
- Learning Outcomes > Time on Platform (le temps sans résultats = vanity)
- Teacher/Instructor NPS est prédictif de l'adoption en B2B
- District Penetration > Contracts signés (usage réel vs shelfware)

### Sur les business models
- B2C: CAC brutal ($50-150), besoin de virality ou LTV très élevé
- B2B Schools: Cycles 12-18 mois, Q1-Q2 buying season, budget dependency
- Corporate: Plus prévisible, mais CAC élevé et concurrence (LinkedIn Learning, etc.)
- ISA/Bootcamp: Aligned incentives mais risque de défaut, régulateur watchful

### Sur les red flags
- Chaque red flag DOIT avoir: sévérité + preuve + impact + question
- Pas de red flags génériques
- Si completion < 10% → CRITICAL (même les MOOCs font mieux)
- Si pas de données outcomes → MAJOR (comment prouver la valeur?)
- Si pas de teacher buy-in en B2B schools → CRITICAL (condamné au shelfware)

### Sur la compliance
- COPPA si users < 13 ans → CRITIQUE de vérifier
- FERPA si données étudiants → CRITIQUE de vérifier
- Accessibility (ADA/WCAG) → De plus en plus exigé

${formatBenchmarksForPrompt(stage)}

## SCORING (0-100)
Le score sectoriel EdTech est la SOMME de:
- **Engagement (0-25)**: Completion rate, MAL ratio, retention cohorts
- **Unit Economics (0-25)**: LTV/LAC ≥3x, Payback ≤12 mois
- **GTM Efficiency (0-25)**: Sales cycle, teacher adoption, seasonality management
- **Moat & Regulatory (0-25)**: Différenciation, compliance, switching costs

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

  // Extraire les infos des agents précédents
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
**Sector déclaré**: ${deal.sector || "EdTech"}
**Stage**: ${stage}
**Géographie**: ${deal.geography || "Unknown"}
**Valorisation demandée**: ${deal.valuationPre != null ? `${Number(deal.valuationPre)}€` : "Non spécifiée"}
**Montant du round**: ${deal.amountRequested != null ? `${Number(deal.amountRequested)}€` : "Non spécifié"}
**ARR déclaré**: ${deal.arr != null ? `${Number(deal.arr)}€` : "Non spécifié"}
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

### 1. IDENTIFICATION DU SEGMENT
- Confirme le sous-segment EdTech exact (K-12 B2B, Corporate L&D, B2C, Bootcamp, etc.)
- Identifie le business model (subscription, freemium, ISA, etc.)
- Note la confiance dans cette classification

### 2. ENGAGEMENT & COMPLETION (CRITIQUE)
C'est la métrique #1 en EdTech:
- Extrais le COMPLETION RATE (cite la source)
- Calcule le ratio MAL / Total Enrolled
- Évalue la qualité des données de retention (D7, D30)
- Y a-t-il des preuves d'OUTCOMES? (efficacy studies, test scores, placements)

### 3. UNIT ECONOMICS
- Calcule Learner LTV avec la formule exacte
- Calcule LAC par segment (B2C vs B2B different)
- Calcule LTV/LAC ratio et compare au benchmark 3x
- Calcule LAC Payback en mois
- Évalue le Content ROI si données disponibles

### 4. GO-TO-MARKET
- Quel modèle? (Direct to school, PLG, Channel partners)
- Quelle longueur de cycle de vente?
- Quelle saisonnalité? (K-12 = Q1-Q2 buying)
- Teacher/Instructor adoption - NPS ou signaux?
- LMS integrations?

### 5. REGULATORY & COMPLIANCE
- COPPA compliance si users < 13 ans
- FERPA compliance si student data
- Accessibility (WCAG 2.1 AA)
- Data privacy / GDPR

### 6. MOAT ANALYSIS
- Le contenu est-il propriétaire ou commodité?
- Y a-t-il de l'adaptive learning / AI?
- Les credentials ont-ils de la valeur?
- Y a-t-il des network effects (peer learning, UGC)?
- Switching costs?

### 7. RED FLAGS EDTECH
Pour chaque red flag:
- Sévérité: critical / major / minor
- Preuve: le chiffre exact ou l'observation
- Impact: ce qui arrive si ça se matérialise
- Question: ce qu'il faut demander au fondateur

Vérifie au minimum:
- Completion Rate < 10% → CRITICAL
- NRR < 85% (B2B) → CRITICAL
- LAC > $200 (B2C) → MAJOR
- Pas d'outcomes data → MAJOR
- COPPA/FERPA non-compliance → CRITICAL
- District Penetration < 20% → MAJOR

### 8. VALORISATION VS BENCHMARKS
- Calcule le multiple demandé (ARR ou Revenue)
- Compare aux multiples EdTech actuels (rechercher "edtech exit multiples ${new Date().getFullYear()}")
- Donne une range fair value
- Identifie les arguments de négociation

### 9. QUESTIONS MUST-ASK
5-7 questions spécifiques EdTech avec:
- La question exacte
- Pourquoi elle est importante
- Ce qu'une bonne réponse ressemble
- Ce qui serait un red flag

### 10. SCORE ET SYNTHÈSE
- Score /100 avec breakdown par dimension
- Executive Summary: 3-4 phrases max, actionnable
- Implication pour l'investissement

IMPORTANT: Sois spécifique. Pas de généralités. Chaque affirmation doit être sourcée ou calculée.`;
}

// ============================================================================
// HELPER: Transform output to SectorExpertData
// ============================================================================

function transformOutput(raw: EdTechExpertOutput): SectorExpertData {
  return {
    sectorName: "EdTech",
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
      complexity: raw.regulatoryStatus.riskLevel === "critical" || raw.regulatoryStatus.riskLevel === "high" ? "high" : "medium",
      keyRegulations: ["COPPA", "FERPA", "WCAG 2.1 AA", "GDPR"],
      complianceRisks: raw.regulatoryStatus.concerns,
      upcomingChanges: [],
    },

    sectorDynamics: {
      competitionIntensity: "high",
      consolidationTrend: "consolidating",
      barrierToEntry: raw.edtechCompetitiveMoat.switchingCosts === "high" ? "high" : "medium",
      typicalExitMultiple: raw.exitPotential.typicalMultiple,
      recentExits: [],
    },

    sectorQuestions: raw.sectorQuestions.map(q => ({
      question: q.question,
      category: q.category === "engagement" || q.category === "outcomes" ? "technical" as const :
                q.category === "gtm" || q.category === "unit_economics" ? "business" as const :
                q.category === "regulatory" ? "regulatory" as const : "competitive" as const,
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
    sectorName: "EdTech",
    sectorMaturity: "growing",
    keyMetrics: [],
    sectorRedFlags: [{
      flag: "Analyse incomplète",
      severity: "major",
      sectorReason: "L'analyse EdTech n'a pas pu être complétée",
    }],
    sectorOpportunities: [],
    regulatoryEnvironment: {
      complexity: "medium",
      keyRegulations: ["COPPA", "FERPA", "WCAG 2.1 AA"],
      complianceRisks: ["Analyse incomplète"],
      upcomingChanges: [],
    },
    sectorDynamics: {
      competitionIntensity: "high",
      consolidationTrend: "consolidating",
      barrierToEntry: "medium",
      typicalExitMultiple: 5,
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
    executiveSummary: "L'analyse sectorielle EdTech n'a pas pu être complétée.",
  };
}

// ============================================================================
// EDTECH EXPERT AGENT
// ============================================================================

export const edtechExpert = {
  name: "edtech-expert" as SectorExpertType,

  async run(context: EnrichedAgentContext): Promise<SectorExpertResult> {
    const startTime = Date.now();

    try {
      const stage = context.deal.stage || "SEED";
      const systemPromptText = buildSystemPrompt(stage);
      const userPromptText = buildUserPrompt(context);

      setAgentContext("edtech-expert");

      const response = await complete(userPromptText, {
        systemPrompt: systemPromptText,
        complexity: "complex",
        temperature: 0.3,
      });

      // Parse and validate response
      let parsedOutput: EdTechExpertOutput;
      try {
        const rawJson = JSON.parse(extractFirstJSON(response.content));
        const parseResult = EdTechOutputSchema.safeParse(rawJson);
        if (parseResult.success) {
          parsedOutput = parseResult.data;
        } else {
          console.warn(`[edtech-expert] Strict parse failed (${parseResult.error.issues.length} issues), using raw JSON with defaults`);
          parsedOutput = rawJson as EdTechExpertOutput;
        }
      } catch (parseError) {
        console.error("[edtech-expert] Parse error:", parseError);
        return {
          agentName: "edtech-expert" as SectorExpertType,
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
        agentName: "edtech-expert" as SectorExpertType,
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
            ltv: parsedOutput.unitEconomics.learnerLtv,
            cac: {
              value: parsedOutput.unitEconomics.lac.value,
              calculation: parsedOutput.unitEconomics.lac.calculation,
              confidence: parsedOutput.unitEconomics.lac.confidence,
            },
            ltvCacRatio: parsedOutput.unitEconomics.ltvLacRatio,
            cacPaybackMonths: {
              value: parsedOutput.unitEconomics.lacPaybackMonths.value,
              assessment: parsedOutput.unitEconomics.lacPaybackMonths.assessment,
              runway: "N/A",
            },
          },
          valuationAnalysis: parsedOutput.valuationAnalysis,
          dbComparison: parsedOutput.dbComparison,
          scoreBreakdown: {
            unitEconomics: parsedOutput.scoreBreakdown.unitEconomics,
            growth: parsedOutput.scoreBreakdown.engagement,
            retention: parsedOutput.scoreBreakdown.engagement,
            gtmEfficiency: parsedOutput.scoreBreakdown.gtmEfficiency,
          },
          gtmAssessment: {
            model: parsedOutput.gtmAssessment.model === "direct_to_school" ? "sales_led" :
                   parsedOutput.gtmAssessment.model === "plg" ? "product_led" :
                   parsedOutput.gtmAssessment.model === "hybrid" ? "hybrid" : "unclear",
            efficiency: parsedOutput.gtmAssessment.salesCycle.complexity === "simple" ? "efficient" :
                       parsedOutput.gtmAssessment.salesCycle.complexity === "moderate" ? "acceptable" : "inefficient",
            salesCycleMonths: parsedOutput.gtmAssessment.salesCycle.lengthMonths,
            keyInsight: parsedOutput.gtmAssessment.keyInsight,
          },
          exitPotential: parsedOutput.exitPotential,
          // Map EdTech-specific values to common type values
          investmentImplication: parsedOutput.investmentImplication === "strong_edtech_fundamentals" ? "strong_saas_fundamentals" :
                                 parsedOutput.investmentImplication === "edtech_model_broken" ? "saas_model_broken" :
                                 parsedOutput.investmentImplication,
          // EdTech specific extended data
          edtechEngagement: {
            completionRate: parsedOutput.engagementAnalysis.completionRate,
            activeUsersRatio: parsedOutput.engagementAnalysis.activeUsersRatio,
            learningOutcomes: parsedOutput.engagementAnalysis.learningOutcomes,
            retentionCohorts: parsedOutput.engagementAnalysis.retentionCohorts,
          },
          edtechRegulatory: {
            coppa: parsedOutput.regulatoryStatus.coppaCompliance,
            ferpa: parsedOutput.regulatoryStatus.ferpaCompliance,
            accessibility: parsedOutput.regulatoryStatus.accessibilityStatus,
            dataPrivacy: parsedOutput.regulatoryStatus.dataPrivacy,
            riskLevel: parsedOutput.regulatoryStatus.riskLevel,
            concerns: parsedOutput.regulatoryStatus.concerns,
          },
          edtechMoat: {
            contentDifferentiation: parsedOutput.edtechCompetitiveMoat.contentDifferentiation,
            adaptiveTechnology: parsedOutput.edtechCompetitiveMoat.adaptiveTechnology,
            credentialValue: parsedOutput.edtechCompetitiveMoat.credentialValue,
            networkEffects: parsedOutput.edtechCompetitiveMoat.networkEffects,
            lmsIntegration: parsedOutput.edtechCompetitiveMoat.lmsIntegration,
            switchingCosts: parsedOutput.edtechCompetitiveMoat.switchingCosts,
            moatAssessment: parsedOutput.edtechCompetitiveMoat.moatAssessment,
          },
        },
      };

    } catch (error) {
      console.error("[edtech-expert] Execution error:", error);
      return {
        agentName: "edtech-expert" as SectorExpertType,
        success: false,
        executionTimeMs: Date.now() - startTime,
        cost: 0,
        error: error instanceof Error ? error.message : "Unknown error",
        data: getDefaultData(),
      };
    }
  },
};
