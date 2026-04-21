import { describe, it, expect } from "vitest";
import {
  worstVerdict,
  THESIS_VERDICT_ORDER,
  REBUTTAL_PER_DEAL_CAP,
  getFrameworkLensAvailability,
  isFrameworkLensEvaluated,
  isThesisAxisUnavailable,
} from "../types";

describe("worstVerdict", () => {
  it("returns vigilance for empty array (fallback)", () => {
    expect(worstVerdict([])).toBe("vigilance");
  });

  it("returns the only verdict for single-item array", () => {
    expect(worstVerdict(["very_favorable"])).toBe("very_favorable");
    expect(worstVerdict(["alert_dominant"])).toBe("alert_dominant");
  });

  it("picks the most severe verdict (worst-of-N)", () => {
    expect(worstVerdict(["very_favorable", "favorable"])).toBe("favorable");
    expect(worstVerdict(["very_favorable", "vigilance", "favorable"])).toBe("vigilance");
    expect(worstVerdict(["contrasted", "alert_dominant", "favorable"])).toBe("alert_dominant");
  });

  it("respects the THESIS_VERDICT_ORDER (left=best, right=worst)", () => {
    expect(THESIS_VERDICT_ORDER).toEqual([
      "very_favorable",
      "favorable",
      "contrasted",
      "vigilance",
      "alert_dominant",
    ]);
  });

  it("worst-of-3 doctrine: YC favorable + Thiel fragile + AD solide = fragile", () => {
    expect(worstVerdict(["favorable", "vigilance", "favorable"])).toBe("vigilance");
  });

  it("worst-of-3 doctrine: une lunette alert_dominant suffit a faire basculer", () => {
    expect(worstVerdict(["very_favorable", "very_favorable", "alert_dominant"])).toBe("alert_dominant");
  });
});

describe("REBUTTAL_PER_DEAL_CAP", () => {
  it("is set to 3 (anti-abus)", () => {
    expect(REBUTTAL_PER_DEAL_CAP).toBe(3);
  });
});

describe("framework degradation helpers", () => {
  it("defaults missing availability to evaluated for backward compatibility", () => {
    expect(getFrameworkLensAvailability({})).toBe("evaluated");
    expect(isFrameworkLensEvaluated({})).toBe(true);
  });

  it("marks degraded lenses as non-evaluated", () => {
    expect(isFrameworkLensEvaluated({ availability: "degraded_schema_recovered" })).toBe(false);
    expect(isFrameworkLensEvaluated({ availability: "degraded_chain_exhausted" })).toBe(false);
  });
});

describe("isThesisAxisUnavailable", () => {
  it("detects axes without any source framework", () => {
    expect(isThesisAxisUnavailable({ sourceFrameworks: [] })).toBe(true);
    expect(isThesisAxisUnavailable({ sourceFrameworks: ["angel-desk"] })).toBe(false);
  });
});
