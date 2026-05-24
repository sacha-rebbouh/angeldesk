import { z } from "zod";
import {
  Tier3MetaSchema,
  Tier3SignalContributionSchema,
} from "./common";

/**
 * Phase A slice A4-bis — Schéma Contradiction Detector aligné contrat natif.
 *
 * D1 verrouillé :
 * - `signalIntensity` natif (low | elevated | high | critical) remplace la
 *   sémantique prescriptive `recommendation: PROCEED/STOP` côté contrat
 *   demandé au LLM. Dérivé déterministe par le runtime depuis severity
 *   counts ; le LLM ne pilote pas (anti-régression round 2 A3 sur riskPosture).
 * - `signalContribution` natif (Tier3SignalContribution A1).
 *
 * D2 verrouillé : `signalContribution.evidenceSolidity` reste nullable en
 * A4-bis — le service Solidité A6 le qualifiera ultérieurement.
 *
 * Exception cross-agent documentée (hors scope A4-bis) :
 * - Le contrat global `AgentAlertSignal` (recommendation PROCEED/STOP) reste
 *   un debt cross-agent. Côté runtime de l'agent, `alertSignal.recommendation`
 *   est désormais DÉRIVÉ DÉTERMINISTE depuis `signalIntensity` — le LLM ne
 *   pilote plus cette décision. Le shape de `AgentAlertSignal` n'est pas
 *   muté en A4-bis (slice cross-agent dédié).
 *
 * `.strict()` appliqué : toute clé supplémentaire (legacy ou autre) est
 * rejetée par le schema test-only. Ce schéma reste test-only ; l'agent
 * runtime normalise via interfaces TS + transformResponse.
 */
export const ContradictionDetectorResponseSchema = z.object({
  meta: Tier3MetaSchema,
  contradictions: z.array(z.object({
    id: z.string(),
    severity: z.enum(["CRITICAL", "HIGH", "MEDIUM"]),
    type: z.string(),
    agent1: z.string(),
    claim1: z.string(),
    source1: z.string(),
    agent2: z.string(),
    claim2: z.string(),
    source2: z.string(),
    analysis: z.string(),
    impact: z.string(),
    resolution: z.string().optional(),
    questionForFounder: z.string(),
  }).strict()),
  summary: z.object({
    totalContradictions: z.number(),
    criticalCount: z.number(),
    topRisks: z.array(z.string()),
    verdict: z.string(),
  }).strict(),
  // Phase A slice A4-bis — Contrat natif Phase A (D1).
  signalIntensity: z.enum(["low", "elevated", "high", "critical"]),
  signalContribution: Tier3SignalContributionSchema,
}).strict();

export type ContradictionDetectorResponse = z.infer<typeof ContradictionDetectorResponseSchema>;
