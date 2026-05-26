import { describe, it, expect } from "vitest";
import { ContradictionDetectorResponseSchema } from "../contradiction-detector-schema";
import { ConditionsAnalystResponseSchema } from "../conditions-analyst-schema";
import { SynthesisDealScorerResponseSchema } from "../synthesis-deal-scorer-schema";
import { DevilsAdvocateResponseSchema } from "../devils-advocate-schema";
import { MemoGeneratorResponseSchema } from "../memo-generator-schema";

const baseMeta = {
  dataCompleteness: "complete" as const,
  confidenceLevel: 80,
  limitations: [],
};

describe("Tier 3 Zod Schemas", () => {
  it("ContradictionDetectorResponseSchema validates valid data (Phase A A4-bis — signalIntensity + signalContribution, D1)", () => {
    // Phase A slice A4-bis : contrat natif `signalIntensity` + `signalContribution`.
    // alertSignal.recommendation legacy non contractuel ici (dérivé runtime).
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
      signalIntensity: "elevated",
      signalContribution: { orientation: "contrasted", evidenceSolidity: null },
    };
    expect(ContradictionDetectorResponseSchema.safeParse(data).success).toBe(true);
  });

  it("ContradictionDetectorResponseSchema REJETTE alertSignal legacy AVEC payload natif valide (Phase A A4-bis, .strict())", () => {
    // Round 2 lesson : .strict() rejette tout champ supplémentaire (legacy
    // ou non). alertSignal n'est plus contractuel ici — dérivé runtime.
    const data = {
      meta: baseMeta,
      contradictions: [],
      summary: { totalContradictions: 0, criticalCount: 0, topRisks: [], verdict: "x" },
      signalIntensity: "low",
      signalContribution: { orientation: "favorable", evidenceSolidity: null },
      alertSignal: { hasBlocker: false, recommendation: "PROCEED", justification: "x" }, // legacy
    };
    expect(ContradictionDetectorResponseSchema.safeParse(data).success).toBe(false);
  });

  it("ConditionsAnalystResponseSchema validates valid data (Phase A A4-bis — signalIntensity + signalContribution, D1)", () => {
    // Round 2 Codex : test schema CA manquant ajouté.
    const data = {
      meta: baseMeta,
      score: { value: 70, breakdown: [] },
      findings: {
        termsSource: "form",
        valuation: { assessedValue: 5_000_000, percentileVsDB: 50, verdict: "FAIR", rationale: "x", benchmarkUsed: "x" },
        instrument: { type: "BSA-AIR", assessment: "STANDARD", rationale: "x", stageAppropriate: true },
        protections: { overallAssessment: "ADEQUATE", keyProtections: [], missingCritical: [] },
        governance: { vestingAssessment: "x", esopAssessment: "x", overallAssessment: "ADEQUATE" },
        crossReferenceInsights: [],
        negotiationAdvice: [],
        signalIntensity: "low",
        signalContribution: { orientation: "favorable", evidenceSolidity: null },
      },
      redFlags: [],
      questions: [],
      narrative: { oneLiner: "x", summary: "x", keyInsights: [], forNegotiation: [] },
    };
    expect(ConditionsAnalystResponseSchema.safeParse(data).success).toBe(true);
  });

  it("ConditionsAnalystResponseSchema REJETTE alertSignal legacy AVEC payload natif valide (Phase A A4-bis, .strict())", () => {
    // Round 2 Codex : alertSignal n'est PLUS dans le contrat schema CA.
    // Avec .strict() top-level, l'injecter en plus du payload natif valide
    // doit échouer.
    const data = {
      meta: baseMeta,
      score: { value: 70, breakdown: [] },
      findings: {
        termsSource: "form",
        valuation: { assessedValue: 5_000_000, percentileVsDB: 50, verdict: "FAIR", rationale: "x", benchmarkUsed: "x" },
        instrument: { type: "BSA-AIR", assessment: "STANDARD", rationale: "x", stageAppropriate: true },
        protections: { overallAssessment: "ADEQUATE", keyProtections: [], missingCritical: [] },
        governance: { vestingAssessment: "x", esopAssessment: "x", overallAssessment: "ADEQUATE" },
        crossReferenceInsights: [],
        negotiationAdvice: [],
        signalIntensity: "low",
        signalContribution: { orientation: "favorable", evidenceSolidity: null },
      },
      redFlags: [],
      questions: [],
      narrative: { oneLiner: "x", summary: "x", keyInsights: [], forNegotiation: [] },
      alertSignal: { hasBlocker: false, recommendation: "PROCEED", justification: "x" }, // legacy
    };
    expect(ConditionsAnalystResponseSchema.safeParse(data).success).toBe(false);
  });

  it("ConditionsAnalystResponseSchema REJETTE signalIntensity invalide (Phase A A4-bis)", () => {
    for (const invalid of ["INVESTIGATE_FURTHER", "PROCEED", "STOP", "high_priority", null]) {
      const data = {
        meta: baseMeta,
        score: { value: 70, breakdown: [] },
        findings: {
          termsSource: "form",
          valuation: { assessedValue: 5_000_000, percentileVsDB: 50, verdict: "FAIR", rationale: "x", benchmarkUsed: "x" },
          instrument: { type: "BSA-AIR", assessment: "STANDARD", rationale: "x", stageAppropriate: true },
          protections: { overallAssessment: "ADEQUATE", keyProtections: [], missingCritical: [] },
          governance: { vestingAssessment: "x", esopAssessment: "x", overallAssessment: "ADEQUATE" },
          crossReferenceInsights: [],
          negotiationAdvice: [],
          signalIntensity: invalid,
          signalContribution: { orientation: "favorable", evidenceSolidity: null },
        },
        redFlags: [],
        questions: [],
        narrative: { oneLiner: "x", summary: "x", keyInsights: [], forNegotiation: [] },
      };
      expect(ConditionsAnalystResponseSchema.safeParse(data).success).toBe(false);
    }
  });

  it("ConditionsAnalystResponseSchema REJETTE signalContribution invalide (orientation hors enum)", () => {
    const data = {
      meta: baseMeta,
      score: { value: 70, breakdown: [] },
      findings: {
        termsSource: "form",
        valuation: { assessedValue: 5_000_000, percentileVsDB: 50, verdict: "FAIR", rationale: "x", benchmarkUsed: "x" },
        instrument: { type: "BSA-AIR", assessment: "STANDARD", rationale: "x", stageAppropriate: true },
        protections: { overallAssessment: "ADEQUATE", keyProtections: [], missingCritical: [] },
        governance: { vestingAssessment: "x", esopAssessment: "x", overallAssessment: "ADEQUATE" },
        crossReferenceInsights: [],
        negotiationAdvice: [],
        signalIntensity: "low",
        signalContribution: { orientation: "STRONG_PASS", evidenceSolidity: null }, // legacy enum
      },
      redFlags: [],
      questions: [],
      narrative: { oneLiner: "x", summary: "x", keyInsights: [], forNegotiation: [] },
    };
    expect(ConditionsAnalystResponseSchema.safeParse(data).success).toBe(false);
  });

  it("ConditionsAnalystResponseSchema REJETTE signalContribution manquant (champ requis)", () => {
    const data = {
      meta: baseMeta,
      score: { value: 70, breakdown: [] },
      findings: {
        termsSource: "form",
        valuation: { assessedValue: 5_000_000, percentileVsDB: 50, verdict: "FAIR", rationale: "x", benchmarkUsed: "x" },
        instrument: { type: "BSA-AIR", assessment: "STANDARD", rationale: "x", stageAppropriate: true },
        protections: { overallAssessment: "ADEQUATE", keyProtections: [], missingCritical: [] },
        governance: { vestingAssessment: "x", esopAssessment: "x", overallAssessment: "ADEQUATE" },
        crossReferenceInsights: [],
        negotiationAdvice: [],
        signalIntensity: "low",
        // signalContribution missing
      },
      redFlags: [],
      questions: [],
      narrative: { oneLiner: "x", summary: "x", keyInsights: [], forNegotiation: [] },
    };
    expect(ConditionsAnalystResponseSchema.safeParse(data).success).toBe(false);
  });

  it("ConditionsAnalystResponseSchema REJETTE signalIntensity manquant (champ requis)", () => {
    const data = {
      meta: baseMeta,
      score: { value: 70, breakdown: [] },
      findings: {
        termsSource: "form",
        valuation: { assessedValue: 5_000_000, percentileVsDB: 50, verdict: "FAIR", rationale: "x", benchmarkUsed: "x" },
        instrument: { type: "BSA-AIR", assessment: "STANDARD", rationale: "x", stageAppropriate: true },
        protections: { overallAssessment: "ADEQUATE", keyProtections: [], missingCritical: [] },
        governance: { vestingAssessment: "x", esopAssessment: "x", overallAssessment: "ADEQUATE" },
        crossReferenceInsights: [],
        negotiationAdvice: [],
        // signalIntensity missing
        signalContribution: { orientation: "favorable", evidenceSolidity: null },
      },
      redFlags: [],
      questions: [],
      narrative: { oneLiner: "x", summary: "x", keyInsights: [], forNegotiation: [] },
    };
    expect(ConditionsAnalystResponseSchema.safeParse(data).success).toBe(false);
  });

  it("ContradictionDetectorResponseSchema REJETTE signalIntensity invalide (Phase A A4-bis)", () => {
    for (const invalid of ["INVESTIGATE_FURTHER", "PROCEED", "STOP", "high_priority", null]) {
      const data = {
        meta: baseMeta,
        contradictions: [],
        summary: { totalContradictions: 0, criticalCount: 0, topRisks: [], verdict: "x" },
        signalIntensity: invalid,
        signalContribution: { orientation: "contrasted", evidenceSolidity: null },
      };
      expect(ContradictionDetectorResponseSchema.safeParse(data).success).toBe(false);
    }
  });

  it("SynthesisDealScorerResponseSchema validates valid data (Phase A v12 — orientation native, D1)", () => {
    // Phase A slice A2 : champ top-level `orientation` typé orientation native
    // (Tier3OrientationSchema). Sous-champ `recommendation.action` aussi typé
    // orientation native (corrigé round 3). D1 verrouillé : aucun champ legacy
    // `STRONG_PASS/PASS/...` n'est accepté par le schema contractuel. Si une
    // fixture brute LLM dégradée doit être testée, elle l'est au niveau input
    // du `transformResponse` côté agent (parser tolérant de lecture LLM
    // dégradée), pas dans ce schema test-only.
    const data = {
      meta: baseMeta,
      overallScore: 68,
      orientation: "contrasted",
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
        action: "contrasted",
        conditions: ["Verify ARR with bank statements"],
        nextSteps: ["Schedule founder call"],
      },
    };
    expect(SynthesisDealScorerResponseSchema.safeParse(data).success).toBe(true);
  });

  it("SynthesisDealScorerResponseSchema REJETTE l'ancien champ `verdict` (Phase A renommé `orientation`, D1)", () => {
    // Régression D1 : le schema test-only utilise désormais `orientation` (pas
    // `verdict`). Une fixture contenant encore `verdict` est rejetée (champ
    // `orientation` manquant).
    const data = {
      meta: baseMeta,
      overallScore: 68,
      verdict: "contrasted", // ancien nom, plus accepté
      dimensionScores: [],
      investmentThesis: { summary: "x", strengths: [], weaknesses: [], keyRisks: [], keyOpportunities: [] },
      recommendation: { action: "x", conditions: [], nextSteps: [] },
    };
    expect(SynthesisDealScorerResponseSchema.safeParse(data).success).toBe(false);
  });

  it("SynthesisDealScorerResponseSchema REJETTE l'ancien enum legacy `STRONG_PASS`/`FAIL` (D1 — pas de bridge)", () => {
    // Régression D1 : le schema test-only ne doit plus accepter les anciennes
    // valeurs prescriptives. Aucun `legacyVerdict` bridge dans le contrat.
    for (const legacyValue of ["STRONG_PASS", "PASS", "CONDITIONAL_PASS", "WEAK_PASS", "FAIL"]) {
      const data = {
        meta: baseMeta,
        overallScore: 50,
        orientation: legacyValue,
        dimensionScores: [],
        investmentThesis: { summary: "x", strengths: [], weaknesses: [], keyRisks: [], keyOpportunities: [] },
        recommendation: { action: "favorable", conditions: [], nextSteps: [] },
      };
      expect(SynthesisDealScorerResponseSchema.safeParse(data).success).toBe(false);
    }
  });

  it("SynthesisDealScorerResponseSchema REJETTE `recommendation.action` libre (D1 round 3 — orientation native)", () => {
    // Régression round 3 : `recommendation.action` typé Tier3OrientationSchema
    // (avant : z.string() libre, drift A2 initial).
    const data = {
      meta: baseMeta,
      overallScore: 50,
      orientation: "contrasted",
      dimensionScores: [],
      investmentThesis: { summary: "x", strengths: [], weaknesses: [], keyRisks: [], keyOpportunities: [] },
      recommendation: {
        action: "x", // string libre — doit être rejetée
        conditions: [],
        nextSteps: [],
      },
    };
    expect(SynthesisDealScorerResponseSchema.safeParse(data).success).toBe(false);
  });

  it("SynthesisDealScorerResponseSchema REJETTE `recommendation.action` legacy `STRONG_PASS`/`FAIL` (D1)", () => {
    for (const legacyValue of ["STRONG_PASS", "PASS", "Invest with conditions", "GO", "NO-GO"]) {
      const data = {
        meta: baseMeta,
        overallScore: 50,
        orientation: "contrasted",
        dimensionScores: [],
        investmentThesis: { summary: "x", strengths: [], weaknesses: [], keyRisks: [], keyOpportunities: [] },
        recommendation: { action: legacyValue, conditions: [], nextSteps: [] },
      };
      expect(SynthesisDealScorerResponseSchema.safeParse(data).success).toBe(false);
    }
  });

  it("DevilsAdvocateResponseSchema validates valid data (Phase A A3 — structuralRisks + riskPosture + signalContribution, D1)", () => {
    // Phase A slice A3 : contrat natif `structuralRisks` (StructuralRisk A1)
    // + `riskPosture` + `signalContribution`. Aucun `killReasons` ni
    // `overallAssessment` accepté en émission (D1 verrouillé, DA-spécifique).
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
      structuralRisks: [
        {
          riskId: "sr-1",
          description: "Cap table fragmenté — risque de blocages de gouvernance",
          category: "structural",
          severity: "HIGH",
          evidence: "12 cap table entries, no lead investor with > 10%",
          source: "cap-table-auditor",
          impact: "Décisions bloquées en cas de Series A",
          question: "Quel mécanisme de gouvernance avez-vous prévu ?",
        },
      ],
      riskPosture: "elevated",
      signalContribution: { orientation: "contrasted", evidenceSolidity: null },
    };
    expect(DevilsAdvocateResponseSchema.safeParse(data).success).toBe(true);
  });

  it("DevilsAdvocateResponseSchema REJETTE `killReasons` legacy (Phase A A3, D1)", () => {
    // Régression D1 : aucun alias `killReasons` n'est admis par le contrat
    // natif. Si une fixture brute LLM dégradée doit être testée, elle l'est
    // au niveau input du parser tolérant côté agent, pas dans ce schema.
    const data = {
      meta: baseMeta,
      challenges: [],
      blindSpots: [],
      killReasons: [
        { id: "kr-1", reason: "x", category: "team", evidence: "x", sourceAgent: "x",
          dealBreakerLevel: "ABSOLUTE", resolutionPossible: false, impactIfIgnored: "x",
          questionToFounder: "x", redFlagAnswer: "x" },
      ],
      riskPosture: "elevated",
      signalContribution: { orientation: "contrasted", evidenceSolidity: null },
    };
    expect(DevilsAdvocateResponseSchema.safeParse(data).success).toBe(false);
  });

  it("DevilsAdvocateResponseSchema REJETTE `overallAssessment` legacy (Phase A A3, D1)", () => {
    // Régression D1 : le champ `overallAssessment` (verdict/recommendation
    // libres) est retiré du contrat natif.
    const data = {
      meta: baseMeta,
      challenges: [],
      blindSpots: [],
      structuralRisks: [],
      riskPosture: "light",
      signalContribution: { orientation: "favorable", evidenceSolidity: null },
      overallAssessment: { verdict: "x", topConcerns: [], recommendation: "PROCEED" },
    };
    // overallAssessment additionnel est ignoré par défaut (Zod `.passthrough`
    // n'est pas activé ici), donc la validation devrait quand même réussir
    // sauf que les champs additionnels ne sont pas testables sans .strict().
    // Le test garantit que le SCHEMA ne déclare pas `overallAssessment` :
    // si un futur changement le ré-introduit, ce test devra être supprimé,
    // ce qui force la revue D1.
    const parsed = DevilsAdvocateResponseSchema.safeParse(data);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // Le champ ne doit PAS être présent dans la sortie typée — c'est le
      // témoin que le schema l'a effectivement rejeté/ignoré.
      expect((parsed.data as Record<string, unknown>).overallAssessment).toBeUndefined();
    }
  });

  it("DevilsAdvocateResponseSchema REJETTE structuralRisks avec severity legacy `ABSOLUTE`/`CONDITIONAL`/`CONCERN` (Phase A A3)", () => {
    // Régression A1 : `StructuralRiskSchema.severity` impose CRITICAL|HIGH|MEDIUM.
    for (const legacySev of ["ABSOLUTE", "CONDITIONAL", "CONCERN"]) {
      const data = {
        meta: baseMeta,
        challenges: [],
        blindSpots: [],
        structuralRisks: [
          { riskId: "sr-1", description: "x", category: "team", severity: legacySev },
        ],
        riskPosture: "elevated",
        signalContribution: { orientation: "contrasted", evidenceSolidity: null },
      };
      expect(DevilsAdvocateResponseSchema.safeParse(data).success).toBe(false);
    }
  });

  it("DevilsAdvocateResponseSchema REJETTE riskPosture invalide (Phase A A3)", () => {
    // Régression A3 : riskPosture restreint à light|elevated|critical|structural.
    for (const badPosture of ["PROCEED", "STOP", "high", "low"]) {
      const data = {
        meta: baseMeta,
        challenges: [],
        blindSpots: [],
        structuralRisks: [],
        riskPosture: badPosture,
        signalContribution: { orientation: "contrasted", evidenceSolidity: null },
      };
      expect(DevilsAdvocateResponseSchema.safeParse(data).success).toBe(false);
    }
  });

  it("MemoGeneratorResponseSchema validates valid data (Phase A A4 — signalProfile + criticalRisks, D1)", () => {
    // Phase A slice A4 : contrat natif `memo.signalProfile` + `memo.criticalRisks`.
    // L'ancien `memo.verdict.{recommendation, score, conditions}` est retiré.
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
        signalProfile: { orientation: "contrasted", evidenceSolidity: null },
        criticalRisks: [
          {
            riskId: "cr-1",
            severity: "HIGH",
            description: "Cap table fragmenté (12 entries, no lead investor)",
            evidence: "cap-table-auditor: fragmented",
            source: "cap-table-auditor",
          },
        ],
      },
    };
    expect(MemoGeneratorResponseSchema.safeParse(data).success).toBe(true);
  });

  it("MemoGeneratorResponseSchema REJETTE `memo.verdict` legacy même AVEC payload natif valide (Phase A A4 round 2, .strict())", () => {
    // Round 2 Codex : payload natif valide (signalProfile + criticalRisks) +
    // champ legacy `memo.verdict` en plus → doit échouer (strict rejette les
    // clés additionnelles dans le bloc memo).
    const data = {
      meta: baseMeta,
      memo: {
        title: "Test",
        executiveSummary: "Test",
        sections: [],
        signalProfile: { orientation: "contrasted", evidenceSolidity: null },
        criticalRisks: [],
        verdict: { // legacy
          recommendation: "CONDITIONAL_PASS",
          score: 68,
          conditions: ["Hire CTO"],
        },
      },
    };
    expect(MemoGeneratorResponseSchema.safeParse(data).success).toBe(false);
  });

  it("MemoGeneratorResponseSchema REJETTE criticalRisks avec severity legacy `ABSOLUTE` (Phase A A4)", () => {
    // Régression : CriticalRiskRef A1 impose severity CRITICAL|HIGH|MEDIUM.
    const data = {
      meta: baseMeta,
      memo: {
        title: "Test",
        executiveSummary: "Test",
        sections: [],
        signalProfile: { orientation: "contrasted", evidenceSolidity: null },
        criticalRisks: [
          { riskId: "cr-1", severity: "ABSOLUTE", description: "x" }, // legacy DA
        ],
      },
    };
    expect(MemoGeneratorResponseSchema.safeParse(data).success).toBe(false);
  });

  // Bloc legacy supprimé (schema MemoGenerator n'a plus de champ
  // memo.verdict.score). Le test "score > 100" portait sur ce champ retiré
  // en A4 — couvert désormais par le rejet du champ `verdict` lui-même via
  // .strict() (round 2 Codex).
  it("MemoGeneratorResponseSchema legacy memo.verdict.score N'EST PLUS au contrat (Phase A A4 round 2, .strict())", () => {
    // Round 2 : payload natif valide + memo.verdict legacy → doit échouer.
    const data = {
      meta: baseMeta,
      memo: {
        title: "Test",
        executiveSummary: "Test",
        sections: [],
        signalProfile: { orientation: "contrasted", evidenceSolidity: null },
        criticalRisks: [],
        verdict: { recommendation: "PASS", score: 120, conditions: [] }, // legacy
      },
    };
    expect(MemoGeneratorResponseSchema.safeParse(data).success).toBe(false);
  });
});
