import { BaseAgent } from "../base-agent";
import type { EnrichedAgentContext, ExitStrategistResult, ExitStrategistData } from "../types";

/**
 * Exit Strategist Agent
 *
 * Mission: Analyser les scenarios de sortie et le potentiel de retour.
 * Un BA investit pour un retour - cet agent repond a "Comment je sors et avec combien?"
 */

interface LLMExitStrategistResponse {
  exitScenarios: {
    scenario: string;
    probability: string;
    timeframe: string;
    estimatedValue?: number;
    potentialBuyers?: string[];
    description: string;
  }[];
  acquirerAnalysis: {
    strategicBuyers: string[];
    financialBuyers: string[];
    buyerMotivation: string;
    comparableAcquisitions: {
      target: string;
      acquirer: string;
      value: number;
      multiple: number;
      year: number;
    }[];
  };
  returnAnalysis: {
    investmentAmount: number;
    ownershipPostRound: number;
    scenarios: {
      scenario: string;
      exitValue: number;
      dilution: number;
      proceeds: number;
      multiple: number;
      irr: number;
    }[];
  };
  liquidityRisks: string[];
  exitScore: number;
}

export class ExitStrategistAgent extends BaseAgent<ExitStrategistData, ExitStrategistResult> {
  constructor() {
    super({
      name: "exit-strategist",
      description: "Analyse les scenarios de sortie et le potentiel de retour",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 90000,
    });
  }

