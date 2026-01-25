import { openrouter, MODELS, type ModelKey } from "./client";
import { getCircuitBreaker, CircuitOpenError } from "./circuit-breaker";
import { costMonitor } from "@/services/cost-monitor";

export type TaskComplexity = "simple" | "medium" | "complex" | "critical";

// Current agent context for cost tracking
let currentAgentContext: string | null = null;

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

// ============================================================================
// RATE LIMITING & RETRY CONFIGURATION
// ============================================================================

const RATE_LIMIT_CONFIG = {
  maxRetries: 3,
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
// TODO [PROD]: Remettre les bons modèles avant la production !
// Configuration actuelle = TEST MODE (GPT-4o Mini partout pour économiser)
//
// CONFIGURATION PRODUCTION (à restaurer) :
//   simple   → HAIKU      (Claude 3 Haiku)
//   medium   → SONNET     (Claude 3.5 Sonnet)
//   complex  → SONNET     (Claude 3.5 Sonnet)
//   critical → OPUS       (Claude 3 Opus)
//
// EXCEPTION: document-extractor utilise TOUJOURS Sonnet (fondation critique)
// =============================================================================
const TEST_MODE = true; // TODO [PROD]: Mettre à false pour la production

// Agents qui utilisent toujours leur modèle optimal, même en test mode
// DISABLED - Tout passe par DeepSeek maintenant pour économiser
// const ALWAYS_OPTIMAL_AGENTS = new Set(["document-extractor"]);

export function selectModel(complexity: TaskComplexity, agentName?: string): ModelKey {
  // COST SAVING MODE: Tout utilise DeepSeek (~$0.14-0.28/MTok)
  // DeepSeek est ~10x moins cher que GPT-4o Mini et ~100x moins cher que Sonnet
  return "DEEPSEEK";

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
    maxTokens = 4096,
    temperature = 0.7,
    systemPrompt,
  } = options;

  const selectedModelKey = modelKey ?? selectModel(complexity, currentAgentContext ?? undefined);
  const model = MODELS[selectedModelKey];
  const circuitBreaker = getCircuitBreaker();

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

  // Retry loop with exponential backoff
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RATE_LIMIT_CONFIG.maxRetries; attempt++) {
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

      const cost =
        (usage.prompt_tokens / 1000) * model.inputCost +
        (usage.completion_tokens / 1000) * model.outputCost;

      // Record cost for monitoring
      costMonitor.recordCall({
        model: model.id,
        agent: currentAgentContext ?? "unknown",
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        cost,
      });

      return {
        content,
        model: model.id,
        usage: {
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        },
        cost,
      };
    } catch (error) {
      // Don't retry circuit breaker errors
      if (error instanceof CircuitOpenError) {
        throw error;
      }

      lastError = error instanceof Error ? error : new Error(String(error));

      if (!isRetryableError(error) || attempt === RATE_LIMIT_CONFIG.maxRetries) {
        throw lastError;
      }

      // Calculate backoff and retry
      const delay = calculateBackoff(attempt);
      console.log(
        `[OpenRouter] Retryable error on attempt ${attempt + 1}/${RATE_LIMIT_CONFIG.maxRetries + 1}. Waiting ${delay}ms...`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError ?? new Error("Unknown error in completion");
}

// Structured output completion with JSON parsing
export async function completeJSON<T>(
  prompt: string,
  options: CompletionOptions = {}
): Promise<{ data: T; cost: number }> {
  const result = await complete(prompt, {
    ...options,
    temperature: options.temperature ?? 0.3, // Lower temperature for structured output
  });

  // Extract JSON from the response (handles markdown code blocks)
  const jsonMatch = result.content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonString = jsonMatch ? jsonMatch[1].trim() : result.content.trim();

  const data = JSON.parse(jsonString) as T;

  return {
    data,
    cost: result.cost,
  };
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
    maxTokens = 4096,
    temperature = 0.7,
    systemPrompt,
  } = options;

  const selectedModelKey = modelKey ?? selectModel(complexity, currentAgentContext ?? undefined);
  const model = MODELS[selectedModelKey];
  const circuitBreaker = getCircuitBreaker();

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
    callbacks.onError?.(err);
    throw err;
  }
}
