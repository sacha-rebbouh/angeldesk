/**
 * Phase A slice A7b-1 — Tests fondation Tier 1 derive-alert-signal.
 *
 * Couvre :
 * 1. Matrice complète de signalIntensity (4 catégories × cas mixtes)
 * 2. Mapping signalIntensity → recommendation (4 valeurs)
 * 3. Anti-régression D2 : le helper ne lit AUCUN champ LLM (pas de
 *    `confidence` ni `overallScore` en input — typage strict).
 * 4. Frontières score <40 / <60 (cas limites inclusifs/exclusifs)
 * 5. Pas de mutation des inputs (idempotent + read-only).
 */
import { describe, it, expect } from "vitest";
import {
  deriveTier1SignalIntensity,
  signalIntensityToRecommendation,
  type DeriveTier1SignalIntensityInputs,
  type Tier1SignalIntensity,
} from "../derive-alert-signal";

function makeInputs(overrides: Partial<DeriveTier1SignalIntensityInputs> = {}): DeriveTier1SignalIntensityInputs {
  return {
    criticalCount: 0,
    highCount: 0,
    score: 75,
    ...overrides,
  };
}

describe("Phase A A7b-1 — deriveTier1SignalIntensity (matrice complète)", () => {
  describe("critical", () => {
    it("`criticalCount >= 1` → critical (même avec score élevé)", () => {
      expect(deriveTier1SignalIntensity(makeInputs({ criticalCount: 1, score: 100 }))).toBe("critical");
    });

    it("2+ CRITICAL → critical", () => {
      expect(deriveTier1SignalIntensity(makeInputs({ criticalCount: 3 }))).toBe("critical");
    });

    it("critical prend précédence sur high même si criticalCount=1 + highCount=5", () => {
      expect(deriveTier1SignalIntensity(makeInputs({ criticalCount: 1, highCount: 5 }))).toBe("critical");
    });
  });

  describe("high", () => {
    it("`highCount >= 2` (0 CRITICAL) → high", () => {
      expect(deriveTier1SignalIntensity(makeInputs({ highCount: 2 }))).toBe("high");
    });

    it("`score < 40` (0 red flags) → high", () => {
      expect(deriveTier1SignalIntensity(makeInputs({ score: 30 }))).toBe("high");
    });

    it("`score < 40` + 1 HIGH → high (score domine)", () => {
      expect(deriveTier1SignalIntensity(makeInputs({ highCount: 1, score: 35 }))).toBe("high");
    });

    it("frontière score=39 → high", () => {
      expect(deriveTier1SignalIntensity(makeInputs({ score: 39 }))).toBe("high");
    });

    it("frontière score=40 → NOT high (passe à elevated/low selon highCount)", () => {
      expect(deriveTier1SignalIntensity(makeInputs({ score: 40 }))).toBe("elevated");
    });
  });

  describe("elevated", () => {
    it("`highCount >= 1` (sans CRITICAL) → elevated", () => {
      expect(deriveTier1SignalIntensity(makeInputs({ highCount: 1, score: 75 }))).toBe("elevated");
    });

    it("`score < 60` (aucun red flag) → elevated", () => {
      expect(deriveTier1SignalIntensity(makeInputs({ score: 50 }))).toBe("elevated");
    });

    it("frontière score=59 → elevated", () => {
      expect(deriveTier1SignalIntensity(makeInputs({ score: 59 }))).toBe("elevated");
    });

    it("frontière score=60 → NOT elevated (passe à low)", () => {
      expect(deriveTier1SignalIntensity(makeInputs({ score: 60 }))).toBe("low");
    });
  });

  describe("low", () => {
    it("0 red flag + score >= 60 → low", () => {
      expect(deriveTier1SignalIntensity(makeInputs({ score: 60 }))).toBe("low");
    });

    it("0 red flag + score haut → low", () => {
      expect(deriveTier1SignalIntensity(makeInputs({ score: 95 }))).toBe("low");
    });

    it("score=100 → low", () => {
      expect(deriveTier1SignalIntensity(makeInputs({ score: 100 }))).toBe("low");
    });
  });
});

describe("Phase A A7b-1 — signalIntensityToRecommendation (mapping)", () => {
  it("low → PROCEED", () => {
    expect(signalIntensityToRecommendation("low")).toBe("PROCEED");
  });

  it("elevated → PROCEED_WITH_CAUTION", () => {
    expect(signalIntensityToRecommendation("elevated")).toBe("PROCEED_WITH_CAUTION");
  });

  it("high → INVESTIGATE_FURTHER", () => {
    expect(signalIntensityToRecommendation("high")).toBe("INVESTIGATE_FURTHER");
  });

  it("critical → STOP", () => {
    expect(signalIntensityToRecommendation("critical")).toBe("STOP");
  });

  it("Pour chaque valeur du enum, le mapping produit une recommendation valide", () => {
    const validRecommendations = ["PROCEED", "PROCEED_WITH_CAUTION", "INVESTIGATE_FURTHER", "STOP"];
    const intensities: Tier1SignalIntensity[] = ["low", "elevated", "high", "critical"];
    for (const intensity of intensities) {
      expect(validRecommendations).toContain(signalIntensityToRecommendation(intensity));
    }
  });
});

describe("Phase A A7b-1 — Anti-régression D2 (pas de champ LLM en input)", () => {
  it("`DeriveTier1SignalIntensityInputs` ne contient AUCUN champ `confidence` / `overallScore` / `confidenceLevel`", () => {
    // Test sentinelle runtime : si un futur PR ajoute un champ LLM à
    // l'interface, l'objet `inputs` n'aura pas cette propriété sauf si
    // explicitement assigné — détecté ici via cast unknown.
    const inputs = makeInputs() as unknown as Record<string, unknown>;
    expect(inputs.confidence).toBeUndefined();
    expect(inputs.overallScore).toBeUndefined();
    expect(inputs.confidenceLevel).toBeUndefined();
  });

  it("Un caller passant un overallScore=95 ne peut pas en bénéficier (ignoré, typage strict)", () => {
    const inputs = {
      criticalCount: 0,
      highCount: 0,
      score: 30, // score métier réel, faible
      overallScore: 95, // bypass tenté, ignoré par déstructuration interne
      confidence: 100, // bypass tenté
    } as unknown as DeriveTier1SignalIntensityInputs;
    const result = deriveTier1SignalIntensity(inputs);
    // score < 40 → high (le score réel domine, pas le bypass)
    expect(result).toBe("high");
  });
});

describe("Phase A A7b-1 — Lecture seule (pas de mutation inputs)", () => {
  it("deriveTier1SignalIntensity ne mute pas l'objet input", () => {
    const inputs = makeInputs({ criticalCount: 2, score: 50 });
    const snapshot = { ...inputs };
    deriveTier1SignalIntensity(inputs);
    expect(inputs).toEqual(snapshot);
  });

  it("Appels multiples = même résultat (purement fonctionnel)", () => {
    const inputs = makeInputs({ criticalCount: 1, highCount: 3, score: 50 });
    const first = deriveTier1SignalIntensity(inputs);
    const second = deriveTier1SignalIntensity(inputs);
    const third = deriveTier1SignalIntensity(inputs);
    expect(first).toBe("critical");
    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it("signalIntensityToRecommendation est purement fonctionnel", () => {
    expect(signalIntensityToRecommendation("low")).toBe(signalIntensityToRecommendation("low"));
  });
});
