import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  FULL_ANALYSIS_STEP_STATE_VERSION,
  type FullAnalysisStepState,
} from "../full-analysis-step-state";
import {
  writeStepwiseSnapshot,
  readLatestStepwiseSnapshot,
  stepwiseStateValue,
  isStepwiseState,
  STEPWISE_STATE_PREFIX,
} from "../full-analysis-snapshot";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    analysisCheckpoint: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

const mockPrisma = prisma as unknown as {
  analysisCheckpoint: {
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
};

function makeValidState(over: Partial<FullAnalysisStepState> = {}): FullAnalysisStepState {
  return {
    version: FULL_ANALYSIS_STEP_STATE_VERSION,
    analysisId: "a1",
    dealId: "d1",
    analysisType: "full_analysis",
    totalAgents: 21,
    completedCount: 6,
    totalCost: 1.2345,
    lastUnit: "tier1-phase-b",
    done: false,
    allResults: { "deck-forensics": { success: true }, "financial-auditor": { success: true } },
    previousResults: { "deck-forensics": { success: true }, _consensus_resolutions: [{ id: "c1" }] },
    tier1CrossValidation: { adjusted: true },
    consolidatedRedFlags: [{ severity: "HIGH" }],
    factStoreFormatted: "FACT: x",
    verificationContext: { fundingDb: { p50: 5 } },
    // --- v2 (D.5b) ---
    startTimeMs: 1_700_000_000_000,
    evidenceLedgerFormatted: "EVIDENCE: x",
    evidenceTodayIso: "2026-06-01T00:00:00.000Z",
    conditionsAnalystMode: null,
    canonicalDeal: { id: "d1", name: "Acme", sector: "saas", createdAt: "2026-05-01T10:00:00.000Z" },
    analysisBinding: { id: "a1", mode: "full_analysis", thesisId: null, corpusSnapshotId: null },
    evidenceContext: null,
    thesis: null,
    contextEngine: null,
    evidenceLedger: null,
    extractedData: null,
    deckCoherenceReport: null,
    baPreferences: null,
    dealTerms: null,
    dealStructure: null,
    scopedDocuments: [{ id: "doc1", name: "deck.pdf", type: "pitch", uploadedAt: "2026-04-01T00:00:00.000Z" }],
    factStore: [],
    founderResponses: [],
    collectedWarnings: [],
    previousAnalysisQuestions: null,
    ...over,
  };
}

describe("snapshot helpers — state value", () => {
  it("stepwiseStateValue / isStepwiseState", () => {
    expect(stepwiseStateValue("tier1-phase-c")).toBe(`${STEPWISE_STATE_PREFIX}tier1-phase-c`);
    expect(isStepwiseState("STEPWISE:tier2-sector")).toBe(true);
    expect(isStepwiseState("ANALYZING")).toBe(false);
    expect(isStepwiseState("COMPLETED")).toBe(false);
    expect(isStepwiseState(null)).toBe(false);
  });
});

describe("writeStepwiseSnapshot", () => {
  beforeEach(() => vi.resetAllMocks());

  it("écrit un AnalysisCheckpoint STEPWISE:<unit> avec le StepState dans results", async () => {
    mockPrisma.analysisCheckpoint.create.mockResolvedValue({ id: "ck1" });
    const s = makeValidState({ lastUnit: "tier1-phase-c" });
    const id = await writeStepwiseSnapshot(s);
    expect(id).toBe("ck1");
    expect(mockPrisma.analysisCheckpoint.create).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.analysisCheckpoint.create.mock.calls[0][0];
    expect(arg.data.analysisId).toBe("a1");
    expect(arg.data.state).toBe("STEPWISE:tier1-phase-c");
    expect(arg.data.results).toEqual(s);
    expect(arg.data.completedAgents).toEqual(["deck-forensics", "financial-auditor"]);
  });

  it("REFUSE d'écrire un state non sérialisable (Date) AVANT tout appel DB", async () => {
    const bad = makeValidState({ verificationContext: { when: new Date() } });
    await expect(writeStepwiseSnapshot(bad)).rejects.toThrow(/non-plain|sérialisable/);
    expect(mockPrisma.analysisCheckpoint.create).not.toHaveBeenCalled();
  });
});

describe("readLatestStepwiseSnapshot", () => {
  beforeEach(() => vi.resetAllMocks());

  it("filtre sur state STEPWISE:* + createdAt desc, et désérialise", async () => {
    const s = makeValidState();
    mockPrisma.analysisCheckpoint.findFirst.mockResolvedValue({ results: s });
    const back = await readLatestStepwiseSnapshot("a1");
    expect(back).toEqual(s);
    const arg = mockPrisma.analysisCheckpoint.findFirst.mock.calls[0][0];
    expect(arg.where.analysisId).toBe("a1");
    expect(arg.where.state).toEqual({ startsWith: STEPWISE_STATE_PREFIX });
    expect(arg.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
  });

  it("retourne null si aucun snapshot", async () => {
    mockPrisma.analysisCheckpoint.findFirst.mockResolvedValue(null);
    expect(await readLatestStepwiseSnapshot("a1")).toBeNull();
  });

  it("retourne null si results vide", async () => {
    mockPrisma.analysisCheckpoint.findFirst.mockResolvedValue({ results: null });
    expect(await readLatestStepwiseSnapshot("a1")).toBeNull();
  });

  it("lève si le snapshot persisté est invalide (version inconnue)", async () => {
    mockPrisma.analysisCheckpoint.findFirst.mockResolvedValue({
      results: { ...makeValidState(), version: 999 },
    });
    await expect(readLatestStepwiseSnapshot("a1")).rejects.toThrow(/version/);
  });
});

describe("round-trip write→read via DB mockée (carry de bout en bout)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("le state lu == le state écrit (tous les blobs non reconstructibles survivent)", async () => {
    // Simule un vrai aller-retour DB : create capture la row, findFirst la rejoue.
    let stored: unknown = null;
    mockPrisma.analysisCheckpoint.create.mockImplementation(async (arg: { data: { results: unknown } }) => {
      stored = arg.data.results;
      return { id: "ck1" };
    });
    mockPrisma.analysisCheckpoint.findFirst.mockImplementation(async () => ({ results: stored }));

    const s = makeValidState({ verificationContext: { fundingDb: { p50: 5, p75: 9 } } });
    await writeStepwiseSnapshot(s);
    const back = await readLatestStepwiseSnapshot("a1");
    expect(back).toEqual(s);
    expect(back?.verificationContext).toEqual({ fundingDb: { p50: 5, p75: 9 } });
    expect(back?.previousResults).toEqual(s.previousResults);
  });

  it("FUNDING-DB DRIFT : le snapshot rend le verificationContext PORTÉ (p50:5), pas la valeur driftée (p50:9)", async () => {
    let stored: unknown = null;
    mockPrisma.analysisCheckpoint.create.mockImplementation(async (arg: { data: { results: unknown } }) => {
      stored = arg.data.results;
      return { id: "ck1" };
    });
    mockPrisma.analysisCheckpoint.findFirst.mockImplementation(async () => ({ results: stored }));

    // Au write, la funding-DB valait p50:5 → porté dans le snapshot.
    await writeStepwiseSnapshot(makeValidState({ verificationContext: { fundingDb: { p50: 5 } } }));

    // La funding-DB a DRIFTÉ depuis (p50:9). Un rebuild produirait p50:9.
    const rebuiltIfRecomputed = { fundingDb: { p50: 9 } };

    const back = await readLatestStepwiseSnapshot("a1");
    // Le test passe SEULEMENT si vc est porté (carry), pas reconstruit :
    expect(back?.verificationContext).toEqual({ fundingDb: { p50: 5 } });
    expect(back?.verificationContext).not.toEqual(rebuiltIfRecomputed);
  });

  it("NÉGATIF (dents) : si la row persistée a perdu verificationContext, le read le reflète (≠ écrit)", async () => {
    const s = makeValidState({ verificationContext: { fundingDb: { p50: 5 } } });
    // Row corrompue : vc droppé à null (simulant un carry défaillant).
    mockPrisma.analysisCheckpoint.findFirst.mockResolvedValue({
      results: { ...JSON.parse(JSON.stringify(s)), verificationContext: null },
    });
    const back = await readLatestStepwiseSnapshot("a1");
    expect(back).not.toEqual(s);
    expect(back?.verificationContext).toBeNull();
  });
});
