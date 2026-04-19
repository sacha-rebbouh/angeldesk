/**
 * Dump OLD and NEW extracts for a PDF to files, then audit whether key factual
 * tokens (numbers, entity names) are present in each. Used to isolate whether
 * the new stack drops facts or just restructures them.
 */

import fs from "node:fs/promises";
import { smartExtract } from "../src/services/pdf";

const GOOGLE_ENV_KEYS = [
  "GOOGLE_DOCUMENT_AI_PROCESSOR_NAME",
  "GOOGLE_DOCUMENT_AI_SERVICE_ACCOUNT_BASE64",
  "GOOGLE_DOCUMENT_AI_SERVICE_ACCOUNT_JSON",
  "GOOGLE_DOCUMENT_AI_SERVICE_ACCOUNT_FILE",
  "GOOGLE_DOCUMENT_AI_CLIENT_EMAIL",
  "GOOGLE_DOCUMENT_AI_PRIVATE_KEY",
  "GOOGLE_DOCUMENT_AI_ACCESS_TOKEN",
  "GOOGLE_DOCUMENT_AI_USE_METADATA_AUTH",
  "GOOGLE_APPLICATION_CREDENTIALS",
];
const AZURE_ENV_KEYS = [
  "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT",
  "AZURE_DOCUMENT_INTELLIGENCE_API_KEY",
  "AZURE_DOCUMENT_INTELLIGENCE_MODEL_ID",
  "AZURE_DOCUMENT_INTELLIGENCE_API_VERSION",
];

async function withProvidersDisabled<T>(fn: () => Promise<T>): Promise<T> {
  const backup = new Map<string, string | undefined>();
  for (const key of [...GOOGLE_ENV_KEYS, ...AZURE_ENV_KEYS]) {
    backup.set(key, process.env[key]);
    delete process.env[key];
  }
  try { return await fn(); } finally {
    for (const [k, v] of backup.entries()) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
}

async function extract(file: string, mode: "old" | "new") {
  const buf = await fs.readFile(file);
  const exec = () => smartExtract(buf, { qualityThreshold: 40, maxOCRPages: Number.POSITIVE_INFINITY, autoOCR: true, strict: true });
  const res = mode === "old" ? await withProvidersDisabled(exec) : await exec();
  return res;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").replace(/[\u2018\u2019\u201a\u2032]/g, "'").replace(/[\u201c\u201d\u201e\u2033]/g, '"').replace(/[\u2013\u2014]/g, "-").replace(/\u00a0/g, " ");
}

async function main() {
  const file = process.argv[2];
  const outDir = process.argv[3] ?? "/tmp/ad-bench";
  if (!file) { console.error("Usage: ... <pdf> [outDir]"); process.exit(1); }
  const baseName = file.split("/").pop()!.replace(/\.pdf$/i, "").replace(/\s+/g, "_");

  console.error("[dump] extract OLD …");
  const oldR = await extract(file, "old");
  await fs.writeFile(`${outDir}/${baseName}.old.txt`, oldR.text, "utf8");
  console.error(`[dump] OLD ${oldR.text.length} chars, ${oldR.pagesOCRd} pages OCR'd → ${baseName}.old.txt`);

  console.error("[dump] extract NEW …");
  const newR = await extract(file, "new");
  await fs.writeFile(`${outDir}/${baseName}.new.txt`, newR.text, "utf8");
  console.error(`[dump] NEW ${newR.text.length} chars, ${newR.pagesOCRd} pages OCR'd → ${baseName}.new.txt`);

  const probes = [
    // Strategy Paper probes
    "7.5-10", "10-12", "11-15",
    "88.1", "81.6", "72.4",
    "66,780", "17,682", "579",
    "Alexandre Hamaide", "Adrian Lee", "Morten Andersen",
    "Self Storage Group", "Flexistore",
    // Memo probes
    "164.1", "118.8", "422", "400m", "1.2 billion",
    "Bodhotell", "Bjarøy",
    "Christoffer Jonstang",
    "NOK 133m", "NOK 650",
    "€180", "€14m", "€36m",
    "45,6", "38,8",  // from the table
  ];

  const oldN = normalize(oldR.text);
  const newN = normalize(newR.text);
  console.log("\n=== FACT PROBE (is this token present in each extract?) ===");
  console.log(`${"probe".padEnd(30)} OLD   NEW`);
  for (const p of probes) {
    const pn = normalize(p);
    const o = oldN.includes(pn) ? "yes" : "NO";
    const n = newN.includes(pn) ? "yes" : "NO";
    const flag = (o === "yes" && n === "NO") ? "   ← lost by NEW" : (o === "NO" && n === "yes" ? "   ← only in NEW" : "");
    console.log(`${p.padEnd(30)} ${o.padEnd(5)} ${n.padEnd(5)}${flag}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
