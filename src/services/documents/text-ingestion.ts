/**
 * Text-based corpus ingestion (emails, notes — anything that arrives as text
 * rather than as a binary file). Mirrors the bookkeeping that
 * /api/documents/upload performs for PDFs/Excel: encrypted storage of the
 * extracted text, a synthetic READY DocumentExtractionRun so the agents can
 * read the artifact via the standard pipeline, and content-hash deduplication.
 *
 * Public input invariants (enforced via Zod):
 *   1. The client never sends `corpusRole`. It is derived server-side from
 *      the presence of `linkedQuestion`.
 *   2. `sourceMetadata` is a strict whitelist; unknown keys are rejected to
 *      prevent prompt injection through user-controlled metadata.
 *   3. When `linkedQuestion.redFlagId` is provided, the caller (route layer)
 *      MUST verify that the referenced RedFlag belongs to the same deal as
 *      the document being ingested. This service trusts that check.
 */

import { Prisma, DocumentType, DocumentSourceKind, CorpusRole, LinkedQuestionSource } from "@prisma/client";
import { z } from "zod";

import { encryptText } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { checkDuplicateDocument, computeContentHash } from "@/services/document-hash";
import {
  buildStructuredDocumentManifest,
  recordDocumentExtractionRun,
  summarizeManifestForLegacyMetrics,
} from "@/services/documents/extraction-runs";

// ---------------------------------------------------------------------------
// Zod schemas (public input contract)
// ---------------------------------------------------------------------------

export const linkedQuestionInputSchema = z.discriminatedUnion("source", [
  z
    .object({
      source: z.literal("RED_FLAG"),
      redFlagId: z.string().cuid(),
      // Snapshot of the question text at link time. We store this verbatim
      // even after the underlying RedFlag is edited or deleted.
      questionText: z.string().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      source: z.literal("QUESTION_TO_ASK"),
      // Optional: the question may originate from a known red flag's
      // questionsToAsk[] array. We don't FK to it (no row to reference) but
      // we keep the parent id as soft metadata when available.
      redFlagId: z.string().cuid().optional(),
      questionText: z.string().min(1).max(2000),
    })
    .strict(),
]);

// Whitelist — any other key is rejected by Zod.
export const sourceMetadataSchema = z
  .object({
    messageId: z.string().max(500).optional(),
    threadId: z.string().max(500).optional(),
    participants: z.array(z.string().max(300)).max(50).optional(),
    to: z.string().max(2000).optional(),
    cc: z.string().max(2000).optional(),
    replyTo: z.string().max(500).optional(),
  })
  .strict();

const baseSchema = z.object({
  dealId: z.string().cuid(),
  type: z.nativeEnum(DocumentType).optional(),
  // PUBLIC INPUT INVARIANT: corpusRole is NOT accepted from clients. It is
  // derived server-side. Adding it here would let a client claim a piece is a
  // diligence response without actually linking it to a question.
  linkedQuestion: linkedQuestionInputSchema.optional(),
  sourceMetadata: sourceMetadataSchema.optional(),
});

export const emailIngestionSchema = baseSchema
  .extend({
    sourceKind: z.literal("EMAIL"),
    subject: z.string().max(500).optional(),
    from: z.string().max(500).optional(),
    to: z.string().max(2000).optional(),
    sentAt: z.string().datetime().optional(),
    receivedAt: z.string().datetime().optional(),
    body: z.string().min(1).max(500_000),
    bodyFormat: z.enum(["text", "html"]).default("text"),
  })
  .strict();

export const noteIngestionSchema = baseSchema
  .extend({
    sourceKind: z.literal("NOTE"),
    title: z.string().max(300).optional(),
    occurredAt: z.string().datetime(),
    participants: z.string().max(1000).optional(),
    noteType: z.enum(["call", "meeting", "founder_answer", "internal"]).default("call"),
    body: z.string().min(1).max(500_000),
  })
  .strict();

export const textIngestionInputSchema = z.discriminatedUnion("sourceKind", [
  emailIngestionSchema,
  noteIngestionSchema,
]);

