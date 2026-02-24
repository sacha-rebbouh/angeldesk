"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { getScoreColor } from "@/lib/format-utils";
import { ScoreRing } from "@/components/ui/score-ring";

interface ScoreDisplayProps {
  label: string;
  score: number | null;
  maxScore?: number;
  size?: "sm" | "md" | "lg";
  showBar?: boolean;
}

function getBarGradient(score: number): string {
  if (score >= 80) return "from-emerald-500 to-emerald-400";
  if (score >= 60) return "from-blue-500 to-blue-400";
  if (score >= 40) return "from-amber-500 to-amber-400";
  if (score >= 20) return "from-orange-500 to-orange-400";
  return "from-red-500 to-red-400";
}

function getBarBg(score: number): string {
  if (score >= 80) return "bg-emerald-500/10";
  if (score >= 60) return "bg-blue-500/10";
  if (score >= 40) return "bg-amber-500/10";
  if (score >= 20) return "bg-orange-500/10";
  return "bg-red-500/10";
}

const ScoreDisplay = React.memo(function ScoreDisplay({
  label,
  score,
  maxScore = 100,
  size = "md",
  showBar = true,
}: ScoreDisplayProps) {
  const displayScore = score ?? 0;
  const percentage = (displayScore / maxScore) * 100;

  const sizeClasses = {
    sm: "text-[13px]",
    md: "text-sm",
    lg: "text-base",
  };

  const scoreSizeClasses = {
    sm: "text-base font-bold",
    md: "text-xl font-bold",
    lg: "text-3xl font-bold",
  };

  if (score === null) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className={cn("text-muted-foreground font-medium", sizeClasses[size])}>
            {label}
          </span>
          <span className={cn("text-muted-foreground/50", sizeClasses[size])}>
            --
          </span>
        </div>
        {showBar && (
          <div className="h-1.5 rounded-full bg-muted/50" />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className={cn("text-foreground/65 font-medium", sizeClasses[size])}>
          {label}
        </span>
        <span className={cn(getScoreColor(displayScore), scoreSizeClasses[size], "tabular-nums tracking-tight")}>
          {displayScore}
          <span className="text-muted-foreground/40 text-xs font-normal ml-0.5">/{maxScore}</span>
        </span>
      </div>
      {showBar && (
        <div className={cn("h-1.5 rounded-full overflow-hidden", getBarBg(displayScore))}>
          <div
            className={cn(
              "h-full rounded-full bg-gradient-to-r transition-all duration-700 ease-out",
              getBarGradient(displayScore),
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  );
});

interface ScoreGridProps {
  scores: {
    global: number | null;
    fundamentals?: number | null;
    conditions?: number | null;
    team: number | null;
    market: number | null;
    product: number | null;
    financials: number | null;
  };
  stage?: string | null;
}

function getStageFrench(stage: string | null | undefined): string {
  const map: Record<string, string> = {
    PRE_SEED: "Pre-Seed",
    SEED: "Seed",
    SERIES_A: "Series A",
    SERIES_B: "Series B",
    SERIES_C: "Series C",
    LATER: "Later",
  };
  return stage ? (map[stage] ?? stage) : "";
}

// ScoreRing replaced by shared ScoreRing from @/components/ui/score-ring

export const ScoreGrid = React.memo(function ScoreGrid({ scores, stage }: ScoreGridProps) {
  return (
    <div className="space-y-5">
      {/* Global score - hero display */}
      <div className="flex items-center gap-5">
        {scores.global != null && (
          <ScoreRing score={scores.global} size={64} strokeWidth={3} />
        )}
        <div className="flex-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Score Final
          </div>
          <div className={cn("text-2xl font-bold tabular-nums tracking-tight", scores.global != null ? getScoreColor(scores.global) : "text-muted-foreground")}>
            {scores.global ?? "--"}<span className="text-muted-foreground/40 text-sm font-normal">/100</span>
          </div>
        </div>
      </div>

      {/* Fundamentals */}
      {scores.fundamentals != null && (
        <div className="rounded-lg bg-foreground/[0.03] border border-border/40 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-foreground/60 font-medium">
              Fondamentaux
              {stage && <span className="text-[11px] ml-1.5 text-muted-foreground/60">({getStageFrench(stage)}-relative)</span>}
            </span>
            <span className="text-sm font-bold tabular-nums">
              {scores.fundamentals}/100
            </span>
          </div>
        </div>
      )}

      {/* Sub-scores grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 pt-4 border-t border-border/40">
        <ScoreDisplay label="Équipe" score={scores.team} size="sm" />
        <ScoreDisplay label="Marché" score={scores.market} size="sm" />
        <ScoreDisplay label="Produit" score={scores.product} size="sm" />
        <ScoreDisplay label="Financiers" score={scores.financials} size="sm" />
        <div className="col-span-2">
          <ScoreDisplay label="Conditions" score={scores.conditions ?? null} size="sm" />
        </div>
      </div>
    </div>
  );
});
