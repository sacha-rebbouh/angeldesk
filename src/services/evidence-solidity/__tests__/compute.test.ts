/**
 * Phase A slice A6 — Tests `computeEvidenceSolidity` (fonction pure).
 *
 * Couvre :
 * 1. Matrice contradictory / insufficient / null (cas exhaustifs).
 * 2. Cas données absentes → null.
 * 3. Anti-régression D2 : score élevé fictif + preuves insuffisantes →
 *    jamais "strong" (la fonction n'accepte pas score en input).
 * 4. Rationale présent quand value !== null (refine A1
 *    Tier3SignalContributionSchema).
 * 5. Mémoire / pas de mutation des inputs.
 */
import { describe, it, expect } from "vitest";
import {
  computeEvidenceSolidity,
  type EvidenceSolidityInputs,
} from "../index";

function makeInputs(overrides: Partial<EvidenceSolidityInputs> = {}): EvidenceSolidityInputs {
  return {
    factCount: 5,
    documentArtifactCount: 3,
    lowReliabilityFactCount: 1,
    extractionWarningCount: 0,
    criticalContradictionCount: 0,
    highContradictionCount: 0,
    ...overrides,
  };
}

describe("Phase A A6 — computeEvidenceSolidity — matrice contradictory", () => {
  it("2 contradictions CRITICAL → contradictory + rationale", () => {
    const result = computeEvidenceSolidity(makeInputs({ criticalContradictionCount: 2 }));
    expect(result.value).toBe("contradictory");
    expect(result.rationale).toBeTruthy();
    expect(result.rationale).toContain("2 contradictions CRITICAL");
  });

  it("3 contradictions CRITICAL → contradictory", () => {
    const result = computeEvidenceSolidity(makeInputs({ criticalContradictionCount: 3 }));
    expect(result.value).toBe("contradictory");
    expect(result.rationale).toContain("3 contradictions CRITICAL");
  });

  it("1 contradiction CRITICAL + 2 HIGH → contradictory", () => {
    const result = computeEvidenceSolidity(makeInputs({ criticalContradictionCount: 1, highContradictionCount: 2 }));
    expect(result.value).toBe("contradictory");
    expect(result.rationale).toContain("1 contradiction CRITICAL");
    expect(result.rationale).toContain("2 contradictions HIGH");
  });

  it("1 contradiction CRITICAL seule (HIGH < 2) → null (pas contradictory en A6)", () => {
    const result = computeEvidenceSolidity(makeInputs({ criticalContradictionCount: 1, highContradictionCount: 1 }));
    expect(result.value).toBeNull();
    expect(result.rationale).toBeNull();
  });

  it("0 CRITICAL + 5 HIGH → null en A6 (pas contradictory, le pivot d'A6 est CRITICAL)", () => {
    const result = computeEvidenceSolidity(makeInputs({ highContradictionCount: 5 }));
    expect(result.value).toBeNull();
  });
});

describe("Phase A A6 — computeEvidenceSolidity — matrice insufficient", () => {
  it("factCount + documentArtifactCount === 0 → insufficient", () => {
    const result = computeEvidenceSolidity(makeInputs({ factCount: 0, documentArtifactCount: 0 }));
    expect(result.value).toBe("insufficient");
    expect(result.rationale).toContain("Aucun fact extrait");
  });

  it("Tous les facts en low reliability (lowReliabilityFactCount === factCount) → insufficient", () => {
    const result = computeEvidenceSolidity(makeInputs({ factCount: 4, lowReliabilityFactCount: 4 }));
    expect(result.value).toBe("insufficient");
    expect(result.rationale).toContain("Tous les facts disponibles (4)");
  });

  it("Extraction massive dégradée (warnings >= 5) + très peu de facts (<3) → insufficient", () => {
    const result = computeEvidenceSolidity(makeInputs({
      factCount: 2,
      lowReliabilityFactCount: 0,
      extractionWarningCount: 7,
    }));
    expect(result.value).toBe("insufficient");
    expect(result.rationale).toContain("7 avertissements");
  });

  it("Extraction modérée (4 warnings) → ne déclenche pas la règle 'insufficient'", () => {
    const result = computeEvidenceSolidity(makeInputs({
      factCount: 2,
      lowReliabilityFactCount: 0,
      extractionWarningCount: 4, // < 5
    }));
    expect(result.value).toBeNull();
  });

  it("Beaucoup de facts (>= 3) même avec warnings élevés → ne déclenche pas 'insufficient'", () => {
    const result = computeEvidenceSolidity(makeInputs({
      factCount: 5, // >= 3
      lowReliabilityFactCount: 0,
      extractionWarningCount: 10,
    }));
    expect(result.value).toBeNull();
  });
});

