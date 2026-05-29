import { describe, it, expect } from "vitest";
import { severityRank } from "@/services/red-flag-dedup";

describe("severityRank", () => {
  it("orders CRITICAL > HIGH > MEDIUM > LOW", () => {
    expect(severityRank("CRITICAL")).toBeGreaterThan(severityRank("HIGH"));
    expect(severityRank("HIGH")).toBeGreaterThan(severityRank("MEDIUM"));
    expect(severityRank("MEDIUM")).toBeGreaterThan(severityRank("LOW"));
  });

  it("is case-insensitive", () => {
    expect(severityRank("critical")).toBe(severityRank("CRITICAL"));
    expect(severityRank("High")).toBe(severityRank("HIGH"));
  });

  it("treats unknown / empty / nullish severities as lowest (0)", () => {
    expect(severityRank(undefined)).toBe(0);
    expect(severityRank(null)).toBe(0);
    expect(severityRank("")).toBe(0);
    expect(severityRank("WHATEVER")).toBe(0);
  });

  it("sort-before-slice keeps the most severe flags (Famille 1 invariant)", () => {
    // Régression : un red flag CRITICAL émis en position profonde par un agent
    // doit survivre à un slice(0, N) une fois l'array trié par sévérité — c'est
    // exactement le bug de justesse que la Famille 1 corrige (feeds inter-agents).
    const flags = [
      { severity: "LOW", title: "l1" },
      { severity: "MEDIUM", title: "m1" },
      { severity: "LOW", title: "l2" },
      { severity: "MEDIUM", title: "m2" },
      { severity: "LOW", title: "l3" },
      { severity: "CRITICAL", title: "boom" }, // index 5 — droppé par slice(0,3) si non trié
      { severity: "HIGH", title: "h1" },
    ];

    const keptUnsorted = flags.slice(0, 3).map((f) => f.title);
    expect(keptUnsorted).not.toContain("boom"); // le bug

    const keptSorted = [...flags]
      .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
      .slice(0, 3)
      .map((f) => f.title);
    expect(keptSorted[0]).toBe("boom");
    expect(keptSorted).toContain("h1");
    expect(keptSorted).toContain("boom");
  });
});
