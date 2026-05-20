/**
 * Phase B9.1 — Signal identity key.
 *
 * Codex point of attention: a resolution must NOT depend on a display
 * string. If the contradiction's `reason` changes wording, the key
 * MUST stay identical so the BA's "Marquer résolu" doesn't get wiped
 * out by a cosmetic re-render.
 *
 * B9.1.1 fix-up (Codex B9.1 P1): the contradiction key ALSO includes
 * a stable hash of the evidence set so that adding a NEW signal to
 * the contradiction breaks the resolution (the BA needs to look at
 * the new evidence). See `hashContradictionEvidenceSet` below.
 *
 * Design:
 *   Each signal kind defines an IDENTITY tuple. We serialise it into
 *   a short, opaque string with a discriminating prefix so two key
 *   spaces (contradiction vs missing vs freshness) never collide.
 *
 *   - contradiction → `contradiction:${kind}:${subject}:${year ?? "undated"}:${evidenceHash}`
 *   - missing per-doc → `missing:${kind}:${documentId}`
 *   - missing deal-level → `missing:${kind}` (no doc — e.g. NO_FINANCIAL_STATEMENTS)
 *   - freshness → `freshness:${kind}:${documentId}`
 *
 * Validation:
 *   Server-side, an inbound signalKey is parsed back via `parseSignalKey`
 *   so the route rejects malformed values BEFORE writing them to the
 *   database. Anti-fuzz: a client can't write
 *   `signalKey="DROP TABLE; --"` and have it persist as a logical key.
 *
 *   B9.1.1 fix-up (Codex B9.1 P2): the parser ALSO validates the kind
 *   segment against the known enum unions so a malicious or stale
 *   client can't write `missing:NOT_A_REAL_KIND` and create a
 *   tombstone that never matches any live signal.
 *
 * Stability invariants (anchored by tests in signal-identity.test.ts):
 *   1. Same finding → same key, regardless of render order, severity, reason.
 *   2. Different findings → different keys (kind + identity fields).
 *   3. New evidence joining a contradiction → key changes → the BA
 *      sees the contradiction again with the new signal in the mix.
 *   4. Re-extraction of the same content (new signalId rows, identical
 *      (documentId, amount, currency)) → key UNCHANGED → previous
 *      resolution still applies.
 *   5. Documents that move between findings (e.g. a deck gets dated) →
 *      the OLD per-doc key naturally disappears from the bundle next
 *      run, leaving its resolution as a tombstone. The bundle merger
 *      treats orphan resolutions as "no longer applies" — they don't
 *      show in the panel anymore (and a maintenance cron could prune
 *      them later, out of scope for B9).
 */
import { createHash } from "node:crypto";
import type {
  ContradictionFinding,
  ContradictionKind,
  ContradictionSignalRef,
  MissingEvidenceFinding,
  MissingEvidenceKind,
} from "./health-report";
import type { StaleWarningKind } from "./build-evidence-context";

// ============================================================
// Constraints — kept loose so a new signal kind doesn't require a
// migration; tight enough that the route's Zod parse can reject junk.
// ============================================================
const MAX_SIGNAL_KEY_LENGTH = 512;

const CONTRADICTION_PREFIX = "contradiction:";
const MISSING_PREFIX = "missing:";
const FRESHNESS_PREFIX = "freshness:";

// ============================================================
// B9.1.1 (Codex B9.1 P2) — enum allow-lists.
// Sets used by the parser to reject `missing:NOT_A_REAL_KIND`,
// `freshness:whatever:doc`, etc. Single source of truth — keep them
// in sync with the type unions in health-report.ts /
// build-evidence-context.ts when a new kind is added.
// ============================================================
const VALID_CONTRADICTION_KINDS: ReadonlySet<ContradictionKind> = new Set<ContradictionKind>([
  "VALUATION_MISMATCH",
  "METRIC_MISMATCH",
  "CURRENCY_MISMATCH",
]);

const VALID_MISSING_KINDS: ReadonlySet<MissingEvidenceKind> = new Set<MissingEvidenceKind>([
  "NO_CAP_TABLE_AS_OF",
  "NO_FINANCIAL_STATEMENTS",
  "NO_FORECAST_PERIOD",
  "NO_PITCH_DECK_DATE",
]);

const VALID_FRESHNESS_KINDS: ReadonlySet<StaleWarningKind> = new Set<StaleWarningKind>([
  "cap_table_stale",
  "balance_sheet_stale",
  "forecast_now_historical",
]);

/**
 * Build the signalKey for a contradiction finding.
 *
 * Identity tuple = (kind, subject, year, evidenceHash). Severity /
 * reason / spread ratio are NOT part of the key (cosmetic / derived
 * from the evidence). The evidenceHash is what closes Codex B9.1 P1:
 *
 *   - Resolving "Valorisation 2025 = 5M€ vs 8M€" must NOT mask a
 *     later "Valorisation 2025 = 5M€ vs 8M€ vs 12M€" — the evidence
 *     set materially changed, the BA needs to look again.
 *   - But re-extracting the SAME content (signalId rows get fresh
 *     cuids, identical (documentId, amount, currency)) MUST keep the
 *     resolution alive. The hash is built from the dedup tuple the
 *     health-report itself uses (see `detectContradictions`), so
 *     re-extraction is a no-op for the key.
 */
