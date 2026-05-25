import { describe, expect, it } from "vitest";
import { proofLabel } from "@/lib/pdf/pdf-helpers";

/**
 * Phase 2 — helper PDF `proofLabel()`.
 *
 * Asymétrie volontaire par rapport à `recLabel()` : pas de fallback implicite.
 * Le label "SOLIDITÉ À QUALIFIER" n'est retourné QUE si la section PDF passe
 * explicitement `{ showUnqualified: true }`. Par défaut, l'absence retourne
 * `null` — la section doit décider de l'affichage.
 */

describe("proofLabel — solidité des preuves (PDF uppercase)", () => {
  it.each([
    ["strong", "PREUVES SOLIDES"],
    ["moderate", "PREUVES PARTIELLES"],
    ["low", "PREUVES FAIBLES"],
    ["contradictory", "PREUVES CONTRADICTOIRES"],
    ["insufficient", "DONNÉES INSUFFISANTES"],
  ] as const)("%s → %s pour une valeur qualifiée", (input, expected) => {
    expect(proofLabel(input)).toBe(expected);
  });

  it("retourne null par défaut pour null (pas de fallback implicite)", () => {
    expect(proofLabel(null)).toBeNull();
  });

  it("retourne null par défaut pour undefined", () => {
    expect(proofLabel(undefined)).toBeNull();
  });

  it("retourne null par défaut pour une valeur inconnue", () => {
    expect(proofLabel("xxx")).toBeNull();
  });

  it("retourne null par défaut pour 'unknown' (non canonique)", () => {
    expect(proofLabel("unknown")).toBeNull();
  });

  it("retourne 'SOLIDITÉ À QUALIFIER' avec { showUnqualified: true } pour null", () => {
    expect(proofLabel(null, { showUnqualified: true })).toBe("SOLIDITÉ À QUALIFIER");
  });

  it("retourne 'SOLIDITÉ À QUALIFIER' avec { showUnqualified: true } pour undefined", () => {
    expect(proofLabel(undefined, { showUnqualified: true })).toBe("SOLIDITÉ À QUALIFIER");
  });

  it("retourne 'SOLIDITÉ À QUALIFIER' avec { showUnqualified: true } pour valeur inconnue", () => {
    expect(proofLabel("xxx", { showUnqualified: true })).toBe("SOLIDITÉ À QUALIFIER");
  });

  it("ignore { showUnqualified: true } pour une valeur qualifiée (retourne le label uppercase canonique)", () => {
    expect(proofLabel("strong", { showUnqualified: true })).toBe("PREUVES SOLIDES");
  });

  it("retourne null avec { showUnqualified: false } explicite pour null", () => {
    expect(proofLabel(null, { showUnqualified: false })).toBeNull();
  });
});
