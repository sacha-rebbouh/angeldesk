import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Phase 4.1 — unit tests of the durable extraction pipeline service. The
// service is the body of the Inngest function; testing it directly lets us
// pin down the idempotency / no-oscillation contract without the cost of
// spinning up an Inngest devserver.

const mocks = vi.hoisted(() => ({
  documentFindUnique: vi.fn(),
  documentUpdate: vi.fn(),
  documentUpdateMany: vi.fn(),
  runFindUnique: vi.fn(),
  smartExtract: vi.fn(),
  downloadFile: vi.fn(),
  completeDocumentExtractionRun: vi.fn(),
  markExtractionRunProgress: vi.fn(),
  recordExtractionPageProgress: vi.fn(),
  summarizeManifestForLegacyMetrics: vi.fn(() => ({})),
  getBlockingPageNumbersFromManifest: vi.fn(() => [] as number[]),
  terminalizeExtractionRunAsFailed: vi.fn(),
  setDocumentExtractionProgress: vi.fn(),
  buildProgressSnapshot: vi.fn((arg: unknown) => arg),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findUnique: mocks.documentFindUnique,
      update: mocks.documentUpdate,
      updateMany: mocks.documentUpdateMany,
    },
    documentExtractionRun: { findUnique: mocks.runFindUnique },
  },
}));
vi.mock("@/services/pdf", () => ({
  smartExtract: mocks.smartExtract,
}));
vi.mock("@/services/storage", () => ({
  downloadFile: mocks.downloadFile,
}));
vi.mock("@/services/documents/extraction-runs", () => ({
  completeDocumentExtractionRun: mocks.completeDocumentExtractionRun,
  getBlockingPageNumbersFromManifest: mocks.getBlockingPageNumbersFromManifest,
  markExtractionRunProgress: mocks.markExtractionRunProgress,
  recordExtractionPageProgress: mocks.recordExtractionPageProgress,
  summarizeManifestForLegacyMetrics: mocks.summarizeManifestForLegacyMetrics,
  terminalizeExtractionRunAsFailed: mocks.terminalizeExtractionRunAsFailed,
  // Pure helper — use the REAL definition so the pipeline test exercises
  // the exact same corpus-usability logic as completeDocumentExtractionRun.
  hasUsableExtractionCorpus: (text: string | null | undefined) =>
    typeof text === "string" && text.trim().length > 0,
}));
vi.mock("@/services/documents/extraction-progress", () => ({
  setDocumentExtractionProgress: mocks.setDocumentExtractionProgress,
  buildProgressSnapshot: mocks.buildProgressSnapshot,
}));

const TEST_KEY = "d".repeat(64);

beforeAll(() => {
  vi.stubEnv("DOCUMENT_ENCRYPTION_KEY", TEST_KEY);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.clearAllMocks();
  // updateMany returns a Prisma-batch-payload-like object (the pipeline
  // catch chains `.catch(...)` on it).
  mocks.documentUpdateMany.mockResolvedValue({ count: 1 });
  mocks.terminalizeExtractionRunAsFailed.mockResolvedValue(1);
});

const { runDocumentExtractionPipeline, ExtractionPipelineError, EXTRACTION_TIME_BUDGET_MS } =
  await import("../extraction-pipeline");

function buildExtractionResult(overrides: Partial<{
  text: string;
  quality: number;
  method: "native" | "ocr" | "hybrid";
  pagesOCRd: number;
  estimatedCost: number;
  manifest: Record<string, unknown>;
}> = {}) {
  const manifest = overrides.manifest ?? {
    version: "strict-pdf-v1",
    status: "ready",
    pageCount: 3,
    pagesProcessed: 3,
    pagesSucceeded: 3,
    pagesFailed: 0,
    pagesSkipped: 0,
    coverageRatio: 1,
    textPages: 3,
    ocrPages: 0,
    hybridPages: 0,
    failedPages: [],
    skippedPages: [],
    criticalPages: [],
    hardBlockers: [],
    creditEstimate: { estimatedCredits: 0, estimatedUsd: 0, pagesByTier: {}, unitCredits: {}, unitUsd: {}, cachedPages: 0 },
    pages: [],
    completedAt: "2026-05-14T00:00:00.000Z",
  };
  return {
    text: "extracted PDF text",
    quality: 88,
    method: "native" as const,
    pagesOCRd: 0,
    estimatedCost: 0,
    manifest,
    ...overrides,
  };
}

