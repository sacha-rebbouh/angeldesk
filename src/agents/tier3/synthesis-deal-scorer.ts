/**
 * SYNTHESIS DEAL SCORER - TIER 3 - REFONTE v2.0
 *
 * Mission: Produire le SCORE FINAL et la RECOMMANDATION d'investissement
 *          en synthétisant TOUS les outputs Tier 1 (13 agents) et Tier 2 (expert sectoriel)
 *
 * Persona: Senior Investment Committee Partner (20+ ans d'expérience)
 *          - A siégé à 200+ IC meetings
 *          - A vu 3000+ deals, investi dans 150+
 *          - Sait distinguer signal vs noise dans une DD
 *          - Applique les standards Big4 + instinct Partner VC
 *
 * Standards:
 * - Chaque score doit être justifié avec les sources (agents Tier 1/2)
 * - Les calculs de pondération doivent être montrés
 * - Cross-reference obligatoire avec la Funding DB
 * - Red flags consolidés avec les 5 composants requis
 * - Output informatif: profil de signal clair, le BA décide
 *
 * Inputs:
 * - Tous les résultats Tier 1 (13 agents)
 * - Résultat Tier 2 (expert sectoriel si disponible)
 * - Context Engine data
 * - Funding DB comparables
 * - BA Preferences
 *
 * Outputs:
 * - Score final pondéré (0-100) avec breakdown
 * - Verdict: very_favorable / favorable / contrasted / vigilance / alert_dominant
 * - Investment thesis (bull/bear)
 * - Consolidated red flags
 * - Top questions for founder
 * - Negotiation points
 */

import { BaseAgent } from "../base-agent";
import type {
  EnrichedAgentContext,
  AgentMeta,
  AgentScore,
  AgentRedFlag,
  AgentQuestion,
  AgentAlertSignal,
  AgentNarrative,
  DbCrossReference,
  AgentResult,
  Tier3Orientation,
  Tier3SignalContribution,
} from "../types";
import type { BAPreferences } from "@/services/benchmarks";
import { RedFlagDedup, inferRedFlagTopic } from "@/services/red-flag-dedup";
import type { RedFlagSeverity } from "@/services/red-flag-dedup";
import { getWeightsForDeal, formatWeightsForPrompt } from "@/scoring/stage-weights";
import { SYNTHESIS_DEAL_SCORER_SYSTEM_PROMPT } from "./prompts/synthesis-deal-scorer-prompt";
import { buildEvidenceSolidityForContext } from "@/services/evidence-solidity";

// =============================================================================
// OUTPUT TYPES - Synthesis Deal Scorer v2.0
// =============================================================================

/** Dimension score avec détail de calcul */
interface DimensionScore {
  dimension: string;
  weight: number; // Pondération (ex: 0.25 pour 25%)
  rawScore: number; // Score brut de l'agent source (0-100)
  adjustedScore: number; // Score après ajustements
  weightedScore: number; // rawScore * weight
  sourceAgents: string[]; // Agents qui ont contribué
  keyFactors: {
    factor: string;
    impact: "positive" | "negative" | "neutral";
    contribution: number; // Points ajoutés/retirés
    source: string; // Agent source
  }[];
  calculation: string; // Calcul montré
}

/** Breakdown du score avec transparence totale */
interface ScoreBreakdown {
  baseScore: number; // Moyenne pondérée brute
  adjustments: {
    type: string;
    reason: string;
    impact: number;
    source: string;
  }[];
  finalScore: number;
  calculationShown: string; // Formule complète
}

/** Position vs marché (cross-ref DB) */
interface MarketPosition {
  percentileOverall: number; // Position vs tous les deals DB
  percentileSector: number; // Position vs deals du même secteur
  percentileStage: number; // Position vs deals du même stage
  valuationAssessment: "UNDERVALUED" | "FAIR" | "AGGRESSIVE" | "VERY_AGGRESSIVE";
  valuationRationale: string;
  comparableDeals: {
    name: string;
    score: number;
    valuation: number;
    outcome?: string;
    relevance: string;
  }[];
  similarDealsAnalyzed: number;
}

/** Investment thesis structurée */
interface InvestmentThesis {
  bull: {
    thesis: string;
    evidence: string;
    sourceAgent: string;
  }[];
  bear: {
    thesis: string;
    evidence: string;
    sourceAgent: string;
  }[];
  keyAssumptions: {
    assumption: string;
    confidence: "HIGH" | "MEDIUM" | "LOW";
    validationNeeded: string;
  }[];
  convictionLevel: "HIGH" | "MEDIUM" | "LOW";
  convictionRationale: string;
}

/** Recommandation d'investissement */
interface InvestmentRecommendation {
  action: "very_favorable" | "favorable" | "contrasted" | "vigilance" | "alert_dominant";
  verdict: "very_favorable" | "favorable" | "contrasted" | "vigilance" | "alert_dominant";
  rationale: string;
  conditions?: string[]; // Si contrasted
  criticalRisks?: string[]; // Si alert_dominant
  suggestedTerms?: string;
  nextSteps: {
    step: string;
    priority: "IMMEDIATE" | "BEFORE_TERM_SHEET" | "DURING_DD";
    owner: "INVESTOR" | "FOUNDER";
  }[];
}

/** Findings spécifiques Synthesis Deal Scorer */
interface SynthesisDealScorerFindings {
  // Scores par dimension (minimum 6)
  dimensionScores: DimensionScore[];

  // Breakdown transparent du score final
  scoreBreakdown: ScoreBreakdown;

  // Position vs marché (cross-ref DB obligatoire)
  marketPosition: MarketPosition;

  // Investment thesis (bull vs bear)
  investmentThesis: InvestmentThesis;

  // Recommandation finale
  recommendation: InvestmentRecommendation;

  // Synthèse des agents Tier 1
  tier1Synthesis: {
    agentsAnalyzed: number;
    agentsSuccessful: number;
    averageScore: number;
    lowestScoringAgent: { name: string; score: number; concern: string };
    highestScoringAgent: { name: string; score: number; strength: string };
    criticalRedFlagsTotal: number;
    highRedFlagsTotal: number;
    dataCompleteness: number; // 0-100
  };

  // Synthèse Tier 2 (si disponible)
  tier2Synthesis?: {
    sectorExpert: string;
    sectorScore: number;
    sectorFit: string;
    keyInsights: string[];
  };

  // Alignment avec préférences BA (fit investisseur, distinct de la qualité intrinsèque du deal)
  baAlignment: {
    sectorMatch: boolean;
    stageMatch: boolean;
    ticketFit: boolean;
    riskToleranceMatch: boolean;
    overallFit: "EXCELLENT" | "GOOD" | "MODERATE" | "POOR";
    concerns: string[];
  };

  // Top strengths & weaknesses consolidés
  topStrengths: {
    strength: string;
    evidence: string;
    sourceAgent: string;
  }[];
  topWeaknesses: {
    weakness: string;
    evidence: string;
    sourceAgent: string;
    mitigationPossible: boolean;
  }[];
}

/** Structure complète de sortie v2.0 */
export interface SynthesisDealScorerDataV2 {
  meta: AgentMeta;
  score: AgentScore;
  findings: SynthesisDealScorerFindings;
  dbCrossReference: DbCrossReference;
  redFlags: AgentRedFlag[];
  questions: AgentQuestion[];
  alertSignal: AgentAlertSignal;
  narrative: AgentNarrative;
}

// Pour compatibilité avec l'ancien type exporté
export interface SynthesisDealScorerData {
  overallScore: number;
  /**
   * Profil de signal Phase A — type unifié `Tier3Orientation` (équivalent
   * structurel à l'union string littérale précédente). Cf. `src/agents/types.ts`
   * et `src/agents/tier3/schemas/common.ts:Tier3OrientationSchema`.
   */
  verdict: Tier3Orientation;
  confidence: number;
  dimensionScores: {
    dimension: string;
    score: number;
    weight: number;
    weightedScore: number;
    sourceAgents: string[];
    keyFactors: string[];
  }[];
  scoreBreakdown: {
    strengthsContribution: number;
    weaknessesDeduction: number;
    riskAdjustment: number;
    opportunityBonus: number;
  };
  comparativeRanking: {
    percentileOverall: number;
    percentileSector: number;
    percentileStage: number;
    similarDealsAnalyzed: number;
    method?: "EXACT" | "INTERPOLATED" | "INSUFFICIENT_DATA" | "UNAVAILABLE";
    insufficientData?: boolean;
    calculationDetail?: string;
  };
  investmentRecommendation: {
    /** Profil de signal — type unifié `Tier3Orientation` (cf. ci-dessus). */
    action: Tier3Orientation;
    rationale: string;
    conditions?: string[];
    suggestedTerms?: string;
  };
  keyStrengths: string[];
  keyWeaknesses: string[];
  criticalRisks: string[];
  /**
   * Phase A slice A2 — Contribution au signal cross-agent.
   *
   * Construit déterministement par `transformResponse` :
   * - `orientation` : dérivée de `verdict` (alignement obligatoire).
   * - `evidenceSolidity` : `null` en A2 (sera renseigné par le service
   *   Solidité déterministe en A6 — D2 verrouillé : valeurs `contradictory`
   *   ou `insufficient` uniquement, ou `null` si non qualifié).
   * - `score`, `criticalRisks` : passés depuis l'agrégation existante.
   *
   * D1 verrouillé : aucun bridge `legacyVerdict` n'est émis ; le format
   * natif est seul produit.
   */
  signalContribution: Tier3SignalContribution;
}

