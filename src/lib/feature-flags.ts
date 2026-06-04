/**
 * Feature flags serveur (runtime).
 *
 * Lus côté serveur uniquement (Server Components, routes API) — PAS de préfixe
 * NEXT_PUBLIC, donc togglables sans rebuild ni redeploy (les pages concernées
 * sont `force-dynamic`).
 */

/**
 * Onglet « Conditions » (et son score dans la Vue d'ensemble).
 *
 * Archivé par défaut (refonte 5-sujets : usine à gaz hors cœur de cible).
 * L'AGENT conditions-analyst reste dans le pipeline (synthesis-deal-scorer et
 * memo-generator en dépendent) — seul l'affichage est masqué.
 * Réactivation : poser SHOW_CONDITIONS_TAB=true.
 */
export function isConditionsTabEnabled(): boolean {
  return process.env.SHOW_CONDITIONS_TAB === "true";
}

/**
 * Live Coaching (onglet temps réel + sous-système Recall/Ably + routes associées).
 *
 * Archivé par défaut (refonte 5-sujets : pas sa place pour l'instant, à ressortir plus tard).
 * Quand archivé : onglet + route popout cachés, création/start/reinvite/coaching bloqués (403
 * après auth), webhooks Recall en no-op APRÈS vérif signature/secret (ne pas casser Recall ni
 * réveiller Neon). Le `stop` reste autorisé (nettoyage des bots actifs). Le code `src/lib/live/*`
 * reste dormant. Réactivation : poser LIVE_COACHING_ENABLED=true.
 */
export function isLiveCoachingEnabled(): boolean {
  return process.env.LIVE_COACHING_ENABLED === "true";
}
