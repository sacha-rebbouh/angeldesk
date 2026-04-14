"use client";

import { memo, useMemo } from "react";
import { Loader2, CheckCircle2, Circle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BoardProgressEvent } from "@/agents/board/types";
import { BOARD_MEMBERS_PROD } from "@/agents/board/types";
import { ProviderIcon } from "@/components/shared/provider-icon";

interface BoardProgressProps {
  events: BoardProgressEvent[];
}

const PHASES = [
  { key: "init", label: "Initialisation" },
  { key: "analysis", label: "Analyses" },
  { key: "debate", label: "Débat" },
  { key: "vote", label: "Vote" },
] as const;

type PhaseKey = (typeof PHASES)[number]["key"];

export const BoardProgress = memo(function BoardProgress({ events }: BoardProgressProps) {
  const { currentPhase, memberStatus, currentRound, lastMessage } = useMemo(() => {
    let phase: PhaseKey = "init";
    let round = 0;
    let message = "Initialisation...";
    const status: Record<string, "pending" | "running" | "done" | "failed"> = {};
    const failed = new Set<string>();

    BOARD_MEMBERS_PROD.forEach((m) => {
      status[m.id] = "pending";
    });

    for (const event of events) {
      switch (event.type) {
        case "session_started":
          phase = "init";
          message = "Session initialisée";
          break;
        case "member_analysis_started":
          phase = "analysis";
          if (event.memberId) status[event.memberId] = "running";
          message = event.message ?? "Analyse en cours...";
          break;
        case "member_analysis_completed":
          if (event.memberId) status[event.memberId] = "done";
          message = event.message ?? "Analyse terminée";
          break;
        case "member_analysis_failed":
          if (event.memberId) {
            status[event.memberId] = "failed";
            failed.add(event.memberId);
          }
          message = event.message ?? "Analyse échouée";
          break;
        case "debate_round_started":
          phase = "debate";
          round = event.roundNumber ?? 1;
          BOARD_MEMBERS_PROD.forEach((m) => {
            if (!failed.has(m.id)) status[m.id] = "pending";
          });
          message = event.message ?? `Round ${round}...`;
          break;
        case "debate_response":
          if (event.memberId) status[event.memberId] = "done";
          message = event.message ?? "Réponse reçue";
          break;
        case "debate_round_completed":
          message = event.message ?? `Round ${round} termine`;
          break;
        case "voting_started":
          phase = "vote";
          BOARD_MEMBERS_PROD.forEach((m) => {
            if (!failed.has(m.id)) status[m.id] = "pending";
          });
          message = event.message ?? "Vote en cours...";
          break;
        case "member_voted":
          if (event.memberId) status[event.memberId] = "done";
          message = event.message ?? "Vote enregistre";
          break;
      }
    }

    return {
      currentPhase: phase,
      memberStatus: status,
      currentRound: round,
      lastMessage: message,
    };
  }, [events]);

  const phaseIndex = PHASES.findIndex((p) => p.key === currentPhase);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="px-6 py-5 space-y-5">
        {/* Phase progress bar */}
        <div className="flex items-center justify-between gap-2">
          {PHASES.map((phase, idx) => {
            const isActive = idx === phaseIndex;
            const isComplete = idx < phaseIndex;

            return (
              <div key={phase.key} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full transition-all duration-500",
                      isComplete && "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30",
                      isActive && "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30",
                      !isComplete && !isActive && "bg-slate-800/50 text-slate-600 ring-1 ring-slate-700/50"
                    )}
                  >
                    {isComplete ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : isActive ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Circle className="h-4 w-4" />
                    )}
                  </div>
                  <span
                    className={cn(
                      "mt-1.5 text-xs transition-colors",
                      isActive && "font-medium text-amber-400",
                      isComplete && "font-medium text-emerald-400",
                      !isActive && !isComplete && "text-slate-600"
                    )}
                  >
                    {phase.label}
                  </span>
                </div>
                {idx < PHASES.length - 1 && (
                  <div
                    className={cn(
                      "mx-3 h-px flex-1 transition-all duration-500",
                      idx < phaseIndex ? "bg-emerald-500/40" : "bg-slate-800"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Member status avatars */}
        <div className="flex items-center justify-center gap-5">
          {BOARD_MEMBERS_PROD.map((member) => {
            const status = memberStatus[member.id];

            return (
              <div
                key={member.id}
                className="flex flex-col items-center gap-1.5"
                title={member.name}
              >
                <div className="relative">
                  {/* Glow ring for running */}
                  {status === "running" && (
                    <div
                      className="absolute -inset-1 rounded-full animate-pulse opacity-40"
                      style={{ backgroundColor: member.color }}
                    />
                  )}
                  <div
                    className={cn(
                      "relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300",
                      status === "done" && "ring-2 ring-emerald-500/50",
                      status === "running" && "ring-2",
                      status === "pending" && "opacity-30",
                      status === "failed" && "ring-2 ring-red-500/50 opacity-60"
                    )}
                    style={{
                      backgroundColor: status === "failed" ? "#1e1b2e" : member.color,
                      ...(status === "running" ? { ringColor: member.color } : {}),
                    }}
                  >
                    <ProviderIcon provider={member.provider} className="h-5 w-5 text-white" />
                  </div>
                  {/* Status indicator */}
                  {status === "done" && (
                    <div className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-900">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    </div>
                  )}
                  {status === "failed" && (
                    <div className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-900">
                      <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                    </div>
                  )}
                </div>
                <span className={cn(
                  "text-[10px] font-medium",
                  status === "done" && "text-emerald-400",
                  status === "running" && "text-white",
                  status === "pending" && "text-slate-600",
                  status === "failed" && "text-red-400"
                )}>
                  {member.name.split(" ")[0]}
                </span>
              </div>
            );
          })}
        </div>

        {/* Current message */}
        <div className="text-center">
          <p className="text-sm text-slate-400">
            {lastMessage}
            {currentPhase === "debate" && currentRound > 0 && (
              <span className="ml-1.5 text-amber-400/70">(Round {currentRound})</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
});
