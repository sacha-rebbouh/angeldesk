/**
 * Service Signal Profile — fondation de la dé-scorisation (chantier P1, additif strict).
 *
 * Primitives PORTEUSES du chantier « aucune note de deal restituée, jamais »
 * (cf. doctrine § 4 + PLAN-DESCORING.md). Ce module est une FONDATION : il
 * définit le contrat et les helpers. Le câblage runtime du scrubber et la
 * bascule des consumers vers le bi-reader se font en P2/P3.
 *
 *  1. `toDoctrineOrientation` — mapper canonique UNIQUE 5→4 au BOUNDARY de
 *     restitution. L'enum interne 5 valeurs (`Orientation`) reste inchangé ;
 *     la taxonomie doctrine 4 valeurs est dérivée ici. `not_exploitable` est
 *     une décision de COUVERTURE EXPLICITE (jamais un fallback flou).
 *  2. `AnalysisSignalProfile` — contrat de sortie SCORELESS de la synthèse
 *     (produit en P2). Aucun champ numérique de note de deal.
 *  3. `scrubSynthesisScoreData` / `scrubScoresFromResults` — retire les champs
 *     de NOTE DE DEAL d'un résultat synthesis-deal-scorer avant réinjection
 *     dans un contexte LLM (memo / summary / board). Préserve l'orientation
 *     catégorielle.
 *  4. `readDoctrineOrientation` — bi-reader durable : lit la forme NOUVELLE
 *     (profil scoreless) si présente, sinon la forme ANCIENNE (verdict 5
 *     valeurs) mappée via `toDoctrineOrientation`. Ne dérive JAMAIS une
 *     orientation d'un vieux score (= score caché).
 */

import { ORIENTATION_VALUES } from "@/lib/ui-configs";
import type { Orientation, EvidenceSolidity } from "@/lib/ui-configs";
import type { CriticalRiskRef } from "@/agents/tier3/schemas/common";
import type { AgentResult } from "@/agents/types";

// ============================================================================
// 1. Orientation doctrine 4 valeurs + mapper canonique 5→4
// ============================================================================

/**
 * Taxonomie doctrine de l'orientation (4 valeurs — restitution).
 * Clés en anglais (convention codebase, cf. `ORIENTATION_VALUES`) ; libellés
 * FR via `DOCTRINE_ORIENTATION_CONFIG`.
 */
export const DOCTRINE_ORIENTATION_VALUES = [
  "favorable",
  "contrasted",
  "alert",
  "not_exploitable",
] as const;

export type DoctrineOrientation = (typeof DOCTRINE_ORIENTATION_VALUES)[number];

/** Libellés FR doctrine (restitution). Aucun nombre. */
export const DOCTRINE_ORIENTATION_CONFIG: Record<DoctrineOrientation, { label: string }> = {
  favorable: { label: "Signaux favorables" },
  contrasted: { label: "Signaux contrastés" },
  alert: { label: "Signaux d'alerte" },
  not_exploitable: { label: "Non exploitable" },
};

/**
 * Mapper canonique UNIQUE 5→4 au boundary de restitution.
 *
 * Collapse doctrine (verrouillé) :
 *  - very_favorable + favorable → favorable
 *  - contrasted + vigilance     → contrasted   (vigilance → contrasté, PAS alerte)
 *  - alert_dominant             → alert
 *  - couverture insuffisante    → not_exploitable (décision EXPLICITE seulement)
 *
 * `not_exploitable` n'est JAMAIS produit par défaut/fallback : uniquement via
 * `opts.notExploitable === true` (décision de couverture du caller). Une valeur
 * d'orientation corrompue/legacy lève une erreur — le bi-reader normalise AVANT
 * d'appeler.
 */
export function toDoctrineOrientation(
  orientation: Orientation,
  opts?: { notExploitable?: boolean }
): DoctrineOrientation {
  if (opts?.notExploitable) return "not_exploitable";
  switch (orientation) {
    case "very_favorable":
    case "favorable":
      return "favorable";
    case "contrasted":
    case "vigilance":
      return "contrasted";
    case "alert_dominant":
      return "alert";
  }
  // Exhaustivité compile-time : si l'enum gagne une valeur, `orientation` n'est
  // plus `never` ici → erreur TS. Runtime : valeur corrompue → throw (jamais de
  // not_exploitable flou, jamais de dérivation depuis un score).
  const _exhaustive: never = orientation;
  throw new Error(`toDoctrineOrientation: orientation inattendue "${String(_exhaustive)}"`);
}

// ============================================================================
// 2. Contrat de sortie SCORELESS de la synthèse (produit en P2)
// ============================================================================

export type DominantSignalPolarity = "favorable" | "unfavorable";

/** Signal dominant sourcé (modèle POSITIF explicite : favorables ET défavorables). */
export interface DominantSignal {
  polarity: DominantSignalPolarity;
  statement: string;
  source?: string;
  /** Renseigné pour les signaux défavorables. */
  severity?: "CRITICAL" | "HIGH" | "MEDIUM";
}

export type DimensionCoverageLevel = "covered" | "partial" | "not_covered";

/** Couverture par dimension — remplace les sous-scores numériques. */
export interface DimensionCoverage {
  dimension: string;
  level: DimensionCoverageLevel;
  note?: string;
}

/**
 * AnalysisSignalProfile — contrat de sortie SCORELESS de la synthèse.
 *
 * AUCUN champ numérique de note de deal (overallScore / score.value / grade /
 * dimensionScores[].score). Modèle POSITIF explicite : signaux favorables ET
 * défavorables dominants, couverture par dimension, solidité des preuves.
 */
