/**
 * Chantier dé-scorisation P6.2 — Replay durable stepwise old/new (byte-equiv).
 *
 * Prouve la promesse de durabilité de la dé-scorisation À TRAVERS LA FRONTIÈRE
 * du snapshot stepwise. Un résultat `synthesis-deal-scorer` porté dans un
 * `FullAnalysisStepState`, sérialisé PUIS désérialisé (le chemin durable réel
 * `serializeStepState` → `deserializeStepState`), est ensuite lu par le CHEMIN
 * DE PRODUCTION (`readDoctrineOrientation`) en mode SCORELESS :
 *
 *  - snapshot ANCIEN (pré-dé-scorisation, porte encore overallScore/dimensionScores) :
 *    l'orientation vient du `verdict` CATÉGORIEL (5→4), JAMAIS du score ;
 *  - snapshot NOUVEAU (scoreless) : l'orientation vient du `signalProfile`.
 *
 * Invariant « poisoned score » au niveau durabilité : même quand l'ancien snapshot
 * porte un overallScore élevé (qui, sous l'ancien scoring, aurait suggéré une
 * orientation FAVORABLE), l'orientation restituée suit le `verdict` (alerte).
 *
 * Complète, en composant durabilité × lecture scoreless :
 *  - `full-analysis-snapshot.test.ts` (round-trip byte-préservant) ;
 *  - `signal-profile.test.ts` (`readDoctrineOrientation` old/new, poisoned-score).
 */
import { describe, it, expect } from "vitest";
import {
  FULL_ANALYSIS_STEP_STATE_VERSION,
  type FullAnalysisStepState,
  serializeStepState,
  deserializeStepState,
} from "../full-analysis-step-state";
import {
  readDoctrineOrientation,
  scrubAllScoresForLLMContext,
} from "@/services/signal-profile";
import type { AgentResult } from "@/agents/types";

/** Base d'état valide (copiée du contrat v4 prouvé valide), previousResults paramétrable. */
function makeState(previousResults: Record<string, unknown>): FullAnalysisStepState {
  return {
    version: FULL_ANALYSIS_STEP_STATE_VERSION,
    analysisId: "a-replay",
    dealId: "d-replay",
    analysisType: "full_analysis",
    totalAgents: 21,
    completedCount: 21,
    totalCost: 2.5,
    lastUnit: "tier1-phase-b",
    done: false,
    factStoreFormatted: "FACT: revenue=100k (source: deck)",
    allResults: { "deck-forensics": { success: true, score: 72, narrative: "ok" } },
    previousResults,
    tier1CrossValidation: { adjusted: true, score: 80 },
    consolidatedRedFlags: [{ severity: "HIGH", title: "rf" }],
    verificationContext: { facts: ["f1"], fundingDb: { p50: 5 } },
    startTimeMs: 1_700_000_000_000,
    transitionCount: 10,
    terminalResult: null,
    evidenceLedgerFormatted: "EVIDENCE: source=deck (HIGH)",
    evidenceTodayIso: "2026-06-01T00:00:00.000Z",
    conditionsAnalystMode: "pipeline",
    canonicalDeal: { id: "d-replay", name: "Acme", sector: "saas", createdAt: "2026-05-01T10:00:00.000Z" },
    analysisBinding: { id: "a-replay", mode: "full_analysis", thesisBypass: false, thesisId: "t1", corpusSnapshotId: "cs1" },
    evidenceContext: { doc1: { documentDate: { date: "2026-04-01T00:00:00.000Z" } } },
    thesis: { id: "t1", reformulated: "x", verdict: "favorable", confidence: 71 },
    contextEngine: { completeness: 0.8, enrichedAt: "2026-06-01T00:00:00.000Z" },
    evidenceLedger: { generatedAt: "2026-06-01T00:00:00.000Z", coverage: { documents: 1 }, items: [], warnings: [] },
    extractedData: { tagline: "t", competitors: ["c1"] },
    deckCoherenceReport: { reliabilityGrade: "B" },
    baPreferences: { riskTolerance: 3, preferredSectors: ["saas"] },
    dealTerms: { valuationPre: 5_000_000, instrumentType: "SAFE" },
    dealStructure: { mode: "SIMPLE", totalInvestment: 500_000, tranches: [] },
    scopedDocuments: [{ id: "doc1", name: "deck.pdf", type: "pitch", uploadedAt: "2026-04-01T00:00:00.000Z" }],
    factStore: [{ factKey: "revenue", currentValue: 100000, firstSeenAt: "2026-04-01T00:00:00.000Z", eventHistory: [{ createdAt: "2026-04-01T00:00:00.000Z" }] }],
    founderResponses: [{ questionId: "q1", question: "?", answer: "a", category: "team" }],
    collectedWarnings: [{ severity: "high", title: "w", timestamp: "2026-06-01T00:00:00.000Z" }],
    previousAnalysisQuestions: [{ question: "q", priority: "high", answered: false }],
    tier1Findings: [
      { id: "deck-forensics_story_coherence_ab12cd34", agentName: "deck-forensics", metric: "story_coherence", value: 72, createdAt: "2026-04-20T00:00:00.000Z" },
    ],
    allValidations: [
      { factKey: "revenue", status: "VERIFIED", newConfidence: 88, validatedBy: "financial-auditor", explanation: "matches deck" },
    ],
    needsReflect: [],
  };
}

