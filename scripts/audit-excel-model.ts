import fs from "node:fs/promises";

import {
  extractFromExcel,
  buildExcelModelIntelligence,
  runExcelFinancialAudit,
  generateExcelAnalystReport,
} from "../src/services/excel";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: npx dotenv -e .env.local -- npx tsx scripts/audit-excel-model.ts <excel-path>");
    process.exit(1);
  }

  const buffer = await fs.readFile(file);
  const extraction = extractFromExcel(buffer);

  if (!extraction.success) {
    console.log(
      JSON.stringify(
        {
          file,
          success: false,
          error: extraction.error ?? "Excel extraction failed",
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const intelligence = buildExcelModelIntelligence(buffer, extraction);
  const financialAudit = runExcelFinancialAudit(extraction, intelligence);
  const analystReport = await generateExcelAnalystReport({
    extraction,
    intelligence,
    financialAudit,
  });

  const payload = {
    file,
    workbook: extraction.metadata,
    workbookAudit: extraction.workbookAudit,
    intelligence: {
      workbookMap: intelligence.workbookMap,
      warnings: intelligence.warnings,
      drivers: intelligence.drivers,
      outputs: intelligence.outputs,
      hardcodes: intelligence.hardcodes,
      hiddenStructures: intelligence.hiddenStructures,
      disconnectedCalcs: intelligence.disconnectedCalcs,
      criticalDependencies: intelligence.criticalDependencies,
    },
    financialAudit,
    analystReport: analystReport?.report ?? null,
    analystCost: analystReport?.cost ?? null,
  };

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
