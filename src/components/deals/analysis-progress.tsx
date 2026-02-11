"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Check, Loader2, XCircle } from "lucide-react";
import { formatAgentName } from "@/lib/format-utils";

// Timing configuration (in seconds)
// Realistic durations based on actual analysis times
// The last step is intentionally longer because it stays "running" until the analysis completes
const STEP_TIMINGS_PRO = {
  extraction: { duration: 15 }, // Document extraction ~15s
  tier1: { duration: 90 }, // 13 Tier1 agents in parallel ~90s
  tier2: { duration: 45 }, // Sector expert ~45s
  tier3: { duration: 60 }, // 5 Tier3 agents ~60s (will stay running until complete)
} as const;

const STEP_TIMINGS_FREE = {
  extraction: { duration: 15 }, // Document extraction ~15s
  investigation: { duration: 60 }, // Simplified investigation ~60s
  scoring: { duration: 30 }, // Basic scoring ~30s (will stay running until complete)
} as const;

export interface AgentStatus {
  agentName: string;
  status: "pending" | "running" | "completed" | "error";
  executionTimeMs?: number;
  error?: string;
}

export interface AnalysisProgressProps {
  isRunning: boolean;
  onComplete?: () => void;
  analysisType?: "tier1_complete" | "full_analysis";
  agentStatuses?: AgentStatus[];
}

interface StepConfig {
  id: string;
  label: string;
  duration: number;
}

