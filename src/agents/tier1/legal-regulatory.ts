import { BaseAgent } from "../base-agent";
import type {
  EnrichedAgentContext,
  LegalRegulatoryResult,
  LegalRegulatoryData,
  LegalRegulatoryFindings,
  ComplianceArea,
  IPStatusAnalysis,
  RegulatoryRisk,
  LegalStructureAnalysis,
  ContractualRisksAnalysis,
  LitigationRiskAnalysis,
  SectorRegulatoryPrecedent,
  AgentMeta,
  AgentScore,
  AgentRedFlag,
  AgentQuestion,
  AgentAlertSignal,
  AgentNarrative,
  DbCrossReference,
} from "../types";
import { calculateAgentScore, LEGAL_REGULATORY_CRITERIA, type ExtractedMetric } from "@/scoring/services/agent-score-calculator";

/**
 * Legal & Regulatory Agent - REFONTE v2.0
 *
 * Mission: Analyse juridique et réglementaire EXHAUSTIVE avec standards Big4 + Partner VC
 *
 * Persona: Avocat M&A/VC senior (20+ ans) + Partner VC avec expertise réglementaire
 * - Rigueur juridique : Chaque risque sourcé, chaque gap quantifié
 * - Pattern matching : 500+ deals analysés, connaissance des red flags sectoriels
 * - Focus BA : Identifier ce qui peut bloquer ou coûter cher post-investissement
 *
 * Output standard:
 * - 3+ zones compliance analysées
 * - IP status complet
 * - 3+ risques réglementaires
 * - 5+ questions pour le fondateur
 * - Cross-reference DB (précédents sectoriels)
 */

