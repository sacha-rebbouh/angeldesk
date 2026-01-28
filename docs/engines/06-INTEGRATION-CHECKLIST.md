# Integration, Checklists et Metriques

> Derniere mise a jour: 2026-01-28 | Source: REFLEXION-CONSENSUS-ENGINES.md v3.0

---

## Table des matieres

1. [Code d'Integration - QualityProcessor](#1-code-dintegration---qualityprocessor)
2. [Ordre d'Implementation](#2-ordre-dimplementation)
3. [Fichiers a Creer/Modifier](#3-fichiers-a-creermodifier)
4. [Checklist - Consensus Engine](#4-checklist---consensus-engine)
5. [Checklist - Reflexion Engine](#5-checklist---reflexion-engine)
6. [Checklist - Benchmarks](#6-checklist---benchmarks)
7. [Metriques de Succes](#7-metriques-de-succes)
8. [Structure Fichiers Recommandee](#8-structure-fichiers-recommandee)

---

## 1. Code d'Integration - QualityProcessor

```typescript
// src/agents/orchestrator/quality-integration.ts

import { ConsensusEngine, EnhancedContradiction, EnhancedResolution } from "../orchestration/consensus-engine";
import { ReflexionEngine, EnhancedReflexionOutput } from "../orchestration/reflexion";
import { QUALITY_ENGINE_CONFIG } from "../orchestration/quality-config";
import type { ScoredFinding } from "@/scoring/types";
import type { AnalysisAgentResult } from "../types";

export interface QualityProcessingResult {
  processedFindings: ScoredFinding[];
  contradictions: {
    detected: EnhancedContradiction[];
    resolved: EnhancedResolution[];
    unresolved: EnhancedContradiction[];
  };
  reflexions: Map<string, EnhancedReflexionOutput>;
  metrics: EngineMetrics;
}

export class QualityProcessor {
  private consensusEngine: ConsensusEngine;
  private reflexionEngine: ReflexionEngine;
  private config = QUALITY_ENGINE_CONFIG;

  constructor() {
    this.consensusEngine = new ConsensusEngine();
    this.reflexionEngine = new ReflexionEngine();
  }

  async processTier1Outputs(
    agentOutputs: Map<string, { result: AnalysisAgentResult; findings: ScoredFinding[] }>,
    verificationContext: VerificationContext
  ): Promise<QualityProcessingResult> {
    const metrics: Partial<EngineMetrics> = {
      totalTokensUsed: 0,
      totalDurationMs: 0,
    };
    const startTime = Date.now();

    // ========================================
    // PHASE 1: REFLEXION (si necessaire)
    // ========================================

    const reflexions = new Map<string, EnhancedReflexionOutput>();
    const processedOutputs = new Map<string, { result: AnalysisAgentResult; findings: ScoredFinding[] }>();

    for (const [agentName, { result, findings }] of agentOutputs) {
      const avgConfidence = this.calculateAvgConfidence(findings);
      const hasCriticalRedFlag = this.hasCriticalUnverifiedRedFlag(findings);

      if (this.shouldTriggerReflexion(agentName, 1, avgConfidence, hasCriticalRedFlag)) {
        console.log(`[Quality] Reflexion triggered for ${agentName} (confidence: ${avgConfidence}%)`);

        const reflexionResult = await this.reflexionEngine.reflect({
          agentName,
          output: result,
          findings,
          verificationContext,
        });

        reflexions.set(agentName, reflexionResult);
        metrics.totalTokensUsed! += reflexionResult.tokensUsed;

        processedOutputs.set(agentName, {
          result: reflexionResult.revisedOutput as AnalysisAgentResult,
          findings: reflexionResult.revisedFindings,
        });
      } else {
        processedOutputs.set(agentName, { result, findings });
      }
    }

    // ========================================
    // PHASE 2: CONSENSUS (detection)
    // ========================================

    const allFindings: ScoredFinding[] = [];
    for (const { findings } of processedOutputs.values()) {
      allFindings.push(...findings);
    }

    const detectedContradictions = await this.consensusEngine.detectContradictions(allFindings);
    console.log(`[Quality] ${detectedContradictions.length} contradictions detected`);

    // ========================================
    // PHASE 3: CONSENSUS (resolution)
    // ========================================

    const resolved: EnhancedResolution[] = [];
    const unresolved: EnhancedContradiction[] = [];

    const sortedContradictions = [...detectedContradictions].sort((a, b) => {
      const severityOrder = { CRITICAL: 0, MAJOR: 1, MODERATE: 2, MINOR: 3 };
      return severityOrder[a.severity.level] - severityOrder[b.severity.level];
    });

    const toResolve = sortedContradictions.slice(0, this.config.limits.maxContradictionsToResolve);

    for (const contradiction of toResolve) {
      if (contradiction.severity.level === "MINOR" && this.config.consensus.autoResolveMinorContradictions) {
        const resolution = this.autoResolveMinor(contradiction);
        resolved.push(resolution);
        continue;
      }

      if (contradiction.severity.level === "CRITICAL" || contradiction.severity.level === "MAJOR") {
        const resolution = await this.consensusEngine.resolve(contradiction, verificationContext);
        resolved.push(resolution);
        metrics.totalTokensUsed! += resolution.debateRecord.tokensUsed;
        this.applyResolution(allFindings, resolution);
      } else {
        const bothLowConfidence = contradiction.positions.every(p => p.confidence < 70);
        if (bothLowConfidence) {
          const resolution = await this.consensusEngine.resolve(contradiction, verificationContext);
          resolved.push(resolution);
          metrics.totalTokensUsed! += resolution.debateRecord.tokensUsed;
          this.applyResolution(allFindings, resolution);
        } else {
          unresolved.push(contradiction);
        }
      }
    }

    // ========================================
    // FINALISATION
    // ========================================

    metrics.totalDurationMs = Date.now() - startTime;
    metrics.contradictionsDetected = detectedContradictions.length;
    metrics.contradictionsResolved = resolved.length;
    metrics.agentsReflected = reflexions.size;

    return {
      processedFindings: allFindings,
      contradictions: {
        detected: detectedContradictions,
        resolved,
        unresolved,
      },
      reflexions,
      metrics: metrics as EngineMetrics,
    };
  }

  private calculateAvgConfidence(findings: ScoredFinding[]): number {
    if (findings.length === 0) return 0;
    return findings.reduce((sum, f) => sum + f.confidence.score, 0) / findings.length;
  }

  private hasCriticalUnverifiedRedFlag(findings: ScoredFinding[]): boolean {
    return findings.some(f =>
      f.assessment === "suspicious" &&
      f.confidence.score < 60 &&
      f.evidence.length === 0
    );
  }

  private shouldTriggerReflexion(
    agentName: string,
    tier: 1 | 2 | 3,
    avgConfidence: number,
    hasCriticalRedFlag: boolean
  ): boolean {
    if (tier === 3) return false;
    if (hasCriticalRedFlag) return true;

    const threshold = tier === 1
      ? this.config.reflexion.tier1ConfidenceThreshold
      : this.config.reflexion.tier2ConfidenceThreshold;

    return avgConfidence < threshold;
  }

  private autoResolveMinor(contradiction: EnhancedContradiction): EnhancedResolution {
    // Voir 01-CONSENSUS-SPEC.md pour l'implementation complete
    const winner = contradiction.positions.reduce((a, b) =>
      a.confidence > b.confidence ? a : b
    );
    const loser = contradiction.positions.find(p => p !== winner)!;

    return {
      contradictionId: contradiction.id,
      resolvedAt: new Date(),
      verdict: {
        decision: winner === contradiction.positions[0] ? "POSITION_A" : "POSITION_B",
        winner: winner.agentName,
        justification: {
          decisiveFactors: [{
            factor: "Confiance superieure (resolution automatique MINOR)",
            source: `${winner.agentName}: ${winner.confidence}% vs ${loser.agentName}: ${loser.confidence}%`,
            weight: "PRIMARY",
          }],
          rejectedPositionFlaws: [],
        },
      },
      finalValue: {
        value: winner.value,
        unit: winner.unit,
        confidence: winner.confidence,
        derivedFrom: {
          source: "Resolution automatique basee sur confiance",
        },
      },
      baGuidance: {
        oneLiner: `${contradiction.topic}: ${winner.claim} (resolution auto, ecart mineur)`,
        canTrust: true,
        trustLevel: "MEDIUM",
        verifiableSources: winner.sources.map(s => ({
          source: s.type,
          reference: s.reference,
          whatItProves: s.quote || "Valeur citee",
        })),
      },
      debateRecord: {
        rounds: [],
        totalDuration: 0,
        tokensUsed: 0,
        optimizationApplied: "MINOR_AUTO_RESOLVE",
      },
      unresolvedAspects: [],
    };
  }

  private applyResolution(findings: ScoredFinding[], resolution: EnhancedResolution): void {
    // Marquer les findings concernes comme resolus
  }
}
```

---

## 2. Ordre d'Implementation

```
PHASE 1 - Types et Schemas (1-2h)
─────────────────────────────────
1. Creer consensus-types.ts
2. Creer reflexion-types.ts
3. Creer schemas/consensus-schemas.ts
4. Creer schemas/reflexion-schemas.ts
5. Creer utils/llm-validation.ts

PHASE 2 - Prompts (1-2h)
─────────────────────────
6. Creer prompts/debater-prompts.ts
7. Creer prompts/arbitrator-prompts.ts
8. Creer prompts/critic-prompts.ts
9. Creer prompts/improver-prompts.ts

PHASE 3 - Engines (2-3h)
────────────────────────
10. Refondre consensus-engine.ts
11. Refondre reflexion.ts
12. Creer quality-config.ts

PHASE 4 - Integration (1-2h)
────────────────────────────
13. Creer verification-context.ts
14. Creer quality-integration.ts
15. Mettre a jour index.ts

PHASE 5 - Tests (1-2h)
──────────────────────
16. Creer __tests__/consensus-engine.test.ts
17. Creer __tests__/reflexion-engine.test.ts
18. Run tests et fix issues
```

### Scenarios de couts estimes

| Scenario | Appels LLM | Tokens estimes |
|----------|------------|----------------|
| 1 contradiction, 3 rounds + arbitrage | 7 appels | ~15,000 tokens |
| 5 contradictions, 3 rounds chacune | 35 appels | ~75,000 tokens |
| 1 reflexion (critique + improve) | 2 appels | ~8,000 tokens |
| 5 agents en reflexion | 10 appels | ~40,000 tokens |

**Risque:** Une analyse complete pourrait couter 100K+ tokens juste pour les engines de qualite.

**Dependances:** `npm install zod` (si pas deja installe)

---

## 3. Fichiers a Creer/Modifier

### A creer

```
src/agents/orchestration/
├── consensus-types.ts              # Types du Consensus Engine (01-CONSENSUS-SPEC.md)
├── reflexion-types.ts              # Types du Reflexion Engine (03-REFLEXION-SPEC.md)
├── quality-config.ts               # Configuration des engines (05-SHARED-UTILS.md)
├── verification-context.ts         # Type et builder VerificationContext (05-SHARED-UTILS.md)
├── quality-integration.ts          # QualityProcessor (Section 1 ci-dessus)
├── schemas/
│   ├── consensus-schemas.ts        # Schemas Zod Consensus (05-SHARED-UTILS.md)
│   └── reflexion-schemas.ts        # Schemas Zod Reflexion (05-SHARED-UTILS.md)
├── utils/
│   └── llm-validation.ts           # completAndValidate helper (05-SHARED-UTILS.md)
├── prompts/
│   ├── debater-prompts.ts          # Prompts debater (02-CONSENSUS-PROMPTS.md)
│   ├── arbitrator-prompts.ts       # Prompts arbitrator (02-CONSENSUS-PROMPTS.md)
│   ├── critic-prompts.ts           # Prompts critic (04-REFLEXION-PROMPTS.md)
│   └── improver-prompts.ts         # Prompts improver (04-REFLEXION-PROMPTS.md)
└── __tests__/
    ├── consensus-engine.test.ts    # Tests Consensus
    └── reflexion-engine.test.ts    # Tests Reflexion
```

### A modifier

```
src/agents/orchestration/
├── consensus-engine.ts             # REFONTE COMPLETE
├── reflexion.ts                    # REFONTE COMPLETE
├── index.ts                        # Ajouter exports
└── message-types.ts                # Ajouter types BA guidance
```

---

## 4. Checklist - Consensus Engine

### Detection
- [ ] Detecte contradictions numeriques > 30% d'ecart
- [ ] Detecte contradictions d'assessment (exceptional vs poor)
- [ ] Calcule severite correctement (CRITICAL si haute confiance + grand ecart)
- [ ] Identifie les sources primaires pour chaque position

### Debat
- [ ] System prompt demande des PREUVES pas de la rhetorique
- [ ] Chaque position cite des sources exactes (Slide X, Ligne Y)
- [ ] Les faiblesses sont admises dans la reponse
- [ ] Format JSON respecte le schema Zod

### Arbitrage
- [ ] L'arbitre verifie les sources citees contre les donnees fournies
- [ ] L'arbitre cross-reference avec deck/CE/DB si disponible
- [ ] La decision explique POURQUOI l'autre position est rejetee
- [ ] Si 50/50 → verdict UNRESOLVED avec question fondateur

### Resolution
- [ ] finalValue a une source explicite
- [ ] baGuidance.oneLiner est clair (< 200 caracteres)
- [ ] baGuidance.verifiableSources liste les references exactes
- [ ] unresolvedAspects liste ce qui reste flou

### Optimisations
- [ ] MINOR contradictions auto-resolues sans LLM
- [ ] Skip debate si confiance asymetrique (diff > 35 points)
- [ ] tokensUsed tracke pour chaque resolution

### Output
- [ ] Aucune resolution sans au moins une preuve primaire
- [ ] Aucun verdict base uniquement sur "qui a concede"
- [ ] Tous les champs de EnhancedResolution sont presents
- [ ] Le BA peut verifier la decision avec les sources citees

---

## 5. Checklist - Reflexion Engine

### Critique
- [ ] Chaque critique cite le passage EXACT problematique
- [ ] Chaque critique a un type specifique (pas "general")
- [ ] Chaque critique reference un standard (Big4, benchmark, etc.)
- [ ] Chaque critique propose une action concrete
- [ ] Les critiques sont priorisees par severite (CRITICAL > HIGH > MEDIUM)
- [ ] Format d'ID respecte: CRT-001, CRT-002, etc.

### Cross-reference
- [ ] Verifie si Context Engine avait des donnees utilisables
- [ ] Verifie si Funding DB avait des benchmarks
- [ ] Signale les opportunites manquees dans missingCrossReferences

### Improvement
- [ ] Chaque correction montre AVANT et APRES
- [ ] Chaque correction cite sa source
- [ ] Les corrections CANNOT_FIX expliquent pourquoi
- [ ] Le revisedOutput est COMPLET (pas juste les diffs)

### Metriques
- [ ] originalScore calcule correctement
- [ ] revisedScore >= originalScore (sauf si CANNOT_FIX)
- [ ] readyForBA = true seulement si qualite suffisante (>= 70)

### Output
- [ ] baNotice.remainingWeaknesses liste les faiblesses restantes
- [ ] baNotice.dataNeedsFromFounder liste les questions
- [ ] Le BA sait EXACTEMENT ce qui a ete ameliore
- [ ] tokensUsed tracke pour la reflexion

---

## 6. Checklist - Benchmarks

### Structure
- [ ] Tous les standards ont un `id` unique
- [ ] Tous les standards ont une `source` complete (name, year, url)
- [ ] Tous les standards ont `validFrom` et `validUntil`
- [ ] Tous les standards ont des `interpretation` pour chaque niveau

### Injection
- [ ] `injectSectorBenchmarks` appele dans chaque agent Tier 1/2 pertinent
- [ ] Warnings logges si standards expires
- [ ] Standards utilises trackes dans metadata

### Maintenance
- [ ] Script/job qui verifie les expirations
- [ ] Procedure de mise a jour documentee
- [ ] Owner assigne pour la maintenance

### Qualite
- [ ] Aucun benchmark hardcode dans les prompts (grep verifie)
- [ ] Chaque benchmark cite dans un output a une source tracable
- [ ] BA peut cliquer sur l'URL source pour verifier

### Tests `resolve` du Consensus Engine

```typescript
  describe("resolve", () => {
    it("should auto-resolve MINOR contradictions", async () => {
      const contradiction = createContradiction("MINOR", 80, 60);

      const resolution = await engine.resolve(contradiction, {});

      expect(resolution.debateRecord.optimizationApplied).toBe("MINOR_AUTO_RESOLVE");
      expect(resolution.debateRecord.tokensUsed).toBe(0);
      expect(resolution.verdict.winner).toBe("agent-a"); // Higher confidence
    });

    it("should produce valid arbitrator response", async () => {
      const contradiction = createContradiction("MAJOR", 75, 70);

      const resolution = await engine.resolve(contradiction, mockVerificationContext);

      // Validate response matches schema
      const validation = ArbitratorResponseSchema.safeParse({
        verdict: resolution.verdict,
        finalValue: resolution.finalValue,
        baGuidance: resolution.baGuidance,
        unresolvedAspects: resolution.unresolvedAspects,
      });

      expect(validation.success).toBe(true);
    });

    it("should include verifiable sources in baGuidance", async () => {
      const contradiction = createContradiction("CRITICAL", 85, 80);

      const resolution = await engine.resolve(contradiction, mockVerificationContext);

      expect(resolution.baGuidance.verifiableSources.length).toBeGreaterThan(0);
      expect(resolution.baGuidance.verifiableSources[0]).toHaveProperty("source");
      expect(resolution.baGuidance.verifiableSources[0]).toHaveProperty("reference");
    });
  });
```

### Tests `reflect` du Reflexion Engine

```typescript
  describe("reflect", () => {
    it("should produce critiques with required fields", async () => {
      const result = await engine.reflect(mockReflexionInput);

      for (const critique of result.critiques) {
        expect(critique.id).toMatch(/^CRT-\d{3}$/);
        expect(critique.location.quote).toBeTruthy();
        expect(critique.suggestedFix.action).toBeTruthy();
        expect(critique.impactOnBA).toBeTruthy();
      }
    });

    it("should produce improvements with before/after", async () => {
      const result = await engine.reflect(mockReflexionInput);

      for (const improvement of result.improvements) {
        expect(improvement.change.before).not.toBe(improvement.change.after);
        expect(improvement.critiqueId).toMatch(/^CRT-\d{3}$/);
      }
    });

    it("should improve confidence score", async () => {
      const result = await engine.reflect(mockReflexionInput);

      expect(result.qualityMetrics.revisedScore).toBeGreaterThanOrEqual(
        result.qualityMetrics.originalScore
      );
    });

    it("should validate against Zod schemas", async () => {
      const result = await engine.reflect(mockReflexionInput);

      // Critiques should match schema
      for (const critique of result.critiques) {
        const validation = CritiqueSchema.safeParse(critique);
        expect(validation.success).toBe(true);
      }
    });
  });
```

---

## 7. Metriques de Succes

### Consensus Engine

```typescript
export interface ConsensusMetrics {
  // VOLUME
  totalContradictionsDetected: number;
  contradictionsByType: Record<ContradictionType, number>;
  contradictionsBySeverity: Record<ContradictionSeverity, number>;

  // RESOLUTION
  resolutionRate: number;           // % contradictions resolues (non UNRESOLVED)
  averageDebateRounds: number;
  skipToArbitrationRate: number;
  autoResolveRate: number;

  // QUALITE
  highTrustResolutions: number;     // % avec trustLevel=HIGH
  mediumTrustResolutions: number;
  lowTrustResolutions: number;
  unresolvedCritical: number;       // Nb CRITICAL non resolues (doit etre 0)

  // COUTS
  averageTokensPerContradiction: number;
  totalTokensUsed: number;
  estimatedCostUSD: number;

  // TEMPS
  averageResolutionTimeMs: number;
  p95ResolutionTimeMs: number;
}

export interface ConsensusMetricsTargets {
  resolutionRate: { target: 85, minimum: 70 };
  highTrustResolutions: { target: 60, minimum: 40 };
  unresolvedCritical: { target: 0, maximum: 2 };
  averageTokensPerContradiction: { target: 8000, maximum: 15000 };
  averageResolutionTimeMs: { target: 5000, maximum: 15000 };
}
```

### Reflexion Engine

```typescript
export interface ReflexionMetrics {
  // VOLUME
  totalAgentsReflected: number;
  totalCritiquesGenerated: number;
  critiquesByType: Record<CritiqueType, number>;
  critiquesBySeverity: Record<CritiqueSeverity, number>;

  // CORRECTIONS
  fixRate: number;                    // % critiques FIXED
  partialFixRate: number;
  cannotFixRate: number;

  // AMELIORATION QUALITE
  averageConfidenceGain: number;
  averageQualityScoreGain: number;
  readyForBARate: number;

  // COUTS
  averageTokensPerReflexion: number;
  totalTokensUsed: number;

  // TEMPS
  averageReflexionTimeMs: number;
}

export interface ReflexionMetricsTargets {
  fixRate: { target: 70, minimum: 50 };
  averageConfidenceGain: { target: 15, minimum: 8 };
  averageQualityScoreGain: { target: 20, minimum: 10 };
  readyForBARate: { target: 90, minimum: 75 };
  cannotFixRate: { target: 15, maximum: 30 };
}
```

### MetricsCollector

```typescript
export class MetricsCollector {
  private consensusHistory: ConsensusMetrics[] = [];
  private reflexionHistory: ReflexionMetrics[] = [];

  recordConsensusRun(metrics: ConsensusMetrics): void {
    this.consensusHistory.push({ ...metrics, timestamp: new Date() });

    if (metrics.unresolvedCritical > 0) {
      console.error(`[ALERT] ${metrics.unresolvedCritical} contradictions CRITICAL non resolues!`);
    }
    if (metrics.resolutionRate < 70) {
      console.warn(`[WARNING] Resolution rate faible: ${metrics.resolutionRate}%`);
    }
  }

  recordReflexionRun(metrics: ReflexionMetrics): void {
    this.reflexionHistory.push({ ...metrics, timestamp: new Date() });

    if (metrics.cannotFixRate > 30) {
      console.warn(`[WARNING] Cannot fix rate eleve: ${metrics.cannotFixRate}%`);
    }
  }

  getWeeklyReport(): EnginePerformanceReport {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentConsensus = this.consensusHistory.filter(m => m.timestamp >= weekAgo);
    const recentReflexion = this.reflexionHistory.filter(m => m.timestamp >= weekAgo);

    return {
      period: "weekly",
      consensus: aggregateMetrics(recentConsensus),
      reflexion: aggregateMetrics(recentReflexion),
      alerts: this.generateAlerts(recentConsensus, recentReflexion),
      recommendations: this.generateRecommendations(recentConsensus, recentReflexion)
    };
  }
}
```

### A/B Testing des Prompts

```typescript
// Pour comparer les performances de différentes versions de prompts

interface PromptVariant {
  id: string;
  name: string;
  systemPrompt: string;
  trafficPercentage: number; // 0-100
}

interface ABTestResult {
  variantId: string;
  sampleSize: number;
  metrics: ConsensusMetrics | ReflexionMetrics;
  statisticalSignificance: number; // p-value
}

const CONSENSUS_ARBITRATOR_VARIANTS: PromptVariant[] = [
  {
    id: "v1-verbose",
    name: "Prompt verbeux actuel",
    systemPrompt: buildArbitratorSystemPrompt(), // Version actuelle
    trafficPercentage: 50
  },
  {
    id: "v2-concise",
    name: "Prompt condensé",
    systemPrompt: buildConciseArbitratorPrompt(), // Version plus courte
    trafficPercentage: 50
  }
];

function selectPromptVariant(variants: PromptVariant[]): PromptVariant {
  const rand = Math.random() * 100;
  let cumulative = 0;

  for (const variant of variants) {
    cumulative += variant.trafficPercentage;
    if (rand < cumulative) return variant;
  }

  return variants[0];
}
```

---

## 8. Structure Fichiers Recommandee

```
src/agents/orchestration/
├── index.ts                          # Exports publics
│
├── consensus/
│   ├── index.ts                      # Export ConsensusEngine
│   ├── types.ts                      # Types Section 4.1
│   ├── engine.ts                     # ConsensusEngine class
│   ├── detection.ts                  # Logique detection contradictions
│   ├── resolution.ts                 # Logique resolution
│   ├── prompts/
│   │   ├── debater.ts
│   │   └── arbitrator.ts
│   ├── schemas.ts                    # Schemas Zod
│   └── __tests__/
│       ├── detection.test.ts
│       └── resolution.test.ts
│
├── reflexion/
│   ├── index.ts                      # Export ReflexionEngine
│   ├── types.ts                      # Types Section 5.1
│   ├── engine.ts                     # ReflexionEngine class
│   ├── critique.ts                   # Logique critique
│   ├── improvement.ts                # Logique amelioration
│   ├── prompts/
│   │   ├── critic.ts
│   │   └── improver.ts
│   ├── schemas.ts                    # Schemas Zod
│   └── __tests__/
│       ├── critique.test.ts
│       └── improvement.test.ts
│
├── common/
│   ├── config.ts                     # QUALITY_ENGINE_CONFIG
│   ├── verification-context.ts       # VerificationContext
│   ├── llm-validation.ts             # completAndValidate
│   ├── financial-calculations.ts     # Calculs arithmetiques
│   └── fallbacks.ts                  # Edge cases et fallbacks
│
├── metrics/
│   ├── types.ts                      # Types metriques
│   ├── collector.ts                  # MetricsCollector
│   └── targets.ts                    # Cibles de performance
│
└── integration/
    └── quality-processor.ts          # QualityProcessor
```

### Index principal

```typescript
// src/agents/orchestration/index.ts

// Engines
export { ConsensusEngine } from "./consensus";
export { ReflexionEngine } from "./reflexion";

// Integration
export { QualityProcessor } from "./integration/quality-processor";

// Config
export { QUALITY_ENGINE_CONFIG } from "./common/config";

// Types (re-export)
export type {
  EnhancedContradiction,
  EnhancedResolution,
  ContradictionType,
  ContradictionSeverity,
  VerdictType,
  BAGuidance,
} from "./consensus/types";

export type {
  EnhancedCritique,
  EnhancedImprovement,
  EnhancedReflexionOutput,
  CritiqueType,
  CritiqueSeverity,
} from "./reflexion/types";

// Schemas
export {
  ArbitratorResponseSchema,
  DebaterResponseSchema,
} from "./consensus/schemas";

export {
  CriticResponseSchema,
  ImproverResponseSchema,
} from "./reflexion/schemas";

// Utils
export { completAndValidate } from "./common/llm-validation";
export { buildVerificationContext } from "./common/verification-context";
export * from "./common/financial-calculations";
```

---

## Fichiers connexes

- [00-ENGINE-OVERVIEW.md](./00-ENGINE-OVERVIEW.md) - Vision et declenchement
- [01-CONSENSUS-SPEC.md](./01-CONSENSUS-SPEC.md) - Types Consensus
- [02-CONSENSUS-PROMPTS.md](./02-CONSENSUS-PROMPTS.md) - Prompts Consensus
- [03-REFLEXION-SPEC.md](./03-REFLEXION-SPEC.md) - Types Reflexion
- [04-REFLEXION-PROMPTS.md](./04-REFLEXION-PROMPTS.md) - Prompts Reflexion
- [05-SHARED-UTILS.md](./05-SHARED-UTILS.md) - Schemas et calculs
