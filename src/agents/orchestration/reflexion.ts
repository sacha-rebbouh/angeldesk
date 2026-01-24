/**
 * Reflexion Engine
 * Self-critique and iterative improvement of analysis
 */

import { complete } from "@/services/openrouter/router";
import type { ScoredFinding, ConfidenceScore } from "@/scoring/types";
import { confidenceCalculator } from "@/scoring";
import type { AnalysisAgentResult } from "../types";

// ============================================================================
// TYPES
// ============================================================================

export interface ReflexionInput {
  agentName: string;
  result: AnalysisAgentResult;
  findings: ScoredFinding[];
  context: string;
}

export interface ReflexionOutput {
  originalResult: AnalysisAgentResult;
  critiques: Critique[];
  improvements: Improvement[];
  dataRequests: DataRequest[];
  revisedResult?: AnalysisAgentResult;
  confidenceChange: number;
  iterations: number;
}

export interface Critique {
  id: string;
  area: string;
  issue: string;
  severity: "minor" | "moderate" | "significant";
  evidence: string;
  suggestion: string;
}

export interface Improvement {
  id: string;
  critiqueId: string;
  description: string;
  applied: boolean;
  impact: "low" | "medium" | "high";
}

export interface DataRequest {
  id: string;
  requestedFrom: string | string[];
  dataType: string;
  description: string;
  priority: "low" | "normal" | "high";
  fulfilled: boolean;
  response?: unknown;
}

export interface ReflexionConfig {
  maxIterations: number;
  minConfidenceGain: number;
  enableDataRequests: boolean;
  critiqueThreshold: number;
}

const DEFAULT_CONFIG: ReflexionConfig = {
  maxIterations: 2,
  minConfidenceGain: 5,
  enableDataRequests: true,
  critiqueThreshold: 75,
};

// ============================================================================
// REFLEXION ENGINE
// ============================================================================

export class ReflexionEngine {
  private config: ReflexionConfig;

  constructor(config: Partial<ReflexionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run reflexion on an agent result
   */
  async reflect(input: ReflexionInput): Promise<ReflexionOutput> {
    const critiques: Critique[] = [];
    const improvements: Improvement[] = [];
    const dataRequests: DataRequest[] = [];
    const currentResult = input.result;
    let totalConfidenceChange = 0;
    let iteration = 0;

    while (iteration < this.config.maxIterations) {
      iteration++;

      // Step 1: Self-critique
      const newCritiques = await this.generateCritiques(
        input.agentName,
        currentResult,
        input.findings,
        input.context
      );
      critiques.push(...newCritiques);

      // If no significant critiques, stop
      const significantCritiques = newCritiques.filter(
        (c) => c.severity !== "minor"
      );
      if (significantCritiques.length === 0) break;

      // Step 2: Identify data needs
      if (this.config.enableDataRequests) {
        const requests = await this.identifyDataNeeds(
          input.agentName,
          newCritiques,
          input.context
        );
        dataRequests.push(...requests);
      }

      // Step 3: Generate improvements
      const newImprovements = await this.generateImprovements(
        input.agentName,
        currentResult,
        newCritiques,
        dataRequests.filter((r) => r.fulfilled)
      );
      improvements.push(...newImprovements);

      // Step 4: Apply improvements
      const appliedImprovements = newImprovements.filter((i) => i.applied);
      if (appliedImprovements.length === 0) break;

      // Calculate confidence change
      const confidenceGain = appliedImprovements.reduce(
        (sum, i) => sum + (i.impact === "high" ? 10 : i.impact === "medium" ? 5 : 2),
        0
      );
      totalConfidenceChange += confidenceGain;

      // Stop if gain is too small
      if (confidenceGain < this.config.minConfidenceGain) break;
    }

    return {
      originalResult: input.result,
      critiques,
      improvements,
      dataRequests,
      revisedResult: currentResult !== input.result ? currentResult : undefined,
      confidenceChange: totalConfidenceChange,
      iterations: iteration,
    };
  }

  /**
   * Quick check if reflexion is needed
   */
  needsReflexion(result: AnalysisAgentResult, findings: ScoredFinding[]): boolean {
    // Check overall confidence
    const avgConfidence =
      findings.reduce((sum, f) => sum + f.confidence.score, 0) /
      Math.max(1, findings.length);

    return avgConfidence < this.config.critiqueThreshold;
  }

  /**
   * Generate critiques for a result
   */
  private async generateCritiques(
    agentName: string,
    result: AnalysisAgentResult,
    findings: ScoredFinding[],
    context: string
  ): Promise<Critique[]> {
    const prompt = `You are a critical reviewer evaluating the output of the ${agentName} agent.

Context: ${context}

Agent Output:
${JSON.stringify(result.success ? (result as unknown as { data: unknown }).data : { error: result.error }, null, 2)}

Findings produced:
${findings.map((f) => `- ${f.metric}: ${f.value} (confidence: ${f.confidence.score}%)`).join("\n")}

Identify issues with this analysis. Look for:
1. Missing important metrics or considerations
2. Weak evidence or low-confidence conclusions
3. Potential biases or assumptions
4. Inconsistencies within the analysis
5. Areas that need more data

Respond in JSON:
{
  "critiques": [
    {
      "area": "area of concern",
      "issue": "specific issue found",
      "severity": "minor|moderate|significant",
      "evidence": "what led to this critique",
      "suggestion": "how to improve"
    }
  ]
}`;

    const response = await complete(prompt, {
      complexity: "medium",
      temperature: 0.3,
    });

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);

    return (parsed.critiques ?? []).map(
      (c: { area: string; issue: string; severity: string; evidence: string; suggestion: string }) => ({
        id: crypto.randomUUID(),
        area: c.area,
        issue: c.issue,
        severity: c.severity as Critique["severity"],
        evidence: c.evidence,
        suggestion: c.suggestion,
      })
    );
  }

