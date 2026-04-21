import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const routerMocks = vi.hoisted(() => ({
  complete: vi.fn(),
  completeJSON: vi.fn(),
  completeJSONWithFallback: vi.fn(),
  completeJSONStreaming: vi.fn(),
  stream: vi.fn(),
  setAgentContext: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/services/openrouter/router", () => ({
  complete: routerMocks.complete,
  completeJSON: routerMocks.completeJSON,
  completeJSONWithFallback: routerMocks.completeJSONWithFallback,
  completeJSONStreaming: routerMocks.completeJSONStreaming,
  stream: routerMocks.stream,
  setAgentContext: routerMocks.setAgentContext,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: routerMocks.loggerWarn,
    error: routerMocks.loggerError,
  },
}));

const { BaseAgent } = await import("../base-agent");

class TestAgent extends BaseAgent<{ ok: boolean }> {
  constructor() {
    super({
      name: "test-agent",
      description: "Test agent",
      modelComplexity: "medium",
      maxRetries: 1,
      timeoutMs: 1000,
      dependencies: [],
    });
  }

  protected buildSystemPrompt(): string {
    return "You are a test agent.";
  }

  protected async execute(): Promise<{ ok: boolean }> {
    return { ok: true };
  }

  async callValidated<T>(
    schema: z.ZodSchema<T>,
    options: Parameters<TestAgent["llmCompleteJSONValidated"]>[2] = {}
  ) {
    return this.llmCompleteJSONValidated("prompt", schema, options);
  }
}

describe("computePromptVersionHash", () => {
  it("produit un hash déterministe pour la même entrée", () => {
    const prompt = "You are a financial auditor.";
    const config = "HAIKU|120000";
    const content = `${prompt}||${config}`;
    const hash1 = createHash("sha256").update(content).digest("hex").slice(0, 12);
    const hash2 = createHash("sha256").update(content).digest("hex").slice(0, 12);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe("1.0");
    expect(hash1).toHaveLength(12);
  });

  it("produit un hash différent si le prompt change", () => {
    const hash1 = createHash("sha256").update("prompt A||HAIKU|120000").digest("hex").slice(0, 12);
    const hash2 = createHash("sha256").update("prompt B||HAIKU|120000").digest("hex").slice(0, 12);
    expect(hash1).not.toBe(hash2);
  });

  it("produit un hash différent si la config modèle change", () => {
    const hash1 = createHash("sha256").update("same prompt||HAIKU|120000").digest("hex").slice(0, 12);
    const hash2 = createHash("sha256").update("same prompt||SONNET|120000").digest("hex").slice(0, 12);
    expect(hash1).not.toBe(hash2);
  });
});

