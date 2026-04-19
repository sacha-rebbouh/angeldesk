import * as XLSX from "xlsx";

import type { ExcelExtractionResult, SheetData, SheetRole } from "./extractor";

export interface WorkbookMapSummary {
  sheetCount: number;
  hiddenSheets: string[];
  roles: Array<{
    name: string;
    role: SheetRole;
    classification: SheetData["classification"];
    hidden: boolean;
    formulaDensity: number;
  }>;
}

export interface DriverSignal {
  sheet: string;
  cell: string;
  label: string;
  value: string;
  kind: "manual_input" | "assumption" | "hardcoded_numeric";
  confidence: "high" | "medium" | "low";
}

export interface OutputSignal {
  sheet: string;
  cell: string;
  label: string;
  value: string;
  sheetRole: SheetRole;
  supportingRefs: string[];
  confidence: "high" | "medium" | "low";
  scope: "global" | "local";
  metricFamily: MetricFamily;
  rowKind: OutputRowKind;
  crossSheetPrecedentCount: number;
  transitivePrecedentCount: number;
}

export interface HardcodeSignal {
  sheet: string;
  cell: string;
  label: string;
  value: string;
  classification: "presentation_reference" | "local_underwriting" | "aggregate_summary" | "calc_override";
  severity: "low" | "medium" | "high";
  reason: string;
  dependentCount: number;
  crossSheetDependentCount: number;
  globalOutputDependentCount: number;
  localOutputDependentCount: number;
  globalOutputReachCount: number;
  localOutputReachCount: number;
  sampleGlobalOutputPaths: ProvenancePath[];
}

export interface HiddenStructureSignal {
  type: "hidden_sheet" | "hidden_row" | "hidden_column";
  sheet: string;
  index?: number;
  reason: string;
}

export interface DisconnectedCalcSignal {
  sheet: string;
  cell: string;
  formula: string;
  label: string;
  sheetRole: SheetRole;
  crossSheetRefCount: number;
  reason: string;
}

export interface LineageSample {
  target: string;
  formula: string;
  precedents: string[];
  precedentDepthEstimate: number;
}

export interface ProvenancePath {
  output: string;
  nodes: string[];
  crossSheetHopCount: number;
}

export interface CriticalDependencySignal {
  output: string;
  outputScope: "global" | "local";
  metricFamily: MetricFamily;
  rowKind: OutputRowKind;
  precedentCount: number;
  transitivePrecedentCount: number;
  hardcodedPrecedentCount: number;
  transitiveHardcodedPrecedentCount: number;
  crossSheetPrecedentCount: number;
  transitiveCrossSheetPrecedentCount: number;
  sampleHardcodePaths: ProvenancePath[];
}

type MetricFamily =
  | "revenue"
  | "profitability"
  | "returns"
  | "leverage"
  | "occupancy"
  | "valuation"
  | "capex"
  | "financing"
  | "other";

export interface ExcelModelIntelligence {
  workbookMap: WorkbookMapSummary;
  lineage: {
    nodes: number;
    edges: number;
    crossSheetEdges: number;
    namedRangeCount: number;
    threeDimensionalRefCount: number;
    lineageSamples: LineageSample[];
  };
  drivers: {
    count: number;
    top: DriverSignal[];
  };
  outputs: {
    count: number;
    canonical: OutputSignal[];
    top: OutputSignal[];
  };
  hardcodes: {
    count: number;
    highSeverityCount: number;
    top: HardcodeSignal[];
  };
  hiddenStructures: HiddenStructureSignal[];
  disconnectedCalcs: DisconnectedCalcSignal[];
  criticalDependencies: CriticalDependencySignal[];
  warnings: string[];
}

interface WorkbookDependencyContext {
  sheetOrder: string[];
  definedNames: Map<string, string[]>;
}

type OutputRowKind =
  | "portfolio_summary"
  | "asset_detail"
  | "forward_asset_detail"
  | "financing_row"
  | "section_header"
  | "generic";

interface OutputRowContext {
  kind: OutputRowKind;
  anchorLabel: string;
  entityCode?: string;
  entityName?: string;
}

interface SheetOutputProfile {
  mode: "summary" | "detail" | "mixed";
  periodHeaderCount: number;
  annualPeriodHeaderCount: number;
  monthlyPeriodHeaderCount: number;
  crossSheetFormulaRatio: number;
  entityRowCount: number;
  summaryRowCount: number;
  sectionHeaderCount: number;
}

interface OutputCandidate {
  sheetName: string;
  address: string;
  label: string;
  value: string;
  sheetRole: SheetRole;
  refs: string[];
  rowContext: OutputRowContext;
  sheetOutputProfile: SheetOutputProfile;
  scope: "global" | "local";
  metricFamily: MetricFamily;
  score: number;
}

