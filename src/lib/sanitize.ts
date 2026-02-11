/**
 * Sanitization utilities for LLM prompt injection prevention
 * and input validation
 */

import { z } from "zod";

// ============================================================================
// CUSTOM ERRORS
// ============================================================================

/**
 * Error thrown when prompt injection is detected and blocking is enabled
 */
export class PromptInjectionError extends Error {
  constructor(
    message: string,
    public readonly patterns: string[]
  ) {
    super(message);
    this.name = "PromptInjectionError";
  }
}

// ============================================================================
// PROMPT INJECTION PREVENTION
// ============================================================================

/**
 * Patterns that could indicate prompt injection attempts
 */
const SUSPICIOUS_PATTERNS = [
  // === ANGLAIS ===
  /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?)/i,
  /forget\s+(all\s+)?(previous|above|prior)/i,
  /disregard\s+(all\s+)?(previous|above|prior)/i,
  /you\s+are\s+now\s+a/i,
  /pretend\s+(you\s+are|to\s+be)/i,
  /act\s+as\s+(if\s+you\s+are|a)/i,
  /new\s+instructions?:/i,
  /system\s*prompt/i,
  /\[INST\]/i,
  /\[\/INST\]/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /```\s*(system|assistant|user)\s*\n/i,
  /override\s+(system|previous|all)/i,

  // === FRANCAIS ===
  /ignore[rz]?\s+(toutes?\s+)?(les\s+)?(instructions?|consignes?|r[eè]gles?)\s+(pr[eé]c[eé]dentes?|ci-dessus|ant[eé]rieures?)/i,
  /oublie[rz]?\s+(tout(es)?|les)\s+(instructions?|consignes?)/i,
  /ne\s+tiens?\s+(pas\s+)?compte\s+d/i,
  /tu\s+es\s+maintenant\s+un/i,
  /fais\s+comme\s+si\s+tu\s+[eé]tais/i,
  /nouvelles?\s+instructions?[\s:]/i,
  /r[eé]initialise[rz]?\s+(tes?|les?)\s+(instructions?|param[eè]tres?)/i,

  // === ESPAGNOL ===
  /ignora[r]?\s+(todas?\s+)?(las?\s+)?(instrucciones|reglas)/i,
  /olvida[r]?\s+(todas?\s+)?(las?\s+)?(instrucciones|reglas)/i,
  /ahora\s+eres\s+un/i,
  /nuevas?\s+instrucciones[\s:]/i,

  // === ALLEMAND ===
  /ignorier(e|en)?\s+(alle\s+)?(vorherigen?\s+)?(anweisungen|regeln)/i,
  /vergiss\s+(alle\s+)?(vorherigen?\s+)/i,
  /du\s+bist\s+jetzt\s+ein/i,
  /neue\s+anweisungen[\s:]/i,

  // === INJECTION INDIRECTE ===
  /\bhidden\s+instructions?\b/i,
  /\bsecret\s+instructions?\b/i,
  /\bdo\s+not\s+follow\s+(the\s+)?(above|previous|system)/i,
  /\bactual\s+instructions?\b/i,
  /\breal\s+instructions?\b/i,
  /\btrue\s+instructions?\b/i,
  /\boverride\s+mode\b/i,
  /\bdeveloper\s+mode\b/i,
  /\bjailbreak/i,
  /\bDAN\s*mode/i,

  // === SEPARATEURS DE ROLE ===
  /###\s*(system|assistant|user|human)\s*(message|prompt)?/i,
  /---\s*(system|assistant|user|human)\s*(message|prompt)?/i,
  /\*\*\*(system|assistant|user|human)/i,
  /<(system|assistant|user)>/i,
];

/**
 * Normalise le texte en remplacant les homoglyphes Unicode par leurs
 * equivalents ASCII. Empeche le contournement des patterns via
 * des caracteres visuellement identiques (ex: А cyrillique vs A latin).
 */
function normalizeUnicodeHomoglyphs(text: string): string {
  const homoglyphMap: Record<string, string> = {
    // Cyrillique -> Latin
    '\u0410': 'A', '\u0412': 'B', '\u0421': 'C', '\u0415': 'E',
    '\u041D': 'H', '\u041A': 'K', '\u041C': 'M', '\u041E': 'O',
    '\u0420': 'P', '\u0422': 'T', '\u0425': 'X',
    '\u0430': 'a', '\u0435': 'e', '\u043E': 'o', '\u0440': 'p',
    '\u0441': 'c', '\u0443': 'u', '\u0445': 'x',
    // Zero-width chars -> removed
    '\u200B': '', '\u200C': '', '\u200D': '', '\u2060': '', '\uFEFF': '',
    // Various spaces -> normal space
    '\u00A0': ' ', '\u2000': ' ', '\u2001': ' ', '\u2002': ' ', '\u2003': ' ',
    '\u2004': ' ', '\u2005': ' ', '\u2006': ' ', '\u2007': ' ',
    '\u2008': ' ', '\u2009': ' ', '\u200A': ' ',
    '\u202F': ' ', '\u205F': ' ', '\u3000': ' ',
    // Fullwidth confusables
    '\uFF1C': '<', '\uFF1E': '>', '\uFF3B': '[', '\uFF3D': ']',
    '\uFF5B': '{', '\uFF5D': '}',
  };

  let normalized = text;
  for (const [unicode, ascii] of Object.entries(homoglyphMap)) {
    normalized = normalized.replaceAll(unicode, ascii);
  }
  return normalized;
}

/**
 * Detecte les patterns suspects dans differents encodages.
 */
function detectEncodedInjection(text: string): string[] {
  const detectedPatterns: string[] = [];

  // 1. Detection base64 suspecte
  const base64Regex = /(?:[A-Za-z0-9+/]{4}){3,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?/g;
  const base64Matches = text.match(base64Regex);
  if (base64Matches) {
    for (const b64 of base64Matches) {
      if (b64.length < 20 || b64.length > 1000) continue;
      try {
        const decoded = Buffer.from(b64, 'base64').toString('utf-8');
        // Verify it's actual text (not binary), then check patterns
        if (/^[\x20-\x7E\s]+$/.test(decoded)) {
          for (const pattern of SUSPICIOUS_PATTERNS) {
            if (pattern.test(decoded)) {
              detectedPatterns.push(`base64_encoded: ${decoded.substring(0, 80)}`);
              break;
            }
          }
        }
      } catch {
        // not valid base64, ignore
      }
    }
  }

  // 2. Detection URL encoding
  if (/%[0-9A-Fa-f]{2}/.test(text)) {
    const urlDecoded = text.replace(/%([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
    if (urlDecoded !== text) {
      for (const pattern of SUSPICIOUS_PATTERNS) {
        if (pattern.test(urlDecoded) && !pattern.test(text)) {
          detectedPatterns.push(`url_encoded: ${pattern.source}`);
        }
      }
    }
  }

  // 3. Detection HTML entities
  if (/&[a-z]+;|&#x?[0-9a-f]+;/i.test(text)) {
    const htmlDecoded = text
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec)));
    if (htmlDecoded !== text) {
      for (const pattern of SUSPICIOUS_PATTERNS) {
        if (pattern.test(htmlDecoded) && !pattern.test(text)) {
          detectedPatterns.push(`html_entity: ${pattern.source}`);
        }
      }
    }
  }

  return detectedPatterns;
}

/**
 * Check if text contains suspicious prompt injection patterns.
 * Includes: multilingual patterns, Unicode homoglyph normalization,
 * encoded injection detection (base64, URL encoding, HTML entities).
 */
export function detectPromptInjection(text: string): {
  isSuspicious: boolean;
  patterns: string[];
} {
  const detectedPatterns: string[] = [];

  // Normalize homoglyphs before detection
  const normalizedText = normalizeUnicodeHomoglyphs(text);

  // Check patterns on normalized text
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(normalizedText)) {
      detectedPatterns.push(pattern.source);
    }
  }

  // Also check original text if different (in case normalization masks something)
  if (text !== normalizedText) {
    for (const pattern of SUSPICIOUS_PATTERNS) {
      if (pattern.test(text) && !detectedPatterns.includes(pattern.source)) {
        detectedPatterns.push(pattern.source);
      }
    }
  }

  // Detect encoded injections only if nothing found yet (avoid expensive checks)
  if (detectedPatterns.length === 0) {
    const encodedPatterns = detectEncodedInjection(normalizedText);
    detectedPatterns.push(...encodedPatterns);
  }

  // Detection of excessive zero-width characters (even after normalization)
  const zeroWidthCount = (text.match(/[\u200B\u200C\u200D\u2060\uFEFF]/g) || []).length;
  if (zeroWidthCount > 5) {
    detectedPatterns.push(`excessive_zero_width_chars: ${zeroWidthCount}`);
  }

  return {
    isSuspicious: detectedPatterns.length > 0,
    patterns: detectedPatterns,
  };
}

/**
 * Sanitize text for safe inclusion in LLM prompts
 * - Escapes special characters that could be interpreted as prompt delimiters
 * - Truncates to max length
 * - Removes null bytes and control characters
 */
export function sanitizeForLLM(
  text: string | null | undefined,
  options: {
    maxLength?: number;
    preserveNewlines?: boolean;
    warnOnSuspicious?: boolean;
    blockOnSuspicious?: boolean; // NEW: If true, throws error on suspicious patterns
  } = {}
): string {
  if (!text) return "";

  const {
    maxLength = 10000,
    preserveNewlines = true,
    warnOnSuspicious = true,
    blockOnSuspicious = true, // SECURITY: block prompt injection by default
  } = options;

  // Check for suspicious patterns
  const detection = detectPromptInjection(text);
  if (detection.isSuspicious) {
    if (blockOnSuspicious) {
      throw new PromptInjectionError(
        `Potential prompt injection detected: ${detection.patterns.join(", ")}`,
        detection.patterns
      );
    }
    if (warnOnSuspicious) {
      console.warn(
        `[Sanitize] Suspicious prompt injection patterns detected: ${detection.patterns.join(", ")}`
      );
    }
  }

  let sanitized = text;

  // Remove null bytes and other dangerous control characters
  sanitized = sanitized.replace(/\x00/g, "");
  sanitized = sanitized.replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Escape potential prompt delimiters
  sanitized = sanitized
    .replace(/```/g, "'''") // Code blocks that could inject roles
    .replace(/<\|/g, "< |") // Special tokens
    .replace(/\|>/g, "| >")
    .replace(/\[INST\]/gi, "[_INST_]")
    .replace(/\[\/INST\]/gi, "[/_INST_]");

  // Normalize newlines
  if (preserveNewlines) {
    sanitized = sanitized.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  } else {
    sanitized = sanitized.replace(/[\r\n]+/g, " ");
  }

  // Truncate if needed
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + "\n[...truncated...]";
  }

  return sanitized.trim();
}

