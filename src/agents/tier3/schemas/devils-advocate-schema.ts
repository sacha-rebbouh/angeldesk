import { z } from "zod";
import {
  Tier3MetaSchema,
  StructuralRiskSchema,
  Tier3SignalContributionSchema,
} from "./common";

/**
 * Phase A slice A3 — Schéma Devil's Advocate aligné contrat natif.
 *
 * D1 verrouillé (DA-spécifique) :
 * - Le champ `structuralRisks` (Phase A) remplace l'ancien `killReasons`
 *   legacy. Aucun alias `killReasons` n'est admis par ce schéma contractuel.
 * - Le champ `dealBreakerLevel` (`ABSOLUTE|CONDITIONAL|CONCERN`) est retiré ;
 *   StructuralRiskSchema impose `severity: CRITICAL|HIGH|MEDIUM` (A1).
 * - Le champ `overallAssessment` (avec `verdict`/`recommendation` libres) est
 *   retiré. Sa version posture s'exprime via `riskPosture`.
 *
 * D2 verrouillé : `signalContribution.evidenceSolidity` reste nullable/absent
 * en A3 — A6 (service Solidité) le qualifiera ultérieurement.
 *
 * Exception cross-agent documentée (hors scope A3) :
 * - Le contrat global `AgentAlertSignal` (champ `alertSignal.recommendation:
 *   PROCEED|...|STOP`) est partagé par 18+ agents Tier 1/3. Sa migration
 *   appartient à un slice cross-agent dédié (`signalIntensity`,
 *   A7b / A4-bis / A9). A3 ne le mute pas. Le runtime DA conserve
 *   `alertSignal` (compat `BaseAgent.getRequiredOutputContractFields()`),
 *   mais sa valeur est dérivée déterministe depuis `riskPosture` —
 *   le LLM ne pilote plus librement PROCEED/STOP.
 *
 * Ce schéma reste test-only : l'agent runtime (`devils-advocate.ts`)
 * normalise via interfaces TS internes + transformResponse, pas via Zod.
 */

/**
 * Posture de risque structurel — qualifie l'intensité du signal de risque
 * identifié par le contradicteur (analyste), pas une action prescriptive.
 * `light` = peu/pas de risque structurel détecté ; `structural` = risques
 * structurels majeurs multiples.
 */
export const DevilsAdvocateRiskPostureSchema = z.enum([
  "light",
  "elevated",
  "critical",
  "structural",
]);
export type DevilsAdvocateRiskPosture = z.infer<typeof DevilsAdvocateRiskPostureSchema>;

export const DevilsAdvocateResponseSchema = z.object({
  meta: Tier3MetaSchema,
  challenges: z.array(z.object({
    id: z.string(),
    category: z.string(),
    severity: z.enum(["CRITICAL", "HIGH", "MEDIUM"]),
    challenge: z.string(),
    evidence: z.string(),
    counterArgument: z.string(),
    probabilityOfIssue: z.string(),
    impact: z.string(),
    mitigation: z.string().optional(),
    questionForFounder: z.string(),
  })),
  blindSpots: z.array(z.object({
    area: z.string(),
    risk: z.string(),
    whyMissed: z.string(),
  })),
  stressTests: z.array(z.unknown()).optional(),
  // Phase A slice A3 — contrat natif (D1) :
  // - `structuralRisks` remplace l'ancien `killReasons` (severity via A1).
  // - `riskPosture` qualifie l'intensité, pas une action.
  // - `signalContribution` porte l'orientation (axe 1) dérivée déterministe
  //   et `evidenceSolidity` (axe 2) qui reste nullable en A3 (D2).
  structuralRisks: z.array(StructuralRiskSchema),
  riskPosture: DevilsAdvocateRiskPostureSchema,
  signalContribution: Tier3SignalContributionSchema,
});

export type DevilsAdvocateResponse = z.infer<typeof DevilsAdvocateResponseSchema>;
