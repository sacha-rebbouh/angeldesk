import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { encryptText } from "@/lib/encryption";
import { smartExtract, type ExtractionWarning } from "@/services/pdf";
import { downloadFile } from "@/services/storage";
import {
  completeDocumentExtractionRun,
  getBlockingPageNumbersFromManifest,
  hasUsableExtractionCorpus,
  markExtractionRunProgress,
  recordExtractionPageProgress,
  summarizeManifestForLegacyMetrics,
  terminalizeExtractionRunAsFailed,
} from "@/services/documents/extraction-runs";
import {
  buildProgressSnapshot,
  setDocumentExtractionProgress,
} from "@/services/documents/extraction-progress";

// Phase 4 — durable extraction pipeline. The HTTP routes claim the document
// (transition PENDING/COMPLETED/FAILED → PROCESSING), persist a fresh
// ExtractionRun row, deduct credits up-front, and then HAND OFF to this
// service through an Inngest event. The Inngest function calls
// `runDocumentExtractionPipeline` inside checkpointed steps so a crash
// mid-extraction resumes from the failed step on retry.
//
// Idempotency model:
//   - The pipeline is keyed by `extractionRunId` (one run per attempt). If
//     Inngest retries the function, each step.run('…') is checkpointed and
//     re-execution skips already-completed steps.
//   - Page-level writes use `recordExtractionPageProgress` (upsert by
//     runId+pageNumber), so a partial re-run cannot duplicate rows.
//   - Final `completeDocumentExtractionRun` + the Document update at the
//     end of the pipeline are also safe to repeat: the same run id maps to
//     the same Document, and idempotency at the page level means the
//     payload converges.
//   - Compensation (refund credits, mark FAILED) is the Inngest function's
//     responsibility; this service only signals failure via throw.
//
// Currently supports PDF input only. Image / Excel / PowerPoint / Word
// extraction stays inline in the upload route until later sub-phases.

export type ExtractionPipelineResult = {
  status: "COMPLETED" | "FAILED";
  textLength: number;
  pageCount: number;
  quality: number | null;
  warnings: ExtractionWarning[];
  requiresOCR: boolean;
  ocrApplied: boolean;
  extractionRunId: string;
  // Phase 4.2: the actual extraction credit cost derived from the manifest.
  // The Inngest function reconciles this against the up-front pre-charge
  // (delta charge or refund) when `reconcileCredits` is set on the event.
  actualCredits: number;
};

// Phase 4.2: optional progress publishing for the upload UX. When the HTTP
// route hands off an `uploadProgressId`, the pipeline mirrors its extraction
// phases into the `DocumentExtractionProgress` table so the upload client's
// poller (`/api/documents/upload/progress/[id]`) shows real backend progress
// instead of the local time-based fallback.
export type ExtractionProgressPublishing = {
  uploadProgressId: string;
  userId: string;
  documentName: string;
};

export class ExtractionPipelineError extends Error {
  constructor(
    message: string,
    readonly code:
      | "DOCUMENT_NOT_FOUND"
      | "RUN_NOT_FOUND"
      | "MIME_UNSUPPORTED"
      | "NO_STORAGE"
      | "DOWNLOAD_FAILED"
      | "EXTRACTION_FAILED"
      | "EXTRACTION_TIMEOUT"
  ) {
    super(message);
    this.name = "ExtractionPipelineError";
  }
}

// Phase 4.4: real extraction time budget. The old inline upload route had a
// "soft timeout" that raced a timer against `smartExtract` but never aborted
// the underlying work — it just resolved early while OCR kept running
// (decorative). Now the pipeline arms a true `AbortController`: when the
// budget fires, every OCR loop in `smartExtract` stops scheduling further
// batches and returns its partial result, and the pipeline terminalizes the
// run FAILED with `EXTRACTION_TIMEOUT` (a partial strict-mode corpus —
// missing pages = missing financials — is not a trustworthy result).
//
// This is an INTERNAL soft budget. It must stay comfortably below the
// Inngest function/step execution limit so OUR failure (graceful: run +
// document FAILED, credits refunded) fires before the infra hard-kills the
// step. 8 minutes is generous for a typical deck (~3 min OCR) while still
// capping a pathological run. Tunable.
export const EXTRACTION_TIME_BUDGET_MS = 8 * 60_000;

