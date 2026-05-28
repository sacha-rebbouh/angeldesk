// ============================================================================
// Post-Call Reanalyzer — Identifies impacted agents and triggers re-analysis
// ============================================================================

import { prisma } from "@/lib/prisma";
import { completeJSON, runWithLLMContext } from "@/services/openrouter/router";
import { assertCompletionNotTruncated } from "@/services/openrouter/truncation-guard";
import { costMonitor } from "@/services/cost-monitor";
import { loadResults } from "@/services/analysis-results/load-results";
import { getCorpusSnapshotDocumentIds } from "@/services/corpus";
import { getFiveAntiHallucinationDirectives } from "@/agents/orchestration/prompts/anti-hallucination";
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

type SessionReanalysisScope = {
  sessionDocumentId: string | null;
  sessionUserId: string;
  baselineAnalysis: {
    id: string;
    summary: string | null;
    corpusSnapshotId: string | null;
    documentIds: string[];
  } | null;
  scopedDocumentIds: string[];
};

function dedupeDocumentIds(documentIds: Array<string | null | undefined>): string[] {
  return [...new Set(documentIds.filter((documentId): documentId is string => Boolean(documentId)))];
}

function resolveAnalysisDocumentIds(
  analysis: {
    documentIds?: Array<string | null | undefined>;
    documents?: Array<{ documentId: string | null | undefined }>;
  } | null
): string[] {
  if (!analysis) return [];

  return dedupeDocumentIds([
    ...(analysis.documents?.map((document) => document.documentId) ?? []),
    ...(analysis.documentIds ?? []),
  ]);
}

async function resolveSessionReanalysisScope(
  sessionId: string,
  dealId: string
): Promise<SessionReanalysisScope> {
  const session = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      dealId: true,
      userId: true,
      documentId: true,
      startedAt: true,
      createdAt: true,
    },
  });

  if (!session || session.dealId !== dealId) {
    throw new Error(`LiveSession ${sessionId} not found for deal ${dealId}`);
  }

  const cutoff = session.startedAt ?? session.createdAt;
  const baselineAnalysis = await prisma.analysis.findFirst({
    where: {
      dealId,
      status: "COMPLETED",
      ...(cutoff ? { completedAt: { lte: cutoff } } : {}),
      OR: [
        { mode: null },
        { mode: { not: "post_call_reanalysis" } },
      ],
    },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      summary: true,
      corpusSnapshotId: true,
      documentIds: true,
      documents: {
        select: { documentId: true },
      },
    },
  });

  const baselineDocumentIds = baselineAnalysis?.corpusSnapshotId
    ? await getCorpusSnapshotDocumentIds(baselineAnalysis.corpusSnapshotId)
    : resolveAnalysisDocumentIds(baselineAnalysis);

  return {
    sessionDocumentId: session.documentId ?? null,
    sessionUserId: session.userId,
    baselineAnalysis: baselineAnalysis
      ? {
          ...baselineAnalysis,
          documentIds: baselineDocumentIds,
        }
      : null,
    scopedDocumentIds:
      baselineDocumentIds.length > 0
        ? dedupeDocumentIds([...baselineDocumentIds, session.documentId])
        : [],
  };
}

// ---------------------------------------------------------------------------
// triggerTargetedReanalysis
// ---------------------------------------------------------------------------

