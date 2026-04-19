import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { extractFromExcel } from "../extractor";
import { buildExcelModelIntelligence } from "../model-intelligence";
import { runExcelFinancialAudit } from "../financial-audit";

function buildModelBuffer() {
  const workbook = XLSX.utils.book_new();

  const assumptions = XLSX.utils.aoa_to_sheet([
    ["Metric", "Value"],
    ["Occupancy", "98%"],
    ["LTV", "82%"],
    ["Exit Yield", "5.0%"],
  ]);

  const outputs = XLSX.utils.aoa_to_sheet([
    ["Metric", "Value"],
    ["Revenue", { t: "n", f: "Assumptions!B2*1000", v: 980 }],
    ["EBITDA", { t: "n", f: "B2*0.96", v: 940.8 }],
    ["IRR", { t: "n", f: "25%", v: 0.25 }],
    ["MOIC", { t: "n", f: "3.2", v: 3.2 }],
    ["Manual Output", "123"],
  ]);

  const calcs = XLSX.utils.aoa_to_sheet([
    ["Helper", "Value"],
    ["Unused Calc", { t: "n", f: "1+1", v: 2 }],
  ]);

  XLSX.utils.book_append_sheet(workbook, assumptions, "Assumptions");
  XLSX.utils.book_append_sheet(workbook, outputs, "Outputs");
  XLSX.utils.book_append_sheet(workbook, calcs, "UW");
  workbook.Workbook = {
    Sheets: [
      { name: "Assumptions", Hidden: 0 },
      { name: "Outputs", Hidden: 0 },
      { name: "UW", Hidden: 1 },
    ],
  };

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function buildPresentationHeavyModelBuffer() {
  const workbook = XLSX.utils.book_new();

  const assumptions = XLSX.utils.aoa_to_sheet([
    ["Metric", "Value"],
    ["Purchase Price", "100"],
    ["Start Date", "2025-01-01"],
  ]);

  const outputs = XLSX.utils.aoa_to_sheet([
    ["Target", 2025, 2026],
    ["Asset / Location Info", 50, 55],
    ["Revenue", { t: "n", f: "Assumptions!B2*10", v: 1000 }, { t: "n", f: "Assumptions!B2*11", v: 1100 }],
    ["IRR", { t: "n", f: "25%", v: 0.25 }, ""],
  ]);

  const calcs = XLSX.utils.aoa_to_sheet([
    ["Helper", { t: "s", f: "MID(CELL(\"filename\",$A$1),1,5)", v: "UW" }],
    ["Entry", { t: "s", f: "IF(Assumptions!B3<>\"\",\"Entry\",\"\")", v: "Entry" }],
    ["Date", { t: "n", f: "EOMONTH(Assumptions!B3,0)", v: 45688 }],
  ]);

  XLSX.utils.book_append_sheet(workbook, assumptions, "Assumptions");
  XLSX.utils.book_append_sheet(workbook, outputs, "Outputs");
  XLSX.utils.book_append_sheet(workbook, calcs, "UW");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function buildReconciliationMismatchBuffer() {
  const workbook = XLSX.utils.book_new();

  const assumptions = XLSX.utils.aoa_to_sheet([
    ["Metric", "Value"],
    ["Entry Date", "2025"],
  ]);

  const lbo = XLSX.utils.aoa_to_sheet([
    ["Metric", "2025", "2026", "2027", "2028", "2029", "2030", "2031"],
    ["Total Operating Revenue", "300", "", "", "", "", "", ""],
    ["Adjusted EBITDA (excl. Pithos fee)", "120", "", "", "", "", "", ""],
    ["Return", "15.0%", "", "", "", "", "", ""],
  ]);

  const bkk = XLSX.utils.aoa_to_sheet([
    ["Metric", "2025", "2026", "2027", "2028", "2029", "2030", "2031"],
    ["Total Operating Revenue", "100", "", "", "", "", "", ""],
    ["Adjusted EBITDA (excl. Pithos fee)", "60", "", "", "", "", "", ""],
    ["Return", "12.0%", "", "", "", "", "", ""],
  ]);

  const glo = XLSX.utils.aoa_to_sheet([
    ["Metric", "2025", "2026", "2027", "2028", "2029", "2030", "2031"],
    ["Total Operating Revenue", "100", "", "", "", "", "", ""],
    ["Adjusted EBITDA (excl. Pithos fee)", "40", "", "", "", "", "", ""],
    ["Return", "11.0%", "", "", "", "", "", ""],
  ]);

  XLSX.utils.book_append_sheet(workbook, assumptions, "Assumptions");
  XLSX.utils.book_append_sheet(workbook, lbo, "LBO Overview");
  XLSX.utils.book_append_sheet(workbook, bkk, "BKK");
  XLSX.utils.book_append_sheet(workbook, glo, "GLO");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function buildDependencyEngineBuffer() {
  const workbook = XLSX.utils.book_new();

  const assumptions = XLSX.utils.aoa_to_sheet([
    ["Metric", "Value"],
    ["Rent Growth", "5%"],
  ]);

  const bkk = XLSX.utils.aoa_to_sheet([
    ["Metric", "Value"],
    ["Revenue", "100"],
  ]);

  const glo = XLSX.utils.aoa_to_sheet([
    ["Metric", "Value"],
    ["Revenue", "120"],
  ]);

  const outputs = XLSX.utils.aoa_to_sheet([
    ["Metric", "Value"],
    ["Total Revenue", { t: "n", f: "SUM('BKK:GLO'!B2)", v: 220 }],
    ["Revenue with Growth", { t: "n", f: "RevenueGrowth*1000", v: 50 }],
  ]);

  XLSX.utils.book_append_sheet(workbook, assumptions, "Assumptions");
  XLSX.utils.book_append_sheet(workbook, bkk, "BKK");
  XLSX.utils.book_append_sheet(workbook, glo, "GLO");
  XLSX.utils.book_append_sheet(workbook, outputs, "LBO Overview");
  workbook.Workbook = {
    Sheets: [
      { name: "Assumptions", Hidden: 0 },
      { name: "BKK", Hidden: 0 },
      { name: "GLO", Hidden: 0 },
      { name: "LBO Overview", Hidden: 0 },
    ],
    Names: [
      { Name: "RevenueGrowth", Ref: "Assumptions!$B$2" },
    ],
  };

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function buildNormalizedReconciliationBuffer() {
  const workbook = XLSX.utils.book_new();

  const lbo = XLSX.utils.aoa_to_sheet([
    ["", "", "Cap Stack"],
    ["", "", "NOK m"],
    ["Total Operating Revenue", "300"],
    ["Adjusted EBITDA (excl. Pithos fee)", "120"],
  ]);

  const bkk = XLSX.utils.aoa_to_sheet([
    ["Metric", "Value"],
    ["Total Operating Revenue (nok '000)", "100,000"],
    ["Adjusted EBITDA (excl. Pithos fee) (nok '000)", "40,000"],
  ]);

  const glo = XLSX.utils.aoa_to_sheet([
    ["Metric", "Value"],
    ["Total Operating Revenue (nok '000)", "200,000"],
    ["Adjusted EBITDA (excl. Pithos fee) (nok '000)", "80,000"],
  ]);

  XLSX.utils.book_append_sheet(workbook, lbo, "LBO Overview");
  XLSX.utils.book_append_sheet(workbook, bkk, "BKK");
  XLSX.utils.book_append_sheet(workbook, glo, "GLO");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function buildIncompatibleUnitBuffer() {
  const workbook = XLSX.utils.book_new();

  const lbo = XLSX.utils.aoa_to_sheet([
    ["Metric", "Value"],
    ["Total Operating Revenue", "300"],
    ["", "NOK m"],
  ]);

  const bkk = XLSX.utils.aoa_to_sheet([
    ["Metric", "Value"],
    ["Total Operating Revenue", "22,000 NOK psm"],
  ]);

  const glo = XLSX.utils.aoa_to_sheet([
    ["Metric", "Value"],
    ["Total Operating Revenue", "18,000 NOK psm"],
  ]);

  XLSX.utils.book_append_sheet(workbook, lbo, "LBO Overview");
  XLSX.utils.book_append_sheet(workbook, bkk, "BKK");
  XLSX.utils.book_append_sheet(workbook, glo, "GLO");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function buildLocalOutputMatrixBuffer() {
  const workbook = XLSX.utils.book_new();

  const outputs = XLSX.utils.aoa_to_sheet([
    ["", "", "Portfolio Overview"],
    ["Code", "City", "Occupancy", "Projected Occupancy", "IRR"],
    ["AST1", "Asset One", "90.0%", { t: "n", f: "C3", v: 0.9 }, { t: "n", f: "D3*0.2", v: 0.18 }],
    ["AST2", "Asset Two", "85.0%", { t: "n", f: "C4", v: 0.85 }, { t: "n", f: "D4*0.22", v: 0.187 }],
  ]);

  XLSX.utils.book_append_sheet(workbook, outputs, "Portfolio Overview");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function buildDisconnectedSummaryBlockBuffer() {
  const workbook = XLSX.utils.book_new();

  const assumptions = XLSX.utils.aoa_to_sheet([
    ["Metric", "Value"],
    ["Base", "100"],
  ]);

  const uw = XLSX.utils.aoa_to_sheet([
    ["Metric", "Jan", "Feb", "Mar", "Apr"],
    ["Revenue", { t: "n", f: "SUMIFS($C2:$E2,$C$1:$E$1,C$1)", v: 100 }, { t: "n", f: "SUMIFS($C2:$E2,$C$1:$E$1,D$1)", v: 100 }, { t: "n", f: "SUMIFS($C2:$E2,$C$1:$E$1,E$1)", v: 100 }, ""],
    ["Costs", { t: "n", f: "INDEX(C2:E2,1,1)", v: 100 }, { t: "n", f: "INDEX(C2:E2,1,2)", v: 100 }, { t: "n", f: "INDEX(C2:E2,1,3)", v: 100 }, ""],
    ["Total", { t: "n", f: "SUM(C2:E2)", v: 300 }, "", "", ""],
  ]);

  const outputs = XLSX.utils.aoa_to_sheet([
    ["Metric", "Value"],
    ["Revenue", { t: "n", f: "Assumptions!B2*10", v: 1000 }],
  ]);

  XLSX.utils.book_append_sheet(workbook, assumptions, "Assumptions");
  XLSX.utils.book_append_sheet(workbook, uw, "UW");
  XLSX.utils.book_append_sheet(workbook, outputs, "Outputs");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function buildTransitiveHardcodePathBuffer() {
  const workbook = XLSX.utils.book_new();

  const assumptions = XLSX.utils.aoa_to_sheet([
    ["Metric", "Value"],
    ["Base Growth", "5%"],
  ]);

  const uw = XLSX.utils.aoa_to_sheet([
    ["Metric", "Value"],
    ["Stabilized Occupancy", "90.0%"],
    ["Revenue Bridge", { t: "n", f: "B2*1000", v: 900 }],
  ]);

  const outputs = XLSX.utils.aoa_to_sheet([
    ["Metric", "Value"],
    ["Revenue", { t: "n", f: "UW!B3", v: 900 }],
    ["IRR", { t: "n", f: "B2*0.2", v: 0.18 }],
  ]);

  XLSX.utils.book_append_sheet(workbook, assumptions, "Assumptions");
  XLSX.utils.book_append_sheet(workbook, uw, "UW");
  XLSX.utils.book_append_sheet(workbook, outputs, "Outputs");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function buildPresentationVsMaterialHardcodeBuffer() {
  const workbook = XLSX.utils.book_new();

  const outputs = XLSX.utils.aoa_to_sheet([
    ["", "", "Portfolio Overview", "", "", "", "", "", "", "", ""],
    ["Code", "City", "Metric", "HeaderRef", "HeaderRef2"],
    ["AST1", "Asset One", "90.0%", "1", "2"],
    ["Total Portfolio", "", { t: "n", f: "C3", v: 0.9 }, { t: "n", f: "D3", v: 1 }, { t: "n", f: "E3", v: 2 }],
  ]);

  XLSX.utils.book_append_sheet(workbook, outputs, "Portfolio Overview");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function buildHelperRollupOnlyBuffer() {
  const workbook = XLSX.utils.book_new();

  const assumptions = XLSX.utils.aoa_to_sheet([
    ["Metric", "Jan", "Feb", "Mar"],
    ["Revenue", "100", "110", "120"],
  ]);

  const uw = XLSX.utils.aoa_to_sheet([
    ["Metric", "Jan", "Feb", "Mar"],
    ["-", { t: "n", f: "SUMIFS($B2:$D2,$B$1:$D$1,B$1)", v: 100 }, { t: "n", f: "SUMIFS($B2:$D2,$B$1:$D$1,C$1)", v: 110 }, { t: "n", f: "SUMIFS($B2:$D2,$B$1:$D$1,D$1)", v: 120 }],
    ["Total", { t: "n", f: "SUM(B2:D2)", v: 330 }, "", ""],
  ]);

  const outputs = XLSX.utils.aoa_to_sheet([
    ["Metric", "Value"],
    ["Revenue", { t: "n", f: "Assumptions!B2", v: 100 }],
  ]);

  XLSX.utils.book_append_sheet(workbook, assumptions, "Assumptions");
  XLSX.utils.book_append_sheet(workbook, uw, "UW");
  XLSX.utils.book_append_sheet(workbook, outputs, "Outputs");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function buildStructuralSummaryBuffer() {
  const workbook = XLSX.utils.book_new();

  const assumptions = XLSX.utils.aoa_to_sheet([
    ["Metric", "Value"],
    ["Base Revenue", "100"],
    ["Debt", "60"],
  ]);

  const strangeSummary = XLSX.utils.aoa_to_sheet([
    ["Metric", "2025", "2026", "2027"],
    ["Total Revenue", { t: "n", f: "Assumptions!B2*10", v: 1000 }, { t: "n", f: "B2*1.1", v: 1100 }, { t: "n", f: "C2*1.1", v: 1210 }],
    ["Total Debt", { t: "n", f: "Assumptions!B3", v: 60 }, { t: "n", f: "B3", v: 60 }, { t: "n", f: "C3", v: 60 }],
    ["IRR", { t: "n", f: "20%", v: 0.2 }, "", ""],
  ]);

  XLSX.utils.book_append_sheet(workbook, assumptions, "Inputs");
  XLSX.utils.book_append_sheet(workbook, strangeSummary, "Deck 01");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function buildCompactEntitySheetBuffer() {
  const workbook = XLSX.utils.book_new();

  const bkk = XLSX.utils.aoa_to_sheet([
    ["Metric", "2025", "2026", "2027"],
    ["Revenue", { t: "n", f: "100", v: 100 }, { t: "n", f: "B2*1.1", v: 110 }, { t: "n", f: "C2*1.1", v: 121 }],
    ["All-in Cost incl. CapEx", { t: "n", f: "50", v: 50 }, { t: "n", f: "B3", v: 50 }, { t: "n", f: "C3", v: 50 }],
  ]);

  XLSX.utils.book_append_sheet(workbook, bkk, "BKK");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function buildOccupancyAreaBuffer() {
  const workbook = XLSX.utils.book_new();

  const outputs = XLSX.utils.aoa_to_sheet([
    ["Metric", "Value"],
    ["TOTAL Occupancy (sqm)", "104"],
    ["Occupancy", "94%"],
  ]);

  XLSX.utils.book_append_sheet(workbook, outputs, "Outputs");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function buildAnnualPresentationSummaryBuffer() {
  const workbook = XLSX.utils.book_new();

  const assumptions = XLSX.utils.aoa_to_sheet([
    ["Metric", "Value"],
    ["Base Revenue", "$850"],
  ]);

  const presentation = XLSX.utils.aoa_to_sheet([
    ["", "2025", "2026", "2027", "Total"],
    ["Total Revenue", "$850", "$2,946", "$6,383", "$10,179"],
    ["EBITDA", "$408", "-$1,015", "$2,225", "$1,618"],
    ["IRR", "12%", "18%", "24%", ""],
    ["MOIC", "1.2x", "1.8x", "2.4x", ""],
  ]);

  const opex = XLSX.utils.aoa_to_sheet([
    ["", "Jul-25", "Aug-25", "Sep-25", "Oct-25", "Nov-25", "Dec-25"],
    ["Salaries & Wages", "62,794", "62,794", "55,147", "55,147", "55,147", "55,147"],
    ["Commissions on Direct Sales", "0.0", "0.0", "0.0", "0.0", "0.0", "1.2"],
    ["Total Sales & Marketing", "0", "0", "0", "0", "0", "1.2"],
  ]);

  XLSX.utils.book_append_sheet(workbook, assumptions, "Assumptions");
  XLSX.utils.book_append_sheet(workbook, presentation, "Presentation");
  XLSX.utils.book_append_sheet(workbook, opex, "Opex");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

describe("excel model audit engine", () => {
  it("builds workbook intelligence with lineage, hardcodes and hidden structures", () => {
    const buffer = buildModelBuffer();
    const extraction = extractFromExcel(buffer);

    expect(extraction.success).toBe(true);
    if (!extraction.success) return;

    const intelligence = buildExcelModelIntelligence(buffer, extraction);

    expect(intelligence.workbookMap.hiddenSheets).toContain("UW");
    expect(intelligence.drivers.count).toBeGreaterThan(0);
    expect(intelligence.outputs.count).toBeGreaterThan(0);
    expect(intelligence.lineage.edges).toBeGreaterThan(0);
    expect(intelligence.hardcodes.count).toBeGreaterThan(0);
    expect(intelligence.hiddenStructures.some((entry) => entry.type === "hidden_sheet")).toBe(true);
  });

  it("flags aggressive leverage / occupancy and output hardcodes in financial audit", () => {
    const buffer = buildModelBuffer();
    const extraction = extractFromExcel(buffer);

    expect(extraction.success).toBe(true);
    if (!extraction.success) return;

    const intelligence = buildExcelModelIntelligence(buffer, extraction);
    const audit = runExcelFinancialAudit(extraction, intelligence);

    expect(audit.overallRisk).not.toBe("low");
    expect(audit.heroicAssumptionFlags.some((flag) => /Occupancy h[ée]ro[iï]que|Leverage agressif/i.test(flag.title))).toBe(true);
    expect(audit.dependencyFlags.some((flag) => /Hardcodes materiels sur chemins critiques/i.test(flag.title))).toBe(false);
    expect(audit.keyMetrics.some((metric) => /Revenue/i.test(metric.label))).toBe(true);
  });

  it("suppresses presentation constants and metadata formulas from critical audit signals", () => {
    const buffer = buildPresentationHeavyModelBuffer();
    const extraction = extractFromExcel(buffer);

    expect(extraction.success).toBe(true);
    if (!extraction.success) return;

    const intelligence = buildExcelModelIntelligence(buffer, extraction);
    const audit = runExcelFinancialAudit(extraction, intelligence);

    expect(intelligence.hardcodes.highSeverityCount).toBe(0);
    expect(intelligence.disconnectedCalcs).toHaveLength(0);
    expect(intelligence.outputs.top.some((output) => output.label === "Revenue")).toBe(true);
    expect(intelligence.outputs.top.some((output) => output.label === "Target")).toBe(false);
    expect(audit.overallRisk).not.toBe("critical");
  });

  it("flags reconciliation mismatches between asset sheets and LBO overview", () => {
    const buffer = buildReconciliationMismatchBuffer();
    const extraction = extractFromExcel(buffer);

    expect(extraction.success).toBe(true);
    if (!extraction.success) return;

    const intelligence = buildExcelModelIntelligence(buffer, extraction);
    const audit = runExcelFinancialAudit(extraction, intelligence);

    expect(audit.reconciliationFlags.some((flag) => /Reconciliation revenue incohérente/i.test(flag.title))).toBe(true);
  });

  it("normalizes NOK m and NOK '000 before reconciliation", () => {
    const buffer = buildNormalizedReconciliationBuffer();
    const extraction = extractFromExcel(buffer);

    expect(extraction.success).toBe(true);
    if (!extraction.success) return;

    const intelligence = buildExcelModelIntelligence(buffer, extraction);
    const audit = runExcelFinancialAudit(extraction, intelligence);

    expect(audit.reconciliationFlags.some((flag) => /Reconciliation revenue incohérente/i.test(flag.title))).toBe(false);
    expect(audit.reconciliationFlags.some((flag) => /Reconciliation ebitda incohérente/i.test(flag.title))).toBe(false);
  });

  it("skips reconciliation when the units are density metrics instead of totals", () => {
    const buffer = buildIncompatibleUnitBuffer();
    const extraction = extractFromExcel(buffer);

    expect(extraction.success).toBe(true);
    if (!extraction.success) return;

    const intelligence = buildExcelModelIntelligence(buffer, extraction);
    const audit = runExcelFinancialAudit(extraction, intelligence);

    expect(audit.reconciliationFlags.some((flag) => /Reconciliation revenue incohérente/i.test(flag.title))).toBe(false);
  });

  it("resolves named ranges and 3d refs into the dependency graph", () => {
    const buffer = buildDependencyEngineBuffer();
    const extraction = extractFromExcel(buffer);

    expect(extraction.success).toBe(true);
    if (!extraction.success) return;

    const intelligence = buildExcelModelIntelligence(buffer, extraction);

    expect(intelligence.warnings).toContain("named_ranges_present");
    expect(intelligence.warnings).toContain("three_dimensional_references_present");
    expect(intelligence.lineage.lineageSamples.some((sample) => sample.precedents.includes("BKK!B2"))).toBe(true);
    expect(intelligence.lineage.lineageSamples.some((sample) => sample.precedents.includes("GLO!B2"))).toBe(true);
    expect(intelligence.lineage.lineageSamples.some((sample) => sample.precedents.includes("Assumptions!B2"))).toBe(true);
  });

  it("does not escalate local output-matrix hardcodes as global critical risks by default", () => {
    const buffer = buildLocalOutputMatrixBuffer();
    const extraction = extractFromExcel(buffer);

    expect(extraction.success).toBe(true);
    if (!extraction.success) return;

    const intelligence = buildExcelModelIntelligence(buffer, extraction);
    const audit = runExcelFinancialAudit(extraction, intelligence);

    expect(intelligence.hardcodes.highSeverityCount).toBe(0);
    expect(audit.dependencyFlags.some((flag) => /Hardcodes materiels sur chemins critiques/i.test(flag.title))).toBe(false);
  });

  it("flags transitive hardcodes that reach global outputs through intermediate formulas", () => {
    const buffer = buildTransitiveHardcodePathBuffer();
    const extraction = extractFromExcel(buffer);

    expect(extraction.success).toBe(true);
    if (!extraction.success) return;

    const intelligence = buildExcelModelIntelligence(buffer, extraction);
    const audit = runExcelFinancialAudit(extraction, intelligence);
    const occupancyHardcode = intelligence.hardcodes.top.find((signal) => signal.sheet === "UW" && signal.cell === "B2");
    const revenueDependency = intelligence.criticalDependencies.find((dep) => dep.output === "Outputs!B2");

    expect(occupancyHardcode?.globalOutputReachCount).toBeGreaterThan(0);
    expect(revenueDependency?.transitiveHardcodedPrecedentCount).toBeGreaterThan(0);
    expect(audit.dependencyFlags.some((flag) => /Hardcodes materiels sur chemins critiques/i.test(flag.title))).toBe(true);
    expect(audit.dependencyFlags.some((flag) => /Références Excel avancées/i.test(flag.title))).toBe(false);
  });

  it("keeps material row-level hardcodes ahead of presentation references in surfaced top risks", () => {
    const buffer = buildPresentationVsMaterialHardcodeBuffer();
    const extraction = extractFromExcel(buffer);

    expect(extraction.success).toBe(true);
    if (!extraction.success) return;

    const intelligence = buildExcelModelIntelligence(buffer, extraction);

    expect(intelligence.hardcodes.top[0]?.classification).not.toBe("presentation_reference");
    expect(intelligence.hardcodes.top.some((signal) => signal.classification === "local_underwriting")).toBe(true);
  });

  it("ignores repetitive helper rollups when surfacing disconnected calculations", () => {
    const buffer = buildHelperRollupOnlyBuffer();
    const extraction = extractFromExcel(buffer);

    expect(extraction.success).toBe(true);
    if (!extraction.success) return;

    const intelligence = buildExcelModelIntelligence(buffer, extraction);

    expect(intelligence.disconnectedCalcs).toHaveLength(0);
  });

  it("downgrades compact disconnected summary blocks to a verify-first warning", () => {
    const buffer = buildDisconnectedSummaryBlockBuffer();
    const extraction = extractFromExcel(buffer);

    expect(extraction.success).toBe(true);
    if (!extraction.success) return;

    const intelligence = buildExcelModelIntelligence(buffer, extraction);
    const audit = runExcelFinancialAudit(extraction, intelligence);

    expect(audit.consistencyFlags.some((flag) => /Bloc de synthèse interne déconnecté/i.test(flag.title))).toBe(true);
    expect(audit.consistencyFlags.some((flag) => flag.severity === "high")).toBe(false);
  });

  it("surfaces canonical global outputs from structural summary blocks even without summary sheet names", () => {
    const buffer = buildStructuralSummaryBuffer();
    const extraction = extractFromExcel(buffer);

    expect(extraction.success).toBe(true);
    if (!extraction.success) return;

    const intelligence = buildExcelModelIntelligence(buffer, extraction);

    expect(intelligence.outputs.canonical.some((output) => output.sheet === "Deck 01" && output.scope === "global")).toBe(true);
    expect(intelligence.outputs.canonical.some((output) => /Revenue/i.test(output.label))).toBe(true);
    expect(new Set(intelligence.outputs.canonical.map((output) => output.label)).size).toBe(intelligence.outputs.canonical.length);
  });

  it("attaches explicit provenance paths from hardcodes to surfaced outputs", () => {
    const buffer = buildTransitiveHardcodePathBuffer();
    const extraction = extractFromExcel(buffer);

    expect(extraction.success).toBe(true);
    if (!extraction.success) return;

    const intelligence = buildExcelModelIntelligence(buffer, extraction);
    const occupancyHardcode = intelligence.hardcodes.top.find((signal) => signal.sheet === "UW" && signal.cell === "B2");
    const outputDependency = intelligence.criticalDependencies.find((signal) => signal.output === "Outputs!B2");

    expect(occupancyHardcode?.sampleGlobalOutputPaths[0]?.nodes).toEqual(["UW!B2", "UW!B3", "Outputs!B2"]);
    expect(outputDependency?.sampleHardcodePaths[0]?.nodes).toEqual(["UW!B2", "UW!B3", "Outputs!B2"]);
  });

  it("keeps compact single-entity sheets local even when rows look summary-like", () => {
    const buffer = buildCompactEntitySheetBuffer();
    const extraction = extractFromExcel(buffer);

    expect(extraction.success).toBe(true);
    if (!extraction.success) return;

    const intelligence = buildExcelModelIntelligence(buffer, extraction);

    expect(intelligence.outputs.canonical.every((output) => output.scope === "local")).toBe(true);
  });

  it("does not treat occupancy area metrics as impossible percentage occupancy", () => {
    const buffer = buildOccupancyAreaBuffer();
    const extraction = extractFromExcel(buffer);

    expect(extraction.success).toBe(true);
    if (!extraction.success) return;

    const intelligence = buildExcelModelIntelligence(buffer, extraction);
    const audit = runExcelFinancialAudit(extraction, intelligence);

    expect(audit.plausibilityFlags.some((flag) => /Occupancy impossible/i.test(flag.title))).toBe(false);
  });

  it("detects compact annual presentation sheets as outputs and keeps monthly opex local", () => {
    const buffer = buildAnnualPresentationSummaryBuffer();
    const extraction = extractFromExcel(buffer);

    expect(extraction.success).toBe(true);
    if (!extraction.success) return;

    const presentationSheet = extraction.sheets.find((sheet) => sheet.name === "Presentation");
    const opexSheet = extraction.sheets.find((sheet) => sheet.name === "Opex");

    expect(presentationSheet?.role).toBe("OUTPUTS");
    expect(opexSheet?.role).toBe("CALC_ENGINE");

    const intelligence = buildExcelModelIntelligence(buffer, extraction);
    expect(intelligence.outputs.canonical.some((output) => output.sheet === "Presentation" && /Revenue|EBITDA|IRR|MOIC/i.test(output.label))).toBe(true);
    expect(intelligence.outputs.canonical.some((output) => output.sheet === "Opex")).toBe(false);
  });
});
