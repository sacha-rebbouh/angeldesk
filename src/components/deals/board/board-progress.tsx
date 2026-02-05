"use client";

import { useMemo } from "react";
import { Loader2, CheckCircle2, Circle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BoardProgressEvent } from "@/agents/board/types";
import { BOARD_MEMBERS_PROD } from "@/agents/board/types";

interface BoardProgressProps {
  events: BoardProgressEvent[];
}

const PHASES = [
  { key: "init", label: "Initialisation" },
  { key: "analysis", label: "Analyses" },
  { key: "debate", label: "Debat" },
  { key: "vote", label: "Vote" },
] as const;

type PhaseKey = (typeof PHASES)[number]["key"];

// Provider icon SVGs — inline for zero-dep rendering
function ProviderIcon({ provider, className }: { provider: string; className?: string }) {
  switch (provider) {
    case "anthropic":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M17.304 3.541l-5.296 16.459h3.366L20.67 3.541h-3.366zm-10.608 0L1.4 20h3.366l1.058-3.286h5.417L12.3 20h3.366L10.37 3.541H6.696zm2.985 4.17l1.867 5.8h-3.74l1.873-5.8z" />
        </svg>
      );
    case "openai":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M22.282 9.821a5.985 5.985 0 00-.516-4.91 6.046 6.046 0 00-6.51-2.9A6.065 6.065 0 0011.708.516a5.986 5.986 0 00-5.712 4.14 6.044 6.044 0 00-4.041 2.926 6.048 6.048 0 00.749 7.097 5.98 5.98 0 00.51 4.911 6.051 6.051 0 006.515 2.9A5.985 5.985 0 0013.288 23.5a6.048 6.048 0 005.712-4.138 6.047 6.047 0 004.042-2.928 6.048 6.048 0 00-.76-6.613zM13.29 21.538a4.49 4.49 0 01-2.888-1.054l.144-.08 4.802-2.772a.778.778 0 00.394-.676v-6.765l2.03 1.172a.071.071 0 01.038.053v5.607a4.504 4.504 0 01-4.52 4.515zm-9.697-4.138a4.49 4.49 0 01-.537-3.016l.144.083 4.802 2.773a.78.78 0 00.787 0l5.862-3.384v2.342a.073.073 0 01-.03.06L9.78 19.044a4.504 4.504 0 01-6.187-1.644zM2.372 7.878A4.49 4.49 0 014.714 5.87v5.716a.776.776 0 00.393.676l5.862 3.385-2.03 1.17a.071.071 0 01-.067.005L3.93 13.844a4.504 4.504 0 01-1.558-6.166zm16.656 3.879l-5.862-3.384 2.03-1.172a.071.071 0 01.067-.006l4.94 2.852a4.494 4.494 0 01-.679 8.133v-5.743a.78.78 0 00-.396-.68zm2.02-3.026l-.144-.083-4.802-2.772a.78.78 0 00-.787 0l-5.862 3.384V6.918a.073.073 0 01.03-.06l4.94-2.852a4.498 4.498 0 016.724 4.66l.001.065zm-12.7 4.18l-2.03-1.171a.071.071 0 01-.038-.053V6.08a4.497 4.497 0 017.407-3.443l-.144.08-4.802 2.773a.778.778 0 00-.393.676v6.765l.001-.04zm1.1-2.383l2.61-1.506 2.61 1.507v3.012l-2.61 1.506-2.61-1.506V10.528z" />
        </svg>
      );
    case "google":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M12 11.01v3.32h5.47c-.24 1.26-1.01 2.33-2.16 3.04l3.49 2.71c2.03-1.87 3.2-4.62 3.2-7.89 0-.76-.07-1.49-.2-2.19H12z" />
          <path d="M5.84 14.09l-.78.6-2.78 2.16C4.56 20.63 8.03 23 12 23c3.24 0 5.95-1.07 7.93-2.91l-3.49-2.71c-.97.65-2.21 1.04-3.56 1.04-2.74 0-5.06-1.85-5.89-4.34l-.15.01z" />
          <path d="M2.28 6.85C1.47 8.45 1 10.17 1 12s.47 3.55 1.28 5.15l3.62-2.81C5.55 13.46 5.33 12.75 5.33 12s.22-1.46.57-2.34L2.28 6.85z" />
          <path d="M12 5.58c1.54 0 2.93.53 4.02 1.57l3.01-3.01C17.07 2.18 14.76 1 12 1 8.03 1 4.56 3.37 2.28 6.85l3.62 2.81C6.7 7.43 9.02 5.58 12 5.58z" />
        </svg>
      );
    case "xai":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M2.2 2L10.7 14.3L2.6 22H4.4L11.5 15.5L17.2 22H22L13 9.2L20.4 2H18.6L12.2 8L7 2H2.2ZM5.2 3.5H6.8L19 20.5H17.4L5.2 3.5Z" />
        </svg>
      );
    default:
      return null;
  }
}

export function BoardProgress({ events }: BoardProgressProps) {
  const { currentPhase, memberStatus, currentRound, lastMessage, failedMembers } = useMemo(() => {
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
          message = "Session initialisee";
          break;
        case "member_analysis_started":
          phase = "analysis";
          if (event.memberId) status[event.memberId] = "running";
          message = event.message ?? "Analyse en cours...";
          break;
        case "member_analysis_completed":
          if (event.memberId) status[event.memberId] = "done";
          message = event.message ?? "Analyse terminee";
          break;
        case "member_analysis_failed":
          if (event.memberId) {
            status[event.memberId] = "failed";
            failed.add(event.memberId);
          }
          message = event.message ?? "Analyse echouee";
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
          message = event.message ?? "Reponse recue";
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
      failedMembers: failed,
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
}
