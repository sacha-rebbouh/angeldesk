import { sanitizeForLLM } from "@/lib/sanitize";
import type { EnrichedAgentContext } from "@/agents/types";

type AgentDocument = NonNullable<EnrichedAgentContext["documents"]>[number];
type ExtractionPage = NonNullable<AgentDocument["extractionRuns"]>[number]["pages"][number];

export type EvidenceKind =
  | "fact"
  | "document_artifact"
  | "external_source"
  | "extraction_warning";

export type EvidenceReliability =
  | "AUDITED"
  | "VERIFIED"
  | "DECLARED"
  | "PROJECTED"
  | "ESTIMATED"
  | "UNVERIFIABLE"
  | "ARTIFACT_HIGH"
  | "ARTIFACT_MEDIUM"
  | "ARTIFACT_LOW"
  | "SOURCE_HEALTH";

export interface EvidenceLedgerItem {
  id: string;
  kind: EvidenceKind;
  label: string;
  value?: string;
  source: string;
  location?: string;
  reliability: EvidenceReliability;
  confidence?: number;
  warning?: string;
}

export interface EvidenceLedger {
  generatedAt: string;
  coverage: {
    factCount: number;
    documentArtifactCount: number;
    visualArtifactCount: number;
    numericClaimCount: number;
    extractionWarningCount: number;
    externalSourceIssueCount: number;
    lowReliabilityFactCount: number;
  };
  items: EvidenceLedgerItem[];
  warnings: string[];
}

export function buildEvidenceLedgerFromContext(context: EnrichedAgentContext): EvidenceLedger {
  const items: EvidenceLedgerItem[] = [];
  const warnings: string[] = [];

  for (const fact of context.factStore ?? []) {
    const reliability = fact.reliability?.reliability ?? "UNVERIFIABLE";
    items.push({
      id: `fact:${fact.factKey}`,
      kind: "fact",
      label: fact.factKey,
      value: String(fact.currentDisplayValue ?? fact.currentValue ?? ""),
      source: fact.currentSource,
      reliability,
      confidence: fact.currentConfidence,
      warning: fact.isDisputed
        ? `DISPUTED with ${fact.disputeDetails?.conflictingSource ?? "unknown source"}`
        : fact.reliability?.isProjection
          ? "Projection, not historical fact"
          : undefined,
    });
  }

  for (const doc of context.documents ?? []) {
    const latestRun = doc.extractionRuns?.[0];
    for (const page of latestRun?.pages ?? []) {
      const artifact = asRecord(page.artifact);
      if (!artifact) continue;

      const artifactConfidence = normalizeArtifactConfidence(artifact.confidence);
      const source = `${doc.name} (${doc.type})`;
      const location = `page ${page.pageNumber}`;
      const visualCount = countArray(artifact.visualBlocks);
      const tableCount = countArray(artifact.tables);
      const chartCount = countArray(artifact.charts);
      const numericCount = countArray(artifact.numericClaims);
      const warningCount = countArray(artifact.unreadableRegions);

      items.push({
        id: `artifact:${doc.id}:${page.pageNumber}`,
        kind: "document_artifact",
        label: `Extraction artifact ${location}`,
        value: `${page.wordCount} words, ${tableCount} tables, ${chartCount} charts, ${numericCount} numeric claims`,
        source,
        location,
        reliability: `ARTIFACT_${artifactConfidence.toUpperCase()}` as EvidenceReliability,
        confidence: page.qualityScore ?? undefined,
        warning: page.status === "NEEDS_REVIEW" || page.status === "FAILED"
          ? `Extraction status ${page.status}`
          : undefined,
      });

      if (page.hasTables || page.hasCharts || visualCount > 0 || numericCount > 0) {
        items.push({
          id: `visual:${doc.id}:${page.pageNumber}`,
          kind: "document_artifact",
          label: `Structured visual evidence ${location}`,
          value: `${visualCount} visual blocks, ${tableCount} tables, ${chartCount} charts, ${numericCount} numeric claims`,
          source,
          location,
          reliability: `ARTIFACT_${artifactConfidence.toUpperCase()}` as EvidenceReliability,
          confidence: page.qualityScore ?? undefined,
          warning: buildVisualWarning(page, artifact),
        });
      }

      if (warningCount > 0 || page.status === "NEEDS_REVIEW" || page.status === "FAILED") {
        const warning = extractUnreadableWarning(page, artifact);
        warnings.push(`${source} ${location}: ${warning}`);
        items.push({
          id: `warning:${doc.id}:${page.pageNumber}`,
          kind: "extraction_warning",
          label: `Extraction warning ${location}`,
          value: warning,
          source,
          location,
          reliability: "ARTIFACT_LOW",
          confidence: page.qualityScore ?? undefined,
          warning,
        });
      }
    }
  }

  const sourceHealth = context.contextEngine?.sourceHealth;
  if (sourceHealth) {
    const sourceIssues = [
      ...sourceHealth.unconfiguredCritical.map((source) => ({
        name: source.name,
        severity: source.severity,
        reason: source.reason,
      })),
      ...sourceHealth.failed.map((source) => ({
        name: source.name,
        severity: source.severity,
        reason: source.error,
      })),
    ];

    for (const source of sourceIssues) {
      items.push({
        id: `source:${source.name}`,
        kind: "external_source",
        label: source.name,
        value: source.reason,
        source: "Context Engine",
        reliability: "SOURCE_HEALTH",
        warning: `[${source.severity}] ${source.reason}`,
      });
    }
  }

  const coverage = {
    factCount: items.filter((item) => item.kind === "fact").length,
    documentArtifactCount: items.filter((item) => item.id.startsWith("artifact:")).length,
    visualArtifactCount: items.filter((item) => item.id.startsWith("visual:")).length,
    numericClaimCount: countNumericClaims(context.documents ?? []),
    extractionWarningCount: items.filter((item) => item.kind === "extraction_warning").length,
    externalSourceIssueCount: items.filter((item) => item.kind === "external_source").length,
    lowReliabilityFactCount: items.filter((item) => (
      item.kind === "fact" &&
      ["DECLARED", "PROJECTED", "ESTIMATED", "UNVERIFIABLE"].includes(item.reliability)
    )).length,
  };

  return {
    generatedAt: new Date().toISOString(),
    coverage,
    items,
    warnings: [...new Set(warnings)].slice(0, 30),
  };
}

