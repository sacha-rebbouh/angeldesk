import type {
  ArtifactProviderMetadata,
  DocumentPageArtifactVersion,
  ArtifactVerificationMetadata,
  ArtifactVerificationState,
} from "./canonical-artifact";
import type { ExtractionSemanticAssessment } from "./extraction-semantics";
import type { PageSignalFlags } from "./page-router";

type Confidence = "high" | "medium" | "low";

export type StructuralCompletenessLevel = "complete" | "partial" | "insufficient";
export type SourceAgreement = "strong" | "mixed" | "weak" | "unknown";
export type VerificationRecommendation = "clear" | "warning" | "blocking";

export interface PageArtifactLike {
  version?: DocumentPageArtifactVersion;
  pageNumber?: number;
  text: string;
  confidence: Confidence;
  tables: Array<{ title?: string | null; rows?: string[][]; markdown?: string; confidence: Confidence }>;
  charts: Array<{
    title?: string | null;
    description?: string;
    values?: Array<{ label: string; value: string }>;
    series?: string[];
    chartType?: string;
    confidence: Confidence;
  }>;
  visualBlocks: Array<{
    type: "table" | "chart" | "diagram" | "image" | "text" | "unknown";
    title?: string | null;
    description?: string;
    confidence: Confidence;
  }>;
  unreadableRegions: Array<{ reason: string; severity: "low" | "medium" | "high" }>;
  numericClaims: Array<{ label: string; value: string; sourceText?: string; confidence: Confidence }>;
  needsHumanReview: boolean;
  provider?: ArtifactProviderMetadata;
  verification?: ArtifactVerificationMetadata;
  semanticAssessment?: ExtractionSemanticAssessment;
}

export interface VerifyPageArtifactInput {
  pageNumber: number;
  nativeText?: string | null;
  combinedText?: string | null;
  flags?: Partial<PageSignalFlags> & {
    visualRiskScore?: number;
    qualityScore?: number;
  };
  artifact?: PageArtifactLike | null;
  semanticAssessment?: ExtractionSemanticAssessment | null;
}

export interface StructuralCompletenessAssessment {
  level: StructuralCompletenessLevel;
  score: number;
  sourceAgreement: SourceAgreement;
  expectedEvidence: string[];
  extractedEvidence: string[];
  missingEvidence: string[];
  groundedNumericClaimCount: number;
  unreadableRegionCount: number;
  highSeverityUnreadableRegionCount: number;
}

export interface SemanticVerificationResult {
  verification: ArtifactVerificationMetadata;
  completeness: StructuralCompletenessAssessment;
  recommendation: VerificationRecommendation;
  reasons: string[];
  supportsManifestGating: boolean;
  blocksAnalysis: boolean;
}

const STRUCTURE_CRITICAL_CLASSES = new Set<NonNullable<ExtractionSemanticAssessment["pageClass"]>>([
  "structured_table",
  "chart_kpi",
  "waterfall_summary",
  "segmented_infographic",
  "asset_tear_sheet",
  "mixed_visual_analytics",
  "market_map",
  "transaction_terms",
]);

const TABLE_CLASSES = new Set<NonNullable<ExtractionSemanticAssessment["pageClass"]>>([
  "structured_table",
  "transaction_terms",
  "asset_tear_sheet",
  "mixed_visual_analytics",
]);

const CHART_CLASSES = new Set<NonNullable<ExtractionSemanticAssessment["pageClass"]>>([
  "chart_kpi",
  "waterfall_summary",
  "segmented_infographic",
  "asset_tear_sheet",
  "mixed_visual_analytics",
  "market_map",
]);

const DIAGRAM_CLASSES = new Set<NonNullable<ExtractionSemanticAssessment["pageClass"]>>([
  "process_diagram",
  "org_diagram",
  "market_map",
]);

const LOW_INFORMATION_CLASSES = new Set<NonNullable<ExtractionSemanticAssessment["pageClass"]>>([
  "cover_page",
  "table_of_contents",
  "section_divider",
  "closing_contact",
  "branding_transition",
  "decorative",
]);

