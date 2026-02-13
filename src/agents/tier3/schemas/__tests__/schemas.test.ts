import { describe, it, expect } from "vitest";
import { ContradictionDetectorResponseSchema } from "../contradiction-detector-schema";
import { SynthesisDealScorerResponseSchema } from "../synthesis-deal-scorer-schema";
import { DevilsAdvocateResponseSchema } from "../devils-advocate-schema";
import { ScenarioModelerResponseSchema } from "../scenario-modeler-schema";
import { MemoGeneratorResponseSchema } from "../memo-generator-schema";

const baseMeta = {
  dataCompleteness: "complete" as const,
  confidenceLevel: 80,
  limitations: [],
};

describe("Tier 3 Zod Schemas", () => {
  it("ContradictionDetectorResponseSchema validates valid data", () => {
    const data = {
      meta: baseMeta,
      contradictions: [
        {
          id: "c1",
          severity: "HIGH",
          type: "CROSS_AGENT",
          agent1: "financial-auditor",
          claim1: "ARR 500K",
          source1: "deck p3",
          agent2: "customer-intel",
          claim2: "ARR 300K",
          source2: "NRR calc",
          analysis: "Numbers don't match across agents",
          impact: "Scoring reliability",
          questionForFounder: "What is the actual ARR?",
        },
      ],
      summary: {
        totalContradictions: 1,
        criticalCount: 0,
        topRisks: ["ARR mismatch"],
        verdict: "Moderate contradictions found",
      },
    };
    expect(ContradictionDetectorResponseSchema.safeParse(data).success).toBe(true);
  });

  it("SynthesisDealScorerResponseSchema validates valid data", () => {
    const data = {
      meta: baseMeta,
      overallScore: 68,
      verdict: "CONDITIONAL_PASS",
      dimensionScores: [
        {
          dimension: "Team",
          score: 75,
          weight: 25,
          justification: "Strong team",
          keyFactors: ["Experienced CEO"],
        },
      ],
      investmentThesis: {
        summary: "Promising but risky",
        strengths: ["Experienced team"],
        weaknesses: ["High burn rate"],
        keyRisks: ["Cash runway"],
        keyOpportunities: ["Large market"],
      },
      recommendation: {
        action: "Invest with conditions",
        conditions: ["Verify ARR with bank statements"],
        nextSteps: ["Schedule founder call"],
      },
    };
    expect(SynthesisDealScorerResponseSchema.safeParse(data).success).toBe(true);
  });

  it("DevilsAdvocateResponseSchema validates valid data", () => {
    const data = {
      meta: baseMeta,
      challenges: [
        {
          id: "ch1",
          category: "FINANCIAL",
          severity: "HIGH",
          challenge: "Burn rate unsustainable",
          evidence: "12 months runway with 3x burn multiple",
          counterArgument: "Could be expected for growth stage",
          probabilityOfIssue: "70%",
          impact: "Could run out of cash in 8 months",
          questionForFounder: "What is your plan to reach profitability?",
        },
      ],
      blindSpots: [
        { area: "Regulatory", risk: "GDPR compliance unclear", whyMissed: "No legal docs provided" },
      ],
      overallAssessment: {
        verdict: "Significant concerns",
        topConcerns: ["Burn rate", "No moat"],
        recommendation: "Proceed with caution",
      },
    };
    expect(DevilsAdvocateResponseSchema.safeParse(data).success).toBe(true);
  });

  it("ScenarioModelerResponseSchema validates valid data", () => {
    const data = {
      meta: baseMeta,
      scenarios: [
        {
          id: "s1",
          name: "Bull case",
          type: "BULL",
          probability: 20,
          description: "Everything goes right",
          assumptions: ["ARR grows 3x/year"],
          timeline: "5 years",
          financialProjection: { exitValuation: 100_000_000 },
          investorReturn: { multiple: 10 },
          triggers: ["Product-market fit confirmed"],
          keyRisks: ["Competition increases"],
        },
      ],
      recommendation: {
        bestScenario: "s1",
        worstScenario: "s3",
        expectedValue: "3.5x",
        verdict: "Risk-adjusted return is acceptable",
      },
    };
    expect(ScenarioModelerResponseSchema.safeParse(data).success).toBe(true);
  });

  it("MemoGeneratorResponseSchema validates valid data", () => {
    const data = {
      meta: baseMeta,
      memo: {
        title: "Investment Memo - TechCo",
        executiveSummary: "TechCo is a SaaS startup...",
        sections: [
          {
            title: "Team Analysis",
            content: "The founding team has...",
            keyPoints: ["CEO has 10y experience", "CTO is missing"],
          },
        ],
        verdict: {
          recommendation: "CONDITIONAL_PASS",
          score: 68,
          conditions: ["Hire CTO", "Verify ARR"],
        },
      },
    };
    expect(MemoGeneratorResponseSchema.safeParse(data).success).toBe(true);
  });

  it("ScenarioModelerResponseSchema rejects invalid probability", () => {
    const data = {
      meta: baseMeta,
      scenarios: [
        {
          id: "s1",
          name: "Invalid",
          type: "BULL",
          probability: 150,
          description: "test",
          assumptions: [],
          timeline: "1y",
          financialProjection: {},
          investorReturn: {},
          triggers: [],
          keyRisks: [],
        },
      ],
      recommendation: { bestScenario: "s1", worstScenario: "s1", expectedValue: "0", verdict: "test" },
    };
    expect(ScenarioModelerResponseSchema.safeParse(data).success).toBe(false);
  });

  it("MemoGeneratorResponseSchema rejects score > 100", () => {
    const data = {
      meta: baseMeta,
      memo: {
        title: "Test",
        executiveSummary: "Test",
        sections: [],
        verdict: { recommendation: "PASS", score: 120, conditions: [] },
      },
    };
    expect(MemoGeneratorResponseSchema.safeParse(data).success).toBe(false);
  });
});
