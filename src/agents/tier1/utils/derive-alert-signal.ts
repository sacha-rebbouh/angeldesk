/**
 * Phase A slice A7b-1 — Fondation Tier 1 signalIntensity (helper partagé).
 *
 * Helper déterministe utilisé par les 13 agents Tier 1 (migration A7b-2)
 * pour dériver :
 * 1. `signalIntensity` (low / elevated / high / critical) depuis severity
 *    des red flags + score conditions.
 * 2. `alertSignal.recommendation` (PROCEED / PROCEED_WITH_CAUTION /
 *    INVESTIGATE_FURTHER / STOP) depuis signalIntensity — mapping
 *    déterministe, jamais piloté par le LLM (cf. leçon round 2 A3 sur
 *    riskPosture LLM-driven).
 *
 * Stratégie cross-agent (verrouillée par arbitrage A7b) :
 * - Le contrat global `AgentAlertSignal` (recommendation: enum legacy) reste
 *   INTACT — il ne sera PAS muté en Phase A. Modifier `AgentAlertSignal`
 *   aurait un blast radius de 102 sites cross-agent (Tier 1 + Tier 3 +
 *   définition canonique). Hors arbitrage.
 * - Le pattern A4-bis (CD/CA Tier 3) se réplique pour Tier 1 :
 *   `signalIntensity` ajouté natif dans `findings` (slice A7b-2),
 *   `alertSignal.recommendation` dérivé via `signalIntensityToRecommendation`.
 *
 * Conformité D2 : aucune lecture de `confidence` / `overallScore` /
 * `confidenceLevel` LLM-évalués. Seul un `score` agrégat normalisé 0-100
 * (calculé en amont par l'agent sur ses propres dimensions de scoring)
 * est accepté en input, distinct des auto-évaluations LLM bannies.
 *
 * Slice A7b-1 STRICT : ce module est seul (pas de patch agent). Les 13
 * agents Tier 1 importent ce helper en A7b-2 et migrent leur runtime.
 */

import type { Tier3SignalIntensity } from "@/agents/types";

/**
 * Tier 1 utilise le même enum d'intensité que Tier 3 (réutilisation).
 * Alias pour clarté côté agents Tier 1.
 */
export type Tier1SignalIntensity = Tier3SignalIntensity;

/**
 * Inputs déterministes pour la dérivation de signalIntensity.
 *
 * Note A7b-2 (pour la migration des agents) :
 * - `criticalCount` / `highCount` = counts severity des red flags de l'agent.
 * - `score` = score agrégé 0-100 de l'agent (champ `score.value` typique).
 *   C'est un score métier normalisé (pas une auto-confidence LLM).
 *
 * Agents Tier 1 sans score clair ou red flags uniformes :
 * - `question-master` : émet des questions, pas des red flags. À A7b-2,
 *   probablement adapter `score` depuis le nombre de questions CRITICAL
 *   ou utiliser une convention `score = 50` (neutre).
 * - `tech-stack-dd` / `tech-ops-dd` : utilisent `validateEnum` direct
 *   sur la valeur LLM — la dérivation depuis severity red flags est OK,
 *   `score.value` est disponible.
 * - Les autres 10 agents Tier 1 ont tous un `score: AgentScore` + des
 *   `redFlags: AgentRedFlag[]` avec severity standardisée.
 */
export interface DeriveTier1SignalIntensityInputs {
  /** Nombre de red flags severity CRITICAL */
  criticalCount: number;
  /** Nombre de red flags severity HIGH */
  highCount: number;
  /** Score agrégé 0-100 de l'agent (champ `score.value` ou équivalent) */
  score: number;
}

/**
 * Dérivation déterministe de signalIntensity.
 *
 *   `criticalCount >= 1`                 → critical
 *   `highCount >= 2` OR `score < 40`     → high
 *   `highCount >= 1` OR `score < 60`     → elevated
 *   sinon                                 → low
 *
 * Anti-régression doctrinale (round 2 A3) : le LLM n'a accès à AUCUNE
 * voie pour piloter cette valeur. Le helper prend des counts numériques
 * (jamais une valeur LLM) et retourne strictement un enum.
 */
export function deriveTier1SignalIntensity(input: DeriveTier1SignalIntensityInputs): Tier1SignalIntensity {
  const { criticalCount, highCount, score } = input;
  if (criticalCount >= 1) return "critical";
  if (highCount >= 2 || score < 40) return "high";
  if (highCount >= 1 || score < 60) return "elevated";
  return "low";
}

/**
 * Mapping déterministe `signalIntensity → recommendation` legacy.
 *
 * Conservé uniquement pour compat infra `AgentAlertSignal` global
 * (102 consumers cross-agent). En A7b-2, les 13 agents Tier 1 cesseront
 * de piloter `recommendation` via le LLM ; le runtime dérivera la valeur
 * via cette fonction depuis le `signalIntensity` natif.
 *
 *   low      → PROCEED
 *   elevated → PROCEED_WITH_CAUTION
 *   high     → INVESTIGATE_FURTHER
 *   critical → STOP
 */
export function signalIntensityToRecommendation(
  intensity: Tier1SignalIntensity,
): "PROCEED" | "PROCEED_WITH_CAUTION" | "INVESTIGATE_FURTHER" | "STOP" {
  switch (intensity) {
    case "low": return "PROCEED";
    case "elevated": return "PROCEED_WITH_CAUTION";
    case "high": return "INVESTIGATE_FURTHER";
    case "critical": return "STOP";
  }
}
