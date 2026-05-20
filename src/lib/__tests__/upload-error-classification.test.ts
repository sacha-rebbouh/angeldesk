/**
 * Phase B2.4 — Upload error classification unit tests.
 *
 * Covers every category surfaced by the helpers. The classifier is the
 * choke point where "Upload failed" generic messages get turned into
 * actionable, French, user-facing copy.
 */
import { describe, expect, it } from "vitest";
import {
  UploadError,
  classifyExtractionFailure,
  classifyHttpError,
  classifyTransportError,
  type UploadErrorClassification,
} from "../upload-error-classification";

describe("classifyHttpError — server responses", () => {
  it("FUNCTION_PAYLOAD_TOO_LARGE (Vercel) → payload_size avec action 'Réessayer avec upload sécurisé'", () => {
    const out = classifyHttpError(413, "<html>FUNCTION_PAYLOAD_TOO_LARGE</html>");
    expect(out.category).toBe("payload_size");
    expect(out.actionLabel).toBe("Réessayer avec upload sécurisé");
  });

  it("401 → auth", () => {
    const out = classifyHttpError(401, JSON.stringify({ error: "Unauthorized" }));
    expect(out.category).toBe("auth");
    expect(out.message).toMatch(/Session expirée|Unauthorized/);
  });

  it("403 → auth (même catégorie que 401)", () => {
    const out = classifyHttpError(403, "{}");
    expect(out.category).toBe("auth");
  });

  it("409 + existingDocument → duplicate avec actionLabel + actionData", () => {
    const out = classifyHttpError(
      409,
      JSON.stringify({
        error: "Document identique deja uploade",
        existingDocument: { id: "doc_42", name: "deck.pdf" },
      })
    );
    expect(out.category).toBe("duplicate");
    expect(out.actionLabel).toBe("Voir le document existant");
    expect(out.actionData).toEqual({
      kind: "view_existing_document",
      documentId: "doc_42",
      documentName: "deck.pdf",
    });
    expect(out.message).toMatch(/déjà présent/);
  });

  it("409 + pendingAnalysisId → blocked (analyse en cours)", () => {
    const out = classifyHttpError(
      409,
      JSON.stringify({
        error: "Une analyse est deja en cours sur ce deal.",
        pendingAnalysisId: "ana_1",
      })
    );
    expect(out.category).toBe("blocked");
    expect(out.message).toMatch(/analyse/i);
  });

  it("409 sans existingDocument ni pendingAnalysisId → blocked générique", () => {
    const out = classifyHttpError(409, JSON.stringify({ error: "Conflict" }));
    expect(out.category).toBe("blocked");
  });

  it("413 → payload_size", () => {
    const out = classifyHttpError(413, JSON.stringify({ error: "File too large" }));
    expect(out.category).toBe("payload_size");
  });

  it("429 → rate_limit", () => {
    const out = classifyHttpError(429, "");
    expect(out.category).toBe("rate_limit");
  });

  it("400 avec 'signature' → invalid_signature", () => {
    const out = classifyHttpError(400, JSON.stringify({ error: "Invalid file signature. The uploaded file does not match its declared type." }));
    expect(out.category).toBe("invalid_signature");
  });

  it("400 avec 'file type' → invalid_type", () => {
    const out = classifyHttpError(
      400,
      JSON.stringify({ error: "Invalid file type. Allowed: PDF, Word, Excel, PowerPoint, Images" })
    );
    expect(out.category).toBe("invalid_type");
  });

  it("400 autre → validation générique", () => {
    const out = classifyHttpError(400, JSON.stringify({ error: "missing field x" }));
    expect(out.category).toBe("validation");
  });

  it("500 → server", () => {
    const out = classifyHttpError(500, JSON.stringify({ error: "Failed to load evidence" }));
    expect(out.category).toBe("server");
  });

  it("502/503/504 → server (toutes les 5xx)", () => {
    expect(classifyHttpError(502, "").category).toBe("server");
    expect(classifyHttpError(503, "").category).toBe("server");
    expect(classifyHttpError(504, "").category).toBe("server");
  });

  it("Body non-JSON → fallback unknown sans throw", () => {
    const out = classifyHttpError(418, "I'm a teapot");
    expect(out.category).toBe("unknown");
    expect(typeof out.message).toBe("string");
  });

  it("B2.4 — aucun message générique 'Upload failed' dans les classifications", () => {
    const samples: number[] = [400, 401, 403, 409, 413, 429, 500];
    for (const status of samples) {
      const out = classifyHttpError(status, JSON.stringify({ error: "x" }));
      expect(out.message).not.toMatch(/^Upload failed/i);
    }
  });
});

describe("classifyTransportError — transport (no HTTP response)", () => {
  it("'Failed to fetch' → network", () => {
    const out = classifyTransportError(new TypeError("Failed to fetch"));
    expect(out.category).toBe("network");
    expect(out.message).toMatch(/réseau|connexion/i);
  });

  it("ERR_NETWORK / offline → network", () => {
    expect(classifyTransportError(new Error("net::ERR_NETWORK")).category).toBe("network");
    expect(classifyTransportError(new Error("device offline")).category).toBe("network");
  });

  it("UploadError pass-through → preserve category + payload", () => {
    const err = new UploadError("blob_token", "Token mint failed", { actionLabel: "Réessayer" });
    const out = classifyTransportError(err);
    expect(out.category).toBe("blob_token");
    expect(out.actionLabel).toBe("Réessayer");
  });

  it("Erreur générique → unknown + message normalisé", () => {
    const out = classifyTransportError(new Error("Unexpected end of JSON"));
    expect(out.category).toBe("unknown");
    expect(out.message).toBe("Unexpected end of JSON");
  });

  it("string → unknown", () => {
    expect(classifyTransportError("oops").category).toBe("unknown");
  });
});

describe("classifyExtractionFailure", () => {
  it("message présent → category=extraction + message + actionLabel Réessayer", () => {
    const out = classifyExtractionFailure("OCR timeout after 3 pages");
    expect(out.category).toBe("extraction");
    expect(out.message).toBe("OCR timeout after 3 pages");
    expect(out.actionLabel).toBe("Réessayer");
  });

  it("message absent → fallback explicite (jamais 'Upload failed')", () => {
    const out = classifyExtractionFailure(null);
    expect(out.category).toBe("extraction");
    expect(out.message).not.toMatch(/^Upload failed/i);
    expect(out.message).toMatch(/extraction/i);
  });

  it("B2.4 — distinction enqueue/extraction NOT lumped into 'upload': category=extraction", () => {
    // The spec asks enqueue fail ≠ upload fail. Both end up in classifyExtractionFailure
    // when the durable progress poller observes phase=failed. The category is always
    // extraction (post-upload), never upload.
    const out = classifyExtractionFailure("Enqueue to Inngest failed");
    expect(out.category).toBe("extraction");
  });
});

describe("UploadError class", () => {
  it("toClassification() expose category + message + action", () => {
    const err = new UploadError("duplicate", "Doc déjà là", {
      actionLabel: "Voir",
      actionData: { kind: "view_existing_document", documentId: "d1", documentName: "x.pdf" },
    });
    const cls: UploadErrorClassification = err.toClassification();
    expect(cls.category).toBe("duplicate");
    expect(cls.message).toBe("Doc déjà là");
    expect(cls.actionData?.documentId).toBe("d1");
  });

  it("cause préservée si fournie", () => {
    const inner = new Error("root cause");
    const err = new UploadError("server", "wrapper", { cause: inner });
    expect((err as Error & { cause?: unknown }).cause).toBe(inner);
  });
});