/**
 * Execute the full extraction pipeline for one document. Designed to run
 * inside an Inngest function — each side-effect is idempotent enough that
 * Inngest's step-level retries are safe.
 *
 * Throws ExtractionPipelineError on any unrecoverable failure. The caller
 * (Inngest function) is responsible for marking the Document FAILED and
 * refunding the user.
 */
export async function runDocumentExtractionPipeline(params: {
  documentId: string;
  extractionRunId: string;
  progressPublishing?: ExtractionProgressPublishing;
}): Promise<ExtractionPipelineResult> {
  const { documentId, extractionRunId, progressPublishing } = params;

  // Best-effort upload-progress mirror. Never throws — a progress write
  // failure must not fail the extraction itself.
  const publishUploadProgress = async (snapshot: {
    phase: "queued" | "started" | "native_extracted" | "page_processed" | "completed" | "failed";
    pageCount?: number;
    pagesProcessed?: number;
    message?: string;
  }) => {
    if (!progressPublishing) return;
    try {
      await setDocumentExtractionProgress(
        buildProgressSnapshot({
          id: progressPublishing.uploadProgressId,
          userId: progressPublishing.userId,
          documentId,
          documentName: progressPublishing.documentName,
          phase: snapshot.phase,
          pageCount: snapshot.pageCount,
          pagesProcessed: snapshot.pagesProcessed,
          message: snapshot.message,
        })
      );
    } catch (progressError) {
      console.warn("[extraction-pipeline] progress publish failed:", progressError);
    }
  };

  // -- 1. Load the document + run --------------------------------------------
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      mimeType: true,
      storageUrl: true,
      storagePath: true,
      processingStatus: true,
    },
  });
  if (!document) {
    throw new ExtractionPipelineError(`Document ${documentId} not found`, "DOCUMENT_NOT_FOUND");
  }
  // NOTE: the MIME guard moved into `runExtractionWork` so a non-PDF doc
  // that somehow got enqueued still terminalizes its run instead of
  // leaving it stuck PROCESSING.

  const run = await prisma.documentExtractionRun.findUnique({
    where: { id: extractionRunId },
    select: { id: true, documentId: true, status: true },
  });
  if (!run || run.documentId !== documentId) {
    throw new ExtractionPipelineError(
      `ExtractionRun ${extractionRunId} not found for document ${documentId}`,
      "RUN_NOT_FOUND"
    );
  }
  // Phase 4 idempotency:
  //   - terminal SUCCESS (READY / READY_WITH_WARNINGS / BLOCKED) → no-op
  //     return of the cached summary. Re-running must not re-charge or
  //     re-flip state.
  //   - terminal FAILED → THROW. A FAILED run on re-entry means a prior
  //     attempt failed and may or may not have completed its compensation
  //     (refund). We must NOT return a tidy `status: "FAILED"` result that
  //     the Inngest function would treat as success — that would skip the
  //     refund. Throwing routes the retry back through the Inngest catch,
  //     whose refund is idempotent via dispatchRefundKey.
  //
  // Phase 4.2 (Codec P2): a retry that lands on an already-terminal run
  // MUST still republish the terminal upload-progress phase. If the prior
  // attempt crashed AFTER the DB commit but BEFORE publishing
  // completed/failed, the progress row is stuck non-terminal and the
  // upload modal would poll forever. Republishing here is idempotent.
  if (run.status === "READY" || run.status === "READY_WITH_WARNINGS" || run.status === "BLOCKED") {
    const summary = await summarizeExistingRun(documentId, extractionRunId, run.status);
    await publishUploadProgress({
      phase: "completed",
      pageCount: summary.pageCount,
      message: "Extraction completed",
    });
    return summary;
  }
  if (run.status === "FAILED") {
    await publishUploadProgress({
      phase: "failed",
      message: "Extraction failed on a prior attempt",
    });
    throw new ExtractionPipelineError(
      `ExtractionRun ${extractionRunId} already terminated as FAILED on a prior attempt`,
      "EXTRACTION_FAILED"
    );
  }

  // -- 2..5. Heavy work. ANY failure past this point terminalizes the run
  // and the document so nothing is left stuck in PROCESSING. The catch
  // re-throws so the Inngest function can compensate (refund).
  try {
    return await runExtractionWork({ documentId, extractionRunId, document, publishUploadProgress });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await terminalizeExtractionRunAsFailed(extractionRunId, reason).catch(() => undefined);
    await prisma.document
      .updateMany({
        where: { id: documentId, processingStatus: "PROCESSING" },
        data: { processingStatus: "FAILED" },
      })
      .catch(() => undefined);
    await publishUploadProgress({ phase: "failed", message: reason });
    throw error;
  }
}

