"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BoardProgressEvent } from "@/agents/board/types";
import { BOARD_MEMBERS } from "@/agents/board/types";

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

export function BoardProgress({ events }: BoardProgressProps) {
  // Determine current phase and progress
  const { currentPhase, memberStatus, currentRound, lastMessage } = useMemo(() => {
    let phase: PhaseKey = "init";
    let round = 0;
    let message = "Initialisation...";
    const status: Record<string, "pending" | "running" | "done"> = {};

    BOARD_MEMBERS.forEach((m) => {
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
        case "debate_round_started":
          phase = "debate";
          round = event.roundNumber ?? 1;
          // Reset status for debate
          BOARD_MEMBERS.forEach((m) => {
            status[m.id] = "pending";
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
          BOARD_MEMBERS.forEach((m) => {
            status[m.id] = "pending";
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
    <Card>
      <CardContent className="py-4">
        <div className="space-y-4">
          {/* Phase progress */}
          <div className="flex items-center justify-between">
            {PHASES.map((phase, idx) => {
              const isActive = idx === phaseIndex;
              const isComplete = idx < phaseIndex;

              return (
                <div key={phase.key} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full transition-all",
                        isComplete && "bg-green-500 text-white",
                        isActive && "bg-primary text-white",
                        !isComplete && !isActive && "bg-muted text-muted-foreground"
                      )}
                    >
                      {isComplete ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : isActive ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Circle className="h-5 w-5" />
                      )}
                    </div>
                    <span
                      className={cn(
                        "mt-1 text-xs",
                        (isActive || isComplete) && "font-medium"
                      )}
                    >
                      {phase.label}
                    </span>
                  </div>
                  {idx < PHASES.length - 1 && (
                    <div
                      className={cn(
                        "mx-2 h-0.5 w-16 transition-all",
                        idx < phaseIndex ? "bg-green-500" : "bg-muted"
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Member status */}
          <div className="flex items-center justify-center gap-4">
            {BOARD_MEMBERS.map((member) => {
              const status = memberStatus[member.id];

              return (
                <div
                  key={member.id}
                  className="flex items-center gap-2"
                  title={member.name}
                >
                  <div
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white",
                      status === "done" && "opacity-100",
                      status === "running" && "animate-pulse",
                      status === "pending" && "opacity-40"
                    )}
                    style={{ backgroundColor: member.color }}
                  >
                    {member.name.charAt(0)}
                  </div>
                  {status === "running" && (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  )}
                  {status === "done" && (
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Current message */}
          <div className="text-center text-sm text-muted-foreground">
            {lastMessage}
            {currentPhase === "debate" && currentRound > 0 && (
              <span className="ml-2">(Round {currentRound})</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
