/**
 * DealChatAgent - Conversational AI for Business Angels
 *
 * A conversational agent that allows Business Angels to discuss their deal analysis.
 * Uses the pre-computed chat context (facts, agent summaries, red flags) to provide
 * intelligent, sourced responses about the deal.
 *
 * Architecture:
 * - Built on BaseAgent patterns for consistency
 * - Uses llmCompleteJSONStreaming for structured responses
 * - Inline intent classification (no separate file)
 * - Sources cited for all claims
 */

import { BaseAgent, type AgentResultWithData } from "../base-agent";
import type { AgentConfig, AgentResult } from "../types";
import type {
  DealChatContextData,
  KeyFact,
  AgentSummary,
  RedFlagContext,
} from "@/services/chat-context";
import { sanitizeForLLM } from "@/lib/sanitize";
import {
  retrieveContext,
  type RetrievedContext,
  type ChatIntent as RetrieverChatIntent,
} from "./context-retriever";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Intent types for user messages
 */
export type ChatIntent =
  | "CLARIFICATION" // User wants more details on a specific finding
  | "COMPARISON" // User wants to compare deal to benchmarks/competitors
  | "SIMULATION" // User wants to simulate scenarios (what if X?)
  | "DEEP_DIVE" // User wants deep analysis on a specific topic
  | "FOLLOW_UP" // User follows up on a previous answer
  | "NEGOTIATION" // User wants negotiation advice/arguments
  | "GENERAL"; // General question about the deal

/**
 * Source reference in responses
 */
export interface SourceReference {
  type: "fact" | "agent" | "red_flag" | "document" | "benchmark" | "calculation";
  reference: string;
  confidence?: number;
}

/**
 * Chat response structure
 */
export interface ChatResponse {
  response: string;
  intent: ChatIntent;
  intentConfidence: number;
  sourcesUsed: SourceReference[];
  suggestedFollowUps?: string[];
}

/**
 * Message in conversation history
 */
export interface Message {
  role: "user" | "assistant";
  content: string;
}

/**
 * Full context for chat generation
 */
export interface FullChatContext {
  // Deal basic info
  deal: {
    id: string;
    name: string;
    companyName?: string | null;
    sector?: string | null;
    stage?: string | null;
    geography?: string | null;
    description?: string | null;
    website?: string | null;
    arr?: number | null;
    growthRate?: number | null;
    amountRequested?: number | null;
    valuationPre?: number | null;
    globalScore?: number | null;
    teamScore?: number | null;
    marketScore?: number | null;
    productScore?: number | null;
    financialsScore?: number | null;
    founders?: Array<{ name: string; role: string }>;
  };

  // Pre-computed chat context
  chatContext: DealChatContextData | null;

  // Document summaries
  documents: Array<{
    id: string;
    name: string;
    type: string;
    isProcessed: boolean;
  }>;

  // Latest analysis info
  latestAnalysis: {
    id: string;
    mode: string;
    summary: string | null;
    completedAt: Date | null;
    hasResults: boolean;
  } | null;
}

/**
 * LLM response structure for chat
 */
interface LLMChatResponse {
  response: string;
  intent: ChatIntent;
  intentConfidence: number;
  sourcesUsed: Array<{
    type: "fact" | "agent" | "red_flag" | "document" | "benchmark" | "calculation";
    reference: string;
    confidence?: number;
  }>;
  suggestedFollowUps: string[];
}

/**
 * LLM response for intent classification
 */
interface LLMIntentResponse {
  intent: ChatIntent;
  confidence: number;
  reasoning: string;
}

// ============================================================================
// AGENT CLASS
// ============================================================================

export class DealChatAgent extends BaseAgent<ChatResponse, AgentResultWithData<ChatResponse>> {
  // Chat-specific context (not using AgentContext)
  private chatContext: FullChatContext | null = null;
  private conversationHistory: Message[] = [];
  private currentUserMessage: string = "";

