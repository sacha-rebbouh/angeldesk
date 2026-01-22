import { BaseAgent } from "../base-agent";
import type { EnrichedAgentContext, MemoGeneratorResult, MemoGeneratorData } from "../types";

interface LLMMemoResponse {
  executiveSummary: {
    oneLiner: string;
    recommendation: string;
    keyPoints: string[];
  };
  companyOverview: {
    description: string;
    problem: string;
    solution: string;
    businessModel: string;
    traction: string;
  };
  investmentHighlights: {
    highlight: string;
    evidence: string;
  }[];
  keyRisks: {
    risk: string;
    mitigation: string;
    residualRisk: string;
  }[];
  financialSummary: {
    currentMetrics: Record<string, string | number>;
    projections: string;
    valuationAssessment: string;
  };
  teamAssessment: string;
  marketOpportunity: string;
  competitiveLandscape: string;
  dealTerms: {
    valuation: string;
    roundSize: string;
    keyTerms: string[];
    negotiationPoints: string[];
  };
  dueDiligenceFindings: {
    completed: string[];
    outstanding: string[];
    redFlags: string[];
  };
  investmentThesis: string;
  exitStrategy: string;
  nextSteps: string[];
  appendix: {
    financialModel?: string;
    comparableDeals?: string;
    referencesChecked?: string[];
  };
}

export class MemoGeneratorAgent extends BaseAgent<MemoGeneratorData, MemoGeneratorResult> {
  constructor() {
    super({
      name: "memo-generator",
      description: "Genere le memo d'investissement complet synthetisant toutes les analyses",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 120000,
      dependencies: ["synthesis-deal-scorer", "devils-advocate"],
    });
  }

