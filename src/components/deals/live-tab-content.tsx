"use client";

import { useMemo, useCallback, useState, useEffect, memo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useChannel } from "ably/react";
import type { Message } from "ably";
import * as Ably from "ably";
import {
  Loader2,
  AlertCircle,
  Clock,
  History,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  FileText,
  Users,
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
  userName?: string;
  founderNames?: string[];
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

// =============================================================================
// Constants
// =============================================================================

const ACTIVE_STATUSES: SessionStatus[] = ["created", "bot_joining", "live", "processing"];
const EMPTY_SESSIONS: SessionData[] = [];
const EMPTY_PARTICIPANTS: Array<{ name: string; role: string; speakerId: string }> = [];

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs]);

  return now;
}

// =============================================================================
// API
// =============================================================================

async function fetchSessions(dealId: string): Promise<SessionsResponse> {
  const res = await fetch(
    `/api/live-sessions?dealId=${dealId}&includeSummary=true&includeCards=true`
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

export default memo(function LiveTabContent({ dealId, dealName, userName, founderNames }: LiveTabContentProps) {
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
      const sessions = query.state.data?.data ?? EMPTY_SESSIONS;
      const active = sessions.find((s) => ACTIVE_STATUSES.includes(s.status));
      if (!active) return false;
      // Bot joining or processing: poll every 2s for fast UI transition
      if (active.status === "bot_joining" || active.status === "processing") return 2_000;
      // Live: poll every 15s (real-time updates via Ably)
      if (active.status === "live") return 15_000;
      return 10_000;
    },
    // CRITICAL: keep polling even when tab is in background (user is on their meeting app)
    refetchIntervalInBackground: true,
    staleTime: 2_000,
  });

  // Check if deal has any analysis (for launcher)
  const { data: hasAnalysis } = useQuery({
    queryKey: [...queryKeys.analyses.byDeal(dealId), "check"],
    queryFn: () => checkAnalysis(dealId),
    staleTime: 60_000,
  });

  const sessions = sessionsData?.data ?? EMPTY_SESSIONS;
  const nowMs = useNow(60_000);

  // Derive active session and history
  // Keep recently completed sessions (within 10min) visible as "active" for display
  const { activeSession, completedSessions } = useMemo(() => {
    const active = sessions.find((s) => ACTIVE_STATUSES.includes(s.status)) ?? null;

    // If no active session, check for recently completed/failed (within last 2 hours)
    // Wide window so the user can reinvite the bot if the meeting is still going
    const recentlyCompleted = !active
      ? sessions.find(
          (s) =>
            (s.status === "completed" || s.status === "failed") &&
            new Date(s.updatedAt || s.createdAt).getTime() >
              nowMs - 2 * 60 * 60 * 1000
        ) ?? null
      : null;

    const displayActive = active || recentlyCompleted;

    const completed = sessions.filter(
      (s) =>
        (s.status === "completed" || s.status === "failed") &&
        s.id !== displayActive?.id
    );

    return { activeSession: displayActive, completedSessions: completed };
  }, [sessions, nowMs]);

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
          userName={userName}
          founderNames={founderNames}
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
});

// =============================================================================
// useSessionRealtimeEvents — standalone Ably listener for bot_joining state
// Provides instant status + participant detection before LiveAblyProvider mounts.
// Creates its own Ably connection (separate from the coaching feed provider).
// =============================================================================

function useSessionRealtimeEvents(sessionId: string, enabled: boolean) {
  const [realtimeStatus, setRealtimeStatus] = useState<SessionStatus | null>(null);
  const [realtimeParticipants, setRealtimeParticipants] = useState<Array<{ name: string; role: string }>>(EMPTY_PARTICIPANTS);
  const [liveDetectedAt, setLiveDetectedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let client: Ably.Realtime | null = null;
    let channel: Ably.RealtimeChannel | null = null;
    let disposed = false;

    async function connect() {
      try {
        const res = await fetch(
          `/api/coaching/ably-token?sessionId=${sessionId}`
        );
        if (!res.ok || disposed) return;
        const { data: tokenDetails } = await res.json();
        if (disposed) return;

        client = new Ably.Realtime({ token: tokenDetails.token });
        channel = client.channels.get(`live-session:${sessionId}`);

        channel.subscribe("session-status", (msg: Ably.Message) => {
          if (disposed || !msg.data?.status) return;
          const status = msg.data.status as SessionStatus;
          setRealtimeStatus(status);
          if (status === "live") {
            setLiveDetectedAt(new Date().toISOString());
          }
        });

        channel.subscribe("participant-joined", (msg: Ably.Message) => {
          if (disposed || !msg.data?.name) return;
          const { name, role } = msg.data as { name: string; role: string };
          setRealtimeParticipants((prev) => {
            if (prev.some((p) => p.name === name)) return prev;
            return [...prev, { name, role: role || "other" }];
          });
        });
      } catch (err) {
        console.warn("[useSessionRealtimeEvents] Connection failed:", err);
      }
    }

    connect();

    return () => {
      disposed = true;
      if (channel) {
        try { channel.unsubscribe(); } catch {}
      }
      if (client) {
        try { client.close(); } catch {}
      }
    };
  }, [sessionId, enabled]);

  return { realtimeStatus, realtimeParticipants, liveDetectedAt };
}

