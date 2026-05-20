/**
 * Phase B9.1 — Resolution filter (partition) tests.
 *
 * Codex invariants exercised here:
 *   - Resolved/ignored signals are REMOVED from `active.report` and
 *     `active.byDocument`. Badges + counts reflect the active subset.
 *   - Orphan resolutions (signalKey no longer matches any signal) do
 *     NOT appear anywhere in the output — they're silently dropped.
 *   - Per-doc missing findings split correctly: resolving 1 of N
 *     affected docs leaves the finding with N-1.
 *   - Deal-level missing findings (no affected docs) are an
 *     all-or-nothing resolution.
 *   - Contradiction badges per doc reset before re-tallying.
 *   - Freshness rollup counts recompute from the filtered byDocument.
 */
import { describe, expect, it } from "vitest";

import {
  enumerateBundleSignalKeys,
  partitionBundleByResolutions,
  signalKeyForContradiction,
  signalKeyForFreshness,
  signalKeyForMissing,
  type EvidenceHealthBundle,
  type ContradictionFinding,
  type DocumentHealthSummary,
  type EvidenceResolutionRow,
  type MissingEvidenceFinding,
} from "@/services/evidence";

// ----------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------
const T0 = new Date("2026-05-19T00:00:00Z");
const T1 = new Date("2026-05-19T08:30:00Z");

function makeSummary(
  name: string,
  freshness: DocumentHealthSummary["freshness"] = [],
  missing: DocumentHealthSummary["missing"] = []
): DocumentHealthSummary {
  return {
    contradictionCount: 0,
    highestContradictionSeverity: null,
    missing,
    freshness,
    documentName: name,
    documentType: "PITCH_DECK",
  };
}

function makeContradiction(
  partial: Partial<ContradictionFinding> & { subject: string }
): ContradictionFinding {
  return {
    kind: "METRIC_MISMATCH",
    year: 2025,
    severity: "HIGH",
    reason: "reason",
    spreadRatio: 1.5,
    signals: [
      {
        documentId: "d_a",
        documentName: "a.pdf",
        documentType: "PITCH_DECK",
        classification: "claim",
        amount: 1_000_000,
        currency: "EUR",
        signalId: "s_a",
      },
      {
        documentId: "d_b",
        documentName: "b.pdf",
        documentType: "FINANCIAL_STATEMENTS",
        classification: "actual",
        amount: 2_000_000,
        currency: "EUR",
        signalId: "s_b",
      },
    ],
    ...partial,
  };
}

function makeMissing(
  partial: Partial<MissingEvidenceFinding> & { kind: MissingEvidenceFinding["kind"] }
): MissingEvidenceFinding {
  return {
    severity: "MEDIUM",
    message: "msg",
    affectedDocumentIds: [],
    ...partial,
  };
}

function makeRes(signalKey: string, action: "RESOLVED" | "IGNORED" = "RESOLVED"): EvidenceResolutionRow {
  return {
    signalKey,
    action,
    reason: null,
    userId: "u_owner",
    createdAt: T0,
    updatedAt: T1,
  };
}

function emptyBundle(): EvidenceHealthBundle {
  return {
    report: {
      contradictions: [],
      missing: [],
      freshness: { countsByKind: { cap_table_stale: 0, balance_sheet_stale: 0, forecast_now_historical: 0 }, total: 0 },
    },
    byDocument: {},
  };
}

// ----------------------------------------------------------------
// Empty / no-op cases
// ----------------------------------------------------------------