describe("runDocumentExtractionPipeline — happy path", () => {
  beforeEach(() => {
    mocks.documentFindUnique.mockResolvedValue({
      id: "doc_1",
      mimeType: "application/pdf",
      storageUrl: "https://blob/x",
      storagePath: "deals/x.pdf",
      processingStatus: "PROCESSING",
    });
    mocks.runFindUnique.mockResolvedValue({
      id: "run_1",
      documentId: "doc_1",
      status: "STARTED",
    });
    mocks.downloadFile.mockResolvedValue(Buffer.from("pdf-bytes"));
    mocks.smartExtract.mockResolvedValue(buildExtractionResult());
    mocks.completeDocumentExtractionRun.mockResolvedValue({
      id: "run_1",
      readyForAnalysis: true,
      status: "READY",
    });
    mocks.documentUpdate.mockResolvedValue({});
  });

  it("runs smartExtract, persists, and reports COMPLETED with the right shape", async () => {
    const result = await runDocumentExtractionPipeline({
      documentId: "doc_1",
      extractionRunId: "run_1",
    });

    expect(result).toMatchObject({
      status: "COMPLETED",
      textLength: "extracted PDF text".length,
      pageCount: 3,
      quality: 88,
      requiresOCR: false,
      ocrApplied: false,
      extractionRunId: "run_1",
    });
    expect(mocks.smartExtract).toHaveBeenCalledTimes(1);
    expect(mocks.completeDocumentExtractionRun).toHaveBeenCalledTimes(1);
    // Atomic finalization: the Document update is now passed as
    // `documentFinalization` to completeDocumentExtractionRun (one
    // transaction), NOT a separate prisma.document.update call.
    expect(mocks.completeDocumentExtractionRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run_1",
        documentFinalization: {
          documentId: "doc_1",
          data: expect.objectContaining({ processingStatus: "COMPLETED" }),
        },
      })
    );
    expect(mocks.documentUpdate).not.toHaveBeenCalled();
  });

  it("flags requiresOCR=true when the manifest has hard blockers / blocking pages", async () => {
    mocks.smartExtract.mockResolvedValue(
      buildExtractionResult({
        method: "hybrid",
        manifest: {
          ...buildExtractionResult().manifest,
          status: "ready_with_warnings",
          hardBlockers: [{ code: "OCR_LOW_CONFIDENCE", message: "low", pageNumber: 2 }],
        },
      })
    );
    mocks.getBlockingPageNumbersFromManifest.mockReturnValue([2]);

    const result = await runDocumentExtractionPipeline({
      documentId: "doc_1",
      extractionRunId: "run_1",
    });

    expect(result.requiresOCR).toBe(true);
    expect(result.ocrApplied).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.code).toBe("OCR_LOW_CONFIDENCE");
  });

  it("P1: treats a whitespace-only corpus as a FAILURE (no run/document/API divergence)", async () => {
    // Codex repro: the OCR path can return success with pagesProcessed > 0
    // but a whitespace-only / empty composed corpus. The pipeline's success
    // test must use the SAME definition as completeDocumentExtractionRun
    // (`text.trim().length > 0`) — otherwise: run FAILED, document COMPLETED,
    // pipeline returns COMPLETED → Inngest never refunds.
    mocks.smartExtract.mockResolvedValue(
      buildExtractionResult({
        text: "   \n  \t ",
        manifest: {
          ...buildExtractionResult().manifest,
          status: "ready_with_warnings",
          pagesProcessed: 3,
          pagesSucceeded: 3,
        },
      })
    );

    await expect(
      runDocumentExtractionPipeline({ documentId: "doc_1", extractionRunId: "run_1" })
    ).rejects.toMatchObject({ code: "EXTRACTION_FAILED" });

    // The document must be finalized FAILED, not COMPLETED — and through
    // the SAME atomic transaction as the run.
    expect(mocks.completeDocumentExtractionRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run_1",
        documentFinalization: {
          documentId: "doc_1",
          data: expect.objectContaining({ processingStatus: "FAILED" }),
        },
      })
    );
  });
});

