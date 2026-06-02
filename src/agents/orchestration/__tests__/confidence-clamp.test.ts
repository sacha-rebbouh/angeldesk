import { describe, it, expect } from "vitest";
import { clampConfidenceLevel } from "../confidence-clamp";

describe("clampConfidenceLevel (fix post-mortem Avekapeti — confidenceLevel NaN)", () => {
  it("nombre fini valide → clampé 0-100, pas fallback", () => {
    expect(clampConfidenceLevel(75)).toEqual({ confidenceLevel: 75, confidenceIsFallback: false });
    expect(clampConfidenceLevel(0)).toEqual({ confidenceLevel: 0, confidenceIsFallback: false });
    expect(clampConfidenceLevel(100)).toEqual({ confidenceLevel: 100, confidenceIsFallback: false });
  });

  it("hors bornes → clampé (pas fallback)", () => {
    expect(clampConfidenceLevel(150)).toEqual({ confidenceLevel: 100, confidenceIsFallback: false });
    expect(clampConfidenceLevel(-20)).toEqual({ confidenceLevel: 0, confidenceIsFallback: false });
  });

  it("null / undefined → fallback 0 (comportement historique préservé)", () => {
    expect(clampConfidenceLevel(null)).toEqual({ confidenceLevel: 0, confidenceIsFallback: true });
    expect(clampConfidenceLevel(undefined)).toEqual({ confidenceLevel: 0, confidenceIsFallback: true });
  });

  it("NaN / Infinity → fallback 0 (empêche le NaN de se propager — cas Avekapeti)", () => {
    expect(clampConfidenceLevel(NaN)).toEqual({ confidenceLevel: 0, confidenceIsFallback: true });
    expect(clampConfidenceLevel(Infinity)).toEqual({ confidenceLevel: 0, confidenceIsFallback: true });
    expect(clampConfidenceLevel(-Infinity)).toEqual({ confidenceLevel: 0, confidenceIsFallback: true });
  });

  it("valeur non-numérique (string/objet) → fallback 0 (ne coerce PLUS en NaN via Math.max)", () => {
    expect(clampConfidenceLevel("high")).toEqual({ confidenceLevel: 0, confidenceIsFallback: true });
    expect(clampConfidenceLevel("75")).toEqual({ confidenceLevel: 0, confidenceIsFallback: true });
    expect(clampConfidenceLevel({})).toEqual({ confidenceLevel: 0, confidenceIsFallback: true });
    expect(clampConfidenceLevel([])).toEqual({ confidenceLevel: 0, confidenceIsFallback: true });
  });
});
