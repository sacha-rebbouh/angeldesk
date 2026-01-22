import { BaseAgent } from "../base-agent";
import type { EnrichedAgentContext, ScenarioModelerResult, ScenarioModelerData } from "../types";

interface LLMScenarioResponse {
  scenarios: {
    name: string;
    probability: number;
    description: string;
    keyAssumptions: string[];
    financialProjections: {
      year1: { revenue: number; growth: number };
      year3: { revenue: number; growth: number };
      year5: { revenue: number; growth: number };
    };
    exitScenario: {
      type: string;
      timing: string;
      valuation: number;
      multiple: number;
    };
    returnAnalysis: {
      investmentAmount: number;
      ownership: number;
      exitProceeds: number;
      multiple: number;
      irr: number;
    };
    keyRisks: string[];
    keyDrivers: string[];
  }[];
  sensitivityAnalysis: {
    variable: string;
    impact: string;
    bullValue: number | string;
    baseValue: number | string;
    bearValue: number | string;
  }[];
  breakEvenAnalysis: {
    monthsToBreakeven: number;
    requiredGrowthRate: number;
    burnUntilBreakeven: number;
  };
  recommendedScenario: string;
  confidenceLevel: number;
}

export class ScenarioModelerAgent extends BaseAgent<ScenarioModelerData, ScenarioModelerResult> {
  constructor() {
    super({
      name: "scenario-modeler",
      description: "Modelise les scenarios Bull/Base/Bear avec projections et ROI",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 90000,
      dependencies: ["financial-auditor", "market-intelligence", "exit-strategist"],
    });
  }

