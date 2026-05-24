/**
 * DEVIL'S ADVOCATE AGENT - REFONTE v2.0 + Phase A slice A3
 *
 * Mission: Challenge systematique de la these d'investissement avec comparables echecs reels
 * Persona: Partner VC ultra-sceptique (20+ ans, vu 500+ echecs) + Analyste Big4 rigoureux
 * Standard: Chaque contre-argument source, comparables DB obligatoires
 *
 * Inputs:
 * - Tous les resultats Tier 1 (financial-auditor, deck-forensics, team-investigator, etc.)
 * - Tous les resultats Tier 2 (sector experts)
 * - Context Engine (deals similaires, concurrents, news)
 * - Funding DB (comparables echecs)
 *
 * Outputs (Phase A A3) :
 * - Counter-arguments structures avec comparables echecs reels
 * - Worst case scenario detaille avec triggers et probabilites
 * - `structuralRisks: StructuralRisk[]` (severity CRITICAL|HIGH|MEDIUM) —
 *   D1 verrouillé : remplace l'ancien `killReasons` legacy, sans alias émis.
 * - `riskPosture: light|elevated|critical|structural` — intensité, pas action.
 * - `signalContribution: Tier3SignalContribution` — orientation dérivée
 *   déterministe ; evidenceSolidity reste nullable (A6 ultérieur).
 * - Blind spots identifies
 * - Score de scepticisme justifie
 * - Questions pour le fondateur (pieges constructifs)
 * - `alertSignal: AgentAlertSignal` conservé (compat infra `BaseAgent`).
 *   Sa valeur est dérivée déterministe depuis `riskPosture` côté
 *   `normalizeResponse` — le LLM ne pilote plus librement PROCEED/STOP.
 *   La migration du contrat global `AgentAlertSignal` (cross-agent) reste
 *   un debt explicitement hors scope A3.
 */

import { BaseAgent } from "../base-agent";
import { factCheckDevilsAdvocate } from "@/services/fact-checking";
import { DEVILS_ADVOCATE_SYSTEM_PROMPT } from "./prompts/devils-advocate-prompt";
import { buildEvidenceSolidityForContext } from "@/services/evidence-solidity";
import type {
  EnrichedAgentContext,
  DevilsAdvocateResult,
  DevilsAdvocateData,
  DevilsAdvocateFindings,
  DevilsAdvocateRiskPosture,
  AgentMeta,
  AgentScore,
  AgentRedFlag,
  AgentQuestion,
  AgentAlertSignal,
  AgentNarrative,
  DbCrossReference,
  CounterArgument,
  WorstCaseScenario,
  BlindSpot,
  AlternativeNarrative,
  StructuralRisk,
  Tier3SignalContribution,
  Tier3Orientation,
} from "../types";

/**
 * Phase A slice A3 — Forme attendue de la sortie LLM Devil's Advocate.
 *
 * D1 verrouillé : le contrat natif émis par l'agent expose
 * `findings.structuralRisks[]` (severity CRITICAL|HIGH|MEDIUM) +
 * `findings.riskPosture` + `findings.signalContribution`. Aucun
 * `findings.killReasons` n'est émis natif.
 *
 * Parser tolérant LLM dégradé (lecture interne, sans alias émis) :
 * - Si le LLM continue à produire `killReasons[]` (champ legacy ignoré du
 *   nouveau prompt mais possible sur cache ou run anciens), `normalizeResponse`
 *   les mappe vers `structuralRisks[]`. Cette branche est lecture seule —
 *   la sortie reste D1 stricte.
 * - `severityLevel: CRITICAL|HIGH|CONCERN` (legacy) → `severity:
 *   CRITICAL|HIGH|MEDIUM` (A1) via mapping déterministe.
 *
 * `alertSignal.recommendation: PROCEED|...|STOP` : reste accepté en entrée
 * (compat infra) mais sa valeur est désormais OVERRIDÉE en sortie par
 * `normalizeResponse` à partir de `riskPosture`. Le LLM ne pilote plus
 * cette décision.
 */
