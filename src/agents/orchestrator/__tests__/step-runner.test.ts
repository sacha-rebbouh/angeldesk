import { describe, it, expect } from "vitest";
import {
  type StepRunner,
  InlineStepRunner,
  InngestStepRunner,
  FakeStepRunner,
  FakeStepKill,
  runStepwiseUntilDone,
} from "../step-runner";
import { buildStepState, rehydrateContext } from "../full-analysis-step-state-bridge";
import type { EnrichedAgentContext } from "@/agents/types";
import { AnalysisStateMachine } from "../../orchestration/state-machine";

// ---------------------------------------------------------------------------
// Pipelines synthétiques (le VRAI runFullAnalysis n'est câblé qu'en D.5d ; ici on
// valide la MÉCANIQUE du harness : mémoïsation, round-trip wire, kill/resume, négatif).
// ---------------------------------------------------------------------------

/** Pipeline wire-safe : chaque unité accumule dans un état JSON-pur. */
async function tallyPipeline(runner: StepRunner): Promise<{ tally: number; trail: string[] }> {
  let state: { tally: number; trail: string[] } = { tally: 0, trail: [] };
  for (const unit of ["a", "b", "c", "d"]) {
    state = await runner.run(`unit-${unit}`, async () => ({
      tally: state.tally + unit.charCodeAt(0),
      trail: [...state.trail, unit],
    }));
  }
  return state;
}

/** Pipeline NON wire-safe : porte une Date entre steps puis la date-method. */
async function dateDependentPipeline(runner: StepRunner): Promise<number> {
  const a = await runner.run("emit-date", async () => ({ when: new Date("2026-01-01T00:00:00.000Z") }));
  // En single-pass (Inline) `a.when` est une Date ; en stepwise (Fake round-trip) c'est une string ISO.
  return runner.run("use-date", async () => (a.when as unknown as Date).getTime());
}

describe("StepRunner — implémentations", () => {
  it("InlineStepRunner exécute fn immédiatement", async () => {
    const r = new InlineStepRunner();
    expect(await r.run("x", async () => 42)).toBe(42);
  });

  it("InngestStepRunner délègue à step.run (signature structurelle)", async () => {
    const calls: string[] = [];
    const fakeStep = { run: async <T>(id: string, fn: () => Promise<T>) => { calls.push(id); return fn(); } };
    const r = new InngestStepRunner(fakeStep);
    expect(await r.run("step-1", async () => "ok")).toBe("ok");
    expect(calls).toEqual(["step-1"]);
  });
});

describe("FakeStepRunner — simulation Inngest (mémoïsation + round-trip)", () => {
  it("mémoïse : un même id n'est exécuté qu'une fois, replay sert le memo", async () => {
    const r = new FakeStepRunner();
    r.startPass(null);
    let runs = 0;
    const a = await r.run("u", async () => { runs++; return { v: 1 }; });
    const b = await r.run("u", async () => { runs++; return { v: 999 }; }); // ignoré (memo)
    expect(runs).toBe(1);
    expect(a).toEqual({ v: 1 });
    expect(b).toEqual({ v: 1 });
    expect(r.memoHits).toBe(1);
    expect(r.executedIds).toEqual(["u"]);
  });

  it("round-trip dès la 1re exécution : le résultat revient en forme WIRE (Date -> string)", async () => {
    const r = new FakeStepRunner();
    r.startPass(null);
    const out = await r.run("d", async () => ({ when: new Date("2026-01-01T00:00:00.000Z") }));
    expect(typeof (out as { when: unknown }).when).toBe("string"); // wire, pas Date
  });
});

