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
import type { AgentContext, AgentResult } from "../types";
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
// Exporté pour test : le terminalFallbackData déterministe DOIT valider contre ce
// schéma (sinon llmCompleteJSONValidated throw → success:false → cœur produit perdu).
export const ThesisReconcilerSchema = z.object({
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

type DeterministicThesisField =
  | "problem"
  | "solution"
  | "whyNow"
  | "moat"
  | "loadBearing";

type DeterministicChallenge = {
  // `null` = aucun champ de thèse n'est confidemment matché (Codex 9a) : on ne
  // fabrique alors PAS d'association vers une hypothèse porteuse → reconciliationNote.
  field: DeterministicThesisField | null;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  agentName: string;
  reason: string;
};

type DeterministicGuardrails = {
  blockers: Array<{
    agentName: string;
    reason: string;
    recommendation?: string;
  }>;
  challenges: DeterministicChallenge[];
  verdictFloor?: ThesisVerdict;
};

// Ordre de sévérité pour un tri STABLE des challenges → sortie déterministe
// reproductible au replay (idempotence persistence, Phase 9b).
const DETERMINISTIC_SEVERITY_ORDER: Record<"CRITICAL" | "HIGH" | "MEDIUM", number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
};

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
      // 180s : le réconciliateur confronte la thèse à TOUS les findings Tier 1/2/3.
      // À 120s il timeoutait (2 tentatives) sur les gros dossiers ; l'input est aussi
      // réduit dans buildAgentFindingsSummary pour tenir dans le budget.
      timeoutMs: 180000,
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
    const deterministicGuardrails = this.buildDeterministicGuardrails(context);

    // 3. Construire le prompt user
    const userPrompt = this.buildUserPrompt(thesis, agentFindingsSummary, deterministicGuardrails);

    // 4. Appel LLM — avec un terminalFallbackData DÉTERMINISTE (floor + challenges)
    //    qui SURCHARGE le no-op « keep initial verdict » de getThesisCallOptions
    //    (spread AVANT, override APRÈS — l'option déterministe gagne). Chaîne LLM
    //    épuisée → vraie réconciliation (resolution: terminal_fallback, success:true),
    //    plus un no-op « réconciliation indisponible » : le cœur produit reste rendu.
    const { data, resolution } = await this.llmCompleteJSONValidated<LLMReconcilerOutput>(
      userPrompt,
      ThesisReconcilerSchema,
      {
        temperature: 0.2,
        ...getThesisCallOptions<LLMReconcilerOutput>("reconciler", {
          initialVerdict,
          initialConfidence: thesis.confidence,
        }),
        terminalFallbackData: this.buildDeterministicLLMReconciliation(thesis, deterministicGuardrails),
      }
    );

    // 5. Garde-fou : si updatedVerdict ameliore de plus d'1 cran, cap a +1
    const clampedVerdict = this.clampVerdictChange(initialVerdict, data.updatedVerdict);
    const finalVerdict = this.applyDeterministicVerdictFloor(
      clampedVerdict,
      deterministicGuardrails.verdictFloor
    );
    const finalChanged = finalVerdict !== initialVerdict;
    const floorApplied = finalVerdict !== clampedVerdict;

    const reconciliationNotes = [...data.reconciliationNotes];
    if (floorApplied && deterministicGuardrails.verdictFloor) {
      const blockerSummary = deterministicGuardrails.blockers
        .slice(0, 2)
        .map((blocker) => `${blocker.agentName}: ${blocker.reason}`)
        .join(" | ");
      reconciliationNotes.unshift({
        title: "Garde-fou deterministe applique",
        detail:
          `Les signaux structures des agents imposent un floor de verdict a ` +
          `${deterministicGuardrails.verdictFloor}. ${blockerSummary}`,
        impact: "challenges",
      });
    }

    // Chaîne LLM épuisée → réconciliation déterministe. Note honnête en tête :
    // l'UI doit savoir que la synthèse vient des signaux structurés, pas d'un modèle
    // (capture de `resolution`, base-agent.ts — ignoré jusqu'ici).
    if (resolution === "terminal_fallback") {
      reconciliationNotes.unshift({
        title: "Réconciliation déterministe — synthèse LLM indisponible",
        detail:
          "Les modèles de synthèse étaient indisponibles. La réconciliation ci-dessous est " +
          "dérivée des signaux structurés des agents (verdict plancher + points de friction), " +
          "sans synthèse rédigée par un modèle.",
        impact: "neutral",
      });
    }

    return {
      updatedVerdict: finalVerdict,
      updatedConfidence: data.updatedConfidence,
      verdictChanged: finalChanged,
      newRedFlags: data.newRedFlags,
      reconciliationNotes,
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
      if (narrative?.summary) summary.push(`Summary: ${narrative.summary.slice(0, 400)}`);

      // Key findings (top metrics, top red flags)
      const findings = data.findings as Record<string, unknown> | undefined;
      if (findings) {
        const findingsJson = JSON.stringify(findings).slice(0, 900);
        summary.push(`Findings (trunc): ${findingsJson}`);
      }

      // Red flags
      const redFlags = data.redFlags as Array<{ title?: string; severity?: string; description?: string }> | undefined;
      if (Array.isArray(redFlags) && redFlags.length > 0) {
        const top = redFlags.slice(0, 3).map((r) => `  - [${r.severity}] ${r.title}`).join("\n");
        summary.push(`Top red flags:\n${top}`);
      }

      parts.push(summary.join("\n"));
    }

    // Budget réduit (30k → 12k) : le réconciliateur timeoutait sur les gros
    // dossiers. On garde les agents prioritaires (financial/market/team/competitive
    // en tête de relevantAgents) ; la troncature coupe d'abord les moins prioritaires.
    const combined = parts.join("\n\n");
    return sanitizeForLLM(combined, { maxLength: 12000, preserveNewlines: true });
  }

  private buildDeterministicGuardrails(context: AgentContext): DeterministicGuardrails {
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
      "deck-forensics",
    ];

    const blockers: DeterministicGuardrails["blockers"] = [];
    const challenges: DeterministicChallenge[] = [];
    const seenChallenges = new Set<string>();

    for (const agentName of relevantAgents) {
      const result = context.previousResults?.[agentName];
      if (!result?.success || !("data" in result)) continue;

      const data = (result as AgentResult & { data?: Record<string, unknown> }).data;
      if (!data) continue;

      const alertSignal = data.alertSignal as
        | { hasBlocker?: boolean; blockerReason?: string; recommendation?: string }
        | undefined;
      if (alertSignal?.hasBlocker) {
        const reason = alertSignal.blockerReason?.trim() || "Blocage critique signale par l'agent.";
        blockers.push({
          agentName,
          reason,
          recommendation: alertSignal.recommendation,
        });
        this.pushDeterministicChallenge(
          challenges,
          seenChallenges,
          {
            field: this.inferThesisField(reason),
            severity: "CRITICAL",
            agentName,
            reason,
          }
        );
      }

      const redFlags = Array.isArray(data.redFlags)
        ? (data.redFlags as Array<{ severity?: string; title?: string; description?: string }>)
        : [];
      for (const redFlag of redFlags) {
        const severity = this.normalizeDeterministicSeverity(redFlag.severity);
        if (severity === "MEDIUM") continue;
        const reason = [redFlag.title, redFlag.description].filter(Boolean).join(" — ").trim();
        if (!reason) continue;
        this.pushDeterministicChallenge(
          challenges,
          seenChallenges,
          {
            field: this.inferThesisField(reason),
            severity,
            agentName,
            reason,
          }
        );
      }
    }

    // Codex #2 : un blocker pousse DÉJÀ un challenge CRITICAL (pushDeterministicChallenge).
    // Ajouter `blockers.length` double-comptait le même signal (1 blocker → 2 critical
    // → alert_dominant à tort). On compte les signaux CRITICAL UNIQUES (challenges
    // dédupliqués par field:agent:reason).
    const criticalSignals = challenges.filter((challenge) => challenge.severity === "CRITICAL").length;
    const highSignals = challenges.filter((challenge) => challenge.severity === "HIGH").length;

    let verdictFloor: ThesisVerdict | undefined;
    if (criticalSignals >= 2) {
      verdictFloor = "alert_dominant";
    } else if (criticalSignals >= 1 || highSignals >= 3) {
      verdictFloor = "vigilance";
    }

    return {
      blockers,
      challenges: challenges.slice(0, 8),
      verdictFloor,
    };
  }

  private pushDeterministicChallenge(
    target: DeterministicChallenge[],
    seen: Set<string>,
    challenge: DeterministicChallenge
  ): void {
    const key = `${challenge.field ?? "_"}:${challenge.agentName}:${challenge.reason}`;
    if (seen.has(key)) return;
    seen.add(key);
    target.push(challenge);
  }

  private normalizeDeterministicSeverity(value: string | undefined): "CRITICAL" | "HIGH" | "MEDIUM" {
    const upper = (value ?? "").toUpperCase();
    if (upper === "CRITICAL") return "CRITICAL";
    if (upper === "HIGH") return "HIGH";
    return "MEDIUM";
  }

  // Retourne `null` quand AUCUN champ n'est confidemment matché (Codex 9a) — au lieu
  // d'un défaut « loadBearing » qui fabriquerait une association vers loadBearing[0].
  private inferThesisField(text: string): DeterministicThesisField | null {
    const normalized = text.toLowerCase();
    if (
      /(moat|concurren|competition|diff[eé]renci|barri[eè]re|network effect|patent|commodity)/i.test(normalized)
    ) {
      return "moat";
    }
    if (/(why now|timing|fen[eê]tre|window|r[eé]glement|regulat|tailwind|headwind)/i.test(normalized)) {
      return "whyNow";
    }
    if (/(problem|douleur|pain|customer need|besoin|demande|adoption)/i.test(normalized)) {
      return "problem";
    }
    if (/(solution|produit|product|tech|feasibility|impl[eé]mentation|fit)/i.test(normalized)) {
      return "solution";
    }
    return null;
  }

  private buildDeterministicGuardrailsSection(guardrails: DeterministicGuardrails): string {
    if (guardrails.blockers.length === 0 && guardrails.challenges.length === 0) {
      return "Aucun garde-fou deterministe critique n'a ete detecte avant appel LLM.";
    }

    const lines: string[] = [];
    if (guardrails.blockers.length > 0) {
      lines.push("## Blockers agents");
      for (const blocker of guardrails.blockers) {
        lines.push(`- ${blocker.agentName}: ${blocker.reason}`);
      }
    }

    if (guardrails.challenges.length > 0) {
      lines.push("## Challenges structures");
      for (const challenge of guardrails.challenges) {
        lines.push(
          `- [${challenge.severity}] ${challenge.field ?? "signal general"} <- ${challenge.agentName}: ${challenge.reason}`
        );
      }
    }

    if (guardrails.verdictFloor) {
      lines.push(`## Floor de verdict`);
      lines.push(
        `- Tu ne peux pas remonter au-dessus de ${guardrails.verdictFloor} sans preuve explicite contraire.`
      );
    }

    return lines.join("\n");
  }

  private buildUserPrompt(
    thesis: ThesisExtractorOutput,
    agentFindingsSummary: string,
    deterministicGuardrails: DeterministicGuardrails
  ): string {
    return `# THESE INITIALE (extraite par thesis-extractor Tier 0.5)

**Reformulee:** ${thesis.reformulated}
**Probleme:** ${thesis.problem}
**Solution:** ${thesis.solution}
**Why-now:** ${thesis.whyNow}
**Moat:** ${thesis.moat ?? "(non declare)"}

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

# GARDE-FOUS DETERMINISTES (pre-calcules cote TypeScript)

${this.buildDeterministicGuardrailsSection(deterministicGuardrails)}

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

  private applyDeterministicVerdictFloor(
    proposed: ThesisVerdict,
    verdictFloor?: ThesisVerdict
  ): ThesisVerdict {
    if (!verdictFloor) return proposed;
    return THESIS_VERDICT_ORDER.indexOf(verdictFloor) > THESIS_VERDICT_ORDER.indexOf(proposed)
      ? verdictFloor
      : proposed;
  }

  /**
   * Réconciliation DÉTERMINISTE (sans LLM) construite depuis les garde-fous
   * structurés. Passée comme `terminalFallbackData` : quand toute la chaîne LLM
   * échoue, `llmCompleteJSONValidated` renvoie CECI (resolution `terminal_fallback`)
   * au lieu de throw → l'agent réussit (`success:true`) avec une VRAIE réconciliation
   * (verdict plancher + challenges), pas un no-op « réconciliation indisponible ».
   *
   * Type = `LLMReconcilerOutput` (PAS `ThesisReconcilerOutput`, Codex #1) : le
   * post-processing de `execute()` (clamp + floor + verdictChanged) le transforme
   * ensuite, exactement comme une sortie LLM réelle. Fonction PURE et déterministe
   * (tri stable) pour que l'équivalence tienne au replay (idempotence 9b).
   */
  private buildDeterministicLLMReconciliation(
    thesis: ThesisExtractorOutput,
    guardrails: DeterministicGuardrails
  ): LLMReconcilerOutput {
    const updatedVerdict = guardrails.verdictFloor ?? thesis.verdict;
    const downgraded =
      THESIS_VERDICT_ORDER.indexOf(updatedVerdict) > THESIS_VERDICT_ORDER.indexOf(thesis.verdict);

    // Tri STABLE (sévérité puis field/agent/reason) → sortie reproductible au replay.
    const sortedChallenges = [...guardrails.challenges].sort((a, b) => {
      const sevDiff = DETERMINISTIC_SEVERITY_ORDER[a.severity] - DETERMINISTIC_SEVERITY_ORDER[b.severity];
      if (sevDiff !== 0) return sevDiff;
      const fieldA = a.field ?? "";
      const fieldB = b.field ?? "";
      if (fieldA !== fieldB) return fieldA < fieldB ? -1 : 1;
      if (a.agentName !== b.agentName) return a.agentName < b.agentName ? -1 : 1;
      return a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0;
    });

    const newRedFlags: LLMReconcilerOutput["newRedFlags"] = [];
    const reconciliationNotes: LLMReconcilerOutput["reconciliationNotes"] = [];

    for (const challenge of sortedChallenges) {
      // newRedFlags PRUDENTS (Codex #2 + 9a) : un THESIS_VS_REALITY n'est émis QUE si
      // (a) un champ de thèse est confidemment matché (field non-null, jamais le défaut
      // loadBearing fabriqué) ET (b) le claim porteur correspondant existe (le schéma
      // exige sourceClaim/conflictingFinding réels). Sinon → reconciliationNote.
      const claim = challenge.field ? this.thesisClaimForField(thesis, challenge.field) : null;
      if (challenge.severity !== "MEDIUM" && challenge.field && claim) {
        newRedFlags.push({
          category: "THESIS_VS_REALITY",
          severity: challenge.severity,
          title: `Contradiction structurelle — ${this.thesisFieldLabel(challenge.field)}`,
          description: challenge.reason,
          sourceAgent: challenge.agentName, // interne ; sanitizé côté UI
          sourceClaim: claim,
          conflictingFinding: challenge.reason,
        });
      } else {
        reconciliationNotes.push({
          title: challenge.field ? `Signal structuré — ${this.thesisFieldLabel(challenge.field)}` : "Signal structuré",
          detail: challenge.reason,
          impact: "challenges",
        });
      }
    }

    // Confiance dérivée : basse (synthèse LLM indisponible) ; plus basse si le floor dégrade.
    const baseConfidence = typeof thesis.confidence === "number" ? thesis.confidence : 50;
    const updatedConfidence = downgraded ? Math.min(baseConfidence, 30) : Math.min(baseConfidence, 45);

    return {
      updatedVerdict,
      updatedConfidence,
      verdictChangeJustification: downgraded
        ? `Réconciliation déterministe : les signaux structurés des agents imposent un verdict plancher (${updatedVerdict}).`
        : "Réconciliation déterministe : aucun signal structuré n'impose de dégrader le verdict initial.",
      newRedFlags,
      reconciliationNotes,
      hiddenStrengths: [],
    };
  }

  /** Claim porteur de la thèse pour un field donné (null si non déclaré). */
  private thesisClaimForField(
    thesis: ThesisExtractorOutput,
    field: DeterministicThesisField
  ): string | null {
    switch (field) {
      case "problem":
        return thesis.problem?.trim() || null;
      case "solution":
        return thesis.solution?.trim() || null;
      case "whyNow":
        return thesis.whyNow?.trim() || null;
      case "moat":
        return thesis.moat?.trim() || null;
      case "loadBearing":
        return thesis.loadBearing[0]?.statement?.trim() || null;
    }
  }

  /** Libellé user-facing d'un field de thèse (jamais l'enum brut). */
  private thesisFieldLabel(field: DeterministicThesisField): string {
    switch (field) {
      case "problem":
        return "Problème";
      case "solution":
        return "Solution";
      case "whyNow":
        return "Why-now";
      case "moat":
        return "Moat";
      case "loadBearing":
        return "Hypothèse porteuse";
    }
  }
}

export const thesisReconcilerAgent = new ThesisReconcilerAgent();
// Silence un warning unused (worstVerdict peut etre utile en extensions futures)
void worstVerdict;
