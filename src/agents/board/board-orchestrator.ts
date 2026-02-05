import { prisma } from "@/lib/prisma";
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
import { enrichDeal } from "@/services/context-engine";
import { getCurrentFacts, getDisputedFacts, formatFactStoreForAgents } from "@/services/fact-store";

const DEFAULT_MAX_ROUNDS = 3;
const DEFAULT_TIMEOUT_MS = 600000; // 10 minutes
const MIN_MEMBERS_REQUIRED = 3; // Continue if at least 3 members are working

export class BoardOrchestrator {
  private sessionId: string | null = null;
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
    this.startTime = Date.now();

    // 1. Create session in DB
    const session = await prisma.aIBoardSession.create({
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
        data: { status: "ANALYZING" },
      });

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
      const result = this.compileVerdict(
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
        documents: true,
        founders: true,
        redFlags: true,
        analyses: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!deal) {
      throw new Error(`Deal ${dealId} non trouve`);
    }

    // Get the latest analysis results
    const latestAnalysis = deal.analyses[0];
    const analysisResults = latestAnalysis?.results as Record<string, unknown> | null;

    // Enrich with Context Engine data
    let enrichedData: BoardInput["enrichedData"] = null;
    try {
      console.log(`[BoardOrchestrator] Enriching deal ${dealId} with Context Engine...`);
      const contextData = await enrichDeal(
        {
          companyName: deal.companyName ?? deal.name,
          sector: deal.sector ?? undefined,
          stage: deal.stage ?? undefined,
          geography: deal.geography ?? undefined,
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

    // Fact Store: Fetch directly from service (not from analysis results)
    try {
      console.log(`[BoardOrchestrator] Fetching Fact Store for deal ${dealId}...`);
      const [currentFacts, disputedFacts] = await Promise.all([
        getCurrentFacts(dealId),
        getDisputedFacts(dealId),
      ]);

      if (currentFacts.length > 0 || disputedFacts.length > 0) {
        // Format for LLM consumption
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
    } catch (error) {
      console.error(`[BoardOrchestrator] Fact Store fetch failed:`, error);
      // Continue without fact store - board can still function
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

    return {
      dealId: deal.id,
      dealName: deal.name,
      companyName: deal.companyName ?? deal.name,
      documents: deal.documents.map((doc) => ({
        name: doc.name,
        type: doc.type,
        extractedText: doc.extractedText,
      })),
      enrichedData,
      agentOutputs,
      sources: [
        {
          source: "Pitch Deck",
          reliability: "medium" as const,
          dataPoints: deal.documents
            .filter((d) => d.type === "PITCH_DECK")
            .map((d) => d.name),
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
    for (const result of results) {
      if (result.status === "fulfilled") {
        this.initialAnalyses.set(result.value.memberId, result.value.analysis);
        this.currentVerdicts.set(result.value.memberId, result.value.analysis.verdict);
      } else {
        console.error(`Member analysis failed:`, result.reason);
      }
    }
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
    // Prepare others' analyses for each member
    const results = await Promise.allSettled(
      this.members.map(async (member) => {
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

        const { response, cost } = await member.debate(
          input,
          ownAnalysis,
          othersAnalyses,
          roundNumber
        );

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

    return results
      .filter((r): r is PromiseFulfilledResult<{ memberId: string; memberName: string; response: DebateResponse }> =>
        r.status === "fulfilled"
      )
      .map((r) => r.value);
  }

  private async runFinalVotes(
    input: BoardInput
  ): Promise<{ memberId: string; member: BoardMember; vote: FinalVote }[]> {
    const results = await Promise.allSettled(
      this.members.map(async (member) => {
        const { vote, cost } = await member.vote(input, this.debateHistory);

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

    return results
      .filter((r): r is PromiseFulfilledResult<{ memberId: string; member: BoardMember; vote: FinalVote }> =>
        r.status === "fulfilled"
      )
      .map((r) => r.value);
  }

  private checkStoppingCondition(roundNumber: number): StoppingConditionResult {
    const verdicts = this.currentVerdicts;
    const verdictCounts: Record<BoardVerdictType, number> = {
      GO: 0,
      NO_GO: 0,
      NEED_MORE_INFO: 0,
    };

    for (const verdict of verdicts.values()) {
      verdictCounts[verdict]++;
    }

    const totalMembers = verdicts.size;
    const currentVerdictsObj = Object.fromEntries(verdicts);

    // Consensus: 4/4 same verdict
    for (const [verdict, count] of Object.entries(verdictCounts)) {
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
    for (const [verdict, count] of Object.entries(verdictCounts)) {
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
      GO: 0,
      NO_GO: 0,
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
      GO: 0,
      NO_GO: 0,
      NEED_MORE_INFO: 0,
    };

    for (const verdict of this.currentVerdicts.values()) {
      verdictCounts[verdict]++;
    }

    let maxVerdict: BoardVerdictType = "NEED_MORE_INFO";
    let maxCount = 0;

    for (const [verdict, count] of Object.entries(verdictCounts)) {
      if (count > maxCount) {
        maxCount = count;
        maxVerdict = verdict as BoardVerdictType;
      }
    }

    return maxVerdict;
  }

  private compileVerdict(
    finalVotes: { memberId: string; member: BoardMember; vote: FinalVote }[],
    reason: "consensus" | "majority_stable" | "max_rounds" | "stagnation"
  ): BoardVerdictResult {
    // Calculate consensus level
    const consensusLevel = this.calculateConsensusLevel();
    const majorityVerdict = this.getMajorityVerdict();

    // Collect consensus points (mentioned by multiple members)
    const allAgreementPoints = finalVotes.flatMap((v) => v.vote.agreementPoints);
    const consensusPoints = [...new Set(allAgreementPoints)];

    // Collect friction points (remaining concerns)
    const allConcerns = finalVotes.flatMap((v) => v.vote.remainingConcerns);
    const frictionPoints = [...new Set(allConcerns)];

    // Generate questions for founder based on concerns
    const questionsForFounder = this.generateFounderQuestions(finalVotes);

    return {
      verdict: majorityVerdict,
      consensusLevel,
      stoppingReason: reason,
      votes: finalVotes.map((v) => ({
        memberId: v.memberId,
        memberName: v.member.name,
        color: v.member.color,
        verdict: v.vote.verdict,
        confidence: v.vote.confidence,
        justification: v.vote.justification,
      })),
      consensusPoints,
      frictionPoints,
      questionsForFounder,
      totalRounds: this.debateHistory.length,
      totalCost: this.getTotalCost(),
      totalTimeMs: Date.now() - this.startTime,
    };
  }

  private generateFounderQuestions(
    finalVotes: { memberId: string; member: BoardMember; vote: FinalVote }[]
  ): string[] {
    const questions = new Set<string>();

    // Convert negative factors into questions
    for (const { vote } of finalVotes) {
      for (const factor of vote.keyFactors) {
        if (factor.direction === "negative" && factor.weight === "high") {
          questions.add(`Comment comptez-vous adresser: ${factor.factor}?`);
        }
      }

      for (const concern of vote.remainingConcerns) {
        questions.add(`Pouvez-vous clarifier: ${concern}?`);
      }
    }

    return Array.from(questions).slice(0, 10); // Max 10 questions
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
      GO: 0,
      NO_GO: 0,
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
