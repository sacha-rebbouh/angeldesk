import { clampConfidenceLevel } from "@/agents/orchestration/confidence-clamp";
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
import { detectFOMO } from "@/services/fomo-detector";
import { calculateAgentScore, DECK_FORENSICS_CRITERIA, type ExtractedMetric } from "@/scoring/services/agent-score-calculator";
import { deriveTier1SignalIntensity, signalIntensityToRecommendation, type Tier1SignalIntensity } from "./utils/derive-alert-signal";

const DECK_FORENSICS_OTHER_DOC_MAX_CHARS = 5_000;
const DECK_FORENSICS_EXTRACTED_INFO_MAX_CHARS = 18_000;
const DECK_FORENSICS_PRO_TIMEOUT_MS = 190_000;
const DECK_FORENSICS_FLASH_FALLBACK_TIMEOUT_MS = 80_000;
const DECK_FORENSICS_MAX_TOKENS = 16_000;

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
  // Phase A slice A7b-2 — signalIntensity natif dérivé déterministe.
  signalIntensity: Tier1SignalIntensity;
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
      timeoutMs: 290000, // Leaves headroom under the 300s Inngest/Vercel ceiling.
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
- Reporter TOUS les findings (pas de minimum/maximum artificiel)

`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<DeckForensicsDataV2> {
    this._dealStage = context.canonicalDeal.stage;
    const promptContext = this.buildDeckForensicsPromptContext(context);
    const dealContext = this.formatDealContext(promptContext);
    const contextEngineData = this.formatContextEngineData(context);
    const extractedInfo = this.getExtractedInfo(context);

    let extractedSection = "";
    if (extractedInfo) {
      extractedSection =
        `\n## Donnees Extraites du Deck (Document Extractor)\n` +
        this.sanitizeDataForPrompt(
          this.compactExtractedInfoForPrompt(extractedInfo),
          DECK_FORENSICS_EXTRACTED_INFO_MAX_CHARS,
        );
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

    // F75: Pre-LLM FOMO / artificial urgency detection on document content
    let fomoSection = "";
    if (context.documents) {
      for (const doc of context.documents) {
        if (doc.type === "FINANCIAL_MODEL") continue;
        if (doc.extractedText) {
          const fomoResult = detectFOMO(doc.extractedText, doc.name);
          if (fomoResult.detected) {
            fomoSection += `\n## ⚠️ TACTIQUES DE PRESSION DETECTEES (pre-analyse) — ${doc.name}\n`;
            fomoSection += `Risque global: **${fomoResult.overallRisk}** (${fomoResult.patterns.length} pattern(s))\n`;
            for (const p of fomoResult.patterns) {
              fomoSection += `- [${p.severity}] "${p.pattern}" — ...${p.excerpt}...\n`;
            }
            fomoSection += `\n**INSTRUCTION:** Ces tactiques de pression DOIVENT etre signalees comme RED FLAGS.\n`;
          }
        }
      }
    }

    const prompt = `ANALYSE FORENSIQUE APPROFONDIE - Standard Big4/VC Partner

${dealContext}
${extractedSection}
${contextEngineData}
${competitorContext}
${valuationContext}
${fomoSection}
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
    "justification": "Explication factuelle du signal (constat, pas instruction d'investissement)"
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

    let data: LLMDeckForensicsResponse;
    try {
      ({ data } = await this.llmCompleteJSON<LLMDeckForensicsResponse>(prompt, {
        // Keep Gemini Pro as primary for quality, but do not let one slow
        // provider call consume the whole Inngest/Vercel budget.
        timeoutMs: DECK_FORENSICS_PRO_TIMEOUT_MS,
        maxRetries: 0,
        maxTokens: DECK_FORENSICS_MAX_TOKENS,
      }));
    } catch (error) {
      // Opt 1 (robustesse) : Gemini Pro peut renvoyer un timeout OU une réponse vide
      // (empty_response). Comme deck-forensics est `maxRetries:0` ET seul agent
      // critique de Phase A, un tel hoquet infra avortait TOUT le Deep Dive. On
      // retente UNE fois sur Gemini 3 Flash (borné). Une vraie erreur (schéma, bug)
      // n'est PAS rattrapée → elle remonte (pas de masquage d'un vrai problème).
      const fallbackReason = this.isTimeoutError(error)
        ? "timeout"
        : this.isEmptyResponseError(error)
          ? "empty_response"
          : null;
      if (!fallbackReason) {
        throw error;
      }

      console.warn(
        `[deck-forensics] Gemini Pro ${fallbackReason}; ` +
        `falling back to Gemini 3 Flash with bounded output.`
      );
      ({ data } = await this.llmCompleteJSON<LLMDeckForensicsResponse>(
        `${prompt}\n\n` +
          `CONTRAINTE DE SECOURS: reponds en JSON strict, plus concis. ` +
          `Priorise les claims, red flags et questions qui changent vraiment la lecture investisseur. ` +
          `Si le deck contient peu de contenu exploitable, produis une analyse MINIMALE et honnête ` +
          `(findings reduits, confidenceLevel bas) — n'invente AUCUN claim, chiffre ou red flag absent du deck.`,
        {
          model: "GEMINI_3_FLASH",
          timeoutMs: DECK_FORENSICS_FLASH_FALLBACK_TIMEOUT_MS,
          maxRetries: 0,
          maxTokens: 12_000,
        }
      ));
    }

    // Validate and normalize response
    const result = this.normalizeResponse(data);

    // F03: DETERMINISTIC SCORING - Extract deck metrics, score in code
    try {
      const extractedMetrics: ExtractedMetric[] = [];
      const f = result.findings;

      if (f.narrativeAnalysis?.storyCoherence != null) {
        extractedMetrics.push({
          name: "story_coherence", value: f.narrativeAnalysis.storyCoherence,
          unit: "score", source: "LLM narrative analysis", dataReliability: "DECLARED", category: "product",
        });
      }

      const claims = f.claimVerification ?? [];
      if (claims.length > 0) {
        const verified = claims.filter(c => c.status === "VERIFIED").length;
        extractedMetrics.push({
          name: "claims_verified_ratio", value: Math.round((verified / claims.length) * 100),
          unit: "score", source: "Claim verification analysis", dataReliability: "VERIFIED", category: "product",
        });
        const contradicted = claims.filter(c => c.status === "CONTRADICTED" || c.status === "MISLEADING").length;
        extractedMetrics.push({
          name: "claims_contradicted_count", value: Math.max(0, 100 - contradicted * 25),
          unit: "score", source: "Claim verification analysis", dataReliability: "VERIFIED", category: "product",
        });
      }

      if (f.deckQuality) {
        if (f.deckQuality.professionalismScore != null) {
          extractedMetrics.push({
            name: "professionalism_score", value: f.deckQuality.professionalismScore,
            unit: "score", source: "Deck quality analysis", dataReliability: "DECLARED", category: "product",
          });
        }
        if (f.deckQuality.completenessScore != null) {
          extractedMetrics.push({
            name: "completeness_score", value: f.deckQuality.completenessScore,
            unit: "score", source: "Deck quality analysis", dataReliability: "DECLARED", category: "product",
          });
        }
        if (f.deckQuality.transparencyScore != null) {
          extractedMetrics.push({
            name: "transparency_score", value: f.deckQuality.transparencyScore,
            unit: "score", source: "Deck quality analysis", dataReliability: "DECLARED", category: "product",
          });
        }
      }

      const inconsistencies = f.inconsistencies ?? [];
      extractedMetrics.push({
        name: "inconsistency_count", value: Math.max(0, 100 - inconsistencies.length * 20),
        unit: "score", source: "Inconsistency analysis", dataReliability: "VERIFIED", category: "product",
      });
      const criticalInc = inconsistencies.filter(i => i.severity === "CRITICAL").length;
      extractedMetrics.push({
        name: "inconsistency_severity", value: Math.max(0, 100 - criticalInc * 30),
        unit: "score", source: "Inconsistency analysis", dataReliability: "VERIFIED", category: "product",
      });

      if (extractedMetrics.length > 0) {
        const sector = context.canonicalDeal.sector ?? "general";
        const stage = context.canonicalDeal.stage ?? "seed";
        const deterministicScore = await calculateAgentScore(
          "deck-forensics", extractedMetrics, sector, stage, DECK_FORENSICS_CRITERIA,
        );
        result.score = { ...result.score, value: deterministicScore.score, breakdown: deterministicScore.breakdown };
      }
    } catch (err) {
      console.error("[deck-forensics] Deterministic scoring failed, using LLM score:", err);
    }

    return result;
  }

  private buildDeckForensicsPromptContext(context: EnrichedAgentContext): EnrichedAgentContext {
    const documents = context.documents?.map((doc) => {
      if (!doc.extractedText) return doc;
      if (doc.type === "PITCH_DECK") return doc;
      if (doc.extractedText.length <= DECK_FORENSICS_OTHER_DOC_MAX_CHARS) return doc;

      return {
        ...doc,
        extractedText:
          doc.extractedText.slice(0, DECK_FORENSICS_OTHER_DOC_MAX_CHARS) +
          `\n\n[TRONQUE POUR deck-forensics: document secondaire limite a ${DECK_FORENSICS_OTHER_DOC_MAX_CHARS} caracteres. Les contradictions et faits extraits restent disponibles via Fact Store, Document Extractor et Deck Coherence.]`,
      };
    });

    return { ...context, documents };
  }

  private isTimeoutError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /timeout|timed out|abort/i.test(message);
  }

  private isEmptyResponseError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /empty_response/i.test(message);
  }

  private compactExtractedInfoForPrompt(extractedInfo: Record<string, unknown>): Record<string, unknown> {
    return {
      companyName: extractedInfo.companyName,
      tagline: extractedInfo.tagline,
      sector: extractedInfo.sector,
      stage: extractedInfo.stage,
      instrument: extractedInfo.instrument,
      geography: extractedInfo.geography,
      foundedYear: extractedInfo.foundedYear,
      teamSize: extractedInfo.teamSize,
      arr: extractedInfo.arr,
      revenue: extractedInfo.revenue,
      growthRateYoY: extractedInfo.growthRateYoY,
      amountRaising: extractedInfo.amountRaising,
      valuationPre: extractedInfo.valuationPre,
      valuationPost: extractedInfo.valuationPost,
      customers: extractedInfo.customers,
      churnRate: extractedInfo.churnRate,
      cac: extractedInfo.cac,
      ltv: extractedInfo.ltv,
      grossMargin: extractedInfo.grossMargin,
      productDescription: extractedInfo.productDescription,
      businessModel: extractedInfo.businessModel,
      coreValueProposition: extractedInfo.coreValueProposition,
      competitiveAdvantage: extractedInfo.competitiveAdvantage,
      keyDifferentiators: extractedInfo.keyDifferentiators,
      competitors: extractedInfo.competitors,
      teamMembers: extractedInfo.teamMembers,
      previousRounds: extractedInfo.previousRounds,
      dataClassifications: extractedInfo.dataClassifications,
      financialDataType: extractedInfo.financialDataType,
      financialDataAsOf: extractedInfo.financialDataAsOf,
      projectionReliability: extractedInfo.projectionReliability,
      financialRedFlags: extractedInfo.financialRedFlags,
      sourceReferences: Array.isArray(extractedInfo.sourceReferences)
        ? extractedInfo.sourceReferences.slice(0, 12)
        : extractedInfo.sourceReferences,
    };
  }

  private normalizeResponse(data: LLMDeckForensicsResponse): DeckForensicsDataV2 {
    const analysisDate = new Date().toISOString();

    // Normalize meta
    const validCompleteness = ["complete", "partial", "minimal"];
    const { confidenceLevel: clampedConfidenceLevel, confidenceIsFallback } = clampConfidenceLevel(data.meta?.confidenceLevel);
    if (confidenceIsFallback) {
      console.warn(`[deck-forensics] LLM did not return confidenceLevel — using 0`);
    }
    const meta: AgentMeta = {
      agentName: "deck-forensics",
      analysisDate,
      dataCompleteness: validCompleteness.includes(data.meta?.dataCompleteness)
        ? (data.meta.dataCompleteness as "complete" | "partial" | "minimal")
        : "partial",
      confidenceLevel: clampedConfidenceLevel,
      confidenceIsFallback,
      limitations: Array.isArray(data.meta?.limitations) ? data.meta.limitations : [],
    };

    // Normalize score
    const rawScoreValue = data.score?.value;
    const scoreIsFallback = rawScoreValue === undefined || rawScoreValue === null;
    if (scoreIsFallback) {
      console.warn(`[deck-forensics] LLM did not return score value — using 0`);
    }
    const scoreValue = scoreIsFallback ? 0 : Math.min(100, Math.max(0, rawScoreValue));
    const score: AgentScore = {
      value: scoreValue,
      grade: scoreIsFallback ? "F" : this.getGrade(scoreValue),
      isFallback: scoreIsFallback,
      breakdown: Array.isArray(data.score?.breakdown)
        ? data.score.breakdown.map((b) => ({
            criterion: b.criterion ?? "",
            weight: b.weight ?? 25,
            score: b.score != null ? Math.min(100, Math.max(0, b.score)) : 0,
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
        storyCoherence: data.findings?.narrativeAnalysis?.storyCoherence != null
          ? Math.min(100, Math.max(0, data.findings.narrativeAnalysis.storyCoherence)) : 0,
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
        professionalismScore: data.findings?.deckQuality?.professionalismScore != null
          ? Math.min(100, Math.max(0, data.findings.deckQuality.professionalismScore)) : 0,
        completenessScore: data.findings?.deckQuality?.completenessScore != null
          ? Math.min(100, Math.max(0, data.findings.deckQuality.completenessScore)) : 0,
        transparencyScore: data.findings?.deckQuality?.transparencyScore != null
          ? Math.min(100, Math.max(0, data.findings.deckQuality.transparencyScore)) : 0,
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

    // Phase A slice A7b-2 — signalIntensity dérivé déterministe (helper A7b-1).
    // Le LLM ne pilote plus `alertSignal.recommendation` ; la valeur est
    // calculée depuis severity red flags + score métier.
    const criticalCount = redFlags.filter((f) => f.severity === "CRITICAL").length;
    const highCount = redFlags.filter((f) => f.severity === "HIGH").length;
    const signalIntensity: Tier1SignalIntensity = deriveTier1SignalIntensity({
      criticalCount,
      highCount,
      score: scoreValue,
    });

    // Normalize alertSignal — `recommendation` dérivé déterministe depuis
    // signalIntensity. Le contrat global `AgentAlertSignal` reste intact
    // (compat infra, 102 consumers cross-agent — debt hors A7b).
    const alertSignal: AgentAlertSignal = {
      hasBlocker: data.alertSignal?.hasBlocker ?? false,
      blockerReason: data.alertSignal?.blockerReason,
      recommendation: signalIntensityToRecommendation(signalIntensity),
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
      signalIntensity,
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
