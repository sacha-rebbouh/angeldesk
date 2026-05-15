import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { encryptJsonField, encryptText } from "@/lib/encryption";

// Phase 3.5 — Codex post-Phase-3 audit identified three code paths that
// silently bypass encryption. Each `it()` below was written BEFORE the fix
// to prove the bug exists today; they go green only once the fix is in
// place.

const TEST_KEY = "c".repeat(64);

beforeAll(() => {
  vi.stubEnv("DOCUMENT_ENCRYPTION_KEY", TEST_KEY);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// (a) Toxic gate fail-open on encrypted artifacts
// ---------------------------------------------------------------------------
// `isPageArtifactToxic` reads `artifact.verification.state`. On an encrypted
// envelope `{ _enc, data, v }` that field is absent at the top level →
// state is null → function returns false ("not toxic") → the corrupt page
// slips past the analysis gate.
// ---------------------------------------------------------------------------

describe("Phase 3.5(a) — isPageArtifactToxic must NOT fail-open on encrypted envelopes", () => {
  it("flags a parse_failed artifact as toxic whether stored encrypted or plaintext", async () => {
    const { isPageArtifactToxic } = await import("../extraction-readiness-policy");

    const corruptArtifact = {
      version: "document-page-artifact-v2",
      pageNumber: 9,
      text: "garbled OCR output",
      tables: [],
      charts: [],
      numericClaims: [],
      visualBlocks: [],
      unreadableRegions: [],
      confidence: "low" as const,
      needsHumanReview: true,
      verification: {
        state: "parse_failed",
        evidence: [] as string[],
      },
    };

    // Sanity: the plaintext path still works.
    expect(isPageArtifactToxic(corruptArtifact, "READY")).toBe(true);

    // The bug: same payload, but persisted via the Phase 3 envelope. The
    // policy module currently returns false here, which is a fail-open on
    // the analysis gate.
    const encryptedArtifact = encryptJsonField(corruptArtifact);
    expect(isPageArtifactToxic(encryptedArtifact, "READY")).toBe(true);
  });

  it("does not regress: a clean encrypted artifact stays non-toxic", async () => {
    const { isPageArtifactToxic } = await import("../extraction-readiness-policy");

    const cleanArtifact = {
      version: "document-page-artifact-v2",
      pageNumber: 1,
      text: "Q1 revenue 1.2M",
      tables: [],
      charts: [],
      numericClaims: [],
      visualBlocks: [],
      unreadableRegions: [],
      confidence: "high" as const,
      needsHumanReview: false,
      verification: { state: "cross_validated", evidence: ["provider_structured"] },
    };

    expect(isPageArtifactToxic(encryptJsonField(cleanArtifact), "READY")).toBe(false);
  });

  it("fail-closed: a corrupted envelope must be toxic, not silently 'no artifact'", async () => {
    const { isPageArtifactToxic } = await import("../extraction-readiness-policy");

    // Two realistic flavors of corruption that `isEncryptedJsonField`
    // recognizes as proper envelopes (correct shape) but whose ciphertext
    // does not decrypt (key rotation, DB tampering, network truncation):
    const corruptedEnvelopes: Array<unknown> = [
      { _enc: "ad1", data: "definitely-not-valid-ciphertext", v: 1 },
      { _enc: "ad1", data: "AAAA", v: 1 },
    ];

    for (const corrupted of corruptedEnvelopes) {
      expect(isPageArtifactToxic(corrupted, "READY")).toBe(true);
    }

    // Sanity: an absent / null artifact is NOT toxic (legitimate state for
    // pre-V3 native-text pages that never produced an artifact).
    expect(isPageArtifactToxic(null, "READY")).toBe(false);
    expect(isPageArtifactToxic(undefined, "READY")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (b) Evidence ledger silently drops claims when artifact is encrypted
// ---------------------------------------------------------------------------
// buildEvidenceLedgerFromContext does asRecord(page.artifact) and reads
// `.tables`, `.charts`, `.numericClaims` directly. An encrypted envelope
// has none of those keys → all counts collapse to 0. Agents lose every
// structured claim that was supposed to be evidence in their prompt.
// ---------------------------------------------------------------------------

describe("Phase 3.5(b) — evidence-ledger must decrypt artifacts before counting claims", () => {
  it("returns identical structured counts for encrypted vs plaintext artifacts", async () => {
    const { buildEvidenceLedgerFromContext } = await import("@/services/evidence-ledger");

    const artifact = {
      version: "document-page-artifact-v2",
      pageNumber: 4,
      text: "ARR €1.2M, Burn €120k, runway 14m",
      visualBlocks: [
        { type: "table", description: "P&L Q1", confidence: "high" },
        { type: "chart", description: "Growth", confidence: "high" },
      ],
      tables: [
        { title: "P&L", markdown: "| ARR | 1.2M |", confidence: "high" },
      ],
      charts: [
        { description: "Growth curve", confidence: "high" },
      ],
      numericClaims: [
        { label: "ARR", value: "1.2M", unit: "€", sourceText: "ARR €1.2M", confidence: "high" },
        { label: "Burn", value: "120k", unit: "€", sourceText: "Burn €120k", confidence: "high" },
        { label: "Runway", value: "14", unit: "months", sourceText: "runway 14m", confidence: "medium" },
      ],
      unreadableRegions: [],
      confidence: "high" as const,
      needsHumanReview: false,
    };

    function buildContext(artifactValue: unknown) {
      return {
        documents: [
          {
            id: "doc_1",
            name: "deck.pdf",
            type: "PITCH_DECK",
            extractionRuns: [
              {
                id: "run_1",
                pages: [
                  {
                    pageNumber: 4,
                    status: "READY_WITH_WARNINGS",
                    method: "OCR",
                    qualityScore: 80,
                    wordCount: 12,
                    hasTables: true,
                    hasCharts: true,
                    artifact: artifactValue,
                  },
                ],
              },
            ],
          },
        ],
      } as unknown as Parameters<typeof buildEvidenceLedgerFromContext>[0];
    }

    const plaintextLedger = buildEvidenceLedgerFromContext(buildContext(artifact));
    const encryptedLedger = buildEvidenceLedgerFromContext(
      buildContext(encryptJsonField(artifact))
    );

    // Coverage counters must match: agents downstream should not see a
    // different evidence surface just because the row was encrypted.
    expect(encryptedLedger.coverage.documentArtifactCount).toBe(
      plaintextLedger.coverage.documentArtifactCount
    );
    expect(encryptedLedger.coverage.visualArtifactCount).toBe(
      plaintextLedger.coverage.visualArtifactCount
    );
    expect(encryptedLedger.coverage.numericClaimCount).toBe(
      plaintextLedger.coverage.numericClaimCount
    );
    expect(encryptedLedger.coverage.numericClaimCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// (c) extraction-reuse propagates legacy plaintext into a NEW row
// ---------------------------------------------------------------------------
// When reuseCompletedExtractionForContentHash hits a legacy source row, it
// currently copies `artifact` and `textPreview` verbatim into the target.
// The target row is a brand-new Phase-3 write but lands plaintext on disk
// — violates the Phase 3 invariant that all NEW writes are encrypted.
// ---------------------------------------------------------------------------

describe("Phase 3.5(c) — extraction-reuse must re-encrypt artifacts when cloning from a legacy source", () => {
  it("writes ENCRYPTED artifact + textPreview to the target row even when the source is legacy plaintext", async () => {
    const documentFindFirst = vi.fn();
    const transaction = vi.fn();
    const tx = {
      documentExtractionRun: {
        create: vi.fn().mockResolvedValue({ id: "run_clone", pageCount: 1, pagesProcessed: 1 }),
      },
      // Phase 4.3: `promoteDocumentVersionTx` takes a per-lineage advisory
      // lock via `$executeRaw` before its check-then-act.
      $executeRaw: vi.fn().mockResolvedValue(1),
      document: {
        update: vi.fn().mockResolvedValue(undefined),
        // Phase 4.3: the reuse transaction promotes the target's candidate
        // version. A COMPLETED single version → promotion is a no-op.
        findUnique: vi.fn().mockResolvedValue({
          id: "doc_target",
          dealId: "deal_target",
          name: "file.pdf",
          corpusParentDocumentId: null,
          version: 1,
          processingStatus: "COMPLETED",
        }),
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    transaction.mockImplementation(async (fn: (innerTx: typeof tx) => unknown) => fn(tx));

    vi.doMock("@/lib/prisma", () => ({
      prisma: {
        document: { findFirst: documentFindFirst },
        $transaction: transaction,
      },
    }));

    const legacyArtifact = {
      version: "document-page-artifact-v1",
      pageNumber: 1,
      text: "legacy plaintext that must NOT survive cloning",
      tables: [{ title: "P&L", markdown: "| Revenue | 1.2M |", confidence: "high" }],
      charts: [],
      numericClaims: [
        { label: "ARR", value: "1.2M", unit: "€", sourceText: "ARR 1.2M", confidence: "high" },
      ],
      visualBlocks: [],
      unreadableRegions: [],
      confidence: "high",
      needsHumanReview: false,
    };
    const legacyTextPreview = "legacy plaintext preview — must NOT survive cloning";

    documentFindFirst.mockResolvedValue({
      id: "doc_source",
      extractedText: "encrypted-corpus-blob",
      extractionQuality: 80,
      extractionMetrics: { pagesOCRd: 1, ocrCost: 0.03 },
      extractionWarnings: [],
      requiresOCR: false,
      ocrProcessed: true,
      extractionRuns: [
        {
          id: "run_source",
          status: "READY",
          pageCount: 1,
          pagesProcessed: 1,
          pagesSucceeded: 1,
          pagesFailed: 0,
          pagesSkipped: 0,
          coverageRatio: 1,
          qualityScore: 80,
          readyForAnalysis: true,
          blockedReason: null,
          extractionVersion: 1,
          pipelineVersion: "v1",
          corpusTextHash: null,
          summaryMetrics: {},
          warnings: null,
          completedAt: new Date("2026-04-01T00:00:00.000Z"),
          startedAt: new Date("2026-04-01T00:00:00.000Z"),
          pages: [
            {
              pageNumber: 1,
              status: "READY",
              method: "OCR",
              charCount: 50,
              wordCount: 8,
              qualityScore: 80,
              confidence: "high",
              hasTables: true,
              hasCharts: false,
              hasFinancialKeywords: true,
              hasTeamKeywords: false,
              hasMarketKeywords: false,
              requiresOCR: false,
              ocrProcessed: true,
              contentHash: "x",
              artifactVersion: "v1",
              artifact: legacyArtifact, // ← legacy plaintext source!
              pageImageHash: null,
              errorMessage: null,
              textPreview: legacyTextPreview, // ← legacy plaintext source!
            },
          ],
        },
      ],
    });

    vi.resetModules();
    const { reuseCompletedExtractionForContentHash } = await import("../extraction-reuse");

    const result = await reuseCompletedExtractionForContentHash({
      targetDocumentId: "doc_target",
      targetDocumentVersion: 1,
      contentHash: "hash_shared",
      userId: "user_current",
    });

    expect(result).not.toBeNull();
    expect(tx.documentExtractionRun.create).toHaveBeenCalledTimes(1);

    const createCall = tx.documentExtractionRun.create.mock.calls[0]?.[0];
    const pagesPayload = createCall?.data?.pages?.create as Array<Record<string, unknown>>;
    expect(Array.isArray(pagesPayload)).toBe(true);
    expect(pagesPayload).toHaveLength(1);

    const targetPage = pagesPayload[0];

    // The persisted form for the NEW target row must be opaque: no raw
    // corpus substring may survive the clone.
    const serializedArtifact = JSON.stringify(targetPage.artifact);
    expect(serializedArtifact).not.toContain("legacy plaintext that must NOT survive cloning");
    expect(serializedArtifact).not.toContain("1.2M");
    expect(serializedArtifact).not.toContain("Revenue");

    // textPreview must be encrypted too.
    expect(targetPage.textPreview).not.toBe(legacyTextPreview);
    expect(typeof targetPage.textPreview).toBe("string");
    expect(targetPage.textPreview).not.toContain("legacy plaintext preview");

    vi.doUnmock("@/lib/prisma");
  });

  it("preserves an already-encrypted source artifact (envelope-to-envelope copy stays correct)", async () => {
    const documentFindFirst = vi.fn();
    const transaction = vi.fn();
    const tx = {
      documentExtractionRun: {
        create: vi.fn().mockResolvedValue({ id: "run_clone", pageCount: 1, pagesProcessed: 1 }),
      },
      // Phase 4.3: `promoteDocumentVersionTx` takes a per-lineage advisory
      // lock via `$executeRaw` before its check-then-act.
      $executeRaw: vi.fn().mockResolvedValue(1),
      document: {
        update: vi.fn().mockResolvedValue(undefined),
        // Phase 4.3: the reuse transaction promotes the target's candidate
        // version. A COMPLETED single version → promotion is a no-op.
        findUnique: vi.fn().mockResolvedValue({
          id: "doc_target",
          dealId: "deal_target",
          name: "file.pdf",
          corpusParentDocumentId: null,
          version: 1,
          processingStatus: "COMPLETED",
        }),
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    transaction.mockImplementation(async (fn: (innerTx: typeof tx) => unknown) => fn(tx));

    vi.doMock("@/lib/prisma", () => ({
      prisma: {
        document: { findFirst: documentFindFirst },
        $transaction: transaction,
      },
    }));

    const sourceArtifact = {
      version: "document-page-artifact-v2",
      pageNumber: 1,
      text: "modern encrypted source content",
      tables: [],
      charts: [],
      numericClaims: [],
      visualBlocks: [],
      unreadableRegions: [],
      confidence: "high",
      needsHumanReview: false,
    };
    const sourceEncryptedArtifact = encryptJsonField(sourceArtifact);
    const sourceEncryptedTextPreview = encryptText("modern encrypted preview");

    documentFindFirst.mockResolvedValue({
      id: "doc_source",
      extractedText: "encrypted-corpus-blob",
      extractionQuality: 90,
      extractionMetrics: {},
      extractionWarnings: [],
      requiresOCR: false,
      ocrProcessed: true,
      extractionRuns: [
        {
          id: "run_source",
          status: "READY",
          pageCount: 1,
          pagesProcessed: 1,
          pagesSucceeded: 1,
          pagesFailed: 0,
          pagesSkipped: 0,
          coverageRatio: 1,
          qualityScore: 90,
          readyForAnalysis: true,
          blockedReason: null,
          extractionVersion: 1,
          pipelineVersion: "v1",
          corpusTextHash: null,
          summaryMetrics: {},
          warnings: null,
          completedAt: new Date(),
          startedAt: new Date(),
          pages: [
            {
              pageNumber: 1,
              status: "READY",
              method: "OCR",
              charCount: 30,
              wordCount: 4,
              qualityScore: 90,
              confidence: "high",
              hasTables: false,
              hasCharts: false,
              hasFinancialKeywords: false,
              hasTeamKeywords: false,
              hasMarketKeywords: false,
              requiresOCR: false,
              ocrProcessed: true,
              contentHash: "x",
              artifactVersion: "v2",
              artifact: sourceEncryptedArtifact,
              pageImageHash: null,
              errorMessage: null,
              textPreview: sourceEncryptedTextPreview,
            },
          ],
        },
      ],
    });

    vi.resetModules();
    const { reuseCompletedExtractionForContentHash } = await import("../extraction-reuse");

    const result = await reuseCompletedExtractionForContentHash({
      targetDocumentId: "doc_target",
      targetDocumentVersion: 1,
      contentHash: "hash_shared",
      userId: "user_current",
    });

    expect(result).not.toBeNull();
    const createCall = tx.documentExtractionRun.create.mock.calls[0]?.[0];
    const targetPage = (createCall?.data?.pages?.create as Array<Record<string, unknown>>)[0];

    // Whether we forward the source envelope verbatim OR re-encrypt with a
    // fresh IV, the persisted form must remain opaque (no leak).
    expect(JSON.stringify(targetPage.artifact)).not.toContain("modern encrypted source content");
    expect(targetPage.textPreview).not.toContain("modern encrypted preview");

    vi.doUnmock("@/lib/prisma");
  });

  it("fail-closed: a corrupted envelope on the source must NOT be cloned as Prisma.DbNull", async () => {
    // If the source row carries an envelope whose ciphertext does not
    // decrypt (e.g. DOCUMENT_ENCRYPTION_KEY rotated, DB tampering), the
    // reuse path must refuse to "clean" it into NULL — that would silently
    // erase auditable artifact metadata on the target row.
    const documentFindFirst = vi.fn();
    const transaction = vi.fn();
    const tx = {
      documentExtractionRun: {
        create: vi.fn().mockResolvedValue({ id: "run_clone", pageCount: 1, pagesProcessed: 1 }),
      },
      // Phase 4.3: `promoteDocumentVersionTx` takes a per-lineage advisory
      // lock via `$executeRaw` before its check-then-act.
      $executeRaw: vi.fn().mockResolvedValue(1),
      document: {
        update: vi.fn().mockResolvedValue(undefined),
        // Phase 4.3: the reuse transaction promotes the target's candidate
        // version. A COMPLETED single version → promotion is a no-op.
        findUnique: vi.fn().mockResolvedValue({
          id: "doc_target",
          dealId: "deal_target",
          name: "file.pdf",
          corpusParentDocumentId: null,
          version: 1,
          processingStatus: "COMPLETED",
        }),
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    transaction.mockImplementation(async (fn: (innerTx: typeof tx) => unknown) => fn(tx));

    vi.doMock("@/lib/prisma", () => ({
      prisma: {
        document: { findFirst: documentFindFirst },
        $transaction: transaction,
      },
    }));

    const corruptedSourceArtifact = {
      _enc: "ad1" as const,
      data: "definitely-not-valid-ciphertext",
      v: 1 as const,
    };

    documentFindFirst.mockResolvedValue({
      id: "doc_source",
      extractedText: "encrypted-corpus",
      extractionQuality: 80,
      extractionMetrics: {},
      extractionWarnings: [],
      requiresOCR: false,
      ocrProcessed: true,
      extractionRuns: [
        {
          id: "run_source",
          status: "READY",
          pageCount: 1,
          pagesProcessed: 1,
          pagesSucceeded: 1,
          pagesFailed: 0,
          pagesSkipped: 0,
          coverageRatio: 1,
          qualityScore: 80,
          readyForAnalysis: true,
          blockedReason: null,
          extractionVersion: 1,
          pipelineVersion: "v1",
          corpusTextHash: null,
          summaryMetrics: {},
          warnings: null,
          completedAt: new Date(),
          startedAt: new Date(),
          pages: [
            {
              pageNumber: 1,
              status: "READY",
              method: "OCR",
              charCount: 50,
              wordCount: 8,
              qualityScore: 80,
              confidence: "high",
              hasTables: false,
              hasCharts: false,
              hasFinancialKeywords: false,
              hasTeamKeywords: false,
              hasMarketKeywords: false,
              requiresOCR: false,
              ocrProcessed: true,
              contentHash: "x",
              artifactVersion: "v1",
              artifact: corruptedSourceArtifact,
              pageImageHash: null,
              errorMessage: null,
              textPreview: null,
            },
          ],
        },
      ],
    });

    vi.resetModules();
    const { reuseCompletedExtractionForContentHash } = await import("../extraction-reuse");

    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      // Behavior: the reuse pipeline must NOT silently swallow a corrupt
      // envelope. It either throws (which aborts the transaction) or
      // returns null (which means "fall back to a real re-extraction").
      // What it must NOT do is produce a target row with `artifact: NULL`
      // and pretend everything is fine.
      await expect(
        reuseCompletedExtractionForContentHash({
          targetDocumentId: "doc_target",
          targetDocumentVersion: 1,
          contentHash: "hash_shared",
          userId: "user_current",
        })
      ).rejects.toThrow();

      // The transaction must not have written a stripped row.
      expect(tx.documentExtractionRun.create).not.toHaveBeenCalled();
    } finally {
      consoleWarn.mockRestore();
      vi.doUnmock("@/lib/prisma");
    }
  });

  it("fail-closed: a corrupted encrypted-looking textPreview on the source must throw", async () => {
    // Codex Phase 3.5(e) repro: build a textPreview that LOOKS like a Phase-3
    // ciphertext (base64 of correct shape — passes `isEncrypted`) but whose
    // AES auth tag is wrong. Previously, `safeDecrypt` swallowed the error
    // and returned the input string verbatim, so the clone path encrypted
    // a still-corrupt ciphertext as plaintext — silently propagating the
    // corruption into the new row. The clone must refuse to write instead.

    const documentFindFirst = vi.fn();
    const transaction = vi.fn();
    const tx = {
      documentExtractionRun: {
        create: vi.fn().mockResolvedValue({ id: "run_clone", pageCount: 1, pagesProcessed: 1 }),
      },
      // Phase 4.3: `promoteDocumentVersionTx` takes a per-lineage advisory
      // lock via `$executeRaw` before its check-then-act.
      $executeRaw: vi.fn().mockResolvedValue(1),
      document: {
        update: vi.fn().mockResolvedValue(undefined),
        // Phase 4.3: the reuse transaction promotes the target's candidate
        // version. A COMPLETED single version → promotion is a no-op.
        findUnique: vi.fn().mockResolvedValue({
          id: "doc_target",
          dealId: "deal_target",
          name: "file.pdf",
          corpusParentDocumentId: null,
          version: 1,
          processingStatus: "COMPLETED",
        }),
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    transaction.mockImplementation(async (fn: (innerTx: typeof tx) => unknown) => fn(tx));

    vi.doMock("@/lib/prisma", () => ({
      prisma: {
        document: { findFirst: documentFindFirst },
        $transaction: transaction,
      },
    }));

    // Take a real ciphertext, then flip a byte in the auth tag. The result
    // still parses as base64 and has the right length, so isEncrypted()
    // returns true — but decryptText() will throw an AES auth-tag error.
    const goodCiphertext = encryptText("source-secret-preview");
    const corruptedBuffer = Buffer.from(goodCiphertext, "base64");
    corruptedBuffer[14] = corruptedBuffer[14] ^ 0x55; // perturb the auth tag region
    const corruptedTextPreview = corruptedBuffer.toString("base64");

    // Sanity: the corrupted string passes the heuristic AND fails real
    // decryption — i.e. it is in the exact danger zone that motivated the
    // fix.
    const { isEncrypted, decryptText } = await import("@/lib/encryption");
    expect(isEncrypted(corruptedTextPreview)).toBe(true);
    expect(() => decryptText(corruptedTextPreview)).toThrow();

    documentFindFirst.mockResolvedValue({
      id: "doc_source",
      extractedText: "encrypted-corpus",
      extractionQuality: 80,
      extractionMetrics: {},
      extractionWarnings: [],
      requiresOCR: false,
      ocrProcessed: true,
      extractionRuns: [
        {
          id: "run_source",
          status: "READY",
          pageCount: 1,
          pagesProcessed: 1,
          pagesSucceeded: 1,
          pagesFailed: 0,
          pagesSkipped: 0,
          coverageRatio: 1,
          qualityScore: 80,
          readyForAnalysis: true,
          blockedReason: null,
          extractionVersion: 1,
          pipelineVersion: "v1",
          corpusTextHash: null,
          summaryMetrics: {},
          warnings: null,
          completedAt: new Date(),
          startedAt: new Date(),
          pages: [
            {
              pageNumber: 1,
              status: "READY",
              method: "OCR",
              charCount: 50,
              wordCount: 8,
              qualityScore: 80,
              confidence: "high",
              hasTables: false,
              hasCharts: false,
              hasFinancialKeywords: false,
              hasTeamKeywords: false,
              hasMarketKeywords: false,
              requiresOCR: false,
              ocrProcessed: true,
              contentHash: "x",
              artifactVersion: "v1",
              // Artifact is a fine encrypted envelope — only the preview is
              // corrupted, isolating the textPreview failure mode.
              artifact: encryptJsonField({ pageNumber: 1, text: "ok" }),
              pageImageHash: null,
              errorMessage: null,
              textPreview: corruptedTextPreview,
            },
          ],
        },
      ],
    });

    vi.resetModules();
    const { reuseCompletedExtractionForContentHash } = await import("../extraction-reuse");

    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await expect(
        reuseCompletedExtractionForContentHash({
          targetDocumentId: "doc_target",
          targetDocumentVersion: 1,
          contentHash: "hash_shared",
          userId: "user_current",
        })
      ).rejects.toThrow();
      // The transaction must not have written a stripped row with a still-
      // corrupted ciphertext.
      expect(tx.documentExtractionRun.create).not.toHaveBeenCalled();
    } finally {
      consoleWarn.mockRestore();
      vi.doUnmock("@/lib/prisma");
    }
  });
});
