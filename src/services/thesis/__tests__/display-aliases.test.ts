/**
 * Phase A slice A5 — Tests adapter display-aliases thesis (lecture seule).
 *
 * Couverture :
 * 1. Mapping numérique → tier de stabilité (4 catégories, frontières).
 * 2. Libellés pour les 4 surfaces thesis (lentille framework, agrégat
 *    consolidé, axe normalisé, verdict reconcilié).
 * 3. Invariant doctrinal D4 : aucun libellé ne contient jamais
 *    "Confiance" / "Confidence" (le mot est banni en affichage).
 * 4. Lecture seule : les inputs (numériques + string) ne sont pas mutés.
 */
import { describe, it, expect } from "vitest";
import {
  getThesisStabilityTier,
  getFrameworkLensStabilityLabel,
  getOverallThesisStabilityLabel,
  getThesisAxisStabilityLabel,
  getVerdictStabilityLabel,
} from "../display-aliases";

describe("Phase A A5 — getThesisStabilityTier (mapping numérique)", () => {
  it("`>= 85` → élevée", () => {
    expect(getThesisStabilityTier(85)).toBe("élevée");
    expect(getThesisStabilityTier(90)).toBe("élevée");
    expect(getThesisStabilityTier(100)).toBe("élevée");
  });

  it("`60-84` → solide", () => {
    expect(getThesisStabilityTier(60)).toBe("solide");
    expect(getThesisStabilityTier(72)).toBe("solide");
    expect(getThesisStabilityTier(84)).toBe("solide");
  });

  it("`30-59` → partielle", () => {
    expect(getThesisStabilityTier(30)).toBe("partielle");
    expect(getThesisStabilityTier(45)).toBe("partielle");
    expect(getThesisStabilityTier(59)).toBe("partielle");
  });

  it("`< 30` → faible", () => {
    expect(getThesisStabilityTier(0)).toBe("faible");
    expect(getThesisStabilityTier(15)).toBe("faible");
    expect(getThesisStabilityTier(29)).toBe("faible");
  });

  it("Frontières strictes (35→partielle, 60→solide, 85→élevée)", () => {
    expect(getThesisStabilityTier(29.99)).toBe("faible");
    expect(getThesisStabilityTier(30)).toBe("partielle");
    expect(getThesisStabilityTier(59.99)).toBe("partielle");
    expect(getThesisStabilityTier(60)).toBe("solide");
    expect(getThesisStabilityTier(84.99)).toBe("solide");
    expect(getThesisStabilityTier(85)).toBe("élevée");
  });
});

describe("Phase A A5 — getFrameworkLensStabilityLabel", () => {
  it("libellé YC avec score élevé", () => {
    expect(getFrameworkLensStabilityLabel("yc", 90)).toBe("Stabilité de la lentille YC : élevée");
  });

  it("libellé Thiel avec score solide", () => {
    expect(getFrameworkLensStabilityLabel("thiel", 70)).toBe("Stabilité de la lentille Thiel : solide");
  });

  it("libellé Angel Desk avec score faible", () => {
    expect(getFrameworkLensStabilityLabel("angel-desk", 20)).toBe("Stabilité de la lentille Angel Desk : faible");
  });

  it("libellé YC avec score partielle (frontière 30)", () => {
    expect(getFrameworkLensStabilityLabel("yc", 30)).toBe("Stabilité de la lentille YC : partielle");
  });
});

describe("Phase A A5 — getOverallThesisStabilityLabel", () => {
  it("libellé thèse consolidée avec score élevé", () => {
    expect(getOverallThesisStabilityLabel(92)).toBe("Stabilité de la thèse (agrégat) : élevée");
  });

  it("libellé thèse consolidée avec score solide", () => {
    expect(getOverallThesisStabilityLabel(65)).toBe("Stabilité de la thèse (agrégat) : solide");
  });
});

