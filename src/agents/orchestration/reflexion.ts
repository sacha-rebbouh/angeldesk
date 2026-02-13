/**
 * Reflexion Engine
 * Self-critique and iterative improvement of analysis.
 *
 * Refactored with:
 * - Zod-validated LLM responses (CriticResponse, ImproverResponse)
 * - New prompt system (FR, Big4 standards, source-first)
 * - Tier-based triggering (Tier 1: <70%, Tier 2: <60%, Tier 3: never)
 * - Quality score tracking (before/after)
 * - Token tracking
 * - VerificationContext support
 */

import { complete } from "@/services/openrouter/router";
import type { ScoredFinding, ConfidenceScore } from "@/scoring/types";
import { confidenceCalculator } from "@/scoring";
import type { AnalysisAgentResult } from "../types";
import { completeAndValidate } from "./utils/llm-validation";
import {
  CriticResponseSchema,
  ImproverResponseSchema,
} from "./schemas/reflexion-schemas";
import type {
  CriticResponse,
  ImproverResponse,
} from "./schemas/reflexion-schemas";
import type { VerificationContext } from "./consensus-engine";

// ============================================================================
// TYPES (existing - kept for backward compatibility)
// ============================================================================

export interface ReflexionInput {
  agentName: string;
  result: AnalysisAgentResult;
  findings: ScoredFinding[];
  context: string;
  tier?: 1 | 2 | 3;
  verificationContext?: VerificationContext;
}

export interface ReflexionOutput {
  originalResult: AnalysisAgentResult;
  critiques: Critique[];
  improvements: Improvement[];
  dataRequests: DataRequest[];
  revisedResult?: AnalysisAgentResult;
  confidenceChange: number;
  iterations: number;
  // Enhanced fields
  qualityScore?: { original: number; revised: number; change: number };
  tokensUsed?: number;
}

export interface Critique {
  id: string;
  area: string;
  issue: string;
  severity: "minor" | "moderate" | "significant";
  evidence: string;
  suggestion: string;
  // Enhanced fields from new prompts
  type?: string;
  enhancedSeverity?: "CRITICAL" | "HIGH" | "MEDIUM";
  location?: { section: string; quote: string };
  standard?: string;
  expectedBehavior?: string;
  suggestedFix?: {
    action: string;
    source?: string;
    example?: string;
    estimatedEffort?: string;
  };
  impactOnBA?: string;
}

export interface Improvement {
  id: string;
  critiqueId: string;
  description: string;
  applied: boolean;
  impact: "low" | "medium" | "high";
  // Enhanced fields
  status?: "FIXED" | "PARTIALLY_FIXED" | "CANNOT_FIX";
  change?: { before: string; after: string; type: string };
  justification?: Record<string, string | undefined>;
  confidenceImpact?: number;
}

export interface DataRequest {
  id: string;
  requestedFrom: string | string[];
  dataType: string;
  description: string;
  priority: "low" | "normal" | "high";
  fulfilled: boolean;
  response?: unknown;
}

export interface ReflexionConfig {
  maxIterations: number;
  minConfidenceGain: number;
  enableDataRequests: boolean;
  critiqueThreshold: number;
  // New tier-based thresholds
  tier1ConfidenceThreshold: number;
  tier2ConfidenceThreshold: number;
  tier3Enabled: boolean;
  criticalRedFlagAlwaysReflect: boolean;
}

const DEFAULT_CONFIG: ReflexionConfig = {
  maxIterations: 2,
  minConfidenceGain: 5,
  enableDataRequests: false,  // Disabled — data requests add LLM calls for no value
  critiqueThreshold: 60,
  tier1ConfidenceThreshold: 60, // was 70
  tier2ConfidenceThreshold: 50, // was 60
  tier3Enabled: false,
  criticalRedFlagAlwaysReflect: false, // was true — forced reflexion on every critical red flag, too expensive
};

// ============================================================================
// PROMPTS (FR - from spec)
// ============================================================================

