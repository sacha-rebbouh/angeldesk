import { clerkFetch } from "@/lib/clerk-fetch";
import { AuthExpiredError, isAuthExpiredResponse } from "@/lib/auth-expired-error";

/**
 * Fetcher AUTH-REQUIRED pour la query partagée `['analyses','latest']`.
 *
 * `clerkFetch` (token Clerk frais en header `Authorization`) d'abord — contourne le cookie
 * `__session` périmé sur instance Clerk dev. Sur réponse auth-expirée, UN SEUL retry avec un token
 * FORCÉ (`getToken({ skipCache: true })`). Si le retry reste auth-expiré — ou si le SDK client ne
 * peut plus minter de token — on lève `AuthExpiredError`. **Pas de fallback cookie-only
 * silencieux** : le caller arrête le poll et propose une reconnexion au lieu de figer l'UI.
 *
 * Scopé aux endpoints auth-required (`/api/deals/:id/analyses`) — ne pas généraliser à des
 * fetchs publics (où un 401/403 n'a pas le même sens).
 */
export async function fetchLatestAnalysis<T = unknown>(dealId: string): Promise<T> {
  const url = `/api/deals/${dealId}/analyses`;

  let res = await clerkFetch(url);

  if (isAuthExpiredResponse(res)) {
    // Retry unique avec un token Clerk FORCÉ (skipCache) — couvre le cookie périmé quand le SDK
    // client peut encore minter un token valide. skipCache UNIQUEMENT ici (pas à chaque poll).
    let token: string | null = null;
    if (typeof window !== "undefined" && window.Clerk?.session) {
      token = await window.Clerk.session.getToken({ skipCache: true }).catch(() => null);
    }
    if (token) {
      // credentials: "omit" → on N'envoie PAS le cookie `__session` périmé sur le retry. Le middleware
      // Clerk lit `sessionTokenInCookie || tokenInHeader` : sans cookie, c'est le Bearer FRAIS qui
      // authentifie (sinon un cookie stale pourrait l'emporter sur le header et le retry serait vain).
      res = await fetch(url, {
        credentials: "omit",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    if (isAuthExpiredResponse(res)) {
      throw new AuthExpiredError();
    }
  }

  if (!res.ok) throw new Error("Failed to fetch analysis status");
  return (await res.json()) as T;
}
