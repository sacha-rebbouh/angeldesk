import { prisma } from "@/lib/prisma";
import type { Deal } from "@prisma/client";
import { dealScreener } from "./deal-screener";
import { redFlagDetector } from "./red-flag-detector";
import { documentExtractor } from "./document-extractor";
import { dealScorer } from "./deal-scorer";
import { enrichDeal } from "@/services/context-engine";
import type {
  AgentContext,
  AgentResult,
  ScreeningResult,
  RedFlagResult,
  ScoringResult,
  EnrichedAgentContext,
  Tier1AgentName,
} from "./types";

// Base agent registry (existing agents)
const BASE_AGENTS = {
  "deal-screener": dealScreener,
  "red-flag-detector": redFlagDetector,
  "document-extractor": documentExtractor,
  "deal-scorer": dealScorer,
} as const;

// Tier 1 agents will be added here after creation
// Import them dynamically to avoid circular dependencies
let tier1Agents: Record<string, { run: (context: EnrichedAgentContext) => Promise<AgentResult> }> | null = null;

async function getTier1Agents() {
  if (!tier1Agents) {
    // Dynamic import to avoid circular dependencies
    const tier1Module = await import("./tier1");
    tier1Agents = {
      "deck-forensics": tier1Module.deckForensics,
      "financial-auditor": tier1Module.financialAuditor,
      "market-intelligence": tier1Module.marketIntelligence,
      "competitive-intel": tier1Module.competitiveIntel,
      "team-investigator": tier1Module.teamInvestigator,
      "technical-dd": tier1Module.technicalDD,
      "legal-regulatory": tier1Module.legalRegulatory,
      "cap-table-auditor": tier1Module.capTableAuditor,
      "gtm-analyst": tier1Module.gtmAnalyst,
      "customer-intel": tier1Module.customerIntel,
      "exit-strategist": tier1Module.exitStrategist,
      "question-master": tier1Module.questionMaster,
    };
  }
  return tier1Agents;
}

type BaseAgentName = keyof typeof BASE_AGENTS;

// Analysis types with their required agents
const ANALYSIS_CONFIGS = {
  screening: {
    agents: ["deal-screener"] as BaseAgentName[],
    description: "Quick screening to determine if deal warrants full DD",
    parallel: false,
  },
  extraction: {
    agents: ["document-extractor"] as BaseAgentName[],
    description: "Extract structured data from uploaded documents",
    parallel: false,
  },
  full_dd: {
    agents: ["document-extractor", "deal-screener", "deal-scorer", "red-flag-detector"] as BaseAgentName[],
    description: "Complete due diligence analysis",
    parallel: false,
  },
  tier1_complete: {
    agents: [] as BaseAgentName[], // Special handling - uses Tier 1 agents
    description: "Investigation complete par 12 agents en parallele",
    parallel: true,
  },
} as const;

export type AnalysisType = keyof typeof ANALYSIS_CONFIGS;

export interface AnalysisOptions {
  dealId: string;
  type: AnalysisType;
  onProgress?: (progress: {
    currentAgent: string;
    completedAgents: number;
    totalAgents: number;
    latestResult?: AgentResult;
  }) => void;
}

export interface AnalysisResult {
  sessionId: string;
  dealId: string;
  type: AnalysisType;
  success: boolean;
  results: Record<string, AgentResult>;
  totalCost: number;
  totalTimeMs: number;
  summary?: string;
}

