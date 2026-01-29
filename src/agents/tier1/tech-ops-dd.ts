import { BaseAgent } from "../base-agent";
import type {
  EnrichedAgentContext,
  TechOpsDDResult,
  TechOpsDDData,
  TechOpsDDFindings,
  ProductMaturityAnalysis,
  TechTeamCapability,
  SecurityAnalysis,
  TechIPAnalysis,
  AgentMeta,
  AgentScore,
  AgentRedFlag,
  AgentQuestion,
  AgentAlertSignal,
  AgentNarrative,
  DbCrossReference,
} from "../types";

/**
 * Tech-Ops-DD Agent - Split from Technical DD v2.0
 *
 * Mission: Due diligence Maturité Produit + Équipe Tech + Sécurité + IP
 * Persona: CTO/VPE senior avec 20+ ans d'expérience en startups tech et scale-ups.
 *
 * Périmètre (45% de l'ancien Technical DD):
 * - Maturité Produit (33.3% relatif) - Stage, stabilité, vélocité
 * - Équipe Tech (33.3% relatif) - Taille, séniorité, gaps, key person risk
 * - Sécurité (22.2% relatif) - Posture, compliance, pratiques
 * - IP Technique (11.1% relatif) - Brevets, trade secrets, open source
 *
 * Inputs:
 * - Documents: Pitch deck, documentation technique si disponible
 * - Context Engine: Comparables sectoriels, standards équipe
 * - Dependencies: document-extractor
 *
 * Outputs:
 * - Score: 0-100 avec breakdown par critère (4 critères)
 * - Findings: Maturité, équipe, sécurité, IP
 * - Red Flags: Avec sévérité + preuve + impact + question
 * - Questions: Pour le fondateur avec contexte
 */

export class TechOpsDDAgent extends BaseAgent<TechOpsDDData, TechOpsDDResult> {
  constructor() {
    super({
      name: "tech-ops-dd",
      description: "Due diligence technique - maturité produit, équipe, sécurité, IP",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 180000, // 3 min
      dependencies: ["document-extractor", "team-investigator"],
    });
  }

