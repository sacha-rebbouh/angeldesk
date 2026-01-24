/**
 * ReAct Engine
 * Core implementation of Reasoning-Action-Observation loop
 *
 * Features:
 * - Memory system for storing insights between steps
 * - Backtracking when tools fail (explore alternatives)
 * - Initial planning phase (goal decomposition)
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

// ============================================================================
// MEMORY SYSTEM
// ============================================================================

interface MemoryInsight {
  key: string;
  value: unknown;
  source: string; // Which step generated this insight
  confidence: number;
  timestamp: Date;
}

interface FailedAttempt {
  toolName: string;
  parameters: Record<string, unknown>;
  error: string;
  stepNumber: number;
}

interface AlternativeAction {
  toolName: string;
  parameters: Record<string, unknown>;
  reasoning: string;
  priority: number;
}

/**
 * Memory Manager - Stores insights, tracks failures for backtracking
 */
class MemoryManager {
  private insights = new Map<string, MemoryInsight>();
  private failedAttempts: FailedAttempt[] = [];
  private alternativeQueue: AlternativeAction[] = [];

  /**
   * Store an insight from a step
   */
  storeInsight(key: string, value: unknown, source: string, confidence: number): void {
    this.insights.set(key, {
      key,
      value,
      source,
      confidence,
      timestamp: new Date(),
    });
  }

  /**
   * Get insight by key
   */
  getInsight(key: string): MemoryInsight | undefined {
    return this.insights.get(key);
  }

