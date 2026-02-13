import { AsyncLocalStorage } from "node:async_hooks";
import { openrouter, MODELS, type ModelKey } from "./client";
import { getCircuitBreakerDistributed, syncCircuitBreakerState, CircuitOpenError } from "./circuit-breaker";
import { costMonitor } from "@/services/cost-monitor";
import { logLLMCallAsync } from "@/services/llm-logger";
import {
  StreamingJSONParser,
  buildContinuationPrompt,
  mergePartialResponses,
  type StreamingParserResult,
} from "./streaming-json-parser";

export type TaskComplexity = "simple" | "medium" | "complex" | "critical";

// ============================================================================
// REQUEST-SCOPED CONTEXT (thread-safe via AsyncLocalStorage)
// ============================================================================

interface LLMContext {
  agentName: string | null;
  analysisId: string | null;
}

const llmContextStorage = new AsyncLocalStorage<LLMContext>();

// Legacy globals REMOVED (F96): were causing race conditions in parallel analyses.
// All code must use runWithLLMContext() for thread-safe context tracking.

/**
 * Run a function with request-scoped LLM context (thread-safe).
 * Use this in the orchestrator to wrap analysis execution.
 */
export function runWithLLMContext<T>(
  context: { agentName?: string | null; analysisId?: string | null },
  fn: () => T
): T {
  return llmContextStorage.run(
    { agentName: context.agentName ?? null, analysisId: context.analysisId ?? null },
    fn
  );
}

/**
 * Set the current agent context for cost tracking
 */
export function setAgentContext(agentName: string | null): void {
  const store = llmContextStorage.getStore();
  if (store) {
    store.agentName = agentName;
  } else if (process.env.NODE_ENV === 'development') {
    console.warn(
      `[LLM Router] setAgentContext("${agentName}") called outside of runWithLLMContext. ` +
      `Agent context will not be tracked. Wrap the calling code in runWithLLMContext().`
    );
  }
}

/**
 * Get current agent context
 */
export function getAgentContext(): string | null {
  const store = llmContextStorage.getStore();
  return store?.agentName ?? null;
}

/**
 * Set the current analysis context for LLM logging
 */
export function setAnalysisContext(analysisId: string | null): void {
  const store = llmContextStorage.getStore();
  if (store) {
    store.analysisId = analysisId;
  } else if (process.env.NODE_ENV === 'development') {
    console.warn(
      `[LLM Router] setAnalysisContext called outside of runWithLLMContext.`
    );
  }
}

/**
 * Get current analysis context
 */
export function getAnalysisContext(): string | null {
  const store = llmContextStorage.getStore();
  return store?.analysisId ?? null;
}

/**
 * Wrapper for LLM calls outside the orchestrator.
 * Guarantees an AsyncLocalStorage context exists.
 */
export function ensureLLMContext<T>(
  agentName: string,
  fn: () => Promise<T>
): Promise<T> {
  const store = llmContextStorage.getStore();
  if (store) {
    store.agentName = agentName;
    return fn();
  }
  return new Promise((resolve, reject) => {
    llmContextStorage.run(
      { agentName, analysisId: null },
      () => fn().then(resolve).catch(reject)
    );
  });
}

// ============================================================================
// LANGUAGE INSTRUCTION (injected into all system prompts)
// ============================================================================

const FRENCH_LANGUAGE_INSTRUCTION = `
LANGUE DE SORTIE (OBLIGATOIRE): TOUTE ta réponse (texte libre, descriptions, analyses, commentaires, titres de sections, recommandations, questions, red flags) DOIT être rédigée en FRANÇAIS.
Exceptions (restent en anglais): clés JSON, valeurs d'enum (CRITICAL, HIGH, PROCEED, FAIR, etc.), acronymes techniques (ARR, MRR, CAGR, CAC, LTV, TAM, etc.), noms propres.`;

function withLanguageInstruction(systemPrompt: string | undefined): string | undefined {
  if (!systemPrompt) return FRENCH_LANGUAGE_INSTRUCTION.trim();
  return `${systemPrompt}\n\n${FRENCH_LANGUAGE_INSTRUCTION}`;
}

// ============================================================================
// RATE LIMITING & RETRY CONFIGURATION
// ============================================================================

const RATE_LIMIT_CONFIG = {
  maxRetries: 2, // 3 attempts total (default for Haiku agents)
  baseDelayMs: 1000, // 1 second
  maxDelayMs: 30000, // 30 seconds
  requestsPerMinute: 60, // Conservative limit
};

// Distributed rate limiter with in-memory fallback
import { getStore } from '@/services/distributed-state';

class DistributedRateLimiter {
  private readonly windowMs = 60000;
  private readonly maxRequests: number;
  private readonly keyPrefix: string;

  // Local fallback for when Redis is unavailable
  private localTimestamps: number[] = [];

  constructor(maxRequests: number = 60, keyPrefix: string = 'angeldesk:ratelimit:llm') {
    this.maxRequests = maxRequests;
    this.keyPrefix = keyPrefix;
  }