/**
 * Sanitize a deal name or company name
 * More restrictive than general text sanitization
 */
export function sanitizeName(name: string | null | undefined): string {
  if (!name) return "Unknown";

  return sanitizeForLLM(name, {
    maxLength: 200,
    preserveNewlines: false,
    warnOnSuspicious: true,
  });
}

/**
 * Sanitize document text content
 */
export function sanitizeDocumentText(
  text: string | null | undefined,
  maxLength = 5000
): string {
  return sanitizeForLLM(text, {
    maxLength,
    preserveNewlines: true,
    warnOnSuspicious: true,
  });
}

// ============================================================================
// INPUT VALIDATION SCHEMAS
// ============================================================================

/**
 * Zod schema for CUID/CUID2 IDs (Prisma default)
 * CUID format: c + 20-28 alphanumeric characters (lowercase)
 */
/** Regex for CUID/CUID2 format validation */
export const CUID_PATTERN = /^c[a-z0-9]{20,29}$/;

/** Quick boolean check for CUID validity */
export function isValidCuid(id: string | null | undefined): id is string {
  return typeof id === "string" && CUID_PATTERN.test(id);
}

export const cuidSchema = z
  .string()
  .min(21, "ID too short")
  .max(30, "ID too long")
  .regex(CUID_PATTERN, "Invalid ID format");

