/**
 * SYNTHESIS DEAL SCORER - TIER 3 - REFONTE v2.0
 *
 * Mission: Produire le SCORE FINAL et la RECOMMANDATION d'investissement
 *          en synthétisant TOUS les outputs Tier 1 (12 agents) et Tier 2 (expert sectoriel)
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
 * - Tous les résultats Tier 1 (12 agents)
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
import { RedFlagDedup, inferRedFlagTopic, severityRank } from "@/services/red-flag-dedup";
import type { RedFlagSeverity, ConsolidatedRedFlag } from "@/services/red-flag-dedup";
import { SYNTHESIS_DEAL_SCORER_SYSTEM_PROMPT } from "./prompts/synthesis-deal-scorer-prompt";
import { buildEvidenceSolidityForContext } from "@/services/evidence-solidity";
import {
  toDoctrineOrientation,
  deriveSynthesisSignalIntensity,
  deriveScoreIndependentOrientation,
  decideNotExploitable,
  deepStripScoreMentions,
  DOCTRINE_ORIENTATION_CONFIG,
} from "@/services/signal-profile";
import type {
  AnalysisSignalProfile,
  DominantSignal,
  DimensionCoverage,
} from "@/services/signal-profile";
import type { CriticalRiskRef } from "./schemas/common";

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
  /**
   * Chantier P5-b — Champs de NOTE DE DEAL PURGÉS du type : overallScore /
   * confidence / dimensionScores / scoreBreakdown / comparativeRanking.
   * Production retirée en P4 (`transformResponse` ne les émet plus), restitution
   * scoreless en P3. D'anciens snapshots stepwise / analyses historiques les
   * portent encore mais sont lus défensivement (cast Record), jamais via ce
   * type. P5-c droppe les colonnes DB correspondantes.
   *
   * `verdict` : profil de signal Phase A — type unifié `Tier3Orientation`
   * (équivalent structurel à l'union string littérale précédente). Cf.
   * `src/agents/types.ts` et `src/agents/tier3/schemas/common.ts:Tier3OrientationSchema`.
   */
  verdict: Tier3Orientation;
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
  /**
   * Chantier P2 — Profil de signal SCORELESS (contrat de restitution dé-scorisé).
   *
   * `orientation` (4 valeurs doctrine) + solidité + signaux dominants +
   * couverture par dimension + risques critiques, DÉRIVÉS sans aucun score
   * numérique. Détecté par le bi-reader `readDoctrineOrientation` (présence de
   * `dominantSignals` + `dimensionCoverage`). Chantier P4 : les champs
   * `overallScore` / `dimensionScores` / `scoreBreakdown` / `comparativeRanking`
   * / `confidence` ne sont PLUS émis (production retirée) — seul ce profil
   * scoreless et `verdict` pilotent l'orientation restituée.
   */
  signalProfile: AnalysisSignalProfile;
}

export interface SynthesisDealScorerResult extends AgentResult {
  agentName: "synthesis-deal-scorer";
  data: SynthesisDealScorerData;
}

// =============================================================================
// AGENT IMPLEMENTATION
// =============================================================================

/**
 * Budget wall-clock des appels LLM de synthèse (dé-scorisation P2-d, fix racine de la
 * boucle 300s). L'invocation Vercel du step `synthesis-deal-scorer` porte la réhydratation
 * du snapshot stepwise + execute() + l'écriture du snapshot suivant. Sans bornage PAR APPEL,
 * un seul appel LLM (jusqu'à 3 tentatives router + fallback model-aware implicite = une
 * génération complète de plus sur un autre modèle) pouvait consommer tout le budget 300s →
 * kill Vercel mid-write → boucle de retries Inngest (post-mortem cmq9lg9un…).
 *
 * - `timeoutMs: 100_000` borne CHAQUE appel. Chantier P4 : execute() ne fait plus
 *   qu'UN seul appel LLM (retry « dimensions » + post-traitement F37 retirés) →
 *   1×100s ≪ config.timeoutMs 220s, marge anti-boucle 300s renforcée.
 * - `disableModelFallback: true` coupe le failover cross-modèle long (cf. reconciler 6752c9e).
 * - `maxRetries: 1` borne le retry router same-model (2 tentatives partageant les 100s).
 *
 * config.timeoutMs (220_000, < plafond Vercel 300s) garde la marge pour rehydrate/write snapshot.
 */
const SYNTHESIS_LLM_CALL_OPTIONS = {
  timeoutMs: 100_000,
  disableModelFallback: true,
  maxRetries: 1,
} as const;

