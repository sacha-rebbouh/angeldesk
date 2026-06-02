import { describe, it, expect, vi } from "vitest";
import { runTerminalStepwiseDriver, STEPWISE_GRAPH_VERSION } from "../full-analysis-driver";
import { InlineStepRunner, FakeStepRunner } from "../step-runner";
import type { AnalysisResult } from "../types";

// Golden DRIVER (D.5d-1c) — teste le driver stepwise « 1 step englobante » (Modèle B) avec
// un corps pipeline STUBÉ (helpers stubés), sans DB. Couvre :
//   - E1 : single-pass Inline === single-pass Fake === liveResult (les deux retournent le
//     liveResult sur run sain ; E1 est STRUCTUREL au Modèle B).
//   - OFF byte-inert : stepwise=false → liveResult exact, jamais d'enveloppe ni de relecture.
//   - E2/durabilité : replay (Fake mémoïse, ré-invocation de la fonction) → le corps NE
//     re-tourne PAS, reconstruction depuis l'enveloppe wire (Date ravivées) + results relus.

const TS = new Date("2026-06-01T12:00:00.000Z");

function makeResult(): AnalysisResult {
  return {
    sessionId: "a1",
    dealId: "d1",
    type: "full_analysis",
    success: true,
    results: { "deck-forensics": { success: true }, "financial-auditor": { success: true } } as unknown as AnalysisResult["results"],
    totalCost: 2.5,
    totalTimeMs: 123000,
    summary: "deep dive complet",
    earlyWarnings: [
      {
        id: "w1",
        timestamp: TS, // <- dents E2 : Date top-level qui doit être ravivée au replay
        agentName: "red-flag-detector",
        severity: "high",
        category: "financial_critical",
        title: "marge brute incohérente",
        description: "…",
        evidence: ["deck p.12"],
        confidence: 82,
        recommendation: "investigate",
      },
    ],
    hasCriticalWarnings: false,
    tiersExecuted: ["tier0", "tier1", "tier3"],
  } as AnalysisResult;
}

describe("runTerminalStepwiseDriver (golden driver D.5d-1c)", () => {
  it("E1 — Inline single-pass retourne le liveResult EXACT (Dates intactes)", async () => {
    const live = makeResult();
    const r = await runTerminalStepwiseDriver({
      stepRunner: new InlineStepRunner(),
      stepwise: true,
      pipeline: async () => live,
      loadPersistedResults: async () => {
        throw new Error("loadPersistedResults ne doit PAS être appelé sur run sain");
      },
    });
    expect(r).toBe(live); // même référence : aucune reconstruction
    expect((r.earlyWarnings![0].timestamp as Date) instanceof Date).toBe(true);
  });

  it("E1 — Fake single-pass === Inline single-pass (Modèle B : les deux rendent liveResult)", async () => {
    const live = makeResult();
    const loadPersistedResults = async () => live.results;
    const inline = await runTerminalStepwiseDriver({
      stepRunner: new InlineStepRunner(),
      stepwise: true,
      pipeline: async () => makeResult(),
      loadPersistedResults,
    });
    const fake = await runTerminalStepwiseDriver({
      stepRunner: new FakeStepRunner(),
      stepwise: true,
      pipeline: async () => makeResult(),
      loadPersistedResults,
    });
    expect(fake).toEqual(inline);
    expect(fake).toEqual(makeResult());
  });

  it("OFF (stepwise=false) — byte-inert : liveResult exact, ni enveloppe ni relecture", async () => {
    const live = makeResult();
    const load = vi.fn(async () => live.results);
    const r = await runTerminalStepwiseDriver({
      stepRunner: new InlineStepRunner(),
      stepwise: false,
      pipeline: async () => live,
      loadPersistedResults: load,
    });
    expect(r).toBe(live);
    expect(load).not.toHaveBeenCalled();
  });

  it("E2/durabilité — au replay le corps NE re-tourne PAS, reconstruction depuis l'enveloppe + results relus", async () => {
    const fake = new FakeStepRunner();
    const live = makeResult();
    const pipeline = vi.fn(async () => live);
    const loadPersistedResults = vi.fn(async () => live.results);

    // Pass 1 (run initial) : le corps tourne, l'enveloppe est mémoïsée (sans results).
    const r1 = await runTerminalStepwiseDriver({ stepRunner: fake, stepwise: true, pipeline, loadPersistedResults });
    expect(r1).toBe(live);
    expect(pipeline).toHaveBeenCalledTimes(1);
    expect(loadPersistedResults).not.toHaveBeenCalled();

    // Pass 2 (replay : Inngest ré-invoque la fonction) : 'run-analysis' mémoïsé → le corps
    // NE re-tourne PAS (pipeline2 throw si appelé), reconstruction depuis l'enveloppe.
    const pipeline2 = vi.fn(async () => {
      throw new Error("le corps ne doit PAS re-tourner au replay (durabilité)");
    });
    const r2 = await runTerminalStepwiseDriver({
      stepRunner: fake,
      stepwise: true,
      pipeline: pipeline2,
      loadPersistedResults,
    });
    expect(pipeline2).not.toHaveBeenCalled();
    expect(fake.memoHits).toBe(1); // step servi depuis le memo
    expect(loadPersistedResults).toHaveBeenCalledTimes(1); // results relus une fois

    // Reconstruction === run ininterrompu : Date ravivée (pas une string), results réinjectés.
    expect(r2).toEqual(r1);
    expect(r2.earlyWarnings![0].timestamp).toBeInstanceOf(Date);
    expect(r2.results).toEqual(live.results);
  });

  it("E2 — results manquants en persistance → {} (réinjection défensive)", async () => {
    const fake = new FakeStepRunner();
    const live = makeResult();
    await runTerminalStepwiseDriver({ stepRunner: fake, stepwise: true, pipeline: async () => live, loadPersistedResults: async () => live.results });
    const r2 = await runTerminalStepwiseDriver({
      stepRunner: fake,
      stepwise: true,
      pipeline: async () => { throw new Error("ne doit pas re-tourner"); },
      loadPersistedResults: async () => null,
    });
    expect(r2.results).toEqual({});
    expect(r2.sessionId).toBe("a1");
  });

  it("stepId (d-2a) : défaut 'run-analysis' (back-compat), paramétrable = clé de mémoïsation", async () => {
    const fakeDefault = new FakeStepRunner();
    await runTerminalStepwiseDriver({
      stepRunner: fakeDefault, stepwise: true, pipeline: async () => makeResult(), loadPersistedResults: async () => null,
    });
    expect(fakeDefault.executedIds).toEqual(["run-analysis"]);

    const fakeCustom = new FakeStepRunner();
    await runTerminalStepwiseDriver({
      stepRunner: fakeCustom, stepwise: true, stepId: "terminal-final-completion",
      pipeline: async () => makeResult(), loadPersistedResults: async () => null,
    });
    expect(fakeCustom.executedIds).toEqual(["terminal-final-completion"]);
    expect(fakeCustom.executedIds).not.toContain("run-analysis");
  });
});

describe("STEPWISE_GRAPH_VERSION", () => {
  it("vaut 3 (graphe FIN Tier1 per-phase + post-tier1-glue) à d-3", () => {
    expect(STEPWISE_GRAPH_VERSION).toBe(3);
  });
});