  async canMakeRequest(): Promise<boolean> {
    try {
      const store = getStore();
      const windowKey = `${this.keyPrefix}:${Math.floor(Date.now() / this.windowMs)}`;
      const count = await store.get<number>(windowKey);
      return (count ?? 0) < this.maxRequests;
    } catch {
      return this.localCanMakeRequest();
    }
  }

  async recordRequest(): Promise<void> {
    try {
      const store = getStore();
      const windowKey = `${this.keyPrefix}:${Math.floor(Date.now() / this.windowMs)}`;
      await store.incr(windowKey, this.windowMs + 5000);
    } catch {
      this.localTimestamps.push(Date.now());
    }
  }

  async waitForSlot(): Promise<void> {
    const maxWaitMs = 60000;
    const startTime = Date.now();

    while (!(await this.canMakeRequest())) {
      if (Date.now() - startTime > maxWaitMs) {
        throw new Error("Rate limit wait timeout exceeded");
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  private localCanMakeRequest(): boolean {
    const now = Date.now();
    this.localTimestamps = this.localTimestamps.filter(t => now - t < this.windowMs);
    return this.localTimestamps.length < this.maxRequests;
  }
}

const rateLimiter = new DistributedRateLimiter(RATE_LIMIT_CONFIG.requestsPerMinute);

/**
 * Check if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("429") ||
      message.includes("rate limit") ||
      message.includes("timeout") ||
      message.includes("503") ||
      message.includes("service unavailable") ||
      message.includes("500") ||
      message.includes("internal server")
    );
  }
  return false;
}

/**
 * Calculate exponential backoff delay
 */
function calculateBackoff(attempt: number): number {
  const delay = RATE_LIMIT_CONFIG.baseDelayMs * Math.pow(2, attempt);
  return Math.min(delay, RATE_LIMIT_CONFIG.maxDelayMs);
}

// =============================================================================
// MODEL SELECTION
// =============================================================================

export function selectModel(complexity: TaskComplexity, agentName?: string): ModelKey {
  // Agent-specific overrides (for agents with known model requirements)
  const agentOverrides: Record<string, ModelKey> = {
    // Tier 1 critical — scoring pillars, quality non-negotiable
    "financial-auditor": "GEMINI_PRO",
    "deck-forensics": "GEMINI_PRO",
    "team-investigator": "GEMINI_PRO",
    // Tier 1 conditions — term sheet & legal analysis, feeds conditionsScore
    "cap-table-auditor": "GEMINI_PRO",
    "legal-regulatory": "GEMINI_PRO",
    // Tier 3 synthesis agents need stronger reasoning
    "synthesis-deal-scorer": "GEMINI_PRO",
    "contradiction-detector": "GEMINI_PRO",
    "devils-advocate": "GEMINI_PRO",
    "memo-generator": "GEMINI_PRO",
    // Board members already specify their models via options.model
  };

  if (agentName && agentOverrides[agentName]) {
    return agentOverrides[agentName];
  }

  // Complexity-based routing
  // Cost optimization: Gemini 3 Flash for all tiers except Tier 3 overrides above
  switch (complexity) {
    case "simple":
      return "GEMINI_3_FLASH";

    case "medium":
      return "GEMINI_3_FLASH";

    case "complex":
      return "GEMINI_3_FLASH";

    case "critical":
      return "GEMINI_3_FLASH";

    default:
      return "GEMINI_3_FLASH";
  }
}

export interface CompletionOptions {
  model?: ModelKey;
  complexity?: TaskComplexity;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  maxRetries?: number; // Override default retries (for Sonnet agents: 1 = 2 attempts)
  responseFormat?: { type: "json_object" | "text" }; // Force JSON mode at API level
  /** Active l'adaptation du prompt en cas d'echec (F95) */
  adaptiveRetry?: boolean;
  /** Callback pour adapter le prompt en cas d'erreur */
  onRetryAdapt?: (params: {
    attempt: number;
    error: Error;
    originalPrompt: string;
    originalSystemPrompt?: string;
  }) => {
    prompt?: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
  } | undefined;
}

export interface CompletionResult {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  cost: number;
}

export async function complete(
  prompt: string,
  options: CompletionOptions = {}
): Promise<CompletionResult> {
  const {
    model: modelKey,
    complexity = "medium",
    maxTokens = 65000, // Gemini 3 Flash supports 65K
    temperature = 0.2, // Defaut conservateur pour analyses. Utiliser 0.7 explicitement pour agents creatifs.
    systemPrompt,
    maxRetries = RATE_LIMIT_CONFIG.maxRetries,
    responseFormat,
  } = options;
  if (process.env.NODE_ENV === 'development') {
    console.log(`[complete] maxTokens=${maxTokens}`);
  }

  const selectedModelKey = modelKey ?? selectModel(complexity, getAgentContext() ?? undefined);
  const model = MODELS[selectedModelKey];

  // Sonnet agents get fewer retries (2 attempts) to save cost
  const effectiveMaxRetries = (selectedModelKey === "SONNET" && maxRetries === RATE_LIMIT_CONFIG.maxRetries)
    ? 1 // 2 attempts for Sonnet
    : maxRetries;

  const circuitBreaker = await getCircuitBreakerDistributed(selectedModelKey);
  const startTime = Date.now();

  const messages: Array<{ role: "system" | "user"; content: string }> = [];

  const effectiveSystemPrompt = withLanguageInstruction(systemPrompt);
  if (effectiveSystemPrompt) {
    messages.push({ role: "system", content: effectiveSystemPrompt });
  }

  messages.push({ role: "user", content: prompt });

  // Check circuit breaker before attempting (per-model)
  if (!circuitBreaker.canExecute()) {
    const stats = circuitBreaker.getStats();
    throw new CircuitOpenError(
      `Circuit breaker is OPEN for ${selectedModelKey}. Too many failures. Recovery in progress.`,
      stats
    );
  }

  // Estimate input tokens for cost tracking on retries/failures
  // ~4 chars per token is a reasonable approximation
  const estimatedInputTokens = Math.ceil(
    ((systemPrompt?.length ?? 0) + prompt.length) / 4
  );
  const estimatedInputCost = (estimatedInputTokens / 1000) * model.inputCost;

  // Accumulate cost across all attempts (retries cost money too!)
  let accumulatedRetryCost = 0;

  // Retry loop with exponential backoff
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= effectiveMaxRetries; attempt++) {
    try {
      // Wait for rate limit slot
      await rateLimiter.waitForSlot();
      await rateLimiter.recordRequest();

      // F95: Adapt messages/params on retry if adaptiveRetry is enabled
      let effectiveMessages = messages;
      let effectiveTemperature = temperature;
      let effectiveMaxTokens = maxTokens;

      if (attempt > 0 && options.adaptiveRetry && lastError) {
        const adaptation = options.onRetryAdapt?.({
          attempt,
          error: lastError,
          originalPrompt: prompt,
          originalSystemPrompt: systemPrompt,
        });

        if (adaptation) {
          // Custom adaptation from callback
          effectiveMessages = [];
          if (adaptation.systemPrompt ?? systemPrompt) {
            effectiveMessages.push({
              role: "system",
              content: withLanguageInstruction(adaptation.systemPrompt ?? systemPrompt)!,
            });
          }
          effectiveMessages.push({
            role: "user",
            content: adaptation.prompt ?? prompt,
          });
          effectiveTemperature = adaptation.temperature ?? temperature;
          effectiveMaxTokens = adaptation.maxTokens ?? maxTokens;
        } else if (adaptation === undefined) {
          // No callback or callback returned undefined: default adaptation
          effectiveMessages = [
            ...messages,
            {
              role: "user" as const,
              content: `[RETRY ATTEMPT ${attempt}] Previous attempt failed with error: "${lastError.message}". Please try again, paying extra attention to producing valid JSON output.`,
            },
          ];
          effectiveTemperature = Math.max(0, temperature - 0.1 * attempt);
        }
        // If adaptation === null or {}, keep original messages
      }

      // Execute through circuit breaker
      const response = await circuitBreaker.execute(() =>
        openrouter.chat.completions.create({
          model: model.id,
          messages: effectiveMessages,
          max_tokens: effectiveMaxTokens,
          temperature: effectiveTemperature,
          ...(responseFormat ? { response_format: responseFormat } : {}),
        })
      );

      // Sync circuit breaker state to distributed store (fire-and-forget)
      syncCircuitBreakerState(circuitBreaker.getStats(), selectedModelKey).catch(() => {});

      const content = response.choices[0]?.message?.content ?? "";
      const usage = response.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      const durationMs = Date.now() - startTime;

      const successCost =
        (usage.prompt_tokens / 1000) * model.inputCost +
        (usage.completion_tokens / 1000) * model.outputCost;

      // Total cost = this successful call + all previous retry attempts
      const totalCost = successCost + accumulatedRetryCost;

      // Record cost for monitoring (total including retries)
      costMonitor.recordCall({
        model: model.id,
        agent: getAgentContext() ?? "unknown",
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        cost: totalCost,
      });

      // Log LLM call for debugging/audit (async, non-blocking)
      logLLMCallAsync({
        analysisId: getAnalysisContext() ?? undefined,
        agentName: getAgentContext() ?? "unknown",
        model: model.id,
        provider: "openrouter",
        systemPrompt,
        userPrompt: prompt,
        temperature,
        maxTokens,
        response: content,
        finishReason: response.choices[0]?.finish_reason ?? undefined,
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        cost: totalCost,
        durationMs,
        metadata: attempt > 0 ? { retriesCount: attempt, retryCost: accumulatedRetryCost } : undefined,
      });

      const finishReason = response.choices[0]?.finish_reason;
      if (process.env.NODE_ENV === 'development') {
        console.log(`[complete] Response: ${usage.completion_tokens} output tokens, finishReason=${finishReason}, contentLen=${content.length}`);
      }

      return {
        content,
        model: model.id,
        usage: {
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        },
        cost: totalCost,
      };
    } catch (error) {
      // Don't retry circuit breaker errors
      if (error instanceof CircuitOpenError) {
        throw error;
      }

      lastError = error instanceof Error ? error : new Error(String(error));

      // Track estimated cost of this failed attempt (input tokens were sent)
      accumulatedRetryCost += estimatedInputCost;

      // Log error call with estimated cost
      const durationMs = Date.now() - startTime;
      logLLMCallAsync({
        analysisId: getAnalysisContext() ?? undefined,
        agentName: getAgentContext() ?? "unknown",
        model: model.id,
        provider: "openrouter",
        systemPrompt,
        userPrompt: prompt,
        temperature,
        maxTokens,
        response: "",
        inputTokens: estimatedInputTokens,
        outputTokens: 0,
        cost: estimatedInputCost,
        durationMs,
        isError: true,
        errorMessage: lastError.message,
        errorType: isRetryableError(error) ? "retryable" : "fatal",
        metadata: { attempt, estimatedCost: true },
      });

      if (!isRetryableError(error) || attempt === effectiveMaxRetries) {
        // Record the accumulated retry cost even on final failure
        if (accumulatedRetryCost > 0) {
          costMonitor.recordCall({
            model: model.id,
            agent: getAgentContext() ?? "unknown",
            inputTokens: estimatedInputTokens * (attempt + 1),
            outputTokens: 0,
            cost: accumulatedRetryCost,
          });
        }
        throw lastError;
      }

      // Calculate backoff and retry
      const delay = calculateBackoff(attempt);
      if (process.env.NODE_ENV === 'development') {
        console.log(
          `[OpenRouter] Retryable error on attempt ${attempt + 1}/${effectiveMaxRetries + 1}. Waiting ${delay}ms... (est. cost so far: $${accumulatedRetryCost.toFixed(4)})`
        );
      }
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError ?? new Error("Unknown error in completion");
}

// Extract the first valid JSON object from a string (handles trailing text)
// Exported for use by agents that call complete() instead of completeJSON()
export function extractFirstJSON(content: string): string {
  // Try multiple approaches to extract JSON

  // Approach 1: Extract from markdown code blocks (handle different backtick styles)
  const codeBlockPatterns = [
    /```(?:json)?\s*([\s\S]*?)```/,      // Standard markdown
    /`{3,}(?:json)?\s*([\s\S]*?)`{3,}/,  // Variable backticks
    /~~~(?:json)?\s*([\s\S]*?)~~~/,      // Tilde code blocks
  ];

  // Check if content contains backticks at all
  const backtickIndex = content.indexOf('`');
  if (process.env.NODE_ENV === 'development') {
    console.log(`[extractFirstJSON] Backtick char found at index: ${backtickIndex}`);
    if (backtickIndex >= 0) {
      const surroundingChars = content.substring(Math.max(0, backtickIndex - 5), backtickIndex + 10);
      console.log(`[extractFirstJSON] Chars around backtick: "${surroundingChars}" (charCodes: ${[...surroundingChars].map(c => c.charCodeAt(0)).join(',')})`);
    }
  }

  for (const pattern of codeBlockPatterns) {
    const match = content.match(pattern);
    if (process.env.NODE_ENV === 'development') {
      console.log(`[extractFirstJSON] Pattern ${pattern}: match=${!!match}`);
    }
    if (match && match[1]) {
      const extracted = match[1].trim();
      if (process.env.NODE_ENV === 'development') {
        console.log(`[extractFirstJSON] Code block found, extracted starts with: "${extracted.substring(0, 50)}..."`);
      }
      // Verify it starts with { (is actual JSON)
      if (extracted.startsWith("{")) {
        const json = extractBracedJSON(extracted);
        if (json) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[extractFirstJSON] Successfully extracted JSON (${json.length} chars)`);
          }
          return json;
        }
      }
    }
  }

  // Approach 2: If content starts with ```json but has no closing ```, strip the header
  const unclosedCodeBlockMatch = content.match(/^`{3,}(?:json)?\s*/);
  if (unclosedCodeBlockMatch) {
    const strippedContent = content.substring(unclosedCodeBlockMatch[0].length);
    if (process.env.NODE_ENV === 'development') {
      console.log(`[extractFirstJSON] Unclosed code block detected, stripped header (${unclosedCodeBlockMatch[0].length} chars)`);
    }
    const jsonFromStripped = extractBracedJSON(strippedContent);
    if (jsonFromStripped) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[extractFirstJSON] Extracted JSON from stripped code block (${jsonFromStripped.length} chars)`);
      }
      return jsonFromStripped;
    }
  }

  // Approach 3: Find JSON object directly in content (skip preceding text)
  if (process.env.NODE_ENV === 'development') {
    console.log(`[extractFirstJSON] No code block match, trying direct extraction from content (${content.length} chars)`);
  }
  const json = extractBracedJSON(content);
  if (json) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[extractFirstJSON] Direct extraction succeeded (${json.length} chars)`);
    }
    return json;
  }

  // Fallback: return trimmed content
  if (process.env.NODE_ENV === 'development') {
    console.log(`[extractFirstJSON] FALLBACK - returning trimmed content`);
  }
  return content.trim();
}

// Helper to extract JSON by matching braces
function extractBracedJSON(text: string): string | null {
  let braceCount = 0;
  let inString = false;
  let escapeNext = false;
  let startIndex = -1;
  let maxBraceCount = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") {
      if (startIndex === -1) startIndex = i;
      braceCount++;
      maxBraceCount = Math.max(maxBraceCount, braceCount);
    } else if (char === "}") {
      braceCount--;
      if (braceCount === 0 && startIndex !== -1) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[extractBracedJSON] Found complete JSON from ${startIndex} to ${i+1}, maxDepth=${maxBraceCount}`);
        }
        return text.substring(startIndex, i + 1);
      }
    }
  }

  // Truncated JSON detected — log warning and attempt repair WITH truncation flag (F54)
  if (startIndex !== -1 && braceCount > 0 && maxBraceCount >= 2) {
    console.warn(
      `[extractBracedJSON] ⚠️ TRUNCATED JSON DETECTED: ${braceCount} unclosed braces, ` +
      `${text.length - startIndex} chars of partial JSON. ` +
      `This may result in incomplete data.`
    );

    let partial = text.substring(startIndex);
    const quoteCount = (partial.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      const lastQuote = partial.lastIndexOf('"');
      partial = partial.substring(0, lastQuote + 1);
    }
    partial = partial.replace(/[,:\s]+$/, "");

    let openBraces = 0;
    let openBrackets = 0;
    let inStr = false;
    let esc = false;
    for (const ch of partial) {
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === "{") openBraces++;
      else if (ch === "}") openBraces--;
      else if (ch === "[") openBrackets++;
      else if (ch === "]") openBrackets--;
    }
    partial += "]".repeat(Math.max(0, openBrackets)) + "}".repeat(Math.max(0, openBraces));
    try {
      const parsed = JSON.parse(partial);

      // INJECT truncation marker into the parsed object (F54)
      if (typeof parsed === 'object' && parsed !== null) {
        parsed.__truncated = true;
        parsed.__truncationInfo = {
          unclosedBraces: braceCount,
          originalLength: text.length,
          repairedLength: partial.length,
          warning: "Ce JSON a ete tronque et repare automatiquement. Des donnees peuvent etre manquantes."
        };
      }

      console.warn(
        `[extractBracedJSON] Repair succeeded but data may be INCOMPLETE (${partial.length}/${text.length} chars)`
      );
      return JSON.stringify(parsed);
    } catch {
      console.error(`[extractBracedJSON] Repair failed — JSON is unrecoverable`);
    }
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`[extractBracedJSON] Failed: startIndex=${startIndex}, finalBraceCount=${braceCount}, maxBraceCount=${maxBraceCount}`);
  }
  return null;
}

// Structured output completion with JSON parsing
export async function completeJSON<T>(
  prompt: string,
  options: CompletionOptions = {}
): Promise<{
  data: T;
  cost: number;
  raw?: string;
  model?: string;
  usage?: { inputTokens: number; outputTokens: number };
}> {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[completeJSON] Calling complete with maxTokens=${options.maxTokens ?? 'default'}, responseFormat=json_object`);
  }
  const result = await complete(prompt, {
    ...options,
    temperature: options.temperature ?? 0.3, // Lower temperature for structured output
    responseFormat: { type: "json_object" }, // Force JSON output at API level
    // F95: Adaptive retry enabled by default for JSON completions
    adaptiveRetry: options.adaptiveRetry ?? true,
    onRetryAdapt: options.onRetryAdapt ?? ((params) => {
      const errorMsg = params.error.message;

      // JSON parsing error: add explicit instruction
      if (errorMsg.includes("Failed to parse") || errorMsg.includes("JSON") || errorMsg.includes("parse")) {
        return {
          prompt: `${params.originalPrompt}\n\n[IMPORTANT: Your previous response was not valid JSON. Error: "${errorMsg.substring(0, 200)}". Please respond with ONLY a valid JSON object, no text before or after.]`,
          temperature: Math.max(0, (options.temperature ?? 0.3) - 0.1),
        };
      }

      // Timeout: no prompt adaptation needed (LLM is just slow)
      if (errorMsg.includes("timeout")) {
        return {};
      }

      // Other errors: use default adaptation
      return undefined;
    }),
  });

  // Extract first valid JSON object (handles trailing text after JSON)
  const jsonString = extractFirstJSON(result.content);

  try {
    const data = JSON.parse(jsonString) as T;

    // Check for truncation marker injected by extractBracedJSON (F54)
    const dataObj = data as Record<string, unknown>;
    if (dataObj.__truncated === true) {
      console.warn(
        `[completeJSON] ⚠️ Response was TRUNCATED and auto-repaired. ` +
        `Data may be incomplete. Info: ${JSON.stringify(dataObj.__truncationInfo)}`
      );
      // Remove internal markers before passing to agent
      delete dataObj.__truncated;
      delete dataObj.__truncationInfo;
      // Add a top-level warning that agents can check
      dataObj._wasTruncated = true;
    }

    return {
      data,
      cost: result.cost,
      raw: result.content,
      model: result.model,
      usage: result.usage,
    };
  } catch (parseError) {
    // If parsing fails, throw with more context
    const preview = jsonString.substring(0, 500);
    throw new Error(
      `Failed to parse LLM response: ${parseError instanceof Error ? parseError.message : "Unknown error"}. ` +
      `Response preview: ${preview}...`
    );
  }
}

// ============================================================================
// FALLBACK COMPLETION (for problematic agents: tech-ops-dd, customer-intel)
// ============================================================================

/**
 * Tries Haiku 4.5 first (3 attempts), then falls back to Haiku 3.5 (3 attempts)
 * Used by agents that have issues with Haiku 4.5 via OpenRouter
 */
export async function completeJSONWithFallback<T>(
  prompt: string,
  options: CompletionOptions = {}
): Promise<{
  data: T;
  cost: number;
  raw?: string;
  model?: string;
  usage?: { inputTokens: number; outputTokens: number };
}> {
  // First try: Gemini 3 Flash (default model)
  try {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[completeJSONWithFallback] Trying Gemini 3 Flash...`);
    }
    const result = await completeJSON<T>(prompt, {
      ...options,
      model: "GEMINI_3_FLASH",
    });
    return result;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[completeJSONWithFallback] Gemini 3 Flash failed, falling back to Haiku 4.5...`);
    }

    // Fallback: Haiku 4.5
    try {
      const result = await completeJSON<T>(prompt, {
        ...options,
        model: "HAIKU",
      });
      return result;
    } catch (fallbackError) {
      // Both failed - throw generic error without mentioning models
      throw new Error("Analyse indisponible après plusieurs tentatives");
    }
  }
}

