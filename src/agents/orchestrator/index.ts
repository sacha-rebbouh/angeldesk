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
} from "../orchestration";
import type { ScoredFinding, ConfidenceScore } from "@/scoring/types";
import { costMonitor } from "@/services/cost-monitor";
import { setAgentContext, setAnalysisContext } from "@/services/openrouter/router";

// Fact Store imports for Tier 0 fact extraction
import { factExtractorAgent, type FactExtractorOutput } from "@/agents/tier0/fact-extractor";
import {
  getCurrentFacts,
  formatFactStoreForAgents,
  createFactEventsBatch,
} from "@/services/fact-store";
import type { CurrentFact } from "@/services/fact-store/types";

// Import modular components
import {
  type AnalysisOptions,
  type AnalysisResult,
  type AnalysisType,
  type AdvancedAnalysisOptions,
  ANALYSIS_CONFIGS,
  AGENT_COUNTS,
  TIER1_AGENT_NAMES,
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
export type { AnalysisOptions, AnalysisResult, AnalysisType, EarlyWarning };
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
    const TIER1_AGENT_COUNT = 12;
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

    // STEP 2: Enrich with Context Engine (using extracted data)
    const contextEngineData = await this.enrichContext(deal, extractedData);

    // Build enriched context for Tier 1 agents with Fact Store
    const enrichedContext: EnrichedAgentContext = {
      ...baseContext,
      contextEngine: contextEngineData,
      factStore,
      factStoreFormatted,
    };

    // STEP 3: Run all Tier 1 agents in PARALLEL
    onProgress?.({
      currentAgent: "tier1-agents (parallel)",
      completedAgents: deal.documents.length > 0 ? 2 : 0, // +1 for fact-extractor
      totalAgents: TIER1_AGENT_COUNT + 2,
    });

    // Always use Standard agents (better results, lower cost)
    const tier1AgentMap = await getTier1Agents(false);

    const tier1Results = await Promise.all(
      TIER1_AGENT_NAMES.map(async (agentName) => {
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

    // Collect results and check for early warnings
    let completedCount = deal.documents.length > 0 ? 1 : 0;
    for (const { agentName, result } of tier1Results) {
      results[agentName] = result;
      totalCost += result.cost;
      completedCount++;
      await processAgentResult(dealId, agentName, result);

      // Check for early warnings
      this.checkAndEmitWarnings(agentName, result, collectedWarnings, onEarlyWarning);
    }

    await updateAnalysisProgress(analysis.id, completedCount, totalCost);

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
   * Execution modes:
   * - "full": Complete analysis with consensus debates, reflexion, all features
   * - "lite": Skip consensus debates and reflexion (faster, cheaper)
   * - "express": Minimal - parallel agents only, no synthesis
   */
  private async runFullAnalysis(
    deal: DealWithDocs,
    dealId: string,
    onProgress: AnalysisOptions["onProgress"],
    useReAct: boolean,
    advancedOptions: AdvancedAnalysisOptions
  ): Promise<AnalysisResult> {
    const { mode, failFastOnCritical, maxCostUsd, onEarlyWarning, isUpdate = false } = advancedOptions;
    const startTime = Date.now();
    const collectedWarnings: EarlyWarning[] = [];

    const sectorExpert = await getTier2SectorExpert(deal.sector);
    const hasSectorExpert = sectorExpert !== null;
    const TOTAL_AGENTS = 12 + 5 + 1 + 1 + (hasSectorExpert ? 1 : 0); // +1 for fact-extractor

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
      };

      // STEP 3: ANALYSIS PHASE - Tier 1 Agents in Parallel
      await stateMachine.startAnalysis();

      onProgress?.({
        currentAgent: "tier1-agents (parallel)",
        completedAgents: completedCount,
        totalAgents: TOTAL_AGENTS,
      });

      const tier1AgentMap = await getTier1Agents(useReAct);
      const allFindings: ScoredFinding[] = [];

      const tier1Results = await Promise.all(
        TIER1_AGENT_NAMES.map(async (agentName) => {
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

      // Collect Tier 1 results
      for (const { agentName, result } of tier1Results) {
        allResults[agentName] = result;
        totalCost += result.cost;
        completedCount++;
        enrichedContext.previousResults![agentName] = result;

        if (result.success) {
          stateMachine.recordAgentComplete(agentName, result as AnalysisAgentResult);
        } else {
          stateMachine.recordAgentFailed(agentName, result.error ?? "Unknown");
        }

        // Check for early warnings
        this.checkAndEmitWarnings(agentName, result, collectedWarnings, onEarlyWarning);

        await processAgentResult(dealId, agentName, result);
      }

      await updateAnalysisProgress(analysis.id, completedCount, totalCost);

      // Extract findings from ALL Standard agents (for Consensus + Reflexion engines)
      const { allFindings: extractedFindings, agentConfidences, lowConfidenceAgents } =
        extractAllFindings(allResults);
      allFindings.push(...extractedFindings);

      // Publish findings to message bus
      for (const finding of extractedFindings) {
        await messageBus.publish(createFindingMessage(finding.agentName, "*", finding));
      }

      // Persist findings
      if (extractedFindings.length > 0) {
        await persistScoredFindings(analysis.id, "tier1-aggregate", extractedFindings);
      }

      console.log(
        `[Orchestrator] Extracted ${extractedFindings.length} findings from ${Object.keys(allResults).length} agents. ` +
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
          }, collectedWarnings);
        }
      }

      // STEP 4: DEBATE PHASE - Consensus Engine for Contradictions
      // Skip in "lite" and "express" modes for faster/cheaper execution
      if (allFindings.length > 1 && mode === "full") {
        await stateMachine.startDebate();

        onProgress?.({
          currentAgent: "consensus-engine (detecting contradictions)",
          completedAgents: completedCount,
          totalAgents: TOTAL_AGENTS,
          estimatedCostSoFar: totalCost,
        });

        await this.runConsensusDebate(analysis.id, allFindings);
      } else if (mode !== "full") {
        console.log(`[Orchestrator] Skipping debate phase (mode=${mode})`);
      }

      // STEP 4.5: REFLEXION PHASE - Auto-critique for low-confidence agents
      // Now applies to ALL agents with confidence < 75%, not just ReAct agents
      if (lowConfidenceAgents.length > 0 && mode === "full") {
        onProgress?.({
          currentAgent: `reflexion-engine (${lowConfidenceAgents.length} low-confidence agents)`,
          completedAgents: completedCount,
          totalAgents: TOTAL_AGENTS,
          estimatedCostSoFar: totalCost,
        });

        for (const agentName of lowConfidenceAgents) {
          const result = allResults[agentName];
          if (result?.success) {
            const agentFindings = allFindings.filter(f => f.agentName === agentName);
            await this.applyReflexion(
              analysis.id,
              agentName,
              result as AnalysisAgentResult,
              agentFindings,
              `Deal: ${deal.name}, Sector: ${deal.sector}`
            );
          }
        }
      } else if (mode !== "full") {
        console.log(`[Orchestrator] Skipping reflexion phase (mode=${mode})`);
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
        }, collectedWarnings);
      }

      // Express mode: skip synthesis entirely
      if (mode === "express") {
        console.log(`[Orchestrator] Express mode: skipping Tier 2 synthesis`);
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
          summary: `${summary}\n\n**Note**: Express mode - Tier 2 synthesis skipped`,
        }, collectedWarnings);
      }

      // STEP 5: SYNTHESIS PHASE - Tier 2 BEFORE Tier 3
      // Run contradiction-detector, scenario-modeler, devils-advocate in PARALLEL
      await stateMachine.startSynthesis();

      const tier3AgentMap = await getTier3Agents();

      // Load BA preferences for Tier 3 personalization (does NOT affect Tier 1/2)
      const baPreferences = await this.loadBAPreferences(deal.userId);
      enrichedContext.baPreferences = baPreferences;

      // Cost check before Tier 3
      if (!(maxCostUsd && totalCost >= maxCostUsd)) {
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
      } else {
        console.log(`[Orchestrator] Cost limit reached ($${totalCost.toFixed(2)} >= $${maxCostUsd}) - skipping Tier 3`);
      }

      // STEP 6: SECTOR EXPERT PHASE - Tier 2 (if available)
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

      // STEP 7: FINAL SYNTHESIS - Tier 3 AFTER Tier 2
      // synthesis-deal-scorer and memo-generator run last with ALL insights
      for (const batch of TIER3_BATCHES_AFTER_TIER2) {
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

        try {
          const result = await agent.run(enrichedContext);
          allResults[agentName] = result;
          totalCost += result.cost;
          completedCount++;
          enrichedContext.previousResults![agentName] = result;

          stateMachine.recordAgentComplete(agentName, result as AnalysisAgentResult);
          await processAgentResult(dealId, agentName, result);
          await updateAnalysisProgress(analysis.id, completedCount, totalCost);

          onProgress?.({
            currentAgent: agentName,
            completedAgents: completedCount,
            totalAgents: TOTAL_AGENTS,
            latestResult: result,
            estimatedCostSoFar: totalCost,
          });
        } catch (error) {
          const errorResult: AgentResult = {
            agentName,
            success: false,
            executionTimeMs: 0,
            cost: 0,
            error: error instanceof Error ? error.message : "Unknown error",
          };
          allResults[agentName] = errorResult;
          stateMachine.recordAgentFailed(agentName, errorResult.error ?? "Unknown");
          completedCount++;
        }
      }

      // COMPLETE
      await stateMachine.complete();

      const summary = generateFullAnalysisSummary(allResults);
      const totalTimeMs = Date.now() - startTime;
      const allSuccess = Object.values(allResults).every((r) => r.success);
      const orchestrationSummary = stateMachine.getSummary();

      // End cost monitoring
      const costReport = await costMonitor.endAnalysis();
      if (costReport) {
        console.log(`[CostMonitor] Analysis completed: $${costReport.totalCost.toFixed(4)} (${costReport.totalCalls} calls)`);
      }

      const modeNote = mode !== "full" ? `\n\n**Mode**: ${mode} (some phases skipped)` : "";

      await completeAnalysis({
        analysisId: analysis.id,
        success: allSuccess,
        totalCost,
        totalTimeMs,
        summary: `${summary}\n\n**Orchestration**: ${orchestrationSummary.transitions} state transitions, ${orchestrationSummary.totalFindings} findings${modeNote}`,
        results: allResults,
        mode: "full_analysis",
      });

      await updateDealStatus(dealId, "IN_DD");

      return this.addWarningsToResult({
        sessionId: analysis.id,
        dealId,
        type: "full_analysis",
        success: allSuccess,
        results: allResults,
        totalCost,
        totalTimeMs,
        summary,
      }, collectedWarnings);
    } catch (error) {
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
      }, collectedWarnings);
    }
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

      // Build context for fact-extractor
      // Note: For updates, existing facts are passed via previousResults so fact-extractor
      // can detect contradictions. We use type assertion since AgentResult base doesn't have data.
      const factContext: AgentContext = {
        dealId: deal.id,
        deal,
        documents: deal.documents,
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

      // Run fact-extractor agent
      const result = await factExtractorAgent.run(factContext);

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
    dealSector: string | null
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
        `Deal: ${dealName}, Sector: ${dealSector}`
      );
    }
  }

  /**
   * Run consensus debate for contradictions
   */
  private async runConsensusDebate(
    analysisId: string,
    allFindings: ScoredFinding[]
  ): Promise<void> {
    const contradictions = await consensusEngine.detectContradictions(allFindings);
    console.log(`[ConsensusEngine] Detected ${contradictions.length} contradictions`);

    for (const contradiction of contradictions.filter(
      (c) => c.severity === "critical" || c.severity === "major"
    )) {
      try {
        const debateResult = await consensusEngine.debate(contradiction.id);
        await persistDebateRecord(analysisId, debateResult);
        console.log(
          `[ConsensusEngine] Resolved ${contradiction.topic}: ${debateResult.resolution.resolution}`
        );
      } catch (error) {
        console.error(`[ConsensusEngine] Failed to debate ${contradiction.id}:`, error);
      }
    }
  }

  /**
   * Apply reflexion engine for low-confidence results
   */
  private async applyReflexion(
    _analysisId: string,
    agentName: string,
    result: AnalysisAgentResult,
    findings: ScoredFinding[],
    context: string
  ): Promise<void> {
    try {
      console.log(`[Reflexion] Applying to ${agentName} (low confidence)`);

      const reflexionResult = await reflexionEngine.reflect({
        agentName,
        result,
        findings,
        context,
      });

      console.log(
        `[Reflexion] ${agentName}: ${reflexionResult.critiques.length} critiques, ${reflexionResult.confidenceChange} confidence change`
      );
    } catch (error) {
      console.error(`[Reflexion] Failed for ${agentName}:`, error);
    }
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

      const enrichedContext: EnrichedAgentContext = {
        ...baseContext,
        contextEngine: contextEngineData,
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
