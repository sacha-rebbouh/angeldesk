/**
 * General Expert Agent - Tier 2 FALLBACK
 *
 * Agent de fallback pour les secteurs NON COUVERTS par les 20 experts specialises.
 *
 * DIFFERENCE CRITIQUE vs autres experts:
 * - ZERO standards hardcodes
 * - 100% recherche web pour tous les benchmarks
 * - Identification dynamique des metriques pertinentes
 * - Transparence totale sur les donnees trouvees vs manquantes
 *
 * Mission: Fournir une analyse sectorielle de qualite Big4 + Partner VC
 * meme pour des secteurs de niche ou emergents.
 *
 * Standards:
 * - Chaque metrique comparee aux benchmarks trouves en ligne (AVEC SOURCE)
 * - Red flags avec severite + preuve + impact + question
 * - Cross-reference avec la Funding Database
 * - JAMAIS inventer de benchmarks - toujours sourcer ou dire "non disponible"
 */

import { z } from "zod";
import type { EnrichedAgentContext } from "../types";
import type { SectorExpertData, SectorExpertResult } from "./types";
import { complete, setAgentContext } from "@/services/openrouter/router";

// ============================================================================
// OUTPUT SCHEMA
// ============================================================================

const GeneralMetricEvaluationSchema = z.object({
  metricName: z.string().describe("Nom de la metrique identifiee comme pertinente pour ce secteur"),
  metricDescription: z.string().describe("Pourquoi cette metrique est importante dans ce secteur specifique"),
  dealValue: z.union([z.number(), z.string(), z.null()]).describe("Valeur extraite du deal"),
  source: z.string().describe("Source: deck page X, data room, calcul, etc."),
  benchmark: z.object({
    value: z.union([z.number(), z.string(), z.null()]).describe("Benchmark trouve"),
    source: z.string().describe("Source du benchmark (URL, rapport, annee)"),
    confidence: z.enum(["high", "medium", "low"]).describe("Confiance dans ce benchmark"),
  }).nullable().describe("Benchmark trouve via recherche - null si non trouve"),
  assessment: z.enum(["exceptional", "above_average", "average", "below_average", "critical", "cannot_assess"]),
  insight: z.string().describe("Ce que ca signifie pour un investisseur"),
});

const GeneralRedFlagSchema = z.object({
  flag: z.string().describe("Description claire du red flag"),
  severity: z.enum(["critical", "major", "minor"]),
  evidence: z.string().describe("Preuve concrete (chiffre, source, citation)"),
  sectorContext: z.string().describe("Pourquoi c'est un red flag dans CE secteur specifiquement"),
  impact: z.string().describe("Impact business si ce risque se materialise"),
  questionToAsk: z.string().describe("Question precise a poser au fondateur"),
  benchmarkReference: z.string().optional().describe("Reference benchmark si applicable"),
});

const GeneralGreenFlagSchema = z.object({
  flag: z.string(),
  strength: z.enum(["strong", "moderate"]),
  evidence: z.string(),
  sectorContext: z.string().describe("Pourquoi c'est positif dans CE secteur"),
  implication: z.string().describe("Ce que ca signifie pour l'investissement"),
});

const SectorResearchSchema = z.object({
  // Identification du secteur
  identifiedSector: z.string().describe("Le secteur identifie (peut etre different de celui declare)"),
  sectorConfidence: z.number().min(0).max(100),
  sectorRationale: z.string().describe("Pourquoi ce secteur a ete identifie"),

  // Sous-secteur et positionnement
  subSector: z.string().describe("Sous-categorie plus precise"),
  adjacentSectors: z.array(z.string()).describe("Secteurs connexes qui pourraient aussi s'appliquer"),

  // Recherche des caracteristiques sectorielles
  sectorCharacteristics: z.object({
    businessModelTypes: z.array(z.string()).describe("Types de business model typiques dans ce secteur"),
    keySuccessFactors: z.array(z.string()).describe("Facteurs cles de succes identifies via recherche"),
    typicalChallenges: z.array(z.string()).describe("Defis typiques du secteur"),
    regulatoryEnvironment: z.string().describe("Description de l'environnement reglementaire"),
  }),

  // Sources utilisees
  sourcesConsulted: z.array(z.object({
    type: z.enum(["web_search", "funding_db", "deck_analysis", "general_knowledge"]),
    description: z.string(),
    reliability: z.enum(["high", "medium", "low"]),
  })),
});

