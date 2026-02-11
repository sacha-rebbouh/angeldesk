/**
 * Utility functions for formatting values across the application
 */

import { AGENT_LABELS_FR } from "@/config/labels-fr";

// F61: Use centralized French labels
export const AGENT_DISPLAY_NAMES: Record<string, string> = AGENT_LABELS_FR;

/**
 * Converts an agent slug (e.g., "financial-auditor") to a display name (e.g., "Financial Auditor")
 */
export function formatAgentName(slug: string): string {
  return AGENT_DISPLAY_NAMES[slug] ?? slug;
}

/**
 * Formats a number as currency (USD)
 */
export function formatCurrency(value: number, options?: {
  compact?: boolean;
  decimals?: number;
}): string {
  const { compact = false, decimals = 0 } = options ?? {};

  if (compact) {
    if (value >= 1_000_000_000) {
      return `$${(value / 1_000_000_000).toFixed(decimals)}B`;
    }
    if (value >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(decimals)}M`;
    }
    if (value >= 1_000) {
      return `$${(value / 1_000).toFixed(decimals)}K`;
    }
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Formats a nullable number as EUR currency (used in deal display pages)
 */
export function formatCurrencyEUR(value: number | string | null | undefined): string {
  if (value == null) return "-";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(num);
}

/**
 * Formats a percentage value
 */
export function formatPercent(value: number, decimals = 0): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Formats a multiple (e.g., 2.5x)
 */
export function formatMultiple(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}x`;
}

/**
 * Returns Tailwind classes for deal status badge colors
 */
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    SCREENING: "bg-blue-100 text-blue-800",
    ANALYZING: "bg-yellow-100 text-yellow-800",
    IN_DD: "bg-purple-100 text-purple-800",
    PASSED: "bg-gray-100 text-gray-800",
    INVESTED: "bg-green-100 text-green-800",
    ARCHIVED: "bg-gray-100 text-gray-800",
  };
  return colors[status] ?? "bg-gray-100 text-gray-800";
}

/**
 * Returns French label for deal status
 */
export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    SCREENING: "Screening",
    ANALYZING: "En analyse",
    IN_DD: "Due Diligence",
    PASSED: "Pass\u00e9",
    INVESTED: "Investi",
    ARCHIVED: "Archiv\u00e9",
  };
  return labels[status] ?? status;
}

/**
 * Returns French label for deal stage
 */
export function getStageLabel(stage: string | null, fallback = "-"): string {
  if (!stage) return fallback;
  const labels: Record<string, string> = {
    PRE_SEED: "Pre-seed",
    SEED: "Seed",
    SERIES_A: "S\u00e9rie A",
    SERIES_B: "S\u00e9rie B",
    SERIES_C: "S\u00e9rie C",
    LATER: "Later Stage",
  };
  return labels[stage] ?? stage;
}

/**
 * Returns Tailwind classes for red flag severity badge
 */
export function getSeverityColor(severity: string): string {
  const colors: Record<string, string> = {
    CRITICAL: "bg-red-500 text-white",
    HIGH: "bg-orange-500 text-white",
    MEDIUM: "bg-yellow-500 text-black",
    LOW: "bg-blue-100 text-blue-800",
  };
  return colors[severity] ?? "bg-gray-100 text-gray-800";
}

/**
 * Returns text-only Tailwind color class for a score (0-100)
 */
export function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-blue-600";
  if (score >= 40) return "text-yellow-600";
  if (score >= 20) return "text-orange-600";
  return "text-red-600";
}

/**
 * Returns background Tailwind color class for a score (0-100)
 */
export function getScoreBgColor(score: number): string {
  if (score >= 80) return "bg-green-100";
  if (score >= 60) return "bg-blue-100";
  if (score >= 40) return "bg-yellow-100";
  if (score >= 20) return "bg-orange-100";
  return "bg-red-100";
}

/**
 * Returns badge-style Tailwind classes (bg + text + border) for a score (0-100)
 */
export function getScoreBadgeColor(score: number): string {
  if (score >= 80) return "bg-green-100 text-green-800 border-green-200";
  if (score >= 60) return "bg-blue-100 text-blue-800 border-blue-200";
  if (score >= 40) return "bg-yellow-100 text-yellow-800 border-yellow-200";
  if (score >= 20) return "bg-orange-100 text-orange-800 border-orange-200";
  return "bg-red-100 text-red-800 border-red-200";
}

/**
 * Converts a percentile to clear language for a non-technical BA.
 * P75 -> "Top 25% du marché"
 */
export function formatPercentile(percentile: number): string {
  if (percentile >= 90) return "Top 10% du marché";
  if (percentile >= 75) return "Top 25% du marché";
  if (percentile >= 50) return "Au-dessus de la médiane";
  if (percentile >= 25) return "En-dessous de la médiane";
  return "Bas 25% du marché";
}

/**
 * Short version for compact spaces
 */
export function formatPercentileShort(percentile: number): string {
  if (percentile >= 90) return "Top 10%";
  if (percentile >= 75) return "Top 25%";
  if (percentile >= 50) return "> Médiane";
  if (percentile >= 25) return "< Médiane";
  return "Bas 25%";
}
