/**
 * Classifie STRICTEMENT un message d'erreur comme panne INFRA transitoire
 * (externe au code) : rate-limit, timeout, 5xx provider, réponse vide.
 *
 * Usage : la garde de phase Tier 1 de l'orchestrateur l'emploie pour décider de
 * CONTINUER un Deep Dive en mode dégradé au lieu d'avorter sur l'échec du seul
 * agent critique de Phase A. Comme un faux positif MASQUERAIT un vrai défaut
 * d'analyse, la détection est volontairement STRICTE : on ne matche un code HTTP
 * (429/5xx) que dans un contexte de statut explicite (`HTTP 500`, `status 503`,
 * `500 Internal Server Error`…), jamais un nombre nu (`score 500 out of range`,
 * `500 employees`). Ce N'EST PAS le classifieur du retry routeur (lui reste
 * volontairement plus laxiste : sur-rejouer est inoffensif, masquer ne l'est pas).
 */

// Marqueurs en clair, non confondables avec du contenu métier.
const TRANSIENT_PHRASE_MARKERS = [
  "rate limit",
  "too many requests",
  "timeout",
  "timed out",
  "service unavailable",
  "internal server error",
  "bad gateway",
  "gateway timeout",
  "empty_response", // réponse vide (0 caractère) — surcharge transitoire du provider
] as const;

// Code HTTP UNIQUEMENT dans un contexte de statut explicite (préfixe http/status/
// code/error, OU suivi d'une raison de statut connue) — évite de matcher un nombre nu.
const HTTP_STATUS_RE =
  /\b(?:http|status|code|err(?:or)?)\s*[:#=]?\s*(?:429|500|502|503|504)\b|\b(?:429|500|502|503|504)\s+(?:too many requests|internal server error|service unavailable|bad gateway|gateway timeout)\b/i;

export function isTransientInfraErrorMessage(
  message: string | null | undefined
): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  if (TRANSIENT_PHRASE_MARKERS.some((marker) => lower.includes(marker))) {
    return true;
  }
  return HTTP_STATUS_RE.test(message);
}
