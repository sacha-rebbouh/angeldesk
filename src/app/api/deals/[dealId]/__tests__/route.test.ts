import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  isValidCuid: vi.fn(),
  dealFindFirst: vi.fn(),
  dealUpdate: vi.fn(),
  dealDelete: vi.fn(),
  transaction: vi.fn(),
  factEventFindFirst: vi.fn(),
  factEventUpdate: vi.fn(),
  factEventCreate: vi.fn(),
  handleApiError: vi.fn(),
  loadCanonicalDealSignals: vi.fn(),
  resolveCanonicalDealFields: vi.fn(),
  refreshCurrentFactsView: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/lib/sanitize", () => ({
  isValidCuid: mocks.isValidCuid,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    deal: {
      findFirst: mocks.dealFindFirst,
      update: mocks.dealUpdate,
      delete: mocks.dealDelete,
    },
    factEvent: {
      findFirst: mocks.factEventFindFirst,
      update: mocks.factEventUpdate,
      create: mocks.factEventCreate,
    },
  },
}));

vi.mock("@/lib/api-error", () => ({
  handleApiError: mocks.handleApiError,
}));

vi.mock("@/services/deals/canonical-read-model", () => ({
  loadCanonicalDealSignals: mocks.loadCanonicalDealSignals,
  resolveCanonicalDealFields: mocks.resolveCanonicalDealFields,
}));

vi.mock("@/services/fact-store/current-facts", () => ({
  refreshCurrentFactsView: mocks.refreshCurrentFactsView,
}));

const { GET, PATCH } = await import("../route");

describe("/api/deals/[dealId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.isValidCuid.mockReturnValue(true);
    mocks.handleApiError.mockImplementation((error: unknown) => {
      throw error;
    });
    mocks.loadCanonicalDealSignals.mockResolvedValue({
      factMapByDealId: new Map([["deal_1", new Map()]]),
    });
    mocks.resolveCanonicalDealFields.mockReturnValue({
      companyName: "Canonical Co",
      website: "https://canonical.example",
      amountRequested: 250_000,
      arr: 1_200_000,
      growthRate: 88,
      valuationPre: 9_000_000,
      sector: "Canonical Sector",
      stage: "SERIES_A",
      instrument: "SAFE",
      geography: "France",
      description: "Canonical tagline",
      globalScore: 91,
      teamScore: 83,
      marketScore: 79,
      productScore: 77,
      financialsScore: 75,
    });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        deal: {
          update: mocks.dealUpdate,
        },
        factEvent: {
          findFirst: mocks.factEventFindFirst,
          update: mocks.factEventUpdate,
          create: mocks.factEventCreate,
        },
      })
    );
    mocks.refreshCurrentFactsView.mockResolvedValue(undefined);
  });

  it("returns canonicalized detail data on GET", async () => {
    mocks.dealFindFirst.mockResolvedValue({
      id: "deal_1",
      userId: "user_1",
      companyName: "Legacy Company",
      website: "https://legacy.example",
      amountRequested: 100_000,
      arr: 1_000,
      growthRate: 12,
      valuationPre: 1_500_000,
      sector: "Legacy Sector",
      stage: "SEED",
      instrument: "EQUITY",
      geography: "Legacy Geography",
      description: "Legacy description",
      globalScore: 11,
      teamScore: 12,
      marketScore: 13,
      productScore: 14,
      financialsScore: 15,
      founders: [],
      documents: [],
      redFlags: [],
      analyses: [],
    });

    const response = await GET(new Request("http://localhost/api/deals/deal_1") as never, {
      params: Promise.resolve({ dealId: "deal_1" }),
    });

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      id: "deal_1",
      companyName: "Canonical Co",
      website: "https://canonical.example",
      amountRequested: 250_000,
      arr: 1_200_000,
      growthRate: 88,
      valuationPre: 9_000_000,
      sector: "Canonical Sector",
      stage: "SERIES_A",
      instrument: "SAFE",
      geography: "France",
      description: "Canonical tagline",
      globalScore: 91,
      teamScore: 83,
      marketScore: 79,
      productScore: 77,
      financialsScore: 75,
    });
  });

  it("returns canonicalized detail data after PATCH", async () => {
    mocks.dealFindFirst.mockResolvedValue({
      id: "deal_1",
      userId: "user_1",
    });
    mocks.dealUpdate.mockResolvedValue({
      id: "deal_1",
      userId: "user_1",
      companyName: "Legacy Company",
      website: "https://legacy.example",
      amountRequested: 100_000,
      arr: 1_000,
      growthRate: 12,
      valuationPre: 1_500_000,
      sector: "Legacy Sector",
      stage: "SEED",
      instrument: "EQUITY",
      geography: "Legacy Geography",
      description: "Legacy description",
      globalScore: 11,
      teamScore: 12,
      marketScore: 13,
      productScore: 14,
      financialsScore: 15,
      founders: [],
      documents: [],
      redFlags: [],
      analyses: [],
    });
    mocks.factEventFindFirst.mockResolvedValue(null);
    mocks.factEventCreate.mockResolvedValue({ id: "fact_1" });

    const response = await PATCH(
      new Request("http://localhost/api/deals/deal_1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arr: 2000 }),
      }) as never,
      { params: Promise.resolve({ dealId: "deal_1" }) }
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.dealUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "deal_1" },
        data: expect.objectContaining({ arr: 2000 }),
      })
    );
    expect(mocks.factEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dealId: "deal_1",
          factKey: "financial.arr",
          source: "BA_OVERRIDE",
          eventType: "CREATED",
          value: 2000,
        }),
      })
    );
    expect(mocks.refreshCurrentFactsView).toHaveBeenCalled();
    expect(payload.data).toMatchObject({
      id: "deal_1",
      companyName: "Canonical Co",
      arr: 1_200_000,
      stage: "SERIES_A",
    });
  });
});
