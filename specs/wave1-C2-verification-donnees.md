# Wave 1 - Agent C2 : Verification & Donnees

**Date** : 2026-02-11
**Auteur** : Agent C2
**Scope** : 9 failles CRITICAL (F03, F04, F06, F07, F08, F09, F10, F19, F23)
**Statut** : Spec de correction detaillee

---

## Table des matieres

1. [F03 - Scoring 100% LLM, non deterministe](#f03)
2. [F04 - Calculs financiers LLM jamais verifies](#f04)
3. [F06 - Benchmarks hard-codes et obsoletes](#f06)
4. [F07 - Pas de verification independante des donnees financieres](#f07)
5. [F08 - Hallucination concurrents/benchmarks non verifiee](#f08)
6. [F09 - Verification fondateurs non croisee](#f09)
7. [F10 - Pas de recherche active de concurrents](#f10)
8. [F19 - Analyse de marche pure top-down](#f19)
9. [F23 - Deal source / sourcing bias non analyse](#f23)

---

## F03 - Scoring 100% LLM, non deterministe, non reproductible {#f03}

### Diagnostic

**Fichiers problematiques :**

1. **`/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier1/financial-auditor.ts`** (lignes 58-72, 436-474, 572-576)
   - Le prompt demande au LLM de produire un score 0-100 et un breakdown complet :
   ```typescript
   // Ligne 64-72 : LLMFinancialAuditResponse.score
   score: {
     value: number;          // <-- LE LLM CHOISIT CE SCORE
     breakdown: {
       criterion: string;
       weight: number;
       score: number;        // <-- LE LLM CHOISIT CHAQUE SOUS-SCORE
       justification: string;
     }[];
   };
   ```
   - Ligne 572 : le score brut du LLM est pris tel quel :
   ```typescript
   const { data } = await this.llmCompleteJSON<LLMFinancialAuditResponse>(prompt);
   return this.normalizeResponse(data, sector, stage);
   ```
   - Ligne 598 : `normalizeResponse` applique des caps mais le score de base vient du LLM.

2. **Meme pattern dans TOUS les agents Tier 1** :
   - `team-investigator.ts` (ligne 815) : `const { data } = await this.llmCompleteJSON<LLMTeamInvestigatorResponse>(prompt);`
   - `competitive-intel.ts` (ligne 594)
   - `market-intelligence.ts` (ligne 569)
   - Et tous les autres agents Tier 1 suivent ce pattern.

3. **`/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier3/synthesis-deal-scorer.ts`** (ligne 776)
   - Le score final est aussi produit par un LLM :
   ```typescript
   const { data } = await this.llmCompleteJSON<LLMSynthesisResponse>(prompt);
   ```
   - Ligne 1291 : `const overallScore = data.score?.value ?? data.overallScore ?? computedWeighted ?? 50;`
   - Le `computedWeighted` est un fallback, pas la source primaire.

4. **`/Users/sacharebbouh/Desktop/angeldesk/src/scoring/services/score-aggregator.ts`** : EXISTE et FONCTIONNE mais n'est JAMAIS appele par les agents. Ce fichier contient un systeme complet de scoring deterministe avec :
   - `aggregateFindings()` (ligne 48) : agregation par dimension avec ponderation et confidence
   - `createScoredFinding()` (ligne 418) : creation de findings structures
   - Dimension weights configures (team: 0.25, market: 0.20, product: 0.20, financials: 0.25, timing: 0.10)

5. **`/Users/sacharebbouh/Desktop/angeldesk/src/scoring/services/metric-registry.ts`** : EXISTE avec 25+ metriques definies (arr, arr_growth, burn_multiple, ltv_cac_ratio, etc.) mais n'est JAMAIS utilise par les agents pour scorer.

6. **`/Users/sacharebbouh/Desktop/angeldesk/src/scoring/services/benchmark-service.ts`** : Utilise par `financial-auditor` pour lookup, mais les percentiles calcules ne sont PAS utilises pour le scoring deterministe.

### Correction

**Strategie** : Separer extraction (LLM) et scoring (code deterministe). Chaque agent Tier 1 extrait des metriques brutes via le LLM, puis un post-processing en code calcule les scores.

#### Etape 1 : Creer un service de scoring post-LLM

**Nouveau fichier** : `src/scoring/services/agent-score-calculator.ts`

```typescript
/**
 * Agent Score Calculator
 * Calcule des scores DETERMINISTES a partir des metriques extraites par le LLM.
 * Le LLM extrait les donnees, le CODE calcule les scores.
 */

import { benchmarkService } from "./benchmark-service";
import { metricRegistry } from "./metric-registry";
import { confidenceCalculator } from "./confidence-calculator";
import { scoreAggregator, createScoredFinding } from "./score-aggregator";
import type {
  ScoredFinding,
  ObjectiveDealScore,
  FindingCategory,
  ConfidenceContext,
} from "../types";

// ==========================================================================
// INTERFACES
// ==========================================================================

/** Metrique brute extraite par le LLM */
export interface ExtractedMetric {
  name: string;                // Ex: "arr", "burn_multiple", "ltv_cac_ratio"
  value: number | null;        // Valeur numerique extraite
  unit: string;                // "EUR", "%", "x", "months"
  source: string;              // "Slide 8", "Financial Model Onglet 3"
  dataReliability: "AUDITED" | "VERIFIED" | "DECLARED" | "PROJECTED" | "ESTIMATED" | "UNVERIFIABLE";
  category: FindingCategory;
  calculation?: string;        // Si calcule, montrer la formule
}

/** Resultat du scoring deterministe pour un agent */
export interface DeterministicScoreResult {
  score: number;               // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
  breakdown: {
    criterion: string;
    weight: number;
    score: number;
    justification: string;
  }[];
  findings: ScoredFinding[];
  confidence: number;          // 0-100
  expectedVariance: number;    // Variance attendue entre re-runs
}

// ==========================================================================
// CALCULATOR
// ==========================================================================

export async function calculateAgentScore(
  agentName: string,
  extractedMetrics: ExtractedMetric[],
  sector: string,
  stage: string,
  scoringCriteria: Record<string, { weight: number; metrics: string[] }>,
): Promise<DeterministicScoreResult> {
  const findings: ScoredFinding[] = [];

  // 1. Pour chaque metrique extraite, creer un ScoredFinding
  for (const metric of extractedMetrics) {
    if (metric.value === null) continue;

    // Lookup benchmark
    const benchmarkResult = await benchmarkService.lookup(sector, stage, metric.name);
    let percentile: number | undefined;
    if (benchmarkResult.found && benchmarkResult.benchmark) {
      const percentileResult = benchmarkService.calculatePercentile(
        metric.value,
        benchmarkResult.benchmark
      );
      percentile = percentileResult.percentile;
    }

    // Calculer la confidence basee sur la fiabilite des donnees
    const confidenceContext: ConfidenceContext = {
      hasDirectEvidence: metric.dataReliability === "AUDITED" || metric.dataReliability === "VERIFIED",
      hasBenchmarkMatch: benchmarkResult.found,
      sourceCount: metric.dataReliability === "VERIFIED" ? 2 : 1,
      isVerified: metric.dataReliability !== "UNVERIFIABLE" && metric.dataReliability !== "ESTIMATED",
    };
    const confidence = confidenceCalculator.calculateForFinding({}, confidenceContext);

    // Calculer le score normalise via le metric registry
    const normalizedValue = metricRegistry.scoreValue(
      metric.name,
      metric.value,
      percentile
    );

    // Penalite si donnees projetees
    const reliabilityPenalty =
      metric.dataReliability === "PROJECTED" ? 0.7 :
      metric.dataReliability === "ESTIMATED" ? 0.8 :
      metric.dataReliability === "UNVERIFIABLE" ? 0.5 :
      1.0;

    const finding = createScoredFinding({
      agentName,
      metric: metric.name,
      category: metric.category,
      value: metric.value,
      unit: metric.unit,
      normalizedValue: normalizedValue * reliabilityPenalty,
      percentile,
      assessment: `${metric.source} | Reliability: ${metric.dataReliability}`,
      benchmarkData: benchmarkResult.benchmark,
      confidence,
      evidence: [{
        type: metric.calculation ? "calculation" : "quote",
        content: metric.calculation || `${metric.name}: ${metric.value}`,
        source: metric.source,
        confidence: confidence.score / 100,
      }],
    });

    findings.push(finding);
  }

  // 2. Agreger par critere de scoring
  const breakdown: DeterministicScoreResult["breakdown"] = [];
  let totalWeightedScore = 0;
  let totalWeight = 0;

  for (const [criterion, config] of Object.entries(scoringCriteria)) {
    const relevantFindings = findings.filter(f =>
      config.metrics.includes(f.metric)
    );

    if (relevantFindings.length === 0) {
      breakdown.push({
        criterion,
        weight: config.weight,
        score: 0,
        justification: "Aucune donnee disponible pour ce critere",
      });
      continue;
    }

    // Moyenne ponderee par confidence des findings
    const criterionScore = relevantFindings.reduce((sum, f) => {
      const weight = (f.confidence.score / 100);
      return sum + (f.normalizedValue ?? 50) * weight;
    }, 0) / relevantFindings.reduce((sum, f) => sum + (f.confidence.score / 100), 0);

    const clampedScore = Math.min(100, Math.max(0, Math.round(criterionScore)));

    breakdown.push({
      criterion,
      weight: config.weight,
      score: clampedScore,
      justification: relevantFindings.map(f =>
        `${f.metric}: ${f.value} (P${f.percentile ?? "N/A"}, conf: ${f.confidence.score}%)`
      ).join(" | "),
    });

    totalWeightedScore += clampedScore * config.weight;
    totalWeight += config.weight;
  }

  // 3. Score final
  const rawScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 50;
  const score = Math.min(100, Math.max(0, Math.round(rawScore)));

  const getGrade = (s: number): "A" | "B" | "C" | "D" | "F" => {
    if (s >= 80) return "A";
    if (s >= 65) return "B";
    if (s >= 50) return "C";
    if (s >= 35) return "D";
    return "F";
  };

  // 4. Confidence et variance
  const avgConfidence = findings.length > 0
    ? findings.reduce((sum, f) => sum + f.confidence.score, 0) / findings.length
    : 30;

  const benchmarkedRatio = findings.filter(f => f.benchmarkData).length / Math.max(1, findings.length);
  const expectedVariance = 25 * (1 - avgConfidence / 100) * (1 - benchmarkedRatio * 0.5);

  return {
    score,
    grade: getGrade(score),
    breakdown,
    findings,
    confidence: Math.round(avgConfidence),
    expectedVariance: Math.round(expectedVariance * 10) / 10,
  };
}
```

#### Etape 2 : Modifier chaque agent Tier 1

**Principe** : Le LLM produit des `extractedMetrics` au lieu de `score.value`. Le scoring est fait en post-processing.

**Exemple pour `financial-auditor.ts`** (meme pattern pour les 12 autres) :

```diff
// Dans normalizeResponse(), APRES avoir parse les findings du LLM :

+ // NOUVEAU : Extraire les metriques brutes pour scoring deterministe
+ const extractedMetrics: ExtractedMetric[] = [];
+ for (const m of data.findings?.metrics ?? []) {
+   if (m.reportedValue != null || m.calculatedValue != null) {
+     extractedMetrics.push({
+       name: mapMetricName(m.metric), // "ARR" -> "arr", etc.
+       value: m.calculatedValue ?? m.reportedValue ?? null,
+       unit: detectUnit(m.metric),
+       source: m.source ?? "Non specifie",
+       dataReliability: m.dataReliability ?? "DECLARED",
+       category: "financial",
+       calculation: m.calculation,
+     });
+   }
+ }
+
+ // SCORING DETERMINISTE (remplace le score LLM)
+ const deterministicScore = await calculateAgentScore(
+   "financial-auditor",
+   extractedMetrics,
+   sector,
+   stage,
+   SCORING_CRITERIA_MAP, // Mapping des criteres vers metriques
+ );
+
+ // Utiliser le score deterministe au lieu du score LLM
+ const score: AgentScore = {
+   value: deterministicScore.score,
+   grade: deterministicScore.grade,
+   breakdown: deterministicScore.breakdown,
+ };

- // ANCIEN : Score du LLM pris tel quel
- const scoreValue = Math.min(100, Math.max(0, data.score?.value ?? 50));
```

#### Etape 3 : Modifier synthesis-deal-scorer.ts

Le synthesis-deal-scorer (Tier 3) doit utiliser `scoreAggregator.aggregateFindings()` au lieu de demander au LLM un score :

```diff
// Dans execute() de synthesis-deal-scorer.ts

+ // Collecter TOUS les ScoredFindings des agents Tier 1
+ const allFindings: ScoredFinding[] = [];
+ for (const [agentName, result] of Object.entries(context.previousResults ?? {})) {
+   if (result?.success && "data" in result) {
+     const data = result.data as Record<string, unknown>;
+     if (Array.isArray(data.scoredFindings)) {
+       allFindings.push(...(data.scoredFindings as ScoredFinding[]));
+     }
+   }
+ }
+
+ // Score DETERMINISTE via scoreAggregator
+ const objectiveScore = scoreAggregator.aggregateFindings(
+   allFindings,
+   context.deal.id,
+   context.analysisId ?? "unknown",
+ );
+
+ // Le LLM produit UNIQUEMENT : narrative, investment thesis, red flags consolides
+ // Le score vient du code
```

### Dependances

- F04 (les metriques extraites alimentent les calculs verifies)
- F06 (les benchmarks doivent etre a jour pour le scoring)
- F08 (les entites dans dbCrossReference doivent etre verifiees avant scoring)

### Verification

1. **Test de reproductibilite** : Analyser le meme deal 5 fois. Le score doit varier de max `expectedVariance` points (typiquement < 5 pts).
2. **Test unitaire** : Passer des metriques fixes a `calculateAgentScore()`, verifier que le score est toujours identique.
3. **Test de regression** : Comparer les scores avant/apres sur 10 deals existants, documenter les ecarts.

---

## F04 - Calculs financiers LLM jamais verifies cote serveur {#f04}

### Diagnostic

**Fichiers problematiques :**

1. **`/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier1/financial-auditor.ts`** (lignes 77-114)
   - Le LLM calcule directement dans le JSON les metriques financieres :
   ```typescript
   // Ligne 77-82 : Le LLM rapporte calculatedValue et percentile
   metrics: {
     metric: string;
     reportedValue?: number;
     calculatedValue?: number;   // <-- CALCULE PAR LE LLM
     benchmarkP25?: number;
     benchmarkMedian?: number;
     percentile?: number;         // <-- CALCULE PAR LE LLM
   ```
   - Ligne 572 : Aucune verification post-LLM des calculs.

2. **`/Users/sacharebbouh/Desktop/angeldesk/src/agents/orchestration/utils/financial-calculations.ts`** : EXISTE avec des fonctions propres :
   - `calculateARR(mrr, source)` (ligne 18)
   - `calculateGrossMargin(revenue, cogs, ...)` (ligne 32)
   - `calculateLTVCACRatio(ltv, cac, ...)` (ligne 75)
   - `calculateCAGR(startValue, endValue, years, ...)` (ligne 53)
   - `calculatePercentile(value, benchmarks)` (ligne 133)
   - `calculateRuleOf40(...)` (ligne 95)
   - `calculatePercentageDeviation(...)` (ligne 119)
   - Mais AUCUN agent ne les appelle.

### Correction

**Nouveau fichier** : `src/agents/orchestration/utils/financial-verification.ts`

```typescript
/**
 * Financial Verification Layer
 * Recalcule cote serveur les metriques financieres produites par le LLM.
 * Flag les ecarts > 5%.
 */

import {
  calculateARR,
  calculateGrossMargin,
  calculateLTVCACRatio,
  calculateCAGR,
  calculatePercentile,
  calculatePercentageDeviation,
  type CalculationResult,
} from "./financial-calculations";
import { getBenchmarkFull } from "@/services/benchmarks";

export interface VerificationResult {
  metric: string;
  llmValue: number;
  serverValue: number;
  deviation: number;       // % d'ecart
  isDiscrepancy: boolean;  // true si ecart > 5%
  severity: "OK" | "WARNING" | "CRITICAL";
  serverCalculation: string;
  redFlag?: {
    title: string;
    description: string;
    impact: string;
  };
}

export interface FinancialVerificationReport {
  totalMetrics: number;
  verifiedMetrics: number;
  discrepancies: VerificationResult[];
  overallReliability: "HIGH" | "MEDIUM" | "LOW";
}

/**
 * Verifie les metriques financieres du LLM.
 * Recalcule chaque metrique quand les inputs sont disponibles.
 */
export function verifyFinancialMetrics(
  llmMetrics: Array<{
    metric: string;
    reportedValue?: number;
    calculatedValue?: number;
    calculation?: string;
  }>,
  rawInputs: {
    mrr?: number;
    revenue?: number;
    cogs?: number;
    ltv?: number;
    cac?: number;
    monthlyBurn?: number;
    cashOnHand?: number;
    netNewARR?: number;
    revenueGrowth?: number;
    profitMargin?: number;
    valuation?: number;
    arr?: number;
  },
  sector: string,
  stage: string,
): FinancialVerificationReport {
  const results: VerificationResult[] = [];

  // 1. Verifier ARR si MRR disponible
  if (rawInputs.mrr) {
    const serverARR = calculateARR(rawInputs.mrr, "server-verification");
    const llmARR = llmMetrics.find(m =>
      m.metric.toLowerCase().includes("arr") && !m.metric.toLowerCase().includes("growth")
    );
    if (llmARR?.calculatedValue) {
      const { deviation, significant } = calculatePercentageDeviation(
        llmARR.calculatedValue,
        serverARR.value
      );
      results.push({
        metric: "ARR",
        llmValue: llmARR.calculatedValue,
        serverValue: serverARR.value,
        deviation,
        isDiscrepancy: significant || deviation > 5,
        severity: deviation > 20 ? "CRITICAL" : deviation > 5 ? "WARNING" : "OK",
        serverCalculation: serverARR.calculation,
        redFlag: deviation > 5 ? {
          title: `Ecart ARR: LLM=${llmARR.calculatedValue} vs Serveur=${serverARR.value}`,
          description: `Le LLM a calcule un ARR de ${llmARR.calculatedValue} mais le calcul serveur (MRR x 12) donne ${serverARR.value}. Ecart de ${deviation.toFixed(1)}%.`,
          impact: "Le score et les benchmarks sont bases sur une metrique potentiellement fausse.",
        } : undefined,
      });
    }
  }

  // 2. Verifier Gross Margin
  if (rawInputs.revenue && rawInputs.cogs) {
    const serverGM = calculateGrossMargin(
      rawInputs.revenue, rawInputs.cogs,
      "server", "server"
    );
    const llmGM = llmMetrics.find(m =>
      m.metric.toLowerCase().includes("gross") && m.metric.toLowerCase().includes("margin")
    );
    if (llmGM?.calculatedValue) {
      const { deviation } = calculatePercentageDeviation(llmGM.calculatedValue, serverGM.value);
      results.push({
        metric: "Gross Margin",
        llmValue: llmGM.calculatedValue,
        serverValue: serverGM.value,
        deviation,
        isDiscrepancy: deviation > 5,
        severity: deviation > 20 ? "CRITICAL" : deviation > 5 ? "WARNING" : "OK",
        serverCalculation: serverGM.calculation,
      });
    }
  }

  // 3. Verifier LTV/CAC
  if (rawInputs.ltv && rawInputs.cac) {
    const serverRatio = calculateLTVCACRatio(
      rawInputs.ltv, rawInputs.cac,
      "server", "server"
    );
    const llmRatio = llmMetrics.find(m =>
      m.metric.toLowerCase().includes("ltv") && m.metric.toLowerCase().includes("cac")
    );
    if (llmRatio?.calculatedValue) {
      const { deviation } = calculatePercentageDeviation(llmRatio.calculatedValue, serverRatio.value);
      results.push({
        metric: "LTV/CAC Ratio",
        llmValue: llmRatio.calculatedValue,
        serverValue: serverRatio.value,
        deviation,
        isDiscrepancy: deviation > 5,
        severity: deviation > 20 ? "CRITICAL" : deviation > 5 ? "WARNING" : "OK",
        serverCalculation: serverRatio.calculation,
      });
    }
  }

  // 4. Verifier Burn Multiple
  if (rawInputs.monthlyBurn && rawInputs.netNewARR) {
    const serverBurnMultiple = (rawInputs.monthlyBurn * 12) / rawInputs.netNewARR;
    const llmBM = llmMetrics.find(m => m.metric.toLowerCase().includes("burn multiple"));
    if (llmBM?.calculatedValue) {
      const { deviation } = calculatePercentageDeviation(llmBM.calculatedValue, serverBurnMultiple);
      results.push({
        metric: "Burn Multiple",
        llmValue: llmBM.calculatedValue,
        serverValue: serverBurnMultiple,
        deviation,
        isDiscrepancy: deviation > 5,
        severity: deviation > 20 ? "CRITICAL" : deviation > 5 ? "WARNING" : "OK",
        serverCalculation: `(Monthly Burn ${rawInputs.monthlyBurn} x 12) / Net New ARR ${rawInputs.netNewARR} = ${serverBurnMultiple.toFixed(2)}x`,
      });
    }
  }

  // 5. Verifier les percentiles vs benchmarks
  for (const llmMetric of llmMetrics) {
    if (llmMetric.calculatedValue == null) continue;
    const benchmark = getBenchmarkFull(sector, stage, mapMetricToBenchmarkKey(llmMetric.metric));
    if (!benchmark || benchmark.median === 0) continue;

    const serverPercentile = calculatePercentile(llmMetric.calculatedValue, {
      p25: benchmark.p25,
      median: benchmark.median,
      p75: benchmark.p75,
    });
    // On ne peut pas comparer le percentile directement car le LLM ne le produit pas toujours
    // Mais on s'assure que nos propres calculs sont corrects
  }

  // Bilan
  const discrepancies = results.filter(r => r.isDiscrepancy);
  const overallReliability: "HIGH" | "MEDIUM" | "LOW" =
    discrepancies.some(d => d.severity === "CRITICAL") ? "LOW" :
    discrepancies.some(d => d.severity === "WARNING") ? "MEDIUM" :
    "HIGH";

  return {
    totalMetrics: llmMetrics.length,
    verifiedMetrics: results.length,
    discrepancies,
    overallReliability,
  };
}

function mapMetricToBenchmarkKey(metric: string): string {
  const lower = metric.toLowerCase();
  if (lower.includes("arr") && lower.includes("growth")) return "arrGrowthYoY";
  if (lower.includes("nrr") || lower.includes("retention")) return "nrr";
  if (lower.includes("burn")) return "burnMultiple";
  if (lower.includes("valuation") || lower.includes("multiple")) return "valuationMultiple";
  if (lower.includes("ltv") && lower.includes("cac")) return "ltvCacRatio";
  return metric;
}
```

**Integration dans `financial-auditor.ts`** (dans `normalizeResponse`) :

```diff
+ import { verifyFinancialMetrics } from "../orchestration/utils/financial-verification";

  // Apres le parsing des findings LLM :
+ const verificationReport = verifyFinancialMetrics(
+   data.findings?.metrics ?? [],
+   extractRawInputs(data),  // Extraire MRR, revenue, COGS, etc. des metrics
+   sector,
+   stage,
+ );
+
+ // Ajouter les ecarts comme red flags
+ for (const disc of verificationReport.discrepancies) {
+   if (disc.severity === "CRITICAL" && disc.redFlag) {
+     redFlags.push({
+       id: `RF-CALC-${disc.metric}`,
+       category: "inconsistency",
+       severity: "HIGH",
+       title: disc.redFlag.title,
+       description: disc.redFlag.description,
+       location: "Financial calculations",
+       evidence: `LLM: ${disc.llmValue} vs Serveur: ${disc.serverValue} (ecart ${disc.deviation.toFixed(1)}%)`,
+       impact: disc.redFlag.impact,
+       question: "Pouvez-vous confirmer le calcul exact ?",
+       redFlagIfBadAnswer: "",
+     });
+   }
+ }
```

### Dependances

- F03 (les metriques verifiees alimentent le scoring deterministe)
- F07 (la verification independante Pappers est un autre layer de verification)

### Verification

1. **Test unitaire** : Passer des metriques LLM avec des erreurs connues (ARR = MRR x 10 au lieu de x12) et verifier que le flag est leve.
2. **Test d'integration** : Lancer une analyse complete sur un deal avec financial model Excel, verifier que les ecarts sont detectes.
3. **Monitoring** : Logger le `overallReliability` de chaque analyse pour tracking.

---

## F06 - Benchmarks hard-codes et obsoletes {#f06}

### Diagnostic

**Fichiers problematiques :**

1. **`/Users/sacharebbouh/Desktop/angeldesk/src/services/benchmarks/config.ts`** (tout le fichier)
   - Toutes les valeurs sont hard-codees avec des sources generiques :
   ```typescript
   // Ligne 23-28 : Sources datees "2024" sans date precise ni URL
   arrGrowthYoY: { p25: 80, median: 150, p75: 250, source: "First Round 2024" },
   nrr: { p25: 90, median: 100, p75: 115, source: "Estimation early stage" },
   burnMultiple: { p25: 2, median: 3, p75: 5, source: "SaaStr 2024" },
   ```
   - Aucun champ `lastUpdated`, `expiresAt`, ou `sourceUrl`.
   - Les benchmarks "2024" seront obsoletes en 2026 sans aucune alerte.

2. **`/Users/sacharebbouh/Desktop/angeldesk/src/services/benchmarks/types.ts`** (lignes 26-31)
   - Le type `PercentileBenchmark` n'a PAS de champ de date :
   ```typescript
   export interface PercentileBenchmark {
     p25: number;
     median: number;
     p75: number;
     source?: string; // Juste un string, pas de date
   }
   ```

3. **`/Users/sacharebbouh/Desktop/angeldesk/src/services/benchmarks/dynamic-benchmarks.ts`** : Recherche web via Perplexity mais les resultats sont du texte parse par regex (lignes 308-365), non structure, non verifiable.

### Correction

#### Etape 1 : Enrichir le type PercentileBenchmark

**Fichier** : `src/services/benchmarks/types.ts`

```diff
  export interface PercentileBenchmark {
    p25: number;
    median: number;
    p75: number;
    source?: string;
+   sourceUrl?: string;          // URL du rapport source
+   lastUpdated: string;         // ISO date de la derniere mise a jour
+   expiresAt: string;           // ISO date d'expiration (lastUpdated + 12 mois)
+   dataYear: number;            // Annee des donnees (ex: 2024, 2025)
  }
```

#### Etape 2 : Ajouter dates a tous les benchmarks hard-codes

**Fichier** : `src/services/benchmarks/config.ts`

```diff
  // Chaque benchmark doit avoir lastUpdated et expiresAt
  arrGrowthYoY: {
    p25: 80, median: 150, p75: 250,
-   source: "First Round 2024"
+   source: "First Round State of Startups 2024",
+   sourceUrl: "https://stateofstartups.firstround.com/2024",
+   lastUpdated: "2024-11-01",
+   expiresAt: "2025-11-01",
+   dataYear: 2024,
  },
```

#### Etape 3 : Creer un service de freshness check

**Nouveau fichier** : `src/services/benchmarks/freshness-checker.ts`

```typescript
/**
 * Benchmark Freshness Checker
 * Alerte quand les benchmarks sont expires ou proches de l'expiration.
 */

import { BENCHMARK_CONFIG, GENERIC_STAGE_BENCHMARKS } from "./config";
import type { PercentileBenchmark } from "./types";

export interface FreshnessReport {
  totalBenchmarks: number;
  expired: BenchmarkStatus[];
  expiringSoon: BenchmarkStatus[]; // < 3 mois
  fresh: number;
  overallStatus: "FRESH" | "STALE" | "EXPIRED";
}

interface BenchmarkStatus {
  sector: string;
  stage: string;
  metric: string;
  lastUpdated: string;
  expiresAt: string;
  daysUntilExpiry: number;
}

export function checkBenchmarkFreshness(): FreshnessReport {
  const now = new Date();
  const expired: BenchmarkStatus[] = [];
  const expiringSoon: BenchmarkStatus[] = [];
  let totalBenchmarks = 0;

  function checkBenchmark(sector: string, stage: string, metric: string, b: PercentileBenchmark) {
    totalBenchmarks++;
    if (!b.expiresAt) {
      // Pas de date d'expiration = considere comme expire
      expired.push({
        sector, stage, metric,
        lastUpdated: b.lastUpdated || "UNKNOWN",
        expiresAt: "NEVER_SET",
        daysUntilExpiry: -999,
      });
      return;
    }

    const expiresDate = new Date(b.expiresAt);
    const daysUntilExpiry = Math.floor((expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      expired.push({ sector, stage, metric, lastUpdated: b.lastUpdated, expiresAt: b.expiresAt, daysUntilExpiry });
    } else if (daysUntilExpiry < 90) {
      expiringSoon.push({ sector, stage, metric, lastUpdated: b.lastUpdated, expiresAt: b.expiresAt, daysUntilExpiry });
    }
  }

  // Parcourir tous les benchmarks
  for (const [sector, stages] of Object.entries(BENCHMARK_CONFIG)) {
    for (const [stage, benchmarks] of Object.entries(stages ?? {})) {
      if (benchmarks?.financial) {
        for (const [metric, data] of Object.entries(benchmarks.financial)) {
          if (data && typeof data === "object" && "median" in data) {
            checkBenchmark(sector, stage, metric, data as PercentileBenchmark);
          }
        }
      }
    }
  }

  const fresh = totalBenchmarks - expired.length - expiringSoon.length;
  const overallStatus: "FRESH" | "STALE" | "EXPIRED" =
    expired.length > 0 ? "EXPIRED" :
    expiringSoon.length > totalBenchmarks * 0.3 ? "STALE" :
    "FRESH";

  return { totalBenchmarks, expired, expiringSoon, fresh, overallStatus };
}
```

#### Etape 4 : Injecter le warning de freshness dans les analyses

Chaque agent qui utilise des benchmarks doit ajouter un warning si les benchmarks sont expires :

```typescript
// Dans financial-auditor.ts, au debut de fetchBenchmarks() :
const freshness = checkBenchmarkFreshness();
if (freshness.overallStatus === "EXPIRED") {
  // Ajouter dans meta.limitations
  limitations.push(`ATTENTION: ${freshness.expired.length} benchmarks expires. Scores potentiellement desalignes du marche actuel.`);
}
```

### Dependances

- F03 (le scoring utilise les benchmarks)
- F04 (la verification financiere utilise les benchmarks)

### Verification

1. **Test unitaire** : Creer un benchmark avec `expiresAt` dans le passe, verifier que `checkBenchmarkFreshness()` le detecte.
2. **Test d'integration** : Lancer une analyse avec des benchmarks expires, verifier que le warning apparait dans `meta.limitations`.
3. **Cron** : Ajouter un endpoint `/api/admin/benchmark-freshness` pour monitoring.

---

## F07 - Pas de verification independante des donnees financieres {#f07}

### Diagnostic

**Fichiers problematiques :**

1. **`/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier1/financial-auditor.ts`** (lignes 378-576)
   - La methode `execute()` ne consulte JAMAIS Pappers ou Societe.com
   - Les chiffres financiers du deck sont transmis au LLM tels quels
   - Aucune comparaison avec des sources officielles

2. **`/Users/sacharebbouh/Desktop/angeldesk/src/services/context-engine/connectors/pappers.ts`** : EXISTE et FONCTIONNE avec :
   - `enrichFrenchCompany(companyName)` (ligne 332) : retourne `finances` avec CA, resultat, effectif par annee
   - `verifyFrenchFounder(founderName, companyName)` (ligne 441)
   - `getCompanyFinances(siren)` (ligne 319) : donnees financieres detaillees
   - `calculateGrowthMetrics(finances)` (ligne 495) : croissance CA, marge, etc.

3. **`/Users/sacharebbouh/Desktop/angeldesk/src/services/context-engine/connectors/societe-com.ts`** : EXISTE avec :
   - `validateFinancials(companyName, claimedRevenue, claimedEmployees)` (ligne 367) : compare claims vs donnees officielles, retourne `discrepancies`
   - `enrichFromSocieteCom(companyName)` (ligne 310) : CA, resultat, capital, dirigeants

4. **`/Users/sacharebbouh/Desktop/angeldesk/src/services/context-engine/index.ts`** (lignes 91-136) : Les connecteurs sont enregistres mais leurs donnees arrivent dans `context.contextEngine`, pas dans le financial-auditor specifiquement.

### Correction

**Modifier `financial-auditor.ts`** : Ajouter une etape de verification independante AVANT l'appel LLM.

```diff
  protected async execute(context: EnrichedAgentContext): Promise<FinancialAuditData> {
    const dealContext = this.formatDealContext(context);
    const contextEngineData = this.formatContextEngineData(context);
    const extractedInfo = this.getExtractedInfo(context);

+   // =====================================================
+   // VERIFICATION INDEPENDANTE VIA REGISTRES OFFICIELS
+   // =====================================================
+   const companyName = context.deal.companyName || context.deal.name;
+   let registryVerification = "";
+   const registryRedFlags: AgentRedFlag[] = [];
+
+   try {
+     // Essayer Pappers d'abord (plus fiable, API structuree)
+     const { enrichFrenchCompany } = await import(
+       "@/services/context-engine/connectors/pappers"
+     );
+     const pappersData = await enrichFrenchCompany(companyName);
+
+     if (pappersData?.found && pappersData.finances?.length) {
+       const latestFinance = pappersData.finances
+         .sort((a, b) => b.year - a.year)[0];
+
+       registryVerification += `\n## DONNEES REGISTRE OFFICIEL (Pappers.fr - Source: Greffe du Tribunal)
+ **SIREN**: ${pappersData.siren}
+ **Statut**: ${pappersData.status}
+ **Date creation**: ${pappersData.dateCreation}
+ **Effectif**: ${pappersData.effectif ?? "Non disponible"}
+ **Capital social**: ${pappersData.capitalSocial ? pappersData.capitalSocial + "EUR" : "Non disponible"}
+
+ ### Dernieres donnees financieres (${latestFinance.year})
+ - **CA officiel**: ${latestFinance.revenue ? latestFinance.revenue + "EUR" : "Non depose"}
+ - **Resultat**: ${latestFinance.result ? latestFinance.result + "EUR" : "Non depose"}
+ - **Effectif**: ${latestFinance.employees ?? "Non disponible"}
+
+ **IMPORTANT**: Compare OBLIGATOIREMENT les chiffres du deck aux chiffres officiels ci-dessus.
+ Si ecart CA > 20%, genere un red flag CRITICAL.
+ Si les comptes n'ont pas ete deposes, genere un red flag HIGH "comptes non deposes".
+ `;
+
+       // Red flags automatiques
+       if (pappersData.redFlags && pappersData.redFlags.length > 0) {
+         for (const rf of pappersData.redFlags) {
+           registryRedFlags.push({
+             id: `RF-REGISTRY-${registryRedFlags.length + 1}`,
+             category: "verification",
+             severity: rf.includes("cessée") || rf.includes("collective") ? "CRITICAL" : "HIGH",
+             title: `Registre officiel: ${rf}`,
+             description: `Pappers.fr signale: ${rf}`,
+             location: "Registre du commerce (Pappers.fr)",
+             evidence: `Source: Pappers.fr SIREN ${pappersData.siren}`,
+             impact: "Information officielle non mentionnee dans le deck",
+             question: "Pouvez-vous expliquer ce point ?",
+             redFlagIfBadAnswer: "",
+           });
+         }
+       }
+
+       // Verifier dirigeants vs fondateurs declares
+       if (pappersData.dirigeants && pappersData.dirigeants.length > 0) {
+         registryVerification += `\n### Dirigeants officiels (Registre)
+ ${pappersData.dirigeants.map(d => `- ${d.name} (${d.role}, depuis ${d.since || "N/A"})`).join("\n")}
+
+ **CROSS-REFERENCE OBLIGATOIRE**: Compare avec les fondateurs du deck. Signale si un fondateur
+ du deck N'EST PAS dirigeant officiel (possible red flag structurel).
+ `;
+       }
+     }
+
+     // Fallback: Societe.com si Pappers echoue
+     if (!pappersData?.found) {
+       const { validateFinancials } = await import(
+         "@/services/context-engine/connectors/societe-com"
+       );
+       // Extraire le CA declare du deck si disponible
+       const claimedRevenue = extractedInfo?.revenue as number | undefined;
+       const validation = await validateFinancials(companyName, claimedRevenue);
+
+       if (validation.validated === false && validation.discrepancies.length > 0) {
+         registryVerification += `\n## VERIFICATION SOCIETE.COM
+ ${validation.discrepancies.map(d => `- ${d}`).join("\n")}
+ CA officiel: ${validation.actualData?.revenue ?? "Non disponible"}
+ `;
+       }
+     }
+   } catch (error) {
+     registryVerification = "\n## VERIFICATION REGISTRE\nVerification impossible (erreur technique). Fiabilite des donnees financieres NON confirmee.";
+   }

    // Build user prompt (ajouter registryVerification)
    const prompt = `# ANALYSE FINANCIAL AUDITOR - ${deal.companyName || deal.name}

  ## DOCUMENTS FOURNIS
  ${dealContext}
  ${extractedSection}
  ${financialModelSection}
+ ${registryVerification}
  ...`;

    // Apres normalizeResponse, ajouter les red flags registre
+   const result = this.normalizeResponse(data, sector, stage);
+   result.redFlags = [...registryRedFlags, ...result.redFlags];
+   return result;
  }
```

### Dependances

- F04 (les donnees Pappers alimentent la verification financiere)
- F09 (les dirigeants Pappers servent a cross-ref les fondateurs)

### Verification

1. **Test avec startup francaise** : Analyser un deal avec une SAS connue, verifier que les donnees Pappers sont injectees.
2. **Test d'ecart** : Creer un deal avec CA declare 500K et CA reel 200K, verifier que le red flag CRITICAL est leve.
3. **Test fallback** : Desactiver la cle API Pappers, verifier que Societe.com prend le relais.

---

## F08 - Hallucination concurrents, benchmarks, comparables non verifiee {#f08}

### Diagnostic

**Fichiers problematiques :**

1. **`/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier1/competitive-intel.ts`** (lignes 593-597)
   ```typescript
   const { data } = await this.llmCompleteJSON<LLMCompetitiveIntelResponse>(prompt);
   return this.transformResponse(data, amountRaising);
   ```
   - Aucune verification que les concurrents nommes par le LLM existent reellement.
   - `transformResponse()` (lignes 600-780) normalise les types mais ne verifie PAS l'existence des entites.

2. **`/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier1/financial-auditor.ts`** (lignes 96-99)
   - Les `comparables` dans `valuation` sont produits par le LLM :
   ```typescript
   comparables: { name: string; multiple: number; stage: string; source: string }[];
   ```
   - Aucune verification que ces entreprises existent dans la Funding DB.

3. **Meme probleme dans** : `market-intelligence.ts` (timing.competitorActivity), `exit-strategist.ts` (comparables), `team-investigator.ts` (benchmarkComparison.similarSuccessfulTeams).

### Correction

**Nouveau fichier** : `src/agents/orchestration/utils/entity-verifier.ts`

```typescript
/**
 * Entity Verifier
 * Verifie que les entites mentionnees par le LLM existent dans la Funding DB
 * ou d'autres sources verifiables. Marque "[NON VERIFIE]" sinon.
 */

import { prisma } from "@/lib/prisma";

export interface EntityVerification {
  name: string;
  verified: boolean;
  source?: string;         // "Funding DB" | "Context Engine" | "Pappers"
  matchedEntity?: {
    id: string;
    name: string;
    sector?: string;
    lastFunding?: number;
  };
}

/**
 * Verifie une liste d'entites (entreprises) contre la Funding DB.
 * Retourne pour chaque entite si elle est verifiee ou non.
 */
export async function verifyEntities(
  entityNames: string[],
): Promise<Map<string, EntityVerification>> {
  const results = new Map<string, EntityVerification>();

  if (entityNames.length === 0) return results;

  // Batch lookup dans la Funding DB
  // Utiliser une recherche ILIKE pour tolerant aux variations de casse
  const dbDeals = await prisma.fundingDeal.findMany({
    where: {
      OR: entityNames.map(name => ({
        companyName: {
          contains: name,
          mode: "insensitive" as const,
        },
      })),
    },
    select: {
      id: true,
      companyName: true,
      sector: true,
      fundingAmount: true,
    },
    take: 100,
  });

  // Matcher les resultats
  for (const name of entityNames) {
    const nameLower = name.toLowerCase();
    const match = dbDeals.find(d =>
      d.companyName.toLowerCase().includes(nameLower) ||
      nameLower.includes(d.companyName.toLowerCase())
    );

    if (match) {
      results.set(name, {
        name,
        verified: true,
        source: "Funding DB",
        matchedEntity: {
          id: match.id,
          name: match.companyName,
          sector: match.sector ?? undefined,
          lastFunding: match.fundingAmount ? Number(match.fundingAmount) : undefined,
        },
      });
    } else {
      results.set(name, {
        name,
        verified: false,
      });
    }
  }

  return results;
}

/**
 * Post-process les outputs d'un agent pour marquer les entites non verifiees.
 * Ajoute "[NON VERIFIE]" devant chaque nom non trouve en DB.
 */
export function annotateUnverifiedEntities<T extends Record<string, unknown>>(
  data: T,
  verifications: Map<string, EntityVerification>,
  fieldsToCheck: string[],
): { annotatedData: T; unverifiedCount: number; warningMessage?: string } {
  let unverifiedCount = 0;
  const annotatedData = JSON.parse(JSON.stringify(data)) as T;

  // Parcourir recursivement et annoter
  function annotate(obj: unknown): unknown {
    if (typeof obj === "string") {
      for (const [name, verification] of verifications.entries()) {
        if (!verification.verified && obj.includes(name)) {
          unverifiedCount++;
          return obj.replace(name, `[NON VERIFIE] ${name}`);
        }
      }
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(item => annotate(item));
    }
    if (obj && typeof obj === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        if (fieldsToCheck.includes(key) || key === "name" || key === "company") {
          result[key] = annotate(value);
        } else {
          result[key] = value;
        }
      }
      return result;
    }
    return obj;
  }

  const annotated = annotate(annotatedData) as T;

  const warningMessage = unverifiedCount > 0
    ? `${unverifiedCount} entite(s) mentionnee(s) par le LLM non trouvee(s) en base de donnees. Marquees [NON VERIFIE].`
    : undefined;

  return { annotatedData: annotated, unverifiedCount, warningMessage };
}
```

**Integration dans `competitive-intel.ts`** :

```diff
  protected async execute(context: EnrichedAgentContext): Promise<CompetitiveIntelData> {
    // ... prompt building ...
    const { data } = await this.llmCompleteJSON<LLMCompetitiveIntelResponse>(prompt);
-   return this.transformResponse(data, amountRaising);

+   // POST-PROCESSING : Verifier les entites
+   const competitorNames = (data.findings?.competitors ?? []).map(c => c.name);
+   const missedNames = (data.findings?.competitorsMissedInDeck ?? []).map(c => c.name);
+   const allEntities = [...competitorNames, ...missedNames];
+
+   const verifications = await verifyEntities(allEntities);
+
+   const transformed = this.transformResponse(data, amountRaising);
+
+   // Annoter les concurrents non verifies
+   for (const competitor of transformed.findings.competitors) {
+     const v = verifications.get(competitor.name);
+     if (v && !v.verified) {
+       competitor.name = `[NON VERIFIE] ${competitor.name}`;
+       competitor.funding.source = "LLM (non verifie en base)";
+     } else if (v?.verified && v.matchedEntity) {
+       competitor.funding.source = `Funding DB (${v.matchedEntity.name})`;
+     }
+   }
+
+   // Ajouter limitation si entites non verifiees
+   const unverifiedCount = Array.from(verifications.values()).filter(v => !v.verified).length;
+   if (unverifiedCount > 0) {
+     transformed.meta.limitations = [
+       ...(transformed.meta.limitations ?? []),
+       `${unverifiedCount} concurrent(s) mentionnes par le LLM non verifies en Funding DB.`,
+     ];
+   }
+
+   return transformed;
  }
```

### Dependances

- F10 (la recherche active de concurrents doit preceder la verification)
- F03 (le scoring doit penaliser les entites non verifiees)

### Verification

1. **Test avec entite fictive** : Ajouter un concurrent fictif ("FakeCompanyXYZ") dans le prompt, verifier qu'il est marque [NON VERIFIE].
2. **Test avec entite reelle** : Verifier qu'un concurrent present dans la Funding DB est correctement VERIFIE.
3. **Test regression** : Lancer une analyse complete, compter les annotations [NON VERIFIE].

---

## F09 - Verification fondateurs non croisee {#f09}

### Diagnostic

**Fichiers problematiques :**

1. **`/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier1/team-investigator.ts`** (lignes 824-935)
   - `getFoundersData()` prend les donnees LinkedIn via RapidAPI telles quelles
   - Aucune comparaison avec les registres officiels (KBIS via Pappers)
   - Le cross-reference deck vs LinkedIn est demande au LLM (dans le prompt) mais pas verifie en code

2. **`/Users/sacharebbouh/Desktop/angeldesk/src/services/context-engine/connectors/pappers.ts`** (lignes 441-490)
   - `verifyFrenchFounder(founderName, companyName)` EXISTE :
     - Retourne `{ verified, role, since, ownershipPercentage }`
     - Verifie le nom dans les representants officiels
     - Retourne le pourcentage de parts
   - Mais cette fonction n'est JAMAIS appelee par le team-investigator.

### Correction

**Modifier `team-investigator.ts`** : Ajouter une etape de cross-reference registre AVANT l'appel LLM.

```diff
  protected async execute(context: EnrichedAgentContext): Promise<TeamInvestigatorData> {
    // ... existing code ...

+   // =====================================================
+   // CROSS-REFERENCE REGISTRE OFFICIEL (KBIS)
+   // =====================================================
+   const companyName = context.deal.companyName || context.deal.name;
+   let registrySection = "";
+   const registryRedFlags: AgentRedFlag[] = [];
+
+   try {
+     const { verifyFrenchFounder, enrichFrenchCompany } = await import(
+       "@/services/context-engine/connectors/pappers"
+     );
+
+     // D'abord enrichir l'entreprise pour avoir la liste officielle des dirigeants
+     const companyData = await enrichFrenchCompany(companyName);
+
+     if (companyData?.found) {
+       registrySection += `\n## DONNEES REGISTRE OFFICIEL (KBIS via Pappers.fr)
+ **Entreprise**: ${companyData.siren ? `SIREN ${companyData.siren}` : "Non trouvee"}
+ **Dirigeants officiels**:
+ ${(companyData.dirigeants ?? []).map(d => `- ${d.name} (${d.role}, depuis ${d.since || "N/A"})`).join("\n") || "Aucun dirigeant trouve"}
+ **Beneficiaires effectifs**:
+ ${(companyData.beneficiaires ?? []).map(b => `- ${b.name} (${b.percentage ? b.percentage + "%" : "N/A"})`).join("\n") || "Non disponible"}
+ `;
+
+       // Verifier chaque fondateur du deck
+       const deal = context.deal as unknown as { founders?: { name: string; role: string }[] };
+       if (deal.founders) {
+         for (const founder of deal.founders) {
+           const verification = await verifyFrenchFounder(founder.name, companyName);
+           if (!verification.verified) {
+             registryRedFlags.push({
+               id: `RF-FOUNDER-${registryRedFlags.length + 1}`,
+               category: "verification",
+               severity: "HIGH",
+               title: `Fondateur ${founder.name} non trouve au registre officiel`,
+               description: `Le fondateur "${founder.name}" (${founder.role}) declare dans le deck n'apparait pas comme dirigeant ou beneficiaire effectif de ${companyName} au registre du commerce (Pappers.fr).`,
+               location: "Deck - Section Team vs Registre du commerce",
+               evidence: `Dirigeants officiels: ${(companyData.dirigeants ?? []).map(d => d.name).join(", ") || "aucun"}`,
+               impact: "Risque structurel : fondateur sans mandat officiel = pas de pouvoir legal sur la societe",
+               question: `Pouvez-vous confirmer votre role officiel dans la societe ${companyName} ? Avez-vous un mandat social ?`,
+               redFlagIfBadAnswer: "Fondateur sans mandat social = risque juridique majeur pour les investisseurs",
+             });
+           } else {
+             registrySection += `\n**${founder.name}**: VERIFIE (${verification.role}, depuis ${verification.since || "N/A"}, ${verification.ownershipPercentage ? verification.ownershipPercentage + "% parts" : "parts N/A"})`;
+           }
+         }
+       }
+     }
+   } catch (error) {
+     registrySection += "\n## DONNEES REGISTRE\nVerification impossible (erreur technique).";
+   }

    // Ajouter dans le prompt
    const prompt = `# ANALYSE TEAM INVESTIGATOR - ${deal.companyName || deal.name}
    ...
    ${foundersSection}
+   ${registrySection}
    ${teamMembersSection}
    ...`;

    // Post-processing : ajouter les red flags registre
+   const result = this.normalizeResponse(data);
+   result.redFlags = [...registryRedFlags, ...result.redFlags];
+   return result;
  }
```

### Dependances

- F07 (meme source Pappers, meme pattern d'integration)
- F08 (les entreprises mentionnees dans les ventures precedentes doivent aussi etre verifiees)

### Verification

1. **Test avec fondateur present** : Deal avec un fondateur dirigeant officiel, verifier qu'il est marque VERIFIE.
2. **Test avec fondateur absent** : Deal avec un "fondateur" qui n'est pas dirigeant officiel, verifier le red flag HIGH.
3. **Test avec entreprise non francaise** : Verifier que le fallback fonctionne (pas d'erreur).

---

## F10 - Pas de recherche active de concurrents {#f10}

### Diagnostic

**Fichier problematique :**

1. **`/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier1/competitive-intel.ts`** (lignes 320-597)
   - La methode `execute()` depend UNIQUEMENT des donnees injectees dans le contexte :
   ```typescript
   protected async execute(context: EnrichedAgentContext): Promise<CompetitiveIntelData> {
     const dealContext = this.formatDealContext(context);
     const contextEngineData = this.formatContextEngineData(context);
     const extractedInfo = this.getExtractedInfo(context);
     // ... puis appel LLM directement
     const { data } = await this.llmCompleteJSON<LLMCompetitiveIntelResponse>(prompt);
   }
   ```
   - Si le Context Engine n'a pas de competitiveLandscape, le LLM invente des concurrents a partir de ses connaissances generales.
   - Aucune recherche web active (Perplexity) n'est lancee specifiquement pour les concurrents.

### Correction

**Modifier `competitive-intel.ts`** : Ajouter une recherche web active AVANT l'appel LLM.

```diff
+ import { searchSectorBenchmarksCached } from "@/services/benchmarks/dynamic-benchmarks";

  protected async execute(context: EnrichedAgentContext): Promise<CompetitiveIntelData> {
    const dealContext = this.formatDealContext(context);
    const contextEngineData = this.formatContextEngineData(context);
    const extractedInfo = this.getExtractedInfo(context);

+   // =====================================================
+   // RECHERCHE WEB ACTIVE DE CONCURRENTS
+   // =====================================================
+   let webSearchSection = "";
+
+   try {
+     const companyName = context.deal.companyName || context.deal.name;
+     const sector = context.deal.sector || "tech";
+     const tagline = extractedInfo?.tagline || extractedInfo?.productDescription || "";
+
+     // Recherche via Perplexity (web search)
+     const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
+     const apiKey = process.env.OPENROUTER_API_KEY;
+
+     if (apiKey) {
+       const searchQuery = `List the top 10 competitors and alternatives to "${companyName}" in the ${sector} space. ${tagline ? `The company does: ${tagline}.` : ""} For each competitor, include: company name, funding raised, number of employees, key differentiation. Focus on startups and scaleups, not only incumbents. Include both direct and indirect competitors. Current year: ${new Date().getFullYear()}.`;
+
+       const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
+         method: "POST",
+         headers: {
+           Authorization: `Bearer ${apiKey}`,
+           "Content-Type": "application/json",
+         },
+         body: JSON.stringify({
+           model: "perplexity/sonar",
+           messages: [{ role: "user", content: searchQuery }],
+           temperature: 0.1,
+           max_tokens: 2000,
+         }),
+       });
+
+       if (response.ok) {
+         const result = await response.json();
+         const searchContent = result.choices?.[0]?.message?.content || "";
+
+         webSearchSection = `\n## RECHERCHE WEB ACTIVE (Perplexity - ${new Date().toISOString().split("T")[0]})
+ **IMPORTANT**: Ces donnees viennent d'une recherche web en temps reel.
+ Compare cette liste avec les concurrents mentionnes dans le deck.
+ Tout concurrent MAJEUR absent du deck = RED FLAG.
+
+ ${searchContent}
+
+ **INSTRUCTIONS**:
+ 1. Inclure TOUS les concurrents de cette recherche dans ton analyse
+ 2. Signaler les concurrents NON MENTIONNES dans le deck
+ 3. Pour les concurrents du deck NON TROUVES dans cette recherche, marquer comme "existence non confirmee"
+ `;
+       }
+     }
+   } catch (error) {
+     webSearchSection = "\n## RECHERCHE WEB\nRecherche web echouee. Analyse basee uniquement sur le Context Engine.";
+   }

    // ... existant ...
    const prompt = `ANALYSE CONCURRENTIELLE APPROFONDIE

  ${dealContext}
  ${competitorsSection}
  ${advantageSection}
  ${differentiatorsSection}
  ${fundingSection}
+ ${webSearchSection}
  ${contextEngineData}
  ...`;
  }
