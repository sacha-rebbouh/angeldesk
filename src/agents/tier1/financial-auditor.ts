import { BaseAgent } from "../base-agent";
import type {
  EnrichedAgentContext,
  FinancialAuditResult,
  FinancialAuditData,
  AgentMeta,
  AgentScore,
  AgentRedFlag,
  AgentQuestion,
  AgentAlertSignal,
  AgentNarrative,
  FinancialAuditFindings,
  DbCrossReference,
} from "../types";
import { benchmarkService } from "@/scoring";
import { getBenchmarkFull } from "@/services/benchmarks";
import { checkBenchmarkFreshness, formatFreshnessWarning } from "@/services/benchmarks/freshness-checker";
import { verifyFinancialMetrics, extractRawInputsFromMetrics, type FinancialVerificationReport } from "../orchestration/utils/financial-verification";
import { calculateAgentScore, normalizeMetricName, FINANCIAL_AUDITOR_CRITERIA, type ExtractedMetric } from "@/scoring/services/agent-score-calculator";
import { z } from "zod";
import { FinancialAuditResponseSchema } from "./schemas/financial-auditor-schema";

/**
 * Financial Auditor Agent - REFONTE v2.0
 *
 * Mission: Produire un audit financier EXHAUSTIF standard Big4 + Partner VC
 * Persona: Analyste financier senior avec 20+ ans d'expérience en VC/PE
 * Standard: Chaque affirmation sourcée, calculs montrés, cross-reference DB obligatoire
 *
 * Inputs:
 * - Documents: Pitch deck, Financial model (Excel)
 * - Context Engine: Deal Intelligence, Market Data, Benchmarks
 * - Dependencies: document-extractor
 *
 * Outputs:
 * - Score: 0-100 avec breakdown par critère
 * - Findings: metrics, projections, valuation, unitEconomics, burn
 * - Red Flags: avec 5 composants obligatoires
 * - Questions: priorité + contexte + whatToLookFor
 */

// ============================================================================
// SCORING FRAMEWORK
// ============================================================================

const SCORING_CRITERIA = {
  dataTransparency: { weight: 25, description: "Qualité et complétude des données financières" },
  metricsHealth: { weight: 25, description: "Santé des métriques clés vs benchmarks" },
  valuationRationality: { weight: 20, description: "Rationalité de la valorisation demandée" },
  unitEconomicsViability: { weight: 15, description: "Viabilité des unit economics" },
  burnEfficiency: { weight: 15, description: "Efficacité du burn et runway" },
} as const;

// ============================================================================
// NOTE: Benchmarks are now centralized in @/services/benchmarks
// See: src/services/benchmarks/config.ts for all default values
// ============================================================================

// ============================================================================
// LLM RESPONSE INTERFACE
// ============================================================================

interface LLMFinancialAuditResponse {
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
    metrics: {
      metric: string;
      status: "available" | "missing" | "suspicious";
      reportedValue?: number;
      calculatedValue?: number;
      calculation?: string;
      benchmarkP25?: number;
      benchmarkMedian?: number;
      benchmarkP75?: number;
      percentile?: number;
      source: string;
      assessment: string;
      dataReliability?: "AUDITED" | "VERIFIED" | "DECLARED" | "PROJECTED" | "ESTIMATED" | "UNVERIFIABLE";
    }[];
    projections: {
      realistic: boolean;
      assumptions: string[];
      concerns: string[];
    };
    valuation: {
      requested?: number;
      impliedMultiple?: number;
      benchmarkMultiple: number;
      percentile?: number;
      verdict: "UNDERVALUED" | "FAIR" | "AGGRESSIVE" | "VERY_AGGRESSIVE" | "CANNOT_ASSESS";
      comparables: { name: string; multiple: number; stage: string; source: string }[];
    };
    unitEconomics: {
      ltv?: { value: number; calculation: string };
      cac?: { value: number; calculation: string };
      ltvCacRatio?: number;
      paybackMonths?: number;
      assessment: string;
    };
    burn: {
      monthlyBurn?: number;
      runway?: number;
      burnMultiple?: number;
      efficiency: "EFFICIENT" | "MODERATE" | "INEFFICIENT" | "UNKNOWN";
      assessment: string;
    };
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

export class FinancialAuditorAgent extends BaseAgent<FinancialAuditData, FinancialAuditResult> {
  constructor() {
    super({
      name: "financial-auditor",
      description: "Audit financier exhaustif standard Big4 + Partner VC",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 120000,
      dependencies: ["document-extractor"],
    });
  }

