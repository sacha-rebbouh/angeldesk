import JSZip from "jszip";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { extractFromExcel } from "../../excel/extractor";
import { extractFromPptx } from "../../pptx";

function buildWorkbookBuffer(): Buffer {
  const workbook = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.aoa_to_sheet([
    ["Metric", "2023", "2024", "Formula"],
    ["Revenue", 100, 120, { t: "n", f: "B2+C2", v: 220 }],
    ["Margin", "45%", "48%", ""],
  ]);

  const teamSheet = XLSX.utils.aoa_to_sheet([
    ["Name", "Role"],
    ["Alice", "CEO"],
    ["Bob", "CFO"],
  ]);

  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
  XLSX.utils.book_append_sheet(workbook, teamSheet, "Team");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

async function buildMinimalPptxBuffer(): Promise<Buffer> {
  const zip = new JSZip();

  zip.file(
    "ppt/slides/slide1.xml",
    [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">',
      "<p:cSld>",
      "<p:spTree>",
      "<p:sp>",
      '<p:txBody xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">',
      "<a:p>",
      "<a:r><a:t>Operating Margins</a:t></a:r>",
      "<a:r><a:t>Customer Rate Increases</a:t></a:r>",
      "</a:p>",
      "</p:txBody>",
      "</p:sp>",
      "</p:spTree>",
      "</p:cSld>",
      "</p:sld>",
    ].join("")
  );

  zip.file(
    "ppt/slides/slide2.xml",
    [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">',
      "<p:cSld>",
      "<p:spTree>",
      "<p:sp>",
      '<p:txBody xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">',
      "<a:p />",
      "</p:txBody>",
      "</p:sp>",
      "</p:spTree>",
      "</p:cSld>",
      "</p:sld>",
    ].join("")
  );

  return zip.generateAsync({ type: "nodebuffer" });
}

describe("extractFromExcel", () => {
  it("keeps sheets and values without dumping formulas into the prompt corpus", () => {
    const result = extractFromExcel(buildWorkbookBuffer());

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.metadata.sheetCount).toBe(2);
    expect(result.metadata.hasFormulas).toBe(false);
    expect(result.metadata.formulaCount).toBe(0);
    expect(result.sheets).toHaveLength(2);

    expect(result.sheets[0]).toMatchObject({
      name: "Summary",
      classification: "PNL",
      rowCount: 3,
      columnCount: 4,
      formulaCount: 0,
    });

    expect(result.sheets[0].data[1]).toEqual(["Revenue", "100", "120", "220"]);
    expect(result.sheets[0].textContent).toContain("Revenue: 100 | 120 | 220");
    expect(result.sheets[0].textContent).not.toMatch(/\[[A-Z]+\d+=/);
    expect(result.sheets[1].textContent).toContain("=== FEUILLE: Team ===");
  });

  it("bounds formula-heavy workbooks and stubs hidden/calculation sheets", () => {
    const workbook = XLSX.utils.book_new();
    for (let sheetIndex = 0; sheetIndex < 30; sheetIndex++) {
      const rows: unknown[][] = [["Metric", ...Array.from({ length: 15 }, (_, index) => `202${index % 10}`)]];
      for (let rowIndex = 1; rowIndex <= 500; rowIndex++) {
        rows.push([
          rowIndex % 10 === 0 ? `Revenue ${rowIndex}` : `Line ${rowIndex}`,
          ...Array.from({ length: 15 }, (_, colIndex) => ({
            t: "n",
            f: `B${rowIndex}+${colIndex}`,
            v: rowIndex * (colIndex + 1),
          })),
        ]);
      }
      const sheet = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, sheet, sheetIndex === 5 ? "Calcs" : `Sheet ${sheetIndex + 1}`);
    }
    workbook.Workbook = {
      Sheets: workbook.SheetNames.map((name) => ({ name, Hidden: name === "Sheet 7" ? 1 : 0 })),
    };

    const result = extractFromExcel(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.text.length).toBeLessThanOrEqual(120_000);
    expect(result.text).not.toMatch(/\[[A-Z]+\d+=/);
    expect(result.sheets.find((sheet) => sheet.name === "Calcs")).toMatchObject({
      classification: "CALCULATIONS",
      includedInPrompt: false,
    });
    expect(result.sheets.find((sheet) => sheet.name === "Sheet 7")).toMatchObject({
      hidden: true,
      includedInPrompt: false,
    });
    expect(result.text).toContain("STUB_ONLY");
  });

  it("handles legacy .xls buffers through the same bounded path", () => {
    const result = extractFromExcel(XLSX.write(XLSX.read(buildWorkbookBuffer()), { type: "buffer", bookType: "xls" }));

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.text.length).toBeLessThanOrEqual(120_000);
    expect(result.text).not.toMatch(/\[[A-Z]+\d+=/);
    expect(result.metadata.sheetCount).toBe(2);
  });
});

describe("extractFromPptx", () => {
  it("returns slide text and keeps empty slides explicit", async () => {
    const result = await extractFromPptx(await buildMinimalPptxBuffer());

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.slideCount).toBe(2);
    expect(result.text).toContain("--- Slide 1 ---");
    expect(result.text).toContain("Operating Margins");
    expect(result.text).toContain("Customer Rate Increases");
    expect(result.text).toContain("--- Slide 2 ---");
    expect(result.text).toContain("[Aucun texte natif extrait]");
  });
});
