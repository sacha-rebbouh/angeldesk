import type { Deal } from "@prisma/client";
import type {
  AgentContext,
  AgentResult,
  EnrichedAgentContext,
  AnalysisAgentResult,
} from "../types";
import { enrichDeal, invalidateDealContext, getContextEngineCacheStats, type FounderInput } from "@/services/context-engine";
import { extractFactsFromDealContext } from "@/services/context-engine/fact-normalizer";
import { getCacheManager } from "@/services/cache";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getBAPreferences, type BAPreferences } from "@/services/benchmarks";
import {
  generateDealFingerprint,
  lookupCachedAnalysis,
  getDealForFingerprint,
  invalidateDealAnalysisCache,
  getDealCacheStats,
} from "@/services/analysis-cache";
import {
  AnalysisStateMachine,
  messageBus,
  createFindingMessage,
  consensusEngine,
  reflexionEngine,
  extractAllFindings,
  extractValidatedClaims,
  type VerificationContext,
  validateAndCalculate,
  type CalculationResult,
  calculateARR,
  calculateLTVCACRatio,
  calculateRuleOf40,
} from "../orchestration";
import type { ScoredFinding, ConfidenceScore } from "@/scoring/types";
import { runTier1CrossValidation } from "../orchestration/tier1-cross-validation";
import { sanitizeResultForDownstream, sanitizeAgentNarratives } from "../orchestration/result-sanitizer";
import { costMonitor } from "@/services/cost-monitor";
import { querySimilarDeals, getValuationBenchmarks } from "@/services/funding-db";
import { withHardWall } from "@/lib/hard-wall";
import { setAnalysisContext, runWithLLMContext } from "@/services/openrouter/router";
import { runJob } from "@/services/jobs";
import { ensureCorpusSnapshot, type CorpusSnapshotMaterialization } from "@/services/corpus";
import {
  buildEvidenceLedgerFromContext,
  formatEvidenceLedgerForPrompt,
} from "@/services/evidence-ledger";

// Fact Store imports for Tier 0 fact extraction
import { factExtractorAgent, type FactExtractorOutput } from "@/agents/tier0/fact-extractor";
import { deckCoherenceChecker, type DeckCoherenceReport } from "@/agents/tier0/deck-coherence-checker";
// Thesis-first (Tier 0.5) — extraction de la these d'investissement
import { thesisExtractorAgent } from "@/agents/tier0/thesis-extractor";
import type { ThesisExtractorOutput, ThesisReconcilerOutput } from "@/agents/thesis/types";
import { thesisService } from "@/services/thesis";
import { loadResults } from "@/services/analysis-results/load-results";
import { InlineStepRunner, type StepRunner } from "./step-runner";
import { runTerminalStepwiseDriver } from "./full-analysis-driver";
import {
  buildStepState,
  rehydrateContext,
  buildTier0FactsWire,
  applyTier0FactsWire,
} from "./full-analysis-step-state-bridge";
import { writeStepwiseSnapshot, readLatestStepwiseSnapshot } from "./full-analysis-snapshot";
import type { FullAnalysisUnit } from "./full-analysis-step-state";
import {
  getCurrentFacts,
  formatFactStoreForAgents,
  createFactEventsBatch,
  getCategoryFromFactKey,
  persistExtractedFactsWithMatching,
  updateFactsInMemory,
  reformatFactStoreWithValidations,
  buildReliabilityFromValidation,
  computeTruthConfidence,
} from "@/services/fact-store";
import type { CurrentFact, FactCategory } from "@/services/fact-store/types";
import { replaceUnreliableWithPlaceholders, formatFactsForScoringAgents } from "@/services/fact-store/fact-filter";
import { buildCanonicalRuntimeDeal } from "@/agents/utils/canonical-runtime-deal";

// Import modular components
import {
  type AnalysisOptions,
  type AnalysisResult,
  type AnalysisType,
  type AdvancedAnalysisOptions,
  ANALYSIS_CONFIGS,
  AGENT_COUNTS,
  TIER1_AGENT_NAMES,
  TIER1_PHASE_A,
  TIER1_PHASE_B,
  TIER1_PHASE_C,
  TIER1_PHASE_D,
  TIER3_AGENT_NAMES,
  FULL_ANALYSIS_TIER3_AGENT_NAMES,
  TIERS_EXECUTED,
  TIER3_EXECUTION_BATCHES,
  TIER3_BATCHES_BEFORE_TIER2,
  TIER3_BATCHES_AFTER_TIER2,
} from "./types";
import {
  BASE_AGENTS,
  getTier1Agents,
  getTier3Agents,
  getTier2SectorExpert,
} from "./agent-registry";
import {
  createAnalysis,
  updateAnalysisProgress,
  completeAnalysis,
  persistStateTransition,
  persistReasoningTrace,
  persistScoredFindings,
  persistDebateRecord,
  processAgentResult,
  updateDealStatus,
  getDealWithRelations,
  findInterruptedAnalyses,
  loadAnalysisForRecovery,
  markAnalysisAsFailed,
  loadPreviousAnalysisQuestions,
  saveCheckpoint,
} from "./persistence";
import {
  generateSummary,
  generateTier1Summary,
  generateTier3Summary,
  generateFullAnalysisSummary,
} from "./summary";
import {
  detectEarlyWarnings,
  aggregateWarnings,
} from "./early-warnings";
import type { EarlyWarning, OnEarlyWarning } from "./types";
import { buildDealEvidenceContext, type DocumentEvidenceContext } from "@/services/evidence";

/**
 * Phase 5.1 (Codex round 15 P1) — single entry point for evidence-context
 * loading shared by runBaseAnalysis, runFullAnalysis, runTier1Analysis, resume.
 * Non-fatal: any failure returns undefined so agents still get the legacy
 * context without the temporal prelude.
 */
async function loadEvidenceContextSafe(
  dealId: string
): Promise<{ evidenceContext?: Record<string, DocumentEvidenceContext>; evidenceToday: Date }> {
  const evidenceToday = new Date();
  try {
    const evidenceContext = await buildDealEvidenceContext(prisma, dealId, { today: evidenceToday });
    return { evidenceContext, evidenceToday };
  } catch (evidenceError) {
    console.error("[orchestrator] loadEvidenceContextSafe failed (non-fatal):", evidenceError);
    return { evidenceContext: undefined, evidenceToday };
  }
}

// Re-export types
export type { AnalysisOptions, AnalysisResult, AnalysisType, EarlyWarning };

/**
 * Infer FactCategory from a factKey prefix.
 * Example: "financial.arr" → "FINANCIAL", "team.cto_experience" → "TEAM"
 */
function inferCategoryFromFactKey(factKey: string): FactCategory {
  const taxonomyCategory = getCategoryFromFactKey(factKey);
  if (taxonomyCategory) {
    return taxonomyCategory;
  }

  const prefix = factKey.split(".")[0]?.toLowerCase() ?? "";
  const mapping: Record<string, FactCategory> = {
    financial: "FINANCIAL",
    team: "TEAM",
    market: "MARKET",
    product: "PRODUCT",
    legal: "LEGAL",
    competition: "COMPETITION",
    traction: "TRACTION",
  };
  return mapping[prefix] ?? "OTHER";
}
export { ANALYSIS_CONFIGS, AGENT_COUNTS };

// Type alias for deal with relations
type DealWithDocs = Deal & {
  documents: NonNullable<AgentContext["documents"]>;
  founders?: { id: string; name: string; role: string; linkedinUrl: string | null }[];
};