describe("Golden harness — single-pass vs stepwise (byte-equivalence) + kill/resume", () => {
  it("E1 : single-pass (Inline) === stepwise non interrompu (Fake) sur pipeline wire-safe", async () => {
    const single = await tallyPipeline(new InlineStepRunner());
    const stepwise = await tallyPipeline(new FakeStepRunner());
    expect(stepwise).toEqual(single);
  });

  it("E2 : kill+resume === run ininterrompu, et les steps complétés ne re-tournent PAS", async () => {
    const uninterrupted = await tallyPipeline(new FakeStepRunner());
    const runner = new FakeStepRunner();
    const { result, passes } = await runStepwiseUntilDone(tallyPipeline, runner, [2, null]); // kill après a,b
    expect(result).toEqual(uninterrupted);
    expect(passes).toBe(2);
    expect(runner.executedIds).toEqual(["unit-a", "unit-b", "unit-c", "unit-d"]); // chacun 1 seule fois
    expect(runner.memoHits).toBe(2); // a,b servis du memo à la passe 1
  });

  it("NÉGATIF (le harness a des dents) : un état NON wire-safe DIVERGE entre single-pass et stepwise", async () => {
    const single = await dateDependentPipeline(new InlineStepRunner());
    expect(typeof single).toBe("number"); // Date.getTime() OK en single-pass
    // En stepwise, a.when est une string ISO -> .getTime n'existe pas -> throw : divergence DÉTECTÉE.
    await expect(dateDependentPipeline(new FakeStepRunner())).rejects.toThrow();
  });

  it("NÉGATIF : oublier un step mémoïsé (perte de durabilité) force sa ré-exécution", async () => {
    const runner = new FakeStepRunner();
    runner.startPass(null);
    await tallyPipeline(runner);
    expect(runner.executedIds.filter((id) => id === "unit-a").length).toBe(1);
    runner.forgetStep("unit-a");
    runner.startPass(null);
    await tallyPipeline(runner);
    expect(runner.executedIds.filter((id) => id === "unit-a").length).toBe(2); // re-exécuté
  });

  it("garde-fou : runStepwiseUntilDone lève si le kill ne s'épuise jamais", async () => {
    const runner = new FakeStepRunner();
    // killSchedule de 51 entrées à 0 -> dépasse MAX_PASSES
    const sched = Array.from({ length: 51 }, () => 0 as number | null);
    await expect(runStepwiseUntilDone(tallyPipeline, runner, sched)).rejects.toThrow(/non terminé/);
  });
});

describe("Intégration bridge — un StepState survit à la frontière durable + rehydrate/restore", () => {
  function makeLiveContext(): EnrichedAgentContext {
    const D = new Date("2026-04-01T00:00:00.000Z");
    return {
      dealId: "d1",
      deal: { id: "d1", name: "Acme", sector: "saas", createdAt: D } as unknown,
      canonicalDeal: { id: "d1", name: "Acme", sector: "saas", createdAt: D, founders: [{ id: "f1", createdAt: D }] } as unknown,
      analysis: { id: "a1", mode: "full_analysis" },
      documents: [{ id: "doc1", name: "deck.pdf", type: "pitch", uploadedAt: D }],
      evidenceToday: new Date("2026-06-01T00:00:00.000Z"),
      previousResults: { "deck-forensics": { success: true } },
      factStore: [{ factKey: "rev", firstSeenAt: D, eventHistory: [{ createdAt: D }] }] as unknown,
      evidenceLedger: { generatedAt: "2026-06-01T00:00:00.000Z", coverage: {}, items: [], warnings: [] } as unknown,
    } as unknown as EnrichedAgentContext;
  }

  it("buildStepState -> step.run (FakeStepRunner round-trip) -> rehydrate ravive les Date ; restoreFromStepState OK", async () => {
    const runner = new FakeStepRunner();
    runner.startPass(null);

    const dto = await runner.run("tier1-phase-b", async () =>
      buildStepState({
        analysisId: "a1", dealId: "d1", analysisType: "full_analysis",
        totalAgents: 21, completedCount: 2, totalCost: 1, startTimeMs: 1_700_000_000_000,
        transitionCount: 4, lastUnit: "tier1-phase-b", done: false,
        enrichedContext: makeLiveContext(),
        allResults: { "deck-forensics": { agentName: "deck-forensics", success: true } },
        verificationContext: null,
        collectedWarnings: [],
        tier1Findings: [],
      })
    );

    // dto a traversé la frontière wire (JSON round-trip) : les Date sont des string ISO.
    expect(typeof (dto.canonicalDeal as { createdAt: unknown }).createdAt).toBe("string");

    // rehydrate ravive en Date
    const r = rehydrateContext(dto);
    expect((r.enrichedContext.canonicalDeal as unknown as { createdAt: Date }).createdAt).toBeInstanceOf(Date);
    expect(r.enrichedContext.evidenceToday).toBeInstanceOf(Date);

    // restoreFromStepState sur le DTO traversé
    const sm = new AnalysisStateMachine({
      analysisId: "a1", dealId: "d1", mode: "full_analysis",
      agents: ["deck-forensics", "financial-auditor"], enableCheckpointing: false,
    });
    sm.restoreFromStepState(dto);
    expect(sm.getState()).toBe("ANALYZING"); // tier1-phase-b
    expect(sm.getResults()).toHaveProperty("deck-forensics");
    expect(sm.getPendingAgents()).toEqual(["financial-auditor"]);
  });
});