  /**
   * Identify additional data needs
   */
  private async identifyDataNeeds(
    agentName: string,
    critiques: Critique[],
    context: string
  ): Promise<DataRequest[]> {
    if (critiques.length === 0) return [];

    const prompt = `Based on these critiques of the ${agentName} agent's analysis, identify what additional data would help.

Critiques:
${critiques.map((c) => `- ${c.area}: ${c.issue} (${c.severity})`).join("\n")}

Context: ${context}

What data from other agents would help address these critiques?

Respond in JSON:
{
  "dataRequests": [
    {
      "requestedFrom": "agent name or ['agent1', 'agent2']",
      "dataType": "type of data needed",
      "description": "specific information requested",
      "priority": "low|normal|high"
    }
  ]
}`;

    const response = await complete(prompt, {
      complexity: "simple",
      temperature: 0.2,
    });

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);

    return (parsed.dataRequests ?? []).map(
      (r: { requestedFrom: string | string[]; dataType: string; description: string; priority: string }) => ({
        id: crypto.randomUUID(),
        requestedFrom: r.requestedFrom,
        dataType: r.dataType,
        description: r.description,
        priority: r.priority as DataRequest["priority"],
        fulfilled: false,
      })
    );
  }

  /**
   * Generate improvements based on critiques
   */
  private async generateImprovements(
    agentName: string,
    result: AnalysisAgentResult,
    critiques: Critique[],
    fulfilledRequests: DataRequest[]
  ): Promise<Improvement[]> {
    const prompt = `Generate specific improvements for the ${agentName} agent based on critiques.

Critiques to address:
${critiques.map((c) => `- [${c.severity.toUpperCase()}] ${c.area}: ${c.issue}\n  Suggestion: ${c.suggestion}`).join("\n\n")}

${fulfilledRequests.length > 0 ? `\nAdditional data received:\n${fulfilledRequests.map((r) => `- ${r.dataType}: ${JSON.stringify(r.response)}`).join("\n")}` : ""}

For each critique, provide a specific improvement action.

Respond in JSON:
{
  "improvements": [
    {
      "critiqueId": "id of critique being addressed",
      "description": "specific change to make",
      "applied": true/false,
      "impact": "low|medium|high"
    }
  ]
}`;

    const response = await complete(prompt, {
      complexity: "medium",
      temperature: 0.2,
    });

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);

    // Match improvements to critiques
    return (parsed.improvements ?? []).map(
      (i: { description: string; applied: boolean; impact: string }, index: number) => ({
        id: crypto.randomUUID(),
        critiqueId: critiques[index]?.id ?? "",
        description: i.description,
        applied: i.applied ?? false,
        impact: i.impact as Improvement["impact"],
      })
    );
  }
}

// Singleton instance
export const reflexionEngine = new ReflexionEngine();

/**
 * Create a reflexion engine with custom config
 */
export function createReflexionEngine(config: Partial<ReflexionConfig>): ReflexionEngine {
  return new ReflexionEngine(config);
}
