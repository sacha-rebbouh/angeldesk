import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 4.1 fix-up #2 — prove that `completeDocumentExtractionRun` commits
// the run's terminal status AND the parent Document update inside the SAME
// Prisma transaction when `documentFinalization` is supplied. The audit
// hole was: run → terminal-success committed independently of the document,
// so a crash in between left run=READY + document not finalized.

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  txPageDeleteMany: vi.fn(),
  // B3.3.3 P1 — completeDocumentExtractionRun now uses updateMany WHERE
  // status IN LIVE (monotonic guard) and re-fetches via findUnique for
  // the return shape; pages move to createMany. The legacy `txRunUpdate`
  // mock is kept for parity with other tests in the suite but is no
  // longer wired to the function under test.
  txRunUpdate: vi.fn(),
  txRunUpdateMany: vi.fn(),
  txRunFindUnique: vi.fn(),
  txPageCreateMany: vi.fn(),
  txDocumentUpdate: vi.fn(),
  txDocumentFindUnique: vi.fn(),
  txDocumentFindFirst: vi.fn(),
  txDocumentUpdateMany: vi.fn(),
  txExecuteRaw: vi.fn(),
  runCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    documentExtractionRun: { create: mocks.runCreate },
  },
}));

const { completeDocumentExtractionRun, recordDocumentExtractionRun } = await import(
  "../extraction-runs"
);

function buildManifest() {
  return {
    version: "strict-pdf-v1" as const,
    status: "ready" as const,
    pageCount: 2,
    pagesProcessed: 2,
    pagesSucceeded: 2,
    pagesFailed: 0,
    pagesSkipped: 0,
    coverageRatio: 1,
    textPages: 2,
    ocrPages: 0,
    hybridPages: 0,
    failedPages: [],
    skippedPages: [],
    criticalPages: [],
    hardBlockers: [],
    creditEstimate: {
      estimatedCredits: 0,
      estimatedUsd: 0,
      pagesByTier: {},
      unitCredits: {},
      unitUsd: {},
      cachedPages: 0,
    },
    pages: [],
    completedAt: "2026-05-14T00:00:00.000Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // The tx client surfaces the run/page/document writes, plus the reads
  // `promoteDocumentVersionTx` performs (Phase 4.3 — candidate promotion
  // runs inside the SAME transaction as the run terminal status).
  const tx = {
    $executeRaw: mocks.txExecuteRaw,
    documentExtractionPage: {
      deleteMany: mocks.txPageDeleteMany,
      createMany: mocks.txPageCreateMany,
    },
    documentExtractionRun: {
      update: mocks.txRunUpdate,
      updateMany: mocks.txRunUpdateMany,
      findUnique: mocks.txRunFindUnique,
    },
    document: {
      update: mocks.txDocumentUpdate,
      findUnique: mocks.txDocumentFindUnique,
      findFirst: mocks.txDocumentFindFirst,
      updateMany: mocks.txDocumentUpdateMany,
    },
  };
  mocks.txExecuteRaw.mockResolvedValue(1);
  mocks.txPageDeleteMany.mockResolvedValue({ count: 0 });
  mocks.txPageCreateMany.mockResolvedValue({ count: 0 });
  mocks.txRunUpdate.mockResolvedValue({ id: "run_1", status: "READY" });
  // B3.3.3 P1 — default: monotonic update succeeds (count===1, run was live).
  mocks.txRunUpdateMany.mockResolvedValue({ count: 1 });
  mocks.txRunFindUnique.mockResolvedValue({
    id: "run_1",
    status: "READY",
    pages: [],
    overrides: [],
  });
  mocks.txDocumentUpdate.mockResolvedValue({ id: "doc_1" });
  // Default: the finalized document is a brand-new single version that is
  // already COMPLETED — promotion is a harmless no-op (no other isLatest
  // siblings in the lineage). Individual tests override as needed.
  mocks.txDocumentFindUnique.mockResolvedValue({
    id: "doc_1",
    dealId: "deal_1",
    name: "file.pdf",
    corpusParentDocumentId: null,
    version: 1,
    processingStatus: "COMPLETED",
  });
  mocks.txDocumentFindFirst.mockResolvedValue(null);
  mocks.txDocumentUpdateMany.mockResolvedValue({ count: 0 });
  mocks.transaction.mockImplementation(async (fn: (innerTx: typeof tx) => unknown) => fn(tx));
  mocks.runCreate.mockResolvedValue({ id: "run_new", status: "READY" });
});

