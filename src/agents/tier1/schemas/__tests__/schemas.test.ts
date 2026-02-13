import { describe, it, expect } from "vitest";
import { FinancialAuditResponseSchema } from "../financial-auditor-schema";
import { DeckForensicsResponseSchema } from "../deck-forensics-schema";
import { TeamInvestigatorResponseSchema } from "../team-investigator-schema";
import { CompetitiveIntelResponseSchema } from "../competitive-intel-schema";
import { MarketIntelligenceResponseSchema } from "../market-intelligence-schema";
import { LegalRegulatoryResponseSchema } from "../legal-regulatory-schema";
import { TechOpsDDResponseSchema } from "../tech-ops-dd-schema";
import { TechStackDDResponseSchema } from "../tech-stack-dd-schema";
import { CapTableAuditorResponseSchema } from "../cap-table-auditor-schema";
import { CustomerIntelResponseSchema } from "../customer-intel-schema";
import { ExitStrategistResponseSchema } from "../exit-strategist-schema";
import { GTMAnalystResponseSchema } from "../gtm-analyst-schema";
import { QuestionMasterResponseSchema } from "../question-master-schema";

const baseMeta = {
  dataCompleteness: "complete" as const,
  confidenceLevel: 80,
  limitations: [],
};

const baseScore = {
  value: 72,
  breakdown: [
    { criterion: "Quality", weight: 50, score: 75, justification: "Good" },
    { criterion: "Risk", weight: 50, score: 70, justification: "Medium" },
  ],
};

const baseAlertSignal = {
  hasBlocker: false,
  recommendation: "PROCEED" as const,
  justification: "No blockers found",
};

const baseNarrative = {
  oneLiner: "Test one-liner",
  summary: "Test summary",
  keyInsights: ["Insight 1"],
  forNegotiation: ["Point 1"],
};

