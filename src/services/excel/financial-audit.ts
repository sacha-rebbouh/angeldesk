import type { ExcelExtractionResult } from "./extractor";
import type { ExcelModelIntelligence } from "./model-intelligence";

export interface FinancialAuditFlag {
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  message: string;
  evidence: string[];
}

export interface FinancialAuditMetric {
  label: string;
  value: string;
  sheet: string;
  sheetRole?: string;
  category: "revenue" | "profitability" | "returns" | "leverage" | "occupancy" | "valuation" | "other";
  unitCategory?: MetricUnitCategory;
  valueScale?: MetricScale;
  scope?: MetricScope;
  basis?: MetricBasis;
  normalizedValue?: number | null;
  normalizationEvidence?: string[];
}

type MetricUnitCategory = "currency" | "percent" | "multiple" | "area" | "density" | "count" | "unknown";
type MetricScale = "unit" | "thousand" | "million" | "billion" | "percent" | "basis_points";
type MetricScope = "asset" | "portfolio" | "lbo" | "summary" | "unknown";
type MetricBasis = "entry" | "exit" | "ltm" | "forward" | "historical" | "unknown";

const FINANCIAL_RISK_PROFILES = {
  margin: {
    implausibleLow: -0.1,
    implausibleHigh: 0.9,
    healthyLow: 0.05,
    healthyHigh: 0.75,
  },
  occupancy: {
    impossibleLow: 0,
    impossibleHigh: 100,
  },
  leverage: {
    aggressivePortfolioThreshold: 80,
    aggressiveAssetThreshold: 85,
  },
  returns: {
    highForwardIRR: 25,
    highHistoricalIRR: 35,
    highForwardMOIC: 2.5,
    highHistoricalMOIC: 3.5,
    highYieldPercent: 18,
  },
} as const;

export interface FinancialSensitivity {
  driver: string;
  reason: string;
  sensitivity: "high" | "medium" | "low";
}

export interface ExcelFinancialAudit {
  consistencyFlags: FinancialAuditFlag[];
  reconciliationFlags: FinancialAuditFlag[];
  plausibilityFlags: FinancialAuditFlag[];
  heroicAssumptionFlags: FinancialAuditFlag[];
  dependencyFlags: FinancialAuditFlag[];
  greenFlags: FinancialAuditFlag[];
  keyMetrics: FinancialAuditMetric[];
  topSensitivities: FinancialSensitivity[];
  overallRisk: "low" | "medium" | "high" | "critical";
  warnings: string[];
}

