import { beforeEach, describe, expect, it, vi } from "vitest";

// d-2b — GOLDEN du graphe stepwise v2 (runFullAnalysisStepwise) au niveau DRIVER (helpers
// stubés, pas full-LLM-mock — E1 garanti structurellement par le Modèle B). Couvre :
//   - E1 : single-pass (runFullAnalysisPipeline) === stepwise Inline === stepwise Fake (run sain).
//     On compare l'ÉTAT passé au tail (runFullAnalysisPostThesis), capturé via un stub.
//   - E2-par-frontière : kill APRÈS tier0-facts ET kill APRÈS tier0-thesis → resume → ===E1.
//     E2b (kill après tier0-thesis) force le chemin !rehydrated→rehydrate→restore (snapshot).
//
// Le snapshot (full-analysis-snapshot) est mocké par un store mémoire JSON (= frontière wire DB).
// Les helpers d'unité sont stubés sur l'instance ; runContextEngineStep renvoie un enrichedContext
// round-trip-stable (Date ravivées au rehydrate → deep-equal au single-pass).

const persistenceMocks = vi.hoisted(() => ({
  completeAnalysis: vi.fn(),
  updateAnalysisProgress: vi.fn(),
}));
const snapshotStore = vi.hoisted(() => ({ map: new Map<string, string>() }));
const loadResultsMock = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock("../persistence", () => ({
  getDealWithRelations: vi.fn(),
  createAnalysis: vi.fn(),
  updateAnalysisProgress: persistenceMocks.updateAnalysisProgress,
  completeAnalysis: persistenceMocks.completeAnalysis,
  persistStateTransition: vi.fn(),
  persistReasoningTrace: vi.fn(),
  persistScoredFindings: vi.fn(),
  persistDebateRecord: vi.fn(),
  processAgentResult: vi.fn(),
  updateDealStatus: vi.fn(),
  findInterruptedAnalyses: vi.fn(),
  loadAnalysisForRecovery: vi.fn(),
  markAnalysisAsFailed: vi.fn(),
  loadPreviousAnalysisQuestions: vi.fn(),
  saveCheckpoint: vi.fn(),
}));

vi.mock("@/services/openrouter/router", () => ({
  runWithLLMContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  setAnalysisContext: vi.fn(),
  setAgentContext: vi.fn(),
}));

vi.mock("@/services/cost-monitor", () => ({
  costMonitor: {
    startAnalysis: vi.fn(),
    endAnalysis: vi.fn().mockResolvedValue(null),
    recordCall: vi.fn(),
  },
}));

vi.mock("@/services/thesis", () => ({
  thesisService: { getLatest: vi.fn(), getById: vi.fn(), applyReconciliation: vi.fn() },
}));

vi.mock("@/services/analysis-results/load-results", () => ({
  loadResults: loadResultsMock.fn,
}));

// Snapshot mocké : store mémoire JSON (round-trip = frontière wire DB) sur l'analysisId.
vi.mock("../full-analysis-snapshot", () => ({
  STEPWISE_STATE_PREFIX: "STEPWISE:",
  stepwiseStateValue: (unit: string) => `STEPWISE:${unit}`,
  isStepwiseState: (s: string | null | undefined) =>
    typeof s === "string" && s.startsWith("STEPWISE:"),
  writeStepwiseSnapshot: vi.fn(async (state: { analysisId: string }) => {
    snapshotStore.map.set(state.analysisId, JSON.stringify(state));
    return "ckpt_1";
  }),
  readLatestStepwiseSnapshot: vi.fn(async (analysisId: string) => {
    const s = snapshotStore.map.get(analysisId);
    return s ? JSON.parse(s) : null;
  }),
}));

const { AgentOrchestrator } = await import("../index");
const { AnalysisStateMachine } = await import("@/agents/orchestration/state-machine");
const { InlineStepRunner, FakeStepRunner, FakeStepKill, runStepwiseUntilDone } = await import("../step-runner");

// ---------- Fixtures (Date vivantes) ----------
const ISO = "2026-06-01T00:00:00.000Z";
const DEAL_CREATED = new Date("2026-05-01T10:00:00.000Z");
const DOC_UPLOADED = new Date("2026-04-01T00:00:00.000Z");
const FACT_DATE = new Date("2026-04-15T00:00:00.000Z");