interface LLMDevilsAdvocateResponse {
  meta: {
    dataCompleteness: "complete" | "partial" | "minimal";
    confidenceLevel: number;
    limitations: string[];
  };
  score: {
    value: number;
    grade: "A" | "B" | "C" | "D" | "F";
    breakdown: {
      criterion: string;
      weight: number;
      score: number;
      justification: string;
    }[];
  };
  findings: {
    counterArguments: {
      id: string;
      thesis: string;
      thesisSource: string;
      counterArgument: string;
      evidence: string;
      comparableFailure: {
        company: string;
        sector: string;
        fundingRaised?: number;
        similarity: string;
        outcome: string;
        lessonsLearned: string;
        source: string;
        verified?: boolean; // Added by fact-checker
        verificationUrl?: string; // URL found during verification
      };
      probability: "HIGH" | "MEDIUM" | "LOW";
      probabilityRationale: string;
      mitigationPossible: boolean;
      mitigation?: string;
    }[];
    worstCaseScenario: {
      name: string;
      description: string;
      triggers: {
        trigger: string;
        probability: "HIGH" | "MEDIUM" | "LOW";
        timeframe: string;
      }[];
      cascadeEffects: string[];
      probability: number;
      probabilityRationale: string;
      lossAmount: {
        totalLoss: boolean;
        estimatedLoss: string;
        calculation?: string;
      };
      comparableCatastrophes: {
        company: string;
        whatHappened: string;
        investorLosses: string;
        source: string;
        verified?: boolean; // Added by fact-checker
        verificationUrl?: string; // URL found during verification
      }[];
      earlyWarningSigns: string[];
    };
    // Phase A A3 — Contrat natif principal demandé au LLM.
    structuralRisks?: {
      riskId?: string;
      description: string;
      category: string;
      evidence?: string;
      source?: string;
      severity: "CRITICAL" | "HIGH" | "MEDIUM";
      impact?: string;
      question?: string;
    }[];
    riskPosture?: "light" | "elevated" | "critical" | "structural";
    // Phase A A3 — Parser tolérant lecture seule : si un run legacy ou un
    // LLM dégradé produit encore le format `killReasons[]`, `normalizeResponse`
    // le mappe vers `structuralRisks[]` ; jamais émis natif.
    killReasons?: {
      id: string;
      reason: string;
      category: string;
      evidence: string;
      sourceAgent: string;
      severityLevel: "CRITICAL" | "HIGH" | "CONCERN";
      condition?: string;
      resolutionPossible: boolean;
      resolutionPath?: string;
      impactIfIgnored: string;
      questionToFounder: string;
      redFlagAnswer: string;
    }[];
    blindSpots: {
      id: string;
      area: string;
      description: string;
      whyMissed: string;
      whatCouldGoWrong: string;
      historicalPrecedent?: {
        company: string;
        whatHappened: string;
        source: string;
        verified?: boolean; // Added by fact-checker
        verificationUrl?: string; // URL found during verification
      };
      recommendedAction: string;
      urgency: "IMMEDIATE" | "BEFORE_DECISION" | "DURING_DD";
    }[];
    alternativeNarratives: {
      id: string;
      currentNarrative: string;
      alternativeNarrative: string;
      plausibility: number;
      plausibilityRationale: string;
      evidenceSupporting: string[];
      implications: string;
      testToValidate: string;
    }[];
    additionalMarketRisks: {
      risk: string;
      trigger: string;
      timeline: string;
      severity: "EXISTENTIAL" | "SERIOUS" | "MANAGEABLE";
      notCoveredBecause: string;
    }[];
    hiddenCompetitiveThreats: {
      threat: string;
      source: string;
      whyHidden: string;
      likelihood: number;
      defensibility: string;
      evidenceSource: string;
    }[];
    executionChallenges: {
      challenge: string;
      currentAssessment: string;
      realDifficulty: "EXTREME" | "VERY_HARD" | "HARD" | "MODERATE";
      whyUnderestimated: string;
      prerequisite: string;
      failureMode: string;
      comparableFailure?: string;
    }[];
    skepticismAssessment: {
      score: number;
      scoreBreakdown: {
        factor: string;
        contribution: number;
        rationale: string;
      }[];
      verdict: "VERY_SKEPTICAL" | "SKEPTICAL" | "CAUTIOUS" | "NEUTRAL" | "CAUTIOUSLY_OPTIMISTIC";
      verdictRationale: string;
    };
    concernsSummary: {
      absolute: string[];
      conditional: string[];
      serious: string[];
      minor: string[];
    };
    positiveClaimsChallenged: {
      claim: string;
      sourceAgent: string;
      challenge: string;
      verdict: "STANDS" | "WEAKENED" | "INVALIDATED";
      verdictRationale: string;
    }[];
  };
  dbCrossReference: {
    claims: {
      claim: string;
      location: string;
      dbVerdict: "VERIFIED" | "CONTRADICTED" | "PARTIAL" | "NOT_VERIFIABLE";
      evidence: string;
      severity?: "CRITICAL" | "HIGH" | "MEDIUM";
    }[];
    uncheckedClaims: string[];
  };
  redFlags: {
    id: string;
    category: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
    title: string;
    description: string;
    location: string;
    evidence: string;
    contextEngineData?: string;
    impact: string;
    question: string;
    redFlagIfBadAnswer: string;
  }[];
  questions: {
    priority: "CRITICAL" | "HIGH" | "MEDIUM";
    category: string;
    question: string;
    context: string;
    whatToLookFor: string;
  }[];
  alertSignal: {
    hasBlocker: boolean;
    blockerReason?: string;
    recommendation: "PROCEED" | "PROCEED_WITH_CAUTION" | "INVESTIGATE_FURTHER" | "STOP";
    justification: string;
  };
  narrative: {
    oneLiner: string;
    summary: string;
    keyInsights: string[];
    forNegotiation: string[];
  };
}

export class DevilsAdvocateAgent extends BaseAgent<DevilsAdvocateData, DevilsAdvocateResult> {
  constructor() {
    super({
      name: "devils-advocate",
      description: "Challenge systematique de la these d'investissement avec comparables echecs reels",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 120000,
      dependencies: [
        "financial-auditor",
        "deck-forensics",
        "team-investigator",
        "market-intelligence",
        "competitive-intel",
        "exit-strategist",
      ],
    });
  }

  protected buildSystemPrompt(): string {
    // Phase A slice A3 — System prompt extrait dans un fichier compagnon
    // (`./prompts/devils-advocate-prompt.ts`). L'agent importe la constante
    // statique ; les invariants doctrinaux (absence de directive
    // historique de seuil d'auto-confiance, absence de lexique prescriptif
    // legacy de "raison-de-tuer-le-deal"/"destructeur-de-deal", contrat
    // natif structuralRisks + riskPosture) sont verrouillés mécaniquement
    // par les source-guards de `__tests__/devils-advocate-prompt.guard.test.ts`.
    return DEVILS_ADVOCATE_SYSTEM_PROMPT;
  }

