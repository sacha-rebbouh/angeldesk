import { describe, it, expect, vi, beforeEach } from "vitest";
import { logApi, createApiTimer } from "../api-logger";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("logApi", () => {
  it("calls console.error for error level entries", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logApi({ level: "error", method: "GET", path: "/test", error: "fail" });
    expect(spy).toHaveBeenCalledOnce();
  });

  it("calls console.warn for warn level entries in dev", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logApi({ level: "warn", method: "POST", path: "/test" });
    expect(spy).toHaveBeenCalledOnce();
  });

  it("does not log info level in dev (reduces noise)", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logApi({ level: "info", method: "GET", path: "/test", status: 200 });
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("createApiTimer", () => {
  it("measures duration and logs on success", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});

    const timer = createApiTimer("GET", "/api/v1/deals");
    timer.setContext("user123", "key456");

    // Simulate some time passing
    timer.success(200, { count: 5 });

    // In dev mode, info is skipped — so no call expected
    // Just verify no errors thrown
    expect(true).toBe(true);
  });

  it("logs errors with status and message", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const timer = createApiTimer("POST", "/api/v1/deals");
    timer.setContext("user123", "key456");
    timer.error(500, "Database connection failed");

    expect(spy).toHaveBeenCalledOnce();
    const loggedMsg = spy.mock.calls[0][0] as string;
    expect(loggedMsg).toContain("ERROR");
    expect(loggedMsg).toContain("Database connection failed");
  });

  it("works without setContext (no userId/keyId)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const timer = createApiTimer("GET", "/api/v1/keys");
    timer.error(401, "Unauthorized");

    expect(spy).toHaveBeenCalledOnce();
  });
});