export class AgentOrchestrator {
  // Run a complete analysis session
  async runAnalysis(options: AnalysisOptions): Promise<AnalysisResult> {
    const { dealId, type, onProgress } = options;
    const startTime = Date.now();

    // Get deal with documents
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        documents: {
          select: {
            id: true,
            name: true,
            type: true,
            extractedText: true,
          },
        },
        founders: true,
      },
    });

    if (!deal) {
      throw new Error(`Deal not found: ${dealId}`);
    }

    // Special handling for tier1_complete - parallel execution
    if (type === "tier1_complete") {
      return this.runTier1Analysis(
        deal as Deal & { documents: { id: string; name: string; type: string; extractedText: string | null }[] },
        dealId,
        onProgress
      );
    }

    // Create analysis record
    const config = ANALYSIS_CONFIGS[type];
    const analysis = await prisma.analysis.create({
      data: {
        dealId,
        type: type === "screening" ? "SCREENING" : "FULL_DD",
        status: "RUNNING",
        totalAgents: config.agents.length,
        completedAgents: 0,
        startedAt: new Date(),
      },
    });

    // Build context
    const context: AgentContext = {
      dealId,
      deal: deal as Deal,
      documents: deal.documents,
      previousResults: {},
    };

    // Run agents in sequence
    const results: Record<string, AgentResult> = {};
    let totalCost = 0;

    for (let i = 0; i < config.agents.length; i++) {
      const agentName = config.agents[i];
      const agent = BASE_AGENTS[agentName];

      // Report progress
      onProgress?.({
        currentAgent: agentName,
        completedAgents: i,
        totalAgents: config.agents.length,
      });

      try {
        // Run the agent
        const result = await agent.run(context);
        results[agentName] = result;
        totalCost += result.cost;

        // Store result for dependent agents
        context.previousResults![agentName] = result;

        // Update analysis progress
        await prisma.analysis.update({
          where: { id: analysis.id },
          data: {
            completedAgents: i + 1,
            totalCost,
          },
        });

        // Process agent-specific results
        await this.processAgentResult(deal.id, agentName, result);

        // Report progress with result
        onProgress?.({
          currentAgent: agentName,
          completedAgents: i + 1,
          totalAgents: config.agents.length,
          latestResult: result,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        results[agentName] = {
          agentName,
          success: false,
          executionTimeMs: 0,
          cost: 0,
          error: errorMsg,
        };
      }
    }

    // Generate summary
    const summary = this.generateSummary(results, type);

    // Update analysis record
    const totalTimeMs = Date.now() - startTime;
    const allSuccess = Object.values(results).every((r) => r.success);

    await prisma.analysis.update({
      where: { id: analysis.id },
      data: {
        status: allSuccess ? "COMPLETED" : "FAILED",
        completedAt: new Date(),
        totalCost,
        summary,
      },
    });

    // Update deal status if screening passed
    if (type === "screening" && allSuccess) {
      const screeningResult = results["deal-screener"] as ScreeningResult;
      if (screeningResult?.data?.shouldProceed) {
        await prisma.deal.update({
          where: { id: dealId },
          data: { status: "IN_DD" },
        });
      }
    }

    return {
      sessionId: analysis.id,
      dealId,
      type,
      success: allSuccess,
      results,
      totalCost,
      totalTimeMs,
      summary,
    };
  }

  // Run Tier 1 analysis with parallel execution
  private async runTier1Analysis(
    deal: Deal & { documents: { id: string; name: string; type: string; extractedText: string | null }[] },
    dealId: string,
    onProgress?: AnalysisOptions["onProgress"]
  ): Promise<AnalysisResult> {
    const startTime = Date.now();
    const TIER1_AGENT_COUNT = 12;

    // Create analysis record
    const analysis = await prisma.analysis.create({
      data: {
        dealId,
        type: "FULL_DD",
        status: "RUNNING",
        totalAgents: TIER1_AGENT_COUNT + 1, // +1 for document-extractor
        completedAgents: 0,
        startedAt: new Date(),
      },
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
        const extractorResult = await documentExtractor.run(baseContext);
        results["document-extractor"] = extractorResult;
        totalCost += extractorResult.cost;
        baseContext.previousResults!["document-extractor"] = extractorResult;

        await prisma.analysis.update({
          where: { id: analysis.id },
          data: { completedAgents: 1, totalCost },
        });

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
    onProgress?.({
      currentAgent: "context-engine",
      completedAgents: deal.documents.length > 0 ? 1 : 0,
      totalAgents: TIER1_AGENT_COUNT + 1,
    });

    let contextEngineData: EnrichedAgentContext["contextEngine"];
    try {
      const contextResult = await enrichDeal({
        companyName: deal.companyName ?? deal.name,
        sector: deal.sector ?? undefined,
        stage: deal.stage ?? undefined,
        geography: deal.geography ?? undefined,
      });

      contextEngineData = {
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
      contextEngineData = undefined;
    }

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

    const tier1AgentMap = await getTier1Agents();
    const tier1AgentNames = Object.keys(tier1AgentMap) as Tier1AgentName[];

    // Execute all agents in parallel using Promise.all
    const tier1Results = await Promise.all(
      tier1AgentNames.map(async (agentName) => {
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

    // Collect results
    let completedCount = deal.documents.length > 0 ? 1 : 0;
    for (const { agentName, result } of tier1Results) {
      results[agentName] = result;
      totalCost += result.cost;
      completedCount++;

      // Process agent-specific results (save to DB if needed)
      await this.processAgentResult(dealId, agentName, result);
    }

    // Update analysis progress
    await prisma.analysis.update({
      where: { id: analysis.id },
      data: {
        completedAgents: completedCount,
        totalCost,
      },
    });

    // Generate summary
    const summary = this.generateTier1Summary(results);

    // Update analysis record
    const totalTimeMs = Date.now() - startTime;
    const allSuccess = Object.values(results).every((r) => r.success);

    await prisma.analysis.update({
      where: { id: analysis.id },
      data: {
        status: allSuccess ? "COMPLETED" : "FAILED",
        completedAt: new Date(),
        totalCost,
        summary,
      },
    });

    // Update deal status to IN_DD after Tier 1 analysis
    await prisma.deal.update({
      where: { id: dealId },
      data: { status: "IN_DD" },
    });

    return {
      sessionId: analysis.id,
      dealId,
      type: "tier1_complete",
      success: allSuccess,
      results,
      totalCost,
      totalTimeMs,
      summary,
    };
  }

  // Generate summary for Tier 1 analysis
  private generateTier1Summary(results: Record<string, AgentResult>): string {
    const parts: string[] = [];
    const successCount = Object.values(results).filter((r) => r.success).length;
    const totalCount = Object.keys(results).length;

    parts.push(`**Tier 1 Investigation**: ${successCount}/${totalCount} agents completes`);

    // Extract key scores from agents that have them
    const scores: { name: string; score: number }[] = [];

    const agentScoreFields: Record<string, string> = {
      "financial-auditor": "overallScore",
      "market-intelligence": "marketScore",
      "competitive-intel": "competitiveScore",
      "team-investigator": "overallTeamScore",
      "technical-dd": "technicalScore",
      "legal-regulatory": "legalScore",
      "cap-table-auditor": "capTableScore",
      "gtm-analyst": "gtmScore",
      "customer-intel": "customerScore",
      "exit-strategist": "exitScore",
    };

    for (const [agentName, scoreField] of Object.entries(agentScoreFields)) {
      const result = results[agentName];
      if (result?.success && "data" in result) {
        const data = result.data as Record<string, unknown>;
        const score = data[scoreField];
        if (typeof score === "number") {
          scores.push({
            name: agentName.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            score,
          });
        }
      }
    }

    if (scores.length > 0) {
      parts.push("\n**Scores par dimension:**");
      for (const { name, score } of scores.sort((a, b) => b.score - a.score)) {
        const emoji = score >= 70 ? "✅" : score >= 50 ? "⚠️" : "❌";
        parts.push(`${emoji} ${name}: ${score}/100`);
      }
    }

    // Count critical issues from question-master
    const questionMaster = results["question-master"];
    if (questionMaster?.success && "data" in questionMaster) {
      const data = questionMaster.data as { dealbreakers?: string[]; topPriorities?: string[] };
      if (data.dealbreakers && data.dealbreakers.length > 0) {
        parts.push(`\n**Dealbreakers potentiels:** ${data.dealbreakers.length}`);
      }
      if (data.topPriorities && data.topPriorities.length > 0) {
        parts.push(`**Top priorites:** ${data.topPriorities.slice(0, 3).join(", ")}`);
      }
    }

    return parts.join("\n");
  }

  // Process agent-specific results (e.g., save red flags to DB)
  private async processAgentResult(
    dealId: string,
    agentName: string,
    result: AgentResult
  ): Promise<void> {
    if (!result.success) return;

    switch (agentName) {
      case "red-flag-detector": {
        const rfResult = result as RedFlagResult;
        const redFlags = rfResult.data?.redFlags ?? [];

        // Save red flags to database
        for (const flag of redFlags) {
          await prisma.redFlag.create({
            data: {
              dealId,
              category: flag.category,
              title: flag.title,
              description: flag.description,
              severity: flag.severity,
              confidenceScore: flag.confidenceScore,
              evidence: flag.evidence,
              questionsToAsk: flag.questionsToAsk,
              status: "OPEN",
            },
          });
        }
        break;
      }

      case "deal-screener": {
        const screenResult = result as ScreeningResult;
        // Update deal with screening score if no scorer ran
        if (screenResult.data?.confidenceScore) {
          const existingDeal = await prisma.deal.findUnique({
            where: { id: dealId },
            select: { globalScore: true },
          });
          // Only update if no global score exists yet
          if (!existingDeal?.globalScore) {
            await prisma.deal.update({
              where: { id: dealId },
              data: {
                globalScore: Math.round(screenResult.data.confidenceScore),
              },
            });
          }
        }
        break;
      }

      case "deal-scorer": {
        const scoreResult = result as ScoringResult;
        if (scoreResult.data?.scores) {
          const { scores } = scoreResult.data;
          await prisma.deal.update({
            where: { id: dealId },
            data: {
              globalScore: scores.global,
              teamScore: scores.team,
              marketScore: scores.market,
              productScore: scores.product,
              financialsScore: scores.financials,
            },
          });
        }
        break;
      }
    }
  }

  // Generate summary from all results
  private generateSummary(
    results: Record<string, AgentResult>,
    type: AnalysisType
  ): string {
    const parts: string[] = [];

    // Screening summary
    const screening = results["deal-screener"] as ScreeningResult | undefined;
    if (screening?.success && screening.data) {
      const { shouldProceed, confidenceScore, summary } = screening.data;
      parts.push(
        `**Screening**: ${shouldProceed ? "PROCEED" : "PASS"} (${confidenceScore}% confiance)`
      );
      parts.push(summary);
    }

    // Scoring summary
    const scoring = results["deal-scorer"] as ScoringResult | undefined;
    if (scoring?.success && scoring.data) {
      const { scores } = scoring.data;
      parts.push(
        `**Score Global**: ${scores.global}/100\n` +
        `- Team: ${scores.team}/100\n` +
        `- Market: ${scores.market}/100\n` +
        `- Product: ${scores.product}/100\n` +
        `- Financials: ${scores.financials}/100\n` +
        `- Timing: ${scores.timing}/100`
      );
    }

    // Red flags summary
    const redFlags = results["red-flag-detector"] as RedFlagResult | undefined;
    if (redFlags?.success && redFlags.data) {
      const { redFlags: flags, overallRiskLevel } = redFlags.data;
      if (flags.length > 0) {
        const critical = flags.filter((f) => f.severity === "CRITICAL").length;
        const high = flags.filter((f) => f.severity === "HIGH").length;
        parts.push(
          `**Red Flags**: ${flags.length} detecte(s) - Risque ${overallRiskLevel}` +
            (critical > 0 ? ` (${critical} critique(s))` : "") +
            (high > 0 ? ` (${high} eleve(s))` : "")
        );
      } else {
        parts.push("**Red Flags**: Aucun red flag majeur detecte");
      }
    }

    return parts.join("\n\n");
  }

  // Get available analysis types
  getAnalysisTypes(): { type: AnalysisType; description: string; agentCount: number }[] {
    return Object.entries(ANALYSIS_CONFIGS).map(([type, config]) => ({
      type: type as AnalysisType,
      description: config.description,
      agentCount: type === "tier1_complete" ? 13 : config.agents.length, // 12 Tier 1 + extractor
    }));
  }
}

// Export singleton
export const orchestrator = new AgentOrchestrator();
