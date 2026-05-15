import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  decryptBuffer,
  decryptText,
  encryptBuffer,
  encryptJsonField,
  encryptText,
  isEncrypted,
  isEncryptedBuffer,
  isEncryptedJsonField,
  safeDecrypt,
  safeDecryptBuffer,
  safeDecryptJsonField,
  tryDecryptJsonField,
  tryDecryptText,
} from "../encryption";

// Set a test encryption key (32 bytes = 64 hex chars)
const TEST_KEY = "a".repeat(64);

beforeAll(() => {
  vi.stubEnv("DOCUMENT_ENCRYPTION_KEY", TEST_KEY);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("encryptText / decryptText", () => {
  it("encrypts and decrypts back to original text", () => {
    const original = "Confidential pitch deck content: ARR = 500K EUR";
    const encrypted = encryptText(original);
    expect(encrypted).not.toBe(original);
    const decrypted = decryptText(encrypted);
    expect(decrypted).toBe(original);
  });

  it("produces different ciphertext for the same plaintext (unique IV)", () => {
    const text = "Same text twice";
    const e1 = encryptText(text);
    const e2 = encryptText(text);
    expect(e1).not.toBe(e2);
  });

  it("handles empty strings", () => {
    const encrypted = encryptText("");
    expect(decryptText(encrypted)).toBe("");
  });

  it("handles unicode / multi-byte text", () => {
    const text = "Startup française: café ☕ résultats 📊";
    const encrypted = encryptText(text);
    expect(decryptText(encrypted)).toBe(text);
  });

  it("handles large text (100KB)", () => {
    const text = "X".repeat(100_000);
    const encrypted = encryptText(text);
    expect(decryptText(encrypted)).toBe(text);
  });

  it("detects tampered ciphertext", () => {
    const encrypted = encryptText("test data");
    // Tamper with the ciphertext
    const tampered = encrypted.slice(0, -2) + "AA";
    expect(() => decryptText(tampered)).toThrow();
  });
});

describe("isEncrypted", () => {
  it("returns true for encrypted data", () => {
    const encrypted = encryptText("test");
    expect(isEncrypted(encrypted)).toBe(true);
  });

  it("returns false for plaintext", () => {
    expect(isEncrypted("This is just plain text")).toBe(false);
  });

  it("returns false for short strings", () => {
    expect(isEncrypted("abc")).toBe(false);
  });
});

describe("safeDecrypt", () => {
  it("decrypts encrypted text", () => {
    const encrypted = encryptText("secret");
    expect(safeDecrypt(encrypted)).toBe("secret");
  });

  it("returns plaintext as-is if not encrypted", () => {
    const plain = "Hello world, this is not encrypted";
    expect(safeDecrypt(plain)).toBe(plain);
  });
});

describe("encryptBuffer / decryptBuffer", () => {
  it("encrypts and decrypts binary content back to the original buffer", () => {
    const original = Buffer.from([0, 1, 2, 3, 255, 254, 128, 64]);

    const encrypted = encryptBuffer(original);

    expect(encrypted.equals(original)).toBe(false);
    expect(isEncryptedBuffer(encrypted)).toBe(true);
    expect(decryptBuffer(encrypted).equals(original)).toBe(true);
  });

  it("produces different ciphertext for the same buffer", () => {
    const original = Buffer.from("same file content");

    expect(encryptBuffer(original).equals(encryptBuffer(original))).toBe(false);
  });

  it("safeDecryptBuffer returns plaintext buffers unchanged", () => {
    const original = Buffer.from("legacy plaintext file");

    expect(safeDecryptBuffer(original)).toBe(original);
    expect(isEncryptedBuffer(original)).toBe(false);
  });

  it("detects tampered encrypted buffers", () => {
    const encrypted = encryptBuffer(Buffer.from("confidential deck"));
    encrypted[encrypted.length - 1] = encrypted[encrypted.length - 1] ^ 1;

    expect(() => decryptBuffer(encrypted)).toThrow();
  });
});

describe("encryptJsonField / safeDecryptJsonField", () => {
  it("round-trips a typical DocumentPageArtifact-shaped payload", () => {
    const artifact = {
      version: "v2",
      pageNumber: 4,
      text: "ARR €1.2M, MoM growth 18%",
      tables: [{ title: "P&L", markdown: "| Revenue | 1.2M |", confidence: "high" }],
      charts: [{ description: "Growth curve YoY", confidence: "medium" }],
      numericClaims: [
        { label: "ARR", value: "1.2M", unit: "€", sourceText: "ARR €1.2M", confidence: "high" },
      ],
      confidence: "high",
      needsHumanReview: false,
    };

    const envelope = encryptJsonField(artifact);
    expect(envelope).not.toBeNull();
    expect(envelope).toMatchObject({ _enc: "ad1", v: 1 });
    expect(typeof envelope!.data).toBe("string");
    expect(envelope!.data).not.toContain("ARR");

    const decrypted = safeDecryptJsonField(envelope);
    expect(decrypted).toEqual(artifact);
  });

  it("produces different ciphertexts for the same payload (unique IV)", () => {
    const payload = { tables: [{ markdown: "| a | b |" }] };
    const a = encryptJsonField(payload);
    const b = encryptJsonField(payload);
    expect(a!.data).not.toBe(b!.data);
    // But both decrypt back to the same payload.
    expect(safeDecryptJsonField(a)).toEqual(safeDecryptJsonField(b));
  });

  it("returns null for null/undefined inputs", () => {
    expect(encryptJsonField(null)).toBeNull();
    expect(encryptJsonField(undefined)).toBeNull();
    expect(safeDecryptJsonField(null)).toBeNull();
    expect(safeDecryptJsonField(undefined)).toBeNull();
  });

  it("LEGACY: returns a plaintext JSON object as-is (no decryption attempted)", () => {
    // Simulates a row written before Phase 3 — the artifact column holds a
    // plain DocumentPageArtifact object, not an envelope. The reader must
    // surface it verbatim so existing extractions keep working.
    const legacy = {
      version: "v1",
      pageNumber: 7,
      text: "legacy plaintext page",
      tables: [{ markdown: "| a | b |", confidence: "low" }],
      confidence: "low",
      needsHumanReview: true,
    };

    expect(isEncryptedJsonField(legacy)).toBe(false);
    expect(safeDecryptJsonField(legacy)).toBe(legacy);
  });

  it("LEGACY: returns an arbitrary plaintext object that has unrelated keys", () => {
    const oddLegacy = { _enc: "something-else", data: 12, v: 2, foo: "bar" };
    // The envelope check is strict: marker must equal "ad1" AND data must be
    // a string AND v must be 1. Anything else is treated as legacy.
    expect(isEncryptedJsonField(oddLegacy)).toBe(false);
    expect(safeDecryptJsonField(oddLegacy)).toBe(oddLegacy);
  });

  it("falls back to null when an envelope contains corrupted ciphertext", () => {
    const tampered = {
      _enc: "ad1" as const,
      data: "not-base64-and-not-decryptable",
      v: 1 as const,
    };
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      expect(safeDecryptJsonField(tampered)).toBeNull();
      expect(consoleWarn).toHaveBeenCalled();
    } finally {
      consoleWarn.mockRestore();
    }
  });

  it("handles nested arrays / unicode inside the payload", () => {
    const payload = {
      charts: [{ description: "Évolution chiffres d'affaires 📈", values: [{ label: "Q1", value: "+12%" }] }],
      numericClaims: [{ label: "Burn", value: "−45k€", unit: "€", sourceText: "Burn ≈ -45k€/mois", confidence: "medium" }],
    };
    const envelope = encryptJsonField(payload);
    expect(safeDecryptJsonField(envelope)).toEqual(payload);
  });
});

describe("tryDecryptText (strict variant for security gates)", () => {
  it("returns kind=plaintext for a value that is not encrypted-looking", () => {
    const result = tryDecryptText("Hello world");
    expect(result).toEqual({ kind: "plaintext", value: "Hello world" });
  });

  it("returns kind=decrypted with the original text for a valid ciphertext", () => {
    const original = "Confidential preview text";
    const ciphertext = encryptText(original);
    const result = tryDecryptText(ciphertext);
    expect(result).toEqual({ kind: "decrypted", value: original });
  });

  it("returns kind=corrupted (NOT plaintext) for a ciphertext-looking input that fails decryption", () => {
    const good = encryptText("payload");
    const corrupted = Buffer.from(good, "base64");
    corrupted[14] = corrupted[14] ^ 0xff;
    const tampered = corrupted.toString("base64");

    // Sanity: the heuristic still flags this as encrypted-looking.
    expect(isEncrypted(tampered)).toBe(true);

    const result = tryDecryptText(tampered);
    expect(result.kind).toBe("corrupted");
    if (result.kind === "corrupted") {
      expect(typeof result.reason).toBe("string");
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it("differs from safeDecrypt: safeDecrypt silently returns the input on corruption", () => {
    const good = encryptText("payload");
    const corrupted = Buffer.from(good, "base64");
    corrupted[14] = corrupted[14] ^ 0xff;
    const tampered = corrupted.toString("base64");

    // This is the exact failure mode the textPreview fail-closed fix
    // addresses: safeDecrypt cannot be trusted by security gates because
    // it lies about success on a tampered ciphertext.
    expect(safeDecrypt(tampered)).toBe(tampered);

    expect(tryDecryptText(tampered).kind).toBe("corrupted");
  });
});

describe("tryDecryptJsonField (strict variant for security gates)", () => {
  it("returns kind=absent for null/undefined", () => {
    expect(tryDecryptJsonField(null).kind).toBe("absent");
    expect(tryDecryptJsonField(undefined).kind).toBe("absent");
  });

  it("returns kind=plaintext for a legacy plain object", () => {
    const legacy = { foo: "bar" };
    const result = tryDecryptJsonField(legacy);
    expect(result).toEqual({ kind: "plaintext", value: legacy });
  });

  it("returns kind=decrypted for a valid envelope", () => {
    const payload = { tables: [], numericClaims: [] };
    const envelope = encryptJsonField(payload);
    const result = tryDecryptJsonField(envelope);
    expect(result).toEqual({ kind: "decrypted", value: payload });
  });

  it("returns kind=corrupted with a reason for an undecryptable envelope", () => {
    const tampered = { _enc: "ad1" as const, data: "not-valid-ciphertext", v: 1 as const };
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const result = tryDecryptJsonField(tampered);
      expect(result.kind).toBe("corrupted");
      if (result.kind === "corrupted") {
        expect(typeof result.reason).toBe("string");
      }
    } finally {
      consoleWarn.mockRestore();
    }
  });
});