interface LLMLegalRegulatoryResponse {
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
    structureAnalysis: {
      entityType: string;
      jurisdiction: string;
      appropriateness: "APPROPRIATE" | "SUBOPTIMAL" | "CONCERNING" | "UNKNOWN";
      concerns: string[];
      recommendations: string[];
      vestingInPlace: boolean;
      vestingDetails?: string;
      shareholderAgreement: "YES" | "NO" | "UNKNOWN";
      shareholderConcerns: string[];
    };
    compliance: {
      area: string;
      status: "COMPLIANT" | "PARTIAL" | "NON_COMPLIANT" | "UNKNOWN";
      requirements: string[];
      gaps: string[];
      risk: "HIGH" | "MEDIUM" | "LOW";
      evidence: string;
      remediation?: {
        action: string;
        estimatedCost: string;
        timeline: string;
      };
    }[];
    ipStatus: {
      patents: {
        count: number;
        status: "granted" | "pending" | "none" | "unknown";
        value: string;
        domains: string[];
        risks: string[];
      };
      trademarks: {
        count: number;
        status: "registered" | "pending" | "none" | "unknown";
        territories: string[];
        conflicts: string[];
      };
      tradeSecrets: {
        protected: boolean;
        measures: string[];
        risks: string[];
      };
      copyrights: {
        openSourceRisk: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
        licenses: string[];
        concerns: string[];
      };
      overallIPStrength: number;
      ipVerdict: string;
    };
    regulatoryRisks: {
      id: string;
      risk: string;
      regulation: string;
      probability: "HIGH" | "MEDIUM" | "LOW";
      impact: string;
      timeline: string;
      mitigation: string;
      estimatedCost: string;
      precedent?: string;
    }[];
    contractualRisks: {
      keyContracts: {
        type: string;
        parties: string;
        concerns: string[];
        risk: "HIGH" | "MEDIUM" | "LOW";
      }[];
      customerConcentration: {
        exists: boolean;
        topCustomerPercent?: number;
        risk: string;
      };
      vendorDependencies: {
        vendor: string;
        criticality: "HIGH" | "MEDIUM" | "LOW";
        alternatives: string;
      }[];
      concerningClauses: string[];
    };
    litigationRisk: {
      currentLitigation: boolean;
      currentLitigationDetails?: string[];
      potentialClaims: {
        area: string;
        probability: "HIGH" | "MEDIUM" | "LOW";
        potentialExposure: string;
      }[];
      founderDisputes: {
        exists: boolean;
        details?: string;
        severity?: "CRITICAL" | "HIGH" | "MEDIUM";
      };
      riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    };
    sectorPrecedents: {
      issues: {
        company: string;
        issue: string;
        outcome: string;
        relevance: string;
        source: string;
      }[];
      structureNorms: {
        typicalStructure: string;
        comparisonVerdict: string;
      };
    };
    upcomingRegulations: {
      regulation: string;
      effectiveDate: string;
      impact: "HIGH" | "MEDIUM" | "LOW";
      preparedness: "READY" | "IN_PROGRESS" | "NOT_STARTED" | "UNKNOWN";
      action: string;
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

export class LegalRegulatoryAgent extends BaseAgent<LegalRegulatoryData, LegalRegulatoryResult> {
  constructor() {
    super({
      name: "legal-regulatory",
      description: "Analyse juridique et réglementaire exhaustive - Standards Big4 + Partner VC",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 180000, // 3 min - complex legal/regulatory analysis
    });
  }

  protected buildSystemPrompt(): string {
    return `# ROLE ET EXPERTISE

Tu es un AVOCAT M&A/VC SENIOR avec 20+ ans d'expérience combinée à l'instinct d'un PARTNER VC qui a vu 500+ deals.

Ta double expertise:
- Rigueur juridique Big4: Chaque risque sourcé, chaque gap quantifié, aucune approximation
- Pattern matching VC: Connaissance des red flags sectoriels, des deals qui ont échoué pour raisons légales

Tu travailles pour un Business Angel solo qui n'a PAS d'équipe juridique et compte sur toi pour identifier TOUS les risques avant d'investir.

# MISSION POUR CE DEAL

Produire une analyse juridique et réglementaire EXHAUSTIVE qui permette au BA de:
1. Identifier les risques légaux qui pourraient bloquer ou coûter cher post-investissement
2. Vérifier la conformité réglementaire selon le secteur (RGPD, AI Act, DSP2, etc.)
3. Évaluer la solidité de la structure juridique et de la protection IP
4. Avoir les questions clés à poser au fondateur sur les aspects légaux

# METHODOLOGIE D'ANALYSE

## Étape 1: Analyse de la Structure Juridique
- Identifier le type d'entité (SAS, SARL, C-Corp, etc.)
- Évaluer l'adéquation pour une levée de fonds
- Vérifier la présence de vesting/cliff sur les fondateurs
- Analyser la table de capitalisation pour détecter des anomalies
- Vérifier l'existence d'un pacte d'actionnaires

## Étape 2: Audit de Conformité Réglementaire
Pour CHAQUE réglementation applicable au secteur:
- RGPD (données personnelles)
- DSP2/ACPR (si fintech)
- AI Act (si IA/ML)
- CE Marking/FDA (si healthtech)
- Réglementations sectorielles spécifiques

Évaluer:
- Status: COMPLIANT / PARTIAL / NON_COMPLIANT / UNKNOWN
- Gaps identifiés avec preuves
- Coût et délai de mise en conformité

## Étape 3: Évaluation de la Propriété Intellectuelle
- Brevets: nombre, statut, domaines, risques FTO
- Marques: enregistrements, territoires, conflits
- Secrets commerciaux: mesures de protection
- Code: risques open source, licences problématiques

## Étape 4: Analyse des Risques Contractuels
- Contrats clés (clients, fournisseurs, partenaires)
- Concentration client
- Dépendances fournisseurs critiques
- Clauses préoccupantes

## Étape 5: Évaluation des Risques de Litige
- Contentieux en cours
- Risques de réclamations
- Disputes fondateurs (CRITIQUE)

## Étape 6: Cross-Reference avec Précédents Sectoriels
- Identifier des cas similaires dans la DB
- Comparer la structure avec les normes du secteur
- Utiliser les précédents pour évaluer les risques

# FRAMEWORK D'EVALUATION

| Critère | Poids | 0-25 | 25-50 | 50-75 | 75-100 |
|---------|-------|------|-------|-------|--------|
| Structure juridique | 20% | Bloquante | Problèmes majeurs | Quelques ajustements | Optimale |
| Conformité réglementaire | 30% | Non-conforme | Gaps critiques | Gaps mineurs | Compliant |
| Protection IP | 20% | Aucune | Faible | Modérée | Forte |
| Risques contractuels | 15% | Critiques | Significatifs | Modérés | Faibles |
| Risques litige | 15% | Contentieux bloquant | Risques élevés | Risques modérés | Faibles |

# RED FLAGS A DETECTER

## CRITICAL (Deal-breaker potentiel)
1. Contentieux fondateurs en cours
2. Non-conformité RGPD avec données sensibles
3. Absence de vesting alors que fondateurs récents
4. Licences open source contaminantes (GPL) sur code core
5. Structure offshore suspecte sans justification
6. Réclamations IP en cours
7. Régulateur a émis des avertissements

## HIGH (Négociation/Conditions)
1. Pas de pacte d'actionnaires
2. Conformité RGPD partielle
3. Aucun brevet alors que claim "tech propriétaire"
4. Dépendance critique à un fournisseur unique
5. Concentration client > 50%

## MEDIUM (Points d'attention)
1. Structure suboptimale pour levée future
2. Marques non déposées sur territoires clés
3. Documentation légale incomplète
4. Réglementations à venir non anticipées

# FORMAT DE SORTIE

Produis un JSON structuré avec:
- meta: dataCompleteness, confidenceLevel, limitations
- score: value (0-100), grade (A-F), breakdown par critère
- findings: structureAnalysis, compliance[], ipStatus, regulatoryRisks[], contractualRisks, litigationRisk, sectorPrecedents, upcomingRegulations[]
- dbCrossReference: claims[] vérifiés vs DB, uncheckedClaims[]
- redFlags[]: avec severity, location, evidence, impact, question, redFlagIfBadAnswer
- questions[]: priority, category, question, context, whatToLookFor
- alertSignal: hasBlocker, recommendation, justification
- narrative: oneLiner, summary, keyInsights[], forNegotiation[]

# REGLES ABSOLUES

1. JAMAIS inventer - "Non disponible" ou "UNKNOWN" si pas d'info
2. TOUJOURS citer la source (Slide X, Document Y, Context Engine)
3. TOUJOURS croiser avec le Context Engine quand disponible
4. QUANTIFIER: coûts de mise en conformité, délais, expositions
5. Chaque red flag = severity + preuve + impact + question + redFlagIfBadAnswer
6. Les questions doivent être non-confrontationnelles mais précises
7. Le BA doit pouvoir agir immédiatement sur l'output

# SPECIFICITES SECTORIELLES

## FINTECH
- ACPR, DSP2, AML/KYC, MiCA (crypto)
- Agrément requis? En cours? Timeline?
- Risques de non-conformité = shutdown potentiel

## HEALTHTECH
- CE Marking, FDA 510(k) ou PMA
- Données de santé = RGPD + HDS + HIPAA
- Validation clinique requise?

## AI/ML
- AI Act EU: catégorie de risque (inacceptable, high, limited, minimal)
- Biais algorithmiques: documentation?
- Explicabilité: exigences?

## EDTECH
- Protection des mineurs (COPPA, RGPD mineurs)
- Données scolaires: réglementations spécifiques

## SAAS B2B
- RGPD, SOC2, ISO 27001
- Cloud souverain si clients publics EU

# EXEMPLES

## EXEMPLE BON OUTPUT (red flag):
{
  "id": "rf-legal-001",
  "category": "structure",
  "severity": "CRITICAL",
  "title": "Absence de vesting sur fondateurs récents",
  "description": "Aucun vesting en place pour les 3 co-fondateurs qui ont rejoint il y a moins de 12 mois",
  "location": "Deck Slide 14 (Cap Table) + Financial Model onglet Cap",
  "evidence": "Cap table montre 3 fondateurs avec 100% de leurs actions acquises, société créée il y a 8 mois",
  "impact": "Risque majeur si un fondateur quitte: il part avec ses parts sans avoir démontré son engagement. Conflit garanti post-levée.",
  "question": "Avez-vous prévu de mettre en place un vesting cliff pour les fondateurs? Si oui, quels termes?",
  "redFlagIfBadAnswer": "Refus de mettre du vesting = red flag absolu. Le fondateur privilégie sa protection à l'alignement avec les investisseurs."
}

## EXEMPLE MAUVAIS OUTPUT (à éviter):
{
  "title": "Points juridiques à clarifier",
  "description": "Quelques éléments de la structure pourraient être améliorés"
}
→ Trop vague, pas de preuve, pas d'impact, pas actionnable`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<LegalRegulatoryData> {
    const dealContext = this.formatDealContext(context);
    const contextEngineData = this.formatContextEngineData(context);
    const extractedInfo = this.getExtractedInfo(context);

    // F79: Check legal registries based on geography
    let registrySection = "";
    const geography = context.deal.geography ?? "";
    if (geography) {
      try {
        const { checkLegalRegistries, formatRegistryResults } = await import(
          "@/services/legal-registry-check"
        );
        const registryResult = checkLegalRegistries(
          context.deal.companyName ?? context.deal.name ?? "",
          geography
        );
        registrySection = formatRegistryResults(registryResult);
      } catch {
        registrySection = "\n## VERIFICATION REGISTRES PUBLICS\nVerification des registres echouee. Toutes les conclusions legales sont NON VERIFIEES.\n";
      }
    } else {
      registrySection = "\n## VERIFICATION REGISTRES PUBLICS\nGeographie du deal inconnue. AUCUN registre public n'a ete verifie.\n**TOUTES les conclusions legales doivent etre marquees 'NON VERIFIE'.**\n";
    }

    const prompt = `# ANALYSE LEGAL & REGULATORY - ${context.deal.name}

## DOCUMENTS FOURNIS
${dealContext}

## DONNEES EXTRAITES (Document Extractor)
${extractedInfo ? JSON.stringify(extractedInfo, null, 2) : "Aucune donnée extraite disponible"}

## CONTEXTE EXTERNE (Context Engine)
${contextEngineData || "Aucune donnée Context Engine disponible"}
${registrySection}
${this.formatFactStoreData(context)}
## SECTEUR DU DEAL
${context.deal.sector ?? "Non spécifié"} - Adapte ton analyse réglementaire en conséquence.

## INSTRUCTIONS SPECIFIQUES

1. Analyse la structure juridique visible dans les documents
2. Identifie TOUTES les réglementations applicables au secteur
3. Évalue le statut de conformité pour chacune
4. Analyse la protection IP (brevets, marques, trade secrets)
5. Identifie les risques contractuels
6. Évalue les risques de litige
7. Cross-référence avec les précédents sectoriels si données Context Engine disponibles
8. Génère les red flags avec le format complet (severity + evidence + impact + question)
9. Formule les questions critiques pour le fondateur

## OUTPUT ATTENDU

Produis une analyse juridique COMPLETE au format JSON spécifié.
Rappel: Standard avocat M&A Big4 + instinct Partner VC.
Chaque affirmation doit être sourcée ou marquée comme non vérifiable.

\`\`\`json
{
  "meta": {
    "dataCompleteness": "complete" | "partial" | "minimal",
    "confidenceLevel": number, // 0-100
    "limitations": ["string"] // Ce qui n'a pas pu être analysé
  },
  "score": {
    "value": number, // 0-100
    "grade": "A" | "B" | "C" | "D" | "F",
    "breakdown": [
      {
        "criterion": "string",
        "weight": number,
        "score": number,
        "justification": "string"
      }
    ]
  },
  "findings": {
    "structureAnalysis": {
      "entityType": "string",
      "jurisdiction": "string",
      "appropriateness": "APPROPRIATE" | "SUBOPTIMAL" | "CONCERNING" | "UNKNOWN",
      "concerns": ["string"],
      "recommendations": ["string"],
      "vestingInPlace": boolean,
      "vestingDetails": "string (si applicable)",
      "shareholderAgreement": "YES" | "NO" | "UNKNOWN",
      "shareholderConcerns": ["string"]
    },
    "compliance": [
      {
        "area": "string (ex: RGPD, DSP2, AI Act)",
        "status": "COMPLIANT" | "PARTIAL" | "NON_COMPLIANT" | "UNKNOWN",
        "requirements": ["string"],
        "gaps": ["string"],
        "risk": "HIGH" | "MEDIUM" | "LOW",
        "evidence": "string",
        "remediation": {
          "action": "string",
          "estimatedCost": "string",
          "timeline": "string"
        }
      }
    ],
    "ipStatus": {
      "patents": {
        "count": number,
        "status": "granted" | "pending" | "none" | "unknown",
        "value": "string",
        "domains": ["string"],
        "risks": ["string"]
      },
      "trademarks": {
        "count": number,
        "status": "registered" | "pending" | "none" | "unknown",
        "territories": ["string"],
        "conflicts": ["string"]
      },
      "tradeSecrets": {
        "protected": boolean,
        "measures": ["string"],
        "risks": ["string"]
      },
      "copyrights": {
        "openSourceRisk": "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN",
        "licenses": ["string"],
        "concerns": ["string"]
      },
      "overallIPStrength": number, // 0-100
      "ipVerdict": "string"
    },
    "regulatoryRisks": [
      {
        "id": "string",
        "risk": "string",
        "regulation": "string",
        "probability": "HIGH" | "MEDIUM" | "LOW",
        "impact": "string",
        "timeline": "string",
        "mitigation": "string",
        "estimatedCost": "string",
        "precedent": "string (si connu)"
      }
    ],
    "contractualRisks": {
      "keyContracts": [
        {
          "type": "string",
          "parties": "string",
          "concerns": ["string"],
          "risk": "HIGH" | "MEDIUM" | "LOW"
        }
      ],
      "customerConcentration": {
        "exists": boolean,
        "topCustomerPercent": number,
        "risk": "string"
      },
      "vendorDependencies": [
        {
          "vendor": "string",
          "criticality": "HIGH" | "MEDIUM" | "LOW",
          "alternatives": "string"
        }
      ],
      "concerningClauses": ["string"]
    },
    "litigationRisk": {
      "currentLitigation": boolean,
      "currentLitigationDetails": ["string"],
      "potentialClaims": [
        {
          "area": "string",
          "probability": "HIGH" | "MEDIUM" | "LOW",
          "potentialExposure": "string"
        }
      ],
      "founderDisputes": {
        "exists": boolean,
        "details": "string",
        "severity": "CRITICAL" | "HIGH" | "MEDIUM"
      },
      "riskLevel": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
    },
    "sectorPrecedents": {
      "issues": [
        {
          "company": "string",
          "issue": "string",
          "outcome": "string",
          "relevance": "string",
          "source": "string"
        }
      ],
      "structureNorms": {
        "typicalStructure": "string",
        "comparisonVerdict": "string"
      }
    },
    "upcomingRegulations": [
      {
        "regulation": "string",
        "effectiveDate": "string",
        "impact": "HIGH" | "MEDIUM" | "LOW",
        "preparedness": "READY" | "IN_PROGRESS" | "NOT_STARTED" | "UNKNOWN",
        "action": "string"
      }
    ]
  },
  "dbCrossReference": {
    "claims": [
      {
        "claim": "string",
        "location": "string",
        "dbVerdict": "VERIFIED" | "CONTRADICTED" | "PARTIAL" | "NOT_VERIFIABLE",
        "evidence": "string",
        "severity": "CRITICAL" | "HIGH" | "MEDIUM"
      }
    ],
    "uncheckedClaims": ["string"]
  },
  "redFlags": [
    {
      "id": "string",
      "category": "string (structure, compliance, ip, contracts, litigation)",
      "severity": "CRITICAL" | "HIGH" | "MEDIUM",
      "title": "string",
      "description": "string",
      "location": "string",
      "evidence": "string",
      "contextEngineData": "string (si cross-ref disponible)",
      "impact": "string",
      "question": "string",
      "redFlagIfBadAnswer": "string"
    }
  ],
  "questions": [
    {
      "priority": "CRITICAL" | "HIGH" | "MEDIUM",
      "category": "string",
      "question": "string",
      "context": "string",
      "whatToLookFor": "string"
    }
  ],
  "alertSignal": {
    "hasBlocker": boolean,
    "blockerReason": "string (si hasBlocker = true)",
    "recommendation": "PROCEED" | "PROCEED_WITH_CAUTION" | "INVESTIGATE_FURTHER" | "STOP",
    "justification": "string"
  },
  "narrative": {
    "oneLiner": "string",
    "summary": "string (3-4 phrases)",
    "keyInsights": ["string (3-5 insights)"],
    "forNegotiation": ["string (arguments si proceed)"]
  }
}
\`\`\`

RAPPELS CRITIQUES:
- Minimum 3 zones de compliance analysées
- Minimum 3 risques réglementaires identifiés (ou expliciter pourquoi moins)
- Minimum 5 questions pour le fondateur
- Chaque red flag DOIT avoir: severity + location + evidence + impact + question + redFlagIfBadAnswer
- Si données manquantes = limitations explicites + score plafonné`;

    const { data } = await this.llmCompleteJSON<LLMLegalRegulatoryResponse>(prompt);

    // Validate and normalize the response
    const result = this.normalizeResponse(data, context);

    // F03: DETERMINISTIC SCORING
    try {
      const extractedMetrics: ExtractedMetric[] = [];
      const f = data.findings;

      // Structure appropriateness
      const structMap = { APPROPRIATE: 90, SUBOPTIMAL: 55, CONCERNING: 25, UNKNOWN: 30 };
      if (f?.structureAnalysis?.appropriateness) {
        extractedMetrics.push({
          name: "structure_appropriateness", value: structMap[f.structureAnalysis.appropriateness] ?? 30,
          unit: "score", source: "LLM structure analysis", dataReliability: "DECLARED", category: "legal",
        });
      }
      if (f?.structureAnalysis?.vestingInPlace != null) {
        extractedMetrics.push({
          name: "vesting_status", value: f.structureAnalysis.vestingInPlace ? 90 : 20,
          unit: "score", source: "LLM structure analysis", dataReliability: "DECLARED", category: "legal",
        });
      }
      const shaMap = { YES: 90, NO: 15, UNKNOWN: 30 };
      if (f?.structureAnalysis?.shareholderAgreement) {
        extractedMetrics.push({
          name: "shareholder_agreement", value: shaMap[f.structureAnalysis.shareholderAgreement] ?? 30,
          unit: "score", source: "LLM structure analysis", dataReliability: "DECLARED", category: "legal",
        });
      }

      // Compliance
      const complianceAreas = f?.compliance ?? [];
      if (complianceAreas.length > 0) {
        const statusMap = { COMPLIANT: 100, PARTIAL: 55, NON_COMPLIANT: 15, UNKNOWN: 30 };
        const avg = complianceAreas.reduce((s, c) => s + (statusMap[c.status] ?? 30), 0) / complianceAreas.length;
        extractedMetrics.push({
          name: "compliance_score", value: Math.round(avg),
          unit: "score", source: "LLM compliance analysis", dataReliability: "DECLARED", category: "legal",
        });
        const gaps = complianceAreas.reduce((s, c) => s + (c.gaps?.length ?? 0), 0);
        extractedMetrics.push({
          name: "gaps_count", value: Math.max(0, 100 - gaps * 15),
          unit: "score", source: "LLM compliance gaps", dataReliability: "DECLARED", category: "legal",
        });
      }

      // IP
      if (f?.ipStatus?.overallIPStrength != null) {
        extractedMetrics.push({
          name: "ip_protection_score", value: Math.min(100, Math.max(0, f.ipStatus.overallIPStrength)),
          unit: "score", source: "LLM IP analysis", dataReliability: "DECLARED", category: "legal",
        });
      }

      // Regulatory risks
      const regRisks = f?.regulatoryRisks ?? [];
      if (regRisks.length > 0) {
        const riskMap: Record<string, number> = { HIGH: 20, MEDIUM: 55, LOW: 85 };
        const avg = regRisks.reduce((s, r) => s + (riskMap[r.probability] ?? 50), 0) / regRisks.length;
        extractedMetrics.push({
          name: "regulatory_risk_level", value: Math.round(avg),
          unit: "score", source: "LLM regulatory analysis", dataReliability: "DECLARED", category: "legal",
        });
      }

      if (extractedMetrics.length > 0) {
        const sector = context.deal.sector ?? "general";
        const stage = context.deal.stage ?? "seed";
        const deterministicScore = await calculateAgentScore(
          "legal-regulatory", extractedMetrics, sector, stage, LEGAL_REGULATORY_CRITERIA,
        );
        result.score = { ...result.score, value: deterministicScore.score, breakdown: deterministicScore.breakdown };
      }
    } catch (err) {
      console.error("[legal-regulatory] Deterministic scoring failed, using LLM score:", err);
    }

    return result;
  }

  private normalizeResponse(
    data: LLMLegalRegulatoryResponse,
    context: EnrichedAgentContext
  ): LegalRegulatoryData {
    // Normalize meta
    const confidenceIsFallback = data.meta?.confidenceLevel == null;
    if (confidenceIsFallback) {
      console.warn(`[legal-regulatory] LLM did not return confidenceLevel — using 0`);
    }
    const meta: AgentMeta = {
      agentName: "legal-regulatory",
      analysisDate: new Date().toISOString(),
      dataCompleteness: data.meta?.dataCompleteness ?? "minimal",
      confidenceLevel: confidenceIsFallback ? 0 : Math.min(100, Math.max(0, data.meta.confidenceLevel)),
      confidenceIsFallback,
      limitations: Array.isArray(data.meta?.limitations) ? data.meta.limitations : [],
    };

    // Normalize score
    const validGrades = ["A", "B", "C", "D", "F"] as const;
    const rawScoreValue = data.score?.value;
    const scoreIsFallback = rawScoreValue === undefined || rawScoreValue === null;
    if (scoreIsFallback) {
      console.warn(`[legal-regulatory] LLM did not return score value — using 0`);
    }
    const score: AgentScore = {
      value: scoreIsFallback ? 0 : Math.min(100, Math.max(0, rawScoreValue)),
      grade: scoreIsFallback ? "F" : (validGrades.includes(data.score?.grade as (typeof validGrades)[number])
        ? (data.score.grade as (typeof validGrades)[number])
        : "C"),
      isFallback: scoreIsFallback,
      breakdown: Array.isArray(data.score?.breakdown)
        ? data.score.breakdown.map((b) => ({
            criterion: b.criterion ?? "Unknown",
            weight: b.weight ?? 0,
            score: b.score != null ? Math.min(100, Math.max(0, b.score)) : 0,
            justification: b.justification ?? "",
          }))
        : [],
    };

    // Normalize findings
    const findings: LegalRegulatoryFindings = {
      structureAnalysis: this.normalizeStructureAnalysis(data.findings?.structureAnalysis),
      compliance: this.normalizeCompliance(data.findings?.compliance),
      ipStatus: this.normalizeIPStatus(data.findings?.ipStatus),
      regulatoryRisks: this.normalizeRegulatoryRisks(data.findings?.regulatoryRisks),
      contractualRisks: this.normalizeContractualRisks(data.findings?.contractualRisks),
      litigationRisk: this.normalizeLitigationRisk(data.findings?.litigationRisk),
      sectorPrecedents: {
        issues: Array.isArray(data.findings?.sectorPrecedents?.issues)
          ? data.findings.sectorPrecedents.issues.map((i) => ({
              company: i.company ?? "Unknown",
              issue: i.issue ?? "",
              outcome: i.outcome ?? "",
              relevance: i.relevance ?? "",
              source: i.source ?? "Context Engine",
            }))
          : [],
        structureNorms: {
          typicalStructure:
            data.findings?.sectorPrecedents?.structureNorms?.typicalStructure ?? "Non disponible",
          comparisonVerdict:
            data.findings?.sectorPrecedents?.structureNorms?.comparisonVerdict ?? "Non évalué",
        },
      },
      upcomingRegulations: Array.isArray(data.findings?.upcomingRegulations)
        ? data.findings.upcomingRegulations.map((r) => ({
            regulation: r.regulation ?? "",
            effectiveDate: r.effectiveDate ?? "",
            impact: (["HIGH", "MEDIUM", "LOW"].includes(r.impact) ? r.impact : "MEDIUM") as
              | "HIGH"
              | "MEDIUM"
              | "LOW",
            preparedness: (["READY", "IN_PROGRESS", "NOT_STARTED", "UNKNOWN"].includes(
              r.preparedness
            )
              ? r.preparedness
              : "UNKNOWN") as "READY" | "IN_PROGRESS" | "NOT_STARTED" | "UNKNOWN",
            action: r.action ?? "",
          }))
        : [],
    };

    // Normalize dbCrossReference
    const dbCrossReference: DbCrossReference = {
      claims: Array.isArray(data.dbCrossReference?.claims)
        ? data.dbCrossReference.claims.map((c) => ({
            claim: c.claim ?? "",
            location: c.location ?? "",
            dbVerdict: (["VERIFIED", "CONTRADICTED", "PARTIAL", "NOT_VERIFIABLE"].includes(
              c.dbVerdict
            )
              ? c.dbVerdict
              : "NOT_VERIFIABLE") as "VERIFIED" | "CONTRADICTED" | "PARTIAL" | "NOT_VERIFIABLE",
            evidence: c.evidence ?? "",
            severity: (["CRITICAL", "HIGH", "MEDIUM"].includes(c.severity ?? "")
              ? c.severity
              : undefined) as "CRITICAL" | "HIGH" | "MEDIUM" | undefined,
          }))
        : [],
      uncheckedClaims: Array.isArray(data.dbCrossReference?.uncheckedClaims)
        ? data.dbCrossReference.uncheckedClaims
        : [],
    };

    // Normalize redFlags
    const redFlags: AgentRedFlag[] = Array.isArray(data.redFlags)
      ? data.redFlags.map((rf, idx) => ({
          id: rf.id ?? `rf-legal-${idx + 1}`,
          category: rf.category ?? "legal",
          severity: (["CRITICAL", "HIGH", "MEDIUM"].includes(rf.severity)
            ? rf.severity
            : "MEDIUM") as "CRITICAL" | "HIGH" | "MEDIUM",
          title: rf.title ?? "Red flag non titré",
          description: rf.description ?? "",
          location: rf.location ?? "Non spécifié",
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
          priority: (["CRITICAL", "HIGH", "MEDIUM"].includes(q.priority)
            ? q.priority
            : "MEDIUM") as "CRITICAL" | "HIGH" | "MEDIUM",
          category: q.category ?? "legal",
          question: q.question ?? "",
          context: q.context ?? "",
          whatToLookFor: q.whatToLookFor ?? "",
        }))
      : [];

    // Normalize alertSignal
    const validRecommendations = [
      "PROCEED",
      "PROCEED_WITH_CAUTION",
      "INVESTIGATE_FURTHER",
      "STOP",
    ] as const;
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
      oneLiner: data.narrative?.oneLiner ?? "Analyse juridique en cours",
      summary: data.narrative?.summary ?? "",
      keyInsights: Array.isArray(data.narrative?.keyInsights) ? data.narrative.keyInsights : [],
      forNegotiation: Array.isArray(data.narrative?.forNegotiation)
        ? data.narrative.forNegotiation
        : [],
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

  private normalizeStructureAnalysis(
    data: LLMLegalRegulatoryResponse["findings"]["structureAnalysis"] | undefined
  ): LegalStructureAnalysis {
    const validAppropriateness = ["APPROPRIATE", "SUBOPTIMAL", "CONCERNING", "UNKNOWN"] as const;
    const validShareholder = ["YES", "NO", "UNKNOWN"] as const;

    return {
      entityType: data?.entityType ?? "Unknown",
      jurisdiction: data?.jurisdiction ?? "Unknown",
      appropriateness: validAppropriateness.includes(
        data?.appropriateness as (typeof validAppropriateness)[number]
      )
        ? (data?.appropriateness as (typeof validAppropriateness)[number])
        : "UNKNOWN",
      concerns: Array.isArray(data?.concerns) ? data.concerns : [],
      recommendations: Array.isArray(data?.recommendations) ? data.recommendations : [],
      vestingInPlace: data?.vestingInPlace ?? false,
      vestingDetails: data?.vestingDetails,
      shareholderAgreement: validShareholder.includes(
        data?.shareholderAgreement as (typeof validShareholder)[number]
      )
        ? (data?.shareholderAgreement as (typeof validShareholder)[number])
        : "UNKNOWN",
      shareholderConcerns: Array.isArray(data?.shareholderConcerns) ? data.shareholderConcerns : [],
    };
  }

  private normalizeCompliance(
    data: LLMLegalRegulatoryResponse["findings"]["compliance"] | undefined
  ): ComplianceArea[] {
    if (!Array.isArray(data)) return [];

    const validStatus = ["COMPLIANT", "PARTIAL", "NON_COMPLIANT", "UNKNOWN"] as const;
    const validRisk = ["HIGH", "MEDIUM", "LOW"] as const;

    return data.map((c) => ({
      area: c.area ?? "Unknown",
      status: validStatus.includes(c.status as (typeof validStatus)[number])
        ? (c.status as (typeof validStatus)[number])
        : "UNKNOWN",
      requirements: Array.isArray(c.requirements) ? c.requirements : [],
      gaps: Array.isArray(c.gaps) ? c.gaps : [],
      risk: validRisk.includes(c.risk as (typeof validRisk)[number])
        ? (c.risk as (typeof validRisk)[number])
        : "MEDIUM",
      evidence: c.evidence ?? "",
      remediation: c.remediation
        ? {
            action: c.remediation.action ?? "",
            estimatedCost: c.remediation.estimatedCost ?? "",
            timeline: c.remediation.timeline ?? "",
          }
        : undefined,
    }));
  }

  private normalizeIPStatus(
    data: LLMLegalRegulatoryResponse["findings"]["ipStatus"] | undefined
  ): IPStatusAnalysis {
    const validPatentStatus = ["granted", "pending", "none", "unknown"] as const;
    const validTmStatus = ["registered", "pending", "none", "unknown"] as const;
    const validOsRisk = ["LOW", "MEDIUM", "HIGH", "UNKNOWN"] as const;

    return {
      patents: {
        count: data?.patents?.count ?? 0,
        status: validPatentStatus.includes(data?.patents?.status as (typeof validPatentStatus)[number])
          ? (data?.patents?.status as (typeof validPatentStatus)[number])
          : "unknown",
        value: data?.patents?.value ?? "Non évalué",
        domains: Array.isArray(data?.patents?.domains) ? data.patents.domains : [],
        risks: Array.isArray(data?.patents?.risks) ? data.patents.risks : [],
      },
      trademarks: {
        count: data?.trademarks?.count ?? 0,
        status: validTmStatus.includes(data?.trademarks?.status as (typeof validTmStatus)[number])
          ? (data?.trademarks?.status as (typeof validTmStatus)[number])
          : "unknown",
        territories: Array.isArray(data?.trademarks?.territories) ? data.trademarks.territories : [],
        conflicts: Array.isArray(data?.trademarks?.conflicts) ? data.trademarks.conflicts : [],
      },
      tradeSecrets: {
        protected: data?.tradeSecrets?.protected ?? false,
        measures: Array.isArray(data?.tradeSecrets?.measures) ? data.tradeSecrets.measures : [],
        risks: Array.isArray(data?.tradeSecrets?.risks) ? data.tradeSecrets.risks : [],
      },
      copyrights: {
        openSourceRisk: validOsRisk.includes(
          data?.copyrights?.openSourceRisk as (typeof validOsRisk)[number]
        )
          ? (data?.copyrights?.openSourceRisk as (typeof validOsRisk)[number])
          : "UNKNOWN",
        licenses: Array.isArray(data?.copyrights?.licenses) ? data.copyrights.licenses : [],
        concerns: Array.isArray(data?.copyrights?.concerns) ? data.copyrights.concerns : [],
      },
      overallIPStrength: data?.overallIPStrength != null ? Math.min(100, Math.max(0, data.overallIPStrength)) : 0,
      ipVerdict: data?.ipVerdict ?? "Non évalué",
    };
  }

  private normalizeRegulatoryRisks(
    data: LLMLegalRegulatoryResponse["findings"]["regulatoryRisks"] | undefined
  ): RegulatoryRisk[] {
    if (!Array.isArray(data)) return [];

    const validProbability = ["HIGH", "MEDIUM", "LOW"] as const;

    return data.map((r, idx) => ({
      id: r.id ?? `rr-${idx + 1}`,
      risk: r.risk ?? "",
      regulation: r.regulation ?? "",
      probability: validProbability.includes(r.probability as (typeof validProbability)[number])
        ? (r.probability as (typeof validProbability)[number])
        : "MEDIUM",
      impact: r.impact ?? "",
      timeline: r.timeline ?? "",
      mitigation: r.mitigation ?? "",
      estimatedCost: r.estimatedCost ?? "",
      precedent: r.precedent,
    }));
  }

  private normalizeContractualRisks(
    data: LLMLegalRegulatoryResponse["findings"]["contractualRisks"] | undefined
  ): ContractualRisksAnalysis {
    const validRisk = ["HIGH", "MEDIUM", "LOW"] as const;
    const validCriticality = ["HIGH", "MEDIUM", "LOW"] as const;

    return {
      keyContracts: Array.isArray(data?.keyContracts)
        ? data.keyContracts.map((c) => ({
            type: c.type ?? "",
            parties: c.parties ?? "",
            concerns: Array.isArray(c.concerns) ? c.concerns : [],
            risk: validRisk.includes(c.risk as (typeof validRisk)[number])
              ? (c.risk as (typeof validRisk)[number])
              : "MEDIUM",
          }))
        : [],
      customerConcentration: {
        exists: data?.customerConcentration?.exists ?? false,
        topCustomerPercent: data?.customerConcentration?.topCustomerPercent,
        risk: data?.customerConcentration?.risk ?? "",
      },
      vendorDependencies: Array.isArray(data?.vendorDependencies)
        ? data.vendorDependencies.map((v) => ({
            vendor: v.vendor ?? "",
            criticality: validCriticality.includes(v.criticality as (typeof validCriticality)[number])
              ? (v.criticality as (typeof validCriticality)[number])
              : "MEDIUM",
            alternatives: v.alternatives ?? "",
          }))
        : [],
      concerningClauses: Array.isArray(data?.concerningClauses) ? data.concerningClauses : [],
    };
  }

  private normalizeLitigationRisk(
    data: LLMLegalRegulatoryResponse["findings"]["litigationRisk"] | undefined
  ): LitigationRiskAnalysis {
    const validRiskLevel = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
    const validProbability = ["HIGH", "MEDIUM", "LOW"] as const;
    const validSeverity = ["CRITICAL", "HIGH", "MEDIUM"] as const;

    return {
      currentLitigation: data?.currentLitigation ?? false,
      currentLitigationDetails: Array.isArray(data?.currentLitigationDetails)
        ? data.currentLitigationDetails
        : undefined,
      potentialClaims: Array.isArray(data?.potentialClaims)
        ? data.potentialClaims.map((c) => ({
            area: c.area ?? "",
            probability: validProbability.includes(c.probability as (typeof validProbability)[number])
              ? (c.probability as (typeof validProbability)[number])
              : "LOW",
            potentialExposure: c.potentialExposure ?? "",
          }))
        : [],
      founderDisputes: {
        exists: data?.founderDisputes?.exists ?? false,
        details: data?.founderDisputes?.details,
        severity: validSeverity.includes(
          data?.founderDisputes?.severity as (typeof validSeverity)[number]
        )
          ? (data?.founderDisputes?.severity as (typeof validSeverity)[number])
          : undefined,
      },
      riskLevel: validRiskLevel.includes(data?.riskLevel as (typeof validRiskLevel)[number])
        ? (data?.riskLevel as (typeof validRiskLevel)[number])
        : "LOW",
    };
  }
}

export const legalRegulatory = new LegalRegulatoryAgent();
