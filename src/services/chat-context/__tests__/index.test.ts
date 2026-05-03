import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dealChatContext: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/services/fact-store/current-facts", () => ({
  getCurrentFactsFromView: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getCurrentFactsFromView } from "@/services/fact-store/current-facts";
import { getChatContext } from "../index";

describe("getChatContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rebuilds key facts from sanitized current facts instead of persisted keyFacts", async () => {
    vi.mocked(prisma.dealChatContext.findUnique).mockResolvedValue({
      dealId: "deal_1",
      keyFacts: [
        {
          factKey: "market.tam",
          displayValue: "[object Object]",
          confidence: 70,
          source: "PITCH_DECK",
          category: "MARKET",
          value: "[object Object]",
        },
      ],
      agentSummaries: {},
      redFlagsContext: [],
      extractedData: null,
      benchmarkData: null,
      comparableDeals: null,
      lastAnalysisId: "analysis_1",
    } as never);

    vi.mocked(getCurrentFactsFromView).mockResolvedValue([
      {
        dealId: "deal_1",
        factKey: "financial.arr",
        category: "FINANCIAL",
        currentValue: 1200000,
        currentDisplayValue: "€1.2M",
        currentSource: "DATA_ROOM",
        currentConfidence: 97,
        currentTruthConfidence: 97,
        isDisputed: false,
        eventHistory: [],
        firstSeenAt: new Date("2026-04-21T00:00:00Z"),
        lastUpdatedAt: new Date("2026-04-21T00:00:00Z"),
      },
    ] as never);

    const context = await getChatContext("deal_1");

    expect(context?.keyFacts).toEqual([
      {
        factKey: "financial.arr",
        value: 1200000,
        displayValue: "€1.2M",
        confidence: 97,
        source: "DATA_ROOM",
        category: "FINANCIAL",
      },
    ]);
  });
});
