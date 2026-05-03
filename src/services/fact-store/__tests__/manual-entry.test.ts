import { describe, expect, it } from "vitest";

import { validateTaxonomyFactInput } from "../manual-entry";

describe("validateTaxonomyFactInput", () => {
  it("canonicalizes legacy aliases onto the taxonomy key", () => {
    const result = validateTaxonomyFactInput({
      factKey: "competition.competitor_count",
      value: 3,
      displayValue: "3",
      source: "BA_OVERRIDE",
    });

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        factKey: "competition.competitors_count",
        category: "COMPETITION",
      }),
    });
  });

  it("rejects structured payloads on scalar taxonomy keys", () => {
    const result = validateTaxonomyFactInput({
      factKey: "market.tam",
      value: { validated: 123 },
      displayValue: "[object Object]",
      source: "BA_OVERRIDE",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("expects a scalar value");
    }
  });
});
