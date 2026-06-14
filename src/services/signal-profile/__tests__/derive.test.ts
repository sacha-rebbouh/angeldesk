/**
 * Tests de la dérivation SCORELESS de l'orientation (chantier P2).
 *
 * Garantie STRUCTURELLE : `deriveScoreIndependentOrientation` ne prend aucun
 * score en entrée — l'orientation ne PEUT PAS dépendre d'un nombre de note.
 * Ces tests verrouillent le modèle positif explicite et le mapping intensité.
 */

import { describe, expect, it } from "vitest";
import {
  deriveSynthesisSignalIntensity,
  deriveScoreIndependentOrientation,
  orientationFromAgentIntensity,
  decideNotExploitable,
  type OrientationDerivationInputs,
} from "../derive";

describe("orientationFromAgentIntensity (mapping per-agent, sans score)", () => {
  it("critical → alert_dominant", () => {
    expect(orientationFromAgentIntensity("critical")).toBe("alert_dominant");
  });
  it("high → vigilance", () => {
    expect(orientationFromAgentIntensity("high")).toBe("vigilance");
  });
  it("elevated → contrasted", () => {
    expect(orientationFromAgentIntensity("elevated")).toBe("contrasted");
  });
  it("low → favorable (signal axe-agent ; distinct de l'orientation DEAL)", () => {
    expect(orientationFromAgentIntensity("low")).toBe("favorable");
  });
});

describe("deriveSynthesisSignalIntensity (counts-only, sans score)", () => {
  it("criticalCount >= 1 → critical", () => {
    expect(deriveSynthesisSignalIntensity(1, 0)).toBe("critical");
    expect(deriveSynthesisSignalIntensity(3, 5)).toBe("critical");
  });
  it("highCount >= 2 (sans critical) → high", () => {
    expect(deriveSynthesisSignalIntensity(0, 2)).toBe("high");
  });
  it("highCount === 1 (sans critical) → elevated", () => {
    expect(deriveSynthesisSignalIntensity(0, 1)).toBe("elevated");
  });
  it("aucun flag → low", () => {
    expect(deriveSynthesisSignalIntensity(0, 0)).toBe("low");
  });
});

describe("deriveScoreIndependentOrientation — branche défavorable", () => {
  const base: OrientationDerivationInputs = {
    intensity: "low",
    favorableSignalCount: 0,
    coveredDimensionCount: 12,
    totalDimensionCount: 12,
    evidenceSolidity: null,
  };
  it("critical → alert_dominant", () => {
    expect(deriveScoreIndependentOrientation({ ...base, intensity: "critical" })).toBe("alert_dominant");
  });
  it("high → vigilance (mappé contrasté au boundary doctrine)", () => {
    expect(deriveScoreIndependentOrientation({ ...base, intensity: "high" })).toBe("vigilance");
  });
  it("elevated → contrasted", () => {
    expect(deriveScoreIndependentOrientation({ ...base, intensity: "elevated" })).toBe("contrasted");
  });
});

describe("deriveScoreIndependentOrientation — modèle POSITIF explicite (intensity low)", () => {
  const broad: OrientationDerivationInputs = {
    intensity: "low",
    favorableSignalCount: 0,
    coveredDimensionCount: 12,
    totalDimensionCount: 12,
    evidenceSolidity: null,
  };

  it("0 signal favorable (même couverture large) → contrasted, JAMAIS favorable", () => {
    // Anti « compteur d'alertes inversé » : absence de red flags ≠ favorable.
    expect(deriveScoreIndependentOrientation(broad)).toBe("contrasted");
  });

  it(">= 2 signaux favorables + couverture large → favorable", () => {
    expect(deriveScoreIndependentOrientation({ ...broad, favorableSignalCount: 2 })).toBe("favorable");
  });

  it(">= 4 signaux favorables + couverture large + solidité non contradictoire → very_favorable", () => {
    expect(deriveScoreIndependentOrientation({ ...broad, favorableSignalCount: 4 })).toBe("very_favorable");
  });

  it("signaux favorables MAIS couverture étroite (< 2/3) → contrasted", () => {
    expect(
      deriveScoreIndependentOrientation({
        ...broad,
        favorableSignalCount: 5,
        coveredDimensionCount: 4,
        totalDimensionCount: 12,
      })
    ).toBe("contrasted");
  });

  it("solidité insuffisante → contrasted même avec signaux favorables + couverture", () => {
    expect(
      deriveScoreIndependentOrientation({ ...broad, favorableSignalCount: 5, evidenceSolidity: "insufficient" })
    ).toBe("contrasted");
  });

  it("solidité contradictoire → bloque very_favorable (reste favorable au plus si éligible)", () => {
    // contradictory court-circuite la branche favorable → contrasted.
    expect(
      deriveScoreIndependentOrientation({ ...broad, favorableSignalCount: 5, evidenceSolidity: "contradictory" })
    ).toBe("contrasted");
  });
});

describe("decideNotExploitable — décision de couverture EXPLICITE", () => {
  it("solidité insuffisante → true", () => {
    expect(
      decideNotExploitable({ coveredDimensionCount: 8, totalDimensionCount: 12, evidenceSolidity: "insufficient" })
    ).toBe(true);
  });
  it("aucune dimension couverte → true", () => {
    expect(
      decideNotExploitable({ coveredDimensionCount: 0, totalDimensionCount: 12, evidenceSolidity: null })
    ).toBe(true);
  });
  it("couverture partielle non nulle + solidité null → false (pas de fallback flou)", () => {
    expect(
      decideNotExploitable({ coveredDimensionCount: 3, totalDimensionCount: 12, evidenceSolidity: null })
    ).toBe(false);
  });
});
