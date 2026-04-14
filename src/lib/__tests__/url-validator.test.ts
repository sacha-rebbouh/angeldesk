import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("dns/promises", () => {
  return {
    lookup: vi.fn(async (hostname: string, options?: { all?: boolean }) => {
      if (hostname === "example.com") {
        return options?.all
          ? [{ address: "93.184.216.34", family: 4 }]
          : { address: "93.184.216.34", family: 4 };
      }

      if (hostname === "redirect.example") {
        return options?.all
          ? [{ address: "93.184.216.34", family: 4 }]
          : { address: "93.184.216.34", family: 4 };
      }

      if (hostname === "loop.example") {
        return options?.all
          ? [{ address: "93.184.216.34", family: 4 }]
          : { address: "93.184.216.34", family: 4 };
      }

      if (hostname === "127.0.0.1" || hostname === "localhost") {
        return options?.all
          ? [{ address: "127.0.0.1", family: 4 }]
          : { address: "127.0.0.1", family: 4 };
      }

      throw new Error(`DNS lookup failed for ${hostname}`);
    }),
  };
});

describe("url-validator SSRF helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("follows redirects manually and returns the final public response", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: {
            Location: "/final",
          },
        })
      )
      .mockResolvedValueOnce(
        new Response("ok", {
          status: 200,
          headers: {
            "content-type": "text/plain",
          },
        })
      );

    const { fetchWithValidatedRedirects } = await import("../url-validator");

    const result = await fetchWithValidatedRedirects(
      "https://example.com/start",
      {
        method: "GET",
        headers: {
          "User-Agent": "test-agent",
        },
        signal: new AbortController().signal,
      },
      { maxRedirects: 5 }
    );

    expect(result.finalUrl).toBe("https://example.com/final");
    expect(result.redirectCount).toBe(1);
    expect(result.response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
    expect(fetchMock.mock.calls[1][0]).toBe("https://example.com/final");
  });

  it("blocks a redirect hop that resolves to a private/internal URL", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: {
          Location: "http://127.0.0.1/internal",
        },
      })
    );

    const { fetchWithValidatedRedirects } = await import("../url-validator");

    await expect(
      fetchWithValidatedRedirects(
        "https://redirect.example/start",
        {
          method: "GET",
          signal: new AbortController().signal,
        },
        { maxRedirects: 5 }
      )
    ).rejects.toThrow(/Blocked private\/internal URL/i);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops following redirects after the configured hop limit", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: {
            Location: "/hop-1",
          },
        })
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: {
            Location: "/hop-2",
          },
        })
      );

    const { fetchWithValidatedRedirects } = await import("../url-validator");

    await expect(
      fetchWithValidatedRedirects(
        "https://loop.example/start",
        {
          method: "GET",
          signal: new AbortController().signal,
        },
        { maxRedirects: 1 }
      )
    ).rejects.toThrow(/Too many redirects/i);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
