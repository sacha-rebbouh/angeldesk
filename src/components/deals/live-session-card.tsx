"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Radio, Clock, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { queryKeys } from "@/lib/query-keys";
import { formatDuration } from "@/lib/live/ui-constants";
import type { SessionStatus } from "@/lib/live/types";

// =============================================================================
// Types
// =============================================================================

interface LiveSessionCardProps {
  dealId: string;
}

interface SessionData {
  id: string;
  status: SessionStatus;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
}

interface SessionsResponse {
  data: SessionData[];
}

// =============================================================================
// Helpers
// =============================================================================

const ACTIVE_STATUSES: SessionStatus[] = ["created", "bot_joining", "live", "processing"];

function isActiveSession(session: SessionData): boolean {
  return ACTIVE_STATUSES.includes(session.status);
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return "À l\u2019instant";
  if (diffMinutes < 60) return `Il y a ${diffMinutes} min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  if (diffDays === 1) return "Hier";
  if (diffDays < 7) return `Il y a ${diffDays} jours`;

  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

// =============================================================================
// API
// =============================================================================

async function fetchSessions(dealId: string): Promise<SessionsResponse> {
  const res = await fetch(`/api/live-sessions?dealId=${dealId}`);
  if (!res.ok) {
    throw new Error("Impossible de charger les sessions");
  }
  return res.json();
}

// =============================================================================
// Component
// =============================================================================

export default function LiveSessionCard({ dealId }: LiveSessionCardProps) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.live.sessions(dealId),
    queryFn: () => fetchSessions(dealId),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const sessions = data?.data ?? [];

  const { activeSession, latestCompleted } = useMemo(() => {
    const active = sessions.find(isActiveSession) ?? null;
    const completed = sessions.find((s) => s.status === "completed") ?? null;
    return { activeSession: active, latestCompleted: completed };
  }, [sessions]);

  // Loading skeleton
  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-3 animate-pulse">
            <div className="h-5 w-5 rounded-full bg-muted" />
            <div className="h-4 w-32 rounded bg-muted" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Active session — green pulsing
  if (activeSession) {
    return (
      <Card className="border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" />
              </span>
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-200">
                  Session live en cours
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  {activeSession.status === "bot_joining"
                    ? "Bot en cours de connexion..."
                    : "Coaching en temps réel actif"}
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className="bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-200 dark:border-green-700 gap-1"
            >
              <ArrowRight className="h-3 w-3" />
              Onglet Live
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Recent completed session
  if (latestCompleted) {
    const duration = formatDuration(latestCompleted.startedAt, latestCompleted.endedAt);
    const relativeDate = formatRelativeDate(latestCompleted.createdAt);

    return (
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Radio className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  Dernier call : {relativeDate}
                </p>
                {duration !== "\u2014" && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Durée : {duration}
                  </p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // No sessions at all
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-3">
          <Radio className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Aucune session live
            </p>
            <p className="text-xs text-muted-foreground">
              Lancez une session de coaching IA pendant vos calls fondateurs
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
