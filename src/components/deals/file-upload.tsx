"use client";

import React, { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { put as putBlob } from "@vercel/blob/client";
import {
  Upload,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FileText,
  FileSpreadsheet,
  Presentation,
  RotateCw,
  Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { clerkFetch } from "@/lib/clerk-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  createInstrumentationLog,
  createUploadSessionId,
  normaliseUploadError,
  type InstrumentationLog,
} from "@/lib/upload-instrumentation";
import {
  createQueueItem,
  initialQueueState,
  uploadQueueReducer,
  type UploadQueueItem,
} from "@/lib/upload-queue";
import { createConcurrencyPool } from "@/lib/upload-concurrency";
import { createUploadBatch, type UploadBatchController } from "@/lib/upload-batch";
import {
  clearUploadSession,
  loadUploadSession,
  saveUploadSession,
  type PersistedUploadItem,
} from "@/lib/upload-session-storage";
import { runBatchUploadLoop } from "@/lib/upload-batch-loop";
import {
  UploadError,
  classifyExtractionFailure,
  classifyHttpError,
  classifyTransportError,
  type UploadErrorClassification,
} from "@/lib/upload-error-classification";

export const DOCUMENT_TYPES = [
  { value: "PITCH_DECK", label: "Pitch Deck" },
  { value: "FINANCIAL_MODEL", label: "Financial Model" },
  { value: "CAP_TABLE", label: "Cap Table" },
  { value: "TERM_SHEET", label: "Term Sheet" },
  { value: "INVESTOR_MEMO", label: "Investor Memo" },
  { value: "FINANCIAL_STATEMENTS", label: "États financiers" },
  { value: "LEGAL_DOCS", label: "Docs juridiques" },
  { value: "MARKET_STUDY", label: "Étude de marché" },
  { value: "PRODUCT_DEMO", label: "Demo produit" },
  { value: "OTHER", label: "Autre" },
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number]["value"];

/**
 * Phase B1 — picker validation concurrency. Tunable so we can adjust without
 * touching component logic. 2 is conservative: enough to overlap I/O when
 * we add real validation (B2), light enough never to saturate the main
 * thread on metadata-only checks.
 */
const VALIDATION_CONCURRENCY = 2;

/**
 * Phase B2.1 — snapshot stored per pending extraction so the poller never
 * has to look up a potentially-stale queue entry by id. Captured at the
 * moment the extraction is registered (state transitions to "extracting").
 */
interface PendingExtraction {
  progressId: string;
  itemName: string;
  itemSize: number;
  itemType: string;
  itemLastModified: number;
  documentType: DocumentType;
}

function buildFileMetaForLog(file: File, fileId: string) {
  return {
    fileId,
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
  };
}

export interface UploadProgressSnapshot {
  phase: string;
  documentId?: string;
  documentName?: string;
  pageCount: number;
  pagesProcessed: number;
  percent: number;
  message?: string;
}

export interface UploadedDocumentSummary {
  id: string;
  name: string;
  type: string;
  hasStorage?: boolean;
  mimeType?: string | null;
  processingStatus?: string;
  extractionQuality?: number | null;
  extractionMetrics?: unknown;
  extractionWarnings?: Array<{ code: string; severity: "critical" | "high" | "medium" | "low"; message: string; suggestion: string }> | null;
  requiresOCR?: boolean;
  uploadedAt?: string | Date;
  sourceKind?: "FILE" | "EMAIL" | "NOTE";
  corpusRole?: "GENERAL" | "DILIGENCE_RESPONSE";
  sourceDate?: string | Date | null;
  receivedAt?: string | Date | null;
  sourceAuthor?: string | null;
  sourceSubject?: string | null;
  linkedQuestionSource?: "RED_FLAG" | "QUESTION_TO_ASK" | null;
  linkedQuestionText?: string | null;
  linkedRedFlagId?: string | null;
  corpusParentDocumentId?: string | null;
  corpusParentDocument?: { id: string; name: string } | null;
}

export interface UploadAllSummary {
  successCount: number;
  errorCount: number;
  /** Phase B2.3 — files explicitly cancelled by the user. NOT a failure. */
  cancelledCount: number;
}

/**
 * Phase B4 — live queue snapshot the dialog uses to drive its footer
 * (summary line + smart close-button label). Re-derived from the queue +
 * extraction map on every change; the dialog never reads the queue
 * directly. Pure additive contract — does NOT change the state machine.
 */
export interface QueueSummary {
  total: number;
  /** state === "completed" */
  completedCount: number;
  /** state === "error" */
  errorCount: number;
  /** state === "cancelled" */
  cancelledCount: number;
  /** uploading + extracting */
  inFlightCount: number;
  /** selected + validating */
  validatingCount: number;
  /** state === "validated" — ready to upload */
  readyCount: number;
  /** needsReselect === true */
  needsReselectCount: number;
}

interface FileUploadProps {
  dealId: string;
  onUploadQueued?: (document: UploadedDocumentSummary) => void;
  onUploadComplete?: (document: UploadedDocumentSummary) => void;
  onError?: (error: string) => void;
  onAllComplete?: (summary: UploadAllSummary) => void;
  disabled?: boolean;
  /**
   * Phase B0 — caller-provided instrumentation log. The dialog owns the
   * session lifecycle (creates an id when it opens, resets on close); the
   * upload component just records into it. When omitted, the component
   * creates its own ephemeral log (preserves backward compatibility for
   * callers that don't yet wire B0).
   */
  instrumentation?: InstrumentationLog;
  /**
   * Phase B2.4.1 P2 — invoked when the user clicks the duplicate row's
   * "Voir le document existant" action. The component never knows how to
   * surface the existing doc (that's deal-page concern: scroll-to,
   * highlight, open preview, etc.). Without this wire, the action label
   * is just text.
   */
  onViewExistingDocument?: (doc: { documentId: string; documentName: string }) => void;
  /**
   * Phase B4 — fired on every queue snapshot change so the dialog can
   * render footer counters + a state-aware close-button label without
   * duplicating the queue derivation logic. Additive: when omitted, the
   * component behaves exactly as before.
   */
  onQueueSummaryChange?: (summary: QueueSummary) => void;
}

const ACCEPTED_TYPES = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/msword": [".doc"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
};

const MAX_SIZE = 50 * 1024 * 1024;
const SERVER_UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;

type UploadApiResult = {
  data: UploadedDocumentSummary;
  // Phase 4.2: present for PDFs. `pending: true` means the durable
  // extraction was enqueued and is still running — the client must keep
  // polling the upload progress endpoint until a terminal phase.
  extraction?: {
    pending?: boolean;
  };
};

function getFileIcon(mimeType: string) {
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return FileSpreadsheet;
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return Presentation;
  return FileText;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function parseUploadApiResponse(response: Response): Promise<UploadApiResult> {
  if (response.ok) {
    return response.json() as Promise<UploadApiResult>;
  }
  // Phase B2.4 — classify the HTTP failure into a category-bearing
  // UploadError so the catch block can render an actionable message
  // (duplicate, auth, payload_size, etc.) instead of "Upload failed".
  const rawBody = await response.text();
  const classification = classifyHttpError(response.status, rawBody);
  throw new UploadError(classification.category, classification.message, {
    actionLabel: classification.actionLabel,
    actionData: classification.actionData,
  });
}

/**
 * Phase B2.3.1 P2 — best-effort signal binding. SubtleCrypto operations
 * don't natively accept an AbortSignal, so we cannot interrupt them mid-
 * operation. We do the next-best thing: throw an AbortError-shaped
 * DOMException at every await boundary if the signal has been aborted.
 * For large files this still avoids an expensive blob upload AFTER the
 * encryption finishes, even though the encryption itself isn't cancellable.
 */
function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("Upload aborted by user", "AbortError");
  }
}

async function encryptFileForServer(
  file: File,
  signal: AbortSignal
): Promise<{
  encryptedBlob: Blob;
  keyHex: string;
  ivHex: string;
}> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Le chiffrement navigateur est indisponible pour cet upload");
  }

  throwIfAborted(signal);
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  throwIfAborted(signal);
  const fileBuffer = await file.arrayBuffer();
  throwIfAborted(signal);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivBytes },
    key,
    fileBuffer
  );
  throwIfAborted(signal);

  return {
    encryptedBlob: new Blob([new Uint8Array(encrypted)], { type: "application/octet-stream" }),
    keyHex: bytesToHex(keyBytes),
    ivHex: bytesToHex(ivBytes),
  };
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function buildTemporaryBlobPathname(dealId: string): string {
  // Opaque random temp pathname. We intentionally drop the user-supplied
  // filename here — Vercel Blob temp paths are public-readable until the
  // server-side cleanup deletes them, and the legacy `${uuid}-${filename}.enc`
  // scheme leaked the original filename. The final blob lives at an opaque
  // path too (see route.ts: deals/${dealId}/${randomUUID()}${ext}).
  return `tmp/document-uploads/${dealId}/${crypto.randomUUID()}.enc`;
}