const GeneralOutputSchema = z.object({
  // Section 1: Recherche sectorielle
  sectorResearch: SectorResearchSchema,

  // Section 2: Metriques identifiees et evaluees
  keyMetrics: z.array(GeneralMetricEvaluationSchema).describe("Metriques pertinentes identifiees pour ce secteur"),

  // Section 3: Benchmarks trouves
  benchmarksFound: z.object({
    totalSearched: z.number(),
    totalFound: z.number(),
    qualityAssessment: z.enum(["excellent", "good", "limited", "poor"]),
    limitations: z.array(z.string()).describe("Ce qui n'a pas pu etre trouve"),
  }),

  // Section 4: Red Flags
  redFlags: z.array(GeneralRedFlagSchema),

  // Section 5: Green Flags
  greenFlags: z.array(GeneralGreenFlagSchema),

  // Section 6: Analyse concurrentielle (DB + recherche)
  competitiveAnalysis: z.object({
    competitorsFromDb: z.number(),
    competitorsFromWebSearch: z.number(),
    competitorMentionedInDeck: z.array(z.string()),
    hiddenCompetitors: z.array(z.object({
      name: z.string(),
      source: z.string(),
      threatLevel: z.enum(["high", "medium", "low"]),
      reason: z.string(),
    })).describe("Concurrents trouves mais NON mentionnes dans le deck - RED FLAG potential"),
    marketPosition: z.string(),
  }),

  // Section 7: Unit Economics (adapte au secteur)
  unitEconomics: z.object({
    relevantFormulas: z.array(z.object({
      name: z.string(),
      formula: z.string(),
      applicability: z.string().describe("Pourquoi cette formule est pertinente pour ce secteur"),
      calculatedValue: z.union([z.number(), z.string(), z.null()]),
      benchmark: z.union([z.string(), z.null()]).describe("Benchmark trouve avec source"),
      assessment: z.enum(["excellent", "good", "acceptable", "concerning", "critical", "cannot_assess"]),
    })),
    overallHealthScore: z.number().min(0).max(100),
    verdict: z.string(),
    dataGaps: z.array(z.string()).describe("Donnees manquantes pour evaluer completement"),
  }),

  // Section 8: Dynamiques sectorielles
  sectorDynamics: z.object({
    maturity: z.enum(["nascent", "emerging", "growing", "mature", "declining"]).catch("emerging"),
    competitionIntensity: z.enum(["low", "moderate", "high", "intense"]),
    barrierToEntry: z.enum(["low", "medium", "high", "very_high"]),
    consolidationTrend: z.enum(["fragmenting", "stable", "consolidating", "winner_take_all"]),
    bigTechThreat: z.object({
      level: z.enum(["none", "low", "medium", "high", "critical"]),
      players: z.array(z.string()),
      rationale: z.string(),
    }),
    regulatoryRisk: z.object({
      level: z.enum(["low", "medium", "high", "very_high"]),
      keyRegulations: z.array(z.string()),
      upcomingChanges: z.array(z.string()),
    }),
  }),

  // Section 9: Paysage Exit
  exitLandscape: z.object({
    recentExits: z.array(z.object({
      company: z.string(),
      acquirer: z.string().optional().default("Unknown"),
      multiple: z.union([z.number(), z.string()]).optional().nullable(),
      year: z.number().optional().nullable(),
      source: z.string().optional().default("web search"),
    })).describe("Exits trouves via recherche"),
    typicalAcquirers: z.array(z.string()),
    medianMultiple: z.union([z.number(), z.string(), z.null()]).describe("Multiple median trouve avec source"),
    multipleSource: z.string().nullable(),
    timeToExitYears: z.string(),
    exitPotentialAssessment: z.enum(["strong", "moderate", "weak", "uncertain"]),
  }),

  // Section 10: Valorisation
  valuationAnalysis: z.object({
    askMultiple: z.union([z.number(), z.null()]).describe("Multiple demande (si calculable)"),
    multipleType: z.string().describe("Type de multiple (ARR, GMV, Revenue, etc.)"),
    sectorMedianMultiple: z.union([z.number(), z.string(), z.null()]),
    sectorMedianSource: z.string().nullable(),
    percentilePosition: z.union([z.number(), z.string(), z.null()]),
    verdict: z.enum(["attractive", "fair", "stretched", "excessive", "cannot_assess"]),
    negotiationLeverage: z.array(z.string()).describe("Arguments pour negocier"),
  }),

  // Section 11: Questions sectorielles
  sectorQuestions: z.array(z.object({
    question: z.string(),
    category: z.enum(["business_model", "metrics", "competition", "regulation", "technology", "market"]),
    priority: z.enum(["must_ask", "should_ask", "nice_to_have"]),
    sectorContext: z.string().describe("Pourquoi cette question est importante dans CE secteur"),
    greenFlagAnswer: z.string(),
    redFlagAnswer: z.string(),
  })),

  // Section 12: Score et Synthese
  sectorScore: z.number().min(0).max(100),
  scoreBreakdown: z.object({
    metrics: z.object({ score: z.number(), weight: z.number(), rationale: z.string() }),
    unitEconomics: z.object({ score: z.number(), weight: z.number(), rationale: z.string() }),
    competitive: z.object({ score: z.number(), weight: z.number(), rationale: z.string() }),
    timing: z.object({ score: z.number(), weight: z.number(), rationale: z.string() }),
    team: z.object({ score: z.number(), weight: z.number(), rationale: z.string() }),
  }),

  // Section 13: Confiance de l'analyse
  analysisConfidence: z.object({
    level: z.enum(["high", "medium", "low"]),
    rationale: z.string(),
    dataGaps: z.array(z.string()).describe("Donnees manquantes qui affectent la confiance"),
    recommendedActions: z.array(z.string()).describe("Ce qu'il faudrait faire pour ameliorer l'analyse"),
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


  executiveSummary: z.string().describe("4-5 phrases: secteur identifie, position, forces, risques, verdict"),

  investmentImplication: z.enum([
    "strong_sector_fit",
    "solid_with_concerns",
    "sector_challenges",
    "fundamental_concerns",
    "insufficient_data"
  ]),
});

export type GeneralExpertOutput = z.infer<typeof GeneralOutputSchema>;

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

function buildSystemPrompt(): string {
  return `Tu es un ANALYSTE DUE DILIGENCE SENIOR generaliste avec 20+ ans d'experience dans des secteurs varies.

## TON PROFIL UNIQUE

Tu n'es PAS un expert d'un secteur specifique. Tu es un GENERALISTE de tres haut niveau capable de:
- Identifier rapidement les metriques cles de N'IMPORTE QUEL secteur
- Rechercher et trouver les benchmarks pertinents via recherche web
- Appliquer les principes universels d'evaluation startup
- Etre TRANSPARENT sur ce que tu sais vs ce que tu ne sais pas

Tu as analyse 1000+ startups dans 50+ secteurs differents. Tu sais que:
- Chaque secteur a ses propres metriques de succes
- Les benchmarks changent selon le secteur ET le stage
- Il vaut mieux dire "je n'ai pas trouve de benchmark" que d'inventer

## TA MISSION CRITIQUE

Ce deal est dans un secteur pour lequel il n'existe PAS d'expert specialise.
Tu dois donc:

1. **IDENTIFIER le secteur exact** - Peut etre different de ce qui est declare
2. **RECHERCHER les metriques pertinentes** - Quels KPIs comptent dans ce secteur?
3. **TROUVER les benchmarks** - Via recherche, avec sources
4. **EVALUER objectivement** - Meme avec des donnees partielles
5. **ETRE TRANSPARENT** - Sur ce qui manque et ce que tu ne sais pas

## REGLES ABSOLUES (NON NEGOCIABLES)

### 1. ZERO INVENTION
❌ JAMAIS inventer de benchmarks ou de chiffres
❌ JAMAIS dire "typiquement X%" sans source
❌ JAMAIS extrapoler de secteurs "similaires" sans le dire explicitement

✅ TOUJOURS citer la source de chaque benchmark
✅ TOUJOURS dire "benchmark non trouve" si tu n'as pas de donnee
✅ TOUJOURS qualifier la confiance dans tes sources

### 2. RECHERCHE OBLIGATOIRE
Pour chaque metrique importante, tu dois avoir cherche:
- "${new Date().getFullYear()} [secteur] benchmarks"
- "[secteur] startup KPIs"
- "[secteur] valuation multiples ${new Date().getFullYear()}"
- "[secteur] exit multiples acquisitions"

### 3. TRANSPARENCE TOTALE
Chaque section doit indiquer:
- Ce que tu as trouve (avec source)
- Ce que tu n'as pas trouve
- Le niveau de confiance de ton analyse

### 4. CROSS-REFERENCE DB
- Compare TOUJOURS avec les donnees de la Funding Database
- Identifie les concurrents dans la DB non mentionnes dans le deck
- Si la DB n'a pas de donnees pour ce secteur, le dire explicitement

## METHODOLOGIE D'ANALYSE

### Etape 1: Identification Sectorielle
- Analyse le deck pour identifier le VRAI secteur (pas juste ce qui est declare)
- Identifie les sous-secteurs et secteurs adjacents
- Evalue la confiance dans cette classification

### Etape 2: Recherche des Metriques Cles
Pour ce secteur specifique, identifie:
- Les 5-7 metriques primaires qui comptent vraiment
- Les formules d'unit economics pertinentes
- Les seuils de red flags specifiques au secteur

### Etape 3: Recherche de Benchmarks
Pour chaque metrique identifiee:
- Recherche le benchmark sectoriel
- Note la source et la date
- Evalue la fiabilite de cette source

### Etape 4: Evaluation du Deal
- Compare les metriques du deal aux benchmarks trouves
- Calcule les percentiles quand possible
- Identifie les ecarts significatifs

### Etape 5: Analyse Competitive
- Utilise la Funding DB pour trouver des comparables
- Recherche d'autres concurrents en ligne
- Identifie les concurrents non mentionnes dans le deck

### Etape 6: Synthese
- Score global avec decomposition
- Forces et faiblesses
- Questions critiques a poser
- Recommandation

## SCORING

Le score (0-100) est calcule ainsi:
- **Metriques (25%)**: Position vs benchmarks trouves
- **Unit Economics (25%)**: Sante des fondamentaux
- **Competitive (20%)**: Position vs concurrents
- **Timing (15%)**: Maturite du secteur, timing d'entree
- **Team/Fit (15%)**: Adequation equipe/secteur

**Ajustement confiance:**
- Si donnees completes: score normal
- Si donnees partielles: score plafonne a 70 + warning
- Si donnees insuffisantes: score plafonne a 50 + red flag

## FORMAT DE SORTIE

Tu DOIS retourner un JSON valide suivant exactement le schema fourni.
Chaque champ doit etre rempli avec des donnees concretes ou explicitement marque comme "non disponible" avec une raison.`;
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

  // Extraire le contexte Funding DB
  let fundingDbContext = "";
  if (context.fundingDbContext) {
    const similar = context.fundingDbContext.similarDeals || [];
    const competitors = context.fundingDbContext.potentialCompetitors || [];
    const benchmarks = context.fundingDbContext.benchmarks;

    if (similar.length > 0) {
      fundingDbContext += `\n### Deals Similaires (Funding DB)\n`;
      fundingDbContext += similar.slice(0, 10).map((d: Record<string, unknown>) =>
        `- **${d.name}**: ${d.amount ? `${d.amount}€` : "N/A"} @ ${d.valuation ? `${d.valuation}€ valo` : "N/A"} (${d.stage || "?"}) - ${d.status || "?"}`
      ).join("\n");
    }

    if (competitors.length > 0) {
      fundingDbContext += `\n\n### Concurrents Potentiels (Funding DB)\n`;
      fundingDbContext += competitors.slice(0, 10).map((c: Record<string, unknown>) =>
        `- **${c.name}**: ${c.totalRaised ? `${c.totalRaised}€ leves` : ""} ${c.lastRound ? `(dernier round: ${c.lastRound})` : ""}`
      ).join("\n");
    }

    if (benchmarks) {
      fundingDbContext += `\n\n### Benchmarks DB\n`;
      fundingDbContext += JSON.stringify(benchmarks, null, 2);
    }

    if (!similar.length && !competitors.length && !benchmarks) {
      fundingDbContext = "\n**Funding DB**: Pas de donnees disponibles pour ce secteur dans la base.";
    }
  } else {
    fundingDbContext = "\n**Funding DB**: Pas de donnees disponibles.";
  }

  
    let fundingDbData = "";
    const contextEngineAny = context.contextEngine as Record<string, unknown> | undefined;
    const fundingDb = contextEngineAny?.fundingDb as { competitors?: unknown; valuationBenchmark?: unknown; sectorTrend?: unknown } | undefined;
    if (fundingDb) {
      fundingDbData = `\n## FUNDING DATABASE - CROSS-REFERENCE OBLIGATOIRE\n\nTu DOIS produire un champ "dbCrossReference" dans ton output.\n\n### Concurrents détectés dans la DB\n${fundingDb.competitors ? JSON.stringify(fundingDb.competitors, null, 2).slice(0, 3000) : "Aucun"}\n\n### Benchmark valorisation\n${fundingDb.valuationBenchmark ? JSON.stringify(fundingDb.valuationBenchmark, null, 2) : "N/A"}\n\n### Tendance funding\n${fundingDb.sectorTrend ? JSON.stringify(fundingDb.sectorTrend, null, 2) : "N/A"}\n\nINSTRUCTIONS DB:\n1. Claims deck \u2192 v\u00e9rifi\u00e9 vs donn\u00e9es\n2. Concurrents DB absents du deck = RED FLAG CRITICAL\n3. Valo vs percentiles\n4. "pas de concurrent" + DB en trouve = RED FLAG CRITICAL`;
    }

    return `
## DEAL A ANALYSER - SECTEUR NON STANDARD

**ATTENTION**: Ce deal est dans un secteur pour lequel il n'existe PAS d'expert specialise.
Tu dois donc effectuer une analyse complete en recherchant toi-meme les benchmarks.

---

## INFORMATIONS DU DEAL

**Company**: ${deal.companyName || deal.name}
**Secteur declare**: ${deal.sector || "Non specifie"}
**Stage**: ${stage}
**Geographie**: ${deal.geography || "Non specifie"}
**Valorisation demandee**: ${deal.valuationPre ? `${Number(deal.valuationPre)}€` : "Non specifiee"}
**Montant du round**: ${deal.amountRequested ? `${Number(deal.amountRequested)}€` : "Non specifie"}
**ARR declare**: ${deal.arr ? `${Number(deal.arr)}€` : "Non specifie"}
**Croissance declaree**: ${deal.growthRate ? `${deal.growthRate}%` : "Non specifiee"}

---

## DONNEES FUNDING DATABASE
${fundingDbContext}

${context.factStoreFormatted ? `
## DONNÉES VÉRIFIÉES (Fact Store)

Les données ci-dessous ont été extraites et vérifiées à partir des documents du deal.
Base ton analyse sur ces faits. Si un fait important manque, signale-le.

${context.factStoreFormatted}
` : ""}

---

${fundingDbData}

## ANALYSES TIER 1 (DEJA EFFECTUEES)
${tier1Insights || "Pas d'analyses Tier 1 disponibles"}

---

## TES TACHES (DANS L'ORDRE)

### TACHE 1: IDENTIFICATION SECTORIELLE
- Analyse le deck et les donnees pour determiner le VRAI secteur
- Ce secteur peut etre different de celui declare
- Identifie les sous-secteurs et secteurs adjacents
- Donne ta confiance (0-100) dans cette classification

### TACHE 2: RECHERCHE DES METRIQUES CLES
Pour ce secteur specifique:
a) Quelles sont les 5-7 metriques qui comptent vraiment?
b) Quelles formules d'unit economics sont pertinentes?
c) Quels seuils constituent des red flags?

**IMPORTANT**: Ne pas copier des metriques SaaS/Fintech generiques si elles ne s'appliquent pas.

### TACHE 3: RECHERCHE DE BENCHMARKS
Pour chaque metrique identifiee, recherche:
- Le benchmark sectoriel (avec source et date)
- Les percentiles si disponibles (P25, median, P75)
- Les seuils de reference

**Termes de recherche suggeres:**
- "[secteur identifie] startup benchmarks ${new Date().getFullYear()}"
- "[secteur identifie] KPIs metrics"
- "[secteur identifie] valuation multiples"
- "[secteur identifie] industry standards"

**RAPPEL CRITIQUE**: Si tu ne trouves pas de benchmark, ne l'invente pas. Indique "non trouve" avec une explication.

### TACHE 4: EVALUATION DES METRIQUES DU DEAL
Pour chaque metrique disponible dans le deal:
- Extrais la valeur (avec source: deck page X, calcul, etc.)
- Compare au benchmark trouve
- Donne l'assessment (exceptional → critical → cannot_assess)
- Explique l'implication pour un investisseur

### TACHE 5: ANALYSE COMPETITIVE
- Liste les concurrents mentionnes dans le deck
- Liste les concurrents trouves dans la Funding DB
- Recherche d'autres concurrents en ligne
- **RED FLAG CRITIQUE**: Identifie les concurrents trouves mais NON mentionnes dans le deck

### TACHE 6: DYNAMIQUES SECTORIELLES
- Maturite du secteur (nascent → declining)
- Intensite concurrentielle
- Barrieres a l'entree
- Menace Big Tech
- Environnement reglementaire

### TACHE 7: PAYSAGE EXIT
Recherche:
- Exits recents dans ce secteur (avec source)
- Multiples de sortie observes (avec source)
- Acquereurs typiques
- Time to exit estime

### TACHE 8: ANALYSE VALORISATION
- Calcule le multiple demande (quel type de multiple est pertinent pour ce secteur?)
- Compare aux multiples trouves via recherche
- Donne un verdict et des arguments de negociation

### TACHE 9: QUESTIONS SECTORIELLES
5-7 questions specifiques a ce secteur avec:
- Contexte: pourquoi cette question est importante ICI
- Green flag answer
- Red flag answer

### TACHE 10: SCORE ET SYNTHESE
- Score /100 avec decomposition detaillee
- Forces et faiblesses
- Niveau de confiance de l'analyse
- Executive Summary (4-5 phrases)
- Implication pour l'investissement

---

## RAPPELS CRITIQUES

⚠️ **JAMAIS de benchmarks inventes** - Chaque chiffre doit avoir une source
⚠️ **Transparence** - Indique clairement ce que tu n'as pas trouve
⚠️ **Cross-reference DB** - Compare toujours avec la Funding DB
⚠️ **Concurrents caches** - Les concurrents DB non mentionnes sont des red flags potentiels
⚠️ **Confiance** - Ajuste ton score selon la qualite des donnees disponibles

Retourne un JSON valide avec toutes les sections completees.`;
}

// ============================================================================
// HELPER: Normalize LLM output before validation
// ============================================================================

function normalizeOutput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;

  const obj = raw as Record<string, unknown>;

  // Ensure sectorResearch exists with all required fields
  if (!obj.sectorResearch || typeof obj.sectorResearch !== "object") {
    obj.sectorResearch = {
      identifiedSector: obj.sector || "Non identifie",
      sectorConfidence: 50,
      sectorRationale: "Secteur determine automatiquement",
      subSector: "General",
      adjacentSectors: [],
      sectorCharacteristics: {
        businessModelTypes: [],
        keySuccessFactors: [],
        typicalChallenges: [],
        regulatoryEnvironment: "Non evalue",
      },
      sourcesConsulted: [],
    };
  } else {
    const sr = obj.sectorResearch as Record<string, unknown>;
    sr.identifiedSector = sr.identifiedSector || "Non identifie";
    sr.sectorConfidence = sr.sectorConfidence ?? 50;
    sr.sectorRationale = sr.sectorRationale || "Non specifie";
    sr.subSector = sr.subSector || "General";
    sr.adjacentSectors = Array.isArray(sr.adjacentSectors) ? sr.adjacentSectors : [];
    if (!sr.sectorCharacteristics || typeof sr.sectorCharacteristics !== "object") {
      sr.sectorCharacteristics = {
        businessModelTypes: [],
        keySuccessFactors: [],
        typicalChallenges: [],
        regulatoryEnvironment: "Non evalue",
      };
    }
    sr.sourcesConsulted = Array.isArray(sr.sourcesConsulted) ? sr.sourcesConsulted : [];
  }

  // Ensure keyMetrics is an array
  if (!Array.isArray(obj.keyMetrics)) {
    obj.keyMetrics = [];
  }

  // Ensure benchmarksFound exists
  if (!obj.benchmarksFound || typeof obj.benchmarksFound !== "object") {
    obj.benchmarksFound = {
      totalSearched: 0,
      totalFound: 0,
      qualityAssessment: "poor",
      limitations: ["Donnees non disponibles"],
    };
  }

  // Ensure redFlags is an array
  if (!Array.isArray(obj.redFlags)) {
    obj.redFlags = [];
  }

  // Ensure greenFlags is an array
  if (!Array.isArray(obj.greenFlags)) {
    obj.greenFlags = [];
  }

  // Ensure competitiveAnalysis exists with all required fields
  if (!obj.competitiveAnalysis || typeof obj.competitiveAnalysis !== "object") {
    obj.competitiveAnalysis = {
      competitorsFromDb: 0,
      competitorsFromWebSearch: 0,
      competitorMentionedInDeck: [],
      hiddenCompetitors: [],
      marketPosition: "Non evalue",
    };
  } else {
    const ca = obj.competitiveAnalysis as Record<string, unknown>;
    ca.competitorsFromDb = ca.competitorsFromDb ?? 0;
    ca.competitorsFromWebSearch = ca.competitorsFromWebSearch ?? 0;
    ca.competitorMentionedInDeck = Array.isArray(ca.competitorMentionedInDeck) ? ca.competitorMentionedInDeck : [];
    ca.hiddenCompetitors = Array.isArray(ca.hiddenCompetitors) ? ca.hiddenCompetitors : [];
    ca.marketPosition = ca.marketPosition || "Non evalue";
  }

  // Ensure unitEconomics exists with all required fields
  if (!obj.unitEconomics || typeof obj.unitEconomics !== "object") {
    obj.unitEconomics = {
      relevantFormulas: [],
      overallHealthScore: 0,
      verdict: "Donnees insuffisantes pour evaluer",
      dataGaps: ["Unit economics non evaluees"],
    };
  } else {
    const ue = obj.unitEconomics as Record<string, unknown>;
    ue.relevantFormulas = Array.isArray(ue.relevantFormulas) ? ue.relevantFormulas : [];
    ue.overallHealthScore = ue.overallHealthScore ?? 0;
    ue.verdict = ue.verdict || "Non evalue";
    ue.dataGaps = Array.isArray(ue.dataGaps) ? ue.dataGaps : [];
  }

  // Ensure sectorDynamics exists with all required fields
  const validMaturity = ["nascent", "emerging", "growing", "mature", "declining"];
  const validCompetition = ["low", "moderate", "high", "intense"];
  const validBarrier = ["low", "medium", "high", "very_high"];
  const validConsolidation = ["fragmenting", "stable", "consolidating", "winner_take_all"];
  const validThreatLevel = ["none", "low", "medium", "high", "critical"];
  const validRegLevel = ["low", "medium", "high", "very_high"];

  if (!obj.sectorDynamics || typeof obj.sectorDynamics !== "object") {
    obj.sectorDynamics = {
      maturity: "emerging",
      competitionIntensity: "moderate",
      barrierToEntry: "medium",
      consolidationTrend: "stable",
      bigTechThreat: { level: "low", players: [], rationale: "Non evalue" },
      regulatoryRisk: { level: "medium", keyRegulations: [], upcomingChanges: [] },
    };
  } else {
    const sd = obj.sectorDynamics as Record<string, unknown>;
    // Validate enum values with fallbacks
    sd.maturity = validMaturity.includes(sd.maturity as string) ? sd.maturity : "emerging";
    sd.competitionIntensity = validCompetition.includes(sd.competitionIntensity as string) ? sd.competitionIntensity : "moderate";
    sd.barrierToEntry = validBarrier.includes(sd.barrierToEntry as string) ? sd.barrierToEntry : "medium";
    sd.consolidationTrend = validConsolidation.includes(sd.consolidationTrend as string) ? sd.consolidationTrend : "stable";
    if (!sd.bigTechThreat || typeof sd.bigTechThreat !== "object") {
      sd.bigTechThreat = { level: "low", players: [], rationale: "Non evalue" };
    } else {
      const bt = sd.bigTechThreat as Record<string, unknown>;
      bt.level = validThreatLevel.includes(bt.level as string) ? bt.level : "low";
      bt.players = Array.isArray(bt.players) ? bt.players : [];
      bt.rationale = bt.rationale || "Non evalue";
    }
    if (!sd.regulatoryRisk || typeof sd.regulatoryRisk !== "object") {
      sd.regulatoryRisk = { level: "medium", keyRegulations: [], upcomingChanges: [] };
    } else {
      const rr = sd.regulatoryRisk as Record<string, unknown>;
      rr.level = validRegLevel.includes(rr.level as string) ? rr.level : "medium";
      rr.keyRegulations = Array.isArray(rr.keyRegulations) ? rr.keyRegulations : [];
      rr.upcomingChanges = Array.isArray(rr.upcomingChanges) ? rr.upcomingChanges : [];
    }
  }

  // Ensure exitLandscape exists with all required fields
  const validExitAssessment = ["strong", "moderate", "weak", "uncertain"];
  if (!obj.exitLandscape || typeof obj.exitLandscape !== "object") {
    obj.exitLandscape = {
      recentExits: [],
      typicalAcquirers: [],
      medianMultiple: null,
      multipleSource: null,
      timeToExitYears: "5-7 ans",
      exitPotentialAssessment: "uncertain",
    };
  } else {
    const el = obj.exitLandscape as Record<string, unknown>;
    // Normalize recentExits - ensure each item has required fields
    const rawExits = Array.isArray(el.recentExits) ? el.recentExits : [];
    el.recentExits = rawExits.map((exit: unknown) => {
      if (!exit || typeof exit !== "object") return { company: "Unknown", acquirer: "Unknown" };
      const e = exit as Record<string, unknown>;
      return {
        company: e.company || "Unknown",
        acquirer: e.acquirer || "Unknown",
        multiple: e.multiple ?? null,
        year: typeof e.year === "number" ? e.year : null,
        source: e.source || "web search",
      };
    });
    el.typicalAcquirers = Array.isArray(el.typicalAcquirers) ? el.typicalAcquirers : [];
    el.medianMultiple = el.medianMultiple ?? null;
    el.multipleSource = el.multipleSource ?? null;
    el.timeToExitYears = el.timeToExitYears || "5-7 ans";
    el.exitPotentialAssessment = validExitAssessment.includes(el.exitPotentialAssessment as string)
      ? el.exitPotentialAssessment
      : "uncertain";
  }

  // Ensure valuationAnalysis exists with all required fields
  if (!obj.valuationAnalysis || typeof obj.valuationAnalysis !== "object") {
    obj.valuationAnalysis = {
      askMultiple: null,
      multipleType: "Revenue",
      sectorMedianMultiple: null,
      sectorMedianSource: null,
      percentilePosition: null,
      verdict: "cannot_assess",
      negotiationLeverage: [],
    };
  } else {
    const va = obj.valuationAnalysis as Record<string, unknown>;
    va.askMultiple = va.askMultiple ?? null;
    va.multipleType = va.multipleType || "Revenue";
    va.sectorMedianMultiple = va.sectorMedianMultiple ?? null;
    va.sectorMedianSource = va.sectorMedianSource ?? null;
    va.percentilePosition = va.percentilePosition ?? null;
    va.verdict = va.verdict || "cannot_assess";
    va.negotiationLeverage = Array.isArray(va.negotiationLeverage) ? va.negotiationLeverage : [];
  }

  // Ensure sectorQuestions is an array
  if (!Array.isArray(obj.sectorQuestions)) {
    obj.sectorQuestions = [];
  }

  // Ensure sectorScore exists
  obj.sectorScore = obj.sectorScore ?? 50;

  // Ensure scoreBreakdown exists with all required fields
  if (!obj.scoreBreakdown || typeof obj.scoreBreakdown !== "object") {
    obj.scoreBreakdown = {
      metrics: { score: 50, weight: 25, rationale: "Non evalue" },
      unitEconomics: { score: 50, weight: 25, rationale: "Non evalue" },
      competitive: { score: 50, weight: 20, rationale: "Non evalue" },
      timing: { score: 50, weight: 15, rationale: "Non evalue" },
      team: { score: 50, weight: 15, rationale: "Non evalue" },
    };
  }

  // Ensure analysisConfidence exists with all required fields
  if (!obj.analysisConfidence || typeof obj.analysisConfidence !== "object") {
    obj.analysisConfidence = {
      level: "low",
      rationale: "Donnees insuffisantes pour une analyse complete",
      dataGaps: ["Analyse incomplete"],
      recommendedActions: ["Collecter plus de donnees"],
    };
  } else {
    const ac = obj.analysisConfidence as Record<string, unknown>;
    ac.level = ac.level || "low";
    ac.rationale = ac.rationale || "Non specifie";
    ac.dataGaps = Array.isArray(ac.dataGaps) ? ac.dataGaps : [];
    ac.recommendedActions = Array.isArray(ac.recommendedActions) ? ac.recommendedActions : [];
  }

  // Ensure executiveSummary exists
  obj.executiveSummary = obj.executiveSummary || "Analyse sectorielle incomplete. Donnees insuffisantes pour produire un resume executif complet.";

  // Ensure investmentImplication exists
  obj.investmentImplication = obj.investmentImplication || "insufficient_data";

  return obj;
}

// ============================================================================
// HELPER: Transform output to SectorExpertData
// ============================================================================

function transformOutput(raw: GeneralExpertOutput): SectorExpertData {
  return {
    sectorName: raw.sectorResearch.identifiedSector,
    sectorMaturity: raw.sectorDynamics.maturity === "nascent" ? "emerging" :
                    raw.sectorDynamics.maturity === "declining" ? "declining" :
                    raw.sectorDynamics.maturity as "emerging" | "growing" | "mature" | "declining",

    keyMetrics: raw.keyMetrics.map(m => ({
      metricName: m.metricName,
      value: m.dealValue,
      sectorBenchmark: m.benchmark ? {
        p25: typeof m.benchmark.value === "number" ? m.benchmark.value * 0.75 : 0,
        median: typeof m.benchmark.value === "number" ? m.benchmark.value : 0,
        p75: typeof m.benchmark.value === "number" ? m.benchmark.value * 1.25 : 0,
        topDecile: typeof m.benchmark.value === "number" ? m.benchmark.value * 1.5 : 0,
      } : { p25: 0, median: 0, p75: 0, topDecile: 0 },
      // Map assessment to valid SectorExpertData values
      assessment: (m.assessment === "cannot_assess" || m.assessment === "critical")
        ? "concerning" as const
        : m.assessment,
      sectorContext: m.insight,
    })),

    sectorRedFlags: raw.redFlags.map(rf => ({
      flag: rf.flag,
      severity: rf.severity,
      sectorReason: `${rf.sectorContext}. Evidence: ${rf.evidence}. Impact: ${rf.impact}. Question: ${rf.questionToAsk}`,
    })),

    sectorOpportunities: raw.greenFlags.map(gf => ({
      opportunity: gf.flag,
      potential: gf.strength === "strong" ? "high" as const : "medium" as const,
      reasoning: `${gf.sectorContext}. ${gf.implication}`,
    })),

    regulatoryEnvironment: {
      complexity: raw.sectorDynamics.regulatoryRisk.level === "very_high" ? "very_high" :
                  raw.sectorDynamics.regulatoryRisk.level as "low" | "medium" | "high" | "very_high",
      keyRegulations: raw.sectorDynamics.regulatoryRisk.keyRegulations,
      complianceRisks: raw.sectorDynamics.regulatoryRisk.upcomingChanges,
      upcomingChanges: raw.sectorDynamics.regulatoryRisk.upcomingChanges,
    },

    sectorDynamics: {
      competitionIntensity: raw.sectorDynamics.competitionIntensity === "intense" ? "high" :
                            raw.sectorDynamics.competitionIntensity as "low" | "medium" | "high",
      consolidationTrend: raw.sectorDynamics.consolidationTrend === "winner_take_all" ? "consolidating" :
                          raw.sectorDynamics.consolidationTrend as "fragmenting" | "stable" | "consolidating",
      barrierToEntry: raw.sectorDynamics.barrierToEntry === "very_high" ? "high" :
                      raw.sectorDynamics.barrierToEntry as "low" | "medium" | "high",
      typicalExitMultiple: typeof raw.exitLandscape.medianMultiple === "number" ?
                           raw.exitLandscape.medianMultiple : 0,
      recentExits: raw.exitLandscape.recentExits.map(e =>
        `${e.company} → ${e.acquirer} (${e.multiple}x, ${e.year})`
      ),
    },

    sectorQuestions: raw.sectorQuestions.map(q => ({
      question: q.question,
      category: q.category === "business_model" || q.category === "metrics" ? "business" as const :
                q.category === "technology" ? "technical" as const :
                q.category === "regulation" ? "regulatory" as const : "competitive" as const,
      priority: q.priority,
      expectedAnswer: q.greenFlagAnswer,
      redFlagAnswer: q.redFlagAnswer,
    })),

    sectorFit: {
      score: raw.sectorScore,
      strengths: raw.greenFlags.map(gf => gf.flag),
      weaknesses: raw.redFlags.map(rf => rf.flag),
      sectorTiming: raw.sectorDynamics.maturity === "nascent" ? "early" :
                    raw.sectorDynamics.maturity === "declining" ? "late" : "optimal",
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
    sectorName: "Secteur Non Identifie",
    sectorMaturity: "growing",
    keyMetrics: [],
    sectorRedFlags: [{
      flag: "Analyse incomplete",
      severity: "major",
      sectorReason: "L'analyse sectorielle generaliste n'a pas pu etre completee. Donnees insuffisantes ou erreur d'execution.",
    }],
    sectorOpportunities: [],
    regulatoryEnvironment: {
      complexity: "medium",
      keyRegulations: [],
      complianceRisks: ["Analyse incomplete - environnement reglementaire non evalue"],
      upcomingChanges: [],
    },
    sectorDynamics: {
      competitionIntensity: "medium",
      consolidationTrend: "stable",
      barrierToEntry: "medium",
      typicalExitMultiple: 0,
      recentExits: [],
    },
    sectorQuestions: [{
      question: "Pouvez-vous decrire votre secteur et les metriques cles que vous suivez?",
      category: "business",
      priority: "must_ask",
      expectedAnswer: "Description claire avec metriques specifiques et benchmarks",
      redFlagAnswer: "Incapacite a definir le secteur ou metriques generiques non pertinentes",
    }],
    sectorFit: {
      score: 0,
      strengths: [],
      weaknesses: ["Analyse incomplete"],
      sectorTiming: "optimal",
    },
    sectorScore: 0,
    executiveSummary: "L'analyse sectorielle generaliste n'a pas pu etre completee. Les donnees fournies sont insuffisantes ou une erreur s'est produite. Une analyse manuelle approfondie est recommandee.",
  };
}

// ============================================================================
// GENERAL EXPERT AGENT
// ============================================================================

export const generalExpert = {
  name: "general-expert" as const,

  async run(context: EnrichedAgentContext): Promise<SectorExpertResult> {
    const startTime = Date.now();

    try {
      const systemPromptText = buildSystemPrompt();
      const userPromptText = buildUserPrompt(context);

      setAgentContext("general-expert");

      const response = await complete(userPromptText, {
        systemPrompt: systemPromptText,
        complexity: "complex",
        temperature: 0.3,
      });

      // Parse and validate response
      let parsedOutput: GeneralExpertOutput;
      try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("No JSON found in response");
        }
        const rawJson = JSON.parse(jsonMatch[0]);
        const normalizedJson = normalizeOutput(rawJson);
        const parseResult = GeneralOutputSchema.safeParse(normalizedJson);
        if (parseResult.success) {
          parsedOutput = parseResult.data;
        } else {
          console.warn(`[general-expert] Strict parse failed (${parseResult.error.issues.length} issues), using raw JSON with defaults`);
          parsedOutput = normalizedJson as GeneralExpertOutput;
        }
      } catch (parseError) {
        console.error("[general-expert] Parse error:", parseError);
        return {
          agentName: "general-expert" as unknown as import("./types").SectorExpertType,
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
      const availableMetrics = (parsedOutput.keyMetrics ?? []).filter((m: { dealValue: unknown }) => m.dealValue !== null).length;
      const totalMetrics = (parsedOutput.keyMetrics ?? []).length;
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
        agentName: "general-expert" as unknown as import("./types").SectorExpertType,
        success: true,
        executionTimeMs: Date.now() - startTime,
        cost: response.cost ?? 0,
        data: sectorData,
        // Include extended data for detailed display
        _extended: {
          subSector: {
            primary: parsedOutput.sectorResearch.subSector,
            secondary: parsedOutput.sectorResearch.adjacentSectors,
            rationale: parsedOutput.sectorResearch.sectorRationale,
          },
          // Unit economics summary
          unitEconomics: {
            overallAssessment: parsedOutput.unitEconomics.verdict,
          },
          // Score breakdown
          scoreBreakdown: {
            metricsScore: parsedOutput.scoreBreakdown.metrics.score,
            justification: Object.entries(parsedOutput.scoreBreakdown)
              .map(([k, v]) => `${k}: ${v.score}/100 (${v.rationale})`)
              .join("; "),
          },
          // Valuation analysis
          valuationAnalysis: {
            askMultiple: parsedOutput.valuationAnalysis.askMultiple ?? 0,
            medianSectorMultiple: typeof parsedOutput.valuationAnalysis.sectorMedianMultiple === "number" ?
                                   parsedOutput.valuationAnalysis.sectorMedianMultiple : 0,
            percentilePosition: typeof parsedOutput.valuationAnalysis.percentilePosition === "number" ?
                                parsedOutput.valuationAnalysis.percentilePosition : 0,
            justifiedRange: { low: 0, fair: 0, high: 0 },
            verdict: parsedOutput.valuationAnalysis.verdict === "cannot_assess" ? "fair" :
                     parsedOutput.valuationAnalysis.verdict,
            negotiationLeverage: parsedOutput.valuationAnalysis.negotiationLeverage.join("; "),
          },
          // Exit potential
          exitPotential: {
            typicalMultiple: typeof parsedOutput.exitLandscape.medianMultiple === "number" ?
                             parsedOutput.exitLandscape.medianMultiple : 0,
            likelyAcquirers: parsedOutput.exitLandscape.typicalAcquirers,
            timeToExit: parsedOutput.exitLandscape.timeToExitYears,
            exitReadiness: parsedOutput.exitLandscape.exitPotentialAssessment === "strong" ? "ready" :
                           parsedOutput.exitLandscape.exitPotentialAssessment === "weak" ? "far" : "needs_work",
          },
          // Verdict
          verdict: {
            recommendation: parsedOutput.investmentImplication === "strong_sector_fit" ? "STRONG_FIT" :
                            parsedOutput.investmentImplication === "solid_with_concerns" ? "GOOD_FIT" :
                            parsedOutput.investmentImplication === "sector_challenges" ? "MODERATE_FIT" :
                            parsedOutput.investmentImplication === "insufficient_data" ? "MODERATE_FIT" : "POOR_FIT",
            confidence: parsedOutput.analysisConfidence.level,
            keyInsight: parsedOutput.executiveSummary,
            topConcern: parsedOutput.redFlags[0]?.flag ?? "Aucun red flag majeur identifie",
            topStrength: parsedOutput.greenFlags[0]?.flag ?? "Aucun green flag majeur identifie",
          },
          // DB comparison
          dbComparison: {
            similarDealsFound: parsedOutput.competitiveAnalysis.competitorsFromDb,
            thisDealsPosition: parsedOutput.competitiveAnalysis.marketPosition,
          },
        },
      };

    } catch (error) {
      console.error("[general-expert] Execution error:", error);
      return {
        agentName: "general-expert" as unknown as import("./types").SectorExpertType,
        success: false,
        executionTimeMs: Date.now() - startTime,
        cost: 0,
        error: error instanceof Error ? error.message : "Unknown error",
        data: getDefaultData(),
      };
    }
  },
};