  protected async execute(context: EnrichedAgentContext): Promise<DevilsAdvocateData> {
    this._dealStage = context.canonicalDeal.stage;
    const deal = context.canonicalDeal;
    const tier1Results = this.formatTier1Results(context);
    const tier2Results = this.formatTier2Results(context);
    const contextEngineData = this.formatContextEngineData(context);
    const fundingDbData = this.formatFundingDbData(context);

    const prompt = `# ANALYSE DEVIL'S ADVOCATE - ${deal.name}

## DEAL OVERVIEW
- Nom: ${deal.name}
- Secteur: ${deal.sector ?? "Non specifie"}
- Stage: ${deal.stage ?? "Non specifie"}
- Description: ${deal.description ?? "Non fournie"}
- Valorisation demandee: ${deal.valuationPre != null ? `€${Number(deal.valuationPre).toLocaleString()}` : "Non specifiee"}
- ARR: ${deal.arr != null ? `€${Number(deal.arr).toLocaleString()}` : "Non specifie"}

## RESULTATS TIER 1 A CHALLENGER
${tier1Results}

## RESULTATS TIER 2 (EXPERT SECTORIEL) A CHALLENGER
${tier2Results}

## DONNEES CONTEXT ENGINE
${contextEngineData || "Aucune donnee Context Engine disponible."}

## DONNEES FUNDING DB (pour comparables echecs)
${fundingDbData || "Aucune donnee Funding DB disponible. Utilise ta connaissance des echecs celebres du secteur."}
${this.formatFactStoreData(context) ?? ""}
## INSTRUCTIONS SPECIFIQUES

1. **COUNTER-ARGUMENTS**: 3-4 contre-arguments MAX pour les theses les plus optimistes. Chacun avec un comparable echec reel CONCIS.

2. **WORST CASE SCENARIO**: LE scenario catastrophe le plus probable. Specifique a CE deal. 2-3 triggers max, 2 comparables max.

3. **STRUCTURAL RISKS**: 2-4 risques structurels critiques identifies, classes par severity (CRITICAL > HIGH > MEDIUM). Pour chaque risque, inclure si possible une question d'investigation et un impact estime.

4. **BLIND SPOTS**: 2-3 angles morts critiques que les agents n'ont pas couvert.

5. **NARRATIVES ALTERNATIVES**: 1-2 narratives alternatives plausibles.

6. **SCORE DE SCEPTICISME**: Score + verdict + 3-4 facteurs principaux.
   - skepticismAssessment.score est OBLIGATOIRE
   - skepticismAssessment.verdict doit etre coherent avec ce score
   - Si le score manque, le JSON est considere incomplet

7. **QUESTIONS PIEGES**: 3-5 questions critiques pour le fondateur.

8. **RISK POSTURE**: qualifie l'intensite globale des risques structurels detectes (light | elevated | critical | structural). Ce n'est PAS une action — l'investisseur reste decideur.

## OUTPUT ATTENDU

Produis une analyse Devil's Advocate COMPLETE au format JSON specifie.
Standard: Partner VC ultra-sceptique + Analyste Big4 rigoureux.

**REGLES DE CONCISION CRITIQUES (le JSON sera INVALIDE si tronque):**
- counterArguments: MAX 4 items
- structuralRisks: MAX 4 items
- blindSpots: MAX 3 items
- alternativeNarratives: MAX 2 items
- redFlags: MAX 5 items
- questions: MAX 5 items
- Justifications: 1-2 phrases MAX
- Descriptions: 2-3 phrases MAX
- PRIORITE: JSON complet > quantité d'items

\`\`\`json
{
  "score": {
    "value": 0-100,
    "grade": "A" | "B" | "C" | "D" | "F",
    "breakdown": [
      {"criterion": "Skepticism Level", "weight": 30, "score": 0-100, "justification": "..."},
      {"criterion": "Structural Risks Severity", "weight": 25, "score": 0-100, "justification": "..."},
      {"criterion": "Worst Case Probability", "weight": 20, "score": 0-100, "justification": "..."},
      {"criterion": "Blind Spots Count", "weight": 15, "score": 0-100, "justification": "..."},
      {"criterion": "Alternative Narrative Plausibility", "weight": 10, "score": 0-100, "justification": "..."}
    ]
  },
  "meta": {
    "dataCompleteness": "complete" | "partial" | "minimal",
    "confidenceLevel": 0-100,
    "limitations": ["Ce qui n'a pas pu etre analyse"]
  },
  "narrative": {"oneLiner": "...", "summary": "...", "keyInsights": ["..."], "forNegotiation": ["..."]},
  "redFlags": [{"id": "RF-DA-1", "category": "structural-risk", "severity": "CRITICAL", "title": "...", "description": "...", "location": "...", "evidence": "...", "impact": "...", "question": "...", "redFlagIfBadAnswer": "..."}],
  "questions": [{"priority": "CRITICAL", "category": "devil", "question": "...", "context": "...", "whatToLookFor": "..."}],
  "findings": {
    "counterArguments": [...],
    "worstCaseScenario": {...},
    "structuralRisks": [
      {"riskId": "sr-1", "description": "...", "category": "team|market|product|financials|competition|timing|structural|other", "evidence": "...", "source": "...", "severity": "CRITICAL|HIGH|MEDIUM", "impact": "...", "question": "..."}
    ],
    "riskPosture": "light|elevated|critical|structural",
    "blindSpots": [...],
    "alternativeNarratives": [...],
    "additionalMarketRisks": [...],
    "hiddenCompetitiveThreats": [...],
    "executionChallenges": [...],
    "skepticismAssessment": {...},
    "concernsSummary": {...},
    "positiveClaimsChallenged": [...]
  },
  "dbCrossReference": {
    "claims": [...],
    "uncheckedClaims": [...]
  }
}
\`\`\`

NOTE OPERATIONNELLE (interne, non-decisionnelle) : le champ \`alertSignal\` (hasBlocker / recommendation / justification) du contrat infra agents est dérivé DETERMINISTE par le runtime depuis \`riskPosture\` apres ton output. Tu n'as PAS a piloter cette decision toi-meme — tu fournis l'analyse structurelle, la decision d'investissement reste a l'investisseur.`;

    const { data } = await this.llmCompleteJSON<LLMDevilsAdvocateResponse>(prompt);

    const result = this.normalizeResponse(data, deal.name);

    // Phase A slice A6 — Qualifier evidenceSolidity depuis le service
    // déterministe (D2 verrouillé : contradictory / insufficient / null,
    // jamais dérivé de score / confidence). Lecture seule du contexte
    // agent (evidenceLedger + previousResults contradiction-detector).
    const solidity = buildEvidenceSolidityForContext(context);
    if (solidity.value !== null && solidity.rationale) {
      result.findings.signalContribution.evidenceSolidity = solidity.value;
      result.findings.signalContribution.evidenceSolidityRationale = solidity.rationale;
    }

    // Fact-check sources via web search
    // This verifies that comparable failures and historical precedents are real
    try {
      console.log("[DevilsAdvocate] Starting fact-check of sources...");
      const { findings: checkedFindings, factCheckResult } = await factCheckDevilsAdvocate({
        counterArguments: result.findings.counterArguments.map(ca => ({
          comparableFailure: ca.comparableFailure ? {
            company: ca.comparableFailure.company,
            outcome: ca.comparableFailure.outcome,
            source: ca.comparableFailure.source,
          } : undefined,
        })),
        worstCaseScenario: {
          comparableCatastrophes: result.findings.worstCaseScenario.comparableCatastrophes.map(cc => ({
            company: cc.company,
            whatHappened: cc.whatHappened,
            source: cc.source,
          })),
        },
        blindSpots: result.findings.blindSpots.map(bs => ({
          historicalPrecedent: bs.historicalPrecedent ? {
            company: bs.historicalPrecedent.company,
            whatHappened: bs.historicalPrecedent.whatHappened,
            source: bs.historicalPrecedent.source,
          } : undefined,
        })),
      });

      // Update findings with verification data
      if (checkedFindings.counterArguments) {
        for (let i = 0; i < result.findings.counterArguments.length; i++) {
          const checked = checkedFindings.counterArguments[i];
          if (checked?.comparableFailure && result.findings.counterArguments[i].comparableFailure) {
            result.findings.counterArguments[i].comparableFailure.verified = checked.comparableFailure.verified;
            result.findings.counterArguments[i].comparableFailure.verificationUrl = checked.comparableFailure.verificationUrl;
          }
        }
      }

      if (checkedFindings.worstCaseScenario?.comparableCatastrophes) {
        for (let i = 0; i < result.findings.worstCaseScenario.comparableCatastrophes.length; i++) {
          const checked = checkedFindings.worstCaseScenario.comparableCatastrophes[i];
          if (checked) {
            result.findings.worstCaseScenario.comparableCatastrophes[i].verified = checked.verified;
            result.findings.worstCaseScenario.comparableCatastrophes[i].verificationUrl = checked.verificationUrl;
          }
        }
      }

      if (checkedFindings.blindSpots) {
        for (let i = 0; i < result.findings.blindSpots.length; i++) {
          const checked = checkedFindings.blindSpots[i];
          const originalPrecedent = result.findings.blindSpots[i].historicalPrecedent;
          if (checked?.historicalPrecedent && originalPrecedent) {
            originalPrecedent.verified = checked.historicalPrecedent.verified;
            originalPrecedent.verificationUrl = checked.historicalPrecedent.verificationUrl;
          }
        }
      }

      console.log(`[DevilsAdvocate] Fact-check complete: ${factCheckResult.verifiedCount}/${factCheckResult.totalSources} sources verified`);
    } catch (error) {
      console.error("[DevilsAdvocate] Fact-check failed, using unverified sources:", error);
      // Continue with unverified findings - don't fail the whole analysis
    }

    return result;
  }

