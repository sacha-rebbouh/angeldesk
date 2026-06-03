import { beforeEach, describe, expect, it, vi } from "vitest";
import { TIER3_BATCHES_BEFORE_TIER2 } from "../types";

// d-3 (d-3-5) — GOLDEN du graphe stepwise v3 (runFullAnalysisStepwiseV3) au niveau DRIVER
// (sous-méthodes Tier1 stubées — E1 garanti structurellement par le Modèle B). v3 découpe Tier1
// PER-PHASE en steps durables (tier1-{ph}-agents → N×tier1-{ph}-reflexion-{i} → tier1-{ph}-finalize).
//
// d-3-5a (CE FICHIER, 1re partie) : E1 uniquement —
//   single-pass (runFullAnalysisPipeline → runFullAnalysisPostThesis → runTier1Phases RÉEL)
//   === stepwise v3 Inline === stepwise v3 Fake (run sain). On compare l'ÉTAT post-Tier1 passé
//   au tail (runFullAnalysisPostTier1), RECONCILIÉ pour le contrat de coût F3 (single-pass porte
//   totalCost pré-Tier1 + phasesResult.costIncurred ; v3 porte totalCost global + costIncurred:0).
// d-3-5b (à venir) : E2-par-frontière (kill après tier0-thesis / tier1-a-agents / une reflexion /
//   un finalize → resume → ===E1, force le rehydrate mid-Tier1).
//
// Le snapshot (full-analysis-snapshot) est mocké par un store mémoire JSON (= frontière wire DB).
// Les sous-méthodes Tier1 stubées mutent allResults/allFindings/allValidations/enrichedContext.factStore
// par référence + renvoient coût/needsReflect → déterministe.

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
const FINDING_DATE = new Date("2026-05-20T00:00:00.000Z");

// Agents low-conf → reflexion (1 en phase C : competitive-intel).
const REFLECT_AGENTS = new Set<string>(["competitive-intel"]);

// TEETH F1 : tout vc null reçu par reflexion/finalize est compté (le vc DOIT être non-null une fois
// Tier1 démarré). Un guard F1 faux (`!rehydrated` au lieu de `vc == null`) laisserait vc=null au
// resume-après-tier0-thesis → nullSeen > 0 → test rouge. Reset en beforeEach.
const vcGuard = { nullSeen: 0 };

