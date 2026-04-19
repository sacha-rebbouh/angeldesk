import fs from "node:fs/promises";

import {
  extractFromExcel,
  buildExcelModelIntelligence,
  runExcelFinancialAudit,
  generateExcelAnalystReportForModel,
} from "../src/services/excel";
import type { ModelKey } from "../src/services/openrouter/client";

async function runForModel(file: string, model: ModelKey) {
  const buffer = await fs.readFile(file);
  const extraction = extractFromExcel(buffer);

  if (!extraction.success) {
    throw new Error(extraction.error ?? "Excel extraction failed");
  }

  const intelligence = buildExcelModelIntelligence(buffer, extraction);
  const financialAudit = runExcelFinancialAudit(extraction, intelligence);

  const startedAt = Date.now();
  try {
    const result = await generateExcelAnalystReportForModel(
      {
        extraction,
        intelligence,
        financialAudit,
      },
      model
    );
    const latencyMs = Date.now() - startedAt;

    return {
      model,
      usedModel: result?.model ?? null,
      latencyMs,
      cost: result?.cost ?? null,
      usage: result?.usage ?? null,
      report: result?.report ?? null,
      error: null,
      baseline: {
        overallRisk: financialAudit.overallRisk,
        workbookWarningFlags: extraction.workbookAudit.warningFlags,
        canonicalOutputs: intelligence.outputs.canonical.slice(0, 8).map((output) => ({
          sheet: output.sheet,
          cell: output.cell,
          label: output.label,
          metricFamily: output.metricFamily,
        })),
        keyMetrics: financialAudit.keyMetrics.slice(0, 8).map((metric) => ({
          label: metric.label,
          value: metric.value,
          sheet: metric.sheet,
          category: metric.category,
        })),
      },
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    return {
      model,
      usedModel: null,
      latencyMs,
      cost: null,
      usage: null,
      report: null,
      error: error instanceof Error ? error.message : String(error),
      baseline: {
        overallRisk: financialAudit.overallRisk,
        workbookWarningFlags: extraction.workbookAudit.warningFlags,
        canonicalOutputs: intelligence.outputs.canonical.slice(0, 8).map((output) => ({
          sheet: output.sheet,
          cell: output.cell,
          label: output.label,
          metricFamily: output.metricFamily,
        })),
        keyMetrics: financialAudit.keyMetrics.slice(0, 8).map((metric) => ({
          label: metric.label,
          value: metric.value,
          sheet: metric.sheet,
          category: metric.category,
        })),
      },
    };
  }
}

async function main() {
  const file = process.argv[2];
  const models = (process.argv.slice(3) as ModelKey[]).length > 0
    ? (process.argv.slice(3) as ModelKey[])
    : (["CLAUDE_SONNET_45", "GEMINI_3_FLASH"] as ModelKey[]);

  if (!file) {
    console.error(
      "Usage: npx dotenv -e .env.local -- node --import tsx scripts/compare-excel-analyst-models.ts <excel-path> [MODEL...]"
    );
    process.exit(1);
  }

  const runs = [];
  for (const model of models) {
    runs.push(await runForModel(file, model));
  }

  console.log(JSON.stringify({ file, runs }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
