/**
 * Memory Management for Agent Orchestration
 * Working memory, deal memory, and experiential learning
 */

import type { ScoredFinding, ConfidenceScore } from "@/scoring/types";
import type { AnalysisAgentResult } from "../types";

// ============================================================================
// WORKING MEMORY
// ============================================================================

/**
 * Working memory for a single analysis session
 * Stores transient data during analysis
 */
export class WorkingMemory {
  private data: Map<string, unknown> = new Map();
  private metadata: Map<string, { createdAt: Date; updatedAt: Date; source: string }> =
    new Map();

  /**
   * Store a value
   */
  set(key: string, value: unknown, source: string): void {
    const now = new Date();
    const existing = this.metadata.get(key);

    this.data.set(key, value);
    this.metadata.set(key, {
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      source,
    });
  }

  /**
   * Get a value
   */
  get<T>(key: string): T | undefined {
    return this.data.get(key) as T | undefined;
  }

  /**
   * Check if key exists
   */
  has(key: string): boolean {
    return this.data.has(key);
  }

  /**
   * Delete a value
   */
  delete(key: string): boolean {
    this.metadata.delete(key);
    return this.data.delete(key);
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    return Array.from(this.data.keys());
  }

  /**
   * Get all values with metadata
   */
  entries(): Array<{
    key: string;
    value: unknown;
    metadata: { createdAt: Date; updatedAt: Date; source: string };
  }> {
    return Array.from(this.data.entries()).map(([key, value]) => ({
      key,
      value,
      metadata: this.metadata.get(key)!,
    }));
  }

  /**
   * Get values from a specific source
   */
  getBySource(source: string): Array<{ key: string; value: unknown }> {
    return this.entries()
      .filter((e) => e.metadata.source === source)
      .map(({ key, value }) => ({ key, value }));
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.data.clear();
    this.metadata.clear();
  }

  /**
   * Export to JSON
   */
  export(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of this.data.entries()) {
      result[key] = value;
    }
    return result;
  }

  /**
   * Import from JSON
   */
  import(data: Record<string, unknown>, source: string): void {
    for (const [key, value] of Object.entries(data)) {
      this.set(key, value, source);
    }
  }
}

// ============================================================================
// DEAL MEMORY
// ============================================================================

/**
 * Persistent memory for a specific deal
 * Stores analysis results and findings
 */
