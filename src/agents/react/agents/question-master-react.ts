/**
 * Question Master Agent - ReAct Version
 *
 * Production-grade implementation using ReAct pattern for:
 * - Context-aware question generation
 * - Priority-based due diligence checklist
 * - Reproducible question sets
 */

import { z } from "zod";
import type { ScoredFinding } from "@/scoring";
import type { EnrichedAgentContext, QuestionMasterData, QuestionMasterResult } from "../../types";
import { createReActEngine, type ReActPrompts, type ReActOutput } from "../index";
import { registerBuiltInTools } from "../tools/built-in";

registerBuiltInTools();

const QuestionMasterOutputSchema = z.object({
  founderQuestions: z.array(
    z.object({
      question: z.string(),
      category: z.enum(["vision", "execution", "team", "market", "financials", "risk"]),
      priority: z.enum(["must_ask", "should_ask", "nice_to_have"]),
      redFlagTrigger: z.string().optional(),
      expectedAnswer: z.string().optional(),
    })
  ),
  referenceCheckQuestions: z.array(
    z.object({
      target: z.enum(["customer", "former_employee", "investor", "industry_expert"]),
      questions: z.array(z.string()),
    })
  ),
  diligenceChecklist: z.array(
    z.object({
      category: z.string(),
      items: z.array(
        z.object({
          item: z.string(),
          status: z.enum(["not_started", "in_progress", "completed", "blocked"]),
          criticalPath: z.boolean(),
        })
      ),
    })
  ),
  negotiationPoints: z.array(
    z.object({
      point: z.string(),
      leverage: z.string(),
      suggestedApproach: z.string(),
    })
  ),
  dealbreakers: z.array(z.string()),
  topPriorities: z.array(z.string()),
});

type QuestionMasterOutput = z.infer<typeof QuestionMasterOutputSchema>;

function buildPrompts(
  context: EnrichedAgentContext,
  previousResults: Record<string, unknown> | null
): ReActPrompts {
  const deal = context.deal;
  const sector = deal.sector ?? "SaaS B2B";
  const stage = deal.stage ?? "SEED";

  // Collect issues from previous agents
  const issuesFromAgents: string[] = [];
  if (previousResults) {
    for (const [agentName, result] of Object.entries(previousResults)) {
      const res = result as { success?: boolean; data?: Record<string, unknown> };
      if (res.success && res.data) {
        // Extract red flags, concerns, issues from each agent
        const data = res.data;
        if (data.redFlags && Array.isArray(data.redFlags)) {
          issuesFromAgents.push(...(data.redFlags as string[]).map((f) => `[${agentName}] ${f}`));
        }
        if (data.financialRedFlags && Array.isArray(data.financialRedFlags)) {
          issuesFromAgents.push(...(data.financialRedFlags as string[]).map((f) => `[${agentName}] ${f}`));
        }
        if (data.criticalIssues && Array.isArray(data.criticalIssues)) {
          issuesFromAgents.push(...(data.criticalIssues as string[]).map((f) => `[${agentName}] ${f}`));
        }
      }
    }
  }

  return {
    system: `You are a senior due diligence specialist creating targeted questions and checklists.

Your role is to:
1. Generate founder questions based on identified issues
2. Create reference check questions for validation
3. Build a prioritized due diligence checklist
4. Identify negotiation leverage points
5. Highlight dealbreakers and top priorities

CRITICAL RULES:
- Questions must be SPECIFIC to issues found, not generic
- Must_ask questions address potential dealbreakers
- Reference checks must validate specific claims
- Checklist items must be actionable
- Negotiation points need specific leverage

Each question should:
- Address a specific concern or gap
- Be difficult to deflect with generic answers
- Reveal red flags if present`,

    taskDescription: `Generate comprehensive due diligence questions and checklist:

## Deal Information
- Company: ${deal.companyName ?? deal.name}
- Sector: ${sector}
- Stage: ${stage}

## Issues Identified by Other Agents
${issuesFromAgents.length > 0 ? issuesFromAgents.join("\n") : "No specific issues flagged yet"}

## Your Tasks
1. Generate founder questions targeting identified issues
2. Create reference check questions for each target type
3. Build due diligence checklist organized by category
4. Identify negotiation points with leverage
5. List potential dealbreakers
6. Prioritize top 5 items to address

Produce targeted questions, not generic templates.`,

    availableTools: "",

    outputSchema: `{
  "founderQuestions": [{
    "question": "Specific question addressing an issue",
    "category": "vision|execution|team|market|financials|risk",
    "priority": "must_ask|should_ask|nice_to_have",
    "redFlagTrigger": "What answer would be a red flag" (optional),
    "expectedAnswer": "What a good answer looks like" (optional)
  }],
  "referenceCheckQuestions": [{
    "target": "customer|former_employee|investor|industry_expert",
    "questions": ["specific question for this target"]
  }],
  "diligenceChecklist": [{
    "category": "Financial|Legal|Technical|etc.",
    "items": [{
      "item": "Specific item to verify",
      "status": "not_started",
      "criticalPath": boolean
    }]
  }],
  "negotiationPoints": [{
    "point": "What to negotiate",
    "leverage": "Why you have leverage",
    "suggestedApproach": "How to approach"
  }],
  "dealbreakers": ["Condition that would kill the deal"],
  "topPriorities": ["Top 5 things to resolve first"]
}`,

    constraints: [
      "MUST reference specific issues from other agents",
      "must_ask questions = potential dealbreakers",
      "Customer references must validate key claims (revenue, retention)",
      "Former employee references reveal culture and execution",
      "Checklist must include all critical path items",
      "Negotiation points need specific leverage, not generic advice",
    ],
  };
}

