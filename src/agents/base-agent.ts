import {
  complete,
  completeJSON,
  completeJSONWithFallback,
  stream,
  setAgentContext,
  type TaskComplexity,
  type StreamCallbacks,
} from "@/services/openrouter/router";
import type { AgentConfig, AgentContext, AgentResult, EnrichedAgentContext, StandardTrace, LLMCallTrace, ContextUsed } from "./types";
import { createHash } from "crypto";

// Generic type for agent results with data
export interface AgentResultWithData<T> extends AgentResult {
  data: T;
}

// ============================================================================
// LLM CALL OPTIONS
// ============================================================================

export interface LLMCallOptions {
  systemPrompt?: string;
  temperature?: number;
  timeoutMs?: number; // Per-step timeout (default: config.timeoutMs)
  maxTokens?: number;
  model?: "HAIKU" | "SONNET" | "OPUS" | "GPT4O" | "GPT4O_MINI" | "DEEPSEEK" | "GEMINI_FLASH" | "GEMINI_PRO" | "GEMINI_3_FLASH";
}

export interface LLMStreamOptions extends LLMCallOptions {
  onToken?: (token: string) => void;
  onComplete?: (content: string) => void;
  onError?: (error: Error) => void;
}

// ============================================================================
// BASE AGENT
// ============================================================================

export abstract class BaseAgent<TData, TResult extends AgentResult = AgentResultWithData<TData>> {
  protected config: AgentConfig;

  // Cost tracking - accumulated across all LLM calls
  private _totalCost = 0;
  private _llmCalls = 0;
  private _totalInputTokens = 0;
  private _totalOutputTokens = 0;

  // Trace tracking - enabled by default for transparency
  private _enableTrace = true;
  private _traceId = "";
  private _traceStartedAt = "";
  private _llmCallTraces: LLMCallTrace[] = [];
  private _contextUsed: ContextUsed | null = null;
  private _contextHash = "";

  constructor(config: AgentConfig) {
    this.config = config;
  }

  // Enable/disable trace capture
  setTraceEnabled(enabled: boolean): void {
    this._enableTrace = enabled;
  }

  get name(): string {
    return this.config.name;
  }

  get dependencies(): string[] {
    return this.config.dependencies ?? [];
  }

  // Get accumulated cost (for monitoring during execution)
  get currentCost(): number {
    return this._totalCost;
  }

  // Get LLM call stats
  get llmStats(): { calls: number; inputTokens: number; outputTokens: number; cost: number } {
    return {
      calls: this._llmCalls,
      inputTokens: this._totalInputTokens,
      outputTokens: this._totalOutputTokens,
      cost: this._totalCost,
    };
  }

  // Abstract method - each agent implements its own logic
  protected abstract execute(context: AgentContext): Promise<TData>;

  // Build the system prompt for the agent
  protected abstract buildSystemPrompt(): string;

  // Reset cost tracking (called at start of run)
  private resetCostTracking(): void {
    this._totalCost = 0;
    this._llmCalls = 0;
    this._totalInputTokens = 0;
    this._totalOutputTokens = 0;
    // Reset trace
    this._traceId = crypto.randomUUID();
    this._traceStartedAt = new Date().toISOString();
    this._llmCallTraces = [];
    this._contextUsed = null;
    this._contextHash = "";
  }

  // Capture context used for trace
  private captureContextUsed(context: AgentContext): void {
    if (!this._enableTrace) return;

    const documents = (context.documents ?? []).map(d => ({
      name: d.name,
      type: d.type,
      charCount: d.extractedText?.length ?? 0,
    }));

    const enrichedContext = context as EnrichedAgentContext;
    const contextEngine = enrichedContext.contextEngine ? {
      similarDeals: enrichedContext.contextEngine.dealIntelligence?.similarDeals?.length ?? 0,
      competitors: enrichedContext.contextEngine.competitiveLandscape?.competitors?.length ?? 0,
      newsArticles: enrichedContext.contextEngine.newsSentiment?.articles?.length ?? 0,
      completeness: enrichedContext.contextEngine.completeness ?? 0,
    } : undefined;

    // Get extracted data if available
    const extractedInfo = this.getExtractedInfo(context);
    const extractedData = extractedInfo ? {
      fields: Object.keys(extractedInfo).filter(k => extractedInfo[k] !== null && extractedInfo[k] !== undefined),
      confidence: {} as Record<string, number>,
    } : undefined;

    this._contextUsed = {
      documents,
      contextEngine,
      extractedData,
    };

    // Hash context for reproducibility
    const contextString = JSON.stringify({
      documents: documents.map(d => ({ name: d.name, charCount: d.charCount })),
      contextEngine,
      extractedFields: extractedData?.fields,
    });
    this._contextHash = createHash("sha256").update(contextString).digest("hex").slice(0, 16);
  }