export interface DealMemoryData {
  dealId: string;
  analyses: AnalysisMemory[];
  aggregatedFindings: ScoredFinding[];
  keyInsights: KeyInsight[];
  contradictions: Contradiction[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AnalysisMemory {
  analysisId: string;
  type: string;
  timestamp: Date;
  results: Record<string, AnalysisAgentResult>;
  findings: ScoredFinding[];
  overallConfidence: ConfidenceScore;
  duration: number;
}

export interface KeyInsight {
  id: string;
  topic: string;
  insight: string;
  confidence: number;
  sources: string[];
  timestamp: Date;
}

export interface Contradiction {
  id: string;
  topic: string;
  claims: { agent: string; claim: string }[];
  resolution?: string;
  timestamp: Date;
}

export class DealMemory {
  private data: DealMemoryData;

  constructor(dealId: string) {
    this.data = {
      dealId,
      analyses: [],
      aggregatedFindings: [],
      keyInsights: [],
      contradictions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Add an analysis result
   */
  addAnalysis(analysis: AnalysisMemory): void {
    this.data.analyses.push(analysis);
    this.data.updatedAt = new Date();

    // Merge findings
    this.mergeFindings(analysis.findings);
  }

  /**
   * Merge new findings with existing
   */
  private mergeFindings(newFindings: ScoredFinding[]): void {
    for (const finding of newFindings) {
      // Check if we already have this metric
      const existingIndex = this.data.aggregatedFindings.findIndex(
        (f) => f.metric === finding.metric && f.agentName === finding.agentName
      );

      if (existingIndex >= 0) {
        // Keep the one with higher confidence
        const existing = this.data.aggregatedFindings[existingIndex];
        if (finding.confidence.score > existing.confidence.score) {
          this.data.aggregatedFindings[existingIndex] = finding;
        }
      } else {
        this.data.aggregatedFindings.push(finding);
      }
    }
  }

  /**
   * Add a key insight
   */
  addInsight(topic: string, insight: string, confidence: number, sources: string[]): void {
    this.data.keyInsights.push({
      id: crypto.randomUUID(),
      topic,
      insight,
      confidence,
      sources,
      timestamp: new Date(),
    });
    this.data.updatedAt = new Date();
  }

  /**
   * Add a contradiction
   */
  addContradiction(
    topic: string,
    claims: { agent: string; claim: string }[]
  ): string {
    const id = crypto.randomUUID();
    this.data.contradictions.push({
      id,
      topic,
      claims,
      timestamp: new Date(),
    });
    this.data.updatedAt = new Date();
    return id;
  }

  /**
   * Resolve a contradiction
   */
  resolveContradiction(id: string, resolution: string): void {
    const contradiction = this.data.contradictions.find((c) => c.id === id);
    if (contradiction) {
      contradiction.resolution = resolution;
      this.data.updatedAt = new Date();
    }
  }

  /**
   * Get all findings
   */
  getFindings(): ScoredFinding[] {
    return this.data.aggregatedFindings;
  }

  /**
   * Get findings by topic
   */
  getFindingsByTopic(topic: string): ScoredFinding[] {
    return this.data.aggregatedFindings.filter((f) => f.category === topic);
  }

  /**
   * Get latest analysis
   */
  getLatestAnalysis(): AnalysisMemory | undefined {
    return this.data.analyses[this.data.analyses.length - 1];
  }

  /**
   * Get all analyses
   */
  getAnalyses(): AnalysisMemory[] {
    return this.data.analyses;
  }

  /**
   * Get insights
   */
  getInsights(): KeyInsight[] {
    return this.data.keyInsights;
  }

  /**
   * Get unresolved contradictions
   */
  getUnresolvedContradictions(): Contradiction[] {
    return this.data.contradictions.filter((c) => !c.resolution);
  }

  /**
   * Export to JSON
   */
  export(): DealMemoryData {
    return { ...this.data };
  }

  /**
   * Import from JSON
   */
  static import(data: DealMemoryData): DealMemory {
    const memory = new DealMemory(data.dealId);
    memory.data = data;
    return memory;
  }
}

// ============================================================================
// EXPERIENTIAL MEMORY
// ============================================================================

/**
 * Cross-deal learning memory
 * Stores patterns and calibration data
 */
export interface CalibrationData {
  agentName: string;
  metric: string;
  predictedValue: number;
  actualValue?: number;
  deviation?: number;
  timestamp: Date;
}

export interface PatternMatch {
  id: string;
  pattern: string;
  frequency: number;
  confidence: number;
  examples: string[];
}

export class ExperientialMemory {
  private calibrations: CalibrationData[] = [];
  private patterns: Map<string, PatternMatch> = new Map();

  /**
   * Record a calibration point
   */
  recordCalibration(
    agentName: string,
    metric: string,
    predictedValue: number,
    actualValue?: number
  ): void {
    this.calibrations.push({
      agentName,
      metric,
      predictedValue,
      actualValue,
      deviation: actualValue !== undefined ? actualValue - predictedValue : undefined,
      timestamp: new Date(),
    });

    // Keep last 1000 calibrations
    if (this.calibrations.length > 1000) {
      this.calibrations = this.calibrations.slice(-1000);
    }
  }

  /**
   * Get agent calibration stats
   */
  getAgentCalibration(agentName: string): {
    totalPredictions: number;
    calibratedPredictions: number;
    meanDeviation: number;
    stdDeviation: number;
  } {
    const agentCalibrations = this.calibrations.filter(
      (c) => c.agentName === agentName && c.deviation !== undefined
    );

    if (agentCalibrations.length === 0) {
      return {
        totalPredictions: this.calibrations.filter((c) => c.agentName === agentName)
          .length,
        calibratedPredictions: 0,
        meanDeviation: 0,
        stdDeviation: 0,
      };
    }

    const deviations = agentCalibrations.map((c) => c.deviation!);
    const mean = deviations.reduce((a, b) => a + b, 0) / deviations.length;
    const variance =
      deviations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / deviations.length;

    return {
      totalPredictions: this.calibrations.filter((c) => c.agentName === agentName).length,
      calibratedPredictions: agentCalibrations.length,
      meanDeviation: mean,
      stdDeviation: Math.sqrt(variance),
    };
  }

  /**
   * Record a pattern
   */
  recordPattern(patternId: string, pattern: string, example: string): void {
    const existing = this.patterns.get(patternId);

    if (existing) {
      existing.frequency++;
      existing.confidence = Math.min(1, existing.confidence + 0.1);
      if (!existing.examples.includes(example)) {
        existing.examples.push(example);
        if (existing.examples.length > 10) {
          existing.examples = existing.examples.slice(-10);
        }
      }
    } else {
      this.patterns.set(patternId, {
        id: patternId,
        pattern,
        frequency: 1,
        confidence: 0.5,
        examples: [example],
      });
    }
  }

  /**
   * Get high-confidence patterns
   */
  getConfidentPatterns(minConfidence = 0.7): PatternMatch[] {
    return Array.from(this.patterns.values()).filter(
      (p) => p.confidence >= minConfidence
    );
  }

  /**
   * Clear old data
   */
  cleanup(maxAge: number = 90 * 24 * 60 * 60 * 1000): void {
    const cutoff = new Date(Date.now() - maxAge);
    this.calibrations = this.calibrations.filter((c) => c.timestamp > cutoff);
  }

  /**
   * Export to JSON
   */
  export(): {
    calibrations: CalibrationData[];
    patterns: PatternMatch[];
  } {
    return {
      calibrations: this.calibrations,
      patterns: Array.from(this.patterns.values()),
    };
  }
}

// Singleton instances
export const globalExperientialMemory = new ExperientialMemory();
