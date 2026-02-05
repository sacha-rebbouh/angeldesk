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
];

/**
 * Check if text contains suspicious prompt injection patterns
 */
export function detectPromptInjection(text: string): {
  isSuspicious: boolean;
  patterns: string[];
} {
  const detectedPatterns: string[] = [];

  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(text)) {
      detectedPatterns.push(pattern.source);
    }
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
    blockOnSuspicious = false, // Default false for backward compatibility
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
export const cuidSchema = z
  .string()
  .min(21, "ID too short")
  .max(30, "ID too long")
  .regex(/^c[a-z0-9]{20,29}$/, "Invalid ID format");

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
