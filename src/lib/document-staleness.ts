/**
 * Phase B3.3 — Detect documents stuck in PROCESSING / PENDING.
 *
 * "Stuck" means a non-terminal status (per B3.1's polling rule) where the
 * elapsed time since upload is past a per-status threshold. Terminal
 * statuses (COMPLETED / FAILED / CANCELLED) are never stale by
 * definition — FAILED has its own explicit retry path (B3.1).
 *
 * Defaults:
 *   - PENDING > 2 min  → Inngest should pick up almost immediately;
 *                        anything longer hints at a queue backlog or
 *                        misconfig.
 *   - PROCESSING > 10 min → a typical PDF OCR run completes well under
 *                           this. A 10-minute floor avoids false positives
 *                           for legitimately long docs while still
 *                           surfacing the orphan-run case to the user.
 *
 * The thresholds are exposed so the UI can tune them per environment
 * (e.g. preview vs prod) without forking the helper.
 */

import { isTerminalDocumentStatus } from "./document-polling";

export interface DocumentStalenessInput {
  processingStatus: string;
  /** Epoch ms or Date. We accept both for caller convenience. */
  uploadedAt: number | Date | string | null | undefined;
}

export interface DocumentStalenessOptions {
  /** Default = Date.now(). Test override. */
  nowMs?: number;
  /** Default 10 min. */
  processingThresholdMs?: number;
  /** Default 2 min. */
  pendingThresholdMs?: number;
}

export type DocumentStalenessReason = "pending_stuck" | "processing_stuck";

export interface DocumentStalenessResult {
  stale: boolean;
  /** Set when stale=true. */
  reason?: DocumentStalenessReason;
  /** Elapsed time in ms since `uploadedAt`, or null when timestamp is missing. */
  ageMs: number | null;
}

const DEFAULT_PROCESSING_THRESHOLD_MS = 10 * 60 * 1000;
const DEFAULT_PENDING_THRESHOLD_MS = 2 * 60 * 1000;

function toEpochMs(value: number | Date | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  // ISO string fallback (deal payload often serialises Date → string).
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

export function isDocumentStale(
  doc: DocumentStalenessInput,
  options: DocumentStalenessOptions = {}
): DocumentStalenessResult {
  // Terminal statuses are never stale.
  if (isTerminalDocumentStatus(doc.processingStatus)) {
    return { stale: false, ageMs: null };
  }
  const uploadedAtMs = toEpochMs(doc.uploadedAt);
  if (uploadedAtMs === null) {
    // No timestamp → we can't decide. Don't surface a false stale badge.
    return { stale: false, ageMs: null };
  }
  const now = options.nowMs ?? Date.now();
  const ageMs = Math.max(0, now - uploadedAtMs);

  if (doc.processingStatus === "PENDING") {
    const threshold = options.pendingThresholdMs ?? DEFAULT_PENDING_THRESHOLD_MS;
    if (ageMs > threshold) return { stale: true, reason: "pending_stuck", ageMs };
    return { stale: false, ageMs };
  }
  if (doc.processingStatus === "PROCESSING") {
    const threshold = options.processingThresholdMs ?? DEFAULT_PROCESSING_THRESHOLD_MS;
    if (ageMs > threshold) return { stale: true, reason: "processing_stuck", ageMs };
    return { stale: false, ageMs };
  }
  // Unknown non-terminal status — treat as non-stale (defensive).
  return { stale: false, ageMs };
}

/** Format minutes for the UI badge: "12 min", "1 h 03". */
export function formatStalenessAge(ageMs: number): string {
  const totalMinutes = Math.floor(ageMs / 60000);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} h ${minutes.toString().padStart(2, "0")}`;
}
