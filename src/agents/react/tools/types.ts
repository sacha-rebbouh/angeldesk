/**
 * Tool Types
 * Extended types for the tool system
 */

import type { ToolDefinition, ToolContext, ToolResult } from "../types";

/**
 * Registry interface for managing tools
 */
export interface IToolRegistry {
  register(tool: ToolDefinition): void;
  get(name: string): ToolDefinition | undefined;
  getAll(): ToolDefinition[];
  has(name: string): boolean;
  execute(
    name: string,
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult>;
  getToolDescriptions(): string;
}

/**
 * Tool category for organization
 */
export type ToolCategory =
  | "data_retrieval" // Fetch data from sources
  | "analysis" // Analyze content
  | "calculation" // Perform calculations
  | "verification" // Cross-reference / verify
  | "memory"; // Read/write to memory

/**
 * Extended tool definition with metadata
 */
export interface ExtendedToolDefinition extends ToolDefinition {
  category: ToolCategory;
  cost: "free" | "low" | "medium" | "high"; // LLM call cost indication
  cacheable: boolean;
  cacheKey?: (params: Record<string, unknown>) => string;
}

/**
 * Tool execution options
 */
export interface ToolExecutionOptions {
  timeout?: number;
  retries?: number;
  cacheEnabled?: boolean;
}

/**
 * Tool execution result with timing
 */
export interface TimedToolResult extends ToolResult {
  executionTimeMs: number;
  fromCache: boolean;
}
