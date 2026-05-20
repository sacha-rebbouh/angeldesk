/**
 * Phase B9.1 — Signal identity tests.
 *
 * Codex point of attention: resolutions MUST be keyed by identity,
 * not by display wording. These tests anchor the invariant: same
 * finding identity → same key, regardless of severity / reason /
 * affected-doc-count drift.
 *
 * B9.1.1 fix-ups (Codex B9.1 P1 + P2):
 *   - P1: the contradiction key now includes a stable hash of the
 *     evidence set so adding a NEW contributing signal breaks the
 *     resolution (the BA must look at the new evidence).
 *   - P2: parseSignalKey validates the kind segment against the known
 *     enum unions so `missing:NOT_A_REAL_KIND` is rejected.
 */
import { describe, expect, it } from "vitest";
import {
  signalKeyForContradiction,
  signalKeyForMissing,
  signalKeyForFreshness,
  parseSignalKey,
  isValidSignalKey,
  type ContradictionFinding,
} from "@/services/evidence";

type ContradictionSignalRefShape = ContradictionFinding["signals"][number];

// ----------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------
function makeSignal(
  documentId: string,
  amount: number,
  currency: ContradictionSignalRefShape["currency"] = "EUR",
  classification: ContradictionSignalRefShape["classification"] = "claim"
): ContradictionSignalRefShape {
  return {
    documentId,
    documentName: `${documentId}.pdf`,
    documentType: "PITCH_DECK",
    classification,
    amount,
    currency,
    // signalId is intentionally varied per call so tests prove the
    // hash basis is (documentId, amount, currency) — NOT signalId.
    signalId: `s_${documentId}_${amount}_${Math.random()}`,
  };
}

function makeContradiction(
  partial: Partial<ContradictionFinding> & {
    subject: string;
    signals: ContradictionSignalRefShape[];
  }
): ContradictionFinding {
  return {
    kind: "METRIC_MISMATCH",
    year: 2025,
    severity: "HIGH",
    reason: "reason",
    spreadRatio: 1.5,
    ...partial,
  };
}

const TWO_SIGNALS = [makeSignal("d_a", 1_000_000), makeSignal("d_b", 2_000_000)];

// ----------------------------------------------------------------
// Contradiction key
// ----------------------------------------------------------------

describe("signalKeyForContradiction — identity stable across cosmetic re-renders", () => {
  it("returns the same key for two re-renders that differ only in severity / reason / spreadRatio (cosmetic)", () => {
    const a = signalKeyForContradiction(
      makeContradiction({ subject: "VALUATION", year: 2025, severity: "HIGH", reason: "long reason", signals: TWO_SIGNALS })
    );
    const b = signalKeyForContradiction(
      makeContradiction({
        subject: "VALUATION",
        year: 2025,
        severity: "MEDIUM",
        reason: "different reason text",
        spreadRatio: 2.5,
        signals: TWO_SIGNALS,
      })
    );
    expect(a).toBe(b);
  });

  it("distinguishes by year (undated ≠ 2025)", () => {
    expect(
      signalKeyForContradiction(makeContradiction({ subject: "CA", year: null, signals: TWO_SIGNALS }))
    ).not.toBe(
      signalKeyForContradiction(makeContradiction({ subject: "CA", year: 2025, signals: TWO_SIGNALS }))
    );
  });

  it("escapes ':' in subject so a doc-name-bearing subject doesn't break round-trip", () => {
    const k = signalKeyForContradiction(makeContradiction({ subject: "A:B", year: 2026, signals: TWO_SIGNALS }));
    expect(k).toContain("A%3AB");
    const parsed = parseSignalKey(k);
    expect(parsed?.kind).toBe("contradiction");
    if (parsed?.kind === "contradiction") {
      expect(parsed.subject).toBe("A:B");
      expect(parsed.year).toBe(2026);
      expect(parsed.contradictionKind).toBe("METRIC_MISMATCH");
    }
  });

  it("produces a 'undated' marker when year is null (parse-back roundtrip)", () => {
    const k = signalKeyForContradiction(makeContradiction({ subject: "ARR", year: null, signals: TWO_SIGNALS }));
    // The key ends with `:undated:HASH` — verify both segments present.
    expect(k).toMatch(/:undated:[0-9a-f]{16}$/);
    const parsed = parseSignalKey(k);
    expect(parsed?.kind === "contradiction" && parsed.year).toBeNull();
  });
});

// ----------------------------------------------------------------
// B9.1.1 (Codex B9.1 P1) — evidence-set hash invariants
// ----------------------------------------------------------------