export function signalKeyForContradiction(
  c: Pick<ContradictionFinding, "kind" | "subject" | "year" | "signals">
): string {
  const yearKey = c.year !== null ? String(c.year) : "undated";
  const evidenceHash = hashContradictionEvidenceSet(c.signals);
  return `${CONTRADICTION_PREFIX}${c.kind}:${escapeSegment(c.subject)}:${yearKey}:${evidenceHash}`;
}

/**
 * Build a stable, short hex hash of the evidence set contributing to
 * a contradiction. Tuple basis = (documentId, amount, currency,
 * classification) — mirrors the dedup key the
 * `health-report.detectContradictions` function uses, AUGMENTED with
 * `classification` so a claim→actual transition (which materially
 * upgrades severity from MEDIUM to HIGH) breaks the previous
 * resolution.
 *
 * B9.1.2 fix-up (Codex B9.1.1 P1 follow-up):
 *   Scenario: two docs report CA 2025 = 1M vs 2M, both `claim` →
 *   MEDIUM contradiction, BA ignores. After a metadata correction
 *   one side becomes `actual` → analytically the contradiction is
 *   now HIGH (actual vs claim). Pre-fix, the hash was identical
 *   (same documentId/amount/currency) so the old IGNORED row kept
 *   masking the more-severe finding. Including classification in
 *   the tuple flips the hash → old resolution becomes orphan → BA
 *   sees the upgraded contradiction.
 *
 * Length: 16 hex chars (64 bits) — collision risk negligible at
 * per-deal scale.
 *
 * Empty `signals[]` defensive case → constant `noevidence` hash.
 * That state shouldn't happen in production (the panel skips
 * findings with no signals) but pins the key shape so the parser
 * stays predictable.
 */
function hashContradictionEvidenceSet(
  signals: ReadonlyArray<
    Pick<ContradictionSignalRef, "documentId" | "amount" | "currency" | "classification">
  >
): string {
  if (signals.length === 0) return "noevidence";
  const tuples = new Set<string>();
  for (const s of signals) {
    tuples.add(`${s.documentId}|${s.amount}|${s.currency ?? "?"}|${s.classification}`);
  }
  const sorted = Array.from(tuples).sort().join(",");
  return createHash("sha256").update(sorted).digest("hex").slice(0, 16);
}

/**
 * Build the signalKey for a missing-evidence finding.
 *
 * Two cases:
 *   - Per-doc (cap table without asOf, undated deck, financial model
 *     without forecast) → key = `missing:${kind}:${documentId}`. One
 *     resolution per affected doc, so adding/removing docs from the
 *     finding doesn't drop or merge unrelated resolutions.
 *   - Deal-level (NO_FINANCIAL_STATEMENTS when no FS at all, no cap
 *     table at all) → key = `missing:${kind}`. One resolution covers
 *     the entire deal-level finding.
 */
export function signalKeyForMissing(
  finding: Pick<MissingEvidenceFinding, "kind">,
  documentId: string | null
): string {
  if (documentId === null) return `${MISSING_PREFIX}${finding.kind}`;
  return `${MISSING_PREFIX}${finding.kind}:${escapeSegment(documentId)}`;
}

/**
 * Build the signalKey for a freshness warning.
 *
 * Always per-doc — freshness is an intrinsic property of a specific
 * document (cap table X is stale, balance sheet Y is stale). Resolving
 * one doc's freshness should NOT mass-resolve the same kind on other
 * docs.
 */
export function signalKeyForFreshness(kind: StaleWarningKind, documentId: string): string {
  return `${FRESHNESS_PREFIX}${kind}:${escapeSegment(documentId)}`;
}

// ============================================================
// Parse + validate (used by the API route)
// ============================================================

export type ParsedSignalKey =
  | {
      kind: "contradiction";
      contradictionKind: ContradictionKind;
      subject: string;
      year: number | null;
      /** B9.1.1 — opaque hex hash of the evidence set (see `hashContradictionEvidenceSet`). */
      evidenceHash: string;
    }
  | { kind: "missing"; missingKind: MissingEvidenceKind; documentId: string | null }
  | { kind: "freshness"; freshnessKind: StaleWarningKind; documentId: string };

/**
 * Strict parser — returns `null` if the input doesn't match a known
 * shape, the segment count is wrong, the kind is unknown (B9.1.1 fix-up
 * for Codex B9.1 P2), or the key exceeds the column length cap. The
 * route uses the truthiness check to 400 on malformed input BEFORE
 * touching the database.
 *
 * Defensive: a malformed key (e.g. an extra unescaped `:`) returns
 * null rather than partial nonsense — we'd rather a clear 400 than
 * a half-parsed row that silently mismatches no signal.
 *
 * B9.1.1 (Codex B9.1 P2): each `*kind` segment is validated against
 * the known enum union (`VALID_*_KINDS`). An unknown kind →
 * immediate `null`, so the API can't write tombstones for fabricated
 * signal kinds.
 */
