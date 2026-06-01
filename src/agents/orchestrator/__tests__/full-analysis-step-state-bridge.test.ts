import { describe, it, expect } from "vitest";
import type { EnrichedAgentContext } from "@/agents/types";
import {
  buildStepState,
  rehydrateContext,
  buildTerminalEnvelope,
  reviveTerminalEnvelope,
  buildTier0FactsWire,
  applyTier0FactsWire,
} from "../full-analysis-step-state-bridge";
import type { AnalysisResult } from "../types";
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
const FINDING_CREATED = new Date("2026-04-20T00:00:00.000Z");

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
    // tier1Findings (v3 d-2a) — local de runFullAnalysis ; createdAt = Date vivante (-> ISO)
    tier1Findings: [
      { id: "deck-forensics_story_coherence_ab12cd34", agentName: "deck-forensics", metric: "story_coherence", value: 72, createdAt: FINDING_CREATED },
    ],
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
      tier1Findings: r.tier1Findings,
      terminalResult: r.terminalResult,
    });
    expect(dto2).toEqual(dto1);
  });

  it("tier1Findings (v3 d-2a) : createdAt normalisé en ISO au build, ravivé en Date au rehydrate (SEULE date)", () => {
    const state = build();
    // build : createdAt -> ISO (wire) ; le reste du finding intact
    const wired = state.tier1Findings[0] as { id: string; createdAt: unknown; value: number };
    expect(wired.createdAt).toBe(FINDING_CREATED.toISOString());
    expect(wired.id).toBe("deck-forensics_story_coherence_ab12cd34");
    expect(wired.value).toBe(72);
    // rehydrate : RehydratedState.tier1Findings (hors enrichedContext), createdAt -> Date
    const r = rehydrateContext(state);
    expect(Array.isArray(r.tier1Findings)).toBe(true);
    const revived = r.tier1Findings[0] as { createdAt: Date; id: string };
    expect(revived.createdAt).toBeInstanceOf(Date);
    expect(revived.createdAt.getTime()).toBe(FINDING_CREATED.getTime());
    expect(revived.id).toBe("deck-forensics_story_coherence_ab12cd34");
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

describe("buildTerminalEnvelope / reviveTerminalEnvelope (D.5d-1c — enveloppe terminale)", () => {
  const TS = new Date("2026-06-01T12:00:00.000Z");

  function makeResult(over: Partial<AnalysisResult> = {}): AnalysisResult {
    return {
      sessionId: "a1",
      dealId: "d1",
      type: "full_analysis",
      success: true,
      results: { "deck-forensics": { success: true } } as unknown as AnalysisResult["results"],
      totalCost: 1.23,
      totalTimeMs: 42000,
      summary: "résumé",
      earlyWarnings: [
        {
          id: "w1",
          timestamp: TS,
          agentName: "red-flag-detector",
          severity: "high",
          category: "financial_critical",
          title: "t",
          description: "d",
          evidence: ["e"],
          confidence: 80,
          recommendation: "investigate",
        },
      ],
      hasCriticalWarnings: false,
      tiersExecuted: ["tier0", "tier1"],
      ...over,
    } as AnalysisResult;
  }

  it("buildTerminalEnvelope EXCLUT results et normalise earlyWarnings[].timestamp en ISO", () => {
    const env = buildTerminalEnvelope(makeResult());
    expect("results" in env).toBe(false);
    expect(env.sessionId).toBe("a1");
    expect(env.totalCost).toBe(1.23);
    const warns = env.earlyWarnings as Array<Record<string, unknown>>;
    expect(warns[0].timestamp).toBe(TS.toISOString()); // Date -> string ISO (wire)
  });

  it("reviveTerminalEnvelope ravive earlyWarnings[].timestamp en Date (round-trip JSON)", () => {
    // Simule la frontière durable : enveloppe wire passée par JSON (comme step.run).
    const wire = JSON.parse(JSON.stringify(buildTerminalEnvelope(makeResult())));
    expect(typeof wire.earlyWarnings[0].timestamp).toBe("string"); // dents : bien une string avant revive
    const revived = reviveTerminalEnvelope(wire);
    const warns = revived.earlyWarnings as Array<Record<string, unknown>>;
    expect(warns[0].timestamp).toBeInstanceOf(Date);
    expect((warns[0].timestamp as Date).toISOString()).toBe(TS.toISOString());
  });

  it("build∘revive (+ results réinjecté) reconstruit l'AnalysisResult d'origine", () => {
    const original = makeResult();
    const wire = JSON.parse(JSON.stringify(buildTerminalEnvelope(original)));
    const reconstructed = { ...reviveTerminalEnvelope(wire), results: original.results } as unknown as AnalysisResult;
    expect(reconstructed).toEqual(original);
  });

  it("sans earlyWarnings : enveloppe valide, revive no-op", () => {
    const env = buildTerminalEnvelope(makeResult({ earlyWarnings: undefined }));
    expect("earlyWarnings" in env).toBe(false); // undefined droppé (comme JSON)
    const revived = reviveTerminalEnvelope(JSON.parse(JSON.stringify(env)));
    expect(revived.sessionId).toBe("a1");
  });
});

// ============================================================================
// d-2b — tier0-facts wire (buildTier0FactsWire / applyTier0FactsWire)
// ============================================================================

describe("d-2b — tier0-facts wire (DTO step de sortie)", () => {
  function makeFactStore() {
    return [
      {
        factKey: "arr",
        value: "1.2M",
        category: "financial",
        firstSeenAt: new Date("2026-01-01T00:00:00.000Z"),
        lastUpdatedAt: new Date("2026-02-01T00:00:00.000Z"),
        validAt: new Date("2026-01-15T00:00:00.000Z"),
        eventHistory: [
          {
            eventType: "ASSERTED",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            validAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ],
      },
    ];
  }

  it("round-trip lossless : build -> JSON (frontière step) -> apply ravive les Date du factStore", () => {
    const factStore = makeFactStore();
    const founderResponses = [{ questionId: "q1", question: "ARR ?", answer: "1.2M", category: "financial" }];
    const factExtractorResult = {
      agentName: "fact-extractor",
      success: true,
      executionTimeMs: 1234,
      cost: 0.05,
      data: { facts: [{ key: "arr", value: "1.2M" }] },
    };

    const wire = buildTier0FactsWire({
      totalCost: 0.05,
      completedCount: 1,
      factStore,
      factStoreFormatted: "ARR: 1.2M",
      founderResponses,
      factExtractorResult,
    });

    // La frontière step Inngest sérialise/désérialise le retour en JSON.
    const roundTripped = JSON.parse(JSON.stringify(wire)) as typeof wire;
    const applied = applyTier0FactsWire(roundTripped);

    expect(applied.totalCost).toBe(0.05);
    expect(applied.completedCount).toBe(1);
    expect(applied.factStoreFormatted).toBe("ARR: 1.2M");
    expect(applied.founderResponses).toEqual(founderResponses);
    // factStore : Date RAVIVÉES → deep-equal à l'original (Date objects).
    expect(applied.factStore).toEqual(factStore);
    expect((applied.factStore[0] as Record<string, unknown>).firstSeenAt).toBeInstanceOf(Date);
    const ev = (applied.factStore[0] as { eventHistory: Array<Record<string, unknown>> }).eventHistory[0];
    expect(ev.createdAt).toBeInstanceOf(Date);
    // factExtractorResult : wire (pas de Date ici → identique).
    expect(applied.factExtractorResult).toEqual(factExtractorResult);
  });

  it("factExtractorResult absent (scopedDocuments vide) → null préservé build + apply", () => {
    const wire = buildTier0FactsWire({
      totalCost: 0,
      completedCount: 0,
      factStore: [],
      factStoreFormatted: "",
      founderResponses: [],
      factExtractorResult: undefined,
    });
    expect(wire.factExtractorResult).toBeNull();
    const applied = applyTier0FactsWire(JSON.parse(JSON.stringify(wire)));
    expect(applied.factExtractorResult).toBeNull();
    expect(applied.factStore).toEqual([]);
    expect(applied.totalCost).toBe(0);
  });

  it("normalizer STRICT : NaN dans totalCost → LÈVE (DTO non wire-safe)", () => {
    expect(() =>
      buildTier0FactsWire({
        totalCost: NaN,
        completedCount: 0,
        factStore: [],
        factStoreFormatted: "",
        founderResponses: [],
        factExtractorResult: null,
      }),
    ).toThrow();
  });

  it("normalizer STRICT : Date dans factExtractorResult.data → ISO (aucune Date résiduelle wire)", () => {
    const wire = buildTier0FactsWire({
      totalCost: 0,
      completedCount: 1,
      factStore: [],
      factStoreFormatted: "",
      founderResponses: [],
      factExtractorResult: {
        agentName: "fact-extractor",
        success: true,
        data: { extractedAt: new Date("2026-03-01T00:00:00.000Z") },
      },
    });
    const data = (wire.factExtractorResult as { data: Record<string, unknown> }).data;
    expect(data.extractedAt).toBe("2026-03-01T00:00:00.000Z");
  });
});