export function buildExcelModelIntelligence(
  buffer: Buffer,
  extraction: ExcelExtractionResult
): ExcelModelIntelligence {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellFormula: true,
    cellNF: false,
    cellStyles: false,
  });

  const hiddenSheets = workbook.Workbook?.Sheets
    ?.map((sheet, index) => ({ name: workbook.SheetNames[index], hidden: Boolean(sheet.Hidden) }))
    .filter((sheet) => sheet.hidden)
    .map((sheet) => sheet.name) ?? [];
  const dependencyContext = buildWorkbookDependencyContext(workbook);

  const roles = extraction.sheets.map((sheet) => ({
    name: sheet.name,
    role: sheet.role,
    classification: sheet.classification,
    hidden: sheet.hidden,
    formulaDensity: sheet.audit.formulaDensity,
  }));

  const hiddenStructures: HiddenStructureSignal[] = hiddenSheets.map((name) => ({
    type: "hidden_sheet",
    sheet: name,
    reason: "Hidden sheet detected in workbook structure",
  }));

  const driverSignals: DriverSignal[] = [];
  const outputCandidates: OutputCandidate[] = [];
  const hardcodeSignals: HardcodeSignal[] = [];
  const disconnectedCalcs: DisconnectedCalcSignal[] = [];
  const lineageSamples: LineageSample[] = [];
  const namedRangeCount = dependencyContext.definedNames.size;
  let threeDimensionalRefCount = 0;

  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();
  let nodes = 0;
  let edges = 0;
  let crossSheetEdges = 0;

  for (const sheet of extraction.sheets) {
    const worksheet = workbook.Sheets[sheet.name];
    if (!worksheet) continue;
    const cells = listWorksheetCells(worksheet);
    const getRowValues = buildWorksheetRowValueGetter(worksheet);
    const sheetOutputProfile = inferSheetOutputProfile(sheet, getRowValues, cells);
    const rowContextCache = new Map<number, OutputRowContext>();
    const getRowContext = (address: string): OutputRowContext => {
      const rowIndex = XLSX.utils.decode_cell(address).r;
      const cached = rowContextCache.get(rowIndex);
      if (cached) return cached;
      const context = inferOutputRowContext(sheet.name, getRowValues, address, sheetOutputProfile);
      rowContextCache.set(rowIndex, context);
      return context;
    };

    const hiddenRows = (worksheet["!rows"] ?? [])
      .map((row, index) => ({ row, index }))
      .filter((entry) => Boolean(entry.row?.hidden));
    for (const entry of hiddenRows.slice(0, 20)) {
      hiddenStructures.push({
        type: "hidden_row",
        sheet: sheet.name,
        index: entry.index + 1,
        reason: "Hidden row detected",
      });
    }

    const hiddenCols = (worksheet["!cols"] ?? [])
      .map((col, index) => ({ col, index }))
      .filter((entry) => Boolean(entry.col?.hidden));
    for (const entry of hiddenCols.slice(0, 20)) {
      hiddenStructures.push({
        type: "hidden_column",
        sheet: sheet.name,
        index: entry.index + 1,
        reason: "Hidden column detected",
      });
    }

    for (const [address, cell] of cells) {
      nodes++;
      const qualified = `${sheet.name}!${address}`;
      const value = stringifyCellDisplay(cell);
      const rowContext = getRowContext(address);
      const label = inferCellLabel(sheet.name, getRowValues, address, rowContext);
      const refs = typeof cell.f === "string" ? extractFormulaRefs(cell.f, sheet.name, dependencyContext) : [];
      if (typeof cell.f === "string" && hasThreeDimensionalRef(cell.f)) {
        threeDimensionalRefCount += 1;
      }

      if (refs.length > 0) {
        if (lineageSamples.length < 40) {
          lineageSamples.push({
            target: qualified,
            formula: cell.f as string,
            precedents: refs.slice(0, 12),
            precedentDepthEstimate: Math.min(6, refs.length),
          });
        }
        for (const ref of refs) {
          if (!outgoing.has(ref)) outgoing.set(ref, new Set());
          outgoing.get(ref)!.add(qualified);
          if (!incoming.has(qualified)) incoming.set(qualified, new Set());
          incoming.get(qualified)!.add(ref);
          edges++;
          if (!ref.startsWith(`${sheet.name}!`)) crossSheetEdges++;
        }
      }

      const isNumeric = looksNumeric(value);
      if (!cell.f && isNumeric) {
        if (sheet.role === "INPUTS") {
          driverSignals.push({
            sheet: sheet.name,
            cell: address,
            label,
            value,
            kind: /assum|growth|inflation|yield|occup|rent|price|ltv|margin|capex/i.test(label)
              ? "assumption"
              : "manual_input",
            confidence: "high",
          });
        } else if (sheet.role === "CALC_ENGINE" || sheet.role === "OUTPUTS") {
          const rowValues = getRowValues(XLSX.utils.decode_cell(address).r);
          hardcodeSignals.push(
            buildHardcodeSignal({
              sheetName: sheet.name,
              sheetRole: sheet.role,
              address,
              label,
              value,
              rowValues,
              rowContext,
            })
          );
        }
      }

      if (
        (
          sheet.role === "OUTPUTS" ||
          (sheet.role === "CALC_ENGINE" && sheetOutputProfile.mode === "summary")
        ) &&
        shouldConsiderOutputCell({
          address,
          getRowValues,
          rowContext,
          sheetOutputProfile,
          value,
        }) &&
        (refs.length > 0 || (!cell.f && isNumeric))
      ) {
        const metricFamily = inferMetricFamily(label, value);
        const scope = inferOutputScope({
          sheetName: sheet.name,
          getRowValues,
          address,
          label,
          rowContext,
          sheetOutputProfile,
          metricFamily,
        });
        const score = scoreOutputCandidate({
          sheetName: sheet.name,
          address,
          label,
          value,
          sheetRole: sheet.role,
          refs,
          rowContext,
          sheetOutputProfile,
          metricFamily,
          scope,
        });
        if (score > 0) {
          outputCandidates.push({
            sheetName: sheet.name,
            address,
            label,
            value,
            sheetRole: sheet.role,
            refs,
            rowContext,
            sheetOutputProfile,
            metricFamily,
            score,
            scope,
          });
        }
      }
    }

    const disconnected = cells
      .filter(([, cell]) => typeof cell.f === "string")
      .filter(([address]) => {
        const qualified = `${sheet.name}!${address}`;
        const hasIncoming = (incoming.get(qualified)?.size ?? 0) > 0;
        const hasOutgoing = (outgoing.get(qualified)?.size ?? 0) > 0;
        const cell = worksheet[address] as XLSX.CellObject;
        const value = stringifyCellDisplay(cell);
        const rowContext = getRowContext(address);
        const label = inferCellLabel(sheet.name, getRowValues, address, rowContext);
        return shouldFlagDisconnectedCalc({
          sheetRole: sheet.role,
          address,
          cell,
          value,
          label,
          hasIncoming,
          hasOutgoing,
        });
      })
      .slice(0, 20);

    for (const [address, cell] of disconnected) {
      const rowContext = getRowContext(address);
      disconnectedCalcs.push({
        sheet: sheet.name,
        cell: address,
        formula: String(cell.f),
        label: inferCellLabel(sheet.name, getRowValues, address, rowContext),
        sheetRole: sheet.role,
        crossSheetRefCount: refsFromFormula(String(cell.f), sheet.name, dependencyContext)
          .filter((ref) => !ref.startsWith(`${sheet.name}!`))
          .length,
        reason: "Formula cell appears disconnected from surfaced outputs",
      });
    }
  }

  const { canonicalOutputs, topOutputs } = selectWorkbookOutputs(outputCandidates, incoming);
  const criticalDependencies = buildCriticalDependencySignals(topOutputs, incoming, hardcodeSignals);

  const warnings: string[] = [];
  const globalOutputSet = new Set(
    canonicalOutputs
      .filter((output) => output.scope === "global")
      .map((output) => `${output.sheet}!${output.cell}`)
  );
  const localOutputSet = new Set(
    topOutputs
      .filter((output) => output.scope === "local")
      .map((output) => `${output.sheet}!${output.cell}`)
  );
  const globalOutputReach = buildOutputReachabilityIndex(globalOutputSet, incoming);
  const localOutputReach = buildOutputReachabilityIndex(localOutputSet, incoming);

  for (const signal of hardcodeSignals) {
    const qualified = `${signal.sheet}!${signal.cell}`;
    const dependents = Array.from(outgoing.get(qualified) ?? []);
    signal.dependentCount = dependents.length;
    signal.crossSheetDependentCount = dependents.filter((ref) => !ref.startsWith(`${signal.sheet}!`)).length;
    signal.globalOutputDependentCount = dependents.filter((ref) => globalOutputSet.has(ref)).length;
    signal.localOutputDependentCount = dependents.filter((ref) => localOutputSet.has(ref)).length;
    signal.globalOutputReachCount = globalOutputReach.get(qualified) ?? 0;
    signal.localOutputReachCount = localOutputReach.get(qualified) ?? 0;

    if (signal.classification === "presentation_reference") {
      signal.severity = "low";
      continue;
    }

    const rowLocalDependents = dependents.length > 0 && dependents.every((ref) => isRowLocalDependency(qualified, ref));

    if (signal.classification === "aggregate_summary") {
      if (signal.globalOutputReachCount > 0) {
        signal.severity = "high";
        signal.reason = "Hardcoded value in summary/output area with proven transitive impact on global outputs";
      } else if (signal.crossSheetDependentCount > 0) {
        signal.severity = "high";
        signal.reason = "Hardcoded value in summary/output area with cross-sheet downstream impact";
      } else if (rowLocalDependents || signal.localOutputDependentCount > 0) {
        signal.classification = "local_underwriting";
        signal.severity = "medium";
        signal.reason = "Hardcoded value in output-oriented matrix with local downstream impact";
      } else if (signal.dependentCount <= 1) {
        signal.severity = signal.dependentCount === 0 ? "low" : "medium";
        signal.reason = "Hardcoded value in output-oriented sheet with limited proven downstream impact";
      }
    }

    if (signal.classification === "local_underwriting") {
      if (signal.globalOutputReachCount > 0) {
        signal.severity = "high";
        signal.reason = "Row-level underwriting hardcode with proven transitive path to global outputs";
      } else if (signal.crossSheetDependentCount > 0) {
        signal.severity = "medium";
        signal.reason = "Row-level underwriting hardcode with cross-sheet downstream impact to verify";
      } else {
        signal.severity = signal.dependentCount >= 20 ? "medium" : "low";
        signal.reason = "Row-level underwriting hardcode with local-only downstream impact";
      }
    }

    if (signal.classification === "calc_override") {
      if (signal.globalOutputReachCount > 0) {
        signal.severity = "high";
        signal.reason = "Hardcoded value in calculation sheet with proven transitive path to global outputs";
      } else if (signal.crossSheetDependentCount === 0) {
        signal.severity = signal.dependentCount > 0 ? "medium" : "low";
      }
    }

    signal.sampleGlobalOutputPaths = signal.globalOutputReachCount > 0
      ? collectPathsToTargets(
          qualified,
          globalOutputSet,
          outgoing,
          2
        )
      : [];
  }
  hardcodeSignals.sort((left, right) => scoreHardcodeSignal(right) - scoreHardcodeSignal(left));

  if (hiddenStructures.some((entry) => entry.type === "hidden_sheet")) warnings.push("hidden_structures_present");
  if (hardcodeSignals.some((signal) => signal.severity === "high")) warnings.push("high_severity_hardcodes_present");
  if (disconnectedCalcs.length > 0) warnings.push("disconnected_calculations_detected");
  if (topOutputs.length === 0) warnings.push("no_clear_outputs_detected");
  if (driverSignals.length === 0) warnings.push("no_clear_manual_drivers_detected");
  if (namedRangeCount > 0) warnings.push("named_ranges_present");
  if (threeDimensionalRefCount > 0) warnings.push("three_dimensional_references_present");

  return {
    workbookMap: {
      sheetCount: extraction.metadata.sheetCount,
      hiddenSheets,
      roles,
    },
    lineage: {
      nodes,
      edges,
      crossSheetEdges,
      namedRangeCount,
      threeDimensionalRefCount,
      lineageSamples: lineageSamples.slice(0, 40),
    },
    drivers: {
      count: driverSignals.length,
      top: driverSignals.slice(0, 40),
    },
    outputs: {
      count: topOutputs.length,
      canonical: canonicalOutputs.slice(0, 16),
      top: topOutputs.slice(0, 40),
    },
    hardcodes: {
      count: hardcodeSignals.length,
      highSeverityCount: hardcodeSignals.filter((signal) => signal.severity === "high").length,
      top: hardcodeSignals.slice(0, 40),
    },
    hiddenStructures: hiddenStructures.slice(0, 60),
    disconnectedCalcs: disconnectedCalcs.slice(0, 40),
    criticalDependencies: criticalDependencies.slice(0, 40),
    warnings,
  };
}

