/**
 * ReAct Engine
 * Core implementation of Reasoning-Action-Observation loop
 */

import { z } from "zod";
import { complete } from "@/services/openrouter/router";
import {
  confidenceCalculator,
  createScoredFinding,
  type ConfidenceScore,
  type ScoredFinding,
} from "@/scoring";
import type { AgentContext, EnrichedAgentContext } from "../types";
import { toolRegistry } from "./tools/registry";
import type {
  Action,
  LLMReActResponse,
  LLMSelfCritiqueResponse,
  LLMSynthesisResponse,
  Observation,
  ReActConfig,
  ReActOutput,
  ReActPrompts,
  ReasoningStep,
  ReasoningTrace,
  SelfCritiqueResult,
  SynthesisResult,
  Thought,
  ToolContext,
} from "./types";

// ============================================================================
// JSON SANITIZATION UTILITIES
// ============================================================================

/**
 * Sanitize LLM output to extract valid JSON
 * Handles common LLM mistakes like outputting JavaScript code instead of JSON
 */
function sanitizeJsonString(content: string): string {
  // Extract JSON block from markdown code fence if present
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    content = codeBlockMatch[1];
  }

  // Find the outermost JSON object
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON object found in response");
  }

  let json = jsonMatch[0];

  // Fix common LLM mistakes:
  // 1. Replace JSON.stringify(...) with placeholder string
  json = json.replace(/JSON\.stringify\s*\([^)]*\)/g, '"[serialized data]"');

  // 2. Replace JavaScript template literals with regular strings
  json = json.replace(/`([^`]*)`/g, '"$1"');

  // 3. Remove trailing commas before } or ]
  json = json.replace(/,\s*([}\]])/g, "$1");

  // 4. Replace single quotes with double quotes (but not inside strings)
  // This is tricky, so we only do it for obvious cases like {'key': 'value'}
  json = json.replace(/'([^']+)'\s*:/g, '"$1":');
  json = json.replace(/:\s*'([^']*)'/g, ': "$1"');

  // 5. Handle undefined/null written as literal words without quotes
  json = json.replace(/:\s*undefined\b/g, ": null");

  // 6. Fix number ranges written as "0-100" in value position (not in strings)
  // This commonly happens when LLM writes "confidence": 0-100 literally
  json = json.replace(/:\s*(\d+)-(\d+)([,}\]])/g, ": $1$3");

  // 7. Fix boolean written without quotes
  json = json.replace(/:\s*true\/false/gi, ": true");

  return json;
}

/**
 * Safely parse JSON with sanitization and retry
 */
function safeJsonParse<T>(content: string, context: string): T {
  // First attempt: try direct parsing of extracted JSON
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as T;
    }
  } catch {
    // Fall through to sanitization
  }

  // Second attempt: sanitize and parse
  try {
    const sanitized = sanitizeJsonString(content);
    return JSON.parse(sanitized) as T;
  } catch (error) {
    const preview = content.substring(0, 200).replace(/\n/g, " ");
    throw new Error(
      `Failed to parse JSON in ${context}: ${error instanceof Error ? error.message : "Unknown error"}. Preview: ${preview}...`
    );
  }
}

// Zod schema for LLM response validation
const LLMReActResponseSchema = z.object({
  thought: z.string(),
  thoughtType: z.enum([
    "planning",
    "analysis",
    "hypothesis",
    "evaluation",
    "synthesis",
    "self_critique",
  ]),
  action: z
    .object({
      tool: z.string(),
      parameters: z.record(z.string(), z.unknown()),
      reasoning: z.string(),
    })
    .optional(),
  confidence: z.number().min(0).max(100),
  readyToSynthesize: z.boolean(),
});

const DEFAULT_CONFIG: ReActConfig = {
  maxIterations: 5,
  minIterations: 2,
  confidenceThreshold: 80,
  earlyStopConfidence: 90,
  totalTimeoutMs: 120000,
  toolTimeoutMs: 30000,
  enableZodValidation: true,
  maxValidationRetries: 2,
  enableSelfCritique: true,
  selfCritiqueThreshold: 75,
  temperature: 0.3,
  modelComplexity: "complex",
};

export class ReActEngine<TOutput> {
  private config: ReActConfig;
  private prompts: ReActPrompts;
  private outputSchema: z.ZodType<TOutput>;

  constructor(
    prompts: ReActPrompts,
    outputSchema: z.ZodType<TOutput>,
    config: Partial<ReActConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.prompts = prompts;
    this.outputSchema = outputSchema;
  }

  /**
   * Run the ReAct loop
   */
  async run(
    context: AgentContext | EnrichedAgentContext,
    agentName: string
  ): Promise<ReActOutput<TOutput>> {
    const startTime = Date.now();
    const traceId = crypto.randomUUID();
    const steps: ReasoningStep[] = [];
    const memory = new Map<string, unknown>();

    let totalCost = 0;
    let currentConfidence = 0;
    let iteration = 0;

    const toolContext: ToolContext = {
      dealId: context.dealId,
      agentContext: context,
      previousSteps: steps,
      memory,
    };

    try {
      // Main ReAct loop
      while (iteration < this.config.maxIterations) {
        iteration++;

        // Check timeout
        if (Date.now() - startTime > this.config.totalTimeoutMs) {
          throw new Error(
            `ReAct loop timeout after ${this.config.totalTimeoutMs}ms`
          );
        }

        // Get next thought/action from LLM
        const { response, cost } = await this.getNextStep(
          context,
          steps,
          iteration
        );
        totalCost += cost;

        // Create thought
        const thought: Thought = {
          id: crypto.randomUUID(),
          content: response.thought,
          type: response.thoughtType,
          timestamp: new Date(),
        };

        // Execute action if present
        let action: Action | undefined;
        let observation: Observation | undefined;

        if (response.action && !response.readyToSynthesize) {
          action = {
            id: crypto.randomUUID(),
            toolName: response.action.tool,
            parameters: response.action.parameters,
            reasoning: response.action.reasoning,
            timestamp: new Date(),
          };

          // Execute the tool
          const toolStartTime = Date.now();
          const toolResult = await toolRegistry.execute(
            action.toolName,
            action.parameters,
            toolContext,
            { timeout: this.config.toolTimeoutMs }
          );

          observation = {
            id: crypto.randomUUID(),
            actionId: action.id,
            success: toolResult.success,
            result: toolResult.data,
            error: toolResult.error,
            executionTimeMs: Date.now() - toolStartTime,
            timestamp: new Date(),
          };
        }

        // Record step
        const step: ReasoningStep = {
          stepNumber: iteration,
          thought,
          action,
          observation,
          confidenceAfterStep: response.confidence,
        };
        steps.push(step);

        // Update confidence
        currentConfidence = response.confidence;

        // Check stopping conditions
        if (response.readyToSynthesize && iteration >= this.config.minIterations) {
          break;
        }

        if (
          currentConfidence >= this.config.earlyStopConfidence &&
          iteration >= this.config.minIterations
        ) {
          break;
        }
      }

      // Synthesis phase
      const { synthesis, cost: synthesisCost } = await this.synthesize(
        context,
        steps
      );
      totalCost += synthesisCost;

      // Self-critique if enabled and confidence below threshold
      let selfCritiqueResult: SelfCritiqueResult | undefined;
      if (
        this.config.enableSelfCritique &&
        synthesis.confidence < this.config.selfCritiqueThreshold
      ) {
        const { critique, cost: critiqueCost } = await this.selfCritique(
          synthesis,
          steps
        );
        totalCost += critiqueCost;
        selfCritiqueResult = critique;

        // Adjust confidence based on self-critique
        synthesis.confidence = Math.max(
          0,
          Math.min(100, synthesis.confidence + critique.confidenceAdjustment)
        );
      }

      // Build confidence score
      const confidence = this.buildConfidenceScore(
        synthesis.confidence,
        steps,
        selfCritiqueResult
      );

      // Build reasoning trace
      const reasoningTrace: ReasoningTrace = {
        id: traceId,
        agentName,
        taskDescription: this.prompts.taskDescription,
        steps,
        totalIterations: iteration,
        finalConfidence: confidence.score,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date(),
      };

      return {
        success: true,
        result: synthesis.data,
        findings: synthesis.findings,
        confidence,
        reasoningTrace,
        executionTimeMs: Date.now() - startTime,
        cost: totalCost,
      };
    } catch (error) {
      const reasoningTrace: ReasoningTrace = {
        id: traceId,
        agentName,
        taskDescription: this.prompts.taskDescription,
        steps,
        totalIterations: iteration,
        finalConfidence: 0,
        executionTimeMs: Date.now() - startTime,
        timestamp: new Date(),
      };

      return {
        success: false,
        result: {} as TOutput,
        findings: [],
        confidence: {
          level: "insufficient",
          score: 0,
          factors: [],
        },
        reasoningTrace,
        executionTimeMs: Date.now() - startTime,
        cost: totalCost,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get next step from LLM
   */
  private async getNextStep(
    context: AgentContext | EnrichedAgentContext,
    previousSteps: ReasoningStep[],
    iteration: number
  ): Promise<{ response: LLMReActResponse; cost: number }> {
    const stepsContext = this.formatPreviousSteps(previousSteps);
    const toolDescriptions = toolRegistry.getToolDescriptions();

    const prompt = `You are performing step ${iteration} of a ReAct (Reasoning-Action) analysis.

