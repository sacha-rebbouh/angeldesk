/**
 * Phase B2.3.1 — Tests for the batch-upload loop helper.
 *
 * Closes the Codex B2.3 P1 finding: cancelling a validated file mid-batch
 * (before its upload turn) must NOT be counted as an error.
 */
import { describe, expect, it, vi } from "vitest";
import { runBatchUploadLoop, type BatchUploadLoopItem } from "../upload-batch-loop";
import { createUploadBatch } from "../upload-batch";

describe("runBatchUploadLoop — Codex B2.3.1 P1 contract", () => {
  it("Codex B2.3.1 P1 — cancel before upload turn: uploadFile NEVER called for cancelled item, summary has cancelled=1, error=0", async () => {
    const onAllComplete = vi.fn();
    const batch = createUploadBatch({ onAllComplete });
    batch.start(["A", "B"]);

    const items: BatchUploadLoopItem[] = [{ id: "A" }, { id: "B" }];
    const uploadFile = vi.fn(async (item: BatchUploadLoopItem) => {
      // SIMULATE: while uploading A, the user cancels B.
      if (item.id === "A") {
        batch.settleCancelled("B"); // mid-batch cancel of the next file
        return { ok: true, pending: false, cancelled: false };
      }
      // If the loop ever calls uploadFile for B, the test fails — B was
      // cancelled before its turn.
      throw new Error(`uploadFile must not be invoked for cancelled item ${item.id}`);
    });

    await runBatchUploadLoop(items, { batch, uploadFile });

    // A processed once, B never processed.
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(uploadFile).toHaveBeenCalledWith({ id: "A" });
    // Summary has success=1, error=0, cancelled=1 — NOT error=1.
    expect(onAllComplete).toHaveBeenCalledTimes(1);
    expect(onAllComplete).toHaveBeenCalledWith({
      successCount: 1,
      errorCount: 0,
      cancelledCount: 1,
    });
  });

  it("happy path: all sync uploads succeed → success=N", async () => {
    const onAllComplete = vi.fn();
    const batch = createUploadBatch({ onAllComplete });
    batch.start(["a", "b"]);
    const uploadFile = vi.fn(async () => ({ ok: true, pending: false, cancelled: false }));
    await runBatchUploadLoop([{ id: "a" }, { id: "b" }], { batch, uploadFile });
    expect(uploadFile).toHaveBeenCalledTimes(2);
    expect(onAllComplete).toHaveBeenCalledWith({ successCount: 2, errorCount: 0, cancelledCount: 0 });
  });

  it("uploadFile returns cancelled=true (abort mid-upload) → settleCancelled, not settle(false)", async () => {
    const onAllComplete = vi.fn();
    const batch = createUploadBatch({ onAllComplete });
    batch.start(["a"]);
    const uploadFile = vi.fn(async () => ({ ok: false, pending: false, cancelled: true }));
    await runBatchUploadLoop([{ id: "a" }], { batch, uploadFile });
    expect(onAllComplete).toHaveBeenCalledWith({ successCount: 0, errorCount: 0, cancelledCount: 1 });
  });

  it("pending=true → no settle (poller will), loop continues", async () => {
    const onAllComplete = vi.fn();
    const batch = createUploadBatch({ onAllComplete });
    batch.start(["pdf"]);
    const uploadFile = vi.fn(async () => ({ ok: true, pending: true, cancelled: false }));
    await runBatchUploadLoop([{ id: "pdf" }], { batch, uploadFile });
    // No settle fired — loop returned with pending still set.
    expect(onAllComplete).not.toHaveBeenCalled();
    expect(batch.pendingCount()).toBe(1);
  });

  it("mix: A succeeds sync, B cancelled before turn, C succeeds", async () => {
    const onAllComplete = vi.fn();
    const batch = createUploadBatch({ onAllComplete });
    batch.start(["A", "B", "C"]);
    const calls: string[] = [];
    const uploadFile = vi.fn(async (item: BatchUploadLoopItem) => {
      calls.push(item.id);
      if (item.id === "A") {
        batch.settleCancelled("B");
      }
      return { ok: true, pending: false, cancelled: false };
    });
    await runBatchUploadLoop([{ id: "A" }, { id: "B" }, { id: "C" }], { batch, uploadFile });
    expect(calls).toEqual(["A", "C"]); // B skipped
    expect(onAllComplete).toHaveBeenCalledWith({ successCount: 2, errorCount: 0, cancelledCount: 1 });
  });

  it("empty items list → loop is a no-op (batch must be pre-fired by start([]))", async () => {
    const onAllComplete = vi.fn();
    const batch = createUploadBatch({ onAllComplete });
    batch.start([]); // controller fires immediately for empty batch
    const uploadFile = vi.fn();
    await runBatchUploadLoop([], { batch, uploadFile });
    expect(uploadFile).not.toHaveBeenCalled();
    expect(onAllComplete).toHaveBeenCalledTimes(1);
    expect(onAllComplete).toHaveBeenCalledWith({ successCount: 0, errorCount: 0, cancelledCount: 0 });
  });
});
