import { BaseAgent } from "./base-agent";
import type { AgentContext, ScreeningResult } from "./types";

interface ScreeningData {
  shouldProceed: boolean;
  confidenceScore: number;
  summary: string;
  strengths: string[];
  concerns: string[];
  missingInfo: string[];
  recommendedNextSteps: string[];
}

export class DealScreenerAgent extends BaseAgent<ScreeningData, ScreeningResult> {
  constructor() {
    super({
      name: "deal-screener",
      description: "Quick screening of a deal to determine if it warrants deeper analysis",
      modelComplexity: "medium",
      maxRetries: 2,
      timeoutMs: 30000,
    });
  }

  protected buildSystemPrompt(): string {
    return `Tu es un analyste VC senior specialise dans le screening rapide de deals early-stage.

TON ROLE:
- Evaluer rapidement si un deal merite une analyse approfondie
- Identifier les forces et faiblesses evidentes
- Detecter les informations manquantes critiques
- Donner une recommandation claire: GO / NO-GO / NEED MORE INFO

CRITERES D'EVALUATION (par ordre d'importance):
1. EQUIPE: Experience, track record, complementarite, skin in the game
2. MARCHE: Taille, croissance, timing, concurrence
3. PRODUIT: Differentiation, traction, defensibilite
4. FINANCIERS: Metriques, valorisation, use of funds
5. DEAL STRUCTURE: Terms, cap table, gouvernance

REGLES:
- Sois direct et factuel
- Base tes conclusions sur des faits, pas des suppositions
- Si une info est manquante, dis-le explicitement
- Score de confiance = (infos disponibles / infos necessaires) * qualite des signaux
- Un deal peut etre "proceed" meme avec des concerns si les forces compensent

OUTPUT: JSON structure uniquement, pas de texte autour.`;
  }

  protected async execute(context: AgentContext): Promise<ScreeningData> {
    const dealContext = this.formatDealContext(context);

    const prompt = `Analyse ce deal et fournis ton screening:

${dealContext}

Reponds en JSON avec cette structure exacte:
\`\`\`json
{
  "shouldProceed": boolean,
  "confidenceScore": number (0-100),
  "summary": "string (2-3 phrases)",
  "strengths": ["string", ...],
  "concerns": ["string", ...],
  "missingInfo": ["string", ...],
  "recommendedNextSteps": ["string", ...]
}
\`\`\`

IMPORTANT:
- shouldProceed = true si le deal merite une DD complete
- confidenceScore reflète ta certitude (bas si infos manquantes)
- Maximum 5 items par liste
- Sois specifique et actionnable`;

    const { data, cost } = await this.llmCompleteJSON<ScreeningData>(prompt);

    // Validate and normalize the response
    return {
      shouldProceed: Boolean(data.shouldProceed),
      confidenceScore: Math.min(100, Math.max(0, data.confidenceScore ?? 50)),
      summary: data.summary ?? "Analyse incomplete",
      strengths: Array.isArray(data.strengths) ? data.strengths.slice(0, 5) : [],
      concerns: Array.isArray(data.concerns) ? data.concerns.slice(0, 5) : [],
      missingInfo: Array.isArray(data.missingInfo) ? data.missingInfo.slice(0, 5) : [],
      recommendedNextSteps: Array.isArray(data.recommendedNextSteps) ? data.recommendedNextSteps.slice(0, 5) : [],
    };
  }
}

// Export singleton instance
export const dealScreener = new DealScreenerAgent();
