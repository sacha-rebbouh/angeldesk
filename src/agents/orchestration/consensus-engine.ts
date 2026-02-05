/**
 * Consensus Engine
 * Detects contradictions and manages agent debates for resolution.
 *
 * Refactored with:
 * - Zod-validated LLM responses
 * - New prompt system (FR, source-first, pre-computed calculations)
 * - MINOR auto-resolve (no LLM)
 * - Skip-to-arbitration for asymmetric confidence
 * - Quick resolution fallback
 * - Token tracking
 */

import { complete } from "@/services/openrouter/router";
import type { ScoredFinding, ConfidenceScore } from "@/scoring/types";
import { confidenceCalculator } from "@/scoring";
import { messageBus } from "./message-bus";
import { createContradictionMessage } from "./message-types";
import { completeAndValidate } from "./utils/llm-validation";
import {
  DebaterResponseSchema,
  ArbitratorResponseSchema,
  QuickResolutionSchema,
} from "./schemas/consensus-schemas";
import type {
  DebaterResponse,
  ArbitratorResponse,
  QuickResolution,
} from "./schemas/consensus-schemas";

// ============================================================================
// TYPES (existing - kept for backward compatibility)
// ============================================================================

export interface DetectedContradiction {
  id: string;
  topic: string;
  findings: ScoredFinding[];
  claims: ContradictionClaim[];
  severity: "minor" | "moderate" | "major" | "critical";
  impactAreas: string[];
  detectedAt: Date;
  status: "detected" | "debating" | "resolved" | "accepted";
}

export interface ContradictionClaim {
  agentName: string;
  findingId: string;
  claim: string;
  value: unknown;
  confidence: number;
  sources?: {
    type:
      | "deck"
      | "financial_model"
      | "context_engine"
      | "funding_db"
      | "inference";
    reference: string;
    quote?: string;
  }[];
}

export interface DebateRound {
  roundNumber: number;
  positions: DebatePosition[];
  timestamp: Date;
  tokensUsed?: number;
}

export interface DebatePosition {
  agentName: string;
  position: string;
  claim?: string;
  value?: unknown;
  supportingEvidence: string[];
  counterArguments?: string[];
  confidenceChange: number;
  finalPosition?: boolean;
  // Enhanced fields from new prompts
  evidence?: {
    source: string;
    quote: string;
    interpretation: string;
  }[];
  calculation?: {
    formula: string;
    steps: string[];
    result: string;
  };
  weaknesses?: string[];
  confidenceLevel?: number;
  confidenceJustification?: string;
}

export interface ContradictionResolution {
  contradictionId: string;
  resolvedBy: "consensus" | "arbitration" | "accepted" | "auto_minor" | "quick";
  winner?: string;
  resolution: string;
  finalValue?: unknown;
  confidence: ConfidenceScore;
  debateRounds: DebateRound[];
  resolvedAt: Date;
  tokensUsed?: number;
  optimizationApplied?: string;
}

export interface DebateResult {
  contradiction: DetectedContradiction;
  rounds: DebateRound[];
  resolution: ContradictionResolution;
}

// ============================================================================
// VERIFICATION CONTEXT
// ============================================================================

export interface VerificationContext {
  deckExtracts?: string;
  financialModelExtracts?: string;
  contextEngineData?: unknown;
  fundingDbData?: unknown;
  preComputedCalculations?: Record<string, unknown>;
}

// ============================================================================
// PROMPTS (FR - from spec)
// ============================================================================

function buildDebaterSystemPrompt(): string {
  return `# ROLE

Analyste senior en comite d'investissement. Tu defends ta position avec des PREUVES VERIFIABLES, pas de la rhetorique.

# HIERARCHIE DES SOURCES (par ordre de fiabilite)

1. **Deck** (slides numerotees, citations exactes) — source primaire
2. **Financial Model** (onglet, ligne, valeur) — source primaire
3. **Context Engine** (Crunchbase, Dealroom, LinkedIn) — verification externe
4. **Funding Database** (comparables, benchmarks) — contextualisation
5. **Inference** — dernier recours, TOUJOURS signale comme tel

# CALCULS PRE-COMPUTES

Des calculs financiers (ARR, Gross Margin, CAGR, LTV/CAC, etc.) sont pre-computes en TypeScript et injectes dans les donnees de verification. Tu dois les UTILISER tels quels, pas les recalculer. Si un calcul pre-compute est present, cite-le directement.

# METHODOLOGIE

1. **Preuves** : Cite les sources EXACTES (slide X, onglet Y ligne Z). Pas de paraphrase.
2. **Argumentation** : 1 affirmation = 1 source. 1 calcul = formule + inputs sources.
3. **Honnetete** : Si apres verification ta position est FAUSSE, dis-le immediatement au lieu de la defendre. Changer d'avis sur preuve = force, pas faiblesse.
4. **Faiblesses** : Liste ce que tu ne peux pas prouver. Ta confiance DOIT BAISSER si tu ne trouves pas de source primaire.

# FORMAT DE REPONSE (JSON STRICT)

{
  "position": {
    "claim": "Enonce clair et factuel",
    "value": "Valeur numerique si applicable",
    "unit": "Unite de mesure"
  },
  "evidence": [
    {
      "source": "Deck Slide X / Financial Model Onglet Y Ligne Z / Context Engine / Funding DB",
      "quote": "Citation EXACTE ou donnee precise",
      "interpretation": "Comment ca supporte ta position"
    }
  ],
  "calculation": {
    "formula": "Si applicable. Utiliser le calcul pre-compute si disponible.",
    "steps": ["Etape 1 avec source", "Etape 2"],
    "result": "Resultat"
  },
  "weaknesses": [
    "Ce que tu admets ne pas pouvoir prouver"
  ],
  "confidenceLevel": 85,
  "confidenceJustification": "Justification basee sur la qualite des sources (primaire/secondaire/inference)"
}

# REGLES ABSOLUES

1. JAMAIS d'affirmation sans source precise (slide, ligne, document)
2. JAMAIS de "je pense que", "il semble que", "probablement"
3. Si ta position est fausse apres verification, DIS-LE immediatement
4. Confiance > 80% UNIQUEMENT si source primaire (deck ou FM)
5. Confiance < 60% si base uniquement sur de l'inference
6. Ne pas "gagner" par la rhetorique — gagner par les PREUVES`;
}

