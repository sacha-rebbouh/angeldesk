"use client";

import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CheckCircle, ShieldCheck, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ResolutionBadgeProps {
  status: "RESOLVED" | "ACCEPTED";
  justification: string;
  onRevert?: () => void;
  compact?: boolean;
}

export const ResolutionBadge = memo(function ResolutionBadge({
  status,
  justification,
  onRevert,
  compact = false,
}: ResolutionBadgeProps) {
  const isResolved = status === "RESOLVED";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              "text-xs gap-1 cursor-help",
              isResolved
                ? "bg-green-50 text-green-700 border-green-200"
                : "bg-blue-50 text-blue-700 border-blue-200",
            )}
          >
            {isResolved ? (
              <CheckCircle className="h-3 w-3" />
            ) : (
              <ShieldCheck className="h-3 w-3" />
            )}
            {!compact && (isResolved ? "Resolu" : "Accepte")}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="font-medium mb-1">
            {isResolved ? "Alerte resolue" : "Risque accepte"}
          </p>
          <p className="text-sm text-muted-foreground">{justification}</p>
          {onRevert && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRevert();
              }}
              className="flex items-center gap-1 text-xs text-red-600 mt-2 hover:underline"
            >
              <Undo2 className="h-3 w-3" /> Reouvrir l&apos;alerte
            </button>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
