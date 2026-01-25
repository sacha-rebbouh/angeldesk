/**
 * Deck Forensics Agent - ReAct Version
 *
 * Production-grade implementation using ReAct pattern for:
 * - BA-focused forensic analysis (NOT deck improvement suggestions)
 * - Claim verification with evidence
 * - Red flag detection for investment decisions
 */

import { z } from "zod";
import type { ScoredFinding } from "@/scoring";
import type { EnrichedAgentContext, DeckForensicsData, DeckForensicsResult } from "../../types";
import { createReActEngine, type ReActPrompts, type ReActOutput } from "../index";
import { registerBuiltInTools } from "../tools/built-in";

// Ensure built-in tools are registered
registerBuiltInTools();

// Output schema for Zod validation - matches new BA-focused DeckForensicsData
const DeckForensicsOutputSchema = z.object({
  narrativeAnalysis: z.object({
    storyCoherence: z.number().min(0).max(100),
    credibilityAssessment: z.string(),
    narrativeStrengths: z.array(z.string()),
    narrativeWeaknesses: z.array(z.string()),
    missingPieces: z.array(z.string()),
  }),
  claimVerification: z.array(
    z.object({
      category: z.enum(["team", "market", "traction", "financials", "tech", "timing", "competition"]),
      claim: z.string(),
      location: z.string(),
      status: z.enum(["verified", "unverified", "contradicted", "exaggerated"]),
      evidence: z.string(),
      sourceUsed: z.string(),
      investorConcern: z.string(),
    })
  ),
  inconsistencies: z.array(
    z.object({
      issue: z.string(),
      location1: z.string(),
      location2: z.string(),
      quote1: z.string(),
      quote2: z.string(),
      severity: z.enum(["critical", "major", "minor"]),
      investorImplication: z.string(),
    })
  ),
  redFlags: z.array(
    z.object({
      category: z.enum(["credibility", "financials", "team", "market", "legal", "execution"]),
      flag: z.string(),
      location: z.string(),
      quote: z.string().optional(),
      externalData: z.string().optional(),
      severity: z.enum(["critical", "high", "medium"]),
      investorConcern: z.string(),
    })
  ),
  questionsForFounder: z.array(
    z.object({
      category: z.enum(["story_gaps", "claims", "omissions", "contradictions", "verification"]),
      question: z.string(),
      context: z.string(),
      expectedAnswer: z.string().optional(),
      redFlagIfNo: z.string().optional(),
    })
  ),
  overallAssessment: z.object({
    credibilityScore: z.number().min(0).max(100),
    summary: z.string(),
    trustLevel: z.enum(["high", "moderate", "low", "very_low"]),
    keyTakeaways: z.array(z.string()),
  }),
});

type DeckForensicsOutput = z.infer<typeof DeckForensicsOutputSchema>;

/**
 * Build ReAct prompts for Deck Forensics
 */