export function runExcelFinancialAudit(
  extraction: ExcelExtractionResult,
  intelligence: ExcelModelIntelligence
): ExcelFinancialAudit {
  const keyMetrics = collectKeyMetrics(extraction, intelligence);
  const allMetricCandidates = collectMetricCandidates(extraction);
  const consistencyFlags: FinancialAuditFlag[] = [];
  const reconciliationFlags = buildReconciliationFlags(allMetricCandidates);
  const plausibilityFlags: FinancialAuditFlag[] = [];
  const heroicAssumptionFlags: FinancialAuditFlag[] = [];
  const dependencyFlags: FinancialAuditFlag[] = [];
  const greenFlags: FinancialAuditFlag[] = [];
  const globallyMaterialHardcodes = intelligence.hardcodes.top.filter((signal) =>
    signal.severity === "high" &&
    signal.globalOutputReachCount > 0
  );
  const crossSheetHardcodesToVerify = intelligence.hardcodes.top.filter((signal) =>
    signal.severity === "high" &&
    signal.globalOutputReachCount === 0 &&
    signal.crossSheetDependentCount > 0
  );

  if (globallyMaterialHardcodes.length > 0) {
    dependencyFlags.push({
      severity: globallyMaterialHardcodes.some((signal) => signal.globalOutputReachCount >= 2) ? "critical" : "high",
      title: "Hardcodes materiels sur chemins critiques",
      message: "Certaines valeurs non formulees alimentent reellement des sorties critiques ou des consolidations inter-feuilles.",
      evidence: globallyMaterialHardcodes
        .slice(0, 6)
        .flatMap((signal) => {
          const base = `${signal.sheet}!${signal.cell} ${signal.label}=${signal.value} | dependents=${signal.dependentCount} | globalOutputReach=${signal.globalOutputReachCount}`;
          const paths = signal.sampleGlobalOutputPaths
            .slice(0, 2)
            .map((path) => `path=${path.nodes.join(" -> ")}`);
          return [base, ...paths];
        }),
    });
  }

  if (crossSheetHardcodesToVerify.length > 0) {
    dependencyFlags.push({
      severity: "medium",
      title: "Hardcodes inter-feuilles à vérifier",
      message: "Certaines valeurs statiques alimentent d’autres cellules hors de leur feuille d’origine, sans preuve directe d’impact sur une sortie globale surfacée.",
      evidence: crossSheetHardcodesToVerify
        .slice(0, 6)
        .map((signal) =>
          `${signal.sheet}!${signal.cell} ${signal.label}=${signal.value} | crossSheetDependents=${signal.crossSheetDependentCount}`
        ),
    });
  }

  const hiddenStructureTouchesMaterialPath = globallyMaterialHardcodes.some((signal) =>
    signal.sampleGlobalOutputPaths.some((path) =>
      path.nodes.some((node) => intelligence.hiddenStructures.some((structure) => node.startsWith(`${structure.sheet}!`)))
    )
  );

  if (intelligence.hiddenStructures.length > 0 && hiddenStructureTouchesMaterialPath) {
    dependencyFlags.push({
      severity: "medium",
      title: "Structures masquées",
      message: "Le modèle contient des feuilles/lignes/colonnes masquées qui peuvent porter des hypothèses ou calculs non visibles.",
      evidence: intelligence.hiddenStructures.slice(0, 8).map((signal) => `${signal.type}:${signal.sheet}${signal.index ? `#${signal.index}` : ""}`),
    });
  }

  const advancedRefTouchesCanonicalOutputs = intelligence.criticalDependencies.some((dependency) =>
    dependency.outputScope === "global" &&
    dependency.transitiveCrossSheetPrecedentCount > 0 &&
    (intelligence.lineage.namedRangeCount > 0 || intelligence.lineage.threeDimensionalRefCount > 0)
  );

  if ((intelligence.lineage.namedRangeCount > 0 || intelligence.lineage.threeDimensionalRefCount > 0) && advancedRefTouchesCanonicalOutputs) {
    dependencyFlags.push({
      severity: intelligence.lineage.threeDimensionalRefCount > 0 ? "medium" : "low",
      title: "Références Excel avancées",
      message: "Le modèle utilise des named ranges et/ou des références 3D. Cela n’est pas un défaut en soi, mais augmente l’opacité et la surface de revue quand la chaîne de calcul est dense.",
      evidence: [
        `named ranges=${intelligence.lineage.namedRangeCount}`,
        `3d refs=${intelligence.lineage.threeDimensionalRefCount}`,
      ],
    });
  }

  if (intelligence.disconnectedCalcs.length > 0) {
    const disconnectedAssessment = assessDisconnectedCalcMateriality(intelligence.disconnectedCalcs);
    consistencyFlags.push({
      severity: disconnectedAssessment.severity,
      title: disconnectedAssessment.title,
      message: disconnectedAssessment.message,
      evidence: intelligence.disconnectedCalcs.slice(0, 8).map((signal) => `${signal.sheet}!${signal.cell}`),
    });
  }

  const revenueMetric = findMetric(keyMetrics, /(revenue|sales|rent income|operating revenue)/i);
  const ebitdaMetric = findMetric(keyMetrics, /(ebitda|noi|operating profit)/i);
  const occupancyMetric = findMetric(keyMetrics, /(occupancy)/i, {
    avoid: /(maximum|max\b|sqm|sq m|m2)/i,
  });
  const ltvMetric = findMetric(keyMetrics, /\b(ltv|ltc)\b/i);
  const irrMetric = findMetric(keyMetrics, /\b(irr)\b/i);
  const moicMetric = findMetric(keyMetrics, /\b(moic)\b/i);
  const yieldMetric = findMetric(keyMetrics, /\b(yield|yoc|niy)\b/i);

  if (revenueMetric && ebitdaMetric) {
      const revenue = parseNumericValue(revenueMetric.value);
      const ebitda = parseNumericValue(ebitdaMetric.value);
      if (revenue != null && ebitda != null) {
        const margin = revenue !== 0 ? ebitda / revenue : null;
        if (
          margin != null &&
          (
            margin > FINANCIAL_RISK_PROFILES.margin.implausibleHigh ||
            margin < FINANCIAL_RISK_PROFILES.margin.implausibleLow
          )
        ) {
          plausibilityFlags.push({
            severity: "high",
            title: "Marge EBITDA atypique",
            message: "Le ratio EBITDA / Revenue est hors zone de plausibilité générale et doit être challengé.",
            evidence: [`${ebitdaMetric.label}=${ebitdaMetric.value}`, `${revenueMetric.label}=${revenueMetric.value}`, `margin=${(margin * 100).toFixed(1)}%`],
          });
        }
        if (
          margin != null &&
          margin > FINANCIAL_RISK_PROFILES.margin.healthyLow &&
          margin < FINANCIAL_RISK_PROFILES.margin.healthyHigh
        ) {
          greenFlags.push({
            severity: "low",
            title: "Marge opérationnelle cohérente",
            message: "Le ratio EBITDA / Revenue reste dans une zone plausible à première lecture.",
          evidence: [`margin=${(margin * 100).toFixed(1)}%`],
        });
      }
    }
  }

  if (occupancyMetric) {
    const occupancy = parseNumericValue(occupancyMetric.value);
    const occupancyIsPercent = occupancyMetric.unitCategory === "percent" || /%/.test(occupancyMetric.value);
    const occupancyIsCapOnly = /\b(maximum|max)\b/i.test(occupancyMetric.label);
    if (
      !occupancyIsCapOnly &&
      occupancyIsPercent &&
      occupancy != null &&
      (
        occupancy > FINANCIAL_RISK_PROFILES.occupancy.impossibleHigh ||
        occupancy < FINANCIAL_RISK_PROFILES.occupancy.impossibleLow
      )
    ) {
      plausibilityFlags.push({
        severity: "critical",
        title: "Occupancy impossible",
        message: "Le modèle remonte une occupancy hors bornes physiques.",
        evidence: [`${occupancyMetric.label}=${occupancyMetric.value}`],
      });
    } else if (!occupancyIsCapOnly && occupancyIsPercent && occupancy != null && occupancy >= getAggressiveOccupancyThreshold(occupancyMetric)) {
      heroicAssumptionFlags.push({
        severity: "medium",
        title: "Occupancy héroïque",
        message: "L’occupancy implicite est très élevée et réduit fortement la marge d’erreur du modèle.",
        evidence: [`${occupancyMetric.label}=${occupancyMetric.value}`],
      });
    }
  }

  if (ltvMetric) {
    const ltv = parseNumericValue(ltvMetric.value);
    if (ltv != null && ltv > getAggressiveLeverageThreshold(ltvMetric)) {
      heroicAssumptionFlags.push({
        severity: "high",
        title: "Leverage agressif",
        message: "Le niveau de LTV/LTC paraît agressif et augmente fortement la fragilité du plan.",
        evidence: [`${ltvMetric.label}=${ltvMetric.value}`],
      });
    }
  }

  if (irrMetric) {
    const irr = parseNumericValue(irrMetric.value);
    if (irr != null && irr >= getHighIRRThreshold(irrMetric)) {
      heroicAssumptionFlags.push({
        severity: "medium",
        title: "IRR très élevé",
        message: "Le rendement projeté est élevé et doit être relié explicitement à des drivers réalistes.",
        evidence: [`${irrMetric.label}=${irrMetric.value}`],
      });
    }
  }

  if (moicMetric) {
    const moic = parseNumericValue(moicMetric.value);
    if (moic != null && moic >= getHighMOICThreshold(moicMetric)) {
      heroicAssumptionFlags.push({
        severity: "medium",
        title: "MOIC ambitieux",
        message: "Le multiple de sortie projeté est ambitieux et demande une justification forte.",
        evidence: [`${moicMetric.label}=${moicMetric.value}`],
      });
    }
  }

  if (yieldMetric) {
    const yieldValue = parseNumericValue(yieldMetric.value);
    if (yieldValue != null && yieldValue > getHighYieldThreshold(yieldMetric)) {
      plausibilityFlags.push({
        severity: "high",
        title: "Yield atypique",
        message: "Le yield / YoC / NIY ressort très élevé et peut signaler une erreur de mapping ou une hypothèse extrême.",
        evidence: [`${yieldMetric.label}=${yieldMetric.value}`],
      });
    }
  }

  for (const dep of intelligence.criticalDependencies.slice(0, 20)) {
    if (dep.metricFamily !== "other" && dep.transitiveHardcodedPrecedentCount > 0) {
      dependencyFlags.push({
        severity: dep.transitiveHardcodedPrecedentCount >= 3 ? "high" : "medium",
        title: "Output dépendant de hardcodes",
        message: "Un output critique dépend d’une ou plusieurs cellules hardcodées, directement ou via une chaîne de calcul intermédiaire.",
        evidence: [
          `${dep.output}`,
          `metricFamily=${dep.metricFamily}`,
          `direct hardcoded precedents=${dep.hardcodedPrecedentCount}`,
          `transitive hardcoded precedents=${dep.transitiveHardcodedPrecedentCount}`,
          `precedents=${dep.precedentCount}`,
          ...dep.sampleHardcodePaths.slice(0, 2).map((path) => `path=${path.nodes.join(" -> ")}`),
        ],
      });
    }
  }

  const topSensitivities = buildSensitivities(intelligence, keyMetrics);
  const warnings = [
    ...intelligence.warnings,
    ...(keyMetrics.length === 0 ? ["no_key_metrics_detected"] : []),
  ];
  const overallRisk = inferOverallRisk([
    ...consistencyFlags,
    ...reconciliationFlags,
    ...plausibilityFlags,
    ...heroicAssumptionFlags,
    ...dependencyFlags,
  ]);

  return {
    consistencyFlags,
    reconciliationFlags,
    plausibilityFlags,
    heroicAssumptionFlags,
    dependencyFlags,
    greenFlags,
    keyMetrics,
    topSensitivities,
    overallRisk,
    warnings,
  };
}

function collectKeyMetrics(
  extraction: ExcelExtractionResult,
  intelligence: ExcelModelIntelligence
): FinancialAuditMetric[] {
  const metrics = [
    ...collectCanonicalOutputMetrics(intelligence.outputs.canonical),
    ...collectMetricCandidates(extraction),
  ];
  metrics.sort((left, right) => right.score - left.score);

  const deduped: FinancialAuditMetric[] = [];
  const seen = new Set<string>();
  for (const metric of metrics) {
    if (seen.has(metric.dedupeKey)) continue;
    seen.add(metric.dedupeKey);
    const { score: _score, dedupeKey: _dedupeKey, ...materializedMetric } = metric;
    deduped.push({
      ...materializedMetric,
    });
    if (deduped.length >= 80) break;
  }

  return deduped;
}

function collectCanonicalOutputMetrics(
  outputs: ExcelModelIntelligence["outputs"]["canonical"]
): Array<FinancialAuditMetric & { score: number; dedupeKey: string }> {
  return outputs.map((output) => {
    const category = mapMetricFamilyToCategory(output.metricFamily);
    return {
      label: output.label,
      value: output.value,
      sheet: output.sheet,
      sheetRole: output.sheetRole,
      category,
      score: 20 + (output.scope === "global" ? 15 : 5) + output.crossSheetPrecedentCount,
      dedupeKey: `${output.sheet}:${category}:${normalizeMetricLabel(output.label)}`,
    };
  });
}

function collectMetricCandidates(
  extraction: ExcelExtractionResult
): Array<FinancialAuditMetric & { score: number; dedupeKey: string }> {
  const metrics: Array<FinancialAuditMetric & { score: number; dedupeKey: string }> = [];
  const keywords: Array<{ pattern: RegExp; category: FinancialAuditMetric["category"] }> = [
    { pattern: /(revenue|sales|rent income|operating revenue)/i, category: "revenue" },
    { pattern: /(ebitda|noi|margin)/i, category: "profitability" },
    { pattern: /\b(irr|moic)\b/i, category: "returns" },
    { pattern: /\b(ltv|ltc|debt|leverage)\b/i, category: "leverage" },
    { pattern: /(occupancy)/i, category: "occupancy" },
    { pattern: /(yield|yoc|niy|valuation|cap value|exit)/i, category: "valuation" },
  ];

  const sheets = [...extraction.sheets].sort((left, right) => scoreSheetRole(right.role) - scoreSheetRole(left.role));

  for (const sheet of sheets) {
    const sheetNormalizationHints = collectSheetNormalizationHints(sheet.data);
    for (const [rowIndex, row] of sheet.data.slice(0, 180).entries()) {
      const label = row.find((cell) => String(cell ?? "").trim() && !looksNumeric(String(cell ?? "").trim()));
      if (!label) continue;
      const pattern = keywords.find((entry) => entry.pattern.test(label));
      if (!pattern) continue;
      const values = row
        .map((cell) => String(cell ?? "").trim())
        .filter((cell) => looksNumeric(cell));
      if (values.length === 0) continue;
      const value = selectRepresentativeMetricValue(label, values);
      const normalization = inferMetricNormalization({
        sheetName: sheet.name,
        sheetRole: sheet.role,
        headers: sheet.headers,
        data: sheet.data,
        rowIndex,
        label,
        value,
        category: pattern.category,
        sheetNormalizationHints,
      });
      const metric: FinancialAuditMetric = {
        label,
        value,
        sheet: sheet.name,
        sheetRole: sheet.role,
        category: pattern.category,
        ...normalization,
      };
      metrics.push({
        ...metric,
        score: scoreMetricCandidate(metric),
        dedupeKey: `${metric.sheet}:${metric.category}:${normalizeMetricLabel(metric.label)}`,
      });
    }
  }

  return metrics;
}

function buildSensitivities(
  intelligence: ExcelModelIntelligence,
  keyMetrics: FinancialAuditMetric[]
): FinancialSensitivity[] {
  const sensitivities: FinancialSensitivity[] = [];
  for (const driver of intelligence.drivers.top.slice(0, 12)) {
    const high = /yield|occup|rent|price|ltv|margin|capex|revenue|exit/i.test(driver.label);
    sensitivities.push({
      driver: `${driver.sheet}!${driver.cell} ${driver.label}`,
      reason: high
        ? "Driver financier direct susceptible de bouger fortement les retours"
        : "Input manuel identifié dans les feuilles de drivers",
      sensitivity: high ? "high" : "medium",
    });
  }
  if (sensitivities.length === 0 && keyMetrics.length > 0) {
    for (const metric of keyMetrics.slice(0, 6)) {
      sensitivities.push({
        driver: `${metric.sheet} ${metric.label}`,
        reason: "KPI output à challenger par analyse de sensibilité",
        sensitivity: "medium",
      });
    }
  }
  return sensitivities.slice(0, 12);
}

function assessDisconnectedCalcMateriality(
  signals: ExcelModelIntelligence["disconnectedCalcs"]
): {
  severity: FinancialAuditFlag["severity"];
  title: string;
  message: string;
} {
  const sheets = Array.from(new Set(signals.map((signal) => signal.sheet)));
  const rowNumbers = signals
    .map((signal) => extractRowNumber(signal.cell))
    .filter((row): row is number => row != null)
    .sort((left, right) => left - right);
  const rowSpan = rowNumbers.length > 1 ? rowNumbers[rowNumbers.length - 1] - rowNumbers[0] : 0;
  const summaryLikeCount = signals.filter((signal) => /^(sum|sumifs|iferror|index)\(/i.test(signal.formula)).length;
  const summaryLikeRatio = signals.length > 0 ? summaryLikeCount / signals.length : 0;
  const crossSheetRatio = signals.length > 0
    ? signals.filter((signal) => signal.crossSheetRefCount > 0).length / signals.length
    : 0;
  const metricLikeRatio = signals.length > 0
    ? signals.filter((signal) => isMetricLikeLabel(signal.label)).length / signals.length
    : 0;
  const outputLikeRatio = signals.length > 0
    ? signals.filter((signal) => signal.sheetRole === "OUTPUTS").length / signals.length
    : 0;
  const clusterCount = countDisconnectedClusters(signals);

  if (sheets.length <= 1 && rowSpan <= 8 && summaryLikeRatio >= 0.75) {
    return {
      severity: "medium",
      title: "Bloc de synthèse interne déconnecté",
      message: "Un bloc local de synthèse/calcul ne remonte pas vers les outputs surfacés. Risque réel, mais il peut s’agir d’un sous-tableau interne non consolidé plutôt que d’une rupture globale prouvée.",
    };
  }

  if (outputLikeRatio > 0 || (crossSheetRatio >= 0.25 && metricLikeRatio >= 0.5 && clusterCount >= 2)) {
    return {
      severity: "high",
      title: "Calculs déconnectés à impact potentiel",
      message: "Des cellules formulées à forte teneur métier restent orphelines alors qu’elles sont réparties sur plusieurs clusters ou portent des références inter-feuilles. Cela mérite une revue structurelle avant confiance.",
    };
  }

  return {
    severity: "medium",
    title: "Calculs orphelins à vérifier",
    message: "Certaines cellules formulées ne semblent pas alimenter d’outputs visibles. Le risque existe, mais il n’est pas prouvé qu’il s’agisse d’une rupture globale de consolidation.",
  };
}

function extractRowNumber(cell: string): number | null {
  const match = cell.match(/(\d+)$/);
  if (!match) return null;
  const row = Number(match[1]);
  return Number.isFinite(row) ? row : null;
}

function isMetricLikeLabel(label: string): boolean {
  return /(revenue|sales|rent|ebitda|noi|cash ?flow|irr|moic|yield|yoc|ltv|ltc|debt|occup|margin|capex|enterprise value|equity value|exit|entry|purchase price)/i.test(label);
}

function countDisconnectedClusters(
  signals: ExcelModelIntelligence["disconnectedCalcs"]
): number {
  const rowsBySheet = new Map<string, number[]>();
  for (const signal of signals) {
    const row = extractRowNumber(signal.cell);
    if (row == null) continue;
    const list = rowsBySheet.get(signal.sheet) ?? [];
    list.push(row);
    rowsBySheet.set(signal.sheet, list);
  }

  let clusters = 0;
  for (const rows of rowsBySheet.values()) {
    const sorted = Array.from(new Set(rows)).sort((left, right) => left - right);
    let previous: number | null = null;
    for (const row of sorted) {
      if (previous == null || row - previous > 2) clusters += 1;
      previous = row;
    }
  }

  return clusters;
}

function inferOverallRisk(flags: FinancialAuditFlag[]): ExcelFinancialAudit["overallRisk"] {
  if (flags.some((flag) => flag.severity === "critical")) return "critical";
  if (flags.filter((flag) => flag.severity === "high").length >= 2) return "high";
  if (flags.some((flag) => flag.severity === "high" || flag.severity === "medium")) return "medium";
  return "low";
}

function findMetric(
  metrics: FinancialAuditMetric[],
  pattern: RegExp,
  options?: {
    avoid?: RegExp;
  }
): FinancialAuditMetric | undefined {
  let candidates = metrics.filter((metric) => pattern.test(metric.label));
  if (candidates.length === 0) return undefined;

  if (options?.avoid) {
    const preferred = candidates.filter((metric) => !options.avoid!.test(metric.label));
    if (preferred.length > 0) candidates = preferred;
  }

  candidates.sort((left, right) => scoreMetricCandidate(right, options) - scoreMetricCandidate(left, options));
  return candidates[0];
}

function parseNumericValue(value: string): number | null {
  const token = extractNumericToken(value);
  if (!token) return null;
  const num = Number(token.replace(/,/g, ""));
  return Number.isFinite(num) ? num : null;
}

function looksNumeric(value: string): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^[a-z]{1,5}[-/]?\d{1,4}$/i.test(trimmed)) return false;
  if (/^[a-z]{3,9}-\d{1,4}$/i.test(trimmed)) return false;
  return extractNumericToken(trimmed) != null;
}