  protected buildSystemPrompt(): string {
    return `# ROLE ET EXPERTISE

Tu es un CTO/VPE senior avec 20+ ans d'expérience en startups tech et scale-ups.
Tu as audité 500+ équipes techniques et vu les patterns de succès et d'échec.
Tu combines la rigueur d'un consultant Big4 avec l'instinct d'un Partner VC tech.

Tu sais que:
- Un CTO seul sans senior = risque majeur de key person dependency
- Une équipe 100% junior = problèmes garantis à moyen terme
- Sécurité absente early stage = risque acceptable, mais pas en production avec données clients
- L'IP peut être un avantage compétitif majeur ou une illusion coûteuse

# MISSION POUR CE DEAL

Réaliser une due diligence technique FOCALISÉE sur Maturité + Équipe + Sécurité + IP pour permettre à un Business Angel (même non-technique) de:
1. Évaluer le niveau de maturité réel du produit
2. Comprendre si l'équipe tech peut livrer ce qu'elle promet
3. Identifier les risques de sécurité et compliance
4. Évaluer la valeur et la protection de l'IP technique

# METHODOLOGIE D'ANALYSE

## Étape 1: Maturité Produit (33% du score)
- Stage réel: POC, MVP, Beta, Production, Scale
- Stabilité: uptime, incidents, rollbacks
- Complétude: features core vs roadmap
- Vélocité: releases par semaine/mois

## Étape 2: Capacité de l'Équipe Tech (33% du score)
- Taille et composition (CTO seul = risque)
- Séniorité (que des juniors = problème)
- Gaps critiques (pas de DevOps = qui deploy?)
- Key person risk (tout repose sur une personne?)

## Étape 3: Sécurité et Conformité (22% du score)
- Posture sécurité: basique ou mature?
- Conformité: GDPR, SOC2 (si B2B enterprise)
- Pratiques: encryption, auth, audit logs
- Vulnérabilités évidentes

## Étape 4: Propriété Intellectuelle (11% du score)
- Brevets (utiles ou vanity?)
- Trade secrets (algo propriétaire?)
- Risque open source (licenses GPL dans du proprio?)
- Défensibilité technique

# FRAMEWORK D'ÉVALUATION

| Critère | Poids | Score 0-25 | Score 25-50 | Score 50-75 | Score 75-100 |
|---------|-------|------------|-------------|-------------|--------------|
| Maturité Produit | 33% | POC | MVP instable | Beta stable | Production robuste |
| Équipe Tech | 33% | Inexistante/junior | Gaps majeurs | Adéquate | Senior et complète |
| Sécurité | 22% | Absente | Basique | Bonne | Excellente |
| IP Technique | 11% | Aucune | Faible | Protégée | Forte et défensible |

# RED FLAGS À DÉTECTER

1. **CRITICAL - Deal breakers potentiels:**
   - CTO inexistant ou non-technique
   - Key person risk absolu (1 dev qui connaît tout)
   - Failles de sécurité évidentes (données en clair, pas d'auth...)
   - Produit "en production" mais aucune preuve de clients réels

2. **HIGH - Risques majeurs:**
   - Équipe 100% junior
   - Pas de roadmap claire
   - Pas de conformité GDPR si données personnelles
   - Copie de code open source sans respect des licences

3. **MEDIUM - Points d'attention:**
   - Gaps dans l'équipe (DevOps, QA...)
   - Tests insuffisants
   - IP non protégée
   - Pas de plan de recrutement

# RÈGLES ABSOLUES - CALCULS OBLIGATOIRES

1. JAMAIS inventer de données - "Non disponible dans les documents" si absent
2. TOUJOURS citer la source (Slide X, Document Y, "Inféré de...", "Team Investigator", "Context Engine")
3. **CONTEXT ENGINE OBLIGATOIRE** - Tu DOIS croiser avec les données Context Engine. Si absentes, mentionner explicitement "Context Engine: Pas de données disponibles" dans limitations
4. **TEAM INVESTIGATOR** - Si des données team-investigator sont fournies, les UTILISER comme base. Ne pas refaire l'analyse équipe from scratch - compléter avec focus technique
5. QUANTIFIER chaque fois que possible (coût en €, timeline en mois)
6. Chaque red flag = sévérité + preuve + impact + question à poser
7. Le BA doit pouvoir comprendre même sans background technique
8. Expliquer le jargon technique entre parenthèses

**RÈGLE CRITIQUE - MONTRER LES CALCULS:**
Tout ratio ou évaluation doit être MONTRÉ avec le calcul complet:

❌ INTERDIT: "L'équipe est sous-dimensionnée"
✅ OBLIGATOIRE: "Équipe: 3 devs pour 50K€ MRR = ratio 16.7K€ ARR/dev
   Benchmark Seed SaaS: 25K€ ARR/dev (Source: Context Engine)
   Écart: -33% vs benchmark → équipe sous-staffée"

❌ INTERDIT: "Séniorité faible"
✅ OBLIGATOIRE: "Séniorité moyenne: (5 + 2 + 1) / 3 = 2.7 ans
   Benchmark: 5+ ans pour CTO, 3+ ans pour devs
   Gap: CTO OK, devs à 1.5 ans de moyenne = risque exécution"

# FORMAT DE SORTIE

Le format JSON détaillé est spécifié dans le user prompt. Respecter strictement cette structure.`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<TechOpsDDData> {
    // Filter documents: exclude FINANCIAL_MODEL (not relevant for tech-ops, saves ~50k chars)
    const filteredContext = {
      ...context,
      documents: context.documents?.filter(
        (doc) => doc.type !== "FINANCIAL_MODEL"
      ),
    };
    const dealContext = this.formatDealContext(filteredContext);
    const contextEngineData = this.formatContextEngineData(context);
    const extractedInfo = this.getExtractedInfo(context);

    // Get team-investigator results if available
    const teamInvestigatorResult = context.previousResults?.["team-investigator"];
    const teamInvestigatorData = teamInvestigatorResult?.success && "data" in teamInvestigatorResult
      ? (teamInvestigatorResult as { data: unknown }).data
      : null;
    let teamInvestigatorSection = "";
    if (teamInvestigatorData) {
      teamInvestigatorSection = `
## DONNÉES TEAM-INVESTIGATOR (UTILISER COMME BASE)

**IMPORTANT:** Ces données ont déjà été analysées par team-investigator.
Ne pas refaire l'analyse équipe from scratch. Utiliser ces findings et COMPLÉTER avec le focus technique:
- Séniorité TECHNIQUE (pas juste business)
- Gaps techniques (DevOps, QA, etc.)
- Key person risk TECHNIQUE
- Capacité à livrer la roadmap

\`\`\`json
${JSON.stringify(teamInvestigatorData, null, 2)}
\`\`\`
`;
    } else {
      teamInvestigatorSection = `
## DONNÉES TEAM-INVESTIGATOR
**Non disponibles** - Analyser l'équipe technique from scratch.
`;
    }

    // Build team and product context
    let techSection = "";
    if (extractedInfo) {
      const techData = {
        productDescription: extractedInfo.productDescription,
        teamSize: extractedInfo.teamSize,
        founders: extractedInfo.founders,
        traction: extractedInfo.traction,
      };
      techSection = `\n## Données Équipe/Produit Extraites (Document Extractor)\n${JSON.stringify(techData, null, 2)}`;
    }

    // Format Context Engine data with explicit status
    const hasContextEngine = contextEngineData && contextEngineData.trim().length > 0;
    const contextEngineSection = hasContextEngine
      ? `## CONTEXTE EXTERNE (Context Engine) - DONNÉES DISPONIBLES ✅

**OBLIGATION:** Ces données DOIVENT être utilisées pour cross-référencer les claims du deck.

${contextEngineData}`
      : `## CONTEXTE EXTERNE (Context Engine) - PAS DE DONNÉES ⚠️

**Aucune donnée Context Engine disponible pour ce deal.**
→ Ajouter "Pas de données Context Engine" dans meta.limitations
→ Réduire confidenceLevel de 10-15 points
→ Marquer les benchmarks comme "estimés sans données marché"`;

    const prompt = `# ANALYSE TECH-OPS-DD - ${context.deal.name}

## DOCUMENTS FOURNIS
${dealContext}
${techSection}
${teamInvestigatorSection}

${contextEngineSection}
${this.formatFactStoreData(context)}
## BENCHMARKS SECTORIELS DE RÉFÉRENCE (Context Engine)

### Taille équipe tech par stage (SaaS B2B)
| Stage | P25 | Median | P75 | Source |
|-------|-----|--------|-----|--------|
| Pre-Seed | 1 | 2 | 3 | Context Engine 2024 |
| Seed | 2 | 4 | 7 | Context Engine 2024 |
| Series A | 5 | 10 | 18 | Context Engine 2024 |

### Séniorité moyenne équipe tech
| Stage | Attendu | Red flag si < |
|-------|---------|---------------|
| Pre-Seed | 3+ ans | 2 ans |
| Seed | 4+ ans | 3 ans |
| Series A | 5+ ans | 4 ans |

### Ratio ARR/dev (productivité)
| Stage | P25 | Median | P75 |
|-------|-----|--------|-----|
| Seed | 15K€ | 25K€ | 40K€ |
| Series A | 50K€ | 80K€ | 120K€ |

### Sécurité attendue par stage
| Stage | Minimum acceptable | Idéal |
|-------|-------------------|-------|
| Pre-Seed | BASIC (encryption, HTTPS) | - |
| Seed | BASIC + GDPR partial | GOOD |
| Series A (B2B) | GOOD + GDPR + SOC2 en cours | EXCELLENT |

## INSTRUCTIONS SPÉCIFIQUES

1. **Maturité Produit** - Analyse avec PREUVES et CALCULS:
   - Stage réel (POC→Scale) avec evidence
   - Stabilité (uptime, incidents) - si non fourni = red flag
   - Features core vs roadmap avec %
   - Fréquence releases vs benchmark

2. **Équipe Tech** - Composition DÉTAILLÉE avec CALCULS:
   - Taille vs benchmark P25/median/P75 du stage
   - Séniorité: CALCUL moyenne = (exp1 + exp2 + ...) / n
   - Ratio ARR/dev si ARR connu
   - Gaps critiques (DevOps, QA, etc.)
   - Key person risk (CTO seul = TOUJOURS mentionner)

3. **Sécurité** - Posture selon stade avec cross-ref benchmark:
   - GDPR si données perso
   - SOC2 si B2B enterprise
   - Pratiques (encryption, auth, logs)
   - Position vs "sécurité attendue par stage"

4. **IP Technique** - Évaluation avec contexte:
   - Brevets (utiles vs vanity)
   - Trade secrets (algo propriétaire?)
   - Risque open source (GPL dans proprio = red flag)

5. **Cross-reference OBLIGATOIRE** - Croiser CHAQUE claim technique:
   - Comparer taille équipe vs benchmark
   - Comparer séniorité vs benchmark
   - Vérifier cohérence claims deck vs réalité

6. **Questions** - Non-confrontationnelles, expliquer jargon technique pour BA non-technique

## FORMAT DE SORTIE JSON

\`\`\`json
{
  "meta": {
    "agentName": "tech-ops-dd",
    "analysisDate": "[ISO]",
    "dataCompleteness": "complete|partial|minimal",
    "confidenceLevel": [0-100],
    "limitations": ["éléments non analysables"]
  },
  "score": {
    "value": [0-100],
    "grade": "A|B|C|D|F",
    "breakdown": [
      {"criterion": "Maturité Produit", "weight": 33, "score": [0-100], "justification": "avec source ET calcul si applicable"},
      {"criterion": "Équipe Tech", "weight": 33, "score": [0-100], "justification": "avec source ET calcul séniorité"},
      {"criterion": "Sécurité", "weight": 22, "score": [0-100], "justification": "avec source ET position vs benchmark stage"},
      {"criterion": "IP Technique", "weight": 11, "score": [0-100], "justification": "avec source"}
    ]
  },
  "findings": {
    "productMaturity": {
      "stage": "concept|prototype|mvp|beta|production|scale",
      "stageEvidence": "preuves concrètes",
      "stability": {"score": [0-100], "incidentFrequency": "freq ou Unknown", "uptimeEstimate": "% ou Unknown", "assessment": "évaluation"},
      "featureCompleteness": {"score": [0-100], "coreFeatures": [{"feature": "nom", "status": "complete|partial|missing"}], "roadmapClarity": "évaluation"},
      "releaseVelocity": {"frequency": "freq ou Unknown", "assessment": "évaluation", "concern": "si problème ou null"}
    },
    "teamCapability": {
      "teamSize": {"current": [nb], "breakdown": [{"role": "CTO/Dev/etc", "count": [nb]}]},
      "seniorityLevel": {
        "assessment": "JUNIOR|MID|SENIOR|MIXED|UNKNOWN",
        "evidence": "CALCUL: (X + Y + Z) / N = moyenne. Détail par personne.",
        "averageYears": [nombre],
        "benchmarkForStage": [nombre attendu]
      },
      "gaps": [{"gap": "DevOps/QA/etc", "severity": "CRITICAL|HIGH|MEDIUM", "impact": "conséquence", "recommendation": "action avec coût estimé"}],
      "keyPersonRisk": {"exists": true|false, "persons": ["noms"], "mitigation": "mesures ou absence"},
      "hiringNeeds": [{"role": "poste", "priority": "IMMEDIATE|NEXT_6M|NEXT_12M", "rationale": "pourquoi", "estimatedCost": "fourchette €"}],
      "overallCapabilityScore": [0-100]
    },
    "security": {
      "posture": "POOR|BASIC|GOOD|EXCELLENT|UNKNOWN",
      "compliance": {"gdpr": "COMPLIANT|PARTIAL|NON_COMPLIANT|NOT_APPLICABLE|UNKNOWN", "soc2": "CERTIFIED|IN_PROGRESS|NOT_STARTED|NOT_APPLICABLE|UNKNOWN", "other": ["autres"]},
      "practices": [{"practice": "encryption/auth/logs/2FA/pentest", "status": "YES|NO|PARTIAL|UNKNOWN"}],
      "vulnerabilities": [{"area": "zone", "severity": "CRITICAL|HIGH|MEDIUM", "description": "desc"}],
      "assessment": "Évaluation vs benchmark du stage",
      "securityScore": [0-100]
    },
    "ipProtection": {
      "patents": {"granted": [nb], "pending": [nb], "domains": ["domaines"], "strategicValue": "éval"},
      "tradeSecrets": {"exists": true|false, "protected": true|false, "description": "desc"},
      "openSourceRisk": {"level": "NONE|LOW|MEDIUM|HIGH", "licenses": ["GPL/MIT/etc"], "concerns": ["si problèmes"]},
      "proprietaryTech": {"exists": true|false, "description": "desc", "defensibility": "éval avec timeline réplication"},
      "ipScore": [0-100]
    },
    "technicalRisks": [{
      "id": "risk-N",
      "risk": "desc",
      "category": "team|security|ip|operations",
      "severity": "CRITICAL|HIGH|MEDIUM",
      "probability": "HIGH|MEDIUM|LOW",
      "impact": "impact business",
      "mitigation": "action possible",
      "estimatedCostToMitigate": "fourchette €",
      "timelineToMitigate": "durée"
    }],
    "sectorBenchmark": {
      "teamSize": {
        "thisCompany": [nb],
        "sectorP25": [nb],
        "sectorMedian": [nb],
        "sectorP75": [nb],
        "percentile": "PXX",
        "source": "Context Engine - [secteur] [stage] 2024"
      },
      "maturity": {
        "thisCompany": "stage",
        "sectorTypical": "stage attendu",
        "assessment": "comparaison"
      },
      "security": {
        "thisCompany": "niveau",
        "sectorExpected": "niveau attendu",
        "assessment": "comparaison"
      },
      "maturityVsSector": "résumé texte",
      "teamSizeVsSector": "résumé texte avec calcul percentile",
      "securityVsSector": "résumé texte",
      "overallPosition": "ABOVE_AVERAGE|AVERAGE|BELOW_AVERAGE"
    }
  },
  "dbCrossReference": {
    "claims": [{
      "claim": "texte exact du deck",
      "location": "Slide X",
      "dbVerdict": "VERIFIED|CONTRADICTED|PARTIAL|NOT_VERIFIABLE",
      "evidence": "preuve avec données benchmark",
      "severity": "CRITICAL|HIGH|MEDIUM ou null si verified"
    }],
    "uncheckedClaims": ["claims non vérifiables"]
  },
  "redFlags": [{
    "id": "rf-N",
    "category": "technical",
    "severity": "CRITICAL|HIGH|MEDIUM",
    "title": "titre court",
    "description": "description complète avec chiffres",
    "location": "Slide X ou Section Y",
    "evidence": "citation exacte + calcul si applicable",
    "impact": "pourquoi problème pour le BA en termes business",
    "question": "question pour fondateur",
    "redFlagIfBadAnswer": "ce qui serait inquiétant"
  }],
  "questions": [{
    "priority": "CRITICAL|HIGH|MEDIUM",
    "category": "technical",
    "question": "question non-confrontationnelle",
    "context": "pourquoi on pose cette question (lié à quel finding)",
    "whatToLookFor": "réponse qui révèlerait un problème"
  }],
  "alertSignal": {
    "hasBlocker": true|false,
    "blockerReason": "raison si blocker",
    "recommendation": "PROCEED|PROCEED_WITH_CAUTION|INVESTIGATE_FURTHER|STOP",
    "justification": "justification avec référence aux findings"
  },
  "narrative": {
    "oneLiner": "résumé 1 phrase avec chiffre clé",
    "summary": "résumé 3-4 phrases couvrant les 4 dimensions",
    "keyInsights": ["3-5 insights majeurs avec chiffres"],
    "forNegotiation": ["arguments concrets pour négocier avec montants/clauses"]
  }
}
\`\`\`

## RÈGLES CRITIQUES - VÉRIFICATION FINALE
- [ ] CTO seul = TOUJOURS key person risk à signaler (sévérité minimum HIGH)
- [ ] Équipe 100% junior sans senior = red flag HIGH minimum
- [ ] Données clients mais pas d'info sécurité = red flag MEDIUM minimum
- [ ] IP sans brevets ≠ problème si trade secrets protégés
- [ ] JAMAIS inventer - "Non disponible" si absent
- [ ] TOUJOURS sourcer (Slide X, Document Y, Context Engine)
- [ ] TOUJOURS montrer les calculs (séniorité moyenne, ratio ARR/dev, etc.)
- [ ] TOUJOURS comparer aux benchmarks P25/median/P75

Réponds UNIQUEMENT avec le JSON valide. Commence par { et termine par }.`;

    const { data } = await this.llmCompleteJSON<LLMTechOpsDDResponse>(prompt, {});

    return this.normalizeResponse(data, context);
  }

  private normalizeResponse(data: LLMTechOpsDDResponse, _context: EnrichedAgentContext): TechOpsDDData {
    // Normalize meta
    const meta: AgentMeta = {
      agentName: "tech-ops-dd",
      analysisDate: data.meta?.analysisDate || new Date().toISOString(),
      dataCompleteness: this.validateEnum(data.meta?.dataCompleteness, ["complete", "partial", "minimal"], "partial"),
      confidenceLevel: Math.min(100, Math.max(0, data.meta?.confidenceLevel ?? 50)),
      limitations: Array.isArray(data.meta?.limitations) ? data.meta.limitations : [],
    };

    // Normalize score
    const score: AgentScore = {
      value: Math.min(100, Math.max(0, data.score?.value ?? 50)),
      grade: this.validateEnum(data.score?.grade, ["A", "B", "C", "D", "F"], "C"),
      breakdown: Array.isArray(data.score?.breakdown)
        ? data.score.breakdown.map((b) => ({
            criterion: b.criterion ?? "Unknown",
            weight: b.weight ?? 0,
            score: Math.min(100, Math.max(0, b.score ?? 50)),
            justification: b.justification ?? "Non spécifié",
          }))
        : this.getDefaultBreakdown(),
    };

    // Normalize findings
    const findings: TechOpsDDFindings = {
      productMaturity: this.normalizeProductMaturity(data.findings?.productMaturity),
      teamCapability: this.normalizeTeamCapability(data.findings?.teamCapability),
      security: this.normalizeSecurity(data.findings?.security),
      ipProtection: this.normalizeIPProtection(data.findings?.ipProtection),
      technicalRisks: Array.isArray(data.findings?.technicalRisks)
        ? data.findings.technicalRisks.map((r, i) => ({
            id: r.id ?? `risk-${i + 1}`,
            risk: r.risk ?? "Non spécifié",
            category: this.validateEnum(r.category, ["team", "security", "ip", "operations"], "operations"),
            severity: this.validateEnum(r.severity, ["CRITICAL", "HIGH", "MEDIUM"], "MEDIUM"),
            probability: this.validateEnum(r.probability, ["HIGH", "MEDIUM", "LOW"], "MEDIUM"),
            impact: r.impact ?? "Non spécifié",
            mitigation: r.mitigation ?? "Non spécifié",
            estimatedCostToMitigate: r.estimatedCostToMitigate ?? "Non estimé",
            timelineToMitigate: r.timelineToMitigate ?? "Non estimé",
          }))
        : [],
      sectorBenchmark: this.normalizeSectorBenchmark(data.findings?.sectorBenchmark),
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
      justification: data.alertSignal?.justification ?? "Analyse équipe/ops incomplète - prudence recommandée",
    };

    // Normalize narrative
    const narrative: AgentNarrative = {
      oneLiner: data.narrative?.oneLiner ?? "Analyse ops en cours - données insuffisantes pour conclusion",
      summary: data.narrative?.summary ?? "L'analyse équipe/maturité/sécurité n'a pas pu être complétée de manière exhaustive.",
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

  private validateEnum<T extends string>(value: unknown, allowed: T[], defaultValue: T): T {
    if (typeof value === "string" && allowed.includes(value as T)) {
      return value as T;
    }
    return defaultValue;
  }

  private getDefaultBreakdown() {
    return [
      { criterion: "Maturité Produit", weight: 33, score: 50, justification: "Données insuffisantes" },
      { criterion: "Équipe Tech", weight: 33, score: 50, justification: "Données insuffisantes" },
      { criterion: "Sécurité", weight: 22, score: 50, justification: "Données insuffisantes" },
      { criterion: "IP Technique", weight: 11, score: 50, justification: "Données insuffisantes" },
    ];
  }

  private getDefaultQuestions(): AgentQuestion[] {
    return [
      {
        priority: "CRITICAL",
        category: "technical",
        question: "Pouvez-vous me décrire votre processus de déploiement et qui le gère au quotidien?",
        context: "Identifier qui opère la production et le niveau de maturité DevOps",
        whatToLookFor: "Si c'est le CTO seul = confirme key person risk. Si 'on déploie manuellement' = immaturité.",
      },
      {
        priority: "CRITICAL",
        category: "technical",
        question: "Que se passerait-il si votre CTO/lead tech devait s'absenter 3 mois? Qui prendrait le relais?",
        context: "Évaluer le key person risk et la documentation",
        whatToLookFor: "Réponse vague, 'tout est dans ma tête', pas de documentation = risque maximal",
      },
      {
        priority: "HIGH",
        category: "technical",
        question: "Quelle est l'expérience moyenne de votre équipe technique (années)?",
        context: "Vérifier la séniorité réelle vs ce qui est présenté",
        whatToLookFor: "Moyenne < 3 ans = équipe junior. Comparer avec ce qui est dit dans le deck.",
      },
      {
        priority: "HIGH",
        category: "technical",
        question: "Comment gérez-vous la sécurité des données utilisateurs? Êtes-vous conformes GDPR?",
        context: "Évaluer la maturité sécurité si non détaillée dans le deck",
        whatToLookFor: "Réponse vague, 'on va le faire' = pas de sécurité en place. Acceptable pre-Seed, problématique Seed+.",
      },
      {
        priority: "HIGH",
        category: "technical",
        question: "Quels sont vos 3 prochains recrutements techniques prioritaires et pourquoi?",
        context: "Comprendre si le fondateur a identifié les gaps de l'équipe",
        whatToLookFor: "Pas de plan = manque de vision. Plan irréaliste vs budget = déconnexion.",
      },
      {
        priority: "MEDIUM",
        category: "technical",
        question: "Avez-vous des brevets déposés ou en cours? Des algorithmes propriétaires?",
        context: "Évaluer la protection IP si non mentionnée dans le deck",
        whatToLookFor: "Confusion entre brevet et trade secret. IP inexistante sur un produit 'innovant' = risque.",
      },
    ];
  }

  private normalizeProductMaturity(data: unknown): ProductMaturityAnalysis {
    const d = (data ?? {}) as Record<string, unknown>;
    const stability = (d.stability ?? {}) as Record<string, unknown>;
    const featureCompleteness = (d.featureCompleteness ?? {}) as Record<string, unknown>;
    const releaseVelocity = (d.releaseVelocity ?? {}) as Record<string, unknown>;

    return {
      stage: this.validateEnum(d.stage, ["concept", "prototype", "mvp", "beta", "production", "scale"], "mvp"),
      stageEvidence: (d.stageEvidence as string) ?? "Non spécifié",
      stability: {
        score: Math.min(100, Math.max(0, (stability.score as number) ?? 50)),
        incidentFrequency: (stability.incidentFrequency as string) ?? "Unknown",
        uptimeEstimate: (stability.uptimeEstimate as string) ?? "Unknown",
        assessment: (stability.assessment as string) ?? "Non évalué",
      },
      featureCompleteness: {
        score: Math.min(100, Math.max(0, (featureCompleteness.score as number) ?? 50)),
        coreFeatures: Array.isArray(featureCompleteness.coreFeatures)
          ? (featureCompleteness.coreFeatures as Array<Record<string, unknown>>).map((f) => ({
              feature: (f.feature as string) ?? "Non spécifié",
              status: this.validateEnum(f.status, ["complete", "partial", "missing"], "partial"),
            }))
          : [],
        roadmapClarity: (featureCompleteness.roadmapClarity as string) ?? "Non évalué",
      },
      releaseVelocity: {
        frequency: (releaseVelocity.frequency as string) ?? "Unknown",
        assessment: (releaseVelocity.assessment as string) ?? "Non évalué",
        concern: releaseVelocity.concern as string | undefined,
      },
    };
  }

  private normalizeTeamCapability(data: unknown): TechTeamCapability {
    const d = (data ?? {}) as Record<string, unknown>;
    const teamSize = (d.teamSize ?? {}) as Record<string, unknown>;
    const seniorityLevel = (d.seniorityLevel ?? {}) as Record<string, unknown>;
    const keyPersonRisk = (d.keyPersonRisk ?? {}) as Record<string, unknown>;

    return {
      teamSize: {
        current: (teamSize.current as number) ?? 0,
        breakdown: Array.isArray(teamSize.breakdown)
          ? (teamSize.breakdown as Array<Record<string, unknown>>).map((b) => ({
              role: (b.role as string) ?? "Unknown",
              count: (b.count as number) ?? 0,
            }))
          : [],
      },
      seniorityLevel: {
        assessment: this.validateEnum(seniorityLevel.assessment, ["JUNIOR", "MID", "SENIOR", "MIXED", "UNKNOWN"], "UNKNOWN"),
        evidence: (seniorityLevel.evidence as string) ?? "Non spécifié",
      },
      gaps: Array.isArray(d.gaps)
        ? (d.gaps as Array<Record<string, unknown>>).map((g) => ({
            gap: (g.gap as string) ?? "Non spécifié",
            severity: this.validateEnum(g.severity, ["CRITICAL", "HIGH", "MEDIUM"], "MEDIUM"),
            impact: (g.impact as string) ?? "Non spécifié",
            recommendation: (g.recommendation as string) ?? "Non spécifié",
          }))
        : [],
      keyPersonRisk: {
        exists: (keyPersonRisk.exists as boolean) ?? false,
        persons: Array.isArray(keyPersonRisk.persons) ? keyPersonRisk.persons as string[] : [],
        mitigation: (keyPersonRisk.mitigation as string) ?? "Non spécifié",
      },
      hiringNeeds: Array.isArray(d.hiringNeeds)
        ? (d.hiringNeeds as Array<Record<string, unknown>>).map((h) => ({
            role: (h.role as string) ?? "Non spécifié",
            priority: this.validateEnum(h.priority, ["IMMEDIATE", "NEXT_6M", "NEXT_12M"], "NEXT_6M"),
            rationale: (h.rationale as string) ?? "Non spécifié",
          }))
        : [],
      overallCapabilityScore: Math.min(100, Math.max(0, (d.overallCapabilityScore as number) ?? 50)),
    };
  }

  private normalizeSecurity(data: unknown): SecurityAnalysis {
    const d = (data ?? {}) as Record<string, unknown>;
    const compliance = (d.compliance ?? {}) as Record<string, unknown>;

    return {
      posture: this.validateEnum(d.posture, ["POOR", "BASIC", "GOOD", "EXCELLENT", "UNKNOWN"], "UNKNOWN"),
      compliance: {
        gdpr: this.validateEnum(compliance.gdpr, ["COMPLIANT", "PARTIAL", "NON_COMPLIANT", "NOT_APPLICABLE", "UNKNOWN"], "UNKNOWN"),
        soc2: this.validateEnum(compliance.soc2, ["CERTIFIED", "IN_PROGRESS", "NOT_STARTED", "NOT_APPLICABLE", "UNKNOWN"], "UNKNOWN"),
        other: Array.isArray(compliance.other) ? compliance.other as string[] : [],
      },
      practices: Array.isArray(d.practices)
        ? (d.practices as Array<Record<string, unknown>>).map((p) => ({
            practice: (p.practice as string) ?? "Non spécifié",
            status: this.validateEnum(p.status, ["YES", "NO", "PARTIAL", "UNKNOWN"], "UNKNOWN"),
          }))
        : [],
      vulnerabilities: Array.isArray(d.vulnerabilities)
        ? (d.vulnerabilities as Array<Record<string, unknown>>).map((v) => ({
            area: (v.area as string) ?? "Non spécifié",
            severity: this.validateEnum(v.severity, ["CRITICAL", "HIGH", "MEDIUM"], "MEDIUM"),
            description: (v.description as string) ?? "Non spécifié",
          }))
        : [],
      assessment: (d.assessment as string) ?? "Non évalué - informations insuffisantes",
      securityScore: Math.min(100, Math.max(0, (d.securityScore as number) ?? 50)),
    };
  }

  private normalizeIPProtection(data: unknown): TechIPAnalysis {
    const d = (data ?? {}) as Record<string, unknown>;
    const patents = (d.patents ?? {}) as Record<string, unknown>;
    const tradeSecrets = (d.tradeSecrets ?? {}) as Record<string, unknown>;
    const openSourceRisk = (d.openSourceRisk ?? {}) as Record<string, unknown>;
    const proprietaryTech = (d.proprietaryTech ?? {}) as Record<string, unknown>;

    return {
      patents: {
        granted: (patents.granted as number) ?? 0,
        pending: (patents.pending as number) ?? 0,
        domains: Array.isArray(patents.domains) ? patents.domains as string[] : [],
        strategicValue: (patents.strategicValue as string) ?? "Non évalué",
      },
      tradeSecrets: {
        exists: (tradeSecrets.exists as boolean) ?? false,
        protected: (tradeSecrets.protected as boolean) ?? false,
        description: (tradeSecrets.description as string) ?? "Non spécifié",
      },
      openSourceRisk: {
        level: this.validateEnum(openSourceRisk.level, ["NONE", "LOW", "MEDIUM", "HIGH"], "LOW"),
        licenses: Array.isArray(openSourceRisk.licenses) ? openSourceRisk.licenses as string[] : [],
        concerns: Array.isArray(openSourceRisk.concerns) ? openSourceRisk.concerns as string[] : [],
      },
      proprietaryTech: {
        exists: (proprietaryTech.exists as boolean) ?? false,
        description: (proprietaryTech.description as string) ?? "Non spécifié",
        defensibility: (proprietaryTech.defensibility as string) ?? "Non évalué",
      },
      ipScore: Math.min(100, Math.max(0, (d.ipScore as number) ?? 50)),
    };
  }

  private normalizeSectorBenchmark(data: unknown): TechOpsDDFindings["sectorBenchmark"] {
    const d = (data ?? {}) as Record<string, unknown>;
    const teamSize = (d.teamSize ?? {}) as Record<string, unknown>;
    const maturity = (d.maturity ?? {}) as Record<string, unknown>;
    const security = (d.security ?? {}) as Record<string, unknown>;

    return {
      teamSize: {
        thisCompany: (teamSize.thisCompany as number) ?? 0,
        sectorP25: (teamSize.sectorP25 as number) ?? 2,
        sectorMedian: (teamSize.sectorMedian as number) ?? 4,
        sectorP75: (teamSize.sectorP75 as number) ?? 7,
        percentile: (teamSize.percentile as string) ?? "Unknown",
        source: (teamSize.source as string) ?? "Context Engine",
      },
      maturity: {
        thisCompany: (maturity.thisCompany as string) ?? "unknown",
        sectorTypical: (maturity.sectorTypical as string) ?? "mvp-beta",
        assessment: (maturity.assessment as string) ?? "Non évalué",
      },
      security: {
        thisCompany: (security.thisCompany as string) ?? "UNKNOWN",
        sectorExpected: (security.sectorExpected as string) ?? "BASIC",
        assessment: (security.assessment as string) ?? "Non évalué",
      },
      maturityVsSector: (d.maturityVsSector as string) ?? "Non disponible",
      teamSizeVsSector: (d.teamSizeVsSector as string) ?? "Non disponible",
      securityVsSector: (d.securityVsSector as string) ?? "Non disponible",
      overallPosition: this.validateEnum(d.overallPosition, ["ABOVE_AVERAGE", "AVERAGE", "BELOW_AVERAGE"], "AVERAGE"),
    };
  }
}

// Type for LLM response (loose typing for parsing)
interface LLMTechOpsDDResponse {
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
    productMaturity?: unknown;
    teamCapability?: unknown;
    security?: unknown;
    ipProtection?: unknown;
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
      maturityVsSector?: string;
      teamSizeVsSector?: string;
      securityVsSector?: string;
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

export const techOpsDD = new TechOpsDDAgent();
