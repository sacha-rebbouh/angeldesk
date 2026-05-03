import { describe, expect, it } from "vitest";

import { extractValidatedClaims } from "../finding-extractor";

describe("extractValidatedClaims", () => {
  it("uses canonical keys for team and competition validations", () => {
    const teamValidations = extractValidatedClaims(
      {
        success: true,
        agentName: "team-investigator",
        executionTimeMs: 1,
        cost: 0,
        data: {
          findings: {
            teamComposition: {
              teamSize: 12,
            },
          },
        },
      } as never,
      "team-investigator"
    );

    expect(teamValidations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          factKey: "team.size",
          correctedValue: 12,
        }),
      ])
    );

    const competitionValidations = extractValidatedClaims(
      {
        success: true,
        agentName: "competitive-intel",
        executionTimeMs: 1,
        cost: 0,
        data: {
          findings: {
            competitors: [{ name: "A" }, { name: "B" }, { name: "C" }],
          },
        },
      } as never,
      "competitive-intel"
    );

    expect(competitionValidations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          factKey: "competition.competitors_count",
          correctedValue: 3,
        }),
      ])
    );
  });

  it("extracts scalar validated market values instead of object payloads", () => {
    const validations = extractValidatedClaims(
      {
        success: true,
        agentName: "market-intelligence",
        executionTimeMs: 1,
        cost: 0,
        data: {
          findings: {
            marketSize: {
              tam: {
                claimed: 29_000_000_000,
                validated: 23_000_000_000,
                source: "Research",
                year: 2025,
                methodology: "top_down",
                confidence: "medium",
              },
              sam: {
                claimed: 4_200_000_000,
                validated: 1_850_000_000,
                source: "Research",
                calculation: "Bottom-up",
              },
              assessment: "reasonable",
            },
          },
        },
      } as never,
      "market-intelligence"
    );

    expect(validations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          factKey: "market.tam",
          correctedValue: 23_000_000_000,
          correctedDisplayValue: "23000000000",
        }),
        expect.objectContaining({
          factKey: "market.sam",
          correctedValue: 1_850_000_000,
          correctedDisplayValue: "1850000000",
        }),
      ])
    );
  });
});