describe("recordDocumentExtractionRun — shared corpus-usability rule", () => {
  it("forces run status FAILED when the corpus is empty/whitespace, even on a ready_with_warnings manifest", async () => {
    // Same divergence guard as completeDocumentExtractionRun: the image /
    // Office upload paths call recordDocumentExtractionRun; an empty
    // composed corpus must NOT yield a terminal-success run.
    const manifest = {
      ...buildManifest(),
      status: "ready_with_warnings" as const,
      pagesProcessed: 1,
      pagesSucceeded: 1,
    };

    await recordDocumentExtractionRun({
      documentId: "doc_1",
      documentVersion: 1,
      text: "   \n ",
      qualityScore: 5,
      manifest: manifest as never,
      warnings: [],
    });

    expect(mocks.runCreate).toHaveBeenCalledTimes(1);
    const createData = mocks.runCreate.mock.calls[0]?.[0]?.data;
    expect(createData?.status).toBe("FAILED");
    expect(createData?.readyForAnalysis).toBe(false);
  });

  it("keeps the manifest-derived status when the corpus is non-empty", async () => {
    const manifest = { ...buildManifest(), status: "ready_with_warnings" as const };
    await recordDocumentExtractionRun({
      documentId: "doc_1",
      documentVersion: 1,
      text: "real corpus text",
      qualityScore: 70,
      manifest: manifest as never,
      warnings: [],
    });
    const createData = mocks.runCreate.mock.calls[0]?.[0]?.data;
    expect(createData?.status).toBe("READY_WITH_WARNINGS");
  });
});