/**
 * Snapshot ANCIEN : verdict alerte MAIS overallScore élevé (91). Sous l'ancien
 * scoring, 91 aurait suggéré favorable → c'est le piège que le reader doit ignorer.
 */
const LEGACY_SCORED_SYNTHESIS = {
  success: true,
  agentName: "synthesis-deal-scorer",
  data: {
    overallScore: 91,
    confidence: 88,
    verdict: "alert_dominant",
    dimensionScores: [
      { dimension: "team", score: 90, weight: 0.2, weightedScore: 18, sourceAgents: ["team-investigator"], keyFactors: [] },
    ],
    scoreBreakdown: { strengthsContribution: 40, weaknessesDeduction: 10, riskAdjustment: 5, opportunityBonus: 3 },
    investmentRecommendation: { action: "alert_dominant", rationale: "signaux d'alerte dominants" },
    keyStrengths: ["traction"],
    keyWeaknesses: ["burn"],
    criticalRisks: ["runway < 3 mois"],
  },
};

/** Snapshot NOUVEAU : scoreless (signalProfile présent, aucune note). */
const SCORELESS_SYNTHESIS = {
  success: true,
  agentName: "synthesis-deal-scorer",
  data: {
    verdict: "alert_dominant",
    investmentRecommendation: { action: "alert_dominant", rationale: "signaux d'alerte dominants" },
    keyStrengths: ["traction"],
    keyWeaknesses: ["burn"],
    criticalRisks: ["runway < 3 mois"],
    signalContribution: { orientation: "alert_dominant", evidenceSolidity: null },
    signalProfile: {
      orientation: "alert",
      dominantSignals: [{ label: "burn élevé", direction: "unfavorable" }],
      dimensionCoverage: [{ dimension: "financials", covered: true }],
      evidenceSolidity: "solid",
      criticalRisks: ["runway < 3 mois"],
    },
  },
};

function roundTrip(previousResults: Record<string, unknown>): FullAnalysisStepState {
  return deserializeStepState(serializeStepState(makeState(previousResults)));
}

describe("P6.2 replay durable — snapshot ANCIEN scoré → lecture scoreless", () => {
  const replayed = roundTrip({ "synthesis-deal-scorer": LEGACY_SCORED_SYNTHESIS });
  const results = replayed.previousResults as Record<string, AgentResult>;

  it("le round-trip durable PRÉSERVE les données legacy (carry byte-équiv), score inclus", () => {
    const data = (replayed.previousResults["synthesis-deal-scorer"] as { data: Record<string, unknown> }).data;
    expect(data.overallScore).toBe(91);
    expect(data.verdict).toBe("alert_dominant");
  });

  it("readDoctrineOrientation dérive du VERDICT catégoriel (legacy_verdict), jamais du score", () => {
    const read = readDoctrineOrientation(results);
    expect(read.source).toBe("legacy_verdict");
    expect(read.orientation).toBe("alert");
  });

  it("POISONED SCORE : overallScore=91 (qui aurait suggéré favorable) n'altère PAS l'orientation alerte", () => {
    const read = readDoctrineOrientation(results);
    // Si l'orientation venait du score, elle serait favorable — elle reste alerte.
    expect(read.orientation).not.toBe("favorable");
    expect(read.orientation).toBe("alert");
  });

  it("scrubAllScoresForLLMContext retire la note du résultat round-trippé (contexte LLM scoreless)", () => {
    const scrubbed = scrubAllScoresForLLMContext(replayed.previousResults);
    const data = (scrubbed["synthesis-deal-scorer"] as { data: Record<string, unknown> }).data;
    expect(data).not.toHaveProperty("overallScore");
    expect(data).not.toHaveProperty("scoreBreakdown");
    // L'orientation catégorielle (verdict) survit au scrub.
    expect(data.verdict).toBe("alert_dominant");
  });
});

describe("P6.2 replay durable — snapshot NOUVEAU scoreless → lecture profil", () => {
  const replayed = roundTrip({ "synthesis-deal-scorer": SCORELESS_SYNTHESIS });
  const results = replayed.previousResults as Record<string, AgentResult>;

  it("le round-trip durable PRÉSERVE le signalProfile scoreless", () => {
    const data = (replayed.previousResults["synthesis-deal-scorer"] as { data: Record<string, unknown> }).data;
    expect(data).not.toHaveProperty("overallScore");
    expect(data.signalProfile).toBeDefined();
  });

  it("readDoctrineOrientation lit le profil scoreless (source profile)", () => {
    const read = readDoctrineOrientation(results);
    expect(read.source).toBe("profile");
    expect(read.orientation).toBe("alert");
  });
});

describe("P6.2 replay durable — TEETH : un round-trip qui perd le verdict casse la lecture", () => {
  it("synthesis sans verdict NI profil après round-trip → orientation none (jamais dérivée d'un score)", () => {
    // data ne porte QUE overallScore (aucun verdict, aucun signalProfile).
    const replayed = roundTrip({
      "synthesis-deal-scorer": { success: true, agentName: "synthesis-deal-scorer", data: { overallScore: 91 } },
    });
    const read = readDoctrineOrientation(replayed.previousResults as Record<string, AgentResult>);
    expect(read.orientation).toBeNull();
    expect(read.source).toBe("none");
  });
});
