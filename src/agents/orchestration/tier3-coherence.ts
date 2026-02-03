/**
 * TIER 3 COHERENCE ENGINE - Module déterministe (NO LLM)
 *
 * Vérifie et corrige les incohérences entre agents Tier 3 :
 * - scenario-modeler vs devils-advocate (scepticisme vs probabilités)
 * - scenario-modeler vs synthesis-deal-scorer (score vs scénarios)
 * - contradiction-detector red flags vs scénarios optimistes
 *
 * S'exécute APRÈS T3 Batch 1 (contradiction-detector, scenario-modeler, devils-advocate)
 * et AVANT T3 Batch 2 (synthesis-deal-scorer)
 *
 * Principe: Ajustements déterministes, pas de LLM.
 * Les scénarios ajustés sont marqués { adjusted: true, reliable: boolean }
 */

import type {
  AgentResult,
  ScenarioModelerData,
  DevilsAdvocateData,
  ScenarioV2,
} from "../types";

// ============================================================================
// TYPES
// ============================================================================

export interface CoherenceAdjustment {
  rule: string;
  field: string;
  before: number;
  after: number;
  reason: string;
}

export interface CoherenceResult {
  adjusted: boolean;
  adjustments: CoherenceAdjustment[];
  adjustedScenarios: AdjustedScenarioV2[];
  adjustedProbabilityWeightedOutcome: {
    expectedMultiple: number;
    expectedMultipleCalculation: string;
    expectedIRR: number;
    reliable: boolean;
  };
  coherenceScore: number; // 0-100 — how coherent Batch 1 outputs were BEFORE adjustments
  warnings: string[];
}

export interface AdjustedScenarioV2 extends ScenarioV2 {
  adjusted: boolean;
  reliable: boolean;
  originalProbability?: number;
  originalMultiple?: number;
}

// ============================================================================
// EXTRACTION HELPERS
// ============================================================================

function getResultData(result: AgentResult): Record<string, unknown> | null {
  const r = result as unknown as { data?: Record<string, unknown> };
  return r.data ?? null;
}

function extractScepticismScore(results: Record<string, AgentResult>): number | null {
  const da = results["devils-advocate"];
  if (!da?.success) return null;

  const data = getResultData(da) as DevilsAdvocateData | null;
  if (!data) return null;

  return data.findings?.skepticismAssessment?.score ?? data.score?.value ?? null;
}

function extractScenarios(results: Record<string, AgentResult>): ScenarioV2[] | null {
  const sm = results["scenario-modeler"];
  if (!sm?.success) return null;

  const data = getResultData(sm) as ScenarioModelerData | null;
  if (!data) return null;

  return data.findings?.scenarios ?? null;
}