  /**
   * Get all insights with confidence above threshold
   */
  getHighConfidenceInsights(minConfidence: number = 70): MemoryInsight[] {
    return Array.from(this.insights.values())
      .filter(i => i.confidence >= minConfidence)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Format insights for context injection
   */
  formatInsightsForPrompt(): string {
    const highConf = this.getHighConfidenceInsights(60);
    if (highConf.length === 0) return "";

    return `\n## Key Insights Discovered
${highConf.map(i => `- **${i.key}**: ${typeof i.value === 'object' ? JSON.stringify(i.value) : i.value} (confidence: ${i.confidence}%, source: step ${i.source})`).join("\n")}`;
  }

  /**
   * Record a failed tool attempt for backtracking
   */
  recordFailure(toolName: string, parameters: Record<string, unknown>, error: string, stepNumber: number): void {
    this.failedAttempts.push({ toolName, parameters, error, stepNumber });
  }

  /**
   * Check if we already tried this action
   */
  hasAlreadyFailed(toolName: string, parameters: Record<string, unknown>): boolean {
    return this.failedAttempts.some(
      f => f.toolName === toolName &&
           JSON.stringify(f.parameters) === JSON.stringify(parameters)
    );
  }

  /**
   * Get failed attempts for context
   */
  getFailedAttempts(): FailedAttempt[] {
    return [...this.failedAttempts];
  }

  /**
   * Queue alternative actions for backtracking
   */
  queueAlternatives(alternatives: AlternativeAction[]): void {
    this.alternativeQueue.push(...alternatives);
    // Sort by priority (higher first)
    this.alternativeQueue.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get next alternative action to try
   */
  popAlternative(): AlternativeAction | undefined {
    return this.alternativeQueue.shift();
  }

  /**
   * Check if we have alternatives to try
   */
  hasAlternatives(): boolean {
    return this.alternativeQueue.length > 0;
  }

  /**
   * Get summary for debugging
   */
  getSummary(): { insightCount: number; failureCount: number; alternativesCount: number } {
    return {
      insightCount: this.insights.size,
      failureCount: this.failedAttempts.length,
      alternativesCount: this.alternativeQueue.length,
    };
  }
}

// ============================================================================
// GOAL DECOMPOSITION
// ============================================================================

interface Goal {
  id: string;
  description: string;
  subgoals: string[];
  status: "pending" | "in_progress" | "completed" | "blocked";
  requiredTools: string[];
}

interface InitialPlan {
  mainGoal: string;
  goals: Goal[];
  estimatedSteps: number;
  criticalPaths: string[];
}

// ============================================================================
// ENGINE CONFIGURATION
// ============================================================================

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
   * Run the ReAct loop with planning, memory, and backtracking
   */
  async run(
    context: AgentContext | EnrichedAgentContext,
    agentName: string
  ): Promise<ReActOutput<TOutput>> {
    const startTime = Date.now();
    const traceId = crypto.randomUUID();
    const steps: ReasoningStep[] = [];
    const memory = new MemoryManager();

    let totalCost = 0;
    let currentConfidence = 0;
    let iteration = 0;

    const toolContext: ToolContext = {
      dealId: context.dealId,
      agentContext: context,
      previousSteps: steps,
      memory: new Map(), // Legacy interface - we use MemoryManager internally
    };

    try {
      // =====================================================================
      // PHASE 1: INITIAL PLANNING (Goal Decomposition)
      // =====================================================================
      const { plan, cost: planCost } = await this.createInitialPlan(context);
      totalCost += planCost;

      // Store plan in memory for reference
      memory.storeInsight("initial_plan", plan, "planning", 100);

      // Create planning thought
      const planningThought: Thought = {
        id: crypto.randomUUID(),
        content: `Plan: ${plan.mainGoal}\nSubgoals: ${plan.goals.map(g => g.description).join(", ")}\nEstimated steps: ${plan.estimatedSteps}`,
        type: "planning",
        timestamp: new Date(),
      };

      steps.push({
        stepNumber: 0,
        thought: planningThought,
        confidenceAfterStep: 20, // Low confidence at start
      });

      // =====================================================================
      // PHASE 2: MAIN REACT LOOP WITH MEMORY & BACKTRACKING
      // =====================================================================
      while (iteration < this.config.maxIterations) {
        iteration++;

        // Check timeout
        if (Date.now() - startTime > this.config.totalTimeoutMs) {
          throw new Error(
            `ReAct loop timeout after ${this.config.totalTimeoutMs}ms`
          );
        }

        // Get next thought/action from LLM (with memory context)
        const { response, cost } = await this.getNextStep(
          context,
          steps,
          iteration,
          memory,
          plan
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
          // Check if we already failed this action
          if (memory.hasAlreadyFailed(response.action.tool, response.action.parameters)) {
            // Skip this action, LLM suggested something we already tried
            observation = {
              id: crypto.randomUUID(),
              actionId: "skipped",
              success: false,
              result: null,
              error: "Action already failed previously, skipping",
              executionTimeMs: 0,
              timestamp: new Date(),
            };
          } else {
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

            // ===============================================================
            // BACKTRACKING: Handle tool failure
            // ===============================================================
            if (!toolResult.success) {
              memory.recordFailure(
                action.toolName,
                action.parameters,
                toolResult.error ?? "Unknown error",
                iteration
              );

              // Request alternatives from LLM
              const { alternatives, cost: altCost } = await this.requestAlternatives(
                context,
                action,
                toolResult.error ?? "Unknown error",
                memory
              );
              totalCost += altCost;

              if (alternatives.length > 0) {
                memory.queueAlternatives(alternatives);
              }
            } else {
              // SUCCESS: Extract and store insights from result
              const insights = this.extractInsights(action.toolName, toolResult.data);
              for (const insight of insights) {
                memory.storeInsight(insight.key, insight.value, `step-${iteration}`, insight.confidence);
              }
            }
          }
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

        // If we have alternatives and last action failed, try one
        if (observation && !observation.success && memory.hasAlternatives()) {
          const alternative = memory.popAlternative();
          if (alternative) {
            // Queue this as the next action by modifying response
            // This will be picked up in the next iteration naturally
            // because the LLM will see the failure and alternatives in context
          }
        }
      }

      // =====================================================================
      // PHASE 3: SYNTHESIS WITH MEMORY
      // =====================================================================
      let { synthesis, cost: synthesisCost } = await this.synthesize(
        context,
        steps,
        memory
      );
      totalCost += synthesisCost;

      // Self-critique if enabled and confidence below threshold
      let selfCritiqueResult: SelfCritiqueResult | undefined;
      let critiqueIterations = 0;
      const maxCritiqueIterations = 2;

      while (
        this.config.enableSelfCritique &&
        synthesis.confidence < this.config.selfCritiqueThreshold &&
        critiqueIterations < maxCritiqueIterations
      ) {
        critiqueIterations++;

        const { critique, cost: critiqueCost } = await this.selfCritique(
          synthesis,
          steps,
          memory
        );
        totalCost += critiqueCost;
        selfCritiqueResult = critique;

        if (critique.overallAssessment === "requires_revision" && iteration < this.config.maxIterations) {
          const improvementPrompt = critique.suggestedImprovements.join(", ");

          const { response: improvementResponse, cost: improvementCost } = await this.getImprovementStep(
            context,
            steps,
            improvementPrompt,
            memory
          );
          totalCost += improvementCost;

          const improvementThought: Thought = {
            id: crypto.randomUUID(),
            content: `Self-critique revision: ${improvementResponse.thought}`,
            type: "self_critique",
            timestamp: new Date(),
          };

          let improvementAction: Action | undefined;
          let improvementObservation: Observation | undefined;

          if (improvementResponse.action) {
            improvementAction = {
              id: crypto.randomUUID(),
              toolName: improvementResponse.action.tool,
              parameters: improvementResponse.action.parameters,
              reasoning: improvementResponse.action.reasoning,
              timestamp: new Date(),
            };

            const toolStartTime = Date.now();
            const toolResult = await toolRegistry.execute(
              improvementAction.toolName,
              improvementAction.parameters,
              toolContext,
              { timeout: this.config.toolTimeoutMs }
            );

            improvementObservation = {
              id: crypto.randomUUID(),
              actionId: improvementAction.id,
              success: toolResult.success,
              result: toolResult.data,
              error: toolResult.error,
              executionTimeMs: Date.now() - toolStartTime,
              timestamp: new Date(),
            };

            // Store insights from improvement action
            if (toolResult.success) {
              const insights = this.extractInsights(improvementAction.toolName, toolResult.data);
              for (const insight of insights) {
                memory.storeInsight(insight.key, insight.value, `improvement-${critiqueIterations}`, insight.confidence);
              }
            }
          }

          iteration++;
          const improvementStep: ReasoningStep = {
            stepNumber: iteration,
            thought: improvementThought,
            action: improvementAction,
            observation: improvementObservation,
            confidenceAfterStep: improvementResponse.confidence,
          };
          steps.push(improvementStep);

          const { synthesis: newSynthesis, cost: newSynthesisCost } = await this.synthesize(
            context,
            steps,
            memory
          );
          totalCost += newSynthesisCost;
          synthesis = newSynthesis;
        } else {
          synthesis.confidence = Math.max(
            0,
            Math.min(100, synthesis.confidence + critique.confidenceAdjustment)
          );
          break;
        }
      }

      // Build confidence score
      const confidence = this.buildConfidenceScore(
        synthesis.confidence,
        steps,
        selfCritiqueResult,
        memory
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

  // ===========================================================================
  // INITIAL PLANNING (Goal Decomposition)
  // ===========================================================================

  /**
   * Create initial plan with goal decomposition
   */
  private async createInitialPlan(
    context: AgentContext | EnrichedAgentContext
  ): Promise<{ plan: InitialPlan; cost: number }> {
    const toolDescriptions = toolRegistry.getToolDescriptions();

    const prompt = `You are starting a ReAct analysis. Before taking any actions, create a structured plan.

## Task
${this.prompts.taskDescription}

## Available Tools
${toolDescriptions}

## Instructions
Decompose the main task into concrete goals and subgoals. For each goal, identify which tools might be needed.

Respond with JSON:
{
  "mainGoal": "the overarching objective",
  "goals": [
    {
      "id": "G1",
      "description": "specific goal",
      "subgoals": ["subgoal 1", "subgoal 2"],
      "status": "pending",
      "requiredTools": ["tool1", "tool2"]
    }
  ],
  "estimatedSteps": 3,
  "criticalPaths": ["what must be done first", "dependencies"]
}`;

    const result = await complete(prompt, {
      complexity: "medium", // Use medium model for planning
      temperature: 0.2,
      systemPrompt: this.prompts.system,
    });

    const parsed = safeJsonParse<InitialPlan>(result.content, "createInitialPlan");

    return { plan: parsed, cost: result.cost };
  }

  // ===========================================================================
  // BACKTRACKING: Request Alternatives
  // ===========================================================================

  /**
   * Request alternative actions when a tool fails
   */
  private async requestAlternatives(
    context: AgentContext | EnrichedAgentContext,
    failedAction: Action,
    error: string,
    memory: MemoryManager
  ): Promise<{ alternatives: AlternativeAction[]; cost: number }> {
    const toolDescriptions = toolRegistry.getToolDescriptions();
    const failedAttempts = memory.getFailedAttempts();

    const prompt = `A tool action failed. Suggest alternative approaches.

## Failed Action
- Tool: ${failedAction.toolName}
- Parameters: ${JSON.stringify(failedAction.parameters)}
- Error: ${error}
- Reasoning: ${failedAction.reasoning}

## Previous Failed Attempts
${failedAttempts.map(f => `- ${f.toolName}(${JSON.stringify(f.parameters)}): ${f.error}`).join("\n") || "None"}

## Available Tools
${toolDescriptions}

## Instructions
Suggest 2-3 alternative actions that could achieve the same goal differently.
Each alternative should have different parameters or use a different tool.

Respond with JSON:
{
  "alternatives": [
    {
      "toolName": "alternative_tool",
      "parameters": { ... },
      "reasoning": "why this alternative might work",
      "priority": 1-10
    }
  ]
}`;

    const result = await complete(prompt, {
      complexity: "simple", // Use simple model for alternatives
      temperature: 0.5,
      systemPrompt: "You are a problem-solver. When one approach fails, suggest creative alternatives.",
    });

    try {
      const parsed = safeJsonParse<{ alternatives: AlternativeAction[] }>(result.content, "requestAlternatives");
      return { alternatives: parsed.alternatives || [], cost: result.cost };
    } catch {
      return { alternatives: [], cost: result.cost };
    }
  }

  // ===========================================================================
  // INSIGHT EXTRACTION
  // ===========================================================================

  /**
   * Extract insights from tool results
   */
  private extractInsights(
    toolName: string,
    result: unknown
  ): Array<{ key: string; value: unknown; confidence: number }> {
    const insights: Array<{ key: string; value: unknown; confidence: number }> = [];

    if (!result || typeof result !== 'object') {
      return insights;
    }

    const data = result as Record<string, unknown>;

    // Extract key metrics based on tool type
    switch (toolName) {
      case 'get_deal_info':
        if (data.arr) insights.push({ key: 'ARR', value: data.arr, confidence: 90 });
        if (data.growthRate) insights.push({ key: 'growth_rate', value: data.growthRate, confidence: 90 });
        if (data.valuation) insights.push({ key: 'valuation', value: data.valuation, confidence: 90 });
        break;

      case 'calculate_metrics':
        for (const [key, value] of Object.entries(data)) {
          insights.push({ key: `metric_${key}`, value, confidence: 85 });
        }
        break;

      case 'search_similar_deals':
        if (Array.isArray(data.deals)) {
          insights.push({ key: 'similar_deals_count', value: data.deals.length, confidence: 80 });
          insights.push({ key: 'similar_deals', value: data.deals.slice(0, 3), confidence: 80 });
        }
        break;

      case 'get_benchmark':
        for (const [key, value] of Object.entries(data)) {
          insights.push({ key: `benchmark_${key}`, value, confidence: 75 });
        }
        break;

      default:
        // Generic extraction for unknown tools
        for (const [key, value] of Object.entries(data)) {
          if (value !== null && value !== undefined) {
            insights.push({ key: `${toolName}_${key}`, value, confidence: 70 });
          }
        }
    }

    return insights;
  }

  /**
   * Get next step from LLM (with memory and plan context)
   */
  private async getNextStep(
    context: AgentContext | EnrichedAgentContext,
    previousSteps: ReasoningStep[],
    iteration: number,
    memory: MemoryManager,
    plan: InitialPlan
  ): Promise<{ response: LLMReActResponse; cost: number }> {
    const stepsContext = this.formatPreviousSteps(previousSteps);
    const toolDescriptions = toolRegistry.getToolDescriptions();
    const memoryContext = memory.formatInsightsForPrompt();
    const failedAttempts = memory.getFailedAttempts();

    const prompt = `You are performing step ${iteration} of a ReAct (Reasoning-Action) analysis.

## Task
${this.prompts.taskDescription}

## Initial Plan
Main Goal: ${plan.mainGoal}
Goals: ${plan.goals.map(g => `${g.id}: ${g.description} (${g.status})`).join(", ")}
Critical Paths: ${plan.criticalPaths.join(", ")}

## Available Tools
${toolDescriptions}

## Previous Steps
${stepsContext || "None yet - this is your first step."}
${memoryContext}

${failedAttempts.length > 0 ? `## Failed Attempts (DO NOT REPEAT)
${failedAttempts.map(f => `- ${f.toolName}(${JSON.stringify(f.parameters)}): ${f.error}`).join("\n")}` : ""}

## Constraints
${this.prompts.constraints.map((c) => `- ${c}`).join("\n")}

## Instructions
1. Review the plan and what you've learned so far (insights above)
2. Think about what you still need to know
3. Decide whether to:
   - Take an action using one of the available tools
   - Synthesize your findings (only if you have sufficient information)
4. DO NOT repeat failed actions with the same parameters

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
   * Synthesis phase - produce final output (with memory context)
   */
  private async synthesize(
    context: AgentContext | EnrichedAgentContext,
    steps: ReasoningStep[],
    memory: MemoryManager
  ): Promise<{ synthesis: SynthesisResult<TOutput>; cost: number }> {
    const stepsContext = this.formatPreviousSteps(steps);
    const memoryContext = memory.formatInsightsForPrompt();

    const prompt = `Based on your ReAct analysis, synthesize your findings into a final output.

## Task
${this.prompts.taskDescription}

## Analysis Steps
${stepsContext}
${memoryContext}

## Required Output Schema
${this.prompts.outputSchema}

## Instructions
Synthesize all your findings into the required output format.
USE THE KEY INSIGHTS to ensure your synthesis is grounded in discovered data.

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
      temperature: 0.2,
      systemPrompt: this.prompts.system,
    });

    const parsed = safeJsonParse<LLMSynthesisResponse<TOutput>>(result.content, "synthesize");

    // Convert to ScoredFindings
    const scoredFindings: ScoredFinding[] = parsed.findings.map((f) =>
      createScoredFinding({
        agentName: "react-engine",
        metric: f.metric,
        category: "financial",
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
   * Get improvement step based on self-critique feedback (with memory)
   */
  private async getImprovementStep(
    context: AgentContext | EnrichedAgentContext,
    previousSteps: ReasoningStep[],
    improvements: string,
    memory: MemoryManager
  ): Promise<{ response: LLMReActResponse; cost: number }> {
    const stepsContext = this.formatPreviousSteps(previousSteps);
    const toolDescriptions = toolRegistry.getToolDescriptions();
    const memoryContext = memory.formatInsightsForPrompt();

    const prompt = `Based on self-critique feedback, you need to improve your analysis.

## Task
${this.prompts.taskDescription}

## Suggested Improvements
${improvements}

## Available Tools
${toolDescriptions}

## Previous Steps
${stepsContext}
${memoryContext}

## Instructions
Address the critique by:
1. Gathering additional evidence using tools
2. Verifying uncertain claims
3. Filling identified gaps

Respond with JSON:
{
  "thought": "how you will address the critique",
  "thoughtType": "self_critique",
  "action": {
    "tool": "toolName",
    "parameters": { ... },
    "reasoning": "why this action addresses the critique"
  },
  "confidence": 0-100,
  "readyToSynthesize": false
}`;

    const result = await complete(prompt, {
      complexity: this.config.modelComplexity,
      temperature: this.config.temperature,
      systemPrompt: this.prompts.system,
    });

    const parsed = safeJsonParse<LLMReActResponse>(result.content, "getImprovementStep");

    if (this.config.enableZodValidation) {
      const validated = LLMReActResponseSchema.parse(parsed);
      return { response: validated, cost: result.cost };
    }

    return { response: parsed, cost: result.cost };
  }

  /**
   * Self-critique phase (with memory context)
   */
  private async selfCritique(
    synthesis: SynthesisResult<TOutput>,
    steps: ReasoningStep[],
    memory: MemoryManager
  ): Promise<{ critique: SelfCritiqueResult; cost: number }> {
    const memoryContext = memory.formatInsightsForPrompt();

    const prompt = `Critically evaluate the following analysis output.

## Original Task
${this.prompts.taskDescription}

## Analysis Output
${JSON.stringify(synthesis.data, null, 2)}

## Findings
${synthesis.findings.map((f) => `- ${f.metric}: ${f.value} (${f.assessment})`).join("\n")}

## Uncertainties Noted
${synthesis.uncertainties.join("\n") || "None noted"}
${memoryContext}

## Instructions
Act as a skeptical reviewer. Identify:
1. Potential weaknesses or gaps in the analysis
2. Assumptions that may not hold
3. Missing evidence or verification
4. Areas where confidence may be inflated
5. Whether the key insights were properly used in conclusions

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

    let parsed: LLMSelfCritiqueResponse;
    try {
      parsed = safeJsonParse<LLMSelfCritiqueResponse>(result.content, "selfCritique");
    } catch {
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
   * Build confidence score from analysis results (with memory stats)
   */
  private buildConfidenceScore(
    baseConfidence: number,
    steps: ReasoningStep[],
    selfCritique?: SelfCritiqueResult,
    memory?: MemoryManager
  ): ConfidenceScore {
    // Count successful tool executions
    const totalActions = steps.filter((s) => s.action).length;
    const successfulActions = steps.filter(
      (s) => s.observation?.success
    ).length;
    const actionSuccessRate =
      totalActions > 0 ? (successfulActions / totalActions) * 100 : 50;

    // Calculate data availability from steps and memory
    let dataAvailability = Math.min(100, steps.length * 20 + actionSuccessRate * 0.5);

    // Boost confidence if we have many high-confidence insights in memory
    if (memory) {
      const stats = memory.getSummary();
      dataAvailability = Math.min(100, dataAvailability + stats.insightCount * 5);
    }

    // Evidence quality from successful observations
    const evidenceQuality = actionSuccessRate;

    // Apply self-critique adjustment
    const adjustedConfidence = selfCritique
      ? baseConfidence + selfCritique.confidenceAdjustment
      : baseConfidence;

    return confidenceCalculator.calculate({
      dataAvailability,
      evidenceQuality,
      benchmarkMatch: 70,
      sourceReliability: totalActions > 0 ? 80 : 50,
      temporalRelevance: 90,
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
