import { z } from "zod";

/**
 * Locked-down metadata schema for EvidenceSignal.metadata (Json? clear).
 *
 * Invariant: NEVER OCR excerpts, NEVER full prompts, NEVER raw financial
 * claims, NEVER PII. See docs-private/evidence-engine-phase1-schema.md §3.13.
 *
 * Codex round 4 P1 fix: the previous validator only checked string values
 * for sensitive patterns, so arrays/numbers (e.g. `parserDebug.rawOcr: [...]`,
 * `parserDebug.amountEur: 6_000_000`) silently passed. This rewrite uses:
 *   1. A strict whitelist at the top-level (no unknown keys).
 *   2. A constrained schema for `parserDebug` (only safe keys, only safe types).
 *   3. A deep-walk that checks every key (regardless of value type) AND
 *      every string value against sensitive patterns / length caps.
 */

const SENSITIVE_KEY_PATTERNS = [
  /raw[\s_-]*ocr/i,
  /extracted[\s_-]*text/i,
  /prompt[\s_-]*body/i,
  /full[\s_-]*prompt/i,
  /amount[\s_-]*eur/i,
  /amount[\s_-]*usd/i,
  /amount[\s_-]*amount/i,
  /\bsecret\b/i,
  /\bemail\b/i,
  /\biban\b/i,
];

const SENSITIVE_STRING_PATTERNS = [
  /raw[\s_-]*ocr/i,
  /extracted[\s_-]*text/i,
  /prompt[\s_-]*body/i,
  /full[\s_-]*prompt/i,
];

const MAX_STRING_LENGTH = 200;

type WalkResult = { ok: true } | { ok: false; reason: string };

function deepWalk(node: unknown, path: string[]): WalkResult {
  if (node === null || node === undefined) return { ok: true };

  if (typeof node === "string") {
    if (node.length > MAX_STRING_LENGTH) {
      return { ok: false, reason: `metadata.${path.join(".")} is ${node.length} chars (max ${MAX_STRING_LENGTH}). OCR excerpts / prompts must live in evidenceText (encrypted).` };
    }
    for (const pattern of SENSITIVE_STRING_PATTERNS) {
      if (pattern.test(node)) {
        return { ok: false, reason: `metadata.${path.join(".")}: sensitive content rejected (value matches sensitive pattern). Use evidenceText (encrypted) or valueJson (encrypted).` };
      }
    }
    return { ok: true };
  }

  if (typeof node === "number" || typeof node === "boolean") return { ok: true };

  if (Array.isArray(node)) {
    for (const [index, child] of node.entries()) {
      const result = deepWalk(child, [...path, String(index)]);
      if (!result.ok) return result;
    }
    return { ok: true };
  }

  if (typeof node === "object") {
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      for (const pattern of SENSITIVE_KEY_PATTERNS) {
        if (pattern.test(key)) {
          return { ok: false, reason: `metadata.${[...path, key].join(".")}: sensitive content rejected (key matches sensitive pattern). Use evidenceText (encrypted) or valueJson (encrypted).` };
        }
      }
      const result = deepWalk(child, [...path, key]);
      if (!result.ok) return result;
    }
    return { ok: true };
  }

  return { ok: false, reason: `metadata.${path.join(".")}: unsupported type ${typeof node}.` };
}

// parserDebug is intentionally restricted to a small whitelisted shape — no
// open Record<string, unknown> escape hatch. Add new keys here only after review.
//
// NOTE: there is intentionally NO free-text field here (e.g. "notes",
// "comment", "description"). Any human-readable note about a signal must go
// in evidenceText (encrypted), never in metadata (clear). This guards
// against accidental OCR/PII leaks that the deep-walk sensitive-pattern
// check cannot catch when the text happens to not match the patterns.
// See Codex round 5 P1.
const parserDebugSchema = z
  .object({
    regex: z.string().max(MAX_STRING_LENGTH).optional(),
    patternId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).optional(),
    matchCount: z.number().int().min(0).max(10_000).optional(),
    pageSpan: z.array(z.number().int()).max(50).optional(),
    timingMs: z.number().min(0).max(60_000).optional(),
  })
  .strict();

export const evidenceSignalMetadataSchema = z
  .object({
    modelName: z.string().max(120).optional(),
    promptVersion: z.string().max(80).optional(),
    relatedSignalIds: z.array(z.string().regex(/^c[a-z0-9]{20,32}$/)).max(20).optional(),
    parserDebug: parserDebugSchema.optional(),
    sourceUrl: z.string().url().max(500).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const result = deepWalk(value, []);
    if (!result.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.reason });
    }
  });

export type EvidenceSignalMetadata = z.infer<typeof evidenceSignalMetadataSchema>;