export type TextIngestionInput = z.infer<typeof textIngestionInputSchema>;
export type LinkedQuestionInput = z.infer<typeof linkedQuestionInputSchema>;

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type TextIngestionResult =
  | {
      kind: "created";
      document: {
        id: string;
        dealId: string;
        name: string;
        type: DocumentType;
        sourceKind: DocumentSourceKind;
        corpusRole: CorpusRole;
        sourceDate: Date | null;
        receivedAt: Date | null;
        sourceAuthor: string | null;
        sourceSubject: string | null;
        linkedQuestionSource: LinkedQuestionSource | null;
        linkedQuestionText: string | null;
        linkedRedFlagId: string | null;
        processingStatus: "COMPLETED";
        extractionQuality: 100;
        mimeType: "text/markdown";
        uploadedAt: Date;
      };
      extractionRunId: string;
    }
  | {
      kind: "duplicate";
      existingDocumentId: string;
      existingDocumentName: string;
      sameDeal: boolean;
    };

// ---------------------------------------------------------------------------
// HTML → text conversion (sanitize-first, no third-party dependency).
//
// We deliberately don't pull turndown/jsdom here: emails/notes are mostly
// flat text with light structure and we only need plain-text output for
// extractedText (the prompt corpus). The LLM doesn't need formatting fidelity;
// it needs a clean, safe payload.
//
// Pipeline:
//   1. Pre-strip dangerous blocks (script, style, iframe, on* attrs, javascript:).
//   2. Replace block tags by newlines (br, p, div, li, h1-6, tr).
//   3. Strip remaining tags.
//   4. Decode common HTML entities.
//   5. Collapse whitespace, trim.
// ---------------------------------------------------------------------------

