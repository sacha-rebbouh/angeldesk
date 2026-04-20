import { beforeEach, describe, expect, it, vi } from "vitest";

const dealId = "ck12345678901234567890123";

const mocks = vi.hoisted(() => ({
  authenticateApiRequest: vi.fn(),
  dealFindFirst: vi.fn(),
  dealUpdate: vi.fn(),
  apiSuccess: vi.fn(),
  apiError: vi.fn(),
  handleApiError: vi.fn(),
  createApiTimer: vi.fn(),
  loadCanonicalDealSignals: vi.fn(),
  getCurrentFactString: vi.fn(),
  getCurrentFactNumber: vi.fn(),
  resolveCanonicalAnalysisScores: vi.fn(),
  factFindFirst: vi.fn(),
  factUpdate: vi.fn(),
  factCreate: vi.fn(),
  transaction: vi.fn(),
  refreshCurrentFactsView: vi.fn(),
}));

vi.mock("../../../middleware", () => ({
  authenticateApiRequest: mocks.authenticateApiRequest,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: {
      findFirst: mocks.dealFindFirst,
      update: mocks.dealUpdate,
      delete: vi.fn(),
    },
    factEvent: {
      findFirst: mocks.factFindFirst,
      update: mocks.factUpdate,
      create: mocks.factCreate,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/api-key-auth", () => ({
  apiSuccess: mocks.apiSuccess,
  apiError: mocks.apiError,
}));

vi.mock("@/lib/api-error", () => ({
  handleApiError: mocks.handleApiError,
}));

vi.mock("@/lib/api-logger", () => ({
  createApiTimer: mocks.createApiTimer,
}));

vi.mock("@/services/deals/canonical-read-model", () => ({
  loadCanonicalDealSignals: mocks.loadCanonicalDealSignals,
  getCurrentFactString: mocks.getCurrentFactString,
  getCurrentFactNumber: mocks.getCurrentFactNumber,
  resolveCanonicalAnalysisScores: mocks.resolveCanonicalAnalysisScores,
}));

vi.mock("@/services/fact-store/current-facts", () => ({
  refreshCurrentFactsView: mocks.refreshCurrentFactsView,
}));

const timer = {
  setContext: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
};

const successResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data, meta: {} }), {
    status,
    headers: { "content-type": "application/json" },
  });

const errorResponse = (code: string, message: string, status: number) =>
  new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "content-type": "application/json" },
  });

const { GET, PATCH } = await import("../route");

describe("GET /api/v1/deals/[dealId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateApiRequest.mockResolvedValue({ userId: "user_1", keyId: "key_1" });
    mocks.apiSuccess.mockImplementation(successResponse);
    mocks.apiError.mockImplementation(errorResponse);
    mocks.handleApiError.mockImplementation((error: unknown) =>
      errorResponse("INTERNAL_ERROR", error instanceof Error ? error.message : "unknown", 500)
    );
    mocks.createApiTimer.mockReturnValue(timer);
    mocks.dealUpdate.mockResolvedValue({
      id: dealId,
      valuationPre: 1_500_000,
      arr: 1_000,
    });
    mocks.factFindFirst.mockResolvedValue(null);
    mocks.factUpdate.mockResolvedValue(undefined);
    mocks.factCreate.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      await fn({
        deal: { update: mocks.dealUpdate },
        factEvent: {
          findFirst: mocks.factFindFirst,
          update: mocks.factUpdate,
          create: mocks.factCreate,
        },
      })
    );
    mocks.refreshCurrentFactsView.mockResolvedValue(undefined);
    mocks.dealFindFirst.mockResolvedValue({
      id: dealId,
      userId: "user_1",
      name: "Legacy Deal",
      companyName: "Legacy Company",
      website: "https://legacy.example",
      arr: 1000,
      growthRate: 12,
      amountRequested: 100000,
      valuationPre: 1500000,
      globalScore: 11,
      teamScore: 12,
      marketScore: 13,
      productScore: 14,
      financialsScore: 15,
      founders: [],
      documents: [],
      redFlags: [],
    });
    mocks.loadCanonicalDealSignals.mockResolvedValue({
      factMapByDealId: new Map([[dealId, new Map()]]),
    });
    mocks.getCurrentFactString
      .mockReturnValueOnce("Canonical Co")
      .mockReturnValueOnce("https://canonical.example");
    mocks.getCurrentFactNumber
      .mockReturnValueOnce(9_000_000)
      .mockReturnValueOnce(1_200_000)
      .mockReturnValueOnce(250_000)
      .mockReturnValueOnce(88);
    mocks.resolveCanonicalAnalysisScores.mockReturnValue({
      globalScore: 91,
      teamScore: 83,
      marketScore: 79,
      productScore: 77,
      financialsScore: 75,
    });
  });

  it("returns canonicalized detail fields for the deal", async () => {
    const response = await GET(
      new Request(`http://localhost/api/v1/deals/${dealId}`) as never,
      { params: Promise.resolve({ dealId }) }
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      id: dealId,
      companyName: "Canonical Co",
      website: "https://canonical.example",
      valuationPre: 9_000_000,
      arr: 1_200_000,
      amountRequested: 250_000,
      growthRate: 88,
      globalScore: 91,
      teamScore: 83,
      marketScore: 79,
      productScore: 77,
      financialsScore: 75,
    });
  });

  it("writes BA_OVERRIDE facts when the public v1 PATCH updates canonical fields", async () => {
    const response = await PATCH(
      new Request(`http://localhost/api/v1/deals/${dealId}`, {
        method: "PATCH",
        body: JSON.stringify({
          companyName: "Acme Corp",
          website: "https://acme.example",
          arr: 2500000,
        }),
        headers: { "content-type": "application/json" },
      }) as never,
      { params: Promise.resolve({ dealId }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.dealUpdate).toHaveBeenCalledWith({
      where: { id: dealId },
      data: expect.objectContaining({
        companyName: "Acme Corp",
        website: "https://acme.example",
        arr: 2500000,
      }),
    });
    expect(mocks.factCreate).toHaveBeenCalledTimes(3);
    expect(mocks.refreshCurrentFactsView).toHaveBeenCalled();
  });
});
