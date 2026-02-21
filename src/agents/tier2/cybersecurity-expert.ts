/**
 * Cybersecurity Expert Agent - Tier 2
 *
 * Expert sectoriel Cybersecurity/InfoSec avec analyse qualite Big4 + instinct Partner VC.
 *
 * Mission: Evaluer les startups cybersecurity pour identifier les vrais produits de securite
 * vs les "security-washing" et les features deguisees en produits.
 *
 * Ce que cet agent detecte:
 * - Positionnement produit vs plateforme (feature vs standalone product)
 * - Differentiation technique vs marketing (vrai moat de detection/protection)
 * - Risque de consolidation par les grands (CrowdStrike, Palo Alto, Microsoft)
 * - Unit economics: NRR, gross margin, CAC payback specifiques au secteur
 * - Red flags: churn eleve (anormal en security), faible ACV, services-heavy
 *
 * Standards:
 * - Chaque metrique comparee aux benchmarks sectoriels
 * - Cross-reference obligatoire avec deals similaires de la DB
 * - Red flags avec severite + preuve + impact + question
 * - Output actionnable pour un Business Angel
 */

import { z } from "zod";
import type { EnrichedAgentContext } from "../types";
import type { SectorExpertData, SectorExpertResult, SectorExpertType, ExtendedSectorData } from "./types";
import { getStandardsOnlyInjection } from "./benchmark-injector";
import { CYBERSECURITY_STANDARDS } from "./sector-standards";
import { complete, setAgentContext, extractFirstJSON } from "@/services/openrouter/router";

// ============================================================================
// CYBERSECURITY-SPECIFIC PATTERNS (Qualitative data - stable)
// ============================================================================

const SECURITY_CATEGORY_PATTERNS = [
  "Endpoint Security (EDR/XDR): Crowded market, CrowdStrike/SentinelOne dominant. Need 10x better detection or unique angle.",
  "Cloud Security (CSPM/CWPP): High growth but Microsoft/Wiz competition intense. Multi-cloud play is key.",
  "Identity & Access (IAM/CIAM): Okta/Microsoft dominant. Passwordless or specific vertical can differentiate.",
  "Application Security (SAST/DAST/SCA): Snyk, Veracode established. Developer experience is the moat.",
  "Network Security: Legacy space (Palo Alto, Fortinet). Cloud-native play or nothing.",
  "Security Operations (SIEM/SOAR): Splunk/Microsoft Sentinel dominant. AI-powered detection or niche.",
  "Data Security (DLP/DSPM): Growing with cloud adoption. Classification automation is key.",
  "Email Security: Proofpoint/Mimecast dominant. AI phishing detection can differentiate.",
  "Vulnerability Management: Tenable/Qualys established. Speed and prioritization matter.",
  "Threat Intelligence: Crowded. Proprietary data or unique collection is the moat.",
];

const SECURITY_MOAT_SIGNALS = [
  "Proprietary threat data from customer base (data flywheel)",
  "Unique detection technology with proven lower false positives",
  "Deep integration into customer workflow (high switching costs)",
  "Compliance certifications (SOC2, FedRAMP, ISO 27001) as barrier",
  "Strong channel relationships (VARs, MSSPs, distributors)",
  "Category creation with analyst recognition (Gartner MQ, Forrester Wave)",
  "Platform with multiple products (land and expand)",
  "API-first architecture enabling ecosystem integrations",
];

const SECURITY_RED_FLAG_PATTERNS = [
  "Single feature disguised as product - will be absorbed by platform",
  "No clear differentiation from CrowdStrike/Palo Alto/Microsoft",
  "High churn rate (> 15%) - unusual for security, indicates product issues",
  "Heavy services component (> 30% revenue) - not scalable",
  "No enterprise customers after 2+ years - may be selling to wrong buyer",
  "Sales cycle > 9 months without corresponding high ACV",
  "Compliance-only value prop - vulnerable to checkbox mentality",
  "Dependent on single integration partner (AWS/Azure/etc.)",
  "No CISO or security leader on founding team",
  "Claims 'AI-powered' without explaining actual detection mechanism",
  "Low NRR (< 100%) - customers not expanding, threat landscape grows",
  "CAC payback > 24 months without enterprise ACV to justify",
];