  protected buildSystemPrompt(): string {
    return `Tu es un expert en redaction de memos d'investissement VC.

TON ROLE:
- Synthetiser TOUTES les analyses Tier 1 et Tier 2
- Produire un memo d'investissement professionnel
- Permettre a un Business Angel de prendre une decision eclairee

STRUCTURE DU MEMO:
1. EXECUTIVE SUMMARY: One-liner + recommandation + key points
2. COMPANY OVERVIEW: Probleme, solution, business model, traction
3. INVESTMENT HIGHLIGHTS: 3-5 points forts avec preuves
4. KEY RISKS: Risques majeurs avec mitigation
5. FINANCIAL SUMMARY: Metriques, projections, valorisation
6. TEAM ASSESSMENT: Evaluation de l'equipe
7. MARKET OPPORTUNITY: Taille et timing
8. COMPETITIVE LANDSCAPE: Position concurrentielle
9. DEAL TERMS: Termes et points de negociation
10. DD FINDINGS: Ce qui a ete verifie et ce qui reste
11. INVESTMENT THESIS: Pourquoi investir (ou pas)
12. EXIT STRATEGY: Comment sortir
13. NEXT STEPS: Actions a prendre

PRINCIPES:
- Etre factuel et chiffre
- Citer les sources (agents Tier 1)
- Equilibrer positif et negatif
- Recommandation claire et argumentee

OUTPUT: JSON structure uniquement.`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<MemoGeneratorData> {
    const deal = context.deal;
    const dealContext = this.formatDealContext(context);
    const tier1Summary = this.formatTier1Summary(context);
    const tier2Summary = this.formatTier2Summary(context);

    const valuation = deal.valuationPre ? Number(deal.valuationPre) : 0;
    const amount = deal.amountRequested ? Number(deal.amountRequested) : 0;
    const arr = deal.arr ? Number(deal.arr) : 0;

    const prompt = `Genere un memo d'investissement complet pour ce deal:

${dealContext}

## Metriques cles
- Valorisation pre-money: ${valuation > 0 ? `€${valuation.toLocaleString()}` : "Non specifie"}
- Montant leve: ${amount > 0 ? `€${amount.toLocaleString()}` : "Non specifie"}
- ARR: ${arr > 0 ? `€${arr.toLocaleString()}` : "Non specifie"}
- Croissance: ${deal.growthRate ?? "Non specifie"}%

## Analyses Tier 1
${tier1Summary}

## Syntheses Tier 2
${tier2Summary}

Reponds en JSON avec cette structure exacte:
\`\`\`json
{
  "executiveSummary": {
    "oneLiner": "Une phrase memorable qui capture l'essence du deal",
    "recommendation": "invest|pass|more_dd_needed",
    "keyPoints": ["point1", "point2", "point3"]
  },
  "companyOverview": {
    "description": "Description de la societe",
    "problem": "Le probleme resolu",
    "solution": "La solution proposee",
    "businessModel": "Comment ils gagnent de l'argent",
    "traction": "Traction actuelle"
  },
  "investmentHighlights": [
    { "highlight": "Point fort", "evidence": "Preuve concrete" }
  ],
  "keyRisks": [
    { "risk": "Le risque", "mitigation": "Comment le mitiger", "residualRisk": "low|medium|high" }
  ],
  "financialSummary": {
    "currentMetrics": { "ARR": "500K€", "Growth": "120%", "NRR": "110%" },
    "projections": "Resume des projections financieres",
    "valuationAssessment": "Assessment de la valorisation demandee"
  },
  "teamAssessment": "Evaluation detaillee de l'equipe fondatrice",
  "marketOpportunity": "Description de l'opportunite de marche",
  "competitiveLandscape": "Analyse du paysage concurrentiel",
  "dealTerms": {
    "valuation": "5M€ pre-money",
    "roundSize": "1M€",
    "keyTerms": ["terme1", "terme2"],
    "negotiationPoints": ["point de nego1"]
  },
  "dueDiligenceFindings": {
    "completed": ["ce qui a ete verifie"],
    "outstanding": ["ce qui reste a verifier"],
    "redFlags": ["red flags identifies"]
  },
  "investmentThesis": "La these d'investissement en 2-3 paragraphes",
  "exitStrategy": "Strategie de sortie envisagee",
  "nextSteps": ["etape1", "etape2"],
  "appendix": {
    "financialModel": "Resume du modele si disponible",
    "comparableDeals": "Deals comparables",
    "referencesChecked": ["ref1"]
  }
}
\`\`\`

IMPORTANT: Le memo doit etre actionnable et permettre une decision.`;

    const { data } = await this.llmCompleteJSON<LLMMemoResponse>(prompt);

    const validRecommendations = ["invest", "pass", "more_dd_needed"];
    const validResidualRisks = ["low", "medium", "high"];

    return {
      executiveSummary: {
        oneLiner: data.executiveSummary?.oneLiner ?? `${deal.name} - analyse en cours`,
        recommendation: validRecommendations.includes(data.executiveSummary?.recommendation)
          ? (data.executiveSummary.recommendation as "invest" | "pass" | "more_dd_needed")
          : "more_dd_needed",
        keyPoints: Array.isArray(data.executiveSummary?.keyPoints)
          ? data.executiveSummary.keyPoints
          : [],
      },
      companyOverview: data.companyOverview ?? {
        description: deal.description ?? "",
        problem: "",
        solution: "",
        businessModel: "",
        traction: "",
      },
      investmentHighlights: Array.isArray(data.investmentHighlights)
        ? data.investmentHighlights.map((h) => ({
            highlight: h.highlight ?? "",
            evidence: h.evidence ?? "",
          }))
        : [],
      keyRisks: Array.isArray(data.keyRisks)
        ? data.keyRisks.map((r) => ({
            risk: r.risk ?? "",
            mitigation: r.mitigation ?? "",
            residualRisk: validResidualRisks.includes(r.residualRisk)
              ? (r.residualRisk as "low" | "medium" | "high")
              : "medium",
          }))
        : [],
      financialSummary: data.financialSummary ?? {
        currentMetrics: {},
        projections: "",
        valuationAssessment: "",
      },
      teamAssessment: data.teamAssessment ?? "",
      marketOpportunity: data.marketOpportunity ?? "",
      competitiveLandscape: data.competitiveLandscape ?? "",
      dealTerms: data.dealTerms ?? {
        valuation: valuation > 0 ? `€${valuation.toLocaleString()} pre-money` : "",
        roundSize: amount > 0 ? `€${amount.toLocaleString()}` : "",
        keyTerms: [],
        negotiationPoints: [],
      },
      dueDiligenceFindings: data.dueDiligenceFindings ?? {
        completed: [],
        outstanding: ["Analyse complete requise"],
        redFlags: [],
      },
      investmentThesis: data.investmentThesis ?? "",
      exitStrategy: data.exitStrategy ?? "",
      nextSteps: Array.isArray(data.nextSteps) ? data.nextSteps : [],
      appendix: data.appendix ?? {},
    };
  }

  private formatTier1Summary(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};
    const tier1Agents = [
      "financial-auditor", "team-investigator", "competitive-intel",
      "deck-forensics", "market-intelligence", "technical-dd",
      "legal-regulatory", "cap-table-auditor", "gtm-analyst",
      "customer-intel", "exit-strategist", "question-master"
    ];

    const summaries: string[] = [];
    for (const agentName of tier1Agents) {
      const result = results[agentName];
      if (result?.success && "data" in result && result.data) {
        const data = result.data as Record<string, unknown>;
        const scoreField = this.getScoreField(agentName);
        const score = scoreField && typeof data[scoreField] === "number" ? data[scoreField] : null;
        summaries.push(`- **${agentName}**: ${score !== null ? `Score ${score}/100` : "Complete"}`);
      }
    }

    return summaries.length > 0 ? summaries.join("\n") : "Pas d'analyses Tier 1.";
  }

