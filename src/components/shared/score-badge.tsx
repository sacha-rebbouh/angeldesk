"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number;
  size?: "sm" | "md" | "lg";
}

const SIZE_CLASSES = {
  sm: "text-xs px-2 py-0.5",
  md: "text-sm px-2.5 py-1",
  lg: "text-lg px-3 py-1.5 font-bold",
} as const;

function getScoreColor(score: number): string {
  if (score >= 80) return "bg-green-100 text-green-800 border-green-200";
  if (score >= 60) return "bg-blue-100 text-blue-800 border-blue-200";
  if (score >= 40) return "bg-yellow-100 text-yellow-800 border-yellow-200";
  if (score >= 20) return "bg-orange-100 text-orange-800 border-orange-200";
  return "bg-red-100 text-red-800 border-red-200";
}

export const ScoreBadge = memo(function ScoreBadge({
  score,
  size = "md"
}: ScoreBadgeProps) {
  return (
    <span
      className={cn(
        "rounded-full border font-medium",
        getScoreColor(score),
        SIZE_CLASSES[size]
      )}
    >
      {score}/100
    </span>
  );
});

ScoreBadge.displayName = "ScoreBadge";
