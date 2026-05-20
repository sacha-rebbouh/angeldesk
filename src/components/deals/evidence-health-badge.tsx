"use client";

/**
 * Phase 8 — Per-document evidence health badge.
 *
 * Renders a single compact badge summarising the worst evidence-health issue
 * affecting a document (contradictions / missing kinds / freshness kinds).
 * Hover shows the breakdown. Tone analytical — describes signals, not actions.
 */
import { memo, useMemo } from "react";
import { AlertTriangle, AlertCircle, Info, CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DocumentHealthSummary, EvidenceHealthSeverity } from "@/services/evidence";

interface EvidenceHealthBadgeProps {
  summary: DocumentHealthSummary | undefined;
  /** Compact mode for tight rows. */
  compact?: boolean;
}

const SEVERITY_RANK: Record<EvidenceHealthSeverity, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

const MISSING_LABEL: Record<string, string> = {
  NO_CAP_TABLE_AS_OF: "cap table sans date",
  NO_FINANCIAL_STATEMENTS: "pas de bilan",
  NO_FORECAST_PERIOD: "forecast non daté",
  NO_PITCH_DECK_DATE: "deck non daté",
};

const FRESHNESS_LABEL: Record<string, string> = {
  cap_table_stale: "cap table périmée",
  balance_sheet_stale: "bilan périmé",
  forecast_now_historical: "forecast entamé",
};

export const EvidenceHealthBadge = memo(function EvidenceHealthBadge({
  summary,
  compact = false,
}: EvidenceHealthBadgeProps) {
  const verdict = useMemo(() => deriveVerdict(summary), [summary]);
  if (!verdict) return null;

  const Icon = verdict.icon;
  return (
    <Badge
      variant="outline"
      className={cn("gap-1", verdict.className)}
      title={verdict.tooltip}
    >
      <Icon className="h-3 w-3" />
      {compact ? verdict.shortLabel : verdict.longLabel}
    </Badge>
  );
});

interface BadgeVerdict {
  icon: typeof AlertTriangle;
  className: string;
  shortLabel: string;
  longLabel: string;
  tooltip: string;
}

function deriveVerdict(summary: DocumentHealthSummary | undefined): BadgeVerdict | null {
  if (!summary) return null;
  const hasFindings =
    summary.contradictionCount > 0 ||
    summary.missing.length > 0 ||
    summary.freshness.length > 0;
  if (!hasFindings) return null;

  // Codex round 24 P1 — compute the REAL max severity across all 3 finding
  // sources. Previously missing/freshness were defaulted to MEDIUM regardless
  // of their per-finding severity, which masked both genuine HIGHs (e.g.
  // `cap_table_stale high` should be red) and genuine LOWs (e.g.
  // `NO_PITCH_DECK_DATE low` should be slate, not amber).
  const ranks: number[] = [];
  if (summary.highestContradictionSeverity) {
    ranks.push(SEVERITY_RANK[summary.highestContradictionSeverity]);
  }
  for (const m of summary.missing) ranks.push(SEVERITY_RANK[m.severity]);
  for (const f of summary.freshness) ranks.push(SEVERITY_RANK[f.severity]);
  const effectiveRank = ranks.length > 0 ? Math.max(...ranks) : 0;

  const tooltipParts: string[] = [];
  if (summary.contradictionCount > 0) {
    tooltipParts.push(
      `${summary.contradictionCount} contradiction${summary.contradictionCount > 1 ? "s" : ""}` +
        (summary.highestContradictionSeverity ? ` (${summary.highestContradictionSeverity})` : "")
    );
  }
  if (summary.missing.length > 0) {
    tooltipParts.push(
      `Manquant : ${summary.missing.map((m) => `${MISSING_LABEL[m.kind] ?? m.kind} (${m.severity})`).join(", ")}`
    );
  }
  if (summary.freshness.length > 0) {
    tooltipParts.push(
      `Fraîcheur : ${summary.freshness.map((f) => `${FRESHNESS_LABEL[f.kind] ?? f.kind} (${f.severity})`).join(", ")}`
    );
  }
  const labels = deriveLabels(summary);

  // Visual tier
  if (effectiveRank >= 3) {
    return {
      icon: AlertTriangle,
      className: "border-red-300 bg-red-50 text-red-700",
      shortLabel: labels.shortLabel,
      longLabel: labels.longLabel,
      tooltip: tooltipParts.join(" · "),
    };
  }
  if (effectiveRank === 2) {
    // Freshness-only → use clock icon; otherwise generic warning.
    const freshnessOnly =
      summary.contradictionCount === 0 &&
      summary.missing.length === 0 &&
      summary.freshness.length > 0;
    return {
      icon: freshnessOnly ? CalendarClock : AlertCircle,
      className: "border-amber-300 bg-amber-50 text-amber-700",
      shortLabel: labels.shortLabel,
      longLabel: labels.longLabel,
      tooltip: tooltipParts.join(" · "),
    };
  }
  return {
    icon: Info,
    className: "border-slate-300 bg-slate-50 text-slate-700",
    shortLabel: labels.shortLabel,
    longLabel: labels.longLabel,
    tooltip: tooltipParts.join(" · "),
  };
}

function deriveLabels(summary: DocumentHealthSummary): Pick<BadgeVerdict, "shortLabel" | "longLabel"> {
  if (summary.contradictionCount > 0) {
    return {
      shortLabel: "Contradiction",
      longLabel: "Contradiction détectée",
    };
  }

  if (summary.freshness.some((f) => f.kind === "forecast_now_historical")) {
    return {
      shortLabel: "Prévision",
      longLabel: "Prévision à actualiser",
    };
  }

  if (summary.freshness.length > 0) {
    return {
      shortLabel: "Fraîcheur",
      longLabel: "Fraîcheur à vérifier",
    };
  }

  if (summary.missing.length > 0) {
    return {
      shortLabel: "Manquant",
      longLabel: "Évidence manquante",
    };
  }

  return {
    shortLabel: "Signal",
    longLabel: "Signal evidence",
  };
}

// Re-export for tests so callers can derive verdicts without rendering.
export { deriveVerdict as __deriveEvidenceBadgeVerdict };
