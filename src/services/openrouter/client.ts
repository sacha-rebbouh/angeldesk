import OpenAI from "openai";

export const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL,
    "X-Title": "Angel Desk",
  },
});

// Model registry with capabilities and costs
export const MODELS = {
  // Fast models for simple tasks
  HAIKU: {
    id: "anthropic/claude-haiku-4.5", // Claude Haiku 4.5 - 64K output
    name: "Claude Haiku 4.5",
    inputCost: 0.001, // per 1K tokens ($1/M)
    outputCost: 0.005, // per 1K tokens ($5/M)
    contextWindow: 200000,
    maxOutputTokens: 64000, // 64K output limit
    capabilities: ["fast", "cheap", "extraction", "extended-thinking"],
  },

  HAIKU_35: {
    id: "anthropic/claude-3-haiku-20240307", // Claude 3 Haiku - 4K output (fallback)
    name: "Claude 3 Haiku",
    inputCost: 0.00025, // per 1K tokens ($0.25/M)
    outputCost: 0.00125, // per 1K tokens ($1.25/M)
    contextWindow: 200000,
    maxOutputTokens: 4096, // 4K output limit
    capabilities: ["fast", "cheapest", "extraction"],
  },

  // Balanced models for most tasks
  SONNET: {
    id: "anthropic/claude-3.5-sonnet",
    name: "Claude 3.5 Sonnet",
    inputCost: 0.003,
    outputCost: 0.015,
    contextWindow: 200000,
    capabilities: ["balanced", "reasoning", "analysis"],
  },

  SONNET_4: {
    id: "anthropic/claude-3.5-sonnet", // Using 3.5 Sonnet (claude-sonnet-4 not available on OpenRouter)
    name: "Claude 3.5 Sonnet (as SONNET_4)",
    inputCost: 0.003,
    outputCost: 0.015,
    contextWindow: 200000,
    capabilities: ["balanced", "reasoning", "analysis", "best-quality"],
  },

  GPT4O_MINI: {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    inputCost: 0.00015,
    outputCost: 0.0006,
    contextWindow: 128000,
    capabilities: ["fast", "cheap", "general", "vision"],
  },

  // DeepSeek - cheapest for text parsing (no vision)
  DEEPSEEK: {
    id: "deepseek/deepseek-chat",
    name: "DeepSeek Chat",
    inputCost: 0.00014,
    outputCost: 0.00028,
    contextWindow: 64000,
    capabilities: ["fast", "cheapest", "general"],
  },

  // Powerful models for complex reasoning
  GPT4O: {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    inputCost: 0.005,
    outputCost: 0.015,
    contextWindow: 128000,
    capabilities: ["powerful", "reasoning", "analysis"],
  },

  OPUS: {
    id: "anthropic/claude-3-opus",
    name: "Claude 3 Opus",
    inputCost: 0.015,
    outputCost: 0.075,
    contextWindow: 200000,
    capabilities: ["most-powerful", "complex-reasoning", "high-stakes"],
  },

  // ============================================================================
  // AI BOARD - TOP TIER MODELS (for premium deliberation feature)
  // ============================================================================

  CLAUDE_OPUS_45: {
    id: "anthropic/claude-3.5-opus",
    name: "Claude 3.5 Opus",
    inputCost: 0.015,
    outputCost: 0.075,
    contextWindow: 200000,
    capabilities: ["most-powerful", "complex-reasoning", "board-member"],
  },

  GPT4_TURBO: {
    id: "openai/gpt-4-turbo",
    name: "GPT-4 Turbo",
    inputCost: 0.010,
    outputCost: 0.030,
    contextWindow: 128000,
    capabilities: ["powerful", "reasoning", "board-member"],
  },

  GEMINI_FLASH: {
    id: "google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    inputCost: 0.00015,
    outputCost: 0.0006,
    contextWindow: 1000000,
    capabilities: ["fast", "cheap", "large-context"],
  },

  GEMINI_PRO: {
    id: "google/gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    inputCost: 0.00125,
    outputCost: 0.01,
    contextWindow: 1000000,
    capabilities: ["balanced", "reasoning", "large-context"],
  },

  GEMINI_ULTRA: {
    id: "google/gemini-2.0-ultra",
    name: "Gemini 2.0 Ultra",
    inputCost: 0.007,
    outputCost: 0.021,
    contextWindow: 1000000,
    capabilities: ["powerful", "large-context", "board-member"],
  },

  MISTRAL_LARGE_2: {
    id: "mistralai/mistral-large-2",
    name: "Mistral Large 2",
    inputCost: 0.003,
    outputCost: 0.009,
    contextWindow: 128000,
    capabilities: ["powerful", "european", "board-member"],
  },
} as const;

export type ModelKey = keyof typeof MODELS;
export type Model = (typeof MODELS)[ModelKey];

// Helper to estimate cost
export function estimateCost(
  model: Model,
  inputTokens: number,
  outputTokens: number
): number {
  return (
    (inputTokens / 1000) * model.inputCost +
    (outputTokens / 1000) * model.outputCost
  );
}
