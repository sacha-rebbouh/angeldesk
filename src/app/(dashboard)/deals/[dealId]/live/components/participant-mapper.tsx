"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Users, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SpeakerRole } from "@/lib/live/types";

// =============================================================================
// Types
// =============================================================================

interface ParticipantData {
  name: string;
  role: string;
  speakerId: string;
}

interface ParticipantMapperProps {
  sessionId: string;
  participants: ParticipantData[];
  dealName?: string;
}

interface ParticipantState {
  speakerId: string;
  name: string;
  role: SpeakerRole;
}

// =============================================================================
// Constants
// =============================================================================

const ROLE_OPTIONS: Array<{ value: SpeakerRole; label: string }> = [
  { value: "ba", label: "Business Angel" },
  { value: "founder", label: "Fondateur" },
  { value: "co-founder", label: "Co-fondateur" },
  { value: "investor", label: "Investisseur" },
  { value: "lawyer", label: "Avocat" },
  { value: "advisor", label: "Conseiller" },
  { value: "other", label: "Autre" },
];

const ROLE_BADGES: Record<SpeakerRole, { label: string; className: string }> = {
  ba: { label: "BA", className: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700" },
  founder: {
    label: "Fondateur",
    className: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900 dark:text-emerald-200 dark:border-emerald-700",
  },
  "co-founder": {
    label: "Co-fondateur",
    className: "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900 dark:text-teal-200 dark:border-teal-700",
  },
  investor: {
    label: "Investisseur",
    className: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900 dark:text-purple-200 dark:border-purple-700",
  },
  lawyer: {
    label: "Avocat",
    className: "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700",
  },
  advisor: {
    label: "Conseiller",
    className: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700",
  },
  other: {
    label: "Autre",
    className: "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700",
  },
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Simple fuzzy match: normalize both strings (lowercase, trim, remove accents)
 * and check if one contains the other or if they share a significant substring.
 */
function fuzzyMatch(a: string, b: string): boolean {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const na = normalize(a);
  const nb = normalize(b);

  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  // Check last-name match (if both have at least 2 words)
  const partsA = na.split(/\s+/);
  const partsB = nb.split(/\s+/);
  if (partsA.length >= 2 && partsB.length >= 2) {
    const lastA = partsA[partsA.length - 1];
    const lastB = partsB[partsB.length - 1];
    if (lastA === lastB && lastA.length >= 3) return true;
  }

  return false;
}

/**
 * Try to auto-detect the current user's name from the document cookie
 * or fall back to empty string. Clerk sets user info in session.
 */
function getCurrentUserName(): string {
  // In most cases, the BA's name won't be available client-side without
  // a dedicated prop or API call. This returns empty so auto-detect
  // only activates when the parent passes context or a name matches "ba".
  return "";
}

function initParticipants(
  participants: ParticipantData[],
  currentUserName: string
): ParticipantState[] {
  return participants.map((p) => {
    let role: SpeakerRole = (p.role as SpeakerRole) || "other";

    // Auto-detect BA if participant name fuzzy-matches current user
    if (
      currentUserName &&
      role === "other" &&
      fuzzyMatch(p.name, currentUserName)
    ) {
      role = "ba";
    }

    return {
      speakerId: p.speakerId,
      name: p.name,
      role,
    };
  });
}

// =============================================================================
// API
// =============================================================================

async function saveParticipants(
  sessionId: string,
  participants: ParticipantState[]
): Promise<void> {
  const res = await fetch(`/api/live-sessions/${sessionId}/participants`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      participants: participants.map((p) => ({
        speakerId: p.speakerId,
        name: p.name,
        role: p.role,
      })),
    }),
  });
  if (!res.ok) {
    const error = await res
      .json()
      .catch(() => ({ error: "Erreur serveur" }));
    throw new Error(error.error ?? "Impossible de sauvegarder les participants");
  }
}

// =============================================================================
// Component
// =============================================================================

export default function ParticipantMapper({
  sessionId,
  participants,
  dealName,
}: ParticipantMapperProps) {
  const currentUserName = useMemo(() => getCurrentUserName(), []);

  const [participantStates, setParticipantStates] = useState<
    ParticipantState[]
  >(() => initParticipants(participants, currentUserName));

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveMutation = useMutation({
    mutationFn: (updated: ParticipantState[]) =>
      saveParticipants(sessionId, updated),
  });

  const saveMutateRef = useRef(saveMutation.mutate);
  useEffect(() => {
    saveMutateRef.current = saveMutation.mutate;
  });

  const debouncedSave = useCallback(
    (updated: ParticipantState[]) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        saveMutateRef.current(updated);
      }, 500);
    },
    []
  );

  const handleRoleChange = useCallback(
    (speakerId: string, newRole: SpeakerRole) => {
      setParticipantStates((prev) => {
        const updated = prev.map((p) =>
          p.speakerId === speakerId ? { ...p, role: newRole } : p
        );
        debouncedSave(updated);
        return updated;
      });
    },
    [debouncedSave]
  );

  if (participantStates.length === 0) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="text-center text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Aucun participant détecté pour le moment.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {participantStates.length} participant
                {participantStates.length > 1 ? "s" : ""} détecté
                {participantStates.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {saveMutation.isSuccess && (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  Sauvegardé
                </span>
              )}
              {saveMutation.isError && (
                <span className="text-xs text-red-600">
                  Erreur de sauvegarde
                </span>
              )}
            </div>
          </div>

          {dealName && (
            <p className="text-xs text-muted-foreground">
              Assignez les rôles pour le deal{" "}
              <span className="font-medium">{dealName}</span>
            </p>
          )}

          <div className="space-y-2">
            {participantStates.map((participant) => {
              const roleBadge = ROLE_BADGES[participant.role];
              return (
                <div
                  key={participant.speakerId}
                  className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm font-medium truncate">
                      {participant.name}
                    </span>
                    <Badge
                      variant="outline"
                      className={roleBadge.className}
                    >
                      {roleBadge.label}
                    </Badge>
                  </div>

                  <Select
                    value={participant.role}
                    onValueChange={(value: string) =>
                      handleRoleChange(
                        participant.speakerId,
                        value as SpeakerRole
                      )
                    }
                  >
                    <SelectTrigger className="w-[180px] h-8 text-xs" aria-label={`Rôle de ${participant.name}`}>
                      <SelectValue placeholder="Rôle" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((opt) => (
                        <SelectItem
                          key={opt.value}
                          value={opt.value}
                          className="text-xs"
                        >
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
