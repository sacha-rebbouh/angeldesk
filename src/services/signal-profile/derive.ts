/**
 * Dérivation SCORELESS de l'orientation de synthèse (chantier P2).
 *
 * Cœur du fix « l'orientation ne doit plus être un score caché »
 * (cf. doctrine § 4 + PLAN-DESCORING.md P2). Avant P2, l'orientation était
 * dérivée du score numérique (`if (score >= 85) return "very_favorable"`).
 * Ici, la dérivation ne prend AUCUN score en entrée — c'est une garantie
 * STRUCTURELLE de l'indépendance au score (test « poisoned score »).
 *
 * Modèle POSITIF explicite (recadrage adverse Codex) : `favorable` /
 * `very_favorable` EXIGENT des signaux favorables dominants ET une couverture
 * large. L'absence de red flags ne suffit JAMAIS — sinon on aurait juste un
 * compteur d'alertes inversé.
 *
 * Pur, déterministe, sans I/O. Réutilise le pattern existant
 * `deriveSignalContributionFromIntensity` (contradiction-detector /
 * conditions-analyst) en RETIRANT les tiebreaks `score >= N` résiduels.
 */

import type { Orientation, EvidenceSolidity } from "@/lib/ui-configs";
import type { Tier3SignalIntensity } from "@/agents/types";

/**
 * Intensité de signal au niveau synthèse — dérivée des comptes de red flags
 * CONSOLIDÉS par sévérité. AUCUN score numérique en entrée (contrairement à
 * `deriveTier1SignalIntensity` qui acceptait un `score` agrégat).
 *
 *   criticalCount >= 1  → critical
 *   highCount >= 2      → high
 *   highCount >= 1      → elevated
 *   sinon               → low
 */
export function deriveSynthesisSignalIntensity(
  criticalRedFlagCount: number,
  highRedFlagCount: number,
): Tier3SignalIntensity {
  if (criticalRedFlagCount >= 1) return "critical";
  if (highRedFlagCount >= 2) return "high";
  if (highRedFlagCount >= 1) return "elevated";
  return "low";
}

/** Couverture large = au moins 2/3 des dimensions attendues réellement couvertes. */
export const COVERAGE_BROAD_RATIO = 2 / 3;

/** Nombre minimal de signaux favorables dominants pour ouvrir la branche favorable. */
export const FAVORABLE_DOMINANT_MIN = 2;

/** Seuil de signaux favorables pour `very_favorable` (en plus de couverture large). */
export const VERY_FAVORABLE_MIN = 4;

export interface OrientationDerivationInputs {
  /** Intensité dérivée des red flags consolidés (jamais d'un score). */
  intensity: Tier3SignalIntensity;
  /** Nombre de signaux FAVORABLES dominants sourcés (forces/atouts). */
  favorableSignalCount: number;
  /** Nombre de dimensions réellement couvertes (agent exécuté avec données). */
  coveredDimensionCount: number;
  /** Nombre total de dimensions attendues. */
  totalDimensionCount: number;
  /** Solidité des preuves (service evidence-solidity) — `contradictory` / `insufficient` / null. */
  evidenceSolidity: EvidenceSolidity | null;
}

/**
 * Dérive l'orientation interne 5 valeurs (`Orientation`) SANS AUCUN score.
 *
 * - Branche défavorable : pilotée par l'intensité des signaux d'alerte.
 *     critical → alert_dominant ; high → vigilance ; elevated → contrasted.
 * - Branche POSITIVE (intensity low) : exige des preuves positives explicites.
 *     Solidité insuffisante/contradictoire → contrasted (jamais favorable).
 *     Signaux favorables dominants (>= 2) ET couverture large → favorable,
 *     très favorable si signaux favorables nombreux (>= 4) et solidité non
 *     contradictoire. Sinon contrasted.
 *
 * Le mapping 5→4 doctrine se fait AILLEURS (`toDoctrineOrientation`) ;
 * `vigilance` y devient `contrasted`, `alert_dominant` devient `alert`.
 */
export function deriveScoreIndependentOrientation(input: OrientationDerivationInputs): Orientation {
  const {
    intensity,
    favorableSignalCount,
    coveredDimensionCount,
    totalDimensionCount,
    evidenceSolidity,
  } = input;

  // Branche défavorable — intensité des signaux d'alerte consolidés.
  if (intensity === "critical") return "alert_dominant";
  if (intensity === "high") return "vigilance";
  if (intensity === "elevated") return "contrasted";

  // Branche POSITIVE (intensity === "low"). On EXIGE des preuves positives :
  // sans solidité suffisante, on ne peut pas qualifier de favorable.
  if (evidenceSolidity === "insufficient" || evidenceSolidity === "contradictory") {
    return "contrasted";
  }
  const broadCoverage =
    totalDimensionCount > 0 && coveredDimensionCount / totalDimensionCount >= COVERAGE_BROAD_RATIO;
  const favorableDominant = favorableSignalCount >= FAVORABLE_DOMINANT_MIN;
  if (favorableDominant && broadCoverage) {
    return favorableSignalCount >= VERY_FAVORABLE_MIN ? "very_favorable" : "favorable";
  }
  return "contrasted";
}

export interface NotExploitableInputs {
  /** Nombre de dimensions réellement couvertes. */
  coveredDimensionCount: number;
  /** Nombre total de dimensions attendues. */
  totalDimensionCount: number;
  /** Solidité des preuves (service evidence-solidity). */
  evidenceSolidity: EvidenceSolidity | null;
}

/**
 * Décision de COUVERTURE EXPLICITE `non exploitable` (jamais un fallback flou).
 *
 * Conservateur en v1 (P2) : ne déclenche que sur une rupture de couverture
 * claire — base de preuves inexploitable (`insufficient`) OU aucune dimension
 * couverte. Les triggers plus fins (cap table manquante seule, N agents
 * critiques échoués) sont laissés à un raffinement ultérieur pour éviter le
 * sur-déclenchement.
 */
export function decideNotExploitable(input: NotExploitableInputs): boolean {
  if (input.evidenceSolidity === "insufficient") return true;
  if (input.totalDimensionCount > 0 && input.coveredDimensionCount === 0) return true;
  return false;
}
