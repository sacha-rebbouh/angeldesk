import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const routerMocks = vi.hoisted(() => ({
  complete: vi.fn(),
  completeJSON: vi.fn(),
  completeJSONWithFallback: vi.fn(),
  completeJSONStreaming: vi.fn(),
  stream: vi.fn(),
  getAnalysisContext: vi.fn(),
  runWithLLMContext: vi.fn(),
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
  getAnalysisContext: routerMocks.getAnalysisContext,
  runWithLLMContext: routerMocks.runWithLLMContext,
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

  // Phase C C1c — test wrappers exposant les 4 helpers concernés.
  async callJSON<T>(options: Parameters<TestAgent["llmCompleteJSON"]>[1] = {}) {
    return this.llmCompleteJSON<T>("prompt", options);
  }

  async callJSONWithFallback<T>(options: Parameters<TestAgent["llmCompleteJSONWithFallback"]>[1] = {}) {
    return this.llmCompleteJSONWithFallback<T>("prompt", options);
  }

  async callJSONStreaming<T>(options: Parameters<TestAgent["llmCompleteJSONStreaming"]>[1] = {}) {
    return this.llmCompleteJSONStreaming<T>("prompt", options);
  }
}

class LLMBackedTestAgent extends BaseAgent<{ ok: boolean }> {
  constructor() {
    super({
      name: "llm-test-agent",
      description: "LLM backed test agent",
      modelComplexity: "medium",
      maxRetries: 1,
      timeoutMs: 1000,
      dependencies: [],
    });
  }

  protected buildSystemPrompt(): string {
    return "You are an LLM-backed test agent.";
  }

  protected async execute(): Promise<{ ok: boolean }> {
    await this.llmComplete("prompt");
    return { ok: true };
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

describe("run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routerMocks.getAnalysisContext.mockReturnValue("analysis-123");
    routerMocks.runWithLLMContext.mockImplementation((_ctx: unknown, fn: () => unknown) => fn());
    routerMocks.complete.mockResolvedValue({
      content: "ok",
      cost: 0.01,
      model: "google/gemini-2.5-pro",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
  });

  it("wrappe l'execution dans un contexte LLM scope par agent", async () => {
    const agent = new TestAgent();

    const result = await agent.run({ documents: [] } as never);

    expect(result.success).toBe(true);
    expect(routerMocks.runWithLLMContext).toHaveBeenCalledWith(
      { agentName: "test-agent", analysisId: "analysis-123" },
      expect.any(Function)
    );
    expect(routerMocks.setAgentContext).toHaveBeenCalledWith("test-agent");
    expect(routerMocks.setAgentContext).toHaveBeenLastCalledWith(null);
  });

  it("injecte la these canonique dans le system prompt des agents LLM downstream", async () => {
    const agent = new LLMBackedTestAgent();

    await agent.run({
      dealId: "deal_1",
      deal: {} as never,
      canonicalDeal: {} as never,
      analysis: {
        id: "analysis-123",
        thesisBypass: true,
      },
      documents: [],
      thesis: {
        id: "thesis_1",
        reformulated: "Cette startup peut devenir le leader vertical du self-storage en Norvege.",
        problem: "Les sites independants sont mal exploites.",
        solution: "Plateforme operateur + pricing optimise.",
        whyNow: "Consolidation acceleree du marche.",
        moat: "Donnees proprietaires d'occupation et pricing.",
        pathToExit: "Rachat par un consolidateur europeen.",
        verdict: "vigilance",
        confidence: 74,
        loadBearing: [
          {
            id: "lb_1",
            statement: "Le pricing algorithmique augmente l'occupation sans compresser la marge.",
            status: "projected",
            impact: "Sinon l'unite economique et la these de consolidation se degradent.",
            validationPath: "Comparer sites pilotes vs cohortes historiques.",
          },
        ],
        alertsCount: 2,
        ycVerdict: "favorable",
        thielVerdict: "contrasted",
        angelDeskVerdict: "vigilance",
      },
    } as never);

    expect(routerMocks.complete).toHaveBeenCalledTimes(1);
    expect(routerMocks.complete.mock.calls[0]?.[1]).toMatchObject({
      systemPrompt: expect.stringContaining("## THESE CANONIQUE DU DEAL (THESIS-FIRST)"),
    });

    const systemPrompt = String(routerMocks.complete.mock.calls[0]?.[1]?.systemPrompt ?? "");
    expect(systemPrompt).toContain("Verdict unifie: vigilance (confiance 74/100)");
    expect(systemPrompt).toContain("YC=favorable | Thiel=contrasted | AngelDesk=vigilance");
    expect(systemPrompt).toContain("load-bearing assumptions");
    expect(systemPrompt).toContain("bypass these fragile actif");
    expect(systemPrompt).toContain("pricing algorithmique augmente l'occupation");
  });
});

// =============================================================================
// Phase C slice C1c — REL-006 truncation fail-closed (BaseAgent)
// =============================================================================

describe("Phase C C1c — BaseAgent fail-closed on _wasTruncated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("llmCompleteJSON", () => {
    it("THROW si `_wasTruncated: true` ET pas d'opt-in", async () => {
      routerMocks.completeJSON.mockResolvedValueOnce({
        data: { partial: true, _wasTruncated: true },
        cost: 0.01,
        model: "test-model",
        raw: "{}",
        usage: { inputTokens: 1, outputTokens: 1 },
      });

      const agent = new TestAgent();
      await expect(agent.callJSON()).rejects.toThrow(
        /LLM JSON response was truncated and auto-repaired/i,
      );
    });

    it("PAS de throw avec `allowPartialOnTruncation: true` ; retourne `wasTruncated: true`", async () => {
      routerMocks.completeJSON.mockResolvedValueOnce({
        data: { partial: true, _wasTruncated: true },
        cost: 0.01,
        model: "test-model",
        raw: "{}",
        usage: { inputTokens: 1, outputTokens: 1 },
      });

      const agent = new TestAgent();
      const result = await agent.callJSON({ allowPartialOnTruncation: true });
      expect(result.wasTruncated).toBe(true);
      // `data` est passée telle quelle au caller (qui décidera du downgrade).
      expect(result.data).toMatchObject({ partial: true });
    });

    it("Réponse normale (pas tronquée) → pas de `wasTruncated` ni throw", async () => {
      routerMocks.completeJSON.mockResolvedValueOnce({
        data: { ok: true },
        cost: 0.01,
        model: "test-model",
        raw: "{}",
        usage: { inputTokens: 1, outputTokens: 1 },
      });

      const agent = new TestAgent();
      const result = await agent.callJSON();
      expect(result.wasTruncated).toBeUndefined();
      expect(result.data).toEqual({ ok: true });
    });
  });

  describe("llmCompleteJSONWithFallback", () => {
    it("THROW si `_wasTruncated: true` sans opt-in", async () => {
      routerMocks.completeJSONWithFallback.mockResolvedValueOnce({
        data: { partial: true, _wasTruncated: true },
        cost: 0.01,
        model: "haiku-fallback",
        raw: "{}",
        usage: { inputTokens: 1, outputTokens: 1 },
      });

      const agent = new TestAgent();
      await expect(agent.callJSONWithFallback()).rejects.toThrow(
        /LLM JSON response was truncated and auto-repaired/i,
      );
    });

    it("PAS de throw avec opt-in ; retourne `wasTruncated: true`", async () => {
      routerMocks.completeJSONWithFallback.mockResolvedValueOnce({
        data: { partial: true, _wasTruncated: true },
        cost: 0.01,
        model: "haiku-fallback",
        raw: "{}",
        usage: { inputTokens: 1, outputTokens: 1 },
      });

      const agent = new TestAgent();
      const result = await agent.callJSONWithFallback({
        allowPartialOnTruncation: true,
      });
      expect(result.wasTruncated).toBe(true);
    });
  });

  describe("llmCompleteJSONValidated", () => {
    it("THROW AVANT `schema.safeParse` sans opt-in (le throw vient de llmCompleteJSON)", async () => {
      // Le schéma déclare uniquement `answer` — `_wasTruncated` est un
      // champ inconnu qui serait strip par Zod. Le throw doit arriver
      // AVANT cette validation.
      const schema = z.object({ answer: z.string() });
      routerMocks.completeJSON.mockResolvedValueOnce({
        data: { answer: "partial-ok", _wasTruncated: true },
        cost: 0.01,
        model: "test-model",
        raw: "{}",
        usage: { inputTokens: 1, outputTokens: 1 },
      });

      const agent = new TestAgent();
      // L'erreur est attrapée par le `catch` interne du loop fallback chain
      // qui itère sur `[options.model]` = `[undefined]` (1 entry). Après
      // exhaustion, throw le "fallback chain exhausted" message.
      await expect(agent.callValidated(schema)).rejects.toThrow(
        /All 1 model\(s\) in fallback chain exhausted/,
      );
      // Le log warn interne contient le message d'origine.
      expect(routerMocks.loggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringMatching(/truncated and auto-repaired/i),
        }),
        expect.any(String),
      );
    });

    it("Avec opt-in : Zod strip `_wasTruncated` mais le helper propage `wasTruncated: true` dans le résultat validé", async () => {
      const schema = z.object({ answer: z.string() });
      routerMocks.completeJSON.mockResolvedValueOnce({
        data: { answer: "partial-ok", _wasTruncated: true },
        cost: 0.01,
        model: "test-model",
        raw: "{}",
        usage: { inputTokens: 1, outputTokens: 1 },
      });

      const agent = new TestAgent();
      const result = await agent.callValidated(schema, {
        allowPartialOnTruncation: true,
      });

      // Zod a strip `_wasTruncated` du `data` parsé.
      expect(result.data).toEqual({ answer: "partial-ok" });
      expect((result.data as Record<string, unknown>)._wasTruncated).toBeUndefined();
      // Mais le flag `wasTruncated` survit dans le `ValidatedLLMResult`.
      expect(result.wasTruncated).toBe(true);
      expect(result.resolution).toBe("model_success");
    });

    it("Réponse non tronquée → `wasTruncated` absent du résultat (rétrocompat `toEqual` strict)", async () => {
      const schema = z.object({ answer: z.string() });
      routerMocks.completeJSON.mockResolvedValueOnce({
        data: { answer: "ok" },
        cost: 0.01,
        model: "test-model",
        raw: "{}",
        usage: { inputTokens: 1, outputTokens: 1 },
      });

      const agent = new TestAgent();
      const result = await agent.callValidated(schema);
      expect(result.wasTruncated).toBeUndefined();
    });
  });

  describe("llmCompleteJSONStreaming", () => {
    it("THROW si `result.wasTruncated === true` sans opt-in (continuation épuisée)", async () => {
      routerMocks.completeJSONStreaming.mockResolvedValueOnce({
        data: { partial: true },
        cost: 0.01,
        model: "test-model",
        rawContent: "{}",
        continuationAttempts: 3,
        wasTruncated: true,
        usage: { inputTokens: 1, outputTokens: 1 },
      });

      const agent = new TestAgent();
      await expect(agent.callJSONStreaming()).rejects.toThrow(
        /LLM streaming response was truncated and auto-repaired/i,
      );
    });

    it("PAS de throw avec opt-in ; retourne `wasTruncated: true`", async () => {
      routerMocks.completeJSONStreaming.mockResolvedValueOnce({
        data: { partial: true },
        cost: 0.01,
        model: "test-model",
        rawContent: "{}",
        continuationAttempts: 3,
        wasTruncated: true,
        usage: { inputTokens: 1, outputTokens: 1 },
      });

      const agent = new TestAgent();
      const result = await agent.callJSONStreaming({
        allowPartialOnTruncation: true,
      });
      expect(result.wasTruncated).toBe(true);
    });

    it("Continuation réussie (`wasTruncated: false`) → pas de throw même sans opt-in", async () => {
      routerMocks.completeJSONStreaming.mockResolvedValueOnce({
        data: { full: true },
        cost: 0.01,
        model: "test-model",
        rawContent: "{}",
        continuationAttempts: 1,
        wasTruncated: false,
        usage: { inputTokens: 1, outputTokens: 1 },
      });

      const agent = new TestAgent();
      const result = await agent.callJSONStreaming();
      expect(result.wasTruncated).toBe(false);
      expect(result.data).toEqual({ full: true });
    });
  });

  describe("checkTruncation — override pour les agents opt-in (financial-auditor pattern)", () => {
    it("Ajoute la limitation quand `wasTruncatedOverride: true`, même si `data._wasTruncated` est absent (cas Zod strip)", () => {
      class ExposedTestAgent extends TestAgent {
        public testCheckTruncation(
          data: Record<string, unknown>,
          override?: boolean,
        ): boolean {
          return this.checkTruncation(data, override);
        }
      }
      const agent = new ExposedTestAgent();
      // Cas réel : Zod a strip `_wasTruncated` à la validation. Sans
      // l'override, `checkTruncation` ne détecte rien. AVEC override,
      // la limitation est ajoutée.
      const data: Record<string, unknown> = { meta: { limitations: [] as string[] } };

      const wasFlagged = agent.testCheckTruncation(data, true);

      expect(wasFlagged).toBe(true);
      const meta = data.meta as { limitations: string[] };
      expect(meta.limitations.length).toBe(1);
      expect(meta.limitations[0]).toMatch(/tronquee|tronquée/i);
    });

    it("Sans override et sans `_wasTruncated`, ne flag rien", () => {
      class ExposedTestAgent extends TestAgent {
        public testCheckTruncation(
          data: Record<string, unknown>,
          override?: boolean,
        ): boolean {
          return this.checkTruncation(data, override);
        }
      }
      const agent = new ExposedTestAgent();
      const data: Record<string, unknown> = { meta: { limitations: [] as string[] } };
      const wasFlagged = agent.testCheckTruncation(data);
      expect(wasFlagged).toBe(false);
    });
  });
});

