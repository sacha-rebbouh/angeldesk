import fs from "node:fs/promises";

import {
  buildExcelModelIntelligence,
  extractFromExcel,
  runExcelFinancialAudit,
} from "../src/services/excel";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node --import tsx scripts/inspect-excel-model.ts <excel-path>");
    process.exit(1);
  }

  const buffer = await fs.readFile(file);
  const extraction = extractFromExcel(buffer);
  if (!extraction.success) {
    console.error(JSON.stringify({ success: false, error: extraction.error ?? "Excel extraction failed" }, null, 2));
    process.exit(1);
  }

  const intelligence = buildExcelModelIntelligence(buffer, extraction);
  const financialAudit = runExcelFinancialAudit(extraction, intelligence);

  const summary = {
    workbook: extraction.metadata,
    workbookAudit: extraction.workbookAudit,
    outputs: {
      canonical: intelligence.outputs.canonical.slice(0, 12),
      top: intelligence.outputs.top.slice(0, 20),
    },
    hardcodes: {
      highSeverityCount: intelligence.hardcodes.highSeverityCount,
      top: intelligence.hardcodes.top.slice(0, 20),
    },
    criticalDependencies: intelligence.criticalDependencies.slice(0, 20),
    disconnectedCalcs: intelligence.disconnectedCalcs.slice(0, 20),
    financialAudit: {
      overallRisk: financialAudit.overallRisk,
      consistencyFlags: financialAudit.consistencyFlags,
      reconciliationFlags: financialAudit.reconciliationFlags,
      plausibilityFlags: financialAudit.plausibilityFlags,
      heroicAssumptionFlags: financialAudit.heroicAssumptionFlags,
      dependencyFlags: financialAudit.dependencyFlags,
      keyMetrics: financialAudit.keyMetrics.slice(0, 20),
      topSensitivities: financialAudit.topSensitivities,
      warnings: financialAudit.warnings,
    },
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