const CONSOLIDATION_RISK_CATEGORIES = [
  "HIGH RISK: Endpoint, Email, Basic IAM - Microsoft bundling aggressively",
  "MEDIUM RISK: SIEM, SOAR, Network - Large vendors acquiring/building",
  "LOWER RISK: AppSec, DevSecOps, API Security - Still fragmented",
  "EMERGING: AI Security, Quantum-safe, OT/ICS - Early market, less consolidation",
];

// ============================================================================
// OUTPUT SCHEMA
// ============================================================================

const CyberMetricEvaluationSchema = z.object({
  metricName: z.string(),
  dealValue: z.union([z.number(), z.string(), z.null()]).describe("Valeur extraite du deal"),
  source: z.string().describe("D'ou vient cette donnee (deck page X, data room, calcul, interview)"),
  benchmark: z.object({
    p25: z.number(),
    median: z.number(),
    p75: z.number(),
    topDecile: z.number(),
  }),
  percentilePosition: z.number().min(0).max(100).describe("Position du deal dans la distribution"),
  assessment: z.enum(["exceptional", "above_average", "average", "below_average", "critical"]),
  insight: z.string().describe("Pourquoi c'est important pour une startup security a ce stade"),
});

const CyberRedFlagSchema = z.object({
  flag: z.string().describe("Description claire du red flag"),
  severity: z.enum(["critical", "major", "minor"]),
  evidence: z.string().describe("Preuve concrete (chiffre, source, citation)"),
  impact: z.string().describe("Impact business si ce risque se materialise"),
  questionToAsk: z.string().describe("Question precise a poser au fondateur"),
  securitySpecific: z.boolean().describe("Est-ce un red flag specifique a la cybersecurity?"),
});

const CyberGreenFlagSchema = z.object({
  flag: z.string(),
  strength: z.enum(["strong", "moderate"]),
  evidence: z.string(),
  implication: z.string().describe("Ce que ca signifie pour l'investissement"),
});

const SecurityCategoryAnalysisSchema = z.object({
  primaryCategory: z.string().describe("Categorie principale: EDR, IAM, SIEM, AppSec, etc."),
  subCategories: z.array(z.string()).describe("Sous-categories ou categories adjacentes"),
  categoryMaturity: z.enum(["emerging", "growth", "mature", "consolidating"]),
  consolidationRisk: z.enum(["low", "medium", "high", "critical"]).describe("Risque d'etre absorbe par un grand"),
  bigTechThreat: z.object({
    level: z.enum(["low", "medium", "high", "critical"]),
    competitors: z.array(z.string()).describe("Microsoft, CrowdStrike, Palo Alto qui menacent"),
    rationale: z.string(),
  }),
  categoryInsight: z.string().describe("Analyse du positionnement dans cette categorie"),
});

const SecurityMoatAnalysisSchema = z.object({
  threatDataMoat: z.object({
    hasDataFlywheel: z.boolean(),
    dataSource: z.string().describe("D'ou viennent les donnees de menaces"),
    uniqueness: z.enum(["none", "low", "moderate", "high"]),
    assessment: z.string(),
  }),
  technologyMoat: z.object({
    detectionApproach: z.string().describe("Comment detectent-ils les menaces? ML, rules, behavioral, etc."),
    falsePositiveRate: z.string().nullable().describe("Taux de faux positifs si disponible"),
    differentiator: z.string().describe("Ce qui les differencie techniquement"),
    defensibility: z.enum(["none", "weak", "moderate", "strong"]),
  }),
  integrationMoat: z.object({
    integrationDepth: z.enum(["shallow", "moderate", "deep"]),
    keyIntegrations: z.array(z.string()),
    switchingCostLevel: z.enum(["low", "medium", "high"]),
    assessment: z.string(),
  }),
  complianceMoat: z.object({
    certifications: z.array(z.string()).describe("SOC2, FedRAMP, ISO27001, etc."),
    regulatoryAdvantage: z.boolean(),
    assessment: z.string(),
  }),
  overallMoatScore: z.number().min(0).max(100),
  moatAssessment: z.string(),
});

