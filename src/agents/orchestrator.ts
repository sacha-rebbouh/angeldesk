import { prisma } from "@/lib/prisma";
import type { Deal } from "@prisma/client";
import { dealScreener } from "./deal-screener";
import { redFlagDetector } from "./red-flag-detector";
import { documentExtractor } from "./document-extractor";
import { dealScorer } from "./deal-scorer";
import type {
  AgentContext,
  AgentResult,
  ScreeningResult,
  RedFlagResult,
  ScoringResult,
  AnalysisSession,
} from "./types";

// Agent registry
const AGENTS = {
  "deal-screener": dealScreener,
  "red-flag-detector": redFlagDetector,
  "document-extractor": documentExtractor,
  "deal-scorer": dealScorer,
} as const;

type AgentName = keyof typeof AGENTS;

// Analysis types with their required agents
const ANALYSIS_CONFIGS = {
  screening: {
    agents: ["deal-screener"] as AgentName[],
    description: "Quick screening to determine if deal warrants full DD",
  },
  extraction: {
    agents: ["document-extractor"] as AgentName[],
    description: "Extract structured data from uploaded documents",
  },
  full_dd: {
    agents: ["document-extractor", "deal-screener", "deal-scorer", "red-flag-detector"] as AgentName[],
    description: "Complete due diligence analysis",
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
    let lastError: string | undefined;

    for (let i = 0; i < config.agents.length; i++) {
      const agentName = config.agents[i];
      const agent = AGENTS[agentName];

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

        if (!result.success) {
          lastError = result.error;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Unknown error";
        results[agentName] = {
          agentName,
          success: false,
          executionTimeMs: 0,
          cost: 0,
          error: lastError,
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
      agentCount: config.agents.length,
    }));
  }
}

// Export singleton
export const orchestrator = new AgentOrchestrator();
