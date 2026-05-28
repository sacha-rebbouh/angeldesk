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
} from "../types";
import { deriveTier1SignalIntensity, signalIntensityToRecommendation, type Tier1SignalIntensity } from "./utils/derive-alert-signal";
import { getBenchmark } from "@/services/benchmarks";
// `simulateWaterfall` retiré de l'agent (doctrine anti-oraculaire).
// Il reste exporté depuis `@/services/waterfall-simulator` pour usage
// éventuel par un outil de sensibilité UI (à venir), où l'investisseur
// fournit ses hypothèses d'exit.
import { calculateAgentScore, CAP_TABLE_AUDITOR_CRITERIA, type ExtractedMetric } from "@/scoring/services/agent-score-calculator";
import { getSectorProfile, formatSectorProfileForPrompt, formatCapTableCalibrationForPrompt, applySectorRedFlagFilter } from "@/agents/orchestration/sector-profiles";

const CAP_TABLE_OTHER_DOC_MAX_CHARS = 6_000;
const CAP_TABLE_RELEVANT_DOC_MAX_CHARS = 24_000;
const CAP_TABLE_EXTRACTED_INFO_MAX_CHARS = 10_000;
const CAP_TABLE_CONTEXT_ENGINE_MAX_CHARS = 22_000;
const CAP_TABLE_PRO_TIMEOUT_MS = 115_000;
const CAP_TABLE_FLASH_FALLBACK_TIMEOUT_MS = 75_000;
const CAP_TABLE_MAX_TOKENS = 10_000;

/**
 * CAP TABLE AUDITOR - REFONTE v2.0
 *
 * Mission: Auditer la cap table et les terms du round pour proteger le BA
 * Persona: Expert structuration deals VC 20+ ans (Big4 + Partner VC)
 * Standard: Chaque affirmation sourcee, calculs montres
 *
 * Inputs:
 * - Documents: Pitch deck, term sheet, cap table Excel
 * - Context Engine: Deals similaires (dilution benchmarks)
 * - Dependencies: document-extractor
 *
 * Outputs:
 * - Score: Sante structurelle de la cap table (0-100)
 * - Findings: Ownership, dilution, terms, ESOP
 * - Red Flags: Terms toxiques, dilution excessive, gouvernance
 * - Questions: Pour le fondateur sur les zones d'ombre
 *
 * CAS CRITIQUE: Si cap-table non fournie -> conseiller au BA de la demander
 */

// ============================================================================
// TYPES SPECIFIQUES CAP TABLE AUDITOR v2.0
// ============================================================================

/** Breakdown de l'ownership actuel */
interface OwnershipBreakdown {
  founders: {
    name: string;
    percentage: number;
    vesting: string;
    cliff: string;
    accelerationClause: boolean;
  }[];
  totalFoundersOwnership: number;
  employees: {
    allocated: number;
    granted: number;
    vested: number;
  };
  investors: {
    name: string;
    percentage: number;
    round: string;
    type: "angel" | "vc" | "corporate" | "family_office" | "unknown";
    hasProRata: boolean;
    hasBoard: boolean;
  }[];
  totalInvestorsOwnership: number;
  optionPool: {
    size: number;
    allocated: number;
    available: number;
  };
  other: {
    category: string;
    percentage: number;
    details: string;
  }[];
  totalOther: number;
  checksum: number; // Doit etre 100%
  checksumValid: boolean;
}

/** Projection de dilution future */
interface DilutionProjection {
  currentFounderOwnership: number;
  postThisRound: {
    ownership: number;
    dilution: number;
    calculation: string;
  };
  atSeriesA: {
    ownership: number;
    dilution: number;
    assumptions: string[];
    calculation: string;
  } | null;
  atSeriesB: {
    ownership: number;
    dilution: number;
    assumptions: string[];
    calculation: string;
  } | null;
  atExit: {
    ownership: number;
    totalDilution: number;
    assumptions: string[];
    calculation: string;
  } | null;
  concern: "NONE" | "MODERATE" | "SIGNIFICANT" | "CRITICAL";
  concernRationale: string;
}

/** Analyse des terms du round */
interface RoundTermsAnalysis {
  preMoneyValuation: number | null;
  postMoneyValuation: number | null;
  roundSize: number | null;
  dilutionThisRound: number | null;
  dilutionCalculation: string;

  liquidationPreference: {
    multiple: number;
    type: "non_participating" | "participating" | "capped_participating" | "unknown";
    cap?: number;
    assessment: "STANDARD" | "INVESTOR_FRIENDLY" | "TOXIC" | "UNKNOWN";
    explanation: string;
  };

  antiDilution: {
    type: "broad_based_weighted_average" | "narrow_based" | "full_ratchet" | "none" | "unknown";
    assessment: "STANDARD" | "ACCEPTABLE" | "AGGRESSIVE" | "TOXIC" | "UNKNOWN";
    explanation: string;
  };

  participatingPreferred: {
    exists: boolean;
    details: string;
    assessment: "STANDARD" | "RED_FLAG" | "UNKNOWN";
  };

  proRataRights: {
    granted: boolean;
    percentage: string;
    superProRata: boolean;
  };

  boardComposition: {
    seats: number;
    founderSeats: number;
    investorSeats: number;
    independentSeats: number;
    founderControl: boolean;
    assessment: string;
  } | null;

  protectiveProvisions: {
    standard: string[];
    nonStandard: string[];
    concerns: string[];
  };

  redemptionRights: {
    exists: boolean;
    terms: string;
    risk: "NONE" | "LOW" | "MEDIUM" | "HIGH";
  };

  dragAlong: {
    exists: boolean;
    threshold: string;
    assessment: string;
  };