function scoreSheetRole(role: string | undefined): number {
  switch (role) {
    case "OUTPUTS":
      return 4;
    case "CALC_ENGINE":
      return 3;
    case "INPUTS":
      return 2;
    case "SUPPORTING_DATA":
      return 1;
    default:
      return 0;
  }
}

function mapMetricFamilyToCategory(
  family: ExcelModelIntelligence["outputs"]["canonical"][number]["metricFamily"]
): FinancialAuditMetric["category"] {
  switch (family) {
    case "revenue":
      return "revenue";
    case "profitability":
      return "profitability";
    case "returns":
      return "returns";
    case "leverage":
    case "financing":
      return "leverage";
    case "occupancy":
      return "occupancy";
    case "valuation":
    case "capex":
      return "valuation";
    default:
      return "other";
  }
}

function scoreMetricCandidate(
  metric: FinancialAuditMetric,
  options?: {
    avoid?: RegExp;
  }
): number {
  let score = scoreSheetRole(metric.sheetRole);
  const normalizedLabel = metric.label.toLowerCase();

  if (options?.avoid?.test(metric.label)) score -= 5;
  if (/maximum|max\b|ceiling|cap\b/.test(normalizedLabel)) score -= 4;
  if (/total|adjusted|portfolio|group|overall|headline/.test(normalizedLabel)) score += 2;
  if (/margin|irr|moic|ebitda|occupancy|yield|ltv|revenue|enterprise value|debt/i.test(metric.label)) score += 1;
  if (/occupancy/i.test(metric.label)) {
    if (metric.unitCategory === "percent") score += 8;
    if (metric.unitCategory === "area" || metric.unitCategory === "density" || metric.unitCategory === "currency") score -= 12;
  }

  return score;
}

