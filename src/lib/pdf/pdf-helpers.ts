/**
 * PDF Helper Functions
 *
 * Shared utilities for formatting values, percentages, scores, severities.
 * Ported from the original jsPDF generator with fixes for nested objects.
 */

import { colors } from "./pdf-theme";

// ---------------------------------------------------------------------------
// Safe value extraction
// ---------------------------------------------------------------------------

/** Recursively extract human-readable text from any value (objects, arrays, etc.) */
export function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "N/A";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (Array.isArray(val)) {
    return val.map((item) => formatValue(item)).join(", ");
  }
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    if (typeof obj.assessment === "string") return obj.assessment;
    if (typeof obj.description === "string" && typeof obj.name === "string")
      return `${obj.name}: ${obj.description}`;
    if (typeof obj.description === "string") return obj.description;
    if (typeof obj.text === "string") return obj.text;
    if (typeof obj.summary === "string") return obj.summary;
    if (typeof obj.range === "string") return obj.range;
    if (typeof obj.stage === "string" && obj.total !== undefined) {
      return `${obj.stage} ($${typeof obj.total === "number" ? `${(obj.total / 1_000_000).toFixed(0)}M` : obj.total})`;
    }
    if (obj.value !== undefined && typeof obj.value !== "object")
      return String(obj.value);
    if (typeof obj.name === "string") return obj.name;
    const entries = Object.entries(obj)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `${k}: ${formatValue(v)}`);
    return entries.join(" | ");
  }
  return String(val);
}

/** Safe string extraction */
export function s(val: unknown): string {
  if (val === null || val === undefined) return "N/A";
  if (typeof val === "object") return formatValue(val);
  return String(val);
}

/** Safe number extraction */
export function n(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const num = Number(val);
  return isNaN(num) ? null : num;
}

/** Format any value as percentage, safely handling objects with .value */
export function fmtPct(val: unknown): string {
  if (val === null || val === undefined) return "N/A";
  if (typeof val === "number") return `${val}%`;
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    if (typeof obj.value === "number") return `${obj.value}%`;
    return formatValue(val);
  }
  return `${val}%`;
}

/** Format EUR amounts */
export function fmtEur(v: number | null): string {
  if (!v) return "N/A";
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}Mds€`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M€`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K€`;
  return `${v}€`;
}

/** Format weight, auto-detecting 0-1 vs 0-100 scale */
export function fmtWeight(val: unknown): string {
  if (val === null || val === undefined) return "N/A";
  const num = typeof val === "number" ? val : Number(val);
  if (isNaN(num)) return "N/A";
  return `${num <= 1 ? Math.round(num * 100) : Math.round(num)}%`;
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

/** Get color for a score (0-100) */
export function scoreColor(score: number): string {
  if (score >= 70) return colors.success;
  if (score >= 50) return colors.warning;
  return colors.danger;
}

/** Get light background color for a score (0-100) */
export function scoreBgColor(score: number): string {
  if (score >= 70) return colors.successLight;
  if (score >= 50) return colors.warningLight;
  return colors.dangerLight;
}

/** Get color for severity */
export function severityColor(severity: string): string {
  const sev = severity?.toLowerCase();
  if (sev === "critical") return colors.danger;
  if (sev === "high" || sev === "major") return colors.warning;
  if (sev === "medium") return "#CA8A04"; // yellow-600
  return colors.primary; // low
}

/** Get background color for severity */
export function severityBgColor(severity: string): string {
  const sev = severity?.toLowerCase();
  if (sev === "critical") return colors.dangerLight;
  if (sev === "high" || sev === "major") return colors.warningLight;
  if (sev === "medium") return "#FEF9C3"; // yellow-100
  return colors.primaryLight;
}

/** Recommendation label in French */
export function recLabel(rec: string): string {
  if (rec === "invest") return "INVESTIR";
  if (rec === "pass") return "PASSER";
  if (rec === "negotiate") return "NEGOCIER";
  if (rec === "wait") return "ATTENDRE";
  return "DD COMPLEMENTAIRE";
}

/** Priority order for sorting */
export function priorityOrder(p: string): number {
  const map: Record<string, number> = {
    CRITICAL: 0,
    MUST_ASK: 0,
    absolute_dealbreaker: 0,
    HIGH: 1,
    SHOULD_ASK: 1,
    likely_dealbreaker: 1,
    MEDIUM: 2,
    investigate: 2,
    LOW: 3,
    NICE_TO_HAVE: 3,
  };
  return map[p] ?? 4;
}

/** Safe uppercase — handles objects, nulls, numbers */
export function sup(val: unknown): string {
  return s(val).toUpperCase();
}

/** Severity order for sorting */
export function severityOrder(sev: string): number {
  const map: Record<string, number> = {
    CRITICAL: 0,
    critical: 0,
    HIGH: 1,
    high: 1,
    major: 1,
    MEDIUM: 2,
    medium: 2,
    minor: 3,
    LOW: 3,
    low: 3,
  };
  return map[sev] ?? 4;
}
