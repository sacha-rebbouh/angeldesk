/**
 * Politique de readiness extraction - source de verite des etats fiables / toxiques.
 * Ne doit dependre d'AUCUN autre module interne SAUF `@/lib/encryption` (leaf
 * utility, zero internal deps, no cycle possible).
 * Importee a la fois par extraction-runs.ts (extension de evaluateDealDocumentReadiness)
 * et par readiness-gate.ts (helpers runtime pour les routes API).
 *
 * Phase 3 (Privacy DB): `artifact` is now stored encrypted as an envelope
 * `{ _enc: "ad1", data, v: 1 }`. The readers in this module accept BOTH the
 * envelope and legacy plaintext objects so callers never have to remember
 * to decrypt before passing a stored row in. Without this, the toxic gate
 * fail-open silently (state→null on the envelope, "parse_failed" never
 * detected) and bypasses UNVERIFIED_ARTIFACT.
 */

import { isEncryptedJsonField, safeDecryptJsonField, tryDecryptJsonField } from "@/lib/encryption";

export const VERIFIED_EXTRACTION_STATES: ReadonlySet<string> = new Set([
  "provider_structured",
  "cross_validated",
  "cross_validated_3p",
]);

export const REJECTED_EXTRACTION_STATES: ReadonlySet<string> = new Set([
  "heuristic_fallback",
  "unverified",
  "parse_failed",
]);

export function isExtractionStrictReadinessEnabled(): boolean {
  return process.env.EXTRACTION_STRICT_READINESS !== "false";
}

/**
 * Lit artifact.verification.state de facon typee, sans cast as any.
 * Retourne null si l'artefact n'a jamais recu de verification object
 * (cas des pages purement natives ou pre-V3).
 */
export function readPageVerificationState(artifact: unknown): string | null {
  const decrypted = safeDecryptJsonField(artifact);
  if (!decrypted || typeof decrypted !== "object" || Array.isArray(decrypted)) {
    return null;
  }
  const verification = (decrypted as { verification?: unknown }).verification;
  if (!verification || typeof verification !== "object" || Array.isArray(verification)) {
    return null;
  }
  const state = (verification as { state?: unknown }).state;
  return typeof state === "string" ? state : null;
}

function readVerificationEvidence(artifact: unknown): string[] {
  const decrypted = safeDecryptJsonField(artifact);
  if (!decrypted || typeof decrypted !== "object" || Array.isArray(decrypted)) {
    return [];
  }
  const verification = (decrypted as { verification?: unknown }).verification;
  if (!verification || typeof verification !== "object" || Array.isArray(verification)) {
    return [];
  }
  const evidence = (verification as { evidence?: unknown }).evidence;
  return Array.isArray(evidence)
    ? evidence.filter((item): item is string => typeof item === "string")
    : [];
}

function isReadyPageStatus(status: string | null | undefined): boolean {
  return status === "READY" || status === "READY_WITH_WARNINGS";
}

/**
 * Une page est toxique uniquement si son state est explicitement dans la liste
 * des rejets ET qu'il s'agit d'un vrai signal de corruption.
 *
 * Important: le pipeline actuel annote aussi les pages natives et certains OCR
 * texte en "unverified" meme quand la page est READY. Les bloquer rend le gate
 * inutilisable. On garde donc le fail-closed pour parse_failed et pour les
 * fallbacks de schema structure qui retombent en legacy_text_fallback, mais on
 * laisse les pages READY / READY_WITH_WARNINGS sans preuve de fallback casse.
 */
export function isPageArtifactToxic(
  artifact: unknown,
  pageStatus?: string | null
): boolean {
  // Fail-closed on a corrupted Phase-3 envelope. If the row carries an
  // envelope marker but the ciphertext does not decrypt (key rotation, DB
  // tampering, truncation), we MUST NOT treat it as "no artifact" — that
  // would let the toxic gate bypass UNVERIFIED_ARTIFACT for an unreadable
  // page. Legacy plaintext rows and genuinely absent artifacts are
  // unaffected by this branch.
  if (isEncryptedJsonField(artifact)) {
    const decryption = tryDecryptJsonField(artifact);
    if (decryption.kind === "corrupted") {
      return true;
    }
  }

  const state = readPageVerificationState(artifact);
  if (state === null) {
    return false;
  }
  if (!REJECTED_EXTRACTION_STATES.has(state)) {
    return false;
  }
  if (state === "parse_failed") {
    return true;
  }

  const evidence = readVerificationEvidence(artifact);
  if (state === "heuristic_fallback" && evidence.includes("legacy_text_fallback")) {
    return true;
  }

  // Backward-compatible strict behavior for callers that cannot provide page
  // status. Runtime gates pass status and use the more precise rule above.
  if (pageStatus === undefined) {
    return true;
  }

  return !isReadyPageStatus(pageStatus);
}