const SecurityGTMAnalysisSchema = z.object({
  salesMotion: z.enum(["plg", "sales_led", "channel_led", "hybrid"]),
  targetBuyer: z.string().describe("CISO, Security Team, DevOps, IT, etc."),
  salesCycleMonths: z.number().nullable(),
  channelStrategy: z.object({
    hasChannelPartners: z.boolean(),
    keyPartners: z.array(z.string()),
    channelContribution: z.number().nullable().describe("% of revenue from channel"),
  }),
  landAndExpand: z.object({
    initialDealSize: z.number().nullable(),
    expandedDealSize: z.number().nullable(),
    expansionRatio: z.number().nullable(),
    assessment: z.string(),
  }),
  gtmEfficiency: z.enum(["efficient", "acceptable", "inefficient", "unknown"]),
  gtmInsight: z.string(),
});

const SecurityTeamAnalysisSchema = z.object({
  hasSecurityLeader: z.boolean().describe("CISO ou senior security leader dans l'equipe fondatrice"),
  securityBackground: z.array(z.string()).describe("Background security des fondateurs"),
  previousSecurityCompanies: z.array(z.string()),
  industryCredibility: z.enum(["high", "medium", "low", "unknown"]),
  teamAssessment: z.string(),
});

const CyberVerdictSchema = z.object({
  isRealSecurityProduct: z.boolean().describe("Est-ce un vrai produit security ou une feature?"),
  productVsFeature: z.enum(["standalone_product", "platform_component", "feature_risk", "feature"]),
  consolidationRisk: z.enum(["low", "medium", "high", "critical"]),
  moatStrength: z.enum(["strong", "moderate", "weak", "none"]),
  unitEconomicsHealth: z.enum(["excellent", "good", "acceptable", "concerning", "critical"]),
  recommendation: z.enum(["STRONG_SECURITY_PLAY", "SOLID_SECURITY_PLAY", "SECURITY_CONCERNS", "AVOID"]),
  keyInsight: z.string(),
});

const CyberOutputSchema = z.object({
  // Identification
  sectorConfidence: z.number().min(0).max(100).describe("Confiance que c'est bien une boite security"),

  // Category Analysis
  categoryAnalysis: SecurityCategoryAnalysisSchema,

  // Moat Analysis
  moatAnalysis: SecurityMoatAnalysisSchema,

  // GTM Analysis
  gtmAnalysis: SecurityGTMAnalysisSchema,

  // Team Analysis
  teamAnalysis: SecurityTeamAnalysisSchema,

  // Primary Metrics with benchmark
  primaryMetrics: z.array(CyberMetricEvaluationSchema).describe("Les 5-6 KPIs critiques security"),

  // Red Flags
  redFlags: z.array(CyberRedFlagSchema),

  // Green Flags
  greenFlags: z.array(CyberGreenFlagSchema),

  // DB Comparison
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
    competitorsFromDb: z.array(z.string()).describe("Concurrents identifies dans la DB"),
  }),

  // Questions specifiques Security
  sectorQuestions: z.array(z.object({
    question: z.string(),
    category: z.enum(["technical", "gtm", "moat", "team", "competition", "business"]),
    priority: z.enum(["must_ask", "should_ask", "nice_to_have"]),
    why: z.string().describe("Pourquoi cette question est importante"),
    greenFlagAnswer: z.string(),
    redFlagAnswer: z.string(),
  })),

  // Verdict
  verdict: CyberVerdictSchema,

  // Score et Synthese
  sectorScore: z.number().min(0).max(100),
  scoreBreakdown: z.object({
    productDifferentiation: z.number().min(0).max(25),
    moatStrength: z.number().min(0).max(25),
    unitEconomics: z.number().min(0).max(25),
    gtmExecution: z.number().min(0).max(25),
  }),

  executiveSummary: z.string().describe("3-4 phrases: verdict security, forces/faiblesses, risque consolidation, potentiel"),

  // DB Cross-Reference (obligatoire si données DB disponibles)
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

