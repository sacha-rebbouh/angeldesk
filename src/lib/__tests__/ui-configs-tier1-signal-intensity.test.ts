/**
 * Phase A slice A7b-3 — Tests `resolveTier1SignalIntensity` + configs UI Tier 1.
 *
 * Vérifie le contrat des nouveaux helpers d'affichage Tier 1 introduits
 * dans A7b-3 :
 *
 * 1. `TIER1_SIGNAL_INTENSITY_LABELS` — 4 labels analytiques, mappés sur
 *    les valeurs natives du helper A7b-1 `deriveTier1SignalIntensity`.
 * 2. `TIER1_SIGNAL_INTENSITY_BLOCK_CLASS` / `TIER1_SIGNAL_INTENSITY_BADGE_CLASS`
 *    — couples de classes Tailwind pour les 4 intensités.
 * 3. `TIER1_LEGACY_RECOMMENDATION_TO_INTENSITY` — mapping fallback
 *    read-only pour analyses persistées pré-A7b-2.
 * 4. `resolveTier1SignalIntensity()` — résolveur avec priorité native
 *    puis fallback legacy.
 *
 * Cette migration est strictement d'affichage. Aucune dérivation runtime
 * ne passe par ces helpers (cf. doctrine plan A7b-3 :
 * "Garder fallback lecture seule").
 */

import { describe, expect, it } from "vitest";
import {
  resolveTier1SignalIntensity,
  TIER1_SIGNAL_INTENSITY_LABELS,
  TIER1_SIGNAL_INTENSITY_BLOCK_CLASS,
  TIER1_SIGNAL_INTENSITY_BADGE_CLASS,
  TIER1_LEGACY_RECOMMENDATION_TO_INTENSITY,
} from "@/lib/ui-configs";

describe("Phase A A7b-3 — TIER1_SIGNAL_INTENSITY_LABELS (4 valeurs natives)", () => {
  it("expose exactement les 4 valeurs natives du helper A7b-1", () => {
    expect(Object.keys(TIER1_SIGNAL_INTENSITY_LABELS).sort()).toEqual(
      ["critical", "elevated", "high", "low"].sort(),
    );
  });

  it("emploie un wording analytique non-prescriptif (doctrine 2 strates)", () => {
    expect(TIER1_SIGNAL_INTENSITY_LABELS.critical).toBe("ANOMALIE MAJEURE");
    expect(TIER1_SIGNAL_INTENSITY_LABELS.high).toBe("INVESTIGATION REQUISE");
    expect(TIER1_SIGNAL_INTENSITY_LABELS.elevated).toBe("POINTS D'ATTENTION");
    expect(TIER1_SIGNAL_INTENSITY_LABELS.low).toBe("CONFORME");
  });

  it("aucun label ne contient de vocabulaire prescriptif banni (STOP / GO / PASS / etc.)", () => {
    const bannedTokens = ["STOP", "GO", "PASS", "FAIL", "REJET", "INVESTIR"];
    for (const label of Object.values(TIER1_SIGNAL_INTENSITY_LABELS)) {
      for (const token of bannedTokens) {
        expect(label.includes(token)).toBe(false);
      }
    }
  });
});

describe("Phase A A7b-3 — TIER1_SIGNAL_INTENSITY_*_CLASS (Tailwind tokens)", () => {
  it("BLOCK_CLASS définit les 4 intensités", () => {
    expect(Object.keys(TIER1_SIGNAL_INTENSITY_BLOCK_CLASS).sort()).toEqual(
      ["critical", "elevated", "high", "low"].sort(),
    );
  });

  it("BADGE_CLASS définit les 4 intensités", () => {
    expect(Object.keys(TIER1_SIGNAL_INTENSITY_BADGE_CLASS).sort()).toEqual(
      ["critical", "elevated", "high", "low"].sort(),
    );
  });

  it("la palette critical/high/elevated/low suit le code couleur établi", () => {
    expect(TIER1_SIGNAL_INTENSITY_BLOCK_CLASS.critical).toContain("red");
    expect(TIER1_SIGNAL_INTENSITY_BLOCK_CLASS.high).toContain("orange");
    expect(TIER1_SIGNAL_INTENSITY_BLOCK_CLASS.elevated).toContain("yellow");
    expect(TIER1_SIGNAL_INTENSITY_BLOCK_CLASS.low).toContain("green");
  });
});