  private formatTier1Results(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};
    const sections: string[] = [];

    const tier1Agents = [
      "financial-auditor",
      "deck-forensics",
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
    ];

    for (const agentName of tier1Agents) {
      const result = results[agentName];
      if (result?.success && "data" in result && result.data) {
        // Extract key elements for challenge
        const data = result.data as Record<string, unknown>;
        const summary = this.extractChallengeableElements(agentName, data);
        if (summary) {
          sections.push(`### ${agentName.toUpperCase()}\n${summary}`);
        }
      }
    }

    return sections.length > 0 ? sections.join("\n\n") : "Aucun resultat Tier 1 disponible.";
  }

  private formatTier2Results(context: EnrichedAgentContext): string {
    const results = context.previousResults ?? {};
    const sections: string[] = [];

    // Find sector expert results
    const sectorExperts = Object.keys(results).filter(
      (name) => name.endsWith("-expert") && !name.includes("question")
    );

    for (const agentName of sectorExperts) {
      const result = results[agentName];
      if (result?.success && "data" in result && result.data) {
        const data = result.data as Record<string, unknown>;
        sections.push(
          `### ${agentName.toUpperCase()}\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``
        );
      }
    }

    return sections.length > 0 ? sections.join("\n\n") : "Aucun resultat Tier 2 disponible.";
  }

  private extractChallengeableElements(agentName: string, data: Record<string, unknown>): string {
    const elements: string[] = [];

    // Extract score if present
    if (data.score && typeof data.score === "object") {
      const score = data.score as { value?: number; grade?: string };
      if (score.value !== undefined) {
        elements.push(`Score: ${score.value}/100 (${score.grade ?? "N/A"})`);
      }
    }

    // Extract narrative/summary if present
    if (data.narrative && typeof data.narrative === "object") {
      const narrative = data.narrative as { oneLiner?: string; keyInsights?: string[] };
      if (narrative.oneLiner) {
        elements.push(`Resume: ${narrative.oneLiner}`);
      }
      if (narrative.keyInsights && Array.isArray(narrative.keyInsights)) {
        elements.push(`Points cles a challenger:\n${narrative.keyInsights.map((i) => `- ${i}`).join("\n")}`);
      }
    }

    // Extract red flags if present
    if (data.redFlags && Array.isArray(data.redFlags)) {
      const redFlags = data.redFlags as { severity?: string; title?: string }[];
      const critical = redFlags.filter((rf) => rf.severity === "CRITICAL");
      if (critical.length > 0) {
        elements.push(
          `Red Flags CRITIQUES (${critical.length}):\n${critical.map((rf) => `- ${rf.title}`).join("\n")}`
        );
      }
    }

    // Extract alert signal if present
    if (data.alertSignal && typeof data.alertSignal === "object") {
      const alert = data.alertSignal as { recommendation?: string; hasBlocker?: boolean };
      if (alert.recommendation) {
        elements.push(`Recommandation: ${alert.recommendation}`);
      }
      if (alert.hasBlocker) {
        elements.push(`BLOCKER DETECTE`);
      }
    }

    // Extract findings summary based on agent type
    if (data.findings && typeof data.findings === "object") {
      const findings = data.findings as Record<string, unknown>;

      // Financial auditor specifics
      if (agentName === "financial-auditor" && findings.valuation) {
        const val = findings.valuation as { verdict?: string; percentile?: number };
        elements.push(`Valorisation: ${val.verdict} (P${val.percentile ?? "?"})`);
      }

      // Team investigator specifics
      if (agentName === "team-investigator" && findings.founderProfiles) {
        const profiles = findings.founderProfiles as { name?: string; scores?: { overallFounderScore?: number } }[];
        for (const p of profiles) {
          if (p.scores?.overallFounderScore !== undefined) {
            elements.push(`${p.name}: Score ${p.scores.overallFounderScore}/100`);
          }
        }
      }

      // Competitive intel specifics
      if (agentName === "competitive-intel" && findings.moatAnalysis) {
        const moat = findings.moatAnalysis as { overallMoatStrength?: number; moatVerdict?: string };
        elements.push(`Moat: ${moat.moatVerdict} (${moat.overallMoatStrength ?? "?"}%)`);
      }
    }

    return elements.length > 0 ? elements.join("\n") : "";
  }

  private formatFundingDbData(context: EnrichedAgentContext): string {
    // Use fundingDbContext (which has similarDeals) if available, fallback to fundingContext
    const fundingDbContext = context.fundingDbContext;
    const fundingContext = context.fundingContext;

    if (!fundingDbContext && !fundingContext) return "";

    let text = "";

    // Get competitors from either context
    const competitors = fundingDbContext?.competitors ?? fundingContext?.competitors;
    if (competitors && competitors.length > 0) {
      text += "### Concurrents (pour rechercher echecs similaires)\n";
      for (const c of competitors) {
        text += `- ${c.name}: ${c.totalFunding ? `€${c.totalFunding.toLocaleString()}` : "?"} - Status: ${c.status ?? "unknown"}\n`;
      }
    }

    // similarDeals is only in fundingDbContext
    if (fundingDbContext?.similarDeals && Array.isArray(fundingDbContext.similarDeals) && fundingDbContext.similarDeals.length > 0) {
      text += "\n### Deals similaires (pour patterns echec/succes)\n";
      for (const d of fundingDbContext.similarDeals.slice(0, 5)) {
        const deal = d as Record<string, unknown>;
        text += `- ${deal.companyName ?? "?"}: ${deal.stage ?? "?"} - ${deal.outcome ?? "ongoing"}\n`;
      }
    }

    return text;
  }

  private normalizeResponse(data: LLMDevilsAdvocateResponse, dealName: string): DevilsAdvocateData {
    const validGrades = ["A", "B", "C", "D", "F"] as const;
    const validSeverities = ["CRITICAL", "HIGH", "MEDIUM"] as const;
    const validPriorities = ["CRITICAL", "HIGH", "MEDIUM"] as const;
    const validVerdicts = ["VERY_SKEPTICAL", "SKEPTICAL", "CAUTIOUS", "NEUTRAL", "CAUTIOUSLY_OPTIMISTIC"] as const;
    const validProbabilities = ["HIGH", "MEDIUM", "LOW"] as const;
    const validDifficulties = ["EXTREME", "VERY_HARD", "HARD", "MODERATE"] as const;
    const validUrgencies = ["IMMEDIATE", "BEFORE_DECISION", "DURING_DD"] as const;
    const validClaimVerdicts = ["STANDS", "WEAKENED", "INVALIDATED"] as const;
    const validDbVerdicts = ["VERIFIED", "CONTRADICTED", "PARTIAL", "NOT_VERIFIABLE"] as const;
    const validMarketSeverities = ["EXISTENTIAL", "SERIOUS", "MANAGEABLE"] as const;
    const validStructuralCategories = [
      "team", "market", "product", "financials", "competition", "timing", "structural", "other",
    ] as const;

    // Phase A A3 — Mapping legacy `killReasons[].severityLevel`
    // (CRITICAL|HIGH|CONCERN) vers `StructuralRisk.severity` (CRITICAL|HIGH|MEDIUM)
    // utilisé en lecture seule par le parser tolérant ci-dessous (D1 :
    // jamais en émission). CONCERN → MEDIUM (mapping conservateur, le moins
    // alarmiste).
    const legacySeverityLevelToStructuralSeverity: Record<string, "CRITICAL" | "HIGH" | "MEDIUM"> = {
      CRITICAL: "CRITICAL",
      HIGH: "HIGH",
      CONCERN: "MEDIUM",
      MEDIUM: "MEDIUM",
    };

    // Normalize meta
    const confidenceIsFallback = data.meta?.confidenceLevel == null;
    if (confidenceIsFallback) {
      console.warn(`[devils-advocate] LLM did not return confidenceLevel — using 0`);
    }
    const meta: AgentMeta = {
      agentName: "devils-advocate",
      analysisDate: new Date().toISOString(),
      dataCompleteness: ["complete", "partial", "minimal"].includes(data.meta?.dataCompleteness)
        ? data.meta.dataCompleteness
        : "partial",
      confidenceLevel: confidenceIsFallback ? 0 : Math.min(100, Math.max(0, data.meta.confidenceLevel)),
      confidenceIsFallback,
      limitations: Array.isArray(data.meta?.limitations) ? data.meta.limitations : [],
    };

    // Phase A A3 — Parser tolérant LLM dégradé (lecture seule).
    // Lit `data.findings.structuralRisks` en priorité (contrat natif demandé
    // au LLM par le prompt compagnon A3). Si absent ou vide, retombe sur
    // `data.findings.killReasons` legacy et le mappe vers StructuralRisk[]
    // (jamais émis natif — D1 verrouillé).
    const rawStructural = Array.isArray(data.findings?.structuralRisks)
      ? data.findings.structuralRisks
      : null;
    const legacyKillReasons = Array.isArray(data.findings?.killReasons)
      ? data.findings.killReasons
      : null;

    let normalizedStructuralSource: { description: string; category: string; severity: string; evidence?: string; source?: string; impact?: string; question?: string; riskId?: string }[];
    if (rawStructural && rawStructural.length > 0) {
      normalizedStructuralSource = rawStructural.map((sr) => ({
        riskId: sr.riskId,
        description: sr.description ?? "",
        category: sr.category ?? "structural",
        severity: sr.severity ?? "MEDIUM",
        evidence: sr.evidence,
        source: sr.source,
        impact: sr.impact,
        question: sr.question,
      }));
    } else if (legacyKillReasons && legacyKillReasons.length > 0) {
      console.warn(
        `[devils-advocate] LLM produced legacy killReasons[] — mapping to structuralRisks (parser tolérant, D1 lecture seule)`,
      );
      normalizedStructuralSource = legacyKillReasons.map((kr) => ({
        riskId: kr.id,
        description: kr.reason ?? "",
        category: kr.category ?? "structural",
        severity: legacySeverityLevelToStructuralSeverity[kr.severityLevel ?? "CONCERN"] ?? "MEDIUM",
        evidence: kr.evidence,
        source: kr.sourceAgent,
        impact: kr.impactIfIgnored,
        question: kr.questionToFounder,
      }));
    } else {
      normalizedStructuralSource = [];
    }

    const structuralRisks: StructuralRisk[] = normalizedStructuralSource
      .filter((sr) => sr.description.trim())
      .map((sr, idx) => {
        const severity = validSeverities.includes(sr.severity as (typeof validSeverities)[number])
          ? (sr.severity as "CRITICAL" | "HIGH" | "MEDIUM")
          : "MEDIUM";
        const category = validStructuralCategories.includes(
          sr.category as (typeof validStructuralCategories)[number],
        )
          ? (sr.category as StructuralRisk["category"])
          : "other";
        const risk: StructuralRisk = {
          riskId: sr.riskId?.trim() ? sr.riskId : `sr-${idx + 1}`,
          severity,
          category,
          description: sr.description,
        };
        if (sr.evidence) risk.evidence = sr.evidence;
        if (sr.impact) risk.impact = sr.impact;
        if (sr.source) risk.source = sr.source;
        if (sr.question) risk.question = sr.question;
        return risk;
      });

    // Counts pour dérivations déterministes (riskPosture, signalContribution,
    // alertSignal, score fallback, skepticism fallback).
    const criticalCount = structuralRisks.filter((r) => r.severity === "CRITICAL").length;
    const highCount = structuralRisks.filter((r) => r.severity === "HIGH").length;
    const mediumCount = structuralRisks.filter((r) => r.severity === "MEDIUM").length;

    // Phase A A3 — `riskPosture` strictement déterministe (runtime-derived).
    // Round 2 Codex : la valeur LLM `data.findings?.riskPosture` n'est PAS
    // utilisée comme source de vérité — elle pourrait être incohérente avec
    // les severity counts (ex : LLM annonce "light" alors qu'il a produit
    // 3 risques CRITICAL). Le runtime ignore cette valeur et dérive
    // mécaniquement la posture depuis les counts. Le LLM ne peut pas
    // downgrader ni escalader la posture.
    //
    // `signalContribution.orientation` et `alertSignal.recommendation`
    // dérivent ensuite de ce `riskPosture` déterministe (et des counts),
    // garantissant la cohérence intra-output.
    let riskPosture: DevilsAdvocateRiskPosture;
    if (criticalCount >= 3) {
      riskPosture = "structural";
    } else if (criticalCount >= 2) {
      riskPosture = "critical";
    } else if (criticalCount >= 1 || highCount >= 2) {
      riskPosture = "elevated";
    } else {
      riskPosture = "light";
    }

    // Normalize score — derive from structural risks severity counts if LLM didn't return it
    const rawScoreValue = data.score?.value;
    const scoreIsFallback = rawScoreValue === undefined || rawScoreValue === null;
    let derivedScore = 0;
    if (scoreIsFallback) {
      // Phase A A3 — Derive score from structural risks severity and count
      // (équivalent sémantique de l'ancienne dérivation killReasons : plus de
      // risques structurels critiques détectés = score "deal resilience" plus
      // bas du point de vue contradicteur).
      derivedScore = Math.max(10, Math.min(80,
        70 - (criticalCount * 20) - (highCount * 10) - (mediumCount * 5)
      ));
      console.warn(`[devils-advocate] LLM did not return score value — derived ${derivedScore} from ${structuralRisks.length} structural risks`);
    }
    const score: AgentScore = {
      value: scoreIsFallback ? derivedScore : Math.min(100, Math.max(0, rawScoreValue)),
      grade: scoreIsFallback
        ? (derivedScore >= 80 ? "A" : derivedScore >= 60 ? "B" : derivedScore >= 40 ? "C" : derivedScore >= 20 ? "D" : "F")
        : (validGrades.includes(data.score?.grade as (typeof validGrades)[number])
          ? (data.score.grade as (typeof validGrades)[number])
          : "C"),
      isFallback: scoreIsFallback,
      breakdown: Array.isArray(data.score?.breakdown)
        ? data.score.breakdown.map((b) => ({
            criterion: b.criterion ?? "",
            weight: b.weight ?? 20,
            score: b.score != null ? Math.min(100, Math.max(0, b.score)) : 0,
            justification: b.justification ?? "",
          }))
        : [],
    };

    // Normalize counter arguments
    const counterArguments: CounterArgument[] = Array.isArray(data.findings?.counterArguments)
      ? data.findings.counterArguments.map((ca, idx) => ({
          id: ca.id ?? `ca-${idx + 1}`,
          thesis: ca.thesis ?? "",
          thesisSource: ca.thesisSource ?? "unknown",
          counterArgument: ca.counterArgument ?? "",
          evidence: ca.evidence ?? "",
          comparableFailure: {
            company: ca.comparableFailure?.company ?? "Unknown",
            sector: ca.comparableFailure?.sector ?? "Unknown",
            fundingRaised: ca.comparableFailure?.fundingRaised,
            similarity: ca.comparableFailure?.similarity ?? "",
            outcome: ca.comparableFailure?.outcome ?? "",
            lessonsLearned: ca.comparableFailure?.lessonsLearned ?? "",
            source: ca.comparableFailure?.source ?? "Unknown",
          },
          probability: validProbabilities.includes(ca.probability as (typeof validProbabilities)[number])
            ? (ca.probability as (typeof validProbabilities)[number])
            : "MEDIUM",
          probabilityRationale: ca.probabilityRationale ?? "",
          mitigationPossible: ca.mitigationPossible ?? false,
          mitigation: ca.mitigation,
        }))
      : [];

    // Normalize worst case scenario
    const worstCaseScenario: WorstCaseScenario = {
      name: data.findings?.worstCaseScenario?.name ?? "Scenario catastrophe",
      description: data.findings?.worstCaseScenario?.description ?? "",
      triggers: Array.isArray(data.findings?.worstCaseScenario?.triggers)
        ? data.findings.worstCaseScenario.triggers.map((t) => ({
            trigger: t.trigger ?? "",
            probability: validProbabilities.includes(t.probability as (typeof validProbabilities)[number])
              ? (t.probability as (typeof validProbabilities)[number])
              : "MEDIUM",
            timeframe: t.timeframe ?? "12-24 mois",
          }))
        : [],
      cascadeEffects: Array.isArray(data.findings?.worstCaseScenario?.cascadeEffects)
        ? data.findings.worstCaseScenario.cascadeEffects
        : [],
      probability: Math.min(100, Math.max(0, data.findings?.worstCaseScenario?.probability ?? 20)),
      probabilityRationale: data.findings?.worstCaseScenario?.probabilityRationale ?? "",
      lossAmount: {
        totalLoss: data.findings?.worstCaseScenario?.lossAmount?.totalLoss ?? false,
        estimatedLoss: data.findings?.worstCaseScenario?.lossAmount?.estimatedLoss ?? "50-80%",
        calculation: data.findings?.worstCaseScenario?.lossAmount?.calculation,
      },
      comparableCatastrophes: Array.isArray(data.findings?.worstCaseScenario?.comparableCatastrophes)
        ? data.findings.worstCaseScenario.comparableCatastrophes.map((c) => ({
            company: c.company ?? "",
            whatHappened: c.whatHappened ?? "",
            investorLosses: c.investorLosses ?? "",
            source: c.source ?? "Unknown",
          }))
        : [],
      earlyWarningSigns: Array.isArray(data.findings?.worstCaseScenario?.earlyWarningSigns)
        ? data.findings.worstCaseScenario.earlyWarningSigns
        : [],
    };

    // Phase A A3 — Les anciens `killReasons[]` ont été convertis plus haut
    // (parser tolérant lecture seule). La sortie native expose
    // `structuralRisks` (severity CRITICAL|HIGH|MEDIUM), `riskPosture`, et
    // `signalContribution` — aucun alias legacy n'est ré-injecté.

    // Normalize blind spots - filter out empty entries
    const blindSpots: BlindSpot[] = Array.isArray(data.findings?.blindSpots)
      ? data.findings.blindSpots
          .filter((bs) => bs.area?.trim() && bs.description?.trim()) // Only keep entries with content
          .map((bs, idx) => ({
            id: bs.id ?? `bs-${idx + 1}`,
            area: bs.area ?? "",
            description: bs.description ?? "",
            whyMissed: bs.whyMissed ?? "",
            whatCouldGoWrong: bs.whatCouldGoWrong ?? "",
            historicalPrecedent: bs.historicalPrecedent
              ? {
                  company: bs.historicalPrecedent.company ?? "",
                  whatHappened: bs.historicalPrecedent.whatHappened ?? "",
                  source: bs.historicalPrecedent.source ?? "Unknown",
                }
              : undefined,
            recommendedAction: bs.recommendedAction ?? "",
            urgency: validUrgencies.includes(bs.urgency as (typeof validUrgencies)[number])
              ? (bs.urgency as (typeof validUrgencies)[number])
              : "BEFORE_DECISION",
          }))
      : [];

    // Normalize alternative narratives
    const alternativeNarratives: AlternativeNarrative[] = Array.isArray(data.findings?.alternativeNarratives)
      ? data.findings.alternativeNarratives.map((an, idx) => ({
          id: an.id ?? `an-${idx + 1}`,
          currentNarrative: an.currentNarrative ?? "",
          alternativeNarrative: an.alternativeNarrative ?? "",
          plausibility: Math.min(100, Math.max(0, an.plausibility ?? 30)),
          plausibilityRationale: an.plausibilityRationale ?? "",
          evidenceSupporting: Array.isArray(an.evidenceSupporting) ? an.evidenceSupporting : [],
          implications: an.implications ?? "",
          testToValidate: an.testToValidate ?? "",
        }))
      : [];

    // Phase A A3 — `signalContribution.orientation` déterministe depuis
    // riskPosture + counts. DA est par nature critique — n'émet jamais
    // `very_favorable`. Mapping conservateur :
    //   structural → alert_dominant (≥3 CRITICAL)
    //   critical   → alert_dominant (≥2 CRITICAL) ou vigilance (1 CRITICAL)
    //   elevated   → contrasted ou vigilance selon counts
    //   light      → favorable (aucun risque structurel détecté)
    let signalOrientation: Tier3Orientation;
    if (riskPosture === "structural" || criticalCount >= 2) {
      signalOrientation = "alert_dominant";
    } else if (criticalCount >= 1) {
      signalOrientation = "vigilance";
    } else if (riskPosture === "elevated") {
      signalOrientation = "contrasted";
    } else {
      signalOrientation = "favorable";
    }

    // D2 verrouillé : evidenceSolidity reste null en A3 (qualifié ultérieurement
    // par le service Solidité A6, jamais fabriqué depuis score/confidence ici).
    const signalContribution: Tier3SignalContribution = {
      orientation: signalOrientation,
      evidenceSolidity: null,
    };

    // Build findings
    const findings: DevilsAdvocateFindings = {
      counterArguments,
      worstCaseScenario,
      structuralRisks,
      riskPosture,
      signalContribution,
      blindSpots,
      alternativeNarratives,
      additionalMarketRisks: Array.isArray(data.findings?.additionalMarketRisks)
        ? data.findings.additionalMarketRisks.map((r) => ({
            risk: r.risk ?? "",
            trigger: r.trigger ?? "",
            timeline: r.timeline ?? "",
            severity: validMarketSeverities.includes(r.severity as (typeof validMarketSeverities)[number])
              ? (r.severity as (typeof validMarketSeverities)[number])
              : "SERIOUS",
            notCoveredBecause: r.notCoveredBecause ?? "",
          }))
        : [],
      hiddenCompetitiveThreats: Array.isArray(data.findings?.hiddenCompetitiveThreats)
        ? data.findings.hiddenCompetitiveThreats.map((t) => ({
            threat: t.threat ?? "",
            source: t.source ?? "",
            whyHidden: t.whyHidden ?? "",
            likelihood: Math.min(100, Math.max(0, t.likelihood ?? 30)),
            defensibility: t.defensibility ?? "",
            evidenceSource: t.evidenceSource ?? "",
          }))
        : [],
      executionChallenges: Array.isArray(data.findings?.executionChallenges)
        ? data.findings.executionChallenges.map((c) => ({
            challenge: c.challenge ?? "",
            currentAssessment: c.currentAssessment ?? "",
            realDifficulty: validDifficulties.includes(c.realDifficulty as (typeof validDifficulties)[number])
              ? (c.realDifficulty as (typeof validDifficulties)[number])
              : "HARD",
            whyUnderestimated: c.whyUnderestimated ?? "",
            prerequisite: c.prerequisite ?? "",
            failureMode: c.failureMode ?? "",
            comparableFailure: c.comparableFailure,
          }))
        : [],
      skepticismAssessment: (() => {
        const rawScore = data.findings?.skepticismAssessment?.score;
        const hasScore = rawScore != null;
        // Phase A A3 — Si le LLM n'a pas fourni de score, dérivation depuis
        // structural risks counts (severity natif CRITICAL/HIGH).
        const fallbackScore = !hasScore
          ? Math.min(100, Math.max(20,
              (criticalCount * 25) +
              (highCount * 15) +
              (counterArguments.filter(ca => ca.probability === "HIGH").length * 10) +
              20 // base skepticism (contradicteur structurellement vigilant)
            ))
          : 0; // unused
        if (!hasScore) {
          console.warn(`[devils-advocate] LLM did not return skepticismAssessment.score — derived ${fallbackScore} from structural risks counts`);
        }
        return {
          score: hasScore
            ? Math.min(100, Math.max(0, rawScore)) : fallbackScore,
          isFallback: !hasScore,
          scoreBreakdown: Array.isArray(data.findings?.skepticismAssessment?.scoreBreakdown)
            ? data.findings.skepticismAssessment.scoreBreakdown.map((s: { factor?: string; contribution?: number; rationale?: string }) => ({
                factor: s.factor ?? "",
                contribution: s.contribution ?? 0,
                rationale: s.rationale ?? "",
              }))
            : [],
          verdict: validVerdicts.includes(
            data.findings?.skepticismAssessment?.verdict as (typeof validVerdicts)[number]
          )
            ? (data.findings.skepticismAssessment.verdict as (typeof validVerdicts)[number])
            : this.deriveSkepticismVerdict(hasScore ? Math.min(100, Math.max(0, rawScore)) : fallbackScore),
          verdictRationale: data.findings?.skepticismAssessment?.verdictRationale
            ?? (!hasScore
              ? `Verdict derive defensivement a partir du score ${fallbackScore}/100 et des risques structurels identifies.`
              : ""),
        };
      })(),
      concernsSummary: {
        absolute: Array.isArray(data.findings?.concernsSummary?.absolute)
          ? data.findings.concernsSummary.absolute
          : [],
        conditional: Array.isArray(data.findings?.concernsSummary?.conditional)
          ? data.findings.concernsSummary.conditional
          : [],
        serious: Array.isArray(data.findings?.concernsSummary?.serious)
          ? data.findings.concernsSummary.serious
          : [],
        minor: Array.isArray(data.findings?.concernsSummary?.minor) ? data.findings.concernsSummary.minor : [],
      },
      positiveClaimsChallenged: Array.isArray(data.findings?.positiveClaimsChallenged)
        ? data.findings.positiveClaimsChallenged.map((p) => ({
            claim: p.claim ?? "",
            sourceAgent: p.sourceAgent ?? "",
            challenge: p.challenge ?? "",
            verdict: validClaimVerdicts.includes(p.verdict as (typeof validClaimVerdicts)[number])
              ? (p.verdict as (typeof validClaimVerdicts)[number])
              : "WEAKENED",
            verdictRationale: p.verdictRationale ?? "",
          }))
        : [],
    };

    // Normalize DB cross-reference
    const dbCrossReference: DbCrossReference = {
      claims: Array.isArray(data.dbCrossReference?.claims)
        ? data.dbCrossReference.claims.map((c) => ({
            claim: c.claim ?? "",
            location: c.location ?? "",
            dbVerdict: validDbVerdicts.includes(c.dbVerdict as (typeof validDbVerdicts)[number])
              ? (c.dbVerdict as (typeof validDbVerdicts)[number])
              : "NOT_VERIFIABLE",
            evidence: c.evidence ?? "",
            severity: validSeverities.includes(c.severity as (typeof validSeverities)[number])
              ? (c.severity as (typeof validSeverities)[number])
              : undefined,
          }))
        : [],
      uncheckedClaims: Array.isArray(data.dbCrossReference?.uncheckedClaims)
        ? data.dbCrossReference.uncheckedClaims
        : [],
    };

    // Normalize red flags
    const redFlags: AgentRedFlag[] = Array.isArray(data.redFlags)
      ? data.redFlags.map((rf, idx) => ({
          id: rf.id ?? `rf-${idx + 1}`,
          category: rf.category ?? "other",
          severity: validSeverities.includes(rf.severity as (typeof validSeverities)[number])
            ? (rf.severity as (typeof validSeverities)[number])
            : "MEDIUM",
          title: rf.title ?? "",
          description: rf.description ?? "",
          location: rf.location ?? "Analyse Devil's Advocate",
          evidence: rf.evidence ?? "",
          contextEngineData: rf.contextEngineData,
          impact: rf.impact ?? "",
          question: rf.question ?? "",
          redFlagIfBadAnswer: rf.redFlagIfBadAnswer ?? "",
        }))
      : [];

    // Normalize questions
    const questions: AgentQuestion[] = Array.isArray(data.questions)
      ? data.questions.map((q) => ({
          priority: validPriorities.includes(q.priority as (typeof validPriorities)[number])
            ? (q.priority as (typeof validPriorities)[number])
            : "MEDIUM",
          category: q.category ?? "risk",
          question: q.question ?? "",
          context: q.context ?? "",
          whatToLookFor: q.whatToLookFor ?? "",
        }))
      : [];

    // Phase A A3 — `alertSignal` dérivé déterministe depuis `riskPosture`.
    // Le LLM ne pilote plus librement PROCEED/STOP. Le contrat global
    // `AgentAlertSignal` reste tel quel (debt cross-agent hors scope A3 :
    // migration vers `signalIntensity` en A7b / A4-bis / A9). La valeur de
    // `justification` est reprise du LLM si fournie, sinon générée depuis
    // riskPosture pour conserver une explication lisible côté pipeline.
    const riskPostureToRecommendation: Record<DevilsAdvocateRiskPosture, "PROCEED" | "PROCEED_WITH_CAUTION" | "INVESTIGATE_FURTHER" | "STOP"> = {
      light: "PROCEED",
      elevated: "PROCEED_WITH_CAUTION",
      critical: "INVESTIGATE_FURTHER",
      structural: "STOP",
    };
    const alertSignal: AgentAlertSignal = {
      hasBlocker: riskPosture === "structural" || criticalCount >= 2,
      blockerReason: (riskPosture === "structural" || criticalCount >= 2)
        ? `Risques structurels critiques detectes (${criticalCount} CRITICAL / ${highCount} HIGH)`
        : undefined,
      recommendation: riskPostureToRecommendation[riskPosture],
      justification: data.alertSignal?.justification?.trim()
        || `Posture derivee: ${riskPosture} (${criticalCount} risques structurels CRITICAL, ${highCount} HIGH, ${mediumCount} MEDIUM).`,
    };

    // Normalize narrative
    const narrative: AgentNarrative = {
      oneLiner: data.narrative?.oneLiner ?? `Analyse Devil's Advocate de ${dealName}`,
      summary: data.narrative?.summary ?? "",
      keyInsights: Array.isArray(data.narrative?.keyInsights) ? data.narrative.keyInsights : [],
      forNegotiation: Array.isArray(data.narrative?.forNegotiation) ? data.narrative.forNegotiation : [],
    };

    return {
      meta,
      score,
      findings,
      dbCrossReference,
      redFlags,
      questions,
      alertSignal,
      narrative,
    };
  }

  private deriveSkepticismVerdict(
    score: number
  ): "VERY_SKEPTICAL" | "SKEPTICAL" | "CAUTIOUS" | "NEUTRAL" | "CAUTIOUSLY_OPTIMISTIC" {
    if (score >= 80) return "VERY_SKEPTICAL";
    if (score >= 60) return "SKEPTICAL";
    if (score >= 40) return "CAUTIOUS";
    if (score >= 20) return "NEUTRAL";
    return "CAUTIOUSLY_OPTIMISTIC";
  }
}

export const devilsAdvocate = new DevilsAdvocateAgent();