export interface SynthesisDealScorerResult extends AgentResult {
  agentName: "synthesis-deal-scorer";
  data: SynthesisDealScorerData;
}

// =============================================================================
// AGENT IMPLEMENTATION
// =============================================================================

export class SynthesisDealScorerAgent extends BaseAgent<SynthesisDealScorerData, SynthesisDealScorerResult> {
  constructor() {
    super({
      name: "synthesis-deal-scorer",
      description: "Synthèse finale: score pondéré + recommandation d'investissement basée sur tous les agents",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 300000,
      dependencies: [
        // Tier 1 - Analysis agents
        "deck-forensics",
        "financial-auditor",
        "team-investigator",
        "market-intelligence",
        "competitive-intel",
        "exit-strategist",
        "tech-stack-dd",
        "tech-ops-dd",
        "legal-regulatory",
        "gtm-analyst",
        "customer-intel",
        "cap-table-auditor",
        "question-master",
        // Tier 2 - Sector expert (dynamique)
        // Tier 3 - Other synthesis agents
        "contradiction-detector",
        "conditions-analyst",
      ],
    });
  }

  // ===========================================================================
  // SYSTEM PROMPT - Big4 + Partner VC Standards
  // ===========================================================================

  protected buildSystemPrompt(): string {
    // Phase A slice A2 — Prompt système extrait dans fichier compagnon
    // `src/agents/tier3/prompts/synthesis-deal-scorer-prompt.ts` (décision
    // Codex round 2 : extraction nominale dans fichier compagnon).
    //
    // La directive historique de seuil d'auto-confiance a été RETIRÉE du
    // prompt en A2 (D4 verrouillé). BaseAgent injecte automatiquement les
    // directives anti-hallucination 2-5 via `buildFullSystemPrompt()`
    // (cf. `base-agent.ts:1811-1828`).
    return SYNTHESIS_DEAL_SCORER_SYSTEM_PROMPT;
  }

  // ===========================================================================
  // EXECUTE - Main analysis logic
  // ===========================================================================

