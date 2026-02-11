import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { complete, completeJSON, type TaskComplexity } from "@/services/openrouter/router";
import { MODELS, type ModelKey } from "@/services/openrouter/client";
import { handleApiError } from "@/lib/api-error";

const completionSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
  model: z.enum(Object.keys(MODELS) as [ModelKey, ...ModelKey[]]).optional(),
  complexity: z.enum(["simple", "medium", "complex", "critical"]).optional(),
  maxTokens: z.number().positive().max(65536).optional(),
  temperature: z.number().min(0).max(2).optional(),
  systemPrompt: z.string().optional(),
  jsonMode: z.boolean().optional(),
});

// POST /api/llm - Get LLM completion via OpenRouter
// SECURITY: This raw proxy is restricted to development only
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  try {
    await requireAuth();
    const body = await request.json();

    const validatedData = completionSchema.parse(body);
    const { prompt, model, complexity, maxTokens, temperature, systemPrompt, jsonMode } =
      validatedData;

    if (jsonMode) {
      const result = await completeJSON(prompt, {
        model,
        complexity: complexity as TaskComplexity | undefined,
        maxTokens,
        temperature,
        systemPrompt,
      });

      return NextResponse.json({
        data: result.data,
        cost: result.cost,
      });
    }

    const result = await complete(prompt, {
      model,
      complexity: complexity as TaskComplexity | undefined,
      maxTokens,
      temperature,
      systemPrompt,
    });

    return NextResponse.json({
      content: result.content,
      model: result.model,
      usage: result.usage,
      cost: result.cost,
    });
  } catch (error) {
    return handleApiError(error, "get LLM completion");
  }
}

// GET /api/llm - Get available models
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  try {
    await requireAuth();

    const models = Object.entries(MODELS).map(([key, model]) => ({
      key,
      ...model,
    }));

    return NextResponse.json({ data: models });
  } catch (error) {
    return handleApiError(error, "fetch models");
  }
}
