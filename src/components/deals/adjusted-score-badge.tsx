"use client";

import { memo, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TrendingUp } from "lucide-react";
import { computeAdjustedScore } from "@/services/alert-resolution/adjusted-score";
import type { AlertResolution } from "@/hooks/use-resolutions";

interface AdjustedScoreBadgeProps {
  originalScore: number;
  resolutions: AlertResolution[];
}

export const AdjustedScoreBadge = memo(function AdjustedScoreBadge({
  originalScore,
  resolutions,
}: AdjustedScoreBadgeProps) {
  const result = useMemo(
    () => computeAdjustedScore(originalScore, resolutions),
    [originalScore, resolutions],
  );

  if (result.delta === 0) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1 cursor-help">
            <TrendingUp className="h-3 w-3" />
            Ajuste : {result.adjustedScore}/100
            <span className="text-green-500 text-[10px]">+{result.delta}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-sm">
          <p className="font-medium mb-2">{result.explanation}</p>
          <div className="space-y-1">
            {result.adjustments.map((adj) => (
              <div key={adj.alertKey} className="text-xs flex items-center justify-between gap-2">
                <span className="truncate">{adj.alertTitle}</span>
                <span className="text-green-600 shrink-0">+{adj.pointsRecovered}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 pt-2 border-t">
            Score IA original : {result.originalScore}/100
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
