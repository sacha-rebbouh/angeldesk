"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Historique du Debat</CardTitle>
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {VIEW_OPTIONS.map(({ mode, label, icon: Icon }) => (
              <Button
                key={mode}
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 px-3",
                  viewMode === mode && "bg-background shadow-sm"
                )}
                onClick={() => setViewMode(mode)}
              >
                <Icon className="mr-1.5 h-4 w-4" />
                {label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>{renderView()}</CardContent>
    </Card>
  );
}