export type CybersecurityExpertOutput = z.infer<typeof CyberOutputSchema>;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatBenchmarksForPrompt(stage: string): string {
  const standards = getStandardsOnlyInjection("Cybersecurity", stage);

  return `
${standards}

### CATEGORIES DE SECURITE ET RISQUE DE CONSOLIDATION
${SECURITY_CATEGORY_PATTERNS.map(p => `- ${p}`).join("\n")}

### SIGNAUX DE MOAT EN CYBERSECURITY
${SECURITY_MOAT_SIGNALS.map(s => `- ${s}`).join("\n")}

### RED FLAGS SPECIFIQUES CYBERSECURITY
${SECURITY_RED_FLAG_PATTERNS.map(r => `- ${r}`).join("\n")}

### RISQUE DE CONSOLIDATION PAR CATEGORIE
${CONSOLIDATION_RISK_CATEGORIES.map(c => `- ${c}`).join("\n")}
`;
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
    output += `\n### Deals Cybersecurity Similaires (${similar.length} trouves)\n`;
    output += similar.slice(0, 10).map((d: Record<string, unknown>) =>
      `- **${d.name}**: ${d.amount ? `${d.amount}€` : "N/A"} @ ${d.valuation ? `${d.valuation}€ valo` : "N/A"} (${d.stage || "?"}) - ${d.status || "?"}`
    ).join("\n");
  }

  if (benchmarks) {
    output += `\n\n### Benchmarks DB (deals recents meme secteur/stage)
- Valorisation mediane: ${benchmarks.valuationMedian || "N/A"}€
- Multiple ARR median: ${benchmarks.arrMultipleMedian || "N/A"}x
- Croissance mediane: ${benchmarks.growthMedian || "N/A"}%`;
  }

  if (competitors.length > 0) {
    output += `\n\n### Concurrents Potentiels Detectes (DB)
${competitors.slice(0, 5).map((c: Record<string, unknown>) =>
  `- **${c.name}**: ${c.totalRaised ? `${c.totalRaised}€ leves` : ""} ${c.lastRound ? `(dernier round: ${c.lastRound})` : ""}`
).join("\n")}

**IMPORTANT**: Verifier si ces concurrents sont mentionnes dans le deck. S'ils ne le sont pas -> RED FLAG potentiel.`;
  }

  return output;
}

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