describe("runDocumentExtractionPipeline — Phase 4.2 progress + actualCredits", () => {
  beforeEach(() => {
    mocks.documentFindUnique.mockResolvedValue({
      id: "doc_1",
      mimeType: "application/pdf",
      storageUrl: "https://blob/x",
      storagePath: null,
      processingStatus: "PROCESSING",
    });
    mocks.runFindUnique.mockResolvedValue({ id: "run_1", documentId: "doc_1", status: "STARTED" });
    mocks.downloadFile.mockResolvedValue(Buffer.from("pdf-bytes"));
    mocks.completeDocumentExtractionRun.mockResolvedValue({ id: "run_1", status: "READY" });
  });

  it("reports actualCredits derived from the manifest credit estimate", async () => {
    mocks.smartExtract.mockResolvedValue(
      buildExtractionResult({
        manifest: {
          ...buildExtractionResult().manifest,
          creditEstimate: {
            estimatedCredits: 7,
            estimatedUsd: 0.02,
            pagesByTier: {},
            unitCredits: {},
            unitUsd: {},
            cachedPages: 0,
          },
        },
      })
    );

    const result = await runDocumentExtractionPipeline({
      documentId: "doc_1",
      extractionRunId: "run_1",
    });

    expect(result.actualCredits).toBe(7);
  });

  it("publishes upload progress (started → completed) when progressPublishing is supplied", async () => {
    mocks.smartExtract.mockResolvedValue(buildExtractionResult());

    await runDocumentExtractionPipeline({
      documentId: "doc_1",
      extractionRunId: "run_1",
      progressPublishing: {
        uploadProgressId: "progress_1",
        userId: "user_1",
        documentName: "deck.pdf",
      },
    });

    const phases = mocks.setDocumentExtractionProgress.mock.calls.map(
      (call) => (call[0] as { phase: string }).phase
    );
    expect(phases).toContain("started");
    expect(phases).toContain("completed");
    // Every snapshot is keyed by the supplied uploadProgressId.
    for (const call of mocks.setDocumentExtractionProgress.mock.calls) {
      expect((call[0] as { id: string }).id).toBe("progress_1");
    }
  });

  it("publishes a `failed` upload progress phase when the extraction throws", async () => {
    mocks.downloadFile.mockRejectedValue(new Error("blob 404"));

    await expect(
      runDocumentExtractionPipeline({
        documentId: "doc_1",
        extractionRunId: "run_1",
        progressPublishing: {
          uploadProgressId: "progress_1",
          userId: "user_1",
          documentName: "deck.pdf",
        },
      })
    ).rejects.toThrow();

    const phases = mocks.setDocumentExtractionProgress.mock.calls.map(
      (call) => (call[0] as { phase: string }).phase
    );
    expect(phases).toContain("failed");
  });

  it("does NOT publish progress when progressPublishing is omitted (the /process flow)", async () => {
    mocks.smartExtract.mockResolvedValue(buildExtractionResult());

    await runDocumentExtractionPipeline({
      documentId: "doc_1",
      extractionRunId: "run_1",
    });

    expect(mocks.setDocumentExtractionProgress).not.toHaveBeenCalled();
  });

  it.each(["READY", "READY_WITH_WARNINGS", "BLOCKED"] as const)(
    "Codex P2: a retry landing on a terminal %s run republishes `completed` progress (idempotent)",
    async (terminalStatus) => {
      // Prior attempt committed the run + document but crashed before
      // publishing the terminal progress phase. The retry sees a terminal
      // run → summarizeExistingRun (no re-extraction) — but it MUST still
      // republish `completed` so the upload modal's poller stops.
      mocks.documentFindUnique.mockResolvedValue({
        id: "doc_1",
        mimeType: "application/pdf",
        storageUrl: "https://blob/x",
        storagePath: null,
        processingStatus: "COMPLETED",
        extractionQuality: 90,
        requiresOCR: false,
        ocrProcessed: true,
        extractionWarnings: [],
        extractedText: "cached-text",
      });
      mocks.runFindUnique.mockResolvedValue({
        id: "run_1",
        documentId: "doc_1",
        status: terminalStatus,
        summaryMetrics: {},
        pageCount: 5,
        pagesProcessed: 5,
      });

      await runDocumentExtractionPipeline({
        documentId: "doc_1",
        extractionRunId: "run_1",
        progressPublishing: {
          uploadProgressId: "progress_1",
          userId: "user_1",
          documentName: "deck.pdf",
        },
      });

      expect(mocks.smartExtract).not.toHaveBeenCalled();
      const phases = mocks.setDocumentExtractionProgress.mock.calls.map(
        (call) => (call[0] as { phase: string }).phase
      );
      expect(phases).toContain("completed");
    }
  );

  it("Codex P2: a retry landing on a terminal FAILED run republishes `failed` progress before throwing", async () => {
    mocks.documentFindUnique.mockResolvedValue({
      id: "doc_1",
      mimeType: "application/pdf",
      storageUrl: "https://blob/x",
      storagePath: null,
      processingStatus: "FAILED",
    });
    mocks.runFindUnique.mockResolvedValue({
      id: "run_1",
      documentId: "doc_1",
      status: "FAILED",
    });

    await expect(
      runDocumentExtractionPipeline({
        documentId: "doc_1",
        extractionRunId: "run_1",
        progressPublishing: {
          uploadProgressId: "progress_1",
          userId: "user_1",
          documentName: "deck.pdf",
        },
      })
    ).rejects.toMatchObject({ code: "EXTRACTION_FAILED" });

    expect(mocks.smartExtract).not.toHaveBeenCalled();
    const phases = mocks.setDocumentExtractionProgress.mock.calls.map(
      (call) => (call[0] as { phase: string }).phase
    );
    expect(phases).toContain("failed");
  });
});

