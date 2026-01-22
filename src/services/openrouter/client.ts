import OpenAI from "openai";

export const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL,
    "X-Title": "FullInvest",
  },
});

// Model registry with capabilities and costs
export const MODELS = {
  // Fast models for simple tasks
  HAIKU: {
    id: "anthropic/claude-3-haiku",
    name: "Claude 3 Haiku",
    inputCost: 0.00025, // per 1K tokens
    outputCost: 0.00125,
    contextWindow: 200000,
    capabilities: ["fast", "cheap", "extraction"],
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

  GPT4O_MINI: {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    inputCost: 0.00015,
    outputCost: 0.0006,
    contextWindow: 128000,
    capabilities: ["fast", "cheap", "general"],
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