export class SynthesisDealScorerAgent extends BaseAgent<SynthesisDealScorerData, SynthesisDealScorerResult> {
  constructor() {
    super({
      name: "synthesis-deal-scorer",
      description: "Synthèse finale: orientation du signal + recommandation analytique basée sur tous les agents",
      modelComplexity: "complex",
      maxRetries: 2,
      // Dé-scorisation P2-d : 220s < plafond Vercel 300s → le timeout gracieux de run()
      // gagne la course contre le kill plateforme et laisse écrire le snapshot avant 300s
      // (fix racine boucle Inngest). Bornage par appel : SYNTHESIS_LLM_CALL_OPTIONS.
      timeoutMs: 220000,
      dependencies: [
        // Tier 1 - Analysis agents
        "deck-forensics",
        "financial-auditor",
        "team-investigator",
        "market-intelligence",
        "competitive-intel",
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

    // Build comprehensive prompt with all context. Chantier descorisation (B2) :
    // plus de pondérations par dimension injectées — le LLM ne calcule plus de
    // moyenne pondérée (orientation dérivée déterministiquement en aval).
    const dealContext = this.formatDealContext(context);
    const tier1Signals = this.extractTier1Signals(context);
    const tier1RedFlags = this.extractTier1RedFlags(context);
    const tier1Synthesis = this.buildTier1Synthesis(context);
    const tier2Data = this.extractTier2Data(context);
    const fundingDbContext = this.formatFundingDbContext(context);
    const baPrefsSection = this.formatBAPreferences(context.baPreferences, deal.sector, deal.stage);
    const contradictions = this.extractContradictions(context);
    const conditionsSection = this.extractConditionsData(context);

    // F23: Build deal source analysis section
    const dealSourceSection = this.buildDealSourceSection(context);

    const prompt = `# ANALYSE SYNTHESIS DEAL SCORER - ${deal.companyName ?? deal.name}

## INFORMATIONS DEAL
${dealContext}

---

## SIGNAUX TIER 1 (12 agents)
${tier1Signals}

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

1. **SYNTHÉTISE LES SIGNAUX CROSS-TIERS** — consolide les forces et les signaux d'alerte par dimension, chacun SOURCÉ (agent d'origine), après prise en compte de l'expert sectoriel, des contradictions et du devil's advocate.

2. **CROSS-RÉFÉRENCE LA DB** (lorsque la donnée existe) :
   - Percentile de valorisation vs deals comparables du secteur (métrique observable)
   - Vérification des claims concurrentiels

3. **CONSTRUIS LA RATIONALE** — 2-3 phrases : signaux favorables vs signaux d'alerte dominants, sourcés. Le bull case et le bear case nourrissent la rationale ; les conditions = points à clarifier.

4. **LISTE LES NEXT STEPS / QUESTIONS** — actions concrètes d'investigation/clarification (jamais de directive d'action).

5. **SEPARE EXPLICITEMENT LES AXES**:
   - Qualite intrinsèque du deal / de la these
   - Investor profile fit (préférences, mandat, ticket, horizon)
   - Deal accessibility (ticket minimum, allocation, structure, liquidité)
   - Un mismatch BA ne doit jamais, a lui seul, dégrader les dimensions fondamentales ni le verdict thesis-first.

---

## RAPPELS CRITIQUES

⚠️ **SOURCE CHAQUE AFFIRMATION** - Cite l'agent qui a fourni la donnée
⚠️ **SOIS INFORMATIF** — Signaux clairs et sourcés, le BA décide
⚠️ **CONSOLIDE LES RED FLAGS** - Ne répète pas, synthétise avec priorité
⚠️ **ADAPTE AU PROFIL BA** - Tiens compte de ses préférences dans les conditions et le narratif, sans confondre cela avec la qualité intrinsèque du deal
⚠️ **RESPECTE LA COHÉRENCE TIER 3** - Si les risques critiques ont été ajustés (section COHÉRENCE INTER-AGENTS / contradictions), ta synthèse DOIT être alignée : un deal aux signaux d'alerte dominants avec un fort scepticisme ne doit pas être présenté comme favorable.
⚠️ **NE CONFONDS PAS FIT ET QUALITÉ** — ticket minimum, secteur hors mandat BA, ou horizon peu adapté au profil investisseur doivent etre surfaces comme \`conditions\`, pas comme preuve que la these est faible.

**CONCISION OBLIGATOIRE (JSON sera INVALIDE si tronque):**
- topStrengths / topWeaknesses: 4-8 chacun (priorisés par importance), conditions: MAX 5
- redFlags: MAX 6, keyInsights: MAX 4
- rationale: 2-3 phrases, oneLiner: 15 mots MAX
- PRIORITE: JSON complet > detail

Produis le JSON complet selon le format spécifié dans le system prompt.`;

    // Chantier P4 — un SEUL appel LLM. L'ancien retry « dimensions » re-promptait
    // le modèle pour obtenir `score.breakdown`, qui alimentait l'ancien
    // overallScore/dimensionScores. La dérivation est désormais 100% scoreless
    // (orientation + signalProfile dérivés des red flags consolidés + couverture
    // + solidité), donc relancer pour ce breakdown n'a plus d'objet. Aligné avec
    // le budget deadline-aware P2-d (un appel borné, pas de seconde génération).
    //
    // Fallback DÉTERMINISTE (chantier fallback SDS) : si l'appel LLM échoue
    // (timeout 100s SYNTHESIS_LLM_CALL_OPTIONS / erreur modèle), on ne propage
    // PAS l'échec (success:false → « analyse partielle » alors que les 12 agents
    // ont produit des données). On restitue l'orientation scoreless dérivée 100%
    // du contexte via une synthèse de signaux propre et lisible
    // (buildFallbackSynthesis). Le log ops permet de surveiller le taux de
    // fallback. `transformResponse` (chemin nominal) reste hors du try : seul
    // l'échec de l'APPEL LLM déclenche le repli, pas un bug de transformation.
    let data: LLMSynthesisResponse;
    try {
      ({ data } = await this.llmCompleteJSON<LLMSynthesisResponse>(prompt, SYNTHESIS_LLM_CALL_OPTIONS));
    } catch (err) {
      console.warn(
        `[synthesis-deal-scorer] LLM synthesis call failed (${err instanceof Error ? err.message : String(err)}) — falling back to deterministic signal-derived synthesis`,
      );
      return this.buildFallbackSynthesis(context);
    }

    // Transform and validate the response (dérivation 100% scoreless).
    // Chantier P4 — l'ancien bloc F37 (percentile DE SCORE via percentile-calculator
    // → écriture de comparativeRanking + confidence) est retiré : c'est une note de
    // deal (percentile de score) bannie par la doctrine § Restitution analytique.
    return this.transformResponse(data, context);
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
**QUESTIONS OBLIGATOIRES pour l'analyse** :
1. Pourquoi ce deal arrive a un BA solo plutot qu'un fonds VC ?
2. Le fondateur a-t-il ete refuse par des VCs ? Si oui, quels retours ?
3. Combien d'investisseurs ont ete contactes ?
4. Depuis combien de temps dure la levee ?

**TRAITEMENT ATTENDU** :
- Utilise ces elements comme contexte de marketability / investor-fit / accessibilite du tour
- Ne convertis PAS automatiquement ces elements en signal favorable/defavorable sur la qualite intrinseque
- Ne les traite comme faiblesse intrinsèque que s'ils revelent un probleme causal documente (ex: refus VC motives par un defaut fondamental verifie)

**AJOUTER DANS topWeaknesses OU topStrengths si pertinent** :
- "Deal source / fundraising context: [analyse factuelle de pourquoi ce deal arrive a ce type d'investisseur]"

**AJOUTER DANS questions (TOUJOURS)** :
- "Avez-vous presente ce deal a des fonds VC ? Si oui, quels retours avez-vous eus ?"
- "Depuis combien de temps etes-vous en levee de fonds ?"
`);

    return lines.join("\n");
  }

  /**
   * Chantier descorisation (B2) — injecte les SIGNAUX QUALITATIFS Tier 1 par
   * dimension (facteurs clés sourcés), SANS aucune note `score.value`/100. Le LLM
   * de synthèse ne calcule plus de moyenne pondérée : ces signaux nourrissent la
   * rationale et les forces/faiblesses, l'orientation est dérivée en aval.
   */
  private extractTier1Signals(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};
    const lines: string[] = [];

    const dimensionMapping: Record<string, string> = {
      "financial-auditor": "Financials",
      "team-investigator": "Team",
      "competitive-intel": "Competitive",
      "market-intelligence": "Market",
      "tech-stack-dd": "Tech Stack",
      "tech-ops-dd": "Tech Ops",
      "legal-regulatory": "Legal",
      "cap-table-auditor": "Cap Table",
      "gtm-analyst": "GTM",
      "customer-intel": "Traction",
      "deck-forensics": "Deck Quality",
      "question-master": "DD Readiness",
    };

    for (const [agentName, dimension] of Object.entries(dimensionMapping)) {
      const result = results[agentName];
      if (result?.success && "data" in result) {
        const data = result.data as Record<string, unknown>;
        const keyFactors = this.extractKeyFactors(data, agentName);
        lines.push(`### ${agentName} → ${dimension}
- **Signaux clés**: ${keyFactors || "Analysé — pas de signal saillant extrait"}`);
      } else {
        lines.push(`### ${agentName} → ${dimension}
- **Statut**: non exécuté — dimension non couverte`);
      }
    }

    return lines.length > 0 ? lines.join("\n\n") : "Aucun signal Tier 1 disponible.";
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
      default:
        // Generic extraction (team-investigator inclus — descorisation B2 : plus de
        // sous-note `complementarityScore`/100, on remonte les signaux qualitatifs)
        if (Array.isArray(data.keyStrengths) && data.keyStrengths.length > 0) {
          factors.push(`Forces: ${(data.keyStrengths as string[]).slice(0, 2).join(", ")}`);
        }
        if (Array.isArray(data.keyWeaknesses) && data.keyWeaknesses.length > 0) {
          factors.push(`Faiblesses: ${(data.keyWeaknesses as string[]).slice(0, 2).join(", ")}`);
        }
    }

    return factors.length > 0 ? factors.join(" | ") : "";
  }

  /**
   * Construit le `RedFlagDedup` consolidé depuis TOUS les agents précédents
   * (cross-agent, déterministe). Source unique des red flags consolidés —
   * partagée entre le prompt (`extractTier1RedFlags`) et la dérivation
   * scoreless P2 (intensité, signaux dominants défavorables, risques critiques).
   */
  private buildRedFlagDedup(context: EnrichedAgentContext): RedFlagDedup {
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

    return dedup;
  }

  private extractTier1RedFlags(context: EnrichedAgentContext): string {
    const dedup = this.buildRedFlagDedup(context);

    const summary = dedup.getSummary();
    if (summary.totalConsolidated === 0) {
      return "Aucun red flag détecté par les agents Tier 1.";
    }

    return dedup.formatForPrompt();
  }

  // ===========================================================================
  // P2 — Construction du profil de signal SCORELESS (helpers déterministes)
  // ===========================================================================

  /**
   * Agents contributeurs Tier 1 → dimension de couverture. Liste alignée sur
   * `extractTier1Signals` (12 dimensions horizontales).
   */
  private static readonly COVERAGE_DIMENSIONS: ReadonlyArray<{ agent: string; dimension: string }> = [
    { agent: "financial-auditor", dimension: "Financials" },
    { agent: "team-investigator", dimension: "Team" },
    { agent: "competitive-intel", dimension: "Competitive" },
    { agent: "market-intelligence", dimension: "Market" },
    { agent: "tech-stack-dd", dimension: "Tech Stack" },
    { agent: "tech-ops-dd", dimension: "Tech Ops" },
    { agent: "legal-regulatory", dimension: "Legal" },
    { agent: "cap-table-auditor", dimension: "Cap Table" },
    { agent: "gtm-analyst", dimension: "GTM" },
    { agent: "customer-intel", dimension: "Traction" },
    { agent: "deck-forensics", dimension: "Deck Quality" },
    { agent: "question-master", dimension: "DD Readiness" },
  ];

  /**
   * Couverture par dimension (remplace les sous-scores). Déterministe, SANS
   * score : `covered` = agent exécuté avec données ; `partial` = exécuté mais
   * contrat partiel (`PARTIAL_UNVERIFIED`) ; `not_covered` = absent ou échec.
   */
  private buildDimensionCoverage(context: EnrichedAgentContext): DimensionCoverage[] {
    const results = context.previousResults ?? {};
    return SynthesisDealScorerAgent.COVERAGE_DIMENSIONS.map(({ agent, dimension }) => {
      const r = results[agent];
      if (!r || !r.success || !("data" in r) || !r.data) {
        return { dimension, level: "not_covered" as const };
      }
      const status = (r as { contractStatus?: string }).contractStatus;
      if (status === "PARTIAL_UNVERIFIED") {
        return { dimension, level: "partial" as const };
      }
      return { dimension, level: "covered" as const };
    });
  }

  /**
   * Signaux FAVORABLES dominants (modèle positif explicite) depuis les forces
   * sourcées de la synthèse. Bornés pour rester lisibles ; jamais un score.
   */
  private buildFavorableSignals(keyStrengths: string[]): DominantSignal[] {
    return keyStrengths
      .filter((s) => typeof s === "string" && s.trim() !== "")
      .slice(0, 6)
      .map((statement) => ({ polarity: "favorable" as const, statement }));
  }

  /**
   * Signaux DÉFAVORABLES dominants depuis les red flags consolidés CRITICAL +
   * HIGH (déjà dédupliqués cross-agent). Bornés, sourcés par l'agent détecteur.
   */
  private buildUnfavorableSignals(consolidated: ConsolidatedRedFlag[]): DominantSignal[] {
    return consolidated
      .filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH")
      .slice(0, 8)
      .map((f) => ({
        polarity: "unfavorable" as const,
        statement: f.title,
        severity: f.severity as "CRITICAL" | "HIGH" | "MEDIUM",
        source: f.detectedBy[0],
      }));
  }

  /**
   * Refs de risques critiques (`CriticalRiskRef[]`) depuis les red flags
   * consolidés CRITICAL. Bornés ; preuve/source renseignées si disponibles.
   */
  private buildCriticalRiskRefs(consolidated: ConsolidatedRedFlag[]): CriticalRiskRef[] {
    return consolidated
      .filter((f) => f.severity === "CRITICAL")
      .slice(0, 8)
      .map((f) => {
        const ref: CriticalRiskRef = {
          riskId: f.topic,
          severity: "CRITICAL",
          description: f.description || f.title,
        };
        const quote = f.evidence.find((e) => e.quote)?.quote;
        if (quote) ref.evidence = quote;
        if (f.detectedBy[0]) ref.source = f.detectedBy[0];
        return ref;
      });
  }

  private buildTier1Synthesis(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};

    const tier1Agents = [
      "deck-forensics", "financial-auditor", "team-investigator", "market-intelligence",
      "competitive-intel", "tech-stack-dd", "tech-ops-dd", "legal-regulatory",
      "gtm-analyst", "customer-intel", "cap-table-auditor", "question-master"
    ];

    // Chantier descorisation (B2) : plus de moyenne/min/max de note Tier 1
    // (`avgScore`/100 — note de deal agrégée). On conserve uniquement la
    // complétude OBSERVABLE (agents exécutés), qui qualifie la couverture.
    const totalAgents = tier1Agents.length;
    const successfulAgents = tier1Agents.filter((a) => results[a]?.success).length;
    const completeness = Math.round((successfulAgents / totalAgents) * 100);

    return `**Agents analysés**: ${successfulAgents}/${totalAgents} (${completeness}% completeness)

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

        // Extract key info — descorisation B2 : plus de note sectorielle /100
        // injectée ; on remonte le verdict qualitatif + forces/concerns sourcés.
        const verdict = (data.executiveSummary as Record<string, unknown>)?.verdict ?? "N/A";
        const topStrengths = (data.executiveSummary as Record<string, unknown>)?.topStrengths ?? [];
        const topConcerns = (data.executiveSummary as Record<string, unknown>)?.topConcerns ?? [];

        return `**Expert**: ${expert}
**Verdict sectoriel**: ${verdict}

**Top Strengths**:
${Array.isArray(topStrengths) ? topStrengths.map((s: string) => `- ${s}`).join("\n") : "N/A"}

**Top Concerns**:
${Array.isArray(topConcerns) ? topConcerns.map((c: string) => `- ${c}`).join("\n") : "N/A"}`;
      }
    }

    return "Aucun expert sectoriel Tier 2 n'a été exécuté.";
  }

  private extractContradictions(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};
    const contradictionResult = results["contradiction-detector"];

    if (!contradictionResult?.success || !("data" in contradictionResult) || !contradictionResult.data) {
      return "Contradiction detector non exécuté.";
    }

    const data = contradictionResult.data as Record<string, unknown>;
    const contradictions = data.contradictions as Array<Record<string, unknown>> | undefined;

    // Descorisation B2 : plus de « Score de cohérence /100 » injecté (le wording
    // score/100 réactive la forme de sortie retirée). On garde le nombre et le
    // contenu OBSERVABLES des incohérences détectées.
    if (!contradictions || contradictions.length === 0) {
      return "Aucune incohérence majeure détectée entre les agents.";
    }

    let output = `**${contradictions.length} incohérences détectées**:\n\n`;

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
      return "Conditions analyst non exécuté. Les conditions ne sont pas intégrées dans la synthèse.";
    }

