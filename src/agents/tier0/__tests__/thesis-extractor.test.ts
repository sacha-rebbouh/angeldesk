import { describe, expect, it, vi } from "vitest";

const openRouterMocks = vi.hoisted(() => ({
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
  complete: openRouterMocks.complete,
  completeJSON: openRouterMocks.completeJSON,
  completeJSONWithFallback: openRouterMocks.completeJSONWithFallback,
  completeJSONStreaming: openRouterMocks.completeJSONStreaming,
  stream: openRouterMocks.stream,
  getAnalysisContext: openRouterMocks.getAnalysisContext,
  runWithLLMContext: openRouterMocks.runWithLLMContext,
  setAgentContext: openRouterMocks.setAgentContext,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: openRouterMocks.loggerWarn,
    error: openRouterMocks.loggerError,
  },
}));

const { ThesisExtractorAgent } = await import("../thesis-extractor");

type ThesisExtractorTestAccess = {
  llmCompleteJSON: (...args: unknown[]) => Promise<unknown>;
  llmCompleteJSONValidated: (...args: unknown[]) => Promise<unknown>;
  execute: (context: unknown) => Promise<{
    reformulated: string;
    loadBearing: unknown[];
    alerts: Array<{ title: string; linkedAssumptionId?: string }>;
    verdict: string;
    ycLens: { availability?: string };
  }>;
  buildCoreUserPrompt: (context: unknown, contextSummary: string) => string;
  buildContextSummary: (context: unknown) => string;
};