function canFallbackToServerUpload(): boolean {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

// Monotonic progress merge: once a percent has been displayed, never report a
// lower value within the same upload session. Terminal phases ("completed",
// "failed") bypass the guard so the UI can settle to its final state. Pure
// function for unit testing.
export function mergeMonotonicProgress(
  prev: UploadProgressSnapshot | null,
  next: UploadProgressSnapshot
): UploadProgressSnapshot {
  if (!prev) return next;
  if (next.phase === "completed" || next.phase === "failed") return next;
  if (next.percent < prev.percent) {
    return { ...next, percent: prev.percent };
  }
  return next;
}

export const FileUpload = memo(function FileUpload({
  dealId,
  onUploadQueued,
  onUploadComplete,
  onError,
  onAllComplete,
  disabled = false,
  instrumentation: instrumentationProp,
  onViewExistingDocument,
  onQueueSummaryChange,
}: FileUploadProps) {
  // Phase B0 — instrumentation log: use the one passed by the dialog when
  // present (so the session spans the full modal lifecycle), otherwise
  // create an ephemeral one local to this component instance.
  const fallbackLogRef = useRef<InstrumentationLog | null>(null);
  if (fallbackLogRef.current === null && !instrumentationProp) {
    fallbackLogRef.current = createInstrumentationLog(createUploadSessionId());
  }
  const instrumentation = instrumentationProp ?? fallbackLogRef.current!;

  // Phase B1 — lightweight queue + sidecar File map. The queue is what the
  // render tree consumes; the File objects live in a ref so adding 6 files
  // is a fixed-cost operation regardless of how big each file is.
  const [queue, dispatch] = useReducer(uploadQueueReducer, initialQueueState);
  const filesByIdRef = useRef<Map<string, File>>(new Map());
  // Persistent concurrency pool for the validation pipeline.
  const validationPoolRef = useRef<ReturnType<typeof createConcurrencyPool> | null>(null);
  if (validationPoolRef.current === null) {
    validationPoolRef.current = createConcurrencyPool(VALIDATION_CONCURRENCY);
  }

  const [isUploading, setIsUploading] = useState(false);
  const [uploadStartedAt, setUploadStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [activeUploadFileName, setActiveUploadFileName] = useState<string | null>(null);
  // Single-stream upload progress: handleUploadAll loops sequentially, so
  // there is at most ONE upload in flight at a time. This snapshot is
  // cleared as soon as the upload returns (success → either completed or
  // moves to extraction-pending). Per-file extraction progress lives in
  // `extractionProgressByFile` instead.
  const [activeUploadProgress, setActiveUploadProgress] = useState<UploadProgressSnapshot | null>(null);
  const announcedDocumentIdsRef = useRef<Set<string>>(new Set());

  // Phase B3.2 — recovery on mount. Restored items show as `needsReselect`
  // until the user provides the File again. recoveryAttemptedRef guards
  // against React strict-mode double-mount duplicating the restore.
  const recoveryAttemptedRef = useRef(false);
  // Hidden file input + ref tracking which item is currently asking for
  // a re-attached File. We use a SINGLE input shared across rows to keep
  // the DOM minimal; the per-row button writes its id here before clicking.
  const reselectInputRef = useRef<HTMLInputElement | null>(null);
  const reselectTargetIdRef = useRef<string | null>(null);

  // Phase B2.1 P1 — durable PDF extractions can be N concurrent in the
  // SAME batch (handleUploadAll launches uploads sequentially; each upload
  // can transition to "extracting" and the next upload starts while the
  // previous extraction is still polling). The old single
  // `extractionPending` state silently lost N-1 files. Multi-pending map
  // tracks each in-flight extraction by its sidecar progressId. Each entry
  // snapshots the metadata needed by the poller so it never has to re-read
  // a possibly-stale `queue`.
  const [extractionsPending, setExtractionsPending] = useState<Record<string, PendingExtraction>>({});
  // Per-file extraction progress snapshot. Keyed by fileId so two
  // simultaneous extractions never overwrite each other.
  const [extractionProgressByFile, setExtractionProgressByFile] = useState<Record<string, UploadProgressSnapshot>>({});
  // Poller cleanup callbacks tracked outside React so the sync effect can
  // start/stop pollers without ever cancelling a still-running one on
  // re-render.
  const pollersRef = useRef<Map<string, () => void>>(new Map());
  // Phase B2.3 — AbortControllers for in-flight uploads. Allows cancel-
  // during-uploading to abort the fetch (server route + client blob put)
  // rather than letting it run to completion in the background.
  const uploadAbortRef = useRef<Map<string, AbortController>>(new Map());

  // Phase B2.1 — single source of truth for the running batch lifecycle.
  // Lifted into a pure controller (`@/lib/upload-batch`) so the
  // multi-pending contract is testable without React. One handleUploadAll
  // call = one `start()` → many `settle(fileId, ok)` → onAllComplete fires
  // EXACTLY ONCE with the final batch counts.
  const onAllCompleteRef = useRef<typeof onAllComplete>(onAllComplete);
  useEffect(() => {
    onAllCompleteRef.current = onAllComplete;
  }, [onAllComplete]);
  const batchRef = useRef<UploadBatchController | null>(null);
  if (batchRef.current === null) {
    batchRef.current = createUploadBatch({
      onAllComplete: (summary) => onAllCompleteRef.current?.(summary),
      onBatchSettled: () => {
        setIsUploading(false);
        setUploadStartedAt(null);
        setActiveUploadFileName(null);
        setActiveUploadProgress(null);
        setElapsedSeconds(0);
      },
    });
  }
  const batch = batchRef.current;

  /**
   * Phase B1 — validate a single queue item. SYNCHRONOUS metadata checks only
   * (size, extension hint, sidecar File presence). No FileReader, no header
   * sniff, no preview. When we add real validation in B2 it goes here behind
   * the concurrency pool.
   */
  const validateItem = useCallback(
    async (item: UploadQueueItem): Promise<{ ok: boolean; error?: string }> => {
      const file = filesByIdRef.current.get(item.id);
      if (!file) {
        return { ok: false, error: "File reference missing in queue" };
      }
      if (item.size > MAX_SIZE) {
        return {
          ok: false,
          error: `Fichier trop volumineux (${formatFileSize(item.size)} > ${formatFileSize(MAX_SIZE)})`,
        };
      }
      // Future B2 hooks: header-sniff, duplicate check via hash, etc.
      return { ok: true };
    },
    []
  );

  /**
   * Phase B3.2 — restore a persisted session if one exists for this deal.
   * Runs exactly once per mount (recoveryAttemptedRef). Items come back
   * with `needsReselect=true`; the user re-attaches each File via the
   * hidden input below before any state-machine transition fires.
   *
   * If the load returns null (no snapshot, expired, schema mismatch, etc.)
   * the modal opens in its fresh state — no surprise.
   */
  useEffect(() => {
    if (recoveryAttemptedRef.current) return;
    recoveryAttemptedRef.current = true;
    const restored = loadUploadSession(dealId);
    if (!restored || restored.items.length === 0) return;
    const queueItems: UploadQueueItem[] = restored.items.map((p) => ({
      id: p.id,
      name: p.name,
      size: p.size,
      type: p.type,
      lastModified: p.lastModified,
      documentType: p.documentType as DocumentType,
      customType: p.customType,
      state: "selected",
      needsReselect: true,
    }));
    dispatch({ kind: "restore_session", items: queueItems });
  }, [dealId]);

  /**
   * Phase B3.2 — persist the recoverable subset of the queue on every
   * change.
   *
   * B3.2.1 P1 — `uploading` is INCLUDED. If the user refreshes mid-
   * transfer before the server has created the Document, there's no
   * server-side state to recover from (no row in the deal's documents
   * list, no PROCESSING doc for B3.1 polling). Persisting `uploading`
   * means the next mount sees the item come back as `needsReselect`,
   * so the user can pick the file again and retry.
   *
   * `extracting`, `completed`, `cancelled` stay excluded:
   *   - extracting → the server has the doc, B3.1 polling resumes it
   *   - completed → already in the deal's documents list
   *   - cancelled → user gave up explicitly
   *
   * When the persistable list is empty the helper clears the snapshot —
   * that's the "storage nettoyé après terminal" gate from the user spec.
   */
  useEffect(() => {
    if (!dealId) return;
    const persistable: PersistedUploadItem[] = queue
      .filter(
        (item) =>
          item.state === "selected" ||
          item.state === "validating" ||
          item.state === "validated" ||
          item.state === "uploading" ||
          item.state === "error"
      )
      .map((item) => ({
        id: item.id,
        name: item.name,
        size: item.size,
        type: item.type,
        lastModified: item.lastModified,
        documentType: item.documentType,
        customType: item.customType,
      }));
    saveUploadSession(dealId, instrumentation.sessionId, persistable);
  }, [queue, dealId, instrumentation]);

  /**
   * Phase B3.2 — user re-selected a file for a restored item.
   *
   * B3.2.1 P2 — on metadata mismatch, the queue is REFRESHED (not just
   * warned about) so subsequent validation (size cap), the upload-route
   * choice (server vs blob, by file.size), and the diagnostic events
   * all reflect the REAL file the user just picked. Without this, the
   * stale snapshot would drive validation + path choice and the user
   * would see incorrect behaviour.
   *
   * B3.2.1 P1 — after attaching, immediately re-run validation via the
   * shared helper so the row transitions through validating → validated
   * (or → error). Without this kick, the row would stay "selected" with
   * readyCount=0 and the user couldn't continue.
   */
  /**
   * Phase B3.2.1 P1 — single entry-point for kicking off validation on a
   * queue item. Takes the item snapshot directly (not by id) so the
   * caller controls what metadata gets validated — this matters when
   * the queue state hasn't re-rendered yet after a dispatch (onDrop
   * case) OR when re-validating against post-attach metadata that the
   * caller knows synchronously (handleReselectAttach case).
   */
  const startValidationForItem = useCallback(
    (item: UploadQueueItem) => {
      const pool = validationPoolRef.current!;
      const fileMeta = {
        fileId: item.id,
        name: item.name,
        size: item.size,
        type: item.type,
        lastModified: item.lastModified,
      };
      dispatch({ kind: "set_state", id: item.id, state: "validating" });
      const startedAt = Date.now();
      instrumentation.record({ event: "validation_started", ts: startedAt, file: fileMeta });
      void pool
        .run(() => validateItem(item))
        .then((result) => {
          const finishedAt = Date.now();
          dispatch({ kind: "set_validation", id: item.id, ok: result.ok, error: result.error });
          instrumentation.record({
            event: "validation_completed",
            ts: finishedAt,
            durationMs: finishedAt - startedAt,
            file: fileMeta,
            error: result.ok ? undefined : normaliseUploadError(result.error ?? "Validation failed"),
          });
          if (!result.ok && result.error) {
            onError?.(`${item.name}: ${result.error}`);
          }
        });
    },
    [instrumentation, validateItem, onError]
  );

  const handleReselectAttach = useCallback(
    (itemId: string, file: File) => {
      const item = queue.find((i) => i.id === itemId);
      if (!item) return;
      const nameMismatch = file.name !== item.name;
      const sizeMismatch = file.size !== item.size;
      const refreshedMetadata = (nameMismatch || sizeMismatch)
        ? {
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified,
          }
        : undefined;
      if (refreshedMetadata) {
        onError?.(
          `Le fichier sélectionné (${file.name}, ${(file.size / 1024).toFixed(0)}KB) diffère de l'original (${item.name}, ${(item.size / 1024).toFixed(0)}KB). Les métadonnées ont été mises à jour.`
        );
      }
      filesByIdRef.current.set(itemId, file);
      dispatch({ kind: "attach_file_to_item", id: itemId, refreshedMetadata });
      // Construct the post-dispatch snapshot synchronously so the validation
      // helper sees the refreshed metadata (queue won't have re-rendered yet).
      // Kept in sync with the reducer's attach_file_to_item case.
      const refreshedItem: UploadQueueItem = {
        ...item,
        ...(refreshedMetadata ?? {}),
        state: "selected",
      };
      delete refreshedItem.needsReselect;
      delete refreshedItem.error;
      delete refreshedItem.errorCategory;
      delete refreshedItem.errorActionLabel;
      delete refreshedItem.errorActionData;
      delete refreshedItem.validationError;
      startValidationForItem(refreshedItem);
    },
    [queue, onError, startValidationForItem]
  );

  const triggerReselectFor = useCallback((itemId: string) => {
    reselectTargetIdRef.current = itemId;
    reselectInputRef.current?.click();
  }, []);

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      const selectedAt = Date.now();
      rejectedFiles.forEach((rejection) => {
        const msg = `${rejection.file.name}: ${rejection.errors.map((e) => e.message).join(", ")}`;
        onError?.(msg);
        instrumentation.record({
          event: "upload_failed",
          ts: selectedAt,
          error: normaliseUploadError(msg),
          file: buildFileMetaForLog(rejection.file, "rejected"),
        });
      });

      if (acceptedFiles.length === 0) return;

      // Synchronous, metadata-only construction. createQueueItem is unit-
      // tested to invoke ZERO heavy File APIs.
      const items = acceptedFiles.map((file) =>
        createQueueItem(file, { documentType: "PITCH_DECK" })
      );
      acceptedFiles.forEach((file, i) => {
        filesByIdRef.current.set(items[i].id, file);
      });

      instrumentation.record({
        event: "files_selected",
        ts: selectedAt,
        durationMs: 0,
      });
      items.forEach((item) => {
        instrumentation.record({
          event: "file_queued",
          ts: selectedAt,
          file: { fileId: item.id, name: item.name, size: item.size, type: item.type, lastModified: item.lastModified },
        });
      });

      dispatch({ kind: "add_items", items });

      // B3.2.1 P1 — delegate to the shared helper so reselect and onDrop
      // run the SAME validation pipeline (was inlined twice before, drift
      // risk). Each task is independent — a failure on one item must not
      // block the others.
      items.forEach((item) => {
        startValidationForItem(item);
      });
    },
    [onError, instrumentation, startValidationForItem]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_SIZE,
    disabled: disabled || isUploading,
  });

  /** Single-stream upload progress (transfer phase, sequential per batch). */
  const applyActiveUploadProgress = useCallback((next: UploadProgressSnapshot) => {
    setActiveUploadProgress((prev) => mergeMonotonicProgress(prev, next));
  }, []);

  /** Per-file extraction progress (multi-pending phase). */
  const applyExtractionProgress = useCallback((fileId: string, next: UploadProgressSnapshot) => {
    setExtractionProgressByFile((prev) => ({
      ...prev,
      [fileId]: mergeMonotonicProgress(prev[fileId] ?? null, next),
    }));
  }, []);

  /**
   * Phase B2.1 — settle one file in the running batch via the controller.
   * Safe to call from either the sync upload path (uploadFile returns
   * ok/error immediately) OR the async extraction poller. Idempotent.
   */
  const settleFile = useCallback(
    (fileId: string, ok: boolean) => {
      batch.settle(fileId, ok);
    },
    [batch]
  );

  const removeFile = useCallback((id: string) => {
    filesByIdRef.current.delete(id);
    dispatch({ kind: "remove", id });
  }, []);

  const setItemDocumentType = useCallback((id: string, documentType: DocumentType) => {
    dispatch({ kind: "set_document_type", id, documentType });
  }, []);

  const setItemCustomType = useCallback((id: string, customType: string) => {
    dispatch({ kind: "set_custom_type", id, customType });
  }, []);

  const uploadFile = useCallback(
    async (item: UploadQueueItem): Promise<{ ok: boolean; pending: boolean; cancelled: boolean; progressId: string }> => {
      const file = filesByIdRef.current.get(item.id);
      if (!file) {
        // Codex round B0/B1 P2 — this incoherent-state branch (queue item
        // exists but the sidecar File is gone) MUST be visible in the
        // diagnostic. Record `upload_failed` with a synthesised file meta
        // so ops can spot the orphan in the log without DevTools.
        const msg = "Référence fichier introuvable dans la queue";
        dispatch({
          kind: "set_state",
          id: item.id,
          state: "error",
          error: msg,
          errorCategory: "validation",
        });
        instrumentation.record({
          event: "upload_failed",
          ts: Date.now(),
          file: { fileId: item.id, name: item.name, size: item.size, type: item.type, lastModified: item.lastModified },
          error: normaliseUploadError(`validation: ${msg}`),
        });
        onError?.(msg);
        return { ok: false, pending: false, cancelled: false, progressId: "" };
      }
      const fileMeta = buildFileMetaForLog(file, item.id);
      dispatch({ kind: "set_state", id: item.id, state: "uploading" });
      setActiveUploadFileName(file.name);
      const progressId = crypto.randomUUID();
      setActiveUploadProgress(null);
      const startedAt = Date.now();
      instrumentation.record({ event: "upload_started", ts: startedAt, file: fileMeta });

      // Phase B2.3 — register an AbortController so handleCancel can abort
      // the in-flight fetch/blob put for this specific file.
      const abortController = new AbortController();
      uploadAbortRef.current.set(item.id, abortController);
      const cleanupAbort = () => {
        if (uploadAbortRef.current.get(item.id) === abortController) {
          uploadAbortRef.current.delete(item.id);
        }
      };

      try {
        const result = file.size > SERVER_UPLOAD_LIMIT_BYTES
          ? await uploadViaClientBlob(item, file, progressId, abortController.signal)
          : await uploadViaServerRoute(item, file, progressId, abortController.signal);

        // Phase B2.1 — a PDF whose extraction was enqueued durably is NOT
        // done yet — the file stays "extracting" and the multi-poller
        // observes its terminal phase to finally resolve onUploadComplete
        // and decrement batchRef.pending. Each pending extraction owns its
        // own progressId; previous single-state model lost N-1 of them.
        if (result.extraction?.pending) {
          dispatch({ kind: "set_state", id: item.id, state: "extracting" });
          instrumentation.record({
            event: "upload_completed",
            ts: Date.now(),
            durationMs: Date.now() - startedAt,
            file: fileMeta,
          });
          instrumentation.record({ event: "extraction_pending", ts: Date.now(), file: fileMeta });
          // Register this file's progressId + metadata snapshot for the
          // multi-poller orchestrator. Spread merges so two near-simultaneous
          // registrations cannot lose each other.
          setExtractionsPending((prev) => ({
            ...prev,
            [item.id]: {
              progressId,
              itemName: item.name,
              itemSize: item.size,
              itemType: item.type,
              itemLastModified: item.lastModified,
              documentType: item.documentType,
            },
          }));
          // Clear the active-upload progress: the upload phase is done, the
          // next file's upload can take the bar over.
          setActiveUploadProgress(null);
          cleanupAbort();
          return { ok: true, pending: true, cancelled: false, progressId };
        }

        dispatch({ kind: "set_state", id: item.id, state: "completed" });
        instrumentation.record({
          event: "upload_completed",
          ts: Date.now(),
          durationMs: Date.now() - startedAt,
          file: fileMeta,
        });
        onUploadComplete?.({
          ...result.data,
          id: result.data.id,
          name: result.data.name ?? file.name,
          type: result.data.type ?? item.documentType,
        });
        cleanupAbort();
        return { ok: true, pending: false, cancelled: false, progressId };
      } catch (error) {
        cleanupAbort();
        // Phase B2.3 — distinguish user cancel from genuine failure. When
        // handleCancel aborts the controller, the fetch rejects with an
        // AbortError. We surface the file as cancelled (not error) and let
        // the caller call batch.settleCancelled instead of batch.settle(false).
        if (abortController.signal.aborted) {
          dispatch({ kind: "set_state", id: item.id, state: "cancelled" });
          instrumentation.record({
            event: "upload_cancelled",
            ts: Date.now(),
            durationMs: Date.now() - startedAt,
            file: fileMeta,
          });
          return { ok: false, pending: false, cancelled: true, progressId };
        }
        // Phase B2.4 — surface a structured category so the row can render
        // duplicate / auth / blob_transfer etc. distinctly instead of a
        // generic "Upload failed". UploadError carries its own category;
        // anything else gets classified as transport/network/unknown.
        const classification: UploadErrorClassification =
          error instanceof UploadError ? error.toClassification() : classifyTransportError(error);
        dispatch({
          kind: "set_state",
          id: item.id,
          state: "error",
          error: classification.message,
          errorCategory: classification.category,
          errorActionLabel: classification.actionLabel,
          errorActionData: classification.actionData,
        });
        instrumentation.record({
          event: "upload_failed",
          ts: Date.now(),
          durationMs: Date.now() - startedAt,
          file: fileMeta,
          error: normaliseUploadError(`${classification.category}: ${classification.message}`),
        });
        onError?.(classification.message);
        return { ok: false, pending: false, cancelled: false, progressId };
      }

      async function uploadViaServerRoute(
        currentItem: UploadQueueItem,
        currentFile: File,
        currentProgressId: string,
        signal: AbortSignal
      ): Promise<UploadApiResult> {
        const formData = new FormData();
        formData.append("file", currentFile);
        formData.append("dealId", dealId);
        formData.append("type", currentItem.documentType);
        formData.append("progressId", currentProgressId);
        if (currentItem.documentType === "OTHER" && currentItem.customType) {
          formData.append("customType", currentItem.customType);
        }

        const response = await clerkFetch("/api/documents/upload", {
          method: "POST",
          body: formData,
          signal,
        });
        return parseUploadApiResponse(response);
      }

      async function uploadViaClientBlob(
        currentItem: UploadQueueItem,
        currentFile: File,
        currentProgressId: string,
        signal: AbortSignal
      ): Promise<UploadApiResult> {
        applyActiveUploadProgress({
          phase: "started",
          pageCount: 0,
          pagesProcessed: 0,
          percent: 2,
          message: "Chiffrement local du fichier avant transfert",
        });
        const encryptedUpload = await encryptFileForServer(currentFile, signal);
        const pathname = buildTemporaryBlobPathname(dealId);
        const multipart = encryptedUpload.encryptedBlob.size >= 8 * 1024 * 1024;
        const clientPayload = JSON.stringify({
          dealId,
          fileName: currentFile.name,
          mimeType: currentFile.type,
          sizeBytes: currentFile.size,
        });
        const tokenResponse = await clerkFetch("/api/documents/upload/client", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "blob.generate-client-token",
            payload: {
              pathname,
              multipart,
              clientPayload,
            },
          }),
          signal,
        });

        if (!tokenResponse.ok) {
          const tokenBody = await tokenResponse.text();
          if (canFallbackToServerUpload()) {
            applyActiveUploadProgress({
              phase: "started",
              pageCount: 0,
              pagesProcessed: 0,
              percent: 3,
              message: "Upload Blob indisponible en local, fallback serveur",
            });
            return uploadViaServerRoute(currentItem, currentFile, currentProgressId, signal);
          }
          // Phase B2.4.1 P1 — the /api/documents/upload/client route shares
          // the same auth/quota/business gates as the main upload route.
          // A 409 here means "analyse en cours", a 401 means "session
          // expirée", a 429 means "rate limit". We MUST preserve the
          // tokenClassification.category so the UI surfaces the real
          // business cause. Only fall back to `blob_token` when the failure
          // is genuinely about token minting (the classifier returned
          // `unknown`, e.g. a malformed body or unexpected status).
          const tokenClassification = classifyHttpError(tokenResponse.status, tokenBody);
          const effectiveCategory =
            tokenClassification.category === "unknown" ? "blob_token" : tokenClassification.category;
          throw new UploadError(
            effectiveCategory,
            tokenClassification.message || "Impossible d'obtenir le jeton de transfert sécurisé.",
            { actionLabel: tokenClassification.actionLabel, actionData: tokenClassification.actionData }
          );
        }

        const tokenPayload = await tokenResponse.json() as { clientToken?: string };
        if (!tokenPayload.clientToken) {
          throw new UploadError("blob_token", "Réponse de jeton de transfert vide.");
        }

        let blob: Awaited<ReturnType<typeof putBlob>>;
        try {
          blob = await putBlob(
            pathname,
            encryptedUpload.encryptedBlob,
            {
              access: "public",
              token: tokenPayload.clientToken,
              contentType: "application/octet-stream",
              multipart,
              abortSignal: signal,
              onUploadProgress: ({ percentage }) => {
                applyActiveUploadProgress({
                  phase: "started",
                  pageCount: 0,
                  pagesProcessed: 0,
                  percent: Math.max(2, Math.min(35, Math.round(percentage * 0.35))),
                  message: `Transfert sécurisé vers le stockage (${Math.round(percentage)}%)`,
                });
              },
            }
          );
        } catch (transferError) {
          // Phase B2.4 — distinguish blob transfer failures from server
          // errors. AbortError is re-thrown unchanged so the outer catch
          // sees `signal.aborted` and transitions to "cancelled".
          if (transferError instanceof DOMException && transferError.name === "AbortError") {
            throw transferError;
          }
          throw new UploadError(
            "blob_transfer",
            normaliseUploadError(transferError) || "Échec du transfert vers le stockage sécurisé.",
            { cause: transferError }
          );
        }

        applyActiveUploadProgress({
          phase: "started",
          pageCount: 0,
          pagesProcessed: 0,
          percent: 36,
          message: "Transfert terminé, lancement de l'extraction",
        });

        const response = await clerkFetch("/api/documents/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uploadSource: "blob",
            dealId,
            type: currentItem.documentType,
            customType: currentItem.documentType === "OTHER" ? currentItem.customType : null,
            progressId: currentProgressId,
            file: {
              name: currentFile.name,
              type: currentFile.type,
              size: currentFile.size,
              blobUrl: blob.url,
              blobPathname: blob.pathname,
              encryption: {
                algorithm: "AES-256-GCM",
                key: encryptedUpload.keyHex,
                iv: encryptedUpload.ivHex,
              },
            },
          }),
          signal,
        });
        return parseUploadApiResponse(response);
      }
    },
    [dealId, onUploadComplete, onError, applyActiveUploadProgress, instrumentation]
  );

  const handleUploadAll = useCallback(async () => {
    // Phase B1 — only "validated" items are ready to upload. Items still in
    // "selected" / "validating" are racing the validation pipeline; "error"
    // items already failed validation; in-flight uploads are not re-queued.
    const readyItems = queue.filter((item) => item.state === "validated");
    if (readyItems.length === 0) return;

    const invalidItems = readyItems.filter(
      (item) => item.documentType === "OTHER" && !item.customType.trim()
    );
    if (invalidItems.length > 0) {
      onError?.("Précisez le type pour les documents marqués 'Autre'");
      return;
    }

    // Phase B2.1 — controller-managed batch lifecycle. `start()` seeds the
    // pending set with every file; each `settle(fileId, ok)` removes one
    // and increments counts. When the last is settled (sync from the
    // upload step OR async from the poller), the controller fires
    // onAllComplete exactly once via onAllCompleteRef.
    batch.start(readyItems.map((item) => item.id));
    setIsUploading(true);
    setUploadStartedAt(Date.now());
    setElapsedSeconds(0);

    // Phase B2.3.1 — pure helper, unit-tested without React. Enforces the
    // skip-cancelled-before-turn invariant (Codex P1) so a deliberate
    // cancel mid-batch can never be mis-counted as an upload_failed.
    await runBatchUploadLoop(readyItems, {
      batch,
      uploadFile: async (item) => {
        const queueItem = readyItems.find((i) => i.id === item.id)!;
        const result = await uploadFile(queueItem);
        return { ok: result.ok, pending: result.pending, cancelled: result.cancelled };
      },
    });
    // If all files settled synchronously, batch.settle already fired
    // onAllComplete on the last call. Otherwise the multi-poller will.
  }, [queue, uploadFile, onError, batch]);

  /**
   * Phase B2.2 — per-file retry from the "error" state.
   *
   * Preserves the item's metadata snapshot (documentType, customType) and
   * starts a mini-batch with this single fileId. The retry goes through
   * the SAME uploadFile + multi-poller path as the original — a PDF async
   * retry still registers in `extractionsPending`, still fires
   * `onAllComplete` exactly once when its terminal settle happens.
   *
   * Preconditions (gate the UI button identically):
   *   - No batch in flight (isUploading=false). Two parallel batches would
   *     corrupt `batchRef` since the controller assumes one batch at a time.
   *   - No validations in flight. Same reasoning as B0/B1.1 P2 for the main
   *     upload button — we don't fire on a partial validated set.
   *
   * The sidecar File ref must still be present. If it's gone (e.g. the
   * modal was closed and reopened — B3.2 will reconstruct via storage),
   * we surface a clear message instead of silently re-doing nothing.
   */
  const handleRetry = useCallback(
    async (fileId: string) => {
      // Defense in depth (Codex B2.2 P3) — also check inFlightValidationCount
      // here, not only on the UI button. A race between an unhandled drop
      // and a click on retry could otherwise fire on a half-validated set.
      const validatingCount = queue.filter(
        (i) => i.state === "selected" || i.state === "validating"
      ).length;
      if (batch.isInFlight() || isUploading || validatingCount > 0) {
        onError?.("Attendez la fin de l'upload / validation en cours pour réessayer");
        return;
      }
      const item = queue.find((i) => i.id === fileId);
      if (!item || item.state !== "error") return;

      const file = filesByIdRef.current.get(fileId);
      if (!file) {
        const msg = "Fichier non récupérable, sélectionnez-le à nouveau";
        onError?.(msg);
        instrumentation.record({
          event: "upload_failed",
          ts: Date.now(),
          file: { fileId: item.id, name: item.name, size: item.size, type: item.type, lastModified: item.lastModified },
          error: normaliseUploadError(msg),
        });
        return;
      }

      instrumentation.record({
        event: "upload_retry_started",
        ts: Date.now(),
        file: { fileId: item.id, name: item.name, size: item.size, type: item.type, lastModified: item.lastModified },
      });

      // Reset to validated and clear stale error. Validation already passed
      // before the original upload attempt — the error came from network /
      // server / extraction, not from validation.
      dispatch({ kind: "set_state", id: item.id, state: "validated" });

      // Mini-batch with just this file. The controller is single-batch by
      // design; the precondition above guarantees no batch is in flight.
      batch.start([item.id]);
      setIsUploading(true);
      setUploadStartedAt(Date.now());
      setElapsedSeconds(0);

      // Pass a fresh snapshot reflecting state=validated so uploadFile
      // doesn't see a stale "error" item.
      const retryItem: UploadQueueItem = { ...item, state: "validated", error: undefined };
      const { ok, pending, cancelled } = await uploadFile(retryItem);
      if (cancelled) batch.settleCancelled(item.id);
      else if (!pending) batch.settle(item.id, ok);
      // If pending, the per-file poller will settle and fire onAllComplete.
    },
    [batch, isUploading, queue, uploadFile, onError, instrumentation]
  );

  /**
   * Phase B2.3 — per-file cancel.
   *
   * Three cases, depending on the item's current state:
   *   1. Pre-upload (selected | validating | validated | error) →
   *      simply removeFile (queue + sidecar) like the X button always did.
   *   2. Uploading → abort the AbortController; uploadFile's catch detects
   *      `signal.aborted` and transitions the item to "cancelled", which
   *      handleUploadAll / handleRetry maps to batch.settleCancelled.
   *   3. Extracting → the server document already exists. We stop the
   *      poller locally, mark the item "cancelled" client-side, and warn
   *      the user that the server-side extraction may still finish (the
   *      doc will reappear via the Documents tab polling). NO server
   *      delete — that's B3.3 (reprocess/repair routes).
   *
   * Cancelled NEVER blocks onAllComplete — batch.settleCancelled decrements
   * pending without bumping success or error.
   */
  const handleCancel = useCallback(
    (fileId: string) => {
      const item = queue.find((i) => i.id === fileId);
      if (!item) return;
      const fileMeta = {
        fileId: item.id,
        name: item.name,
        size: item.size,
        type: item.type,
        lastModified: item.lastModified,
      };

      // Case 1: pre-upload / terminal-error / terminal-cancelled → simple
      // remove. B4 includes `cancelled` here so the X button on a cancelled
      // row actually cleans it up (was a no-op before — UI bug, not a
      // state-machine bug; the state machine still says cancelled is
      // terminal, this just lets the user dismiss it).
      //
      // Codex B2.3.1 P1 — if a batch is in flight AND this file is still
      // listed in pendingIds (i.e. its upload turn hasn't come yet), we
      // must settle it as cancelled BEFORE removing. Otherwise the
      // handleUploadAll for-loop arrives at this item, calls uploadFile,
      // finds the sidecar File gone, and logs upload_failed + batch.settle
      // (false) — turning a deliberate cancel into a spurious error.
      if (
        item.state === "selected" ||
        item.state === "validating" ||
        item.state === "validated" ||
        item.state === "error" ||
        item.state === "cancelled"
      ) {
        if (batch.isInFlight() && batch.pendingIds().includes(item.id)) {
          instrumentation.record({ event: "upload_cancelled", ts: Date.now(), file: fileMeta });
          dispatch({ kind: "set_state", id: item.id, state: "cancelled" });
          batch.settleCancelled(item.id);
          // The loop skip-check (see handleUploadAll) will short-circuit
          // when it reaches this item, so uploadFile is never invoked.
        }
        removeFile(item.id);
        return;
      }
      // Case 1b: completed → terminal success, X is hidden in the UI so this
      // is defense-in-depth (no row mutation on programmatic re-click).
      if (item.state === "completed") {
        return;
      }

      // Case 2: uploading → abort the in-flight fetch. uploadFile's catch
      // sees signal.aborted, transitions to "cancelled", returns
      // { cancelled: true } → the caller (handleUploadAll/handleRetry)
      // calls batch.settleCancelled.
      if (item.state === "uploading") {
        const controller = uploadAbortRef.current.get(item.id);
        if (controller) controller.abort();
        // State transition + instrumentation happen inside uploadFile's
        // catch block when the abort propagates.
        return;
      }

      // Case 3: extracting (or saved — same handling). The server document
      // exists and the durable Inngest job is running. We stop the local
      // poller, mark the row cancelled, drop pending registrations, and
      // settle the batch as cancelled. We do NOT call any server delete
      // route — that's B3.3.
      if (item.state === "extracting") {
        const cancelPoller = pollersRef.current.get(item.id);
        if (cancelPoller) {
          cancelPoller();
          pollersRef.current.delete(item.id);
        }
        setExtractionsPending((prev) => {
          if (!(item.id in prev)) return prev;
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
        setExtractionProgressByFile((prev) => {
          if (!(item.id in prev)) return prev;
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
        dispatch({ kind: "set_state", id: item.id, state: "cancelled" });
        instrumentation.record({ event: "upload_cancelled", ts: Date.now(), file: fileMeta });
        batch.settleCancelled(item.id);
        onError?.(
          "Annulé localement. L'extraction peut continuer côté serveur — le document réapparaîtra si elle aboutit."
        );
      }
    },
    [batch, instrumentation, onError, queue, removeFile]
  );

  // Phase B1 — derive counts/views from the lightweight queue.
  const readyCount = queue.filter((item) => item.state === "validated").length;
  // Codex round B0/B1 P2 — block upload while items are still being
  // validated. Otherwise the user can fire handleUploadAll on the
  // already-validated subset and the modal can close on partial success
  // while later validations are still running in the pool.
  const inFlightValidationCount = queue.filter(
    (item) => item.state === "selected" || item.state === "validating"
  ).length;
  const uploadingItem = queue.find((item) => item.state === "uploading") ?? null;
  const totalFilesToProcess = queue.filter((item) => item.state !== "error" && item.state !== "cancelled").length || 1;
  const completedFiles = queue.filter((item) => item.state === "completed").length;
  const extractionsPendingCount = Object.keys(extractionsPending).length;
  // B4 — count cancelled rows so the dialog footer can render "X annulés"
  // and the in-queue summary can stay consistent with the global onAllComplete.
  const cancelledCount = queue.filter((item) => item.state === "cancelled").length;
  const erroredCount = queue.filter((item) => item.state === "error").length;
  // B4 — needsReselect count derived once for the banner + footer summary.
  // (Was duplicated below as `needsReselectCount`; consolidated here so
  // both the local renderer and the emitted QueueSummary read the same value.)
  const needsReselectCount = queue.filter((item) => item.needsReselect).length;
  const inFlightUploadCount = queue.filter(
    (item) => item.state === "uploading" || item.state === "extracting"
  ).length;

  /**
   * Phase B2.1 — visible progress. Two phases overlap during a batch:
   *   - At most one upload-in-flight (handleUploadAll runs serially) →
   *     `activeUploadProgress` carries the transfer % and message.
   *   - N pending extractions → `extractionProgressByFile` carries each
   *     poller's snapshot. We surface the MAX % across all in-flight
   *     extractions (most informative single number; per-file UI is
   *     deferred to B4 modal redesign).
   * Active-upload progress takes precedence because it is more granular
   * than the extraction polling cadence.
   */
  const aggregateExtractionPercent = useMemo(() => {
    const values = Object.values(extractionProgressByFile);
    if (values.length === 0) return 0;
    return values.reduce((max, snap) => (snap.percent > max ? snap.percent : max), 0);
  }, [extractionProgressByFile]);
  const visibleProgress = activeUploadProgress ?? null;
  const visibleProgressPercent = useMemo(() => {
    if (visibleProgress) return visibleProgress.percent;
    if (extractionsPendingCount > 0) return aggregateExtractionPercent;
    if (!isUploading) return 0;
    const fileBaseline = (completedFiles / totalFilesToProcess) * 100;
    const perFileCap = 100 / totalFilesToProcess;
    const currentFileExpectedSeconds = Math.max(45, Math.ceil(((uploadingItem?.size ?? 5_000_000) / (1024 * 1024)) * 10));
    const currentFileProgress = Math.min(0.35, elapsedSeconds / currentFileExpectedSeconds * 0.35) * perFileCap;
    return Math.min(95, Math.max(3, Math.round(fileBaseline + currentFileProgress)));
  }, [aggregateExtractionPercent, completedFiles, elapsedSeconds, extractionsPendingCount, isUploading, totalFilesToProcess, uploadingItem?.size, visibleProgress]);

  useEffect(() => {
    if (!isUploading || !uploadStartedAt) return;
    const tick = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - uploadStartedAt) / 1000)));
    };
    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [isUploading, uploadStartedAt]);

  // Phase B2.1 — start a poller for one pending extraction. Returns a cancel
  // function. The poller settles the file on terminal phase (completed |
  // failed): updates queue state, removes from extractionsPending +
  // extractionProgressByFile, records the diagnostic event, fires
  // onUploadComplete (success) or onError (failure), then calls settleFile
  // which may fire onAllComplete if it was the last pending in the batch.
  //
  // Captures the file's metadata at creation time (PendingExtraction
  // snapshot), so two concurrent pollers never read each other's queue
  // entry by mistake.
  const startPoller = useCallback(
    (fileId: string, pending: PendingExtraction): (() => void) => {
      let cancelled = false;
      let timeoutId: number | null = null;
      let attempts = 0;
      const fileMeta = {
        fileId,
        name: pending.itemName,
        size: pending.itemSize,
        type: pending.itemType,
        lastModified: pending.itemLastModified,
      };
      const isPdf = pending.itemType === "application/pdf";

      const settle = (
        phase: "completed" | "failed",
        lastSnapshot: UploadProgressSnapshot | null
      ) => {
        if (cancelled) return;
        cancelled = true;
        if (timeoutId !== null) window.clearTimeout(timeoutId);

        if (phase === "completed") {
          dispatch({ kind: "set_state", id: fileId, state: "completed" });
          instrumentation.record({ event: "extraction_completed", ts: Date.now(), file: fileMeta });
          const sidecarFile = filesByIdRef.current.get(fileId);
          onUploadComplete?.({
            id: lastSnapshot?.documentId ?? fileId,
            name: lastSnapshot?.documentName ?? sidecarFile?.name ?? pending.itemName,
            type: pending.documentType,
            processingStatus: "COMPLETED",
          });
        } else {
          // Phase B2.4 — categorise as extraction (NOT upload) so the UI
          // doesn't conflate post-upload OCR failure with upload failure.
          const extractionFailure = classifyExtractionFailure(lastSnapshot?.message ?? null);
          dispatch({
            kind: "set_state",
            id: fileId,
            state: "error",
            error: extractionFailure.message,
            errorCategory: extractionFailure.category,
            errorActionLabel: extractionFailure.actionLabel,
            errorActionData: extractionFailure.actionData,
          });
          instrumentation.record({
            event: "extraction_failed",
            ts: Date.now(),
            file: fileMeta,
            error: normaliseUploadError(`${extractionFailure.category}: ${extractionFailure.message}`),
          });
          onError?.(extractionFailure.message);
        }

        // Drop the pending registration + per-file progress now that the
        // extraction is terminal. Using delete-via-destructuring so concurrent
        // settlements on different files cannot trample each other.
        setExtractionsPending((prev) => {
          if (!(fileId in prev)) return prev;
          const next = { ...prev };
          delete next[fileId];
          return next;
        });
        setExtractionProgressByFile((prev) => {
          if (!(fileId in prev)) return prev;
          const next = { ...prev };
          delete next[fileId];
          return next;
        });
        // Last step — decrement the batch and potentially fire onAllComplete.
        settleFile(fileId, phase === "completed");
      };

      const poll = async (): Promise<void> => {
        try {
          const response = await clerkFetch(`/api/documents/upload/progress/${pending.progressId}`);
          if (response.ok) {
            const payload = (await response.json()) as { data: UploadProgressSnapshot | null };
            if (!cancelled && payload.data) {
              applyExtractionProgress(fileId, payload.data);
              if (
                payload.data.documentId &&
                !announcedDocumentIdsRef.current.has(payload.data.documentId)
              ) {
                announcedDocumentIdsRef.current.add(payload.data.documentId);
                onUploadQueued?.({
                  id: payload.data.documentId,
                  name: payload.data.documentName ?? pending.itemName,
                  type: pending.documentType,
                  mimeType: pending.itemType || null,
                  processingStatus: "PROCESSING",
                  extractionQuality: null,
                  extractionMetrics: {
                    status: "processing",
                    pageCount: payload.data.pageCount,
                    pagesProcessed: payload.data.pagesProcessed,
                  },
                  extractionWarnings: null,
                  requiresOCR: isPdf,
                  uploadedAt: new Date(),
                });
              }
              if (payload.data.phase === "completed" || payload.data.phase === "failed") {
                settle(payload.data.phase, payload.data);
                return;
              }
            }
          }
        } catch {
          // Network blip — retry on the next tick. We don't settle on transient
          // errors; only the server's terminal phase decides.
        }
        if (!cancelled) {
          attempts += 1;
          const delayMs = attempts < 10 ? 2_000 : attempts < 30 ? 4_000 : 7_000;
          timeoutId = window.setTimeout(() => {
            void poll();
          }, delayMs);
        }
      };

      void poll();

      return () => {
        cancelled = true;
        if (timeoutId !== null) window.clearTimeout(timeoutId);
      };
    },
    [applyExtractionProgress, instrumentation, onUploadComplete, onUploadQueued, onError, settleFile]
  );

  // Phase B2.1 — multi-poller orchestrator. Reconciles `extractionsPending`
  // (state) with `pollersRef` (long-lived ref) on every change: starts
  // pollers for newly-registered files, stops pollers for files that just
  // settled (and have been removed from extractionsPending). Existing
  // pollers are NEVER cancelled by a re-render — the cleanup-on-unmount
  // effect below handles teardown.
  useEffect(() => {
    const current = pollersRef.current;
    const wanted = new Set(Object.keys(extractionsPending));

    // Stop pollers that no longer have a pending entry.
    for (const [fileId, cancel] of Array.from(current.entries())) {
      if (!wanted.has(fileId)) {
        cancel();
        current.delete(fileId);
      }
    }

    // Start pollers for newly-registered pending extractions.
    for (const [fileId, pending] of Object.entries(extractionsPending)) {
      if (!current.has(fileId)) {
        current.set(fileId, startPoller(fileId, pending));
      }
    }
  }, [extractionsPending, startPoller]);

  // Cancel all pollers on unmount. Separate effect with empty deps so the
  // cleanup does NOT fire on every extractionsPending change.
  useEffect(() => {
    const current = pollersRef.current;
    return () => {
      for (const cancel of current.values()) cancel();
      current.clear();
    };
  }, []);

  // B4 — emit a fresh queue snapshot to the dialog on every change.
  // Memoised so the effect below only fires when a counter actually moves
  // (cheap derivation, but the dialog re-renders downstream so we don't
  // want this firing on every keystroke / tick).
  const queueSummary = useMemo<QueueSummary>(
    () => ({
      total: queue.length,
      completedCount: completedFiles,
      errorCount: erroredCount,
      cancelledCount,
      inFlightCount: inFlightUploadCount,
      validatingCount: inFlightValidationCount,
      readyCount,
      needsReselectCount,
    }),
    [
      queue.length,
      completedFiles,
      erroredCount,
      cancelledCount,
      inFlightUploadCount,
      inFlightValidationCount,
      readyCount,
      needsReselectCount,
    ]
  );
  // Avoid stale closure on the caller's handler without retriggering
  // the emit effect when the function identity rotates.
  const onQueueSummaryChangeRef = useRef<typeof onQueueSummaryChange>(onQueueSummaryChange);
  useEffect(() => {
    onQueueSummaryChangeRef.current = onQueueSummaryChange;
  }, [onQueueSummaryChange]);
  useEffect(() => {
    onQueueSummaryChangeRef.current?.(queueSummary);
  }, [queueSummary]);

  return (
    <div className="relative space-y-3">
      {/* Dropzone - compact */}
      <div
        {...getRootProps()}
        className={cn(
          "cursor-pointer rounded-lg border-2 border-dashed p-4 text-center transition-colors",
          isDragActive && "border-primary bg-primary/5",
          !isDragActive && "border-muted-foreground/25 hover:border-primary/50",
          (disabled || isUploading) && "cursor-not-allowed opacity-50"
        )}
      >
        <input {...getInputProps()} />
        <div className="flex items-center justify-center gap-3">
          <Upload className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm">
            {isDragActive ? "Déposez ici" : "Glissez vos documents ou cliquez"}
          </span>
          <span className="text-xs text-muted-foreground">PDF, Excel, PPT, Images</span>
        </div>
      </div>

      {/* Phase B3.2 — hidden file input used by the per-row "Re-sélectionner"
          button on items restored from a previous session. We share a
          single <input> across all rows; reselectTargetIdRef tracks which
          row triggered the click. */}
      <input
        ref={reselectInputRef}
        type="file"
        accept={Object.values(ACCEPTED_TYPES).flat().join(",")}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          const targetId = reselectTargetIdRef.current;
          reselectTargetIdRef.current = null;
          event.target.value = "";
          if (!file || !targetId) return;
          handleReselectAttach(targetId, file);
        }}
      />

      {/* Phase B3.2 — banner pour items à re-sélectionner après refresh. */}
      {needsReselectCount > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {needsReselectCount} fichier{needsReselectCount > 1 ? "s" : ""} de la session précédente :
          re-sélectionnez-{needsReselectCount > 1 ? "les" : "le"} pour continuer.
        </div>
      )}

      {/* B4 — compact summary line, only shown when the queue gets dense
          (≥4 files) so a 1–3-file modal stays minimal. Pure derivation
          from queueSummary (memoised) — keeps the row list and the line
          in lockstep with no chance of drift. */}
      {queue.length >= 4 && (
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-muted bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
          aria-label="Résumé de la file d'upload"
        >
          <span className="font-medium text-foreground">
            {queueSummary.total} fichier{queueSummary.total > 1 ? "s" : ""}
          </span>
          {queueSummary.readyCount > 0 && (
            <span>{queueSummary.readyCount} prêt{queueSummary.readyCount > 1 ? "s" : ""}</span>
          )}
          {queueSummary.validatingCount > 0 && (
            <span>{queueSummary.validatingCount} en validation</span>
          )}
          {queueSummary.inFlightCount > 0 && (
            <span className="text-blue-700">{queueSummary.inFlightCount} en cours</span>
          )}
          {queueSummary.completedCount > 0 && (
            <span className="text-green-700">{queueSummary.completedCount} terminé{queueSummary.completedCount > 1 ? "s" : ""}</span>
          )}
          {queueSummary.errorCount > 0 && (
            <span className="text-red-700">{queueSummary.errorCount} en échec</span>
          )}
          {queueSummary.cancelledCount > 0 && (
            <span>{queueSummary.cancelledCount} annulé{queueSummary.cancelledCount > 1 ? "s" : ""}</span>
          )}
          {queueSummary.needsReselectCount > 0 && (
            <span className="text-amber-700">{queueSummary.needsReselectCount} à re-sélectionner</span>
          )}
        </div>
      )}

      {/* B4 — file list. Bounded height with internal scroll so a queue of
          6+ files never pushes the upload action button off-screen on
          laptop. The footer (dialog) + the upload action below stay
          stable; only this inner list scrolls. */}
      {queue.length > 0 && (
        <div
          className={cn(
            "space-y-2",
            // Internal scroll once the list is long enough to need it.
            // Threshold is generous so a typical 2–3-file modal looks the
            // same as before.
            queue.length >= 4 && "max-h-[40vh] overflow-y-auto pr-1"
          )}
        >
          {queue.map((item) => {
            const FileIcon = getFileIcon(item.type);
            const isEditable = item.state === "selected" || item.state === "validating" || item.state === "validated";
            // B4 — per-row progress: surfaces the actual progress of the
            // currently-uploading file and each pending extraction inline,
            // so the user sees WHICH file is moving (not just an aggregate).
            const rowUploadProgress =
              item.state === "uploading" ? activeUploadProgress : null;
            const rowExtractionProgress =
              item.state === "extracting" ? extractionProgressByFile[item.id] ?? null : null;
            const rowProgress = rowUploadProgress ?? rowExtractionProgress;

            return (
              <div key={item.id} className="space-y-1">
                {/* Main row */}
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2",
                    item.state === "completed" && "border-green-300 bg-green-50",
                    item.state === "error" && "border-red-300 bg-red-50",
                    (item.state === "uploading" || item.state === "extracting") &&
                      "border-blue-300 bg-blue-50",
                    item.state === "validating" && "border-amber-200 bg-amber-50/50",
                    // B4 — cancelled gets its own muted slate styling so
                    // the user immediately sees it's neither a success nor
                    // a failure (distinct from error red).
                    item.state === "cancelled" && "border-slate-300 bg-slate-50 opacity-80",
                    // B3.2 — visually mark items restored from a previous
                    // session as muted until the user re-attaches the File.
                    item.needsReselect && "border-amber-300 bg-amber-50/40 opacity-70"
                  )}
                >
                  {/* Status icon */}
                  {item.state === "uploading" || item.state === "extracting" ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" />
                  ) : item.state === "validating" ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-600" />
                  ) : item.state === "completed" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                  ) : item.state === "error" ? (
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                  ) : item.state === "cancelled" ? (
                    <Ban className="h-4 w-4 shrink-0 text-slate-500" />
                  ) : (
                    <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}

                  {/* Filename */}
                  <span className="flex-1 truncate text-sm" title={item.name}>
                    {item.name}
                  </span>

                  {/* Size */}
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatFileSize(item.size)}
                  </span>

                  {/* Type selector (only when editable) */}
                  {isEditable && (
                    <Select
                      value={item.documentType}
                      onValueChange={(value: DocumentType) => setItemDocumentType(item.id, value)}
                    >
                      <SelectTrigger className="h-7 w-[140px] shrink-0 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value} className="text-xs">
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* Type label (when not editable) */}
                  {!isEditable && (
                    <span className="shrink-0 text-xs font-medium">
                      {DOCUMENT_TYPES.find((t) => t.value === item.documentType)?.label}
                    </span>
                  )}

                  {/* Phase B3.2 — re-selection button for items restored
                      from a previous session (page refresh / tab close).
                      Opens the hidden input via reselectTargetIdRef. */}
                  {item.needsReselect && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 shrink-0 gap-1 text-xs"
                      title="Re-sélectionner le fichier"
                      aria-label={`Re-sélectionner le fichier ${item.name}`}
                      onClick={() => triggerReselectFor(item.id)}
                    >
                      <Upload className="h-3 w-3" />
                      Re-sélectionner
                    </Button>
                  )}

                  {/* Phase B2.2 — Retry button on error items. Gated on the
                      same preconditions as handleRetry itself so the UI
                      never invites an action that would no-op. Disabled when
                      the item still needs a re-attached File (B3.2). */}
                  {item.state === "error" && !item.needsReselect && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      title="Réessayer"
                      aria-label={`Réessayer l'upload de ${item.name}`}
                      disabled={isUploading || inFlightValidationCount > 0}
                      onClick={() => {
                        void handleRetry(item.id);
                      }}
                    >
                      <RotateCw className="h-3 w-3" />
                    </Button>
                  )}

                  {/* Phase B2.3 — X button does triple duty:
                      - Pre-upload / error → removes from queue.
                      - Uploading / extracting → cancels the in-flight
                        operation via AbortController or poller cancel.
                      - B4 — cancelled → also removable so the user can
                        clean up the row once they're done acknowledging it
                        (handleCancel Case 1 now includes "cancelled" → removeFile).
                      - Completed → not shown (terminal success; user keeps
                        the green row as confirmation). */}
                  {(isEditable ||
                    item.state === "error" ||
                    item.state === "uploading" ||
                    item.state === "extracting" ||
                    item.state === "cancelled") && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      title={
                        item.state === "uploading" || item.state === "extracting"
                          ? "Annuler"
                          : "Retirer"
                      }
                      aria-label={
                        item.state === "uploading" || item.state === "extracting"
                          ? `Annuler l'upload de ${item.name}`
                          : `Retirer ${item.name} de la file`
                      }
                      onClick={() => handleCancel(item.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>

                {/* B4 — per-row progress bar. Shown for the file currently
                    transferring (uploading) and for each pending extraction
                    (extracting). Replaces the single global "biggest bar"
                    aggregate so the user can see WHICH file moves. The
                    aggregate progress card below is still rendered as a
                    backup summary while isUploading. */}
                {rowProgress && (
                  <div className="ml-6 space-y-0.5">
                    <Progress value={rowProgress.percent} className="h-1" />
                    {rowProgress.message && (
                      <p
                        className="truncate text-[10px] text-muted-foreground"
                        title={rowProgress.message}
                      >
                        {rowProgress.message}
                      </p>
                    )}
                  </div>
                )}

                {/* B4 — cancelled cue inline. The slate styling above is
                    visual; this is the textual explanation so the user knows
                    the local cancel doesn't guarantee the server stopped (the
                    onError toast already says this — repeating it inline
                    keeps the cue visible after the toast fades). */}
                {item.state === "cancelled" && (
                  <p className="ml-6 text-[11px] text-slate-600">
                    Annulé localement.{" "}
                    <span className="text-muted-foreground">
                      L&apos;extraction peut continuer côté serveur si elle a déjà démarré.
                    </span>
                  </p>
                )}

                {/* Custom type input (only for OTHER) */}
                {isEditable && item.documentType === "OTHER" && (
                  <Input
                    placeholder="Précisez le type de document..."
                    value={item.customType}
                    onChange={(e) => setItemCustomType(item.id, e.target.value)}
                    className="h-8 ml-6 text-sm"
                  />
                )}

                {/* Phase B2.4 — Error message + category badge + action.
                    Duplicate gets its own tier (amber, distinct from generic
                    red errors); blocked/auth/payload_size also stand out. */}
                {item.state === "error" && item.error && (
                  <div className="ml-6 space-y-1 text-xs">
                    <div className="flex flex-wrap items-center gap-1">
                      {item.errorCategory && (
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                            item.errorCategory === "duplicate" && "bg-amber-100 text-amber-800",
                            item.errorCategory === "blocked" && "bg-amber-100 text-amber-800",
                            item.errorCategory === "auth" && "bg-orange-100 text-orange-800",
                            item.errorCategory === "payload_size" && "bg-orange-100 text-orange-800",
                            item.errorCategory === "network" && "bg-orange-100 text-orange-800",
                            item.errorCategory === "extraction" && "bg-red-100 text-red-800",
                            item.errorCategory === "server" && "bg-red-100 text-red-800",
                            (!item.errorCategory ||
                              item.errorCategory === "unknown" ||
                              item.errorCategory === "validation" ||
                              item.errorCategory === "invalid_type" ||
                              item.errorCategory === "invalid_signature" ||
                              item.errorCategory === "blob_token" ||
                              item.errorCategory === "blob_transfer") &&
                              "bg-red-100 text-red-800"
                          )}
                        >
                          {item.errorCategory.replace(/_/g, " ")}
                        </span>
                      )}
                      <span className="text-red-700">{item.error}</span>
                    </div>
                    {item.errorActionLabel && (
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>Action conseillée :</span>
                        {/* Phase B2.4.1 P2 — render a real button when the
                            classifier emitted actionData the parent knows
                            how to handle. Today we wire the duplicate flow
                            (view_existing_document); other action kinds
                            fall back to the plain label so the cue is at
                            least visible. */}
                        {(() => {
                          const actionData = item.errorActionData as
                            | { kind: "view_existing_document"; documentId: string; documentName: string }
                            | undefined;
                          if (
                            actionData?.kind === "view_existing_document" &&
                            onViewExistingDocument
                          ) {
                            return (
                              <Button
                                type="button"
                                variant="link"
                                size="sm"
                                className="h-auto p-0 text-[11px] font-medium"
                                onClick={() => {
                                  onViewExistingDocument({
                                    documentId: actionData.documentId,
                                    documentName: actionData.documentName,
                                  });
                                }}
                              >
                                {item.errorActionLabel}
                              </Button>
                            );
                          }
                          return <span className="font-medium">{item.errorActionLabel}</span>;
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Upload button */}
      {readyCount > 0 && (
        <Button
          type="button"
          onClick={handleUploadAll}
          // Codex round B0/B1 P2 — block while validations are in flight so
          // we never fire on a partial validated set and close on partial
          // success.
          disabled={isUploading || inFlightValidationCount > 0}
          className="w-full"
        >
          {isUploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Upload en cours...
            </>
          ) : inFlightValidationCount > 0 ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Validation en cours ({inFlightValidationCount}{readyCount > 0 ? ` restant${inFlightValidationCount > 1 ? "s" : ""}` : ""})
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Uploader {readyCount > 1 ? `${readyCount} documents` : "le document"}
            </>
          )}
        </Button>
      )}

      {/* B4 — the diagnostic-copy button has moved to the dialog's
          sticky footer so it stays accessible (and discreet) regardless of
          how far the queue list scrolls. The B0/B1 P1 contract is
          preserved by the dialog: the button is always rendered, never
          gated on queue.length, so a user with an all-rejected picker can
          still ship the diagnostic chain. The instrumentation log itself
          remains owned by the dialog (props.instrumentation), so this is
          a pure relocation — no behavioural change. */}

      {isUploading && (
        <div className="rounded-lg border bg-background p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {extractionsPendingCount > 1
                  ? `${extractionsPendingCount} extractions documentaires en cours`
                  : "Extraction documentaire en cours"}
              </p>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {activeUploadFileName ?? uploadingItem?.name ?? "Document"} - OCR et analyse visuelle des pages.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {visibleProgress?.pageCount
                  ? `${visibleProgress.pagesProcessed}/${visibleProgress.pageCount} pages traitées`
                  : "Préparation de l'extraction"}{" "}
                - Temps écoulé: {formatElapsed(elapsedSeconds)}
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{visibleProgress ? "Progression backend" : extractionsPendingCount > 0 ? `Progression extraction (${extractionsPendingCount} fichier${extractionsPendingCount > 1 ? "s" : ""})` : "Progression estimée"}</span>
              <span>{visibleProgressPercent}%</span>
            </div>
            <Progress value={visibleProgressPercent} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {visibleProgress?.message ?? "Les pages complexes peuvent prendre plus longtemps: graphiques, tableaux, OCR haute fidélité."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
});

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
