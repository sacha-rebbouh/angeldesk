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
  // Create a new Analysis record to track the re-analysis
  // The actual agent execution will be wired in Phase 5 (orchestrator integration)
  await prisma.analysis.create({
    data: {
      dealId,
      type: "FULL_DD",
      mode: "post_call_reanalysis",
      status: "PENDING",
      totalAgents: agentNames.length,
      completedAgents: 0,
      results: {
        triggeredBy: sessionId,
        targetedAgents: agentNames,
        status: "awaiting_orchestrator_integration",
      },
    },
  });

  // TODO (Phase 5): Wire into the orchestrator to actually re-run targeted agents.
  // The orchestrator should:
  // 1. Load the Analysis record
  // 2. Run only the agents in agentNames (not all 40)
  // 3. Merge results with the latest completed analysis
  // 4. Update deal scores if synthesis agents ran
  console.log(
    `[post-call-reanalyzer] Analysis record created for deal ${dealId}. ` +
      `Targeted agents: ${agentNames.join(", ")}. ` +
      `Orchestrator integration pending (Phase 5).`
  );
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
