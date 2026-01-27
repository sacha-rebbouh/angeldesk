"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Check, Loader2 } from "lucide-react";

// Timing configuration (in seconds)
// These create a realistic feeling progression
const STEP_TIMINGS = {
  extraction: { min: 8, max: 12 }, // Artificially extended for premium feel
  tier1: { min: 25, max: 45 },
  tier2: { min: 8, max: 15 },
  tier3: { min: 15, max: 30 },
} as const;

// Calculate total expected time
const TOTAL_MAX_TIME = Object.values(STEP_TIMINGS).reduce((acc, t) => acc + t.max, 0);

export interface AnalysisProgressProps {
  isRunning: boolean;
  onComplete?: () => void;
  analysisType?: "tier1_complete" | "full_analysis";
}

interface StepConfig {
  id: string;
  label: string;
  timing: { min: number; max: number };
}

export function AnalysisProgress({
  isRunning,
  analysisType = "full_analysis",
}: AnalysisProgressProps) {
  // Build steps based on analysis type
  const steps = useMemo<StepConfig[]>(() => {
    const baseSteps: StepConfig[] = [
      {
        id: "extraction",
        label: "Extraction des documents",
        timing: STEP_TIMINGS.extraction,
      },
      {
        id: "tier1",
        label: "Investigation approfondie",
        timing: STEP_TIMINGS.tier1,
      },
    ];

    if (analysisType === "full_analysis") {
      baseSteps.push(
        {
          id: "tier2",
          label: "Expert sectoriel",
          timing: STEP_TIMINGS.tier2,
        },
        {
          id: "tier3",
          label: "Synthese & Scoring",
          timing: STEP_TIMINGS.tier3,
        }
      );
    }

    return baseSteps;
  }, [analysisType]);

  const [elapsedTime, setElapsedTime] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate step statuses based on elapsed time
  const stepStatuses = useMemo(() => {
    const statuses: Record<string, "pending" | "running" | "completed"> = {};

    let accumulatedTime = 0;

    for (const step of steps) {
      const stepStartTime = accumulatedTime;
      const estimatedDuration = (step.timing.min + step.timing.max) / 2;
      const stepEndTime = stepStartTime + estimatedDuration;

      if (elapsedTime < stepStartTime) {
        statuses[step.id] = "pending";
      } else if (elapsedTime >= stepEndTime) {
        statuses[step.id] = "completed";
      } else {
        statuses[step.id] = "running";
      }

      accumulatedTime = stepEndTime;
    }

    return statuses;
  }, [elapsedTime, steps]);

  // Timer effect
  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      startTimeRef.current = null;
      return;
    }

    startTimeRef.current = Date.now();
    setElapsedTime(0);

    intervalRef.current = setInterval(() => {
      if (startTimeRef.current) {
        const newElapsed = (Date.now() - startTimeRef.current) / 1000;
        setElapsedTime(newElapsed);
      }
    }, 500);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning]);

  // Mark all steps as complete when analysis finishes
  useEffect(() => {
    if (!isRunning && startTimeRef.current !== null) {
      setElapsedTime(TOTAL_MAX_TIME);
    }
  }, [isRunning]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Don't render if not running and never started
  if (!isRunning && elapsedTime === 0) {
    return null;
  }

  const allComplete = Object.values(stepStatuses).every((s) => s === "completed");

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
          ) : allComplete ? (
            <>
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="font-medium text-sm text-green-700">
                Analyse terminee
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
          {formatTime(Math.min(elapsedTime, TOTAL_MAX_TIME))}
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