  private formatTier2Summary(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};
    const summaries: string[] = [];

    // Synthesis scorer
    const scorer = results["synthesis-deal-scorer"];
    if (scorer?.success && "data" in scorer) {
      const d = scorer.data as { overallScore?: number; verdict?: string; investmentRecommendation?: { action?: string } };
      summaries.push(`**Synthesis Scorer**: Score ${d.overallScore ?? "N/A"}/100, Verdict: ${d.verdict ?? "N/A"}, Action: ${d.investmentRecommendation?.action ?? "N/A"}`);
    }

    // Devil's advocate
    const devils = results["devils-advocate"];
    if (devils?.success && "data" in devils) {
      const d = devils.data as { overallSkepticism?: number; topConcerns?: string[] };
      summaries.push(`**Devil's Advocate**: Scepticisme ${d.overallSkepticism ?? "N/A"}/100, ${(d.topConcerns ?? []).length} concerns`);
    }

    // Contradiction detector
    const contradictions = results["contradiction-detector"];
    if (contradictions?.success && "data" in contradictions) {
      const d = contradictions.data as { consistencyScore?: number; contradictions?: unknown[] };
      summaries.push(`**Contradictions**: Consistance ${d.consistencyScore ?? "N/A"}/100, ${(d.contradictions ?? []).length} contradictions`);
    }

    // Scenario modeler
    const scenarios = results["scenario-modeler"];
    if (scenarios?.success && "data" in scenarios) {
      const d = scenarios.data as { recommendedScenario?: string; confidenceLevel?: number };
      summaries.push(`**Scenarios**: Recommande ${d.recommendedScenario ?? "N/A"}, Confiance ${d.confidenceLevel ?? "N/A"}%`);
    }

    return summaries.length > 0 ? summaries.join("\n") : "Pas de syntheses Tier 2 disponibles.";
  }

  private getScoreField(agentName: string): string | null {
    const mapping: Record<string, string> = {
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
    return mapping[agentName] ?? null;
  }
}

export const memoGenerator = new MemoGeneratorAgent();