function buildSystemPrompt(stage: string): string {
  return `Tu es un EXPERT CYBERSECURITY avec 15 ans d'experience en Due Diligence pour des fonds Tier 1 specialises security (Lightspeed, Bessemer, Insight, a16z).

## TON PROFIL
- Tu as analyse 300+ startups security du Seed au Growth
- Tu connais l'ecosysteme security par coeur (CrowdStrike, Palo Alto, Microsoft, Fortinet, Zscaler)
- Tu as vu des dizaines de startups se faire absorber ou marginaliser par les plateformes
- Tu sais distinguer un vrai produit security d'une feature qui sera integree
- Tu connais les patterns d'achat CISO (POC fatigue, vendor consolidation, compliance-driven)
- Tu as vu des exits spectaculaires (Demisto → Palo Alto, Phantom → Splunk, Duo → Cisco) et des echecs

## TA MISSION
Analyser ce deal Cybersecurity pour determiner:
1. **Est-ce un VRAI PRODUIT ou une feature?** (risque d'etre absorbe par plateforme)
2. **Quel est le moat?** (data flywheel, tech differentiation, switching costs, compliance)
3. **Risque de consolidation?** (Microsoft, CrowdStrike, Palo Alto menacent-ils ce segment?)
4. **Unit economics sont-ils sains?** (NRR, churn, ACV, CAC payback specifiques au security)
5. **GTM est-il adapte?** (sales motion, channel, target buyer)

## REGLES ABSOLUES

### Sur le positionnement produit vs feature
- Beaucoup de "produits" security sont des features qui seront absorbees
- DEMANDE: Pourquoi CrowdStrike/Palo Alto/Microsoft ne ferait pas ca?
- Si la reponse est "ils sont trop lents" = RED FLAG (ils ont les ressources)
- Feature indicators: single use case, no platform vision, low ACV

### Sur le moat
- La security a des moats uniques: threat data flywheel, compliance certifications
- Un produit sans donnees proprietaires de menaces est vulnerable
- Switching costs sont reels en security (recertification, integration, compliance)
- VERIFIE: D'ou viennent leurs donnees de detection? Publiques = pas de moat.

### Sur les unit economics
- NRR devrait etre > 100% (le threat landscape grandit, clients achetent plus)
- NRR < 95% en security = ENORME RED FLAG (produit ne resout pas le probleme)
- Churn eleve (> 15%) est anormal en security (switching costs sont eleves)
- Services > 30% revenue = pas un business software scalable

### Sur le GTM
- CISO fatigue: ils voient 50+ vendors par an, POC fatigue est reelle
- Channel matters: VARs et MSSPs peuvent faire ou defaire une startup security
- Sans client enterprise apres 2 ans = probleme de product-market fit
- Sales cycle 6-9 mois est normal pour enterprise security

### Sur l'equipe
- Avoir un CISO ou security leader dans l'equipe fondatrice est un plus significatif
- Credibilite industrie (ex-CrowdStrike, ex-Palo Alto, ex-Mandiant) = avantage
- Pure SaaS background sans experience security = learning curve steep

${formatBenchmarksForPrompt(stage)}

## SCORING (0-100)
Le score sectoriel Cybersecurity est la SOMME de:
- **Product Differentiation (0-25)**: Feature vs Product, unique value prop, category position
- **Moat Strength (0-25)**: Data flywheel, tech moat, switching costs, compliance moat
- **Unit Economics (0-25)**: NRR, gross margin, CAC payback, ACV
- **GTM Execution (0-25)**: Sales motion fit, channel strategy, land & expand

Chaque dimension:
- 20-25: Exceptionnel (Top 10% security companies)
- 15-19: Bon (Solide, investissable)
- 10-14: Acceptable (Concerns mais manageable)
- 5-9: Concernant (Red flags significatifs)
- 0-4: Deal breaker (feature, pas product, ou unit economics casses)`;
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
## DEAL A ANALYSER

**Company**: ${deal.companyName || deal.name}
**Sector declare**: ${deal.sector || "Cybersecurity"}
**Stage**: ${stage}
**Geographie**: ${deal.geography || "Unknown"}
**Valorisation demandee**: ${deal.valuationPre != null ? `${Number(deal.valuationPre)}€` : "Non specifiee"}
**Montant du round**: ${deal.amountRequested != null ? `${Number(deal.amountRequested)}€` : "Non specifie"}
**ARR declare**: ${deal.arr != null ? `${Number(deal.arr)}€` : "Non specifie"}

${formatFundingDbContext(context)}

${context.factStoreFormatted ? `
## DONNÉES VÉRIFIÉES (Fact Store)

Les données ci-dessous ont été extraites et vérifiées à partir des documents du deal.
Base ton analyse sur ces faits. Si un fait important manque, signale-le.

${context.factStoreFormatted}
` : ""}

## ANALYSES TIER 1 (A Exploiter)
${tier1Insights || "Pas d'analyses Tier 1 disponibles"}

${fundingDbData}

## TES TACHES

### 1. ANALYSE DE CATEGORIE
- Quelle categorie security? (EDR, IAM, SIEM, AppSec, Cloud Security, etc.)
- Maturite de la categorie? (emerging, growth, mature, consolidating)
- Risque de consolidation par les grands? (Microsoft, CrowdStrike, Palo Alto)
- Est-ce un produit standalone viable ou une feature qui sera absorbee?

### 2. ANALYSE DU MOAT
Evalue chaque type de moat:
- **Data Moat**: Ont-ils un data flywheel? D'ou viennent les donnees de menaces?
- **Tech Moat**: Quelle est leur approche de detection? Differenciee ou commodity?
- **Integration Moat**: Profondeur d'integration? Switching costs?
- **Compliance Moat**: Certifications (SOC2, FedRAMP)? Avantage reglementaire?
- Score de moat global (0-100)

### 3. ANALYSE GTM
- Sales motion: PLG, sales-led, channel-led, hybrid?
- Target buyer: CISO, Security Team, DevOps, IT?
- Sales cycle: Combien de mois?
- Strategy channel: Ont-ils des partenaires? VARs, MSSPs?
- Land & expand: Initial deal vs expanded deal?

### 4. ANALYSE EQUIPE
- Y a-t-il un CISO ou security leader dans l'equipe fondatrice?
- Background security des fondateurs?
- Credibilite industrie?

### 5. METRIQUES CLES VS BENCHMARKS
Pour chaque KPI disponible:
- Extrais la valeur
- Compare aux benchmarks ${stage}
- Calcule le percentile
- Note le specifiquement pour security

### 6. RED FLAGS SECURITY SPECIFIQUES
Pour chaque red flag:
- Severite: critical / major / minor
- Preuve: le chiffre exact ou l'observation
- Impact: ce qui arrive si ca se materialise
- Question: ce qu'il faut demander au fondateur

Verifie au minimum:
- NRR < 100% (anormal en security)
- Churn > 15% (anormal en security)
- Services > 30% (pas scalable)
- Pas de client enterprise apres 2 ans
- Feature risk (sera absorbe par plateforme)

### 7. QUESTIONS MUST-ASK
5-7 questions specifiques security avec:
- La question exacte
- Pourquoi elle est importante
- Ce qu'une bonne reponse ressemble
- Ce qui serait un red flag

### 8. VERDICT SECURITY
- Est-ce un vrai produit security ou une feature?
- Risque de consolidation: low / medium / high / critical
- Force du moat: strong / moderate / weak / none
- Sante unit economics: excellent / good / acceptable / concerning / critical
- Recommandation: STRONG_SECURITY_PLAY / SOLID_SECURITY_PLAY / SECURITY_CONCERNS / AVOID

### 9. SCORE ET SYNTHESE
- Score /100 avec breakdown par dimension
- Executive Summary: 3-4 phrases max, actionnable

IMPORTANT: Sois CRITIQUE. Le marche security est brutal - consolidation, commoditization, et POC fatigue sont reels. Ton role est de proteger l'investisseur.`;
}

