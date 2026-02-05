"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { MessageSquare, Columns, Clock, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatView } from "./views/chat-view";
import { ColumnsView } from "./views/columns-view";
import { TimelineView } from "./views/timeline-view";
import { ArenaView } from "./views/arena-view";
import type { InitialAnalysis, DebateResponse } from "@/agents/board/types";

type ViewMode = "chat" | "columns" | "timeline" | "arena";

interface DebateViewerProps {
  memberAnalyses: Record<string, { memberName: string; analysis: InitialAnalysis }>;
  debateResponses: {
    roundNumber: number;
    memberId: string;
    memberName: string;
    response: DebateResponse;
  }[];
}

const VIEW_OPTIONS: { mode: ViewMode; label: string; icon: React.ElementType }[] = [
  { mode: "chat", label: "Chat", icon: MessageSquare },
  { mode: "columns", label: "Colonnes", icon: Columns },
  { mode: "timeline", label: "Timeline", icon: Clock },
  { mode: "arena", label: "Arena", icon: CircleDot },
];

export function DebateViewer({
  memberAnalyses,
  debateResponses,
}: DebateViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("chat");

  const renderView = useCallback(() => {
    switch (viewMode) {
      case "chat":
        return (
          <ChatView
            memberAnalyses={memberAnalyses}
            debateResponses={debateResponses}
          />
        );
      case "columns":
        return (
          <ColumnsView
            memberAnalyses={memberAnalyses}
            debateResponses={debateResponses}
          />
        );
      case "timeline":
        return (
          <TimelineView
            memberAnalyses={memberAnalyses}
            debateResponses={debateResponses}
          />
        );
      case "arena":
        return (
          <ArenaView
            memberAnalyses={memberAnalyses}
            debateResponses={debateResponses}
          />
        );
    }
  }, [viewMode, memberAnalyses, debateResponses]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden">
      {/* Header + Tab bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
          Historique du Debat
        </h3>
        <div className="flex gap-0.5 rounded-lg bg-slate-800/60 p-0.5">
          {VIEW_OPTIONS.map(({ mode, label, icon: Icon }) => (
            <button
              key={mode}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                viewMode === mode
                  ? "bg-slate-700 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-300"
              )}
              onClick={() => setViewMode(mode)}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* View content */}
      <div className="p-6">
        {renderView()}
      </div>
    </div>
  );
}