function selectRepresentativeMetricValue(label: string, values: string[]): string {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0];

  const percentageValues = values.filter((value) => value.includes("%"));
  if (/occup/i.test(label)) {
    const plausible = percentageValues.filter((value) => {
      const numeric = parseNumericValue(value);
      return numeric != null && numeric >= 30 && numeric <= 100;
    });
    if (plausible.length > 0) return plausible[plausible.length - 1];
  }

  if (/(margin|yield|irr|moic|ltv|ltc)/i.test(label) && percentageValues.length > 0) {
    return percentageValues[percentageValues.length - 1];
  }

  return values[0];
}

function normalizeMetricLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getAggressiveOccupancyThreshold(metric: FinancialAuditMetric): number {
  if (metric.scope === "asset") return 95;
  if (metric.scope === "portfolio" || metric.scope === "summary") return 96;
  return 97;
}

function getAggressiveLeverageThreshold(metric: FinancialAuditMetric): number {
  if (metric.scope === "asset") return FINANCIAL_RISK_PROFILES.leverage.aggressiveAssetThreshold;
  return FINANCIAL_RISK_PROFILES.leverage.aggressivePortfolioThreshold;
}

function getHighIRRThreshold(metric: FinancialAuditMetric): number {
  if (metric.basis === "historical") return FINANCIAL_RISK_PROFILES.returns.highHistoricalIRR;
  return FINANCIAL_RISK_PROFILES.returns.highForwardIRR;
}