  protected buildSystemPrompt(): string {
    return `# ROLE ET EXPERTISE

Tu es un analyste financier senior avec 20+ ans d'expérience en Venture Capital et Private Equity.
Tu as audité 500+ deals et vu les patterns de succès et d'échec.
Tu combines la rigueur méthodologique d'un cabinet Big4 avec l'instinct d'un Partner VC expérimenté.

# MISSION POUR CE DEAL

Produire un audit financier EXHAUSTIF pour un Business Angel.
Objectif: Permettre au BA de savoir si les finances du deal sont solides ou si des red flags existent.
Le BA doit pouvoir prendre une décision et avoir des arguments de négociation.

# METHODOLOGIE D'ANALYSE

## Etape 0: CLASSIFICATION DE FIABILITE (AVANT TOUTE ANALYSE)

AVANT d'analyser les chiffres, tu DOIS classifier la fiabilite de CHAQUE donnee financiere:

| Niveau | Description | Comment l'utiliser dans l'audit |
|--------|-------------|--------------------------------|
| AUDITED | Certifie par audit/releve bancaire | Base fiable pour l'analyse |
| VERIFIED | Recoupe par 2+ sources | Bonne base d'analyse |
| DECLARED | Annonce dans le deck, non verifie | Mentionner "le fondateur declare X" — PAS "X est de" |
| PROJECTED | Projection/BP/forecast | CRITIQUE: ecrire "le BP projette X". Penaliser le score si metriques cles sont projetees |
| ESTIMATED | Calcule par l'IA | Mentionner le calcul et la marge d'erreur |
| UNVERIFIABLE | Impossible a verifier | Ne PAS baser d'analyse dessus |

DETECTION TEMPORELLE AUTOMATIQUE:
1. Identifier la DATE DU DOCUMENT (metadata, mention dans le doc, date d'upload)
2. Pour chaque chiffre annuel/trimestriel: la fin de periode est-elle APRES la date du document?
3. Si OUI → c'est une PROJECTION, meme si le fondateur le presente comme un fait

EXEMPLE: Un BP date d'aout 2025 qui annonce "CA 2025: 570K€"
→ Le CA 2025 couvre jan-dec, mais le doc date d'aout
→ 4 mois sur 12 (33%) sont des projections
→ Ce n'est PAS un CA realise de 570K€, c'est au mieux ~380K€ de realise + ~190K€ de projection
→ Red flag + question obligatoire au fondateur

IMPACT SUR LE SCORING:
- Si l'ARR/Revenue est PROJECTED → penalite de -15 points sur "Data Transparency"
- Si la valorisation est basee sur des projections → penalite de -20 points sur "Valuation Rationality"
- Si les unit economics sont PROJECTED → penalite de -10 points sur "Unit Economics Viability"

Pour chaque metrique dans "metrics", ajouter le champ "dataReliability":
"AUDITED" | "VERIFIED" | "DECLARED" | "PROJECTED" | "ESTIMATED" | "UNVERIFIABLE"

## Etape 1: Extraction des données financières
- Parcourir TOUS les documents fournis (pitch deck, financial model Excel)
- Pour CHAQUE métrique: extraire le chiffre exact avec sa source ("Slide X", "Onglet Y")
- Pour CHAQUE métrique: classifier la fiabilite (AUDITED/VERIFIED/DECLARED/PROJECTED/ESTIMATED/UNVERIFIABLE)
- Si un chiffre est calculable mais non fourni, CALCULER et montrer le calcul (reliability: ESTIMATED)
- Si vraiment absent, marquer "missing" avec impact sur l'analyse

## Etape 2: Benchmark vs marché
- Comparer chaque métrique aux benchmarks fournis (P25, Median, P75)
- ATTENTION: ne benchmarker que les donnees AUDITED/VERIFIED/DECLARED. Les PROJECTED ne peuvent PAS etre benchmarkees comme des faits.
- Calculer le percentile exact du deal
- Identifier les écarts significatifs (>20% de la médiane)

## Etape 3: Analyse de valorisation
- Calculer le multiple implicite (valorisation / ARR ou revenue)
- Comparer aux comparables du secteur/stage
- Verdict: UNDERVALUED, FAIR, AGGRESSIVE, VERY_AGGRESSIVE

## Etape 4: Vérification des projections
- Identifier les hypothèses de croissance
- Calculer si mathématiquement possible (clients nécessaires, pipeline, équipe)
- Détecter les hockey sticks non justifiés

## Etape 5: Cross-reference avec Context Engine
- Croiser chaque claim financier du deck avec les données DB
- Identifier les contradictions ou exagérations
- Générer un dbCrossReference complet

## Etape 6: Synthèse et recommandation
- Score global avec breakdown par critère
- Red flags avec les 5 composants obligatoires
- Questions prioritaires pour le fondateur
- Signal d'alerte (PROCEED, CAUTION, INVESTIGATE, STOP)

# FRAMEWORK D'EVALUATION

| Critère | Poids | Score 0-25 | Score 25-50 | Score 50-75 | Score 75-100 |
|---------|-------|------------|-------------|-------------|--------------|
| Data Transparency | 25% | Données manquantes critiques | Partial, gaps majeurs | Correct avec quelques manques | Complet et transparent |
| Metrics Health | 25% | <P25 sur majorité | P25-P50 | P50-P75 | >P75 ou top quartile |
| Valuation Rationality | 20% | >P90 (très agressif) | P75-P90 (agressif) | P50-P75 (fair) | <P50 (attractif) |
| Unit Economics Viability | 15% | LTV/CAC <1 | LTV/CAC 1-2 | LTV/CAC 2-3 | LTV/CAC >3 |
| Burn Efficiency | 15% | Burn multiple >3 | Burn multiple 2-3 | Burn multiple 1-2 | Burn multiple <1 |

PENALITES:
- dataCompleteness "minimal" → score max 50
- dataCompleteness "partial" → score max 70
- Red flag CRITICAL non résolvable → score max 40

# RED FLAGS A DETECTER

1. PROJECTIONS IRREALISTES - Sévérité: CRITICAL
   - Croissance >200% YoY sans justification
   - Hockey stick sans pipeline ou équipe
   - Chiffres ronds suspects (100K, 1M exact)

2. VALORISATION DECONNECTEE - Sévérité: CRITICAL
   - Multiple >P90 du marché
   - Écart >50% vs comparables récents
   - Absence de justification

3. UNIT ECONOMICS NON VIABLES - Sévérité: HIGH
   - LTV/CAC <1
   - CAC payback >24 mois
   - Gross margin <50% pour SaaS

4. BURN INEFFICIENT - Sévérité: HIGH
   - Burn multiple >3
   - Runway <6 mois sans plan
   - Burn croissant sans revenue growth

5. DONNEES MANQUANTES CRITIQUES - Sévérité: MEDIUM à HIGH
   - Pas de revenue/ARR pour un Seed
   - Pas de churn pour un SaaS
   - Pas de CAC pour un deal growth

6. INCONSISTENCES - Sévérité: HIGH
   - Écarts entre deck et financial model
   - Chiffres qui ne matchent pas
   - Croissance non réconciliable

# FORMAT DE SORTIE

Produis un JSON avec cette structure exacte. Chaque champ est OBLIGATOIRE.

# REGLES ABSOLUES

1. JAMAIS inventer de données - "Non disponible" si absent
2. TOUJOURS citer la source (Slide X, Onglet Y, Context Engine)
3. TOUJOURS cross-référencer avec le Context Engine quand disponible
4. QUANTIFIER chaque fois que possible (%, €, ratio)
5. Chaque red flag = id + severity + location + evidence + impact + question + redFlagIfBadAnswer
6. Le BA doit pouvoir agir immédiatement sur chaque output
7. MONTRER les calculs, pas juste les résultats

# EXEMPLES

## Exemple de BON output (métrique avec fiabilité):
{
  "metric": "ARR",
  "status": "available",
  "reportedValue": 624000,
  "calculatedValue": 624000,
  "calculation": "MRR 52K€ (Slide 8) x 12 = 624K€",
  "benchmarkMedian": 500000,
  "percentile": 65,
  "source": "Slide 8 + calcul",
  "assessment": "ARR de 624K€ au-dessus de la médiane Seed (500K€). P65, correct pour le stage.",
  "dataReliability": "ESTIMATED"
}

## Exemple de BON output (projection détectée):
{
  "metric": "Revenue annuel",
  "status": "suspicious",
  "reportedValue": 570000,
  "calculation": "Le BP date d'aout 2025 annonce 570K€ de CA 2025. 4 mois sur 12 sont dans le futur = 33% de projection.",
  "source": "BP page 5",
  "assessment": "ATTENTION: Ce chiffre inclut des projections. Le CA réalisé à date du document est probablement ~380K€ (8 mois). Les 190K€ restants sont projetés. Impossible de benchmarker ce chiffre comme un fait.",
  "dataReliability": "PROJECTED"
}

## Exemple de MAUVAIS output (à éviter):
{
  "metric": "ARR",
  "status": "available",
  "reportedValue": 600000,
  "assessment": "ARR correct"
}
→ Pas de source, pas de calcul, pas de benchmark, pas de percentile, pas de dataReliability, assessment vague.

## Exemple de BON red flag:
{
  "id": "RF-001",
  "category": "projections",
  "severity": "CRITICAL",
  "title": "Projection ARR mathématiquement impossible",
  "description": "Le deck projette une croissance de 400% YoY sans équipe sales ni pipeline justifiant ce volume",
  "location": "Slide 12, Financial Model onglet Projections",
  "evidence": "ARR 2024: 624K€ → ARR 2025: 2.5M€ = +300% YoY. Équipe actuelle: 1 sales.",
  "contextEngineData": "Benchmark Seed SaaS B2B: croissance médiane 120% YoY (source: OpenView 2024)",
  "impact": "Si l'investisseur base son ROI sur ces projections, il sera déçu de 60%+",
  "question": "Comment comptez-vous atteindre 2.5M€ d'ARR avec une équipe de 1 sales?",
  "redFlagIfBadAnswer": "Fondateur déconnecté de la réalité opérationnelle - deal breaker potentiel"
}

## Exemple de MAUVAIS red flag (à éviter):
{
  "flag": "Projections optimistes",
  "severity": "medium",
  "evidence": "Les projections semblent élevées"
}
→ Pas d'id, pas de location, pas de chiffres, pas de question, pas d'impact.`;
  }