function buildPrompts(
  context: EnrichedAgentContext,
  extractedInfo: Record<string, unknown> | null
): ReActPrompts {
  const deal = context.deal;
  const documents = context.documents ?? [];

  // Get pitch deck content
  const pitchDeckDoc = documents.find(
    (d) => d.type === "PITCH_DECK" && d.extractedText
  );

  return {
    system: `Tu es un analyste forensique de pitch decks avec 20+ ans d'experience VC.

TON ROLE: Produire une analyse EXHAUSTIVE pour aider un Business Angel a evaluer ce deal.
Tu dois etre METHODIQUE et COMPLET - pas de survol superficiel.

IMPORTANT: Tu analyses pour un INVESTISSEUR qui doit decider d'investir ou non.
PAS de conseils pour ameliorer le deck - uniquement de l'investigation.

═══════════════════════════════════════════════════════════════
TOOLS DISPONIBLES - UTILISE-LES SYSTEMATIQUEMENT
═══════════════════════════════════════════════════════════════

1. **webSearch** - CRITIQUE pour verifier les claims:

   POUR LES FONDATEURS - FORMAT OPTIMAL:
   - BONNE requête: webSearch("Prénom Nom NomEntreprise") → ex: "Sacha Rebbouh Antiopea"
   - Inclure le nom de l'entreprise pour éviter les homonymes
   - NE PAS ajouter: "LinkedIn CEO COO founder experience background"
   - Le nom + entreprise suffit pour trouver le bon profil LinkedIn

   POUR LES CLAIMS MARCHE:
   - webSearch("cybersecurity market size 2024 Gartner")
   - webSearch("blockchain market TAM Europe 2024")

   POUR LES CONCURRENTS/PARTENAIRES:
   - webSearch("NomEntreprise startup funding")

2. **searchBenchmarks** - Pour les metriques:
   - ARR Growth, NRR, Burn Multiple, LTV/CAC par secteur/stage

3. **crossReference** - Pour comparer sources:
   - Le deck dit X, le Context Engine dit Y → contradiction?

4. **calculateMetric** - Pour les calculs:
   - LTV/CAC, Burn Multiple, Runway, etc.

═══════════════════════════════════════════════════════════════
METHODOLOGIE D'ANALYSE
═══════════════════════════════════════════════════════════════

1. CLAIMS A VERIFIER (minimum 8, couvrir TOUTES les categories):
   Pour CHAQUE claim, utilise webSearch pour verifier:
   - TEAM: webSearch("[nom fondateur] LinkedIn experience")
   - MARKET: webSearch("[secteur] market size TAM 2024")
   - TRACTION: webSearch("[nom startup] clients customers")
   - FINANCIALS: Compare aux benchmarks avec searchBenchmarks
   - TECH: webSearch("[technologie] patents [startup]")
   - TIMING: webSearch("[secteur] market trends 2024")
   - COMPETITION: webSearch("[concurrent mentionne] funding revenue")

2. RED FLAGS A CHERCHER (minimum 5):
   - Chiffres trop ronds (10M€, 50%, 100K users)
   - Projections hockey stick sans base
   - Experience team non verifiable (webSearch pour confirmer!)
   - Marche gonfle ou mal defini (webSearch pour valider TAM!)
   - Traction vague ("plusieurs clients", "croissance forte")
   - Absence totale de certaines infos critiques
   - Comparaisons flatteuses mais biaisees ("le Uber de...")
   - Claims sans source
   - Incoherences entre slides

3. INCONSISTANCES (chercher activement):
   - Slide X dit Y, mais slide Z dit le contraire
   - Chiffres qui ne s'additionnent pas
   - Timeline incoherente
   - Claims contradictoires

4. QUESTIONS POUR LE FONDATEUR (minimum 8):
   Pour chaque trou dans l'histoire, claim suspect, ou zone d'ombre:
   - Formuler une question precise
   - Expliquer pourquoi elle est importante
   - Decrire ce qu'un bon fondateur devrait repondre
   - Identifier le red flag si mauvaise reponse

═══════════════════════════════════════════════════════════════
REGLES CRITIQUES
═══════════════════════════════════════════════════════════════
- Tu DOIS utiliser webSearch pour AU MOINS 5 claims
- Tu DOIS citer les sources de tes verifications
- Une analyse sans recherche web est INACCEPTABLE
- Cite les LOCATIONS exactes (Slide X, Document Y)
- Sois SPECIFIQUE, pas generique`,

    taskDescription: `ANALYSE FORENSIQUE APPROFONDIE de ce pitch deck:

## Deal Information
- Company: ${deal.companyName ?? deal.name}
- Sector: ${deal.sector ?? "Unknown"}
- Stage: ${deal.stage ?? "Unknown"}

## Pitch Deck Content
${pitchDeckDoc?.extractedText ?? "No pitch deck text available"}

## Extracted Information
${JSON.stringify(extractedInfo, null, 2)}

## Context Engine Data Available
- Deal Intelligence: ${context.contextEngine?.dealIntelligence ? "Yes" : "No"}
- Market Data: ${context.contextEngine?.marketData ? "Yes" : "No"}
- Competitive Landscape: ${context.contextEngine?.competitiveLandscape ? "Yes" : "No"}

## Your Tasks
1. Use webSearch to verify at least 8 claims across all categories:
   - webSearch founder backgrounds, market size claims, competitor info
   - Document what you found vs what the deck claims
2. Identify at least 5 red flags with specific evidence from your searches
3. Find inconsistencies between different parts of the deck
4. Generate at least 8 questions for the founder

PROCESSUS OBLIGATOIRE POUR LES FONDATEURS:
1. Pour CHAQUE fondateur, fais une recherche avec nom + entreprise:
   - webSearch("Kevin Cohen Antiopea") → trouve son profil LinkedIn/Crunchbase
   - webSearch("Sacha Rebbouh Antiopea") → trouve son profil LinkedIn/Crunchbase
   - PAS de mots inutiles: LinkedIn, CEO, COO, founder, etc.
2. Lis les résultats pour extraire leur VRAI background (expérience, études, etc.)
3. Compare avec ce que dit le deck (ou l'absence d'info)
4. Si le profil montre "ex-Google 5 ans" mais le deck ne mentionne pas → info enrichie
5. Si le profil n'existe pas → RED FLAG potentiel

PROCESSUS POUR LES AUTRES CLAIMS:
1. Market size → webSearch("[secteur] market size 2024 Gartner")
2. Concurrents → webSearch("[nom concurrent] startup funding")
3. Partenariats → webSearch("[nom partenaire] partnership")

RAPPEL: Requêtes SIMPLES = meilleurs résultats. Une recherche avec trop de mots-clés RATE les résultats.`,

    availableTools: "",

    outputSchema: `{
  "narrativeAnalysis": {
    "storyCoherence": 0-100,
    "credibilityAssessment": "Evaluation DETAILLEE en 4-5 phrases",
    "narrativeStrengths": ["Points forts SPECIFIQUES avec references"],
    "narrativeWeaknesses": ["Faiblesses SPECIFIQUES avec references"],
    "missingPieces": ["Info CRITIQUE absente - etre precis"]
  },
  "claimVerification": [{
    "category": "team|market|traction|financials|tech|timing|competition",
    "claim": "Citation EXACTE du deck",
    "location": "Slide X ou Document Y",
    "status": "verified|unverified|contradicted|exaggerated",
    "evidence": "POURQUOI ce status - etre precis",
    "sourceUsed": "Context Engine, Statista, calcul, etc.",
    "investorConcern": "Impact sur la decision d'investissement"
  }],
  "inconsistencies": [{
    "issue": "Description PRECISE de l'inconsistance",
    "location1": "Slide X",
    "location2": "Slide Y",
    "quote1": "Citation EXACTE 1",
    "quote2": "Citation EXACTE 2 (contradictoire)",
    "severity": "critical|major|minor",
    "investorImplication": "Ce que ca signifie pour le BA"
  }],
  "redFlags": [{
    "category": "credibility|financials|team|market|legal|execution",
    "flag": "Nom du red flag",
    "location": "Slide X",
    "quote": "Citation EXACTE du deck",
    "externalData": "Donnee Context Engine qui contredit (si dispo)",
    "severity": "critical|high|medium",
    "investorConcern": "Pourquoi c'est un probleme"
  }],
  "questionsForFounder": [{
    "category": "story_gaps|claims|omissions|contradictions|verification",
    "question": "Question PRECISE a poser",
    "context": "Pourquoi cette question est critique",
    "expectedAnswer": "Ce qu'un bon fondateur devrait repondre",
    "redFlagIfNo": "Signal d'alarme si mauvaise reponse"
  }],
  "overallAssessment": {
    "credibilityScore": 0-100,
    "summary": "Resume en 5-6 phrases: verdict global pour le BA",
    "trustLevel": "high|moderate|low|very_low",
    "keyTakeaways": ["5-7 points essentiels pour la decision"]
  }
}`,

    constraints: [
      "MUST use webSearch for AT LEAST 5 different verifications (founders, market, competitors, etc.)",
      "MUST verify at least 8 claims across all categories",
      "MUST identify at least 5 red flags with evidence from webSearch",
      "MUST generate at least 8 questions for founder",
      "MUST cite the source of each verification (webSearch result, Context Engine, etc.)",
      "Inconsistencies must cite specific conflicting statements",
      "Focus on investor decision-making, NOT deck improvement",
      "Every finding must include investorConcern or investorImplication",
      "An analysis without webSearch calls is INCOMPLETE and UNACCEPTABLE",
    ],
  };
}