/**
 * Zod schema for board API request body
 */
export const boardRequestSchema = z.object({
  dealId: cuidSchema,
});

/**
 * Zod schema for board session stop request
 */
export const boardSessionSchema = z.object({
  sessionId: cuidSchema,
});

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Simple in-memory rate limiter
 * In production, consider using Redis or Upstash
 */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// Maximum size to prevent memory exhaustion attacks
const MAX_RATE_LIMIT_ENTRIES = 10000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number; // seconds
}

export function checkRateLimit(
  key: string,
  options: {
    maxRequests?: number;
    windowMs?: number;
  } = {}
): RateLimitResult {
  const { maxRequests = 2, windowMs = 60000 } = options; // 2 requests per minute default

  const now = Date.now();
  const existing = rateLimitStore.get(key);

  // Clean up old entries periodically (increased probability to 5%)
  // Also clean up if we hit the size limit
  if (Math.random() < 0.05 || rateLimitStore.size >= MAX_RATE_LIMIT_ENTRIES) {
    cleanupRateLimitStore();
  }

  // If still over limit after cleanup, deny new entries but allow existing
  if (rateLimitStore.size >= MAX_RATE_LIMIT_ENTRIES && !existing) {
    return {
      allowed: false,
      remaining: 0,
      resetIn: 60, // Suggest retry in 60 seconds
    };
  }

  if (!existing || existing.resetAt <= now) {
    // New window
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetIn: Math.ceil(windowMs / 1000),
    };
  }

  if (existing.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetIn: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  existing.count++;
  return {
    allowed: true,
    remaining: maxRequests - existing.count,
    resetIn: Math.ceil((existing.resetAt - now) / 1000),
  };
}

