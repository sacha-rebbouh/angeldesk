"use client";

import { memo, useMemo, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { BOARD_MEMBERS_PROD } from "@/agents/board/types";
import type { InitialAnalysis, DebateResponse } from "@/agents/board/types";
import { ProviderIcon } from "@/components/shared/provider-icon";

interface ChatViewProps {
  memberAnalyses: Record<string, { memberName: string; analysis: InitialAnalysis }>;
  debateResponses: {
    roundNumber: number;
    memberId: string;
    memberName: string;
    response: DebateResponse;
  }[];
}

interface ChatMessage {
  type: "analysis" | "debate";
  memberId: string;
  memberName: string;
  color: string;
  provider: string;
  roundNumber: number;
  verdict?: string;
  confidence?: number;
  positionChanged?: boolean;
  analysis?: InitialAnalysis;
  response?: DebateResponse;
}

const PREVIEW_ARGS = 3;
const PREVIEW_CONCERNS = 2;
const PREVIEW_JUSTIFICATION_CHARS = 250;


const severityColor: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400",
  high: "bg-orange-500/15 text-orange-400",
  strong: "bg-emerald-500/15 text-emerald-400",
  moderate: "bg-blue-500/15 text-blue-400",
  medium: "bg-slate-500/15 text-slate-400",
  low: "bg-slate-500/10 text-slate-500",
};

