import { describe, it, expect } from "vitest";
import { AnalysisStateMachine, type AnalysisState } from "../state-machine";
import {
  FULL_ANALYSIS_STEP_STATE_VERSION,
  type FullAnalysisStepState,
  type FullAnalysisUnit,
} from "../../orchestrator/full-analysis-step-state";

const AGENTS = ["document-extractor", "deck-forensics", "financial-auditor", "synthesis-deal-scorer"];

function makeMachine() {
  return new AnalysisStateMachine({
    analysisId: "a1",
    dealId: "d1",
    mode: "full_analysis",
    agents: AGENTS,
    enableCheckpointing: false,
  });
}

function makeStepState(over: Partial<FullAnalysisStepState> = {}): FullAnalysisStepState {
  return {
    version: FULL_ANALYSIS_STEP_STATE_VERSION,
    analysisId: "a1",
    dealId: "d1",
    analysisType: "full_analysis",
    totalAgents: 21,
    completedCount: 2,
    totalCost: 1,
    startTimeMs: 1_700_000_000_000,
    transitionCount: 5,
    lastUnit: "tier1-phase-b",
    done: false,
    terminalResult: null,
    factStoreFormatted: "",
    evidenceLedgerFormatted: "",
    evidenceTodayIso: "2026-06-01T00:00:00.000Z",
    conditionsAnalystMode: null,
    allResults: {},
    previousResults: {},
    canonicalDeal: { id: "d1" },
    analysisBinding: { id: "a1" },
    tier1CrossValidation: null,
    verificationContext: null,
    evidenceContext: null,
    thesis: null,
    contextEngine: null,
    evidenceLedger: null,
    extractedData: null,
    deckCoherenceReport: null,
    baPreferences: null,
    dealTerms: null,
    dealStructure: null,
    scopedDocuments: [],
    factStore: [],
    founderResponses: [],
    collectedWarnings: [],
    tier1Findings: [],
    allValidations: [],
    needsReflect: [],
    consolidatedRedFlags: null,
    previousAnalysisQuestions: null,
    ...over,
  };
}

