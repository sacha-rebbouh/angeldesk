import { openrouter, MODELS, type ModelKey } from "./client";
import { getCircuitBreaker, CircuitOpenError } from "./circuit-breaker";
import { costMonitor } from "@/services/cost-monitor";
import { logLLMCallAsync } from "@/services/llm-logger";

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

// Simple in-memory rate limiter
class RateLimiter {
  private timestamps: number[] = [];
  private readonly windowMs = 60000; // 1 minute

  canMakeRequest(): boolean {
    const now = Date.now();
    // Remove old timestamps
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    return this.timestamps.length < RATE_LIMIT_CONFIG.requestsPerMinute;
  }

  recordRequest(): void {
    this.timestamps.push(Date.now());
  }

  async waitForSlot(): Promise<void> {
    while (!this.canMakeRequest()) {
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

// Agents qui utilisent toujours leur modèle optimal (fiabilité critique)
// Document-extractor = fondation de l'analyse, doit être précis et rapide
const ALWAYS_OPTIMAL_AGENTS = new Set(["document-extractor"]);

export function selectModel(complexity: TaskComplexity, agentName?: string): ModelKey {
  // Tous les agents utilisent Gemini 3 Flash
  // - Meilleurs benchmarks (92% MMLU, 90% GPQA, proche Opus 4.5 en coding)
  // - Optimisé pour agentic workflows
  // - $0.50/M input, $3/M output (~$0.80-1.20/analyse vs $2+ avec Haiku)
  // - Context 1M tokens, output 64K
  return "GEMINI_3_FLASH";

  // Exception: certains agents critiques gardent leur modèle optimal
  // DISABLED - on économise
  // if (agentName && ALWAYS_OPTIMAL_AGENTS.has(agentName)) {
  //   return "SONNET"; // Document extraction = fondation, doit être précis
  // }

  // TEST MODE: Autres agents utilisent GPT-4o Mini (le moins cher avec vision)
  // DISABLED - DeepSeek est encore moins cher
  // if (TEST_MODE) {
  //   return "GPT4O_MINI";
  // }

  // PRODUCTION MODE: Modèles adaptés à la complexité
  switch (complexity) {
    case "simple":
      return "HAIKU";
    case "medium":
      return "SONNET";
    case "complex":
      return "SONNET";
    case "critical":
      return "OPUS";
    default:
      return "SONNET";
  }
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
  console.log(`[complete] maxTokens=${maxTokens}`);

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
      console.log(`[complete] Response: ${usage.completion_tokens} output tokens, finishReason=${finishReason}, contentLen=${content.length}`);

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
      console.log(
        `[OpenRouter] Retryable error on attempt ${attempt + 1}/${effectiveMaxRetries + 1}. Waiting ${delay}ms... (est. cost so far: $${accumulatedRetryCost.toFixed(4)})`
      );
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
  console.log(`[extractFirstJSON] Backtick char found at index: ${backtickIndex}`);
  if (backtickIndex >= 0) {
    const surroundingChars = content.substring(Math.max(0, backtickIndex - 5), backtickIndex + 10);
    console.log(`[extractFirstJSON] Chars around backtick: "${surroundingChars}" (charCodes: ${[...surroundingChars].map(c => c.charCodeAt(0)).join(',')})`);
  }

  for (const pattern of codeBlockPatterns) {
    const match = content.match(pattern);
    console.log(`[extractFirstJSON] Pattern ${pattern}: match=${!!match}`);
    if (match && match[1]) {
      const extracted = match[1].trim();
      console.log(`[extractFirstJSON] Code block found, extracted starts with: "${extracted.substring(0, 50)}..."`);
      // Verify it starts with { (is actual JSON)
      if (extracted.startsWith("{")) {
        const json = extractBracedJSON(extracted);
        if (json) {
          console.log(`[extractFirstJSON] Successfully extracted JSON (${json.length} chars)`);
          return json;
        }
      }
    }
  }

  // Approach 2: Find JSON object directly in content (skip preceding text)
  console.log(`[extractFirstJSON] No code block match, trying direct extraction from content (${content.length} chars)`);
  const json = extractBracedJSON(content);
  if (json) {
    console.log(`[extractFirstJSON] Direct extraction succeeded (${json.length} chars)`);
    return json;
  }

  // Fallback: return trimmed content
  console.log(`[extractFirstJSON] FALLBACK - returning trimmed content`);
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
        console.log(`[extractBracedJSON] Found complete JSON from ${startIndex} to ${i+1}, maxDepth=${maxBraceCount}`);
        return text.substring(startIndex, i + 1);
      }
    }
  }

  // Truncated JSON — attempt repair by closing open braces/brackets
  if (startIndex !== -1 && braceCount > 0 && maxBraceCount >= 2) {
    console.log(`[extractBracedJSON] Truncated JSON detected (${braceCount} unclosed braces), attempting repair`);
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
      console.log(`[extractBracedJSON] Repair succeeded (${partial.length} chars)`);
      return partial;
    } catch {
      console.log(`[extractBracedJSON] Repair failed, returning null`);
    }
  }

  console.log(`[extractBracedJSON] Failed: startIndex=${startIndex}, finalBraceCount=${braceCount}, maxBraceCount=${maxBraceCount}`);
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
  console.log(`[completeJSON] Calling complete with maxTokens=${options.maxTokens ?? 'default'}`);
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
    console.log(`[completeJSONWithFallback] Trying Gemini 3 Flash...`);
    const result = await completeJSON<T>(prompt, {
      ...options,
      model: "GEMINI_3_FLASH",
    });
    return result;
  } catch (error) {
    console.log(`[completeJSONWithFallback] Gemini 3 Flash failed, falling back to Haiku 4.5...`);

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