  protected async execute(context: EnrichedAgentContext): Promise<FinancialAuditData> {
    this._dealStage = context.deal.stage;
    const dealContext = this.formatDealContext(context);
    const contextEngineData = this.formatContextEngineData(context);
    const extractedInfo = this.getExtractedInfo(context);

    let extractedSection = "";
    if (extractedInfo) {
      extractedSection = `\n## Données Extraites du Pitch Deck (Document Extractor)\n${JSON.stringify(extractedInfo, null, 2)}`;
    }

    // Get raw financial model content (Excel with multiple sheets)
    const financialModelContent = this.getFinancialModelContent(context);
    let financialModelSection = "";
    if (financialModelContent) {
      financialModelSection = `\n## FINANCIAL MODEL EXCEL (ANALYSE CHAQUE ONGLET)\n${financialModelContent}`;
    }

    const deal = context.deal;
    const sector = deal.sector || "SaaS B2B";
    const stage = deal.stage || "SEED";

    // Fetch benchmarks
    const benchmarks = await this.fetchBenchmarks(sector, stage);

    // =====================================================
    // F07: VERIFICATION INDEPENDANTE VIA REGISTRES OFFICIELS
    // =====================================================
    const companyName = (deal as Record<string, unknown>).companyName as string || deal.name;
    let registryVerification = "";
    const registryRedFlags: AgentRedFlag[] = [];

    try {
      const { enrichFrenchCompany } = await import(
        "@/services/context-engine/connectors/pappers"
      );
      const pappersData = await enrichFrenchCompany(companyName);

      if (pappersData?.found && pappersData.finances?.length) {
        const latestFinance = [...pappersData.finances]
          .sort((a, b) => b.year - a.year)[0];

        registryVerification = `\n## DONNEES REGISTRE OFFICIEL (Pappers.fr - Source: Greffe du Tribunal)
**SIREN**: ${pappersData.siren}
**Statut**: ${pappersData.status}
**Date creation**: ${pappersData.dateCreation}
**Effectif**: ${pappersData.effectif ?? "Non disponible"}
**Capital social**: ${pappersData.capitalSocial ? pappersData.capitalSocial + "EUR" : "Non disponible"}

### Dernieres donnees financieres (${latestFinance.year})
- **CA officiel**: ${latestFinance.revenue ? latestFinance.revenue + "EUR" : "Non depose"}
- **Resultat**: ${latestFinance.result ? latestFinance.result + "EUR" : "Non depose"}
- **Effectif**: ${latestFinance.employees ?? "Non disponible"}

**IMPORTANT**: Compare OBLIGATOIREMENT les chiffres du deck aux chiffres officiels ci-dessus.
Si ecart CA > 20%, genere un red flag CRITICAL.
Si les comptes n'ont pas ete deposes, genere un red flag HIGH "comptes non deposes".
`;

        // Automatic registry red flags
        if (pappersData.redFlags && pappersData.redFlags.length > 0) {
          for (const rf of pappersData.redFlags) {
            registryRedFlags.push({
              id: `RF-REGISTRY-${registryRedFlags.length + 1}`,
              category: "verification",
              severity: rf.includes("cessée") || rf.includes("collective") ? "CRITICAL" : "HIGH",
              title: `Registre officiel: ${rf}`,
              description: `Pappers.fr signale: ${rf}`,
              location: "Registre du commerce (Pappers.fr)",
              evidence: `Source: Pappers.fr SIREN ${pappersData.siren}`,
              impact: "Information officielle non mentionnee dans le deck",
              question: "Pouvez-vous expliquer ce point ?",
              redFlagIfBadAnswer: "",
            });
          }
        }

        // Cross-reference dirigeants
        if (pappersData.dirigeants && pappersData.dirigeants.length > 0) {
          registryVerification += `\n### Dirigeants officiels (Registre)
${pappersData.dirigeants.map(d => `- ${d.name} (${d.role}, depuis ${d.since || "N/A"})`).join("\n")}

**CROSS-REFERENCE OBLIGATOIRE**: Compare avec les fondateurs du deck. Signale si un fondateur
du deck N'EST PAS dirigeant officiel (possible red flag structurel).
`;
        }
      } else if (pappersData && !pappersData.found) {
        // Fallback: Societe.com
        try {
          const { validateFinancials } = await import(
            "@/services/context-engine/connectors/societe-com"
          );
          const claimedRevenue = extractedInfo?.revenue as number | undefined;
          const validation = await validateFinancials(companyName, claimedRevenue);

          if (validation && (validation as Record<string, unknown>).validated === false) {
            const discrepancies = (validation as Record<string, unknown>).discrepancies as string[] | undefined;
            if (discrepancies?.length) {
              registryVerification = `\n## VERIFICATION SOCIETE.COM
${discrepancies.map((d: string) => `- ${d}`).join("\n")}
`;
            }
          }
        } catch {
          // Societe.com fallback also failed, continue without
        }
      }
    } catch (error) {
      registryVerification = "\n## VERIFICATION REGISTRE\nVerification impossible (erreur technique). Fiabilite des donnees financieres NON confirmee.";
    }

    // Build user prompt
    const prompt = `# ANALYSE FINANCIAL AUDITOR - ${deal.companyName || deal.name}

## DOCUMENTS FOURNIS
${dealContext}
${extractedSection}
${financialModelSection}
${registryVerification}

## CONTEXTE EXTERNE (Context Engine)
${contextEngineData || "Aucune donnée Context Engine disponible pour ce deal."}
${this.formatFactStoreData(context)}

## BENCHMARKS ${sector} - ${stage}
${JSON.stringify(benchmarks, null, 2)}

## INSTRUCTIONS SPECIFIQUES

1. EXTRAIS tous les chiffres financiers des documents avec leurs sources exactes
2. CALCULE les métriques manquantes si possible (ex: ARR = MRR x 12)
3. COMPARE chaque métrique aux benchmarks fournis avec percentile
4. VERIFIE les projections: sont-elles mathématiquement réalisables?
5. CROSS-REFERENCE chaque claim financier du deck avec le Context Engine
6. GENERE des red flags COMPLETS (5 composants obligatoires)
7. FORMULE des questions ACTIONNABLES pour le fondateur

## OUTPUT ATTENDU

Produis une analyse financière complète au format JSON.
Standard: Big4 + instinct Partner VC.
Chaque affirmation doit être sourcée ou marquée comme non vérifiable.
MONTRE tes calculs.

\`\`\`json
{
  "meta": {
    "dataCompleteness": "complete|partial|minimal",
    "confidenceLevel": 0-100,
    "limitations": ["Ce qui n'a pas pu être analysé"]
  },
  "score": {
    "value": 0-100,
    "breakdown": [
      {
        "criterion": "Data Transparency",
        "weight": 25,
        "score": 0-100,
        "justification": "Pourquoi ce score"
      },
      {
        "criterion": "Metrics Health",
        "weight": 25,
        "score": 0-100,
        "justification": "Pourquoi ce score"
      },
      {
        "criterion": "Valuation Rationality",
        "weight": 20,
        "score": 0-100,
        "justification": "Pourquoi ce score"
      },
      {
        "criterion": "Unit Economics Viability",
        "weight": 15,
        "score": 0-100,
        "justification": "Pourquoi ce score"
      },
      {
        "criterion": "Burn Efficiency",
        "weight": 15,
        "score": 0-100,
        "justification": "Pourquoi ce score"
      }
    ]
  },
  "findings": {
    "metrics": [
      {
        "metric": "Nom de la métrique",
        "status": "available|missing|suspicious",
        "reportedValue": number,
        "calculatedValue": number,
        "calculation": "Montrer le calcul",
        "benchmarkP25": number,
        "benchmarkMedian": number,
        "benchmarkP75": number,
        "percentile": number,
        "source": "Slide X, Onglet Y",
        "assessment": "Analyse détaillée",
        "dataReliability": "AUDITED|VERIFIED|DECLARED|PROJECTED|ESTIMATED|UNVERIFIABLE — classification de la fiabilite de cette donnee"
      }
    ],
    "projections": {
      "realistic": true|false,
      "assumptions": ["Hypothèses identifiées"],
      "concerns": ["Problèmes détectés"]
    },
    "valuation": {
      "requested": number,
      "impliedMultiple": number,
      "benchmarkMultiple": number,
      "percentile": number,
      "verdict": "UNDERVALUED|FAIR|AGGRESSIVE|VERY_AGGRESSIVE|CANNOT_ASSESS",
      "comparables": [{"name": "", "multiple": 0, "stage": "", "source": ""}]
    },
    "unitEconomics": {
      "ltv": {"value": number, "calculation": ""},
      "cac": {"value": number, "calculation": ""},
      "ltvCacRatio": number,
      "paybackMonths": number,
      "assessment": ""
    },
    "burn": {
      "monthlyBurn": number,
      "runway": number,
      "burnMultiple": number,
      "efficiency": "EFFICIENT|MODERATE|INEFFICIENT|UNKNOWN",
      "assessment": ""
    }
  },
  "dbCrossReference": {
    "claims": [
      {
        "claim": "Texte exact du deck",
        "location": "Slide X",
        "dbVerdict": "VERIFIED|CONTRADICTED|PARTIAL|NOT_VERIFIABLE",
        "evidence": "Donnée qui confirme/infirme",
        "severity": "CRITICAL|HIGH|MEDIUM"
      }
    ],
    "uncheckedClaims": ["Claims non vérifiables"]
  },
  "redFlags": [
    {
      "id": "RF-001",
      "category": "projections|metrics|valuation|unit_economics|burn|missing_data|inconsistency",
      "severity": "CRITICAL|HIGH|MEDIUM",
      "title": "Titre court",
      "description": "Description complète",
      "location": "Slide X, Onglet Y",
      "evidence": "Citation exacte ou donnée chiffrée",
      "contextEngineData": "Cross-reference si disponible",
      "impact": "Impact pour le BA",
      "question": "Question à poser au fondateur",
      "redFlagIfBadAnswer": "Ce que ça révèle si mauvaise réponse"
    }
  ],
  "questions": [
    {
      "priority": "CRITICAL|HIGH|MEDIUM",
      "category": "financials|projections|valuation|unit_economics|burn",
      "question": "Question précise",
      "context": "Pourquoi on pose cette question",
      "whatToLookFor": "Ce qui révèlerait un problème"
    }
  ],
  "alertSignal": {
    "hasBlocker": true|false,
    "blockerReason": "Si hasBlocker, pourquoi",
    "recommendation": "PROCEED|PROCEED_WITH_CAUTION|INVESTIGATE_FURTHER|STOP",
    "justification": "Pourquoi cette recommandation"
  },
  "narrative": {
    "oneLiner": "Résumé en 1 phrase pour le BA",
    "summary": "3-4 phrases de synthèse",
    "keyInsights": ["3-5 insights majeurs"],
    "forNegotiation": ["Arguments de négociation si on proceed"]
  }
}
\`\`\``;

    const { data, validationErrors } = await this.llmCompleteJSONValidated<LLMFinancialAuditResponse>(
      prompt,
      FinancialAuditResponseSchema as unknown as z.ZodSchema<LLMFinancialAuditResponse>,
    );
    if (validationErrors?.length) {
      console.warn(`[financial-auditor] Zod validation: ${validationErrors.length} issues — using best-effort data`);
    }

    // SERVER-SIDE VERIFICATION: Recalculate financial metrics and flag discrepancies
    let verificationReport: FinancialVerificationReport | null = null;
    try {
      const llmMetrics = data.findings?.metrics ?? [];
      const rawInputs = extractRawInputsFromMetrics(llmMetrics);
      verificationReport = verifyFinancialMetrics(llmMetrics, rawInputs, sector, stage);
    } catch (err) {
      console.error("[financial-auditor] Server-side verification failed:", err);
    }

    // F03: DETERMINISTIC SCORING - Extract metrics from LLM, score in code
    try {
      const extractedMetrics: ExtractedMetric[] = [];
      for (const m of data.findings?.metrics ?? []) {
        if (m.reportedValue != null || m.calculatedValue != null) {
          extractedMetrics.push({
            name: normalizeMetricName(m.metric),
            value: m.calculatedValue ?? m.reportedValue ?? null,
            unit: this.detectUnit(m.metric),
            source: m.source ?? "Non specifie",
            dataReliability: m.dataReliability ?? "DECLARED",
            category: "financial",
            calculation: m.calculation,
          });
        }
      }

      if (extractedMetrics.length > 0) {
        const deterministicScore = await calculateAgentScore(
          "financial-auditor",
          extractedMetrics,
          sector,
          stage,
          FINANCIAL_AUDITOR_CRITERIA,
        );

        // Override LLM score with deterministic score
        data.score = {
          value: deterministicScore.score,
          breakdown: deterministicScore.breakdown,
        };
      }
    } catch (err) {
      console.error("[financial-auditor] Deterministic scoring failed, using LLM score:", err);
    }

    // Validate and normalize response
    const result = this.normalizeResponse(data, sector, stage);

    // F07: Inject registry red flags
    if (registryRedFlags.length > 0) {
      result.redFlags = [...registryRedFlags, ...result.redFlags];
    }

    // F04: Inject verification discrepancies as red flags
    if (verificationReport) {
      for (const disc of verificationReport.discrepancies) {
        if (disc.severity !== "OK" && disc.redFlag) {
          result.redFlags.push({
            id: `RF-CALC-${disc.metric.replace(/\s+/g, "-").toUpperCase()}`,
            category: "inconsistency",
            severity: disc.severity === "CRITICAL" ? "CRITICAL" : "HIGH",
            title: disc.redFlag.title,
            description: disc.redFlag.description,
            location: "Financial calculations (server-side verification)",
            evidence: `LLM: ${disc.llmValue} vs Serveur: ${disc.serverValue} (ecart ${disc.deviation.toFixed(1)}%). Calcul serveur: ${disc.serverCalculation}`,
            impact: disc.redFlag.impact,
            question: "Pouvez-vous confirmer le calcul exact de cette metrique ?",
            redFlagIfBadAnswer: "Chiffres financiers non reconciliables - fiabilite des donnees en question.",
          });
        }
      }

      // Add verification reliability to limitations
      if (verificationReport.overallReliability === "LOW") {
        result.meta.limitations.push(
          `Verification serveur: fiabilite FAIBLE. ${verificationReport.discrepancies.length} ecart(s) detecte(s) entre les calculs LLM et les recalculs serveur.`
        );
      }
    }

    // F56: Apply hard reliability penalties that the LLM might not consistently enforce
    this.applyReliabilityPenalties(result, context);

    return result;
  }