```

### Dependances

- F08 (les concurrents trouves par web search doivent aussi etre verifies en DB)
- F03 (le scoring competitive doit refleter les resultats de la recherche active)

### Verification

1. **Test comparatif** : Analyser un deal connu avec et sans recherche active, comparer la liste de concurrents.
2. **Test deck mensonger** : Deck qui dit "pas de concurrent", verifier que la recherche web en trouve.
3. **Test fallback** : Desactiver la cle OpenRouter, verifier que l'analyse fonctionne toujours (avec warning).

---

## F19 - Analyse de marche pure top-down, TAM/SAM/SOM non verifies {#f19}

### Diagnostic

**Fichier problematique :**

1. **`/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier1/market-intelligence.ts`** (lignes 188-298, 301-573)
   - Le system prompt mentionne "bottom-up" mais ne fournit AUCUNE donnee pour le faire :
   ```typescript
   // Ligne 219-220 : Methodes mentionnees mais pas outillees
   // - BOTTOM-UP: # clients potentiels x ACV
   // - TRIANGULATION: Croiser plusieurs sources
   ```
   - La methode `execute()` (ligne 301) ne calcule AUCUN SAM bottom-up
   - Les donnees du Context Engine sont des totaux de marche (top-down)
   - Le LLM produit un SAM/SOM "valide" sans base de calcul reelle

2. Le type LLM response (lignes 63-68) : `methodology: "top_down" | "bottom_up" | "unknown"` est un self-report du LLM. Le LLM declare "bottom_up" sans avoir fait de calcul bottom-up reel.

### Correction

**Modifier `market-intelligence.ts`** : Forcer une estimation bottom-up independante.

```diff
  protected async execute(context: EnrichedAgentContext): Promise<MarketIntelData> {
    const dealContext = this.formatDealContext(context);
    const contextEngineData = this.formatContextEngineData(context);
    const extractedInfo = this.getExtractedInfo(context);

+   // =====================================================
+   // ESTIMATION BOTTOM-UP INDEPENDANTE
+   // =====================================================
+   let bottomUpSection = "";
+
+   // Extraire les donnees necessaires du deck
+   const avgDealSize = extractedInfo?.avgDealSize as number | undefined
+     || extractedInfo?.arpu as number | undefined
+     || extractedInfo?.acv as number | undefined;
+   const targetCustomerCount = extractedInfo?.targetCustomers as number | undefined;
+   const conversionRate = extractedInfo?.conversionRate as number | undefined;
+   const tam = extractedInfo?.tam as number | undefined;
+   const sam = extractedInfo?.sam as number | undefined;
+   const som = extractedInfo?.som as number | undefined;
+
+   bottomUpSection = `\n## ESTIMATION BOTTOM-UP INDEPENDANTE (OBLIGATOIRE)
+
+ Tu DOIS produire une estimation bottom-up INDEPENDANTE du deck, en plus de la validation top-down.
+
+ ### Methodologie bottom-up obligatoire :
+ 1. **Identifier le segment cible** : Quel type de client exactement ? (ex: PME SaaS B2B France 10-50 employes)
+ 2. **Estimer le nombre de clients potentiels** : Utilise les donnees INSEE/Eurostat disponibles
+    ${targetCustomerCount ? `- Le deck declare ${targetCustomerCount} clients potentiels. VERIFIE ce chiffre.` : "- Le deck ne donne PAS de nombre de clients potentiels. ESTIME-LE toi-meme."}
+ 3. **Determiner l'ACV (Annual Contract Value)** :
+    ${avgDealSize ? `- Le deck declare ACV = ${avgDealSize}EUR. Est-ce coherent avec le marche ?` : "- ACV non declare. ESTIME-LE base sur le positionnement prix."}
+ 4. **Taux de conversion realiste** :
+    ${conversionRate ? `- Le deck declare ${conversionRate}% de conversion.` : "- Utilise 1-5% pour early stage (sauf preuve contraire)."}
+
+ ### FORMULE OBLIGATOIRE :
+ SAM bottom-up = Clients potentiels x ACV
+ SOM bottom-up = SAM x Taux de conversion realiste (1-5% pour early stage)
+
+ ### COMPARAISON OBLIGATOIRE :
+ ${tam ? `- TAM deck: ${tam}EUR` : "- TAM deck: non fourni"}
+ ${sam ? `- SAM deck: ${sam}EUR` : "- SAM deck: non fourni"}
+ ${som ? `- SOM deck: ${som}EUR` : "- SOM deck: non fourni"}
+
+ Compare tes estimations bottom-up avec les claims du deck.
+ Si ecart > 3x sur le SAM ou > 5x sur le SOM → RED FLAG.
+
+ ### OUTPUT ATTENDU :
+ Dans findings.marketSize, ajoute pour sam et som :
+ - "calculation": "FORMULE COMPLETE avec chiffres"
+ - Un "validated" qui est ton estimation bottom-up (PAS le chiffre du deck)
+ `;

    // Ajouter dans le prompt
    const prompt = `# ANALYSE MARKET INTELLIGENCE - ${context.deal.name}

  ## DOCUMENTS FOURNIS
  ${dealContext}
  ${marketSection}
+ ${bottomUpSection}

  ## CONTEXTE EXTERNE (Context Engine)
  ${contextEngineData}
  ...`;
  }
