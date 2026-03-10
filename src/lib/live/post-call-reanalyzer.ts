// ============================================================================
// Post-Call Reanalyzer — Identifies impacted agents and triggers re-analysis
// ============================================================================

import { prisma } from "@/lib/prisma";
import { completeJSON, runWithLLMContext } from "@/services/openrouter/router";
import type { PostCallReport, DeltaReport } from "@/lib/live/types";

// ---------------------------------------------------------------------------
// Category-to-agent mapping
// ---------------------------------------------------------------------------

const CATEGORY_AGENT_MAP: Record<string, string[]> = {
  financial: ["financial-auditor"],
  competitive: ["competitive-intel"],
  team: ["team-investigator"],
  market: ["market-intelligence"],
  tech: ["tech-stack-dd", "tech-ops-dd"],
  legal: ["legal-regulatory"],
  gtm: ["gtm-analyst"],
  customer: ["customer-intel"],
  exit: ["exit-strategist"],
  cap_table: ["cap-table-auditor"],
};

// Keywords used to detect category from free-text agent names and fact descriptions
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  financial: [
    "financial", "financ", "revenue", "arr", "mrr", "burn", "runway",
    "valorisation", "valuation", "chiffre", "marge", "ebitda", "cash",
  ],
  competitive: [
    "compet", "concurrent", "market share", "part de marché",
    "positioning", "positionnement",
  ],
  team: [
    "team", "équipe", "fondateur", "founder", "co-founder", "cto",
    "ceo", "hire", "recrutement", "turnover",
  ],
  market: [
    "market", "marché", "tam", "sam", "som", "tendance", "trend",
    "growth", "croissance",
  ],
  tech: [
    "tech", "stack", "scalab", "infrastructure", "dette technique",
    "tech debt", "sécurité", "security", "ip", "brevet", "patent",
  ],
  legal: ["legal", "juridique", "réglementaire", "regulatory", "compliance"],
  gtm: ["gtm", "go-to-market", "acquisition", "cac", "ltv", "conversion"],
  customer: ["customer", "client", "churn", "retention", "nps", "satisfaction"],
  exit: ["exit", "sortie", "ipo", "acquisition", "m&a"],
  cap_table: ["cap table", "dilution", "vesting", "esop", "actionnariat"],
};

// ---------------------------------------------------------------------------
// identifyImpactedAgents
// ---------------------------------------------------------------------------

export function identifyImpactedAgents(report: PostCallReport): string[] {
  const impactedSet = new Set<string>();

  // Process newInformation — use agentsAffected + keyword detection
  const newInfo = Array.isArray(report.newInformation) ? report.newInformation : [];
  for (const info of newInfo) {
    // Use agents explicitly listed by the LLM
    const agents = Array.isArray(info.agentsAffected) ? info.agentsAffected : [];
    for (const agent of agents) {
      impactedSet.add(agent);
    }

    // Also detect from fact text + impact text via keywords
    const text = `${info.fact} ${info.impact}`.toLowerCase();
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.some((kw) => text.includes(kw))) {
        const agents = CATEGORY_AGENT_MAP[category];
        if (agents) {
          for (const a of agents) impactedSet.add(a);
        }
      }
    }
  }

  // Process contradictions — keyword detection on claims
  for (const contradiction of report.contradictions) {
    const text =
      `${contradiction.claimInDeck} ${contradiction.claimInCall}`.toLowerCase();
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.some((kw) => text.includes(kw))) {
        const agents = CATEGORY_AGENT_MAP[category];
        if (agents) {
          for (const a of agents) impactedSet.add(a);
        }
      }
    }
  }

  // Always include contradiction-detector if contradictions exist
  if (report.contradictions.length > 0) {
    impactedSet.add("contradiction-detector");
  }

  // Always include Tier 3 synthesis agents
  impactedSet.add("synthesis-deal-scorer");
  impactedSet.add("memo-generator");

  return [...impactedSet];
}

// ---------------------------------------------------------------------------
// triggerTargetedReanalysis
// ---------------------------------------------------------------------------