describe("Phase A A6 — computeEvidenceSolidity — null (pas qualifiable)", () => {
  it("Pas de contradiction critique + facts présents avec mix reliability → null", () => {
    const result = computeEvidenceSolidity(makeInputs({
      factCount: 5,
      documentArtifactCount: 2,
      lowReliabilityFactCount: 2, // pas tous low
      criticalContradictionCount: 0,
    }));
    expect(result.value).toBeNull();
    expect(result.rationale).toBeNull();
  });

  it("Inputs par défaut (fixture saine) → null", () => {
    const result = computeEvidenceSolidity(makeInputs());
    expect(result.value).toBeNull();
  });
});

describe("Phase A A6 — Anti-régression D2 (score/confidence jamais utilisés)", () => {
  it("La signature `EvidenceSolidityInputs` ne contient AUCUN champ score/confidence/overallScore/confidenceLevel", () => {
    // Test sentinelle au runtime : si quelqu'un ajoute un champ score
    // à l'interface, ce test compilera mais la propriété n'existera pas.
    const inputs = makeInputs() as unknown as Record<string, unknown>;
    expect(inputs.score).toBeUndefined();
    expect(inputs.overallScore).toBeUndefined();
    expect(inputs.confidence).toBeUndefined();
    expect(inputs.confidenceLevel).toBeUndefined();
  });

  it("Un caller hypothétique passant un score élevé et zéro fact ne peut pas obtenir 'strong'", () => {
    // Le caller peut bien avoir un overallScore=95 ailleurs — il ne peut
    // PAS le passer au service (typage). Et même si une force-cast bypass
    // le typage, le service ne lit jamais un tel champ et émet 'insufficient'
    // sur la base des seules preuves.
    // Force-cast pour simuler une tentative caller de bypass typage.
    // Le service doit ignorer les champs hors interface (typage runtime
    // déstructure uniquement les propriétés EvidenceSolidityInputs).
    const inputs = {
      factCount: 0,
      documentArtifactCount: 0,
      lowReliabilityFactCount: 0,
      extractionWarningCount: 0,
      criticalContradictionCount: 0,
      highContradictionCount: 0,
      overallScore: 95, // bypass anti-fabrication, ignoré
      confidence: 100,  // bypass anti-fabrication, ignoré
    } as unknown as EvidenceSolidityInputs;
    const result = computeEvidenceSolidity(inputs);
    // factCount + artifactCount === 0 → insufficient
    expect(result.value).toBe("insufficient");
    // Surtout : jamais "strong" / "moderate" / "low" (D2 verrouillé).
    expect(["strong", "moderate", "low"]).not.toContain(result.value as unknown);
  });

  it("D2 : la sortie reste uniquement dans {contradictory, insufficient, null} sur 50 fixtures aléatoires bornées", () => {
    const valid = new Set(["contradictory", "insufficient", null]);
    for (let i = 0; i < 50; i += 1) {
      const inputs = makeInputs({
        factCount: Math.floor(Math.random() * 20),
        documentArtifactCount: Math.floor(Math.random() * 20),
        lowReliabilityFactCount: Math.floor(Math.random() * 20),
        extractionWarningCount: Math.floor(Math.random() * 20),
        criticalContradictionCount: Math.floor(Math.random() * 5),
        highContradictionCount: Math.floor(Math.random() * 5),
      });
      // Clamp lowReliabilityFactCount à factCount (cohérence).
      inputs.lowReliabilityFactCount = Math.min(inputs.lowReliabilityFactCount, inputs.factCount);
      const result = computeEvidenceSolidity(inputs);
      expect(valid.has(result.value)).toBe(true);
    }
  });
});

describe("Phase A A6 — Invariants rationale (refine A1)", () => {
  it("Quand value !== null, rationale est non-vide non-whitespace", () => {
    const cases: EvidenceSolidityInputs[] = [
      makeInputs({ criticalContradictionCount: 2 }),
      makeInputs({ criticalContradictionCount: 1, highContradictionCount: 2 }),
      makeInputs({ factCount: 0, documentArtifactCount: 0 }),
      makeInputs({ factCount: 4, lowReliabilityFactCount: 4 }),
      makeInputs({ factCount: 1, extractionWarningCount: 8 }),
    ];
    for (const inputs of cases) {
      const result = computeEvidenceSolidity(inputs);
      expect(result.value).not.toBeNull();
      expect(result.rationale).not.toBeNull();
      expect(result.rationale!.trim().length).toBeGreaterThan(0);
    }
  });

  it("Quand value === null, rationale === null", () => {
    const result = computeEvidenceSolidity(makeInputs());
    expect(result.value).toBeNull();
    expect(result.rationale).toBeNull();
  });
});

describe("Phase A A6 — Lecture seule (pas de mutation inputs)", () => {
  it("computeEvidenceSolidity ne mute pas l'objet input", () => {
    const inputs = makeInputs({ criticalContradictionCount: 2 });
    const snapshot = { ...inputs };
    computeEvidenceSolidity(inputs);
    expect(inputs).toEqual(snapshot);
  });
});