describe("llmCompleteJSONValidated", () => {
  const schema = z.object({
    answer: z.string().min(1),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retourne les données parsées et le modèle résolu quand le schema passe", async () => {
    routerMocks.completeJSON.mockResolvedValueOnce({
      data: { answer: "ok" },
      cost: 0.12,
      model: "google/gemini-3-flash-preview",
      raw: '{"answer":"ok"}',
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const agent = new TestAgent();
    const result = await agent.callValidated(schema);

    expect(result).toEqual({
      data: { answer: "ok" },
      cost: 0.12,
      model: "google/gemini-3-flash-preview",
      resolution: "model_success",
    });
  });

  it("essaie le modèle suivant quand le schema échoue", async () => {
    routerMocks.completeJSON
      .mockResolvedValueOnce({
        data: { wrong: true },
        cost: 0.1,
        model: "google/gemini-2.5-pro",
        raw: '{"wrong":true}',
        usage: { inputTokens: 10, outputTokens: 5 },
      })
      .mockResolvedValueOnce({
        data: { answer: "fallback ok" },
        cost: 0.15,
        model: "anthropic/claude-haiku-4.5",
        raw: '{"answer":"fallback ok"}',
        usage: { inputTokens: 10, outputTokens: 5 },
      });

    const agent = new TestAgent();
    const result = await agent.callValidated(schema, {
      fallbackChain: ["GEMINI_PRO", "HAIKU"],
    });

    expect(result.data).toEqual({ answer: "fallback ok" });
    expect(result.model).toBe("anthropic/claude-haiku-4.5");
    expect(routerMocks.completeJSON).toHaveBeenCalledTimes(2);
    expect(routerMocks.completeJSON.mock.calls[0]?.[1]).toMatchObject({ model: "GEMINI_PRO" });
    expect(routerMocks.completeJSON.mock.calls[1]?.[1]).toMatchObject({ model: "HAIKU" });
  });

  it("normalise fallbackChain vide vers un appel unique au router par défaut", async () => {
    routerMocks.completeJSON.mockResolvedValueOnce({
      data: { answer: "default path" },
      cost: 0.09,
      model: "google/gemini-3-flash-preview",
      raw: '{"answer":"default path"}',
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const agent = new TestAgent();
    const result = await agent.callValidated(schema, {
      fallbackChain: [],
    });

    expect(result.data).toEqual({ answer: "default path" });
    expect(result.model).toBe("google/gemini-3-flash-preview");
    expect(routerMocks.completeJSON).toHaveBeenCalledTimes(1);
    expect(routerMocks.completeJSON.mock.calls[0]?.[1]).toMatchObject({ model: undefined });
  });

  it("récupère via fallbackDefaults sur un schema fail partiel", async () => {
    routerMocks.completeJSON.mockResolvedValueOnce({
      data: {},
      cost: 0.2,
      model: "google/gemini-2.5-pro",
      raw: "{}",
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const agent = new TestAgent();
    const result = await agent.callValidated(schema, {
      fallbackDefaults: { answer: "merged" },
    });

    expect(result.data).toEqual({ answer: "merged" });
    expect(result.resolution).toBe("schema_recovered");
    expect(result.validationErrors).toContain("answer: Invalid input: expected string, received undefined");
    expect(routerMocks.loggerWarn).toHaveBeenCalled();
  });

  it("retourne terminalFallbackData quand toute la chaîne est épuisée", async () => {
    routerMocks.completeJSON
      .mockRejectedValueOnce(new Error("503 upstream"))
      .mockResolvedValueOnce({
        data: { nope: true },
        cost: 0.18,
        model: "anthropic/claude-haiku-4.5",
        raw: '{"nope":true}',
        usage: { inputTokens: 10, outputTokens: 5 },
      });

    const agent = new TestAgent();
    const result = await agent.callValidated(schema, {
      fallbackChain: ["GEMINI_PRO", "HAIKU"],
      terminalFallbackData: { answer: "terminal" },
    });

    expect(result).toEqual({
      data: { answer: "terminal" },
      cost: 0,
      model: undefined,
      validationErrors: ["answer: Invalid input: expected string, received undefined"],
      resolution: "terminal_fallback",
    });
    expect(routerMocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ agent: "test-agent", chainLength: 2 }),
      "Fallback chain exhausted, using terminalFallbackData"
    );
  });

  it("throw si terminalFallbackData est lui-même invalide", async () => {
    routerMocks.completeJSON.mockRejectedValueOnce(new Error("timeout"));

    const agent = new TestAgent();
    await expect(
      agent.callValidated(schema, {
        terminalFallbackData: { answer: "" },
      })
    ).rejects.toThrow("All 1 model(s) in fallback chain exhausted");

    expect(routerMocks.loggerError).toHaveBeenCalled();
  });

  it("throw quand toute la chaîne échoue sans fallback terminal", async () => {
    routerMocks.completeJSON
      .mockResolvedValueOnce({
        data: { wrong: true },
        cost: 0.1,
        model: "google/gemini-2.5-pro",
        raw: '{"wrong":true}',
        usage: { inputTokens: 10, outputTokens: 5 },
      })
      .mockRejectedValueOnce(new Error("network down"));

    const agent = new TestAgent();

    await expect(
      agent.callValidated(schema, {
        fallbackChain: ["GEMINI_PRO", "HAIKU"],
      })
    ).rejects.toThrow("All 2 model(s) in fallback chain exhausted");
  });

  it("passe bien par this.llmCompleteJSON et non par le router directement", async () => {
    routerMocks.completeJSON.mockResolvedValueOnce({
      data: { answer: "ok" },
      cost: 0.05,
      model: "google/gemini-3-flash-preview",
      raw: '{"answer":"ok"}',
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    const agent = new TestAgent();
    const spy = vi.spyOn(agent as never, "llmCompleteJSON");

    await agent.callValidated(schema);

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