/**
 * Deck Forensics Agent using ReAct pattern
 */
export class DeckForensicsReAct {
  readonly name = "deck-forensics";
  readonly dependencies = ["document-extractor"];

  /**
   * Run the Deck Forensics agent with ReAct pattern
   */
  async run(context: EnrichedAgentContext): Promise<DeckForensicsResult> {
    const startTime = Date.now();

    // Get extracted info from document-extractor
    const extractedInfo = this.getExtractedInfo(context);

    // Build prompts
    const prompts = buildPrompts(context, extractedInfo);

    // Create ReAct engine
    // More iterations = more webSearch calls = better verification
    const engine = createReActEngine<DeckForensicsOutput>(
      prompts,
      DeckForensicsOutputSchema,
      {
        maxIterations: 8,  // Allow up to 8 iterations for thorough verification
        minIterations: 5,  // Force at least 5 iterations (5+ webSearch calls)
        confidenceThreshold: 85,  // Higher threshold = more thorough analysis
        enableSelfCritique: true,
        modelComplexity: "complex",
      }
    );

    // Run the engine
    const result = await engine.run(context, this.name);

    if (!result.success) {
      return {
        agentName: this.name,
        success: false,
        executionTimeMs: Date.now() - startTime,
        cost: result.cost,
        error: result.error,
        data: this.getDefaultData(),
      };
    }

    // Enrich findings with proper categories
    const enrichedFindings = this.enrichFindings(result.findings);

    return {
      agentName: this.name,
      success: true,
      executionTimeMs: Date.now() - startTime,
      cost: result.cost,
      data: result.result,
      // Extended data for production
      _react: {
        reasoningTrace: result.reasoningTrace,
        findings: enrichedFindings,
        confidence: result.confidence,
        expectedVariance: this.calculateExpectedVariance(result),
      },
    } as DeckForensicsResult & { _react: unknown };
  }

