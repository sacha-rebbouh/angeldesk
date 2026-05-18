/**
 * Phase 9 — Evidence Engine backfill script.
 *
 * Walks documents and invokes runEvidenceForDocument retroactively so docs
 * created before Phase 1-6 get their EvidenceSignal rows. Conservative by
 * default: only --only-completed docs are processed, the skip-decision
 * helper guards against re-processing already-covered runs.
 *
 * Usage (always wrap with `npx dotenv -e .env.local --` so the
 * DOCUMENT_ENCRYPTION_KEY is in scope when reading extracted text):
 *
 *   # Single deal (test 3 first — Avekapeti, FurLove, E4N):
 *   npx dotenv -e .env.local -- npx tsx scripts/backfill/evidence-signals.ts \
 *     --deal-id clxxxxx --dry-run
 *
 *   # Then for real:
 *   npx dotenv -e .env.local -- npx tsx scripts/backfill/evidence-signals.ts \
 *     --deal-id clxxxxx
 *
 *   # Whole corpus, capped:
 *   npx dotenv -e .env.local -- npx tsx scripts/backfill/evidence-signals.ts \
 *     --all --limit 100
 *
 *   # After an extractor version bump, replay everything ignoring the skip cache:
 *   npx dotenv -e .env.local -- npx tsx scripts/backfill/evidence-signals.ts \
 *     --all --force
 *
 * Args:
 *   --deal-id <id>       Restrict to one deal. Mutually exclusive with --all.
 *   --all                Process every deal. Required when --deal-id absent.
 *   --limit <n>          Cap the number of docs ACTUALLY processed (post-skip).
 *                        Stops the loop as soon as N docs hit processed or
 *                        would_process. Skipped docs do NOT count against
 *                        this limit (Codex round 28 P2 — previously --limit
 *                        applied to candidates, so a corpus full of already-
 *                        covered docs could yield zero work).
 *   --max-candidates <n> Safety cap on the SQL fetch. Defaults to 10000 for
 *                        --all, unlimited for --deal-id. Use this to guard
 *                        against runaway memory on huge corpora.
 *   --dry-run            Print what would happen without writing. Skip-decision
 *                        still runs so the report is accurate.
 *   --only-completed     (default true) Only docs with processingStatus=COMPLETED.
 *   --include-non-completed  Override to also touch FAILED / PROCESSING / PENDING.
 *   --since <ISO date>   Only docs uploaded on/after this date.
 *   --force              Bypass skip-decision (re-run on docs already covered).
 *   --summary-out <path> Write summary JSON to this path. Default:
 *                        docs-private/backfills/evidence-signals-<ts>.json
 *
 * Output: per-doc line on stdout + a JSON summary file at the end.
 *
 * Safety guarantees:
 *   - runEvidenceForDocument is idempotent (P2002 → return existing).
 *   - Skip-decision check is tight on `run:<latestRunId>` to avoid false-skip
 *     from stale `filename`-scope signals (see backfill-skip-decision.ts).
 *   - --dry-run runs the skip check + report only, never writes signals.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { prisma } from "@/lib/prisma";
import { runEvidenceForDocument } from "@/services/evidence/run-evidence-for-document";
import {
  shouldBackfillDocument,
  type BackfillSkipReason,
} from "@/services/evidence/backfill-skip-decision";

// ============================================================
// Args parsing
// ============================================================
interface ParsedArgs {
  dealId: string | null;
  all: boolean;
  limit: number | null;
  maxCandidates: number | null;
  dryRun: boolean;
  onlyCompleted: boolean;
  since: Date | null;
  force: boolean;
  summaryOut: string;
}

const DEFAULT_MAX_CANDIDATES_ALL = 10_000;

function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith("--")) continue;
    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      flags.set(key, true);
      continue;
    }
    flags.set(key, next);
    i += 1;
  }

  const dealId = typeof flags.get("deal-id") === "string" ? String(flags.get("deal-id")) : null;
  const all = flags.get("all") === true;
  if (!dealId && !all) {
    throw new Error("Either --deal-id <id> or --all is required");
  }
  if (dealId && all) {
    throw new Error("--deal-id and --all are mutually exclusive");
  }
  const limitRaw = flags.get("limit");
  const limit = typeof limitRaw === "string" ? Number(limitRaw) : null;
  if (limit !== null && (!Number.isFinite(limit) || limit < 1)) {
    throw new Error(`Invalid --limit: ${String(limitRaw)}`);
  }
  const maxCandidatesRaw = flags.get("max-candidates");
  let maxCandidates: number | null;
  if (typeof maxCandidatesRaw === "string") {
    maxCandidates = Number(maxCandidatesRaw);
    if (!Number.isFinite(maxCandidates) || maxCandidates < 1) {
      throw new Error(`Invalid --max-candidates: ${maxCandidatesRaw}`);
    }
  } else {
    // Default: bound the SQL fetch when scanning the whole corpus, but leave
    // single-deal runs unrestricted (a deal rarely has more than a few dozen
    // docs).
    maxCandidates = all ? DEFAULT_MAX_CANDIDATES_ALL : null;
  }
  const sinceRaw = flags.get("since");
  let since: Date | null = null;
  if (typeof sinceRaw === "string") {
    const parsed = new Date(sinceRaw);
    if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid --since: ${sinceRaw}`);
    since = parsed;
  }
  const onlyCompletedFlag = flags.get("only-completed");
  const includeNonCompleted = flags.get("include-non-completed") === true;
  // Default is true; --include-non-completed overrides.
  const onlyCompleted = includeNonCompleted ? false : onlyCompletedFlag === false ? false : true;

  const summaryOutFlag = flags.get("summary-out");
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const summaryOut =
    typeof summaryOutFlag === "string"
      ? summaryOutFlag
      : resolve(process.cwd(), "docs-private", "backfills", `evidence-signals-${ts}.json`);

  return {
    dealId,
    all,
    limit,
    maxCandidates,
    dryRun: flags.get("dry-run") === true,
    onlyCompleted,
    since,
    force: flags.get("force") === true,
    summaryOut,
  };
}

// ============================================================
// Doc result + summary types
// ============================================================
interface PerDocResult {
  documentId: string;
  documentName: string;
  dealId: string;
  processingStatus: string;
  decision: "skipped" | "processed" | "would_process" | "failed";
  skipReason?: BackfillSkipReason;
  latestRunId?: string | null;
  /** Codex round 28 P1 — extractor versions found on the latest run. */
  coveredExtractorVersions?: string[];
  missingExtractorVersions?: string[];
  signalsPersisted?: number;
  signalsDeduplicated?: number;
  claimsPersisted?: number;
  claimsDeduplicated?: number;
  attachmentsLinked?: number;
  promoted?: boolean;
  runResultStatus?: string;
  runResultReason?: string;
  errorMessage?: string;
}

