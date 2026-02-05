import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type {
  AgentResult,
  RedFlagResult,
  SynthesisDealScorerResult,
} from "../types";
import type { ScoredFinding } from "@/scoring/types";
import type { AnalysisType } from "./types";

/**
 * Create a new analysis record
 * @param documentIds - IDs of documents being analyzed (for versioning/staleness detection)
 */
export async function createAnalysis(params: {
  dealId: string;
  type: AnalysisType;
  totalAgents: number;
  mode?: string;
  documentIds?: string[];
}) {
  return prisma.analysis.create({
    data: {
      dealId: params.dealId,
      type: params.type === "extraction" ? "SCREENING" : "FULL_DD",
      status: "RUNNING",
      totalAgents: params.totalAgents,
      completedAgents: 0,
      startedAt: new Date(),
      mode: params.mode,
      documentIds: params.documentIds ?? [],
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
    if (process.env.NODE_ENV === "development") {
      console.error("[Persistence] Failed to persist state transition:", error);
    }
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
    if (process.env.NODE_ENV === "development") {
      console.error("[Persistence] Failed to persist reasoning trace:", error);
    }
  }
}

/**
 * Persist scored findings to database
 * Uses createMany for batch insertion (avoids N sequential inserts)
 */
export async function persistScoredFindings(
  analysisId: string,
  agentName: string,
  findings: ScoredFinding[]
): Promise<void> {
  if (findings.length === 0) return;

  try {
    const data = findings.map(finding => ({
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
        : Prisma.JsonNull,
      confidenceLevel: finding.confidence?.level ?? "insufficient",
      confidenceScore: Number.isFinite(finding.confidence?.score) ? finding.confidence.score : 0,
      confidenceFactors: JSON.parse(JSON.stringify(finding.confidence?.factors ?? [])),
      evidence: JSON.parse(JSON.stringify(finding.evidence ?? [])),
    }));

    await prisma.scoredFinding.createMany({ data });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Persistence] Failed to persist scored findings:", error);
    }
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
    if (process.env.NODE_ENV === "development") {
      console.error("[Persistence] Failed to persist debate record:", error);
    }
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
          if (process.env.NODE_ENV === "development") {
            console.log(`[Persistence] Updated deal ${dealId} with extracted info:`, Object.keys(updateData));
          }
        }
      }
      break;
    }

    case "red-flag-detector": {
      const rfResult = result as RedFlagResult;
      const redFlags = rfResult.data?.redFlags ?? [];

      // Save red flags to database in batch
      if (redFlags.length > 0) {
        await prisma.redFlag.createMany({
          data: redFlags.map(flag => ({
            dealId,
            category: flag.category,
            title: flag.title,
            description: flag.description,
            severity: flag.severity,
            confidenceScore: flag.confidenceScore,
            evidence: flag.evidence,
            questionsToAsk: flag.questionsToAsk,
            status: "OPEN",
          })),
        });
      }
      break;
    }

    case "synthesis-deal-scorer": {
      const synthResult = result as SynthesisDealScorerResult;
      if (synthResult.data?.overallScore) {
        // Extract dimension sub-scores from dimensionScores array
        const dimensionScores = synthResult.data.dimensionScores ?? [];
        const findDimensionScore = (keywords: string[]): number | null => {
          const match = dimensionScores.find((d) =>
            keywords.some((kw) => d.dimension.toLowerCase().includes(kw))
          );
          return match ? Math.round(match.score) : null;
        };

        await prisma.deal.update({
          where: { id: dealId },
          data: {
            globalScore: Math.round(synthResult.data.overallScore),
            teamScore: findDimensionScore(["team", "equipe", "équipe"]),
            marketScore: findDimensionScore(["market", "marché", "marche"]),
            productScore: findDimensionScore(["product", "produit", "tech"]),
            financialsScore: findDimensionScore(["financial", "financ"]),
          },
        });
      }
      break;
    }

    case "team-investigator": {
      // Auto-sync analyzed profiles to Founder table
      // CRITICAL: MERGE with existing verifiedInfo (LinkedIn data) — never overwrite
      const teamResult = result as AgentResult & {
        data?: {
          findings?: {
            founderProfiles?: Array<{
              name: string;
              role: string;
              linkedinUrl?: string;
              linkedinVerified?: boolean;
              background?: Record<string, unknown>;
              scores?: Record<string, number>;
              strengths?: string[];
              concerns?: string[];
              redFlags?: Array<{ type: string; severity: string; description: string }>;
              entrepreneurialTrack?: Record<string, unknown>;
            }>;
          };
        };
      };

      const profiles = teamResult.data?.findings?.founderProfiles;
      if (profiles && profiles.length > 0) {
        // Get existing founders WITH their verifiedInfo (to preserve LinkedIn data)
        const existingFounders = await prisma.founder.findMany({
          where: { dealId },
          select: { id: true, name: true, verifiedInfo: true },
        });

        // Build a map for fast lookup (case-insensitive)
        const existingByName = new Map(
          existingFounders.map(f => [f.name.toLowerCase().trim(), f])
        );

        // Separate into updates and creates
        const toUpdate: Array<{ id: string; data: Prisma.FounderUpdateInput }> = [];
        const toCreate: Prisma.FounderCreateManyInput[] = [];

        for (const profile of profiles) {
          // Team-investigator analysis data
          const analysisData = {
            scores: profile.scores,
            strengths: profile.strengths,
            concerns: profile.concerns,
            redFlags: profile.redFlags,
            background: profile.background,
            entrepreneurialTrack: profile.entrepreneurialTrack,
            linkedinVerified: profile.linkedinVerified,
            source: "team-investigator",
            analyzedAt: new Date().toISOString(),
          };

          const existing = existingByName.get(profile.name.toLowerCase().trim());

          if (existing) {
            // MERGE: preserve existing LinkedIn data, add/update team-investigator analysis
            const existingVerifiedInfo = (existing.verifiedInfo as Record<string, unknown>) ?? {};
            const mergedVerifiedInfo = {
              ...existingVerifiedInfo,   // Keep LinkedIn data (experiences, education, skills, etc.)
              ...analysisData,           // Add team-investigator analysis
            };

            toUpdate.push({
              id: existing.id,
              data: {
                role: profile.role,
                linkedinUrl: profile.linkedinUrl ?? undefined,
                verifiedInfo: mergedVerifiedInfo as unknown as Prisma.InputJsonValue,
              },
            });
          } else {
            toCreate.push({
              dealId,
              name: profile.name,
              role: profile.role,
              linkedinUrl: profile.linkedinUrl ?? null,
              verifiedInfo: analysisData as unknown as Prisma.InputJsonValue,
            });
          }
        }

        // Batch operations in a transaction
        await prisma.$transaction([
          // Updates need individual calls but we batch them in a transaction
          ...toUpdate.map(({ id, data }) =>
            prisma.founder.update({ where: { id }, data })
          ),
          // Creates can use createMany
          ...(toCreate.length > 0 ? [prisma.founder.createMany({ data: toCreate })] : []),
        ]);

        if (process.env.NODE_ENV === "development") {
          console.log(`[Persistence] Synced ${profiles.length} team profiles to Founder table for deal ${dealId} (merged with existing LinkedIn data)`);
        }
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
          processingStatus: true, // Required for document versioning/staleness detection
        },
      },
      founders: true,
    },
  });
}