function buildWorkbookDependencyContext(workbook: XLSX.WorkBook): WorkbookDependencyContext {
  const sheetOrder = [...workbook.SheetNames];
  const definedNames = new Map<string, string[]>();

  for (const name of workbook.Workbook?.Names ?? []) {
    if (!name?.Name || !name.Ref) continue;
    if (isUnsupportedDefinedName(name.Name, name.Ref)) continue;

    const ownerSheet = typeof name.Sheet === "number" ? sheetOrder[name.Sheet] : undefined;
    const refs = extractDirectRefsFromExpression(name.Ref, ownerSheet ?? sheetOrder[0] ?? "", sheetOrder);
    if (refs.length === 0) continue;

    definedNames.set(name.Name.toUpperCase(), refs);
  }

  return {
    sheetOrder,
    definedNames,
  };
}

function listWorksheetCells(worksheet: XLSX.WorkSheet): Array<[string, XLSX.CellObject]> {
  return Object.entries(worksheet)
    .filter(([address]) => address[0] !== "!")
    .map(([address, cell]) => [address, cell as XLSX.CellObject]);
}

function getWorksheetRowValues(worksheet: XLSX.WorkSheet, rowIndex: number, maxColumns = 80): string[] {
  const row: string[] = [];
  for (let col = 0; col < maxColumns; col++) {
    const address = XLSX.utils.encode_cell({ r: rowIndex, c: col });
    const cell = worksheet[address] as XLSX.CellObject | undefined;
    row.push(cell ? stringifyCellDisplay(cell) : "");
  }
  return row;
}

function buildWorksheetRowValueGetter(
  worksheet: XLSX.WorkSheet,
  maxColumns = 80
): (rowIndex: number) => string[] {
  const cache = new Map<number, string[]>();

  return (rowIndex: number) => {
    const cached = cache.get(rowIndex);
    if (cached) return cached;
    const values = getWorksheetRowValues(worksheet, rowIndex, maxColumns);
    cache.set(rowIndex, values);
    return values;
  };
}

function stringifyCellDisplay(cell: XLSX.CellObject): string {
  return String(cell.w ?? cell.v ?? "").trim();
}

function buildHardcodeSignal(params: {
  sheetName: string;
  sheetRole: SheetData["role"];
  address: string;
  label: string;
  value: string;
  rowValues?: string[];
  rowContext?: OutputRowContext;
}): HardcodeSignal {
  const benignStructuralConstant = isBenignStructuralHardcode(params.label, params.value, params.address, params.rowValues ?? []);
  const benignOutputConstant = (
    params.sheetRole === "OUTPUTS" &&
    isBenignOutputConstant(params.label, params.value, params.address)
  ) || benignStructuralConstant;
  const localUnderwritingConstant =
    params.sheetRole === "OUTPUTS" &&
    !benignOutputConstant &&
    (
      params.rowContext?.kind === "asset_detail" ||
      params.rowContext?.kind === "forward_asset_detail" ||
      isLikelyLocalUnderwritingConstant(params.rowValues ?? [], params.label)
    );
  const severity = benignOutputConstant
    ? "low"
    : localUnderwritingConstant
      ? "medium"
      : params.sheetRole === "OUTPUTS"
      ? "high"
      : "medium";

  return {
    sheet: params.sheetName,
    cell: params.address,
    label: params.label,
    value: params.value,
    classification: benignOutputConstant
      ? "presentation_reference"
      : localUnderwritingConstant
        ? "local_underwriting"
        : params.sheetRole === "OUTPUTS" && params.rowContext?.kind === "portfolio_summary"
          ? "aggregate_summary"
          : params.sheetRole === "OUTPUTS"
            ? "local_underwriting"
          : "calc_override",
    severity,
    reason: benignOutputConstant
      ? "Static presentation, structural index, or reference value inside output-oriented sheet"
      : localUnderwritingConstant
        ? "Hardcoded row-level underwriting value inside output-oriented matrix"
      : params.sheetRole === "OUTPUTS"
        ? "Hardcoded numeric value inside output-oriented sheet"
        : "Hardcoded numeric value inside calculation sheet",
    dependentCount: 0,
    crossSheetDependentCount: 0,
    globalOutputDependentCount: 0,
    localOutputDependentCount: 0,
    globalOutputReachCount: 0,
    localOutputReachCount: 0,
    sampleGlobalOutputPaths: [],
  };
}

function scoreHardcodeSignal(signal: HardcodeSignal): number {
  if (signal.classification === "presentation_reference") {
    return signal.globalOutputReachCount + signal.localOutputReachCount + signal.dependentCount * 0.1;
  }

  const severityScore = signal.severity === "high" ? 100 : signal.severity === "medium" ? 50 : 10;
  const aggregatePenalty = signal.classification === "aggregate_summary" ? 24 : 0;
  const overridePenalty = signal.classification === "calc_override" ? 18 : 0;
  const pathEvidenceScore = signal.sampleGlobalOutputPaths.length * 15;
  const shortestPathPenalty = signal.sampleGlobalOutputPaths.length > 0
    ? Math.max(0, 8 - Math.min(...signal.sampleGlobalOutputPaths.map((path) => path.nodes.length)))
    : 0;
  return (
    severityScore +
    aggregatePenalty +
    overridePenalty +
    pathEvidenceScore +
    shortestPathPenalty +
    signal.globalOutputReachCount * 40 +
    signal.globalOutputDependentCount * 30 +
    signal.crossSheetDependentCount * 8 +
    signal.localOutputReachCount * 6 +
    signal.localOutputDependentCount * 4 +
    signal.dependentCount
  );
}

function scoreSurfacedOutputSignal(signal: OutputSignal): number {
  let score = signal.scope === "global" ? 40 : 10;

  if (signal.sheetRole === "OUTPUTS") score += 16;
  if (signal.sheetRole === "CALC_ENGINE") score -= 4;
  if (isMetricLikeLabel(signal.label)) score += 15;
  if (signal.confidence === "high") score += 8;
  score += signal.supportingRefs.length;
  score += Math.min(signal.crossSheetPrecedentCount, 12);
  score += Math.min(signal.transitivePrecedentCount, 40) * 0.25;
  if (signal.rowKind === "portfolio_summary") score += 10;
  if (signal.rowKind === "financing_row") score += 4;
  if (signal.metricFamily !== "other") score += 6;
  if (looksLikeSectionLabel(signal.label)) score -= 10;
  if (isLikelyYearValue(signal.value)) score -= 10;
  if (/^[A-Z0-9_-]{2,8}\s*\/\s*.+/.test(signal.label)) score -= 8;
  if (signal.rowKind === "asset_detail" || signal.rowKind === "forward_asset_detail") score -= 4;
  if (looksLikeDensityMetric(signal.label)) score -= 12;
  if (looksLikeAuxiliaryMetric(signal.label)) score -= 10;
  score -= scoreMetricValueMismatch(signal.label, signal.value);
  if (signal.value.trim() === "-") score -= 6;

  return score;
}

function looksNumeric(value: string): boolean {
  if (!value) return false;
  const cleaned = value.replace(/[€$£,\s%]/g, "").replace(/[()]/g, "-");
  return cleaned.length > 0 && !Number.isNaN(Number(cleaned));
}

function inferCellLabel(
  _sheetName: string,
  getRowValues: (rowIndex: number) => string[],
  address: string,
  rowContext?: OutputRowContext
): string {
  if (rowContext?.anchorLabel) return rowContext.anchorLabel;

  const decoded = XLSX.utils.decode_cell(address);
  const row = getRowValues(decoded.r);
  for (let idx = Math.min(decoded.c, 4); idx >= 0; idx--) {
    const cell = String(row[idx] ?? "").trim();
    if (cell && !looksNumeric(cell)) return cell;
  }
  return address;
}

