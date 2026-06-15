import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentContext, AgentResultWithTrace } from "../types";

// E2 (Phase E — concurrence) : test ROUGE de contamination cross-deal.
// Deux run() concurrents sur le MÊME agent singleton ne doivent jamais
// fuiter l'état d'un run dans l'autre (thèse deal B injectée dans les
// prompts deal A, coût/compteurs croisés). Le test passe uniquement par
// l'API publique run() → il reste valable quelle que soit l'implémentation
// retenue pour l'isolation (RunState explicite vs AsyncLocalStorage).

const routerMocks = vi.hoisted(() => ({
  complete: vi.fn(),
  getAnalysisContext: vi.fn(),
  runWithLLMContext: vi.fn(),
  setAgentContext: vi.fn(),
}));

vi.mock("@/services/openrouter/router", () => ({
  complete: routerMocks.complete,
  completeJSON: vi.fn(),
  completeJSONWithFallback: vi.fn(),
  completeJSONStreaming: vi.fn(),
  stream: vi.fn(),
  getAnalysisContext: routerMocks.getAnalysisContext,
  runWithLLMContext: routerMocks.runWithLLMContext,
  setAgentContext: routerMocks.setAgentContext,
}));

const { BaseAgent } = await import("../base-agent");

interface CapturedCall {
  user: string;
  system: string;
}

/**
 * Agent de test exposant un point de rendez-vous (`barrier`) entre la mise
 * en place de l'état du run et l'appel LLM, afin d'orchestrer un entrelacement
 * déterministe de deux run() concurrents.
 */
class ConcurrencyTestAgent extends BaseAgent<{ ok: boolean }> {
  barrier: Promise<void> = Promise.resolve();

  constructor() {
    super({
      name: "concurrency-agent",
      description: "Concurrency isolation test agent",
      modelComplexity: "medium",
      maxRetries: 1,
      timeoutMs: 1000,
      dependencies: [],
    });
  }

  protected buildSystemPrompt(): string {
    return "BASE_SYSTEM_PROMPT";
  }

  protected async execute(context: AgentContext): Promise<{ ok: boolean }> {
    // Les vrais agents tier1/tier3 écrivent this._dealStage ici, puis font
    // leurs appels LLM. On reproduit ce séquencement : état posé AVANT le
    // point de rendez-vous, appel LLM APRÈS.
    this._dealStage = context.canonicalDeal.stage;
    await this.barrier;
    await this.llmComplete(`DEAL::${context.dealId}`);
    return { ok: true };
  }
}

function makeContext(dealId: string, marker: string, stage: string): AgentContext {
  return {
    dealId,
    deal: { stage } as unknown as AgentContext["deal"],
    canonicalDeal: { stage } as unknown as AgentContext["canonicalDeal"],
    documents: [],
    thesis: {
      id: `thesis-${dealId}`,
      reformulated: marker,
      problem: `${marker}_PROBLEM`,
      solution: `${marker}_SOLUTION`,
      whyNow: `${marker}_WHYNOW`,
      moat: `${marker}_MOAT`,
      verdict: "favorable",
      confidence: 70,
      loadBearing: [],
      alertsCount: 0,
      ycVerdict: "favorable",
      thielVerdict: "favorable",
      angelDeskVerdict: "favorable",
    },
  } as unknown as AgentContext;
}

