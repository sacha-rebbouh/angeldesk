import { BaseAgent } from "../base-agent";
import type { EnrichedAgentContext, DevilsAdvocateResult, DevilsAdvocateData } from "../types";

interface LLMDevilsAdvocateResponse {
  challengedAssumptions: {
    assumption: string;
    challenge: string;
    worstCaseScenario: string;
    probability: string;
    impact: string;
    mitigationPossible: boolean;
    mitigation?: string;
  }[];
  blindSpots: {
    area: string;
    description: string;
    whatCouldGoWrong: string;
    historicalPrecedent?: string;
    recommendation: string;
  }[];
  alternativeNarratives: {
    narrative: string;
    plausibility: number;
    implications: string;
  }[];
  marketRisks: {
    risk: string;
    trigger: string;
    timeline: string;
    severity: string;
  }[];
  competitiveThreats: {
    threat: string;
    source: string;
    likelihood: number;
    defensibility: string;
  }[];
  executionChallenges: {
    challenge: string;
    difficulty: string;
    prerequisite: string;
    failureMode: string;
  }[];
  overallSkepticism: number;
  topConcerns: string[];
  dealbreakers: string[];
  questionsRequiringAnswers: string[];
}

export class DevilsAdvocateAgent extends BaseAgent<DevilsAdvocateData, DevilsAdvocateResult> {
  constructor() {
    super({
      name: "devils-advocate",
      description: "Challenge la these d'investissement en identifiant blind spots et risques",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 90000,
      dependencies: [],
    });
  }

