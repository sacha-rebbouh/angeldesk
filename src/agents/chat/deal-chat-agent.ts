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
  type RetrievedScoredFinding,
  type RetrievedDebateRecord,
  type RetrievedBoardResult,
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
    founders?: Array<{
      name: string;
      role: string;
      linkedinUrl?: string | null;
      verifiedInfo?: unknown;
      previousVentures?: unknown;
    }>;
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

  // Investor level for adapting responses (F31)
  investorLevel?: "beginner" | "intermediate" | "expert";
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
   * Adapts tone and vocabulary based on investor level (F31)
   */
  protected buildSystemPrompt(): string {
    const level = this.chatContext?.investorLevel ?? "beginner";

    const levelInstructions: Record<string, string> = {
      beginner: `
# ADAPTATION AU NIVEAU

L'utilisateur est un **Business Angel debutant** (1-3 premiers deals).
- Explique TOUS les termes techniques (ARR, burn rate, runway, multiple, etc.)
- Utilise des analogies simples pour les concepts complexes
- Ne presuppose aucune connaissance VC
- Structure tes reponses en commencant par "En resume" avant les details
- Quand tu mentionnes un ratio ou un benchmark, explique ce qu'il signifie et pourquoi c'est important
- Exemple: au lieu de "Le burn multiple est de 3.2x", dis "Le burn multiple est de 3.2x, ce qui signifie que l'entreprise depense 3.2EUR pour generer 1EUR de nouveau revenu. Un bon ratio est en dessous de 2x."`,

      intermediate: `
# ADAPTATION AU NIVEAU

L'utilisateur est un **Business Angel intermediaire** (3-10 deals).
- Les termes de base sont acquis (ARR, burn, runway, cap table)
- Explique les concepts avances (liquidation preference, anti-dilution, MOIC vs IRR)
- Fournis des comparaisons avec d'autres deals similaires quand possible
- Focus sur les implications pratiques et les decisions a prendre`,

      expert: `
# ADAPTATION AU NIVEAU

L'utilisateur est un **investisseur experimente** (10+ deals ou ex-VC).
- Utilise le jargon VC librement
- Focus sur les insights non-evidents et les edge cases
- Fournis des analyses quantitatives detaillees
- Challenge les hypotheses si necessaire`,
    };

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
${levelInstructions[level] ?? levelInstructions.beginner}

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
- **ARR**: ${deal.arr != null ? `${this.formatMoneyValue(Number(deal.arr))}` : "Non specifie"}
- **Croissance**: ${deal.growthRate != null ? `${Number(deal.growthRate)}%` : "Non specifie"}
- **Montant demande**: ${deal.amountRequested != null ? `${this.formatMoneyValue(Number(deal.amountRequested))}` : "Non specifie"}
- **Valorisation pre-money**: ${deal.valuationPre != null ? `${this.formatMoneyValue(Number(deal.valuationPre))}` : "Non specifie"}

## Scores d'analyse (si disponibles)
- **Score global**: ${deal.globalScore ?? "Non calcule"}/100
- **Equipe**: ${deal.teamScore ?? "-"}/100
- **Marche**: ${deal.marketScore ?? "-"}/100
- **Produit**: ${deal.productScore ?? "-"}/100
- **Financials**: ${deal.financialsScore ?? "-"}/100

## Fondateurs
${deal.founders && deal.founders.length > 0
  ? deal.founders.map((f) => {
      let founderInfo = `- **${f.name}** (${f.role})`;
      if (f.linkedinUrl) {
        founderInfo += ` — LinkedIn: ${f.linkedinUrl}`;
      }
      const vi = f.verifiedInfo as Record<string, unknown> | null | undefined;
      if (vi) {
        // Profile basics
        if (vi.headline) founderInfo += `\n  - Tagline LinkedIn: "${vi.headline}"`;
        if (vi.summary) founderInfo += `\n  - Bio: ${String(vi.summary).slice(0, 500)}`;
        if (vi.city || vi.country) founderInfo += `\n  - Localisation: ${[vi.city, vi.country].filter(Boolean).join(", ")}`;
        if (vi.connections) founderInfo += `\n  - Connexions LinkedIn: ${vi.connections}`;

        // Full work history
        const experiences = vi.experiences as Array<Record<string, unknown>> | undefined;
        if (experiences && experiences.length > 0) {
          founderInfo += `\n  - Parcours professionnel (${experiences.length} postes):`;
          for (const exp of experiences) {
            const period = exp.isCurrent
              ? `${exp.startYear ?? "?"}–present`
              : `${exp.startYear ?? "?"}–${exp.endYear ?? "?"}`;
            founderInfo += `\n    - **${exp.title}** @ ${exp.company} (${period})`;
            if (exp.description) founderInfo += `\n      ${String(exp.description).slice(0, 200)}`;
          }
        }

        // Education
        const education = vi.education as Array<Record<string, unknown>> | undefined;
        if (education && education.length > 0) {
          founderInfo += `\n  - Formation:`;
          for (const edu of education) {
            const parts = [edu.degree, edu.fieldOfStudy].filter(Boolean).join(" - ");
            founderInfo += `\n    - ${edu.school}${parts ? ` (${parts})` : ""}${edu.endYear ? ` — ${edu.endYear}` : ""}`;
          }
        }

        // Skills
        const skills = vi.skills as string[] | undefined;
        if (skills && skills.length > 0) {
          founderInfo += `\n  - Competences: ${skills.slice(0, 15).join(", ")}`;
        }

        // Languages
        const languages = vi.languages as string[] | undefined;
        if (languages && languages.length > 0) {
          founderInfo += `\n  - Langues: ${languages.join(", ")}`;
        }

        // Highlights
        const hl = vi.highlights as Record<string, unknown> | undefined;
        if (hl) {
          if (hl.yearsExperience) founderInfo += `\n  - Annees d'experience: ${hl.yearsExperience} ans`;
          if (hl.hasRelevantIndustryExp) founderInfo += `\n  - Experience sectorielle pertinente: Oui`;
          if (hl.hasFounderExperience) founderInfo += `\n  - Experience fondateur/CEO: Oui`;
          if (hl.hasTechBackground) founderInfo += `\n  - Background technique: Oui`;
          if (hl.isSerialFounder) founderInfo += `\n  - Serial founder: Oui`;
        }

        // Expertise
        const expertise = vi.expertise as Record<string, unknown> | undefined;
        if (expertise) {
          if (expertise.description) founderInfo += `\n  - Expertise: ${expertise.description}`;
        }

        // Sector fit
        const sectorFit = vi.sectorFit as Record<string, unknown> | undefined;
        if (sectorFit) {
          founderInfo += `\n  - Adequation sectorielle: ${sectorFit.fits ? "Oui" : "Non"}`;
          if (sectorFit.explanation) founderInfo += ` — ${sectorFit.explanation}`;
        }

        // Red flags
        const redFlags = vi.redFlags as Array<Record<string, unknown>> | undefined;
        if (redFlags && redFlags.length > 0) {
          founderInfo += `\n  - Red flags profil:`;
          for (const rf of redFlags) {
            founderInfo += `\n    - [${rf.severity}] ${rf.message}`;
          }
        }

        // Questions
        const questions = vi.questionsToAsk as Array<Record<string, unknown>> | undefined;
        if (questions && questions.length > 0) {
          founderInfo += `\n  - Questions suggerees:`;
          for (const q of questions) {
            founderInfo += `\n    - ${q.question}${q.context ? ` (${q.context})` : ""}`;
          }
        }
      }
      // Previous ventures (from Prisma field)
      const ventures = f.previousVentures as Array<Record<string, unknown>> | undefined;
      if (ventures && ventures.length > 0) {
        founderInfo += `\n  - Ventures precedentes:`;
        for (const v of ventures) {
          founderInfo += `\n    - ${v.company ?? "?"} (${v.role ?? "?"}, ${v.startYear ?? "?"}–${v.endYear ?? "present"})`;
        }
      }
      return founderInfo;
    }).join("\n")
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

    // Agent results (FULL analysis data)
    if (retrievedCtx.agentResults.length > 0) {
      let agentsSection = "## RÉSULTATS D'AGENTS (Données COMPLÈTES)\n";
      for (const result of retrievedCtx.agentResults) {
        agentsSection += `\n### ${this.formatAgentName(result.agent)}\n`;
        if (result.score !== undefined) {
          agentsSection += `**Score**: ${result.score}/100\n`;
        }
        if (result.confidence !== undefined) {
          agentsSection += `**Confiance**: ${result.confidence}%\n`;
        }
        // Include FULL agent data if available
        if (result.fullData) {
          agentsSection += `**Données complètes de l'agent**:\n\`\`\`json\n${JSON.stringify(result.fullData, null, 2).slice(0, 15000)}\n\`\`\`\n`;
        } else {
          // Fallback to summary/findings if no fullData
          if (result.summary) {
            agentsSection += `**Résumé**: ${result.summary}\n`;
          }
          if (result.findings.length > 0) {
            agentsSection += `**Findings**:\n`;
            for (const finding of result.findings) {
              agentsSection += `- ${finding}\n`;
            }
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

    // Documents (with extracted text for full context)
    if (retrievedCtx.documents && retrievedCtx.documents.length > 0) {
      let docsSection = "## DOCUMENTS ANALYSÉS\n";
      for (const doc of retrievedCtx.documents) {
        docsSection += `\n### ${doc.name} (${doc.type})\n`;
        if (doc.extractedText) {
          // Truncate very long documents to avoid context overflow
          const truncatedText = doc.extractedText.slice(0, 8000);
          docsSection += `**Contenu extrait**:\n${truncatedText}${doc.extractedText.length > 8000 ? "\n[... texte tronqué ...]" : ""}\n`;
        }
        if (doc.relevantExcerpt) {
          docsSection += `**Extrait pertinent**: "${doc.relevantExcerpt.slice(0, 500)}"\n`;
        }
      }
      sections.push(docsSection);
    }

    // Founders (enriched LinkedIn data)
    if (retrievedCtx.founders && retrievedCtx.founders.length > 0) {
      let foundersSection = "## FONDATEURS (Profils enrichis LinkedIn)\n";
      for (const founder of retrievedCtx.founders) {
        foundersSection += `\n### ${founder.name} — ${founder.role}\n`;
        if (founder.linkedinUrl) {
          foundersSection += `**LinkedIn**: ${founder.linkedinUrl}\n`;
        }
        if (founder.previousVentures) {
          foundersSection += `**Ventures précédentes**: ${JSON.stringify(founder.previousVentures)}\n`;
        }
        if (founder.verifiedInfo) {
          foundersSection += `**Données LinkedIn vérifiées**:\n`;
          for (const [key, value] of Object.entries(founder.verifiedInfo)) {
            if (typeof value === "object" && value !== null) {
              foundersSection += `- **${key}**: ${JSON.stringify(value)}\n`;
            } else {
              foundersSection += `- **${key}**: ${value}\n`;
            }
          }
        }
      }
      sections.push(foundersSection);
    }

    // Scored Findings (quantified metrics with benchmarks)
    if (retrievedCtx.scoredFindings && retrievedCtx.scoredFindings.length > 0) {
      let findingsSection = `## MÉTRIQUES QUANTIFIÉES (${retrievedCtx.scoredFindings.length} findings)\n`;
      // Group by category
      const byCategory: Record<string, RetrievedScoredFinding[]> = {};
      for (const f of retrievedCtx.scoredFindings) {
        if (!byCategory[f.category]) byCategory[f.category] = [];
        byCategory[f.category].push(f);
      }
      for (const [category, findings] of Object.entries(byCategory)) {
        findingsSection += `\n### ${category.charAt(0).toUpperCase() + category.slice(1)}\n`;
        for (const f of findings) {
          findingsSection += `- **${f.metric}**: ${f.value ?? "N/A"} ${f.unit}`;
          if (f.percentile != null) {
            findingsSection += ` — Percentile: P${f.percentile}`;
          }
          findingsSection += ` — Évaluation: ${f.assessment}`;
          findingsSection += ` [conf: ${f.confidenceLevel} ${f.confidenceScore}%]\n`;
          if (f.benchmarkData) {
            const bd = f.benchmarkData;
            if (bd.p25 !== undefined) {
              findingsSection += `  Benchmark: P25=${bd.p25}, Median=${bd.median}, P75=${bd.p75}`;
              if (bd.source) findingsSection += ` (${bd.source})`;
              findingsSection += `\n`;
            }
          }
        }
      }
      sections.push(findingsSection);
    }

    // Debate Records (contradiction resolutions)
    if (retrievedCtx.debateRecords && retrievedCtx.debateRecords.length > 0) {
      let debateSection = `## DÉBATS INTER-AGENTS (${retrievedCtx.debateRecords.length} contradictions)\n`;
      for (const d of retrievedCtx.debateRecords) {
        debateSection += `\n### [${d.severity.toUpperCase()}] ${d.topic}\n`;
        debateSection += `**Participants**: ${d.participants.join(", ")}\n`;
        debateSection += `**Statut**: ${d.status}`;
        if (d.resolvedBy) debateSection += ` (résolu par: ${d.resolvedBy})`;
        debateSection += `\n`;
        if (d.resolution) {
          debateSection += `**Résolution**: ${d.resolution}\n`;
        }
        if (d.finalValue) {
          debateSection += `**Valeur retenue**: ${d.finalValue}`;
          if (d.resolutionConfidence != null) {
            debateSection += ` (conf: ${d.resolutionConfidence}%)`;
          }
          debateSection += `\n`;
        }
        if (d.claims.length > 0) {
          debateSection += `**Claims**:\n`;
          for (const c of d.claims.slice(0, 5)) {
            debateSection += `- ${c.agentName ?? "?"}: "${c.claim}" (conf: ${c.confidence ?? "?"})%\n`;
          }
        }
      }
      sections.push(debateSection);
    }

    // AI Board Results (multi-LLM deliberation)
    if (retrievedCtx.boardResult) {
      const br = retrievedCtx.boardResult;
      let boardSection = `## BOARD IA (Délibération Multi-LLM)\n`;
      boardSection += `**Verdict**: ${br.verdict ?? "Non déterminé"}\n`;
      boardSection += `**Consensus**: ${br.consensusLevel ?? "N/A"} (${br.totalRounds} rounds)\n`;

      if (br.members.length > 0) {
        boardSection += `\n### Votes des membres\n`;
        for (const m of br.members) {
          boardSection += `- **${m.modelName}**: ${m.finalVote ?? "N/A"}`;
          if (m.finalConfidence != null) boardSection += ` (conf: ${m.finalConfidence}%)`;
          boardSection += `\n`;
          if (m.voteJustification) {
            boardSection += `  Justification: ${m.voteJustification.slice(0, 500)}\n`;
          }
        }
      }

      if (br.consensusPoints && (br.consensusPoints as unknown[]).length > 0) {
        boardSection += `\n### Points de consensus\n`;
        for (const p of br.consensusPoints as unknown[]) {
          boardSection += `- ${typeof p === "string" ? p : JSON.stringify(p)}\n`;
        }
      }

      if (br.frictionPoints && (br.frictionPoints as unknown[]).length > 0) {
        boardSection += `\n### Points de friction\n`;
        for (const p of br.frictionPoints as unknown[]) {
          boardSection += `- ${typeof p === "string" ? p : JSON.stringify(p)}\n`;
        }
      }

      if (br.questionsForFounder && (br.questionsForFounder as unknown[]).length > 0) {
        boardSection += `\n### Questions pour le fondateur (Board IA)\n`;
        for (const q of br.questionsForFounder as unknown[]) {
          boardSection += `- ${typeof q === "string" ? q : JSON.stringify(q)}\n`;
        }
      }

      sections.push(boardSection);
    }

    // Analysis summary
    if (retrievedCtx.analysisSummary) {
      sections.push(`## RÉSUMÉ DE L'ANALYSE\n${retrievedCtx.analysisSummary}\n`);
    }

    // Negotiation strategy
    if (retrievedCtx.negotiationStrategy) {
      let negoSection = "## STRATÉGIE DE NÉGOCIATION\n";
      negoSection += `\`\`\`json\n${JSON.stringify(retrievedCtx.negotiationStrategy, null, 2).slice(0, 10000)}\n\`\`\`\n`;
      sections.push(negoSection);
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

    return `\n# DONNÉES RÉCUPÉRÉES DE LA BASE (Intégralité)\n\n${sections.join("\n")}`;
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