describe("signalKeyForContradiction — evidence-set hash (B9.1.1, Codex B9.1 P1)", () => {
  it("RED test: resolving A/B does NOT mask a later A/B/C contradiction on the same (kind, subject, year)", () => {
    // Pre-fix this scenario produced equal keys because the evidence
    // set was not part of the identity. Adding doc C must change the
    // key so the BA's previous resolution does not silently hide the
    // contradiction now that there's NEW evidence.
    const ab = signalKeyForContradiction(
      makeContradiction({
        subject: "CA",
        year: 2025,
        signals: [makeSignal("d_a", 1_000_000), makeSignal("d_b", 2_000_000)],
      })
    );
    const abc = signalKeyForContradiction(
      makeContradiction({
        subject: "CA",
        year: 2025,
        signals: [makeSignal("d_a", 1_000_000), makeSignal("d_b", 2_000_000), makeSignal("d_c", 3_000_000)],
      })
    );
    expect(ab).not.toBe(abc);
  });

  it("RED test: resolving A/B does NOT mask a disjoint C/D contradiction on the same (kind, subject, year)", () => {
    const ab = signalKeyForContradiction(
      makeContradiction({ subject: "CA", year: 2025, signals: [makeSignal("d_a", 1_000_000), makeSignal("d_b", 2_000_000)] })
    );
    const cd = signalKeyForContradiction(
      makeContradiction({ subject: "CA", year: 2025, signals: [makeSignal("d_c", 4_000_000), makeSignal("d_d", 5_000_000)] })
    );
    expect(ab).not.toBe(cd);
  });

  it("re-extraction of identical content (new signalId cuids, same documentId/amount/currency) KEEPS the resolution alive", () => {
    // Same contradiction observed twice: signalId rows are recreated
    // with new cuids by the extraction pipeline, but the underlying
    // (documentId, amount, currency) tuple is identical. The
    // resolution MUST survive — otherwise every re-upload would
    // un-resolve the BA's previous decision.
    const run1 = signalKeyForContradiction(
      makeContradiction({
        subject: "VALUATION",
        year: 2025,
        signals: [
          makeSignal("d_a", 5_000_000, "EUR", "claim"),
          makeSignal("d_b", 8_000_000, "EUR", "actual"),
        ],
      })
    );
    const run2 = signalKeyForContradiction(
      makeContradiction({
        subject: "VALUATION",
        year: 2025,
        signals: [
          // Different signalId (random per call), same evidence tuple.
          makeSignal("d_a", 5_000_000, "EUR", "claim"),
          makeSignal("d_b", 8_000_000, "EUR", "actual"),
        ],
      })
    );
    expect(run1).toBe(run2);
  });

  it("evidence-set hash is order-insensitive (sort + dedup)", () => {
    const k1 = signalKeyForContradiction(
      makeContradiction({ subject: "CA", year: 2025, signals: [makeSignal("d_a", 1_000_000), makeSignal("d_b", 2_000_000)] })
    );
    const k2 = signalKeyForContradiction(
      makeContradiction({ subject: "CA", year: 2025, signals: [makeSignal("d_b", 2_000_000), makeSignal("d_a", 1_000_000)] })
    );
    expect(k1).toBe(k2);
  });

  it("evidence-set hash is sensitive to currency change (USD ≠ EUR for the same amount/doc)", () => {
    // If a doc's currency flips between runs (e.g. extraction picks
    // a different currency hint), that's a material change worth
    // re-surfacing.
    const eur = signalKeyForContradiction(
      makeContradiction({ subject: "CA", year: 2025, signals: [makeSignal("d_a", 1_000_000, "EUR")] })
    );
    const usd = signalKeyForContradiction(
      makeContradiction({ subject: "CA", year: 2025, signals: [makeSignal("d_a", 1_000_000, "USD")] })
    );
    expect(eur).not.toBe(usd);
  });

  it("B9.1.2 RED test: claim→actual transition on the same (docId, amount, currency) BREAKS the resolution", () => {
    // Codex B9.1.1 P1 follow-up: when a doc's classification flips
    // from `claim` to `actual` (e.g. after a sourceKind/documentType
    // correction), the contradiction becomes analytically more
    // severe (actual vs claim → HIGH instead of MEDIUM). The hash
    // MUST flip so the BA's previous IGNORED row no longer masks
    // the upgraded finding.
    const beforeCorrection = signalKeyForContradiction(
      makeContradiction({
        subject: "CA",
        year: 2025,
        signals: [
          makeSignal("d_a", 1_000_000, "EUR", "claim"),
          makeSignal("d_b", 2_000_000, "EUR", "claim"),
        ],
      })
    );
    const afterCorrection = signalKeyForContradiction(
      makeContradiction({
        subject: "CA",
        year: 2025,
        signals: [
          // d_a was re-classified from `claim` → `actual` after a
          // documentType/sourceKind edit.
          makeSignal("d_a", 1_000_000, "EUR", "actual"),
          makeSignal("d_b", 2_000_000, "EUR", "claim"),
        ],
      })
    );
    expect(beforeCorrection).not.toBe(afterCorrection);
  });

  it("B9.1.2 — classification flip on a SINGLE-doc evidence set also flips the key", () => {
    // Defensive — single-doc contradictions (intra-doc 1M vs 2M)
    // are also re-classified if the BA edits the type. Same
    // invariant.
    const claim = signalKeyForContradiction(
      makeContradiction({ subject: "CA", year: 2025, signals: [makeSignal("d_a", 1_000_000, "EUR", "claim")] })
    );
    const actual = signalKeyForContradiction(
      makeContradiction({ subject: "CA", year: 2025, signals: [makeSignal("d_a", 1_000_000, "EUR", "actual")] })
    );
    const forecast = signalKeyForContradiction(
      makeContradiction({ subject: "CA", year: 2025, signals: [makeSignal("d_a", 1_000_000, "EUR", "forecast")] })
    );
    expect(claim).not.toBe(actual);
    expect(claim).not.toBe(forecast);
    expect(actual).not.toBe(forecast);
  });

  it("empty signals[] → 'noevidence' sentinel hash (defensive, predictable)", () => {
    const k = signalKeyForContradiction(makeContradiction({ subject: "CA", year: 2025, signals: [] }));
    expect(k.endsWith(":noevidence")).toBe(true);
    expect(parseSignalKey(k)?.kind).toBe("contradiction");
  });
});