function makeEnrichedContext() {
  // Round-trip-stable : uniquement les champs reconstruits par rehydrateContext.
  return {
    dealId: "deal_1",
    deal: { id: "deal_1", name: "Acme", sector: "saas", createdAt: DEAL_CREATED, updatedAt: DEAL_CREATED, founders: [{ id: "f1", name: "Jane", role: "CEO", createdAt: DEAL_CREATED }], documents: [{ id: "doc1", name: "deck.pdf", uploadedAt: DEAL_CREATED, sourceDate: null, receivedAt: null }] },
    canonicalDeal: { id: "deal_1", name: "Acme", sector: "saas", createdAt: DEAL_CREATED, updatedAt: DEAL_CREATED, founders: [{ id: "f1", name: "Jane", role: "CEO", createdAt: DEAL_CREATED }], documents: [{ id: "doc1", name: "deck.pdf", uploadedAt: DEAL_CREATED, sourceDate: null, receivedAt: null }] },
    analysis: { id: "analysis_1", mode: "full_analysis", thesisBypass: false, thesisId: "t1", corpusSnapshotId: "cs1" },
    documents: [{ id: "doc1", name: "deck.pdf", uploadedAt: DOC_UPLOADED, sourceDate: null, receivedAt: null }],
    evidenceContext: { doc1: { documentDate: { date: FACT_DATE } } },
    evidenceToday: new Date(ISO),
    previousResults: { "deck-forensics": { success: true, score: 72 }, _consensus_resolutions: [{ id: "c1" }] },
    contextEngine: { completeness: 0.8, enrichedAt: ISO },
    factStore: [{ factKey: "revenue", currentValue: 100000, firstSeenAt: FACT_DATE, lastUpdatedAt: FACT_DATE, eventHistory: [{ createdAt: FACT_DATE }] }],
    factStoreFormatted: "FACT: revenue=100k",
    evidenceLedger: { generatedAt: ISO, coverage: { documents: 1 }, items: [], warnings: [] },
    evidenceLedgerFormatted: "EVIDENCE: deck",
    deckCoherenceReport: { reliabilityGrade: "B" },
    thesis: { id: "t1", reformulated: "x", verdict: "favorable", confidence: 71 },
    extractedData: { tagline: "t", competitors: ["c1"] },
  } as unknown;
}

const FACT_EXTRACTOR_RESULT = { agentName: "fact-extractor", success: true, executionTimeMs: 100, cost: 0.1, data: { facts: [{ key: "revenue" }] } };
const TIER0_FACTSTORE = [{ factKey: "revenue", currentValue: 90000, firstSeenAt: FACT_DATE, lastUpdatedAt: FACT_DATE, eventHistory: [{ createdAt: FACT_DATE }] }];
const EXTRACTED_DATA = { tagline: "t", competitors: ["c1"] };
const THESIS_OUTPUT = { verdict: "favorable", confidence: 71 };
const REST_RESULT = {
  sessionId: "analysis_1",
  dealId: "deal_1",
  type: "full_analysis",
  success: true,
  results: { "deck-forensics": { success: true } },
  totalCost: 9.9,
  totalTimeMs: 1000,
  summary: "ok",
  earlyWarnings: [],
  hasCriticalWarnings: false,
  tiersExecuted: ["tier0", "tier1", "tier3"],
};

type Captured = {
  totalCost: number;
  completedCount: number;
  factStoreFormatted: string;
  factStore: unknown;
  extractedData: unknown;
  thesisOutput: unknown;
  enrichedContext: Record<string, unknown>;
};

function makeInit() {
  const stateMachine = new AnalysisStateMachine({
    analysisId: "analysis_1",
    dealId: "deal_1",
    mode: "full_analysis",
    agents: ["document-extractor"],
    enableCheckpointing: false,
  });
  return {
    failFastOnCritical: false,
    maxCostUsd: undefined,
    onEarlyWarning: undefined,
    isUpdate: false,
    enableTrace: true,
    stopAfterThesis: false,
    analysisModeOverride: undefined,
    startTime: 1_700_000_000_000,
    collectedWarnings: [],
    initialCanonicalDeal: { id: "deal_1", sector: "saas" },
    sectorExpert: null,
    TOTAL_AGENTS: 21,
    corpusSnapshot: null,
    scopedDocuments: [{ id: "doc1", processingStatus: "COMPLETED" }],
    analysis: { id: "analysis_1", mode: "full_analysis" },
    stateMachine,
    allResults: {} as Record<string, unknown>,
    totalCost: 0,
    completedCount: 0,
    factStore: [],
    factStoreFormatted: "",
    founderResponses: [],
    stepwise: true,
  } as unknown;
}

