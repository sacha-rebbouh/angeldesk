/**
 * B17.1 — Tests for GET /api/admin/analyses/:analysisId/debug.
 *
 * Coverage:
 *  - auth gate (401 unauth, 403 non-admin, invalid cuid 400, not found 404)
 *  - happy path shape + no sensitive field leakage
 *  - 7 anomaly types triggered by crafted fixtures
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  isValidCuid: vi.fn(),
  analysisFindUnique: vi.fn(),
  checkpointFindFirst: vi.fn(),
  llmFindMany: vi.fn(),
  llmFindFirst: vi.fn(),
  llmCount: vi.fn(),
  llmGroupBy: vi.fn(),
  llmGroupByForErrors: vi.fn(),
  handleApiError: vi.fn(),
  sanitizeErrorText: vi.fn((v: unknown) => String(v ?? "")),
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@/lib/sanitize", () => ({
  isValidCuid: mocks.isValidCuid,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    analysis: {
      findUnique: mocks.analysisFindUnique,
    },
    analysisCheckpoint: {
      findFirst: mocks.checkpointFindFirst,
    },
    lLMCallLog: {
      findMany: mocks.llmFindMany,
      findFirst: mocks.llmFindFirst,
      count: mocks.llmCount,
      groupBy: vi.fn((args: { where?: { isError?: boolean } }) => {
        // Route calls groupBy twice: once for all agents, once for errors only.
        // Distinguish by presence of `where.isError`.
        if (args?.where && "isError" in args.where) {
          return mocks.llmGroupByForErrors(args);
        }
        return mocks.llmGroupBy(args);
      }),
    },
  },
}));

vi.mock("@/lib/api-error", () => ({
  handleApiError: mocks.handleApiError,
  sanitizeErrorText: mocks.sanitizeErrorText,
}));

const { GET } = await import("../route");

const VALID_ID = "cmpeadzt70003ld04znm85k3v";

function makeRequest(limit?: string): import("next/server").NextRequest {
  const url = new URL("http://localhost:3007/api/admin/analyses/x/debug" + (limit ? `?limit=${limit}` : ""));
  return {
    nextUrl: url,
  } as unknown as import("next/server").NextRequest;
}

function asParams(id: string) {
  return { params: Promise.resolve({ analysisId: id }) };
}

function jsonBody(resp: Response | { json: () => Promise<unknown> }) {
  // NextResponse.json returns a Response-like. resp.json() always works.
  return (resp as Response).json();
}

describe("GET /api/admin/analyses/:analysisId/debug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ id: "admin_1" });
    mocks.isValidCuid.mockReturnValue(true);
    mocks.handleApiError.mockImplementation((error: unknown) =>
      new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : "unexpected" }),
        { status: 500, headers: { "content-type": "application/json" } }
      )
    );
    mocks.sanitizeErrorText.mockImplementation((v: unknown) => String(v ?? ""));
    // sensible defaults for happy path
    mocks.analysisFindUnique.mockResolvedValue({
      id: VALID_ID,
      dealId: "deal_1",
      status: "COMPLETED",
      mode: "full_analysis",
      type: "FULL_DD",
      totalAgents: 23,
      completedAgents: 23,
      totalCost: { toNumber: () => 1.2 },
      totalTimeMs: 120000,
      startedAt: new Date("2026-05-01T10:00:00Z"),
      completedAt: new Date("2026-05-01T10:02:00Z"),
      thesisId: null,
      thesisDecision: null,
      thesisDecisionAt: null,
      refundedAt: null,
      refundAmount: null,
      summary: "Summary text",
      results: { foo: "bar" },
      negotiationStrategy: null,
    });
    mocks.checkpointFindFirst.mockResolvedValue(null);
    mocks.llmFindMany.mockResolvedValue([]);
    mocks.llmFindFirst.mockResolvedValue(null);
    mocks.llmCount.mockResolvedValue(0);
    mocks.llmGroupBy.mockResolvedValue([]);
    mocks.llmGroupByForErrors.mockResolvedValue([]);
  });

  it("returns 401 when requireAdmin throws Unauthorized", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("Unauthorized"));

    const resp = await GET(makeRequest(), asParams(VALID_ID));
    expect(mocks.handleApiError).not.toHaveBeenCalled();
    expect(resp.status).toBe(401);
    const body = (await jsonBody(resp)) as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when requireAdmin rejects a non-admin user", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("Admin access required"));

    const resp = await GET(makeRequest(), asParams(VALID_ID));
    expect(mocks.handleApiError).not.toHaveBeenCalled();
    expect(resp.status).toBe(403);
    const body = (await jsonBody(resp)) as { error: string };
    expect(body.error).toBe("Forbidden");
  });

  it("keeps unexpected auth errors on the generic error path", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("Prisma connection failed"));

    const resp = await GET(makeRequest(), asParams(VALID_ID));
    expect(mocks.handleApiError).toHaveBeenCalledOnce();
    expect(resp.status).toBe(500);
  });

  it("returns 400 when analysisId is not a valid CUID", async () => {
    mocks.isValidCuid.mockReturnValue(false);
    const resp = await GET(makeRequest(), asParams("not-a-cuid"));
    expect(resp.status).toBe(400);
    const body = (await jsonBody(resp)) as { error: string };
    expect(body.error).toMatch(/Invalid analysisId/);
  });

  it("returns 404 when analysis does not exist", async () => {
    mocks.analysisFindUnique.mockResolvedValue(null);
    const resp = await GET(makeRequest(), asParams(VALID_ID));
    expect(resp.status).toBe(404);
  });

  it("returns expected shape on happy path", async () => {
    const resp = await GET(makeRequest(), asParams(VALID_ID));
    expect(resp.status).toBe(200);
    const body = (await jsonBody(resp)) as { data: Record<string, unknown> };

    expect(body.data).toMatchObject({
      summary: expect.objectContaining({
        id: VALID_ID,
        dealId: "deal_1",
        status: "COMPLETED",
        totalAgents: 23,
        completedAgents: 23,
        totalCost: 1.2,
        hasSummary: true,
        hasResults: true,
        hasNegotiationStrategy: false,
      }),
      agents: expect.any(Array),
      llmCalls: expect.any(Array),
      checkpoint: null,
      anomalies: expect.any(Array),
      meta: expect.objectContaining({
        llmCallsLimit: 200,
        llmCallsReturned: 0,
        llmCallsTotal: 0,
      }),
    });
  });

  it("never leaks systemPrompt/userPrompt/response keys in any payload", async () => {
    // Even though we don't select those fields, assert defense-in-depth on the
    // serialised JSON in case a future refactor accidentally widens the select.
    mocks.llmFindMany.mockResolvedValue([
      {
        id: "call_1",
        agentName: "financial-auditor",
        model: "gemini-2.5-pro",
        isError: true,
        errorType: "timeout",
        errorMessage: "timed out after 60s",
        durationMs: 60000,
        cost: 0.05,
        inputTokens: 65000,
        outputTokens: 0,
        finishReason: null,
        createdAt: new Date("2026-05-01T10:01:00Z"),
      },
    ]);
    mocks.llmCount.mockResolvedValue(1);

    const resp = await GET(makeRequest(), asParams(VALID_ID));
    const raw = JSON.stringify(await jsonBody(resp));
    expect(raw).not.toContain("systemPrompt");
    expect(raw).not.toContain("userPrompt");
    expect(raw).not.toMatch(/"response"\s*:/);
    // errorMessage is exposed but sanitized
    expect(raw).toContain("timed out after 60s");
  });

  it("flags unknown_agent_calls anomaly", async () => {
    mocks.llmGroupBy.mockResolvedValue([
      {
        agentName: "unknown",
        _count: { _all: 37 },
        _sum: { cost: 0.805, durationMs: 50000, inputTokens: 100000, outputTokens: 5000 },
      },
    ]);
    mocks.llmFindMany.mockResolvedValue([
      {
        id: "c1",
        agentName: "unknown",
        model: "claude-3-5-sonnet",
        isError: false,
        errorType: null,
        errorMessage: null,
        durationMs: 500,
        cost: 0.02,
        inputTokens: 2000,
        outputTokens: 200,
        finishReason: "stop",
        createdAt: new Date(),
      },
    ]);

    const resp = await GET(makeRequest(), asParams(VALID_ID));
    const body = (await jsonBody(resp)) as { data: { anomalies: Array<{ type: string }> } };
    const types = body.data.anomalies.map((a) => a.type);
    expect(types).toContain("unknown_agent_calls");
  });

  it("flags agent_errors anomaly", async () => {
    mocks.llmGroupBy.mockResolvedValue([
      {
        agentName: "financial-auditor",
        _count: { _all: 2 },
        _sum: { cost: 0.05, durationMs: 65000, inputTokens: 65000, outputTokens: 0 },
      },
    ]);
    mocks.llmGroupByForErrors.mockResolvedValue([
      { agentName: "financial-auditor", _count: { _all: 1 } },
    ]);

    const resp = await GET(makeRequest(), asParams(VALID_ID));
    const body = (await jsonBody(resp)) as { data: { anomalies: Array<{ type: string }> } };
    expect(body.data.anomalies.map((a) => a.type)).toContain("agent_errors");
  });

  it("flags total_cost_exceeded anomaly", async () => {
    mocks.analysisFindUnique.mockResolvedValue({
      id: VALID_ID,
      dealId: "deal_1",
      status: "COMPLETED",
      mode: "full_analysis",
      type: "FULL_DD",
      totalAgents: 23,
      completedAgents: 23,
      totalCost: { toNumber: () => 5.5 }, // > default threshold 3
      totalTimeMs: 120000,
      startedAt: null,
      completedAt: null,
      thesisId: null,
      thesisDecision: null,
      thesisDecisionAt: null,
      refundedAt: null,
      refundAmount: null,
      summary: null,
      results: null,
      negotiationStrategy: null,
    });

    const resp = await GET(makeRequest(), asParams(VALID_ID));
    const body = (await jsonBody(resp)) as { data: { anomalies: Array<{ type: string }> } };
    expect(body.data.anomalies.map((a) => a.type)).toContain("total_cost_exceeded");
  });

  it("flags slow_llm_call and high_input_tokens anomalies", async () => {
    mocks.llmFindFirst.mockImplementation((args: { orderBy?: Record<string, string> }) => {
      if (args.orderBy?.durationMs === "desc") {
        return Promise.resolve({
          agentName: "financial-auditor",
          model: "gemini-2.5-pro",
          durationMs: 200_000, // > 180_000
        });
      }
      if (args.orderBy?.inputTokens === "desc") {
        return Promise.resolve({
          agentName: "financial-auditor",
          model: "gemini-2.5-pro",
          inputTokens: 70_000, // > 60_000
        });
      }
      return Promise.resolve(null);
    });

    const resp = await GET(makeRequest(), asParams(VALID_ID));
    const body = (await jsonBody(resp)) as { data: { anomalies: Array<{ type: string }> } };
    const types = body.data.anomalies.map((a) => a.type);
    expect(types).toContain("slow_llm_call");
    expect(types).toContain("high_input_tokens");
  });

  it("flags completed_with_errors anomaly when COMPLETED but has errored calls", async () => {
    mocks.llmGroupBy.mockResolvedValue([
      {
        agentName: "financial-auditor",
        _count: { _all: 1 },
        _sum: { cost: 0.05, durationMs: 60000, inputTokens: 30000, outputTokens: 0 },
      },
    ]);
    mocks.llmGroupByForErrors.mockResolvedValue([
      { agentName: "financial-auditor", _count: { _all: 1 } },
    ]);

    const resp = await GET(makeRequest(), asParams(VALID_ID));
    const body = (await jsonBody(resp)) as { data: { anomalies: Array<{ type: string }> } };
    expect(body.data.anomalies.map((a) => a.type)).toContain("completed_with_errors");
  });

  it("flags checkpoint_divergence when counts disagree", async () => {
    mocks.checkpointFindFirst.mockResolvedValue({
      id: "chk_1",
      state: "RUNNING",
      completedAgents: ["a", "b", "c"], // 3
      pendingAgents: ["d"],
      failedAgents: null,
      createdAt: new Date("2026-05-01T10:00:30Z"),
    });
    // analysis.completedAgents = 23 (default mock), checkpoint says 3 → divergence
    const resp = await GET(makeRequest(), asParams(VALID_ID));
    const body = (await jsonBody(resp)) as { data: { anomalies: Array<{ type: string }> } };
    expect(body.data.anomalies.map((a) => a.type)).toContain("checkpoint_divergence");
  });

  it("sanitizes checkpoint failedAgents instead of returning raw checkpoint JSON", async () => {
    mocks.sanitizeErrorText.mockImplementation((v: unknown) =>
      String(v ?? "").replace(/secret-token/g, "[redacted-token]")
    );
    mocks.checkpointFindFirst.mockResolvedValue({
      id: "chk_1",
      state: "RUNNING",
      completedAgents: [],
      pendingAgents: [],
      failedAgents: [
        {
          agent: "financial-auditor",
          error: "timeout with secret-token",
          retries: 2,
          rawPrompt: "SHOULD_NOT_LEAK",
        },
      ],
      createdAt: new Date("2026-05-01T10:00:30Z"),
    });

    const resp = await GET(makeRequest(), asParams(VALID_ID));
    const body = (await jsonBody(resp)) as {
      data: { checkpoint: { failedAgents: Array<Record<string, unknown>> } };
    };

    expect(body.data.checkpoint.failedAgents).toEqual([
      {
        agent: "financial-auditor",
        error: "timeout with [redacted-token]",
        retries: 2,
      },
    ]);
    expect(JSON.stringify(body)).not.toContain("SHOULD_NOT_LEAK");
  });

  it("respects ?limit query parameter (max 500)", async () => {
    await GET(makeRequest("50"), asParams(VALID_ID));
    expect(mocks.llmFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 })
    );

    mocks.llmFindMany.mockClear();
    await GET(makeRequest("9999"), asParams(VALID_ID));
    // Zod max(500) → ZodError → handleApiError 500.
    // We just assert no crash on this edge: handleApiError handles it cleanly.
    expect(mocks.handleApiError).toHaveBeenCalled();
  });
});
