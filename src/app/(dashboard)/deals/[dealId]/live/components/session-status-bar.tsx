"use client";

import { useState, useEffect, useCallback, useMemo, memo } from "react";
import { useChannel } from "ably/react";
import type { Message } from "ably";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AblySessionStatusEvent } from "@/lib/live/types";

// =============================================================================
// Types
// =============================================================================

interface SessionStatusBarProps {
  sessionId: string;
  dealName: string;
  status: string;
  startedAt?: string;
}

// =============================================================================
// Constants
// =============================================================================

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  created: {
    label: "Préparation...",
    className: "text-muted-foreground",
  },
  bot_joining: {
    label: "Bot en cours de connexion...",
    className: "text-amber-600",
  },
  live: {
    label: "En direct",
    className: "text-red-600 font-semibold",
  },
  processing: {
    label: "Génération du rapport...",
    className: "text-blue-600",
  },
};

// =============================================================================
// Helpers
// =============================================================================

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// =============================================================================
// Timer Hook
// =============================================================================

function useElapsedTimer(startedAt: string | undefined, isLive: boolean) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt || !isLive) {
      setElapsed(0);
      return;
    }

    const startMs = new Date(startedAt).getTime();

    function tick() {
      const now = Date.now();
      setElapsed(Math.max(0, Math.floor((now - startMs) / 1000)));
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt, isLive]);

  return elapsed;
}

// =============================================================================
// Component
// =============================================================================

export default memo(function SessionStatusBar({
  sessionId,
  dealName,
  status: initialStatus,
  startedAt,
}: SessionStatusBarProps) {
  const [currentStatus, setCurrentStatus] = useState<string>(initialStatus);

  // Listen for real-time status updates via Ably
  useChannel(`live-session:${sessionId}`, "session-status", useCallback(
    (message: Message) => {
      if (!message.data) return;
      const event = message.data as AblySessionStatusEvent;
      if (event.status) {
        setCurrentStatus(event.status);
      }
    },
    []
  ));

  const isLive = currentStatus === "live";
  const elapsed = useElapsedTimer(startedAt, isLive);

  const statusConfig = useMemo(
    () => STATUS_CONFIG[currentStatus] ?? STATUS_CONFIG.created,
    [currentStatus]
  );

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-4 py-2.5",
        isLive
          ? "border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/30"
          : "border-border/60 bg-card"
      )}
    >
      {/* Live indicator */}
      {isLive && (
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" aria-hidden="true" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden="true" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-red-600">
            LIVE
          </span>
        </div>
      )}

      {/* Timer */}
      {isLive && startedAt && (
        <Badge
          variant="outline"
          className="tabular-nums text-xs font-mono shrink-0"
        >
          {formatElapsed(elapsed)}
        </Badge>
      )}

      {/* Separator — hidden on mobile */}
      <div className="hidden sm:block h-4 w-px bg-border/60" />

      {/* Deal name — hidden on mobile for space */}
      <span className="hidden sm:inline text-sm text-muted-foreground truncate max-w-[200px]">
        {dealName}
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Status text */}
      <span className={cn("text-xs shrink-0", statusConfig.className)}>
        {statusConfig.label}
      </span>
    </div>
  );
});
