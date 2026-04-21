import { describe, expect, it, vi } from "vitest";

const openRouterMocks = vi.hoisted(() => ({
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
  complete: openRouterMocks.complete,
  completeJSON: openRouterMocks.completeJSON,
  completeJSONWithFallback: openRouterMocks.completeJSONWithFallback,
  completeJSONStreaming: openRouterMocks.completeJSONStreaming,
  stream: openRouterMocks.stream,
  setAgentContext: openRouterMocks.setAgentContext,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: openRouterMocks.loggerWarn,
    error: openRouterMocks.loggerError,
  },
}));

const { ThesisExtractorAgent } = await import("../thesis-extractor");

describe("ThesisExtractorAgent degradation handling", () => {
  it("excludes degraded framework lenses from verdict consolidation and BA alerts", async () => {
    const agent = new ThesisExtractorAgent();
    const validatedSpy = vi.spyOn(agent as any, "llmCompleteJSONValidated") as any;

    validatedSpy
      .mockResolvedValueOnce({
        data: {
          reformulated: "Une thèse structurée",
          problem: "Un problème important",
          solution: "Une solution crédible",
          whyNow: "Le marché s'ouvre maintenant",
          moat: null,
          pathToExit: null,
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

    const result = await (agent as any).execute({
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
    const validatedSpy = vi.spyOn(agent as any, "llmCompleteJSONValidated") as any;

    validatedSpy
      .mockResolvedValueOnce({
        data: {
          reformulated: "Une thèse structurée",
          problem: "Un problème important",
          solution: "Une solution crédible",
          whyNow: "Le marché s'ouvre maintenant",
          moat: null,
          pathToExit: null,
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
      (agent as any).execute({
        documents: [],
        canonicalDeal: {
          id: "deal_1",
          name: "Deal test",
        },
      })
    ).rejects.toThrow("All thesis frameworks degraded");
  });
});
