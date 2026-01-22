import { MODELS, type ModelKey } from "@/services/openrouter/client";
import { complete, setAgentContext, completeJSON } from "@/services/openrouter/router";
import type {
  BoardMemberConfig,
  BoardInput,
  InitialAnalysis,
  DebateResponse,
  FinalVote,
  BoardVerdictType,
} from "./types";

const ANALYSIS_TIMEOUT_MS = 120000; // 2 minutes
const DEBATE_TIMEOUT_MS = 90000; // 1.5 minutes
const VOTE_TIMEOUT_MS = 60000; // 1 minute

export class BoardMember {
  readonly id: string;
  readonly modelKey: ModelKey;
  readonly name: string;
  readonly color: string;

  private totalCost = 0;

  constructor(config: BoardMemberConfig) {
    this.id = config.id;
    this.modelKey = config.modelKey;
    this.name = config.name;
    this.color = config.color;
  }

  getTotalCost(): number {
    return this.totalCost;
  }

  /**
   * Phase 1: Initial independent analysis of the deal
   */
  async analyze(input: BoardInput): Promise<{ analysis: InitialAnalysis; cost: number }> {
    setAgentContext(`board-member-${this.id}`);

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildAnalysisPrompt(input);

    const result = await Promise.race([
      completeJSON<InitialAnalysis>(userPrompt, {
        model: this.modelKey,
        systemPrompt,
        maxTokens: 4096,
        temperature: 0.7,
      }),
      this.timeout<never>(ANALYSIS_TIMEOUT_MS, "Analysis timeout"),
    ]);

    this.totalCost += result.cost;

    return {
      analysis: result.data,
      cost: result.cost,
    };
  }

  /**
   * Phase 2: Debate round - respond to other members' analyses
   */
  async debate(
    input: BoardInput,
    ownAnalysis: InitialAnalysis,
    othersAnalyses: { memberId: string; memberName: string; analysis: InitialAnalysis }[],
    roundNumber: number
  ): Promise<{ response: DebateResponse; cost: number }> {
    setAgentContext(`board-member-${this.id}`);

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildDebatePrompt(input, ownAnalysis, othersAnalyses, roundNumber);

    const result = await Promise.race([
      completeJSON<DebateResponse>(userPrompt, {
        model: this.modelKey,
        systemPrompt,
        maxTokens: 3000,
        temperature: 0.6,
      }),
      this.timeout<never>(DEBATE_TIMEOUT_MS, "Debate timeout"),
    ]);

    this.totalCost += result.cost;

    return {
      response: result.data,
      cost: result.cost,
    };
  }

  /**
   * Phase 3: Final vote after all debate rounds
   */
  async vote(
    input: BoardInput,
    debateHistory: {
      roundNumber: number;
      responses: { memberId: string; memberName: string; response: DebateResponse }[];
    }[]
  ): Promise<{ vote: FinalVote; cost: number }> {
    setAgentContext(`board-member-${this.id}`);

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildVotePrompt(input, debateHistory);

    const result = await Promise.race([
      completeJSON<FinalVote>(userPrompt, {
        model: this.modelKey,
        systemPrompt,
        maxTokens: 2000,
        temperature: 0.4,
      }),
      this.timeout<never>(VOTE_TIMEOUT_MS, "Vote timeout"),
    ]);

    this.totalCost += result.cost;

    return {
      vote: result.data,
      cost: result.cost,
    };
  }

  // ============================================================================
  // PROMPT BUILDERS
  // ============================================================================

  private buildSystemPrompt(): string {
    return `Tu es un membre d'un comite d'investissement IA analysant des deals pour des Business Angels.

IMPORTANT: Tu n'as PAS de role pre-assigne (pas de "devil's advocate" ou "optimiste"). Tu dois former ton propre avis base sur les donnees.

Ton modele: ${this.name}

OBJECTIF:
- Analyser objectivement le deal presente
- Former un verdict independant (GO / NO_GO / NEED_MORE_INFO)
- Justifier ta position avec des arguments precis et des preuves
- Debattre constructivement avec les autres membres
- Changer d'avis si les arguments sont convaincants

CRITERES D'EVALUATION:
1. Equipe fondatrice (experience, complementarite, track record)
2. Marche (taille, croissance, timing)
3. Produit (differenciation, moat, traction)
4. Financiers (metriques, valorisation, terms)
5. Risques (red flags, concerns)

FORMAT DE REPONSE: Toujours repondre en JSON valide.`;
  }

  private buildAnalysisPrompt(input: BoardInput): string {
    const formattedInput = this.formatInputForLLM(input);

    return `ANALYSE INITIALE DU DEAL

${formattedInput}

---

Analyse ce deal et forme ton verdict independant.

Reponds en JSON avec ce format exact:
\`\`\`json
{
  "verdict": "GO" | "NO_GO" | "NEED_MORE_INFO",
  "confidence": <0-100>,
  "arguments": [
    {
      "point": "<argument en faveur ou contre>",
      "strength": "strong" | "moderate" | "weak",
      "evidence": "<preuve ou source>"
    }
  ],
  "concerns": [
    {
      "concern": "<preoccupation>",
      "severity": "critical" | "high" | "medium" | "low",
      "mitigation": "<comment mitiger si possible>"
    }
  ],
  "wouldChangeVerdict": [
    "<element qui te ferait changer d'avis>"
  ]
}
\`\`\``;
  }

