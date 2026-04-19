import fs from "node:fs/promises";

import { extractTextFromPDF, smartExtract } from "../src/services/pdf";
import {
  buildGoldenAuditSnapshot,
  buildGoldenNativePdfSnapshot,
  buildGoldenStackComparisonSnapshot,
} from "../src/services/pdf/golden-corpus";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: npx dotenv -e .env.local -- npx tsx scripts/audit-extraction-pdf.ts <pdf-path>");
    process.exit(1);
  }

  const buffer = await fs.readFile(file);
  const native = await extractTextFromPDF(buffer);
  const result = await smartExtract(buffer, {
    qualityThreshold: 40,
    maxOCRPages: Number.POSITIVE_INFINITY,
    autoOCR: true,
    strict: true,
  });
  const nativeSnapshot = buildGoldenNativePdfSnapshot(native);
  const strictSnapshot = buildGoldenAuditSnapshot(result.manifest);
  const stackComparison = buildGoldenStackComparisonSnapshot(nativeSnapshot, strictSnapshot);

  const payload = {
    file,
    method: result.method,
    quality: result.quality,
    pagesOCRd: result.pagesOCRd,
    estimatedCost: result.estimatedCost,
    nativeSnapshot,
    strictSnapshot,
    stackComparison,
    rawPages: result.manifest.pages.map((page) => ({
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
