import {
  complete,
  completeJSON,
  completeJSONWithFallback,
  completeJSONStreaming,
  stream,
  setAgentContext,
  type TaskComplexity,
  type StreamCallbacks,
  type StreamingJSONOptions,
  type StreamingJSONResult,
} from "@/services/openrouter/router";
import type { AgentConfig, AgentContext, AgentResult, EnrichedAgentContext, StandardTrace, LLMCallTrace, ContextUsed, AgentTraceMetrics } from "./types";
import { createHash } from "crypto";
import { sanitizeForLLM, sanitizeName, PromptInjectionError } from "@/lib/sanitize";
import { z } from "zod";
import { formatGeographyCoverageForPrompt } from "@/services/context-engine/geography-coverage";
import { formatThresholdsForPrompt } from "@/agents/config/red-flag-thresholds";

// Generic type for agent results with data
export interface AgentResultWithData<T> extends AgentResult {
  data: T;
}

/** F80: Max chars per trace field (prompt/response) to prevent DB bloat */
const TRACE_FIELD_MAX_CHARS = 50_000;

function truncateTraceField(content: string, fieldName: string): string {
  if (content.length <= TRACE_FIELD_MAX_CHARS) return content;
  return content.substring(0, TRACE_FIELD_MAX_CHARS) +
    `\n\n[TRACE_TRUNCATED: ${fieldName} was ${content.length} chars, showing first ${TRACE_FIELD_MAX_CHARS}]`;
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

    // F81: Hash includes document CONTENT (not just metadata), system prompt, and model
    const docContentHashes = (context.documents ?? []).map(d => {
      const contentHash = d.extractedText
        ? createHash("sha256").update(d.extractedText).digest("hex").slice(0, 16)
        : "empty";
      return `${d.name}:${contentHash}`;
    });
    const contextString = JSON.stringify({
      documents: docContentHashes,
      contextEngine,
      extractedFields: extractedData?.fields,
      systemPrompt: createHash("sha256").update(this.buildSystemPrompt()).digest("hex").slice(0, 16),
      model: this.config.modelComplexity,
    });
    this._contextHash = createHash("sha256").update(contextString).digest("hex").slice(0, 32);
  }

  /**
   * Compute a deterministic prompt version hash from the agent's
   * system prompt content, model complexity, and default temperature.
   * Changes whenever the prompt text or model config changes.
   */
  private computePromptVersionHash(): string {
    const systemPrompt = this.buildSystemPrompt();
    const configSignature = `${this.config.modelComplexity}|${this.config.timeoutMs}`;
    const content = `${systemPrompt}||${configSignature}`;
    return createHash("sha256").update(content).digest("hex").slice(0, 12);
  }

  // Build the complete trace
  private buildTrace(): StandardTrace | undefined {
    if (!this._enableTrace) return undefined;

    const promptVersionHash = this.computePromptVersionHash();

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
      promptVersion: promptVersionHash,
      promptVersionDetails: {
        systemPromptHash: createHash("sha256")
          .update(this.buildSystemPrompt())
          .digest("hex")
          .slice(0, 16),
        modelComplexity: this.config.modelComplexity as string,
        agentName: this.config.name,
      },
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

    // Capture trace if enabled (F80: truncate large fields)
    if (this._enableTrace && traceData) {
      this._llmCallTraces.push({
        id: `${this._traceId}-call-${this._llmCalls}`,
        timestamp: new Date().toISOString(),
        prompt: {
          system: truncateTraceField(traceData.systemPrompt, 'systemPrompt'),
          user: truncateTraceField(traceData.userPrompt, 'userPrompt'),
        },
        response: {
          raw: truncateTraceField(traceData.response, 'response'),
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

      // F80: Always build lightweight metrics
      const traceMetrics: AgentTraceMetrics = {
        id: this._traceId,
        agentName: this.config.name,
        totalDurationMs: executionTimeMs,
        llmCallCount: this._llmCalls,
        totalInputTokens: this._totalInputTokens,
        totalOutputTokens: this._totalOutputTokens,
        totalCost: this._totalCost,
        contextHash: this._contextHash || 'no-hash',
        promptVersion: this.computePromptVersionHash(),
        startedAt: this._traceStartedAt,
        completedAt: new Date().toISOString(),
      };

      return {
        agentName: this.config.name,
        success: true,
        executionTimeMs,
        cost: this._totalCost,
        data,
        _traceMetrics: traceMetrics,
        ...(trace && { _traceFull: trace }),
      } as unknown as TResult;
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;

      // Specific handling for prompt injection
      if (error instanceof PromptInjectionError) {
        console.error(
          `[${this.config.name}] PROMPT INJECTION BLOCKED: ${error.patterns.join(", ")}`
        );
      }

      // Build trace even on failure
      const trace = this.buildTrace();
      if (trace) {
        trace.totalDurationMs = executionTimeMs;
      }

      // F80: Always build lightweight metrics even on failure
      const traceMetrics: AgentTraceMetrics = {
        id: this._traceId,
        agentName: this.config.name,
        totalDurationMs: executionTimeMs,
        llmCallCount: this._llmCalls,
        totalInputTokens: this._totalInputTokens,
        totalOutputTokens: this._totalOutputTokens,
        totalCost: this._totalCost,
        contextHash: this._contextHash || 'no-hash',
        promptVersion: this.computePromptVersionHash(),
        startedAt: this._traceStartedAt,
        completedAt: new Date().toISOString(),
      };

      return {
        agentName: this.config.name,
        success: false,
        executionTimeMs,
        cost: this._totalCost,
        error: error instanceof Error ? error.message : "Unknown error",
        _traceMetrics: traceMetrics,
        ...(trace && { _traceFull: trace }),
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
    const systemPrompt = this.buildFullSystemPrompt(options.systemPrompt);
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
    const systemPrompt = this.buildFullSystemPrompt(options.systemPrompt);
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

  /**
   * Check if LLM response was truncated and add limitation (F54).
   * Call at the beginning of normalizeResponse() with the raw LLM data.
   */
  protected checkTruncation(data: Record<string, unknown>): boolean {
    if (data._wasTruncated === true) {
      console.warn(`[${this.config.name}] Response was truncated — analysis may be incomplete`);
      const meta = (data.meta ?? {}) as Record<string, unknown>;
      if (!Array.isArray(meta.limitations)) {
        meta.limitations = [];
      }
      (meta.limitations as string[]).push(
        "⚠️ La reponse LLM a ete tronquee. Certaines donnees peuvent etre manquantes."
      );
      data.meta = meta;
      delete data._wasTruncated;
      return true;
    }
    return false;
  }

  /**
   * Call LLM with JSON response + Zod validation.
   * On validation failure: logs warnings but returns partial data with defaults.
   * Progressive migration path - agents can opt-in without breaking.
   */
  protected async llmCompleteJSONValidated<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    options: LLMCallOptions & { fallbackDefaults?: Partial<T> } = {}
  ): Promise<{ data: T; cost: number; validationErrors?: string[] }> {
    const result = await this.llmCompleteJSON<T>(prompt, options);

    const parseResult = schema.safeParse(result.data);

    if (parseResult.success) {
      return { data: parseResult.data, cost: result.cost };
    }

    const errors = parseResult.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`
    );
    console.warn(
      `[${this.config.name}] Zod validation failed (${errors.length} issues):`,
      errors.slice(0, 5).join("; ")
    );

    // Try partial parse: merge raw data with defaults
    if (options.fallbackDefaults) {
      const merged = { ...options.fallbackDefaults, ...result.data } as T;
      const retryParse = schema.safeParse(merged);
      if (retryParse.success) {
        return { data: retryParse.data, cost: result.cost, validationErrors: errors };
      }
    }

    // Last resort: return raw data with TypeScript cast (backward compatible)
    return {
      data: result.data,
      cost: result.cost,
      validationErrors: errors,
    };
  }

  // Helper to call LLM with JSON response + fallback (Haiku 4.5 -> Haiku 3.5)
  // Used by agents that have issues with Haiku 4.5 via OpenRouter
  protected async llmCompleteJSONWithFallback<T>(
    prompt: string,
    options: LLMCallOptions = {}
  ): Promise<{ data: T; cost: number }> {
    const timeoutMs = options.timeoutMs ?? this.config.timeoutMs;
    const systemPrompt = this.buildFullSystemPrompt(options.systemPrompt);
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
        systemPrompt: this.buildFullSystemPrompt(options.systemPrompt),
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

  // Helper to call LLM with streaming JSON response + auto-continuation on truncation
  // Use this for agents that produce large JSON outputs to prevent truncation
  protected async llmCompleteJSONStreaming<T>(
    prompt: string,
    options: LLMStreamOptions & { maxContinuations?: number } = {}
  ): Promise<{ data: T; cost: number; wasTruncated: boolean }> {
    const timeoutMs = options.timeoutMs ?? this.config.timeoutMs;
    const systemPrompt = this.buildFullSystemPrompt(options.systemPrompt);
    const temperature = options.temperature ?? 0.2;
    const callStartTime = Date.now();

    const result = await this.withTimeout(
      completeJSONStreaming<T>(prompt, {
        complexity: this.config.modelComplexity as TaskComplexity,
        systemPrompt,
        temperature,
        maxTokens: options.maxTokens,
        model: options.model,
        maxContinuations: options.maxContinuations ?? 3,
        onToken: options.onToken,
      }),
      timeoutMs,
      `LLM streaming JSON call timed out after ${timeoutMs}ms`
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
        response: result.rawContent,
        parsedResponse: result.data,
        model: result.model ?? "unknown",
        temperature,
        latencyMs,
      } : undefined
    );

    if (!result.data) {
      throw new Error(
        `Failed to parse LLM streaming response after ${result.continuationAttempts} continuation attempts. ` +
        `Response was ${result.wasTruncated ? "truncated" : "malformed"}.`
      );
    }

    return {
      data: result.data,
      cost: result.cost,
      wasTruncated: result.wasTruncated,
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

  // Format deal info for prompts (with sanitization to prevent prompt injection)
  protected formatDealContext(context: AgentContext): string {
    const { deal, documents } = context;

    // Sanitize all user-provided fields to prevent prompt injection
    const sanitizedDeal = {
      name: sanitizeName(deal.name),
      companyName: deal.companyName ? sanitizeName(deal.companyName) : "Not specified",
      sector: deal.sector ? sanitizeName(deal.sector) : "Not specified",
      stage: deal.stage ? sanitizeName(deal.stage) : "Not specified",
      geography: deal.geography ? sanitizeName(deal.geography) : "Not specified",
      website: deal.website ? sanitizeName(deal.website) : "Not specified",
      description: deal.description
        ? sanitizeForLLM(deal.description, { maxLength: 10000 })
        : "No description provided",
    };

    let text = `## Deal Information
- Name: ${sanitizedDeal.name}
- Company: ${sanitizedDeal.companyName}
- Sector: ${sanitizedDeal.sector}
- Stage: ${sanitizedDeal.stage}
- Geography: ${sanitizedDeal.geography}
- Website: ${sanitizedDeal.website}

## Financial Metrics
- ARR: ${deal.arr ? `€${Number(deal.arr).toLocaleString()}` : "Not specified"}
- Growth Rate: ${deal.growthRate ? `${Number(deal.growthRate)}%` : "Not specified"}
- Amount Requested: ${deal.amountRequested ? `€${Number(deal.amountRequested).toLocaleString()}` : "Not specified"}
- Pre-money Valuation: ${deal.valuationPre ? `€${Number(deal.valuationPre).toLocaleString()}` : "Not specified"}

## Description
${sanitizedDeal.description}
`;

    // F82: Inject calibrated red flag thresholds if stage is known
    if (deal.stage) {
      const thresholds = formatThresholdsForPrompt(deal.stage, deal.sector ?? "default");
      if (thresholds) {
        text += `\n## ${thresholds}\n\n`;
      }
    }

    // Inject data reliability classifications from document-extractor
    const extractedInfo = this.getExtractedInfo(context);
    if (extractedInfo) {
      const classifications = extractedInfo.dataClassifications as Record<string, {
        reliability: string;
        isProjection: boolean;
        reasoning: string;
        documentDate?: string;
        projectionPercent?: number;
      }> | undefined;

      if (classifications && Object.keys(classifications).length > 0) {
        text += `\n## CLASSIFICATION DE FIABILITÉ DES DONNÉES\n`;
        text += `**CRITIQUE:** Les données ci-dessous sont classifiées par niveau de fiabilité.\n`;
        text += `Ne JAMAIS traiter une donnée [PROJECTED] comme un fait avéré.\n\n`;

        const projectedFields: string[] = [];
        for (const [field, classif] of Object.entries(classifications)) {
          const tag = `[${classif.reliability}]`;
          const projectionNote = classif.isProjection && classif.projectionPercent
            ? ` (${classif.projectionPercent}% projeté)`
            : classif.isProjection ? ' (projection)' : '';
          text += `- **${field}**: ${tag}${projectionNote} — ${classif.reasoning}\n`;
          if (classif.isProjection) projectedFields.push(field);
        }

        if (projectedFields.length > 0) {
          text += `\n**ALERTE:** Les champs suivants sont des PROJECTIONS, pas des faits: ${projectedFields.join(', ')}\n`;
        }
        text += `\n`;
      }

      // Also inject financial data type summary
      const financialDataType = extractedInfo.financialDataType as string | undefined;
      const financialDataAsOf = extractedInfo.financialDataAsOf as string | undefined;
      if (financialDataType) {
        text += `## Qualification des données financières\n`;
        text += `- Type: **${financialDataType.toUpperCase()}**\n`;
        if (financialDataAsOf) {
          text += `- Dernier chiffre réel: ${financialDataAsOf}\n`;
        }
        const redFlags = extractedInfo.financialRedFlags as string[] | undefined;
        if (redFlags && redFlags.length > 0) {
          text += `- Alertes: ${redFlags.join('; ')}\n`;
        }
        text += `\n`;
      }
    }

    // Add founders/team from DB (always available via deal.founders relation)
    const dealWithFounders = deal as unknown as {
      founders?: Array<{ name: string; role: string; linkedinUrl?: string | null }>;
    };
    if (dealWithFounders.founders && dealWithFounders.founders.length > 0) {
      text += `\n## Équipe Fondatrice (${dealWithFounders.founders.length} membre${dealWithFounders.founders.length > 1 ? "s" : ""})\n`;
      for (const f of dealWithFounders.founders) {
        const name = sanitizeName(f.name);
        const role = f.role ? sanitizeName(f.role) : "Rôle non spécifié";
        text += `- **${name}** — ${role}`;
        if (f.linkedinUrl) {
          text += ` | LinkedIn: ${sanitizeName(f.linkedinUrl)}`;
        }
        text += "\n";
      }
    }

    if (documents && documents.length > 0) {
      // Sort documents by uploadedAt (oldest first) for chronological context
      const sortedDocs = [...documents].sort((a, b) => {
        const dateA = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
        const dateB = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
        return dateA - dateB;
      });

      text += `\n## Documents (par ordre chronologique d'import)\n`;
      text += `**IMPORTANT — CHRONOLOGIE:** Les documents sont listés du plus ancien au plus récent.\n`;
      text += `Les documents ajoutés après le deck initial peuvent contenir des clarifications,\n`;
      text += `mises à jour ou réponses à des questions. En cas de divergence entre un document\n`;
      text += `récent et le deck initial, le document récent fait foi (sauf preuve contraire).\n\n`;

      for (const doc of sortedDocs) {
        // Sanitize document name and type
        const sanitizedDocName = sanitizeName(doc.name);
        const sanitizedDocType = sanitizeName(doc.type);
        const dateLabel = doc.uploadedAt
          ? new Date(doc.uploadedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
          : "date inconnue";
        text += `\n### ${sanitizedDocName} (${sanitizedDocType}) — importé le ${dateLabel}\n`;
        if (doc.extractedText) {
          // Financial models need more content (multiple sheets)
          const limit = doc.type === "FINANCIAL_MODEL" ? 50000 : 10000;
          // F27: head+tail truncation to capture financial annexes
          const tailReserve = Math.min(2000, Math.floor(limit * 0.15)); // 15% reserve, max 2K

          if (doc.extractedText.length <= limit) {
            const sanitizedContent = sanitizeForLLM(doc.extractedText, {
              maxLength: limit,
              preserveNewlines: true,
            });
            text += sanitizedContent;
          } else {
            const headLimit = limit - tailReserve;
            const headContent = sanitizeForLLM(doc.extractedText.substring(0, headLimit), {
              maxLength: headLimit,
              preserveNewlines: true,
            });
            const tailContent = sanitizeForLLM(
              doc.extractedText.substring(doc.extractedText.length - tailReserve),
              { maxLength: tailReserve, preserveNewlines: true }
            );
            const omittedChars = doc.extractedText.length - limit;

            text += headContent;
            text += `\n\n[⚠️ TRONCATION: ${omittedChars} caracteres omis. Document total: ${doc.extractedText.length} chars. Fin du document ci-dessous.]\n\n`;
            text += tailContent;
          }
        } else {
          text += "(Content not yet extracted)";
        }
      }
    }

    return text;
  }

  // Get financial model document content specifically (for financial-auditor)
  // Sanitized to prevent prompt injection
  protected getFinancialModelContent(context: AgentContext): string | null {
    const { documents } = context;
    if (!documents) return null;

    const financialModel = documents.find(d => d.type === "FINANCIAL_MODEL");
    if (!financialModel?.extractedText) return null;

    // Sanitize financial model content (preserve structure for analysis)
    return sanitizeForLLM(financialModel.extractedText, {
      maxLength: 100000,
      preserveNewlines: true,
    });
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

    // Traction Data - App Store, GitHub, Product Hunt (F71)
    if (contextEngine.tractionData) {
      const td = contextEngine.tractionData;
      text += "\n### Signaux de Traction Produit\n";

      if (td.appStore) {
        text += `\n**App Store iOS:**\n`;
        text += `- Rating: ${td.appStore.rating}/5 (${td.appStore.reviewCount} avis)\n`;
        if (td.appStore.downloads) text += `- Telechargements: ${td.appStore.downloads}\n`;
        if (td.appStore.lastUpdate) text += `- Derniere mise a jour: ${td.appStore.lastUpdate}\n`;
        if (td.appStore.topComplaints && td.appStore.topComplaints.length > 0) {
          text += `- Plaintes frequentes: ${td.appStore.topComplaints.join(", ")}\n`;
        }
      }

      if (td.googlePlay) {
        text += `\n**Google Play:**\n`;
        text += `- Rating: ${td.googlePlay.rating}/5 (${td.googlePlay.reviewCount} avis)\n`;
        if (td.googlePlay.downloads) text += `- Telechargements: ${td.googlePlay.downloads}\n`;
      }

      if (td.github) {
        text += `\n**GitHub:**\n`;
        text += `- Stars: ${td.github.stars} | Forks: ${td.github.forks} | Contributors: ${td.github.contributors}\n`;
        if (td.github.lastCommit) text += `- Dernier commit: ${td.github.lastCommit}\n`;
        if (td.github.openIssues) text += `- Issues ouvertes: ${td.github.openIssues}\n`;
        if (td.github.language) text += `- Language principal: ${td.github.language}\n`;
      }

      if (td.productHunt) {
        text += `\n**Product Hunt:**\n`;
        text += `- Upvotes: ${td.productHunt.upvotes}`;
        if (td.productHunt.rank) text += ` (Rank #${td.productHunt.rank})`;
        text += `\n`;
        if (td.productHunt.launchDate) text += `- Date de launch: ${td.productHunt.launchDate}\n`;
        if (td.productHunt.comments) text += `- Commentaires: ${td.productHunt.comments}\n`;
      }
    }

    // Website Content insights (F71)
    if (contextEngine.websiteContent?.insights) {
      const wi = contextEngine.websiteContent.insights;
      text += "\n### Donnees du Site Web\n";

      if (wi.clients.length > 0) {
        text += `- Clients mentionnes: ${wi.clients.slice(0, 10).join(", ")}\n`;
      }
      if (wi.clientCount) text += `- Nombre de clients revendique: ${wi.clientCount}\n`;
      if (wi.testimonials.length > 0) {
        text += `- Temoignages: ${wi.testimonials.length} trouves\n`;
        for (const t of wi.testimonials.slice(0, 3)) {
          text += `  > "${t.quote.slice(0, 100)}${t.quote.length > 100 ? "..." : ""}" - ${t.author}${t.company ? ` (${t.company})` : ""}\n`;
        }
      }
      if (wi.openPositions > 0) {
        text += `- Postes ouverts: ${wi.openPositions} (departements: ${wi.hiringDepartments.join(", ")})\n`;
      }
      if (wi.hasPricing) {
        text += `- Pricing: ${wi.pricingModel ?? "disponible"}`;
        if (wi.priceRange) text += ` (${wi.priceRange.min}-${wi.priceRange.max} ${wi.priceRange.currency})`;
        text += `\n`;
      }
    }

    // Completeness indicator
    if (contextEngine.completeness !== undefined) {
      text += `\n---\nCompletude des donnees: ${Math.round(contextEngine.completeness * 100)}%\n`;
    }

    // F59: Context quality degradation warning
    if (contextEngine.contextQuality?.degraded) {
      const cq = contextEngine.contextQuality;
      text += `\n## ⚠️ QUALITE DU CONTEXTE DEGRADEE\n`;
      text += `Score qualite: ${Math.round(cq.qualityScore * 100)}% (completude: ${Math.round(cq.completeness * 100)}%, fiabilite: ${Math.round(cq.reliability * 100)}%)\n`;
      text += `Raisons: ${cq.degradationReasons.join("; ")}\n`;
      text += `**IMPACT:** Les scores et affirmations bases sur le Context Engine doivent etre penalises. `;
      text += `Mentionner explicitement que le contexte externe est incomplet.\n`;
    }

    // F70: Geography coverage warning
    const geography = context.deal?.geography;
    if (geography) {
      const geoWarning = formatGeographyCoverageForPrompt(geography);
      if (geoWarning) {
        text += geoWarning;
      }
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
  // NOTE: Returns raw data - use sanitizeDataForPrompt() when embedding in prompts
  protected getExtractedInfo(context: AgentContext): Record<string, unknown> | null {
    const extractionResult = context.previousResults?.["document-extractor"];
    if (extractionResult?.success && "data" in extractionResult) {
      const data = extractionResult.data as { extractedInfo?: Record<string, unknown> };
      return data.extractedInfo ?? null;
    }
    return null;
  }

  // Sanitize any data object for safe embedding in LLM prompts
  // Use this when injecting JSON.stringify() data into prompts
  protected sanitizeDataForPrompt(data: unknown, maxLength = 50000): string {
    if (!data) return "";

    try {
      const jsonString = JSON.stringify(data, null, 2);
      return sanitizeForLLM(jsonString, {
        maxLength,
        preserveNewlines: true,
      });
    } catch {
      return "Invalid data";
    }
  }

  /**
   * Sanitize raw document content for safe embedding in LLM prompts.
   * MUST be called on any doc.extractedText / doc.content before injection.
   * Blocks prompt injection by default.
   */
  protected sanitizeDocumentContent(
    content: string,
    maxLength: number = 30000
  ): string {
    return sanitizeForLLM(content, {
      maxLength,
      preserveNewlines: true,
      blockOnSuspicious: true,
    });
  }

  // Format Fact Store data for injection into prompts
  // Returns empty string if no fact store available (conditional injection)
  // Sanitized to prevent prompt injection from extracted facts
  protected formatFactStoreData(context: EnrichedAgentContext): string {
    if (!context.factStoreFormatted) {
      return "";
    }

    // Sanitize the fact store data as it contains user-provided content from documents
    const sanitizedFactStore = sanitizeForLLM(context.factStoreFormatted, {
      maxLength: 50000,
      preserveNewlines: true,
    });

    let output = `
## DONNÉES EXTRAITES (Fact Store)

Les données ci-dessous ont été extraites des documents du deal.
Chaque donnée est classifiée par niveau de fiabilité (voir légende dans le Fact Store).

**RÈGLES CRITIQUES D'UTILISATION DES DONNÉES:**
1. [AUDITED] et [VERIFIED] → Utilisables comme faits établis
2. [DECLARED] → Écrire "le fondateur déclare X", JAMAIS "X est de..."
3. [PROJECTED] → Écrire "le BP projette X" ou "selon les projections, X". JAMAIS traiter comme un fait avéré.
4. [ESTIMATED] → Mentionner que c'est un calcul/estimation
5. [UNVERIFIABLE] → Ne PAS utiliser comme base d'analyse

Si une donnée clé (CA, ARR, clients) est [PROJECTED], tu DOIS:
- Le signaler explicitement dans ton analyse
- Générer une question au fondateur pour obtenir les chiffres réels
- Ajuster ton évaluation en conséquence (score pénalisé si données non vérifiées)

${sanitizedFactStore}
`;

    // Append founder Q&A responses if available
    const founderQA = this.formatFounderResponses(context);
    if (founderQA) {
      output += founderQA;
    }

    return output;
  }

  /**
   * Format founder Q&A responses for injection into agent prompts.
   * This gives agents chronological context: these are ANSWERS to questions
   * raised by previous analyses — NOT contradictions or new claims.
   */
  protected formatFounderResponses(context: EnrichedAgentContext): string {
    const responses = context.founderResponses;
    if (!responses || responses.length === 0) {
      return "";
    }

    let text = `
## REPONSES DU FONDATEUR (Q&A) — [DECLARED]

**CLASSIFICATION: Toutes les reponses ci-dessous sont classifiees [DECLARED].**
Ce sont des affirmations du fondateur, NON VERIFIEES de maniere independante.

**REGLES D'UTILISATION (OBLIGATOIRES):**
1. CHAQUE reponse doit etre prefixee par "le fondateur declare que..." ou "selon le fondateur..."
2. JAMAIS ecrire "X est de..." pour une donnee provenant de ces reponses
3. Si une reponse CONTREDIT une donnee du deck ou du Context Engine, c'est un RED FLAG a signaler
4. Si une reponse CONFIRME une donnee existante, cela n'augmente PAS la fiabilite (meme source)
5. Les reponses qui corrigent un red flag detecte sont SUSPECTES par defaut — verifier si la correction est etayee par des preuves
6. Un fondateur qui "corrige" systematiquement les red flags sans preuves = pattern a signaler

**CONTEXTE CHRONOLOGIQUE:**
Ces reponses ont ete fournies apres les analyses initiales. Le fondateur a eu connaissance
des questions et potentiellement des red flags avant de repondre. Cela cree un biais de
desirabilite sociale a prendre en compte.

`;

    // Group by category for readability
    const byCategory = new Map<string, typeof responses>();
    for (const r of responses) {
      const cat = r.category || "general";
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(r);
    }

    for (const [category, items] of byCategory) {
      text += `### ${category}\n`;
      for (const item of items) {
        const sanitizedQ = sanitizeForLLM(item.question, { maxLength: 500, preserveNewlines: false });
        const sanitizedA = sanitizeForLLM(item.answer, { maxLength: 2000, preserveNewlines: true });
        text += `- **Q:** ${sanitizedQ}\n  **R:** ${sanitizedA}\n\n`;
      }
    }

    return text;
  }

  // Standard guidance for confidence calculation - use in agent prompts
  protected getConfidenceGuidance(): string {
    return `
============================================================================
CALCUL DE LA CONFIDENCE (CRITIQUE — DOUBLE DIMENSION)
============================================================================

Il existe DEUX types de confiance a evaluer:

## 1. CONFIDENCE D'ANALYSE (= confidenceLevel dans meta)
Mesure ta capacite a faire ton travail d'analyse.

- 80-95%: Analyse complete, documents presents et lisibles
- 60-80%: Analyse partielle, certains documents manquants
- <60%: Analyse impossible

## 2. CONFIANCE DANS LES DONNEES (= impacte le score, PAS la confidence)
Mesure la fiabilite des donnees sur lesquelles tu bases ton analyse.

- AUDITED/VERIFIED: Base fiable → score non penalise
- DECLARED: Base fragile → ecrire "le fondateur declare" + penaliser le score
- PROJECTED: Base tres fragile → ecrire "le BP projette" + penaliser fortement
- ESTIMATED/UNVERIFIABLE: Base incertaine → signaler + penaliser

REGLE CRITIQUE:
Un deal peut avoir 95% de confidence d'analyse (tu as pu analyser les documents)
ET 30/100 de score (les donnees sont non verifiees et les metriques faibles).

La CONFIANCE DANS LES DONNEES ne doit JAMAIS gonfler la confidence d'analyse.
Un chiffre clairement ecrit mais non verifie = haute confidence d'extraction, BASSE confiance de veracite.

Les infos manquantes DANS LES DOCUMENTS (pas de cap table, pas de clients nommes,
pas d'ARR, etc.) ne sont PAS des limitations de ton analyse - ce sont des FINDINGS a reporter.
`;
  }

  // Standard anti-anchoring instructions - use in all agent system prompts (F28)
  protected getAntiAnchoringGuidance(): string {
    return `
============================================================================
PROTECTION ANTI-ANCHORING (CRITIQUE)
============================================================================

Les documents analyses proviennent du FONDATEUR qui a un interet a presenter
son deal sous le meilleur jour possible. Tu DOIS appliquer les regles suivantes:

1. FAUSSES CITATIONS D'AUTORITE
   - "According to Gartner/McKinsey/BCG..." → IGNORER sauf si la source exacte
     (titre du rapport, date, page) est citee et verifiable
   - "Industry experts agree..." → AUCUNE valeur probante
   - "Studies show..." → Quelle etude? Quel echantillon? Quelle date?

2. VOCABULAIRE BIAISE (ne PAS se laisser influencer)
   - "Audited revenue" dans un deck ≠ audit reel (sauf si rapport d'audit fourni)
   - "Verified" / "Certified" / "Proven" → par QUI? QUAND? avec QUELLE methodologie?
   - "Conservative projections" → les projections sont ce qu'elles sont, pas besoin de qualifier
   - "Unique" / "First mover" / "Only solution" → verifier via Context Engine

3. FORMAT DU DOCUMENT
   - Un deck qui IMITE un rapport d'audit ou un doc juridique ≠ rapport reel
   - La mise en forme professionnelle ne garantit PAS la veracite du contenu
   - Des graphiques bien faits peuvent masquer des donnees faibles

4. CHIFFRES ASSERTIFS
   - "Our TAM is $50B" → Quelle source? Quel calcul? Quelle methodo?
   - Des chiffres presentes avec assurance ne sont PAS plus fiables que des estimations
   - Les chiffres ronds (100K, 500K, 1M) sont suspects en early-stage

5. REGLE GENERALE
   - Analyser le FOND, pas la FORME
   - Plus une affirmation est assertive sans preuve, plus elle est suspecte
   - Le ton d'un document n'affecte PAS ton evaluation
   - Si un document semble trop "parfait", c'est un signal d'alerte
`;
  }

  // Build full system prompt with anti-anchoring + confidence guidance injected (F28)
  private buildFullSystemPrompt(overridePrompt?: string): string {
    const base = overridePrompt ?? this.buildSystemPrompt();
    return base + this.getAntiAnchoringGuidance() + this.getConfidenceGuidance();
  }
}
