/**
 * Encryption round-trip tests for EvidenceSignal payload fields.
 * Covers §6.2 tests #11, #12, #13, #14 from
 * docs-private/evidence-engine-phase1-schema.md révision 3.
 *
 * No DB interaction here — pure encryption + plaintext leak checks.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Generate a deterministic test key (32 bytes hex). MUST be set BEFORE
// the encryption module is imported, because `getEncryptionKey()` caches.
const TEST_KEY = "a".repeat(64);
process.env.DOCUMENT_ENCRYPTION_KEY = TEST_KEY;

const { encryptText, safeDecrypt, encryptJsonField, safeDecryptJsonField } = await import("@/lib/encryption");

const ORIGINAL_KEY = process.env.DOCUMENT_ENCRYPTION_KEY;

beforeAll(() => {
  process.env.DOCUMENT_ENCRYPTION_KEY = TEST_KEY;
});

afterAll(() => {
  if (ORIGINAL_KEY) {
    process.env.DOCUMENT_ENCRYPTION_KEY = ORIGINAL_KEY;
  } else {
    delete process.env.DOCUMENT_ENCRYPTION_KEY;
  }
});

describe("evidenceText encryption round-trip (test #12)", () => {
  it("encryptText → safeDecrypt restitue le plaintext", () => {
    const plaintext = "Table de capitalisation à jour au 18/09/2024";
    const encrypted = encryptText(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(safeDecrypt(encrypted)).toBe(plaintext);
  });

  it("plaintext sensible n'apparaît PAS dans le ciphertext (test #13)", () => {
    const plaintext = "Table de capitalisation à jour au 18/09/2024";
    const encrypted = encryptText(plaintext);
    expect(encrypted).not.toContain("Table de capitalisation");
    expect(encrypted).not.toContain("18/09/2024");
    expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it("encryptions distinctes du même plaintext donnent des envelopes distinctes (IV différent)", () => {
    const plaintext = "même texte";
    const a = encryptText(plaintext);
    const b = encryptText(plaintext);
    expect(a).not.toBe(b);
    expect(safeDecrypt(a)).toBe(plaintext);
    expect(safeDecrypt(b)).toBe(plaintext);
  });
});

describe("valueJson encryption round-trip (test #11)", () => {
  it("encryptJsonField → safeDecryptJsonField restitue le payload", () => {
    const payload = { asOf: "2024-09-18", currency: "EUR", amount: 6_000_000 };
    const envelope = encryptJsonField(payload);
    expect(envelope).not.toBeNull();
    const decrypted = safeDecryptJsonField(envelope);
    expect(decrypted).toEqual(payload);
  });

  it("plaintext sensible n'apparaît PAS dans l'envelope (test #13)", () => {
    const envelope = encryptJsonField({ amount: 6_000_000, currency: "EUR" });
    const raw = JSON.stringify(envelope);
    expect(raw).not.toContain("6000000");
    expect(raw).not.toContain("6,000,000");
    expect(raw).toContain("_enc");
    expect(raw).toContain("data");
  });

  it("test #14 — encryptions distinctes (IV différent), envelopes distinctes, dédup possible via signalHash sur plaintext canonique", async () => {
    const payload = { metric: "ARR", value: 1_000_000 };
    const envA = encryptJsonField(payload);
    const envB = encryptJsonField(payload);
    expect(envA).not.toEqual(envB);
    expect(safeDecryptJsonField(envA)).toEqual(payload);
    expect(safeDecryptJsonField(envB)).toEqual(payload);

    // Sanity : le signalHash calculé sur le plaintext canonique est identique.
    const { computeSignalHash } = await import("../signal-hash");
    const baseHashInput = {
      extractorVersion: "test@v1",
      kind: "METRIC_CLAIM" as const,
      evidenceText: null,
      pageNumber: null,
      sheetName: null,
      charOffset: null,
    };
    const hashA = computeSignalHash({ ...baseHashInput, valueJson: payload });
    const hashB = computeSignalHash({ ...baseHashInput, valueJson: payload });
    expect(hashA).toBe(hashB);
  });

  it("payload imbriqué round-trip", () => {
    const payload = {
      asOf: "2024-09-18",
      meta: { source: "filename", parser: { version: "v1" } },
      tags: ["cap_table", "signed"],
    };
    const envelope = encryptJsonField(payload);
    expect(safeDecryptJsonField(envelope)).toEqual(payload);
  });
});
