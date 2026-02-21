/**
 * AI Expert Agent - Tier 2
 *
 * Expert sectoriel AI/ML avec analyse qualite Big4 + instinct Partner VC.
 *
 * Mission: Evaluer les startups AI/ML pour distinguer les vrais experts IA
 * des "AI-washing" et wrappers d'API sans moat.
 *
 * Ce que cet agent detecte:
 * - API wrappers vs vraies innovations IA
 * - Profondeur technique de l'equipe (PhDs, publications, experience)
 * - Couts d'infrastructure et viabilite des unit economics
 * - Moat: data flywheel, proprietary models, switching costs
 * - Red flags: pas de ML team, 100% API dependency, claims irrealistes
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
import { AI_STANDARDS } from "./sector-standards";
import { completeJSON, setAgentContext } from "@/services/openrouter/router";

// ============================================================================
// AI-SPECIFIC PATTERNS (Qualitative data - stable)
// Ces donnees sont qualitatives et ne changent pas frequemment
// ============================================================================

const AI_MODEL_APPROACH_PATTERNS = [
  "API Wrapper: Calling GPT-4/Claude directly with minimal processing - NO MOAT (red flag)",
  "RAG System: Retrieval-augmented generation with proprietary data - WEAK MOAT (acceptable if data is unique)",
  "Fine-tuned Model: Customized foundation model on proprietary data - MODERATE MOAT (good if domain-specific)",
  "Custom Architecture: Novel model architecture/approach - STRONG MOAT (requires deep expertise)",
  "End-to-end Solution: Full stack AI with data flywheel - STRONGEST MOAT (rare, most valuable)",
];

const AI_TECHNICAL_CREDIBILITY_SIGNALS = [
  "Team has published ML papers (NeurIPS, ICML, ACL, etc.)",
  "Team members from top AI labs (DeepMind, OpenAI, Google Brain, FAIR, Anthropic)",
  "Open source contributions to major ML frameworks (PyTorch, TensorFlow, HuggingFace)",
  "Clear articulation of model architecture and why it's differentiated",
  "Rigorous evaluation methodology with held-out test sets",
  "Understanding of cost structure and path to margin improvement",
  "Awareness of AI limitations and failure modes",
];

const AI_RED_FLAG_PATTERNS = [
  "Claims 'AI-powered' but no ML team or PhDs",
  "Cannot explain how their model differs from calling GPT-4",
  "Accuracy claims without rigorous evaluation methodology",
  "No discussion of inference costs or unit economics",
  "100% dependent on OpenAI/Anthropic APIs for core functionality",
  "Claims '99% accuracy' without specifying benchmark or methodology",
  "No proprietary data or data flywheel strategy",
  "Team has web/mobile background but no ML experience",
  "Cannot articulate competitive moat beyond 'we're faster'",
  "Scaling story relies on API providers reducing prices",
];

// ============================================================================
// OUTPUT SCHEMA
// ============================================================================

const AIMetricEvaluationSchema = z.object({
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
  insight: z.string().describe("Pourquoi c'est important pour une startup AI a ce stade"),
});

const AIRedFlagSchema = z.object({
  flag: z.string().describe("Description claire du red flag"),
  severity: z.enum(["critical", "major", "minor"]),
  evidence: z.string().describe("Preuve concrete (chiffre, source, citation)"),
  impact: z.string().describe("Impact business si ce risque se materialise"),
  questionToAsk: z.string().describe("Question precise a poser au fondateur"),
  aiSpecific: z.boolean().describe("Est-ce un red flag specifique a l'IA?"),
});

const AIGreenFlagSchema = z.object({
  flag: z.string(),
  strength: z.enum(["strong", "moderate"]),
  evidence: z.string(),
  implication: z.string().describe("Ce que ca signifie pour l'investissement"),
});

const AIInfraAnalysisSchema = z.object({
  gpuProvider: z.string().nullable().describe("AWS, GCP, Azure, Lambda Labs, CoreWeave, on-prem, etc."),
  monthlyComputeCost: z.number().nullable().describe("Cout mensuel estime en $"),
  costPerInference: z.number().nullable().describe("Cout par requete/inference en $"),
  scalingModel: z.enum(["linear", "sublinear", "superlinear", "unknown"]).describe("Comment les couts scalent avec le volume"),
  projectedCostAtScale: z.number().nullable().describe("Cout projete a 10x le volume actuel"),
  costAssessment: z.string().describe("Evaluation de la viabilite des couts"),
  marginPressureRisk: z.enum(["low", "medium", "high", "critical"]).describe("Risque de compression de marge"),
});

const AIModelApproachSchema = z.object({
  type: z.enum(["fine_tuned", "rag", "from_scratch", "api_wrapper", "hybrid", "unknown"]).describe("Approche technique principale"),
  baseModel: z.string().nullable().describe("Modele de base si applicable (GPT-4, Claude, Llama, etc.)"),
  proprietaryComponents: z.array(z.string()).describe("Composants proprietaires identifies"),
  moatLevel: z.enum(["none", "weak", "moderate", "strong"]).describe("Niveau de moat technique"),
  moatRationale: z.string().describe("Justification du niveau de moat"),
  apiDependency: z.enum(["none", "partial", "full"]).describe("Dependance aux APIs tierces"),
  reproducibilityRisk: z.enum(["easy", "medium", "hard"]).describe("Facilite a reproduire ce qu'ils font"),
});

const AITechnicalDepthSchema = z.object({
  teamMLExperience: z.number().nullable().describe("Annees cumulees d'experience ML de l'equipe technique"),
  hasMLPhD: z.boolean().describe("Au moins un PhD en ML/AI dans l'equipe"),
  papersPublished: z.number().describe("Nombre de publications ML (NeurIPS, ICML, etc.)"),
  topLabAlumni: z.array(z.string()).describe("Ex-Google Brain, DeepMind, OpenAI, FAIR, Anthropic, etc."),
  openSourceContributions: z.array(z.string()).describe("Contributions OSS notable"),
  previousAICompanies: z.array(z.string()).describe("Startups AI precedentes fondees/dirigees"),
  depthAssessment: z.enum(["expert", "competent", "basic", "insufficient", "unknown"]).describe("Evaluation globale"),
  depthRationale: z.string().describe("Justification de l'evaluation"),
});

const AIMetricsSchema = z.object({
  modelLatency: z.object({
    p50: z.number().nullable(),
    p99: z.number().nullable(),
  }).describe("Latence du modele en ms"),
  accuracy: z.object({
    metric: z.string().describe("Nom de la metrique (accuracy, F1, BLEU, etc.)"),
    value: z.number().nullable(),
    benchmark: z.number().nullable().describe("Benchmark de reference"),
    assessment: z.string().describe("Evaluation vs benchmark"),
  }),
  datasetSize: z.number().nullable().describe("Taille du dataset d'entrainement"),
  datasetQuality: z.enum(["proprietary", "licensed", "public", "synthetic", "unknown"]).describe("Qualite/source des donnees"),
  evaluationMethodology: z.enum(["rigorous", "basic", "unclear", "none"]).describe("Rigueur de l'evaluation"),
  metricsAssessment: z.string().describe("Evaluation globale des metriques AI"),
});

const AIMoatAnalysisSchema = z.object({
  dataFlywheel: z.boolean().describe("Le produit s'ameliore avec l'usage?"),
  networkEffects: z.boolean().describe("Effets de reseau presents?"),
  switchingCosts: z.enum(["high", "medium", "low"]).describe("Couts de migration pour les clients"),
  overallMoatScore: z.number().min(0).max(100).describe("Score de moat global"),
  moatAssessment: z.string().describe("Evaluation narrative du moat"),
  competitiveAdvantages: z.array(z.string()).describe("Avantages competitifs identifies"),
  competitiveWeaknesses: z.array(z.string()).describe("Faiblesses competitives"),
});

const AIVerdictSchema = z.object({
  isRealAI: z.boolean().describe("Est-ce une vraie entreprise AI ou du AI-washing?"),
  technicalCredibility: z.enum(["high", "medium", "low"]).describe("Credibilite technique de l'equipe"),
  moatStrength: z.enum(["strong", "moderate", "weak", "none"]).describe("Force du moat"),
  scalabilityRisk: z.enum(["low", "medium", "high"]).describe("Risque sur la scalabilite"),
  recommendation: z.enum(["STRONG_AI_PLAY", "SOLID_AI_PLAY", "AI_CONCERNS", "NOT_REAL_AI"]).describe("Recommandation finale"),
  keyInsight: z.string().describe("Insight cle pour l'investisseur"),
});

const AIOutputSchema = z.object({
  // Identification
  sectorConfidence: z.number().min(0).max(100).describe("Confiance que c'est bien une boite AI/ML"),
  subSector: z.string().describe("Sous-categorie: LLM App, Computer Vision, NLP, MLOps, AI Infrastructure, etc."),
  aiCategory: z.enum(["application_layer", "model_layer", "infrastructure_layer", "data_layer", "unclear"]).describe("Couche de la stack AI"),

  // Infrastructure & Costs
  infraAnalysis: AIInfraAnalysisSchema,

  // Model Approach
  modelApproach: AIModelApproachSchema,

  // Technical Depth
  technicalDepth: AITechnicalDepthSchema,

  // AI Metrics
  aiMetrics: AIMetricsSchema,

  // Moat Analysis
  moatAnalysis: AIMoatAnalysisSchema,

  // Primary Metrics with benchmark
  primaryMetrics: z.array(AIMetricEvaluationSchema).describe("Les 5-6 KPIs critiques AI"),

  // Red Flags
  redFlags: z.array(AIRedFlagSchema),

  // Green Flags
  greenFlags: z.array(AIGreenFlagSchema),

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
  }),

  // Questions specifiques AI
  sectorQuestions: z.array(z.object({
    question: z.string(),
    category: z.enum(["technical", "infrastructure", "moat", "team", "data", "business"]),
    priority: z.enum(["must_ask", "should_ask", "nice_to_have"]),
    why: z.string().describe("Pourquoi cette question est importante"),
    greenFlagAnswer: z.string(),
    redFlagAnswer: z.string(),
  })),

  // AI Verdict
  aiVerdict: AIVerdictSchema,

  // Score et Synthese
  sectorScore: z.number().min(0).max(100),
  scoreBreakdown: z.object({
    technicalDepth: z.number().min(0).max(25),
    moatStrength: z.number().min(0).max(25),
    unitEconomics: z.number().min(0).max(25),
    scalability: z.number().min(0).max(25),
  }),

  executiveSummary: z.string().describe("3-4 phrases: verdict AI, forces/faiblesses, principal risque, potentiel"),

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

export type AIExpertOutput = z.infer<typeof AIOutputSchema>;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatBenchmarksForPrompt(stage: string): string {
  // Standards etablis + patterns AI specifiques
  const standards = getStandardsOnlyInjection("AI", stage);

  return `
${standards}

### PATTERNS D'APPROCHE AI (CRITIQUE - A EVALUER OBLIGATOIREMENT)
${AI_MODEL_APPROACH_PATTERNS.map(p => `- ${p}`).join("\n")}

### SIGNAUX DE CREDIBILITE TECHNIQUE
${AI_TECHNICAL_CREDIBILITY_SIGNALS.map(s => `- ${s}`).join("\n")}

### RED FLAGS AI PATTERNS SPECIFIQUES
${AI_RED_FLAG_PATTERNS.map(r => `- ${r}`).join("\n")}
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
    output += `\n### Deals AI/ML Similaires (${similar.length} trouves)\n`;
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
  return `## REGLE ABSOLUE DE FORMAT
Tu DOIS repondre UNIQUEMENT avec un objet JSON valide. Pas de texte, pas de markdown, pas d'introduction, pas de "Voici mon analyse". JUSTE le JSON.

Tu es un EXPERT AI/ML avec 15 ans d'experience en Due Diligence pour des fonds Tier 1 specialises AI (a16z, Sequoia AI Fund, Greylock).

## TON PROFIL
- Tu as analyse 300+ startups AI du Seed au Growth
- Tu distingues instantanement un wrapper GPT d'une vraie innovation
- Tu connais les couts d'infrastructure GPU par coeur (AWS, GCP, CoreWeave, Lambda Labs)
- Tu as travaille chez Google Brain / DeepMind / OpenAI / Anthropic (tu sais ce qu'est un vrai ML engineer)
- Tu as vu des startups AI lever des millions sans aucune vraie tech (AI-washing)
- Tu as aussi vu des equipes techniques brillantes echouer a cause d'unit economics impossibles

## TA MISSION
Analyser ce deal AI pour determiner:
1. **Est-ce une VRAIE entreprise AI?** (vs AI-washing, vs simple wrapper d'API)
2. **L'equipe a-t-elle la profondeur technique?** (PhDs, publications, experience labs)
3. **Les unit economics sont-ils viables?** (inference costs, gross margin)
4. **Quel est le moat?** (data flywheel, proprietary models, switching costs)
5. **Quels sont les risques specifiques AI?** (API dependency, reproducibility, margin pressure)

## REGLES ABSOLUES

### Sur l'identification AI-washing
- Un "AI-powered" dans le pitch ne veut RIEN dire
- DEMANDE: Quelle est l'architecture du modele? Fine-tuned? RAG? From scratch?
- DEMANDE: Quelle est la dependance aux APIs tierces (OpenAI, Anthropic)?
- Si 100% API dependency + pas de ML team = CRITIQUE RED FLAG

### Sur la profondeur technique
- Une equipe AI DOIT avoir de l'experience ML reelle
- Signaux positifs: PhDs ML, publications (NeurIPS, ICML, ACL), ex-Google Brain/DeepMind/OpenAI/FAIR
- Signaux negatifs: que des devs web/mobile, pas de ML engineer senior, "on va embaucher"

### Sur les couts
- L'inference AI coute CHER - verifie les marges
- GPT-4: ~$0.03-0.06/query. Claude: ~$0.015-0.03. Fine-tuned: $0.001-0.005
- Si gross margin < 40% avec AI = model economique impossible
- Pose la question: "Quel est votre cout par inference?"

### Sur le moat
- API wrapper = ZERO moat (n'importe qui peut le faire)
- RAG avec donnees publiques = FAIBLE moat
- Fine-tuned sur donnees proprietaires = MOAT MODERE
- Architecture/modele proprietaire = FORT moat (rare)
- Data flywheel (le produit s'ameliore avec l'usage) = MEILLEUR moat

### Sur les red flags
- Pas de ML team/PhDs mais "on fait de l'AI"
- 100% dependent d'OpenAI/Anthropic APIs
- Claims "99% accuracy" sans methodologie d'evaluation
- Pas de discussion sur les couts d'inference
- "Notre moat c'est la vitesse d'execution" (= pas de moat)

${formatBenchmarksForPrompt(stage)}

## SCORING (0-100)
Le score sectoriel AI est la SOMME de:
- **Technical Depth (0-25)**: Expertise ML de l'equipe, publications, experience labs
- **Moat Strength (0-25)**: Data flywheel, proprietary tech, switching costs, API independence
- **Unit Economics (0-25)**: Gross margin, inference costs, scalability
- **Scalability (0-25)**: Architecture, infra, path to profitability

Chaque dimension:
- 20-25: Exceptionnel (Top 10% AI companies)
- 15-19: Bon (Solide, investissable)
- 10-14: Acceptable (Concerns mais manageable)
- 5-9: Concernant (Red flags significatifs)
- 0-4: Deal breaker (AI-washing ou model casse)

## RAPPEL FORMAT
Ta reponse DOIT etre un objet JSON valide et RIEN D'AUTRE. Commence directement par { et termine par }.`;
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
**Sector declare**: ${deal.sector || "AI/ML"}
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

### 1. VALIDATION "VRAIE" AI
- Est-ce une vraie entreprise AI ou du AI-washing?
- Quelle est l'approche technique? (API wrapper, RAG, fine-tuned, from scratch)
- Quel niveau de dependance aux APIs tierces?
- Note ta confiance dans la classification

### 2. ANALYSE INFRASTRUCTURE & COUTS
- Quel provider GPU/cloud utilisent-ils?
- Quel est le cout estimé par inference?
- Comment les couts scalent-ils? (lineaire, sublineaire, superlineaire)
- Les unit economics sont-ils viables a scale?

### 3. PROFONDEUR TECHNIQUE DE L'EQUIPE
- Experience ML cumulative de l'equipe
- PhDs en ML/AI?
- Publications (NeurIPS, ICML, ACL, etc.)?
- Alumni des top labs (Google Brain, DeepMind, OpenAI, FAIR, Anthropic)?
- Contributions open source?
- Verdict: expert / competent / basic / insufficient

### 4. ANALYSE DU MOAT
- Data flywheel present?
- Network effects?
- Switching costs pour les clients?
- Reproductibilite par un concurrent?
- Score de moat global (0-100)

### 5. RED FLAGS AI SPECIFIQUES
Pour chaque red flag:
- Severite: critical / major / minor
- Preuve: le chiffre exact ou l'observation
- Impact: ce qui arrive si ca se materialise
- Question: ce qu'il faut demander au fondateur

Verifie au minimum:
- Pas de ML team mais claim "AI"
- 100% API dependency
- Gross margin < 40%
- Claims accuracy sans evaluation rigoureuse
- Pas de donnees proprietaires

### 6. QUESTIONS MUST-ASK
5-7 questions specifiques AI avec:
- La question exacte
- Pourquoi elle est importante
- Ce qu'une bonne reponse ressemble
- Ce qui serait un red flag

### 7. VERDICT AI
- Est-ce une vraie entreprise AI? (oui/non)
- Credibilite technique: high / medium / low
- Force du moat: strong / moderate / weak / none
- Risque scalabilite: low / medium / high
- Recommandation: STRONG_AI_PLAY / SOLID_AI_PLAY / AI_CONCERNS / NOT_REAL_AI

### 8. SCORE ET SYNTHESE
- Score /100 avec breakdown par dimension
- Executive Summary: 3-4 phrases max, actionnable

IMPORTANT: Sois CRITIQUE. Beaucoup de startups font du AI-washing. Ton role est de proteger l'investisseur.

## FORMAT DE SORTIE

Tu DOIS repondre UNIQUEMENT en JSON valide (pas de texte avant/apres, pas de markdown).
Le JSON doit suivre EXACTEMENT cette structure:
{
  "sectorConfidence": number (0-100),
  "subSector": string,
  "aiCategory": "application_layer" | "model_layer" | "infrastructure_layer" | "data_layer" | "unclear",
  "infraAnalysis": { "gpuProvider": string|null, "monthlyComputeCost": number|null, "costPerInference": number|null, "scalingModel": "linear"|"sublinear"|"superlinear"|"unknown", "projectedCostAtScale": number|null, "costAssessment": string, "marginPressureRisk": "low"|"medium"|"high"|"critical" },
  "modelApproach": { "type": "fine_tuned"|"rag"|"from_scratch"|"api_wrapper"|"hybrid"|"unknown", "baseModel": string|null, "proprietaryComponents": [string], "moatLevel": "none"|"weak"|"moderate"|"strong", "moatRationale": string, "apiDependency": "none"|"partial"|"full", "reproducibilityRisk": "easy"|"medium"|"hard" },
  "technicalDepth": { "teamMLExperience": number|null, "hasMLPhD": boolean, "papersPublished": number, "topLabAlumni": [string], "openSourceContributions": [string], "previousAICompanies": [string], "depthAssessment": "expert"|"competent"|"basic"|"insufficient"|"unknown", "depthRationale": string },
  "aiMetrics": { "modelLatency": { "p50": number|null, "p99": number|null }, "accuracy": { "metric": string, "value": number|null, "benchmark": number|null, "assessment": string }, "datasetSize": number|null, "datasetQuality": "proprietary"|"licensed"|"public"|"synthetic"|"unknown", "evaluationMethodology": "rigorous"|"basic"|"unclear"|"none", "metricsAssessment": string },
  "moatAnalysis": { "dataFlywheel": boolean, "networkEffects": boolean, "switchingCosts": "high"|"medium"|"low", "overallMoatScore": number (0-100), "moatAssessment": string, "competitiveAdvantages": [string], "competitiveWeaknesses": [string] },
  "primaryMetrics": [{ "metricName": string, "dealValue": number|string|null, "source": string, "benchmark": { "p25": number, "median": number, "p75": number, "topDecile": number }, "percentilePosition": number, "assessment": string, "insight": string }],
  "redFlags": [{ "flag": string, "severity": "critical"|"major"|"minor", "evidence": string, "impact": string, "questionToAsk": string, "aiSpecific": boolean }],
  "greenFlags": [{ "flag": string, "strength": "strong"|"moderate", "evidence": string, "implication": string }],
  "dbComparison": { "similarDealsFound": number, "thisDealsPosition": string },
  "sectorQuestions": [{ "question": string, "category": string, "priority": "must_ask"|"should_ask"|"nice_to_have", "why": string, "greenFlagAnswer": string, "redFlagAnswer": string }],
  "aiVerdict": { "isRealAI": boolean, "technicalCredibility": "high"|"medium"|"low", "moatStrength": "strong"|"moderate"|"weak"|"none", "scalabilityRisk": "low"|"medium"|"high", "recommendation": "STRONG_AI_PLAY"|"SOLID_AI_PLAY"|"AI_CONCERNS"|"NOT_REAL_AI", "keyInsight": string },
  "sectorScore": number (0-100),
  "scoreBreakdown": { "technicalDepth": number (0-25), "moatStrength": number (0-25), "unitEconomics": number (0-25), "scalability": number (0-25) },
  "executiveSummary": string,
  "dbCrossReference": { "claims": [], "hiddenCompetitors": [] },
  "sectorFitScore": number (0-100),
  "dataCompleteness": { "level": "complete"|"partial"|"minimal", "availableDataPoints": number, "expectedDataPoints": number, "missingCritical": [string], "limitations": [string] }
}`;
}

// ============================================================================
// HELPER: Transform output to SectorExpertData
// ============================================================================

function transformOutput(raw: AIExpertOutput, cappedScore: number, cappedFitScore: number): SectorExpertData {
  return {
    sectorName: "AI/ML",
    sectorMaturity: "growing",

    keyMetrics: (raw.primaryMetrics ?? []).map(m => ({
      metricName: m.metricName,
      value: m.dealValue,
      sectorBenchmark: m.benchmark,
      assessment: m.assessment === "critical" ? "concerning" as const : m.assessment,
      sectorContext: m.insight,
    })),

    sectorRedFlags: (raw.redFlags ?? []).map(rf => ({
      flag: rf.flag,
      severity: rf.severity,
      sectorReason: `${rf.evidence}. Impact: ${rf.impact}. Question: ${rf.questionToAsk}`,
    })),

    sectorOpportunities: (raw.greenFlags ?? []).map(gf => ({
      opportunity: gf.flag,
      potential: gf.strength === "strong" ? "high" as const : "medium" as const,
      reasoning: `${gf.evidence}. ${gf.implication}`,
    })),

    regulatoryEnvironment: {
      complexity: "medium",
      keyRegulations: ["AI Act (EU)", "GDPR", "Data Privacy Laws"],
      complianceRisks: [],
      upcomingChanges: ["EU AI Act enforcement 2025", "US AI executive orders"],
    },

    sectorDynamics: {
      competitionIntensity: "intense",
      consolidationTrend: "consolidating",
      barrierToEntry: (raw.moatAnalysis?.overallMoatScore ?? 0) > 50 ? "high" : "medium",
      typicalExitMultiple: 12, // Placeholder - multiples actuels via recherche web
      recentExits: [], // Exits recents via recherche web, pas hardcodes
    },

    sectorQuestions: (raw.sectorQuestions ?? []).map(q => ({
      question: q.question,
      category: q.category === "technical" || q.category === "infrastructure" ? "technical" as const :
                q.category === "moat" || q.category === "data" ? "competitive" as const : "business" as const,
      priority: q.priority,
      expectedAnswer: q.greenFlagAnswer,
      redFlagAnswer: q.redFlagAnswer,
    })),

    sectorFit: {
      score: cappedFitScore,
      strengths: (raw.greenFlags ?? []).map(gf => gf.flag),
      weaknesses: (raw.redFlags ?? []).map(rf => rf.flag),
      sectorTiming: "optimal", // AI market is hot
    },

    sectorScore: cappedScore,
    executiveSummary: raw.executiveSummary,
  };
}

// ============================================================================
// HELPER: Build Extended Data
// ============================================================================

function buildExtendedData(raw: AIExpertOutput, completenessLevel: string, rawScore: number, cappedScore: number, limitations: string[]): Partial<ExtendedSectorData> {
  // Defensive: provide defaults for all nested objects that LLM might not return
  const infraAnalysis = raw.infraAnalysis ?? {};
  const modelApproach = raw.modelApproach ?? {};
  const technicalDepth = raw.technicalDepth ?? {};
  const aiMetrics = raw.aiMetrics ?? {};
  const moatAnalysis = raw.moatAnalysis ?? {};

  return {
    subSector: {
      primary: raw.subSector ?? "AI/ML",
      secondary: [raw.aiCategory ?? "general"],
      rationale: `AI Category: ${raw.aiCategory ?? "unknown"}`,
    },
    aiInfraCosts: {
      gpuProvider: infraAnalysis.gpuProvider || "Unknown",
      monthlyComputeCost: infraAnalysis.monthlyComputeCost,
      costPerInference: infraAnalysis.costPerInference,
      scalingModel: infraAnalysis.scalingModel,
      projectedCostAtScale: infraAnalysis.projectedCostAtScale,
      costAssessment: infraAnalysis.costAssessment,
    },
    aiModelApproach: {
      type: modelApproach.type,
      baseModel: modelApproach.baseModel,
      proprietaryComponents: modelApproach.proprietaryComponents,
      moatLevel: modelApproach.moatLevel,
      moatRationale: modelApproach.moatRationale,
    },
    aiTechnicalDepth: {
      teamMLExperience: technicalDepth.teamMLExperience,
      hasMLPhD: technicalDepth.hasMLPhD,
      papersPublished: technicalDepth.papersPublished,
      openSourceContributions: technicalDepth.openSourceContributions,
      previousAICompanies: technicalDepth.previousAICompanies,
      depthAssessment: technicalDepth.depthAssessment,
      depthRationale: technicalDepth.depthRationale,
    },
    aiMetrics: {
      modelLatency: aiMetrics.modelLatency,
      accuracy: aiMetrics.accuracy,
      datasetSize: aiMetrics.datasetSize,
      datasetQuality: aiMetrics.datasetQuality,
      evaluationMethodology: aiMetrics.evaluationMethodology,
      metricsAssessment: aiMetrics.metricsAssessment,
    },
    aiMoat: {
      dataFlywheel: moatAnalysis.dataFlywheel,
      networkEffects: moatAnalysis.networkEffects,
      switchingCosts: moatAnalysis.switchingCosts,
      apiDependency: modelApproach.apiDependency,
      reproducibility: modelApproach.reproducibilityRisk,
      overallMoatScore: moatAnalysis.overallMoatScore,
      moatAssessment: moatAnalysis.moatAssessment,
    },
    aiRedFlags: {
      noMLTeam: technicalDepth.depthAssessment === "insufficient",
      justAPIWrapper: modelApproach.type === "api_wrapper",
      noProprietaryData: aiMetrics.datasetQuality === "public",
      unrealisticAccuracyClaims: aiMetrics.evaluationMethodology === "unclear" || aiMetrics.evaluationMethodology === "none",
      noEvaluation: aiMetrics.evaluationMethodology === "none",
      highAPIDependency: modelApproach.apiDependency === "full",
      redFlagSummary: (raw.redFlags ?? []).filter(rf => rf.aiSpecific).map(rf => rf.flag).join("; "),
    },
    aiVerdict: raw.aiVerdict,
    scoreBreakdown: {
      ...(raw.scoreBreakdown ?? {}),
      justification: raw.executiveSummary,
    },
    dbComparison: raw.dbComparison,
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
    verdict: {
      recommendation: raw.aiVerdict.recommendation === "STRONG_AI_PLAY" ? "STRONG_FIT" :
                      raw.aiVerdict.recommendation === "SOLID_AI_PLAY" ? "GOOD_FIT" :
                      raw.aiVerdict.recommendation === "AI_CONCERNS" ? "MODERATE_FIT" : "NOT_RECOMMENDED",
      confidence: raw.aiVerdict.technicalCredibility,
      keyInsight: raw.aiVerdict.keyInsight,
      topConcern: raw.redFlags.length > 0 ? raw.redFlags[0].flag : "None identified",
      topStrength: raw.greenFlags.length > 0 ? raw.greenFlags[0].flag : "None identified",
    },
  };
}

// ============================================================================
// DEFAULT DATA
// ============================================================================

function getDefaultData(): SectorExpertData {
  return {
    sectorName: "AI/ML",
    sectorMaturity: "growing",
    keyMetrics: [],
    sectorRedFlags: [{
      flag: "Analyse incomplete",
      severity: "major",
      sectorReason: "L'analyse AI n'a pas pu etre completee",
    }],
    sectorOpportunities: [],
    regulatoryEnvironment: {
      complexity: "medium",
      keyRegulations: [],
      complianceRisks: ["Analyse incomplete"],
      upcomingChanges: [],
    },
    sectorDynamics: {
      competitionIntensity: "intense",
      consolidationTrend: "consolidating",
      barrierToEntry: "medium",
      typicalExitMultiple: 12, // Placeholder - multiples actuels via recherche web
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
    executiveSummary: "L'analyse sectorielle AI n'a pas pu etre completee.",
  };
}

// ============================================================================
// AI EXPERT AGENT
// ============================================================================

export const aiExpert = {
  name: "ai-expert" as SectorExpertType,

  async run(context: EnrichedAgentContext): Promise<SectorExpertResult> {
    const startTime = Date.now();

    try {
      const stage = context.deal.stage || "SEED";
      const systemPromptText = buildSystemPrompt(stage);
      const userPromptText = buildUserPrompt(context);

      setAgentContext("ai-expert");

      const response = await completeJSON<AIExpertOutput>(userPromptText, {
        systemPrompt: systemPromptText,
        complexity: "complex",
        temperature: 0.3,
      });

      // Parse and validate response
      let parsedOutput: AIExpertOutput;
      const parseResult = AIOutputSchema.safeParse(response.data);
      if (parseResult.success) {
        parsedOutput = parseResult.data;
      } else {
        console.warn(`[ai-expert] Strict parse failed (${parseResult.error.issues.length} issues), using raw data with defaults`);
        parsedOutput = response.data as AIExpertOutput;
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
        agentName: "ai-expert",
        success: true,
        executionTimeMs: Date.now() - startTime,
        cost: response.cost ?? 0,
        data: sectorData,
        // Include extended data for detailed display
        _extended: buildExtendedData(parsedOutput, completenessLevel, rawScore, cappedScore, limitations),
      };

    } catch (error) {
      console.error("[ai-expert] Execution error:", error);
      return {
        agentName: "ai-expert",
        success: false,
        executionTimeMs: Date.now() - startTime,
        cost: 0,
        error: error instanceof Error ? error.message : "Unknown error",
        data: getDefaultData(),
      };
    }
  },
};