  protected async execute(context: EnrichedAgentContext): Promise<SynthesisDealScorerData> {
    const deal = context.canonicalDeal;
    this._dealStage = deal.stage;
    // Get dynamic weights based on stage and sector
    const dealStage = deal.stage || (context.previousResults?.['document-extractor'] as { data?: { extractedInfo?: { stage?: string } } })?.data?.extractedInfo?.stage;
    const dealSector = deal.sector || (context.previousResults?.['document-extractor'] as { data?: { extractedInfo?: { sector?: string } } })?.data?.extractedInfo?.sector;
    const weights = getWeightsForDeal(dealStage, dealSector);
    const weightsTable = formatWeightsForPrompt(weights);

    // Build comprehensive prompt with all context
    const dealContext = this.formatDealContext(context);
    const tier1Scores = this.extractTier1Scores(context);
    const tier1RedFlags = this.extractTier1RedFlags(context);
    const tier1Synthesis = this.buildTier1Synthesis(context);
    const tier2Data = this.extractTier2Data(context);
    const fundingDbContext = this.formatFundingDbContext(context);
    const baPrefsSection = this.formatBAPreferences(context.baPreferences, deal.sector, deal.stage);
    const contradictions = this.extractContradictions(context);
    const conditionsSection = this.extractConditionsData(context);
    const coherenceSection = this.formatCoherenceData(context);

    // F23: Build deal source analysis section
    const dealSourceSection = this.buildDealSourceSection(context);

    const prompt = `# ANALYSE SYNTHESIS DEAL SCORER - ${deal.companyName ?? deal.name}

## INFORMATIONS DEAL
${dealContext}

---

## SCORES BRUTS TIER 1 (13 agents) — À AJUSTER avec Tier 2/3
${tier1Scores}

---

## RED FLAGS AGRÉGÉS (Tier 1)
${tier1RedFlags}

---

## SYNTHÈSE TIER 1
${tier1Synthesis}

---

## DONNÉES EXPERT SECTORIEL (Tier 2)
${tier2Data}

---

## INCOHÉRENCES DÉTECTÉES (contradiction-detector)
${contradictions}

---

## CONDITIONS D'INVESTISSEMENT (conditions-analyst)
${conditionsSection}

---

## COHÉRENCE INTER-AGENTS TIER 3
${coherenceSection}

---

## DONNÉES FUNDING DB (Comparables)
${fundingDbContext}

---

## ANALYSE DE LA SOURCE DU DEAL (OBLIGATOIRE)
${dealSourceSection}

---

## PROFIL BUSINESS ANGEL
${baPrefsSection}
${this.formatFactStoreData(context)}
---

## TA MISSION

1. **CALCULE LE SCORE PONDÉRÉ** avec la formule:
   Score = Σ(dimension_weight × dimension_score) + adjustments

   Pondérations ADAPTÉES AU STAGE (${dealStage || 'SEED'}) ET AU SECTEUR (${dealSector || 'General'}):

${weightsTable}

   **NOTE**: Ces poids ont été ajustés automatiquement selon le stage d'investissement et le secteur.

2. **AJUSTE SELON LES RED FLAGS**:
   - CRITICAL: -10 à -20 pts
   - HIGH: -5 à -10 pts
   - Incohérences: -5 à -15 pts
   - Data incomplete: -10 pts

3. **CROSS-RÉFÉRENCE LA DB**:
   - Percentile valorisation vs sector deals
   - Position vs median sur chaque dimension
   - Vérification claims concurrentiels

4. **CONSTRUIS L'INVESTMENT THESIS**:
   - 3-5 bull points avec sources
   - 3-5 bear points avec sources
   - Key assumptions à valider

5. **DONNE LE PROFIL DE SIGNAL**:
   - 85-100: very_favorable
   - 70-84: favorable
   - 55-69: contrasted
   - 40-54: vigilance
   - 0-39: alert_dominant

6. **LISTE LES NEXT STEPS** concrets

7. **SEPARE EXPLICITEMENT LES AXES**:
   - Qualite intrinsèque du deal / de la these
   - Investor profile fit (préférences, mandat, ticket, horizon)
   - Deal accessibility (ticket minimum, allocation, structure, liquidité)
   - Un mismatch BA ne doit jamais, a lui seul, dégrader les dimensions fondamentales ni le verdict thesis-first.

---

## RAPPELS CRITIQUES

⚠️ **MONTRE TOUS LES CALCULS** - Le BA doit comprendre comment tu arrives au score
⚠️ **SOURCE CHAQUE AFFIRMATION** - Cite l'agent qui a fourni la donnée
⚠️ **SOIS INFORMATIF** — Profil de signal clair, le BA décide
⚠️ **CONSOLIDE LES RED FLAGS** - Ne répète pas, synthétise avec priorité
⚠️ **ADAPTE AU PROFIL BA** - Tiens compte de ses préférences dans \`baAlignment\`, les conditions et le narratif, sans confondre cela avec la qualité intrinsèque du deal
⚠️ **RESPECTE LA COHÉRENCE TIER 3** - Si les scénarios ont été ajustés (section COHÉRENCE INTER-AGENTS), ton score DOIT être aligné. Un deal alert_dominant avec scepticisme >80 ne peut pas avoir un score > 40.
⚠️ **score.value = Σ(breakdown weights × breakdown scores)** — Le score.value DOIT être la moyenne pondérée de ton breakdown. Si ton breakdown donne 50, score.value DOIT être ~50, PAS 2 ou 5. C'est un entier 0-100.
⚠️ **NE CONFONDS PAS FIT ET QUALITÉ** — ticket minimum, secteur hors mandat BA, ou horizon peu adapté au profil investisseur doivent etre surfaces comme \`baAlignment\` / \`conditions\`, pas comme preuve que la these est faible.

**CONCISION OBLIGATOIRE (JSON sera INVALIDE si tronque):**
- dimensionScores: 7 items, adjustments: MAX 5, comparableDeals: MAX 3
- bull/bear: MAX 4 chacun, nextSteps: MAX 5
- redFlags: MAX 6, questions: MAX 5, keyInsights: MAX 4
- justification: 1-2 phrases, rationale: 2-3 phrases
- PRIORITE: JSON complet > detail

Produis le JSON complet selon le format spécifié dans le system prompt.`;

    // Call LLM with retry: if dimensional scores are missing, retry once with explicit instruction.
    // Time-budget aware: only retry if we have enough time left (< 50% of timeout used).
    let data: LLMSynthesisResponse;
    const callStart = Date.now();
    const firstAttempt = await this.llmCompleteJSON<LLMSynthesisResponse>(prompt);
    const firstCallMs = Date.now() - callStart;
    const firstBreakdown = firstAttempt.data.score?.breakdown ?? firstAttempt.data.dimensionScores ?? [];

    if (firstBreakdown.length >= 3) {
      data = firstAttempt.data;
    } else {
      const timeRemaining = this.config.timeoutMs - firstCallMs;
      const canRetry = timeRemaining > firstCallMs * 1.2; // need ~120% of first call for retry + post-processing
      if (canRetry) {
        console.warn(
          `[synthesis-deal-scorer] LLM returned ${firstBreakdown.length} dimension scores — retrying (${Math.round(timeRemaining / 1000)}s remaining)`
        );
        const retryPrompt = prompt + `\n\n---\n\n**INSTRUCTION CRITIQUE**: Ta réponse DOIT inclure "score.breakdown" avec AU MINIMUM 7 dimensions (Team, Financials, Market, Product/Tech, GTM/Traction, Competitive, Exit Potential), chacune avec "criterion", "weight", "score" et "justification". Sans ce breakdown, l'analyse est inutilisable.`;
        const retryAttempt = await this.llmCompleteJSON<LLMSynthesisResponse>(retryPrompt);
        data = retryAttempt.data;
      } else {
        console.warn(
          `[synthesis-deal-scorer] LLM returned ${firstBreakdown.length} dimension scores — skipping retry (only ${Math.round(timeRemaining / 1000)}s left, first call took ${Math.round(firstCallMs / 1000)}s)`
        );
        data = firstAttempt.data;
      }
    }

    // Transform and validate the response
    const result = this.transformResponse(data, context);

    // F37: Override LLM percentiles with deterministic DB calculation
    // Use a 10s timeout to avoid blocking when Neon DB is unstable
    try {
      const { calculateDealPercentile } = await import("@/services/funding-db/percentile-calculator");
      const dbPercentile = await Promise.race([
        calculateDealPercentile(
          result.overallScore,
          context.canonicalDeal.sector ?? null,
          context.canonicalDeal.stage ?? null,
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("F37 percentile DB timeout (10s)")), 10000)
        ),
      ]);
      result.comparativeRanking = {
        percentileOverall: dbPercentile.percentileOverall,
        percentileSector: dbPercentile.percentileSector,
        percentileStage: dbPercentile.percentileStage,
        similarDealsAnalyzed: dbPercentile.similarDealsAnalyzed,
        method: dbPercentile.method,
        insufficientData: dbPercentile.method === "INSUFFICIENT_DATA",
        calculationDetail: dbPercentile.calculationDetail,
      };
      if (dbPercentile.method === "INSUFFICIENT_DATA") {
        console.warn(`[synthesis-deal-scorer] F37: Percentile based on ${dbPercentile.similarDealsAnalyzed} deals only (${dbPercentile.method})`);
        result.confidence = Math.min(result.confidence, 60);
        result.keyWeaknesses = [
          ...new Set([
            ...result.keyWeaknesses,
            `Benchmark percentile statistically weak: only ${dbPercentile.similarDealsAnalyzed} comparable deals available.`,
          ]),
        ].slice(0, 5);
        result.criticalRisks = [
          ...new Set([
            ...result.criticalRisks,
            "Comparative ranking is insufficiently supported and must not be treated as statistically robust.",
          ]),
        ].slice(0, 3);
      }
    } catch (err) {
      console.warn("[synthesis-deal-scorer] F37 percentile calculation failed:", err);
      result.comparativeRanking = {
        ...result.comparativeRanking,
        method: "UNAVAILABLE",
        insufficientData: true,
        calculationDetail: "Percentile calculation failed; comparative ranking unavailable.",
      };
      result.confidence = Math.min(result.confidence, 55);
    }

    return result;
  }

  // ===========================================================================
  // HELPER METHODS - Data extraction from previous agents
  // ===========================================================================

  /**
   * F23: Build deal source analysis section for the prompt.
   * Analyse le contexte de levee sans le transformer en malus automatique de qualite.
   */
  private buildDealSourceSection(context: EnrichedAgentContext): string {
    const deal = context.canonicalDeal as Record<string, unknown>;
    const lines: string[] = [];

    // Collect source info from deal data
    const source = deal.source || deal.dealSource || "unknown";
    const referral = deal.referralFrom || deal.referredBy;
    const roundStartDate = deal.roundStartDate || deal.fundraisingStarted;

    lines.push(`**Source du deal**: ${source}`);
    if (referral) lines.push(`**Refere par**: ${referral}`);

    // Calculate fundraising duration if available
    if (roundStartDate) {
      const start = new Date(roundStartDate as string);
      if (!isNaN(start.getTime())) {
        const durationMonths = Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24 * 30));
        lines.push(`**Duree de la levee**: ${durationMonths} mois`);
        if (durationMonths > 6) {
          lines.push(`**WARNING**: Levee en cours depuis > 6 mois. Signal de fundraising a analyser, sans deduction automatique.`);
        }
      }
    }

    // Check if VCs are in the round
    const investors = deal.investors as string[] | undefined;
    const hasVC = investors?.some((i: string) =>
      i.toLowerCase().includes("venture") ||
      i.toLowerCase().includes("capital") ||
      i.toLowerCase().includes("partners") ||
      i.toLowerCase().includes("fund")
    );

    if (investors && investors.length > 0) {
      if (hasVC) {
        lines.push(`**VC present dans le tour**: Oui → information de contexte. Peut renforcer la lisibilite du tour sans valider a lui seul la qualite du deal.`);
      } else {
        lines.push(`**Aucun VC dans le tour**: Investisseurs: ${investors.join(", ")}. Pourquoi pas de VC ? A analyser sans conclusion automatique sur la qualite du deal.`);
      }
    } else {
      lines.push(`**Investisseurs**: Information non disponible.`);
    }

    lines.push(`
**QUESTIONS OBLIGATOIRES pour le scoring** :
1. Pourquoi ce deal arrive a un BA solo plutot qu'un fonds VC ?
2. Le fondateur a-t-il ete refuse par des VCs ? Si oui, quels retours ?
3. Combien d'investisseurs ont ete contactes ?
4. Depuis combien de temps dure la levee ?

**TRAITEMENT ATTENDU** :
- Utilise ces elements comme contexte de marketability / investor-fit / accessibilite du tour
- Ne convertis PAS automatiquement ces elements en bonus/malus du score global
- Ne les traite comme faiblesse intrinsèque que s'ils revelent un probleme causal documente (ex: refus VC motives par un defaut fondamental verifie)

**AJOUTER DANS topWeaknesses OU topStrengths si pertinent** :
- "Deal source / fundraising context: [analyse factuelle de pourquoi ce deal arrive a ce type d'investisseur]"

**AJOUTER DANS questions (TOUJOURS)** :
- "Avez-vous presente ce deal a des fonds VC ? Si oui, quels retours avez-vous eus ?"
- "Depuis combien de temps etes-vous en levee de fonds ?"
`);

    return lines.join("\n");
  }

  private extractTier1Scores(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};
    const scores: string[] = [];

    // Mapping agent name to their score field
    const scoreMapping: Record<string, { field: string; dimension: string }> = {
      "financial-auditor": { field: "score.value", dimension: "Financials" },
      "team-investigator": { field: "score.value", dimension: "Team" },
      "competitive-intel": { field: "score.value", dimension: "Competitive" },
      "market-intelligence": { field: "score.value", dimension: "Market" },
      "tech-stack-dd": { field: "score.value", dimension: "Tech Stack" },
      "tech-ops-dd": { field: "score.value", dimension: "Tech Ops" },
      "legal-regulatory": { field: "score.value", dimension: "Legal" },
      "cap-table-auditor": { field: "capTableScore", dimension: "Cap Table" },
      "gtm-analyst": { field: "score.value", dimension: "GTM" },
      "customer-intel": { field: "score.value", dimension: "Traction" },
      "exit-strategist": { field: "score.value", dimension: "Exit" },
      "deck-forensics": { field: "score.value", dimension: "Deck Quality" },
      "question-master": { field: "score.value", dimension: "DD Readiness" },
    };

    for (const [agentName, config] of Object.entries(scoreMapping)) {
      const result = results[agentName];
      if (result?.success && "data" in result) {
        const data = result.data as Record<string, unknown>;

        // Try to extract score from nested structure (score.value) or direct field
        let scoreValue: number | undefined;

        if (config.field.includes(".")) {
          const [obj, key] = config.field.split(".");
          const nestedObj = data[obj] as Record<string, unknown> | undefined;
          if (nestedObj && typeof nestedObj[key] === "number") {
            scoreValue = nestedObj[key] as number;
          }
        } else if (typeof data[config.field] === "number") {
          scoreValue = data[config.field] as number;
        }

        // Fallback to common score field names
        if (scoreValue === undefined) {
          const fallbackFields = ["overallScore", "score", "finalScore", "capTableScore", "gtmScore"];
          for (const field of fallbackFields) {
            if (typeof data[field] === "number") {
              scoreValue = data[field] as number;
              break;
            }
          }
        }

        if (scoreValue !== undefined) {
          // Extract key factors if available
          const keyFactors = this.extractKeyFactors(data, agentName);
          scores.push(`### ${agentName} → ${config.dimension}
- **Score**: ${scoreValue}/100
- **Facteurs clés**: ${keyFactors || "Non disponible"}`);
        } else {
          scores.push(`### ${agentName} → ${config.dimension}
- **Score**: NON DISPONIBLE (agent n'a pas retourné de score)
- **Status**: ${result.success ? "Exécuté mais sans score" : "Échec"}`);
        }
      } else {
        scores.push(`### ${agentName} → ${config.dimension}
- **Score**: NON EXÉCUTÉ
- **Impact**: Dimension non évaluée, confiance réduite`);
      }
    }

    return scores.length > 0 ? scores.join("\n\n") : "Aucun score Tier 1 disponible - analyse impossible.";
  }

  private extractKeyFactors(data: Record<string, unknown>, agentName: string): string {
    const factors: string[] = [];

    // Extract based on agent type
    switch (agentName) {
      case "financial-auditor":
        if (data.findings && typeof data.findings === "object") {
          const findings = data.findings as Record<string, unknown>;
          if (findings.valuation && typeof findings.valuation === "object") {
            const val = findings.valuation as Record<string, unknown>;
            if (val.verdict) factors.push(`Valorisation: ${val.verdict}`);
          }
          if (findings.burn && typeof findings.burn === "object") {
            const burn = findings.burn as Record<string, unknown>;
            if (burn.efficiency) factors.push(`Burn: ${burn.efficiency}`);
          }
        }
        break;
      case "team-investigator":
        if (data.findings && typeof data.findings === "object") {
          const findings = data.findings as Record<string, unknown>;
          if (findings.teamComposition && typeof findings.teamComposition === "object") {
            const team = findings.teamComposition as Record<string, unknown>;
            if (team.complementarityScore) factors.push(`Complémentarité: ${team.complementarityScore}/100`);
          }
        }
        break;
      default:
        // Generic extraction
        if (Array.isArray(data.keyStrengths) && data.keyStrengths.length > 0) {
          factors.push(`Forces: ${(data.keyStrengths as string[]).slice(0, 2).join(", ")}`);
        }
        if (Array.isArray(data.keyWeaknesses) && data.keyWeaknesses.length > 0) {
          factors.push(`Faiblesses: ${(data.keyWeaknesses as string[]).slice(0, 2).join(", ")}`);
        }
    }

    return factors.length > 0 ? factors.join(" | ") : "";
  }

  private extractTier1RedFlags(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};
    const dedup = new RedFlagDedup();

    for (const [agentName, result] of Object.entries(results)) {
      if (result.success && "data" in result && result.data) {
        const data = result.data as Record<string, unknown>;

        // Check various red flag field names
        const redFlagFields = ["redFlags", "financialRedFlags", "criticalIssues", "structuralRedFlags", "sectorRedFlags"];

        for (const field of redFlagFields) {
          if (Array.isArray(data[field])) {
            for (const rf of data[field] as Array<Record<string, unknown>>) {
              const rawSeverity = String(rf.severity ?? rf.level ?? "MEDIUM").toUpperCase();
              const severity: RedFlagSeverity = (["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(rawSeverity)
                ? rawSeverity
                : "MEDIUM") as RedFlagSeverity;
              const title = String(rf.title ?? rf.flag ?? rf.description ?? "Unknown");
              const category = String(rf.category ?? field);
              const topic = inferRedFlagTopic(title, category);

              dedup.register({
                id: `${agentName}::${topic}`,
                agentSource: agentName,
                topic,
                title,
                severity,
                description: rf.description ? String(rf.description) : title,
                evidence: rf.evidence
                  ? [{ source: agentName, quote: String(rf.evidence) }]
                  : [{ source: agentName }],
                category,
              });
            }
          }
        }
      }
    }

    const summary = dedup.getSummary();
    if (summary.totalConsolidated === 0) {
      return "Aucun red flag détecté par les agents Tier 1.";
    }

    return dedup.formatForPrompt();
  }

  private buildTier1Synthesis(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};
    let totalAgents = 0;
    let successfulAgents = 0;
    let totalScore = 0;
    let scoreCount = 0;
    let lowestScore = { agent: "", score: 100 };
    let highestScore = { agent: "", score: 0 };

    const tier1Agents = [
      "deck-forensics", "financial-auditor", "team-investigator", "market-intelligence",
      "competitive-intel", "exit-strategist", "tech-stack-dd", "tech-ops-dd", "legal-regulatory",
      "gtm-analyst", "customer-intel", "cap-table-auditor", "question-master"
    ];

    for (const agentName of tier1Agents) {
      totalAgents++;
      const result = results[agentName];

      if (result?.success) {
        successfulAgents++;

        if ("data" in result && result.data) {
          const data = result.data as Record<string, unknown>;
          let score: number | undefined;

          // Try to extract score
          if (typeof data.score === "object" && data.score !== null) {
            const scoreObj = data.score as Record<string, unknown>;
            if (typeof scoreObj.value === "number") score = scoreObj.value;
          } else if (typeof data.overallScore === "number") {
            score = data.overallScore;
          } else if (typeof data.capTableScore === "number") {
            score = data.capTableScore;
          }

          if (score !== undefined) {
            totalScore += score;
            scoreCount++;

            if (score < lowestScore.score) {
              lowestScore = { agent: agentName, score };
            }
            if (score > highestScore.score) {
              highestScore = { agent: agentName, score };
            }
          }
        }
      }
    }

    const avgScore = scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0;
    const completeness = Math.round((successfulAgents / totalAgents) * 100);

    return `**Agents analysés**: ${successfulAgents}/${totalAgents} (${completeness}% completeness)
**Score moyen**: ${avgScore}/100
**Plus haut score**: ${highestScore.agent} (${highestScore.score}/100)
**Plus bas score**: ${lowestScore.agent} (${lowestScore.score}/100)

${completeness < 70 ? "⚠️ **ATTENTION**: Données incomplètes, confiance réduite" : "✅ Données suffisantes pour une analyse fiable"}`;
  }

  private extractTier2Data(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};

    // Look for sector expert results
    const sectorExperts = [
      "saas-expert", "fintech-expert", "marketplace-expert", "ai-expert",
      "healthtech-expert", "deeptech-expert", "climate-expert", "consumer-expert",
      "hardware-expert", "gaming-expert", "general-expert"
    ];

    for (const expert of sectorExperts) {
      const result = results[expert];
      if (result?.success && "data" in result && result.data) {
        const data = result.data as Record<string, unknown>;

        // Extract key info
        const sectorScore = (data.executiveSummary as Record<string, unknown>)?.sectorScore ??
                          (data.sectorFit as Record<string, unknown>)?.score ?? "N/A";
        const verdict = (data.executiveSummary as Record<string, unknown>)?.verdict ?? "N/A";
        const topStrengths = (data.executiveSummary as Record<string, unknown>)?.topStrengths ?? [];
        const topConcerns = (data.executiveSummary as Record<string, unknown>)?.topConcerns ?? [];

        return `**Expert**: ${expert}
**Score sectoriel**: ${sectorScore}/100
**Verdict**: ${verdict}

**Top Strengths**:
${Array.isArray(topStrengths) ? topStrengths.map((s: string) => `- ${s}`).join("\n") : "N/A"}

**Top Concerns**:
${Array.isArray(topConcerns) ? topConcerns.map((c: string) => `- ${c}`).join("\n") : "N/A"}`;
      }
    }

    return "Aucun expert sectoriel Tier 2 n'a été exécuté.";
  }

  private formatCoherenceData(context: EnrichedAgentContext): string {
    const coherence = context.tier3CoherenceResult;

    if (!coherence) {
      return "Module de cohérence Tier 3 non exécuté.";
    }

    if (!coherence.adjusted) {
      return `**Score de cohérence**: ${coherence.coherenceScore}/100
✅ Aucun ajustement nécessaire — les agents Tier 3 sont cohérents entre eux.`;
    }

    let output = `**Score de cohérence PRÉ-AJUSTEMENT**: ${coherence.coherenceScore}/100
⚠️ **${coherence.adjustments.length} ajustements appliqués** aux scénarios pour corriger des incohérences inter-agents.

### Ajustements effectués
`;

    for (const adj of coherence.adjustments) {
      output += `- **[${adj.rule}]** ${adj.field}: ${adj.before} → ${adj.after} — ${adj.reason}\n`;
    }

    output += `
### Impact sur ton analyse
- Les scénarios que tu reçois ont DÉJÀ été ajustés par le module de cohérence
- Les scénarios marqués **adjusted: true** ont été modifiés par rapport à l'output original de scenario-modeler
- Les scénarios marqués **reliable: false** sont à interpréter avec prudence (scepticisme élevé)
- **IMPORTANT**: Ton score final doit être COHÉRENT avec ces scénarios ajustés. Un deal avec CATASTROPHIC > 60% ne peut PAS avoir un score > 55.
`;

    if (coherence.warnings.length > 0) {
      output += `\n### Avertissements\n`;
      for (const w of coherence.warnings) {
        output += `- ${w}\n`;
      }
    }

    return output;
  }

  private extractContradictions(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};
    const contradictionResult = results["contradiction-detector"];

    if (!contradictionResult?.success || !("data" in contradictionResult) || !contradictionResult.data) {
      return "Contradiction detector non exécuté.";
    }

    const data = contradictionResult.data as Record<string, unknown>;
    const contradictions = data.contradictions as Array<Record<string, unknown>> | undefined;
    const consistencyScore = data.consistencyScore as number | undefined;

    if (!contradictions || contradictions.length === 0) {
      return `**Score de cohérence**: ${consistencyScore ?? "N/A"}/100
Aucune incohérence majeure détectée entre les agents.`;
    }

    let output = `**Score de cohérence**: ${consistencyScore ?? "N/A"}/100
**${contradictions.length} incohérences détectées**:\n\n`;

    for (const c of contradictions.slice(0, 5)) {
      output += `- **${c.severity}**: ${c.topic}
  - Claim 1 (${(c.claim1 as Record<string, unknown>)?.agent}): ${(c.claim1 as Record<string, unknown>)?.statement}
  - Claim 2 (${(c.claim2 as Record<string, unknown>)?.agent}): ${(c.claim2 as Record<string, unknown>)?.statement}
  - Impact: ${c.impact}\n\n`;
    }

    return output;
  }

  private extractConditionsData(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};
    const conditionsResult = results["conditions-analyst"];

    if (!conditionsResult?.success || !("data" in conditionsResult) || !conditionsResult.data) {
      return "Conditions analyst non exécuté. Les conditions ne sont pas intégrées dans le scoring.";
    }

    const data = conditionsResult.data as Record<string, unknown>;
    const score = data.score as { value?: number; breakdown?: { criterion: string; score: number; justification: string }[] } | undefined;
    const findings = data.findings as Record<string, unknown> | undefined;
    const redFlags = data.redFlags as { severity?: string; title?: string }[] | undefined;
    const narrative = data.narrative as { oneLiner?: string } | undefined;

    const lines: string[] = [];

    // Score
    if (score?.value != null) {
      lines.push(`**Score conditions: ${score.value}/100**`);
      if (score.breakdown) {
        for (const b of score.breakdown) {
          lines.push(`- ${b.criterion}: ${b.score}/100 — ${b.justification}`);
        }
      }
    }

    // Source
    if (findings?.termsSource) {
      lines.push(`\n**Source des conditions**: ${findings.termsSource}`);
    }

    // Key findings
    if (findings?.valuation && typeof findings.valuation === "object") {
      const val = findings.valuation as Record<string, unknown>;
      lines.push(`\n**Valorisation**: ${val.verdict ?? "?"} — ${val.rationale ?? ""}`);
      if (val.percentileVsDB != null) lines.push(`  Percentile vs DB: P${val.percentileVsDB}`);
    }
    if (findings?.instrument && typeof findings.instrument === "object") {
      const inst = findings.instrument as Record<string, unknown>;
      lines.push(`**Instrument**: ${inst.assessment ?? "?"} — ${inst.rationale ?? ""}`);
    }
    if (findings?.protections && typeof findings.protections === "object") {
      const prot = findings.protections as Record<string, unknown>;
      lines.push(`**Protections**: ${prot.overallAssessment ?? "?"}`);
      const missing = prot.missingCritical as string[] | undefined;
      if (missing && missing.length > 0) {
        lines.push(`  Manquantes: ${missing.join(", ")}`);
      }
    }
    if (findings?.governance && typeof findings.governance === "object") {
      const gov = findings.governance as Record<string, unknown>;
      lines.push(`**Gouvernance**: ${gov.overallAssessment ?? "?"}`);
    }

    // Red flags
    if (redFlags && redFlags.length > 0) {
      lines.push(`\n**Red Flags conditions (${redFlags.length}):**`);
      for (const rf of redFlags.slice(0, 3)) {
        lines.push(`- [${rf.severity ?? "?"}] ${rf.title ?? "?"}`);
      }
    }

    // Narrative
    if (narrative?.oneLiner) {
      lines.push(`\n**Résumé**: ${narrative.oneLiner}`);
    }

    // Negotiation advice (summarized)
    const negoAdvice = (findings?.negotiationAdvice as { point: string; priority: string }[]) ?? [];
    if (negoAdvice.length > 0) {
      lines.push(`\n**Conseils de négociation (${negoAdvice.length}):**`);
      for (const a of negoAdvice.slice(0, 3)) {
        lines.push(`- [${a.priority}] ${a.point}`);
      }
    }

    return lines.length > 0
      ? lines.join("\n")
      : "Aucune donnée conditions disponible.";
  }

  private formatFundingDbContext(context: EnrichedAgentContext): string {
    const fundingDb = context.fundingDbContext ?? context.fundingContext;

    if (!fundingDb) {
      return "Aucune donnée Funding DB disponible pour cross-reference.";
    }

    let output = "";

    // Competitors from funding context
    if (fundingDb.competitors && Array.isArray(fundingDb.competitors) && fundingDb.competitors.length > 0) {
      output += `### Concurrents identifiés (${fundingDb.competitors.length})\n`;
      for (const comp of fundingDb.competitors.slice(0, 5)) {
        output += `- ${comp.name}: ${comp.totalFunding ? `€${Number(comp.totalFunding).toLocaleString()} levés` : "Funding inconnu"} (${comp.lastRound ?? "stage inconnu"})\n`;
      }
      output += "\n";
    }

    // Sector benchmarks
    if (fundingDb.sectorBenchmarks && typeof fundingDb.sectorBenchmarks === "object") {
      const benchmarks = fundingDb.sectorBenchmarks as Record<string, unknown>;
      output += `### Benchmarks secteur\n`;

      // Try to extract common benchmark fields
      const valuationMedian = benchmarks.valuationMedian ?? benchmarks.medianValuation;
      const arrMultiple = benchmarks.arrMultipleMedian ?? benchmarks.revenueMultiple;

      if (valuationMedian) {
        output += `- Valorisation médiane: €${Number(valuationMedian).toLocaleString()}\n`;
      }
      if (arrMultiple) {
        output += `- Multiple ARR médian: ${arrMultiple}x\n`;
      }
      output += "\n";
    }

    // Context Engine data if available
    const ce = context.contextEngine;
    if (ce?.dealIntelligence?.fundingContext) {
      const fc = ce.dealIntelligence.fundingContext;
      output += `\n### Tendance marché (${fc.period})\n`;
      output += `- Multiple valo: P25=${fc.p25ValuationMultiple}x, Median=${fc.medianValuationMultiple}x, P75=${fc.p75ValuationMultiple}x\n`;
      output += `- Tendance: ${fc.trend} (${fc.trendPercentage > 0 ? "+" : ""}${fc.trendPercentage}%)\n`;
      output += `- Deals analysés: ${fc.totalDealsInPeriod}\n`;
    }

    return output || "Données Funding DB limitées.";
  }

  private formatBAPreferences(prefs: BAPreferences | undefined, dealSector: string | null, dealStage: string | null): string {
    if (!prefs) {
      return "Aucune préférence BA configurée - utiliser les critères standards. Ne pas inférer de mismatch investisseur.";
    }

    const lines: string[] = [];

    // Ticket size
    lines.push(`**Ticket**: ${(prefs.typicalTicketPercent * 100).toFixed(0)}% du round (€${prefs.minTicketAmount.toLocaleString()} - €${prefs.maxTicketAmount.toLocaleString()})`);

    // Sector alignment
    if (dealSector) {
      const sectorLower = dealSector.toLowerCase();
      const isPreferred = prefs.preferredSectors.some(s => sectorLower.includes(s.toLowerCase()));
      const isExcluded = prefs.excludedSectors.some(s => sectorLower.includes(s.toLowerCase()));

      if (isExcluded) {
        lines.push(`**Secteur**: ⚠️ EXCLU POUR CE BA - ${dealSector} est dans les exclusions du BA. Information de fit, pas jugement intrinsèque sur le deal.`);
      } else if (isPreferred) {
        lines.push(`**Secteur**: ✅ PRÉFÉRÉ POUR CE BA - ${dealSector} match les préférences`);
      } else {
        lines.push(`**Secteur**: ℹ️ FIT NEUTRE - ${dealSector} (préférés: ${prefs.preferredSectors.join(", ")})`);
      }
    }

    // Stage alignment
    if (dealStage) {
      const isPreferredStage = prefs.preferredStages.some(s =>
        dealStage.toLowerCase().replace(/[^a-z]/g, "").includes(s.toLowerCase().replace(/[^a-z]/g, ""))
      );
      if (isPreferredStage) {
        lines.push(`**Stage**: ✅ PRÉFÉRÉ POUR CE BA - ${dealStage}`);
      } else {
        lines.push(`**Stage**: ℹ️ HORS PRÉFÉRENCES BA - ${dealStage} (préférés: ${prefs.preferredStages.join(", ")})`);
      }
    }

    // Risk tolerance
    const riskLabel = prefs.riskTolerance <= 2 ? "conservateur" : prefs.riskTolerance >= 4 ? "agressif" : "modéré";
    lines.push(`**Tolérance risque**: ${prefs.riskTolerance}/5 (${riskLabel})`);

    // Holding period
    lines.push(`**Horizon**: ${prefs.expectedHoldingPeriod} ans`);

    // Geography
    if (prefs.preferredGeographies.length > 0) {
      lines.push(`**Géographies**: ${prefs.preferredGeographies.join(", ")}`);
    }

    return lines.join("\n");
  }

  // ===========================================================================
  // RESPONSE TRANSFORMATION
  // ===========================================================================

  private transformResponse(data: LLMSynthesisResponse, context: EnrichedAgentContext): SynthesisDealScorerData {
    // Validate and normalize the response
    const validActions = ["very_favorable", "favorable", "contrasted", "vigilance", "alert_dominant"] as const;
    type SignalVerdict = typeof validActions[number];

    // Map legacy action/verdict formats to new signal profiles
    const actionMapping: Record<string, typeof validActions[number]> = {
      "STRONG_INVEST": "very_favorable",
      "INVEST": "favorable",
      "CONSIDER": "contrasted",
      "PASS": "vigilance",
      "STRONG_PASS": "alert_dominant",
      // Identity mappings for new format
      "very_favorable": "very_favorable",
      "favorable": "favorable",
      "contrasted": "contrasted",
      "vigilance": "vigilance",
      "alert_dominant": "alert_dominant",
    };

    // Phase A slice A2 — Priorité de lecture orientation :
    //   1. `data.orientation` (chemin Phase A natif, top-level — aligné schema A2)
    //   2. `data.verdict` racine (forme alternative LLM pré-Phase-A — raw cast
    //      pour couvrir AUSSI les valeurs legacy `STRONG_PASS`/`PASS` qui ne
    //      satisfont pas le type strict `Tier3Orientation`)
    //   3. fallback chemins LLM dégradés (findings.recommendation, investmentRecommendation, recommendation)
    // Le `actionMapping` normalise une éventuelle valeur legacy (STRONG_PASS, etc.)
    // vers orientation native (parser tolérant de lecture seule, D1).
    const rawRootVerdict = (data as { verdict?: string }).verdict;
    const rawAction = data.orientation
      ?? rawRootVerdict
      ?? data.findings?.recommendation?.action
      ?? data.investmentRecommendation?.action
      ?? data.recommendation?.action;
    let mappedAction = actionMapping[rawAction as string] ??
                        (validActions.includes(rawAction as typeof validActions[number]) ? rawAction : "vigilance");

    // Extract dimension scores with backward compatibility
    const rawDimensionData = data.score?.breakdown ?? data.dimensionScores ?? [];
    const dimensionScores = rawDimensionData.map((d) => {
      // Handle both formats: breakdown (criterion/justification) and dimensionScores (dimension/keyFactors)
      const dAny = d as Record<string, unknown>;
      const dimensionName = (dAny.criterion ?? dAny.dimension ?? "Unknown") as string;
      const scoreVal = (dAny.score as number) != null ? Math.min(100, Math.max(0, dAny.score as number)) : 0;
      const rawWeight = (dAny.weight as number) ?? 0;
      const weightVal = normalizeDimensionWeight(rawWeight);
      const justificationVal = dAny.justification as string | undefined;

      return {
        dimension: dimensionName,
        score: scoreVal,
        weight: weightVal,
        weightedScore: Math.round(scoreVal * weightVal),
        sourceAgents: (dAny.sourceAgents as string[]) ?? [],
        keyFactors: (dAny.keyFactors as string[]) ?? (justificationVal ? [justificationVal] : []),
      };
    });

    // Score logic:
    // 1. If LLM produced dimensions, compute weighted average from them
    // 2. Compare LLM's overall score with its own dimensional breakdown
    // 3. If divergence is too large, prefer the dimensional computation (LLM showed its work)
    // 4. If no dimensions at all (retry also failed), use LLM's raw score
    const llmScore = data.score?.value ?? data.overallScore;
    let overallScore: number;

    if (dimensionScores.length > 0) {
      const computedWeighted = Math.round(
        dimensionScores.reduce((sum, d) => sum + d.weightedScore, 0)
      );

      if (llmScore != null) {
        const divergence = Math.abs(llmScore - computedWeighted);
        if (divergence > 15) {
          // LLM score diverges significantly from its own dimensional breakdown.
          // Always prefer the computed weighted average — the LLM showed its work
          // in the dimensions, the overall score is often influenced by subjective
          // "gut feeling" adjustments that create instability between runs.
          console.warn(
            `[SynthesisDealScorer] LLM score (${llmScore}) diverges from its own dimensions (${computedWeighted}) by ${divergence} pts — using weighted average`
          );
          overallScore = computedWeighted;
        } else {
          overallScore = llmScore;
        }
      } else {
        overallScore = computedWeighted;
      }
    } else {
      // No dimensions even after retry — use LLM's raw score (last resort)
      overallScore = llmScore ?? 0;
      if (overallScore === 0 && llmScore == null) {
        console.warn(`[SynthesisDealScorer] No dimensions and no LLM score — defaulting to 0`);
      }
    }

    // Extract key strengths/weaknesses
    // IMPORTANT: topStrengths is explicitly "strengths" from the LLM.
    // keyInsights are generic insights (can be negative) — only use as last resort.
    const keyStrengths = data.findings?.topStrengths?.map(s => typeof s === "string" ? s : s.strength) ??
                        data.keyStrengths ??
                        data.narrative?.keyInsights?.slice(0, 3) ??
                        [];

    const keyWeaknesses = data.findings?.topWeaknesses?.map(w => typeof w === "string" ? w : w.weakness) ??
                         data.keyWeaknesses ?? [];

    // Extract critical risks from red flags
    const criticalRisks = (data.redFlags ?? [])
      .filter(rf => rf.severity === "CRITICAL")
      .map(rf => {
        const rfAny = rf as Record<string, unknown>;
        return (rfAny.title ?? rfAny.description ?? rfAny.flag ?? rfAny.risk ?? rfAny.issue ?? rfAny.impact) as string | undefined;
      })
      .filter((text): text is string => !!text && text !== "");

    // Verdict is ALWAYS derived from the score — never trust the LLM verdict alone
    // The LLM verdict can contradict low scores; derive the signal profile from score.
    const scoreBasedVerdict = (score: number): SignalVerdict => {
      if (score >= 85) return "very_favorable";
      if (score >= 70) return "favorable";
      if (score >= 55) return "contrasted";
      if (score >= 40) return "vigilance";
      return "alert_dominant";
    };
    let finalOverallScore = Math.round(Math.min(100, Math.max(0, overallScore)));

    // =========================================================================
    // POST-LLM COHERENCE VALIDATION (in code, not prompt)
    // =========================================================================

    // Rule 1: If alertSignal shows dominant alerts AND skepticism > 80 → cap score at 40
    const alertRec = data.alertSignal?.recommendation?.toLowerCase() ?? "";
    const isAlertDominant = alertRec.includes("alert_dominant") || alertRec === "stop";
    const daResult = context.previousResults?.["devils-advocate"];
    const daData = daResult?.success && daResult && "data" in daResult && daResult.data
      ? daResult.data as Record<string, unknown>
      : null;
    const daFindings = daData?.findings as Record<string, unknown> | undefined;
    const skepticismAssessment = daFindings?.skepticismAssessment as { score?: number } | undefined;
    const skepticismScore = skepticismAssessment?.score ?? 0;

    if (isAlertDominant && skepticismScore > 80 && finalOverallScore > 40) {
      console.warn(
        `[SynthesisDealScorer] Coherence cap: alertSignal="${alertRec}" + skepticism=${skepticismScore} → capping score from ${finalOverallScore} to 40`
      );
      finalOverallScore = 40;
    }

    // Rule 2: If score > 85 but has CRITICAL red flags → cap at 70
    if (finalOverallScore > 85 && criticalRisks.length > 0) {
      console.warn(
        `[SynthesisDealScorer] Coherence cap: score=${finalOverallScore} with ${criticalRisks.length} CRITICAL red flags → capping at 70`
      );
      finalOverallScore = 70;
    }

    // P1 Rule 3: Penalite contractStatus — un Tier1 retourne PARTIAL_UNVERIFIED
    // quand son output LLM manque des champs de contrat (benchmarks vides,
    // dimensions manquantes, etc.). Ces agents ne doivent PAS peser autant qu'un
    // output VALID dans le score global. On applique -2 pts par agent partiel
    // (cap a -10) + on baisse la confidence.
    // FIX (audit P1 #9) : thesis-extractor est maintenant dans la liste des contributeurs
    // soumis a la contract penalty. Si l'extracteur retourne PARTIAL_UNVERIFIED
    // (ex: loadBearing vide, alerts manquant), meme penalite -2 pts que les Tier 1.
    const tier1Contributors = [
      "financial-auditor", "team-investigator", "competitive-intel",
      "market-intelligence", "tech-stack-dd", "tech-ops-dd",
      "legal-regulatory", "gtm-analyst", "customer-intel",
      "exit-strategist", "deck-forensics", "cap-table-auditor", "question-master",
      "thesis-extractor", "thesis-reconciler",
    ];
    const partialAgents: string[] = [];
    for (const name of tier1Contributors) {
      const r = context.previousResults?.[name];
      if (!r) continue;
      const status = (r as { contractStatus?: string }).contractStatus;
      if (status === "PARTIAL_UNVERIFIED") partialAgents.push(name);
    }
    if (partialAgents.length > 0) {
      const penalty = Math.min(10, partialAgents.length * 2);
      const prior = finalOverallScore;
      finalOverallScore = Math.max(0, finalOverallScore - penalty);
      console.warn(
        `[SynthesisDealScorer] Contract penalty: ${partialAgents.length} agents PARTIAL_UNVERIFIED (${partialAgents.join(", ")}) → -${penalty} pts (${prior} → ${finalOverallScore})`
      );
    }

    // Rule 4: Thesis meta-gate — si la these (Tier 0.5) a ete jugee fragile
    // (alert_dominant ou vigilance) ET le BA n'a pas explicitement bypass,
    // on applique un cap de 50/100 pour interdire le faux confort d'un 72/100
    // alors que la these ne tient pas. Le verdict UI affichera en plus une
    // notice "Score non applicable — these non validee".
    // Source: context.thesis est injecte par orchestrator via EnrichedAgentContext
    // Source: context.analysis.thesisBypass: BA a choisi "continue" malgre these fragile
    const thesisCtx = (context as unknown as { thesis?: { verdict?: string } }).thesis;
    const analysisCtx = (context as unknown as { analysis?: { thesisBypass?: boolean } }).analysis;
    const thesisVerdict = thesisCtx?.verdict ?? null;
    const thesisBypass = analysisCtx?.thesisBypass ?? false;
    const fragileThesis = thesisVerdict === "alert_dominant" || thesisVerdict === "vigilance";
    if (fragileThesis && !thesisBypass && finalOverallScore > 50) {
      console.warn(
        `[SynthesisDealScorer] Thesis meta-gate: thesisVerdict="${thesisVerdict}" + !bypass → capping score from ${finalOverallScore} to 50`
      );
      finalOverallScore = 50;
    }

    // =========================================================================

    const finalVerdict = scoreBasedVerdict(finalOverallScore);

    // If the score was overridden by the guard-fou, patch any mention of the old
    // LLM score in the narrative/rationale text fields to avoid contradictions
    // between the displayed score and the text (e.g. score=46 but text says "21/100").
    const scoreWasOverridden = llmScore != null && finalOverallScore !== llmScore;
    const patchScoreInText = (text: string): string => {
      if (!scoreWasOverridden || !text) return text;
      // Replace patterns like "21/100", "score de 21", "score: 21", "score est de 21"
      const llmStr = String(llmScore);
      return text
        .replace(new RegExp(`\\b${llmStr}/100\\b`, "g"), `${finalOverallScore}/100`)
        .replace(new RegExp(`score\\s+(?:de|est de|final(?:\\s+est)?\\s+de|:)\\s+${llmStr}\\b`, "gi"), (match) =>
          match.replace(llmStr, String(finalOverallScore))
        );
    };

    // Enforce action/verdict coherence — action should align with verdict signal profile
    if (finalVerdict === "alert_dominant" && mappedAction !== "alert_dominant") {
      console.warn(`[SynthesisDealScorer] Action "${mappedAction}" incoherent with verdict "${finalVerdict}" — forcing "alert_dominant"`);
      mappedAction = "alert_dominant";
    }
    if (finalVerdict === "very_favorable" && mappedAction === "alert_dominant") {
      mappedAction = "very_favorable";
    }

    // Extract rationale and patch score references if needed
    const rawRationale = data.findings?.recommendation?.rationale ??
                        data.investmentRecommendation?.rationale ??
                        data.investmentThesis?.summary ??
                        data.recommendation?.rationale ??
                        "Analyse complétée — consultez les scores par dimension pour le détail.";

    // P1 — Si des agents Tier1 sont en PARTIAL_UNVERIFIED, baisser la confidence
    // rapportee et injecter un keyWeakness explicite.
    const rawConfidence = (data.meta?.confidenceLevel ?? data.confidence) != null
      ? Math.min(100, Math.max(0, (data.meta?.confidenceLevel ?? data.confidence)!))
      : 0;
    const confidencePenalty = partialAgents.length * 5;
    const finalConfidence = Math.max(0, rawConfidence - confidencePenalty);
    if (partialAgents.length > 0) {
      keyWeaknesses.unshift(
        `${partialAgents.length} agent${partialAgents.length > 1 ? "s" : ""} Tier1 en contrat partiel: ${partialAgents.slice(0, 3).join(", ")}${partialAgents.length > 3 ? "..." : ""}. Analyse complete mais donnees structurantes manquantes.`
      );
    }

    return {
      overallScore: finalOverallScore,
      verdict: finalVerdict,
      confidence: finalConfidence,
      dimensionScores,
      // scoreBreakdown is DERIVED from dimensionScores — never trust LLM's self-reported
      // adjustments (it fabricates post-hoc justifications for its gut-feeling score).
      scoreBreakdown: {
        strengthsContribution: dimensionScores
          .filter(d => d.score >= 60)
          .reduce((sum, d) => sum + Math.round((d.score - 50) * d.weight), 0),
        weaknessesDeduction: Math.abs(dimensionScores
          .filter(d => d.score < 40)
          .reduce((sum, d) => sum + Math.round((d.score - 50) * d.weight), 0)),
        riskAdjustment: 0,
        opportunityBonus: 0,
      },
      comparativeRanking: {
        percentileOverall: data.findings?.marketPosition?.percentileOverall ??
                          data.comparativeRanking?.percentileOverall ?? 0,
        percentileSector: data.findings?.marketPosition?.percentileSector ??
                         data.comparativeRanking?.percentileSector ?? 0,
        percentileStage: data.findings?.marketPosition?.percentileStage ??
                        data.comparativeRanking?.percentileStage ?? 0,
        similarDealsAnalyzed: data.findings?.marketPosition?.similarDealsAnalyzed ??
                             data.comparativeRanking?.similarDealsAnalyzed ?? 0,
        method: data.comparativeRanking?.method,
        insufficientData: data.comparativeRanking?.insufficientData,
        calculationDetail: data.comparativeRanking?.calculationDetail,
      },
      investmentRecommendation: {
        action: mappedAction as "very_favorable" | "favorable" | "contrasted" | "vigilance" | "alert_dominant",
        rationale: patchScoreInText(rawRationale),
        conditions: data.findings?.recommendation?.conditions ??
                   data.investmentRecommendation?.conditions ??
                   data.recommendation?.conditions,
        suggestedTerms: data.findings?.recommendation?.suggestedTerms ??
                       data.investmentRecommendation?.suggestedTerms ??
                       data.recommendation?.suggestedTerms,
      },
      keyStrengths: Array.isArray(keyStrengths) ? keyStrengths.slice(0, 5) : [],
      keyWeaknesses: Array.isArray(keyWeaknesses) ? keyWeaknesses.slice(0, 5) : [],
      criticalRisks: Array.isArray(criticalRisks) ? criticalRisks.slice(0, 3) : [],
      // Phase A slice A2 — Contribution Tier 3 (D1 + D2 verrouillés).
      // - orientation : strictement alignée sur `finalVerdict` (déterministe).
      // - evidenceSolidity : null en A2 — sera renseigné par le service
      //   Solidité en A6 (D2 : `contradictory` / `insufficient` / null seulement,
      //   aucun mapping depuis score/confidence).
      // - score : score final agrégé (secondaire, dimensionnel).
      // - criticalRisks : refs constructibles depuis les flags CRITICAL.
      // Phase A slice A6 — evidenceSolidity dérivé déterministe depuis le
      // service Evidence Solidity (jamais fabriqué depuis score/confidence).
      signalContribution: this.buildSignalContribution(finalVerdict, finalOverallScore, context),
    };
  }

  /**
   * Phase A slice A6 — Construction de signalContribution avec qualification
   * evidenceSolidity via le service déterministe.
   *
   * D2 verrouillé : `value` ∈ {`contradictory`, `insufficient`, null}.
   * Le service ne lit JAMAIS score / overallScore / confidence
   * (cf. source-guard `no-confidence-input.guard.test.ts`).
   */
  private buildSignalContribution(
    orientation: Tier3Orientation,
    score: number,
    context: EnrichedAgentContext,
  ): Tier3SignalContribution {
    const solidity = buildEvidenceSolidityForContext(context);
    const base: Tier3SignalContribution = {
      orientation,
      evidenceSolidity: solidity.value,
      score,
    };
    if (solidity.value !== null && solidity.rationale) {
      base.evidenceSolidityRationale = solidity.rationale;
    }
    return base;
  }
}

