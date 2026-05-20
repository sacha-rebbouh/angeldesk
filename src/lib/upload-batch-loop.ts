/**
 * Phase B2.3.1 — Pure batch-upload loop helper.
 *
 * Extracted from file-upload.tsx so the "skip cancelled-before-turn"
 * invariant (Codex B2.3.1 P1) can be unit-tested without React. The
 * production component composes this helper with `batch` (from
 * upload-batch.ts) and the React-bound `uploadFile`.
 *
 * Contract:
 *   - Items are processed in order.
 *   - If `batch.pendingIds()` no longer contains an item id (because it
 *     was settled out-of-band by cancel/timeout/etc.), `uploadFile` is
 *     NEVER invoked for that item.
 *   - cancelled return → batch.settleCancelled; pending return → no
 *     settle (poller will); otherwise → batch.settle(id, ok).
 */

import type { UploadBatchController } from "./upload-batch";

export interface BatchUploadLoopItem {
  id: string;
}

export interface BatchUploadLoopResult {
  ok: boolean;
  pending: boolean;
  cancelled: boolean;
}

export interface BatchUploadLoopHandlers {
  batch: Pick<UploadBatchController, "pendingIds" | "settle" | "settleCancelled">;
  uploadFile: (item: BatchUploadLoopItem) => Promise<BatchUploadLoopResult>;
}

export async function runBatchUploadLoop(
  items: readonly BatchUploadLoopItem[],
  { batch, uploadFile }: BatchUploadLoopHandlers
): Promise<void> {
  for (const item of items) {
    // Codex B2.3.1 P1 — skip files that were cancelled before their turn.
    if (!batch.pendingIds().includes(item.id)) continue;
    const result = await uploadFile(item);
    if (result.cancelled) {
      batch.settleCancelled(item.id);
      continue;
    }
    if (result.pending) {
      // Extraction in flight — settlement deferred to the per-file poller.
      continue;
    }
    batch.settle(item.id, result.ok);
  }
}