## Task
${this.prompts.taskDescription}

## Available Tools
${toolDescriptions}

## Previous Steps
${stepsContext || "None yet - this is your first step."}

## Constraints
${this.prompts.constraints.map((c) => `- ${c}`).join("\n")}

## Instructions
1. Think about what you've learned so far and what you still need to know
2. Decide whether to:
   - Take an action using one of the available tools
   - Synthesize your findings (only if you have sufficient information)
3. Estimate your confidence in having enough information to provide a complete analysis

Respond with JSON in this exact format:
{
  "thought": "your reasoning about the current state and next steps",
  "thoughtType": "planning|analysis|hypothesis|evaluation|synthesis",
  "action": {
    "tool": "toolName",
    "parameters": { ... },
    "reasoning": "why this action will help"
  },
  "confidence": 0-100,
  "readyToSynthesize": true/false
}

If readyToSynthesize is true, omit the action field.`;

    const result = await complete(prompt, {
      complexity: this.config.modelComplexity,
      temperature: this.config.temperature,
      systemPrompt: this.prompts.system,
    });

    // Parse and validate response with sanitization
    const parsed = safeJsonParse<LLMReActResponse>(result.content, "getNextStep");

    if (this.config.enableZodValidation) {
      const validated = LLMReActResponseSchema.parse(parsed);
      return { response: validated, cost: result.cost };
    }

    return { response: parsed, cost: result.cost };
  }

  /**
   * Synthesis phase - produce final output
   */
  private async synthesize(
    context: AgentContext | EnrichedAgentContext,
    steps: ReasoningStep[]
  ): Promise<{ synthesis: SynthesisResult<TOutput>; cost: number }> {
    const stepsContext = this.formatPreviousSteps(steps);

    const prompt = `Based on your ReAct analysis, synthesize your findings into a final output.