  constructor() {
    super({
      name: "deal-chat",
      description: "Conversational AI agent for discussing deal analysis with Business Angels",
      modelComplexity: "medium", // Sonnet for quality + speed balance
      maxRetries: 2,
      timeoutMs: 60000, // 60s timeout for chat responses
      dependencies: [], // No dependencies - uses pre-computed context
    });
  }

  /**
   * Build system prompt for the chat agent
   */
  protected buildSystemPrompt(): string {
    return `# ROLE

Tu es un analyste d'investissement senior specialise dans l'accompagnement de Business Angels.
Tu as 15+ ans d'experience en Venture Capital et as analyse 500+ deals.
Tu combines rigueur analytique et pedagogie pour aider les BA a prendre des decisions eclairees.

# MISSION

Aider le Business Angel a comprendre et exploiter l'analyse de son deal:
- Repondre aux questions avec precision et sources
- Expliquer les red flags et leurs implications
- Fournir des arguments de negociation
- Suggerer des questions a poser au fondateur

# PRINCIPES

1. **Toujours sourcer** - Chaque affirmation doit citer sa source (fait extrait, agent, red flag)
2. **Etre actionnable** - Le BA doit pouvoir agir sur tes reponses
3. **Etre concis** - Reponses directes, pas de bavardage
4. **Etre honnete** - Si une info manque, le dire clairement
5. **Etre pedagogue** - Expliquer les concepts VC si necessaire

# FORMAT DE REPONSE

- Reponses en francais (sauf termes techniques anglais standard)
- Markdown pour la structure (titres, listes, gras)
- Citations entre guillemets avec source
- Calculs montres si pertinent

# LIMITES

- Tu ne peux pas acceder a des donnees externes en temps reel
- Tu te bases uniquement sur les donnees de l'analyse
- Tu ne fais pas de predictions de succes/echec
- Tu ne donnes pas de conseil d'investissement definitif (decision finale = BA)`;
  }

