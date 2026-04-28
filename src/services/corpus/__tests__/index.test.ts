import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findMany: vi.fn(),
    },
    corpusSnapshot: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { computeCorpusSourceHash, ensureCorpusSnapshot, ensureCorpusSnapshotForDeal, loadCorpusSnapshot } from "@/services/corpus";

describe("ensureCorpusSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the existing snapshot when the source hash already exists", async () => {
    vi.mocked(prisma.corpusSnapshot.findUnique).mockResolvedValue({
      id: "snap_1",
      dealId: "deal_1",
      sourceHash: "hash_1",
      createdAt: new Date("2026-04-20T10:00:00.000Z"),
    } as never);

    const snapshot = await ensureCorpusSnapshot({
      dealId: "deal_1",
      documents: [
        {
          id: "doc_1",
          processingStatus: "COMPLETED",
          uploadedAt: new Date("2026-04-20T09:00:00.000Z"),
        },
      ],
    });

    expect(prisma.corpusSnapshot.create).not.toHaveBeenCalled();
    expect(snapshot).toMatchObject({
      id: "snap_1",
      dealId: "deal_1",
      documentIds: ["doc_1"],
    });
  });

  it("recovers from a concurrent unique violation and returns the winning snapshot", async () => {
    vi.mocked(prisma.corpusSnapshot.findUnique)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({
        id: "snap_concurrent",
        dealId: "deal_1",
        sourceHash: "hash_concurrent",
        createdAt: new Date("2026-04-20T10:01:00.000Z"),
      } as never);

    vi.mocked(prisma.corpusSnapshot.create).mockRejectedValue({
      code: "P2002",
    });

    const snapshot = await ensureCorpusSnapshot({
      dealId: "deal_1",
      documents: [
        {
          id: "doc_1",
          processingStatus: "COMPLETED",
          uploadedAt: new Date("2026-04-20T09:00:00.000Z"),
          extractionRuns: [
            {
              id: "run_1",
              status: "READY",
              readyForAnalysis: true,
              corpusTextHash: "corpus_hash_1",
              pages: [{ id: "page_1" }],
            },
          ],
        },
      ],
    });

    expect(prisma.corpusSnapshot.findUnique).toHaveBeenCalledTimes(2);
    expect(snapshot).toMatchObject({
      id: "snap_concurrent",
      dealId: "deal_1",
      documentIds: ["doc_1"],
      extractionRunIds: ["run_1"],
    });
  });

  it("rehydrates stored extraction run ids when loading an existing snapshot", async () => {
    vi.mocked(prisma.corpusSnapshot.findUnique).mockResolvedValue({
      id: "snap_existing",
      dealId: "deal_1",
      sourceHash: "hash_existing",
      createdAt: new Date("2026-04-20T10:05:00.000Z"),
      members: [
        { documentId: "doc_1", extractionRunId: "run_1" },
        { documentId: "doc_2", extractionRunId: null },
      ],
    } as never);

    const snapshot = await loadCorpusSnapshot("snap_existing");

    expect(snapshot).toMatchObject({
      id: "snap_existing",
      documentIds: ["doc_1", "doc_2"],
      extractionRunIds: ["run_1"],
    });
  });

  // ---------------------------------------------------------------------------
  // Backward-compat guard: legacy FILE documents (no source/role metadata) MUST
  // produce the same byte-identical signature as before the corpus_source_kind
  // migration. If this test breaks, an existing CorpusSnapshot is being
  // invalidated silently and analyses will re-run unexpectedly.
  //
  // The expected hash below is a frozen constant captured on origin/main
  // (pre-migration) for the exact `legacyDoc` fixture. NEVER recompute it
  // dynamically against the current implementation — that would make the test
  // a tautology and silently allow signature drift. To re-baseline (only with
  // explicit approval), compute SHA-256 over JSON.stringify([signature]) where
  // signature = { id, uploadedAt: ISO, latestReadyRun: { id, status,
  // corpusTextHash, pageCount }, extractedTextHash: SHA-256(extractedText) }.
  // ---------------------------------------------------------------------------
  const LEGACY_BASELINE_SOURCE_HASH =
    "6bb6a23bfbecb81d446c153be29d23b4c1bce200233affe7fffa2507f1dfd807";

  it("computes a byte-identical sourceHash for legacy FILE documents (no source metadata)", () => {
    const legacyDoc = {
      id: "doc_legacy",
      processingStatus: "COMPLETED",
      uploadedAt: new Date("2026-04-20T09:00:00.000Z"),
      extractedText: "deck v1 content",
      extractionRuns: [
        {
          id: "run_legacy",
          status: "READY",
          readyForAnalysis: true,
          corpusTextHash: "hash_run_legacy",
          pages: [{ id: "p1" }, { id: "p2" }],
        },
      ],
    };

    // 1. The current implementation must reproduce the frozen baseline for the
    //    pre-migration document shape.
    const beforeMigrationDefaults = computeCorpusSourceHash([legacyDoc]);
    expect(beforeMigrationDefaults.sourceHash).toBe(LEGACY_BASELINE_SOURCE_HASH);

    // 2. Adding the values the migration backfills (sourceKind=FILE,
    //    corpusRole=GENERAL) and null source metadata MUST NOT change the
    //    signature — those defaults are explicitly excluded from the hash.
    const migratedDoc = {
      ...legacyDoc,
      sourceKind: "FILE" as const,
      corpusRole: "GENERAL" as const,
      sourceDate: null,
      receivedAt: null,
      sourceAuthor: null,
      sourceSubject: null,
      linkedQuestionSource: null,
      linkedQuestionText: null,
      linkedRedFlagId: null,
      corpusParentDocumentId: null,
    };
    const afterMigration = computeCorpusSourceHash([migratedDoc]);
    expect(afterMigration.sourceHash).toBe(LEGACY_BASELINE_SOURCE_HASH);
  });

  it("changes the sourceHash when a non-FILE source/role/link field is set", () => {
    const baseDoc = {
      id: "doc_base",
      processingStatus: "COMPLETED",
      uploadedAt: new Date("2026-04-20T09:00:00.000Z"),
      extractedText: "email body",
      extractionRuns: [
        {
          id: "run_email",
          status: "READY",
          readyForAnalysis: true,
          corpusTextHash: "hash_email",
          pages: [{ id: "p1" }],
        },
      ],
    };
    const fileVariant = computeCorpusSourceHash([baseDoc]);
    const emailVariant = computeCorpusSourceHash([
      {
        ...baseDoc,
        sourceKind: "EMAIL" as const,
        sourceDate: new Date("2026-04-19T08:00:00.000Z"),
        sourceAuthor: "jean@example.com",
      },
    ]);
    expect(emailVariant.sourceHash).not.toBe(fileVariant.sourceHash);
  });

  it("changes the sourceHash when a FILE document is attached to a corpus parent", () => {
    const baseDoc = {
      id: "doc_file_attachment",
      processingStatus: "COMPLETED",
      uploadedAt: new Date("2026-04-20T09:00:00.000Z"),
      extractedText: "financial model content",
      sourceKind: "FILE" as const,
      corpusRole: "GENERAL" as const,
      extractionRuns: [
        {
          id: "run_file_attachment",
          status: "READY",
          readyForAnalysis: true,
          corpusTextHash: "hash_file_attachment",
          pages: [{ id: "p1" }],
        },
      ],
    };
    const standaloneFile = computeCorpusSourceHash([baseDoc]);
    const attachedFile = computeCorpusSourceHash([
      {
        ...baseDoc,
        corpusParentDocumentId: "doc_email_parent",
      },
    ]);

    expect(attachedFile.sourceHash).not.toBe(standaloneFile.sourceHash);
  });

  // ---------------------------------------------------------------------------
  // End-to-end signature plumbing through ensureCorpusSnapshotForDeal: the
  // database `select` MUST include every field that the extended signature
  // depends on. Otherwise mutations made in the database (correct a sourceDate,
  // relink a question) would silently fail to invalidate the cached snapshot.
  // This test fakes two consecutive findMany returns and asserts that the
  // resulting CorpusSnapshot.sourceHash differs each time.
  // ---------------------------------------------------------------------------
  it("invalidates the snapshot when sourceDate is mutated for a non-FILE document", async () => {
    const baseDocRow = {
      id: "doc_email_1",
      isLatest: true,
      extractedText: "Body of the email — encrypted at rest, decrypted here.",
      processingStatus: "COMPLETED",
      uploadedAt: new Date("2026-04-25T09:00:00.000Z"),
      sourceKind: "EMAIL",
      corpusRole: "GENERAL",
      sourceDate: new Date("2026-04-24T08:00:00.000Z"),
      receivedAt: null,
      sourceAuthor: "cfo@example.com",
      sourceSubject: "Re: churn",
      linkedQuestionSource: null,
      linkedQuestionText: null,
      linkedRedFlagId: null,
      corpusParentDocumentId: null,
      extractionRuns: [
        {
          id: "run_email_1",
          status: "READY",
          readyForAnalysis: true,
          corpusTextHash: "hash_email_1",
          pages: [{ id: "p1" }],
        },
      ],
    };

    // First call: snapshot does not exist → it gets created with sourceHash A.
    vi.mocked(prisma.document.findMany).mockResolvedValueOnce([baseDocRow] as never);
    vi.mocked(prisma.corpusSnapshot.findUnique).mockResolvedValueOnce(null as never);
    vi.mocked(prisma.corpusSnapshot.create).mockResolvedValueOnce({
      id: "snap_A",
      dealId: "deal_1",
      sourceHash: "irrelevant",
      createdAt: new Date("2026-04-28T12:00:00.000Z"),
    } as never);

    await ensureCorpusSnapshotForDeal({ dealId: "deal_1" });
    const firstCreateArgs = vi.mocked(prisma.corpusSnapshot.create).mock.calls[0]?.[0] as
      | { data: { sourceHash: string } }
      | undefined;
    const sourceHashA = firstCreateArgs?.data.sourceHash;
    expect(sourceHashA).toBeDefined();

    // Second call: same document but sourceDate corrected by 1 day. The findMany
    // path must surface the new sourceDate (i.e. the select includes it) so the
    // signature changes and the snapshot is recomputed.
    const mutatedRow = { ...baseDocRow, sourceDate: new Date("2026-04-23T08:00:00.000Z") };
    vi.mocked(prisma.document.findMany).mockResolvedValueOnce([mutatedRow] as never);
    vi.mocked(prisma.corpusSnapshot.findUnique).mockResolvedValueOnce(null as never);
    vi.mocked(prisma.corpusSnapshot.create).mockResolvedValueOnce({
      id: "snap_B",
      dealId: "deal_1",
      sourceHash: "irrelevant",
      createdAt: new Date("2026-04-28T12:05:00.000Z"),
    } as never);

    await ensureCorpusSnapshotForDeal({ dealId: "deal_1" });
    const secondCreateArgs = vi.mocked(prisma.corpusSnapshot.create).mock.calls[1]?.[0] as
      | { data: { sourceHash: string } }
      | undefined;
    const sourceHashB = secondCreateArgs?.data.sourceHash;
    expect(sourceHashB).toBeDefined();
    expect(sourceHashB).not.toBe(sourceHashA);
  });

  it("invalidates the snapshot when linkedQuestionText is mutated", async () => {
    const baseDocRow = {
      id: "doc_email_2",
      isLatest: true,
      extractedText: "Founder reply about churn.",
      processingStatus: "COMPLETED",
      uploadedAt: new Date("2026-04-25T09:00:00.000Z"),
      sourceKind: "EMAIL",
      corpusRole: "DILIGENCE_RESPONSE",
      sourceDate: new Date("2026-04-24T08:00:00.000Z"),
      receivedAt: null,
      sourceAuthor: "cfo@example.com",
      sourceSubject: "Re: churn",
      linkedQuestionSource: "RED_FLAG",
      linkedQuestionText: "Pourquoi le churn est-il monté en 2024 ?",
      linkedRedFlagId: "rf_churn",
      corpusParentDocumentId: null,
      extractionRuns: [
        {
          id: "run_email_2",
          status: "READY",
          readyForAnalysis: true,
          corpusTextHash: "hash_email_2",
          pages: [{ id: "p1" }],
        },
      ],
    };

    vi.mocked(prisma.document.findMany).mockResolvedValueOnce([baseDocRow] as never);
    vi.mocked(prisma.corpusSnapshot.findUnique).mockResolvedValueOnce(null as never);
    vi.mocked(prisma.corpusSnapshot.create).mockResolvedValueOnce({
      id: "snap_question_A",
      dealId: "deal_2",
      sourceHash: "irrelevant",
      createdAt: new Date(),
    } as never);
    await ensureCorpusSnapshotForDeal({ dealId: "deal_2" });
    const initialHash = (
      vi.mocked(prisma.corpusSnapshot.create).mock.calls[0]?.[0] as { data: { sourceHash: string } }
    ).data.sourceHash;

    const relinkedRow = {
      ...baseDocRow,
      linkedQuestionText: "Quel a été l'impact des départs sur le churn 2024 ?",
    };
    vi.mocked(prisma.document.findMany).mockResolvedValueOnce([relinkedRow] as never);
    vi.mocked(prisma.corpusSnapshot.findUnique).mockResolvedValueOnce(null as never);
    vi.mocked(prisma.corpusSnapshot.create).mockResolvedValueOnce({
      id: "snap_question_B",
      dealId: "deal_2",
      sourceHash: "irrelevant",
      createdAt: new Date(),
    } as never);
    await ensureCorpusSnapshotForDeal({ dealId: "deal_2" });
    const relinkedHash = (
      vi.mocked(prisma.corpusSnapshot.create).mock.calls[1]?.[0] as { data: { sourceHash: string } }
    ).data.sourceHash;

    expect(relinkedHash).not.toBe(initialHash);
  });

  it("includes source/role/link fields in the findMany select", async () => {
    vi.mocked(prisma.document.findMany).mockResolvedValueOnce([] as never);
    await ensureCorpusSnapshotForDeal({ dealId: "deal_select" });

    const args = vi.mocked(prisma.document.findMany).mock.calls[0]?.[0];
    const select = args?.select ?? {};
    for (const field of [
      "sourceKind",
      "corpusRole",
      "sourceDate",
      "receivedAt",
      "sourceAuthor",
      "sourceSubject",
      "linkedQuestionSource",
      "linkedQuestionText",
      "linkedRedFlagId",
      "corpusParentDocumentId",
    ] as const) {
      expect(select).toHaveProperty(field, true);
    }
  });

  it("refuses to materialize a snapshot when requested documentIds include superseded documents", async () => {
    vi.mocked(prisma.document.findMany).mockResolvedValue([
      {
        id: "doc_current",
        isLatest: true,
        extractedText: null,
        processingStatus: "COMPLETED",
        uploadedAt: new Date("2026-04-20T09:00:00.000Z"),
        extractionRuns: [],
      },
    ] as never);

    const snapshot = await ensureCorpusSnapshotForDeal({
      dealId: "deal_1",
      documentIds: ["doc_current", "doc_superseded"],
    });

    expect(snapshot).toBeNull();
    expect(prisma.corpusSnapshot.create).not.toHaveBeenCalled();
  });
});
