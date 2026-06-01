import { describe, it, expect } from "vitest";
import {
  FULL_ANALYSIS_STEP_STATE_VERSION,
  type FullAnalysisStepState,
  assertPlainJson,
  assertSerializableStepState,
  serializeStepState,
  deserializeStepState,
  parseStepState,
} from "../full-analysis-step-state";

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
    factStoreFormatted: "FACT: revenue=100k (source: deck)",
    allResults: { "deck-forensics": { success: true, score: 72, narrative: "ok" } },
    // previousResults = overlay sanitizé downstream CONTENANT _consensus_resolutions
    previousResults: {
      "deck-forensics": { success: true, score: 72 },
      _consensus_resolutions: [{ id: "c1", verdict: "x" }],
    },
    tier1CrossValidation: { adjusted: true, score: 80 },
    consolidatedRedFlags: [{ severity: "HIGH", title: "rf" }],
    verificationContext: { facts: ["f1"], fundingDb: { p50: 5 } },
    // --- v2 (D.5b) : contrat d'état complet (wire ; Date → ISO) ---
    startTimeMs: 1_700_000_000_000,
    transitionCount: 4,
    terminalResult: null,
    evidenceLedgerFormatted: "EVIDENCE: source=deck (HIGH)",
    evidenceTodayIso: "2026-06-01T00:00:00.000Z",
    conditionsAnalystMode: "pipeline",
    canonicalDeal: { id: "d1", name: "Acme", sector: "saas", createdAt: "2026-05-01T10:00:00.000Z" },
    analysisBinding: { id: "a1", mode: "full_analysis", thesisBypass: false, thesisId: "t1", corpusSnapshotId: "cs1" },
    evidenceContext: { doc1: { documentDate: { date: "2026-04-01T00:00:00.000Z" } } },
    thesis: { id: "t1", reformulated: "x", verdict: "favorable", confidence: 71 },
    contextEngine: { completeness: 0.8, enrichedAt: "2026-06-01T00:00:00.000Z" },
    evidenceLedger: { generatedAt: "2026-06-01T00:00:00.000Z", coverage: { documents: 1 }, items: [], warnings: [] },
    extractedData: { tagline: "t", competitors: ["c1"] },
    deckCoherenceReport: { reliabilityGrade: "B" },
    baPreferences: { riskTolerance: 3, preferredSectors: ["saas"] },
    dealTerms: { valuationPre: 5_000_000, instrumentType: "SAFE" },
    dealStructure: { mode: "SIMPLE", totalInvestment: 500_000, tranches: [] },
    scopedDocuments: [{ id: "doc1", name: "deck.pdf", type: "pitch", uploadedAt: "2026-04-01T00:00:00.000Z" }],
    factStore: [{ factKey: "revenue", currentValue: 100000, firstSeenAt: "2026-04-01T00:00:00.000Z", eventHistory: [{ createdAt: "2026-04-01T00:00:00.000Z" }] }],
    founderResponses: [{ questionId: "q1", question: "?", answer: "a", category: "team" }],
    collectedWarnings: [{ severity: "high", title: "w", timestamp: "2026-06-01T00:00:00.000Z" }],
    previousAnalysisQuestions: [{ question: "q", priority: "high", answered: false }],
    ...over,
  };
}