export function verifyPageArtifact(input: VerifyPageArtifactInput): SemanticVerificationResult {
  const artifact = input.artifact ?? null;
  const semanticAssessment = input.semanticAssessment ?? artifact?.semanticAssessment ?? null;
  const flags = input.flags ?? {};
  const nativeText = normalizeText(input.nativeText);
  const combinedText = normalizeText(input.combinedText ?? artifact?.text);
  const referenceText = combinedText || nativeText;

  const expectedEvidence = inferExpectedEvidence({
    flags,
    semanticAssessment,
    referenceText,
  });
  const extractedEvidence = inferExtractedEvidence(artifact);
  const missingEvidence = expectedEvidence.filter((evidence) => !extractedEvidence.includes(evidence));
  const sourceAgreement = assessSourceAgreement({
    nativeText,
    combinedText,
    artifactText: normalizeText(artifact?.text),
  });
  const groundedNumericClaimCount = countGroundedNumericClaims({
    artifact,
    referenceText,
  });
  const unreadableRegionCount = artifact?.unreadableRegions.length ?? 0;
  const highSeverityUnreadableRegionCount = artifact?.unreadableRegions.filter((region) => region.severity === "high").length ?? 0;

  const completeness = assessStructuralCompleteness({
    artifact,
    flags,
    semanticAssessment,
    expectedEvidence,
    extractedEvidence,
    missingEvidence,
    sourceAgreement,
    groundedNumericClaimCount,
    unreadableRegionCount,
    highSeverityUnreadableRegionCount,
  });

  const verification = buildVerificationMetadata({
    artifact,
    sourceAgreement,
    completeness,
    expectedEvidence,
    extractedEvidence,
    missingEvidence,
    groundedNumericClaimCount,
    referenceText,
  });

  const { recommendation, reasons } = deriveRecommendation({
    artifact,
    verification,
    completeness,
    semanticAssessment,
    flags,
    missingEvidence,
  });

  return {
    verification,
    completeness,
    recommendation,
    reasons,
    supportsManifestGating: recommendation !== "blocking",
    blocksAnalysis: recommendation === "blocking",
  };
}

export function verifySemanticPageExtraction(params: {
  nativeText: string;
  combinedText: string;
  flags: PageSignalFlags;
  artifact?: PageArtifactLike | null;
  semanticAssessment?: Pick<
    ExtractionSemanticAssessment,
    "semanticSufficiency" | "structureDependency" | "shouldBlockIfStructureMissing" | "canDegradeToWarning"
  >;
}) {
  const result = verifyPageArtifact({
    pageNumber: 0,
    nativeText: params.nativeText,
    combinedText: params.combinedText,
    flags: params.flags,
    artifact: params.artifact,
    semanticAssessment: params.semanticAssessment
      ? ({
          pageClass: "narrative",
          classConfidence: "medium",
          classReasons: [],
          labelValueIntegrity: "mixed",
          visualNoiseScore: 0,
          analyticalValueScore: 50,
          requiresStructuredPreservation:
            params.semanticAssessment.structureDependency === "high" ||
            params.semanticAssessment.structureDependency === "critical" ||
            params.semanticAssessment.shouldBlockIfStructureMissing,
          minimumEvidence: [],
          rationale: [],
          ...params.semanticAssessment,
        } satisfies ExtractionSemanticAssessment)
      : undefined,
  });

  const expectedStructuredSignals = result.completeness.expectedEvidence.filter((item) => item !== "numeric_grounding").length;
  const capturedStructuredSignals = result.completeness.extractedEvidence.filter((item) => item !== "numeric_grounding").length;

  return {
    verification: result.verification,
    expectedStructuredSignals,
    capturedStructuredSignals,
    completenessScore: result.completeness.score,
    missing: result.completeness.missingEvidence,
    requiresVisualReview: result.recommendation === "blocking",
    shouldEscalateToVision:
      result.recommendation === "blocking" ||
      (
        result.completeness.missingEvidence.some((item) => item === "table_structure" || item === "chart_structure") &&
        result.completeness.sourceAgreement !== "strong"
      ),
  };
}