function buildDebaterRound1Prompt(
  contradiction: DetectedContradiction,
  agentClaim: ContradictionClaim,
  opposingClaim: ContradictionClaim,
  verificationContext?: VerificationContext
): string {
  return `# CONTRADICTION

- Topic: ${contradiction.topic}
- Severite: ${contradiction.severity}

## TA POSITION (a defendre — ou a abandonner si les preuves disent le contraire)
- Agent: ${agentClaim.agentName}
- Claim: ${agentClaim.claim}
- Valeur: ${agentClaim.value}
- Confiance initiale: ${agentClaim.confidence}%
- Sources citees: ${JSON.stringify(agentClaim.sources ?? [], null, 2)}

## POSITION ADVERSE
- Agent: ${opposingClaim.agentName}
- Claim: ${opposingClaim.claim}
- Valeur: ${opposingClaim.value}
- Confiance: ${opposingClaim.confidence}%

## DONNEES DE VERIFICATION

### Deck (extraits pertinents)
${verificationContext?.deckExtracts || "Non disponible"}

### Financial Model (extraits pertinents)
${verificationContext?.financialModelExtracts || "Non disponible"}

### Context Engine
${verificationContext?.contextEngineData ? JSON.stringify(verificationContext.contextEngineData, null, 2) : "Aucune donnee disponible"}

### Funding Database
${verificationContext?.fundingDbData ? JSON.stringify(verificationContext.fundingDbData, null, 2) : "Aucune donnee disponible"}

### Calculs pre-computes
${verificationContext?.preComputedCalculations ? JSON.stringify(verificationContext.preComputedCalculations, null, 2) : "Aucun calcul pre-compute disponible"}

# MISSION

1. Verifie ta position contre les donnees ci-dessus
2. Si les donnees confirment ta position, defends-la avec preuves exactes
3. Si les donnees infirment ta position, DIS-LE et explique pourquoi tu avais tort
4. Si un calcul pre-compute est disponible, UTILISE-LE (ne recalcule pas)

Reponds au format JSON specifie dans le system prompt.`;
}

function buildArbitratorSystemPrompt(): string {
  return `# ROLE

President du Comite d'Investissement. Tu tranches une contradiction entre deux analyses. Un Business Angel va investir 50-200K\u20AC sur la base de cette decision.

# HIERARCHIE DES SOURCES

1. **Deck** > 2. **Financial Model** > 3. **Context Engine** > 4. **Funding DB** > 5. **Inference**

# CALCULS PRE-COMPUTES

Les calculs financiers sont faits en TypeScript (ARR, margins, ratios, etc.) et injectes dans les donnees. UTILISE-LES directement. Ne recalcule JAMAIS un chiffre deja pre-compute.

# METHODOLOGIE

## 1. Verification des sources
Pour chaque position, verifie:
- La source citee EXISTE-T-ELLE dans les donnees fournies ? (Si non = source "fantome")
- La citation est-elle EXACTE ou deformee ?
- Les calculs pre-computes confirment-ils la position ?

## 2. Detection des sources "fantomes"
Une source fantome = une source citee par un agent mais ABSENTE des donnees fournies.

**REGLE: Si les DEUX positions citent des sources fantomes, verdict OBLIGATOIREMENT UNRESOLVED.**

## 3. Decision
- **POSITION_A** : preuves primaires verifiees + calculs corrects
- **POSITION_B** : idem
- **SYNTHESIS** : les deux ont partiellement raison (rare)
- **UNRESOLVED** : impossible de trancher

## 4. Documentation BA
- Resume en 1 phrase actionnable
- trustLevel = HIGH si sources primaires, MEDIUM si secondaires, LOW si inference ou fantomes
- Si MEDIUM/LOW : dire quoi verifier + question pour le fondateur

# FORMAT DE DECISION (JSON STRICT)

{
  "verdict": {
    "decision": "POSITION_A" | "POSITION_B" | "SYNTHESIS" | "UNRESOLVED",
    "winner": "nom exact de l'agent gagnant (ex: 'financial-auditor'), null si UNRESOLVED ou SYNTHESIS",
    "justification": {
      "decisiveFactors": [{ "factor": "...", "source": "Reference exacte", "weight": "PRIMARY" | "SUPPORTING" }],
      "rejectedPositionFlaws": [{ "position": "Agent X", "flaw": "...", "evidence": "..." }]
    }
  },
  "finalValue": {
    "value": 505000,
    "unit": "EUR",
    "confidence": 92,
    "range": { "min": 504000, "max": 507000 },
    "derivedFrom": { "source": "Reference exacte", "calculation": "Formule avec inputs" }
  },
  "baGuidance": {
    "oneLiner": "Resume actionnable < 200 chars",
    "canTrust": true,
    "trustLevel": "HIGH" | "MEDIUM" | "LOW",
    "whatToVerify": "Si MEDIUM/LOW",
    "questionForFounder": "Si MEDIUM/LOW",
    "verifiableSources": [{ "source": "...", "reference": "...", "whatItProves": "..." }]
  },
  "unresolvedAspects": []
}

# REGLES ABSOLUES

1. JAMAIS trancher sans au moins UNE preuve primaire verifiee d'un cote
2. Si une position cite une source qui n'existe pas dans les donnees, source fantome = RED FLAG
3. Si les DEUX positions citent des sources fantomes, verdict UNRESOLVED obligatoire
4. Utiliser les calculs pre-computes, ne JAMAIS recalculer
5. Le BA doit pouvoir VERIFIER la decision avec les sources citees`;
}

