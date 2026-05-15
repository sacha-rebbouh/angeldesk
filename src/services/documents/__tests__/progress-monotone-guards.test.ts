import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 4.4 (Codex P1) — late-callback monotone guards. After the extraction
// time budget fires, the losing `smartExtract` keeps running in the
// background and can still emit progress writes. Those writes must NEVER
// re-open a terminal run / a terminal upload-progress row. These tests pin
// the DB-level guards that make the late writes atomic no-ops.

const mocks = vi.hoisted(() => ({
  runUpdateMany: vi.fn(),
  runFindUnique: vi.fn(),
  pageUpsert: vi.fn(),
  pageCount: vi.fn(),
  progressUpsert: vi.fn(),
  progressUpdateMany: vi.fn(),
  progressCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    documentExtractionRun: {
      updateMany: mocks.runUpdateMany,
      findUnique: mocks.runFindUnique,
    },
    documentExtractionPage: {
      upsert: mocks.pageUpsert,
      count: mocks.pageCount,
    },
    documentExtractionProgress: {
      upsert: mocks.progressUpsert,
      updateMany: mocks.progressUpdateMany,
      create: mocks.progressCreate,
    },
  },
}));

const { markExtractionRunProgress, recordExtractionPageProgress } = await import(
  "../extraction-runs"
);
const { setDocumentExtractionProgress } = await import("../extraction-progress");

function progressSnapshot(phase: string) {
  return {
    id: "progress_1",
    userId: "user_1",
    documentId: "doc_1",
    documentName: "deck.pdf",
    phase: phase as never,
    pageCount: 3,
    pagesProcessed: 1,
    percent: 25,
    message: "msg",
    updatedAt: new Date().toISOString(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.runUpdateMany.mockResolvedValue({ count: 1 });
  mocks.pageCount.mockResolvedValue(0);
  mocks.progressUpsert.mockResolvedValue(undefined);
  mocks.progressUpdateMany.mockResolvedValue({ count: 1 });
  mocks.progressCreate.mockResolvedValue(undefined);
});

describe("markExtractionRunProgress — monotone run guard", () => {
  it("updates ONLY a LIVE run — updateMany scoped to PENDING/PROCESSING", async () => {
    await markExtractionRunProgress({
      runId: "run_1",
      phase: "page_processed",
      message: "extracting",
    });

    // A late callback can never flip a terminal run back to PROCESSING: the
    // write is an updateMany scoped to the non-terminal statuses.
    expect(mocks.runUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.runUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run_1", status: { in: ["PENDING", "PROCESSING"] } },
      })
    );
  });

  it("the legitimate PROCESSING → FAILED transition still passes the guard", async () => {
    await markExtractionRunProgress({ runId: "run_1", phase: "failed", message: "boom" });

    const call = mocks.runUpdateMany.mock.calls[0]?.[0];
    // PROCESSING is a LIVE status, so a real failure write is not blocked.
    expect(call.where.status.in).toEqual(["PENDING", "PROCESSING"]);
    expect(call.data.status).toBe("FAILED");
  });
});

describe("recordExtractionPageProgress — monotone run guard", () => {
  it("is a no-op when the run is already terminal (no page write, no run update)", async () => {
    mocks.runFindUnique.mockResolvedValue({ status: "FAILED" });

    await recordExtractionPageProgress({
      runId: "run_1",
      page: {} as never,
    });

    // A late page callback from a timed-out background smartExtract must not
    // append a page to / re-open a terminal run.
    expect(mocks.pageUpsert).not.toHaveBeenCalled();
    expect(mocks.runUpdateMany).not.toHaveBeenCalled();
  });

  it.each(["READY", "READY_WITH_WARNINGS", "BLOCKED"] as const)(
    "is a no-op for terminal status %s",
    async (status) => {
      mocks.runFindUnique.mockResolvedValue({ status });

      await recordExtractionPageProgress({ runId: "run_1", page: {} as never });

      expect(mocks.pageUpsert).not.toHaveBeenCalled();
      expect(mocks.runUpdateMany).not.toHaveBeenCalled();
    }
  );

  it("is a no-op when the run row no longer exists", async () => {
    mocks.runFindUnique.mockResolvedValue(null);

    await recordExtractionPageProgress({ runId: "run_1", page: {} as never });

    expect(mocks.pageUpsert).not.toHaveBeenCalled();
    expect(mocks.runUpdateMany).not.toHaveBeenCalled();
  });
});

describe("setDocumentExtractionProgress — monotone progress guard", () => {
  it.each(["completed", "failed"] as const)(
    "a terminal phase (%s) always wins — plain upsert",
    async (phase) => {
      await setDocumentExtractionProgress(progressSnapshot(phase));

      expect(mocks.progressUpsert).toHaveBeenCalledTimes(1);
      // A terminal phase never goes through the conditional updateMany path.
      expect(mocks.progressUpdateMany).not.toHaveBeenCalled();
    }
  );

  it.each(["queued", "started", "native_extracted", "page_processed"] as const)(
    "a non-terminal phase (%s) updates ONLY a non-terminal row — updateMany scoped phase notIn [completed, failed]",
    async (phase) => {
      mocks.progressUpdateMany.mockResolvedValue({ count: 1 });

      await setDocumentExtractionProgress(progressSnapshot(phase));

      expect(mocks.progressUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "progress_1", phase: { notIn: ["completed", "failed"] } },
        })
      );
      // Row existed and was non-terminal → updated in place, no create.
      expect(mocks.progressCreate).not.toHaveBeenCalled();
      expect(mocks.progressUpsert).not.toHaveBeenCalled();
    }
  );

  it("a non-terminal phase whose row does not exist yet → create", async () => {
    mocks.progressUpdateMany.mockResolvedValue({ count: 0 }); // no row matched
    mocks.progressCreate.mockResolvedValue(undefined);

    await setDocumentExtractionProgress(progressSnapshot("page_processed"));

    expect(mocks.progressCreate).toHaveBeenCalledTimes(1);
  });

  it("a non-terminal phase racing a terminal writer (create hits P2002) → swallowed, monotone", async () => {
    // updateMany matched 0 rows because the row is ALREADY terminal; the
    // create then collides on the unique id. That must be swallowed — the
    // terminal row is left intact (monotone), no throw.
    mocks.progressUpdateMany.mockResolvedValue({ count: 0 });
    mocks.progressCreate.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" })
    );

    await expect(
      setDocumentExtractionProgress(progressSnapshot("page_processed"))
    ).resolves.toBeUndefined();
  });

  it("a non-terminal phase create failing with a NON-P2002 error still throws", async () => {
    mocks.progressUpdateMany.mockResolvedValue({ count: 0 });
    mocks.progressCreate.mockRejectedValue(
      Object.assign(new Error("connection reset"), { code: "P1001" })
    );

    await expect(
      setDocumentExtractionProgress(progressSnapshot("page_processed"))
    ).rejects.toThrow("connection reset");
  });
});
