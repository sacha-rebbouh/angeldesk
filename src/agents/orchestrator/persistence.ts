import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type {
  AgentResult,
  ScreeningResult,
  RedFlagResult,
  ScoringResult,
  SynthesisDealScorerResult,
} from "../types";
import type { ScoredFinding } from "@/scoring/types";
import type { AnalysisType } from "./types";

/**
 * Create a new analysis record
 */
export async function createAnalysis(params: {
  dealId: string;
  type: AnalysisType;
  totalAgents: number;
  mode?: string;
}) {
  return prisma.analysis.create({
    data: {
      dealId: params.dealId,
      type: params.type === "screening" ? "SCREENING" : "FULL_DD",
      status: "RUNNING",
      totalAgents: params.totalAgents,
      completedAgents: 0,
      startedAt: new Date(),
      mode: params.mode,
    },
  });
}

/**
 * Update analysis progress
 */
export async function updateAnalysisProgress(
  analysisId: string,
  completedAgents: number,
  totalCost: number
) {
  return prisma.analysis.update({
    where: { id: analysisId },
    data: { completedAgents, totalCost },
  });
}

/**
 * Complete an analysis (success or failure)
 */
export async function completeAnalysis(params: {
  analysisId: string;
  success: boolean;
  totalCost: number;
  totalTimeMs: number;
  summary: string;
  results: Record<string, AgentResult>;
  mode?: string;
}) {
  return prisma.analysis.update({
    where: { id: params.analysisId },
    data: {
      status: params.success ? "COMPLETED" : "FAILED",
      completedAt: new Date(),
      totalCost: params.totalCost,
      totalTimeMs: params.totalTimeMs,
      summary: params.summary,
      results: JSON.parse(JSON.stringify(params.results)),
      mode: params.mode,
    },
  });
}

/**
 * Persist state transition to database
 */
export async function persistStateTransition(
  analysisId: string,
  fromState: string,
  toState: string,
  trigger: string
): Promise<void> {
  try {
    await prisma.stateTransition.create({
      data: {
        analysisId,
        fromState,
        toState,
        trigger,
      },
    });
  } catch (error) {
    console.error("[Persistence] Failed to persist state transition:", error);
  }
}

/**
 * Persist reasoning trace to database
 */
export async function persistReasoningTrace(
  analysisId: string,
  agentName: string,
  trace: unknown
): Promise<void> {
  try {
    const traceData = trace as {
      taskDescription?: string;
      steps?: unknown[];
      totalIterations?: number;
      finalConfidence?: number;
      executionTimeMs?: number;
      selfCritique?: unknown;
    };

    await prisma.reasoningTrace.create({
      data: {
        analysisId,
        agentName,
        taskDescription: traceData.taskDescription ?? "N/A",
        steps: (traceData.steps as Prisma.InputJsonValue) ?? [],
        totalIterations: traceData.totalIterations ?? 0,
        finalConfidence: traceData.finalConfidence ?? 0,
        executionTimeMs: traceData.executionTimeMs ?? 0,
        selfCritique: (traceData.selfCritique as Prisma.InputJsonValue) ?? null,
      },
    });
  } catch (error) {
    console.error("[Persistence] Failed to persist reasoning trace:", error);
  }
}

/**
 * Persist scored findings to database
 */
export async function persistScoredFindings(
  analysisId: string,
  agentName: string,
  findings: ScoredFinding[]
): Promise<void> {
  try {
    for (const finding of findings) {
      await prisma.scoredFinding.create({
        data: {
          analysisId,
          agentName,
          metric: finding.metric,
          category: finding.category,
          value: finding.value?.toString() ?? null,
          unit: finding.unit,
          normalizedValue: finding.normalizedValue ?? null,
          percentile: finding.percentile ?? null,
          assessment: finding.assessment,
          benchmarkData: finding.benchmarkData
            ? JSON.parse(JSON.stringify(finding.benchmarkData))
            : null,
          confidenceLevel: finding.confidence.level,
          confidenceScore: finding.confidence.score,
          confidenceFactors: JSON.parse(JSON.stringify(finding.confidence.factors ?? [])),
          evidence: JSON.parse(JSON.stringify(finding.evidence ?? [])),
        },
      });
    }
  } catch (error) {
    console.error("[Persistence] Failed to persist scored findings:", error);
  }
}

/**
 * Persist debate record to database
 */
