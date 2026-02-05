"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
// Use BOARD_MEMBERS_PROD directly for client components to avoid module-load race condition
import { BOARD_MEMBERS_PROD } from "@/agents/board/types";
import type { InitialAnalysis, DebateResponse } from "@/agents/board/types";

interface ColumnsViewProps {
  memberAnalyses: Record<string, { memberName: string; analysis: InitialAnalysis }>;
  debateResponses: {
    roundNumber: number;
    memberId: string;
    memberName: string;
    response: DebateResponse;
  }[];
}

export function ColumnsView({ memberAnalyses, debateResponses }: ColumnsViewProps) {
  // Group responses by member
  const memberData = useMemo(() => {
    return BOARD_MEMBERS_PROD.map((config) => {
      const analysis = memberAnalyses[config.id]?.analysis;
      const responses = debateResponses
        .filter((r) => r.memberId === config.id)
        .sort((a, b) => a.roundNumber - b.roundNumber);

      return {
        ...config,
        analysis,
        responses,
      };
    });
  }, [memberAnalyses, debateResponses]);

  const maxRounds = useMemo(() => {
    return Math.max(0, ...debateResponses.map((r) => r.roundNumber));
  }, [debateResponses]);

  return (
    <div className="grid grid-cols-4 gap-4">
      {memberData.map((member) => (
        <div key={member.id} className="space-y-3">
          {/* Column header */}
          <div
            className="rounded-t-lg p-3 text-center text-white font-semibold"
            style={{ backgroundColor: member.color }}
          >
            {member.name}
          </div>

          {/* Initial analysis */}
          {member.analysis && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Analyse initiale
                </span>
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-xs",
                    member.analysis.verdict === "GO" && "bg-green-100 text-green-800",
                    member.analysis.verdict === "NO_GO" && "bg-red-100 text-red-800",
                    member.analysis.verdict === "NEED_MORE_INFO" && "bg-amber-100 text-amber-800"
                  )}
                >
                  {member.analysis.verdict === "NO_GO" ? "NO GO" : member.analysis.verdict}
                </Badge>
              </div>
              <div className="text-xs">
                <p className="font-medium">Arguments ({member.analysis.arguments.length})</p>
                <ul className="mt-1 space-y-1 text-muted-foreground">
                  {member.analysis.arguments.slice(0, 3).map((arg, i) => (
                    <li key={i} className="truncate">• {arg.point}</li>
                  ))}
                </ul>
              </div>
              {member.analysis.concerns.length > 0 && (
                <div className="text-xs">
                  <p className="font-medium">Concerns ({member.analysis.concerns.length})</p>
                  <ul className="mt-1 space-y-1 text-muted-foreground">
                    {member.analysis.concerns.slice(0, 2).map((c, i) => (
                      <li key={i} className="truncate">• {c.concern}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Debate responses */}
          {member.responses.map((r) => (
            <div
              key={r.roundNumber}
              className={cn(
                "rounded-lg border p-3 space-y-2",
                r.response.positionChanged && "border-purple-300 bg-purple-50"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Round {r.roundNumber}
                </span>
                {r.response.positionChanged && r.response.newVerdict && (
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-xs",
                      r.response.newVerdict === "GO" && "bg-green-100 text-green-800",
                      r.response.newVerdict === "NO_GO" && "bg-red-100 text-red-800",
                      r.response.newVerdict === "NEED_MORE_INFO" && "bg-amber-100 text-amber-800"
                    )}
                  >
                    → {r.response.newVerdict === "NO_GO" ? "NO GO" : r.response.newVerdict}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-4">
                {r.response.justification}
              </p>
              {r.response.responsesToOthers.length > 0 && (
                <div className="text-xs">
                  <p className="font-medium">
                    Reponses ({r.response.responsesToOthers.length})
                  </p>
                </div>
              )}
            </div>
          ))}

          {/* Empty state for missing rounds */}
          {Array.from({ length: maxRounds - member.responses.length }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground"
            >
              En attente...
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