  protected buildSystemPrompt(): string {
    return `Tu es un expert en modelisation financiere pour le venture capital.

TON ROLE:
- Construire 3 scenarios: Bull (optimiste), Base (realiste), Bear (pessimiste)
- Pour chaque scenario: projections financieres, exit, retour investisseur
- Analyse de sensibilite sur les variables cles
- Calcul du break-even

SCENARIOS:
1. BULL (20-30% proba): Tout se passe bien, croissance acceleree, exit premium
2. BASE (40-60% proba): Execution normale, quelques obstacles, exit raisonnable
3. BEAR (20-30% proba): Difficultes significatives, pivot possible, exit difficile

PROJECTIONS FINANCIERES:
- Utiliser les metriques actuelles comme point de depart
- Appliquer des taux de croissance realistes par stade
- Seed: 100-200% Y1, decroissant
- Series A: 70-100% Y1, decroissant
- Series B: 50-70% Y1, decroissant

CALCUL RETOUR:
- Multiple = Exit proceeds / Investment amount
- IRR = ((Multiple)^(1/years) - 1) * 100
- Prendre en compte la dilution future

OUTPUT: JSON structure uniquement.`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<ScenarioModelerData> {
    const deal = context.deal;
    const dealContext = this.formatDealContext(context);
    const tier1Insights = this.extractTier1Insights(context);

    const currentARR = deal.arr ? Number(deal.arr) : 0;
    const growthRate = deal.growthRate ? Number(deal.growthRate) : 100;
    const valuation = deal.valuationPre ? Number(deal.valuationPre) : 0;
    const amountRaising = deal.amountRequested ? Number(deal.amountRequested) : 0;

    const prompt = `Construis 3 scenarios d'investissement pour ce deal:

${dealContext}

## Metriques de depart
- ARR actuel: ${currentARR > 0 ? `€${currentARR.toLocaleString()}` : "Non specifie"}
- Croissance: ${growthRate}% YoY
- Valorisation pre-money: ${valuation > 0 ? `€${valuation.toLocaleString()}` : "Non specifie"}
- Montant leve: ${amountRaising > 0 ? `€${amountRaising.toLocaleString()}` : "Non specifie"}
- Secteur: ${deal.sector ?? "SaaS B2B"}
- Stage: ${deal.stage ?? "SEED"}

## Insights des agents Tier 1
${tier1Insights}

Reponds en JSON avec cette structure exacte:
\`\`\`json
{
  "scenarios": [
    {
      "name": "bull|base|bear",
      "probability": 25,
      "description": "Description du scenario",
      "keyAssumptions": ["assumption1", "assumption2"],
      "financialProjections": {
        "year1": { "revenue": 1000000, "growth": 150 },
        "year3": { "revenue": 5000000, "growth": 80 },
        "year5": { "revenue": 15000000, "growth": 50 }
      },
      "exitScenario": {
        "type": "acquisition|ipo|secondary|none",
        "timing": "Year 5-6",
        "valuation": 150000000,
        "multiple": 10
      },
      "returnAnalysis": {
        "investmentAmount": 500000,
        "ownership": 5,
        "exitProceeds": 7500000,
        "multiple": 15,
        "irr": 72
      },
      "keyRisks": ["risk1"],
      "keyDrivers": ["driver1"]
    }
  ],
  "sensitivityAnalysis": [
    {
      "variable": "Growth rate",
      "impact": "low|medium|high",
      "bullValue": "150%",
      "baseValue": "100%",
      "bearValue": "50%"
    }
  ],
  "breakEvenAnalysis": {
    "monthsToBreakeven": 24,
    "requiredGrowthRate": 80,
    "burnUntilBreakeven": 2000000
  },
  "recommendedScenario": "base",
  "confidenceLevel": 65
}
\`\`\`

IMPORTANT: Cree les 3 scenarios (bull, base, bear) avec des projections realistes.`;

    const { data } = await this.llmCompleteJSON<LLMScenarioResponse>(prompt);

    const validScenarioNames = ["bull", "base", "bear"];
    const validExitTypes = ["acquisition", "ipo", "secondary", "none"];
    const validImpact = ["low", "medium", "high"];

    const scenarios = Array.isArray(data.scenarios)
      ? data.scenarios.map((s) => ({
          name: validScenarioNames.includes(s.name)
            ? (s.name as "bull" | "base" | "bear")
            : "base",
          probability: Math.min(100, Math.max(0, s.probability ?? 33)),
          description: s.description ?? "",
          keyAssumptions: Array.isArray(s.keyAssumptions) ? s.keyAssumptions : [],
          financialProjections: s.financialProjections ?? {
            year1: { revenue: 0, growth: 0 },
            year3: { revenue: 0, growth: 0 },
            year5: { revenue: 0, growth: 0 },
          },
          exitScenario: {
            type: validExitTypes.includes(s.exitScenario?.type)
              ? (s.exitScenario.type as "acquisition" | "ipo" | "secondary" | "none")
              : "acquisition",
            timing: s.exitScenario?.timing ?? "5-7 years",
            valuation: s.exitScenario?.valuation ?? 0,
            multiple: s.exitScenario?.multiple ?? 0,
          },
          returnAnalysis: s.returnAnalysis ?? {
            investmentAmount: amountRaising,
            ownership: 0,
            exitProceeds: 0,
            multiple: 0,
            irr: 0,
          },
          keyRisks: Array.isArray(s.keyRisks) ? s.keyRisks : [],
          keyDrivers: Array.isArray(s.keyDrivers) ? s.keyDrivers : [],
        }))
      : this.getDefaultScenarios(amountRaising);

    return {
      scenarios,
      sensitivityAnalysis: Array.isArray(data.sensitivityAnalysis)
        ? data.sensitivityAnalysis.map((s) => ({
            variable: s.variable ?? "Unknown",
            impact: validImpact.includes(s.impact)
              ? (s.impact as "low" | "medium" | "high")
              : "medium",
            bullValue: s.bullValue ?? 0,
            baseValue: s.baseValue ?? 0,
            bearValue: s.bearValue ?? 0,
          }))
        : [],
      breakEvenAnalysis: data.breakEvenAnalysis ?? {
        monthsToBreakeven: 24,
        requiredGrowthRate: 100,
        burnUntilBreakeven: 0,
      },
      recommendedScenario: validScenarioNames.includes(data.recommendedScenario)
        ? (data.recommendedScenario as "bull" | "base" | "bear")
        : "base",
      confidenceLevel: Math.min(100, Math.max(0, data.confidenceLevel ?? 50)),
    };
  }

  private extractTier1Insights(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};
    const insights: string[] = [];

    // Financial insights
    const financial = results["financial-auditor"];
    if (financial?.success && "data" in financial) {
      const d = financial.data as { overallScore?: number; valuationAnalysis?: { verdict?: string } };
      insights.push(`Financial Score: ${d.overallScore ?? "N/A"}/100`);
      if (d.valuationAnalysis?.verdict) {
        insights.push(`Valuation: ${d.valuationAnalysis.verdict}`);
      }
    }

    // Market insights
    const market = results["market-intelligence"];
    if (market?.success && "data" in market) {
      const d = market.data as { marketScore?: number; timingAnalysis?: { timing?: string } };
      insights.push(`Market Score: ${d.marketScore ?? "N/A"}/100`);
      if (d.timingAnalysis?.timing) {
        insights.push(`Timing: ${d.timingAnalysis.timing}`);
      }
    }

    // Exit insights
    const exit = results["exit-strategist"];
    if (exit?.success && "data" in exit) {
      const d = exit.data as { exitScore?: number; exitScenarios?: { scenario: string; probability: string }[] };
      insights.push(`Exit Score: ${d.exitScore ?? "N/A"}/100`);
      if (Array.isArray(d.exitScenarios) && d.exitScenarios.length > 0) {
        insights.push(`Top exit: ${d.exitScenarios[0].scenario} (${d.exitScenarios[0].probability})`);
      }
    }

    return insights.length > 0 ? insights.join("\n") : "Pas d'insights Tier 1 disponibles.";
  }

