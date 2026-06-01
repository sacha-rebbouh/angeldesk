import { describe, it, expect } from "vitest";
import type { EnrichedAgentContext } from "@/agents/types";
import { buildStepState, rehydrateContext } from "../full-analysis-step-state-bridge";
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
      // relation documents portée par {...deal} dans buildCanonicalRuntimeDeal (distincte de scopedDocuments)
      documents: [{ id: "doc1", name: "deck.pdf", uploadedAt: DEAL_CREATED, sourceDate: null, receivedAt: null }],
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
    transitionCount: 4,
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

describe("rehydrateContext (D.5b b-3) — DTO wire -> état vivant (revive Date)", () => {
  it("ravive TOUTES les Date connues en instances Date avec les bonnes valeurs", () => {
    const r = rehydrateContext(build());
    const ctx = r.enrichedContext;
    const deal = ctx.canonicalDeal as unknown as { createdAt: Date; founders: { createdAt: Date }[] };
    expect(deal.createdAt).toBeInstanceOf(Date);
    expect(deal.createdAt.getTime()).toBe(DEAL_CREATED.getTime());
    expect(deal.founders[0].createdAt).toBeInstanceOf(Date);
    expect(ctx.evidenceToday).toBeInstanceOf(Date);
    expect((ctx.evidenceToday as Date).getTime()).toBe(EVIDENCE_TODAY.getTime());
    const doc = ctx.documents?.[0] as unknown as { uploadedAt: Date };
    expect(doc.uploadedAt).toBeInstanceOf(Date);
    expect(doc.uploadedAt.getTime()).toBe(DOC_UPLOADED.getTime());
    const fact = (ctx.factStore as unknown as { firstSeenAt: Date; eventHistory: { createdAt: Date }[] }[])[0];
    expect(fact.firstSeenAt).toBeInstanceOf(Date);
    expect(fact.eventHistory[0].createdAt).toBeInstanceOf(Date);
    const evd = ctx.evidenceContext as unknown as { doc1: { documentDate: { date: Date } } };
    expect(evd.doc1.documentDate.date).toBeInstanceOf(Date);
    expect(evd.doc1.documentDate.date.getTime()).toBe(FACT_DATE.getTime());
    const warn = r.collectedWarnings[0] as { timestamp: Date };
    expect(warn.timestamp).toBeInstanceOf(Date);
    expect(warn.timestamp.getTime()).toBe(WARN_TS.getTime());
  });

  it("ravive aussi canonicalDeal.documents[].dates (relation deal portée par {...deal} — gate Codex b-3)", () => {
    const r = rehydrateContext(build());
    const deal = r.enrichedContext.canonicalDeal as unknown as { documents: { uploadedAt: Date }[] };
    expect(deal.documents[0].uploadedAt).toBeInstanceOf(Date);
    expect(deal.documents[0].uploadedAt.getTime()).toBe(DEAL_CREATED.getTime());
  });

  it("deal = canonicalDeal, et deal.canonicalDeal ne ré-appelle pas attachEvidenceLedger (evidenceLedger carry intact)", () => {
    const state = build();
    const r = rehydrateContext(state);
    expect(r.enrichedContext.deal).toBe(r.enrichedContext.canonicalDeal);
    // evidenceLedger.generatedAt CARRY (pas régénéré)
    expect((r.enrichedContext.evidenceLedger as unknown as { generatedAt: string }).generatedAt).toBe(ISO);
  });

  it("preserve les champs non-Date (factStoreFormatted, previousResults._consensus_resolutions, locals)", () => {
    const r = rehydrateContext(build());
    expect(r.enrichedContext.factStoreFormatted).toBe("FACT: revenue=100k");
    expect((r.enrichedContext.previousResults as Record<string, unknown>)["_consensus_resolutions"]).toEqual([{ id: "c1" }]);
    expect(r.totalCost).toBe(1.23);
    expect(r.completedCount).toBe(6);
    expect(r.startTimeMs).toBe(1_700_000_000_000);
    expect(r.allResults["deck-forensics"]).toEqual({ success: true, score: 72 });
    expect(r.verificationContext).toEqual({ facts: ["f1"] });
  });

  it("ROUND-TRIP : build -> rehydrate -> build redonne un DTO IDENTIQUE (wire stable)", () => {
    const dto1 = build();
    const r = rehydrateContext(dto1);
    const dto2 = buildStepState({
      analysisId: r.analysisId, dealId: r.dealId, analysisType: r.analysisType,
      totalAgents: r.totalAgents, completedCount: r.completedCount, totalCost: r.totalCost,
      startTimeMs: r.startTimeMs, transitionCount: r.transitionCount, lastUnit: r.lastUnit, done: r.done,
      enrichedContext: r.enrichedContext, allResults: r.allResults,
      verificationContext: r.verificationContext, collectedWarnings: r.collectedWarnings,
      terminalResult: r.terminalResult,
    });
    expect(dto2).toEqual(dto1);
  });

  it("revive PROFOND evidenceContext (forecast/actuals/claims/detectedAttachments)", () => {
    const r = rehydrateContext(build({
      evidenceContext: {
        doc1: {
          documentDate: { date: FACT_DATE },
          asOf: { date: FACT_DATE },
          forecast: { start: FACT_DATE, end: DEAL_CREATED },
          actuals: [{ start: FACT_DATE, end: DEAL_CREATED }],
          detectedAttachments: [{ emailSourceDate: DOC_UPLOADED }],
          claims: [{ dateStart: FACT_DATE, dateEnd: null }],
        },
      } as unknown as never,
    }));
    const d = r.enrichedContext.evidenceContext as unknown as {
      doc1: {
        asOf: { date: Date }; forecast: { start: Date; end: Date };
        actuals: { start: Date; end: Date }[]; detectedAttachments: { emailSourceDate: Date }[];
        claims: { dateStart: Date; dateEnd: Date | null }[];
      };
    };
    expect(d.doc1.asOf.date).toBeInstanceOf(Date);
    expect(d.doc1.forecast.start).toBeInstanceOf(Date);
    expect(d.doc1.forecast.end).toBeInstanceOf(Date);
    expect(d.doc1.actuals[0].start).toBeInstanceOf(Date);
    expect(d.doc1.detectedAttachments[0].emailSourceDate).toBeInstanceOf(Date);
    expect(d.doc1.claims[0].dateStart).toBeInstanceOf(Date);
    expect(d.doc1.claims[0].dateEnd).toBeNull();
  });

  it("LÈVE sur une date ISO invalide (gate Codex b-1 : pas de Invalid Date)", () => {
    const bad = deserializeStepState(serializeStepState(build()));
    expect(() => rehydrateContext({ ...bad, evidenceTodayIso: "not-a-date" })).toThrow(/invalide|date/i);
    expect(() => rehydrateContext({ ...bad, canonicalDeal: { id: "d1", createdAt: "garbage" } })).toThrow(/invalide|date/i);
  });
});