describe("runDocumentExtractionPipeline — idempotency on terminal runs", () => {
  // Phase 4 audit gate: "absence d'état oscillant, retries idempotents".
  // If the Inngest function retries after the run already SUCCEEDED, the
  // pipeline must return the cached summary WITHOUT re-charging the user,
  // re-running smartExtract, or flipping the document status.

  it.each(["READY", "READY_WITH_WARNINGS", "BLOCKED"] as const)(
    "re-running on a successful %s run is a no-op (no smartExtract, no document update)",
    async (terminalStatus) => {
      mocks.documentFindUnique.mockResolvedValue({
        id: "doc_1",
        mimeType: "application/pdf",
        storageUrl: "https://blob/x",
        storagePath: null,
        processingStatus: "COMPLETED",
        extractionQuality: 90,
        requiresOCR: false,
        ocrProcessed: true,
        extractionWarnings: [],
        extractedText: "cached-encrypted-text",
      });
      mocks.runFindUnique.mockResolvedValue({
        id: "run_1",
        documentId: "doc_1",
        status: terminalStatus,
      });

      const result = await runDocumentExtractionPipeline({
        documentId: "doc_1",
        extractionRunId: "run_1",
      });

      expect(result.status).toBe("COMPLETED");
      expect(mocks.smartExtract).not.toHaveBeenCalled();
      expect(mocks.completeDocumentExtractionRun).not.toHaveBeenCalled();
      expect(mocks.documentUpdate).not.toHaveBeenCalled();
    }
  );

  it("Phase 4.5 (crash recovery): a retry on a still-PROCESSING run re-runs the extraction and finalizes cleanly", async () => {
    // Scenario: the Inngest worker crashed mid-extraction — BEFORE the atomic
    // `completeDocumentExtractionRun` commit — so the run is still PROCESSING
    // (the commit either never ran or rolled back). Inngest retries the step.
    // The pipeline must NOT treat PROCESSING as terminal: it re-runs the
    // extraction work from scratch and finalizes. Page-level writes are
    // idempotent (upsert by runId+pageNumber), so the re-run converges.
    mocks.documentFindUnique.mockResolvedValue({
      id: "doc_1",
      mimeType: "application/pdf",
      storageUrl: "https://blob/x",
      storagePath: "deals/x.pdf",
      processingStatus: "PROCESSING",
    });
    mocks.runFindUnique.mockResolvedValue({
      id: "run_1",
      documentId: "doc_1",
      status: "PROCESSING",
    });
    mocks.downloadFile.mockResolvedValue(Buffer.from("pdf-bytes"));
    mocks.smartExtract.mockResolvedValue(buildExtractionResult());
    mocks.completeDocumentExtractionRun.mockResolvedValue({
      id: "run_1",
      readyForAnalysis: true,
      status: "READY",
    });

    const result = await runDocumentExtractionPipeline({
      documentId: "doc_1",
      extractionRunId: "run_1",
    });

    // PROCESSING is non-terminal → the pipeline re-runs (does NOT short-circuit).
    expect(mocks.smartExtract).toHaveBeenCalledTimes(1);
    expect(mocks.completeDocumentExtractionRun).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("COMPLETED");
  });

  it("P1.2: re-running on a FAILED run THROWS (so the Inngest catch re-compensates idempotently)", async () => {
    // Scenario: attempt 1 marked the run FAILED, then the Inngest worker
    // crashed before `compensate-failed-extraction` finished (no refund).
    // The retry must NOT see a tidy `status: "FAILED"` result and skip
    // compensation — it must throw so the Inngest function's catch runs
    // the refund again (idempotently via dispatchRefundKey).
    mocks.documentFindUnique.mockResolvedValue({
      id: "doc_1",
      mimeType: "application/pdf",
      storageUrl: "https://blob/x",
      storagePath: null,
      processingStatus: "FAILED",
    });
    mocks.runFindUnique.mockResolvedValue({
      id: "run_1",
      documentId: "doc_1",
      status: "FAILED",
    });

    await expect(
      runDocumentExtractionPipeline({ documentId: "doc_1", extractionRunId: "run_1" })
    ).rejects.toMatchObject({ code: "EXTRACTION_FAILED" });
    expect(mocks.smartExtract).not.toHaveBeenCalled();
  });
});

