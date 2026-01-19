import { BaseAgent } from "../base-agent";
import type { EnrichedAgentContext, MarketIntelResult, MarketIntelData } from "../types";

/**
 * Market Intelligence Agent
 *
 * Mission: Valider les claims de marche (TAM/SAM/SOM) et analyser le timing.
 * Un BA doit savoir: "Le marche est-il aussi gros qu'ils le pretendent?"
 */

interface LLMMarketIntelResponse {
  marketSizeValidation: {
    claimedTAM?: number;
    claimedSAM?: number;
    claimedSOM?: number;
    validatedTAM?: number;
    validatedSAM?: number;
    validatedSOM?: number;
    sources: string[];
    discrepancy: string;
    assessment: string;
  };
  marketTrends: {
    trend: string;
    direction: string;
    impact: string;
    confidence: number;
  }[];
  timingAnalysis: {
    marketMaturity: string;
    adoptionCurve: string;
    windowOfOpportunity: string;
    timing: string;
  };
  regulatoryLandscape: string;
  marketScore: number;
}

export class MarketIntelligenceAgent extends BaseAgent<MarketIntelData, MarketIntelResult> {
  constructor() {
    super({
      name: "market-intelligence",
      description: "Verifie les claims de marche et analyse le timing",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 90000,
    });
  }

  protected buildSystemPrompt(): string {
    return `Tu es un analyste marche senior specialise dans la validation des opportunites de marche.

TON ROLE:
- Valider les claims TAM/SAM/SOM vs donnees de marche reelles
- Analyser les tendances et le timing du marche
- Evaluer la maturite et la courbe d'adoption
- Identifier les risques regulatoires

VALIDATION TAM/SAM/SOM:
- TAM (Total Addressable Market): Marche total mondial
- SAM (Serviceable Addressable Market): Marche accessible geographiquement/segment
- SOM (Serviceable Obtainable Market): Part realiste a 3-5 ans

METHODES DE VALIDATION:
1. TOP-DOWN: Rapports marche (Gartner, McKinsey, etc.)
2. BOTTOM-UP: # clients potentiels x ACV
3. TRIANGULATION: Croiser plusieurs sources

RED FLAGS MARCHE:
- TAM = "Tous ceux qui utilisent Internet"
- SOM > 5% du SAM (tres ambitieux)
- Pas de source pour les chiffres
- Confusion TAM/SAM (tres courant)

TIMING & MATURITE:
- Emerging: < 1% penetration, early adopters
- Growing: 1-20% penetration, fast growth
- Mature: 20-50% penetration, consolidation
- Declining: > 50%, stagnation

OUTPUT: JSON structure uniquement.`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<MarketIntelData> {
    const dealContext = this.formatDealContext(context);
    const contextEngineData = this.formatContextEngineData(context);
    const extractedInfo = this.getExtractedInfo(context);

    let marketSection = "";
    if (extractedInfo) {
      const marketData = {
        tam: extractedInfo.tam,
        sam: extractedInfo.sam,
        som: extractedInfo.som,
        targetMarket: extractedInfo.targetMarket,
      };
      marketSection = `\n## Donnees Marche du Deck\n${JSON.stringify(marketData, null, 2)}`;
    }

    const prompt = `Analyse les claims de marche de cette startup:

${dealContext}
${marketSection}
${contextEngineData}

Valide les claims vs donnees reelles.

Reponds en JSON avec cette structure exacte:
\`\`\`json
{
  "marketSizeValidation": {
    "claimedTAM": number ou null,
    "claimedSAM": number ou null,
    "claimedSOM": number ou null,
    "validatedTAM": number ou null (valeur validee),
    "validatedSAM": number ou null,
    "validatedSOM": number ou null,
    "sources": ["string (sources de validation)"],
    "discrepancy": "none|minor|significant|major",
    "assessment": "string (analyse de l'ecart)"
  },
  "marketTrends": [
    {
      "trend": "string",
      "direction": "positive|neutral|negative",
      "impact": "string (impact sur le deal)",
      "confidence": number (0-1)
    }
  ],
  "timingAnalysis": {
    "marketMaturity": "emerging|growing|mature|declining",
    "adoptionCurve": "innovators|early_adopters|early_majority|late_majority",
    "windowOfOpportunity": "string (analyse du timing)",
    "timing": "too_early|good|optimal|late"
  },
  "regulatoryLandscape": "string (risques/opportunites regulatoires)",
  "marketScore": number (0-100)
}
\`\`\`

IMPORTANT:
- Si pas de donnees Context Engine, indiquer "sources limitees"
- discrepancy "major" si claims > 2x les donnees validees
- Score < 50 si timing mauvais OU marche en decline`;

    const { data } = await this.llmCompleteJSON<LLMMarketIntelResponse>(prompt);

    const validDiscrepancies = ["none", "minor", "significant", "major"];
    const validDirections = ["positive", "neutral", "negative"];
    const validMaturities = ["emerging", "growing", "mature", "declining"];
    const validAdoption = ["innovators", "early_adopters", "early_majority", "late_majority"];
    const validTimings = ["too_early", "good", "optimal", "late"];

    return {
      marketSizeValidation: {
        claimedTAM: data.marketSizeValidation?.claimedTAM,
        claimedSAM: data.marketSizeValidation?.claimedSAM,
        claimedSOM: data.marketSizeValidation?.claimedSOM,
        validatedTAM: data.marketSizeValidation?.validatedTAM,
        validatedSAM: data.marketSizeValidation?.validatedSAM,
        validatedSOM: data.marketSizeValidation?.validatedSOM,
        sources: Array.isArray(data.marketSizeValidation?.sources)
          ? data.marketSizeValidation.sources
          : [],
        discrepancy: validDiscrepancies.includes(data.marketSizeValidation?.discrepancy)
          ? (data.marketSizeValidation.discrepancy as "none" | "minor" | "significant" | "major")
          : "minor",
        assessment: data.marketSizeValidation?.assessment ?? "Donnees insuffisantes pour validation complete.",
      },
      marketTrends: Array.isArray(data.marketTrends)
        ? data.marketTrends.map((t) => ({
            trend: t.trend ?? "",
            direction: validDirections.includes(t.direction)
              ? (t.direction as "positive" | "neutral" | "negative")
              : "neutral",
            impact: t.impact ?? "",
            confidence: Math.min(1, Math.max(0, t.confidence ?? 0.5)),
          }))
        : [],
      timingAnalysis: {
        marketMaturity: validMaturities.includes(data.timingAnalysis?.marketMaturity)
          ? (data.timingAnalysis.marketMaturity as "emerging" | "growing" | "mature" | "declining")
          : "growing",
        adoptionCurve: validAdoption.includes(data.timingAnalysis?.adoptionCurve)
          ? (data.timingAnalysis.adoptionCurve as "innovators" | "early_adopters" | "early_majority" | "late_majority")
          : "early_adopters",
        windowOfOpportunity: data.timingAnalysis?.windowOfOpportunity ?? "Non evalue.",
        timing: validTimings.includes(data.timingAnalysis?.timing)
          ? (data.timingAnalysis.timing as "too_early" | "good" | "optimal" | "late")
          : "good",
      },
      regulatoryLandscape: data.regulatoryLandscape ?? "Non evalue.",
      marketScore: Math.min(100, Math.max(0, data.marketScore ?? 50)),
    };
  }
}

export const marketIntelligence = new MarketIntelligenceAgent();
