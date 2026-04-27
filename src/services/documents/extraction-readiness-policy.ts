/**
 * Politique de readiness extraction - source de verite des etats fiables / toxiques.
 * Ne doit dependre d'AUCUN autre module interne pour eviter les cycles.
 * Importee a la fois par extraction-runs.ts (extension de evaluateDealDocumentReadiness)
 * et par readiness-gate.ts (helpers runtime pour les routes API).
 */

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
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    return null;
  }
  const verification = (artifact as { verification?: unknown }).verification;
  if (!verification || typeof verification !== "object" || Array.isArray(verification)) {
    return null;
  }
  const state = (verification as { state?: unknown }).state;
  return typeof state === "string" ? state : null;
}

function readVerificationEvidence(artifact: unknown): string[] {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    return [];
  }
  const verification = (artifact as { verification?: unknown }).verification;
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
