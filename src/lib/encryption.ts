import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard
const AUTH_TAG_LENGTH = 16;

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
