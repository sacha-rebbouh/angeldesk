"use client";

import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";
import { getScoreBadgeColor } from "@/lib/format-utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

interface ScoreBadgeProps {
  score: number;
  size?: "sm" | "md" | "lg";
  /** Optionnel: percentiles pour le contexte (P25, P50, P75) */
  percentiles?: { p25: number; p50: number; p75: number };
  /** F43: true si le LLM n'a pas retourné de score (fallback) */
  isFallback?: boolean;
}

const SIZE_CLASSES = {
  sm: "text-xs px-2 py-0.5",
  md: "text-sm px-2.5 py-1",
  lg: "text-lg px-3 py-1.5 font-bold",
} as const;

const SCORE_SCALE = [
  { min: 80, label: "Excellent", color: "bg-green-500" },
  { min: 60, label: "Bon", color: "bg-blue-500" },
  { min: 40, label: "Moyen", color: "bg-yellow-500" },
  { min: 20, label: "Faible", color: "bg-orange-500" },
  { min: 0,  label: "Critique", color: "bg-red-500" },
] as const;

function getScoreLabel(score: number): string {
  for (const s of SCORE_SCALE) {
    if (score >= s.min) return s.label;
  }
  return "Critique";
}

export const ScoreBadge = memo(function ScoreBadge({
  score,
  size = "md",
  percentiles,
  isFallback,
}: ScoreBadgeProps) {
  const label = useMemo(() => isFallback ? "Non disponible" : getScoreLabel(score), [score, isFallback]);

  if (isFallback) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "rounded-full border font-medium bg-muted text-muted-foreground",
                SIZE_CLASSES[size]
              )}
            >
              N/A
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="w-48 p-2">
            <p className="text-xs">Score non disponible — le modele n&apos;a pas retourne de valeur pour cette analyse.</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const badge = (
    <span
      className={cn(
        "rounded-full border font-medium",
        getScoreBadgeColor(score),
        SIZE_CLASSES[size]
      )}
    >
      {score}/100
    </span>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1.5 cursor-help">
            {badge}
            {size === "lg" && (
              <span className="text-xs font-normal text-muted-foreground">
                {label}
              </span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="w-64 p-3">
          {/* Score qualitatif */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">{score}/100 — {label}</span>
          </div>

          {/* Barre de position */}
          <div className="relative h-3 rounded-full bg-gradient-to-r from-red-400 via-yellow-400 to-green-400 mb-2">
            <div
              className="absolute top-0 w-1 h-3 bg-foreground rounded-full shadow-md"
              style={{ left: `${Math.min(98, Math.max(2, score))}%` }}
            />
          </div>

          {/* Echelle qualitative */}
          <div className="grid grid-cols-5 gap-0.5 text-center mb-2">
            {SCORE_SCALE.slice().reverse().map((s) => (
              <div
                key={s.min}
                className={cn(
                  "text-[10px] py-0.5 rounded",
                  score >= s.min && score < (SCORE_SCALE[SCORE_SCALE.indexOf(s) - 1]?.min ?? 101)
                    ? "bg-foreground/10 font-semibold"
                    : "text-muted-foreground"
                )}
              >
                {s.label}
              </div>
            ))}
          </div>

          {/* Percentiles contextuels si fournis */}
          {percentiles && (
            <div className="border-t pt-2 mt-1">
              <p className="text-[10px] text-muted-foreground mb-1">Position vs deals similaires :</p>
              <div className="relative h-2 rounded-full bg-muted">
                {/* P25 marker */}
                <div
                  className="absolute top-0 w-px h-2 bg-muted-foreground/40"
                  style={{ left: `${percentiles.p25}%` }}
                />
                {/* P50 marker */}
                <div
                  className="absolute top-0 w-px h-2 bg-muted-foreground/60"
                  style={{ left: `${percentiles.p50}%` }}
                />
                {/* P75 marker */}
                <div
                  className="absolute top-0 w-px h-2 bg-muted-foreground/40"
                  style={{ left: `${percentiles.p75}%` }}
                />
                {/* Current score */}
                <div
                  className="absolute -top-0.5 w-2 h-3 bg-primary rounded-full"
                  style={{ left: `${Math.min(98, Math.max(0, score))}%` }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
                <span>P25: {percentiles.p25}</span>
                <span>P50: {percentiles.p50}</span>
                <span>P75: {percentiles.p75}</span>
              </div>
            </div>
          )}

          {/* Legende echelle */}
          <p className="text-[10px] text-muted-foreground mt-1">
            80+ = Excellent | 60-79 = Bon | 40-59 = Moyen | 20-39 = Faible | 0-19 = Critique
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

ScoreBadge.displayName = "ScoreBadge";