function buildArbitratorPrompt(
  contradiction: DetectedContradiction,
  debateRounds: DebateRound[],
  verificationContext?: VerificationContext
): string {
  return `# CONTRADICTION A ARBITRER

- ID: ${contradiction.id}
- Topic: ${contradiction.topic}
- Severite: ${contradiction.severity}

## POSITION A — ${contradiction.claims[0].agentName}
- Claim: ${contradiction.claims[0].claim}
- Valeur: ${contradiction.claims[0].value}
- Confiance: ${contradiction.claims[0].confidence}%

## POSITION B — ${contradiction.claims[1].agentName}
- Claim: ${contradiction.claims[1].claim}
- Valeur: ${contradiction.claims[1].value}
- Confiance: ${contradiction.claims[1].confidence}%

## HISTORIQUE DU DEBAT

${debateRounds
  .map(
    (round) => `
### Round ${round.roundNumber}
${round.positions
  .map(
    (pos) => `
**${pos.agentName}:**
- Position: ${pos.claim || pos.position}
- Preuves: ${JSON.stringify(pos.evidence ?? pos.supportingEvidence, null, 2)}
- Calcul: ${pos.calculation ? JSON.stringify(pos.calculation) : "Aucun"}
- Faiblesses admises: ${(pos.weaknesses ?? []).join(", ") || "Aucune"}
- Confiance: ${pos.confidenceLevel ?? "N/A"}%
`
  )
  .join("\n")}
`
  )
  .join("\n---\n")}

## DONNEES DE VERIFICATION

### Extraits du Deck
${verificationContext?.deckExtracts || "Non disponible"}

### Extraits du Financial Model
${verificationContext?.financialModelExtracts || "Non disponible"}

### Context Engine
${verificationContext?.contextEngineData ? JSON.stringify(verificationContext.contextEngineData, null, 2) : "Aucune donnee"}

### Funding Database
${verificationContext?.fundingDbData ? JSON.stringify(verificationContext.fundingDbData, null, 2) : "Aucune donnee"}

### Calculs pre-computes
${verificationContext?.preComputedCalculations ? JSON.stringify(verificationContext.preComputedCalculations, null, 2) : "Aucun"}

# MISSION

1. Pour chaque source citee par les debaters, VERIFIE qu'elle existe dans les donnees ci-dessus (sinon = source fantome)
2. Si des calculs pre-computes sont fournis, UTILISE-LES comme reference
3. TRANCHE sur la base des preuves verifiees
4. Si les deux positions citent des sources fantomes, UNRESOLVED obligatoire

Reponds au format JSON specifie dans le system prompt.`;
}

function buildQuickResolutionPrompt(
  contradiction: DetectedContradiction,
  verificationContext?: VerificationContext
): string {
  return `# RESOLUTION RAPIDE — Sans debat

## Contradiction
- Topic: ${contradiction.topic}
- Severite: ${contradiction.severity}
- Position A: ${contradiction.claims[0].claim} (${contradiction.claims[0].confidence}%, sources: ${(contradiction.claims[0].sources ?? []).map((s) => s.type).join(", ") || "N/A"})
- Position B: ${contradiction.claims[1].claim} (${contradiction.claims[1].confidence}%, sources: ${(contradiction.claims[1].sources ?? []).map((s) => s.type).join(", ") || "N/A"})

## Donnees de verification
### Deck
${verificationContext?.deckExtracts || "Non disponible"}

### Financial Model
${verificationContext?.financialModelExtracts || "Non disponible"}

### Calculs pre-computes
${verificationContext?.preComputedCalculations ? JSON.stringify(verificationContext.preComputedCalculations, null, 2) : "Aucun"}

## Mission
Tranche rapidement en cross-referencant avec les donnees disponibles. Meme en resolution rapide, cite AU MOINS une source concrete.

Reponds en JSON:
{
  "winner": "POSITION_A" | "POSITION_B" | "UNRESOLVED",
  "reason": "Explication courte avec source precise",
  "finalValue": { "value": X, "source": "Reference exacte" },
  "trustLevel": "HIGH" | "MEDIUM" | "LOW",
  "baOneLiner": "Resume actionnable pour le BA (max 150 chars)"
}`;
}

// ============================================================================
// METRIC NORMALIZATION
// ============================================================================

/**
 * Normalize metric names from different agents to canonical keys.
 * This allows grouping of findings that measure the same concept
 * but use different naming conventions (e.g., "financialAuditor_revenue" vs "deckForensics_claimedRevenue").
 */
const METRIC_NORMALIZATIONS: Record<string, string> = {
  // Revenue variants
  revenue: "revenue",
  claimedRevenue: "revenue",
  annualRevenue: "revenue",
  arr: "revenue",
  mrr: "monthly_revenue",
  monthlyRevenue: "monthly_revenue",
  // Team
  teamSize: "team_size",
  employeeCount: "team_size",
  headcount: "team_size",
  foundersCount: "founders",
  // Valuation
  valuation: "valuation",
  preMoneyValuation: "valuation",
  postMoneyValuation: "valuation",
  // Market
  tam: "tam",
  totalAddressableMarket: "tam",
  marketSize: "tam",
  sam: "sam",
  som: "som",
  // Growth
  growthRate: "growth_rate",
  revenueGrowth: "growth_rate",
  yoyGrowth: "growth_rate",
  // Burn
  burnRate: "burn_rate",
  monthlyBurn: "burn_rate",
  cashBurn: "burn_rate",
  // Runway
  runway: "runway",
  cashRunway: "runway",
  monthsOfRunway: "runway",
  // Customers
  customerCount: "customers",
  customers: "customers",
  activeUsers: "customers",
  clients: "customers",
};

// ============================================================================
// CONSENSUS ENGINE
// ============================================================================

export class ConsensusEngine {
  private contradictions: Map<string, DetectedContradiction> = new Map();
  private resolutions: Map<string, ContradictionResolution> = new Map();
  private maxDebateRounds = 3;

  // Cache for similar debate resolutions (max 100 entries to prevent memory leaks)
  private static readonly MAX_CACHE_SIZE = 100;
  private resolutionCache: Map<string, ContradictionResolution> = new Map();

  private setCacheEntry(key: string, value: ContradictionResolution): void {
    if (this.resolutionCache.size >= ConsensusEngine.MAX_CACHE_SIZE) {
      // Evict oldest entry (first key in Map iteration order)
      const firstKey = this.resolutionCache.keys().next().value;
      if (firstKey) this.resolutionCache.delete(firstKey);
    }
    this.resolutionCache.set(key, value);
  }

  /**
   * Detect contradictions in findings
   */
  async detectContradictions(
    findings: ScoredFinding[]
  ): Promise<DetectedContradiction[]> {
    const contradictions: DetectedContradiction[] = [];

    // Group findings by topic/metric
    const byTopic = this.groupFindingsByTopic(findings);

    for (const [topic, topicFindings] of byTopic.entries()) {
      const conflicts = await this.findConflicts(topic, topicFindings);
      contradictions.push(...conflicts);
    }

    // Store and publish
    for (const contradiction of contradictions) {
      this.contradictions.set(contradiction.id, contradiction);

      await messageBus.publish(
        createContradictionMessage(
          "consensus-engine",
          contradiction.findings.map((f) => f.id),
          `Contradiction detected in ${contradiction.topic}: ${contradiction.claims.map((c) => c.claim).join(" vs ")}`,
          contradiction.severity
        )
      );
    }

    return contradictions;
  }