describe("BaseAgent — isolation de concurrence (E2)", () => {
  let captured: CapturedCall[];

  beforeEach(() => {
    captured = [];
    routerMocks.getAnalysisContext.mockReturnValue("analysis-test");
    routerMocks.setAgentContext.mockReturnValue(undefined);
    // Passthrough : exécute réellement le corps de run() (l'ALS router est
    // remplacé par ce passthrough ; l'isolation testée est celle de BaseAgent).
    routerMocks.runWithLLMContext.mockImplementation(
      (_ctx: unknown, fn: () => unknown) => fn()
    );
    routerMocks.complete.mockImplementation(async (prompt: string, opts: { systemPrompt: string }) => {
      captured.push({ user: prompt, system: opts.systemPrompt });
      return {
        content: "ok",
        cost: 0.01,
        usage: { inputTokens: 10, outputTokens: 5 },
        model: "test-model",
      };
    });
  });

  it("n'injecte jamais la thèse d'un deal dans le prompt système d'un autre deal", async () => {
    const agent = new ConcurrencyTestAgent();

    let release!: () => void;
    agent.barrier = new Promise<void>((resolve) => {
      release = resolve;
    });

    // run(A) avance jusqu'au rendez-vous (pose thèse ALPHA), puis run(B)
    // avance jusqu'au rendez-vous (écrase l'état partagé avec la thèse BRAVO),
    // ENSUITE on libère : si l'état n'est pas isolé par run, l'appel LLM de A
    // lira la thèse de B.
    const pA = agent.run(makeContext("A", "THESIS_MARKER_ALPHA", "seed"));
    const pB = agent.run(makeContext("B", "THESIS_MARKER_BRAVO", "series_a"));
    release();
    const [resultA, resultB] = await Promise.all([pA, pB]);

    const callA = captured.find((c) => c.user === "DEAL::A");
    const callB = captured.find((c) => c.user === "DEAL::B");

    expect(callA, "appel LLM du deal A capturé").toBeDefined();
    expect(callB, "appel LLM du deal B capturé").toBeDefined();

    // Cœur de l'invariant : pas de contamination croisée de la thèse.
    expect(callA!.system).toContain("THESIS_MARKER_ALPHA");
    expect(callA!.system).not.toContain("THESIS_MARKER_BRAVO");
    expect(callB!.system).toContain("THESIS_MARKER_BRAVO");
    expect(callB!.system).not.toContain("THESIS_MARKER_ALPHA");

    // Le coût et le compteur d'appels de chaque run restent attribués à ce run.
    expect(resultA.cost).toBeCloseTo(0.01, 5);
    expect(resultB.cost).toBeCloseTo(0.01, 5);
    expect((resultA as unknown as AgentResultWithTrace)._traceMetrics?.llmCallCount).toBe(1);
    expect((resultB as unknown as AgentResultWithTrace)._traceMetrics?.llmCallCount).toBe(1);
  });

  // Garde byte-equivalence (ordre d'assemblage de buildFullSystemPrompt). La
  // migration de l'état mutable vers un RunState ne doit PAS réordonner ni
  // perdre une section du prompt système. On ne peut pas figer un golden exact
  // (le prompt embarque la date du jour), donc on verrouille l'ORDRE canonique
  // des sections.
  it("assemble les sections du prompt système dans l'ordre canonique", async () => {
    const agent = new ConcurrencyTestAgent();
    await agent.run(makeContext("X", "THESIS_MARKER_SOLO", "seed"));

    const system = captured.find((c) => c.user === "DEAL::X")?.system;
    expect(system).toBeDefined();

    const CANONICAL_ORDER = [
      "BASE_SYSTEM_PROMPT", // buildSystemPrompt()
      "## THESE CANONIQUE DU DEAL (THESIS-FIRST)", // _contextualSystemPrompt (RunState)
      "## CONTEXTE TEMPOREL (CRITIQUE)", // dateContext
      "PROTECTION ANTI-ANCHORING (CRITIQUE)", // getAntiAnchoringGuidance()
      "CALCUL DE LA CONFIDENCE (CRITIQUE", // getConfidenceGuidance()
      "## CLASSIFICATION DE FIABILITÉ DES DONNÉES (OBLIGATOIRE)", // getDataReliabilityDirective()
      "## TON ANALYTIQUE OBLIGATOIRE (RÈGLE N°1)", // getAnalyticalToneDirective()
      "## Anti-Hallucination Directive — Abstention Permission", // getAbstentionPermission()
      "## Anti-Hallucination Directive — Citation Demand", // getCitationDemand()
      "## Anti-Hallucination Directive — Evidence-Based Self-Audit", // getSelfAuditDirective()
      "## Anti-Hallucination Directive — Evidence Solidity Classification", // getStructuredUncertaintyDirective()
    ];

    let previousIndex = -1;
    for (const marker of CANONICAL_ORDER) {
      const index = system!.indexOf(marker);
      expect(index, `section présente: ${marker}`).toBeGreaterThanOrEqual(0);
      expect(index, `section ordonnée après la précédente: ${marker}`).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }
  });
});
