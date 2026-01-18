import { complete, completeJSON, type TaskComplexity } from "@/services/openrouter/router";
import type { AgentConfig, AgentContext, AgentResult } from "./types";

// Generic type for agent results with data
export interface AgentResultWithData<T> extends AgentResult {
  data: T;
}

export abstract class BaseAgent<TData, TResult extends AgentResult = AgentResultWithData<TData>> {
  protected config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  get name(): string {
    return this.config.name;
  }

  get dependencies(): string[] {
    return this.config.dependencies ?? [];
  }

  // Abstract method - each agent implements its own logic
  protected abstract execute(context: AgentContext): Promise<TData>;

  // Build the system prompt for the agent
  protected abstract buildSystemPrompt(): string;

  // Run the agent with error handling and timing
  async run(context: AgentContext): Promise<TResult> {
    const startTime = Date.now();
    const cost = 0;

    try {
      const data = await this.execute(context);
      const executionTimeMs = Date.now() - startTime;

      return {
        agentName: this.config.name,
        success: true,
        executionTimeMs,
        cost,
        data,
      } as unknown as TResult;
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;

      return {
        agentName: this.config.name,
        success: false,
        executionTimeMs,
        cost,
        error: error instanceof Error ? error.message : "Unknown error",
      } as unknown as TResult;
    }
  }

  // Helper to call LLM with text response
  protected async llmComplete(
    prompt: string,
    options: { systemPrompt?: string; temperature?: number } = {}
  ): Promise<{ content: string; cost: number }> {
    const result = await complete(prompt, {
      complexity: this.config.modelComplexity as TaskComplexity,
      systemPrompt: options.systemPrompt ?? this.buildSystemPrompt(),
      temperature: options.temperature ?? 0.3,
    });

    return {
      content: result.content,
      cost: result.cost,
    };
  }

  // Helper to call LLM with JSON response
  protected async llmCompleteJSON<T>(
    prompt: string,
    options: { systemPrompt?: string; temperature?: number } = {}
  ): Promise<{ data: T; cost: number }> {
    const result = await completeJSON<T>(prompt, {
      complexity: this.config.modelComplexity as TaskComplexity,
      systemPrompt: options.systemPrompt ?? this.buildSystemPrompt(),
      temperature: options.temperature ?? 0.2,
    });

    return result;
  }

  // Format deal info for prompts
  protected formatDealContext(context: AgentContext): string {
    const { deal, documents } = context;

    let text = `## Deal Information
- Name: ${deal.name}
- Company: ${deal.companyName ?? "Not specified"}
- Sector: ${deal.sector ?? "Not specified"}
- Stage: ${deal.stage ?? "Not specified"}
- Geography: ${deal.geography ?? "Not specified"}
- Website: ${deal.website ?? "Not specified"}

## Financial Metrics
- ARR: ${deal.arr ? `€${Number(deal.arr).toLocaleString()}` : "Not specified"}
- Growth Rate: ${deal.growthRate ? `${Number(deal.growthRate)}%` : "Not specified"}
- Amount Requested: ${deal.amountRequested ? `€${Number(deal.amountRequested).toLocaleString()}` : "Not specified"}
- Pre-money Valuation: ${deal.valuationPre ? `€${Number(deal.valuationPre).toLocaleString()}` : "Not specified"}

## Description
${deal.description ?? "No description provided"}
`;

    if (documents && documents.length > 0) {
      text += `\n## Documents\n`;
      for (const doc of documents) {
        text += `\n### ${doc.name} (${doc.type})\n`;
        if (doc.extractedText) {
          text += doc.extractedText.substring(0, 10000); // Limit text length
        } else {
          text += "(Content not yet extracted)";
        }
      }
    }

    return text;
  }
}