describe("Tier 1 Zod Schemas", () => {
  it("FinancialAuditResponseSchema validates minimal valid data", () => {
    const data = {
      meta: baseMeta,
      score: baseScore,
      findings: { metrics: [] },
      redFlags: [],
      questions: [],
      alertSignal: baseAlertSignal,
      narrative: baseNarrative,
    };
    const result = FinancialAuditResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("FinancialAuditResponseSchema rejects missing meta", () => {
    const data = {
      score: baseScore,
      findings: { metrics: [] },
      redFlags: [],
      questions: [],
      alertSignal: baseAlertSignal,
      narrative: baseNarrative,
    };
    const result = FinancialAuditResponseSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("DeckForensicsResponseSchema validates minimal data", () => {
    const data = {
      meta: baseMeta,
      score: baseScore,
      findings: {
        narrativeAnalysis: {
          storyCoherence: 75,
          credibilityAssessment: "Good",
          narrativeStrengths: [],
          narrativeWeaknesses: [],
          criticalMissingInfo: [],
        },
        claimVerification: [],
        inconsistencies: [],
        deckQuality: {
          professionalismScore: 80,
          completenessScore: 70,
          transparencyScore: 75,
          issues: [],
        },
      },
      redFlags: [],
      questions: [],
      alertSignal: baseAlertSignal,
      narrative: baseNarrative,
    };
    const result = DeckForensicsResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("TeamInvestigatorResponseSchema validates minimal data", () => {
    const data = {
      meta: baseMeta,
      score: baseScore,
      findings: { founders: [] },
      redFlags: [],
      questions: [],
      alertSignal: baseAlertSignal,
      narrative: baseNarrative,
    };
    const result = TeamInvestigatorResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("CompetitiveIntelResponseSchema validates minimal data", () => {
    const data = {
      meta: baseMeta,
      score: baseScore,
      findings: { competitors: [] },
      redFlags: [],
      questions: [],
      alertSignal: baseAlertSignal,
      narrative: baseNarrative,
    };
    const result = CompetitiveIntelResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("MarketIntelligenceResponseSchema validates minimal data", () => {
    const data = {
      meta: baseMeta,
      score: baseScore,
      findings: {},
      redFlags: [],
      questions: [],
      alertSignal: baseAlertSignal,
      narrative: baseNarrative,
    };
    const result = MarketIntelligenceResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("LegalRegulatoryResponseSchema validates minimal data", () => {
    const data = {
      meta: baseMeta,
      score: baseScore,
      findings: {
        structureAnalysis: {
          entityType: "SAS",
          jurisdiction: "France",
          appropriateness: "APPROPRIATE",
          concerns: [],
          recommendations: [],
          vestingInPlace: true,
          shareholderAgreement: "YES",
          shareholderConcerns: [],
        },
        compliance: [],
        ipStatus: null,
        regulatoryRisks: [],
      },
      redFlags: [],
      questions: [],
      alertSignal: baseAlertSignal,
      narrative: baseNarrative,
    };
    const result = LegalRegulatoryResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("TechOpsDDResponseSchema validates minimal data", () => {
    const data = {
      meta: baseMeta,
      score: baseScore,
      findings: {},
      redFlags: [],
      questions: [],
      alertSignal: baseAlertSignal,
      narrative: baseNarrative,
    };
    const result = TechOpsDDResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("TechStackDDResponseSchema validates minimal data", () => {
    const data = {
      meta: baseMeta,
      score: baseScore,
      findings: {},
      redFlags: [],
      questions: [],
      alertSignal: baseAlertSignal,
      narrative: baseNarrative,
    };
    const result = TechStackDDResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("CapTableAuditorResponseSchema validates minimal data", () => {
    const data = {
      meta: baseMeta,
      score: baseScore,
      findings: {
        dataAvailability: {
          capTableProvided: false,
          termSheetProvided: false,
          dataQuality: "MINIMAL",
          missingCriticalInfo: [],
          recommendation: "Request full cap table",
        },
      },
      redFlags: [],
      questions: [],
      alertSignal: baseAlertSignal,
      narrative: baseNarrative,
    };
    const result = CapTableAuditorResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("CustomerIntelResponseSchema validates minimal data", () => {
    const data = {
      meta: baseMeta,
      score: baseScore,
      findings: {
        icp: {
          description: "B2B SaaS",
          segments: ["Enterprise"],
          verticals: ["Tech"],
          companySize: "50-200",
          buyerPersona: "CTO",
          icpClarity: "CLEAR",
        },
        customerBase: null,
        retention: null,
        pmf: {
          pmfScore: 70,
          pmfVerdict: "EMERGING",
          pmfJustification: "Some positive signals",
          positiveSignals: [],
          negativeSignals: [],
          pmfTests: [],
        },
        concentration: null,
      },
      redFlags: [],
      questions: [],
      alertSignal: baseAlertSignal,
      narrative: baseNarrative,
    };
    const result = CustomerIntelResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("ExitStrategistResponseSchema validates minimal data", () => {
    const data = {
      meta: baseMeta,
      score: baseScore,
      findings: {
        scenarios: [],
        comparableExits: [],
        mnaMarket: null,
        liquidityAnalysis: null,
      },
      redFlags: [],
      questions: [],
      alertSignal: baseAlertSignal,
      narrative: baseNarrative,
    };
    const result = ExitStrategistResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("GTMAnalystResponseSchema validates minimal data", () => {
    const data = {
      meta: baseMeta,
      score: baseScore,
      findings: {
        channels: [],
        channelSummary: {
          primaryChannel: "Organic",
          channelDiversification: "MODERATE",
          diversificationRationale: "Only one channel active",
          overallChannelHealth: 70,
        },
        salesMotion: null,
      },
      redFlags: [],
      questions: [],
      alertSignal: baseAlertSignal,
      narrative: baseNarrative,
    };
    const result = GTMAnalystResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("QuestionMasterResponseSchema validates minimal data", () => {
    const data = {
      meta: baseMeta,
      score: baseScore,
      findings: {
        founderQuestions: [],
        referenceChecks: [],
        diligenceChecklist: {
          totalItems: 0,
          doneItems: 0,
          blockedItems: 0,
          criticalPathItems: 0,
          items: [],
        },
        negotiationPoints: [],
        dealbreakers: [],
      },
      alertSignal: baseAlertSignal,
      narrative: baseNarrative,
    };
    const result = QuestionMasterResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("schema rejects score outside 0-100 range", () => {
    const data = {
      meta: baseMeta,
      score: { ...baseScore, value: 150 },
      findings: { metrics: [] },
      redFlags: [],
      questions: [],
      alertSignal: baseAlertSignal,
      narrative: baseNarrative,
    };
    const result = FinancialAuditResponseSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("schema rejects negative confidenceLevel in meta", () => {
    const data = {
      meta: { ...baseMeta, confidenceLevel: -10 },
      score: baseScore,
      findings: { metrics: [] },
      redFlags: [],
      questions: [],
      alertSignal: baseAlertSignal,
      narrative: baseNarrative,
    };
    const result = FinancialAuditResponseSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});