// ============================================================================
// STREAMING COMPLETION
// ============================================================================

export interface StreamCallbacks {
  onToken?: (token: string) => void;
  onComplete?: (content: string) => void;
  onError?: (error: Error) => void;
}

export interface StreamResult {
  content: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  cost: number;
}

/**
 * Streaming completion with callbacks for real-time token delivery
 * Useful for long analyses where you want to show progress to the user
 */
export async function stream(
  prompt: string,
  options: CompletionOptions = {},
  callbacks: StreamCallbacks = {}
): Promise<StreamResult> {
  const {
    model: modelKey,
    complexity = "medium",
    maxTokens = 65000, // Gemini 3 Flash supports 65K
    temperature = 0.2, // Defaut conservateur pour analyses. Utiliser 0.7 explicitement pour agents creatifs.
    systemPrompt,
  } = options;

  const selectedModelKey = modelKey ?? selectModel(complexity, getAgentContext() ?? undefined);
  const model = MODELS[selectedModelKey];
  const circuitBreaker = await getCircuitBreakerDistributed(selectedModelKey);
  const startTime = Date.now();
  let firstTokenTime: number | undefined;

  const messages: Array<{ role: "system" | "user"; content: string }> = [];

  const effectiveSystemPrompt = withLanguageInstruction(systemPrompt);
  if (effectiveSystemPrompt) {
    messages.push({ role: "system", content: effectiveSystemPrompt });
  }

  messages.push({ role: "user", content: prompt });

  // Check circuit breaker before attempting (per-model)
  if (!circuitBreaker.canExecute()) {
    const stats = circuitBreaker.getStats();
    const error = new CircuitOpenError(
      `Circuit breaker is OPEN for ${selectedModelKey}. Too many failures. Recovery in progress.`,
      stats
    );
    callbacks.onError?.(error);
    throw error;
  }

  // Wait for rate limit slot
  await rateLimiter.waitForSlot();
  await rateLimiter.recordRequest();

  let content = "";
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    // Execute through circuit breaker with streaming
    const streamResponse = await circuitBreaker.execute(() =>
      openrouter.chat.completions.create({
        model: model.id,
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: true,
      })
    );

    // Sync circuit breaker state to distributed store (fire-and-forget)
    syncCircuitBreakerState(circuitBreaker.getStats(), selectedModelKey).catch(() => {});

    // Process stream
    for await (const chunk of streamResponse) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        if (!firstTokenTime) {
          firstTokenTime = Date.now() - startTime;
        }
        content += delta;
        callbacks.onToken?.(delta);
      }

      // Capture usage from final chunk if available
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens;
        outputTokens = chunk.usage.completion_tokens;
      }
    }

    // If no usage in stream, estimate tokens
    if (inputTokens === 0) {
      // Rough estimation: ~4 chars per token
      const promptLength = messages.reduce((sum, m) => sum + m.content.length, 0);
      inputTokens = Math.ceil(promptLength / 4);
      outputTokens = Math.ceil(content.length / 4);
    }

    const durationMs = Date.now() - startTime;
    const cost =
      (inputTokens / 1000) * model.inputCost +
      (outputTokens / 1000) * model.outputCost;

    // Record cost for monitoring
    costMonitor.recordCall({
      model: model.id,
      agent: getAgentContext() ?? "unknown",
      inputTokens,
      outputTokens,
      cost,
    });

    // Log LLM call for debugging/audit (async, non-blocking)
    logLLMCallAsync({
      analysisId: getAnalysisContext() ?? undefined,
      agentName: getAgentContext() ?? "unknown",
      model: model.id,
      provider: "openrouter",
      systemPrompt,
      userPrompt: prompt,
      temperature,
      maxTokens,
      response: content,
      inputTokens,
      outputTokens,
      cost,
      durationMs,
      firstTokenMs: firstTokenTime,
    });

    callbacks.onComplete?.(content);

    return {
      content,
      model: model.id,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      cost,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    // Log error call
    const durationMs = Date.now() - startTime;
    logLLMCallAsync({
      analysisId: getAnalysisContext() ?? undefined,
      agentName: getAgentContext() ?? "unknown",
      model: model.id,
      provider: "openrouter",
      systemPrompt,
      userPrompt: prompt,
      temperature,
      maxTokens,
      response: content, // Partial content if any
      inputTokens: 0,
      outputTokens: 0,
      cost: 0,
      durationMs,
      isError: true,
      errorMessage: err.message,
      errorType: "stream_error",
    });

    callbacks.onError?.(err);
    throw err;
  }
}