type ContextSeed = {
  tagline?: string;
  competitors?: string[];
  founders?: Array<{ name: string; role?: string; linkedinUrl?: string }>;
  productDescription?: string;
  businessModel?: string;
  productName?: string;
  coreValueProposition?: string;
  useCases?: string[];
  keyDifferentiators?: string[];
  websiteUrl?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toAgentResultsRecord(value: unknown): Record<string, AgentResult> | null {
  return isRecord(value) ? (value as Record<string, AgentResult>) : null;
}

function scopeDocumentsToSnapshot<T extends { id: string }>(
  documents: T[],
  snapshotDocumentIds?: string[] | null
): T[] {
  if (!snapshotDocumentIds?.length) {
    return documents;
  }

  const order = new Map(
    snapshotDocumentIds.map((documentId, index) => [documentId, index])
  );

  return documents
    .filter((document) => order.has(document.id))
    .sort(
      (left, right) =>
        (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    );
}

function attachEvidenceLedger(context: EnrichedAgentContext): EnrichedAgentContext {
  const canonicalDeal = buildCanonicalRuntimeDeal(
    context.canonicalDeal,
    {
      factStore: context.factStore,
      previousResults: context.previousResults,
      extractedData: context.extractedData,
    }
  );
  const canonicalContext: EnrichedAgentContext = {
    ...context,
    deal: canonicalDeal,
    canonicalDeal,
  };
  const evidenceLedger = buildEvidenceLedgerFromContext(canonicalContext);
  return {
    ...canonicalContext,
    evidenceLedger,
    evidenceLedgerFormatted: formatEvidenceLedgerForPrompt(evidenceLedger),
  };
}

interface FullAnalysisRunInit {
  failFastOnCritical: AdvancedAnalysisOptions["failFastOnCritical"];
  maxCostUsd: AdvancedAnalysisOptions["maxCostUsd"];
  onEarlyWarning: AdvancedAnalysisOptions["onEarlyWarning"];
  isUpdate: boolean;
  enableTrace: boolean;
  stopAfterThesis: boolean;
  stepwise: boolean;
  analysisModeOverride: AdvancedAnalysisOptions["analysisModeOverride"];
  startTime: number;
  collectedWarnings: EarlyWarning[];
  initialCanonicalDeal: ReturnType<typeof buildCanonicalRuntimeDeal>;
  sectorExpert: Awaited<ReturnType<typeof getTier2SectorExpert>>;
  TOTAL_AGENTS: number;
  corpusSnapshot: Awaited<ReturnType<AgentOrchestrator["materializeAnalysisCorpusSnapshot"]>>;
  scopedDocuments: DealWithDocs["documents"];
  analysis: Awaited<ReturnType<typeof createAnalysis>>;
  stateMachine: AnalysisStateMachine;
  allResults: Record<string, AgentResult>;
  totalCost: number;
  completedCount: number;
  factStore: CurrentFact[];
  factStoreFormatted: string;
  founderResponses: Array<{ questionId: string; question: string; answer: string; category: string }>;
}

/**
 * H (Fix C) — mur dur sur la funding-DB de buildVerificationContext. Généreux : les 2 requêtes
 * Neon (limit 20) saines sont <5s → le mur NE FIRE JAMAIS sur run sain (byte-equiv OFF/v3) ;
 * borne un hang DB bien sous le plafond Vercel d'un step durable (300s) → pas de replay infini.
 */
const FUNDING_DB_WALL_MS = 30_000;

export class AgentOrchestrator {
  /**
   * Run a complete analysis session
   *
   * CACHING: Before running any analysis, checks if a valid cached result exists.
   * A cached result is valid if:
   * 1. The deal fingerprint matches (deal hasn't changed)
   * 2. The cache hasn't expired (24h TTL)
   * 3. The analysis mode matches
   *
   * Use forceRefresh: true to bypass cache and force re-analysis.
   */
  async runAnalysis(options: AnalysisOptions): Promise<AnalysisResult> {
    // Wrap entire analysis in request-scoped LLM context (thread-safe)
    return runWithLLMContext(
      { agentName: null, analysisId: null },
      () => this._runAnalysisImpl(options)
    );
  }

  private async _runAnalysisImpl(options: AnalysisOptions): Promise<AnalysisResult> {
    const {
      dealId,
      type,
      documentIds,
      onProgress,
      enableTrace = true, // Enable traces by default for transparency
      forceRefresh = false,
      analysisModeOverride,
      mode = "full",
      failFastOnCritical = false,
      maxCostUsd,
      onEarlyWarning,
      isUpdate = false, // If true, uses UPDATE_ANALYSIS credits (2) vs INITIAL_ANALYSIS (5)
    } = options;
    const startTime = Date.now();

    // Get deal with documents
    const deal = await getDealWithRelations(dealId, {
      documentIds,
      allowSupersededDocuments: analysisModeOverride === "post_call_reanalysis",
    });
    if (!deal) {
      throw new Error(`Deal not found: ${dealId}`);
    }

    // Initialize cost tracking (will be completed by specific analysis methods)
    // Note: analysisId is not available yet, will be set after createAnalysis

    // === CACHE CHECK ===
    // Only check cache for expensive analysis types
    // `full_analysis` is thesis-first and may trigger user-facing credit debits
    // plus a review gate. Serving it from cache would bypass thesis extraction
    // and can produce misleading "fresh" Deep Dives without a new thesis pass.
    const cacheableTypes: AnalysisType[] = ["tier1_complete", "tier3_synthesis", "tier2_sector"];

    if (!forceRefresh && !documentIds?.length && cacheableTypes.includes(type)) {
      const cachedResult = await this.checkAnalysisCache(dealId, type);
      if (cachedResult) {
        console.log(`[Orchestrator] Returning cached analysis for deal ${dealId}, type=${type}`);
        onProgress?.({
          currentAgent: "cache",
          completedAgents: cachedResult.results ? Object.keys(cachedResult.results).length : 0,
          totalAgents: cachedResult.results ? Object.keys(cachedResult.results).length : 0,
        });
        return cachedResult;
      }
    }

    // === RUN ANALYSIS ===
    // Route to specialized handlers based on analysis type
    let result: AnalysisResult;

    switch (type) {
      case "tier1_complete":
        result = await this.runTier1Analysis(deal as DealWithDocs, dealId, onProgress, {
          mode,
          failFastOnCritical,
          maxCostUsd,
          onEarlyWarning,
          enableTrace,
          analysisModeOverride,
          isUpdate,
        });
        break;
      case "full_analysis":
        result = await this.runFullAnalysis(deal as DealWithDocs, dealId, onProgress, {
          mode,
          failFastOnCritical,
          maxCostUsd,
          onEarlyWarning,
          enableTrace,
          analysisModeOverride,
          isUpdate,
          stopAfterThesis: options.stopAfterThesis,
          stepwise: options.stepwise,
          dispatchEventId: options.dispatchEventId,
          stepwiseGraphVersion: options.stepwiseGraphVersion,
        }, options.stepRunner ?? new InlineStepRunner());
        break;
      case "tier3_synthesis":
        result = await this.runTier3Synthesis(
          deal as DealWithDocs,
          dealId,
          onProgress,
          onEarlyWarning,
          undefined,
          undefined,
          analysisModeOverride
        );
        break;
      case "tier2_sector":
        result = await this.runTier2SectorAnalysis(
          deal as DealWithDocs,
          dealId,
          onProgress,
          undefined,
          analysisModeOverride
        );
        break;
      default:
        result = await this.runBaseAnalysis(
          deal as DealWithDocs,
          dealId,
          type,
          onProgress,
          onEarlyWarning,
          startTime,
          analysisModeOverride
        );
    }

    // === STORE FINGERPRINT FOR CACHE ===
    if (cacheableTypes.includes(type) && result.success) {
      await this.storeAnalysisFingerprint(dealId, result.sessionId);
    }

    return result;
  }

  /**
   * Check agent result for early warnings and emit them
   * Returns the warnings detected (for collection)
   */
  private checkAndEmitWarnings(
    agentName: string,
    result: AgentResult,
    collectedWarnings: EarlyWarning[],
    onEarlyWarning?: OnEarlyWarning
  ): void {
    const warnings = detectEarlyWarnings(agentName, result);

    for (const warning of warnings) {
      collectedWarnings.push(warning);

      // Emit immediately for real-time UI updates
      onEarlyWarning?.(warning);

      // Log critical warnings
      if (warning.severity === "critical") {
        console.log(
          `[EarlyWarning] CRITICAL from ${agentName}: ${warning.title}`
        );
      }
    }
  }

  /**
   * Add early warnings to analysis result
   */
  private addWarningsToResult(
    result: AnalysisResult,
    warnings: EarlyWarning[]
  ): AnalysisResult {
    const aggregated = aggregateWarnings(warnings);

    return {
      ...result,
      earlyWarnings: aggregated.all,
      hasCriticalWarnings: aggregated.hasCritical,
      summary: aggregated.hasCritical
        ? `${aggregated.summary}\n\n${result.summary ?? ""}`
        : result.summary,
    };
  }

  /**
   * Check if a valid cached analysis exists
   */
  private async checkAnalysisCache(
    dealId: string,
    type: AnalysisType,
  ): Promise<AnalysisResult | null> {
    try {
      // Get deal for fingerprint
      const dealForFingerprint = await getDealForFingerprint(dealId);
      if (!dealForFingerprint) return null;

      // Generate current fingerprint
      // Phase 5.1 (Codex round 15 P2) — include EvidenceSignals in the
      // fingerprint so new ATTACHMENT_RELATION / CAP_TABLE_AS_OF / etc.
      // invalidate the analysis cache.
      //
      // Phase 5.2 (Codex round 16 P2) — fail-CLOSED: if the signal lookup
      // fails (DB hiccup, partial outage), we MUST NOT serve a cached
      // analysis whose fingerprint was computed without signals — that would
      // silently surface stale evidence. Return null → run a fresh analysis.
      let evidenceSignalsForFingerprint;
      try {
        evidenceSignalsForFingerprint = await prisma.evidenceSignal.findMany({
          where: { dealId },
          select: { documentId: true, signalScopeKey: true, kind: true, signalHash: true, extractorVersion: true },
        });
      } catch (signalsError) {
        console.error("[Orchestrator] Cache: evidence signals load failed — failing CLOSED, no cache hit:", signalsError);
        return null;
      }
      const fingerprint = generateDealFingerprint(dealForFingerprint, evidenceSignalsForFingerprint);

      // Lookup cached analysis
      const mode = type; // mode in DB matches type
      const cached = await lookupCachedAnalysis(dealId, mode, fingerprint);

      if (!cached.found || !cached.analysis || !cached.results) return null;

      const results = cached.results as Record<string, AgentResult>;

      return {
        sessionId: cached.analysis.id,
        dealId,
        type,
        success: cached.analysis.status === "COMPLETED",
        results,
        totalCost: Number(cached.analysis.totalCost ?? 0),
        totalTimeMs: cached.analysis.totalTimeMs ?? 0,
        summary: cached.analysis.summary ?? undefined,
        fromCache: true,
        cacheAge: cached.cacheAge,
      };
    } catch (error) {
      console.error("[Orchestrator] Cache lookup error:", error);
      return null;
    }
  }

  /**
   * Store fingerprint for a completed analysis
   */
  private async storeAnalysisFingerprint(
    dealId: string,
    analysisId: string,
  ): Promise<void> {
    try {
      const dealForFingerprint = await getDealForFingerprint(dealId);
      if (!dealForFingerprint) return;

      // Phase 5.1 (Codex round 15 P2) — include EvidenceSignals in the
      // fingerprint so new ATTACHMENT_RELATION / CAP_TABLE_AS_OF / etc.
      // invalidate the analysis cache.
      //
      // Phase 5.2 (Codex round 16 P2) — if signals load fails, do NOT store a
      // partial fingerprint (a future cache hit would compare against the
      // wrong baseline). Skip the fingerprint update; the analysis row stays
      // without a dealFingerprint, which means subsequent reads can't hit
      // the cache for it (safe).
      let evidenceSignalsForFingerprint;
      try {
        evidenceSignalsForFingerprint = await prisma.evidenceSignal.findMany({
          where: { dealId },
          select: { documentId: true, signalScopeKey: true, kind: true, signalHash: true, extractorVersion: true },
        });
      } catch (signalsError) {
        console.error("[Orchestrator] Store fingerprint: evidence signals load failed — skipping fingerprint (safe):", signalsError);
        return;
      }
      const fingerprint = generateDealFingerprint(dealForFingerprint, evidenceSignalsForFingerprint);

      await prisma.analysis.update({
        where: { id: analysisId },
        data: {
          dealFingerprint: fingerprint,
        },
      });

      console.log(`[Orchestrator] Stored fingerprint for analysis ${analysisId}: ${fingerprint.slice(0, 8)}...`);
    } catch (error) {
      console.error("[Orchestrator] Failed to store fingerprint:", error);
    }
  }

  /**
   * Run basic analysis types (screening, extraction, full_dd)
   */
  private async runBaseAnalysis(
    deal: DealWithDocs,
    dealId: string,
    type: AnalysisType,
    onProgress: AnalysisOptions["onProgress"],
    onEarlyWarning: AnalysisOptions["onEarlyWarning"],
    startTime: number,
    analysisModeOverride?: string
  ): Promise<AnalysisResult> {
    const config = ANALYSIS_CONFIGS[type];
    const collectedWarnings: EarlyWarning[] = [];
    const initialFactStore = await getCurrentFacts(dealId).catch(() => []);

    const corpusSnapshot = await this.materializeAnalysisCorpusSnapshot(dealId, deal.documents, {
      allowSupersededDocuments: analysisModeOverride === "post_call_reanalysis",
    });
    const scopedDocuments = scopeDocumentsToSnapshot(
      deal.documents,
      corpusSnapshot?.documentIds ?? null
    );

    // Get document IDs for versioning
    const documentIds = corpusSnapshot?.documentIds ?? (deal.documents as Array<{ id: string; processingStatus?: string }>)
      .filter((d) => d.processingStatus === "COMPLETED")
      .map((d) => d.id);

    // Create analysis record
    const analysis = await createAnalysis({
      dealId,
      type,
      totalAgents: config.agents.length,
      mode: analysisModeOverride ?? type,
      documentIds,
      corpusSnapshotId: corpusSnapshot?.id,
      extractionRunIds: corpusSnapshot?.extractionRunIds,
    });

    // Set analysis context for LLM logging
    setAnalysisContext(analysis.id);

    // Build context
    const canonicalDeal = buildCanonicalRuntimeDeal(deal, {
      factStore: initialFactStore,
    });
    const { evidenceContext, evidenceToday } = await loadEvidenceContextSafe(dealId);

    const context: AgentContext = {
      dealId,
      deal: canonicalDeal,
      canonicalDeal,
      analysis: {
        id: analysis.id,
        thesisBypass: false,
        corpusSnapshotId: corpusSnapshot?.id ?? null,
      },
      documents: scopedDocuments,
      evidenceContext,
      evidenceToday,
      previousResults: {},
    };

    // Run agents in sequence
    const results: Record<string, AgentResult> = {};
    let totalCost = 0;

    for (let i = 0; i < config.agents.length; i++) {
      const agentName = config.agents[i];
      const agent = BASE_AGENTS[agentName];

      onProgress?.({
        currentAgent: agentName,
        completedAgents: i,
        totalAgents: config.agents.length,
      });

      try {
        const result = await agent.run(context);
        results[agentName] = result;
        totalCost += result.cost;
        context.previousResults![agentName] = result;

        await updateAnalysisProgress(analysis.id, i + 1, totalCost);
        await processAgentResult(dealId, agentName, result);

        // Check for early warnings
        this.checkAndEmitWarnings(agentName, result, collectedWarnings, onEarlyWarning);

        onProgress?.({
          currentAgent: agentName,
          completedAgents: i + 1,
          totalAgents: config.agents.length,
          latestResult: result,
        });
      } catch (error) {
        results[agentName] = {
          agentName,
          success: false,
          executionTimeMs: 0,
          cost: 0,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }

    // Finalize
    const summary = generateSummary(results, type);
    const totalTimeMs = Date.now() - startTime;
    const allSuccess = Object.values(results).every((r) => r.success);

    await completeAnalysis({
      analysisId: analysis.id,
      success: allSuccess,
      totalCost,
      totalTimeMs,
      summary,
      results,
      mode: analysisModeOverride ?? type,
    });

    const baseResult: AnalysisResult = {
      sessionId: analysis.id,
      dealId,
      type,
      success: allSuccess,
      results,
      totalCost,
      totalTimeMs,
      summary,
    };

    return this.addWarningsToResult(baseResult, collectedWarnings);
  }

  /**
   * Run Tier 1 analysis with parallel execution
   */
  private async runTier1Analysis(
    deal: DealWithDocs,
    dealId: string,
    onProgress: AnalysisOptions["onProgress"],
    advancedOptions: AdvancedAnalysisOptions
  ): Promise<AnalysisResult> {
    const { onEarlyWarning, isUpdate = false, analysisModeOverride } = advancedOptions;
    const startTime = Date.now();
    const TIER1_AGENT_COUNT = TIER1_AGENT_NAMES.length;
    const collectedWarnings: EarlyWarning[] = [];

    const corpusSnapshot = await this.materializeAnalysisCorpusSnapshot(dealId, deal.documents, {
      allowSupersededDocuments: analysisModeOverride === "post_call_reanalysis",
    });
    const scopedDocuments = scopeDocumentsToSnapshot(
      deal.documents,
      corpusSnapshot?.documentIds ?? null
    );

    // Get document IDs for versioning
    const documentIds = corpusSnapshot?.documentIds ?? (deal.documents as Array<{ id: string; processingStatus?: string }>)
      .filter((d) => d.processingStatus === "COMPLETED")
      .map((d) => d.id);

    const analysis = await createAnalysis({
      dealId,
      type: "tier1_complete",
      totalAgents: TIER1_AGENT_COUNT + 2, // +1 extractor +1 fact-extractor
      mode: analysisModeOverride ?? "tier1_complete",
      documentIds,
      corpusSnapshotId: corpusSnapshot?.id,
      extractionRunIds: corpusSnapshot?.extractionRunIds,
    });

    // Set analysis context for LLM logging
    setAnalysisContext(analysis.id);

    const results: Record<string, AgentResult> = {};
    let totalCost = 0;
    const initialFactStore = await getCurrentFacts(dealId).catch(() => []);

    // Build base context
    const canonicalDeal = buildCanonicalRuntimeDeal(deal, {
      factStore: initialFactStore,
    });
    const { evidenceContext, evidenceToday } = await loadEvidenceContextSafe(dealId);
    const baseContext: AgentContext = {
      dealId,
      deal: canonicalDeal,
      canonicalDeal,
      analysis: {
        id: analysis.id,
        thesisBypass: false,
        corpusSnapshotId: corpusSnapshot?.id ?? null,
      },
      documents: scopedDocuments,
      evidenceContext,
      evidenceToday,
      previousResults: {},
    };

    // STEP 0: Run Tier 0 Fact Extraction (BEFORE document-extractor)
    // This extracts structured facts that will be available to all agents
    let factStore: CurrentFact[] = [];
    let factStoreFormatted = "";
    let founderResponses: Array<{ questionId: string; question: string; answer: string; category: string }> = [];

    if (scopedDocuments.length > 0) {
      const tier0Result = await this.runTier0FactExtraction(
        { ...deal, documents: scopedDocuments },
        isUpdate,
        onProgress
      );
      factStore = tier0Result.factStore;
      factStoreFormatted = tier0Result.factStoreFormatted;
      founderResponses = tier0Result.founderResponses;
      totalCost += tier0Result.cost;

      if (tier0Result.extractionResult) {
        results["fact-extractor"] = {
          agentName: "fact-extractor",
          success: true,
          executionTimeMs: tier0Result.executionTimeMs,
          cost: tier0Result.cost,
          data: tier0Result.extractionResult,
        } as AgentResult & { data: FactExtractorOutput };
      }

      console.log(`[Orchestrator] Tier 0 complete: ${factStore.length} facts in store`);
    }

    // STEP 1: Run document-extractor first (if documents exist)
    // Extract data needed for Context Engine (tagline, competitors, founders)
    let extractedData: ContextSeed = {};

    if (scopedDocuments.length > 0) {
      onProgress?.({
        currentAgent: "document-extractor",
        completedAgents: 0,
        totalAgents: TIER1_AGENT_COUNT + 1,
      });

      try {
        const extractorResult = await BASE_AGENTS["document-extractor"].run(baseContext);
        results["document-extractor"] = extractorResult;
        totalCost += extractorResult.cost;
        baseContext.previousResults!["document-extractor"] = extractorResult;

        await updateAnalysisProgress(analysis.id, 1, totalCost);

        // Extract data for Context Engine
        if (extractorResult.success) {
          extractedData = this.extractContextSeed(extractorResult);
          console.log(`[Orchestrator] tier1_complete: Extracted data for Context Engine: tagline=${!!extractedData.tagline}, product=${!!extractedData.productName}, useCases=${extractedData.useCases?.length ?? 0}, competitors=${extractedData.competitors?.length ?? 0}`);
        }

        // Check for early warnings from extractor
        this.checkAndEmitWarnings("document-extractor", extractorResult, collectedWarnings, onEarlyWarning);

        onProgress?.({
          currentAgent: "document-extractor",
          completedAgents: 1,
          totalAgents: TIER1_AGENT_COUNT + 1,
          latestResult: extractorResult,
        });
      } catch (error) {
        results["document-extractor"] = {
          agentName: "document-extractor",
          success: false,
          executionTimeMs: 0,
          cost: 0,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }

    // STEP 1.5: Run Deck Coherence Check (Tier 0.5)
    // Verifies data consistency before Tier 1 agents analyze
    let deckCoherenceReport: DeckCoherenceReport | null = null;
    if (scopedDocuments.length > 0 && results["document-extractor"]?.success) {
      const coherenceResult = await this.runDeckCoherenceCheck(
        { ...deal, documents: scopedDocuments },
        extractedData as Record<string, unknown> | undefined,
        onProgress
      );
      deckCoherenceReport = coherenceResult.report;
      totalCost += coherenceResult.cost;

      if (deckCoherenceReport) {
        results["deck-coherence-checker"] = {
          agentName: "deck-coherence-checker",
          success: true,
          executionTimeMs: coherenceResult.executionTimeMs,
          cost: coherenceResult.cost,
          data: deckCoherenceReport,
        } as AgentResult & { data: DeckCoherenceReport };
      }

      console.log(`[Orchestrator] Coherence check complete: grade=${deckCoherenceReport?.reliabilityGrade ?? 'N/A'}`);
    }

    // STEP 2: Enrich with Context Engine (using extracted data)
    const contextEngineData = await this.enrichContext(deal, extractedData, factStore);
    const mergedContextFacts = await this.mergeContextEngineFacts(
      dealId,
      contextEngineData,
      factStore,
      corpusSnapshot?.id ?? null
    );
    factStore = mergedContextFacts.factStore;
    factStoreFormatted = mergedContextFacts.factStoreFormatted;

    // Build enriched context for Tier 1 agents with Fact Store
    // SECURITY: Replace PROJECTED/UNVERIFIABLE facts with placeholders
    // to prevent scoring agents from treating projections as facts
    const filteredFactStore = replaceUnreliableWithPlaceholders(factStore);
    const filteredFactStoreFormatted = factStore.length > 0
      ? formatFactsForScoringAgents(factStore)
      : factStoreFormatted;

    // Load questions from previous analysis for cross-run persistence
    const prevQuestions = await loadPreviousAnalysisQuestions(dealId);
    const previousAnalysisQuestions = prevQuestions.questions.map((q) => ({
      ...q,
      answered: prevQuestions.answeredQuestionTexts.some(
        (a) => a.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40) ===
          q.question.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40)
      ),
    }));
    if (previousAnalysisQuestions.length > 0) {
      console.log(`[Orchestrator:Tier1] Loaded ${previousAnalysisQuestions.length} previous questions (${previousAnalysisQuestions.filter(q => !q.answered).length} unanswered)`);
    }

    const enrichedContext: EnrichedAgentContext = attachEvidenceLedger({
      ...baseContext,
      contextEngine: contextEngineData,
      factStore: filteredFactStore,
      factStoreFormatted: filteredFactStoreFormatted,
      extractedData: this.toExtractedContextData(extractedData),
      analysis: {
        id: analysis.id,
        thesisBypass: false,
        corpusSnapshotId: corpusSnapshot?.id ?? null,
      },
      deckCoherenceReport: deckCoherenceReport ?? undefined,
      founderResponses: founderResponses.length > 0 ? founderResponses : undefined,
      previousAnalysisQuestions: previousAnalysisQuestions.length > 0 ? previousAnalysisQuestions : undefined,
    });

    // STEP 3: Run Tier 1 agents in 4 sequential phases (A→B→C→D)
    const tier1AgentMap = await getTier1Agents();
    let completedCount = scopedDocuments.length > 0 ? 1 : 0;

    const phasesResult = await this.runTier1Phases({
      enrichedContext,
      tier1AgentMap,
      analysisId: analysis.id,
      dealId,
      onProgress,
      totalAgents: TIER1_AGENT_COUNT + 2,
      onEarlyWarning,
      collectedWarnings,
      allResults: results,
      initialTotalCost: totalCost,
      initialCompletedCount: completedCount,
      factStore,
      factStoreFormatted,
      extractedData,
    });

    totalCost += phasesResult.costIncurred;
    completedCount += phasesResult.completedInPhases;

    // Global consensus across all phases
    const verificationContext = await this.buildVerificationContext(
      enrichedContext,
      extractedData ?? {},
      phasesResult.updatedFactStoreFormatted,
      enrichedContext.deal,
    );
    if (phasesResult.allFindings.length > 1) {
      const consensusStats = await this.runConsensusDebate(analysis.id, phasesResult.allFindings, verificationContext, enrichedContext);
      totalCost += consensusStats.totalTokens * 0.00001;
    }

    // Finalize
    const summary = generateTier1Summary(results);
    const totalTimeMs = Date.now() - startTime;
    const allSuccess = Object.values(results).every((r) => r.success);

    await completeAnalysis({
      analysisId: analysis.id,
      success: allSuccess,
      totalCost,
      totalTimeMs,
      summary,
      results,
      mode: analysisModeOverride ?? "tier1_complete",
    });

    await updateDealStatus(dealId, "IN_DD");

    const baseResult: AnalysisResult = {
      sessionId: analysis.id,
      dealId,
      type: "tier1_complete",
      success: allSuccess,
      results,
      totalCost,
      totalTimeMs,
      summary,
    };

    return this.addWarningsToResult(baseResult, collectedWarnings);
  }

  /**
   * Run Tier 3 synthesis (requires Tier 1 results in previousResults)
   *
   * OPTIMIZED: Uses dependency graph for parallel execution
   * - Batch 1 (parallel): contradiction-detector, devils-advocate
   * - Batch 2 (sequential): synthesis-deal-scorer (needs batch 1)
   * - Batch 3 (sequential): memo-generator (needs all)
   */
  private async runTier3Synthesis(
    deal: DealWithDocs,
    dealId: string,
    onProgress: AnalysisOptions["onProgress"],
    onEarlyWarning?: OnEarlyWarning,
    tier1Results?: Record<string, AgentResult>,
    maxCostUsd?: number,
    analysisModeOverride?: string
  ): Promise<AnalysisResult> {
    const startTime = Date.now();
    const TIER3_AGENT_COUNT = TIER3_AGENT_NAMES.length;
    const collectedWarnings: EarlyWarning[] = [];
    const currentFacts = await getCurrentFacts(dealId).catch(() => []);

    const corpusSnapshot = await this.materializeAnalysisCorpusSnapshot(dealId, deal.documents, {
      allowSupersededDocuments: analysisModeOverride === "post_call_reanalysis",
    });
    const scopedDocuments = scopeDocumentsToSnapshot(
      deal.documents,
      corpusSnapshot?.documentIds ?? null
    );

    // Get document IDs for versioning
    const documentIds = corpusSnapshot?.documentIds ?? (deal.documents as Array<{ id: string; processingStatus?: string }>)
      .filter((d) => d.processingStatus === "COMPLETED")
      .map((d) => d.id);

    const analysis = await createAnalysis({
      dealId,
      type: "tier3_synthesis",
      totalAgents: TIER3_AGENT_COUNT,
      mode: analysisModeOverride ?? "tier3_synthesis",
      documentIds,
      corpusSnapshotId: corpusSnapshot?.id,
      extractionRunIds: corpusSnapshot?.extractionRunIds,
    });

    // Set analysis context for LLM logging
    setAnalysisContext(analysis.id);

    const results: Record<string, AgentResult> = {};
    let totalCost = 0;

    // Load BA preferences for Tier 3 personalization
    const baPreferences = await this.loadBAPreferences(deal.userId);

    // Load founder responses for Tier 3 context (chronology awareness)
    const founderResponseFacts = await prisma.factEvent.findMany({
      where: {
        dealId,
        source: "FOUNDER_RESPONSE",
        eventType: { notIn: ["DELETED", "SUPERSEDED"] },
      },
      orderBy: { createdAt: "desc" },
    });
    const founderResponses = founderResponseFacts.map(fact => ({
      questionId: fact.id,
      question: fact.reason || "Question non specifiee",
      answer: fact.displayValue,
      category: fact.category,
    }));

    // Load DealTerms + DealStructure for conditions-analyst
    const [rawDealTerms, rawDealStructure] = await Promise.all([
      prisma.dealTerms.findUnique({ where: { dealId } }),
      prisma.dealStructure.findUnique({
        where: { dealId },
        include: { tranches: { orderBy: { orderIndex: "asc" } } },
      }),
    ]);
    const extractedData = this.extractContextSeedFromResults(tier1Results);
    const dealTerms = rawDealTerms ? {
      valuationPre: rawDealTerms.valuationPre != null ? Number(rawDealTerms.valuationPre) : null,
      amountRaised: rawDealTerms.amountRaised != null ? Number(rawDealTerms.amountRaised) : null,
      dilutionPct: rawDealTerms.dilutionPct != null ? Number(rawDealTerms.dilutionPct) : null,
      instrumentType: rawDealTerms.instrumentType,
      instrumentDetails: rawDealTerms.instrumentDetails,
      liquidationPref: rawDealTerms.liquidationPref,
      antiDilution: rawDealTerms.antiDilution,
      proRataRights: rawDealTerms.proRataRights,
      informationRights: rawDealTerms.informationRights,
      boardSeat: rawDealTerms.boardSeat,
      founderVesting: rawDealTerms.founderVesting,
      vestingDurationMonths: rawDealTerms.vestingDurationMonths,
      vestingCliffMonths: rawDealTerms.vestingCliffMonths,
      esopPct: rawDealTerms.esopPct != null ? Number(rawDealTerms.esopPct) : null,
      dragAlong: rawDealTerms.dragAlong,
      tagAlong: rawDealTerms.tagAlong,
      ratchet: rawDealTerms.ratchet,
      payToPlay: rawDealTerms.payToPlay,
      milestoneTranches: rawDealTerms.milestoneTranches,
      nonCompete: rawDealTerms.nonCompete,
      customConditions: rawDealTerms.customConditions,
      notes: rawDealTerms.notes,
    } : null;

    const canonicalDeal = buildCanonicalRuntimeDeal(deal, {
      factStore: currentFacts,
      previousResults: tier1Results,
      extractedData: this.toExtractedContextData(extractedData),
    });
    const context: EnrichedAgentContext = attachEvidenceLedger({
      dealId,
      deal: canonicalDeal,
      canonicalDeal,
      documents: scopedDocuments,
      previousResults: tier1Results ?? {},
      extractedData: this.toExtractedContextData(extractedData),
      analysis: {
        id: analysis.id,
        thesisBypass: false,
        corpusSnapshotId: corpusSnapshot?.id ?? null,
      },
      baPreferences, // Only passed to Tier 3 agents
      factStore: currentFacts,
      factStoreFormatted: formatFactStoreForAgents(currentFacts),
      founderResponses: founderResponses.length > 0 ? founderResponses : undefined,
      dealTerms,
      conditionsAnalystMode: "pipeline",
    });

    // Inject structured deal data for conditions-analyst (multi-tranche mode)
    if (rawDealStructure?.mode === "STRUCTURED" && rawDealStructure.tranches.length > 0) {
      context.dealStructure = {
        mode: "STRUCTURED",
        totalInvestment: rawDealStructure.tranches.reduce(
          (s, t) => s + (t.amount != null ? Number(t.amount) : 0), 0
        ),
        tranches: rawDealStructure.tranches.map(t => ({
          label: t.label || "Tranche",
          trancheType: t.trancheType,
          amount: t.amount != null ? Number(t.amount) : null,
          valuationPre: t.valuationPre != null ? Number(t.valuationPre) : null,
          equityPct: t.equityPct != null ? Number(t.equityPct) : null,
          triggerType: t.triggerType,
          triggerDetails: t.triggerDetails,
          status: t.status,
        })),
      };
    }

    const tier3AgentMap = await getTier3Agents();
    let completedCount = 0;

    // Execute in batches based on dependency graph
    for (const batch of TIER3_EXECUTION_BATCHES) {
      // COST CHECK: Before each batch, check if we've exceeded limit
      if (maxCostUsd && totalCost >= maxCostUsd) {
        console.log(`[Tier3] Cost limit reached ($${totalCost.toFixed(2)} >= $${maxCostUsd}), stopping`);
        break;
      }

      if (batch.length === 1) {
        // Single agent - run directly
        const agentName = batch[0];
        const agent = tier3AgentMap[agentName];

        onProgress?.({
          currentAgent: agentName,
          completedAgents: completedCount,
          totalAgents: TIER3_AGENT_COUNT,
          estimatedCostSoFar: totalCost,
        });

        try {
          const result = await agent.run(context);
          results[agentName] = result;
          totalCost += result.cost;
          completedCount++;
          context.previousResults![agentName] = result;

          await updateAnalysisProgress(analysis.id, completedCount, totalCost);
          await processAgentResult(dealId, agentName, result);
          this.checkAndEmitWarnings(agentName, result, collectedWarnings, onEarlyWarning);

          onProgress?.({
            currentAgent: agentName,
            completedAgents: completedCount,
            totalAgents: TIER3_AGENT_COUNT,
            latestResult: result,
            estimatedCostSoFar: totalCost,
          });
        } catch (error) {
          results[agentName] = {
            agentName,
            success: false,
            executionTimeMs: 0,
            cost: 0,
            error: error instanceof Error ? error.message : "Unknown error",
          };
          completedCount++;
        }
      } else {
        // Multiple agents - run in PARALLEL
        onProgress?.({
          currentAgent: `tier3-parallel (${batch.join(", ")})`,
          completedAgents: completedCount,
          totalAgents: TIER3_AGENT_COUNT,
          estimatedCostSoFar: totalCost,
        });

        const batchResults = await Promise.all(
          batch.map(async (agentName) => {
            const agent = tier3AgentMap[agentName];
            try {
              const result = await agent.run(context);
              return { agentName, result };
            } catch (error) {
              return {
                agentName,
                result: {
                  agentName,
                  success: false,
                  executionTimeMs: 0,
                  cost: 0,
                  error: error instanceof Error ? error.message : "Unknown error",
                } as AgentResult,
              };
            }
          })
        );

        // Collect batch results
        for (const { agentName, result } of batchResults) {
          results[agentName] = result;
          totalCost += result.cost;
          completedCount++;
          context.previousResults![agentName] = result;

          await processAgentResult(dealId, agentName, result);
          this.checkAndEmitWarnings(agentName, result, collectedWarnings, onEarlyWarning);
        }

        await updateAnalysisProgress(analysis.id, completedCount, totalCost);

        onProgress?.({
          currentAgent: `tier3-parallel (${batch.join(", ")})`,
          completedAgents: completedCount,
          totalAgents: TIER3_AGENT_COUNT,
          estimatedCostSoFar: totalCost,
        });
      }

      // Tier 3 coherence check retiré : il ajustait scenario-modeler
      // (probabilités, multiples, IRR). L'agent est retiré du pipeline
      // (doctrine anti-oraculaire : pas de projection chiffrée de retour),
      // donc le check n'a plus d'objet.
    }

    const summary = generateTier3Summary(results);
    const totalTimeMs = Date.now() - startTime;
    const allSuccess = Object.values(results).every((r) => r.success);

    await completeAnalysis({
      analysisId: analysis.id,
      success: allSuccess,
      totalCost,
      totalTimeMs,
      summary,
      results,
      mode: analysisModeOverride ?? "tier3_synthesis",
    });

    const baseResult: AnalysisResult = {
      sessionId: analysis.id,
      dealId,
      type: "tier3_synthesis",
      success: allSuccess,
      results,
      totalCost,
      totalTimeMs,
      summary,
    };

    return this.addWarningsToResult(baseResult, collectedWarnings);
  }

  /**
   * Run Tier 2 sector analysis
   */
  private async runTier2SectorAnalysis(
    deal: DealWithDocs,
    dealId: string,
    onProgress: AnalysisOptions["onProgress"],
    previousResults?: Record<string, AgentResult>,
    analysisModeOverride?: string
  ): Promise<AnalysisResult> {
    const startTime = Date.now();
    const initialFactStore = await getCurrentFacts(dealId).catch(() => []);
    const initialCanonicalDeal = buildCanonicalRuntimeDeal(deal, {
      factStore: initialFactStore,
      previousResults,
    });

    const sectorExpert = await getTier2SectorExpert(initialCanonicalDeal.sector);

    if (!sectorExpert) {
      return {
        sessionId: "",
        dealId,
        type: "tier2_sector",
        success: true,
        results: {},
        totalCost: 0,
        totalTimeMs: Date.now() - startTime,
        summary: `No sector expert available for sector: ${initialCanonicalDeal.sector ?? "unknown"}`,
      };
    }

    const corpusSnapshot = await this.materializeAnalysisCorpusSnapshot(dealId, deal.documents, {
      allowSupersededDocuments: analysisModeOverride === "post_call_reanalysis",
    });
    const scopedDocuments = scopeDocumentsToSnapshot(
      deal.documents,
      corpusSnapshot?.documentIds ?? null
    );

    // Get document IDs for versioning
    const documentIds = corpusSnapshot?.documentIds ?? (deal.documents as Array<{ id: string; processingStatus?: string }>)
      .filter((d) => d.processingStatus === "COMPLETED")
      .map((d) => d.id);

    const analysis = await createAnalysis({
      dealId,
      type: "tier2_sector",
      totalAgents: 1,
      mode: analysisModeOverride ?? "tier2_sector",
      documentIds,
      corpusSnapshotId: corpusSnapshot?.id,
      extractionRunIds: corpusSnapshot?.extractionRunIds,
    });

    // Set analysis context for LLM logging
    setAnalysisContext(analysis.id);

    const results: Record<string, AgentResult> = {};
    let totalCost = 0;

    // Extract data from previous document-extractor result (from Tier 1)
    let extractedData: ContextSeed = {};

    const extractorResult = previousResults?.["document-extractor"];
    if (extractorResult?.success) {
      extractedData = this.extractContextSeed(extractorResult);
    }

    const contextEngineData = await this.enrichContext(
      deal,
      extractedData,
      initialFactStore,
    );
    const mergedContextFacts = await this.mergeContextEngineFacts(
      dealId,
      contextEngineData,
      [],
      corpusSnapshot?.id ?? null
    );

    // Load founder responses for Tier 2 context
    const founderResponseFacts = await prisma.factEvent.findMany({
      where: {
        dealId,
        source: "FOUNDER_RESPONSE",
        eventType: { notIn: ["DELETED", "SUPERSEDED"] },
      },
      orderBy: { createdAt: "desc" },
    });
    const founderResponses = founderResponseFacts.map(fact => ({
      questionId: fact.id,
      question: fact.reason || "Question non specifiee",
      answer: fact.displayValue,
      category: fact.category,
    }));

    const canonicalDeal = buildCanonicalRuntimeDeal(deal, {
      factStore: mergedContextFacts.factStore,
      previousResults,
      extractedData: this.toExtractedContextData(extractedData),
    });
    const context: EnrichedAgentContext = attachEvidenceLedger({
      dealId,
      deal: canonicalDeal,
      canonicalDeal,
      analysis: {
        id: analysis.id,
        thesisBypass: false,
        corpusSnapshotId: corpusSnapshot?.id ?? null,
      },
      documents: scopedDocuments,
      previousResults: previousResults ?? {},
      contextEngine: contextEngineData,
      factStore: mergedContextFacts.factStore,
      factStoreFormatted: mergedContextFacts.factStoreFormatted,
      founderResponses: founderResponses.length > 0 ? founderResponses : undefined,
    });

    onProgress?.({
      currentAgent: sectorExpert.name,
      completedAgents: 0,
      totalAgents: 1,
    });

    try {
      const result = await sectorExpert.run(context);
      results[sectorExpert.name] = result;
      totalCost = result.cost;

      await processAgentResult(dealId, sectorExpert.name, result);

      onProgress?.({
        currentAgent: sectorExpert.name,
        completedAgents: 1,
        totalAgents: 1,
        latestResult: result,
      });
    } catch (error) {
      results[sectorExpert.name] = {
        agentName: sectorExpert.name,
        success: false,
        executionTimeMs: 0,
        cost: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }

    const totalTimeMs = Date.now() - startTime;
    const allSuccess = Object.values(results).every((r) => r.success);

    await completeAnalysis({
      analysisId: analysis.id,
      success: allSuccess,
      totalCost,
      totalTimeMs,
      summary: `Sector analysis by ${sectorExpert.name} completed`,
      results,
    });

    return {
      sessionId: analysis.id,
      dealId,
      type: "tier2_sector",
      success: allSuccess,
      results,
      totalCost,
      totalTimeMs,
      summary: `Sector analysis by ${sectorExpert.name} completed`,
    };
  }

  /**
   * Run full analysis: Tier 1 + Tier 2 + Tier 3 with full orchestration layer
   *
   * Includes consensus debates and reflexion engines for quality assurance.
   */
  /**
   * C.1 — Bootstrap de full_analysis extrait BYTE-INERT de runFullAnalysis (avant le try).
   * Crée l'Analysis, le corpus snapshot, le costMonitor, la stateMachine (+onStateChange),
   * setAnalysisContext, messageBus.clear ; renvoie tous les locals consommés ensuite.
   * NE contient PAS stateMachine.start()/loadEvidenceContextSafe/baseContext/STEP 0
   * (restent dans le try de runFullAnalysis — frontière try/catch inchangée).
   */
  private async initializeFullAnalysisRun(
    deal: DealWithDocs,
    dealId: string,
    advancedOptions: AdvancedAnalysisOptions
  ): Promise<FullAnalysisRunInit> {
    const {
      failFastOnCritical,
      maxCostUsd,
      onEarlyWarning,
      isUpdate = false,
      enableTrace = true,
      stopAfterThesis = false,
      stepwise = false,
      dispatchEventId,
      analysisModeOverride,
    } = advancedOptions;
    const startTime = Date.now();
    const collectedWarnings: EarlyWarning[] = [];

    // Crédits-only : tout user a accès au pipeline complet. Le gating se fait
    // exclusivement via les crédits côté API route, pas ici.
    const initialFactStore = await getCurrentFacts(dealId).catch(() => []);
    const initialCanonicalDeal = buildCanonicalRuntimeDeal(deal, {
      factStore: initialFactStore,
    });

    const sectorExpert = await getTier2SectorExpert(initialCanonicalDeal.sector);
    const hasSectorExpert = sectorExpert !== null;

    // Pipeline complet : Tier 1 (12 agents) + Tier 3 (5 agents en autonomous,
    // +1 thesis-reconciler en full_analysis) + document-extractor + fact-extractor
    // + thesis-extractor (SAUF post_call_reanalysis qui réutilise la thèse canonique)
    // + (0-1 sector expert).
    // thesis-extractor (Tier 0.5) tourne et est compté dans completedCount par
    // runThesisExtractionStep (`completedCount++` sur succès) hors post_call_reanalysis
    // (`shouldReuseLatestThesis`). Il manquait à ce total → completedCount pouvait dépasser
    // TOTAL_AGENTS d'1 (affichage X+1/X sur le chemin non-stepwise ; rejet buildStepState
    // `completedCount > totalAgents` au snapshot tier3-post sur le chemin durable v3, d-6).
    const tier3AgentCount = FULL_ANALYSIS_TIER3_AGENT_NAMES.length;
    const runsThesisExtractor = analysisModeOverride !== "post_call_reanalysis";
    const TOTAL_AGENTS =
      TIER1_AGENT_NAMES.length + tier3AgentCount + 1 + 1 + (runsThesisExtractor ? 1 : 0) + (hasSectorExpert ? 1 : 0);

    const corpusSnapshot = await this.materializeAnalysisCorpusSnapshot(dealId, deal.documents, {
      allowSupersededDocuments: analysisModeOverride === "post_call_reanalysis",
    });
    const scopedDocuments = scopeDocumentsToSnapshot(
      deal.documents,
      corpusSnapshot?.documentIds ?? null
    );

    // Get document IDs for versioning
    const documentIds = corpusSnapshot?.documentIds ?? (deal.documents as Array<{ id: string; processingStatus?: string }>)
      .filter((d) => d.processingStatus === "COMPLETED")
      .map((d) => d.id);

    const analysis = await createAnalysis({
      dealId,
      type: "full_analysis",
      totalAgents: TOTAL_AGENTS,
      mode: analysisModeOverride ?? "full_analysis",
      documentIds,
      corpusSnapshotId: corpusSnapshot?.id,
      extractionRunIds: corpusSnapshot?.extractionRunIds,
      // D.5d-1d — idempotence init durable : en stepwise le bootstrap re-tourne au replay
      // Inngest ; get-or-create par dispatchEventId (D.4b) → réutilise l'Analysis RUNNING du
      // même run (analysis.id stable). null hors stepwise (OFF byte-inert : create classique).
      dispatchEventId: dispatchEventId ?? null,
    });

    // Set analysis context for LLM logging
    setAnalysisContext(analysis.id);

    // Initialize cost monitoring
    costMonitor.startAnalysis({
      analysisId: analysis.id,
      dealId,
      userId: deal.userId,
      type: "full_analysis",
    });

    // Initialize State Machine
    const stateMachine = new AnalysisStateMachine({
      analysisId: analysis.id,
      dealId,
      mode: "full_analysis",
      agents: ["document-extractor", ...TIER1_AGENT_NAMES, ...FULL_ANALYSIS_TIER3_AGENT_NAMES],
      // D.5a — en mode stepwise la state machine n'émet AUCUN checkpoint (ni périodique,
      // ni par transition, ni au flush) : c'est l'invariant « zéro checkpoint legacy en
      // stepwise ». OFF (défaut) → !false = true = comportement actuel exact.
      enableCheckpointing: !stepwise,
    });

    stateMachine.onStateChange(async (from, to, trigger) => {
      console.log(`[StateMachine] ${from} → ${to} (${trigger})`);
      await persistStateTransition(analysis.id, from, to, trigger);
    });

    messageBus.clear();

    const allResults: Record<string, AgentResult> = {};
    const totalCost = 0;
    const completedCount = 0;

    // Variables for fact store (will be populated in Tier 0)
    const factStore: CurrentFact[] = [];
    const factStoreFormatted = "";
    const founderResponses: Array<{ questionId: string; question: string; answer: string; category: string }> = [];

    return {
      failFastOnCritical,
      maxCostUsd,
      onEarlyWarning,
      isUpdate,
      enableTrace,
      stopAfterThesis,
      analysisModeOverride,
      startTime,
      collectedWarnings,
      initialCanonicalDeal,
      sectorExpert,
      TOTAL_AGENTS,
      corpusSnapshot,
      scopedDocuments,
      analysis,
      stateMachine,
      allResults,
      totalCost,
      completedCount,
      factStore,
      factStoreFormatted,
      founderResponses,
      stepwise,
    };
  }

  /**
   * C.1b — Construit le baseContext de full_analysis (evidence + AgentContext de base).
   * Extrait de runFullAnalysis ; appelé DANS le try, APRÈS stateMachine.start() et
   * AVANT STEP 0. loadEvidenceContextSafe est best-effort (déjà tolérant). Byte-inert.
   */
  private async buildBaseAnalysisContext(params: {
    dealId: string;
    initialCanonicalDeal: ReturnType<typeof buildCanonicalRuntimeDeal>;
    analysis: Awaited<ReturnType<typeof createAnalysis>>;
    analysisModeOverride: AdvancedAnalysisOptions["analysisModeOverride"];
    corpusSnapshot: Awaited<ReturnType<AgentOrchestrator["materializeAnalysisCorpusSnapshot"]>>;
    scopedDocuments: DealWithDocs["documents"];
  }): Promise<AgentContext> {
    const { dealId, initialCanonicalDeal, analysis, analysisModeOverride, corpusSnapshot, scopedDocuments } = params;
    // Phase 5.1 (Codex round 15 P1) — wire evidence into full_analysis path.
    const { evidenceContext: fullEvidenceContext, evidenceToday: fullEvidenceToday } =
      await loadEvidenceContextSafe(dealId);
    const baseContext: AgentContext = {
      dealId,
      deal: initialCanonicalDeal,
      canonicalDeal: initialCanonicalDeal,
      analysis: {
        id: analysis.id,
        mode: analysis.mode ?? analysisModeOverride ?? "full_analysis",
        thesisBypass: false,
        thesisId: null,
        corpusSnapshotId: corpusSnapshot?.id ?? null,
      },
      documents: scopedDocuments,
      evidenceContext: fullEvidenceContext,
      evidenceToday: fullEvidenceToday,
      previousResults: {},
    };

    return baseContext;
  }

  /**
   * C.2a — STEP 0 Tier 0 fact extraction, extrait BYTE-INERT de runFullAnalysis.
   * Mute allResults["fact-extractor"] PAR RÉFÉRENCE (allResults passé en param) et
   * renvoie les let mutés. N'extrait QUE STEP 0 (pas document-extractor/deck/context/thesis).
   * Ordre et mutations strictement identiques à l'inline d'origine.
   */
  private async runTier0Step(params: {
    deal: DealWithDocs;
    scopedDocuments: DealWithDocs["documents"];
    isUpdate: boolean;
    onProgress: AnalysisOptions["onProgress"];
    allResults: Record<string, AgentResult>;
    totalCost: number;
    completedCount: number;
    factStore: CurrentFact[];
    factStoreFormatted: string;
    founderResponses: Array<{ questionId: string; question: string; answer: string; category: string }>;
    analysisId: string;
  }): Promise<{
    totalCost: number;
    completedCount: number;
    factStore: CurrentFact[];
    factStoreFormatted: string;
    founderResponses: Array<{ questionId: string; question: string; answer: string; category: string }>;
  }> {
    const { deal, scopedDocuments, isUpdate, onProgress, allResults, analysisId } = params;
    let { totalCost, completedCount, factStore, factStoreFormatted, founderResponses } = params;
    if (scopedDocuments.length > 0) {
      const tier0Result = await this.runTier0FactExtraction(
        { ...deal, documents: scopedDocuments },
        isUpdate,
        onProgress,
        analysisId
      );
      factStore = tier0Result.factStore;
      factStoreFormatted = tier0Result.factStoreFormatted;
      founderResponses = tier0Result.founderResponses;
      totalCost += tier0Result.cost;
      completedCount++;

      if (tier0Result.extractionResult) {
        allResults["fact-extractor"] = {
          agentName: "fact-extractor",
          success: true,
          executionTimeMs: tier0Result.executionTimeMs,
          cost: tier0Result.cost,
          data: tier0Result.extractionResult,
        } as AgentResult & { data: FactExtractorOutput };
      }

      console.log(`[Orchestrator:FullAnalysis] Tier 0 complete: ${factStore.length} facts in store`);
    }
    return { totalCost, completedCount, factStore, factStoreFormatted, founderResponses };
  }

  /**
   * C.2b — STEP 1 document-extractor, extrait BYTE-INERT de runFullAnalysis.
   * baseContext et allResults sont mutés PAR RÉFÉRENCE (passés en param), comme l'inline
   * d'origine (baseContext.previousResults["document-extractor"], allResults[...]).
   * Renvoie les let mutés (totalCost, completedCount, extractedData). N'inclut PAS la
   * deck coherence (STEP 1.5), ni le context engine, ni la thèse.
   */
  private async runDocumentExtractorStep(params: {
    baseContext: AgentContext;
    scopedDocuments: DealWithDocs["documents"];
    onProgress: AnalysisOptions["onProgress"];
    analysis: Awaited<ReturnType<typeof createAnalysis>>;
    stateMachine: AnalysisStateMachine;
    allResults: Record<string, AgentResult>;
    totalCost: number;
    completedCount: number;
    TOTAL_AGENTS: number;
  }): Promise<{
    totalCost: number;
    completedCount: number;
    extractedData: ContextSeed;
  }> {
    const { baseContext, scopedDocuments, onProgress, analysis, stateMachine, allResults, TOTAL_AGENTS } = params;
    let { totalCost, completedCount } = params;
    // STEP 1: DOCUMENT EXTRACTION (must run first)
    // We need extracted data (tagline, competitors, founders) for Context Engine
    await stateMachine.startExtraction();

    onProgress?.({
      currentAgent: "document-extractor",
      completedAgents: completedCount,
      totalAgents: TOTAL_AGENTS,
    });

    // Extract data from documents first
    let extractedData: ContextSeed = {};

    if (scopedDocuments.length > 0) {
      try {
        const extractorResult = await BASE_AGENTS["document-extractor"].run(baseContext);
        allResults["document-extractor"] = extractorResult;
        totalCost += extractorResult.cost;
        baseContext.previousResults!["document-extractor"] = extractorResult;
        completedCount++;

        stateMachine.recordAgentComplete(
          "document-extractor",
          extractorResult as AnalysisAgentResult
        );
        await updateAnalysisProgress(analysis.id, completedCount, totalCost);

        // Extract data for Context Engine
        if (extractorResult.success) {
          extractedData = this.extractContextSeed(extractorResult);
          console.log(`[Orchestrator] Extracted data for Context Engine: tagline=${!!extractedData.tagline}, product=${!!extractedData.productName}, useCases=${extractedData.useCases?.length ?? 0}, competitors=${extractedData.competitors?.length ?? 0}, founders=${extractedData.founders?.length ?? 0}`);
        }
      } catch (error) {
        const errorResult: AgentResult = {
          agentName: "document-extractor",
          success: false,
          executionTimeMs: 0,
          cost: 0,
          error: error instanceof Error ? error.message : "Unknown error",
        };
        allResults["document-extractor"] = errorResult;
        stateMachine.recordAgentFailed("document-extractor", errorResult.error ?? "Unknown");
        completedCount++;
      }
    }
    return { totalCost, completedCount, extractedData };
  }

  /**
   * C.2c — STEP 1.5 deck coherence check, extrait BYTE-INERT de runFullAnalysis.
   * allResults muté PAR RÉFÉRENCE (param) comme l'inline (allResults["deck-coherence-checker"]).
   * Renvoie les mutés (totalCost, deckCoherenceReport). N'inclut PAS le context engine
   * (STEP 2), la thèse, ni Tier1.
   */
  private async runDeckCoherenceStep(params: {
    deal: DealWithDocs;
    scopedDocuments: DealWithDocs["documents"];
    extractedData: ContextSeed;
    onProgress: AnalysisOptions["onProgress"];
    allResults: Record<string, AgentResult>;
    totalCost: number;
  }): Promise<{
    totalCost: number;
    deckCoherenceReport: DeckCoherenceReport | null;
  }> {
    const { deal, scopedDocuments, extractedData, onProgress, allResults } = params;
    let { totalCost } = params;
    // STEP 1.5: DECK COHERENCE CHECK (Tier 0.5)
    // Verifies data consistency before Tier 1 agents analyze
    let deckCoherenceReport: DeckCoherenceReport | null = null;
    if (scopedDocuments.length > 0 && allResults["document-extractor"]?.success) {
      const coherenceResult = await this.runDeckCoherenceCheck(
        { ...deal, documents: scopedDocuments },
        extractedData as Record<string, unknown> | undefined,
        onProgress
      );
      deckCoherenceReport = coherenceResult.report;
      totalCost += coherenceResult.cost;

      if (deckCoherenceReport) {
        allResults["deck-coherence-checker"] = {
          agentName: "deck-coherence-checker",
          success: true,
          executionTimeMs: coherenceResult.executionTimeMs,
          cost: coherenceResult.cost,
          data: deckCoherenceReport,
        } as AgentResult & { data: DeckCoherenceReport };
      }

      console.log(`[Orchestrator:FullAnalysis] Coherence check complete: grade=${deckCoherenceReport?.reliabilityGrade ?? 'N/A'}`);
    }
    return { totalCost, deckCoherenceReport };
  }

  /**
   * C.2d — STEP 2 Context Engine, extrait BYTE-INERT de runFullAnalysis.
   * Enrichit le factStore (enrichContext + mergeContextEngineFacts), filtre pour Tier 1,
   * charge les questions précédentes, construit l'enrichedContext (attachEvidenceLedger).
   * Renvoie factStore/factStoreFormatted réassignés + enrichedContext. N'inclut PAS la
   * thèse (STEP 2.5) ni Tier1.
   */
  private async runContextEngineStep(params: {
    deal: DealWithDocs;
    dealId: string;
    baseContext: AgentContext;
    stateMachine: AnalysisStateMachine;
    extractedData: ContextSeed;
    analysis: Awaited<ReturnType<typeof createAnalysis>>;
    corpusSnapshot: Awaited<ReturnType<AgentOrchestrator["materializeAnalysisCorpusSnapshot"]>>;
    deckCoherenceReport: DeckCoherenceReport | null;
    founderResponses: Array<{ questionId: string; question: string; answer: string; category: string }>;
    onProgress: AnalysisOptions["onProgress"];
    completedCount: number;
    TOTAL_AGENTS: number;
    factStore: CurrentFact[];
    factStoreFormatted: string;
  }): Promise<{
    factStore: CurrentFact[];
    factStoreFormatted: string;
    enrichedContext: EnrichedAgentContext;
  }> {
    const { deal, dealId, baseContext, stateMachine, extractedData, analysis, corpusSnapshot, deckCoherenceReport, founderResponses, onProgress, completedCount, TOTAL_AGENTS } = params;
    let { factStore, factStoreFormatted } = params;
    // STEP 2: CONTEXT ENGINE (runs AFTER extraction to use extracted data)
    await stateMachine.startGathering();

    onProgress?.({
      currentAgent: "context-engine",
      completedAgents: completedCount,
      totalAgents: TOTAL_AGENTS,
    });

    const contextEngineData = await this.enrichContext(deal, extractedData, factStore);
    const mergedContextFacts = await this.mergeContextEngineFacts(
      dealId,
      contextEngineData,
      factStore,
      corpusSnapshot?.id ?? null
    );
    factStore = mergedContextFacts.factStore;
    factStoreFormatted = mergedContextFacts.factStoreFormatted;

    const filteredFactStore = replaceUnreliableWithPlaceholders(factStore);
    const filteredFactStoreFormatted = factStore.length > 0
      ? formatFactsForScoringAgents(factStore)
      : factStoreFormatted;

    // Load questions from previous analysis for cross-run persistence
    const prevQuestions = await loadPreviousAnalysisQuestions(dealId);
    const previousAnalysisQuestions = prevQuestions.questions.map((q) => ({
      ...q,
      answered: prevQuestions.answeredQuestionTexts.some(
        (a) => a.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40) ===
          q.question.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40)
      ),
    }));
    if (previousAnalysisQuestions.length > 0) {
      console.log(`[Orchestrator:FullAnalysis] Loaded ${previousAnalysisQuestions.length} previous questions (${previousAnalysisQuestions.filter(q => !q.answered).length} unanswered)`);
    }

    // Build enriched context with Fact Store for all agents
    const enrichedContext: EnrichedAgentContext = attachEvidenceLedger({
      ...baseContext,
      contextEngine: contextEngineData,
      factStore: filteredFactStore,
      factStoreFormatted: filteredFactStoreFormatted,
      extractedData: this.toExtractedContextData(extractedData),
      analysis: {
        id: analysis.id,
        thesisBypass: false,
        thesisId: null,
        corpusSnapshotId: corpusSnapshot?.id ?? null,
      },
      deckCoherenceReport: deckCoherenceReport ?? undefined,
      founderResponses: founderResponses.length > 0 ? founderResponses : undefined,
      previousAnalysisQuestions: previousAnalysisQuestions.length > 0 ? previousAnalysisQuestions : undefined,
    });
    return { factStore, factStoreFormatted, enrichedContext };
  }

  /**
   * C.2e — STEP 2.5 thesis extraction, extrait BYTE-INERT de runFullAnalysis.
   * Branche post_call_reanalysis (reuse latest thesis + rehydrate + prisma.analysis.update)
   * ou branche normale (runThesisExtraction). enrichedContext et allResults sont mutés PAR
   * RÉFÉRENCE (params), comme l'inline (enrichedContext.analysis, allResults["thesis-extractor"]).
   * Renvoie totalCost, completedCount, thesisOutput. N'inclut PAS STEP 2.6 stop-after-thesis
   * ni Tier1.
   */
  private async runThesisExtractionStep(params: {
    dealId: string;
    analysisModeOverride: AdvancedAnalysisOptions["analysisModeOverride"];
    analysis: Awaited<ReturnType<typeof createAnalysis>>;
    enrichedContext: EnrichedAgentContext;
    corpusSnapshot: Awaited<ReturnType<AgentOrchestrator["materializeAnalysisCorpusSnapshot"]>>;
    allResults: Record<string, AgentResult>;
    enableTrace: boolean;
    totalCost: number;
    completedCount: number;
  }): Promise<{
    totalCost: number;
    completedCount: number;
    thesisOutput: ThesisExtractorOutput | null;
  }> {
    const { dealId, analysisModeOverride, analysis, enrichedContext, corpusSnapshot, allResults, enableTrace } = params;
    let { totalCost, completedCount } = params;
    // STEP 2.5: THESIS EXTRACTION (Tier 0.5) — thesis-first architecture
    // Extrait la these d'investissement, la teste contre 3 frameworks (YC/Thiel/AD),
    // persiste en DB, injecte dans enrichedContext pour que Tier 1/2/3 l'utilisent.
    const shouldReuseLatestThesis = analysisModeOverride === "post_call_reanalysis";
    let thesisOutput: ThesisExtractorOutput | null = null;

    if (shouldReuseLatestThesis) {
      const latestThesis = await thesisService.getLatest(dealId);
      if (!latestThesis) {
        throw new Error("Cannot run post-call reanalysis without a canonical latest thesis");
      }

      await this.rehydrateResumeThesis(analysis.id, latestThesis.id, enrichedContext);
      enrichedContext.analysis = {
        ...(enrichedContext.analysis ?? { id: analysis.id }),
        mode: enrichedContext.analysis?.mode ?? analysis.mode ?? analysisModeOverride ?? "full_analysis",
        thesisBypass: enrichedContext.analysis?.thesisBypass ?? false,
        thesisId: latestThesis.id,
        corpusSnapshotId: enrichedContext.analysis?.corpusSnapshotId ?? corpusSnapshot?.id ?? null,
      };

      await prisma.analysis.update({
        where: { id: analysis.id },
        data: { thesisId: latestThesis.id },
      });

      console.log(
        `[Orchestrator:FullAnalysis] Reusing canonical latest thesis for post-call reanalysis ` +
        `(analysisId=${analysis.id}, thesisId=${latestThesis.id})`
      );
    } else {
      thesisOutput = await this.runThesisExtraction(
        enrichedContext,
        analysis.id,
        dealId,
        allResults,
        enableTrace,
        corpusSnapshot,
      );
      // Compter sur le SUCCÈS, pas sur le coût : un thesis-extractor réutilisé au replay
      // (Phase D) reste un agent complété → pas de divergence de completedCount vs un run sain.
      // totalCost += cost = coût CANONIQUE du 1er run (réinjecté via Thesis.extractionCost au
      // reuse) ; pas de double-charge car le reuse n'arrive que si le step n'a pas été retourné.
      const thesisAgentResult = allResults["thesis-extractor"];
      if (thesisAgentResult?.success) {
        totalCost += thesisAgentResult.cost;
        completedCount++;
      }
    }
    return { totalCost, completedCount, thesisOutput };
  }

  /**
   * C.3b — Agrégation post-Tier1 (avant FAIL-FAST), extraite BYTE-INERT de runFullAnalysis.
   * Lance runTier1Phases, rebuild verificationContext, publie les findings sur le messageBus,
   * persiste les findings tier1-aggregate + le checkpoint, log le récap Tier1.
   * allResults muté PAR RÉFÉRENCE (param) ; renvoie les locals réassignés + allFindings/
   * lowConfidenceAgents. N'inclut PAS le FAIL-FAST, le consensus global, le cost-limit,
   * la cross-validation, la consolidation red-flags, ni Tier2/Tier3.
   */
  private async runPostTier1Aggregation(params: {
    stepwise: boolean;
    enrichedContext: EnrichedAgentContext;
    analysis: Awaited<ReturnType<typeof createAnalysis>>;
    allResults: Record<string, AgentResult>;
    extractedData: ContextSeed;
    startTime: number;
    phasesResult: Awaited<ReturnType<AgentOrchestrator["runTier1Phases"]>>;
    totalCost: number;
    completedCount: number;
    factStore: CurrentFact[];
    factStoreFormatted: string;
  }): Promise<{
    totalCost: number;
    completedCount: number;
    factStore: CurrentFact[];
    factStoreFormatted: string;
    verificationContext: VerificationContext;
    allFindings: ScoredFinding[];
    lowConfidenceAgents: string[];
  }> {
    const { stepwise, enrichedContext, analysis, allResults, extractedData, startTime, phasesResult } = params;
    let { totalCost, completedCount, factStore, factStoreFormatted } = params;

    const { allFindings, lowConfidenceAgents } = phasesResult;
    totalCost += phasesResult.costIncurred;
    completedCount += phasesResult.completedInPhases;
    factStore = phasesResult.updatedFactStore;
    factStoreFormatted = phasesResult.updatedFactStoreFormatted;

    // Rebuild verificationContext for global consensus and downstream use
    const verificationContext = await this.buildVerificationContext(
      enrichedContext,
      extractedData,
      factStoreFormatted,
      enrichedContext.deal,
    );

    // Publish all findings to message bus
    for (const finding of allFindings) {
      await messageBus.publish(createFindingMessage(finding.agentName, "*", finding));
    }

    // Persist all findings
    if (allFindings.length > 0) {
      await persistScoredFindings(analysis.id, "tier1-aggregate", allFindings);
    }

    await this.persistTierCheckpoint(analysis.id, allResults, totalCost, startTime, stepwise);

    // Diagnostic log: show tier1 success/failure breakdown
    const tier1SuccessCount = TIER1_AGENT_NAMES.filter(n => allResults[n]?.success).length;
    const tier1FailCount = TIER1_AGENT_NAMES.filter(n => allResults[n] && !allResults[n].success).length;
    const tier1FailedNames = TIER1_AGENT_NAMES.filter(n => allResults[n] && !allResults[n].success);
    console.log(
      `[Orchestrator] Tier 1 results: ${tier1SuccessCount}/${TIER1_AGENT_NAMES.length} succeeded, ${tier1FailCount} failed. ` +
      `Extracted ${allFindings.length} findings. ` +
      `Low confidence: ${lowConfidenceAgents.join(", ") || "none"}` +
      (tier1FailedNames.length > 0 ? `. Failed: ${tier1FailedNames.join(", ")}` : "")
    );
    return { totalCost, completedCount, factStore, factStoreFormatted, verificationContext, allFindings, lowConfidenceAgents };
  }

  /**
   * C.3c — FAIL-FAST post-Tier1, extrait BYTE-INERT de runFullAnalysis.
   * Si des warnings critiques existent, termine l'analyse tôt (stateMachine.complete +
   * completeAnalysis + costMonitor.endAnalysis) et renvoie { done: true, result }.
   * Sinon { done: false } et le pipeline continue. N'inclut PAS le consensus global,
   * le cost-limit, la cross-validation, les red-flags, ni Tier2/Tier3.
   */
  private async runPostTier1FailFast(params: {
    failFastOnCritical: boolean;
    collectedWarnings: EarlyWarning[];
    stateMachine: AnalysisStateMachine;
    analysis: Awaited<ReturnType<typeof createAnalysis>>;
    dealId: string;
    analysisModeOverride: AdvancedAnalysisOptions["analysisModeOverride"];
    allResults: Record<string, AgentResult>;
    totalCost: number;
    startTime: number;
  }): Promise<{ done: true; result: AnalysisResult } | { done: false }> {
    const { failFastOnCritical, collectedWarnings, stateMachine, analysis, dealId, analysisModeOverride, allResults, totalCost, startTime } = params;
    // FAIL-FAST: Check for critical warnings after Tier 1
    if (failFastOnCritical) {
      const criticalWarnings = collectedWarnings.filter(w => w.severity === "critical");
      if (criticalWarnings.length > 0) {
        console.log(`[Orchestrator] FAIL-FAST: ${criticalWarnings.length} critical warning(s) detected`);
        await stateMachine.complete();

        const summary = `**CRITICAL WARNINGS DETECTED - Analysis stopped early**\n\n${criticalWarnings.map(w => `- ${w.title}: ${w.description}`).join("\n")}`;
        const totalTimeMs = Date.now() - startTime;

        await completeAnalysis({
          analysisId: analysis.id,
          success: true,
          totalCost,
          totalTimeMs,
          summary,
          results: allResults,
          mode: analysisModeOverride ?? "full_analysis",
        });

        await costMonitor.endAnalysis({
          analysisId: analysis.id,
          persistAnalysisSummary: false,
        });

        return { done: true, result: this.addWarningsToResult({
          sessionId: analysis.id,
          dealId,
          type: "full_analysis",
          success: true,
          results: allResults,
          totalCost,
          totalTimeMs,
          summary,
          tiersExecuted: [...TIERS_EXECUTED],
        }, collectedWarnings) };
      }
    }
    return { done: false };
  }

  /**
   * C.3d — STEP 4 global consensus (contradictions cross-phase), extrait BYTE-INERT
   * de runFullAnalysis. allFindings/verificationContext/enrichedContext passés en params
   * sans mutation de forme. Renvoie totalCost. N'inclut PAS le cost-limit, la
   * cross-validation, les red-flags, ni Tier2/Tier3.
   */
  private async runGlobalConsensusStep(params: {
    allFindings: ScoredFinding[];
    verificationContext: VerificationContext;
    enrichedContext: EnrichedAgentContext;
    stateMachine: AnalysisStateMachine;
    analysis: Awaited<ReturnType<typeof createAnalysis>>;
    onProgress: AnalysisOptions["onProgress"];
    completedCount: number;
    TOTAL_AGENTS: number;
    totalCost: number;
  }): Promise<{ totalCost: number }> {
    const { allFindings, verificationContext, enrichedContext, stateMachine, analysis, onProgress, completedCount, TOTAL_AGENTS } = params;
    let { totalCost } = params;
    // STEP 4: GLOBAL CONSENSUS - Cross-phase contradiction detection
    // (Phases already ran intra-phase consensus, this catches cross-phase contradictions)
    if (allFindings.length > 1) {
      await stateMachine.startDebate();

      onProgress?.({
        currentAgent: "consensus-engine (global cross-phase contradictions)",
        completedAgents: completedCount,
        totalAgents: TOTAL_AGENTS,
        estimatedCostSoFar: totalCost,
      });

      const debateStats = await this.runConsensusDebate(analysis.id, allFindings, verificationContext, enrichedContext);
      totalCost += debateStats.totalTokens * 0.00001;
      console.log(`[ConsensusEngine] Global: ${debateStats.debateCount} debates completed`);
    }
    return { totalCost };
  }

  /**
   * C.3e — Cost-limit post-consensus (avant synthèse), extrait BYTE-INERT de runFullAnalysis.
   * Si le budget est atteint, termine l'analyse tôt (stateMachine.complete + completeAnalysis
   * + costMonitor.endAnalysis) et renvoie { done: true, result }. Sinon { done: false }.
   * N'inclut PAS STEP 4.5 cross-validation, STEP 4.6 red-flags, ni Tier2/Tier3.
   */
  private async runPostConsensusCostLimit(params: {
    maxCostUsd?: number;
    totalCost: number;
    stateMachine: AnalysisStateMachine;
    allResults: Record<string, AgentResult>;
    analysis: Awaited<ReturnType<typeof createAnalysis>>;
    analysisModeOverride: AdvancedAnalysisOptions["analysisModeOverride"];
    dealId: string;
    collectedWarnings: EarlyWarning[];
    startTime: number;
  }): Promise<{ done: true; result: AnalysisResult } | { done: false }> {
    const { maxCostUsd, totalCost, stateMachine, allResults, analysis, analysisModeOverride, dealId, collectedWarnings, startTime } = params;
    // Check cost limit before synthesis phase
    if (maxCostUsd && totalCost >= maxCostUsd) {
      console.log(`[Orchestrator] Cost limit reached ($${totalCost.toFixed(2)} >= $${maxCostUsd}), skipping remaining phases`);
      await stateMachine.complete();

      const summary = generateFullAnalysisSummary(allResults);
      const totalTimeMs = Date.now() - startTime;

      await completeAnalysis({
        analysisId: analysis.id,
        success: true,
        totalCost,
        totalTimeMs,
        summary: `${summary}\n\n**Note**: Analysis stopped early due to cost limit ($${maxCostUsd})`,
        results: allResults,
        mode: analysisModeOverride ?? "full_analysis",
      });

      await costMonitor.endAnalysis({
        analysisId: analysis.id,
        persistAnalysisSummary: false,
      });

      return { done: true, result: this.addWarningsToResult({
        sessionId: analysis.id,
        dealId,
        type: "full_analysis",
        success: true,
        results: allResults,
        totalCost,
        totalTimeMs,
        summary: `${summary}\n\n**Note**: Analysis stopped early due to cost limit ($${maxCostUsd})`,
        tiersExecuted: [...TIERS_EXECUTED],
      }, collectedWarnings) };
    }
    return { done: false };
  }

  /**
   * C.3f — STEP 4.5 Tier 1 cross-validation (déterministe, no LLM), extrait BYTE-INERT
   * de runFullAnalysis. Mute les scores/grades/meta.limitations dans allResults (par
   * référence) et injecte le résultat dans enrichedContext.tier1CrossValidation comme
   * aujourd'hui. Retourne crossValidation pour disponibilité downstream. N'inclut PAS
   * STEP 4.6 red-flags ni Tier2/Tier3.
   */
  private runTier1CrossValidationStep(params: {
    allResults: Record<string, AgentResult>;
    enrichedContext: EnrichedAgentContext;
  }): ReturnType<typeof runTier1CrossValidation> {
    const { allResults, enrichedContext } = params;
    // STEP 4.5: TIER 1 CROSS-VALIDATION (deterministic, no LLM) (F34/F39)
    const crossValidation = runTier1CrossValidation(allResults);
    if (crossValidation.validations.length > 0 || crossValidation.warnings.length > 0) {
      console.log(
        `[Orchestrator] Tier 1 cross-validation: ${crossValidation.validations.length} divergences, ${crossValidation.adjustments.length} adjustments, ${crossValidation.warnings.length} warnings`
      );

      // Apply score adjustments
      for (const adj of crossValidation.adjustments) {
        const result = allResults[adj.agentName];
        if (result?.success && "data" in result) {
          const data = (result as { data?: Record<string, unknown> }).data;
          const scoreObj = data?.score as { value?: number } | undefined;
          if (scoreObj && typeof scoreObj.value === "number") {
            scoreObj.value = adj.after;
            (scoreObj as { grade?: string }).grade = gradeFromScore(adj.after);
            const meta = data?.meta as { limitations?: string[] } | undefined;
            if (meta) {
              meta.limitations = [
                ...(Array.isArray(meta.limitations) ? meta.limitations : []),
                `Tier 1 cross-validation adjustment ${adj.crossValidationId}: ${adj.reason}`,
              ];
            }
          }
        }
      }

      // Inject into context for Tier 3 agents
      enrichedContext.tier1CrossValidation = crossValidation;
    }
    return crossValidation;
  }

  private async runRedFlagConsolidationStep(params: {
    allResults: Record<string, AgentResult>;
    enrichedContext: EnrichedAgentContext;
  }): Promise<void> {
    const { allResults, enrichedContext } = params;
    // STEP 4.6: CONSOLIDATE RED FLAGS (F77 - unified taxonomy)
    try {
      const { consolidateRedFlags } = await import("../red-flag-taxonomy");
      const agentRedFlagMap: Record<string, { redFlags?: Array<{ id: string; category: string; severity: string; [key: string]: unknown }> }> = {};
      for (const [agentName, result] of Object.entries(allResults)) {
        if (result.success && "data" in result) {
          const data = (result as { data?: Record<string, unknown> }).data;
          if (data?.redFlags && Array.isArray(data.redFlags)) {
            agentRedFlagMap[agentName] = { redFlags: data.redFlags as Array<{ id: string; category: string; severity: string }> };
          }
        }
      }
      const consolidatedFlags = consolidateRedFlags(agentRedFlagMap);
      if (consolidatedFlags.length > 0) {
        enrichedContext.consolidatedRedFlags = consolidatedFlags;
        console.log(`[Orchestrator] F77: Consolidated ${consolidatedFlags.length} red flags from ${Object.keys(agentRedFlagMap).length} agents`);
      }
    } catch (err) {
      console.error("[Orchestrator] Red flag consolidation failed:", err);
    }
  }

  private async runSynthesisSetupStep(params: {
    deal: DealWithDocs;
    dealId: string;
    stateMachine: AnalysisStateMachine;
    enrichedContext: EnrichedAgentContext;
  }): Promise<{ tier3AgentMap: Awaited<ReturnType<typeof getTier3Agents>> }> {
    const { deal, dealId, stateMachine, enrichedContext } = params;
    // STEP 5: SYNTHESIS PHASE - Tier 2 BEFORE Tier 3
    // Run conditions-analyst, contradiction-detector, devils-advocate in PARALLEL
    // (scenario-modeler retiré du pipeline — doctrine anti-oraculaire)
    await stateMachine.startSynthesis();

    const tier3AgentMap = await getTier3Agents();

    // Load BA preferences for Tier 3 personalization (does NOT affect Tier 1/2)
    const baPreferences = await this.loadBAPreferences(deal.userId);
    enrichedContext.baPreferences = baPreferences;

    // Load DealTerms + DealStructure for conditions-analyst (Tier 3)
    const [rawDealTerms, rawDealStructure] = await Promise.all([
      prisma.dealTerms.findUnique({ where: { dealId } }),
      prisma.dealStructure.findUnique({
        where: { dealId },
        include: { tranches: { orderBy: { orderIndex: "asc" } } },
      }),
    ]);
    if (rawDealTerms) {
      enrichedContext.dealTerms = {
        valuationPre: rawDealTerms.valuationPre != null ? Number(rawDealTerms.valuationPre) : null,
        amountRaised: rawDealTerms.amountRaised != null ? Number(rawDealTerms.amountRaised) : null,
        dilutionPct: rawDealTerms.dilutionPct != null ? Number(rawDealTerms.dilutionPct) : null,
        instrumentType: rawDealTerms.instrumentType,
        instrumentDetails: rawDealTerms.instrumentDetails,
        liquidationPref: rawDealTerms.liquidationPref,
        antiDilution: rawDealTerms.antiDilution,
        proRataRights: rawDealTerms.proRataRights,
        informationRights: rawDealTerms.informationRights,
        boardSeat: rawDealTerms.boardSeat,
        founderVesting: rawDealTerms.founderVesting,
        vestingDurationMonths: rawDealTerms.vestingDurationMonths,
        vestingCliffMonths: rawDealTerms.vestingCliffMonths,
        esopPct: rawDealTerms.esopPct != null ? Number(rawDealTerms.esopPct) : null,
        dragAlong: rawDealTerms.dragAlong,
        tagAlong: rawDealTerms.tagAlong,
        ratchet: rawDealTerms.ratchet,
        payToPlay: rawDealTerms.payToPlay,
        milestoneTranches: rawDealTerms.milestoneTranches,
        nonCompete: rawDealTerms.nonCompete,
        customConditions: rawDealTerms.customConditions,
        notes: rawDealTerms.notes,
      };
    }
    if (rawDealStructure?.mode === "STRUCTURED" && rawDealStructure.tranches.length > 0) {
      enrichedContext.dealStructure = {
        mode: "STRUCTURED",
        totalInvestment: rawDealStructure.tranches.reduce(
          (s, t) => s + (t.amount != null ? Number(t.amount) : 0), 0
        ),
        tranches: rawDealStructure.tranches.map(t => ({
          label: t.label || "Tranche",
          trancheType: t.trancheType,
          amount: t.amount != null ? Number(t.amount) : null,
          valuationPre: t.valuationPre != null ? Number(t.valuationPre) : null,
          equityPct: t.equityPct != null ? Number(t.equityPct) : null,
          triggerType: t.triggerType,
          triggerDetails: t.triggerDetails,
          status: t.status,
        })),
      };
    }
    enrichedContext.conditionsAnalystMode = "pipeline";
    return { tier3AgentMap };
  }

  private async runTier3PreTier2Batch(params: {
    stepwise: boolean;
    maxCostUsd?: number;
    totalCost: number;
    completedCount: number;
    tier3AgentMap: Awaited<ReturnType<typeof getTier3Agents>>;
    enrichedContext: EnrichedAgentContext;
    allResults: Record<string, AgentResult>;
    stateMachine: AnalysisStateMachine;
    analysis: Awaited<ReturnType<typeof createAnalysis>>;
    dealId: string;
    startTime: number;
    onProgress: AnalysisOptions["onProgress"];
    TOTAL_AGENTS: number;
  }): Promise<{ totalCost: number; completedCount: number }> {
    const { stepwise, maxCostUsd, tier3AgentMap, enrichedContext, allResults, stateMachine, analysis, dealId, startTime, onProgress, TOTAL_AGENTS } = params;
    let { totalCost, completedCount } = params;
    // Cost check before Tier 3 (pre-Tier2 batch: conditions + contradiction + devil's advocate)
    if (!(maxCostUsd && totalCost >= maxCostUsd)) {
      const tier3BeforeAgents = TIER3_BATCHES_BEFORE_TIER2[0];

      onProgress?.({
        currentAgent: `tier3-parallel (${tier3BeforeAgents.join(", ")})`,
        completedAgents: completedCount,
        totalAgents: TOTAL_AGENTS,
        estimatedCostSoFar: totalCost,
      });

      const batchResults = await Promise.all(
        tier3BeforeAgents.map(async (agentName) => {
          const agent = tier3AgentMap[agentName];
          try {
            const result = await agent.run(enrichedContext);
            return { agentName, result };
          } catch (error) {
            return {
              agentName,
              result: {
                agentName,
                success: false,
                executionTimeMs: 0,
                cost: 0,
                error: error instanceof Error ? error.message : "Unknown error",
              } as AgentResult,
            };
          }
        })
      );

      // Auto-retry failed agents (1 retry each, sequential to avoid overload)
      for (let i = 0; i < batchResults.length; i++) {
        if (!batchResults[i].result.success) {
          const { agentName } = batchResults[i];
          console.log(`[Orchestrator] Retrying failed agent: ${agentName}`);
          const agent = tier3AgentMap[agentName];
          try {
            const retryResult = await agent.run(enrichedContext);
            batchResults[i] = { agentName, result: retryResult };
            console.log(`[Orchestrator] Retry succeeded for ${agentName}`);
          } catch (retryError) {
            console.log(`[Orchestrator] Retry also failed for ${agentName}: ${retryError instanceof Error ? retryError.message : "Unknown"}`);
          }
        }
      }

      // Collect batch results. L'écriture previousResults est DIFFÉRÉE après la boucle
      // (applyDeferredPreTier2PreviousResults) : byte-inert ici (les 3 agents ont déjà tourné
      // en parallèle ; collectPreTier2Result/processAgentResult/record/progress ne LISENT pas
      // previousResults) et requise pour que le split stepwise per-agent (driver v4) lance chaque
      // agent contre la BASELINE previousResults — devils lit previousResults["contradiction-detector"]
      // via evidence-solidity (devils-advocate.ts), conditions via Object.keys().length.
      for (const { agentName, result } of batchResults) {
        ({ totalCost, completedCount } = await this.collectPreTier2Result({
          agentName, result, allResults, totalCost, completedCount, stateMachine, dealId,
        }));
      }

      this.applyDeferredPreTier2PreviousResults(enrichedContext, allResults);

      await updateAnalysisProgress(analysis.id, completedCount, totalCost);

      onProgress?.({
        currentAgent: `tier3-parallel completed`,
        completedAgents: completedCount,
        totalAgents: TOTAL_AGENTS,
        estimatedCostSoFar: totalCost,
      });
      // Tier 3 coherence check retiré (ajustait scenario-modeler — agent supprimé, doctrine anti-oraculaire).
    } else {
      console.log(`[Orchestrator] Cost limit reached ($${totalCost.toFixed(2)} >= $${maxCostUsd}) - skipping Tier 3`);
    }

    await this.persistTierCheckpoint(analysis.id, allResults, totalCost, startTime, stepwise);
    return { totalCost, completedCount };
  }

  /**
   * F3 — Collecte d'UN résultat d'agent pré-Tier2 (conditions/contradiction/devils), PARTAGÉE par
   * le single-pass (boucle parallèle de runTier3PreTier2Batch) et le driver v4 (steps per-agent
   * durables). narrative-sanitize + allResults + totalCost + completedCount + stateMachine.record* +
   * processAgentResult. N'ÉCRIT PAS previousResults (différé : applyDeferredPreTier2PreviousResults,
   * appelé une fois les 3 collectés) — sinon les agents suivants verraient leurs pairs et divergeraient
   * du parallèle single-pass. processAgentResult/record ne LISENT pas previousResults.
   */
  private async collectPreTier2Result(params: {
    agentName: string;
    result: AgentResult;
    allResults: Record<string, AgentResult>;
    totalCost: number;
    completedCount: number;
    stateMachine: AnalysisStateMachine;
    dealId: string;
  }): Promise<{ totalCost: number; completedCount: number }> {
    const { agentName, result, allResults, stateMachine, dealId } = params;
    let { totalCost, completedCount } = params;
    // Sanitize narrative fields for prescriptive language (Rule #1)
    if (result.success && "data" in result) {
      const { data: sanitized, totalViolations } = sanitizeAgentNarratives((result as { data: unknown }).data);
      if (totalViolations > 0) {
        console.warn(`[NarrativeSanitizer] ${agentName}: ${totalViolations} prescriptive violation(s) corrected`);
        (result as { data: unknown }).data = sanitized;
      }
    }
    allResults[agentName] = result;
    totalCost += result.cost;
    completedCount++;

    if (result.success) {
      stateMachine.recordAgentComplete(agentName, result as AnalysisAgentResult);
    } else {
      stateMachine.recordAgentFailed(agentName, result.error ?? "Unknown");
    }

    await processAgentResult(dealId, agentName, result);
    return { totalCost, completedCount };
  }

  /**
   * F3 — Écriture DIFFÉRÉE de previousResults pour le batch tier3-pré (ordre conditions →
   * contradiction → devils, depuis allResults = les résultats déjà sanitizés/collectés). Appelée UNE
   * fois les 3 agents collectés (après la boucle parallèle single-pass ; sur le step devils en v4),
   * de sorte que CHAQUE agent ait tourné contre la BASELINE previousResults. F97 : stockés unsanitized
   * (skipSanitization → renvoie la même référence) — synthèse/évaluations lues par les agents Tier 3
   * suivants. Idempotente (ré-écrit les mêmes entrées au replay).
   */
  private applyDeferredPreTier2PreviousResults(
    enrichedContext: EnrichedAgentContext,
    allResults: Record<string, AgentResult>,
  ): void {
    for (const agentName of TIER3_BATCHES_BEFORE_TIER2[0]) {
      enrichedContext.previousResults![agentName] = sanitizeResultForDownstream(
        allResults[agentName], { skipSanitization: true }
      );
    }
  }

  /**
   * F3 — Exécute UN agent pré-Tier2 (initial + 1 retry, mêmes sémantiques que le batch parallèle
   * single-pass) pour le driver v4 per-agent. Re-dérive getTier3Agents() localement (pur + module-cached,
   * comme runPostTier1Tier3Post) — le map n'est PAS sérialisable, donc jamais porté par le body de
   * tier3-setup au replay. Renvoie le résultat (success ou failed-result) ; la collecte est faite par
   * collectPreTier2Result.
   */
  private async runPreTier2Agent(
    agentName: string,
    enrichedContext: EnrichedAgentContext,
  ): Promise<AgentResult> {
    const tier3AgentMap = await getTier3Agents();
    const agent = tier3AgentMap[agentName];
    let result: AgentResult;
    try {
      result = await agent.run(enrichedContext);
    } catch (error) {
      result = {
        agentName,
        success: false,
        executionTimeMs: 0,
        cost: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      } as AgentResult;
    }
    // Auto-retry failed agent (1 retry, comme runTier3PreTier2Batch)
    if (!result.success) {
      console.log(`[Orchestrator] Retrying failed agent: ${agentName}`);
      try {
        result = await agent.run(enrichedContext);
        console.log(`[Orchestrator] Retry succeeded for ${agentName}`);
      } catch (retryError) {
        console.log(`[Orchestrator] Retry also failed for ${agentName}: ${retryError instanceof Error ? retryError.message : "Unknown"}`);
      }
    }
    return result;
  }

  private async runTier2SectorStep(params: {
    sectorExpert: Awaited<ReturnType<typeof getTier2SectorExpert>>;
    totalCost: number;
    completedCount: number;
    enrichedContext: EnrichedAgentContext;
    allResults: Record<string, AgentResult>;
    stateMachine: AnalysisStateMachine;
    analysis: Awaited<ReturnType<typeof createAnalysis>>;
    dealId: string;
    onProgress: AnalysisOptions["onProgress"];
    TOTAL_AGENTS: number;
  }): Promise<{ totalCost: number; completedCount: number }> {
    const { sectorExpert, enrichedContext, allResults, stateMachine, analysis, dealId, onProgress, TOTAL_AGENTS } = params;
    let { totalCost, completedCount } = params;
    // STEP 6: SECTOR EXPERT PHASE - Tier 2 (active si secteur détecté)
    if (sectorExpert) {
      onProgress?.({
        currentAgent: `tier2-${sectorExpert.name}`,
        completedAgents: completedCount,
        totalAgents: TOTAL_AGENTS,
      });

      try {
        const sectorResult = await sectorExpert.run(enrichedContext);
        allResults[sectorExpert.name] = sectorResult;
        totalCost += sectorResult.cost;
        completedCount++;
        enrichedContext.previousResults![sectorExpert.name] = sectorResult;

        if (sectorResult.success) {
          stateMachine.recordAgentComplete(
            sectorExpert.name,
            sectorResult as unknown as AnalysisAgentResult
          );
        } else {
          stateMachine.recordAgentFailed(sectorExpert.name, sectorResult.error ?? "Unknown");
        }

        await processAgentResult(dealId, sectorExpert.name, sectorResult);
        await updateAnalysisProgress(analysis.id, completedCount, totalCost);

        onProgress?.({
          currentAgent: sectorExpert.name,
          completedAgents: completedCount,
          totalAgents: TOTAL_AGENTS,
          latestResult: sectorResult,
        });
      } catch (error) {
        const errorResult: AgentResult = {
          agentName: sectorExpert.name,
          success: false,
          executionTimeMs: 0,
          cost: 0,
          error: error instanceof Error ? error.message : "Unknown error",
        };
        allResults[sectorExpert.name] = errorResult;
        stateMachine.recordAgentFailed(sectorExpert.name, errorResult.error ?? "Unknown");
        completedCount++;
      }
    }
    return { totalCost, completedCount };
  }

  private async runTier2ConsensusReflexionStep(params: {
    stepwise: boolean;
    sectorExpert: Awaited<ReturnType<typeof getTier2SectorExpert>>;
    allResults: Record<string, AgentResult>;
    allFindings: ScoredFinding[];
    verificationContext: VerificationContext;
    enrichedContext: EnrichedAgentContext;
    totalCost: number;
    analysis: Awaited<ReturnType<typeof createAnalysis>>;
    startTime: number;
  }): Promise<{ totalCost: number }> {
    const { stepwise, sectorExpert, allResults, allFindings, verificationContext, enrichedContext, analysis, startTime } = params;
    let { totalCost } = params;
    // STEP 6.5: CONSENSUS + REFLEXION for Tier 2 sector expert
    if (sectorExpert) {
      const sectorResult = allResults[sectorExpert.name];
      if (sectorResult?.success) {
        const sectorFindings = extractAllFindings({ [sectorExpert.name]: sectorResult }).allFindings;

        // Consensus: check if sector expert contradicts Tier 1 findings
        if (sectorFindings.length > 0) {
          const allFindingsWithSector = [...allFindings, ...sectorFindings];
          console.log(`[Orchestrator] Running post-Tier 2 consensus (${sectorFindings.length} new findings from sector expert)`);
          const postTier2Debate = await this.runConsensusDebate(
            analysis.id, allFindingsWithSector, verificationContext, enrichedContext
          );
          totalCost += postTier2Debate.totalTokens * 0.00001;
        }

        // Reflexion: auto-critique if confidence < 60%
        if (reflexionEngine.needsReflexion(sectorResult as AnalysisAgentResult, sectorFindings, 2)) {
          console.log(`[Orchestrator] Tier 2 sector expert needs reflexion`);
          await this.applyReflexion(
            analysis.id,
            sectorExpert.name,
            sectorResult as AnalysisAgentResult,
            sectorFindings,
            `Deal: ${enrichedContext.deal.name}, Sector: ${enrichedContext.deal.sector}`,
            2,
            verificationContext,
            allResults,
            enrichedContext
          );
        }
      }
    }

    await this.persistTierCheckpoint(analysis.id, allResults, totalCost, startTime, stepwise);
    return { totalCost };
  }

  private async runTier3PostTier2Batch(params: {
    maxCostUsd?: number;
    totalCost: number;
    completedCount: number;
    tier3AgentMap: Awaited<ReturnType<typeof getTier3Agents>>;
    enrichedContext: EnrichedAgentContext;
    allResults: Record<string, AgentResult>;
    stateMachine: AnalysisStateMachine;
    analysis: Awaited<ReturnType<typeof createAnalysis>>;
    dealId: string;
    onProgress: AnalysisOptions["onProgress"];
    TOTAL_AGENTS: number;
    /**
     * d-6 — sous-liste de batches à exécuter. Défaut = TIER3_BATCHES_AFTER_TIER2 (single-pass,
     * byte-identique). Le driver stepwise v3 passe UN batch par step (`tier3-post-{i}` per-agent)
     * pour borner chaque step < 300s (gate Codex #11). Le restore previousResults + le cost-check
     * break restent idempotents par batch (gate Codex #11).
     */
    batches?: readonly (readonly string[])[];
  }): Promise<{ totalCost: number; completedCount: number }> {
    const { maxCostUsd, tier3AgentMap, enrichedContext, allResults, stateMachine, analysis, dealId, onProgress, TOTAL_AGENTS } = params;
    let { totalCost, completedCount } = params;
    // STEP 7: FINAL SYNTHESIS - Tier 3 AFTER Tier 2
    // Restore full (unsanitized) results for final synthesis agents.
    // Sanitization (F52) was needed between Tier 1 agents to prevent confirmation bias.
    // Final synthesis agents (synthesis-deal-scorer, memo-generator) NEED scores/verdicts
    // to produce the global deal score and investment memo.
    for (const [agentName, result] of Object.entries(allResults)) {
      enrichedContext.previousResults![agentName] = result;
    }

    // Crédits-only : pipeline complet pour tous (synthesis-deal-scorer + memo-generator).
    // d-6 : sous-liste optionnelle (v3 per-agent) ; défaut = tous les batches (single-pass).
    const finalSynthesisBatches = params.batches ?? TIER3_BATCHES_AFTER_TIER2;

    for (const batch of finalSynthesisBatches) {
      // REAL-TIME COST CHECK: Before each batch
      if (maxCostUsd && totalCost >= maxCostUsd) {
        console.log(`[Orchestrator] Cost limit reached ($${totalCost.toFixed(2)} >= $${maxCostUsd}) during final synthesis`);
        break;
      }

      // These are single-agent batches, run sequentially
      const agentName = batch[0];
      const agent = tier3AgentMap[agentName];

      onProgress?.({
        currentAgent: agentName,
        completedAgents: completedCount,
        totalAgents: TOTAL_AGENTS,
        estimatedCostSoFar: totalCost,
      });

      let agentResult: AgentResult | null = null;

      // Try up to 2 attempts (initial + 1 retry)
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const result = await agent.run(enrichedContext);
          agentResult = result;
          break; // Success, exit retry loop
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : "Unknown error";
          if (attempt === 1) {
            console.log(`[Orchestrator] ${agentName} failed (attempt ${attempt}), retrying... Error: ${errMsg}`);
          } else {
            console.log(`[Orchestrator] ${agentName} failed after ${attempt} attempts: ${errMsg}`);
            agentResult = {
              agentName,
              success: false,
              executionTimeMs: 0,
              cost: 0,
              error: errMsg,
            };
          }
        }
      }

      if (agentResult) {
        allResults[agentName] = agentResult;
        totalCost += agentResult.cost;
        completedCount++;
        enrichedContext.previousResults![agentName] = agentResult;

        if (agentResult.success) {
          stateMachine.recordAgentComplete(agentName, agentResult as AnalysisAgentResult);
        } else {
          stateMachine.recordAgentFailed(agentName, agentResult.error ?? "Unknown");
        }
        await processAgentResult(dealId, agentName, agentResult);
        await updateAnalysisProgress(analysis.id, completedCount, totalCost);

        // Thesis-first — apres thesis-reconciler, persister la reconciliation sur
        // la these initiale (maj verdict + confidence + reconciliationJson + notes)
        if (
          agentName === "thesis-reconciler" &&
          enrichedContext.analysis?.mode !== "post_call_reanalysis"
        ) {
          await this.applyThesisReconciliation(enrichedContext, agentResult);
        }

        onProgress?.({
          currentAgent: agentName,
          completedAgents: completedCount,
          totalAgents: TOTAL_AGENTS,
          latestResult: agentResult,
          estimatedCostSoFar: totalCost,
        });
      }
    }
    return { totalCost, completedCount };
  }

  private async runFinalCompletion(params: {
    stepwise: boolean;
    allResults: Record<string, AgentResult>;
    totalCost: number;
    stateMachine: AnalysisStateMachine;
    analysis: Awaited<ReturnType<typeof createAnalysis>>;
    dealId: string;
    startTime: number;
    analysisModeOverride: AdvancedAnalysisOptions["analysisModeOverride"];
    isUpdate: boolean;
    collectedWarnings: EarlyWarning[];
  }): Promise<AnalysisResult> {
    const { stepwise, allResults, totalCost, stateMachine, analysis, dealId, startTime, analysisModeOverride, isUpdate, collectedWarnings } = params;
    // COMPLETE
    await stateMachine.complete();
    // DEBUG log removed for production - uncomment for debugging:
    // console.log("[Orchestrator:DEBUG] State machine completed, generating summary...");

    const summary = generateFullAnalysisSummary(allResults);
    const totalTimeMs = Date.now() - startTime;
    const failedAgents = Object.entries(allResults).filter(([, r]) => !r.success).map(([k, r]) => `${k}: ${r.error ?? "no error msg"}`);
    if (failedAgents.length > 0) {
      console.log(`[Orchestrator] Failed agents in allResults: ${failedAgents.join(", ")}`);
    }
    const allSuccess = Object.values(allResults).every((r) => r.success);
    const orchestrationSummary = stateMachine.getSummary();

    // D.5a — en mode stepwise, pas de checkpoint legacy COMPLETED : la complétion
    // canonique passe par completeAnalysis ci-dessous ; l'état durable via STEPWISE:*.
    if (!stepwise) {
      await saveCheckpoint(analysis.id, {
        state: "COMPLETED",
        completedAgents: Object.keys(allResults),
        pendingAgents: [],
        failedAgents: Object.entries(allResults)
          .filter(([, result]) => !result.success)
          .map(([agent, result]) => ({
            agent,
            error: result.error ?? "no error msg",
            retries: 1,
          })),
        findings: extractAllFindings(allResults).allFindings,
        results: allResults,
        totalCost,
        startTime: new Date(startTime).toISOString(),
      });
    }

    await completeAnalysis({
      analysisId: analysis.id,
      success: allSuccess,
      totalCost,
      totalTimeMs,
      summary: `${summary}\n\n**Orchestration**: ${orchestrationSummary.transitions} state transitions, ${orchestrationSummary.totalFindings} findings`,
      results: allResults,
      mode: analysisModeOverride ?? "full_analysis",
    });
    // End cost monitoring after final results are persisted so `_costReport`
    // is merged into the canonical completed payload instead of being overwritten.
    const costReport = await costMonitor.endAnalysis({
      analysisId: analysis.id,
      persistAnalysisSummary: false,
    });
    if (costReport) {
      console.log(`[CostMonitor] Analysis completed: $${costReport.totalCost.toFixed(4)} (${costReport.totalCalls} calls)`);
    }
    // DEBUG log removed for production - uncomment for debugging:
    // console.log("[Orchestrator:DEBUG] completeAnalysis done, updating deal status...");

    await updateDealStatus(dealId, "IN_DD");

    // F40: Calculate analysis delta for re-analyses
    let analysisDelta;
    if (isUpdate) {
      try {
        const { calculateAnalysisDelta } = await import("@/services/analysis-delta");
        const previousAnalysis = await prisma.analysis.findFirst({
          where: { dealId, id: { not: analysis.id }, completedAt: { not: null } },
          orderBy: { completedAt: "desc" },
          select: { id: true },
        });
        if (previousAnalysis) {
          analysisDelta = await calculateAnalysisDelta(analysis.id, previousAnalysis.id);
          if (analysisDelta) {
            console.log(`[Orchestrator] F40: Delta vs previous analysis: ${analysisDelta.scoreDelta.overall.delta >= 0 ? "+" : ""}${analysisDelta.scoreDelta.overall.delta} points`);
          }
        }
      } catch (err) {
        console.error("[Orchestrator] Analysis delta failed:", err);
      }
    }

    return this.addWarningsToResult({
      sessionId: analysis.id,
      dealId,
      type: "full_analysis",
      success: allSuccess,
      results: allResults,
      totalCost,
      totalTimeMs,
      summary,
      tiersExecuted: [...TIERS_EXECUTED],
      analysisDelta: analysisDelta ?? undefined,
    }, collectedWarnings);
  }

  private async runFullAnalysis(
    deal: DealWithDocs,
    dealId: string,
    onProgress: AnalysisOptions["onProgress"],
    advancedOptions: AdvancedAnalysisOptions,
    stepRunner: StepRunner = new InlineStepRunner()
  ): Promise<AnalysisResult> {
    const init = await this.initializeFullAnalysisRun(deal, dealId, advancedOptions);

    // d-2b — OFF STRICT : flag stepwise OFF → chemin single-pass EXACT (zéro driver/snapshot),
    // BYTE-INERT en prod (DEEP_DIVE_STEPWISE=0). === comportement d'avant le câblage stepwise
    // (runTerminalStepwiseDriver avec stepwise=false retournait déjà le liveResult exact).
    if (!init.stepwise) {
      return this.runFullAnalysisPipeline(deal, dealId, onProgress, init);
    }

    // ON — Routing EXACT par version de graphe stepwise (lock Codex #1). La version est STICKY
    // (stampée au dispatch, route.ts) → un run en vol reprend TOUJOURS sur SON graphe, jamais
    // sur un graphe déployé après lui. Littéraux (PAS STEPWISE_GRAPH_VERSION qui bumpe) :
    //   - `undefined|1` (d-2a) → driver « 1 step englobante » (D.5d-1c) : runs dispatchés AVANT
    //     d-2b (graphVersion 1) reprennent sur ce graphe.
    //   - `2` (d-2b) → graphe multi-unités durable (runFullAnalysisStepwise).
    //   - `3` (d-3) → graphe v3 FIN : Tier1 per-phase + post-tier1-glue (runFullAnalysisStepwiseV3, tier0Split=false).
    //   - `4` → graphe v4 : v3 + split tier0-thesis → tier0-pre-context + tier0-thesis-extractor (même
    //     driver, tier0Split=true). Bump REQUIS (pas EN PLACE) car DEEP_DIVE_STEPWISE est ON → des runs
    //     graphVersion=3 en vol existent ; les router sur le graphe v3 FROZEN évite le mismatch de step IDs.
    // Version inconnue (worker obsolète vs dispatch plus récent) → LÈVE plutôt que mauvais graphe.
    const graphVersion = advancedOptions.stepwiseGraphVersion;
    if (graphVersion === undefined || graphVersion === 1) {
      return runTerminalStepwiseDriver({
        stepRunner,
        stepwise: true,
        pipeline: () => this.runFullAnalysisPipeline(deal, dealId, onProgress, init),
        loadPersistedResults: async () =>
          (await loadResults(init.analysis.id)) as AnalysisResult["results"] | null,
      });
    }
    if (graphVersion === 2) {
      // INVARIANT : le graphe v2 ne voit JAMAIS stopAfterThesis. Une re-extraction (stopAfterThesis)
      // est courte (Tier 0 + thèse, 1 step) → aucun besoin de durabilité Tier1+, et le snapshot v2
      // ne porte PAS thesisOutput (lu uniquement par le bloc stopAfterThesis ; null au rehydrate).
      // On la route donc en single-pass → matérialise l'invariant (cf. gate Codex d-2b-4).
      if (init.stopAfterThesis) {
        return this.runFullAnalysisPipeline(deal, dealId, onProgress, init);
      }
      return this.runFullAnalysisStepwise(deal, dealId, onProgress, init, stepRunner);
    }
    if (graphVersion === 3 || graphVersion === 4) {
      // INVARIANT v3/v4 ∌ stopAfterThesis (comme v2) : re-extraction courte (Tier 0 + thèse) → single-pass
      // (le snapshot ne porte pas thesisOutput ; même matérialisation que v2, gate Codex d-2b-4).
      if (init.stopAfterThesis) {
        return this.runFullAnalysisPipeline(deal, dealId, onProgress, init);
      }
      // tier0Split = (graphVersion>=4). v3 (frozen) garde le step `tier0-thesis` ; v4 le split.
      return this.runFullAnalysisStepwiseV3(deal, dealId, onProgress, init, stepRunner, graphVersion === 4);
    }
    throw new Error(
      `[stepwise] version de graphe ${graphVersion} non supportée par ce worker (dispatch plus récent que le code déployé)`
    );
  }

  /**
   * D.5d-1b — Corps pipeline de full_analysis (stateMachine.start() → returns), extrait
   * BYTE-INERT de runFullAnalysis. Sépare le bootstrap (initializeFullAnalysisRun, hors de
   * ce corps, crée la state machine non-sérialisable) du séquenceur durable — pré-requis du
   * wrapper stepwise D.5d-1c (Modèle B). La frontière try/catch (transition FAILED +
   * completeAnalysis + endAnalysis) reste intégralement ici. Aucun changement de logique ni
   * d'ordre d'effet : déplacement net du bloc destructure + try/catch.
   */
  private async runFullAnalysisPipeline(
    deal: DealWithDocs,
    dealId: string,
    onProgress: AnalysisOptions["onProgress"],
    init: FullAnalysisRunInit
  ): Promise<AnalysisResult> {
    const {
      isUpdate,
      enableTrace,
      analysisModeOverride,
      startTime,
      collectedWarnings,
      initialCanonicalDeal,
      TOTAL_AGENTS,
      corpusSnapshot,
      scopedDocuments,
      analysis,
      stateMachine,
      allResults,
    } = init;
    let { totalCost, completedCount, factStore, factStoreFormatted, founderResponses } = init;

    try {
      await stateMachine.start();

      const baseContext = await this.buildBaseAnalysisContext({
        dealId,
        initialCanonicalDeal,
        analysis,
        analysisModeOverride,
        corpusSnapshot,
        scopedDocuments,
      });

      // STEP 0: TIER 0 FACT EXTRACTION (runs BEFORE everything)
      // Extracts structured facts that will be available to all agents
      ({
        totalCost,
        completedCount,
        factStore,
        factStoreFormatted,
        founderResponses,
      } = await this.runTier0Step({
        deal,
        scopedDocuments,
        isUpdate,
        onProgress,
        allResults,
        totalCost,
        completedCount,
        factStore,
        factStoreFormatted,
        founderResponses,
        analysisId: analysis.id,
      }));

      let extractedData: ContextSeed;
      ({ totalCost, completedCount, extractedData } = await this.runDocumentExtractorStep({
        baseContext,
        scopedDocuments,
        onProgress,
        analysis,
        stateMachine,
        allResults,
        totalCost,
        completedCount,
        TOTAL_AGENTS,
      }));

      let deckCoherenceReport: DeckCoherenceReport | null;
      ({ totalCost, deckCoherenceReport } = await this.runDeckCoherenceStep({
        deal,
        scopedDocuments,
        extractedData,
        onProgress,
        allResults,
        totalCost,
      }));

      let enrichedContext: EnrichedAgentContext;
      ({ factStore, factStoreFormatted, enrichedContext } = await this.runContextEngineStep({
        deal,
        dealId,
        baseContext,
        stateMachine,
        extractedData,
        analysis,
        corpusSnapshot,
        deckCoherenceReport,
        founderResponses,
        onProgress,
        completedCount,
        TOTAL_AGENTS,
        factStore,
        factStoreFormatted,
      }));

      let thesisOutput: ThesisExtractorOutput | null;
      ({ totalCost, completedCount, thesisOutput } = await this.runThesisExtractionStep({
        dealId,
        analysisModeOverride,
        analysis,
        enrichedContext,
        corpusSnapshot,
        allResults,
        enableTrace,
        totalCost,
        completedCount,
      }));

      return await this.runFullAnalysisPostThesis({
        deal,
        dealId,
        onProgress,
        init,
        enrichedContext,
        extractedData,
        thesisOutput,
        totalCost,
        completedCount,
        factStore,
        factStoreFormatted,
        // d-2b-1 (gate Codex) — remonte le coût courant du tail dans CE scope pour que le
        // catch terminal ci-dessous reste byte-équivalent sur un échec post-thèse.
        reportTotalCost: (c: number) => { totalCost = c; },
      });
    } catch (error) {
      return await this.failFullAnalysis(error, {
        stateMachine,
        analysis,
        dealId,
        totalCost,
        allResults,
        analysisModeOverride,
        startTime,
        collectedWarnings,
      });
    }
  }

  /**
   * d-2b-3 — Gestion d'échec terminale de full_analysis (transition FAILED best-effort +
   * completeAnalysis + endAnalysis + addWarningsToResult), extraite BYTE-INERT du catch de
   * runFullAnalysisPipeline. PARTAGÉE par runFullAnalysisPipeline ET runFullAnalysisStepwise
   * (même handler d'échec, pas de drift). Reçoit le `totalCost` courant (déjà remonté par
   * reportTotalCost depuis le tail) → coût d'échec identique à avant l'extraction.
   */
  private async failFullAnalysis(
    error: unknown,
    ctx: {
      stateMachine: AnalysisStateMachine;
      analysis: Awaited<ReturnType<typeof createAnalysis>>;
      dealId: string;
      totalCost: number;
      allResults: Record<string, AgentResult>;
      analysisModeOverride: AdvancedAnalysisOptions["analysisModeOverride"];
      startTime: number;
      collectedWarnings: EarlyWarning[];
    }
  ): Promise<AnalysisResult> {
    const { stateMachine, analysis, dealId, totalCost, allResults, analysisModeOverride, startTime, collectedWarnings } = ctx;
    // DEBUG log removed for production - uncomment for debugging:
    // console.error("[Orchestrator:DEBUG] CAUGHT ERROR in runFullAnalysis: ${error instanceof Error ? error.message : String(error)}`);
    // DEBUG log removed for production - uncomment for debugging:
    // console.error("[Orchestrator:DEBUG] Error stack: ${error instanceof Error ? error.stack : "N/A"}`);
    // Only transition to FAILED if not already completed
    const currentState = stateMachine.getState();
    if (currentState !== "COMPLETED" && currentState !== "FAILED") {
      await stateMachine.fail(error instanceof Error ? error : new Error("Unknown error"));
    }

    const totalTimeMs = Date.now() - startTime;

    await completeAnalysis({
      analysisId: analysis.id,
      success: false,
      totalCost,
      totalTimeMs,
      summary: `Analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      results: allResults,
      mode: analysisModeOverride ?? "full_analysis",
      statusOverride: "FAILED",
    });

    // End cost monitoring after final results are persisted so `_costReport`
    // survives the failed completion payload as well.
    await costMonitor.endAnalysis({
      analysisId: analysis.id,
      persistAnalysisSummary: false,
    });

    return this.addWarningsToResult({
      sessionId: analysis.id,
      dealId,
      type: "full_analysis",
      success: false,
      results: allResults,
      totalCost,
      totalTimeMs,
      summary: `Analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      tiersExecuted: [...TIERS_EXECUTED],
    }, collectedWarnings);
  }


  /**
   * d-2b — Tail post-thèse de full_analysis (STEP 2.6 stop-after-thesis -> Tier 1/2/3 ->
   * complétion finale), extrait BYTE-INERT de runFullAnalysisPipeline. Séquence PARTAGÉE
   * par le chemin single-pass (runFullAnalysisPipeline) ET le chemin durable
   * (runFullAnalysisStepwise, unité « rest » à venir) -> aucun drift de séquence. Reçoit
   * l'état VIVANT au boundary post-thèse (enrichedContext + locals mutés) + l'init statique.
   * Le try/catch terminal reste chez l'appelant (frontière inchangée). Retourne l'AnalysisResult
   * terminal (succès, early-return failFast/cost-limit, ou stop-after-thesis).
   */
  private async runFullAnalysisPostThesis(params: {
    deal: DealWithDocs;
    dealId: string;
    onProgress: AnalysisOptions["onProgress"];
    init: FullAnalysisRunInit;
    enrichedContext: EnrichedAgentContext;
    extractedData: ContextSeed;
    thesisOutput: ThesisExtractorOutput | null;
    totalCost: number;
    completedCount: number;
    factStore: CurrentFact[];
    factStoreFormatted: string;
    /** Remonte le totalCost courant du tail au scope appelant (catch terminal de
     *  runFullAnalysisPipeline) : byte-équivalence du coût sur le chemin d'échec post-thèse. */
    reportTotalCost: (totalCost: number) => void;
  }): Promise<AnalysisResult> {
    const { deal, dealId, onProgress, init, enrichedContext, extractedData, thesisOutput, reportTotalCost } = params;
    const {
      failFastOnCritical,
      maxCostUsd,
      onEarlyWarning,
      isUpdate,
      stopAfterThesis,
      analysisModeOverride,
      startTime,
      collectedWarnings,
      sectorExpert,
      TOTAL_AGENTS,
      analysis,
      stateMachine,
      allResults,
      stepwise,
    } = init;
    const { completedCount, factStore, factStoreFormatted } = params;
    let { totalCost } = params;
    try {
      // STEP 2.6: STOP-AFTER-THESIS — re-extraction de these (upload doc / admin backfill).
      // Pas de gate, pas de decision : on s'arrete apres la these et on COMPLETE l'analyse
      // en mode thesis_only (meme compute qu'avant — seuls Tier 0 + these tournent, 1 cr).
      // Le lancement normal (stopAfterThesis=false) enchaine directement Tier 1/2/3 ci-dessous.
      if (stopAfterThesis) {
        // Si thesis-extractor a echoue, on ne peut pas livrer la these → FAILED (le refund
        // est gere par l'appelant Inngest sur result.success === false).
        if (!thesisOutput || !enrichedContext.thesis) {
          console.error(
            `[Orchestrator:FullAnalysis] stopAfterThesis=true mais thesis-extractor a echoue (output=${!!thesisOutput}, thesisCtx=${!!enrichedContext.thesis}).`
          );
          await stateMachine.fail(new Error("Thesis extraction failed during re-extraction"));
          await completeAnalysis({
            analysisId: analysis.id,
            success: false,
            totalCost,
            totalTimeMs: Date.now() - startTime,
            summary: "Extraction de these echouee.",
            results: allResults,
            statusOverride: "FAILED",
          });
          return {
            sessionId: analysis.id,
            dealId,
            type: "full_analysis" as const,
            success: false,
            results: allResults,
            totalCost,
            totalTimeMs: Date.now() - startTime,
            summary: "Extraction de these echouee",
            earlyWarnings: collectedWarnings,
            hasCriticalWarnings: collectedWarnings.some(w => w.severity === "critical"),
          };
        }

        console.log(
          `[Orchestrator:FullAnalysis] Stop-after-thesis (re-extraction) — analysisId=${analysis.id}, thesisId=${enrichedContext.thesis.id}, verdict=${thesisOutput.verdict}`
        );

        const reextractSummary = `These re-extraite — verdict ${thesisOutput.verdict} (confiance ${thesisOutput.confidence}/100).`;
        await updateAnalysisProgress(analysis.id, completedCount, totalCost);
        await completeAnalysis({
          analysisId: analysis.id,
          success: true,
          totalCost,
          totalTimeMs: Date.now() - startTime,
          summary: reextractSummary,
          results: allResults,
          mode: "thesis_only",
        });

        return {
          sessionId: analysis.id,
          dealId,
          type: "full_analysis" as const,
          success: true,
          results: allResults,
          totalCost,
          totalTimeMs: Date.now() - startTime,
          summary: reextractSummary,
          earlyWarnings: collectedWarnings,
          hasCriticalWarnings: collectedWarnings.some(w => w.severity === "critical"),
        };
      }

      await this.persistTierCheckpoint(analysis.id, allResults, totalCost, startTime, stepwise);

      // STEP 3: ANALYSIS PHASE - Tier 1 Agents in 4 Sequential Phases
      // Phase A: deck-forensics → validates deck claims
      // Phase B: financial-auditor → validates financial metrics
      // Phase C: team + competitive + market (parallel) → using validated facts
      // Phase D: remaining agents (parallel) → using all validated facts
      await stateMachine.startAnalysis();

      const tier1AgentMap = await getTier1Agents();

      const phasesResult = await this.runTier1Phases({
        enrichedContext,
        tier1AgentMap,
        analysisId: analysis.id,
        dealId,
        onProgress,
        totalAgents: TOTAL_AGENTS,
        onEarlyWarning,
        collectedWarnings,
        allResults,
        initialTotalCost: totalCost,
        initialCompletedCount: completedCount,
        factStore,
        factStoreFormatted,
        extractedData,
        stateMachine,
      });

      // d-3 (R1) — tail post-Tier1 (aggregation → complétion finale) extrait BYTE-INERT vers
      // runFullAnalysisPostTier1, PARTAGÉ par ce chemin (single-pass/v2) ET le driver stepwise v3
      // (qui exécute Tier1 per-phase puis appelle ce tail en terminal). reportTotalCost remonte le
      // coût courant du tail dans CE scope (try/finally inchangé) → byte-équivalence sur tous les
      // chemins de sortie (succès, early-return failFast/cost-limit, exception).
      return await this.runFullAnalysisPostTier1({
        deal,
        dealId,
        onProgress,
        init,
        enrichedContext,
        extractedData,
        phasesResult,
        totalCost,
        completedCount,
        factStore,
        factStoreFormatted,
        reportTotalCost: (c: number) => {
          totalCost = c;
        },
      });
    } finally {
      // d-2b-1 (gate Codex) — coût courant remonté sur TOUS les chemins de sortie (succès,
      // early-return, exception) → le catch terminal de runFullAnalysisPipeline voit le même
      // totalCost qu'avant l'extraction.
      reportTotalCost(totalCost);
    }
  }

  /**
   * d-3 (R1) — Tail post-Tier1 de full_analysis (STEP 4 aggregation → fail-fast → consensus
   * global → cost-limit → cross-val → red-flags → synthèse → Tier3-pre → Tier2-sector →
   * Tier2-consensus/reflexion → Tier3-post → complétion finale), extrait BYTE-INERT de
   * runFullAnalysisPostThesis. Séquence PARTAGÉE par le chemin single-pass (runFullAnalysisPostThesis,
   * APRÈS runTier1Phases) ET le chemin durable v3 (runFullAnalysisStepwiseV3, APRÈS la boucle Tier1
   * stepwise + finalizeTier1Phases) → aucun drift de séquence. Reçoit le `phasesResult` (réel en
   * single-pass ; shim coût-neutre `costIncurred:0`/`completedInPhases:0` en v3 où totalCost/
   * completedCount sont DÉJÀ globaux) + l'état VIVANT au boundary post-Tier1. Le try/finally
   * remonte le totalCost courant au scope appelant (reportTotalCost) sur tous les chemins de sortie.
   */
  private async runFullAnalysisPostTier1(params: {
    deal: DealWithDocs;
    dealId: string;
    onProgress: AnalysisOptions["onProgress"];
    init: FullAnalysisRunInit;
    enrichedContext: EnrichedAgentContext;
    extractedData: ContextSeed;
    phasesResult: Awaited<ReturnType<AgentOrchestrator["runTier1Phases"]>>;
    totalCost: number;
    completedCount: number;
    factStore: CurrentFact[];
    factStoreFormatted: string;
    /** Remonte le totalCost courant du tail au scope appelant : byte-équivalence du coût. */
    reportTotalCost: (totalCost: number) => void;
  }): Promise<AnalysisResult> {
    const { deal, dealId, onProgress, init, enrichedContext, extractedData, phasesResult, reportTotalCost, factStore, factStoreFormatted } = params;
    let { totalCost, completedCount } = params;
    try {
      const glue = await this.runPostTier1Glue({
        dealId,
        onProgress,
        init,
        enrichedContext,
        extractedData,
        phasesResult,
        totalCost,
        completedCount,
        factStore,
        factStoreFormatted,
        reportTotalCost: (c) => {
          totalCost = c;
        },
      });
      if (glue.done) return glue.result;
      completedCount = glue.completedCount;

      return await this.runPostTier1Rest({
        deal,
        dealId,
        onProgress,
        init,
        enrichedContext,
        verificationContext: glue.verificationContext,
        allFindings: glue.allFindings,
        totalCost,
        completedCount,
        reportTotalCost: (c) => {
          totalCost = c;
        },
      });
    } finally {
      reportTotalCost(totalCost);
    }
  }

  /**
   * d-3 (R3) — « GLUE » post-Tier1, extrait BYTE-INERT de runFullAnalysisPostTier1.
   * Séquence aggregation → failFast (early-return) → consensus global → cost-limit (early-return)
   * → cross-validation → red-flags. Mute allResults/enrichedContext par RÉFÉRENCE (cross-val :
   * scores allResults + enrichedContext.tier1CrossValidation ; red-flags : consolidatedRedFlags)
   * comme avant. PARTAGÉ par le chemin single-pass (runFullAnalysisPostTier1) ET le driver
   * stepwise v3 (step durable `post-tier1-glue`, d-3-6). Le `finally` remonte le totalCost courant
   * au scope appelant (reportTotalCost) sur TOUS les chemins de sortie (not-done, early-return,
   * exception) — byte-équivalence du coût, pattern d-2b-1.
   *
   * NB byte-équivalence (gate Codex #10) : les early-returns failFast/cost-limit appellent
   * `stateMachine.complete()` depuis ANALYZING/DEBATING (sans startSynthesis) → transition INVALIDE
   * → `transition()` LÈVE (state-machine.ts:219). Le `return { done: true }` est donc INJOIGNABLE au
   * runtime (préservé pour la forme, comme le code d'origine `if (failFastResult.done) return …`) ;
   * une fois déclenchés (failFastOnCritical / maxCostUsd), ces chemins THROWENT → catch terminal →
   * FAILED. Bug latent isolé hors chantier (corriger la transition changerait la sortie OFF).
   */
  private async runPostTier1Glue(params: {
    dealId: string;
    onProgress: AnalysisOptions["onProgress"];
    init: FullAnalysisRunInit;
    enrichedContext: EnrichedAgentContext;
    extractedData: ContextSeed;
    phasesResult: Awaited<ReturnType<AgentOrchestrator["runTier1Phases"]>>;
    totalCost: number;
    completedCount: number;
    factStore: CurrentFact[];
    factStoreFormatted: string;
    /** Remonte le totalCost courant du glue au scope appelant : byte-équivalence du coût. */
    reportTotalCost: (totalCost: number) => void;
  }): Promise<
    | { done: true; result: AnalysisResult }
    | { done: false; completedCount: number; verificationContext: VerificationContext; allFindings: ScoredFinding[] }
  > {
    const { dealId, onProgress, init, enrichedContext, extractedData, phasesResult, reportTotalCost } = params;
    const {
      failFastOnCritical,
      maxCostUsd,
      analysisModeOverride,
      startTime,
      collectedWarnings,
      TOTAL_AGENTS,
      analysis,
      stateMachine,
      allResults,
      stepwise,
    } = init;
    let { totalCost, completedCount, factStore, factStoreFormatted } = params;
    try {
      let verificationContext: VerificationContext;
      let allFindings: ScoredFinding[];
      // lowConfidenceAgents : retourné par aggregation mais DEAD en aval (log-only) → non propagé.
      ({ totalCost, completedCount, factStore, factStoreFormatted, verificationContext, allFindings } = await this.runPostTier1Aggregation({
        stepwise,
        enrichedContext,
        analysis,
        allResults,
        extractedData,
        startTime,
        phasesResult,
        totalCost,
        completedCount,
        factStore,
        factStoreFormatted,
      }));

      const failFastResult = await this.runPostTier1FailFast({
        failFastOnCritical,
        collectedWarnings,
        stateMachine,
        analysis,
        dealId,
        analysisModeOverride,
        allResults,
        totalCost,
        startTime,
      });
      if (failFastResult.done) return failFastResult;

      ({ totalCost } = await this.runGlobalConsensusStep({
        allFindings,
        verificationContext,
        enrichedContext,
        stateMachine,
        analysis,
        onProgress,
        completedCount,
        TOTAL_AGENTS,
        totalCost,
      }));

      const costLimitResult = await this.runPostConsensusCostLimit({
        maxCostUsd,
        totalCost,
        stateMachine,
        allResults,
        analysis,
        analysisModeOverride,
        dealId,
        collectedWarnings,
        startTime,
      });
      if (costLimitResult.done) return costLimitResult;

      this.runTier1CrossValidationStep({ allResults, enrichedContext });

      await this.runRedFlagConsolidationStep({ allResults, enrichedContext });

      return { done: false, completedCount, verificationContext, allFindings };
    } finally {
      reportTotalCost(totalCost);
    }
  }

  /**
   * d-3 (R3) / d-4 — « REST » post-Tier1. Délègue à deux sous-unités PARTAGÉES (single-pass ET
   * driver stepwise v3) : `runPostTier1Tier3Pre` (synthesis-setup + batch Tier3 pré-Tier2) puis
   * `runPostTier1RestAfterTier3Pre` (tier2-sector → tier2-consensus/reflexion → tier3-post →
   * final-completion). Le split permet au driver v3 de peeler `tier3-pre` en step durable (d-4) tout
   * en gardant runPostTier1Rest comme source d'ordre du chemin OFF (pas de drift de séquence). Le
   * `finally` (chaîné avec celui de RestAfterTier3Pre, pattern d-2b-1) remonte le totalCost courant
   * au scope appelant (reportTotalCost) sur tous les chemins de sortie — byte-équivalence du coût.
   */
  private async runPostTier1Rest(params: {
    deal: DealWithDocs;
    dealId: string;
    onProgress: AnalysisOptions["onProgress"];
    init: FullAnalysisRunInit;
    enrichedContext: EnrichedAgentContext;
    verificationContext: VerificationContext;
    allFindings: ScoredFinding[];
    totalCost: number;
    completedCount: number;
    /** Remonte le totalCost courant du rest au scope appelant : byte-équivalence du coût. */
    reportTotalCost: (totalCost: number) => void;
  }): Promise<AnalysisResult> {
    const { deal, dealId, onProgress, init, enrichedContext, verificationContext, allFindings, reportTotalCost } = params;
    let { totalCost, completedCount } = params;
    try {
      ({ totalCost, completedCount } = await this.runPostTier1Tier3Pre({
        deal,
        dealId,
        onProgress,
        init,
        enrichedContext,
        totalCost,
        completedCount,
      }));

      return await this.runPostTier1RestAfterTier3Pre({
        dealId,
        onProgress,
        init,
        enrichedContext,
        verificationContext,
        allFindings,
        totalCost,
        completedCount,
        reportTotalCost: (c) => {
          totalCost = c;
        },
      });
    } finally {
      reportTotalCost(totalCost);
    }
  }

  /**
   * d-4 — « TIER3-PRE » post-Tier1, extrait BYTE-INERT de runPostTier1Rest. Synthesis-setup
   * (startSynthesis + getTier3Agents + DealTerms/Structure/BAPrefs dans enrichedContext) suivi du
   * batch Tier3 pré-Tier2 (conditions-analyst, contradiction-detector, devils-advocate, parallèles
   * + retry séquentiel). tier3AgentMap reste LOCAL (DynamicAgent = instances non-sérialisables) :
   * re-dérivé via getTier3Agents() (pur + module-cached) dans runPostTier1RestAfterTier3Pre. PARTAGÉ
   * par le chemin single-pass (runPostTier1Rest) ET le driver stepwise v3 (step durable `tier3-pre`,
   * d-4). Pas d'early-return (cost-check de tier3-pré = SKIP-only).
   */
  private async runPostTier1Tier3Pre(params: {
    deal: DealWithDocs;
    dealId: string;
    onProgress: AnalysisOptions["onProgress"];
    init: FullAnalysisRunInit;
    enrichedContext: EnrichedAgentContext;
    totalCost: number;
    completedCount: number;
  }): Promise<{ totalCost: number; completedCount: number }> {
    const { deal, dealId, onProgress, init, enrichedContext } = params;
    const { maxCostUsd, startTime, TOTAL_AGENTS, analysis, stateMachine, allResults, stepwise } = init;
    let { totalCost, completedCount } = params;

    const { tier3AgentMap } = await this.runSynthesisSetupStep({ deal, dealId, stateMachine, enrichedContext });

    ({ totalCost, completedCount } = await this.runTier3PreTier2Batch({
      stepwise,
      maxCostUsd,
      totalCost,
      completedCount,
      tier3AgentMap,
      enrichedContext,
      allResults,
      stateMachine,
      analysis,
      dealId,
      startTime,
      onProgress,
      TOTAL_AGENTS,
    }));

    return { totalCost, completedCount };
  }

  /**
   * d-4 / d-5 — « REST APRÈS TIER3-PRE » post-Tier1. Délègue à deux sous-unités PARTAGÉES :
   * `runPostTier1Tier2` (tier2-sector + tier2-consensus/reflexion) puis `runPostTier1RestAfterTier2Sector`
   * (tier3-post + final-completion). Le split permet au driver v3 de peeler `tier2-sector` en step durable
   * (d-5) tout en gardant la chaîne comme source d'ordre du chemin OFF (pas de drift). Le `finally`
   * (chaîné avec celui de RestAfterTier2Sector, pattern d-2b-1) remonte le totalCost courant au scope
   * appelant (reportTotalCost) sur tous les chemins de sortie — byte-équivalence du coût.
   */
  private async runPostTier1RestAfterTier3Pre(params: {
    dealId: string;
    onProgress: AnalysisOptions["onProgress"];
    init: FullAnalysisRunInit;
    enrichedContext: EnrichedAgentContext;
    verificationContext: VerificationContext;
    allFindings: ScoredFinding[];
    totalCost: number;
    completedCount: number;
    reportTotalCost: (totalCost: number) => void;
  }): Promise<AnalysisResult> {
    const { dealId, onProgress, init, enrichedContext, verificationContext, allFindings, reportTotalCost } = params;
    let { totalCost, completedCount } = params;
    try {
      ({ totalCost, completedCount } = await this.runPostTier1Tier2({
        dealId,
        onProgress,
        init,
        enrichedContext,
        verificationContext,
        allFindings,
        totalCost,
        completedCount,
        reportTotalCost: (c) => {
          totalCost = c;
        },
      }));

      return await this.runPostTier1RestAfterTier2Sector({
        dealId,
        onProgress,
        init,
        enrichedContext,
        totalCost,
        completedCount,
        reportTotalCost: (c) => {
          totalCost = c;
        },
      });
    } finally {
      reportTotalCost(totalCost);
    }
  }

  /**
   * d-5 — « TIER2 » post-Tier1, extrait BYTE-INERT de runPostTier1RestAfterTier3Pre. Sector expert
   * (Tier 2) suivi du consensus/reflexion post-Tier2 FOLDÉS ensemble (~70s + reflexion conditionnelle
   * < 300s — gate Codex #11, vs grouper consensus+post-batch ~400s). Mute allResults par RÉFÉRENCE
   * (applyReflexion remplace le sector result). PARTAGÉ par le chemin single-pass
   * (runPostTier1RestAfterTier3Pre) ET le driver stepwise v3 (step durable `tier2-sector`, d-5).
   * DEUX leaves muteurs de coût SÉQUENTIELS (sector PUIS consensus) → `finally`/reportTotalCost
   * OBLIGATOIRE (gate Codex #11) : si consensus throw APRÈS le succès de sector, le coût sectoriel
   * doit remonter au scope appelant (sinon byte-divergence sur le chemin d'exception). Pattern d-2b-1.
   */
  private async runPostTier1Tier2(params: {
    dealId: string;
    onProgress: AnalysisOptions["onProgress"];
    init: FullAnalysisRunInit;
    enrichedContext: EnrichedAgentContext;
    verificationContext: VerificationContext;
    allFindings: ScoredFinding[];
    totalCost: number;
    completedCount: number;
    reportTotalCost: (totalCost: number) => void;
  }): Promise<{ totalCost: number; completedCount: number }> {
    const { dealId, onProgress, init, enrichedContext, verificationContext, allFindings, reportTotalCost } = params;
    const { sectorExpert, TOTAL_AGENTS, analysis, stateMachine, allResults, stepwise, startTime } = init;
    let { totalCost, completedCount } = params;
    try {
      ({ totalCost, completedCount } = await this.runTier2SectorStep({
        sectorExpert,
        totalCost,
        completedCount,
        enrichedContext,
        allResults,
        stateMachine,
        analysis,
        dealId,
        onProgress,
        TOTAL_AGENTS,
      }));

      ({ totalCost } = await this.runTier2ConsensusReflexionStep({
        stepwise,
        sectorExpert,
        allResults,
        allFindings,
        verificationContext,
        enrichedContext,
        totalCost,
        analysis,
        startTime,
      }));

      return { totalCost, completedCount };
    } finally {
      reportTotalCost(totalCost);
    }
  }

  /**
   * d-5 / d-6 — « REST APRÈS TIER2-SECTOR » post-Tier1. Délègue à `runPostTier1Tier3Post` (batch Tier3
   * après Tier2, TOUS les batches en single-pass) puis `runFinalCompletion` (terminal). Le split permet
   * au driver v3 de peeler `tier3-post` PER-AGENT (un step par batch, gate Codex #11) tout en gardant la
   * chaîne comme source d'ordre du chemin OFF. Le `finally` remonte le totalCost — byte-équiv coût.
   */
  private async runPostTier1RestAfterTier2Sector(params: {
    dealId: string;
    onProgress: AnalysisOptions["onProgress"];
    init: FullAnalysisRunInit;
    enrichedContext: EnrichedAgentContext;
    totalCost: number;
    completedCount: number;
    reportTotalCost: (totalCost: number) => void;
  }): Promise<AnalysisResult> {
    const { dealId, onProgress, init, enrichedContext, reportTotalCost } = params;
    const {
      isUpdate,
      analysisModeOverride,
      startTime,
      collectedWarnings,
      analysis,
      stateMachine,
      allResults,
      stepwise,
    } = init;
    let { totalCost, completedCount } = params;
    try {
      ({ totalCost, completedCount } = await this.runPostTier1Tier3Post({
        dealId,
        onProgress,
        init,
        enrichedContext,
        totalCost,
        completedCount,
        batches: TIER3_BATCHES_AFTER_TIER2,
      }));

      return await this.runFinalCompletion({
        stepwise,
        allResults,
        totalCost,
        stateMachine,
        analysis,
        dealId,
        startTime,
        analysisModeOverride,
        isUpdate,
        collectedWarnings,
      });
    } finally {
      reportTotalCost(totalCost);
    }
  }

  /**
   * d-6 — « TIER3-POST » post-Tier1, extrait BYTE-INERT de runPostTier1RestAfterTier2Sector. Batch
   * Tier3 après Tier2 (thesis-reconciler → synthesis-deal-scorer → memo-generator, SÉQUENTIELS).
   * tier3AgentMap re-dérivé via getTier3Agents() (pur + module-cached → mêmes instances que tier3-pre ;
   * byte-safe ; jamais porté entre steps). `batches` paramétrable : le driver stepwise v3 passe UN batch
   * par step (`tier3-post-{i}` per-agent, gate Codex #11 — la somme séquentielle ~280-310s risquait
   * > 300s). PARTAGÉ par le chemin single-pass (runPostTier1RestAfterTier2Sector, tous les batches) ET le
   * driver stepwise v3 (un batch par step). Mute allResults/enrichedContext.previousResults par RÉFÉRENCE.
   * Un seul leaf muteur de coût (runTier3PostTier2Batch) → pas de finally/reportTotalCost interne.
   */
  private async runPostTier1Tier3Post(params: {
    dealId: string;
    onProgress: AnalysisOptions["onProgress"];
    init: FullAnalysisRunInit;
    enrichedContext: EnrichedAgentContext;
    totalCost: number;
    completedCount: number;
    batches: readonly (readonly string[])[];
  }): Promise<{ totalCost: number; completedCount: number }> {
    const { dealId, onProgress, init, enrichedContext, totalCost, completedCount, batches } = params;
    const { maxCostUsd, TOTAL_AGENTS, analysis, stateMachine, allResults } = init;

    const tier3AgentMap = await getTier3Agents();

    return await this.runTier3PostTier2Batch({
      maxCostUsd,
      totalCost,
      completedCount,
      tier3AgentMap,
      enrichedContext,
      allResults,
      stateMachine,
      analysis,
      dealId,
      onProgress,
      TOTAL_AGENTS,
      batches,
    });
  }

  /**
   * d-2b — Chemin DURABLE de full_analysis (graphe stepwise v2). Découpe l'exécution en
   * unités step.run mémoïsées : tier0-facts (step de SORTIE, FactEvent isolé) -> tier0-thesis
   * (1er SNAPSHOT) -> rest (terminal transitoire = le RESTE du pipeline ; vrai split d-3..d-7).
   * MODÈLE B : sur run sain les unités tournent en séquence in-process (mutent l'état vivant),
   * AUCUN rehydrate -> résultat === single-pass (E1 structurel). Au REPLAY (Inngest re-déroule
   * du haut), les unités complétées sont mémoïsées ; le 1er step à snapshot (tier0-thesis)
   * déclenche le REHYDRATE UNIQUE (état reconstruit depuis le snapshot durable). tier0-facts
   * est un step de SORTIE (lock Codex #2) : au memo hit on APPLIQUE son DTO, on ne lit PAS le
   * snapshot. Réutilise les MÊMES helpers que runFullAnalysisPipeline (runFullAnalysisPostThesis,
   * failFullAnalysis) -> aucun drift de séquence. OFF (flag/version) ne passe JAMAIS ici (routing
   * d-2b-5 : ce chemin n'est atteint qu'en stepwise + stepwiseGraphVersion===2).
   */
  private async runFullAnalysisStepwise(
    deal: DealWithDocs,
    dealId: string,
    onProgress: AnalysisOptions["onProgress"],
    init: FullAnalysisRunInit,
    stepRunner: StepRunner
  ): Promise<AnalysisResult> {
    const {
      isUpdate,
      enableTrace,
      analysisModeOverride,
      startTime,
      collectedWarnings,
      initialCanonicalDeal,
      sectorExpert,
      TOTAL_AGENTS,
      corpusSnapshot,
      scopedDocuments,
      analysis,
      stateMachine,
      allResults,
      stepwise,
    } = init;
    let { totalCost, completedCount, factStore, factStoreFormatted, founderResponses } = init;

    // État vivant traversant les unités (construit en run sain, REHYDRATÉ au replay).
    let enrichedContext: EnrichedAgentContext | undefined;
    let extractedData: ContextSeed = {};
    let thesisOutput: ThesisExtractorOutput | null = null;

    try {
      // Bootstrap-in-graph : stateMachine.start() tourne TOUJOURS (idempotent au replay ; la
      // state machine est créée hors step, non sérialisable). Non mémoïsé.
      await stateMachine.start();

      // ===== UNITÉ 1 : tier0-facts (step de SORTIE — lock Codex #2/#3) =====
      // FactEvent isolé dans sa propre unité durable. Au memo hit on APPLIQUE le DTO retourné
      // (toute la mutation de runTier0Step), on NE lit PAS readLatestStepwiseSnapshot.
      const tier0FactsWire = await stepRunner.run("tier0-facts", () =>
        runWithLLMContext({ analysisId: analysis.id }, async () => {
          const r = await this.runTier0Step({
            deal,
            scopedDocuments,
            isUpdate,
            onProgress,
            allResults,
            totalCost,
            completedCount,
            factStore,
            factStoreFormatted,
            founderResponses,
            analysisId: analysis.id,
          });
          return buildTier0FactsWire({
            totalCost: r.totalCost,
            completedCount: r.completedCount,
            factStore: r.factStore,
            factStoreFormatted: r.factStoreFormatted,
            founderResponses: r.founderResponses,
            factExtractorResult: allResults["fact-extractor"],
          });
        })
      );
      {
        const applied = applyTier0FactsWire(tier0FactsWire);
        totalCost = applied.totalCost;
        completedCount = applied.completedCount;
        factStore = applied.factStore as CurrentFact[];
        factStoreFormatted = applied.factStoreFormatted;
        founderResponses = applied.founderResponses as typeof founderResponses;
        if (applied.factExtractorResult !== null) {
          allResults["fact-extractor"] = applied.factExtractorResult as unknown as AgentResult;
        }
      }

      // ===== UNITÉ 2 : tier0-thesis (doc-extractor + deck + context + thèse ; 1er SNAPSHOT) =====
      let tier0ThesisBodyRan = false;
      await stepRunner.run("tier0-thesis", () =>
        runWithLLMContext({ analysisId: analysis.id }, async () => {
          tier0ThesisBodyRan = true;
          const baseContext = await this.buildBaseAnalysisContext({
            dealId,
            initialCanonicalDeal,
            analysis,
            analysisModeOverride,
            corpusSnapshot,
            scopedDocuments,
          });
          ({ totalCost, completedCount, extractedData } = await this.runDocumentExtractorStep({
            baseContext,
            scopedDocuments,
            onProgress,
            analysis,
            stateMachine,
            allResults,
            totalCost,
            completedCount,
            TOTAL_AGENTS,
          }));
          let deckCoherenceReport: DeckCoherenceReport | null;
          ({ totalCost, deckCoherenceReport } = await this.runDeckCoherenceStep({
            deal,
            scopedDocuments,
            extractedData,
            onProgress,
            allResults,
            totalCost,
          }));
          const ctxResult = await this.runContextEngineStep({
            deal,
            dealId,
            baseContext,
            stateMachine,
            extractedData,
            analysis,
            corpusSnapshot,
            deckCoherenceReport,
            founderResponses,
            onProgress,
            completedCount,
            TOTAL_AGENTS,
            factStore,
            factStoreFormatted,
          });
          factStore = ctxResult.factStore;
          factStoreFormatted = ctxResult.factStoreFormatted;
          const ec = ctxResult.enrichedContext;
          enrichedContext = ec;
          ({ totalCost, completedCount, thesisOutput } = await this.runThesisExtractionStep({
            dealId,
            analysisModeOverride,
            analysis,
            enrichedContext: ec,
            corpusSnapshot,
            allResults,
            enableTrace,
            totalCost,
            completedCount,
          }));
          // 1er SNAPSHOT durable (frontière tier0-thesis) — capture l'état complet.
          await writeStepwiseSnapshot(
            buildStepState({
              analysisId: analysis.id,
              dealId,
              analysisType: "full_analysis",
              totalAgents: TOTAL_AGENTS,
              completedCount,
              totalCost,
              startTimeMs: startTime,
              transitionCount: stateMachine.getTransitionCount(),
              lastUnit: "tier0-thesis",
              done: false,
              enrichedContext: ec,
              allResults,
              verificationContext: null,
              collectedWarnings,
              tier1Findings: [],
              allValidations: [],
              needsReflect: [],
            })
          );
          return { unit: "tier0-thesis" as const };
        })
      );

      if (!tier0ThesisBodyRan) {
        // memo hit sur tier0-thesis (1er step à snapshot) → REHYDRATE UNIQUE (lock Codex #2).
        const snap = await readLatestStepwiseSnapshot(analysis.id);
        if (!snap) {
          throw new Error("[stepwise] tier0-thesis mémoïsé sans snapshot durable (état incohérent)");
        }
        const rh = rehydrateContext(snap);
        enrichedContext = rh.enrichedContext;
        // Remplace allResults EN PLACE (réf partagée, lue par runFullAnalysisPostThesis via init).
        for (const k of Object.keys(allResults)) delete allResults[k];
        Object.assign(allResults, rh.allResults);
        totalCost = rh.totalCost;
        completedCount = rh.completedCount;
        factStore = (enrichedContext.factStore ?? []) as CurrentFact[];
        factStoreFormatted = enrichedContext.factStoreFormatted ?? "";
        founderResponses = (enrichedContext.founderResponses ?? []) as typeof founderResponses;
        // extractedData : enrichedContext.extractedData EST le ContextSeed (toExtractedContextData
        // = cast). undefined → {} (cas seed vide ; hasContextSeed-false-non-vide = résiduel D.6).
        extractedData = (enrichedContext.extractedData ?? {}) as unknown as ContextSeed;
        stateMachine.restoreFromStepState(snap, { sectorExpertName: sectorExpert?.name ?? null });
      }

      if (!enrichedContext) {
        throw new Error("[stepwise] enrichedContext absent après tier0-thesis (état incohérent)");
      }

      // ===== UNITÉ 3 : rest (terminal transitoire, stepId dédié) =====
      // Le RESTE du pipeline post-thèse dans une unité durable terminale (Modèle B : run sain →
      // liveResult exact ; replay de 'rest' → reconstruction enveloppe + results relus). Le vrai
      // split par unité (tier1 / tier3-pre / tier2 / tier3-post) vient d-3..d-7.
      const restEnrichedContext = enrichedContext;
      return await runTerminalStepwiseDriver({
        stepRunner,
        stepwise,
        stepId: "rest",
        pipeline: () =>
          this.runFullAnalysisPostThesis({
            deal,
            dealId,
            onProgress,
            init,
            enrichedContext: restEnrichedContext,
            extractedData,
            thesisOutput,
            totalCost,
            completedCount,
            factStore,
            factStoreFormatted,
            reportTotalCost: (c: number) => {
              totalCost = c;
            },
          }),
        loadPersistedResults: async () =>
          (await loadResults(analysis.id)) as AnalysisResult["results"] | null,
      });
    } catch (error) {
      return await this.failFullAnalysis(error, {
        stateMachine,
        analysis,
        dealId,
        totalCost,
        allResults,
        analysisModeOverride,
        startTime,
        collectedWarnings,
      });
    }
  }

  /**
   * d-3 (d-3-5) — Chemin DURABLE v3/v4 de full_analysis. Étend v2 en découpant Tier1 PER-PHASE en
   * steps durables (lock Codex Option 1, budget 300s) : prologue tier0-facts (step de SORTIE) -> tier0
   * SELON `tier0Split` [v3 (graphVersion=3, FROZEN) : 1 step `tier0-thesis` (doc+deck+context+thèse, 1er
   * SNAPSHOT) ; v4 (graphVersion=4) : `tier0-pre-context` (doc+deck+context, 1er SNAPSHOT) + `tier0-thesis-
   * extractor` (thèse ~280s peelée, gate Codex Option B)] -> pour CHAQUE phase A/B/C/D : step
   * `tier1-{ph}-agents` (snapshot) -> 1 step `tier1-{ph}-reflexion-{i}` par agent low-conf (snapshot)
   * -> step `tier1-{ph}-finalize` (snapshot) -> tail finalizeTier1Phases -> step `post-tier1-glue`
   * (d-3-6, runPostTier1Glue ; snapshot not-done ; early-return = throw -> FAILED) -> terminal
   * transitoire `post-tier1` (runPostTier1Rest ; vrai split d-4..d-7).
   *
   * MODÈLE B : sur run sain les sous-steps tournent en séquence in-process via les MÊMES
   * sous-méthodes partagées (runTier1PhaseAgents/Reflexion/Finalize) que le single-pass -> E1
   * structurel. Au REPLAY, le 1er step à snapshot mémoïsé (tier0-thesis en v3 ; tier0-pre-context en v4)
   * déclenche le REHYDRATE UNIQUE (`ensureRehydrated`, lit le snapshot le PLUS RÉCENT — potentiellement tier1 profond) ;
   * ensuite RÈGLE PAR STEP : bodyRan=true -> applique tous les champs du résultat ; bodyRan=false ->
   * ensureRehydrated (no-op après le 1er) + transients de phase (needsReflect) depuis le wire
   * mémoïsé, cumulatif depuis le snapshot rehydraté (jamais la valeur stale du wire). phaseFindings
   * re-dérivé d'allFindings (byte-safe : 1 agent = 1 phase, reflexion ne mute pas allFindings).
   *
   * Corrections gate Codex #9 : (F1) vc initial construit SEULEMENT si `verificationContext == null`
   * (les snapshots tier0 [tier0-thesis en v3 ; tier0-pre-context/tier0-thesis-extractor en v4] portent vc=null
   * -> rebuild au replay-après-tier0 ; CARRY dès qu'un snapshot tier1 porte un vc non-null). (F2) `stateMachine.startAnalysis()` DANS le body
   * frais de `tier1-a-agents` (mémoïsé-une-fois) -> jamais rejoué hors step au replay. (F3) totalCost/
   * completedCount GLOBAUX threadés + `initialTotalCost=0` aux sous-méthodes (progress byte-identique)
   * + shim phasesResult `costIncurred:0`/`completedInPhases:0` -> pas de double-add à l'aggregation.
   *
   * ROUTÉ par runFullAnalysis pour graphVersion 3 (tier0Split=false) ET 4 (tier0Split=true) ; byte-inert
   * en prod si DEEP_DIVE_STEPWISE OFF → runFullAnalysisPipeline. d-4..d-7 ont raffiné le rest (terminal
   * post-tier1) EN PLACE (flag OFF) ; le split tier0 (v4) a EXIGÉ un bump de version (flag ON, runs v3 en vol).
   */
  private async runFullAnalysisStepwiseV3(
    deal: DealWithDocs,
    dealId: string,
    onProgress: AnalysisOptions["onProgress"],
    init: FullAnalysisRunInit,
    stepRunner: StepRunner,
    /** graphVersion>=4 → split tier0-thesis en tier0-pre-context + tier0-thesis-extractor (sticky cross-deploy). */
    tier0Split: boolean,
  ): Promise<AnalysisResult> {
    const {
      isUpdate,
      enableTrace,
      analysisModeOverride,
      startTime,
      collectedWarnings,
      initialCanonicalDeal,
      sectorExpert,
      TOTAL_AGENTS,
      corpusSnapshot,
      scopedDocuments,
      analysis,
      stateMachine,
      allResults,
      stepwise,
    } = init;
    let { totalCost, completedCount, factStore, factStoreFormatted, founderResponses } = init;
    // graphVersion>=4. Gate aussi le split per-agent du batch tier3-pré (le bloc tier0 garde
    // `tier0Split` brut pour ne pas élargir son diff — même valeur, lisibilité locale).
    const isV4 = tier0Split;

    // État vivant traversant les unités (construit en run sain, REHYDRATÉ au replay).
    let enrichedContext: EnrichedAgentContext | undefined;
    let extractedData: ContextSeed = {};
    let thesisOutput: ThesisExtractorOutput | null = null;
    // Accumulateurs Tier1 (carry v4). null/[] avant Tier1 ; peuplés par ensureRehydrated au replay.
    let verificationContext: VerificationContext | null = null;
    let allFindings: ScoredFinding[] = [];
    let allValidations: import("@/services/fact-store/current-facts").AgentFactValidation[] = [];

    // REHYDRATE UNIQUE (généralisé) — déclenché au 1er memo-hit d'un step à snapshot (tier0-thesis en v3 ;
    // tier0-pre-context / tier0-thesis-extractor en v4 ; ou tier1-*). Lit le snapshot le PLUS RÉCENT et
    // reconstruit TOUT le cumulatif. Idempotent.
    let rehydrated = false;
    const ensureRehydrated = async (): Promise<void> => {
      if (rehydrated) return;
      const snap = await readLatestStepwiseSnapshot(analysis.id);
      if (!snap) {
        throw new Error("[stepwise v3] step mémoïsé sans snapshot durable (état incohérent)");
      }
      const rh = rehydrateContext(snap);
      enrichedContext = rh.enrichedContext;
      // allResults remplacé EN PLACE (réf partagée, lue par runFullAnalysisPostTier1 via init).
      for (const k of Object.keys(allResults)) delete allResults[k];
      Object.assign(allResults, rh.allResults);
      totalCost = rh.totalCost;
      completedCount = rh.completedCount;
      factStore = (enrichedContext.factStore ?? []) as CurrentFact[];
      factStoreFormatted = enrichedContext.factStoreFormatted ?? "";
      founderResponses = (enrichedContext.founderResponses ?? []) as typeof founderResponses;
      extractedData = (enrichedContext.extractedData ?? {}) as unknown as ContextSeed;
      verificationContext = rh.verificationContext as VerificationContext | null;
      allFindings = rh.tier1Findings as ScoredFinding[];
      allValidations = rh.allValidations as typeof allValidations;
      // collectedWarnings muté EN PLACE (réf partagée via init, lue par le tail post-Tier1).
      collectedWarnings.length = 0;
      collectedWarnings.push(...(rh.collectedWarnings as EarlyWarning[]));
      stateMachine.restoreFromStepState(snap, { sectorExpertName: sectorExpert?.name ?? null });
      rehydrated = true;
    };

    try {
      await stateMachine.start();

      // ===== UNITÉ 1 : tier0-facts (step de SORTIE — identique v2) =====
      const tier0FactsWire = await stepRunner.run("tier0-facts", () =>
        runWithLLMContext({ analysisId: analysis.id }, async () => {
          const r = await this.runTier0Step({
            deal, scopedDocuments, isUpdate, onProgress, allResults,
            totalCost, completedCount, factStore, factStoreFormatted, founderResponses,
            analysisId: analysis.id,
          });
          return buildTier0FactsWire({
            totalCost: r.totalCost, completedCount: r.completedCount, factStore: r.factStore,
            factStoreFormatted: r.factStoreFormatted, founderResponses: r.founderResponses,
            factExtractorResult: allResults["fact-extractor"],
          });
        })
      );
      {
        const applied = applyTier0FactsWire(tier0FactsWire);
        totalCost = applied.totalCost;
        completedCount = applied.completedCount;
        factStore = applied.factStore as CurrentFact[];
        factStoreFormatted = applied.factStoreFormatted;
        founderResponses = applied.founderResponses as typeof founderResponses;
        if (applied.factExtractorResult !== null) {
          allResults["fact-extractor"] = applied.factExtractorResult as unknown as AgentResult;
        }
      }

      // ===== UNITÉ 2(+3) : tier0 — graphe SELON LA VERSION (sticky cross-deploy, lock Codex). `tier0Split`
      // (graphVersion>=4, routé par runFullAnalysis) discrimine : v3 (FROZEN, in-flight) = 1 step durable
      // `tier0-thesis` (doc-extractor + deck + context + thèse) ; v4 = split en `tier0-pre-context` (1er
      // SNAPSHOT) + `tier0-thesis-extractor` (thèse ~280s peelée, gate Codex Option B). Le split NE CHANGE
      // PAS l'état post-tier0 (E1 byte-équiv) : il ajoute une frontière durable APRÈS le 1er snapshot pour
      // isoler le thesis-extractor SANS re-charger l'evidence (evidenceToday=new Date() wall-clock,
      // loadEvidenceContextSafe + 2e charge runDeckCoherenceCheck → chargée 1× dans le step pré-thèse).
      // Un run en vol v3 garde SES step IDs (pas de mismatch au replay cross-deploy → pas de rerun
      // doc/deck/context ni de régression de snapshot). enrichedContext garanti non-null après chaque branche. =====
      if (tier0Split) {
        // ----- v4 : tier0-pre-context (1er SNAPSHOT — doc-extractor + deck + context-engine, SANS thèse) -----
        let tier0PreContextBodyRan = false;
        await stepRunner.run("tier0-pre-context", () =>
          runWithLLMContext({ analysisId: analysis.id }, async () => {
            tier0PreContextBodyRan = true;
            const baseContext = await this.buildBaseAnalysisContext({
              dealId, initialCanonicalDeal, analysis, analysisModeOverride, corpusSnapshot, scopedDocuments,
            });
            ({ totalCost, completedCount, extractedData } = await this.runDocumentExtractorStep({
              baseContext, scopedDocuments, onProgress, analysis, stateMachine, allResults,
              totalCost, completedCount, TOTAL_AGENTS,
            }));
            let deckCoherenceReport: DeckCoherenceReport | null;
            ({ totalCost, deckCoherenceReport } = await this.runDeckCoherenceStep({
              deal, scopedDocuments, extractedData, onProgress, allResults, totalCost,
            }));
            const ctxResult = await this.runContextEngineStep({
              deal, dealId, baseContext, stateMachine, extractedData, analysis, corpusSnapshot,
              deckCoherenceReport, founderResponses, onProgress, completedCount, TOTAL_AGENTS,
              factStore, factStoreFormatted,
            });
            factStore = ctxResult.factStore;
            factStoreFormatted = ctxResult.factStoreFormatted;
            const ec = ctxResult.enrichedContext;
            enrichedContext = ec;
            await writeStepwiseSnapshot(
              buildStepState({
                analysisId: analysis.id, dealId, analysisType: "full_analysis", totalAgents: TOTAL_AGENTS,
                completedCount, totalCost, startTimeMs: startTime,
                transitionCount: stateMachine.getTransitionCount(), lastUnit: "tier0-pre-context", done: false,
                enrichedContext: ec, allResults, verificationContext: null, collectedWarnings,
                tier1Findings: [], allValidations: [], needsReflect: [],
              })
            );
            return { unit: "tier0-pre-context" as const };
          })
        );
        if (!tier0PreContextBodyRan) {
          await ensureRehydrated();
        }
        if (!enrichedContext) {
          throw new Error("[stepwise v4] enrichedContext absent après tier0-pre-context (état incohérent)");
        }

        // ----- v4 : tier0-thesis-extractor (SNAPSHOT — thèse peelée, ~280s). Mute enrichedContext.analysis
        // + allResults["thesis-extractor"] + totalCost/completedCount. `thesisOutput` set-but-unused
        // (stopAfterThesis routé single-pass, gate d-2b-4) → null au replay sans impact. -----
        let tier0ThesisBodyRan = false;
        await stepRunner.run("tier0-thesis-extractor", () =>
          runWithLLMContext({ analysisId: analysis.id }, async () => {
            tier0ThesisBodyRan = true;
            const ec = enrichedContext!;
            ({ totalCost, completedCount, thesisOutput } = await this.runThesisExtractionStep({
              dealId, analysisModeOverride, analysis, enrichedContext: ec, corpusSnapshot,
              allResults, enableTrace, totalCost, completedCount,
            }));
            await writeStepwiseSnapshot(
              buildStepState({
                analysisId: analysis.id, dealId, analysisType: "full_analysis", totalAgents: TOTAL_AGENTS,
                completedCount, totalCost, startTimeMs: startTime,
                transitionCount: stateMachine.getTransitionCount(), lastUnit: "tier0-thesis-extractor", done: false,
                enrichedContext: ec, allResults, verificationContext: null, collectedWarnings,
                tier1Findings: [], allValidations: [], needsReflect: [],
              })
            );
            return { unit: "tier0-thesis-extractor" as const };
          })
        );
        if (!tier0ThesisBodyRan) {
          await ensureRehydrated();
        }
      } else {
        // ----- v3 (FROZEN, in-flight compat) : tier0-thesis (1er SNAPSHOT — doc + deck + context + thèse) -----
        let tier0ThesisBodyRan = false;
        await stepRunner.run("tier0-thesis", () =>
          runWithLLMContext({ analysisId: analysis.id }, async () => {
            tier0ThesisBodyRan = true;
            const baseContext = await this.buildBaseAnalysisContext({
              dealId, initialCanonicalDeal, analysis, analysisModeOverride, corpusSnapshot, scopedDocuments,
            });
            ({ totalCost, completedCount, extractedData } = await this.runDocumentExtractorStep({
              baseContext, scopedDocuments, onProgress, analysis, stateMachine, allResults,
              totalCost, completedCount, TOTAL_AGENTS,
            }));
            let deckCoherenceReport: DeckCoherenceReport | null;
            ({ totalCost, deckCoherenceReport } = await this.runDeckCoherenceStep({
              deal, scopedDocuments, extractedData, onProgress, allResults, totalCost,
            }));
            const ctxResult = await this.runContextEngineStep({
              deal, dealId, baseContext, stateMachine, extractedData, analysis, corpusSnapshot,
              deckCoherenceReport, founderResponses, onProgress, completedCount, TOTAL_AGENTS,
              factStore, factStoreFormatted,
            });
            factStore = ctxResult.factStore;
            factStoreFormatted = ctxResult.factStoreFormatted;
            const ec = ctxResult.enrichedContext;
            enrichedContext = ec;
            ({ totalCost, completedCount, thesisOutput } = await this.runThesisExtractionStep({
              dealId, analysisModeOverride, analysis, enrichedContext: ec, corpusSnapshot,
              allResults, enableTrace, totalCost, completedCount,
            }));
            await writeStepwiseSnapshot(
              buildStepState({
                analysisId: analysis.id, dealId, analysisType: "full_analysis", totalAgents: TOTAL_AGENTS,
                completedCount, totalCost, startTimeMs: startTime,
                transitionCount: stateMachine.getTransitionCount(), lastUnit: "tier0-thesis", done: false,
                enrichedContext: ec, allResults, verificationContext: null, collectedWarnings,
                tier1Findings: [], allValidations: [], needsReflect: [],
              })
            );
            return { unit: "tier0-thesis" as const };
          })
        );
        if (!tier0ThesisBodyRan) {
          await ensureRehydrated();
        }
        if (!enrichedContext) {
          throw new Error("[stepwise v3] enrichedContext absent après tier0-thesis (état incohérent)");
        }
      }

      // ===== TIER1 STEPWISE (per-phase) =====
      // vc initial : construit SEULEMENT si non porté (F1 — garde funding-DB drift).
      if (verificationContext == null) {
        verificationContext = await this.buildVerificationContext(
          enrichedContext, extractedData, factStoreFormatted, enrichedContext.deal,
        );
      }

      // getTier1Agents : inconditionnel (pur, sans transition) ; nécessaire aux steps agents frais.
      const tier1AgentMap = await getTier1Agents();

      const tier1Phases: Array<{ name: string; agents: readonly string[]; unit: FullAnalysisUnit; key: string; first: boolean }> = [
        { name: "Phase A: deck-forensics", agents: TIER1_PHASE_A, unit: "tier1-phase-a", key: "a", first: true },
        { name: "Phase B: financial-auditor", agents: TIER1_PHASE_B, unit: "tier1-phase-b", key: "b", first: false },
        { name: "Phase C: team + competitive + market", agents: TIER1_PHASE_C, unit: "tier1-phase-c", key: "c", first: false },
        { name: "Phase D: remaining agents", agents: TIER1_PHASE_D, unit: "tier1-phase-d", key: "d", first: false },
      ];

      for (const phase of tier1Phases) {
        // --- STEP tier1-{ph}-agents (snapshot + step de SORTIE pour needsReflect) ---
        let agentsBodyRan = false;
        const agentsWire = await stepRunner.run(`tier1-${phase.key}-agents`, () =>
          runWithLLMContext({ analysisId: analysis.id }, async () => {
            agentsBodyRan = true;
            // F2 : pré-effets Tier1 (no-op persistTierCheckpoint + transition startAnalysis) DANS le
            // body frais de tier1-a-agents — mémoïsé-une-fois, jamais rejoué hors step au replay.
            if (phase.first) {
              await this.persistTierCheckpoint(analysis.id, allResults, totalCost, startTime, stepwise);
              await stateMachine.startAnalysis();
            }
            const ec = enrichedContext!;
            const r = await this.runTier1PhaseAgents(
              phase,
              {
                enrichedContext: ec, tier1AgentMap, dealId, onProgress, totalAgents: TOTAL_AGENTS,
                onEarlyWarning: init.onEarlyWarning, collectedWarnings, allResults, allFindings,
                stateMachine, initialTotalCost: 0,
              },
              { totalCost, completedCount },
            );
            await writeStepwiseSnapshot(
              buildStepState({
                analysisId: analysis.id, dealId, analysisType: "full_analysis", totalAgents: TOTAL_AGENTS,
                completedCount: r.completedCount, totalCost: r.totalCost, startTimeMs: startTime,
                transitionCount: stateMachine.getTransitionCount(), lastUnit: phase.unit, done: false,
                enrichedContext: ec, allResults,
                verificationContext: verificationContext as Record<string, unknown> | null,
                collectedWarnings, tier1Findings: allFindings, allValidations, needsReflect: r.needsReflect,
              })
            );
            return { totalCost: r.totalCost, completedCount: r.completedCount, needsReflect: r.needsReflect };
          })
        );
        if (!agentsBodyRan) await ensureRehydrated();
        const needsReflect = agentsWire.needsReflect;
        if (agentsBodyRan) {
          totalCost = agentsWire.totalCost;
          completedCount = agentsWire.completedCount;
        }
        // phaseFindings re-dérivé d'allFindings (byte-safe ; === r.phaseFindings, mêmes objets Inline).
        const phaseFindings = allFindings.filter((f) => phase.agents.includes(f.agentName));

        // --- STEPS tier1-{ph}-reflexion-{i} (1 par agent low-conf, snapshot) ---
        for (let i = 0; i < needsReflect.length; i++) {
          const agentName = needsReflect[i];
          let reflexBodyRan = false;
          const reflexWire = await stepRunner.run(`tier1-${phase.key}-reflexion-${i}`, () =>
            runWithLLMContext({ analysisId: analysis.id }, async () => {
              reflexBodyRan = true;
              const ec = enrichedContext!;
              const r = await this.runTier1PhaseReflexion(
                [agentName],
                { analysisId: analysis.id, enrichedContext: ec, allResults, allFindings, verificationContext: verificationContext! },
                { totalCost },
              );
              await writeStepwiseSnapshot(
                buildStepState({
                  analysisId: analysis.id, dealId, analysisType: "full_analysis", totalAgents: TOTAL_AGENTS,
                  completedCount, totalCost: r.totalCost, startTimeMs: startTime,
                  transitionCount: stateMachine.getTransitionCount(), lastUnit: phase.unit, done: false,
                  enrichedContext: ec, allResults,
                  verificationContext: verificationContext as Record<string, unknown> | null,
                  collectedWarnings, tier1Findings: allFindings, allValidations, needsReflect,
                })
              );
              return { totalCost: r.totalCost };
            })
          );
          if (!reflexBodyRan) await ensureRehydrated();
          if (reflexBodyRan) totalCost = reflexWire.totalCost;
        }

        // --- STEP tier1-{ph}-finalize (snapshot) ---
        let finalizeBodyRan = false;
        let capturedFactStore: CurrentFact[] | undefined;
        let capturedFactStoreFormatted: string | undefined;
        let capturedVc: VerificationContext | undefined;
        const finalizeWire = await stepRunner.run(`tier1-${phase.key}-finalize`, () =>
          runWithLLMContext({ analysisId: analysis.id }, async () => {
            finalizeBodyRan = true;
            const ec = enrichedContext!;
            const r = await this.runTier1PhaseFinalize(
              phase,
              phaseFindings,
              {
                enrichedContext: ec, analysisId: analysis.id, extractedData, allResults, allValidations,
                stateMachine, initialTotalCost: 0, completedCount,
              },
              { totalCost, factStore, factStoreFormatted, verificationContext: verificationContext! },
            );
            capturedFactStore = r.factStore;
            capturedFactStoreFormatted = r.factStoreFormatted;
            capturedVc = r.verificationContext;
            await writeStepwiseSnapshot(
              buildStepState({
                analysisId: analysis.id, dealId, analysisType: "full_analysis", totalAgents: TOTAL_AGENTS,
                completedCount, totalCost: r.totalCost, startTimeMs: startTime,
                transitionCount: stateMachine.getTransitionCount(), lastUnit: phase.unit, done: false,
                enrichedContext: ec, allResults,
                verificationContext: r.verificationContext as Record<string, unknown> | null,
                collectedWarnings, tier1Findings: allFindings, allValidations, needsReflect,
              })
            );
            return { totalCost: r.totalCost };
          })
        );
        if (!finalizeBodyRan) await ensureRehydrated();
        if (finalizeBodyRan) {
          totalCost = finalizeWire.totalCost;
          factStore = capturedFactStore!;
          factStoreFormatted = capturedFactStoreFormatted!;
          verificationContext = capturedVc!;
        }
      }

      // ===== TIER1 TAIL (R2) + shim phasesResult (coût-neutre, F3) =====
      const { agentConfidences, lowConfidenceAgents } = await this.finalizeTier1Phases({
        dealId, analysisId: analysis.id, allValidations, allResults,
      });
      const phasesResult: Awaited<ReturnType<AgentOrchestrator["runTier1Phases"]>> = {
        allFindings,
        agentConfidences,
        lowConfidenceAgents,
        updatedFactStore: factStore,
        updatedFactStoreFormatted: factStoreFormatted,
        costIncurred: 0,
        completedInPhases: 0,
      };

      // ===== UNITÉ post-tier1-glue (d-3-6) — glue durable (aggregation→failFast→consensus→cost-limit
      // →cross-val→red-flags) en step propre. Run sain : mute l'état vivant (vc rebuild aggregation,
      // allFindings, allResults cross-val, enrichedContext tier1CrossValidation/consolidatedRedFlags)
      // + snapshot not-done → le terminal `post-tier1` rehydrate au replay-après-glue. done:true
      // (early-return failFast/cost-limit) est INJOIGNABLE au runtime — `stateMachine.complete()`
      // LÈVE depuis ANALYZING/DEBATING (gate Codex #10) → ces chemins THROWENT → catch terminal →
      // FAILED (byte-équiv single-pass). Run sain done → glueLiveResult ; replay-done → guard loud. =====
      let glueBodyRan = false;
      let glueLiveResult: AnalysisResult | undefined;
      const glueWire = await stepRunner.run("post-tier1-glue", () =>
        runWithLLMContext({ analysisId: analysis.id }, async () => {
          glueBodyRan = true;
          const ec = enrichedContext!;
          const glue = await this.runPostTier1Glue({
            dealId, onProgress, init, enrichedContext: ec, extractedData,
            phasesResult, totalCost, completedCount, factStore, factStoreFormatted,
            reportTotalCost: (c) => { totalCost = c; },
          });
          if (glue.done) {
            glueLiveResult = glue.result;
            return { done: true as const };
          }
          completedCount = glue.completedCount;
          verificationContext = glue.verificationContext;
          allFindings = glue.allFindings;
          await writeStepwiseSnapshot(
            buildStepState({
              analysisId: analysis.id, dealId, analysisType: "full_analysis", totalAgents: TOTAL_AGENTS,
              completedCount, totalCost, startTimeMs: startTime,
              transitionCount: stateMachine.getTransitionCount(), lastUnit: "post-tier1-glue", done: false,
              enrichedContext: ec, allResults,
              verificationContext: verificationContext as Record<string, unknown> | null,
              collectedWarnings, tier1Findings: allFindings, allValidations, needsReflect: [],
            })
          );
          return { done: false as const };
        })
      );
      if (glueWire.done) {
        // Run sain : glueLiveResult posé. Replay-done IMPOSSIBLE (un step qui throw n'est jamais
        // mémoïsé done:true). Guard loud si l'invariant casse (ex. transition complete() corrigée
        // plus tard sans ajouter ici le traversal terminalResult — gate Codex #10).
        if (!glueLiveResult) {
          throw new Error("[stepwise v3] post-tier1-glue done:true au replay non supporté (early-return termine par throw aujourd'hui)");
        }
        return glueLiveResult;
      }
      if (!glueBodyRan) await ensureRehydrated();

      // ===== UNITÉS tier3-pre — split SELON LA VERSION. v4 (isV4) : `tier3-setup` (startSynthesis +
      // DealTerms/Structure/BAPrefs ; map tier3 IGNORÉ, re-dérivé par chaque step via getTier3Agents)
      // PUIS 3 steps per-agent durables `tier3-pre-conditions/-contradiction/-devils`. DÉFÉRAL
      // previousResults : les 3 agents tournent contre la BASELINE post-glue (SANS les pairs — devils lit
      // previousResults["contradiction-detector"] via evidence-solidity) ; les 3 écritures PR sont DIFFÉRÉES
      // sur le step devils (applyDeferredPreTier2PreviousResults, ordre conditions→contradiction→devils).
      // Cost-gate : maxCostUsd JAMAIS set sur le chemin durable (route/inngest) → assertion loud (all-or-none
      // non déterministe au replay sinon, gate Codex). v3 (FROZEN) : step unique `tier3-pre` INCHANGÉ (compat
      // cross-deploy des runs en vol). Modèle B partout. Le flush intermédiaire du compteur vient du snapshot
      // (writeStepwiseSnapshot, updateMany conditionnel) → pas d'updateAnalysisProgress per-agent. =====
      if (isV4) {
        if (init.maxCostUsd !== undefined) {
          throw new Error("[stepwise v4] maxCostUsd non supporté sur le chemin durable (cost-gate tier3-pré all-or-none non déterministe au replay)");
        }
        // ----- tier3-setup (SNAPSHOT — startSynthesis + DealTerms/Structure/BAPrefs ; map ignoré) -----
        let tier3SetupBodyRan = false;
        await stepRunner.run("tier3-setup", () =>
          runWithLLMContext({ analysisId: analysis.id }, async () => {
            tier3SetupBodyRan = true;
            const ec = enrichedContext!;
            await this.runSynthesisSetupStep({ deal, dealId, stateMachine, enrichedContext: ec });
            await writeStepwiseSnapshot(
              buildStepState({
                analysisId: analysis.id, dealId, analysisType: "full_analysis", totalAgents: TOTAL_AGENTS,
                completedCount, totalCost, startTimeMs: startTime,
                transitionCount: stateMachine.getTransitionCount(), lastUnit: "tier3-setup", done: false,
                enrichedContext: ec, allResults,
                verificationContext: verificationContext as Record<string, unknown> | null,
                collectedWarnings, tier1Findings: allFindings, allValidations, needsReflect: [],
              })
            );
            return { unit: "tier3-setup" as const };
          })
        );
        if (!tier3SetupBodyRan) await ensureRehydrated();

        // ----- tier3-pre-{conditions,contradiction,devils} (1 agent/step ; collect SANS previousResults ;
        // devils = dernier : applyDeferred (3 PR) + updateAnalysisProgress + onProgress completed +
        // persistTierCheckpoint (no-op stepwise) AVANT le snapshot). -----
        const preTier2Steps = [
          { agentName: "conditions-analyst", unit: "tier3-pre-conditions" },
          { agentName: "contradiction-detector", unit: "tier3-pre-contradiction" },
          { agentName: "devils-advocate", unit: "tier3-pre-devils" },
        ] as const;
        for (let i = 0; i < preTier2Steps.length; i++) {
          const { agentName, unit } = preTier2Steps[i];
          const isLast = i === preTier2Steps.length - 1;
          let preBodyRan = false;
          const preWire = await stepRunner.run(unit, () =>
            runWithLLMContext({ analysisId: analysis.id }, async () => {
              preBodyRan = true;
              const ec = enrichedContext!;
              onProgress?.({
                currentAgent: agentName,
                completedAgents: completedCount,
                totalAgents: TOTAL_AGENTS,
                estimatedCostSoFar: totalCost,
              });
              const result = await this.runPreTier2Agent(agentName, ec);
              ({ totalCost, completedCount } = await this.collectPreTier2Result({
                agentName, result, allResults, totalCost, completedCount, stateMachine, dealId,
              }));
              if (isLast) {
                // Les 3 agents ont tourné contre la baseline → publication différée des previousResults.
                this.applyDeferredPreTier2PreviousResults(ec, allResults);
                await updateAnalysisProgress(analysis.id, completedCount, totalCost);
                onProgress?.({
                  currentAgent: `tier3-parallel completed`,
                  completedAgents: completedCount,
                  totalAgents: TOTAL_AGENTS,
                  estimatedCostSoFar: totalCost,
                });
                await this.persistTierCheckpoint(analysis.id, allResults, totalCost, startTime, stepwise);
              }
              await writeStepwiseSnapshot(
                buildStepState({
                  analysisId: analysis.id, dealId, analysisType: "full_analysis", totalAgents: TOTAL_AGENTS,
                  completedCount, totalCost, startTimeMs: startTime,
                  transitionCount: stateMachine.getTransitionCount(), lastUnit: unit, done: false,
                  enrichedContext: ec, allResults,
                  verificationContext: verificationContext as Record<string, unknown> | null,
                  collectedWarnings, tier1Findings: allFindings, allValidations, needsReflect: [],
                })
              );
              return { totalCost, completedCount };
            })
          );
          if (!preBodyRan) await ensureRehydrated();
          if (preBodyRan) {
            totalCost = preWire.totalCost;
            completedCount = preWire.completedCount;
          }
        }
      } else {
        // ===== UNITÉ tier3-pre (d-4, v3 FROZEN) — synthesis-setup + batch Tier3 pré-Tier2 en step unique.
        // Run sain : mute l'état vivant (enrichedContext BAPrefs/DealTerms/Structure + previousResults,
        // allResults tier3-pré, startSynthesis DEBATING→SYNTHESIZING) + snapshot not-done → le terminal
        // `post-tier1` rehydrate au replay-après-tier3-pre. Pas d'early-return (cost-check = SKIP-only). =====
        let tier3PreBodyRan = false;
        const tier3PreWire = await stepRunner.run("tier3-pre", () =>
          runWithLLMContext({ analysisId: analysis.id }, async () => {
            tier3PreBodyRan = true;
            const ec = enrichedContext!;
            const r = await this.runPostTier1Tier3Pre({
              deal, dealId, onProgress, init, enrichedContext: ec, totalCost, completedCount,
            });
            await writeStepwiseSnapshot(
              buildStepState({
                analysisId: analysis.id, dealId, analysisType: "full_analysis", totalAgents: TOTAL_AGENTS,
                completedCount: r.completedCount, totalCost: r.totalCost, startTimeMs: startTime,
                transitionCount: stateMachine.getTransitionCount(), lastUnit: "tier3-pre", done: false,
                enrichedContext: ec, allResults,
                verificationContext: verificationContext as Record<string, unknown> | null,
                collectedWarnings, tier1Findings: allFindings, allValidations, needsReflect: [],
              })
            );
            return { totalCost: r.totalCost, completedCount: r.completedCount };
          })
        );
        if (!tier3PreBodyRan) await ensureRehydrated();
        if (tier3PreBodyRan) {
          totalCost = tier3PreWire.totalCost;
          completedCount = tier3PreWire.completedCount;
        }
      }

      // ===== UNITÉ tier2-sector (d-5) — sector expert + consensus/reflexion (FOLDÉS, gate Codex #11)
      // en step durable. Run sain : mute allResults (applyReflexion remplace le sector result) +
      // snapshot not-done → le terminal `post-tier1` rehydrate au replay-après-tier2-sector. Pas
      // d'early-return. reportTotalCost remonte le coût sectoriel si consensus throw APRÈS sector
      // (byte-équiv exception === single-pass, gate Codex #11). Modèle B : bodyRan → applique le wire ;
      // sinon ensureRehydrated (no-op après le 1er). =====
      let tier2SectorBodyRan = false;
      const tier2SectorWire = await stepRunner.run("tier2-sector", () =>
        runWithLLMContext({ analysisId: analysis.id }, async () => {
          tier2SectorBodyRan = true;
          const ec = enrichedContext!;
          const r = await this.runPostTier1Tier2({
            dealId, onProgress, init, enrichedContext: ec,
            verificationContext: verificationContext!, allFindings,
            totalCost, completedCount,
            reportTotalCost: (c) => { totalCost = c; },
          });
          await writeStepwiseSnapshot(
            buildStepState({
              analysisId: analysis.id, dealId, analysisType: "full_analysis", totalAgents: TOTAL_AGENTS,
              completedCount: r.completedCount, totalCost: r.totalCost, startTimeMs: startTime,
              transitionCount: stateMachine.getTransitionCount(), lastUnit: "tier2-sector", done: false,
              enrichedContext: ec, allResults,
              verificationContext: verificationContext as Record<string, unknown> | null,
              collectedWarnings, tier1Findings: allFindings, allValidations, needsReflect: [],
            })
          );
          return { totalCost: r.totalCost, completedCount: r.completedCount };
        })
      );
      if (!tier2SectorBodyRan) await ensureRehydrated();
      if (tier2SectorBodyRan) {
        totalCost = tier2SectorWire.totalCost;
        completedCount = tier2SectorWire.completedCount;
      }

      // ===== UNITÉS tier3-post (d-6) — batch Tier3 après Tier2 PER-AGENT (1 step par batch, gate Codex
      // #11 : somme séquentielle thesis-reconciler+synthesis-deal-scorer+memo-generator ~280-310s risquait
      // > 300s). Chaque step exécute UN batch via runPostTier1Tier3Post([batch]) + snapshot not-done
      // (lastUnit=tier3-post pour les 3, comme la reflexion Tier1 réutilisait phase.unit). Le cost-check
      // break + le restore previousResults restent idempotents par batch (gate Codex #11). Modèle B :
      // bodyRan → applique le wire ; sinon ensureRehydrated (no-op après le 1er). =====
      for (let i = 0; i < TIER3_BATCHES_AFTER_TIER2.length; i++) {
        const batch = TIER3_BATCHES_AFTER_TIER2[i];
        let postBodyRan = false;
        const postWire = await stepRunner.run(`tier3-post-${i}`, () =>
          runWithLLMContext({ analysisId: analysis.id }, async () => {
            postBodyRan = true;
            const ec = enrichedContext!;
            const r = await this.runPostTier1Tier3Post({
              dealId, onProgress, init, enrichedContext: ec, totalCost, completedCount, batches: [batch],
            });
            await writeStepwiseSnapshot(
              buildStepState({
                analysisId: analysis.id, dealId, analysisType: "full_analysis", totalAgents: TOTAL_AGENTS,
                completedCount: r.completedCount, totalCost: r.totalCost, startTimeMs: startTime,
                transitionCount: stateMachine.getTransitionCount(), lastUnit: "tier3-post", done: false,
                enrichedContext: ec, allResults,
                verificationContext: verificationContext as Record<string, unknown> | null,
                collectedWarnings, tier1Findings: allFindings, allValidations, needsReflect: [],
              })
            );
            return { totalCost: r.totalCost, completedCount: r.completedCount };
          })
        );
        if (!postBodyRan) await ensureRehydrated();
        if (postBodyRan) {
          totalCost = postWire.totalCost;
          completedCount = postWire.completedCount;
        }
      }

      // ===== TERMINAL post-tier1 (d-7) — final-completion (complete + completeAnalysis + costMonitor +
      // updateDealStatus + delta ; effets irréversibles → terminal driver, jamais snapshot unit, gate
      // Codex #11). Le split post-Tier1 est COMPLET : tier3-pre → tier2-sector → tier3-post×N → final. =====
      return await runTerminalStepwiseDriver({
        stepRunner,
        stepwise,
        stepId: "post-tier1",
        pipeline: () =>
          this.runFinalCompletion({
            stepwise, allResults, totalCost, stateMachine, analysis, dealId, startTime,
            analysisModeOverride, isUpdate, collectedWarnings,
          }),
        loadPersistedResults: async () =>
          (await loadResults(analysis.id)) as AnalysisResult["results"] | null,
      });
    } catch (error) {
      return await this.failFullAnalysis(error, {
        stateMachine, analysis, dealId, totalCost, allResults, analysisModeOverride, startTime, collectedWarnings,
      });
    }
  }

  // ============================================================================
  // TIER 1 PHASES PIPELINE (shared by runFullAnalysis + runTier1Analysis)
  // ============================================================================

  /**
   * Execute Tier 1 agents in 4 sequential phases (A→B→C→D).
   * Each phase runs agents in parallel within the phase, then:
   * - Extracts findings and confidences
   * - Applies reflexion (always for A/B, confidence < 70% for C/D)
   * - Extracts validated claims and updates fact store in memory
   * - Rebuilds verificationContext after Phase B
   * - Runs intra-phase consensus for multi-agent phases
   * - Persists validated facts to DB after all phases
   *
   * Used by both runFullAnalysis() and runTier1Analysis().
   */
  /**
   * C.3a — Corps d'UNE itération de la boucle Tier 1 (phase A/B/C/D), extrait BYTE-INERT
   * de runTier1Phases. Appelé par la boucle existante pour chaque phase.
   * Mute PAR RÉFÉRENCE : allResults, allFindings, allValidations, collectedWarnings,
   * enrichedContext (+ previousResults/factStore/...), stateMachine. Renvoie les locals
   * réassignés (totalCost, completedCount, factStore, factStoreFormatted, verificationContext).
   * Le throw Phase A (échec critique) se propage à la boucle appelante (comportement inchangé).
   */
  private async runTier1Phase(
    phase: { name: string; agents: readonly string[] },
    refs: {
      enrichedContext: EnrichedAgentContext;
      tier1AgentMap: Record<string, { run: (ctx: EnrichedAgentContext) => Promise<AgentResult> }>;
      analysisId: string;
      dealId: string;
      onProgress?: AnalysisOptions["onProgress"];
      totalAgents: number;
      onEarlyWarning?: OnEarlyWarning;
      collectedWarnings: EarlyWarning[];
      allResults: Record<string, AgentResult>;
      allFindings: ScoredFinding[];
      allValidations: import("@/services/fact-store/current-facts").AgentFactValidation[];
      extractedData: {
        tagline?: string;
        competitors?: string[];
        founders?: Array<{ name: string; role?: string; linkedinUrl?: string }>;
        productDescription?: string;
        businessModel?: string;
      };
      stateMachine?: AnalysisStateMachine;
      initialTotalCost: number;
    },
    state: {
      totalCost: number;
      completedCount: number;
      factStore: CurrentFact[];
      factStoreFormatted: string;
      verificationContext: VerificationContext;
    }
  ): Promise<{
    totalCost: number;
    completedCount: number;
    factStore: CurrentFact[];
    factStoreFormatted: string;
    verificationContext: VerificationContext;
  }> {
    const {
      enrichedContext, tier1AgentMap, analysisId, dealId,
      onProgress, totalAgents, onEarlyWarning, collectedWarnings,
      allResults, allFindings, allValidations, extractedData, stateMachine,
      initialTotalCost,
    } = refs;
    const { factStore, factStoreFormatted, verificationContext } = state;
    let { totalCost, completedCount } = state;
    // Run this phase's agents in parallel, collect + sanitize results, extract findings,
    // and materialize the ordered needsReflect list. Shared OFF/stepwise sub-method (d-3).
    const agentsResult = await this.runTier1PhaseAgents(
      phase,
      {
        enrichedContext, tier1AgentMap, dealId,
        onProgress, totalAgents, onEarlyWarning, collectedWarnings,
        allResults, allFindings, stateMachine, initialTotalCost,
      },
      { totalCost, completedCount },
    );
    totalCost = agentsResult.totalCost;
    completedCount = agentsResult.completedCount;
    const { phaseFindings, needsReflect } = agentsResult;

    const reflexed = await this.runTier1PhaseReflexion(
      needsReflect,
      { analysisId, enrichedContext, allResults, allFindings, verificationContext },
      { totalCost },
    );
    totalCost = reflexed.totalCost;

    // Finalize the phase: validated-claim fact-store updates, verificationContext
    // rebuild (Phase B/C), intra-phase consensus, progress/checkpoint, fail-checks.
    // Shared OFF/stepwise sub-method (d-3) — MÊME méthode = pas de drift.
    const finalized = await this.runTier1PhaseFinalize(
      phase,
      phaseFindings,
      {
        enrichedContext, analysisId, extractedData,
        allResults, allValidations, stateMachine,
        initialTotalCost, completedCount,
      },
      { totalCost, factStore, factStoreFormatted, verificationContext },
    );
    return {
      totalCost: finalized.totalCost,
      completedCount,
      factStore: finalized.factStore,
      factStoreFormatted: finalized.factStoreFormatted,
      verificationContext: finalized.verificationContext,
    };
  }

  /**
   * Run a Tier 1 phase's agents — shared sub-method (sequencer OFF/v2 in-process AND
   * stepwise driver v3 call the SAME method = byte-équivalence, pas de drift).
   *
   * Pure extraction (d-3) of the agents segment of runTier1Phase: parallel agent run,
   * narrative sanitize, collect into allResults (+cost/completedCount/previousResults/
   * stateMachine record/early-warnings/processAgentResult), phase findings extraction
   * (pushed onto allFindings), and materialization of the ORDERED `needsReflect` list
   * (low-confidence successful agents, phase.agents order — carried to the stepwise
   * snapshot, never re-derived at replay). Mutates allResults/allFindings/
   * enrichedContext.previousResults/collectedWarnings/stateMachine by reference.
   */
  private async runTier1PhaseAgents(
    phase: { name: string; agents: readonly string[] },
    refs: {
      enrichedContext: EnrichedAgentContext;
      tier1AgentMap: Record<string, { run: (ctx: EnrichedAgentContext) => Promise<AgentResult> }>;
      dealId: string;
      onProgress?: AnalysisOptions["onProgress"];
      totalAgents: number;
      onEarlyWarning?: OnEarlyWarning;
      collectedWarnings: EarlyWarning[];
      allResults: Record<string, AgentResult>;
      allFindings: ScoredFinding[];
      stateMachine?: AnalysisStateMachine;
      initialTotalCost: number;
    },
    state: { totalCost: number; completedCount: number }
  ): Promise<{
    totalCost: number;
    completedCount: number;
    phaseFindings: ScoredFinding[];
    needsReflect: string[];
  }> {
    const {
      enrichedContext, tier1AgentMap, dealId,
      onProgress, totalAgents, onEarlyWarning, collectedWarnings,
      allResults, allFindings, stateMachine, initialTotalCost,
    } = refs;
    let { totalCost, completedCount } = state;

    onProgress?.({
      currentAgent: `tier1 ${phase.name}`,
      completedAgents: completedCount,
      totalAgents,
      estimatedCostSoFar: initialTotalCost + totalCost,
    });

    // Run agents in this phase (parallel within phase)
    const phaseResults = await Promise.all(
      phase.agents.map(async (agentName) => {
        const agent = tier1AgentMap[agentName];
        try {
          const result = await agent.run(enrichedContext);
          return { agentName, result };
        } catch (error) {
          return {
            agentName,
            result: {
              agentName,
              success: false,
              executionTimeMs: 0,
              cost: 0,
              error: error instanceof Error ? error.message : "Unknown error",
            } as AgentResult,
          };
        }
      })
    );

    // Collect phase results
    for (const { agentName, result } of phaseResults) {
      // Sanitize narrative fields for prescriptive language (Rule #1)
      if (result.success && "data" in result) {
        const { data: sanitized, totalViolations } = sanitizeAgentNarratives((result as { data: unknown }).data);
        if (totalViolations > 0) {
          console.warn(`[NarrativeSanitizer] ${agentName}: ${totalViolations} prescriptive violation(s) corrected`);
          (result as { data: unknown }).data = sanitized;
        }
      }
      allResults[agentName] = result;
      totalCost += result.cost;
      completedCount++;
      // Sanitize to prevent confirmation bias in downstream agents (F52)
      enrichedContext.previousResults![agentName] = sanitizeResultForDownstream(result);

      if (stateMachine) {
        if (result.success) {
          stateMachine.recordAgentComplete(agentName, result as AnalysisAgentResult);
        } else {
          stateMachine.recordAgentFailed(agentName, result.error ?? "Unknown");
        }
      }

      this.checkAndEmitWarnings(agentName, result, collectedWarnings, onEarlyWarning);
      await processAgentResult(dealId, agentName, result);
    }

    // Extract findings for this phase
    const phaseAgentResults: Record<string, AgentResult> = {};
    for (const agentName of phase.agents) {
      if (allResults[agentName]) {
        phaseAgentResults[agentName] = allResults[agentName];
      }
    }
    const { allFindings: phaseFindings, agentConfidences: phaseConfidences } =
      extractAllFindings(phaseAgentResults);
    allFindings.push(...phaseFindings);

    // Determine inline-reflexion targets for this phase.
    // Only apply if agent confidence < 50% (threshold set in ReflexionConfig)
    // REMOVED: Phase A/B forced reflexion — was doubling cost for no measurable quality gain
    // MATÉRIALISER la liste ORDONNÉE des agents low-conf à réfléchir (ordre phase.agents
    // préservé via phaseResults) — portée telle quelle au snapshot stepwise (DTO needsReflect),
    // jamais re-dérivée au replay (reflexion mute allResults).
    const needsReflect = phaseResults
      .filter(({ agentName, result }) => {
        if (!result.success) return false;
        const confidence = phaseConfidences.get(agentName);
        return confidence !== undefined && confidence.score < 60;
      })
      .map(({ agentName }) => agentName);

    return { totalCost, completedCount, phaseFindings, needsReflect };
  }

  /**
   * Apply inline reflexion to a Tier 1 phase — shared sub-method (sequencer OFF/v2
   * in-process AND stepwise driver v3 call the SAME method = byte-équivalence).
   *
   * Loops over the materialized ORDERED `needsReflect` list (low-confidence successful
   * agents, phase.agents order). Each applyReflexion re-injects the revised result into
   * allResults[name] + enrichedContext.previousResults[name] in place for downstream
   * agents. Order is byte-significant. The input result is read from allResults[name] —
   * identical to the original at this point because each agent is reflexion'd at most
   * once (needsReflect has distinct names), so no prior iteration has mutated it.
   */
  private async runTier1PhaseReflexion(
    needsReflect: readonly string[],
    refs: {
      analysisId: string;
      enrichedContext: EnrichedAgentContext;
      allResults: Record<string, AgentResult>;
      allFindings: ScoredFinding[];
      verificationContext: VerificationContext;
    },
    state: { totalCost: number }
  ): Promise<{ totalCost: number }> {
    const { analysisId, enrichedContext, allResults, allFindings, verificationContext } = refs;
    let { totalCost } = state;

    for (const agentName of needsReflect) {
      const result = allResults[agentName];
      if (!result?.success) continue;

      const agentFindings = allFindings.filter(f => f.agentName === agentName);
      const reflexionStats = await this.applyReflexion(
        analysisId,
        agentName,
        result as AnalysisAgentResult,
        agentFindings,
        `Deal: ${enrichedContext.deal.name}, Sector: ${enrichedContext.deal.sector}`,
        1,
        verificationContext,
        allResults,
        enrichedContext
      );
      totalCost += reflexionStats.tokensUsed * 0.00001;
    }

    return { totalCost };
  }

  /**
   * Finalize a Tier 1 phase — shared sub-method (sequencer OFF/v2 in-process AND
   * stepwise driver v3 call the SAME method = byte-équivalence, pas de drift).
   *
   * Extracted byte-inert from runTier1Phase (d-3, tail first like C.3): validated-
   * claim fact-store updates, verificationContext rebuild after Phase B/C, intra-
   * phase consensus over the SAME `phaseFindings` array (never re-extracted — finding
   * ids are crypto.randomUUID and must be carried, not regenerated), progress
   * persistence + checkpoint flush, and the phase fail-checks.
   *
   * fail-counts are RECOMPUTED from `phase.agents` + `allResults` (not `phaseResults`):
   * byte-identical because reflexion only runs on success===true agents and preserves
   * `success`/`error` by spreading the original result (applyReflexion:5055 ->
   * reflexion.ts:597 `{ ...currentResult, data }`), and `phase.agents` preserves
   * `phaseResults` order — so counts and failedNames are unchanged. This keeps finalize
   * stepwise-ready WITHOUT carrying `phaseResults` across a step boundary.
   */
  private async runTier1PhaseFinalize(
    phase: { name: string; agents: readonly string[] },
    phaseFindings: ScoredFinding[],
    refs: {
      enrichedContext: EnrichedAgentContext;
      analysisId: string;
      extractedData: {
        tagline?: string;
        competitors?: string[];
        founders?: Array<{ name: string; role?: string; linkedinUrl?: string }>;
        productDescription?: string;
        businessModel?: string;
      };
      allResults: Record<string, AgentResult>;
      allValidations: import("@/services/fact-store/current-facts").AgentFactValidation[];
      stateMachine?: AnalysisStateMachine;
      initialTotalCost: number;
      completedCount: number;
    },
    state: {
      totalCost: number;
      factStore: CurrentFact[];
      factStoreFormatted: string;
      verificationContext: VerificationContext;
    }
  ): Promise<{
    totalCost: number;
    factStore: CurrentFact[];
    factStoreFormatted: string;
    verificationContext: VerificationContext;
  }> {
    const {
      enrichedContext, analysisId, extractedData,
      allResults, allValidations, stateMachine,
      initialTotalCost, completedCount,
    } = refs;
    let { totalCost, factStore, factStoreFormatted, verificationContext } = state;

    // Extract validated claims and update fact store in memory
    for (const agentName of phase.agents) {
      const result = allResults[agentName];
      if (result?.success) {
        const validations = extractValidatedClaims(result, agentName);
        if (validations.length > 0) {
          allValidations.push(...validations);
          factStore = updateFactsInMemory(factStore, validations);
          factStoreFormatted = reformatFactStoreWithValidations(factStore, allValidations);
          enrichedContext.factStore = factStore;
          enrichedContext.factStoreFormatted = factStoreFormatted;
          enrichedContext.evidenceLedger = buildEvidenceLedgerFromContext(enrichedContext);
          enrichedContext.evidenceLedgerFormatted = formatEvidenceLedgerForPrompt(enrichedContext.evidenceLedger);
          console.log(`[Orchestrator:${phase.name}] ${agentName}: ${validations.length} fact validations applied`);
        }
      }
    }

    // Rebuild verificationContext after Phase B and Phase C (factStoreFormatted has changed)
    if (phase.name.includes("Phase B") || phase.name.includes("Phase C")) {
      verificationContext = await this.buildVerificationContext(
        enrichedContext,
        extractedData,
        factStoreFormatted,
        enrichedContext.deal,
      );
      console.log(`[Orchestrator] Rebuilt verificationContext after ${phase.name} with updated factStore`);
    }

    // Consensus within phase (if multiple agents in phase)
    if (phase.agents.length > 1 && phaseFindings.length > 1) {
      const debateStats = await this.runConsensusDebate(
        analysisId, phaseFindings, verificationContext, enrichedContext
      );
      totalCost += debateStats.totalTokens * 0.00001;
      console.log(`[Orchestrator:${phase.name}] Consensus: ${debateStats.debateCount} debates`);
    }

    await updateAnalysisProgress(analysisId, completedCount, initialTotalCost + totalCost);
    await stateMachine?.flushCheckpoint();

    const phaseSuccessCount = phase.agents.filter(
      (agentName) => allResults[agentName]?.success
    ).length;
    const phaseFailCount = phase.agents.length - phaseSuccessCount;
    console.log(
      `[Orchestrator] ${phase.name} complete (${phase.agents.length} agents: ${phaseSuccessCount} succeeded, ${phaseFailCount} failed)`
    );

    if (phase.name.includes("Phase A") && phaseFailCount > 0) {
      const failedNames = phase.agents
        .filter((agentName) => !allResults[agentName]?.success)
        .map((agentName) => `${agentName}: ${allResults[agentName]?.error ?? "unknown error"}`)
        .join(", ");
      console.error(
        `[Orchestrator] ABORTING remaining phases: critical agent(s) failed in ${phase.name} — ${failedNames}`
      );
      throw new Error(`Critical Tier 1 phase failed: ${failedNames}`);
    }

    if (phase.name.includes("Phase B") && phaseFailCount > 0) {
      const failedNames = phase.agents
        .filter((agentName) => !allResults[agentName]?.success)
        .map((agentName) => `${agentName}: ${allResults[agentName]?.error ?? "unknown error"}`)
        .join(", ");
      console.warn(
        `[Orchestrator] Phase B agent(s) failed (non-fatal, continuing): ${failedNames}`
      );
    }
    return { totalCost, factStore, factStoreFormatted, verificationContext };
  }

  private async runTier1Phases(params: {
    enrichedContext: EnrichedAgentContext;
    tier1AgentMap: Record<string, { run: (ctx: EnrichedAgentContext) => Promise<AgentResult> }>;
    analysisId: string;
    dealId: string;
    onProgress?: AnalysisOptions["onProgress"];
    totalAgents: number;
    onEarlyWarning?: OnEarlyWarning;
    collectedWarnings: EarlyWarning[];
    allResults: Record<string, AgentResult>;
    initialTotalCost: number;
    initialCompletedCount: number;
    factStore: CurrentFact[];
    factStoreFormatted: string;
    extractedData: {
      tagline?: string;
      competitors?: string[];
      founders?: Array<{ name: string; role?: string; linkedinUrl?: string }>;
      productDescription?: string;
      businessModel?: string;
    };
    stateMachine?: AnalysisStateMachine;
    phases?: Array<{ name: string; agents: readonly string[] }>;
  }): Promise<{
    allFindings: ScoredFinding[];
    agentConfidences: Map<string, ConfidenceScore>;
    lowConfidenceAgents: string[];
    updatedFactStore: CurrentFact[];
    updatedFactStoreFormatted: string;
    costIncurred: number;
    completedInPhases: number;
  }> {
    const {
      enrichedContext, tier1AgentMap, analysisId, dealId,
      onProgress, totalAgents, onEarlyWarning, collectedWarnings,
      allResults, extractedData, stateMachine,
    } = params;
    let { factStore, factStoreFormatted } = params;
    let totalCost = 0;
    let completedCount = params.initialCompletedCount;

    const allFindings: ScoredFinding[] = [];
    const allValidations: import("@/services/fact-store/current-facts").AgentFactValidation[] = [];

    // Build initial VerificationContext (needed for inline reflexion)
    let verificationContext: VerificationContext = await this.buildVerificationContext(
      enrichedContext,
      extractedData,
      factStoreFormatted,
      enrichedContext.deal,
    );

    const tier1Phases =
      params.phases ?? [
        { name: "Phase A: deck-forensics", agents: TIER1_PHASE_A },
        { name: "Phase B: financial-auditor", agents: TIER1_PHASE_B },
        { name: "Phase C: team + competitive + market", agents: TIER1_PHASE_C },
        { name: "Phase D: remaining agents", agents: TIER1_PHASE_D },
      ];

    for (const phase of tier1Phases) {
      ({ totalCost, completedCount, factStore, factStoreFormatted, verificationContext } = await this.runTier1Phase(
        phase,
        {
          enrichedContext, tier1AgentMap, analysisId, dealId,
          onProgress, totalAgents, onEarlyWarning, collectedWarnings,
          allResults, allFindings, allValidations, extractedData, stateMachine,
          initialTotalCost: params.initialTotalCost,
        },
        { totalCost, completedCount, factStore, factStoreFormatted, verificationContext },
      ));
    }

    // d-3 (R2) — FactEvent persist (validations) + confidences globales, extrait BYTE-INERT vers
    // finalizeTier1Phases, PARTAGÉ par ce chemin (single-pass/v2) ET le driver stepwise v3 (appelé
    // APRÈS la boucle Tier1 stepwise pour bâtir le shim phasesResult coût-neutre). Même ordre
    // d'effet : persist DB des validations puis extractAllFindings(allResults).
    const { agentConfidences, lowConfidenceAgents } = await this.finalizeTier1Phases({
      dealId,
      analysisId,
      allValidations,
      allResults,
    });

    return {
      allFindings,
      agentConfidences,
      lowConfidenceAgents,
      updatedFactStore: factStore,
      updatedFactStoreFormatted: factStoreFormatted,
      costIncurred: totalCost,
      completedInPhases: completedCount - params.initialCompletedCount,
    };
  }

  /**
   * d-3 (R2) — Tail de runTier1Phases extrait BYTE-INERT : persiste les FactEvent issus des
   * validations Tier1 (event-sourcing ; idempotence FactEvent = résiduel D.6 assumé au replay)
   * puis extrait les confidences globales via extractAllFindings(allResults). PARTAGÉ par
   * runTier1Phases (single-pass/v2) ET runFullAnalysisStepwiseV3 (appelé APRÈS la boucle Tier1
   * stepwise, AVANT le shim phasesResult coût-neutre). Aucun changement d'ordre d'effet.
   */
  private async finalizeTier1Phases(params: {
    dealId: string;
    analysisId: string;
    allValidations: import("@/services/fact-store/current-facts").AgentFactValidation[];
    allResults: Record<string, AgentResult>;
  }): Promise<{ agentConfidences: Map<string, ConfidenceScore>; lowConfidenceAgents: string[] }> {
    const { dealId, analysisId, allValidations, allResults } = params;

    // Persist validated facts to DB (event sourcing)
    // Only persist facts with actual corrected values (not just analysis notes)
    if (allValidations.length > 0) {
      const factEvents = allValidations
        .filter(v => v.status === 'VERIFIED' || v.status === 'CONTRADICTED')
        .filter(v => v.correctedValue !== undefined && v.correctedValue !== null)
        .map(v => {
          const reliability = buildReliabilityFromValidation({
            status: v.status,
            validatedBy: v.validatedBy,
            explanation: v.explanation,
          });

          return {
            factKey: v.factKey,
            category: inferCategoryFromFactKey(v.factKey),
            value: v.correctedValue,
            displayValue: v.correctedDisplayValue ?? String(v.correctedValue),
            source: 'DATA_ROOM' as const,
            sourceConfidence: v.newConfidence,
            truthConfidence: reliability
              ? computeTruthConfidence(v.newConfidence, reliability.reliability)
              : undefined,
            extractedText: v.explanation,
            sourceMetadata: {
              origin: "tier1-validation",
              validatedBy: v.validatedBy,
              validationStatus: v.status,
            },
            reliability,
          };
        });
      if (factEvents.length > 0) {
        const batchResult = await createFactEventsBatch(dealId, factEvents, 'RESOLVED', 'system', {
          runId: analysisId,
          scope: "tier1-finalize-resolved",
        });
        if (!batchResult.success) {
          // La contrainte unique (dealId, factKey, createdAt, eventType) peut
          // rejeter un batch partiellement duplique sous concurrence Tier1/Tier2.
          // On ne veut pas crasher l'analyse: on log et on continue, mais l'erreur
          // est surfacee pour investigation (Sentry via logger centralise a venir).
          console.error(
            `[Orchestrator] createFactEventsBatch failed for deal ${dealId}: ${batchResult.error ?? "unknown"}`
          );
        } else {
          console.log(`[Orchestrator] Persisted ${factEvents.length} validated facts to DB`);
        }
      }
    }

    // Extract global confidences for downstream use
    const { agentConfidences, lowConfidenceAgents } = extractAllFindings(allResults);
    return { agentConfidences, lowConfidenceAgents };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Run Tier 0 Fact Extraction
   *
   * Extracts structured facts from documents BEFORE all other agents.
   * Facts are persisted to the FactEvent table and returned for injection into agent context.
   *
   * @param deal - Deal with documents
   * @param isUpdate - If true, loads existing facts for contradiction detection
   * @param onProgress - Progress callback
   * @returns Object containing current facts and extraction result
   */
  private async runTier0FactExtraction(
    deal: DealWithDocs,
    isUpdate: boolean,
    onProgress?: AnalysisOptions["onProgress"],
    // Fix C — D.6 : analysisId du run full_analysis durable → arme l'idempotence des FactEvents
    // CREATED (scope tier0-created). Absent (chemin tier1_complete non-stepwise) → pas d'idempotency.
    analysisId?: string
  ): Promise<{
    factStore: CurrentFact[];
    factStoreFormatted: string;
    extractionResult: FactExtractorOutput | null;
    founderResponses: Array<{ questionId: string; question: string; answer: string; category: string }>;
    cost: number;
    executionTimeMs: number;
  }> {
    const startTime = Date.now();

    // Skip if no documents with extracted text
    const documentsWithContent = deal.documents.filter(d => d.extractedText);
    if (documentsWithContent.length === 0) {
      console.log("[Orchestrator:Tier0] No documents with content, skipping fact extraction");
      return {
        factStore: [],
        factStoreFormatted: "",
        extractionResult: null,
        founderResponses: [],
        cost: 0,
        executionTimeMs: Date.now() - startTime,
      };
    }

    onProgress?.({
      currentAgent: "fact-extractor (tier0)",
      completedAgents: 0,
      totalAgents: 1,
    });

    try {
      const currentFactsForContext = await getCurrentFacts(deal.id).catch(() => []);

      // Load existing facts if this is an update (for contradiction detection)
      const existingFacts: CurrentFact[] = currentFactsForContext;
      if (isUpdate) {
        console.log(`[Orchestrator:Tier0] Loaded ${existingFacts.length} existing facts for update`);
      }

      // Fetch founder responses stored as FOUNDER_RESPONSE facts
      const founderResponseFacts = await prisma.factEvent.findMany({
        where: {
          dealId: deal.id,
          source: "FOUNDER_RESPONSE",
          eventType: { notIn: ["DELETED", "SUPERSEDED"] },
        },
        orderBy: { createdAt: "desc" },
      });

      // Convert to FounderResponse format for the fact-extractor
      const founderResponses = founderResponseFacts.map(fact => ({
        questionId: fact.id,
        question: fact.reason || "Question non specifiee",
        answer: fact.displayValue,
        category: fact.category,
      }));

      if (founderResponses.length > 0) {
        console.log(`[Orchestrator:Tier0] Loaded ${founderResponses.length} founder responses for fact extraction`);
      }

      // Build context for fact-extractor with founder responses
      // Note: For updates, existing facts are passed via previousResults so fact-extractor
      // can detect contradictions. We use type assertion since AgentResult base doesn't have data.
      const factContext: AgentContext & { founderResponses?: typeof founderResponses } = {
        dealId: deal.id,
        deal: buildCanonicalRuntimeDeal(deal, {
          factStore: currentFactsForContext,
        }),
        canonicalDeal: buildCanonicalRuntimeDeal(deal, {
          factStore: currentFactsForContext,
        }),
        documents: deal.documents,
        founderResponses, // Pass founder responses to fact-extractor
        // Pass existing facts via previousResults (fact-extractor extracts them)
        previousResults: isUpdate && existingFacts.length > 0 ? {
          "fact-extractor": {
            agentName: "fact-extractor",
            success: true,
            executionTimeMs: 0,
            cost: 0,
            data: { facts: existingFacts.map(f => ({
              factKey: f.factKey,
              category: f.category,
              value: f.currentValue,
              displayValue: f.currentDisplayValue,
              unit: undefined,
              source: f.currentSource,
              sourceConfidence: f.currentConfidence,
              extractedText: "",
              validAt: f.validAt?.toISOString(),
              periodType: f.periodType,
              periodLabel: f.periodLabel,
              reliability: f.reliability?.reliability ?? "DECLARED",
              reliabilityReasoning: f.reliability?.reasoning ?? "Existing fact store value",
              isProjection: f.reliability?.isProjection ?? false,
              documentDate: f.reliability?.temporalAnalysis?.documentDate,
              dataPeriodEnd: f.reliability?.temporalAnalysis?.dataPeriodEnd,
              projectionPercent: f.reliability?.temporalAnalysis?.projectionPercent,
            })) },
          } as unknown as AgentResult,
        } as Record<string, AgentResult> : {},
      };

      // Run fact-extractor agent via job runner (timeout + retry)
      const jobResult = await runJob(
        'fact-extraction',
        () => factExtractorAgent.run(factContext),
        { timeoutMs: 120000, maxRetries: 1 }
      );

      if (jobResult.status === 'FAILED') {
        console.error(`[Orchestrator:Tier0] Fact extraction job failed: ${jobResult.error}`);
        // Continue without facts rather than failing the entire analysis
        return {
          factStore: existingFacts,
          factStoreFormatted: formatFactStoreForAgents(existingFacts),
          extractionResult: null,
          founderResponses,
          cost: 0,
          executionTimeMs: Date.now() - startTime,
        };
      }

      const result = jobResult.data!;

      if (!result.success || !("data" in result)) {
        console.error("[Orchestrator:Tier0] Fact extraction failed:", result.error);
        return {
          factStore: existingFacts,
          factStoreFormatted: formatFactStoreForAgents(existingFacts),
          extractionResult: null,
          founderResponses,
          cost: result.cost,
          executionTimeMs: Date.now() - startTime,
        };
      }

      const extractionData = (result as { data: FactExtractorOutput }).data;

      // Persist new facts to database
      if (extractionData.facts.length > 0) {
        try {
          await createFactEventsBatch(
            deal.id,
            extractionData.facts.map(fact => ({
              factKey: fact.factKey,
              category: fact.category,
              value: fact.value,
              displayValue: fact.displayValue,
              unit: fact.unit,
              source: fact.source,
              sourceDocumentId: fact.sourceDocumentId,
              sourceConfidence: fact.sourceConfidence,
              truthConfidence: fact.truthConfidence,
              extractedText: fact.extractedText,
              sourceMetadata: fact.sourceMetadata,
              validAt: fact.validAt,
              periodType: fact.periodType,
              periodLabel: fact.periodLabel,
              reliability: fact.reliability,
            })),
            "CREATED", // eventType: new facts being created
            "system",
            analysisId ? { runId: analysisId, scope: "tier0-created" } : undefined
          );
          console.log(`[Orchestrator:Tier0] Persisted ${extractionData.facts.length} facts to database`);
        } catch (persistError) {
          console.error("[Orchestrator:Tier0] Failed to persist facts:", persistError);
          // Continue anyway - facts are in memory
        }
      }

      // Log contradictions if any
      if (extractionData.contradictions.length > 0) {
        console.log(`[Orchestrator:Tier0] Detected ${extractionData.contradictions.length} contradictions:`);
        for (const c of extractionData.contradictions) {
          console.log(`  - ${c.factKey}: ${c.significance} (${c.newSource} vs ${c.existingSource})`);
        }
      }

      // Get current facts (after persistence, to include new events)
      const currentFacts = await getCurrentFacts(deal.id);
      const formattedFacts = formatFactStoreForAgents(currentFacts);

      console.log(`[Orchestrator:Tier0] Fact extraction complete: ${extractionData.metadata.factsExtracted} facts, ` +
        `${extractionData.metadata.contradictionsDetected} contradictions, ` +
        `avg confidence ${extractionData.metadata.averageConfidence}%`);

      onProgress?.({
        currentAgent: "fact-extractor (tier0)",
        completedAgents: 1,
        totalAgents: 1,
        latestResult: result,
      });

      return {
        factStore: currentFacts,
        factStoreFormatted: formattedFacts,
        extractionResult: extractionData,
        founderResponses,
        cost: result.cost,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      console.error("[Orchestrator:Tier0] Error during fact extraction:", error);

      // Graceful degradation - return existing facts if available
      const existingFacts = isUpdate ? await getCurrentFacts(deal.id).catch(() => []) : [];

      return {
        factStore: existingFacts,
        factStoreFormatted: formatFactStoreForAgents(existingFacts),
        extractionResult: null,
        founderResponses: [],
        cost: 0,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Run Deck Coherence Check (Tier 0.5)
   *
   * Verifies data coherence AFTER document extraction, BEFORE Tier 1 agents.
   * Detects inconsistencies, missing critical data, and implausible metrics.
   *
   * @param deal - Deal with documents
   * @param extractedData - Data extracted from document-extractor
   * @param onProgress - Progress callback
   * @returns DeckCoherenceReport or null if check fails
   */
  private async runDeckCoherenceCheck(
    deal: DealWithDocs,
    extractedData: Record<string, unknown> | undefined,
    onProgress?: AnalysisOptions["onProgress"]
  ): Promise<{
    report: DeckCoherenceReport | null;
    cost: number;
    executionTimeMs: number;
  }> {
    const startTime = Date.now();

    // Skip if no documents with extracted text
    const documentsWithContent = deal.documents.filter(d => d.extractedText);
    if (documentsWithContent.length === 0) {
      console.log("[Orchestrator:CoherenceCheck] No documents with content, skipping coherence check");
      return {
        report: null,
        cost: 0,
        executionTimeMs: Date.now() - startTime,
      };
    }

    onProgress?.({
      currentAgent: "deck-coherence-checker (tier0)",
      completedAgents: 0,
      totalAgents: 1,
    });

    try {
      const currentFactsForContext = await getCurrentFacts(deal.id).catch(() => []);

      // Phase 5.2 (Codex round 16 wiring guard) — coherence checker also gets
      // the evidence context so its prompt has the same temporal reference
      // as the rest of the analysis chain.
      const { evidenceContext: coherenceEvidenceContext, evidenceToday: coherenceEvidenceToday } =
        await loadEvidenceContextSafe(deal.id);

      // Build context for coherence checker
      const coherenceContext: AgentContext = {
        dealId: deal.id,
        deal: buildCanonicalRuntimeDeal(deal, {
          factStore: currentFactsForContext,
          previousResults: extractedData
            ? {
                "document-extractor": {
                  agentName: "document-extractor",
                  success: true,
                  executionTimeMs: 0,
                  cost: 0,
                  data: extractedData,
                } as unknown as AgentResult,
              }
            : {},
        }),
        canonicalDeal: buildCanonicalRuntimeDeal(deal, {
          factStore: currentFactsForContext,
          previousResults: extractedData
            ? {
                "document-extractor": {
                  agentName: "document-extractor",
                  success: true,
                  executionTimeMs: 0,
                  cost: 0,
                  data: extractedData,
                } as unknown as AgentResult,
              }
            : {},
        }),
        documents: deal.documents,
        evidenceContext: coherenceEvidenceContext,
        evidenceToday: coherenceEvidenceToday,
        previousResults: extractedData ? {
          "document-extractor": {
            agentName: "document-extractor",
            success: true,
            executionTimeMs: 0,
            cost: 0,
            data: extractedData,
          } as unknown as AgentResult,
        } : {},
      };

      // Run coherence checker via job runner (timeout + retry)
      const jobResult = await runJob(
        'deck-coherence-check',
        () => deckCoherenceChecker.run(coherenceContext),
        { timeoutMs: 90000, maxRetries: 1 }
      );

      if (jobResult.status === 'FAILED') {
        console.error(`[Orchestrator:CoherenceCheck] Coherence check job failed: ${jobResult.error}`);
        return {
          report: null,
          cost: 0,
          executionTimeMs: Date.now() - startTime,
        };
      }

      const result = jobResult.data!;

      if (!result.success || !("data" in result)) {
        console.error("[Orchestrator:CoherenceCheck] Coherence check failed:", result.error);
        return {
          report: null,
          cost: result.cost,
          executionTimeMs: Date.now() - startTime,
        };
      }

      const report = (result as { data: DeckCoherenceReport }).data;

      console.log(`[Orchestrator:CoherenceCheck] Complete: score=${report.coherenceScore}, ` +
        `grade=${report.reliabilityGrade}, critical=${report.summary.criticalIssues}, ` +
        `warnings=${report.summary.warningIssues}, recommendation=${report.recommendation}`);

      onProgress?.({
        currentAgent: "deck-coherence-checker (tier0)",
        completedAgents: 1,
        totalAgents: 1,
        latestResult: result,
      });

      return {
        report,
        cost: result.cost,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      console.error("[Orchestrator:CoherenceCheck] Error during coherence check:", error);
      return {
        report: null,
        cost: 0,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * THESIS EXTRACTION (Tier 0.5) — thesis-first architecture
   *
   * Execute apres fact-extractor + deck-coherence + context-engine (tous deja dans
   * enrichedContext). Extrait la these d'investissement, la teste contre 3 frameworks
   * (YC/Thiel/Angel Desk), persiste en DB (table Thesis), linke Analysis.thesisId,
   * et injecte le resultat dans enrichedContext.thesis pour que Tier 1/2/3 l'utilisent
   * comme contexte obligatoire.
   *
   * Non-fatal : si thesis-extractor crash, on continue l'analyse (la these manquera
   * dans l'UI, les Tier 1/2/3 n'auront pas de thesis context). Mieux que tout casser.
   */
  private async runThesisExtraction(
    enrichedContext: EnrichedAgentContext,
    analysisId: string,
    dealId: string,
    allResults: Record<string, AgentResult>,
    enableTrace: boolean,
    corpusSnapshot?: CorpusSnapshotMaterialization | null,
  ): Promise<ThesisExtractorOutput | null> {
    const startTime = Date.now();
    let thesisResultForDiagnostics: AgentResult | null = null;

    try {
      // Phase D — court-circuit replay : si la thèse de CE run est déjà persistée
      // (thesis-extractor:${analysisId}), la réutiliser SANS relancer le LLM. Downstream
      // identique au 1er run ; résultat déterministe (coût = extractionCost CANONIQUE du 1er
      // run réinjecté dans totalCost, executionTimeMs = 0 télémétrie résiduelle, aucune fuite
      // volatile), pas de coût LLM gaspillé, pas de nouvelle version. Run neuf : null → flux normal.
      const existingThesis = await thesisService.getByIdempotencyKey(`thesis-extractor:${analysisId}`);
      if (existingThesis) {
        const reusedOutput = this.thesisRecordToExtractorOutput(existingThesis);
        const reusedResult: AgentResult & { data: ThesisExtractorOutput } = {
          agentName: "thesis-extractor",
          success: true,
          executionTimeMs: 0,
          // Coût CANONIQUE du 1er run (persisté sur la thèse) → totalCost reproductible au
          // replay sans relancer le LLM. executionTimeMs=0 (télémétrie résiduelle, normalisée
          // par le golden harness). Pas de double-charge : le reuse n'arrive que si le step
          // n'a pas été mémoïsé terminé (Inngest ne repasse pas par un step déjà retourné).
          cost: existingThesis.extractionCost ?? 0,
          data: reusedOutput,
        };
        await this.linkAndInjectThesis(
          enrichedContext,
          allResults,
          analysisId,
          existingThesis.id,
          reusedOutput,
          reusedResult,
          corpusSnapshot,
        );
        console.log(
          `[Orchestrator:ThesisExtraction] Réutilisée (replay idempotent) thesisId=${existingThesis.id}`
        );
        return reusedOutput;
      }

      const thesisResult = await thesisExtractorAgent.run(enrichedContext, { enableTrace });
      thesisResultForDiagnostics = thesisResult;
      allResults["thesis-extractor"] = thesisResult;

      if (!thesisResult.success || !("data" in thesisResult)) {
        console.warn(`[Orchestrator:ThesisExtraction] Non-fatal failure: ${thesisResult.error ?? "unknown"}`);
        return null;
      }

      const thesisOutput = (thesisResult as AgentResult & { data: ThesisExtractorOutput }).data;

      // Persist Thesis. Idempotent (Phase D) : au replay du même run (même idempotencyKey),
      // thesisService.create RÉUTILISE la version existante (pas de nouvelle version/thesisId).
      const persisted = await thesisService.create({
        dealId,
        extractorOutput: thesisOutput,
        corpusSnapshotId: corpusSnapshot?.id ?? enrichedContext.analysis?.corpusSnapshotId ?? null,
        // Phase D — idempotence replay : même run (analysisId) ⇒ réutilise la thèse existante.
        idempotencyKey: `thesis-extractor:${analysisId}`,
        // Phase D — coût persisté pour le re-add canonique au replay (totalCost reproductible).
        extractionCost: thesisResult.cost,
      });

      // Phase D — le downstream consomme le contenu CANONIQUE persisté (la thèse réellement
      // en base, réutilisée au replay), PAS la sortie LLM du run courant qui peut diverger au
      // retry. Sur run neuf : identique à thesisOutput (schéma extractor = validation pure +
      // stockage JSON fidèle). Garantit qu'un retry de step n'injecte pas une thèse divergente
      // dans enrichedContext / previousResults / allResults malgré le même thesisId.
      const canonicalOutput = this.thesisRecordToExtractorOutput(persisted);
      const canonicalResult: AgentResult & { data: ThesisExtractorOutput } = {
        ...thesisResult,
        // Coût CANONIQUE persisté : si `create` a RÉUTILISÉ une thèse existante via son
        // re-check intra-tx (cas de course : 2 exécutions du même run passent le pré-check
        // avant que la thèse existe), `persisted.extractionCost` = coût du 1er run, pas le
        // coût LLM volatile de CE run. Byte-inert run neuf (extractionCost == thesisResult.cost
        // qu'on vient juste de persister).
        cost: persisted.extractionCost ?? thesisResult.cost,
        data: canonicalOutput,
      };
      await this.linkAndInjectThesis(
        enrichedContext,
        allResults,
        analysisId,
        persisted.id,
        canonicalOutput,
        canonicalResult,
        corpusSnapshot,
      );

      console.log(
        `[Orchestrator:ThesisExtraction] verdict=${canonicalOutput.verdict} confidence=${canonicalOutput.confidence} alerts=${canonicalOutput.alerts.length} (thesisId=${persisted.id})`
      );
      return canonicalOutput;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      allResults["thesis-extractor"] = thesisResultForDiagnostics
        ? {
            ...thesisResultForDiagnostics,
            success: false,
            error: `Post-processing failed: ${message}`,
          }
        : {
            agentName: "thesis-extractor",
            success: false,
            executionTimeMs: Date.now() - startTime,
            cost: 0,
            error: message,
          };
      console.error(`[Orchestrator:ThesisExtraction] Crashed (non-fatal):`, err);
      return null;
    }
  }

  /**
   * Phase D — reconstruit un ThesisExtractorOutput depuis la thèse PERSISTÉE (canonique).
   * Inverse fidèle du mapping de thesisService.create : le schéma extractor est une validation
   * pure (pas de transform) et les lentilles / loadBearing / alerts sont stockés en JSON tels
   * quels, donc record→output est exact. Sert à faire consommer au downstream la thèse réelle
   * (réutilisée au replay idempotent) plutôt que la sortie LLM volatile du run courant.
   */
  private thesisRecordToExtractorOutput(
    t: Awaited<ReturnType<typeof thesisService.create>>
  ): ThesisExtractorOutput {
    return {
      reformulated: t.reformulated,
      problem: t.problem,
      solution: t.solution,
      whyNow: t.whyNow,
      moat: t.moat,
      verdict: t.verdict as ThesisExtractorOutput["verdict"],
      confidence: t.confidence,
      loadBearing: t.loadBearing as ThesisExtractorOutput["loadBearing"],
      alerts: t.alerts as ThesisExtractorOutput["alerts"],
      ycLens: t.ycLens as ThesisExtractorOutput["ycLens"],
      thielLens: t.thielLens as ThesisExtractorOutput["thielLens"],
      angelDeskLens: t.angelDeskLens as ThesisExtractorOutput["angelDeskLens"],
      sourceDocumentIds: t.sourceDocumentIds,
      sourceHash: t.sourceHash,
    };
  }

  /**
   * Phase D — link Analysis.thesisId + injection de la thèse dans enrichedContext
   * (analysis / thesis / previousResults) + allResults["thesis-extractor"]. Partagé par le
   * flux normal ET le court-circuit replay → hydratation downstream identique dans les deux cas.
   */
  private async linkAndInjectThesis(
    enrichedContext: EnrichedAgentContext,
    allResults: Record<string, AgentResult>,
    analysisId: string,
    thesisId: string,
    output: ThesisExtractorOutput,
    result: AgentResult,
    corpusSnapshot?: CorpusSnapshotMaterialization | null,
  ): Promise<void> {
    allResults["thesis-extractor"] = result;

    await prisma.analysis.update({
      where: { id: analysisId },
      data: { thesisId },
    });

    enrichedContext.analysis = {
      ...(enrichedContext.analysis ?? { id: analysisId }),
      thesisBypass: enrichedContext.analysis?.thesisBypass ?? false,
      thesisId,
      corpusSnapshotId: enrichedContext.analysis?.corpusSnapshotId ?? corpusSnapshot?.id ?? null,
    };

    enrichedContext.thesis = {
      id: thesisId,
      reformulated: output.reformulated,
      problem: output.problem,
      solution: output.solution,
      whyNow: output.whyNow,
      moat: output.moat,
      verdict: output.verdict,
      confidence: output.confidence,
      loadBearing: output.loadBearing,
      alertsCount: output.alerts.length,
      ycVerdict: output.ycLens.verdict,
      thielVerdict: output.thielLens.verdict,
      angelDeskVerdict: output.angelDeskLens.verdict,
    };
    enrichedContext.previousResults = {
      ...(enrichedContext.previousResults ?? {}),
      "thesis-extractor": result,
    };
  }

  /**
   * Load BA preferences from database for personalized analysis (Tier 3)
   *
   * Returns the user's investment preferences if available,
   * otherwise returns default BA preferences.
   */
  private async loadBAPreferences(userId: string): Promise<BAPreferences> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      // investmentPreferences is a Json field - may need npx prisma generate if types outdated
      const prefs = (user as unknown as { investmentPreferences?: unknown })?.investmentPreferences;
      return getBAPreferences(prefs as Parameters<typeof getBAPreferences>[0]);
    } catch (error) {
      console.error("[Orchestrator] Failed to load BA preferences:", error);
      return getBAPreferences(null);
    }
  }

  private extractContextSeed(extractorResult: AgentResult): ContextSeed {
    const rawData = "data" in extractorResult
      ? (extractorResult as AgentResult & { data?: unknown }).data
      : undefined;
    const data = isRecord(rawData) ? rawData : {};
    const extractedInfo = isRecord(data.extractedInfo) ? data.extractedInfo : data;

    return {
      tagline: typeof extractedInfo.tagline === "string" ? extractedInfo.tagline : undefined,
      competitors: Array.isArray(extractedInfo.competitors) ? extractedInfo.competitors.filter((value): value is string => typeof value === "string") : undefined,
      founders: Array.isArray(extractedInfo.founders)
        ? extractedInfo.founders.filter((founder): founder is NonNullable<ContextSeed["founders"]>[number] => (
          isRecord(founder) && typeof founder.name === "string"
        )).map((founder) => ({
          name: founder.name,
          role: typeof founder.role === "string" ? founder.role : undefined,
          linkedinUrl: typeof founder.linkedinUrl === "string" ? founder.linkedinUrl : undefined,
        }))
        : undefined,
      productDescription: typeof extractedInfo.productDescription === "string" ? extractedInfo.productDescription : undefined,
      businessModel: typeof extractedInfo.businessModel === "string" ? extractedInfo.businessModel : undefined,
      productName: typeof extractedInfo.productName === "string" ? extractedInfo.productName : undefined,
      coreValueProposition: typeof extractedInfo.coreValueProposition === "string" ? extractedInfo.coreValueProposition : undefined,
      useCases: Array.isArray(extractedInfo.useCases) ? extractedInfo.useCases.filter((value): value is string => typeof value === "string") : undefined,
      keyDifferentiators: Array.isArray(extractedInfo.keyDifferentiators) ? extractedInfo.keyDifferentiators.filter((value): value is string => typeof value === "string") : undefined,
      websiteUrl: typeof extractedInfo.websiteUrl === "string" ? extractedInfo.websiteUrl : undefined,
    };
  }

  private extractContextSeedFromResults(results?: Record<string, AgentResult>): ContextSeed {
    const extractorResult = results?.["document-extractor"];
    if (!extractorResult?.success) {
      return {};
    }
    return this.extractContextSeed(extractorResult);
  }

  private hasContextSeed(seed: ContextSeed | undefined): boolean {
    if (!seed) return false;
    return Object.values(seed).some((value) => Array.isArray(value) ? value.length > 0 : value != null);
  }

  private toExtractedContextData(
    seed: ContextSeed | undefined
  ): EnrichedAgentContext["extractedData"] | undefined {
    if (!this.hasContextSeed(seed)) {
      return undefined;
    }
    return seed as unknown as EnrichedAgentContext["extractedData"];
  }

  private async materializeAnalysisCorpusSnapshot(
    dealId: string,
    documents: DealWithDocs["documents"],
    options: { allowSupersededDocuments?: boolean } = {}
  ): Promise<CorpusSnapshotMaterialization | null> {
    return ensureCorpusSnapshot({
      dealId,
      documents,
      allowSupersededDocuments: options.allowSupersededDocuments,
    });
  }

  private inferFullAnalysisResumeTopology(_totalAgents: number, hasSectorExpert: boolean): {
    includeFullTier3: boolean;
    includeTier2: boolean;
  } {
    // Crédits-only : toujours le pipeline complet. Les analyses RUNNING legacy
    // (avant le refactor) reprennent en pipeline complet (perte contrôlée
    // assumée, cf. plan refactor /Users/sacharebbouh/.claude/plans/structured-finding-chipmunk.md).
    return {
      includeFullTier3: true,
      includeTier2: hasSectorExpert,
    };
  }

  private async applyThesisReconciliation(
    enrichedContext: EnrichedAgentContext,
    agentResult: AgentResult
  ): Promise<void> {
    if (enrichedContext.analysis?.mode === "post_call_reanalysis") {
      logger.info(
        { analysisId: enrichedContext.analysis?.id },
        "Skipping thesis reconciliation persistence for post-call reanalysis"
      );
      return;
    }

    const thesisId = enrichedContext.thesis?.id;
    if (!thesisId || !agentResult.success || !("data" in agentResult)) {
      return;
    }

    const boundThesisId = enrichedContext.analysis?.thesisId;
    if (boundThesisId && boundThesisId !== thesisId) {
      logger.warn(
        {
          analysisId: enrichedContext.analysis?.id,
          boundThesisId,
          hydratedThesisId: thesisId,
        },
        "Skipping thesis reconciliation because the hydrated thesis does not match the analysis binding"
      );
      return;
    }

    try {
      const reconcilerOutput = (agentResult as AgentResult & { data: ThesisReconcilerOutput }).data;
      await thesisService.applyReconciliation({
        thesisId,
        reconcilerOutput,
      });

      if (enrichedContext.thesis) {
        enrichedContext.thesis = {
          ...enrichedContext.thesis,
          verdict: reconcilerOutput.updatedVerdict,
          confidence: reconcilerOutput.updatedConfidence,
        };
      }

      console.log(
        `[Orchestrator] Thesis reconciled: verdict=${reconcilerOutput.updatedVerdict} ` +
        `(changed=${reconcilerOutput.verdictChanged})`
      );
    } catch (error) {
      console.error("[Orchestrator] Failed to persist thesis reconciliation:", error);
    }
  }

  private async rehydrateResumeThesis(
    analysisId: string,
    thesisId: string | null | undefined,
    enrichedContext: EnrichedAgentContext
  ): Promise<void> {
    if (!thesisId) {
      console.warn("[Orchestrator:Resume] Analysis has no thesisId; skipping thesis rehydration");
      return;
    }

    const persistedThesis = await thesisService.getById(thesisId);
    if (!persistedThesis) {
      throw new Error(`Cannot resume analysis ${analysisId}: linked thesis ${thesisId} not found`);
    }
    if (!persistedThesis.isLatest) {
      throw new Error(`Cannot resume analysis ${analysisId}: linked thesis ${thesisId} has been superseded`);
    }

    type ThesisVerdictStr = "very_favorable" | "favorable" | "contrasted" | "vigilance" | "alert_dominant";
    type LoadBearingStatus = "verified" | "declared" | "projected" | "speculative";
    const loadBearing = ((persistedThesis.loadBearing as unknown) as Array<{
      id: string; statement: string; status: LoadBearingStatus; impact: string; validationPath: string;
    }>) ?? [];
    const alerts = ((persistedThesis.alerts as unknown) as Array<{
      severity: string; category: string; title: string; detail: string;
    }>) ?? [];
    const yc = ((persistedThesis.ycLens as unknown) as { verdict: ThesisVerdictStr }) ?? { verdict: "contrasted" };
    const thiel = ((persistedThesis.thielLens as unknown) as { verdict: ThesisVerdictStr }) ?? { verdict: "contrasted" };
    const ad = ((persistedThesis.angelDeskLens as unknown) as { verdict: ThesisVerdictStr }) ?? { verdict: "contrasted" };

    enrichedContext.thesis = {
      id: persistedThesis.id,
      reformulated: persistedThesis.reformulated,
      problem: persistedThesis.problem,
      solution: persistedThesis.solution,
      whyNow: persistedThesis.whyNow,
      moat: persistedThesis.moat,
      verdict: persistedThesis.verdict as ThesisVerdictStr,
      confidence: persistedThesis.confidence,
      loadBearing,
      alertsCount: alerts.length,
      ycVerdict: yc.verdict,
      thielVerdict: thiel.verdict,
      angelDeskVerdict: ad.verdict,
    };

    console.log(
      `[Orchestrator:Resume] Thesis rehydrated from analysis binding: ` +
      `thesisId=${persistedThesis.id} verdict=${persistedThesis.verdict} confidence=${persistedThesis.confidence}`
    );
  }

  private async mergeContextEngineFacts(
    dealId: string,
    contextEngineData: EnrichedAgentContext["contextEngine"],
    currentFactStore: CurrentFact[],
    corpusSnapshotId?: string | null
  ): Promise<{
    factStore: CurrentFact[];
    factStoreFormatted: string;
  }> {
    if (!contextEngineData) {
      return {
        factStore: currentFactStore,
        factStoreFormatted: formatFactStoreForAgents(currentFactStore),
      };
    }

    const contextFacts = extractFactsFromDealContext(contextEngineData, {
      corpusSnapshotId,
    });

    if (contextFacts.length === 0) {
      return {
        factStore: currentFactStore,
        factStoreFormatted: formatFactStoreForAgents(currentFactStore),
      };
    }

    const result = await persistExtractedFactsWithMatching(dealId, contextFacts, "system");
    if (!result.success) {
      console.error(
        `[Orchestrator] Failed to persist Context Engine facts for deal ${dealId}: ${result.error ?? "unknown"}`
      );
      return {
        factStore: currentFactStore,
        factStoreFormatted: formatFactStoreForAgents(currentFactStore),
      };
    }

    console.log(
      `[Orchestrator] Context Engine facts persisted: ` +
        `created=${result.createdCount}, superseded=${result.supersededCount}, ` +
        `ignored=${result.ignoredCount}, pending_review=${result.pendingReviewCount}`
    );

    return {
      factStore: result.currentFacts,
      factStoreFormatted: formatFactStoreForAgents(result.currentFacts),
    };
  }

  /**
   * Enrich deal context with Context Engine
   *
   * IMPORTANT: Call this AFTER document-extractor to use extracted data
   * for better search results (tagline for competitors, founders for LinkedIn, etc.)
   *
   * Results are cached by the Context Engine for 10 minutes.
   * Cache key includes extracted data so different extractions get fresh context.
   *
   * Founder LinkedIn data is fetched via Proxycurl (~$0.01/founder).
   * Priority: extracted founders > deal.founders from DB
   */
  private async enrichContext(
    deal: DealWithDocs,
    extractedData?: ContextSeed,
    currentFacts?: CurrentFact[],
  ): Promise<EnrichedAgentContext["contextEngine"]> {
    try {
      const resolvedFacts = currentFacts ?? await getCurrentFacts(deal.id).catch(() => []);
      const canonicalDeal = buildCanonicalRuntimeDeal(deal, {
        factStore: resolvedFacts,
        extractedData,
      });
      const canonicalCompanyName = canonicalDeal.companyName ?? canonicalDeal.name;
      const canonicalWebsite = canonicalDeal.website ?? undefined;

      // Merge founders: extracted founders (from deck) take priority over DB founders
      const extractedFounders = extractedData?.founders || [];
      const dbFounders = (deal.founders || []).map((f) => ({
        name: f.name,
        role: f.role,
        linkedinUrl: f.linkedinUrl ?? undefined,
      }));

      // Merge: add extracted founders not already in DB
      const mergedFounders: FounderInput[] = [...dbFounders];
      for (const ef of extractedFounders) {
        const exists = dbFounders.some(
          df => df.name.toLowerCase() === ef.name.toLowerCase()
        );
        if (!exists) {
          mergedFounders.push({
            name: ef.name,
            role: ef.role,
            linkedinUrl: ef.linkedinUrl,
          });
        }
      }

      const hasFoundersToEnrich = mergedFounders.length > 0;
      const extractionCorpusHashes = deal.documents
        .map((doc) => doc.extractionRuns?.[0]?.corpusTextHash ?? `${doc.id}:no-strict-run`)
        .sort();

      console.log(`[Orchestrator] Context Engine enrichment with: tagline=${!!extractedData?.tagline}, competitors=${extractedData?.competitors?.length ?? 0}, founders=${mergedFounders.length}`);

      const contextResult = await enrichDeal(
        {
          companyName: canonicalCompanyName,
          sector: canonicalDeal.sector ?? undefined,
          stage: canonicalDeal.stage ?? undefined,
          geography: canonicalDeal.geography ?? undefined,
        },
        {
          dealId: deal.id,
          includeFounders: hasFoundersToEnrich,
          founders: hasFoundersToEnrich ? mergedFounders : undefined,
          startupSector: canonicalDeal.sector ?? undefined,
          // Pass extracted data for richer context
          extractedTagline: extractedData?.tagline,
          extractedCompetitors: extractedData?.competitors,
          extractedProductDescription: extractedData?.productDescription,
          extractedBusinessModel: extractedData?.businessModel,
          extractedProductName: extractedData?.productName,
          extractedCoreValueProposition: extractedData?.coreValueProposition,
          extractedUseCases: extractedData?.useCases,
          extractedKeyDifferentiators: extractedData?.keyDifferentiators,
          extractedWebsiteUrl: extractedData?.websiteUrl,
          formWebsiteUrl: canonicalWebsite,
          extractionCorpusHashes,
        }
      );

      return {
        dealIntelligence: contextResult.dealIntelligence,
        marketData: contextResult.marketData,
        competitiveLandscape: contextResult.competitiveLandscape,
        newsSentiment: contextResult.newsSentiment,
        peopleGraph: contextResult.peopleGraph,
        websiteContent: contextResult.websiteContent,
        enrichedAt: contextResult.enrichedAt,
        completeness: contextResult.completeness,
        contextQuality: contextResult.contextQuality,
        sourceHealth: contextResult.sourceHealth,
        sources: contextResult.sources,
      };
    } catch (error) {
      console.error("Context Engine error:", error);
      return undefined;
    }
  }

  /**
   * Invalidate all cached data for a specific deal
   *
   * Call this when a deal is updated to ensure fresh data
   * on the next analysis. Invalidates:
   * - Context Engine data (market data, similar deals, etc.)
   * - Tool execution results
   * - Analysis results (via fingerprint reset)
   */
  async invalidateDealCache(dealId: string): Promise<void> {
    const cache = getCacheManager();

    // Invalidate Context Engine cache
    const contextInvalidated = invalidateDealContext(dealId);

    // Invalidate tool execution cache
    const toolsInvalidated = cache.invalidateDeal(dealId);

    // Invalidate analysis results cache (by resetting fingerprints)
    const analysisInvalidated = await invalidateDealAnalysisCache(dealId);

    console.log(
      `[Orchestrator] Invalidated cache for deal ${dealId}: ` +
        `${contextInvalidated} context entries, ` +
        `${toolsInvalidated} tool entries, ` +
        `${analysisInvalidated} analysis entries`
    );
  }

  /**
   * Get cache statistics for monitoring
   */
  async getCacheStats(dealId?: string) {
    const stats: {
      contextEngine: ReturnType<typeof getContextEngineCacheStats>;
      global: ReturnType<typeof getCacheManager.prototype.getStats>;
      analysis?: Awaited<ReturnType<typeof getDealCacheStats>>;
    } = {
      contextEngine: getContextEngineCacheStats(),
      global: getCacheManager().getStats(),
    };

    // Include per-deal analysis cache stats if dealId provided
    if (dealId) {
      stats.analysis = await getDealCacheStats(dealId);
    }

    return stats;
  }

  /**
   * Process findings from ReAct agents
   */
  private async processReActFindings(
    analysisId: string,
    agentName: string,
    result: AgentResult,
    allFindings: ScoredFinding[],
    dealName: string,
    dealSector: string | null,
    tier?: 1 | 2 | 3,
    verificationContext?: VerificationContext
  ): Promise<void> {
    const reactData = (result as { _react?: unknown })._react as {
      findings?: ScoredFinding[];
      reasoningTrace?: unknown;
      confidence?: ConfidenceScore;
    };

    if (reactData.findings) {
      allFindings.push(...reactData.findings);

      for (const finding of reactData.findings) {
        await messageBus.publish(createFindingMessage(agentName, "*", finding));
      }
    }

    if (reactData.reasoningTrace) {
      await persistReasoningTrace(analysisId, agentName, reactData.reasoningTrace);
    }

    if (reactData.findings) {
      await persistScoredFindings(analysisId, agentName, reactData.findings);
    }

    if (reactData.confidence && reactData.confidence.score < 75 && reactData.findings) {
      await this.applyReflexion(
        analysisId,
        agentName,
        result as unknown as AnalysisAgentResult,
        reactData.findings,
        `Deal: ${dealName}, Sector: ${dealSector}`,
        tier,
        verificationContext
      );
    }
  }

  /**
   * Run consensus debate for contradictions
   * Stores resolutions in enrichedContext.previousResults for downstream agents
   */
  private async runConsensusDebate(
    analysisId: string,
    allFindings: ScoredFinding[],
    verificationContext?: VerificationContext,
    enrichedContext?: EnrichedAgentContext
  ): Promise<{ debateCount: number; totalTokens: number }> {
    const contradictions = await consensusEngine.detectContradictions(allFindings);
    console.log(`[ConsensusEngine] Detected ${contradictions.length} contradictions`);

    let debateCount = 0;
    let totalTokens = 0;
    const resolutions: Array<{
      topic: string;
      resolution: string;
      winner?: string;
      finalValue?: unknown;
      confidence: number;
    }> = [];

    for (const contradiction of contradictions.filter(
      (c) => c.severity === "critical" || c.severity === "major"
    )) {
      try {
        const debateResult = await consensusEngine.debate(contradiction.id, verificationContext);
        await persistDebateRecord(analysisId, debateResult);
        debateCount++;
        totalTokens += debateResult.resolution.tokensUsed ?? 0;

        resolutions.push({
          topic: contradiction.topic,
          resolution: debateResult.resolution.resolution,
          winner: debateResult.resolution.winner,
          finalValue: debateResult.resolution.finalValue,
          confidence: debateResult.resolution.confidence.score,
        });

        console.log(
          `[ConsensusEngine] Resolved ${contradiction.topic}: ${debateResult.resolution.resolution}`
        );
      } catch (error) {
        console.error(`[ConsensusEngine] Failed to debate ${contradiction.id}:`, error);
      }
    }

    // Inject resolutions into enrichedContext so Tier 3 agents see resolved contradictions
    if (resolutions.length > 0 && enrichedContext?.previousResults) {
      enrichedContext.previousResults["_consensus_resolutions"] = {
        agentName: "consensus-engine",
        success: true,
        executionTimeMs: 0,
        cost: 0,
        data: { resolutions },
      } as unknown as AgentResult;
      console.log(`[ConsensusEngine] ${resolutions.length} resolutions injected into context for downstream agents`);
    }

    return { debateCount, totalTokens };
  }

  /**
   * Apply reflexion engine for low-confidence results
   * Returns tokens used for cost tracking
   */
  private async applyReflexion(
    _analysisId: string,
    agentName: string,
    result: AnalysisAgentResult,
    findings: ScoredFinding[],
    context: string,
    tier?: 1 | 2 | 3,
    verificationContext?: VerificationContext,
    allResults?: Record<string, AgentResult>,
    enrichedContext?: EnrichedAgentContext
  ): Promise<{ tokensUsed: number }> {
    try {
      console.log(`[Reflexion] Applying to ${agentName} (tier=${tier ?? "unknown"}, low confidence)`);

      const reflexionResult = await reflexionEngine.reflect({
        agentName,
        result,
        findings,
        context,
        tier,
        verificationContext,
      });

      console.log(
        `[Reflexion] ${agentName}: ${reflexionResult.critiques.length} critiques, ${reflexionResult.confidenceChange} confidence change`
      );

      // Re-inject revised result into allResults so downstream agents get the improved version.
      // SAFETY: Only inject if the revised result preserves essential data structure.
      // The reflexion engine's revisedOutput is z.unknown() and the LLM can return
      // malformed data that would corrupt the agent's findings/scores.
      if (reflexionResult.revisedResult && allResults) {
        const revisedData = (reflexionResult.revisedResult as { data?: unknown }).data;

        // Validate that revised data preserves essential structure (meta, score, findings exist)
        const hasEssentialFields =
          revisedData != null &&
          typeof revisedData === "object" &&
          "meta" in (revisedData as Record<string, unknown>) &&
          "score" in (revisedData as Record<string, unknown>);

        if (hasEssentialFields) {
          allResults[agentName] = reflexionResult.revisedResult;
          if (enrichedContext?.previousResults) {
            enrichedContext.previousResults[agentName] = sanitizeResultForDownstream(reflexionResult.revisedResult);
          }
          console.log(`[Reflexion] ${agentName}: revised result injected into allResults`);
        } else {
          console.warn(
            `[Reflexion] ${agentName}: revised result REJECTED — missing essential fields (meta/score). ` +
            `Keeping original result. revisedData type=${typeof revisedData}, ` +
            `keys=${revisedData && typeof revisedData === "object" ? Object.keys(revisedData as Record<string, unknown>).join(",") : "N/A"}`
          );
        }
      }

      return { tokensUsed: reflexionResult.tokensUsed ?? 0 };
    } catch (error) {
      console.error(`[Reflexion] Failed for ${agentName}:`, error);
      return { tokensUsed: 0 };
    }
  }

  /**
   * Build VerificationContext from enriched context data for Consensus/Reflexion engines
   */
  private async buildVerificationContext(
    enrichedContext: EnrichedAgentContext,
    extractedData: {
      tagline?: string;
      competitors?: string[];
      founders?: Array<{ name: string; role?: string; linkedinUrl?: string }>;
      productDescription?: string;
      businessModel?: string;
    },
    factStoreFormatted: string,
    deal: Pick<AgentContext["deal"], "sector" | "stage" | "geography">
  ): Promise<VerificationContext> {
    // Build deck extracts from document-extractor results
    let deckExtracts: string | undefined;
    const extractorResult = enrichedContext.previousResults?.["document-extractor"];
    if (extractorResult?.success && "data" in extractorResult) {
      const data = (extractorResult as { data: Record<string, unknown> }).data;
      const parts: string[] = [];
      if (extractedData.tagline) parts.push(`Tagline: ${extractedData.tagline}`);
      if (extractedData.productDescription) parts.push(`Product: ${extractedData.productDescription}`);
      if (extractedData.businessModel) parts.push(`Business Model: ${extractedData.businessModel}`);
      if (extractedData.competitors?.length) parts.push(`Competitors: ${extractedData.competitors.join(", ")}`);
      if (data.keyMetrics) parts.push(`Key Metrics: ${JSON.stringify(data.keyMetrics)}`);
      if (data.financialHighlights) parts.push(`Financial Highlights: ${JSON.stringify(data.financialHighlights)}`);
      deckExtracts = parts.length > 0 ? parts.join("\n") : undefined;
    }

    // Build financial model extracts from fact store
    const financialModelExtracts = factStoreFormatted || undefined;

    // Context Engine data
    const contextEngineData = enrichedContext.contextEngine
      ? {
          dealIntelligence: enrichedContext.contextEngine.dealIntelligence,
          competitiveLandscape: enrichedContext.contextEngine.competitiveLandscape,
          marketData: enrichedContext.contextEngine.marketData,
        }
      : undefined;

    // Funding DB data — fetch similar deals and valuation benchmarks.
    // H (Fix C) : hard wall sur les 2 requêtes Neon (le SEUL await non borné de la glue ; les
    // agents/LLM sont déjà bornés par base-agent.withTimeout / le routeur OpenRouter). Sur
    // timeout → throw → capté par le catch ci-dessous → `fundingDbData` reste undefined (MÊME
    // dégradation gracieuse que sur erreur DB). Mur généreux (FUNDING_DB_WALL_MS) → ne fire
    // jamais sur run sain (byte-equiv OFF/v3) ; borne un hang DB sous le plafond step 300s.
    let fundingDbData: Record<string, unknown> | undefined;
    try {
      const [similarDeals, valuationBenchmarks] = await withHardWall(
        "funding-db",
        () =>
          Promise.all([
            querySimilarDeals({
              sector: deal.sector ?? undefined,
              stage: deal.stage ?? undefined,
              region: deal.geography ?? undefined,
              limit: 20,
            }),
            getValuationBenchmarks({
              sector: deal.sector ?? undefined,
              stage: deal.stage ?? undefined,
              region: deal.geography ?? undefined,
            }),
          ]),
        FUNDING_DB_WALL_MS
      );

      if (similarDeals.length > 0 || valuationBenchmarks.count > 0) {
        fundingDbData = {
          similarDeals: similarDeals.map(d => ({
            company: d.companyName,
            amount: d.amountUsd != null ? Number(d.amountUsd) : null,
            stage: d.stageNormalized,
            sector: d.sectorNormalized,
            date: d.fundingDate,
          })),
          valuationBenchmarks: {
            count: valuationBenchmarks.count,
            median: valuationBenchmarks.median,
            p25: valuationBenchmarks.p25,
            p75: valuationBenchmarks.p75,
            average: valuationBenchmarks.average,
          },
        };
        console.log(`[Orchestrator] Funding DB: ${similarDeals.length} similar deals, ${valuationBenchmarks.count} for benchmarks`);
      }
    } catch (error) {
      console.error("[Orchestrator] Failed to fetch funding DB data:", error);
    }

    // Pre-computed financial calculations from fact store
    const preComputedCalculations: Record<string, CalculationResult | { error: string }> = {};
    if (enrichedContext.factStore && enrichedContext.factStore.length > 0) {
      const factMap = new Map(
        enrichedContext.factStore.map(f => [f.factKey, f])
      );

      // ARR from MRR
      const mrrFact = factMap.get("financial.mrr");
      if (mrrFact?.currentValue != null) {
        const mrr = Number(mrrFact.currentValue);
        if (!isNaN(mrr) && mrr > 0) {
          preComputedCalculations.arr = validateAndCalculate(
            () => calculateARR(mrr, `Fact Store: financial.mrr (${mrrFact.currentSource})`),
            { mustBePositive: true }
          );
        }
      }

      // Gross Margin — use pre-computed gross_margin fact, or calculate from revenue + gross_margin
      const grossMarginFact = factMap.get("financial.gross_margin");
      if (grossMarginFact?.currentValue != null) {
        // Gross margin already available as a fact — use directly
        const gm = Number(grossMarginFact.currentValue);
        if (!isNaN(gm)) {
          preComputedCalculations.grossMargin = {
            value: gm,
            formula: "Direct from fact store",
            inputs: [{ name: "gross_margin", value: gm, source: `Fact Store: financial.gross_margin (${grossMarginFact.currentSource})` }],
            formatted: `${gm.toFixed(1)}%`,
            calculation: `Gross Margin = ${gm}% (source: ${grossMarginFact.currentSource})`,
          };
        }
      }

      // LTV/CAC Ratio
      const ltvFact = factMap.get("traction.ltv");
      const cacFact = factMap.get("traction.cac");
      if (ltvFact?.currentValue != null && cacFact?.currentValue != null) {
        const ltv = Number(ltvFact.currentValue);
        const cac = Number(cacFact.currentValue);
        if (!isNaN(ltv) && !isNaN(cac) && cac > 0) {
          preComputedCalculations.ltvCacRatio = validateAndCalculate(
            () => calculateLTVCACRatio(
              ltv, cac,
              `Fact Store: traction.ltv (${ltvFact.currentSource})`,
              `Fact Store: traction.cac (${cacFact.currentSource})`
            ),
            { mustBePositive: true }
          );
        }
      }

      // LTV/CAC Ratio — also check if directly available
      const ltvCacFact = factMap.get("traction.ltv_cac_ratio");
      if (!preComputedCalculations.ltvCacRatio && ltvCacFact?.currentValue != null) {
        const ratio = Number(ltvCacFact.currentValue);
        if (!isNaN(ratio)) {
          preComputedCalculations.ltvCacRatio = {
            value: ratio,
            formula: "Direct from fact store",
            inputs: [{ name: "ltv_cac_ratio", value: ratio, source: `Fact Store: traction.ltv_cac_ratio (${ltvCacFact.currentSource})` }],
            formatted: `${ratio.toFixed(1)}x`,
            calculation: `LTV/CAC = ${ratio}x (source: ${ltvCacFact.currentSource})`,
          };
        }
      }

      // Rule of 40
      const growthFact = factMap.get("financial.revenue_growth_yoy");
      const marginFact = factMap.get("financial.net_margin");
      if (growthFact?.currentValue != null && marginFact?.currentValue != null) {
        const growth = Number(growthFact.currentValue);
        const margin = Number(marginFact.currentValue);
        if (!isNaN(growth) && !isNaN(margin)) {
          preComputedCalculations.ruleOf40 = validateAndCalculate(
            () => calculateRuleOf40(
              growth, margin,
              `Fact Store: financial.revenue_growth_yoy (${growthFact.currentSource})`,
              `Fact Store: financial.net_margin (${marginFact.currentSource})`
            ),
            { minValue: -100, maxValue: 200 }
          );
        }
      }

      const calcCount = Object.keys(preComputedCalculations).length;
      if (calcCount > 0) {
        console.log(`[Orchestrator] Pre-computed ${calcCount} financial calculations from fact store`);
      }
    }

    return {
      deckExtracts,
      financialModelExtracts,
      contextEngineData,
      fundingDbData,
      preComputedCalculations: Object.keys(preComputedCalculations).length > 0
        ? preComputedCalculations
        : undefined,
    };
  }

  /**
   * Get available analysis types
   */
  getAnalysisTypes(): { type: AnalysisType; description: string; agentCount: number }[] {
    return Object.entries(ANALYSIS_CONFIGS).map(([type, config]) => ({
      type: type as AnalysisType,
      description: config.description,
      agentCount: AGENT_COUNTS[type as AnalysisType] ?? config.agents.length,
    }));
  }

  // ============================================================================
  // CRASH RECOVERY
  // ============================================================================

  /**
   * Find all interrupted analyses that can be resumed
   * Call this at app startup to detect analyses that crashed
   */
  async findInterruptedAnalyses(userId?: string): Promise<
    Array<{
      id: string;
      dealId: string;
      dealName: string;
      type: string;
      mode: string | null;
      startedAt: Date | null;
      completedAgents: number;
      totalAgents: number;
      totalCost: number;
      lastCheckpointAt: Date | null;
      canResume: boolean;
    }>
  > {
    const interrupted = await findInterruptedAnalyses(userId);

    // Check if each has a valid checkpoint
    return interrupted.map((analysis) => ({
      ...analysis,
      canResume: analysis.lastCheckpointAt !== null,
    }));
  }

  /**
   * Resume an interrupted analysis from its last checkpoint
   *
   * This will:
   * 1. Load the checkpoint from DB
   * 2. Restore the state machine
   * 3. Continue from where it left off
   * 4. Skip already completed agents
   */
  /**
   * C2a — Checkpoint durable RUNNING a une frontiere de tier (runFullAnalysis).
   * Rend une analyse tuee mid-pipeline (budget Vercel 300s) reprenable au lieu de
   * rester RUNNING-sans-checkpoint (que resume marquait FAILED — locus du gel avekapeti).
   * Additif + RUNNING-gated (saveCheckpoint n'update la ligne que si status RUNNING et
   * merge monotone) => zero impact sur une analyse saine (le checkpoint COMPLETED terminal
   * merge par-dessus). En pass-0 allResults n'ajoute que des agents (pas de regression
   * succes->echec) => success-preserving par construction. Best-effort : un echec de
   * checkpoint ne fait JAMAIS echouer l'analyse.
   */
  private async persistTierCheckpoint(
    analysisId: string,
    allResults: Record<string, AgentResult>,
    totalCost: number,
    startTimeMs: number,
    stepwise: boolean,
  ): Promise<void> {
    // D.5a — en mode stepwise, AUCUN checkpoint legacy n'est émis : l'état durable
    // passe par les snapshots STEPWISE:* (cf. full-analysis-snapshot). No-op ici.
    if (stepwise) return;
    try {
      await saveCheckpoint(analysisId, {
        state: "ANALYZING",
        completedAgents: Object.keys(allResults),
        pendingAgents: [],
        failedAgents: Object.entries(allResults)
          .filter(([, result]) => !result.success)
          .map(([agent, result]) => ({
            agent,
            error: result.error ?? "no error msg",
            retries: 1,
          })),
        findings: extractAllFindings(allResults).allFindings,
        results: allResults,
        totalCost,
        startTime: new Date(startTimeMs).toISOString(),
      });
    } catch (err) {
      console.warn("[Orchestrator] persistTierCheckpoint non-fatal:", err);
    }
  }

  async resumeAnalysis(
    analysisId: string,
    onProgress?: AnalysisOptions["onProgress"],
    onEarlyWarning?: AnalysisOptions["onEarlyWarning"]
  ): Promise<AnalysisResult> {
    return runWithLLMContext(
      { agentName: null, analysisId },
      () => this._resumeAnalysisImpl(analysisId, onProgress, onEarlyWarning)
    );
  }

  private async _resumeAnalysisImpl(
    analysisId: string,
    onProgress?: AnalysisOptions["onProgress"],
    onEarlyWarning?: AnalysisOptions["onEarlyWarning"]
  ): Promise<AnalysisResult> {
    console.log(`[Orchestrator] Attempting to resume analysis ${analysisId}`);

    // Load analysis data and checkpoint
    const recoveryData = await loadAnalysisForRecovery(analysisId);

    if (!recoveryData) {
      throw new Error(`Cannot resume analysis ${analysisId}: not found or not in RUNNING state`);
    }

    const { analysis, deal, checkpoint } = recoveryData;

    if (!deal) {
      throw new Error(`Cannot resume analysis ${analysisId}: deal not found`);
    }

    if (!checkpoint) {
      // No checkpoint - cannot resume, mark as failed
      await markAnalysisAsFailed(analysisId, "No checkpoint available for recovery");
      throw new Error(`Cannot resume analysis ${analysisId}: no checkpoint found`);
    }

    console.log(
      `[Orchestrator] Resuming analysis ${analysisId}: ` +
        `state=${checkpoint.state}, completed=${checkpoint.completedAgents.length}/${analysis.totalAgents}`
    );

    const startTime = new Date(checkpoint.startTime).getTime();
    const collectedWarnings: EarlyWarning[] = [];

    // Restore results: merge checkpoint results with analysis DB results (DB may have more)
    const checkpointResults = (checkpoint.results ?? {}) as Record<string, AgentResult>;
    const analysisDbMeta = await prisma.analysis.findUnique({
      where: { id: analysisId },
      select: { totalCost: true, thesisBypass: true, corpusSnapshotId: true },
    });
    const rawDbResults = await loadResults(analysisId, {
      preferDb: true,
      backfillCache: false,
    });
    const dbResults = toAgentResultsRecord(rawDbResults) ?? {};

    console.log(
      `[Orchestrator:Resume] Merge: checkpoint=${Object.keys(checkpointResults).length} results, ` +
      `db=${Object.keys(dbResults).length} results, dbType=${typeof rawDbResults}, dbNull=${rawDbResults == null}`
    );

    // Merge: DB results take priority (may contain agents completed after checkpoint)
    const allResults: Record<string, AgentResult> = { ...checkpointResults, ...dbResults };

    // Build completed set from actual results (more reliable than checkpoint.completedAgents)
    const completedFromResults = Object.entries(allResults)
      .filter(([, r]) => r && r.success)
      .map(([name]) => name);
    const completedSet = new Set([
      ...checkpoint.completedAgents,
      ...completedFromResults,
    ]);
    const failedSet = new Set(checkpoint.failedAgents.map((f) => f.agent));

    let totalCost = Number(analysisDbMeta?.totalCost ?? checkpoint.totalCost ?? 0);
    let completedCount = completedSet.size;
    const isFullAnalysis = analysis.type === "full_analysis";
    const tier3AgentNamesForRecovery = isFullAnalysis
      ? FULL_ANALYSIS_TIER3_AGENT_NAMES
      : TIER3_AGENT_NAMES;

    // Initialize state machine with recovery
    const stateMachine = new AnalysisStateMachine({
      analysisId: analysis.id,
      dealId: analysis.dealId,
      mode: analysis.mode ?? "full_analysis",
      agents: [...TIER1_AGENT_NAMES, ...tier3AgentNamesForRecovery],
      enableCheckpointing: true,
    });

    // Restore state from checkpoint
    const restored = await stateMachine.restoreFromDb();
    if (!restored) {
      await markAnalysisAsFailed(analysisId, "Failed to restore state from checkpoint");
      throw new Error(`Failed to restore state machine for analysis ${analysisId}`);
    }

    stateMachine.onStateChange(async (from, to, trigger) => {
      console.log(`[StateMachine:Resume] ${from} → ${to} (${trigger})`);
      await persistStateTransition(analysis.id, from, to, trigger);
    });

    messageBus.clear();

    // Determine what phase we were in and what to do next
    let currentState = stateMachine.getState();

    // If state machine is FAILED/COMPLETED, force back to ANALYZING so resume continues
    if (currentState === "FAILED" || currentState === "COMPLETED") {
      console.log(`[Orchestrator:Resume] State machine was ${currentState}, forcing back to ANALYZING`);
      stateMachine.forceState("ANALYZING", "resume_from_failed");
      currentState = "ANALYZING";
    }

    try {
      // Set analysis context for LLM cost tracking (was missing in resume mode)
      setAnalysisContext(analysis.id);

      // Log actual completed agents for debugging
      console.log(
        `[Orchestrator:Resume] Completed agents (${completedSet.size}): ${[...completedSet].join(", ")}`
      );

      // Build context (we need to re-enrich since context engine data is not persisted)
      // Sanitize restored results to prevent bias in downstream agents (F52)
      const sanitizedPreviousResults: Record<string, AgentResult> = {};
      for (const [name, result] of Object.entries(allResults)) {
        if (result && result.success) {
          sanitizedPreviousResults[name] = sanitizeResultForDownstream(result);
        }
      }

      let factStore: CurrentFact[] = [];
      let factStoreFormatted = "";
      try {
        factStore = await getCurrentFacts(deal.id);
        factStoreFormatted = formatFactStoreForAgents(factStore);
        console.log(`[Orchestrator:Resume] Restored ${factStore.length} facts from DB`);
      } catch (error) {
        console.error("[Orchestrator:Resume] Failed to restore fact store:", error);
      }

      // Phase 5.1 (Codex round 15 P1) — wire evidence into resume path too.
      const { evidenceContext: resumeEvidenceContext, evidenceToday: resumeEvidenceToday } =
        await loadEvidenceContextSafe(deal.id);
      const baseContext: AgentContext = {
        dealId: deal.id,
        deal: buildCanonicalRuntimeDeal(deal, {
          factStore,
          previousResults: sanitizedPreviousResults,
        }),
        canonicalDeal: buildCanonicalRuntimeDeal(deal, {
          factStore,
          previousResults: sanitizedPreviousResults,
        }),
        analysis: {
          id: analysis.id,
          mode: analysis.mode ?? null,
          thesisBypass: analysisDbMeta?.thesisBypass ?? analysis.thesisBypass ?? false,
          thesisId: analysis.thesisId ?? null,
          corpusSnapshotId: analysisDbMeta?.corpusSnapshotId ?? analysis.corpusSnapshotId ?? null,
        },
        documents: deal.documents,
        evidenceContext: resumeEvidenceContext,
        evidenceToday: resumeEvidenceToday,
        previousResults: sanitizedPreviousResults,
      };

      // Re-run context engine enrichment
      onProgress?.({
        currentAgent: "context-engine (re-enriching)",
        completedAgents: completedCount,
        totalAgents: analysis.totalAgents,
      });

      const extractedData = this.extractContextSeedFromResults(allResults);
      if (this.hasContextSeed(extractedData)) {
        console.log(
          `[Orchestrator:Resume] Restored context seed: ` +
          `tagline=${!!extractedData.tagline}, product=${!!extractedData.productName}, ` +
          `competitors=${extractedData.competitors?.length ?? 0}, founders=${extractedData.founders?.length ?? 0}`
        );
      }

      const contextEngineData = await this.enrichContext(
        deal as DealWithDocs,
        extractedData,
        factStore,
      );
      const mergedContextFacts = await this.mergeContextEngineFacts(
        deal.id,
        contextEngineData,
        factStore,
        analysisDbMeta?.corpusSnapshotId ?? analysis.corpusSnapshotId ?? null
      );
      factStore = mergedContextFacts.factStore;
      factStoreFormatted = mergedContextFacts.factStoreFormatted;

      const enrichedContext: EnrichedAgentContext = attachEvidenceLedger({
        ...baseContext,
        contextEngine: contextEngineData,
        factStore,
        factStoreFormatted,
        extractedData: this.toExtractedContextData(extractedData),
      });

      // A resumed analysis must stay bound to the thesis it originally ran with.
      // Rehydrating the latest thesis would silently mix two thesis generations.
      try {
        await this.rehydrateResumeThesis(analysis.id, analysis.thesisId, enrichedContext);
      } catch (err) {
        console.warn("[Orchestrator:Resume] Failed to rehydrate thesis context:", err);
        throw err;
      }

      // Resume based on current state
      if (currentState === "ANALYZING" || currentState === "GATHERING") {
        // Need to run remaining AND previously failed Tier 1 agents.
        // Previously failed agents are retried after the underlying cause has
        // been fixed; required Tier 1 output must not be silently skipped.
        const pendingTier1 = TIER1_AGENT_NAMES.filter(
          (name) => !completedSet.has(name)
        );

        if (pendingTier1.length > 0) {
          onProgress?.({
            currentAgent: `resuming tier1-agents (${pendingTier1.length} remaining)`,
            completedAgents: completedCount,
            totalAgents: analysis.totalAgents,
          });

          const tier1AgentMap = await getTier1Agents();
          const resumeTier1Phases = [
            { name: "Phase A: deck-forensics", agents: TIER1_PHASE_A.filter((name) => pendingTier1.includes(name)) },
            { name: "Phase B: financial-auditor", agents: TIER1_PHASE_B.filter((name) => pendingTier1.includes(name)) },
            { name: "Phase C: team + competitive + market", agents: TIER1_PHASE_C.filter((name) => pendingTier1.includes(name)) },
            { name: "Phase D: remaining agents", agents: TIER1_PHASE_D.filter((name) => pendingTier1.includes(name)) },
          ].filter((phase) => phase.agents.length > 0);

          const resumePhasesResult = await this.runTier1Phases({
            enrichedContext,
            tier1AgentMap,
            analysisId: analysis.id,
            dealId: deal.id,
            onProgress,
            totalAgents: analysis.totalAgents,
            onEarlyWarning,
            collectedWarnings,
            allResults,
            initialTotalCost: totalCost,
            initialCompletedCount: completedCount,
            factStore,
            factStoreFormatted,
            extractedData,
            stateMachine,
            phases: resumeTier1Phases,
          });

          factStore = resumePhasesResult.updatedFactStore;
          factStoreFormatted = resumePhasesResult.updatedFactStoreFormatted;
          totalCost += resumePhasesResult.costIncurred;
          completedCount += resumePhasesResult.completedInPhases;
        }
      }

      const canResumeSynthesis =
        currentState === "ANALYZING" ||
        currentState === "SYNTHESIZING" ||
        currentState === "DEBATING";

      const sectorExpert = isFullAnalysis
        ? await getTier2SectorExpert(enrichedContext.deal.sector)
        : null;
      const fullAnalysisTopology = isFullAnalysis
        ? this.inferFullAnalysisResumeTopology(analysis.totalAgents, sectorExpert !== null)
        : { includeFullTier3: true, includeTier2: false };

      if (canResumeSynthesis) {
        const hydrateTier3Context = async (): Promise<void> => {
          enrichedContext.baPreferences = await this.loadBAPreferences(deal.userId);

          if (enrichedContext.dealTerms) {
            return;
          }

          const [rawDealTerms, rawDealStructure] = await Promise.all([
            prisma.dealTerms.findUnique({ where: { dealId: deal.id } }),
            prisma.dealStructure.findUnique({
              where: { dealId: deal.id },
              include: { tranches: { orderBy: { orderIndex: "asc" } } },
            }),
          ]);

          if (rawDealTerms) {
            enrichedContext.dealTerms = {
              valuationPre: rawDealTerms.valuationPre != null ? Number(rawDealTerms.valuationPre) : null,
              amountRaised: rawDealTerms.amountRaised != null ? Number(rawDealTerms.amountRaised) : null,
              dilutionPct: rawDealTerms.dilutionPct != null ? Number(rawDealTerms.dilutionPct) : null,
              instrumentType: rawDealTerms.instrumentType,
              instrumentDetails: rawDealTerms.instrumentDetails,
              liquidationPref: rawDealTerms.liquidationPref,
              antiDilution: rawDealTerms.antiDilution,
              proRataRights: rawDealTerms.proRataRights,
              informationRights: rawDealTerms.informationRights,
              boardSeat: rawDealTerms.boardSeat,
              founderVesting: rawDealTerms.founderVesting,
              vestingDurationMonths: rawDealTerms.vestingDurationMonths,
              vestingCliffMonths: rawDealTerms.vestingCliffMonths,
              esopPct: rawDealTerms.esopPct != null ? Number(rawDealTerms.esopPct) : null,
              dragAlong: rawDealTerms.dragAlong,
              tagAlong: rawDealTerms.tagAlong,
              ratchet: rawDealTerms.ratchet,
              payToPlay: rawDealTerms.payToPlay,
              milestoneTranches: rawDealTerms.milestoneTranches,
              nonCompete: rawDealTerms.nonCompete,
              customConditions: rawDealTerms.customConditions,
              notes: rawDealTerms.notes,
            };
          }

          if (rawDealStructure?.mode === "STRUCTURED" && rawDealStructure.tranches.length > 0) {
            enrichedContext.dealStructure = {
              mode: "STRUCTURED",
              totalInvestment: rawDealStructure.tranches.reduce(
                (s, t) => s + (t.amount != null ? Number(t.amount) : 0), 0
              ),
              tranches: rawDealStructure.tranches.map(t => ({
                label: t.label || "Tranche",
                trancheType: t.trancheType,
                amount: t.amount != null ? Number(t.amount) : null,
                valuationPre: t.valuationPre != null ? Number(t.valuationPre) : null,
                equityPct: t.equityPct != null ? Number(t.equityPct) : null,
                triggerType: t.triggerType,
                triggerDetails: t.triggerDetails,
                status: t.status,
              })),
            };
          }

          enrichedContext.conditionsAnalystMode = "pipeline";
        };

        const tier3AgentMap = await getTier3Agents();
        const restoreFullTier3Context = (): void => {
          for (const [name, result] of Object.entries(allResults)) {
            enrichedContext.previousResults![name] = result;
          }
        };

        const runResumeTier3Batch = async (batch: readonly string[]): Promise<boolean> => {
          const pendingInBatch = batch.filter(
            (name) => !completedSet.has(name) && !failedSet.has(name)
          );

          if (pendingInBatch.length === 0) {
            return false;
          }

          onProgress?.({
            currentAgent: `resuming tier3 (${pendingInBatch.join(", ")})`,
            completedAgents: completedCount,
            totalAgents: analysis.totalAgents,
          });

          const recordTier3Result = async (agentName: string, result: AgentResult): Promise<void> => {
            if (result.success && "data" in result) {
              const { data: sanitized, totalViolations } = sanitizeAgentNarratives((result as { data: unknown }).data);
              if (totalViolations > 0) {
                console.warn(`[NarrativeSanitizer] ${agentName}: ${totalViolations} prescriptive violation(s) corrected`);
                (result as { data: unknown }).data = sanitized;
              }
            }

            allResults[agentName] = result;
            totalCost += result.cost;
            completedCount++;
            enrichedContext.previousResults![agentName] = result;

            if (result.success) {
              completedSet.add(agentName);
            } else {
              failedSet.add(agentName);
            }

            await processAgentResult(deal.id, agentName, result);

            if (
              agentName === "thesis-reconciler" &&
              enrichedContext.analysis?.mode !== "post_call_reanalysis"
            ) {
              await this.applyThesisReconciliation(enrichedContext, result);
            }
          };

          if (pendingInBatch.length === 1) {
            const agentName = pendingInBatch[0];
            const agent = tier3AgentMap[agentName];

            try {
              await recordTier3Result(agentName, await agent.run(enrichedContext));
            } catch (error) {
              await recordTier3Result(agentName, {
                agentName,
                success: false,
                executionTimeMs: 0,
                cost: 0,
                error: error instanceof Error ? error.message : "Unknown error",
              });
            }
          } else {
            const batchResults = await Promise.all(
              pendingInBatch.map(async (agentName) => {
                const agent = tier3AgentMap[agentName];
                try {
                  const result = await agent.run(enrichedContext);
                  return { agentName, result };
                } catch (error) {
                  return {
                    agentName,
                    result: {
                      agentName,
                      success: false,
                      executionTimeMs: 0,
                      cost: 0,
                      error: error instanceof Error ? error.message : "Unknown error",
                    } as AgentResult,
                  };
                }
              })
            );

            for (const { agentName, result } of batchResults) {
              await recordTier3Result(agentName, result);
            }
          }

          await updateAnalysisProgress(analysis.id, completedCount, totalCost);
          return true;
        };

        // applyResumeTier3Coherence retiré : il ajustait uniquement les
        // sorties scenario-modeler qui ne fait plus partie du pipeline (doctrine anti-oraculaire).

        await hydrateTier3Context();
        restoreFullTier3Context();

        if (isFullAnalysis && fullAnalysisTopology.includeFullTier3) {
          for (const batch of TIER3_BATCHES_BEFORE_TIER2) {
            await runResumeTier3Batch(batch);
          }
        }

        if (
          isFullAnalysis &&
          fullAnalysisTopology.includeTier2 &&
          sectorExpert &&
          !completedSet.has(sectorExpert.name) &&
          !failedSet.has(sectorExpert.name)
        ) {
          onProgress?.({
            currentAgent: `resuming tier2-${sectorExpert.name}`,
            completedAgents: completedCount,
            totalAgents: analysis.totalAgents,
          });

          try {
            const sectorResult = await sectorExpert.run(enrichedContext);
            allResults[sectorExpert.name] = sectorResult;
            totalCost += sectorResult.cost;
            completedCount++;
            enrichedContext.previousResults![sectorExpert.name] = sectorResult;

            if (sectorResult.success) {
              completedSet.add(sectorExpert.name);
            } else {
              failedSet.add(sectorExpert.name);
            }

            await processAgentResult(deal.id, sectorExpert.name, sectorResult);
            await updateAnalysisProgress(analysis.id, completedCount, totalCost);
          } catch (error) {
            const sectorError: AgentResult = {
              agentName: sectorExpert.name,
              success: false,
              executionTimeMs: 0,
              cost: 0,
              error: error instanceof Error ? error.message : "Unknown error",
            };
            allResults[sectorExpert.name] = sectorError;
            failedSet.add(sectorExpert.name);
            completedCount++;
          }
        }

        restoreFullTier3Context();

        const tier3Batches = isFullAnalysis
          ? TIER3_BATCHES_AFTER_TIER2
          : TIER3_EXECUTION_BATCHES;

        for (const batch of tier3Batches) {
          await runResumeTier3Batch(batch);
          // Tier 3 coherence retiré : ne servait qu'à scenario-modeler.
        }
      }

      // Complete the analysis — ensure state machine is in SYNTHESIZING
      // (the only state that allows transition to COMPLETED)
      const preCompleteState = stateMachine.getState();
      if (preCompleteState !== "SYNTHESIZING") {
        stateMachine.forceState("SYNTHESIZING", "resume_pre_complete");
      }
      await stateMachine.complete();

      const summary = generateFullAnalysisSummary(allResults);
      const totalTimeMs = Date.now() - startTime;
      const allSuccess = Object.values(allResults).every((r) => r.success);

      const successCount = Object.values(allResults).filter((r) => r.success).length;
      const failCount = Object.values(allResults).filter((r) => !r.success).length;
      console.log(
        `[Orchestrator:Resume] Saving final results: ${Object.keys(allResults).length} total ` +
        `(${successCount} success, ${failCount} failed), completedCount=${completedCount}, allSuccess=${allSuccess}`
      );

      await saveCheckpoint(analysis.id, {
        state: "COMPLETED",
        completedAgents: Object.keys(allResults),
        pendingAgents: [],
        failedAgents: Object.entries(allResults)
          .filter(([, result]) => !result.success)
          .map(([agent, result]) => ({
            agent,
            error: result.error ?? "no error msg",
            retries: 1,
          })),
        findings: extractAllFindings(allResults).allFindings,
        results: allResults,
        totalCost,
        startTime: new Date(startTime).toISOString(),
      });

      // SAFETY: Never overwrite existing results with fewer entries
      const existingResultsRaw = await loadResults(analysis.id, {
        preferDb: true,
        backfillCache: false,
      });
      const existingResults = toAgentResultsRecord(existingResultsRaw);
      const existingCount = existingResults ? Object.keys(existingResults).length : 0;
      if (Object.keys(allResults).length < existingCount) {
        console.error(
          `[Orchestrator:Resume] ABORT SAVE: allResults (${Object.keys(allResults).length}) < existing DB results (${existingCount}). Keeping existing results.`
        );
        // Merge: keep existing, add new
        const existing = { ...(existingResults ?? {}) };
        for (const [key, val] of Object.entries(allResults)) {
          if (val && val.success) {
            existing[key] = val; // only overwrite with successful results
          }
        }
        await completeAnalysis({
          analysisId: analysis.id,
          success: allSuccess,
          totalCost,
          totalTimeMs,
          summary: `${summary}\n\n**Resumed from checkpoint** - Analysis recovered after interruption`,
          results: existing,
          mode: analysis.mode ?? "full_analysis",
        });
      } else {
        await completeAnalysis({
          analysisId: analysis.id,
          success: allSuccess,
          totalCost,
          totalTimeMs,
          summary: `${summary}\n\n**Resumed from checkpoint** - Analysis recovered after interruption`,
          results: allResults,
          mode: analysis.mode ?? "full_analysis",
        });
      }

      await updateDealStatus(deal.id, "IN_DD");

      console.log(
        `[Orchestrator] Successfully resumed and completed analysis ${analysisId}`
      );

      return this.addWarningsToResult(
        {
          sessionId: analysis.id,
          dealId: deal.id,
          type: analysis.type as AnalysisType,
          success: allSuccess,
          results: allResults,
          totalCost,
          totalTimeMs,
          summary,
          resumedFromCheckpoint: true,
        },
        collectedWarnings
      );
    } catch (error) {
      // Handle failure during resume
      const currentStateAfterError = stateMachine.getState();
      if (currentStateAfterError !== "COMPLETED" && currentStateAfterError !== "FAILED") {
        try {
          await stateMachine.fail(error instanceof Error ? error : new Error("Unknown error"));
        } catch (_smErr) {
          console.error("[Orchestrator:Resume] State machine fail() also threw:", _smErr);
        }
      }

      const totalTimeMs = Date.now() - startTime;

      // SAFETY: Never overwrite existing results with fewer entries on failure
      try {
        const existingOnErrorRaw = await loadResults(analysis.id, {
          preferDb: true,
          backfillCache: false,
        });
        const existingOnError = toAgentResultsRecord(existingOnErrorRaw);
        const existingCountOnError = existingOnError ? Object.keys(existingOnError).length : 0;

        let resultsToSave = allResults;
        if (Object.keys(allResults).length < existingCountOnError) {
          console.error(
            `[Orchestrator:Resume] CATCH SAFETY: allResults (${Object.keys(allResults).length}) < existing (${existingCountOnError}). Merging into existing.`
          );
          const existing = { ...(existingOnError ?? {}) };
          for (const [key, val] of Object.entries(allResults)) {
            if (val && val.success) existing[key] = val;
          }
          resultsToSave = existing;
        }

        await completeAnalysis({
          analysisId: analysis.id,
          success: false,
          totalCost,
          totalTimeMs,
          summary: `Resume failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          results: resultsToSave,
          mode: analysis.mode ?? "full_analysis",
          statusOverride: "FAILED",
        });
      } catch (saveErr) {
        console.error("[Orchestrator:Resume] Failed to save results on error:", saveErr);
      }

      throw error;
    }
  }

  /**
   * Cancel an interrupted analysis (mark as failed without attempting recovery)
   */
  async cancelInterruptedAnalysis(analysisId: string, reason?: string): Promise<void> {
    await markAnalysisAsFailed(
      analysisId,
      reason ?? "Cancelled by user"
    );
    console.log(`[Orchestrator] Cancelled interrupted analysis ${analysisId}`);
  }
}

function gradeFromScore(score: number): string {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

// Export singleton
export const orchestrator = new AgentOrchestrator();
