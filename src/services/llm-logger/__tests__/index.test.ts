import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    lLMCallLog: {
      create: mocks.create,
      findUnique: mocks.findUnique,
      findMany: mocks.findMany,
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

const { logLLMCall } = await import("../index");

describe("llm logger privacy mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.LLM_LOG_RAW_TEXT;
    mocks.create.mockResolvedValue({ id: "log_1" });
  });

  it("redacts prompt and response bodies by default while persisting hashes in metadata", async () => {
    await logLLMCall({
      analysisId: "analysis_1",
      agentName: "thesis-extractor",
      model: "test-model",
      systemPrompt: "SYSTEM SECRET",
      userPrompt: "USER SECRET",
      response: "MODEL SECRET",
      inputTokens: 10,
      outputTokens: 5,
      cost: 0.12,
      durationMs: 42,
      metadata: { attempt: 0 },
    });

    expect(mocks.create).toHaveBeenCalledTimes(1);
    const payload = mocks.create.mock.calls[0][0].data;

    expect(payload.systemPrompt).toMatch(/^\[REDACTED:system;/);
    expect(payload.userPrompt).toMatch(/^\[REDACTED:user;/);
    expect(payload.response).toMatch(/^\[REDACTED:response;/);
    expect(payload.systemPrompt).not.toContain("SYSTEM SECRET");
    expect(payload.userPrompt).not.toContain("USER SECRET");
    expect(payload.response).not.toContain("MODEL SECRET");
    expect(payload.metadata).toMatchObject({
      attempt: 0,
      llmTrace: {
        loggingMode: "redacted",
        systemPromptLength: 13,
        userPromptLength: 11,
        responseLength: 12,
      },
    });
  });

  it("allows raw storage only when explicitly enabled", async () => {
    process.env.LLM_LOG_RAW_TEXT = "true";

    await logLLMCall({
      agentName: "memo-generator",
      model: "test-model",
      systemPrompt: "SYSTEM SECRET",
      userPrompt: "USER SECRET",
      response: "MODEL SECRET",
      inputTokens: 10,
      outputTokens: 5,
      cost: 0.12,
      durationMs: 42,
    });

    const payload = mocks.create.mock.calls[0][0].data;
    expect(payload.systemPrompt).toBe("SYSTEM SECRET");
    expect(payload.userPrompt).toBe("USER SECRET");
    expect(payload.response).toBe("MODEL SECRET");
    expect(payload.metadata).toMatchObject({
      loggingMode: "raw",
      systemPromptLength: 13,
      userPromptLength: 11,
      responseLength: 12,
    });
  });
});