  // Build the complete trace
  private buildTrace(): StandardTrace | undefined {
    if (!this._enableTrace) return undefined;

    return {
      id: this._traceId,
      agentName: this.config.name,
      startedAt: this._traceStartedAt,
      completedAt: new Date().toISOString(),
      totalDurationMs: 0, // Will be set by caller
      llmCalls: this._llmCallTraces,
      contextUsed: this._contextUsed ?? { documents: [] },
      metrics: {
        totalInputTokens: this._totalInputTokens,
        totalOutputTokens: this._totalOutputTokens,
        totalCost: this._totalCost,
        llmCallCount: this._llmCalls,
      },
      contextHash: this._contextHash,
      promptVersion: "1.0", // Could be versioned per agent
    };
  }

  // Record cost from an LLM call (with optional trace data)
  private recordLLMCost(
    cost: number,
    inputTokens?: number,
    outputTokens?: number,
    traceData?: {
      systemPrompt: string;
      userPrompt: string;
      response: string;
      parsedResponse?: unknown;
      model: string;
      temperature: number;
      latencyMs: number;
    }
  ): void {
    this._totalCost += cost;
    this._llmCalls++;
    if (inputTokens) this._totalInputTokens += inputTokens;
    if (outputTokens) this._totalOutputTokens += outputTokens;

    // Capture trace if enabled
    if (this._enableTrace && traceData) {
      this._llmCallTraces.push({
        id: `${this._traceId}-call-${this._llmCalls}`,
        timestamp: new Date().toISOString(),
        prompt: {
          system: traceData.systemPrompt,
          user: traceData.userPrompt,
        },
        response: {
          raw: traceData.response,
          parsed: traceData.parsedResponse,
        },
        metrics: {
          inputTokens: inputTokens ?? 0,
          outputTokens: outputTokens ?? 0,
          cost,
          latencyMs: traceData.latencyMs,
        },
        model: traceData.model,
        temperature: traceData.temperature,
      });
    }
  }

  // Run the agent with error handling, timing, and cost tracking
  async run(context: AgentContext, options?: { enableTrace?: boolean }): Promise<TResult> {
    const startTime = Date.now();

    // Enable trace if requested
    if (options?.enableTrace !== undefined) {
      this._enableTrace = options.enableTrace;
    }

    // Reset cost tracking for this run
    this.resetCostTracking();

    // Capture context for trace
    this.captureContextUsed(context);

    // Set agent context for cost monitoring in router
    setAgentContext(this.config.name);

    try {
      // Execute with global timeout
      const data = await this.withTimeout(
        this.execute(context),
        this.config.timeoutMs,
        `Agent ${this.config.name} timed out after ${this.config.timeoutMs}ms`
      );

      const executionTimeMs = Date.now() - startTime;

      // Build trace if enabled
      const trace = this.buildTrace();
      if (trace) {
        trace.totalDurationMs = executionTimeMs;
      }

      return {
        agentName: this.config.name,
        success: true,
        executionTimeMs,
        cost: this._totalCost,
        data,
        ...(trace && { _trace: trace }),
      } as unknown as TResult;
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;

      // Build trace even on failure
      const trace = this.buildTrace();
      if (trace) {
        trace.totalDurationMs = executionTimeMs;
      }

      return {
        agentName: this.config.name,
        success: false,
        executionTimeMs,
        cost: this._totalCost,
        error: error instanceof Error ? error.message : "Unknown error",
        ...(trace && { _trace: trace }),
      } as unknown as TResult;
    } finally {
      // Clear agent context
      setAgentContext(null);
    }
  }

