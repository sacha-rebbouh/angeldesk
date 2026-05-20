/**
 * Phase B3.2 — Upload session recovery storage.
 *
 * Persists a MINIMAL snapshot of the modal's queue + sessionId in
 * localStorage so a refresh/tab-close mid-session doesn't drop the user
 * back to an empty modal. Restored items are flagged `needsReselect`
 * because the `File` sidecar is JS-bound only — we can never restore the
 * actual bytes.
 *
 * Privacy / security:
 *   - Stored data: queue metadata (filename, size, MIME, lastModified,
 *     documentType, customType). Same surface as the diagnostic log;
 *     no OCR text, no blob URL, no token, no file bytes.
 *   - Scoped per `dealId`: a second deal can't read a first deal's
 *     queue.
 *   - TTL 24h: stale snapshots are dropped on read.
 *   - Cleared on terminal (`onAllComplete`).
 *
 * SSR-safe: every entry-point guards `typeof window`.
 */

const SCHEMA_VERSION = 1 as const;
const KEY_PREFIX = "angeldesk:upload-session:v1:";
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * B3.3 P3 cleanup — accepted documentType values. Kept in sync with the
 * union in upload-queue.ts. A persisted snapshot with an unknown
 * documentType is treated as corrupt (whole session rejected) so a
 * future enum addition / removal can't silently smuggle a bad value
 * into the queue.
 */
const KNOWN_DOCUMENT_TYPES: ReadonlySet<string> = new Set([
  "PITCH_DECK",
  "FINANCIAL_MODEL",
  "CAP_TABLE",
  "TERM_SHEET",
  "INVESTOR_MEMO",
  "FINANCIAL_STATEMENTS",
  "LEGAL_DOCS",
  "MARKET_STUDY",
  "PRODUCT_DEMO",
  "OTHER",
]);

export interface PersistedUploadItem {
  id: string;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  documentType: string;
  customType: string;
}

export interface PersistedUploadSession {
  schemaVersion: typeof SCHEMA_VERSION;
  sessionId: string;
  dealId: string;
  savedAt: number;
  items: PersistedUploadItem[];
}

function storageKey(dealId: string): string {
  return `${KEY_PREFIX}${dealId}`;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // Some embeds disable localStorage (Safari private mode used to throw).
    return null;
  }
}

/**
 * Save the current session. Items list MUST contain only metadata —
 * never the underlying File. Empty items triggers clearSession instead.
 */
export function saveUploadSession(
  dealId: string,
  sessionId: string,
  items: readonly PersistedUploadItem[]
): void {
  if (!dealId || !sessionId) return;
  const storage = getStorage();
  if (!storage) return;
  if (items.length === 0) {
    clearUploadSession(dealId);
    return;
  }
  const payload: PersistedUploadSession = {
    schemaVersion: SCHEMA_VERSION,
    sessionId,
    dealId,
    savedAt: Date.now(),
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      size: item.size,
      type: item.type,
      lastModified: item.lastModified,
      documentType: item.documentType,
      customType: item.customType,
    })),
  };
  try {
    storage.setItem(storageKey(dealId), JSON.stringify(payload));
  } catch {
    // Quota exceeded or storage disabled mid-session. We don't surface this
    // as an error — the modal degrades gracefully (no recovery on refresh).
  }
}

export interface LoadUploadSessionOptions {
  /** Override TTL for tests / future tuning. */
  maxAgeMs?: number;
  /** Test override of Date.now. */
  nowMs?: number;
}

/**
 * Load a previously-saved session for the dealId. Returns `null` (and
 * clears the snapshot) when:
 *   - no storage / SSR
 *   - no entry
 *   - parse fails
 *   - schemaVersion mismatch
 *   - older than maxAgeMs (default 24h)
 *   - items array is missing/invalid
 *
 * Caller is responsible for restoring items into the queue with
 * needsReselect=true.
 */
export function loadUploadSession(
  dealId: string,
  options: LoadUploadSessionOptions = {}
): PersistedUploadSession | null {
  if (!dealId) return null;
  const storage = getStorage();
  if (!storage) return null;
  const raw = storage.getItem(storageKey(dealId));
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearUploadSession(dealId);
    return null;
  }
  if (!isValidPersistedSession(parsed)) {
    clearUploadSession(dealId);
    return null;
  }
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const now = options.nowMs ?? Date.now();
  if (now - parsed.savedAt > maxAgeMs) {
    clearUploadSession(dealId);
    return null;
  }
  return parsed;
}

export function clearUploadSession(dealId: string): void {
  if (!dealId) return;
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(storageKey(dealId));
  } catch {
    // Ignore.
  }
}

function isValidPersistedSession(value: unknown): value is PersistedUploadSession {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<PersistedUploadSession>;
  if (v.schemaVersion !== SCHEMA_VERSION) return false;
  if (typeof v.sessionId !== "string" || v.sessionId.length === 0) return false;
  if (typeof v.dealId !== "string" || v.dealId.length === 0) return false;
  if (typeof v.savedAt !== "number" || !Number.isFinite(v.savedAt)) return false;
  if (!Array.isArray(v.items)) return false;
  return v.items.every(isValidPersistedItem);
}

function isValidPersistedItem(value: unknown): value is PersistedUploadItem {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<PersistedUploadItem>;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.size === "number" &&
    typeof v.type === "string" &&
    typeof v.lastModified === "number" &&
    // B3.3 P3 cleanup — documentType must be one of the known enum values.
    // Localstorage is client-only but a snapshot can survive an enum change
    // (rename / removal) or be tampered with from devtools; reject anything
    // unknown so the queue is never poisoned with an invalid documentType.
    typeof v.documentType === "string" &&
    KNOWN_DOCUMENT_TYPES.has(v.documentType) &&
    typeof v.customType === "string"
  );
}
