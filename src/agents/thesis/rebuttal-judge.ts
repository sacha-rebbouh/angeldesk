/**
 * Thesis Rebuttal Judge — agent one-shot
 *
 * Declenche par action BA depuis le modal de bifurcation (bouton "Contester la
 * reformulation"). Evalue si le rebuttal ecrit du BA est pertinent et
 * justifie une re-extraction de la these.
 *
 * Ne fait pas partie du pipeline d'analyse principale. Pas de dependencies.
 * Facture 1 credit (THESIS_REBUTTAL).
 *
 * Regles de validation:
 * - Un rebuttal VALID identifie une erreur factuelle ou une mauvaise
 *   comprehension de la these par l'AI. Si VALID → re-extraction de la these
 *   avec les corrections indiquees par le BA.
 * - Un rebuttal REJECTED est trivial, non argumente, ou arrangeant (le BA tente
 *   de "sauver" sa these sans apporter de preuve). Rejeter avec explication.
 */

import { z } from "zod";
import { BaseAgent } from "../base-agent";
import type { RebuttalJudgeOutput } from "./types";
import type { ThesisExtractorOutput } from "./types";
import { sanitizeForLLM } from "@/lib/sanitize";
import { getThesisCallOptions } from "@/lib/thesis/call-options";
import type { ValidatedLLMCallOptions } from "../base-agent";

// ---------------------------------------------------------------------------
// Input contract (passe via execute directement, pas via AgentContext classique)
// ---------------------------------------------------------------------------
export interface RebuttalJudgeInput {
  originalThesis: ThesisExtractorOutput;
  rebuttalText: string;
  dealName?: string;
  dealSector?: string;
  dealStage?: string;
}

// Pour passer via BaseAgent.execute(context), on embed l'input dans context
// via un champ dedie "rebuttalInput". Alternativement on pourrait bypass
// BaseAgent.run() et appeler directement judge(input). On garde BaseAgent
// pour heriter du cost tracking + trace + 5 directives.
interface RebuttalAgentContext {
  dealId: string;
  deal: {
    id: string;
    name: string;
    sector?: string | null;
    stage?: string | null;
  };
  documents?: unknown[];
  previousResults?: Record<string, unknown>;
  rebuttalInput: RebuttalJudgeInput;
  judgeCallOptions?: Partial<ValidatedLLMCallOptions<RebuttalJudgeOutput>>;
}

