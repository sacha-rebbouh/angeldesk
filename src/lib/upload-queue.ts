/**
 * Phase B1 — Upload queue state machine.
 *
 * The queue holds LIGHTWEIGHT metadata about selected files (id, name,
 * size, type, lastModified, type-selection). It deliberately does NOT
 * reference the underlying `File` object — that lives in a separate
 * sidecar map owned by the component (a `useRef<Map<string, File>>`).
 *
 * This separation has two practical consequences:
 *   1. The render path never holds File bytes. Adding 6 files to the queue
 *      is a fixed O(metadata) cost, no matter how large the files are.
 *   2. The reducer is pure and node-testable. We can assert deterministic
 *      transitions without needing JSDOM or a File polyfill.
 *
 * State machine (canonical, B2 will tighten the upload→saved→extracting
 * sub-states; for B0/B1 we already need them named so the instrumentation
 * events map cleanly):
 *
 *   selected → validating → validated → uploading → saved → extracting → completed
 *                      ↘ error                ↘ error              ↘ error
 *                                                                   ↘ cancelled
 */

export type DocumentType =
  | "PITCH_DECK"
  | "FINANCIAL_MODEL"
  | "CAP_TABLE"
  | "TERM_SHEET"
  | "INVESTOR_MEMO"
  | "FINANCIAL_STATEMENTS"
  | "LEGAL_DOCS"
  | "MARKET_STUDY"
  | "PRODUCT_DEMO"
  | "OTHER";

/**
 * B2.4 — `saved` was in the union but never dispatched: the upload pipeline
 * goes uploading → (extracting | completed) directly, with no intermediate
 * "saved" beat. Removed rather than left as dead UI surface.
 */
export type UploadItemState =
  | "selected"
  | "validating"
  | "validated"
  | "uploading"
  | "extracting"
  | "completed"
  | "error"
  | "cancelled";

export interface UploadQueueItem {
  id: string;
  /** File.name */
  name: string;
  /** File.size in bytes */
  size: number;
  /** File.type (MIME). May be empty on some browsers — that's OK. */
  type: string;
  /** File.lastModified epoch ms */
  lastModified: number;
  documentType: DocumentType;
  /** Free-form label when documentType === "OTHER" */
  customType: string;
  state: UploadItemState;
  /** Set when state === "error". */
  error?: string;
  /**
   * Phase B2.4 — structured cause (validation, auth, duplicate, blob, server,
   * extraction, etc.). The UI renders category-specific cues; ops correlate
   * by category. Stamped via `set_state` action when error is set.
   */
  errorCategory?: string;
  /** Phase B2.4 — actionable label surfaced next to error message. */
  errorActionLabel?: string;
  /**
   * Phase B2.4 — opaque-shaped action payload. The component decides how
   * to dispatch the action onClick (e.g. duplicate → open existing doc).
   * Kept as `unknown` here so the queue module stays free of upload-domain
   * types (no cross-imports).
   */
  errorActionData?: unknown;
  /** Set after validation, even if validated OK (informational). */
  validationError?: string;
  /**
   * Phase B3.2 — true when this item was restored from a persisted
   * upload session (page refresh / tab close). The metadata is present
   * but the underlying `File` sidecar is gone — the user must
   * re-select the file before any state transition (validation, upload)
   * can proceed. Cleared by the `attach_file_to_item` action.
   */
  needsReselect?: boolean;
}

export type UploadQueueAction =
  | { kind: "add_items"; items: UploadQueueItem[] }
  | { kind: "remove"; id: string }
  | { kind: "set_document_type"; id: string; documentType: DocumentType }
  | { kind: "set_custom_type"; id: string; customType: string }
  | {
      kind: "set_state";
      id: string;
      state: UploadItemState;
      error?: string;
      /** Phase B2.4 — propagated alongside the error message for category-aware UI. */
      errorCategory?: string;
      errorActionLabel?: string;
      errorActionData?: unknown;
    }
  | { kind: "set_validation"; id: string; ok: boolean; error?: string }
  | { kind: "reset" }
  | {
      /**
       * Phase B3.2 — re-hydrate items from a persisted upload session.
       * Items are added with `needsReselect: true`. Existing ids are
       * skipped (re-running `restore_session` is idempotent).
       */
      kind: "restore_session";
      items: UploadQueueItem[];
    }
  | {
      /**
       * Phase B3.2 — user re-selected a file for an item that was
       * restored from storage. Clears `needsReselect`; state transitions
       * back to "selected" so the validation pipeline kicks in. The
       * caller is responsible for adding the File to the sidecar map.
       *
       * B3.2.1 P2 — when the re-selected file has different name/size/
       * type/lastModified than the originally-queued item (user picked
       * a corrected version), the caller passes `refreshedMetadata` so
       * the queue + subsequent validation reflect the REAL file, not
       * the stale snapshot.
       */
      kind: "attach_file_to_item";
      id: string;
      refreshedMetadata?: {
        name: string;
        size: number;
        type: string;
        lastModified: number;
      };
    };