  private getDefaultScenarios(investment: number): ScenarioModelerData["scenarios"] {
    return [
      {
        name: "bull",
        probability: 25,
        description: "Scenario optimiste",
        keyAssumptions: [],
        financialProjections: {
          year1: { revenue: 0, growth: 0 },
          year3: { revenue: 0, growth: 0 },
          year5: { revenue: 0, growth: 0 },
        },
        exitScenario: { type: "acquisition", timing: "5-7 ans", valuation: 0, multiple: 0 },
        returnAnalysis: { investmentAmount: investment, ownership: 0, exitProceeds: 0, multiple: 0, irr: 0 },
        keyRisks: [],
        keyDrivers: [],
      },
      {
        name: "base",
        probability: 50,
        description: "Scenario realiste",
        keyAssumptions: [],
        financialProjections: {
          year1: { revenue: 0, growth: 0 },
          year3: { revenue: 0, growth: 0 },
          year5: { revenue: 0, growth: 0 },
        },
        exitScenario: { type: "acquisition", timing: "5-7 ans", valuation: 0, multiple: 0 },
        returnAnalysis: { investmentAmount: investment, ownership: 0, exitProceeds: 0, multiple: 0, irr: 0 },
        keyRisks: [],
        keyDrivers: [],
      },
      {
        name: "bear",
        probability: 25,
        description: "Scenario pessimiste",
        keyAssumptions: [],
        financialProjections: {
          year1: { revenue: 0, growth: 0 },
          year3: { revenue: 0, growth: 0 },
          year5: { revenue: 0, growth: 0 },
        },
        exitScenario: { type: "none", timing: "N/A", valuation: 0, multiple: 0 },
        returnAnalysis: { investmentAmount: investment, ownership: 0, exitProceeds: 0, multiple: 0, irr: 0 },
        keyRisks: [],
        keyDrivers: [],
      },
    ];
  }
}

export const scenarioModeler = new ScenarioModelerAgent();