  // ============================================================================
  // LLM HELPERS WITH COST TRACKING
  // ============================================================================

  // Helper to call LLM with text response
  protected async llmComplete(
    prompt: string,
    options: LLMCallOptions = {}
  ): Promise<{ content: string; cost: number }> {
    const timeoutMs = options.timeoutMs ?? this.config.timeoutMs;
    const systemPrompt = options.systemPrompt ?? this.buildSystemPrompt();
    const temperature = options.temperature ?? 0.3;
    const callStartTime = Date.now();

    const result = await this.withTimeout(
      complete(prompt, {
        complexity: this.config.modelComplexity as TaskComplexity,
        systemPrompt,
        temperature,
        maxTokens: options.maxTokens,
      }),
      timeoutMs,
      `LLM call timed out after ${timeoutMs}ms`
    );

    const latencyMs = Date.now() - callStartTime;

    // Accumulate cost with trace data
    this.recordLLMCost(
      result.cost,
      result.usage.inputTokens,
      result.usage.outputTokens,
      this._enableTrace ? {
        systemPrompt,
        userPrompt: prompt,
        response: result.content,
        model: result.model ?? "unknown",
        temperature,
        latencyMs,
      } : undefined
    );

    return {
      content: result.content,
      cost: result.cost,
    };
  }

  // Helper to call LLM with JSON response
  protected async llmCompleteJSON<T>(
    prompt: string,
    options: LLMCallOptions = {}
  ): Promise<{ data: T; cost: number }> {
    const timeoutMs = options.timeoutMs ?? this.config.timeoutMs;
    const systemPrompt = options.systemPrompt ?? this.buildSystemPrompt();
    const temperature = options.temperature ?? 0.2;
    const callStartTime = Date.now();

    const result = await this.withTimeout(
      completeJSON<T>(prompt, {
        complexity: this.config.modelComplexity as TaskComplexity,
        systemPrompt,
        temperature,
        maxTokens: options.maxTokens,
        model: options.model,
      }),
      timeoutMs,
      `LLM JSON call timed out after ${timeoutMs}ms`
    );

    const latencyMs = Date.now() - callStartTime;

    // Accumulate cost with trace data
    this.recordLLMCost(
      result.cost,
      result.usage?.inputTokens,
      result.usage?.outputTokens,
      this._enableTrace ? {
        systemPrompt,
        userPrompt: prompt,
        response: result.raw ?? JSON.stringify(result.data),
        parsedResponse: result.data,
        model: result.model ?? "unknown",
        temperature,
        latencyMs,
      } : undefined
    );

    return result;
  }

  // Helper to call LLM with JSON response + fallback (Haiku 4.5 -> Haiku 3.5)
  // Used by agents that have issues with Haiku 4.5 via OpenRouter
  protected async llmCompleteJSONWithFallback<T>(
    prompt: string,
    options: LLMCallOptions = {}
  ): Promise<{ data: T; cost: number }> {
    const timeoutMs = options.timeoutMs ?? this.config.timeoutMs;
    const systemPrompt = options.systemPrompt ?? this.buildSystemPrompt();
    const temperature = options.temperature ?? 0.2;
    const callStartTime = Date.now();

    const result = await this.withTimeout(
      completeJSONWithFallback<T>(prompt, {
        complexity: this.config.modelComplexity as TaskComplexity,
        systemPrompt,
        temperature,
        maxTokens: options.maxTokens,
      }),
      timeoutMs, // Agents using fallback should set longer timeout (6 min)
      `LLM JSON call timed out after ${timeoutMs}ms`
    );

    const latencyMs = Date.now() - callStartTime;

    // Accumulate cost with trace data
    this.recordLLMCost(
      result.cost,
      result.usage?.inputTokens,
      result.usage?.outputTokens,
      this._enableTrace ? {
        systemPrompt,
        userPrompt: prompt,
        response: result.raw ?? JSON.stringify(result.data),
        parsedResponse: result.data,
        model: result.model ?? "unknown",
        temperature,
        latencyMs,
      } : undefined
    );

    return result;
  }