    const data = conditionsResult.data as Record<string, unknown>;
    const findings = data.findings as Record<string, unknown> | undefined;
    const redFlags = data.redFlags as { severity?: string; title?: string }[] | undefined;
    const narrative = data.narrative as { oneLiner?: string } | undefined;

    const lines: string[] = [];

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
      for (const rf of [...redFlags]
        .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
        .slice(0, 8)) {
        lines.push(`- [${rf.severity ?? "?"}] ${rf.title ?? "?"}`);
      }
      if (redFlags.length > 8) {
        lines.push(`- … et ${redFlags.length - 8} autres`);
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
    // P2 — L'orientation restituée (`verdict` ET `investmentRecommendation.action`)
    // est dérivée DÉTERMINISTIQUEMENT et SANS score plus bas (`finalVerdict`).
    // Toute `action`/`orientation`/`verdict` produite par le LLM est TOLÉRÉE en
    // entrée mais JAMAIS préservée en sortie : pas de canal d'orientation
    // concurrent piloté par le LLM (recadrage gate Codex P2-a). Seuls les
    // contenus qualitatifs du LLM (rationale, conditions, forces/faiblesses)
    // sont repris.
    //
    // Chantier P4 — La PRODUCTION de note de deal est retirée : plus de calcul
    // `overallScore` / `dimensionScores` / `scoreBreakdown` / `comparativeRanking`
    // / `confidence`, plus de caps de cohérence numériques ni de meta-gate de
    // score. Seule la dérivation scoreless (`finalVerdict` + `signalProfile`)
    // ci-dessous pilote la restitution.

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

    // Agents Tier1/Tier0.5 en contrat partiel (PARTIAL_UNVERIFIED) : leur output
    // LLM manque des champs de contrat (benchmarks vides, dimensions manquantes,
    // loadBearing vide…). Chantier P4 : plus AUCUNE pénalité de score (la note de
    // deal n'est plus produite) ni de cap/meta-gate numérique. On conserve ce
    // relevé uniquement pour signaler la donnée structurante manquante dans
    // `keyWeaknesses` (cf. plus bas).
    const tier1Contributors = [
      "financial-auditor", "team-investigator", "competitive-intel",
      "market-intelligence", "tech-stack-dd", "tech-ops-dd",
      "legal-regulatory", "gtm-analyst", "customer-intel",
      "deck-forensics", "cap-table-auditor", "question-master",
      "thesis-extractor", "thesis-reconciler",
    ];
    const partialAgents: string[] = [];
    for (const name of tier1Contributors) {
      const r = context.previousResults?.[name];
      if (!r) continue;
      const status = (r as { contractStatus?: string }).contractStatus;
      if (status === "PARTIAL_UNVERIFIED") partialAgents.push(name);
    }

    // =========================================================================
    // P2 — DÉRIVATION SCORELESS DE L'ORIENTATION (jamais dérivée du score)
    // =========================================================================
    // Inputs DÉTERMINISTES et SANS score : red flags consolidés cross-agent
    // (intensité + signaux dominants défavorables + risques critiques),
    // couverture par dimension (présence/contrat des agents) et solidité des
    // preuves. Aucun nombre de note n'entre dans la dérivation — garantie
    // structurelle prouvée par le test « poisoned score ».
    const consolidatedFlags = this.buildRedFlagDedup(context).getConsolidated();
    const criticalFlagCount = consolidatedFlags.filter((f) => f.severity === "CRITICAL").length;
    const highFlagCount = consolidatedFlags.filter((f) => f.severity === "HIGH").length;
    const intensity = deriveSynthesisSignalIntensity(criticalFlagCount, highFlagCount);

    const dimensionCoverage = this.buildDimensionCoverage(context);
    const coveredDimensionCount = dimensionCoverage.filter((d) => d.level === "covered").length;

    const solidity = buildEvidenceSolidityForContext(context);

    // Modèle POSITIF explicite : signaux favorables dominants sourcés (forces),
    // jamais un score. L'absence de red flags ne suffit pas à qualifier favorable.
    const favorableSignals = this.buildFavorableSignals(keyStrengths);

    const finalVerdict = deriveScoreIndependentOrientation({
      intensity,
      favorableSignalCount: favorableSignals.length,
      coveredDimensionCount,
      totalDimensionCount: dimensionCoverage.length,
      evidenceSolidity: solidity.value,
    });

    const notExploitable = decideNotExploitable({
      coveredDimensionCount,
      totalDimensionCount: dimensionCoverage.length,
      evidenceSolidity: solidity.value,
    });

    const signalProfile: AnalysisSignalProfile = {
      orientation: toDoctrineOrientation(finalVerdict, { notExploitable }),
      evidenceSolidity: solidity.value,
      evidenceSolidityRationale: solidity.rationale,
      dominantSignals: [
        ...favorableSignals,
        ...this.buildUnfavorableSignals(consolidatedFlags),
      ],
      dimensionCoverage,
      criticalRisks: this.buildCriticalRiskRefs(consolidatedFlags),
    };

    // Rationale restituée : scrubbée de toute mention de note de deal (chantier
    // P4 — aucun score n'est plus produit ni « patché » ; on retire les
    // éventuels « X/100 » que le LLM aurait glissés dans son texte libre).
    const rawRationale = data.findings?.recommendation?.rationale ??
                        data.investmentRecommendation?.rationale ??
                        data.investmentThesis?.summary ??
                        data.recommendation?.rationale ??
                        "Analyse complétée — consultez les signaux par dimension pour le détail.";

    // P1 — Si des agents Tier1 sont en PARTIAL_UNVERIFIED, injecter un
    // keyWeakness explicite (donnée structurante manquante).
    if (partialAgents.length > 0) {
      keyWeaknesses.unshift(
        `${partialAgents.length} agent${partialAgents.length > 1 ? "s" : ""} Tier1 en contrat partiel: ${partialAgents.slice(0, 3).join(", ")}${partialAgents.length > 3 ? "..." : ""}. Analyse complete mais donnees structurantes manquantes.`
      );
    }

    const result: SynthesisDealScorerData = {
      verdict: finalVerdict,
      investmentRecommendation: {
        // P2 — `action` reflète DÉTERMINISTIQUEMENT `finalVerdict` (orientation
        // scoreless), jamais une valeur d'orientation pilotée par le LLM.
        action: finalVerdict,
        rationale: rawRationale,
        conditions: data.findings?.recommendation?.conditions ??
                   data.investmentRecommendation?.conditions ??
                   data.recommendation?.conditions,
        suggestedTerms: data.findings?.recommendation?.suggestedTerms ??
                       data.investmentRecommendation?.suggestedTerms ??
                       data.recommendation?.suggestedTerms,
      },
      keyStrengths: Array.isArray(keyStrengths) ? keyStrengths.slice(0, 8) : [],
      keyWeaknesses: Array.isArray(keyWeaknesses) ? keyWeaknesses.slice(0, 8) : [],
      criticalRisks: Array.isArray(criticalRisks) ? criticalRisks.slice(0, 8) : [],
      // Phase A slice A2/A6 — Contribution Tier 3 : `orientation` strictement
      // alignée sur `finalVerdict` (déterministe), `evidenceSolidity` dérivé par
      // le service Evidence Solidity (jamais depuis un score), `criticalRisks`
      // depuis les flags CRITICAL. Chantier P4 : plus de champ `score` (note de
      // deal retirée de la production).
      signalContribution: this.buildSignalContribution(finalVerdict, context),
      // P2 — Profil SCORELESS dérivé sans aucun score (cf. bloc dérivation).
      signalProfile,
    };

    // Chantier P4 (recadrage gate Codex) — scrub FINAL de TOUS les champs texte
    // restitués : le prompt LLM instruit encore des scores/dimensions, donc forces,
    // faiblesses, risques, conditions, rationale ET les libellés de signalProfile
    // (dominantSignals issus des forces ET des titres de red flags, criticalRisks)
    // peuvent contenir « X/100 » ou un grade. `deepStripScoreMentions` retire ces
    // patterns de note partout (idempotent ; n'altère ni les enums orientation/
    // solidité ni les métriques observables / « X/10 »). Le nettoyage du prompt
    // lui-même reste une micro-étape P4 ultérieure.
    return deepStripScoreMentions(result);
  }

