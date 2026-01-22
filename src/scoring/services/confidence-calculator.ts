/**
 * Confidence Calculator
 * Multi-factor confidence scoring for findings
 */

import type {
  ConfidenceContext,
  ConfidenceFactor,
  ConfidenceFactorWeights,
  ConfidenceLevel,
  ConfidenceScore,
  IConfidenceCalculator,
  ScoredFinding,
} from "../types";

// Default weights for confidence factors
const DEFAULT_WEIGHTS: ConfidenceFactorWeights = {
  dataAvailability: 0.30,
  evidenceQuality: 0.25,
  benchmarkMatch: 0.20,
  sourceReliability: 0.15,
  temporalRelevance: 0.10,
};

// Thresholds for confidence levels
const CONFIDENCE_THRESHOLDS = {
  high: 75,
  medium: 50,
  low: 25,
  insufficient: 0,
};

class ConfidenceCalculator implements IConfidenceCalculator {
  private weights: ConfidenceFactorWeights;

  constructor(weights: Partial<ConfidenceFactorWeights> = {}) {
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
  }

  /**
   * Calculate confidence score from factor weights
   */
  calculate(factors: Partial<ConfidenceFactorWeights>): ConfidenceScore {
    const factorList: ConfidenceFactor[] = [];
    let totalWeight = 0;
    let weightedSum = 0;

    // Data Availability
    if (factors.dataAvailability !== undefined) {
      const score = this.normalizeScore(factors.dataAvailability);
      const weight = this.weights.dataAvailability;
      factorList.push({
        name: "Data Availability",
        weight,
        score,
        reason: this.getDataAvailabilityReason(score),
      });
      totalWeight += weight;
      weightedSum += score * weight;
    }

    // Evidence Quality
    if (factors.evidenceQuality !== undefined) {
      const score = this.normalizeScore(factors.evidenceQuality);
      const weight = this.weights.evidenceQuality;
      factorList.push({
        name: "Evidence Quality",
        weight,
        score,
        reason: this.getEvidenceQualityReason(score),
      });
      totalWeight += weight;
      weightedSum += score * weight;
    }

    // Benchmark Match
    if (factors.benchmarkMatch !== undefined) {
      const score = this.normalizeScore(factors.benchmarkMatch);
      const weight = this.weights.benchmarkMatch;
      factorList.push({
        name: "Benchmark Match",
        weight,
        score,
        reason: this.getBenchmarkMatchReason(score),
      });
      totalWeight += weight;
      weightedSum += score * weight;
    }

    // Source Reliability
    if (factors.sourceReliability !== undefined) {
      const score = this.normalizeScore(factors.sourceReliability);
      const weight = this.weights.sourceReliability;
      factorList.push({
        name: "Source Reliability",
        weight,
        score,
        reason: this.getSourceReliabilityReason(score),
      });
      totalWeight += weight;
      weightedSum += score * weight;
    }

    // Temporal Relevance
    if (factors.temporalRelevance !== undefined) {
      const score = this.normalizeScore(factors.temporalRelevance);
      const weight = this.weights.temporalRelevance;
      factorList.push({
        name: "Temporal Relevance",
        weight,
        score,
        reason: this.getTemporalRelevanceReason(score),
      });
      totalWeight += weight;
      weightedSum += score * weight;
    }

    // Calculate final score
    const finalScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const normalizedFinalScore = Math.round(finalScore);

    return {
      level: this.scoreToLevel(normalizedFinalScore),
      score: normalizedFinalScore,
      factors: factorList,
    };
  }

  /**
   * Calculate confidence for a specific finding
   */
  calculateForFinding(
    finding: Partial<ScoredFinding>,
    context: ConfidenceContext
  ): ConfidenceScore {
    const factors: Partial<ConfidenceFactorWeights> = {};

    // Data Availability - based on whether we have a value
    if (finding.value !== undefined && finding.value !== null) {
      factors.dataAvailability = 100;
    } else {
      factors.dataAvailability = 0;
    }

    // Evidence Quality - based on evidence array
    if (finding.evidence && finding.evidence.length > 0) {
      const avgEvidenceConfidence =
        finding.evidence.reduce((sum, e) => sum + e.confidence, 0) /
        finding.evidence.length;
      factors.evidenceQuality = avgEvidenceConfidence * 100;
    } else {
      factors.evidenceQuality = context.hasDirectEvidence ? 50 : 20;
    }

    // Benchmark Match
    if (context.hasBenchmarkMatch) {
      factors.benchmarkMatch = finding.benchmarkData ? 100 : 70;
    } else {
      factors.benchmarkMatch = 30; // Penalty for no benchmark
    }

    // Source Reliability - based on source count
    if (context.sourceCount >= 3) {
      factors.sourceReliability = 100;
    } else if (context.sourceCount === 2) {
      factors.sourceReliability = 70;
    } else if (context.sourceCount === 1) {
      factors.sourceReliability = 50;
    } else {
      factors.sourceReliability = 20;
    }

    // Temporal Relevance - based on data age
    if (context.dataAge !== undefined) {
      if (context.dataAge <= 30) {
        factors.temporalRelevance = 100;
      } else if (context.dataAge <= 90) {
        factors.temporalRelevance = 80;
      } else if (context.dataAge <= 180) {
        factors.temporalRelevance = 60;
      } else if (context.dataAge <= 365) {
        factors.temporalRelevance = 40;
      } else {
        factors.temporalRelevance = 20;
      }
    } else {
      factors.temporalRelevance = 50; // Unknown age
    }

    // Boost for verified data
    if (context.isVerified) {
      Object.keys(factors).forEach((key) => {
        const k = key as keyof ConfidenceFactorWeights;
        if (factors[k] !== undefined) {
          factors[k] = Math.min(100, (factors[k] ?? 0) * 1.1);
        }
      });
    }

    return this.calculate(factors);
  }

