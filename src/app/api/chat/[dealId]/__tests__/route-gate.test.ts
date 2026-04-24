import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  verifyDealOwnership: vi.fn(),
  checkRateLimitDistributed: vi.fn(),
  assertDealCorpusReady: vi.fn(),
  createConversation: vi.fn(),
  addMessage: vi.fn(),
  getFullChatContext: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));

vi.mock("@/lib/sanitize", () => ({
  isValidCuid: vi.fn(() => true),
  CUID_PATTERN: /^c[a-z0-9]+$/,
  checkRateLimitDistributed: mocks.checkRateLimitDistributed,
}));

vi.mock("@/services/chat-context/conversation", () => ({
  createConversation: mocks.createConversation,
  getConversationsForDeal: vi.fn(),
  addMessage: mocks.addMessage,
  getConversation: vi.fn(),
  verifyDealOwnership: mocks.verifyDealOwnership,
  verifyConversationOwnershipWithDeal: vi.fn(),
  generateConversationTitle: vi.fn(() => "title"),
  getConversationHistoryForLLM: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/services/chat-context", () => ({
  getChatContext: vi.fn(),
  getFullChatContext: mocks.getFullChatContext,
}));

vi.mock("@/services/analysis-results/load-results", () => ({
  loadResults: vi.fn(),
}));

vi.mock("@/services/corpus", () => ({
  getCorpusSnapshotDocumentIds: vi.fn(),
}));

vi.mock("@/services/thesis", () => ({
  thesisService: { getLatest: vi.fn() },
}));

vi.mock("@/services/thesis/normalization", () => ({
  normalizeThesisEvaluation: vi.fn(),
}));

vi.mock("@/agents/chat", () => ({
  dealChatAgent: vi.fn(),
}));

vi.mock("@/services/deals/canonical-read-model", () => ({
  pickCanonicalAnalysis: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    chatConversation: { update: vi.fn() },
    thesis: { findFirst: vi.fn() },
    analysis: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("@/lib/api-error", () => ({
  handleApiError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

vi.mock("@/services/documents/readiness-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/documents/readiness-gate")>();
  return {
    ...actual,
    assertDealCorpusReady: mocks.assertDealCorpusReady,
  };
});

const { POST } = await import("../route");
const { CorpusNotReadyError } = await import("@/services/documents/readiness-gate");

function buildPostRequest(body: unknown) {
  return new NextRequest("http://localhost/api/chat/clmdeal00000000000000000", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat/[dealId] - ARC-LIGHT Phase 1 gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.checkRateLimitDistributed.mockResolvedValue({
      allowed: true,
      remaining: 10,
      resetIn: 0,
    });
    mocks.verifyDealOwnership.mockResolvedValue(true);
  });

  it("returns 409 with UNVERIFIED_ARTIFACT and never creates a conversation nor persists a message", async () => {
    mocks.assertDealCorpusReady.mockRejectedValue(
      new CorpusNotReadyError("UNVERIFIED_ARTIFACT", null)
    );

    const response = await POST(
      buildPostRequest({ message: "tell me about the deal" }),
      { params: Promise.resolve({ dealId: "clmdeal00000000000000000" }) }
    );

    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload.reasonCode).toBe("UNVERIFIED_ARTIFACT");
    expect(mocks.createConversation).not.toHaveBeenCalled();
    expect(mocks.addMessage).not.toHaveBeenCalled();
    expect(mocks.getFullChatContext).not.toHaveBeenCalled();
  });

  it("calls the gate with the deal id after ownership check", async () => {
    mocks.assertDealCorpusReady.mockRejectedValue(
      new CorpusNotReadyError("UNVERIFIED_ARTIFACT", null)
    );

    await POST(
      buildPostRequest({ message: "x" }),
      { params: Promise.resolve({ dealId: "clmdeal00000000000000000" }) }
    );

    expect(mocks.verifyDealOwnership).toHaveBeenCalled();
    expect(mocks.assertDealCorpusReady).toHaveBeenCalledWith("clmdeal00000000000000000");
    // Gate fires BEFORE the downstream side-effects.
    expect(mocks.createConversation).not.toHaveBeenCalled();
    expect(mocks.addMessage).not.toHaveBeenCalled();
  });
});
