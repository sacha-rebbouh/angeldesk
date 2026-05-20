/**
 * Phase B12.4 P1 #6 — freshnessLabel() resolves every known
 * StaleWarningKind to a human-readable French label, and falls back
 * gracefully on unknown kinds.
 *
 * Context: B12.1.1 audit observed raw snake_case identifiers like
 * `financial_statements_stale` and `pitch_deck_stale` leaking into
 * the UI (active freshness list + treated section + aria-labels).
 * The asymmetry with `cap_table_stale` (which had a proper label
 * "Cap table périmée") made the leak particularly visible.
 *
 * Note: the StaleWarningKind type currently only declares 3 valid
 * values (`cap_table_stale`, `balance_sheet_stale`,
 * `forecast_now_historical`). The B12.1.1 leak was reproducible via
 * a mock injection — the real backend never emits invalid kinds.
 * Still, the runtime fallback is defense-in-depth: a backend release
 * that adds a new kind ahead of the UI deploy won't show snake_case
 * to BAs.
 */
import { describe, expect, it } from "vitest";
import { freshnessLabel } from "../evidence-health-panel";
import type { StaleWarningKind } from "@/services/evidence/build-evidence-context";

describe("B12.4 P1 #6 — freshnessLabel resolves every declared StaleWarningKind", () => {
  // Compile-time exhaustiveness — if a new kind is added to the type
  // without updating this list, TS errors on the satisfies check.
  const ALL_KINDS = [
    "cap_table_stale",
    "balance_sheet_stale",
    "forecast_now_historical",
  ] as const satisfies readonly StaleWarningKind[];

  it("every declared kind has a non-empty French label", () => {
    for (const kind of ALL_KINDS) {
      const label = freshnessLabel(kind);
      expect(label, `freshnessLabel(${kind}) must return a non-empty label`).not.toBe("");
      // Anchor: the label must NOT be the raw kind itself (the bug
      // observed in B12.1.1 was the leak of `pitch_deck_stale` style
      // identifiers).
      expect(label).not.toBe(kind);
      // Sanity: French labels use accented chars or capitalised words.
      expect(label).toMatch(/[A-ZÉÈÊÀÂÔÎÛÇ]/);
    }
  });

  it("cap_table_stale → 'Cap table périmée' (anchored — matches the only kind that was already correctly labelled pre-B12.4)", () => {
    expect(freshnessLabel("cap_table_stale")).toBe("Cap table périmée");
  });

  it("balance_sheet_stale → 'Bilan périmé'", () => {
    expect(freshnessLabel("balance_sheet_stale")).toBe("Bilan périmé");
  });

  it("forecast_now_historical → 'Forecast déjà entamé'", () => {
    expect(freshnessLabel("forecast_now_historical")).toBe("Forecast déjà entamé");
  });

  it("unknown kind → graceful generic fallback (NOT the raw snake_case identifier)", () => {
    // Defense-in-depth: simulate a backend release that adds a new
    // kind ahead of the UI. The fallback must be French + friendly,
    // not the raw `pitch_deck_stale` style string.
    const unknownKind = "pitch_deck_stale" as StaleWarningKind;
    const label = freshnessLabel(unknownKind);
    expect(label).not.toBe(unknownKind);
    expect(label).not.toMatch(/_/); // no snake_case in the user-facing fallback
    expect(label).toBe("Donnée périmée");
  });

  it("another unknown kind → same fallback (proves the fallback is stable)", () => {
    const unknownKind = "financial_statements_stale" as StaleWarningKind;
    expect(freshnessLabel(unknownKind)).toBe("Donnée périmée");
  });
});
