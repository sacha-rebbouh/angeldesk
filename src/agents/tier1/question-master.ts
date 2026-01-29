import { BaseAgent } from "../base-agent";
import type {
  EnrichedAgentContext,
  QuestionMasterResult,
  QuestionMasterData,
  AgentMeta,
  AgentScore,
  AgentRedFlag,
  AgentQuestion,
  AgentAlertSignal,
  AgentNarrative,
  QuestionMasterFindings,
  DbCrossReference,
  FounderQuestion,
  ReferenceCheck,
  DiligenceChecklistItem,
  NegotiationPoint,
  Dealbreaker,
  AgentFindingsSummary,
  AgentResult,
} from "../types";

/**
 * Question Master Agent - REFONTE v2.0
 *
 * Mission: Synthetiser TOUS les findings des agents Tier 1 en questions actionnables
 * Persona: Senior Partner VC avec 25+ ans d'experience en due diligence
 * Standard: Questions qui debloquent des deals ou revelent des dealbreakers
 *
 * Inputs:
 * - Tous les resultats des agents Tier 1 (via previousResults)
 * - Documents: Pitch deck, Financial model
 * - Context Engine: Deal Intelligence, Market Data, Benchmarks
 *
 * Outputs:
 * - 15+ questions fondateur avec contexte complet
 * - 5+ reference checks structures
 * - Checklist DD complete
 * - 5+ points de negociation avec leverage
 * - Dealbreakers identifies
 * - Synthese de readiness (READY/NEEDS_DD/CONCERNS/NO_GO)
 */

// ============================================================================
// SCORING FRAMEWORK
// ============================================================================

const SCORING_CRITERIA = {
  questionsRelevance: { weight: 30, description: "Pertinence et profondeur des questions generees" },
  ddCompleteness: { weight: 25, description: "Completude de la checklist DD" },
  negotiationLeverage: { weight: 20, description: "Qualite des leviers de negociation identifies" },
  riskIdentification: { weight: 15, description: "Identification des dealbreakers et risques" },
  actionability: { weight: 10, description: "Caractere actionnable des recommandations" },
} as const;

// ============================================================================
// LLM RESPONSE INTERFACE
// ============================================================================