// ----------------------------------------------------------------
// Missing key
// ----------------------------------------------------------------

describe("signalKeyForMissing — deal-level vs per-doc", () => {
  it("deal-level (documentId=null) → 'missing:KIND' (no doc segment)", () => {
    const k = signalKeyForMissing({ kind: "NO_FINANCIAL_STATEMENTS" }, null);
    expect(k).toBe("missing:NO_FINANCIAL_STATEMENTS");
  });

  it("per-doc → 'missing:KIND:DOC_ID'", () => {
    const k = signalKeyForMissing({ kind: "NO_PITCH_DECK_DATE" }, "doc_42");
    expect(k).toBe("missing:NO_PITCH_DECK_DATE:doc_42");
  });

  it("deal-level and per-doc are distinct (one BA resolution should NOT cover both)", () => {
    expect(signalKeyForMissing({ kind: "NO_CAP_TABLE_AS_OF" }, null)).not.toBe(
      signalKeyForMissing({ kind: "NO_CAP_TABLE_AS_OF" }, "doc_x")
    );
  });
});

// ----------------------------------------------------------------
// Freshness key
// ----------------------------------------------------------------

describe("signalKeyForFreshness — always per-doc", () => {
  it("returns 'freshness:KIND:DOC_ID'", () => {
    expect(signalKeyForFreshness("cap_table_stale", "doc_a")).toBe("freshness:cap_table_stale:doc_a");
  });

  it("two docs with the same kind produce DIFFERENT keys (no mass-resolve)", () => {
    expect(signalKeyForFreshness("balance_sheet_stale", "doc_a")).not.toBe(
      signalKeyForFreshness("balance_sheet_stale", "doc_b")
    );
  });
});

// ----------------------------------------------------------------
// parseSignalKey — strict shape validation
// ----------------------------------------------------------------

