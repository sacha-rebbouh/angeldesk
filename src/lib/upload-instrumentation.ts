/**
 * Phase B0 — Upload intake instrumentation.
 *
 * Records lifecycle events for a single modal session so the user (and ops)
 * can diagnose a failed/slow upload WITHOUT DevTools. The diagnostic export
 * is safe-by-construction: payloads are typed and contain only metadata
 * (filename, size, MIME, timestamps, normalised errors). It is structurally
 * impossible to attach OCR text, blob URLs, tokens, secrets or file bytes
 * because the API surface refuses unknown keys.
 *
 * One module session = one `uploadSessionId`. The log is in-memory only; the
 * user copies it to clipboard via the modal's "Copier diagnostic" button.
 */

export type UploadEvent =
  | "modal_opened"
  | "files_selected"
  | "file_queued"
  | "validation_started"
  | "validation_completed"
  | "upload_started"
  | "upload_failed"
  | "upload_completed"
  | "upload_retry_started"
  | "upload_cancelled"
  | "extraction_pending"
  | "extraction_completed"
  | "extraction_failed";

/**
 * Whitelisted metadata about a file. Used for redaction-safe logs. We
 * intentionally drop fields like `lastModifiedDate`, `webkitRelativePath`
 * etc. because they're not informative for debugging.
 */
export interface UploadEventFileMeta {
  fileId: string;
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

/**
 * Typed payload schema — each event defines exactly which optional fields
 * it accepts. No free-form `extra` field, no `any` payload. This is the
 * redaction guarantee: a caller CANNOT pass a blob URL or OCR text because
 * there is no field to put it in.
 */
export interface UploadEventEntry {
  event: UploadEvent;
  sessionId: string;
  ts: number;
  /** Set on file-scoped events. */
  file?: UploadEventFileMeta;
  /** Set on completion-style events (validation_completed, upload_completed, etc.). */
  durationMs?: number;
  /** Normalised error message — already stripped by the caller before recording. */
  error?: string;
}

/** Subset accepted by `record()`. The session/timestamp are injected. */
export type UploadEventInput = Omit<UploadEventEntry, "sessionId" | "ts"> & {
  ts?: number; // override for tests
};

export interface InstrumentationLog {
  readonly sessionId: string;
  record(input: UploadEventInput): void;
  snapshot(): readonly UploadEventEntry[];
  /** Safe-to-clipboard diagnostic — pure metadata, no secrets. */
  redactedDiagnostic(): RedactedDiagnostic;
  /** Clear the log (used when the modal reopens). */
  reset(newSessionId?: string): void;
}

export interface RedactedDiagnostic {
  sessionId: string;
  generatedAt: string;
  totalEvents: number;
  events: UploadEventEntry[];
  files: UploadEventFileMeta[];
  errorSummary: Array<{ event: UploadEvent; error: string; count: number }>;
}

/**
 * Cryptographically-strong sessionId (UUID v4 via Web Crypto). Falls back to
 * a deterministic-but-unique string when `crypto.randomUUID` is unavailable
 * (server-side tests, very old browsers).
 */
export function createUploadSessionId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `upl_${globalThis.crypto.randomUUID()}`;
  }
  // Fallback: high-resolution timestamp + counter. Acceptable for diagnostic
  // correlation; not used as a security identifier.
  return `upl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

const KNOWN_EVENTS: readonly UploadEvent[] = [
  "modal_opened",
  "files_selected",
  "file_queued",
  "validation_started",
  "validation_completed",
  "upload_started",
  "upload_failed",
  "upload_completed",
  // B2.2 — per-item retry. Recorded BEFORE the new upload_started so the
  // diagnostic preserves the chain "first attempt → fail → retry → success/fail".
  "upload_retry_started",
  // B2.3 — user-initiated cancel. Distinct from upload_failed so ops can
  // separate genuine failures from voluntary cancellation in metrics.
  "upload_cancelled",
  "extraction_pending",
  "extraction_completed",
  "extraction_failed",
] as const;

/**
 * Normalise an error before it enters the log. Strips known secret patterns
 * defensively (in case the caller forgot to). Caps length so a giant stack
 * trace can't bloat the diagnostic.
 */
export function normaliseUploadError(input: unknown): string {
  let msg =
    input instanceof Error
      ? input.message
      : typeof input === "string"
        ? input
        : "Unknown error";
  // Strip obvious secret patterns. Caller should already have done this, but
  // defence in depth: blob signed URLs (?token=...), Authorization headers,
  // bearer tokens, Vercel Blob client tokens.
  msg = msg
    .replace(/\?token=[^&\s]+/gi, "?token=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]")
    .replace(/vercel_blob_rw_[A-Za-z0-9_\-]+/gi, "vercel_blob_rw_[redacted]")
    .replace(/sk_(live|test)_[A-Za-z0-9_\-]+/gi, "sk_[redacted]");
  return msg.slice(0, 500);
}

/**
 * Factory. Caller passes the sessionId so the session can be created once
 * at modal mount and re-passed across renders (the log itself lives in a
 * ref, not state).
 */
export function createInstrumentationLog(sessionId: string): InstrumentationLog {
  const entries: UploadEventEntry[] = [];
  let currentSessionId = sessionId;

  return {
    get sessionId() {
      return currentSessionId;
    },
    record(input) {
      if (!KNOWN_EVENTS.includes(input.event)) {
        // Hard refuse unknown events so a typo never enters the log silently.
        throw new Error(`Unknown upload event: ${input.event}`);
      }
      entries.push({
        event: input.event,
        sessionId: currentSessionId,
        ts: input.ts ?? Date.now(),
        file: input.file,
        durationMs: input.durationMs,
        error: input.error,
      });
    },
    snapshot() {
      return entries.slice();
    },
    redactedDiagnostic() {
      // Deduplicate files seen across events.
      const seen = new Map<string, UploadEventFileMeta>();
      for (const e of entries) {
        if (e.file && !seen.has(e.file.fileId)) seen.set(e.file.fileId, e.file);
      }
      // Aggregate errors per (event, error).
      const errorMap = new Map<string, { event: UploadEvent; error: string; count: number }>();
      for (const e of entries) {
        if (!e.error) continue;
        const key = `${e.event}|${e.error}`;
        const existing = errorMap.get(key);
        if (existing) existing.count += 1;
        else errorMap.set(key, { event: e.event, error: e.error, count: 1 });
      }
      return {
        sessionId: currentSessionId,
        generatedAt: new Date().toISOString(),
        totalEvents: entries.length,
        events: entries.slice(),
        files: Array.from(seen.values()),
        errorSummary: Array.from(errorMap.values()),
      };
    },
    reset(newSessionId) {
      entries.length = 0;
      if (newSessionId) currentSessionId = newSessionId;
    },
  };
}
