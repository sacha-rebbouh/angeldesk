import type { AgentContext } from "./types";
import { sanitizeForLLM } from "@/lib/sanitize";

type AgentDocument = NonNullable<AgentContext["documents"]>[number];
type ExtractionPage = NonNullable<AgentDocument["extractionRuns"]>[number]["pages"][number];

interface DocumentWindow {
  label: string;
  text: string;
  score: number;
  reason: string;
}

const AGENT_KEYWORDS: Record<string, string[]> = {
  "financial-auditor": ["arr", "mrr", "revenue", "cash", "burn", "runway", "ebitda", "margin", "cac", "ltv", "churn", "nrr", "forecast", "budget", "p&l", "profit", "loss"],
  "market-intelligence": ["tam", "sam", "som", "market", "cagr", "segment", "customer", "competition", "competitor", "pricing", "growth"],
  "team-investigator": ["founder", "ceo", "cto", "cfo", "coo", "team", "headcount", "advisor", "linkedin", "hire", "employee"],
  "competitive-intel": ["competitor", "competition", "alternative", "positioning", "differentiation", "market", "pricing", "category"],
  "customer-intel": ["customer", "retention", "churn", "nrr", "grr", "cohort", "testimonial", "case study", "pipeline", "usage"],
  "gtm-analyst": ["pricing", "sales", "pipeline", "conversion", "cac", "payback", "channel", "gtm", "marketing", "quota"],
  "tech-stack-dd": ["product", "architecture", "stack", "integration", "roadmap", "api", "security", "scalability", "infrastructure"],
  "tech-ops-dd": ["product", "roadmap", "ops", "sla", "incident", "security", "ip", "infrastructure", "scalability", "delivery"],
  "legal-regulatory": ["term", "safe", "equity", "liquidation", "preference", "pro rata", "vesting", "warranty", "shareholder", "cap table", "gdpr", "regulatory"],
  "conditions-analyst": ["valuation", "pre-money", "post-money", "dilution", "safe", "equity", "term", "liquidation", "pro rata", "vesting", "esop"],
  "cap-table-auditor": ["cap table", "shareholder", "dilution", "option pool", "esop", "vesting", "safe", "equity", "pre-money", "post-money"],
  "exit-strategist": ["exit", "acquirer", "m&a", "ipo", "multiple", "strategic", "comparable", "valuation", "market"],
  "deck-forensics": ["slide", "claim", "deck", "story", "traction", "team", "market", "chart", "table", "source"],
};

const UNIVERSAL_KEYWORDS = [
  "arr", "mrr", "revenue", "burn", "runway", "market", "tam", "sam", "som",
  "founder", "team", "competitor", "customer", "pricing", "valuation", "cap table",
  "risk", "contract", "term", "chart", "table",
];

