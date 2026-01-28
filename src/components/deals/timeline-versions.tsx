"use client";

import { useMemo, useCallback } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AnalysisVersion {
  id: string;
  version: number;
  completedAt: Date;
  score: number;
  triggerType: "INITIAL" | "UPDATE";
}

interface TimelineVersionsProps {
  analyses: AnalysisVersion[];
  currentAnalysisId: string;
  onSelectVersion: (id: string) => void;
}

const MAX_VISIBLE_VERSIONS = 3;

export function TimelineVersions({
  analyses,
  currentAnalysisId,
  onSelectVersion,
}: TimelineVersionsProps) {
  // Sort by version descending and take max 3 most recent
  const visibleAnalyses = useMemo(() => {
    return [...analyses]
      .sort((a, b) => b.version - a.version)
      .slice(0, MAX_VISIBLE_VERSIONS)
      .reverse(); // Display oldest to newest (left to right)
  }, [analyses]);

  const handleSelectVersion = useCallback(
    (id: string) => {
      onSelectVersion(id);
    },
    [onSelectVersion]
  );

  if (visibleAnalyses.length === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className="flex items-center justify-center py-4">
        <div className="flex items-center gap-0">
          {visibleAnalyses.map((analysis, index) => {
            const isCurrent = analysis.id === currentAnalysisId;
            const isFirst = index === 0;
            const isLast = index === visibleAnalyses.length - 1;

            return (
              <div key={analysis.id} className="flex items-center">
                {/* Connector line before (except first) */}
                {!isFirst && (
                  <div className="w-8 sm:w-12 h-0.5 bg-muted-foreground/30" />
                )}

                {/* Version node */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => handleSelectVersion(analysis.id)}
                      className={cn(
                        "flex flex-col items-center gap-1 group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg p-2 transition-colors",
                        isCurrent ? "cursor-default" : "hover:bg-muted/50 cursor-pointer"
                      )}
                    >
                      {/* Circle node */}
                      <div
                        className={cn(
                          "w-4 h-4 rounded-full border-2 transition-all",
                          isCurrent
                            ? "bg-primary border-primary"
                            : "bg-background border-muted-foreground/50 group-hover:border-primary/70"
                        )}
                      />

                      {/* Version label */}
                      <span
                        className={cn(
                          "text-xs font-medium transition-colors",
                          isCurrent
                            ? "text-foreground"
                            : "text-muted-foreground group-hover:text-foreground"
                        )}
                      >
                        V{analysis.version}
                      </span>

                      {/* Date */}
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {format(new Date(analysis.completedAt), "dd MMM", {
                          locale: fr,
                        })}
                      </span>

                      {/* Score */}
                      <span
                        className={cn(
                          "text-xs font-semibold",
                          analysis.score >= 70
                            ? "text-green-600"
                            : analysis.score >= 50
                            ? "text-amber-600"
                            : "text-red-600"
                        )}
                      >
                        {analysis.score}/100
                      </span>

                      {/* Type badge */}
                      <Badge
                        variant={
                          analysis.triggerType === "INITIAL" ? "default" : "secondary"
                        }
                        className="text-[10px] px-1.5 py-0"
                      >
                        {analysis.triggerType === "INITIAL" ? "Initial" : "Update"}
                      </Badge>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <div className="text-center">
                      <p className="font-medium">
                        Version {analysis.version} -{" "}
                        {analysis.triggerType === "INITIAL"
                          ? "Analyse initiale"
                          : "Mise a jour"}
                      </p>
                      <p className="text-muted-foreground">
                        {format(
                          new Date(analysis.completedAt),
                          "d MMMM yyyy 'a' HH:mm",
                          { locale: fr }
                        )}
                      </p>
                      <p className="text-muted-foreground">Score: {analysis.score}/100</p>
                    </div>
                  </TooltipContent>
                </Tooltip>

                {/* Connector line after (except last) */}
                {!isLast && (
                  <div className="w-8 sm:w-12 h-0.5 bg-muted-foreground/30" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
