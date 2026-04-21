/**
 * Thesis Reconciler Agent — Tier 3
 *
 * Mission: confronter la these initiale (extraite en Tier 0.5 par thesis-extractor)
 * aux findings des agents Tier 1/2/3. Detecter les contradictions structurelles
 * et emettre les red flags THESIS_VS_REALITY. Mettre a jour le verdict si
 * necessaire (ex: agents revelent que le moat revendique n'existe pas).
 *
 * Tourne APRES tous les agents d'analyse, avant memo-generator, pour que le
 * memo et les UI integrent le verdict rafraichi.
 */

import { z } from "zod";
import { BaseAgent } from "../base-agent";
import type { AgentContext, AgentResult, EnrichedAgentContext } from "../types";
import type {
  ThesisReconcilerOutput,
  ThesisVerdict,
  ThesisExtractorOutput,
} from "../thesis/types";
import { worstVerdict, THESIS_VERDICT_ORDER } from "../thesis/types";
import { formatReconcilerLensSection } from "../thesis/prompt-formatting";
import { sanitizeForLLM } from "@/lib/sanitize";
import { getThesisCallOptions } from "@/lib/thesis/call-options";

// ---------------------------------------------------------------------------
// LLM response schema
// ---------------------------------------------------------------------------
const ThesisReconcilerSchema = z.object({
  updatedVerdict: z.enum(["very_favorable", "favorable", "contrasted", "vigilance", "alert_dominant"]),
  updatedConfidence: z.number().min(0).max(100),
  verdictChangeJustification: z.string(),
  newRedFlags: z.array(
    z.object({
      category: z.enum(["THESIS", "THESIS_VS_REALITY"]),
      severity: z.enum(["CRITICAL", "HIGH", "MEDIUM"]),
      title: z.string(),
      description: z.string(),
      sourceAgent: z.string(),
      sourceClaim: z.string(),
      conflictingFinding: z.string(),
    })
  ),
  reconciliationNotes: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      impact: z.enum(["confirms", "challenges", "neutral"]),
    })
  ),
  hiddenStrengths: z.array(z.string()),
});

type LLMReconcilerOutput = z.infer<typeof ThesisReconcilerSchema>;

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------
export class ThesisReconcilerAgent extends BaseAgent<ThesisReconcilerOutput> {
  constructor() {
    super({
      name: "thesis-reconciler",
      description: "Reconciliation de la these initiale vs findings Tier 1/2/3 (Tier 3)",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 120000,
      // Dependencies: agents dont les findings peuvent contredire la these
      dependencies: [
        "thesis-extractor",
        "financial-auditor",
        "market-intelligence",
        "competitive-intel",
        "team-investigator",
        "customer-intel",
      ],
    });
  }

