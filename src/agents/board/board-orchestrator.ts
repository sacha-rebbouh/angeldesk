import { prisma } from "@/lib/prisma";
import { safeDecrypt } from "@/lib/encryption";
import { BoardMember } from "./board-member";
import type {
  BoardOrchestratorOptions,
  BoardInput,
  BoardProgressEvent,
  BoardVerdictResult,
  InitialAnalysis,
  DebateResponse,
  FinalVote,
  BoardVerdictType,
  ConsensusLevelType,
  StoppingConditionResult,
} from "./types";
import { getBoardMembers } from "./types";
import { getCorpusSnapshotDocumentIds } from "@/services/corpus";
import { enrichDeal } from "@/services/context-engine";
import {
  getCurrentFactString,
  pickCanonicalAnalysis,
} from "@/services/deals/canonical-read-model";
import { getCurrentFacts, getDisputedFacts, formatFactStoreForAgents } from "@/services/fact-store";
import { completeJSON, runWithLLMContext } from "@/services/openrouter/router";
import { loadResults } from "@/services/analysis-results/load-results";
import { normalizeThesisEvaluation } from "@/services/thesis/normalization";

const DEFAULT_MAX_ROUNDS = 3;
const DEFAULT_TIMEOUT_MS = 600000; // 10 minutes
const MIN_MEMBERS_REQUIRED = 2; // Continue if at least 2 members are working (graceful degradation)

type BoardContextDocument = {
  id: string;
  name: string;
  type: string;
  extractedText: string | null;
  sourceKind?: string | null;
  corpusRole?: string | null;
  sourceDate?: Date | null;
  receivedAt?: Date | null;
  linkedQuestionText?: string | null;
  corpusParentDocumentId?: string | null;
  corpusParentDocumentName?: string | null;
};

type BoardDealSignals = {
  companyName: string;
  sector?: string;
  stage?: string;
  geography?: string;
  website?: string;
};

function resolveBoardDealSignals(
  deal: {
    name: string;
    companyName: string | null;
    sector: string | null;
    stage: string | null;
    geography: string | null;
    website: string | null;
  },
  currentFacts: Awaited<ReturnType<typeof getCurrentFacts>>
): BoardDealSignals {
  const factMap = new Map(currentFacts.map((fact) => [fact.factKey, fact]));

  return {
    companyName: getCurrentFactString(factMap, "company.name") ?? deal.companyName ?? deal.name,
    sector:
      getCurrentFactString(factMap, "other.sector") ??
      getCurrentFactString(factMap, "market.vertical") ??
      deal.sector ??
      undefined,
    stage: getCurrentFactString(factMap, "product.stage") ?? deal.stage ?? undefined,
    geography:
      getCurrentFactString(factMap, "market.geography_primary") ??
      deal.geography ??
      undefined,
    website: getCurrentFactString(factMap, "other.website") ?? deal.website ?? undefined,
  };
}

export class BoardOrchestrator {
  private sessionId: string | null = null;
  private thesisId: string | null = null;
  private corpusSnapshotId: string | null = null;
  private members: BoardMember[] = [];
  private startTime = 0;
  private onProgress?: (event: BoardProgressEvent) => void;
  private maxRounds: number;
  private timeoutMs: number;

  // Track state
  private initialAnalyses: Map<string, InitialAnalysis> = new Map();
  private currentVerdicts: Map<string, BoardVerdictType> = new Map();
  private previousVerdicts: Map<string, BoardVerdictType> = new Map();
  private debateHistory: {
    roundNumber: number;
    responses: { memberId: string; memberName: string; response: DebateResponse }[];
  }[] = [];