function buildCriticSystemPrompt(
  agentName: string,
  agentTier: 1 | 2 | 3
): string {
  return `# ROLE

Tu es un Senior Reviewer Big4, specialise en Due Diligence. Tu relis le rapport de l'agent "${agentName}" (Tier ${agentTier}) avant envoi au client (Business Angel, decision de 50-200K\u20AC).

# REGLES

1. **SPECIFIQUE** - Cite le passage exact entre guillemets. Jamais "certaines affirmations" -> LESQUELLES?
2. **ACTIONNABLE** - Chaque critique propose une correction concrete avec source
3. **PRIORISE** - Traite les CRITICAL d'abord, MEDIUM en dernier
4. **PAS DE CRITIQUE GRATUITE** - Si l'output est bon (sources citees, calculs explicites, red flags complets), retourne un array vide de critiques. Ne cherche PAS a critiquer pour critiquer.
5. **RESPECTE "NON DISPONIBLE"** - Si l'agent a marque une donnee "NON DISPONIBLE" avec une raison valide, ne critique PAS cette donnee.
6. **FOND UNIQUEMENT** - Ne critique jamais le style, uniquement les sources, calculs et preuves.
7. **IDs UNIQUES** - Chaque critique a un ID (CRT-001, CRT-002, ...).

# HIERARCHIE DES SOURCES (ordre de fiabilite)

1. Deck (slide X, section Y) - source primaire
2. Financial Model (onglet X, ligne Y) - source primaire
3. Context Engine (Crunchbase, Dealroom, LinkedIn) - source secondaire
4. Funding Database (benchmarks, comparables) - source secondaire
5. Inference de l'agent - derniere option, doit etre explicite

# QUOI CRITIQUER

| Type | Quand | Severite typique |
|------|-------|-----------------|
| unsourced_claim | Affirmation factuelle sans reference precise | HIGH-CRITICAL |
| unverifiable_calculation | Chiffre calcule sans formule ni inputs | HIGH-CRITICAL |
| incomplete_red_flag | Red flag sans {severite, preuve, impact, question fondateur} | CRITICAL |
| missing_data_not_flagged | Metrique attendue absente et non signalee | MEDIUM-HIGH |
| missing_cross_reference | Context Engine ou Funding DB non utilise alors que pertinent | MEDIUM |
| weak_conclusion | Conclusion non supportee par les preuves listees | HIGH |
| methodological_flaw | Erreur de methode (ex: comparer ARR et MRR) | CRITICAL |
| inconsistency | L'agent se contredit dans son propre output | HIGH |

# CALCUL DU qualityScore (OBJECTIF)

Score de depart: 100. Deductions:
- Par critique CRITICAL: -15
- Par critique HIGH: -10
- Par critique MEDIUM: -5
- Bonus si cross-references presentes et pertinentes: +5 (max +10)
- Score minimum: 0, maximum: 100

Verdict:
- >= 80 -> "ACCEPTABLE"
- 50-79 -> "NEEDS_REVISION"
- < 50 -> "MAJOR_REVISION_REQUIRED"

readyForBA = score >= 70 ET aucune critique CRITICAL non resoluble

# FORMAT DE REPONSE (JSON STRICT)

{
  "critiques": [
    {
      "id": "CRT-001",
      "type": "unsourced_claim | unverifiable_calculation | incomplete_red_flag | missing_data_not_flagged | missing_cross_reference | weak_conclusion | methodological_flaw | inconsistency",
      "severity": "CRITICAL | HIGH | MEDIUM",
      "location": { "section": "...", "quote": "..." },
      "issue": "...",
      "standard": "...",
      "expectedBehavior": "...",
      "suggestedFix": { "action": "...", "source": "...", "example": "...", "estimatedEffort": "..." },
      "impactOnBA": "..."
    }
  ],
  "missingCrossReferences": [
    { "source": "...", "dataType": "...", "potentialValue": "..." }
  ],
  "overallAssessment": {
    "qualityScore": 0-100,
    "verdict": "ACCEPTABLE | NEEDS_REVISION | MAJOR_REVISION_REQUIRED",
    "keyWeaknesses": ["max 5 items"],
    "readyForBA": true/false
  }
}`;
}