function getHighMOICThreshold(metric: FinancialAuditMetric): number {
  if (metric.basis === "historical") return FINANCIAL_RISK_PROFILES.returns.highHistoricalMOIC;
  return FINANCIAL_RISK_PROFILES.returns.highForwardMOIC;
}

function getHighYieldThreshold(metric: FinancialAuditMetric): number {
  if (metric.unitCategory === "percent") return FINANCIAL_RISK_PROFILES.returns.highYieldPercent;
  return FINANCIAL_RISK_PROFILES.returns.highYieldPercent;
}

function buildReconciliationFlags(
  metrics: Array<FinancialAuditMetric & { score: number; dedupeKey: string }>
): FinancialAuditFlag[] {
  const flags: FinancialAuditFlag[] = [];
  const assetSheets = new Set(
    metrics
      .filter((metric) => metric.scope === "asset")
      .map((metric) => metric.sheet)
  );

  if (assetSheets.size < 2) return flags;

  const metricFamilies: Array<{ key: string; patterns: RegExp[]; allowSummaryNames?: RegExp }> = [
    {
      key: "revenue",
      patterns: [/total operating revenue/i, /total revenue/i, /operating revenue/i],
    },
    {
      key: "ebitda",
      patterns: [/adjusted ebitda/i, /\bebitda\b/i, /\bnoi\b/i],
    },
    {
      key: "debt",
      patterns: [/acquisition debt/i, /total debt/i, /debt funding/i],
    },
  ];

  for (const family of metricFamilies) {
    const assetMetrics = pickBestMetricPerSheet(
      metrics.filter((metric) =>
        metric.scope === "asset" &&
        family.patterns.some((pattern) => pattern.test(metric.label))
      )
    );

    if (assetMetrics.length < 2) continue;

    const summaryMetric = findBestSummaryMetric(metrics, family.patterns, family.key);
    if (!summaryMetric) continue;

    const compatibleAssetMetrics = assetMetrics.filter((metric) =>
      isComparableForReconciliation(metric, summaryMetric, family.key)
    );
    if (compatibleAssetMetrics.length < 2) continue;

    const assetSum = compatibleAssetMetrics.reduce((sum, metric) => {
      const normalized = getComparableMetricValue(metric);
      return normalized == null ? sum : sum + normalized;
    }, 0);

    if (!Number.isFinite(assetSum) || Math.abs(assetSum) < 1e-9) continue;

    const summaryValue = getComparableMetricValue(summaryMetric);
    if (summaryValue == null) continue;

    const denominator = Math.max(Math.abs(summaryValue), Math.abs(assetSum), 1);
    const deltaPct = Math.abs(summaryValue - assetSum) / denominator;
    if (deltaPct <= 0.12) continue;

    const severity: FinancialAuditFlag["severity"] = deltaPct >= 0.35 ? "critical" : deltaPct >= 0.2 ? "high" : "medium";
    flags.push({
      severity,
      title: `Reconciliation ${family.key} incohérente`,
      message: "La somme des feuilles d'actifs ne réconcilie pas avec la synthèse portefeuille/LBO.",
      evidence: [
        `summary=${summaryMetric.sheet} ${summaryMetric.label}=${summaryMetric.value}`,
        `summary normalized=${summaryValue.toFixed(2)} (${describeMetricNormalization(summaryMetric)})`,
        `asset sum normalized=${assetSum.toFixed(2)}`,
        `asset sheets=${compatibleAssetMetrics.slice(0, 8).map((metric) => metric.sheet).join(", ")}`,
        `delta=${(deltaPct * 100).toFixed(1)}%`,
      ],
    });
  }

  return flags.slice(0, 8);
}