  constructor(options: BoardOrchestratorOptions) {
    this.onProgress = options.onProgress;
    this.maxRounds = options.maxRounds ?? DEFAULT_MAX_ROUNDS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Main entry point - runs the full board deliberation
   */
  async runBoard(options: BoardOrchestratorOptions): Promise<BoardVerdictResult> {
    return runWithLLMContext(
      { agentName: null, analysisId: null },
      () => this._runBoardImpl(options)
    );
  }

  private async _runBoardImpl(options: BoardOrchestratorOptions): Promise<BoardVerdictResult> {
    this.startTime = Date.now();

    // 1. Create or reuse session in DB
    const session = options.sessionId
      ? await prisma.aIBoardSession.findUniqueOrThrow({
          where: { id: options.sessionId },
          select: { id: true },
        })
      : await prisma.aIBoardSession.create({
          data: {
            dealId: options.dealId,
            userId: options.userId,
            status: "INITIALIZING",
            startedAt: new Date(),
          },
        });
    this.sessionId = session.id;

    this.emitProgress({
      type: "session_started",
      sessionId: session.id,
      message: "Session de deliberation initialisee",
    });

    try {
      // 2. Initialize board members AND prepare input package IN PARALLEL
      // These don't depend on each other - saves 500ms-2s latency
      const [, input] = await Promise.all([
        this.initializeMembers(),
        this.prepareInputPackage(options.dealId),
      ]);

      // 3. Update status to ANALYZING
      await prisma.aIBoardSession.update({
        where: { id: session.id },
        data: {
          status: "ANALYZING",
          thesisId: this.thesisId,
          corpusSnapshotId: this.corpusSnapshotId,
        },
      });

      // 3.5 ROUND 0 — Thesis debate (thesis-first) : debat sur la these AVANT analyse deal
      if (input.thesis) {
        this.emitProgress({
          type: "debate_round_started",
          sessionId: session.id,
          roundNumber: 0,
          message: "Round 0 : Debat sur la these d'investissement",
        });
        await this.runThesisDebate(input);
        this.emitProgress({
          type: "debate_round_completed",
          sessionId: session.id,
          roundNumber: 0,
          message: "Round 0 termine",
        });
      }

      // 5. Run initial analyses (PARALLEL)
      await this.runInitialAnalyses(input);

      // Check if we have enough members
      if (this.initialAnalyses.size < MIN_MEMBERS_REQUIRED) {
        throw new Error(
          `Seulement ${this.initialAnalyses.size} membres ont reussi l'analyse. Minimum requis: ${MIN_MEMBERS_REQUIRED}`
        );
      }

      // 6. Update status to DEBATING
      await prisma.aIBoardSession.update({
        where: { id: session.id },
        data: { status: "DEBATING" },
      });

      // 7. Run debate rounds until stopping condition
      await this.runDebateRounds(input);

      // 8. Update status to VOTING
      await prisma.aIBoardSession.update({
        where: { id: session.id },
        data: { status: "VOTING" },
      });

      // 9. Run final votes
      this.emitProgress({
        type: "voting_started",
        sessionId: session.id,
        message: "Vote final en cours",
      });

      const finalVotes = await this.runFinalVotes(input);

      // 10. Compile verdict
      const stoppingCondition = this.checkStoppingCondition(0);
      const result = await this.compileVerdict(
        finalVotes,
        stoppingCondition.reason ?? "max_rounds"
      );

      // 11. Save final results
      await this.saveSessionResults(result);

      this.emitProgress({
        type: "verdict_reached",
        sessionId: session.id,
        verdict: result,
        message: `Verdict: ${result.verdict} (${result.consensusLevel})`,
      });

      return result;
    } catch (error) {
      // Handle failure
      await prisma.aIBoardSession.update({
        where: { id: session.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
        },
      });

      this.emitProgress({
        type: "error",
        sessionId: session.id,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Stop the board prematurely
   */
  async stopBoard(): Promise<BoardVerdictResult | null> {
    if (!this.sessionId) return null;

    await prisma.aIBoardSession.update({
      where: { id: this.sessionId },
      data: {
        status: "STOPPED",
        stoppingReason: "manual_stop",
        completedAt: new Date(),
      },
    });

    this.emitProgress({
      type: "stopped",
      sessionId: this.sessionId,
      message: "Session arretee manuellement",
    });

    // Return partial results if we have any votes
    if (this.currentVerdicts.size > 0) {
      const partialVotes = Array.from(this.currentVerdicts.entries()).map(([memberId, verdict]) => {
        const member = this.members.find((m) => m.id === memberId);
        return {
          memberId,
          memberName: member?.name ?? memberId,
          color: member?.color ?? "#666",
          verdict,
          confidence: 50, // Unknown at this point
          justification: "Session arretee avant le vote final",
        };
      });

      return {
        verdict: this.getMajorityVerdict(),
        consensusLevel: this.calculateConsensusLevel(),
        stoppingReason: "stagnation" as const,
        votes: partialVotes,
        consensusPoints: [],
        frictionPoints: [],
        questionsForFounder: [],
        totalRounds: this.debateHistory.length,
        totalCost: this.getTotalCost(),
        totalTimeMs: Date.now() - this.startTime,
      };
    }

    return null;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async initializeMembers(): Promise<void> {
    // Get board members config based on environment (test vs prod)
    const boardMembersConfig = getBoardMembers();
    this.members = boardMembersConfig.map((config) => new BoardMember(config));

    // Create member records in DB
    if (this.sessionId) {
      await Promise.all(
        this.members.map((member) =>
          prisma.aIBoardMember.create({
            data: {
              sessionId: this.sessionId!,
              modelId: member.modelKey,
              modelName: member.name,
              color: member.color,
            },
          })
        )
      );
    }
  }

  private async prepareInputPackage(dealId: string): Promise<BoardInput> {
    // Fetch deal with all related data
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        founders: true,
        redFlags: true,
        analyses: {
          where: {
            status: "COMPLETED",
            completedAt: { not: null },
          },
          orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            dealId: true,
            mode: true,
            thesisId: true,
            corpusSnapshotId: true,
            completedAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!deal) {
      throw new Error(`Deal ${dealId} non trouve`);
    }

    let currentFacts: Awaited<ReturnType<typeof getCurrentFacts>> = [];
    let disputedFacts: Awaited<ReturnType<typeof getDisputedFacts>> = [];
    try {
      console.log(`[BoardOrchestrator] Fetching Fact Store for deal ${dealId}...`);
      [currentFacts, disputedFacts] = await Promise.all([
        getCurrentFacts(dealId),
        getDisputedFacts(dealId),
      ]);
    } catch (error) {
      console.error(`[BoardOrchestrator] Fact Store fetch failed:`, error);
      // Continue without fact store - board can still function
    }

    const canonicalDeal = resolveBoardDealSignals(deal, currentFacts);

    const { thesisService } = await import("@/services/thesis");
    const latestThesis = await thesisService.getLatest(dealId);
    const canonicalAnalysis = pickCanonicalAnalysis(
      latestThesis
        ? {
            id: latestThesis.id,
            corpusSnapshotId: latestThesis.corpusSnapshotId ?? null,
          }
        : null,
      deal.analyses
    );

    if (latestThesis && !canonicalAnalysis) {
      throw new Error(
        "Cannot run board deliberation without a completed analysis aligned to the latest thesis"
      );
    }

    this.thesisId = latestThesis?.id ?? null;
    this.corpusSnapshotId = canonicalAnalysis?.corpusSnapshotId ?? latestThesis?.corpusSnapshotId ?? null;

    // Get the canonical analysis results aligned to the current thesis
    const analysisResults = canonicalAnalysis
      ? (await loadResults(canonicalAnalysis.id)) as Record<string, unknown> | null
      : null;
    const snapshotDocumentIds = canonicalAnalysis?.corpusSnapshotId
      ? await getCorpusSnapshotDocumentIds(canonicalAnalysis.corpusSnapshotId)
      : [];
    const requestedDocumentIds = snapshotDocumentIds.length > 0 ? snapshotDocumentIds : null;
    const documents = await prisma.document.findMany({
      where: {
        dealId,
        processingStatus: "COMPLETED",
        ...(requestedDocumentIds
          ? { id: { in: requestedDocumentIds } }
          : { isLatest: true }),
      },
      select: {
        id: true,
        name: true,
        type: true,
        extractedText: true,
        sourceKind: true,
        corpusRole: true,
        sourceDate: true,
        receivedAt: true,
        linkedQuestionText: true,
        corpusParentDocumentId: true,
        corpusParentDocument: {
          select: {
            name: true,
          },
        },
      },
    });
    const boardDocuments: BoardContextDocument[] = documents.map((document) => ({
      id: document.id,
      name: document.name,
      type: document.type,
      extractedText: document.extractedText ? safeDecrypt(document.extractedText) : null,
      sourceKind: document.sourceKind,
      corpusRole: document.corpusRole,
      sourceDate: document.sourceDate,
      receivedAt: document.receivedAt,
      linkedQuestionText: document.linkedQuestionText,
      corpusParentDocumentId: document.corpusParentDocumentId,
      corpusParentDocumentName: document.corpusParentDocument?.name ?? null,
    }));

    if (requestedDocumentIds) {
      const order = new Map(requestedDocumentIds.map((documentId, index) => [documentId, index]));
      boardDocuments.sort(
        (left, right) =>
          (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(right.id) ?? Number.MAX_SAFE_INTEGER)
      );
    }

    // Enrich with Context Engine data
    let enrichedData: BoardInput["enrichedData"] = null;
    try {
      console.log(`[BoardOrchestrator] Enriching deal ${dealId} with Context Engine...`);
      const contextData = await enrichDeal(
        {
          companyName: canonicalDeal.companyName,
          sector: canonicalDeal.sector,
          stage: canonicalDeal.stage,
          geography: canonicalDeal.geography,
          websiteUrl: canonicalDeal.website,
        },
        {
          dealId,
          includeFounders: true,
          founders: deal.founders.map((f) => ({
            name: f.name,
            role: f.role ?? undefined,
            linkedinUrl: f.linkedinUrl ?? undefined,
          })),
        }
      );

      // Map Context Engine data to BoardInput format
      if (contextData) {
        enrichedData = {
          linkedinProfiles: contextData.peopleGraph?.founders,
          marketData: contextData.marketData,
          competitorData: contextData.competitiveLandscape,
          fundingHistory: contextData.dealIntelligence,
          newsArticles: contextData.newsSentiment?.articles,
          websiteContent: contextData.websiteContent,
          contextQuality: contextData.contextQuality,
          sourceHealth: contextData.sourceHealth,
        };
        console.log(`[BoardOrchestrator] Context Engine enrichment complete`);
      }
    } catch (error) {
      console.error(`[BoardOrchestrator] Context Engine enrichment failed:`, error);
      // Continue without enriched data - board can still function
    }

    // Build comprehensive agent outputs - ALL TIERS
    const agentOutputs: BoardInput["agentOutputs"] = {};

    if (analysisResults) {
      // Tier 0: Base agents
      agentOutputs.tier0 = {
        documentExtractor: analysisResults["document-extractor"],
        dealScorer: analysisResults["deal-scorer"],
        redFlagDetector: analysisResults["red-flag-detector"],
      };

      // Tier 1: 13 Investigation agents
      agentOutputs.tier1 = {
        deckForensics: analysisResults["deck-forensics"],
        financialAuditor: analysisResults["financial-auditor"],
        marketIntelligence: analysisResults["market-intelligence"],
        competitiveIntel: analysisResults["competitive-intel"],
        teamInvestigator: analysisResults["team-investigator"],
        techStackDD: analysisResults["tech-stack-dd"],
        techOpsDD: analysisResults["tech-ops-dd"],
        legalRegulatory: analysisResults["legal-regulatory"],
        capTableAuditor: analysisResults["cap-table-auditor"],
        gtmAnalyst: analysisResults["gtm-analyst"],
        customerIntel: analysisResults["customer-intel"],
        exitStrategist: analysisResults["exit-strategist"],
        questionMaster: analysisResults["question-master"],
      };

      // Tier 2: Sector expert (find the expert that ran)
      const tier2Experts = [
        "saas-expert", "fintech-expert", "marketplace-expert", "ai-expert",
        "healthtech-expert", "deeptech-expert", "climate-expert", "consumer-expert",
        "hardware-expert", "gaming-expert", "blockchain-expert", "general-expert",
      ];
      for (const expertName of tier2Experts) {
        if (analysisResults[expertName]) {
          agentOutputs.tier2 = {
            sectorExpertName: expertName,
            sectorExpert: analysisResults[expertName],
          };
          break;
        }
      }

      // Tier 3: 5 Synthesis agents
      agentOutputs.tier3 = {
        contradictionDetector: analysisResults["contradiction-detector"],
        scenarioModeler: analysisResults["scenario-modeler"],
        synthesisDealScorer: analysisResults["synthesis-deal-scorer"],
        devilsAdvocate: analysisResults["devils-advocate"],
        memoGenerator: analysisResults["memo-generator"],
      };

    }

    // Fact Store: fetched from service once and reused for the board input
    if (currentFacts.length > 0 || disputedFacts.length > 0) {
      const formattedFactStore = formatFactStoreForAgents(currentFacts);

      agentOutputs.factStore = {
        facts: currentFacts,
        contradictions: disputedFacts,
        formatted: formattedFactStore, // Pre-formatted for LLM
      };
      console.log(
        `[BoardOrchestrator] Fact Store: ${currentFacts.length} facts, ${disputedFacts.length} disputed`
      );
    }

    // Count how many agents have data
    const tier1Count = agentOutputs.tier1
      ? Object.values(agentOutputs.tier1).filter(Boolean).length
      : 0;
    const tier3Count = agentOutputs.tier3
      ? Object.values(agentOutputs.tier3).filter(Boolean).length
      : 0;
    console.log(
      `[BoardOrchestrator] Agent outputs: Tier0=${agentOutputs.tier0 ? 3 : 0}, ` +
      `Tier1=${tier1Count}/13, Tier2=${agentOutputs.tier2 ? 1 : 0}, Tier3=${tier3Count}/5`
    );

    // Thesis-first : charger en priorite la these canonique courante.
    let thesisInput: BoardInput["thesis"] = null;
    try {
      const pairedThesis =
        latestThesis ??
        (canonicalAnalysis?.thesisId
          ? await thesisService.getById(canonicalAnalysis.thesisId)
          : null);

      if (pairedThesis) {
        thesisInput = mapBoardThesisInput(pairedThesis);
        console.log(
          `[BoardOrchestrator] Thesis loaded for round THESIS_DEBATE: thesisId=${pairedThesis.id} verdict=${pairedThesis.verdict} canonicalAnalysis=${canonicalAnalysis?.id ?? "none"}`
        );
      } else {
        console.log(
          `[BoardOrchestrator] No paired thesis found for deal ${dealId} — THESIS_DEBATE round will be skipped`
        );
      }
    } catch (err) {
      console.warn(`[BoardOrchestrator] Failed to load thesis:`, err);
    }

    return {
      dealId: deal.id,
      dealName: deal.name,
      companyName: canonicalDeal.companyName,
      thesis: thesisInput,
      documents: boardDocuments.map(({ name, type, extractedText, sourceKind, corpusRole, sourceDate, receivedAt, linkedQuestionText, corpusParentDocumentId, corpusParentDocumentName }) => ({
        name,
        type,
        extractedText,
        sourceKind,
        corpusRole,
        sourceDate,
        receivedAt,
        linkedQuestionText,
        corpusParentDocumentId,
        corpusParentDocumentName,
      })),
      enrichedData,
      agentOutputs,
      sources: [
        {
          source: "Pitch Deck",
          reliability: "medium" as const,
          dataPoints: boardDocuments
            .filter((document) => document.type === "PITCH_DECK")
            .map((document) => document.name),
        },
        {
          source: "Agent Analysis",
          reliability: "high" as const,
          dataPoints: [
            `${tier1Count} Tier 1 agents`,
            agentOutputs.tier2?.sectorExpertName ?? "No sector expert",
            `${tier3Count} Tier 3 agents`,
          ],
        },
      ],
    };
  }

  private async runInitialAnalyses(input: BoardInput): Promise<void> {
    const results = await Promise.allSettled(
      this.members.map(async (member) => {
        this.emitProgress({
          type: "member_analysis_started",
          sessionId: this.sessionId!,
          memberId: member.id,
          memberName: member.name,
          message: `${member.name} commence son analyse`,
        });

        const { analysis, cost } = await member.analyze(input);

        // Save to DB
        await this.saveMemberAnalysis(member.id, analysis, cost);

        this.emitProgress({
          type: "member_analysis_completed",
          sessionId: this.sessionId!,
          memberId: member.id,
          memberName: member.name,
          analysis,
          message: `${member.name}: ${analysis.verdict} (${analysis.confidence}%)`,
        });

        return { memberId: member.id, analysis };
      })
    );

    // Process results
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const member = this.members[i];
      if (result.status === "fulfilled") {
        this.initialAnalyses.set(result.value.memberId, result.value.analysis);
        this.currentVerdicts.set(result.value.memberId, result.value.analysis.verdict);
      } else {
        const errorMessage = result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
        console.error(`[BoardOrchestrator] ${member.name} analysis failed:`, errorMessage);

        this.emitProgress({
          type: "member_analysis_failed",
          sessionId: this.sessionId!,
          memberId: member.id,
          memberName: member.name,
          error: errorMessage,
          message: `${member.name} a echoue: ${errorMessage}`,
        });
      }
    }
  }

  /**
   * ROUND 0 (thesis-first) : Débat sur la these d'investissement.
   * Chaque membre evalue la solidite de la these AVANT l'analyse du deal.
   * Execute en parallele sur tous les membres. Persist en AIBoardRound avec roundType=THESIS_DEBATE.
   */
  private async runThesisDebate(input: BoardInput): Promise<void> {
    if (!input.thesis || !this.sessionId) return;

    const results = await Promise.allSettled(
      this.members.map(async (member) => {
        this.emitProgress({
          type: "member_analysis_started",
          sessionId: this.sessionId!,
          memberId: member.id,
          memberName: member.name,
          message: `${member.name} debat la these`,
        });

        const { response, cost } = await member.debateThesis(input);

        this.emitProgress({
          type: "debate_response",
          sessionId: this.sessionId!,
          memberId: member.id,
          memberName: member.name,
          roundNumber: 0,
          message: `${member.name} : ${response.agreement} (solidite ${response.thesisSolidityScore}/100)`,
        });

        return { memberId: member.id, memberName: member.name, response, cost };
      })
    );

    const responses: Array<{ memberId: string; memberName: string; response: unknown; cost: number }> = [];
    results.forEach((r, idx) => {
      if (r.status === "fulfilled") {
        responses.push(r.value);
      } else {
        const failedMember = this.members[idx];
        const errorMessage = r.reason instanceof Error ? r.reason.message : String(r.reason);
        console.error(`[BoardOrchestrator] ${failedMember.name} thesis debate failed:`, errorMessage);
      }
    });

    // Persist round THESIS_DEBATE
    await prisma.aIBoardRound.create({
      data: {
        sessionId: this.sessionId,
        roundNumber: 0,
        roundType: "THESIS_DEBATE",
        responses: responses as unknown as Parameters<typeof prisma.aIBoardRound.create>[0]["data"]["responses"],
        currentVerdicts: {},
        consensusReached: false,
        majorityStable: false,
      },
    });

    console.log(
      `[BoardOrchestrator] THESIS_DEBATE round complete : ${responses.length}/${this.members.length} members participated`
    );
  }

  private async runDebateRounds(input: BoardInput): Promise<void> {
    let roundNumber = 1;

    while (roundNumber <= this.maxRounds) {
      // Check timeout
      if (Date.now() - this.startTime > this.timeoutMs) {
        console.log("Board timeout reached");
        break;
      }

      // Check stopping condition before each round
      const stopCheck = this.checkStoppingCondition(roundNumber);
      if (stopCheck.shouldStop) {
        console.log(`Stopping: ${stopCheck.reason}`);
        break;
      }

      this.emitProgress({
        type: "debate_round_started",
        sessionId: this.sessionId!,
        roundNumber,
        message: `Round ${roundNumber} de debat`,
      });

      // Save previous verdicts for stagnation detection
      this.previousVerdicts = new Map(this.currentVerdicts);

      // Run debate round
      const roundResponses = await this.runSingleDebateRound(input, roundNumber);
      this.debateHistory.push({
        roundNumber,
        responses: roundResponses,
      });

      // Save round to DB
      await this.saveDebateRound(roundNumber, roundResponses);

      this.emitProgress({
        type: "debate_round_completed",
        sessionId: this.sessionId!,
        roundNumber,
        message: `Round ${roundNumber} termine`,
      });

      roundNumber++;
    }
  }

  private async runSingleDebateRound(
    input: BoardInput,
    roundNumber: number
  ): Promise<{ memberId: string; memberName: string; response: DebateResponse }[]> {
    // Only include members that succeeded in analysis phase
    const activeMembers = this.members.filter((m) => this.initialAnalyses.has(m.id));

    // Prepare others' analyses for each member
    const results = await Promise.allSettled(
      activeMembers.map(async (member) => {
        const ownAnalysis = this.initialAnalyses.get(member.id);
        if (!ownAnalysis) {
          throw new Error(`No analysis found for ${member.id}`);
        }

        const othersAnalyses = Array.from(this.initialAnalyses.entries())
          .filter(([id]) => id !== member.id)
          .map(([id, analysis]) => {
            const otherMember = this.members.find((m) => m.id === id);
            return {
              memberId: id,
              memberName: otherMember?.name ?? id,
              analysis,
            };
          });

        // Retry once on failure before giving up
        let response: DebateResponse;
        try {
          const result = await member.debate(input, ownAnalysis, othersAnalyses, roundNumber);
          response = result.response;
        } catch {
          console.warn(`[BoardOrchestrator] ${member.name} debate attempt 1 failed, retrying...`);
          const result = await member.debate(input, ownAnalysis, othersAnalyses, roundNumber);
          response = result.response;
        }

        this.emitProgress({
          type: "debate_response",
          sessionId: this.sessionId!,
          memberId: member.id,
          memberName: member.name,
          roundNumber,
          debateResponse: response,
          message: `${member.name}: ${response.positionChanged ? "A CHANGE de position" : "Maintient sa position"}`,
        });

        // Update current verdict if changed
        if (response.positionChanged && response.newVerdict) {
          this.currentVerdicts.set(member.id, response.newVerdict);
        }

        return {
          memberId: member.id,
          memberName: member.name,
          response,
        };
      })
    );

    const successful: { memberId: string; memberName: string; response: DebateResponse }[] = [];

    results.forEach((r, idx) => {
      if (r.status === "fulfilled") {
        successful.push(r.value);
      } else {
        const failedMember = activeMembers[idx];
        const errorMessage = r.reason instanceof Error ? r.reason.message : String(r.reason);
        console.error(`[BoardOrchestrator] ${failedMember.name} debate round ${roundNumber} failed:`, errorMessage);

        this.emitProgress({
          type: "member_analysis_failed",
          sessionId: this.sessionId!,
          memberId: failedMember.id,
          memberName: failedMember.name,
          error: `Debat round ${roundNumber}: ${errorMessage}`,
          message: `${failedMember.name} n'a pas pu participer au round ${roundNumber}`,
        });
      }
    });

    return successful;
  }

  private async runFinalVotes(
    input: BoardInput
  ): Promise<{ memberId: string; member: BoardMember; vote: FinalVote }[]> {
    // Only vote with members that participated in analysis
    const activeMembers = this.members.filter((m) => this.initialAnalyses.has(m.id));

    const results = await Promise.allSettled(
      activeMembers.map(async (member) => {
        // Retry once on failure
        let vote: FinalVote;
        let cost: number;
        try {
          const result = await member.vote(input, this.debateHistory);
          vote = result.vote;
          cost = result.cost;
        } catch {
          console.warn(`[BoardOrchestrator] ${member.name} vote attempt 1 failed, retrying...`);
          const result = await member.vote(input, this.debateHistory);
          vote = result.vote;
          cost = result.cost;
        }

        this.emitProgress({
          type: "member_voted",
          sessionId: this.sessionId!,
          memberId: member.id,
          memberName: member.name,
          vote,
          message: `${member.name} vote ${vote.verdict} (${vote.confidence}%)`,
        });

        // Update verdict
        this.currentVerdicts.set(member.id, vote.verdict);

        // Save to DB
        await this.saveMemberVote(member.id, vote, cost);

        return { memberId: member.id, member, vote };
      })
    );

    const successful: { memberId: string; member: BoardMember; vote: FinalVote }[] = [];

    results.forEach((r, idx) => {
      if (r.status === "fulfilled") {
        successful.push(r.value);
      } else {
        const failedMember = activeMembers[idx];
        const errorMessage = r.reason instanceof Error ? r.reason.message : String(r.reason);
        console.error(`[BoardOrchestrator] ${failedMember.name} vote failed:`, errorMessage);

        this.emitProgress({
          type: "member_analysis_failed",
          sessionId: this.sessionId!,
          memberId: failedMember.id,
          memberName: failedMember.name,
          error: `Vote: ${errorMessage}`,
          message: `${failedMember.name} n'a pas pu voter`,
        });
      }
    });

    return successful;
  }

  private checkStoppingCondition(roundNumber: number): StoppingConditionResult {
    const verdicts = this.currentVerdicts;
    const verdictCounts: Record<BoardVerdictType, number> = {
      VERY_FAVORABLE: 0,
      FAVORABLE: 0,
      CONTRASTED: 0,
      VIGILANCE: 0,
      ALERT_DOMINANT: 0,
      NEED_MORE_INFO: 0,
    };

    for (const verdict of verdicts.values()) {
      verdictCounts[verdict]++;
    }

    const totalMembers = verdicts.size;
    const currentVerdictsObj = Object.fromEntries(verdicts);

    // Consensus: 4/4 same verdict
    for (const count of Object.values(verdictCounts)) {
      if (count === totalMembers && totalMembers >= MIN_MEMBERS_REQUIRED) {
        return {
          shouldStop: true,
          reason: "consensus",
          currentVerdicts: currentVerdictsObj,
          consensusLevel: "UNANIMOUS",
        };
      }
    }

    // Majority stable: 3/4 same verdict + no change since last round
    for (const count of Object.values(verdictCounts)) {
      if (count >= 3 && totalMembers >= 3) {
        // Check if stable (no position changes)
        let stable = true;
        for (const [memberId, currentVerdict] of verdicts.entries()) {
          const previousVerdict = this.previousVerdicts.get(memberId);
          if (previousVerdict && previousVerdict !== currentVerdict) {
            stable = false;
            break;
          }
        }

        if (stable && this.previousVerdicts.size > 0) {
          return {
            shouldStop: true,
            reason: "majority_stable",
            currentVerdicts: currentVerdictsObj,
            consensusLevel: "STRONG",
          };
        }
      }
    }

    // Max rounds reached
    if (roundNumber >= this.maxRounds) {
      return {
        shouldStop: true,
        reason: "max_rounds",
        currentVerdicts: currentVerdictsObj,
        consensusLevel: this.calculateConsensusLevel(),
      };
    }

    // Stagnation: No position changes at all
    if (this.previousVerdicts.size > 0) {
      let anyChange = false;
      for (const [memberId, currentVerdict] of verdicts.entries()) {
        const previousVerdict = this.previousVerdicts.get(memberId);
        if (previousVerdict !== currentVerdict) {
          anyChange = true;
          break;
        }
      }

      if (!anyChange) {
        return {
          shouldStop: true,
          reason: "stagnation",
          currentVerdicts: currentVerdictsObj,
          consensusLevel: this.calculateConsensusLevel(),
        };
      }
    }

    return {
      shouldStop: false,
      reason: null,
      currentVerdicts: currentVerdictsObj,
      consensusLevel: null,
    };
  }

  private calculateConsensusLevel(): ConsensusLevelType {
    const verdictCounts: Record<BoardVerdictType, number> = {
      VERY_FAVORABLE: 0,
      FAVORABLE: 0,
      CONTRASTED: 0,
      VIGILANCE: 0,
      ALERT_DOMINANT: 0,
      NEED_MORE_INFO: 0,
    };

    for (const verdict of this.currentVerdicts.values()) {
      verdictCounts[verdict]++;
    }

    const maxCount = Math.max(...Object.values(verdictCounts));
    const totalMembers = this.currentVerdicts.size;

    if (maxCount === totalMembers) return "UNANIMOUS";
    if (maxCount >= 3) return "STRONG";
    if (maxCount === 2 && totalMembers === 4) return "SPLIT";
    return "MINORITY";
  }

  private getMajorityVerdict(): BoardVerdictType {
    const verdictCounts: Record<BoardVerdictType, number> = {
      VERY_FAVORABLE: 0,
      FAVORABLE: 0,
      CONTRASTED: 0,
      VIGILANCE: 0,
      ALERT_DOMINANT: 0,
      NEED_MORE_INFO: 0,
    };

    for (const verdict of this.currentVerdicts.values()) {
      verdictCounts[verdict]++;
    }

    let maxVerdict: BoardVerdictType = "CONTRASTED";
    let maxCount = 0;

    for (const [verdict, count] of Object.entries(verdictCounts)) {
      if (count > maxCount) {
        maxCount = count;
        maxVerdict = verdict as BoardVerdictType;
      }
    }

    return maxVerdict;
  }

  private async compileVerdict(
    finalVotes: { memberId: string; member: BoardMember; vote: FinalVote }[],
    reason: "consensus" | "majority_stable" | "max_rounds" | "stagnation"
  ): Promise<BoardVerdictResult> {
    // Calculate consensus level
    const consensusLevel = this.calculateConsensusLevel();
    const majorityVerdict = this.getMajorityVerdict();

    // Collect raw points from all members
    const rawAgreementPoints = finalVotes.flatMap((v) => v.vote.agreementPoints);
    const rawConcerns = finalVotes.flatMap((v) => v.vote.remainingConcerns);
    const rawQuestions = this.collectRawQuestions(finalVotes);

    // LLM-powered deduplication + synthesis for high confidence
    const synth = await this.synthesizeKeyPoints(rawAgreementPoints, rawConcerns, rawQuestions);

    // P1 — Sanitize toutes les narratives avant persistence + export client.
    // Les membres du board peuvent produire des votes avec langage prescriptif;
    // la regle N°1 interdit ces formulations dans toute UI visible par le BA.
    const { sanitizeAgentNarratives } = await import("@/agents/orchestration/result-sanitizer");
    const { data: sanitized, totalViolations } = sanitizeAgentNarratives({
      consensusPoints: synth.consensusPoints,
      frictionPoints: synth.frictionPoints,
      questionsForFounder: synth.questionsForFounder,
      votes: finalVotes.map((v) => ({
        memberId: v.memberId,
        memberName: v.member.name,
        color: v.member.color,
        verdict: v.vote.verdict,
        confidence: v.vote.confidence,
        justification: v.vote.justification,
      })),
    });
    if (totalViolations > 0) {
      console.warn(`[BoardOrchestrator] Sanitized ${totalViolations} prescriptive violations`);
    }
    const safe = sanitized as {
      consensusPoints: string[];
      frictionPoints: string[];
      questionsForFounder: string[];
      votes: Array<{
        memberId: string;
        memberName: string;
        color: string;
        verdict: FinalVote["verdict"];
        confidence: number;
        justification: string;
      }>;
    };

    return {
      verdict: majorityVerdict,
      consensusLevel,
      stoppingReason: reason,
      votes: safe.votes,
      consensusPoints: safe.consensusPoints,
      frictionPoints: safe.frictionPoints,
      questionsForFounder: safe.questionsForFounder,
      totalRounds: this.debateHistory.length,
      totalCost: this.getTotalCost(),
      totalTimeMs: Date.now() - this.startTime,
    };
  }

  private collectRawQuestions(
    finalVotes: { memberId: string; member: BoardMember; vote: FinalVote }[]
  ): string[] {
    const questions: string[] = [];
    for (const { vote } of finalVotes) {
      for (const factor of vote.keyFactors) {
        if (factor.direction === "negative" && factor.weight === "high") {
          questions.push(`Comment comptez-vous adresser: ${factor.factor}?`);
        }
      }
      for (const concern of vote.remainingConcerns) {
        questions.push(`Pouvez-vous clarifier: ${concern}?`);
      }
    }
    return questions;
  }

  /**
   * Uses a fast/cheap LLM call to deduplicate and synthesize the 3 lists.
   * Multiple board members often express the same insight in different words —
   * this merges duplicates and produces clean, non-redundant bullet points.
   * Falls back to simple Set-based dedup if the LLM call fails.
   */
  private async synthesizeKeyPoints(
    rawConsensus: string[],
    rawFriction: string[],
    rawQuestions: string[]
  ): Promise<{
    consensusPoints: string[];
    frictionPoints: string[];
    questionsForFounder: string[];
  }> {
    // Fallback: simple exact-match dedup
    const fallback = {
      consensusPoints: [...new Set(rawConsensus)],
      frictionPoints: [...new Set(rawFriction)],
      questionsForFounder: [...new Set(rawQuestions)],
    };

    if (rawConsensus.length === 0 && rawFriction.length === 0 && rawQuestions.length === 0) {
      return fallback;
    }

    try {
      const prompt = `Tu es un analyste qui synthetise les resultats d'un comite d'investissement.

4 analystes IA ont chacun produit leurs points de consensus, points de friction, et questions pour le fondateur. Beaucoup de ces points sont REDONDANTS car les analystes expriment la meme idee differemment.

Ta tache: FUSIONNER les doublons semantiques et produire des listes DEDUPLICQUEES. Quand plusieurs analystes disent la meme chose avec des mots differents, garde UNE SEULE version (la plus precise et detaillee). Ne perds aucune idee unique.

## POINTS DE CONSENSUS BRUTS (${rawConsensus.length} items):
${rawConsensus.map((p, i) => `${i + 1}. ${p}`).join("\n")}

## POINTS DE FRICTION BRUTS (${rawFriction.length} items):
${rawFriction.map((p, i) => `${i + 1}. ${p}`).join("\n")}

## QUESTIONS BRUTES (${rawQuestions.length} items):
${rawQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

Reponds en JSON strict:
{
  "consensusPoints": ["point unique 1", "point unique 2", ...],
  "frictionPoints": ["point unique 1", "point unique 2", ...],
  "questionsForFounder": ["question unique 1", "question unique 2", ...]
}

REGLES:
- Chaque point doit etre unique — ZERO redondance
- Garde la formulation la plus precise et detaillee quand tu fusionnes
- AUCUNE limite de nombre — garde TOUS les points uniques, n'en supprime aucun
- N'INVENTE aucun point — tu ne fais que fusionner et reformuler les points existants
- Si tu n'es pas sur que deux points sont des doublons, garde les deux
- En francais
- JSON seulement, rien d'autre`;

      const { buildFallbackSystemPrompt } = await import("@/agents/orchestration/prompts/anti-hallucination");
      const result = await completeJSON<{
        consensusPoints: string[];
        frictionPoints: string[];
        questionsForFounder: string[];
      }>(prompt, {
        model: "SONNET",
        maxTokens: 2000,
        temperature: 0.1,
        systemPrompt: buildFallbackSystemPrompt(
          "Tu es un analyste qui dedoublonne semantiquement les points de consensus, de friction et les questions produits par un board d'analystes IA. Tu ne produis AUCUN jugement d'investissement, tu fais de la fusion de formulations redondantes uniquement."
        ),
      });

      // Validate the response structure
      const { data } = result;
      if (
        Array.isArray(data.consensusPoints) &&
        Array.isArray(data.frictionPoints) &&
        Array.isArray(data.questionsForFounder)
      ) {
        return {
          consensusPoints: data.consensusPoints.filter((s) => typeof s === "string" && s.length > 0),
          frictionPoints: data.frictionPoints.filter((s) => typeof s === "string" && s.length > 0),
          questionsForFounder: data.questionsForFounder.filter((s) => typeof s === "string" && s.length > 0),
        };
      }

      // Invalid structure, use fallback
      return fallback;
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[BoardOrchestrator] synthesizeKeyPoints LLM failed, using fallback:", error);
      }
      return fallback;
    }
  }

  private getTotalCost(): number {
    return this.members.reduce((sum, member) => sum + member.getTotalCost(), 0);
  }

  private emitProgress(event: Omit<BoardProgressEvent, "timestamp">): void {
    if (this.onProgress) {
      this.onProgress({
        ...event,
        timestamp: Date.now(),
      } as BoardProgressEvent);
    }
  }

  // ============================================================================
  // DATABASE OPERATIONS
  // ============================================================================

  private async saveMemberAnalysis(
    memberId: string,
    analysis: InitialAnalysis,
    cost: number
  ): Promise<void> {
    if (!this.sessionId) return;

    await prisma.aIBoardMember.updateMany({
      where: {
        sessionId: this.sessionId,
        modelId: this.members.find((m) => m.id === memberId)?.modelKey,
      },
      data: {
        initialAnalysis: analysis as unknown as Parameters<typeof prisma.aIBoardMember.updateMany>[0]["data"]["initialAnalysis"],
        analysisCost: cost,
      },
    });
  }

  private async saveMemberVote(
    memberId: string,
    vote: FinalVote,
    cost: number
  ): Promise<void> {
    if (!this.sessionId) return;

    await prisma.aIBoardMember.updateMany({
      where: {
        sessionId: this.sessionId,
        modelId: this.members.find((m) => m.id === memberId)?.modelKey,
      },
      data: {
        finalVote: vote.verdict,
        finalConfidence: vote.confidence,
        voteJustification: vote.justification,
        voteCost: cost,
      },
    });
  }

  private async saveDebateRound(
    roundNumber: number,
    responses: { memberId: string; memberName: string; response: DebateResponse }[]
  ): Promise<void> {
    if (!this.sessionId) return;

    const verdictCounts: Record<BoardVerdictType, number> = {
      VERY_FAVORABLE: 0,
      FAVORABLE: 0,
      CONTRASTED: 0,
      VIGILANCE: 0,
      ALERT_DOMINANT: 0,
      NEED_MORE_INFO: 0,
    };

    for (const verdict of this.currentVerdicts.values()) {
      verdictCounts[verdict]++;
    }

    const consensusReached = Object.values(verdictCounts).some((c) => c === this.currentVerdicts.size);
    const majorityStable = Object.values(verdictCounts).some((c) => c >= 3);

    await prisma.aIBoardRound.create({
      data: {
        sessionId: this.sessionId,
        roundNumber,
        roundType: "DEBATE",
        responses: responses as unknown as Parameters<typeof prisma.aIBoardRound.create>[0]["data"]["responses"],
        currentVerdicts: Object.fromEntries(this.currentVerdicts),
        consensusReached,
        majorityStable,
      },
    });

    // Update session round count
    await prisma.aIBoardSession.update({
      where: { id: this.sessionId },
      data: { totalRounds: roundNumber },
    });
  }

  private async saveSessionResults(result: BoardVerdictResult): Promise<void> {
    if (!this.sessionId) return;

    await prisma.aIBoardSession.update({
      where: { id: this.sessionId },
      data: {
        status: "COMPLETED",
        verdict: result.verdict,
        consensusLevel: result.consensusLevel,
        stoppingReason: result.stoppingReason,
        consensusPoints: result.consensusPoints,
        frictionPoints: result.frictionPoints,
        questionsForFounder: result.questionsForFounder,
        totalCost: result.totalCost,
        totalTimeMs: result.totalTimeMs,
        completedAt: new Date(),
      },
    });
  }
}

function mapBoardThesisInput(
  thesis: {
    id: string;
    reformulated: string;
    problem: string;
    solution: string;
    whyNow: string;
    moat: string | null;
    pathToExit: string | null;
    verdict: string;
    confidence: number;
    loadBearing: unknown;
    alerts: unknown;
    ycLens: unknown;
    thielLens: unknown;
    angelDeskLens: unknown;
  }
): NonNullable<BoardInput["thesis"]> {
  const loadBearingArr = Array.isArray(thesis.loadBearing) ? thesis.loadBearing : [];
  const alertsArr = Array.isArray(thesis.alerts) ? thesis.alerts : [];

  return {
    id: thesis.id,
    reformulated: thesis.reformulated,
    problem: thesis.problem,
    solution: thesis.solution,
    whyNow: thesis.whyNow,
    moat: thesis.moat,
    pathToExit: thesis.pathToExit,
    verdict: thesis.verdict,
    confidence: thesis.confidence,
    loadBearing: loadBearingArr as NonNullable<BoardInput["thesis"]>["loadBearing"],
    alerts: alertsArr as NonNullable<BoardInput["thesis"]>["alerts"],
    ycLens: (thesis.ycLens as { verdict: string; availability?: "evaluated" | "degraded_schema_recovered" | "degraded_chain_exhausted" }) ?? { verdict: "unknown", availability: "evaluated" },
    thielLens: (thesis.thielLens as { verdict: string; availability?: "evaluated" | "degraded_schema_recovered" | "degraded_chain_exhausted" }) ?? { verdict: "unknown", availability: "evaluated" },
    angelDeskLens: (thesis.angelDeskLens as { verdict: string; availability?: "evaluated" | "degraded_schema_recovered" | "degraded_chain_exhausted" }) ?? { verdict: "unknown", availability: "evaluated" },
    evaluationAxes: normalizeThesisEvaluation({
      verdict: thesis.verdict as never,
      confidence: thesis.confidence,
      ycLens: thesis.ycLens as never,
      thielLens: thesis.thielLens as never,
      angelDeskLens: thesis.angelDeskLens as never,
    }),
  };
}
