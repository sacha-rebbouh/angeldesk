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
