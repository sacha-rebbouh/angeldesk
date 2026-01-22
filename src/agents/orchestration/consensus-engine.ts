/**
 * Consensus Engine
 * Detects contradictions and manages agent debates for resolution
 */

import { complete } from "@/services/openrouter/router";
import type { ScoredFinding, ConfidenceScore } from "@/scoring/types";
import { confidenceCalculator } from "@/scoring";
import { messageBus } from "./message-bus";
import { createContradictionMessage } from "./message-types";

// ============================================================================
// TYPES
// ============================================================================

export interface DetectedContradiction {
  id: string;
  topic: string;
  findings: ScoredFinding[];
  claims: ContradictionClaim[];
  severity: "minor" | "moderate" | "major" | "critical";
  impactAreas: string[];
  detectedAt: Date;
  status: "detected" | "debating" | "resolved" | "accepted";
}

export interface ContradictionClaim {
  agentName: string;
  findingId: string;
  claim: string;
  value: unknown;
  confidence: number;
}

export interface DebateRound {
  roundNumber: number;
  positions: DebatePosition[];
  timestamp: Date;
}

export interface DebatePosition {
  agentName: string;
  position: string;
  supportingEvidence: string[];
  counterArguments?: string[];
  confidenceChange: number;
  finalPosition?: boolean;
}

export interface ContradictionResolution {
  contradictionId: string;
  resolvedBy: "consensus" | "arbitration" | "accepted";
  winner?: string; // Agent whose position won
  resolution: string;
  finalValue?: unknown;
  confidence: ConfidenceScore;
  debateRounds: DebateRound[];
  resolvedAt: Date;
}

export interface DebateResult {
  contradiction: DetectedContradiction;
  rounds: DebateRound[];
  resolution: ContradictionResolution;
}

// ============================================================================
// CONSENSUS ENGINE
// ============================================================================

// Cache key for similar debates
interface DebateCacheKey {
  topic: string;
  claimsHash: string;
}

export class ConsensusEngine {
  private contradictions: Map<string, DetectedContradiction> = new Map();
  private resolutions: Map<string, ContradictionResolution> = new Map();
  private maxDebateRounds = 3;

  // Cache for similar debate resolutions (improves reproducibility)
  private resolutionCache: Map<string, ContradictionResolution> = new Map();

  /**
   * Detect contradictions in findings
   */
  async detectContradictions(findings: ScoredFinding[]): Promise<DetectedContradiction[]> {
    const contradictions: DetectedContradiction[] = [];

    // Group findings by topic/metric
    const byTopic = this.groupFindingsByTopic(findings);

    for (const [topic, topicFindings] of byTopic.entries()) {
      // Check for conflicting values
      const conflicts = await this.findConflicts(topic, topicFindings);
      contradictions.push(...conflicts);
    }

    // Store and publish
    for (const contradiction of contradictions) {
      this.contradictions.set(contradiction.id, contradiction);

      // Publish to message bus
      await messageBus.publish(
        createContradictionMessage(
          "consensus-engine",
          contradiction.findings.map((f) => f.id),
          `Contradiction detected in ${contradiction.topic}: ${contradiction.claims.map((c) => c.claim).join(" vs ")}`,
          contradiction.severity
        )
      );
    }

    return contradictions;
  }

  /**
   * Generate cache key for a contradiction
   * Similar contradictions (same topic, same claims) will have the same key
   */
  private generateCacheKey(contradiction: DetectedContradiction): string {
    const claimsSorted = contradiction.claims
      .map((c) => `${c.agentName}:${c.claim}`)
      .sort()
      .join("|");
    return `${contradiction.topic}::${claimsSorted}`;
  }

  /**
   * Run a structured debate to resolve a contradiction
   * Uses cache for reproducibility - similar debates return cached resolutions
   */
  async debate(contradictionId: string): Promise<DebateResult> {
    const contradiction = this.contradictions.get(contradictionId);
    if (!contradiction) {
      throw new Error(`Contradiction ${contradictionId} not found`);
    }

    // Check cache for similar debate resolution
    const cacheKey = this.generateCacheKey(contradiction);
    const cachedResolution = this.resolutionCache.get(cacheKey);
    if (cachedResolution) {
      // Return cached resolution with updated IDs
      const resolution: ContradictionResolution = {
        ...cachedResolution,
        contradictionId: contradiction.id,
        resolvedAt: new Date(),
      };
      contradiction.status = "resolved";
      this.resolutions.set(contradiction.id, resolution);
      return {
        contradiction,
        rounds: cachedResolution.debateRounds,
        resolution,
      };
    }

    contradiction.status = "debating";
    const rounds: DebateRound[] = [];

    // Round 1: Initial positions
    const round1 = await this.debateRound1(contradiction);
    rounds.push(round1);

    // Check for consensus
    if (this.hasConsensus(round1)) {
      return this.finalizeDebate(contradiction, rounds, "consensus");
    }

    // Round 2: Rebuttals
    const round2 = await this.debateRound2(contradiction, round1);
    rounds.push(round2);

    // Check for consensus
    if (this.hasConsensus(round2)) {
      return this.finalizeDebate(contradiction, rounds, "consensus");
    }

    // Round 3: Final positions
    const round3 = await this.debateRound3(contradiction, rounds);
    rounds.push(round3);

    // If still no consensus, arbitrate
    if (!this.hasConsensus(round3)) {
      return this.finalizeDebate(contradiction, rounds, "arbitration");
    }

    return this.finalizeDebate(contradiction, rounds, "consensus");
  }

