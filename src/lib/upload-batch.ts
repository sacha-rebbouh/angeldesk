/**
 * Phase B2.1 — Upload batch lifecycle controller.
 *
 * One `start()` call = one batch. Each file is settled exactly once
 * (sync from the upload step, OR async from the multi-poller's terminal
 * phase). `onAllComplete` fires EXACTLY ONCE when the last file in the
 * batch settles, with the FINAL counts across the whole batch.
 *
 * The previous single-extraction model lost N-1 PDF async files because
 * it only tracked `lastPendingExtraction`. Lifting this state into a
 * dedicated controller makes the multi-pending contract testable without
 * mounting React.
 */

export interface UploadBatchSummary {
  successCount: number;
  errorCount: number;
  /**
   * Phase B2.3 — files removed from the batch via user cancel. NOT counted
   * as success NOR as error. The total fired (success + error + cancelled)
   * equals the original batch size.
   */
  cancelledCount: number;
}

export interface UploadBatchHandlers {
  onAllComplete?: (summary: UploadBatchSummary) => void;
  /** Fired the moment the batch transitions from in-flight to settled. */
  onBatchSettled?: () => void;
}

export interface UploadBatchController {
  start(fileIds: readonly string[]): void;
  settle(fileId: string, ok: boolean): void;
  /**
   * Phase B2.3 — user cancelled the upload/extraction for this file.
   * Decrements the pending set but does NOT bump success or error counts.
   * If the cancel empties the pending set, onAllComplete still fires.
   */
  settleCancelled(fileId: string): void;
  isInFlight(): boolean;
  pendingCount(): number;
  pendingIds(): readonly string[];
  successCount(): number;
  errorCount(): number;
  cancelledCount(): number;
  reset(): void;
}

export function createUploadBatch(handlers: UploadBatchHandlers = {}): UploadBatchController {
  let pending = new Set<string>();
  let successCount = 0;
  let errorCount = 0;
  let cancelledCount = 0;
  let inFlight = false;

  const fireComplete = () => {
    inFlight = false;
    handlers.onBatchSettled?.();
    handlers.onAllComplete?.({ successCount, errorCount, cancelledCount });
  };

  const removePending = (fileId: string): boolean => {
    if (!inFlight) return false;
    if (!pending.has(fileId)) return false;
    pending.delete(fileId);
    return true;
  };

  return {
    start(fileIds) {
      pending = new Set(fileIds);
      successCount = 0;
      errorCount = 0;
      cancelledCount = 0;
      inFlight = true;
      if (pending.size === 0) {
        // Empty batch fires onAllComplete with zero counts immediately so
        // callers can rely on the symmetry start → onAllComplete.
        fireComplete();
      }
    },
    settle(fileId, ok) {
      if (!removePending(fileId)) return;
      if (ok) successCount += 1;
      else errorCount += 1;
      if (pending.size === 0) fireComplete();
    },
    settleCancelled(fileId) {
      if (!removePending(fileId)) return;
      cancelledCount += 1;
      if (pending.size === 0) fireComplete();
    },
    isInFlight() {
      return inFlight;
    },
    pendingCount() {
      return pending.size;
    },
    pendingIds() {
      return Array.from(pending);
    },
    successCount() {
      return successCount;
    },
    errorCount() {
      return errorCount;
    },
    cancelledCount() {
      return cancelledCount;
    },
    reset() {
      pending = new Set();
      successCount = 0;
      errorCount = 0;
      cancelledCount = 0;
      inFlight = false;
    },
  };
}