// Stube les helpers d'unité + capture les params du tail. Déterministe → E1 structurel.
function stubHelpers(orch: Record<string, unknown>, captured: Captured[]) {
  orch.runTier0Step = vi.fn(async (p: { allResults: Record<string, unknown> }) => {
    p.allResults["fact-extractor"] = FACT_EXTRACTOR_RESULT;
    return { totalCost: 0.1, completedCount: 1, factStore: TIER0_FACTSTORE, factStoreFormatted: "FS0", founderResponses: [] };
  });
  orch.buildBaseAnalysisContext = vi.fn(async () => ({ dealId: "deal_1", previousResults: {} }));
  orch.runDocumentExtractorStep = vi.fn(async (p: { totalCost: number; completedCount: number; allResults: Record<string, unknown> }) => {
    p.allResults["document-extractor"] = { agentName: "document-extractor", success: true, executionTimeMs: 1, cost: 0.2 };
    return { totalCost: p.totalCost + 0.2, completedCount: p.completedCount + 1, extractedData: EXTRACTED_DATA };
  });
  orch.runDeckCoherenceStep = vi.fn(async (p: { totalCost: number }) => ({ totalCost: p.totalCost + 0.1, deckCoherenceReport: { reliabilityGrade: "B" } }));
  orch.runContextEngineStep = vi.fn(async () => {
    const ec = makeEnrichedContext() as Record<string, unknown>;
    return { factStore: ec.factStore, factStoreFormatted: ec.factStoreFormatted, enrichedContext: ec };
  });
  orch.runThesisExtractionStep = vi.fn(async (p: { totalCost: number; completedCount: number }) => ({ totalCost: p.totalCost + 0.3, completedCount: p.completedCount + 1, thesisOutput: THESIS_OUTPUT }));
  // Un kill plateforme (300s) = mort de process en réel → REPLAY (aucun catch user ne tourne).
  // Le FakeStepKill simule ce kill par un throw ; runFullAnalysisStepwise le rattrape dans son
  // try/catch terminal → on stube failFullAnalysis pour LE RELANCER (= mort de process) tout en
  // traitant une vraie erreur d'analyse comme un échec terminal (FAILED). Runtime inchangé.
  orch.failFullAnalysis = vi.fn(async (error: unknown) => {
    if (error instanceof FakeStepKill) throw error;
    return { ...REST_RESULT, success: false };
  });
  orch.runFullAnalysisPostThesis = vi.fn(async (p: { totalCost: number; completedCount: number; factStoreFormatted: string; factStore: unknown; extractedData: unknown; thesisOutput: unknown; enrichedContext: Record<string, unknown>; reportTotalCost: (c: number) => void }) => {
    captured.push({
      totalCost: p.totalCost,
      completedCount: p.completedCount,
      factStoreFormatted: p.factStoreFormatted,
      factStore: p.factStore,
      extractedData: p.extractedData,
      thesisOutput: p.thesisOutput,
      enrichedContext: p.enrichedContext,
    });
    p.reportTotalCost(p.totalCost + 0.5);
    return REST_RESULT;
  });
}

// Compare l'état passé au tail (hors thesisOutput = résiduel null au rehydrate, stopAfterThesis=false).
function summarize(c: Captured) {
  const ec = c.enrichedContext;
  return {
    totalCost: c.totalCost,
    completedCount: c.completedCount,
    factStoreFormatted: c.factStoreFormatted,
    factStore: c.factStore,
    extractedData: c.extractedData,
    ec_canonicalDeal: ec.canonicalDeal,
    ec_thesis: ec.thesis,
    ec_contextEngine: ec.contextEngine,
    ec_factStore: ec.factStore,
    ec_previousResults: ec.previousResults,
    ec_evidenceContext: ec.evidenceContext,
    ec_extractedData: ec.extractedData,
    ec_factStoreFormatted: ec.factStoreFormatted,
  };
}

