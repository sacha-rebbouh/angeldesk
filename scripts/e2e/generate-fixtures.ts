/**
 * Phase 5 — E2E release gate: generate the smoke fixtures.
 *
 * Produces two PDFs in `scripts/e2e/fixtures/`, both fully reproducible from
 * code (no committed binaries, no external download):
 *
 *   - text-native.pdf — selectable text via pdf-lib. `extractTextFromPDF` /
 *     the native provider must read this corpus without needing OCR.
 *
 *   - image-only.pdf  — the page above, rasterized via pdf-to-img and
 *     re-embedded as a PNG inside a new PDF with NO text layer. Forces the
 *     pipeline onto the OCR path (scenario 2: scanned-style upload).
 *
 * Uses ONLY deps already in the project (`pdf-lib`, `pdf-to-img`).
 *
 * Run: npx dotenv -e .env.local -- npx tsx scripts/e2e/generate-fixtures.ts
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, "fixtures");

const CORPUS = [
  "Angel Desk — E2E smoke fixture (text-native)",
  "",
  "Pithos — Series A pitch deck",
  "ARR: 1.2M EUR · Burn: 80k / month · Runway: 14 months",
  "Team: 12 FTE, 3 founders",
  "Market: SaaS finance ops — TAM 8B EUR, CAGR 18 percent",
  "Round: 4M EUR at 18M pre-money",
  "",
  "This corpus must be read by the native PDF text extraction without OCR.",
];

async function buildTextNativePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  let y = 800;
  for (const line of CORPUS) {
    page.drawText(line, { x: 50, y, font, size: 12, color: rgb(0, 0, 0) });
    y -= 20;
  }
  return doc.save();
}

async function buildImageOnlyPdfFromTextNative(textNativeBytes: Uint8Array): Promise<Uint8Array> {
  // Rasterize page 1 of the text-native PDF, then re-embed the resulting PNG
  // into a fresh PDF with no text layer. `pdf-to-img` is the same renderer
  // the OCR path uses for the `pdfjs-legacy` rollback — already a project
  // dep, no extra footprint.
  const { pdf } = await import("pdf-to-img");
  const doc = await pdf(Buffer.from(textNativeBytes), { scale: 2 });
  const pngBuffer = Buffer.from(await doc.getPage(1));

  const out = await PDFDocument.create();
  const png = await out.embedPng(pngBuffer);
  // Drop back to ~72 DPI so the resulting PDF is page-sized, not 4x.
  const width = png.width / 2;
  const height = png.height / 2;
  const page = out.addPage([width, height]);
  page.drawImage(png, { x: 0, y: 0, width, height });
  return out.save();
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const textNativePath = resolve(OUT_DIR, "text-native.pdf");
  const textNative = await buildTextNativePdf();
  await writeFile(textNativePath, textNative);
  console.log(`  wrote ${textNativePath} (${textNative.length} bytes)`);

  const imageOnlyPath = resolve(OUT_DIR, "image-only.pdf");
  const sourceBytes = await readFile(textNativePath); // re-read to detach types
  const imageOnly = await buildImageOnlyPdfFromTextNative(sourceBytes);
  await writeFile(imageOnlyPath, imageOnly);
  console.log(`  wrote ${imageOnlyPath} (${imageOnly.length} bytes)`);

  console.log("\nFixtures ready.");
}

main().catch((error) => {
  console.error("generate-fixtures FAILED:", error);
  process.exit(1);
});