  protected buildSystemPrompt(): string {
    return `Tu es un expert en M&A et exits de startups.

TON ROLE:
- Identifier les scenarios de sortie realistes
- Evaluer les acquereurs potentiels
- Modeliser les retours pour l'investisseur
- Identifier les risques de liquidite

TYPES D'EXIT:
1. ACQUISITION STRATEGIQUE (le plus courant)
   - Achat par un acteur du secteur
   - Multiple: 3-10x revenus (selon croissance/marges)
   - Timeline: 4-7 ans typiquement

2. ACQUISITION GROWTH
   - Achat apres Series B/C
   - Valuations plus elevees
   - Timeline: 6-10 ans

3. IPO (rare pour BA)
   - Exige ARR > €100M, croissance > 30%
   - Timeline: 8-12 ans
   - Dilution importante avant exit

4. SECONDARY (partiel)
   - Vente de parts en round subsequent
   - Liquidite partielle
   - Multiple variable

5. FAILURE
   - Toujours modeliser ce scenario
   - Probabilite: 60-70% des startups early-stage

MULTIPLES D'ACQUISITION:
- SaaS B2B: 5-15x ARR (selon croissance)
- Fintech: 4-12x ARR
- Marketplace: 3-6x GMV ou 8-15x take rate
- AI: 10-30x ARR (bulle actuelle)

DILUTION STANDARD:
- Seed → Series A: 25-30%
- Series A → B: 20-25%
- Series B → Exit: 15-25%
- Total: ~60-70% dilution seed→exit

OUTPUT: JSON structure uniquement.`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<ExitStrategistData> {
    const dealContext = this.formatDealContext(context);
    const contextEngineData = this.formatContextEngineData(context);
    const extractedInfo = this.getExtractedInfo(context);

    const deal = context.deal;
    const investmentAmount = Number(extractedInfo?.amountRaising) || (deal.amountRequested ? Number(deal.amountRequested) : 500000);
    const valuation = Number(extractedInfo?.valuationPre) || (deal.valuationPre ? Number(deal.valuationPre) : 3000000);

    const prompt = `Analyse les scenarios d'exit pour cet investissement:

${dealContext}
${contextEngineData}

## Parametres d'investissement
- Montant investi (assume ticket BA): €${Math.round(investmentAmount * 0.1)} - €${Math.round(investmentAmount * 0.2)}
- Valorisation pre-money: €${valuation}
- Stade: ${deal.stage || "SEED"}

Modelise les scenarios de sortie.

Reponds en JSON avec cette structure exacte:
\`\`\`json
{
  "exitScenarios": [
    {
      "scenario": "acquisition_early|acquisition_growth|ipo|secondary|failure",
      "probability": "low|medium|high",
      "timeframe": "string (ex: 4-6 ans)",
      "estimatedValue": number ou null (valeur exit),
      "potentialBuyers": ["string"] ou null,
      "description": "string"
    }
  ],
  "acquirerAnalysis": {
    "strategicBuyers": ["string (acquereurs strategiques potentiels)"],
    "financialBuyers": ["string (PE, growth equity)"],
    "buyerMotivation": "string (pourquoi ils acheteraient)",
    "comparableAcquisitions": [
      {
        "target": "string",
        "acquirer": "string",
        "value": number (EUR),
        "multiple": number (x revenus),
        "year": number
      }
    ]
  },
  "returnAnalysis": {
    "investmentAmount": number (ticket BA moyen),
    "ownershipPostRound": number (% du BA apres round),
    "scenarios": [
      {
        "scenario": "string (description du scenario)",
        "exitValue": number (valeur totale de l'exit),
        "dilution": number (% dilution cumulee jusqu'a l'exit),
        "proceeds": number (retour BA en EUR),
        "multiple": number (multiple sur investissement),
        "irr": number (% IRR annualise)
      }
    ]
  },
  "liquidityRisks": ["string"],
  "exitScore": number (0-100, attractivite exit)
}
\`\`\`

IMPORTANT:
- Inclure TOUJOURS le scenario "failure"
- Les multiples doivent etre realistes vs le secteur
- IRR calcule sur la duree du scenario
- Score < 50 si pas d'acquereur evident`;

    const { data } = await this.llmCompleteJSON<LLMExitStrategistResponse>(prompt);

    const validScenarios = ["acquisition_early", "acquisition_growth", "ipo", "secondary", "failure"];
    const validProbability = ["low", "medium", "high"];

    return {
      exitScenarios: Array.isArray(data.exitScenarios)
        ? data.exitScenarios.map((s) => ({
            scenario: validScenarios.includes(s.scenario)
              ? (s.scenario as "acquisition_early" | "acquisition_growth" | "ipo" | "secondary" | "failure")
              : "acquisition_early",
            probability: validProbability.includes(s.probability)
              ? (s.probability as "low" | "medium" | "high")
              : "medium",
            timeframe: s.timeframe ?? "5-7 ans",
            estimatedValue: s.estimatedValue,
            potentialBuyers: Array.isArray(s.potentialBuyers) ? s.potentialBuyers : undefined,
            description: s.description ?? "",
          }))
        : [],
      acquirerAnalysis: {
        strategicBuyers: Array.isArray(data.acquirerAnalysis?.strategicBuyers)
          ? data.acquirerAnalysis.strategicBuyers
          : [],
        financialBuyers: Array.isArray(data.acquirerAnalysis?.financialBuyers)
          ? data.acquirerAnalysis.financialBuyers
          : [],
        buyerMotivation: data.acquirerAnalysis?.buyerMotivation ?? "Non evalue.",
        comparableAcquisitions: Array.isArray(data.acquirerAnalysis?.comparableAcquisitions)
          ? data.acquirerAnalysis.comparableAcquisitions
          : [],
      },
      returnAnalysis: {
        investmentAmount: data.returnAnalysis?.investmentAmount ?? investmentAmount * 0.1,
        ownershipPostRound: data.returnAnalysis?.ownershipPostRound ?? 1,
        scenarios: Array.isArray(data.returnAnalysis?.scenarios)
          ? data.returnAnalysis.scenarios.map((s) => ({
              scenario: s.scenario ?? "",
              exitValue: s.exitValue ?? 0,
              dilution: s.dilution ?? 60,
              proceeds: s.proceeds ?? 0,
              multiple: s.multiple ?? 1,
              irr: s.irr ?? 0,
            }))
          : [],
      },
      liquidityRisks: Array.isArray(data.liquidityRisks) ? data.liquidityRisks : [],
      exitScore: Math.min(100, Math.max(0, data.exitScore ?? 50)),
    };
  }
}

export const exitStrategist = new ExitStrategistAgent();
