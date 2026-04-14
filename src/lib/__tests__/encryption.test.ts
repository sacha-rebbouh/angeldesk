import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  decryptBuffer,
  decryptText,
  encryptBuffer,
  encryptText,
  isEncrypted,
  isEncryptedBuffer,
  safeDecrypt,
  safeDecryptBuffer,
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