  /**
   * Get extracted info from previous document-extractor run
   */
  private getExtractedInfo(
    context: EnrichedAgentContext
  ): Record<string, unknown> | null {
    const extractionResult = context.previousResults?.["document-extractor"];
    if (extractionResult?.success && "data" in extractionResult) {
      const data = extractionResult.data as { extractedInfo?: Record<string, unknown> };
      return data.extractedInfo ?? null;
    }
    return null;
  }

  /**
   * Enrich findings with proper categories and agent name
   */
  private enrichFindings(findings: ScoredFinding[]): ScoredFinding[] {
    return findings.map((f) => ({
      ...f,
      agentName: this.name,
      category: "product" as const,
    }));
  }

  /**
   * Calculate expected variance based on confidence
   */
  private calculateExpectedVariance(result: ReActOutput<DeckForensicsOutput>): number {
    const baseVariance = 25 * (1 - result.confidence.score / 100);
    const benchmarkedRatio =
      result.findings.filter((f) => f.benchmarkData).length /
      Math.max(1, result.findings.length);
    return Math.round(baseVariance * (1 - benchmarkedRatio * 0.5) * 10) / 10;
  }

  /**
   * Get default data structure for failed runs
   */
  private getDefaultData(): DeckForensicsData {
    return {
      narrativeAnalysis: {
        storyCoherence: 0,
        credibilityAssessment: "Analysis failed",
        narrativeStrengths: [],
        narrativeWeaknesses: [],
        missingPieces: ["Analysis could not be completed"],
      },
      claimVerification: [],
      inconsistencies: [],
      redFlags: [{
        category: "credibility",
        flag: "Deck forensics could not be completed",
        location: "N/A",
        severity: "critical",
        investorConcern: "Unable to verify any claims",
      }],
      questionsForFounder: [],
      overallAssessment: {
        credibilityScore: 0,
        summary: "Analysis failed - unable to complete forensic review",
        trustLevel: "very_low",
        keyTakeaways: ["Analysis could not be completed"],
      },
    };
  }
}

// Singleton instance
export const deckForensicsReAct = new DeckForensicsReAct();