// ============================================================================
// HELPER: Transform output to SectorExpertData
// ============================================================================

function transformOutput(raw: CybersecurityExpertOutput, cappedScore: number, cappedFitScore: number): SectorExpertData {
  return {
    sectorName: "Cybersecurity",
    sectorMaturity: raw.categoryAnalysis.categoryMaturity === "emerging" ? "emerging" :
                    raw.categoryAnalysis.categoryMaturity === "growth" ? "growing" :
                    raw.categoryAnalysis.categoryMaturity === "mature" ? "mature" : "declining",

    keyMetrics: raw.primaryMetrics.map(m => ({
      metricName: m.metricName,
      value: m.dealValue,
      sectorBenchmark: m.benchmark,
      assessment: m.assessment === "critical" ? "concerning" as const : m.assessment,
      sectorContext: m.insight,
    })),

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
      complexity: "high",
      keyRegulations: ["SOC 2 Type II", "ISO 27001", "FedRAMP", "GDPR", "HIPAA", "PCI-DSS"],
      complianceRisks: raw.moatAnalysis.complianceMoat.certifications.length === 0 ?
        ["Pas de certifications de conformite - barriere a l'adoption enterprise"] : [],
      upcomingChanges: ["SEC Cyber Disclosure Rules", "EU NIS2 Directive", "DORA (Digital Operational Resilience Act)"],
    },

    sectorDynamics: {
      competitionIntensity: raw.categoryAnalysis.bigTechThreat.level === "critical" ? "intense" :
                            raw.categoryAnalysis.bigTechThreat.level === "high" ? "high" : "medium",
      consolidationTrend: raw.categoryAnalysis.categoryMaturity === "consolidating" ? "consolidating" : "stable",
      barrierToEntry: raw.moatAnalysis.overallMoatScore > 60 ? "high" : raw.moatAnalysis.overallMoatScore > 30 ? "medium" : "low",
      typicalExitMultiple: 8, // Placeholder - recherche web pour donnees actuelles
      recentExits: [], // A remplir par recherche web
    },

    sectorQuestions: raw.sectorQuestions.map(q => ({
      question: q.question,
      category: q.category === "technical" ? "technical" as const :
                q.category === "competition" || q.category === "moat" ? "competitive" as const :
                q.category === "gtm" || q.category === "business" ? "business" as const : "technical" as const,
      priority: q.priority,
      expectedAnswer: q.greenFlagAnswer,
      redFlagAnswer: q.redFlagAnswer,
    })),

    sectorFit: {
      score: cappedFitScore,
      strengths: raw.greenFlags.map(gf => gf.flag),
      weaknesses: raw.redFlags.map(rf => rf.flag),
      sectorTiming: raw.categoryAnalysis.categoryMaturity === "emerging" ? "early" :
                    raw.categoryAnalysis.categoryMaturity === "growth" ? "optimal" : "late",
    },

    sectorScore: cappedScore,
    executiveSummary: raw.executiveSummary,
  };
}

