// Erreur typée « session Clerk expirée / invalide » pour distinguer ce cas d'une erreur réseau
// générique. Quand le JWT de session expire (~60 s) et que le refresh échoue, le middleware
// Clerk (`auth.protect()`, src/proxy.ts) réécrit les appels API protégés en 404 « signed-out ».
// Un poll qui avale ce 404 comme erreur générique fige l'UI sur la dernière valeur connue.

export class AuthExpiredError extends Error {
  constructor(message = "Session expirée") {
    super(message);
    this.name = "AuthExpiredError";
  }
}

/**
 * `true` si la réponse signifie que la session Clerk est expirée/déconnectée.
 *
 * - `401`/`403` : clair.
 * - `404` : UNIQUEMENT s'il porte un signal Clerk (`auth.protect()` réécrit en `/404` quand
 *   signed-out). Un `404` nu reste une **vraie** 404 — `x-matched-path: /404` seul ne suffit PAS
 *   (une route inexistante le porte aussi), il faut un en-tête `x-clerk-auth-*`.
 */
export function isAuthExpiredResponse(res: Response): boolean {
  if (res.status === 401 || res.status === 403) return true;
  if (res.status === 404) {
    const status = res.headers.get("x-clerk-auth-status");
    const reason = res.headers.get("x-clerk-auth-reason") ?? "";
    const message = res.headers.get("x-clerk-auth-message") ?? "";
    return (
      status === "signed-out" ||
      /protect-rewrite|refresh_token_not_found|token-expired/.test(reason) ||
      /JWT is expired/i.test(message)
    );
  }
  return false;
}
