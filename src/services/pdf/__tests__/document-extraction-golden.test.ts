import JSZip from "jszip";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { extractFromExcel } from "../../excel/extractor";
import { extractFromDocx } from "../../docx";
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

async function buildPptxWithTableAndChartBuffer(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "ppt/slides/slide1.xml",
    [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">',
      "<p:cSld><p:spTree>",
      "<p:graphicFrame><a:graphic><a:graphicData><a:tbl>",
      "<a:tr>",
      "<a:tc><a:txBody><a:p><a:r><a:t>Metric</a:t></a:r></a:p></a:txBody></a:tc>",
      "<a:tc><a:txBody><a:p><a:r><a:t>2024</a:t></a:r></a:p></a:txBody></a:tc>",
      "</a:tr>",
      "<a:tr>",
      "<a:tc><a:txBody><a:p><a:r><a:t>Revenue</a:t></a:r></a:p></a:txBody></a:tc>",
      "<a:tc><a:txBody><a:p><a:r><a:t>120</a:t></a:r></a:p></a:txBody></a:tc>",
      "</a:tr>",
      "</a:tbl></a:graphicData></a:graphic></p:graphicFrame>",
      "</p:spTree></p:cSld>",
      "</p:sld>",
    ].join("")
  );
  zip.file(
    "ppt/charts/chart1.xml",
    [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">',
      "<c:chart>",
      "<c:title><c:tx><c:rich><a:p><a:r><a:t>NRI Growth</a:t></a:r></a:p></c:rich></c:tx></c:title>",
      "<c:plotArea><c:barChart><c:ser>",
      "<c:cat><c:strRef><c:strCache><c:pt idx=\"0\"><c:v>2024</c:v></c:pt><c:pt idx=\"1\"><c:v>2025</c:v></c:pt></c:strCache></c:strRef></c:cat>",
      "<c:val><c:numRef><c:numCache><c:pt idx=\"0\"><c:v>2.3</c:v></c:pt><c:pt idx=\"1\"><c:v>2.5</c:v></c:pt></c:numCache></c:numRef></c:val>",
      "</c:ser></c:barChart></c:plotArea>",
      "</c:chart>",
      "</c:chartSpace>",
    ].join("")
  );
  zip.file("ppt/media/image1.png", Buffer.from("fake-image"));
  return zip.generateAsync({ type: "nodebuffer" });
}

async function buildMinimalDocxWithTableAndImageBuffer(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
      '<Default Extension="xml" ContentType="application/xml"/>',
      '<Default Extension="png" ContentType="image/png"/>',
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
      "</Types>",
    ].join("")
  );
  zip.file("_rels/.rels", "");
  zip.file(
    "word/document.xml",
    [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      "<w:body>",
      "<w:p><w:r><w:t>Investment memo</w:t></w:r></w:p>",
      "<w:tbl>",
      "<w:tr><w:tc><w:p><w:r><w:t>Metric</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>2025</w:t></w:r></w:p></w:tc></w:tr>",
      "<w:tr><w:tc><w:p><w:r><w:t>Revenue</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>120</w:t></w:r></w:p></w:tc></w:tr>",
      "</w:tbl>",
      "</w:body>",
      "</w:document>",
    ].join("")
  );
  zip.file("word/media/image1.png", Buffer.from("fake-image"));
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

  it("extracts native PPTX table rows and chart values when present", async () => {
    const result = await extractFromPptx(await buildPptxWithTableAndChartBuffer());

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.slides[0].tables[0]).toEqual([
      ["Metric", "2024"],
      ["Revenue", "120"],
    ]);
    expect(result.charts[0]).toMatchObject({
      title: "NRI Growth",
      values: [
        { label: "2024", value: "2.3" },
        { label: "2025", value: "2.5" },
      ],
    });
    expect(result.embeddedMedia[0]).toMatchObject({
      name: "ppt/media/image1.png",
      contentType: "image/png",
    });
    expect(result.warnings[0]).toContain("embedded media");
    expect(result.text).toContain("Revenue | 120");
    expect(result.text).toContain("2025: 2.5");
  });
});

describe("extractFromDocx", () => {
  it("extracts native DOCX table rows and flags embedded media for review", async () => {
    const result = await extractFromDocx(await buildMinimalDocxWithTableAndImageBuffer());

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.text).toContain("Investment memo");
    expect(result.tables[0]).toEqual([
      ["Metric", "2025"],
      ["Revenue", "120"],
    ]);
    expect(result.sections[0].tables[0][1]).toEqual(["Revenue", "120"]);
    expect(result.embeddedMedia[0]).toMatchObject({
      name: "word/media/image1.png",
      contentType: "image/png",
    });
    expect(result.warnings[0]).toContain("embedded media");
  });
});
