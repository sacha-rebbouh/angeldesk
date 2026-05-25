/**
 * Phase A slice A8b — Tests `TIER2_SECTOR_FIT_LABELS` + helper.
 *
 * Vérifie le contrat doctrinaire des libellés Tier 2 user-facing :
 *
 *   1. **Couverture exhaustive** : 5 valeurs canoniques exactement
 *      (STRONG_FIT, GOOD_FIT, MODERATE_FIT, POOR_FIT, NOT_RECOMMENDED).
 *   2. **Wording doctrinaire** : tous les libellés sont formulés en
 *      adéquation sectorielle (fit), jamais en instruction d'investissement.
 *      Pas de tokens prescriptifs bannis (Investir, Rejeter, GO/NO-GO,
 *      PASS, FAIL, AVOID, etc.).
 *   3. **Helper `getTier2SectorFitLabel`** : résolveur lecture seule.
 *      Retourne le libellé canonique si valeur valide, `null` sinon.
 *      Aucune dérivation runtime ne doit transiter par ce helper.
 *   4. **Garde-fou enum canonique** : `NOT_RECOMMENDED` reste défini
 *      (décision Codex A8 audit point 1 — pas de renommage en Phase A).
 */

import { describe, expect, it } from "vitest";
import {
  TIER2_SECTOR_FIT_LABELS,
  getTier2SectorFitLabel,
  type Tier2SectorFitValue,
} from "@/lib/ui-configs";

describe("Phase A A8b — TIER2_SECTOR_FIT_LABELS (couverture exhaustive)", () => {
  it("expose exactement les 5 valeurs canoniques `_extended.verdict.recommendation`", () => {
    expect(Object.keys(TIER2_SECTOR_FIT_LABELS).sort()).toEqual(
      ["GOOD_FIT", "MODERATE_FIT", "NOT_RECOMMENDED", "POOR_FIT", "STRONG_FIT"].sort(),
    );
  });

  it("libellé STRONG_FIT — wording doctrinaire `Forte adéquation sectorielle`", () => {
    expect(TIER2_SECTOR_FIT_LABELS.STRONG_FIT).toBe("Forte adéquation sectorielle");
  });

  it("libellé GOOD_FIT — wording doctrinaire `Bonne adéquation sectorielle`", () => {
    expect(TIER2_SECTOR_FIT_LABELS.GOOD_FIT).toBe("Bonne adéquation sectorielle");
  });

  it("libellé MODERATE_FIT — wording doctrinaire `Adéquation sectorielle modérée`", () => {
    expect(TIER2_SECTOR_FIT_LABELS.MODERATE_FIT).toBe("Adéquation sectorielle modérée");
  });

  it("libellé POOR_FIT — wording doctrinaire `Adéquation sectorielle faible`", () => {
    expect(TIER2_SECTOR_FIT_LABELS.POOR_FIT).toBe("Adéquation sectorielle faible");
  });

  it("libellé NOT_RECOMMENDED — wording doctrinaire `Hors profil sectoriel`", () => {
    expect(TIER2_SECTOR_FIT_LABELS.NOT_RECOMMENDED).toBe("Hors profil sectoriel");
  });
});

describe("Phase A A8b — TIER2_SECTOR_FIT_LABELS (anti-prescriptif)", () => {
  const bannedTokens = [
    "Investir",
    "investir",
    "Rejeter",
    "rejeter",
    "GO",
    "NO-GO",
    "PASS",
    "FAIL",
    "AVOID",
    "STOP",
    "Dealbreaker",
    "Fuyez",
    "N'investissez",
    "Recommandé",
    "recommandé",
  ];

  for (const [key, label] of Object.entries(TIER2_SECTOR_FIT_LABELS)) {
    it(`libellé ${key} ne contient aucun token prescriptif banni`, () => {
      for (const token of bannedTokens) {
        if (label.includes(token)) {
          throw new Error(`Token prescriptif banni détecté dans ${key} : « ${token} » dans "${label}"`);
        }
      }
    });
  }

  it("tous les libellés mentionnent l'axe sectoriel (`sectoriel` / `profil`)", () => {
    for (const [key, label] of Object.entries(TIER2_SECTOR_FIT_LABELS)) {
      const mentionsAxis = /sectoriel|profil/i.test(label);
      expect({ key, label, mentionsAxis }).toEqual(
        expect.objectContaining({ mentionsAxis: true }),
      );
    }
  });
});

describe("Phase A A8b — getTier2SectorFitLabel (résolveur lecture seule)", () => {
  it("retourne le libellé canonique pour chacune des 5 valeurs valides", () => {
    const cases: Array<{ value: Tier2SectorFitValue; expected: string }> = [
      { value: "STRONG_FIT", expected: "Forte adéquation sectorielle" },
      { value: "GOOD_FIT", expected: "Bonne adéquation sectorielle" },
      { value: "MODERATE_FIT", expected: "Adéquation sectorielle modérée" },
      { value: "POOR_FIT", expected: "Adéquation sectorielle faible" },
      { value: "NOT_RECOMMENDED", expected: "Hors profil sectoriel" },
    ];
    for (const { value, expected } of cases) {
      expect(getTier2SectorFitLabel(value)).toBe(expected);
    }
  });

  it("retourne `null` si valeur hors enum (cas dégradé)", () => {
    expect(getTier2SectorFitLabel("UNKNOWN_VALUE")).toBeNull();
    expect(getTier2SectorFitLabel("AVOID")).toBeNull();
    expect(getTier2SectorFitLabel("NOT_REAL_AI")).toBeNull();
  });

  it("retourne `null` si valeur `null` ou `undefined`", () => {
    expect(getTier2SectorFitLabel(null)).toBeNull();
    expect(getTier2SectorFitLabel(undefined)).toBeNull();
  });

  it("retourne `null` si valeur non-string (typage défensif)", () => {
    // @ts-expect-error — test runtime defensiveness against bad caller
    expect(getTier2SectorFitLabel(42)).toBeNull();
    // @ts-expect-error — test runtime defensiveness against bad caller
    expect(getTier2SectorFitLabel({})).toBeNull();
  });
});

describe("Phase A A8b — Garde-fou enum canonique `NOT_RECOMMENDED` (non renommé)", () => {
  it("`NOT_RECOMMENDED` reste défini dans le mapping (cf. Codex A8 audit point 1)", () => {
    // A8b NE renomme PAS le canonique `NOT_RECOMMENDED` (reporté
    // post-Phase A). Le libellé user-facing "Hors profil sectoriel" est la
    // traduction doctrinaire ; l'enum technique reste tel quel.
    expect("NOT_RECOMMENDED" in TIER2_SECTOR_FIT_LABELS).toBe(true);
  });
});
