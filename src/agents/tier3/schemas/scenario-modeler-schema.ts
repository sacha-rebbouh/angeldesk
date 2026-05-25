import { z } from "zod";
import {
  Tier3MetaSchema,
  Tier3SignalContributionSchema,
} from "./common";

/**
 * Phase A slice A4 — Schéma Scenario Modeler aligné contrat natif.
 *
 * D1 verrouillé :
 * - `dominantScenario` (renommage cohérent de l'ancien `mostLikelyScenario`)
 *   qualifie le scénario avec la probabilité la plus élevée parmi
 *   BASE/BULL/BEAR/CATASTROPHIC. Pas une recommandation d'action.
 * - `signalContribution` (Tier3SignalContribution A1) porte l'orientation
 *   native + evidenceSolidity (nullable en A4). Dérivé déterministe par le
 *   runtime depuis les probabilités scenarios (LLM ne pilote pas).
 * - L'ancien `recommendation.{bestScenario, worstScenario, expectedValue,
 *   verdict: z.string()}` libre est retiré.
 *
 * Alignement runtime : `scenarios[].type` enum aligné `CATASTROPHIC`
 * (anciennement `BLACK_SWAN` dans le schema, drift corrigé en A4 pour
 * cohérence avec runtime + types + prompt).
 *
 * D2 verrouillé : `signalContribution.evidenceSolidity` reste nullable en A4.
 *
 * Ce schéma reste test-only.
 */
// Phase A slice A4 round 2 — `.strict()` sur le contrat top-level + sur les
// items scenarios : par défaut `z.object` strippe les unknown keys
// silencieusement, ce qui laisserait passer `recommendation.verdict` legacy
// ou `mostLikelyScenario` legacy si les champs natifs sont présents en
// parallèle. Avec `.strict()`, toute clé supplémentaire est rejetée —
// D1 verrouillé mécaniquement.
export const ScenarioModelerResponseSchema = z.object({
  meta: Tier3MetaSchema,
  scenarios: z.array(z.object({
    id: z.string(),
    name: z.string(),
    // Phase A slice A4 — Aligné runtime : CATASTROPHIC (anciennement BLACK_SWAN
    // dans le schema, drift corrigé en A4).
    type: z.enum(["BULL", "BASE", "BEAR", "CATASTROPHIC"]),
    probability: z.number().min(0).max(100),
    description: z.string(),
    assumptions: z.array(z.string()),
    timeline: z.string(),
    financialProjection: z.unknown(),
    investorReturn: z.unknown(),
    triggers: z.array(z.string()),
    keyRisks: z.array(z.string()),
  }).strict()),
  sensitivityAnalysis: z.unknown().optional(),
  // Phase A slice A4 — Contrat natif Phase A (D1).
  dominantScenario: z.enum(["BASE", "BULL", "BEAR", "CATASTROPHIC"]),
  dominantScenarioRationale: z.string(),
  signalContribution: Tier3SignalContributionSchema,
}).strict();

export type ScenarioModelerResponse = z.infer<typeof ScenarioModelerResponseSchema>;