  /**
   * Build context prompt with deal data, facts, and agent results
   */
  private buildContextPrompt(): string {
    if (!this.chatContext) return "";

    const { deal, chatContext, documents, latestAnalysis } = this.chatContext;

    let contextPrompt = `# CONTEXTE DU DEAL

## Informations de base
- **Nom**: ${deal.name}
- **Entreprise**: ${deal.companyName ?? "Non specifie"}
- **Secteur**: ${deal.sector ?? "Non specifie"}
- **Stage**: ${deal.stage ?? "Non specifie"}
- **Geographie**: ${deal.geography ?? "Non specifie"}
- **Site web**: ${deal.website ?? "Non specifie"}

## Metriques financieres
- **ARR**: ${deal.arr ? `${this.formatMoneyValue(Number(deal.arr))}` : "Non specifie"}
- **Croissance**: ${deal.growthRate ? `${Number(deal.growthRate)}%` : "Non specifie"}
- **Montant demande**: ${deal.amountRequested ? `${this.formatMoneyValue(Number(deal.amountRequested))}` : "Non specifie"}
- **Valorisation pre-money**: ${deal.valuationPre ? `${this.formatMoneyValue(Number(deal.valuationPre))}` : "Non specifie"}

## Scores d'analyse (si disponibles)
- **Score global**: ${deal.globalScore ?? "Non calcule"}/100
- **Equipe**: ${deal.teamScore ?? "-"}/100
- **Marche**: ${deal.marketScore ?? "-"}/100
- **Produit**: ${deal.productScore ?? "-"}/100
- **Financials**: ${deal.financialsScore ?? "-"}/100

## Fondateurs
${deal.founders && deal.founders.length > 0
  ? deal.founders.map((f) => `- **${f.name}** (${f.role})`).join("\n")
  : "Non renseigne"}

## Documents analyses
${documents.map((d) => `- ${d.name} (${d.type}) - ${d.isProcessed ? "Analyse" : "En attente"}`).join("\n")}
`;

    // Add chat context if available
    if (chatContext) {
      // Key facts
      if (chatContext.keyFacts && chatContext.keyFacts.length > 0) {
        contextPrompt += `\n## Faits cles extraits\n`;
        const factsByCategory = this.groupFactsByCategory(chatContext.keyFacts);
        for (const [category, facts] of Object.entries(factsByCategory)) {
          contextPrompt += `\n### ${category}\n`;
          for (const fact of facts.slice(0, 10)) {
            const confidenceIcon = fact.confidence >= 80 ? "✓" : fact.confidence >= 50 ? "~" : "?";
            contextPrompt += `- ${confidenceIcon} **${fact.factKey}**: ${fact.displayValue} (source: ${fact.source}, conf: ${fact.confidence}%)\n`;
          }
        }
      }

      // Agent summaries
      if (chatContext.agentSummaries && Object.keys(chatContext.agentSummaries).length > 0) {
        contextPrompt += `\n## Resultats des agents d'analyse\n`;
        for (const [agentName, summary] of Object.entries(chatContext.agentSummaries)) {
          contextPrompt += `\n### ${this.formatAgentName(agentName)}\n`;
          if (summary.summary) {
            contextPrompt += `${summary.summary}\n`;
          }
          if (summary.score !== undefined) {
            contextPrompt += `**Score**: ${summary.score}/100\n`;
          }
          if (summary.keyFindings && summary.keyFindings.length > 0) {
            contextPrompt += `**Points cles**:\n`;
            for (const finding of summary.keyFindings) {
              contextPrompt += `- ${finding}\n`;
            }
          }
          if (summary.redFlags && summary.redFlags.length > 0) {
            contextPrompt += `**Red flags detectes**: ${summary.redFlags.length}\n`;
          }
        }
      }

      // Red flags
      if (chatContext.redFlagsContext && chatContext.redFlagsContext.length > 0) {
        contextPrompt += `\n## Red Flags detectes (${chatContext.redFlagsContext.length})\n`;
        for (const rf of chatContext.redFlagsContext) {
          contextPrompt += `\n### [${rf.severity}] ${rf.title}\n`;
          contextPrompt += `**Categorie**: ${rf.category}\n`;
          contextPrompt += `**Description**: ${rf.description}\n`;
          if (rf.questionsToAsk && rf.questionsToAsk.length > 0) {
            contextPrompt += `**Questions a poser**:\n`;
            for (const q of rf.questionsToAsk) {
              contextPrompt += `- ${q}\n`;
            }
          }
        }
      }
    }

    // Analysis info
    if (latestAnalysis) {
      contextPrompt += `\n## Derniere analyse\n`;
      contextPrompt += `- **Mode**: ${latestAnalysis.mode}\n`;
      contextPrompt += `- **Date**: ${latestAnalysis.completedAt?.toLocaleDateString("fr-FR") ?? "N/A"}\n`;
      if (latestAnalysis.summary) {
        contextPrompt += `- **Resume**: ${latestAnalysis.summary}\n`;
      }
    }

    return contextPrompt;
  }

  /**
   * Build conversation history for LLM
   * Sanitizes each message content to prevent prompt injection
   */
  private buildConversationHistory(): string {
    if (this.conversationHistory.length === 0) return "";

    let history = "\n## Historique de la conversation\n";
    for (const msg of this.conversationHistory.slice(-10)) {
      // Last 10 messages max
      const role = msg.role === "user" ? "Utilisateur" : "Assistant";
      // Sanitize message content to prevent prompt injection from history
      const sanitizedContent = sanitizeForLLM(msg.content, {
        maxLength: 5000,
        preserveNewlines: true,
        warnOnSuspicious: true,
      });
      history += `\n**${role}**: ${sanitizedContent}\n`;
    }

    return history;
  }

