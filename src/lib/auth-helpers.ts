/**
 * Phase B11.3.1 — auth helpers for route handlers.
 *
 * Lives in a separate module from `@/lib/auth` so the
 * `requireAuth` it calls comes through a real cross-module import.
 * Vitest's `vi.mock("@/lib/auth", ...)` only intercepts module
 * boundaries — a same-module call inside `auth.ts` would NOT be
 * mocked. Extracting the helper to `auth-helpers.ts` keeps the
 * 401-contract integration testable by mocking `requireAuth`
 * alone.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "./auth";
import { handleApiError } from "./api-error";

export type AuthOk = { ok: true; user: { id: string } };
export type AuthFailure = { ok: false; response: NextResponse };

/**
 * Wrap `requireAuth` with an explicit 401 contract:
 *   - `Unauthorized` / `Clerk user not found` → 401
 *     `{ error: "Unauthorized" }` (the client surfaces a clean
 *     "session expired" instead of a generic error).
 *   - Anything else (DB down, Prisma timeout, etc.) → 500 via
 *     `handleApiError` so the existing observability stays in
 *     place.
 *
 * Wire-shape: discriminated union — caller does
 *   const auth = await authenticateOrUnauthorized();
 *   if (!auth.ok) return auth.response;
 *   const user = auth.user;
 *
 * Same shape as the local helpers in B7 attachments / B8
 * evidence-health routes (consolidated here so the 7 routes
 * hardened in B11.3.1 share one source of truth).
 */
export async function authenticateOrUnauthorized(): Promise<AuthOk | AuthFailure> {
  try {
    const user = await requireAuth();
    return { ok: true, user };
  } catch (authError) {
    const msg = authError instanceof Error ? authError.message : "";
    if (msg === "Unauthorized" || msg === "Clerk user not found") {
      return {
        ok: false,
        response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      };
    }
    return { ok: false, response: handleApiError(authError, "auth") };
  }
}
