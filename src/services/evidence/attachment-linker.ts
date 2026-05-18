/**
 * Phase 4 — Attachment linker.
 *
 * Detects attachment filenames mentioned in an email's extractedText and
 * matches them against documents in the same deal. Emits ATTACHMENT_RELATION
 * EvidenceSignal rows on the CHILD documents (the matched attachments).
 *
 * Storage scope: signals are written on the CHILD doc with:
 *   - signalScopeKey = "source_metadata" (derived from the email's parsed body,
 *     not from the child's own extraction run).
 *   - extractionRunId = null (the run belongs to the EMAIL doc, not the child;
 *     using a run-id from a different document would violate the composite FK
 *     (extractionRunId, documentId) → DocumentExtractionRun(id, documentId)).
 *   - reportedAt = email.sourceDate (the "transmitted at" timestamp).
 *
 * Invariant (Codex Phase 4 gate):
 *   - Cap table asOf=2024-09-18 and ATTACHMENT_RELATION.reportedAt=2026-04-22
 *     coexist. The signal does NOT promote to Document.sourceDate (its kind
 *     is intentionally absent from PROMOTION_KINDS_BY_DOC_TYPE).
 *
 * Cross-tenant safety: matching candidates are filtered by `dealId` —
 * the email's deal — so an email in Deal A cannot link to a doc in Deal B.
 *
 * ⚠️ Phase 4.2 (Codex round 13 P1) — signal-only by design.
 * We intentionally do NOT mutate Document.corpusParentDocumentId from this
 * service. That field is part of the F62 lineage key
 *   (dealId, name, corpusParentDocumentId)
 * used by upload route + extraction-runs to identify the family a re-upload
 * belongs to; mutating it post-creation would:
 *   - break the "old versions stay in old lineage" invariant,
 *   - cause future re-uploads with the same (dealId, name) to land in a
 *     different lineage than expected,
 *   - clash with the immutability assumption in extraction-runs:948.
 *
 * Phase 5 (prelude agent + corpus read-path) must therefore READ
 * ATTACHMENT_RELATION signals wherever Document.corpusParentDocumentId is
 * read today (base-agent.ts:987, corpus/index.ts:103, deal detail UI, etc.)
 * and surface the auto-detected link alongside the manually-set one.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { createEvidenceSignal } from "@/services/evidence-signals/create-signal";

export const ATTACHMENT_LINKER_VERSION = "attachment-linker@2026-05-18-001";

const ATTACHMENT_EXTENSIONS = [
  "pdf", "png", "jpg", "jpeg", "gif", "tiff", "tif", "bmp", "webp",
  "xlsx", "xls", "xlsm", "csv",
  "docx", "doc", "odt", "rtf", "txt",
  "pptx", "ppt", "key", "odp",
  "zip", "rar", "7z",
  "eml", "msg",
] as const;

// Two detection patterns (Codex Phase 4 first-pass):
//
//   STANDARD — word-boundary filename without spaces.
//     Matches "Pitch.pdf", "BP.xlsx", "Term-sheet.docx" in any context.
//
//   GMAIL_LISTING — filenames that contain SPACES, anchored on their line
//     and followed by a size suffix (Gmail attachment-list format).
//     Matches "Table de capi Septembre 2024 signeģe.png  136K".
//     Without this, the Avekapeti gate ("cap table linké") fails because the
//     filename has spaces and STANDARD only captures the last word ("signeģe.png").
//
const ATTACHMENT_NAME_REGEX = new RegExp(
  `([^\\s/\\\\<>"'|:?*]+\\.(?:${ATTACHMENT_EXTENSIONS.join("|")}))`,
  "gi"
);
// Gmail-listing requires an explicit size suffix (e.g. "  136K") after the
// filename to recognize multi-word names. Without this guard, a bare line like
// "Voir signature.jpg" would over-capture. If a doc with spaces is mentioned
// in prose without a size suffix, the standard regex (pass 2) still catches
// the basename — Phase 4 first cut covers Gmail-style listings only.
const ATTACHMENT_GMAIL_LISTING_REGEX = new RegExp(
  `(^|\\n)\\s{0,4}([^\\n<>"'|:?*]{1,200}?\\.(?:${ATTACHMENT_EXTENSIONS.join("|")}))(?=\\s+\\d+\\s*[KMGkmg]\\b)`,
  "gim"
);

// Common false-positive matches we never want to link (URL paths, generic
// templates from boilerplate, etc.). Conservative list — extend only after
// observing real false positives.
const GENERIC_FILENAMES = new Set([
  "image.png", "image.jpg", "image.jpeg",
  "document.pdf", "untitled.pdf",
  "logo.png", "logo.jpg", "logo.jpeg",
  "signature.png", "signature.jpg",
]);

export interface AttachmentCandidate {
  /** The raw filename string as detected in the email text. */
  rawName: string;
  /** Lower-cased + diacritics-stripped name used for matching. */
  normalized: string;
  /** Char offset of the detection inside the email text. */
  charOffset: number;
}