  /**
   * Accept a contradiction without resolution
   */
  acceptContradiction(contradictionId: string, reason: string): void {
    const contradiction = this.contradictions.get(contradictionId);
    if (contradiction) {
      contradiction.status = "accepted";

      const resolution: ContradictionResolution = {
        contradictionId,
        resolvedBy: "accepted",
        resolution: reason,
        confidence: confidenceCalculator.calculate({ dataAvailability: 50 }),
        debateRounds: [],
        resolvedAt: new Date(),
      };

      this.resolutions.set(contradictionId, resolution);
    }
  }

  /**
   * Get all unresolved contradictions
   */
  getUnresolved(): DetectedContradiction[] {
    return Array.from(this.contradictions.values()).filter(
      (c) => c.status === "detected" || c.status === "debating"
    );
  }

  /**
   * Get resolution for a contradiction
   */
  getResolution(contradictionId: string): ContradictionResolution | undefined {
    return this.resolutions.get(contradictionId);
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Group findings by topic/metric
   */
  private groupFindingsByTopic(findings: ScoredFinding[]): Map<string, ScoredFinding[]> {
    const groups = new Map<string, ScoredFinding[]>();

    for (const finding of findings) {
      // Group by metric name as primary key
      const key = finding.metric;
      const existing = groups.get(key) ?? [];
      existing.push(finding);
      groups.set(key, existing);
    }

    return groups;
  }

  /**
   * Find conflicts within a topic group
   */
  private async findConflicts(
    topic: string,
    findings: ScoredFinding[]
  ): Promise<DetectedContradiction[]> {
    const conflicts: DetectedContradiction[] = [];

    // Need at least 2 findings to have a conflict
    if (findings.length < 2) return conflicts;

    // Compare pairs of findings
    for (let i = 0; i < findings.length; i++) {
      for (let j = i + 1; j < findings.length; j++) {
        const f1 = findings[i];
        const f2 = findings[j];

        // Skip if from same agent
        if (f1.agentName === f2.agentName) continue;

        // Check for conflict
        const isConflict = await this.areConflicting(f1, f2);

        if (isConflict) {
          const severity = this.calculateConflictSeverity(f1, f2);

          conflicts.push({
            id: crypto.randomUUID(),
            topic,
            findings: [f1, f2],
            claims: [
              {
                agentName: f1.agentName,
                findingId: f1.id,
                claim: `${f1.metric}: ${f1.value} ${f1.unit} (${f1.assessment})`,
                value: f1.value,
                confidence: f1.confidence.score,
              },
              {
                agentName: f2.agentName,
                findingId: f2.id,
                claim: `${f2.metric}: ${f2.value} ${f2.unit} (${f2.assessment})`,
                value: f2.value,
                confidence: f2.confidence.score,
              },
            ],
            severity,
            impactAreas: [f1.category, f2.category],
            detectedAt: new Date(),
            status: "detected",
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Check if two findings are conflicting
   */
  private async areConflicting(f1: ScoredFinding, f2: ScoredFinding): Promise<boolean> {
    // Numeric comparison
    if (typeof f1.value === "number" && typeof f2.value === "number") {
      const v1 = f1.value;
      const v2 = f2.value;

      // Calculate relative difference
      const avg = (Math.abs(v1) + Math.abs(v2)) / 2;
      if (avg === 0) return v1 !== v2;

      const diff = Math.abs(v1 - v2) / avg;

      // Conflict if difference > 30%
      return diff > 0.3;
    }

    // Assessment comparison
    if (f1.assessment && f2.assessment) {
      const opposites: Record<string, string[]> = {
        exceptional: ["below_average", "poor", "suspicious"],
        above_average: ["below_average", "poor"],
        average: ["exceptional", "suspicious"],
        below_average: ["exceptional", "above_average"],
        poor: ["exceptional", "above_average"],
        suspicious: ["exceptional"],
      };

      return opposites[f1.assessment]?.includes(f2.assessment) ?? false;
    }

    return false;
  }

  /**
   * Calculate conflict severity
   */
  private calculateConflictSeverity(
    f1: ScoredFinding,
    f2: ScoredFinding
  ): DetectedContradiction["severity"] {
    // High confidence on both sides = major conflict
    const avgConfidence = (f1.confidence.score + f2.confidence.score) / 2;

    // Large value difference = more severe
    let valueDiff = 0;
    if (typeof f1.value === "number" && typeof f2.value === "number") {
      const avg = (Math.abs(f1.value) + Math.abs(f2.value)) / 2;
      valueDiff = avg > 0 ? Math.abs(f1.value - f2.value) / avg : 0;
    }

    // Both high confidence + large diff = critical
    if (avgConfidence > 75 && valueDiff > 0.5) return "critical";
    if (avgConfidence > 60 && valueDiff > 0.4) return "major";
    if (avgConfidence > 40 || valueDiff > 0.3) return "moderate";
    return "minor";
  }

  /**
   * Debate Round 1: Initial positions
   */
  private async debateRound1(
    contradiction: DetectedContradiction
  ): Promise<DebateRound> {
    const positions: DebatePosition[] = [];

    for (const claim of contradiction.claims) {
      const prompt = `You are representing the position of the ${claim.agentName} agent in a structured debate.

Topic: ${contradiction.topic}
Your claim: ${claim.claim}
Your confidence: ${claim.confidence}%

The opposing view claims: ${contradiction.claims.find((c) => c.agentName !== claim.agentName)?.claim}

Provide your initial position defending your claim. Include:
1. Your main argument
2. Supporting evidence
3. Why your analysis is more reliable

Respond in JSON:
{
  "position": "your argument",
  "supportingEvidence": ["evidence 1", "evidence 2"],
  "confidenceChange": 0
}`;

      const result = await complete(prompt, {
        complexity: "medium",
        temperature: 0.1, // Low temperature for slight variance in debate arguments
      });

      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        positions.push({
          agentName: claim.agentName,
          position: parsed.position,
          supportingEvidence: parsed.supportingEvidence ?? [],
          confidenceChange: 0,
        });
      }
    }

    return {
      roundNumber: 1,
      positions,
      timestamp: new Date(),
    };
  }

  /**
   * Debate Round 2: Rebuttals
   */
  private async debateRound2(
    contradiction: DetectedContradiction,
    round1: DebateRound
  ): Promise<DebateRound> {
    const positions: DebatePosition[] = [];

    for (const claim of contradiction.claims) {
      const myPosition = round1.positions.find((p) => p.agentName === claim.agentName);
      const opposingPositions = round1.positions.filter(
        (p) => p.agentName !== claim.agentName
      );

      const prompt = `You are continuing the debate as the ${claim.agentName} agent.

Topic: ${contradiction.topic}
Your claim: ${claim.claim}
Your round 1 position: ${myPosition?.position}

Opposing arguments:
${opposingPositions.map((p) => `- ${p.agentName}: ${p.position}`).join("\n")}

Provide your rebuttal. Include:
1. Counter-arguments to opposing views
2. Additional evidence
3. Whether your confidence has changed

Respond in JSON:
{
  "position": "your rebuttal",
  "supportingEvidence": ["new evidence"],
  "counterArguments": ["counter to opponent"],
  "confidenceChange": -10 to +10
}`;

      const result = await complete(prompt, {
        complexity: "medium",
        temperature: 0.1, // Low temperature for slight variance in debate arguments
      });

      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        positions.push({
          agentName: claim.agentName,
          position: parsed.position,
          supportingEvidence: parsed.supportingEvidence ?? [],
          counterArguments: parsed.counterArguments ?? [],
          confidenceChange: parsed.confidenceChange ?? 0,
        });
      }
    }

    return {
      roundNumber: 2,
      positions,
      timestamp: new Date(),
    };
  }

  /**
   * Debate Round 3: Final positions
   */
  private async debateRound3(
    contradiction: DetectedContradiction,
    previousRounds: DebateRound[]
  ): Promise<DebateRound> {
    const positions: DebatePosition[] = [];

    for (const claim of contradiction.claims) {
      const round1Pos = previousRounds[0].positions.find(
        (p) => p.agentName === claim.agentName
      );
      const round2Pos = previousRounds[1].positions.find(
        (p) => p.agentName === claim.agentName
      );

      const prompt = `This is the final round of the debate as the ${claim.agentName} agent.

Topic: ${contradiction.topic}
Your original claim: ${claim.claim}

Debate history:
Round 1 - Your position: ${round1Pos?.position}
Round 2 - Your rebuttal: ${round2Pos?.position}

Consider all arguments. Do you:
1. Maintain your position
2. Concede to the opponent
3. Propose a synthesis

Respond in JSON:
{
  "position": "your final position",
  "supportingEvidence": ["final evidence"],
  "confidenceChange": -20 to +10,
  "finalPosition": "maintain|concede|synthesize"
}`;

      const result = await complete(prompt, {
        complexity: "medium",
        temperature: 0.1, // Low temperature for slight variance in debate arguments
      });

      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        positions.push({
          agentName: claim.agentName,
          position: parsed.position,
          supportingEvidence: parsed.supportingEvidence ?? [],
          confidenceChange: parsed.confidenceChange ?? 0,
          finalPosition: parsed.finalPosition === "concede",
        });
      }
    }

    return {
      roundNumber: 3,
      positions,
      timestamp: new Date(),
    };
  }

  /**
   * Check if debate has reached consensus
   */
  private hasConsensus(round: DebateRound): boolean {
    // Consensus if one side concedes
    const conceding = round.positions.filter((p) => p.finalPosition === true);
    return conceding.length > 0;
  }

  /**
   * Finalize debate with resolution
   */
  private async finalizeDebate(
    contradiction: DetectedContradiction,
    rounds: DebateRound[],
    resolutionType: "consensus" | "arbitration"
  ): Promise<DebateResult> {
    let resolution: ContradictionResolution;

    if (resolutionType === "consensus") {
      // Find the winner (the one who didn't concede)
      const lastRound = rounds[rounds.length - 1];
      const winner = lastRound.positions.find((p) => p.finalPosition !== true);
      const winnerClaim = contradiction.claims.find(
        (c) => c.agentName === winner?.agentName
      );

      resolution = {
        contradictionId: contradiction.id,
        resolvedBy: "consensus",
        winner: winner?.agentName,
        resolution: `${winner?.agentName}'s position accepted: ${winner?.position}`,
        finalValue: winnerClaim?.value,
        confidence: confidenceCalculator.calculate({
          dataAvailability: 80,
          evidenceQuality: 70,
        }),
        debateRounds: rounds,
        resolvedAt: new Date(),
      };
    } else {
      // Arbitration: Use LLM to decide
      resolution = await this.arbitrate(contradiction, rounds);
    }

    contradiction.status = "resolved";
    this.resolutions.set(contradiction.id, resolution);

    // Cache the resolution for similar future debates
    const cacheKey = this.generateCacheKey(contradiction);
    this.resolutionCache.set(cacheKey, resolution);

    return {
      contradiction,
      rounds,
      resolution,
    };
  }

  /**
   * Arbitrate when consensus isn't reached
   */
  private async arbitrate(
    contradiction: DetectedContradiction,
    rounds: DebateRound[]
  ): Promise<ContradictionResolution> {
    const prompt = `As a neutral arbitrator, resolve this debate.

Topic: ${contradiction.topic}

Claims:
${contradiction.claims.map((c) => `- ${c.agentName}: ${c.claim} (confidence: ${c.confidence}%)`).join("\n")}

Debate summary:
${rounds.map((r) => `Round ${r.roundNumber}:\n${r.positions.map((p) => `  ${p.agentName}: ${p.position}`).join("\n")}`).join("\n\n")}

Based on the evidence and arguments, provide your arbitration:

Respond in JSON:
{
  "winner": "agent name or 'synthesis'",
  "resolution": "your ruling",
  "finalValue": "the value to use",
  "confidence": 0-100
}`;

    const result = await complete(prompt, {
      complexity: "complex",
      temperature: 0, // Zero temperature for reproducible arbitration
    });

    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      return {
        contradictionId: contradiction.id,
        resolvedBy: "arbitration",
        winner: parsed.winner,
        resolution: parsed.resolution,
        finalValue: parsed.finalValue,
        confidence: confidenceCalculator.calculate({
          dataAvailability: parsed.confidence ?? 60,
        }),
        debateRounds: rounds,
        resolvedAt: new Date(),
      };
    }

    // Fallback
    return {
      contradictionId: contradiction.id,
      resolvedBy: "arbitration",
      resolution: "Unable to reach resolution, using highest confidence claim",
      finalValue: contradiction.claims.reduce((a, b) =>
        a.confidence > b.confidence ? a : b
      ).value,
      confidence: confidenceCalculator.calculate({ dataAvailability: 40 }),
      debateRounds: rounds,
      resolvedAt: new Date(),
    };
  }
}

// Singleton instance
export const consensusEngine = new ConsensusEngine();
