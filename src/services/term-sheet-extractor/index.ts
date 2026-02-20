/**
 * Term Sheet Extractor Service
 *
 * Takes extracted text from a term sheet document and uses an LLM
 * to extract structured deal terms with confidence scores per field.
 */

import { completeJSON } from "@/services/openrouter/router";
import { z } from "zod";

// Schema for the LLM response
const extractionResponseSchema = z.object({
  valuationPre: z.number().positive().nullable(),
  amountRaised: z.number().positive().nullable(),
  dilutionPct: z.number().min(0).max(100).nullable(),
  instrumentType: z.string().nullable(),
  instrumentDetails: z.string().nullable(),
  liquidationPref: z.string().nullable(),
  antiDilution: z.string().nullable(),
  proRataRights: z.boolean().nullable(),
  informationRights: z.boolean().nullable(),
  boardSeat: z.string().nullable(),
  founderVesting: z.boolean().nullable(),
  vestingDurationMonths: z.number().int().min(0).nullable(),
  vestingCliffMonths: z.number().int().min(0).nullable(),
  esopPct: z.number().min(0).max(100).nullable(),
  dragAlong: z.boolean().nullable(),
  tagAlong: z.boolean().nullable(),
  ratchet: z.boolean().nullable(),
  payToPlay: z.boolean().nullable(),
  milestoneTranches: z.boolean().nullable(),
  nonCompete: z.boolean().nullable(),
  customConditions: z.string().nullable(),
  confidence: z.record(z.string(), z.number().min(0).max(100)),
});

export type ExtractionResult = z.infer<typeof extractionResponseSchema>;

export interface ExtractTermsInput {
  documentText: string;
  documentName: string;
}

export async function extractTermsFromDocument(
  input: ExtractTermsInput,
): Promise<ExtractionResult> {
  // Truncate text to avoid token overflow (max ~8K tokens input)
  const text = input.documentText.substring(0, 15000);

  const systemPrompt = `Tu es un expert en extraction de conditions d'investissement a partir de term sheets et lettres d'intention.

Extrais les conditions d'investissement du document ci-dessous en JSON.

REGLES:
- Ne remplis un champ QUE si le document le mentionne explicitement
- Met null pour tout champ non mentionne
- Le champ "confidence" contient un score 0-100 pour chaque champ extrait (pas les null)
- Les montants doivent etre en euros (convertir si necessaire)
- Pour instrumentType, utilise un de ces codes: BSA_AIR, BSA_AIR_WITH_CAP_DISCOUNT, BSA_AIR_WITH_CAP, BSA_AIR_NO_CAP, CONVERTIBLE_NOTE, EQUITY_ORDINARY, EQUITY_PREFERRED, LOAN, MIXED, OTHER
- Pour liquidationPref: none, 1x_non_participating, 1x_participating, 1x_participating_capped, 2x_participating
- Pour antiDilution: none, weighted_average_broad, weighted_average_narrow, full_ratchet
- Pour boardSeat: none, observer, full_seat`;

  const userPrompt = `Document: "${input.documentName}"

---
${text}
---

Extrais les conditions en JSON (schema: valuationPre, amountRaised, dilutionPct, instrumentType, instrumentDetails, liquidationPref, antiDilution, proRataRights, informationRights, boardSeat, founderVesting, vestingDurationMonths, vestingCliffMonths, esopPct, dragAlong, tagAlong, ratchet, payToPlay, milestoneTranches, nonCompete, customConditions, confidence).`;

  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

  const result = await completeJSON<ExtractionResult>(fullPrompt, {
    model: "HAIKU",
    temperature: 0.1,
    maxTokens: 2000,
  });

  // Validate with Zod (completeJSON only parses JSON, doesn't validate schema)
  const parsed = extractionResponseSchema.safeParse(result.data);
  if (parsed.success) {
    return parsed.data;
  }

  // If validation fails, return the raw data with best effort
  return result.data;
}
