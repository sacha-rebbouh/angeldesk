"use client";

import { memo, useMemo } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
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

export const TimelineVersions = memo(function TimelineVersions({
  analyses,
  currentAnalysisId,
  onSelectVersion,
}: TimelineVersionsProps) {
  const sorted = useMemo(() => {
    return [...analyses].sort((a, b) => a.version - b.version);
  }, [analyses]);

  if (sorted.length === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className="py-1.5 overflow-x-auto">
        <div className="flex items-center gap-0 w-max mx-auto">
          {sorted.map((analysis, index) => {
            const isCurrent = analysis.id === currentAnalysisId;
            const isFirst = index === 0;
            const isLast = index === sorted.length - 1;

            return (
              <div key={analysis.id} className="flex items-center">
                {!isFirst && (
                  <div className="w-6 sm:w-10 h-0.5 bg-muted-foreground/30" />
                )}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onSelectVersion(analysis.id)}
                      className={cn(
                        "flex flex-col items-center gap-0.5 group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md px-2 py-1.5 transition-colors",
                        isCurrent ? "cursor-default bg-muted/50" : "hover:bg-muted/50 cursor-pointer"
                      )}
                    >
                      {/* Cercle + V label */}
                      <div className="flex items-center gap-1.5">
                        <div
                          className={cn(
                            "w-2.5 h-2.5 rounded-full border-2 transition-all flex-shrink-0",
                            isCurrent
                              ? "bg-primary border-primary"
                              : "bg-background border-muted-foreground/50 group-hover:border-primary/70"
                          )}
                        />
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
                        {analysis.score > 0 && (
                          <span
                            className={cn(
                              "text-xs font-semibold",
                              analysis.score >= 80
                                ? "text-green-600"
                                : analysis.score >= 60
                                ? "text-amber-600"
                                : "text-red-600"
                            )}
                          >
                            {analysis.score}
                          </span>
                        )}
                      </div>

                      {/* Date + heure en dessous */}
                      <span className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                        {format(new Date(analysis.completedAt), "dd MMM", { locale: fr })}
                      </span>
                      <span className="text-[10px] text-muted-foreground/70 leading-tight">
                        {format(new Date(analysis.completedAt), "HH:mm")}
                      </span>
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
                      {analysis.score > 0 && (
                        <p className="text-muted-foreground">Score: {analysis.score}/100</p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>

                {!isLast && (
                  <div className="w-6 sm:w-10 h-0.5 bg-muted-foreground/30" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
});