describe("Phase A A7b-3 — TIER1_LEGACY_RECOMMENDATION_TO_INTENSITY (fallback read-only)", () => {
  it("mappe les 4 valeurs legacy vers les 4 intensités correspondantes", () => {
    expect(TIER1_LEGACY_RECOMMENDATION_TO_INTENSITY.STOP).toBe("critical");
    expect(TIER1_LEGACY_RECOMMENDATION_TO_INTENSITY.INVESTIGATE_FURTHER).toBe("high");
    expect(TIER1_LEGACY_RECOMMENDATION_TO_INTENSITY.PROCEED_WITH_CAUTION).toBe("elevated");
    expect(TIER1_LEGACY_RECOMMENDATION_TO_INTENSITY.PROCEED).toBe("low");
  });

  it("ne contient PAS de mapping inverse ou de runtime hook (read-only strict)", () => {
    expect(Object.keys(TIER1_LEGACY_RECOMMENDATION_TO_INTENSITY).sort()).toEqual(
      ["INVESTIGATE_FURTHER", "PROCEED", "PROCEED_WITH_CAUTION", "STOP"].sort(),
    );
  });
});

describe("Phase A A7b-3 — resolveTier1SignalIntensity (priorité native > fallback legacy)", () => {
  describe("priorité native — signalIntensity post-A7b-2", () => {
    it("low → low", () => {
      expect(resolveTier1SignalIntensity("low", null)).toBe("low");
    });

    it("elevated → elevated", () => {
      expect(resolveTier1SignalIntensity("elevated", null)).toBe("elevated");
    });

    it("high → high", () => {
      expect(resolveTier1SignalIntensity("high", null)).toBe("high");
    });

    it("critical → critical", () => {
      expect(resolveTier1SignalIntensity("critical", null)).toBe("critical");
    });

    it("native gagne même si legacy contradictoire (priorité stricte)", () => {
      // Cas hypothétique : analyse re-générée post-A7b-2 où le legacy est
      // resté incohérent. Le natif domine.
      expect(resolveTier1SignalIntensity("critical", "PROCEED")).toBe("critical");
      expect(resolveTier1SignalIntensity("low", "STOP")).toBe("low");
    });
  });

  describe("fallback legacy — analyses persistées pré-A7b-2", () => {
    it("STOP → critical (fallback)", () => {
      expect(resolveTier1SignalIntensity(null, "STOP")).toBe("critical");
      expect(resolveTier1SignalIntensity(undefined, "STOP")).toBe("critical");
    });

    it("INVESTIGATE_FURTHER → high (fallback)", () => {
      expect(resolveTier1SignalIntensity(null, "INVESTIGATE_FURTHER")).toBe("high");
    });

    it("PROCEED_WITH_CAUTION → elevated (fallback)", () => {
      expect(resolveTier1SignalIntensity(null, "PROCEED_WITH_CAUTION")).toBe("elevated");
    });

    it("PROCEED → low (fallback)", () => {
      expect(resolveTier1SignalIntensity(null, "PROCEED")).toBe("low");
    });

    it("signalIntensity invalide → fallback sur legacy si disponible", () => {
      // Cas dégradé : le runtime émet une valeur hors enum (régression).
      // On retombe sur le legacy plutôt que renvoyer null.
      expect(resolveTier1SignalIntensity("unknown_value", "STOP")).toBe("critical");
    });
  });

  describe("absence totale — pas de signal exploitable", () => {
    it("null / null → null", () => {
      expect(resolveTier1SignalIntensity(null, null)).toBeNull();
    });

    it("undefined / undefined → null", () => {
      expect(resolveTier1SignalIntensity(undefined, undefined)).toBeNull();
    });

    it("valeurs hors enum des deux côtés → null", () => {
      expect(resolveTier1SignalIntensity("foo", "BAR")).toBeNull();
    });
  });
});

describe("Phase A A7b-3 — fallback read-only documenté (analyses pré-A7b-2)", () => {
  it("Une analyse pré-A7b-2 (signalIntensity absent, recommendation legacy) reste affichable", () => {
    // Reproduit le shape d'une analyse persistée avant le slice A7b-2 :
    // `signalIntensity` n'existait pas, le LLM émettait encore
    // `alertSignal.recommendation`. Le fallback doit produire une
    // intensité exploitable côté UI.
    const preA7b2Shape = {
      alertSignal: {
        hasBlocker: true,
        recommendation: "STOP" as const,
        justification: "Métriques financières incohérentes",
      },
      signalIntensity: undefined,
    };
    const resolved = resolveTier1SignalIntensity(
      preA7b2Shape.signalIntensity,
      preA7b2Shape.alertSignal.recommendation,
    );
    expect(resolved).toBe("critical");
  });

  it("Une analyse post-A7b-2 (signalIntensity natif) ne dépend pas du legacy", () => {
    const postA7b2Shape = {
      alertSignal: {
        hasBlocker: false,
        // Le runtime A7b-2 émet recommendation dérivé (signalIntensityToRecommendation).
        // On vérifie que le helper résolveur n'a pas besoin du legacy pour fonctionner.
        recommendation: "PROCEED_WITH_CAUTION" as const,
        justification: "Quelques points à clarifier",
      },
      signalIntensity: "elevated" as const,
    };
    const resolved = resolveTier1SignalIntensity(
      postA7b2Shape.signalIntensity,
      postA7b2Shape.alertSignal.recommendation,
    );
    expect(resolved).toBe("elevated");
  });
});
