import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { sendEmail } from "../email";

// Vérifie que la clé d'idempotence atteint bien `fetch` (header HTTP `Idempotency-Key`) —
// l'exactly-once de la notification « analyse prête » en dépend (cf. analysis-ready-email).
describe("sendEmail — header Idempotency-Key vers Resend", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "test_key");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ json: async () => ({ id: "email_x" }) });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function headersFromLastCall(): Record<string, string> {
    const call = fetchMock.mock.calls.at(-1);
    return ((call?.[1] as { headers?: Record<string, string> })?.headers ?? {}) as Record<string, string>;
  }

  it("ajoute le header quand idempotencyKey est fourni", async () => {
    const res = await sendEmail(
      { to: "a@b.co", subject: "S", html: "<p>x</p>" },
      { idempotencyKey: "analysis-ready/a1" }
    );
    expect(res.success).toBe(true);
    expect(headersFromLastCall()["Idempotency-Key"]).toBe("analysis-ready/a1");
  });

  it("n'ajoute PAS le header sans idempotencyKey", async () => {
    await sendEmail({ to: "a@b.co", subject: "S", html: "<p>x</p>" });
    expect(headersFromLastCall()["Idempotency-Key"]).toBeUndefined();
  });
});
