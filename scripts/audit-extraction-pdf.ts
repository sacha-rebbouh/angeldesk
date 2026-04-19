import fs from "node:fs/promises";

import { smartExtract } from "../src/services/pdf";
import { getBlockingPageNumbersFromManifest } from "../src/services/documents/extraction-runs";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: npx dotenv -e .env.local -- npx tsx scripts/audit-extraction-pdf.ts <pdf-path>");
    process.exit(1);
  }

  const buffer = await fs.readFile(file);
  const result = await smartExtract(buffer, {
    qualityThreshold: 40,
    maxOCRPages: Number.POSITIVE_INFINITY,
    autoOCR: true,
    strict: true,
  });

  const blockingPages = getBlockingPageNumbersFromManifest(result.manifest);
  const inspectionPages = result.manifest.pages
    .filter((page) => page.status === "needs_review" || page.status === "failed")
    .map((page) => page.pageNumber);

  const payload = {
    file,
    method: result.method,
    quality: result.quality,
    pagesOCRd: result.pagesOCRd,
    estimatedCost: result.estimatedCost,
    manifestStatus: result.manifest.status,
    blockingPages,
    inspectionPages,
    pages: result.manifest.pages.map((page) => ({
      pageNumber: page.pageNumber,
      status: page.status,
      method: page.method,
      charCount: page.charCount,
      wordCount: page.wordCount,
      qualityScore: page.qualityScore,
      extractionTier: page.extractionTier,
      visualRiskScore: page.visualRiskScore,
      visualRiskReasons: page.visualRiskReasons,
      semanticAssessment: page.semanticAssessment ?? page.artifact?.semanticAssessment ?? null,
      error: page.error ?? null,
    })),
  };

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
