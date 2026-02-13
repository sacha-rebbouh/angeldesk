import { BaseAgent } from "../base-agent";
import type {
  EnrichedAgentContext,
  TechStackDDResult,
  TechStackDDData,
  TechStackDDFindings,
  TechStackAnalysis,
  ScalabilityAnalysis,
  TechnicalDebtAnalysis,
  AgentMeta,
  AgentScore,
  AgentRedFlag,
  AgentQuestion,
  AgentAlertSignal,
  AgentNarrative,
  DbCrossReference,
} from "../types";
import { calculateAgentScore, TECH_STACK_DD_CRITERIA, type ExtractedMetric } from "@/scoring/services/agent-score-calculator";

/**
 * Tech-Stack-DD Agent - Split from Technical DD v2.0
 *
 * Mission: Due diligence Stack Technique + Scalabilité + Dette Technique
 * Persona: CTO/VPE senior avec 20+ ans d'expérience en startups tech et scale-ups.
 *
 * Périmètre (55% de l'ancien Technical DD):
 * - Stack Technique (36.4% relatif) - Technologies, modernité, adéquation
 * - Scalabilité (36.4% relatif) - Architecture, bottlenecks, capacité
 * - Dette Technique (27.2% relatif) - Indicateurs, coûts, qualité code
 *
 * Inputs:
 * - Documents: Pitch deck, documentation technique si disponible
 * - Context Engine: Comparables sectoriels, stacks techniques du marché
 * - Dependencies: document-extractor
 *
 * Outputs:
 * - Score: 0-100 avec breakdown par critère (3 critères)
 * - Findings: Stack, scalabilité, dette
 * - Red Flags: Avec sévérité + preuve + impact + question
 * - Questions: Pour le fondateur avec contexte
 */

export class TechStackDDAgent extends BaseAgent<TechStackDDData, TechStackDDResult> {
  constructor() {
    super({
      name: "tech-stack-dd",
      description: "Due diligence technique - stack, scalabilité, dette technique",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 240000, // 4 min
      dependencies: ["document-extractor"],
    });
  }

