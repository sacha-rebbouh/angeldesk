import type { AgentResult, AgentMeta, AgentScore, AgentRedFlag, AgentQuestion, AgentAlertSignal, AgentNarrative, DbCrossReference } from './common';
import type { Tier3Orientation, Tier3SignalContribution, StructuralRisk, CriticalRiskRef } from "../tier3/schemas/common";

// ============================================================================
// CONTRADICTION DETECTOR AGENT (TIER 3)
// ============================================================================

export type ContradictionType = "INTERNAL" | "DECK_VS_DB" | "CLAIM_VS_DATA" | "TIER1_VS_TIER1" | "TIER1_VS_TIER2" | "DECK_VS_CONTEXT_ENGINE";

export interface DetectedContradiction { id: string; type: ContradictionType; severity: "CRITICAL" | "HIGH" | "MEDIUM"; statement1: { text: string; location: string; source: string }; statement2: { text: string; location: string; source: string }; topic: string; analysis: string; implication: string; confidenceLevel: number; resolution?: { likely: "statement1" | "statement2" | "unknown"; reasoning: string; needsVerification: boolean }; question: string; redFlagIfBadAnswer: string }
export interface DataGap { id: string; area: string; description: string; missingFrom: string[]; expectedSource: string; importance: "CRITICAL" | "HIGH" | "MEDIUM"; impactOnAnalysis: string; recommendation: string; questionToAsk: string }
export interface AggregatedDbComparison { totalClaimsChecked: number; verified: number; contradicted: number; partiallyVerified: number; notVerifiable: number; bySource: { source: string; claims: number; verified: number; contradicted: number }[]; competitorComparison: { competitorsInDeck: string[]; competitorsInDb: string[]; hiddenCompetitors: string[]; deckCompetitorsNotInDb: string[]; deckAccuracy: "ACCURATE" | "INCOMPLETE" | "MISLEADING"; impactOnCredibility: string }; overallVerdict: "COHERENT" | "MINOR_ISSUES" | "SIGNIFICANT_CONCERNS" | "MAJOR_DISCREPANCIES"; verdictRationale: string }
export interface AgentOutputSummary { agentName: string; tier: 1 | 2 | 3; score?: number; grade?: string; criticalRedFlags: number; highRedFlags: number; mediumRedFlags: number; keyFindings: string[]; concernsRaised: string[]; claimsMade: { claim: string; confidence: number }[] }
export interface ContradictionDetectorFindings { contradictions: DetectedContradiction[]; contradictionSummary: { byType: { type: ContradictionType; count: number; criticalCount: number }[]; bySeverity: { severity: string; count: number }[]; topicsMostContradicted: string[] }; dataGaps: DataGap[]; aggregatedDbComparison: AggregatedDbComparison; agentOutputsSummary: AgentOutputSummary[]; consistencyAnalysis: { overallScore: number; breakdown: { dimension: string; score: number; weight: number; issues: string[] }[]; interpretation: string }; redFlagConvergence: { topic: string; agentsAgreeing: string[]; agentsDisagreeing: string[]; consensusLevel: "STRONG" | "MODERATE" | "WEAK" | "CONFLICTING"; recommendation: string }[] }

// ============================================================================
// CONDITIONS ANALYST AGENT
// ============================================================================

export interface ConditionsAnalystFindings { termsSource: "form" | "term_sheet" | "deck" | "none"; valuation: { assessedValue: number | null; percentileVsDB: number | null; verdict: "UNDERVALUED" | "FAIR" | "AGGRESSIVE" | "VERY_AGGRESSIVE"; rationale: string; benchmarkUsed: string }; instrument: { type: string | null; assessment: "STANDARD" | "FAVORABLE" | "UNFAVORABLE" | "TOXIC"; rationale: string; stageAppropriate: boolean }; protections: { overallAssessment: "STRONG" | "ADEQUATE" | "WEAK" | "NONE"; keyProtections: { item: string; present: boolean; assessment: string }[]; missingCritical: string[] }; governance: { vestingAssessment: string; esopAssessment: string; overallAssessment: "STRONG" | "ADEQUATE" | "WEAK" | "CONCERNING" }; crossReferenceInsights: { insight: string; sourceAgent: string; impact: "positive" | "negative" | "neutral" }[]; negotiationAdvice: { point: string; priority: "CRITICAL" | "HIGH" | "MEDIUM"; suggestedArgument: string; leverageSource: string }[]; structuredAssessment?: { overallStructureVerdict: string; trancheAssessments: { trancheLabel: string; assessment: string; risks: string[]; score: number }[]; blendedEffectiveValuation: number | null; triggerRiskLevel: "LOW" | "MEDIUM" | "HIGH" } }
export interface ConditionsAnalystData { meta: AgentMeta; score: AgentScore; findings: ConditionsAnalystFindings; redFlags: AgentRedFlag[]; questions: AgentQuestion[]; alertSignal: AgentAlertSignal; narrative: AgentNarrative }
export interface ConditionsAnalystResult extends AgentResult { agentName: "conditions-analyst"; data: ConditionsAnalystData }

