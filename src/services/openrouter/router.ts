import { openrouter, MODELS, type ModelKey } from "./client";
import { getCircuitBreaker, CircuitOpenError } from "./circuit-breaker";
import { costMonitor } from "@/services/cost-monitor";
import { logLLMCallAsync } from "@/services/llm-logger";
import {
  StreamingJSONParser,
  buildContinuationPrompt,
  mergePartialResponses,
  type StreamingParserResult,
} from "./streaming-json-parser";

export type TaskComplexity = "simple" | "medium" | "complex" | "critical";

// Current agent context for cost tracking
let currentAgentContext: string | null = null;

// Current analysis context for LLM logging
let currentAnalysisContext: string | null = null;

/**
 * Set the current agent context for cost tracking
 */
export function setAgentContext(agentName: string | null): void {
  currentAgentContext = agentName;
}

/**
 * Get current agent context
 */
export function getAgentContext(): string | null {
  return currentAgentContext;
}

/**
 * Set the current analysis context for LLM logging
 */
export function setAnalysisContext(analysisId: string | null): void {
  currentAnalysisContext = analysisId;
}

/**
 * Get current analysis context
 */
export function getAnalysisContext(): string | null {
  return currentAnalysisContext;
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

// Simple in-memory rate limiter with bounded array
class RateLimiter {
  private timestamps: number[] = [];
  private readonly windowMs = 60000; // 1 minute
  private readonly maxTimestamps = 200; // Safety limit to prevent unbounded growth

  canMakeRequest(): boolean {
    const now = Date.now();
    // Remove old timestamps
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);

    // Safety: if array somehow grew too large, trim it
    if (this.timestamps.length > this.maxTimestamps) {
      this.timestamps = this.timestamps.slice(-RATE_LIMIT_CONFIG.requestsPerMinute);
    }

    return this.timestamps.length < RATE_LIMIT_CONFIG.requestsPerMinute;
  }

  recordRequest(): void {
    this.timestamps.push(Date.now());
  }

  async waitForSlot(): Promise<void> {
    const maxWaitMs = 60000; // Maximum total wait time: 1 minute
    const startTime = Date.now();

    while (!this.canMakeRequest()) {
      // Escape hatch: don't wait forever
      if (Date.now() - startTime > maxWaitMs) {
        throw new Error("Rate limit wait timeout exceeded");
      }

      const waitTime = Math.min(1000, this.windowMs - (Date.now() - this.timestamps[0]));
      await new Promise((r) => setTimeout(r, waitTime));
    }
  }
}

const rateLimiter = new RateLimiter();

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

export function selectModel(_complexity: TaskComplexity, _agentName?: string): ModelKey {
  return "GEMINI_3_FLASH";
}