  protected buildSystemPrompt(): string {
    return `# ROLE ET EXPERTISE

Tu es un CTO/VPE senior avec 20+ ans d'expérience en startups tech et scale-ups.
Tu as audité 500+ stacks techniques et vu les patterns de succès et d'échec.
Tu combines la rigueur d'un consultant Big4 avec l'instinct d'un Partner VC tech.

Tu sais que:
- Une mauvaise stack peut tuer une startup (dette technique insurmontable)
- "On scale quand il faut" = pas de plan = problème
- Les startups mentent souvent sur leur maturité technique
- Over-engineering early stage = red flag (trop de microservices trop tôt)

# TRANSPARENCE SUR LES LIMITATIONS (OBLIGATOIRE)

## DISCLAIMER CRITIQUE:
Tu n'as PAS acces au code source de la startup. Ton analyse est basee UNIQUEMENT sur:
- Le pitch deck (slides techniques)
- La documentation technique si fournie
- Les claims du fondateur
- Le Context Engine (donnees externes)

## IMPACT SUR LE SCORING:
- Toute evaluation de la qualite du code est une INFERENCE, pas un fait
- Les scores de "Dette Technique" doivent etre marques comme "INFERRED_FROM_DECK"
- Le score global ne peut PAS depasser 75/100 sans acces au code
- Si le deck ne mentionne AUCUNE technologie: score max 50/100

## DANS LE NARRATIVE:
TOUJOURS inclure un paragraphe de transparence:
"Cette analyse est basee uniquement sur les documents fournis. Sans acces au code source,
les evaluations de dette technique et qualite de code sont des inferences basees sur
les indices indirects (taille equipe vs features, technos mentionnees, etc.).
Une revue de code par un CTO externe est recommandee avant investissement."

# MISSION POUR CE DEAL

Réaliser une due diligence technique FOCALISÉE sur Stack + Scalabilité + Dette pour permettre à un Business Angel (même non-technique) de:
1. Comprendre si la stack technique est adaptée au problème
2. Évaluer les risques de scalabilité et les bottlenecks
3. Identifier la dette technique qui peut ralentir l'équipe
4. Avoir des questions précises à poser au fondateur

# METHODOLOGIE D'ANALYSE

## Étape 1: Analyse de la Stack Technique (36% du score)
- Identifier TOUTES les technologies mentionnées (frontend, backend, infra, DB)
- Évaluer la modernité (React/Vue = OK, jQuery/PHP5 = attention)
- Évaluer l'adéquation au problème (ML pour un CRUD = overkill, Excel pour du Big Data = insuffisant)
- Identifier les dépendances critiques (APIs tierces, libs non maintenues)
- Évaluer le vendor lock-in (AWS Lambda = lock-in fort, K8s = portable)

## Étape 2: Évaluation de la Scalabilité (36% du score)
- Architecture: monolith vs microservices (attention: trop de microservices early stage = red flag)
- Identifier les bottlenecks potentiels (DB, API, compute)
- Évaluer la capacité actuelle vs projections business
- Vérifier: peuvent-ils x10 sans tout récrire?

## Étape 3: Audit de la Dette Technique (28% du score)
- Indicateurs: fréquence releases, ratio devs/features, bugs en prod
- Qualité code: tests, documentation, code review
- Estimer le coût de la dette (en mois-homme et en €)
- Impact sur la vélocité future

# FRAMEWORK D'ÉVALUATION

| Critère | Poids | Score 0-25 | Score 25-50 | Score 50-75 | Score 75-100 |
|---------|-------|------------|-------------|-------------|--------------|
| Stack Technique | 36% | Legacy/inadequate | Fonctionnel mais dette | Moderne et adapté | Best practices |
| Scalabilité | 36% | Pas de plan | Bottlenecks majeurs | Plan clair, travail requis | Ready to scale |
| Dette Technique | 28% | Critique | Élevée | Gérée | Faible |

# RED FLAGS À DÉTECTER

1. **CRITICAL - Deal breakers potentiels:**
   - Stack complètement inadaptée (Excel pour du SaaS B2B...)
   - Zéro tests, zéro documentation, déploiements manuels
   - Dépendance critique sur un service instable/déprécié
   - Architecture impossible à faire scaler

2. **HIGH - Risques majeurs:**
   - Stack legacy (PHP5, jQuery, Cobol...)
   - Pas de CI/CD
   - Vendor lock-in extrême
   - Pas de plan de scalabilité
   - Open source avec licences problématiques (GPL dans du proprio)

3. **MEDIUM - Points d'attention:**
   - Architecture over-engineered pour le stade
   - Ratio devs/features déséquilibré
   - Tests insuffisants
   - Documentation partielle

# RÈGLES ABSOLUES

1. JAMAIS inventer de données - "Non disponible dans les documents" si absent
2. TOUJOURS citer la source (Slide X, Document Y, "Inféré de...")
3. TOUJOURS croiser avec le Context Engine quand disponible
4. QUANTIFIER chaque fois que possible (coût en €, timeline en mois)
5. Chaque red flag = sévérité + preuve + impact + question à poser
6. Le BA doit pouvoir comprendre même sans background technique
7. Expliquer le jargon technique entre parenthèses

# EXEMPLES

## Exemple de BON output (extrait):

"Stack technique: CONCERNING
- Backend: PHP 5.6 (Source: Slide 12 'Notre stack')
- Problème: PHP 5.6 n'est plus supporté depuis 2018, vulnérabilités de sécurité connues
- Impact: Migration obligatoire vers PHP 8+ = 3-6 mois de travail, €50-100K
- Question: 'Avez-vous un plan de migration PHP? Budget et timeline?'

Dette technique: HIGH
- Indicateurs détectés (Slide 8, Section Team):
  - 5 développeurs mais seulement 2 features livrées en 6 mois = ratio 0.4 features/dev/semestre
  - Benchmark: startup Seed devrait être à 2-3 features/dev/semestre (OpenView 2024)
  - Écart: 5-7x plus lent que la normale
- Conclusion: Dette technique probable qui ralentit considérablement la vélocité
- Coût estimé si on remédie: 2-4 mois de travail (refactoring, tests, documentation)"

## Exemple de MAUVAIS output (à éviter):

"La stack semble moderne et adéquate. Quelques risques à surveiller mais rien de bloquant."

→ POURQUOI C'EST NUL:
- "Semble" = aucune preuve
- Aucune technologie citée
- Aucune source
- "Quelques risques" = lesquels exactement?
- Zéro actionnable pour le BA`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<TechStackDDData> {
    this._dealStage = context.deal.stage;
    const dealContext = this.formatDealContext(context);
    const contextEngineData = this.formatContextEngineData(context);
    const extractedInfo = this.getExtractedInfo(context);

    // Build tech-specific context
    let techSection = "";
    if (extractedInfo) {
      const techData = {
        techStack: extractedInfo.techStack,
        productDescription: extractedInfo.productDescription,
        teamSize: extractedInfo.teamSize,
      };
      techSection = `\n## Données Techniques Extraites du Deck\n${JSON.stringify(techData, null, 2)}`;
    }

    const prompt = `# ANALYSE TECH-STACK-DD - ${context.deal.name}

## DOCUMENTS FOURNIS
${dealContext}
${techSection}

## CONTEXTE EXTERNE (Context Engine)
${contextEngineData || "Pas de données Context Engine disponibles pour ce deal."}
${this.formatFactStoreData(context)}
## INSTRUCTIONS SPÉCIFIQUES

1. Analyse CHAQUE composant de la stack mentionné dans les documents
2. Pour chaque technologie, évalue: modernité, adéquation, risques
3. Identifie les gaps dans les informations techniques (red flag si produit "en production" mais zéro détail tech)
4. Compare avec les standards du secteur si Context Engine disponible
5. Formule des questions NON-CONFRONTATIONNELLES pour le fondateur
6. Explique les termes techniques pour un BA non-technique

## OUTPUT ATTENDU

Produis une analyse technique COMPLÈTE au format JSON ci-dessous.
Standard: Audit Big4 + instinct Partner VC tech.
Chaque affirmation doit être sourcée ou marquée "Non disponible".

\`\`\`json
{
  "meta": {
    "agentName": "tech-stack-dd",
    "analysisDate": "[ISO date]",
    "dataCompleteness": "complete|partial|minimal",
    "confidenceLevel": [0-100],
    "limitations": ["Liste des éléments non analysables"]
  },
  "score": {
    "value": [0-100],
    "grade": "A|B|C|D|F",
    "breakdown": [
      {
        "criterion": "Stack Technique",
        "weight": 36,
        "score": [0-100],
        "justification": "Explication avec source"
      },
      {
        "criterion": "Scalabilité",
        "weight": 36,
        "score": [0-100],
        "justification": "Explication avec source"
      },
      {
        "criterion": "Dette Technique",
        "weight": 28,
        "score": [0-100],
        "justification": "Explication avec source"
      }
    ]
  },
  "findings": {
    "techStack": {
      "frontend": {
        "technologies": ["Liste"],
        "assessment": "Évaluation",
        "modernityScore": [0-100]
      },
      "backend": {
        "technologies": ["Liste"],
        "languages": ["Langages"],
        "frameworks": ["Frameworks"],
        "assessment": "Évaluation",
        "modernityScore": [0-100]
      },
      "infrastructure": {
        "cloud": "AWS|GCP|Azure|On-prem|Hybrid|Unknown",
        "containerization": true|false,
        "orchestration": "K8s|ECS|None|Unknown",
        "cicd": "Description ou Unknown",
        "assessment": "Évaluation"
      },
      "databases": {
        "primary": "Nom DB",
        "secondary": ["Autres DBs"],
        "appropriateness": "Évaluation adéquation"
      },
      "thirdPartyDependencies": {
        "critical": [{"name": "Nom", "risk": "Risque", "alternative": "Alt"}],
        "vendorLockIn": "LOW|MEDIUM|HIGH",
        "assessment": "Évaluation"
      },
      "overallAssessment": "MODERN|ADEQUATE|OUTDATED|CONCERNING",
      "stackAppropriatenessForUseCase": "Explication"
    },
    "scalability": {
      "currentArchitecture": "monolith|modular_monolith|microservices|serverless|hybrid|unknown",
      "currentCapacity": {
        "estimatedUsers": "Estimation",
        "estimatedRequests": "Estimation",
        "dataVolume": "Estimation"
      },
      "bottlenecks": [
        {"component": "Composant", "issue": "Problème", "severity": "CRITICAL|HIGH|MEDIUM", "estimatedCostToFix": "€"}
      ],
      "scalingStrategy": {
        "horizontal": true|false,
        "vertical": true|false,
        "autoScaling": true|false,
        "assessment": "Évaluation"
      },
      "readinessForGrowth": {
        "x10": {"ready": true|false, "blockers": ["Liste"]},
        "x100": {"ready": true|false, "blockers": ["Liste"]}
      },
      "scalabilityScore": [0-100]
    },
    "technicalDebt": {
      "level": "LOW|MEDIUM|HIGH|CRITICAL",
      "indicators": [
        {"indicator": "Indicateur", "evidence": "Preuve", "severity": "HIGH|MEDIUM|LOW"}
      ],
      "estimatedCost": {
        "toFix": "€ ou mois-homme",
        "ifIgnored": "Coût si ignoré",
        "timeline": "Timeline"
      },
      "codeQuality": {
        "testCoverage": "Unknown|None|Low|Medium|High",
        "documentation": "NONE|POOR|ADEQUATE|GOOD",
        "codeReview": true|false,
        "assessment": "Évaluation"
      },
      "debtSources": [
        {"source": "Source", "impact": "Impact", "recommendation": "Reco"}
      ]
    },
    "technicalRisks": [
      {
        "id": "risk-1",
        "risk": "Description",
        "category": "architecture|scalability|dependency|debt",
        "severity": "CRITICAL|HIGH|MEDIUM",
        "probability": "HIGH|MEDIUM|LOW",
        "impact": "Impact business",
        "mitigation": "Mitigation",
        "estimatedCostToMitigate": "€",
        "timelineToMitigate": "Timeline"
      }
    ],
    "sectorBenchmark": {
      "stackVsSector": "Comparaison",
      "debtVsSector": "Comparaison",
      "scalabilityVsSector": "Comparaison",
      "overallPosition": "ABOVE_AVERAGE|AVERAGE|BELOW_AVERAGE"
    }
  },
  "dbCrossReference": {
    "claims": [
      {"claim": "Claim", "location": "Slide X", "dbVerdict": "VERIFIED|CONTRADICTED|PARTIAL|NOT_VERIFIABLE", "evidence": "Evidence", "severity": "CRITICAL|HIGH|MEDIUM"}
    ],
    "uncheckedClaims": ["Claims non vérifiables"]
  },
  "redFlags": [
    {
      "id": "rf-1",
      "category": "technical",
      "severity": "CRITICAL|HIGH|MEDIUM",
      "title": "Titre court",
      "description": "Description",
      "location": "Slide X",
      "evidence": "Citation exacte",
      "impact": "Pourquoi problème pour BA",
      "question": "Question pour fondateur",
      "redFlagIfBadAnswer": "Ce qui serait inquiétant"
    }
  ],
  "questions": [
    {
      "priority": "CRITICAL|HIGH|MEDIUM",
      "category": "technical",
      "question": "Question non-confrontationnelle",
      "context": "Pourquoi on pose cette question",
      "whatToLookFor": "Ce qui révèlerait un problème"
    }
  ],
  "alertSignal": {
    "hasBlocker": true|false,
    "blockerReason": "Raison si blocker",
    "recommendation": "PROCEED|PROCEED_WITH_CAUTION|INVESTIGATE_FURTHER|STOP",
    "justification": "Justification"
  },
  "narrative": {
    "oneLiner": "Résumé en 1 phrase",
    "summary": "Résumé en 3-4 phrases",
    "keyInsights": ["3-5 insights majeurs"],
    "forNegotiation": ["Arguments pour négocier"]
  }
}
\`\`\`

IMPORTANT:
- Si peu d'infos techniques, c'est en soi un red flag (produit "en production" sans détail = suspect)
- Un score bas doit être justifié avec des preuves
- Expliquer le jargon technique (ex: "CI/CD (intégration et déploiement automatisés)")

CRITICAL: Réponds UNIQUEMENT avec le JSON. Pas de texte avant ou après. Commence directement par { et termine par }.`;

    const { data } = await this.llmCompleteJSON<LLMTechStackDDResponse>(prompt, {});

    const result = this.normalizeResponse(data, context);

    // F03: DETERMINISTIC SCORING
    try {
      const extractedMetrics: ExtractedMetric[] = [];
      const bd = data.score?.breakdown ?? [];

      for (const b of bd) {
        const criterion = (b.criterion ?? "").toLowerCase();
        if ((criterion.includes("stack") || criterion.includes("technolog")) && b.score != null) {
          extractedMetrics.push({
            name: "stack_modernity", value: b.score,
            unit: "score", source: "LLM breakdown", dataReliability: "DECLARED", category: "technical",
          });
        }
        if (criterion.includes("scalab") && b.score != null) {
          extractedMetrics.push({
            name: "scalability_score", value: b.score,
            unit: "score", source: "LLM breakdown", dataReliability: "DECLARED", category: "technical",
          });
        }
        if (criterion.includes("dette") || criterion.includes("debt")) {
          if (b.score != null) {
            extractedMetrics.push({
              name: "tech_debt_score", value: b.score,
              unit: "score", source: "LLM breakdown", dataReliability: "DECLARED", category: "technical",
            });
          }
        }
      }

      if (extractedMetrics.length > 0) {
        const sector = context.deal.sector ?? "general";
        const stage = context.deal.stage ?? "seed";
        const deterministicScore = await calculateAgentScore(
          "tech-stack-dd", extractedMetrics, sector, stage, TECH_STACK_DD_CRITERIA,
        );
        result.score = { ...result.score, value: deterministicScore.score, breakdown: deterministicScore.breakdown };
      }
    } catch (err) {
      console.error("[tech-stack-dd] Deterministic scoring failed, using LLM score:", err);
    }

    return result;
  }

  private normalizeResponse(data: LLMTechStackDDResponse, _context: EnrichedAgentContext): TechStackDDData {
    // Normalize meta
    const confidenceIsFallback = data.meta?.confidenceLevel == null;
    if (confidenceIsFallback) {
      console.warn(`[tech-stack-dd] LLM did not return confidenceLevel — using 0`);
    }
    const meta: AgentMeta = {
      agentName: "tech-stack-dd",
      analysisDate: data.meta?.analysisDate || new Date().toISOString(),
      dataCompleteness: this.validateEnum(data.meta?.dataCompleteness, ["complete", "partial", "minimal"], "partial"),
      confidenceLevel: confidenceIsFallback ? 0 : Math.min(100, Math.max(0, data.meta!.confidenceLevel!)),
      confidenceIsFallback,
      limitations: Array.isArray(data.meta?.limitations) ? data.meta.limitations : [],
    };

    // Normalize score
    const rawScoreValue = data.score?.value;
    const scoreIsFallback = rawScoreValue === undefined || rawScoreValue === null;
    if (scoreIsFallback) {
      console.warn(`[tech-stack-dd] LLM did not return score value — using 0`);
    }
    const score: AgentScore = {
      value: scoreIsFallback ? 0 : Math.min(100, Math.max(0, rawScoreValue)),
      grade: scoreIsFallback ? "F" : this.validateEnum(data.score?.grade, ["A", "B", "C", "D", "F"], "C"),
      isFallback: scoreIsFallback,
      breakdown: Array.isArray(data.score?.breakdown)
        ? data.score.breakdown.map((b) => ({
            criterion: b.criterion ?? "Unknown",
            weight: b.weight ?? 0,
            score: b.score != null ? Math.min(100, Math.max(0, b.score)) : 0,
            justification: b.justification ?? "Non spécifié",
          }))
        : this.getDefaultBreakdown(),
    };

    // Normalize findings
    const findings: TechStackDDFindings = {
      techStack: this.normalizeTechStack(data.findings?.techStack),
      scalability: this.normalizeScalability(data.findings?.scalability),
      technicalDebt: this.normalizeTechnicalDebt(data.findings?.technicalDebt),
      technicalRisks: Array.isArray(data.findings?.technicalRisks)
        ? data.findings.technicalRisks.map((r, i) => ({
            id: r.id ?? `risk-${i + 1}`,
            risk: r.risk ?? "Non spécifié",
            category: this.validateEnum(r.category, ["architecture", "scalability", "dependency", "debt"], "debt"),
            severity: this.validateEnum(r.severity, ["CRITICAL", "HIGH", "MEDIUM"], "MEDIUM"),
            probability: this.validateEnum(r.probability, ["HIGH", "MEDIUM", "LOW"], "MEDIUM"),
            impact: r.impact ?? "Non spécifié",
            mitigation: r.mitigation ?? "Non spécifié",
            estimatedCostToMitigate: r.estimatedCostToMitigate ?? "Non estimé",
            timelineToMitigate: r.timelineToMitigate ?? "Non estimé",
          }))
        : [],
      sectorBenchmark: {
        stackVsSector: data.findings?.sectorBenchmark?.stackVsSector ?? "Non disponible",
        debtVsSector: data.findings?.sectorBenchmark?.debtVsSector ?? "Non disponible",
        scalabilityVsSector: data.findings?.sectorBenchmark?.scalabilityVsSector ?? "Non disponible",
        overallPosition: this.validateEnum(data.findings?.sectorBenchmark?.overallPosition, ["ABOVE_AVERAGE", "AVERAGE", "BELOW_AVERAGE"], "AVERAGE"),
      },
    };

    // Normalize dbCrossReference
    const dbCrossReference: DbCrossReference = {
      claims: Array.isArray(data.dbCrossReference?.claims)
        ? data.dbCrossReference.claims.map((c) => {
            const severityValue = c.severity
              ? this.validateEnum(c.severity, ["CRITICAL", "HIGH", "MEDIUM"], "MEDIUM")
              : undefined;
            return {
              claim: c.claim ?? "Non spécifié",
              location: c.location ?? "Non spécifié",
              dbVerdict: this.validateEnum(c.dbVerdict, ["VERIFIED", "CONTRADICTED", "PARTIAL", "NOT_VERIFIABLE"], "NOT_VERIFIABLE"),
              evidence: c.evidence ?? "Pas de données DB",
              severity: severityValue as "CRITICAL" | "HIGH" | "MEDIUM" | undefined,
            };
          })
        : [],
      uncheckedClaims: Array.isArray(data.dbCrossReference?.uncheckedClaims) ? data.dbCrossReference.uncheckedClaims : [],
    };

    // Normalize redFlags
    const redFlags: AgentRedFlag[] = Array.isArray(data.redFlags)
      ? data.redFlags.map((rf, i) => ({
          id: rf.id ?? `rf-${i + 1}`,
          category: rf.category ?? "technical",
          severity: this.validateEnum(rf.severity, ["CRITICAL", "HIGH", "MEDIUM"], "MEDIUM"),
          title: rf.title ?? "Red flag non titré",
          description: rf.description ?? "Non spécifié",
          location: rf.location ?? "Non spécifié",
          evidence: rf.evidence ?? "Non spécifié",
          contextEngineData: rf.contextEngineData,
          impact: rf.impact ?? "Non spécifié",
          question: rf.question ?? "Aucune question suggérée",
          redFlagIfBadAnswer: rf.redFlagIfBadAnswer ?? "Non spécifié",
        }))
      : [];

    // Normalize questions
    const questions: AgentQuestion[] = Array.isArray(data.questions)
      ? data.questions.map((q) => ({
          priority: this.validateEnum(q.priority, ["CRITICAL", "HIGH", "MEDIUM"], "MEDIUM"),
          category: q.category ?? "technical",
          question: q.question ?? "Question non spécifiée",
          context: q.context ?? "Non spécifié",
          whatToLookFor: q.whatToLookFor ?? "Non spécifié",
        }))
      : this.getDefaultQuestions();

    // Normalize alertSignal
    const alertSignal: AgentAlertSignal = {
      hasBlocker: data.alertSignal?.hasBlocker ?? false,
      blockerReason: data.alertSignal?.blockerReason,
      recommendation: this.validateEnum(
        data.alertSignal?.recommendation,
        ["PROCEED", "PROCEED_WITH_CAUTION", "INVESTIGATE_FURTHER", "STOP"],
        "PROCEED_WITH_CAUTION"
      ),
      justification: data.alertSignal?.justification ?? "Analyse technique incomplète - prudence recommandée",
    };

    // Normalize narrative
    const narrative: AgentNarrative = {
      oneLiner: data.narrative?.oneLiner ?? "Analyse stack en cours - données insuffisantes pour conclusion",
      summary: data.narrative?.summary ?? "L'analyse de la stack n'a pas pu être complétée de manière exhaustive.",
      keyInsights: Array.isArray(data.narrative?.keyInsights) ? data.narrative.keyInsights : [],
      forNegotiation: Array.isArray(data.narrative?.forNegotiation) ? data.narrative.forNegotiation : [],
    };

    // F38: Cap score without code access — tech analysis is inference-based
    const hasCodeAccess = false; // Always false for now
    if (!hasCodeAccess && !scoreIsFallback) {
      score.value = Math.min(score.value, 75);
      if (!meta.limitations.includes("Analyse basee uniquement sur les documents, pas d'acces au code source")) {
        meta.limitations.push("Analyse basee uniquement sur les documents, pas d'acces au code source");
      }
      meta.confidenceLevel = Math.min(meta.confidenceLevel, 60);
    }

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

  private validateEnum<T extends string>(value: unknown, allowed: T[], defaultValue: T): T {
    if (typeof value === "string" && allowed.includes(value as T)) {
      return value as T;
    }
    return defaultValue;
  }

  private getDefaultBreakdown() {
    return [
      { criterion: "Stack Technique", weight: 36, score: 50, justification: "Données insuffisantes" },
      { criterion: "Scalabilité", weight: 36, score: 50, justification: "Données insuffisantes" },
      { criterion: "Dette Technique", weight: 28, score: 50, justification: "Données insuffisantes" },
    ];
  }

  private getDefaultQuestions(): AgentQuestion[] {
    return [
      {
        priority: "HIGH",
        category: "technical",
        question: "Pouvez-vous nous décrire votre stack technique et les raisons de ces choix?",
        context: "Informations techniques limitées dans le deck",
        whatToLookFor: "Réponse vague ou incohérente = potentiel red flag",
      },
      {
        priority: "HIGH",
        category: "technical",
        question: "Comment gérez-vous les déploiements et les mises en production?",
        context: "Pas d'information sur le CI/CD",
        whatToLookFor: "Déploiements manuels = dette technique probable",
      },
    ];
  }

  private normalizeTechStack(data: unknown): TechStackAnalysis {
    const d = (data ?? {}) as Record<string, unknown>;
    const frontend = (d.frontend ?? {}) as Record<string, unknown>;
    const backend = (d.backend ?? {}) as Record<string, unknown>;
    const infrastructure = (d.infrastructure ?? {}) as Record<string, unknown>;
    const databases = (d.databases ?? {}) as Record<string, unknown>;
    const thirdParty = (d.thirdPartyDependencies ?? {}) as Record<string, unknown>;

    return {
      frontend: {
        technologies: Array.isArray(frontend.technologies) ? frontend.technologies as string[] : [],
        assessment: (frontend.assessment as string) ?? "Non évalué",
        modernityScore: (frontend.modernityScore as number) != null
          ? Math.min(100, Math.max(0, frontend.modernityScore as number)) : 0,
      },
      backend: {
        technologies: Array.isArray(backend.technologies) ? backend.technologies as string[] : [],
        languages: Array.isArray(backend.languages) ? backend.languages as string[] : [],
        frameworks: Array.isArray(backend.frameworks) ? backend.frameworks as string[] : [],
        assessment: (backend.assessment as string) ?? "Non évalué",
        modernityScore: (backend.modernityScore as number) != null
          ? Math.min(100, Math.max(0, backend.modernityScore as number)) : 0,
      },
      infrastructure: {
        cloud: (infrastructure.cloud as string) ?? "Unknown",
        containerization: (infrastructure.containerization as boolean) ?? false,
        orchestration: infrastructure.orchestration as string | undefined,
        cicd: infrastructure.cicd as string | undefined,
        assessment: (infrastructure.assessment as string) ?? "Non évalué",
      },
      databases: {
        primary: (databases.primary as string) ?? "Unknown",
        secondary: Array.isArray(databases.secondary) ? databases.secondary as string[] : undefined,
        appropriateness: (databases.appropriateness as string) ?? "Non évalué",
      },
      thirdPartyDependencies: {
        critical: Array.isArray(thirdParty.critical)
          ? (thirdParty.critical as Array<Record<string, unknown>>).map((dep) => ({
              name: (dep.name as string) ?? "Unknown",
              risk: (dep.risk as string) ?? "Non évalué",
              alternative: dep.alternative as string | undefined,
            }))
          : [],
        vendorLockIn: this.validateEnum(thirdParty.vendorLockIn, ["LOW", "MEDIUM", "HIGH"], "MEDIUM"),
        assessment: (thirdParty.assessment as string) ?? "Non évalué",
      },
      overallAssessment: this.validateEnum(d.overallAssessment, ["MODERN", "ADEQUATE", "OUTDATED", "CONCERNING"], "ADEQUATE"),
      stackAppropriatenessForUseCase: (d.stackAppropriatenessForUseCase as string) ?? "Non évalué",
    };
  }

  private normalizeScalability(data: unknown): ScalabilityAnalysis {
    const d = (data ?? {}) as Record<string, unknown>;
    const currentCapacity = (d.currentCapacity ?? {}) as Record<string, unknown>;
    const scalingStrategy = (d.scalingStrategy ?? {}) as Record<string, unknown>;
    const readiness = (d.readinessForGrowth ?? {}) as Record<string, unknown>;
    const x10 = (readiness.x10 ?? {}) as Record<string, unknown>;
    const x100 = (readiness.x100 ?? {}) as Record<string, unknown>;

    return {
      currentArchitecture: this.validateEnum(d.currentArchitecture, ["monolith", "modular_monolith", "microservices", "serverless", "hybrid", "unknown"], "unknown"),
      currentCapacity: {
        estimatedUsers: (currentCapacity.estimatedUsers as string) ?? "Unknown",
        estimatedRequests: (currentCapacity.estimatedRequests as string) ?? "Unknown",
        dataVolume: (currentCapacity.dataVolume as string) ?? "Unknown",
      },
      bottlenecks: Array.isArray(d.bottlenecks)
        ? (d.bottlenecks as Array<Record<string, unknown>>).map((b) => ({
            component: (b.component as string) ?? "Unknown",
            issue: (b.issue as string) ?? "Non spécifié",
            severity: this.validateEnum(b.severity, ["CRITICAL", "HIGH", "MEDIUM"], "MEDIUM"),
            estimatedCostToFix: (b.estimatedCostToFix as string) ?? "Non estimé",
          }))
        : [],
      scalingStrategy: {
        horizontal: (scalingStrategy.horizontal as boolean) ?? false,
        vertical: (scalingStrategy.vertical as boolean) ?? false,
        autoScaling: (scalingStrategy.autoScaling as boolean) ?? false,
        assessment: (scalingStrategy.assessment as string) ?? "Non évalué",
      },
      readinessForGrowth: {
        x10: {
          ready: (x10.ready as boolean) ?? false,
          blockers: Array.isArray(x10.blockers) ? x10.blockers as string[] : [],
        },
        x100: {
          ready: (x100.ready as boolean) ?? false,
          blockers: Array.isArray(x100.blockers) ? x100.blockers as string[] : [],
        },
      },
      scalabilityScore: (d.scalabilityScore as number) != null
        ? Math.min(100, Math.max(0, d.scalabilityScore as number)) : 0,
    };
  }

  private normalizeTechnicalDebt(data: unknown): TechnicalDebtAnalysis {
    const d = (data ?? {}) as Record<string, unknown>;
    const estimatedCost = (d.estimatedCost ?? {}) as Record<string, unknown>;
    const codeQuality = (d.codeQuality ?? {}) as Record<string, unknown>;

    return {
      level: this.validateEnum(d.level, ["LOW", "MEDIUM", "HIGH", "CRITICAL"], "MEDIUM"),
      indicators: Array.isArray(d.indicators)
        ? (d.indicators as Array<Record<string, unknown>>).map((i) => ({
            indicator: (i.indicator as string) ?? "Non spécifié",
            evidence: (i.evidence as string) ?? "Non spécifié",
            severity: this.validateEnum(i.severity, ["HIGH", "MEDIUM", "LOW"], "MEDIUM"),
          }))
        : [],
      estimatedCost: {
        toFix: (estimatedCost.toFix as string) ?? "Non estimé",
        ifIgnored: (estimatedCost.ifIgnored as string) ?? "Non estimé",
        timeline: (estimatedCost.timeline as string) ?? "Non estimé",
      },
      codeQuality: {
        testCoverage: (codeQuality.testCoverage as string) ?? "Unknown",
        documentation: this.validateEnum(codeQuality.documentation, ["NONE", "POOR", "ADEQUATE", "GOOD"], "POOR"),
        codeReview: (codeQuality.codeReview as boolean) ?? false,
        assessment: (codeQuality.assessment as string) ?? "Non évalué",
      },
      debtSources: Array.isArray(d.debtSources)
        ? (d.debtSources as Array<Record<string, unknown>>).map((s) => ({
            source: (s.source as string) ?? "Non spécifié",
            impact: (s.impact as string) ?? "Non spécifié",
            recommendation: (s.recommendation as string) ?? "Non spécifié",
          }))
        : [],
    };
  }
}

// Type for LLM response (loose typing for parsing)
interface LLMTechStackDDResponse {
  meta?: {
    agentName?: string;
    analysisDate?: string;
    dataCompleteness?: string;
    confidenceLevel?: number;
    limitations?: string[];
  };
  score?: {
    value?: number;
    grade?: string;
    breakdown?: Array<{
      criterion?: string;
      weight?: number;
      score?: number;
      justification?: string;
    }>;
  };
  findings?: {
    techStack?: unknown;
    scalability?: unknown;
    technicalDebt?: unknown;
    technicalRisks?: Array<{
      id?: string;
      risk?: string;
      category?: string;
      severity?: string;
      probability?: string;
      impact?: string;
      mitigation?: string;
      estimatedCostToMitigate?: string;
      timelineToMitigate?: string;
    }>;
    sectorBenchmark?: {
      stackVsSector?: string;
      debtVsSector?: string;
      scalabilityVsSector?: string;
      overallPosition?: string;
    };
  };
  dbCrossReference?: {
    claims?: Array<{
      claim?: string;
      location?: string;
      dbVerdict?: string;
      evidence?: string;
      severity?: string;
    }>;
    uncheckedClaims?: string[];
  };
  redFlags?: Array<{
    id?: string;
    category?: string;
    severity?: string;
    title?: string;
    description?: string;
    location?: string;
    evidence?: string;
    contextEngineData?: string;
    impact?: string;
    question?: string;
    redFlagIfBadAnswer?: string;
  }>;
  questions?: Array<{
    priority?: string;
    category?: string;
    question?: string;
    context?: string;
    whatToLookFor?: string;
  }>;
  alertSignal?: {
    hasBlocker?: boolean;
    blockerReason?: string;
    recommendation?: string;
    justification?: string;
  };
  narrative?: {
    oneLiner?: string;
    summary?: string;
    keyInsights?: string[];
    forNegotiation?: string[];
  };
}

export const techStackDD = new TechStackDDAgent();