export function formatRetrievedDocumentWindows(
  doc: AgentDocument,
  agentName: string,
  options: { maxChars: number; maxWindows?: number }
): { text: string; omittedWindows: number; totalWindows: number } {
  const corpus = doc.extractedText ?? "";
  if (!corpus.trim()) {
    return { text: "(Content not yet extracted)", omittedWindows: 0, totalWindows: 0 };
  }

  if (isLegacyExcelDump(doc, corpus)) {
    return {
      text: [
        "[EXCEL LEGACY EXTRACTION DETECTED]",
        `Document: ${doc.name}`,
        `Type: ${doc.type}`,
        `Taille extraite: ${corpus.length} caracteres`,
        "Ce document a ete extrait avec l'ancien extracteur Excel qui dumpait des cellules/formules brutes.",
        "Re-extraire le document avant de l'utiliser pour une analyse financiere; le fichier original reste la source d'audit.",
      ].join("\n"),
      omittedWindows: 1,
      totalWindows: 1,
    };
  }

  const artifactWindows = buildArtifactWindows(doc);
  const windows = artifactWindows.length > 0 ? artifactWindows : splitDocumentWindows(corpus);
  if (windows.length === 0) {
    return { text: "(No extracted artifact content)", omittedWindows: 0, totalWindows: 0 };
  }
  if (corpus.length <= options.maxChars && artifactWindows.length === 0) {
    return { text: corpus, omittedWindows: 0, totalWindows: 1 };
  }
  if (windows.length <= 1) {
    const singleText = windows[0]?.text.length > options.maxChars
      ? buildHeadTailFallback(windows[0].text, options.maxChars)
      : windows[0]?.text ?? buildHeadTailFallback(corpus, options.maxChars);
    return {
      text: withDocumentSourcePrelude(doc, artifactWindows.length > 0
        ? `${singleText}\n\n[RETRIEVAL: 1/1 artefacts retenus pour ${agentName}.]`
        : singleText),
      omittedWindows: 0,
      totalWindows: 1,
    };
  }

  const diligenceResponseBoost = doc.corpusRole === "DILIGENCE_RESPONSE" ? 30 : 0;
  const scored = windows
    .map((window, index) => ({
      ...window,
      score: scoreWindow(window, agentName, index, windows.length) + diligenceResponseBoost,
      reason: [
        buildReason(window, agentName),
        diligenceResponseBoost > 0 ? "diligence response boost" : null,
      ].filter(Boolean).join(", "),
    }))
    .sort((left, right) => right.score - left.score);

  const maxWindows = options.maxWindows ?? 12;
  const selected: DocumentWindow[] = [];
  let usedChars = 0;
  for (const window of scored) {
    const nextCost = window.text.length + window.label.length + 80;
    if (selected.length >= maxWindows || usedChars + nextCost > options.maxChars) continue;
    selected.push(window);
    usedChars += nextCost;
  }

  const ordered = selected.sort((left, right) => originalIndex(left.label) - originalIndex(right.label));
  const text = ordered
    .map((window) => `--- ${window.label} | score ${window.score} | ${window.reason} ---\n${window.text}`)
    .join("\n\n");

  return {
    text: withDocumentSourcePrelude(
      doc,
      `${text}\n\n[RETRIEVAL: ${ordered.length}/${windows.length} ${artifactWindows.length > 0 ? "artefacts" : "fenetres documentaires"} retenus pour ${agentName}.]`
    ),
    omittedWindows: Math.max(0, windows.length - ordered.length),
    totalWindows: windows.length,
  };
}