export function formatEvidenceLedgerForPrompt(ledger?: EvidenceLedger): string {
  if (!ledger) return "";

  const priorityItems = [...ledger.items]
    .sort((left, right) => evidencePriority(right) - evidencePriority(left))
    .slice(0, 80);

  const lines = [
    "## EVIDENCE LEDGER — CONTRAT DE PREUVE",
    "",
    "Regle obligatoire: toute conclusion importante doit etre rattachee a une preuve ci-dessous, au Fact Store, a un artefact documentaire, ou etre marquee UNVERIFIED.",
    "Ne transforme jamais une donnee DECLARED/PROJECTED/UNVERIFIABLE en fait verifie.",
    "",
    `Couverture: ${ledger.coverage.factCount} facts, ${ledger.coverage.documentArtifactCount} artefacts, ${ledger.coverage.visualArtifactCount} artefacts visuels, ${ledger.coverage.numericClaimCount} donnees chiffrees, ${ledger.coverage.extractionWarningCount} alertes extraction, ${ledger.coverage.externalSourceIssueCount} problemes sources externes.`,
  ];

  if (ledger.warnings.length > 0) {
    lines.push("", "Alertes extraction a respecter:");
    for (const warning of ledger.warnings.slice(0, 10)) {
      lines.push(`- ${warning}`);
    }
  }

  lines.push("", "Preuves prioritaires:");
  for (const item of priorityItems) {
    const location = item.location ? ` | ${item.location}` : "";
    const confidence = typeof item.confidence === "number" ? ` | conf=${Math.round(item.confidence)}` : "";
    const warning = item.warning ? ` | WARNING: ${item.warning}` : "";
    lines.push(`- [${item.reliability}] ${item.label}${location} | ${item.source}${confidence}${item.value ? ` | ${item.value}` : ""}${warning}`);
  }

  return sanitizeForLLM(lines.join("\n"), {
    maxLength: 24_000,
    preserveNewlines: true,
  });
}

function evidencePriority(item: EvidenceLedgerItem): number {
  let score = 0;
  if (item.kind === "extraction_warning") score += 100;
  if (item.kind === "external_source") score += 80;
  if (item.warning) score += 50;
  if (item.kind === "document_artifact") score += 30;
  if (item.kind === "fact") score += 20;
  if (typeof item.confidence === "number") score += Math.min(20, item.confidence / 5);
  return score;
}

function buildVisualWarning(page: ExtractionPage, artifact: Record<string, unknown>): string | undefined {
  const tableCount = countArray(artifact.tables);
  const chartCount = countArray(artifact.charts);
  const numericCount = countArray(artifact.numericClaims);
  if (page.hasTables && tableCount === 0) return "Page flagged as table-like but has no structured table rows";
  if (page.hasCharts && chartCount === 0 && numericCount < 3) return "Page flagged as chart-like but has no structured chart values";
  if (artifact.needsHumanReview === true) return "Artifact requires human review";
  return undefined;
}

function extractUnreadableWarning(page: ExtractionPage, artifact: Record<string, unknown>): string {
  const unreadable = Array.isArray(artifact.unreadableRegions) ? artifact.unreadableRegions : [];
  const reasons = unreadable
    .filter(asRecord)
    .map((region) => String(region.reason ?? "Unreadable region"))
    .slice(0, 3);
  if (reasons.length > 0) return reasons.join("; ");
  return `Extraction status ${page.status}`;
}

function countNumericClaims(documents: AgentDocument[]): number {
  let count = 0;
  for (const doc of documents) {
    const latestRun = doc.extractionRuns?.[0];
    for (const page of latestRun?.pages ?? []) {
      const artifact = asRecord(page.artifact);
      if (artifact) count += countArray(artifact.numericClaims);
    }
  }
  return count;
}

function normalizeArtifactConfidence(value: unknown): "high" | "medium" | "low" {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

function countArray(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
