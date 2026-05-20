/**
 * Phase 9 — Backfill skip-decision helper.
 *
 * Decides whether the Evidence Engine should run on a given document during
 * a backfill pass. Lives in the service layer (not under scripts/) so it
 * can be unit-tested via the existing vitest config — the CLI in
 * scripts/backfill/evidence-signals.ts imports it.
 *
 * Skip criterion (post-Codex round 28 P1 fix):
 *   - `--force` → never skip.
 *   - No terminal extraction run → skip (nothing to run on).
 *   - For the LATEST terminal run, EVERY required run-scoped extractor
 *     version (TEMPORAL_EXTRACTOR_VERSION, CLAIMS_EXTRACTOR_VERSION) must
 *     have at least one EvidenceSignal scoped to that run. If any are
 *     missing, the doc is processed — we cannot tolerate a temporal-only
 *     coverage masking missing claims, or vice-versa.
 *   - Otherwise → process.
 *
 * Why tight on the run-scope key (not "any signal exists"): a stale
 * `filename`-scoped DOCUMENT_DATE signal from before Phase 1-6 must not
 * mask a doc that has NEVER had its OCR temporal/claims extraction run.
 *
 * Known limitation (Codex round 28, deferred): extractors that legitimately
 * produce zero signals (e.g. a doc with no financial claims) cannot be
 * distinguished from "extractor never ran" without a backfill ledger. Such
 * docs will be re-processed on every backfill. Acceptable cost since the
 * extractors are idempotent + fast; a proper ledger
 * `BackfillRunLedger(documentId, extractionRunId, extractorVersion, completedAt)`
 * is a P3 follow-up.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { TEMPORAL_EXTRACTOR_VERSION } from "./temporal-extractor";
import { CLAIMS_EXTRACTOR_VERSION } from "./claims-extractor";

/**
 * Extractor versions that must be covered for a doc to be considered fully
 * processed at the latest run. When `runEvidenceForDocument` gains a new
 * run-scoped extractor, add its version constant here so the backfill
 * doesn't silently leave docs un-enriched.
 *
 * IMPORTANT: only run-scoped extractors belong here. Non-run-scoped
 * extractors (attachment linker → ATTACHMENT_RELATION at source_metadata
 * scope) emit signals tied to the doc, not the run; their coverage is
 * orthogonal and not gated by the latest-run check.
 */
export const RUN_SCOPED_EXTRACTOR_VERSIONS_REQUIRED: readonly string[] = [
  TEMPORAL_EXTRACTOR_VERSION,
  CLAIMS_EXTRACTOR_VERSION,
];

export interface BackfillSkipDecision {
  skip: boolean;
  reason: BackfillSkipReason;
  latestRunId: string | null;
  /** When skip=true: list of extractor versions present (covered). */
  coveredExtractorVersions?: string[];
  /** When skip=false: list of required extractor versions still missing. */
  missingExtractorVersions?: string[];
}

export type BackfillSkipReason =
  | "force_flag"
  | "no_terminal_extraction_run"
  | "latest_run_already_processed"
  | "missing_signals_for_latest_run";

export interface ShouldBackfillOptions {
  /** Bypass the skip logic entirely. Used after extractor version upgrades. */
  force?: boolean;
  /** Test/override hook — defaults to `RUN_SCOPED_EXTRACTOR_VERSIONS_REQUIRED`. */
  requiredExtractorVersions?: readonly string[];
}

/**
 * Pure decision function. No side-effects. Two prisma reads max:
 *   1. latest terminal DocumentExtractionRun
 *   2. distinct extractorVersions present on signals scoped to that run
 *      (single findMany with `distinct`, only `extractorVersion` selected)
 */
export async function shouldBackfillDocument(
  prisma: PrismaClient | Prisma.TransactionClient,
  documentId: string,
  options: ShouldBackfillOptions = {}
): Promise<BackfillSkipDecision> {
  if (options.force) {
    return { skip: false, reason: "force_flag", latestRunId: null };
  }

  const required = options.requiredExtractorVersions ?? RUN_SCOPED_EXTRACTOR_VERSIONS_REQUIRED;

  const latestRun = await prisma.documentExtractionRun.findFirst({
    where: {
      documentId,
      status: { in: ["READY", "READY_WITH_WARNINGS", "BLOCKED"] },
    },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });

  if (!latestRun) {
    return {
      skip: true,
      reason: "no_terminal_extraction_run",
      latestRunId: null,
    };
  }

  const presentRows = await prisma.evidenceSignal.findMany({
    where: {
      documentId,
      signalScopeKey: `run:${latestRun.id}`,
      extractorVersion: { in: required as string[] },
    },
    select: { extractorVersion: true },
    distinct: ["extractorVersion"],
  });

  const presentSet = new Set(presentRows.map((r) => r.extractorVersion));
  const missing = required.filter((v) => !presentSet.has(v));

  if (missing.length === 0) {
    return {
      skip: true,
      reason: "latest_run_already_processed",
      latestRunId: latestRun.id,
      coveredExtractorVersions: Array.from(presentSet),
    };
  }

  return {
    skip: false,
    reason: "missing_signals_for_latest_run",
    latestRunId: latestRun.id,
    missingExtractorVersions: missing,
  };
}
