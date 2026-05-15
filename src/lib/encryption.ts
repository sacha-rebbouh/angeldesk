import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard
const AUTH_TAG_LENGTH = 16;
const BUFFER_ENCRYPTION_PREFIX = Buffer.from("ADENC1\0", "utf8");

/**
 * Get the encryption key from environment.
 * Must be set in .env.local and Vercel env vars.
 * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
let _cachedKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (_cachedKey) return _cachedKey;
  const keyHex = process.env.DOCUMENT_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error(
      "DOCUMENT_ENCRYPTION_KEY is not set. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  if (keyHex.length !== 64) {
    throw new Error("DOCUMENT_ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }
  _cachedKey = Buffer.from(keyHex, "hex");
  return _cachedKey;
}

/**
 * Encrypt text using AES-256-GCM.
 * Returns: base64(iv + authTag + ciphertext)
 */
export function encryptText(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Pack: iv (12) + authTag (16) + ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString("base64");
}

/**
 * Decrypt text encrypted with encryptText().
 * Returns the original plaintext.
 */
export function decryptText(encryptedBase64: string): string {
  const key = getEncryptionKey();
  const packed = Buffer.from(encryptedBase64, "base64");

  // Unpack: iv (12) + authTag (16) + ciphertext
  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Encrypt arbitrary binary content using AES-256-GCM.
 * Returns: magic prefix + iv + authTag + ciphertext.
 */
export function encryptBuffer(plaintext: Buffer): Buffer {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
  ]);

  return Buffer.concat([BUFFER_ENCRYPTION_PREFIX, iv, cipher.getAuthTag(), encrypted]);
}

/**
 * Decrypt binary content encrypted with encryptBuffer().
 */
export function decryptBuffer(encrypted: Buffer): Buffer {
  if (!isEncryptedBuffer(encrypted)) {
    throw new Error("Buffer is not encrypted with Angel Desk binary envelope");
  }

  const key = getEncryptionKey();
  const payload = encrypted.subarray(BUFFER_ENCRYPTION_PREFIX.length);
  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
}

/**
 * Check whether a binary payload uses Angel Desk's encrypted file envelope.
 */
export function isEncryptedBuffer(buffer: Buffer): boolean {
  return buffer.length > BUFFER_ENCRYPTION_PREFIX.length + IV_LENGTH + AUTH_TAG_LENGTH &&
    buffer.subarray(0, BUFFER_ENCRYPTION_PREFIX.length).equals(BUFFER_ENCRYPTION_PREFIX);
}

/**
 * Decrypt binary payloads when encrypted, return unchanged otherwise.
 * Used during migration so existing plaintext blobs/local files remain readable.
 */
export function safeDecryptBuffer(buffer: Buffer): Buffer {
  if (!isEncryptedBuffer(buffer)) return buffer;
  return decryptBuffer(buffer);
}

/**
 * Check if a string is encrypted (heuristic: valid base64 with min length).
 * Used during migration to handle mixed encrypted/plaintext data.
 */
export function isEncrypted(text: string): boolean {
  if (text.length < IV_LENGTH + AUTH_TAG_LENGTH) return false;
  try {
    const buf = Buffer.from(text, "base64");
    // Check if base64 round-trips correctly and has minimum packed size
    return buf.toString("base64") === text && buf.length >= IV_LENGTH + AUTH_TAG_LENGTH + 1;
  } catch {
    return false;
  }
}

/**
 * Safely decrypt: returns plaintext if encrypted, original text if not.
 * Used during migration period when some records may not be encrypted yet.
 *
 * NOTE: this helper swallows decryption errors and returns the input
 * verbatim. Security-sensitive callers (gates, copy paths) MUST use
 * `tryDecryptText` instead so a corrupted ciphertext-looking input does
 * not silently round-trip as plaintext.
 */
export function safeDecrypt(text: string): string {
  if (!isEncrypted(text)) return text;
  try {
    return decryptText(text);
  } catch {
    // If decryption fails, assume it's plaintext
    return text;
  }
}

/**
 * Strict variant of `safeDecrypt`. Mirrors `tryDecryptJsonField`: surfaces
 * the distinction between "this string was never encrypted" and "this
 * string LOOKS encrypted but does not decrypt" (rotated key, tampering,
 * truncation). The latter must be fail-closed in security gates and in
 * the copy/reuse pipeline — never re-encrypted as if it were plaintext.
 */
