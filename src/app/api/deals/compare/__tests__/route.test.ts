import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Dé-scorisation : la route /api/deals/compare ne restitue plus aucune note de
// deal. Elle ne charge plus les analyses/thèses/résultats (qui ne servaient qu'à
// extraire les scores) — uniquement les métriques OBSERVABLES (valo/ARR/croissance
// via current facts, avec fallback sur les champs Deal) et le décompte de red flags.
const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  dealFindMany: vi.fn(),
  getCurrentFactsFromView: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: {
      findMany: mocks.dealFindMany,
    },
  },
}));

vi.mock("@/services/fact-store/current-facts", () => ({
  getCurrentFactsFromView: mocks.getCurrentFactsFromView,
}));

const { GET } = await import("../route");

const dealIdOne = "ck12345678901234567890123";
const dealIdTwo = "ck12345678901234567890124";

describe("GET /api/deals/compare (scoreless)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.dealFindMany.mockResolvedValue([
      {
        id: dealIdOne,
        name: "Deal 1",
        sector: "SaaS",
        stage: "Seed",
        valuationPre: 2_000_000,
        arr: 400_000,
        growthRate: 110,
        redFlags: [{ severity: "HIGH" }, { severity: "LOW" }],
      },
      {
        id: dealIdTwo,
        name: "Deal 2",
        sector: "Fintech",
        stage: "Series A",
        valuationPre: 8_000_000,
        arr: 900_000,
        growthRate: 70,
        redFlags: [],
      },
    ]);
    mocks.getCurrentFactsFromView.mockImplementation(async (dealId: string) => {
      if (dealId === dealIdOne) {
        return [
          {
            dealId,
            factKey: "financial.valuation_pre",
            category: "FINANCIAL",
            currentValue: 9_000_000,
            currentDisplayValue: "€9M",
            currentSource: "PITCH_DECK",
            currentConfidence: 90,
            isDisputed: false,
            eventHistory: [],
            firstSeenAt: new Date("2026-04-19T10:00:00Z"),
            lastUpdatedAt: new Date("2026-04-19T10:00:00Z"),
          },
          {
            dealId,
            factKey: "financial.arr",
            category: "FINANCIAL",
            currentValue: 1_200_000,
            currentDisplayValue: "€1.2M",
            currentSource: "DATA_ROOM",
            currentConfidence: 97,
            isDisputed: false,
            eventHistory: [],
            firstSeenAt: new Date("2026-04-19T10:00:00Z"),
            lastUpdatedAt: new Date("2026-04-19T10:00:00Z"),
          },
          {
            dealId,
            factKey: "financial.revenue_growth_yoy",
            category: "FINANCIAL",
            currentValue: 88,
            currentDisplayValue: "88%",
            currentSource: "PITCH_DECK",
            currentConfidence: 90,
            isDisputed: false,
            eventHistory: [],
            firstSeenAt: new Date("2026-04-19T10:00:00Z"),
            lastUpdatedAt: new Date("2026-04-19T10:00:00Z"),
          },
        ];
      }

      return [];
    });
  });

  it("returns observable comparison data and no score fields (current facts win over Deal columns)", async () => {
    const request = new NextRequest(
      `http://localhost/api/deals/compare?ids=${dealIdOne},${dealIdTwo}`
    );

    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    // Deal 1 : les current facts priment sur les colonnes Deal.
    expect(payload.data[0]).toMatchObject({
      id: dealIdOne,
      valuationPre: 9_000_000,
      arr: 1_200_000,
      growthRate: 88,
      redFlagCount: 2,
      criticalRedFlagCount: 1,
    });
    // Aucune note de deal restituée nulle part dans la réponse.
    for (const row of payload.data) {
      expect(row).not.toHaveProperty("globalScore");
      expect(row).not.toHaveProperty("teamScore");
      expect(row).not.toHaveProperty("marketScore");
      expect(row).not.toHaveProperty("productScore");
      expect(row).not.toHaveProperty("financialsScore");
    }
  });

  it("falls back to Deal observable fields when no current fact exists", async () => {
    const request = new NextRequest(
      `http://localhost/api/deals/compare?ids=${dealIdOne},${dealIdTwo}`
    );

    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data[1]).toMatchObject({
      id: dealIdTwo,
      valuationPre: 8_000_000,
      arr: 900_000,
      growthRate: 70,
      redFlagCount: 0,
      criticalRedFlagCount: 0,
    });
  });
});
