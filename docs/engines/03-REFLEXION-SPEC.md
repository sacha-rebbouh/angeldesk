# Reflexion Engine - Specification Technique

> Derniere mise a jour: 2026-01-28 | Source: REFLEXION-CONSENSUS-ENGINES.md v3.0

---

## Table des matieres

1. [Types de Critique](#1-types-de-critique)
2. [Types d'Improvement](#2-types-dimprovement)
3. [Types d'Output](#3-types-doutput)
4. [Logique de Declenchement](#4-logique-de-declenchement)
5. [Edge Cases](#5-edge-cases)
6. [Exemples de Bons Outputs](#6-exemples-de-bons-outputs)

---

## 1. Types de Critique

```typescript
// src/agents/orchestration/reflexion-types.ts

// ============================================================================
// TYPES DE CRITIQUE
// ============================================================================

export type CritiqueType =
  | "unsourced_claim"           // Affirmation sans source
  | "unverifiable_calculation"  // Calcul sans formule/inputs
  | "incomplete_red_flag"       // Red flag sans tous les composants
  | "missing_data_not_flagged"  // Donnee manquante non signalee
  | "missing_cross_reference"   // Context Engine/DB non utilise
  | "weak_conclusion"           // Conclusion non supportee par les preuves
  | "methodological_flaw"       // Erreur de methodologie
  | "inconsistency";            // Incoherence interne

export type CritiqueSeverity = "CRITICAL" | "HIGH" | "MEDIUM";

export interface CritiqueLocation {
  section: string;
  quote: string;
  lineNumbers?: string;
}

export interface SuggestedFix {
  action: string;
  source?: string;
  example?: string;
  estimatedEffort: "TRIVIAL" | "EASY" | "MODERATE" | "SIGNIFICANT";
}

export interface EnhancedCritique {
  id: string;
  type: CritiqueType;
  severity: CritiqueSeverity;
  location: CritiqueLocation;
  issue: string;
  standard: string;
  expectedBehavior: string;
  suggestedFix: SuggestedFix;
  impactOnBA: string;
  relatedFindings?: string[];
}
```

---

## 2. Types d'Improvement

```typescript
// ============================================================================
// TYPES D'IMPROVEMENT
// ============================================================================

export type ChangeType =
  | "added_source"
  | "added_calculation"
  | "completed_red_flag"
  | "added_cross_reference"
  | "clarified"
  | "removed"
  | "downgraded";

export interface Change {
  before: string;
  after: string;
  type: ChangeType;
}

export interface ImprovementJustification {
  sourceUsed?: string;
  calculationShown?: string;
  crossReferenceResult?: string;
  ifCannotFix?: string;
}

export interface EnhancedImprovement {
  critiqueId: string;
  status: "FIXED" | "PARTIALLY_FIXED" | "CANNOT_FIX";
  change: Change;
  justification: ImprovementJustification;
  confidenceImpact: number;
  qualityImpact: "HIGH" | "MEDIUM" | "LOW";
}
```

---

## 3. Types d'Output

```typescript
// ============================================================================
// TYPES D'OUTPUT
// ============================================================================

export interface CritiqueSummary {
  total: number;
  bySeverity: { CRITICAL: number; HIGH: number; MEDIUM: number };
  byType: Record<CritiqueType, number>;
}

export interface ImprovementSummary {
  fixed: number;
  partiallyFixed: number;
  cannotFix: number;
}

export interface QualityMetrics {
  originalScore: number;
  revisedScore: number;
  change: number;
  readyForBA: boolean;
}

export interface BANotice {
  remainingWeaknesses: string[];
  dataNeedsFromFounder: string[];
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
}

export interface EnhancedReflexionOutput {
  // Input
  originalAgentOutput: unknown;
  agentName: string;
  agentConfidence: number;

  // Critiques
  critiques: EnhancedCritique[];
  critiqueSummary: CritiqueSummary;

  // Improvements
  improvements: EnhancedImprovement[];
  improvementSummary: ImprovementSummary;

  // Output revise
  revisedOutput: unknown;
  revisedFindings: ScoredFinding[];

  // Metriques
  qualityMetrics: QualityMetrics;

  // Pour le BA
  baNotice: BANotice;

  // Metadata
  tokensUsed: number;
  processingTime: number;
}
```

---

## 4. Logique de Declenchement

```typescript
interface ReflexionTriggerConfig {
  tier1ConfidenceThreshold: number;  // 70
  tier2ConfidenceThreshold: number;  // 60
  tier3Enabled: boolean;             // false - jamais de reflexion sur Tier 3
  criticalRedFlagReflexion: boolean; // true - toujours reflexion si red flag CRITICAL
}

function shouldTriggerReflexion(
  agentName: string,
  agentTier: 1 | 2 | 3,
  avgConfidence: number,
  hasCriticalRedFlag: boolean,
  config: ReflexionTriggerConfig
): boolean {
  // Jamais pour Tier 3 (synthese)
  if (agentTier === 3) return false;

  // Toujours si red flag critique non source
  if (hasCriticalRedFlag) return true;

  // Sinon, selon seuil de confiance
  const threshold = agentTier === 1
    ? config.tier1ConfidenceThreshold
    : config.tier2ConfidenceThreshold;

  return avgConfidence < threshold;
}
```

### Tests de declenchement

```typescript
// src/agents/orchestration/__tests__/reflexion-engine.test.ts

describe("needsReflexion", () => {
  it("should return true for Tier 1 agent with confidence < 70%", () => {
    const findings = [createFinding("agent-a", "metric", 100, 65)];

    expect(engine.needsReflexion(1, findings)).toBe(true);
  });

  it("should return false for Tier 1 agent with confidence >= 70%", () => {
    const findings = [createFinding("agent-a", "metric", 100, 75)];

    expect(engine.needsReflexion(1, findings)).toBe(false);
  });

  it("should return true for Tier 2 agent with confidence < 60%", () => {
    const findings = [createFinding("agent-a", "metric", 100, 55)];

    expect(engine.needsReflexion(2, findings)).toBe(true);
  });

  it("should always return false for Tier 3 agents", () => {
    const findings = [createFinding("agent-a", "metric", 100, 30)];

    expect(engine.needsReflexion(3, findings)).toBe(false);
  });
});
```

---

## 5. Edge Cases

### Agent output vide ou malforme

```typescript
function validateAgentOutputForReflexion(
  output: unknown,
  agentName: string
): { valid: boolean; error?: string; canReflect: boolean } {
  // Output null/undefined
  if (output === null || output === undefined) {
    return {
      valid: false,
      error: `Agent ${agentName} a retourne null/undefined`,
      canReflect: false // Rien a critiquer
    };
  }

  // Output vide (objet/array vide)
  if (typeof output === "object") {
    const isEmpty = Array.isArray(output)
      ? output.length === 0
      : Object.keys(output).length === 0;

    if (isEmpty) {
      return {
        valid: false,
        error: `Agent ${agentName} a retourne un output vide`,
        canReflect: false
      };
    }
  }

  // Output sans findings
  if (typeof output === "object" && !Array.isArray(output)) {
    const obj = output as Record<string, unknown>;
    if (!obj.findings && !obj.analysis && !obj.metrics) {
      return {
        valid: true,
        error: `Agent ${agentName} output sans structure standard (findings/analysis/metrics)`,
        canReflect: true // On peut quand meme critiquer le format
      };
    }
  }

  return { valid: true, canReflect: true };
}
```

### Toutes les critiques sont CANNOT_FIX

```typescript
function handleAllCannotFix(
  critiques: EnhancedCritique[],
  improvements: EnhancedImprovement[]
): {
  escalate: boolean;
  action: string;
  baNotice: BANotice;
} {
  const cannotFixCount = improvements.filter(i => i.status === "CANNOT_FIX").length;
  const cannotFixRatio = cannotFixCount / improvements.length;

  if (cannotFixRatio > 0.7) {
    // Plus de 70% de critiques non corrigeables
    return {
      escalate: true,
      action: "DATA_INSUFFICIENCY",
      baNotice: {
        remainingWeaknesses: critiques.map(c => c.issue),
        dataNeedsFromFounder: critiques
          .filter(c => c.type === "missing_data_not_flagged" || c.type === "unsourced_claim")
          .map(c => c.suggestedFix.action),
        confidenceLevel: "LOW"
      }
    };
  }

  return {
    escalate: false,
    action: "CONTINUE",
    baNotice: {
      remainingWeaknesses: improvements
        .filter(i => i.status === "CANNOT_FIX")
        .map(i => i.change.before),
      dataNeedsFromFounder: [],
      confidenceLevel: "MEDIUM"
    }
  };
}
```

---

## 6. Exemples de Bons Outputs

### Critique complete

```json
{
  "critiques": [
    {
      "id": "CRT-001",
      "type": "unsourced_claim",
      "severity": "HIGH",
      "location": {
        "section": "findings.metrics[2]",
        "quote": "Gross Margin estimated at 75%"
      },
      "issue": "Le Gross Margin de 75% est marque comme 'estimated' sans source ni calcul explicite",
      "standard": "Standard Big4: Toute metrique financiere doit avoir une source primaire ou un calcul explicite avec inputs sources",
      "expectedBehavior": "Soit citer le deck/financial model directement, soit calculer depuis Revenue et COGS avec sources, soit marquer comme 'NON DISPONIBLE'",
      "suggestedFix": {
        "action": "Chercher dans le Financial Model s'il y a une ligne Gross Margin, COGS, ou marge brute",
        "source": "Financial Model, potentiellement onglet 'P&L' ou 'Unit Economics'",
        "example": "Gross Margin: 72% (Financial Model, P&L, Ligne 8: Revenue 500K€ - COGS 140K€ = 360K€ / 500K€ = 72%)",
        "estimatedEffort": "EASY"
      },
      "impactOnBA": "Le BA utilise le Gross Margin pour calculer le LTV. Une erreur de 5% sur le GM entraine une erreur de ~15% sur le LTV, faussant completement l'evaluation de la viabilite du business model."
    },
    {
      "id": "CRT-002",
      "type": "missing_cross_reference",
      "severity": "MEDIUM",
      "location": {
        "section": "findings.valuation",
        "quote": "Valuation of 8M€ appears aggressive"
      },
      "issue": "L'affirmation 'aggressive' n'est pas benchmarkee contre la Funding Database",
      "standard": "DB-EXPLOITATION-SPEC.md: Toute affirmation sur la valorisation doit etre cross-referencee avec les percentiles de la base de deals",
      "expectedBehavior": "Calculer le percentile exact de cette valorisation vs deals similaires dans la DB (meme stage, meme secteur, ARR similaire)",
      "suggestedFix": {
        "action": "Interroger la Funding DB pour deals Seed SaaS B2B avec ARR 400K-600K€",
        "source": "Funding Database via benchmark-service",
        "example": "Valuation 8M€ @ 500K ARR = 16x ARR. Funding DB Seed SaaS B2B: P25=8x, Median=12x, P75=18x. Ce deal = P68. Verdict: MODEREMENT AGGRESSIVE (+33% vs median).",
        "estimatedEffort": "MODERATE"
      },
      "impactOnBA": "Sans benchmark chiffre, le BA ne sait pas si 8M€ est normal, cher, ou tres cher pour ce type de deal. Il negocie a l'aveugle."
    },
    {
      "id": "CRT-003",
      "type": "incomplete_red_flag",
      "severity": "CRITICAL",
      "location": {
        "section": "redFlags[0]",
        "quote": "Projections seem unrealistic"
      },
      "issue": "Red flag 'projections irrealistes' sans quantification ni calcul demontrant l'irrealisme",
      "standard": "AGENT-REFONTE-PROMPT.md: Chaque red flag doit avoir severite + preuve + impact + question fondateur",
      "expectedBehavior": "Calculer le taux de croissance implicite et comparer aux benchmarks sectoriels. Montrer POURQUOI c'est irrealiste avec des chiffres.",
      "suggestedFix": {
        "action": "Calculer CAGR des projections et comparer au P90 du secteur",
        "source": "Financial Model projections + benchmarks SaaS growth",
        "example": "Red flag: Projections irrealistes - CAGR projete de 400% vs P90 secteur de 150%. Ecart de 250 points = probabilite <5% d'atteindre les objectifs.",
        "estimatedEffort": "MODERATE"
      },
      "impactOnBA": "Un red flag vague est inutile. Le BA a besoin de savoir EXACTEMENT pourquoi c'est un probleme et QUELLE question poser au fondateur."
    }
  ],
  "missingCrossReferences": [
    {
      "source": "Funding Database",
      "dataType": "Comparables valorisation Seed SaaS Europe",
      "potentialValue": "Positionner le deal vs P25/median/P75 pour negociation informee"
    },
    {
      "source": "Context Engine - Crunchbase",
      "dataType": "Historique de funding des fondateurs",
      "potentialValue": "Verifier si les fondateurs ont deja leve et a quelle valorisation"
    }
  ],
  "overallAssessment": {
    "qualityScore": 52,
    "verdict": "MAJOR_REVISION_REQUIRED",
    "keyWeaknesses": [
      "3 metriques financieres cles sans source verifiable",
      "Aucune utilisation de la Funding Database pour benchmark",
      "Red flag critique incomplet et non actionnable"
    ],
    "readyForBA": false
  }
}
```

### Improvement complete

```json
{
  "corrections": [
    {
      "critiqueId": "CRT-001",
      "status": "FIXED",
      "change": {
        "before": "Gross Margin estimated at 75%",
        "after": "Gross Margin: 72.0% (Financial Model, Onglet P&L, Ligne 8: Revenue 507,000€ - COGS 142,000€ = 365,000€. Calcul: 365,000 / 507,000 = 0.720 = 72.0%)",
        "type": "added_source"
      },
      "justification": {
        "sourceUsed": "Financial Model, Onglet 'P&L', Lignes 5 (Revenue: 507,000€) et 8 (COGS: 142,000€)",
        "calculationShown": "Gross Profit = 507,000 - 142,000 = 365,000€. Gross Margin = 365,000 / 507,000 = 0.7199 = 72.0%"
      },
      "confidenceImpact": 12,
      "qualityImpact": "HIGH"
    },
    {
      "critiqueId": "CRT-002",
      "status": "FIXED",
      "change": {
        "before": "Valuation of 8M€ appears aggressive",
        "after": "Valuation 8M€ pre-money @ 505K€ ARR = 15.8x ARR multiple. Funding DB benchmark (Seed SaaS B2B Europe, n=47 deals): P25=7.2x, Median=11.5x, P75=16.8x. Ce deal se situe au P72 (entre Median et P75). Verdict: MODEREMENT AGGRESSIVE (+37% vs median sectoriel).",
        "type": "added_cross_reference"
      },
      "justification": {
        "crossReferenceResult": "Funding DB query: stage=Seed, sector=SaaS B2B, region=Europe, ARR_range=300K-800K€. Resultats: 47 deals, multiples ARR de 4.5x a 24x. Percentile calcule par interpolation lineaire."
      },
      "confidenceImpact": 15,
      "qualityImpact": "HIGH"
    },
    {
      "critiqueId": "CRT-003",
      "status": "FIXED",
      "change": {
        "before": "Projections seem unrealistic",
        "after": "RED FLAG [CRITICAL]: Projections de croissance irrealistes\n- Preuve: ARR projete Y1→Y3: 505K€ → 4.2M€ = CAGR de 188%\n- Benchmark: Top decile SaaS B2B Seed = CAGR 120% (Source: OpenView 2024)\n- Ecart: +68 points vs meilleurs performeurs du marche\n- Impact: Probabilite <5% d'atteindre projections. Valorisation basee sur ces projections = surestimee de 40-60%\n- Question fondateur: 'Quels sont les 3 drivers specifiques qui vous permettraient d'atteindre 188% CAGR alors que le top 10% du marche fait 120%?'",
        "type": "completed_red_flag"
      },
      "justification": {
        "calculationShown": "CAGR = (4,200,000 / 505,000)^(1/2) - 1 = 2.88 - 1 = 188%",
        "sourceUsed": "Financial Model projections + OpenView SaaS Benchmarks 2024"
      },
      "confidenceImpact": 18,
      "qualityImpact": "HIGH"
    }
  ],
  "qualityMetrics": {
    "originalScore": 52,
    "revisedScore": 84,
    "change": 32,
    "readyForBA": true
  },
  "baNotice": {
    "remainingWeaknesses": [
      "Churn rate non disponible dans le deck - benchmark sectoriel utilise (30% annuel)"
    ],
    "dataNeedsFromFounder": [
      "Confirmer le churn rate reel sur les 12 derniers mois",
      "Expliquer les drivers de croissance justifiant le CAGR de 188%"
    ],
    "confidenceLevel": "MEDIUM"
  }
}
```

---

## Fichiers connexes

- [00-ENGINE-OVERVIEW.md](./00-ENGINE-OVERVIEW.md) - Vision et declenchement
- [04-REFLEXION-PROMPTS.md](./04-REFLEXION-PROMPTS.md) - Prompts critic et improver
- [05-SHARED-UTILS.md](./05-SHARED-UTILS.md) - Schemas Zod pour validation