function pickBestMetricPerSheet(
  metrics: Array<FinancialAuditMetric & { score: number; dedupeKey: string }>
): Array<FinancialAuditMetric & { score: number; dedupeKey: string }> {
  const bestBySheet = new Map<string, FinancialAuditMetric & { score: number; dedupeKey: string }>();
  for (const metric of metrics) {
    const existing = bestBySheet.get(metric.sheet);
    if (!existing || metric.score > existing.score) {
      bestBySheet.set(metric.sheet, metric);
    }
  }
  return Array.from(bestBySheet.values());
}

function findBestSummaryMetric(
  metrics: Array<FinancialAuditMetric & { score: number; dedupeKey: string }>,
  patterns: RegExp[],
  familyKey: string
): (FinancialAuditMetric & { score: number; dedupeKey: string }) | undefined {
  const candidates = metrics.filter((metric) =>
    (metric.scope === "portfolio" || metric.scope === "lbo" || metric.scope === "summary") &&
    patterns.some((pattern) => pattern.test(metric.label)) &&
    isSummaryMetricCandidate(metric, familyKey)
  );
  candidates.sort((left, right) => right.score - left.score);
  return candidates[0];
}

function extractNumericToken(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const negativeByParentheses = /^\(.*\)$/.test(trimmed);
  const match = trimmed.match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!match) return null;

  const token = match[0];
  if (!token) return null;

  if (negativeByParentheses && !token.startsWith("-")) {
    return `-${token}`;
  }
  return token;
}

