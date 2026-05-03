import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  liveSessionFindFirst: vi.fn(),
  checkRateLimit: vi.fn(),
  assertDealCorpusReady: vi.fn(),
  generateDeltaReport: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    liveSession: { findFirst: mocks.liveSessionFindFirst },
  },
}));

vi.mock("@/lib/sanitize", () => ({
  isValidCuid: (v: string) => typeof v === "string" && v.length > 0,
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock("@/services/credits", () => ({
  deductCredits: vi.fn(),
  refundCredits: vi.fn(),
}));

vi.mock("@/lib/live/post-call-reanalyzer", () => ({
  triggerTargetedReanalysis: vi.fn(),
  generateDeltaReport: mocks.generateDeltaReport,
  identifyImpactedAgents: vi.fn(() => []),
}));

vi.mock("@/services/documents/readiness-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/documents/readiness-gate")>();
  return {
    ...actual,
    assertDealCorpusReady: mocks.assertDealCorpusReady,
  };
});

vi.mock("@/lib/api-error", () => ({
  handleApiError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

const { POST } = await import("../route");
const { CorpusNotReadyError } = await import("@/services/documents/readiness-gate");

function buildPostRequest(body: unknown) {
  return new Request("http://localhost/api/coaching/reanalyze", {
    method: "POST",
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

describe("POST /api/coaching/reanalyze - ARC-LIGHT gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.checkRateLimit.mockReturnValue({ allowed: true });
    mocks.liveSessionFindFirst.mockResolvedValue({
      id: "clmsess00000000000000000",
      userId: "user_1",
      status: "completed",
      dealId: "clmdeal00000000000000000",
    });
  });

  it("blocks delta mode on toxic corpus before generating delta report", async () => {
    mocks.assertDealCorpusReady.mockRejectedValue(
      new CorpusNotReadyError("UNVERIFIED_ARTIFACT", null)
    );

    const response = await POST(
      buildPostRequest({ sessionId: "clmsess00000000000000000", mode: "delta" })
    );

    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload.reasonCode).toBe("UNVERIFIED_ARTIFACT");
    expect(mocks.generateDeltaReport).not.toHaveBeenCalled();
  });

  it("blocks targeted mode BEFORE credit deduction on toxic corpus", async () => {
    mocks.assertDealCorpusReady.mockRejectedValue(
      new CorpusNotReadyError("UNVERIFIED_ARTIFACT", null)
    );

    const response = await POST(
      buildPostRequest({ sessionId: "clmsess00000000000000000", mode: "targeted" })
    );

    expect(response.status).toBe(409);
    expect(mocks.assertDealCorpusReady).toHaveBeenCalledWith("clmdeal00000000000000000");
  });
});
