"use client";

import { useMemo, useCallback, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Radio,
  Loader2,
  AlertCircle,
  Clock,
  History,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { queryKeys } from "@/lib/query-keys";
import {
  SESSION_STATUS_LABELS,
  SESSION_STATUS_COLORS,
  formatDuration as formatDurationShared,
} from "@/lib/live/ui-constants";
import type { SessionStatus, PostCallReport as PostCallReportData } from "@/lib/live/types";

import LiveSessionLauncher from "@/app/(dashboard)/deals/[dealId]/live/components/live-session-launcher";
import ParticipantMapper from "@/app/(dashboard)/deals/[dealId]/live/components/participant-mapper";
import LiveAblyProvider from "@/app/(dashboard)/deals/[dealId]/live/components/ably-provider";
import SessionStatusBar from "@/app/(dashboard)/deals/[dealId]/live/components/session-status-bar";
import SessionControls from "@/app/(dashboard)/deals/[dealId]/live/components/session-controls";
import { CoachingFeed } from "@/app/(dashboard)/deals/[dealId]/live/components/coaching-feed";
import PostCallReport from "@/app/(dashboard)/deals/[dealId]/live/components/post-call-report";
import PostCallReanalysis from "@/app/(dashboard)/deals/[dealId]/live/components/post-call-reanalysis";

// =============================================================================
// Types
// =============================================================================

interface LiveTabContentProps {
  dealId: string;
  dealName: string;
}

interface SessionData {
  id: string;
  status: SessionStatus;
  dealId: string | null;
  meetingPlatform: string;
  participants: Array<{ name: string; role: string; speakerId: string }>;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt?: string;
  coachingCards?: Array<{
    id: string;
    type: string;
    priority: string;
    content: string;
    context: string | null;
    reference: string | null;
    suggestedQuestion: string | null;
    status: string;
    createdAt: string;
  }>;
  summary?: PostCallReportData | null;
}

interface SessionsResponse {
  data: SessionData[];
}

interface AnalysisCheckResponse {
  data: { hasAnalysis: boolean };
}

// =============================================================================
// Constants
// =============================================================================

const ACTIVE_STATUSES: SessionStatus[] = ["created", "bot_joining", "live", "processing"];

// =============================================================================
// API
// =============================================================================

async function fetchSessions(dealId: string): Promise<SessionsResponse> {
  const res = await fetch(
    `/api/live-sessions?dealId=${dealId}&includeSummary=true`
  );
  if (!res.ok) throw new Error("Impossible de charger les sessions");
  return res.json();
}

async function checkAnalysis(dealId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/deals/${dealId}/analyses`);
    if (!res.ok) return false;
    const json = await res.json();
    // API returns { data: null } when no analysis, { data: { id, ... } } when exists
    return json.data !== null;
  } catch {
    return false;
  }
}

// =============================================================================
// Helpers
// =============================================================================

function formatSessionDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// =============================================================================
// Component
// =============================================================================

export default function LiveTabContent({ dealId, dealName }: LiveTabContentProps) {
  const queryClient = useQueryClient();

  // Fetch all sessions for this deal
  const {
    data: sessionsData,
    isLoading: sessionsLoading,
    isError: sessionsError,
    refetch: refetchSessions,
  } = useQuery({
    queryKey: queryKeys.live.sessions(dealId),
    queryFn: () => fetchSessions(dealId),
    // Conditional polling: very aggressive when bot_joining/processing, moderate when live, off otherwise
    refetchInterval: (query) => {
      const sessions = query.state.data?.data ?? [];
      const active = sessions.find((s) => ACTIVE_STATUSES.includes(s.status));
      if (!active) return false;
      // Bot joining or processing: poll every 2s for fast UI transition
      if (active.status === "bot_joining" || active.status === "processing") return 2_000;
      // Live: poll every 15s (real-time updates via Ably)
      if (active.status === "live") return 15_000;
      return 10_000;
    },
    staleTime: 2_000,
  });

  // Check if deal has any analysis (for launcher)
  const { data: hasAnalysis } = useQuery({
    queryKey: [...queryKeys.analyses.byDeal(dealId), "check"],
    queryFn: () => checkAnalysis(dealId),
    staleTime: 60_000,
  });

  const sessions = sessionsData?.data ?? [];

  // Derive active session and history
  // Keep recently completed sessions (within 10min) visible as "active" for display
  const { activeSession, completedSessions } = useMemo(() => {
    const active = sessions.find((s) => ACTIVE_STATUSES.includes(s.status)) ?? null;

    // If no active session, check for recently completed (within last 10 minutes)
    const recentlyCompleted = !active
      ? sessions.find(
          (s) =>
            s.status === "completed" &&
            new Date(s.updatedAt || s.createdAt).getTime() >
              Date.now() - 10 * 60 * 1000
        ) ?? null
      : null;

    const displayActive = active || recentlyCompleted;

    const completed = sessions.filter(
      (s) =>
        (s.status === "completed" || s.status === "failed") &&
        s.id !== displayActive?.id
    );

    return { activeSession: displayActive, completedSessions: completed };
  }, [sessions]);

  // Fix: use only refetchSessions (no double invalidation)
  const handleRefresh = useCallback(() => {
    refetchSessions();
  }, [refetchSessions]);

  // ---- Loading state ----
  if (sessionsLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">
          Chargement des sessions...
        </p>
      </div>
    );
  }

  // ---- Error state ----
  if (sessionsError) {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 p-6 text-center">
        <AlertCircle className="h-8 w-8 mx-auto mb-3 text-red-500" />
        <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">
          Erreur de chargement
        </p>
        <p className="text-xs text-red-600 dark:text-red-400 mb-4">
          Impossible de charger les sessions de coaching.
        </p>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          Réessayer
        </Button>
      </div>
    );
  }

  // Is there a truly active (non-completed) session?
  const isLiveOrProcessing = activeSession && !["completed", "failed"].includes(activeSession.status);

  return (
    <div className="space-y-6">
      {/* Live/processing session takes priority */}
      {isLiveOrProcessing ? (
        <ActiveSessionView
          session={activeSession}
          dealId={dealId}
          dealName={dealName}
        />
      ) : (
        <>
          {/* Launcher always visible when no active live session */}
          <LiveSessionLauncher
            dealId={dealId}
            dealName={dealName}
            hasAnalysis={hasAnalysis ?? false}
          />

          {/* Show most recent completed session report inline */}
          {activeSession && activeSession.status === "completed" && (
            <ActiveSessionView
              session={activeSession}
              dealId={dealId}
              dealName={dealName}
            />
          )}
        </>
      )}

      {/* Session history */}
      {completedSessions.length > 0 && (
        <SessionHistory sessions={completedSessions} dealId={dealId} />
      )}
    </div>
  );
}

// =============================================================================
// Active Session View — renders different components based on status
// =============================================================================

function ActiveSessionView({
  session,
  dealId,
  dealName,
}: {
  session: SessionData;
  dealId: string;
  dealName: string;
}) {
  const participants = Array.isArray(session.participants)
    ? session.participants
    : [];

  // --- Created / Bot Joining ---
  if (session.status === "created" || session.status === "bot_joining") {
    return (
      <div className="space-y-4">
        {/* Waiting indicator */}
        <div className="rounded-lg border p-8 text-center">
          <div className="animate-pulse mb-3">
            <div className="mx-auto h-8 w-8 rounded-full bg-muted-foreground/20" />
          </div>
          <h3 className="text-lg font-medium mb-1">
            {session.status === "created"
              ? "Session créée..."
              : "Bot en cours de connexion..."}
          </h3>
          <p className="text-sm text-muted-foreground">
            Le bot rejoint votre réunion. Cela peut prendre quelques secondes.
          </p>
        </div>

        {/* Participant mapper — show if any participants detected */}
        {participants.length > 0 && (
          <ParticipantMapper
            sessionId={session.id}
            participants={participants}
            dealName={dealName}
          />
        )}
      </div>
    );
  }

  // --- Live ---
  if (session.status === "live") {
    const initialCards = session.coachingCards?.map((card) => ({
      id: card.id,
      type: card.type as "question" | "contradiction" | "new_info" | "negotiation",
      priority: card.priority as "high" | "medium" | "low",
      content: card.content,
      context: card.context,
      reference: card.reference,
      suggestedQuestion: card.suggestedQuestion,
      status: card.status as "active" | "addressed" | "dismissed" | "expired",
      createdAt: card.createdAt,
    }));

    return (
      <LiveAblyProvider sessionId={session.id}>
        <div className="space-y-4">
          {/* Status bar + controls row */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <SessionStatusBar
                sessionId={session.id}
                dealName={dealName}
                status={session.status}
                startedAt={session.startedAt ?? undefined}
              />
            </div>
            <SessionControls
              sessionId={session.id}
              dealId={dealId}
              status={session.status}
            />
          </div>

          {/* Participant mapper */}
          {participants.length > 0 && (
            <ParticipantMapper
              sessionId={session.id}
              participants={participants}
              dealName={dealName}
            />
          )}

          {/* Coaching feed */}
          <div className="rounded-lg border overflow-hidden" style={{ minHeight: 400 }}>
            <CoachingFeed
              sessionId={session.id}
              initialCards={initialCards}
            />
          </div>
        </div>
      </LiveAblyProvider>
    );
  }

  // --- Processing ---
  if (session.status === "processing") {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border p-8 text-center">
          <div className="animate-spin mx-auto mb-3 h-6 w-6 border-2 border-muted-foreground/30 border-t-foreground rounded-full" />
          <h3 className="text-lg font-medium mb-1">
            Génération du rapport...
          </h3>
          <p className="text-sm text-muted-foreground">
            Analyse de la transcription et génération du rapport post-call.
          </p>
        </div>

        {/* Show report placeholder during processing */}
        <PostCallReport sessionId={session.id} />
      </div>
    );
  }

  // --- Completed with summary ---
  if (session.status === "completed") {
    const summaryData = session.summary ?? undefined;
    return (
      <div className="space-y-4">
        <PostCallReport
          sessionId={session.id}
          summary={summaryData}
        />
        <PostCallReanalysis
          sessionId={session.id}
          dealId={dealId}
          summary={summaryData}
        />
      </div>
    );
  }

  // Fallback (should not happen, but safety net)
  return null;
}

// =============================================================================
// Session History
// =============================================================================

function SessionHistory({ sessions, dealId }: { sessions: SessionData[]; dealId: string }) {
  const queryClient = useQueryClient();
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const retryMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await fetch(`/api/live-sessions/${sessionId}/retry-report`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Erreur lors de la relance");
      return res.json();
    },
    onMutate: (sessionId) => setRetryingId(sessionId),
    onSettled: () => {
      setRetryingId(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.live.sessions(dealId) });
    },
  });

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <History className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-lg font-medium">Sessions précédentes</h3>
      </div>
      <div className="space-y-2">
        {sessions.map((session) => {
          const label = SESSION_STATUS_LABELS[session.status] ?? session.status;
          const colorClass = SESSION_STATUS_COLORS[session.status] ?? SESSION_STATUS_COLORS.completed;
          const duration = formatDurationShared(session.startedAt, session.endedAt);
          const isFailed = session.status === "failed";
          const isRetrying = retryingId === session.id;

          return (
            <div
              key={session.id}
              className="flex items-center justify-between rounded-lg border px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <Badge variant="outline" className={colorClass}>
                  {label}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {formatSessionDate(session.createdAt)}
                </span>
                {duration !== "—" && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {duration}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {session.summary && (
                  <span className="text-xs text-muted-foreground">
                    Rapport disponible
                  </span>
                )}
                {isFailed && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => retryMutation.mutate(session.id)}
                    disabled={isRetrying}
                    className="text-xs"
                  >
                    {isRetrying ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <RefreshCw className="h-3 w-3 mr-1" />
                    )}
                    Relancer le rapport
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
