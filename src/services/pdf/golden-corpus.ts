import type { ExtractionManifest } from "./ocr-service";
import { getBlockingPageNumbersFromManifest } from "../documents/extraction-runs";

export interface GoldenPageExpectation {
  pageNumber: number;
  status?: "ready" | "ready_with_warnings" | "needs_review" | "failed" | "skipped";
  pageClass?: string | null;
  structureDependency?: string | null;
  semanticSufficiency?: string | null;
  blocksAnalysis?: boolean;
}

export interface GoldenDocumentExpectation {
  blockingPages?: number[];
  inspectionPages?: number[];
  pageExpectations?: GoldenPageExpectation[];
}

export interface GoldenDocumentSpec {
  label: string;
  documentPath: string;
  expectation?: GoldenDocumentExpectation;
}

export interface GoldenAuditSnapshot {
  blockingPages: number[];
  inspectionPages: number[];
  pages: Array<{
    pageNumber: number;
    status: string;
    pageClass: string | null;
    structureDependency: string | null;
    semanticSufficiency: string | null;
    blocksAnalysis: boolean;
  }>;
}

export function buildGoldenAuditSnapshot(manifest: ExtractionManifest): GoldenAuditSnapshot {
  const blockingPages = getBlockingPageNumbersFromManifest(manifest);
  const blockingSet = new Set(blockingPages);

  return {
    blockingPages,
    inspectionPages: manifest.pages
      .filter((page) => page.status === "needs_review" || page.status === "failed")
      .map((page) => page.pageNumber),
    pages: manifest.pages.map((page) => ({
      pageNumber: page.pageNumber,
      status: page.status,
      pageClass: page.semanticAssessment?.pageClass ?? null,
      structureDependency: page.semanticAssessment?.structureDependency ?? null,
      semanticSufficiency: page.semanticAssessment?.semanticSufficiency ?? null,
      blocksAnalysis: blockingSet.has(page.pageNumber),
    })),
  };
}

export function compareGoldenAudit(
  expectation: GoldenDocumentExpectation,
  snapshot: GoldenAuditSnapshot
): string[] {
  const diffs: string[] = [];

  if (expectation.blockingPages) {
    const actual = snapshot.blockingPages.join(",");
    const expected = expectation.blockingPages.join(",");
    if (actual !== expected) {
      diffs.push(`blockingPages mismatch: expected [${expected}] but got [${actual}]`);
    }
  }

  if (expectation.inspectionPages) {
    const actual = snapshot.inspectionPages.join(",");
    const expected = expectation.inspectionPages.join(",");
    if (actual !== expected) {
      diffs.push(`inspectionPages mismatch: expected [${expected}] but got [${actual}]`);
    }
  }

  for (const pageExpectation of expectation.pageExpectations ?? []) {
    const actual = snapshot.pages.find((page) => page.pageNumber === pageExpectation.pageNumber);
    if (!actual) {
      diffs.push(`page ${pageExpectation.pageNumber} missing from snapshot`);
      continue;
    }

    if (pageExpectation.status && actual.status !== pageExpectation.status) {
      diffs.push(`page ${pageExpectation.pageNumber} status mismatch: expected ${pageExpectation.status} but got ${actual.status}`);
    }
    if (pageExpectation.pageClass !== undefined && actual.pageClass !== pageExpectation.pageClass) {
      diffs.push(`page ${pageExpectation.pageNumber} pageClass mismatch: expected ${pageExpectation.pageClass} but got ${actual.pageClass}`);
    }
    if (pageExpectation.structureDependency !== undefined && actual.structureDependency !== pageExpectation.structureDependency) {
      diffs.push(`page ${pageExpectation.pageNumber} structureDependency mismatch: expected ${pageExpectation.structureDependency} but got ${actual.structureDependency}`);
    }
    if (pageExpectation.semanticSufficiency !== undefined && actual.semanticSufficiency !== pageExpectation.semanticSufficiency) {
      diffs.push(`page ${pageExpectation.pageNumber} semanticSufficiency mismatch: expected ${pageExpectation.semanticSufficiency} but got ${actual.semanticSufficiency}`);
    }
    if (pageExpectation.blocksAnalysis !== undefined && actual.blocksAnalysis !== pageExpectation.blocksAnalysis) {
      diffs.push(`page ${pageExpectation.pageNumber} blocksAnalysis mismatch: expected ${pageExpectation.blocksAnalysis} but got ${actual.blocksAnalysis}`);
    }
  }

  return diffs;
}
