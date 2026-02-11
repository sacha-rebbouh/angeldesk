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

/**
 * Deck Forensics Agent - REFONTE v2.0
 *
 * Mission: Analyse forensique APPROFONDIE du pitch deck avec rigueur Big4 + Partner VC.
 *
 * Standards de qualite:
 * - Chaque affirmation DOIT etre sourcee (Slide X, Page Y)
 * - Chaque red flag DOIT avoir: severite + preuve + impact + question
 * - Cross-reference OBLIGATOIRE avec Context Engine et Funding DB
 * - Calculs MONTRES, pas juste les resultats
 * - Output ACTIONNABLE pour un Business Angel
 *
 * Minimum attendu: 8+ claims verifies, 3+ red flags si problemes, 8+ questions
 */

// ============================================================================
// TYPES SPECIFIQUES DECK FORENSICS (Findings)
// ============================================================================

interface ClaimVerification {
  id: string;
  category: "market" | "traction" | "financials" | "tech" | "timing" | "competition" | "team";
  claim: string; // Citation EXACTE du deck
  location: string; // "Slide 5" ou "Executive Summary, p.2"
  status: "VERIFIED" | "UNVERIFIED" | "CONTRADICTED" | "EXAGGERATED" | "MISLEADING" | "PROJECTION_AS_FACT";
  evidence: string; // POURQUOI ce status
  sourceUsed: string; // "Context Engine - DealIntelligence", "Calcul: X/Y = Z", etc.
  investorImplication: string; // Ce que ca signifie pour le BA
  dataReliability?: "AUDITED" | "VERIFIED" | "DECLARED" | "PROJECTED" | "ESTIMATED" | "UNVERIFIABLE";
}

interface NarrativeInconsistency {
  id: string;
  issue: string;
  location1: string;
  location2: string;
  quote1: string;
  quote2: string;
  severity: "CRITICAL" | "MAJOR" | "MINOR";
  investorImplication: string;
}

interface DeckForensicsFindings {
  narrativeAnalysis: {
    storyCoherence: number; // 0-100
    credibilityAssessment: string; // 4-5 phrases detaillees
    narrativeStrengths: { point: string; location: string }[];
    narrativeWeaknesses: { point: string; location: string }[];
    criticalMissingInfo: { info: string; whyItMatters: string }[];
  };
  claimVerification: ClaimVerification[];
  inconsistencies: NarrativeInconsistency[];
  deckQuality: {
    professionalismScore: number; // 0-100
    completenessScore: number; // 0-100
    transparencyScore: number; // 0-100
    issues: string[];
  };
}

// ============================================================================
// TYPE OUTPUT COMPLET (Structure Universelle)
// ============================================================================

export interface DeckForensicsDataV2 {
  meta: AgentMeta;
  score: AgentScore;
  findings: DeckForensicsFindings;
  dbCrossReference: DbCrossReference;
  redFlags: AgentRedFlag[];
  questions: AgentQuestion[];
  alertSignal: AgentAlertSignal;
  narrative: AgentNarrative;
}

// Pour compatibilite avec le systeme existant
export interface DeckForensicsResultV2 {
  agentName: "deck-forensics";
  success: boolean;
  executionTimeMs: number;
  cost: number;
  data: DeckForensicsDataV2;
  error?: string;
}

// ============================================================================
// LLM RESPONSE INTERFACE
// ============================================================================

