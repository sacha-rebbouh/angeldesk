import { BaseAgent } from "../base-agent";
import type { EnrichedAgentContext, SynthesisDealScorerResult, SynthesisDealScorerData } from "../types";

interface LLMSynthesisScoreResponse {
  overallScore: number;
  verdict: string;
  confidence: number;
  dimensionScores: {
    dimension: string;
    score: number;
    weight: number;
    weightedScore: number;
    sourceAgents: string[];
    keyFactors: string[];
  }[];
  scoreBreakdown: {
    strengthsContribution: number;
    weaknessesDeduction: number;
    riskAdjustment: number;
    opportunityBonus: number;
  };
  comparativeRanking: {
    percentileOverall: number;
    percentileSector: number;
    percentileStage: number;
    similarDealsAnalyzed: number;
  };
  investmentRecommendation: {
    action: string;
    rationale: string;
    conditions?: string[];
    suggestedTerms?: string;
  };
  keyStrengths: string[];
  keyWeaknesses: string[];
  criticalRisks: string[];
}

export class SynthesisDealScorerAgent extends BaseAgent<SynthesisDealScorerData, SynthesisDealScorerResult> {
  constructor() {
    super({
      name: "synthesis-deal-scorer",
      description: "Calcule le score final en aggregeant tous les outputs Tier 1",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 90000,
      dependencies: [],
    });
  }