function buildCriticPrompt(
  agentName: string,
  agentOutput: unknown,
  findings: ScoredFinding[],
  verificationContext?: VerificationContext,
  preComputedCalculations?: Record<string, unknown>
): string {
  const avgConfidence =
    findings.length > 0
      ? findings.reduce((sum, f) => sum + f.confidence.score, 0) /
        findings.length
      : 0;

  return `# OUTPUT A CRITIQUER

## Agent: ${agentName}
## Confiance moyenne: ${avgConfidence.toFixed(0)}%

## Output complet:
\`\`\`json
${JSON.stringify(agentOutput, null, 2)}
\`\`\`

## Findings:
${findings
  .map(
    (f, i) => `
${i + 1}. **${f.metric}**
   - Valeur: ${f.value} ${f.unit}
   - Assessment: ${f.assessment}
   - Confiance: ${f.confidence.score}%
   - Sources: ${f.evidence.map((e) => e.source).join(", ") || "AUCUNE"}
`
  )
  .join("\n")}

# DONNEES DE VERIFICATION

## Deck
${verificationContext?.deckExtracts || "Non disponible"}

## Financial Model
${verificationContext?.financialModelExtracts || "Non disponible"}

## Context Engine
${verificationContext?.contextEngineData ? JSON.stringify(verificationContext.contextEngineData, null, 2) : "Aucune donnee"}

## Funding Database
${verificationContext?.fundingDbData ? JSON.stringify(verificationContext.fundingDbData, null, 2) : "Aucune donnee"}

${
  preComputedCalculations
    ? `## CALCULS PRE-COMPUTES (TypeScript - VERIFIES)
Ces calculs sont verifies en code TypeScript. Utilise-les pour verifier les affirmations de l'agent.
\`\`\`json
${JSON.stringify(preComputedCalculations, null, 2)}
\`\`\`
`
    : ""
}
# MISSION

Critique cet output selon les regles du system prompt.
- Ordonne les critiques: CRITICAL d'abord, puis HIGH, puis MEDIUM.
- Si l'output est solide (sources citees, calculs montres, red flags complets), retourne critiques: [].
- Calcule le qualityScore objectivement selon la grille de deduction.

Reponds en JSON strict.`;
}

function buildImproverSystemPrompt(): string {
  return `# ROLE

Tu es l'analyste qui corrige son rapport suite aux critiques du Reviewer senior.

# REGLES

1. **UNE CORRECTION PAR CRITIQUE** - Traite chaque critique individuellement avec AVANT/APRES visible.
2. **NE RECALCULE PAS** - Les calculs financiers sont faits en TypeScript et injectes dans les donnees ci-dessous. UTILISE les resultats fournis, ne refais jamais un calcul toi-meme.
3. **MEME FORMAT** - Le revisedOutput doit avoir la MEME structure que l'output original de l'agent. Ne change PAS le format, integre les corrections dans la structure existante.
4. **JAMAIS INVENTER** - Si une source n'existe pas dans les donnees fournies, ne l'invente pas. Status = CANNOT_FIX.
5. **SCORE NE BAISSE PAS** - Le qualityScore revise ne peut PAS etre inferieur a l'original, sauf si tu decouvres que des donnees etaient factuellement fausses.

# QUAND CANNOT_FIX EST ACCEPTABLE

Status CANNOT_FIX uniquement si la donnee est absente de TOUTES ces sources:
- Deck (toutes les slides/sections)
- Financial Model (tous les onglets)
- Context Engine (Crunchbase, Dealroom, LinkedIn)
- Funding Database (benchmarks, comparables)

Si au moins une source contient l'info, tu DOIS corriger.

# FORMAT DE REPONSE (JSON STRICT)

{
  "corrections": [
    {
      "critiqueId": "CRT-001",
      "status": "FIXED | PARTIALLY_FIXED | CANNOT_FIX",
      "change": {
        "before": "texte exact original",
        "after": "texte corrige avec source",
        "type": "added_source | added_calculation | completed_red_flag | added_cross_reference | clarified | removed | downgraded"
      },
      "justification": {
        "sourceUsed": "...",
        "calculationShown": "...",
        "crossReferenceResult": "...",
        "ifCannotFix": "..."
      },
      "confidenceImpact": -50 a +50,
      "qualityImpact": "HIGH | MEDIUM | LOW"
    }
  ],
  "revisedOutput": {},
  "qualityMetrics": {
    "originalScore": 0-100,
    "revisedScore": 0-100,
    "change": number,
    "readyForBA": true/false
  },
  "baNotice": {
    "remainingWeaknesses": ["..."],
    "dataNeedsFromFounder": ["..."],
    "confidenceLevel": "HIGH | MEDIUM | LOW"
  }
}`;
}

function buildImproverPrompt(
  agentName: string,
  originalOutput: unknown,
  critiques: CriticResponse["critiques"],
  verificationContext?: VerificationContext,
  preComputedCalculations?: Record<string, unknown>
): string {
  return `# CORRECTIONS A APPORTER

