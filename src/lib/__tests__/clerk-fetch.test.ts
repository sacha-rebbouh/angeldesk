import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clerkFetch } from "../clerk-fetch";

declare global {
  interface Window {
    Clerk?: {
      session?: {
        getToken: (options?: { skipCache?: boolean }) => Promise<string | null>;
      } | null;
    };
  }
}

describe("clerkFetch", () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as { window?: unknown }).window;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  it("attaches Authorization: Bearer <jwt> when the Clerk session SDK returns a token", async () => {
    (globalThis as { window?: unknown }).window = {
      Clerk: {
        session: {
          getToken: vi.fn().mockResolvedValue("jwt_fresh"),
        },
      },
    };

    await clerkFetch("/api/documents/upload", { method: "POST" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("Authorization")).toBe("Bearer jwt_fresh");
  });

  it("does not override an existing Authorization header set by the caller", async () => {
    (globalThis as { window?: unknown }).window = {
      Clerk: {
        session: {
          getToken: vi.fn().mockResolvedValue("jwt_fresh"),
        },
      },
    };

    await clerkFetch("/api/documents/upload", {
      method: "POST",
      headers: { Authorization: "Bearer custom-token" },
    });

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("Authorization")).toBe("Bearer custom-token");
  });

  it("falls back to plain fetch (cookie-only) when no Clerk session is available", async () => {
    (globalThis as { window?: unknown }).window = {
      Clerk: { session: null },
    };

    await clerkFetch("/api/documents/upload");

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(((init ?? {}) as RequestInit).headers);
    expect(headers.has("Authorization")).toBe(false);
  });

  it("returns plain fetch on the server (no window)", async () => {
    delete (globalThis as { window?: unknown }).window;

    await clerkFetch("/api/documents/upload");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The second argument is the init object as-passed (undefined here); we
    // simply assert no Bearer was injected.
    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(((init ?? {}) as RequestInit).headers);
    expect(headers.has("Authorization")).toBe(false);
  });
});
