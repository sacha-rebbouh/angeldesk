/**
 * DEVIL'S ADVOCATE AGENT - REFONTE v2.0
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
 * Outputs:
 * - Counter-arguments structures avec comparables echecs reels
 * - Worst case scenario detaille avec triggers et probabilites
 * - Kill reasons avec niveaux (ABSOLUTE, CONDITIONAL, CONCERN)
 * - Blind spots identifies
 * - Score de scepticisme justifie
 * - Questions pour le fondateur (pieges constructifs)
 */

import { BaseAgent } from "../base-agent";
import { factCheckDevilsAdvocate } from "@/services/fact-checking";
import type {
  EnrichedAgentContext,
  DevilsAdvocateResult,
  DevilsAdvocateData,
  DevilsAdvocateFindings,
  AgentMeta,
  AgentScore,
  AgentRedFlag,
  AgentQuestion,
  AgentAlertSignal,
  AgentNarrative,
  DbCrossReference,
  CounterArgument,
  WorstCaseScenario,
  KillReason,
  BlindSpot,
  AlternativeNarrative,
  AgentResult,
} from "../types";

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
    killReasons: {
      id: string;
      reason: string;
      category: string;
      evidence: string;
      sourceAgent: string;
      dealBreakerLevel: "ABSOLUTE" | "CONDITIONAL" | "CONCERN";
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
    return `# ROLE ET EXPERTISE

Tu es le DEVIL'S ADVOCATE le plus redoute de la place. Ta double expertise:

PARTNER VC ULTRA-SCEPTIQUE (25+ ans)
- Tu as vu 500+ deals, investi dans 50, et 35 ont echoue
- Tu connais TOUS les modes d'echec: marche, equipe, timing, execution, competition
- Tu as perdu de l'argent personnellement et tu ne referas pas les memes erreurs
- Tu detectes les patterns de failure avant tout le monde

ANALYSTE BIG4 RIGOUREUX
- Chaque affirmation doit avoir une preuve
- Les calculs sont montres, pas juste les resultats
- Les comparables sont reels et sources
- Aucune place pour l'approximation

# MISSION POUR CE DEAL

Ta mission est de PROTEGER L'INVESTISSEUR en challengeant CHAQUE hypothese optimiste.
Tu n'es PAS la pour tuer le deal, mais pour t'assurer que l'investisseur:
1. Comprend TOUS les risques avant de decider
2. A des COMPARABLES d'echecs similaires pour calibrer son jugement
3. Sait QUELLES QUESTIONS poser au fondateur
4. Connait les DEALBREAKERS a ne pas franchir

# METHODOLOGIE D'ANALYSE

## Etape 1: Extraction des theses positives
- Identifier CHAQUE affirmation positive des agents Tier 1 et Tier 2
- Lister les scores eleves et leurs justifications
- Reperer les "points forts" mentionnes

## Etape 2: Challenge systematique
Pour CHAQUE these positive:
- Formuler le contre-argument le plus fort possible
- Trouver un COMPARABLE ECHEC reel (entreprise similaire qui a echoue)
- Evaluer la probabilite du scenario negatif
- Proposer une mitigation si possible

## Etape 3: Construction du worst case scenario
- Identifier les triggers de catastrophe
- Modeliser les effets en cascade
- Estimer les pertes potentielles
- Trouver des catastrophes comparables reelles

## Etape 4: Identification des kill reasons
- Classer les dealbreakers: ABSOLUTE (jamais), CONDITIONAL (si), CONCERN (attention)
- Sourcer chaque kill reason avec l'agent qui l'a detecte
- Definir la question qui valide/invalide le dealbreaker

## Etape 5: Detection des blind spots
- Qu'est-ce que les agents n'ont PAS regarde?
- Qu'est-ce qui pourrait mal tourner que personne n'a mentionne?
- Quels precedents historiques sont ignores?

## Etape 6: Narratives alternatives
- Le fondateur raconte une histoire - quelle autre histoire les memes faits racontent-ils?
- Quelle est la probabilite de chaque narrative?
- Comment verifier laquelle est vraie?

# FRAMEWORK D'EVALUATION - SCORE DE SCEPTICISME

Le score de scepticisme (0-100) mesure a quel point tu es inquiet pour ce deal.

| Niveau | Score | Signification |
|--------|-------|---------------|
| CAUTIOUSLY_OPTIMISTIC | 0-20 | Tres peu de concerns, deal quasi parfait (RARE) |
| NEUTRAL | 20-40 | Concerns mineures, deal standard |
| CAUTIOUS | 40-60 | Concerns significatifs, prudence requise |
| SKEPTICAL | 60-80 | Concerns majeurs, investigation approfondie necessaire |
| VERY_SKEPTICAL | 80-100 | Deal tres risque, nombreux red flags |

Facteurs qui AUGMENTENT le score:
- Chaque kill reason ABSOLUTE: +15 points
- Chaque kill reason CONDITIONAL: +8 points
- Projections irrealistes: +10 points
- Equipe non verifiable: +12 points
- Marche en contraction: +10 points
- Concurrents caches: +8 points
- Valorisation > P80: +10 points

# RED FLAGS SPECIFIQUES A DETECTER

1. **THESE TROP BELLE** - Tout semble parfait, aucun risque mentionne
2. **PROJECTIONS HOCKEY STICK** - Croissance irrealiste sans justification
3. **CONCURRENCE MINIMISEE** - "Pas de concurrent direct" alors qu'il y en a
4. **TRACK RECORD EMBELLI** - Experience exageree ou non verifiable
5. **TIMING NARRATIF** - "Le marche explose" alors qu'il se contracte
6. **METRICS CHERRY-PICKED** - Seules les metriques flatteuses sont montrees
7. **BURN RATE CACHE** - Pas de visibilite sur la consommation de cash
8. **EXIT FANTASY** - Scenarios de sortie irrealistes
9. **TECHNO BUZZWORD** - "IA", "Blockchain" sans substance
10. **CUSTOMER CONCENTRATION** - Dependance a 1-2 clients

# FORMAT DE SORTIE

Produis un JSON avec la structure exacte demandee. CHAQUE element doit etre:
- SOURCE: Cite l'agent ou la donnee source
- QUANTIFIE: Chiffres, pourcentages, montants
- ACTIONNABLE: Le BA peut agir immediatement

# REGLES ABSOLUES

1. JAMAIS inventer de donnees - "Non disponible" si absent
2. TOUJOURS citer la source (Agent X, Slide Y, Context Engine Z)
3. CHAQUE contre-argument doit avoir un COMPARABLE ECHEC reel
4. QUANTIFIER chaque fois que possible (%, montants, probabilites)
5. CHAQUE kill reason = niveau + evidence + question + red flag si mauvaise reponse
6. Le worst case scenario doit etre REALISTE (pas apocalyptique gratuitement)
7. Les narratives alternatives doivent etre PLAUSIBLES (pas conspirationnistes)

# REGLES DE CONCISION CRITIQUES (pour eviter troncature JSON)

**PRIORITE ABSOLUE: Le JSON doit etre COMPLET et VALIDE.**

1. **LIMITES STRICTES sur les arrays**:
   - counterArguments: MAX 4 items (les plus importants)
   - killReasons: MAX 4 items (priorisés ABSOLUTE > CONDITIONAL > CONCERN)
   - blindSpots: MAX 3 items
   - alternativeNarratives: MAX 2 items
   - additionalMarketRisks: MAX 3 items
   - hiddenCompetitiveThreats: MAX 2 items
   - executionChallenges: MAX 3 items
   - redFlags: MAX 5 items (les plus critiques)
   - questions: MAX 5 items (priorisés CRITICAL > HIGH)
   - triggers, cascadeEffects, earlyWarningSigns: MAX 3 items chacun
   - comparableCatastrophes: MAX 2 items

2. **BREVITE dans les textes**:
   - justification/rationale: 1-2 phrases MAX
   - description: 2-3 phrases MAX
   - evidence: 1 phrase avec source
   - oneLiner: 15 mots MAX
   - summary: 3-4 phrases MAX
   - keyInsights: 3-4 items MAX, 10 mots chacun

3. **Pas de redondance**:
   - Ne pas répéter la même info dans différents champs
   - Si un risque est dans killReasons, pas besoin de le dupliquer ailleurs

4. **Structure > Contenu**: Mieux vaut 3 counter-arguments complets que 8 tronqués

# EXEMPLES

## BON output - Counter-argument:
{
  "thesis": "L'equipe a un track record exceptionnel - le CEO a scale sa precedente startup de 0 a 50M€ ARR",
  "thesisSource": "team-investigator",
  "counterArgument": "Le contexte etait radicalement different: marche pre-COVID en hypercroissance, levee de 100M€, equipe de 200 personnes. Ici c'est un marche mature avec 2M€ et 8 personnes.",
  "evidence": "Precedente startup: Fintech 2018-2021 (pre-rate hike), TAM x3 pendant COVID. Cette startup: EdTech 2024, marche -47% YoY (source: Context Engine).",
  "comparableFailure": {
    "company": "Classcraft",
    "sector": "EdTech",
    "fundingRaised": 27000000,
    "similarity": "Meme segment (gamification education), fondateur avec track record, timing post-COVID",
    "outcome": "Fermeture en 2023 apres avoir leve 27M$. Impossible de scaler dans un marche en contraction.",
    "lessonsLearned": "Le track record ne compense pas un mauvais timing marche",
    "source": "TechCrunch, CB Insights"
  },
  "probability": "MEDIUM",
  "probabilityRationale": "40% de chance que le meme pattern se reproduise: marche froid + burn eleve",
  "mitigationPossible": true,
  "mitigation": "Reduire le burn de 50%, focus profitabilite avant croissance"
}

## MAUVAIS output - Counter-argument (A EVITER):
{
  "thesis": "Bonne equipe",
  "counterArgument": "L'equipe pourrait echouer",
  "probability": "MEDIUM"
}
→ Pas de source, pas de comparable, pas de quantification, inutile.

## BON output - Kill reason:
{
  "reason": "CTO introuvable sur LinkedIn - background non verifiable",
  "category": "team",
  "evidence": "team-investigator: 'LinkedIn CTO: AUCUN RESULTAT. Claim deck: Ex-Google Senior Engineer - AUCUNE preuve trouvee.'",
  "sourceAgent": "team-investigator",
  "dealBreakerLevel": "CONDITIONAL",
  "condition": "Si le fondateur ne peut pas fournir de preuve d'emploi Google dans les 48h",
  "resolutionPossible": true,
  "resolutionPath": "Demander badge Google, contrat de travail, ou reference d'un ex-collegue Google",
  "impactIfIgnored": "Risque de fraude sur le CV technique. Si le CTO n'a pas l'experience revendiquee, la roadmap technique est a risque.",
  "questionToFounder": "Pouvez-vous fournir une preuve de l'emploi de votre CTO chez Google? Badge, contrat, ou contact d'un ancien manager?",
  "redFlagAnswer": "Reponse evasive, delai, ou refus de fournir des preuves"
}`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<DevilsAdvocateData> {
    this._dealStage = context.deal.stage;
    const deal = context.deal;
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
- Valorisation demandee: ${deal.valuationPre ? `€${Number(deal.valuationPre).toLocaleString()}` : "Non specifiee"}
- ARR: ${deal.arr ? `€${Number(deal.arr).toLocaleString()}` : "Non specifie"}

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

3. **KILL REASONS**: 2-4 raisons de ne pas investir, classees par niveau (ABSOLUTE > CONDITIONAL > CONCERN).

4. **BLIND SPOTS**: 2-3 angles morts critiques que les agents n'ont pas couvert.

5. **NARRATIVES ALTERNATIVES**: 1-2 narratives alternatives plausibles.

6. **SCORE DE SCEPTICISME**: Score + verdict + 3-4 facteurs principaux.

7. **QUESTIONS PIEGES**: 3-5 questions critiques pour le fondateur.

## OUTPUT ATTENDU

Produis une analyse Devil's Advocate COMPLETE au format JSON specifie.
Standard: Partner VC ultra-sceptique + Analyste Big4 rigoureux.

**REGLES DE CONCISION CRITIQUES (le JSON sera INVALIDE si tronque):**
- counterArguments: MAX 4 items
- killReasons: MAX 4 items
- blindSpots: MAX 3 items
- alternativeNarratives: MAX 2 items
- redFlags: MAX 5 items
- questions: MAX 5 items
- Justifications: 1-2 phrases MAX
- Descriptions: 2-3 phrases MAX
- PRIORITE: JSON complet > quantité d'items

\`\`\`json
{
  "meta": {
    "dataCompleteness": "complete" | "partial" | "minimal",
    "confidenceLevel": 0-100,
    "limitations": ["Ce qui n'a pas pu etre analyse"]
  },
  "score": {
    "value": 0-100,
    "grade": "A" | "B" | "C" | "D" | "F",
    "breakdown": [
      {
        "criterion": "Skepticism Level",
        "weight": 30,
        "score": 0-100,
        "justification": "..."
      },
      {
        "criterion": "Kill Reasons Severity",
        "weight": 25,
        "score": 0-100,
        "justification": "..."
      },
      {
        "criterion": "Worst Case Probability",
        "weight": 20,
        "score": 0-100,
        "justification": "..."
      },
      {
        "criterion": "Blind Spots Count",
        "weight": 15,
        "score": 0-100,
        "justification": "..."
      },
      {
        "criterion": "Alternative Narrative Plausibility",
        "weight": 10,
        "score": 0-100,
        "justification": "..."
      }
    ]
  },
  "findings": {
    "counterArguments": [...],
    "worstCaseScenario": {...},
    "killReasons": [...],
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
  },
  "redFlags": [...],
  "questions": [...],
  "alertSignal": {...},
  "narrative": {...}
}
\`\`\``;

    const { data } = await this.llmCompleteJSON<LLMDevilsAdvocateResponse>(prompt);

    const result = this.normalizeResponse(data, deal.name);

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
    const validRecommendations = ["PROCEED", "PROCEED_WITH_CAUTION", "INVESTIGATE_FURTHER", "STOP"] as const;
    const validVerdicts = ["VERY_SKEPTICAL", "SKEPTICAL", "CAUTIOUS", "NEUTRAL", "CAUTIOUSLY_OPTIMISTIC"] as const;
    const validDealBreakerLevels = ["ABSOLUTE", "CONDITIONAL", "CONCERN"] as const;
    const validProbabilities = ["HIGH", "MEDIUM", "LOW"] as const;
    const validDifficulties = ["EXTREME", "VERY_HARD", "HARD", "MODERATE"] as const;
    const validUrgencies = ["IMMEDIATE", "BEFORE_DECISION", "DURING_DD"] as const;
    const validClaimVerdicts = ["STANDS", "WEAKENED", "INVALIDATED"] as const;
    const validDbVerdicts = ["VERIFIED", "CONTRADICTED", "PARTIAL", "NOT_VERIFIABLE"] as const;
    const validMarketSeverities = ["EXISTENTIAL", "SERIOUS", "MANAGEABLE"] as const;

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

    // Normalize score
    const rawScoreValue = data.score?.value;
    const scoreIsFallback = rawScoreValue === undefined || rawScoreValue === null;
    if (scoreIsFallback) {
      console.warn(`[devils-advocate] LLM did not return score value — using 0`);
    }
    const score: AgentScore = {
      value: scoreIsFallback ? 0 : Math.min(100, Math.max(0, rawScoreValue)),
      grade: scoreIsFallback ? "F" : (validGrades.includes(data.score?.grade as (typeof validGrades)[number])
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

    // Normalize kill reasons
    const killReasons: KillReason[] = Array.isArray(data.findings?.killReasons)
      ? data.findings.killReasons.map((kr, idx) => ({
          id: kr.id ?? `kr-${idx + 1}`,
          reason: kr.reason ?? "",
          category: (kr.category ?? "other") as KillReason["category"],
          evidence: kr.evidence ?? "",
          sourceAgent: kr.sourceAgent ?? "unknown",
          dealBreakerLevel: validDealBreakerLevels.includes(kr.dealBreakerLevel as (typeof validDealBreakerLevels)[number])
            ? (kr.dealBreakerLevel as (typeof validDealBreakerLevels)[number])
            : "CONCERN",
          condition: kr.condition,
          resolutionPossible: kr.resolutionPossible ?? false,
          resolutionPath: kr.resolutionPath,
          impactIfIgnored: kr.impactIfIgnored ?? "",
          questionToFounder: kr.questionToFounder ?? "",
          redFlagAnswer: kr.redFlagAnswer ?? "",
        }))
      : [];

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

    // Build findings
    const findings: DevilsAdvocateFindings = {
      counterArguments,
      worstCaseScenario,
      killReasons,
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
        // If LLM didn't return a score, derive from kill reasons + concerns
        const fallbackScore = !hasScore
          ? Math.min(100, Math.max(20,
              (killReasons.filter(kr => kr.dealBreakerLevel === "ABSOLUTE").length * 25) +
              (killReasons.filter(kr => kr.dealBreakerLevel === "CONDITIONAL").length * 15) +
              (counterArguments.filter(ca => ca.probability === "HIGH").length * 10) +
              20 // base skepticism (DA is inherently skeptical)
            ))
          : 0; // unused
        if (!hasScore) {
          console.warn(`[devils-advocate] LLM did not return skepticismAssessment.score — derived ${fallbackScore} from kill reasons/concerns`);
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
            : "CAUTIOUS",
          verdictRationale: data.findings?.skepticismAssessment?.verdictRationale ?? "",
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

    // Normalize alert signal
    const alertSignal: AgentAlertSignal = {
      hasBlocker: data.alertSignal?.hasBlocker ?? false,
      blockerReason: data.alertSignal?.blockerReason,
      recommendation: validRecommendations.includes(
        data.alertSignal?.recommendation as (typeof validRecommendations)[number]
      )
        ? (data.alertSignal.recommendation as (typeof validRecommendations)[number])
        : "PROCEED_WITH_CAUTION",
      justification: data.alertSignal?.justification ?? "",
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
}

export const devilsAdvocate = new DevilsAdvocateAgent();