export interface AttachmentMatch {
  childDocumentId: string;
  childDocumentName: string;
  attachmentNameInEmail: string;
  attachmentCharOffset: number;
  matchMethod: "exact" | "normalized";
  matchScore: number;
}

export interface LinkEmailAttachmentsInput {
  emailDocumentId: string;
  emailExtractedText: string;
  emailDealId: string;
}

/**
 * Stage 1 — pure detection. Returns deduped candidates in document order.
 */
export function detectAttachmentNames(emailExtractedText: string): AttachmentCandidate[] {
  const candidates = new Map<string, AttachmentCandidate>();

  // Pass 1: Gmail-listing format (multi-word filenames followed by size).
  ATTACHMENT_GMAIL_LISTING_REGEX.lastIndex = 0;
  let g: RegExpExecArray | null;
  while ((g = ATTACHMENT_GMAIL_LISTING_REGEX.exec(emailExtractedText)) !== null) {
    const linePrefix = g[1] ?? "";
    const rawName = (g[2] ?? "").trim();
    if (!rawName) continue;
    const normalized = normalizeFilename(rawName);
    if (!normalized) continue;
    if (GENERIC_FILENAMES.has(normalized)) continue;
    if (candidates.has(normalized)) continue;
    candidates.set(normalized, {
      rawName,
      normalized,
      charOffset: (g.index ?? 0) + linePrefix.length,
    });
  }

  // Pass 2: standard word-boundary filenames (no spaces).
  ATTACHMENT_NAME_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTACHMENT_NAME_REGEX.exec(emailExtractedText)) !== null) {
    const rawName = m[1];
    const matchIndex = m.index ?? 0;
    // Codex round 12 P2 — URL/path context guard: reject "https://x.com/Pitch.pdf"
    // and similar. The standard regex captures "Pitch.pdf" after the "/", so we
    // check the char just before the match.
    if (isInsideUrlOrPath(emailExtractedText, matchIndex)) continue;
    const normalized = normalizeFilename(rawName);
    if (!normalized) continue;
    if (GENERIC_FILENAMES.has(normalized)) continue;
    if (candidates.has(normalized)) continue;
    // Skip if a Gmail-listing capture already includes this short filename
    // as its suffix (e.g. "signeģe.png" inside "Table … signeģe.png").
    const isSuffixOfLongerCandidate = [...candidates.values()].some(
      (c) => c.normalized !== normalized && c.normalized.endsWith(normalized)
    );
    if (isSuffixOfLongerCandidate) continue;
    candidates.set(normalized, {
      rawName,
      normalized,
      charOffset: matchIndex,
    });
  }

  return [...candidates.values()];
}

