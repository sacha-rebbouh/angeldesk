import { extractEmailMetadata, parseEmailDate } from "@/components/deals/corpus/extract-email-metadata";

type SourceKind = "FILE" | "EMAIL" | "NOTE";

export type InferredEmailThreadMessage = {
  from: string | null;
  sentAt: string;
  subject: string | null;
};

export type InferredEmailSource = {
  sourceKind: "EMAIL";
  sourceDate: Date;
  receivedAt: null;
  sourceAuthor: string | null;
  sourceSubject: string | null;
  sourceMetadata: {
    inferredFrom: "uploaded_file_text";
    confidence: "high" | "medium";
    detectedFormat: "html" | "text";
    threadMessageCount: number;
    threadMessages: InferredEmailThreadMessage[];
  };
};

export function inferEmailSourceFromExtractedText(params: {
  text: string;
  fileName?: string | null;
  currentSourceKind?: SourceKind | null;
  existingSourceDate?: Date | string | null;
  corpusParentDocumentId?: string | null;
}): InferredEmailSource | null {
  if (params.currentSourceKind && params.currentSourceKind !== "FILE") return null;
  if (params.existingSourceDate) return null;
  if (params.corpusParentDocumentId) return null;

  const text = normalizeText(params.text);
  if (!text) return null;

  const headerSlice = text.slice(0, 8_000);
  const parsed = extractEmailMetadata(headerSlice);
  const threadMessages = extractThreadMessages(headerSlice);
  const primary = pickPrimaryMessage(parsed, threadMessages);

  if (!primary?.sentAt) return null;

  const hasIdentity = Boolean(primary.from || primary.subject);
  const hasThreadEvidence = threadMessages.length > 0;
  const filenameHint = /\b(?:mail|email|e-mail|courriel|message)\b/i.test(params.fileName ?? "");
  if (!hasIdentity || (!hasThreadEvidence && !filenameHint)) return null;

  const confidence: "high" | "medium" =
    hasThreadEvidence && Boolean(primary.from) && Boolean(primary.subject) ? "high" : "medium";

  return {
    sourceKind: "EMAIL",
    sourceDate: primary.sentAt,
    receivedAt: null,
    sourceAuthor: primary.from,
    sourceSubject: primary.subject,
    sourceMetadata: {
      inferredFrom: "uploaded_file_text",
      confidence,
      detectedFormat: parsed.detectedFormat,
      threadMessageCount: threadMessages.length,
      threadMessages: threadMessages.slice(0, 20),
    },
  };
}

function normalizeText(text: string): string {
  return (text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\f/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pickPrimaryMessage(
  parsed: ReturnType<typeof extractEmailMetadata>,
  threadMessages: InferredEmailThreadMessage[]
): { from: string | null; subject: string | null; sentAt: Date | null } | null {
  if (threadMessages.length > 0) {
    const first = threadMessages[0];
    return {
      from: first.from,
      subject: first.subject ?? parsed.subject,
      sentAt: new Date(first.sentAt),
    };
  }
  return {
    from: parsed.from,
    subject: parsed.subject,
    sentAt: parsed.sentAt,
  };
}

function extractThreadMessages(text: string): InferredEmailThreadMessage[] {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const messages: InferredEmailThreadMessage[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < Math.min(lines.length, 180); index += 1) {
    const from = readHeader(lines[index], ["De", "From", "Expéditeur"]);
    if (!from) continue;

    const window = lines.slice(index + 1, Math.min(lines.length, index + 12));
    const dateLine = window.find((line) => readHeader(line, ["Envoyé", "Envoye", "Sent", "Date"]));
    const dateValue = dateLine ? readHeader(dateLine, ["Envoyé", "Envoye", "Sent", "Date"]) : null;
    const sentAt = dateValue ? parseEmailDate(dateValue) : null;
    if (!sentAt) continue;

    const subjectLine = window.find((line) => readHeader(line, ["Objet", "Subject", "Sujet"]));
    const subject = subjectLine ? readHeader(subjectLine, ["Objet", "Subject", "Sujet"]) : null;
    const key = `${from}|${sentAt.toISOString()}|${subject ?? ""}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    messages.push({
      from,
      sentAt: sentAt.toISOString(),
      subject,
    });
  }

  const gmailInline = messages.length > 0 ? [] : extractGmailInlineMessages(text, seen);
  const ordered = [...messages, ...gmailInline].sort((left, right) => {
    const leftIndex = text.indexOf(left.from ?? "");
    const rightIndex = text.indexOf(right.from ?? "");
    return leftIndex - rightIndex;
  });
  const merged: InferredEmailThreadMessage[] = [];
  const bySenderDate = new Map<string, InferredEmailThreadMessage>();
  for (const message of ordered) {
    const key = `${message.from ?? ""}|${message.sentAt}`.toLowerCase();
    const existing = bySenderDate.get(key);
    if (existing) {
      if (!existing.subject && message.subject) existing.subject = message.subject;
      continue;
    }
    bySenderDate.set(key, message);
    merged.push(message);
  }
  return merged;
}

function readHeader(line: string | undefined, labels: string[]): string | null {
  if (!line) return null;
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = line.match(new RegExp(`^(?:${escaped})\\s*:?\\s*(.+)$`, "i"));
  return match?.[1]?.trim() || null;
}

function extractGmailInlineMessages(text: string, seen: Set<string>): InferredEmailThreadMessage[] {
  const messages: InferredEmailThreadMessage[] = [];
  const linePattern =
    /^(.+?<[^>\n]+>)\s+((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\s+(?:at\s+)?\d{1,2}:\d{2}\s*(?:AM|PM)?)/gim;

  for (const match of text.matchAll(linePattern)) {
    const from = match[1]?.trim() ?? null;
    const sentAt = match[2] ? parseEmailDate(match[2]) : null;
    if (!from || !sentAt) continue;
    const key = `${from}|${sentAt.toISOString()}|`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    messages.push({ from, sentAt: sentAt.toISOString(), subject: null });
  }

  return messages;
}
