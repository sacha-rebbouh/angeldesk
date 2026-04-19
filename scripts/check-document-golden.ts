import fs from "node:fs/promises";
import path from "node:path";

import { smartExtract } from "../src/services/pdf";
import {
  buildGoldenAuditSnapshot,
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

  const result = await smartExtract(buffer, {
    qualityThreshold: 40,
    maxOCRPages: Number.POSITIVE_INFINITY,
    autoOCR: true,
    strict: true,
  });
  const snapshot = buildGoldenAuditSnapshot(result.manifest);

  if (update || !spec.expectation) {
    const updated = {
      ...spec,
      expectation: {
        blockingPages: snapshot.blockingPages,
        inspectionPages: snapshot.inspectionPages,
        pageExpectations: snapshot.pages
          .filter((page) => page.blocksAnalysis || page.status !== "ready")
          .map((page) => ({
            pageNumber: page.pageNumber,
            status: page.status,
            pageClass: page.pageClass,
            structureDependency: page.structureDependency,
            semanticSufficiency: page.semanticSufficiency,
            blocksAnalysis: page.blocksAnalysis,
          })),
      },
    };
    await fs.writeFile(specPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ updated: true, specPath, snapshot }, null, 2));
    return;
  }

  const diffs = compareGoldenAudit(spec.expectation, snapshot);
  console.log(JSON.stringify({ ok: diffs.length === 0, diffs, snapshot }, null, 2));
  if (diffs.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