function inferExpectedEvidence(params: {
  flags: Partial<PageSignalFlags> & { visualRiskScore?: number; qualityScore?: number };
  semanticAssessment: ExtractionSemanticAssessment | null;
  referenceText: string;
}): string[] {
  const expected = new Set<string>();
  const pageClass = params.semanticAssessment?.pageClass;

  if (params.flags.hasTables || (pageClass && TABLE_CLASSES.has(pageClass))) {
    expected.add("table_structure");
  }
  if (params.flags.hasCharts || (pageClass && CHART_CLASSES.has(pageClass))) {
    expected.add("chart_structure");
  }
  if (pageClass && DIAGRAM_CLASSES.has(pageClass)) {
    expected.add("diagram_structure");
  }

  const referenceNumbers = extractNumericTokens(params.referenceText).length;
  const analyticalValueScore = params.semanticAssessment?.analyticalValueScore ?? 0;
  if (
    params.flags.hasFinancialKeywords ||
    params.flags.hasTables ||
    params.flags.hasCharts ||
    analyticalValueScore >= 45 ||
    referenceNumbers >= 6
  ) {
    expected.add("numeric_grounding");
  }

  return Array.from(expected);
}

function inferExtractedEvidence(artifact: PageArtifactLike | null): string[] {
  if (!artifact) return [];

  const extracted = new Set<string>();
  if (
    artifact.tables.length > 0 ||
    artifact.visualBlocks.some((block) => block.type === "table")
  ) {
    extracted.add("table_structure");
  }
  if (
    artifact.charts.some((chart) => Boolean(chart.values?.length) || Boolean(chart.series?.length) || chart.confidence !== "low") ||
    artifact.visualBlocks.some((block) => block.type === "chart")
  ) {
    extracted.add("chart_structure");
  }
  if (artifact.visualBlocks.some((block) => block.type === "diagram")) {
    extracted.add("diagram_structure");
  }
  if (artifact.numericClaims.length > 0) {
    extracted.add("numeric_grounding");
  }

  return Array.from(extracted);
}

function assessSourceAgreement(params: {
  nativeText: string;
  combinedText: string;
  artifactText: string;
}): SourceAgreement {
  const referenceText = params.combinedText || params.nativeText;
  if (!referenceText || !params.artifactText) return "unknown";

  const referenceTokens = extractComparableTokens(referenceText);
  const artifactTokens = extractComparableTokens(params.artifactText);
  if (referenceTokens.size === 0 || artifactTokens.size === 0) return "unknown";

  const overlap = countOverlap(referenceTokens, artifactTokens);
  const precision = overlap / artifactTokens.size;
  const recall = overlap / referenceTokens.size;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  if (f1 >= 0.72) return "strong";
  if (f1 >= 0.4) return "mixed";
  return "weak";
}

function countGroundedNumericClaims(params: {
  artifact: PageArtifactLike | null;
  referenceText: string;
}): number {
  if (!params.artifact) return 0;

  const referenceNumbers = new Set(extractNumericTokens(params.referenceText));
  if (referenceNumbers.size === 0) {
    return params.artifact.numericClaims.length;
  }

  return params.artifact.numericClaims.filter((claim) => {
    const candidates = [
      ...extractNumericTokens(claim.value),
      ...extractNumericTokens(claim.sourceText ?? ""),
    ];
    return candidates.some((candidate) => referenceNumbers.has(candidate));
  }).length;
}

