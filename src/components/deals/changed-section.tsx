"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type ChangeType = "improved" | "degraded" | "neutral";

interface ChangedSectionProps {
  children: ReactNode;
  isChanged?: boolean;
  isNew?: boolean;
  changeType?: ChangeType;
}

const changeStyles: Record<ChangeType, { bg: string; border: string }> = {
  improved: {
    bg: "bg-green-50",
    border: "border-l-green-500",
  },
  degraded: {
    bg: "bg-red-50",
    border: "border-l-red-500",
  },
  neutral: {
    bg: "bg-gray-50",
    border: "border-l-gray-400",
  },
};

export function ChangedSection({
  children,
  isChanged = false,
  isNew = false,
  changeType = "neutral",
}: ChangedSectionProps) {
  // New sections have specific styling
  if (isNew) {
    return (
      <div className="relative bg-green-50/70 border-l-4 border-l-green-500 rounded-r-lg pl-4 pr-3 py-3">
        <Badge
          variant="default"
          className="absolute -top-2 left-2 bg-green-600 text-[10px] px-1.5 py-0"
        >
          Nouveau
        </Badge>
        {children}
      </div>
    );
  }

  // Changed sections with type-specific styling
  if (isChanged) {
    const styles = changeStyles[changeType];
    return (
      <div
        className={cn(
          "border-l-4 rounded-r-lg pl-4 pr-3 py-3 transition-colors",
          styles.bg,
          styles.border
        )}
      >
        {children}
      </div>
    );
  }

  // No change - render children without wrapper styling
  return <>{children}</>;
}
