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
  very_favorable: { label: "Signaux très favorables", color: "text-green-800", bg: "bg-green-50 border-green-300" },
  favorable: { label: "Signaux favorables", color: "text-green-800", bg: "bg-green-50 border-green-300" },
  contrasted: { label: "Signaux contrastés", color: "text-amber-800", bg: "bg-amber-50 border-amber-300" },
  vigilance: { label: "Vigilance requise", color: "text-blue-800", bg: "bg-blue-50 border-blue-300" },
  alert_dominant: { label: "Signaux d'alerte dominants", color: "text-red-800", bg: "bg-red-50 border-red-300" },
};

// Verdict Config — maps synthesis scorer verdict values to badge display
// Used by tier3-results VerdictBadge
export const VERDICT_CONFIG: Record<string, { label: string; color: string }> = {
  very_favorable: { label: "Signaux très favorables", color: "bg-green-100 text-green-800 border-green-300" },
  favorable: { label: "Signaux favorables", color: "bg-blue-100 text-blue-800 border-blue-300" },
  contrasted: { label: "Signaux contrastés", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  vigilance: { label: "Vigilance requise", color: "bg-orange-100 text-orange-800 border-orange-300" },
  alert_dominant: { label: "Signaux d'alerte dominants", color: "bg-red-100 text-red-800 border-red-300" },
};

// Thesis Verdict Config — thesis-first (Tier 0.5). Meme mapping que RECOMMENDATION_CONFIG
// mais avec libelles orientes "these" pour clarifier la distinction entre verdict these
// (jugement structurel de la promesse de la societe) et verdict global (score final).
export const THESIS_VERDICT_CONFIG: Record<string, { label: string; shortLabel: string; color: string; bg: string; description: string }> = {
  very_favorable: {
    label: "Thèse très solide",
    shortLabel: "Très solide",
    color: "text-green-800",
    bg: "bg-green-50 border-green-300",
    description: "Les 3 frameworks convergent. Hypotheses porteuses majoritairement verifiees.",
  },
  favorable: {
    label: "Thèse solide",
    shortLabel: "Solide",
    color: "text-green-800",
    bg: "bg-green-50 border-green-300",
    description: "Les 3 frameworks s'alignent avec quelques reserves mineures.",
  },
  contrasted: {
    label: "Thèse contrastée",
    shortLabel: "Contrastée",
    color: "text-amber-800",
    bg: "bg-amber-50 border-amber-300",
    description: "Les frameworks divergent. Points d'attention a clarifier avant decision.",
  },
  vigilance: {
    label: "Thèse fragile",
    shortLabel: "Fragile",
    color: "text-blue-800",
    bg: "bg-blue-50 border-blue-300",
    description: "Plusieurs hypotheses porteuses speculatives. Vigilance requise.",
  },
  alert_dominant: {
    label: "Thèse non validée",
    shortLabel: "Non validée",
    color: "text-red-800",
    bg: "bg-red-50 border-red-300",
    description: "Signaux d'alerte dominants sur la these structurelle. Score global masque.",
  },
};

// Alert Signal Labels — analytical framing (no prescriptive language)
export const ALERT_SIGNAL_LABELS: Record<string, string> = {
  // New signal profile keys
  alert_dominant: "ANOMALIE MAJEURE",
  vigilance: "INVESTIGATION REQUISE",
  contrasted: "POINTS D'ATTENTION",
  favorable: "CONFORME",
  very_favorable: "CONFORME",
  // Legacy keys for backward compatibility
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

// =============================================================================
// Enum FR Labels — centralized translations for agent output enums
// English business terms (Burn Rate, ARR, Churn) stay in EN with tooltips
// =============================================================================

/** Burn efficiency labels */
export const BURN_EFFICIENCY_LABELS: Record<string, string> = {
  EFFICIENT: "Efficace",
  MODERATE: "Modéré",
  INEFFICIENT: "Inefficace",
};

/** Competitive moat labels */
export const MOAT_LABELS: Record<string, string> = {
  STRONG_MOAT: "Fort avantage concurrentiel",
  MODERATE_MOAT: "Avantage modéré",
  WEAK_MOAT: "Avantage faible",
  NO_MOAT: "Pas d'avantage identifié",
  NARROW_MOAT: "Avantage étroit",
};

/** Product-market fit labels */
export const PMF_LABELS: Record<string, string> = {
  STRONG: "Fort",
  MODERATE: "Modéré",
  WEAK: "Faible",
  EARLY: "Précoce",
  NONE: "Non identifié",
};

/** Channel diversification labels */
export const DIVERSIFICATION_LABELS: Record<string, string> = {
  HIGH: "Élevée",
  MODERATE: "Modérée",
  LOW: "Faible",
  DIVERSIFIED: "Diversifié",
  CONCENTRATED: "Concentré",
};

/** Concentration level labels */
export const CONCENTRATION_LABELS: Record<string, string> = {
  LOW: "Faible",
  MODERATE: "Modérée",
  HIGH: "Élevée",
  CRITICAL: "Critique",
};

/** Generic level/strength labels */
export const LEVEL_LABELS: Record<string, string> = {
  HIGH: "Élevé",
  MODERATE: "Modéré",
  LOW: "Faible",
  STRONG: "Fort",
  WEAK: "Faible",
  CRITICAL: "Critique",
  NONE: "Aucun",
};

/**
 * Get FR label for any enum value.
 * Falls back to the original value with underscores replaced by spaces.
 */
export function getEnumLabel(value: string, labels?: Record<string, string>): string {
  if (labels && value in labels) return labels[value];
  if (value in LEVEL_LABELS) return LEVEL_LABELS[value];
  return value.replace(/_/g, " ");
}