  /**
   * Generate cache key for a contradiction
   */
  private generateCacheKey(contradiction: DetectedContradiction): string {
    const claimsSorted = contradiction.claims
      .map((c) => `${c.agentName}:${c.claim}`)
      .sort()
      .join("|");
    return `${contradiction.topic}::${claimsSorted}`;
  }

  /**
   * Run a structured debate to resolve a contradiction
   * Includes optimizations: MINOR auto-resolve, skip-to-arbitration, quick resolution
   */
  async debate(
    contradictionId: string,
    verificationContext?: VerificationContext
  ): Promise<DebateResult> {
    const contradiction = this.contradictions.get(contradictionId);
    if (!contradiction) {
      throw new Error(`Contradiction ${contradictionId} not found`);
    }

    // Check cache
    const cacheKey = this.generateCacheKey(contradiction);
    const cachedResolution = this.resolutionCache.get(cacheKey);
    if (cachedResolution) {
      const resolution: ContradictionResolution = {
        ...cachedResolution,
        contradictionId: contradiction.id,
        resolvedAt: new Date(),
      };
      contradiction.status = "resolved";
      this.resolutions.set(contradiction.id, resolution);
      return {
        contradiction,
        rounds: cachedResolution.debateRounds,
        resolution,
      };
    }

    // OPTIMIZATION 1: Auto-resolve MINOR without LLM
    if (contradiction.severity === "minor") {
      return this.autoResolveMinor(contradiction);
    }

    // OPTIMIZATION 2: Skip debate if confidence asymmetry
    if (this.shouldSkipDebate(contradiction)) {
      return this.skipToArbitration(contradiction, verificationContext);
    }

    // Full debate
    contradiction.status = "debating";
    const rounds: DebateRound[] = [];
    let totalTokens = 0;

    // Round 1: Initial positions with new prompts
    const round1 = await this.debateRound1Enhanced(
      contradiction,
      verificationContext
    );
    rounds.push(round1);
    totalTokens += round1.tokensUsed ?? 0;

    // Check for consensus
    if (this.hasConsensus(round1)) {
      return this.finalizeDebate(
        contradiction,
        rounds,
        "consensus",
        totalTokens,
        verificationContext
      );
    }

    // Round 2: Rebuttals
    const round2 = await this.debateRound2(contradiction, round1, verificationContext);
    rounds.push(round2);
    totalTokens += round2.tokensUsed ?? 0;

    if (this.hasConsensus(round2)) {
      return this.finalizeDebate(
        contradiction,
        rounds,
        "consensus",
        totalTokens,
        verificationContext
      );
    }

    // Round 3: Final positions
    const round3 = await this.debateRound3(contradiction, rounds, verificationContext);
    rounds.push(round3);
    totalTokens += round3.tokensUsed ?? 0;

    if (!this.hasConsensus(round3)) {
      return this.finalizeDebate(
        contradiction,
        rounds,
        "arbitration",
        totalTokens,
        verificationContext
      );
    }

    return this.finalizeDebate(
      contradiction,
      rounds,
      "consensus",
      totalTokens,
      verificationContext
    );
  }

  /**
   * Accept a contradiction without resolution
   */
  acceptContradiction(contradictionId: string, reason: string): void {
    const contradiction = this.contradictions.get(contradictionId);
    if (contradiction) {
      contradiction.status = "accepted";

      const resolution: ContradictionResolution = {
        contradictionId,
        resolvedBy: "accepted",
        resolution: reason,
        confidence: confidenceCalculator.calculate({ dataAvailability: 50 }),
        debateRounds: [],
        resolvedAt: new Date(),
      };

      this.resolutions.set(contradictionId, resolution);
    }
  }

  /**
   * Get all unresolved contradictions
   */
  getUnresolved(): DetectedContradiction[] {
    return Array.from(this.contradictions.values()).filter(
      (c) => c.status === "detected" || c.status === "debating"
    );
  }

  /**
   * Get resolution for a contradiction
   */
  getResolution(
    contradictionId: string
  ): ContradictionResolution | undefined {
    return this.resolutions.get(contradictionId);
  }

  // ============================================================================
  // OPTIMIZATIONS
  // ============================================================================

  /**
   * Check if debate should be skipped (confidence asymmetry)
   */
  private shouldSkipDebate(contradiction: DetectedContradiction): boolean {
    if (contradiction.claims.length < 2) return false;
    const [claimA, claimB] = contradiction.claims;
    const confidenceDiff = Math.abs(claimA.confidence - claimB.confidence);
    const maxConfidence = Math.max(claimA.confidence, claimB.confidence);

    // Skip if diff > 35 points AND the most confident > 80%
    return confidenceDiff > 35 && maxConfidence > 80;
  }

  /**
   * Auto-resolve MINOR contradictions without LLM
   */
  private autoResolveMinor(
    contradiction: DetectedContradiction
  ): DebateResult {
    const winner = contradiction.claims.reduce((a, b) =>
      a.confidence > b.confidence ? a : b
    );

    const resolution: ContradictionResolution = {
      contradictionId: contradiction.id,
      resolvedBy: "auto_minor",
      winner: winner.agentName,
      resolution: `Resolution automatique MINOR: ${winner.agentName} (confiance ${winner.confidence}%)`,
      finalValue: winner.value,
      confidence: confidenceCalculator.calculate({
        dataAvailability: winner.confidence,
      }),
      debateRounds: [],
      resolvedAt: new Date(),
      tokensUsed: 0,
      optimizationApplied: "MINOR_AUTO_RESOLVE",
    };

    contradiction.status = "resolved";
    this.resolutions.set(contradiction.id, resolution);
    this.setCacheEntry(
      this.generateCacheKey(contradiction),
      resolution
    );

    return { contradiction, rounds: [], resolution };
  }

