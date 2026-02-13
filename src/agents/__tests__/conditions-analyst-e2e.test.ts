/**
 * Conditions Analyst Agent — E2E Test
 *
 * Tests the conditions-analyst agent in both modes:
 * 1. Standalone mode (form data) — primary use case (BA saves conditions form)
 * 2. Pipeline mode — with Tier 1 agent results for cross-reference
 * 3. No conditions — returns fallback result with questions
 *
 * Uses the same mock pattern as sequential-pipeline.test.ts:
 * vi.mock on OpenRouter router, returning canned JSON matched by prompt keywords.
 */

import { describe, it, expect, vi } from "vitest";
import type { EnrichedAgentContext, ConditionsAnalystData } from "../types";

// ============================================================================
// MOCK: Conditions Analyst LLM Response
// ============================================================================

function buildConditionsAnalystMockResponse(): unknown {
  return {
    score: {
      value: 68,
      breakdown: [
        { criterion: "Valorisation", weight: 0.35, score: 72, justification: "Valorisation a 10M pre-money au P60 du stage Seed SaaS. Premium justifie par la traction (ARR 600K, 180% YoY) mais un peu agressif." },
        { criterion: "Instrument", weight: 0.20, score: 80, justification: "BSA-AIR est l'instrument standard pour un Seed en France. Adequat." },
        { criterion: "Protections", weight: 0.25, score: 55, justification: "Pro-rata et information rights presents. Manque: anti-dilution, tag-along. Protections basiques seulement." },
        { criterion: "Gouvernance", weight: 0.20, score: 65, justification: "Vesting fondateurs en place (4 ans / 1 an cliff). ESOP a 10% correct. Pas de clauses toxiques." },
      ],
    },
    findings: {
      termsSource: "form",
      valuation: {
        assessedValue: 10000000,
        percentileVsDB: 62,
        verdict: "AGGRESSIVE",
        rationale: "La valorisation de 10M pre-money se situe au P62 pour un Seed SaaS en France. Le multiple implicite de 16.7x ARR est au-dessus de la mediane (12x) mais justifie partiellement par la croissance de 180% YoY.",
        benchmarkUsed: "Benchmarks statiques Carta/Eldorado 2024",
      },
      instrument: {
        type: "BSA-AIR",
        assessment: "STANDARD",
        rationale: "Le BSA-AIR est l'instrument standard pour un Seed en France. Verifier les conditions du cap et du discount.",
        stageAppropriate: true,
      },
      protections: {
        overallAssessment: "ADEQUATE",
        keyProtections: [
          { item: "Liquidation preference 1x non-participating", present: true, assessment: "Standard et correct" },
          { item: "Pro-rata rights", present: true, assessment: "Essentiel pour un BA — present" },
          { item: "Information rights", present: true, assessment: "Minimum vital — present" },
          { item: "Anti-dilution", present: false, assessment: "MANQUANT — demander weighted average broad-based" },
          { item: "Tag-along", present: false, assessment: "MANQUANT — risque d'etre bloque" },
        ],
        missingCritical: ["Anti-dilution (weighted average)", "Tag-along"],
      },
      governance: {
        vestingAssessment: "Vesting 4 ans / 1 an cliff en place. Standard et sain.",
        esopAssessment: "ESOP a 10% — correct pour un Seed. Verifier que le pool est cree pre-money.",
        overallAssessment: "ADEQUATE",
      },
      crossReferenceInsights: [
        { insight: "L'ARR de 600K validee par le financial-auditor confirme une traction reelle, justifiant partiellement le premium de valorisation.", sourceAgent: "financial-auditor", impact: "positive" },
        { insight: "Le churn mensuel de 3% signale par le saas-expert fragilise la justification de la valorisation elevee.", sourceAgent: "saas-expert", impact: "negative" },
      ],
      negotiationAdvice: [
        { point: "Negocier la valorisation a 8-9M pre-money", priority: "HIGH", suggestedArgument: "Le multiple de 16.7x ARR est au-dessus de la mediane Seed (12x). Avec un churn de 3%, viser 8-9M serait plus en ligne avec le marche.", leverageSource: "Benchmarks Carta 2024 + analyse financial-auditor" },
        { point: "Exiger une clause anti-dilution weighted average", priority: "HIGH", suggestedArgument: "Protection standard absente. Sans anti-dilution, un down round vous diluera de maniere disproportionnee.", leverageSource: "Pratiques standard France Angels / AFIC" },
        { point: "Ajouter un droit de tag-along", priority: "MEDIUM", suggestedArgument: "Sans tag-along, vous risquez d'etre bloque en tant que minoritaire si les fondateurs vendent.", leverageSource: "Best practices pacte d'associes" },
      ],
    },
    redFlags: [
      { id: "RF-CA-001", category: "protections", severity: "HIGH", title: "Anti-dilution absente", description: "Aucune clause anti-dilution n'est prevue. En cas de down round, l'investisseur sera dilue de maniere disproportionnee.", evidence: "Formulaire BA — champ anti-dilution non renseigne", impact: "Perte de valeur en cas de down round", question: "Quelle protection anti-dilution est prevue dans le pacte d'associes?" },
      { id: "RF-CA-002", category: "protections", severity: "MEDIUM", title: "Tag-along absent", description: "Pas de clause tag-along. Le BA pourrait etre bloque si les fondateurs vendent leurs parts.", evidence: "Formulaire BA — tag-along = NON", impact: "Illiquidite potentielle", question: "Pouvez-vous ajouter une clause tag-along au pacte?" },
    ],
    questions: [
      { id: "Q-CA-001", question: "Le pool ESOP de 10% est-il cree pre-money ou post-money?", priority: "HIGH", context: "Un ESOP post-money dilue davantage les investisseurs existants.", whatToLookFor: "ESOP pre-money est favorable aux investisseurs." },
      { id: "Q-CA-002", question: "Y a-t-il un cap et un discount sur le BSA-AIR?", priority: "MEDIUM", context: "Le BSA-AIR sans cap expose l'investisseur a une conversion a valorisation illimitee.", whatToLookFor: "Cap a la valorisation pre-money + discount 15-20%." },
    ],
    narrative: {
      oneLiner: "Conditions correctes mais valorisation agressive et protections a completer.",
      summary: "Les conditions du deal sont globalement standard pour un Seed SaaS en France. Le BSA-AIR est l'instrument adequat. La valorisation de 10M pre-money est au P62, un peu agressive mais partiellement justifiee par la traction. Les protections sont basiques: pro-rata et info rights presents, mais anti-dilution et tag-along manquants.",
      keyInsights: [
        "Valorisation au P62 — un peu agressive pour le stage",
        "Instrument BSA-AIR standard et adapte",
        "Protections incompletes: anti-dilution et tag-along manquants",
        "Gouvernance saine: vesting 4/1, ESOP 10%",
      ],
      forNegotiation: [
        "Viser 8-9M pre-money (mediane = 4M, P75 = 6M)",
        "Exiger anti-dilution weighted average broad-based",
        "Ajouter tag-along au pacte",
      ],
    },
  };
}

