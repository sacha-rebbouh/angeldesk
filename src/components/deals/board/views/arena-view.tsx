"use client";

import { memo, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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

export const ArenaView = memo(function ArenaView({ memberAnalyses, debateResponses }: ArenaViewProps) {
  const [selectedMember, setSelectedMember] = useState<string | null>(null);

  const memberPositions = useMemo(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    const center = 150;
    const radius = 110;

    BOARD_MEMBERS_PROD.forEach((member, index) => {
      const angle = (index * 90 - 45) * (Math.PI / 180);
      positions[member.id] = {
        x: center + radius * Math.sin(angle),
        y: center - radius * Math.cos(angle),
      };
    });

    return positions;
  }, []);

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
                    ? "#34d399"
                    : conn.agreement === "disagree"
                      ? "#f87171"
                      : "#fbbf24"
                }
                strokeWidth="1.5"
                strokeOpacity="0.25"
                strokeDasharray={conn.agreement === "partially_agree" ? "4,4" : undefined}
              />
            );
          })}
        </svg>

        {/* Center circle */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-slate-700/50">
            <span className="text-[10px] text-slate-600 text-center font-medium uppercase tracking-wider">
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
              <div
                className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-full font-bold text-white shadow-lg transition-all",
                  selectedMember === member.id && "ring-3 ring-white/30"
                )}
                style={{ backgroundColor: member.color }}
              >
                {member.name.charAt(0)}
              </div>

              <span className="mt-1 text-[11px] font-medium text-slate-300">{member.name}</span>

              {member.currentVerdict && (
                <Badge
                  variant="secondary"
                  className={cn(
                    "mt-0.5 text-[9px] border-0",
                    member.currentVerdict === "GO" && "bg-emerald-500/15 text-emerald-400",
                    member.currentVerdict === "NO_GO" && "bg-red-500/15 text-red-400",
                    member.currentVerdict === "NEED_MORE_INFO" && "bg-amber-500/15 text-amber-400"
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
      <div className="flex-1 rounded-xl border border-slate-700/50 bg-slate-800/30 p-5">
        {selectedMemberData ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full font-bold text-white"
                style={{ backgroundColor: selectedMemberData.color }}
              >
                {selectedMemberData.name.charAt(0)}
              </div>
              <div>
                <p className="font-medium text-white">{selectedMemberData.name}</p>
                <p className="text-xs text-slate-400">
                  {selectedMemberData.currentVerdict ?? "En attente"}{" "}
                  {selectedMemberData.currentConfidence !== undefined &&
                    `(${selectedMemberData.currentConfidence}%)`}
                </p>
              </div>
            </div>

            {selectedMemberData.analysis && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-300 uppercase tracking-wider">Analyse initiale</p>
                <div className="text-sm text-slate-400">
                  <p className="mb-1 text-xs">
                    <strong className="text-slate-300">Arguments:</strong>{" "}
                    {selectedMemberData.analysis.arguments.length}
                  </p>
                  <ul className="list-none space-y-1">
                    {selectedMemberData.analysis.arguments
                      .slice(0, 3)
                      .map((arg, i) => (
                        <li key={i} className="truncate text-xs text-slate-400 pl-2 border-l border-slate-700">
                          {arg.point}
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            )}

            {selectedMemberData.responses.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-300 uppercase tracking-wider">Derniere reponse</p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {selectedMemberData.responses[0]?.response.justification}
                </p>
                {selectedMemberData.responses[0]?.response.positionChanged && (
                  <Badge variant="secondary" className="text-[10px] border-0 bg-purple-500/15 text-purple-400">
                    A change de position
                  </Badge>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-slate-500">Cliquez sur un membre pour voir les details</p>
          </div>
        )}
      </div>
    </div>
  );
});