describe("parseSignalKey — strict shape validation", () => {
  it("rejects unknown prefix", () => {
    expect(parseSignalKey("unknown:foo")).toBeNull();
  });

  it("rejects oversized input (> 512 chars)", () => {
    expect(parseSignalKey("contradiction:" + "x".repeat(600))).toBeNull();
  });

  it("rejects empty string", () => {
    expect(parseSignalKey("")).toBeNull();
  });

  it("rejects non-string input via isValidSignalKey", () => {
    expect(isValidSignalKey(42)).toBe(false);
    expect(isValidSignalKey(null)).toBe(false);
    expect(isValidSignalKey(undefined)).toBe(false);
    expect(isValidSignalKey({})).toBe(false);
  });

  it("rejects contradiction with wrong segment count", () => {
    expect(parseSignalKey("contradiction:METRIC_MISMATCH:SUBJECT")).toBeNull(); // 2 segments
    expect(parseSignalKey("contradiction:METRIC_MISMATCH:SUBJECT:2026")).toBeNull(); // 3 segments (missing hash)
    expect(
      parseSignalKey("contradiction:METRIC_MISMATCH:SUBJECT:2026:abcd1234abcd1234:EXTRA")
    ).toBeNull(); // 5 segments
  });

  it("rejects contradiction with non-numeric year (not 'undated')", () => {
    expect(parseSignalKey("contradiction:METRIC_MISMATCH:SUBJECT:notayear:abcd1234abcd1234")).toBeNull();
  });

  it("rejects contradiction with invalid evidence hash (not hex, not 'noevidence')", () => {
    expect(parseSignalKey("contradiction:METRIC_MISMATCH:CA:2025:NOPE")).toBeNull();
    expect(parseSignalKey("contradiction:METRIC_MISMATCH:CA:2025:")).toBeNull();
    // Wrong length (15 hex chars instead of 16) → reject.
    expect(parseSignalKey("contradiction:METRIC_MISMATCH:CA:2025:abcd1234abcd123")).toBeNull();
  });

  it("rejects empty kind / subject after split", () => {
    expect(parseSignalKey("contradiction::SUBJECT:2026:abcd1234abcd1234")).toBeNull();
    expect(parseSignalKey("contradiction:METRIC_MISMATCH::2026:abcd1234abcd1234")).toBeNull();
    expect(parseSignalKey("missing:")).toBeNull();
    expect(parseSignalKey("freshness:cap_table_stale:")).toBeNull();
  });

  it("accepts known shapes and round-trips identity", () => {
    expect(parseSignalKey("missing:NO_FINANCIAL_STATEMENTS")).toEqual({
      kind: "missing",
      missingKind: "NO_FINANCIAL_STATEMENTS",
      documentId: null,
    });
    expect(parseSignalKey("missing:NO_PITCH_DECK_DATE:doc_42")).toEqual({
      kind: "missing",
      missingKind: "NO_PITCH_DECK_DATE",
      documentId: "doc_42",
    });
    expect(parseSignalKey("freshness:cap_table_stale:doc_a")).toEqual({
      kind: "freshness",
      freshnessKind: "cap_table_stale",
      documentId: "doc_a",
    });
  });

  it("roundtrips contradictions with escaped colons in subject", () => {
    const key = signalKeyForContradiction(
      makeContradiction({ subject: "ratio:ARR", year: 2026, signals: TWO_SIGNALS })
    );
    const parsed = parseSignalKey(key);
    expect(parsed?.kind).toBe("contradiction");
    if (parsed?.kind === "contradiction") {
      expect(parsed.contradictionKind).toBe("METRIC_MISMATCH");
      expect(parsed.subject).toBe("ratio:ARR");
      expect(parsed.year).toBe(2026);
    }
  });
});

// ----------------------------------------------------------------
// B9.1.1 (Codex B9.1 P2) — enum allow-list validation
// ----------------------------------------------------------------

describe("parseSignalKey — kind enum validation (B9.1.1, Codex B9.1 P2)", () => {
  it("rejects unknown contradiction kind (no `missing:NOT_A_REAL_KIND` tombstones)", () => {
    expect(
      parseSignalKey("contradiction:NOT_A_REAL_KIND:CA:2025:abcd1234abcd1234")
    ).toBeNull();
    expect(
      parseSignalKey("contradiction:METRIC_MISMATCHX:CA:2025:abcd1234abcd1234")
    ).toBeNull();
  });

  it("rejects unknown missing kind", () => {
    expect(parseSignalKey("missing:NOT_A_REAL_KIND")).toBeNull();
    expect(parseSignalKey("missing:NOT_A_REAL_KIND:doc_x")).toBeNull();
    expect(parseSignalKey("missing:NO_PITCH_DECK_DATEX:doc_x")).toBeNull();
  });

  it("rejects unknown freshness kind", () => {
    expect(parseSignalKey("freshness:whatever:doc_x")).toBeNull();
    expect(parseSignalKey("freshness:cap_table_stalex:doc_x")).toBeNull();
  });

  it("accepts the three known contradiction kinds", () => {
    for (const kind of ["VALUATION_MISMATCH", "METRIC_MISMATCH", "CURRENCY_MISMATCH"]) {
      expect(parseSignalKey(`contradiction:${kind}:CA:2025:abcd1234abcd1234`)).not.toBeNull();
    }
  });

  it("accepts the four known missing kinds (deal-level + per-doc)", () => {
    for (const kind of ["NO_CAP_TABLE_AS_OF", "NO_FINANCIAL_STATEMENTS", "NO_FORECAST_PERIOD", "NO_PITCH_DECK_DATE"]) {
      expect(parseSignalKey(`missing:${kind}`)).not.toBeNull();
      expect(parseSignalKey(`missing:${kind}:doc_x`)).not.toBeNull();
    }
  });

  it("accepts the three known freshness kinds", () => {
    for (const kind of ["cap_table_stale", "balance_sheet_stale", "forecast_now_historical"]) {
      expect(parseSignalKey(`freshness:${kind}:doc_x`)).not.toBeNull();
    }
  });
});
