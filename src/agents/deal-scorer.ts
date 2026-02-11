import { BaseAgent } from "./base-agent";
import type { AgentContext, ScoringResult, DealScores, ScoreBreakdown } from "./types";

interface ScoringData {
  scores: DealScores;
  breakdown: ScoreBreakdown[];
  percentileRanking?: {
    overall: number;
    bySector: number;
    byStage: number;
  };
  comparableDeals?: {
    name: string;
    score: number;
    outcome?: string;
  }[];
}

export class DealScorerAgent extends BaseAgent<ScoringData, ScoringResult> {
  constructor() {
    super({
      name: "deal-scorer",
      description: "Scores a deal across multiple dimensions",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 60000,
      dependencies: ["document-extractor"], // Run after extraction
    });
  }

  protected buildSystemPrompt(): string {
    return `Tu es un analyste VC senior specialise dans l'evaluation de startups early-stage.

TON ROLE:
- Scorer un deal sur plusieurs dimensions (0-100)
- Justifier chaque score avec des facteurs specifiques
- Pas de probabilites de succes - uniquement des scores multi-dimensionnels

DIMENSIONS DE SCORING:
1. TEAM (25% du global)
   - Experience entrepreneuriale
   - Expertise domaine
   - Complementarite
   - Track record
   - Skin in the game

2. MARKET (20% du global)
   - Taille (TAM/SAM/SOM)
   - Croissance du marche
   - Timing
   - Dynamique competitive

3. PRODUCT (20% du global)
   - Differentiation
   - Moat/defensibilite
   - Product-market fit signals
   - Tech risk

4. FINANCIALS (20% du global)
   - Metriques actuelles (ARR, growth, unit economics)
   - Valorisation vs comparables
   - Utilisation des fonds
   - Path to profitability

5. TIMING (15% du global)
   - Maturite du marche
   - Tendances macro
   - Momentum de la startup

SCORING GUIDE:
- 80-100: Exceptionnel, top 5% des deals
- 60-79: Solide, above average
- 40-59: Moyen, des concerns mais potentiel
- 20-39: Faible, red flags majeurs
- 0-19: Dealbreaker, ne pas investir

REGLES:
- Chaque score doit etre justifie par des facteurs concrets
- Le score global = moyenne ponderee (pas une moyenne simple)
- Sois critique mais juste - pas de complaisance

OUTPUT: JSON structure uniquement.`;
  }

  protected async execute(context: AgentContext): Promise<ScoringData> {
    const dealContext = this.formatDealContext(context);

    // Check for previous extraction results
    const extractionResult = context.previousResults?.["document-extractor"];
    let extractedInfo = "";
    if (extractionResult?.success && "data" in extractionResult) {
      const data = extractionResult.data as { extractedInfo?: Record<string, unknown> };
      if (data.extractedInfo) {
        extractedInfo = `\n## Informations Extraites des Documents\n${JSON.stringify(data.extractedInfo, null, 2)}`;
      }
    }

    const prompt = `Evalue ce deal et attribue des scores:

${dealContext}
${extractedInfo}

Reponds en JSON avec cette structure exacte:
\`\`\`json
{
  "scores": {
    "global": number (0-100),
    "team": number (0-100),
    "market": number (0-100),
    "product": number (0-100),
    "financials": number (0-100),
    "timing": number (0-100)
  },
  "breakdown": [
    {
      "dimension": "team|market|product|financials|timing",
      "score": number,
      "maxScore": 100,
      "factors": [
        {
          "name": "string (nom du facteur)",
          "score": number (0-20),
          "maxScore": 20,
          "rationale": "string (justification en 1 phrase)"
        }
      ]
    }
  ],
  "percentileRanking": {
    "overall": number (0-100, estimation du percentile),
    "bySector": number (0-100),
    "byStage": number (0-100)
  },
  "comparableDeals": [
    {
      "name": "string (deal similaire connu)",
      "score": number,
      "outcome": "string (resultat si connu)"
    }
  ]
}
\`\`\`

IMPORTANT:
- global = (team*0.25 + market*0.20 + product*0.20 + financials*0.20 + timing*0.15)
- Chaque dimension doit avoir 3-5 facteurs
- Percentile = ou ce deal se situe vs tous les deals que tu as vus
- Comparables = deals similaires (secteur/stade) pour reference`;

    const { data } = await this.llmCompleteJSON<ScoringData>(prompt);

    // Validate and normalize scores
    const normalizeScore = (s: number | undefined): number =>
      s != null ? Math.min(100, Math.max(0, Math.round(s))) : 0;

    const scores: DealScores = {
      global: normalizeScore(data.scores?.global),
      team: normalizeScore(data.scores?.team),
      market: normalizeScore(data.scores?.market),
      product: normalizeScore(data.scores?.product),
      financials: normalizeScore(data.scores?.financials),
      timing: normalizeScore(data.scores?.timing),
    };

    // Recalculate global to ensure consistency
    scores.global = Math.round(
      scores.team * 0.25 +
      scores.market * 0.20 +
      scores.product * 0.20 +
      scores.financials * 0.20 +
      scores.timing * 0.15
    );

    return {
      scores,
      breakdown: Array.isArray(data.breakdown) ? data.breakdown : [],
      percentileRanking: data.percentileRanking,
      comparableDeals: Array.isArray(data.comparableDeals) ? data.comparableDeals : [],
    };
  }
}

// Export singleton instance
export const dealScorer = new DealScorerAgent();