function buildAgentMockResponse(prompt: string, systemPrompt?: string): unknown {
  const combined = `${systemPrompt ?? ""} ${prompt}`.toLowerCase();

  // Match conditions-analyst prompt patterns
  if (
    combined.includes("conditions analyst") ||
    combined.includes("conditions d'investissement") ||
    combined.includes("valorisation") && combined.includes("instrument") && combined.includes("protections")
  ) {
    return buildConditionsAnalystMockResponse();
  }

  // Fallback
  console.warn(`[MOCK] Unmatched prompt. First 200 chars: ${combined.substring(0, 200)}`);
  return buildConditionsAnalystMockResponse();
}

// ============================================================================
// MOCKS
// ============================================================================

vi.mock("@/services/openrouter/router", () => ({
  complete: vi.fn().mockResolvedValue({ content: "Mock response", cost: 0.001 }),
  completeJSON: vi.fn().mockImplementation(async (prompt: string, options?: { systemPrompt?: string }) => ({
    data: buildAgentMockResponse(prompt, options?.systemPrompt),
    cost: 0.001,
    usage: { inputTokens: 1000, outputTokens: 500 },
    raw: "{}",
  })),
  completeJSONWithFallback: vi.fn().mockImplementation(async (prompt: string, options?: { systemPrompt?: string }) => ({
    data: buildAgentMockResponse(prompt, options?.systemPrompt),
    cost: 0.001,
    usage: { inputTokens: 1000, outputTokens: 500 },
    raw: "{}",
  })),
  completeJSONStreaming: vi.fn().mockImplementation(async (prompt: string, options?: { systemPrompt?: string }) => ({
    data: buildAgentMockResponse(prompt, options?.systemPrompt),
    cost: 0.001,
    usage: { inputTokens: 1000, outputTokens: 500 },
    wasTruncated: false,
  })),
  stream: vi.fn().mockResolvedValue({ content: "Mock stream", cost: 0.001 }),
  setAgentContext: vi.fn(),
  setAnalysisContext: vi.fn(),
  getAgentContext: vi.fn().mockReturnValue(null),
  getAnalysisContext: vi.fn().mockReturnValue(null),
  selectModel: vi.fn().mockReturnValue("GEMINI_PRO"),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    analysis: { findFirst: vi.fn().mockResolvedValue(null) },
    deal: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn().mockResolvedValue({}) },
  },
}));