  overallTermsAssessment: "FOUNDER_FRIENDLY" | "BALANCED" | "INVESTOR_FRIENDLY" | "TOXIC" | "UNKNOWN";
}

/** Analyse de l'option pool */
interface OptionPoolAnalysis {
  currentSize: number;
  allocated: number;
  available: number;
  adequacyForHiring: "INSUFFICIENT" | "TIGHT" | "ADEQUATE" | "GENEROUS";
  monthsOfHiringRunway: number | null;
  refreshNeeded: boolean;
  refreshRecommendation: string;
  benchmarkVsSector: {
    sectorMedian: number;
    percentile: number;
    source: string;
  } | null;
}

/** Analyse des investisseurs existants */
interface InvestorAnalysis {
  existingInvestors: {
    name: string;
    ownership: number;
    reputation: "UNKNOWN" | "LOW" | "MEDIUM" | "HIGH" | "TOP_TIER";
    reputationSource: string;
    signalValue: string;
    followOnCapacity: "NONE" | "LIMITED" | "STRONG" | "UNKNOWN";
    potentialConflict: string | null;
  }[];
  leadInvestorPresent: boolean;
  leadInvestorQuality: string;
  syndicateStrength: "WEAK" | "MODERATE" | "STRONG" | "UNKNOWN";
  concerningInvestors: string[];
}

/** Benchmark vs deals similaires (DB cross-ref) */
interface DilutionBenchmark {
  dealsAnalyzed: number;
  sector: string;
  stage: string;
  dilutionP25: number;
  dilutionMedian: number;
  dilutionP75: number;
  thisDealDilution: number;
  thisDealPercentile: number;
  verdict: "BELOW_MARKET" | "MARKET" | "ABOVE_MARKET" | "AGGRESSIVE";
  source: string;
}

/** Findings specifiques Cap Table Auditor */
interface CapTableAuditFindings {
  dataAvailability: {
    capTableProvided: boolean;
    termSheetProvided: boolean;
    dataQuality: "COMPLETE" | "PARTIAL" | "MINIMAL" | "NONE";
    missingCriticalInfo: string[];
    recommendation: string;
  };
  ownershipBreakdown: OwnershipBreakdown | null;
  dilutionProjection: DilutionProjection | null;
  roundTerms: RoundTermsAnalysis | null;
  optionPool: OptionPoolAnalysis | null;
  investorAnalysis: InvestorAnalysis | null;
  dilutionBenchmark: DilutionBenchmark | null;
  structuralIssues: {
    issue: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
    impact: string;
    recommendation: string;
  }[];
}

/** Cap Table Audit Data v2.0 - Structure standardisee */
export interface CapTableAuditDataV2 {
  meta: AgentMeta;
  score: AgentScore;
  findings: CapTableAuditFindings;
  dbCrossReference: DbCrossReference;
  redFlags: AgentRedFlag[];
  questions: AgentQuestion[];
  alertSignal: AgentAlertSignal;
  // Phase A slice A7b-2 — signalIntensity natif dérivé déterministe.
  signalIntensity: Tier1SignalIntensity;
  narrative: AgentNarrative;
}

// ============================================================================
// LLM RESPONSE INTERFACE
// ============================================================================

