import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const clerkFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/clerk-fetch", () => ({ clerkFetch: clerkFetchMock }));

import { fetchLatestAnalysis } from "../fetch-latest-analysis";
import { AuthExpiredError } from "../auth-expired-error";

function res(status: number, body: unknown = {}, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("fetchLatestAnalysis — clerkFetch → retry skipCache → AuthExpiredError", () => {
  const fetchMock = vi.fn();
  const getTokenMock = vi.fn();

  beforeEach(() => {
    clerkFetchMock.mockReset();
    fetchMock.mockReset();
    getTokenMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { Clerk: { session: { getToken: getTokenMock } } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clerkFetch 200 → renvoie le JSON, sans retry ni getToken", async () => {
    clerkFetchMock.mockResolvedValueOnce(res(200, { data: { id: "a1" } }));
    const out = await fetchLatestAnalysis<{ data: { id: string } | null }>("d1");
    expect(out.data?.id).toBe("a1");
    expect(getTokenMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("404 signed-out → retry avec token FRAIS (skipCache) en header → 200", async () => {
    clerkFetchMock.mockResolvedValueOnce(res(404, {}, { "x-clerk-auth-status": "signed-out" }));
    getTokenMock.mockResolvedValueOnce("fresh_token");
    fetchMock.mockResolvedValueOnce(res(200, { data: { id: "a2" } }));

    const out = await fetchLatestAnalysis<{ data: { id: string } | null }>("d1");

    expect(getTokenMock).toHaveBeenCalledWith({ skipCache: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer fresh_token");
    // Le retry ne doit PAS renvoyer le cookie __session périmé (sinon il l'emporterait sur le Bearer).
    expect(init.credentials).toBe("omit");
    expect(out.data?.id).toBe("a2");
  });

  it("404 signed-out + retry encore auth-expiré → AuthExpiredError", async () => {
    clerkFetchMock.mockResolvedValueOnce(res(404, {}, { "x-clerk-auth-status": "signed-out" }));
    getTokenMock.mockResolvedValueOnce("fresh_token");
    fetchMock.mockResolvedValueOnce(res(401));
    await expect(fetchLatestAnalysis("d1")).rejects.toBeInstanceOf(AuthExpiredError);
  });

  it("404 signed-out + getToken null (SDK mort) → AuthExpiredError, PAS de fallback raw cookie-only", async () => {
    clerkFetchMock.mockResolvedValueOnce(res(404, {}, { "x-clerk-auth-status": "signed-out" }));
    getTokenMock.mockResolvedValueOnce(null);
    await expect(fetchLatestAnalysis("d1")).rejects.toBeInstanceOf(AuthExpiredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("404 NU (vraie 404, sans en-tête Clerk) → erreur générique, pas AuthExpiredError ni retry", async () => {
    clerkFetchMock.mockResolvedValueOnce(res(404, {}, { "x-matched-path": "/404" }));
    await expect(fetchLatestAnalysis("d1")).rejects.toThrow("Failed to fetch analysis status");
    expect(getTokenMock).not.toHaveBeenCalled();
  });
});