  /**
   * Skip debate and go directly to arbitration (quick resolution)
   */
  private async skipToArbitration(
    contradiction: DetectedContradiction,
    verificationContext?: VerificationContext
  ): Promise<DebateResult> {
    contradiction.status = "debating";

    const systemPrompt = buildArbitratorSystemPrompt();
    const quickPrompt = buildQuickResolutionPrompt(
      contradiction,
      verificationContext
    );

    const validationResult = await completeAndValidate(
      systemPrompt,
      quickPrompt,
      QuickResolutionSchema,
      { complexity: "medium", temperature: 0.1 }
    );

    let resolution: ContradictionResolution;

    if (validationResult.success && validationResult.data) {
      const qr = validationResult.data;
      const winnerIdx =
        qr.winner === "POSITION_A"
          ? 0
          : qr.winner === "POSITION_B"
            ? 1
            : -1;
      const winnerClaim =
        winnerIdx >= 0 ? contradiction.claims[winnerIdx] : undefined;

      resolution = {
        contradictionId: contradiction.id,
        resolvedBy: "quick",
        winner: winnerClaim?.agentName,
        resolution: qr.reason,
        finalValue: qr.finalValue.value,
        confidence: confidenceCalculator.calculate({
          dataAvailability:
            qr.trustLevel === "HIGH"
              ? 90
              : qr.trustLevel === "MEDIUM"
                ? 70
                : 50,
        }),
        debateRounds: [],
        resolvedAt: new Date(),
        tokensUsed: validationResult.tokensUsed,
        optimizationApplied: "SKIP_TO_ARBITRATION",
      };
    } else {
      // Fallback: pick highest confidence
      const winner = contradiction.claims.reduce((a, b) =>
        a.confidence > b.confidence ? a : b
      );
      resolution = {
        contradictionId: contradiction.id,
        resolvedBy: "quick",
        winner: winner.agentName,
        resolution: `Quick resolution fallback: ${winner.agentName} (highest confidence ${winner.confidence}%)`,
        finalValue: winner.value,
        confidence: confidenceCalculator.calculate({
          dataAvailability: 50,
        }),
        debateRounds: [],
        resolvedAt: new Date(),
        tokensUsed: validationResult.tokensUsed,
        optimizationApplied: "SKIP_TO_ARBITRATION_FALLBACK",
      };
    }

    contradiction.status = "resolved";
    this.resolutions.set(contradiction.id, resolution);
    this.setCacheEntry(
      this.generateCacheKey(contradiction),
      resolution
    );

    return { contradiction, rounds: [], resolution };
  }

  // ============================================================================
  // PRIVATE METHODS - DETECTION
  // ============================================================================

  private groupFindingsByTopic(
    findings: ScoredFinding[]
  ): Map<string, ScoredFinding[]> {
    const groups = new Map<string, ScoredFinding[]>();

    for (const finding of findings) {
      // Normalize the metric name to group semantically equivalent metrics
      const rawMetric = finding.metric;

      // Remove agent name prefix (e.g., "financialAuditor_revenue" → "revenue")
      const stripped = rawMetric.includes("_")
        ? rawMetric.substring(rawMetric.indexOf("_") + 1)
        : rawMetric;

      // Look up normalized key; fall back to stripped or original if not found
      const normalizedKey =
        METRIC_NORMALIZATIONS[stripped] ??
        METRIC_NORMALIZATIONS[rawMetric] ??
        rawMetric;

      const existing = groups.get(normalizedKey) ?? [];
      existing.push(finding);
      groups.set(normalizedKey, existing);
    }

    return groups;
  }

  private async findConflicts(
    topic: string,
    findings: ScoredFinding[]
  ): Promise<DetectedContradiction[]> {
    const conflicts: DetectedContradiction[] = [];

    if (findings.length < 2) return conflicts;

    for (let i = 0; i < findings.length; i++) {
      for (let j = i + 1; j < findings.length; j++) {
        const f1 = findings[i];
        const f2 = findings[j];

        if (f1.agentName === f2.agentName) continue;

        const isConflict = await this.areConflicting(f1, f2);

        if (isConflict) {
          const severity = this.calculateConflictSeverity(f1, f2);

          conflicts.push({
            id: crypto.randomUUID(),
            topic,
            findings: [f1, f2],
            claims: [
              {
                agentName: f1.agentName,
                findingId: f1.id,
                claim: `${f1.metric}: ${f1.value} ${f1.unit} (${f1.assessment})`,
                value: f1.value,
                confidence: f1.confidence.score,
              },
              {
                agentName: f2.agentName,
                findingId: f2.id,
                claim: `${f2.metric}: ${f2.value} ${f2.unit} (${f2.assessment})`,
                value: f2.value,
                confidence: f2.confidence.score,
              },
            ],
            severity,
            impactAreas: [f1.category, f2.category],
            detectedAt: new Date(),
            status: "detected",
          });
        }
      }
    }

    return conflicts;
  }

  private async areConflicting(
    f1: ScoredFinding,
    f2: ScoredFinding
  ): Promise<boolean> {
    // Numeric comparison
    if (typeof f1.value === "number" && typeof f2.value === "number") {
      const v1 = f1.value;
      const v2 = f2.value;

      const avg = (Math.abs(v1) + Math.abs(v2)) / 2;
      if (avg === 0) return v1 !== v2;

      const diff = Math.abs(v1 - v2) / avg;
      return diff > 0.3;
    }

    // Assessment comparison
    if (f1.assessment && f2.assessment) {
      const opposites: Record<string, string[]> = {
        exceptional: ["below_average", "poor", "suspicious"],
        above_average: ["below_average", "poor"],
        average: ["exceptional", "suspicious"],
        below_average: ["exceptional", "above_average"],
        poor: ["exceptional", "above_average"],
        suspicious: ["exceptional"],
      };

      return opposites[f1.assessment]?.includes(f2.assessment) ?? false;
    }

    return false;
  }

  private calculateConflictSeverity(
    f1: ScoredFinding,
    f2: ScoredFinding
  ): DetectedContradiction["severity"] {
    const avgConfidence = (f1.confidence.score + f2.confidence.score) / 2;

    let valueDiff = 0;
    if (typeof f1.value === "number" && typeof f2.value === "number") {
      const avg = (Math.abs(f1.value) + Math.abs(f2.value)) / 2;
      valueDiff = avg > 0 ? Math.abs(f1.value - f2.value) / avg : 0;
    }

    if (avgConfidence > 75 && valueDiff > 0.5) return "critical";
    if (avgConfidence > 60 && valueDiff > 0.4) return "major";
    if (avgConfidence > 40 || valueDiff > 0.3) return "moderate";
    return "minor";
  }

