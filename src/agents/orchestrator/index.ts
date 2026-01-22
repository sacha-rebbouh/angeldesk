import type { Deal } from "@prisma/client";
import type {
  AgentContext,
  AgentResult,
  EnrichedAgentContext,
  ScreeningResult,
  AnalysisAgentResult,
} from "../types";
import { enrichDeal, invalidateDealContext, getContextEngineCacheStats, type FounderInput } from "@/services/context-engine";
import { getCacheManager } from "@/services/cache";
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
} from "../orchestration";
import type { ScoredFinding, ConfidenceScore } from "@/scoring/types";
import { costMonitor } from "@/services/cost-monitor";
import { setAgentContext } from "@/services/openrouter/router";

// Import modular components
import {
  type AnalysisOptions,
  type AnalysisResult,
  type AnalysisType,
  type AdvancedAnalysisOptions,
  ANALYSIS_CONFIGS,
  AGENT_COUNTS,
  TIER1_AGENT_NAMES,
  TIER2_AGENT_NAMES,
} from "./types";
import {
  BASE_AGENTS,
  getTier1Agents,
  getTier2Agents,
  getTier3SectorExpert,
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
} from "./persistence";
import {
  generateSummary,
  generateTier1Summary,
  generateTier2Summary,
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
      useReAct = false,
      forceRefresh = false,
      mode = "full",
      failFastOnCritical = false,
      maxCostUsd,
      onEarlyWarning,
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
    const cacheableTypes: AnalysisType[] = ["tier1_complete", "tier2_synthesis", "tier3_sector", "full_analysis"];

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
        result = await this.runTier1Analysis(deal as DealWithDocs, dealId, onProgress, useReAct, {
          mode,
          failFastOnCritical,
          maxCostUsd,
          onEarlyWarning,
        });
        break;
      case "full_analysis":
        result = await this.runFullAnalysis(deal as DealWithDocs, dealId, onProgress, useReAct, {
          mode,
          failFastOnCritical,
          maxCostUsd,
          onEarlyWarning,
        });
        break;
      case "tier2_synthesis":
        result = await this.runTier2Synthesis(deal as DealWithDocs, dealId, onProgress, onEarlyWarning);
        break;
      case "tier3_sector":
        result = await this.runTier3SectorAnalysis(deal as DealWithDocs, dealId, onProgress, useReAct);
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

    // Create analysis record
    const analysis = await createAnalysis({
      dealId,
      type,
      totalAgents: config.agents.length,
    });

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

    // Update deal status if screening passed
    if (type === "screening" && allSuccess) {
      const screeningResult = results["deal-screener"] as ScreeningResult;
      if (screeningResult?.data?.shouldProceed) {
        await updateDealStatus(dealId, "IN_DD");
      }
    }

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
    useReAct: boolean,
    advancedOptions: AdvancedAnalysisOptions
  ): Promise<AnalysisResult> {
    const { mode, failFastOnCritical, maxCostUsd, onEarlyWarning } = advancedOptions;
    const startTime = Date.now();
    const TIER1_AGENT_COUNT = 12;
    const collectedWarnings: EarlyWarning[] = [];

    const analysis = await createAnalysis({
      dealId,
      type: "tier1_complete",
      totalAgents: TIER1_AGENT_COUNT + 1,
    });

    const results: Record<string, AgentResult> = {};
    let totalCost = 0;

    // Build base context
    const baseContext: AgentContext = {
      dealId,
      deal,
      documents: deal.documents,
      previousResults: {},
    };

    // STEP 1: Run document-extractor first (if documents exist)
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

    // STEP 2: Enrich with Context Engine
    const contextEngineData = await this.enrichContext(deal);

    // Build enriched context for Tier 1 agents
    const enrichedContext: EnrichedAgentContext = {
      ...baseContext,
      contextEngine: contextEngineData,
    };

    // STEP 3: Run all Tier 1 agents in PARALLEL
    onProgress?.({
      currentAgent: "tier1-agents (parallel)",
      completedAgents: deal.documents.length > 0 ? 1 : 0,
      totalAgents: TIER1_AGENT_COUNT + 1,
    });

    const tier1AgentMap = await getTier1Agents(useReAct);

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
   * Run Tier 2 synthesis (requires Tier 1 results in previousResults)
   */
  private async runTier2Synthesis(
    deal: DealWithDocs,
    dealId: string,
    onProgress: AnalysisOptions["onProgress"],
    onEarlyWarning?: OnEarlyWarning,
    tier1Results?: Record<string, AgentResult>
  ): Promise<AnalysisResult> {
    const startTime = Date.now();
    const TIER2_AGENT_COUNT = 5;
    const collectedWarnings: EarlyWarning[] = [];

    const analysis = await createAnalysis({
      dealId,
      type: "tier2_synthesis",
      totalAgents: TIER2_AGENT_COUNT,
    });

    const results: Record<string, AgentResult> = {};
    let totalCost = 0;

    const context: EnrichedAgentContext = {
      dealId,
      deal,
      documents: deal.documents,
      previousResults: tier1Results ?? {},
    };

    const tier2AgentMap = await getTier2Agents();
    let completedCount = 0;

    for (const agentName of TIER2_AGENT_NAMES) {
      const agent = tier2AgentMap[agentName];

      onProgress?.({
        currentAgent: agentName,
        completedAgents: completedCount,
        totalAgents: TIER2_AGENT_COUNT,
      });

      try {
        const result = await agent.run(context);
        results[agentName] = result;
        totalCost += result.cost;
        completedCount++;
        context.previousResults![agentName] = result;

        await updateAnalysisProgress(analysis.id, completedCount, totalCost);
        await processAgentResult(dealId, agentName, result);

        // Check for early warnings
        this.checkAndEmitWarnings(agentName, result, collectedWarnings, onEarlyWarning);

        onProgress?.({
          currentAgent: agentName,
          completedAgents: completedCount,
          totalAgents: TIER2_AGENT_COUNT,
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
        completedCount++;
      }
    }

    const summary = generateTier2Summary(results);
    const totalTimeMs = Date.now() - startTime;
    const allSuccess = Object.values(results).every((r) => r.success);

    await completeAnalysis({
      analysisId: analysis.id,
      success: allSuccess,
      totalCost,
      totalTimeMs,
      summary,
      results,
      mode: "tier2_synthesis",
    });

    const baseResult: AnalysisResult = {
      sessionId: analysis.id,
      dealId,
      type: "tier2_synthesis",
      success: allSuccess,
      results,
      totalCost,
      totalTimeMs,
      summary,
    };

    return this.addWarningsToResult(baseResult, collectedWarnings);
  }

  /**
   * Run Tier 3 sector analysis
   */
  private async runTier3SectorAnalysis(
    deal: DealWithDocs,
    dealId: string,
    onProgress: AnalysisOptions["onProgress"],
    _useReAct: boolean,
    previousResults?: Record<string, AgentResult>
  ): Promise<AnalysisResult> {
    const startTime = Date.now();

    const sectorExpert = await getTier3SectorExpert(deal.sector);

    if (!sectorExpert) {
      return {
        sessionId: "",
        dealId,
        type: "tier3_sector",
        success: true,
        results: {},
        totalCost: 0,
        totalTimeMs: Date.now() - startTime,
        summary: `No sector expert available for sector: ${deal.sector ?? "unknown"}`,
      };
    }

    const analysis = await createAnalysis({
      dealId,
      type: "tier3_sector",
      totalAgents: 1,
      mode: "tier3_sector",
    });

    const results: Record<string, AgentResult> = {};
    let totalCost = 0;

    const contextEngineData = await this.enrichContext(deal);

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
      type: "tier3_sector",
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
    const { mode, failFastOnCritical, maxCostUsd, onEarlyWarning } = advancedOptions;
    const startTime = Date.now();
    const collectedWarnings: EarlyWarning[] = [];

    const sectorExpert = await getTier3SectorExpert(deal.sector);
    const hasSectorExpert = sectorExpert !== null;
    const TOTAL_AGENTS = 12 + 5 + 1 + (hasSectorExpert ? 1 : 0);

    const analysis = await createAnalysis({
      dealId,
      type: "full_analysis",
      totalAgents: TOTAL_AGENTS,
    });

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
      agents: ["document-extractor", ...TIER1_AGENT_NAMES, ...TIER2_AGENT_NAMES],
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

    try {
      await stateMachine.start();

      const baseContext: AgentContext = {
        dealId,
        deal,
        documents: deal.documents,
        previousResults: {},
      };

      // STEP 1: EXTRACTION PHASE
      if (deal.documents.length > 0) {
        await stateMachine.startExtraction();

        onProgress?.({
          currentAgent: "document-extractor",
          completedAgents: 0,
          totalAgents: TOTAL_AGENTS,
        });

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

      // STEP 2: GATHERING PHASE - Context Engine
      await stateMachine.startGathering();
      const contextEngineData = await this.enrichContext(deal);

      const enrichedContext: EnrichedAgentContext = {
        ...baseContext,
        contextEngine: contextEngineData,
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

      // Collect Tier 1 results and process findings
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

        // Extract and publish findings from ReAct agents
        if (result.success && "_react" in result) {
          await this.processReActFindings(
            analysis.id,
            agentName,
            result,
            allFindings,
            deal.name,
            deal.sector
          );
        }

        // Check for early warnings
        this.checkAndEmitWarnings(agentName, result, collectedWarnings, onEarlyWarning);

        await processAgentResult(dealId, agentName, result);
      }

      await updateAnalysisProgress(analysis.id, completedCount, totalCost);

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

      // STEP 5: SYNTHESIS PHASE - Tier 2 Agents Sequentially
      await stateMachine.startSynthesis();

      const tier2AgentMap = await getTier2Agents();

      for (const agentName of TIER2_AGENT_NAMES) {
        const agent = tier2AgentMap[agentName];

        onProgress?.({
          currentAgent: agentName,
          completedAgents: completedCount,
          totalAgents: TOTAL_AGENTS,
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

      // STEP 6: SECTOR EXPERT PHASE - Tier 3 (if available)
      if (sectorExpert) {
        onProgress?.({
          currentAgent: `tier3-${sectorExpert.name}`,
          completedAgents: completedCount,
          totalAgents: TOTAL_AGENTS,
        });

        try {
          const sectorResult = await sectorExpert.run(enrichedContext);
          allResults[sectorExpert.name] = sectorResult;
          totalCost += sectorResult.cost;
          completedCount++;

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
   * Enrich deal context with Context Engine
   *
   * Results are cached by the Context Engine for 10 minutes.
   * Cache key is based on deal attributes (companyName, sector, stage, geography).
   * Pass dealId for targeted cache invalidation when deal is updated.
   *
   * Founder LinkedIn data is fetched via Proxycurl (~$0.01/founder).
   * Only fetched if deal has founders with LinkedIn URLs.
   */
  private async enrichContext(
    deal: DealWithDocs
  ): Promise<EnrichedAgentContext["contextEngine"]> {
    try {
      // Prepare founder list for LinkedIn enrichment
      const founders: FounderInput[] = (deal.founders || []).map((f) => ({
        name: f.name,
        role: f.role,
        linkedinUrl: f.linkedinUrl ?? undefined,
      }));

      const hasFoundersToEnrich = founders.length > 0;

      const contextResult = await enrichDeal(
        {
          companyName: deal.companyName ?? deal.name,
          sector: deal.sector ?? undefined,
          stage: deal.stage ?? undefined,
          geography: deal.geography ?? undefined,
        },
        {
          dealId: deal.id, // For cache invalidation by deal
          includeFounders: hasFoundersToEnrich,
          founders: hasFoundersToEnrich ? founders : undefined,
          startupSector: deal.sector ?? undefined,
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
}

// Export singleton
export const orchestrator = new AgentOrchestrator();
