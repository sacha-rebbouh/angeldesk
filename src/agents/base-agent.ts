import { complete, completeJSON, type TaskComplexity } from "@/services/openrouter/router";
import type { AgentConfig, AgentContext, AgentResult, EnrichedAgentContext } from "./types";

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

  // Format Context Engine data for prompts (Tier 1 agents)
  protected formatContextEngineData(context: EnrichedAgentContext): string {
    const { contextEngine } = context;
    if (!contextEngine) {
      return "";
    }

    let text = "\n## Contexte Externe (Context Engine)\n";

    // Deal Intelligence - Similar deals and valuation benchmarks
    if (contextEngine.dealIntelligence) {
      const di = contextEngine.dealIntelligence;
      text += "\n### Deals Similaires et Valorisation\n";

      if (di.similarDeals && di.similarDeals.length > 0) {
        text += `${di.similarDeals.length} deals comparables identifies:\n`;
        for (const deal of di.similarDeals.slice(0, 5)) {
          text += `- **${deal.companyName}** (${deal.sector}, ${deal.stage}): ${this.formatMoney(deal.fundingAmount)}`;
          if (deal.valuationMultiple) {
            text += ` @ ${deal.valuationMultiple}x ARR`;
          }
          text += ` - ${deal.fundingDate}\n`;
        }
      }

      if (di.fundingContext) {
        const fc = di.fundingContext;
        text += `\nContexte marche (${fc.period}):\n`;
        text += `- Multiple valorisation: P25=${fc.p25ValuationMultiple}x, Median=${fc.medianValuationMultiple}x, P75=${fc.p75ValuationMultiple}x\n`;
        text += `- Tendance: ${fc.trend} (${fc.trendPercentage > 0 ? "+" : ""}${fc.trendPercentage}%)\n`;
        text += `- ${fc.totalDealsInPeriod} deals sur la periode\n`;
      }

      if (di.verdict) {
        text += `\nVerdict valorisation: **${di.verdict.toUpperCase()}**\n`;
      }
    }

    // Market Data - Benchmarks
    if (contextEngine.marketData) {
      const md = contextEngine.marketData;
      text += "\n### Benchmarks Secteur\n";

      if (md.marketSize) {
        text += `TAM: ${this.formatMoney(md.marketSize.tam)} | SAM: ${this.formatMoney(md.marketSize.sam)} | SOM: ${this.formatMoney(md.marketSize.som)}\n`;
        text += `CAGR: ${md.marketSize.cagr}%\n`;
      }

      if (md.benchmarks && md.benchmarks.length > 0) {
        text += "\nMetriques de reference:\n";
        for (const b of md.benchmarks.slice(0, 8)) {
          text += `- ${b.metricName}: P25=${b.p25}${b.unit}, Median=${b.median}${b.unit}, P75=${b.p75}${b.unit}\n`;
        }
      }

      if (md.trends && md.trends.length > 0) {
        text += "\nTendances marche:\n";
        for (const t of md.trends.slice(0, 3)) {
          text += `- ${t.title}: ${t.description} (impact: ${t.impact})\n`;
        }
      }
    }

    // Competitive Landscape
    if (contextEngine.competitiveLandscape) {
      const cl = contextEngine.competitiveLandscape;
      text += "\n### Paysage Concurrentiel\n";

      if (cl.competitors && cl.competitors.length > 0) {
        text += `${cl.competitors.length} concurrents identifies:\n`;
        for (const c of cl.competitors.slice(0, 5)) {
          text += `- **${c.name}** (${c.overlap}): ${c.positioning}`;
          if (c.totalFunding) {
            text += ` - Funding: ${this.formatMoney(c.totalFunding)}`;
          }
          text += "\n";
        }
      }

      text += `Concentration marche: ${cl.marketConcentration}\n`;
    }

    // People Graph - Founder backgrounds
    if (contextEngine.peopleGraph) {
      const pg = contextEngine.peopleGraph;
      text += "\n### Background Equipe\n";

      if (pg.founders && pg.founders.length > 0) {
        for (const f of pg.founders) {
          text += `\n**${f.name}** (${f.role}) - Verification: ${f.verificationStatus}\n`;

          if (f.previousCompanies && f.previousCompanies.length > 0) {
            text += "Experience:\n";
            for (const exp of f.previousCompanies.slice(0, 3)) {
              text += `  - ${exp.company}: ${exp.role}`;
              if (exp.startYear) text += ` (${exp.startYear}-${exp.endYear ?? "present"})`;
              text += "\n";
            }
          }

          if (f.previousVentures && f.previousVentures.length > 0) {
            text += "Ventures precedentes:\n";
            for (const v of f.previousVentures) {
              text += `  - ${v.companyName}: ${v.outcome}`;
              if (v.exitValue) text += ` (exit: ${this.formatMoney(v.exitValue)})`;
              text += "\n";
            }
          }

          if (f.redFlags && f.redFlags.length > 0) {
            text += "Red flags detectes:\n";
            for (const rf of f.redFlags) {
              text += `  - [${rf.severity.toUpperCase()}] ${rf.description}\n`;
            }
          }
        }
      }
    }

    // News Sentiment
    if (contextEngine.newsSentiment) {
      const ns = contextEngine.newsSentiment;
      text += "\n### Sentiment Presse\n";
      text += `Sentiment global: ${ns.overallSentiment} (score: ${ns.sentimentScore.toFixed(2)})\n`;

      if (ns.articles && ns.articles.length > 0) {
        text += "Articles recents:\n";
        for (const a of ns.articles.slice(0, 3)) {
          text += `- [${a.sentiment}] "${a.title}" (${a.source}, ${a.publishedAt})\n`;
        }
      }
    }

    // Completeness indicator
    if (contextEngine.completeness !== undefined) {
      text += `\n---\nCompletude des donnees: ${Math.round(contextEngine.completeness * 100)}%\n`;
    }

    return text;
  }

  // Helper to format money values
  private formatMoney(value: number): string {
    if (value >= 1_000_000_000) {
      return `€${(value / 1_000_000_000).toFixed(1)}B`;
    }
    if (value >= 1_000_000) {
      return `€${(value / 1_000_000).toFixed(1)}M`;
    }
    if (value >= 1_000) {
      return `€${(value / 1_000).toFixed(0)}K`;
    }
    return `€${value}`;
  }

  // Get extracted info from previous document-extractor run
  protected getExtractedInfo(context: AgentContext): Record<string, unknown> | null {
    const extractionResult = context.previousResults?.["document-extractor"];
    if (extractionResult?.success && "data" in extractionResult) {
      const data = extractionResult.data as { extractedInfo?: Record<string, unknown> };
      return data.extractedInfo ?? null;
    }
    return null;
  }
}
