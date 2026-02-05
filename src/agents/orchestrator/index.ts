import type { Deal } from "@prisma/client";
import type {
  AgentContext,
  AgentResult,
  EnrichedAgentContext,
  AnalysisAgentResult,
} from "../types";
import { enrichDeal, invalidateDealContext, getContextEngineCacheStats, type FounderInput } from "@/services/context-engine";
import { getCacheManager } from "@/services/cache";
import { prisma } from "@/lib/prisma";
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
  calculateGrossMargin,
  calculateLTVCACRatio,
  calculateRuleOf40,
} from "../orchestration";
import type { ScoredFinding, ConfidenceScore } from "@/scoring/types";
import { applyTier3Coherence, injectCoherenceIntoContext } from "../orchestration/tier3-coherence";
import { costMonitor } from "@/services/cost-monitor";
import { querySimilarDeals, getValuationBenchmarks } from "@/services/funding-db";
import { setAgentContext, setAnalysisContext } from "@/services/openrouter/router";
import { runJob } from "@/services/jobs";

// Fact Store imports for Tier 0 fact extraction
import { factExtractorAgent, type FactExtractorOutput } from "@/agents/tier0/fact-extractor";
import { deckCoherenceChecker, type DeckCoherenceReport } from "@/agents/tier0/deck-coherence-checker";
import {
  getCurrentFacts,
  formatFactStoreForAgents,
  createFactEventsBatch,
  updateFactsInMemory,
  reformatFactStoreWithValidations,
} from "@/services/fact-store";
import type { CurrentFact, FactCategory } from "@/services/fact-store/types";