export async function triggerTargetedReanalysis(
  dealId: string,
  agentNames: string[],
  sessionId: string
): Promise<{
  analysisId: string;
  baselineAnalysisId: string | null;
  documentIds: string[];
}> {
  // Dynamic imports to avoid circular dependencies
  const { AgentOrchestrator } = await import("@/agents/orchestrator");
  const { clearContextCache } = await import("@/lib/live/context-compiler");

  // 1. Invalidate the deal context cache (new call data is available)
  clearContextCache(dealId);

  // 2. Determine analysis type based on impacted agents
  const tier3Names = [
    "synthesis-deal-scorer", "memo-generator", "contradiction-detector",
    "devils-advocate", "conditions-analyst",
  ];
  const hasTier1Agents = agentNames.some((name) => !tier3Names.includes(name));
  const analysisType = hasTier1Agents ? "full_analysis" : "tier3_synthesis";
  const scope = await resolveSessionReanalysisScope(sessionId, dealId);

  console.log(
    `[post-call-reanalyzer] Starting reanalysis for deal ${dealId}. ` +
      `Type: ${analysisType}. Targeted agents: ${agentNames.join(", ")}. ` +
      `Baseline analysis: ${scope.baselineAnalysis?.id ?? "none"}. ` +
      `Scoped documents: ${scope.scopedDocumentIds.length > 0 ? scope.scopedDocumentIds.length : "latest deal corpus"}.`
  );

  // 3. Run the orchestrator — the CALL_TRANSCRIPT document (enriched with condensed intel)
  //    is automatically loaded via getDealWithRelations() in the orchestrator.
  const orchestrator = new AgentOrchestrator();

  try {
    const result = await orchestrator.runAnalysis({
      dealId,
      type: analysisType as "full_analysis" | "tier3_synthesis",
      forceRefresh: true,
      isUpdate: true,
      analysisModeOverride: "post_call_reanalysis",
      ...(scope.scopedDocumentIds.length > 0
        ? { documentIds: scope.scopedDocumentIds }
        : {}),
    });

    console.log(
      `[post-call-reanalyzer] Reanalysis completed for deal ${dealId}. ` +
        `Analysis: ${result.sessionId}. Success: ${result.success}. Cost: $${result.totalCost.toFixed(4)}.`
    );
    return {
      analysisId: result.sessionId,
      baselineAnalysisId: scope.baselineAnalysis?.id ?? null,
      documentIds: scope.scopedDocumentIds,
    };
  } catch (error) {
    console.error(
      `[post-call-reanalyzer] Reanalysis failed for deal ${dealId}:`,
      error
    );
    throw error;
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

${getFiveAntiHallucinationDirectives()}

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
  // Fetch session summary and its pre-call baseline in parallel
  const [sessionSummary, scope] = await Promise.all([
    prisma.sessionSummary.findUnique({
      where: { sessionId },
    }),
    resolveSessionReanalysisScope(sessionId, dealId),
  ]);

  if (!sessionSummary) {
    throw new Error(
      `SessionSummary not found for session ${sessionId}. Generate the post-call report first.`
    );
  }

  const baselineResults = scope.baselineAnalysis
    ? await loadResults(scope.baselineAnalysis.id)
    : null;

  // Build comparison prompt
  const analysisContext = scope.baselineAnalysis
    ? `## Résultats de l'analyse pré-call
${scope.baselineAnalysis.summary ?? "Pas de résumé disponible."}

Données agents (JSON) :
${JSON.stringify(baselineResults, null, 2).slice(0, 8000)}`
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

  const deltaResult = await runWithLLMContext(
    { agentName: "post-call-delta" },
    () =>
      completeJSON<DeltaReport>(prompt, {
        model: "SONNET",
        maxTokens: 2000,
        systemPrompt: DELTA_SYSTEM_PROMPT,
      })
  );

  // Phase C C1d-4 — fail-closed strict sur troncature LLM. Le
  // `DeltaReport.impactedAgents` détermine quels Tier 1 sont re-runned
  // par l'orchestrateur. Un partial = mauvais set d'agents → ré-analyse
  // ciblée incomplète.
  assertCompletionNotTruncated(deltaResult.data, {
    caller: "post-call-delta",
  });

  // Phase C C3b — Live cost wiring. `scope.sessionUserId` is the
  // LiveSession.userId resolved upstream; `dealId` is non-null here by
  // contract (`generateDeltaReport` requires it). Fire-and-forget.
  void costMonitor.recordLiveCall({
    sessionId,
    userId: scope.sessionUserId,
    dealId,
    agent: "post-call-delta",
    operation: "live_post_call_delta",
    cost: deltaResult.cost ?? 0,
    model: deltaResult.model,
    inputTokens: deltaResult.usage?.inputTokens,
    outputTokens: deltaResult.usage?.outputTokens,
  });

  return deltaResult.data;
}
