import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase B6.1 fix-up (Codex P2) — atomic-merge tests for
 * `patchDocumentSourceMetadataAtomic`.
 *
 * The helper is what guarantees "B6.1 manual.sourceDate +
 * B6.2 manual.documentType + B6.3 manual.email + Phase 3 temporal can
 * ALL coexist on the same row even under concurrent writers". The
 * Codex audit asked specifically for a test that simulates two
 * distinct patches and verifies both blocks survive — that's the last
 * test here.
 */

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  txDocumentFindUnique: vi.fn(),
  txDocumentUpdateMany: vi.fn(),
}));

// We mock @prisma/client to (a) expose `Prisma.TransactionIsolationLevel`
// (the helper imports it) and (b) export the shape the helper expects.
vi.mock("@prisma/client", () => ({
  Prisma: {
    TransactionIsolationLevel: {
      Serializable: "Serializable",
    },
  },
}));

const { patchDocumentSourceMetadataAtomic, DocumentNotFoundForMetadataPatchError } =
  await import("../source-metadata");

function makePrisma() {
  // Minimal PrismaClient surface — only `$transaction` is real on this
  // mock; the helper calls findUnique + updateMany through the tx-scoped
  // proxy we hand it. The transaction mock invokes the fn inline with
  // our tx mocks so the test can assert against them.
  mocks.transaction.mockImplementation(
    async (
      fn: (tx: { document: { findUnique: unknown; updateMany: unknown } }) => unknown,
      _options?: unknown
    ) => {
      const tx = {
        document: {
          findUnique: mocks.txDocumentFindUnique,
          updateMany: mocks.txDocumentUpdateMany,
        },
      };
      return fn(tx);
    }
  );
  return { $transaction: mocks.transaction } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.txDocumentFindUnique.mockResolvedValue({
    id: "doc_1",
    dealId: "deal_1",
    sourceDate: null,
    sourceMetadata: null,
    // B6.2 — helper snapshot now also reads type + sourceKind so the
    // patch fn can capture them as previousValue in audit trails.
    type: "PITCH_DECK",
    sourceKind: "FILE",
    // B6.3 — email metadata fields snapshot for audit trails.
    receivedAt: null,
    sourceAuthor: null,
    sourceSubject: null,
  });
  mocks.txDocumentUpdateMany.mockResolvedValue({ count: 1 });
});