const DANGEROUS_BLOCK_PATTERNS = [
  /<script\b[\s\S]*?<\/script\s*>/gi,
  /<style\b[\s\S]*?<\/style\s*>/gi,
  /<iframe\b[\s\S]*?<\/iframe\s*>/gi,
  /<object\b[\s\S]*?<\/object\s*>/gi,
  /<embed\b[\s\S]*?<\/embed\s*>/gi,
  // Self-closing or unmatched dangerous tags: drop the opener.
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

export function convertHtmlToText(html: string): string {
  let out = applyDefensiveStrip(html);
  out = out.replace(BLOCK_LEVEL_TAG_PATTERN, "\n");
  // Strip every remaining tag (links collapse to their text content).
  out = out.replace(/<[^>]+>/g, "");
  // Re-apply defensive strip after tag removal in case attributes leaked.
  out = applyDefensiveStrip(out);

  // Decode named entities (basic set covers email content well).
  out = out.replace(/&[a-zA-Z]+;|&#\d+;/g, (entity) => {
    if (HTML_ENTITY_MAP[entity]) return HTML_ENTITY_MAP[entity];
    const numeric = entity.match(/^&#(\d+);$/);
    if (numeric) {
      const code = Number.parseInt(numeric[1] ?? "", 10);
      if (Number.isFinite(code) && code > 0 && code < 0x10ffff) return String.fromCodePoint(code);
    }
    return entity;
  });

  out = out.replace(/\r\n?/g, "\n");
  out = out.replace(/[ \t]+\n/g, "\n");
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

export function normalizeBodyForCorpus(rawBody: string, format: "text" | "html"): string {
  const text = format === "html" ? convertHtmlToText(rawBody) : rawBody;
  return text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

// ---------------------------------------------------------------------------
// Corpus prefix — first lines of extractedText so agents see provenance.
// ---------------------------------------------------------------------------

interface CorpusPrefixContext {
  sourceKind: DocumentSourceKind;
  corpusRole: CorpusRole;
  sourceDate: Date | null;
  receivedAt: Date | null;
  sourceAuthor: string | null;
  sourceSubject: string | null;
  linkedQuestion: LinkedQuestionInput | null;
}

export function buildCorpusPrefix(ctx: CorpusPrefixContext): string {
  const lines: string[] = [];
  lines.push(`[Source: ${ctx.sourceKind.toLowerCase()}]`);
  if (ctx.sourceDate) lines.push(`[Date: ${ctx.sourceDate.toISOString().slice(0, 10)}]`);
  if (ctx.receivedAt && ctx.receivedAt.getTime() !== ctx.sourceDate?.getTime()) {
    lines.push(`[Received: ${ctx.receivedAt.toISOString().slice(0, 10)}]`);
  }
  if (ctx.sourceAuthor) lines.push(`[From: ${ctx.sourceAuthor}]`);
  if (ctx.sourceSubject) lines.push(`[Subject: ${ctx.sourceSubject}]`);
  if (ctx.corpusRole === "DILIGENCE_RESPONSE") lines.push(`[Role: diligence_response]`);
  if (ctx.linkedQuestion) {
    const tag =
      ctx.linkedQuestion.source === "RED_FLAG"
        ? `red flag ${ctx.linkedQuestion.redFlagId}`
        : ctx.linkedQuestion.redFlagId
          ? `question of red flag ${ctx.linkedQuestion.redFlagId}`
          : `open question`;
    lines.push(`[Répond à : "${ctx.linkedQuestion.questionText}" (${tag})]`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Document name derivation
// ---------------------------------------------------------------------------

function deriveDocumentName(input: TextIngestionInput, corpusRole: CorpusRole): string {
  const dateLabel = (date: Date) => date.toISOString().slice(0, 10);
  if (input.sourceKind === "EMAIL") {
    const subject = input.subject?.trim();
    if (subject) return subject.slice(0, 200);
    const sentAt = input.sentAt ? new Date(input.sentAt) : new Date();
    return `Email — ${dateLabel(sentAt)}`;
  }
  // NOTE
  const title = input.title?.trim();
  if (title) return title.slice(0, 200);
  const occurredAt = new Date(input.occurredAt);
  if (corpusRole === "DILIGENCE_RESPONSE" && input.linkedQuestion) {
    return `Réponse — ${input.linkedQuestion.questionText.slice(0, 120)}`;
  }
  return `Note du ${dateLabel(occurredAt)}`;
}

// ---------------------------------------------------------------------------
// Main ingestion entry point.
// ---------------------------------------------------------------------------

export async function ingestTextCorpusItem(input: TextIngestionInput, options: { userId: string }): Promise<TextIngestionResult> {
  const corpusRole: CorpusRole = input.linkedQuestion ? "DILIGENCE_RESPONSE" : "GENERAL";

  // Resolve canonical source dates per kind.
  let sourceDate: Date | null = null;
  let receivedAt: Date | null = null;
  let sourceAuthor: string | null = null;
  let sourceSubject: string | null = null;
  let mergedSourceMetadata: Prisma.InputJsonValue | undefined;

  if (input.sourceKind === "EMAIL") {
    sourceDate = input.sentAt ? new Date(input.sentAt) : null;
    receivedAt = input.receivedAt ? new Date(input.receivedAt) : null;
    sourceAuthor = input.from?.trim() || null;
    sourceSubject = input.subject?.trim() || null;
    if (input.sourceMetadata || input.to) {
      mergedSourceMetadata = {
        ...input.sourceMetadata,
        ...(input.to ? { to: input.to } : {}),
      } as Prisma.InputJsonValue;
    }
  } else {
    // NOTE
    sourceDate = new Date(input.occurredAt);
    sourceSubject = input.title?.trim() || null;
    if (input.sourceMetadata || input.participants || input.noteType) {
      mergedSourceMetadata = {
        ...input.sourceMetadata,
        ...(input.participants ? { participants: [input.participants] } : {}),
        noteType: input.noteType,
      } as Prisma.InputJsonValue;
    }
  }

  const normalizedBody = normalizeBodyForCorpus(
    input.body,
    input.sourceKind === "EMAIL" ? input.bodyFormat : "text"
  );

  const linkedQuestion = input.linkedQuestion ?? null;
  const prefix = buildCorpusPrefix({
    sourceKind: input.sourceKind,
    corpusRole,
    sourceDate,
    receivedAt,
    sourceAuthor,
    sourceSubject,
    linkedQuestion,
  });
  const prefixedText = `${prefix}\n---\n${normalizedBody}`;

  // Dedup based on the *prefixed* text — same body collected twice with
  // different metadata/links is treated as a distinct piece, which is what
  // we want for emails forwarded multiple times with different annotations.
  const contentHash = computeContentHash(prefixedText);
  const duplicateCheck = await checkDuplicateDocument(contentHash, input.dealId, options.userId);
  if (duplicateCheck.isDuplicate && duplicateCheck.existingDocument) {
    return {
      kind: "duplicate",
      existingDocumentId: duplicateCheck.existingDocument.id,
      existingDocumentName: duplicateCheck.existingDocument.name,
      sameDeal: duplicateCheck.sameDeal,
    };
  }

  const documentType = input.type ?? "OTHER";
  const documentName = deriveDocumentName(input, corpusRole);
  const encryptedText = encryptText(prefixedText);

  const linkedRedFlagId =
    linkedQuestion && linkedQuestion.source === "RED_FLAG" ? linkedQuestion.redFlagId : null;
  const linkedQuestionSource: LinkedQuestionSource | null = linkedQuestion ? linkedQuestion.source : null;
  const linkedQuestionText = linkedQuestion?.questionText ?? null;

  const document = await prisma.document.create({
    data: {
      dealId: input.dealId,
      name: documentName,
      type: documentType,
      mimeType: "text/markdown",
      sizeBytes: Buffer.byteLength(prefixedText, "utf8"),
      processingStatus: "COMPLETED",
      extractedText: encryptedText,
      extractionQuality: 100,
      requiresOCR: false,
      ocrProcessed: false,
      contentHash,
      version: 1,
      parentDocumentId: null,
      isLatest: true,
      sourceKind: input.sourceKind,
      corpusRole,
      sourceDate,
      receivedAt,
      sourceAuthor,
      sourceSubject,
      sourceMetadata: mergedSourceMetadata,
      linkedQuestionSource,
      linkedQuestionText,
      linkedRedFlagId,
    },
    select: {
      id: true,
      dealId: true,
      name: true,
      type: true,
      sourceKind: true,
      corpusRole: true,
      sourceDate: true,
      receivedAt: true,
      sourceAuthor: true,
      sourceSubject: true,
      linkedQuestionSource: true,
      linkedQuestionText: true,
      linkedRedFlagId: true,
      uploadedAt: true,
    },
  });

  // Synthetic single-page READY extraction run so the agent retrieval pipeline
  // (extractionRuns[0].pages[0].artifact) sees this document like any other.
  const manifest = buildStructuredDocumentManifest({
    artifacts: [
      {
        index: 1,
        label: input.sourceKind === "EMAIL" ? "Email body" : "Note body",
        text: prefixedText,
        method: "native_text",
        hasTables: /\|/.test(prefixedText),
        hasCharts: false,
        requiresReview: false,
      },
    ],
    estimatedCredits: 0,
    estimatedUsd: 0,
  });

  const extractionRun = await recordDocumentExtractionRun({
    documentId: document.id,
    documentVersion: 1,
    contentHash,
    text: prefixedText,
    qualityScore: 100,
    manifest,
    extraSummaryMetrics: {
      ingestion: "text",
      sourceKind: input.sourceKind,
      corpusRole,
    },
  });

  await prisma.document.update({
    where: { id: document.id },
    data: {
      extractionMetrics: {
        method: "user_text",
        sourceKind: input.sourceKind,
        corpusRole,
        latestExtractionRunId: extractionRun.id,
        ...summarizeManifestForLegacyMetrics(manifest),
      } as Prisma.InputJsonValue,
    },
  });

  return {
    kind: "created",
    document: {
      id: document.id,
      dealId: document.dealId,
      name: document.name,
      type: document.type,
      sourceKind: document.sourceKind,
      corpusRole: document.corpusRole,
      sourceDate: document.sourceDate,
      receivedAt: document.receivedAt,
      sourceAuthor: document.sourceAuthor,
      sourceSubject: document.sourceSubject,
      linkedQuestionSource: document.linkedQuestionSource,
      linkedQuestionText: document.linkedQuestionText,
      linkedRedFlagId: document.linkedRedFlagId,
      processingStatus: "COMPLETED",
      extractionQuality: 100,
      mimeType: "text/markdown",
      uploadedAt: document.uploadedAt,
    },
    extractionRunId: extractionRun.id,
  };
}
