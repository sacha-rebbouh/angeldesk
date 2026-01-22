"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { BOARD_MEMBERS } from "@/agents/board/types";
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
  roundNumber: number;
  content: string;
  verdict?: string;
  confidence?: number;
  positionChanged?: boolean;
}

export function ChatView({ memberAnalyses, debateResponses }: ChatViewProps) {
  const memberColors = useMemo(() => {
    return BOARD_MEMBERS.reduce(
      (acc, m) => {
        acc[m.id] = m.color;
        return acc;
      },
      {} as Record<string, string>
    );
  }, []);

  // Build chat messages chronologically
  const messages = useMemo(() => {
    const msgs: ChatMessage[] = [];

    // Add initial analyses (round 0)
    Object.entries(memberAnalyses).forEach(([memberId, { memberName, analysis }]) => {
      msgs.push({
        type: "analysis",
        memberId,
        memberName,
        color: memberColors[memberId] ?? "#666",
        roundNumber: 0,
        content: formatAnalysis(analysis),
        verdict: analysis.verdict,
        confidence: analysis.confidence,
      });
    });

    // Add debate responses
    debateResponses.forEach(({ roundNumber, memberId, memberName, response }) => {
      msgs.push({
        type: "debate",
        memberId,
        memberName,
        color: memberColors[memberId] ?? "#666",
        roundNumber,
        content: response.justification,
        verdict: response.newVerdict ?? undefined,
        confidence: response.newConfidence ?? undefined,
        positionChanged: response.positionChanged,
      });
    });

    // Sort by round number, then by member order
    return msgs.sort((a, b) => {
      if (a.roundNumber !== b.roundNumber) return a.roundNumber - b.roundNumber;
      return BOARD_MEMBERS.findIndex((m) => m.id === a.memberId) -
        BOARD_MEMBERS.findIndex((m) => m.id === b.memberId);
    });
  }, [memberAnalyses, debateResponses, memberColors]);

  // Group by round
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
      {rounds.map(({ roundNumber, messages }) => (
        <div key={roundNumber}>
          {/* Round separator */}
          <div className="mb-4 flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium text-muted-foreground">
              {roundNumber === 0 ? "Analyses Initiales" : `Round ${roundNumber}`}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Messages */}
          <div className="space-y-4">
            {messages.map((msg, idx) => (
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
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{ backgroundColor: message.color }}
      >
        {message.memberName.charAt(0)}
      </div>

      {/* Content */}
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold" style={{ color: message.color }}>
            {message.memberName}
          </span>
          {message.verdict && (
            <Badge
              variant="secondary"
              className={cn(
                "text-xs",
                message.verdict === "GO" && "bg-green-100 text-green-800",
                message.verdict === "NO_GO" && "bg-red-100 text-red-800",
                message.verdict === "NEED_MORE_INFO" && "bg-amber-100 text-amber-800"
              )}
            >
              {message.verdict === "NO_GO" ? "NO GO" : message.verdict === "NEED_MORE_INFO" ? "NEED MORE" : message.verdict}
              {message.confidence !== undefined && ` (${message.confidence}%)`}
            </Badge>
          )}
          {message.positionChanged && (
            <Badge variant="outline" className="text-xs border-purple-300 text-purple-600">
              Position changee
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
          {message.content}
        </p>
      </div>
    </div>
  );
}

function formatAnalysis(analysis: InitialAnalysis): string {
  const parts: string[] = [];

  if (analysis.arguments.length > 0) {
    parts.push(
      "Arguments:\n" +
        analysis.arguments.map((a) => `• [${a.strength}] ${a.point}`).join("\n")
    );
  }

  if (analysis.concerns.length > 0) {
    parts.push(
      "Concerns:\n" +
        analysis.concerns.map((c) => `• [${c.severity}] ${c.concern}`).join("\n")
    );
  }

  return parts.join("\n\n");
}
