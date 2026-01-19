import { BaseAgent } from "../base-agent";
import type { EnrichedAgentContext, QuestionMasterResult, QuestionMasterData } from "../types";

/**
 * Question Master Agent
 *
 * Mission: Generer les questions critiques a poser aux fondateurs et les points de negociation.
 * C'est l'agent qui transforme toute l'analyse en actions concretes pour le BA.
 */

interface LLMQuestionMasterResponse {
  founderQuestions: {
    question: string;
    category: string;
    priority: string;
    redFlagTrigger?: string;
    expectedAnswer?: string;
  }[];
  referenceCheckQuestions: {
    target: string;
    questions: string[];
  }[];
  diligenceChecklist: {
    category: string;
    items: {
      item: string;
      status: string;
      criticalPath: boolean;
    }[];
  }[];
  negotiationPoints: {
    point: string;
    leverage: string;
    suggestedApproach: string;
  }[];
  dealbreakers: string[];
  topPriorities: string[];
}

export class QuestionMasterAgent extends BaseAgent<QuestionMasterData, QuestionMasterResult> {
  constructor() {
    super({
      name: "question-master",
      description: "Genere les questions critiques et points de negociation",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 90000,
    });
  }

  protected buildSystemPrompt(): string {
    return `Tu es un investisseur VC senior avec 20+ ans d'experience en due diligence.

TON ROLE:
- Generer les questions CRITIQUES a poser aux fondateurs
- Preparer les reference checks
- Creer une checklist de DD actionnable
- Identifier les points de negociation

CATEGORIES DE QUESTIONS:
1. VISION: Ou voyez-vous l'entreprise dans 5 ans?
2. EXECUTION: Comment allez-vous atteindre X? Quels obstacles?
3. TEAM: Pourquoi vous? Qui manque?
4. MARKET: Pourquoi maintenant? Qui sont vos vrais concurrents?
5. FINANCIALS: Comment justifiez-vous cette valo?
6. RISK: Qu'est-ce qui pourrait tuer la boite?

REFERENCE CHECKS:
- Anciens collegues/managers
- Clients (si possible)
- Investisseurs precedents
- Ex-employes (avec prudence)

POINTS DE NEGOCIATION (BA):
- Valorisation (vs benchmarks)
- Pro-rata rights
- Information rights
- Board observer
- Anti-dilution (rare pour BA)

PRIORITE DES QUESTIONS:
- must_ask: Bloquant si pas de reponse satisfaisante
- should_ask: Important pour la these d'investissement
- nice_to_have: Contexte additionnel

OUTPUT: JSON structure uniquement.`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<QuestionMasterData> {
    const dealContext = this.formatDealContext(context);
    const contextEngineData = this.formatContextEngineData(context);

    // Get previous results to generate targeted questions
    const previousResults = context.previousResults ?? {};
    let analysisContext = "";

    // Summarize key findings from other agents
    const agentSummaries: string[] = [];
    for (const [agentName, result] of Object.entries(previousResults)) {
      if (result?.success && "data" in result) {
        const data = result.data as Record<string, unknown>;
        // Extract key concerns/red flags
        if (data.redFlags && Array.isArray(data.redFlags) && data.redFlags.length > 0) {
          agentSummaries.push(`${agentName}: Red flags - ${(data.redFlags as string[]).slice(0, 3).join(", ")}`);
        }
        if (data.criticalIssues && Array.isArray(data.criticalIssues) && data.criticalIssues.length > 0) {
          agentSummaries.push(`${agentName}: Issues critiques - ${(data.criticalIssues as string[]).slice(0, 3).join(", ")}`);
        }
        if (data.concerns && Array.isArray(data.concerns) && data.concerns.length > 0) {
          agentSummaries.push(`${agentName}: Concerns - ${(data.concerns as string[]).slice(0, 3).join(", ")}`);
        }
      }
    }

    if (agentSummaries.length > 0) {
      analysisContext = `\n## Points d'attention des autres agents\n${agentSummaries.join("\n")}`;
    }

    const prompt = `Base sur toute l'analyse DD, genere les questions et actions prioritaires:

${dealContext}
${analysisContext}
${contextEngineData}

Genere les questions et la checklist.

Reponds en JSON avec cette structure exacte:
\`\`\`json
{
  "founderQuestions": [
    {
      "question": "string",
      "category": "vision|execution|team|market|financials|risk",
      "priority": "must_ask|should_ask|nice_to_have",
      "redFlagTrigger": "string (reponse qui serait un red flag)",
      "expectedAnswer": "string (bonne reponse attendue)"
    }
  ],
  "referenceCheckQuestions": [
    {
      "target": "customer|former_employee|investor|industry_expert",
      "questions": ["string"]
    }
  ],
  "diligenceChecklist": [
    {
      "category": "string",
      "items": [
        {
          "item": "string",
          "status": "not_started|in_progress|completed|blocked",
          "criticalPath": boolean
        }
      ]
    }
  ],
  "negotiationPoints": [
    {
      "point": "string (ex: valorisation trop elevee)",
      "leverage": "string (argument pour negocier)",
      "suggestedApproach": "string"
    }
  ],
  "dealbreakers": ["string (conditions qui tueraient le deal)"],
  "topPriorities": ["string (3-5 priorites absolues pour la DD)"]
}
\`\`\`

IMPORTANT:
- 10-15 founderQuestions, dont 3-5 must_ask
- Chaque point de negociation doit avoir un leverage concret
- Dealbreakers = conditions non-negociables
- TopPriorities = les 3-5 choses a valider en premier`;

    const { data } = await this.llmCompleteJSON<LLMQuestionMasterResponse>(prompt);

    const validCategories = ["vision", "execution", "team", "market", "financials", "risk"];
    const validPriorities = ["must_ask", "should_ask", "nice_to_have"];
    const validTargets = ["customer", "former_employee", "investor", "industry_expert"];
    const validStatuses = ["not_started", "in_progress", "completed", "blocked"];

    return {
      founderQuestions: Array.isArray(data.founderQuestions)
        ? data.founderQuestions.map((q) => ({
            question: q.question ?? "",
            category: validCategories.includes(q.category)
              ? (q.category as "vision" | "execution" | "team" | "market" | "financials" | "risk")
              : "execution",
            priority: validPriorities.includes(q.priority)
              ? (q.priority as "must_ask" | "should_ask" | "nice_to_have")
              : "should_ask",
            redFlagTrigger: q.redFlagTrigger,
            expectedAnswer: q.expectedAnswer,
          }))
        : [],
      referenceCheckQuestions: Array.isArray(data.referenceCheckQuestions)
        ? data.referenceCheckQuestions.map((r) => ({
            target: validTargets.includes(r.target)
              ? (r.target as "customer" | "former_employee" | "investor" | "industry_expert")
              : "customer",
            questions: Array.isArray(r.questions) ? r.questions : [],
          }))
        : [],
      diligenceChecklist: Array.isArray(data.diligenceChecklist)
        ? data.diligenceChecklist.map((c) => ({
            category: c.category ?? "",
            items: Array.isArray(c.items)
              ? c.items.map((i) => ({
                  item: i.item ?? "",
                  status: validStatuses.includes(i.status)
                    ? (i.status as "not_started" | "in_progress" | "completed" | "blocked")
                    : "not_started",
                  criticalPath: i.criticalPath ?? false,
                }))
              : [],
          }))
        : [],
      negotiationPoints: Array.isArray(data.negotiationPoints)
        ? data.negotiationPoints.map((n) => ({
            point: n.point ?? "",
            leverage: n.leverage ?? "",
            suggestedApproach: n.suggestedApproach ?? "",
          }))
        : [],
      dealbreakers: Array.isArray(data.dealbreakers) ? data.dealbreakers : [],
      topPriorities: Array.isArray(data.topPriorities) ? data.topPriorities : [],
    };
  }
}

export const questionMaster = new QuestionMasterAgent();
