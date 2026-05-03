import { describe, expect, it } from "vitest";

import {
  buildReliabilityFromValidation,
  computeTruthConfidence,
} from "../reliability";

describe("fact-store validation reliability helpers", () => {
  it("maps verified validations to VERIFIED reliability", () => {
    const reliability = buildReliabilityFromValidation({
      status: "VERIFIED",
      validatedBy: "deck-forensics",
      explanation: "Cross-checked against the deck and supporting appendix",
    });

    expect(reliability).toMatchObject({
      reliability: "VERIFIED",
      isProjection: false,
      verificationMethod: "deck-forensics",
    });
  });

  it("maps contradicted validations to ESTIMATED reliability", () => {
    const reliability = buildReliabilityFromValidation({
      status: "CONTRADICTED",
      validatedBy: "financial-auditor",
      explanation: "Recomputed from supporting schedules",
    });

    expect(reliability).toMatchObject({
      reliability: "ESTIMATED",
      isProjection: false,
      verificationMethod: "financial-auditor",
    });
  });

  it("computes truth confidence from reliability weight", () => {
    expect(computeTruthConfidence(90, "VERIFIED")).toBe(86);
    expect(computeTruthConfidence(90, "ESTIMATED")).toBe(36);
  });
});