describe("completeDocumentExtractionRun — atomic documentFinalization", () => {
  it("updates the parent Document INSIDE the same transaction as the run terminal status", async () => {
    await completeDocumentExtractionRun({
      runId: "run_1",
      text: "extracted text",
      qualityScore: 90,
      manifest: buildManifest() as never,
      warnings: [],
      documentFinalization: {
        documentId: "doc_1",
        data: { processingStatus: "COMPLETED", extractedText: "encrypted" },
      },
    });

    // All writes used the SAME tx client handed by $transaction.
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.txRunUpdateMany).toHaveBeenCalledTimes(1);
    // Two document writes inside the tx: the finalization data, then the
    // Phase 4.3 candidate promotion (`isLatest: true`).
    expect(mocks.txDocumentUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.txDocumentUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: "doc_1" },
      data: { processingStatus: "COMPLETED", extractedText: "encrypted" },
    });
    expect(mocks.txDocumentUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: "doc_1" },
      data: { isLatest: true, supersededAt: null },
    });
    // Ordering inside the tx: run terminalized, THEN document finalized,
    // THEN the candidate promoted — all in one transaction.
    const runOrder = mocks.txRunUpdateMany.mock.invocationCallOrder[0];
    const finalizeOrder = mocks.txDocumentUpdate.mock.invocationCallOrder[0];
    const promoteOrder = mocks.txDocumentUpdate.mock.invocationCallOrder[1];
    expect(runOrder).toBeLessThan(finalizeOrder);
    expect(finalizeOrder).toBeLessThan(promoteOrder);
  });

  it("does NOT touch the Document when documentFinalization is omitted (legacy callers)", async () => {
    await completeDocumentExtractionRun({
      runId: "run_1",
      text: "extracted text",
      qualityScore: 90,
      manifest: buildManifest() as never,
      warnings: [],
    });

    expect(mocks.txRunUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.txDocumentUpdate).not.toHaveBeenCalled();
  });

  it("P1: forces run status FAILED when the final corpus is empty, even if the manifest says ready_with_warnings", async () => {
    // Codex repro: the OCR path can return success with pagesProcessed > 0
    // but composeOCRText() yields "" (all OCR pages had text.length === 0).
    // `mapRunStatus` only reads the manifest, so the run could land
    // READY_WITH_WARNINGS / BLOCKED — a terminal "success" — while the
    // document was finalized FAILED. A retry would then no-op on the
    // terminal-success run and never repair anything.
    const manifest = {
      ...buildManifest(),
      status: "ready_with_warnings" as const,
      pagesProcessed: 3,
      pagesSucceeded: 3,
    };

    await completeDocumentExtractionRun({
      runId: "run_1",
      text: "   \n  ", // whitespace-only → effectively empty corpus
      qualityScore: 10,
      manifest: manifest as never,
      warnings: [],
      documentFinalization: {
        documentId: "doc_1",
        data: { processingStatus: "FAILED" },
      },
    });

    expect(mocks.txRunUpdateMany).toHaveBeenCalledTimes(1);
    const runUpdateData = mocks.txRunUpdateMany.mock.calls[0]?.[0]?.data;
    expect(runUpdateData?.status).toBe("FAILED");
    expect(runUpdateData?.readyForAnalysis).toBe(false);
  });

  it("keeps the manifest-derived status when the corpus is non-empty", async () => {
    const manifest = { ...buildManifest(), status: "ready_with_warnings" as const };
    await completeDocumentExtractionRun({
      runId: "run_1",
      text: "real extracted corpus",
      qualityScore: 70,
      manifest: manifest as never,
      warnings: [],
    });
    const runUpdateData = mocks.txRunUpdateMany.mock.calls[0]?.[0]?.data;
    expect(runUpdateData?.status).toBe("READY_WITH_WARNINGS");
  });

  it("a throw inside the tx (document.update fails) propagates — caller sees the rollback", async () => {
    mocks.txDocumentUpdate.mockRejectedValue(new Error("connection reset"));

    await expect(
      completeDocumentExtractionRun({
        runId: "run_1",
        text: "extracted text",
        qualityScore: 90,
        manifest: buildManifest() as never,
        warnings: [],
        documentFinalization: {
          documentId: "doc_1",
          data: { processingStatus: "COMPLETED" },
        },
      })
    ).rejects.toThrow("connection reset");

    // The run update ran, but because it is the SAME transaction the real
    // Prisma client would roll it back. The contract we assert here: the
    // throw is NOT swallowed — the caller (pipeline) sees it and can
    // terminalize the run defensively.
    expect(mocks.txRunUpdateMany).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// B3.3.3 P1 — monotonic guard against late-completing terminalized runs
// ============================================================
describe("completeDocumentExtractionRun — Codex B3.3.3 P1 monotone (no late completion)", () => {
  it("RED — run already terminal (updateMany returns count===0) → throws RunAlreadyTerminalError, document NEVER mutated", async () => {
    // Repro: `/api/documents/:id/process` stale-retry terminalized this run
    // as FAILED. Then the late-arriving Inngest worker fires
    // completeDocumentExtractionRun on the SAME runId. Without the
    // monotonic guard, the worker would flip the row back to READY and
    // (worse) mutate the Document — overwriting the new run's work.
    const { RunAlreadyTerminalError } = await import("../extraction-runs");
    mocks.txRunUpdateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      completeDocumentExtractionRun({
        runId: "run_already_terminal",
        text: "extracted text",
        qualityScore: 90,
        manifest: buildManifest() as never,
        warnings: [],
        documentFinalization: {
          documentId: "doc_1",
          data: { processingStatus: "COMPLETED", extractedText: "encrypted" },
        },
      })
    ).rejects.toBeInstanceOf(RunAlreadyTerminalError);

    // Critical assertions: NO document mutation when the run is terminal.
    expect(mocks.txDocumentUpdate).not.toHaveBeenCalled();
    expect(mocks.txDocumentUpdateMany).not.toHaveBeenCalled();
    // Pages must not be created either (they'd be orphans).
    expect(mocks.txPageCreateMany).not.toHaveBeenCalled();
    // Re-fetch must not happen — we bailed.
    expect(mocks.txRunFindUnique).not.toHaveBeenCalled();
  });

  it("Codex B3.3.3 P1 — updateMany WHERE includes status IN [PENDING, PROCESSING] (atomic guard)", async () => {
    await completeDocumentExtractionRun({
      runId: "run_live",
      text: "extracted text",
      qualityScore: 90,
      manifest: buildManifest() as never,
      warnings: [],
    });
    const where = mocks.txRunUpdateMany.mock.calls[0]?.[0]?.where;
    expect(where?.id).toBe("run_live");
    // WHERE must filter on LIVE statuses so a terminal row doesn't match.
    expect(where?.status?.in).toEqual(expect.arrayContaining(["PENDING", "PROCESSING"]));
  });
});

// Phase 4.5 — Gate Audit 4: "ancien document préservé si nouvelle version
// failed". The candidate-version promotion is gated on a usable corpus
// INSIDE `completeDocumentExtractionRun` (the COMPLETED ⟺ success bridge).
// These tests pin the two outcomes of a re-uploaded version's extraction.
describe("completeDocumentExtractionRun — Phase 4.5 version preservation", () => {
  it("a FAILED finalization (empty corpus) NEVER promotes — the old version is preserved", async () => {
    // Scenario: a re-uploaded candidate version's extraction yields no usable
    // corpus. `completeDocumentExtractionRun` finalizes it FAILED and MUST
    // NOT run the version promotion — otherwise the still-`isLatest` old
    // (working) version could be demoted behind a broken new one.
    const manifest = {
      ...buildManifest(),
      status: "ready_with_warnings" as const,
      pagesProcessed: 2,
      pagesSucceeded: 2,
    };

    await completeDocumentExtractionRun({
      runId: "run_1",
      text: "  \n\t ", // whitespace-only → not a usable corpus → FAILED
      qualityScore: 5,
      manifest: manifest as never,
      warnings: [],
      documentFinalization: {
        documentId: "doc_1",
        data: { processingStatus: "FAILED" },
      },
    });

    // The finalization write happened (document → FAILED)…
    expect(mocks.txDocumentUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.txDocumentUpdate).toHaveBeenCalledWith({
      where: { id: "doc_1" },
      data: { processingStatus: "FAILED" },
    });
    // …but NOTHING from the promotion path ran: no advisory lock, no lineage
    // read, no demote of sibling versions. The old version's `isLatest` is
    // never touched.
    expect(mocks.txExecuteRaw).not.toHaveBeenCalled();
    expect(mocks.txDocumentFindUnique).not.toHaveBeenCalled();
    expect(mocks.txDocumentUpdateMany).not.toHaveBeenCalled();
  });

  it("a COMPLETED finalization promotes the candidate AND demotes the prior isLatest version (full flip, one transaction)", async () => {
    // Scenario: the re-uploaded candidate version's extraction succeeded.
    // `completeDocumentExtractionRun` finalizes it COMPLETED and, in the SAME
    // transaction, flips the lineage: demote every other current `isLatest`,
    // promote this candidate.
    mocks.txDocumentFindUnique.mockResolvedValue({
      id: "doc_1",
      dealId: "deal_1",
      name: "file.pdf",
      corpusParentDocumentId: null,
      version: 2,
      processingStatus: "COMPLETED",
    });
    mocks.txDocumentFindFirst.mockResolvedValue(null); // no strictly-newer version
    mocks.txDocumentUpdateMany.mockResolvedValue({ count: 1 }); // one prior version demoted

    await completeDocumentExtractionRun({
      runId: "run_1",
      text: "real extracted corpus",
      qualityScore: 88,
      manifest: buildManifest() as never,
      warnings: [],
      documentFinalization: {
        documentId: "doc_1",
        data: { processingStatus: "COMPLETED", extractedText: "encrypted" },
      },
    });

    // The prior `isLatest` version(s) of the SAME lineage are demoted…
    expect(mocks.txDocumentUpdateMany).toHaveBeenCalledWith({
      where: {
        dealId: "deal_1",
        name: "file.pdf",
        corpusParentDocumentId: null,
        isLatest: true,
        id: { not: "doc_1" },
      },
      data: { isLatest: false, supersededAt: expect.any(Date) },
    });
    // …and the candidate is promoted — both inside the run's transaction.
    expect(mocks.txDocumentUpdate).toHaveBeenCalledWith({
      where: { id: "doc_1" },
      data: { isLatest: true, supersededAt: null },
    });
    // Demote-then-promote ordering: never two `isLatest` mid-transaction.
    expect(mocks.txDocumentUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.txDocumentUpdate.mock.invocationCallOrder[1]
    );
  });
});
