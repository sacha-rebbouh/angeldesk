import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import {
  ensureCorpusSnapshotForDeal,
  getCorpusSnapshotDocumentIds,
} from "@/services/corpus";
import { loadResults } from "@/services/analysis-results/load-results";
import type {
  AgentResult,
  RedFlagResult,
  SynthesisDealScorerResult,
} from "../types";
import type { ScoredFinding } from "@/scoring/types";
import type { AnalysisType } from "./types";

/**
 * Log a persistence error in ALL environments.
 * In development: console.error with full stack.
 * In production: console.error with message + structured metadata for log aggregation.
 */
function logPersistenceError(
  operation: string,
  error: unknown,
  metadata?: Record<string, unknown>
): void {
  logger.error({ err: error, operation, ...(metadata ?? {}) }, `Persistence failed: ${operation}`);
}

function hashStringToBigInt(input: string): string {
  const digest = createHash("sha256").update(input).digest();
  return digest.readBigInt64BE(0).toString();
}

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
  corpusSnapshotId?: string | null;
  extractionRunIds?: string[];
}) {
  const docIds = params.documentIds ?? [];
  let corpusSnapshotId = params.corpusSnapshotId ?? null;
  let extractionRunIds = params.extractionRunIds ?? [];

  if (docIds.length > 0 && (!corpusSnapshotId || extractionRunIds.length === 0)) {
    try {
      const snapshot = await ensureCorpusSnapshotForDeal({
        dealId: params.dealId,
        documentIds: docIds,
      });

      if (snapshot) {
        corpusSnapshotId = corpusSnapshotId ?? snapshot.id;
        if (extractionRunIds.length === 0) {
          extractionRunIds = snapshot.extractionRunIds;
        }
      }
    } catch (error) {
      logPersistenceError("createAnalysis.ensureCorpusSnapshotForDeal", error, {
        dealId: params.dealId,
        documentCount: docIds.length,
      });
    }
  }

  const hashForLock = hashStringToBigInt(params.dealId);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${hashForLock})`);

    if (params.type === "full_analysis") {
      const runningAnalysis = await tx.analysis.findFirst({
        where: {
          dealId: params.dealId,
          status: "RUNNING",
        },
        select: {
          id: true,
          mode: true,
        },
      });

      if (runningAnalysis) {
        throw new Error(
          `Cannot create a new full analysis for deal ${params.dealId}: ` +
          `analysis ${runningAnalysis.id} (${runningAnalysis.mode ?? "unknown"}) is already running`
        );
      }
    }

    return tx.analysis.create({
      data: {
        dealId: params.dealId,
        type: params.type === "extraction" ? "SCREENING" : "FULL_DD",
        status: "RUNNING",
        totalAgents: params.totalAgents,
        completedAgents: 0,
        startedAt: new Date(),
        mode: params.mode,
        corpusSnapshotId,
        documents: docIds.length > 0
          ? { create: docIds.map((documentId) => ({ documentId })) }
          : undefined,
        extractionRunLinks: extractionRunIds.length > 0
          ? { create: extractionRunIds.map((runId) => ({ runId })) }
          : undefined,
      },
    });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
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
  /** Override status — use "FAILED" only for actual crashes, not partial agent failures */
  statusOverride?: "COMPLETED" | "FAILED";
}) {
  // Count successful agents for completedAgents field
  const successfulCount = Object.values(params.results).filter((r) => r.success).length;
  const serializedResults = JSON.parse(JSON.stringify(params.results));

  const analysis = await prisma.analysis.update({
    where: { id: params.analysisId },
    data: {
      status: params.statusOverride ?? "COMPLETED",
      completedAt: new Date(),
      completedAgents: successfulCount,
      totalCost: params.totalCost,
      totalTimeMs: params.totalTimeMs,
      summary: params.summary,
      results: serializedResults,
      mode: params.mode,
    },
  });

  // PERF: Upload results to Blob storage for fast retrieval.
  // The DB results blob (several MB) takes 30s+ to load from Neon over network.
  // Blob/CDN serves the same data in <1s.
  try {
    const { uploadFile } = await import("@/services/storage");
    const jsonBuffer = Buffer.from(JSON.stringify(serializedResults));
    await uploadFile(`analysis-results/${params.analysisId}.json`, jsonBuffer, { access: "private" });
    logger.debug({
      analysisId: params.analysisId,
      sizeKb: Math.round(jsonBuffer.length / 1024),
    }, "Results cached to blob");
  } catch (err) {
    // Non-blocking: DB has the data, blob is just a fast cache
    logger.warn({ err, analysisId: params.analysisId }, "Failed to cache results to blob");
  }

  return analysis;
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
    logPersistenceError("persistStateTransition", error, {
      analysisId, fromState, toState, trigger,
    });
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
    logPersistenceError("persistReasoningTrace", error, {
      analysisId, agentName,
    });
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
    logPersistenceError("persistScoredFindings", error, {
      analysisId, agentName, findingsCount: findings.length,
    });
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
    logPersistenceError("persistDebateRecord", error, {
      analysisId, contradictionId: debateResult.contradiction.id,
    });
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
            instrument?: string;
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
            instrument: true,
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

        // Update instrument if extracted (map to valid enum)
        if (info.instrument && !deal.instrument) {
          const instrumentMap: Record<string, string> = {
            EQUITY: "EQUITY",
            SAFE: "SAFE",
            BSA_AIR: "BSA_AIR",
            CONVERTIBLE_NOTE: "CONVERTIBLE_NOTE",
            BRIDGE: "BRIDGE",
          };
          if (instrumentMap[info.instrument]) {
            updateData.instrument = instrumentMap[info.instrument];
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
      if (synthResult.data?.overallScore != null) {
        // Extract dimension sub-scores from dimensionScores array
        const dimensionScores = synthResult.data.dimensionScores ?? [];
        const findDimensionScore = (keywords: string[]): number | null => {
          const match = dimensionScores.find((d) =>
            keywords.some((kw) => d.dimension.toLowerCase().includes(kw))
          );
          return match ? Math.round(match.score) : null;
        };

        const fundamentals = Math.round(synthResult.data.overallScore);

        // globalScore = fundamentalsScore = synthesis output (conditions is now a dimension inside synthesis)
        await prisma.deal.update({
          where: { id: dealId },
          data: {
            fundamentalsScore: fundamentals,
            globalScore: fundamentals,
            teamScore: findDimensionScore(["team", "equipe", "équipe"]),
            marketScore: findDimensionScore(["market", "marché", "marche"]),
            productScore: findDimensionScore(["product", "produit", "tech"]),
            financialsScore: findDimensionScore(["financial", "financ"]),
            // conditionsScore is NOT set here — conditions-analyst is the source of truth (case below)
          },
        });
      }
      break;
    }

    case "conditions-analyst": {
      // Persist conditions score + full analysis cache
      const caResult = result as AgentResult & {
        data?: {
          score?: { value?: number };
          [key: string]: unknown;
        };
      };
      const caScore = caResult.data?.score?.value;
      await prisma.deal.update({
        where: { id: dealId },
        data: {
          conditionsScore: caScore != null ? Math.round(caScore) : null,
          conditionsAnalysis: caResult.data
            ? (caResult.data as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      });
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
 * Get deal with documents and founders.
 * Decrypts extractedText on the fly (F48: application-level encryption).
 */
export async function getDealWithRelations(
  dealId: string,
  options: { documentIds?: string[]; allowSupersededDocuments?: boolean } = {}
) {
  const { safeDecrypt } = await import("@/lib/encryption");
  const requestedDocumentIds = options.documentIds?.length ? options.documentIds : null;

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      documents: {
        where: requestedDocumentIds
          ? {
              id: { in: requestedDocumentIds },
              ...(options.allowSupersededDocuments ? {} : { isLatest: true }),
            }
          : { isLatest: true },
        select: {
          id: true,
          isLatest: true,
          name: true,
          type: true,
          extractedText: true,
          extractionMetrics: true,
          processingStatus: true, // Required for document versioning/staleness detection
          uploadedAt: true, // Required for document chronology awareness by agents
          sourceKind: true,
          corpusRole: true,
          sourceDate: true,
          receivedAt: true,
          sourceAuthor: true,
          sourceSubject: true,
          linkedQuestionSource: true,
          linkedQuestionText: true,
          linkedRedFlagId: true,
          extractionRuns: {
            orderBy: { completedAt: "desc" },
            take: 1,
            select: {
              id: true,
              status: true,
              readyForAnalysis: true,
              corpusTextHash: true,
              pages: {
                orderBy: { pageNumber: "asc" },
                select: {
                  pageNumber: true,
                  status: true,
                  method: true,
                  charCount: true,
                  wordCount: true,
                  qualityScore: true,
                  hasTables: true,
                  hasCharts: true,
                  hasFinancialKeywords: true,
                  hasTeamKeywords: true,
                  hasMarketKeywords: true,
                  artifact: true,
                  textPreview: true,
                },
              },
              overrides: {
                where: { approvedAt: { not: null } },
                select: {
                  pageNumber: true,
                  overrideType: true,
                  reason: true,
                  payload: true,
                },
              },
            },
          },
        },
      },
      founders: true,
    },
  });

  if (!deal) return null;

  // Decrypt extracted text for each document (handles mixed encrypted/plaintext)
  deal.documents = deal.documents.map(doc => {
    const decryptedText = doc.extractedText ? safeDecrypt(doc.extractedText) : null;
    return {
      ...doc,
      extractedText: decryptedText,
    };
  });

  if (requestedDocumentIds) {
    const documentRank = new Map(requestedDocumentIds.map((documentId, index) => [documentId, index]));
    deal.documents.sort(
      (left, right) =>
        (documentRank.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (documentRank.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    );
  }

  return deal;
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
    // BUT: never overwrite if analysis is already COMPLETED (the final completeAnalysis
    // save has more accurate results — checkpoint data may be stale/incomplete)
    const currentAnalysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
      select: { status: true },
    });
    if (currentAnalysis?.status !== "COMPLETED") {
      await prisma.analysis.update({
        where: { id: analysisId },
        data: {
          completedAgents: checkpoint.completedAgents.length,
          totalCost: checkpoint.totalCost,
          results: checkpoint.results as Prisma.InputJsonValue,
        },
      });
    }

    if (process.env.NODE_ENV === "development") {
      console.log(
        `[Checkpoint] Saved checkpoint ${saved.id} for analysis ${analysisId}: ` +
          `state=${checkpoint.state}, completed=${checkpoint.completedAgents.length}/${checkpoint.completedAgents.length + checkpoint.pendingAgents.length}`
      );
    }

    return saved.id;
  } catch (error) {
    logPersistenceError("saveCheckpoint", error, { analysisId });
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
    // Get latest checkpoint (even FAILED ones have valid completedAgents/results data)
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
    logPersistenceError("loadLatestCheckpoint", error, { analysisId });
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
    logPersistenceError("findInterruptedAnalyses", error, { userId });
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
    thesisBypass: boolean;
    thesisId: string | null;
    corpusSnapshotId: string | null;
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
        thesisBypass: true,
        thesisId: true,
        corpusSnapshotId: true,
        status: true,
      },
    });

    if (!analysis || analysis.status !== "RUNNING") {
      return null;
    }

    const snapshotDocumentIds = analysis.corpusSnapshotId
      ? await getCorpusSnapshotDocumentIds(analysis.corpusSnapshotId)
      : undefined;
    const deal = await getDealWithRelations(analysis.dealId, {
      documentIds: snapshotDocumentIds,
      allowSupersededDocuments: Boolean(snapshotDocumentIds?.length),
    });
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
        thesisBypass: analysis.thesisBypass,
        thesisId: analysis.thesisId,
        corpusSnapshotId: analysis.corpusSnapshotId,
      },
      deal,
      checkpoint,
    };
  } catch (error) {
    logPersistenceError("loadAnalysisForRecovery", error, { analysisId });
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
    logPersistenceError("markAnalysisAsFailed", error, { analysisId, reason });
  }
}

// ============================================================================
// PREVIOUS ANALYSIS QUESTIONS (cross-run question persistence)
// ============================================================================

interface QuestionContext {
  sourceAgent?: string;
  redFlagId?: string;
  triggerData?: string;
  whyItMatters?: string;
}

interface QuestionEvaluation {
  goodAnswer?: string;
  badAnswer?: string;
  redFlagIfBadAnswer?: string;
  followUpIfBad?: string;
}

/**
 * A deduplicated question accumulated across analyses.
 * When the same question appears in multiple analyses/agents,
 * all unique contexts and evaluations are merged into one entry.
 */
export interface PreviousAnalysisQuestion {
  question: string;
  priority: string;
  category: string;
  /** All agent sources that raised this question */
  agentSources: string[];
  /** All unique contexts (triggerData, whyItMatters) — one per source */
  contexts: QuestionContext[];
  /** All unique evaluations (goodAnswer, badAnswer) — one per source */
  evaluations: QuestionEvaluation[];
  timing?: string;
  /** Number of analyses that contained this question */
  occurrenceCount: number;
}

/**
 * Load consolidated questions from ALL completed analyses for a deal.
 * TEMPORARY: loads all analyses to bootstrap the chain. Will be reverted
 * to findFirst (last analysis only) once the chain is seeded.
 *
 * Deduplicates across analyses — keeps the richest version of each question
 * (the one with the most structured detail: context, evaluation, timing).
 *
 * Also loads founder responses to identify which questions have already been answered.
 */
export async function loadPreviousAnalysisQuestions(dealId: string): Promise<{
  questions: PreviousAnalysisQuestion[];
  answeredQuestionTexts: string[];
}> {
  try {
    const [allAnalyses, founderResponseFacts] = await Promise.all([
      prisma.analysis.findMany({
        where: { dealId, status: "COMPLETED" },
        orderBy: { completedAt: "desc" },
        select: { id: true, completedAt: true },
      }),
      prisma.factEvent.findMany({
        where: {
          dealId,
          source: "FOUNDER_RESPONSE",
          eventType: { notIn: ["DELETED", "SUPERSEDED"] },
        },
        select: { displayValue: true, reason: true },
      }),
    ]);

    if (allAnalyses.length === 0) {
      return { questions: [], answeredQuestionTexts: [] };
    }

    // Answered question texts (from founder responses stored as FactEvent)
    const answeredQuestionTexts = founderResponseFacts
      .filter((f) => f.displayValue && f.displayValue.trim().length > 0)
      .map((f) => f.reason ?? "") // reason stores the original question text
      .filter(Boolean);

    // Extract and deduplicate questions across ALL analyses
    // Keep the richest version (most structured detail) of each question
    const questions: PreviousAnalysisQuestion[] = [];
    const seenKeys = new Map<string, number>(); // key → index in questions[]

    // Priority ranking for upgrade logic
    const prioRank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

    for (const analysis of allAnalyses) {
      const rawResults = await loadResults(analysis.id);
      if (!rawResults || typeof rawResults !== "object" || Array.isArray(rawResults)) continue;
      const results = rawResults as Record<string, { success: boolean; data?: unknown }>;

      for (const [agentName, result] of Object.entries(results)) {
        if (!result.success || !result.data) continue;
        const data = result.data as Record<string, unknown>;

        const questionArrays = [
          data.questions,
          data.questionsForFounder,
          data.criticalQuestions,
          data.followUpQuestions,
          (data.findings as Record<string, unknown> | undefined)?.founderQuestions,
        ];

        for (const qArray of questionArrays) {
          if (!Array.isArray(qArray)) continue;
          for (const q of qArray) {
            const qText = typeof q === "string" ? q : q?.question;
            if (!qText || typeof qText !== "string") continue;

            const key = qText.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);

            // Preserve full structured context and evaluation from question-master
            const isObj = typeof q === "object" && q !== null;
            const rawCtx = isObj ? q.context : undefined;
            const rawEval = isObj ? q.evaluation : undefined;

            const ctx: QuestionContext | undefined = rawCtx && typeof rawCtx === "object" ? {
              sourceAgent: rawCtx.sourceAgent,
              redFlagId: rawCtx.redFlagId,
              triggerData: rawCtx.triggerData,
              whyItMatters: rawCtx.whyItMatters,
            } : undefined;

            const evaln: QuestionEvaluation | undefined = rawEval && typeof rawEval === "object" ? {
              goodAnswer: rawEval.goodAnswer,
              badAnswer: rawEval.badAnswer,
              redFlagIfBadAnswer: rawEval.redFlagIfBadAnswer,
              followUpIfBad: rawEval.followUpIfBad,
            } : undefined;

            if (!seenKeys.has(key)) {
              // New unique question
              seenKeys.set(key, questions.length);
              questions.push({
                question: qText,
                priority: (isObj ? q.priority : undefined) ?? "MEDIUM",
                category: (isObj ? q.category : undefined) ?? "OTHER",
                agentSources: [agentName],
                contexts: ctx ? [ctx] : [],
                evaluations: evaln ? [evaln] : [],
                timing: isObj ? q.timing : undefined,
                occurrenceCount: 1,
              });
            } else {
              // Duplicate: merge contexts/evaluations + upgrade priority
              const idx = seenKeys.get(key)!;
              const existing = questions[idx];
              existing.occurrenceCount += 1;

              // Upgrade priority to highest seen
              const existingRank = prioRank[existing.priority.toUpperCase()] ?? 2;
              const newPrio = (isObj ? q.priority : undefined) ?? "MEDIUM";
              const newRank = prioRank[newPrio.toUpperCase()] ?? 2;
              if (newRank < existingRank) {
                existing.priority = newPrio;
              }

              // Add agent source if not already present
              if (!existing.agentSources.includes(agentName)) {
                existing.agentSources.push(agentName);
              }

              // Merge context if it has unique triggerData
              if (ctx?.triggerData) {
                const isDupe = existing.contexts.some(
                  (c) => c.triggerData && c.triggerData.toLowerCase().slice(0, 50) === ctx.triggerData!.toLowerCase().slice(0, 50)
                );
                if (!isDupe) {
                  existing.contexts.push(ctx);
                }
              }

              // Merge evaluation if it has unique goodAnswer/badAnswer
              if (evaln?.goodAnswer || evaln?.badAnswer) {
                const isDupe = existing.evaluations.some(
                  (e) => e.goodAnswer && evaln.goodAnswer &&
                    e.goodAnswer.toLowerCase().slice(0, 50) === evaln.goodAnswer.toLowerCase().slice(0, 50)
                );
                if (!isDupe) {
                  existing.evaluations.push(evaln);
                }
              }

              // Keep timing if not set
              if (!existing.timing && (isObj ? q.timing : undefined)) {
                existing.timing = q.timing;
              }
            }
          }
        }
      }
    }

    return { questions, answeredQuestionTexts };
  } catch (error) {
    logPersistenceError("loadPreviousAnalysisQuestions", error, { dealId });
    return { questions: [], answeredQuestionTexts: [] };
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
    logPersistenceError("cleanupOldCheckpoints", error, { analysisId, keepCount });
    return 0;
  }
}
