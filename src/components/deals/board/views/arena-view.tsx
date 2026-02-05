"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
// Use BOARD_MEMBERS_PROD directly for client components to avoid module-load race condition
import { BOARD_MEMBERS_PROD } from "@/agents/board/types";
import type { InitialAnalysis, DebateResponse } from "@/agents/board/types";

interface ArenaViewProps {
  memberAnalyses: Record<string, { memberName: string; analysis: InitialAnalysis }>;
  debateResponses: {
    roundNumber: number;
    memberId: string;
    memberName: string;
    response: DebateResponse;
  }[];
}

export function ArenaView({ memberAnalyses, debateResponses }: ArenaViewProps) {
  const [selectedMember, setSelectedMember] = useState<string | null>(null);

  // Calculate member positions in a circle
  const memberPositions = useMemo(() => {
    const positions: Record<string, { x: number; y: number; angle: number }> = {};
    const center = 150;
    const radius = 110;

    BOARD_MEMBERS_PROD.forEach((member, index) => {
      // Start from top, go clockwise
      const angle = (index * 90 - 45) * (Math.PI / 180);
      positions[member.id] = {
        x: center + radius * Math.sin(angle),
        y: center - radius * Math.cos(angle),
        angle: index * 90 - 45,
      };
    });

    return positions;
  }, []);

  // Get latest state for each member
  const memberStates = useMemo(() => {
    return BOARD_MEMBERS_PROD.map((config) => {
      const analysis = memberAnalyses[config.id]?.analysis;
      const responses = debateResponses
        .filter((r) => r.memberId === config.id)
        .sort((a, b) => b.roundNumber - a.roundNumber);

      const latestResponse = responses[0];
      const currentVerdict =
        latestResponse?.response.newVerdict ??
        analysis?.verdict;
      const currentConfidence =
        latestResponse?.response.newConfidence ??
        analysis?.confidence;

      return {
        ...config,
        analysis,
        responses,
        currentVerdict,
        currentConfidence,
        hasChanged: responses.some((r) => r.response.positionChanged),
      };
    });
  }, [memberAnalyses, debateResponses]);

  // Get connections (responses to others)
  const connections = useMemo(() => {
    const conns: {
      from: string;
      to: string;
      agreement: "agree" | "disagree" | "partially_agree";
    }[] = [];

    debateResponses.forEach(({ memberId, response }) => {
      response.responsesToOthers.forEach((r) => {
        conns.push({
          from: memberId,
          to: r.targetMemberId,
          agreement: r.agreement,
        });
      });
    });

    return conns;
  }, [debateResponses]);

  const selectedMemberData = selectedMember
    ? memberStates.find((m) => m.id === selectedMember)
    : null;

  return (
    <div className="flex gap-6">
      {/* Arena */}
      <div className="relative h-[300px] w-[300px] shrink-0">
        {/* Connection lines */}
        <svg className="absolute inset-0" viewBox="0 0 300 300">
          {connections.map((conn, idx) => {
            const from = memberPositions[conn.from];
            const to = memberPositions[conn.to];
            if (!from || !to) return null;

            return (
              <line
                key={idx}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={
                  conn.agreement === "agree"
                    ? "#22c55e"
                    : conn.agreement === "disagree"
                      ? "#ef4444"
                      : "#f59e0b"
                }
                strokeWidth="2"
                strokeOpacity="0.3"
                strokeDasharray={conn.agreement === "partially_agree" ? "4,4" : undefined}
              />
            );
          })}
        </svg>

        {/* Center circle */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/30">
            <span className="text-xs text-muted-foreground text-center">
              Debat
            </span>
          </div>
        </div>

        {/* Members */}
        {memberStates.map((member) => {
          const pos = memberPositions[member.id];
          if (!pos) return null;

          return (
            <button
              key={member.id}
              className={cn(
                "absolute flex flex-col items-center transition-transform hover:scale-110",
                selectedMember === member.id && "scale-110"
              )}
              style={{
                left: pos.x,
                top: pos.y,
                transform: "translate(-50%, -50%)",
              }}
              onClick={() =>
                setSelectedMember(selectedMember === member.id ? null : member.id)
              }
            >
              {/* Avatar */}
              <div
                className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-full text-white font-bold shadow-lg transition-all",
                  selectedMember === member.id && "ring-4 ring-primary/50"
                )}
                style={{ backgroundColor: member.color }}
              >
                {member.name.charAt(0)}
              </div>

              {/* Name */}
              <span className="mt-1 text-xs font-medium">{member.name}</span>

              {/* Verdict badge */}
              {member.currentVerdict && (
                <Badge
                  variant="secondary"
                  className={cn(
                    "mt-1 text-[10px]",
                    member.currentVerdict === "GO" && "bg-green-100 text-green-800",
                    member.currentVerdict === "NO_GO" && "bg-red-100 text-red-800",
                    member.currentVerdict === "NEED_MORE_INFO" && "bg-amber-100 text-amber-800"
                  )}
                >
                  {member.currentVerdict === "NO_GO" ? "NO GO" : member.currentVerdict === "NEED_MORE_INFO" ? "MORE" : member.currentVerdict}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Detail panel */}
      <div className="flex-1 rounded-lg border bg-muted/30 p-4">
        {selectedMemberData ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full text-white font-bold"
                style={{ backgroundColor: selectedMemberData.color }}
              >
                {selectedMemberData.name.charAt(0)}
              </div>
              <div>
                <p className="font-semibold">{selectedMemberData.name}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedMemberData.currentVerdict ?? "En attente"}{" "}
                  {selectedMemberData.currentConfidence !== undefined &&
                    `(${selectedMemberData.currentConfidence}%)`}
                </p>
              </div>
            </div>

            {/* Analysis */}
            {selectedMemberData.analysis && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Analyse initiale</p>
                <div className="text-sm text-muted-foreground">
                  <p className="mb-1">
                    <strong>Arguments:</strong>{" "}
                    {selectedMemberData.analysis.arguments.length}
                  </p>
                  <ul className="list-disc list-inside space-y-1">
                    {selectedMemberData.analysis.arguments
                      .slice(0, 3)
                      .map((arg, i) => (
                        <li key={i} className="truncate">
                          {arg.point}
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Recent responses */}
            {selectedMemberData.responses.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Derniere reponse</p>
                <p className="text-sm text-muted-foreground">
                  {selectedMemberData.responses[0]?.response.justification}
                </p>
                {selectedMemberData.responses[0]?.response.positionChanged && (
                  <Badge variant="outline" className="border-purple-300 text-purple-600">
                    A change de position
                  </Badge>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <p className="text-sm">Cliquez sur un membre pour voir les details</p>
          </div>
        )}
      </div>
    </div>
  );
}