// =============================================================================
// LLM RESPONSE INTERFACE (internal)
// =============================================================================

/**
 * Phase A slice A2 — Contrat runtime LLMSynthesisResponse
 *
 * D1 verrouillé : tous les champs `verdict` et `action` sont typés
 * `Tier3Orientation` natif. **Aucun champ legacy contractuel** (pas de
 * `verdict?: string` libre, pas de `action: string` libre).
 *
 * Le `transformResponse` consomme cette interface après JSON.parse de la
 * sortie LLM. Si le LLM produit encore un format dégradé (`STRONG_PASS` etc.),
 * le code lit la donnée brute via casts explicites (`as string`) et la mappe
 * via `actionMapping` (parser tolérant de lecture LLM dégradée). Le typage
 * strict de l'interface documente l'intent contractuel et empêche toute
 * consommation directe d'une valeur non-orientation.
 *
 * Note `alertSignal.recommendation` : ce champ reste typé string libre en
 * A2 car il fait partie du contrat partagé `AgentAlertSignal` (cf.
 * `src/agents/types.ts`). La migration de ce contrat partagé vers
 * `signalIntensity` est documentée comme **dépendance bloquante cross-slice**
 * (cf. Plan §A7b Tier 1 + A4-bis CD/CA — slice cross-agent dédié requis).
 * En A2 strict : output natif uniquement côté `verdict`/`action`, mais
 * `alertSignal.recommendation` reste legacy partagé.
 */
