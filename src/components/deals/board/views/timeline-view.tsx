"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { BOARD_MEMBERS } from "@/agents/board/types";
import type { InitialAnalysis, DebateResponse } from "@/agents/board/types";

interface TimelineViewProps {
  memberAnalyses: Record<string, { memberName: string; analysis: InitialAnalysis }>;
  debateResponses: {
    roundNumber: number;
    memberId: string;
    memberName: string;
    response: DebateResponse;
  }[];
}

export function TimelineView({ memberAnalyses, debateResponses }: TimelineViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Build timeline data
  const rounds = useMemo(() => {
    const maxRound = Math.max(0, ...debateResponses.map((r) => r.roundNumber));
    const result: {
      roundNumber: number;
      label: string;
      members: {
        id: string;
        name: string;
        color: string;
        verdict?: string;
        confidence?: number;
        content: string;
        positionChanged?: boolean;
      }[];
    }[] = [];

    // Round 0: Initial analyses
    result.push({
      roundNumber: 0,
      label: "Analyses Initiales",
      members: BOARD_MEMBERS.map((m) => {
        const analysis = memberAnalyses[m.id]?.analysis;
        return {
          id: m.id,
          name: m.name,
          color: m.color,
          verdict: analysis?.verdict,
          confidence: analysis?.confidence,
          content: analysis
            ? `${analysis.arguments.length} arguments, ${analysis.concerns.length} concerns`
            : "En attente...",
        };
      }),
    });

    // Debate rounds
    for (let round = 1; round <= maxRound; round++) {
      const roundResponses = debateResponses.filter((r) => r.roundNumber === round);
      result.push({
        roundNumber: round,
        label: `Round ${round}`,
        members: BOARD_MEMBERS.map((m) => {
          const response = roundResponses.find((r) => r.memberId === m.id);
          return {
            id: m.id,
            name: m.name,
            color: m.color,
            verdict: response?.response.newVerdict ?? undefined,
            confidence: response?.response.newConfidence ?? undefined,
            content: response?.response.justification.slice(0, 100) + "..." || "En attente...",
            positionChanged: response?.response.positionChanged,
          };
        }),
      });
    }

    return result;
  }, [memberAnalyses, debateResponses]);

  const updateScrollButtons = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
  };

  useEffect(() => {
    updateScrollButtons();
  }, [rounds]);

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const scrollAmount = 400;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
    setTimeout(updateScrollButtons, 300);
  };

  return (
    <div className="relative">
      {/* Scroll buttons */}
      {canScrollLeft && (
        <Button
          variant="outline"
          size="icon"
          className="absolute left-0 top-1/2 z-10 -translate-y-1/2 bg-background shadow-md"
          onClick={() => scroll("left")}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      )}
      {canScrollRight && (
        <Button
          variant="outline"
          size="icon"
          className="absolute right-0 top-1/2 z-10 -translate-y-1/2 bg-background shadow-md"
          onClick={() => scroll("right")}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}

      {/* Timeline container */}
      <div
        ref={scrollRef}
        className="overflow-x-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent"
        onScroll={updateScrollButtons}
      >
        <div className="flex gap-6 pb-4 min-w-max px-8">
          {rounds.map((round) => (
            <div key={round.roundNumber} className="w-72 shrink-0">
              {/* Round header */}
              <div className="mb-4 flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-primary" />
                <span className="font-semibold">{round.label}</span>
              </div>

              {/* Member cards */}
              <div className="space-y-3">
                {round.members.map((member) => (
                  <div
                    key={member.id}
                    className={cn(
                      "rounded-lg border p-3 transition-all",
                      member.positionChanged && "ring-2 ring-purple-300"
                    )}
                    style={{
                      borderLeftColor: member.color,
                      borderLeftWidth: "4px",
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className="text-sm font-medium"
                        style={{ color: member.color }}
                      >
                        {member.name}
                      </span>
                      {member.verdict && (
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-xs",
                            member.verdict === "GO" && "bg-green-100 text-green-800",
                            member.verdict === "NO_GO" && "bg-red-100 text-red-800",
                            member.verdict === "NEED_MORE_INFO" && "bg-amber-100 text-amber-800"
                          )}
                        >
                          {member.positionChanged && "→ "}
                          {member.verdict === "NO_GO" ? "NO GO" : member.verdict}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {member.content}
                    </p>
                    {member.confidence !== undefined && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1 flex-1 rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${member.confidence}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {member.confidence}%
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline line */}
      <div className="absolute bottom-0 left-8 right-8 h-px bg-border" />
    </div>
  );
}
