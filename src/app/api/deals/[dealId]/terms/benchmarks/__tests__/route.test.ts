import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  dealFindFirst: vi.fn(),
  isValidCuid: vi.fn(),
  handleApiError: vi.fn(),
  getCurrentFactsFromView: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: {
      findFirst: mocks.dealFindFirst,
    },
  },
}));

vi.mock("@/lib/sanitize", () => ({
  isValidCuid: mocks.isValidCuid,
}));

vi.mock("@/lib/api-error", () => ({
  handleApiError: mocks.handleApiError,
}));

vi.mock("@/services/fact-store/current-facts", () => ({
  getCurrentFactsFromView: mocks.getCurrentFactsFromView,
}));

const { GET } = await import("../route");

describe("GET /api/deals/[dealId]/terms/benchmarks", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.isValidCuid.mockReturnValue(true);
    mocks.dealFindFirst.mockResolvedValue({
      id: "deal_1",
      stage: "seed",
      dealTerms: {
        valuationPre: 4_000_000,
        dilutionPct: 20,
        instrumentType: "Actions de preference",
        proRataRights: true,
        informationRights: true,
        tagAlong: true,
        liquidationPref: "1x",
        antiDilution: "broad-based",
        boardSeat: "observer",
        founderVesting: true,
        vestingDurationMonths: 48,
        esopPct: 12,
        dragAlong: true,
        ratchet: false,
        payToPlay: false,
      },
    });
    mocks.getCurrentFactsFromView.mockResolvedValue([
      {
        dealId: "deal_1",
        factKey: "product.stage",
        category: "PRODUCT",
        currentValue: "series_a",
        currentDisplayValue: "Series A",
        currentSource: "PITCH_DECK",
        currentConfidence: 90,
        isDisputed: false,
        eventHistory: [],
        firstSeenAt: new Date("2026-04-20T09:00:00Z"),
        lastUpdatedAt: new Date("2026-04-20T09:00:00Z"),
      },
    ]);
    mocks.handleApiError.mockImplementation((error: unknown) =>
      new Response(JSON.stringify({ error: error instanceof Error ? error.message : "unexpected" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      })
    );
  });

  it("uses the canonical stage fact when computing benchmark bands", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/deals/deal_1/terms/benchmarks"),
      { params: Promise.resolve({ dealId: "deal_1" }) }
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.stage).toBe("SERIES_A");
    expect(payload.instrument.standard).toBe("Actions de preference");
    expect(payload.protections.standard).toContain("Liquidation pref");
  });
});
