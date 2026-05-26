import { z } from "zod";
import { RedFlagSchema, QuestionSchema, MetaSchema, ScoreSchema, AlertSignalSchema, NarrativeSchema } from "./common";

// Schema aligné avec le runtime trimmé (doctrine anti-oraculaire) :
// les champs `scenarios[].exitValuation` et `scenarios[].investorReturn`
// (multiple, IRR, proceeds, dilution chiffrée) ont été retirés du
// contrat de sortie. L'agent ne produit plus que des scénarios
// qualitatifs (type, timeline, acquéreurs nommés). Le `returnSummary`
// (expectedCase / upside / downside / probabilityWeightedReturn) est
// également supprimé du contrat.
export const ExitStrategistResponseSchema = z.object({
  meta: MetaSchema,
  score: ScoreSchema.extend({ grade: z.enum(["A", "B", "C", "D", "F"]).optional() }),
  findings: z.object({
    scenarios: z.array(z.object({
      id: z.string(),
      type: z.string(),
      name: z.string(),
      description: z.string(),
      probability: z.unknown(),
      timeline: z.unknown(),
      potentialBuyers: z.array(z.unknown()).optional(),
    })),
    comparableExits: z.array(z.unknown()),
    mnaMarket: z.unknown(),
    liquidityAnalysis: z.unknown(),
    deckClaimsAnalysis: z.unknown().optional(),
  }),
  dbCrossReference: z.object({
    claims: z.array(z.object({ claim: z.string(), location: z.string(), dbVerdict: z.string(), evidence: z.string() })),
    uncheckedClaims: z.array(z.string()).optional(),
  }).optional(),
  redFlags: z.array(RedFlagSchema),
  questions: z.array(QuestionSchema),
  alertSignal: AlertSignalSchema,
  narrative: NarrativeSchema,
});

export type ExitStrategistResponse = z.infer<typeof ExitStrategistResponseSchema>;