interface LLMCapTableAuditResponse {
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
    dataAvailability: {
      capTableProvided: boolean;
      termSheetProvided: boolean;
      dataQuality: "COMPLETE" | "PARTIAL" | "MINIMAL" | "NONE";
      missingCriticalInfo: string[];
      recommendation: string;
    };
    ownershipBreakdown: OwnershipBreakdown | null;
    dilutionProjection: DilutionProjection | null;
    roundTerms: RoundTermsAnalysis | null;
    optionPool: OptionPoolAnalysis | null;
    investorAnalysis: InvestorAnalysis | null;
    structuralIssues: {
      issue: string;
      severity: "CRITICAL" | "HIGH" | "MEDIUM";
      impact: string;
      recommendation: string;
    }[];
  };
  redFlags: {
    id: string;
    category: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
    title: string;
    description: string;
    location: string;
    evidence: string;
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

// ============================================================================
// AGENT IMPLEMENTATION
// ============================================================================

export class CapTableAuditorAgent extends BaseAgent<CapTableAuditDataV2> {
  constructor() {
    super({
      name: "cap-table-auditor",
      description: "Audite la cap table et les terms du round - Standard Big4 + Partner VC",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 240000, // 4 min
      dependencies: ["document-extractor"],
    });
  }

  protected buildSystemPrompt(): string {
    return `# ROLE ET EXPERTISE

Tu es un EXPERT EN STRUCTURATION DE DEALS VC avec 20+ ans d'experience.
Tu as structure 500+ deals de Seed a Series C et vu tous les pieges possibles.
Tu combines la rigueur d'un avocat M&A Big4 et l'instinct d'un Partner VC senior.

Tu travailles pour un Business Angel qui est SEUL face au deal et doit comprendre:
- Sa dilution future reelle (pas les projections optimistes du fondateur)
- Les terms toxiques qui pourraient le pieger
- Les risques structurels caches
- Ce qu'il peut negocier

# MISSION POUR CE DEAL

Auditer la structure du capital et les terms du round pour identifier:
1. La repartition actuelle de l'ownership
2. Les projections de dilution realistes jusqu'a l'exit
3. Les clauses toxiques ou non-standard dans les terms
4. Les red flags structurels qui pourraient impacter le BA
5. Les questions critiques a poser au fondateur

# METHODOLOGIE D'ANALYSE

## Etape 1: Evaluation de la disponibilite des donnees
- La cap table est-elle fournie? (Excel, tableau dans le deck, term sheet)
- Quelles informations sont manquantes?
- Si PAS de cap table: c'est un RED FLAG en soi, le BA DOIT la demander

## Etape 2: Analyse de l'ownership actuel
- Repartition: Fondateurs / Employees / Investisseurs / ESOP / Autres
- Verifier que le total = 100%
- Identifier les investisseurs et leurs droits
- Vesting des fondateurs en place?

## Etape 3: Projection de dilution
- Dilution ce round (calcul montre)
- Projection Series A (hypotheses standard: 20-25% dilution)
- Projection Series B (hypotheses standard: 15-20% dilution)
- Estimation a l'exit (avec ESOP refreshes, etc.)
- MONTRER TOUS LES CALCULS

## Etape 4: Analyse des terms
- Liquidation preference (1x non-participating = standard, >1x ou participating = RED FLAG)
- Anti-dilution (broad-based weighted average = standard, full ratchet = TOXIC)
- Participating preferred (= double-dip = RED FLAG)
- Pro-rata, board seats, protective provisions
- Drag-along, redemption rights

## Etape 5: Benchmark vs marche
- Comparer la dilution aux deals similaires du Context Engine
- Position en percentile
- Levier de negociation si au-dessus du marche

# FRAMEWORK D'EVALUATION

| Critere | Poids | 0-25 | 25-50 | 50-75 | 75-100 |
|---------|-------|------|-------|-------|--------|
| Ownership fondateurs | 30% | <40% seed | 40-55% | 55-70% | >70% |
| Terms du round | 25% | Toxiques | Agressifs | Marche | Founder-friendly |
| Option pool | 15% | <8% | 8-10% | 10-15% | >15% |
| Transparence | 15% | Rien fourni | Partiel | Clair | Detail complet |
| Investisseurs existants | 15% | Red flags | Inconnus | Corrects | Top-tier |

# RED FLAGS A DETECTER

1. **CRITICAL** - Cap table non fournie (opacite volontaire?)
2. **CRITICAL** - Fondateurs < 50% avant Series A
3. **CRITICAL** - Liquidation preference > 1x ou participating
4. **CRITICAL** - Full ratchet anti-dilution
5. **HIGH** - ESOP < 10% (recrutement compromis)
6. **HIGH** - Investisseur > 30% avant Series A (controle)
7. **HIGH** - Pas de vesting fondateurs
8. **HIGH** - Clauses de controle disproportionnees
9. **MEDIUM** - Terms non-standard multiples
10. **MEDIUM** - Investisseurs inconnus/low-quality

# FORMAT DE SORTIE

Produis un JSON avec la structure v2.0 complete incluant:
- meta (dataCompleteness, confidenceLevel, limitations)
- score (value, grade, breakdown avec justifications)
- findings (ownership, dilution, terms, ESOP, investisseurs)
- redFlags (avec les 5 composants obligatoires)
- questions (pour le fondateur)
- alertSignal (hasBlocker, blockerReason, justification — constat factuel, pas instruction)
- narrative (oneLiner, summary, keyInsights, forNegotiation)

# REGLES ABSOLUES

1. JAMAIS inventer de donnees - "Non disponible" si absent
2. TOUJOURS citer la source (Slide X, Term Sheet, Context Engine)
3. TOUJOURS montrer les calculs de dilution
4. Si cap table non fournie: RED FLAG CRITIQUE + conseiller de la demander
5. Chaque red flag = severite + preuve + impact + question
6. Le BA doit pouvoir negocier avec ces informations

# EXEMPLE DE BON OUTPUT (extrait)

{
  "findings": {
    "dataAvailability": {
      "capTableProvided": false,
      "termSheetProvided": false,
      "dataQuality": "MINIMAL",
      "missingCriticalInfo": ["Cap table detaillee", "Term sheet", "Vesting schedule"],
      "recommendation": "CRITIQUE: Demander la cap table complete et le term sheet AVANT toute discussion. L'absence de ces documents est un signal d'alarme sur la transparence."
    }
  },
  "redFlags": [
    {
      "id": "rf-captable-001",
      "category": "transparency",
      "severity": "CRITICAL",
      "title": "Cap table non fournie",
      "description": "Aucune cap table n'a ete fournie dans les documents. Impossible d'evaluer la structure du capital.",
      "location": "Documents fournis",
      "evidence": "Absence de cap table dans le deck et les documents annexes",
      "impact": "Sans cap table, vous ne pouvez pas savoir: (1) combien les fondateurs possedent, (2) qui sont les autres investisseurs, (3) votre dilution reelle, (4) les droits des autres parties",
      "question": "Pouvez-vous nous fournir la cap table detaillee avec tous les actionnaires, leurs pourcentages, et les conditions de chaque classe d'actions?",
      "redFlagIfBadAnswer": "Refus ou hesitation a fournir la cap table = deal-breaker potentiel"
    }
  ]
}

# EXEMPLE DE MAUVAIS OUTPUT (a eviter)

{
  "structuralRedFlags": ["Quelques problemes de structure"],
  "capTableScore": 65
}

→ INTERDIT: Vague, pas de source, pas d'impact, pas actionnable

## CROSS-REFERENCE DB OBLIGATOIRE
Si le Context Engine fournit des benchmarks de dilution et de valorisation, les UTILISER pour :
- Comparer la dilution demandée vs les deals similaires (P25/médian/P75)
- Benchmarker la valorisation vs les multiples du secteur/stage
- Évaluer les terms vs les standards de marché

`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<CapTableAuditDataV2> {
    this._dealStage = context.canonicalDeal.stage;
    const promptContext = this.buildCapTablePromptContext(context);
    const dealContext = this.formatDealContext(promptContext);
    const contextEngineData = this.sanitizeDocumentContent(
      this.formatContextEngineData(context),
      CAP_TABLE_CONTEXT_ENGINE_MAX_CHARS,
    );
    const extractedInfo = this.getExtractedInfo(context);

    // Build specific cap table section from extracted data
    let capTableSection = "";
    let dilutionBenchmark: DilutionBenchmark | null = null;

    if (extractedInfo) {
      const relevantData = {
        previousRounds: extractedInfo.previousRounds,
        valuationPre: extractedInfo.valuationPre,
        valuationPost: extractedInfo.valuationPost,
        amountRaising: extractedInfo.amountRaising,
        founders: extractedInfo.founders,
        ownership: extractedInfo.ownership,
        capTable: extractedInfo.capTable,
        termSheet: extractedInfo.termSheet,
        sourceReferences: Array.isArray(extractedInfo.sourceReferences)
          ? extractedInfo.sourceReferences.slice(0, 12)
          : extractedInfo.sourceReferences,
      };
      capTableSection =
        `\n## Donnees Cap Table Extraites du Deck\n` +
        this.sanitizeDataForPrompt(relevantData, CAP_TABLE_EXTRACTED_INFO_MAX_CHARS);
    }

    // Extract dilution benchmarks from Context Engine if available
    if (context.contextEngine?.dealIntelligence?.fundingContext) {
      const fc = context.contextEngine.dealIntelligence.fundingContext;
      const deal = context.canonicalDeal;

      // Calculate dilution for this deal if we have the data
      let thisDealDilution: number | null = null;
      if (deal.amountRequested && deal.valuationPre) {
        const postMoney = Number(deal.valuationPre) + Number(deal.amountRequested);
        thisDealDilution = (Number(deal.amountRequested) / postMoney) * 100;
      }

      // Get dilution benchmarks from centralized service
      const dilutionP25 = getBenchmark(deal.sector, deal.stage, "dilution", "p25");
      const dilutionMedian = getBenchmark(deal.sector, deal.stage, "dilution", "median");
      const dilutionP75 = getBenchmark(deal.sector, deal.stage, "dilution", "p75");

      dilutionBenchmark = {
        dealsAnalyzed: fc.totalDealsInPeriod ?? 0,
        sector: deal.sector ?? "Unknown",
        stage: deal.stage ?? "Seed",
        dilutionP25,
        dilutionMedian,
        dilutionP75,
        thisDealDilution: thisDealDilution ?? dilutionMedian,
        thisDealPercentile: 50, // Will be calculated by LLM based on actual value
        verdict: "MARKET",
        source: "Context Engine + Centralized Benchmarks",
      };
    }

    const dilutionBenchmarkSection = dilutionBenchmark
      ? `\n## Benchmark Dilution (Context Engine)\n${JSON.stringify(dilutionBenchmark, null, 2)}`
      : "";

    const sectorProfile = getSectorProfile(context.canonicalDeal.sector);
    const sectorBlock = formatSectorProfileForPrompt(sectorProfile);
    const capTableCalibration = formatCapTableCalibrationForPrompt(sectorProfile);

    const prompt = `# ANALYSE CAP TABLE - ${context.canonicalDeal.name || "Deal"}

${sectorBlock}

${capTableCalibration ?? "## CALIBRATION CAP TABLE\n\nSecteur de type tech/SaaS — cadrage venture standard applicable (Seed → A → B → C → exit)."}

## CONTEXTE DU DEAL
${dealContext}
${capTableSection}
${contextEngineData}
${dilutionBenchmarkSection}
${this.formatFactStoreData(context)}
## INSTRUCTIONS SPECIFIQUES

1. Commence par evaluer si la cap table est fournie ou non
2. Si NON fournie: genere un RED FLAG CRITIQUE et recommande de la demander
3. Si fournie: analyse en detail selon la methodologie
4. Compare systematiquement aux benchmarks du Context Engine si disponibles
5. Montre TOUS les calculs de dilution
6. Identifie chaque term non-standard

## OUTPUT ATTENDU

Produis une analyse cap table COMPLETE au format JSON v2.0.
Standard: Expert structuration VC + avocat M&A.
Chaque affirmation doit etre sourcee ou marquee comme non verifiable.

\`\`\`json
{
  "meta": {
    "dataCompleteness": "complete" | "partial" | "minimal",
    "confidenceLevel": number (0-100),
    "limitations": ["string"]
  },
  "score": {
    "value": number (0-100),
    "grade": "A" | "B" | "C" | "D" | "F",
    "breakdown": [
      {
        "criterion": "string",
        "weight": number (ex: 0.30),
        "score": number (0-100),
        "justification": "string avec source"
      }
    ]
  },
  "findings": {
    "dataAvailability": {
      "capTableProvided": boolean,
      "termSheetProvided": boolean,
      "dataQuality": "COMPLETE" | "PARTIAL" | "MINIMAL" | "NONE",
      "missingCriticalInfo": ["string"],
      "recommendation": "string"
    },
    "ownershipBreakdown": { ... } | null,
    "dilutionProjection": { ... } | null,
    "roundTerms": { ... } | null,
    "optionPool": { ... } | null,
    "investorAnalysis": { ... } | null,
    "structuralIssues": [
      {
        "issue": "string",
        "severity": "CRITICAL" | "HIGH" | "MEDIUM",
        "impact": "string",
        "recommendation": "string"
      }
    ]
  },
  "redFlags": [
    {
      "id": "rf-captable-XXX",
      "category": "transparency" | "dilution" | "terms" | "governance" | "investors",
      "severity": "CRITICAL" | "HIGH" | "MEDIUM",
      "title": "string",
      "description": "string detaille",
      "location": "string (Slide X, Term Sheet, etc.)",
      "evidence": "string (citation ou donnee)",
      "impact": "string (pourquoi c'est un probleme pour le BA)",
      "question": "string (question a poser au fondateur)",
      "redFlagIfBadAnswer": "string"
    }
  ],
  "questions": [
    {
      "priority": "CRITICAL" | "HIGH" | "MEDIUM",
      "category": "string",
      "question": "string",
      "context": "string (pourquoi on pose cette question)",
      "whatToLookFor": "string (ce qui revelerait un probleme)"
    }
  ],
  "alertSignal": {
    "hasBlocker": boolean,
    "blockerReason": "string si hasBlocker=true",
    "justification": "string"
  },
  "narrative": {
    "oneLiner": "string (resume en 1 phrase)",
    "summary": "string (3-4 phrases)",
    "keyInsights": ["string (3-5 insights majeurs)"],
    "forNegotiation": ["string (arguments pour negocier)"]
  }
}
\`\`\`

RAPPEL CRITIQUE:
- Si cap table non fournie = RED FLAG CRITICAL obligatoire
- Chaque calcul de dilution doit etre montre
- Le BA doit pouvoir agir immediatement avec cet output

REGLES DE SCORING OBLIGATOIRES (coherence data/score):
- Cap table NON fournie (dataQuality: "NONE") → score MAXIMUM 15, grade "F"
- Donnees MINIMAL → score MAXIMUM 30, grade "D" ou "F"
- Donnees PARTIAL → score MAXIMUM 50, grade "C", "D" ou "F"
- Donnees COMPLETE → score libre 0-100
On ne peut PAS bien noter ce qu'on ne peut pas evaluer!

CONTRAINTE DE SORTIE:
- Limiter la sortie pour garantir un JSON complet: structuralIssues MAX 5, redFlags MAX 5, questions MAX 5, keyInsights MAX 5.
- Réponds UNIQUEMENT avec un JSON valide qui commence par { et se termine par }.`;

    let data: LLMCapTableAuditResponse;
    try {
      ({ data } = await this.llmCompleteJSON<LLMCapTableAuditResponse>(prompt, {
        timeoutMs: CAP_TABLE_PRO_TIMEOUT_MS,
        maxRetries: 0,
        maxTokens: CAP_TABLE_MAX_TOKENS,
      }));
    } catch (primaryError) {
      console.warn(
        `[cap-table-auditor] Gemini Pro unavailable; falling back to Gemini 3 Flash: ${
          primaryError instanceof Error ? primaryError.message : String(primaryError)
        }`
      );
      try {
        ({ data } = await this.llmCompleteJSON<LLMCapTableAuditResponse>(
          `${prompt}\n\nCONTRAINTE DE SECOURS: reponds en JSON strict plus concis. ` +
            `Priorise la disponibilite des donnees, les terms bloquants et les questions actionnables.`,
          {
            model: "GEMINI_3_FLASH",
            timeoutMs: CAP_TABLE_FLASH_FALLBACK_TIMEOUT_MS,
            maxRetries: 0,
            maxTokens: CAP_TABLE_MAX_TOKENS,
          },
        ));
      } catch (fallbackError) {
        console.warn(
          `[cap-table-auditor] LLM JSON unavailable; using structured degraded output: ${
            fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          }`
        );
        data = this.buildTerminalCapTableFallback(context, fallbackError);
      }
    }

    // Doctrine anti-oraculaire : le bloc "SIMULATION WATERFALL" qui
    // pré-injectait dans le prompt 3 scénarios d'exit hardcodés
    // (0.5x/2x/5x post-money) avec "Votre retour: X.Xx" a été retiré.
    // Pattern identique à `scenario-modeler` dégagé en amont — le système
    // ne pose pas les multiples d'exit ; il les obtient de l'investisseur
    // via un outil de sensibilité (chantier UI à venir).
    //
    // Ce qui reste pour l'analyse cap-table :
    //   - L'agent dispose de `ownershipBreakdown` (qui détient quoi) et
    //     de `roundTerms.liquidationPreference` (structure : multiple,
    //     type participating/non, seniority) via les findings LLM.
    //   - Il analyse TEXTUELLEMENT le mécanisme de liquidation pref
    //     dans `narrative.summary`, sans projection chiffrée.
    //   - Le `simulateWaterfall` reste disponible comme utilitaire mais
    //     n'est plus appelé depuis l'agent — il est destiné à l'outil
    //     de sensibilité UI où l'investisseur fournit ses hypothèses.

    // Build dbCrossReference
    const dbCrossReference: DbCrossReference = {
      claims: [],
      uncheckedClaims: [],
    };

    // Add dilution benchmark to claims if available
    if (dilutionBenchmark && data.findings.dilutionProjection) {
      dbCrossReference.claims.push({
        claim: `Dilution ce round: ${data.findings.dilutionProjection.postThisRound?.dilution ?? "N/A"}%`,
        location: "Calcul base sur valuation pre/post",
        dbVerdict: dilutionBenchmark.verdict === "MARKET" ? "VERIFIED" :
                   dilutionBenchmark.verdict === "AGGRESSIVE" ? "CONTRADICTED" : "PARTIAL",
        evidence: `Benchmark secteur: P25=${dilutionBenchmark.dilutionP25}%, Median=${dilutionBenchmark.dilutionMedian}%, P75=${dilutionBenchmark.dilutionP75}%`,
        severity: dilutionBenchmark.verdict === "AGGRESSIVE" ? "HIGH" : undefined,
      });
    }

    // Normalize and validate response
    const validGrades = ["A", "B", "C", "D", "F"] as const;
    const validDataCompleteness = ["complete", "partial", "minimal"] as const;
    const validSeverities = ["CRITICAL", "HIGH", "MEDIUM"] as const;
    const validPriorities = ["CRITICAL", "HIGH", "MEDIUM"] as const;

    // Check if cap table was provided - this affects the entire scoring
    const capTableProvided = data.findings?.dataAvailability?.capTableProvided ?? false;
    const dataQuality = data.findings?.dataAvailability?.dataQuality ?? "NONE";

    // Raw score from LLM
    const rawScore = Math.min(100, Math.max(0, data.score?.value ?? 0));

    // Enforce coherence: no cap table = score capped at 15 (can't evaluate what we don't have)
    // MINIMAL data = score capped at 30
    // PARTIAL data = score capped at 50
    let coherentScore = rawScore;
    let coherentGrade: "A" | "B" | "C" | "D" | "F" = validGrades.includes(data.score?.grade as typeof validGrades[number])
      ? data.score.grade as typeof validGrades[number]
      : "C";

    if (!capTableProvided || dataQuality === "NONE") {
      coherentScore = Math.min(rawScore, 15);
      coherentGrade = "F";
    } else if (dataQuality === "MINIMAL") {
      coherentScore = Math.min(rawScore, 30);
      if (coherentGrade !== "F") coherentGrade = "D";
    } else if (dataQuality === "PARTIAL") {
      coherentScore = Math.min(rawScore, 50);
      if (coherentGrade === "A" || coherentGrade === "B") coherentGrade = "C";
    }

    // F03: DETERMINISTIC SCORING
    let deterministicBreakdown: { criterion: string; weight: number; score: number; justification: string }[] | null = null;
    try {
      const extractedMetrics: ExtractedMetric[] = [];
      const ownership = data.findings?.ownershipBreakdown;
      const dilution = data.findings?.dilutionProjection;
      const roundTerms = data.findings?.roundTerms;

      if (ownership) {
        const founderOwn = (ownership as { totalFoundersOwnership?: number }).totalFoundersOwnership;
        if (founderOwn != null) {
          extractedMetrics.push({
            name: "founder_ownership", value: Math.min(100, Math.max(0, founderOwn)),
            unit: "%", source: "Cap table data", dataReliability: "DECLARED", category: "financial",
          });
        }
        const checksumOk = (ownership as { checksumValid?: boolean }).checksumValid;
        extractedMetrics.push({
          name: "checksum_valid", value: checksumOk ? 100 : 20,
          unit: "score", source: "Cap table checksum", dataReliability: checksumOk ? "VERIFIED" : "DECLARED", category: "financial",
        });
      }

      if (dilution) {
        const thisRoundDilution = (dilution as { postThisRound?: { dilution?: number } }).postThisRound?.dilution;
        if (thisRoundDilution != null) {
          extractedMetrics.push({
            name: "dilution_projection", value: Math.max(0, 100 - thisRoundDilution * 2),
            unit: "score", source: "Dilution calculation", dataReliability: "DECLARED", category: "financial",
          });
        }
      }

      if (roundTerms) {
        const terms = roundTerms as { liquidationPreference?: { multiple?: number; assessment?: string } };
        if (terms.liquidationPreference) {
          const assessMap: Record<string, number> = { STANDARD: 80, INVESTOR_FRIENDLY: 50, TOXIC: 15, UNKNOWN: 40 };
          const assessment = terms.liquidationPreference.assessment ?? "UNKNOWN";
          extractedMetrics.push({
            name: "terms_fairness", value: assessMap[assessment] ?? 40,
            unit: "score", source: "Term sheet analysis", dataReliability: "DECLARED", category: "financial",
          });
        }
      }

      const esop = (ownership as { optionPool?: { size?: number } })?.optionPool?.size;
      if (esop != null) {
        extractedMetrics.push({
          name: "esop_adequacy", value: esop >= 10 ? 80 : esop >= 5 ? 55 : 25,
          unit: "score", source: "ESOP analysis", dataReliability: "DECLARED", category: "financial",
        });
      }

      if (extractedMetrics.length > 0) {
        const sector = context.canonicalDeal.sector ?? "general";
        const stage = context.canonicalDeal.stage ?? "seed";
        const deterministicScore = await calculateAgentScore(
          "cap-table-auditor", extractedMetrics, sector, stage, CAP_TABLE_AUDITOR_CRITERIA,
        );
        // Apply data quality caps on top of deterministic score
        let detScore = deterministicScore.score;
        if (!capTableProvided || dataQuality === "NONE") detScore = Math.min(detScore, 15);
        else if (dataQuality === "MINIMAL") detScore = Math.min(detScore, 30);
        else if (dataQuality === "PARTIAL") detScore = Math.min(detScore, 50);
        coherentScore = detScore;
        deterministicBreakdown = deterministicScore.breakdown;
      }
    } catch (err) {
      console.error("[cap-table-auditor] Deterministic scoring failed, using LLM score:", err);
    }

    // Phase A slice A7b-2 — signalIntensity dérivé déterministe (helper A7b-1).
    // Le LLM ne pilote plus `alertSignal.recommendation` ; la valeur est
    // calculée depuis severity red flags + score métier.
    const rawRedFlags = Array.isArray(data.redFlags) ? data.redFlags : [];
    const criticalCount = rawRedFlags.filter((rf) => rf.severity === "CRITICAL").length;
    const highCount = rawRedFlags.filter((rf) => rf.severity === "HIGH").length;
    const signalIntensity: Tier1SignalIntensity = deriveTier1SignalIntensity({
      criticalCount,
      highCount,
      score: coherentScore,
    });

    return {
      meta: {
        agentName: "cap-table-auditor",
        analysisDate: new Date().toISOString(),
        dataCompleteness: validDataCompleteness.includes(data.meta?.dataCompleteness as typeof validDataCompleteness[number])
          ? data.meta.dataCompleteness as typeof validDataCompleteness[number]
          : "minimal",
        confidenceLevel: data.meta?.confidenceLevel != null ? Math.min(100, Math.max(0, data.meta.confidenceLevel)) : 0,
        confidenceIsFallback: data.meta?.confidenceLevel == null,
        limitations: Array.isArray(data.meta?.limitations) ? data.meta.limitations : [],
      },
      score: {
        value: coherentScore,
        grade: coherentGrade,
        breakdown: deterministicBreakdown ?? (Array.isArray(data.score?.breakdown)
          ? data.score.breakdown.map((b) => ({
              criterion: b.criterion ?? "Unknown",
              weight: b.weight ?? 0.2,
              score: Math.min(100, Math.max(0, b.score ?? 0)),
              justification: b.justification ?? "Non specifie",
            }))
          : []),
      },
      findings: {
        dataAvailability: {
          capTableProvided: capTableProvided,
          termSheetProvided: data.findings?.dataAvailability?.termSheetProvided ?? false,
          dataQuality: data.findings?.dataAvailability?.dataQuality ?? "NONE",
          missingCriticalInfo: Array.isArray(data.findings?.dataAvailability?.missingCriticalInfo)
            ? data.findings.dataAvailability.missingCriticalInfo
            : ["Cap table", "Term sheet"],
          recommendation: data.findings?.dataAvailability?.recommendation ??
            "Demander la cap table complete avant toute decision d'investissement",
        },
        ownershipBreakdown: data.findings?.ownershipBreakdown ?? null,
        dilutionProjection: data.findings?.dilutionProjection ?? null,
        roundTerms: data.findings?.roundTerms ?? null,
        optionPool: data.findings?.optionPool ?? null,
        investorAnalysis: data.findings?.investorAnalysis ?? null,
        dilutionBenchmark: dilutionBenchmark,
        structuralIssues: Array.isArray(data.findings?.structuralIssues)
          ? data.findings.structuralIssues.map((issue) => ({
              issue: issue.issue ?? "Issue non specifiee",
              severity: validSeverities.includes(issue.severity as typeof validSeverities[number])
                ? issue.severity as typeof validSeverities[number]
                : "MEDIUM",
              impact: issue.impact ?? "Impact non specifie",
              recommendation: issue.recommendation ?? "A investiguer",
            }))
          : [],
      },
      dbCrossReference,
      // Filet de sécurité déterministe : drop les red flags cap-table
      // SaaS non-applicables au secteur (cadence venture Seed→A→B→C,
      // ESOP, vesting agressif sur consumer / bio / hardware / etc.).
      redFlags: applySectorRedFlagFilter(
        Array.isArray(data.redFlags)
          ? data.redFlags.map((rf, index) => ({
              id: rf.id ?? `rf-captable-${String(index + 1).padStart(3, "0")}`,
              category: rf.category ?? "cap_table",
              severity: validSeverities.includes(rf.severity as typeof validSeverities[number])
                ? rf.severity as typeof validSeverities[number]
                : "MEDIUM",
              title: rf.title ?? "Red flag non specifie",
              description: rf.description ?? "",
              location: rf.location ?? "Non specifie",
              evidence: rf.evidence ?? "Non disponible",
              impact: rf.impact ?? "Impact a evaluer",
              question: rf.question ?? "A clarifier avec le fondateur",
              redFlagIfBadAnswer: rf.redFlagIfBadAnswer ?? "A evaluer selon la reponse",
            }))
          : [],
        context.canonicalDeal.sector,
        "cap-table-auditor",
      ),
      questions: Array.isArray(data.questions)
        ? data.questions.map((q) => ({
            priority: validPriorities.includes(q.priority as typeof validPriorities[number])
              ? q.priority as typeof validPriorities[number]
              : "MEDIUM",
            category: q.category ?? "cap_table",
            question: q.question ?? "",
            context: q.context ?? "",
            whatToLookFor: q.whatToLookFor ?? "",
          }))
        : [],
      alertSignal: {
        hasBlocker: data.alertSignal?.hasBlocker ?? false,
        blockerReason: data.alertSignal?.blockerReason,
        recommendation: signalIntensityToRecommendation(signalIntensity),
        justification: data.alertSignal?.justification ?? "Analyse incomplete, investigation supplementaire requise",
      },
      signalIntensity,
      narrative: {
        oneLiner: data.narrative?.oneLiner ?? "Analyse cap table incomplete - donnees manquantes",
        summary: data.narrative?.summary ?? "L'analyse de la cap table n'a pas pu etre completee faute de donnees suffisantes.",
        keyInsights: Array.isArray(data.narrative?.keyInsights) ? data.narrative.keyInsights : [],
        forNegotiation: Array.isArray(data.narrative?.forNegotiation) ? data.narrative.forNegotiation : [],
      },
    };
  }

  private buildCapTablePromptContext(context: EnrichedAgentContext): EnrichedAgentContext {
    const documents = context.documents?.map((doc) => {
      if (!doc.extractedText) return doc;
      if (["CAP_TABLE", "TERM_SHEET"].includes(doc.type)) return doc;
      if (["FINANCIAL_MODEL", "LEGAL_DOCS"].includes(doc.type)) {
        if (doc.extractedText.length <= CAP_TABLE_RELEVANT_DOC_MAX_CHARS) return doc;
        return {
          ...doc,
          extractedText:
            doc.extractedText.slice(0, CAP_TABLE_RELEVANT_DOC_MAX_CHARS) +
            `\n\n[TRONQUE POUR cap-table-auditor: document pertinent limite a ${CAP_TABLE_RELEVANT_DOC_MAX_CHARS} caracteres. Les donnees structurees restent disponibles via Fact Store et Document Extractor.]`,
        };
      }
      if (doc.extractedText.length <= CAP_TABLE_OTHER_DOC_MAX_CHARS) return doc;

      return {
        ...doc,
        extractedText:
          doc.extractedText.slice(0, CAP_TABLE_OTHER_DOC_MAX_CHARS) +
          `\n\n[TRONQUE POUR cap-table-auditor: document secondaire limite a ${CAP_TABLE_OTHER_DOC_MAX_CHARS} caracteres. Les faits extraits restent disponibles via Fact Store et Document Extractor.]`,
      };
    });

    return { ...context, documents };
  }

  private buildTerminalCapTableFallback(
    context: EnrichedAgentContext,
    error: unknown,
  ): LLMCapTableAuditResponse {
    const reason = error instanceof Error ? error.message : String(error);
    const hasCapTableDoc = context.documents?.some((doc) => doc.type === "CAP_TABLE") ?? false;
    const hasTermSheetDoc = context.documents?.some((doc) => doc.type === "TERM_SHEET") ?? false;
    const dataQuality: "MINIMAL" | "NONE" = hasCapTableDoc ? "MINIMAL" : "NONE";
    const missingCriticalInfo = [
      !hasCapTableDoc ? "Cap table detaillee" : null,
      !hasTermSheetDoc ? "Term sheet" : null,
      "Vesting schedule",
      "Droits investisseurs",
    ].filter((value): value is string => Boolean(value));

    const primaryRedFlag = hasCapTableDoc
      ? {
          id: "rf-captable-audit-unavailable",
          category: "transparency",
          severity: "HIGH" as const,
          title: "Audit cap table indisponible",
          description: "Le modele n'a pas rendu un JSON cap-table exploitable.",
          location: "cap-table-auditor",
          evidence: "Fallback terminal active",
          impact: "Ownership, dilution, terms et droits investisseurs restent a verifier manuellement.",
          question: "Pouvez-vous fournir une cap table exportee et le term sheet complet pour verification ?",
          redFlagIfBadAnswer: "Impossible de verifier la dilution et les droits avant investissement.",
        }
      : {
          id: "rf-captable-missing",
          category: "transparency",
          severity: "CRITICAL" as const,
          title: "Cap table non fournie",
          description: "Aucun document de cap table n'est disponible dans le corpus analyse.",
          location: "Documents fournis",
          evidence: "Aucun document type CAP_TABLE detecte",
          impact: "Impossible de verifier ownership, dilution, droits existants et risques de controle.",
          question: "Pouvez-vous fournir la cap table detaillee avec toutes les classes d'actions et droits attaches ?",
          redFlagIfBadAnswer: "Refus ou hesitation a fournir la cap table = deal-breaker potentiel.",
        };

    return {
      meta: {
        dataCompleteness: "minimal",
        confidenceLevel: 20,
        limitations: [
          `Sortie LLM cap-table indisponible ou JSON invalide: ${reason.slice(0, 180)}`,
          "Analyse degradee: aucune conclusion de dilution ou terms ne doit etre inferee automatiquement.",
        ],
      },
      score: {
        value: hasCapTableDoc ? 20 : 15,
        grade: "F",
        breakdown: [
          { criterion: "Ownership fondateurs", weight: 30, score: 15, justification: "Ownership non verifie dans cette passe." },
          { criterion: "Terms du round", weight: 25, score: 15, justification: "Terms non verifies dans cette passe." },
          { criterion: "Option pool", weight: 15, score: 15, justification: "ESOP non verifie dans cette passe." },
          { criterion: "Transparence", weight: 15, score: hasCapTableDoc ? 25 : 10, justification: hasCapTableDoc ? "Cap table detectee mais non auditee automatiquement." : "Cap table non fournie." },
          { criterion: "Investisseurs existants", weight: 15, score: 15, justification: "Investisseurs et droits non verifies." },
        ],
      },
      findings: {
        dataAvailability: {
          capTableProvided: hasCapTableDoc,
          termSheetProvided: hasTermSheetDoc,
          dataQuality,
          missingCriticalInfo,
          recommendation: "Demander cap table complete, term sheet, vesting schedule et droits investisseurs avant decision.",
        },
        ownershipBreakdown: null,
        dilutionProjection: null,
        roundTerms: null,
        optionPool: null,
        investorAnalysis: null,
        structuralIssues: [
          {
            issue: "Audit cap table automatise indisponible",
            severity: hasCapTableDoc ? "HIGH" : "CRITICAL",
            impact: "La dilution et les droits economiques/politiques ne sont pas verifies.",
            recommendation: "Revue manuelle des documents sources ou relance ciblee apres correction LLM.",
          },
        ],
      },
      redFlags: [primaryRedFlag],
      questions: [
        {
          priority: "CRITICAL",
          category: "cap_table",
          question: "Pouvez-vous fournir la cap table detaillee et le term sheet complet ?",
          context: "L'audit cap table automatise est degrade sur cette passe.",
          whatToLookFor: "Ownership pre/post, ESOP, liquidation preference, anti-dilution, board, pro-rata et vesting.",
        },
      ],
      alertSignal: {
        hasBlocker: false,
        recommendation: "INVESTIGATE_FURTHER",
        justification: "Audit cap table automatise indisponible; verification manuelle requise.",
      },
      narrative: {
        oneLiner: "Audit cap table automatise indisponible.",
        summary: "Le pipeline n'a pas obtenu de JSON cap-table exploitable. Ownership, dilution, terms et droits investisseurs doivent etre controles manuellement avant decision.",
        keyInsights: ["Verification cap table manuelle requise"],
        forNegotiation: ["Conditionner toute avance a la reception de la cap table et du term sheet complets"],
      },
    };
  }
}

export const capTableAuditor = new CapTableAuditorAgent();
