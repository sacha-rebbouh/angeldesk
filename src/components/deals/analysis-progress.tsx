"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Check, Loader2, XCircle } from "lucide-react";
import { formatAgentName } from "@/lib/format-utils";
import { getProgressSteps, type ProgressStep } from "@/lib/analysis-progress-model";

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
  /** Real-time completed agent count from backend polling */
  completedAgents?: number;
  /** Total agent count from backend */
  totalAgents?: number;
  /** Analysis start time (ISO string) from backend */
  startedAt?: string | null;
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs]);

  return now;
}

export const AnalysisProgress = memo(function AnalysisProgress({
  isRunning,
  analysisType = "full_analysis",
  agentStatuses,
  completedAgents = 0,
  totalAgents = 0,
  startedAt,
}: AnalysisProgressProps) {
  const nowMs = useNow(1000);

  // Build steps based on analysis type (FREE vs PRO) — modèle partagé avec l'overlay.
  const steps = useMemo<ProgressStep[]>(() => getProgressSteps(analysisType), [analysisType]);

  const isComplete = !isRunning && completedAgents > 0;
  const elapsedTime = useMemo(() => {
    if (!startedAt) return 0;
    const start = new Date(startedAt).getTime();
    return Math.max(0, (nowMs - start) / 1000);
  }, [nowMs, startedAt]);

  // Calculate step statuses based on REAL completedAgents from backend
  const stepStatuses = useMemo(() => {
    const statuses: Record<string, "pending" | "running" | "completed"> = {};

    if (isComplete) {
      for (const step of steps) {
        statuses[step.id] = "completed";
      }
      return statuses;
    }

    let previousThreshold = 0;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      if (completedAgents >= step.threshold) {
        // Past this step's threshold → completed
        statuses[step.id] = "completed";
      } else if (completedAgents > previousThreshold) {
        // Between previous and current threshold → running
        statuses[step.id] = "running";
      } else if (completedAgents === 0 && i === 0 && isRunning) {
        // No agents completed yet but analysis is running → first step running
        statuses[step.id] = "running";
      } else {
        statuses[step.id] = "pending";
      }

      previousThreshold = step.threshold;
    }

    return statuses;
  }, [completedAgents, steps, isComplete, isRunning]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Progress percentage based on real agent count
  const progressPercent = totalAgents > 0
    ? Math.round((completedAgents / totalAgents) * 100)
    : 0;

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {isRunning ? (
            <>
              <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="font-medium text-sm">
                Analyse en cours
                {totalAgents > 0 && (
                  <span className="text-muted-foreground font-normal ml-1">
                    ({completedAgents}/{totalAgents} agents - {progressPercent}%)
                  </span>
                )}
              </span>
            </>
          ) : isComplete ? (
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
          {formatTime(elapsedTime)}
        </span>
      </div>

      {/* Progress bar */}
      {isRunning && totalAgents > 0 && (
        <div className="mb-4 h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-700 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

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
                    .filter(() => {
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
});