  /**
   * Build prompt from retrieved context (smart DB retrieval based on intent)
   * This provides FULL data from the database, not summaries
   */
  private buildRetrievedContextPrompt(retrievedCtx: RetrievedContext): string {
    const sections: string[] = [];

    // Facts from Fact Store (full data, not summaries)
    if (retrievedCtx.facts.length > 0) {
      let factsSection = "## FAITS EXTRAITS (Fact Store - Données complètes)\n";
      const factsByCategory: Record<string, typeof retrievedCtx.facts> = {};
      for (const fact of retrievedCtx.facts) {
        if (!factsByCategory[fact.category]) {
          factsByCategory[fact.category] = [];
        }
        factsByCategory[fact.category].push(fact);
      }
      for (const [category, facts] of Object.entries(factsByCategory)) {
        factsSection += `\n### ${category}\n`;
        for (const fact of facts) {
          const confIcon = fact.confidence >= 80 ? "✓" : fact.confidence >= 50 ? "~" : "?";
          factsSection += `- ${confIcon} **${fact.key}**: ${fact.value} [source: ${fact.source}, conf: ${fact.confidence}%]\n`;
        }
      }
      sections.push(factsSection);
    }

    // Agent results (full analysis results, not summaries)
    if (retrievedCtx.agentResults.length > 0) {
      let agentsSection = "## RÉSULTATS D'AGENTS (Analyses complètes)\n";
      for (const result of retrievedCtx.agentResults) {
        agentsSection += `\n### ${this.formatAgentName(result.agent)}\n`;
        if (result.summary) {
          agentsSection += `**Résumé**: ${result.summary}\n`;
        }
        if (result.score !== undefined) {
          agentsSection += `**Score**: ${result.score}/100\n`;
        }
        if (result.confidence !== undefined) {
          agentsSection += `**Confiance**: ${result.confidence}%\n`;
        }
        if (result.findings.length > 0) {
          agentsSection += `**Findings**:\n`;
          for (const finding of result.findings) {
            agentsSection += `- ${finding}\n`;
          }
        }
      }
      sections.push(agentsSection);
    }

    // Red flags (full details)
    if (retrievedCtx.redFlags.length > 0) {
      let redFlagsSection = `## RED FLAGS (${retrievedCtx.redFlags.length} détectés)\n`;
      for (const rf of retrievedCtx.redFlags) {
        redFlagsSection += `\n### [${rf.severity.toUpperCase()}] ${rf.title}\n`;
        redFlagsSection += `**Catégorie**: ${rf.category}\n`;
        redFlagsSection += `**Description**: ${rf.description}\n`;
        if (rf.questionsToAsk.length > 0) {
          redFlagsSection += `**Questions à poser**:\n`;
          for (const q of rf.questionsToAsk) {
            redFlagsSection += `- ${q}\n`;
          }
        }
      }
      sections.push(redFlagsSection);
    }

    // Benchmarks (for comparison/negotiation intents)
    if (retrievedCtx.benchmarks) {
      let benchSection = `## BENCHMARKS (${retrievedCtx.benchmarks.sector}`;
      if (retrievedCtx.benchmarks.stage) {
        benchSection += ` - ${retrievedCtx.benchmarks.stage}`;
      }
      benchSection += `)\n`;
      const metrics = retrievedCtx.benchmarks.metrics;
      for (const [metricName, metricData] of Object.entries(metrics)) {
        if (typeof metricData === "object" && metricData !== null) {
          const m = metricData as Record<string, unknown>;
          if (m.p25 !== undefined && m.median !== undefined && m.p75 !== undefined) {
            benchSection += `- **${metricName}**: P25=${m.p25}, Median=${m.median}, P75=${m.p75}\n`;
          } else {
            benchSection += `- **${metricName}**: ${JSON.stringify(metricData)}\n`;
          }
        }
      }
      sections.push(benchSection);
    }

    // Documents (for clarification/deep-dive intents)
    if (retrievedCtx.documents && retrievedCtx.documents.length > 0) {
      let docsSection = "## DOCUMENTS DISPONIBLES\n";
      for (const doc of retrievedCtx.documents) {
        docsSection += `- **${doc.name}** (${doc.type})`;
        if (doc.relevantExcerpt) {
          docsSection += `\n  Extrait pertinent: "${doc.relevantExcerpt.slice(0, 500)}..."`;
        }
        docsSection += "\n";
      }
      sections.push(docsSection);
    }

    // Conversation history (for follow-up intents)
    if (retrievedCtx.conversationHistory && retrievedCtx.conversationHistory.length > 0) {
      let historySection = "## HISTORIQUE CONVERSATION (pour contexte)\n";
      for (const msg of retrievedCtx.conversationHistory.slice(-5)) {
        const role = msg.role === "user" ? "Utilisateur" : "Assistant";
        historySection += `**${role}**: ${msg.content.slice(0, 500)}${msg.content.length > 500 ? "..." : ""}\n\n`;
      }
      sections.push(historySection);
    }

    if (sections.length === 0) {
      return "";
    }

    return `\n# DONNÉES RÉCUPÉRÉES DE LA BASE (Intent-specific)\n\n${sections.join("\n")}`;
  }

