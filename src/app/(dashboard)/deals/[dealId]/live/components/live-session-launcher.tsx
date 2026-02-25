"use client";

import { useState, useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Radio, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { queryKeys } from "@/lib/query-keys";
import type { MeetingPlatform } from "@/lib/live/types";

// =============================================================================
// Types
// =============================================================================

interface LiveSessionLauncherProps {
  dealId: string;
  dealName: string;
  hasAnalysis: boolean;
}

interface CreateSessionResponse {
  data: { id: string };
}

// =============================================================================
// Platform Detection
// =============================================================================

const PLATFORM_PATTERNS: Array<{
  pattern: RegExp;
  platform: MeetingPlatform;
  label: string;
  className: string;
}> = [
  {
    pattern: /zoom\.us/i,
    platform: "zoom",
    label: "Zoom",
    className:
      "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700",
  },
  {
    pattern: /meet\.google\.com/i,
    platform: "meet",
    label: "Google Meet",
    className:
      "bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-200 dark:border-green-700",
  },
  {
    pattern: /teams\.microsoft\.com/i,
    platform: "teams",
    label: "Teams",
    className:
      "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900 dark:text-purple-200 dark:border-purple-700",
  },
];

function detectPlatform(
  url: string
): { platform: MeetingPlatform; label: string; className: string } | null {
  for (const { pattern, platform, label, className } of PLATFORM_PATTERNS) {
    if (pattern.test(url)) {
      return { platform, label, className };
    }
  }
  return null;
}

// =============================================================================
// API Functions
// =============================================================================

async function createSession(body: {
  dealId: string;
  meetingUrl: string;
  language: string;
}): Promise<CreateSessionResponse> {
  const res = await fetch("/api/live-sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Erreur serveur" }));
    throw new Error(error.error ?? "Impossible de créer la session");
  }
  return res.json();
}

async function startSession(sessionId: string): Promise<void> {
  const res = await fetch(`/api/live-sessions/${sessionId}/start`, {
    method: "POST",
  });
  if (!res.ok) {
    const error = await res
      .json()
      .catch(() => ({ error: "Erreur au démarrage" }));
    throw new Error(error.error ?? "Impossible de démarrer la session");
  }
}

// =============================================================================
// Component
// =============================================================================

export default function LiveSessionLauncher({
  dealId,
  dealName,
  hasAnalysis,
}: LiveSessionLauncherProps) {
  const [meetingUrl, setMeetingUrl] = useState("");
  const [language, setLanguage] = useState("fr");
  const queryClient = useQueryClient();

  // Detect platform from URL
  const detectedPlatform = useMemo(
    () => detectPlatform(meetingUrl),
    [meetingUrl]
  );

  // Combined mutation: create session + start it
  const launchMutation = useMutation({
    mutationFn: async () => {
      const { data } = await createSession({
        dealId,
        meetingUrl: meetingUrl.trim(),
        language,
      });
      await startSession(data.id);
      return data.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.live.sessions(dealId),
      });
    },
  });

  const handleUrlChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setMeetingUrl(e.target.value);
    },
    []
  );

  const handleLanguageChange = useCallback((value: string) => {
    setLanguage(value);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!meetingUrl.trim()) return;
      launchMutation.mutate();
    },
    [meetingUrl, launchMutation]
  );

  const isValid = meetingUrl.trim().length > 0 && detectedPlatform !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Video className="h-5 w-5" />
          Lancer une session de coaching
        </CardTitle>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-sm text-muted-foreground">{dealName}</span>
          {hasAnalysis ? (
            <Badge
              variant="outline"
              className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900 dark:text-green-200 dark:border-green-700"
            >
              Analyse complète
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-200 dark:border-yellow-700"
            >
              Sans analyse
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Meeting URL */}
          <div className="space-y-2">
            <label
              htmlFor="meeting-url"
              className="text-sm font-medium leading-none"
            >
              Lien de la réunion
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="meeting-url"
                type="url"
                placeholder="https://zoom.us/j/... ou meet.google.com/..."
                value={meetingUrl}
                onChange={handleUrlChange}
                disabled={launchMutation.isPending}
                className="flex-1"
              />
              {detectedPlatform && (
                <Badge
                  variant="outline"
                  className={detectedPlatform.className}
                >
                  {detectedPlatform.label}
                </Badge>
              )}
            </div>
            {meetingUrl.trim() && !detectedPlatform && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Plateforme non reconnue. Formats supportés : Zoom, Google Meet,
                Teams.
              </p>
            )}
          </div>

          {/* Language Select */}
          <div className="space-y-2">
            <label
              htmlFor="language-select"
              className="text-sm font-medium leading-none"
            >
              Langue de la réunion
            </label>
            <Select
              value={language}
              onValueChange={handleLanguageChange}
              disabled={launchMutation.isPending}
            >
              <SelectTrigger id="language-select" className="w-[240px]">
                <SelectValue placeholder="Sélectionner la langue" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Error Display */}
          {launchMutation.isError && (
            <div className="rounded-md bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300">
              {launchMutation.error instanceof Error
                ? launchMutation.error.message
                : "Une erreur est survenue lors du lancement de la session."}
            </div>
          )}

          {/* Submit */}
          <Button
            type="submit"
            disabled={!isValid || launchMutation.isPending}
            className="w-full"
          >
            {launchMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Lancement en cours...
              </>
            ) : (
              <>
                <Radio className="h-4 w-4 mr-2" />
                Lancer le coaching en direct
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
