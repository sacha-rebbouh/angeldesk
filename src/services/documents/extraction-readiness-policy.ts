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

/**
 * Une page est toxique uniquement si son state est explicitement dans la liste
 * des rejets. Les pages sans verification.state (extraction native pure,
 * artefacts legacy pre-V3) ne sont PAS bloquees - sinon on casse les documents
 * qui n'ont jamais eu d'OCR et n'ont pas besoin de verification.
 */
export function isPageArtifactToxic(artifact: unknown): boolean {
  const state = readPageVerificationState(artifact);
  if (state === null) {
    return false;
  }
  return REJECTED_EXTRACTION_STATES.has(state);
}