  protected buildSystemPrompt(): string {
    return `# ROLE

Tu es un reconciliateur de these. Tu as deux inputs critiques :
1. Une these d'investissement extraite au debut du pipeline (reformulation + claims + load-bearing assumptions + verdict preliminaire).
2. Les findings complets des agents Tier 1/2/3 (financial-auditor, market-intelligence, competitive-intel, team-investigator, customer-intel, etc.)

# MISSION

Confronter les claims et hypotheses de la these initiale aux findings des agents. Detecter les contradictions structurelles. Emettre les red flags THESIS_VS_REALITY ou THESIS. Mettre a jour le verdict si les findings revelent une fracture critique.

# TYPES DE CONTRADICTIONS A DETECTER

**Contradictions chiffrees** (les plus dangereuses):
- La these claim TAM €5Bn, market-intelligence calcule TAM adressable €400M (ecart 12x)
- La these claim CAC payback 3 mois, financial-auditor etablit payback 24 mois
- La these claim retention 95%, customer-intel trouve churn 40% annuel

**Contradictions structurelles**:
- La these claim "moat par effet reseau", competitive-intel montre 3 concurrents avec la meme techno sans effet reseau demontre
- La these claim "equipe exceptionnelle", team-investigator montre CEO sans experience secteur + CTO senior parti il y a 2 mois
- La these claim "path IPO 2028", financial-auditor montre burn rate incompatible avec cette timeline

**Contradictions d'hypotheses** (load-bearing):
- L'hypothese "conversion 8% a scale" est contredite par customer-intel qui montre 2% en realite

# RED FLAGS A EMETTRE

Pour chaque contradiction DETECTEE avec confiance, emettre un red flag:
- **category**: "THESIS_VS_REALITY" si l'agent contredit un claim ; "THESIS" si c'est une fragilite structurelle non revelee avant (ex: hidden strength d'un concurrent)
- **severity**: CRITICAL si la contradiction fait CASSER la these (>50% d'ecart sur chiffre clé), HIGH si elle l'affaiblit (20-50%), MEDIUM sinon
- **sourceAgent**: nom exact de l'agent (ex: "market-intelligence")
- **sourceClaim**: le claim de la these qui est contredit
- **conflictingFinding**: le finding de l'agent qui contredit

# MISE A JOUR DU VERDICT

Tu peux mettre a jour le verdict initial :
- Si >= 2 contradictions CRITICAL detectees → verdict doit degrader d'au moins 1 cran (ex: contrasted → vigilance)
- Si contradictions CRITICAL multiples affectent des load-bearing → verdict peut aller directement a alert_dominant
- Si findings confirment la these sur axes cles → verdict PEUT s'ameliorer (mais conservatisme prudent : max 1 cran d'amelioration)
- Sinon, conserver le verdict initial

# HIDDEN STRENGTHS

Si un agent revele un avantage QUE LA THESE NE MENTIONNE PAS (ex: team-investigator decouvre un fondateur avec un past success non mentionne, market-intelligence montre un shift reglementaire qui favorise la boite), remonte-le en hiddenStrengths. C'est un signal favorable a integrer.

# REGLES DE RIGUEUR

- Un red flag THESIS_VS_REALITY doit CITER explicitement le claim de la these ET le finding de l'agent
- Tu ne fabriques pas de contradictions : si l'agent ne contredit pas explicitement, pas de red flag
- Tu respectes la Regle N°1 : langage analytique, pas prescriptif
- Si updatedVerdict != initial verdict, justifier en 2-3 phrases (verdictChangeJustification)

LANGUE: Francais.`;
  }