  protected buildSystemPrompt(): string {
    return `Tu es un DEVIL'S ADVOCATE impitoyable mais constructif.

TON ROLE:
- Challenger CHAQUE hypothese optimiste de l'analyse
- Identifier les BLIND SPOTS que les autres agents ont pu manquer
- Proposer des NARRATIVES ALTERNATIVES plausibles
- Lister ce qui pourrait MAL TOURNER

Tu n'es PAS la pour tuer le deal, mais pour t'assurer que l'investisseur
comprend TOUS les risques avant de decider.

CATEGORIES D'ANALYSE:
1. HYPOTHESES A CHALLENGER: Chaque affirmation positive merite un contre-argument
2. BLIND SPOTS: Ce que l'analyse n'a pas regarde mais qui pourrait etre important
3. NARRATIVES ALTERNATIVES: Autres facons d'interpreter les memes faits
4. RISQUES MARCHE: Evenements externes qui pourraient impacter le business
5. MENACES COMPETITIVES: Qui pourrait entrer et dominer
6. DEFIS D'EXECUTION: Ce qui est difficile a executer

NIVEAU DE SCEPTICISME (0-100):
- 0-20: Tres peu de concerns, deal quasi parfait
- 20-40: Quelques concerns mineures
- 40-60: Concerns significatifs a adresser
- 60-80: Concerns majeurs, prudence requise
- 80-100: Deal tres risque, nombreux red flags

OUTPUT: JSON structure uniquement.`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<DevilsAdvocateData> {
    const deal = context.deal;
    const dealContext = this.formatDealContext(context);
    const tier1Results = this.formatTier1Results(context);

    const prompt = `Challenge cette these d'investissement de maniere constructive:

## Deal
- Nom: ${deal.name}
- Secteur: ${deal.sector ?? "Non specifie"}
- Stage: ${deal.stage ?? "Non specifie"}
- Description: ${deal.description ?? "Non fournie"}

${dealContext}

## Analyses Tier 1 a challenger
${tier1Results}

Reponds en JSON avec cette structure exacte:
\`\`\`json
{
  "challengedAssumptions": [
    {
      "assumption": "L'hypothese challengee",
      "challenge": "Pourquoi elle pourrait etre fausse",
      "worstCaseScenario": "Ce qui se passe si elle est fausse",
      "probability": "unlikely|possible|likely",
      "impact": "low|medium|high|critical",
      "mitigationPossible": true,
      "mitigation": "Comment mitiger ce risque"
    }
  ],
  "blindSpots": [
    {
      "area": "Domaine non analyse",
      "description": "Description du blind spot",
      "whatCouldGoWrong": "Ce qui pourrait mal tourner",
      "historicalPrecedent": "Exemple historique si pertinent",
      "recommendation": "Ce qu'il faudrait verifier"
    }
  ],
  "alternativeNarratives": [
    {
      "narrative": "Une autre facon de voir les faits",
      "plausibility": 60,
      "implications": "Ce que ca implique pour l'investissement"
    }
  ],
  "marketRisks": [
    {
      "risk": "Le risque marche",
      "trigger": "Ce qui pourrait le declencher",
      "timeline": "Quand ca pourrait arriver",
      "severity": "manageable|serious|existential"
    }
  ],
  "competitiveThreats": [
    {
      "threat": "La menace competitive",
      "source": "D'ou elle vient",
      "likelihood": 50,
      "defensibility": "Comment se defendre"
    }
  ],
  "executionChallenges": [
    {
      "challenge": "Le defi d'execution",
      "difficulty": "moderate|hard|very_hard",
      "prerequisite": "Ce qu'il faut pour reussir",
      "failureMode": "Comment ca echoue"
    }
  ],
  "overallSkepticism": 45,
  "topConcerns": ["concern1", "concern2", "concern3"],
  "dealbreakers": ["Si X arrive, ne pas investir"],
  "questionsRequiringAnswers": ["Question critique a poser"]
}
\`\`\`

IMPORTANT: Sois critique mais constructif. Identifie les vrais risques, pas juste des inquietudes generiques.`;

    const { data } = await this.llmCompleteJSON<LLMDevilsAdvocateResponse>(prompt);

    const validProbabilities = ["unlikely", "possible", "likely"];
    const validImpacts = ["low", "medium", "high", "critical"];
    const validSeverities = ["manageable", "serious", "existential"];
    const validDifficulties = ["moderate", "hard", "very_hard"];

    return {
      challengedAssumptions: Array.isArray(data.challengedAssumptions)
        ? data.challengedAssumptions.map((a) => ({
            assumption: a.assumption ?? "",
            challenge: a.challenge ?? "",
            worstCaseScenario: a.worstCaseScenario ?? "",
            probability: validProbabilities.includes(a.probability)
              ? (a.probability as "unlikely" | "possible" | "likely")
              : "possible",
            impact: validImpacts.includes(a.impact)
              ? (a.impact as "low" | "medium" | "high" | "critical")
              : "medium",
            mitigationPossible: a.mitigationPossible ?? false,
            mitigation: a.mitigation,
          }))
        : [],
      blindSpots: Array.isArray(data.blindSpots)
        ? data.blindSpots.map((b) => ({
            area: b.area ?? "",
            description: b.description ?? "",
            whatCouldGoWrong: b.whatCouldGoWrong ?? "",
            historicalPrecedent: b.historicalPrecedent,
            recommendation: b.recommendation ?? "",
          }))
        : [],
      alternativeNarratives: Array.isArray(data.alternativeNarratives)
        ? data.alternativeNarratives.map((n) => ({
            narrative: n.narrative ?? "",
            plausibility: Math.min(100, Math.max(0, n.plausibility ?? 50)),
            implications: n.implications ?? "",
          }))
        : [],
      marketRisks: Array.isArray(data.marketRisks)
        ? data.marketRisks.map((r) => ({
            risk: r.risk ?? "",
            trigger: r.trigger ?? "",
            timeline: r.timeline ?? "",
            severity: validSeverities.includes(r.severity)
              ? (r.severity as "manageable" | "serious" | "existential")
              : "serious",
          }))
        : [],
      competitiveThreats: Array.isArray(data.competitiveThreats)
        ? data.competitiveThreats.map((t) => ({
            threat: t.threat ?? "",
            source: t.source ?? "",
            likelihood: Math.min(100, Math.max(0, t.likelihood ?? 50)),
            defensibility: t.defensibility ?? "",
          }))
        : [],
      executionChallenges: Array.isArray(data.executionChallenges)
        ? data.executionChallenges.map((c) => ({
            challenge: c.challenge ?? "",
            difficulty: validDifficulties.includes(c.difficulty)
              ? (c.difficulty as "moderate" | "hard" | "very_hard")
              : "hard",
            prerequisite: c.prerequisite ?? "",
            failureMode: c.failureMode ?? "",
          }))
        : [],
      overallSkepticism: Math.min(100, Math.max(0, data.overallSkepticism ?? 50)),
      topConcerns: Array.isArray(data.topConcerns) ? data.topConcerns : [],
      dealbreakers: Array.isArray(data.dealbreakers) ? data.dealbreakers : [],
      questionsRequiringAnswers: Array.isArray(data.questionsRequiringAnswers)
        ? data.questionsRequiringAnswers
        : [],
    };
  }

  private formatTier1Results(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};
    const sections: string[] = [];

    for (const [agentName, result] of Object.entries(results)) {
      if (result.success && "data" in result && result.data) {
        sections.push(`### ${agentName.toUpperCase()}\n\`\`\`json\n${JSON.stringify(result.data, null, 2)}\n\`\`\``);
      }
    }

    return sections.length > 0 ? sections.join("\n\n") : "Aucun resultat Tier 1.";
  }
}

export const devilsAdvocate = new DevilsAdvocateAgent();