describe("runDocumentExtractionPipeline — failure paths", () => {
  it("throws DOCUMENT_NOT_FOUND when the document row is missing", async () => {
    mocks.documentFindUnique.mockResolvedValue(null);
    await expect(
      runDocumentExtractionPipeline({ documentId: "missing", extractionRunId: "run_1" })
    ).rejects.toMatchObject({ code: "DOCUMENT_NOT_FOUND" });
  });

  it("throws MIME_UNSUPPORTED for non-PDF documents and terminalizes the run", async () => {
    mocks.documentFindUnique.mockResolvedValue({
      id: "doc_1",
      mimeType: "image/png",
      storageUrl: "https://blob/x",
      storagePath: null,
      processingStatus: "PROCESSING",
    });
    mocks.runFindUnique.mockResolvedValue({ id: "run_1", documentId: "doc_1", status: "PROCESSING" });
    await expect(
      runDocumentExtractionPipeline({ documentId: "doc_1", extractionRunId: "run_1" })
    ).rejects.toMatchObject({ code: "MIME_UNSUPPORTED" });
    // MIME check now lives inside the terminalizing try block: a non-PDF
    // that somehow got enqueued does not leave its run stuck PROCESSING.
    expect(mocks.terminalizeExtractionRunAsFailed).toHaveBeenCalledWith("run_1", expect.any(String));
  });

  it("throws RUN_NOT_FOUND when the extractionRun does not belong to the document", async () => {
    mocks.documentFindUnique.mockResolvedValue({
      id: "doc_1",
      mimeType: "application/pdf",
      storageUrl: "https://blob/x",
      storagePath: null,
      processingStatus: "PROCESSING",
    });
    mocks.runFindUnique.mockResolvedValue({ id: "run_1", documentId: "OTHER_DOC", status: "STARTED" });
    await expect(
      runDocumentExtractionPipeline({ documentId: "doc_1", extractionRunId: "run_1" })
    ).rejects.toMatchObject({ code: "RUN_NOT_FOUND" });
  });

  it("throws NO_STORAGE when neither storageUrl nor storagePath is present", async () => {
    mocks.documentFindUnique.mockResolvedValue({
      id: "doc_1",
      mimeType: "application/pdf",
      storageUrl: null,
      storagePath: null,
      processingStatus: "PROCESSING",
    });
    mocks.runFindUnique.mockResolvedValue({ id: "run_1", documentId: "doc_1", status: "STARTED" });
    await expect(
      runDocumentExtractionPipeline({ documentId: "doc_1", extractionRunId: "run_1" })
    ).rejects.toMatchObject({ code: "NO_STORAGE" });
  });

  it("throws EXTRACTION_FAILED and marks the document FAILED when smartExtract returns no text", async () => {
    mocks.documentFindUnique.mockResolvedValue({
      id: "doc_1",
      mimeType: "application/pdf",
      storageUrl: "https://blob/x",
      storagePath: null,
      processingStatus: "PROCESSING",
    });
    mocks.runFindUnique.mockResolvedValue({ id: "run_1", documentId: "doc_1", status: "STARTED" });
    mocks.downloadFile.mockResolvedValue(Buffer.from("pdf"));
    mocks.smartExtract.mockResolvedValue(
      buildExtractionResult({
        text: "",
        manifest: {
          ...buildExtractionResult().manifest,
          status: "failed",
          hardBlockers: [{ code: "EXTRACTION_FAILED", message: "no usable text" }],
        },
      })
    );
    mocks.completeDocumentExtractionRun.mockResolvedValue({ id: "run_1", status: "FAILED" });

    await expect(
      runDocumentExtractionPipeline({ documentId: "doc_1", extractionRunId: "run_1" })
    ).rejects.toBeInstanceOf(ExtractionPipelineError);

    // The Document FAILED state commits ATOMICALLY with the run's terminal
    // status — passed as `documentFinalization` to completeDocumentExtractionRun,
    // not a separate prisma.document.update.
    expect(mocks.completeDocumentExtractionRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run_1",
        documentFinalization: {
          documentId: "doc_1",
          data: expect.objectContaining({ processingStatus: "FAILED" }),
        },
      })
    );
  });

  it("P1 (atomicity): when completeDocumentExtractionRun throws, the run is terminalized FAILED and NO orphan run-READY-without-document is left", async () => {
    // Codex repro: the atomic finalization transaction fails (DB hiccup,
    // crash mid-commit). Because run-terminal-success and document-COMPLETED
    // are now in ONE transaction, a throw rolls BOTH back — the run is still
    // PROCESSING. The pipeline's global catch then terminalizes it FAILED.
    // The key invariant: we NEVER end up with run=READY + document not
    // finalized, because `completeDocumentExtractionRun` either commits both
    // or neither.
    mocks.documentFindUnique.mockResolvedValue({
      id: "doc_1",
      mimeType: "application/pdf",
      storageUrl: "https://blob/x",
      storagePath: null,
      processingStatus: "PROCESSING",
    });
    mocks.runFindUnique.mockResolvedValue({ id: "run_1", documentId: "doc_1", status: "PROCESSING" });
    mocks.downloadFile.mockResolvedValue(Buffer.from("pdf"));
    mocks.smartExtract.mockResolvedValue(buildExtractionResult());
    // The atomic finalization transaction throws (simulates a crash /
    // rollback after the document.update inside the tx fails).
    mocks.completeDocumentExtractionRun.mockRejectedValue(new Error("tx rolled back: connection reset"));

    await expect(
      runDocumentExtractionPipeline({ documentId: "doc_1", extractionRunId: "run_1" })
    ).rejects.toThrow("tx rolled back");

    // The pipeline's global catch terminalizes the run (it is still
    // PROCESSING because the atomic tx rolled back — it was NEVER set to a
    // terminal-success status independently of the document).
    expect(mocks.terminalizeExtractionRunAsFailed).toHaveBeenCalledWith(
      "run_1",
      expect.stringContaining("tx rolled back")
    );
    // And the document is flipped FAILED via the guarded updateMany.
    expect(mocks.documentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "doc_1", processingStatus: "PROCESSING" },
        data: { processingStatus: "FAILED" },
      })
    );
    // No standalone prisma.document.update — the only document write path
    // is now inside the atomic transaction (which rolled back).
    expect(mocks.documentUpdate).not.toHaveBeenCalled();
  });

  it("translates a downloadFile failure into DOWNLOAD_FAILED", async () => {
    mocks.documentFindUnique.mockResolvedValue({
      id: "doc_1",
      mimeType: "application/pdf",
      storageUrl: "https://blob/x",
      storagePath: null,
      processingStatus: "PROCESSING",
    });
    mocks.runFindUnique.mockResolvedValue({ id: "run_1", documentId: "doc_1", status: "STARTED" });
    mocks.downloadFile.mockRejectedValue(new Error("blob 404"));
    await expect(
      runDocumentExtractionPipeline({ documentId: "doc_1", extractionRunId: "run_1" })
    ).rejects.toMatchObject({ code: "DOWNLOAD_FAILED" });
    // smartExtract must NOT have been called.
    expect(mocks.smartExtract).not.toHaveBeenCalled();
  });

  it("P1.1: terminalizes the run + document when downloadFile fails (run must not stay PROCESSING)", async () => {
    mocks.documentFindUnique.mockResolvedValue({
      id: "doc_1",
      mimeType: "application/pdf",
      storageUrl: "https://blob/x",
      storagePath: null,
      processingStatus: "PROCESSING",
    });
    mocks.runFindUnique.mockResolvedValue({ id: "run_1", documentId: "doc_1", status: "PROCESSING" });
    mocks.downloadFile.mockRejectedValue(new Error("blob 404"));

    await expect(
      runDocumentExtractionPipeline({ documentId: "doc_1", extractionRunId: "run_1" })
    ).rejects.toMatchObject({ code: "DOWNLOAD_FAILED" });

    // The run created PROCESSING by the HTTP route must be moved to a
    // terminal FAILED state — otherwise readiness/polling/audit see a
    // run stuck PROCESSING forever.
    expect(mocks.terminalizeExtractionRunAsFailed).toHaveBeenCalledWith(
      "run_1",
      expect.stringContaining("blob 404")
    );
    // The parent document must also be flipped to FAILED (the catch uses
    // updateMany guarded on processingStatus=PROCESSING for idempotency).
    expect(mocks.documentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "doc_1", processingStatus: "PROCESSING" },
        data: { processingStatus: "FAILED" },
      })
    );
  });

  it("P1.1: terminalizes the run + document when smartExtract throws unexpectedly", async () => {
    mocks.documentFindUnique.mockResolvedValue({
      id: "doc_1",
      mimeType: "application/pdf",
      storageUrl: "https://blob/x",
      storagePath: null,
      processingStatus: "PROCESSING",
    });
    mocks.runFindUnique.mockResolvedValue({ id: "run_1", documentId: "doc_1", status: "PROCESSING" });
    mocks.downloadFile.mockResolvedValue(Buffer.from("pdf"));
    mocks.smartExtract.mockRejectedValue(new Error("pdfjs segfault"));

    await expect(
      runDocumentExtractionPipeline({ documentId: "doc_1", extractionRunId: "run_1" })
    ).rejects.toThrow();

    expect(mocks.terminalizeExtractionRunAsFailed).toHaveBeenCalledWith(
      "run_1",
      expect.stringContaining("pdfjs segfault")
    );
    expect(mocks.documentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "doc_1", processingStatus: "PROCESSING" },
        data: { processingStatus: "FAILED" },
      })
    );
  });
});

