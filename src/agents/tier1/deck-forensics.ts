import { BaseAgent } from "../base-agent";
import type { EnrichedAgentContext, DeckForensicsResult, DeckForensicsData } from "../types";

/**
 * Deck Forensics Agent
 *
 * Mission: Analyse forensique du pitch deck pour detecter les inconsistances,
 * claims exageres, et evaluer la qualite du storytelling.
 *
 * Un BA doit pouvoir faire confiance au deck - cet agent verifie cette confiance.
 */

interface LLMDeckForensicsResponse {
  narrativeAnalysis: {
    storyStrength: number;
    logicalFlow: boolean;
    emotionalAppeal: number;
    credibilitySignals: string[];
    inconsistencies: string[];
  };
  claimVerification: {
    claim: string;
    status: string;
    evidence?: string;
    confidenceScore: number;
  }[];
  presentationQuality: {
    designScore: number;
    clarityScore: number;
    professionalismScore: number;
    issues: string[];
  };
  redFlags: string[];
  overallAssessment: string;
}

export class DeckForensicsAgent extends BaseAgent<DeckForensicsData, DeckForensicsResult> {
  constructor() {
    super({
      name: "deck-forensics",
      description: "Analyse forensique du pitch deck",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 90000,
      dependencies: ["document-extractor"],
    });
  }

  protected buildSystemPrompt(): string {
    return `Tu es un expert en analyse forensique de pitch decks avec 15+ ans d'experience VC.

TON ROLE:
- Analyser la narrative et le storytelling du deck
- Verifier la coherence des claims avec les donnees
- Detecter les exagerations et inconsistances
- Evaluer la qualite et le professionnalisme

CRITERES D'ANALYSE NARRATIVE:
1. STORYTELLING
   - Problem → Solution → Traction → Team → Ask = structure classique
   - Hook fort dans les 3 premieres slides
   - Progression logique et convaincante

2. VERIFICATION DES CLAIMS
   - Chiffres de marche (TAM/SAM/SOM) verifiables?
   - Metriques de traction coherentes entre elles?
   - Claims sur la concurrence objectifs?
   - Projections financieres realistes?

3. SIGNAUX DE CREDIBILITE
   - Logos clients verifiables
   - Endorsements/quotes sourcees
   - Donnees avec sources
   - Metriques precises (vs arrondies)

4. RED FLAGS TYPIQUES
   - "Pas de concurrents" ou "Premier sur le marche"
   - TAM "bottom-up" irrealiste
   - Hockey stick sans explication
   - Chiffres qui ne matchent pas entre slides
   - Metriques vanity vs actionnable

SCORING QUALITE:
- Design: Proprete, coherence visuelle, lisibilite
- Clarte: Message clair, pas de jargon inutile
- Professionnalisme: Pas de typos, donnees sourcees, structure

OUTPUT: JSON structure uniquement.`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<DeckForensicsData> {
    const dealContext = this.formatDealContext(context);
    const contextEngineData = this.formatContextEngineData(context);
    const extractedInfo = this.getExtractedInfo(context);

    let extractedSection = "";
    if (extractedInfo) {
      extractedSection = `\n## Donnees Extraites du Deck\n${JSON.stringify(extractedInfo, null, 2)}`;
    }

    const prompt = `Realise une analyse forensique du pitch deck:

${dealContext}
${extractedSection}
${contextEngineData}

Analyse chaque aspect du deck.

Reponds en JSON avec cette structure exacte:
\`\`\`json
{
  "narrativeAnalysis": {
    "storyStrength": number (0-100, force du storytelling),
    "logicalFlow": boolean (progression logique?),
    "emotionalAppeal": number (0-100, impact emotionnel),
    "credibilitySignals": ["string (signaux positifs de credibilite)"],
    "inconsistencies": ["string (inconsistances detectees)"]
  },
  "claimVerification": [
    {
      "claim": "string (claim du deck)",
      "status": "verified|unverified|contradicted|exaggerated",
      "evidence": "string (preuve ou contradiction)",
      "confidenceScore": number (0-1)
    }
  ],
  "presentationQuality": {
    "designScore": number (0-100),
    "clarityScore": number (0-100),
    "professionalismScore": number (0-100),
    "issues": ["string (problemes identifies)"]
  },
  "redFlags": ["string (red flags du deck)"],
  "overallAssessment": "string (evaluation globale en 2-3 phrases)"
}
\`\`\`

IMPORTANT:
- Verifier chaque claim majeur vs les donnees Context Engine
- Les inconsistances doivent etre specifiques (slide X dit Y, mais Z)
- "exaggerated" = claim vrai mais amplifie
- "contradicted" = donnees externes contredisent`;

    const { data } = await this.llmCompleteJSON<LLMDeckForensicsResponse>(prompt);

    // Validate and normalize
    const validStatuses = ["verified", "unverified", "contradicted", "exaggerated"];

    const claimVerification = Array.isArray(data.claimVerification)
      ? data.claimVerification.map((c) => ({
          claim: c.claim ?? "",
          status: validStatuses.includes(c.status)
            ? (c.status as "verified" | "unverified" | "contradicted" | "exaggerated")
            : "unverified",
          evidence: c.evidence,
          confidenceScore: Math.min(1, Math.max(0, c.confidenceScore ?? 0.5)),
        }))
      : [];

    return {
      narrativeAnalysis: {
        storyStrength: Math.min(100, Math.max(0, data.narrativeAnalysis?.storyStrength ?? 50)),
        logicalFlow: data.narrativeAnalysis?.logicalFlow ?? false,
        emotionalAppeal: Math.min(100, Math.max(0, data.narrativeAnalysis?.emotionalAppeal ?? 50)),
        credibilitySignals: Array.isArray(data.narrativeAnalysis?.credibilitySignals)
          ? data.narrativeAnalysis.credibilitySignals
          : [],
        inconsistencies: Array.isArray(data.narrativeAnalysis?.inconsistencies)
          ? data.narrativeAnalysis.inconsistencies
          : [],
      },
      claimVerification,
      presentationQuality: {
        designScore: Math.min(100, Math.max(0, data.presentationQuality?.designScore ?? 50)),
        clarityScore: Math.min(100, Math.max(0, data.presentationQuality?.clarityScore ?? 50)),
        professionalismScore: Math.min(100, Math.max(0, data.presentationQuality?.professionalismScore ?? 50)),
        issues: Array.isArray(data.presentationQuality?.issues)
          ? data.presentationQuality.issues
          : [],
      },
      redFlags: Array.isArray(data.redFlags) ? data.redFlags : [],
      overallAssessment: data.overallAssessment ?? "Analyse incomplete.",
    };
  }
}

export const deckForensics = new DeckForensicsAgent();