describe("d-2b — golden runFullAnalysisStepwise (E1 + E2-par-frontière)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    snapshotStore.map.clear();
    persistenceMocks.completeAnalysis.mockResolvedValue(undefined);
    persistenceMocks.updateAnalysisProgress.mockResolvedValue(undefined);
    loadResultsMock.fn.mockResolvedValue(REST_RESULT.results);
  });

  it("E1 — single-pass (pipeline) === stepwise Inline === stepwise Fake (état du tail identique)", async () => {
    // Single-pass de référence.
    const capPipeline: Captured[] = [];
    const orchP = new AgentOrchestrator() as unknown as Record<string, unknown>;
    stubHelpers(orchP, capPipeline);
    const rPipeline = await (orchP.runFullAnalysisPipeline as (...a: unknown[]) => Promise<unknown>)({}, "deal_1", undefined, makeInit());

    // Stepwise Inline (run sain).
    const capInline: Captured[] = [];
    const orchI = new AgentOrchestrator() as unknown as Record<string, unknown>;
    stubHelpers(orchI, capInline);
    const rInline = await (orchI.runFullAnalysisStepwise as (...a: unknown[]) => Promise<unknown>)({}, "deal_1", undefined, makeInit(), new InlineStepRunner());

    // Stepwise Fake (run sain, round-trip wire à chaque step).
    const capFake: Captured[] = [];
    const orchF = new AgentOrchestrator() as unknown as Record<string, unknown>;
    stubHelpers(orchF, capFake);
    const rFake = await (orchF.runFullAnalysisStepwise as (...a: unknown[]) => Promise<unknown>)({}, "deal_1", undefined, makeInit(), new FakeStepRunner());

    expect(capPipeline).toHaveLength(1);
    expect(capInline).toHaveLength(1);
    expect(capFake).toHaveLength(1);

    // État du tail identique entre les 3 chemins (E1 structurel Modèle B).
    expect(summarize(capInline[0])).toEqual(summarize(capPipeline[0]));
    expect(summarize(capFake[0])).toEqual(summarize(capPipeline[0]));

    // Résultat terminal identique (= REST_RESULT sur run sain).
    expect(rInline).toEqual(rPipeline);
    expect(rFake).toEqual(rPipeline);
    expect(rPipeline).toEqual(REST_RESULT);
  });

  it("E2a — kill APRÈS tier0-facts → resume → tier0-thesis re-tourne frais (pas de rehydrate), ===E1", async () => {
    const capRef: Captured[] = [];
    const orchRef = new AgentOrchestrator() as unknown as Record<string, unknown>;
    stubHelpers(orchRef, capRef);
    await (orchRef.runFullAnalysisStepwise as (...a: unknown[]) => Promise<unknown>)({}, "deal_1", undefined, makeInit(), new InlineStepRunner());

    snapshotStore.map.clear();
    const cap: Captured[] = [];
    const orch = new AgentOrchestrator() as unknown as Record<string, unknown>;
    stubHelpers(orch, cap);
    const fake = new FakeStepRunner();
    const { passes } = await runStepwiseUntilDone(
      (runner) => (orch.runFullAnalysisStepwise as (...a: unknown[]) => Promise<unknown>)({}, "deal_1", undefined, makeInit(), runner),
      fake,
      [1, null], // kill avant le 2e nouveau step (tier0-thesis) à la passe 0
    );

    expect(passes).toBe(2);
    // tier0-facts mémoïsé (1 hit), tier0-thesis re-tourne frais (PAS de readLatestStepwiseSnapshot pour rehydrate sur ce chemin).
    expect(cap).toHaveLength(1); // le tail n'est capturé qu'à la passe finale
    expect(summarize(cap[0])).toEqual(summarize(capRef[0]));
    expect(cap[0].thesisOutput).toEqual(THESIS_OUTPUT); // tier0-thesis frais → thesisOutput présent
  });

  it("E2b — kill APRÈS tier0-thesis → resume → REHYDRATE UNIQUE depuis le snapshot, ===E1", async () => {
    const capRef: Captured[] = [];
    const orchRef = new AgentOrchestrator() as unknown as Record<string, unknown>;
    stubHelpers(orchRef, capRef);
    await (orchRef.runFullAnalysisStepwise as (...a: unknown[]) => Promise<unknown>)({}, "deal_1", undefined, makeInit(), new InlineStepRunner());

    snapshotStore.map.clear();
    const cap: Captured[] = [];
    const orch = new AgentOrchestrator() as unknown as Record<string, unknown>;
    stubHelpers(orch, cap);
    const fake = new FakeStepRunner();
    const { passes } = await runStepwiseUntilDone(
      (runner) => (orch.runFullAnalysisStepwise as (...a: unknown[]) => Promise<unknown>)({}, "deal_1", undefined, makeInit(), runner),
      fake,
      [2, null], // kill avant le 3e nouveau step (rest) → tier0-thesis a écrit son snapshot
    );

    expect(passes).toBe(2);
    expect(snapshotStore.map.size).toBe(1); // snapshot écrit UNE fois (pas de double-write au replay)
    expect(cap).toHaveLength(1);
    // État du tail reconstruit par rehydrate === single-pass (Date ravivées deep-equal).
    expect(summarize(cap[0])).toEqual(summarize(capRef[0]));
    // Résiduel assumé : thesisOutput=null au rehydrate (stopAfterThesis=false → jamais lu).
    expect(cap[0].thesisOutput).toBeNull();
  });
});