function isLegacyExcelDump(doc: AgentDocument, corpus: string): boolean {
  if (doc.type !== "FINANCIAL_MODEL") return false;
  return corpus.length > 500_000 || /\[[A-Z]{1,3}\d+=/.test(corpus);
}

function buildArtifactWindows(doc: AgentDocument): Array<Omit<DocumentWindow, "score" | "reason">> {
  const run = doc.extractionRuns?.[0];
  if (!run?.pages?.length) return [];

  return run.pages.flatMap((page) => {
    const text = formatExtractionPageArtifact(page, doc.type);
    if (!text.trim()) return [];
    return [{
      label: `Artifact ${page.pageNumber} (${page.method}/${page.status})`,
      text,
    }];
  });
}

function withDocumentSourcePrelude(doc: AgentDocument, text: string): string {
  const prelude = buildDocumentSourcePrelude(doc);
  if (!prelude || text.trimStart().startsWith("[Source:")) return text;
  return `${prelude}\n---\n${text}`;
}

function buildDocumentSourcePrelude(doc: AgentDocument): string | null {
  const isCorpusAttachment = Boolean(doc.corpusParentDocumentId);
  if ((!doc.sourceKind || doc.sourceKind === "FILE") && !isCorpusAttachment) return null;

  const sourceKind = doc.sourceKind ?? "FILE";
  const lines = [`[Source: ${sourceKind.toLowerCase()}]`];
  if (isCorpusAttachment) {
    const parentLabel = doc.corpusParentDocumentName ?? doc.corpusParentDocumentId;
    lines.push(`[Fichier joint à : ${sanitizePreludeValue(parentLabel ?? "email/note", 500)}]`);
  }
  const sourceDate = formatSourceDate(doc.sourceDate ?? doc.receivedAt ?? doc.uploadedAt);
  if (sourceDate) lines.push(`[Date: ${sourceDate}]`);
  if (doc.sourceAuthor) lines.push(`[From: ${sanitizePreludeValue(doc.sourceAuthor, 500)}]`);
  if (doc.sourceSubject) lines.push(`[Subject: ${sanitizePreludeValue(doc.sourceSubject, 500)}]`);
  if (doc.corpusRole === "DILIGENCE_RESPONSE") lines.push("[Role: diligence_response]");
  if (doc.linkedQuestionText) lines.push(`[Répond à : "${sanitizePreludeValue(doc.linkedQuestionText, 1000)}"]`);
  return lines.join("\n");
}

function sanitizePreludeValue(value: string, maxLength: number): string {
  return sanitizeForLLM(value, { maxLength, preserveNewlines: false });
}

function formatSourceDate(value?: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function formatExtractionPageArtifact(page: ExtractionPage, documentType: string): string {
  const artifact = isRecord(page.artifact) ? page.artifact : {};
  const lines: string[] = [
    `[Artifact page ${page.pageNumber} | ${documentType} | status=${page.status} | method=${page.method} | quality=${page.qualityScore ?? "n/a"}]`,
  ];

  const text = typeof artifact.text === "string" ? artifact.text : page.textPreview ?? "";
  if (text.trim()) {
    lines.push("## Extracted text");
    lines.push(text.trim().slice(0, 4000));
  }

  const tables = Array.isArray(artifact.tables) ? artifact.tables : [];
  if (tables.length > 0) {
    lines.push("## Tables");
    for (const [index, table] of tables.entries()) {
      if (!isRecord(table)) continue;
      lines.push(`### Table ${index + 1}${typeof table.title === "string" ? ` - ${table.title}` : ""}`);
      if (typeof table.markdown === "string" && table.markdown.trim()) {
        lines.push(table.markdown.trim().slice(0, 3000));
      } else if (Array.isArray(table.rows)) {
        lines.push(formatRows(table.rows).slice(0, 3000));
      } else {
        lines.push("[TABLE DETECTED WITHOUT STRUCTURED ROWS]");
      }
    }
  }

  const charts = Array.isArray(artifact.charts) ? artifact.charts : [];
  if (charts.length > 0) {
    lines.push("## Charts");
    for (const [index, chart] of charts.entries()) {
      if (!isRecord(chart)) continue;
      lines.push(`### Chart ${index + 1}${typeof chart.title === "string" ? ` - ${chart.title}` : ""}`);
      if (typeof chart.chartType === "string") lines.push(`Type: ${chart.chartType}`);
      if (typeof chart.description === "string") lines.push(`Description: ${chart.description}`);
      if (Array.isArray(chart.series) && chart.series.length > 0) lines.push(`Series: ${chart.series.map(String).join(", ")}`);
      if (Array.isArray(chart.values) && chart.values.length > 0) {
        lines.push(`Values: ${chart.values.map((entry) => {
          if (!isRecord(entry)) return String(entry);
          return `${String(entry.label ?? "value")}=${String(entry.value ?? "")}`;
        }).join(" | ")}`);
      } else {
        lines.push("[CHART DETECTED WITHOUT STRUCTURED VALUES]");
      }
    }
  }

  const numericClaims = Array.isArray(artifact.numericClaims) ? artifact.numericClaims : [];
  if (numericClaims.length > 0) {
    lines.push("## Numeric claims");
    for (const claim of numericClaims.slice(0, 40)) {
      if (!isRecord(claim)) continue;
      lines.push(`- ${String(claim.label ?? "value")}: ${String(claim.value ?? "")}${claim.unit ? ` ${String(claim.unit)}` : ""}${claim.sourceText ? ` | source: ${String(claim.sourceText).slice(0, 140)}` : ""}`);
    }
  }

  const unreadableRegions = Array.isArray(artifact.unreadableRegions) ? artifact.unreadableRegions : [];
  if (unreadableRegions.length > 0) {
    lines.push("## Extraction warnings");
    for (const region of unreadableRegions) {
      if (!isRecord(region)) continue;
      lines.push(`- ${String(region.severity ?? "medium")}: ${String(region.reason ?? "Unreadable region")}`);
    }
  }

  if ((page.hasTables || page.hasCharts) && tables.length === 0 && charts.length === 0) {
    lines.push("[VISUAL RISK: page flagged as table/chart but no structured table/chart artifact is available]");
  }

  return lines.join("\n");
}

function formatRows(rows: unknown[]): string {
  return rows
    .filter(Array.isArray)
    .slice(0, 120)
    .map((row) => (row as unknown[]).map((cell) => String(cell ?? "")).join(" | "))
    .join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function splitDocumentWindows(corpus: string): Array<Omit<DocumentWindow, "score" | "reason">> {
  const marker = /(\[Page \d+ - [^\]]+\]|--- Slide \d+ ---|=== FEUILLE: [^\n=]+ ===|--- [A-Z0-9 _.-]+ ---)/g;
  const matches = [...corpus.matchAll(marker)];
  if (matches.length === 0) {
    return chunkBySize(corpus, 6000);
  }

  const windows: Array<Omit<DocumentWindow, "score" | "reason">> = [];
  const prefix = corpus.slice(0, matches[0].index ?? 0).trim();
  if (prefix) windows.push({ label: "Document opening", text: prefix });

  for (const [index, match] of matches.entries()) {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? corpus.length;
    const label = match[0].replace(/\s+/g, " ").trim();
    const text = corpus.slice(start, end).trim();
    if (text) windows.push({ label, text });
  }

  return windows;
}

function scoreWindow(window: Omit<DocumentWindow, "score" | "reason">, agentName: string, index: number, total: number): number {
  const lower = window.text.toLowerCase();
  const agentKeywords = AGENT_KEYWORDS[agentName] ?? [];
  let score = 0;

  for (const keyword of agentKeywords) {
    if (lower.includes(keyword)) score += 12;
  }
  for (const keyword of UNIVERSAL_KEYWORDS) {
    if (lower.includes(keyword)) score += 4;
  }
  const numericSignals = lower.match(/\d+([.,]\d+)?\s?(%|€|eur|\$|m€|k€|m|k|x)/g)?.length ?? 0;
  score += Math.min(30, numericSignals * 2);
  if (/\||table|chart|graph|axis|legend|cohort|breakdown/.test(lower)) score += 15;
  if (index === 0 || index === total - 1) score += 8;
  if (window.text.length < 120) score -= 12;
  return score;
}

function buildReason(window: Omit<DocumentWindow, "score" | "reason">, agentName: string): string {
  const lower = window.text.toLowerCase();
  const matched = [...(AGENT_KEYWORDS[agentName] ?? []), ...UNIVERSAL_KEYWORDS]
    .filter((keyword) => lower.includes(keyword))
    .slice(0, 4);
  return matched.length > 0 ? `matched ${matched.join(", ")}` : "structural coverage";
}

function originalIndex(label: string): number {
  const page = label.match(/Page (\d+)/i)?.[1] ?? label.match(/Slide (\d+)/i)?.[1] ?? label.match(/Artifact (\d+)/i)?.[1];
  if (page) return Number(page);
  return Number.MAX_SAFE_INTEGER;
}

function chunkBySize(corpus: string, chunkSize: number): Array<Omit<DocumentWindow, "score" | "reason">> {
  const chunks: Array<Omit<DocumentWindow, "score" | "reason">> = [];
  for (let start = 0; start < corpus.length; start += chunkSize) {
    chunks.push({
      label: `Window ${chunks.length + 1}`,
      text: corpus.slice(start, start + chunkSize),
    });
  }
  return chunks;
}

function buildHeadTailFallback(corpus: string, maxChars: number): string {
  const tailReserve = Math.min(4000, Math.floor(maxChars * 0.2));
  const headChars = maxChars - tailReserve;
  return [
    corpus.slice(0, headChars),
    `[TRONCATION: ${corpus.length - maxChars} caracteres omis au milieu du document.]`,
    corpus.slice(corpus.length - tailReserve),
  ].join("\n\n");
}