export interface CompletionOptions {
  model?: ModelKey;
  complexity?: TaskComplexity;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  maxRetries?: number; // Override default retries (for Sonnet agents: 1 = 2 attempts)
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
    temperature = 0.7,
    systemPrompt,
    maxRetries = RATE_LIMIT_CONFIG.maxRetries,
  } = options;
  if (process.env.NODE_ENV === 'development') {
    console.log(`[complete] maxTokens=${maxTokens}`);
  }

  const selectedModelKey = modelKey ?? selectModel(complexity, currentAgentContext ?? undefined);
  const model = MODELS[selectedModelKey];

  // Sonnet agents get fewer retries (2 attempts) to save cost
  const effectiveMaxRetries = (selectedModelKey === "SONNET" && maxRetries === RATE_LIMIT_CONFIG.maxRetries)
    ? 1 // 2 attempts for Sonnet
    : maxRetries;

  const circuitBreaker = getCircuitBreaker();
  const startTime = Date.now();

  const messages: Array<{ role: "system" | "user"; content: string }> = [];

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  messages.push({ role: "user", content: prompt });

  // Check circuit breaker before attempting
  if (!circuitBreaker.canExecute()) {
    const stats = circuitBreaker.getStats();
    throw new CircuitOpenError(
      `Circuit breaker is OPEN. Too many failures. Recovery in progress.`,
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
      rateLimiter.recordRequest();

      // Execute through circuit breaker
      const response = await circuitBreaker.execute(() =>
        openrouter.chat.completions.create({
          model: model.id,
          messages,
          max_tokens: maxTokens,
          temperature,
        })
      );

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
        agent: currentAgentContext ?? "unknown",
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        cost: totalCost,
      });

      // Log LLM call for debugging/audit (async, non-blocking)
      logLLMCallAsync({
        analysisId: currentAnalysisContext ?? undefined,
        agentName: currentAgentContext ?? "unknown",
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
        analysisId: currentAnalysisContext ?? undefined,
        agentName: currentAgentContext ?? "unknown",
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
            agent: currentAgentContext ?? "unknown",
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
function extractFirstJSON(content: string): string {
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

  // Truncated JSON — attempt repair by closing open braces/brackets
  if (startIndex !== -1 && braceCount > 0 && maxBraceCount >= 2) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[extractBracedJSON] Truncated JSON detected (${braceCount} unclosed braces), attempting repair`);
    }
    let partial = text.substring(startIndex);
    // Remove trailing incomplete string (unmatched quote)
    const quoteCount = (partial.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      // Find last quote and truncate after it, adding closing quote
      const lastQuote = partial.lastIndexOf('"');
      partial = partial.substring(0, lastQuote + 1);
    }
    // Remove trailing comma or colon
    partial = partial.replace(/[,:\s]+$/, "");
    // Close remaining braces/brackets
    // Count actual open braces/brackets
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
      JSON.parse(partial); // Validate
      if (process.env.NODE_ENV === 'development') {
        console.log(`[extractBracedJSON] Repair succeeded (${partial.length} chars)`);
      }
      return partial;
    } catch {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[extractBracedJSON] Repair failed, returning null`);
      }
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
    console.log(`[completeJSON] Calling complete with maxTokens=${options.maxTokens ?? 'default'}`);
  }
  const result = await complete(prompt, {
    ...options,
    temperature: options.temperature ?? 0.3, // Lower temperature for structured output
  });

  // Extract first valid JSON object (handles trailing text after JSON)
  const jsonString = extractFirstJSON(result.content);

  try {
    const data = JSON.parse(jsonString) as T;
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
    temperature = 0.7,
    systemPrompt,
  } = options;

  const selectedModelKey = modelKey ?? selectModel(complexity, currentAgentContext ?? undefined);
  const model = MODELS[selectedModelKey];
  const circuitBreaker = getCircuitBreaker();
  const startTime = Date.now();
  let firstTokenTime: number | undefined;

  const messages: Array<{ role: "system" | "user"; content: string }> = [];

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  messages.push({ role: "user", content: prompt });

  // Check circuit breaker before attempting
  if (!circuitBreaker.canExecute()) {
    const stats = circuitBreaker.getStats();
    const error = new CircuitOpenError(
      `Circuit breaker is OPEN. Too many failures. Recovery in progress.`,
      stats
    );
    callbacks.onError?.(error);
    throw error;
  }

  // Wait for rate limit slot
  await rateLimiter.waitForSlot();
  rateLimiter.recordRequest();

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
      agent: currentAgentContext ?? "unknown",
      inputTokens,
      outputTokens,
      cost,
    });

    // Log LLM call for debugging/audit (async, non-blocking)
    logLLMCallAsync({
      analysisId: currentAnalysisContext ?? undefined,
      agentName: currentAgentContext ?? "unknown",
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
      analysisId: currentAnalysisContext ?? undefined,
      agentName: currentAgentContext ?? "unknown",
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

  const selectedModelKey = modelKey ?? selectModel(complexity, currentAgentContext ?? undefined);
  const model = MODELS[selectedModelKey];
  const circuitBreaker = getCircuitBreaker();

  // Accumulate stats across all calls
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;
  let continuationAttempts = 0;
  const partialResponses: string[] = [];

  // Current prompt (changes on continuation)
  let currentPrompt = prompt;
  let currentSystemPrompt = systemPrompt;
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

    // Check circuit breaker
    if (!circuitBreaker.canExecute()) {
      const stats = circuitBreaker.getStats();
      throw new CircuitOpenError(
        `Circuit breaker is OPEN. Too many failures.`,
        stats
      );
    }

    // Wait for rate limit
    await rateLimiter.waitForSlot();
    rateLimiter.recordRequest();

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
        analysisId: currentAnalysisContext ?? undefined,
        agentName: currentAgentContext ?? "unknown",
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
          agent: currentAgentContext ?? "unknown",
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
            agent: currentAgentContext ?? "unknown",
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
        agent: currentAgentContext ?? "unknown",
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
        analysisId: currentAnalysisContext ?? undefined,
        agentName: currentAgentContext ?? "unknown",
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