  /**
   * Format agent name for display
   */
  private formatAgentName(agentName: string): string {
    const nameMap: Record<string, string> = {
      "financial-auditor": "Audit Financier",
      "deck-forensics": "Forensics Deck",
      "team-investigator": "Investigation Equipe",
      "market-intelligence": "Intelligence Marche",
      "competitive-intel": "Intelligence Concurrentielle",
      "exit-strategist": "Strategie Exit",
      "tech-stack-dd": "Due Diligence Tech Stack",
      "tech-ops-dd": "Due Diligence Tech Ops",
      "legal-regulatory": "Legal & Reglementaire",
      "gtm-analyst": "Analyse GTM",
      "customer-intel": "Intelligence Clients",
      "cap-table-auditor": "Audit Cap Table",
      "question-master": "Questions Prioritaires",
    };
    return nameMap[agentName] ?? agentName;
  }

  /**
   * Format money value for display
   */
  private formatMoneyValue(value: number): string {
    if (value >= 1_000_000_000) {
      return `${(value / 1_000_000_000).toFixed(1)}Mds EUR`;
    }
    if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1)}M EUR`;
    }
    if (value >= 1_000) {
      return `${(value / 1_000).toFixed(0)}K EUR`;
    }
    return `${value} EUR`;
  }

  /**
   * Group facts by category
   */
  private groupFactsByCategory(facts: KeyFact[]): Record<string, KeyFact[]> {
    const grouped: Record<string, KeyFact[]> = {};
    for (const fact of facts) {
      if (!grouped[fact.category]) {
        grouped[fact.category] = [];
      }
      grouped[fact.category].push(fact);
    }
    return grouped;
  }

  /**
   * Main execute method (required by BaseAgent but not used for chat)
   * Chat uses generateResponse() directly
   */
  protected async execute(): Promise<ChatResponse> {
    // This method is not used for chat - we use generateResponse() directly
    // But it's required by BaseAgent abstract class
    throw new Error("Use generateResponse() for chat interactions, not run()");
  }

  /**
   * Classify user intent
   * Sanitizes the message to prevent prompt injection
   */
  async classifyIntent(message: string): Promise<{ intent: ChatIntent; confidence: number }> {
    // Sanitize user message to prevent prompt injection
    const sanitizedMessage = sanitizeForLLM(message, {
      maxLength: 10000,
      preserveNewlines: true,
      warnOnSuspicious: true,
    });

    const intentPrompt = `Analyse cette question d'un Business Angel concernant un deal d'investissement.

Question: "${sanitizedMessage}"

