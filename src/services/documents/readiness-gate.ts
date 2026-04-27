/**
 * Runtime gate helpers for endpoints that consume the corpus.
 *
 * MUST remain pure (no next/server imports) - this file can be imported
 * from background jobs, webhooks, Inngest steps, live flows, etc.
 * HTTP response helpers live separately in src/lib/api/corpus-not-ready-response.ts.
 */

import { prisma } from "@/lib/prisma";
import { loadCorpusSnapshot } from "@/services/corpus";

import {
  evaluateDealDocumentReadiness,
  type DealDocumentReadiness,
} from "./extraction-runs";
import {
  isExtractionStrictReadinessEnabled,
  isPageArtifactToxic,
} from "./extraction-readiness-policy";

export type ReadinessReasonCode =
  | "MISSING_RUN"
  | "UNVERIFIED_ARTIFACT"
  | "MANIFEST_BLOCKED"
  | "SNAPSHOT_TOXIC";

export interface SnapshotDetail {
  snapshotId: string;
  toxicRunIds: string[];
  missingRunIds: string[];
}

export class CorpusNotReadyError extends Error {
  public readonly reasonCode: ReadinessReasonCode;
  public readonly readiness: DealDocumentReadiness | null;
  public readonly snapshotDetail?: SnapshotDetail;

  constructor(
    reasonCode: ReadinessReasonCode,
    readiness: DealDocumentReadiness | null,
    snapshotDetail?: SnapshotDetail
  ) {
    super(`Corpus not ready: ${reasonCode}`);
    this.name = "CorpusNotReadyError";
    this.reasonCode = reasonCode;
    this.readiness = readiness;
    this.snapshotDetail = snapshotDetail;
  }
}

function mapReasonCodeFromBlockers(readiness: DealDocumentReadiness): ReadinessReasonCode {
  const codes = new Set(readiness.blockers.map((blocker) => blocker.code));
  if (codes.has("STRICT_EXTRACTION_MISSING")) {
    return "MISSING_RUN";
  }
  if (codes.has("UNVERIFIED_ARTIFACT")) {
    return "UNVERIFIED_ARTIFACT";
  }
  return "MANIFEST_BLOCKED";
}

/**
 * Gate on the LATEST documents of the deal.
 * Use in routes that operate on the current corpus:
 * analyze, chat (Phase 1: without analysisId), board, terms/extract.
 */
export async function assertDealCorpusReady(dealId: string): Promise<void> {
  if (!isExtractionStrictReadinessEnabled()) {
    return;
  }
  const readiness = await evaluateDealDocumentReadiness(dealId);
  if (!readiness.ready) {
    throw new CorpusNotReadyError(mapReasonCodeFromBlockers(readiness), readiness);
  }
}

/**
 * SNAPSHOT-AWARE gate: verifies the runs that served a specific analysis
 * are trustworthy, even if the deal's LATEST documents have since changed.
 * Use in: export-pdf (replay of a past analysis), negotiation/generate
 * (based on a specific analysis).
 *
 * Fail-closed contract:
 * - Unknown / ownership-mismatch analysis -> MISSING_RUN.
 * - Snapshot not materialized -> MISSING_RUN.
 * - Snapshot references zero extractionRunIds -> MISSING_RUN.
 *   (Phase 1: we do NOT silently authorize legacy native-only snapshots.
 *   Any future override must be explicit, not a silent return.)
 * - Snapshot references runs that Prisma cannot load -> SNAPSHOT_TOXIC.
 * - Any referenced run has readyForAnalysis=false OR a toxic page artifact -> SNAPSHOT_TOXIC.
 * - analysisId omitted -> falls back to assertDealCorpusReady.
 */
export async function assertAnalysisCorpusReady(
  dealId: string,
  analysisId: string | null | undefined
): Promise<void> {
  if (!isExtractionStrictReadinessEnabled()) {
    return;
  }

  if (!analysisId) {
    await assertDealCorpusReady(dealId);
    return;
  }

  const analysis = await prisma.analysis.findUnique({
    where: { id: analysisId },
    select: { id: true, dealId: true, corpusSnapshotId: true },
  });

  if (!analysis || analysis.dealId !== dealId) {
    throw new CorpusNotReadyError("MISSING_RUN", null);
  }

  if (!analysis.corpusSnapshotId) {
    // A route that passes an analysisId is replaying analysis-specific output.
    // Without a materialized snapshot, we cannot prove which extraction runs
    // fed that output. Fail closed instead of validating the current corpus.
    throw new CorpusNotReadyError("MISSING_RUN", null);
  }

  const snapshot = await loadCorpusSnapshot(analysis.corpusSnapshotId);
  if (!snapshot) {
    throw new CorpusNotReadyError("MISSING_RUN", null, {
      snapshotId: analysis.corpusSnapshotId,
      toxicRunIds: [],
      missingRunIds: [],
    });
  }

  if (snapshot.extractionRunIds.length === 0) {
    // Fail-closed: an old snapshot with no verifiable run can precisely be
    // a contaminated analysis. Do NOT return silently.
    throw new CorpusNotReadyError("MISSING_RUN", null, {
      snapshotId: analysis.corpusSnapshotId,
      toxicRunIds: [],
      missingRunIds: [],
    });
  }

  const runs = await prisma.documentExtractionRun.findMany({
    where: { id: { in: snapshot.extractionRunIds } },
    select: {
      id: true,
      readyForAnalysis: true,
      pages: { select: { pageNumber: true, status: true, artifact: true } },
    },
  });

  const loadedRunIds = new Set(runs.map((run) => run.id));
  const missingRunIds = snapshot.extractionRunIds.filter(
    (runId) => !loadedRunIds.has(runId)
  );

  const toxicRunIds: string[] = [];
  for (const run of runs) {
    if (!run.readyForAnalysis) {
      toxicRunIds.push(run.id);
      continue;
    }
    if (run.pages.some((page) => isPageArtifactToxic(page.artifact, page.status))) {
      toxicRunIds.push(run.id);
    }
  }

  if (toxicRunIds.length > 0 || missingRunIds.length > 0) {
    throw new CorpusNotReadyError("SNAPSHOT_TOXIC", null, {
      snapshotId: analysis.corpusSnapshotId,
      toxicRunIds,
      missingRunIds,
    });
  }
}

/**
 * Non-throwing variant for flows that must degrade gracefully instead of
 * throwing (live webhooks, post-call report generation, coaching context).
 * Never throws; callers decide whether to skip enrichment, generate a
 * transcript-only report, refuse a paid reanalysis, etc.
 */
export async function evaluateDealCorpusReadinessSoft(
  dealId: string
): Promise<{
  ready: boolean;
  reasonCode: ReadinessReasonCode | null;
  readiness: DealDocumentReadiness | null;
}> {
  if (!isExtractionStrictReadinessEnabled()) {
    return { ready: true, reasonCode: null, readiness: null };
  }
  try {
    const readiness = await evaluateDealDocumentReadiness(dealId);
    if (readiness.ready) {
      return { ready: true, reasonCode: null, readiness };
    }
    return { ready: false, reasonCode: mapReasonCodeFromBlockers(readiness), readiness };
  } catch {
    return { ready: false, reasonCode: "MISSING_RUN", readiness: null };
  }
}
