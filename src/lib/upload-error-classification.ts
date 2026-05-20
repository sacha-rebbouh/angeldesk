/**
 * Phase B2.4 — Upload error classification.
 *
 * Turns a raw HTTP failure, transport error, or extraction-progress
 * snapshot into a structured `{ category, message, action? }` so the UI
 * can surface an actionable error instead of "Upload failed".
 *
 * Categories are kept stable for diagnostics (the instrumentation log
 * carries the normalised error message; ops correlate by category).
 *
 * Pure module — no React, no fetch, no globals.
 */

import { normaliseUploadError } from "./upload-instrumentation";

export type UploadErrorCategory =
  /** Pre-upload local validation (size, MIME, etc.). */
  | "validation"
  /** 401/403 — session expired or caller not authorised. */
  | "auth"
  /** 409 same-deal content-hash duplicate. Carries `existingDocument`. */
  | "duplicate"
  /** 409 — operation blocked by an in-progress analysis / thesis review. */
  | "blocked"
  /** 429 — rate-limited. */
  | "rate_limit"
  /** 413 / FUNCTION_PAYLOAD_TOO_LARGE — over Vercel's 4.5MB. */
  | "payload_size"
  /** 400 — disallowed MIME type. */
  | "invalid_type"
  /** 400 — magic-bytes signature mismatch. */
  | "invalid_signature"
  /** Client blob token mint failure (pre-transfer). */
  | "blob_token"
  /** Client blob put failure (transfer phase). */
  | "blob_transfer"
  /** 5xx — generic server error. */
  | "server"
  /** Durable extraction terminated in `failed` phase. */
  | "extraction"
  /** Network / fetch transport (no HTTP response received). */
  | "network"
  /** Fallback — should be rare; ops should look at the raw error. */
  | "unknown";

export interface UploadErrorClassification {
  category: UploadErrorCategory;
  /** Short French message safe to render in the row error slot. */
  message: string;
  /**
   * Optional actionable cue surfaced next to the message. Empty string
   * means no action. The component decides how to wire the action onClick
   * (typically: dismiss, view existing doc, etc.).
   */
  actionLabel?: string;
  /**
   * Structured payload propagated for actions that need it (e.g. duplicate
   * → existingDocument link). Shape is intentionally narrow — never
   * propagate raw server bodies to the UI.
   */
  actionData?: { kind: "view_existing_document"; documentId: string; documentName: string };
}

/**
 * Custom error class thrown by the upload helpers when they want to attach
 * a category to the failure. uploadFile's catch reads `category` directly
 * if the error is an UploadError, otherwise calls classifyTransportError.
 */
export class UploadError extends Error {
  readonly category: UploadErrorCategory;
  readonly actionLabel?: string;
  readonly actionData?: UploadErrorClassification["actionData"];

  constructor(
    category: UploadErrorCategory,
    message: string,
    options: { actionLabel?: string; actionData?: UploadErrorClassification["actionData"]; cause?: unknown } = {}
  ) {
    super(message);
    this.name = "UploadError";
    this.category = category;
    this.actionLabel = options.actionLabel;
    this.actionData = options.actionData;
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }

  toClassification(): UploadErrorClassification {
    return {
      category: this.category,
      message: this.message,
      actionLabel: this.actionLabel,
      actionData: this.actionData,
    };
  }
}

interface HttpFailureBody {
  error?: string;
  /** Server F63 duplicate payload. */
  existingDocument?: { id?: string; name?: string };
  /** Server analysis-in-progress payload. */
  pendingAnalysisId?: string;
}

/**
 * Classify a non-OK HTTP response from the upload route. `responseText` is
 * the raw body the caller has already read (we don't read it again to
 * avoid the "body already used" pitfall).
 */
export function classifyHttpError(
  status: number,
  rawBody: string
): UploadErrorClassification {
  // Vercel surfaces this distinctly when the body bypasses the 4.5 MB cap.
  if (rawBody.includes("FUNCTION_PAYLOAD_TOO_LARGE")) {
    return {
      category: "payload_size",
      message: "Fichier trop volumineux pour cet upload direct (limite 4,5 MB).",
      actionLabel: "Réessayer avec upload sécurisé",
    };
  }

  let body: HttpFailureBody | null = null;
  try {
    body = JSON.parse(rawBody) as HttpFailureBody;
  } catch {
    body = null;
  }
  const serverMessage = body?.error?.trim() ?? "";

  if (status === 401 || status === 403) {
    return {
      category: "auth",
      message: serverMessage || "Session expirée. Rechargez la page et réessayez.",
    };
  }

  if (status === 409) {
    if (body?.existingDocument?.id && body.existingDocument.name) {
      return {
        category: "duplicate",
        message: "Document identique déjà présent dans ce deal.",
        actionLabel: "Voir le document existant",
        actionData: {
          kind: "view_existing_document",
          documentId: body.existingDocument.id,
          documentName: body.existingDocument.name,
        },
      };
    }
    if (body?.pendingAnalysisId) {
      return {
        category: "blocked",
        message: serverMessage || "Une analyse est en cours sur ce deal. Attendez sa fin pour modifier le corpus.",
      };
    }
    return { category: "blocked", message: serverMessage || "Conflit (409)." };
  }

  if (status === 413) {
    return {
      category: "payload_size",
      message: serverMessage || "Fichier trop volumineux (limite serveur).",
    };
  }

  if (status === 429) {
    return {
      category: "rate_limit",
      message: serverMessage || "Trop d'uploads d'affilée. Patientez quelques secondes.",
    };
  }

  if (status === 400) {
    if (/signature/i.test(serverMessage)) {
      return {
        category: "invalid_signature",
        message: serverMessage || "Signature du fichier invalide.",
      };
    }
    if (/(file type|mime)/i.test(serverMessage)) {
      return {
        category: "invalid_type",
        message: serverMessage || "Type de fichier non autorisé.",
      };
    }
    return { category: "validation", message: serverMessage || "Requête invalide (400)." };
  }

  if (status >= 500) {
    return {
      category: "server",
      message: serverMessage || `Erreur serveur (${status}). Réessayez dans un instant.`,
    };
  }

  return { category: "unknown", message: serverMessage || `Échec HTTP ${status}.` };
}

/**
 * Classify a raw transport error (fetch threw, no HTTP response). Anything
 * that isn't an `AbortError` (handled separately as cancellation) ends up
 * here. Most browsers report DNS / offline / TLS as `TypeError: Failed to fetch`.
 */
export function classifyTransportError(error: unknown): UploadErrorClassification {
  if (error instanceof UploadError) return error.toClassification();
  const msg = normaliseUploadError(error);
  if (/Failed to fetch|NetworkError|ERR_NETWORK|ENOTFOUND|ECONNREFUSED|offline/i.test(msg)) {
    return { category: "network", message: "Connexion réseau interrompue. Vérifiez votre connexion et réessayez." };
  }
  return { category: "unknown", message: msg };
}

/**
 * Classify the extraction poller's failure snapshot. The server's progress
 * snapshot only carries a free-form `message`; we keep it as-is but tag
 * the category so the UI knows this is an extraction (post-upload) failure,
 * not an upload failure.
 */
export function classifyExtractionFailure(message: string | null | undefined): UploadErrorClassification {
  const trimmed = (message ?? "").trim();
  return {
    category: "extraction",
    message: trimmed || "L'extraction du document a échoué côté serveur.",
    actionLabel: "Réessayer",
  };
}
