import { BaseAgent } from "../base-agent";
import type { EnrichedAgentContext, CompetitiveIntelResult, CompetitiveIntelData } from "../types";

/**
 * Competitive Intel Agent
 *
 * Mission: Cartographier le paysage concurrentiel et evaluer le positionnement.
 * Un BA doit savoir: "Qui sont les concurrents et pourquoi cette startup gagne?"
 *
 * Input:
 * - Concurrents mentionnes dans le pitch deck
 * - Competitive Landscape du Context Engine
 * - Market positioning claims
 *
 * Output:
 * - Map des concurrents avec forces/faiblesses
 * - Evaluation du moat/avantage competitif
 * - Risques concurrentiels identifies
 */

interface LLMCompetitiveIntelResponse {
  competitorMap: {
    name: string;
    positioning: string;
    funding?: number;
    estimatedRevenue?: number;
    strengths: string[];
    weaknesses: string[];
    overlap: string;
    threat: string;
  }[];
  marketConcentration: string;
  competitiveAdvantages: {
    advantage: string;
    defensibility: string;
    duration: string;
  }[];
  competitiveRisks: string[];
  moatAssessment: {
    type: string;
    strength: number;
    sustainability: string;
  };
  competitiveScore: number;
}

export class CompetitiveIntelAgent extends BaseAgent<CompetitiveIntelData, CompetitiveIntelResult> {
  constructor() {
    super({
      name: "competitive-intel",
      description: "Analyse le paysage concurrentiel et le positionnement",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 90000,
    });
  }

