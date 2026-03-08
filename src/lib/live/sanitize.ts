// ============================================================================
// Live Coaching — Shared Sanitization Utilities
// ============================================================================

const MAX_UTTERANCE_LENGTH = 2000;

/**
 * Sanitize transcript text before injecting into LLM prompts.
 * Strips common prompt injection delimiters and enforces max length.
 * This is lighter than the full sanitizeForLLM (which throws on suspicious
 * patterns) because transcript text may legitimately contain flagged phrases.
 */
export function sanitizeTranscriptText(text: string): string {
  return text
    .replace(/```/g, "")
    .replace(/<\/?system>/gi, "")
    .replace(/<\/?user>/gi, "")
    .replace(/<\/?assistant>/gi, "")
    .replace(/\[INST\]/gi, "")
    .replace(/\[\/INST\]/gi, "")
    .slice(0, MAX_UTTERANCE_LENGTH);
}
