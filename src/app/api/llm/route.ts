import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { complete, completeJSON, type TaskComplexity } from "@/services/openrouter/router";
import { MODELS, type ModelKey } from "@/services/openrouter/client";

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
export async function POST(request: NextRequest) {
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
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    console.error("Error in LLM completion:", error);
    return NextResponse.json(
      { error: "Failed to get LLM completion" },
      { status: 500 }
    );
  }
}

// GET /api/llm - Get available models
export async function GET() {
  try {
    await requireAuth();

    const models = Object.entries(MODELS).map(([key, model]) => ({
      key,
      ...model,
    }));

    return NextResponse.json({ data: models });
  } catch (error) {
    console.error("Error fetching models:", error);
    return NextResponse.json(
      { error: "Failed to fetch models" },
      { status: 500 }
    );
  }
}
