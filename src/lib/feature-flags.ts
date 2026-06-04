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