describe("FullAnalysisStepState — round-trip / carry (étape B)", () => {
  it("round-trip JSON préserve TOUS les champs (carry des artefacts non reconstructibles)", () => {
    const s = makeValidState();
    const back = deserializeStepState(serializeStepState(s));
    expect(back).toEqual(s);
    expect(back.previousResults).toEqual(s.previousResults);
    expect(back.tier1CrossValidation).toEqual(s.tier1CrossValidation);
    expect(back.consolidatedRedFlags).toEqual(s.consolidatedRedFlags);
    expect(back.verificationContext).toEqual(s.verificationContext);
    expect(back.factStoreFormatted).toBe(s.factStoreFormatted);
  });

  it("carry previousResults COMPLET, avec _consensus_resolutions dedans (audit Codex)", () => {
    const s = makeValidState({
      previousResults: {
        "deck-forensics": { success: true, score: 72, narrative: "sanitized" },
        "financial-auditor": { success: true, score: 64 },
        _consensus_resolutions: [
          { id: "c1", contradiction: "X vs Y", resolution: "Y", confidence: 0.8 },
          { id: "c2", contradiction: "A vs B", resolution: "A", confidence: 0.6 },
        ],
      },
    });
    const back = deserializeStepState(serializeStepState(s));
    // l'overlay entier survit, pas seulement la résolution consensus :
    expect(back.previousResults).toEqual(s.previousResults);
    expect(back.previousResults["_consensus_resolutions"]).toEqual(s.previousResults["_consensus_resolutions"]);
    expect(back.previousResults["financial-auditor"]).toEqual({ success: true, score: 64 });
  });

  it("accepte les blobs nullable null (état partiel avant Tier1) ; previousResults reste un objet (peut être vide)", () => {
    const s = makeValidState({
      previousResults: {},
      tier1CrossValidation: null,
      consolidatedRedFlags: null,
      verificationContext: null,
      lastUnit: "tier0-thesis",
    });
    expect(deserializeStepState(serializeStepState(s))).toEqual(s);
  });

  it("NÉGATIF (le test a des dents) : un round-trip qui PERD verificationContext n'est PAS égal", () => {
    const withVc = makeValidState({ verificationContext: { p50: 5 } });
    const droppedJson = JSON.stringify({ ...JSON.parse(serializeStepState(withVc)), verificationContext: null });
    const dropped = deserializeStepState(droppedJson);
    expect(dropped).not.toEqual(withVc);
    expect(dropped.verificationContext).toBeNull();
  });

  it("NÉGATIF : un round-trip qui PERD _consensus_resolutions de previousResults n'est PAS égal", () => {
    const s = makeValidState();
    const parsed = JSON.parse(serializeStepState(s));
    delete parsed.previousResults._consensus_resolutions;
    const dropped = deserializeStepState(JSON.stringify(parsed));
    expect(dropped).not.toEqual(s);
    expect(dropped.previousResults["_consensus_resolutions"]).toBeUndefined();
  });
});

describe("assertPlainJson — la garde a des dents (audit Codex #2)", () => {
  it("REJETTE une Date (piège funding-DB / createdAt)", () => {
    expect(() => assertPlainJson({ when: new Date() })).toThrow(/non-plain|sérialisable/);
  });
  it("REJETTE une Map (costMonitor.agentCosts ne doit jamais entrer dans le state)", () => {
    expect(() => assertPlainJson(new Map([["a", 1]]))).toThrow(/non-plain|sérialisable/);
  });
  it("REJETTE un Set", () => {
    expect(() => assertPlainJson(new Set([1, 2]))).toThrow(/non-plain|sérialisable/);
  });
  it("REJETTE une fonction", () => {
    expect(() => assertPlainJson({ f: () => 1 })).toThrow(/function/);
  });
  it("REJETTE undefined comme valeur d'objet", () => {
    expect(() => assertPlainJson({ x: undefined })).toThrow(/undefined/);
  });
  it("REJETTE NaN / Infinity (JSON.stringify les transforme en null silencieusement)", () => {
    expect(() => assertPlainJson({ x: NaN })).toThrow(/non-finie/);
    expect(() => assertPlainJson({ x: Infinity })).toThrow(/non-finie/);
  });
  it("REJETTE une instance de classe (EnrichedAgentContext déguisé)", () => {
    class Ctx { a = 1; }
    expect(() => assertPlainJson(new Ctx())).toThrow(/non-plain|Ctx/);
  });
  it("ACCEPTE tableaux + objets imbriqués purs + null", () => {
    expect(() => assertPlainJson({ a: [1, "x", true, null, { b: [2] }] })).not.toThrow();
  });
  it("donne le chemin fautif", () => {
    expect(() => assertPlainJson({ a: { b: { c: new Date() } } })).toThrow(/\$\.a\.b\.c/);
  });
  it("assertSerializableStepState rejette un state dont un blob contient une Date", () => {
    const s = makeValidState({ verificationContext: { when: new Date() } });
    expect(() => assertSerializableStepState(s)).toThrow(/non-plain|sérialisable/);
    expect(() => serializeStepState(s)).toThrow();
  });
});

