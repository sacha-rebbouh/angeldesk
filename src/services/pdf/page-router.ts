export type PageExtractionTier = "native_only" | "standard_ocr" | "high_fidelity" | "supreme";

export interface PageSignalFlags {
  hasTables: boolean;
  hasCharts: boolean;
  hasFinancialKeywords: boolean;
  hasTeamKeywords: boolean;
  hasMarketKeywords: boolean;
}

export interface VisualRiskAssessment {
  score: number;
  reasons: string[];
}

export interface VisualExtractionPlanPage {
  pageIndex: number;
  pageNumber: number;
  tier: PageExtractionTier;
  visualRiskScore: number;
  visualRiskReasons: string[];
}

export function detectPageSignals(text: string, options: { isEdgePage?: boolean } = {}): PageSignalFlags {
  const lower = text.toLowerCase();
  const numberMatches = text.match(/\d+([.,]\d+)?\s?(%|€|eur|k€|m€|m|k|x)?/gi) ?? [];
  const lines = text.split(/\n+/).map((line) => line.trim()).filter((line) => line.length > 0);
  const lineCount = lines.length;
  const timeAxisMatches =
    text.match(/\b(?:20\d{2}|q[1-4]|fy(?:\s|-)?\d{2,4}|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|janv|fev|fév|mars|avr|mai|juin|juil|aout|août)\b/gi) ?? [];
  const percentageMatches = text.match(/\d+([.,]\d+)?\s?%/g) ?? [];
  const denseMetricLines = lines.filter((line) => {
    const inlineNumbers = line.match(/\d+([.,]\d+)?/g) ?? [];
    const hasTimeAxis = /\b(?:20\d{2}|q[1-4]|fy(?:\s|-)?\d{2,4}|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/i.test(line);
    return inlineNumbers.length >= 2 && (hasTimeAxis || /%/.test(line));
  }).length;
  const delimiterLines = lines.filter((line) => /\|/.test(line) || /\t/.test(line)).length;
  const labelValueLines = lines.filter((line) => {
    const inlineNumbers = line.match(/\d+([.,]\d+)?/g) ?? [];
    return inlineNumbers.length >= 1 && /[A-Za-z]{3,}/.test(line);
  }).length;
  const alignedMetricLines = lines.filter((line) => {
    const inlineNumbers = line.match(/\d+([.,]\d+)?/g) ?? [];
    const separatorCount = (line.match(/\s{2,}/g) ?? []).length;
    return inlineNumbers.length >= 2 && separatorCount >= 1;
  }).length;
  const chartKeywordMatch = /\b(chart|graph|bar|line|scatter|axis|legend|trend|waterfall|donut|pie|histogram|heatmap)\b/i.test(text);
  const diagramKeywordMatch = /\b(diagram|flow|workflow|roadmap|timeline|funnel|sequence|step)\b/i.test(text);
  const tableKeywordMatch = /\b(table|sources?|uses?|bridge|breakdown|schedule|by month|by year)\b/i.test(text);
  const hasTables =
    delimiterLines > 0 ||
    (tableKeywordMatch && labelValueLines >= 2 && numberMatches.length >= 8) ||
    (!options.isEdgePage && numberMatches.length >= 16 && (alignedMetricLines >= 2 || denseMetricLines >= 2));
  const chartSignalScore =
    (chartKeywordMatch ? 2 : 0) +
    (diagramKeywordMatch ? 1 : 0) +
    (timeAxisMatches.length >= 3 ? 1 : 0) +
    (percentageMatches.length >= 2 ? 1 : 0) +
    (denseMetricLines >= 1 ? 1 : 0) +
    (numberMatches.length >= 8 && lineCount >= 4 ? 1 : 0) +
    (alignedMetricLines >= 2 ? 1 : 0);
  const hasCharts =
    chartKeywordMatch ||
    (!hasTables && chartSignalScore >= 2) ||
    (hasTables && chartSignalScore >= 3);
  const hasFinancialKeywords = /\b(arr|mrr|revenue|ca|chiffre d'affaires|burn|runway|ebitda|gross margin|marge|ltv|cac|churn|nrr|valuation|valorisation|cap table|dilution|funding|levée|levee|pré-money|pre-money|post-money)\b/i.test(lower);
  const hasTeamKeywords = /\b(team|équipe|equipe|founder|fondateur|ceo|cto|coo|cfo|advisor|conseiller|linkedin)\b/i.test(lower);
  const hasMarketKeywords = /\b(tam|sam|som|market|marché|marche|cagr|segmentation|concurrence|competition|competitor)\b/i.test(lower);

  return { hasTables, hasCharts, hasFinancialKeywords, hasTeamKeywords, hasMarketKeywords };
}

export function scoreVisualExtractionRisk(text: string, flags: PageSignalFlags): VisualRiskAssessment {
  let score = 0;
  const reasons: string[] = [];
  const numberMatches = text.match(/\d+([.,]\d+)?\s?(%|€|eur|k€|m€|m|k|x)?/gi) ?? [];
  const percentMatches = text.match(/\d+([.,]\d+)?\s?%/g) ?? [];
  const timeAxisMatches =
    text.match(/\b(?:20\d{2}|q[1-4]|fy(?:\s|-)?\d{2,4}|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/gi) ?? [];
  const structuralMarkers = text.match(/\b(table|chart|graph|figure|diagram|legend|axis|sources?|uses?|bridge|schedule|timeline|workflow|funnel)\b/gi) ?? [];
  const alignedMetricLines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const numbers = line.match(/\d+([.,]\d+)?/g) ?? [];
      const separators = (line.match(/\s{2,}/g) ?? []).length;
      return numbers.length >= 2 && separators >= 1;
    }).length;

  if (flags.hasTables) {
    score += 25;
    reasons.push("table-like numeric structure");
  }
  if (flags.hasCharts) {
    score += 25;
    reasons.push("chart or diagram language");
  }
  if (flags.hasFinancialKeywords || flags.hasMarketKeywords) {
    score += 20;
    reasons.push("investment-critical finance/market content");
  }
  if (numberMatches.length >= 25) {
    score += 30;
    reasons.push("very high numeric density");
  } else if (numberMatches.length >= 10) {
    score += 18;
    reasons.push("high numeric density");
  }
  if (percentMatches.length >= 8) {
    score += 20;
    reasons.push("many percentages");
  }
  if (timeAxisMatches.length >= 4) {
    score += 14;
    reasons.push("strong period-axis evidence");
  }
  if (alignedMetricLines >= 2) {
    score += 14;
    reasons.push("aligned metric rows");
  }
  if (structuralMarkers.length >= 5) {
    score += 12;
    reasons.push("multiple structural visual markers");
  }

  return { score: Math.min(100, score), reasons };
}

export function chooseExtractionTier(
  nativeText: string,
  flags: PageSignalFlags,
  visualRiskScore: number
): PageExtractionTier {
  if (nativeText.length < 80) return "standard_ocr";
  if (visualRiskScore >= 85) return "supreme";
  if (visualRiskScore >= 55) return "high_fidelity";
  if (nativeText.length < 300 || flags.hasTables || flags.hasCharts) return "standard_ocr";
  return "native_only";
}

export function getVisualExtractionPlan(pageTexts: string[]): VisualExtractionPlanPage[] {
  const pageCount = pageTexts.length;
  return pageTexts.map((nativeText, index) => {
    const flags = detectPageSignals(nativeText, {
      isEdgePage: index === 0 || index === pageCount - 1,
    });
    const risk = scoreVisualExtractionRisk(nativeText, flags);
    return {
      pageIndex: index,
      pageNumber: index + 1,
      tier: chooseExtractionTier(nativeText, flags, risk.score),
      visualRiskScore: risk.score,
      visualRiskReasons: risk.reasons,
    };
  });
}

export function getHighFidelityVisualPageIndices(pageTexts: string[]): number[] {
  return getVisualExtractionPlan(pageTexts)
    .filter((page) => page.tier === "high_fidelity" || page.tier === "supreme")
    .map((page) => page.pageIndex);
}