interface LLMSynthesisResponse {
  /**
   * Phase A slice A2 — Champ top-level natif orientation (chemin Phase A
   * native). Si le LLM produit `orientation` directement (cf. prompt JSON
   * template), le `transformResponse` le lit en priorité absolue avant tout
   * fallback dégradé (chemins `findings.recommendation.action`, etc.).
   * Aligne avec `SynthesisDealScorerResponseSchema.orientation`.
   */
  orientation?: Tier3Orientation;
  meta?: {
    agentName: string;
    analysisDate: string;
    dataCompleteness: "complete" | "partial" | "minimal";
    confidenceLevel: number;
    limitations: string[];
  };
  score?: {
    value: number;
    grade: "A" | "B" | "C" | "D" | "F";
    breakdown: {
      criterion: string;
      weight: number;
      score: number;
      justification: string;
      sourceAgents?: string[];
      keyFactors?: string[];
    }[];
  };
  findings?: {
    dimensionScores?: Array<{
      dimension: string;
      weight: number;
      rawScore: number;
      adjustedScore: number;
      weightedScore: number;
      sourceAgents: string[];
    }>;
    scoreBreakdown?: {
      baseScore: number;
      adjustments: { type: string; reason: string; impact: number; source: string }[];
      finalScore: number;
      calculationShown: string;
    };
    marketPosition?: {
      percentileOverall: number;
      percentileSector: number;
      percentileStage: number;
      valuationAssessment: string;
      similarDealsAnalyzed: number;
      comparableDeals?: Array<{ name: string; score: number; valuation: number }>;
    };
    recommendation?: {
      action: Tier3Orientation;
      verdict: Tier3Orientation;
      rationale: string;
      conditions?: string[];
      suggestedTerms?: string;
    };
    topStrengths?: Array<{ strength: string; evidence: string; sourceAgent: string } | string>;
    topWeaknesses?: Array<{ weakness: string; evidence: string } | string>;
  };
  dbCrossReference?: {
    claims: { claim: string; location: string; dbVerdict: string; evidence: string }[];
    uncheckedClaims: string[];
  };
  redFlags?: Array<{
    id: string;
    category: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
    title: string;
    description: string;
    location: string;
    evidence: string;
    impact: string;
    question: string;
  }>;
  alertSignal?: {
    hasBlocker: boolean;
    blockerReason?: string;
    /**
     * Contrat partagé `AgentAlertSignal.recommendation` — string en A2
     * pour cohérence avec Tier 1 / CD / CA non encore migrés. Migration
     * cross-agent vers `signalIntensity` documentée comme dépendance
     * bloquante (Plan §A7b + A4-bis).
     */
    recommendation: string;
    justification: string;
  };
  narrative?: {
    oneLiner: string;
    summary: string;
    keyInsights: string[];
    forNegotiation: string[];
  };
  // Forme alternative produite par certains chemins LLM/Zod (la donnée
  // peut arriver soit dans `findings.recommendation`, soit directement
  // au niveau racine sous `recommendation`). Typé natif Tier3Orientation
  // pour `action` — D1 verrouillé, pas de string libre legacy.
  recommendation?: {
    action: Tier3Orientation;
    rationale?: string;
    conditions?: string[];
    nextSteps?: string[];
    suggestedTerms?: string;
  };
  investmentThesis?: {
    summary: string;
    strengths: string[];
    weaknesses: string[];
    keyRisks: string[];
    keyOpportunities: string[];
  };
  // Forme alternative LLM (chemin pré-Phase-A : certains modèles
  // produisaient directement la forme runtime `SynthesisDealScorerData`).
  // Champs typés natif Tier3Orientation — D1 verrouillé, pas de string
  // libre. Si le LLM produit une valeur dégradée (STRONG_PASS etc.), le
  // `transformResponse` la lit via cast explicite (`as string`) et la
  // mappe via `actionMapping` (parser tolérant lecture seule).
  overallScore?: number;
  verdict?: Tier3Orientation;
  confidence?: number;
  dimensionScores?: Array<{
    dimension: string;
    score: number;
    weight: number;
    weightedScore: number;
    sourceAgents: string[];
    keyFactors: string[];
  }>;
  scoreBreakdown?: {
    strengthsContribution: number;
    weaknessesDeduction: number;
    riskAdjustment: number;
    opportunityBonus: number;
  };
  comparativeRanking?: {
    percentileOverall: number;
    percentileSector: number;
    percentileStage: number;
    similarDealsAnalyzed: number;
    method?: "EXACT" | "INTERPOLATED" | "INSUFFICIENT_DATA" | "UNAVAILABLE";
    insufficientData?: boolean;
    calculationDetail?: string;
  };
  investmentRecommendation?: {
    action: Tier3Orientation;
    rationale: string;
    conditions?: string[];
    suggestedTerms?: string;
  };
  keyStrengths?: string[];
  keyWeaknesses?: string[];
  criticalRisks?: string[];
}

function normalizeDimensionWeight(weight: number): number {
  if (!Number.isFinite(weight) || weight <= 0) return 0;
  return weight > 1 ? weight / 100 : weight;
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const synthesisDealScorer = new SynthesisDealScorerAgent();