function inferMetricNormalization(params: {
  sheetName: string;
  sheetRole: string | undefined;
  headers: string[] | undefined;
  data: string[][];
  rowIndex: number;
  label: string;
  value: string;
  category: FinancialAuditMetric["category"];
  sheetNormalizationHints: string;
}): Pick<
  FinancialAuditMetric,
  "unitCategory" | "valueScale" | "scope" | "basis" | "normalizedValue" | "normalizationEvidence"
> {
  const currentRowContext = normalizeMetricContext(
    params.data[params.rowIndex]
      ?.map((cell) => String(cell ?? "").trim())
      .filter(Boolean)
      .join(" ") ?? ""
  );
  const rowNeighborhoodContext = normalizeMetricContext(buildRowContext(params.data, params.rowIndex, 1));
  const headerContext = normalizeMetricContext((params.headers ?? []).join(" "));
  const sheetContext = normalizeMetricContext(params.sheetNormalizationHints);
  const labelContext = normalizeMetricContext(params.label);
  const valueContext = normalizeMetricContext(params.value);
  const preciseContext = `${labelContext} ${valueContext} ${currentRowContext} ${headerContext}`.trim();
  const combinedContext = `${preciseContext} ${rowNeighborhoodContext} ${sheetContext} ${normalizeMetricContext(params.sheetName)}`.trim();

  const unitCategory = inferMetricUnitCategory(params.category, preciseContext, combinedContext);
  const valueScale = inferMetricScale(unitCategory, preciseContext, combinedContext);
  const scope = inferMetricScope(params.sheetName, params.sheetRole, labelContext);
  const basis = inferMetricBasis(preciseContext);
  const numericValue = parseNumericValue(params.value);
  const normalizedValue = numericValue == null ? null : applyScaleToNumericValue(numericValue, valueScale);

  return {
    unitCategory,
    valueScale,
    scope,
    basis,
    normalizedValue,
    normalizationEvidence: [
      `unit=${unitCategory}`,
      `scale=${valueScale}`,
      `scope=${scope}`,
      `basis=${basis}`,
    ],
  };
}