// =============================================================================
// Active Session View — renders different components based on status
// Uses standalone Ably listener for instant bot_joining → live transition.
// =============================================================================

const ActiveSessionView = memo(function ActiveSessionView({
  session,
  dealId,
  dealName,
  userName,
  founderNames,
}: {
  session: SessionData;
  dealId: string;
  dealName: string;
  userName?: string;
  founderNames?: string[];
}) {
  const polledParticipants = Array.isArray(session.participants)
    ? session.participants
    : EMPTY_PARTICIPANTS;

  // Standalone Ably listener — active only during bot_joining/created
  const isWaiting =
    session.status === "created" || session.status === "bot_joining";
  const { realtimeStatus, realtimeParticipants, liveDetectedAt } =
    useSessionRealtimeEvents(session.id, isWaiting);

  // Effective status: realtime event takes priority over polled status
  const effectiveStatus = realtimeStatus ?? session.status;
  const nowMs = useNow(60_000);

  // Merge polled + realtime participants (deduplicated by name)
  const allParticipants = useMemo(() => {
    const base = [...polledParticipants];
    for (const rp of realtimeParticipants) {
      if (!base.some((bp) => bp.name === rp.name)) {
        base.push({
          name: rp.name,
          role: rp.role,
          speakerId: `spk_${rp.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
        });
      }
    }
    return base;
  }, [polledParticipants, realtimeParticipants]);

  // Effective startedAt: use live detection timestamp if server hasn't synced yet
  const effectiveStartedAt = session.startedAt ?? liveDetectedAt ?? undefined;

  // Memoize initialCards to prevent re-creating on every render
  const initialCards = useMemo(() => {
    if (!session.coachingCards || session.coachingCards.length === 0) return undefined;
    return session.coachingCards.map((card) => ({
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
  }, [session.coachingCards]);

  // --- Created / Bot Joining ---
  if (effectiveStatus === "created" || effectiveStatus === "bot_joining") {
    return (
      <div className="space-y-4">
        {/* Waiting indicator */}
        <div className="rounded-lg border p-8 text-center">
          <div className="animate-pulse mb-3">
            <div className="mx-auto h-8 w-8 rounded-full bg-muted-foreground/20" />
          </div>
          <h3 className="text-lg font-medium mb-1">
            {effectiveStatus === "created"
              ? "Session créée..."
              : "Bot en cours de connexion..."}
          </h3>
          <p className="text-sm text-muted-foreground mb-3">
            Le bot rejoint votre réunion. Cela peut prendre quelques secondes.
          </p>
          {effectiveStatus === "bot_joining" && (
            <SessionControls
              sessionId={session.id}
              dealId={dealId}
              status={effectiveStatus}
            />
          )}
        </div>

        {/* Participant mapper — show if any participants detected via Ably */}
        {allParticipants.length > 0 && (
          <ParticipantMapper
            sessionId={session.id}
            participants={allParticipants}
            dealName={dealName}
            userName={userName}
            founderNames={founderNames}
          />
        )}
      </div>
    );
  }

  // --- Live ---
  if (effectiveStatus === "live") {
    return (
      <LiveAblyProvider sessionId={session.id}>
        <LiveSessionView
          session={session}
          dealId={dealId}
          dealName={dealName}
          participants={allParticipants}
          initialCards={initialCards}
          userName={userName}
          founderNames={founderNames}
          startedAtOverride={effectiveStartedAt}
        />
      </LiveAblyProvider>
    );
  }

  // --- Processing ---
  if (effectiveStatus === "processing") {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border p-8 text-center">
          <div className="animate-spin mx-auto mb-3 h-6 w-6 border-2 border-muted-foreground/30 border-t-foreground rounded-full" />
          <h3 className="text-lg font-medium mb-1">
            Génération du rapport...
          </h3>
          <p className="text-sm text-muted-foreground mb-3">
            Analyse de la transcription et génération du rapport post-call.
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            Le meeting est encore en cours ? Réinvitez le bot.
          </p>
          <SessionControls
            sessionId={session.id}
            dealId={dealId}
            status={effectiveStatus}
          />
        </div>

        {/* Show report placeholder during processing */}
        <PostCallReport />
      </div>
    );
  }

  // --- Completed / Failed with summary ---
  if (effectiveStatus === "completed" || effectiveStatus === "failed") {
    const summaryData = session.summary ?? undefined;
    // Show reinvite if session is recent (< 2h)
    const isRecent = new Date(session.updatedAt || session.createdAt).getTime() > nowMs - 2 * 60 * 60 * 1000;
    return (
      <div className="space-y-4">
        {isRecent && (
          <div className="flex items-center justify-between rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 px-4 py-3">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Le meeting est encore en cours ? Réinvitez le bot pour reprendre le coaching.
            </p>
            <SessionControls
              sessionId={session.id}
              dealId={dealId}
              status={effectiveStatus}
            />
          </div>
        )}
        {summaryData && (
          <PostCallReport summary={summaryData} />
        )}
        {summaryData && (
          <PostCallReanalysis
            sessionId={session.id}
            summary={summaryData}
          />
        )}
      </div>
    );
  }

  // Fallback (should not happen, but safety net)
  return null;
});

// =============================================================================
// Session History
// =============================================================================

// =============================================================================
// Live Session View — live status with collapsible participant mapper
// =============================================================================

const LiveSessionView = memo(function LiveSessionView({
  session,
  dealId,
  dealName,
  participants: initialParticipants,
  initialCards,
  userName,
  founderNames,
  startedAtOverride,
}: {
  session: SessionData;
  dealId: string;
  dealName: string;
  participants: Array<{ name: string; role: string; speakerId: string }>;
  initialCards?: Array<{
    id: string;
    type: "question" | "contradiction" | "new_info" | "negotiation";
    priority: "high" | "medium" | "low";
    content: string;
    context: string | null;
    reference: string | null;
    suggestedQuestion: string | null;
    status: "active" | "addressed" | "dismissed" | "expired";
    createdAt: string;
  }>;
  userName?: string;
  founderNames?: string[];
  startedAtOverride?: string;
}) {
  const [showParticipants, setShowParticipants] = useState(false);
  const [realtimeParticipants, setRealtimeParticipants] = useState<
    Array<{ name: string; role: string }>
  >([]);

  const liveParticipants = useMemo(() => {
    const base = [...initialParticipants];
    for (const rp of realtimeParticipants) {
      if (!base.some((bp) => bp.name === rp.name)) {
        base.push({
          name: rp.name,
          role: rp.role,
          speakerId: `spk_${rp.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
        });
      }
    }
    return base;
  }, [initialParticipants, realtimeParticipants]);

  // Listen for real-time participant-joined Ably events
  const handleParticipantJoined = useCallback((message: Message) => {
    if (!message.data) return;
    const { name, role } = message.data as { name: string; role: string };
    setRealtimeParticipants((prev) => {
      if (prev.some((p) => p.name === name)) return prev;
      return [...prev, { name, role }];
    });
  }, []);

  useChannel(`live-session:${session.id}`, "participant-joined", handleParticipantJoined);

  const toggleParticipants = useCallback(() => {
    setShowParticipants((prev) => !prev);
  }, []);

  return (
    <div className="space-y-4">
      {/* Status bar + controls + participants toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <SessionStatusBar
            sessionId={session.id}
            dealName={dealName}
            status={session.status}
            startedAt={startedAtOverride ?? session.startedAt ?? undefined}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleParticipants}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
          >
            <Users className="h-3.5 w-3.5" />
            <span>
              {liveParticipants.length > 0
                ? `${liveParticipants.length} participant${liveParticipants.length > 1 ? "s" : ""}`
                : "Participants"}
            </span>
            {showParticipants ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
          <SessionControls
            sessionId={session.id}
            dealId={dealId}
            status={session.status}
          />
        </div>
      </div>

      {/* Collapsible participant mapper */}
      {showParticipants && (
        <ParticipantMapper
          sessionId={session.id}
          participants={liveParticipants}
          dealName={dealName}
          userName={userName}
          founderNames={founderNames}
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
  );
});

// =============================================================================
// Session History
// =============================================================================

const SessionHistory = memo(function SessionHistory({ sessions, dealId }: { sessions: SessionData[]; dealId: string }) {
  const queryClient = useQueryClient();
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const toggleExpand = useCallback((sessionId: string) => {
    setExpandedId((prev) => (prev === sessionId ? null : sessionId));
  }, []);

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
          const hasSummary = !!session.summary;
          const isExpanded = expandedId === session.id;

          return (
            <div key={session.id} className="rounded-lg border overflow-hidden">
              <div
                className={`flex items-center justify-between px-4 py-3 ${hasSummary ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}`}
                onClick={hasSummary ? () => toggleExpand(session.id) : undefined}
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
                  {hasSummary && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      {isExpanded ? "Masquer le rapport" : "Voir le rapport"}
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </span>
                  )}
                  {isFailed && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        retryMutation.mutate(session.id);
                      }}
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
              {isExpanded && hasSummary && (
                <div className="border-t px-4 py-4">
                  <PostCallReport summary={session.summary!} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