/**
 * Stage 2 — match candidates against documents in the same deal.
 *
 * Matching rules:
 *   - exact (case-insensitive): score 1.0, method "exact"
 *   - normalized (diacritics + spacing/case stripped): score 0.95, method "normalized"
 *   - no fuzzy/Levenshtein in Phase 4 (avoid false positives; revisit if needed)
 *
 * The email document itself is excluded from candidate matches.
 */
export async function findAttachmentMatches(
  prisma: PrismaClient | Prisma.TransactionClient,
  params: {
    emailDocumentId: string;
    emailDealId: string;
    candidates: AttachmentCandidate[];
  }
): Promise<AttachmentMatch[]> {
  if (params.candidates.length === 0) return [];

  // Load all documents in the deal once, then match in-memory. Deals rarely
  // have more than a few dozen docs, so this is cheaper than N queries.
  //
  // Codex round 12 P1 — deterministic filter:
  //   isLatest: true                    skip deprecated versions (F62)
  //   processingStatus: { not: FAILED }  skip failed-extraction rows
  //   orderBy: [uploadedAt asc, id asc]  stable ordering when two docs share a
  //                                      filename (rare but possible: re-upload,
  //                                      restored draft); we keep the oldest by
  //                                      upload time (FIRST wins via map.set
  //                                      below — the oldest "won the name").
  const dealDocs = await prisma.document.findMany({
    where: {
      dealId: params.emailDealId,
      id: { not: params.emailDocumentId },
      isLatest: true,
      processingStatus: { not: "FAILED" },
    },
    select: { id: true, name: true },
    orderBy: [{ uploadedAt: "asc" }, { id: "asc" }],
  });

  const byExactLower = new Map<string, { id: string; name: string }>();
  const byNormalized = new Map<string, { id: string; name: string }>();
  for (const doc of dealDocs) {
    const lower = doc.name.toLowerCase();
    const normalized = normalizeFilename(doc.name);
    // First wins (deterministic via orderBy) — do NOT overwrite on collision.
    if (!byExactLower.has(lower)) byExactLower.set(lower, doc);
    if (!byNormalized.has(normalized)) byNormalized.set(normalized, doc);
  }

  const matches: AttachmentMatch[] = [];
  const used = new Set<string>(); // childDocumentId already matched once
  for (const candidate of params.candidates) {
    const exact = byExactLower.get(candidate.rawName.toLowerCase());
    if (exact && !used.has(exact.id)) {
      matches.push({
        childDocumentId: exact.id,
        childDocumentName: exact.name,
        attachmentNameInEmail: candidate.rawName,
        attachmentCharOffset: candidate.charOffset,
        matchMethod: "exact",
        matchScore: 1.0,
      });
      used.add(exact.id);
      continue;
    }
    const normalized = byNormalized.get(candidate.normalized);
    if (normalized && !used.has(normalized.id)) {
      matches.push({
        childDocumentId: normalized.id,
        childDocumentName: normalized.name,
        attachmentNameInEmail: candidate.rawName,
        attachmentCharOffset: candidate.charOffset,
        matchMethod: "normalized",
        matchScore: 0.95,
      });
      used.add(normalized.id);
      continue;
    }
  }
  return matches;
}

export interface PersistAttachmentRelationsInput {
  emailDocumentId: string;
  emailDealId: string;
  emailDocumentVersion: number;
  emailSourceDate: Date | null;
  matches: AttachmentMatch[];
}

export interface PersistAttachmentRelationsResult {
  persisted: number;
  deduplicated: number;
}

/**
 * Stage 3 — persist matches as ATTACHMENT_RELATION signals on each child doc.
 */
