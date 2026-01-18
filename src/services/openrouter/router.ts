import { openrouter, MODELS, type ModelKey } from "./client";

export type TaskComplexity = "simple" | "medium" | "complex" | "critical";

// Model selection based on task complexity
export function selectModel(complexity: TaskComplexity): ModelKey {
  switch (complexity) {
    case "simple":
      return "HAIKU";
    case "medium":
      return "SONNET";
    case "complex":
      return "GPT4O";
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

  const selectedModelKey = modelKey ?? selectModel(complexity);
  const model = MODELS[selectedModelKey];

  const messages: Array<{ role: "system" | "user"; content: string }> = [];

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  messages.push({ role: "user", content: prompt });

  const response = await openrouter.chat.completions.create({
    model: model.id,
    messages,
    max_tokens: maxTokens,
    temperature,
  });

  const content = response.choices[0]?.message?.content ?? "";
  const usage = response.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  const cost =
    (usage.prompt_tokens / 1000) * model.inputCost +
    (usage.completion_tokens / 1000) * model.outputCost;

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