function inferOutputRowContext(
  _sheetName: string,
  getRowValues: (rowIndex: number) => string[],
  address: string,
  sheetOutputProfile: SheetOutputProfile
): OutputRowContext {
  const decoded = XLSX.utils.decode_cell(address);
  const row = getRowValues(decoded.r);
  const priorRow = decoded.r > 0 ? getRowValues(decoded.r - 1) : [];
  const twoRowsUp = decoded.r > 1 ? getRowValues(decoded.r - 2) : [];
  const nextRow = getRowValues(decoded.r + 1);
  const textCells = row.map((cell) => String(cell ?? "").trim()).filter((cell) => cell && !looksNumeric(cell));
  const numericCount = row.filter((cell) => looksNumeric(String(cell ?? "").trim())).length;
  const entityDescriptor = inferEntityDescriptor(row);
  const summaryLabel = inferPrimaryRowLabel(row) || address;
  const periodHeaderCount = Math.max(countPeriodMarkers(row), countPeriodMarkers(priorRow), countPeriodMarkers(twoRowsUp));
  const isForwardLikeRow = periodHeaderCount >= 3 || row.some((cell) => isLikelyDateValue(String(cell ?? "").trim()));
  const neighboringEntityRows = [twoRowsUp, priorRow, nextRow].filter((candidate) => inferEntityDescriptor(candidate) != null).length;
  const mostlySummaryLike =
    !entityDescriptor &&
    numericCount >= 3 &&
    textCells.length >= 1 &&
    row.slice(0, 5).filter((cell) => {
      const trimmed = String(cell ?? "").trim();
      return trimmed && !looksNumeric(trimmed);
    }).length >= 1;

  if (numericCount === 0 && textCells.length <= 2 && looksLikeSectionLabel(summaryLabel)) {
    return {
      kind: "section_header",
      anchorLabel: summaryLabel,
    };
  }

  if (looksLikeFinancingLabel(summaryLabel) && numericCount >= 2) {
    return {
      kind: "financing_row",
      anchorLabel: summaryLabel,
    };
  }

  if (sheetOutputProfile.mode !== "detail" && mostlySummaryLike && !looksLikeSectionLabel(summaryLabel)) {
    return {
      kind: "portfolio_summary",
      anchorLabel: summaryLabel,
    };
  }

  if (entityDescriptor && numericCount >= 4) {
    return {
      kind: isForwardLikeRow ? "forward_asset_detail" : "asset_detail",
      anchorLabel: `${entityDescriptor.code} / ${entityDescriptor.name}`,
      entityCode: entityDescriptor.code,
      entityName: entityDescriptor.name,
    };
  }

  if (neighboringEntityRows >= 1 && numericCount >= 2 && !looksLikeSectionLabel(summaryLabel)) {
    return {
      kind: isForwardLikeRow ? "forward_asset_detail" : "asset_detail",
      anchorLabel: summaryLabel,
    };
  }

  if (sheetOutputProfile.mode === "detail" && numericCount >= 4 && textCells.length >= 1) {
    return {
      kind: isForwardLikeRow ? "forward_asset_detail" : "asset_detail",
      anchorLabel: summaryLabel,
    };
  }

  return {
    kind: "generic",
    anchorLabel: summaryLabel,
  };
}

function extractFormulaRefs(formula: string, currentSheet: string, context: WorkbookDependencyContext): string[] {
  const refs = new Set(extractDirectRefsFromExpression(formula, currentSheet, context.sheetOrder));
  for (const token of extractPotentialDefinedNames(formula)) {
    const namedRefs = context.definedNames.get(token.toUpperCase());
    if (!namedRefs) continue;
    for (const ref of namedRefs) refs.add(ref);
  }

  return Array.from(refs).slice(0, 48);
}

function refsFromFormula(formula: string, currentSheet: string, context: WorkbookDependencyContext): string[] {
  return extractFormulaRefs(formula, currentSheet, context);
}

function collectTransitivePrecedents(
  output: string,
  incoming: Map<string, Set<string>>
): string[] {
  const seen = new Set<string>();
  const stack = [output];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    for (const precedent of incoming.get(current) ?? []) {
      if (seen.has(precedent)) continue;
      seen.add(precedent);
      stack.push(precedent);
    }
  }

  return Array.from(seen);
}

function scoreOutputCandidate(candidate: {
  sheetName: string;
  address: string;
  label: string;
  value: string;
  sheetRole: SheetRole;
  refs: string[];
  rowContext?: OutputRowContext;
  sheetOutputProfile: SheetOutputProfile;
  metricFamily: MetricFamily;
  scope: "global" | "local";
}): number {
  if (isBenignOutputConstant(candidate.label, candidate.value, candidate.address)) return 0;

  let score = candidate.refs.length > 0 ? 3 : 1;
  const normalizedLabel = normalizeText(candidate.label);
  const normalizedValue = normalizeText(candidate.value);

  if (candidate.sheetRole === "OUTPUTS") score += 12;
  if (candidate.sheetRole === "CALC_ENGINE") score -= 2;
  if (isLikelyDateValue(candidate.value) && !/irr|moic|yield|margin|occup|revenue|debt|ebitda/i.test(candidate.value)) {
    score -= 8;
  }
  if (normalizedLabel.length <= 2 && !isMetricLikeLabel(candidate.label)) score -= 8;
  if (isMetricLikeLabel(candidate.label)) score += 8;
  if (/%|x|irr|moic|ebitda|revenue|occup|yield|noi|ltv|debt|capex|value/i.test(candidate.value)) score += 4;
  if (candidate.refs.some((ref) => !ref.startsWith(`${candidate.sheetName}!`))) score += 2;
  if (candidate.scope === "global") score += 8;
  if (candidate.metricFamily !== "other") score += 6;
  if (candidate.rowContext?.kind === "portfolio_summary") score += 10;
  if (candidate.rowContext?.kind === "financing_row") score += 6;
  if (candidate.rowContext?.kind === "section_header") score -= 12;
  if (candidate.rowContext?.kind === "asset_detail" || candidate.rowContext?.kind === "forward_asset_detail") score -= 3;
  if (candidate.sheetOutputProfile.mode === "detail") score -= 8;
  if (candidate.sheetOutputProfile.mode === "summary") score += 4;
  if (normalizedLabel === normalizedValue || normalizedLabel === normalizeText(candidate.address)) score -= 8;
  if (looksLikeSectionLabel(candidate.label) && !isMetricLikeLabel(candidate.label)) {
    score -= 6;
  }
  if (isLikelyYearValue(candidate.value)) score -= 6;
  if (candidate.value.length < 2) score -= 2;
  if (candidate.value.trim() === "-") score -= 6;
  if (looksLikeDensityMetric(candidate.label)) score -= 12;
  if (looksLikeAuxiliaryMetric(candidate.label)) score -= 10;
  score -= scoreMetricValueMismatch(candidate.label, candidate.value);

  return score;
}

function inferOutputScope(params: {
  sheetName: string;
  getRowValues: (rowIndex: number) => string[];
  address: string;
  label: string;
  rowContext?: OutputRowContext;
  sheetOutputProfile: SheetOutputProfile;
  metricFamily: MetricFamily;
}): "global" | "local" {
  if (
    isCompactSheetIdentifier(params.sheetName) &&
    params.sheetOutputProfile.crossSheetFormulaRatio <= 0.12 &&
    params.metricFamily !== "financing"
  ) {
    return "local";
  }
  if (params.sheetOutputProfile.mode === "detail") return "local";
  if (
    params.sheetOutputProfile.monthlyPeriodHeaderCount >= 6 &&
    params.sheetOutputProfile.monthlyPeriodHeaderCount > params.sheetOutputProfile.annualPeriodHeaderCount
  ) {
    return "local";
  }
  if (params.rowContext?.kind === "asset_detail" || params.rowContext?.kind === "forward_asset_detail") return "local";
  if (params.rowContext?.kind === "section_header") return "local";
  if (params.rowContext?.kind === "portfolio_summary" || params.rowContext?.kind === "financing_row") return "global";
  if (params.sheetOutputProfile.mode === "summary" && params.metricFamily !== "other") return "global";

  const decoded = XLSX.utils.decode_cell(params.address);
  const rowValues = params.getRowValues(decoded.r).filter(Boolean);
  const leadingTextCells = rowValues.slice(0, 6).filter((cell) => cell && !looksNumeric(cell));
  const numericCells = rowValues.filter((cell) => looksNumeric(cell));
  const hasEntityDescriptor = inferEntityDescriptor(rowValues) !== null;

  if (
    rowValues.length >= 5 &&
    leadingTextCells.length >= 2 &&
    numericCells.length >= 2 &&
    hasEntityDescriptor &&
    !looksLikeSummaryRollupLabel(params.label)
  ) {
    return "local";
  }

  return "global";
}

