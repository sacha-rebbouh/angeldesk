import fs from "node:fs/promises";
import path from "node:path";

import { extractTextFromPDF, smartExtract } from "../src/services/pdf";
import {
  buildGoldenAuditSnapshot,
  buildGoldenNativePdfSnapshot,
  buildGoldenStackComparisonSnapshot,
  compareGoldenAudit,
  type GoldenDocumentSpec,
} from "../src/services/pdf/golden-corpus";

async function main() {
  const [, , specPathArg, ...rest] = process.argv;
  if (!specPathArg) {
    throw new Error("Usage: npx tsx scripts/check-document-golden.ts <spec.json> [--update]");
  }

  const update = rest.includes("--update");
  const specPath = path.resolve(specPathArg);
  const raw = await fs.readFile(specPath, "utf8");
  const spec = JSON.parse(raw) as GoldenDocumentSpec;
  const buffer = await fs.readFile(spec.documentPath);
  const native = await extractTextFromPDF(buffer);

  const result = await smartExtract(buffer, {
    qualityThreshold: 40,
    maxOCRPages: Number.POSITIVE_INFINITY,
    autoOCR: true,
    strict: true,
  });
  const snapshot = buildGoldenAuditSnapshot(result.manifest);
  const nativeSnapshot = buildGoldenNativePdfSnapshot(native);
  const stackComparison = buildGoldenStackComparisonSnapshot(nativeSnapshot, snapshot);

  if (update || !spec.expectation) {
    const updated = {
      ...spec,
      expectation: {
        blockingPages: snapshot.blockingPages,
        inspectionPages: snapshot.inspectionPages,
        summary: {
          manifestStatus: snapshot.manifestStatus,
          pageCount: snapshot.pageCount,
          pagesProcessed: snapshot.pagesProcessed,
          pagesSucceeded: snapshot.pagesSucceeded,
          pagesFailed: snapshot.pagesFailed,
          pagesSkipped: snapshot.pagesSkipped,
          coverageRatio: snapshot.coverageRatio,
          blockerCount: snapshot.summary.blockerCount,
          inspectionCount: snapshot.summary.inspectionCount,
          statusCounts: snapshot.summary.statusCounts,
          methodCounts: snapshot.summary.methodCounts,
          extractionTierCounts: snapshot.summary.extractionTierCounts,
          pageClassCounts: snapshot.summary.pageClassCounts,
          structureDependencyCounts: snapshot.summary.structureDependencyCounts,
          semanticSufficiencyCounts: snapshot.summary.semanticSufficiencyCounts,
          labelValueIntegrityCounts: snapshot.summary.labelValueIntegrityCounts,
          evidenceCounts: snapshot.summary.evidenceCounts,
          quality: {
            avgQualityScore: snapshot.summary.quality.avgQualityScore ?? undefined,
            minQualityScore: snapshot.summary.quality.minQualityScore ?? undefined,
            maxVisualRiskScore: snapshot.summary.quality.maxVisualRiskScore ?? undefined,
            avgVisualRiskScore: snapshot.summary.quality.avgVisualRiskScore ?? undefined,
            maxAnalyticalValueScore: snapshot.summary.quality.maxAnalyticalValueScore ?? undefined,
            avgAnalyticalValueScore: snapshot.summary.quality.avgAnalyticalValueScore ?? undefined,
          },
        },
        pageExpectations: snapshot.pages
          .filter((page) => page.blocksAnalysis || page.status !== "ready")
          .map((page) => ({
            pageNumber: page.pageNumber,
            status: page.status,
            method: page.method as "native_text" | "ocr" | "hybrid" | "skipped",
            extractionTier: page.extractionTier as "native_only" | "standard_ocr" | "high_fidelity" | "supreme",
            pageClass: page.pageClass,
            structureDependency: page.structureDependency,
            semanticSufficiency: page.semanticSufficiency,
            labelValueIntegrity: page.labelValueIntegrity,
            qualityScore: page.qualityScore ?? undefined,
            visualRiskScore: page.visualRiskScore,
            analyticalValueScore: page.analyticalValueScore ?? undefined,
            hasTables: page.hasTables,
            hasCharts: page.hasCharts,
            hasFinancialKeywords: page.hasFinancialKeywords,
            hasTeamKeywords: page.hasTeamKeywords,
            hasMarketKeywords: page.hasMarketKeywords,
            minimumEvidenceIncludes: page.minimumEvidence,
            blocksAnalysis: page.blocksAnalysis,
          })),
      },
    };
    await fs.writeFile(specPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ updated: true, specPath, nativeSnapshot, snapshot, stackComparison }, null, 2));
    return;
  }

  const diffs = compareGoldenAudit(spec.expectation, snapshot);
  console.log(JSON.stringify({ ok: diffs.length === 0, diffs, nativeSnapshot, snapshot, stackComparison }, null, 2));
  if (diffs.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
