import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  userFindUnique: vi.fn(),
  dealFindMany: vi.fn(),
  userCreditBalanceFindUnique: vi.fn(),
  creditTransactionFindMany: vi.fn(),
  apiKeyFindMany: vi.fn(),
  thesisFindMany: vi.fn(),
  getCurrentFactsFromView: vi.fn(),
  handleApiError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
    deal: {
      findMany: mocks.dealFindMany,
    },
    userCreditBalance: {
      findUnique: mocks.userCreditBalanceFindUnique,
    },
    creditTransaction: {
      findMany: mocks.creditTransactionFindMany,
    },
    apiKey: {
      findMany: mocks.apiKeyFindMany,
    },
    thesis: {
      findMany: mocks.thesisFindMany,
    },
  },
}));

vi.mock("@/services/fact-store/current-facts", () => ({
  getCurrentFactsFromView: mocks.getCurrentFactsFromView,
}));

vi.mock("@/lib/api-error", () => ({
  handleApiError: mocks.handleApiError,
}));

const { GET } = await import("../route");

describe("GET /api/user/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.userFindUnique.mockResolvedValue({
      id: "user_1",
      email: "user@example.com",
      name: "User",
      image: null,
      investmentPreferences: null,
      createdAt: new Date("2026-04-01T10:00:00Z"),
      updatedAt: new Date("2026-04-20T10:00:00Z"),
    });
    mocks.userCreditBalanceFindUnique.mockResolvedValue(null);
    mocks.creditTransactionFindMany.mockResolvedValue([]);
    mocks.apiKeyFindMany.mockResolvedValue([]);
    mocks.handleApiError.mockImplementation((error: unknown) => {
      throw error;
    });
  });

  it("exports canonical deal metrics from current facts and the thesis-linked completed analysis", async () => {
    mocks.dealFindMany.mockResolvedValue([
      {
        id: "deal_1",
        name: "Legacy Deal",
        companyName: "Legacy Company",
        website: "https://legacy.example",
        description: "Desc",
        sector: "SaaS",
        stage: "Seed",
        instrument: "equity",
        geography: "FR",
        arr: 1000,
        growthRate: 15,
        amountRequested: 250000,
        valuationPre: 1500000,
        status: "IN_DD",
        createdAt: new Date("2026-04-10T10:00:00Z"),
        updatedAt: new Date("2026-04-20T10:00:00Z"),
        founders: [],
        documents: [],
        redFlags: [],
        analyses: [
          {
            id: "analysis_unrelated",
            type: "FULL_DD",
            mode: "full_analysis",
            status: "COMPLETED",
            thesisId: "thesis_old",
            thesisBypass: false,
            corpusSnapshotId: "snap_old",
            totalAgents: 12,
            completedAgents: 12,
            summary: "Unrelated",
            startedAt: new Date("2026-04-20T09:00:00Z"),
            completedAt: new Date("2026-04-20T10:00:00Z"),
            totalCost: 12.34,
            totalTimeMs: 1000,
            createdAt: new Date("2026-04-20T09:00:00Z"),
          },
          {
            id: "analysis_linked",
            type: "FULL_DD",
            mode: "full_analysis",
            status: "COMPLETED",
            thesisId: "thesis_active",
            thesisBypass: false,
            corpusSnapshotId: "snap_active",
            totalAgents: 12,
            completedAgents: 12,
            summary: "Linked",
            startedAt: new Date("2026-04-19T09:00:00Z"),
            completedAt: new Date("2026-04-19T10:00:00Z"),
            totalCost: 10,
            totalTimeMs: 900,
            createdAt: new Date("2026-04-19T09:00:00Z"),
          },
        ],
      },
    ] as never);
    mocks.thesisFindMany.mockResolvedValue([
      {
        id: "thesis_active",
        dealId: "deal_1",
        corpusSnapshotId: "snap_active",
      },
    ]);
    mocks.getCurrentFactsFromView.mockResolvedValue([
      {
        dealId: "deal_1",
        factKey: "company.name",
        category: "OTHER",
        currentValue: "Canonical Co",
        currentDisplayValue: "Canonical Co",
        currentSource: "PITCH_DECK",
        currentConfidence: 95,
        isDisputed: false,
        eventHistory: [],
        firstSeenAt: new Date("2026-04-19T10:00:00Z"),
        lastUpdatedAt: new Date("2026-04-19T10:00:00Z"),
      },
      {
        dealId: "deal_1",
        factKey: "other.website",
        category: "OTHER",
        currentValue: "https://canonical.example",
        currentDisplayValue: "https://canonical.example",
        currentSource: "CONTEXT_ENGINE",
        currentConfidence: 90,
        isDisputed: false,
        eventHistory: [],
        firstSeenAt: new Date("2026-04-19T10:00:00Z"),
        lastUpdatedAt: new Date("2026-04-19T10:00:00Z"),
      },
      {
        dealId: "deal_1",
        factKey: "financial.arr",
        category: "FINANCIAL",
        currentValue: 1200000,
        currentDisplayValue: "€1.2M",
        currentSource: "DATA_ROOM",
        currentConfidence: 97,
        isDisputed: false,
        eventHistory: [],
        firstSeenAt: new Date("2026-04-19T10:00:00Z"),
        lastUpdatedAt: new Date("2026-04-19T10:00:00Z"),
      },
      {
        dealId: "deal_1",
        factKey: "financial.revenue_growth_yoy",
        category: "FINANCIAL",
        currentValue: 88,
        currentDisplayValue: "88%",
        currentSource: "PITCH_DECK",
        currentConfidence: 91,
        isDisputed: false,
        eventHistory: [],
        firstSeenAt: new Date("2026-04-19T10:00:00Z"),
        lastUpdatedAt: new Date("2026-04-19T10:00:00Z"),
      },
    ]);
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload._meta.version).toBe("1.1");
    expect(payload.deals[0]).toMatchObject({
      id: "deal_1",
      companyName: "Canonical Co",
      website: "https://canonical.example",
      arr: 1200000,
      growthRate: 88,
      canonicalAnalysisId: "analysis_linked",
      canonicalThesisId: "thesis_active",
    });
    // Dé-scorisation : aucune note de deal restituée dans l'export RGPD.
    for (const field of [
      "globalScore",
      "teamScore",
      "marketScore",
      "productScore",
      "financialsScore",
      "fundamentalsScore",
      "conditionsScore",
    ]) {
      expect(payload.deals[0]).not.toHaveProperty(field);
    }
    for (const analysis of payload.deals[0].analyses) {
      expect(analysis).not.toHaveProperty("scores");
    }
  });
});
