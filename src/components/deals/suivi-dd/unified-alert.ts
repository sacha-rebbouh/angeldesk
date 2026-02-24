import type { AlertResolution } from "@/hooks/use-resolutions";

// ── Unified Alert interface ──

export interface UnifiedAlert {
  id: string;
  alertKey: string;
  alertType: "RED_FLAG" | "DEVILS_ADVOCATE" | "CONDITIONS";
  subType?: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  description?: string;
  evidence?: string;
  impact?: string;
  source: string;
  detectedBy?: string[];
  duplicateCount?: number;

  // DA specific
  dealBreakerLevel?: "ABSOLUTE" | "CONDITIONAL" | "CONCERN";
  resolutionPath?: string;
  // Conditions specific
  suggestedArgument?: string;
  leverageSource?: string;

  // Cross-type merge: which other types were merged into this alert
  mergedFrom?: ("RED_FLAG" | "DEVILS_ADVOCATE" | "CONDITIONS")[];

  // Attached at build time
  resolution?: AlertResolution | null;

  linkedQuestion?: {
    questionId: string;
    question: string;
    priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    category: string;
  } | null;

  linkedResponse?: {
    answer: string;
    status: "answered" | "not_applicable" | "refused" | "pending";
  } | null;
}

export interface AlertCounts {
  total: number;
  open: number;
  resolved: number;
  accepted: number;
  bySeverity: Record<string, { open: number; total: number }>;
  byType: Record<string, number>;
  questionsAnswered: number;
  questionsTotal: number;
}

// ── Helpers ──

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export function severityRank(severity: Severity): number {
  return SEVERITY_RANK[severity] ?? 4;
}

export function alertTypeLabel(type: "RED_FLAG" | "DEVILS_ADVOCATE" | "CONDITIONS"): string {
  switch (type) {
    case "RED_FLAG": return "RF";
    case "DEVILS_ADVOCATE": return "DA";
    case "CONDITIONS": return "COND";
  }
}

export function severityLabel(severity: Severity): string {
  switch (severity) {
    case "CRITICAL": return "Critique";
    case "HIGH": return "Élevé";
    case "MEDIUM": return "Moyen";
    case "LOW": return "Bas";
    default: return severity;
  }
}

export function severityBorderColor(severity: Severity): string {
  switch (severity) {
    case "CRITICAL": return "border-l-red-500";
    case "HIGH": return "border-l-orange-500";
    case "MEDIUM": return "border-l-yellow-500";
    case "LOW": return "border-l-blue-400";
    default: return "border-l-gray-300";
  }
}

export function severityBgColor(severity: Severity): string {
  switch (severity) {
    case "CRITICAL": return "bg-red-500";
    case "HIGH": return "bg-orange-500";
    case "MEDIUM": return "bg-yellow-500";
    case "LOW": return "bg-blue-400";
    default: return "bg-gray-400";
  }
}