interface BackfillSummary {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  args: ParsedArgs;
  totals: {
    candidates: number;
    skipped: number;
    processed: number;
    wouldProcess: number;
    failed: number;
    signalsPersisted: number;
    signalsDeduplicated: number;
    claimsPersisted: number;
    claimsDeduplicated: number;
    attachmentsLinked: number;
  };
  perDoc: PerDocResult[];
}

// ============================================================
// Main
// ============================================================
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = new Date();

  console.log(
    `[backfill:evidence] start  mode=${args.dryRun ? "DRY-RUN" : "APPLY"}  ` +
      `target=${args.dealId ?? "ALL"}  limit=${args.limit ?? "none"}  ` +
      `maxCandidates=${args.maxCandidates ?? "none"}  ` +
      `onlyCompleted=${args.onlyCompleted}  force=${args.force}` +
      (args.since ? `  since=${args.since.toISOString()}` : "")
  );

  const where: Parameters<typeof prisma.document.findMany>[0] extends infer T
    ? T extends { where?: infer W }
      ? W
      : never
    : never = {};
  if (args.dealId) (where as { dealId?: string }).dealId = args.dealId;
  if (args.onlyCompleted) (where as { processingStatus?: string }).processingStatus = "COMPLETED";
  if (args.since) (where as { uploadedAt?: { gte?: Date } }).uploadedAt = { gte: args.since };

  const docs = await prisma.document.findMany({
    where,
    orderBy: [{ uploadedAt: "asc" }, { id: "asc" }],
    // Codex round 28 P2 — the SQL cap is the safety bound on memory, NOT the
    // user's process-count budget. --limit applies post-skip (below).
    take: args.maxCandidates ?? undefined,
    select: {
      id: true,
      name: true,
      dealId: true,
      processingStatus: true,
    },
  });

  console.log(`[backfill:evidence] candidates=${docs.length}`);

  const perDoc: PerDocResult[] = [];
  let processedOrWouldProcess = 0;
  let limitReached = false;

  for (const doc of docs) {
    // Codex round 28 P2 — stop the loop as soon as --limit docs have been
    // ACTUALLY processed (or would be in dry-run). Skipped docs do not count
    // toward the budget — the old behaviour applied --limit to candidates,
    // so a corpus full of already-covered docs could yield zero work.
    if (args.limit !== null && processedOrWouldProcess >= args.limit) {
      limitReached = true;
      break;
    }
    try {
      const decision = await shouldBackfillDocument(prisma, doc.id, { force: args.force });
      if (decision.skip) {
        perDoc.push({
          documentId: doc.id,
          documentName: doc.name,
          dealId: doc.dealId,
          processingStatus: doc.processingStatus,
          decision: "skipped",
          skipReason: decision.reason,
          latestRunId: decision.latestRunId,
          coveredExtractorVersions: decision.coveredExtractorVersions,
        });
        console.log(
          `  skip  ${doc.id}  reason=${decision.reason}  run=${decision.latestRunId ?? "—"}  ` +
            `covered=${(decision.coveredExtractorVersions ?? []).length}  name=${doc.name}`
        );
        continue;
      }

      if (args.dryRun) {
        perDoc.push({
          documentId: doc.id,
          documentName: doc.name,
          dealId: doc.dealId,
          processingStatus: doc.processingStatus,
          decision: "would_process",
          latestRunId: decision.latestRunId,
          missingExtractorVersions: decision.missingExtractorVersions,
        });
        console.log(
          `  dry   ${doc.id}  run=${decision.latestRunId ?? "—"}  ` +
            `missing=${(decision.missingExtractorVersions ?? []).length}  name=${doc.name}`
        );
        processedOrWouldProcess += 1;
        continue;
      }

      const result = await runEvidenceForDocument(prisma, {
        documentId: doc.id,
        // Let the helper read + decrypt Document.extractedText itself (catch-up path).
      });
      perDoc.push({
        documentId: doc.id,
        documentName: doc.name,
        dealId: doc.dealId,
        processingStatus: doc.processingStatus,
        decision: result.status === "ran" ? "processed" : "skipped",
        latestRunId: decision.latestRunId,
        missingExtractorVersions: decision.missingExtractorVersions,
        signalsPersisted: result.signalsPersisted,
        signalsDeduplicated: result.signalsDeduplicated,
        claimsPersisted: result.claimsPersisted,
        claimsDeduplicated: result.claimsDeduplicated,
        attachmentsLinked: result.attachmentsLinked,
        promoted: result.promoted,
        runResultStatus: result.status,
        runResultReason: result.reason,
      });
      if (result.status === "ran") processedOrWouldProcess += 1;
      console.log(
        `  ${result.status === "ran" ? "OK   " : "skip "} ${doc.id}  ` +
          `signals=+${result.signalsPersisted ?? 0}/=${result.signalsDeduplicated ?? 0}  ` +
          `claims=+${result.claimsPersisted ?? 0}/=${result.claimsDeduplicated ?? 0}  ` +
          `attach=${result.attachmentsLinked ?? 0}  ` +
          `promoted=${result.promoted ? "yes" : "no"}  ` +
          `name=${doc.name}` +
          (result.reason ? `  reason=${result.reason}` : "")
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      perDoc.push({
        documentId: doc.id,
        documentName: doc.name,
        dealId: doc.dealId,
        processingStatus: doc.processingStatus,
        decision: "failed",
        errorMessage: message,
      });
      console.error(`  FAIL ${doc.id}  ${message}  name=${doc.name}`);
    }
  }

  if (limitReached) {
    console.log(
      `[backfill:evidence] reached --limit=${args.limit} (processedOrWouldProcess=${processedOrWouldProcess}), stopping early`
    );
  }

  const finishedAt = new Date();
  const totals = {
    candidates: docs.length,
    skipped: perDoc.filter((r) => r.decision === "skipped").length,
    processed: perDoc.filter((r) => r.decision === "processed").length,
    wouldProcess: perDoc.filter((r) => r.decision === "would_process").length,
    failed: perDoc.filter((r) => r.decision === "failed").length,
    /** Codex round 28 P2 — true when --limit cut the loop short. */
    limitReached,
    signalsPersisted: perDoc.reduce((s, r) => s + (r.signalsPersisted ?? 0), 0),
    signalsDeduplicated: perDoc.reduce((s, r) => s + (r.signalsDeduplicated ?? 0), 0),
    claimsPersisted: perDoc.reduce((s, r) => s + (r.claimsPersisted ?? 0), 0),
    claimsDeduplicated: perDoc.reduce((s, r) => s + (r.claimsDeduplicated ?? 0), 0),
    attachmentsLinked: perDoc.reduce((s, r) => s + (r.attachmentsLinked ?? 0), 0),
  };

  const summary: BackfillSummary = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    args,
    totals,
    perDoc,
  };

  mkdirSync(dirname(args.summaryOut), { recursive: true });
  writeFileSync(args.summaryOut, JSON.stringify(summary, null, 2), "utf8");

  console.log(
    `[backfill:evidence] done  totals=${JSON.stringify(totals)}  summary=${args.summaryOut}`
  );
}

main()
  .catch((error) => {
    console.error("[backfill:evidence] fatal:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