// ============================================================================
// STREAMING JSON COMPLETION (with continuation on truncation)
// ============================================================================

export interface StreamingJSONOptions extends CompletionOptions {
  /** Max continuation attempts if response is truncated */
  maxContinuations?: number;
  /** Callback for each token received */
  onToken?: (token: string) => void;
  /** Callback when parsing state changes */
  onParseState?: (state: { openBraces: number; openBrackets: number; complete: boolean }) => void;
}

export interface StreamingJSONResult<T> {
  /** Parsed data (complete or partial if all continuations exhausted) */
  data: T | null;
  /** Whether the final result was from a truncated response */
  wasTruncated: boolean;
  /** Number of continuation attempts made */
  continuationAttempts: number;
  /** Total cost across all calls */
  cost: number;
  /** Model used */
  model: string;
  /** Total tokens used */
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  /** Raw content for debugging */
  rawContent: string;
}

/**
 * Streaming JSON completion with automatic continuation on truncation.
 *
 * This function streams the LLM response, parsing JSON incrementally.
 * If the response is truncated (finishReason: "length"), it automatically
 * retries with a continuation prompt to get the rest of the response.
 *
 * Key benefits:
 * - Zero data loss from truncation
 * - Same cost as non-streaming (no wasted retries with different prompts)
 * - Real-time parsing feedback
 *
 * @param prompt The user prompt requesting JSON output
 * @param options Completion options including max continuations
 * @returns Parsed JSON data with metadata
 */
