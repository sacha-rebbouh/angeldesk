/**
 * Streaming JSON Parser
 *
 * Parses JSON incrementally as tokens arrive from LLM streaming.
 * Handles truncation by detecting incomplete JSON and supporting continuation.
 *
 * Key features:
 * - Tracks open braces/brackets during streaming
 * - Detects truncation (finishReason: "length")
 * - Returns partial valid data when truncation occurs
 * - Supports retry with continuation prompt
 */

export interface StreamingParserState {
  /** Raw accumulated content */
  content: string;
  /** Number of unclosed braces */
  openBraces: number;
  /** Number of unclosed brackets */
  openBrackets: number;
  /** Whether we're inside a string */
  inString: boolean;
  /** Previous character was escape */
  escapeNext: boolean;
  /** Index where JSON object starts */
  jsonStartIndex: number;
  /** Whether JSON has started */
  jsonStarted: boolean;
  /** Max depth reached (for validation) */
  maxDepth: number;
  /** Complete top-level values extracted */
  completedValues: string[];
}

export interface StreamingParserResult<T> {
  /** Parsed data (may be partial if truncated) */
  data: T | null;
  /** Whether the JSON was truncated */
  wasTruncated: boolean;
  /** Raw content for continuation */
  rawContent: string;
  /** Continuation prompt to send for retry */
  continuationPrompt: string | null;
  /** Number of tokens consumed */
  tokensConsumed: number;
  /** Partial content after last complete value (for continuation) */
  partialContent: string;
}

/**
 * Creates initial parser state
 */
export function createParserState(): StreamingParserState {
  return {
    content: "",
    openBraces: 0,
    openBrackets: 0,
    inString: false,
    escapeNext: false,
    jsonStartIndex: -1,
    jsonStarted: false,
    maxDepth: 0,
    completedValues: [],
  };
}

/**
 * Process a single token and update parser state
 */
export function processToken(state: StreamingParserState, token: string): void {
  for (const char of token) {
    state.content += char;

    if (state.escapeNext) {
      state.escapeNext = false;
      continue;
    }

    if (char === "\\") {
      state.escapeNext = true;
      continue;
    }

    if (char === '"' && !state.escapeNext) {
      state.inString = !state.inString;
      continue;
    }

    if (state.inString) continue;

    if (char === "{") {
      if (!state.jsonStarted) {
        state.jsonStartIndex = state.content.length - 1;
        state.jsonStarted = true;
      }
      state.openBraces++;
      state.maxDepth = Math.max(state.maxDepth, state.openBraces + state.openBrackets);
    } else if (char === "}") {
      state.openBraces--;
    } else if (char === "[") {
      if (!state.jsonStarted) {
        state.jsonStartIndex = state.content.length - 1;
        state.jsonStarted = true;
      }
      state.openBrackets++;
      state.maxDepth = Math.max(state.maxDepth, state.openBraces + state.openBrackets);
    } else if (char === "]") {
      state.openBrackets--;
    }
  }
}

/**
 * Check if JSON is complete (all braces/brackets closed)
 */
export function isJSONComplete(state: StreamingParserState): boolean {
  return (
    state.jsonStarted &&
    state.openBraces === 0 &&
    state.openBrackets === 0 &&
    !state.inString
  );
}

/**
 * Check if JSON appears to be truncated
 */
export function isTruncated(state: StreamingParserState): boolean {
  return (
    state.jsonStarted &&
    (state.openBraces > 0 || state.openBrackets > 0 || state.inString)
  );
}

/**
 * Extract JSON from content, handling markdown code blocks
 */
function extractJSONFromContent(content: string): string {
  // Try to extract from markdown code blocks
  const codeBlockPatterns = [
    /```(?:json)?\s*([\s\S]*?)```/,
    /`{3,}(?:json)?\s*([\s\S]*?)`{3,}/,
    /~~~(?:json)?\s*([\s\S]*?)~~~/,
  ];

  for (const pattern of codeBlockPatterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      const extracted = match[1].trim();
      if (extracted.startsWith("{") || extracted.startsWith("[")) {
        return extracted;
      }
    }
  }

  // Find first { or [ in content
  const braceIdx = content.indexOf("{");
  const bracketIdx = content.indexOf("[");

  if (braceIdx === -1 && bracketIdx === -1) {
    return content;
  }

  const startIdx =
    braceIdx === -1
      ? bracketIdx
      : bracketIdx === -1
        ? braceIdx
        : Math.min(braceIdx, bracketIdx);

  return content.substring(startIdx);
}

/**
 * Attempt to repair truncated JSON by closing open structures
 */