  /**
   * Fallback DÉTERMINISTE de synthèse (chantier fallback SDS).
   *
   * Déclenché quand l'appel LLM de synthèse échoue (timeout 100s
   * SYNTHESIS_LLM_CALL_OPTIONS / erreur modèle). Au lieu de propager l'échec
   * (success:false → analyse « partielle » alors que les 12 agents ont produit
   * des données), on restitue l'orientation SCORELESS dérivée 100% du contexte :
   * la MÊME dérivation déterministe que `transformResponse` (red flags
   * consolidés cross-agent + couverture par dimension + solidité des preuves),
   * composée en une synthèse propre et lisible — SANS couche éditoriale LLM et
   * SANS formulation d'échec côté utilisateur (décision produit Sacha A1).
   *
   * Conservateur : sans les forces sourcées par le LLM, `favorableSignalCount`
   * est nul → la branche favorable de `deriveScoreIndependentOrientation` ne peut
   * PAS qualifier favorable/very_favorable (plafond `contrasted`). La branche
   * défavorable (intensité des alertes) reste pleinement pilotée par les signaux
   * consolidés du contexte. Les badges orientation/solidité de la carte et le
   * détail par dimension (Tier 1/2) restent affichés inchangés.
   *
   * `transformResponse` reste INCHANGÉ (byte-équivalence durable du chemin
   * nominal replayé en stepwise) : méthode SÉPARÉE, la petite dérivation
   * déterministe est volontairement dupliquée plutôt que d'extraire et toucher
   * le chemin nominal testé.
   */
  private buildFallbackSynthesis(context: EnrichedAgentContext): SynthesisDealScorerData {
    // Dérivation scoreless — inputs 100% contexte (jamais un score), miroir de
    // transformResponse mais avec ZÉRO signal favorable (aucune force LLM).
    const consolidatedFlags = this.buildRedFlagDedup(context).getConsolidated();
    const criticalFlagCount = consolidatedFlags.filter((f) => f.severity === "CRITICAL").length;
    const highFlagCount = consolidatedFlags.filter((f) => f.severity === "HIGH").length;
    const intensity = deriveSynthesisSignalIntensity(criticalFlagCount, highFlagCount);

    const dimensionCoverage = this.buildDimensionCoverage(context);
    const coveredDimensionCount = dimensionCoverage.filter((d) => d.level === "covered").length;
    const totalDimensionCount = dimensionCoverage.length;

    const solidity = buildEvidenceSolidityForContext(context);

    const finalVerdict = deriveScoreIndependentOrientation({
      intensity,
      favorableSignalCount: 0,
      coveredDimensionCount,
      totalDimensionCount,
      evidenceSolidity: solidity.value,
    });

    const notExploitable = decideNotExploitable({
      coveredDimensionCount,
      totalDimensionCount,
      evidenceSolidity: solidity.value,
    });

    const unfavorableSignals = this.buildUnfavorableSignals(consolidatedFlags);
    const criticalRiskRefs = this.buildCriticalRiskRefs(consolidatedFlags);

    const signalProfile: AnalysisSignalProfile = {
      orientation: toDoctrineOrientation(finalVerdict, { notExploitable }),
      evidenceSolidity: solidity.value,
      evidenceSolidityRationale: solidity.rationale,
      // Modèle positif explicite : aucune force LLM disponible → signaux
      // favorables vides ; seuls les signaux défavorables consolidés sont portés.
      dominantSignals: [...unfavorableSignals],
      dimensionCoverage,
      criticalRisks: criticalRiskRefs,
    };

    // Risques critiques restitués (top-level) — dérivés des flags consolidés
    // CRITICAL (le LLM n'a fourni aucun redFlags exploitable).
    const criticalRisks = criticalRiskRefs
      .map((r) => r.description)
      .filter((d): d is string => typeof d === "string" && d.trim() !== "")
      .slice(0, 8);

    const rationale = this.composeFallbackNarrative({
      orientation: signalProfile.orientation,
      unfavorableSignals,
      criticalRiskCount: criticalRisks.length,
      coveredDimensionCount,
      totalDimensionCount,
    });

    const result: SynthesisDealScorerData = {
      verdict: finalVerdict,
      investmentRecommendation: {
        // Déterministe : `action` reflète `finalVerdict` (orientation scoreless),
        // jamais une valeur LLM (aucune ici).
        action: finalVerdict,
        rationale,
      },
      keyStrengths: [],
      // Vide : aucune force/faiblesse éditoriale du LLM. Les lacunes structurantes
      // sont déjà portées par la couverture par dimension (signalProfile + narratif).
      keyWeaknesses: [],
      criticalRisks,
      signalContribution: this.buildSignalContribution(finalVerdict, context),
      signalProfile,
    };

    // Cohérence avec le chemin nominal : scrub final idempotent (aucune note de
    // deal ne doit subsister, y compris dans les statements de red flags repris).
    return deepStripScoreMentions(result);
  }