export interface AnalysisSignalProfile {
  orientation: DoctrineOrientation;
  /** Solidité des preuves (déterministe, service evidence-solidity). `null` = non qualifiable. */
  evidenceSolidity: EvidenceSolidity | null;
  evidenceSolidityRationale?: string | null;
  dominantSignals: DominantSignal[];
  dimensionCoverage: DimensionCoverage[];
  criticalRisks: CriticalRiskRef[];
}

// ============================================================================
// 3. Scrubber de NOTE DE DEAL (hygiène contexte LLM)
// ============================================================================

/** Champs de note de deal de premier niveau retirés d'un `data` synthesis-deal-scorer. */
const SYNTHESIS_DEAL_NOTE_KEYS = ["overallScore", "score", "grade", "scoreBreakdown"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripKeys(obj: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...obj };
  for (const k of keys) delete out[k];
  return out;
}

/**
 * Retire les champs de NOTE DE DEAL d'un objet `data` de synthesis-deal-scorer.
 *
 * Pure et IMMUTABLE (n'altère jamais l'entrée — shallow clone + reconstruction
 * ciblée des parties modifiées). Idempotent. Préserve l'orientation
 * catégorielle (`verdict`, `investmentRecommendation.action`), forces,
 * faiblesses, risques, signalContribution.orientation.
 *
 * Retiré : `overallScore`, `score`, `grade`, `scoreBreakdown` ;
 * `dimensionScores[].score`/`.weightedScore` ; `comparativeRanking` percentiles
 * de score ; `signalContribution.score`/`.scoreNote`.
 */
export function scrubSynthesisScoreData<T>(data: T): T {
  if (!isRecord(data)) return data;
  const clone: Record<string, unknown> = { ...data };
  for (const k of SYNTHESIS_DEAL_NOTE_KEYS) delete clone[k];

  if (Array.isArray(clone.dimensionScores)) {
    clone.dimensionScores = clone.dimensionScores.map((d) =>
      isRecord(d) ? stripKeys(d, ["score", "weightedScore"]) : d
    );
  }
  if (isRecord(clone.comparativeRanking)) {
    clone.comparativeRanking = stripKeys(clone.comparativeRanking, [
      "percentileOverall",
      "percentileSector",
      "percentileStage",
    ]);
  }
  if (isRecord(clone.signalContribution)) {
    clone.signalContribution = stripKeys(clone.signalContribution, ["score", "scoreNote"]);
  }
  return clone as T;
}

/**
 * Clone de la map de résultats agents où SEUL `synthesis-deal-scorer` a ses
 * champs de note de deal retirés (via `scrubSynthesisScoreData`). Les autres
 * agents sont inchangés (références partagées, jamais mutées). Pour usage AVANT
 * réinjection dans un contexte LLM (memo / summary / board).
 */
export function scrubScoresFromResults<R extends Record<string, AgentResult>>(results: R): R {
  const scorer = results["synthesis-deal-scorer"] as (AgentResult & { data?: unknown }) | undefined;
  if (!scorer || !("data" in scorer)) return results;
  const cloned: Record<string, AgentResult> = { ...results };
  cloned["synthesis-deal-scorer"] = {
    ...scorer,
    data: scrubSynthesisScoreData(scorer.data),
  } as AgentResult;
  return cloned as R;
}

// ============================================================================
// 4. Bi-reader durable old/new
// ============================================================================

export interface SignalOrientationRead {
  orientation: DoctrineOrientation | null;
  /** Provenance : profil scoreless (P2+), verdict legacy 5 valeurs, ou rien. */
  source: "profile" | "legacy_verdict" | "none";
}

function isOrientation(value: unknown): value is Orientation {
  return typeof value === "string" && (ORIENTATION_VALUES as readonly string[]).includes(value);
}

function isDoctrineOrientation(value: unknown): value is DoctrineOrientation {
  return (
    typeof value === "string" && (DOCTRINE_ORIENTATION_VALUES as readonly string[]).includes(value)
  );
}

/**
 * Bi-reader durable : lit l'orientation doctrine (4 valeurs) d'une analyse en
 * gérant la forme NOUVELLE (profil scoreless P2+) ET ANCIENNE (verdict 5
 * valeurs). Ne dérive JAMAIS l'orientation d'un score (= score caché interdit).
 *
 * Forme nouvelle reconnue par la présence d'un `data.signalProfile` portant
 * `dominantSignals` + `dimensionCoverage` (distingue de `Tier3SignalContribution`).
 */
export function readDoctrineOrientation(
  results: Record<string, AgentResult> | null | undefined
): SignalOrientationRead {
  const scorer = results?.["synthesis-deal-scorer"] as
    | (AgentResult & { data?: unknown })
    | undefined;
  if (!scorer || !scorer.success || !("data" in scorer) || !isRecord(scorer.data)) {
    return { orientation: null, source: "none" };
  }
  const data = scorer.data;

  // Forme NOUVELLE : profil scoreless (P2+).
  const profile = data.signalProfile;
  if (
    isRecord(profile) &&
    Array.isArray(profile.dominantSignals) &&
    Array.isArray(profile.dimensionCoverage)
  ) {
    return isDoctrineOrientation(profile.orientation)
      ? { orientation: profile.orientation, source: "profile" }
      : { orientation: null, source: "profile" };
  }

  // Forme ANCIENNE : verdict 5 valeurs (catégoriel, jamais dérivé d'un score).
  if (isOrientation(data.verdict)) {
    return { orientation: toDoctrineOrientation(data.verdict), source: "legacy_verdict" };
  }

  return { orientation: null, source: "none" };
}
