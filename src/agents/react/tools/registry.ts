/**
 * Tool Registry
 * Manages available tools for ReAct agents
 *
 * CACHING: Uses centralized CacheManager for cross-agent cache sharing.
 * When multiple agents execute the same tool with same params,
 * only the first call actually executes - others get cached result.
 */

import type { ToolDefinition, ToolContext, ToolResult } from "../types";
import type {
  IToolRegistry,
  ToolExecutionOptions,
  TimedToolResult,
} from "./types";
import { getCacheManager } from "../../../services/cache";

const TOOL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

class ToolRegistry implements IToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  /**
   * Register a tool
   */
  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      console.warn(`Tool ${tool.name} is being re-registered`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Get a tool by name
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   */
  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Execute a tool by name
   *
   * Uses centralized CacheManager for cross-agent cache sharing.
   * Cache is keyed by tool name + params, so identical calls from
   * different agents will share the same cached result.
   */
  async execute(
    name: string,
    params: Record<string, unknown>,
    context: ToolContext,
    options: ToolExecutionOptions = {}
  ): Promise<TimedToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        error: `Tool "${name}" not found`,
        executionTimeMs: 0,
        fromCache: false,
      };
    }

    // Check centralized cache if enabled
    const cache = getCacheManager();
    const cacheKey = this.getCacheKey(name, params);

    if (options.cacheEnabled !== false) {
      const cached = cache.get<ToolResult>("tools", cacheKey);
      if (cached) {
        return {
          ...cached,
          executionTimeMs: 0,
          fromCache: true,
          metadata: {
            ...cached.metadata,
            cached: true,
            cacheSource: "cross-agent",
          },
        };
      }
    }

    // Validate parameters
    const validationError = this.validateParameters(tool, params);
    if (validationError) {
      return {
        success: false,
        error: validationError,
        executionTimeMs: 0,
        fromCache: false,
      };
    }

    // Execute with timeout and retries
    const timeout = options.timeout ?? 30000;
    const retries = options.retries ?? 1;
    let lastError: string | undefined;

    for (let attempt = 0; attempt < retries; attempt++) {
      const startTime = Date.now();

      try {
        const result = await Promise.race([
          tool.execute(params, context),
          new Promise<ToolResult>((_, reject) =>
            setTimeout(() => reject(new Error("Tool execution timeout")), timeout)
          ),
        ]);

        const executionTimeMs = Date.now() - startTime;

        // Cache successful results in centralized cache
        if (result.success && options.cacheEnabled !== false) {
          // Add deal tag if available in context for targeted invalidation
          const tags: string[] = [];
          if (context.dealId) {
            tags.push(`deal:${context.dealId}`);
          }

          cache.set("tools", cacheKey, result, {
            ttlMs: TOOL_CACHE_TTL_MS,
            tags,
          });
        }

        return {
          ...result,
          executionTimeMs,
          fromCache: false,
        };
      } catch (error) {
        lastError =
          error instanceof Error ? error.message : "Unknown error";

        // If not last attempt, wait briefly before retry
        if (attempt < retries - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * (attempt + 1))
          );
        }
      }
    }

    return {
      success: false,
      error: lastError ?? "Tool execution failed",
      executionTimeMs: 0,
      fromCache: false,
    };
  }

  /**
   * Get formatted descriptions of all tools for prompts
   */
  getToolDescriptions(): string {
    const tools = this.getAll();
    if (tools.length === 0) {
      return "No tools available.";
    }

    return tools
      .map((tool) => {
        const params = tool.parameters
          .map((p) => {
            const required = p.required ? " (required)" : " (optional)";
            const defaultVal =
              p.default !== undefined ? ` [default: ${p.default}]` : "";
            const enumVals = p.enum ? ` [values: ${p.enum.join(", ")}]` : "";
            return `    - ${p.name}: ${p.type}${required}${defaultVal}${enumVals} - ${p.description}`;
          })
          .join("\n");

        return `## ${tool.name}
${tool.description}

Parameters:
${params || "    (none)"}`;
      })
      .join("\n\n");
  }

  /**
   * Validate tool parameters
   */
  private validateParameters(
    tool: ToolDefinition,
    params: Record<string, unknown>
  ): string | null {
    for (const param of tool.parameters) {
      const value = params[param.name];

      // Check required
      if (param.required && value === undefined) {
        return `Missing required parameter: ${param.name}`;
      }

      // Skip validation if not provided and optional
      if (value === undefined) continue;

      // Type validation
      const actualType = Array.isArray(value) ? "array" : typeof value;
      if (actualType !== param.type && param.type !== "object") {
        return `Parameter ${param.name} expected ${param.type}, got ${actualType}`;
      }

      // Enum validation
      if (param.enum && !param.enum.includes(String(value))) {
        return `Parameter ${param.name} must be one of: ${param.enum.join(", ")}`;
      }
    }

    return null;
  }

  /**
   * Generate cache key for tool+params
   */
  private getCacheKey(
    name: string,
    params: Record<string, unknown>
  ): string {
    return `${name}:${JSON.stringify(params, Object.keys(params).sort())}`;
  }

  /**
   * Clear all tool cache entries
   */
  clearCache(): void {
    const cache = getCacheManager();
    cache.invalidateNamespace("tools");
  }

  /**
   * Remove specific cache entry
   */
  invalidateCache(name: string, params: Record<string, unknown>): void {
    const cache = getCacheManager();
    const key = this.getCacheKey(name, params);
    cache.delete("tools", key);
  }

  /**
   * Invalidate all cached tool results for a specific deal
   */
  invalidateDealCache(dealId: string): number {
    const cache = getCacheManager();
    return cache.invalidateDeal(dealId);
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    const cache = getCacheManager();
    return cache.getStats();
  }
}

// Singleton instance
export const toolRegistry = new ToolRegistry();
