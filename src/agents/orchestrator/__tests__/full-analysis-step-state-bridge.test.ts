import { describe, it, expect } from "vitest";
import type { EnrichedAgentContext } from "@/agents/types";
import { buildStepState } from "../full-analysis-step-state-bridge";
import {
  FULL_ANALYSIS_STEP_STATE_VERSION,
  serializeStepState,
  deserializeStepState,
} from "../full-analysis-step-state";

const ISO = "2026-06-01T00:00:00.000Z";
const DEAL_CREATED = new Date("2026-05-01T10:00:00.000Z");
const DOC_UPLOADED = new Date("2026-04-01T00:00:00.000Z");
const FACT_DATE = new Date("2026-04-15T00:00:00.000Z");
const WARN_TS = new Date("2026-06-01T12:00:00.000Z");
const EVIDENCE_TODAY = new Date(ISO);

// Contexte VIVANT minimal (avec Date objects) — cast pour ne fournir que les champs lus.
function makeLiveContext(over: Partial<EnrichedAgentContext> = {}): EnrichedAgentContext {
  return {
    dealId: "d1",
    deal: { id: "d1", name: "Acme", sector: "saas", createdAt: DEAL_CREATED } as unknown,
    canonicalDeal: {
      id: "d1",
      name: "Acme",
      sector: "saas",
      createdAt: DEAL_CREATED,
      updatedAt: DEAL_CREATED,
      founders: [{ id: "f1", name: "Jane", role: "CEO", createdAt: DEAL_CREATED }],
    } as unknown,
    analysis: { id: "a1", mode: "full_analysis", thesisBypass: false, thesisId: "t1", corpusSnapshotId: "cs1" },
    documents: [
      { id: "doc1", name: "deck.pdf", type: "pitch", uploadedAt: DOC_UPLOADED, sourceDate: null, receivedAt: null },
    ],
    evidenceContext: { doc1: { documentDate: { date: FACT_DATE } } } as unknown,
    evidenceToday: EVIDENCE_TODAY,
    previousResults: { "deck-forensics": { success: true, score: 72 }, _consensus_resolutions: [{ id: "c1" }] },
    factStore: [
      { factKey: "revenue", currentValue: 100000, firstSeenAt: FACT_DATE, lastUpdatedAt: FACT_DATE, eventHistory: [{ createdAt: FACT_DATE }] },
    ] as unknown,
    factStoreFormatted: "FACT: revenue=100k",
    evidenceLedger: { generatedAt: ISO, coverage: { documents: 1 }, items: [], warnings: [] } as unknown,
    evidenceLedgerFormatted: "EVIDENCE: deck",
    thesis: { id: "t1", reformulated: "x", verdict: "favorable", confidence: 71 } as unknown,
    contextEngine: { completeness: 0.8, enrichedAt: ISO },
    extractedData: { tagline: "t", competitors: ["c1"] } as unknown,
    tier1CrossValidation: { validations: [], adjustments: [], warnings: [] },
    consolidatedRedFlags: [{ severity: "HIGH", title: "rf" }] as unknown,
    ...over,
  } as unknown as EnrichedAgentContext;
}

function build(over: Partial<EnrichedAgentContext> = {}, locals: Partial<Parameters<typeof buildStepState>[0]> = {}) {
  return buildStepState({
    analysisId: "a1",
    dealId: "d1",
    analysisType: "full_analysis",
    totalAgents: 21,
    completedCount: 6,
    totalCost: 1.23,
    startTimeMs: 1_700_000_000_000,
    lastUnit: "tier1-phase-b",
    done: false,
    enrichedContext: makeLiveContext(over),
    allResults: { "deck-forensics": { success: true, score: 72 } },
    verificationContext: { facts: ["f1"] },
    collectedWarnings: [{ severity: "high", title: "w", timestamp: WARN_TS }],
    ...locals,
  });
}