async function runExtractionWork(params: {
  documentId: string;
  extractionRunId: string;
  document: { mimeType: string | null; storageUrl: string | null; storagePath: string | null };
  publishUploadProgress: (snapshot: {
    phase: "queued" | "started" | "native_extracted" | "page_processed" | "completed" | "failed";
    pageCount?: number;
    pagesProcessed?: number;
    message?: string;
  }) => Promise<void>;
}): Promise<ExtractionPipelineResult> {
  const { documentId, extractionRunId, document, publishUploadProgress } = params;

  if (document.mimeType !== "application/pdf") {
    throw new ExtractionPipelineError(
      `MIME ${document.mimeType} not yet supported by the durable pipeline`,
      "MIME_UNSUPPORTED"
    );
  }

  const storageTarget = document.storageUrl ?? document.storagePath;
  if (!storageTarget) {
    throw new ExtractionPipelineError(`Document ${documentId} has no storage reference`, "NO_STORAGE");
  }

  await publishUploadProgress({ phase: "started", message: "Extraction started" });

  // -- 2. Fetch + decrypt the blob -------------------------------------------
  let buffer: Buffer;
  try {
    buffer = await downloadFile(storageTarget);
  } catch (error) {
    throw new ExtractionPipelineError(
      `Failed to download document blob: ${error instanceof Error ? error.message : String(error)}`,
      "DOWNLOAD_FAILED"
    );
  }

  // -- 3. Run smartExtract with incremental progress checkpoints -------------
  // Phase 4.4: real GLOBAL extraction time budget. Two mechanisms work
  // together — neither alone is a real budget:
  //   1. `budgetController` is threaded into smartExtract; the OCR batch
  //      loops check `signal.aborted` and stop scheduling further work, so
  //      the COOPERATIVE part of the extraction winds down instead of
  //      running forever.
  //   2. `budgetDeadline` is RACED against smartExtract, so the PIPELINE
  //      reacts exactly at the deadline even when a NON-cooperative subcall
  //      (an in-flight LLM request, a structured-provider fetch with no
  //      abort support) has not returned yet. Without the race the pipeline
  //      would `await smartExtract` past the budget; without the abort the
  //      background work would never wind down — that was the old
  //      "decorative" soft-timeout. Both are required.
  const budgetController = new AbortController();
  let budgetTimer: ReturnType<typeof setTimeout> | undefined;
  const budgetExceededError = () =>
    new ExtractionPipelineError(
      `EXTRACTION_TIMEOUT: extraction exceeded the ${Math.round(
        EXTRACTION_TIME_BUDGET_MS / 60_000
      )}-minute time budget for document ${documentId}`,
      "EXTRACTION_TIMEOUT"
    );
  const budgetDeadline = new Promise<never>((_resolve, reject) => {
    budgetTimer = setTimeout(() => {
      budgetController.abort();
      reject(budgetExceededError());
    }, EXTRACTION_TIME_BUDGET_MS);
  });

  let pageCountSeen = 0;
  const pagesProcessedSeen = new Set<number>();
  const extractionPromise = smartExtract(buffer, {
    qualityThreshold: 40,
    maxOCRPages: Number.POSITIVE_INFINITY,
    autoOCR: true,
    strict: true,
    signal: budgetController.signal,
    onProgress: async (event) => {
      // Phase 4.4 (Codex P1): once the budget has fired, the losing
      // `smartExtract` keeps running in the background and can still emit
      // late callbacks. Drop them here — the run/document are being (or have
      // been) terminalized FAILED by the budget race, and re-publishing
      // progress would re-open a terminal state. The DB-level monotone
      // guards in `markExtractionRunProgress` / `recordExtractionPageProgress`
      // / `setDocumentExtractionProgress` are the atomic backstop; this is
      // the cheap first line of defense.
      if (budgetController.signal.aborted) return;
      if (event.phase === "native_extracted") {
        pageCountSeen = event.pageCount;
        await markExtractionRunProgress({
          runId: extractionRunId,
          pageCount: event.pageCount,
          pagesProcessed: 0,
          phase: event.phase,
          message: event.message,
        });
        await publishUploadProgress({
          phase: "native_extracted",
          pageCount: event.pageCount,
          pagesProcessed: 0,
          message: event.message,
        });
        return;
      }
      if (event.phase === "page_processed") {
        pagesProcessedSeen.add(event.page.pageNumber);
        await recordExtractionPageProgress({
          runId: extractionRunId,
          page: event.page,
        });
        await publishUploadProgress({
          phase: "page_processed",
          pageCount: Math.max(pageCountSeen, event.page.pageNumber),
          pagesProcessed: pagesProcessedSeen.size,
          message: event.message,
        });
        return;
      }
      await markExtractionRunProgress({
        runId: extractionRunId,
        phase: event.phase,
        message: event.message,
        pageCount: "pageCount" in event ? event.pageCount : undefined,
        pagesProcessed: "pagesProcessed" in event ? event.pagesProcessed : undefined,
      });
    },
  });
  // If smartExtract rejects AFTER the budget race has already settled (a
  // non-cooperative subcall throwing late), the pipeline has moved on — keep
  // that rejection from surfacing as an unhandled rejection.
  extractionPromise.catch(() => undefined);

  let extraction: Awaited<typeof extractionPromise>;
  try {
    // The race is what makes the budget GLOBAL — it rejects with
    // EXTRACTION_TIMEOUT at the deadline even if smartExtract never returns.
    extraction = await Promise.race([extractionPromise, budgetDeadline]);
  } finally {
    if (budgetTimer) clearTimeout(budgetTimer);
  }

  // Phase 4.4: the race can still RESOLVE with smartExtract's value if the
  // OCR loops cooperatively aborted and returned a partial result at the
  // exact tick the budget fired. A partial strict-mode corpus is not a
  // trustworthy result — throw the stable EXTRACTION_TIMEOUT so the
  // pipeline's outer catch terminalizes the run + document FAILED and the
  // Inngest function refunds the user. The per-page rows already persisted
  // via `recordExtractionPageProgress` stay for audit.
  if (budgetController.signal.aborted) {
    throw budgetExceededError();
  }

  const extractionWarnings: ExtractionWarning[] = extraction.manifest.hardBlockers.map((blocker) => ({
    code: blocker.code,
    severity: "critical",
    message: blocker.message,
    suggestion: blocker.pageNumber
      ? `Review page ${blocker.pageNumber}, rerun OCR, upload a corrected file, or approve an explicit override.`
      : "Rerun extraction, upload a corrected file, or approve an explicit override.",
  }));

  // -- 4 + 5. ATOMIC finalization -------------------------------------------
  // The run's terminal status AND the parent Document update commit in ONE
  // transaction (`completeDocumentExtractionRun` with `documentFinalization`).
  // This closes the durability hole Codex flagged: a crash can never leave a
  // terminal-success run pointing at a non-finalized Document. If the
  // transaction rolls back, the run stays PROCESSING and the retry re-runs
  // this whole function cleanly.
  // Use the SHARED corpus-usability definition — must match
  // completeDocumentExtractionRun exactly. A whitespace-only corpus is NOT
  // a success: run, document, and API result all agree on FAILED.
  const isSuccess = hasUsableExtractionCorpus(extraction.text);
  const requiresOCR =
    extraction.manifest.status === "failed" ||
    getBlockingPageNumbersFromManifest(extraction.manifest).length > 0;
  const ocrApplied = extraction.method === "ocr" || extraction.method === "hybrid";

  const errorWarning: ExtractionWarning = {
    code: "EXTRACTION_FAILED",
    severity: "critical",
    message: extraction.manifest.hardBlockers[0]?.message ?? "Failed to extract text from PDF",
    suggestion: "Try re-exporting the PDF from the original source.",
  };

  const sharedMetrics = {
    quality: extraction.quality,
    method: extraction.method,
    pagesOCRd: extraction.pagesOCRd,
    ocrCost: extraction.estimatedCost,
    latestExtractionRunId: extractionRunId,
    ...summarizeManifestForLegacyMetrics(extraction.manifest),
  };

  const documentData: Prisma.DocumentUpdateInput = isSuccess
    ? {
        extractedText: encryptText(extraction.text),
        processingStatus: "COMPLETED",
        extractionQuality: extraction.quality,
        extractionMetrics: sharedMetrics,
        extractionWarnings:
          extractionWarnings.length > 0
            ? (JSON.parse(JSON.stringify(extractionWarnings)) as Prisma.InputJsonValue)
            : Prisma.DbNull,
        requiresOCR,
        ocrProcessed: ocrApplied,
      }
    : {
        processingStatus: "FAILED",
        extractionQuality: extraction.quality,
        extractionMetrics: sharedMetrics,
        extractionWarnings: JSON.parse(JSON.stringify([errorWarning])) as Prisma.InputJsonValue,
      };

  await completeDocumentExtractionRun({
    runId: extractionRunId,
    text: extraction.text,
    qualityScore: extraction.quality,
    manifest: extraction.manifest,
    warnings: extractionWarnings.length > 0 ? JSON.parse(JSON.stringify(extractionWarnings)) : [],
    documentFinalization: { documentId, data: documentData },
  });

  // Actual extraction cost derived from the manifest's credit estimate —
  // the Inngest function reconciles this against the pre-charge.
  const actualCredits = Math.max(
    0,
    Math.ceil(extraction.manifest.creditEstimate?.estimatedCredits ?? 0)
  );

  if (isSuccess) {
    await publishUploadProgress({
      phase: "completed",
      pageCount: extraction.manifest.pageCount,
      pagesProcessed: extraction.manifest.pagesProcessed,
      message: "Extraction completed",
    });
    return {
      status: "COMPLETED",
      textLength: extraction.text.length,
      pageCount: extraction.manifest.pageCount,
      quality: extraction.quality,
      warnings: extractionWarnings,
      requiresOCR,
      ocrApplied,
      extractionRunId,
      actualCredits,
    };
  }

  // No text — the run + document were ALREADY atomically committed as
  // FAILED above. The pipeline's outer catch will publish the `failed`
  // progress phase. Throw so the Inngest function compensates (refund).
  throw new ExtractionPipelineError(
    extraction.manifest.hardBlockers[0]?.message ?? "Failed to extract text from PDF",
    "EXTRACTION_FAILED"
  );
}