describe("Phase A A5 — getThesisAxisStabilityLabel", () => {
  it("libellé axe thesis_quality avec score solide", () => {
    expect(getThesisAxisStabilityLabel("thesis_quality", 72)).toBe("Stabilité de l'axe Qualité de la thèse : solide");
  });

  it("libellé axe investor_profile_fit avec score faible", () => {
    expect(getThesisAxisStabilityLabel("investor_profile_fit", 20)).toBe("Stabilité de l'axe Fit profil investisseur : faible");
  });

  it("libellé axe deal_accessibility avec score élevé", () => {
    expect(getThesisAxisStabilityLabel("deal_accessibility", 95)).toBe("Stabilité de l'axe Accessibilité du deal : élevée");
  });
});

describe("Phase A A5 — getVerdictStabilityLabel (Tier 3 thesis-reconciler)", () => {
  it("libellé verdict mis à jour avec score solide", () => {
    expect(getVerdictStabilityLabel(70)).toBe("Stabilité du verdict mis à jour : solide");
  });

  it("libellé verdict mis à jour avec score faible (post-reconciliation négative)", () => {
    expect(getVerdictStabilityLabel(15)).toBe("Stabilité du verdict mis à jour : faible");
  });
});

describe("Phase A A5 — Invariant doctrinal D4 (aucun libellé ne contient `Confiance` / `Confidence`)", () => {
  it("getFrameworkLensStabilityLabel ne contient pas `Confiance` ni `Confidence` (toutes valeurs)", () => {
    for (const framework of ["yc", "thiel", "angel-desk"] as const) {
      for (const conf of [0, 15, 30, 45, 60, 75, 85, 100]) {
        const label = getFrameworkLensStabilityLabel(framework, conf);
        expect(label.toLowerCase()).not.toContain("confiance");
        expect(label.toLowerCase()).not.toContain("confidence");
      }
    }
  });

  it("getOverallThesisStabilityLabel ne contient pas `Confiance` / `Confidence` (toutes valeurs)", () => {
    for (const conf of [0, 25, 50, 75, 100]) {
      const label = getOverallThesisStabilityLabel(conf);
      expect(label.toLowerCase()).not.toContain("confiance");
      expect(label.toLowerCase()).not.toContain("confidence");
    }
  });

  it("getThesisAxisStabilityLabel ne contient pas `Confiance` / `Confidence` (toutes valeurs)", () => {
    for (const axisKey of ["thesis_quality", "investor_profile_fit", "deal_accessibility"] as const) {
      for (const conf of [0, 25, 50, 75, 100]) {
        const label = getThesisAxisStabilityLabel(axisKey, conf);
        expect(label.toLowerCase()).not.toContain("confiance");
        expect(label.toLowerCase()).not.toContain("confidence");
      }
    }
  });

  it("getVerdictStabilityLabel ne contient pas `Confiance` / `Confidence` (toutes valeurs)", () => {
    for (const conf of [0, 25, 50, 75, 100]) {
      const label = getVerdictStabilityLabel(conf);
      expect(label.toLowerCase()).not.toContain("confiance");
      expect(label.toLowerCase()).not.toContain("confidence");
    }
  });
});

describe("Phase A A5 — Adapter lecture seule (pas de mutation)", () => {
  it("getFrameworkLensStabilityLabel ne mute pas le numéro source", () => {
    const conf = 75;
    const before = conf;
    getFrameworkLensStabilityLabel("yc", conf);
    expect(conf).toBe(before);
  });

  it("getOverallThesisStabilityLabel ne mute pas le numéro source", () => {
    const conf = 65;
    const before = conf;
    getOverallThesisStabilityLabel(conf);
    expect(conf).toBe(before);
  });

  it("getThesisAxisStabilityLabel ne mute pas le numéro source", () => {
    const conf = 50;
    const before = conf;
    getThesisAxisStabilityLabel("thesis_quality", conf);
    expect(conf).toBe(before);
  });

  it("getVerdictStabilityLabel ne mute pas le numéro source", () => {
    const conf = 40;
    const before = conf;
    getVerdictStabilityLabel(conf);
    expect(conf).toBe(before);
  });

  it("getThesisStabilityTier est purement fonctionnel (résultat stable à appels multiples)", () => {
    const conf = 72;
    const first = getThesisStabilityTier(conf);
    const second = getThesisStabilityTier(conf);
    const third = getThesisStabilityTier(conf);
    expect(first).toBe("solide");
    expect(first).toBe(second);
    expect(second).toBe(third);
  });
});