export async function triggerTargetedReanalysis(
  dealId: string,
  agentNames: string[],
  sessionId: string
): Promise<void> {
  // Dynamic imports to avoid circular dependencies
  const { AgentOrchestrator } = await import("@/agents/orchestrator");
  const { clearContextCache } = await import("@/lib/live/context-compiler");

  // 1. Invalidate the deal context cache (new call data is available)
  clearContextCache(dealId);

  // 2. Determine analysis type based on impacted agents
  const tier3Names = [
    "synthesis-deal-scorer", "memo-generator", "contradiction-detector",
    "devils-advocate", "scenario-modeler", "conditions-analyst",
  ];
  const hasTier1Agents = agentNames.some((name) => !tier3Names.includes(name));
  const analysisType = hasTier1Agents ? "full_analysis" : "tier3_synthesis";

  // 3. Create Analysis record for tracking
  const analysis = await prisma.analysis.create({
    data: {
      dealId,
      type: "FULL_DD",
      mode: "post_call_reanalysis",
      status: "RUNNING",
      totalAgents: agentNames.length,
      completedAgents: 0,
      startedAt: new Date(),
      results: {
        triggeredBy: sessionId,
        targetedAgents: agentNames,
      },
    },
  });

  console.log(
    `[post-call-reanalyzer] Starting reanalysis for deal ${dealId}. ` +
      `Type: ${analysisType}. Targeted agents: ${agentNames.join(", ")}.`
  );

  // 4. Run the orchestrator — the CALL_TRANSCRIPT document (enriched with condensed intel)
  //    is automatically loaded via getDealWithRelations() in the orchestrator.
  const orchestrator = new AgentOrchestrator();

  try {
    const result = await orchestrator.runAnalysis({
      dealId,
      type: analysisType as "full_analysis" | "tier3_synthesis",
      forceRefresh: true,
      isUpdate: true,
    });

    // 5. Update the tracking record
    await prisma.analysis.update({
      where: { id: analysis.id },
      data: {
        status: result.success ? "COMPLETED" : "FAILED",
        completedAt: new Date(),
        completedAgents: Object.values(result.results).filter((r) => r.success).length,
        totalCost: result.totalCost,
        totalTimeMs: result.totalTimeMs,
        summary: result.summary,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        results: result.results as any,
      },
    });

    console.log(
      `[post-call-reanalyzer] Reanalysis completed for deal ${dealId}. ` +
        `Success: ${result.success}. Cost: $${result.totalCost.toFixed(4)}.`
    );
  } catch (error) {
    await prisma.analysis.update({
      where: { id: analysis.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        summary: `Reanalysis failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
    });
    console.error(
      `[post-call-reanalyzer] Reanalysis failed for deal ${dealId}:`,
      error
    );
  }
}

// ---------------------------------------------------------------------------
// generateDeltaReport — lightweight comparison without re-running agents
// ---------------------------------------------------------------------------

const DELTA_SYSTEM_PROMPT = `Tu es un analyste spécialisé dans la comparaison d'informations pré-call et post-call pour des investissements Business Angel.

RÈGLE ABSOLUE — TON ANALYTIQUE :
- Tu CONSTATES des écarts et des faits nouveaux. Tu ne DÉCIDES jamais.
- Tu ne dis JAMAIS "investir", "ne pas investir", "passer", "rejeter", "GO", "NO-GO".
- Tu rapportes des différences factuelles entre ce qui était connu avant le call et ce qui a été appris pendant.
- Le Business Angel est le seul décideur. Tu fournis des signaux, pas des directives.

LANGUE : Français (sauf clés JSON, enums, acronymes techniques).

## Anti-Hallucination Directive — Confidence Threshold
Answer only if you are >90% confident, since mistakes are penalised 9 points, while correct answers receive 1 point, and an answer of "I don't know" receives 0 points.

## Anti-Hallucination Directive — Abstention Permission
It is perfectly acceptable (and preferred) for you to say "I don't know" or "I'm not confident enough to answer this." I would rather receive an honest "I'm unsure" than a confident answer that might be wrong.
If you are uncertain about any part of your response, flag it clearly with [UNCERTAIN] so I know to verify it independently.
Uncertainty is valued here, not penalised.

## Anti-Hallucination Directive — Citation Demand
For every factual claim in your response:
1. Cite a specific, verifiable source (name, publication, date)
2. If you cannot cite a specific source, mark the claim as [UNVERIFIED] and explain why you believe it to be true
3. If you are relying on general training data rather than a specific source, say so explicitly
Do not present unverified information as established fact.

## Anti-Hallucination Directive — Self-Audit
After completing your response, perform a self-audit:
1. Identify the 3 claims in your response that you are LEAST confident about
2. For each one, explain what could be wrong and what the alternative might be
3. Rate your overall response confidence: HIGH / MEDIUM / LOW
Be ruthlessly honest. I will not penalise you for uncertainty.

## Anti-Hallucination Directive — Structured Uncertainty
Structure your response in three clearly labelled sections:
**CONFIDENT:** Claims where you have strong evidence and high certainty (>90%)
**PROBABLE:** Claims where you believe this is likely correct but acknowledge uncertainty (50-90%)
**SPECULATIVE:** Claims where you are filling in gaps, making inferences, or relying on pattern-matching rather than direct knowledge (<50%)
Every claim must be placed in one of these three categories.
Do not present speculative claims as confident ones.

FORMAT DE SORTIE : JSON strict conforme au schéma DeltaReport.
- newFacts : faits appris pendant le call qui n'étaient pas dans l'analyse
- contradictions : écarts entre l'analyse pré-call et les propos du fondateur
- resolvedQuestions : questions qui ont trouvé réponse pendant le call
- impactedAgents : agents dont l'analyse serait modifiée par ces nouvelles informations
- confidenceChange : évolution du niveau de confiance (before/after/reason)`;

export async function generateDeltaReport(
  sessionId: string,
  dealId: string
): Promise<DeltaReport> {
  // Fetch session summary and latest analysis in parallel
  const [sessionSummary, latestAnalysis] = await Promise.all([
    prisma.sessionSummary.findUnique({
      where: { sessionId },
    }),
    prisma.analysis.findFirst({
      where: { dealId, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      select: { id: true, results: true, summary: true },
    }),
  ]);

  if (!sessionSummary) {
    throw new Error(
      `SessionSummary not found for session ${sessionId}. Generate the post-call report first.`
    );
  }

  // Build comparison prompt
  const analysisContext = latestAnalysis
    ? `## Résultats de l'analyse pré-call
${latestAnalysis.summary ?? "Pas de résumé disponible."}

Données agents (JSON) :
${JSON.stringify(latestAnalysis.results, null, 2).slice(0, 8000)}`
    : "## Aucune analyse pré-call disponible.";

  const sessionContext = `## Résumé du call
${sessionSummary.executiveSummary}

## Informations nouvelles identifiées
${JSON.stringify(sessionSummary.newInformation, null, 2)}

## Contradictions identifiées
${JSON.stringify(sessionSummary.contradictions, null, 2)}

## Questions posées et réponses
${JSON.stringify(sessionSummary.questionsAsked, null, 2)}

## Questions restantes
${JSON.stringify(sessionSummary.remainingQuestions, null, 2)}`;

  const prompt = `Compare les informations de l'analyse pré-call avec ce qui a été appris pendant le call. Identifie les faits nouveaux, contradictions, questions résolues, et l'impact sur les agents d'analyse.

${analysisContext}

${sessionContext}

Génère un DeltaReport JSON. Pour impactedAgents, liste les noms d'agents dont l'analyse serait modifiée (ex: "financial-auditor", "team-investigator", etc.).`;

  const { data: deltaReport } = await runWithLLMContext(
    { agentName: "post-call-delta" },
    () =>
      completeJSON<DeltaReport>(prompt, {
        model: "SONNET",
        maxTokens: 2000,
        systemPrompt: DELTA_SYSTEM_PROMPT,
      })
  );

  return deltaReport;
}