function buildRowContext(data: string[][], rowIndex: number, radius = 2): string {
  const start = Math.max(0, rowIndex - radius);
  const end = Math.min(data.length, rowIndex + radius + 1);
  return data
    .slice(start, end)
    .flat()
    .map((cell) => String(cell ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

function collectSheetNormalizationHints(data: string[][]): string {
  return data
    .slice(0, 36)
    .flat()
    .map((cell) => String(cell ?? "").trim())
    .filter((cell) => /(%|nok|usd|eur|gbp|psm|sqm|sq m|m2|sqft|'\s*000|\bmnok\b|\bnok m\b|million|thousand|basis point|bps|bp)/i.test(cell))
    .join(" ");
}

function normalizeMetricContext(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function inferMetricUnitCategory(
  category: FinancialAuditMetric["category"],
  localContext: string,
  combinedContext: string
): MetricUnitCategory {
  if (/\b(moic|multiple)\b|(?:^|[^a-z])\d+(?:\.\d+)?x(?:$|[^a-z])/i.test(localContext)) {
    return "multiple";
  }
  if (/\b(nok|usd|eur|gbp)\s*\/\s*(sqm|sq m|m2|sqft)\b|\bpsm\b|\bper sqm\b|\bnok psm\b/.test(combinedContext)) {
    return "density";
  }
  if (/\b(sqm|sq m|m2|sqft|nla|mla|cla)\b/.test(combinedContext)) {
    return "area";
  }
  if (/%/.test(localContext) || /\b(occupancy|yield|yoc|niy|irr|ltv|ltc|margin|cagr|fill rate|interest rate)\b/.test(localContext)) {
    return "percent";
  }
  if (/\b(store|unit|tenant|customer|location|asset count|site count)\b/.test(localContext)) {
    return "count";
  }
  if (
    category === "revenue" ||
    category === "profitability" ||
    category === "leverage" ||
    category === "valuation" ||
    /\b(revenue|sales|rent income|ebitda|noi|debt|loan|facility|equity|purchase price|price|capex|cost|value|profit|gav|aic)\b/.test(localContext) ||
    /\b(nok|usd|eur|gbp)\b|[€$£]/.test(combinedContext)
  ) {
    return "currency";
  }
  return "unknown";
}

function inferMetricScale(
  unitCategory: MetricUnitCategory,
  localContext: string,
  combinedContext: string
): MetricScale {
  if (unitCategory === "percent" || /%/.test(localContext)) return "percent";
  if (/\b(bps|bp|basis point|basis points)\b/.test(combinedContext)) return "basis_points";
  if (/\b(knok|kusd|keur|kgbp)\b|\b(nok|usd|eur|gbp)\s*'000\b|\b(nok|usd|eur|gbp)\s*000\b|\bthousand\b/.test(combinedContext)) {
    return "thousand";
  }
  if (/\b(mnok|musd|meur|mgbp)\b|\b(nok|usd|eur|gbp)\s*m\b|\bmillion\b/.test(combinedContext)) {
    return "million";
  }
  if (/\b(bnok|busd|beur|bgbp)\b|\b(nok|usd|eur|gbp)\s*bn\b|\bbillion\b/.test(combinedContext)) {
    return "billion";
  }
  return "unit";
}

function inferMetricScope(sheetName: string, sheetRole: string | undefined, localContext: string): MetricScope {
  const normalizedSheet = sheetName.toLowerCase();

  if (/\b(cap stack|uses & sources|debt package|equity bridge)\b/.test(localContext)) return "lbo";
  if (/\bportfolio\b/.test(localContext) || /\b(group|overall|consolidated)\b/.test(localContext)) {
    return "portfolio";
  }
  if (
    /^[a-z0-9_-]{2,12}$/i.test(sheetName.trim()) &&
    !/\b(input|assum|output|summary|budget|legal|history|historic|memo|pptx)\b/.test(normalizedSheet)
  ) {
    return "asset";
  }
  if (
    sheetRole === "OUTPUTS" &&
    (
      /\b(total|overall|headline|entry|exit|irr|moic|yield|debt|revenue|ebitda)\b/.test(localContext) &&
      !/\b(asset|store|location|site|unit)\b/.test(localContext)
    )
  ) {
    return "summary";
  }
  if (/\b(asset|store|location|site|unit|tenant)\b/.test(localContext)) return "asset";
  if (/\blbo\b/.test(normalizedSheet)) return "lbo";
  return "unknown";
}

function inferMetricBasis(localContext: string): MetricBasis {
  if (/\b(entry|acquisition|purchase price|all-in-cost|aic|cap stack|uses & sources|seed portfolio)\b/.test(localContext)) {
    return "entry";
  }
  if (/\b(exit|sale|disposal)\b/.test(localContext)) return "exit";
  if (/\b(ltm|trailing|annualised|annualized)\b/.test(localContext)) return "ltm";
  if (/\b(fwd|forward|projection|projected|business plan|forecast|budget)\b/.test(localContext)) return "forward";
  if (/\b(actual|historical|historic)\b/.test(localContext)) return "historical";
  return "unknown";
}

function applyScaleToNumericValue(value: number, scale: MetricScale): number {
  switch (scale) {
    case "thousand":
      return value * 1_000;
    case "million":
      return value * 1_000_000;
    case "billion":
      return value * 1_000_000_000;
    default:
      return value;
  }
}

function isSummaryMetricCandidate(
  metric: FinancialAuditMetric & { score: number; dedupeKey: string },
  familyKey: string
): boolean {
  if (isCurrencyReconciliationFamily(familyKey)) {
    return metric.unitCategory !== "percent" &&
      metric.unitCategory !== "multiple" &&
      metric.unitCategory !== "area" &&
      metric.unitCategory !== "density" &&
      metric.unitCategory !== "count";
  }
  return true;
}

function isComparableForReconciliation(
  assetMetric: FinancialAuditMetric & { score: number; dedupeKey: string },
  summaryMetric: FinancialAuditMetric & { score: number; dedupeKey: string },
  familyKey: string
): boolean {
  if (!areMetricUnitsComparable(assetMetric.unitCategory, summaryMetric.unitCategory, familyKey)) return false;
  if (!areMetricScopesComparable(assetMetric.scope, summaryMetric.scope)) return false;
  if (!areMetricBasesCompatible(assetMetric.basis, summaryMetric.basis)) return false;
  return getComparableMetricValue(assetMetric) != null && getComparableMetricValue(summaryMetric) != null;
}

function areMetricUnitsComparable(
  assetUnit: MetricUnitCategory | undefined,
  summaryUnit: MetricUnitCategory | undefined,
  familyKey: string
): boolean {
  const asset = assetUnit ?? "unknown";
  const summary = summaryUnit ?? "unknown";
  if (isCurrencyReconciliationFamily(familyKey)) {
    const disallowed: MetricUnitCategory[] = ["percent", "multiple", "area", "density", "count"];
    return !disallowed.includes(asset) && !disallowed.includes(summary);
  }
  return asset === summary || asset === "unknown" || summary === "unknown";
}

function areMetricScopesComparable(
  assetScope: MetricScope | undefined,
  summaryScope: MetricScope | undefined
): boolean {
  const asset = assetScope ?? "unknown";
  const summary = summaryScope ?? "unknown";
  if (!(asset === "asset" || asset === "unknown")) return false;
  return summary === "portfolio" || summary === "lbo" || summary === "summary" || summary === "unknown";
}

function areMetricBasesCompatible(
  assetBasis: MetricBasis | undefined,
  summaryBasis: MetricBasis | undefined
): boolean {
  const asset = assetBasis ?? "unknown";
  const summary = summaryBasis ?? "unknown";
  return asset === "unknown" || summary === "unknown" || asset === summary;
}

function getComparableMetricValue(metric: FinancialAuditMetric): number | null {
  return metric.normalizedValue ?? parseNumericValue(metric.value);
}

function describeMetricNormalization(metric: FinancialAuditMetric): string {
  return [
    `unit=${metric.unitCategory ?? "unknown"}`,
    `scale=${metric.valueScale ?? "unit"}`,
    `scope=${metric.scope ?? "unknown"}`,
    `basis=${metric.basis ?? "unknown"}`,
  ].join(", ");
}

function isCurrencyReconciliationFamily(familyKey: string): boolean {
  return familyKey === "revenue" || familyKey === "ebitda" || familyKey === "debt";
}
