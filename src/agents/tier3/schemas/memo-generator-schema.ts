import { z } from "zod";
import {
  Tier3MetaSchema,
  Tier3SignalContributionSchema,
  CriticalRiskRefSchema,
} from "./common";

/**
 * Phase A slice A4 — Schéma Memo Generator aligné contrat natif.
 *
 * D1 verrouillé :
 * - Le champ legacy `memo.verdict` (recommendation libre + score) est retiré.
 * - Le champ natif `memo.signalProfile` (Tier3SignalContribution A1) porte
 *   l'orientation native + evidenceSolidity (nullable en A4, qualifié par A6).
 * - Le champ natif `memo.criticalRisks` (CriticalRiskRef A1 structuré)
 *   remplace l'ancien `verdict.recommendation` libre. Aucun alias
 *   `killReasons` n'est admis (cf. A3 verrouillage DA).
 * - `memo.executiveSummary.recommendation` (orientation native 5 valeurs)
 *   reste cohérent avec `MemoGeneratorData.executiveSummary.recommendation`.
 *
 * D2 verrouillé : `signalProfile.evidenceSolidity` reste nullable en A4 —
 * le service Solidité A6 le qualifiera ultérieurement, jamais fabriqué
 * depuis score/confidence ici.
 *
 * Ce schéma reste test-only : l'agent runtime (`memo-generator.ts`)
 * normalise via interfaces TS internes + transformResponse, pas via Zod.
 */
// Phase A slice A4 round 2 — `.strict()` sur le contrat memo : par défaut
// `z.object` strippe les unknown keys silencieusement, ce qui laisserait passer
// `memo.verdict` legacy si `memo.signalProfile` + `memo.criticalRisks` sont
// présents en parallèle. Avec `.strict()`, toute clé supplémentaire est
// rejetée — D1 verrouillé mécaniquement.
export const MemoGeneratorResponseSchema = z.object({
  meta: Tier3MetaSchema,
  memo: z.object({
    title: z.string(),
    executiveSummary: z.string(),
    sections: z.array(z.object({
      title: z.string(),
      content: z.string(),
      keyPoints: z.array(z.string()),
    }).strict()),
    // Phase A slice A4 — Contrat natif Phase A (D1).
    signalProfile: Tier3SignalContributionSchema,
    criticalRisks: z.array(CriticalRiskRefSchema),
    appendices: z.array(z.object({
      title: z.string(),
      content: z.string(),
    }).strict()).optional(),
  }).strict(),
}).strict();

export type MemoGeneratorResponse = z.infer<typeof MemoGeneratorResponseSchema>;
