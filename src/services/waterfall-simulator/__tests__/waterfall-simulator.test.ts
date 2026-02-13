import { describe, it, expect } from "vitest";
import { simulateWaterfall, type WaterfallInput } from "../../waterfall-simulator";

const baseInput: WaterfallInput = {
  exitValuation: 10_000_000,
  investors: [
    {
      name: "BA Solo",
      investedAmount: 100_000,
      ownershipPercent: 10,
      liquidationPreference: { multiple: 1, type: "non_participating" },
      isBA: true,
    },
  ],
  founders: [
    { name: "CEO", ownershipPercent: 50 },
    { name: "CTO", ownershipPercent: 30 },
  ],
  esopPercent: 10,
};

describe("simulateWaterfall", () => {
  it("returns one scenario per exit valuation", () => {
    const results = simulateWaterfall(baseInput, [5_000_000, 10_000_000, 50_000_000]);
    expect(results).toHaveLength(3);
  });

  it("distributes all exit proceeds", () => {
    const [scenario] = simulateWaterfall(baseInput, [10_000_000]);
    const totalDistributed = scenario.distributions.reduce((sum, d) => sum + d.amount, 0);
    // Allow small rounding error
    expect(Math.abs(totalDistributed - 10_000_000)).toBeLessThan(10);
  });

  it("calculates BA return correctly for non-participating preferred", () => {
    const [scenario] = simulateWaterfall(baseInput, [10_000_000]);
    expect(scenario.baReturn).not.toBeNull();
    // BA has 10% of 10M = 1M pro rata, vs 100K pref -> takes max = 1M
    expect(scenario.baReturn!.amount).toBeCloseTo(1_000_000, -2);
    expect(scenario.baReturn!.multiple).toBeCloseTo(10, 0);
  });

  it("handles participating preferred (double dip)", () => {
    const input: WaterfallInput = {
      ...baseInput,
      investors: [
        {
          name: "VC Fund",
          investedAmount: 500_000,
          ownershipPercent: 20,
          liquidationPreference: { multiple: 2, type: "participating" },
          isBA: false,
        },
        {
          name: "BA",
          investedAmount: 100_000,
          ownershipPercent: 10,
          liquidationPreference: { multiple: 1, type: "non_participating" },
          isBA: true,
        },
      ],
    };

    const [scenario] = simulateWaterfall(input, [10_000_000]);
    const vcDist = scenario.distributions.find(d => d.name === "VC Fund");
    expect(vcDist).toBeDefined();
    // VC gets 1M pref (2x) + 20% of remaining = more than just pref
    expect(vcDist!.amount).toBeGreaterThan(1_000_000);
    // multiple > 1 triggers warning
    expect(scenario.warnings.length).toBeGreaterThan(0);
  });

  it("handles capped participating preferred", () => {
    const input: WaterfallInput = {
      ...baseInput,
      investors: [
        {
          name: "Investor",
          investedAmount: 200_000,
          ownershipPercent: 15,
          liquidationPreference: { multiple: 1, type: "capped_participating", cap: 3 },
          isBA: false,
        },
      ],
    };

    const [scenario] = simulateWaterfall(input, [50_000_000]);
    const dist = scenario.distributions.find(d => d.name === "Investor");
    // Cap is 3x = 600K max
    expect(dist!.amount).toBeLessThanOrEqual(600_001);
  });

  it("handles zero exit (everything lost)", () => {
    const [scenario] = simulateWaterfall(baseInput, [0]);
    expect(scenario.exitValuation).toBe(0);
    for (const d of scenario.distributions) {
      expect(d.amount).toBe(0);
    }
  });

  it("handles exit below preference amount", () => {
    // Exit at 50K but preference is 100K
    const [scenario] = simulateWaterfall(baseInput, [50_000]);
    // BA with non-participating: gets max(pref, prorata) capped at remaining
    expect(scenario.baReturn!.amount).toBeLessThanOrEqual(50_000);
  });

  it("includes ESOP in distributions", () => {
    const [scenario] = simulateWaterfall(baseInput, [10_000_000]);
    const esop = scenario.distributions.find(d => d.role === "esop");
    expect(esop).toBeDefined();
    expect(esop!.amount).toBeGreaterThan(0);
  });
});
