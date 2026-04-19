import type { DocumentPageArtifact } from "./ocr-service";

export type PageClass =
  | "cover_page"
  | "table_of_contents"
  | "section_divider"
  | "closing_contact"
  | "branding_transition"
  | "decorative"
  | "narrative"
  | "structured_table"
  | "chart_kpi"
  | "waterfall_summary"
  | "segmented_infographic"
  | "asset_tear_sheet"
  | "mixed_visual_analytics"
  | "org_diagram"
  | "process_diagram"
  | "market_map"
  | "transaction_terms"
  | "legal_dense";

export type StructureDependency = "low" | "medium" | "high" | "critical";
export type SemanticSufficiency = "sufficient" | "partial" | "insufficient";
export type LabelValueIntegrity = "strong" | "mixed" | "weak";

export interface ExtractionSemanticAssessment {
  pageClass: PageClass;
  classConfidence: "high" | "medium" | "low";
  classReasons: string[];
  structureDependency: StructureDependency;
  semanticSufficiency: SemanticSufficiency;
  labelValueIntegrity: LabelValueIntegrity;
  visualNoiseScore: number;
  analyticalValueScore: number;
  requiresStructuredPreservation: boolean;
  shouldBlockIfStructureMissing: boolean;
  canDegradeToWarning: boolean;
  minimumEvidence: string[];
  rationale: string[];
}

interface SemanticInput {
  pageNumber: number;
  text: string;
  nativeText?: string;
  charCount: number;
  wordCount: number;
  hasTables: boolean;
  hasCharts: boolean;
  hasFinancialKeywords: boolean;
  hasTeamKeywords: boolean;
  hasMarketKeywords: boolean;
  artifact?: DocumentPageArtifact | null;
  isEdgePage?: boolean;
}

const TRANSACTION_TERMS_RE =
  /\b(pre[- ]?money|post[- ]?money|liquidation preference|anti[- ]?dilution|discount|warrant|board seat|board observer|pro rata|cap table|sources? and uses?|uses? of proceeds|purchase price|enterprise value|equity value|rollover|round terms?|dilution)\b/i;
const LEGAL_DENSE_RE =
  /\b(agreement|clause|covenant|warranties|indemnif|governing law|consent|undertaking|term sheet|subscription|shareholders?|liquidation)\b/i;
const ORG_RE =
  /\b(ceo|cto|cfo|coo|cro|vp|advisor|founder|fondateur|managing director|head of|reports? to|leadership|org chart|team)\b/i;
const PROCESS_RE =
  /\b(step|phase|milestone|timeline|roadmap|workflow|process|playbook|funnel|journey|sequence|integration)\b/i;
const MARKET_MAP_RE =
  /\b(tam|sam|som|market map|competitive landscape|landscape|quadrant|segment|segmentation|benchmark|competitor|competition)\b/i;
const TABLE_OF_CONTENTS_RE = /\btable\s*of\s*contents\b/i;
const CONFIDENTIAL_RE = /\b(confidential|private and confidential|strictly private|do not distribute)\b/i;
const CONTACT_SIGNAL_RE =
  /(?:\bwww\.|\bhttps?:\/\/|@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\+\d[\d\s().-]{6,}|\b(?:street|st\.|avenue|ave\.|road|rd\.|boulevard|blvd\.|place|plaza|suite|floor)\b)/i;
const DOCUMENT_TITLE_RE =
  /\b(presentation|memorandum|memorandum|memo|strategy|overview|appendix|appendices|investment|teaser|information)\b/i;
const GENERIC_SECTION_HEADING_RE =
  /\b(executive summary|summary|opportunity|market overview|market commentary|financials?|business plan|due diligence|tear sheets?|appendix|conclusion|overview|next steps|introduction|agenda)\b/i;
const ASSET_GEO_RE =
  /\b(population|household income|average income|drive time|minutes? drive|radius|catchment|submarket|micro[- ]?location|demograph)\b/i;