function shouldConsiderOutputCell(params: {
  address: string;
  getRowValues: (rowIndex: number) => string[];
  rowContext?: OutputRowContext;
  sheetOutputProfile: SheetOutputProfile;
  value: string;
}): boolean {
  if (!looksNumeric(params.value)) return false;
  if (
    params.sheetOutputProfile.mode !== "summary" ||
    params.sheetOutputProfile.annualPeriodHeaderCount < 4 ||
    params.rowContext?.kind !== "portfolio_summary"
  ) {
    return true;
  }

  const decoded = XLSX.utils.decode_cell(params.address);
  const currentRow = params.getRowValues(decoded.r);
  const numericColumns = currentRow
    .map((cell, index) => ({ cell: String(cell ?? "").trim(), index }))
    .filter((entry) => looksNumeric(entry.cell))
    .map((entry) => entry.index);

  if (numericColumns.length === 0) return true;

  const totalColumns = new Set<number>();
  for (let rowIndex = Math.max(0, decoded.r - 4); rowIndex < decoded.r; rowIndex++) {
    const headerRow = params.getRowValues(rowIndex);
    headerRow.forEach((cell, index) => {
      const trimmed = String(cell ?? "").trim();
      if (/^total$/i.test(trimmed)) totalColumns.add(index);
    });
  }

  if (totalColumns.size > 0) {
    return totalColumns.has(decoded.c);
  }

  const rightmostNumericColumn = Math.max(...numericColumns);
  return decoded.c === rightmostNumericColumn;
}

function inferSheetOutputProfile(
  sheet: SheetData,
  getRowValues: (rowIndex: number) => string[],
  cells: Array<[string, XLSX.CellObject]>
): SheetOutputProfile {
  const sampleRows = Array.from({ length: Math.min(sheet.rowCount, 80) }, (_, index) => getRowValues(index));
  const periodHeaderCount = Math.max(0, ...sampleRows.map((row) => countPeriodMarkers(row)));
  const annualPeriodHeaderCount = Math.max(0, ...sampleRows.map((row) => countAnnualPeriodMarkers(row)));
  const monthlyPeriodHeaderCount = Math.max(0, ...sampleRows.map((row) => countMonthlyPeriodMarkers(row)));
  const crossSheetFormulaCount = cells.filter(([, cell]) => typeof cell.f === "string" && /!/.test(String(cell.f))).length;
  const formulaCount = cells.filter(([, cell]) => typeof cell.f === "string").length;
  const crossSheetFormulaRatio = formulaCount > 0 ? crossSheetFormulaCount / formulaCount : 0;
  const repeatedMetricRows = sampleRows
    .filter((row) => {
      const numericCount = row.filter((cell) => looksNumeric(String(cell ?? "").trim())).length;
      const label = inferPrimaryRowLabel(row);
      return numericCount >= 4 && Boolean(label);
      }).length;
  const entityRowCount = sampleRows.filter((row) => inferEntityDescriptor(row) != null).length;
  const summaryRowCount = sampleRows.filter((row) => {
    const label = inferPrimaryRowLabel(row);
    const numericCount = row.filter((cell) => looksNumeric(String(cell ?? "").trim())).length;
    return Boolean(label) && !inferEntityDescriptor(row) && numericCount >= 3 && looksLikeSummaryRollupLabel(label);
  }).length;
  const sectionHeaderCount = sampleRows.filter((row) => {
    const label = inferPrimaryRowLabel(row);
    const numericCount = row.filter((cell) => looksNumeric(String(cell ?? "").trim())).length;
    return Boolean(label) && numericCount === 0 && looksLikeSectionLabel(label);
  }).length;
  const compactSheetIdentifier = isCompactSheetIdentifier(sheet.name);

  const mode: SheetOutputProfile["mode"] =
    (
      (
        entityRowCount >= 10 ||
        compactSheetIdentifier ||
        monthlyPeriodHeaderCount >= 6
      ) &&
      repeatedMetricRows >= 6 &&
      monthlyPeriodHeaderCount >= 4 &&
      crossSheetFormulaRatio <= 0.12
    )
      ? "detail"
      : (
          crossSheetFormulaRatio >= 0.18 ||
          (summaryRowCount >= 6 && entityRowCount <= 4) ||
          (
            annualPeriodHeaderCount >= 4 &&
            monthlyPeriodHeaderCount <= 2 &&
            repeatedMetricRows >= 4 &&
            sheet.rowCount <= 160
          )
        )
        ? "summary"
        : "mixed";

  return {
    mode,
    periodHeaderCount,
    annualPeriodHeaderCount,
    monthlyPeriodHeaderCount,
    crossSheetFormulaRatio,
    entityRowCount,
    summaryRowCount,
    sectionHeaderCount,
  };
}

function inferMetricFamily(label: string, value: string): MetricFamily {
  const source = `${label} ${value}`;

  if (/(revenue|sales|rent income|operating revenue|turnover)/i.test(source)) return "revenue";
  if (/(ebitda|noi|operating profit|margin)/i.test(source)) return "profitability";
  if (/\b(irr|moic)\b/i.test(source)) return "returns";
  if (/\b(ltv|ltc|debt|loan|mezz|interest|coupon|amort)/i.test(source)) return "leverage";
  if (/(occupancy|vacancy|leased|occupied)/i.test(source)) return "occupancy";
  if (/(sources|uses|facility|equity|senior|junior|financing|bridge)/i.test(source)) return "financing";
  if (/(yield|yoc|niy|valuation|enterprise value|equity value|exit value|entry value|entry price|exit price|purchase price|cap rate)/i.test(source)) return "valuation";
  if (/(capex|maintenance|fit out|fit-out|expansion|development cost)/i.test(source)) return "capex";
  return "other";
}

function selectWorkbookOutputs(
  candidates: OutputCandidate[],
  incoming: Map<string, Set<string>>
): {
  canonicalOutputs: OutputSignal[];
  topOutputs: OutputSignal[];
} {
  const signals = candidates
    .map((candidate) => toProvisionalOutputSignal(candidate, incoming))
    .filter((signal) => scoreSurfacedOutputSignal(signal) > 0)
    .sort((left, right) => scoreSurfacedOutputSignal(right) - scoreSurfacedOutputSignal(left));

  const canonicalOutputs: OutputSignal[] = [];
  const seenFamilies = new Set<string>();
  const seenOutputs = new Set<string>();
  const seenCanonicalLabels = new Set<string>();

  for (const signal of signals) {
    const qualified = `${signal.sheet}!${signal.cell}`;
    const familyKey = signal.scope === "global" ? `${signal.scope}:${signal.metricFamily}` : "";
    const labelKey = `${signal.scope}:${normalizeText(signal.label)}`;
    if (seenOutputs.has(qualified)) continue;
    if (!isCanonicalInvestorFacingOutput(signal)) continue;

    if (
      signal.scope === "global" &&
      signal.metricFamily !== "other" &&
      !seenFamilies.has(familyKey) &&
      !seenCanonicalLabels.has(labelKey)
    ) {
      canonicalOutputs.push(signal);
      seenFamilies.add(familyKey);
      seenCanonicalLabels.add(labelKey);
      seenOutputs.add(qualified);
      continue;
    }

    if (
      signal.scope === "global" &&
      canonicalOutputs.length < 12 &&
      signal.metricFamily !== "other" &&
      !seenCanonicalLabels.has(labelKey) &&
      scoreSurfacedOutputSignal(signal) >= 35
    ) {
      canonicalOutputs.push(signal);
      seenCanonicalLabels.add(labelKey);
      seenOutputs.add(qualified);
    }
  }

  const selectedOutputs: OutputSignal[] = [];
  const topSeen = new Set<string>();
  for (const signal of [...canonicalOutputs, ...signals]) {
    const qualified = `${signal.sheet}!${signal.cell}`;
    const labelKey = `${signal.sheet}:${normalizeText(signal.label)}:${signal.scope}`;
    if (topSeen.has(labelKey) || topSeen.has(qualified)) continue;
    topSeen.add(qualified);
    topSeen.add(labelKey);
    selectedOutputs.push(signal);
    if (selectedOutputs.length >= 40) break;
  }

  const finalizedCanonicalOutputs = canonicalOutputs.map((signal) => finalizeOutputSignal(signal, incoming));
  const finalizedTopOutputs = selectedOutputs.map((signal) => finalizeOutputSignal(signal, incoming));

  return {
    canonicalOutputs: finalizedCanonicalOutputs,
    topOutputs: finalizedTopOutputs,
  };
}

