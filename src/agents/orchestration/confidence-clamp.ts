/**
 * Clamp robuste du `confidenceLevel` d'un meta d'agent (borné 0-100) + flag `confidenceIsFallback`.
 *
 * Remplace le pattern dupliqué dans ~13 agents : `data.meta?.confidenceLevel == null` ne capturait
 * QUE null/undefined. Une valeur NON-NUMÉRIQUE (string, objet) ou un nombre NON-FINI (NaN/Infinity)
 * passait alors à `Math.max(0, x)` qui la coerçait en **NaN** → confidenceLevel=NaN, propagé dans
 * les scores de findings downstream ET (post-mortem Avekapeti) crash du snapshot stepwise durable
 * (`buildStepState` rejette les non-finis → run FAILED, Tier 3 sauté).
 *
 * Ici : SEUL un nombre FINI est une confidence valide ; tout le reste (null/undefined/string/objet/
 * NaN/Infinity) → fallback 0 + `confidenceIsFallback: true`. Aucune coercion silencieuse possible.
 */
export function clampConfidenceLevel(
  raw: unknown
): { confidenceLevel: number; confidenceIsFallback: boolean } {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return { confidenceLevel: 0, confidenceIsFallback: true };
  }
  return { confidenceLevel: Math.min(100, Math.max(0, raw)), confidenceIsFallback: false };
}