export function parseSignalKey(input: string): ParsedSignalKey | null {
  if (typeof input !== "string") return null;
  if (input.length === 0 || input.length > MAX_SIGNAL_KEY_LENGTH) return null;

  if (input.startsWith(CONTRADICTION_PREFIX)) {
    const rest = input.slice(CONTRADICTION_PREFIX.length);
    // contradiction:KIND:SUBJECT:YEAR_OR_UNDATED:HASH — exactly 4 segments.
    // (B9.1.1 added the evidence-hash segment to close Codex B9.1 P1.)
    // SUBJECT may contain escaped colons (`%3A`); split on un-escaped only.
    const segments = splitUnescaped(rest);
    if (segments.length !== 4) return null;
    const [contradictionKindRaw, subjectEscaped, yearKey, evidenceHash] = segments;
    const subject = unescapeSegment(subjectEscaped);
    const year = yearKey === "undated" ? null : Number(yearKey);
    if (yearKey !== "undated" && (!Number.isInteger(year) || Number.isNaN(year as number))) return null;
    if (contradictionKindRaw.length === 0 || subject.length === 0) return null;
    if (!VALID_CONTRADICTION_KINDS.has(contradictionKindRaw as ContradictionKind)) return null;
    // Evidence hash MUST be a non-empty short hex (or the `noevidence`
    // sentinel). Reject anything else so a tampered key can't slip
    // through with an empty hash segment.
    if (!isValidEvidenceHash(evidenceHash)) return null;
    return {
      kind: "contradiction",
      contradictionKind: contradictionKindRaw as ContradictionKind,
      subject,
      year,
      evidenceHash,
    };
  }

  if (input.startsWith(MISSING_PREFIX)) {
    const rest = input.slice(MISSING_PREFIX.length);
    const segments = splitUnescaped(rest);
    if (segments.length === 1) {
      const [missingKindRaw] = segments;
      if (missingKindRaw.length === 0) return null;
      if (!VALID_MISSING_KINDS.has(missingKindRaw as MissingEvidenceKind)) return null;
      return { kind: "missing", missingKind: missingKindRaw as MissingEvidenceKind, documentId: null };
    }
    if (segments.length === 2) {
      const [missingKindRaw, documentIdEscaped] = segments;
      const documentId = unescapeSegment(documentIdEscaped);
      if (missingKindRaw.length === 0 || documentId.length === 0) return null;
      if (!VALID_MISSING_KINDS.has(missingKindRaw as MissingEvidenceKind)) return null;
      return { kind: "missing", missingKind: missingKindRaw as MissingEvidenceKind, documentId };
    }
    return null;
  }

  if (input.startsWith(FRESHNESS_PREFIX)) {
    const rest = input.slice(FRESHNESS_PREFIX.length);
    const segments = splitUnescaped(rest);
    if (segments.length !== 2) return null;
    const [freshnessKindRaw, documentIdEscaped] = segments;
    const documentId = unescapeSegment(documentIdEscaped);
    if (freshnessKindRaw.length === 0 || documentId.length === 0) return null;
    if (!VALID_FRESHNESS_KINDS.has(freshnessKindRaw as StaleWarningKind)) return null;
    return { kind: "freshness", freshnessKind: freshnessKindRaw as StaleWarningKind, documentId };
  }

  return null;
}

/**
 * Accept the 16-char hex hash produced by `hashContradictionEvidenceSet`
 * OR the `noevidence` sentinel (defensive empty-set case). Anything
 * else means the key was tampered with.
 */
function isValidEvidenceHash(value: string): boolean {
  if (value === "noevidence") return true;
  return /^[0-9a-f]{16}$/.test(value);
}

/**
 * Convenience for the API + service layers — `parseSignalKey` plus an
 * `ok: boolean` flag. Returns the parsed shape OR a 400-ready error.
 */
export function isValidSignalKey(input: unknown): input is string {
  return typeof input === "string" && parseSignalKey(input) !== null;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Escape `:` inside a segment so the key parses unambiguously. We
 * also escape `%` so the round-trip is bijective. Subjects in the
 * codebase don't currently contain `:`, but a future kind that uses
 * a document name (which can contain anything) would otherwise produce
 * a malformed key.
 */
function escapeSegment(value: string): string {
  return value.replace(/%/g, "%25").replace(/:/g, "%3A");
}

function unescapeSegment(value: string): string {
  return value.replace(/%3A/gi, ":").replace(/%25/g, "%");
}

/**
 * Split on `:` ignoring `%3A` (escaped colons). Each segment is left
 * percent-encoded; callers run `unescapeSegment` to recover the value.
 */
function splitUnescaped(input: string): string[] {
  const segments: string[] = [];
  let buffer = "";
  let i = 0;
  while (i < input.length) {
    if (input[i] === ":") {
      segments.push(buffer);
      buffer = "";
      i += 1;
      continue;
    }
    if (input.startsWith("%3A", i) || input.startsWith("%3a", i)) {
      buffer += input.slice(i, i + 3);
      i += 3;
      continue;
    }
    buffer += input[i];
    i += 1;
  }
  segments.push(buffer);
  return segments;
}
