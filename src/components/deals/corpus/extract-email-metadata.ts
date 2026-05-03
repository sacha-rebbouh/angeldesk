/**
 * Pure utility: best-effort extraction of From/Subject/Date and quoted-thread
 * splitting from a pasted email blob.
 *
 * Intended to run client-side at paste time so the EmailForm can pre-fill
 * fields. The function never throws and never relies on the DOM — it only
 * does string analysis. Anything it cannot detect simply comes back as null,
 * letting the form fall back to manual entry.
 *
 * Out of scope (Phase 2):
 *   - Stripping signatures (would need a heuristic library like
 *     email-reply-parser).
 *   - Parsing .eml MIME boundaries.
 *   - Decoding quoted-printable / base64 body parts.
 */

// Whitelist of real HTML tags. Avoids false positives on email-style angle-bracket
// constructs like `<jean@example.com>` (a regular plain-text email signature).
const HTML_DETECTION_PATTERN = /<\/?(?:p|div|span|br|html|body|head|table|tbody|thead|tr|td|th|li|ul|ol|h[1-6]|a|strong|em|b|i|font|blockquote|article|section|header|footer|nav|main|aside|figure|figcaption|img|picture|hr|pre|code|small|sub|sup|mark|del|ins|q|cite|abbr|time|address|center|style|script|iframe|object|embed)\b/i;

const DANGEROUS_BLOCK_PATTERNS = [
  /<script\b[\s\S]*?<\/script\s*>/gi,
  /<style\b[\s\S]*?<\/style\s*>/gi,
  /<iframe\b[\s\S]*?<\/iframe\s*>/gi,
  /<object\b[\s\S]*?<\/object\s*>/gi,
  /<embed\b[\s\S]*?<\/embed\s*>/gi,
  /<(script|style|iframe|object|embed)\b[^>]*\/?>/gi,
];

const DANGEROUS_ATTR_PATTERNS = [
  / on[a-z]+\s*=\s*"[^"]*"/gi,
  / on[a-z]+\s*=\s*'[^']*'/gi,
  / on[a-z]+\s*=\s*[^\s>]+/gi,
  /\bjavascript:[^"'\s>]*/gi,
];

const BLOCK_LEVEL_TAG_PATTERN = /<\/?(?:br|p|div|li|ul|ol|tr|td|th|h[1-6]|blockquote|pre|hr|article|section|table|tbody|thead)(?:\s[^>]*)?\/?>/gi;

const HTML_ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&copy;": "©",
  "&reg;": "®",
  "&trade;": "™",
  "&hellip;": "…",
  "&mdash;": "—",
  "&ndash;": "–",
  "&laquo;": "«",
  "&raquo;": "»",
  "&deg;": "°",
  "&euro;": "€",
};

function applyDefensiveStrip(input: string): string {
  let out = input;
  for (const pattern of DANGEROUS_BLOCK_PATTERNS) out = out.replace(pattern, "");
  for (const pattern of DANGEROUS_ATTR_PATTERNS) out = out.replace(pattern, "");
  return out;
}

function decodeEntities(input: string): string {
  return input.replace(/&[a-zA-Z]+;|&#\d+;/g, (entity) => {
    if (HTML_ENTITY_MAP[entity]) return HTML_ENTITY_MAP[entity];
    const numeric = entity.match(/^&#(\d+);$/);
    if (numeric) {
      const code = Number.parseInt(numeric[1] ?? "", 10);
      if (Number.isFinite(code) && code > 0 && code < 0x10ffff) return String.fromCodePoint(code);
    }
    return entity;
  });
}

/**
 * Convert HTML to plain text via a small regex pipeline (no DOM, no third
 * party). Same shape as the server-side sanitize in text-ingestion.ts —
 * keeping the two implementations in sync is by convention; if drift
 * becomes painful we should extract a shared module.
 */
