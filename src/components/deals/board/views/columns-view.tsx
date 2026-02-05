"use client";

import { useMemo, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
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

const PREVIEW_ARGS = 3;
const PREVIEW_CONCERNS = 2;
const PREVIEW_JUSTIFICATION_CHARS = 180;

export function ColumnsView({ memberAnalyses, debateResponses }: ColumnsViewProps) {
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
    <div className="grid grid-cols-4 gap-3">
      {memberData.map((member) => (
        <div key={member.id} className="space-y-3">
          {/* Column header */}
          <div
            className="rounded-lg p-3 text-center font-medium text-white text-sm"
            style={{ backgroundColor: member.color }}
          >
            {member.name}
          </div>

          {/* Initial analysis */}
          {member.analysis && (
            <AnalysisCard analysis={member.analysis} />
          )}

          {/* Debate responses */}
          {member.responses.map((r) => (
            <ResponseCard key={r.roundNumber} roundNumber={r.roundNumber} response={r.response} />
          ))}

          {/* Empty state for missing rounds */}
          {Array.from({ length: maxRounds - member.responses.length }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="rounded-lg border border-dashed border-slate-700/30 p-3 text-center text-[11px] text-slate-600"
            >
              En attente...
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function AnalysisCard({ analysis }: { analysis: InitialAnalysis }) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((v) => !v), []);

  const hasMoreArgs = analysis.arguments.length > PREVIEW_ARGS;
  const hasMoreConcerns = analysis.concerns.length > PREVIEW_CONCERNS;
  const canExpand = hasMoreArgs || hasMoreConcerns;

  const shownArgs = expanded ? analysis.arguments : analysis.arguments.slice(0, PREVIEW_ARGS);
  const shownConcerns = expanded ? analysis.concerns : analysis.concerns.slice(0, PREVIEW_CONCERNS);

  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
          Analyse
        </span>
        <Badge
          variant="secondary"
          className={cn(
            "text-[10px] border-0",
            analysis.verdict === "GO" && "bg-emerald-500/15 text-emerald-400",
            analysis.verdict === "NO_GO" && "bg-red-500/15 text-red-400",
            analysis.verdict === "NEED_MORE_INFO" && "bg-amber-500/15 text-amber-400"
          )}
        >
          {analysis.verdict === "NO_GO" ? "NO GO" : analysis.verdict}
        </Badge>
      </div>

      <div className="text-xs space-y-1.5">
        <p className="font-medium text-slate-300">Arguments ({analysis.arguments.length})</p>
        <ul className="space-y-1 text-slate-400">
          {shownArgs.map((arg, i) => (
            <li key={i} className="text-[11px] leading-relaxed pl-2 border-l border-slate-700/50">
              {arg.point}
            </li>
          ))}
        </ul>
      </div>

      {analysis.concerns.length > 0 && (
        <div className="text-xs space-y-1.5">
          <p className="font-medium text-slate-300">Concerns ({analysis.concerns.length})</p>
          <ul className="space-y-1 text-slate-400">
            {shownConcerns.map((c, i) => (
              <li key={i} className="text-[11px] leading-relaxed pl-2 border-l border-red-500/30">
                {c.concern}
              </li>
            ))}
          </ul>
        </div>
      )}

      {canExpand && (
        <button
          onClick={toggle}
          className="flex items-center gap-1 text-[10px] font-medium text-slate-500 hover:text-slate-300 transition-colors pt-1"
        >
          <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
          {expanded ? "Reduire" : `Voir tout (${analysis.arguments.length} args, ${analysis.concerns.length} concerns)`}
        </button>
      )}
    </div>
  );
}

function ResponseCard({ roundNumber, response }: { roundNumber: number; response: DebateResponse }) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((v) => !v), []);

  const isLong = response.justification.length > PREVIEW_JUSTIFICATION_CHARS;
  const displayText = expanded || !isLong
    ? response.justification
    : response.justification.slice(0, PREVIEW_JUSTIFICATION_CHARS) + "...";

  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-2",
        response.positionChanged
          ? "border-purple-500/30 bg-purple-500/5"
          : "border-slate-700/50 bg-slate-800/30"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
          Round {roundNumber}
        </span>
        {response.positionChanged && response.newVerdict && (
          <Badge
            variant="secondary"
            className={cn(
              "text-[10px] border-0",
              response.newVerdict === "GO" && "bg-emerald-500/15 text-emerald-400",
              response.newVerdict === "NO_GO" && "bg-red-500/15 text-red-400",
              response.newVerdict === "NEED_MORE_INFO" && "bg-amber-500/15 text-amber-400"
            )}
          >
            &rarr; {response.newVerdict === "NO_GO" ? "NO GO" : response.newVerdict}
          </Badge>
        )}
      </div>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        {displayText}
      </p>
      {isLong && (
        <button
          onClick={toggle}
          className="flex items-center gap-1 text-[10px] font-medium text-slate-500 hover:text-slate-300 transition-colors"
        >
          <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
          {expanded ? "Reduire" : "Lire la suite"}
        </button>
      )}
    </div>
  );
}