function assessStructuralCompleteness(params: {
  artifact: PageArtifactLike | null;
  flags: Partial<PageSignalFlags> & { visualRiskScore?: number; qualityScore?: number };
  semanticAssessment: ExtractionSemanticAssessment | null;
  expectedEvidence: string[];
  extractedEvidence: string[];
  missingEvidence: string[];
  sourceAgreement: SourceAgreement;
  groundedNumericClaimCount: number;
  unreadableRegionCount: number;
  highSeverityUnreadableRegionCount: number;
}): StructuralCompletenessAssessment {
  let score = 100;

  for (const missing of params.missingEvidence) {
    score -= missing === "numeric_grounding" ? 20 : 35;
  }
  if (params.expectedEvidence.includes("numeric_grounding") && params.groundedNumericClaimCount === 0) {
    score -= 15;
  }

  if (params.sourceAgreement === "mixed") score -= 15;
  if (params.sourceAgreement === "weak") score -= 35;

  score -= params.unreadableRegionCount * 4;
  score -= params.highSeverityUnreadableRegionCount * 18;

  if (!params.artifact && params.expectedEvidence.length > 0) {
    score -= 25;
  }
  if (
    params.semanticAssessment?.requiresStructuredPreservation &&
    params.missingEvidence.length > 0
  ) {
    score -= 10;
  }
  if (
    params.flags.visualRiskScore !== undefined &&
    params.flags.visualRiskScore >= 80 &&
    params.missingEvidence.length > 0
  ) {
    score -= 10;
  }

  score = Math.max(0, Math.min(100, score));

  let level: StructuralCompletenessLevel = "complete";
  if (score < 55 || params.highSeverityUnreadableRegionCount > 0) {
    level = "insufficient";
  } else if (score < 85 || params.missingEvidence.length > 0 || params.sourceAgreement === "mixed") {
    level = "partial";
  }

  const hasStrongEvidenceDespitePartialStructure = Boolean(
    params.semanticAssessment?.requiresStructuredPreservation &&
      params.semanticAssessment.semanticSufficiency === "sufficient" &&
      params.semanticAssessment.labelValueIntegrity === "strong" &&
      params.sourceAgreement !== "weak" &&
      params.groundedNumericClaimCount > 0 &&
      params.highSeverityUnreadableRegionCount === 0 &&
      params.missingEvidence.length > 0,
  );

  if (level === "insufficient" && hasStrongEvidenceDespitePartialStructure) {
    level = "partial";
    score = Math.max(score, 65);
  }

  if (
    params.semanticAssessment &&
    LOW_INFORMATION_CLASSES.has(params.semanticAssessment.pageClass) &&
    params.missingEvidence.length === 0
  ) {
    level = "complete";
    score = Math.max(score, 90);
  }

  return {
    level,
    score,
    sourceAgreement: params.sourceAgreement,
    expectedEvidence: params.expectedEvidence,
    extractedEvidence: params.extractedEvidence,
    missingEvidence: params.missingEvidence,
    groundedNumericClaimCount: params.groundedNumericClaimCount,
    unreadableRegionCount: params.unreadableRegionCount,
    highSeverityUnreadableRegionCount: params.highSeverityUnreadableRegionCount,
  };
}

function buildVerificationMetadata(params: {
  artifact: PageArtifactLike | null;
  sourceAgreement: SourceAgreement;
  completeness: StructuralCompletenessAssessment;
  expectedEvidence: string[];
  extractedEvidence: string[];
  missingEvidence: string[];
  groundedNumericClaimCount: number;
  referenceText: string;
}): ArtifactVerificationMetadata {
  const inherited = params.artifact?.verification;
  const evidence = new Set<string>(inherited?.evidence ?? []);
  const issues = new Set<string>(inherited?.issues ?? []);

  if (params.artifact?.provider?.kind) evidence.add(`provider:${params.artifact.provider.kind}`);
  if (params.artifact?.provider?.modelId) evidence.add(`model:${params.artifact.provider.modelId}`);
  if (params.artifact?.provider?.transport) evidence.add(`transport:${params.artifact.provider.transport}`);
  evidence.add(`source_agreement:${params.sourceAgreement}`);
  evidence.add(`completeness_score:${params.completeness.score}`);
  evidence.add(`expected_evidence:${params.expectedEvidence.length}`);
  evidence.add(`extracted_evidence:${params.extractedEvidence.length}`);
  evidence.add(`grounded_numeric_claims:${params.groundedNumericClaimCount}`);
  evidence.add(`reference_numbers:${extractNumericTokens(params.referenceText).length}`);

  for (const missing of params.missingEvidence) {
    issues.add(`missing_${missing}`);
  }
  if (params.sourceAgreement === "weak") {
    issues.add("weak_source_agreement");
  } else if (params.sourceAgreement === "mixed") {
    issues.add("mixed_source_agreement");
  }
  if (params.completeness.highSeverityUnreadableRegionCount > 0) {
    issues.add("high_severity_unreadable_regions");
  }
  if (!params.artifact && params.expectedEvidence.length > 0) {
    issues.add("artifact_missing");
  }

  let state: ArtifactVerificationState =
    inherited?.state ??
    inferVerificationState(params.artifact);

  if (!params.artifact && !params.referenceText) {
    state = "parse_failed";
  } else if (state !== "parse_failed" && params.completeness.level === "insufficient" && !params.artifact?.provider) {
    state = "heuristic_fallback";
  }

  return {
    state,
    evidence: Array.from(evidence),
    issues: Array.from(issues),
  };
}

