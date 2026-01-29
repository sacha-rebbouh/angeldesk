"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";
import { getScoreBadgeColor } from "@/lib/format-utils";

interface ScoreBadgeProps {
  score: number;
  size?: "sm" | "md" | "lg";
}

const SIZE_CLASSES = {
  sm: "text-xs px-2 py-0.5",
  md: "text-sm px-2.5 py-1",
  lg: "text-lg px-3 py-1.5 font-bold",
} as const;

export const ScoreBadge = memo(function ScoreBadge({
  score,
  size = "md"
}: ScoreBadgeProps) {
  return (
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
});

ScoreBadge.displayName = "ScoreBadge";