```

**Post-processing** : Verifier que le LLM a bien produit une estimation bottom-up.

```diff
  private normalizeResponse(data: LLMMarketIntelResponse): MarketIntelData {
    // ... existing normalization ...

+   // Verifier la presence d'une estimation bottom-up
+   const samCalc = data.findings?.marketSize?.sam?.calculation || "";
+   const somCalc = data.findings?.marketSize?.som?.calculation || "";
+   const hasBottomUp = samCalc.includes("x") || samCalc.includes("*") || somCalc.includes("x");
+
+   if (!hasBottomUp) {
+     // Le LLM n'a pas fait d'estimation bottom-up malgre l'instruction
+     // Ajouter un warning dans les limitations
+     meta.limitations = [
+       ...(meta.limitations || []),
+       "Estimation bottom-up non produite. Les TAM/SAM/SOM sont bases uniquement sur les claims du deck (top-down).",
+     ];
+     // Penaliser la confidence
+     meta.confidenceLevel = Math.min(meta.confidenceLevel, 40);
+   }
  }
```

### Dependances

- F06 (les benchmarks de marche doivent etre a jour)
- F10 (la recherche active peut fournir des donnees pour le bottom-up)

### Verification

1. **Test avec donnees completes** : Deal avec ACV et nombre de clients, verifier que le bottom-up est calcule.
2. **Test sans donnees** : Deal sans ACV, verifier que le LLM est force d'estimer et que la limitation est ajoutee.
3. **Test de coherence** : SAM deck 100M, bottom-up 10M, verifier que le red flag est leve.

---

## F23 - Deal source / sourcing bias non analyse {#f23}

### Diagnostic

**Fichiers concernes :**

1. **Aucun des 40 agents** ne contient de logique de "deal source analysis" :
   - Grep sur `dealSource|sourcing.?bias|deal.?source` dans `src/` retourne uniquement `us-funding.ts` (non pertinent)
   - Le `synthesis-deal-scorer.ts` ne pose jamais la question "Pourquoi ce deal arrive chez un BA solo ?"
   - L'`orchestrator` ne collecte pas l'info de sourcing

2. Le risque est reel : un deal qui arrive a un BA solo peut signifier :
   - Les fonds VC ont passe (signaux negatifs non vus)
   - Le fondateur n'a pas de network (signal sur la team)
   - C'est un "tire deal" (le fondateur est desespere)
   - Ou simplement que le BA est bien positionne (cas positif rare)

### Correction

**Approche** : Ajouter une section "Deal Source Analysis" dans le `synthesis-deal-scorer.ts` (Tier 3), car c'est la qu'on a la vision complete.

#### Etape 1 : Ajouter les donnees de sourcing au contexte

**Modifier le schema Prisma (si pas deja fait)** ou utiliser les champs existants du deal :

```typescript
// Dans le type Deal ou EnrichedAgentContext, ajouter :
interface DealSourceInfo {
  source: "direct_founder" | "referral" | "platform" | "network" | "unknown";
  referralFrom?: string;       // Qui a refere le deal
  foundersApproach?: string;   // "Le fondateur m'a contacte" vs "J'ai trouve via AngelList"
  previousFundingAttempts?: string; // "A leve chez X avant" ou "Premier tour"
  vcPassed?: boolean;          // Est-ce que des VCs ont regarde et passe ?
  reasonForBA?: string;        // Pourquoi un BA plutot qu'un fonds
}
```

#### Etape 2 : Ajouter la section dans synthesis-deal-scorer.ts

```diff
  protected buildSystemPrompt(): string {
    return `# ROLE ET EXPERTISE
    ...

+   ## Etape 7.5: DEAL SOURCE ANALYSIS (OBLIGATOIRE)
+
+   Tu DOIS analyser la PROVENANCE du deal. Un BA solo recoit un deal pour une raison.
+   Cette raison est un SIGNAL important.
+
+   ### Questions a se poser :
+   1. **Pourquoi ce deal arrive chez un BA solo ?**
+      - Les fonds VC ont-ils regarde et passe ? (si oui, pourquoi ?)
+      - Le fondateur a-t-il un network suffisant pour lever en VC ? (si non, red flag team)
+      - Le ticket size est-il trop petit pour les fonds ? (signal neutre)
+      - Le secteur est-il hors scope des fonds FR ? (signal neutre)
+
+   2. **Comment le deal est arrive ?**
+      - Contact direct du fondateur = potentiellement desespere
+      - Referral qualifie = bon signe
+      - Plateforme (AngelList, etc.) = neutre
+
+   3. **Red flags de sourcing** :
+      - Le fondateur a contacte 50+ investisseurs sans succes → CRITICAL
+      - Aucun VC n'a regarde le deal → MEDIUM (peut etre trop early)
+      - Le fondateur refuse de dire pourquoi il ne leve pas en VC → HIGH
+      - Round qui traine depuis > 6 mois → HIGH
+
+   ### Output requis dans findings :
+   Ajouter dans topWeaknesses OU topStrengths :
+   - "Deal source: [analyse de pourquoi ce deal arrive a un BA]"
+
+   Ajouter dans questions (TOUJOURS) :
+   - "Avez-vous presente ce deal a des fonds VC ? Si oui, quels retours avez-vous eus ?"
+   - "Depuis combien de temps etes-vous en levee de fonds ?"
    ...`;
  }
