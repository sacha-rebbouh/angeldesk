import type { AgentContext } from "./types";

type AgentDocument = NonNullable<AgentContext["documents"]>[number];

interface DocumentWindow {
  label: string;
  text: string;
  score: number;
  reason: string;
}

const AGENT_KEYWORDS: Record<string, string[]> = {
  "financial-auditor": ["arr", "mrr", "revenue", "cash", "burn", "runway", "ebitda", "margin", "cac", "ltv", "churn", "nrr", "forecast", "budget", "p&l", "profit", "loss"],
  "market-analyst": ["tam", "sam", "som", "market", "cagr", "segment", "customer", "competition", "competitor", "pricing", "growth"],
  "team-analyst": ["founder", "ceo", "cto", "cfo", "coo", "team", "headcount", "advisor", "linkedin", "hire", "employee"],
  "product-analyst": ["product", "use case", "workflow", "feature", "platform", "integration", "roadmap", "customer pain", "differentiator"],
  "legal-analyst": ["term", "safe", "equity", "liquidation", "preference", "pro rata", "vesting", "warranty", "shareholder", "cap table"],
  "conditions-analyst": ["valuation", "pre-money", "post-money", "dilution", "safe", "equity", "term", "liquidation", "pro rata", "vesting", "esop"],
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

  if (corpus.length <= options.maxChars) {
    return { text: corpus, omittedWindows: 0, totalWindows: 1 };
  }

  const windows = splitDocumentWindows(corpus);
  if (windows.length <= 1) {
    return {
      text: buildHeadTailFallback(corpus, options.maxChars),
      omittedWindows: 0,
      totalWindows: 1,
    };
  }

  const scored = windows
    .map((window, index) => ({
      ...window,
      score: scoreWindow(window, agentName, index, windows.length),
      reason: buildReason(window, agentName),
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
    text: `${text}\n\n[RETRIEVAL: ${ordered.length}/${windows.length} fenetres documentaires retenues pour ${agentName}.]`,
    omittedWindows: Math.max(0, windows.length - ordered.length),
    totalWindows: windows.length,
  };
}

function isLegacyExcelDump(doc: AgentDocument, corpus: string): boolean {
  if (doc.type !== "FINANCIAL_MODEL") return false;
  return corpus.length > 500_000 || /\[[A-Z]{1,3}\d+=/.test(corpus);
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
  const page = label.match(/Page (\d+)/i)?.[1] ?? label.match(/Slide (\d+)/i)?.[1];
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
