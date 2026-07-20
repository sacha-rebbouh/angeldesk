import { describe, expect, it } from "vitest";
import { hasKnownFundingDate } from "../connectors/seedtable";

describe("Seedtable funding dates", () => {
  it("excludes a startup without fundingDate instead of substituting today's date", () => {
    const startups = [
      { name: "Dated", fundingDate: "2025-03" },
      { name: "Undated", fundingDate: null },
    ];

    const output = startups
      .filter(hasKnownFundingDate)
      .map((startup) => ({ name: startup.name, fundingDate: startup.fundingDate }));

    expect(output).toEqual([{ name: "Dated", fundingDate: "2025-03" }]);
    expect(JSON.stringify(output)).not.toContain(new Date().toISOString().slice(0, 10));
  });
});
