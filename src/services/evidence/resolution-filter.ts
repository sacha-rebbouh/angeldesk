/**
 * Phase B9.1 — Partition the EvidenceHealthBundle by resolution state.
 *
 * Given a bundle (live read of the deal's signals) and a list of user
 * resolutions (the overlay table), split into:
 *
 *   - active: { report, byDocument } — only signals WITHOUT a
 *     resolution row. The panel + per-doc badges consume this so the
 *     BA never sees a signal they already handled.
 *   - resolved: list of (signal, resolution) pairs the BA marked as
 *     resolved (e.g. "I uploaded the missing cap table").
 *   - ignored: list of (signal, resolution) pairs the BA explicitly
 *     dismissed (e.g. "the currency discrepancy here is expected").
 *
 * Orphan resolutions:
 *   A resolution whose signalKey no longer matches any current signal
 *   (the signal naturally disappeared — e.g. the deck was dated) is
 *   silently dropped from the output. It still lives in the DB until
 *   a maintenance pass prunes it (out of scope for B9), but it never
 *   leaks into the panel.
 *
 * Identity respects `signal-identity.ts` — see that module for the
 * Codex point of attention: the partition function MUST be pure and
 * never key by display text.
 */
import type {
  ContradictionFinding,
  DocumentHealthSummary,
  EvidenceHealthBundle,
  EvidenceHealthReport,
  EvidenceHealthSeverity,
  MissingEvidenceFinding,
} from "./health-report";
import type { StaleWarningKind } from "./build-evidence-context";
import {
  signalKeyForContradiction,
  signalKeyForFreshness,
  signalKeyForMissing,
} from "./signal-identity";

export type EvidenceSignalResolutionAction = "RESOLVED" | "IGNORED";

/**
 * Wire shape — matches the Prisma row but trimmed to the fields the
 * filter needs. Keeping it minimal lets unit tests construct
 * resolutions without dragging the whole Prisma type surface.
 */
