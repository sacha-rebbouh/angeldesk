import { MODELS, type ModelKey } from "@/services/openrouter/client";
import { complete, setAgentContext, completeJSON } from "@/services/openrouter/router";
import { sanitizeName, sanitizeDocumentText, sanitizeForLLM } from "@/lib/sanitize";
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
  readonly provider: "anthropic" | "openai" | "google" | "mistral";

  private totalCost = 0;

  constructor(config: BoardMemberConfig) {
    this.id = config.id;
    this.modelKey = config.modelKey;
    this.name = config.name;
    this.color = config.color;
    this.provider = config.provider;
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
    const providerNames: Record<string, string> = {
      anthropic: "Anthropic (Claude)",
      openai: "OpenAI (GPT)",
      google: "Google (Gemini)",
      mistral: "Mistral AI",
    };

    return `Tu es un Senior Investment Analyst participant a un Board d'Investissement IA multi-modeles.

## CONTEXTE UNIQUE
Tu es ${this.name}, un LLM de ${providerNames[this.provider]}. Tu fais partie d'un comite de 4 modeles IA differents (Claude, GPT, Gemini, Mistral) qui analysent le meme deal en parallele.

La valeur de ce board reside dans la DIVERSITE des perspectives:
- Chaque modele a ete entraine differemment
- Chaque modele peut voir des patterns que les autres ratent
- Les points de CONVERGENCE indiquent une forte confiance
- Les points de DIVERGENCE meritent une attention particuliere

## TON ROLE
Tu es un analyste senior avec 15+ ans d'experience en venture capital. Tu dois:
1. Analyser objectivement le deal avec tes propres capacites de raisonnement
2. Former un verdict independant (GO / NO_GO / NEED_MORE_INFO)
3. Justifier chaque position avec des preuves concretes du deck ou des donnees
4. Debattre honnetement avec les autres modeles - changer d'avis si convaincu
5. Signaler ce que TU vois que les autres pourraient manquer

## CRITERES D'EVALUATION (par ordre d'importance)
1. **Equipe** (40%) - Experience, complementarite, track record, engagement
2. **Marche** (25%) - TAM/SAM/SOM, croissance, timing, concurrence
3. **Produit** (20%) - PMF, differenciation, moat, traction
4. **Financiers** (10%) - Unit economics, valorisation, terms, runway
5. **Risques** (5%) - Red flags critiques, dealbreakers potentiels

## REGLES ABSOLUES
- Sois HONNETE sur ce que tu vois, meme si ca contredit les autres
- Source CHAQUE affirmation (page du deck, donnee specifique)
- Si une info manque, dis-le clairement
- Confiance = fonction de la qualite des donnees disponibles

FORMAT: Toujours repondre en JSON valide.`;
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

    // Basic info - SANITIZED to prevent prompt injection
    const safeDealName = sanitizeName(input.dealName);
    const safeCompanyName = sanitizeName(input.companyName);

    sections.push(`# DEAL: ${safeDealName}
Entreprise: ${safeCompanyName}
`);

    // Documents - SANITIZED with smart truncation
    if (input.documents.length > 0) {
      // Calculate per-document limit based on number of docs (total ~10K chars for docs)
      const perDocLimit = Math.floor(10000 / Math.max(input.documents.length, 1));

      sections.push(`## DOCUMENTS ANALYSES
${input.documents
  .map(
    (d) => `### ${sanitizeName(d.name)} (${d.type})
${sanitizeDocumentText(d.extractedText, perDocLimit)}`
  )
  .join("\n\n")}`);
    }

    // Agent outputs - NO pretty print (saves ~30% tokens)
    if (input.agentOutputs.tier1) {
      sections.push(`## RESULTATS TIER 1 (Screening)
${JSON.stringify(input.agentOutputs.tier1)}`);
    }

    if (input.agentOutputs.tier2) {
      sections.push(`## RESULTATS TIER 2 (Sector Expert)
${JSON.stringify(input.agentOutputs.tier2)}`);
    }

    if (input.agentOutputs.tier3) {
      sections.push(`## RESULTATS TIER 3 (Synthesis)
${JSON.stringify(input.agentOutputs.tier3)}`);
    }

    // Fact Store - Pre-formatted text is already optimized
    if (input.agentOutputs.factStore?.formatted) {
      sections.push(`## FACT STORE (Verified Facts)
${input.agentOutputs.factStore.formatted}`);
    }

    // Enriched data - NO pretty print, sanitized to prevent injection
    if (input.enrichedData) {
      const sanitizedEnrichedData = sanitizeForLLM(JSON.stringify(input.enrichedData));
      sections.push(`## DONNEES ENRICHIES (Context Engine)
${sanitizedEnrichedData}`);
    }

    // Sources - sanitized to prevent injection
    if (input.sources.length > 0) {
      sections.push(`## SOURCES
${input.sources.map((s) => `- ${sanitizeName(s.source)} [${s.reliability}]: ${s.dataPoints.map(dp => sanitizeForLLM(dp)).join(", ")}`).join("\n")}`);
    }

    return sections.join("\n\n---\n\n");
  }

  private timeout<T>(ms: number, message: string): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  }
}
