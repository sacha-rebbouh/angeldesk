import { describe, it, expect } from "vitest";
import { detectFOMO } from "../../fomo-detector";

describe("detectFOMO", () => {
  it("detects no FOMO in clean text", () => {
    const result = detectFOMO("Our startup is building a SaaS for HR teams. We have 50 customers.");
    expect(result.detected).toBe(false);
    expect(result.overallRisk).toBe("NONE");
    expect(result.patterns).toHaveLength(0);
  });

  it("detects 'round ferme dans X jours' (FR)", () => {
    const result = detectFOMO("Le round ferme dans 5 jours, depêchez-vous.");
    expect(result.detected).toBe(true);
    expect(result.patterns.length).toBeGreaterThanOrEqual(1);
    expect(result.patterns[0].severity).toBe("HIGH");
  });

  it("detects 'last tickets available' (EN)", () => {
    const result = detectFOMO("Last tickets available for this round.");
    expect(result.detected).toBe(true);
    expect(result.patterns[0].severity).toBe("HIGH");
  });

  it("detects 'oversubscribed' as MEDIUM", () => {
    const result = detectFOMO("The round is oversubscribed by 2x.");
    expect(result.detected).toBe(true);
    expect(result.patterns[0].severity).toBe("MEDIUM");
  });

  it("detects 'first come first serve' as HIGH", () => {
    const result = detectFOMO("Allocation is first come first serve.");
    expect(result.detected).toBe(true);
    expect(result.patterns[0].severity).toBe("HIGH");
  });

  it("detects 'multiple term sheets'", () => {
    const result = detectFOMO("We have multiple term sheets on the table.");
    expect(result.detected).toBe(true);
  });

  it("returns HIGH overall risk for 2+ HIGH patterns", () => {
    const text = "Round ferme dans 3 jours. Derniers tickets disponibles. First come first serve.";
    const result = detectFOMO(text);
    expect(result.overallRisk).toBe("HIGH");
  });

  it("returns MEDIUM overall risk for 1 HIGH pattern", () => {
    const text = "Normal pitch deck. Round close in 10 days.";
    const result = detectFOMO(text);
    expect(result.overallRisk).toBe("MEDIUM");
  });

  it("returns LOW for MEDIUM-only patterns", () => {
    const text = "The round is sursouscrit.";
    const result = detectFOMO(text);
    expect(result.overallRisk).toBe("LOW");
  });

  it("captures excerpts with context around the match", () => {
    const text = "Our amazing startup. The round close in 5 days so hurry up. Thanks.";
    const result = detectFOMO(text);
    expect(result.patterns[0].excerpt.length).toBeGreaterThan(10);
  });
});
