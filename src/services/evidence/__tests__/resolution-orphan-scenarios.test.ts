/**
 * Phase B9.4 — End-to-end orphan-resolution scenarios (pure).
 *
 * The B9 chain has THREE moving parts:
 *   1. The user resolves / ignores a signal → POST /resolutions
 *      stores a row, the bundle key shifts the signal from active to
 *      "Signaux traités".
 *   2. A separate mutation (metadata-edit, upload, polling) updates
 *      the underlying corpus → some signals appear, some disappear.
 *   3. The bundle refetch re-runs `partitionBundleByResolutions`.
 *      Resolutions whose signal disappeared become ORPHAN — they
 *      must silently drop from BOTH the active and the treated
 *      sections (the BA shouldn't see "Signaux traités: cap table
 *      périmée" after the cap table was actually replaced).
 *
 * These tests exercise the chain at the partition level — the only
 * place where the orphan invariant lives. The route + hook + panel
 * paths are covered by their dedicated tests.
 */
import { describe, expect, it } from "vitest";

import {
  partitionBundleByResolutions,
  signalKeyForContradiction,
  signalKeyForFreshness,
  signalKeyForMissing,
  type ContradictionFinding,
  type DocumentHealthSummary,
  type EvidenceHealthBundle,
  type EvidenceResolutionRow,
  type MissingEvidenceFinding,
} from "@/services/evidence";

// ----------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------

const T_RESOLVE = new Date("2026-05-19T08:00:00Z");

function makeSummary(
  name: string,
  freshness: DocumentHealthSummary["freshness"] = []
): DocumentHealthSummary {
  return {
    contradictionCount: 0,
    highestContradictionSeverity: null,
    missing: [],
    freshness,
    documentName: name,
    documentType: "PITCH_DECK",
  };
}

function makeBundle(overrides: Partial<EvidenceHealthBundle> = {}): EvidenceHealthBundle {
  return {
    report: {
      contradictions: [],
      missing: [],
      freshness: {
        countsByKind: { cap_table_stale: 0, balance_sheet_stale: 0, forecast_now_historical: 0 },
        total: 0,
      },
      ...overrides.report,
    },
    byDocument: overrides.byDocument ?? {},
  };
}