## Agent: ${agentName}
## Critiques: ${critiques.length} (${critiques.filter((c) => c.severity === "CRITICAL").length} CRITICAL, ${critiques.filter((c) => c.severity === "HIGH").length} HIGH, ${critiques.filter((c) => c.severity === "MEDIUM").length} MEDIUM)

## Critiques (ordonnees par severite):
${critiques
  .sort((a, b) => {
    const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
    return (order[a.severity] ?? 2) - (order[b.severity] ?? 2);
  })
  .map(
    (c) => `
### ${c.id} - ${c.type} [${c.severity}]
- **Ou**: ${c.location.section} -> "${c.location.quote}"
- **Probleme**: ${c.issue}
- **Standard**: ${c.standard}
- **Attendu**: ${c.expectedBehavior}
- **Fix**: ${c.suggestedFix.action}
- **Source suggeree**: ${c.suggestedFix.source || "Non specifiee"}
- **Exemple**: ${c.suggestedFix.example || "Non fourni"}
- **Impact BA**: ${c.impactOnBA}
`
  )
  .join("\n---\n")}

## Output original a corriger:
\`\`\`json
${JSON.stringify(originalOutput, null, 2)}
\`\`\`

## DONNEES DISPONIBLES

### Deck
${verificationContext?.deckExtracts || "Non disponible"}

### Financial Model
${verificationContext?.financialModelExtracts || "Non disponible"}

### Context Engine
${verificationContext?.contextEngineData ? JSON.stringify(verificationContext.contextEngineData, null, 2) : "Aucune donnee"}

### Funding Database
${verificationContext?.fundingDbData ? JSON.stringify(verificationContext.fundingDbData, null, 2) : "Aucune donnee"}

${
  preComputedCalculations
    ? `### CALCULS PRE-COMPUTES (TypeScript - NE PAS RECALCULER)
Ces calculs sont deja faits et verifies. Utilise directement les resultats.
\`\`\`json
${JSON.stringify(preComputedCalculations, null, 2)}
\`\`\`
`
    : ""
}
# MISSION

Corrige chaque critique. CRITICAL d'abord.
- AVANT/APRES obligatoire pour chaque correction.
- Utilise les calculs pre-computes si fournis, ne recalcule JAMAIS.
- Le revisedOutput doit garder la MEME structure que l'output original.
- Si CANNOT_FIX, explique quelle source a ete cherchee sans resultat.

