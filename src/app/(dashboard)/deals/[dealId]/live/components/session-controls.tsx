"use client";

import { memo, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Square, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { queryKeys } from "@/lib/query-keys";

// =============================================================================
// Types
// =============================================================================

interface SessionControlsProps {
  sessionId: string;
  dealId: string;
  status: string;
}

// =============================================================================
// API
// =============================================================================

async function stopSession(sessionId: string): Promise<void> {
  const res = await fetch(`/api/live-sessions/${sessionId}/stop`, {
    method: "POST",
  });
  if (!res.ok) {
    const error = await res
      .json()
      .catch(() => ({ error: "Erreur serveur" }));
    throw new Error(error.error ?? "Impossible de terminer la session");
  }
}

async function reinviteBot(sessionId: string): Promise<void> {
  const res = await fetch(`/api/live-sessions/${sessionId}/reinvite`, {
    method: "POST",
  });
  if (!res.ok) {
    const error = await res
      .json()
      .catch(() => ({ error: "Erreur serveur" }));
    throw new Error(error.error ?? "Impossible de réinviter le bot");
  }
}

// =============================================================================
// Component
// =============================================================================

export default memo(function SessionControls({
  sessionId,
  dealId,
  status,
}: SessionControlsProps) {
  const queryClient = useQueryClient();
  const isStoppingRef = useRef(false);

  const invalidateAll = () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.live.session(sessionId),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.live.sessions(dealId),
    });
  };

  const stopMutation = useMutation({
    mutationFn: () => stopSession(sessionId),
    onSuccess: () => {
      isStoppingRef.current = false;
      invalidateAll();
    },
    onError: () => {
      isStoppingRef.current = false;
    },
  });

  const reinviteMutation = useMutation({
    mutationFn: () => reinviteBot(sessionId),
    onSuccess: invalidateAll,
  });

  // Show controls based on status
  const showStop = status === "live";
  const showReinvite =
    status === "live" ||
    status === "bot_joining" ||
    status === "processing" ||
    status === "failed" ||
    status === "completed";

  if (!showStop && !showReinvite) return null;

  return (
    <div className="flex items-center gap-2">
      {/* Reinvite bot */}
      {showReinvite && (
        <Button
          variant="outline"
          size="sm"
          disabled={reinviteMutation.isPending}
          onClick={() => reinviteMutation.mutate()}
          className="gap-1.5"
        >
          {reinviteMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="hidden sm:inline">Envoi...</span>
            </>
          ) : (
            <>
              <RotateCcw className="h-4 w-4" />
              <span className="hidden sm:inline">Réinviter le bot</span>
            </>
          )}
        </Button>
      )}

      {/* Stop session — with confirmation dialog */}
      {showStop && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              size="sm"
              disabled={stopMutation.isPending}
              className="gap-1.5"
            >
              {stopMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="hidden sm:inline">Arrêt en cours...</span>
                </>
              ) : (
                <>
                  <Square className="h-4 w-4" />
                  <span className="hidden sm:inline">Terminer la session</span>
                </>
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Terminer la session de coaching ?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Le bot quittera le meeting et le rapport sera généré.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={stopMutation.isPending || isStoppingRef.current}
                onClick={() => {
                  if (isStoppingRef.current || stopMutation.isPending) return;
                  isStoppingRef.current = true;
                  stopMutation.mutate();
                }}
              >
                {stopMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    Arrêt...
                  </>
                ) : (
                  "Terminer"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Error display */}
      {(stopMutation.isError || reinviteMutation.isError) && (
        <span className="text-xs text-red-600 ml-2">
          {stopMutation.isError
            ? (stopMutation.error instanceof Error ? stopMutation.error.message : "Erreur lors de l'arrêt")
            : (reinviteMutation.error instanceof Error ? reinviteMutation.error.message : "Erreur lors de la réinvitation")}
        </span>
      )}
    </div>
  );
});