  protected async execute(context: AgentContext): Promise<ThesisReconcilerOutput> {
    const enriched = context as EnrichedAgentContext;

    // 1. Recuperer la these initiale depuis previousResults
    const thesisResult = context.previousResults?.["thesis-extractor"];
    if (!thesisResult || !thesisResult.success || !("data" in thesisResult)) {
      // Pas de these extraite → rien a reconcilier, retourner no-op
      return {
        updatedVerdict: "contrasted",
        updatedConfidence: 0,
        verdictChanged: false,
        newRedFlags: [],
        reconciliationNotes: [
          {
            title: "These initiale indisponible",
            detail: "Le thesis-extractor n'a pas produit de these exploitable. Reconciliation impossible.",
            impact: "neutral",
          },
        ],
        hiddenStrengths: [],
      };
    }

    const thesis = thesisResult.data as ThesisExtractorOutput;
    const initialVerdict = thesis.verdict;

    // 2. Construire un resume des findings Tier 1/2/3
    const agentFindingsSummary = this.buildAgentFindingsSummary(context);

    // 3. Construire le prompt user
    const userPrompt = this.buildUserPrompt(thesis, agentFindingsSummary);

    // 4. Appel LLM
    const { data } = await this.llmCompleteJSONValidated<LLMReconcilerOutput>(
      userPrompt,
      ThesisReconcilerSchema,
      {
        temperature: 0.2,
        ...getThesisCallOptions<LLMReconcilerOutput>("reconciler", {
          initialVerdict,
          initialConfidence: thesis.confidence,
        }),
      }
    );

    const updatedVerdict: ThesisVerdict = data.updatedVerdict;
    const verdictChanged = updatedVerdict !== initialVerdict;

    // 5. Garde-fou : si updatedVerdict ameliore de plus d'1 cran, cap a +1
    const clampedVerdict = this.clampVerdictChange(initialVerdict, updatedVerdict);
    const finalVerdict = clampedVerdict;
    const finalChanged = finalVerdict !== initialVerdict;

    return {
      updatedVerdict: finalVerdict,
      updatedConfidence: data.updatedConfidence,
      verdictChanged: finalChanged,
      newRedFlags: data.newRedFlags,
      reconciliationNotes: data.reconciliationNotes,
      hiddenStrengths: data.hiddenStrengths,
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  private buildAgentFindingsSummary(context: AgentContext): string {
    const relevantAgents = [
      "financial-auditor",
      "market-intelligence",
      "competitive-intel",
      "team-investigator",
      "customer-intel",
      "gtm-analyst",
      "tech-stack-dd",
      "tech-ops-dd",
      "legal-regulatory",
      "cap-table-auditor",
      "exit-strategist",
      "deck-forensics",
    ];

    const parts: string[] = [];

    for (const agentName of relevantAgents) {
      const result = context.previousResults?.[agentName];
      if (!result?.success || !("data" in result)) continue;

      const data = (result as AgentResult & { data?: Record<string, unknown> }).data;
      if (!data) continue;

      const summary: string[] = [];
      summary.push(`### ${agentName}`);

      // Score
      const score = (data.score as { value?: number } | undefined)?.value;
      if (typeof score === "number") summary.push(`Score: ${score}/100`);

      // Narrative / oneLiner
      const narrative = data.narrative as { oneLiner?: string; summary?: string } | undefined;
      if (narrative?.oneLiner) summary.push(`OneLiner: ${narrative.oneLiner}`);
      if (narrative?.summary) summary.push(`Summary: ${narrative.summary.slice(0, 600)}`);

      // Key findings (top metrics, top red flags)
      const findings = data.findings as Record<string, unknown> | undefined;
      if (findings) {
        const findingsJson = JSON.stringify(findings).slice(0, 1500);
        summary.push(`Findings (trunc): ${findingsJson}`);
      }

      // Red flags
      const redFlags = data.redFlags as Array<{ title?: string; severity?: string; description?: string }> | undefined;
      if (Array.isArray(redFlags) && redFlags.length > 0) {
        const top = redFlags.slice(0, 5).map((r) => `  - [${r.severity}] ${r.title}`).join("\n");
        summary.push(`Top red flags:\n${top}`);
      }

      parts.push(summary.join("\n"));
    }

    const combined = parts.join("\n\n");
    return sanitizeForLLM(combined, { maxLength: 30000, preserveNewlines: true });
  }

  private buildUserPrompt(thesis: ThesisExtractorOutput, agentFindingsSummary: string): string {
    return `# THESE INITIALE (extraite par thesis-extractor Tier 0.5)

**Reformulee:** ${thesis.reformulated}
**Probleme:** ${thesis.problem}
**Solution:** ${thesis.solution}
**Why-now:** ${thesis.whyNow}
**Moat:** ${thesis.moat ?? "(non declare)"}
**Path to exit:** ${thesis.pathToExit ?? "(non declare)"}

**Verdict initial:** ${thesis.verdict} (confidence ${thesis.confidence})

## LOAD-BEARING ASSUMPTIONS (hypotheses porteuses)
${thesis.loadBearing.map((a) => `- [${a.status}] ${a.statement} — impact: ${a.impact}`).join("\n")}

## CLAIMS DES 3 LUNETTES (YC / Thiel / Angel Desk)
${formatReconcilerLensSection("YC", thesis.ycLens)}
${formatReconcilerLensSection("Thiel", thesis.thielLens)}
${formatReconcilerLensSection("Angel Desk", thesis.angelDeskLens)}

---

# FINDINGS DES AGENTS TIER 1/2/3

${agentFindingsSummary}

---

# TA MISSION

Confronter la these initiale aux findings. Detecter les contradictions. Emettre les red flags THESIS_VS_REALITY. Mettre a jour le verdict si necessaire (max -∞/+1 cran par rapport a l'initial — amelioration conservatrice). Remonter les hidden strengths decouverts par les agents.

OUTPUT ATTENDU: JSON strict conforme au schema, en francais, sans texte hors JSON.`;
  }

  /**
   * Cap l'amelioration du verdict a +1 cran max (conservatisme prudent).
   * La degradation n'est pas cappee (une these peut s'effondrer completement).
   */
  private clampVerdictChange(initial: ThesisVerdict, proposed: ThesisVerdict): ThesisVerdict {
    const initialIdx = THESIS_VERDICT_ORDER.indexOf(initial);
    const proposedIdx = THESIS_VERDICT_ORDER.indexOf(proposed);

    // Amelioration : proposedIdx < initialIdx (plus favorable = plus a gauche)
    if (proposedIdx < initialIdx - 1) {
      // Cap a initial - 1
      return THESIS_VERDICT_ORDER[initialIdx - 1];
    }
    return proposed;
  }
}

export const thesisReconcilerAgent = new ThesisReconcilerAgent();
// Silence un warning unused (worstVerdict peut etre utile en extensions futures)
void worstVerdict;