vi.mock("@/scoring/services/agent-score-calculator", () => ({
  calculateAgentScore: vi.fn().mockResolvedValue({
    score: 68,
    grade: "B",
    breakdown: [{ criterion: "test", weight: 100, score: 68, justification: "test" }],
    metrics: [],
    confidence: 70,
  }),
  normalizeMetricName: vi.fn((name: string) => name.toLowerCase().replace(/\s+/g, "_")),
  DECK_FORENSICS_CRITERIA: {},
  FINANCIAL_AUDITOR_CRITERIA: {},
  TEAM_INVESTIGATOR_CRITERIA: {},
  COMPETITIVE_INTEL_CRITERIA: {},
  MARKET_INTELLIGENCE_CRITERIA: {},
  LEGAL_REGULATORY_CRITERIA: {},
  TECH_OPS_DD_CRITERIA: {},
  TECH_STACK_DD_CRITERIA: {},
  CAP_TABLE_AUDITOR_CRITERIA: {},
  CUSTOMER_INTEL_CRITERIA: {},
  EXIT_STRATEGIST_CRITERIA: {},
  GTM_ANALYST_CRITERIA: {},
  QUESTION_MASTER_CRITERIA: {},
}));

vi.mock("@/scoring", () => ({
  benchmarkService: {
    getBenchmark: vi.fn().mockReturnValue({ p25: 10, median: 20, p75: 30, topDecile: 50 }),
    getPercentile: vi.fn().mockReturnValue(50),
    getSectorBenchmarks: vi.fn().mockReturnValue([]),
    lookup: vi.fn().mockResolvedValue({ p25: 2500000, median: 4000000, p75: 6000000, source: "mock" }),
  },
}));

vi.mock("@/services/benchmarks", () => ({
  getBenchmark: vi.fn().mockReturnValue({ p25: 2500000, median: 4000000, p75: 6000000, topDecile: 10000000, source: "mock" }),
  getBenchmarkFull: vi.fn().mockReturnValue({ metric: "valuation", stage: "Seed", p25: 2500000, median: 4000000, p75: 6000000, topDecile: 10000000, source: "mock", freshness: { status: "fresh", lastUpdated: new Date().toISOString() } }),
  getExitBenchmarkFull: vi.fn().mockReturnValue({ sectorMultiple: { min: 5, median: 8, max: 15 }, timeToExit: { min: 3, median: 5, max: 8 }, source: "mock" }),
  getTimeToLiquidity: vi.fn().mockReturnValue({ min: 3, median: 5, max: 8 }),
  calculateBATicketSize: vi.fn().mockReturnValue(100000),
  DEFAULT_BA_PREFERENCES: { typicalTicketPercent: 0.05, minTicket: 10000, maxTicket: 500000, preferredStages: ["SEED"], preferredSectors: ["SaaS"], riskTolerance: "moderate" },
}));

vi.mock("@/services/benchmarks/freshness-checker", () => ({
  checkBenchmarkFreshness: vi.fn().mockReturnValue({ status: "fresh", staleMetrics: [], lastUpdated: new Date().toISOString() }),
  formatFreshnessWarning: vi.fn().mockReturnValue(""),
}));

vi.mock("@/services/context-engine/geography-coverage", () => ({
  formatGeographyCoverageForPrompt: vi.fn().mockReturnValue("Europe coverage: Good"),
}));

vi.mock("@/agents/config/red-flag-thresholds", () => ({
  formatThresholdsForPrompt: vi.fn().mockReturnValue("Standard thresholds applied"),
}));

vi.mock("@/lib/sanitize", () => ({
  sanitizeForLLM: vi.fn((text: string) => text),
  sanitizeName: vi.fn((name: string) => name),
  PromptInjectionError: class PromptInjectionError extends Error {
    patterns: string[];
    constructor(message: string, patterns: string[]) {
      super(message);
      this.patterns = patterns;
    }
  },
}));