const ASSET_OPS_RE =
  /\b(freehold|leasehold|occup(?:ied|ancy)?|vacan(?:t|cy)|rent(?:\s*psm|\s*per)?|price per|historical ebitda|historical revenue|nla\b|sqm\b|m2\b|square feet|sq\.?\s?ft)\b/i;
const COMPARABLE_SET_RE =
  /\b(competitors?|peer set|peer avg|peer average|market avg\.?|market average|benchmark|comparable|comps)\b/i;
const BRIDGE_STRUCTURE_RE =
  /\b(waterfall|bridge|walk|roll[- ]?forward|reconciliation)\b/i;
const SEGMENTATION_STRUCTURE_RE =
  /\b(segment(?:ation)?|customer mix|service mix|product mix|adoption|penetration|attach rate|category mix|share of wallet)\b/i;
const COMPANY_COMPARISON_RE =
  /\b(company\s+\d+|sales|ebitda|buyer|target|tev|mean|median|valuation|multiple|under exclusivity)\b/i;

function collapseSpacedHeadingTokens(text: string): string {
  return text.replace(/\b(?:[A-Za-z]\s+){3,}[A-Za-z]\b/g, (match) =>
    match.replace(/\s+/g, "")
  );
}

export function assessExtractionSemantics(input: SemanticInput): ExtractionSemanticAssessment {
  const primaryText = (input.nativeText?.trim() ? input.nativeText : input.text).trim();
  const normalized = primaryText.toLowerCase();
  const collapsedNormalized = collapseSpacedHeadingTokens(primaryText).toLowerCase();
  const numberMatches = primaryText.match(/-?\d+(?:[.,]\d+)?\s?(?:%|€|eur|k€|m€|m|k|x|bps|\$)?/gi) ?? [];
  const yearMatches = primaryText.match(/\b20\d{2}\b/g) ?? [];
  const monthMatches = primaryText.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|janvier|fevrier|février|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|decembre|décembre)\b/gi) ?? [];
  const lines = primaryText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const bulletLines = lines.filter((line) => /^[-•o]/.test(line)).length;
  const tableLines = lines.filter((line) => /\|/.test(line)).length;
  const titleLikeLines = lines.filter((line) => isTitleLikeLine(line)).length;
  const shortHeadingLines = lines.filter((line) => (
    line.length >= 4 &&
    line.length <= 42 &&
    !/^[-•o]/.test(line) &&
    /^[A-Za-z0-9&'’()\-–?/:,. ]+$/.test(line) &&
    !/\b(private and confidential|source:)\b/i.test(line)
  )).length;
  const labelValuePairs = countLabelValuePairs(primaryText);
  const isolatedTokenRatio = computeIsolatedTokenRatio(primaryText);
  const garbled = isolatedTokenRatio > 0.34 || /(?:\b[A-Za-z]\b[\s-]*){8,}/.test(primaryText);
  const contactSignals = countMatches(primaryText, CONTACT_SIGNAL_RE);
  const confidentialitySignals = countMatches(primaryText, CONFIDENTIAL_RE);
  const hasAssetGeoSignals = ASSET_GEO_RE.test(primaryText);
  const hasAssetOpsSignals = ASSET_OPS_RE.test(primaryText);
  const hasAssetComparableSignals = COMPARABLE_SET_RE.test(primaryText);
  const sectionHeadingSignals = countMatches(collapsedNormalized, GENERIC_SECTION_HEADING_RE);
  const artifact = input.artifact ?? null;
  const artifactTables = artifact?.tables?.length ?? 0;
  const artifactCharts = artifact?.charts?.length ?? 0;
  const numericClaims = artifact?.numericClaims?.length ?? 0;
  const unreadableHigh = artifact?.unreadableRegions?.some((region) => region.severity === "high") ?? false;
  const brandingHeavy =
    confidentialitySignals > 0 ||
    lines.filter((line) => line.length <= 48 && /[A-Z][A-Z0-9&'’ \-]{4,}/.test(line)).length >= 2;
  const repeatedFooterBranding =
    brandingHeavy || confidentialitySignals > 0 || contactSignals > 0;
  const hasStructuredTableArtifact = artifact?.tables?.some((table) => (
    Boolean(table.markdown?.trim()) || Boolean(table.rows && table.rows.length > 0)
  )) ?? false;
  const hasStructuredChartArtifact = artifact?.charts?.some((chart) => (
    Boolean(chart.values && chart.values.length > 0)
  )) ?? false;
  const hasStructuredArtifact = hasStructuredTableArtifact || hasStructuredChartArtifact;

  const classReasons: string[] = [];
  let pageClass: PageClass = "narrative";
  let classConfidence: "high" | "medium" | "low" = "medium";
  const explicitSectionDividerHeading =
    GENERIC_SECTION_HEADING_RE.test(normalized) || GENERIC_SECTION_HEADING_RE.test(collapsedNormalized);
  const explicitTableOfContents =
    TABLE_OF_CONTENTS_RE.test(normalized) || TABLE_OF_CONTENTS_RE.test(collapsedNormalized);
  const explicitClosingContact =
    contactSignals > 0 && input.isEdgePage;
  const looksLikeLowInfoTitlePage =
    input.wordCount <= 160 &&
    lines.length <= 18 &&
    (titleLikeLines >= 1 || shortHeadingLines >= 1) &&
    labelValuePairs <= 2 &&
    yearMatches.length <= 1 &&
    (brandingHeavy || DOCUMENT_TITLE_RE.test(normalized));
  const looksLikeBrandingTransition =
    repeatedFooterBranding &&
    input.wordCount <= 120 &&
    titleLikeLines >= 1 &&
    titleLikeLines <= 3 &&
    labelValuePairs <= 1 &&
    numberMatches.length <= 4;
  const multiSectionNarrative =
    input.charCount >= 500 &&
    bulletLines >= 4 &&
    shortHeadingLines >= 2 &&
    !TRANSACTION_TERMS_RE.test(normalized) &&
    !BRIDGE_STRUCTURE_RE.test(normalized);
  const comparativeBulletNarrative =
    !hasStructuredArtifact &&
    labelValuePairs >= 3 &&
    shortHeadingLines >= 2 &&
    monthMatches.length === 0 &&
    yearMatches.length <= 1 &&
    numberMatches.length <= 12 &&
    !SEGMENTATION_STRUCTURE_RE.test(normalized) &&
    !COMPANY_COMPARISON_RE.test(normalized) &&
    !BRIDGE_STRUCTURE_RE.test(normalized);
  const processHeavyVisualNarrative =
    PROCESS_RE.test(normalized) &&
    !hasStructuredArtifact &&
    monthMatches.length === 0 &&
    yearMatches.length <= 1 &&
    numberMatches.length <= 12 &&
    shortHeadingLines >= 2 &&
    !COMPANY_COMPARISON_RE.test(normalized);
  const segmentedInfographic =
    !hasStructuredArtifact &&
    !garbled &&
    monthMatches.length === 0 &&
    yearMatches.length <= 1 &&
    numberMatches.length >= 3 &&
    numberMatches.length <= 16 &&
    shortHeadingLines >= 3 &&
    SEGMENTATION_STRUCTURE_RE.test(normalized) &&
    /\b(customer|customers|service|services|solution|solutions|segment|category|mix)\b/i.test(normalized) &&
    !COMPANY_COMPARISON_RE.test(normalized) &&
    !BRIDGE_STRUCTURE_RE.test(normalized) &&
    !TRANSACTION_TERMS_RE.test(normalized);
  const waterfallSummary =
    BRIDGE_STRUCTURE_RE.test(normalized) &&
    numberMatches.length >= 8 &&
    bulletLines >= 2 &&
    /\b(revenue|budget|target|forecast|variance|bridge|reconciliation|pipeline|bookings|arr)\b/i.test(normalized);

  const looksLikeSectionDivider =
    (
      explicitSectionDividerHeading &&
      input.wordCount <= 180 &&
      lines.length <= 20 &&
      labelValuePairs <= 2 &&
      numberMatches.length <= 8
    ) ||
    (
      !hasStructuredArtifact &&
      input.wordCount <= 120 &&
      lines.length <= 12 &&
      (
        explicitSectionDividerHeading ||
        (
          lines.length <= 7 &&
          titleLikeLines >= 1 &&
          labelValuePairs <= 1 &&
          numberMatches.length <= 3 &&
          !input.hasCharts &&
          !input.hasFinancialKeywords &&
          !input.hasMarketKeywords &&
          !TRANSACTION_TERMS_RE.test(normalized)
        )
      )
    );

  if (
    input.isEdgePage &&
    (
      (
        input.charCount < 180 &&
        !input.hasTables &&
        !input.hasCharts &&
        !input.hasFinancialKeywords &&
        !input.hasMarketKeywords &&
        (brandingHeavy || DOCUMENT_TITLE_RE.test(normalized))
      ) ||
      looksLikeLowInfoTitlePage
    )
  ) {
    pageClass = explicitClosingContact ? "closing_contact" : "cover_page";
    classConfidence = "high";
    classReasons.push("edge-page low-information cover/contact page");
  } else if (explicitTableOfContents && input.wordCount <= 220) {
    pageClass = "table_of_contents";
    classConfidence = "high";
    classReasons.push("table of contents structure");
  } else if (looksLikeBrandingTransition && explicitSectionDividerHeading) {
    pageClass = "branding_transition";
    classConfidence = "high";
    classReasons.push("branding-heavy transition page");
  } else if (looksLikeSectionDivider) {
    pageClass = "section_divider";
    classConfidence = explicitSectionDividerHeading ? "high" : "medium";
    classReasons.push("section divider / low-information transition page");
  } else if (multiSectionNarrative && !hasStructuredArtifact) {
    pageClass = "narrative";
    classConfidence = "medium";
    classReasons.push("multi-section narrative page with dense bullets/headings");
  } else if (comparativeBulletNarrative) {
    pageClass = "narrative";
    classConfidence = "medium";
    classReasons.push("comparative bullet narrative retains decision semantics in text");
  } else if (TRANSACTION_TERMS_RE.test(normalized)) {
    pageClass = "transaction_terms";
    classConfidence = "high";
    classReasons.push("deal/terms vocabulary");
  } else if (waterfallSummary) {
    pageClass = "waterfall_summary";
    classConfidence = "high";
    classReasons.push("waterfall summary with explicit bridge values and commentary");
  } else if (segmentedInfographic) {
    pageClass = "segmented_infographic";
    classConfidence = "high";
    classReasons.push("segmented infographic with explicit category shares and summaries");
  } else if (
    input.hasTables &&
    input.hasCharts &&
    numberMatches.length >= 12 &&
    hasAssetGeoSignals &&
    hasAssetOpsSignals &&
    hasAssetComparableSignals
  ) {
    pageClass = "asset_tear_sheet";
    classConfidence = "high";
    classReasons.push("local asset tear sheet with geo, operating, and comparable signals");
  } else if (processHeavyVisualNarrative) {
    pageClass = "process_diagram";
    classConfidence = "high";
    classReasons.push("process/playbook page with text-preserved explanatory steps");
  } else if (input.hasTables && input.hasCharts) {
    pageClass = "mixed_visual_analytics";
    classConfidence = "high";
    classReasons.push("table and chart signals on same page");
  } else if (input.hasTables && (input.hasFinancialKeywords || numberMatches.length >= 12 || tableLines >= 2)) {
    pageClass = "structured_table";
    classConfidence = "high";
    classReasons.push("table-like structure with dense numeric evidence");
  } else if (input.hasCharts && (input.hasFinancialKeywords || input.hasMarketKeywords || numberMatches.length >= 10)) {
    pageClass = input.hasMarketKeywords ? "market_map" : "chart_kpi";
    classConfidence = "high";
    classReasons.push("chart-like page with numeric/market content");
  } else if (ORG_RE.test(normalized) && (input.hasTeamKeywords || /platform|tuck-?in|reports? to/i.test(primaryText))) {
    pageClass = "org_diagram";
    classConfidence = "medium";
    classReasons.push("organization/team diagram vocabulary");
  } else if (PROCESS_RE.test(normalized)) {
    pageClass = "process_diagram";
    classConfidence = "medium";
    classReasons.push("process / roadmap vocabulary");
  } else if (MARKET_MAP_RE.test(normalized) || (input.hasMarketKeywords && input.hasCharts)) {
    pageClass = "market_map";
    classConfidence = "medium";
    classReasons.push("market mapping vocabulary");
  } else if (LEGAL_DENSE_RE.test(normalized) && input.charCount >= 1200 && !input.hasTables && !input.hasCharts) {
    pageClass = "legal_dense";
    classConfidence = "medium";
    classReasons.push("legal / terms dense text");
  } else if (input.charCount >= 500 || bulletLines >= 4) {
    pageClass = "narrative";
    classConfidence = "medium";
    classReasons.push("text-led narrative page");
  } else if (input.charCount < 180 && !input.hasFinancialKeywords && !input.hasMarketKeywords) {
    pageClass = "decorative";
    classConfidence = "medium";
    classReasons.push("low-density non-analytical page");
  }

  const structureDependency = inferStructureDependency(pageClass);
  const requiresStructuredPreservation = structureDependency === "high" || structureDependency === "critical";
  const visualNoiseScore = inferVisualNoiseScore({
    pageClass,
    hasStructuredArtifact,
    hasTables: input.hasTables,
    hasCharts: input.hasCharts,
    brandingHeavy: repeatedFooterBranding,
    garbled,
    isolatedTokenRatio,
    unreadableHigh,
    shortHeadingLines,
  });
  const analyticalValueScore = inferAnalyticalValueScore({
    pageClass,
    charCount: input.charCount,
    labelValuePairs,
    numberMatches: numberMatches.length,
    bulletLines,
    yearMatches: yearMatches.length,
    hasStructuredArtifact,
  });
  const shouldBlockIfStructureMissing =
    analyticalValueScore >= 55 &&
    (
      pageClass === "structured_table" ||
      pageClass === "asset_tear_sheet" ||
      pageClass === "transaction_terms" ||
      pageClass === "mixed_visual_analytics" ||
      pageClass === "chart_kpi" ||
      pageClass === "market_map"
    );

  const labelValueIntegrity: LabelValueIntegrity = (() => {
    if (garbled) return "weak";
    if (
      hasStructuredArtifact ||
      labelValuePairs >= 5 ||
      (numberMatches.length >= 10 && (yearMatches.length >= 2 || monthMatches.length >= 3))
    ) {
      return "strong";
    }
    if (labelValuePairs >= 2 || numberMatches.length >= 5 || numericClaims >= 4) {
      return "mixed";
    }
    return "weak";
  })();

  const minimumEvidence = inferMinimumEvidence(pageClass);
  const rationale: string[] = [];

  if (hasStructuredArtifact) rationale.push("structured artifact reconstructed");
  if (numericClaims >= 4) rationale.push("multiple numeric claims captured");
  if (labelValuePairs >= 3) rationale.push("label/value relations detected in text");
  if (yearMatches.length >= 2 || monthMatches.length >= 3) rationale.push("period labels preserved");
  if (garbled) rationale.push("garbled token distribution detected");
  if (unreadableHigh) rationale.push("artifact reports high unreadable region");

  let semanticSufficiency: SemanticSufficiency = "partial";

  if (
    pageClass === "cover_page" ||
    pageClass === "table_of_contents" ||
    pageClass === "closing_contact" ||
    pageClass === "branding_transition" ||
    pageClass === "decorative"
  ) {
    semanticSufficiency = input.charCount >= 40 ? "sufficient" : "partial";
  } else if (pageClass === "section_divider") {
    semanticSufficiency = input.charCount >= 80 ? "sufficient" : "partial";
  } else if (pageClass === "narrative" || pageClass === "legal_dense") {
    semanticSufficiency =
      garbled ? "partial" : input.charCount >= 450 ? "sufficient" : input.charCount >= 180 ? "partial" : "insufficient";
  } else if (structureDependency === "critical") {
    if (
      hasStructuredArtifact &&
      input.charCount >= 320 &&
      labelValueIntegrity === "strong" &&
      !unreadableHigh
    ) {
      semanticSufficiency = "sufficient";
    } else if (
      (
        (hasStructuredArtifact && input.charCount >= 180 && labelValueIntegrity !== "weak") ||
        (labelValueIntegrity === "strong" && input.charCount >= 900)
      ) &&
      !garbled &&
      !unreadableHigh
    ) {
      semanticSufficiency = "partial";
      rationale.push("text is rich but structure remains decision-critical");
    } else {
      semanticSufficiency = "insufficient";
    }
    if (
      pageClass === "asset_tear_sheet" &&
      semanticSufficiency === "partial" &&
      hasAssetGeoSignals &&
      hasAssetOpsSignals &&
      hasAssetComparableSignals
    ) {
      rationale.push("tear sheet preserves geo, operating, and comparable evidence in text");
    }
  } else if (structureDependency === "high") {
    if (
      (hasStructuredArtifact || numericClaims >= 5) &&
      input.charCount >= 250 &&
      labelValueIntegrity === "strong" &&
      !unreadableHigh
    ) {
      semanticSufficiency = "sufficient";
    } else if (
      pageClass === "waterfall_summary" &&
      labelValueIntegrity !== "weak" &&
      input.charCount >= 500 &&
      bulletLines >= 2 &&
      numberMatches.length >= 8 &&
      !garbled
    ) {
      semanticSufficiency = "partial";
    } else if (
      pageClass === "segmented_infographic" &&
      labelValueIntegrity !== "weak" &&
      input.charCount >= 500 &&
      shortHeadingLines >= 3 &&
      numberMatches.length >= 3 &&
      !garbled
    ) {
      semanticSufficiency = "partial";
    } else if (
      labelValueIntegrity !== "weak" &&
      input.charCount >= 300 &&
      (yearMatches.length >= 2 || monthMatches.length >= 3 || numberMatches.length >= 10) &&
      !garbled
    ) {
      semanticSufficiency = "partial";
    } else {
      semanticSufficiency = "insufficient";
    }
  } else {
    if (labelValueIntegrity === "strong" || input.charCount >= 500) {
      semanticSufficiency = "sufficient";
    } else if (input.charCount >= 220 || numericClaims >= 3) {
      semanticSufficiency = "partial";
    } else {
      semanticSufficiency = "insufficient";
    }
  }

  const baseCanDegradeToWarning = (
    semanticSufficiency === "partial" &&
    !unreadableHigh &&
    !garbled &&
    labelValueIntegrity === "strong" &&
    (
      (structureDependency === "critical" &&
        input.charCount >= 1200 &&
        numberMatches.length >= 12 &&
        (yearMatches.length >= 2 || monthMatches.length >= 3 || labelValuePairs >= 6)) ||
      (structureDependency === "high" &&
        input.charCount >= 850 &&
        numberMatches.length >= 10 &&
        (yearMatches.length >= 2 || monthMatches.length >= 3 || labelValuePairs >= 5))
    )
  );
  const assetTearSheetCanDegrade =
    pageClass === "asset_tear_sheet" &&
    semanticSufficiency === "partial" &&
    !unreadableHigh &&
    !garbled &&
    labelValueIntegrity === "strong" &&
    input.charCount >= 900 &&
    yearMatches.length >= 2 &&
    hasAssetGeoSignals &&
    hasAssetOpsSignals &&
    hasAssetComparableSignals;
  const segmentedInfographicCanDegrade =
    pageClass === "segmented_infographic" &&
    semanticSufficiency === "partial" &&
    !unreadableHigh &&
    !garbled &&
    labelValueIntegrity !== "weak" &&
    input.charCount >= 900 &&
    shortHeadingLines >= 2 &&
    numberMatches.length >= 3;
  const waterfallSummaryCanDegrade =
    pageClass === "waterfall_summary" &&
    semanticSufficiency === "partial" &&
    !garbled &&
    labelValueIntegrity === "strong" &&
    input.charCount >= 700 &&
    bulletLines >= 2 &&
    numberMatches.length >= 8 &&
    (hasStructuredArtifact || labelValuePairs >= 5);
  const canDegradeToWarning =
    baseCanDegradeToWarning ||
    assetTearSheetCanDegrade ||
    segmentedInfographicCanDegrade ||
    waterfallSummaryCanDegrade;
  if (canDegradeToWarning) {
    rationale.push("text preserves enough decision semantics to allow warning-only review");
  }

  return {
    pageClass,
    classConfidence,
    classReasons,
    structureDependency,
    semanticSufficiency,
    labelValueIntegrity,
    visualNoiseScore,
    analyticalValueScore,
    requiresStructuredPreservation,
    shouldBlockIfStructureMissing,
    canDegradeToWarning,
    minimumEvidence,
    rationale,
  };
}

function inferStructureDependency(pageClass: PageClass): StructureDependency {
  switch (pageClass) {
    case "cover_page":
    case "table_of_contents":
    case "closing_contact":
    case "branding_transition":
    case "decorative":
    case "section_divider":
    case "narrative":
      return "low";
    case "legal_dense":
    case "process_diagram":
    case "org_diagram":
      return "medium";
    case "waterfall_summary":
    case "segmented_infographic":
    case "chart_kpi":
    case "market_map":
      return "high";
    case "asset_tear_sheet":
    case "structured_table":
    case "mixed_visual_analytics":
    case "transaction_terms":
      return "critical";
  }
}

function inferMinimumEvidence(pageClass: PageClass): string[] {
  switch (pageClass) {
    case "cover_page":
      return ["document title", "document context"];
    case "table_of_contents":
      return ["section labels"];
    case "closing_contact":
      return ["contact details"];
    case "branding_transition":
    case "decorative":
    case "section_divider":
      return ["visible text"];
    case "narrative":
      return ["titles", "bullets", "supporting metrics if present"];
    case "waterfall_summary":
      return ["bridge steps", "headline values", "totals", "supporting commentary"];
    case "segmented_infographic":
      return ["category labels", "segment shares", "headline takeaway"];
    case "structured_table":
      return ["row/column mapping", "metric labels", "values", "periods"];
    case "chart_kpi":
      return ["axis labels", "series labels", "visible values or robust textual equivalents"];
    case "asset_tear_sheet":
      return ["local market table mapping", "historical KPI series", "comparable set", "asset occupancy / rent context"];
    case "mixed_visual_analytics":
      return ["table mapping", "chart semantics", "cross-block commentary"];
    case "org_diagram":
      return ["roles", "reporting / grouping relationships"];
    case "process_diagram":
      return ["sequence / flow relationships", "step labels"];
    case "market_map":
      return ["segment labels", "comparative benchmarks", "market numbers"];
    case "transaction_terms":
      return ["economic terms", "ownership / dilution mapping", "sources/uses relationships"];
    case "legal_dense":
      return ["clause text", "defined terms", "exceptions / qualifiers"];
  }
}

function inferVisualNoiseScore(params: {
  pageClass: PageClass;
  hasStructuredArtifact: boolean;
  hasTables: boolean;
  hasCharts: boolean;
  brandingHeavy: boolean;
  garbled: boolean;
  isolatedTokenRatio: number;
  unreadableHigh: boolean;
  shortHeadingLines: number;
}): number {
  let score = 0;
  if (params.hasTables) score += 12;
  if (params.hasCharts) score += 12;
  if (!params.hasStructuredArtifact && (params.hasTables || params.hasCharts)) score += 18;
  if (params.brandingHeavy) score += 16;
  if (params.garbled) score += 22;
  if (params.unreadableHigh) score += 20;
  score += Math.min(12, Math.round(params.isolatedTokenRatio * 20));
  if (
    params.pageClass === "cover_page" ||
    params.pageClass === "table_of_contents" ||
    params.pageClass === "closing_contact" ||
    params.pageClass === "branding_transition" ||
    params.pageClass === "section_divider"
  ) {
    score += 10;
  }
  if (params.shortHeadingLines >= 3 && params.pageClass === "table_of_contents") score += 8;
  return Math.max(0, Math.min(100, score));
}

function inferAnalyticalValueScore(params: {
  pageClass: PageClass;
  charCount: number;
  labelValuePairs: number;
  numberMatches: number;
  bulletLines: number;
  yearMatches: number;
  hasStructuredArtifact: boolean;
}): number {
  let base = 0;
  switch (params.pageClass) {
    case "cover_page":
    case "closing_contact":
    case "branding_transition":
      base = 5;
      break;
    case "table_of_contents":
    case "decorative":
    case "section_divider":
      base = 10;
      break;
    case "narrative":
      base = 45;
      break;
    case "legal_dense":
      base = 50;
      break;
    case "process_diagram":
    case "org_diagram":
      base = 40;
      break;
    case "waterfall_summary":
      base = 72;
      break;
    case "segmented_infographic":
      base = 64;
      break;
    case "chart_kpi":
    case "market_map":
      base = 68;
      break;
    case "structured_table":
    case "mixed_visual_analytics":
    case "transaction_terms":
      base = 78;
      break;
    case "asset_tear_sheet":
      base = 85;
      break;
  }
  base += Math.min(8, params.labelValuePairs * 2);
  base += Math.min(6, Math.floor(params.numberMatches / 4));
  base += Math.min(5, params.bulletLines);
  if (params.yearMatches >= 2) base += 4;
  if (params.hasStructuredArtifact) base += 6;
  if (
    params.pageClass === "cover_page" ||
    params.pageClass === "table_of_contents" ||
    params.pageClass === "closing_contact" ||
    params.pageClass === "branding_transition" ||
    params.pageClass === "section_divider"
  ) {
    base = Math.min(base, 20);
  }
  if (params.charCount < 120) base -= 6;
  return Math.max(0, Math.min(100, base));
}

function countLabelValuePairs(text: string): number {
  return [...text.matchAll(/([A-Za-z][A-Za-z0-9 /&().-]{1,40})\s*[:=]?\s*(-?\d+(?:[.,]\d+)?\s?(?:%|€|eur|k€|m€|m|k|x|bps|\$)?)/g)].length;
}

function computeIsolatedTokenRatio(text: string): number {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  const isolated = tokens.filter((token) => /^[A-Za-z0-9]$/.test(token) || /^[-–]$/.test(token)).length;
  return isolated / tokens.length;
}

function countMatches(text: string, pattern: RegExp): number {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  return [...text.matchAll(matcher)].length;
}

function isTitleLikeLine(line: string): boolean {
  if (line.length < 4 || line.length > 72) return false;
  if (looksNumeric(line)) return false;
  const alphaRatio = (line.match(/[A-Za-z]/g) ?? []).length / Math.max(1, line.length);
  return alphaRatio >= 0.35 && !/^[-•o]/.test(line);
}

function looksNumeric(value: string): boolean {
  const cleaned = value.replace(/[€$£,\s%()]/g, "");
  return cleaned.length > 0 && !Number.isNaN(Number(cleaned));
}