export function htmlToPlainText(html: string): string {
  let out = applyDefensiveStrip(html);
  out = out.replace(BLOCK_LEVEL_TAG_PATTERN, "\n");
  out = out.replace(/<[^>]+>/g, "");
  out = applyDefensiveStrip(out);
  out = decodeEntities(out);
  out = out.replace(/\r\n?/g, "\n");
  out = out.replace(/[ \t]+\n/g, "\n");
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

// ---------------------------------------------------------------------------
// Header parsing
// ---------------------------------------------------------------------------

interface HeaderMatch {
  value: string;
  endIndex: number;
}

interface HeaderPattern {
  // `^` anchored or after newline.
  prefix: RegExp;
}

const HEADER_PATTERNS = {
  from: { prefix: /(?:^|\n)\s*(?:From|De|Expéditeur)\s*:\s*([^\n]+)/i },
  subject: { prefix: /(?:^|\n)\s*(?:Subject|Objet|Sujet)\s*:\s*([^\n]+)/i },
  to: { prefix: /(?:^|\n)\s*(?:To|À|A)\s*:\s*([^\n]+)/i },
  date: { prefix: /(?:^|\n)\s*(?:Sent|Date|Envoyé|Envoye|On)\s*:\s*([^\n]+)/i },
} satisfies Record<string, HeaderPattern>;

function findHeaderValue(text: string, pattern: HeaderPattern): HeaderMatch | null {
  const match = pattern.prefix.exec(text);
  if (!match || match.index === undefined) return null;
  const value = (match[1] ?? "").trim();
  if (!value) return null;
  return { value, endIndex: match.index + match[0].length };
}

// ---------------------------------------------------------------------------
// Date parsing — try Date.parse first, then a few common locale forms.
// ---------------------------------------------------------------------------

const FRENCH_MONTHS: Record<string, number> = {
  janvier: 0,
  janv: 0,
  jan: 0,
  février: 1,
  fevrier: 1,
  févr: 1,
  fevr: 1,
  fev: 1,
  mars: 2,
  avril: 3,
  avr: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  juil: 6,
  août: 7,
  aout: 7,
  septembre: 8,
  sept: 8,
  octobre: 9,
  oct: 9,
  novembre: 10,
  nov: 10,
  décembre: 11,
  decembre: 11,
  déc: 11,
  dec: 11,
};

export function parseEmailDate(raw: string): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Direct parse covers RFC 2822, ISO, and most en-US locale strings.
  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) return direct;

  // French locale e.g. "lun. 24 avr. 2026 09:42" / "le 24 avril 2026 à 9 h 42"
  // The à/À chars are NOT word chars in JS regex, so \b doesn't isolate them.
  // We strip them globally before matching so the day/year/time pattern can stitch.
  const frMatch = trimmed
    .toLowerCase()
    .replace(/[àÀ]/g, " ")
    .replace(/\ble\b/g, " ")
    .replace(/h\s*/gi, ":")
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .match(
      /\b(\d{1,2})\s+([a-zéèêûâîç]+)\s+(\d{4})(?:[\s,]+(\d{1,2})\s*:\s*(\d{1,2})(?:\s*:\s*(\d{1,2}))?)?/
    );
  if (frMatch) {
    const day = Number.parseInt(frMatch[1] ?? "", 10);
    const monthKey = (frMatch[2] ?? "").replace(/\.$/, "");
    const month = FRENCH_MONTHS[monthKey];
    const year = Number.parseInt(frMatch[3] ?? "", 10);
    const hour = frMatch[4] ? Number.parseInt(frMatch[4], 10) : 0;
    const minute = frMatch[5] ? Number.parseInt(frMatch[5], 10) : 0;
    const second = frMatch[6] ? Number.parseInt(frMatch[6], 10) : 0;
    if (Number.isFinite(day) && month != null && Number.isFinite(year)) {
      const date = new Date(Date.UTC(year, month, day, hour, minute, second));
      if (!Number.isNaN(date.getTime())) return date;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Quoted thread splitter
// ---------------------------------------------------------------------------

const QUOTED_THREAD_DELIMITERS: RegExp[] = [
  /(?:^|\n)On\s.+\swrote:\s*\n/, // Gmail EN
  /(?:^|\n)Le\s.+\sa\s+écrit\s*:\s*\n/, // Gmail FR
  /(?:^|\n)-----+\s*Original Message\s*-----+/i, // Outlook EN
  /(?:^|\n)-----+\s*Message d'origine\s*-----+/i, // Outlook FR
  /(?:^|\n)_{4,}\s*\n\s*From:/, // Outlook plain underscore divider
  /(?:^|\n)De\s*:\s*[^\n]+\n\s*(?:Envoyé|Date)\s*:/, // Outlook FR header block
  /(?:^|\n)From\s*:\s*[^\n]+\n\s*Sent\s*:/, // Outlook EN header block
];

function splitOnFirstDelimiter(text: string, delimiters: RegExp[]): { head: string; quoted: string | null } {
  let earliest: { index: number; matchLength: number } | null = null;
  for (const delimiter of delimiters) {
    const match = delimiter.exec(text);
    if (!match || match.index === undefined) continue;
    if (earliest === null || match.index < earliest.index) {
      earliest = { index: match.index, matchLength: match[0].length };
    }
  }
  if (earliest === null) return { head: text, quoted: null };
  return {
    head: text.slice(0, earliest.index),
    quoted: text.slice(earliest.index).replace(/^\n+/, ""),
  };
}

// ---------------------------------------------------------------------------
// Public extractor
// ---------------------------------------------------------------------------

export interface ExtractedEmailMetadata {
  from: string | null;
  to: string | null;
  subject: string | null;
  sentAt: Date | null;
  body: string;
  quotedThread: string | null;
  /** Original input format detected (informational). */
  detectedFormat: "html" | "text";
}

export function extractEmailMetadata(rawInput: string): ExtractedEmailMetadata {
  const normalized = (rawInput ?? "").replace(/\r\n?/g, "\n");
  const detectedFormat: "html" | "text" = HTML_DETECTION_PATTERN.test(normalized) ? "html" : "text";
  const plain = detectedFormat === "html" ? htmlToPlainText(normalized) : normalized;

  const from = findHeaderValue(plain, HEADER_PATTERNS.from)?.value ?? null;
  const subject = findHeaderValue(plain, HEADER_PATTERNS.subject)?.value ?? null;
  const to = findHeaderValue(plain, HEADER_PATTERNS.to)?.value ?? null;
  const dateMatch = findHeaderValue(plain, HEADER_PATTERNS.date);
  const sentAt = dateMatch ? parseEmailDate(dateMatch.value) : null;

  // Determine where the headers end so we can isolate the body. We take the
  // furthest of the matched header end-indexes; if none matched we keep the
  // whole plain text as the body.
  const headerEnd = Math.max(
    findHeaderValue(plain, HEADER_PATTERNS.from)?.endIndex ?? 0,
    findHeaderValue(plain, HEADER_PATTERNS.subject)?.endIndex ?? 0,
    findHeaderValue(plain, HEADER_PATTERNS.to)?.endIndex ?? 0,
    findHeaderValue(plain, HEADER_PATTERNS.date)?.endIndex ?? 0
  );

  const afterHeaders = headerEnd > 0 ? plain.slice(headerEnd) : plain;
  const { head, quoted } = splitOnFirstDelimiter(afterHeaders, QUOTED_THREAD_DELIMITERS);

  const body = head.replace(/^\s+/, "").replace(/\s+$/, "");
  const quotedThread = quoted ? quoted.trim() : null;

  return {
    from: from ?? null,
    to: to ?? null,
    subject: subject ?? null,
    sentAt,
    body,
    quotedThread,
    detectedFormat,
  };
}