  // Helper to call LLM with streaming response
  protected async llmStream(
    prompt: string,
    options: LLMStreamOptions = {}
  ): Promise<{ content: string; cost: number }> {
    const timeoutMs = options.timeoutMs ?? this.config.timeoutMs;

    const callbacks: StreamCallbacks = {
      onToken: options.onToken,
      onComplete: options.onComplete,
      onError: options.onError,
    };

    const result = await this.withTimeout(
      stream(prompt, {
        complexity: this.config.modelComplexity as TaskComplexity,
        systemPrompt: options.systemPrompt ?? this.buildSystemPrompt(),
        temperature: options.temperature ?? 0.3,
        maxTokens: options.maxTokens,
      }, callbacks),
      timeoutMs,
      `LLM stream timed out after ${timeoutMs}ms`
    );

    // Accumulate cost
    this.recordLLMCost(result.cost, result.usage?.inputTokens, result.usage?.outputTokens);

    return {
      content: result.content,
      cost: result.cost,
    };
  }

  // ============================================================================
  // TIMEOUT UTILITY
  // ============================================================================

  // Wrapper to execute a promise with timeout
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    errorMessage: string
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(errorMessage));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutId!);
      return result;
    } catch (error) {
      clearTimeout(timeoutId!);
      throw error;
    }
  }

  // ============================================================================
  // CONTEXT FORMATTERS
  // ============================================================================

  // Format deal info for prompts
  protected formatDealContext(context: AgentContext): string {
    const { deal, documents } = context;

    let text = `## Deal Information
- Name: ${deal.name}
- Company: ${deal.companyName ?? "Not specified"}
- Sector: ${deal.sector ?? "Not specified"}
- Stage: ${deal.stage ?? "Not specified"}
- Geography: ${deal.geography ?? "Not specified"}
- Website: ${deal.website ?? "Not specified"}

## Financial Metrics
- ARR: ${deal.arr ? `€${Number(deal.arr).toLocaleString()}` : "Not specified"}
- Growth Rate: ${deal.growthRate ? `${Number(deal.growthRate)}%` : "Not specified"}
- Amount Requested: ${deal.amountRequested ? `€${Number(deal.amountRequested).toLocaleString()}` : "Not specified"}
- Pre-money Valuation: ${deal.valuationPre ? `€${Number(deal.valuationPre).toLocaleString()}` : "Not specified"}

## Description
${deal.description ?? "No description provided"}
`;

    if (documents && documents.length > 0) {
      text += `\n## Documents\n`;
      for (const doc of documents) {
        text += `\n### ${doc.name} (${doc.type})\n`;
        if (doc.extractedText) {
          // Financial models need more content (multiple sheets)
          const limit = doc.type === "FINANCIAL_MODEL" ? 50000 : 10000;
          text += doc.extractedText.substring(0, limit);
          if (doc.extractedText.length > limit) {
            text += `\n[... truncated, ${doc.extractedText.length - limit} chars remaining ...]`;
          }
        } else {
          text += "(Content not yet extracted)";
        }
      }
    }

    return text;
  }

  // Get financial model document content specifically (for financial-auditor)
  protected getFinancialModelContent(context: AgentContext): string | null {
    const { documents } = context;
    if (!documents) return null;

    const financialModel = documents.find(d => d.type === "FINANCIAL_MODEL");
    if (!financialModel?.extractedText) return null;

    return financialModel.extractedText;
  }

  // Format Context Engine data for prompts (Tier 1 agents)
  protected formatContextEngineData(context: EnrichedAgentContext): string {
    const { contextEngine } = context;
    if (!contextEngine) {
      return "";
    }

    let text = "\n## Contexte Externe (Context Engine)\n";

    // Deal Intelligence - Similar deals and valuation benchmarks
    if (contextEngine.dealIntelligence) {
      const di = contextEngine.dealIntelligence;
      text += "\n### Deals Similaires et Valorisation\n";

      if (di.similarDeals && di.similarDeals.length > 0) {
        text += `${di.similarDeals.length} deals comparables identifies:\n`;
        for (const deal of di.similarDeals.slice(0, 5)) {
          text += `- **${deal.companyName}** (${deal.sector}, ${deal.stage}): ${this.formatMoney(deal.fundingAmount)}`;
          if (deal.valuationMultiple) {
            text += ` @ ${deal.valuationMultiple}x ARR`;
          }
          text += ` - ${deal.fundingDate}\n`;
        }
      }

      if (di.fundingContext) {
        const fc = di.fundingContext;
        text += `\nContexte marche (${fc.period}):\n`;
        text += `- Multiple valorisation: P25=${fc.p25ValuationMultiple}x, Median=${fc.medianValuationMultiple}x, P75=${fc.p75ValuationMultiple}x\n`;
        text += `- Tendance: ${fc.trend} (${fc.trendPercentage > 0 ? "+" : ""}${fc.trendPercentage}%)\n`;
        text += `- ${fc.totalDealsInPeriod} deals sur la periode\n`;
      }

      if (di.verdict) {
        text += `\nVerdict valorisation: **${di.verdict.toUpperCase()}**\n`;
      }
    }

    // Market Data - Benchmarks
    if (contextEngine.marketData) {
      const md = contextEngine.marketData;
      text += "\n### Benchmarks Secteur\n";

      if (md.marketSize) {
        text += `TAM: ${this.formatMoney(md.marketSize.tam)} | SAM: ${this.formatMoney(md.marketSize.sam)} | SOM: ${this.formatMoney(md.marketSize.som)}\n`;
        text += `CAGR: ${md.marketSize.cagr}%\n`;
      }

      if (md.benchmarks && md.benchmarks.length > 0) {
        text += "\nMetriques de reference:\n";
        for (const b of md.benchmarks.slice(0, 8)) {
          text += `- ${b.metricName}: P25=${b.p25}${b.unit}, Median=${b.median}${b.unit}, P75=${b.p75}${b.unit}\n`;
        }
      }

      if (md.trends && md.trends.length > 0) {
        text += "\nTendances marche:\n";
        for (const t of md.trends.slice(0, 3)) {
          text += `- ${t.title}: ${t.description} (impact: ${t.impact})\n`;
        }
      }
    }

    // Competitive Landscape
    if (contextEngine.competitiveLandscape) {
      const cl = contextEngine.competitiveLandscape;
      text += "\n### Paysage Concurrentiel\n";

      if (cl.competitors && cl.competitors.length > 0) {
        text += `${cl.competitors.length} concurrents identifies:\n`;
        for (const c of cl.competitors.slice(0, 5)) {
          text += `- **${c.name}** (${c.overlap}): ${c.positioning}`;
          if (c.totalFunding) {
            text += ` - Funding: ${this.formatMoney(c.totalFunding)}`;
          }
          text += "\n";
        }
      }

      text += `Concentration marche: ${cl.marketConcentration}\n`;
    }

    // People Graph - Founder backgrounds
    if (contextEngine.peopleGraph) {
      const pg = contextEngine.peopleGraph;
      text += "\n### Background Equipe\n";

      if (pg.founders && pg.founders.length > 0) {
        for (const f of pg.founders) {
          text += `\n**${f.name}** (${f.role}) - Verification: ${f.verificationStatus}\n`;

          if (f.previousCompanies && f.previousCompanies.length > 0) {
            text += "Experience:\n";
            for (const exp of f.previousCompanies.slice(0, 3)) {
              text += `  - ${exp.company}: ${exp.role}`;
              if (exp.startYear) text += ` (${exp.startYear}-${exp.endYear ?? "present"})`;
              text += "\n";
            }
          }

          if (f.previousVentures && f.previousVentures.length > 0) {
            text += "Ventures precedentes:\n";
            for (const v of f.previousVentures) {
              text += `  - ${v.companyName}: ${v.outcome}`;
              if (v.exitValue) text += ` (exit: ${this.formatMoney(v.exitValue)})`;
              text += "\n";
            }
          }

          if (f.redFlags && f.redFlags.length > 0) {
            text += "Red flags detectes:\n";
            for (const rf of f.redFlags) {
              text += `  - [${rf.severity.toUpperCase()}] ${rf.description}\n`;
            }
          }
        }
      }
    }

    // News Sentiment
    if (contextEngine.newsSentiment) {
      const ns = contextEngine.newsSentiment;
      text += "\n### Sentiment Presse\n";
      text += `Sentiment global: ${ns.overallSentiment} (score: ${ns.sentimentScore.toFixed(2)})\n`;

      if (ns.articles && ns.articles.length > 0) {
        text += "Articles recents:\n";
        for (const a of ns.articles.slice(0, 3)) {
          text += `- [${a.sentiment}] "${a.title}" (${a.source}, ${a.publishedAt})\n`;
        }
      }
    }

    // Completeness indicator
    if (contextEngine.completeness !== undefined) {
      text += `\n---\nCompletude des donnees: ${Math.round(contextEngine.completeness * 100)}%\n`;
    }

    return text;
  }

  // Helper to format money values
  private formatMoney(value: number): string {
    if (value >= 1_000_000_000) {
      return `€${(value / 1_000_000_000).toFixed(1)}B`;
    }
    if (value >= 1_000_000) {
      return `€${(value / 1_000_000).toFixed(1)}M`;
    }
    if (value >= 1_000) {
      return `€${(value / 1_000).toFixed(0)}K`;
    }
    return `€${value}`;
  }

  // Get extracted info from previous document-extractor run
  protected getExtractedInfo(context: AgentContext): Record<string, unknown> | null {
    const extractionResult = context.previousResults?.["document-extractor"];
    if (extractionResult?.success && "data" in extractionResult) {
      const data = extractionResult.data as { extractedInfo?: Record<string, unknown> };
      return data.extractedInfo ?? null;
    }
    return null;
  }

  // Format Fact Store data for injection into prompts
  // Returns empty string if no fact store available (conditional injection)
  protected formatFactStoreData(context: EnrichedAgentContext): string {
    if (!context.factStoreFormatted) {
      return "";
    }

    return `
## DONNÉES EXTRAITES (Fact Store)

Les données ci-dessous ont été extraites des documents du deal.
**ATTENTION:** Les faits marqués "⚠️ UNVERIFIED CLAIM" ou avec confidence < 80% sont des DÉCLARATIONS
du fondateur, PAS des faits vérifiés. Ne les utilise JAMAIS comme preuves dans ton analyse.
Base-toi sur les faits vérifiés (✅). Si un fait important manque, signale-le.

${context.factStoreFormatted}
`;
  }

  // Standard guidance for confidence calculation - use in agent prompts
  protected getConfidenceGuidance(): string {
    return `
============================================================================
CALCUL DE LA CONFIDENCE (CRITIQUE)
============================================================================

La confidenceLevel mesure ta capacite a faire ton travail d'analyse, PAS la qualite des donnees du deal.

CONFIDENCE 80-95%: Tu as pu faire ton analyse completement
- Documents presents et lisibles
- Tu as pu analyser les informations disponibles
- Context Engine disponible pour enrichir l'analyse

CONFIDENCE 60-80%: Analyse partielle
- Certains documents manquants ou illisibles
- Context Engine indisponible

CONFIDENCE <60%: Analyse impossible
- Documents critiques manquants ou illisibles
- Impossible de produire une analyse fiable

ATTENTION CRITIQUE: Les infos manquantes DANS LES DOCUMENTS (pas de cap table, pas de clients nommes,
pas d'ARR, etc.) ne sont PAS des limitations de ton analyse - ce sont des FINDINGS a reporter.
Ta confidence mesure si TU as pu faire ton travail d'analyse, pas si le deal a toutes les infos ideales.

Un deal peut avoir 95% de confidence (analyse complete) ET un score de 30/100 (mauvais deal).
`;
  }
}
