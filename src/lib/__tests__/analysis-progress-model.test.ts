import { describe, it, expect } from "vitest";

import { getProgressSteps, getCurrentStepLabel } from "../analysis-progress-model";

// Valeurs réelles observées en prod sur un Deep Dive (completedAgents 0 → 22, totalAgents=22).
// Verrouille la dérivation étape-courante : le Tier0 (corpus + thèse) est lourd mais ne compte que
// pour 3 agents sur 22 — d'où l'impression de blocage que le plancher ≥1 % + le libellé corrigent.
describe("analysis-progress-model — getCurrentStepLabel (full_analysis)", () => {
  const cases: Array<[number, string]> = [
    [0, "Construction du corpus T0"],
    [1, "Construction du corpus T0"],
    [2, "These d'investissement"], // corpus franchi (seuil 2), thèse en cours
    [3, "Analyse approfondie"], // thèse franchie (seuil 3), Tier1 en cours
    [8, "Analyse approfondie"],
    [15, "Analyse approfondie"],
    [16, "Expertise sectorielle"], // Tier1 franchi (seuil 16)
    [17, "Synthese finale"], // Tier2 franchi (seuil 17)
    [22, "Synthese finale"], // total (22) < seuil tier3 (24) → reste sur la dernière étape
  ];

  it.each(cases)("completedAgents=%i → %s", (done, label) => {
    expect(getCurrentStepLabel(done, "full_analysis")).toBe(label);
  });
});

describe("analysis-progress-model — getCurrentStepLabel (tier1_complete / FREE)", () => {
  const cases: Array<[number, string]> = [
    [0, "Construction du corpus T0"],
    [2, "Analyse initiale"], // corpus franchi (seuil 2)
    [15, "Cloture & scoring"], // investigation franchie (seuil 15)
    [16, "Cloture & scoring"],
  ];

  it.each(cases)("completedAgents=%i → %s", (done, label) => {
    expect(getCurrentStepLabel(done, "tier1_complete")).toBe(label);
  });
});

describe("analysis-progress-model — getProgressSteps", () => {
  it("full_analysis : 5 étapes thesis-first", () => {
    expect(getProgressSteps("full_analysis").map((s) => s.id)).toEqual([
      "corpus",
      "thesis",
      "tier1",
      "tier2",
      "tier3",
    ]);
  });

  it("tier1_complete : 3 étapes FREE", () => {
    expect(getProgressSteps("tier1_complete").map((s) => s.id)).toEqual([
      "corpus",
      "investigation",
      "scoring",
    ]);
  });
});
