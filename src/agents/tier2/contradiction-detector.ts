import { BaseAgent } from "../base-agent";
import type { EnrichedAgentContext, ContradictionDetectorResult, ContradictionDetectorData } from "../types";

interface LLMContradictionResponse {
  contradictions: {
    id: string;
    sources: string[];
    topic: string;
    claim1: { agent: string; statement: string };
    claim2: { agent: string; statement: string };
    severity: string;
    impact: string;
    resolution?: string;
    needsVerification: boolean;
  }[];
  dataGaps: {
    area: string;
    missingFrom: string[];
    importance: string;
    recommendation: string;
  }[];
  consistencyScore: number;
  summaryAssessment: string;
}

export class ContradictionDetectorAgent extends BaseAgent<ContradictionDetectorData, ContradictionDetectorResult> {
  constructor() {
    super({
      name: "contradiction-detector",
      description: "Detecte les contradictions et incoherences entre les outputs Tier 1",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 60000,
      dependencies: [],
    });
  }

  protected buildSystemPrompt(): string {
    return `Tu es un CONTRADICTION DETECTOR expert en analyse croisee de documents.

TON ROLE:
- Comparer les outputs de tous les agents Tier 1
- Identifier les CONTRADICTIONS entre differentes analyses
- Reperer les GAPS de donnees (informations manquantes importantes)
- Evaluer la CONSISTANCE globale de l'analyse

TYPES DE CONTRADICTIONS:
1. CHIFFRES CONFLICTUELS: Un agent dit ARR=500K, un autre dit 800K
2. ASSESSMENTS OPPOSES: Un agent dit "team forte", un autre "gaps critiques"
3. TEMPORALITE INCOHERENTE: Dates ou timelines qui ne correspondent pas
4. QUALIFICATIONS CONTRADICTOIRES: "croissance exceptionnelle" vs "metriques faibles"

SEVERITE:
- minor: Ecart de formulation, pas d'impact sur la decision
- moderate: Ecart significatif qui merite clarification
- major: Contradiction importante qui affecte l'analyse
- critical: Contradiction qui remet en question toute l'analyse

SCORE DE CONSISTANCE:
- 90-100: Analyse tres coherente, agents alignes
- 70-89: Quelques ecarts mineurs, globalement solide
- 50-69: Inconsistances notables a resoudre
- 30-49: Contradictions significatives
- 0-29: Analyse incoherente, donnees peu fiables

OUTPUT: JSON structure uniquement.`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<ContradictionDetectorData> {
    const tier1Results = this.formatTier1Results(context);

    const prompt = `Analyse les resultats de tous les agents Tier 1 et identifie les contradictions:

${tier1Results}

Reponds en JSON avec cette structure exacte:
\`\`\`json
{
  "contradictions": [
    {
      "id": "CONT-1",
      "sources": ["agent1", "agent2"],
      "topic": "sujet de la contradiction",
      "claim1": { "agent": "agent1", "statement": "affirmation 1" },
      "claim2": { "agent": "agent2", "statement": "affirmation 2" },
      "severity": "minor|moderate|major|critical",
      "impact": "impact sur la decision d'investissement",
      "resolution": "comment resoudre si possible",
      "needsVerification": true
    }
  ],
  "dataGaps": [
    {
      "area": "domaine manquant",
      "missingFrom": ["agent1", "agent2"],
      "importance": "low|medium|high",
      "recommendation": "comment obtenir cette info"
    }
  ],
  "consistencyScore": 75,
  "summaryAssessment": "resume de l'analyse de consistance"
}
\`\`\``;

    const { data } = await this.llmCompleteJSON<LLMContradictionResponse>(prompt);

    const validSeverities = ["minor", "moderate", "major", "critical"];
    const validImportance = ["low", "medium", "high"];

    return {
      contradictions: Array.isArray(data.contradictions)
        ? data.contradictions.map((c, i) => ({
            id: c.id ?? `CONT-${i + 1}`,
            sources: Array.isArray(c.sources) ? c.sources : [],
            topic: c.topic ?? "Unknown",
            claim1: c.claim1 ?? { agent: "unknown", statement: "" },
            claim2: c.claim2 ?? { agent: "unknown", statement: "" },
            severity: validSeverities.includes(c.severity)
              ? (c.severity as "minor" | "moderate" | "major" | "critical")
              : "moderate",
            impact: c.impact ?? "",
            resolution: c.resolution,
            needsVerification: c.needsVerification ?? true,
          }))
        : [],
      dataGaps: Array.isArray(data.dataGaps)
        ? data.dataGaps.map((g) => ({
            area: g.area ?? "Unknown",
            missingFrom: Array.isArray(g.missingFrom) ? g.missingFrom : [],
            importance: validImportance.includes(g.importance)
              ? (g.importance as "low" | "medium" | "high")
              : "medium",
            recommendation: g.recommendation ?? "",
          }))
        : [],
      consistencyScore: Math.min(100, Math.max(0, data.consistencyScore ?? 50)),
      summaryAssessment: data.summaryAssessment ?? "Analyse de consistance non disponible",
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

    return sections.length > 0 ? sections.join("\n\n") : "Aucun resultat Tier 1 disponible.";
  }
}

export const contradictionDetector = new ContradictionDetectorAgent();
