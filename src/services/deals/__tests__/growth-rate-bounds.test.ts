import { describe, expect, it } from "vitest";
import {
  GROWTH_RATE_MAX,
  GROWTH_RATE_MIN,
  isGrowthRateInRange,
} from "../growth-rate-bounds";

describe("growth-rate-bounds", () => {
  it("borne le plafond sur la colonne Decimal(7,2) et le plancher à -100", () => {
    expect(GROWTH_RATE_MAX).toBe(99999.99);
    expect(GROWTH_RATE_MIN).toBe(-100);
  });

  it("accepte les valeurs dans la plage, bornes incluses", () => {
    for (const v of [GROWTH_RATE_MIN, -50, 0, 12, 5000, GROWTH_RATE_MAX]) {
      expect(isGrowthRateInRange(v)).toBe(true);
    }
  });

  it("rejette hors plage (au-dessus du plafond colonne, sous le plancher)", () => {
    for (const v of [GROWTH_RATE_MAX + 0.01, 100000, 250000, GROWTH_RATE_MIN - 0.01, -150]) {
      expect(isGrowthRateInRange(v)).toBe(false);
    }
  });

  it("rejette les non-finis (NaN / Infinity) — garde la sérialisation/DB saine", () => {
    expect(isGrowthRateInRange(Number.NaN)).toBe(false);
    expect(isGrowthRateInRange(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isGrowthRateInRange(Number.NEGATIVE_INFINITY)).toBe(false);
  });
});