function isCanonicalInvestorFacingOutput(signal: OutputSignal): boolean {
  if (signal.scope !== "global") return false;
  if (signal.metricFamily === "other") return false;
  if (looksLikeSectionLabel(signal.label)) return false;
  if (looksLikeAuxiliaryMetric(signal.label)) return false;
  if (looksLikeDecoratedEntityLabel(signal.label)) return false;
  if (scoreMetricValueMismatch(signal.label, signal.value) >= 16) return false;

  if (signal.sheetRole === "OUTPUTS") {
    if (signal.rowKind === "financing_row") {
      return isMetricLikeLabel(signal.label);
    }
    return isMetricLikeLabel(signal.label) || signal.rowKind === "portfolio_summary";
  }

  if (signal.sheetRole === "CALC_ENGINE") {
    return (
      isMetricLikeLabel(signal.label) &&
      signal.rowKind === "portfolio_summary" &&
      signal.supportingRefs.length > 0
    );
  }

  return isMetricLikeLabel(signal.label);
}

function toProvisionalOutputSignal(
  candidate: OutputCandidate,
  incoming: Map<string, Set<string>>
): OutputSignal {
  const qualified = `${candidate.sheetName}!${candidate.address}`;
  const precedents = Array.from(incoming.get(qualified) ?? []);

  return {
    sheet: candidate.sheetName,
    cell: candidate.address,
    label: candidate.label,
    value: candidate.value,
    sheetRole: candidate.sheetRole,
    supportingRefs: candidate.refs.slice(0, 8),
    confidence: candidate.refs.length > 0 ? "high" : "medium",
    scope: candidate.scope,
    metricFamily: candidate.metricFamily,
    rowKind: candidate.rowContext.kind,
    crossSheetPrecedentCount: precedents.filter((ref) => !ref.startsWith(`${candidate.sheetName}!`)).length,
    transitivePrecedentCount: 0,
  };
}

function finalizeOutputSignal(
  signal: OutputSignal,
  incoming: Map<string, Set<string>>
): OutputSignal {
  const qualified = `${signal.sheet}!${signal.cell}`;
  const transitivePrecedents = collectTransitivePrecedents(qualified, incoming);
  return {
    ...signal,
    transitivePrecedentCount: transitivePrecedents.length,
  };
}

function buildCriticalDependencySignals(
  outputs: OutputSignal[],
  incoming: Map<string, Set<string>>,
  hardcodes: HardcodeSignal[]
): CriticalDependencySignal[] {
  const materialHardcodes = hardcodes.filter((signal) => signal.classification !== "presentation_reference" && signal.severity !== "low");
  const hardcodeSet = new Set(materialHardcodes.map((signal) => `${signal.sheet}!${signal.cell}`));

  return outputs.map((output) => {
    const qualified = `${output.sheet}!${output.cell}`;
    const precedents = Array.from(incoming.get(qualified) ?? []);
    const transitivePrecedents = collectTransitivePrecedents(qualified, incoming);
    const hardcodedPrecedents = precedents.filter((ref) => referenceTouchesHardcode(ref, materialHardcodes));
    const transitiveHardcodedPrecedents = transitivePrecedents.filter((ref) => referenceTouchesHardcode(ref, materialHardcodes));

    return {
      output: qualified,
      outputScope: output.scope,
      metricFamily: output.metricFamily,
      rowKind: output.rowKind,
      precedentCount: precedents.length,
      transitivePrecedentCount: transitivePrecedents.length,
      hardcodedPrecedentCount: hardcodedPrecedents.length,
      transitiveHardcodedPrecedentCount: transitiveHardcodedPrecedents.length,
      crossSheetPrecedentCount: precedents.filter((ref) => !ref.startsWith(`${output.sheet}!`)).length,
      transitiveCrossSheetPrecedentCount: transitivePrecedents.filter((ref) => !ref.startsWith(`${output.sheet}!`)).length,
      sampleHardcodePaths: collectPathsToSpecificTargets(
        qualified,
        transitiveHardcodedPrecedents.filter((ref) => hardcodeSet.has(ref)),
        incoming,
        3
      ),
    };
  });
}

function collectPathsToTargets(
  source: string,
  targetSet: Set<string>,
  outgoing: Map<string, Set<string>>,
  limit: number
): ProvenancePath[] {
  if (targetSet.size === 0) return [];

  const queue: Array<{ node: string; path: string[] }> = [{ node: source, path: [source] }];
  const visited = new Set<string>([source]);
  const matches: ProvenancePath[] = [];

  while (queue.length > 0 && matches.length < limit) {
    const current = queue.shift();
    if (!current) break;

    if (targetSet.has(current.node) && current.node !== source) {
      matches.push({
        output: current.node,
        nodes: current.path,
        crossSheetHopCount: countCrossSheetHops(current.path),
      });
      continue;
    }

    for (const dependent of outgoing.get(current.node) ?? []) {
      if (visited.has(dependent)) continue;
      visited.add(dependent);
      queue.push({
        node: dependent,
        path: [...current.path, dependent],
      });
    }
  }

  return matches;
}

function collectPathsToSpecificTargets(
  target: string,
  sources: string[],
  incoming: Map<string, Set<string>>,
  limit: number
): ProvenancePath[] {
  const sourceSet = new Set(sources);
  const queue: Array<{ node: string; path: string[] }> = [{ node: target, path: [target] }];
  const visited = new Set<string>([target]);
  const matches: ProvenancePath[] = [];

  while (queue.length > 0 && matches.length < limit) {
    const current = queue.shift();
    if (!current) break;

    if (sourceSet.has(current.node) && current.node !== target) {
      const nodes = [...current.path].reverse();
      matches.push({
        output: target,
        nodes,
        crossSheetHopCount: countCrossSheetHops(nodes),
      });
      continue;
    }

    for (const precedent of incoming.get(current.node) ?? []) {
      if (visited.has(precedent)) continue;
      visited.add(precedent);
      queue.push({
        node: precedent,
        path: [...current.path, precedent],
      });
    }
  }

  return matches;
}

function countCrossSheetHops(nodes: string[]): number {
  let count = 0;
  for (let index = 1; index < nodes.length; index++) {
    const [previousSheet] = splitQualifiedRef(nodes[index - 1], "");
    const [currentSheet] = splitQualifiedRef(nodes[index], "");
    if (previousSheet && currentSheet && previousSheet !== currentSheet) count += 1;
  }
  return count;
}

function shouldFlagDisconnectedCalc(params: {
  sheetRole: SheetData["role"];
  address: string;
  cell: XLSX.CellObject;
  value: string;
  label: string;
  hasIncoming: boolean;
  hasOutgoing: boolean;
}): boolean {
  if (params.sheetRole !== "CALC_ENGINE") return false;
  if (!params.hasIncoming || params.hasOutgoing) return false;
  if (!looksNumeric(params.value)) return false;
  if (isLikelyDateValue(params.value)) return false;
  if (isLikelyMetadataFormula(String(params.cell.f ?? ""), params.label, params.address)) return false;
  if (isLikelyHelperRollupFormula(String(params.cell.f ?? ""), params.label, params.address)) return false;

  const decoded = XLSX.utils.decode_cell(params.address);
  if (decoded.r < 8 && !isMetricLikeLabel(params.label)) return false;

  return true;
}

