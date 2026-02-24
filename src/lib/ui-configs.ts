/**
 * Centralized UI configuration constants.
 * Single source of truth for severity styles, colors, and labels.
 */

// =============================================================================
// Severity Styles — used by red-flags-summary, early-warnings, tier3-results
// =============================================================================

export const SEVERITY_STYLES: Record<string, {
  bg: string;
  border: string;
  text: string;
  icon: string;
  badge: string;
  label: string;
}> = {
  CRITICAL: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-800",
    icon: "text-red-600",
    badge: "bg-red-100 text-red-800 border-red-300",
    label: "Critique",
  },
  HIGH: {
    bg: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-800",
    icon: "text-orange-500",
    badge: "bg-orange-100 text-orange-800 border-orange-300",
    label: "Élevé",
  },
  MEDIUM: {
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    text: "text-yellow-800",
    icon: "text-yellow-500",
    badge: "bg-yellow-100 text-yellow-800 border-yellow-300",
    label: "Moyen",
  },
  LOW: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-800",
    icon: "text-blue-400",
    badge: "bg-blue-100 text-blue-800 border-blue-300",
    label: "Bas",
  },
};

/** Sorting order for severity levels (lower = more severe) */
export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

/**
 * Get severity style by key (case-insensitive).
 * Falls back to MEDIUM if key not found.
 */
export function getSeverityStyle(severity: string) {
  return SEVERITY_STYLES[severity.toUpperCase()] ?? SEVERITY_STYLES.MEDIUM;
}

// =============================================================================
// Score Thresholds — canonical scale used across the app
// =============================================================================

/**
 * Canonical score color mapping.
 * Use this everywhere for consistent score coloring.
 */
export function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-blue-600";
  if (score >= 40) return "text-yellow-600";
  if (score >= 20) return "text-orange-600";
  return "text-red-600";
}

/**
 * Canonical score label mapping.
 * Aligned with score-badge.tsx SCORE_SCALE.
 */
export function getScoreLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Solide";
  if (score >= 40) return "À approfondir";
  if (score >= 20) return "Points d'attention";
  return "Zone d'alerte";
}

/**
 * Canonical score bar color mapping (for progress bars).
 */
export function getScoreBarColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-blue-500";
  if (score >= 40) return "bg-yellow-500";
  if (score >= 20) return "bg-orange-500";
  return "bg-red-500";
}

// =============================================================================
// Recommendation Config — centralized for verdict-panel & tier3-results
// =============================================================================

export const RECOMMENDATION_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  invest: { label: "Signaux favorables", color: "text-green-800", bg: "bg-green-50 border-green-300" },
  strong_invest: { label: "Signaux favorables", color: "text-green-800", bg: "bg-green-50 border-green-300" },
  negotiate: { label: "Signaux contrastés", color: "text-amber-800", bg: "bg-amber-50 border-amber-300" },
  conditional_invest: { label: "Signaux contrastés", color: "text-amber-800", bg: "bg-amber-50 border-amber-300" },
  wait: { label: "Investigation complémentaire", color: "text-blue-800", bg: "bg-blue-50 border-blue-300" },
  pass: { label: "Signaux d'alerte dominants", color: "text-red-800", bg: "bg-red-50 border-red-300" },
  strong_pass: { label: "Signaux d'alerte dominants", color: "text-red-800", bg: "bg-red-50 border-red-300" },
  no_go: { label: "Signaux d'alerte dominants", color: "text-red-800", bg: "bg-red-50 border-red-300" },
};

// Verdict Config — maps synthesis scorer verdict values to badge display
// Used by tier3-results VerdictBadge
export const VERDICT_CONFIG: Record<string, { label: string; color: string }> = {
  strong_pass: { label: "Signaux très favorables", color: "bg-green-100 text-green-800 border-green-300" },
  pass: { label: "Signaux favorables", color: "bg-blue-100 text-blue-800 border-blue-300" },
  conditional_pass: { label: "Signaux contrastés", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  weak_pass: { label: "Vigilance requise", color: "bg-orange-100 text-orange-800 border-orange-300" },
  no_go: { label: "Signaux d'alerte dominants", color: "bg-red-100 text-red-800 border-red-300" },
  // Aliases for recommendation keys that might appear as verdict
  invest: { label: "Signaux très favorables", color: "bg-green-100 text-green-800 border-green-300" },
  strong_invest: { label: "Signaux très favorables", color: "bg-green-100 text-green-800 border-green-300" },
  negotiate: { label: "Signaux contrastés", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  conditional_invest: { label: "Signaux contrastés", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  wait: { label: "Vigilance requise", color: "bg-orange-100 text-orange-800 border-orange-300" },
};

// Alert Signal Labels — analytical framing (no prescriptive language)
export const ALERT_SIGNAL_LABELS: Record<string, string> = {
  STOP: "ANOMALIE MAJEURE",
  INVESTIGATE_FURTHER: "INVESTIGATION REQUISE",
  PROCEED_WITH_CAUTION: "POINTS D'ATTENTION",
  PROCEED: "CONFORME",
};

// Readiness Labels — analytical framing
export const READINESS_LABELS: Record<string, string> = {
  READY_TO_INVEST: "Données suffisantes",
  NEEDS_MORE_DD: "Investigation complémentaire",
  SIGNIFICANT_CONCERNS: "Points d'attention majeurs",
  DO_NOT_PROCEED: "Alertes critiques",
};