  // ============================================================================
  // PRIVATE METHODS - DEBATE (ENHANCED)
  // ============================================================================

  /**
   * Round 1 with new Zod-validated prompts
   */
  private async debateRound1Enhanced(
    contradiction: DetectedContradiction,
    verificationContext?: VerificationContext
  ): Promise<DebateRound> {
    const positions: DebatePosition[] = [];
    let roundTokens = 0;
    const systemPrompt = buildDebaterSystemPrompt();

    for (let idx = 0; idx < contradiction.claims.length; idx++) {
      const claim = contradiction.claims[idx];
      const opposing = contradiction.claims.find(
        (c) => c.agentName !== claim.agentName
      );
      if (!opposing) continue;

      const userPrompt = buildDebaterRound1Prompt(
        contradiction,
        claim,
        opposing,
        verificationContext
      );

      const validationResult = await completeAndValidate(
        systemPrompt,
        userPrompt,
        DebaterResponseSchema,
        { complexity: "medium", temperature: 0.1 }
      );

      roundTokens += validationResult.tokensUsed;

      if (validationResult.success && validationResult.data) {
        const dr = validationResult.data;
        positions.push({
          agentName: claim.agentName,
          position: dr.position.claim,
          claim: dr.position.claim,
          value: dr.position.value,
          supportingEvidence: dr.evidence.map(
            (e) => `${e.source}: ${e.quote}`
          ),
          confidenceChange: dr.confidenceLevel - claim.confidence,
          evidence: dr.evidence,
          calculation: dr.calculation ?? undefined,
          weaknesses: dr.weaknesses,
          confidenceLevel: dr.confidenceLevel,
          confidenceJustification: dr.confidenceJustification,
        });
      } else {
        // Fallback: use raw LLM call
        positions.push(
          await this.debateRound1Fallback(claim, contradiction)
        );
      }
    }

    return {
      roundNumber: 1,
      positions,
      timestamp: new Date(),
      tokensUsed: roundTokens,
    };
  }

