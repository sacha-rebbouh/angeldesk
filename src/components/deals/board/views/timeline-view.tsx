"use client";

import { memo, useMemo, useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { BOARD_MEMBERS_PROD } from "@/agents/board/types";
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

const PREVIEW_CHARS = 150;

interface TimelineMember {
  id: string;
  name: string;
  color: string;
  verdict?: string;
  confidence?: number;
  positionChanged?: boolean;
  analysis?: InitialAnalysis;
  response?: DebateResponse;
}

interface TimelineRound {
  roundNumber: number;
  label: string;
  members: TimelineMember[];
}

export const TimelineView = memo(function TimelineView({ memberAnalyses, debateResponses }: TimelineViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const rounds = useMemo(() => {
    const maxRound = Math.max(0, ...debateResponses.map((r) => r.roundNumber));
    const result: TimelineRound[] = [];

    // Round 0: Initial analyses
    result.push({
      roundNumber: 0,
      label: "Analyses Initiales",
      members: BOARD_MEMBERS_PROD.map((m) => {
        const analysis = memberAnalyses[m.id]?.analysis;
        return {
          id: m.id,
          name: m.name,
          color: m.color,
          verdict: analysis?.verdict,
          confidence: analysis?.confidence,
          analysis,
        };
      }),
    });

    for (let round = 1; round <= maxRound; round++) {
      const roundResponses = debateResponses.filter((r) => r.roundNumber === round);
      result.push({
        roundNumber: round,
        label: `Round ${round}`,
        members: BOARD_MEMBERS_PROD.map((m) => {
          const resp = roundResponses.find((r) => r.memberId === m.id);
          return {
            id: m.id,
            name: m.name,
            color: m.color,
            verdict: resp?.response.newVerdict ?? undefined,
            confidence: resp?.response.newConfidence ?? undefined,
            positionChanged: resp?.response.positionChanged,
            response: resp?.response,
          };
        }),
      });
    }

    return result;
  }, [memberAnalyses, debateResponses]);

  const updateScrollButtons = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
  }, []);

  useEffect(() => {
    updateScrollButtons();
  }, [rounds, updateScrollButtons]);

  const scroll = useCallback((direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const scrollAmount = 400;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
    setTimeout(updateScrollButtons, 300);
  }, [updateScrollButtons]);

  return (
    <div className="relative">
      {/* Scroll buttons */}
      {canScrollLeft && (
        <Button
          variant="outline"
          size="icon"
          className="absolute left-0 top-1/2 z-10 -translate-y-1/2 bg-slate-900 border-slate-700 hover:bg-slate-800 text-slate-300 shadow-xl"
          onClick={() => scroll("left")}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      )}
      {canScrollRight && (
        <Button
          variant="outline"
          size="icon"
          className="absolute right-0 top-1/2 z-10 -translate-y-1/2 bg-slate-900 border-slate-700 hover:bg-slate-800 text-slate-300 shadow-xl"
          onClick={() => scroll("right")}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}

      {/* Timeline container */}
      <div
        ref={scrollRef}
        className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent"
        onScroll={updateScrollButtons}
      >
        <div className="flex gap-5 pb-4 min-w-max px-8">
          {rounds.map((round) => (
            <div key={round.roundNumber} className="w-80 shrink-0">
              {/* Round header */}
              <div className="mb-4 flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-amber-500/70" />
                <span className="font-medium text-sm text-white">{round.label}</span>
              </div>

              {/* Member cards */}
              <div className="space-y-2.5">
                {round.members.map((member) => (
                  <TimelineMemberCard
                    key={member.id}
                    member={member}
                    isInitial={round.roundNumber === 0}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

function TimelineMemberCard({
  member,
  isInitial,
}: {
  member: TimelineMember;
  isInitial: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((v) => !v), []);

  // Determine if we have expandable content
  const hasAnalysis = isInitial && member.analysis;
  const hasResponse = !isInitial && member.response;
  const isEmpty = !hasAnalysis && !hasResponse;

  const justification = member.response?.justification ?? "";
  const isLongJustification = justification.length > PREVIEW_CHARS;
  const canExpand = hasAnalysis
    ? (member.analysis!.arguments.length > 0 || member.analysis!.concerns.length > 0)
    : isLongJustification;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-all",
        member.positionChanged
          ? "ring-1 ring-purple-500/40 border-purple-500/30 bg-purple-500/5"
          : "border-slate-700/50 bg-slate-800/30"
      )}
      style={{
        borderLeftColor: member.color,
        borderLeftWidth: "3px",
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span
          className="text-xs font-medium"
          style={{ color: member.color }}
        >
          {member.name}
        </span>
        {member.verdict && (
          <Badge
            variant="secondary"
            className={cn(
              "text-[10px] border-0",
              member.verdict === "GO" && "bg-emerald-500/15 text-emerald-400",
              member.verdict === "NO_GO" && "bg-red-500/15 text-red-400",
              member.verdict === "NEED_MORE_INFO" && "bg-amber-500/15 text-amber-400"
            )}
          >
            {member.positionChanged && "\u2192 "}
            {member.verdict === "NO_GO" ? "NO GO" : member.verdict}
          </Badge>
        )}
      </div>

      {/* Initial analysis content */}
      {hasAnalysis && (
        <div className="space-y-1.5">
          {!expanded ? (
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {member.analysis!.arguments[0]?.point
                ? member.analysis!.arguments[0].point.slice(0, PREVIEW_CHARS) +
                  (member.analysis!.arguments[0].point.length > PREVIEW_CHARS ? "..." : "")
                : `${member.analysis!.arguments.length} arguments, ${member.analysis!.concerns.length} concerns`}
            </p>
          ) : (
            <>
              {member.analysis!.arguments.length > 0 && (
                <div className="text-[11px] space-y-1">
                  <p className="font-medium text-slate-300">
                    Arguments ({member.analysis!.arguments.length})
                  </p>
                  <ul className="space-y-1 text-slate-400">
                    {member.analysis!.arguments.map((arg, i) => (
                      <li key={i} className="leading-relaxed pl-2 border-l border-slate-700/50">
                        {arg.point}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {member.analysis!.concerns.length > 0 && (
                <div className="text-[11px] space-y-1">
                  <p className="font-medium text-slate-300">
                    Concerns ({member.analysis!.concerns.length})
                  </p>
                  <ul className="space-y-1 text-slate-400">
                    {member.analysis!.concerns.map((c, i) => (
                      <li key={i} className="leading-relaxed pl-2 border-l border-red-500/30">
                        {c.concern}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Debate response content */}
      {hasResponse && (
        <p className="text-[11px] text-slate-400 leading-relaxed">
          {expanded || !isLongJustification
            ? justification
            : justification.slice(0, PREVIEW_CHARS) + "..."}
        </p>
      )}

      {/* Empty state */}
      {isEmpty && (
        <p className="text-[11px] text-slate-500 italic">En attente...</p>
      )}

      {/* Confidence bar */}
      {member.confidence !== undefined && (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1 flex-1 rounded-full bg-slate-700/50">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                member.verdict === "GO" && "bg-emerald-400",
                member.verdict === "NO_GO" && "bg-red-400",
                (!member.verdict || member.verdict === "NEED_MORE_INFO") && "bg-amber-400"
              )}
              style={{ width: `${member.confidence}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-500">
            {member.confidence}%
          </span>
        </div>
      )}

      {/* Expand toggle */}
      {canExpand && (
        <button
          onClick={toggle}
          className="flex items-center gap-1 text-[10px] font-medium text-slate-500 hover:text-slate-300 transition-colors mt-1.5"
        >
          <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
          {expanded ? "Reduire" : "Lire la suite"}
        </button>
      )}
    </div>
  );
}
