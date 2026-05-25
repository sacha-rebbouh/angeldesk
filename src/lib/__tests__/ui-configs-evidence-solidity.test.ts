import { describe, expect, it } from "vitest";
import {
  EVIDENCE_SOLIDITY_CONFIG,
  EVIDENCE_SOLIDITY_VALUES,
  getEvidenceSolidityConfig,
  getEvidenceSolidityLabel,
  ORIENTATION_VALUES,
  RECOMMENDATION_CONFIG,
} from "@/lib/ui-configs";

/**
 * Le label fallback "Solidité à qualifier" n'est volontairement PAS exporté
 * comme constante depuis `ui-configs.ts` — la seule façon de l'obtenir est
 * d'appeler `getEvidenceSolidityLabel(value, { showUnqualified: true })`.
 * Les tests ci-dessous vérifient cette opacité.
 */
const UNQUALIFIED_LABEL = "Solidité à qualifier";

/**
 * Phase 2 — modèle UI décisionnel à 2 axes.
 *
 * Vérifie le contrat des nouveaux types (Orientation, EvidenceSolidity), de la
 * config solidité et des deux helpers `getEvidenceSolidityConfig` /
 * `getEvidenceSolidityLabel`.
 *
 * Règle critique testée explicitement : pas de valeur "unknown" dans
 * EVIDENCE_SOLIDITY_VALUES, et pas de mot "Confiance" dans les labels /
 * descriptions (anti-pattern §28).
 */

describe("ORIENTATION_VALUES", () => {
  it("contient exactement les 5 valeurs canoniques d'orientation", () => {
    expect([...ORIENTATION_VALUES]).toEqual([
      "very_favorable",
      "favorable",
      "contrasted",
      "vigilance",
      "alert_dominant",
    ]);
  });

  it("RECOMMENDATION_CONFIG couvre les 5 valeurs d'orientation", () => {
    for (const value of ORIENTATION_VALUES) {
      expect(RECOMMENDATION_CONFIG[value]).toBeDefined();
    }
  });
});

describe("EVIDENCE_SOLIDITY_VALUES", () => {
  it("contient exactement les 5 valeurs qualifiées (sans 'unknown')", () => {
    expect([...EVIDENCE_SOLIDITY_VALUES]).toEqual([
      "strong",
      "moderate",
      "low",
      "contradictory",
      "insufficient",
    ]);
  });

  it("ne contient PAS la valeur 'unknown' (anti-pattern doctrinal)", () => {
    expect(EVIDENCE_SOLIDITY_VALUES as readonly string[]).not.toContain("unknown");
  });
});

describe("EVIDENCE_SOLIDITY_CONFIG", () => {
  it("a une entrée non vide pour chaque valeur canonique", () => {
    for (const value of EVIDENCE_SOLIDITY_VALUES) {
      const cfg = EVIDENCE_SOLIDITY_CONFIG[value];
      expect(cfg).toBeDefined();
      expect(cfg.label).toBeTruthy();
      expect(cfg.shortLabel).toBeTruthy();
      expect(cfg.color).toBeTruthy();
      expect(cfg.bg).toBeTruthy();
      expect(cfg.description).toBeTruthy();
    }
  });

  it("aucun label / shortLabel / description ne contient le mot 'Confiance' (anti-pattern §28)", () => {
    for (const value of EVIDENCE_SOLIDITY_VALUES) {
      const cfg = EVIDENCE_SOLIDITY_CONFIG[value];
      expect(cfg.label).not.toContain("Confiance");
      expect(cfg.shortLabel).not.toContain("Confiance");
      expect(cfg.description).not.toContain("Confiance");
    }
  });
});

describe("Fallback label 'Solidité à qualifier'", () => {
  it("EVIDENCE_SOLIDITY_UNQUALIFIED_LABEL n'est PAS exporté depuis ui-configs.ts", async () => {
    const mod = (await import("@/lib/ui-configs")) as Record<string, unknown>;
    expect(mod.EVIDENCE_SOLIDITY_UNQUALIFIED_LABEL).toBeUndefined();
  });

  it("est uniquement accessible via getEvidenceSolidityLabel(null, { showUnqualified: true })", () => {
    expect(getEvidenceSolidityLabel(null, { showUnqualified: true })).toBe(
      UNQUALIFIED_LABEL,
    );
  });
});

describe("getEvidenceSolidityConfig", () => {
  it.each(EVIDENCE_SOLIDITY_VALUES)(
    "retourne la config pour la valeur qualifiée %s",
    (value) => {
      const cfg = getEvidenceSolidityConfig(value);
      expect(cfg).not.toBeNull();
      expect(cfg?.label).toBe(EVIDENCE_SOLIDITY_CONFIG[value].label);
    },
  );

  it("retourne null pour null", () => {
    expect(getEvidenceSolidityConfig(null)).toBeNull();
  });

  it("retourne null pour undefined", () => {
    expect(getEvidenceSolidityConfig(undefined)).toBeNull();
  });

  it("retourne null pour une valeur inconnue", () => {
    expect(getEvidenceSolidityConfig("xxx")).toBeNull();
  });

  it("retourne null pour 'unknown' (n'est PAS une valeur canonique)", () => {
    expect(getEvidenceSolidityConfig("unknown")).toBeNull();
  });
});

describe("getEvidenceSolidityLabel", () => {
  it.each([
    ["strong", "Preuves solides"],
    ["moderate", "Preuves partielles"],
    ["low", "Preuves faibles"],
    ["contradictory", "Preuves contradictoires"],
    ["insufficient", "Données insuffisantes"],
  ] as const)("retourne %s → %s pour une valeur qualifiée", (input, expected) => {
    expect(getEvidenceSolidityLabel(input)).toBe(expected);
  });

  it("retourne null par défaut pour null (pas de fallback implicite)", () => {
    expect(getEvidenceSolidityLabel(null)).toBeNull();
  });

  it("retourne null par défaut pour undefined", () => {
    expect(getEvidenceSolidityLabel(undefined)).toBeNull();
  });

  it("retourne null par défaut pour une valeur inconnue", () => {
    expect(getEvidenceSolidityLabel("xxx")).toBeNull();
  });

  it("retourne null par défaut pour 'unknown' (non canonique)", () => {
    expect(getEvidenceSolidityLabel("unknown")).toBeNull();
  });

  it("retourne le fallback explicite 'Solidité à qualifier' avec { showUnqualified: true } pour null", () => {
    expect(getEvidenceSolidityLabel(null, { showUnqualified: true })).toBe(
      UNQUALIFIED_LABEL,
    );
  });

  it("retourne le fallback explicite 'Solidité à qualifier' avec { showUnqualified: true } pour undefined", () => {
    expect(getEvidenceSolidityLabel(undefined, { showUnqualified: true })).toBe(
      UNQUALIFIED_LABEL,
    );
  });

  it("retourne le fallback explicite 'Solidité à qualifier' avec { showUnqualified: true } pour valeur inconnue", () => {
    expect(getEvidenceSolidityLabel("xxx", { showUnqualified: true })).toBe(
      UNQUALIFIED_LABEL,
    );
  });

  it("ignore { showUnqualified: true } pour une valeur qualifiée (retourne le label canonique)", () => {
    expect(getEvidenceSolidityLabel("strong", { showUnqualified: true })).toBe(
      "Preuves solides",
    );
  });

  it("retourne null avec { showUnqualified: false } explicite pour null", () => {
    expect(getEvidenceSolidityLabel(null, { showUnqualified: false })).toBeNull();
  });
});