describe("parseStepState — validation des scalaires + bornes (audit Codex)", () => {
  const base = () => JSON.parse(serializeStepState(makeValidState()));

  it("REJETTE un JSON invalide", () => {
    expect(() => deserializeStepState("{not json")).toThrow(/JSON invalide/);
  });
  it("REJETTE une version inconnue (compat snapshot en vol)", () => {
    expect(() => parseStepState({ ...base(), version: 999 })).toThrow(/version/);
  });
  it("REJETTE un champ scalaire requis manquant", () => {
    const bad = base(); delete bad.analysisId;
    expect(() => parseStepState(bad)).toThrow(/analysisId/);
  });
  it("REJETTE un scalaire mal typé", () => {
    expect(() => parseStepState({ ...base(), totalAgents: "21" })).toThrow(/totalAgents/);
  });
  it("REJETTE factStoreFormatted manquant", () => {
    const bad = base(); delete bad.factStoreFormatted;
    expect(() => parseStepState(bad)).toThrow(/factStoreFormatted/);
  });
  it("REJETTE un non-objet", () => {
    expect(() => parseStepState(null)).toThrow(/n'est pas un objet/);
    expect(() => parseStepState([1, 2])).toThrow(/n'est pas un objet/);
  });
  it("REJETTE un scalaire numérique NaN", () => {
    expect(() => parseStepState({ ...base(), totalCost: NaN })).toThrow(/non-fini/);
  });
  it("REJETTE un scalaire numérique Infinity", () => {
    expect(() => parseStepState({ ...base(), totalAgents: Infinity })).toThrow(/non-fini/);
  });
  it("REJETTE lastUnit hors de l'enum", () => {
    expect(() => parseStepState({ ...base(), lastUnit: "tier-99" })).toThrow(/lastUnit invalide/);
  });

  // --- bornes scalaires (audit Codex) ---
  it("REJETTE totalAgents <= 0", () => {
    expect(() => parseStepState({ ...base(), totalAgents: 0 })).toThrow(/totalAgents doit être un entier > 0/);
    expect(() => parseStepState({ ...base(), totalAgents: -3 })).toThrow(/totalAgents doit être un entier > 0/);
  });
  it("REJETTE totalAgents non entier", () => {
    expect(() => parseStepState({ ...base(), totalAgents: 21.5 })).toThrow(/totalAgents doit être un entier > 0/);
  });
  it("REJETTE completedCount < 0", () => {
    expect(() => parseStepState({ ...base(), completedCount: -1 })).toThrow(/completedCount doit être un entier >= 0/);
  });
  it("REJETTE completedCount non entier", () => {
    expect(() => parseStepState({ ...base(), completedCount: 2.5 })).toThrow(/completedCount doit être un entier >= 0/);
  });
  it("REJETTE completedCount > totalAgents", () => {
    expect(() => parseStepState({ ...base(), totalAgents: 5, completedCount: 6 })).toThrow(/completedCount \(6\) > totalAgents \(5\)/);
  });
  it("ACCEPTE completedCount == totalAgents (borne haute incluse)", () => {
    expect(() => parseStepState({ ...base(), totalAgents: 6, completedCount: 6 })).not.toThrow();
  });
  it("REJETTE totalCost < 0", () => {
    expect(() => parseStepState({ ...base(), totalCost: -0.01 })).toThrow(/totalCost doit être >= 0/);
  });
  it("ACCEPTE totalCost == 0", () => {
    expect(() => parseStepState({ ...base(), totalCost: 0 })).not.toThrow();
  });
});

describe("parseStepState — validation des blobs requis (audit Codex #1)", () => {
  const base = () => JSON.parse(serializeStepState(makeValidState()));

  it("REJETTE previousResults manquant", () => {
    const bad = base(); delete bad.previousResults;
    expect(() => parseStepState(bad)).toThrow(/previousResults/);
  });
  it("REJETTE previousResults non-objet (array)", () => {
    expect(() => parseStepState({ ...base(), previousResults: [1, 2] })).toThrow(/previousResults/);
  });
  it("REJETTE tier1CrossValidation manquant", () => {
    const bad = base(); delete bad.tier1CrossValidation;
    expect(() => parseStepState(bad)).toThrow(/tier1CrossValidation/);
  });
  it("REJETTE consolidatedRedFlags manquant", () => {
    const bad = base(); delete bad.consolidatedRedFlags;
    expect(() => parseStepState(bad)).toThrow(/consolidatedRedFlags/);
  });
  it("REJETTE verificationContext manquant", () => {
    const bad = base(); delete bad.verificationContext;
    expect(() => parseStepState(bad)).toThrow(/verificationContext/);
  });
  it("REJETTE allResults absent ou non-objet (array)", () => {
    expect(() => parseStepState({ ...base(), allResults: [1, 2] })).toThrow(/allResults/);
  });
  it("REJETTE consolidatedRedFlags mal typé (objet au lieu de tableau)", () => {
    expect(() => parseStepState({ ...base(), consolidatedRedFlags: { x: 1 } })).toThrow(/consolidatedRedFlags/);
  });
  it("REJETTE tier1CrossValidation mal typé (tableau au lieu d'objet|null)", () => {
    expect(() => parseStepState({ ...base(), tier1CrossValidation: [1] })).toThrow(/tier1CrossValidation/);
  });
  it("VALIDE JSON pur au load : rejette une Date imbriquée dans un blob", () => {
    expect(() => parseStepState({ ...base(), verificationContext: { when: new Date() } })).toThrow(/non-plain|sérialisable/);
  });
});

describe("FullAnalysisStepState v2 — contrat d'état complet (D.5b)", () => {
  const base = () => JSON.parse(serializeStepState(makeValidState()));

  it("version courante = 2", () => {
    expect(FULL_ANALYSIS_STEP_STATE_VERSION).toBe(2);
  });

  it("round-trip préserve les nouveaux champs v2 (deal snapshot, factStore, evidenceContext, collectedWarnings, dates ISO)", () => {
    const s = makeValidState();
    const back = deserializeStepState(serializeStepState(s));
    expect(back).toEqual(s);
    expect(back.canonicalDeal).toEqual(s.canonicalDeal);
    expect(back.factStore).toEqual(s.factStore);
    expect(back.evidenceContext).toEqual(s.evidenceContext);
    expect(back.collectedWarnings).toEqual(s.collectedWarnings);
    expect(back.evidenceTodayIso).toBe(s.evidenceTodayIso);
    expect(back.evidenceLedgerFormatted).toBe(s.evidenceLedgerFormatted);
    expect(back.startTimeMs).toBe(s.startTimeMs);
  });

  it("les Date sont portées en ISO (wire), jamais en instance Date", () => {
    const s = makeValidState();
    // le DTO ne contient que des strings ISO — serializeStepState (assertPlainJson) passerait pas sinon
    expect(typeof (s.canonicalDeal as { createdAt: unknown }).createdAt).toBe("string");
    expect(typeof (s.factStore[0] as { firstSeenAt: unknown }).firstSeenAt).toBe("string");
    expect(() => serializeStepState(s)).not.toThrow();
  });

  it("REJETTE une Date instance injectée dans un blob wire (ex. canonicalDeal.createdAt)", () => {
    const s = makeValidState({ canonicalDeal: { id: "d1", createdAt: new Date() } });
    expect(() => serializeStepState(s)).toThrow(/non-plain|sérialisable/);
  });

  it("accepte les blobs nullable v2 à null (état partiel avant les étapes productrices)", () => {
    const s = makeValidState({
      evidenceContext: null,
      thesis: null,
      contextEngine: null,
      evidenceLedger: null,
      extractedData: null,
      deckCoherenceReport: null,
      baPreferences: null,
      dealTerms: null,
      dealStructure: null,
      conditionsAnalystMode: null,
      previousAnalysisQuestions: null,
      lastUnit: "init",
    });
    expect(deserializeStepState(serializeStepState(s))).toEqual(s);
  });

  it("REJETTE un nouveau champ requis manquant (canonicalDeal / scopedDocuments / factStore / startTimeMs / transitionCount / terminalResult)", () => {
    for (const field of ["canonicalDeal", "analysisBinding", "scopedDocuments", "factStore", "founderResponses", "collectedWarnings", "evidenceLedgerFormatted", "evidenceTodayIso", "startTimeMs", "transitionCount", "terminalResult"]) {
      const bad = base();
      delete bad[field];
      expect(() => parseStepState(bad), `champ ${field}`).toThrow(new RegExp(field));
    }
  });

  it("REJETTE startTimeMs / transitionCount négatif ou non entier", () => {
    expect(() => parseStepState({ ...base(), startTimeMs: -1 })).toThrow(/startTimeMs/);
    expect(() => parseStepState({ ...base(), startTimeMs: 1.5 })).toThrow(/startTimeMs/);
    expect(() => parseStepState({ ...base(), transitionCount: -1 })).toThrow(/transitionCount/);
    expect(() => parseStepState({ ...base(), transitionCount: 2.5 })).toThrow(/transitionCount/);
  });

  it("ACCEPTE tier0-facts comme lastUnit (unité isolée D.5d) et terminalResult objet (early-return)", () => {
    expect(() => parseStepState({ ...base(), lastUnit: "tier0-facts" })).not.toThrow();
    const withTerminal = makeValidState({ done: true, terminalResult: { sessionId: "a1", success: false, summary: "cost limit" } });
    const back = deserializeStepState(serializeStepState(withTerminal));
    expect(back.terminalResult).toEqual({ sessionId: "a1", success: false, summary: "cost limit" });
    expect(back.done).toBe(true);
  });

  it("REJETTE un blob OBJET requis non-objet (canonicalDeal array)", () => {
    expect(() => parseStepState({ ...base(), canonicalDeal: [1, 2] })).toThrow(/canonicalDeal/);
  });

  it("REJETTE un blob TABLEAU requis non-tableau (factStore objet)", () => {
    expect(() => parseStepState({ ...base(), factStore: { x: 1 } })).toThrow(/factStore/);
  });

  it("REJETTE conditionsAnalystMode mal typé (number)", () => {
    expect(() => parseStepState({ ...base(), conditionsAnalystMode: 3 })).toThrow(/conditionsAnalystMode/);
  });

  it("ACCEPTE conditionsAnalystMode null", () => {
    expect(() => parseStepState({ ...base(), conditionsAnalystMode: null })).not.toThrow();
  });
});