export const ChatView = memo(function ChatView({ memberAnalyses, debateResponses }: ChatViewProps) {
  const memberMap = useMemo(() => {
    return BOARD_MEMBERS_PROD.reduce(
      (acc, m) => {
        acc[m.id] = { color: m.color, provider: m.provider };
        return acc;
      },
      {} as Record<string, { color: string; provider: string }>
    );
  }, []);

  const messages = useMemo(() => {
    const msgs: ChatMessage[] = [];

    Object.entries(memberAnalyses).forEach(([memberId, { memberName, analysis }]) => {
      msgs.push({
        type: "analysis",
        memberId,
        memberName,
        color: memberMap[memberId]?.color ?? "#666",
        provider: memberMap[memberId]?.provider ?? "",
        roundNumber: 0,
        verdict: analysis.verdict,
        confidence: analysis.confidence,
        analysis,
      });
    });

    debateResponses.forEach(({ roundNumber, memberId, memberName, response }) => {
      msgs.push({
        type: "debate",
        memberId,
        memberName,
        color: memberMap[memberId]?.color ?? "#666",
        provider: memberMap[memberId]?.provider ?? "",
        roundNumber,
        verdict: response.newVerdict ?? undefined,
        confidence: response.newConfidence ?? undefined,
        positionChanged: response.positionChanged,
        response,
      });
    });

    return msgs.sort((a, b) => {
      if (a.roundNumber !== b.roundNumber) return a.roundNumber - b.roundNumber;
      return BOARD_MEMBERS_PROD.findIndex((m) => m.id === a.memberId) -
        BOARD_MEMBERS_PROD.findIndex((m) => m.id === b.memberId);
    });
  }, [memberAnalyses, debateResponses, memberMap]);

  const rounds = useMemo(() => {
    const grouped: Record<number, ChatMessage[]> = {};
    messages.forEach((msg) => {
      if (!grouped[msg.roundNumber]) grouped[msg.roundNumber] = [];
      grouped[msg.roundNumber].push(msg);
    });
    return Object.entries(grouped).map(([round, msgs]) => ({
      roundNumber: parseInt(round),
      messages: msgs,
    }));
  }, [messages]);

  return (
    <div className="space-y-6">
      {rounds.map(({ roundNumber, messages: roundMessages }) => (
        <div key={roundNumber}>
          {/* Round separator */}
          <div className="mb-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-800" />
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              {roundNumber === 0 ? "Analyses Initiales" : `Round ${roundNumber}`}
            </span>
            <div className="h-px flex-1 bg-slate-800" />
          </div>

          {/* Messages */}
          <div className="space-y-4">
            {roundMessages.map((msg, idx) => (
              <ChatBubble key={`${msg.memberId}-${msg.roundNumber}-${idx}`} message={msg} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
});

function ChatBubble({ message }: { message: ChatMessage }) {
  return (
    <div className="flex gap-3">
      {/* Avatar */}
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-lg"
        style={{ backgroundColor: message.color }}
      >
        <ProviderIcon provider={message.provider} className="h-4.5 w-4.5 text-white" />
      </div>

      {/* Content */}
      <div className="flex-1 space-y-1.5 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-white">
            {message.memberName}
          </span>
          {message.verdict && (
            <Badge
              variant="secondary"
              className={cn(
                "text-[10px] border-0 font-medium",
                (message.verdict === "VERY_FAVORABLE" || message.verdict === "FAVORABLE") && "bg-emerald-500/15 text-emerald-400",
                (message.verdict === "ALERT_DOMINANT") && "bg-red-500/15 text-red-400",
                message.verdict === "VIGILANCE" && "bg-orange-500/15 text-orange-400",
                (message.verdict === "CONTRASTED" || message.verdict === "NEED_MORE_INFO") && "bg-amber-500/15 text-amber-400"
              )}
            >
              {message.verdict.replace(/_/g, " ")}
              {message.confidence !== undefined && ` ${message.confidence}%`}
            </Badge>
          )}
          {message.positionChanged && (
            <Badge variant="secondary" className="text-[10px] border-0 bg-purple-500/15 text-purple-400 font-medium">
              Position changée
            </Badge>
          )}
        </div>
        <div className="rounded-xl rounded-tl-sm bg-slate-800/50 border border-slate-700/30 px-4 py-3">
          {message.type === "analysis" && message.analysis ? (
            <AnalysisBubbleContent analysis={message.analysis} />
          ) : message.response ? (
            <DebateBubbleContent response={message.response} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AnalysisBubbleContent({ analysis }: { analysis: InitialAnalysis }) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((v) => !v), []);

  const hasMoreArgs = analysis.arguments.length > PREVIEW_ARGS;
  const hasMoreConcerns = analysis.concerns.length > PREVIEW_CONCERNS;
  const canExpand = hasMoreArgs || hasMoreConcerns;

  const shownArgs = expanded ? analysis.arguments : analysis.arguments.slice(0, PREVIEW_ARGS);
  const shownConcerns = expanded ? analysis.concerns : analysis.concerns.slice(0, PREVIEW_CONCERNS);

  return (
    <div className="space-y-3">
      {/* Arguments */}
      {analysis.arguments.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-300">
            Arguments
            {!expanded && hasMoreArgs && (
              <span className="ml-1 font-normal text-slate-500">
                ({PREVIEW_ARGS}/{analysis.arguments.length})
              </span>
            )}
          </p>
          <ul className="space-y-1.5">
            {shownArgs.map((arg, i) => (
              <li key={i} className="flex gap-2 text-[12px] leading-relaxed text-slate-400">
                <Badge
                  variant="secondary"
                  className={cn(
                    "mt-0.5 shrink-0 text-[9px] border-0 px-1.5 py-0 h-4",
                    severityColor[arg.strength] ?? severityColor.moderate
                  )}
                >
                  {arg.strength}
                </Badge>
                <span>{arg.point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Concerns */}
      {shownConcerns.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-300">
            Concerns
            {!expanded && hasMoreConcerns && (
              <span className="ml-1 font-normal text-slate-500">
                ({PREVIEW_CONCERNS}/{analysis.concerns.length})
              </span>
            )}
          </p>
          <ul className="space-y-1.5">
            {shownConcerns.map((c, i) => (
              <li key={i} className="flex gap-2 text-[12px] leading-relaxed text-slate-400">
                <Badge
                  variant="secondary"
                  className={cn(
                    "mt-0.5 shrink-0 text-[9px] border-0 px-1.5 py-0 h-4",
                    severityColor[c.severity] ?? severityColor.medium
                  )}
                >
                  {c.severity}
                </Badge>
                <span>{c.concern}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Expand toggle */}
      {canExpand && (
        <button
          onClick={toggle}
          className="flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-300 transition-colors"
        >
          <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
          {expanded
            ? "Réduire"
            : `Voir tout (${analysis.arguments.length} args, ${analysis.concerns.length} concerns)`}
        </button>
      )}
    </div>
  );
}

function DebateBubbleContent({ response }: { response: DebateResponse }) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((v) => !v), []);

  const text = response.justification;
  const isLong = text.length > PREVIEW_JUSTIFICATION_CHARS;

  return (
    <div>
      <p className="text-[12px] text-slate-300 leading-relaxed">
        {expanded || !isLong
          ? text
          : text.slice(0, PREVIEW_JUSTIFICATION_CHARS) + "..."}
      </p>
      {isLong && (
        <button
          onClick={toggle}
          className="flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-300 transition-colors mt-2"
        >
          <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
          {expanded ? "Réduire" : "Lire la suite"}
        </button>
      )}
    </div>
  );
}