  private buildDebatePrompt(
    input: BoardInput,
    ownAnalysis: InitialAnalysis,
    othersAnalyses: { memberId: string; memberName: string; analysis: InitialAnalysis }[],
    roundNumber: number
  ): string {
    const formattedInput = this.formatInputForLLM(input);

    const othersSection = othersAnalyses
      .map(
        (o) => `
### ${o.memberName}
- Verdict: ${o.analysis.verdict} (${o.analysis.confidence}% confiance)
- Arguments principaux:
${o.analysis.arguments.map((a) => `  * [${a.strength}] ${a.point}`).join("\n")}
- Concerns:
${o.analysis.concerns.map((c) => `  * [${c.severity}] ${c.concern}`).join("\n")}
`
      )
      .join("\n");

    return `ROUND DE DEBAT ${roundNumber}

## RAPPEL DU DEAL
${formattedInput}

---

## TON ANALYSE INITIALE
- Verdict: ${ownAnalysis.verdict} (${ownAnalysis.confidence}% confiance)
- Arguments: ${ownAnalysis.arguments.map((a) => a.point).join("; ")}
- Concerns: ${ownAnalysis.concerns.map((c) => c.concern).join("; ")}

---

## ANALYSES DES AUTRES MEMBRES
${othersSection}

---

INSTRUCTIONS:
1. Lis attentivement les analyses des autres
2. Evalue si leurs arguments sont convaincants
3. Si tu es convaincu, change de position et explique pourquoi
4. Reponds aux points specifiques des autres membres
5. Ajoute de nouveaux points si pertinent

Reponds en JSON:
\`\`\`json
{
  "positionChanged": <boolean>,
  "newVerdict": "<si change: GO | NO_GO | NEED_MORE_INFO>",
  "newConfidence": <si change: 0-100>,
  "justification": "<explication de ta position actuelle>",
  "responsesToOthers": [
    {
      "targetMemberId": "<id du membre>",
      "pointAddressed": "<point auquel tu reponds>",
      "response": "<ta reponse>",
      "agreement": "agree" | "disagree" | "partially_agree"
    }
  ],
  "newPoints": [
    {
      "point": "<nouveau point>",
      "evidence": "<preuve>"
    }
  ]
}
\`\`\``;
  }

  private buildVotePrompt(
    input: BoardInput,
    debateHistory: {
      roundNumber: number;
      responses: { memberId: string; memberName: string; response: DebateResponse }[];
    }[]
  ): string {
    const formattedInput = this.formatInputForLLM(input);

    const debateSection = debateHistory
      .map(
        (round) => `
### Round ${round.roundNumber}
${round.responses
  .map(
    (r) => `
**${r.memberName}**: ${r.response.justification}
${r.response.positionChanged ? `(A CHANGE de position vers ${r.response.newVerdict})` : ""}
`
  )
  .join("")}
`
      )
      .join("\n");

    return `VOTE FINAL

## RAPPEL DU DEAL
${formattedInput}

---

## HISTORIQUE DU DEBAT
${debateSection}

---

INSTRUCTIONS:
C'est le moment du vote final. Apres avoir ecoute tous les debats, donne ton verdict definitif.

Reponds en JSON:
\`\`\`json
{
  "verdict": "GO" | "NO_GO" | "NEED_MORE_INFO",
  "confidence": <0-100>,
  "justification": "<justification finale>",
  "keyFactors": [
    {
      "factor": "<facteur de decision>",
      "weight": "high" | "medium" | "low",
      "direction": "positive" | "negative" | "neutral"
    }
  ],
  "agreementPoints": [
    "<point sur lequel tu es d'accord avec les autres>"
  ],
  "remainingConcerns": [
    "<concern qui persiste meme si tu votes GO>"
  ]
}
\`\`\``;
  }

  private formatInputForLLM(input: BoardInput): string {
    const sections: string[] = [];

    // Basic info
    sections.push(`# DEAL: ${input.dealName}
Entreprise: ${input.companyName}
`);

    // Documents
    if (input.documents.length > 0) {
      sections.push(`## DOCUMENTS ANALYSES
${input.documents
  .map(
    (d) => `### ${d.name} (${d.type})
${d.extractedText ? d.extractedText.substring(0, 5000) + (d.extractedText.length > 5000 ? "\n[...tronque...]" : "") : "[Pas de texte extrait]"}`
  )
  .join("\n\n")}`);
    }

    // Agent outputs
    if (input.agentOutputs.tier1) {
      sections.push(`## RESULTATS TIER 1 (Screening)
${JSON.stringify(input.agentOutputs.tier1, null, 2)}`);
    }

    if (input.agentOutputs.tier2) {
      sections.push(`## RESULTATS TIER 2 (Deep Analysis)
${JSON.stringify(input.agentOutputs.tier2, null, 2)}`);
    }

    if (input.agentOutputs.tier3) {
      sections.push(`## RESULTATS TIER 3 (Expert Sector)
${JSON.stringify(input.agentOutputs.tier3, null, 2)}`);
    }

    // Enriched data
    if (input.enrichedData) {
      sections.push(`## DONNEES ENRICHIES (Context Engine)
${JSON.stringify(input.enrichedData, null, 2)}`);
    }

    // Sources
    if (input.sources.length > 0) {
      sections.push(`## SOURCES
${input.sources.map((s) => `- ${s.source} [${s.reliability}]: ${s.dataPoints.join(", ")}`).join("\n")}`);
    }

    return sections.join("\n\n---\n\n");
  }

  private timeout<T>(ms: number, message: string): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  }
}