```

```diff
  protected async execute(context: EnrichedAgentContext): Promise<SynthesisDealScorerData> {
    // ... existing code ...

+   // Deal Source Analysis section
+   const dealSourceSection = this.buildDealSourceSection(context);

    const prompt = `# ANALYSE SYNTHESIS DEAL SCORER - ${deal.companyName ?? deal.name}
    ...
+   ## ANALYSE DE LA SOURCE DU DEAL (OBLIGATOIRE)
+   ${dealSourceSection}
    ...`;
  }

+ private buildDealSourceSection(context: EnrichedAgentContext): string {
+   const deal = context.deal as Record<string, unknown>;
+   const lines: string[] = [];
+
+   // Chercher des indices dans les donnees du deal
+   const source = deal.source || deal.dealSource || "unknown";
+   const referral = deal.referralFrom || deal.referredBy;
+   const roundStartDate = deal.roundStartDate || deal.fundraisingStarted;
+
+   lines.push(`**Source du deal**: ${source}`);
+   if (referral) lines.push(`**Refere par**: ${referral}`);
+
+   // Calculer la duree de levee si possible
+   if (roundStartDate) {
+     const start = new Date(roundStartDate as string);
+     const durationMonths = Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24 * 30));
+     lines.push(`**Duree de la levee**: ${durationMonths} mois`);
+     if (durationMonths > 6) {
+       lines.push(`**WARNING**: Levee en cours depuis > 6 mois. Signal negatif potentiel.`);
+     }
+   }
+
+   // Verifier si des VCs sont dans le tour
+   const investors = deal.investors as string[] | undefined;
+   const hasVC = investors?.some(i =>
+     i.toLowerCase().includes("venture") ||
+     i.toLowerCase().includes("capital") ||
+     i.toLowerCase().includes("partners")
+   );
+
+   if (hasVC) {
+     lines.push(`**VC present dans le tour**: Oui → signal positif (validation institutionnelle)`);
+   } else {
+     lines.push(`**Aucun VC dans le tour**: Pourquoi ? A analyser.`);
+   }
+
+   lines.push(`
+ **QUESTIONS OBLIGATOIRES pour le scoring** :
+ 1. Pourquoi ce deal arrive a un BA solo plutot qu'un fonds VC ?
+ 2. Le fondateur a-t-il ete refuse par des VCs ?
+ 3. Combien d'investisseurs ont ete contactes avant toi ?
+ 4. Depuis combien de temps dure la levee ?
+
+ **IMPACT SUR LE SCORE** :
+ - Si levee > 6 mois sans closing : -5 points sur le score global
+ - Si aucun VC n'a regarde : -3 points (peut etre compense par stage trop early)
+ - Si referral qualifie d'un investisseur connu : +3 points
+ `);
+
+   return lines.join("\n");
+ }
```

### Dependances

- Aucune dependance technique directe
- Impact sur le score final du synthesis-deal-scorer

### Verification

1. **Test deal sans source** : Verifier que la question "Pourquoi ce deal chez un BA ?" est TOUJOURS posee.
2. **Test deal avec referral** : Verifier que le referral qualifie donne un bonus.
3. **Test deal ancien** : Deal en levee depuis 8+ mois, verifier la penalite.

---

## Resume des dependances inter-failles

```
F03 (Scoring deterministe)
 ├── F04 (Verification calculs → alimente metriques pour scoring)
 ├── F06 (Benchmarks frais → necessaires au scoring)
 └── F08 (Entites verifiees → penalite scoring si non verifie)

F07 (Verification Pappers/Societe.com)
 ├── F04 (Meme source de verite pour les financials)
 └── F09 (Meme source Pappers pour les fondateurs)

F10 (Recherche active concurrents)
 └── F08 (Concurrents trouves doivent etre verifies en DB)

F19 (Bottom-up TAM/SAM/SOM)
 ├── F06 (Benchmarks de marche)
 └── F10 (Donnees concurrentielles pour dimensionner)

F23 (Deal source analysis)
 └── Independant (integration dans synthesis-deal-scorer)
```

## Ordre d'implementation recommande

1. **F06** - Enrichir types benchmarks (prerequis pour tout)
2. **F04** - Couche de verification financiere (fonctions deja existantes)
3. **F07** - Integration Pappers dans financial-auditor
4. **F09** - Cross-reference fondateurs via Pappers
5. **F08** - Entity verifier post-LLM
6. **F10** - Recherche web active concurrents
7. **F03** - Scoring deterministe (le plus gros chantier)
8. **F19** - Bottom-up TAM/SAM/SOM
9. **F23** - Deal source analysis

**Estimation totale** : ~3-5 jours de developpement pour l'ensemble des 9 failles.