function inferVerificationState(artifact: PageArtifactLike | null): ArtifactVerificationState {
  if (!artifact) return "unverified";
  if (
    artifact.provider?.transport === "json_schema" ||
    artifact.provider?.transport === "provider_structured"
  ) {
    return "provider_structured";
  }
  if (artifact.provider) return "heuristic_fallback";
  return "unverified";
}

function deriveRecommendation(params: {
  artifact: PageArtifactLike | null;
  verification: ArtifactVerificationMetadata;
  completeness: StructuralCompletenessAssessment;
  semanticAssessment: ExtractionSemanticAssessment | null;
  flags: Partial<PageSignalFlags> & { visualRiskScore?: number; qualityScore?: number };
  missingEvidence: string[];
}): { recommendation: VerificationRecommendation; reasons: string[] } {
  const reasons = new Set<string>();

  if (params.verification.state === "parse_failed") {
    reasons.add("artifact parse failed");
    return { recommendation: "blocking", reasons: Array.from(reasons) };
  }

  if (params.completeness.highSeverityUnreadableRegionCount > 0) {
    reasons.add("high-severity unreadable regions remain");
  }
  if (params.completeness.level === "insufficient") {
    reasons.add("structural completeness is insufficient");
  } else if (params.completeness.level === "partial") {
    reasons.add("structural completeness is partial");
  }
  if (params.completeness.sourceAgreement === "weak") {
    reasons.add("artifact and source text disagree materially");
  } else if (params.completeness.sourceAgreement === "mixed") {
    reasons.add("artifact and source text only partially agree");
  }
  if (params.missingEvidence.length > 0) {
    reasons.add(`missing evidence: ${params.missingEvidence.join(", ")}`);
  }

  const semantic = params.semanticAssessment;
  const structureCritical = Boolean(
    semantic?.requiresStructuredPreservation ||
      semantic?.shouldBlockIfStructureMissing ||
      (semantic && STRUCTURE_CRITICAL_CLASSES.has(semantic.pageClass)) ||
      semantic?.structureDependency === "high" ||
      semantic?.structureDependency === "critical",
  );
  const analyticalValueScore = semantic?.analyticalValueScore ?? 0;
  const hasStrongEvidenceDespitePartialStructure = Boolean(
    structureCritical &&
      params.completeness.level === "partial" &&
      semantic?.semanticSufficiency === "sufficient" &&
      semantic?.labelValueIntegrity === "strong" &&
      params.completeness.sourceAgreement !== "weak" &&
      params.completeness.groundedNumericClaimCount > 0 &&
      params.completeness.highSeverityUnreadableRegionCount === 0,
  );

  if (
    params.completeness.highSeverityUnreadableRegionCount > 0 ||
    (
      structureCritical &&
      params.completeness.level !== "complete" &&
      !hasStrongEvidenceDespitePartialStructure &&
      !semantic?.canDegradeToWarning
    ) ||
    (
      semantic?.semanticSufficiency === "insufficient" &&
      analyticalValueScore >= 35 &&
      params.completeness.level !== "complete"
    )
  ) {
    return { recommendation: "blocking", reasons: Array.from(reasons) };
  }

  if (
    params.completeness.level === "partial" ||
    (params.completeness.sourceAgreement !== "strong" &&
      !(params.completeness.sourceAgreement === "unknown" && params.missingEvidence.length === 0 && !params.artifact)) ||
    params.missingEvidence.length > 0 ||
    params.verification.issues?.length
  ) {
    return { recommendation: "warning", reasons: Array.from(reasons) };
  }

  return { recommendation: "clear", reasons: [] };
}

function normalizeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function extractComparableTokens(text: string): Set<string> {
  const tokens = text.toLowerCase().match(/[a-z0-9%$€£.-]+/g) ?? [];
  return new Set(tokens.filter((token) => token.length >= 3 && !/^(page|slide|confidential)$/.test(token)));
}

function countOverlap(left: Set<string>, right: Set<string>): number {
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return overlap;
}

function extractNumericTokens(text: string): string[] {
  return (text.match(/-?\d+(?:[.,]\d+)?(?:\s?%|\s?[kmb]|\s?(?:usd|eur|nok|sek|dkk|gbp|x|bps))?/gi) ?? [])
    .map((token) => token.toLowerCase().replace(/\s+/g, ""));
}