describe("patchDocumentSourceMetadataAtomic — Codex B6.1 P2 atomic merge", () => {
  it("opens a Serializable $transaction (race-safe against concurrent writers)", async () => {
    await patchDocumentSourceMetadataAtomic(makePrisma(), {
      documentId: "doc_1",
      dealId: "deal_1",
      patch: (snapshot) => ({
        nextSourceMetadata: { manual: { sourceDate: { setBy: "u" } } },
        nextSourceDate: new Date("2026-03-14"),
      }),
    });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    const options = mocks.transaction.mock.calls[0]?.[1];
    expect(options).toMatchObject({ isolationLevel: "Serializable" });
  });

  it("invokes the patch with the snapshot read INSIDE the transaction (not the caller's pre-txn snapshot)", async () => {
    // Critical: the patch fn must see what the txn-scoped findUnique
    // returned, NOT something the caller passed. This is the whole
    // point of the helper — the caller can't reason about
    // concurrent state, only the helper can.
    mocks.txDocumentFindUnique.mockResolvedValueOnce({
      id: "doc_1",
      dealId: "deal_1",
      sourceDate: new Date("2025-12-01"),
      sourceMetadata: { temporal: { promotedBy: "evidence-engine-phase3" } },
    });

    const patchFn = vi.fn((snapshot) => ({
      nextSourceMetadata: { ...snapshot.sourceMetadata, manual: { sourceDate: { setBy: "u" } } },
      nextSourceDate: new Date("2026-03-14"),
    }));

    await patchDocumentSourceMetadataAtomic(makePrisma(), {
      documentId: "doc_1",
      dealId: "deal_1",
      patch: patchFn,
    });

    expect(patchFn).toHaveBeenCalledTimes(1);
    const snapshot = patchFn.mock.calls[0]?.[0];
    expect(snapshot?.sourceDate?.toISOString()).toBe("2025-12-01T00:00:00.000Z");
    expect(snapshot?.sourceMetadata).toMatchObject({
      temporal: { promotedBy: "evidence-engine-phase3" },
    });
  });

  it("writes via updateMany WHERE id AND dealId (IDOR-redundant + race-safe count check)", async () => {
    await patchDocumentSourceMetadataAtomic(makePrisma(), {
      documentId: "doc_1",
      dealId: "deal_1",
      patch: () => ({
        nextSourceMetadata: { foo: "bar" },
        nextSourceDate: new Date("2026-03-14"),
      }),
    });

    expect(mocks.txDocumentUpdateMany).toHaveBeenCalledTimes(1);
    const call = mocks.txDocumentUpdateMany.mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({ id: "doc_1", dealId: "deal_1" });
    expect(call?.data?.sourceMetadata).toEqual({ foo: "bar" });
    expect((call?.data?.sourceDate as Date).toISOString().startsWith("2026-03-14")).toBe(true);
  });

  it("does NOT write sourceDate when the patch returns nextSourceDate: undefined (sourceMetadata-only updates)", async () => {
    // Forward-compat: B6.2 (type / sourceKind) wants to patch
    // sourceMetadata.manual.documentType WITHOUT touching sourceDate.
    // The helper must omit the field when undefined so Prisma doesn't
    // clear the column.
    await patchDocumentSourceMetadataAtomic(makePrisma(), {
      documentId: "doc_1",
      dealId: "deal_1",
      patch: () => ({
        nextSourceMetadata: { manual: { documentType: { setBy: "u" } } },
        // nextSourceDate omitted entirely.
      }),
    });
    const call = mocks.txDocumentUpdateMany.mock.calls[0]?.[0];
    expect(call?.data).not.toHaveProperty("sourceDate");
  });

  it("throws DocumentNotFoundForMetadataPatchError when the tx-scoped findUnique returns null (delete race)", async () => {
    mocks.txDocumentFindUnique.mockResolvedValueOnce(null);

    await expect(
      patchDocumentSourceMetadataAtomic(makePrisma(), {
        documentId: "doc_1",
        dealId: "deal_1",
        patch: () => ({ nextSourceMetadata: {} }),
      })
    ).rejects.toBeInstanceOf(DocumentNotFoundForMetadataPatchError);

    expect(mocks.txDocumentUpdateMany).not.toHaveBeenCalled();
  });

  it("throws DocumentNotFoundForMetadataPatchError when the row vanishes between findUnique and updateMany (count:0)", async () => {
    mocks.txDocumentUpdateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      patchDocumentSourceMetadataAtomic(makePrisma(), {
        documentId: "doc_1",
        dealId: "deal_1",
        patch: () => ({ nextSourceMetadata: { foo: "bar" } }),
      })
    ).rejects.toBeInstanceOf(DocumentNotFoundForMetadataPatchError);
  });

  it("throws DocumentNotFoundForMetadataPatchError on dealId mismatch (IDOR redundancy)", async () => {
    mocks.txDocumentFindUnique.mockResolvedValueOnce({
      id: "doc_1",
      dealId: "deal_DIFFERENT", // tx finds the doc but with a different dealId
      sourceDate: null,
      sourceMetadata: null,
    });

    await expect(
      patchDocumentSourceMetadataAtomic(makePrisma(), {
        documentId: "doc_1",
        dealId: "deal_1",
        patch: () => ({ nextSourceMetadata: { foo: "bar" } }),
      })
    ).rejects.toBeInstanceOf(DocumentNotFoundForMetadataPatchError);

    expect(mocks.txDocumentUpdateMany).not.toHaveBeenCalled();
  });

  it("retries on Postgres serialization failures (40001) and succeeds on the second attempt", async () => {
    let attempts = 0;
    // Set the mock BEFORE building the prisma object — `makePrisma()`
    // re-assigns `mocks.transaction.mockImplementation`, so calling it
    // in the retry test would clobber the override below.
    mocks.transaction.mockImplementation(
      async (
        fn: (tx: { document: { findUnique: unknown; updateMany: unknown } }) => unknown,
        _options?: unknown
      ) => {
        attempts++;
        if (attempts === 1) {
          // Simulate Postgres serialization_failure on the first attempt.
          const err = new Error("could not serialize access due to read/write dependencies") as Error & {
            code?: string;
          };
          err.code = "40001";
          throw err;
        }
        const tx = {
          document: {
            findUnique: mocks.txDocumentFindUnique,
            updateMany: mocks.txDocumentUpdateMany,
          },
        };
        return fn(tx);
      }
    );

    const result = await patchDocumentSourceMetadataAtomic(
      { $transaction: mocks.transaction } as never,
      {
        documentId: "doc_1",
        dealId: "deal_1",
        patch: () => ({ nextSourceMetadata: { foo: "bar" } }),
      }
    );

    expect(attempts).toBe(2);
    expect(result).toMatchObject({ sourceMetadata: { foo: "bar" } });
  });

  it("retries on Prisma's P2034 (transaction conflict) wrapping of the same condition", async () => {
    let attempts = 0;
    mocks.transaction.mockImplementation(
      async (
        fn: (tx: { document: { findUnique: unknown; updateMany: unknown } }) => unknown,
        _options?: unknown
      ) => {
        attempts++;
        if (attempts === 1) {
          const err = new Error("Transaction conflict") as Error & { code?: string };
          err.code = "P2034";
          throw err;
        }
        const tx = {
          document: {
            findUnique: mocks.txDocumentFindUnique,
            updateMany: mocks.txDocumentUpdateMany,
          },
        };
        return fn(tx);
      }
    );

    const result = await patchDocumentSourceMetadataAtomic(
      { $transaction: mocks.transaction } as never,
      {
        documentId: "doc_1",
        dealId: "deal_1",
        patch: () => ({ nextSourceMetadata: { foo: "bar" } }),
      }
    );

    expect(attempts).toBe(2);
    expect(result).toBeDefined();
  });

  it("re-throws non-serialization errors immediately (does NOT retry validation errors / not-found)", async () => {
    mocks.txDocumentFindUnique.mockResolvedValueOnce(null);

    await expect(
      patchDocumentSourceMetadataAtomic(makePrisma(), {
        documentId: "doc_1",
        dealId: "deal_1",
        patch: () => ({ nextSourceMetadata: {} }),
        maxRetries: 5,
      })
    ).rejects.toBeInstanceOf(DocumentNotFoundForMetadataPatchError);

    // Only ONE attempt — not-found is NOT a retryable condition.
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  // ============================================================
  // Codex B6.1 P2 — THE test the audit asked for: two distinct
  // patches simulating B6.1 manual.sourceDate + B6.2 manual.documentType
  // (or Phase 3 temporal) — both blocks must coexist after both patches.
  // ============================================================
  it("Codex B6.1 P2 — two interleaved patches: B6.1 manual.sourceDate + B6.2 manual.documentType BOTH preserved", async () => {
    // Scenario: B6.1 endpoint patches manual.sourceDate first; then a
    // hypothetical B6.2 endpoint patches manual.documentType. Without
    // the atomic helper, the second patch would have read the
    // pre-B6.1 sourceMetadata and clobbered the manual.sourceDate
    // block. The helper guarantees the second patch reads the
    // post-B6.1 sourceMetadata inside its OWN transaction.

    // FIRST PATCH (B6.1 manual.sourceDate) — starts from empty meta.
    mocks.txDocumentFindUnique.mockResolvedValueOnce({
      id: "doc_1",
      dealId: "deal_1",
      sourceDate: null,
      sourceMetadata: null,
    });

    await patchDocumentSourceMetadataAtomic(makePrisma(), {
      documentId: "doc_1",
      dealId: "deal_1",
      patch: (snapshot) => {
        const existingMeta = snapshot.sourceMetadata ?? {};
        const existingManual =
          existingMeta.manual && typeof existingMeta.manual === "object"
            ? (existingMeta.manual as Record<string, unknown>)
            : {};
        return {
          nextSourceMetadata: {
            ...existingMeta,
            manual: {
              ...existingManual,
              sourceDate: { setBy: "user_owner_1", newValue: "2026-03-14" },
            },
          },
          nextSourceDate: new Date("2026-03-14"),
        };
      },
    });

    const firstWriteMeta = mocks.txDocumentUpdateMany.mock.calls[0]?.[0]?.data?.sourceMetadata as Record<string, unknown>;
    expect(firstWriteMeta.manual).toMatchObject({
      sourceDate: { setBy: "user_owner_1" },
    });

    // SECOND PATCH (B6.2 manual.documentType simulation) — starts
    // from the post-B6.1 meta. The helper's tx-scoped findUnique
    // returns the snapshot post-first-write — the test simulates
    // this by mocking the second findUnique with the first write's
    // result.
    mocks.txDocumentFindUnique.mockResolvedValueOnce({
      id: "doc_1",
      dealId: "deal_1",
      sourceDate: new Date("2026-03-14"),
      sourceMetadata: firstWriteMeta,
    });

    await patchDocumentSourceMetadataAtomic(makePrisma(), {
      documentId: "doc_1",
      dealId: "deal_1",
      patch: (snapshot) => {
        const existingMeta = snapshot.sourceMetadata ?? {};
        const existingManual =
          existingMeta.manual && typeof existingMeta.manual === "object"
            ? (existingMeta.manual as Record<string, unknown>)
            : {};
        return {
          nextSourceMetadata: {
            ...existingMeta,
            manual: {
              ...existingManual,
              documentType: { setBy: "user_owner_2", newValue: "PITCH_DECK" },
            },
          },
          // nextSourceDate omitted — B6.2 doesn't touch the date.
        };
      },
    });

    const secondWriteMeta = mocks.txDocumentUpdateMany.mock.calls[1]?.[0]?.data?.sourceMetadata as Record<string, unknown>;
    const secondManual = secondWriteMeta.manual as Record<string, unknown>;

    // BOTH blocks present after the second write — proof that the
    // atomic helper preserves manual.sourceDate while adding
    // manual.documentType.
    expect(secondManual).toMatchObject({
      sourceDate: { setBy: "user_owner_1", newValue: "2026-03-14" },
      documentType: { setBy: "user_owner_2", newValue: "PITCH_DECK" },
    });

    // sourceDate column is NOT touched by the second patch (it
    // omitted nextSourceDate). Prisma omits absent fields, so the
    // updateMany data does NOT include sourceDate.
    expect(mocks.txDocumentUpdateMany.mock.calls[1]?.[0]?.data).not.toHaveProperty("sourceDate");
  });

  it("Codex B6.1 P2 — interleave with a Phase 3 `temporal` block: both manual + temporal coexist", async () => {
    // Phase 3 evidence-engine writes a `temporal` block via
    // promote-source-date.ts. If B6.1 manual.sourceDate writes
    // afterwards, the temporal block MUST survive. Symmetric:
    // a manual write followed by a temporal write must also keep
    // both blocks (anti-regression for future Phase 3 patches that
    // start using the helper).
    mocks.txDocumentFindUnique.mockResolvedValueOnce({
      id: "doc_1",
      dealId: "deal_1",
      sourceDate: null,
      sourceMetadata: {
        temporal: {
          promotedBy: "evidence-engine-phase3",
          evidenceSignalId: "sig_A",
        },
      },
    });

    await patchDocumentSourceMetadataAtomic(makePrisma(), {
      documentId: "doc_1",
      dealId: "deal_1",
      patch: (snapshot) => {
        const existing = snapshot.sourceMetadata ?? {};
        return {
          nextSourceMetadata: {
            ...existing,
            manual: {
              sourceDate: { setBy: "user_owner", newValue: "2026-03-14" },
            },
          },
          nextSourceDate: new Date("2026-03-14"),
        };
      },
    });

    const writeMeta = mocks.txDocumentUpdateMany.mock.calls[0]?.[0]?.data?.sourceMetadata as Record<string, unknown>;
    expect(writeMeta.temporal).toMatchObject({
      promotedBy: "evidence-engine-phase3",
      evidenceSignalId: "sig_A",
    });
    expect(writeMeta.manual).toMatchObject({
      sourceDate: { setBy: "user_owner" },
    });
  });
});

// ============================================================
// B6.2 — additionalDocumentFields (type / sourceKind)
// ============================================================
describe("patchDocumentSourceMetadataAtomic — B6.2 additionalDocumentFields", () => {
  it("snapshot exposes current type + sourceKind so the patch fn can capture previousValue", async () => {
    mocks.txDocumentFindUnique.mockResolvedValueOnce({
      id: "doc_1",
      dealId: "deal_1",
      sourceDate: null,
      sourceMetadata: null,
      type: "CAP_TABLE",
      sourceKind: "EMAIL",
    });

    const seenSnapshot: { type?: string; sourceKind?: string } = {};
    await patchDocumentSourceMetadataAtomic(makePrisma(), {
      documentId: "doc_1",
      dealId: "deal_1",
      patch: (snapshot) => {
        seenSnapshot.type = snapshot.type;
        seenSnapshot.sourceKind = snapshot.sourceKind;
        return { nextSourceMetadata: {} };
      },
    });

    expect(seenSnapshot.type).toBe("CAP_TABLE");
    expect(seenSnapshot.sourceKind).toBe("EMAIL");
  });

  it("writes additionalDocumentFields.type onto Document.type (same atomic update as sourceMetadata)", async () => {
    await patchDocumentSourceMetadataAtomic(makePrisma(), {
      documentId: "doc_1",
      dealId: "deal_1",
      patch: () => ({
        nextSourceMetadata: { manual: { documentType: { setBy: "u" } } },
        additionalDocumentFields: { type: "FINANCIAL_MODEL" },
      }),
    });

    const call = mocks.txDocumentUpdateMany.mock.calls[0]?.[0];
    expect(call?.data?.type).toBe("FINANCIAL_MODEL");
    // sourceMetadata still written.
    expect(call?.data?.sourceMetadata).toEqual({
      manual: { documentType: { setBy: "u" } },
    });
    // sourceKind NOT touched.
    expect(call?.data).not.toHaveProperty("sourceKind");
    // sourceDate NOT touched (nextSourceDate omitted).
    expect(call?.data).not.toHaveProperty("sourceDate");
  });

  it("writes additionalDocumentFields.sourceKind onto Document.sourceKind", async () => {
    await patchDocumentSourceMetadataAtomic(makePrisma(), {
      documentId: "doc_1",
      dealId: "deal_1",
      patch: () => ({
        nextSourceMetadata: { manual: { sourceKind: { setBy: "u" } } },
        additionalDocumentFields: { sourceKind: "NOTE" },
      }),
    });

    const call = mocks.txDocumentUpdateMany.mock.calls[0]?.[0];
    expect(call?.data?.sourceKind).toBe("NOTE");
    expect(call?.data).not.toHaveProperty("type");
  });

  it("writes BOTH type + sourceKind atomically when both are in additionalDocumentFields", async () => {
    await patchDocumentSourceMetadataAtomic(makePrisma(), {
      documentId: "doc_1",
      dealId: "deal_1",
      patch: () => ({
        nextSourceMetadata: {
          manual: { documentType: { setBy: "u" }, sourceKind: { setBy: "u" } },
        },
        additionalDocumentFields: { type: "OTHER", sourceKind: "EMAIL" },
        nextSourceDate: new Date("2026-03-14"),
      }),
    });

    expect(mocks.txDocumentUpdateMany).toHaveBeenCalledTimes(1);
    const call = mocks.txDocumentUpdateMany.mock.calls[0]?.[0];
    expect(call?.data?.type).toBe("OTHER");
    expect(call?.data?.sourceKind).toBe("EMAIL");
    expect(call?.data?.sourceDate).toBeInstanceOf(Date);
  });

  it("omits additionalDocumentFields entirely → ONLY sourceMetadata is written (back-compat with B6.1 callers)", async () => {
    await patchDocumentSourceMetadataAtomic(makePrisma(), {
      documentId: "doc_1",
      dealId: "deal_1",
      patch: () => ({
        nextSourceMetadata: { manual: { sourceDate: { setBy: "u" } } },
        nextSourceDate: new Date("2026-03-14"),
        // additionalDocumentFields omitted.
      }),
    });

    const call = mocks.txDocumentUpdateMany.mock.calls[0]?.[0];
    expect(call?.data).not.toHaveProperty("type");
    expect(call?.data).not.toHaveProperty("sourceKind");
    // sourceDate + sourceMetadata still written.
    expect(call?.data?.sourceDate).toBeInstanceOf(Date);
    expect(call?.data?.sourceMetadata).toBeDefined();
  });

  it("additionalDocumentFields with an empty object → no extra fields written (defensive)", async () => {
    await patchDocumentSourceMetadataAtomic(makePrisma(), {
      documentId: "doc_1",
      dealId: "deal_1",
      patch: () => ({
        nextSourceMetadata: { manual: {} },
        additionalDocumentFields: {},
      }),
    });

    const call = mocks.txDocumentUpdateMany.mock.calls[0]?.[0];
    expect(call?.data).not.toHaveProperty("type");
    expect(call?.data).not.toHaveProperty("sourceKind");
  });
});

// ============================================================
// B6.3 — additionalDocumentFields email metadata (receivedAt /
// sourceAuthor / sourceSubject)
// ============================================================
describe("patchDocumentSourceMetadataAtomic — B6.3 email metadata fields", () => {
  it("snapshot exposes current receivedAt / sourceAuthor / sourceSubject (audit-trail previousValue)", async () => {
    mocks.txDocumentFindUnique.mockResolvedValueOnce({
      id: "doc_1",
      dealId: "deal_1",
      sourceDate: null,
      sourceMetadata: null,
      type: "OTHER",
      sourceKind: "EMAIL",
      receivedAt: new Date("2026-04-07"),
      sourceAuthor: "Old Author <old@x.com>",
      sourceSubject: "Old subject",
    });

    const seen: Record<string, unknown> = {};
    await patchDocumentSourceMetadataAtomic(makePrisma(), {
      documentId: "doc_1",
      dealId: "deal_1",
      patch: (snapshot) => {
        seen.receivedAt = snapshot.receivedAt;
        seen.sourceAuthor = snapshot.sourceAuthor;
        seen.sourceSubject = snapshot.sourceSubject;
        return { nextSourceMetadata: {} };
      },
    });

    expect((seen.receivedAt as Date).toISOString().startsWith("2026-04-07")).toBe(true);
    expect(seen.sourceAuthor).toBe("Old Author <old@x.com>");
    expect(seen.sourceSubject).toBe("Old subject");
  });

  it("writes additionalDocumentFields.receivedAt (Date) onto Document.receivedAt", async () => {
    await patchDocumentSourceMetadataAtomic(makePrisma(), {
      documentId: "doc_1",
      dealId: "deal_1",
      patch: () => ({
        nextSourceMetadata: { manual: { receivedAt: { setBy: "u" } } },
        additionalDocumentFields: { receivedAt: new Date("2026-04-15") },
      }),
    });

    const call = mocks.txDocumentUpdateMany.mock.calls[0]?.[0];
    expect(call?.data?.receivedAt).toBeInstanceOf(Date);
    expect((call?.data?.receivedAt as Date).toISOString().startsWith("2026-04-15")).toBe(true);
    expect(call?.data).not.toHaveProperty("sourceAuthor");
    expect(call?.data).not.toHaveProperty("sourceSubject");
  });

  it("writes additionalDocumentFields.receivedAt = null to CLEAR the column (explicit null vs undefined)", async () => {
    await patchDocumentSourceMetadataAtomic(makePrisma(), {
      documentId: "doc_1",
      dealId: "deal_1",
      patch: () => ({
        nextSourceMetadata: { manual: { receivedAt: { setBy: "u", newValue: null } } },
        additionalDocumentFields: { receivedAt: null },
      }),
    });

    const call = mocks.txDocumentUpdateMany.mock.calls[0]?.[0];
    expect(call?.data?.receivedAt).toBeNull();
  });

  it("writes additionalDocumentFields.sourceAuthor (string) onto Document.sourceAuthor", async () => {
    await patchDocumentSourceMetadataAtomic(makePrisma(), {
      documentId: "doc_1",
      dealId: "deal_1",
      patch: () => ({
        nextSourceMetadata: { manual: { sourceAuthor: { setBy: "u" } } },
        additionalDocumentFields: { sourceAuthor: "Jean <jean@acme.com>" },
      }),
    });

    const call = mocks.txDocumentUpdateMany.mock.calls[0]?.[0];
    expect(call?.data?.sourceAuthor).toBe("Jean <jean@acme.com>");
  });

  it("writes additionalDocumentFields.sourceSubject (string) onto Document.sourceSubject", async () => {
    await patchDocumentSourceMetadataAtomic(makePrisma(), {
      documentId: "doc_1",
      dealId: "deal_1",
      patch: () => ({
        nextSourceMetadata: { manual: { sourceSubject: { setBy: "u" } } },
        additionalDocumentFields: { sourceSubject: "Q1 update" },
      }),
    });

    const call = mocks.txDocumentUpdateMany.mock.calls[0]?.[0];
    expect(call?.data?.sourceSubject).toBe("Q1 update");
  });

  it("writes ALL email metadata atomically in a single updateMany when all three are provided", async () => {
    await patchDocumentSourceMetadataAtomic(makePrisma(), {
      documentId: "doc_1",
      dealId: "deal_1",
      patch: () => ({
        nextSourceMetadata: { manual: {} },
        additionalDocumentFields: {
          receivedAt: new Date("2026-04-15"),
          sourceAuthor: "Jean <jean@acme.com>",
          sourceSubject: "Q1 update",
        },
      }),
    });

    expect(mocks.txDocumentUpdateMany).toHaveBeenCalledTimes(1);
    const call = mocks.txDocumentUpdateMany.mock.calls[0]?.[0];
    expect(call?.data?.receivedAt).toBeInstanceOf(Date);
    expect(call?.data?.sourceAuthor).toBe("Jean <jean@acme.com>");
    expect(call?.data?.sourceSubject).toBe("Q1 update");
  });
});
