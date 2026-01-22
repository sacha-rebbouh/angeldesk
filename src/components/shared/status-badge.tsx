"use client";

import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusVariant = "success" | "warning" | "danger" | "info";

interface StatusBadgeProps {
  status: string;
  variant?: StatusVariant;
}

const VARIANT_COLORS: Record<StatusVariant, string> = {
  success: "bg-green-100 text-green-800",
  warning: "bg-yellow-100 text-yellow-800",
  danger: "bg-red-100 text-red-800",
  info: "bg-blue-100 text-blue-800",
};

export const StatusBadge = memo(function StatusBadge({
  status,
  variant
}: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(variant && VARIANT_COLORS[variant])}
    >
      {status}
    </Badge>
  );
});

StatusBadge.displayName = "StatusBadge";
