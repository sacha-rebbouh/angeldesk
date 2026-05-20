/**
 * Phase B0 — Upload instrumentation unit tests.
 *
 * Covers:
 *   - sessionId is unique per call
 *   - record() preserves insertion order
 *   - unknown event names are rejected (typo protection)
 *   - redactedDiagnostic() never contains blob URLs, tokens, OCR text
 *   - File metadata (name/size/type) IS preserved (useful for debug)
 *   - normaliseUploadError strips known secret patterns
 */
import { describe, expect, it } from "vitest";
import {
  createInstrumentationLog,
  createUploadSessionId,
  normaliseUploadError,
} from "../upload-instrumentation";

describe("createUploadSessionId", () => {
  it("génère un id préfixé 'upl_' unique par appel", () => {
    const a = createUploadSessionId();
    const b = createUploadSessionId();
    expect(a).toMatch(/^upl_/);
    expect(b).toMatch(/^upl_/);
    expect(a).not.toBe(b);
  });
});

describe("createInstrumentationLog — record + snapshot", () => {
  it("préserve l'ordre d'insertion", () => {
    const log = createInstrumentationLog("upl_test");
    log.record({ event: "modal_opened" });
    log.record({ event: "files_selected" });
    log.record({
      event: "file_queued",
      file: { fileId: "f1", name: "deck.pdf", size: 1024, type: "application/pdf", lastModified: 0 },
    });
    const snap = log.snapshot();
    expect(snap.map((e) => e.event)).toEqual(["modal_opened", "files_selected", "file_queued"]);
    expect(snap.every((e) => e.sessionId === "upl_test")).toBe(true);
  });

  it("ts par défaut = Date.now() injecté à l'enregistrement", () => {
    const log = createInstrumentationLog("upl_test");
    const before = Date.now();
    log.record({ event: "modal_opened" });
    const after = Date.now();
    const [entry] = log.snapshot();
    expect(entry.ts).toBeGreaterThanOrEqual(before);
    expect(entry.ts).toBeLessThanOrEqual(after);
  });

  it("rejette un event inconnu (protection typo)", () => {
    const log = createInstrumentationLog("upl_test");
    expect(() =>
      // @ts-expect-error testing runtime guard
      log.record({ event: "modal_oppened" })
    ).toThrow(/Unknown upload event/);
  });

  it("B2.2 — accepte upload_retry_started (per-file retry diagnostic)", () => {
    const log = createInstrumentationLog("upl_test");
    expect(() =>
      log.record({
        event: "upload_retry_started",
        file: { fileId: "f1", name: "deck.pdf", size: 1024, type: "application/pdf", lastModified: 0 },
      })
    ).not.toThrow();
    const snap = log.snapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0].event).toBe("upload_retry_started");
  });

  it("B2.3 — accepte upload_cancelled (per-file cancel diagnostic, distinct from failed)", () => {
    const log = createInstrumentationLog("upl_test");
    expect(() =>
      log.record({
        event: "upload_cancelled",
        file: { fileId: "f1", name: "deck.pdf", size: 1024, type: "application/pdf", lastModified: 0 },
      })
    ).not.toThrow();
    const snap = log.snapshot();
    expect(snap[0].event).toBe("upload_cancelled");
  });

  it("reset() vide la log et accepte un nouveau sessionId", () => {
    const log = createInstrumentationLog("upl_a");
    log.record({ event: "modal_opened" });
    log.reset("upl_b");
    expect(log.snapshot()).toEqual([]);
    log.record({ event: "modal_opened" });
    expect(log.snapshot()[0].sessionId).toBe("upl_b");
  });
});

describe("createInstrumentationLog — redactedDiagnostic", () => {
  it("expose sessionId, totalEvents, events, files, errorSummary", () => {
    const log = createInstrumentationLog("upl_test");
    log.record({ event: "modal_opened" });
    log.record({
      event: "upload_failed",
      file: { fileId: "f1", name: "deck.pdf", size: 1024, type: "application/pdf", lastModified: 0 },
      error: "timeout",
    });
    log.record({
      event: "upload_failed",
      file: { fileId: "f2", name: "model.xlsx", size: 2048, type: "application/vnd.openxmlformats", lastModified: 0 },
      error: "timeout",
    });
    const out = log.redactedDiagnostic();
    expect(out.sessionId).toBe("upl_test");
    expect(out.totalEvents).toBe(3);
    expect(out.events).toHaveLength(3);
    expect(out.files.map((f) => f.fileId).sort()).toEqual(["f1", "f2"]);
    expect(out.errorSummary).toEqual([{ event: "upload_failed", error: "timeout", count: 2 }]);
  });

  it("garantie structurelle : aucun champ libre — impossible de logger blob URL / token / OCR", () => {
    const log = createInstrumentationLog("upl_test");
    log.record({
      event: "upload_completed",
      file: { fileId: "f1", name: "deck.pdf", size: 1024, type: "application/pdf", lastModified: 0 },
      durationMs: 1234,
      // The TS type rejects `extra` / `blobUrl` / `token` / `ocrText` at compile
      // time. The runtime serialisation will only emit known fields.
    });
    const json = JSON.stringify(log.redactedDiagnostic());
    // Sanity: metadata preserved, no fields we'd never want to leak.
    expect(json).toContain("deck.pdf");
    expect(json).not.toMatch(/blob\.vercel-storage|client[Tt]oken|sk_live|sk_test|Bearer\s/);
    expect(json).not.toMatch(/vercel_blob_rw_/);
  });

  it("error: stocke uniquement le message normalisé, jamais le stack trace brut", () => {
    const log = createInstrumentationLog("upl_test");
    log.record({
      event: "upload_failed",
      file: { fileId: "f1", name: "x.pdf", size: 10, type: "application/pdf", lastModified: 0 },
      error: normaliseUploadError(new Error("HTTP 500: see https://blob.vercel-storage.com/x?token=SECRET")),
    });
    const json = JSON.stringify(log.redactedDiagnostic());
    expect(json).not.toContain("SECRET");
    expect(json).toContain("[redacted]");
  });
});

describe("normaliseUploadError", () => {
  it("Error → message", () => {
    expect(normaliseUploadError(new Error("boom"))).toBe("boom");
  });

  it("string → string", () => {
    expect(normaliseUploadError("boom")).toBe("boom");
  });

  it("unknown → 'Unknown error'", () => {
    expect(normaliseUploadError(undefined)).toBe("Unknown error");
    expect(normaliseUploadError(null)).toBe("Unknown error");
    expect(normaliseUploadError({ weird: "object" })).toBe("Unknown error");
  });

  it("strip blob signed URL token", () => {
    expect(normaliseUploadError("fetch https://blob.vercel-storage.com/x?token=SECRET")).toContain(
      "?token=[redacted]"
    );
  });

  it("strip Authorization Bearer header value", () => {
    expect(normaliseUploadError("401 Authorization: Bearer abc.def.ghi")).toContain("Bearer [redacted]");
  });

  it("strip vercel blob rw token literal", () => {
    expect(normaliseUploadError("token=vercel_blob_rw_AbCdEf123_xyz failed")).toContain(
      "vercel_blob_rw_[redacted]"
    );
  });

  it("strip Stripe-style sk_ prefix", () => {
    expect(normaliseUploadError("auth sk_live_abc123_def456 invalid")).toContain("sk_[redacted]");
  });

  it("cap message length to 500 chars", () => {
    const huge = "x".repeat(2000);
    expect(normaliseUploadError(huge).length).toBe(500);
  });
});