function cleanupRateLimitStore(): void {
  const now = Date.now();
  // Clean expired entries
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }

  // If still over 80% capacity, remove oldest entries
  if (rateLimitStore.size > MAX_RATE_LIMIT_ENTRIES * 0.8) {
    const entries = Array.from(rateLimitStore.entries())
      .sort((a, b) => a[1].resetAt - b[1].resetAt);
    const toRemove = Math.floor(entries.length * 0.2); // Remove 20% oldest
    for (let i = 0; i < toRemove; i++) {
      rateLimitStore.delete(entries[i][0]);
    }
  }
}

/**
 * Distributed rate limiter using Redis (Upstash) for serverless compatibility.
 * Falls back to in-memory checkRateLimit if Redis is unavailable.
 */
export async function checkRateLimitDistributed(
  key: string,
  options: { maxRequests?: number; windowMs?: number } = {}
): Promise<RateLimitResult> {
  const { maxRequests = 2, windowMs = 60000 } = options;

  try {
    const { getStore } = await import("@/services/distributed-state");
    const store = getStore();
    const redisKey = `rl:${key}`;
    const count = await store.incr(redisKey, windowMs);
    const resetIn = Math.ceil(windowMs / 1000);

    if (count > maxRequests) {
      return { allowed: false, remaining: 0, resetIn };
    }
    return { allowed: true, remaining: maxRequests - count, resetIn };
  } catch {
    // Fallback to in-memory if Redis unavailable
    return checkRateLimit(key, options);
  }
}
