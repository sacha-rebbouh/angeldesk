"use client";

import { memo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Square, Loader2 } from "lucide-react";
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

// =============================================================================
// Component
// =============================================================================

export default memo(function SessionControls({
  sessionId,
  dealId,
  status,
}: SessionControlsProps) {
  const queryClient = useQueryClient();

  const stopMutation = useMutation({
    mutationFn: () => stopSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.live.session(sessionId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.live.sessions(dealId),
      });
    },
  });

  // Only show controls when session is live
  if (status !== "live") return null;

  return (
    <div className="flex items-center gap-2">
      {/* Stop session — with confirmation dialog */}
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
              onClick={() => stopMutation.mutate()}
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

      {/* Error display */}
      {stopMutation.isError && (
        <span className="text-xs text-red-600 ml-2">
          {stopMutation.error instanceof Error
            ? stopMutation.error.message
            : "Erreur lors de l'arrêt"}
        </span>
      )}
    </div>
  );
});
