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
    allResults: { "deck-forensics": { success: true, score: 72, narrative: "ok" } },
    consensusResolutions: { _consensus_resolutions: [{ id: "c1", verdict: "x" }] },
    tier1CrossValidation: { adjusted: true, score: 80 },
    consolidatedRedFlags: [{ severity: "HIGH", title: "rf" }],
    factStoreFormatted: "FACT: revenue=100k (source: deck)",
    verificationContext: { facts: ["f1"], fundingDb: { p50: 5 } },
    ...over,
  };
}

describe("FullAnalysisStepState — round-trip / carry (étape B)", () => {
  it("round-trip JSON préserve TOUS les champs (carry des artefacts non reconstructibles)", () => {
    const s = makeValidState();
    const back = deserializeStepState(serializeStepState(s));
    expect(back).toEqual(s);
    // les artefacts NON reconstructibles depuis la DB survivent :
    expect(back.consensusResolutions).toEqual(s.consensusResolutions);
    expect(back.tier1CrossValidation).toEqual(s.tier1CrossValidation);
    expect(back.consolidatedRedFlags).toEqual(s.consolidatedRedFlags);
    expect(back.verificationContext).toEqual(s.verificationContext);
    expect(back.factStoreFormatted).toBe(s.factStoreFormatted);
  });

  it("accepte les blobs null (état partiel avant Tier1)", () => {
    const s = makeValidState({
      consensusResolutions: null,
      tier1CrossValidation: null,
      consolidatedRedFlags: null,
      verificationContext: null,
      lastUnit: "tier0-thesis",
    });
    expect(deserializeStepState(serializeStepState(s))).toEqual(s);
  });

  it("NÉGATIF (le test a des dents) : un round-trip qui PERD verificationContext n'est PAS égal", () => {
    const withVc = makeValidState({ verificationContext: { p50: 5 } });
    // simule un snapshot où vc a été droppé (rebuild au lieu de carry) :
    const droppedJson = JSON.stringify({ ...JSON.parse(serializeStepState(withVc)), verificationContext: null });
    const dropped = deserializeStepState(droppedJson);
    expect(dropped).not.toEqual(withVc);
    expect(dropped.verificationContext).toBeNull();
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

describe("parseStepState / deserializeStepState — validation au load", () => {
  it("REJETTE un JSON invalide", () => {
    expect(() => deserializeStepState("{not json")).toThrow(/JSON invalide/);
  });
  it("REJETTE une version inconnue (compat snapshot en vol)", () => {
    const bad = { ...JSON.parse(serializeStepState(makeValidState())), version: 999 };
    expect(() => parseStepState(bad)).toThrow(/version/);
  });
  it("REJETTE un champ scalaire requis manquant", () => {
    const bad = JSON.parse(serializeStepState(makeValidState()));
    delete bad.analysisId;
    expect(() => parseStepState(bad)).toThrow(/analysisId/);
  });
  it("REJETTE un scalaire mal typé", () => {
    const bad = { ...JSON.parse(serializeStepState(makeValidState())), totalAgents: "21" };
    expect(() => parseStepState(bad)).toThrow(/totalAgents/);
  });
  it("REJETTE factStoreFormatted manquant", () => {
    const bad = JSON.parse(serializeStepState(makeValidState()));
    delete bad.factStoreFormatted;
    expect(() => parseStepState(bad)).toThrow(/factStoreFormatted/);
  });
  it("REJETTE un non-objet", () => {
    expect(() => parseStepState(null)).toThrow(/n'est pas un objet/);
    expect(() => parseStepState([1, 2])).toThrow(/n'est pas un objet/);
  });

  // --- audit Codex #2 : scalaires numériques NaN/Infinity + lastUnit enum ---
  it("REJETTE un scalaire numérique NaN (parse direct, hors JSON qui le perd)", () => {
    const bad = { ...JSON.parse(serializeStepState(makeValidState())), totalCost: NaN };
    expect(() => parseStepState(bad)).toThrow(/non-fini/);
  });
  it("REJETTE un scalaire numérique Infinity", () => {
    const bad = { ...JSON.parse(serializeStepState(makeValidState())), completedCount: Infinity };
    expect(() => parseStepState(bad)).toThrow(/non-fini/);
  });
  it("REJETTE lastUnit hors de l'enum FULL_ANALYSIS_UNITS", () => {
    const bad = { ...JSON.parse(serializeStepState(makeValidState())), lastUnit: "tier-99" };
    expect(() => parseStepState(bad)).toThrow(/lastUnit invalide/);
  });

  // --- audit Codex #1 : tous les blobs requis présents + typés + JSON pur au load ---
  it("REJETTE consensusResolutions manquant", () => {
    const bad = JSON.parse(serializeStepState(makeValidState()));
    delete bad.consensusResolutions;
    expect(() => parseStepState(bad)).toThrow(/consensusResolutions/);
  });
  it("REJETTE tier1CrossValidation manquant", () => {
    const bad = JSON.parse(serializeStepState(makeValidState()));
    delete bad.tier1CrossValidation;
    expect(() => parseStepState(bad)).toThrow(/tier1CrossValidation/);
  });
  it("REJETTE consolidatedRedFlags manquant", () => {
    const bad = JSON.parse(serializeStepState(makeValidState()));
    delete bad.consolidatedRedFlags;
    expect(() => parseStepState(bad)).toThrow(/consolidatedRedFlags/);
  });
  it("REJETTE verificationContext manquant", () => {
    const bad = JSON.parse(serializeStepState(makeValidState()));
    delete bad.verificationContext;
    expect(() => parseStepState(bad)).toThrow(/verificationContext/);
  });
  it("REJETTE allResults absent ou non-objet (array)", () => {
    const bad = { ...JSON.parse(serializeStepState(makeValidState())), allResults: [1, 2] };
    expect(() => parseStepState(bad)).toThrow(/allResults/);
  });
  it("REJETTE consolidatedRedFlags mal typé (objet au lieu de tableau)", () => {
    const bad = { ...JSON.parse(serializeStepState(makeValidState())), consolidatedRedFlags: { x: 1 } };
    expect(() => parseStepState(bad)).toThrow(/consolidatedRedFlags/);
  });
  it("REJETTE consensusResolutions mal typé (tableau au lieu d'objet|null)", () => {
    const bad = { ...JSON.parse(serializeStepState(makeValidState())), consensusResolutions: [1] };
    expect(() => parseStepState(bad)).toThrow(/consensusResolutions/);
  });
  it("VALIDE JSON pur au load : rejette une Date imbriquée dans un blob", () => {
    const bad = { ...JSON.parse(serializeStepState(makeValidState())), verificationContext: { when: new Date() } };
    expect(() => parseStepState(bad)).toThrow(/non-plain|sérialisable/);
  });
});