function extractT1AverageScore(results: Record<string, AgentResult>): number | null {
  const t1Agents = [
    "financial-auditor", "deck-forensics", "team-investigator",
    "market-intelligence", "competitive-intel", "exit-strategist",
    "tech-stack-dd", "tech-ops-dd", "legal-regulatory",
    "gtm-analyst", "customer-intel", "cap-table-auditor",
  ];

  const scores: number[] = [];
  for (const name of t1Agents) {
    const r = results[name];
    if (!r?.success) continue;
    const data = getResultData(r) as { score?: { value?: number } } | null;
    if (typeof data?.score?.value === "number") {
      scores.push(data.score.value);
    }
  }

  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function extractCriticalRedFlagCount(results: Record<string, AgentResult>): number {
  const cd = results["contradiction-detector"];
  if (!cd?.success) return 0;

  const data = getResultData(cd) as { redFlags?: { severity?: string }[] } | null;
  if (!data || !Array.isArray(data.redFlags)) return 0;

  return data.redFlags.filter(
    (rf) => rf.severity === "CRITICAL" || rf.severity === "critical"
  ).length;
}

// ============================================================================
// NORMALISATION DES PROBABILITÉS
// ============================================================================

function normalizeProbaDistribution(
  catastrophic: number,
  bear: number,
  base: number,
  bull: number
): { catastrophic: number; bear: number; base: number; bull: number } {
  // Clamp minimums
  catastrophic = Math.max(0, catastrophic);
  bear = Math.max(0, bear);
  base = Math.max(0, base);
  bull = Math.max(0, bull);

  const total = catastrophic + bear + base + bull;
  if (total === 0) {
    return { catastrophic: 25, bear: 25, base: 25, bull: 25 };
  }

  if (Math.abs(total - 100) < 0.5) {
    // Close enough — just adjust rounding on bear (least sensitive)
    const rounded = {
      catastrophic: Math.round(catastrophic),
      bull: Math.round(bull),
      base: Math.round(base),
      bear: 0,
    };
    rounded.bear = 100 - rounded.catastrophic - rounded.bull - rounded.base;
    return rounded;
  }

  // Proportional scaling
  const factor = 100 / total;
  const scaled = {
    catastrophic: Math.round(catastrophic * factor),
    bull: Math.round(bull * factor),
    base: Math.round(base * factor),
    bear: 0,
  };
  scaled.bear = 100 - scaled.catastrophic - scaled.bull - scaled.base;

  return scaled;
}

// ============================================================================
// COHERENCE RULES
// ============================================================================

function applyCoherenceRules(
  scenarios: ScenarioV2[],
  scepticism: number,
  t1Avg: number | null,
  criticalRedFlags: number
): { adjusted: AdjustedScenarioV2[]; adjustments: CoherenceAdjustment[] } {
  const adjustments: CoherenceAdjustment[] = [];

  // Index scenarios by name
  const byName: Record<string, ScenarioV2> = {};
  for (const s of scenarios) {
    byName[s.name] = s;
  }

  const catOriginal = byName["CATASTROPHIC"]?.probability?.value ?? 10;
  const bearOriginal = byName["BEAR"]?.probability?.value ?? 20;
  const baseOriginal = byName["BASE"]?.probability?.value ?? 40;
  const bullOriginal = byName["BULL"]?.probability?.value ?? 30;

  let cat = catOriginal;
  let bear = bearOriginal;
  let base = baseOriginal;
  let bull = bullOriginal;

  // === RULE 1: Scepticism > 50 → redistribution ===
  if (scepticism > 50) {
    const newCat = Math.min(80, catOriginal + (scepticism - 50) * 0.8);
    const newBull = Math.max(2, bullOriginal * Math.pow(1 - scepticism / 100, 2));
    const newBase = Math.max(10, baseOriginal * (1 - (scepticism - 50) / 100));

    if (newCat !== cat) {
      adjustments.push({ rule: "SCEPTICISM_>50_CAT", field: "CATASTROPHIC.probability", before: cat, after: newCat, reason: `Scepticisme ${scepticism} > 50 → hausse CATASTROPHIC` });
      cat = newCat;
    }
    if (newBull !== bull) {
      adjustments.push({ rule: "SCEPTICISM_>50_BULL", field: "BULL.probability", before: bull, after: newBull, reason: `Scepticisme ${scepticism} > 50 → baisse BULL` });
      bull = newBull;
    }
    if (newBase !== base) {
      adjustments.push({ rule: "SCEPTICISM_>50_BASE", field: "BASE.probability", before: base, after: newBase, reason: `Scepticisme ${scepticism} > 50 → baisse BASE` });
      base = newBase;
    }
  }

  // === RULE 2: Scepticism > 70 → BASE proba ≤ 20%, BASE multiple ≤ 2x ===
  if (scepticism > 70) {
    if (base > 20) {
      adjustments.push({ rule: "SCEPTICISM_>70_BASE_CAP", field: "BASE.probability", before: base, after: 20, reason: `Scepticisme ${scepticism} > 70 → BASE prob capped à 20%` });
      base = 20;
    }
  }

  // === RULE 3: Scepticism > 80 → BULL proba < 5% ===
  if (scepticism > 80) {
    if (bull >= 5) {
      adjustments.push({ rule: "SCEPTICISM_>80_BULL_CAP", field: "BULL.probability", before: bull, after: 4, reason: `Scepticisme ${scepticism} > 80 → BULL prob < 5%` });
      bull = 4;
    }
  }

  // === RULE 4: Scepticism > 90 → CATASTROPHIC > 60% ===
  if (scepticism > 90) {
    if (cat <= 60) {
      adjustments.push({ rule: "SCEPTICISM_>90_CAT_FLOOR", field: "CATASTROPHIC.probability", before: cat, after: 65, reason: `Scepticisme ${scepticism} > 90 → CATASTROPHIC min 60%` });
      cat = 65;
    }
  }

  // === RULE 5: T1 avg < 40 → CATASTROPHIC dominant, BULL ≤ 5% ===
  if (t1Avg !== null && t1Avg < 40) {
    if (cat < 40) {
      adjustments.push({ rule: "T1_AVG_<40_CAT", field: "CATASTROPHIC.probability", before: cat, after: 45, reason: `Score T1 moyen ${t1Avg.toFixed(0)} < 40 → CATASTROPHIC dominant` });
      cat = 45;
    }
    if (bull > 5) {
      adjustments.push({ rule: "T1_AVG_<40_BULL", field: "BULL.probability", before: bull, after: 5, reason: `Score T1 moyen ${t1Avg.toFixed(0)} < 40 → BULL ≤ 5%` });
      bull = 5;
    }
  }

  // === RULE 6: > 3 CRITICAL red flags → increase CATASTROPHIC ===
  if (criticalRedFlags > 3) {
    const boost = Math.min(20, (criticalRedFlags - 3) * 5);
    const newCat = Math.min(80, cat + boost);
    if (newCat !== cat) {
      adjustments.push({ rule: "CRITICAL_RF_>3", field: "CATASTROPHIC.probability", before: cat, after: newCat, reason: `${criticalRedFlags} red flags CRITICAL → +${boost}% CATASTROPHIC` });
      cat = newCat;
    }
  }

  // Normalize probabilities to sum = 100
  let normalized = normalizeProbaDistribution(cat, bear, base, bull);
  cat = normalized.catastrophic;
  bear = normalized.bear;
  base = normalized.base;
  bull = normalized.bull;

  // Re-enforce hard caps after normalization (normalization can scale values back up)
  let overflow = 0;
  if (scepticism > 70 && base > 20) {
    overflow += base - 20;
    base = 20;
  }
  if (scepticism > 80 && bull >= 5) {
    overflow += bull - 4;
    bull = 4;
  }
  if (scepticism > 90 && cat <= 60) {
    const deficit = 65 - cat;
    cat = 65;
    overflow -= deficit;
  }
  if (overflow > 0) {
    bear += overflow; // Absorb excess into BEAR
  } else if (overflow < 0) {
    bear = Math.max(0, bear + overflow);
  }
  // Re-normalize to guarantee sum = 100
  normalized = normalizeProbaDistribution(cat, bear, base, bull);
  cat = normalized.catastrophic;
  bear = normalized.bear;
  base = normalized.base;
  bull = normalized.bull;

  // === MULTIPLE CAPPING (scepticism > 60) ===
  const cappedMultiples: Record<string, { before: number; after: number }> = {};

  if (scepticism > 60) {
    const dampingFactor = Math.pow(1 - (scepticism - 60) / 100, 2);

    for (const s of scenarios) {
      const rawMultiple = s.investorReturn?.multiple ?? 0;
      if (s.name === "BASE" && rawMultiple > 1) {
        const capped = Math.max(1, rawMultiple * dampingFactor);
        if (Math.abs(capped - rawMultiple) > 0.1) {
          cappedMultiples[s.name] = { before: rawMultiple, after: Math.round(capped * 10) / 10 };
          adjustments.push({ rule: "SCEPTICISM_>60_MULTIPLE_CAP", field: `${s.name}.multiple`, before: rawMultiple, after: cappedMultiples[s.name].after, reason: `Scepticisme ${scepticism} > 60 → cap multiple BASE` });
        }
      }
      if (s.name === "BULL" && rawMultiple > 2) {
        const capped = Math.max(2, rawMultiple * dampingFactor);
        if (Math.abs(capped - rawMultiple) > 0.1) {
          cappedMultiples[s.name] = { before: rawMultiple, after: Math.round(capped * 10) / 10 };
          adjustments.push({ rule: "SCEPTICISM_>60_MULTIPLE_CAP", field: `${s.name}.multiple`, before: rawMultiple, after: cappedMultiples[s.name].after, reason: `Scepticisme ${scepticism} > 60 → cap multiple BULL` });
        }
      }
    }
  }

  // Build adjusted scenarios
  const adjusted: AdjustedScenarioV2[] = scenarios.map((s) => {
    const newProba = s.name === "CATASTROPHIC" ? cat
      : s.name === "BEAR" ? bear
      : s.name === "BASE" ? base
      : bull;

    const probaChanged = newProba !== s.probability.value;
    const multipleChanged = !!cappedMultiples[s.name];
    const isAdjusted = probaChanged || multipleChanged;

    const newMultiple = cappedMultiples[s.name]?.after ?? s.investorReturn?.multiple ?? 0;

    return {
      ...s,
      probability: {
        ...s.probability,
        value: newProba,
        ...(probaChanged && {
          rationale: `${s.probability.rationale} [AJUSTÉ: cohérence tier3, original: ${s.probability.value}%]`,
        }),
      },
      investorReturn: {
        ...s.investorReturn,
        multiple: newMultiple,
        ...(multipleChanged && {
          multipleCalculation: `${s.investorReturn.multipleCalculation} [AJUSTÉ: cohérence tier3, original: ${cappedMultiples[s.name].before}x]`,
        }),
      },
      adjusted: isAdjusted,
      reliable: scepticism < 60 || s.name === "CATASTROPHIC" || s.name === "BEAR",
      originalProbability: probaChanged ? s.probability.value : undefined,
      originalMultiple: multipleChanged ? cappedMultiples[s.name].before : undefined,
    } as AdjustedScenarioV2;
  });

  return { adjusted, adjustments };
}

// ============================================================================
// COHERENCE SCORE
// ============================================================================

/**
 * Mesure la cohérence AVANT ajustements (0-100, 100 = parfaitement cohérent)
 */
function computeCoherenceScore(
  scenarios: ScenarioV2[],
  scepticism: number,
  t1Avg: number | null,
  criticalRedFlags: number
): number {
  let score = 100;

  const byName: Record<string, ScenarioV2> = {};
  for (const s of scenarios) byName[s.name] = s;

  const bullProba = byName["BULL"]?.probability?.value ?? 0;
  const baseProba = byName["BASE"]?.probability?.value ?? 0;
  const catProba = byName["CATASTROPHIC"]?.probability?.value ?? 0;
  const bullMultiple = byName["BULL"]?.investorReturn?.multiple ?? 0;
  const baseMultiple = byName["BASE"]?.investorReturn?.multiple ?? 0;

  // Incohérence: scepticisme élevé mais BULL dominant
  if (scepticism > 70 && bullProba > 20) {
    score -= Math.min(30, (bullProba - 20) * 2);
  }

  // Incohérence: scepticisme élevé mais BASE élevé
  if (scepticism > 70 && baseProba > 30) {
    score -= Math.min(20, (baseProba - 30));
  }

  // Incohérence: scepticisme > 80 mais CATASTROPHIC < 30%
  if (scepticism > 80 && catProba < 30) {
    score -= Math.min(25, (30 - catProba));
  }

  // Incohérence: T1 avg < 40 mais multiples optimistes
  if (t1Avg !== null && t1Avg < 40) {
    if (bullMultiple > 5) score -= 15;
    if (baseMultiple > 3) score -= 10;
  }

  // Incohérence: beaucoup de red flags critiques mais CATASTROPHIC faible
  if (criticalRedFlags > 3 && catProba < 25) {
    score -= Math.min(20, criticalRedFlags * 3);
  }

  return Math.max(0, score);
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Applique les vérifications de cohérence inter-agents Tier 3.
 * Module déterministe — aucun appel LLM.
 *
 * @param allResults - Tous les résultats disponibles (T1 + T3 Batch 1)
 * @returns CoherenceResult avec scénarios ajustés si nécessaire
 */
export function applyTier3Coherence(
  allResults: Record<string, AgentResult>
): CoherenceResult {
  const warnings: string[] = [];

  // Extract inputs
  const scepticism = extractScepticismScore(allResults);
  const scenarios = extractScenarios(allResults);
  const t1Avg = extractT1AverageScore(allResults);
  const criticalRedFlags = extractCriticalRedFlagCount(allResults);

  // If scenario-modeler or devils-advocate failed, return no-op
  if (scenarios === null || scenarios.length === 0) {
    warnings.push("scenario-modeler n'a pas produit de scénarios — cohérence impossible");
    return {
      adjusted: false,
      adjustments: [],
      adjustedScenarios: [],
      adjustedProbabilityWeightedOutcome: {
        expectedMultiple: 0,
        expectedMultipleCalculation: "N/A — scénarios manquants",
        expectedIRR: 0,
        reliable: false,
      },
      coherenceScore: 0,
      warnings,
    };
  }

  if (scepticism === null) {
    warnings.push("devils-advocate n'a pas produit de score de scepticisme — cohérence partielle (règles T1 uniquement)");
  }

  const effectiveScepticism = scepticism ?? 50; // Default neutral

  // Compute pre-adjustment coherence score
  const coherenceScore = computeCoherenceScore(scenarios, effectiveScepticism, t1Avg, criticalRedFlags);

  // Apply rules
  const { adjusted, adjustments } = applyCoherenceRules(
    scenarios, effectiveScepticism, t1Avg, criticalRedFlags
  );

  // Recompute probability-weighted outcome
  const expectedMultiple = adjusted.reduce((sum, s) => {
    const proba = s.probability.value / 100;
    const multiple = s.investorReturn?.multiple ?? 0;
    return sum + proba * multiple;
  }, 0);

  const expectedMultipleCalc = adjusted
    .map((s) => `${s.probability.value}%×${(s.investorReturn?.multiple ?? 0).toFixed(1)}x`)
    .join(" + ");

  // Rough IRR estimate (assuming 5-year hold)
  const expectedIRR = expectedMultiple > 0
    ? (Math.pow(expectedMultiple, 1 / 5) - 1) * 100
    : -100;

  const reliable = effectiveScepticism < 60 && coherenceScore > 60;

  if (adjustments.length > 0) {
    console.log(`[Tier3Coherence] Applied ${adjustments.length} adjustments (coherence score was ${coherenceScore}/100)`);
    for (const a of adjustments) {
      console.log(`  [${a.rule}] ${a.field}: ${a.before} → ${a.after} (${a.reason})`);
    }
  } else {
    console.log(`[Tier3Coherence] No adjustments needed (coherence score: ${coherenceScore}/100)`);
  }

  return {
    adjusted: adjustments.length > 0,
    adjustments,
    adjustedScenarios: adjusted,
    adjustedProbabilityWeightedOutcome: {
      expectedMultiple: Math.round(expectedMultiple * 100) / 100,
      expectedMultipleCalculation: `${expectedMultipleCalc} = ${expectedMultiple.toFixed(2)}x`,
      expectedIRR: Math.round(expectedIRR * 10) / 10,
      reliable,
    },
    coherenceScore,
    warnings,
  };
}

/**
 * Injecte les résultats de cohérence dans le contexte pour synthesis-deal-scorer.
 * Modifie in-place enrichedContext.previousResults["scenario-modeler"]
 */
export function injectCoherenceIntoContext(
  allResults: Record<string, AgentResult>,
  coherenceResult: CoherenceResult
): void {
  if (!coherenceResult.adjusted) return;

  const smResult = allResults["scenario-modeler"];
  if (!smResult?.success) return;

  const data = getResultData(smResult) as ScenarioModelerData | null;
  if (!data?.findings) return;

  // Update scenarios with adjusted versions
  data.findings.scenarios = coherenceResult.adjustedScenarios;

  // Update probability-weighted outcome
  data.findings.probabilityWeightedOutcome = {
    ...data.findings.probabilityWeightedOutcome,
    expectedMultiple: coherenceResult.adjustedProbabilityWeightedOutcome.expectedMultiple,
    expectedMultipleCalculation: coherenceResult.adjustedProbabilityWeightedOutcome.expectedMultipleCalculation,
  };

  // Tag the result with coherence metadata
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tagged = smResult as any;
  tagged.coherenceApplied = true;
  tagged.coherenceScore = coherenceResult.coherenceScore;
}
