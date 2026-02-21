"use client";

import { useMemo, memo } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface DeltaIndicatorProps {
  currentValue: number;
  previousValue: number;
  unit?: string;
  showPercentage?: boolean;
}

export const DeltaIndicator = memo(function DeltaIndicator({
  currentValue,
  previousValue,
  unit = "",
  showPercentage = false,
}: DeltaIndicatorProps) {
  const delta = useMemo(() => {
    const absoluteDelta = currentValue - previousValue;
    const percentageDelta =
      previousValue !== 0
        ? ((currentValue - previousValue) / Math.abs(previousValue)) * 100
        : 0;

    return {
      absolute: absoluteDelta,
      percentage: percentageDelta,
      isPositive: absoluteDelta > 0,
      isNegative: absoluteDelta < 0,
      isZero: absoluteDelta === 0,
    };
  }, [currentValue, previousValue]);

  // Don't render anything if there's no change
  if (delta.isZero) {
    return null;
  }

  const formatNumber = (value: number): string => {
    const absValue = Math.abs(value);
    if (absValue >= 1000000) {
      return `${(absValue / 1000000).toFixed(1)}M`;
    }
    if (absValue >= 1000) {
      return `${(absValue / 1000).toFixed(1)}K`;
    }
    if (Number.isInteger(absValue)) {
      return absValue.toString();
    }
    return absValue.toFixed(1);
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        delta.isPositive && "text-green-600",
        delta.isNegative && "text-red-600"
      )}
    >
      {delta.isPositive ? (
        <ArrowUp className="h-3 w-3" />
      ) : (
        <ArrowDown className="h-3 w-3" />
      )}
      <span>
        {delta.isPositive ? "+" : "-"}
        {formatNumber(delta.absolute)}
        {unit && <span>{unit}</span>}
        {showPercentage && previousValue !== 0 && (
          <span className="ml-1 text-muted-foreground">
            ({delta.isPositive ? "+" : ""}
            {delta.percentage.toFixed(1)}%)
          </span>
        )}
      </span>
    </span>
  );
});