export async function completeJSONStreaming<T>(
  prompt: string,
  options: StreamingJSONOptions = {}
): Promise<StreamingJSONResult<T>> {
  const {
    model: modelKey,
    complexity = "medium",
    maxTokens = 65000,
    temperature = 0.3, // Lower for structured output
    systemPrompt,
    maxContinuations = 3,
    onToken,
    onParseState,
  } = options;

  const selectedModelKey = modelKey ?? selectModel(complexity, getAgentContext() ?? undefined);
  const model = MODELS[selectedModelKey];
  const circuitBreaker = await getCircuitBreakerDistributed(selectedModelKey);

  // Accumulate stats across all calls
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;
  let continuationAttempts = 0;
  const partialResponses: string[] = [];

  // Current prompt (changes on continuation)
  let currentPrompt = prompt;
  let currentSystemPrompt = withLanguageInstruction(systemPrompt);
  let parser = new StreamingJSONParser<T>(prompt);

  // Main loop: stream and continue if truncated
  while (continuationAttempts <= maxContinuations) {
    const startTime = Date.now();

    // Build messages
    const messages: Array<{ role: "system" | "user"; content: string }> = [];
    if (currentSystemPrompt) {
      messages.push({ role: "system", content: currentSystemPrompt });
    }
    messages.push({ role: "user", content: currentPrompt });

    // Check circuit breaker (per-model)
    if (!circuitBreaker.canExecute()) {
      const stats = circuitBreaker.getStats();
      throw new CircuitOpenError(
        `Circuit breaker is OPEN for ${selectedModelKey}. Too many failures.`,
        stats
      );
    }

    // Wait for rate limit
    await rateLimiter.waitForSlot();
    await rateLimiter.recordRequest();

    let finishReason: string | null = null;

    try {
      // Stream the response
      const streamResponse = await circuitBreaker.execute(() =>
        openrouter.chat.completions.create({
          model: model.id,
          messages,
          max_tokens: maxTokens,
          temperature,
          stream: true,
        })
      );

      // Sync circuit breaker state to distributed store (fire-and-forget)
      syncCircuitBreakerState(circuitBreaker.getStats(), selectedModelKey).catch(() => {});

      let inputTokens = 0;
      let outputTokens = 0;

      // Process stream
      for await (const chunk of streamResponse) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          parser.processToken(delta);
          onToken?.(delta);

          // Report parse state
          if (onParseState) {
            const state = parser.getState();
            onParseState({
              openBraces: state.openBraces,
              openBrackets: state.openBrackets,
              complete: parser.isComplete(),
            });
          }
        }

        // Capture finish reason
        if (chunk.choices[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason;
        }

        // Capture usage
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
        }
      }

      // Estimate tokens if not provided
      if (inputTokens === 0) {
        const promptLength = messages.reduce((sum, m) => sum + m.content.length, 0);
        inputTokens = Math.ceil(promptLength / 4);
        outputTokens = Math.ceil(parser.getContent().length / 4);
      }

      // Calculate cost for this call
      const callCost =
        (inputTokens / 1000) * model.inputCost +
        (outputTokens / 1000) * model.outputCost;

      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
      totalCost += callCost;

      const durationMs = Date.now() - startTime;

      // Log call
      logLLMCallAsync({
        analysisId: getAnalysisContext() ?? undefined,
        agentName: getAgentContext() ?? "unknown",
        model: model.id,
        provider: "openrouter",
        systemPrompt: currentSystemPrompt,
        userPrompt: currentPrompt,
        temperature,
        maxTokens,
        response: parser.getContent(),
        finishReason: finishReason ?? undefined,
        inputTokens,
        outputTokens,
        cost: callCost,
        durationMs,
        metadata: continuationAttempts > 0
          ? { continuationAttempt: continuationAttempts, streaming: true }
          : { streaming: true },
      });

      // Check if complete or truncated
      const result = parser.finalize(finishReason);

      if (result.data && !result.wasTruncated) {
        // Success! Complete JSON parsed
        costMonitor.recordCall({
          model: model.id,
          agent: getAgentContext() ?? "unknown",
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          cost: totalCost,
        });

        return {
          data: result.data,
          wasTruncated: false,
          continuationAttempts,
          cost: totalCost,
          model: model.id,
          usage: {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            totalTokens: totalInputTokens + totalOutputTokens,
          },
          rawContent: parser.getContent(),
        };
      }

      // Truncated - prepare for continuation
      if (finishReason === "length" || result.wasTruncated) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[completeJSONStreaming] Response truncated (finishReason=${finishReason}), attempt ${continuationAttempts + 1}/${maxContinuations + 1}`);
        }

        partialResponses.push(result.partialContent || parser.getContent());
        continuationAttempts++;

        if (continuationAttempts <= maxContinuations) {
          // Build continuation prompt
          currentPrompt = buildContinuationPrompt(parser.getContent(), prompt);
          currentSystemPrompt = systemPrompt
            ? `${systemPrompt}\n\nIMPORTANT: This is a CONTINUATION request. Continue the JSON from where it was cut off. Do not restart.`
            : "IMPORTANT: This is a CONTINUATION request. Continue the JSON from where it was cut off. Do not restart.";

          // Reset parser but keep partial content for merging
          parser = new StreamingJSONParser<T>(prompt);
          parser.setContent(result.partialContent || "");

          continue;
        }
      }

      // Max continuations reached or parsing failed
      // Try to merge all partial responses
      if (partialResponses.length > 0) {
        const merged = mergePartialResponses<T>(partialResponses);
        if (merged) {
          costMonitor.recordCall({
            model: model.id,
            agent: getAgentContext() ?? "unknown",
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            cost: totalCost,
          });

          return {
            data: merged,
            wasTruncated: true,
            continuationAttempts,
            cost: totalCost,
            model: model.id,
            usage: {
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
              totalTokens: totalInputTokens + totalOutputTokens,
            },
            rawContent: partialResponses.join(""),
          };
        }
      }

      // Return whatever we have
      costMonitor.recordCall({
        model: model.id,
        agent: getAgentContext() ?? "unknown",
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cost: totalCost,
      });

      return {
        data: result.data,
        wasTruncated: true,
        continuationAttempts,
        cost: totalCost,
        model: model.id,
        usage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalTokens: totalInputTokens + totalOutputTokens,
        },
        rawContent: parser.getContent(),
      };

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Log error
      const durationMs = Date.now() - startTime;
      logLLMCallAsync({
        analysisId: getAnalysisContext() ?? undefined,
        agentName: getAgentContext() ?? "unknown",
        model: model.id,
        provider: "openrouter",
        systemPrompt: currentSystemPrompt,
        userPrompt: currentPrompt,
        temperature,
        maxTokens,
        response: parser.getContent(),
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        durationMs,
        isError: true,
        errorMessage: err.message,
        errorType: "streaming_error",
        metadata: { continuationAttempt: continuationAttempts },
      });

      throw err;
    }
  }

  // Should not reach here, but TypeScript needs it
  throw new Error("Unexpected end of completeJSONStreaming loop");
}