async function summarizeExistingRun(
  documentId: string,
  extractionRunId: string,
  // Only the SUCCESS-terminal statuses reach here — a FAILED run throws
  // before this is called (so the Inngest catch re-compensates).
  _runStatus: "READY" | "READY_WITH_WARNINGS" | "BLOCKED"
): Promise<ExtractionPipelineResult> {
  // The run has already SUCCEEDED on a previous attempt. We re-emit a
  // shape compatible with a fresh run so Inngest retries get a stable
  // response. We do NOT re-charge or re-mutate the Document row.
  const [doc, runWithCount] = await Promise.all([
    prisma.document.findUnique({
      where: { id: documentId },
      select: {
        extractionQuality: true,
        requiresOCR: true,
        ocrProcessed: true,
        extractionWarnings: true,
        extractedText: true,
        processingStatus: true,
      },
    }),
    prisma.documentExtractionRun.findUnique({
      where: { id: extractionRunId },
      select: { pageCount: true, pagesProcessed: true, summaryMetrics: true },
    }),
  ]);
  const warnings = Array.isArray(doc?.extractionWarnings)
    ? (doc!.extractionWarnings as unknown as ExtractionWarning[])
    : [];
  // Re-derive actualCredits from the persisted run so a retry's reconciliation
  // (if any) sees the same cost as the original attempt. 0 if absent.
  const metrics = runWithCount?.summaryMetrics;
  const creditEstimate =
    metrics && typeof metrics === "object" && !Array.isArray(metrics)
      ? (metrics as { creditEstimate?: { estimatedCredits?: unknown } }).creditEstimate
      : undefined;
  const actualCredits =
    typeof creditEstimate?.estimatedCredits === "number"
      ? Math.max(0, Math.ceil(creditEstimate.estimatedCredits))
      : 0;
  return {
    status: "COMPLETED",
    textLength: doc?.extractedText?.length ?? 0,
    pageCount: runWithCount?.pageCount ?? 0,
    quality: doc?.extractionQuality ?? null,
    warnings,
    requiresOCR: doc?.requiresOCR ?? false,
    ocrApplied: doc?.ocrProcessed ?? false,
    extractionRunId,
    actualCredits,
  };
}
