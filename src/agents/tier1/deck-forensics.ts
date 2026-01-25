import { BaseAgent } from "../base-agent";
import type { EnrichedAgentContext, DeckForensicsResult, DeckForensicsData } from "../types";

/**
 * Deck Forensics Agent
 *
 * Mission: Analyse forensique APPROFONDIE du pitch deck pour le BA.
 * Le BA doit avoir une vision COMPLETE de la crédibilité du deck.
 *
 * MINIMUM ATTENDU:
 * - 8+ claims vérifiés (team, market, traction, financials, tech, timing)
 * - 5+ red flags identifiés
 * - 8+ questions pour le fondateur
 * - Toutes les inconsistances détectées
 */

interface LLMDeckForensicsResponse {
  narrativeAnalysis: {
    storyCoherence: number;
    credibilityAssessment: string;
    narrativeStrengths: string[];
    narrativeWeaknesses: string[];
    missingPieces: string[];
  };
  claimVerification: {
    category: "team" | "market" | "traction" | "financials" | "tech" | "timing" | "competition";
    claim: string;
    location: string;
    status: "verified" | "unverified" | "contradicted" | "exaggerated";
    evidence: string;
    sourceUsed: string;
    investorConcern: string;
  }[];
  inconsistencies: {
    issue: string;
    location1: string;
    location2: string;
    quote1: string;
    quote2: string;
    severity: "critical" | "major" | "minor";
    investorImplication: string;
  }[];
  redFlags: {
    category: "credibility" | "financials" | "team" | "market" | "legal" | "execution";
    flag: string;
    location: string;
    quote?: string;
    externalData?: string;
    severity: "critical" | "high" | "medium";
    investorConcern: string;
  }[];
  questionsForFounder: {
    category: "story_gaps" | "claims" | "omissions" | "contradictions" | "verification";
    question: string;
    context: string;
    expectedAnswer?: string;
    redFlagIfNo?: string;
  }[];
  overallAssessment: {
    credibilityScore: number;
    summary: string;
    trustLevel: "high" | "moderate" | "low" | "very_low";
    keyTakeaways: string[];
  };
}

export class DeckForensicsAgent extends BaseAgent<DeckForensicsData, DeckForensicsResult> {
  constructor() {
    super({
      name: "deck-forensics",
      description: "Analyse forensique approfondie du pitch deck",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 120000, // Plus de temps pour une analyse approfondie
      dependencies: ["document-extractor"],
    });
  }

