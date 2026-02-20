/**
 * Adjusted Score Calculation — Dynamic, not hardcoded.
 *
 * Computes an adjusted deal score based on BA resolutions.
 * RESOLVED alerts give full credit back, ACCEPTED alerts give partial credit.
 * Weights are in a config object — easy to tweak.
 */

// Configurable weights — points recovered per severity level (uppercase keys only)
const SEVERITY_WEIGHT: Record<string, number> = {
  CRITICAL: 8,
  HIGH: 5,
  MEDIUM: 3,
  LOW: 1,
};

/** Map French severity labels to English canonical keys */
const SEVERITY_ALIASES: Record<string, string> = {
  CRITIQUE: "CRITICAL",
  ELEVE: "HIGH",
  ELEVEE: "HIGH",
  MOYEN: "MEDIUM",
  MOYENNE: "MEDIUM",
  FAIBLE: "LOW",
  BAS: "LOW",
  BASSE: "LOW",
};

/** Normalize severity string to uppercase, accent-stripped key for lookup */
function normalizeSeverityKey(s: string): string {
  const key = s.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return SEVERITY_ALIASES[key] ?? key;
}

// Resolution status multiplier
const STATUS_CREDIT: Record<string, number> = {
  RESOLVED: 1.0,  // Full credit — issue is gone
  ACCEPTED: 0.5,  // Partial credit — risk acknowledged but still present
};

export interface ScoreAdjustment {
  alertKey: string;
  alertTitle: string;
  status: "RESOLVED" | "ACCEPTED";
  severity: string;
  pointsRecovered: number;
}

export interface AdjustedScoreResult {
  originalScore: number;
  adjustedScore: number;
  delta: number;
  adjustments: ScoreAdjustment[];
  explanation: string;
}

interface ResolutionInput {
  alertKey: string;
  alertTitle: string;
  status: string;
  alertSeverity: string;
}

export function computeAdjustedScore(
  originalScore: number,
  resolutions: ResolutionInput[],
): AdjustedScoreResult {
  const adjustments: ScoreAdjustment[] = [];
  let totalRecovered = 0;

  for (const r of resolutions) {
    const severityWeight = SEVERITY_WEIGHT[normalizeSeverityKey(r.alertSeverity)] ?? 2;
    const statusCredit = STATUS_CREDIT[r.status] ?? 0.5;
    const pointsRecovered = Math.round(severityWeight * statusCredit);

    if (pointsRecovered > 0) {
      adjustments.push({
        alertKey: r.alertKey,
        alertTitle: r.alertTitle,
        status: r.status as "RESOLVED" | "ACCEPTED",
        severity: r.alertSeverity,
        pointsRecovered,
      });
      totalRecovered += pointsRecovered;
    }
  }

  const adjustedScore = Math.min(100, originalScore + totalRecovered);

  // Build French explanation
  const resolvedCount = adjustments.filter(a => a.status === "RESOLVED").length;
  const acceptedCount = adjustments.filter(a => a.status === "ACCEPTED").length;
  const parts: string[] = [];
  if (resolvedCount > 0) {
    parts.push(`${resolvedCount} alerte${resolvedCount > 1 ? "s" : ""} resolue${resolvedCount > 1 ? "s" : ""}`);
  }
  if (acceptedCount > 0) {
    parts.push(`${acceptedCount} risque${acceptedCount > 1 ? "s" : ""} accepte${acceptedCount > 1 ? "s" : ""}`);
  }
  const explanation = adjustments.length === 0
    ? "Score IA original (aucune resolution)"
    : `Score ajuste : ${parts.join(", ")} — +${totalRecovered} pt${totalRecovered > 1 ? "s" : ""}`;

  return {
    originalScore,
    adjustedScore,
    delta: totalRecovered,
    adjustments,
    explanation,
  };
}