function scoreMetricValueMismatch(label: string, value: string): number {
  const normalizedLabel = normalizeText(label);
  const numeric = extractNumericTokenForScoring(value);
  const parsed = numeric ? Number(numeric.replace(/,/g, "")) : null;
  const absoluteValue = parsed == null ? null : Math.abs(parsed);
  const hasPercentDisplay = /%/.test(value);
  const hasMultipleDisplay = /(?:^|[^a-z])\d+(?:\.\d+)?x(?:$|[^a-z])/i.test(value);

  if (/(irr|ltv|ltc|yield|yoc|niy|margin|occup|interest rate|cap rate)/i.test(normalizedLabel)) {
    if (!hasPercentDisplay && absoluteValue != null && absoluteValue > 100) return 20;
  }

  if (/\b(moic|multiple)\b/i.test(normalizedLabel)) {
    if (!hasMultipleDisplay && absoluteValue != null && absoluteValue > 20) return 16;
  }

  if (/\b(sqm|sq m|m2|sqft|psm|per sqm)\b/i.test(normalizedLabel) && hasPercentDisplay) {
    return 12;
  }

  if (/\b(period|years?|months?|amort)\b/i.test(normalizedLabel) && hasPercentDisplay) {
    return 10;
  }

  return 0;
}

function extractNumericTokenForScoring(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const negativeByParentheses = /^\(.*\)$/.test(trimmed);
  const match = trimmed.match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!match?.[0]) return null;

  if (negativeByParentheses && !match[0].startsWith("-")) {
    return `-${match[0]}`;
  }

  return match[0];
}

