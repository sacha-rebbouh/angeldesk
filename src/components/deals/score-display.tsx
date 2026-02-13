"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { getScoreColor } from "@/lib/format-utils";

interface ScoreDisplayProps {
  label: string;
  score: number | null;
  maxScore?: number;
  size?: "sm" | "md" | "lg";
  showBar?: boolean;
}

function getBarColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-blue-500";
  if (score >= 40) return "bg-yellow-500";
  if (score >= 20) return "bg-orange-500";
  return "bg-red-500";
}

export const ScoreDisplay = React.memo(function ScoreDisplay({
  label,
  score,
  maxScore = 100,
  size = "md",
  showBar = true,
}: ScoreDisplayProps) {
  const displayScore = score ?? 0;
  const percentage = (displayScore / maxScore) * 100;

  const sizeClasses = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg",
  };

  const scoreSizeClasses = {
    sm: "text-lg font-semibold",
    md: "text-2xl font-bold",
    lg: "text-4xl font-bold",
  };

  if (score === null) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className={cn("text-muted-foreground", sizeClasses[size])}>
            {label}
          </span>
          <span className={cn("text-muted-foreground", sizeClasses[size])}>
            -
          </span>
        </div>
        {showBar && (
          <div className="h-2 rounded-full bg-muted" />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className={cn("text-muted-foreground", sizeClasses[size])}>
          {label}
        </span>
        <span className={cn(getScoreColor(displayScore), scoreSizeClasses[size])}>
          {displayScore}
          <span className="text-muted-foreground text-sm font-normal">/{maxScore}</span>
        </span>
      </div>
      {showBar && (
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", getBarColor(displayScore))}
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

export const ScoreGrid = React.memo(function ScoreGrid({ scores, stage }: ScoreGridProps) {
  return (
    <div className="space-y-4">
      <ScoreDisplay label="Score Final" score={scores.global} size="lg" />

      {scores.fundamentals != null && (
        <div className="rounded-lg bg-muted/50 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              Fondamentaux
              {stage && <span className="text-xs ml-1">({getStageFrench(stage)}-relative)</span>}
            </span>
            <span className="font-semibold">
              {scores.fundamentals}/100
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 pt-2 border-t">
        <ScoreDisplay label="Equipe" score={scores.team} size="sm" />
        <ScoreDisplay label="Marche" score={scores.market} size="sm" />
        <ScoreDisplay label="Produit" score={scores.product} size="sm" />
        <ScoreDisplay label="Financiers" score={scores.financials} size="sm" />
        <div className="col-span-2">
          <ScoreDisplay label="Conditions" score={scores.conditions ?? null} size="sm" />
        </div>
      </div>
    </div>
  );
});