  /**
   * Fallback for Round 1 if Zod validation fails
   */
  private async debateRound1Fallback(
    claim: ContradictionClaim,
    contradiction: DetectedContradiction
  ): Promise<DebatePosition> {
    const prompt = `You are representing the position of the ${claim.agentName} agent in a structured debate.

Topic: ${contradiction.topic}
Your claim: ${claim.claim}
Your confidence: ${claim.confidence}%

The opposing view claims: ${contradiction.claims.find((c) => c.agentName !== claim.agentName)?.claim}

Provide your initial position defending your claim. Include:
1. Your main argument
2. Supporting evidence
3. Why your analysis is more reliable

Respond in JSON:
{
  "position": "your argument",
  "supportingEvidence": ["evidence 1", "evidence 2"],
  "confidenceChange": 0
}`;

    const result = await complete(prompt, {
      complexity: "medium",
      temperature: 0.1,
    });

    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          agentName: claim.agentName,
          position: parsed.position,
          supportingEvidence: parsed.supportingEvidence ?? [],
          confidenceChange: 0,
        };
      } catch {
        // JSON parse failed, fall through to default
      }
    }

    return {
      agentName: claim.agentName,
      position: claim.claim,
      supportingEvidence: [],
      confidenceChange: 0,
    };
  }

  /**
   * Debate Round 2: Rebuttals (Enhanced with Zod validation + FR prompts)
   */
  private async debateRound2(
    contradiction: DetectedContradiction,
    round1: DebateRound,
    verificationContext?: VerificationContext
  ): Promise<DebateRound> {
    const positions: DebatePosition[] = [];
    let roundTokens = 0;
    const systemPrompt = buildDebaterSystemPrompt();

    for (const claim of contradiction.claims) {
      const myPosition = round1.positions.find(
        (p) => p.agentName === claim.agentName
      );
      const opposingPositions = round1.positions.filter(
        (p) => p.agentName !== claim.agentName
      );

      const userPrompt = `# CONTRADICTION

- Topic: ${contradiction.topic}
- Severite: ${contradiction.severity}

## TA POSITION (Round 1)
- Agent: ${claim.agentName}
- Claim: ${claim.claim}
- Position Round 1: ${myPosition?.position}
- Preuves Round 1: ${JSON.stringify(myPosition?.evidence ?? myPosition?.supportingEvidence ?? [], null, 2)}

## POSITION ADVERSE (Round 1)
${opposingPositions.map((p) => `- ${p.agentName}: ${p.position}
  Preuves: ${JSON.stringify(p.evidence ?? p.supportingEvidence, null, 2)}
  Faiblesses admises: ${(p.weaknesses ?? []).join(", ") || "Aucune"}`).join("\n")}

## DONNEES DE VERIFICATION

### Deck
${verificationContext?.deckExtracts || "Non disponible"}

### Financial Model
${verificationContext?.financialModelExtracts || "Non disponible"}

### Context Engine
${verificationContext?.contextEngineData ? JSON.stringify(verificationContext.contextEngineData, null, 2) : "Aucune donnee"}

### Funding Database
${verificationContext?.fundingDbData ? JSON.stringify(verificationContext.fundingDbData, null, 2) : "Aucune donnee"}

### Calculs pre-computes
${verificationContext?.preComputedCalculations ? JSON.stringify(verificationContext.preComputedCalculations, null, 2) : "Aucun"}

# MISSION

Fournis ta refutation:
1. Contre-argumente les positions adverses avec des PREUVES EXACTES
2. Si la position adverse est valide, admets-le
3. Si un calcul pre-compute est disponible, UTILISE-LE

Reponds au format JSON specifie dans le system prompt.`;

      const validationResult = await completeAndValidate(
        systemPrompt,
        userPrompt,
        DebaterResponseSchema,
        { complexity: "medium", temperature: 0.1 }
      );

      roundTokens += validationResult.tokensUsed;

      if (validationResult.success && validationResult.data) {
        const dr = validationResult.data;
        positions.push({
          agentName: claim.agentName,
          position: dr.position.claim,
          claim: dr.position.claim,
          value: dr.position.value,
          supportingEvidence: dr.evidence.map(
            (e) => `${e.source}: ${e.quote}`
          ),
          counterArguments: [],
          confidenceChange: dr.confidenceLevel - claim.confidence,
          evidence: dr.evidence,
          calculation: dr.calculation ?? undefined,
          weaknesses: dr.weaknesses,
          confidenceLevel: dr.confidenceLevel,
          confidenceJustification: dr.confidenceJustification,
        });
      } else {
        // Fallback: legacy method with try/catch on JSON.parse
        try {
          const result = await complete(
            `You are continuing the debate as the ${claim.agentName} agent.

Topic: ${contradiction.topic}
Your claim: ${claim.claim}
Your round 1 position: ${myPosition?.position}

Opposing arguments:
${opposingPositions.map((p) => `- ${p.agentName}: ${p.position}`).join("\n")}

Provide your rebuttal in JSON:
{
  "position": "your rebuttal",
  "supportingEvidence": ["new evidence"],
  "counterArguments": ["counter to opponent"],
  "confidenceChange": -10 to +10
}`,
            { complexity: "medium", temperature: 0.1 }
          );

          const jsonMatch = result.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            positions.push({
              agentName: claim.agentName,
              position: parsed.position,
              supportingEvidence: parsed.supportingEvidence ?? [],
              counterArguments: parsed.counterArguments ?? [],
              confidenceChange: parsed.confidenceChange ?? 0,
            });
          } else {
            // Fallback position: keep round 1 position
            positions.push({
              agentName: claim.agentName,
              position: myPosition?.position ?? claim.claim,
              supportingEvidence: myPosition?.supportingEvidence ?? [],
              confidenceChange: 0,
            });
          }
        } catch {
          // JSON.parse failed or LLM call failed: keep round 1 position
          positions.push({
            agentName: claim.agentName,
            position: myPosition?.position ?? claim.claim,
            supportingEvidence: myPosition?.supportingEvidence ?? [],
            confidenceChange: 0,
          });
        }
      }
    }

    return {
      roundNumber: 2,
      positions,
      timestamp: new Date(),
      tokensUsed: roundTokens,
    };
  }

  /**
   * Debate Round 3: Final positions (Enhanced with Zod validation + FR prompts)
   */
  private async debateRound3(
    contradiction: DetectedContradiction,
    previousRounds: DebateRound[],
    verificationContext?: VerificationContext
  ): Promise<DebateRound> {
    const positions: DebatePosition[] = [];
    let roundTokens = 0;
    const systemPrompt = buildDebaterSystemPrompt();

    for (const claim of contradiction.claims) {
      const round1Pos = previousRounds[0].positions.find(
        (p) => p.agentName === claim.agentName
      );
      const round2Pos = previousRounds[1]?.positions.find(
        (p) => p.agentName === claim.agentName
      );

      const opposingRound1 = previousRounds[0].positions.find(
        (p) => p.agentName !== claim.agentName
      );
      const opposingRound2 = previousRounds[1]?.positions.find(
        (p) => p.agentName !== claim.agentName
      );

      const userPrompt = `# CONTRADICTION

- Topic: ${contradiction.topic}
- Severite: ${contradiction.severity}

## HISTORIQUE COMPLET

### Round 1
- **Ta position**: ${round1Pos?.position}
  Preuves: ${JSON.stringify(round1Pos?.evidence ?? round1Pos?.supportingEvidence ?? [], null, 2)}
  Faiblesses: ${(round1Pos?.weaknesses ?? []).join(", ") || "Aucune"}

- **Position adverse** (${opposingRound1?.agentName}): ${opposingRound1?.position}
  Preuves: ${JSON.stringify(opposingRound1?.evidence ?? opposingRound1?.supportingEvidence ?? [], null, 2)}

### Round 2 (Refutation)
- **Ta refutation**: ${round2Pos?.position}
- **Refutation adverse** (${opposingRound2?.agentName}): ${opposingRound2?.position}

## DONNEES DE VERIFICATION

### Deck
${verificationContext?.deckExtracts || "Non disponible"}

### Financial Model
${verificationContext?.financialModelExtracts || "Non disponible"}

### Calculs pre-computes
${verificationContext?.preComputedCalculations ? JSON.stringify(verificationContext.preComputedCalculations, null, 2) : "Aucun"}

# MISSION

C'est le dernier round. Tu peux :
1. **Maintenir** ta position si tes preuves sont plus solides
2. **Conceder** si la position adverse est mieux sourcee
3. **Proposer une synthese** si les deux positions sont partiellement correctes

Reponds au format JSON specifie dans le system prompt.`;

      const validationResult = await completeAndValidate(
        systemPrompt,
        userPrompt,
        DebaterResponseSchema,
        { complexity: "medium", temperature: 0.1 }
      );

      roundTokens += validationResult.tokensUsed;

      if (validationResult.success && validationResult.data) {
        const dr = validationResult.data;
        // Detect concession: confidence dropped significantly or claim changed to match opponent
        const confidenceChange = dr.confidenceLevel - claim.confidence;
        const isConceding = confidenceChange < -15;

        positions.push({
          agentName: claim.agentName,
          position: dr.position.claim,
          claim: dr.position.claim,
          value: dr.position.value,
          supportingEvidence: dr.evidence.map(
            (e) => `${e.source}: ${e.quote}`
          ),
          confidenceChange,
          finalPosition: isConceding,
          evidence: dr.evidence,
          calculation: dr.calculation ?? undefined,
          weaknesses: dr.weaknesses,
          confidenceLevel: dr.confidenceLevel,
          confidenceJustification: dr.confidenceJustification,
        });
      } else {
        // Fallback: legacy method with try/catch on JSON.parse
        try {
          const result = await complete(
            `This is the final round of the debate as the ${claim.agentName} agent.

Topic: ${contradiction.topic}
Your original claim: ${claim.claim}

Debate history:
Round 1 - Your position: ${round1Pos?.position}
Round 2 - Your rebuttal: ${round2Pos?.position}

Consider all arguments. Do you:
1. Maintain your position
2. Concede to the opponent
3. Propose a synthesis

Respond in JSON:
{
  "position": "your final position",
  "supportingEvidence": ["final evidence"],
  "confidenceChange": -20 to +10,
  "finalPosition": "maintain|concede|synthesize"
}`,
            { complexity: "medium", temperature: 0.1 }
          );

          const jsonMatch = result.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            positions.push({
              agentName: claim.agentName,
              position: parsed.position,
              supportingEvidence: parsed.supportingEvidence ?? [],
              confidenceChange: parsed.confidenceChange ?? 0,
              finalPosition: parsed.finalPosition === "concede",
            });
          } else {
            // Fallback: keep round 2 position
            positions.push({
              agentName: claim.agentName,
              position: round2Pos?.position ?? claim.claim,
              supportingEvidence: round2Pos?.supportingEvidence ?? [],
              confidenceChange: 0,
              finalPosition: false,
            });
          }
        } catch {
          // JSON.parse failed or LLM call failed: keep round 2 position
          positions.push({
            agentName: claim.agentName,
            position: round2Pos?.position ?? claim.claim,
            supportingEvidence: round2Pos?.supportingEvidence ?? [],
            confidenceChange: 0,
            finalPosition: false,
          });
        }
      }
    }

    return {
      roundNumber: 3,
      positions,
      timestamp: new Date(),
      tokensUsed: roundTokens,
    };
  }

  /**
   * Check if debate has reached consensus
   */
  private hasConsensus(round: DebateRound): boolean {
    const conceding = round.positions.filter(
      (p) => p.finalPosition === true
    );
    return conceding.length > 0;
  }

  /**
   * Finalize debate with resolution
   */
  private async finalizeDebate(
    contradiction: DetectedContradiction,
    rounds: DebateRound[],
    resolutionType: "consensus" | "arbitration",
    totalTokens: number,
    verificationContext?: VerificationContext
  ): Promise<DebateResult> {
    let resolution: ContradictionResolution;

    if (resolutionType === "consensus") {
      const lastRound = rounds[rounds.length - 1];
      const winner = lastRound.positions.find(
        (p) => p.finalPosition !== true
      );
      const winnerClaim = contradiction.claims.find(
        (c) => c.agentName === winner?.agentName
      );

      resolution = {
        contradictionId: contradiction.id,
        resolvedBy: "consensus",
        winner: winner?.agentName,
        resolution: `${winner?.agentName}'s position accepted: ${winner?.position}`,
        finalValue: winnerClaim?.value,
        confidence: confidenceCalculator.calculate({
          dataAvailability: 80,
          evidenceQuality: 70,
        }),
        debateRounds: rounds,
        resolvedAt: new Date(),
        tokensUsed: totalTokens,
      };
    } else {
      resolution = await this.arbitrateEnhanced(
        contradiction,
        rounds,
        verificationContext
      );
      resolution.tokensUsed =
        totalTokens + (resolution.tokensUsed ?? 0);
    }

    contradiction.status = "resolved";
    this.resolutions.set(contradiction.id, resolution);

    const cacheKey = this.generateCacheKey(contradiction);
    this.setCacheEntry(cacheKey, resolution);

    return { contradiction, rounds, resolution };
  }

  /**
   * Enhanced arbitration with Zod-validated response
   */
  private async arbitrateEnhanced(
    contradiction: DetectedContradiction,
    rounds: DebateRound[],
    verificationContext?: VerificationContext
  ): Promise<ContradictionResolution> {
    const systemPrompt = buildArbitratorSystemPrompt();
    const userPrompt = buildArbitratorPrompt(
      contradiction,
      rounds,
      verificationContext
    );

    const validationResult = await completeAndValidate(
      systemPrompt,
      userPrompt,
      ArbitratorResponseSchema,
      { complexity: "complex", temperature: 0 }
    );

    if (validationResult.success && validationResult.data) {
      const ar = validationResult.data;
      return {
        contradictionId: contradiction.id,
        resolvedBy: "arbitration",
        winner: ar.verdict.winner ?? undefined,
        resolution: ar.baGuidance.oneLiner,
        finalValue: ar.finalValue.value,
        confidence: confidenceCalculator.calculate({
          dataAvailability: ar.finalValue.confidence,
        }),
        debateRounds: rounds,
        resolvedAt: new Date(),
        tokensUsed: validationResult.tokensUsed,
      };
    }

    // Fallback: raw LLM arbitration
    return this.arbitrateFallback(
      contradiction,
      rounds,
      validationResult.tokensUsed
    );
  }

  /**
   * Fallback arbitration if Zod validation fails
   */
  private async arbitrateFallback(
    contradiction: DetectedContradiction,
    rounds: DebateRound[],
    existingTokens: number
  ): Promise<ContradictionResolution> {
    const prompt = `As a neutral arbitrator, resolve this debate.

Topic: ${contradiction.topic}

Claims:
${contradiction.claims.map((c) => `- ${c.agentName}: ${c.claim} (confidence: ${c.confidence}%)`).join("\n")}

Debate summary:
${rounds.map((r) => `Round ${r.roundNumber}:\n${r.positions.map((p) => `  ${p.agentName}: ${p.position}`).join("\n")}`).join("\n\n")}

Based on the evidence and arguments, provide your arbitration:

Respond in JSON:
{
  "winner": "agent name or 'synthesis'",
  "resolution": "your ruling",
  "finalValue": "the value to use",
  "confidence": 0-100
}`;

    const result = await complete(prompt, {
      complexity: "complex",
      temperature: 0,
    });

    const arbTokens = existingTokens + (result.usage?.totalTokens ?? 0);

    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);

        return {
          contradictionId: contradiction.id,
          resolvedBy: "arbitration",
          winner: parsed.winner,
          resolution: parsed.resolution,
          finalValue: parsed.finalValue,
          confidence: confidenceCalculator.calculate({
            dataAvailability: parsed.confidence ?? 60,
          }),
          debateRounds: rounds,
          resolvedAt: new Date(),
          tokensUsed: arbTokens,
        };
      } catch {
        // JSON parse failed, fall through to fallback
      }
    }

    // Ultimate fallback
    return {
      contradictionId: contradiction.id,
      resolvedBy: "arbitration",
      resolution:
        "Unable to reach resolution, using highest confidence claim",
      finalValue: contradiction.claims.reduce((a, b) =>
        a.confidence > b.confidence ? a : b
      ).value,
      confidence: confidenceCalculator.calculate({ dataAvailability: 40 }),
      debateRounds: rounds,
      resolvedAt: new Date(),
      tokensUsed: arbTokens,
    };
  }
}

// Singleton instance
export const consensusEngine = new ConsensusEngine();