function isLikelyMetadataFormula(formula: string, label: string, address: string): boolean {
  const normalizedFormula = normalizeText(formula);
  const normalizedLabel = normalizeText(label);

  if (/cell\("filename"|mid\(|find\(|year\(|eomonth\(/i.test(formula)) return true;
  if (/(entry|exit)/.test(normalizedLabel) && /if\(/i.test(formula)) return true;
  if (normalizedLabel === normalizeText(address)) return true;

  return false;
}

function isLikelyHelperRollupFormula(formula: string, label: string, address: string): boolean {
  const normalizedLabel = normalizeText(label);

  if (!formula) return false;
  if (normalizedLabel === "-" || normalizedLabel === "na") return true;
  if (looksNumeric(label)) return true;
  const normalizedFormula = formula.replace(/\$/g, "").toUpperCase();
  const localOnly = !/[!]/.test(normalizedFormula);
  const aggregationFunction = /^(SUM|SUMIFS|AVERAGE|AVERAGEIFS|MIN|MAX|INDEX)\(/i.test(normalizedFormula);
  const repeatedRowRange = /^([A-Z]+\d+:[A-Z]+\d+|[A-Z]+\d+(?::XFD\d+)?)$/.test(
    normalizedFormula
      .replace(/^(SUM|SUMIFS|AVERAGE|AVERAGEIFS|MIN|MAX|INDEX)\(/i, "")
      .replace(/\)$/g, "")
      .split(",")[0]
      ?.trim() ?? ""
  );

  if (
    localOnly &&
    aggregationFunction &&
    repeatedRowRange &&
    (
      normalizedLabel === "-" ||
      normalizedLabel === "na" ||
      looksLikeSummaryRollupLabel(label) ||
      (!isMetricLikeLabel(label) && normalizedLabel.length <= 6)
    )
  ) {
    return true;
  }

  const decoded = XLSX.utils.decode_cell(address);
  if (decoded.c >= 10 && aggregationFunction && localOnly && !isMetricLikeLabel(label)) return true;

  return false;
}

function isBenignOutputConstant(label: string, value: string, address: string): boolean {
  const normalizedLabel = normalizeText(label);
  const normalizedValue = normalizeText(value);

  if (!normalizedLabel || normalizedLabel === normalizeText(address)) return true;
  if (normalizedLabel === normalizedValue) return true;
  if (isLikelyYearValue(value)) return true;
  if (/^(x|target|entry|exit)$/.test(normalizedLabel)) return true;
  if (/asset location info|location info|store info|portfolio info|header|footer/.test(normalizedLabel)) return true;
  if (/^[1-9]\d?$/.test(value.replace(/[,\s]/g, "")) && /asset|store|location|count|units?|sqm|m2/.test(normalizedLabel)) return true;

  return false;
}

function isBenignStructuralHardcode(label: string, value: string, address: string, rowValues: string[]): boolean {
  const normalizedLabel = normalizeText(label);
  const labelLooksLikeCellRef = /^[A-Z]{1,3}\d+$/i.test(label.trim());
  if (normalizedLabel !== normalizeText(address) && !labelLooksLikeCellRef) return false;

  const compactInteger = /^-?\d{1,2}$/.test(value.replace(/[,\s]/g, ""));
  if (!compactInteger) return false;

  const periodMarkers = countPeriodMarkers(rowValues) + countAnnualPeriodMarkers(rowValues) + countMonthlyPeriodMarkers(rowValues);
  const nonEmptyCount = rowValues.map((cell) => String(cell ?? "").trim()).filter(Boolean).length;

  return periodMarkers >= 3 || nonEmptyCount <= 8 || hasSequentialIndexPattern(rowValues);
}

function hasSequentialIndexPattern(rowValues: string[]): boolean {
  const smallIntegers = rowValues
    .map((cell) => String(cell ?? "").trim())
    .filter((cell) => /^-?\d{1,2}$/.test(cell))
    .map((cell) => Number(cell))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 24);

  if (smallIntegers.length < 4) return false;

  let streak = 1;
  for (let index = 1; index < smallIntegers.length; index++) {
    if (smallIntegers[index] === smallIntegers[index - 1] + 1) {
      streak += 1;
      if (streak >= 4) return true;
    } else if (smallIntegers[index] !== smallIntegers[index - 1]) {
      streak = 1;
    }
  }

  return false;
}

function isLikelyLocalUnderwritingConstant(rowValues: string[], label: string): boolean {
  const normalizedLabel = normalizeText(label);
  const nonEmpty = rowValues.map((cell) => String(cell ?? "").trim()).filter(Boolean);
  const numericCells = nonEmpty.filter((cell) => looksNumeric(cell));
  const textCells = nonEmpty.filter((cell) => !looksNumeric(cell));
  const entityDescriptor = inferEntityDescriptor(nonEmpty);

  if (looksLikeSummaryRollupLabel(normalizedLabel)) return false;
  if (textCells.length < 2 || numericCells.length < 2 || !entityDescriptor) return false;
  if (/^(fh|lh|-|na)$/.test(normalizedLabel)) return true;
  if (isMetricLikeLabel(label)) return true;

  return numericCells.length >= 3;
}

function isRowLocalDependency(source: string, dependent: string): boolean {
  const [sourceSheet, sourceCell] = splitQualifiedRef(source, "");
  const [dependentSheet, dependentCell] = splitQualifiedRef(dependent, "");
  if (sourceSheet !== dependentSheet || !sourceCell || !dependentCell) return false;

  try {
    const sourceDecoded = XLSX.utils.decode_cell(sourceCell);
    const dependentDecoded = XLSX.utils.decode_cell(dependentCell);
    return Math.abs(sourceDecoded.r - dependentDecoded.r) <= 1;
  } catch {
    return false;
  }
}

function isMetricLikeLabel(label: string): boolean {
  return /(revenue|sales|rent|ebitda|noi|cash ?flow|irr|moic|yield|yoc|ltv|ltc|debt|occup|margin|capex|enterprise value|equity value|entry price|exit price|purchase price|cap rate|interest rate|equity)/i.test(label);
}

function isLikelyYearValue(value: string): boolean {
  return /^(19|20)\d{2}$/.test(value.trim()) || /^fy?\d{2,4}$/i.test(value.trim());
}

function isLikelyDateValue(value: string): boolean {
  return /^(19|20)\d{2}[-/](0?[1-9]|1[0-2])([-/](0?[1-9]|[12]\d|3[01]))?$/.test(value.trim())
    || /^(0?[1-9]|[12]\d|3[01])[-/](0?[1-9]|1[0-2])[-/](19|20)\d{2}$/.test(value.trim())
    || /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(value.trim());
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();
}

function inferPrimaryRowLabel(row: string[]): string {
  for (const cell of row.slice(0, 6)) {
    const trimmed = String(cell ?? "").trim();
    if (!trimmed || looksNumeric(trimmed)) continue;
    return trimmed;
  }
  return "";
}

function inferEntityDescriptor(row: string[]): { code: string; name: string } | null {
  const cells = row.map((cell) => String(cell ?? "").trim());
  for (let index = 0; index < Math.min(5, cells.length - 1); index++) {
    const current = cells[index];
    const next = cells[index + 1];
    if (!current || !next) continue;
    if (!/^[A-Z0-9_-]{2,10}$/i.test(current)) continue;
    if (looksNumeric(next) || next.length < 3) continue;
    if (looksLikeSummaryRollupLabel(next)) continue;
    return { code: current, name: next };
  }
  return null;
}

function countPeriodMarkers(row: string[]): number {
  return row.filter((cell) => {
    const trimmed = String(cell ?? "").trim();
    return (
      isLikelyYearValue(trimmed) ||
      isLikelyDateValue(trimmed) ||
      /\bq[1-4]\b/i.test(trimmed) ||
      /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(trimmed)
    );
  }).length;
}

function countAnnualPeriodMarkers(row: string[]): number {
  return row.filter((cell) => {
    const trimmed = String(cell ?? "").trim();
    return isLikelyYearValue(trimmed) || /^fy\d{2,4}$/i.test(trimmed) || /^total$/i.test(trimmed);
  }).length;
}

function countMonthlyPeriodMarkers(row: string[]): number {
  return row.filter((cell) => {
    const trimmed = String(cell ?? "").trim();
    return (
      /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(trimmed) ||
      /^(0?[1-9]|1[0-2])[-/](19|20)\d{2}$/.test(trimmed) ||
      /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)-?\d{2,4}$/i.test(trimmed)
    );
  }).length;
}

function looksLikeSectionLabel(label: string): boolean {
  const normalized = normalizeText(label);
  return /^(deal|lev|unlev|target|fh|lh|section|summary|overview|header|footer)$/.test(normalized);
}

function looksLikeFinancingLabel(label: string): boolean {
  return /(debt|loan|facility|interest|coupon|financing|sources|uses|equity|mezz|bridge)/i.test(label);
}

function looksLikeDensityMetric(label: string): boolean {
  return /\b(psm|psqm|per sqm|per sq m|nla|sqm|m2|sqft)\b/i.test(label);
}

function looksLikeAuxiliaryMetric(label: string): boolean {
  return /\b(period|amort|helper|schedule|month count|months|days)\b/i.test(label);
}

function looksLikeDecoratedEntityLabel(label: string): boolean {
  return /[|]/.test(label);
}

function looksLikeSummaryRollupLabel(label: string): boolean {
  const normalized = normalizeText(label);
  return /(total|overall|portfolio|group|summary|roll up|rollup|consolidated|aggregate)/.test(normalized);
}

function isCompactSheetIdentifier(sheetName: string): boolean {
  const trimmed = sheetName.trim();
  if (!trimmed) return false;
  return /^[A-Z0-9_-]{2,12}$/.test(trimmed) && trimmed.split(/[_-]/).length <= 2;
}

function extractDirectRefsFromExpression(expression: string, currentSheet: string, sheetOrder: string[]): string[] {
  const rawRefs = expression.match(/(?:'[^']+'|[A-Za-z0-9_]+)?!?[$]?[A-Z]{1,3}[$]?\d+(?::[$]?[A-Z]{1,3}[$]?\d+)?/g) ?? [];
  return Array.from(
    new Set(
      rawRefs.flatMap((ref) => qualifyRef(ref, currentSheet, sheetOrder))
    )
  );
}

function qualifyRef(ref: string, currentSheet: string, sheetOrder: string[]): string[] {
  const bangIndex = ref.lastIndexOf("!");
  const sheetPart = bangIndex >= 0 ? ref.slice(0, bangIndex) : currentSheet;
  const cellPart = bangIndex >= 0 ? ref.slice(bangIndex + 1) : ref;
  const normalizedCellPart = cellPart.replace(/\$/g, "");
  const normalizedSheetPart = stripOuterQuotes(sheetPart);

  if (normalizedSheetPart.includes(":")) {
    const [startSheet, endSheet] = normalizedSheetPart.split(":");
    const sheets = expandSheetRange(startSheet, endSheet, sheetOrder);
    return sheets.flatMap((sheet) => qualifySingleSheetRef(sheet, normalizedCellPart));
  }

  return qualifySingleSheetRef(normalizedSheetPart, normalizedCellPart);
}

function qualifySingleSheetRef(sheet: string, cellPart: string): string[] {
  const normalizedSheet = sheet.trim();
  if (!normalizedSheet) return [];
  if (!cellPart.includes(":")) return [`${normalizedSheet}!${cellPart}`];

  const [start, end] = cellPart.split(":");
  if (!start || !end) return [`${normalizedSheet}!${cellPart}`];

  const expanded = expandCellRange(normalizedSheet, start, end);
  return expanded.length > 0 ? expanded : [`${normalizedSheet}!${cellPart}`];
}

function splitQualifiedRef(ref: string, fallbackSheet: string): [string, string] {
  if (!ref.includes("!")) return [fallbackSheet, ref];
  const [sheet, cell] = ref.split("!");
  return [sheet, cell];
}

function hasThreeDimensionalRef(formula: string): boolean {
  return /(?:'[^']+:[^']+'|[A-Za-z0-9_]+:[A-Za-z0-9_]+)![$]?[A-Z]{1,3}[$]?\d+/i.test(formula);
}

function expandSheetRange(startSheet: string, endSheet: string, sheetOrder: string[]): string[] {
  const startIndex = sheetOrder.indexOf(startSheet);
  const endIndex = sheetOrder.indexOf(endSheet);
  if (startIndex === -1 || endIndex === -1) return [];

  const [from, to] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
  return sheetOrder.slice(from, to + 1);
}

function expandCellRange(sheet: string, start: string, end: string): string[] {
  try {
    const range = XLSX.utils.decode_range(`${start}:${end}`);
    const rowCount = range.e.r - range.s.r + 1;
    const colCount = range.e.c - range.s.c + 1;
    const cellCount = rowCount * colCount;

    if (cellCount <= 0 || cellCount > 32) return [];

    const refs: string[] = [];
    for (let row = range.s.r; row <= range.e.r; row++) {
      for (let col = range.s.c; col <= range.e.c; col++) {
        refs.push(`${sheet}!${XLSX.utils.encode_cell({ r: row, c: col })}`);
      }
    }
    return refs;
  } catch {
    return [];
  }
}

function extractPotentialDefinedNames(formula: string): string[] {
  const tokens = formula.match(/\b[A-Za-z_][A-Za-z0-9_.]*\b/g) ?? [];
  return Array.from(
    new Set(
      tokens.filter((token) =>
        !isCellLikeToken(token) &&
        !isExcelFunctionCall(formula, token) &&
        !isExcelKeywordToken(token)
      )
    )
  );
}

function isCellLikeToken(token: string): boolean {
  return /^[A-Z]{1,3}\d+$/i.test(token);
}

function isExcelFunctionCall(formula: string, token: string): boolean {
  return new RegExp(`\\b${escapeRegExp(token)}\\s*\\(`, "i").test(formula);
}

function isExcelKeywordToken(token: string): boolean {
  return /^(true|false|if|and|or|not)$/i.test(token);
}

function isUnsupportedDefinedName(name: string, ref: string): boolean {
  if (/^_xlfn\./i.test(name)) return true;
  if (ref.startsWith("{")) return true;
  return false;
}

function stripOuterQuotes(value: string): string {
  return value.startsWith("'") && value.endsWith("'")
    ? value.slice(1, -1)
    : value;
}

function referenceTouchesHardcode(ref: string, hardcodes: HardcodeSignal[]): boolean {
  const [sheet, cellOrRange] = splitQualifiedRef(ref, "");
  if (!sheet || !cellOrRange) return false;

  if (!cellOrRange.includes(":")) {
    const normalizedCell = cellOrRange.replace(/\$/g, "");
    return hardcodes.some((signal) => signal.sheet === sheet && signal.cell === normalizedCell);
  }

  const [start, end] = cellOrRange.split(":");
  if (!start || !end) return false;

  try {
    const range = XLSX.utils.decode_range(`${start}:${end}`);
    return hardcodes.some((signal) => {
      if (signal.sheet !== sheet) return false;
      const cell = XLSX.utils.decode_cell(signal.cell);
      return cell.r >= range.s.r && cell.r <= range.e.r && cell.c >= range.s.c && cell.c <= range.e.c;
    });
  } catch {
    return false;
  }
}

function buildOutputReachabilityIndex(
  outputs: Set<string>,
  incoming: Map<string, Set<string>>
): Map<string, number> {
  const reachability = new Map<string, number>();

  for (const output of outputs) {
    const seen = new Set<string>();
    const stack = [output];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;

      for (const precedent of incoming.get(current) ?? []) {
        if (seen.has(precedent)) continue;
        seen.add(precedent);
        reachability.set(precedent, (reachability.get(precedent) ?? 0) + 1);
        stack.push(precedent);
      }
    }
  }

  return reachability;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