JSON strict.`;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Safely extract .data from an AnalysisAgentResult (avoids repeated double cast)
 */
function extractResultData(result: AnalysisAgentResult): unknown {
  return (result as unknown as { data?: unknown }).data ?? null;
}

// ============================================================================
// REFLEXION ENGINE
// ============================================================================

export class ReflexionEngine {
  private config: ReflexionConfig;

  constructor(config: Partial<ReflexionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run reflexion on an agent result
   */
  async reflect(input: ReflexionInput): Promise<ReflexionOutput> {
    const critiques: Critique[] = [];
    const improvements: Improvement[] = [];
    const dataRequests: DataRequest[] = [];
    let currentResult: AnalysisAgentResult = input.result;
    let totalConfidenceChange = 0;
    let totalTokens = 0;
    let iteration = 0;
    let qualityScoreOriginal: number | undefined;
    let qualityScoreRevised: number | undefined;

    const tier = input.tier ?? 1;

    while (iteration < this.config.maxIterations) {
      iteration++;

      // Step 1: Enhanced self-critique with Zod validation
      const critiqueResult = await this.generateEnhancedCritiques(
        input.agentName,
        currentResult,
        input.findings,
        tier,
        input.verificationContext
      );

      totalTokens += critiqueResult.tokensUsed;

      if (critiqueResult.data) {
        // Set original quality score on first iteration
        if (iteration === 1) {
          qualityScoreOriginal =
            critiqueResult.data.overallAssessment.qualityScore;
        }

        // Map enhanced critiques to legacy format
        for (const ec of critiqueResult.data.critiques) {
          critiques.push({
            id: ec.id,
            area: ec.location.section,
            issue: ec.issue,
            severity:
              ec.severity === "CRITICAL"
                ? "significant"
                : ec.severity === "HIGH"
                  ? "moderate"
                  : "minor",
            evidence: ec.location.quote,
            suggestion: ec.suggestedFix.action,
            type: ec.type,
            enhancedSeverity: ec.severity,
            location: ec.location,
            standard: ec.standard,
            expectedBehavior: ec.expectedBehavior,
            suggestedFix: ec.suggestedFix,
            impactOnBA: ec.impactOnBA,
          });
        }

        // If no critiques, stop
        if (critiqueResult.data.critiques.length === 0) break;

        // Step 2: Identify data needs from missing cross-references
        if (this.config.enableDataRequests) {
          for (const mcr of critiqueResult.data.missingCrossReferences) {
            dataRequests.push({
              id: crypto.randomUUID(),
              requestedFrom: mcr.source,
              dataType: mcr.dataType,
              description: mcr.potentialValue,
              priority: "high",
              fulfilled: false,
            });
          }
        }

        // Step 3: Generate improvements with new prompts
        const improvementResult = await this.generateEnhancedImprovements(
          input.agentName,
          currentResult,
          critiqueResult.data.critiques,
          input.verificationContext
        );

        totalTokens += improvementResult.tokensUsed;

        if (improvementResult.data) {
          qualityScoreRevised =
            improvementResult.data.qualityMetrics.revisedScore;

          // Apply revisedOutput to currentResult if provided
          if (improvementResult.data.revisedOutput) {
            currentResult = {
              ...currentResult,
              data: improvementResult.data.revisedOutput,
            } as AnalysisAgentResult;
          }

          for (const corr of improvementResult.data.corrections) {
            const impactMap: Record<string, "low" | "medium" | "high"> = {
              HIGH: "high",
              MEDIUM: "medium",
              LOW: "low",
            };

            improvements.push({
              id: crypto.randomUUID(),
              critiqueId: corr.critiqueId,
              description: `${corr.change.before} -> ${corr.change.after}`,
              applied: corr.status === "FIXED",
              impact: impactMap[corr.qualityImpact] ?? "medium",
              status: corr.status,
              change: corr.change,
              justification: corr.justification,
              confidenceImpact: corr.confidenceImpact,
            });
          }

          // Calculate confidence change
          const appliedImprovements = improvementResult.data.corrections.filter(
            (c) => c.status === "FIXED"
          );
          if (appliedImprovements.length === 0) break;

          const confidenceGain = appliedImprovements.reduce(
            (sum, i) => sum + Math.max(0, i.confidenceImpact),
            0
          );
          totalConfidenceChange += confidenceGain;

          if (confidenceGain < this.config.minConfidenceGain) break;
        } else {
          // Fallback to legacy improvement generation
          const legacyImprovements = await this.generateImprovements(
            input.agentName,
            currentResult,
            critiques.slice(-critiqueResult.data.critiques.length),
            dataRequests.filter((r) => r.fulfilled)
          );
          improvements.push(...legacyImprovements);

          const appliedImprovements = legacyImprovements.filter(
            (i) => i.applied
          );
          if (appliedImprovements.length === 0) break;

          const confidenceGain = appliedImprovements.reduce(
            (sum, i) =>
              sum +
              (i.impact === "high" ? 10 : i.impact === "medium" ? 5 : 2),
            0
          );
          totalConfidenceChange += confidenceGain;

          if (confidenceGain < this.config.minConfidenceGain) break;
        }
      } else {
        // Fallback to legacy critique generation
        const legacyCritiques = await this.generateCritiques(
          input.agentName,
          currentResult,
          input.findings,
          input.context
        );
        critiques.push(...legacyCritiques);

        const significantCritiques = legacyCritiques.filter(
          (c) => c.severity !== "minor"
        );
        if (significantCritiques.length === 0) break;

        if (this.config.enableDataRequests) {
          const requests = await this.identifyDataNeeds(
            input.agentName,
            legacyCritiques,
            input.context
          );
          dataRequests.push(...requests);
        }

        const legacyImprovements = await this.generateImprovements(
          input.agentName,
          currentResult,
          legacyCritiques,
          dataRequests.filter((r) => r.fulfilled)
        );
        improvements.push(...legacyImprovements);

        const appliedImprovements = legacyImprovements.filter(
          (i) => i.applied
        );
        if (appliedImprovements.length === 0) break;

        const confidenceGain = appliedImprovements.reduce(
          (sum, i) =>
            sum + (i.impact === "high" ? 10 : i.impact === "medium" ? 5 : 2),
          0
        );
        totalConfidenceChange += confidenceGain;

        if (confidenceGain < this.config.minConfidenceGain) break;
      }
    }

    return {
      originalResult: input.result,
      critiques,
      improvements,
      dataRequests,
      revisedResult:
        currentResult !== input.result ? currentResult : undefined,
      confidenceChange: totalConfidenceChange,
      iterations: iteration,
      qualityScore:
        qualityScoreOriginal !== undefined
          ? {
              original: qualityScoreOriginal,
              revised: qualityScoreRevised ?? qualityScoreOriginal,
              change:
                (qualityScoreRevised ?? qualityScoreOriginal) -
                qualityScoreOriginal,
            }
          : undefined,
      tokensUsed: totalTokens,
    };
  }

  /**
   * Quick check if reflexion is needed
   * Now tier-aware: Tier 1 <70%, Tier 2 <60%, Tier 3 never
   */
  needsReflexion(
    result: AnalysisAgentResult,
    findings: ScoredFinding[],
    tier?: 1 | 2 | 3
  ): boolean {
    // Tier 3 never needs reflexion
    if (tier === 3) return false;

    // Critical red flag always triggers reflexion if configured
    if (this.config.criticalRedFlagAlwaysReflect) {
      const hasCriticalRedFlag = findings.some((f) => {
        const assessmentStr = String(f.assessment ?? "").toLowerCase();
        return (
          assessmentStr.includes("critical") ||
          (assessmentStr.includes("suspicious") && f.value === 0)
        );
      });
      if (hasCriticalRedFlag) return true;
    }

    const avgConfidence =
      findings.reduce((sum, f) => sum + f.confidence.score, 0) /
      Math.max(1, findings.length);

    if (tier === 2) {
      return avgConfidence < this.config.tier2ConfidenceThreshold;
    }

    // Default: Tier 1 threshold (also used when tier is undefined for backward compat)
    if (tier === 1) {
      return avgConfidence < this.config.tier1ConfidenceThreshold;
    }

    // Legacy behavior when tier not specified
    return avgConfidence < this.config.critiqueThreshold;
  }

  // ============================================================================
  // ENHANCED METHODS (Zod-validated)
  // ============================================================================

  /**
   * Generate critiques with Zod-validated response
   */
  private async generateEnhancedCritiques(
    agentName: string,
    result: AnalysisAgentResult,
    findings: ScoredFinding[],
    tier: 1 | 2 | 3,
    verificationContext?: VerificationContext
  ): Promise<{ data: CriticResponse | null; tokensUsed: number }> {
    const agentOutput = result.success
      ? extractResultData(result)
      : { error: result.error };

    const systemPrompt = buildCriticSystemPrompt(agentName, tier);
    const userPrompt = buildCriticPrompt(
      agentName,
      agentOutput,
      findings,
      verificationContext
    );

    const validationResult = await completeAndValidate(
      systemPrompt,
      userPrompt,
      CriticResponseSchema,
      { complexity: "medium", temperature: 0.2 }
    );

    return {
      data: validationResult.success ? (validationResult.data ?? null) : null,
      tokensUsed: validationResult.tokensUsed,
    };
  }

  /**
   * Generate improvements with Zod-validated response
   */
  private async generateEnhancedImprovements(
    agentName: string,
    result: AnalysisAgentResult,
    critiques: CriticResponse["critiques"],
    verificationContext?: VerificationContext
  ): Promise<{ data: ImproverResponse | null; tokensUsed: number }> {
    if (critiques.length === 0) {
      return { data: null, tokensUsed: 0 };
    }

    const agentOutput = result.success
      ? extractResultData(result)
      : { error: result.error };

    const systemPrompt = buildImproverSystemPrompt();
    const userPrompt = buildImproverPrompt(
      agentName,
      agentOutput,
      critiques,
      verificationContext
    );

    const validationResult = await completeAndValidate(
      systemPrompt,
      userPrompt,
      ImproverResponseSchema,
      { complexity: "complex", temperature: 0.2 }
    );

    return {
      data: validationResult.success ? (validationResult.data ?? null) : null,
      tokensUsed: validationResult.tokensUsed,
    };
  }

  // ============================================================================
  // LEGACY METHODS (fallback)
  // ============================================================================

  private async generateCritiques(
    agentName: string,
    result: AnalysisAgentResult,
    findings: ScoredFinding[],
    context: string
  ): Promise<Critique[]> {
    const prompt = `You are a critical reviewer evaluating the output of the ${agentName} agent.

