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
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "email_x" }) });
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

// C1 — un envoi n'est « success » que si HTTP ok ET un id Resend est présent. Sinon un
// 401/403/429 (ex. domaine non vérifié) passerait pour un succès et graverait un faux envoi.
describe("sendEmail — validation de la réponse Resend (C1)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "test_key");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("réponse non-ok (ex. 403 domaine non vérifié) → success:false, pas de throw", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: "domain not verified", name: "validation_error" } }),
    });
    const res = await sendEmail({ to: "a@b.co", subject: "S", html: "<p>x</p>" });
    expect(res.success).toBe(false);
  });

  it("réponse ok mais sans id Resend → success:false (pas de faux succès)", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const res = await sendEmail({ to: "a@b.co", subject: "S", html: "<p>x</p>" });
    expect(res.success).toBe(false);
  });

  it("réponse ok + id → success:true", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "email_ok" }) });
    const res = await sendEmail({ to: "a@b.co", subject: "S", html: "<p>x</p>" });
    expect(res.success).toBe(true);
    expect(res.id).toBe("email_ok");
  });
});
