/**
 * Phase 8 — Unit tests for the per-doc evidence-health badge verdict logic.
 * The component itself is trivial; the interesting logic is `deriveVerdict`.
 */
import { describe, expect, it } from "vitest";
import { __deriveEvidenceBadgeVerdict as deriveVerdict } from "../evidence-health-badge";

describe("deriveVerdict — per-doc evidence badge", () => {
  it("undefined summary → null (badge hidden)", () => {
    expect(deriveVerdict(undefined)).toBeNull();
  });

  it("summary vide (aucun finding) → null (badge hidden)", () => {
    expect(
      deriveVerdict({
        contradictionCount: 0,
        highestContradictionSeverity: null,
        missing: [],
        freshness: [],
      })
    ).toBeNull();
  });

  it("contradiction HIGH → tier rouge avec tooltip", () => {
    const v = deriveVerdict({
      contradictionCount: 1,
      highestContradictionSeverity: "HIGH",
      missing: [],
      freshness: [],
    });
    expect(v).not.toBeNull();
    expect(v!.className).toMatch(/red/);
    expect(v!.shortLabel).toBe("Contradiction");
    expect(v!.tooltip).toContain("1 contradiction (HIGH)");
  });

  it("contradiction MEDIUM seule → tier ambre", () => {
    const v = deriveVerdict({
      contradictionCount: 1,
      highestContradictionSeverity: "MEDIUM",
      missing: [],
      freshness: [],
    });
    expect(v!.className).toMatch(/amber/);
  });

  it("missing HIGH sans contradiction → tier rouge (vraie sévérité respectée)", () => {
    const v = deriveVerdict({
      contradictionCount: 0,
      highestContradictionSeverity: null,
      missing: [{ kind: "NO_CAP_TABLE_AS_OF", severity: "HIGH" }],
      freshness: [],
    });
    expect(v!.className).toMatch(/red/);
    expect(v!.shortLabel).toBe("Manquant");
    expect(v!.tooltip).toContain("cap table sans date (HIGH)");
  });

  it("Codex round 24 P1 — freshness HIGH (cap_table_stale high) → tier rouge, JAMAIS ambre", () => {
    const v = deriveVerdict({
      contradictionCount: 0,
      highestContradictionSeverity: null,
      missing: [],
      freshness: [{ kind: "cap_table_stale", severity: "HIGH" }],
    });
    expect(v!.className).toMatch(/red/);
    expect(v!.tooltip).toContain("cap table périmée (HIGH)");
  });

  it("Codex round 24 P1 — missing LOW (NO_PITCH_DECK_DATE low) → tier slate, JAMAIS ambre", () => {
    const v = deriveVerdict({
      contradictionCount: 0,
      highestContradictionSeverity: null,
      missing: [{ kind: "NO_PITCH_DECK_DATE", severity: "LOW" }],
      freshness: [],
    });
    expect(v!.className).toMatch(/slate/);
  });

  it("freshness MEDIUM seule → tier ambre avec icône clock + label 'fraîcheur'", () => {
    const v = deriveVerdict({
      contradictionCount: 0,
      highestContradictionSeverity: null,
      missing: [],
      freshness: [{ kind: "cap_table_stale", severity: "MEDIUM" }],
    });
    expect(v!.className).toMatch(/amber/);
    expect(v!.shortLabel).toBe("Fraîcheur");
    expect(v!.longLabel).toContain("Fraîcheur");
    expect(v!.tooltip).toContain("cap table périmée");
  });

  it("forecast_now_historical → label produit explicite 'Prévision'", () => {
    const v = deriveVerdict({
      contradictionCount: 0,
      highestContradictionSeverity: null,
      missing: [],
      freshness: [{ kind: "forecast_now_historical", severity: "MEDIUM" }],
    });
    expect(v!.shortLabel).toBe("Prévision");
    expect(v!.longLabel).toContain("actualiser");
  });

  it("contradiction HIGH + freshness MEDIUM → reste rouge (HIGH gagne)", () => {
    const v = deriveVerdict({
      contradictionCount: 2,
      highestContradictionSeverity: "HIGH",
      missing: [{ kind: "NO_PITCH_DECK_DATE", severity: "LOW" }],
      freshness: [{ kind: "cap_table_stale", severity: "MEDIUM" }],
    });
    expect(v!.className).toMatch(/red/);
    expect(v!.tooltip).toContain("2 contradictions");
    expect(v!.tooltip).toContain("Manquant");
    expect(v!.tooltip).toContain("Fraîcheur");
  });

  it("contradiction LOW seule → tier slate (peu critique)", () => {
    const v = deriveVerdict({
      contradictionCount: 1,
      highestContradictionSeverity: "LOW",
      missing: [],
      freshness: [],
    });
    expect(v!.className).toMatch(/slate/);
  });

  it("tone analytique — aucun verbe prescriptif dans tooltip", () => {
    const v = deriveVerdict({
      contradictionCount: 1,
      highestContradictionSeverity: "HIGH",
      missing: [{ kind: "NO_CAP_TABLE_AS_OF", severity: "HIGH" }],
      freshness: [{ kind: "cap_table_stale", severity: "HIGH" }],
    });
    expect(v!.tooltip).not.toMatch(/(rejet|investir|no[\s_-]?go|fuyez|STRONG_PASS|WEAK_PASS|CONDITIONAL_PASS)/i);
  });
});
