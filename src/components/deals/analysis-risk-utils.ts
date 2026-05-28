import { formatAgentName } from "@/lib/format-utils";

export type AnalysisSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export interface AnalysisAgentResult {
  agentName: string;
  success: boolean;
  executionTimeMs: number;
  cost: number;
  error?: string;
  data?: unknown;
}

export interface AnalysisRiskItem {
  id: string;
  title: string;
  description: string;
  severity: AnalysisSeverity;
  source?: string;
  question?: string;
  evidence?: string;
}

const severityRank: Record<AnalysisSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function valueAt(root: unknown, path: string[]): unknown {
  let cursor: unknown = root;
  for (const key of path) {
    if (!isRecord(cursor)) return null;
    cursor = cursor[key];
  }
  return cursor;
}

function severityFrom(value: unknown, fallback: AnalysisSeverity = "INFO"): AnalysisSeverity {
  const upper = text(value, fallback).toUpperCase();
  if (upper === "CRITICAL" || upper === "HIGH" || upper === "MEDIUM" || upper === "LOW") {
    return upper;
  }
  if (upper === "ABSOLUTE") return "CRITICAL";
  if (upper === "SERIOUS" || upper === "CONDITIONAL") return "HIGH";
  return fallback;
}

function titleFrom(item: Record<string, unknown>): string {
  return text(item.title)
    || text(item.flag)
    || text(item.risk)
    || text(item.summary)
    || text(item.topic)
    || text(item.question)
    || text(item.description);
}

function descriptionFrom(item: Record<string, unknown>): string {
  return text(item.description)
    || text(item.impact)
    || text(item.analysis)
    || text(item.implication)
    || text(item.rationale)
    || text(item.mitigation)
    || text(item.evidence);
}

function addRisk(
  risks: AnalysisRiskItem[],
  seen: Set<string>,
  risk: Omit<AnalysisRiskItem, "id"> & { id?: string }
) {
  const title = risk.title.trim();
  if (!title) return;
  const normalized = title.toLowerCase();
  if (seen.has(normalized)) {
    const existing = risks.find((item) => item.title.toLowerCase() === normalized);
    if (!existing) return;
    if (severityRank[risk.severity] < severityRank[existing.severity]) {
      existing.severity = risk.severity;
    }
    if (risk.description && !existing.description.includes(risk.description)) {
      existing.description = [existing.description, risk.description].filter(Boolean).join(" ");
    }
    if (risk.source && !existing.source?.includes(risk.source)) {
      existing.source = [existing.source, risk.source].filter(Boolean).join(", ");
    }
    if (risk.evidence && !existing.evidence?.includes(risk.evidence)) {
      existing.evidence = [existing.evidence, risk.evidence].filter(Boolean).join(" ");
    }
    if (risk.question && !existing.question?.includes(risk.question)) {
      existing.question = [existing.question, risk.question].filter(Boolean).join(" ");
    }
    return;
  }
  seen.add(normalized);
  risks.push({
    id: risk.id ?? `risk-${risks.length}`,
    title,
    description: risk.description,
    severity: risk.severity,
    source: risk.source,
    question: risk.question,
    evidence: risk.evidence,
  });
}

export function extractDecisionRisks(results: Record<string, AnalysisAgentResult>): AnalysisRiskItem[] {
  const seen = new Set<string>();
  const risks: AnalysisRiskItem[] = [];

  for (const [agentName, result] of Object.entries(results)) {
    if (!result.success || !isRecord(result.data)) continue;
    const data = result.data;
    const source = formatAgentName(agentName);

    const genericRiskArrays = [
      records(data.redFlags),
      records(valueAt(data, ["findings", "redFlags"])),
      records(data.criticalRisks),
      records(data.keyRisks),
      records(data.sectorRedFlags),
      records(valueAt(data, ["findings", "risks"])),
      records(valueAt(data, ["findings", "keyRisks"])),
      records(valueAt(data, ["findings", "topWeaknesses"])),
      records(valueAt(data, ["findings", "weaknesses"])),
      records(valueAt(data, ["riskAssessment", "risks"])),
      records(valueAt(data, ["riskAssessment", "redFlags"])),
      records(valueAt(data, ["investmentThesis", "keyRisks"])),
      records(valueAt(data, ["executiveSummary", "keyRisks"])),
      records(valueAt(data, ["dueDiligenceFindings", "redFlags"])),
      records(valueAt(data, ["sectorFit", "weaknesses"])),
      records(valueAt(data, ["signalProfile", "criticalRisks"])),
      records(valueAt(data, ["findings", "structuralRisks"])),
    ];

    for (const group of genericRiskArrays) {
      for (const item of group) {
        addRisk(risks, seen, {
          id: text(item.id) || text(item.riskId),
          title: titleFrom(item),
          description: descriptionFrom(item),
          severity: severityFrom(item.severity, "HIGH"),
          source: text(item.source, source),
          evidence: text(item.evidence),
          question: text(item.question),
        });
      }
    }

    for (const item of records(data.keyRisks)) {
      addRisk(risks, seen, {
        title: titleFrom(item),
        description: descriptionFrom(item),
        severity: severityFrom(item.severity, text(item.residualRisk).toLowerCase() === "high" ? "HIGH" : "MEDIUM"),
        source,
        evidence: text(item.evidence),
      });
    }

    for (const riskText of stringArray(valueAt(data, ["narrative", "risks"]))) {
      addRisk(risks, seen, {
        title: riskText,
        description: "",
        severity: "HIGH",
        source,
      });
    }

    for (const contradiction of records(valueAt(data, ["findings", "contradictions"]))) {
      addRisk(risks, seen, {
        id: text(contradiction.id) || text(contradiction.contradictionId),
        title: titleFrom(contradiction),
        description: descriptionFrom(contradiction),
        severity: severityFrom(contradiction.severity, "HIGH"),
        source: text(valueAt(contradiction, ["statement1", "location"]), source),
        evidence: text(contradiction.evidence),
      });
    }

    const concernGroups: Array<[unknown, AnalysisSeverity]> = [
      [valueAt(data, ["findings", "concernsSummary", "absolute"]), "CRITICAL"],
      [valueAt(data, ["findings", "concernsSummary", "conditional"]), "HIGH"],
      [valueAt(data, ["findings", "concernsSummary", "serious"]), "HIGH"],
    ];
    for (const [group, severity] of concernGroups) {
      for (const concern of Array.isArray(group) ? group : []) {
        const title = typeof concern === "string" ? concern : titleFrom(concern as Record<string, unknown>);
        addRisk(risks, seen, {
          title,
          description: "",
          severity,
          source,
        });
      }
    }
  }

  const deckCoherence = results["deck-coherence-checker"]?.data;
  for (const issue of records(valueAt(deckCoherence, ["issues"]))) {
    addRisk(risks, seen, {
      id: text(issue.id),
      title: titleFrom(issue),
      description: descriptionFrom(issue),
      question: text(issue.recommendation),
      source: "Cohérence deck",
      severity: severityFrom(issue.severity, "HIGH"),
    });
  }

  return risks.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}