describe("ThesisExtractorAgent degradation handling", () => {
  it("accepts a core thesis payload wrapped under a thesis key", async () => {
    const agent = new ThesisExtractorAgent();
    const testAgent = agent as unknown as ThesisExtractorTestAccess;
    const llmSpy = vi.spyOn(testAgent, "llmCompleteJSON");

    llmSpy
      .mockResolvedValueOnce({
        data: {
          thesis: {
            reformulatedClaims: [
              {
                kind: "unknown",
                text: "Bodhotell construit une infrastructure hôtelière pour chiens.",
              },
            ],
            problemClaims: [
              { kind: "unknown", text: "Les propriétaires peinent à trouver une garde fiable et premium." },
            ],
            solutionClaims: [
              { kind: "unknown", text: "Un réseau d'hôtels canins opérés avec standardisation forte." },
            ],
            whyNowClaims: [
              { kind: "unknown", text: "La premiumisation du pet care accélère maintenant." },
            ],
            moatClaims: [],
            pathToExitClaims: [],
            loadBearing: [
              {
                id: "lb_1",
                statement: "La demande premium restera soutenue.",
                status: "declared",
                impact: "Le remplissage des hôtels décroche.",
                validationPath: "Analyser le repeat booking sur 12 mois",
              },
            ],
            alerts: [
              {
                severity: "medium",
                category: "assumption_fragile",
                title: "Traction encore à confirmer",
                detail: "Les signaux existent mais restent précoces.",
                linkedAssumptionId: null,
              },
            ],
          },
        },
        cost: 1,
        model: "anthropic/claude-sonnet-4.5",
      })
      .mockResolvedValueOnce({
        data: {
          verdict: "favorable",
          confidence: 78,
          question: "PMF ?",
          claims: [],
          failures: [],
          strengths: ["Usage récurrent"],
          summary: "YC voit un vrai signal de PMF.",
        },
        cost: 1,
        model: "google/gemini-2.5-pro",
      })
      .mockResolvedValueOnce({
        data: {
          verdict: "favorable",
          confidence: 72,
          question: "Monopole ?",
          claims: [],
          failures: [],
          strengths: ["Densité opérationnelle"],
          summary: "Thiel voit une différenciation défendable.",
        },
        cost: 1,
        model: "google/gemini-2.5-pro",
      })
      .mockResolvedValueOnce({
        data: {
          verdict: "contrasted",
          confidence: 61,
          question: "Capital privé ?",
          claims: [],
          failures: ["Capex initial significatif"],
          strengths: [],
          summary: "Angel Desk reste plus prudent sur l'intensité capitalistique.",
        },
        cost: 1,
        model: "google/gemini-2.5-pro",
      });

    const result = await testAgent.execute({
      documents: [],
      canonicalDeal: {
        id: "deal_1",
        name: "Bodhotell",
      },
    });

    expect(result.reformulated).toContain("Bodhotell");
    expect(result.loadBearing).toHaveLength(1);
    expect(result.alerts[0]?.linkedAssumptionId).toBeUndefined();
    expect(llmSpy).toHaveBeenCalledTimes(4);
  });

  it("excludes degraded framework lenses from verdict consolidation and BA alerts", async () => {
    const agent = new ThesisExtractorAgent();
    const testAgent = agent as unknown as ThesisExtractorTestAccess;
    const validatedSpy = vi.spyOn(testAgent, "llmCompleteJSONValidated");

    validatedSpy
      .mockResolvedValueOnce({
        data: {
          reformulatedClaims: [{ kind: "unknown", text: "Une thèse structurée." }],
          problemClaims: [{ kind: "unknown", text: "Un problème important." }],
          solutionClaims: [{ kind: "unknown", text: "Une solution crédible." }],
          whyNowClaims: [{ kind: "unknown", text: "Le marché s'ouvre maintenant." }],
          moatClaims: [],
          pathToExitClaims: [],
          loadBearing: [],
          alerts: [],
        },
        cost: 1,
        model: "anthropic/claude-sonnet-4.5",
        resolution: "model_success",
      })
      .mockResolvedValueOnce({
        data: {
          verdict: "alert_dominant",
          confidence: 0,
          question: "PMF ?",
          claims: [],
          failures: ["[THESIS QUALITY] YC indisponible"],
          strengths: [],
          summary: "yc lens evaluation unavailable (chain exhausted)",
        },
        cost: 0,
        model: undefined,
        resolution: "terminal_fallback",
      })
      .mockResolvedValueOnce({
        data: {
          verdict: "favorable",
          confidence: 74,
          question: "Monopole ?",
          claims: [],
          failures: [],
          strengths: ["Différenciation crédible"],
          summary: "Thiel reste positif",
        },
        cost: 1,
        model: "google/gemini-2.5-pro",
        resolution: "model_success",
      })
      .mockResolvedValueOnce({
        data: {
          verdict: "favorable",
          confidence: 70,
          question: "Capital privé ?",
          claims: [],
          failures: ["[DEAL ACCESSIBILITY] Ticket élevé mais finançable"],
          strengths: [],
          summary: "Angel Desk reste positif",
        },
        cost: 1,
        model: "google/gemini-2.5-pro",
        resolution: "model_success",
      });

    const result = await testAgent.execute({
      documents: [],
      canonicalDeal: {
        id: "deal_1",
        name: "Deal test",
      },
    });

    expect(result.verdict).toBe("favorable");
    expect(result.ycLens.availability).toBe("degraded_chain_exhausted");
    expect(result.alerts.some((alert: { title: string }) => alert.title.includes("[yc]"))).toBe(false);
  });

  it("throws if all framework lenses are degraded", async () => {
    const agent = new ThesisExtractorAgent();
    const testAgent = agent as unknown as ThesisExtractorTestAccess;
    const validatedSpy = vi.spyOn(testAgent, "llmCompleteJSONValidated");

    validatedSpy
      .mockResolvedValueOnce({
        data: {
          reformulatedClaims: [{ kind: "unknown", text: "Une thèse structurée." }],
          problemClaims: [{ kind: "unknown", text: "Un problème important." }],
          solutionClaims: [{ kind: "unknown", text: "Une solution crédible." }],
          whyNowClaims: [{ kind: "unknown", text: "Le marché s'ouvre maintenant." }],
          moatClaims: [],
          pathToExitClaims: [],
          loadBearing: [],
          alerts: [],
        },
        cost: 1,
        model: "anthropic/claude-sonnet-4.5",
        resolution: "model_success",
      })
      .mockResolvedValue({
        data: {
          verdict: "contrasted",
          confidence: 0,
          question: "N/A",
          claims: [],
          failures: ["Framework unavailable"],
          strengths: [],
          summary: "framework unavailable (chain exhausted)",
        },
        cost: 0,
        model: undefined,
        resolution: "terminal_fallback",
      });

    await expect(
      testAgent.execute({
        documents: [],
        canonicalDeal: {
          id: "deal_1",
          name: "Deal test",
        },
      })
    ).rejects.toThrow("All thesis frameworks degraded");
  });

  it("states in the core prompt that thesis fields must stay at the root", () => {
    const agent = new ThesisExtractorAgent();
    const testAgent = agent as unknown as ThesisExtractorTestAccess;

    const prompt = testAgent.buildCoreUserPrompt(
      {
        documents: [],
        canonicalDeal: {
          id: "deal_1",
          name: "Bodhotell",
        },
      },
      "context"
    );

    expect(prompt).toContain("PAS de cle enveloppante type \"thesis\"");
    expect(prompt).toContain("\"reformulatedClaims\"");
    expect(prompt).toContain("## THESIS FACT SCOPE");
    expect(prompt).toContain("Tu n'as PAS le droit de calculer toi-meme une marge");
  });

  it("fails closed when the core structured claims reference an unavailable EBITDA margin metric", async () => {
    const agent = new ThesisExtractorAgent();
    const testAgent = agent as unknown as ThesisExtractorTestAccess;
    const validatedSpy = vi.spyOn(testAgent, "llmCompleteJSONValidated");

    validatedSpy.mockResolvedValueOnce({
      data: {
        reformulatedClaims: [
          {
            kind: "derived_metric",
            metricKey: "ebitda_margin",
            framing: "La societe vise une marge EBITDA de",
          },
        ],
        problemClaims: [{ kind: "unknown", text: "Un problème important." }],
        solutionClaims: [{ kind: "unknown", text: "Une solution crédible." }],
        whyNowClaims: [{ kind: "unknown", text: "Le marché s'ouvre maintenant." }],
        moatClaims: [],
        pathToExitClaims: [],
        loadBearing: [],
        alerts: [],
      },
      cost: 1,
      model: "anthropic/claude-sonnet-4.5",
      resolution: "model_success",
    });

    await expect(
      testAgent.execute({
        documents: [],
        canonicalDeal: {
          id: "deal_1",
          name: "Deal test",
        },
        factStore: [],
      })
    ).rejects.toThrow("Invalid structured thesis claims detected");
  });

  it("injects sector benchmarks and funding DB benchmarks into the thesis context summary", () => {
    const agent = new ThesisExtractorAgent();
    const testAgent = agent as unknown as ThesisExtractorTestAccess;

    const summary = testAgent.buildContextSummary({
      documents: [],
      canonicalDeal: {
        id: "deal_1",
        name: "Deal test",
        sector: "SaaS",
        stage: "SEED",
      },
      fundingContext: {
        valuationBenchmarks: {
          p25: 8,
          median: 12,
          p75: 18,
        },
        benchmarks: {
          arrMultipleMedian: 10,
        },
        sectorBenchmarks: {
          paybackMonthsMedian: 14,
        },
      },
      contextEngine: {
        marketData: {
          benchmarks: [
            {
              metricName: "ARR Growth",
              p25: 40,
              median: 85,
              p75: 140,
              unit: "%",
              sector: "SaaS",
              stage: "SEED",
              source: "OPENVC",
              lastUpdated: "2026-01-01",
            },
          ],
        },
      },
    });

    expect(summary).toContain("### BENCHMARKS SECTORIELS ETABLIS");
    expect(summary).toContain("arrGrowthYoY");
    expect(summary).toContain("### VALUATION BENCHMARKS (Funding DB)");
    expect(summary).toContain("\"median\": 12");
    expect(summary).toContain("ARR Growth");
    expect(summary).toContain("OPENVC");
  });
});