export const initialQueueState: readonly UploadQueueItem[] = [];

export function uploadQueueReducer(
  state: readonly UploadQueueItem[],
  action: UploadQueueAction
): readonly UploadQueueItem[] {
  switch (action.kind) {
    case "add_items": {
      // Idempotent on id collision (defensive — duplicate id should never
      // happen since createQueueItem uses randomUUID, but if it does we drop
      // the duplicate rather than render two rows with the same key).
      const existingIds = new Set(state.map((item) => item.id));
      const incoming = action.items.filter((item) => !existingIds.has(item.id));
      if (incoming.length === 0) return state;
      return [...state, ...incoming];
    }
    case "remove":
      return state.filter((item) => item.id !== action.id);
    case "set_document_type":
      return state.map((item) =>
        item.id === action.id ? { ...item, documentType: action.documentType } : item
      );
    case "set_custom_type":
      return state.map((item) =>
        item.id === action.id ? { ...item, customType: action.customType } : item
      );
    case "set_state":
      return state.map((item) => {
        if (item.id !== action.id) return item;
        const next: UploadQueueItem = { ...item, state: action.state };
        if (action.state === "error") {
          // Stamp the new error message when provided; otherwise keep the
          // existing one (defensive — most callers always pass an error).
          if (action.error !== undefined) next.error = action.error;
          // B2.4 — category + action are part of the error envelope. Always
          // refresh when entering error; allows the UI to drop a stale
          // duplicate action when the same item later fails for another reason.
          if (action.errorCategory !== undefined) next.errorCategory = action.errorCategory;
          else delete next.errorCategory;
          if (action.errorActionLabel !== undefined) next.errorActionLabel = action.errorActionLabel;
          else delete next.errorActionLabel;
          if (action.errorActionData !== undefined) next.errorActionData = action.errorActionData;
          else delete next.errorActionData;
        } else {
          // B2.2 — transition out of "error" must clear the stale message.
          // Without this, a retry that succeeded would still display the
          // previous failure reason on the row.
          delete next.error;
          // B2.4 — same logic for the structured envelope.
          delete next.errorCategory;
          delete next.errorActionLabel;
          delete next.errorActionData;
        }
        return next;
      });
    case "set_validation":
      return state.map((item) => {
        if (item.id !== action.id) return item;
        if (action.ok) {
          return { ...item, state: "validated", validationError: undefined };
        }
        return { ...item, state: "error", validationError: action.error, error: action.error };
      });
    case "reset":
      return [];
    case "restore_session": {
      const existingIds = new Set(state.map((item) => item.id));
      const incoming = action.items.filter((item) => !existingIds.has(item.id));
      if (incoming.length === 0) return state;
      // Force `needsReselect: true` regardless of what the caller passed
      // — restored items NEVER have a File sidecar at this point.
      return [...state, ...incoming.map((item) => ({ ...item, needsReselect: true }))];
    }
    case "attach_file_to_item":
      return state.map((item) => {
        if (item.id !== action.id) return item;
        const next: UploadQueueItem = { ...item, state: "selected" };
        if (action.refreshedMetadata) {
          // B3.2.1 P2 — the re-selected file differs from the originally
          // queued one. Apply the real file's metadata so validation and
          // upload-route choice (server vs blob) use the right size.
          next.name = action.refreshedMetadata.name;
          next.size = action.refreshedMetadata.size;
          next.type = action.refreshedMetadata.type;
          next.lastModified = action.refreshedMetadata.lastModified;
        }
        delete next.needsReselect;
        delete next.error;
        delete next.errorCategory;
        delete next.errorActionLabel;
        delete next.errorActionData;
        delete next.validationError;
        return next;
      });
    default: {
      const exhaustive: never = action;
      void exhaustive;
      return state;
    }
  }
}

/**
 * Pull only the metadata fields a queue item needs. **Never** invokes
 * `arrayBuffer()`, `text()`, `slice()`, `stream()` or `FileReader`. The
 * test `createQueueItem-does-not-read-file` enforces this.
 */
export function createQueueItem(
  file: File,
  defaults: { documentType: DocumentType }
): UploadQueueItem {
  const id =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return {
    id,
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
    documentType: defaults.documentType,
    customType: "",
    state: "selected",
  };
}