describe("AnalysisStateMachine.restoreFromStepState (D.5b b-4)", () => {
  const UNIT_STATES: Array<[FullAnalysisUnit, AnalysisState]> = [
    ["init", "INITIALIZING"],
    ["tier0-facts", "INITIALIZING"],
    ["tier0-thesis", "GATHERING"],
    ["tier0-pre-context", "GATHERING"],
    ["tier0-thesis-extractor", "GATHERING"],
    ["tier1-phase-a", "ANALYZING"],
    ["tier1-phase-d", "ANALYZING"],
    ["post-tier1-glue", "DEBATING"],
    ["tier3-pre", "SYNTHESIZING"],
    ["tier2-sector", "SYNTHESIZING"],
    ["tier3-post", "SYNTHESIZING"],
  ];

  it("mappe chaque lastUnit vers le bon AnalysisState (gate Codex)", () => {
    for (const [unit, expected] of UNIT_STATES) {
      const sm = makeMachine();
      sm.restoreFromStepState(makeStepState({ lastUnit: unit }));
      expect(sm.getState(), `unit=${unit}`).toBe(expected);
    }
  });

  it("dérive completed/failed/results UNIQUEMENT sur le set recordable (exclut fact-extractor)", () => {
    const sm = makeMachine();
    sm.restoreFromStepState(
      makeStepState({
        allResults: {
          "document-extractor": { agentName: "document-extractor", success: true },
          "deck-forensics": { agentName: "deck-forensics", success: true, _react: { findings: [{ id: "f1" }] } },
          "financial-auditor": { agentName: "financial-auditor", success: false, error: "boom" },
          // fact-extractor : hors config.agents -> NON recordable -> ignoré
          "fact-extractor": { agentName: "fact-extractor", success: true },
        } as unknown as Record<string, unknown>,
      })
    );
    const results = sm.getResults();
    expect(Object.keys(results).sort()).toEqual(["deck-forensics", "document-extractor"]); // success recordables seulement
    expect(results).not.toHaveProperty("fact-extractor"); // non recordable
    expect(results).not.toHaveProperty("financial-auditor"); // échec -> pas dans results
    expect(sm.getFailedAgents().map((f) => f.name)).toEqual(["financial-auditor"]);
    expect(sm.getFailedAgents()[0].retries).toBe(1);
    // pending = config.agents non présents dans allResults : seul synthesis-deal-scorer reste
    expect(sm.getPendingAgents()).toEqual(["synthesis-deal-scorer"]);
    // findings dérivés de _react.findings (comme recordAgentComplete)
    expect(sm.getFindings()).toEqual([{ id: "f1" }]);
  });

  it("inclut le sector expert (hors config.agents) quand fourni en opts", () => {
    const sm = makeMachine();
    sm.restoreFromStepState(
      makeStepState({
        lastUnit: "tier2-sector",
        allResults: {
          "saas-expert": { agentName: "saas-expert", success: true },
        } as unknown as Record<string, unknown>,
      }),
      { sectorExpertName: "saas-expert" }
    );
    expect(sm.getResults()).toHaveProperty("saas-expert");
    // le sector expert n'est PAS dans config.agents -> n'affecte pas pendingAgents
    expect(sm.getPendingAgents().sort()).toEqual(AGENTS.slice().sort());
  });

  it("ignore le sector expert dans allResults s'il n'est PAS fourni en opts (non recordable)", () => {
    const sm = makeMachine();
    sm.restoreFromStepState(
      makeStepState({
        allResults: { "saas-expert": { agentName: "saas-expert", success: true } } as unknown as Record<string, unknown>,
      })
    );
    expect(sm.getResults()).not.toHaveProperty("saas-expert");
  });

  it("complete() est une transition VALIDE depuis un état restauré tier2-sector/tier3-post (SYNTHESIZING)", async () => {
    for (const unit of ["tier3-pre", "tier2-sector", "tier3-post"] as FullAnalysisUnit[]) {
      const sm = makeMachine();
      sm.restoreFromStepState(makeStepState({ lastUnit: unit }));
      await expect(sm.complete(), `complete() depuis ${unit}`).resolves.toBeUndefined();
    }
  });

  it("complete() ÉCHOUE depuis un état ANALYZING (preuve que tier2-sector NE DOIT PAS mapper ANALYZING)", async () => {
    const sm = makeMachine();
    sm.restoreFromStepState(makeStepState({ lastUnit: "tier1-phase-b" })); // -> ANALYZING
    await expect(sm.complete()).rejects.toThrow(/Invalid state transition: ANALYZING -> COMPLETED/);
  });

  it("restaure startTime depuis startTimeMs (durée mesurée non nulle)", () => {
    const sm = makeMachine();
    sm.restoreFromStepState(makeStepState({ startTimeMs: 1_700_000_000_000 }));
    const summary = sm.getSummary();
    // totalTime = now - startTime(2023) -> très grand, pas ~0 (preuve que startTime n'est pas new Date())
    expect(summary.totalTime).toBeGreaterThan(1_000_000_000);
  });

  it("getTransitionCount CUMULATIF après restore : base portée + transitions de l'invocation (E2 summary === E1)", async () => {
    const sm = makeMachine();
    sm.restoreFromStepState(makeStepState({ transitionCount: 5, lastUnit: "post-tier1-glue" })); // base 5, state DEBATING
    expect(sm.getTransitionCount()).toBe(5);
    expect(sm.getSummary().transitions).toBe(5);
    await sm.startSynthesis(); // DEBATING -> SYNTHESIZING : +1 transition
    expect(sm.getTransitionCount()).toBe(6);
    expect(sm.getSummary().transitions).toBe(6);
  });

  it("run sain (pas de restore) : getTransitionCount = transitions de l'invocation (base 0)", async () => {
    const sm = makeMachine();
    await sm.start(); // IDLE -> INITIALIZING : +1
    expect(sm.getTransitionCount()).toBe(1);
    expect(sm.getSummary().transitions).toBe(1);
  });
});