export interface ContradictionDetectorData { meta: AgentMeta; score: AgentScore; findings: ContradictionDetectorFindings; dbCrossReference: DbCrossReference; redFlags: AgentRedFlag[]; questions: AgentQuestion[]; alertSignal: AgentAlertSignal; narrative: AgentNarrative }
export interface ContradictionDetectorResult extends AgentResult { agentName: "contradiction-detector"; data: ContradictionDetectorData }

// ============================================================================
// SCENARIO MODELER AGENT
// ============================================================================

export interface SourcedAssumption { assumption: string; value: number | string; source: string; confidence: "high" | "medium" | "low" }
export interface ScenarioYearMetrics { year: number; revenue: number; revenueSource: string; valuation: number; valuationSource: string; employeeCount: number; employeeCountSource: string }
export interface InvestorReturnCalculation { initialInvestment: number; initialInvestmentSource: string; ownershipAtEntry: number; ownershipCalculation: string; dilutionToExit: number; dilutionSource: string; ownershipAtExit: number; ownershipAtExitCalculation: string; grossProceeds: number; proceedsCalculation: string; multiple: number; multipleCalculation: string; irr: number; irrCalculation: string; holdingPeriodYears: number }
export interface ScenarioV2 { name: "BASE" | "BULL" | "BEAR" | "CATASTROPHIC"; description: string; probability: { value: number; rationale: string; source: string }; assumptions: SourcedAssumption[]; metrics: ScenarioYearMetrics[]; exitOutcome: { type: "acquisition_strategic" | "acquisition_pe" | "ipo" | "secondary" | "acquihire" | "shutdown" | "zombie"; typeRationale: string; timing: string; timingSource: string; exitValuation: number; exitValuationCalculation: string; exitMultiple: number; exitMultipleSource: string }; investorReturn: InvestorReturnCalculation; keyRisks: { risk: string; source: string }[]; keyDrivers: { driver: string; source: string }[]; basedOnComparable?: { company: string; trajectory: string; relevance: string; source: string } }
export interface SensitivityAnalysisV2 { variable: string; baseCase: { value: number; source: string }; impactOnValuation: { change: string; newValuation: number; calculation: string }[]; impactLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"; impactRationale: string }
export interface ScenarioComparable { company: string; sector: string; stage: string; trajectory: string; outcome: "success" | "moderate_success" | "struggle" | "failure"; relevance: string; source: string; keyMetrics?: { seedValuation?: number; exitValuation?: number; timeToExit?: number; peakEmployees?: number } }
// Phase A slice A4 — `dominantScenario` renomme l'ancien `mostLikelyScenario`
// (D1 cohérence, pas un alias legacy). `signalContribution` natif déterministe
// (LLM ne pilote pas, dérivé runtime depuis probabilités scenarios).
export interface ScenarioModelerFindings { scenarios: ScenarioV2[]; sensitivityAnalysis: SensitivityAnalysisV2[]; basedOnComparables: ScenarioComparable[]; breakEvenAnalysis: { monthsToBreakeven: number; breakEvenCalculation: string; requiredGrowthRate: number; growthRateSource: string; burnUntilBreakeven: number; burnCalculation: string; achievability: "ACHIEVABLE" | "CHALLENGING" | "UNLIKELY" | "UNKNOWN"; achievabilityRationale: string }; probabilityWeightedOutcome: { expectedMultiple: number; expectedMultipleCalculation: string; expectedIRR: number; expectedIRRCalculation: string; riskAdjustedAssessment: string }; dominantScenario: "BASE" | "BULL" | "BEAR" | "CATASTROPHIC"; dominantScenarioRationale: string; signalContribution: Tier3SignalContribution }
export interface ScenarioModelerData { meta: AgentMeta; score: AgentScore; findings: ScenarioModelerFindings; dbCrossReference: DbCrossReference; redFlags: AgentRedFlag[]; questions: AgentQuestion[]; alertSignal: AgentAlertSignal; narrative: AgentNarrative }
export interface ScenarioModelerResult extends AgentResult { agentName: "scenario-modeler"; data: ScenarioModelerData }

// Synthesis Deal Scorer Agent
// Phase A slice A2 — `verdict` et `investmentRecommendation.action` typés
// `Tier3Orientation` (alignement nominal — équivalent structurel à l'union
// string littérale historique). Ajout de `signalContribution: Tier3SignalContribution`.
export interface SynthesisDealScorerData { overallScore: number; verdict: Tier3Orientation; confidence: number; dimensionScores: { dimension: string; score: number; weight: number; weightedScore: number; sourceAgents: string[]; keyFactors: string[] }[]; scoreBreakdown: { strengthsContribution: number; weaknessesDeduction: number; riskAdjustment: number; opportunityBonus: number }; comparativeRanking: { percentileOverall: number; percentileSector: number; percentileStage: number; similarDealsAnalyzed: number; method?: "EXACT" | "INTERPOLATED" | "INSUFFICIENT_DATA" | "UNAVAILABLE"; insufficientData?: boolean; calculationDetail?: string }; investmentRecommendation: { action: Tier3Orientation; rationale: string; conditions?: string[]; suggestedTerms?: string }; keyStrengths: string[]; keyWeaknesses: string[]; criticalRisks: string[]; signalContribution: Tier3SignalContribution }
export interface SynthesisDealScorerResult extends AgentResult { agentName: "synthesis-deal-scorer"; data: SynthesisDealScorerData }

// ============================================================================
// DEVIL'S ADVOCATE AGENT
// ============================================================================

export interface CounterArgument { id: string; thesis: string; thesisSource: string; counterArgument: string; evidence: string; comparableFailure: { company: string; sector: string; fundingRaised?: number; similarity: string; outcome: string; lessonsLearned: string; source: string; verified?: boolean; verificationUrl?: string }; probability: "HIGH" | "MEDIUM" | "LOW"; probabilityRationale: string; mitigationPossible: boolean; mitigation?: string }
export interface WorstCaseScenario { name: string; description: string; triggers: { trigger: string; probability: "HIGH" | "MEDIUM" | "LOW"; timeframe: string }[]; cascadeEffects: string[]; probability: number; probabilityRationale: string; lossAmount: { totalLoss: boolean; estimatedLoss: string; calculation?: string }; comparableCatastrophes: { company: string; whatHappened: string; investorLosses: string; source: string; verified?: boolean; verificationUrl?: string }[]; earlyWarningSigns: string[] }

export interface BlindSpot { id: string; area: string; description: string; whyMissed: string; whatCouldGoWrong: string; historicalPrecedent?: { company: string; whatHappened: string; source: string; verified?: boolean; verificationUrl?: string }; recommendedAction: string; urgency: "IMMEDIATE" | "BEFORE_DECISION" | "DURING_DD" }
export interface AlternativeNarrative { id: string; currentNarrative: string; alternativeNarrative: string; plausibility: number; plausibilityRationale: string; evidenceSupporting: string[]; implications: string; testToValidate: string }

// Phase A slice A3 — Posture de risque structurel (qualifie l'intensité,
// pas une action). Cohérent avec `DevilsAdvocateRiskPostureSchema`
// (`src/agents/tier3/schemas/devils-advocate-schema.ts`).
export type DevilsAdvocateRiskPosture = "light" | "elevated" | "critical" | "structural";

// Phase A slice A3 — `DevilsAdvocateFindings` aligné contrat natif (D1) :
// - `structuralRisks: StructuralRisk[]` remplace l'ancien `killReasons` (legacy).
// - `riskPosture` qualifie l'intensité du risque structurel détecté.
// - `signalContribution` porte l'orientation (axe 1) dérivée déterministe
//   depuis riskPosture + counts severity, et `evidenceSolidity` (axe 2)
//   qui reste nullable en A3 (D2).
// - Le champ legacy `KillReason` est retiré ; ses occurrences runtime étaient
//   toutes DA-spécifiques (cf. arbitrage A3 Codex).
//
// Exception cross-agent documentée :
// - `alertSignal: AgentAlertSignal` reste émis (compat
//   `BaseAgent.getRequiredOutputContractFields()` + lecteurs Tier 1/3 partagés)
//   mais la valeur est désormais dérivée déterministe depuis `riskPosture`
//   côté `transformResponse`. La migration du contrat global
//   `AgentAlertSignal` (PROCEED/STOP → signalIntensity) appartient à un
//   slice cross-agent dédié (signalIntensity / A7b / A4-bis / A9), hors A3.
export interface DevilsAdvocateFindings { counterArguments: CounterArgument[]; worstCaseScenario: WorstCaseScenario; structuralRisks: StructuralRisk[]; riskPosture: DevilsAdvocateRiskPosture; signalContribution: Tier3SignalContribution; blindSpots: BlindSpot[]; alternativeNarratives: AlternativeNarrative[]; additionalMarketRisks: { risk: string; trigger: string; timeline: string; severity: "EXISTENTIAL" | "SERIOUS" | "MANAGEABLE"; notCoveredBecause: string }[]; hiddenCompetitiveThreats: { threat: string; source: string; whyHidden: string; likelihood: number; defensibility: string; evidenceSource: string }[]; executionChallenges: { challenge: string; currentAssessment: string; realDifficulty: "EXTREME" | "VERY_HARD" | "HARD" | "MODERATE"; whyUnderestimated: string; prerequisite: string; failureMode: string; comparableFailure?: string }[]; skepticismAssessment: { score: number; isFallback?: boolean; scoreBreakdown: { factor: string; contribution: number; rationale: string }[]; verdict: "VERY_SKEPTICAL" | "SKEPTICAL" | "CAUTIOUS" | "NEUTRAL" | "CAUTIOUSLY_OPTIMISTIC"; verdictRationale: string }; concernsSummary: { absolute: string[]; conditional: string[]; serious: string[]; minor: string[] }; positiveClaimsChallenged: { claim: string; sourceAgent: string; challenge: string; verdict: "STANDS" | "WEAKENED" | "INVALIDATED"; verdictRationale: string }[] }
export interface DevilsAdvocateData { meta: AgentMeta; score: AgentScore; findings: DevilsAdvocateFindings; dbCrossReference: DbCrossReference; redFlags: AgentRedFlag[]; questions: AgentQuestion[]; alertSignal: AgentAlertSignal; narrative: AgentNarrative }
export interface DevilsAdvocateResult extends AgentResult { agentName: "devils-advocate"; data: DevilsAdvocateData }

// Memo Generator Agent
// Phase A slice A4 — Ajout `signalProfile` (Tier3SignalContribution) +
// `criticalRisks` (CriticalRiskRef[] A1). keyRisks conservé (mitigation propre).
export interface MemoGeneratorData { executiveSummary: { oneLiner: string; recommendation: "very_favorable" | "favorable" | "contrasted" | "vigilance" | "alert_dominant"; keyPoints: string[] }; signalProfile: Tier3SignalContribution; criticalRisks: CriticalRiskRef[]; companyOverview: { description: string; problem: string; solution: string; businessModel: string; traction: string }; investmentHighlights: { highlight: string; evidence: string }[]; keyRisks: { risk: string; mitigation: string; residualRisk: "low" | "medium" | "high" }[]; financialSummary: { currentMetrics: Record<string, string | number>; projections: string; valuationAssessment: string }; teamAssessment: string; marketOpportunity: string; competitiveLandscape: string; dealTerms: { valuation: string; roundSize: string; keyTerms: string[]; negotiationPoints: string[] }; dueDiligenceFindings: { completed: string[]; outstanding: string[]; redFlags: string[] }; investmentThesis: string; exitStrategy: string; nextSteps: string[]; appendix: { financialModel?: string; comparableDeals?: string[]; referencesChecked?: string[] } }
export interface MemoGeneratorResult extends AgentResult { agentName: "memo-generator"; data: MemoGeneratorData }

// ============================================================================
// Phase A — Contrats partagés natifs (slice A1, additif strict)
// ============================================================================
// Ré-exports depuis `src/agents/tier3/schemas/common.ts` pour exposer les
// nouveaux types Phase A via le module Tier 3.
//
// D1 verrouillé : aucun type legacy retiré.
// D2 verrouillé : EvidenceSolidity Phase A limité à 2 valeurs + null.
// ============================================================================

export {
  Tier3OrientationSchema,
  Tier3EvidenceSolidityEmittedSchema,
  Tier3SignalContributionSchema,
  StructuralRiskSchema,
  CriticalRiskRefSchema,
  ConditionRefSchema,
  SourceRefSchema,
  OpenQuestionRefSchema,
  ContradictionRefSchema,
} from "../tier3/schemas/common";

export type {
  Tier3Orientation,
  Tier3EvidenceSolidityEmitted,
  Tier3SignalContribution,
  StructuralRisk,
  CriticalRiskRef,
  ConditionRef,
  SourceRef,
  OpenQuestionRef,
  ContradictionRef,
} from "../tier3/schemas/common";