// ============================================================================
// HELPER: Build Extended Data
// ============================================================================

function buildExtendedData(raw: CybersecurityExpertOutput, completenessLevel: string, rawScore: number, cappedScore: number, limitations: string[]): Partial<ExtendedSectorData> {
  return {
    subSector: {
      primary: raw.categoryAnalysis.primaryCategory,
      secondary: raw.categoryAnalysis.subCategories,
      rationale: raw.categoryAnalysis.categoryInsight,
    },
    dbComparison: {
      similarDealsFound: raw.dbComparison.similarDealsFound,
      thisDealsPosition: raw.dbComparison.thisDealsPosition,
      bestComparable: raw.dbComparison.bestComparable,
      concerningComparable: raw.dbComparison.concerningComparable,
    },
    bigTechThreat: {
      level: raw.categoryAnalysis.bigTechThreat.level,
      players: raw.categoryAnalysis.bigTechThreat.competitors,
      rationale: raw.categoryAnalysis.bigTechThreat.rationale,
    },
    scoreBreakdown: {
      ...raw.scoreBreakdown,
      justification: raw.executiveSummary,
    },
    verdict: {
      recommendation: raw.verdict.recommendation === "STRONG_SECURITY_PLAY" ? "STRONG_FIT" :
                      raw.verdict.recommendation === "SOLID_SECURITY_PLAY" ? "GOOD_FIT" :
                      raw.verdict.recommendation === "SECURITY_CONCERNS" ? "MODERATE_FIT" : "NOT_RECOMMENDED",
      confidence: raw.verdict.moatStrength === "strong" ? "high" : raw.verdict.moatStrength === "moderate" ? "medium" : "low",
      keyInsight: raw.verdict.keyInsight,
      topConcern: raw.redFlags.length > 0 ? raw.redFlags[0].flag : "None identified",
      topStrength: raw.greenFlags.length > 0 ? raw.greenFlags[0].flag : "None identified",
    },
    dbCrossReference: raw.dbCrossReference,
    dataCompleteness: {
      level: completenessLevel as "complete" | "partial" | "minimal",
      availableDataPoints: raw.dataCompleteness?.availableDataPoints ?? 0,
      expectedDataPoints: raw.dataCompleteness?.expectedDataPoints ?? 0,
      missingCritical: raw.dataCompleteness?.missingCritical ?? [],
      limitations,
      scoreCapped: cappedScore < rawScore,
      rawScore,
      cappedScore,
    },
  };
}

