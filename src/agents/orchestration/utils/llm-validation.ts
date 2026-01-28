/**
 * LLM response validation with Zod schemas and retry logic
 */

import { z } from "zod";
import { complete } from "@/services/openrouter/router";

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  retries: number;
  tokensUsed: number;
}

/**
 * Call LLM with systemPrompt + userPrompt, validate response with Zod schema.
 * Retries up to maxRetries if validation fails.
 */
export async function completeAndValidate<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodSchema<T>,
  options: {
    maxRetries?: number;
    complexity?: "simple" | "medium" | "complex";
    temperature?: number;
  } = {}
): Promise<ValidationResult<T>> {
  const { maxRetries = 2, complexity = "medium", temperature = 0.1 } = options;

  let lastError: string | undefined;
  let totalTokens = 0;
  let currentUserPrompt = userPrompt;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await complete(currentUserPrompt, {
        systemPrompt,
        complexity,
        temperature,
      });

      totalTokens += response.usage?.totalTokens ?? 0;

      // Extract JSON from response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        lastError = "No JSON found in response";
        continue;
      }

      // Parse JSON
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (e) {
        lastError = `JSON parse error: ${e}`;
        continue;
      }

      // Validate with Zod
      const result = schema.safeParse(parsed);
      if (result.success) {
        return {
          success: true,
          data: result.data,
          retries: attempt,
          tokensUsed: totalTokens,
        };
      } else {
        lastError = `Validation error: ${result.error.issues
          .map((e) => `${String(e.path.join("."))}: ${e.message}`)
          .join(", ")}`;

        // Add error context for retry
        if (attempt < maxRetries) {
          currentUserPrompt =
            userPrompt +
            `\n\n---\nPREVIOUS RESPONSE HAD VALIDATION ERRORS:\n${lastError}\n\nPlease fix these issues and respond again with valid JSON.`;
        }
      }
    } catch (e) {
      lastError = `LLM call error: ${e}`;
    }
  }

  return {
    success: false,
    error: lastError,
    retries: maxRetries,
    tokensUsed: totalTokens,
  };
}