describe("partitionBundleByResolutions — no-op cases", () => {
  it("empty bundle + no resolutions → identical empty bundle, no resolved/ignored", () => {
    const out = partitionBundleByResolutions(emptyBundle(), []);
    expect(out.active.report.contradictions).toEqual([]);
    expect(out.active.report.missing).toEqual([]);
    expect(out.active.report.freshness.total).toBe(0);
    expect(out.active.byDocument).toEqual({});
    expect(out.resolved).toEqual([]);
    expect(out.ignored).toEqual([]);
  });

  it("bundle with signals but no resolutions → identical bundle, no resolved/ignored", () => {
    const c = makeContradiction({ subject: "CA" });
    const bundle: EvidenceHealthBundle = {
      report: {
        contradictions: [c],
        missing: [makeMissing({ kind: "NO_FINANCIAL_STATEMENTS" })],
        freshness: { countsByKind: { cap_table_stale: 1, balance_sheet_stale: 0, forecast_now_historical: 0 }, total: 1 },
      },
      byDocument: {
        d_a: makeSummary("a.pdf", [{ kind: "cap_table_stale", severity: "HIGH" }]),
        d_b: makeSummary("b.pdf"),
      },
    };
    const out = partitionBundleByResolutions(bundle, []);
    expect(out.active.report.contradictions).toHaveLength(1);
    expect(out.active.report.missing).toHaveLength(1);
    expect(out.active.report.freshness.total).toBe(1);
    expect(out.resolved).toEqual([]);
    expect(out.ignored).toEqual([]);
  });

  it("orphan resolution (key matches no live signal) → silently dropped", () => {
    const out = partitionBundleByResolutions(emptyBundle(), [makeRes("missing:NO_FINANCIAL_STATEMENTS")]);
    expect(out.resolved).toEqual([]);
    expect(out.ignored).toEqual([]);
    expect(out.active.report.missing).toEqual([]);
  });
});

// ----------------------------------------------------------------
// Contradictions
// ----------------------------------------------------------------

describe("partitionBundleByResolutions — contradictions", () => {
  it("RESOLVED contradiction → dropped from active, surfaces in `resolved` with the full finding", () => {
    const c = makeContradiction({ subject: "VALUATION", year: 2025, severity: "HIGH" });
    const bundle: EvidenceHealthBundle = {
      report: {
        contradictions: [c],
        missing: [],
        freshness: { countsByKind: { cap_table_stale: 0, balance_sheet_stale: 0, forecast_now_historical: 0 }, total: 0 },
      },
      byDocument: { d_a: makeSummary("a.pdf"), d_b: makeSummary("b.pdf") },
    };
    const key = signalKeyForContradiction(c);
    const out = partitionBundleByResolutions(bundle, [makeRes(key, "RESOLVED")]);
    expect(out.active.report.contradictions).toEqual([]);
    expect(out.resolved).toHaveLength(1);
    expect(out.resolved[0].kind).toBe("contradiction");
    if (out.resolved[0].kind === "contradiction") {
      expect(out.resolved[0].contradiction).toBe(c);
      expect(out.resolved[0].action).toBe("RESOLVED");
    }
    // Per-doc badge for d_a and d_b loses the contradiction count.
    expect(out.active.byDocument.d_a.contradictionCount).toBe(0);
    expect(out.active.byDocument.d_a.highestContradictionSeverity).toBeNull();
    expect(out.active.byDocument.d_b.contradictionCount).toBe(0);
  });

  it("IGNORED contradiction → routed to `ignored` (not `resolved`), same removal from active", () => {
    const c = makeContradiction({ subject: "ARR", year: 2026 });
    const bundle: EvidenceHealthBundle = {
      report: {
        contradictions: [c],
        missing: [],
        freshness: { countsByKind: { cap_table_stale: 0, balance_sheet_stale: 0, forecast_now_historical: 0 }, total: 0 },
      },
      byDocument: { d_a: makeSummary("a.pdf"), d_b: makeSummary("b.pdf") },
    };
    const out = partitionBundleByResolutions(bundle, [makeRes(signalKeyForContradiction(c), "IGNORED")]);
    expect(out.active.report.contradictions).toEqual([]);
    expect(out.resolved).toEqual([]);
    expect(out.ignored).toHaveLength(1);
    expect(out.ignored[0].action).toBe("IGNORED");
  });

  it("resolving ONE of several contradictions leaves the others untouched", () => {
    const c1 = makeContradiction({ subject: "CA", year: 2025 });
    const c2 = makeContradiction({ subject: "ARR", year: 2025 });
    const bundle: EvidenceHealthBundle = {
      report: {
        contradictions: [c1, c2],
        missing: [],
        freshness: { countsByKind: { cap_table_stale: 0, balance_sheet_stale: 0, forecast_now_historical: 0 }, total: 0 },
      },
      byDocument: { d_a: makeSummary("a.pdf"), d_b: makeSummary("b.pdf") },
    };
    const out = partitionBundleByResolutions(bundle, [makeRes(signalKeyForContradiction(c1))]);
    expect(out.active.report.contradictions).toEqual([c2]);
    expect(out.resolved).toHaveLength(1);
    // c2 still contributes to the per-doc tally.
    expect(out.active.byDocument.d_a.contradictionCount).toBe(1);
    expect(out.active.byDocument.d_a.highestContradictionSeverity).toBe("HIGH");
  });
});

