/**
 * Phase B2.1 — Upload batch controller unit tests.
 *
 * Covers the multi-pending contract that closes the lastPendingExtraction
 * bug: when N PDF extractions are pending in the same batch, every settle
 * must count, and onAllComplete must fire EXACTLY ONCE with the final
 * counts across the whole batch.
 */
import { describe, expect, it, vi } from "vitest";
import { createUploadBatch, type UploadBatchSummary } from "../upload-batch";

describe("createUploadBatch — lifecycle", () => {
  it("start → isInFlight=true, pendingCount = files.length", () => {
    const batch = createUploadBatch();
    batch.start(["a", "b", "c"]);
    expect(batch.isInFlight()).toBe(true);
    expect(batch.pendingCount()).toBe(3);
    expect([...batch.pendingIds()].sort()).toEqual(["a", "b", "c"]);
  });

  it("settle decrements pending and accumulates counts", () => {
    const batch = createUploadBatch();
    batch.start(["a", "b", "c"]);
    batch.settle("a", true);
    expect(batch.pendingCount()).toBe(2);
    expect(batch.successCount()).toBe(1);
    expect(batch.errorCount()).toBe(0);
    batch.settle("b", false);
    expect(batch.pendingCount()).toBe(1);
    expect(batch.errorCount()).toBe(1);
  });

  it("Codex B2.1 P1 — 2 PDF async tous deux completed: onAllComplete success=2 ONE time", () => {
    const onAllComplete = vi.fn();
    const batch = createUploadBatch({ onAllComplete });
    batch.start(["pdf1", "pdf2"]);
    expect(onAllComplete).not.toHaveBeenCalled();
    batch.settle("pdf1", true);
    expect(onAllComplete).not.toHaveBeenCalled();
    batch.settle("pdf2", true);
    expect(onAllComplete).toHaveBeenCalledTimes(1);
    expect(onAllComplete).toHaveBeenCalledWith({ successCount: 2, errorCount: 0, cancelledCount: 0 } satisfies UploadBatchSummary);
  });

  it("Codex B2.1 P1 — 1 PDF completed + 1 PDF failed: counts justes (success=1, error=1)", () => {
    const onAllComplete = vi.fn();
    const batch = createUploadBatch({ onAllComplete });
    batch.start(["pdf_ok", "pdf_ko"]);
    batch.settle("pdf_ok", true);
    batch.settle("pdf_ko", false);
    expect(onAllComplete).toHaveBeenCalledTimes(1);
    expect(onAllComplete).toHaveBeenCalledWith({ successCount: 1, errorCount: 1, cancelledCount: 0 });
  });

  it("Codex B2.1 P1 — single PDF async (régression no-multi case)", () => {
    const onAllComplete = vi.fn();
    const batch = createUploadBatch({ onAllComplete });
    batch.start(["only"]);
    batch.settle("only", true);
    expect(onAllComplete).toHaveBeenCalledTimes(1);
    expect(onAllComplete).toHaveBeenCalledWith({ successCount: 1, errorCount: 0, cancelledCount: 0 });
  });

  it("Codex B2.1 P1 — mix sync + async (3 sync ok + 2 PDF async dont 1 fail)", () => {
    const onAllComplete = vi.fn();
    const batch = createUploadBatch({ onAllComplete });
    batch.start(["sync_a", "sync_b", "sync_c", "pdf_d", "pdf_e"]);
    // Sync settles first (during the handleUploadAll loop).
    batch.settle("sync_a", true);
    batch.settle("sync_b", true);
    batch.settle("sync_c", true);
    expect(onAllComplete).not.toHaveBeenCalled();
    expect(batch.pendingCount()).toBe(2);
    // Then async settles trickle in via pollers.
    batch.settle("pdf_d", false);
    expect(onAllComplete).not.toHaveBeenCalled();
    batch.settle("pdf_e", true);
    expect(onAllComplete).toHaveBeenCalledTimes(1);
    expect(onAllComplete).toHaveBeenCalledWith({ successCount: 4, errorCount: 1, cancelledCount: 0 });
  });

  it("settle hors batch (pas inFlight) est un no-op silencieux", () => {
    const onAllComplete = vi.fn();
    const batch = createUploadBatch({ onAllComplete });
    // No batch started.
    batch.settle("ghost", true);
    expect(onAllComplete).not.toHaveBeenCalled();
    expect(batch.isInFlight()).toBe(false);
  });

  it("settle d'un fileId inconnu pendant un batch est un no-op (idempotence défensive)", () => {
    const onAllComplete = vi.fn();
    const batch = createUploadBatch({ onAllComplete });
    batch.start(["a", "b"]);
    batch.settle("not_in_batch", true);
    expect(batch.pendingCount()).toBe(2);
    expect(batch.successCount()).toBe(0);
  });

  it("settle two fois sur le même fileId n'incrémente qu'une seule fois", () => {
    const onAllComplete = vi.fn();
    const batch = createUploadBatch({ onAllComplete });
    batch.start(["a", "b"]);
    batch.settle("a", true);
    batch.settle("a", true); // duplicate
    expect(batch.successCount()).toBe(1);
    expect(batch.pendingCount()).toBe(1);
  });

  it("start avec liste vide fire onAllComplete immédiatement avec zéros (symétrie)", () => {
    const onAllComplete = vi.fn();
    const batch = createUploadBatch({ onAllComplete });
    batch.start([]);
    expect(onAllComplete).toHaveBeenCalledTimes(1);
    expect(onAllComplete).toHaveBeenCalledWith({ successCount: 0, errorCount: 0, cancelledCount: 0 });
    expect(batch.isInFlight()).toBe(false);
  });

  it("onBatchSettled fire avant onAllComplete (sequencing)", () => {
    const calls: string[] = [];
    const batch = createUploadBatch({
      onBatchSettled: () => calls.push("settled"),
      onAllComplete: () => calls.push("complete"),
    });
    batch.start(["a"]);
    batch.settle("a", true);
    expect(calls).toEqual(["settled", "complete"]);
  });

  it("Codex B2.1 P1 — progressIds ne s'écrasent pas (controller tracks per-id, not per-progressId)", () => {
    // The controller works in terms of fileId, so progressIds are
    // structurally non-colliding even if two extractions had the same
    // progressId (which never happens because crypto.randomUUID, but
    // belt-and-braces).
    const batch = createUploadBatch();
    batch.start(["file_1", "file_2"]);
    batch.settle("file_1", true);
    expect(batch.pendingIds()).toEqual(["file_2"]);
    batch.settle("file_2", true);
    expect(batch.pendingIds()).toEqual([]);
  });

  it("reset clear l'état (ne fire pas onAllComplete)", () => {
    const onAllComplete = vi.fn();
    const batch = createUploadBatch({ onAllComplete });
    batch.start(["a", "b"]);
    batch.settle("a", true);
    batch.reset();
    expect(batch.isInFlight()).toBe(false);
    expect(batch.pendingCount()).toBe(0);
    expect(onAllComplete).not.toHaveBeenCalled();
  });

  it("après onAllComplete, le batch n'accepte plus de settle", () => {
    const onAllComplete = vi.fn();
    const batch = createUploadBatch({ onAllComplete });
    batch.start(["a"]);
    batch.settle("a", true);
    expect(onAllComplete).toHaveBeenCalledTimes(1);
    batch.settle("a", true); // post-batch noise
    expect(onAllComplete).toHaveBeenCalledTimes(1);
  });

  // ============================================================
  // B2.3 — cancellation contract
  // ============================================================

  it("B2.3 — settleCancelled décrémente pending sans bumper success ni error", () => {
    const onAllComplete = vi.fn();
    const batch = createUploadBatch({ onAllComplete });
    batch.start(["a", "b", "c"]);
    batch.settleCancelled("a");
    expect(batch.pendingCount()).toBe(2);
    expect(batch.successCount()).toBe(0);
    expect(batch.errorCount()).toBe(0);
    expect(batch.cancelledCount()).toBe(1);
    expect(onAllComplete).not.toHaveBeenCalled();
  });

  it("B2.3 — batch tout cancelled → onAllComplete success=0, error=0, cancelled=3", () => {
    const onAllComplete = vi.fn();
    const batch = createUploadBatch({ onAllComplete });
    batch.start(["a", "b", "c"]);
    batch.settleCancelled("a");
    batch.settleCancelled("b");
    batch.settleCancelled("c");
    expect(onAllComplete).toHaveBeenCalledTimes(1);
    expect(onAllComplete).toHaveBeenCalledWith({ successCount: 0, errorCount: 0, cancelledCount: 3 });
  });

  it("B2.3 — mix success + error + cancelled : counts justes, somme = batch size", () => {
    const onAllComplete = vi.fn();
    const batch = createUploadBatch({ onAllComplete });
    batch.start(["ok", "err", "cancel1", "cancel2"]);
    batch.settle("ok", true);
    batch.settle("err", false);
    batch.settleCancelled("cancel1");
    batch.settleCancelled("cancel2");
    expect(onAllComplete).toHaveBeenCalledTimes(1);
    expect(onAllComplete).toHaveBeenCalledWith({ successCount: 1, errorCount: 1, cancelledCount: 2 });
  });

  it("B2.3 — cancel ne bloque jamais onAllComplete (autres fichiers continuent)", () => {
    const onAllComplete = vi.fn();
    const batch = createUploadBatch({ onAllComplete });
    batch.start(["a", "b"]);
    batch.settleCancelled("a"); // user cancelled mid-batch
    expect(onAllComplete).not.toHaveBeenCalled();
    expect(batch.pendingCount()).toBe(1);
    batch.settle("b", true);
    expect(onAllComplete).toHaveBeenCalledTimes(1);
    expect(onAllComplete).toHaveBeenCalledWith({ successCount: 1, errorCount: 0, cancelledCount: 1 });
  });

  it("B2.3 — settleCancelled idempotent (cancel d'un id déjà settled = no-op)", () => {
    const onAllComplete = vi.fn();
    const batch = createUploadBatch({ onAllComplete });
    batch.start(["a"]);
    batch.settle("a", true);
    batch.settleCancelled("a"); // post-settle
    expect(batch.cancelledCount()).toBe(0);
    expect(onAllComplete).toHaveBeenCalledTimes(1);
  });

  it("B2.3 — settleCancelled hors batch = no-op", () => {
    const onAllComplete = vi.fn();
    const batch = createUploadBatch({ onAllComplete });
    batch.settleCancelled("ghost");
    expect(onAllComplete).not.toHaveBeenCalled();
    expect(batch.cancelledCount()).toBe(0);
  });

  it("B2.3 — reset clear le cancelledCount aussi", () => {
    const batch = createUploadBatch();
    batch.start(["a"]);
    batch.settleCancelled("a");
    expect(batch.cancelledCount()).toBe(1);
    batch.reset();
    expect(batch.cancelledCount()).toBe(0);
  });
});