## Task
${this.prompts.taskDescription}

## Analysis Steps
${stepsContext}

## Required Output Schema
${this.prompts.outputSchema}

## Instructions
Synthesize all your findings into the required output format.
For each finding, provide:
- The metric name
- The extracted/calculated value
- Assessment of the value
- Evidence supporting the finding
- Your confidence in this specific finding (0-100)

Respond with JSON:
{
  "result": { ... output matching the schema ... },
  "findings": [
    {
      "metric": "metric_name",
      "value": "value",
      "unit": "unit",
      "assessment": "assessment text",
      "evidence": ["evidence 1", "evidence 2"],
      "confidence": 80
    }
  ],
  "confidence": 0-100,
  "uncertainties": ["things you're not sure about"]
}`;

    const result = await complete(prompt, {
      complexity: this.config.modelComplexity,
      temperature: 0.2, // Lower temperature for synthesis
      systemPrompt: this.prompts.system,
    });

    // Parse with sanitization to handle LLM formatting issues
    const parsed = safeJsonParse<LLMSynthesisResponse<TOutput>>(result.content, "synthesize");

    // Convert to ScoredFindings
    const scoredFindings: ScoredFinding[] = parsed.findings.map((f) =>
      createScoredFinding({
        agentName: "react-engine",
        metric: f.metric,
        category: "financial", // Will be set correctly by calling agent
        value: f.value as string | number | null,
        unit: f.unit,
        assessment: f.assessment,
        confidence: confidenceCalculator.calculate({
          dataAvailability: f.confidence,
          evidenceQuality: Math.min(100, f.evidence.length * 30),
        }),
        evidence: f.evidence.map((e) => ({
          type: "quote" as const,
          content: e,
          source: "analysis",
          confidence: f.confidence / 100,
        })),
      })
    );

    return {
      synthesis: {
        data: parsed.result,
        findings: scoredFindings,
        confidence: parsed.confidence,
        supportingEvidence: parsed.findings.flatMap((f) => f.evidence),
        uncertainties: parsed.uncertainties,
      },
      cost: result.cost,
    };
  }

  /**
   * Self-critique phase
   */
  private async selfCritique(
    synthesis: SynthesisResult<TOutput>,
    steps: ReasoningStep[]
  ): Promise<{ critique: SelfCritiqueResult; cost: number }> {
    const prompt = `Critically evaluate the following analysis output.