export class QuestionMasterReAct {
  readonly name = "question-master";
  readonly dependencies = ["document-extractor"];

  async run(context: EnrichedAgentContext): Promise<QuestionMasterResult> {
    const startTime = Date.now();

    const previousResults = context.previousResults ?? null;
    const prompts = buildPrompts(context, previousResults as Record<string, unknown> | null);

    const engine = createReActEngine<QuestionMasterOutput>(
      prompts,
      QuestionMasterOutputSchema,
      {
        maxIterations: 4,
        minIterations: 2,
        confidenceThreshold: 70,
        enableSelfCritique: true,
        modelComplexity: "complex",
      }
    );

    const result = await engine.run(context, this.name);

    if (!result.success) {
      return {
        agentName: this.name,
        success: false,
        executionTimeMs: Date.now() - startTime,
        cost: result.cost,
        error: result.error,
        data: this.getDefaultData(),
      };
    }

    return {
      agentName: this.name,
      success: true,
      executionTimeMs: Date.now() - startTime,
      cost: result.cost,
      data: result.result,
      _react: {
        reasoningTrace: result.reasoningTrace,
        findings: this.enrichFindings(result.findings),
        confidence: result.confidence,
        expectedVariance: this.calculateExpectedVariance(result),
      },
    } as QuestionMasterResult & { _react: unknown };
  }

  private enrichFindings(findings: ScoredFinding[]): ScoredFinding[] {
    return findings.map((f) => ({ ...f, agentName: this.name, category: "product" as const }));
  }

  private calculateExpectedVariance(result: ReActOutput<QuestionMasterOutput>): number {
    const baseVariance = 25 * (1 - result.confidence.score / 100);
    const benchmarkedRatio = result.findings.filter((f) => f.benchmarkData).length / Math.max(1, result.findings.length);
    return Math.round(baseVariance * (1 - benchmarkedRatio * 0.5) * 10) / 10;
  }

  private getDefaultData(): QuestionMasterData {
    return {
      founderQuestions: [],
      referenceCheckQuestions: [],
      diligenceChecklist: [],
      negotiationPoints: [],
      dealbreakers: ["Analysis incomplete - manual review required"],
      topPriorities: ["Complete due diligence analysis"],
    };
  }
}

export const questionMasterReAct = new QuestionMasterReAct();
