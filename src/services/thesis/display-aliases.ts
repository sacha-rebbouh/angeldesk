/**
 * Phase A slice A5 — Thesis display aliases (lecture seule).
 *
 * Adapter d'affichage pour requalifier les champs `confidence` thesis sans
 * toucher au runtime, aux schémas Zod, à la persistance Prisma, ni à
 * `normalizeThesisEvaluation`.
 *
 * Pourquoi ?
 * La doctrine 2 strates verrouille la sémantique d'auto-évaluation : le
 * terme "Confiance" / "Confidence" comme axe décisionnel est banni (D4 :
 * gate de preuve, pas auto-score). Les champs `confidence` thesis existent
 * en runtime/DB (persistés en Prisma, consommés par 9+ endroits dans
 * `src/services/thesis/index.ts` incluant des `orderBy: { confidence }`)
 * et leur renommage en SOURCE casserait massivement (chantier B post-Phase
 * A si requis).
 *
 * Stratégie A5 (cf. plan v12) :
 * - Ne RIEN renommer côté runtime.
 * - Exposer aux consumers UI/PDF de futures Phases (3-5) un libellé
 *   d'affichage doctrinal qui ne contient JAMAIS "Confiance" / "Confidence".
 * - Le libellé reflète la SÉMANTIQUE réelle du champ : "stabilité" du
 *   verdict / de la lentille framework / de l'axe normalisé / de la
 *   reconciliation.
 *
 * Le mapping numérique → libellé est conservateur et stable :
 *   <  30 → "faible"
 *   30-59 → "partielle"
 *   60-84 → "solide"
 *   >= 85 → "élevée"
 *
 * Note source-guard implicite : aucune fonction de ce fichier ne doit
 * jamais émettre les mots "Confiance" / "Confidence" dans le libellé
 * retourné. Vérifié mécaniquement par
 * `__tests__/display-aliases.test.ts`.
 *
 * Hors scope (volontairement) :
 * - Pas de rename DB / Prisma (chantier B dédié).
 * - Pas de touch sur `src/agents/thesis/**` ni `normalizeThesisEvaluation`.
 * - Pas de logique métier — purement présentation.
 */

import type { ThesisAxisKey } from "@/agents/thesis/types";

/**
 * Catégorie textuelle de stabilité, dérivée du score numérique.
 * Stable et doctrinale (pas de score affiché dans le libellé).
 */
export type ThesisStabilityTier = "faible" | "partielle" | "solide" | "élevée";

/**
 * Mapping numérique → catégorie de stabilité (déterministe).
 *
 * Borne `[lower, upper)` pour `partielle` et `solide`. `>= 85` → `élevée`.
 * `< 30` → `faible`.
 *
 * @param confidence score 0-100 stocké côté runtime sous le nom legacy
 *   `confidence` (sémantique de stabilité, pas d'auto-confidence).
 */
export function getThesisStabilityTier(confidence: number): ThesisStabilityTier {
  if (confidence >= 85) return "élevée";
  if (confidence >= 60) return "solide";
  if (confidence >= 30) return "partielle";
  return "faible";
}

/**
 * Libellé d'affichage pour la stabilité d'une lentille framework
 * (YC / Thiel / Angel Desk).
 *
 * Source runtime : `FrameworkLens.confidence` (0-100).
 * Libellé doctrinal : "Stabilité de la lentille <framework>: <tier>".
 *
 * Le mot "Confiance"/"Confidence" n'apparaît JAMAIS dans le libellé.
 */
export function getFrameworkLensStabilityLabel(
  framework: "yc" | "thiel" | "angel-desk",
  confidence: number,
): string {
  const tier = getThesisStabilityTier(confidence);
  const frameworkLabel = formatFrameworkName(framework);
  return `Stabilité de la lentille ${frameworkLabel} : ${tier}`;
}

/**
 * Libellé d'affichage pour la stabilité de la thèse consolidée
 * (worst-of-3 des lentilles framework).
 *
 * Source runtime : `ThesisExtractorOutput.confidence` (0-100).
 */
export function getOverallThesisStabilityLabel(confidence: number): string {
  const tier = getThesisStabilityTier(confidence);
  return `Stabilité de la thèse (agrégat) : ${tier}`;
}

/**
 * Libellé d'affichage pour la stabilité d'un axe normalisé thesis
 * (thesis_quality, investor_profile_fit, deal_accessibility).
 *
 * Source runtime : `ThesisAxisEvaluation.confidence` (0-100).
 */
export function getThesisAxisStabilityLabel(
  axisKey: ThesisAxisKey,
  confidence: number,
): string {
  const tier = getThesisStabilityTier(confidence);
  const axisLabel = formatAxisName(axisKey);
  return `Stabilité de l'axe ${axisLabel} : ${tier}`;
}

/**
 * Libellé d'affichage pour la stabilité du verdict mis à jour par
 * `thesis-reconciler` (Tier 3) après reconciliation avec les outputs
 * Tier 1 / Tier 2.
 *
 * Source runtime : `ThesisReconcilerOutput.updatedConfidence` (0-100).
 */
export function getVerdictStabilityLabel(updatedConfidence: number): string {
  const tier = getThesisStabilityTier(updatedConfidence);
  return `Stabilité du verdict mis à jour : ${tier}`;
}

/**
 * Mapping nom interne framework → libellé d'affichage.
 * Stable (utilisé en affichage UI/PDF côté Phases 3-4).
 */
function formatFrameworkName(framework: "yc" | "thiel" | "angel-desk"): string {
  switch (framework) {
    case "yc": return "YC";
    case "thiel": return "Thiel";
    case "angel-desk": return "Angel Desk";
  }
}

/**
 * Mapping nom interne axe → libellé d'affichage doctrinal.
 */
function formatAxisName(axisKey: ThesisAxisKey): string {
  switch (axisKey) {
    case "thesis_quality": return "Qualité de la thèse";
    case "investor_profile_fit": return "Fit profil investisseur";
    case "deal_accessibility": return "Accessibilité du deal";
  }
}
