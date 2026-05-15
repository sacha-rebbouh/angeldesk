import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 4.3 (durability — versions). `promoteDocumentVersionTx` is the single
// place where a candidate version (`isLatest: false`, created at upload time)
// becomes the lineage's `isLatest`. The gate Codex audits:
//   - isLatest flips ONLY after extraction reaches COMPLETED;
//   - the old version is preserved if the new version fails;
//   - no "état oscillant" — at most one isLatest per lineage, monotonic by
//     version (a late-completing older version never demotes a newer winner).

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  executeRaw: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    document: {
      findUnique: mocks.findUnique,
      findFirst: mocks.findFirst,
      updateMany: mocks.updateMany,
      update: mocks.update,
    },
  },
}));

const { promoteDocumentVersion, promoteDocumentVersionTx } = await import("../extraction-runs");

const tx = {
  $executeRaw: mocks.executeRaw,
  document: {
    findUnique: mocks.findUnique,
    findFirst: mocks.findFirst,
    updateMany: mocks.updateMany,
    update: mocks.update,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findFirst.mockResolvedValue(null);
  mocks.updateMany.mockResolvedValue({ count: 0 });
  mocks.update.mockResolvedValue(undefined);
  // `acquireDocumentLineageLock` uses `$executeRaw` (the lock fn returns
  // `void` — `$queryRaw` would throw P2010 deserializing it). `$executeRaw`
  // resolves to a row count.
  mocks.executeRaw.mockResolvedValue(1);
  mocks.transaction.mockImplementation(async (fn: (innerTx: typeof tx) => unknown) => fn(tx));
});

const candidate = {
  id: "doc_v2",
  dealId: "deal_1",
  name: "deck.pdf",
  corpusParentDocumentId: null,
  version: 2,
  processingStatus: "COMPLETED" as const,
};

describe("promoteDocumentVersionTx — COMPLETED gate", () => {
  it.each(["PENDING", "PROCESSING", "FAILED"] as const)(
    "does NOT promote when the document is %s — the old version is preserved",
    async (status) => {
      mocks.findUnique.mockResolvedValue({ ...candidate, processingStatus: status });

      await promoteDocumentVersionTx(tx as never, "doc_v2");

      // No demote, no promote — the lineage's existing isLatest is untouched.
      expect(mocks.updateMany).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
    }
  );

  it("does nothing when the document no longer exists", async () => {
    mocks.findUnique.mockResolvedValue(null);

    await promoteDocumentVersionTx(tx as never, "doc_missing");

    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("promoteDocumentVersionTx — promotion", () => {
  it("demotes every other current isLatest in the lineage and promotes the candidate", async () => {
    mocks.findUnique.mockResolvedValue(candidate);
    mocks.findFirst.mockResolvedValue(null); // no strictly-newer isLatest
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await promoteDocumentVersionTx(tx as never, "doc_v2");

    // The demote is scoped to the lineage tuple and excludes the candidate.
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        dealId: "deal_1",
        name: "deck.pdf",
        corpusParentDocumentId: null,
        isLatest: true,
        id: { not: "doc_v2" },
      },
      data: { isLatest: false, supersededAt: expect.any(Date) },
    });
    // The candidate is promoted and its own supersededAt cleared.
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "doc_v2" },
      data: { isLatest: true, supersededAt: null },
    });
    // Demote must run before promote — never two isLatest mid-flight.
    expect(mocks.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.update.mock.invocationCallOrder[0]
    );
  });

  it("scopes the lineage by corpusParentDocumentId when the document is a corpus attachment", async () => {
    mocks.findUnique.mockResolvedValue({ ...candidate, corpusParentDocumentId: "parent_doc" });

    await promoteDocumentVersionTx(tx as never, "doc_v2");

    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        dealId: "deal_1",
        name: "deck.pdf",
        corpusParentDocumentId: "parent_doc",
        isLatest: true,
        version: { gt: 2 },
      },
      select: { id: true },
    });
    expect(mocks.updateMany.mock.calls[0]?.[0]?.where).toMatchObject({
      corpusParentDocumentId: "parent_doc",
    });
  });
});

describe("promoteDocumentVersionTx — monotonic (no oscillation)", () => {
  it("does NOT promote when a strictly-newer version already holds isLatest", async () => {
    // v2 completes LATE, after v3 already won the slot. v2 must stay a
    // completed candidate — promoting it would demote the newer v3 and
    // cause exactly the oscillation the gate forbids.
    mocks.findUnique.mockResolvedValue(candidate); // version 2
    mocks.findFirst.mockResolvedValue({ id: "doc_v3" }); // a version > 2 is isLatest

    await promoteDocumentVersionTx(tx as never, "doc_v2");

    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("promotes when only OLDER versions hold isLatest (newer-than guard finds nothing)", async () => {
    mocks.findUnique.mockResolvedValue(candidate); // version 2
    mocks.findFirst.mockResolvedValue(null); // nothing with version > 2

    await promoteDocumentVersionTx(tx as never, "doc_v2");

    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        dealId: "deal_1",
        name: "deck.pdf",
        corpusParentDocumentId: null,
        isLatest: true,
        version: { gt: 2 },
      },
      select: { id: true },
    });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "doc_v2" },
      data: { isLatest: true, supersededAt: null },
    });
  });
});