## Original Task
${this.prompts.taskDescription}

## Analysis Output
${JSON.stringify(synthesis.data, null, 2)}

## Findings
${synthesis.findings.map((f) => `- ${f.metric}: ${f.value} (${f.assessment})`).join("\n")}

## Uncertainties Noted
${synthesis.uncertainties.join("\n") || "None noted"}

## Instructions
Act as a skeptical reviewer. Identify:
1. Potential weaknesses or gaps in the analysis
2. Assumptions that may not hold
3. Missing evidence or verification
4. Areas where confidence may be inflated

Respond with JSON:
{
  "critiques": [
    {
      "area": "area of concern",
      "issue": "specific issue",
      "severity": "minor|moderate|significant",
      "suggestion": "how to improve"
    }
  ],
  "overallAssessment": "acceptable|needs_improvement|requires_revision",
  "suggestedImprovements": ["improvement 1", "improvement 2"],
  "confidenceAdjustment": -10 to +10
}`;

    const result = await complete(prompt, {
      complexity: "medium",
      temperature: 0.3,
      systemPrompt:
        "You are a critical reviewer. Be thorough but fair. Identify real issues, not hypothetical ones.",
    });

    // Try to parse with sanitization, fall back to neutral critique if it fails
    let parsed: LLMSelfCritiqueResponse;
    try {
      parsed = safeJsonParse<LLMSelfCritiqueResponse>(result.content, "selfCritique");
    } catch {
      // If parsing fails, return neutral critique
      return {
        critique: {
          critiques: [],
          overallAssessment: "acceptable",
          suggestedImprovements: [],
          confidenceAdjustment: 0,
        },
        cost: result.cost,
      };
    }

    return {
      critique: {
        critiques: parsed.critiques.map((c) => ({
          area: c.area,
          issue: c.issue,
          severity: c.severity,
          suggestion: c.suggestion,
        })),
        overallAssessment: parsed.overallAssessment,
        suggestedImprovements: parsed.suggestedImprovements,
        confidenceAdjustment: Math.max(-10, Math.min(10, parsed.confidenceAdjustment)),
      },
      cost: result.cost,
    };
  }

  /**
   * Build confidence score from analysis results
   */
  private buildConfidenceScore(
    baseConfidence: number,
    steps: ReasoningStep[],
    selfCritique?: SelfCritiqueResult
  ): ConfidenceScore {
    // Count successful tool executions
    const totalActions = steps.filter((s) => s.action).length;
    const successfulActions = steps.filter(
      (s) => s.observation?.success
    ).length;
    const actionSuccessRate =
      totalActions > 0 ? (successfulActions / totalActions) * 100 : 50;

    // Calculate data availability from steps
    const dataAvailability = Math.min(100, steps.length * 20 + actionSuccessRate * 0.5);

    // Evidence quality from successful observations
    const evidenceQuality = actionSuccessRate;

    // Apply self-critique adjustment
    const adjustedConfidence = selfCritique
      ? baseConfidence + selfCritique.confidenceAdjustment
      : baseConfidence;

    return confidenceCalculator.calculate({
      dataAvailability,
      evidenceQuality,
      benchmarkMatch: 70, // Default, will be overridden by specific findings
      sourceReliability: totalActions > 0 ? 80 : 50,
      temporalRelevance: 90, // Fresh analysis
    });
  }

  /**
   * Format previous steps for context
   */
  private formatPreviousSteps(steps: ReasoningStep[]): string {
    if (steps.length === 0) return "";

    return steps
      .map((step) => {
        let text = `### Step ${step.stepNumber}
**Thought** (${step.thought.type}): ${step.thought.content}
**Confidence**: ${step.confidenceAfterStep}%`;

        if (step.action) {
          text += `\n**Action**: ${step.action.toolName}(${JSON.stringify(step.action.parameters)})
**Reasoning**: ${step.action.reasoning}`;
        }

        if (step.observation) {
          if (step.observation.success) {
            text += `\n**Observation**: ${JSON.stringify(step.observation.result).substring(0, 500)}`;
          } else {
            text += `\n**Observation**: ERROR - ${step.observation.error}`;
          }
        }

        return text;
      })
      .join("\n\n");
  }
}

/**
 * Create a ReAct engine instance
 */
export function createReActEngine<T>(
  prompts: ReActPrompts,
  outputSchema: z.ZodType<T>,
  config?: Partial<ReActConfig>
): ReActEngine<T> {
  return new ReActEngine(prompts, outputSchema, config);
}