describe("runDocumentExtractionPipeline — Phase 4.4 extraction time budget", () => {
  beforeEach(() => {
    mocks.documentFindUnique.mockResolvedValue({
      id: "doc_1",
      mimeType: "application/pdf",
      storageUrl: "https://blob/x",
      storagePath: "deals/x.pdf",
      processingStatus: "PROCESSING",
    });
    mocks.runFindUnique.mockResolvedValue({ id: "run_1", documentId: "doc_1", status: "STARTED" });
    mocks.downloadFile.mockResolvedValue(Buffer.from("pdf-bytes"));
    mocks.documentUpdate.mockResolvedValue({});
  });

  it("arms a real AbortController and threads a non-aborted signal into smartExtract on a fast extraction", async () => {
    let seenSignal: AbortSignal | undefined;
    mocks.smartExtract.mockImplementation(async (_buffer: Buffer, options: { signal?: AbortSignal }) => {
      seenSignal = options.signal;
      return buildExtractionResult();
    });
    mocks.completeDocumentExtractionRun.mockResolvedValue({
      id: "run_1",
      readyForAnalysis: true,
      status: "READY",
    });

    const result = await runDocumentExtractionPipeline({
      documentId: "doc_1",
      extractionRunId: "run_1",
    });

    // The budget is a REAL AbortController — not a decorative timer.
    expect(seenSignal).toBeInstanceOf(AbortSignal);
    // A fast extraction never trips the budget; the timer is cleared.
    expect(seenSignal?.aborted).toBe(false);
    expect(result.status).toBe("COMPLETED");
    expect(mocks.terminalizeExtractionRunAsFailed).not.toHaveBeenCalled();
  });

  it("rejects EXTRACTION_TIMEOUT at the budget even if smartExtract NEVER returns (real global budget)", async () => {
    // Codex Phase 4.4 P1: the between-batch abort is cooperative — it only
    // bounds work that checks the signal. A non-cooperative subcall (an
    // in-flight LLM request, a structured-provider fetch with no abort
    // support) could keep `smartExtract` pending past the budget. The race
    // against `budgetDeadline` is what makes the budget GLOBAL: the pipeline
    // MUST reject at the deadline regardless of whether smartExtract returns.
    vi.useFakeTimers();
    try {
      // smartExtract that never settles — the worst-case non-cooperative hang.
      mocks.smartExtract.mockImplementation(() => new Promise(() => {}));

      const promise = runDocumentExtractionPipeline({
        documentId: "doc_1",
        extractionRunId: "run_1",
      });
      const rejection = expect(promise).rejects.toMatchObject({
        name: "ExtractionPipelineError",
        code: "EXTRACTION_TIMEOUT",
      });
      await vi.advanceTimersByTimeAsync(EXTRACTION_TIME_BUDGET_MS + 1);
      await rejection;

      // The run + document are terminalized FAILED, and the persisted reason
      // carries the STABLE `EXTRACTION_TIMEOUT:` prefix (Codex P2) — not just
      // free-text — so audit / UI / runbooks can match on it.
      expect(mocks.terminalizeExtractionRunAsFailed).toHaveBeenCalledWith(
        "run_1",
        expect.stringMatching(/^EXTRACTION_TIMEOUT:/)
      );
      expect(mocks.documentUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "doc_1", processingStatus: "PROCESSING" },
          data: { processingStatus: "FAILED" },
        })
      );
      expect(mocks.completeDocumentExtractionRun).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("terminalizes FAILED with EXTRACTION_TIMEOUT when smartExtract cooperatively returns a PARTIAL result at the budget", async () => {
    // The other timeout path: the OCR loops DID cooperatively abort and
    // smartExtract returned a partial result right at the deadline. The
    // post-race `signal.aborted` check must still reject — a partial
    // strict-mode corpus is never finalized as success.
    vi.useFakeTimers();
    try {
      mocks.smartExtract.mockImplementation(
        async (_buffer: Buffer, options: { signal?: AbortSignal }) => {
          await new Promise<void>((resolve) => {
            options.signal?.addEventListener("abort", () => resolve());
          });
          return buildExtractionResult({ text: "partial corpus from a timed-out run" });
        }
      );

      const promise = runDocumentExtractionPipeline({
        documentId: "doc_1",
        extractionRunId: "run_1",
      });
      const rejection = expect(promise).rejects.toMatchObject({
        name: "ExtractionPipelineError",
        code: "EXTRACTION_TIMEOUT",
      });
      await vi.advanceTimersByTimeAsync(EXTRACTION_TIME_BUDGET_MS + 1);
      await rejection;

      expect(mocks.terminalizeExtractionRunAsFailed).toHaveBeenCalledWith(
        "run_1",
        expect.stringMatching(/^EXTRACTION_TIMEOUT:/)
      );
      expect(mocks.documentUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "doc_1", processingStatus: "PROCESSING" },
          data: { processingStatus: "FAILED" },
        })
      );
      // The partial corpus is NEVER finalized as success.
      expect(mocks.completeDocumentExtractionRun).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops late onProgress callbacks from the losing smartExtract once the budget has fired", async () => {
    // Codex Phase 4.4 P1: after the budget race wins, the losing smartExtract
    // keeps running in the background and can still emit progress callbacks.
    // The pipeline's onProgress guard must drop them — otherwise a late
    // `page_processed` would re-publish progress and re-open a terminal run.
    vi.useFakeTimers();
    try {
      let capturedOnProgress:
        | ((event: Record<string, unknown>) => Promise<void>)
        | undefined;
      mocks.smartExtract.mockImplementation(
        (_buffer: Buffer, options: { onProgress?: (e: Record<string, unknown>) => Promise<void> }) => {
          capturedOnProgress = options.onProgress;
          // Never resolves — the budget race wins; smartExtract "keeps
          // running in the background" exactly like the real non-cooperative
          // case.
          return new Promise(() => {});
        }
      );

      const promise = runDocumentExtractionPipeline({
        documentId: "doc_1",
        extractionRunId: "run_1",
        progressPublishing: {
          uploadProgressId: "prog_1",
          userId: "user_1",
          documentName: "deck.pdf",
        },
      });
      const rejection = expect(promise).rejects.toMatchObject({ code: "EXTRACTION_TIMEOUT" });
      await vi.advanceTimersByTimeAsync(EXTRACTION_TIME_BUDGET_MS + 1);
      await rejection;

      // Snapshot the progress-write call counts AFTER the budget terminalized
      // the run/document.
      const markCallsBefore = mocks.markExtractionRunProgress.mock.calls.length;
      const recordCallsBefore = mocks.recordExtractionPageProgress.mock.calls.length;
      const progressCallsBefore = mocks.setDocumentExtractionProgress.mock.calls.length;

      // Simulate the losing smartExtract emitting LATE callbacks after the
      // timeout (a background batch / provider call that finally returned).
      await capturedOnProgress?.({
        phase: "page_processed",
        page: { pageNumber: 7 },
        message: "late page",
      });
      await capturedOnProgress?.({ phase: "native_extracted", pageCount: 12, message: "late" });

      // The guard drops them: zero new progress writes after abort.
      expect(mocks.markExtractionRunProgress.mock.calls.length).toBe(markCallsBefore);
      expect(mocks.recordExtractionPageProgress.mock.calls.length).toBe(recordCallsBefore);
      expect(mocks.setDocumentExtractionProgress.mock.calls.length).toBe(progressCallsBefore);
    } finally {
      vi.useRealTimers();
    }
  });
});
