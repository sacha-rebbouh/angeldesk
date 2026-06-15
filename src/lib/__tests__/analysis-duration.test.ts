import { describe, it, expect } from "vitest";

import { resolveAnalysisDurationMs } from "../analysis-duration";

describe("resolveAnalysisDurationMs — durée wall-clock préférée à totalTimeMs", () => {
  it("préfère le wall-clock (completedAt - startedAt) à totalTimeMs (bug stepwise)", () => {
    // Cas réel avekapeti : startedAt 14:03:14 → completedAt 14:43:45 = ~41 min,
    // alors que totalTimeMs = 5010 ms (dernière invocation Inngest) → afficherait « 0 min ».
    const started = new Date("2026-06-15T14:03:14.596Z");
    const completed = new Date("2026-06-15T14:43:45.590Z");
    const ms = resolveAnalysisDurationMs(started, completed, 5010);
    expect(ms).not.toBeNull();
    expect(Math.round(ms! / 60000)).toBe(41);
  });

  it("accepte les dates en string (ISO)", () => {
    const ms = resolveAnalysisDurationMs("2026-06-15T14:00:00.000Z", "2026-06-15T14:30:00.000Z", 3000);
    expect(ms).toBe(30 * 60000);
  });

  it("retombe sur totalTimeMs quand startedAt manque (analyse historique)", () => {
    expect(resolveAnalysisDurationMs(null, new Date("2026-06-15T14:30:00.000Z"), 120_000)).toBe(120_000);
    expect(resolveAnalysisDurationMs(undefined, undefined, 90_000)).toBe(90_000);
  });

  it("retombe sur totalTimeMs si l'intervalle est non positif (horloges incohérentes)", () => {
    const t = new Date("2026-06-15T14:30:00.000Z");
    expect(resolveAnalysisDurationMs(t, t, 7000)).toBe(7000); // end == start
    expect(resolveAnalysisDurationMs(new Date("2026-06-15T15:00:00.000Z"), t, 7000)).toBe(7000); // end < start
  });

  it("retourne null quand aucune source exploitable", () => {
    expect(resolveAnalysisDurationMs(null, null, null)).toBeNull();
    expect(resolveAnalysisDurationMs(null, null, 0)).toBeNull();
    expect(resolveAnalysisDurationMs(null, null, -5)).toBeNull();
  });
});