// ----------------------------------------------------------------
// Missing
// ----------------------------------------------------------------

describe("partitionBundleByResolutions — missing", () => {
  it("deal-level missing (affectedDocumentIds=[]) → single resolution covers the whole finding", () => {
    const m = makeMissing({ kind: "NO_FINANCIAL_STATEMENTS" });
    const bundle: EvidenceHealthBundle = {
      report: {
        contradictions: [],
        missing: [m],
        freshness: { countsByKind: { cap_table_stale: 0, balance_sheet_stale: 0, forecast_now_historical: 0 }, total: 0 },
      },
      byDocument: {},
    };
    const out = partitionBundleByResolutions(bundle, [makeRes(signalKeyForMissing(m, null))]);
    expect(out.active.report.missing).toEqual([]);
    expect(out.resolved).toHaveLength(1);
    if (out.resolved[0].kind === "missing") {
      expect(out.resolved[0].documentId).toBeNull();
    }
  });

  it("per-doc missing: resolving 1 of 3 leaves the finding with the remaining 2 in affectedDocumentIds", () => {
    const m = makeMissing({
      kind: "NO_PITCH_DECK_DATE",
      affectedDocumentIds: ["d_a", "d_b", "d_c"],
    });
    const bundle: EvidenceHealthBundle = {
      report: {
        contradictions: [],
        missing: [m],
        freshness: { countsByKind: { cap_table_stale: 0, balance_sheet_stale: 0, forecast_now_historical: 0 }, total: 0 },
      },
      byDocument: {
        d_a: makeSummary("a.pdf", [], [{ kind: "NO_PITCH_DECK_DATE", severity: "LOW" }]),
        d_b: makeSummary("b.pdf", [], [{ kind: "NO_PITCH_DECK_DATE", severity: "LOW" }]),
        d_c: makeSummary("c.pdf", [], [{ kind: "NO_PITCH_DECK_DATE", severity: "LOW" }]),
      },
    };
    const out = partitionBundleByResolutions(bundle, [makeRes(signalKeyForMissing(m, "d_a"))]);
    expect(out.active.report.missing).toHaveLength(1);
    expect(out.active.report.missing[0].affectedDocumentIds).toEqual(["d_b", "d_c"]);
    expect(out.resolved).toHaveLength(1);
    if (out.resolved[0].kind === "missing") {
      expect(out.resolved[0].documentId).toBe("d_a");
      // Single-doc copy of the finding for the resolved row.
      expect(out.resolved[0].finding.affectedDocumentIds).toEqual(["d_a"]);
    }
    // Per-doc badge: d_a loses the missing entry, d_b/d_c keep it.
    expect(out.active.byDocument.d_a.missing).toEqual([]);
    expect(out.active.byDocument.d_b.missing).toHaveLength(1);
  });

  it("per-doc missing: resolving ALL affected docs drops the whole finding from active", () => {
    const m = makeMissing({
      kind: "NO_PITCH_DECK_DATE",
      affectedDocumentIds: ["d_a", "d_b"],
    });
    const bundle: EvidenceHealthBundle = {
      report: {
        contradictions: [],
        missing: [m],
        freshness: { countsByKind: { cap_table_stale: 0, balance_sheet_stale: 0, forecast_now_historical: 0 }, total: 0 },
      },
      byDocument: {
        d_a: makeSummary("a.pdf"),
        d_b: makeSummary("b.pdf"),
      },
    };
    const out = partitionBundleByResolutions(bundle, [
      makeRes(signalKeyForMissing(m, "d_a")),
      makeRes(signalKeyForMissing(m, "d_b")),
    ]);
    expect(out.active.report.missing).toEqual([]);
    expect(out.resolved).toHaveLength(2);
  });
});

// ----------------------------------------------------------------
// Freshness
// ----------------------------------------------------------------

