import { describe, expect, it } from "vitest";

import { isTransientInfraErrorMessage } from "@/lib/transient-errors";

describe("isTransientInfraErrorMessage (strict — pour la garde critique Phase A)", () => {
  it("classifies provider infra hiccups as transient", () => {
    for (const msg of [
      "empty_response: le modèle a renvoyé une réponse vide (0 caractère)",
      "Request timeout after 30000ms",
      "Agent timed out",
      "rate limit exceeded",
      "429 Too Many Requests",
      "503 Service Unavailable",
      "service unavailable",
      "500 Internal Server Error",
      "internal server error",
      "HTTP 500",
      "status 503",
      "error: 429",
      "502 Bad Gateway",
      "504 Gateway Timeout",
    ]) {
      expect(isTransientInfraErrorMessage(msg)).toBe(true);
    }
  });

  it("does NOT classify real analysis/code errors as transient (no masking)", () => {
    for (const msg of [
      "Zod validation failed: dimensionScores[0].score expected number",
      "Cannot read properties of undefined (reading 'extractedInfo')",
      "Deal not found",
      "Unsupported thesis narrative claims detected",
      "unknown error",
    ]) {
      expect(isTransientInfraErrorMessage(msg)).toBe(false);
    }
  });

  it("does NOT match a bare status number embedded in business content (decoys)", () => {
    for (const decoy of [
      "score 500 out of range",
      "valuation 5000000 EUR",
      "500 employees on the team",
      "ARR 503000 reported",
      "429 founders surveyed",
      "burn 500k/month",
    ]) {
      expect(isTransientInfraErrorMessage(decoy)).toBe(false);
    }
  });

  it("returns false for null / undefined / empty", () => {
    expect(isTransientInfraErrorMessage(null)).toBe(false);
    expect(isTransientInfraErrorMessage(undefined)).toBe(false);
    expect(isTransientInfraErrorMessage("")).toBe(false);
  });
});