function makeContradiction(
  partial: Partial<ContradictionFinding> & {
    subject: string;
    signals: ContradictionFinding["signals"];
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

function makeResolution(signalKey: string, action: "RESOLVED" | "IGNORED" = "RESOLVED"): EvidenceResolutionRow {
  return {
    signalKey,
    action,
    reason: null,
    userId: "u_owner",
    createdAt: T_RESOLVE,
    updatedAt: T_RESOLVE,
  };
}

// ----------------------------------------------------------------
// Scenario A — Freshness: BA resolves "cap_table_stale", then uploads
// a fresher cap table → old freshness signal disappears.
// ----------------------------------------------------------------

describe("B9.4 scenario A — freshness resolved, then signal cleared by upload", () => {
  const docId = "d_captable";

  const bundleBefore: EvidenceHealthBundle = {
    report: {
      contradictions: [],
      missing: [],
      freshness: {
        countsByKind: { cap_table_stale: 1, balance_sheet_stale: 0, forecast_now_historical: 0 },
        total: 1,
      },
    },
    byDocument: {
      [docId]: makeSummary("captable.xlsx", [{ kind: "cap_table_stale", severity: "HIGH" }]),
    },
  };

  const resolution = makeResolution(signalKeyForFreshness("cap_table_stale", docId), "RESOLVED");

  it("step 1: resolution moves the signal from active to `resolved`", () => {
    const out = partitionBundleByResolutions(bundleBefore, [resolution]);
    expect(out.active.byDocument[docId].freshness).toEqual([]);
    expect(out.resolved).toHaveLength(1);
    expect(out.active.report.freshness.total).toBe(0);
  });

  it("step 2: upload-driven recompute drops the signal → resolution becomes ORPHAN, dropped from both lists", () => {
    // After uploading a fresher cap table, the freshness signal no
    // longer appears in the bundle. The BA's stale RESOLVED row is
    // still in the DB but the partition must NOT surface it in
    // "Signaux traités" anymore — the underlying problem is no
    // longer relevant.
    const bundleAfter = makeBundle({
      byDocument: { [docId]: makeSummary("captable.xlsx", []) },
    });
    const out = partitionBundleByResolutions(bundleAfter, [resolution]);
    expect(out.active.byDocument[docId].freshness).toEqual([]);
    expect(out.resolved).toEqual([]); // ORPHAN dropped
    expect(out.ignored).toEqual([]);
  });
});

// ----------------------------------------------------------------
// Scenario B — Missing: BA ignores deal-level NO_FINANCIAL_STATEMENTS,
// then uploads a FINANCIAL_STATEMENTS doc → the missing finding
// disappears entirely.
// ----------------------------------------------------------------

describe("B9.4 scenario B — deal-level missing ignored, then signal cleared by upload", () => {
  const m = makeMissing({ kind: "NO_FINANCIAL_STATEMENTS" });
  const bundleBefore: EvidenceHealthBundle = makeBundle({
    report: {
      contradictions: [],
      missing: [m],
      freshness: {
        countsByKind: { cap_table_stale: 0, balance_sheet_stale: 0, forecast_now_historical: 0 },
        total: 0,
      },
    },
  });
  const resolution = makeResolution(signalKeyForMissing(m, null), "IGNORED");

  it("step 1: ignored moves the missing finding to `ignored`, drops from active", () => {
    const out = partitionBundleByResolutions(bundleBefore, [resolution]);
    expect(out.active.report.missing).toEqual([]);
    expect(out.ignored).toHaveLength(1);
  });

  it("step 2: upload of FINANCIAL_STATEMENTS clears the finding → resolution becomes ORPHAN, dropped", () => {
    // The deal now has financial statements. The pre-existing IGNORED
    // row no longer applies — must not appear in "Signaux traités".
    const bundleAfter = makeBundle(); // empty: no missing finding
    const out = partitionBundleByResolutions(bundleAfter, [resolution]);
    expect(out.active.report.missing).toEqual([]);
    expect(out.resolved).toEqual([]);
    expect(out.ignored).toEqual([]);
  });
});

// ----------------------------------------------------------------
// Scenario C — Per-doc missing: BA resolves ONE undated deck, then
// dates the deck → that specific per-doc resolution becomes orphan,
// the OTHER undated decks still surface.
// ----------------------------------------------------------------

describe("B9.4 scenario C — per-doc missing resolution, then metadata-edit clears it", () => {
  const m = makeMissing({
    kind: "NO_PITCH_DECK_DATE",
    affectedDocumentIds: ["d_deck_a", "d_deck_b", "d_deck_c"],
  });
  const bundleBefore: EvidenceHealthBundle = {
    report: {
      contradictions: [],
      missing: [m],
      freshness: {
        countsByKind: { cap_table_stale: 0, balance_sheet_stale: 0, forecast_now_historical: 0 },
        total: 0,
      },
    },
    byDocument: {
      d_deck_a: { ...makeSummary("a.pdf"), missing: [{ kind: "NO_PITCH_DECK_DATE", severity: "LOW" }] },
      d_deck_b: { ...makeSummary("b.pdf"), missing: [{ kind: "NO_PITCH_DECK_DATE", severity: "LOW" }] },
      d_deck_c: { ...makeSummary("c.pdf"), missing: [{ kind: "NO_PITCH_DECK_DATE", severity: "LOW" }] },
    },
  };
  const resolution = makeResolution(signalKeyForMissing(m, "d_deck_a"));

  it("step 1: resolving deck A leaves B and C still flagged + entry in resolved", () => {
    const out = partitionBundleByResolutions(bundleBefore, [resolution]);
    expect(out.active.report.missing[0].affectedDocumentIds).toEqual(["d_deck_b", "d_deck_c"]);
    expect(out.resolved).toHaveLength(1);
  });

  it("step 2: deck A's metadata-edit clears its missing entry → resolution becomes ORPHAN, dropped", () => {
    // Deck A is now dated → it's no longer in `affectedDocumentIds`
    // for the next bundle build. The per-doc resolution's signalKey
    // (missing:NO_PITCH_DECK_DATE:d_deck_a) no longer matches.
    const bundleAfter: EvidenceHealthBundle = {
      report: {
        contradictions: [],
        missing: [{ ...m, affectedDocumentIds: ["d_deck_b", "d_deck_c"] }],
        freshness: {
          countsByKind: { cap_table_stale: 0, balance_sheet_stale: 0, forecast_now_historical: 0 },
          total: 0,
        },
      },
      byDocument: {
        d_deck_a: { ...makeSummary("a.pdf"), missing: [] }, // resolved server-side
        d_deck_b: { ...makeSummary("b.pdf"), missing: [{ kind: "NO_PITCH_DECK_DATE", severity: "LOW" }] },
        d_deck_c: { ...makeSummary("c.pdf"), missing: [{ kind: "NO_PITCH_DECK_DATE", severity: "LOW" }] },
      },
    };
    const out = partitionBundleByResolutions(bundleAfter, [resolution]);
    // B + C still active.
    expect(out.active.report.missing[0].affectedDocumentIds).toEqual(["d_deck_b", "d_deck_c"]);
    // Orphan resolution: NOT in resolved/ignored anymore.
    expect(out.resolved).toEqual([]);
    expect(out.ignored).toEqual([]);
  });
});

// ----------------------------------------------------------------
// Scenario D — Contradiction: BA ignores `Valorisation 2025 = 5M vs 8M`,
// then NEW doc adds a third value → resolution becomes orphan because
// the evidence-set hash changes (B9.1.1 invariant).
// ----------------------------------------------------------------

describe("B9.4 scenario D — contradiction ignored, then new evidence joins → resolution stops masking", () => {
  function makeSignal(documentId: string, amount: number) {
    return {
      documentId,
      documentName: `${documentId}.pdf`,
      documentType: "PITCH_DECK" as const,
      classification: "claim" as const,
      amount,
      currency: "EUR" as const,
      signalId: `s_${documentId}_${amount}`,
    };
  }

  const c2sig = makeContradiction({
    subject: "VALUATION",
    year: 2025,
    signals: [makeSignal("d_deck", 5_000_000), makeSignal("d_term", 8_000_000)],
  });
  const c3sig = makeContradiction({
    subject: "VALUATION",
    year: 2025,
    signals: [
      makeSignal("d_deck", 5_000_000),
      makeSignal("d_term", 8_000_000),
      makeSignal("d_memo", 12_000_000),
    ],
  });

  const ignoredOriginal = makeResolution(signalKeyForContradiction(c2sig), "IGNORED");

  it("step 1: ignored on the 2-signal contradiction → drops from active, surfaces in ignored", () => {
    const bundle: EvidenceHealthBundle = makeBundle({
      report: {
        contradictions: [c2sig],
        missing: [],
        freshness: {
          countsByKind: { cap_table_stale: 0, balance_sheet_stale: 0, forecast_now_historical: 0 },
          total: 0,
        },
      },
      byDocument: { d_deck: makeSummary("d_deck.pdf"), d_term: makeSummary("d_term.pdf") },
    });
    const out = partitionBundleByResolutions(bundle, [ignoredOriginal]);
    expect(out.active.report.contradictions).toEqual([]);
    expect(out.ignored).toHaveLength(1);
  });

  it("step 2: 3rd signal joins → new evidence hash → resolution orphan + new contradiction visible (Codex B9.1.1 invariant)", () => {
    const bundle: EvidenceHealthBundle = makeBundle({
      report: {
        contradictions: [c3sig],
        missing: [],
        freshness: {
          countsByKind: { cap_table_stale: 0, balance_sheet_stale: 0, forecast_now_historical: 0 },
          total: 0,
        },
      },
      byDocument: {
        d_deck: makeSummary("d_deck.pdf"),
        d_term: makeSummary("d_term.pdf"),
        d_memo: makeSummary("d_memo.pdf"),
      },
    });
    const out = partitionBundleByResolutions(bundle, [ignoredOriginal]);
    // New contradiction (3 signals) is in ACTIVE — the BA must see it.
    expect(out.active.report.contradictions).toEqual([c3sig]);
    // Old 2-signal resolution is orphan → dropped from both buckets.
    expect(out.resolved).toEqual([]);
    expect(out.ignored).toEqual([]);
  });
});