Classifie l'intention parmi:
- CLARIFICATION: Demande plus de details sur un finding specifique
- COMPARISON: Veut comparer le deal aux benchmarks ou concurrents
- SIMULATION: Veut simuler des scenarios (que se passe-t-il si X?)
- DEEP_DIVE: Veut une analyse approfondie sur un sujet specifique
- FOLLOW_UP: Suite a une reponse precedente
- NEGOTIATION: Cherche des arguments de negociation
- GENERAL: Question generale sur le deal

Reponds en JSON:
{
  "intent": "INTENT_TYPE",
  "confidence": 0.0-1.0,
  "reasoning": "Explication courte"
}`;

    try {
      const { data } = await this.llmCompleteJSON<LLMIntentResponse>(intentPrompt, {
        temperature: 0.1,
        timeoutMs: 10000, // Quick classification
        model: "HAIKU", // Fast model for classification
      });

      return {
        intent: data.intent,
        confidence: data.confidence,
      };
    } catch (error) {
      // Fallback to GENERAL if classification fails
      console.warn("[DealChatAgent] Intent classification failed, defaulting to GENERAL:", error);
      return {
        intent: "GENERAL",
        confidence: 0.5,
      };
    }
  }

  /**
   * Generate response to user message
   * Main entry point for chat interactions
   * Sanitizes user input to prevent prompt injection
   */
  async generateResponse(
    userMessage: string,
    context: FullChatContext,
    history: Message[]
  ): Promise<ChatResponse> {
    const startTime = Date.now();

    // Sanitize user message to prevent prompt injection
    const sanitizedUserMessage = sanitizeForLLM(userMessage, {
      maxLength: 10000,
      preserveNewlines: true,
      warnOnSuspicious: true,
    });

    // Store context for this request
    this.chatContext = context;
    this.conversationHistory = history;
    this.currentUserMessage = sanitizedUserMessage;

    try {
      // Step 1: Classify intent (uses sanitized message internally)
      const { intent, confidence: intentConfidence } = await this.classifyIntent(userMessage);

      // Step 2: Retrieve intent-specific context from DB (SMART RETRIEVAL)
      let retrievedContextPrompt = "";
      try {
        const dealId = context.deal.id;
        const retrievedCtx = await retrieveContext(
          dealId,
          sanitizedUserMessage,
          intent as RetrieverChatIntent
        );
        retrievedContextPrompt = this.buildRetrievedContextPrompt(retrievedCtx);
        console.log(`[DealChatAgent] Retrieved context for intent ${intent}: ${retrievedCtx.facts.length} facts, ${retrievedCtx.agentResults.length} agent results, ${retrievedCtx.redFlags.length} red flags`);
      } catch (retrieveError) {
        console.warn("[DealChatAgent] Failed to retrieve context, continuing with basic context:", retrieveError);
      }

      // Step 3: Build full prompt
      const contextPrompt = this.buildContextPrompt();
      const historyPrompt = this.buildConversationHistory();
      const intentGuidance = this.getIntentGuidance(intent);

      const fullPrompt = `${contextPrompt}
${retrievedContextPrompt}
${historyPrompt}

# NOUVELLE QUESTION

**Question de l'utilisateur**: ${sanitizedUserMessage}

**Intent detecte**: ${intent} (confiance: ${Math.round(intentConfidence * 100)}%)

${intentGuidance}

# FORMAT DE REPONSE ATTENDU

Reponds en JSON avec cette structure:
{
  "response": "Ta reponse en markdown, detaillee et sourcee",
  "intent": "${intent}",
  "intentConfidence": ${intentConfidence},
  "sourcesUsed": [
    {"type": "fact|agent|red_flag|document|benchmark|calculation", "reference": "Description de la source", "confidence": 0.0-1.0}
  ],
  "suggestedFollowUps": ["Question de suivi suggeree 1", "Question 2", "Question 3"]
}