  protected buildSystemPrompt(): string {
    return `Tu es un analyste concurrentiel senior specialise dans les marches tech/startup.

TON ROLE:
- Identifier et cartographier tous les concurrents (directs, indirects, adjacents)
- Evaluer le positionnement et la differenciation
- Analyser le moat (avantage competitif defendable)
- Identifier les risques concurrentiels

TYPES DE CONCURRENTS:
1. DIRECTS: Meme probleme, meme solution, meme client
2. INDIRECTS: Meme probleme, solution differente
3. ADJACENTS: Solution similaire, client different
4. FUTURS: Gros acteurs qui pourraient entrer (Google, Microsoft, etc.)

TYPES DE MOATS:
1. NETWORK EFFECTS: Valeur augmente avec le nombre d'utilisateurs (score: 90-100)
2. DATA MOAT: Donnees proprietaires difficiles a repliquer (score: 80-95)
3. BRAND: Marque etablie et reconnue (score: 70-85)
4. SWITCHING COSTS: Couteux/complique de changer (score: 60-80)
5. SCALE: Economies d'echelle (score: 50-70)
6. TECHNOLOGY: Tech proprietaire/brevets (score: 40-70)
7. REGULATORY: Licences/reglementation (score: 30-60)
8. NONE: Pas de moat identifiable (score: 0-30)

NIVEAU DE MENACE:
- HIGH: Concurrent bien finance, produit similaire, meme cible
- MEDIUM: Overlap partiel, ressources comparables
- LOW: Overlap faible ou ressources limitees

REGLES:
- Ne pas se fier uniquement au deck - croiser avec les donnees Context Engine
- Un concurrent oublie dans le deck = red flag potentiel
- "Pas de concurrents" n'existe pas - toujours des alternatives
- Le moat doit etre justifie avec des preuves concretes

OUTPUT: JSON structure uniquement.`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<CompetitiveIntelData> {
    const dealContext = this.formatDealContext(context);
    const contextEngineData = this.formatContextEngineData(context);

    // Get extracted competitors
    const extractedInfo = this.getExtractedInfo(context);
    let competitorsSection = "";
    if (extractedInfo?.competitors) {
      competitorsSection = `\n## Concurrents mentionnes dans le Deck\n${JSON.stringify(extractedInfo.competitors, null, 2)}`;
    }

    // Get competitive advantage from extracted info
    let advantageSection = "";
    if (extractedInfo?.competitiveAdvantage) {
      advantageSection = `\n## Avantage competitif revendique\n${extractedInfo.competitiveAdvantage}`;
    }

    const prompt = `Analyse le paysage concurrentiel de cette startup:

${dealContext}
${competitorsSection}
${advantageSection}
${contextEngineData}

Cartographie complete du paysage concurrentiel.

Reponds en JSON avec cette structure exacte:
\`\`\`json
{
  "competitorMap": [
    {
      "name": "string",
      "positioning": "string (comment ils se positionnent)",
      "funding": number ou null (total leve en EUR),
      "estimatedRevenue": number ou null,
      "strengths": ["string"],
      "weaknesses": ["string"],
      "overlap": "direct|partial|adjacent",
      "threat": "low|medium|high"
    }
  ],
  "marketConcentration": "fragmented|moderate|concentrated|monopolistic",
  "competitiveAdvantages": [
    {
      "advantage": "string (avantage specifique)",
      "defensibility": "weak|moderate|strong",
      "duration": "string (combien de temps cet avantage tient)"
    }
  ],
  "competitiveRisks": [
    "string (risque concurrentiel specifique)"
  ],
  "moatAssessment": {
    "type": "none|brand|network|data|switching_costs|scale|technology|regulatory",
    "strength": number (0-100),
    "sustainability": "string (analyse de la durabilite)"
  },
  "competitiveScore": number (0-100, position relative vs concurrence)
}
\`\`\`

IMPORTANT:
- Inclure au moins 3-5 concurrents si le marche existe
- "Pas de concurrents" = red flag, chercher les alternatives
- Le moat doit etre justifie par des faits concrets
- competitiveScore = 100 si leader inconteste, 50 si position moyenne, <30 si suiveur`;

    const { data } = await this.llmCompleteJSON<LLMCompetitiveIntelResponse>(prompt);

    // Validate and normalize
    const validOverlaps = ["direct", "partial", "adjacent"];
    const validThreats = ["low", "medium", "high"];
    const validConcentrations = ["fragmented", "moderate", "concentrated", "monopolistic"];
    const validDefensibility = ["weak", "moderate", "strong"];
    const validMoatTypes = ["none", "brand", "network", "data", "switching_costs", "scale", "technology", "regulatory"];

    const competitorMap = Array.isArray(data.competitorMap)
      ? data.competitorMap.map((c) => ({
          name: c.name ?? "Unknown",
          positioning: c.positioning ?? "",
          funding: c.funding,
          estimatedRevenue: c.estimatedRevenue,
          strengths: Array.isArray(c.strengths) ? c.strengths : [],
          weaknesses: Array.isArray(c.weaknesses) ? c.weaknesses : [],
          overlap: validOverlaps.includes(c.overlap)
            ? (c.overlap as "direct" | "partial" | "adjacent")
            : "partial",
          threat: validThreats.includes(c.threat)
            ? (c.threat as "low" | "medium" | "high")
            : "medium",
        }))
      : [];

    const competitiveAdvantages = Array.isArray(data.competitiveAdvantages)
      ? data.competitiveAdvantages.map((a) => ({
          advantage: a.advantage ?? "",
          defensibility: validDefensibility.includes(a.defensibility)
            ? (a.defensibility as "weak" | "moderate" | "strong")
            : "moderate",
          duration: a.duration ?? "Unknown",
        }))
      : [];

    const moatAssessment = {
      type: validMoatTypes.includes(data.moatAssessment?.type)
        ? (data.moatAssessment.type as CompetitiveIntelData["moatAssessment"]["type"])
        : "none",
      strength: Math.min(100, Math.max(0, data.moatAssessment?.strength ?? 30)),
      sustainability: data.moatAssessment?.sustainability ?? "Unknown",
    };

    return {
      competitorMap,
      marketConcentration: validConcentrations.includes(data.marketConcentration)
        ? (data.marketConcentration as CompetitiveIntelData["marketConcentration"])
        : "moderate",
      competitiveAdvantages,
      competitiveRisks: Array.isArray(data.competitiveRisks) ? data.competitiveRisks : [],
      moatAssessment,
      competitiveScore: Math.min(100, Math.max(0, data.competitiveScore ?? 50)),
    };
  }
}

export const competitiveIntel = new CompetitiveIntelAgent();