export type DecryptedTextResult =
  | { kind: "plaintext"; value: string }
  | { kind: "decrypted"; value: string }
  | { kind: "corrupted"; reason: string };

export function tryDecryptText(text: string): DecryptedTextResult {
  if (!isEncrypted(text)) {
    return { kind: "plaintext", value: text };
  }
  try {
    return { kind: "decrypted", value: decryptText(text) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { kind: "corrupted", reason };
  }
}

// --- JSON field encryption (Prisma Json columns) ---
//
// Some DB columns store arbitrary JSON payloads that contain raw corpus
// material (OCR text, table cells, numeric claims, chart descriptions). We
// don't want to dump those columns to backups, ops dashboards, or any future
// log sink. The envelope `{ _enc: "ad1", data, v: 1 }` is what we persist;
// the original payload is JSON.stringify'd and run through encryptText().
//
// Legacy compat: prior to this rollout we stored plaintext JSON objects in
// the same columns. safeDecryptJsonField transparently handles both formats
// so existing rows keep working without a backfill migration.

const JSON_ENVELOPE_MARKER = "ad1" as const;

export type EncryptedJsonEnvelope = {
  _enc: typeof JSON_ENVELOPE_MARKER;
  data: string;
  v: 1;
};

/**
 * Wrap a JSON-serializable payload into the encrypted envelope ready for a
 * Prisma Json column. Returns null when the input is null/undefined so we
 * can write SQL NULL via Prisma.DbNull at the call site if needed.
 */
export function encryptJsonField(value: unknown): EncryptedJsonEnvelope | null {
  if (value === null || value === undefined) return null;
  const serialized = JSON.stringify(value);
  return {
    _enc: JSON_ENVELOPE_MARKER,
    data: encryptText(serialized),
    v: 1,
  };
}

/**
 * Type-narrow: does this stored JSON value look like our encrypted envelope?
 * Anything else is treated as a legacy plaintext payload.
 */
export function isEncryptedJsonField(value: unknown): value is EncryptedJsonEnvelope {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>)._enc === JSON_ENVELOPE_MARKER &&
    typeof (value as Record<string, unknown>).data === "string" &&
    (value as Record<string, unknown>).v === 1
  );
}

/**
 * Decrypt a JSON column transparently:
 *   - null/undefined → null
 *   - encrypted envelope → decrypted + JSON.parsed (returns null if the
 *     ciphertext is corrupted or the inner JSON does not parse — callers
 *     should treat that as "no artifact" rather than crashing the route)
 *   - anything else → returned as-is (legacy plaintext path).
 *
 * NOTE: this helper collapses three distinct states into `null` (absent,
 * legacy-null, corrupted-envelope). Security-sensitive callers that need
 * to fail-closed on corrupted envelopes should use `tryDecryptJsonField`
 * which preserves the distinction.
 */
export function safeDecryptJsonField<T = unknown>(value: unknown): T | null {
  const result = tryDecryptJsonField<T>(value);
  if (result.kind === "absent") return null;
  if (result.kind === "corrupted") return null;
  return result.value;
}

/**
 * Strict variant of `safeDecryptJsonField` that surfaces the distinction
 * between "no artifact" and "envelope present but unreadable". Used by
 * security gates (toxic-page gate) and copy paths (extraction-reuse) that
 * MUST fail-closed on corruption rather than silently treating a tampered
 * row as if no artifact existed.
 */
export type DecryptedJsonFieldResult<T> =
  | { kind: "absent" }
  | { kind: "plaintext"; value: T }
  | { kind: "decrypted"; value: T }
  | { kind: "corrupted"; reason: string };

export function tryDecryptJsonField<T = unknown>(value: unknown): DecryptedJsonFieldResult<T> {
  if (value === null || value === undefined) return { kind: "absent" };
  if (!isEncryptedJsonField(value)) {
    return { kind: "plaintext", value: value as T };
  }
  try {
    const plaintext = decryptText(value.data);
    return { kind: "decrypted", value: JSON.parse(plaintext) as T };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn("[encryption] tryDecryptJsonField failed:", reason);
    return { kind: "corrupted", reason };
  }
}