  /**
   * Compose un narratif de synthèse DÉTERMINISTE, lisible et anti-prescriptif,
   * à partir des seuls signaux consolidés (orientation doctrine, signaux
   * défavorables dominants, risques critiques, couverture). Aucune note de deal,
   * aucune formulation d'échec : le narratif se lit comme une synthèse normale
   * (décision produit Sacha A1). Chaque phrase est un constat factuel — l'outil
   * rapporte les signaux, le BA décide.
   */
  private composeFallbackNarrative(input: {
    orientation: AnalysisSignalProfile["orientation"];
    unfavorableSignals: DominantSignal[];
    criticalRiskCount: number;
    coveredDimensionCount: number;
    totalDimensionCount: number;
  }): string {
    const { orientation, unfavorableSignals, criticalRiskCount, coveredDimensionCount, totalDimensionCount } = input;
    const coverage = `${coveredDimensionCount}/${totalDimensionCount} dimensions couvertes.`;
    const detailPointer = "Le détail par dimension est disponible ci-dessous.";

    if (orientation === "not_exploitable") {
      return `Non exploitable. La base de preuves est insuffisante pour dériver une orientation fiable (${coveredDimensionCount}/${totalDimensionCount} dimensions couvertes). ${detailPointer}`;
    }

    const parts: string[] = [`${DOCTRINE_ORIENTATION_CONFIG[orientation].label}.`];

    if (unfavorableSignals.length > 0) {
      const plural = unfavorableSignals.length > 1;
      const top = unfavorableSignals
        .slice(0, 3)
        .map((s) => (s.source ? `${s.statement} (${s.source})` : s.statement))
        .join(" ; ");
      parts.push(
        `L'analyse croisée des ${totalDimensionCount} dimensions fait ressortir ${unfavorableSignals.length} signal${plural ? "aux" : ""} défavorable${plural ? "s" : ""} dominant${plural ? "s" : ""} : ${top}.`,
      );
    } else {
      parts.push(`L'analyse croisée des ${totalDimensionCount} dimensions n'a pas fait ressortir de signal défavorable dominant.`);
    }

    if (criticalRiskCount > 0) {
      const plural = criticalRiskCount > 1;
      parts.push(`${criticalRiskCount} risque${plural ? "s" : ""} critique${plural ? "s" : ""} identifié${plural ? "s" : ""}.`);
    }

    parts.push(coverage);
    parts.push(detailPointer);

    return parts.join(" ");
  }