export async function persistDebateRecord(
  analysisId: string,
  debateResult: {
    contradiction: {
      id: string;
      topic: string;
      severity: string;
      claims: unknown[];
      status: string;
    };
    rounds: unknown[];
    resolution: {
      resolvedBy: string;
      winner?: string;
      resolution: string;
      confidence: { score: number };
    };
  }
): Promise<void> {
  try {
    await prisma.debateRecord.create({
      data: {
        analysisId,
        contradictionId: debateResult.contradiction.id,
        topic: debateResult.contradiction.topic,
        severity: debateResult.contradiction.severity,
        participants: (debateResult.contradiction.claims as { agentName: string }[]).map(
          (c) => c.agentName
        ),
        claims: debateResult.contradiction.claims as Prisma.InputJsonValue,
        rounds: debateResult.rounds as Prisma.InputJsonValue,
        status: debateResult.contradiction.status,
        resolvedBy: debateResult.resolution.resolvedBy,
        winner: debateResult.resolution.winner ?? null,
        resolution: debateResult.resolution.resolution,
        resolutionConfidence: debateResult.resolution.confidence.score,
        resolvedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("[Persistence] Failed to persist debate record:", error);
  }
}

/**
 * Process agent-specific results (e.g., save red flags, update deal scores)
 */
export async function processAgentResult(
  dealId: string,
  agentName: string,
  result: AgentResult
): Promise<void> {
  if (!result.success) return;

  switch (agentName) {
    case "document-extractor": {
      // Update deal with extracted info (sector, company name, etc.)
      const extractionData = result as AgentResult & {
        data?: {
          extractedInfo?: {
            companyName?: string;
            sector?: string;
            stage?: string;
            geography?: string;
            tagline?: string;
            arr?: number;
            mrr?: number;
            growthRateYoY?: number;
            amountRaising?: number;
            valuationPre?: number;
            valuationPost?: number;
            teamSize?: number;
            productDescription?: string;
          };
        };
      };

      const info = extractionData.data?.extractedInfo;
      if (info) {
        const updateData: Record<string, unknown> = {};

        // Only update fields that were extracted and are not already set
        const deal = await prisma.deal.findUnique({
          where: { id: dealId },
          select: {
            companyName: true,
            sector: true,
            stage: true,
            geography: true,
            description: true,
            arr: true,
            growthRate: true,
            amountRequested: true,
            valuationPre: true,
          },
        });

        if (!deal) break;

        // Update sector if extracted and current is "Autre" or empty
        if (info.sector && (!deal.sector || deal.sector === "Autre")) {
          updateData.sector = info.sector;
        }

        // Update company name if not set
        if (info.companyName && !deal.companyName) {
          updateData.companyName = info.companyName;
        }

        // Update stage if extracted (map to valid enum)
        if (info.stage && !deal.stage) {
          const stageMap: Record<string, string> = {
            PRE_SEED: "PRE_SEED",
            SEED: "SEED",
            SERIES_A: "SERIES_A",
            SERIES_B: "SERIES_B",
            SERIES_C: "SERIES_C",
            LATER: "LATER",
          };
          if (stageMap[info.stage]) {
            updateData.stage = stageMap[info.stage];
          }
        }

        // Update geography if not set
        if (info.geography && !deal.geography) {
          updateData.geography = info.geography;
        }

        // Update description/tagline if not set
        if (info.tagline && !deal.description) {
          updateData.description = info.tagline;
        }

        // Update financial metrics if not set
        if (info.arr && !deal.arr) {
          updateData.arr = info.arr;
        }
        if (info.growthRateYoY && !deal.growthRate) {
          updateData.growthRate = info.growthRateYoY;
        }
        if (info.amountRaising && !deal.amountRequested) {
          updateData.amountRequested = info.amountRaising;
        }
        if (info.valuationPre && !deal.valuationPre) {
          updateData.valuationPre = info.valuationPre;
        }

        // Apply updates if any
        if (Object.keys(updateData).length > 0) {
          await prisma.deal.update({
            where: { id: dealId },
            data: updateData,
          });
          console.log(`[Persistence] Updated deal ${dealId} with extracted info:`, Object.keys(updateData));
        }
      }
      break;
    }

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

    case "synthesis-deal-scorer": {
      const synthResult = result as SynthesisDealScorerResult;
      if (synthResult.data?.overallScore) {
        await prisma.deal.update({
          where: { id: dealId },
          data: {
            globalScore: synthResult.data.overallScore,
          },
        });
      }
      break;
    }
  }
}

/**
 * Update deal status
 */
export async function updateDealStatus(
  dealId: string,
  status: "SCREENING" | "ANALYZING" | "IN_DD" | "PASSED" | "INVESTED" | "ARCHIVED"
) {
  return prisma.deal.update({
    where: { id: dealId },
    data: { status },
  });
}

/**
 * Get deal with documents and founders
 */
export async function getDealWithRelations(dealId: string) {
  return prisma.deal.findUnique({
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
}
