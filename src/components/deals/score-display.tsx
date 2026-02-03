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
    team: number | null;
    market: number | null;
    product: number | null;
    financials: number | null;
  };
}

export const ScoreGrid = React.memo(function ScoreGrid({ scores }: ScoreGridProps) {
  return (
    <div className="space-y-4">
      <ScoreDisplay label="Score Global" score={scores.global} size="lg" />
      <div className="grid grid-cols-2 gap-4 pt-2 border-t">
        <ScoreDisplay label="Equipe" score={scores.team} size="sm" />
        <ScoreDisplay label="Marche" score={scores.market} size="sm" />
        <ScoreDisplay label="Produit" score={scores.product} size="sm" />
        <ScoreDisplay label="Financiers" score={scores.financials} size="sm" />
      </div>
    </div>
  );
});