Context: ${context}

Agent Output:
${JSON.stringify(result.success ? extractResultData(result) : { error: result.error }, null, 2)}

Findings produced:
${findings.map((f) => `- ${f.metric}: ${f.value} (confidence: ${f.confidence.score}%)`).join("\n")}

Identify issues with this analysis. Look for:
1. Missing important metrics or considerations
2. Weak evidence or low-confidence conclusions
3. Potential biases or assumptions
4. Inconsistencies within the analysis
5. Areas that need more data

Respond in JSON:
{
  "critiques": [
    {
      "area": "area of concern",
      "issue": "specific issue found",
      "severity": "minor|moderate|significant",
      "evidence": "what led to this critique",
      "suggestion": "how to improve"
    }
  ]
}`;

    const response = await complete(prompt, {
      complexity: "medium",
      temperature: 0.3,
    });

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    try {
      const parsed = JSON.parse(jsonMatch[0]);

      return (parsed.critiques ?? []).map(
        (c: {
          area: string;
          issue: string;
          severity: string;
          evidence: string;
          suggestion: string;
        }) => ({
          id: crypto.randomUUID(),
          area: c.area,
          issue: c.issue,
          severity: c.severity as Critique["severity"],
          evidence: c.evidence,
          suggestion: c.suggestion,
        })
      );
    } catch {
      return [];
    }
  }

  private async identifyDataNeeds(
    agentName: string,
    critiques: Critique[],
    context: string
  ): Promise<DataRequest[]> {
    if (critiques.length === 0) return [];

    const prompt = `Based on these critiques of the ${agentName} agent's analysis, identify what additional data would help.