export interface EvidenceResolutionRow {
  signalKey: string;
  action: EvidenceSignalResolutionAction;
  reason: string | null;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

// Per-signal flattened entry — what the panel's "Signaux traités"
// section iterates over. Discriminated union so the UI can route each
// item to the right rendering helper (missing label vs contradiction
// subject vs freshness doc).
export type ResolvedSignalEntry =
  | {
      kind: "contradiction";
      signalKey: string;
      action: EvidenceSignalResolutionAction;
      reason: string | null;
      resolvedAt: Date;
      contradiction: ContradictionFinding;
    }
  | {
      kind: "missing";
      signalKey: string;
      action: EvidenceSignalResolutionAction;
      reason: string | null;
      resolvedAt: Date;
      finding: MissingEvidenceFinding;
      /** Per-doc resolutions carry the affected document id; deal-level resolutions don't. */
      documentId: string | null;
    }
  | {
      kind: "freshness";
      signalKey: string;
      action: EvidenceSignalResolutionAction;
      reason: string | null;
      resolvedAt: Date;
      freshnessKind: StaleWarningKind;
      documentId: string;
      documentName: string;
      severity: EvidenceHealthSeverity;
    };

export interface PartitionedBundle {
  /**
   * The bundle with all RESOLVED + IGNORED signals removed. This is
   * what the panel renders + what per-doc badges count.
   *
   * Internal recompute rules:
   *   - report.contradictions: filtered.
   *   - report.missing: per-finding ALSO filtered by per-doc
   *     resolutions (a NO_PITCH_DECK_DATE finding with 3 affected
   *     docs of which the BA resolved 1 keeps the 2 unresolved in
   *     affectedDocumentIds). When ALL affected docs are resolved
   *     AND the finding has no deal-level component, the whole
   *     finding drops out.
   *   - report.freshness.countsByKind + total: recomputed from the
   *     filtered byDocument map.
   *   - byDocument: per-doc summaries are rebuilt so badges show only
   *     the active subset (contradiction count, missing entries,
   *     freshness entries).
   */
  active: EvidenceHealthBundle;
  /** Signals the BA marked RESOLVED. */
  resolved: ResolvedSignalEntry[];
  /** Signals the BA marked IGNORED. */
  ignored: ResolvedSignalEntry[];
}

export function partitionBundleByResolutions(
  bundle: EvidenceHealthBundle,
  resolutions: EvidenceResolutionRow[]
): PartitionedBundle {
  // Index resolutions by signalKey for O(1) lookups.
  const byKey = new Map<string, EvidenceResolutionRow>();
  for (const r of resolutions) byKey.set(r.signalKey, r);

  const resolved: ResolvedSignalEntry[] = [];
  const ignored: ResolvedSignalEntry[] = [];

  function bucket(entry: ResolvedSignalEntry, action: EvidenceSignalResolutionAction) {
    if (action === "RESOLVED") resolved.push(entry);
    else ignored.push(entry);
  }

  // --- 1) Contradictions
  const activeContradictions: ContradictionFinding[] = [];
  for (const c of bundle.report.contradictions) {
    const key = signalKeyForContradiction(c);
    const res = byKey.get(key);
    if (!res) {
      activeContradictions.push(c);
      continue;
    }
    bucket(
      {
        kind: "contradiction",
        signalKey: key,
        action: res.action,
        reason: res.reason,
        resolvedAt: res.updatedAt,
        contradiction: c,
      },
      res.action
    );
  }

  // --- 2) Missing
  const activeMissing: MissingEvidenceFinding[] = [];
  for (const m of bundle.report.missing) {
    // Deal-level findings (no affected docs) — single resolution covers everything.
    if (m.affectedDocumentIds.length === 0) {
      const key = signalKeyForMissing(m, null);
      const res = byKey.get(key);
      if (!res) {
        activeMissing.push(m);
        continue;
      }
      bucket(
        {
          kind: "missing",
          signalKey: key,
          action: res.action,
          reason: res.reason,
          resolvedAt: res.updatedAt,
          finding: m,
          documentId: null,
        },
        res.action
      );
      continue;
    }

    // Per-doc findings — split into "still-active" vs "resolved-per-doc".
    const stillActiveDocIds: string[] = [];
    for (const docId of m.affectedDocumentIds) {
      const key = signalKeyForMissing(m, docId);
      const res = byKey.get(key);
      if (!res) {
        stillActiveDocIds.push(docId);
        continue;
      }
      bucket(
        {
          kind: "missing",
          signalKey: key,
          action: res.action,
          reason: res.reason,
          resolvedAt: res.updatedAt,
          // Carry a single-doc copy of the finding so the panel's
          // "Signaux traités" section can label the specific doc that
          // was resolved, not the whole aggregate.
          finding: { ...m, affectedDocumentIds: [docId] },
          documentId: docId,
        },
        res.action
      );
    }
    if (stillActiveDocIds.length > 0) {
      activeMissing.push({ ...m, affectedDocumentIds: stillActiveDocIds });
    }
  }

  // --- 3) Freshness (per-doc)
  // Rebuild byDocument entirely so per-doc badges drop the resolved
  // freshness entries AND the resolved missing entries AND the
  // contradictions whose ONLY contributors were resolved. The original
  // byDocument map is used as a name+type cache + initial freshness
  // list source.
  const activeByDocument: Record<string, DocumentHealthSummary> = {};
  for (const [docId, summary] of Object.entries(bundle.byDocument)) {
    // Filter freshness entries on this doc.
    const remainingFreshness: DocumentHealthSummary["freshness"] = [];
    for (const f of summary.freshness) {
      const key = signalKeyForFreshness(f.kind, docId);
      const res = byKey.get(key);
      if (!res) {
        remainingFreshness.push(f);
        continue;
      }
      bucket(
        {
          kind: "freshness",
          signalKey: key,
          action: res.action,
          reason: res.reason,
          resolvedAt: res.updatedAt,
          freshnessKind: f.kind,
          documentId: docId,
          documentName: summary.documentName ?? "Document",
          severity: f.severity,
        },
        res.action
      );
    }

    // Filter missing entries on this doc by checking the per-doc key.
    const remainingMissing: DocumentHealthSummary["missing"] = [];
    for (const me of summary.missing) {
      const key = signalKeyForMissing({ kind: me.kind }, docId);
      if (!byKey.has(key)) remainingMissing.push(me);
    }

    activeByDocument[docId] = {
      ...summary,
      missing: remainingMissing,
      freshness: remainingFreshness,
    };
  }

  // Tally contradictions per doc from the FILTERED contradiction list
  // (badge logic mirrors buildPerDocumentSummary). Reset counts +
  // highest-severity for each doc, then re-walk.
  for (const docId of Object.keys(activeByDocument)) {
    const bucketSummary = activeByDocument[docId];
    bucketSummary.contradictionCount = 0;
    bucketSummary.highestContradictionSeverity = null;
  }
  for (const c of activeContradictions) {
    const touchedDocs = new Set<string>();
    for (const s of c.signals) touchedDocs.add(s.documentId);
    for (const docId of touchedDocs) {
      const bucketSummary = activeByDocument[docId];
      if (!bucketSummary) continue;
      bucketSummary.contradictionCount += 1;
      if (
        bucketSummary.highestContradictionSeverity === null ||
        severityRank(c.severity) > severityRank(bucketSummary.highestContradictionSeverity)
      ) {
        bucketSummary.highestContradictionSeverity = c.severity;
      }
    }
  }

  // Recompute freshness rollup counts from the filtered byDocument.
  const countsByKind: Record<StaleWarningKind, number> = {
    cap_table_stale: 0,
    balance_sheet_stale: 0,
    forecast_now_historical: 0,
  };
  let total = 0;
  for (const summary of Object.values(activeByDocument)) {
    for (const f of summary.freshness) {
      countsByKind[f.kind] = (countsByKind[f.kind] ?? 0) + 1;
      total += 1;
    }
  }

  const activeReport: EvidenceHealthReport = {
    contradictions: activeContradictions,
    missing: activeMissing,
    freshness: { countsByKind, total },
  };

  return {
    active: { report: activeReport, byDocument: activeByDocument },
    resolved,
    ignored,
  };
}

function severityRank(s: EvidenceHealthSeverity): number {
  return s === "HIGH" ? 3 : s === "MEDIUM" ? 2 : 1;
}

/**
 * Phase B9.2.1 (Codex B9.2 P1) — enumerate every signal key currently
 * visible in a bundle.
 *
 * Used by the resolutions API POST handler to refuse `signal_not_active`
 * keys BEFORE writing the row. Pre-fix, a client could pre-emptively
 * write `freshness:balance_sheet_stale:<docId>` for a signal that
 * doesn't exist yet — the partition filter would then silently mask
 * it the moment it appeared.
 *
 * Mirrors exactly the enumeration `partitionBundleByResolutions` does
 * itself (every key it looks up is yielded here), so the two sides
 * stay in sync: a key that would have been matched by the filter
 * SHOULD also be acceptable by POST, and vice-versa.
 *
 * Pure: takes a bundle, returns a Set of strings. No I/O.
 */
export function enumerateBundleSignalKeys(bundle: EvidenceHealthBundle): Set<string> {
  const out = new Set<string>();

  // 1. Contradictions — each finding contributes one key (B9.1.1 hash
  //    closes the "stale set" trap).
  for (const c of bundle.report.contradictions) {
    out.add(signalKeyForContradiction(c));
  }

  // 2. Missing — deal-level and per-doc each get a key. Same split
  //    rule as the filter (`affectedDocumentIds.length === 0` → 1
  //    deal-level key; else 1 per affected doc).
  for (const m of bundle.report.missing) {
    if (m.affectedDocumentIds.length === 0) {
      out.add(signalKeyForMissing(m, null));
      continue;
    }
    for (const docId of m.affectedDocumentIds) {
      out.add(signalKeyForMissing(m, docId));
    }
  }

  // 3. Freshness — per-doc, one key per (kind, docId).
  for (const [docId, summary] of Object.entries(bundle.byDocument)) {
    for (const f of summary.freshness) {
      out.add(signalKeyForFreshness(f.kind, docId));
    }
  }

  return out;
}
