"use client";

import { useMemo, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { BOARD_MEMBERS_PROD } from "@/agents/board/types";
import type { InitialAnalysis, DebateResponse } from "@/agents/board/types";

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

// Provider icon SVGs
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

const severityColor: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400",
  high: "bg-orange-500/15 text-orange-400",
  strong: "bg-emerald-500/15 text-emerald-400",
  moderate: "bg-blue-500/15 text-blue-400",
  medium: "bg-slate-500/15 text-slate-400",
  low: "bg-slate-500/10 text-slate-500",
};

export function ChatView({ memberAnalyses, debateResponses }: ChatViewProps) {
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
}

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
                message.verdict === "GO" && "bg-emerald-500/15 text-emerald-400",
                message.verdict === "NO_GO" && "bg-red-500/15 text-red-400",
                message.verdict === "NEED_MORE_INFO" && "bg-amber-500/15 text-amber-400"
              )}
            >
              {message.verdict === "NO_GO" ? "NO GO" : message.verdict === "NEED_MORE_INFO" ? "NEED MORE" : message.verdict}
              {message.confidence !== undefined && ` ${message.confidence}%`}
            </Badge>
          )}
          {message.positionChanged && (
            <Badge variant="secondary" className="text-[10px] border-0 bg-purple-500/15 text-purple-400 font-medium">
              Position changee
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
            ? "Reduire"
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
          {expanded ? "Reduire" : "Lire la suite"}
        </button>
      )}
    </div>
  );
}
