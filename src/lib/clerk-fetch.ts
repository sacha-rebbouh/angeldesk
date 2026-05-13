// Browser fetch wrapper that attaches a fresh Clerk session JWT in the
// Authorization header. Works around a Clerk SDK bug on Vercel preview
// deployments where the SDK refreshes the `__session_<suffix>` cookie but
// leaves the unsuffixed `__session` cookie stale, causing the server
// middleware to read an expired JWT and return 404 on API routes.
//
// Verified against `@clerk/backend/dist/internal.js` (line ~910):
//   return this.sessionTokenInCookie || this.tokenInHeader;
// The middleware reads the cookie first, then falls back to the
// Authorization header — so passing a fresh Bearer JWT bypasses the
// stale-cookie problem without any backend change.

declare global {
  interface Window {
    Clerk?: {
      session?: {
        getToken: (options?: { skipCache?: boolean }) => Promise<string | null>;
      } | null;
    };
  }
}

export async function clerkFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  if (typeof window === "undefined") {
    return fetch(input, init);
  }

  const token = await window.Clerk?.session?.getToken().catch(() => null);
  if (!token) {
    return fetch(input, init);
  }

  const headers = new Headers(init.headers);
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}