interface LLMDeckForensicsResponse {
  meta: {
    dataCompleteness: "complete" | "partial" | "minimal";
    confidenceLevel: number;
    limitations: string[];
  };
  score: {
    value: number;
    breakdown: {
      criterion: string;
      weight: number;
      score: number;
      justification: string;
    }[];
  };
  findings: {
    narrativeAnalysis: {
      storyCoherence: number;
      credibilityAssessment: string;
      narrativeStrengths: { point: string; location: string }[];
      narrativeWeaknesses: { point: string; location: string }[];
      criticalMissingInfo: { info: string; whyItMatters: string }[];
    };
    claimVerification: {
      category: string;
      claim: string;
      location: string;
      status: string;
      evidence: string;
      sourceUsed: string;
      investorImplication: string;
      dataReliability?: string;
    }[];
    inconsistencies: {
      issue: string;
      location1: string;
      location2: string;
      quote1: string;
      quote2: string;
      severity: string;
      investorImplication: string;
    }[];
    deckQuality: {
      professionalismScore: number;
      completenessScore: number;
      transparencyScore: number;
      issues: string[];
    };
  };
  dbCrossReference: {
    claims: {
      claim: string;
      location: string;
      dbVerdict: string;
      evidence: string;
      severity?: string;
    }[];
    uncheckedClaims: string[];
  };
  redFlags: {
    category: string;
    severity: string;
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
    priority: string;
    category: string;
    question: string;
    context: string;
    whatToLookFor: string;
  }[];
  alertSignal: {
    hasBlocker: boolean;
    blockerReason?: string;
    recommendation: string;
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

export class DeckForensicsAgent extends BaseAgent<DeckForensicsDataV2, DeckForensicsResultV2> {
  constructor() {
    super({
      name: "deck-forensics",
      description: "Analyse forensique approfondie du pitch deck - Standard Big4/VC",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 150000, // 2.5 min pour analyse approfondie
      dependencies: ["document-extractor"],
    });
  }

  protected buildSystemPrompt(): string {
    return `Tu es un SENIOR PARTNER VC avec 25 ans d'experience + un auditeur Big4.

MISSION: Analyse forensique du pitch deck avec une rigueur de due diligence professionnelle.
Tu analyses des deals pour des Business Angels qui n'ont pas d'equipe d'analystes.

============================================================================
STANDARDS DE QUALITE (NON NEGOCIABLES)
============================================================================

1. CHAQUE AFFIRMATION EST SOURCEE
   - Location EXACTE: "Slide 5", "Executive Summary, p.2", "Financial Model, onglet Revenue"
   - JAMAIS de "quelque part dans le deck" ou "il est mentionne que..."

2. CHAQUE CALCUL EST MONTRE
   - Mauvais: "Le multiple est eleve"
   - Bon: "Multiple demande: 15M€ / 500K€ ARR = 30x vs median secteur 18x (Source: Context Engine)"

3. CHAQUE RED FLAG A UNE STRUCTURE COMPLETE
   - Severite: CRITICAL (deal-breaker potentiel) / HIGH (a investiguer) / MEDIUM (a noter)
   - Evidence: Citation EXACTE ou donnee precise
   - Impact: Ce que ca signifie pour l'investisseur
   - Question: A poser au fondateur
   - Red flag si mauvaise reponse: Ce qui confirmerait le probleme

4. CROSS-REFERENCE OBLIGATOIRE AVEC CONTEXT ENGINE
   - Comparer les claims du deck aux donnees externes
   - "Le deck dit X, mais Context Engine montre Y"
   - Verdict: VERIFIED / CONTRADICTED / PARTIAL / NOT_VERIFIABLE

============================================================================
METHODOLOGIE D'ANALYSE
============================================================================

ETAPE 0 - DETECTION DES PROJECTIONS PRESENTEES COMME DES FAITS (PRIORITE ABSOLUE)
AVANT toute autre analyse, identifier les chiffres qui sont en realite des PROJECTIONS:
1. Identifier la DATE DU DOCUMENT (metadata, mention, date d'upload fournie)
2. Pour chaque chiffre financier/traction:
   - La periode couverte depasse-t-elle la date du document? → PROJECTION
   - Le document est-il un BP/forecast? → PROJECTION
   - Le chiffre est dans une section "Projections"/"Forecast"/"Budget"? → PROJECTION
   - Le langage est au futur/conditionnel? → PROJECTION
3. Pour chaque projection detectee, utiliser le status "PROJECTION_AS_FACT"
4. Chaque PROJECTION_AS_FACT genere automatiquement un RED FLAG

EXEMPLE CONCRET:
- Deck date aout 2025, claim "570K€ de CA en 2025"
- Le CA annuel 2025 couvre jan-dec, mais le doc date d'aout → 4 mois sont projetes
- Status: PROJECTION_AS_FACT
- Evidence: "Le document date d'aout 2025. Le CA annuel 2025 inclut necessairement des projections pour sept-dec (33% du chiffre). Ce n'est PAS un CA realise."
- dataReliability: "PROJECTED"

ETAPE 1 - VERIFICATION DES CLAIMS (couvrir TOUTES les categories)
Pour chaque claim important du deck:
- MARKET: Taille marche, CAGR, sources citees → Comparer avec Context Engine
- TRACTION: Clients, revenue, croissance → Verifier coherence interne
- FINANCIALS: Projections, unit economics → Calculer et valider
- TECH: Avantage technique, brevets → Verifier credibilite
- TIMING: "Pourquoi maintenant" → Evaluer pertinence
- COMPETITION: Positionnement vs concurrents → Cross-ref avec DB concurrents

POUR CHAQUE CLAIM FINANCIER: Classifier la fiabilite de la donnee:
- dataReliability: "AUDITED" | "VERIFIED" | "DECLARED" | "PROJECTED" | "ESTIMATED" | "UNVERIFIABLE"
- Si un chiffre annonce comme un fait est en realite une projection → PROJECTION_AS_FACT + RED FLAG

ETAPE 2 - DETECTION DES INCONSISTANCES
Chercher ACTIVEMENT:
- Slide X dit Y, mais Slide Z dit le contraire
- Chiffres qui ne s'additionnent pas (ex: 100 clients × 10K€ ≠ 1.5M€ ARR)
- Timeline incoherente
- Metriques contradictoires

ETAPE 3 - RED FLAGS A CHERCHER
Reporter TOUS ceux trouves (0 si aucun, 15 si nombreux):
- Chiffres trop ronds sans justification (10M€ TAM, 100% croissance)
- Projections hockey stick sans base de traction
- Marche TAM gonfle ou mal segmente
- Traction vague ("plusieurs clients", "croissance forte")
- Absence totale d'infos critiques (pas de chiffres, pas de clients nommes)
- Comparaisons flatteuses biaisees ("le Uber de...")
- Claims sans aucune source
- Valorisation sans justification

ETAPE 4 - QUESTIONS POUR LE FONDATEUR
Pour chaque zone d'ombre ou claim suspect:
- Question PRECISE et directe
- Contexte: pourquoi on pose cette question
- Ce qu'un bon fondateur devrait repondre
- Red flag si mauvaise reponse

============================================================================
REGLES ABSOLUES
============================================================================

INTERDIT:
- Inventer des donnees
- Affirmer sans preuve du deck ou du Context Engine
- Utiliser "probablement", "peut-etre", "il semble"
- Donner un score sans justification detaillee
- Ignorer des red flags pour "etre positif"

OBLIGATOIRE:
- Citer les locations exactes (Slide X, Page Y)
- Montrer les calculs
- Cross-referencer avec Context Engine quand disponible
- Etre SPECIFIQUE, pas generique
- Reporter TOUS les findings (pas de minimum/maximum artificiel)`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<DeckForensicsDataV2> {
    const dealContext = this.formatDealContext(context);
    const contextEngineData = this.formatContextEngineData(context);
    const extractedInfo = this.getExtractedInfo(context);

    let extractedSection = "";
    if (extractedInfo) {
      extractedSection = `\n## Donnees Extraites du Deck (Document Extractor)\n${JSON.stringify(extractedInfo, null, 2)}`;
    }

    // Build competitor context for DB cross-reference
    let competitorContext = "";
    if (context.contextEngine?.competitiveLandscape?.competitors) {
      const competitors = context.contextEngine.competitiveLandscape.competitors;
      competitorContext = `\n## Concurrents Identifies (Context Engine DB)\n`;
      competitorContext += `${competitors.length} concurrents dans notre base:\n`;
      for (const c of competitors.slice(0, 10)) {
        competitorContext += `- ${c.name}: ${c.positioning}`;
        if (c.totalFunding) competitorContext += ` (Funding: ${(c.totalFunding / 1000000).toFixed(1)}M€)`;
        competitorContext += `\n`;
      }
    }

    // Build valuation benchmark context
    let valuationContext = "";
    if (context.contextEngine?.dealIntelligence?.fundingContext) {
      const fc = context.contextEngine.dealIntelligence.fundingContext;
      valuationContext = `\n## Benchmarks Valorisation (Context Engine DB)\n`;
      valuationContext += `Multiples ARR du secteur: P25=${fc.p25ValuationMultiple}x, Median=${fc.medianValuationMultiple}x, P75=${fc.p75ValuationMultiple}x\n`;
      valuationContext += `Tendance: ${fc.trend} (${fc.trendPercentage > 0 ? "+" : ""}${fc.trendPercentage}%)\n`;
    }

    const prompt = `ANALYSE FORENSIQUE APPROFONDIE - Standard Big4/VC Partner

${dealContext}
${extractedSection}
${contextEngineData}
${competitorContext}
${valuationContext}
${this.formatFactStoreData(context)}

============================================================================
INSTRUCTIONS CRITIQUES
============================================================================

1. Verifie TOUS les claims business majeurs (market, traction, financials, tech, competition)
2. Cross-reference OBLIGATOIRE: Compare chaque claim important avec les donnees Context Engine
3. Reporte TOUS les red flags (0 si aucun, 20 si nombreux)
4. Genere des questions PRECISES et ACTIONNABLES
5. Chaque element DOIT avoir une location (Slide X, Page Y)
6. MONTRE tes calculs

============================================================================
CALCUL DE LA CONFIDENCE (CRITIQUE)
============================================================================

La confidenceLevel mesure ta capacite a faire ton travail d'analyse, PAS la qualite du deck.

CONFIDENCE 80-95%: Tu as pu analyser le deck completement
- Deck present et lisible ✓
- Tu as pu verifier les claims majeurs ✓
- Tu as pu identifier les red flags ✓
- Context Engine disponible pour cross-reference ✓

CONFIDENCE 60-80%: Analyse partielle
- Deck present mais certaines slides illisibles/manquantes
- Context Engine indisponible (pas de cross-reference possible)

CONFIDENCE <60%: Analyse impossible
- Deck non fourni ou illisible
- Donnees critiques pour l'analyse manquantes

ATTENTION: Les infos manquantes DANS LE DECK (pas de cap table, pas de clients nommes, pas d'ARR)
ne sont PAS des limitations de ton analyse - ce sont des FINDINGS (missing info). Ne penalise pas
ta confidence parce que le fondateur n'a pas mis certaines infos. Ta confidence mesure si TU as
pu faire ton travail, pas si le deck est complet.

============================================================================
FORMAT DE REPONSE JSON
============================================================================

\`\`\`json
{
  "meta": {
    "dataCompleteness": "complete|partial|minimal",
    "confidenceLevel": 80-95,
    "limitations": ["SEULEMENT ce qui t'a empeche de faire l'analyse - PAS les infos manquantes du deck"]
  },
  "score": {
    "value": 0-100,
    "breakdown": [
      {
        "criterion": "Coherence narrative",
        "weight": 25,
        "score": 0-100,
        "justification": "Justification DETAILLEE avec references"
      },
      {
        "criterion": "Credibilite des claims",
        "weight": 30,
        "score": 0-100,
        "justification": "..."
      },
      {
        "criterion": "Transparence financiere",
        "weight": 25,
        "score": 0-100,
        "justification": "..."
      },
      {
        "criterion": "Qualite du deck",
        "weight": 20,
        "score": 0-100,
        "justification": "..."
      }
    ]
  },
  "findings": {
    "narrativeAnalysis": {
      "storyCoherence": 0-100,
      "credibilityAssessment": "Evaluation detaillee en 4-5 phrases avec references aux slides",
      "narrativeStrengths": [
        {"point": "Point fort SPECIFIQUE", "location": "Slide X"}
      ],
      "narrativeWeaknesses": [
        {"point": "Faiblesse SPECIFIQUE", "location": "Slide Y"}
      ],
      "criticalMissingInfo": [
        {"info": "Information absente", "whyItMatters": "Pourquoi c'est critique pour le BA"}
      ]
    },
    "claimVerification": [
      {
        "category": "market|traction|financials|tech|timing|competition|team",
        "claim": "Citation EXACTE du deck entre guillemets",
        "location": "Slide X ou Document Y, page Z",
        "status": "VERIFIED|UNVERIFIED|CONTRADICTED|EXAGGERATED|MISLEADING|PROJECTION_AS_FACT",
        "evidence": "POURQUOI ce status - avec calculs si applicable",
        "sourceUsed": "Context Engine - DealIntelligence | Calcul: X/Y=Z | Coherence interne | Analyse temporelle",
        "investorImplication": "Ce que ca signifie pour la decision d'investissement",
        "dataReliability": "AUDITED|VERIFIED|DECLARED|PROJECTED|ESTIMATED|UNVERIFIABLE - classification de la fiabilite de cette donnee"
      }
    ],
    "inconsistencies": [
      {
        "issue": "Description PRECISE",
        "location1": "Slide X",
        "location2": "Slide Y",
        "quote1": "Citation EXACTE 1",
        "quote2": "Citation EXACTE 2 (contradictoire)",
        "severity": "CRITICAL|MAJOR|MINOR",
        "investorImplication": "Impact sur la decision"
      }
    ],
    "deckQuality": {
      "professionalismScore": 0-100,
      "completenessScore": 0-100,
      "transparencyScore": 0-100,
      "issues": ["Probleme specifique avec location"]
    }
  },
  "dbCrossReference": {
    "claims": [
      {
        "claim": "Claim du deck concernant marche/concurrents/valo",
        "location": "Slide X",
        "dbVerdict": "VERIFIED|CONTRADICTED|PARTIAL|NOT_VERIFIABLE",
        "evidence": "Donnee Context Engine qui confirme/infirme",
        "severity": "CRITICAL|HIGH|MEDIUM (si CONTRADICTED)"
      }
    ],
    "uncheckedClaims": ["Claims qu'on n'a pas pu verifier faute de donnees"]
  },
  "redFlags": [
    {
      "category": "credibility|financials|market|execution|transparency|consistency",
      "severity": "CRITICAL|HIGH|MEDIUM",
      "title": "Titre court du red flag",
      "description": "Description detaillee",
      "location": "Slide X",
      "evidence": "Citation EXACTE ou donnee",
      "contextEngineData": "Donnee externe qui contredit (si applicable)",
      "impact": "Pourquoi c'est un probleme pour le BA",
      "question": "Question a poser au fondateur",
      "redFlagIfBadAnswer": "Ce qui confirmerait le probleme"
    }
  ],
  "questions": [
    {
      "priority": "CRITICAL|HIGH|MEDIUM",
      "category": "claims|omissions|contradictions|verification|story_gaps",
      "question": "Question PRECISE et directe",
      "context": "Pourquoi cette question est importante",
      "whatToLookFor": "Ce qui revelerait un probleme dans la reponse"
    }
  ],
  "alertSignal": {
    "hasBlocker": true|false,
    "blockerReason": "Si hasBlocker=true, pourquoi",
    "recommendation": "PROCEED|PROCEED_WITH_CAUTION|INVESTIGATE_FURTHER|STOP",
    "justification": "Explication de la recommandation"
  },
  "narrative": {
    "oneLiner": "Resume en 1 phrase: verdict global",
    "summary": "Resume en 3-4 phrases pour le BA",
    "keyInsights": ["5-7 insights majeurs de l'analyse"],
    "forNegotiation": ["Points a utiliser en nego si on proceed"]
  }
}
\`\`\`

RAPPEL: Standard Big4/VC Partner. TOUS les findings, pas de minimum/maximum artificiel.`;

    const { data } = await this.llmCompleteJSON<LLMDeckForensicsResponse>(prompt);

    // Validate and normalize response
    return this.normalizeResponse(data);
  }

  private normalizeResponse(data: LLMDeckForensicsResponse): DeckForensicsDataV2 {
    const analysisDate = new Date().toISOString();

    // Normalize meta
    const validCompleteness = ["complete", "partial", "minimal"];
    const meta: AgentMeta = {
      agentName: "deck-forensics",
      analysisDate,
      dataCompleteness: validCompleteness.includes(data.meta?.dataCompleteness)
        ? (data.meta.dataCompleteness as "complete" | "partial" | "minimal")
        : "partial",
      confidenceLevel: Math.min(100, Math.max(0, data.meta?.confidenceLevel ?? 50)),
      limitations: Array.isArray(data.meta?.limitations) ? data.meta.limitations : [],
    };

    // Normalize score
    const scoreValue = Math.min(100, Math.max(0, data.score?.value ?? 50));
    const score: AgentScore = {
      value: scoreValue,
      grade: this.getGrade(scoreValue),
      breakdown: Array.isArray(data.score?.breakdown)
        ? data.score.breakdown.map((b) => ({
            criterion: b.criterion ?? "",
            weight: b.weight ?? 25,
            score: Math.min(100, Math.max(0, b.score ?? 50)),
            justification: b.justification ?? "",
          }))
        : [],
    };

    // Normalize findings
    const validClaimCategories = ["market", "traction", "financials", "tech", "timing", "competition", "team"];
    const validClaimStatuses = ["VERIFIED", "UNVERIFIED", "CONTRADICTED", "EXAGGERATED", "MISLEADING"];
    const validSeverities = ["CRITICAL", "MAJOR", "MINOR"];

    const findings: DeckForensicsFindings = {
      narrativeAnalysis: {
        storyCoherence: Math.min(100, Math.max(0, data.findings?.narrativeAnalysis?.storyCoherence ?? 50)),
        credibilityAssessment: data.findings?.narrativeAnalysis?.credibilityAssessment ?? "",
        narrativeStrengths: Array.isArray(data.findings?.narrativeAnalysis?.narrativeStrengths)
          ? data.findings.narrativeAnalysis.narrativeStrengths.map((s) => ({
              point: s.point ?? "",
              location: s.location ?? "Non specifie",
            }))
          : [],
        narrativeWeaknesses: Array.isArray(data.findings?.narrativeAnalysis?.narrativeWeaknesses)
          ? data.findings.narrativeAnalysis.narrativeWeaknesses.map((w) => ({
              point: w.point ?? "",
              location: w.location ?? "Non specifie",
            }))
          : [],
        criticalMissingInfo: Array.isArray(data.findings?.narrativeAnalysis?.criticalMissingInfo)
          ? data.findings.narrativeAnalysis.criticalMissingInfo.map((m) => ({
              info: m.info ?? "",
              whyItMatters: m.whyItMatters ?? "",
            }))
          : [],
      },
      claimVerification: Array.isArray(data.findings?.claimVerification)
        ? data.findings.claimVerification.map((c, i) => ({
            id: `claim-${i + 1}`,
            category: validClaimCategories.includes(c.category)
              ? (c.category as ClaimVerification["category"])
              : "market",
            claim: c.claim ?? "",
            location: c.location ?? "Non specifie",
            status: validClaimStatuses.includes(c.status)
              ? (c.status as ClaimVerification["status"])
              : "UNVERIFIED",
            evidence: c.evidence ?? "",
            sourceUsed: c.sourceUsed ?? "Non specifie",
            investorImplication: c.investorImplication ?? "",
          }))
        : [],
      inconsistencies: Array.isArray(data.findings?.inconsistencies)
        ? data.findings.inconsistencies.map((inc, i) => ({
            id: `inconsistency-${i + 1}`,
            issue: inc.issue ?? "",
            location1: inc.location1 ?? "Non specifie",
            location2: inc.location2 ?? "Non specifie",
            quote1: inc.quote1 ?? "",
            quote2: inc.quote2 ?? "",
            severity: validSeverities.includes(inc.severity)
              ? (inc.severity as NarrativeInconsistency["severity"])
              : "MINOR",
            investorImplication: inc.investorImplication ?? "",
          }))
        : [],
      deckQuality: {
        professionalismScore: Math.min(100, Math.max(0, data.findings?.deckQuality?.professionalismScore ?? 50)),
        completenessScore: Math.min(100, Math.max(0, data.findings?.deckQuality?.completenessScore ?? 50)),
        transparencyScore: Math.min(100, Math.max(0, data.findings?.deckQuality?.transparencyScore ?? 50)),
        issues: Array.isArray(data.findings?.deckQuality?.issues) ? data.findings.deckQuality.issues : [],
      },
    };

    // Normalize dbCrossReference
    const validDbVerdicts = ["VERIFIED", "CONTRADICTED", "PARTIAL", "NOT_VERIFIABLE"];
    const validDbSeverities = ["CRITICAL", "HIGH", "MEDIUM"];
    const dbCrossReference: DbCrossReference = {
      claims: Array.isArray(data.dbCrossReference?.claims)
        ? data.dbCrossReference.claims.map((c) => ({
            claim: c.claim ?? "",
            location: c.location ?? "Non specifie",
            dbVerdict: validDbVerdicts.includes(c.dbVerdict)
              ? (c.dbVerdict as DbCrossReference["claims"][0]["dbVerdict"])
              : "NOT_VERIFIABLE",
            evidence: c.evidence ?? "",
            severity: c.severity && validDbSeverities.includes(c.severity)
              ? (c.severity as "CRITICAL" | "HIGH" | "MEDIUM")
              : undefined,
          }))
        : [],
      uncheckedClaims: Array.isArray(data.dbCrossReference?.uncheckedClaims)
        ? data.dbCrossReference.uncheckedClaims
        : [],
    };

    // Normalize redFlags
    const validRedFlagCategories = ["credibility", "financials", "market", "execution", "transparency", "consistency"];
    const validRedFlagSeverities = ["CRITICAL", "HIGH", "MEDIUM"];
    const redFlags: AgentRedFlag[] = Array.isArray(data.redFlags)
      ? data.redFlags.map((rf, i) => ({
          id: `rf-deck-${i + 1}`,
          category: validRedFlagCategories.includes(rf.category) ? rf.category : "credibility",
          severity: validRedFlagSeverities.includes(rf.severity)
            ? (rf.severity as AgentRedFlag["severity"])
            : "MEDIUM",
          title: rf.title ?? "",
          description: rf.description ?? "",
          location: rf.location ?? "Non specifie",
          evidence: rf.evidence ?? "",
          contextEngineData: rf.contextEngineData,
          impact: rf.impact ?? "",
          question: rf.question ?? "",
          redFlagIfBadAnswer: rf.redFlagIfBadAnswer ?? "",
        }))
      : [];

    // Normalize questions
    const validQuestionPriorities = ["CRITICAL", "HIGH", "MEDIUM"];
    const validQuestionCategories = ["claims", "omissions", "contradictions", "verification", "story_gaps"];
    const questions: AgentQuestion[] = Array.isArray(data.questions)
      ? data.questions.map((q) => ({
          priority: validQuestionPriorities.includes(q.priority)
            ? (q.priority as AgentQuestion["priority"])
            : "MEDIUM",
          category: validQuestionCategories.includes(q.category) ? q.category : "claims",
          question: q.question ?? "",
          context: q.context ?? "",
          whatToLookFor: q.whatToLookFor ?? "",
        }))
      : [];

    // Normalize alertSignal
    const validRecommendations = ["PROCEED", "PROCEED_WITH_CAUTION", "INVESTIGATE_FURTHER", "STOP"];
    const alertSignal: AgentAlertSignal = {
      hasBlocker: data.alertSignal?.hasBlocker ?? false,
      blockerReason: data.alertSignal?.blockerReason,
      recommendation: validRecommendations.includes(data.alertSignal?.recommendation)
        ? (data.alertSignal.recommendation as AgentAlertSignal["recommendation"])
        : "INVESTIGATE_FURTHER",
      justification: data.alertSignal?.justification ?? "",
    };

    // Normalize narrative
    const narrative: AgentNarrative = {
      oneLiner: data.narrative?.oneLiner ?? "",
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

  private getGrade(score: number): "A" | "B" | "C" | "D" | "F" {
    if (score >= 85) return "A";
    if (score >= 70) return "B";
    if (score >= 55) return "C";
    if (score >= 40) return "D";
    return "F";
  }
}

export const deckForensics = new DeckForensicsAgent();