  protected buildSystemPrompt(): string {
    return `Tu es un analyste forensique de pitch decks avec 20+ ans d'experience VC.

TON ROLE: Produire une analyse EXHAUSTIVE pour aider un Business Angel a evaluer ce deal.
Tu dois etre METHODIQUE et COMPLET - pas de survol superficiel.

METHODOLOGIE D'ANALYSE:

1. CLAIMS A VERIFIER (minimum 8, couvrir TOUTES les categories):
   - TEAM: Experience reelle des fondateurs? Titres verifiables? Track record?
   - MARKET: Taille marche? Sources citees? Coherent avec donnees externes?
   - TRACTION: Clients? Revenue? Croissance? Preuves fournies?
   - FINANCIALS: Projections realistes? Unit economics? Burn rate?
   - TECH: Claims techniques verifiables? Brevets? Avantage reel?
   - TIMING: Pourquoi maintenant? Le marche est-il vraiment pret?
   - COMPETITION: Qui sont vraiment les concurrents? Positionnement realiste?

2. RED FLAGS A CHERCHER (minimum 5):
   - Chiffres trop ronds (10M€, 50%, 100K users)
   - Projections hockey stick sans base
   - Experience team non verifiable ou embellie
   - Marche gonfle ou mal defini
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

IMPORTANT:
- Compare SYSTEMATIQUEMENT avec les donnees du Context Engine
- Cite les LOCATIONS exactes (Slide X, Document Y)
- Sois SPECIFIQUE, pas generique
- Une analyse superficielle est INACCEPTABLE`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<DeckForensicsData> {
    const dealContext = this.formatDealContext(context);
    const contextEngineData = this.formatContextEngineData(context);
    const extractedInfo = this.getExtractedInfo(context);

    let extractedSection = "";
    if (extractedInfo) {
      extractedSection = `\n## Donnees Extraites du Deck\n${JSON.stringify(extractedInfo, null, 2)}`;
    }

    const prompt = `ANALYSE FORENSIQUE APPROFONDIE de ce pitch deck:

${dealContext}
${extractedSection}
${contextEngineData}

INSTRUCTIONS CRITIQUES:
1. Tu DOIS verifier au minimum 8 claims (couvrir team, market, traction, financials, tech)
2. Tu DOIS identifier au minimum 5 red flags
3. Tu DOIS generer au minimum 8 questions pour le fondateur
4. Tu DOIS cross-referencer avec les donnees du Context Engine
5. Chaque element DOIT avoir une location precise (Slide X, Document Y)

Reponds en JSON:
\`\`\`json
{
  "narrativeAnalysis": {
    "storyCoherence": number (0-100),
    "credibilityAssessment": "Evaluation DETAILLEE en 4-5 phrases",
    "narrativeStrengths": ["Points forts SPECIFIQUES avec references"],
    "narrativeWeaknesses": ["Faiblesses SPECIFIQUES avec references"],
    "missingPieces": ["Info CRITIQUE absente - etre precis"]
  },
  "claimVerification": [
    {
      "category": "team|market|traction|financials|tech|timing|competition",
      "claim": "Citation EXACTE du deck",
      "location": "Slide X ou Document Y",
      "status": "verified|unverified|contradicted|exaggerated",
      "evidence": "POURQUOI ce status - etre precis",
      "sourceUsed": "Context Engine, Statista, calcul, etc.",
      "investorConcern": "Impact sur la decision d'investissement"
    }
  ],
  "inconsistencies": [
    {
      "issue": "Description PRECISE de l'inconsistance",
      "location1": "Slide X",
      "location2": "Slide Y",
      "quote1": "Citation EXACTE 1",
      "quote2": "Citation EXACTE 2 (contradictoire)",
      "severity": "critical|major|minor",
      "investorImplication": "Ce que ca signifie pour le BA"
    }
  ],
  "redFlags": [
    {
      "category": "credibility|financials|team|market|legal|execution",
      "flag": "Nom du red flag",
      "location": "Slide X",
      "quote": "Citation EXACTE du deck",
      "externalData": "Donnee Context Engine qui contredit (si dispo)",
      "severity": "critical|high|medium",
      "investorConcern": "Pourquoi c'est un probleme"
    }
  ],
  "questionsForFounder": [
    {
      "category": "story_gaps|claims|omissions|contradictions|verification",
      "question": "Question PRECISE a poser",
      "context": "Pourquoi cette question est critique",
      "expectedAnswer": "Ce qu'un bon fondateur devrait repondre",
      "redFlagIfNo": "Signal d'alarme si mauvaise reponse"
    }
  ],
  "overallAssessment": {
    "credibilityScore": number (0-100),
    "summary": "Resume en 5-6 phrases: verdict global pour le BA",
    "trustLevel": "high|moderate|low|very_low",
    "keyTakeaways": ["5-7 points essentiels pour la decision"]
  }
}
\`\`\`

RAPPEL: Une analyse avec moins de 8 claims, 5 red flags, ou 8 questions est INCOMPLETE.`;

    const { data } = await this.llmCompleteJSON<LLMDeckForensicsResponse>(prompt);

    // Validate and normalize
    const validStatuses = ["verified", "unverified", "contradicted", "exaggerated"];
    const validSeverities = ["critical", "high", "medium"];
    const validInconsistencySeverities = ["critical", "major", "minor"];
    const validClaimCategories = ["team", "market", "traction", "financials", "tech", "timing", "competition"];
    const validRedFlagCategories = ["credibility", "financials", "team", "market", "legal", "execution"];
    const validQuestionCategories = ["story_gaps", "claims", "omissions", "contradictions", "verification"];

    const claimVerification = Array.isArray(data.claimVerification)
      ? data.claimVerification.map((c) => ({
          category: validClaimCategories.includes(c.category) ? c.category : "market",
          claim: c.claim ?? "",
          location: c.location ?? "Non specifie",
          status: validStatuses.includes(c.status)
            ? (c.status as "verified" | "unverified" | "contradicted" | "exaggerated")
            : "unverified",
          evidence: c.evidence ?? "",
          sourceUsed: c.sourceUsed ?? "Non specifie",
          investorConcern: c.investorConcern ?? "",
        }))
      : [];

    const inconsistencies = Array.isArray(data.inconsistencies)
      ? data.inconsistencies.map((inc) => ({
          issue: inc.issue ?? "",
          location1: inc.location1 ?? "Non specifie",
          location2: inc.location2 ?? "Non specifie",
          quote1: inc.quote1 ?? "",
          quote2: inc.quote2 ?? "",
          severity: validInconsistencySeverities.includes(inc.severity)
            ? (inc.severity as "critical" | "major" | "minor")
            : "minor",
          investorImplication: inc.investorImplication ?? "",
        }))
      : [];

    const redFlags = Array.isArray(data.redFlags)
      ? data.redFlags.map((rf) => ({
          category: validRedFlagCategories.includes(rf.category) ? rf.category : "credibility",
          flag: rf.flag ?? "",
          location: rf.location ?? "Non specifie",
          quote: rf.quote,
          externalData: rf.externalData,
          severity: validSeverities.includes(rf.severity)
            ? (rf.severity as "critical" | "high" | "medium")
            : "medium",
          investorConcern: rf.investorConcern ?? "",
        }))
      : [];

    const questionsForFounder = Array.isArray(data.questionsForFounder)
      ? data.questionsForFounder.map((q) => ({
          category: validQuestionCategories.includes(q.category) ? q.category : "claims",
          question: q.question ?? "",
          context: q.context ?? "",
          expectedAnswer: q.expectedAnswer,
          redFlagIfNo: q.redFlagIfNo,
        }))
      : [];

    const validTrustLevels = ["high", "moderate", "low", "very_low"];
    const trustLevel = validTrustLevels.includes(data.overallAssessment?.trustLevel ?? "")
      ? (data.overallAssessment.trustLevel as "high" | "moderate" | "low" | "very_low")
      : "moderate";

    return {
      narrativeAnalysis: {
        storyCoherence: Math.min(100, Math.max(0, data.narrativeAnalysis?.storyCoherence ?? 50)),
        credibilityAssessment: data.narrativeAnalysis?.credibilityAssessment ?? "",
        narrativeStrengths: Array.isArray(data.narrativeAnalysis?.narrativeStrengths)
          ? data.narrativeAnalysis.narrativeStrengths
          : [],
        narrativeWeaknesses: Array.isArray(data.narrativeAnalysis?.narrativeWeaknesses)
          ? data.narrativeAnalysis.narrativeWeaknesses
          : [],
        missingPieces: Array.isArray(data.narrativeAnalysis?.missingPieces)
          ? data.narrativeAnalysis.missingPieces
          : [],
      },
      claimVerification,
      inconsistencies,
      redFlags,
      questionsForFounder,
      overallAssessment: {
        credibilityScore: Math.min(100, Math.max(0, data.overallAssessment?.credibilityScore ?? 50)),
        summary: data.overallAssessment?.summary ?? "",
        trustLevel,
        keyTakeaways: Array.isArray(data.overallAssessment?.keyTakeaways)
          ? data.overallAssessment.keyTakeaways
          : [],
      },
    };
  }
}

export const deckForensics = new DeckForensicsAgent();
