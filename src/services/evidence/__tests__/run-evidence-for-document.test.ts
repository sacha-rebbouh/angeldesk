/**
 * Phase 3.2 — Unit tests for runEvidenceForDocument (Codex round 10 P2).
 *
 * Helper-level tests with mocked Prisma + mocked downstream services
 * (runTemporalExtractor, persistTemporalSignals, promoteSourceDateFromSignals).
 * Covers the decision tree: skip branches, plaintext path vs decrypt path,
 * implicit vs explicit extractionRunId resolution.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  documentFindUnique: vi.fn(),
  runFindFirst: vi.fn(),
  safeDecrypt: vi.fn((value: string) => `DECRYPTED:${value}`),
  runTemporalExtractor: vi.fn(),
  persistTemporalSignals: vi.fn(),
  promoteSourceDateFromSignals: vi.fn(),
}));

vi.mock("@/lib/encryption", () => ({
  safeDecrypt: mocks.safeDecrypt,
}));

vi.mock("../temporal-extractor", () => ({
  TEMPORAL_EXTRACTOR_VERSION: "temporal-extractor@test",
  runTemporalExtractor: mocks.runTemporalExtractor,
}));

vi.mock("../persist-temporal-signals", () => ({
  persistTemporalSignals: mocks.persistTemporalSignals,
}));

vi.mock("../promote-source-date", () => ({
  promoteSourceDateFromSignals: mocks.promoteSourceDateFromSignals,
}));

const fakePrisma = {
  document: { findUnique: mocks.documentFindUnique },
  documentExtractionRun: { findFirst: mocks.runFindFirst },
} as never;

const TEST_KEY = "e".repeat(64);

beforeAll(() => {
  vi.stubEnv("DOCUMENT_ENCRYPTION_KEY", TEST_KEY);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.runTemporalExtractor.mockReturnValue([
    { derivedFrom: "extracted_text", kind: "CAP_TABLE_AS_OF" },
  ]);
  mocks.persistTemporalSignals.mockResolvedValue({
    persisted: 1,
    deduplicated: 0,
    skipped: 0,
    skippedReasons: [],
  });
  mocks.promoteSourceDateFromSignals.mockResolvedValue({ promoted: false, reason: "no_eligible_signal" });
});

const { runEvidenceForDocument } = await import("../run-evidence-for-document");

const baseDoc = {
  id: "doc_1",
  name: "Test.pdf",
  type: "CAP_TABLE",
  dealId: "deal_1",
  version: 1,
  mimeType: "application/pdf",
  sourceKind: "FILE" as const,
  sourceDate: null,
  sourceMetadata: null,
  extractedText: "ENCRYPTED_BLOB",
  processingStatus: "COMPLETED" as const,
};

describe("runEvidenceForDocument — skip branches", () => {
  it("skip if document not found", async () => {
    mocks.documentFindUnique.mockResolvedValue(null);
    const result = await runEvidenceForDocument(fakePrisma, { documentId: "missing" });
    expect(result).toEqual({ status: "skipped", reason: "document_not_found" });
    expect(mocks.runTemporalExtractor).not.toHaveBeenCalled();
    expect(mocks.persistTemporalSignals).not.toHaveBeenCalled();
    expect(mocks.promoteSourceDateFromSignals).not.toHaveBeenCalled();
  });

  it("skip if processingStatus !== COMPLETED (FAILED)", async () => {
    mocks.documentFindUnique.mockResolvedValue({ ...baseDoc, processingStatus: "FAILED" });
    const result = await runEvidenceForDocument(fakePrisma, { documentId: "doc_1" });
    expect(result).toEqual({ status: "skipped", reason: "processing_status_FAILED" });
    expect(mocks.runTemporalExtractor).not.toHaveBeenCalled();
  });

  it("skip if processingStatus === PROCESSING (still in-flight)", async () => {
    mocks.documentFindUnique.mockResolvedValue({ ...baseDoc, processingStatus: "PROCESSING" });
    const result = await runEvidenceForDocument(fakePrisma, { documentId: "doc_1" });
    expect(result).toEqual({ status: "skipped", reason: "processing_status_PROCESSING" });
  });

  it("skip if no extractedText AND no plaintext override provided", async () => {
    mocks.documentFindUnique.mockResolvedValue({ ...baseDoc, extractedText: null });
    const result = await runEvidenceForDocument(fakePrisma, { documentId: "doc_1" });
    expect(result).toEqual({ status: "skipped", reason: "no_extracted_text" });
  });

  it("skip if extractedText decrypts to whitespace only", async () => {
    mocks.documentFindUnique.mockResolvedValue({ ...baseDoc, extractedText: "ENCRYPTED_WS" });
    mocks.safeDecrypt.mockReturnValueOnce("   \n  ");
    const result = await runEvidenceForDocument(fakePrisma, { documentId: "doc_1" });
    expect(result).toEqual({ status: "skipped", reason: "no_extracted_text" });
  });
});

describe("runEvidenceForDocument — plaintext override vs decrypt", () => {
  it("uses plaintext override when provided (no decrypt call)", async () => {
    mocks.documentFindUnique.mockResolvedValue(baseDoc);
    await runEvidenceForDocument(fakePrisma, {
      documentId: "doc_1",
      extractedTextPlaintext: "in-memory plaintext",
      extractionRunId: "run_42",
    });
    expect(mocks.safeDecrypt).not.toHaveBeenCalled();
    expect(mocks.runTemporalExtractor).toHaveBeenCalledWith(
      expect.objectContaining({ extractedText: "in-memory plaintext" })
    );
  });

  it("decrypts Document.extractedText when plaintext override is undefined", async () => {
    mocks.documentFindUnique.mockResolvedValue(baseDoc);
    await runEvidenceForDocument(fakePrisma, { documentId: "doc_1" });
    expect(mocks.safeDecrypt).toHaveBeenCalledWith("ENCRYPTED_BLOB");
    expect(mocks.runTemporalExtractor).toHaveBeenCalledWith(
      expect.objectContaining({ extractedText: "DECRYPTED:ENCRYPTED_BLOB" })
    );
  });

  it("plaintext=null is treated as fallback to decrypt", async () => {
    mocks.documentFindUnique.mockResolvedValue(baseDoc);
    await runEvidenceForDocument(fakePrisma, {
      documentId: "doc_1",
      extractedTextPlaintext: null,
    });
    expect(mocks.safeDecrypt).toHaveBeenCalledWith("ENCRYPTED_BLOB");
  });

  it("plaintext=empty-string is honored (no decrypt) and triggers no_extracted_text skip", async () => {
    mocks.documentFindUnique.mockResolvedValue(baseDoc);
    const result = await runEvidenceForDocument(fakePrisma, {
      documentId: "doc_1",
      extractedTextPlaintext: "",
    });
    // Empty string is treated as "caller provided empty" — we trust the caller
    // (no decrypt fallback) and bail on the trim() check.
    expect(mocks.safeDecrypt).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "skipped", reason: "no_extracted_text" });
  });
});

describe("runEvidenceForDocument — extractionRunId resolution", () => {
  it("uses explicit extractionRunId when provided (no findFirst)", async () => {
    mocks.documentFindUnique.mockResolvedValue(baseDoc);
    await runEvidenceForDocument(fakePrisma, {
      documentId: "doc_1",
      extractionRunId: "run_explicit",
    });
    expect(mocks.runFindFirst).not.toHaveBeenCalled();
    expect(mocks.persistTemporalSignals).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ extractionRunId: "run_explicit" }),
      expect.anything()
    );
  });

  it("resolves latest READY/READY_WITH_WARNINGS/BLOCKED run when extractionRunId omitted", async () => {
    mocks.documentFindUnique.mockResolvedValue(baseDoc);
    mocks.runFindFirst.mockResolvedValue({ id: "run_latest" });
    await runEvidenceForDocument(fakePrisma, { documentId: "doc_1" });
    expect(mocks.runFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          documentId: "doc_1",
          status: { in: ["READY", "READY_WITH_WARNINGS", "BLOCKED"] },
        }),
        orderBy: { startedAt: "desc" },
      })
    );
    expect(mocks.persistTemporalSignals).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ extractionRunId: "run_latest" }),
      expect.anything()
    );
  });

  it("extractionRunId stays null when no successful run found (helper still emits signals)", async () => {
    mocks.documentFindUnique.mockResolvedValue(baseDoc);
    mocks.runFindFirst.mockResolvedValue(null);
    await runEvidenceForDocument(fakePrisma, { documentId: "doc_1" });
    expect(mocks.persistTemporalSignals).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ extractionRunId: null }),
      expect.anything()
    );
    // extracted_text signals will be skipped downstream; that's the persister's
    // job, not the helper's.
  });
});

describe("runEvidenceForDocument — calls downstream services with right context", () => {
  it("passes documentSourceDate from the loaded doc to the extractor (not null)", async () => {
    const sourceDate = new Date("2026-04-22T01:03:00Z");
    mocks.documentFindUnique.mockResolvedValue({
      ...baseDoc,
      sourceKind: "EMAIL",
      sourceDate,
      sourceMetadata: { confidence: "high", threadMessages: [{}, {}] },
    });
    await runEvidenceForDocument(fakePrisma, { documentId: "doc_1", extractionRunId: "run_1" });
    expect(mocks.runTemporalExtractor).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceKind: "EMAIL",
        documentSourceDate: sourceDate,
        sourceMetadata: expect.objectContaining({ confidence: "high" }),
      })
    );
    expect(mocks.promoteSourceDateFromSignals).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ currentSourceDate: sourceDate })
    );
  });

  it("defaults sourceKind to FILE when DB has null", async () => {
    mocks.documentFindUnique.mockResolvedValue({ ...baseDoc, sourceKind: null });
    await runEvidenceForDocument(fakePrisma, { documentId: "doc_1", extractionRunId: "run_1" });
    expect(mocks.runTemporalExtractor).toHaveBeenCalledWith(
      expect.objectContaining({ sourceKind: "FILE" })
    );
  });

  it("returns ran status with persist + promotion counts", async () => {
    mocks.documentFindUnique.mockResolvedValue(baseDoc);
    mocks.persistTemporalSignals.mockResolvedValue({
      persisted: 3,
      deduplicated: 1,
      skipped: 0,
      skippedReasons: [],
    });
    mocks.promoteSourceDateFromSignals.mockResolvedValue({
      promoted: true,
      newSourceDate: new Date("2024-09-18T00:00:00Z"),
      signalId: "sig_1",
      kind: "CAP_TABLE_AS_OF",
    });
    const result = await runEvidenceForDocument(fakePrisma, {
      documentId: "doc_1",
      extractionRunId: "run_1",
    });
    expect(result).toEqual({
      status: "ran",
      signalsPersisted: 3,
      signalsDeduplicated: 1,
      promoted: true,
      attachmentsLinked: 0, // FILE doc, linker not invoked
      // Phase 6: persistTemporalSignals is mocked with a singular value, so
      // BOTH the temporal call AND the claims call return {persisted:3, deduplicated:1}.
      claimsPersisted: 3,
      claimsDeduplicated: 1,
    });
  });
});
