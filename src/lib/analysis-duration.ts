/**
 * Durée d'une analyse, en millisecondes, pour restitution UI.
 *
 * Préfère le WALL-CLOCK (`completedAt - startedAt`) à `totalTimeMs`. En mode
 * stepwise / durable (Deep Dive), `totalTimeMs` ne capture que la durée de la
 * DERNIÈRE invocation Inngest (l'orchestrateur est ré-instancié à chaque step,
 * `report.duration` ne couvre donc qu'un step) → ~quelques secondes au lieu du
 * temps réellement écoulé (ex. 5 s affiché pour une analyse de 41 min → « 0 min »).
 *
 * `totalTimeMs` reste le fallback quand `startedAt`/`completedAt` sont absents
 * (analyses historiques, ligne partielle).
 */
export function resolveAnalysisDurationMs(
  startedAt: Date | string | null | undefined,
  completedAt: Date | string | null | undefined,
  totalTimeMs: number | null | undefined,
): number | null {
  const start = startedAt ? new Date(startedAt).getTime() : NaN;
  const end = completedAt ? new Date(completedAt).getTime() : NaN;
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
    return end - start;
  }
  return typeof totalTimeMs === "number" && totalTimeMs > 0 ? totalTimeMs : null;
}