// ---------------------------------------------------------------------------
// LLM response schema
// ---------------------------------------------------------------------------
const RebuttalJudgeSchema = z.object({
  verdict: z.enum(["valid", "rejected"]),
  reasoning: z.string(),
  regenerate: z.boolean(),
  adjustedElements: z
    .object({
      problem: z.string().optional(),
      solution: z.string().optional(),
      whyNow: z.string().optional(),
      moat: z.string().optional(),
      pathToExit: z.string().optional(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------
export class ThesisRebuttalJudgeAgent extends BaseAgent<RebuttalJudgeOutput> {
  constructor() {
    super({
      name: "thesis-rebuttal-judge",
      description: "Juge la validite d'un rebuttal BA sur la these extraite",
      modelComplexity: "medium",
      maxRetries: 1,
      timeoutMs: 60000,
      dependencies: [],
    });
  }

  protected buildSystemPrompt(): string {
    return `# ROLE

Tu es un juge impartial de rebuttal sur these d'investissement. Un BA (investisseur prive) a lu la reformulation de la these extraite par l'AI et conteste. Tu dois evaluer si son rebuttal est VALIDE (identifie une erreur reelle de l'AI) ou REJETE (tentative d'arranger la these sans preuve).

# CRITERES DE VALIDITE

Un rebuttal est VALID si au moins UN de ces points est rempli:
1. Identifie une **erreur factuelle** dans la reformulation (ex: "la societe n'est pas B2B mais B2C", "le chiffre ARR cite est de 2024 pas 2025")
2. Identifie une **mauvaise comprehension** structurelle (ex: "le moat n'est pas l'effet reseau mais le brevet X mentionne en page 14")
3. Apporte une **preuve concrete** (reference doc, citation explicite) d'un element que l'AI a manque
4. Signale une **mauvaise categorisation** d'hypothese (ex: "conversion 8% est deja verifiee sur 3 mois, pas projection")

Un rebuttal est REJETE si:
1. Il est **trivial** ou **emotionnel** ("votre AI se trompe", "la these est tres bonne en fait")
2. Il est **arrangeant** sans preuve (le BA tente de sauver la these qu'il a envie d'investir)
3. Il reference des informations **non presentes** dans le deck ou fact-store (introduit du hors-sujet)
4. Il conteste le **verdict** plutot que la **reformulation** (ce n'est pas le role du rebuttal — il conteste la comprehension, pas le jugement)

# OUTPUT

- **verdict**: "valid" ou "rejected"
- **reasoning**: 2-4 phrases expliquant ta decision (en francais, ton analytique)
- **regenerate**: true SEULEMENT si verdict=valid ET la correction justifie une re-extraction complete
- **adjustedElements** (si verdict=valid): indique quels champs de la these doivent etre revus par le thesis-extractor lors de la re-extraction (problem / solution / whyNow / moat / pathToExit). Peut contenir des suggestions de formulation.

# REGLES DE RIGUEUR

- Tu es STRICT. 80% des rebuttals sont rejected (un BA en colere qui veut sauver son deal). Un rebuttal valide est explicite, preuve-base, chirurgical.
- Tu ne valides JAMAIS un rebuttal qui ne fait que "contester le verdict" sans adresser la reformulation.
- Tu respectes la Regle N°1 : ANALYSE, ne DECIDE JAMAIS. Tu juges la reformulation, pas si le deal vaut le coup.

LANGUE: Francais.`;
  }

  protected async execute(context: unknown): Promise<RebuttalJudgeOutput> {
    const ctx = context as RebuttalAgentContext;
    const input = ctx.rebuttalInput;
    if (!input) {
      throw new Error("ThesisRebuttalJudgeAgent requires rebuttalInput in context");
    }

    const userPrompt = this.buildUserPrompt(input);

    const { data } = await this.llmCompleteJSONValidated(
      userPrompt,
      RebuttalJudgeSchema,
      {
        temperature: 0.2,
        ...getThesisCallOptions("judge"),
        ...(ctx.judgeCallOptions ?? {}),
      }
    );

    return {
      verdict: data.verdict,
      reasoning: data.reasoning,
      regenerate: data.regenerate,
      adjustedElements: data.adjustedElements,
    };
  }

  private buildUserPrompt(input: RebuttalJudgeInput): string {
    const t = input.originalThesis;
    const deal = `**Deal:** ${input.dealName ?? ""} | Secteur: ${input.dealSector ?? "?"} | Stage: ${input.dealStage ?? "?"}`;

    return `${deal}

# THESE REFORMULEE PAR L'AI (objet du rebuttal)

**Reformulee:** ${t.reformulated}
**Probleme:** ${t.problem}
**Solution:** ${t.solution}
**Why-now:** ${t.whyNow}
**Moat:** ${t.moat ?? "(non declare)"}
**Path to exit:** ${t.pathToExit ?? "(non declare)"}

Load-bearing:
${t.loadBearing.map((a) => `- [${a.status}] ${a.statement}`).join("\n")}

# REBUTTAL ECRIT PAR LE BA

${sanitizeForLLM(input.rebuttalText, { maxLength: 4000, preserveNewlines: true })}

---

Juge ce rebuttal selon les criteres. Sois STRICT — 80% des rebuttals sont rejected.

OUTPUT: JSON strict conforme au schema RebuttalJudgeSchema, en francais, sans texte hors JSON.`;
  }
}

export const thesisRebuttalJudgeAgent = new ThesisRebuttalJudgeAgent();