describe("partitionBundleByResolutions — freshness", () => {
  it("resolving a freshness entry → drops from byDocument AND recomputes rollup counts", () => {
    const bundle: EvidenceHealthBundle = {
      report: {
        contradictions: [],
        missing: [],
        freshness: { countsByKind: { cap_table_stale: 1, balance_sheet_stale: 1, forecast_now_historical: 0 }, total: 2 },
      },
      byDocument: {
        d_a: makeSummary("a.pdf", [{ kind: "cap_table_stale", severity: "HIGH" }]),
        d_b: makeSummary("b.pdf", [{ kind: "balance_sheet_stale", severity: "MEDIUM" }]),
      },
    };
    const out = partitionBundleByResolutions(bundle, [
      makeRes(signalKeyForFreshness("cap_table_stale", "d_a"), "RESOLVED"),
    ]);
    expect(out.active.byDocument.d_a.freshness).toEqual([]);
    expect(out.active.byDocument.d_b.freshness).toHaveLength(1);
    expect(out.active.report.freshness.countsByKind).toEqual({
      cap_table_stale: 0,
      balance_sheet_stale: 1,
      forecast_now_historical: 0,
    });
    expect(out.active.report.freshness.total).toBe(1);
    expect(out.resolved).toHaveLength(1);
    expect(out.resolved[0].kind).toBe("freshness");
    if (out.resolved[0].kind === "freshness") {
      expect(out.resolved[0].documentId).toBe("d_a");
      expect(out.resolved[0].documentName).toBe("a.pdf");
      expect(out.resolved[0].freshnessKind).toBe("cap_table_stale");
      expect(out.resolved[0].severity).toBe("HIGH");
    }
  });

  it("two docs with the same freshness kind → resolving one does NOT mass-resolve the other", () => {
    const bundle: EvidenceHealthBundle = {
      report: {
        contradictions: [],
        missing: [],
        freshness: { countsByKind: { cap_table_stale: 2, balance_sheet_stale: 0, forecast_now_historical: 0 }, total: 2 },
      },
      byDocument: {
        d_a: makeSummary("a.pdf", [{ kind: "cap_table_stale", severity: "HIGH" }]),
        d_b: makeSummary("b.pdf", [{ kind: "cap_table_stale", severity: "HIGH" }]),
      },
    };
    const out = partitionBundleByResolutions(bundle, [
      makeRes(signalKeyForFreshness("cap_table_stale", "d_a")),
    ]);
    expect(out.active.byDocument.d_a.freshness).toEqual([]);
    expect(out.active.byDocument.d_b.freshness).toHaveLength(1);
    expect(out.active.report.freshness.total).toBe(1);
  });
});

// ----------------------------------------------------------------
// Reason / timestamps surfaced on the resolved entries
// ----------------------------------------------------------------

describe("partitionBundleByResolutions — resolution metadata surface", () => {
  it("carries through reason + updatedAt onto resolved/ignored entries (for UI display)", () => {
    const c = makeContradiction({ subject: "CA", year: 2025 });
    const bundle: EvidenceHealthBundle = {
      report: {
        contradictions: [c],
        missing: [],
        freshness: { countsByKind: { cap_table_stale: 0, balance_sheet_stale: 0, forecast_now_historical: 0 }, total: 0 },
      },
      byDocument: { d_a: makeSummary("a.pdf"), d_b: makeSummary("b.pdf") },
    };
    const res: EvidenceResolutionRow = {
      signalKey: signalKeyForContradiction(c),
      action: "IGNORED",
      reason: "Devises connues, comparé hors-DD",
      userId: "u_owner",
      createdAt: T0,
      updatedAt: T1,
    };
    const out = partitionBundleByResolutions(bundle, [res]);
    expect(out.ignored).toHaveLength(1);
    expect(out.ignored[0].reason).toBe("Devises connues, comparé hors-DD");
    expect(out.ignored[0].resolvedAt).toEqual(T1);
  });
});

// ----------------------------------------------------------------
// B9.2.1 (Codex B9.2 P1) — enumerateBundleSignalKeys
// ----------------------------------------------------------------

