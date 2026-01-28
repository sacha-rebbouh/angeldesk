# Consensus Engine - Specification Technique

> Derniere mise a jour: 2026-01-28 | Source: REFLEXION-CONSENSUS-ENGINES.md v3.0

---

## Table des matieres

1. [Types de Detection](#1-types-de-detection)
2. [Types de Resolution](#2-types-de-resolution)
3. [Types de Debat](#3-types-de-debat)
4. [Logique de Detection](#4-logique-de-detection)
5. [Logique de Resolution](#5-logique-de-resolution)
6. [Exemples de Bons Outputs](#6-exemples-de-bons-outputs)

---

## 1. Types de Detection

```typescript
// src/agents/orchestration/consensus-types.ts

// ============================================================================
// TYPES DE DETECTION
// ============================================================================

export type ContradictionType =
  | "numeric_value"      // Deux chiffres differents pour la meme metrique
  | "assessment"         // "Bon" vs "Mauvais" sur le meme sujet
  | "existence"          // "Existe" vs "N'existe pas"
  | "interpretation";    // Meme donnee, conclusions opposees

export type ContradictionSeverity = "CRITICAL" | "MAJOR" | "MODERATE" | "MINOR";

export interface ContradictionPosition {
  agentName: string;
  findingId: string;
  claim: string;
  value: unknown;
  unit?: string;
  confidence: number;
  sources: {
    type: "deck" | "financial_model" | "context_engine" | "funding_db" | "inference";
    reference: string;
    quote?: string;
  }[];
}

export interface EnhancedContradiction {
  id: string;
  topic: string;
  detectedAt: Date;

  // Positions en conflit
  positions: ContradictionPosition[];

  // Analyse de la contradiction
  contradictionType: ContradictionType;

  // Severite calculee
  severity: {
    level: ContradictionSeverity;
    calculation: string;
    impactIfWrong: string;
  };

  // Donnees de verification disponibles
  verificationData: {
    deckReferences: string[];
    contextEngineData?: unknown;
    fundingDbData?: unknown;
  };

  // Status
  status: "detected" | "debating" | "resolved" | "unresolved";
}
```

---

## 2. Types de Resolution

```typescript
// ============================================================================
// TYPES DE RESOLUTION
// ============================================================================

export type VerdictType = "POSITION_A" | "POSITION_B" | "SYNTHESIS" | "UNRESOLVED";

export interface DecisiveFactor {
  factor: string;
  source: string;
  weight: "PRIMARY" | "SUPPORTING";
}

export interface RejectedPositionFlaw {
  position: string;
  flaw: string;
  evidence: string;
}

export interface FinalValue {
  value: unknown;
  unit?: string;
  confidence: number;
  range?: { min: unknown; max: unknown };
  derivedFrom: {
    source: string;
    calculation?: string;
  };
}

export interface BAGuidance {
  oneLiner: string;
  canTrust: boolean;
  trustLevel: "HIGH" | "MEDIUM" | "LOW";
  whatToVerify?: string;
  questionForFounder?: string;
  verifiableSources: {
    source: string;
    reference: string;
    whatItProves: string;
  }[];
}

export interface UnresolvedAspect {
  aspect: string;
  reason: string;
  suggestedAction: string;
}

export interface EnhancedResolution {
  contradictionId: string;
  resolvedAt: Date;

  // Verdict
  verdict: {
    decision: VerdictType;
    winner?: string;
    justification: {
      decisiveFactors: DecisiveFactor[];
      rejectedPositionFlaws: RejectedPositionFlaw[];
    };
  };

  // Valeur finale
  finalValue: FinalValue;

  // Pour le BA
  baGuidance: BAGuidance;

  // Debat complet (pour audit)
  debateRecord: {
    rounds: DebateRound[];
    totalDuration: number;
    tokensUsed: number;
    optimizationApplied?: string; // ex: "SKIP_TO_ARBITRATION" si confiance asymetrique
  };

  // Reste a clarifier
  unresolvedAspects: UnresolvedAspect[];
}
```

---

## 3. Types de Debat

```typescript
// ============================================================================
// TYPES DE DEBAT
// ============================================================================

export interface DebateEvidence {
  source: string;
  quote: string;
  interpretation: string;
}

export interface DebatePosition {
  agentName: string;
  claim: string;
  value: unknown;
  evidence: DebateEvidence[];
  calculation?: {
    formula: string;
    steps: string[];
    result: string;
  };
  weaknesses: string[];
  confidenceLevel: number;
  confidenceJustification: string;
}

export interface DebateRound {
  roundNumber: number;
  positions: DebatePosition[];
  timestamp: Date;
  tokensUsed: number;
}
```

---

## 4. Logique de Detection

### Detection des contradictions numeriques > 30%

```typescript
// src/agents/orchestration/__tests__/consensus-engine.test.ts

describe("detectContradictions", () => {
  it("should detect numeric contradictions > 30%", async () => {
    const findings = [
      createFinding("agent-a", "ARR", 500000, 80),
      createFinding("agent-b", "ARR", 800000, 75),
    ];

    const contradictions = await engine.detectContradictions(findings);

    expect(contradictions).toHaveLength(1);
    expect(contradictions[0].contradictionType).toBe("numeric_value");
    expect(contradictions[0].severity.level).toBe("MAJOR"); // High confidence + large diff
  });

  it("should NOT detect contradictions < 30%", async () => {
    const findings = [
      createFinding("agent-a", "ARR", 500000, 80),
      createFinding("agent-b", "ARR", 520000, 75), // Only 4% diff
    ];

    const contradictions = await engine.detectContradictions(findings);

    expect(contradictions).toHaveLength(0);
  });

  it("should detect assessment contradictions", async () => {
    const findings = [
      createFinding("agent-a", "team_quality", null, 85, "exceptional"),
      createFinding("agent-b", "team_quality", null, 70, "below_average"),
    ];

    const contradictions = await engine.detectContradictions(findings);

    expect(contradictions).toHaveLength(1);
    expect(contradictions[0].contradictionType).toBe("assessment");
  });
});
```

### Gestion de 3+ agents avec positions differentes

```typescript
// Situation: financial-auditor dit ARR=500K, market-intel dit ARR=800K, deck-forensics dit ARR=520K

interface MultiPositionContradiction extends EnhancedContradiction {
  positions: ContradictionPosition[]; // Array > 2
  clusterAnalysis?: {
    clusters: { positions: string[]; avgValue: number; avgConfidence: number }[];
    outliers: string[];
  };
}

function handleMultiPositionContradiction(
  contradiction: MultiPositionContradiction
): ResolutionStrategy {
  const positions = contradiction.positions;

  // Strategie 1: Clustering par proximite de valeur (seuil 15%)
  const clusters = clusterPositionsByValue(positions, 0.15);

  if (clusters.length === 1) {
    // Tous proches → prendre la moyenne ponderee par confiance
    return { strategy: "WEIGHTED_AVERAGE", clusters };
  }

  if (clusters.length === 2) {
    // 2 clusters → traiter comme contradiction binaire classique
    const dominant = clusters.reduce((a, b) =>
      a.avgConfidence > b.avgConfidence ? a : b
    );
    return { strategy: "DOMINANT_CLUSTER", winner: dominant };
  }

  // 3+ clusters → trop d'incertitude
  return {
    strategy: "CANNOT_ASSESS",
    reason: `${clusters.length} positions incompatibles sans cluster dominant`,
    suggestedAction: "Demander clarification au fondateur"
  };
}

function clusterPositionsByValue(
  positions: ContradictionPosition[],
  threshold: number
): Cluster[] {
  const clusters: Cluster[] = [];
  const sorted = [...positions].sort((a, b) =>
    Number(a.value) - Number(b.value)
  );

  let currentCluster: ContradictionPosition[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = Number(sorted[i - 1].value);
    const curr = Number(sorted[i].value);
    const deviation = Math.abs(curr - prev) / prev;

    if (deviation <= threshold) {
      currentCluster.push(sorted[i]);
    } else {
      clusters.push(createCluster(currentCluster));
      currentCluster = [sorted[i]];
    }
  }
  clusters.push(createCluster(currentCluster));

  return clusters;
}
```

---

## 5. Logique de Resolution

### Skip to Arbitration (Confiance asymetrique)

```typescript
function shouldSkipDebate(contradiction: EnhancedContradiction): boolean {
  const [posA, posB] = contradiction.positions;
  const confidenceDiff = Math.abs(posA.confidence - posB.confidence);

  // Si difference > 35 points ET le plus confiant > 80%, skip le debat
  if (confidenceDiff > 35 && Math.max(posA.confidence, posB.confidence) > 80) {
    return true;
  }

  return false;
}

async function resolveContradiction(contradiction: EnhancedContradiction): Promise<EnhancedResolution> {
  if (shouldSkipDebate(contradiction)) {
    // Aller directement a l'arbitrage avec les positions initiales
    return await arbitrateDirectly(contradiction);
  }

  // Sinon, debat complet
  return await fullDebate(contradiction);
}
```

### Resolution automatique MINOR

```typescript
function resolveMinorContradiction(contradiction: EnhancedContradiction): EnhancedResolution {
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
```

### Gestion des deux positions < 50% confiance

```typescript
function handleLowConfidenceBothSides(
  contradiction: EnhancedContradiction
): EnhancedResolution {
  const [posA, posB] = contradiction.positions;

  // Si les deux sont < 50%, on ne peut pas trancher
  if (posA.confidence < 50 && posB.confidence < 50) {
    return {
      contradictionId: contradiction.id,
      resolvedAt: new Date(),
      verdict: {
        decision: "UNRESOLVED",
        winner: null,
        justification: {
          decisiveFactors: [],
          rejectedPositionFlaws: [
            {
              position: posA.agentName,
              flaw: `Confiance trop faible: ${posA.confidence}%`,
              evidence: "Seuil minimum de 50% non atteint"
            },
            {
              position: posB.agentName,
              flaw: `Confiance trop faible: ${posB.confidence}%`,
              evidence: "Seuil minimum de 50% non atteint"
            }
          ]
        }
      },
      finalValue: {
        value: null,
        confidence: 0,
        derivedFrom: {
          source: "CANNOT_ASSESS - confiance insuffisante des deux cotes"
        }
      },
      baGuidance: {
        oneLiner: `${contradiction.topic}: donnees insuffisantes pour trancher`,
        canTrust: false,
        trustLevel: "LOW",
        whatToVerify: "Les donnees du deck sont insuffisantes ou contradictoires",
        questionForFounder: buildClarificationQuestion(contradiction),
        verifiableSources: []
      },
      debateRecord: {
        rounds: [],
        totalDuration: 0,
        tokensUsed: 0,
        optimizationApplied: "LOW_CONFIDENCE_SKIP"
      },
      unresolvedAspects: [{
        aspect: contradiction.topic,
        reason: `Agent A: ${posA.confidence}%, Agent B: ${posB.confidence}% - tous deux < 50%`,
        suggestedAction: "BLOQUANT: demander donnees precises au fondateur"
      }]
    };
  }

  return null; // Continue avec le flow standard
}
```

---

## 6. Exemples de Bons Outputs

### Resolution reussie (POSITION_A gagne)

```json
{
  "verdict": {
    "decision": "POSITION_A",
    "winner": "financial-auditor",
    "justification": {
      "decisiveFactors": [
        {
          "factor": "MRR explicite dans le deck",
          "source": "Deck Slide 8: 'MRR Decembre 2024: 42,000€'",
          "weight": "PRIMARY"
        },
        {
          "factor": "Calcul ARR coherent et simple",
          "source": "42,000€ × 12 = 504,000€",
          "weight": "SUPPORTING"
        },
        {
          "factor": "Financial Model confirme a 0.6% pres",
          "source": "FM Onglet 'Revenue', Ligne 12: 507,000€ ARR",
          "weight": "SUPPORTING"
        }
      ],
      "rejectedPositionFlaws": [
        {
          "position": "market-intelligence (ARR = 800K€)",
          "flaw": "Aucune source primaire citee",
          "evidence": "L'agent mentionne 'estimation de marche' sans reference au deck ni au FM"
        },
        {
          "position": "market-intelligence",
          "flaw": "Ecart de 58% inexplique",
          "evidence": "800K€ vs 504K€ = +58%, impossible d'etre une erreur d'arrondi"
        }
      ]
    }
  },
  "finalValue": {
    "value": 505000,
    "unit": "EUR",
    "confidence": 92,
    "range": { "min": 504000, "max": 507000 },
    "derivedFrom": {
      "source": "Deck Slide 8 + FM Onglet Revenue Ligne 12",
      "calculation": "MRR 42K€ × 12 = 504K€. FM indique 507K€. Moyenne = 505.5K€ arrondi a 505K€"
    }
  },
  "baGuidance": {
    "oneLiner": "ARR = 505K€ (source: deck slide 8 + financial model, ecart < 1%)",
    "canTrust": true,
    "trustLevel": "HIGH",
    "whatToVerify": null,
    "questionForFounder": null,
    "verifiableSources": [
      {
        "source": "Deck",
        "reference": "Slide 8",
        "whatItProves": "MRR mensuel = 42,000€"
      },
      {
        "source": "Financial Model",
        "reference": "Onglet Revenue, Ligne 12",
        "whatItProves": "ARR annuel = 507,000€"
      }
    ]
  },
  "unresolvedAspects": []
}
```

### Resolution impossible (UNRESOLVED)

```json
{
  "verdict": {
    "decision": "UNRESOLVED",
    "winner": null,
    "justification": {
      "decisiveFactors": [],
      "rejectedPositionFlaws": []
    }
  },
  "finalValue": {
    "value": null,
    "unit": "EUR",
    "confidence": 35,
    "range": { "min": 1800, "max": 4200 },
    "derivedFrom": {
      "source": "Aucune donnee fiable",
      "calculation": "Agent A estime 1,800€ (inference), Agent B estime 4,200€ (benchmark sectoriel). Aucune source primaire."
    }
  },
  "baGuidance": {
    "oneLiner": "CAC non determinable - donnees insuffisantes dans le deck",
    "canTrust": false,
    "trustLevel": "LOW",
    "whatToVerify": "Le deck ne mentionne ni les depenses marketing ni le nombre de clients acquis",
    "questionForFounder": "Pouvez-vous fournir: (1) Total des depenses marketing des 12 derniers mois, (2) Nombre de nouveaux clients acquis sur cette periode?",
    "verifiableSources": []
  },
  "unresolvedAspects": [
    {
      "aspect": "Customer Acquisition Cost (CAC)",
      "reason": "Deck ne fournit ni depenses marketing detaillees ni cohortes clients",
      "suggestedAction": "BLOQUANT: Demander au fondateur avant de valider l'analyse financiere"
    }
  ]
}
```

---

## Fichiers connexes

- [00-ENGINE-OVERVIEW.md](./00-ENGINE-OVERVIEW.md) - Vision et declenchement
- [02-CONSENSUS-PROMPTS.md](./02-CONSENSUS-PROMPTS.md) - Prompts debater et arbitrator
- [05-SHARED-UTILS.md](./05-SHARED-UTILS.md) - Schemas Zod pour validation