export function AnalysisProgress({
  isRunning,
  analysisType = "full_analysis",
  agentStatuses,
}: AnalysisProgressProps) {
  // Build steps based on analysis type (FREE vs PRO)
  const steps = useMemo<StepConfig[]>(() => {
    if (analysisType === "tier1_complete") {
      // FREE plan - 3 steps
      return [
        {
          id: "extraction",
          label: "Extraction des documents",
          duration: STEP_TIMINGS_FREE.extraction.duration,
        },
        {
          id: "investigation",
          label: "Investigation",
          duration: STEP_TIMINGS_FREE.investigation.duration,
        },
        {
          id: "scoring",
          label: "Scoring",
          duration: STEP_TIMINGS_FREE.scoring.duration,
        },
      ];
    }

    // PRO plan (full_analysis) - 4 steps
    return [
      {
        id: "extraction",
        label: "Extraction des documents",
        duration: STEP_TIMINGS_PRO.extraction.duration,
      },
      {
        id: "tier1",
        label: "Investigation approfondie",
        duration: STEP_TIMINGS_PRO.tier1.duration,
      },
      {
        id: "tier2",
        label: "Expert sectoriel",
        duration: STEP_TIMINGS_PRO.tier2.duration,
      },
      {
        id: "tier3",
        label: "Synthèse & Scoring",
        duration: STEP_TIMINGS_PRO.tier3.duration,
      },
    ];
  }, [analysisType]);

  const [elapsedTime, setElapsedTime] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const startTimeRef = useRef<number>(Date.now());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate step statuses based on elapsed time
  // CRITICAL: The last step NEVER becomes "completed" while isRunning is true
  const stepStatuses = useMemo(() => {
    const statuses: Record<string, "pending" | "running" | "completed"> = {};

    let accumulatedTime = 0;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const isLastStep = i === steps.length - 1;
      const stepStartTime = accumulatedTime;
      const stepEndTime = stepStartTime + step.duration;

      if (isComplete) {
        // Analysis is done - mark all steps as completed
        statuses[step.id] = "completed";
      } else if (elapsedTime < stepStartTime) {
        // Haven't reached this step yet
        statuses[step.id] = "pending";
      } else if (isLastStep) {
        // Last step: stays "running" until analysis completes (never auto-completes)
        statuses[step.id] = "running";
      } else if (elapsedTime >= stepEndTime) {
        // Non-last step and past its duration: completed
        statuses[step.id] = "completed";
      } else {
        // Currently in this step
        statuses[step.id] = "running";
      }

      accumulatedTime = stepEndTime;
    }

    return statuses;
  }, [elapsedTime, steps, isComplete]);

  // Start timer on mount, stop when isRunning becomes false
  useEffect(() => {
    // Start the timer immediately
    startTimeRef.current = Date.now();
    setElapsedTime(0);
    setIsComplete(false);

    intervalRef.current = setInterval(() => {
      const newElapsed = (Date.now() - startTimeRef.current) / 1000;
      setElapsedTime(newElapsed);
    }, 500);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []); // Empty deps = run once on mount

  // When isRunning becomes false, mark as complete
  useEffect(() => {
    if (!isRunning) {
      setIsComplete(true);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [isRunning]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const displayTime = elapsedTime;

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {isRunning ? (
            <>
              <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="font-medium text-sm">Analyse en cours</span>
            </>
          ) : isComplete ? (
            <>
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="font-medium text-sm text-green-700">
                Analyse terminée
              </span>
            </>
          ) : (
            <>
              <div className="h-2 w-2 rounded-full bg-amber-500" />
              <span className="font-medium text-sm">En attente...</span>
            </>
          )}
        </div>
        <span className="text-sm text-muted-foreground font-mono tabular-nums">
          {formatTime(displayTime)}
        </span>
      </div>

      {/* Steps */}
      <div className="space-y-0">
        {steps.map((step, index) => {
          const status = stepStatuses[step.id];

          return (
            <div key={step.id}>
              <div className="flex items-center gap-3 py-2.5 px-1">
                {/* Step indicator */}
                <div className="flex-shrink-0">
                  {status === "completed" ? (
                    <div className="h-6 w-6 rounded-full bg-green-500 flex items-center justify-center shadow-sm">
                      <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                    </div>
                  ) : status === "running" ? (
                    <div className="h-6 w-6 rounded-full bg-blue-500 flex items-center justify-center shadow-sm">
                      <Loader2 className="h-3.5 w-3.5 text-white animate-spin" />
                    </div>
                  ) : (
                    <div className="h-6 w-6 rounded-full border-2 border-muted-foreground/30 bg-background" />
                  )}
                </div>

                {/* Step label */}
                <span
                  className={cn(
                    "text-sm font-medium transition-colors",
                    status === "pending" && "text-muted-foreground",
                    status === "running" && "text-foreground",
                    status === "completed" && "text-foreground"
                  )}
                >
                  {step.label}
                </span>
              </div>

              {/* Agent details sub-listing */}
              {agentStatuses && agentStatuses.length > 0 && (status === "running" || status === "completed") && (
                <div className="ml-9 mt-0.5 mb-1 space-y-0.5">
                  {agentStatuses
                    .filter(a => {
                      if (step.id === "tier1" || step.id === "investigation") return true;
                      return false;
                    })
                    .map((agent) => (
                      <div key={agent.agentName} className="flex items-center gap-2 text-xs">
                        {agent.status === "completed" ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : agent.status === "running" ? (
                          <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />
                        ) : agent.status === "error" ? (
                          <XCircle className="h-3 w-3 text-red-500" />
                        ) : (
                          <div className="h-3 w-3 rounded-full border border-muted-foreground/30" />
                        )}
                        <span className={cn(
                          agent.status === "completed" ? "text-muted-foreground" :
                          agent.status === "running" ? "text-foreground" :
                          agent.status === "error" ? "text-red-600" :
                          "text-muted-foreground/50"
                        )}>
                          {formatAgentName(agent.agentName)}
                        </span>
                        {agent.executionTimeMs != null && agent.status === "completed" && (
                          <span className="text-muted-foreground/50">
                            ({(agent.executionTimeMs / 1000).toFixed(1)}s)
                          </span>
                        )}
                        {agent.status === "error" && agent.error && (
                          <span className="text-red-500 truncate max-w-[150px]" title={agent.error}>
                            {agent.error}
                          </span>
                        )}
                      </div>
                    ))}
                </div>
              )}

              {/* Connector line */}
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    "ml-3 h-3 border-l-2 transition-colors",
                    status === "completed"
                      ? "border-green-300"
                      : "border-muted-foreground/20"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