IMPORTANT:
- La reponse doit etre en francais
- Chaque affirmation majeure doit avoir une source dans sourcesUsed
- Les suggestedFollowUps doivent etre pertinents pour approfondir
- Si tu ne peux pas repondre (manque de donnees), dis-le clairement`;

      // Step 3: Generate response
      // Use non-streaming JSON completion (more reliable parsing)
      const { data } = await this.llmCompleteJSON<LLMChatResponse>(fullPrompt, {
        temperature: 0.4,
        timeoutMs: 45000,
        maxTokens: 16000,
      });

      const response: ChatResponse = {
        response: data.response,
        intent: data.intent,
        intentConfidence: data.intentConfidence,
        sourcesUsed: data.sourcesUsed,
        suggestedFollowUps: data.suggestedFollowUps,
      };

      const executionTimeMs = Date.now() - startTime;
      console.log(`[DealChatAgent] Response generated in ${executionTimeMs}ms, intent: ${intent}`);

      return response;
    } catch (error) {
      console.error("[DealChatAgent] Error generating response:", error);

      // Return a fallback response
      return {
        response: `Je suis desole, je n'ai pas pu traiter votre question. Erreur technique rencontree.

Pouvez-vous reformuler votre question ou essayer a nouveau?`,
        intent: "GENERAL",
        intentConfidence: 0,
        sourcesUsed: [],
        suggestedFollowUps: [
          "Quels sont les principaux red flags de ce deal?",
          "Resume-moi l'analyse financiere",
          "Quelles questions dois-je poser au fondateur?",
        ],
      };
    }
  }

  /**
   * Get guidance based on intent type
   */
  private getIntentGuidance(intent: ChatIntent): string {
    const guidance: Record<ChatIntent, string> = {
      CLARIFICATION: `# GUIDE POUR CLARIFICATION
- L'utilisateur veut plus de details sur un point specifique
- Explique en profondeur avec des exemples
- Cite les sources exactes (slide, agent, red flag)
- Montre les calculs si pertinent`,

      COMPARISON: `# GUIDE POUR COMPARISON
- L'utilisateur veut comparer le deal a des benchmarks ou concurrents
- Utilise les donnees de benchmark disponibles
- Presente les comparaisons de maniere structuree (tableau si possible)
- Indique le percentile du deal vs le marche`,

      SIMULATION: `# GUIDE POUR SIMULATION
- L'utilisateur veut explorer des scenarios
- Base-toi sur les donnees actuelles pour projeter
- Montre clairement les hypotheses utilisees
- Indique les limites de la simulation
- Presente les differents scenarios (optimiste, base, pessimiste)`,

      DEEP_DIVE: `# GUIDE POUR DEEP DIVE
- L'utilisateur veut une analyse approfondie
- Structure ta reponse avec des sous-sections
- Couvre tous les aspects du sujet demande
- Inclus des red flags specifiques a ce domaine
- Suggere des questions a poser au fondateur`,

      FOLLOW_UP: `# GUIDE POUR FOLLOW-UP
- L'utilisateur revient sur un point precedent
- Reference ta reponse precedente si pertinent
- Complete ou nuance ta reponse anterieure
- Reste coherent avec ce qui a ete dit`,

      NEGOTIATION: `# GUIDE POUR NEGOTIATION
- L'utilisateur cherche des arguments de negociation
- Identifie les points de levier (red flags, benchmarks)
- Formule des arguments precis et chiffres
- Suggere des points de negociation (valorisation, conditions, etc.)`,

      GENERAL: `# GUIDE POUR QUESTION GENERALE
- Reponds de maniere complete mais concise
- Couvre les aspects principaux du sujet
- Oriente vers les red flags pertinents si applicable
- Suggere des questions de suivi pour approfondir`,
    };

    return guidance[intent] ?? guidance.GENERAL;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const dealChatAgent = new DealChatAgent();