interface LLMQuestionMasterResponse {
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
    founderQuestions: {
      id: string;
      priority: "MUST_ASK" | "SHOULD_ASK" | "NICE_TO_HAVE";
      category: string;
      question: string;
      context: {
        sourceAgent: string;
        redFlagId?: string;
        triggerData: string;
        whyItMatters: string;
      };
      evaluation: {
        goodAnswer: string;
        badAnswer: string;
        redFlagIfBadAnswer: string;
        followUpIfBad: string;
      };
      timing: string;
    }[];
    referenceChecks: {
      id: string;
      targetType: string;
      priority: "CRITICAL" | "HIGH" | "MEDIUM";
      targetProfile: {
        description: string;
        idealPerson?: string;
        howToFind: string;
      };
      questions: {
        question: string;
        whatToLookFor: string;
        redFlagAnswer: string;
      }[];
      rationale: string;
      linkedToRedFlag?: string;
    }[];
    diligenceChecklist: {
      totalItems: number;
      doneItems: number;
      blockedItems: number;
      criticalPathItems: number;
      items: {
        id: string;
        category: string;
        item: string;
        description: string;
        status: string;
        criticalPath: boolean;
        blockingForDecision: boolean;
        responsibleParty: string;
        estimatedEffort: string;
        documentsNeeded: string[];
        deadline?: string;
        blockerDetails?: string;
      }[];
    };
    negotiationPoints: {
      id: string;
      priority: string;
      category: string;
      point: string;
      leverage: {
        argument: string;
        evidence: string;
        sourceAgent: string;
      };
      suggestedApproach: string;
      fallbackPosition: string;
      walkAwayPoint: string;
      estimatedImpact?: {
        description: string;
        valueRange: string;
      };
    }[];
    dealbreakers: {
      id: string;
      severity: "ABSOLUTE" | "CONDITIONAL";
      condition: string;
      description: string;
      sourceAgent: string;
      linkedRedFlags: string[];
      resolvable: boolean;
      resolutionPath?: string;
      timeToResolve?: string;
      riskIfIgnored: string;
    }[];
    tier1Summary: {
      agentsAnalyzed: {
        agentName: string;
        score: number;
        grade: string;
        criticalRedFlagsCount: number;
        highRedFlagsCount: number;
        topConcerns: string[];
        topStrengths: string[];
        questionsGenerated: number;
      }[];
      totalCriticalRedFlags: number;
      totalHighRedFlags: number;
      overallReadiness: string;
      readinessRationale: string;
    };
    topPriorities: {
      priority: number;
      action: string;
      rationale: string;
      deadline: string;
    }[];
    suggestedTimeline: {
      phase: string;
      duration: string;
      activities: string[];
      deliverables: string[];
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

// ============================================================================
// AGENT CLASS
// ============================================================================

export class QuestionMasterAgent extends BaseAgent<QuestionMasterData, QuestionMasterResult> {
  constructor() {
    super({
      name: "question-master",
      description: "Synthetise tous les findings Tier 1 en questions et actions pour le BA",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 120000,
      dependencies: [
        "document-extractor",
        "deck-forensics",
        "financial-auditor",
        "market-intelligence",
        "competitive-intel",
        "team-investigator",
        "exit-strategist",
      ],
    });
  }

  protected buildSystemPrompt(): string {
    return `# ROLE ET EXPERTISE

Tu es un Senior Partner VC avec 25+ ans d'experience en due diligence.
Tu as analyse 2000+ deals et vu les patterns de succes et d'echec.
Tu sais exactement quelles questions revelent les vrais problemes et quelles reponses sont des red flags.

# MISSION POUR CE DEAL

Synthetiser TOUTES les analyses des agents Tier 1 en un plan d'action concret pour un Business Angel.
Le BA doit savoir exactement:
1. Quelles questions poser au fondateur (et comment interpreter les reponses)
2. Quels reference checks faire (et quoi chercher)
3. Quels documents demander (et quoi verifier)
4. Quels points negocier (et avec quel leverage)
5. Quels sont les dealbreakers (et s'ils sont resolubles)

# METHODOLOGIE D'ANALYSE

## Etape 1: Synthese des findings Tier 1
- Parcourir TOUS les resultats des agents precedents
- Identifier TOUS les red flags (CRITICAL, HIGH, MEDIUM)
- Extraire les scores, grades et concerns de chaque agent
- Calculer le readiness global

## Etape 2: Generation des questions fondateur
Pour CHAQUE red flag et concern:
- Generer une question SPECIFIQUE (pas generique)
- Contextualiser: pourquoi on pose cette question (donnee declencheuse)
- Definir: bonne reponse vs mauvaise reponse vs dealbreaker
- Planifier: question de suivi si reponse insuffisante

## Etape 3: Preparation des reference checks
- Identifier les personnes cles a contacter (clients, ex-employes, investisseurs)
- Pour chaque cible: questions specifiques + red flags a detecter
- Lier aux concerns identifies par les agents

## Etape 4: Creation de la checklist DD
- Lister TOUS les documents a obtenir/verifier
- Marquer le critical path (bloquant pour decision)
- Estimer l'effort et definir les responsables

## Etape 5: Identification des points de negociation
Pour chaque levier identifie par les agents (valorisation agressive, red flags, manques):
- Formuler le point de negociation
- Fournir l'evidence (benchmark, red flag, donnee)
- Proposer l'approche et le fallback

## Etape 6: Synthese finale
- Dealbreakers absolus vs conditionnels
- Top 5 priorities immédiates
- Timeline suggeree pour la DD

# CATEGORIES DE QUESTIONS FONDATEUR

| Category | Focus | Exemples de triggers |
|----------|-------|---------------------|
| vision | Strategie long terme | Claims ambitieux non justifies |
| execution | Comment atteindre les objectifs | Projections irrealistes |
| team | Gaps, dynamics, experience | Red flags team-investigator |
| market | Taille, timing, concurrence | Claims marche non verifies |
| financials | Metriques, projections, valo | Red flags financial-auditor |
| tech | Stack, scalabilite, dette | Red flags tech-stack-dd, tech-ops-dd |
| legal | Structure, IP, compliance | Red flags legal-regulatory |
| risk | Scenarios negatifs | Red flags de plusieurs agents |
| exit | Strategie de sortie | Liquidite, timeline |

# TIMING DES QUESTIONS

| Timing | Quand | Type de questions |
|--------|-------|-------------------|
| first_meeting | Premier call/meeting | Vision, pourquoi maintenant, equipe |
| second_meeting | Deep dive | Execution, metriques, concurrence |
| dd_phase | Due diligence formelle | Financials detailles, legal, tech |
| pre_term_sheet | Avant signature | Dealbreakers, negociation |

# REFERENCE CHECKS - CIBLES PRIORITAIRES

1. CLIENTS (customer) - CRITIQUE
   - Utilisation reelle du produit
   - Satisfaction, NPS
   - Intention de renouveler
   - Problemes rencontres

2. EX-EMPLOYES (former_employee) - HIGH
   - Culture interne
   - Leadership fondateur
   - Raisons du depart
   - Red flags caches

3. CO-INVESTISSEURS (co_investor) - HIGH
   - Pourquoi ils ont investi
   - Ce qu'ils ont decouvert en DD
   - Leur niveau de conviction

4. EXPERTS SECTEUR (industry_expert) - MEDIUM
   - Validation du marche
   - Positionnement vs concurrence
   - Timing

# FORMAT DE SORTIE

Produis un JSON avec cette structure exacte. Chaque champ est OBLIGATOIRE.

# REGLES ABSOLUES

1. JAMAIS de question generique ("Comment voyez-vous l'avenir?")
2. TOUJOURS une question SPECIFIQUE liee a une donnee ("Votre deck dit X mais les benchmarks montrent Y...")
3. Chaque question = source agent + trigger data + evaluation criteria
4. Chaque reference check = profil cible + questions + red flags a detecter
5. Chaque point negociation = leverage + evidence + approche
6. Minimum 15 questions fondateur dont 5+ MUST_ASK
7. Minimum 5 reference checks
8. Minimum 5 points de negociation

# EXEMPLES

## Exemple de BONNE question fondateur:
{
  "id": "Q-001",
  "priority": "MUST_ASK",
  "category": "financials",
  "question": "Votre deck projette une croissance de 300% YoY mais votre equipe sales est de 1 personne. Comment comptez-vous concretement generer 2.5M€ de nouveau ARR avec cette capacite?",
  "context": {
    "sourceAgent": "financial-auditor",
    "redFlagId": "RF-003",
    "triggerData": "Projection ARR 2025: 2.5M€ (+300%) avec 1 sales. Benchmark median: 120% avec 3-4 sales.",
    "whyItMatters": "Si la projection est irrealiste, le ROI sera 60% inferieur aux attentes"
  },
  "evaluation": {
    "goodAnswer": "Plan de recrutement de 3 sales en Q1, pipeline deja qualifie de 500K€, contrats enterprise en cours",
    "badAnswer": "On va recruter quand on aura les fonds / Le produit se vend tout seul",
    "redFlagIfBadAnswer": "Fondateur deconnecte de la realite operationnelle - reviser la these d'investissement",
    "followUpIfBad": "Pouvez-vous me montrer le pipeline actuel et les conversations en cours?"
  },
  "timing": "second_meeting"
}

## Exemple de MAUVAISE question (a eviter):
{
  "question": "Comment voyez-vous la croissance?",
  "priority": "should_ask"
}
→ Pas de contexte, pas de donnee source, pas de critere d'evaluation

## Exemple de BON reference check:
{
  "id": "RC-001",
  "targetType": "customer",
  "priority": "CRITICAL",
  "targetProfile": {
    "description": "Client enterprise utilisant le produit en production depuis >6 mois",
    "idealPerson": "Le VP Engineering de [Client cite slide 8]",
    "howToFind": "Demander l'intro au fondateur ou LinkedIn direct"
  },
  "questions": [
    {
      "question": "Comment le produit a-t-il ete deploye et adopte dans votre equipe?",
      "whatToLookFor": "Temps de deploiement, friction, support necessaire",
      "redFlagAnswer": "Ca a ete tres long / Beaucoup de problemes techniques / On l'utilise plus vraiment"
    },
    {
      "question": "Si le produit disparaissait demain, quel serait l'impact?",
      "whatToLookFor": "Criticite reelle vs nice-to-have",
      "redFlagAnswer": "On trouverait une alternative facilement / C'est juste un test"
    }
  ],
  "rationale": "Valider le PMF revendique et la satisfaction reelle des clients",
  "linkedToRedFlag": "RF-005"
}

## Exemple de BON point de negociation:
{
  "id": "NEG-001",
  "priority": "HIGH_LEVERAGE",
  "category": "valuation",
  "point": "Valorisation trop elevee par rapport aux comparables",
  "leverage": {
    "argument": "La valorisation demandee (25x ARR) est au P85 du marche alors que les metriques (NRR 95%, growth 80%) sont au P40",
    "evidence": "Benchmark Seed SaaS B2B: P50 = 15x ARR pour NRR >110% et growth >100%. Ce deal: 25x avec NRR 95% et growth 80%.",
    "sourceAgent": "financial-auditor"
  },
  "suggestedApproach": "Proposer une valorisation a 15x ARR (P50) soit 9.3M€ pre-money au lieu de 15.6M€",
  "fallbackPosition": "Accepter 18x avec des clauses de protection (anti-dilution, liquidation preference 1x)",
  "walkAwayPoint": "Au-dela de 20x sans metriques ameliorees",
  "estimatedImpact": {
    "description": "Reduction de 40% de la valorisation",
    "valueRange": "Economie de 2-5K€ sur ticket 25K€ via dilution reduite"
  }
}`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<QuestionMasterData> {
    const dealContext = this.formatDealContext(context);
    const contextEngineData = this.formatContextEngineData(context);

    // Extract and format all Tier 1 agent results
    const tier1Summary = this.extractTier1Summary(context);

    const deal = context.deal;

    // Build user prompt
    const prompt = `# ANALYSE QUESTION MASTER - ${deal.companyName || deal.name}

## CONTEXTE DU DEAL
${dealContext}

## CONTEXTE EXTERNE (Context Engine)
${contextEngineData || "Aucune donnee Context Engine disponible pour ce deal."}
${this.formatFactStoreData(context)}
## RESULTATS DES AGENTS TIER 1
${tier1Summary}

## INSTRUCTIONS SPECIFIQUES

1. SYNTHETISE tous les findings des agents Tier 1 (red flags, scores, concerns)
2. GENERE 15+ questions fondateur SPECIFIQUES (dont 5+ MUST_ASK) liees aux red flags
3. PREPARE 5+ reference checks avec profils cibles et questions
4. CREE une checklist DD complete avec critical path
5. IDENTIFIE 5+ points de negociation avec leverage concret
6. DETERMINE les dealbreakers (absolus vs conditionnels)
7. CALCULE le readiness global et la timeline suggeree

## OUTPUT ATTENDU

Produis une synthese complete au format JSON.
Standard: Senior Partner VC avec 25+ ans d'experience.
Chaque question doit etre SPECIFIQUE et liee a une donnee.
Chaque point de negociation doit avoir un LEVERAGE concret.

\`\`\`json
{
  "meta": {
    "dataCompleteness": "complete|partial|minimal",
    "confidenceLevel": 0-100,
    "limitations": ["Ce qui n'a pas pu etre analyse"]
  },
  "score": {
    "value": 0-100,
    "breakdown": [
      {
        "criterion": "Questions Relevance",
        "weight": 30,
        "score": 0-100,
        "justification": "Pourquoi ce score"
      },
      {
        "criterion": "DD Completeness",
        "weight": 25,
        "score": 0-100,
        "justification": ""
      },
      {
        "criterion": "Negotiation Leverage",
        "weight": 20,
        "score": 0-100,
        "justification": ""
      },
      {
        "criterion": "Risk Identification",
        "weight": 15,
        "score": 0-100,
        "justification": ""
      },
      {
        "criterion": "Actionability",
        "weight": 10,
        "score": 0-100,
        "justification": ""
      }
    ]
  },
  "findings": {
    "founderQuestions": [
      {
        "id": "Q-001",
        "priority": "MUST_ASK|SHOULD_ASK|NICE_TO_HAVE",
        "category": "vision|execution|team|market|financials|tech|legal|risk|exit",
        "question": "Question SPECIFIQUE",
        "context": {
          "sourceAgent": "Nom de l'agent source",
          "redFlagId": "RF-XXX (si applicable)",
          "triggerData": "Donnee qui declenche cette question",
          "whyItMatters": "Pourquoi c'est important"
        },
        "evaluation": {
          "goodAnswer": "Ce qui rassure",
          "badAnswer": "Ce qui inquiete",
          "redFlagIfBadAnswer": "Implication si mauvaise reponse",
          "followUpIfBad": "Question de suivi"
        },
        "timing": "first_meeting|second_meeting|dd_phase|pre_term_sheet"
      }
    ],
    "referenceChecks": [
      {
        "id": "RC-001",
        "targetType": "customer|former_employee|co_investor|industry_expert|former_board_member|former_cofounder",
        "priority": "CRITICAL|HIGH|MEDIUM",
        "targetProfile": {
          "description": "Description du profil cible",
          "idealPerson": "Nom/poste ideal si identifie",
          "howToFind": "Comment trouver ce contact"
        },
        "questions": [
          {
            "question": "Question specifique",
            "whatToLookFor": "Ce qu'on cherche",
            "redFlagAnswer": "Reponse qui inquiete"
          }
        ],
        "rationale": "Pourquoi ce reference check",
        "linkedToRedFlag": "RF-XXX (si applicable)"
      }
    ],
    "diligenceChecklist": {
      "totalItems": 0,
      "doneItems": 0,
      "blockedItems": 0,
      "criticalPathItems": 0,
      "items": [
        {
          "id": "DD-001",
          "category": "documents|financials|legal|tech|team|market|customers|competitors",
          "item": "Item a verifier",
          "description": "Description detaillee",
          "status": "NOT_DONE|PARTIAL|DONE|BLOCKED|NOT_APPLICABLE",
          "criticalPath": true,
          "blockingForDecision": true,
          "responsibleParty": "founder|ba|third_party",
          "estimatedEffort": "quick|moderate|significant",
          "documentsNeeded": ["Liste des documents"],
          "deadline": "Optionnel",
          "blockerDetails": "Si bloque"
        }
      ]
    },
    "negotiationPoints": [
      {
        "id": "NEG-001",
        "priority": "HIGH_LEVERAGE|MEDIUM_LEVERAGE|NICE_TO_HAVE",
        "category": "valuation|terms|governance|information_rights|pro_rata|vesting|other",
        "point": "Point de negociation",
        "leverage": {
          "argument": "L'argument",
          "evidence": "La preuve",
          "sourceAgent": "Agent source"
        },
        "suggestedApproach": "Approche suggeree",
        "fallbackPosition": "Position de repli",
        "walkAwayPoint": "Point de non-retour",
        "estimatedImpact": {
          "description": "Description impact",
          "valueRange": "Fourchette de valeur"
        }
      }
    ],
    "dealbreakers": [
      {
        "id": "DB-001",
        "severity": "ABSOLUTE|CONDITIONAL",
        "condition": "Condition du dealbreaker",
        "description": "Description",
        "sourceAgent": "Agent source",
        "linkedRedFlags": ["RF-001"],
        "resolvable": true,
        "resolutionPath": "Comment resoudre",
        "timeToResolve": "Timeline",
        "riskIfIgnored": "Risque si on ignore"
      }
    ],
    "tier1Summary": {
      "agentsAnalyzed": [
        {
          "agentName": "financial-auditor",
          "score": 65,
          "grade": "C",
          "criticalRedFlagsCount": 1,
          "highRedFlagsCount": 2,
          "topConcerns": ["Concern 1"],
          "topStrengths": ["Strength 1"],
          "questionsGenerated": 3
        }
      ],
      "totalCriticalRedFlags": 2,
      "totalHighRedFlags": 5,
      "overallReadiness": "READY_TO_INVEST|NEEDS_MORE_DD|SIGNIFICANT_CONCERNS|DO_NOT_PROCEED",
      "readinessRationale": "Explication"
    },
    "topPriorities": [
      {
        "priority": 1,
        "action": "Action prioritaire",
        "rationale": "Pourquoi",
        "deadline": "Quand"
      }
    ],
    "suggestedTimeline": [
      {
        "phase": "Phase 1: Validation initiale",
        "duration": "1 semaine",
        "activities": ["Activite 1"],
        "deliverables": ["Deliverable 1"]
      }
    ]
  },
  "dbCrossReference": {
    "claims": [
      {
        "claim": "Texte exact",
        "location": "Source",
        "dbVerdict": "VERIFIED|CONTRADICTED|PARTIAL|NOT_VERIFIABLE",
        "evidence": "Preuve",
        "severity": "CRITICAL|HIGH|MEDIUM"
      }
    ],
    "uncheckedClaims": ["Claims non verifies"]
  },
  "redFlags": [
    {
      "id": "RF-001",
      "category": "synthesis",
      "severity": "CRITICAL|HIGH|MEDIUM",
      "title": "Titre",
      "description": "Description",
      "location": "Source",
      "evidence": "Preuve",
      "contextEngineData": "Cross-ref si dispo",
      "impact": "Impact pour le BA",
      "question": "Question a poser",
      "redFlagIfBadAnswer": "Ce que ca revele"
    }
  ],
  "questions": [
    {
      "priority": "CRITICAL|HIGH|MEDIUM",
      "category": "synthesis",
      "question": "Top question",
      "context": "Pourquoi",
      "whatToLookFor": "Ce qui revelerait un probleme"
    }
  ],
  "alertSignal": {
    "hasBlocker": false,
    "blockerReason": "",
    "recommendation": "PROCEED|PROCEED_WITH_CAUTION|INVESTIGATE_FURTHER|STOP",
    "justification": "Pourquoi cette recommandation"
  },
  "narrative": {
    "oneLiner": "Resume en 1 phrase pour le BA",
    "summary": "3-4 phrases de synthese",
    "keyInsights": ["3-5 insights majeurs"],
    "forNegotiation": ["Arguments de negociation si on proceed"]
  }
}
\`\`\``;

    const { data } = await this.llmCompleteJSON<LLMQuestionMasterResponse>(prompt);

    // Validate and normalize response
    return this.normalizeResponse(data);
  }

  /**
   * Extract and format all Tier 1 agent results for the prompt
   */
  private extractTier1Summary(context: EnrichedAgentContext): string {
    const previousResults = context.previousResults ?? {};
    const summaries: string[] = [];

    const tier1Agents = [
      "document-extractor",
      "deck-forensics",
      "financial-auditor",
      "market-intelligence",
      "competitive-intel",
      "team-investigator",
      "tech-stack-dd",
      "tech-ops-dd",
      "legal-regulatory",
      "cap-table-auditor",
      "gtm-analyst",
      "customer-intel",
      "exit-strategist",
    ];

    for (const agentName of tier1Agents) {
      const result = previousResults[agentName] as AgentResult & { data?: Record<string, unknown> };
      if (!result) continue;

      let agentSummary = `\n### ${agentName.toUpperCase()}\n`;
      agentSummary += `Status: ${result.success ? "SUCCESS" : "FAILED"}\n`;

      if (result.success && result.data) {
        const data = result.data;

        // Extract score if available
        if (data.score && typeof data.score === "object") {
          const score = data.score as { value?: number; grade?: string };
          if (score.value !== undefined) {
            agentSummary += `Score: ${score.value}/100 (Grade: ${score.grade || "N/A"})\n`;
          }
        }

        // Extract red flags if available
        if (Array.isArray(data.redFlags) && data.redFlags.length > 0) {
          agentSummary += `Red Flags (${data.redFlags.length}):\n`;
          for (const rf of data.redFlags.slice(0, 5)) {
            const flag = rf as { severity?: string; title?: string; description?: string };
            agentSummary += `  - [${flag.severity || "UNKNOWN"}] ${flag.title || flag.description || "Red flag detected"}\n`;
          }
        }

        // Extract narrative if available
        if (data.narrative && typeof data.narrative === "object") {
          const narrative = data.narrative as { oneLiner?: string; keyInsights?: string[] };
          if (narrative.oneLiner) {
            agentSummary += `Summary: ${narrative.oneLiner}\n`;
          }
          if (Array.isArray(narrative.keyInsights) && narrative.keyInsights.length > 0) {
            agentSummary += `Key Insights:\n`;
            for (const insight of narrative.keyInsights.slice(0, 3)) {
              agentSummary += `  - ${insight}\n`;
            }
          }
        }

        // Extract alert signal if available
        if (data.alertSignal && typeof data.alertSignal === "object") {
          const alert = data.alertSignal as { recommendation?: string; hasBlocker?: boolean };
          if (alert.recommendation) {
            agentSummary += `Recommendation: ${alert.recommendation}${alert.hasBlocker ? " (BLOCKER)" : ""}\n`;
          }
        }

        // Extract questions if available
        if (Array.isArray(data.questions) && data.questions.length > 0) {
          agentSummary += `Questions generated: ${data.questions.length}\n`;
        }

        // Handle document-extractor specifically
        if (agentName === "document-extractor" && data.extractedInfo) {
          agentSummary += `Extracted Info: ${JSON.stringify(data.extractedInfo, null, 2).substring(0, 1000)}...\n`;
        }
      } else if (result.error) {
        agentSummary += `Error: ${result.error}\n`;
      }

      summaries.push(agentSummary);
    }

    if (summaries.length === 0) {
      return "Aucun resultat d'agent Tier 1 disponible. Generation basee sur le deck uniquement.";
    }

    return summaries.join("\n");
  }

  private normalizeResponse(data: LLMQuestionMasterResponse): QuestionMasterData {
    // Normalize meta
    const validCompleteness = ["complete", "partial", "minimal"] as const;
    const dataCompleteness = validCompleteness.includes(data.meta?.dataCompleteness as typeof validCompleteness[number])
      ? data.meta.dataCompleteness
      : "minimal";

    const meta: AgentMeta = {
      agentName: "question-master",
      analysisDate: new Date().toISOString(),
      dataCompleteness,
      confidenceLevel: Math.min(100, Math.max(0, data.meta?.confidenceLevel ?? 50)),
      limitations: Array.isArray(data.meta?.limitations) ? data.meta.limitations : [],
    };

    // Calculate grade from score
    const scoreValue = Math.min(100, Math.max(0, data.score?.value ?? 50));
    const getGrade = (score: number): "A" | "B" | "C" | "D" | "F" => {
      if (score >= 80) return "A";
      if (score >= 65) return "B";
      if (score >= 50) return "C";
      if (score >= 35) return "D";
      return "F";
    };

    const score: AgentScore = {
      value: scoreValue,
      grade: getGrade(scoreValue),
      breakdown: Array.isArray(data.score?.breakdown)
        ? data.score.breakdown.map(b => ({
            criterion: b.criterion ?? "Unknown",
            weight: b.weight ?? 20,
            score: Math.min(100, Math.max(0, b.score ?? 50)),
            justification: b.justification ?? "",
          }))
        : [],
    };

    // Normalize findings
    const findings = this.normalizeFindings(data.findings);

    // Normalize dbCrossReference
    const validVerdicts = ["VERIFIED", "CONTRADICTED", "PARTIAL", "NOT_VERIFIABLE"] as const;
    const validSeverities = ["CRITICAL", "HIGH", "MEDIUM"] as const;

    const dbCrossReference: DbCrossReference = {
      claims: Array.isArray(data.dbCrossReference?.claims)
        ? data.dbCrossReference.claims.map(c => ({
            claim: c.claim ?? "",
            location: c.location ?? "",
            dbVerdict: validVerdicts.includes(c.dbVerdict as typeof validVerdicts[number])
              ? c.dbVerdict
              : "NOT_VERIFIABLE",
            evidence: c.evidence ?? "",
            severity: c.severity && validSeverities.includes(c.severity) ? c.severity : undefined,
          }))
        : [],
      uncheckedClaims: Array.isArray(data.dbCrossReference?.uncheckedClaims)
        ? data.dbCrossReference.uncheckedClaims
        : [],
    };

    // Normalize red flags
    const redFlags: AgentRedFlag[] = Array.isArray(data.redFlags)
      ? data.redFlags.map((rf, idx) => ({
          id: rf.id ?? `RF-${String(idx + 1).padStart(3, "0")}`,
          category: rf.category ?? "synthesis",
          severity: validSeverities.includes(rf.severity as typeof validSeverities[number])
            ? rf.severity
            : "MEDIUM",
          title: rf.title ?? "Red flag detecte",
          description: rf.description ?? "",
          location: rf.location ?? "Synthese Tier 1",
          evidence: rf.evidence ?? "",
          contextEngineData: rf.contextEngineData,
          impact: rf.impact ?? "",
          question: rf.question ?? "",
          redFlagIfBadAnswer: rf.redFlagIfBadAnswer ?? "",
        }))
      : [];

    // Normalize questions
    const validPriorities = ["CRITICAL", "HIGH", "MEDIUM"] as const;

    const questions: AgentQuestion[] = Array.isArray(data.questions)
      ? data.questions.map(q => ({
          priority: validPriorities.includes(q.priority as typeof validPriorities[number])
            ? q.priority
            : "MEDIUM",
          category: q.category ?? "synthesis",
          question: q.question ?? "",
          context: q.context ?? "",
          whatToLookFor: q.whatToLookFor ?? "",
        }))
      : [];

    // Normalize alert signal
    const validRecommendations = ["PROCEED", "PROCEED_WITH_CAUTION", "INVESTIGATE_FURTHER", "STOP"] as const;
    const hasCriticalBlocker = redFlags.some(rf => rf.severity === "CRITICAL");

    const alertSignal: AgentAlertSignal = {
      hasBlocker: data.alertSignal?.hasBlocker ?? hasCriticalBlocker,
      blockerReason: data.alertSignal?.blockerReason,
      recommendation: validRecommendations.includes(data.alertSignal?.recommendation as typeof validRecommendations[number])
        ? data.alertSignal.recommendation
        : hasCriticalBlocker
          ? "INVESTIGATE_FURTHER"
          : "PROCEED_WITH_CAUTION",
      justification: data.alertSignal?.justification ?? "",
    };

    // Normalize narrative
    const narrative: AgentNarrative = {
      oneLiner: data.narrative?.oneLiner ?? "Synthese des analyses Tier 1 disponible.",
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

  private normalizeFindings(findings: LLMQuestionMasterResponse["findings"]): QuestionMasterFindings {
    const validQuestionPriorities = ["MUST_ASK", "SHOULD_ASK", "NICE_TO_HAVE"] as const;
    const validCategories = ["vision", "execution", "team", "market", "financials", "tech", "legal", "risk", "exit"] as const;
    const validTimings = ["first_meeting", "second_meeting", "dd_phase", "pre_term_sheet"] as const;

    // Normalize founder questions
    const founderQuestions: FounderQuestion[] = Array.isArray(findings?.founderQuestions)
      ? findings.founderQuestions.map((q, idx) => ({
          id: q.id ?? `Q-${String(idx + 1).padStart(3, "0")}`,
          priority: validQuestionPriorities.includes(q.priority as typeof validQuestionPriorities[number])
            ? q.priority
            : "SHOULD_ASK",
          category: validCategories.includes(q.category as typeof validCategories[number])
            ? (q.category as typeof validCategories[number])
            : "execution",
          question: q.question ?? "",
          context: {
            sourceAgent: q.context?.sourceAgent ?? "unknown",
            redFlagId: q.context?.redFlagId,
            triggerData: q.context?.triggerData ?? "",
            whyItMatters: q.context?.whyItMatters ?? "",
          },
          evaluation: {
            goodAnswer: q.evaluation?.goodAnswer ?? "",
            badAnswer: q.evaluation?.badAnswer ?? "",
            redFlagIfBadAnswer: q.evaluation?.redFlagIfBadAnswer ?? "",
            followUpIfBad: q.evaluation?.followUpIfBad ?? "",
          },
          timing: validTimings.includes(q.timing as typeof validTimings[number])
            ? (q.timing as typeof validTimings[number])
            : "second_meeting",
        }))
      : [];

    // Normalize reference checks
    const validTargetTypes = ["customer", "former_employee", "co_investor", "industry_expert", "former_board_member", "former_cofounder"] as const;
    const validRCPriorities = ["CRITICAL", "HIGH", "MEDIUM"] as const;

    const referenceChecks: ReferenceCheck[] = Array.isArray(findings?.referenceChecks)
      ? findings.referenceChecks.map((rc, idx) => ({
          id: rc.id ?? `RC-${String(idx + 1).padStart(3, "0")}`,
          targetType: validTargetTypes.includes(rc.targetType as typeof validTargetTypes[number])
            ? (rc.targetType as typeof validTargetTypes[number])
            : "customer",
          priority: validRCPriorities.includes(rc.priority as typeof validRCPriorities[number])
            ? rc.priority
            : "MEDIUM",
          targetProfile: {
            description: rc.targetProfile?.description ?? "",
            idealPerson: rc.targetProfile?.idealPerson,
            howToFind: rc.targetProfile?.howToFind ?? "",
          },
          questions: Array.isArray(rc.questions)
            ? rc.questions.map(q => ({
                question: q.question ?? "",
                whatToLookFor: q.whatToLookFor ?? "",
                redFlagAnswer: q.redFlagAnswer ?? "",
              }))
            : [],
          rationale: rc.rationale ?? "",
          linkedToRedFlag: rc.linkedToRedFlag,
        }))
      : [];

    // Normalize diligence checklist
    const validStatuses = ["NOT_DONE", "PARTIAL", "DONE", "BLOCKED", "NOT_APPLICABLE"] as const;
    const validDDCategories = ["documents", "financials", "legal", "tech", "team", "market", "customers", "competitors"] as const;
    const validParties = ["founder", "ba", "third_party"] as const;
    const validEfforts = ["quick", "moderate", "significant"] as const;

    const items: DiligenceChecklistItem[] = Array.isArray(findings?.diligenceChecklist?.items)
      ? findings.diligenceChecklist.items.map((item, idx) => ({
          id: item.id ?? `DD-${String(idx + 1).padStart(3, "0")}`,
          category: validDDCategories.includes(item.category as typeof validDDCategories[number])
            ? (item.category as typeof validDDCategories[number])
            : "documents",
          item: item.item ?? "",
          description: item.description ?? "",
          status: validStatuses.includes(item.status as typeof validStatuses[number])
            ? (item.status as typeof validStatuses[number])
            : "NOT_DONE",
          criticalPath: item.criticalPath ?? false,
          blockingForDecision: item.blockingForDecision ?? false,
          responsibleParty: validParties.includes(item.responsibleParty as typeof validParties[number])
            ? (item.responsibleParty as typeof validParties[number])
            : "founder",
          estimatedEffort: validEfforts.includes(item.estimatedEffort as typeof validEfforts[number])
            ? (item.estimatedEffort as typeof validEfforts[number])
            : "moderate",
          documentsNeeded: Array.isArray(item.documentsNeeded) ? item.documentsNeeded : [],
          deadline: item.deadline,
          blockerDetails: item.blockerDetails,
        }))
      : [];

    const diligenceChecklist = {
      totalItems: items.length,
      doneItems: items.filter(i => i.status === "DONE").length,
      blockedItems: items.filter(i => i.status === "BLOCKED").length,
      criticalPathItems: items.filter(i => i.criticalPath).length,
      items,
    };

    // Normalize negotiation points
    const validNegPriorities = ["HIGH_LEVERAGE", "MEDIUM_LEVERAGE", "NICE_TO_HAVE"] as const;
    const validNegCategories = ["valuation", "terms", "governance", "information_rights", "pro_rata", "vesting", "other"] as const;

    const negotiationPoints: NegotiationPoint[] = Array.isArray(findings?.negotiationPoints)
      ? findings.negotiationPoints.map((np, idx) => ({
          id: np.id ?? `NEG-${String(idx + 1).padStart(3, "0")}`,
          priority: validNegPriorities.includes(np.priority as typeof validNegPriorities[number])
            ? (np.priority as typeof validNegPriorities[number])
            : "MEDIUM_LEVERAGE",
          category: validNegCategories.includes(np.category as typeof validNegCategories[number])
            ? (np.category as typeof validNegCategories[number])
            : "other",
          point: np.point ?? "",
          leverage: {
            argument: np.leverage?.argument ?? "",
            evidence: np.leverage?.evidence ?? "",
            sourceAgent: np.leverage?.sourceAgent ?? "",
          },
          suggestedApproach: np.suggestedApproach ?? "",
          fallbackPosition: np.fallbackPosition ?? "",
          walkAwayPoint: np.walkAwayPoint ?? "",
          estimatedImpact: np.estimatedImpact,
        }))
      : [];

    // Normalize dealbreakers
    const validDBSeverities = ["ABSOLUTE", "CONDITIONAL"] as const;

    const dealbreakers: Dealbreaker[] = Array.isArray(findings?.dealbreakers)
      ? findings.dealbreakers.map((db, idx) => ({
          id: db.id ?? `DB-${String(idx + 1).padStart(3, "0")}`,
          severity: validDBSeverities.includes(db.severity as typeof validDBSeverities[number])
            ? db.severity
            : "CONDITIONAL",
          condition: db.condition ?? "",
          description: db.description ?? "",
          sourceAgent: db.sourceAgent ?? "",
          linkedRedFlags: Array.isArray(db.linkedRedFlags) ? db.linkedRedFlags : [],
          resolvable: db.resolvable ?? true,
          resolutionPath: db.resolutionPath,
          timeToResolve: db.timeToResolve,
          riskIfIgnored: db.riskIfIgnored ?? "",
        }))
      : [];

    // Normalize tier1Summary
    const validReadiness = ["READY_TO_INVEST", "NEEDS_MORE_DD", "SIGNIFICANT_CONCERNS", "DO_NOT_PROCEED"] as const;
    const validGrades = ["A", "B", "C", "D", "F"] as const;

    const agentsAnalyzed: AgentFindingsSummary[] = Array.isArray(findings?.tier1Summary?.agentsAnalyzed)
      ? findings.tier1Summary.agentsAnalyzed.map(a => ({
          agentName: a.agentName ?? "",
          score: Math.min(100, Math.max(0, a.score ?? 0)),
          grade: validGrades.includes(a.grade as typeof validGrades[number])
            ? (a.grade as typeof validGrades[number])
            : "C",
          criticalRedFlagsCount: a.criticalRedFlagsCount ?? 0,
          highRedFlagsCount: a.highRedFlagsCount ?? 0,
          topConcerns: Array.isArray(a.topConcerns) ? a.topConcerns : [],
          topStrengths: Array.isArray(a.topStrengths) ? a.topStrengths : [],
          questionsGenerated: a.questionsGenerated ?? 0,
        }))
      : [];

    const tier1Summary = {
      agentsAnalyzed,
      totalCriticalRedFlags: findings?.tier1Summary?.totalCriticalRedFlags ?? 0,
      totalHighRedFlags: findings?.tier1Summary?.totalHighRedFlags ?? 0,
      overallReadiness: validReadiness.includes(findings?.tier1Summary?.overallReadiness as typeof validReadiness[number])
        ? (findings.tier1Summary.overallReadiness as typeof validReadiness[number])
        : "NEEDS_MORE_DD",
      readinessRationale: findings?.tier1Summary?.readinessRationale ?? "",
    };

    // Normalize top priorities
    const topPriorities = Array.isArray(findings?.topPriorities)
      ? findings.topPriorities.map((p, idx) => ({
          priority: p.priority ?? idx + 1,
          action: p.action ?? "",
          rationale: p.rationale ?? "",
          deadline: p.deadline ?? "",
        }))
      : [];

    // Normalize suggested timeline
    const suggestedTimeline = Array.isArray(findings?.suggestedTimeline)
      ? findings.suggestedTimeline.map(t => ({
          phase: t.phase ?? "",
          duration: t.duration ?? "",
          activities: Array.isArray(t.activities) ? t.activities : [],
          deliverables: Array.isArray(t.deliverables) ? t.deliverables : [],
        }))
      : [];

    return {
      founderQuestions,
      referenceChecks,
      diligenceChecklist,
      negotiationPoints,
      dealbreakers,
      tier1Summary,
      topPriorities,
      suggestedTimeline,
    };
  }
}

export const questionMaster = new QuestionMasterAgent();