  /**
   * Phase A slice A6 — Construction de signalContribution avec qualification
   * evidenceSolidity via le service déterministe.
   *
   * D2 verrouillé : `value` ∈ {`contradictory`, `insufficient`, null}.
   * Le service ne lit JAMAIS score / overallScore / confidence
   * (cf. source-guard `no-confidence-input.guard.test.ts`).
   *
   * Chantier P4 : le champ `score` (note de deal) n'est plus émis — la
   * contribution ne porte que l'orientation + la solidité des preuves.
   */
  private buildSignalContribution(
    orientation: Tier3Orientation,
    context: EnrichedAgentContext,
  ): Tier3SignalContribution {
    const solidity = buildEvidenceSolidityForContext(context);
    const base: Tier3SignalContribution = {
      orientation,
      evidenceSolidity: solidity.value,
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
 * sortie LLM. P2 : l'orientation produite par le LLM (`verdict`/`action`/
 * `orientation`, y compris un format dégradé `STRONG_PASS`) est IGNORÉE — elle
 * n'est plus parsée en orientation de sortie. `verdict` et
 * `investmentRecommendation.action` sont dérivés déterministiquement de
 * `finalVerdict` (orientation scoreless). Seuls les contenus qualitatifs du LLM
 * (rationale, conditions, forces/faiblesses, breakdown dimensionnel) sont repris.
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
  // libre. P2 : toute orientation produite ici par le LLM (`verdict` dégradé
  // STRONG_PASS inclus) est ignorée en sortie ; l'orientation restituée vient
  // de `finalVerdict` (dérivation scoreless déterministe).
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

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const synthesisDealScorer = new SynthesisDealScorerAgent();