// Import modular components
import {
  type AnalysisOptions,
  type AnalysisResult,
  type AnalysisType,
  type AdvancedAnalysisOptions,
  type UserPlan,
  ANALYSIS_CONFIGS,
  AGENT_COUNTS,
  TIER1_AGENT_NAMES,
  TIER1_PHASE_A,
  TIER1_PHASE_B,
  TIER1_PHASE_C,
  TIER1_PHASE_D,
  TIER1_ALWAYS_REFLECT_PHASES,
  TIER3_AGENT_NAMES,
  TIER3_DEPENDENCIES,
  TIER3_EXECUTION_BATCHES,
  TIER3_BATCHES_BEFORE_TIER2,
  TIER3_BATCHES_AFTER_TIER2,
  resolveAgentDependencies,
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

// Re-export types
export type { AnalysisOptions, AnalysisResult, AnalysisType, EarlyWarning, UserPlan };

/**
 * Infer FactCategory from a factKey prefix.
 * Example: "financial.arr" → "FINANCIAL", "team.cto_experience" → "TEAM"
 */
function inferCategoryFromFactKey(factKey: string): FactCategory {
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
  documents: { id: string; name: string; type: string; extractedText: string | null }[];
  founders?: { id: string; name: string; role: string; linkedinUrl: string | null }[];
};

export class AgentOrchestrator {
  /**
   * Run a complete analysis session
   *
   * CACHING: Before running any analysis, checks if a valid cached result exists.
   * A cached result is valid if:
   * 1. The deal fingerprint matches (deal hasn't changed)
   * 2. The cache hasn't expired (24h TTL)
   * 3. The analysis mode and useReAct setting match
   *
   * Use forceRefresh: true to bypass cache and force re-analysis.
   */
  async runAnalysis(options: AnalysisOptions): Promise<AnalysisResult> {
    const {
      dealId,
      type,
      onProgress,
      useReAct = false, // Deprecated: always use Standard agents
      enableTrace = true, // Enable traces by default for transparency
      forceRefresh = false,
      mode = "full",
      failFastOnCritical = false,
      maxCostUsd,
      onEarlyWarning,
      isUpdate = false, // If true, uses UPDATE_ANALYSIS credits (2) vs INITIAL_ANALYSIS (5)
      userPlan = "FREE",
    } = options;
    const startTime = Date.now();

    // Get deal with documents
    const deal = await getDealWithRelations(dealId);
    if (!deal) {
      throw new Error(`Deal not found: ${dealId}`);
    }

    // Initialize cost tracking (will be completed by specific analysis methods)
    // Note: analysisId is not available yet, will be set after createAnalysis

    // === CACHE CHECK ===
    // Only check cache for expensive analysis types
    const cacheableTypes: AnalysisType[] = ["tier1_complete", "tier3_synthesis", "tier2_sector", "full_analysis"];

    if (!forceRefresh && cacheableTypes.includes(type)) {
      const cachedResult = await this.checkAnalysisCache(dealId, type, useReAct);
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
        result = await this.runTier1Analysis(deal as DealWithDocs, dealId, onProgress, false, {
          mode,
          failFastOnCritical,
          maxCostUsd,
          onEarlyWarning,
          enableTrace,
          isUpdate,
          userPlan,
        });
        break;
      case "full_analysis":
        result = await this.runFullAnalysis(deal as DealWithDocs, dealId, onProgress, false, {
          mode,
          failFastOnCritical,
          maxCostUsd,
          onEarlyWarning,
          enableTrace,
          isUpdate,
          userPlan,
        });
        break;
      case "tier3_synthesis":
        result = await this.runTier3Synthesis(deal as DealWithDocs, dealId, onProgress, onEarlyWarning);
        break;
      case "tier2_sector":
        result = await this.runTier2SectorAnalysis(deal as DealWithDocs, dealId, onProgress, useReAct);
        break;
      default:
        result = await this.runBaseAnalysis(deal as DealWithDocs, dealId, type, onProgress, onEarlyWarning, startTime);
    }

    // === STORE FINGERPRINT FOR CACHE ===
    if (cacheableTypes.includes(type) && result.success) {
      await this.storeAnalysisFingerprint(dealId, result.sessionId, useReAct);
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
    useReAct: boolean
  ): Promise<AnalysisResult | null> {
    try {
      // Get deal for fingerprint
      const dealForFingerprint = await getDealForFingerprint(dealId);
      if (!dealForFingerprint) return null;

      // Generate current fingerprint
      const fingerprint = generateDealFingerprint(dealForFingerprint);

      // Lookup cached analysis
      const mode = type; // mode in DB matches type
      const cached = await lookupCachedAnalysis(dealId, mode, fingerprint, useReAct);

      if (!cached.found || !cached.analysis) return null;

      // Parse results from JSON (Prisma Json type needs cast through unknown)
      const results = (cached.analysis.results ?? {}) as unknown as Record<string, AgentResult>;

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
    useReAct: boolean
  ): Promise<void> {
    try {
      const dealForFingerprint = await getDealForFingerprint(dealId);
      if (!dealForFingerprint) return;

      const fingerprint = generateDealFingerprint(dealForFingerprint);

      // Import prisma for direct update
      const { prisma } = await import("@/lib/prisma");
      await prisma.analysis.update({
        where: { id: analysisId },
        data: {
          dealFingerprint: fingerprint,
          useReAct,
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
    startTime: number
  ): Promise<AnalysisResult> {
    const config = ANALYSIS_CONFIGS[type];
    const collectedWarnings: EarlyWarning[] = [];

    // Get document IDs for versioning
    const documentIds = (deal.documents as Array<{ id: string; processingStatus?: string }>)
      .filter((d) => d.processingStatus === "COMPLETED")
      .map((d) => d.id);

    // Create analysis record
    const analysis = await createAnalysis({
      dealId,
      type,
      totalAgents: config.agents.length,
      documentIds,
    });

    // Set analysis context for LLM logging
    setAnalysisContext(analysis.id);

    // Build context
    const context: AgentContext = {
      dealId,
      deal,
      documents: deal.documents,
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
      mode: type,
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
    _useReAct: boolean, // Deprecated: always use Standard agents
    advancedOptions: AdvancedAnalysisOptions
  ): Promise<AnalysisResult> {
    const { mode, failFastOnCritical, maxCostUsd, onEarlyWarning, enableTrace = true, isUpdate = false } = advancedOptions;
    const startTime = Date.now();
    const TIER1_AGENT_COUNT = TIER1_AGENT_NAMES.length; // 13
    const collectedWarnings: EarlyWarning[] = [];

    // Get document IDs for versioning
    const documentIds = (deal.documents as Array<{ id: string; processingStatus?: string }>)
      .filter((d) => d.processingStatus === "COMPLETED")
      .map((d) => d.id);

    const analysis = await createAnalysis({
      dealId,
      type: "tier1_complete",
      totalAgents: TIER1_AGENT_COUNT + 2, // +1 extractor +1 fact-extractor
      documentIds,
    });

    // Set analysis context for LLM logging
    setAnalysisContext(analysis.id);

    const results: Record<string, AgentResult> = {};
    let totalCost = 0;

    // Build base context
    const baseContext: AgentContext = {
      dealId,
      deal,
      documents: deal.documents,
      previousResults: {},
    };

    // STEP 0: Run Tier 0 Fact Extraction (BEFORE document-extractor)
    // This extracts structured facts that will be available to all agents
    let factStore: CurrentFact[] = [];
    let factStoreFormatted = "";

    if (deal.documents.length > 0) {
      const tier0Result = await this.runTier0FactExtraction(deal, isUpdate, onProgress);
      factStore = tier0Result.factStore;
      factStoreFormatted = tier0Result.factStoreFormatted;
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
    let extractedData: {
      tagline?: string;
      competitors?: string[];
      founders?: Array<{ name: string; role?: string; linkedinUrl?: string }>;
      productDescription?: string;
      businessModel?: string;
    } = {};

    if (deal.documents.length > 0) {
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
        if (extractorResult.success && "data" in extractorResult) {
          const data = (extractorResult as { data: Record<string, unknown> }).data;
          extractedData = {
            tagline: data.tagline as string | undefined,
            competitors: data.competitors as string[] | undefined,
            founders: data.founders as Array<{ name: string; role?: string; linkedinUrl?: string }> | undefined,
            productDescription: data.productDescription as string | undefined,
            businessModel: data.businessModel as string | undefined,
          };
          console.log(`[Orchestrator] tier1_complete: Extracted data for Context Engine: tagline=${!!extractedData.tagline}, competitors=${extractedData.competitors?.length ?? 0}`);
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
    if (deal.documents.length > 0 && results["document-extractor"]?.success) {
      const coherenceResult = await this.runDeckCoherenceCheck(
        deal,
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
    const contextEngineData = await this.enrichContext(deal, extractedData);

    // Build enriched context for Tier 1 agents with Fact Store
    const enrichedContext: EnrichedAgentContext = {
      ...baseContext,
      contextEngine: contextEngineData,
      factStore,
      factStoreFormatted,
      deckCoherenceReport: deckCoherenceReport ?? undefined,
    };

    // STEP 3: Run Tier 1 agents in 4 sequential phases (A→B→C→D)
    const tier1AgentMap = await getTier1Agents(false);
    let completedCount = deal.documents.length > 0 ? 1 : 0;

    const phasesResult = await this.runTier1Phases({
      enrichedContext,
      tier1AgentMap,
      analysisId: analysis.id,
      deal,
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
      enrichedContext, extractedData ?? {}, phasesResult.updatedFactStoreFormatted, deal
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
      mode: "tier1_complete",
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
   * - Batch 1 (parallel): contradiction-detector, scenario-modeler, devils-advocate
   * - Batch 2 (sequential): synthesis-deal-scorer (needs batch 1)
   * - Batch 3 (sequential): memo-generator (needs all)
   */
  private async runTier3Synthesis(
    deal: DealWithDocs,
    dealId: string,
    onProgress: AnalysisOptions["onProgress"],
    onEarlyWarning?: OnEarlyWarning,
    tier1Results?: Record<string, AgentResult>,
    maxCostUsd?: number
  ): Promise<AnalysisResult> {
    const startTime = Date.now();
    const TIER3_AGENT_COUNT = 5;
    const collectedWarnings: EarlyWarning[] = [];

    // Get document IDs for versioning
    const documentIds = (deal.documents as Array<{ id: string; processingStatus?: string }>)
      .filter((d) => d.processingStatus === "COMPLETED")
      .map((d) => d.id);

    const analysis = await createAnalysis({
      dealId,
      type: "tier3_synthesis",
      totalAgents: TIER3_AGENT_COUNT,
      documentIds,
    });

    // Set analysis context for LLM logging
    setAnalysisContext(analysis.id);

    const results: Record<string, AgentResult> = {};
    let totalCost = 0;

    // Load BA preferences for Tier 3 personalization
    const baPreferences = await this.loadBAPreferences(deal.userId);

    const context: EnrichedAgentContext = {
      dealId,
      deal,
      documents: deal.documents,
      previousResults: tier1Results ?? {},
      baPreferences, // Only passed to Tier 3 agents
    };

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

      // After first batch (parallel), apply Tier 3 coherence check
      if (batch === TIER3_EXECUTION_BATCHES[0]) {
        const coherenceResult = applyTier3Coherence(context.previousResults!);
        if (coherenceResult.adjusted) {
          injectCoherenceIntoContext(context.previousResults!, coherenceResult);
          console.log(`[Tier3Synthesis] Coherence: ${coherenceResult.adjustments.length} adjustments (score was ${coherenceResult.coherenceScore}/100)`);
        }
        context.tier3CoherenceResult = {
          adjusted: coherenceResult.adjusted,
          adjustments: coherenceResult.adjustments,
          coherenceScore: coherenceResult.coherenceScore,
          warnings: coherenceResult.warnings,
        };
        // Persist coherence trace
        await persistReasoningTrace(analysis.id, "tier3-coherence", {
          taskDescription: "Vérification cohérence inter-agents Tier 3",
          totalIterations: 1,
          finalConfidence: coherenceResult.coherenceScore,
          executionTimeMs: 0,
          selfCritique: {
            adjusted: coherenceResult.adjusted,
            adjustmentCount: coherenceResult.adjustments.length,
            adjustments: coherenceResult.adjustments,
            warnings: coherenceResult.warnings,
          },
        });
      }
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
      mode: "tier3_synthesis",
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
    _useReAct: boolean,
    previousResults?: Record<string, AgentResult>
  ): Promise<AnalysisResult> {
    const startTime = Date.now();

    const sectorExpert = await getTier2SectorExpert(deal.sector);

    if (!sectorExpert) {
      return {
        sessionId: "",
        dealId,
        type: "tier2_sector",
        success: true,
        results: {},
        totalCost: 0,
        totalTimeMs: Date.now() - startTime,
        summary: `No sector expert available for sector: ${deal.sector ?? "unknown"}`,
      };
    }

    // Get document IDs for versioning
    const documentIds = (deal.documents as Array<{ id: string; processingStatus?: string }>)
      .filter((d) => d.processingStatus === "COMPLETED")
      .map((d) => d.id);

    const analysis = await createAnalysis({
      dealId,
      type: "tier2_sector",
      totalAgents: 1,
      mode: "tier2_sector",
      documentIds,
    });

    // Set analysis context for LLM logging
    setAnalysisContext(analysis.id);

    const results: Record<string, AgentResult> = {};
    let totalCost = 0;

    // Extract data from previous document-extractor result (from Tier 1)
    let extractedData: {
      tagline?: string;
      competitors?: string[];
      founders?: Array<{ name: string; role?: string; linkedinUrl?: string }>;
      productDescription?: string;
      businessModel?: string;
    } = {};

    const extractorResult = previousResults?.["document-extractor"];
    if (extractorResult?.success && extractorResult && "data" in extractorResult) {
      const data = (extractorResult as { data: Record<string, unknown> }).data;
      extractedData = {
        tagline: data.tagline as string | undefined,
        competitors: data.competitors as string[] | undefined,
        founders: data.founders as Array<{ name: string; role?: string; linkedinUrl?: string }> | undefined,
        productDescription: data.productDescription as string | undefined,
        businessModel: data.businessModel as string | undefined,
      };
    }

    const contextEngineData = await this.enrichContext(deal, extractedData);

    const context: EnrichedAgentContext = {
      dealId,
      deal,
      documents: deal.documents,
      previousResults: previousResults ?? {},
      contextEngine: contextEngineData,
    };

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
  private async runFullAnalysis(
    deal: DealWithDocs,
    dealId: string,
    onProgress: AnalysisOptions["onProgress"],
    useReAct: boolean,
    advancedOptions: AdvancedAnalysisOptions
  ): Promise<AnalysisResult> {
    const { mode, failFastOnCritical, maxCostUsd, onEarlyWarning, isUpdate = false, userPlan = "FREE" } = advancedOptions;
    const startTime = Date.now();
    const collectedWarnings: EarlyWarning[] = [];

    // Determine available tiers based on user plan
    const availableTiers = userPlan === "PRO"
      ? ["TIER_1", "TIER_2", "TIER_3", "SYNTHESIS"]
      : ["TIER_1", "SYNTHESIS"]; // FREE: Tier 1 + synthesis-deal-scorer only

    const includeTier2 = availableTiers.includes("TIER_2");
    const includeFullTier3 = availableTiers.includes("TIER_3");

    console.log(`[Orchestrator] Tier gating: plan=${userPlan}, tiers=${availableTiers.join(",")}`);

    const sectorExpert = includeTier2 ? await getTier2SectorExpert(deal.sector) : null;
    const hasSectorExpert = sectorExpert !== null;

    // Adjust total agent count based on plan
    // FREE: 12 Tier1 + 1 extractor + 1 fact-extractor + 1 synthesis-deal-scorer = 15
    // PRO:  12 Tier1 + 5 Tier3 + 1 extractor + 1 fact-extractor + (0-1 sector expert) = 19-20
    const tier3AgentCount = includeFullTier3 ? 5 : 1; // Only synthesis-deal-scorer for FREE
    const TOTAL_AGENTS = TIER1_AGENT_NAMES.length + tier3AgentCount + 1 + 1 + (hasSectorExpert ? 1 : 0);

    // Get document IDs for versioning
    const documentIds = (deal.documents as Array<{ id: string; processingStatus?: string }>)
      .filter((d) => d.processingStatus === "COMPLETED")
      .map((d) => d.id);

    const analysis = await createAnalysis({
      dealId,
      type: "full_analysis",
      totalAgents: TOTAL_AGENTS,
      documentIds,
    });

    // Set analysis context for LLM logging
    setAnalysisContext(analysis.id);

    // Initialize cost monitoring
    costMonitor.startAnalysis({
      analysisId: analysis.id,
      dealId,
      userId: deal.userId,
      type: "full_analysis",
      useReAct,
    });

    // Initialize State Machine
    const stateMachine = new AnalysisStateMachine({
      analysisId: analysis.id,
      dealId,
      mode: "full_analysis",
      agents: ["document-extractor", ...TIER1_AGENT_NAMES, ...TIER3_AGENT_NAMES],
      enableCheckpointing: true,
    });

    stateMachine.onStateChange(async (from, to, trigger) => {
      console.log(`[StateMachine] ${from} → ${to} (${trigger})`);
      await persistStateTransition(analysis.id, from, to, trigger);
    });

    messageBus.clear();

    const allResults: Record<string, AgentResult> = {};
    let totalCost = 0;
    let completedCount = 0;

    // Variables for fact store (will be populated in Tier 0)
    let factStore: CurrentFact[] = [];
    let factStoreFormatted = "";

    try {
      await stateMachine.start();

      const baseContext: AgentContext = {
        dealId,
        deal,
        documents: deal.documents,
        previousResults: {},
      };

      // STEP 0: TIER 0 FACT EXTRACTION (runs BEFORE everything)
      // Extracts structured facts that will be available to all agents
      if (deal.documents.length > 0) {
        const tier0Result = await this.runTier0FactExtraction(deal, isUpdate, onProgress);
        factStore = tier0Result.factStore;
        factStoreFormatted = tier0Result.factStoreFormatted;
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

      // STEP 1: DOCUMENT EXTRACTION (must run first)
      // We need extracted data (tagline, competitors, founders) for Context Engine
      await stateMachine.startExtraction();

      onProgress?.({
        currentAgent: "document-extractor",
        completedAgents: completedCount,
        totalAgents: TOTAL_AGENTS,
      });

      // Extract data from documents first
      let extractedData: {
        tagline?: string;
        competitors?: string[];
        founders?: Array<{ name: string; role?: string; linkedinUrl?: string }>;
        productDescription?: string;
        businessModel?: string;
      } = {};

      if (deal.documents.length > 0) {
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
          if (extractorResult.success && "data" in extractorResult) {
            const data = (extractorResult as { data: Record<string, unknown> }).data;
            extractedData = {
              tagline: data.tagline as string | undefined,
              competitors: data.competitors as string[] | undefined,
              founders: data.founders as Array<{ name: string; role?: string; linkedinUrl?: string }> | undefined,
              productDescription: data.productDescription as string | undefined,
              businessModel: data.businessModel as string | undefined,
            };
            console.log(`[Orchestrator] Extracted data for Context Engine: tagline=${!!extractedData.tagline}, competitors=${extractedData.competitors?.length ?? 0}, founders=${extractedData.founders?.length ?? 0}`);
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

      // STEP 1.5: DECK COHERENCE CHECK (Tier 0.5)
      // Verifies data consistency before Tier 1 agents analyze
      let deckCoherenceReport: DeckCoherenceReport | null = null;
      if (deal.documents.length > 0 && allResults["document-extractor"]?.success) {
        const coherenceResult = await this.runDeckCoherenceCheck(
          deal,
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

      // STEP 2: CONTEXT ENGINE (runs AFTER extraction to use extracted data)
      await stateMachine.startGathering();

      onProgress?.({
        currentAgent: "context-engine",
        completedAgents: completedCount,
        totalAgents: TOTAL_AGENTS,
      });

      const contextEngineData = await this.enrichContext(deal, extractedData);

      // Build enriched context with Fact Store for all agents
      const enrichedContext: EnrichedAgentContext = {
        ...baseContext,
        contextEngine: contextEngineData,
        factStore,
        factStoreFormatted,
        deckCoherenceReport: deckCoherenceReport ?? undefined,
      };

      // STEP 3: ANALYSIS PHASE - Tier 1 Agents in 4 Sequential Phases
      // Phase A: deck-forensics → validates deck claims
      // Phase B: financial-auditor → validates financial metrics
      // Phase C: team + competitive + market (parallel) → using validated facts
      // Phase D: remaining 8 agents (parallel) → using all validated facts
      await stateMachine.startAnalysis();

      const tier1AgentMap = await getTier1Agents(useReAct);

      const phasesResult = await this.runTier1Phases({
        enrichedContext,
        tier1AgentMap,
        analysisId: analysis.id,
        deal,
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

      const { allFindings, agentConfidences, lowConfidenceAgents } = phasesResult;
      totalCost += phasesResult.costIncurred;
      completedCount += phasesResult.completedInPhases;
      factStore = phasesResult.updatedFactStore;
      factStoreFormatted = phasesResult.updatedFactStoreFormatted;

      // Rebuild verificationContext for global consensus and downstream use
      const verificationContext = await this.buildVerificationContext(
        enrichedContext, extractedData, factStoreFormatted, deal
      );

      // Publish all findings to message bus
      for (const finding of allFindings) {
        await messageBus.publish(createFindingMessage(finding.agentName, "*", finding));
      }

      // Persist all findings
      if (allFindings.length > 0) {
        await persistScoredFindings(analysis.id, "tier1-aggregate", allFindings);
      }

      console.log(
        `[Orchestrator] Extracted ${allFindings.length} findings from ${Object.keys(allResults).length} agents. ` +
        `Low confidence agents: ${lowConfidenceAgents.join(", ") || "none"}`
      );

      // FAIL-FAST: Check for critical warnings after Tier 1
      if (failFastOnCritical) {
        const criticalWarnings = collectedWarnings.filter(w => w.severity === "critical");
        if (criticalWarnings.length > 0) {
          console.log(`[Orchestrator] FAIL-FAST: ${criticalWarnings.length} critical warning(s) detected`);
          await stateMachine.complete();

          const summary = `**CRITICAL WARNINGS DETECTED - Analysis stopped early**\n\n${criticalWarnings.map(w => `- ${w.title}: ${w.description}`).join("\n")}`;
          const totalTimeMs = Date.now() - startTime;

          await costMonitor.endAnalysis();

          await completeAnalysis({
            analysisId: analysis.id,
            success: true,
            totalCost,
            totalTimeMs,
            summary,
            results: allResults,
            mode: "full_analysis",
          });

          return this.addWarningsToResult({
            sessionId: analysis.id,
            dealId,
            type: "full_analysis",
            success: true,
            results: allResults,
            totalCost,
            totalTimeMs,
            summary,
            tiersExecuted: availableTiers,
          }, collectedWarnings);
        }
      }

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

      // Check cost limit before synthesis phase
      if (maxCostUsd && totalCost >= maxCostUsd) {
        console.log(`[Orchestrator] Cost limit reached ($${totalCost.toFixed(2)} >= $${maxCostUsd}), skipping remaining phases`);
        await stateMachine.complete();

        const summary = generateFullAnalysisSummary(allResults);
        const totalTimeMs = Date.now() - startTime;

        await costMonitor.endAnalysis();

        return this.addWarningsToResult({
          sessionId: analysis.id,
          dealId,
          type: "full_analysis",
          success: true,
          results: allResults,
          totalCost,
          totalTimeMs,
          summary: `${summary}\n\n**Note**: Analysis stopped early due to cost limit ($${maxCostUsd})`,
          tiersExecuted: availableTiers,
        }, collectedWarnings);
      }

      // STEP 5: SYNTHESIS PHASE - Tier 2 BEFORE Tier 3
      // Run contradiction-detector, scenario-modeler, devils-advocate in PARALLEL
      await stateMachine.startSynthesis();

      const tier3AgentMap = await getTier3Agents();

      // Load BA preferences for Tier 3 personalization (does NOT affect Tier 1/2)
      const baPreferences = await this.loadBAPreferences(deal.userId);
      enrichedContext.baPreferences = baPreferences;

      // Cost check before Tier 3 (pre-Tier2 batch: contradiction-detector, scenario-modeler, devils-advocate)
      // Skip for FREE plan (these are TIER_3 agents, not SYNTHESIS)
      if (includeFullTier3 && !(maxCostUsd && totalCost >= maxCostUsd)) {
        const tier3BeforeAgents = TIER3_BATCHES_BEFORE_TIER2[0]; // Single batch with 3 agents

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

        // Collect batch results
        for (const { agentName, result } of batchResults) {
          allResults[agentName] = result;
          totalCost += result.cost;
          completedCount++;
          enrichedContext.previousResults![agentName] = result;

          if (result.success) {
            stateMachine.recordAgentComplete(agentName, result as AnalysisAgentResult);
          } else {
            stateMachine.recordAgentFailed(agentName, result.error ?? "Unknown");
          }

          await processAgentResult(dealId, agentName, result);
        }

        await updateAnalysisProgress(analysis.id, completedCount, totalCost);

        onProgress?.({
          currentAgent: `tier3-parallel completed`,
          completedAgents: completedCount,
          totalAgents: TOTAL_AGENTS,
          estimatedCostSoFar: totalCost,
        });
        // STEP 5.5: TIER 3 COHERENCE CHECK (deterministic, no LLM)
        // Adjusts scenario-modeler outputs based on scepticism, T1 scores, red flags
        const coherenceResult = applyTier3Coherence(enrichedContext.previousResults!);
        if (coherenceResult.adjusted) {
          injectCoherenceIntoContext(enrichedContext.previousResults!, coherenceResult);
          console.log(`[Orchestrator] Tier 3 coherence: ${coherenceResult.adjustments.length} adjustments applied (score was ${coherenceResult.coherenceScore}/100)`);
        }
        // Store coherence result for synthesis-deal-scorer access
        enrichedContext.tier3CoherenceResult = {
          adjusted: coherenceResult.adjusted,
          adjustments: coherenceResult.adjustments,
          coherenceScore: coherenceResult.coherenceScore,
          warnings: coherenceResult.warnings,
        };
        // Persist coherence trace for observability
        await persistReasoningTrace(analysis.id, "tier3-coherence", {
          taskDescription: "Vérification cohérence inter-agents Tier 3",
          totalIterations: 1,
          finalConfidence: coherenceResult.coherenceScore,
          executionTimeMs: 0,
          selfCritique: {
            adjusted: coherenceResult.adjusted,
            adjustmentCount: coherenceResult.adjustments.length,
            adjustments: coherenceResult.adjustments,
            warnings: coherenceResult.warnings,
          },
        });

      } else if (!includeFullTier3) {
        console.log(`[Orchestrator] Tier 3 pre-synthesis agents skipped (FREE plan)`);
      } else {
        console.log(`[Orchestrator] Cost limit reached ($${totalCost.toFixed(2)} >= $${maxCostUsd}) - skipping Tier 3`);
      }

      // STEP 6: SECTOR EXPERT PHASE - Tier 2 (if available, PRO plan only)
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
              `Deal: ${deal.name}, Sector: ${deal.sector}`,
              2,
              verificationContext,
              allResults,
              enrichedContext
            );
          }
        }
      }

      // STEP 7: FINAL SYNTHESIS - Tier 3 AFTER Tier 2
      // FREE plan: only synthesis-deal-scorer; PRO plan: synthesis-deal-scorer + memo-generator
      const finalSynthesisBatches = includeFullTier3
        ? TIER3_BATCHES_AFTER_TIER2
        : [TIER3_BATCHES_AFTER_TIER2[0]]; // Only synthesis-deal-scorer for FREE

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

          onProgress?.({
            currentAgent: agentName,
            completedAgents: completedCount,
            totalAgents: TOTAL_AGENTS,
            latestResult: agentResult,
            estimatedCostSoFar: totalCost,
          });
        }
      }

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

      // End cost monitoring
      const costReport = await costMonitor.endAnalysis();
      if (costReport) {
        console.log(`[CostMonitor] Analysis completed: $${costReport.totalCost.toFixed(4)} (${costReport.totalCalls} calls)`);
      }

      // DEBUG log removed for production - uncomment for debugging:
      // console.log(`[Orchestrator:DEBUG] allSuccess=${allSuccess}, calling completeAnalysis...`);
      await completeAnalysis({
        analysisId: analysis.id,
        success: allSuccess,
        totalCost,
        totalTimeMs,
        summary: `${summary}\n\n**Orchestration**: ${orchestrationSummary.transitions} state transitions, ${orchestrationSummary.totalFindings} findings`,
        results: allResults,
        mode: "full_analysis",
      });
      // DEBUG log removed for production - uncomment for debugging:
      // console.log("[Orchestrator:DEBUG] completeAnalysis done, updating deal status...");

      await updateDealStatus(dealId, "IN_DD");
      // DEBUG log removed for production - uncomment for debugging:
      // console.log("[Orchestrator:DEBUG] All done, returning result");

      return this.addWarningsToResult({
        sessionId: analysis.id,
        dealId,
        type: "full_analysis",
        success: allSuccess,
        results: allResults,
        totalCost,
        totalTimeMs,
        summary,
        tiersExecuted: availableTiers,
      }, collectedWarnings);
    } catch (error) {
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

      // End cost monitoring on error
      await costMonitor.endAnalysis();

      await completeAnalysis({
        analysisId: analysis.id,
        success: false,
        totalCost,
        totalTimeMs,
        summary: `Analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        results: allResults,
        mode: "full_analysis",
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
        tiersExecuted: availableTiers,
      }, collectedWarnings);
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
  private async runTier1Phases(params: {
    enrichedContext: EnrichedAgentContext;
    tier1AgentMap: Record<string, { run: (ctx: EnrichedAgentContext) => Promise<AgentResult> }>;
    analysisId: string;
    deal: DealWithDocs;
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
      enrichedContext, tier1AgentMap, analysisId, deal, dealId,
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
      enrichedContext, extractedData, factStoreFormatted, deal
    );

    const tier1Phases: { name: string; agents: readonly string[] }[] = [
      { name: "Phase A: deck-forensics", agents: TIER1_PHASE_A },
      { name: "Phase B: financial-auditor", agents: TIER1_PHASE_B },
      { name: "Phase C: team + competitive + market", agents: TIER1_PHASE_C },
      { name: "Phase D: remaining agents", agents: TIER1_PHASE_D },
    ];

    for (const phase of tier1Phases) {
      onProgress?.({
        currentAgent: `tier1 ${phase.name}`,
        completedAgents: completedCount,
        totalAgents,
        estimatedCostSoFar: params.initialTotalCost + totalCost,
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
        allResults[agentName] = result;
        totalCost += result.cost;
        completedCount++;
        enrichedContext.previousResults![agentName] = result;

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

      // Inline reflexion for this phase
      // Phases A and B: ALWAYS apply reflexion (critical foundation agents)
      // Phases C and D: only apply if agent confidence < 70%
      for (const { agentName, result } of phaseResults) {
        if (!result.success) continue;

        const confidence = phaseConfidences.get(agentName);
        const alwaysReflect = (TIER1_ALWAYS_REFLECT_PHASES as ReadonlyArray<string>).includes(agentName);
        const needsReflect = alwaysReflect || (confidence && confidence.score < 70);

        if (needsReflect) {
          const agentFindings = allFindings.filter(f => f.agentName === agentName);
          const reflexionStats = await this.applyReflexion(
            analysisId,
            agentName,
            result as AnalysisAgentResult,
            agentFindings,
            `Deal: ${deal.name}, Sector: ${deal.sector}`,
            1,
            verificationContext,
            allResults,
            enrichedContext
          );
          totalCost += reflexionStats.tokensUsed * 0.00001;
        }
      }

      // Extract validated claims and update fact store in memory
      for (const agentName of phase.agents) {
        const result = allResults[agentName];
        if (result?.success) {
          const validations = extractValidatedClaims(result, agentName);
          if (validations.length > 0) {
            allValidations.push(...validations);
            updateFactsInMemory(factStore, validations);
            factStoreFormatted = reformatFactStoreWithValidations(factStore, allValidations);
            enrichedContext.factStore = factStore;
            enrichedContext.factStoreFormatted = factStoreFormatted;
            console.log(`[Orchestrator:${phase.name}] ${agentName}: ${validations.length} fact validations applied`);
          }
        }
      }

      // Rebuild verificationContext after Phase B and Phase C (factStoreFormatted has changed)
      if (phase.name.includes("Phase B") || phase.name.includes("Phase C")) {
        verificationContext = await this.buildVerificationContext(
          enrichedContext, extractedData, factStoreFormatted, deal
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

      await updateAnalysisProgress(analysisId, completedCount, params.initialTotalCost + totalCost);

      console.log(`[Orchestrator] ${phase.name} complete (${phase.agents.length} agents)`);
    }

    // Persist validated facts to DB (event sourcing)
    // Only persist facts with actual corrected values (not just analysis notes)
    if (allValidations.length > 0) {
      const factEvents = allValidations
        .filter(v => v.status === 'VERIFIED' || v.status === 'CONTRADICTED')
        .filter(v => v.correctedValue !== undefined && v.correctedValue !== null)
        .map(v => ({
          factKey: v.factKey,
          category: inferCategoryFromFactKey(v.factKey),
          value: v.correctedValue,
          displayValue: v.correctedDisplayValue ?? String(v.correctedValue),
          source: 'DATA_ROOM' as const,
          sourceConfidence: v.newConfidence,
          extractedText: v.explanation,
        }));
      if (factEvents.length > 0) {
        await createFactEventsBatch(dealId, factEvents, 'RESOLVED', 'system');
        console.log(`[Orchestrator] Persisted ${factEvents.length} validated facts to DB`);
      }
    }

    // Extract global confidences for downstream use
    const { agentConfidences, lowConfidenceAgents } = extractAllFindings(allResults);

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
    onProgress?: AnalysisOptions["onProgress"]
  ): Promise<{
    factStore: CurrentFact[];
    factStoreFormatted: string;
    extractionResult: FactExtractorOutput | null;
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
      // Load existing facts if this is an update (for contradiction detection)
      let existingFacts: CurrentFact[] = [];
      if (isUpdate) {
        existingFacts = await getCurrentFacts(deal.id);
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
        deal,
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
              source: f.currentSource,
              sourceConfidence: f.currentConfidence,
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
              extractedText: fact.extractedText,
            })),
            "CREATED", // eventType: new facts being created
            "system"
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
      // Build context for coherence checker
      const coherenceContext: AgentContext = {
        dealId: deal.id,
        deal,
        documents: deal.documents,
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prefs = (user as unknown as { investmentPreferences?: unknown })?.investmentPreferences;
      return getBAPreferences(prefs as Parameters<typeof getBAPreferences>[0]);
    } catch (error) {
      console.error("[Orchestrator] Failed to load BA preferences:", error);
      return getBAPreferences(null);
    }
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
    extractedData?: {
      tagline?: string;
      competitors?: string[];
      founders?: Array<{ name: string; role?: string; linkedinUrl?: string }>;
      productDescription?: string;
      businessModel?: string;
    }
  ): Promise<EnrichedAgentContext["contextEngine"]> {
    try {
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

      console.log(`[Orchestrator] Context Engine enrichment with: tagline=${!!extractedData?.tagline}, competitors=${extractedData?.competitors?.length ?? 0}, founders=${mergedFounders.length}`);

      const contextResult = await enrichDeal(
        {
          companyName: deal.companyName ?? deal.name,
          sector: deal.sector ?? undefined,
          stage: deal.stage ?? undefined,
          geography: deal.geography ?? undefined,
        },
        {
          dealId: deal.id,
          includeFounders: hasFoundersToEnrich,
          founders: hasFoundersToEnrich ? mergedFounders : undefined,
          startupSector: deal.sector ?? undefined,
          // Pass extracted data for richer context
          extractedTagline: extractedData?.tagline,
          extractedCompetitors: extractedData?.competitors,
          extractedProductDescription: extractedData?.productDescription,
          extractedBusinessModel: extractedData?.businessModel,
        }
      );

      return {
        dealIntelligence: contextResult.dealIntelligence,
        marketData: contextResult.marketData,
        competitiveLandscape: contextResult.competitiveLandscape,
        newsSentiment: contextResult.newsSentiment,
        peopleGraph: contextResult.peopleGraph,
        enrichedAt: contextResult.enrichedAt,
        completeness: contextResult.completeness,
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

      // Re-inject revised result into allResults so downstream agents get the improved version
      if (reflexionResult.revisedResult && allResults) {
        allResults[agentName] = reflexionResult.revisedResult;
        if (enrichedContext?.previousResults) {
          enrichedContext.previousResults[agentName] = reflexionResult.revisedResult;
        }
        console.log(`[Reflexion] ${agentName}: revised result injected into allResults`);
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
    deal: DealWithDocs
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

    // Funding DB data — fetch similar deals and valuation benchmarks
    let fundingDbData: Record<string, unknown> | undefined;
    try {
      const [similarDeals, valuationBenchmarks] = await Promise.all([
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
      ]);

      if (similarDeals.length > 0 || valuationBenchmarks.count > 0) {
        fundingDbData = {
          similarDeals: similarDeals.map(d => ({
            company: d.companyName,
            amount: d.amountUsd ? Number(d.amountUsd) : null,
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
  async resumeAnalysis(
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

    // Calculate which agents still need to run
    const completedSet = new Set(checkpoint.completedAgents);
    const failedSet = new Set(checkpoint.failedAgents.map((f) => f.agent));

    // Restore results from checkpoint
    const allResults = checkpoint.results as Record<string, AgentResult>;
    let totalCost = checkpoint.totalCost;
    let completedCount = checkpoint.completedAgents.length;

    // Initialize state machine with recovery
    const stateMachine = new AnalysisStateMachine({
      analysisId: analysis.id,
      dealId: analysis.dealId,
      mode: analysis.mode ?? "full_analysis",
      agents: [...TIER1_AGENT_NAMES, ...TIER3_AGENT_NAMES],
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
    const currentState = stateMachine.getState();

    try {
      // Build context (we need to re-enrich since context engine data is not persisted)
      const baseContext: AgentContext = {
        dealId: deal.id,
        deal,
        documents: deal.documents,
        previousResults: allResults,
      };

      // Re-run context engine enrichment
      onProgress?.({
        currentAgent: "context-engine (re-enriching)",
        completedAgents: completedCount,
        totalAgents: analysis.totalAgents,
      });

      const contextEngineData = await this.enrichContext(deal as DealWithDocs, {});

      // Restore Fact Store from DB so remaining agents have validated facts
      // COMPROMISE: We restore the factStore but use Promise.all for remaining agents
      // rather than determining the exact interrupted phase. This is acceptable because
      // the factStore contains all validations that occurred before the interruption.
      let factStore: CurrentFact[] = [];
      let factStoreFormatted = "";
      try {
        factStore = await getCurrentFacts(deal.id);
        factStoreFormatted = formatFactStoreForAgents(factStore);
        console.log(`[Orchestrator:Resume] Restored ${factStore.length} facts from DB`);
      } catch (error) {
        console.error("[Orchestrator:Resume] Failed to restore fact store:", error);
      }

      const enrichedContext: EnrichedAgentContext = {
        ...baseContext,
        contextEngine: contextEngineData,
        factStore,
        factStoreFormatted,
      };

      // Resume based on current state
      if (currentState === "ANALYZING" || currentState === "GATHERING") {
        // Need to run remaining Tier 1 agents
        const pendingTier1 = TIER1_AGENT_NAMES.filter(
          (name) => !completedSet.has(name) && !failedSet.has(name)
        );

        if (pendingTier1.length > 0) {
          onProgress?.({
            currentAgent: `resuming tier1-agents (${pendingTier1.length} remaining)`,
            completedAgents: completedCount,
            totalAgents: analysis.totalAgents,
          });

          const tier1AgentMap = await getTier1Agents(false);

          // Use Promise.all with restored factStore for remaining agents.
          // NOTE: We don't re-run the full 4-phase pipeline here because determining
          // the exact interrupted phase is complex and error-prone. Instead, all remaining
          // agents run in parallel with the validated facts available at interruption time.
          const tier1Results = await Promise.all(
            pendingTier1.map(async (agentName) => {
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

          for (const { agentName, result } of tier1Results) {
            allResults[agentName] = result;
            totalCost += result.cost;
            completedCount++;
            enrichedContext.previousResults![agentName] = result;
            await processAgentResult(deal.id, agentName, result);
            this.checkAndEmitWarnings(agentName, result, collectedWarnings, onEarlyWarning);
          }

          await updateAnalysisProgress(analysis.id, completedCount, totalCost);
        }
      }

      // Check if we need to run Tier 2 sector expert (PRO plan only)
      if (
        currentState === "ANALYZING" ||
        currentState === "SYNTHESIZING" ||
        currentState === "DEBATING"
      ) {
        const sectorExpert = await getTier2SectorExpert(deal.sector);
        if (sectorExpert && !completedSet.has(sectorExpert.name) && !failedSet.has(sectorExpert.name)) {
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
            await processAgentResult(deal.id, sectorExpert.name, sectorResult);
            await updateAnalysisProgress(analysis.id, completedCount, totalCost);
          } catch (error) {
            allResults[sectorExpert.name] = {
              agentName: sectorExpert.name,
              success: false,
              executionTimeMs: 0,
              cost: 0,
              error: error instanceof Error ? error.message : "Unknown error",
            };
            completedCount++;
          }
        }
      }

      // Check if we need to run Tier 3
      if (
        currentState === "ANALYZING" ||
        currentState === "SYNTHESIZING" ||
        currentState === "DEBATING"
      ) {
        const pendingTier3 = TIER3_AGENT_NAMES.filter(
          (name) => !completedSet.has(name) && !failedSet.has(name)
        );

        if (pendingTier3.length > 0) {
          // Load BA preferences for Tier 3
          const baPreferences = await this.loadBAPreferences(deal.userId);
          enrichedContext.baPreferences = baPreferences;

          const tier3AgentMap = await getTier3Agents();

          // Run remaining Tier 3 agents in dependency order
          for (const batch of TIER3_EXECUTION_BATCHES) {
            const pendingInBatch = batch.filter((name) => pendingTier3.includes(name));

            if (pendingInBatch.length === 0) continue;

            onProgress?.({
              currentAgent: `resuming tier3 (${pendingInBatch.join(", ")})`,
              completedAgents: completedCount,
              totalAgents: analysis.totalAgents,
            });

            if (pendingInBatch.length === 1) {
              const agentName = pendingInBatch[0];
              const agent = tier3AgentMap[agentName];

              try {
                const result = await agent.run(enrichedContext);
                allResults[agentName] = result;
                totalCost += result.cost;
                completedCount++;
                enrichedContext.previousResults![agentName] = result;
                await processAgentResult(deal.id, agentName, result);
              } catch (error) {
                allResults[agentName] = {
                  agentName,
                  success: false,
                  executionTimeMs: 0,
                  cost: 0,
                  error: error instanceof Error ? error.message : "Unknown error",
                };
                completedCount++;
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
                allResults[agentName] = result;
                totalCost += result.cost;
                completedCount++;
                enrichedContext.previousResults![agentName] = result;
                await processAgentResult(deal.id, agentName, result);
              }
            }

            await updateAnalysisProgress(analysis.id, completedCount, totalCost);
          }
        }
      }

      // Complete the analysis
      await stateMachine.complete();

      const summary = generateFullAnalysisSummary(allResults);
      const totalTimeMs = Date.now() - startTime;
      const allSuccess = Object.values(allResults).every((r) => r.success);

      await completeAnalysis({
        analysisId: analysis.id,
        success: allSuccess,
        totalCost,
        totalTimeMs,
        summary: `${summary}\n\n**Resumed from checkpoint** - Analysis recovered after interruption`,
        results: allResults,
        mode: analysis.mode ?? "full_analysis",
      });

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
        await stateMachine.fail(error instanceof Error ? error : new Error("Unknown error"));
      }

      const totalTimeMs = Date.now() - startTime;

      await completeAnalysis({
        analysisId: analysis.id,
        success: false,
        totalCost,
        totalTimeMs,
        summary: `Resume failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        results: allResults,
        mode: analysis.mode ?? "full_analysis",
      });

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

// Export singleton
export const orchestrator = new AgentOrchestrator();