  protected buildSystemPrompt(): string {
    return `Tu es un expert en scoring d'investissement venture capital.

TON ROLE:
- Aggreger tous les scores des agents Tier 1
- Calculer un score final pondere
- Fournir une recommandation claire d'investissement

PONDERATION DES DIMENSIONS:
- Team (25%): team-investigator
- Market (20%): market-intelligence, competitive-intel
- Product/Tech (15%): technical-dd, deck-forensics
- Financials (20%): financial-auditor, cap-table-auditor
- GTM/Traction (15%): gtm-analyst, customer-intel
- Exit Potential (5%): exit-strategist

VERDICTS:
- strong_pass (85-100): Deal exceptionnel, investir avec conviction
- pass (70-84): Bon deal, investir avec les conditions usuelles
- conditional_pass (55-69): Deal interessant sous conditions
- weak_pass (40-54): Deal mediocre, passer sauf conviction forte
- no_go (0-39): Deal faible, ne pas investir

RECOMMANDATIONS:
- invest: Proceder a l'investissement
- pass: Ne pas investir
- wait: Attendre plus d'infos / prochaine milestone
- negotiate: Interessant mais termes a negocier

OUTPUT: JSON structure uniquement.`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<SynthesisDealScorerData> {
    const deal = context.deal;
    const dealContext = this.formatDealContext(context);
    const scoresSection = this.extractAllScores(context);
    const tier1Summary = this.formatTier1Summary(context);

    const prompt = `Calcule le score final d'investissement pour ce deal:

${dealContext}

## Scores des agents Tier 1
${scoresSection}

## Resume des analyses Tier 1
${tier1Summary}

Reponds en JSON avec cette structure exacte:
\`\`\`json
{
  "overallScore": 72,
  "verdict": "strong_pass|pass|conditional_pass|weak_pass|no_go",
  "confidence": 75,
  "dimensionScores": [
    {
      "dimension": "Team",
      "score": 78,
      "weight": 25,
      "weightedScore": 19.5,
      "sourceAgents": ["team-investigator"],
      "keyFactors": ["Experience fondateurs", "Complementarite equipe"]
    }
  ],
  "scoreBreakdown": {
    "strengthsContribution": 15,
    "weaknessesDeduction": -8,
    "riskAdjustment": -5,
    "opportunityBonus": 5
  },
  "comparativeRanking": {
    "percentileOverall": 65,
    "percentileSector": 72,
    "percentileStage": 68,
    "similarDealsAnalyzed": 50
  },
  "investmentRecommendation": {
    "action": "invest|pass|wait|negotiate",
    "rationale": "Raison principale de la recommandation",
    "conditions": ["condition1", "condition2"],
    "suggestedTerms": "Termes suggeres si negotiate"
  },
  "keyStrengths": ["force1", "force2", "force3"],
  "keyWeaknesses": ["faiblesse1", "faiblesse2"],
  "criticalRisks": ["risque critique si present"]
}
\`\`\`

IMPORTANT:
- Le score global doit refleter la moyenne ponderee des dimensions
- La recommandation doit etre coherente avec le verdict
- Les forces et faiblesses doivent etre tirees des analyses Tier 1`;

    const { data } = await this.llmCompleteJSON<LLMSynthesisScoreResponse>(prompt);

    const validVerdicts = ["strong_pass", "pass", "conditional_pass", "weak_pass", "no_go"];
    const validActions = ["invest", "pass", "wait", "negotiate"];

    return {
      overallScore: Math.min(100, Math.max(0, data.overallScore ?? 50)),
      verdict: validVerdicts.includes(data.verdict)
        ? (data.verdict as SynthesisDealScorerData["verdict"])
        : "conditional_pass",
      confidence: Math.min(100, Math.max(0, data.confidence ?? 50)),
      dimensionScores: Array.isArray(data.dimensionScores)
        ? data.dimensionScores.map((d) => ({
            dimension: d.dimension ?? "Unknown",
            score: Math.min(100, Math.max(0, d.score ?? 50)),
            weight: d.weight ?? 0,
            weightedScore: d.weightedScore ?? 0,
            sourceAgents: Array.isArray(d.sourceAgents) ? d.sourceAgents : [],
            keyFactors: Array.isArray(d.keyFactors) ? d.keyFactors : [],
          }))
        : [],
      scoreBreakdown: data.scoreBreakdown ?? {
        strengthsContribution: 0,
        weaknessesDeduction: 0,
        riskAdjustment: 0,
        opportunityBonus: 0,
      },
      comparativeRanking: data.comparativeRanking ?? {
        percentileOverall: 50,
        percentileSector: 50,
        percentileStage: 50,
        similarDealsAnalyzed: 0,
      },
      investmentRecommendation: {
        action: validActions.includes(data.investmentRecommendation?.action)
          ? (data.investmentRecommendation.action as "invest" | "pass" | "wait" | "negotiate")
          : "wait",
        rationale: data.investmentRecommendation?.rationale ?? "Analyse en cours",
        conditions: Array.isArray(data.investmentRecommendation?.conditions)
          ? data.investmentRecommendation.conditions
          : undefined,
        suggestedTerms: data.investmentRecommendation?.suggestedTerms,
      },
      keyStrengths: Array.isArray(data.keyStrengths) ? data.keyStrengths : [],
      keyWeaknesses: Array.isArray(data.keyWeaknesses) ? data.keyWeaknesses : [],
      criticalRisks: Array.isArray(data.criticalRisks) ? data.criticalRisks : [],
    };
  }

  private extractAllScores(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};
    const scores: string[] = [];

    const scoreMapping: Record<string, string> = {
      "financial-auditor": "overallScore",
      "team-investigator": "overallTeamScore",
      "competitive-intel": "competitiveScore",
      "market-intelligence": "marketScore",
      "technical-dd": "technicalScore",
      "legal-regulatory": "legalScore",
      "cap-table-auditor": "capTableScore",
      "gtm-analyst": "gtmScore",
      "customer-intel": "customerScore",
      "exit-strategist": "exitScore",
    };

    for (const [agentName, scoreField] of Object.entries(scoreMapping)) {
      const result = results[agentName];
      if (result?.success && "data" in result) {
        const data = result.data as Record<string, unknown>;
        if (typeof data[scoreField] === "number") {
          scores.push(`- ${agentName}: ${data[scoreField]}/100`);
        }
      }
    }

    return scores.length > 0 ? scores.join("\n") : "Aucun score disponible.";
  }

  private formatTier1Summary(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};
    const summaries: string[] = [];

    for (const [agentName, result] of Object.entries(results)) {
      if (result.success && "data" in result && result.data) {
        const data = result.data as Record<string, unknown>;
        const keyInfo: string[] = [];

        // Extract red flags if present
        const redFlagFields = ["financialRedFlags", "redFlags", "criticalIssues", "structuralRedFlags"];
        for (const field of redFlagFields) {
          if (Array.isArray(data[field]) && data[field].length > 0) {
            keyInfo.push(`Red flags: ${data[field].length}`);
            break;
          }
        }

        if (keyInfo.length > 0) {
          summaries.push(`**${agentName}**: ${keyInfo.join(", ")}`);
        }
      }
    }

    return summaries.length > 0 ? summaries.join("\n") : "Pas de resume disponible.";
  }
}

export const synthesisDealScorer = new SynthesisDealScorerAgent();
