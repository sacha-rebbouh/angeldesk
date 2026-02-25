// =============================================================================
// Shared UI constants for Live Coaching components
// =============================================================================

export const SESSION_STATUS_LABELS: Record<string, string> = {
  created: "Créée",
  bot_joining: "Connexion...",
  live: "En direct",
  processing: "Traitement...",
  completed: "Terminée",
  failed: "Échouée",
};

export const SESSION_STATUS_COLORS: Record<string, string> = {
  created: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  bot_joining:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  live: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  processing:
    "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  completed:
    "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export function formatDuration(
  startedAt: string | Date | null,
  endedAt: string | Date | null
): string {
  if (!startedAt || !endedAt) return "\u2014";
  const ms =
    new Date(endedAt).getTime() - new Date(startedAt).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}min`;
  const h = Math.floor(mins / 60);
  return `${h}h${mins % 60 > 0 ? `${mins % 60}min` : ""}`;
}

export const SEVERITY_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  high: {
    label: "Élevé",
    className:
      "bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200 dark:border-red-700",
  },
  medium: {
    label: "Moyen",
    className:
      "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700",
  },
  low: {
    label: "Bas",
    className:
      "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700",
  },
};