// ============================================================================
// CHECKPOINT PERSISTENCE (for crash recovery)
// ============================================================================

export interface CheckpointData {
  state: string;
  completedAgents: string[];
  pendingAgents: string[];
  failedAgents: { agent: string; error: string; retries: number }[];
  findings: unknown[];
  results: Record<string, unknown>;
  totalCost: number;
  startTime: string;
}

/**
 * Save a checkpoint to database
 * Called periodically during analysis to enable recovery
 */
export async function saveCheckpoint(
  analysisId: string,
  checkpoint: CheckpointData
): Promise<string> {
  try {
    const saved = await prisma.analysisCheckpoint.create({
      data: {
        analysisId,
        state: checkpoint.state,
        completedAgents: checkpoint.completedAgents,
        pendingAgents: checkpoint.pendingAgents,
        failedAgents: checkpoint.failedAgents as Prisma.InputJsonValue,
        findings: checkpoint.findings as Prisma.InputJsonValue,
        results: checkpoint.results as Prisma.InputJsonValue,
      },
    });

    // Also update the analysis record with partial results for visibility
    await prisma.analysis.update({
      where: { id: analysisId },
      data: {
        completedAgents: checkpoint.completedAgents.length,
        totalCost: checkpoint.totalCost,
        results: checkpoint.results as Prisma.InputJsonValue,
      },
    });

    if (process.env.NODE_ENV === "development") {
      console.log(
        `[Checkpoint] Saved checkpoint ${saved.id} for analysis ${analysisId}: ` +
          `state=${checkpoint.state}, completed=${checkpoint.completedAgents.length}/${checkpoint.completedAgents.length + checkpoint.pendingAgents.length}`
      );
    }

    return saved.id;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Checkpoint] Failed to save checkpoint:", error);
    }
    throw error;
  }
}

/**
 * Load the latest checkpoint for an analysis
 */