export async function persistAttachmentRelations(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: PersistAttachmentRelationsInput
): Promise<PersistAttachmentRelationsResult> {
  let persisted = 0;
  let deduplicated = 0;

  for (const match of input.matches) {
    // Look up the child's version (we need it for the signal's documentVersion).
    const child = await prisma.document.findUnique({
      where: { id: match.childDocumentId },
      select: { version: true, dealId: true },
    });
    // Cross-tenant guard (defensive — findAttachmentMatches already filters by dealId).
    if (!child || child.dealId !== input.emailDealId) continue;

    const outcome = await createEvidenceSignal(prisma, {
      dealId: input.emailDealId,
      documentId: match.childDocumentId,
      documentVersion: child.version,
      signalScopeKey: "source_metadata",
      extractionRunId: null,
      extractorVersion: ATTACHMENT_LINKER_VERSION,
      sourceTextHash: null,
      kind: "ATTACHMENT_RELATION",
      valueJson: {
        emailDocId: input.emailDocumentId,
        attachmentName: match.attachmentNameInEmail,
        matchMethod: match.matchMethod,
        matchScore: match.matchScore,
        emailSourceDate: input.emailSourceDate?.toISOString() ?? null,
      },
      reportedAt: input.emailSourceDate,
      precision: input.emailSourceDate ? "DAY" : "UNKNOWN",
      confidence: match.matchMethod === "exact" ? "HIGH" : "MEDIUM",
      sourceMethod: "DETERMINISTIC",
      evidenceText: null,
      pageNumber: null,
      sheetName: null,
      charOffset: match.attachmentCharOffset,
      metadata: {
        parserDebug: {
          patternId: `attachment-linker-${match.matchMethod}`,
          matchCount: 1,
        },
      },
    });

    if (outcome.deduplicated) deduplicated += 1;
    else persisted += 1;

    // Codex round 13 P1 — DO NOT mutate Document.corpusParentDocumentId here.
    // That field is part of the F62 lineage key and must remain immutable
    // post-creation. The signal is the sole surface for now; Phase 5 will
    // surface it alongside the manually-set parent at read-time.
    // See the docstring at the top of this file.
  }

  return { persisted, deduplicated };
}

/**
 * One-shot orchestrator: detect → match → persist.
 *
 * Called by runEvidenceForDocument when sourceKind=EMAIL.
 */
export async function linkEmailAttachments(
  prisma: PrismaClient | Prisma.TransactionClient,
  params: {
    emailDocumentId: string;
    emailDealId: string;
    emailDocumentVersion: number;
    emailExtractedText: string;
    emailSourceDate: Date | null;
  }
): Promise<PersistAttachmentRelationsResult & { detectedCandidates: number; matched: number }> {
  const candidates = detectAttachmentNames(params.emailExtractedText);
  if (candidates.length === 0) {
    return { persisted: 0, deduplicated: 0, detectedCandidates: 0, matched: 0 };
  }
  const matches = await findAttachmentMatches(prisma, {
    emailDocumentId: params.emailDocumentId,
    emailDealId: params.emailDealId,
    candidates,
  });
  const persistResult = await persistAttachmentRelations(prisma, {
    emailDocumentId: params.emailDocumentId,
    emailDealId: params.emailDealId,
    emailDocumentVersion: params.emailDocumentVersion,
    emailSourceDate: params.emailSourceDate,
    matches,
  });
  return {
    ...persistResult,
    detectedCandidates: candidates.length,
    matched: matches.length,
  };
}

// ============================================================
// Helpers
// ============================================================
function normalizeFilename(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * URL/path context detection. We reject matches whose immediate prefix looks
 * like part of a URL or filesystem path:
 *   - char just before is '/' or '\' (most URLs/paths)
 *   - "://" appears in the 20 chars just before the match (longer URLs where
 *     the file is at the very end of an URL path)
 */
function isInsideUrlOrPath(text: string, matchIndex: number): boolean {
  if (matchIndex <= 0) return false;
  const charBefore = text[matchIndex - 1];
  if (charBefore === "/" || charBefore === "\\") return true;
  const lookbackStart = Math.max(0, matchIndex - 60);
  const lookback = text.slice(lookbackStart, matchIndex);
  if (lookback.includes("://")) return true;
  return false;
}