// =============================================================================
// Phase C C1c — Source guard : couverture exhaustive et allowlist opt-in
// =============================================================================

describe("Phase C C1c — Source guard truncation fail-closed", () => {
  const baseAgentPath = "src/agents/base-agent.ts";

  it("BaseAgent lit `_wasTruncated` et expose le flag `allowPartialOnTruncation`", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(
      path.resolve(process.cwd(), baseAgentPath),
      "utf-8",
    );
    expect(source).toContain("_wasTruncated");
    expect(source).toContain("allowPartialOnTruncation");
    // Vérifie que les 4 helpers utilisent le check centralisé OU font le check eux-mêmes
    expect(source).toContain("assertNotTruncatedResult");
    // Streaming : check `result.wasTruncated === true` dédié
    expect(/result\.wasTruncated\s*===\s*true/.test(source)).toBe(true);
  });

  it("Aucun agent hors allowlist n'utilise `allowPartialOnTruncation: true`", async () => {
    // Allowlist : seul `financial-auditor` est autorisé à degrader
    // gracieusement (cf. plan C1c).
    const ALLOWED = new Set<string>(["src/agents/tier1/financial-auditor.ts"]);

    const fs = await import("node:fs");
    const path = await import("node:path");
    const { glob } = await import("node:fs/promises").then(() => ({
      glob: undefined as never,
    })).catch(() => ({ glob: undefined as never }));
    void glob;

    // Scan manuel sur les chemins clés Phase A.
    const candidates = [
      "src/agents/tier1",
      "src/agents/tier3",
      "src/agents/tier0",
      "src/agents/chat",
      "src/agents/thesis",
      "src/agents/board",
    ];
    const violations: { file: string; line: number }[] = [];
    for (const dir of candidates) {
      const dirPath = path.resolve(process.cwd(), dir);
      if (!fs.existsSync(dirPath)) continue;
      const entries = fs.readdirSync(dirPath);
      for (const entry of entries) {
        if (!entry.endsWith(".ts") || entry.includes(".test.")) continue;
        const filePath = path.join(dirPath, entry);
        const rel = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) continue;
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i += 1) {
          const line = lines[i];
          if (/allowPartialOnTruncation\s*:\s*true/.test(line)) {
            if (!ALLOWED.has(rel)) {
              violations.push({ file: rel, line: i + 1 });
            }
          }
        }
      }
    }

    if (violations.length > 0) {
      const detail = violations.map((v) => `  ${v.file}:${v.line}`).join("\n");
      throw new Error(
        `Source guard C1c — fichiers hors allowlist utilisent \`allowPartialOnTruncation: true\`:\n${detail}\n` +
          `Allowlist actuelle: ${[...ALLOWED].join(", ")}`,
      );
    }
    expect(violations).toEqual([]);
  });

  it("`financial-auditor.ts` est correctement opt-in et lit `wasTruncated` du résultat", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/agents/tier1/financial-auditor.ts"),
      "utf-8",
    );
    expect(/allowPartialOnTruncation\s*:\s*true/.test(source)).toBe(true);
    expect(/wasTruncated\s*:\s*llmWasTruncated/.test(source)).toBe(true);
    expect(/checkTruncation\([^)]*,\s*\w+/.test(source)).toBe(true);
  });
});
