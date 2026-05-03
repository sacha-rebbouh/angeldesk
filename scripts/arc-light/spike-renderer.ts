/**
 * ARC-LIGHT Phase 0.5 spike - renderer decision script
 *
 * Criteria (validated with Sacha):
 *  - PNG 200 DPI generated
 *  - Visual render contains the slide title
 *  - OCR returns at minimum: "One-stop-shop Offering", "Genesis",
 *    "Vendors & Solutions", "Customers", "Virtuous cycle"
 *  - isolatedTokenRatio < 0.15
 *  - No pattern like "O - s - s - p" (regex /(?:\b[A-Za-z]\b[\s-]*){8,}/)
 *
 * GPT-4o confidence is NOT a gate (model can self-attribute arbitrarily).
 *
 * Run:
 *   ARC_LIGHT_PDF_PATH=/path/to/deck.pdf OPENROUTER_API_KEY=... npx tsx scripts/arc-light/spike-renderer.ts
 *
 * No production code is modified. Output in /tmp/arc-light-spike/.
 */

import { execFile } from "node:child_process";
import { mkdir, readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

const PDF_PATH = process.env.ARC_LIGHT_PDF_PATH;
const OUT_DIR = "/tmp/arc-light-spike";
const PAGES_TO_TEST = [16, 21, 31];
const DPI = 200;

const EXPECTED_PHRASES_PAGE_16 = [
  "One-stop-shop Offering",
  "Genesis",
  "Vendors & Solutions",
  "Customers",
  "Virtuous cycle",
];

interface GateReport {
  page: number;
  renderer: "poppler" | "mupdf-js";
  pngPath: string;
  pngBytes: number;
  renderLatencyMs: number;
  ocrLatencyMs: number;
  ocrText: string;
  isolatedTokenRatio: number;
  hasGibberishPattern: boolean;
  missingPhrases: string[];
  gibberishGuardPasses: boolean;
  phrasesGuardPasses: boolean;
  verdict: "PASS" | "FAIL";
  reasonIfFail: string[];
}

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

async function runPopplerRender(page: number): Promise<{ pngPath: string; pngBytes: number; latencyMs: number }> {
  if (!PDF_PATH) {
    throw new Error("ARC_LIGHT_PDF_PATH is not set in env");
  }

  const outPrefix = path.join(OUT_DIR, `poppler-page-${page}`);
  const start = Date.now();
  await execFileAsync("pdftoppm", [
    "-r", String(DPI),
    "-png",
    "-f", String(page),
    "-l", String(page),
    PDF_PATH,
    outPrefix,
  ]);
  const latencyMs = Date.now() - start;
  // pdftoppm appends page number with padding: out-NN.png (2+ digits by default)
  // For f=16 l=16, it produces either outPrefix-16.png or with more padding; we guess.
  const candidates = [
    `${outPrefix}-${page}.png`,
    `${outPrefix}-${String(page).padStart(2, "0")}.png`,
    `${outPrefix}-${String(page).padStart(3, "0")}.png`,
  ];
  for (const c of candidates) {
    try {
      const s = await stat(c);
      return { pngPath: c, pngBytes: s.size, latencyMs };
    } catch {
      // continue
    }
  }
  throw new Error(`Poppler did not produce PNG at any of: ${candidates.join(", ")}`);
}

function computeIsolatedTokenRatio(text: string): number {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  const isolated = tokens.filter((t) => /^[A-Za-z0-9]$/.test(t) || /^[-–]$/.test(t)).length;
  return isolated / tokens.length;
}

function hasGibberishPattern(text: string): boolean {
  return /(?:\b[A-Za-z]\b[\s-]*){8,}/.test(text);
}

async function callOCR(pngPath: string): Promise<{ text: string; latencyMs: number }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set in env");
  const buffer = await readFile(pngPath);
  const base64 = buffer.toString("base64");
  const dataUrl = `data:image/png;base64,${base64}`;

  const body = {
    model: "openai/gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: dataUrl } },
          {
            type: "text",
            text: `Extract ALL visible text from this slide. Include:
- Headings and titles
- Body text and bullet points
- Numbers and labels
- Chart/diagram labels
- Legend / axis / caption text

Output clean text only, no commentary.`,
          },
        ],
      },
    ],
    max_tokens: 2000,
    temperature: 0,
  };
  const start = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const latencyMs = Date.now() - start;
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${err.slice(0, 300)}`);
  }
  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = json.choices?.[0]?.message?.content ?? "";
  return { text, latencyMs };
}

function evaluateGate(params: {
  page: number;
  renderer: "poppler" | "mupdf-js";
  pngPath: string;
  pngBytes: number;
  renderLatencyMs: number;
  ocrText: string;
  ocrLatencyMs: number;
}): GateReport {
  const { page, ocrText } = params;
  const isolatedRatio = computeIsolatedTokenRatio(ocrText);
  const gibberish = hasGibberishPattern(ocrText);
  const expected = page === 16 ? EXPECTED_PHRASES_PAGE_16 : [];
  const lower = ocrText.toLowerCase();
  const missingPhrases = expected.filter((phrase) => !lower.includes(phrase.toLowerCase()));

  const gibberishGuardPasses = isolatedRatio < 0.15 && !gibberish;
  const phrasesGuardPasses = missingPhrases.length === 0;
  const reasonIfFail: string[] = [];
  if (!gibberishGuardPasses) {
    reasonIfFail.push(`gibberish guard failed (ratio=${isolatedRatio.toFixed(3)}, pattern=${gibberish})`);
  }
  if (!phrasesGuardPasses) {
    reasonIfFail.push(`missing phrases: ${missingPhrases.join(", ")}`);
  }

  return {
    page,
    renderer: params.renderer,
    pngPath: params.pngPath,
    pngBytes: params.pngBytes,
    renderLatencyMs: params.renderLatencyMs,
    ocrLatencyMs: params.ocrLatencyMs,
    ocrText,
    isolatedTokenRatio: isolatedRatio,
    hasGibberishPattern: gibberish,
    missingPhrases,
    gibberishGuardPasses,
    phrasesGuardPasses,
    verdict: gibberishGuardPasses && (expected.length === 0 || phrasesGuardPasses) ? "PASS" : "FAIL",
    reasonIfFail,
  };
}

async function runOne(page: number): Promise<GateReport> {
  console.log(`\n[spike] Rendering page ${page} with Poppler at ${DPI} DPI...`);
  const render = await runPopplerRender(page);
  console.log(`[spike] Rendered ${render.pngPath} (${render.pngBytes} bytes) in ${render.renderLatencyMs}ms`);
  console.log(`[spike] Calling GPT-4o OCR...`);
  const ocr = await callOCR(render.pngPath);
  console.log(`[spike] OCR returned ${ocr.text.length} chars in ${ocr.latencyMs}ms`);
  const report = evaluateGate({
    page,
    renderer: "poppler",
    pngPath: render.pngPath,
    pngBytes: render.pngBytes,
    renderLatencyMs: render.renderLatencyMs,
    ocrText: ocr.text,
    ocrLatencyMs: ocr.latencyMs,
  });
  return report;
}

function printReport(r: GateReport) {
  console.log(`\n========== Page ${r.page} (${r.renderer}) ==========`);
  console.log(`Verdict: ${r.verdict}`);
  console.log(`PNG size: ${r.pngBytes} bytes`);
  console.log(`Render latency: ${r.renderLatencyMs}ms`);
  console.log(`OCR latency: ${r.ocrLatencyMs}ms`);
  console.log(`isolatedTokenRatio: ${r.isolatedTokenRatio.toFixed(3)} (gate: < 0.15 => ${r.isolatedTokenRatio < 0.15 ? "OK" : "FAIL"})`);
  console.log(`Gibberish pattern /(?:\\b[A-Za-z]\\b[\\s-]*){8,}/: ${r.hasGibberishPattern ? "DETECTED (FAIL)" : "clear"}`);
  if (r.missingPhrases.length > 0) {
    console.log(`Missing expected phrases: ${r.missingPhrases.join(", ")}`);
  } else if (r.page === 16) {
    console.log(`All 5 expected phrases present on page 16.`);
  }
  if (r.reasonIfFail.length > 0) {
    console.log(`Failure reasons:`);
    r.reasonIfFail.forEach((x) => console.log(`  - ${x}`));
  }
  console.log(`\n--- OCR text (first 1200 chars) ---`);
  console.log(r.ocrText.slice(0, 1200));
  console.log(`--- end ---\n`);
}

async function main() {
  await ensureDir(OUT_DIR);
  const pdfStat = await stat(PDF_PATH);
  console.log(`[spike] PDF: ${PDF_PATH} (${pdfStat.size} bytes)`);
  console.log(`[spike] Output dir: ${OUT_DIR}`);
  console.log(`[spike] Pages to test: ${PAGES_TO_TEST.join(", ")}`);
  console.log(`[spike] DPI: ${DPI}`);

  const reports: GateReport[] = [];
  for (const page of PAGES_TO_TEST) {
    try {
      const r = await runOne(page);
      printReport(r);
      reports.push(r);
    } catch (error) {
      console.error(`[spike] Page ${page} failed:`, error instanceof Error ? error.message : error);
      reports.push({
        page,
        renderer: "poppler",
        pngPath: "",
        pngBytes: 0,
        renderLatencyMs: 0,
        ocrLatencyMs: 0,
        ocrText: "",
        isolatedTokenRatio: 1,
        hasGibberishPattern: false,
        missingPhrases: EXPECTED_PHRASES_PAGE_16,
        gibberishGuardPasses: false,
        phrasesGuardPasses: false,
        verdict: "FAIL",
        reasonIfFail: [error instanceof Error ? error.message : String(error)],
      });
    }
  }

  console.log(`\n========== SUMMARY ==========`);
  const passes = reports.filter((r) => r.verdict === "PASS").length;
  const fails = reports.filter((r) => r.verdict === "FAIL").length;
  console.log(`${passes}/${reports.length} pages PASS, ${fails} FAIL`);
  reports.forEach((r) => {
    console.log(`  page ${r.page}: ${r.verdict}${r.reasonIfFail.length > 0 ? " - " + r.reasonIfFail.join("; ") : ""}`);
  });
  if (fails > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[spike] fatal:", error);
  process.exitCode = 1;
});