// ============================================================================
// TEST DATA
// ============================================================================

const mockDeal = {
  id: "test-deal-cond-001",
  name: "TestCo SaaS",
  tagline: "AI-powered B2B analytics",
  sector: "SaaS",
  stage: "SEED",
  amount: 2000000,
  valuation: 10000000,
  currency: "EUR",
  userId: "user-001",
  founderLinkedin: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockDealTerms = {
  valuationPre: 10000000,
  amountRaised: 2000000,
  dilutionPct: 16.7,
  instrumentType: "BSA-AIR",
  instrumentDetails: "Cap a 10M, discount 15%",
  liquidationPref: "1x non-participating",
  antiDilution: null,
  proRataRights: true,
  informationRights: true,
  boardSeat: null,
  founderVesting: true,
  vestingDurationMonths: 48,
  vestingCliffMonths: 12,
  esopPct: 10,
  dragAlong: null,
  tagAlong: false,
  ratchet: false,
  payToPlay: false,
  milestoneTranches: false,
  nonCompete: false,
  customConditions: null,
  notes: null,
};

const mockDocuments = [
  {
    id: "doc-001",
    type: "pitch_deck",
    name: "TestCo_Deck.pdf",
    extractedText: `TestCo - AI-Powered B2B Analytics Platform
Slide 7: Ask - 2M EUR at 10M pre-money valuation`,
  },
];

// Minimal Tier 1 results for pipeline mode testing
const mockTier1Results: Record<string, { agentName: string; success: boolean; executionTimeMs: number; cost: number; data: Record<string, unknown> }> = {
  "financial-auditor": {
    agentName: "financial-auditor",
    success: true,
    executionTimeMs: 3000,
    cost: 0.01,
    data: {
      score: { value: 65, grade: "B" },
      findings: {
        arrValidated: true,
        arrValue: 600000,
      },
      redFlags: [{ severity: "HIGH", title: "Churn 3% mensuel au-dessus de la mediane" }],
      narrative: { oneLiner: "Metriques SaaS solides, valorisation agressive." },
    },
  },
  "cap-table-auditor": {
    agentName: "cap-table-auditor",
    success: true,
    executionTimeMs: 2000,
    cost: 0.01,
    data: {
      score: { value: 70, grade: "B" },
      findings: { vestingInPlace: true, equitySplit: "Equal" },
      redFlags: [],
      narrative: { oneLiner: "Cap table propre, pas d'ESOP pre-round." },
    },
  },
  "team-investigator": {
    agentName: "team-investigator",
    success: true,
    executionTimeMs: 2500,
    cost: 0.01,
    data: {
      score: { value: 60, grade: "B" },
      findings: { founderCount: 3 },
      redFlags: [],
      narrative: { oneLiner: "Equipe competente, first-time founders." },
    },
  },
  "competitive-intel": {
    agentName: "competitive-intel",
    success: true,
    executionTimeMs: 2000,
    cost: 0.01,
    data: {
      score: { value: 55, grade: "C" },
      findings: { competitorCount: 5 },
      redFlags: [],
      narrative: { oneLiner: "Marche fragmente, pas de leader dominant." },
    },
  },
};

// ============================================================================
// TESTS
// ============================================================================

describe("Conditions Analyst — E2E Tests", () => {
  // ── Test 1: Standalone mode with form data (primary use case) ──
  it("Standalone mode: analyses form data and returns complete ConditionsAnalystData", async () => {
    const { ConditionsAnalystAgent } = await import("../tier3/conditions-analyst");
    const agent = new ConditionsAnalystAgent({ standaloneTimeoutMs: 50_000 });

    const context: EnrichedAgentContext = {
      dealId: mockDeal.id,
      deal: mockDeal as never,
      documents: mockDocuments,
      previousResults: {},
      dealTerms: mockDealTerms,
      conditionsAnalystMode: "standalone",
      conditionsAnalystSummary: "Dernier score 62/100. Valorisation agressive. Churn 3% a surveiller.",
    };

    const result = await agent.run(context);

    // Basic assertions
    expect(result.success).toBe(true);
    expect(result.agentName).toBe("conditions-analyst");
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.cost).toBeGreaterThanOrEqual(0);

    // Data structure
    expect("data" in result).toBe(true);
    const data = (result as { data: ConditionsAnalystData }).data;

    // Meta
    expect(data.meta.agentName).toBe("conditions-analyst");
    expect(data.meta.analysisDate).toBeDefined();
    expect(["complete", "partial", "minimal"]).toContain(data.meta.dataCompleteness);
    expect(data.meta.confidenceLevel).toBeGreaterThan(0);
    expect(data.meta.confidenceLevel).toBeLessThanOrEqual(100);

    // Score (0-100)
    expect(data.score.value).toBeGreaterThanOrEqual(0);
    expect(data.score.value).toBeLessThanOrEqual(100);
    expect(["A", "B", "C", "D", "F"]).toContain(data.score.grade);
    expect(data.score.breakdown).toHaveLength(4);
    for (const b of data.score.breakdown!) {
      expect(b.score).toBeGreaterThanOrEqual(0);
      expect(b.score).toBeLessThanOrEqual(100);
      expect(b.weight).toBeGreaterThan(0);
      expect(b.justification).toBeTruthy();
    }

    // Findings — termsSource
    expect(data.findings.termsSource).toBe("form");

    // Findings — valuation
    expect(data.findings.valuation).toBeDefined();
    expect(["UNDERVALUED", "FAIR", "AGGRESSIVE", "VERY_AGGRESSIVE"]).toContain(data.findings.valuation.verdict);

    // Findings — instrument
    expect(data.findings.instrument).toBeDefined();
    expect(["STANDARD", "FAVORABLE", "UNFAVORABLE", "TOXIC"]).toContain(data.findings.instrument.assessment);
    expect(typeof data.findings.instrument.stageAppropriate).toBe("boolean");

    // Findings — protections
    expect(data.findings.protections).toBeDefined();
    expect(["STRONG", "ADEQUATE", "WEAK", "NONE"]).toContain(data.findings.protections.overallAssessment);
    expect(Array.isArray(data.findings.protections.keyProtections)).toBe(true);

    // Findings — governance
    expect(data.findings.governance).toBeDefined();
    expect(["STRONG", "ADEQUATE", "WEAK", "CONCERNING"]).toContain(data.findings.governance.overallAssessment);

    // Findings — negotiation advice
    expect(Array.isArray(data.findings.negotiationAdvice)).toBe(true);
    for (const adv of data.findings.negotiationAdvice) {
      expect(["CRITICAL", "HIGH", "MEDIUM"]).toContain(adv.priority);
      expect(adv.point).toBeTruthy();
      expect(adv.suggestedArgument).toBeTruthy();
    }

    // Red flags
    expect(Array.isArray(data.redFlags)).toBe(true);
    for (const rf of data.redFlags) {
      expect(["CRITICAL", "HIGH", "MEDIUM"]).toContain(rf.severity);
      expect(rf.title).toBeTruthy();
      expect(rf.description).toBeTruthy();
    }

    // Questions
    expect(Array.isArray(data.questions)).toBe(true);

    // Alert signal
    expect(data.alertSignal).toBeDefined();
    expect(typeof data.alertSignal.hasBlocker).toBe("boolean");
    expect(["PROCEED", "PROCEED_WITH_CAUTION", "INVESTIGATE_FURTHER", "DO_NOT_INVEST"]).toContain(data.alertSignal.recommendation);

    // Narrative
    expect(data.narrative.oneLiner).toBeTruthy();
    expect(data.narrative.summary).toBeTruthy();
    expect(Array.isArray(data.narrative.keyInsights)).toBe(true);
    expect(Array.isArray(data.narrative.forNegotiation)).toBe(true);

    console.log(`[Standalone] Score: ${data.score.value}/100 (${data.score.grade})`);
    console.log(`[Standalone] Source: ${data.findings.termsSource}`);
    console.log(`[Standalone] Valuation verdict: ${data.findings.valuation.verdict}`);
    console.log(`[Standalone] Instrument: ${data.findings.instrument.type} (${data.findings.instrument.assessment})`);
    console.log(`[Standalone] Protections: ${data.findings.protections.overallAssessment}`);
    console.log(`[Standalone] Red flags: ${data.redFlags.length}`);
    console.log(`[Standalone] Negotiation advice: ${data.findings.negotiationAdvice.length} points`);
    console.log(`[Standalone] Confidence: ${data.meta.confidenceLevel}%`);
  });

  // ── Test 2: Pipeline mode with Tier 1 results ──
  it("Pipeline mode: cross-references with Tier 1 agents and produces richer insights", async () => {
    const { ConditionsAnalystAgent } = await import("../tier3/conditions-analyst");
    const agent = new ConditionsAnalystAgent();

    const context: EnrichedAgentContext = {
      dealId: mockDeal.id,
      deal: mockDeal as never,
      documents: mockDocuments,
      previousResults: { ...mockTier1Results },
      dealTerms: mockDealTerms,
      conditionsAnalystMode: "pipeline",
    };

    const result = await agent.run(context);

    expect(result.success).toBe(true);
    expect(result.agentName).toBe("conditions-analyst");

    const data = (result as { data: ConditionsAnalystData }).data;

    // Score structure
    expect(data.score.value).toBeGreaterThanOrEqual(0);
    expect(data.score.value).toBeLessThanOrEqual(100);
    expect(data.score.breakdown).toHaveLength(4);

    // In pipeline mode, cross-reference insights should be populated
    expect(Array.isArray(data.findings.crossReferenceInsights)).toBe(true);
    for (const insight of data.findings.crossReferenceInsights) {
      expect(["positive", "negative", "neutral"]).toContain(insight.impact);
      expect(insight.sourceAgent).toBeTruthy();
    }

    // Pipeline mode should have higher confidence (more context)
    expect(data.meta.confidenceLevel).toBeGreaterThan(0);

    // Limitations should not mention "standalone"
    const hasStandaloneLimitation = data.meta.limitations?.some(l => l.toLowerCase().includes("standalone"));
    expect(hasStandaloneLimitation).toBe(false);

    console.log(`[Pipeline] Score: ${data.score.value}/100 (${data.score.grade})`);
    console.log(`[Pipeline] Cross-reference insights: ${data.findings.crossReferenceInsights.length}`);
    console.log(`[Pipeline] Confidence: ${data.meta.confidenceLevel}%`);
  });

  // ── Test 3: No conditions data — returns fallback result ──
  it("No conditions: returns score=0, isFallback=true, and generates priority questions", async () => {
    const { ConditionsAnalystAgent } = await import("../tier3/conditions-analyst");
    const agent = new ConditionsAnalystAgent();

    const context: EnrichedAgentContext = {
      dealId: mockDeal.id,
      deal: { ...mockDeal, valuation: null } as never,
      documents: [
        {
          id: "doc-001",
          type: "pitch_deck",
          name: "TestCo_Deck.pdf",
          extractedText: "TestCo - AI Analytics. Team: 3 cofounders. MRR: 50K.",
        },
      ],
      previousResults: {},
      dealTerms: null, // No terms filled
      conditionsAnalystMode: "standalone",
    };

    const result = await agent.run(context);

    expect(result.success).toBe(true);
    expect(result.agentName).toBe("conditions-analyst");

    const data = (result as { data: ConditionsAnalystData }).data;

    // Score should be 0 with isFallback
    expect(data.score.value).toBe(0);
    expect(data.score.grade).toBe("F");
    expect(data.score.isFallback).toBe(true);

    // Source should be "none"
    expect(data.findings.termsSource).toBe("none");

    // Should have questions to ask the founder
    expect(data.questions.length).toBeGreaterThan(0);
    const hasCriticalQuestion = data.questions.some(q => q.priority === "CRITICAL");
    expect(hasCriticalQuestion).toBe(true);

    // Alert signal should recommend investigation
    expect(data.alertSignal.recommendation).toBe("INVESTIGATE_FURTHER");

    // Narrative should indicate no data
    expect(data.narrative.oneLiner.toLowerCase()).toContain("aucune");

    // No red flags expected (can't flag what doesn't exist)
    expect(data.redFlags).toHaveLength(0);

    // Meta confidence should be 0
    expect(data.meta.confidenceLevel).toBe(0);
    expect(data.meta.dataCompleteness).toBe("minimal");

    console.log(`[No conditions] Score: ${data.score.value}/100 (${data.score.grade}, fallback=${data.score.isFallback})`);
    console.log(`[No conditions] Questions: ${data.questions.length} (critical: ${hasCriticalQuestion})`);
    console.log(`[No conditions] Narrative: ${data.narrative.oneLiner}`);
  });

  // ── Test 4: Standalone timeout option ──
  it("Constructor accepts standaloneTimeoutMs option", async () => {
    const { ConditionsAnalystAgent } = await import("../tier3/conditions-analyst");

    const agentDefault = new ConditionsAnalystAgent();
    const agentStandalone = new ConditionsAnalystAgent({ standaloneTimeoutMs: 50_000 });

    // Both should be valid agent instances that can run
    const context: EnrichedAgentContext = {
      dealId: mockDeal.id,
      deal: mockDeal as never,
      documents: mockDocuments,
      previousResults: {},
      dealTerms: mockDealTerms,
      conditionsAnalystMode: "standalone",
    };

    const result1 = await agentDefault.run(context);
    const result2 = await agentStandalone.run(context);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
  });

  // ── Test 5: Score normalization and validation ──
  it("Output scores are clamped to 0-100 and grades are consistent", async () => {
    const { ConditionsAnalystAgent } = await import("../tier3/conditions-analyst");
    const agent = new ConditionsAnalystAgent();

    const context: EnrichedAgentContext = {
      dealId: mockDeal.id,
      deal: mockDeal as never,
      documents: mockDocuments,
      previousResults: {},
      dealTerms: mockDealTerms,
      conditionsAnalystMode: "standalone",
    };

    const result = await agent.run(context);
    const data = (result as { data: ConditionsAnalystData }).data;

    // Main score
    expect(data.score.value).toBeGreaterThanOrEqual(0);
    expect(data.score.value).toBeLessThanOrEqual(100);
    expect(Number.isInteger(data.score.value)).toBe(true);

    // Grade consistency
    const v = data.score.value;
    if (v >= 85) expect(data.score.grade).toBe("A");
    else if (v >= 70) expect(data.score.grade).toBe("B");
    else if (v >= 55) expect(data.score.grade).toBe("C");
    else if (v >= 40) expect(data.score.grade).toBe("D");
    else expect(data.score.grade).toBe("F");

    // Breakdown scores
    for (const b of data.score.breakdown!) {
      expect(b.score).toBeGreaterThanOrEqual(0);
      expect(b.score).toBeLessThanOrEqual(100);
      expect(Number.isInteger(b.score)).toBe(true);
    }

    // Severity validation on red flags
    const validSeverities = ["CRITICAL", "HIGH", "MEDIUM"];
    for (const rf of data.redFlags) {
      expect(validSeverities).toContain(rf.severity);
    }

    // Priority validation on negotiation advice
    for (const adv of data.findings.negotiationAdvice) {
      expect(validSeverities).toContain(adv.priority);
    }
  });

  // ── Test 6: Confidence assessment varies by mode and data quality ──
  it("Confidence is higher for form source + pipeline mode vs standalone with minimal data", async () => {
    const { ConditionsAnalystAgent } = await import("../tier3/conditions-analyst");

    // Full data + pipeline mode
    const agentPipeline = new ConditionsAnalystAgent();
    const pipelineCtx: EnrichedAgentContext = {
      dealId: mockDeal.id,
      deal: mockDeal as never,
      documents: mockDocuments,
      previousResults: { ...mockTier1Results },
      dealTerms: mockDealTerms,
      conditionsAnalystMode: "pipeline",
    };

    // Minimal data + standalone mode
    const agentStandalone = new ConditionsAnalystAgent({ standaloneTimeoutMs: 50_000 });
    const standaloneCtx: EnrichedAgentContext = {
      dealId: mockDeal.id,
      deal: mockDeal as never,
      documents: mockDocuments,
      previousResults: {},
      dealTerms: {
        ...mockDealTerms,
        liquidationPref: null,
        antiDilution: null,
        proRataRights: null,
        informationRights: null,
        founderVesting: null,
        tagAlong: null,
      },
      conditionsAnalystMode: "standalone",
    };

    const [resultPipeline, resultStandalone] = await Promise.all([
      agentPipeline.run(pipelineCtx),
      agentStandalone.run(standaloneCtx),
    ]);

    const dataPipeline = (resultPipeline as { data: ConditionsAnalystData }).data;
    const dataStandalone = (resultStandalone as { data: ConditionsAnalystData }).data;

    // Pipeline + full data should have higher confidence
    expect(dataPipeline.meta.confidenceLevel).toBeGreaterThan(dataStandalone.meta.confidenceLevel);

    console.log(`[Confidence] Pipeline full data: ${dataPipeline.meta.confidenceLevel}%`);
    console.log(`[Confidence] Standalone minimal: ${dataStandalone.meta.confidenceLevel}%`);
  });
});