  /**
   * Combine multiple confidence scores (e.g., for aggregation)
   */
  combineConfidences(confidences: ConfidenceScore[]): ConfidenceScore {
    if (confidences.length === 0) {
      return {
        level: "insufficient",
        score: 0,
        factors: [],
      };
    }

    if (confidences.length === 1) {
      return confidences[0];
    }

    // Weight by individual scores (higher confidence = more weight)
    let weightedSum = 0;
    let totalWeight = 0;

    for (const conf of confidences) {
      const weight = conf.score / 100; // Use score as weight
      weightedSum += conf.score * weight;
      totalWeight += weight;
    }

    const combinedScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const roundedScore = Math.round(combinedScore);

    // Combine factors (aggregate same-named factors)
    const factorMap = new Map<string, ConfidenceFactor[]>();
    for (const conf of confidences) {
      for (const factor of conf.factors) {
        const existing = factorMap.get(factor.name) ?? [];
        existing.push(factor);
        factorMap.set(factor.name, existing);
      }
    }

    const combinedFactors: ConfidenceFactor[] = [];
    for (const [name, factors] of factorMap.entries()) {
      const avgScore =
        factors.reduce((sum, f) => sum + f.score, 0) / factors.length;
      const avgWeight =
        factors.reduce((sum, f) => sum + f.weight, 0) / factors.length;

      combinedFactors.push({
        name,
        weight: avgWeight,
        score: Math.round(avgScore),
        reason: `Aggregated from ${factors.length} sources`,
      });
    }

    return {
      level: this.scoreToLevel(roundedScore),
      score: roundedScore,
      factors: combinedFactors,
    };
  }

  /**
   * Convert numeric score to confidence level
   */
  private scoreToLevel(score: number): ConfidenceLevel {
    if (score >= CONFIDENCE_THRESHOLDS.high) return "high";
    if (score >= CONFIDENCE_THRESHOLDS.medium) return "medium";
    if (score >= CONFIDENCE_THRESHOLDS.low) return "low";
    return "insufficient";
  }

  /**
   * Normalize score to 0-100 range
   */
  private normalizeScore(score: number): number {
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get human-readable reason for data availability score
   */
  private getDataAvailabilityReason(score: number): string {
    if (score >= 80) return "All required data points available";
    if (score >= 60) return "Most data points available, some gaps";
    if (score >= 40) return "Partial data available";
    if (score >= 20) return "Limited data available";
    return "Insufficient data";
  }

  /**
   * Get human-readable reason for evidence quality score
   */
  private getEvidenceQualityReason(score: number): string {
    if (score >= 80) return "Strong, verified evidence from multiple sources";
    if (score >= 60) return "Good evidence with some verification";
    if (score >= 40) return "Moderate evidence quality";
    if (score >= 20) return "Weak or unverified evidence";
    return "No reliable evidence";
  }

  /**
   * Get human-readable reason for benchmark match score
   */
  private getBenchmarkMatchReason(score: number): string {
    if (score >= 80) return "Exact sector/stage benchmark match";
    if (score >= 60) return "Close benchmark match with minor extrapolation";
    if (score >= 40) return "Approximate benchmark from related sector";
    if (score >= 20) return "Generic benchmark used";
    return "No applicable benchmark";
  }

  /**
   * Get human-readable reason for source reliability score
   */
  private getSourceReliabilityReason(score: number): string {
    if (score >= 80) return "Multiple independent, reliable sources";
    if (score >= 60) return "Two reliable sources";
    if (score >= 40) return "Single verified source";
    if (score >= 20) return "Unverified source";
    return "No credible source";
  }

  /**
   * Get human-readable reason for temporal relevance score
   */
  private getTemporalRelevanceReason(score: number): string {
    if (score >= 80) return "Data is current (< 90 days old)";
    if (score >= 60) return "Data is recent (< 6 months old)";
    if (score >= 40) return "Data is somewhat dated (< 1 year old)";
    if (score >= 20) return "Data is outdated (> 1 year old)";
    return "Data age unknown or very old";
  }
}

// Singleton instance with default weights
export const confidenceCalculator = new ConfidenceCalculator();

// Factory for custom weights
export function createConfidenceCalculator(
  weights: Partial<ConfidenceFactorWeights>
): ConfidenceCalculator {
  return new ConfidenceCalculator(weights);
}