function makeEnrichedContext() {
  return {
    dealId: "deal_1",
    deal: { id: "deal_1", name: "Acme", sector: "saas", createdAt: DEAL_CREATED, updatedAt: DEAL_CREATED, founders: [{ id: "f1", name: "Jane", role: "CEO", createdAt: DEAL_CREATED }], documents: [{ id: "doc1", name: "deck.pdf", uploadedAt: DEAL_CREATED, sourceDate: null, receivedAt: null }] },
    canonicalDeal: { id: "deal_1", name: "Acme", sector: "saas", createdAt: DEAL_CREATED, updatedAt: DEAL_CREATED, founders: [{ id: "f1", name: "Jane", role: "CEO", createdAt: DEAL_CREATED }], documents: [{ id: "doc1", name: "deck.pdf", uploadedAt: DEAL_CREATED, sourceDate: null, receivedAt: null }] },
    analysis: { id: "analysis_1", mode: "full_analysis", thesisBypass: false, thesisId: "t1", corpusSnapshotId: "cs1" },
    documents: [{ id: "doc1", name: "deck.pdf", uploadedAt: DOC_UPLOADED, sourceDate: null, receivedAt: null }],
    evidenceContext: { doc1: { documentDate: { date: FACT_DATE } } },
    evidenceToday: new Date(ISO),
    previousResults: { _consensus_resolutions: [{ id: "c1" }] },
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
const VC = { deckExtracts: "vc-deck", financialModelExtracts: "vc-fin" };
const REST_RESULT = {
  sessionId: "analysis_1",
  dealId: "deal_1",
  type: "full_analysis",
  success: true,
  results: { "deck-forensics": { success: true } },
  totalCost: 99.9,
  totalTimeMs: 1000,
  summary: "ok",
  earlyWarnings: [],
  hasCriticalWarnings: false,
  tiersExecuted: ["tier0", "tier1", "tier3"],
};

type Captured = {
  totalCost: number;
  completedCount: number;
  factStore: unknown;
  factStoreFormatted: string;
  phasesResult: { costIncurred: number; completedInPhases: number; allFindings: unknown; updatedFactStore: unknown; updatedFactStoreFormatted: string };
  enrichedContext: Record<string, unknown>;
  allResults: Record<string, unknown>;
  allValidations: unknown;
};

function makeInit() {
  const stateMachine = new AnalysisStateMachine({
    analysisId: "analysis_1",
    dealId: "deal_1",
    mode: "full_analysis",
    agents: ["deck-forensics", "financial-auditor"],
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
    TOTAL_AGENTS: 22, // 3 tier0 + 12 tier1 + 1 tier2 + 6 tier3 (post-batch per-agent compte 3, d-6)
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

// Stube le prologue tier0 (identique v2) + les 3 sous-méthodes Tier1 + buildVerificationContext +
// getTier1Agents + finalizeTier1Phases + le tail (capture). Déterministe → E1 structurel.
function stubHelpers(orch: Record<string, unknown>, captured: Captured[]) {
  // --- prologue tier0 ---
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
  orch.runContextEngineStep = vi.fn(async (p: { stateMachine: { startGathering: () => Promise<void> } }) => {
    // Le vrai runContextEngineStep (index.ts:1819) transitionne INITIALIZING/EXTRACTING -> GATHERING ;
    // on le mirroir pour que startAnalysis (GATHERING -> ANALYZING, dans tier1-a-agents) soit valide.
    await p.stateMachine.startGathering();
    const ec = makeEnrichedContext() as Record<string, unknown>;
    return { factStore: ec.factStore, factStoreFormatted: ec.factStoreFormatted, enrichedContext: ec };
  });
  orch.runThesisExtractionStep = vi.fn(async (p: { totalCost: number; completedCount: number }) => ({ totalCost: p.totalCost + 0.3, completedCount: p.completedCount + 1, thesisOutput: THESIS_OUTPUT }));

  // --- Tier1 ---
  orch.getTier1Agents = vi.fn(async () => ({}));
  orch.buildVerificationContext = vi.fn(async () => ({ ...VC }));
  orch.runTier1PhaseAgents = vi.fn(async (
    phase: { name: string; agents: readonly string[] },
    refs: { allResults: Record<string, unknown>; allFindings: unknown[] },
    state: { totalCost: number; completedCount: number },
  ) => {
    const phaseFindings = phase.agents.map((a) => ({ id: `f-${a}`, agentName: a, title: `${a} finding`, createdAt: FINDING_DATE }));
    for (const a of phase.agents) refs.allResults[a] = { agentName: a, success: true, executionTimeMs: 1, cost: 0.5 };
    refs.allFindings.push(...phaseFindings);
    const needsReflect = phase.agents.filter((a) => REFLECT_AGENTS.has(a));
    return {
      totalCost: state.totalCost + 0.5 * phase.agents.length,
      completedCount: state.completedCount + phase.agents.length,
      phaseFindings,
      needsReflect,
    };
  });
  orch.runTier1PhaseReflexion = vi.fn(async (
    needsReflect: readonly string[],
    refs: { allResults: Record<string, unknown>; verificationContext: unknown },
    state: { totalCost: number },
  ) => {
    if (refs.verificationContext == null) vcGuard.nullSeen++;
    for (const a of needsReflect) {
      const prev = refs.allResults[a] as Record<string, unknown> | undefined;
      if (prev) refs.allResults[a] = { ...prev, reflexed: true };
    }
    return { totalCost: state.totalCost + 0.1 * needsReflect.length };
  });
  orch.runTier1PhaseFinalize = vi.fn(async (
    phase: { name: string; agents: readonly string[] },
    phaseFindings: unknown[],
    refs: { enrichedContext: Record<string, unknown>; allValidations: unknown[] },
    state: { totalCost: number; factStore: unknown[]; factStoreFormatted: string; verificationContext: unknown },
  ) => {
    if (state.verificationContext == null) vcGuard.nullSeen++;
    refs.allValidations.push({ phase: phase.name, count: phaseFindings.length });
    const newFactStore = [...state.factStore, { factKey: `fact-${phase.name}`, currentValue: phaseFindings.length, firstSeenAt: FACT_DATE, lastUpdatedAt: FACT_DATE, eventHistory: [] }];
    const newFactStoreFormatted = `${state.factStoreFormatted}|${phase.name}`;
    refs.enrichedContext.factStore = newFactStore;
    refs.enrichedContext.factStoreFormatted = newFactStoreFormatted;
    return { totalCost: state.totalCost + 0.05, factStore: newFactStore, factStoreFormatted: newFactStoreFormatted, verificationContext: state.verificationContext };
  });
  orch.finalizeTier1Phases = vi.fn(async () => ({ agentConfidences: new Map(), lowConfidenceAgents: [] as string[] }));

  // Un kill plateforme = mort de process → REPLAY ; failFullAnalysis re-throw le FakeStepKill.
  orch.failFullAnalysis = vi.fn(async (error: unknown) => {
    if (error instanceof FakeStepKill) throw error;
    return { ...REST_RESULT, success: false };
  });

  // d-3-6 — GLUE post-Tier1 (point de capture du boundary post-Tier1) + REST (résultat terminal).
  // Le glue est le point COMMUN : single-pass (runFullAnalysisPostTier1 RÉEL → runPostTier1Glue) ET
  // v3 (step `post-tier1-glue` → runPostTier1Glue) y passent → on compare le MÊME boundary. Le glue
  // stub renvoie {done:false,...} (early-return injoignable au runtime) ; le rest renvoie REST_RESULT.
  orch.runPostTier1Glue = vi.fn(async (p: {
    totalCost: number; completedCount: number; factStore: unknown; factStoreFormatted: string;
    phasesResult: Captured["phasesResult"]; enrichedContext: Record<string, unknown>;
    init: { allResults: Record<string, unknown> };
    reportTotalCost: (c: number) => void;
  }) => {
    captured.push({
      totalCost: p.totalCost,
      completedCount: p.completedCount,
      factStore: p.factStore,
      factStoreFormatted: p.factStoreFormatted,
      phasesResult: p.phasesResult,
      enrichedContext: p.enrichedContext,
      allResults: p.init.allResults,
      allValidations: undefined,
    });
    p.reportTotalCost(p.totalCost + 0.5);
    return { done: false as const, completedCount: p.completedCount, verificationContext: { ...VC }, allFindings: p.phasesResult.allFindings };
  });
  // d-4/d-5/d-6 — tier3-pre + tier2-sector + tier3-post (PER-AGENT) peelés en steps durables ; terminal
  // = runFinalCompletion. single-pass appelle les RÉELS runPostTier1Rest (d-4-R) → RestAfterTier3Pre
  // (d-5-R) → RestAfterTier2Sector (d-6-R), qui enchaînent ces stubs ; v3 les wrappe. Les stubs avancent
  // coût/count (après le boundary glue capturé → invisible aux assertions summarize/cost). tier2 appelle
  // reportTotalCost (leaf-multi). tier3-post avance proportionnellement à batches.length → la SOMME
  // per-agent v3 (3 steps × 1 batch) === all-at-once single-pass (1 appel × 3 batches).
  orch.runPostTier1Tier3Pre = vi.fn(async (p: { totalCost: number; completedCount: number }) => ({
    totalCost: p.totalCost + 0.3,
    completedCount: p.completedCount + 3,
  }));
  // d-4 (split v4 per-agent) — le driver v4 n'appelle PLUS runPostTier1Tier3Pre (gardé pour single-pass
  // + v3-frozen) : il appelle tier3-setup (runSynthesisSetupStep) + 3 steps per-agent (runPreTier2Agent +
  // collectPreTier2Result) + applyDeferred sur devils. Stubs : setup no-op, collect bump +0.1/+1 (×3 =
  // +0.3/+3 === somme single-pass), applyDeferred no-op. La fuite previousResults est testée à part (real).
  orch.runSynthesisSetupStep = vi.fn(async () => ({ tier3AgentMap: {} }));
  orch.runPreTier2Agent = vi.fn(async (agentName: string) => ({ agentName, success: true, executionTimeMs: 1, cost: 0 }));
  orch.collectPreTier2Result = vi.fn(async (p: { totalCost: number; completedCount: number }) => ({
    totalCost: p.totalCost + 0.1,
    completedCount: p.completedCount + 1,
  }));
  orch.applyDeferredPreTier2PreviousResults = vi.fn(() => {});
  orch.runPostTier1Tier2 = vi.fn(async (p: { totalCost: number; completedCount: number; reportTotalCost: (c: number) => void }) => {
    const totalCost = p.totalCost + 0.2;
    p.reportTotalCost(totalCost);
    return { totalCost, completedCount: p.completedCount + 1 };
  });
  orch.runPostTier1Tier3Post = vi.fn(async (p: { totalCost: number; completedCount: number; batches: readonly unknown[] }) => ({
    totalCost: p.totalCost + 0.1 * p.batches.length,
    completedCount: p.completedCount + p.batches.length,
  }));
  orch.runFinalCompletion = vi.fn(async () => REST_RESULT);
}

// Reconcilie le contrat de coût F3 (single-pass: pré-Tier1 + costIncurred ; v3: global + 0) et
// compare l'état EFFECTIF post-Tier1. NB : les PARAMS `factStore`/`factStoreFormatted` passés au tail
// diffèrent par REPRÉSENTATION (single-pass: pré-Tier1 ; v3: post-Tier1) mais sont DEAD — runPostTier1Aggregation
// (index.ts:1986-1987) les écrase par phasesResult.updatedFactStore/Formatted. On compare donc l'effectif
// (updatedFactStore/Formatted + enrichedContext.factStore muté par finalize), pas le param mort.
function summarize(c: Captured) {
  const ec = c.enrichedContext;
  return {
    effCompletedCount: c.completedCount + c.phasesResult.completedInPhases,
    allFindings: c.phasesResult.allFindings,
    updatedFactStore: c.phasesResult.updatedFactStore,
    updatedFactStoreFormatted: c.phasesResult.updatedFactStoreFormatted,
    ec_factStore: ec.factStore,
    ec_factStoreFormatted: ec.factStoreFormatted,
    ec_previousResults: ec.previousResults,
    ec_canonicalDeal: ec.canonicalDeal,
    allResults: c.allResults,
  };
}
function effTotalCost(c: Captured) {
  return c.totalCost + c.phasesResult.costIncurred;
}

describe("d-3-5a — golden runFullAnalysisStepwiseV3 (E1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    snapshotStore.map.clear();
    vcGuard.nullSeen = 0;
    persistenceMocks.completeAnalysis.mockResolvedValue(undefined);
    persistenceMocks.updateAnalysisProgress.mockResolvedValue(undefined);
    loadResultsMock.fn.mockResolvedValue(REST_RESULT.results);
  });

  it("E1 — single-pass (pipeline+runTier1Phases) === v3 Inline === v3 Fake (état post-Tier1 reconcilié)", async () => {
    // Référence single-pass : runFullAnalysisPipeline -> runFullAnalysisPostThesis -> runTier1Phases RÉEL.
    const capPipeline: Captured[] = [];
    const orchP = new AgentOrchestrator() as unknown as Record<string, unknown>;
    stubHelpers(orchP, capPipeline);
    const rPipeline = await (orchP.runFullAnalysisPipeline as (...a: unknown[]) => Promise<unknown>)({}, "deal_1", undefined, makeInit());

    // v4 Inline (run sain ; tier0Split=true = graphe split tier0-pre-context + tier0-thesis-extractor).
    const capInline: Captured[] = [];
    const orchI = new AgentOrchestrator() as unknown as Record<string, unknown>;
    stubHelpers(orchI, capInline);
    const rInline = await (orchI.runFullAnalysisStepwiseV3 as (...a: unknown[]) => Promise<unknown>)({}, "deal_1", undefined, makeInit(), new InlineStepRunner(), true);

    // v4 Fake (run sain, round-trip wire à chaque step).
    const capFake: Captured[] = [];
    const orchF = new AgentOrchestrator() as unknown as Record<string, unknown>;
    stubHelpers(orchF, capFake);
    const rFake = await (orchF.runFullAnalysisStepwiseV3 as (...a: unknown[]) => Promise<unknown>)({}, "deal_1", undefined, makeInit(), new FakeStepRunner(), true);

    expect(capPipeline).toHaveLength(1);
    expect(capInline).toHaveLength(1);
    expect(capFake).toHaveLength(1);

    // État post-Tier1 identique entre les 3 chemins (E1 structurel Modèle B + reconciliation F3).
    expect(summarize(capInline[0])).toEqual(summarize(capPipeline[0]));
    expect(summarize(capFake[0])).toEqual(summarize(capPipeline[0]));
    expect(effTotalCost(capInline[0])).toBeCloseTo(effTotalCost(capPipeline[0]), 9);
    expect(effTotalCost(capFake[0])).toBeCloseTo(effTotalCost(capPipeline[0]), 9);

    // Résultat terminal identique (= REST_RESULT sur run sain).
    expect(rInline).toEqual(rPipeline);
    expect(rFake).toEqual(rPipeline);
    expect(rPipeline).toEqual(REST_RESULT);
  });

  it("E1-v3-frozen — single-pass === v3 Fake (tier0Split=false) : graphe v3 FIGÉ (step `tier0-thesis` un-split) — compat cross-deploy des runs en vol", async () => {
    // BUMP graphVersion 4 : le split tier0 ne doit PAS muter le graphe v3 (runs graphVersion=3 en vol).
    // Ce test verrouille que tier0Split=false reproduit l'ANCIEN graphe (step ID `tier0-thesis`) byte-équiv.
    const capPipeline: Captured[] = [];
    const orchP = new AgentOrchestrator() as unknown as Record<string, unknown>;
    stubHelpers(orchP, capPipeline);
    const rPipeline = await (orchP.runFullAnalysisPipeline as (...a: unknown[]) => Promise<unknown>)({}, "deal_1", undefined, makeInit());

    const capFrozen: Captured[] = [];
    const orchV3 = new AgentOrchestrator() as unknown as Record<string, unknown>;
    stubHelpers(orchV3, capFrozen);
    const fake = new FakeStepRunner();
    const rFrozen = await (orchV3.runFullAnalysisStepwiseV3 as (...a: unknown[]) => Promise<unknown>)({}, "deal_1", undefined, makeInit(), fake, false);

    // Byte-équiv : le graphe v3 FROZEN produit le MÊME état post-Tier1 + terminal que single-pass.
    expect(capFrozen).toHaveLength(1);
    expect(summarize(capFrozen[0])).toEqual(summarize(capPipeline[0]));
    expect(effTotalCost(capFrozen[0])).toBeCloseTo(effTotalCost(capPipeline[0]), 9);
    expect(rFrozen).toEqual(rPipeline);
    // Cross-deploy compat (lock) : tier0Split=false garde le step ID `tier0-thesis` et NE crée PAS les
    // step IDs v4 → un run graphVersion=3 en vol retrouve SES steps mémoïsés au replay (pas de mismatch).
    expect(fake.executedIds).toContain("tier0-thesis");
    expect(fake.executedIds).not.toContain("tier0-pre-context");
    expect(fake.executedIds).not.toContain("tier0-thesis-extractor");
  });

  it("E1-cost — totalCost global v3 == pré-Tier1 + costIncurred single-pass (shim costIncurred:0)", async () => {
    const capPipeline: Captured[] = [];
    const orchP = new AgentOrchestrator() as unknown as Record<string, unknown>;
    stubHelpers(orchP, capPipeline);
    await (orchP.runFullAnalysisPipeline as (...a: unknown[]) => Promise<unknown>)({}, "deal_1", undefined, makeInit());

    const capInline: Captured[] = [];
    const orchI = new AgentOrchestrator() as unknown as Record<string, unknown>;
    stubHelpers(orchI, capInline);
    await (orchI.runFullAnalysisStepwiseV3 as (...a: unknown[]) => Promise<unknown>)({}, "deal_1", undefined, makeInit(), new InlineStepRunner(), true);

    // single-pass : costIncurred = délta Tier1 LOCAL (> 0) ; v3 : shim costIncurred = 0 (totalCost déjà global).
    expect(capPipeline[0].phasesResult.costIncurred).toBeGreaterThan(0);
    expect(capInline[0].phasesResult.costIncurred).toBe(0);
    expect(capInline[0].phasesResult.completedInPhases).toBe(0);
    // v3 porte le totalCost GLOBAL ; single-pass porte le pré-Tier1.
    expect(capInline[0].totalCost).toBeCloseTo(effTotalCost(capPipeline[0]), 9);
    expect(capInline[0].completedCount).toBe(capPipeline[0].completedCount + capPipeline[0].phasesResult.completedInPhases);
  });

  it("résilience NaN (cas Avekapeti) — gtm-analyst.confidenceLevel=NaN en phase D : snapshot écrit (NaN→null) + run atteint le terminal, PAS de crash buildStepState", async () => {
    const orch = new AgentOrchestrator() as unknown as Record<string, unknown>;
    stubHelpers(orch, []);
    // Reproduit le crash prod : un agent SUCCEEDED de phase D (gtm-analyst ∈ TIER1_PHASE_D) émet un
    // confidenceLevel non-fini. SANS le fix (normalizeToWire NaN→null), buildStepState THROW au snapshot
    // tier1-d-agents → failFullAnalysis → success:false. AVEC le fix : NaN→null, le run continue jusqu'au tail.
    orch.runTier1PhaseAgents = vi.fn(async (
      phase: { name: string; agents: readonly string[] },
      refs: { allResults: Record<string, unknown>; allFindings: unknown[] },
      state: { totalCost: number; completedCount: number },
    ) => {
      const phaseFindings = phase.agents.map((a) => ({ id: `f-${a}`, agentName: a, title: `${a} finding`, createdAt: FINDING_DATE }));
      for (const a of phase.agents) {
        refs.allResults[a] = a === "gtm-analyst"
          ? { agentName: a, success: true, executionTimeMs: 1, cost: 0.5, data: { meta: { confidenceLevel: NaN } } }
          : { agentName: a, success: true, executionTimeMs: 1, cost: 0.5 };
      }
      refs.allFindings.push(...phaseFindings);
      return {
        totalCost: state.totalCost + 0.5 * phase.agents.length,
        completedCount: state.completedCount + phase.agents.length,
        phaseFindings,
        needsReflect: [] as string[],
      };
    });

    const result = await (orch.runFullAnalysisStepwiseV3 as (...a: unknown[]) => Promise<{ success: boolean }>)(
      {}, "deal_1", undefined, makeInit(), new InlineStepRunner(), true,
    );

    // Le run a atteint runFinalCompletion (REST_RESULT.success=true), PAS failFullAnalysis (success:false).
    expect(result.success).toBe(true);
    // Le snapshot (dernier écrit, allResults cumulatif) a été produit malgré le NaN, et
    // gtm-analyst.data.meta.confidenceLevel y est null (sanitizé par normalizeToWire).
    const snap = snapshotStore.map.get("analysis_1");
    expect(snap).toBeTruthy();
    const parsed = JSON.parse(snap!) as { allResults: Record<string, { data?: { meta?: { confidenceLevel?: unknown } } }> };
    expect(parsed.allResults["gtm-analyst"]?.data?.meta?.confidenceLevel).toBeNull();
  });
});

// Séquence de steps v4 (tier0Split=true ; REFLECT_AGENTS={competitive-intel} en phase C). Le split
// tier0-thesis (tier0-pre-context + tier0-thesis-extractor) ET le split per-agent du batch tier3-pré
// (tier3-setup + tier3-pre-{conditions,contradiction,devils}) — tout après le glue décale de +3 :
// 1 tier0-facts · 2 tier0-pre-context · 3 tier0-thesis-extractor · 4 tier1-a-agents · 5 tier1-a-finalize ·
// 6 tier1-b-agents · 7 tier1-b-finalize · 8 tier1-c-agents · 9 tier1-c-reflexion-0 · 10 tier1-c-finalize ·
// 11 tier1-d-agents · 12 tier1-d-finalize · 13 post-tier1-glue · 14 tier3-setup · 15 tier3-pre-conditions ·
// 16 tier3-pre-contradiction · 17 tier3-pre-devils · 18 tier2-sector · 19 tier3-post-0 · 20 tier3-post-1 ·
// 21 tier3-post-2 · 22 post-tier1.
describe("d-3-5b — golden runFullAnalysisStepwiseV3 (E2-par-frontière, rehydrate mid-Tier1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    snapshotStore.map.clear();
    vcGuard.nullSeen = 0;
    persistenceMocks.completeAnalysis.mockResolvedValue(undefined);
    persistenceMocks.updateAnalysisProgress.mockResolvedValue(undefined);
    loadResultsMock.fn.mockResolvedValue(REST_RESULT.results);
  });

  // Référence v4 Inline (no-kill) puis v4 Fake tué après `killAfter` steps → resume → compare.
  // tier0Split=true = graphe split (tier0-pre-context + tier0-thesis-extractor).
  async function runE2(killAfter: number) {
    const capRef: Captured[] = [];
    const orchRef = new AgentOrchestrator() as unknown as Record<string, unknown>;
    stubHelpers(orchRef, capRef);
    const rRef = await (orchRef.runFullAnalysisStepwiseV3 as (...a: unknown[]) => Promise<unknown>)({}, "deal_1", undefined, makeInit(), new InlineStepRunner(), true);

    snapshotStore.map.clear();
    const cap: Captured[] = [];
    const orch = new AgentOrchestrator() as unknown as Record<string, unknown>;
    stubHelpers(orch, cap);
    const fake = new FakeStepRunner();
    const { passes } = await runStepwiseUntilDone(
      (runner) => (orch.runFullAnalysisStepwiseV3 as (...a: unknown[]) => Promise<unknown>)({}, "deal_1", undefined, makeInit(), runner, true),
      fake,
      [killAfter, null],
    );
    return { capRef, cap, passes, rRef, orch, orchRef };
  }

  function assertResumeEqualsRef(capRef: Captured[], cap: Captured[]) {
    expect(capRef).toHaveLength(1);
    expect(cap).toHaveLength(1); // le tail n'est capturé qu'à la passe finale (résultat reconstruit)
    expect(summarize(cap[0])).toEqual(summarize(capRef[0]));
    expect(effTotalCost(cap[0])).toBeCloseTo(effTotalCost(capRef[0]), 9);
    // TEETH F1 (côté usage) : aucun vc null reçu par reflexion/finalize, ni au run resumé ni au ref.
    expect(vcGuard.nullSeen).toBe(0);
  }

  it("E2-pre-context — kill APRÈS tier0-pre-context (step 2) → rehydrate depuis le 1er snapshot, tier0-thesis-extractor frais, ===ref", async () => {
    const { capRef, cap, passes, orch, orchRef } = await runE2(2);
    expect(passes).toBe(2);
    assertResumeEqualsRef(capRef, cap);
    // Le kill (au step 3 = tier0-thesis-extractor) tombe AVANT le build vc initial (en tête de Tier1,
    // après le step thesis). pass0 ne construit donc PAS le vc ; pass1 rehydrate (vc=null depuis le
    // snapshot tier0-pre-context), re-tourne tier0-thesis-extractor frais, PUIS construit le vc (1×).
    // Resume = 1 build ; ref no-kill = 1. Force le chemin !tier0PreContextBodyRan → ensureRehydrated.
    expect(orch.buildVerificationContext as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
    expect(orchRef.buildVerificationContext as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });

  it("E2-thesis-extractor — kill APRÈS tier0-thesis-extractor (step 3) → rehydrate vc=null→F1 REBUILD, Tier1 entier frais, ===ref", async () => {
    const { capRef, cap, passes, orch, orchRef } = await runE2(3);
    expect(passes).toBe(2);
    assertResumeEqualsRef(capRef, cap);
    // TEETH F1 (REBUILD) : le snapshot tier0-thesis-extractor porte vc=null → au resume F1 RECONSTRUIT le vc.
    // pass0 construit le vc (après le step thesis, avant le kill au step 4 tier1-a-agents) ; pass1 rehydrate
    // (vc=null) puis REBUILD = 2 ; ref no-kill = 1. Un guard `!rehydrated` au lieu de `vc == null` sauterait
    // le rebuild → 1 (ce test serait rouge). Force le chemin !tier0ThesisBodyRan → ensureRehydrated.
    expect(orch.buildVerificationContext as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2);
    expect(orchRef.buildVerificationContext as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });

  it("E2-agents — kill APRÈS tier1-a-agents (step 4) → rehydrate (vc carry non-null), finalize A+ frais, ===ref", async () => {
    const { capRef, cap, passes, orch } = await runE2(4);
    expect(passes).toBe(2);
    assertResumeEqualsRef(capRef, cap);
    // TEETH F1 (CARRY) : le snapshot tier1-a-agents porte un vc NON-null → pas de rebuild au resume.
    // Run resumé = pass0 (build initial) seulement = 1.
    expect(orch.buildVerificationContext as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });

  it("E2-reflexion — kill APRÈS tier1-c-reflexion-0 (step 9) → rehydrate après une reflexion individuelle, ===ref", async () => {
    const { capRef, cap, passes, orch } = await runE2(9);
    expect(passes).toBe(2);
    assertResumeEqualsRef(capRef, cap);
    expect(orch.buildVerificationContext as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1); // CARRY
  });

  it("E2-finalize — kill APRÈS tier1-c-finalize (step 10) → rehydrate profond, resume dans phase D, ===ref", async () => {
    const { capRef, cap, passes, orch } = await runE2(10);
    expect(passes).toBe(2);
    assertResumeEqualsRef(capRef, cap);
    // TEETH F1 (CARRY profond) : vc non-null porté par le snapshot c-finalize → pas de rebuild.
    expect(orch.buildVerificationContext as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });

  it("E2-glue — kill APRÈS post-tier1-glue (step 13) → rehydrate depuis le snapshot glue, terminal frais, ===ref", async () => {
    const { capRef, cap, passes, orch } = await runE2(13);
    expect(passes).toBe(2);
    assertResumeEqualsRef(capRef, cap);
    // CARRY : le snapshot post-tier1-glue porte un vc non-null → pas de rebuild au resume (le glue
    // est mémoïsé not-done ; ensureRehydrated reconstruit l'état post-glue ; le terminal tourne frais).
    expect(orch.buildVerificationContext as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });

  it("E2-tier3-setup — kill APRÈS tier3-setup (step 14) → rehydrate depuis le snapshot tier3-setup, steps tier3-pre per-agent frais, ===ref", async () => {
    const { capRef, cap, passes, orch } = await runE2(14);
    expect(passes).toBe(2);
    assertResumeEqualsRef(capRef, cap);
    // CARRY (split v4 tier3-pré) : le snapshot tier3-setup porte un vc non-null → pas de rebuild au resume
    // (tier3-setup mémoïsé not-done ; ensureRehydrated reconstruit l'état post-setup ; les 3 steps per-agent
    // + tier2-sector + terminal tournent frais). Force le chemin !tier3SetupBodyRan → ensureRehydrated.
    expect(orch.buildVerificationContext as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });

  it("E2-tier3-pre-conditions — kill APRÈS tier3-pre-conditions (step 15) → rehydrate, contradiction/devils frais, ===ref", async () => {
    const { capRef, cap, passes, orch } = await runE2(15);
    expect(passes).toBe(2);
    assertResumeEqualsRef(capRef, cap);
    // CARRY : snapshot tier3-pre-conditions (previousResults BASELINE, allResults partiel) → au resume,
    // contradiction puis devils tournent frais contre la baseline. Force !preBodyRan → ensureRehydrated.
    expect(orch.buildVerificationContext as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });

  it("E2-tier3-pre-contradiction — kill APRÈS tier3-pre-contradiction (step 16) → rehydrate, devils frais contre baseline, ===ref", async () => {
    const { capRef, cap, passes, orch } = await runE2(16);
    expect(passes).toBe(2);
    assertResumeEqualsRef(capRef, cap);
    // CARRY : snapshot tier3-pre-contradiction porte encore previousResults BASELINE (déféral) → devils
    // tourne frais SANS voir contradiction-detector dans previousResults (byte-équiv parallèle single-pass).
    expect(orch.buildVerificationContext as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });

  it("E2-tier3-pre-devils — kill APRÈS tier3-pre-devils (step 17) → rehydrate (les 3 PR publiés), tier2-sector + terminal frais, ===ref", async () => {
    const { capRef, cap, passes, orch } = await runE2(17);
    expect(passes).toBe(2);
    assertResumeEqualsRef(capRef, cap);
    // CARRY : le snapshot tier3-pre-devils porte les 3 previousResults (écriture différée) + un vc non-null
    // → pas de rebuild. Force le chemin !preBodyRan (dernier step) → ensureRehydrated.
    expect(orch.buildVerificationContext as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });

  it("E2-tier2-sector — kill APRÈS tier2-sector (step 18) → rehydrate depuis le snapshot tier2-sector, terminal frais, ===ref", async () => {
    const { capRef, cap, passes, orch } = await runE2(18);
    expect(passes).toBe(2);
    assertResumeEqualsRef(capRef, cap);
    // CARRY (d-5) : le snapshot tier2-sector porte un vc non-null → pas de rebuild au resume (tier2-sector
    // mémoïsé not-done ; ensureRehydrated reconstruit l'état post-tier2-sector ; le terminal RestAfterTier2Sector
    // tourne frais et retourne REST_RESULT). Force le chemin !tier2SectorBodyRan → ensureRehydrated.
    expect(orch.buildVerificationContext as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });

  it("E2-tier3-post-mid — kill APRÈS tier3-post-0 (step 19, 1er agent) → rehydrate, tier3-post-1/2 + terminal frais, ===ref", async () => {
    const { capRef, cap, passes, orch } = await runE2(19);
    expect(passes).toBe(2);
    assertResumeEqualsRef(capRef, cap);
    // CARRY (d-6) : kill EN COURS du post-batch per-agent (après le 1er des 3 batches). Le snapshot
    // tier3-post (lastUnit partagé) porte vc non-null → pas de rebuild ; les steps tier3-post-1/2 + le
    // terminal final tournent frais. Force le chemin !postBodyRan → ensureRehydrated.
    expect(orch.buildVerificationContext as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });

  it("E2-tier3-post-all — kill APRÈS tier3-post-2 (step 21, dernier agent) → rehydrate, terminal final frais, ===ref", async () => {
    const { capRef, cap, passes, orch } = await runE2(21);
    expect(passes).toBe(2);
    assertResumeEqualsRef(capRef, cap);
    // CARRY (d-6) : kill après TOUS les batches tier3-post ; au resume seul le terminal final tourne frais.
    expect(orch.buildVerificationContext as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });
});

// d-3-5c — TEST CIBLÉ du split tier3-pré (la fuite que les golden d-3-5a/b STUBBENT). Prouve l'invariant
// byte-critique du DÉFÉRAL previousResults : les 3 agents pré-Tier2 (conditions/contradiction/devils)
// tournent TOUS contre la BASELINE post-glue, en single-pass (parallèle) ET en v4 (per-agent). Un split
// séquentiel naïf ferait voir contradiction-detector à devils (via evidence-solidity) → divergence ;
// ce test serait alors ROUGE. + verrouille l'assertion cost-gate v4 (maxCostUsd interdit sur durable).
describe("d-3-5c — tier3-pré split : déféral previousResults (byte-équiv parallèle) + cost-gate v4", () => {
  // BASELINE previousResults post-glue. Aucune des 3 clés tier3-pré ne doit apparaître à l'INPUT.
  const BASELINE_PR = { "deck-forensics": { ok: 1 }, "financial-auditor": { ok: 1 }, _consensus_resolutions: [{ id: "c1" }] };
  const BASELINE_KEYS = Object.keys(BASELINE_PR).sort();
  const PRE_AGENTS = TIER3_BATCHES_BEFORE_TIER2[0];

  function makeCapturingMap(seen: Record<string, string[]>) {
    type CapturingAgent = {
      name: string;
      run: (ctx: { previousResults?: Record<string, unknown> }) => Promise<{
        agentName: string; success: true; executionTimeMs: number; cost: number; data: { summary: string };
      }>;
    };
    const map: Record<string, CapturingAgent> = {};
    for (const name of PRE_AGENTS) {
      map[name] = {
        name,
        run: async (ctx) => {
          seen[name] = Object.keys(ctx.previousResults ?? {}).sort();
          return { agentName: name, success: true as const, executionTimeMs: 1, cost: 0.1, data: { summary: name } };
        },
      };
    }
    return map;
  }
  const fakeStateMachine = () => ({ recordAgentComplete: vi.fn(), recordAgentFailed: vi.fn() });

  beforeEach(() => {
    vi.clearAllMocks();
    snapshotStore.map.clear();
  });

  it("déféral : les 3 agents voient TOUS la baseline (devils SANS contradiction-detector) — single-pass === v4 ; PR finaux === ", async () => {
    const orch = new AgentOrchestrator() as unknown as Record<string, unknown>;

    // ----- single-pass : runTier3PreTier2Batch RÉEL (parallèle + déféral via applyDeferred) -----
    const seenSingle: Record<string, string[]> = {};
    const ecSingle = { previousResults: { ...BASELINE_PR } };
    const allResultsSingle: Record<string, unknown> = {};
    await (orch.runTier3PreTier2Batch as (p: unknown) => Promise<unknown>)({
      stepwise: true, maxCostUsd: undefined, totalCost: 0, completedCount: 0,
      tier3AgentMap: makeCapturingMap(seenSingle), enrichedContext: ecSingle, allResults: allResultsSingle,
      stateMachine: fakeStateMachine(), analysis: { id: "analysis_1" }, dealId: "deal_1",
      startTime: 0, onProgress: undefined, TOTAL_AGENTS: 22,
    });

    // ----- v4 per-agent : run séquentiel + collectPreTier2Result (SANS PR) puis applyDeferred (ordre driver) -----
    const seenV4: Record<string, string[]> = {};
    const mapV4 = makeCapturingMap(seenV4);
    const ecV4 = { previousResults: { ...BASELINE_PR } };
    const allResultsV4: Record<string, unknown> = {};
    const sm = fakeStateMachine();
    let tc = 0, cc = 0;
    for (const name of PRE_AGENTS) {
      const result = await mapV4[name].run(ecV4);
      ({ totalCost: tc, completedCount: cc } = await (orch.collectPreTier2Result as (p: unknown) => Promise<{ totalCost: number; completedCount: number }>)({
        agentName: name, result, allResults: allResultsV4, totalCost: tc, completedCount: cc, stateMachine: sm, dealId: "deal_1",
      }));
    }
    (orch.applyDeferredPreTier2PreviousResults as (ec: unknown, ar: unknown) => void)(ecV4, allResultsV4);

    // INVARIANT byte-critique : chaque agent a tourné contre la BASELINE (aucune clé tier3-pré à l'input).
    for (const name of PRE_AGENTS) {
      expect(seenSingle[name], `single-pass ${name}`).toEqual(BASELINE_KEYS);
      expect(seenV4[name], `v4 ${name}`).toEqual(BASELINE_KEYS);
    }
    // Teeth : devils NE voit PAS contradiction-detector (la divergence qu'un split séquentiel naïf créerait).
    expect(seenSingle["devils-advocate"]).not.toContain("contradiction-detector");
    expect(seenV4["devils-advocate"]).not.toContain("contradiction-detector");
    // Inputs vus identiques single-pass vs v4.
    expect(seenV4).toEqual(seenSingle);

    // APRÈS les 2 chemins : previousResults publie les 3 (déféral). Clés finales identiques.
    const prSingle = Object.keys((ecSingle as { previousResults: Record<string, unknown> }).previousResults);
    const prV4 = Object.keys(ecV4.previousResults);
    for (const name of PRE_AGENTS) {
      expect(prSingle, `single-pass PR ${name}`).toContain(name);
      expect(prV4, `v4 PR ${name}`).toContain(name);
    }
    expect(prV4.sort()).toEqual(prSingle.sort());
  });

  it("cost-gate v4 — maxCostUsd défini sur le chemin durable → assertion loud (analyse FAILED via failFullAnalysis)", async () => {
    const orch = new AgentOrchestrator() as unknown as Record<string, unknown>;
    stubHelpers(orch, []);
    persistenceMocks.completeAnalysis.mockResolvedValue(undefined);
    persistenceMocks.updateAnalysisProgress.mockResolvedValue(undefined);
    loadResultsMock.fn.mockResolvedValue(REST_RESULT.results);
    const init = makeInit() as Record<string, unknown>;
    init.maxCostUsd = 5;
    const result = await (orch.runFullAnalysisStepwiseV3 as (...a: unknown[]) => Promise<{ success: boolean }>)(
      {}, "deal_1", undefined, init, new InlineStepRunner(), true,
    );
    expect(result.success).toBe(false);
    const failCalls = (orch.failFullAnalysis as ReturnType<typeof vi.fn>).mock.calls;
    expect(failCalls.length).toBeGreaterThan(0);
    expect((failCalls[0][0] as Error).message).toContain("maxCostUsd");
  });
});

// d-3-6 — PIN du comportement CASSÉ des early-returns (gate Codex #10) : failFast/cost-limit appellent
// stateMachine.complete() depuis ANALYZING/DEBATING (sans startSynthesis) → transition INVALIDE → LÈVE.
// Le `return {done:true,result}` (success « stopped early ») est donc INJOIGNABLE ; l'analyse FINIT
// FAILED (via le catch terminal → failFullAnalysis). C'est pourquoi le driver v3 NE porte PAS de
// terminalEnvelope pour le done. Ce test verrouille le comportement actuel (un « fix » silencieux de
// la transition le ferait tourner au rouge → décision explicite requise, cf. PLAN).
describe("d-3-6 — early-return failFast : comportement cassé pinné", () => {
  it("runPostTier1FailFast LÈVE au complete() depuis ANALYZING (FAILED, PAS success « stopped early »)", async () => {
    const orch = new AgentOrchestrator() as unknown as Record<string, unknown>;
    const sm = new AnalysisStateMachine({
      analysisId: "a1", dealId: "d1", mode: "full_analysis", agents: ["deck-forensics"], enableCheckpointing: false,
    });
    await sm.start();          // IDLE → INITIALIZING
    await sm.startGathering(); // INITIALIZING → GATHERING
    await sm.startAnalysis();  // GATHERING → ANALYZING
    await expect(
      (orch.runPostTier1FailFast as (p: unknown) => Promise<unknown>)({
        failFastOnCritical: true,
        collectedWarnings: [{ severity: "critical", title: "Crit", description: "desc" }],
        stateMachine: sm,
        analysis: { id: "a1" },
        dealId: "d1",
        analysisModeOverride: undefined,
        allResults: {},
        totalCost: 1,
        startTime: 0,
      })
    ).rejects.toThrow(/Invalid state transition: ANALYZING -> COMPLETED/);
  });
});
