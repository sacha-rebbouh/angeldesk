import { describe, expect, it } from "vitest";
import {
  formatCompetitiveLandscapeAmountsForPrompt,
  formatContextMoney,
  formatDealIntelligenceAmountsForPrompt,
} from "../money";
import type { CompetitiveLandscape, DealIntelligence } from "../types";

describe("formatContextMoney", () => {
  it("utilise les symboles des devises prises en charge", () => {
    expect(formatContextMoney(1_500_000, "EUR")).toBe("€1.5M");
    expect(formatContextMoney(1_500_000, "USD")).toBe("$1.5M");
    expect(formatContextMoney(1_500_000, "GBP")).toBe("£1.5M");
  });

  it("utilise le code ISO inconnu et explicite une devise absente", () => {
    expect(formatContextMoney(1_500_000, "CHF")).toBe("CHF 1.5M");
    expect(formatContextMoney(1_500_000)).toBe("1.5M (devise non précisée)");
  });

  it("annote aussi les sérialisations JSON de snapshots legacy", () => {
    const dealIntelligence = {
      similarDeals: [{ fundingAmount: 600_000_000 }],
      fundingContext: { totalDealsInPeriod: 1 },
    } as unknown as DealIntelligence;
    const landscape = {
      competitors: [{ totalFunding: 20_000_000, currency: "USD" }],
      competitiveAdvantages: [],
      competitiveRisks: [],
    } as unknown as CompetitiveLandscape;

    expect(JSON.stringify(formatDealIntelligenceAmountsForPrompt(dealIntelligence)))
      .toContain("600.0M (devise non précisée)");
    expect(JSON.stringify(formatCompetitiveLandscapeAmountsForPrompt(landscape)))
      .toContain("$20.0M");
  });
});