  private normalizeResponse(
    data: LLMFinancialAuditResponse,
    sector: string,
    stage: string
  ): FinancialAuditData {
    // Check for truncation (F54)
    this.checkTruncation(data as unknown as Record<string, unknown>);

    // Normalize meta
    const validCompleteness = ["complete", "partial", "minimal"] as const;
    const dataCompleteness = validCompleteness.includes(data.meta?.dataCompleteness as typeof validCompleteness[number])
      ? data.meta.dataCompleteness
      : "minimal";

    const limitations = Array.isArray(data.meta?.limitations) ? [...data.meta.limitations] : [];
    if (this.benchmarkFreshnessWarning) {
      limitations.push(this.benchmarkFreshnessWarning);
    }

    const confidenceIsFallback = data.meta?.confidenceLevel == null;
    if (confidenceIsFallback) {
      console.warn(`[financial-auditor] LLM did not return confidenceLevel — using 0`);
    }

    const meta: AgentMeta = {
      agentName: "financial-auditor",
      analysisDate: new Date().toISOString(),
      dataCompleteness,
      confidenceLevel: confidenceIsFallback ? 0 : Math.min(100, Math.max(0, data.meta.confidenceLevel)),
      confidenceIsFallback,
      limitations,
    };

    // Calculate grade from score
    const rawScoreValue = data.score?.value;
    const scoreIsFallback = rawScoreValue === undefined || rawScoreValue === null;
    if (scoreIsFallback) {
      console.warn(`[financial-auditor] LLM did not return score value — using 0`);
    }
    const scoreValue = scoreIsFallback ? 0 : Math.min(100, Math.max(0, rawScoreValue));
    const getGrade = (score: number): "A" | "B" | "C" | "D" | "F" => {
      if (score >= 80) return "A";
      if (score >= 65) return "B";
      if (score >= 50) return "C";
      if (score >= 35) return "D";
      return "F";
    };

    // Apply penalties based on data completeness
    let cappedScore = scoreValue;
    if (dataCompleteness === "minimal") {
      cappedScore = Math.min(cappedScore, 50);
    } else if (dataCompleteness === "partial") {
      cappedScore = Math.min(cappedScore, 70);
    }

    // Check for critical blockers
    const hasCriticalBlocker = data.redFlags?.some(rf => rf.severity === "CRITICAL") ?? false;
    if (hasCriticalBlocker) {
      cappedScore = Math.min(cappedScore, 40);
    }

    const score: AgentScore = {
      value: cappedScore,
      grade: scoreIsFallback ? "F" : getGrade(cappedScore),
      isFallback: scoreIsFallback,
      breakdown: Array.isArray(data.score?.breakdown)
        ? data.score.breakdown.map(b => ({
            criterion: b.criterion ?? "Unknown",
            weight: b.weight ?? 20,
            score: b.score != null ? Math.min(100, Math.max(0, b.score)) : 0,
            justification: b.justification ?? "",
          }))
        : [],
    };

    // Normalize findings
    const validStatuses = ["available", "missing", "suspicious"] as const;
    const validEfficiency = ["EFFICIENT", "MODERATE", "INEFFICIENT", "UNKNOWN"] as const;
    const validVerdicts = ["UNDERVALUED", "FAIR", "AGGRESSIVE", "VERY_AGGRESSIVE", "CANNOT_ASSESS"] as const;

    const findings: FinancialAuditFindings = {
      metrics: Array.isArray(data.findings?.metrics)
        ? data.findings.metrics.map(m => ({
            metric: m.metric ?? "Unknown",
            status: validStatuses.includes(m.status as typeof validStatuses[number]) ? m.status : "missing",
            reportedValue: m.reportedValue,
            calculatedValue: m.calculatedValue,
            calculation: m.calculation,
            benchmarkP25: m.benchmarkP25,
            benchmarkMedian: m.benchmarkMedian,
            benchmarkP75: m.benchmarkP75,
            percentile: m.percentile,
            source: m.source ?? "Non spécifié",
            assessment: m.assessment ?? "",
          }))
        : [],
      projections: {
        realistic: data.findings?.projections?.realistic ?? false,
        assumptions: Array.isArray(data.findings?.projections?.assumptions)
          ? data.findings.projections.assumptions
          : [],
        concerns: Array.isArray(data.findings?.projections?.concerns)
          ? data.findings.projections.concerns
          : [],
      },
      valuation: {
        requested: data.findings?.valuation?.requested,
        impliedMultiple: data.findings?.valuation?.impliedMultiple,
        benchmarkMultiple: data.findings?.valuation?.benchmarkMultiple ?? null,
        benchmarkMultipleIsFallback: data.findings?.valuation?.benchmarkMultiple == null,
        percentile: data.findings?.valuation?.percentile,
        verdict: validVerdicts.includes(data.findings?.valuation?.verdict as typeof validVerdicts[number])
          ? data.findings.valuation.verdict
          : "CANNOT_ASSESS",
        comparables: Array.isArray(data.findings?.valuation?.comparables)
          ? data.findings.valuation.comparables.map(c => ({
              name: c.name ?? "Unknown",
              multiple: c.multiple ?? 0,
              stage: c.stage ?? stage,
              source: c.source ?? "Non spécifié",
            }))
          : [],
      },
      unitEconomics: {
        ltv: data.findings?.unitEconomics?.ltv,
        cac: data.findings?.unitEconomics?.cac,
        ltvCacRatio: data.findings?.unitEconomics?.ltvCacRatio,
        paybackMonths: data.findings?.unitEconomics?.paybackMonths,
        assessment: data.findings?.unitEconomics?.assessment ?? "Données insuffisantes",
      },
      burn: {
        monthlyBurn: data.findings?.burn?.monthlyBurn,
        runway: data.findings?.burn?.runway,
        burnMultiple: data.findings?.burn?.burnMultiple,
        efficiency: validEfficiency.includes(data.findings?.burn?.efficiency as typeof validEfficiency[number])
          ? data.findings.burn.efficiency
          : "UNKNOWN",
        assessment: data.findings?.burn?.assessment ?? "",
      },
    };

    // Normalize dbCrossReference
    const validVerdicts2 = ["VERIFIED", "CONTRADICTED", "PARTIAL", "NOT_VERIFIABLE"] as const;
    const validSeverities = ["CRITICAL", "HIGH", "MEDIUM"] as const;

    const dbCrossReference: DbCrossReference = {
      claims: Array.isArray(data.dbCrossReference?.claims)
        ? data.dbCrossReference.claims.map(c => ({
            claim: c.claim ?? "",
            location: c.location ?? "",
            dbVerdict: validVerdicts2.includes(c.dbVerdict as typeof validVerdicts2[number])
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
          category: rf.category ?? "metrics",
          severity: validSeverities.includes(rf.severity as typeof validSeverities[number])
            ? rf.severity
            : "MEDIUM",
          title: rf.title ?? "Red flag détecté",
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
    const validPriorities = ["CRITICAL", "HIGH", "MEDIUM"] as const;

    const questions: AgentQuestion[] = Array.isArray(data.questions)
      ? data.questions.map(q => ({
          priority: validPriorities.includes(q.priority as typeof validPriorities[number])
            ? q.priority
            : "MEDIUM",
          category: q.category ?? "financials",
          question: q.question ?? "",
          context: q.context ?? "",
          whatToLookFor: q.whatToLookFor ?? "",
        }))
      : [];

    // Normalize alert signal
    const validRecommendations = ["PROCEED", "PROCEED_WITH_CAUTION", "INVESTIGATE_FURTHER", "STOP"] as const;

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
      oneLiner: data.narrative?.oneLiner ?? "Analyse financière complète disponible.",
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

  private benchmarkFreshnessWarning: string | null = null;

  private detectUnit(metric: string): string {
    const lower = metric.toLowerCase();
    if (lower.includes("growth") || lower.includes("margin") || lower.includes("retention") || lower.includes("dilution")) return "%";
    if (lower.includes("multiple") || lower.includes("ratio") || lower.includes("ltv/cac")) return "x";
    if (lower.includes("months") || lower.includes("payback")) return "months";
    return "EUR";
  }

  private async fetchBenchmarks(
    sector: string,
    stage: string
  ): Promise<Record<string, { p25: number; median: number; p75: number; source: string }>> {
    // Check benchmark freshness
    const freshnessReport = checkBenchmarkFreshness();
    this.benchmarkFreshnessWarning = formatFreshnessWarning(freshnessReport);

    const metricsToFetch = [
      "ARR Growth YoY",
      "Net Revenue Retention",
      "Burn Multiple",
      "Valuation Multiple",
      "LTV/CAC Ratio",
    ];

    // Fetch all benchmarks in parallel to avoid N+1
    const results = await Promise.all(
      metricsToFetch.map(metric => benchmarkService.lookup(sector, stage, metric))
    );

    const benchmarks: Record<string, { p25: number; median: number; p75: number; source: string }> = {};

    results.forEach((result, index) => {
      const metric = metricsToFetch[index];
      if (result.found && result.benchmark) {
        benchmarks[metric] = {
          p25: result.benchmark.p25,
          median: result.benchmark.median,
          p75: result.benchmark.p75,
          source: result.exact ? "database" : `fallback:${result.fallbackUsed}`,
        };
      } else {
        const fallback = this.getFallbackBenchmark(metric, sector, stage);
        if (fallback) {
          benchmarks[metric] = { ...fallback, source: "centralized_config" };
        }
      }
    });

    return benchmarks;
  }

  /**
   * Get fallback benchmark from centralized config
   * Maps metric names to benchmark service metrics
   */
  private getFallbackBenchmark(
    metric: string,
    sector: string,
    stage: string
  ): { p25: number; median: number; p75: number } | null {
    // Map metric names to centralized benchmark metrics
    const metricMapping: Record<string, "arrGrowthYoY" | "nrr" | "burnMultiple" | "valuationMultiple" | "ltvCacRatio"> = {
      "ARR Growth YoY": "arrGrowthYoY",
      "Net Revenue Retention": "nrr",
      "Burn Multiple": "burnMultiple",
      "Valuation Multiple": "valuationMultiple",
      "LTV/CAC Ratio": "ltvCacRatio",
    };

    const benchmarkMetric = metricMapping[metric];
    if (!benchmarkMetric) return null;

    const benchmark = getBenchmarkFull(sector, stage, benchmarkMetric);
    return {
      p25: benchmark.p25,
      median: benchmark.median,
      p75: benchmark.p75,
    };
  }

  /**
   * F56: Apply reliability-based penalties to the financial audit.
   * Runs AFTER the LLM analysis to enforce hard rules that the LLM
   * might not consistently apply.
   */
  private applyReliabilityPenalties(
    result: FinancialAuditData,
    context: EnrichedAgentContext
  ): void {
    const factStoreFormatted = context.factStoreFormatted ?? '';

    // Detect reliability of key financial metrics
    const keyMetrics = ['ARR', 'REVENUE', 'MRR'];
    const unreliableKeyMetrics: string[] = [];

    for (const metric of result.findings.metrics) {
      const metricName = metric.metric?.toUpperCase() ?? '';
      const isKeyMetric = keyMetrics.some(km => metricName.includes(km));
      if (!isKeyMetric) continue;

      const reliability = metric.dataReliability;
      if (reliability === 'DECLARED' || reliability === 'PROJECTED' || reliability === 'ESTIMATED' || reliability === 'UNVERIFIABLE') {
        unreliableKeyMetrics.push(`${metric.metric} (${reliability})`);
      }
    }

    // Also check fact store for DECLARED/PROJECTED ARR
    const hasProjectedARR = factStoreFormatted.includes('financial.arr') &&
      (factStoreFormatted.includes('[PROJECTED]') || factStoreFormatted.includes('[DECLARED]'));

    const hasUnreliableFinancials = unreliableKeyMetrics.length > 0 || hasProjectedARR;

    if (!hasUnreliableFinancials) return;

    // === APPLY PENALTIES ===

    // 1. Penalty on Data Transparency score (-15 points)
    const transparencyBreakdown = result.score.breakdown.find(
      b => b.criterion.toLowerCase().includes('transparency') || b.criterion.toLowerCase().includes('data')
    );
    if (transparencyBreakdown) {
      const penalty = 15;
      transparencyBreakdown.score = Math.max(0, transparencyBreakdown.score - penalty);
      transparencyBreakdown.justification += ` [PENALITE -${penalty}: metriques cles non verifiees (${unreliableKeyMetrics.join(', ')})]`;
    }

    // 2. Penalty on Valuation Rationality (-20 points if valuation based on unreliable data)
    if (result.findings.valuation.impliedMultiple && result.findings.valuation.verdict !== 'CANNOT_ASSESS') {
      const valuationBreakdown = result.score.breakdown.find(
        b => b.criterion.toLowerCase().includes('valuation')
      );
      if (valuationBreakdown) {
        const penalty = 20;
        valuationBreakdown.score = Math.max(0, valuationBreakdown.score - penalty);
        valuationBreakdown.justification += ` [PENALITE -${penalty}: multiple calcule sur donnees ${unreliableKeyMetrics.join(', ')} — le multiple reel peut etre 2-5x plus eleve]`;
      }

      // 3. Add worst-case multiple calculation
      const currentMultiple = result.findings.valuation.impliedMultiple;
      const worstCaseMultiple = currentMultiple * 3;
      result.findings.valuation.comparables.push({
        name: "PIRE CAS (si chiffres gonfles 3x)",
        multiple: Math.round(worstCaseMultiple * 10) / 10,
        stage: "Hypothese conservative",
        source: "Calcul: multiple declare x3 (aucune verification independante des metriques)",
      });

      // 4. Upgrade verdict if unreliable
      if (result.findings.valuation.verdict === 'FAIR' || result.findings.valuation.verdict === 'UNDERVALUED') {
        result.findings.valuation.verdict = 'AGGRESSIVE';
        result.findings.valuation.comparables.unshift({
          name: "ATTENTION: Verdict degrade",
          multiple: currentMultiple,
          stage: "Multiple base sur donnees DECLARED/PROJECTED",
          source: "Le verdict 'FAIR' a ete degrade en 'AGGRESSIVE' car les metriques financieres ne sont pas verifiees",
        });
      }
    }

    // 5. Recalculate overall score with penalties applied
    let recalculatedScore = 0;
    for (const b of result.score.breakdown) {
      recalculatedScore += (b.score * b.weight) / 100;
    }
    result.score.value = Math.round(recalculatedScore);
    result.score.grade = this.computeGradeFromScore(result.score.value);

    // 6. Add a red flag if not already present
    const hasReliabilityFlag = result.redFlags.some(rf =>
      rf.id?.includes('reliability') || rf.title?.toLowerCase().includes('fiabilit')
    );
    if (!hasReliabilityFlag) {
      result.redFlags.push({
        id: 'RF-RELIABILITY-001',
        category: 'missing_data',
        severity: 'HIGH',
        title: 'Metriques financieres cles non verifiees',
        description: `Les metriques suivantes sont ${unreliableKeyMetrics.join(', ')}. ` +
          `Aucune verification independante (audit, releves bancaires) n'est disponible. ` +
          `Le multiple de valorisation est calcule sur des donnees potentiellement inexactes.`,
        location: 'Financial Model / Pitch Deck',
        evidence: `Metriques non verifiees: ${unreliableKeyMetrics.join(', ')}`,
        contextEngineData: undefined,
        impact: 'Le multiple reel pourrait etre 2-5x plus eleve que calcule si les chiffres sont gonfles',
        question: 'Pouvez-vous fournir des releves bancaires ou un rapport d\'audit confirmant les metriques financieres declarees?',
        redFlagIfBadAnswer: 'Refus de fournir des preuves = probabilite elevee de chiffres gonfles',
      });
    }

    // 7. Add limitation
    result.meta.limitations.push(
      `FIABILITE DONNEES: Les metriques financieres cles (${unreliableKeyMetrics.join(', ')}) sont ${hasProjectedARR ? 'projetees/declarees' : 'non verifiees'}. ` +
      `Les multiples et scores ont ete penalises en consequence.`
    );
  }

  private computeGradeFromScore(score: number): "A" | "B" | "C" | "D" | "F" {
    if (score >= 80) return "A";
    if (score >= 65) return "B";
    if (score >= 50) return "C";
    if (score >= 35) return "D";
    return "F";
  }
}

export const financialAuditor = new FinancialAuditorAgent();