Critiques:
${critiques.map((c) => `- ${c.area}: ${c.issue} (${c.severity})`).join("\n")}

Context: ${context}

What data from other agents would help address these critiques?

Respond in JSON:
{
  "dataRequests": [
    {
      "requestedFrom": "agent name or ['agent1', 'agent2']",
      "dataType": "type of data needed",
      "description": "specific information requested",
      "priority": "low|normal|high"
    }
  ]
}`;

    const response = await complete(prompt, {
      complexity: "simple",
      temperature: 0.2,
    });

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    try {
      const parsed = JSON.parse(jsonMatch[0]);

      return (parsed.dataRequests ?? []).map(
        (r: {
          requestedFrom: string | string[];
          dataType: string;
          description: string;
          priority: string;
        }) => ({
          id: crypto.randomUUID(),
          requestedFrom: r.requestedFrom,
          dataType: r.dataType,
          description: r.description,
          priority: r.priority as DataRequest["priority"],
          fulfilled: false,
        })
      );
    } catch {
      return [];
    }
  }

  private async generateImprovements(
    agentName: string,
    result: AnalysisAgentResult,
    critiques: Critique[],
    fulfilledRequests: DataRequest[]
  ): Promise<Improvement[]> {
    const prompt = `Generate specific improvements for the ${agentName} agent based on critiques.

Critiques to address:
${critiques.map((c) => `- [${c.severity.toUpperCase()}] ${c.area}: ${c.issue}\n  Suggestion: ${c.suggestion}`).join("\n\n")}

${fulfilledRequests.length > 0 ? `\nAdditional data received:\n${fulfilledRequests.map((r) => `- ${r.dataType}: ${JSON.stringify(r.response)}`).join("\n")}` : ""}

For each critique, provide a specific improvement action.

Respond in JSON:
{
  "improvements": [
    {
      "critiqueId": "id of critique being addressed",
      "description": "specific change to make",
      "applied": true/false,
      "impact": "low|medium|high"
    }
  ]
}`;

    const response = await complete(prompt, {
      complexity: "medium",
      temperature: 0.2,
    });

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    try {
      const parsed = JSON.parse(jsonMatch[0]);

      return (parsed.improvements ?? []).map(
        (
          i: { description: string; applied: boolean; impact: string },
          index: number
        ) => ({
          id: crypto.randomUUID(),
          critiqueId: critiques[index]?.id ?? "",
          description: i.description,
          applied: i.applied ?? false,
          impact: i.impact as Improvement["impact"],
        })
      );
    } catch {
      return [];
    }
  }
}

// Singleton instance
export const reflexionEngine = new ReflexionEngine();

/**
 * Create a reflexion engine with custom config
 */
export function createReflexionEngine(
  config: Partial<ReflexionConfig>
): ReflexionEngine {
  return new ReflexionEngine(config);
}