describe("buildStepState (D.5b b-2) — live -> DTO sérialisable", () => {
  it("produit un DTO valide (round-trip serialize/deserialize)", () => {
    const state = build();
    expect(state.version).toBe(FULL_ANALYSIS_STEP_STATE_VERSION);
    const back = deserializeStepState(serializeStepState(state));
    expect(back).toEqual(state);
  });

  it("normalise TOUTES les Date en ISO (deal, documents, factStore, evidenceContext, evidenceToday, collectedWarnings)", () => {
    const state = build();
    expect(state.evidenceTodayIso).toBe(EVIDENCE_TODAY.toISOString());
    expect((state.canonicalDeal as { createdAt: unknown }).createdAt).toBe(DEAL_CREATED.toISOString());
    expect((state.canonicalDeal as { founders: { createdAt: unknown }[] }).founders[0].createdAt).toBe(DEAL_CREATED.toISOString());
    expect((state.scopedDocuments[0] as { uploadedAt: unknown }).uploadedAt).toBe(DOC_UPLOADED.toISOString());
    expect((state.factStore[0] as { firstSeenAt: unknown }).firstSeenAt).toBe(FACT_DATE.toISOString());
    expect((state.factStore[0] as { eventHistory: { createdAt: unknown }[] }).eventHistory[0].createdAt).toBe(FACT_DATE.toISOString());
    expect((state.evidenceContext as { doc1: { documentDate: { date: unknown } } }).doc1.documentDate.date).toBe(FACT_DATE.toISOString());
    expect((state.collectedWarnings[0] as { timestamp: unknown }).timestamp).toBe(WARN_TS.toISOString());
  });

  it("le DTO ne contient AUCUNE instance Date (tout est string ISO)", () => {
    const state = build();
    const hasDate = (v: unknown): boolean => {
      if (v instanceof Date) return true;
      if (Array.isArray(v)) return v.some(hasDate);
      if (v && typeof v === "object") return Object.values(v).some(hasDate);
      return false;
    };
    expect(hasDate(state)).toBe(false);
  });

  it("porte previousResults COMPLET (incl. _consensus_resolutions)", () => {
    const state = build();
    expect(state.previousResults["_consensus_resolutions"]).toEqual([{ id: "c1" }]);
    expect(state.previousResults["deck-forensics"]).toEqual({ success: true, score: 72 });
  });

  it("mappe les champs absents/undefined sur null (état partiel)", () => {
    const state = build({
      thesis: undefined,
      contextEngine: undefined,
      baPreferences: undefined,
      dealTerms: undefined,
      dealStructure: undefined,
      conditionsAnalystMode: undefined,
      previousAnalysisQuestions: undefined,
      consolidatedRedFlags: undefined,
    });
    expect(state.thesis).toBeNull();
    expect(state.contextEngine).toBeNull();
    expect(state.baPreferences).toBeNull();
    expect(state.dealTerms).toBeNull();
    expect(state.dealStructure).toBeNull();
    expect(state.conditionsAnalystMode).toBeNull();
    expect(state.previousAnalysisQuestions).toBeNull();
    expect(state.consolidatedRedFlags).toBeNull();
  });

  it("blobs tableau requis vides quand le champ est absent (factStore/documents/founderResponses)", () => {
    const state = build({ factStore: undefined, documents: undefined, founderResponses: undefined });
    expect(state.factStore).toEqual([]);
    expect(state.scopedDocuments).toEqual([]);
    expect(state.founderResponses).toEqual([]);
  });

  it("carry des identités/scalaires + startTimeMs", () => {
    const state = build();
    expect(state.analysisId).toBe("a1");
    expect(state.totalAgents).toBe(21);
    expect(state.completedCount).toBe(6);
    expect(state.startTimeMs).toBe(1_700_000_000_000);
    expect(state.lastUnit).toBe("tier1-phase-b");
    expect(state.analysisBinding).toMatchObject({ thesisId: "t1", corpusSnapshotId: "cs1" });
  });
});

describe("buildStepState — normalizer STRICT (gate Codex b-2 : pas de perte silencieuse)", () => {
  it("LÈVE sur NaN imbriqué (vs JSON round-trip qui aurait fait NaN->null)", () => {
    expect(() => build({ factStore: [{ revenue: NaN }] as unknown as never })).toThrow(/non-fini|NaN/);
  });

  it("LÈVE sur Infinity imbriqué", () => {
    expect(() => build({ factStore: [{ growth: Infinity }] as unknown as never })).toThrow(/non-fini|Infinity/);
  });

  it("LÈVE sur une Map imbriquée (vs JSON round-trip qui aurait fait Map->{})", () => {
    expect(() => build({ contextEngine: { m: new Map([["a", 1]]) } as unknown as never })).toThrow(/non-plain|Map/);
  });

  it("LÈVE sur un Set imbriqué", () => {
    expect(() => build({ contextEngine: { s: new Set([1, 2]) } as unknown as never })).toThrow(/non-plain|Set/);
  });

  it("LÈVE sur une instance de classe non-Date imbriquée", () => {
    class Weird { a = 1; }
    expect(() => build({ contextEngine: { w: new Weird() } as unknown as never })).toThrow(/non-plain|Weird/);
  });

  it("LÈVE sur une function imbriquée", () => {
    expect(() => build({ contextEngine: { f: () => 1 } as unknown as never })).toThrow(/function/);
  });

  it("DROP les undefined imbriqués d'un objet (champ optionnel absent) — comme JSON, et c'est tracé", () => {
    const state = build({ contextEngine: { a: 1, b: undefined } as unknown as never });
    expect(state.contextEngine).toEqual({ a: 1 });
    expect("b" in (state.contextEngine as object)).toBe(false);
  });

  it("mappe un élément undefined de tableau -> null (comme JSON.stringify([undefined]))", () => {
    const state = build({ consolidatedRedFlags: [undefined, { severity: "HIGH" }] as unknown as never });
    expect(state.consolidatedRedFlags).toEqual([null, { severity: "HIGH" }]);
  });
});