describe("enumerateBundleSignalKeys — covers exactly what partition matches", () => {
  it("empty bundle → empty set", () => {
    const set = enumerateBundleSignalKeys({
      report: { contradictions: [], missing: [], freshness: { countsByKind: { cap_table_stale: 0, balance_sheet_stale: 0, forecast_now_historical: 0 }, total: 0 } },
      byDocument: {},
    });
    expect(set.size).toBe(0);
  });

  it("includes contradiction keys (one per finding, with the B9.1.1 evidence hash)", () => {
    const c = makeContradiction({ subject: "CA", year: 2025 });
    const bundle: EvidenceHealthBundle = {
      report: {
        contradictions: [c],
        missing: [],
        freshness: { countsByKind: { cap_table_stale: 0, balance_sheet_stale: 0, forecast_now_historical: 0 }, total: 0 },
      },
      byDocument: { d_a: makeSummary("a.pdf"), d_b: makeSummary("b.pdf") },
    };
    const set = enumerateBundleSignalKeys(bundle);
    expect(set.has(signalKeyForContradiction(c))).toBe(true);
    expect(set.size).toBe(1);
  });

  it("includes per-doc missing keys (one per affected doc)", () => {
    const m = makeMissing({ kind: "NO_PITCH_DECK_DATE", affectedDocumentIds: ["d_a", "d_b"] });
    const bundle: EvidenceHealthBundle = {
      report: {
        contradictions: [],
        missing: [m],
        freshness: { countsByKind: { cap_table_stale: 0, balance_sheet_stale: 0, forecast_now_historical: 0 }, total: 0 },
      },
      byDocument: { d_a: makeSummary("a.pdf"), d_b: makeSummary("b.pdf") },
    };
    const set = enumerateBundleSignalKeys(bundle);
    expect(set.has(signalKeyForMissing(m, "d_a"))).toBe(true);
    expect(set.has(signalKeyForMissing(m, "d_b"))).toBe(true);
    // No deal-level key when per-doc keys exist.
    expect(set.has(signalKeyForMissing(m, null))).toBe(false);
    expect(set.size).toBe(2);
  });

  it("includes deal-level missing key when affectedDocumentIds is empty", () => {
    const m = makeMissing({ kind: "NO_FINANCIAL_STATEMENTS" });
    const bundle: EvidenceHealthBundle = {
      report: {
        contradictions: [],
        missing: [m],
        freshness: { countsByKind: { cap_table_stale: 0, balance_sheet_stale: 0, forecast_now_historical: 0 }, total: 0 },
      },
      byDocument: {},
    };
    const set = enumerateBundleSignalKeys(bundle);
    expect(set.has(signalKeyForMissing(m, null))).toBe(true);
    expect(set.size).toBe(1);
  });

  it("includes per-doc freshness keys (one per kind per doc)", () => {
    const bundle: EvidenceHealthBundle = {
      report: {
        contradictions: [],
        missing: [],
        freshness: { countsByKind: { cap_table_stale: 1, balance_sheet_stale: 1, forecast_now_historical: 0 }, total: 2 },
      },
      byDocument: {
        d_a: makeSummary("a.pdf", [{ kind: "cap_table_stale", severity: "HIGH" }]),
        d_b: makeSummary("b.pdf", [{ kind: "balance_sheet_stale", severity: "MEDIUM" }]),
      },
    };
    const set = enumerateBundleSignalKeys(bundle);
    expect(set.has(signalKeyForFreshness("cap_table_stale", "d_a"))).toBe(true);
    expect(set.has(signalKeyForFreshness("balance_sheet_stale", "d_b"))).toBe(true);
    expect(set.size).toBe(2);
  });

  it("anti-tombstone: a key NOT in any finding is NOT in the enumeration (the route uses this to 409)", () => {
    const bundle: EvidenceHealthBundle = {
      report: {
        contradictions: [],
        missing: [],
        freshness: { countsByKind: { cap_table_stale: 1, balance_sheet_stale: 0, forecast_now_historical: 0 }, total: 1 },
      },
      byDocument: {
        d_a: makeSummary("a.pdf", [{ kind: "cap_table_stale", severity: "HIGH" }]),
      },
    };
    const set = enumerateBundleSignalKeys(bundle);
    // A signalKey targeting an unrelated kind / doc must NOT appear.
    expect(set.has(signalKeyForFreshness("balance_sheet_stale", "d_a"))).toBe(false);
    expect(set.has(signalKeyForFreshness("cap_table_stale", "d_unknown"))).toBe(false);
    expect(set.has(signalKeyForMissing({ kind: "NO_FINANCIAL_STATEMENTS" }, null))).toBe(false);
  });
});
