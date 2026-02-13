import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { encryptText, decryptText, isEncrypted, safeDecrypt } from "../encryption";

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
