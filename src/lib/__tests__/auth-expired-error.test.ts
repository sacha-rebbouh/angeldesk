import { describe, it, expect } from "vitest";

import { AuthExpiredError, isAuthExpiredResponse } from "../auth-expired-error";

function res(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

describe("isAuthExpiredResponse", () => {
  it("401 → true", () => expect(isAuthExpiredResponse(res(401))).toBe(true));
  it("403 → true", () => expect(isAuthExpiredResponse(res(403))).toBe(true));

  it("404 + x-clerk-auth-status: signed-out → true", () =>
    expect(isAuthExpiredResponse(res(404, { "x-clerk-auth-status": "signed-out" }))).toBe(true));

  it("404 + x-clerk-auth-reason protect-rewrite/refresh_token_not_found → true", () =>
    expect(
      isAuthExpiredResponse(
        res(404, {
          "x-clerk-auth-reason": "protect-rewrite, session-token-expired-refresh-refresh_token_not_found",
        }),
      ),
    ).toBe(true));

  it("404 + x-clerk-auth-message 'JWT is expired' → true", () =>
    expect(isAuthExpiredResponse(res(404, { "x-clerk-auth-message": "JWT is expired" }))).toBe(true));

  // ⚠️ Le point que Codex a fait remonter : un 404 nu (x-matched-path seul, sans en-tête Clerk)
  // est une VRAIE 404, pas une session expirée.
  it("404 + x-matched-path: /404 SEUL (sans header Clerk) → false", () =>
    expect(isAuthExpiredResponse(res(404, { "x-matched-path": "/404" }))).toBe(false));

  it("404 nu (aucun en-tête) → false", () => expect(isAuthExpiredResponse(res(404))).toBe(false));
  it("200 → false", () => expect(isAuthExpiredResponse(res(200))).toBe(false));
  it("500 → false", () => expect(isAuthExpiredResponse(res(500))).toBe(false));
});

describe("AuthExpiredError", () => {
  it("instanceof + name", () => {
    const e = new AuthExpiredError();
    expect(e).toBeInstanceOf(AuthExpiredError);
    expect(e.name).toBe("AuthExpiredError");
  });
});