function repairTruncatedJSON(content: string): string | null {
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escapeNext = false;

  // Count open structures
  for (const char of content) {
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === "\\") {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") openBraces++;
    else if (char === "}") openBraces--;
    else if (char === "[") openBrackets++;
    else if (char === "]") openBrackets--;
  }

  // If we're in a string, close it
  let repaired = content;
  if (inString) {
    // Find last quote and close the string
    const lastQuote = repaired.lastIndexOf('"');
    if (lastQuote > 0) {
      // Check what comes before - if it's a key, we need a value
      const beforeQuote = repaired.substring(0, lastQuote);
      const afterQuote = repaired.substring(lastQuote);

      // If string was being written and got cut off, just close it
      if (afterQuote.length > 1) {
        repaired = repaired + '"';
      }
    } else {
      repaired = repaired + '"';
    }
    // Recount after string fix
    openBraces = 0;
    openBrackets = 0;
    inString = false;
    escapeNext = false;
    for (const char of repaired) {
      if (escapeNext) { escapeNext = false; continue; }
      if (char === "\\") { escapeNext = true; continue; }
      if (char === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (char === "{") openBraces++;
      else if (char === "}") openBraces--;
      else if (char === "[") openBrackets++;
      else if (char === "]") openBrackets--;
    }
  }

  // Remove trailing comma, colon, or whitespace
  repaired = repaired.replace(/[,:\s]+$/, "");

  // Close remaining structures
  repaired += "]".repeat(Math.max(0, openBrackets));
  repaired += "}".repeat(Math.max(0, openBraces));

  // Validate
  try {
    JSON.parse(repaired);
    return repaired;
  } catch {
    return null;
  }
}

/**
 * Build continuation prompt for truncated response
 */
export function buildContinuationPrompt(
  partialContent: string,
  originalPrompt: string
): string {
  // Find the last complete key-value pair or array element
  // This helps the LLM continue from a clean point

  // Get last 500 chars of partial content for context
  const contextWindow = partialContent.slice(-500);

  return `CONTINUATION REQUEST - Your previous response was cut off due to length limits.

Here is the end of your previous response:
\`\`\`
${contextWindow}
\`\`\`

Please CONTINUE your JSON response from EXACTLY where it was cut off.
DO NOT restart or repeat content.
DO NOT include any text before the continuation.
JUST continue the JSON structure from the exact point shown above.

Remember the original request was:
${originalPrompt}`;
}

/**
 * Merge partial JSON responses
 * Handles cases where response was split across multiple calls
 */
export function mergePartialResponses<T>(
  responses: string[]
): T | null {
  if (responses.length === 0) return null;
  if (responses.length === 1) {
    try {
      return JSON.parse(responses[0]) as T;
    } catch {
      return null;
    }
  }

  // Try to merge responses
  // Strategy: Find overlap between end of response N and start of response N+1
  let merged = responses[0];

  for (let i = 1; i < responses.length; i++) {
    const current = responses[i];

    // Try to find overlap
    let overlapFound = false;
    for (let overlapLen = Math.min(100, merged.length); overlapLen > 10; overlapLen--) {
      const endOfMerged = merged.slice(-overlapLen);
      const startOfCurrent = current.slice(0, overlapLen);

      if (endOfMerged === startOfCurrent) {
        // Found overlap - merge without duplication
        merged = merged + current.slice(overlapLen);
        overlapFound = true;
        break;
      }
    }

    if (!overlapFound) {
      // No overlap found - try direct concatenation
      // Remove any incomplete structure at end of merged
      const trimmed = merged.replace(/[,:\s"]+$/, "");
      merged = trimmed + current;
    }
  }

  try {
    return JSON.parse(merged) as T;
  } catch {
    // Try repair
    const repaired = repairTruncatedJSON(merged);
    if (repaired) {
      try {
        return JSON.parse(repaired) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Finalize parser result
 * Call this when streaming is complete or when finishReason indicates truncation
 */
export function finalizeResult<T>(
  state: StreamingParserState,
  finishReason: string | null | undefined,
  originalPrompt: string
): StreamingParserResult<T> {
  const rawJSON = extractJSONFromContent(state.content);
  const wasTruncated = finishReason === "length" || isTruncated(state);

  // Try to parse as-is first
  try {
    const data = JSON.parse(rawJSON) as T;
    return {
      data,
      wasTruncated: false,
      rawContent: state.content,
      continuationPrompt: null,
      tokensConsumed: Math.ceil(state.content.length / 4),
      partialContent: "",
    };
  } catch {
    // Parsing failed - try repair if truncated
    if (wasTruncated) {
      const repaired = repairTruncatedJSON(rawJSON);
      if (repaired) {
        try {
          const data = JSON.parse(repaired) as T;
          return {
            data,
            wasTruncated: true,
            rawContent: state.content,
            continuationPrompt: buildContinuationPrompt(rawJSON, originalPrompt),
            tokensConsumed: Math.ceil(state.content.length / 4),
            partialContent: rawJSON,
          };
        } catch {
          // Repair didn't help
        }
      }
    }

    // Failed completely
    return {
      data: null,
      wasTruncated,
      rawContent: state.content,
      continuationPrompt: wasTruncated
        ? buildContinuationPrompt(rawJSON, originalPrompt)
        : null,
      tokensConsumed: Math.ceil(state.content.length / 4),
      partialContent: rawJSON,
    };
  }
}

/**
 * Streaming JSON Parser class for use with OpenRouter streaming
 */
export class StreamingJSONParser<T> {
  private state: StreamingParserState;
  private originalPrompt: string;

  constructor(originalPrompt: string) {
    this.state = createParserState();
    this.originalPrompt = originalPrompt;
  }

  /**
   * Process incoming token
   */
  processToken(token: string): void {
    processToken(this.state, token);
  }

  /**
   * Check if JSON is complete
   */
  isComplete(): boolean {
    return isJSONComplete(this.state);
  }

  /**
   * Check if JSON appears truncated
   */
  isTruncated(): boolean {
    return isTruncated(this.state);
  }

  /**
   * Get current accumulated content
   */
  getContent(): string {
    return this.state.content;
  }

  /**
   * Get parser state for debugging
   */
  getState(): StreamingParserState {
    return { ...this.state };
  }

  /**
   * Finalize and get result
   */
  finalize(finishReason: string | null | undefined): StreamingParserResult<T> {
    return finalizeResult<T>(this.state, finishReason, this.originalPrompt);
  }

  /**
   * Reset parser for continuation
   */
  reset(): void {
    this.state = createParserState();
  }

  /**
   * Set content directly (for continuation)
   */
  setContent(content: string): void {
    this.state = createParserState();
    for (const char of content) {
      processToken(this.state, char);
    }
  }
}