describe("promoteDocumentVersionTx — brand-new single version", () => {
  it("is a harmless no-op write (no sibling to demote, self stays isLatest)", async () => {
    mocks.findUnique.mockResolvedValue({ ...candidate, id: "doc_v1", version: 1 });
    mocks.findFirst.mockResolvedValue(null);
    mocks.updateMany.mockResolvedValue({ count: 0 }); // no siblings

    await promoteDocumentVersionTx(tx as never, "doc_v1");

    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "doc_v1" },
      data: { isLatest: true, supersededAt: null },
    });
  });
});

describe("promoteDocumentVersion — standalone wrapper", () => {
  it("runs the promotion inside a Prisma transaction", async () => {
    mocks.findUnique.mockResolvedValue(candidate);

    await promoteDocumentVersion({ documentId: "doc_v2" });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "doc_v2" },
      data: { isLatest: true, supersededAt: null },
    });
  });
});

describe("promoteDocumentVersionTx — concurrency (per-lineage advisory lock)", () => {
  // Codex Phase 4.3 P1: the `newerLatest` check-then-act races under
  // concurrency unless the whole critical section is serialized per lineage.
  // These tests prove the lock is taken and that the decision-making reads
  // happen INSIDE it — a real interleaving test needs a live DB (Phase 4.5).

  it("acquires a per-lineage advisory lock BEFORE the newerLatest check and the writes", async () => {
    mocks.findUnique.mockResolvedValue(candidate);
    mocks.findFirst.mockResolvedValue(null);

    await promoteDocumentVersionTx(tx as never, "doc_v2");

    expect(mocks.executeRaw).toHaveBeenCalledTimes(1);
    // The advisory lock is acquired before the newerLatest read and before
    // the demote/promote writes — everything that decides the outcome runs
    // inside the critical section.
    const lockOrder = mocks.executeRaw.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(mocks.findFirst.mock.invocationCallOrder[0]);
    expect(lockOrder).toBeLessThan(mocks.updateMany.mock.invocationCallOrder[0]);
    expect(lockOrder).toBeLessThan(mocks.update.mock.invocationCallOrder[0]);
  });

  it("derives the advisory lock key from the lineage tuple — NUL-free and unambiguous", async () => {
    mocks.findUnique.mockResolvedValue({
      ...candidate,
      // A name containing what a naive separator-joined key would use —
      // proves the key delimiting is unambiguous.
      name: "deck v2.pdf",
      corpusParentDocumentId: "parent_doc",
    });

    await promoteDocumentVersionTx(tx as never, "doc_v2");

    // The tagged-template call: [stringsArray, ...values]. The interpolated
    // value is the lineage-derived lock key.
    const key = mocks.executeRaw.mock.calls[0]?.[1] as string;
    expect(key).toContain("deal_1");
    expect(key).toContain("deck v2.pdf");
    expect(key).toContain("parent_doc");
    // PostgreSQL rejects 0x00 in `text` values — the key (passed to
    // `hashtext()` as a text param) must never contain a NUL byte.
    expect(key).not.toContain("\0");
    // The key must round-trip as a structured value — proves the parts are
    // delimited unambiguously (a separator-joined string would not).
    expect(JSON.parse(key)).toEqual(["doc-lineage", "deal_1", "deck v2.pdf", "parent_doc"]);
  });

  it("does NOT take the lock for a non-COMPLETED document (fast-exit before the critical section)", async () => {
    mocks.findUnique.mockResolvedValue({ ...candidate, processingStatus: "PROCESSING" });

    await promoteDocumentVersionTx(tx as never, "doc_v2");

    expect(mocks.executeRaw).not.toHaveBeenCalled();
  });

  it("re-reads processingStatus INSIDE the lock and bails if a concurrent reprocess moved it off COMPLETED", async () => {
    // Pre-lock read sees COMPLETED; by the time the lock is held, a
    // concurrent reprocess has moved the document to PROCESSING. The
    // promotion must abort — never promote a no-longer-COMPLETED document.
    mocks.findUnique
      .mockResolvedValueOnce(candidate) // pre-lock read
      .mockResolvedValueOnce({ processingStatus: "PROCESSING" }); // re-read under lock

    await promoteDocumentVersionTx(tx as never, "doc_v2");

    expect(mocks.executeRaw).toHaveBeenCalledTimes(1); // lock WAS taken
    expect(mocks.findFirst).not.toHaveBeenCalled(); // but the check-then-act bailed
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