// ============================================================================
// DEFAULT DATA
// ============================================================================

function getDefaultData(): SectorExpertData {
  return {
    sectorName: "Cybersecurity",
    sectorMaturity: "growing",
    keyMetrics: [],
    sectorRedFlags: [{
      flag: "Analyse incomplete",
      severity: "major",
      sectorReason: "L'analyse Cybersecurity n'a pas pu etre completee",
    }],
    sectorOpportunities: [],
    regulatoryEnvironment: {
      complexity: "high",
      keyRegulations: ["SOC 2", "ISO 27001", "FedRAMP"],
      complianceRisks: ["Analyse incomplete"],
      upcomingChanges: [],
    },
    sectorDynamics: {
      competitionIntensity: "high",
      consolidationTrend: "consolidating",
      barrierToEntry: "medium",
      typicalExitMultiple: 8,
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
    executiveSummary: "L'analyse sectorielle Cybersecurity n'a pas pu etre completee.",
  };
}

// ============================================================================
// CYBERSECURITY EXPERT AGENT
// ============================================================================

export const cybersecurityExpert = {
  name: "cybersecurity-expert" as SectorExpertType,

  async run(context: EnrichedAgentContext): Promise<SectorExpertResult> {
    const startTime = Date.now();

    try {
      const stage = context.deal.stage || "SEED";
      const systemPromptText = buildSystemPrompt(stage);
      const userPromptText = buildUserPrompt(context);

      setAgentContext("cybersecurity-expert");

      const response = await complete(userPromptText, {
        systemPrompt: systemPromptText,
        complexity: "complex",
        temperature: 0.3,
      });

      // Parse and validate response
      let parsedOutput: CybersecurityExpertOutput;
      try {
        const rawJson = JSON.parse(extractFirstJSON(response.content));
        const parseResult = CyberOutputSchema.safeParse(rawJson);
        if (parseResult.success) {
          parsedOutput = parseResult.data;
        } else {
          console.warn(`[cybersecurity-expert] Strict parse failed (${parseResult.error.issues.length} issues), using raw JSON with defaults`);
          parsedOutput = rawJson as CybersecurityExpertOutput;
        }
      } catch (parseError) {
        console.error("[cybersecurity-expert] Parse error:", parseError);
        return {
          agentName: "cybersecurity-expert" as SectorExpertType,
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
        agentName: "cybersecurity-expert" as SectorExpertType,
        success: true,
        executionTimeMs: Date.now() - startTime,
        cost: response.cost ?? 0,
        data: sectorData,
        _extended: buildExtendedData(parsedOutput, completenessLevel, rawScore, cappedScore, limitations),
      };

    } catch (error) {
      console.error("[cybersecurity-expert] Execution error:", error);
      return {
        agentName: "cybersecurity-expert" as SectorExpertType,
        success: false,
        executionTimeMs: Date.now() - startTime,
        cost: 0,
        error: error instanceof Error ? error.message : "Unknown error",
        data: getDefaultData(),
      };
    }
  },
};