export async function loadLatestCheckpoint(
  analysisId: string
): Promise<CheckpointData | null> {
  try {
    const checkpoint = await prisma.analysisCheckpoint.findFirst({
      where: { analysisId },
      orderBy: { createdAt: "desc" },
    });

    if (!checkpoint) {
      return null;
    }

    return {
      state: checkpoint.state,
      completedAgents: checkpoint.completedAgents,
      pendingAgents: checkpoint.pendingAgents,
      failedAgents: (checkpoint.failedAgents as { agent: string; error: string; retries: number }[]) ?? [],
      findings: (checkpoint.findings as unknown[]) ?? [],
      results: (checkpoint.results as Record<string, unknown>) ?? {},
      totalCost: 0, // Will be recalculated from results
      startTime: checkpoint.createdAt.toISOString(),
    };
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Checkpoint] Failed to load checkpoint:", error);
    }
    return null;
  }
}

/**
 * Find all interrupted analyses (status = RUNNING) for a user or globally
 * These are analyses that crashed or were interrupted and can be resumed
 * Uses batched checkpoint query to avoid N+1
 */
export async function findInterruptedAnalyses(userId?: string): Promise<
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
  }>
> {
  try {
    const analyses = await prisma.analysis.findMany({
      where: {
        status: "RUNNING",
        ...(userId ? { deal: { userId } } : {}),
      },
      include: {
        deal: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { startedAt: "desc" },
    });

    if (analyses.length === 0) return [];

    // BATCH FETCH: Get latest checkpoints for all analyses in one query
    // Using raw query to get MAX(createdAt) grouped by analysisId
    const analysisIds = analyses.map(a => a.id);
    const latestCheckpoints = await prisma.analysisCheckpoint.groupBy({
      by: ["analysisId"],
      where: { analysisId: { in: analysisIds } },
      _max: { createdAt: true },
    });

    // Build map of analysisId -> lastCheckpointAt
    const checkpointMap = new Map(
      latestCheckpoints.map(c => [c.analysisId, c._max.createdAt])
    );

    return analyses.map(analysis => ({
      id: analysis.id,
      dealId: analysis.dealId,
      dealName: analysis.deal.name,
      type: analysis.type,
      mode: analysis.mode,
      startedAt: analysis.startedAt,
      completedAgents: analysis.completedAgents,
      totalAgents: analysis.totalAgents,
      totalCost: Number(analysis.totalCost ?? 0),
      lastCheckpointAt: checkpointMap.get(analysis.id) ?? null,
    }));
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Checkpoint] Failed to find interrupted analyses:", error);
    }
    return [];
  }
}

/**
 * Load full analysis data for recovery (including deal and checkpoint)
 */
export async function loadAnalysisForRecovery(analysisId: string): Promise<{
  analysis: {
    id: string;
    dealId: string;
    type: string;
    mode: string | null;
    totalAgents: number;
    startedAt: Date | null;
  };
  deal: Awaited<ReturnType<typeof getDealWithRelations>>;
  checkpoint: CheckpointData | null;
} | null> {
  try {
    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
      select: {
        id: true,
        dealId: true,
        type: true,
        mode: true,
        totalAgents: true,
        startedAt: true,
        status: true,
      },
    });

    if (!analysis || analysis.status !== "RUNNING") {
      return null;
    }

    const deal = await getDealWithRelations(analysis.dealId);
    if (!deal) {
      return null;
    }

    const checkpoint = await loadLatestCheckpoint(analysisId);

    return {
      analysis: {
        id: analysis.id,
        dealId: analysis.dealId,
        type: analysis.type,
        mode: analysis.mode,
        totalAgents: analysis.totalAgents,
        startedAt: analysis.startedAt,
      },
      deal,
      checkpoint,
    };
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Checkpoint] Failed to load analysis for recovery:", error);
    }
    return null;
  }
}

/**
 * Mark an interrupted analysis as failed (when recovery is not possible or user cancels)
 */
export async function markAnalysisAsFailed(
  analysisId: string,
  reason: string
): Promise<void> {
  try {
    await prisma.analysis.update({
      where: { id: analysisId },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        summary: `Analysis interrupted: ${reason}`,
      },
    });

    if (process.env.NODE_ENV === "development") {
      console.log(`[Checkpoint] Marked analysis ${analysisId} as FAILED: ${reason}`);
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Checkpoint] Failed to mark analysis as failed:", error);
    }
  }
}

/**
 * Clean up old checkpoints (keep only last N per analysis)
 * Call this periodically to prevent database bloat
 */
export async function cleanupOldCheckpoints(
  analysisId: string,
  keepCount: number = 5
): Promise<number> {
  try {
    const checkpoints = await prisma.analysisCheckpoint.findMany({
      where: { analysisId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (checkpoints.length <= keepCount) {
      return 0;
    }

    const toDelete = checkpoints.slice(keepCount).map((c) => c.id);

    await prisma.analysisCheckpoint.deleteMany({
      where: { id: { in: toDelete } },
    });

    if (process.env.NODE_ENV === "development") {
      console.log(`[Checkpoint] Cleaned up ${toDelete.length} old checkpoints for analysis ${analysisId}`);
    }
    return toDelete.length;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Checkpoint] Failed to cleanup checkpoints:", error);
    }
    return 0;
  }
}
