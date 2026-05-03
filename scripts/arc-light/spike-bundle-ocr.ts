/**
 * ARC-LIGHT Phase 0.5b - OCR gate on PNGs produced by the bundled Poppler
 * executed inside a vanilla AL2023 container. Validates end-to-end that the
 * rendering path a Vercel Lambda would follow yields OCR-lisible output.
 *
 * Per-page must-contain phrases (customized for pages 21 and 31 as agreed).
 */

import { readFile, stat } from "node:fs/promises";

const OUT_DIR = "/tmp/arc-light-spike";

const EXPECTED_BY_PAGE: Record<number, string[]> = {
  16: [
    "One-stop-shop Offering",
    "Genesis",
    "Vendors & Solutions",
    "Customers",
    "Virtuous cycle",
  ],
  21: [
    "High Growth Managed Services Segment",
    "Net Revenue Retention",
    "Churn",
    "LTM Managed Services Revenue",
    "# of Customers",
  ],
  31: [
    "Transactions Comps",
    "EV/EBITDA",
    "TEV",
    "Genesis",
    "Mean",
  ],
};

function computeIsolatedTokenRatio(text: string): number {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  const isolated = tokens.filter(
    (t) => /^[A-Za-z0-9]$/.test(t) || /^[-–]$/.test(t)
  ).length;
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
  const pngPath = `${OUT_DIR}/bundled-page-${page}-${page}.png`;
  const s = await stat(pngPath);
  console.log(`\n[bundle-ocr] page ${page}: ${pngPath} (${s.size} bytes)`);
  const { text, latencyMs } = await callOCR(pngPath);
  const isolatedRatio = computeIsolatedTokenRatio(text);
  const gibberish = hasGibberishPattern(text);
  const expected = EXPECTED_BY_PAGE[page] ?? [];
  const lower = text.toLowerCase();
  const missing = expected.filter((p) => !lower.includes(p.toLowerCase()));
  const gibberishGuardOK = isolatedRatio < 0.15 && !gibberish;
  const phrasesOK = missing.length === 0;
  const pass = gibberishGuardOK && phrasesOK;

  console.log(`  OCR latency: ${latencyMs}ms`);
  console.log(`  isolatedTokenRatio: ${isolatedRatio.toFixed(3)} (gate: < 0.15 => ${isolatedRatio < 0.15 ? "OK" : "FAIL"})`);
  console.log(`  Gibberish regex: ${gibberish ? "DETECTED (FAIL)" : "clear"}`);
  console.log(`  Must-contain phrases (${expected.length}): ${missing.length === 0 ? "all present" : `MISSING: ${missing.join(", ")}`}`);
  console.log(`  Verdict: ${pass ? "PASS" : "FAIL"}`);
  console.log(`  --- OCR text (first 1500 chars) ---`);
  console.log(text.slice(0, 1500));
  console.log(`  ---`);
  return { page, pass, missing, isolatedRatio, gibberish };
}

async function main() {
  const results = [];
  for (const page of [16, 21, 31]) {
    try {
      results.push(await evaluate(page));
    } catch (error) {
      console.error(`[bundle-ocr] page ${page} failed:`, error);
      results.push({ page, pass: false, missing: [], isolatedRatio: 1, gibberish: false });
    }
  }
  console.log(`\n=== SUMMARY (bundled Poppler executed in AL2023 vanilla) ===`);
  results.forEach((r) => console.log(`  page ${r.page}: ${r.pass ? "PASS" : "FAIL"}`));
  if (results.some((r) => !r.pass)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
