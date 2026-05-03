/**
 * ARC-LIGHT Phase 0.5 - OCR gate on mupdf-rendered PNGs.
 *
 * Reads PNGs already rendered to /tmp/arc-light-spike/ by the ephemeral
 * render.mjs script (run outside the repo). Applies the same gate as the
 * Poppler spike script.
 *
 * Licensing note: mupdf is AGPL-3.0-or-later. This script tests the library
 * OUTSIDE the Angel Desk package.json to avoid contamination risk. Any
 * production adoption would require a commercial Artifex license.
 */

import { readFile, stat } from "node:fs/promises";

const OUT_DIR = "/tmp/arc-light-spike";

const EXPECTED_PHRASES_PAGE_16 = [
  "One-stop-shop Offering",
  "Genesis",
  "Vendors & Solutions",
  "Customers",
  "Virtuous cycle",
];

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
  const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
  const body = {
    model: "openai/gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: dataUrl } },
          {
            type: "text",
            text: `Extract ALL visible text from this slide. Include headings, body text, bullets, numbers, chart labels, and diagram text. Output clean text only, no commentary.`,
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
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const latencyMs = Date.now() - start;
  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return { text: json.choices?.[0]?.message?.content ?? "", latencyMs };
}

async function evaluate(page: number) {
  const pngPath = `${OUT_DIR}/mupdf-page-${page}.png`;
  const s = await stat(pngPath);
  console.log(`\n[mupdf-ocr] page ${page}: ${pngPath} (${s.size} bytes)`);
  const { text, latencyMs } = await callOCR(pngPath);
  const isolatedRatio = computeIsolatedTokenRatio(text);
  const gibberish = hasGibberishPattern(text);
  const expected = page === 16 ? EXPECTED_PHRASES_PAGE_16 : [];
  const lower = text.toLowerCase();
  const missing = expected.filter((p) => !lower.includes(p.toLowerCase()));
  const gibberishGuardOK = isolatedRatio < 0.15 && !gibberish;
  const phrasesOK = missing.length === 0;
  const pass = gibberishGuardOK && (expected.length === 0 || phrasesOK);

  console.log(`  OCR latency: ${latencyMs}ms`);
  console.log(`  isolatedTokenRatio: ${isolatedRatio.toFixed(3)} (gate: < 0.15 => ${isolatedRatio < 0.15 ? "OK" : "FAIL"})`);
  console.log(`  Gibberish regex: ${gibberish ? "DETECTED (FAIL)" : "clear"}`);
  if (expected.length > 0) {
    console.log(`  Missing phrases: ${missing.length === 0 ? "none" : missing.join(", ")}`);
  }
  console.log(`  Verdict: ${pass ? "PASS" : "FAIL"}`);
  console.log(`  --- OCR text (first 1200 chars) ---`);
  console.log(text.slice(0, 1200));
  console.log(`  ---`);
  return { page, pass, missing, isolatedRatio, gibberish };
}

async function main() {
  const results = [];
  for (const page of [16, 21, 31]) {
    try {
      results.push(await evaluate(page));
    } catch (error) {
      console.error(`[mupdf-ocr] page ${page} failed:`, error);
      results.push({ page, pass: false, missing: [], isolatedRatio: 1, gibberish: false });
    }
  }
  console.log(`\n=== SUMMARY (mupdf) ===`);
  results.forEach((r) => console.log(`  page ${r.page}: ${r.pass ? "PASS" : "FAIL"}`));
  if (results.some((r) => !r.pass)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
