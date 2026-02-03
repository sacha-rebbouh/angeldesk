import { BaseAgent } from "../base-agent";
import type { AgentContext, ExtractedDealInfo, AgentResult } from "../types";

// =============================================================================
// DECK COHERENCE CHECKER AGENT - TIER 0
// =============================================================================

/**
 * Deck Coherence Checker Agent - TIER 0 (Pre-Analysis)
 *
 * Mission: Verifier la coherence des donnees AVANT l'analyse principale
 * Persona: Financial Auditor Senior (15+ ans), ex-Big4 specialise M&A
 * Standard: Detecter les incoherences qui invalideraient une analyse
 *
 * Inputs:
 * - Documents: Pitch deck (text extracted)
 * - Extracted data: ExtractedDocInfo from document-extractor
 *
 * Outputs:
 * - coherenceScore: 0-100 (fiabilite des donnees)
 * - issues: Liste des problemes detectes
 * - missingCriticalData: Donnees manquantes critiques
 *
 * Execution: APRES document-extractor, AVANT les agents Tier 1
 */

// =============================================================================
// TYPES
// =============================================================================

export interface CoherenceIssue {
  id: string;
  type: "inconsistency" | "missing" | "implausible" | "contradiction";
  severity: "critical" | "warning" | "info";
  category: "financial" | "team" | "market" | "metrics" | "timeline";
  title: string;
  description: string;
  pages?: number[];
  values?: {
    metric: string;
    found: string;
    expected?: string;
    source?: string;
  }[];
  recommendation: string;
}

export interface DeckCoherenceReport {
  coherenceScore: number; // 0-100: fiabilite globale des donnees
  reliabilityGrade: "A" | "B" | "C" | "D" | "F";
  issues: CoherenceIssue[];
  missingCriticalData: string[];
  summary: {
    criticalIssues: number;
    warningIssues: number;
    infoIssues: number;
    dataCompletenessPercent: number;
  };
  recommendation: "PROCEED" | "PROCEED_WITH_CAUTION" | "REQUEST_CLARIFICATION" | "DATA_UNRELIABLE";
}

export interface DeckCoherenceInput {
  documents: {
    id: string;
    type: string;
    content: string;
    name: string;
  }[];
  extractedInfo?: ExtractedDealInfo;
}

// =============================================================================
// LLM RESPONSE INTERFACE
// =============================================================================

interface LLMCoherenceResponse {
  coherenceScore: number;
  issues: {
    type: "inconsistency" | "missing" | "implausible" | "contradiction";
    severity: "critical" | "warning" | "info";
    category: "financial" | "team" | "market" | "metrics" | "timeline";
    title: string;
    description: string;
    pages?: number[];
    values?: {
      metric: string;
      found: string;
      expected?: string;
      source?: string;
    }[];
    recommendation: string;
  }[];
  missingCriticalData: string[];
  analysisNotes: string[];
}

// =============================================================================
// AGENT CLASS
// =============================================================================

export class DeckCoherenceChecker extends BaseAgent<DeckCoherenceReport> {
  constructor() {
    super({
      name: "deck-coherence-checker",
      description: "Verification coherence des donnees du deck - Tier 0",
      modelComplexity: "simple", // Fast model for checks
      maxRetries: 2,
      timeoutMs: 60000, // 60 seconds
      dependencies: ["document-extractor"],
    });
  }

  protected buildSystemPrompt(): string {
    return `# ROLE ET EXPERTISE

Tu es un Financial Auditor Senior avec 15+ ans d'experience, ex-Big4, specialise en M&A et due diligence.
Tu as analyse 1000+ pitch decks et tu connais tous les red flags lies aux donnees incoherentes.
Tu es IMPITOYABLE sur la qualite des donnees - une seule incoherence peut invalider une these d'investissement.

# MISSION

Verifier la COHERENCE INTERNE des donnees presentees dans le pitch deck AVANT que l'analyse detaillee ne commence.
L'objectif: s'assurer que les chiffres tiennent debout mathematiquement et logiquement.

# CE QUE TU DETECTES

## 1. INCOHERENCES ARITHMETIQUES (type: "inconsistency")

| Verification | Formule | Exemple d'incoherence |
|--------------|---------|----------------------|
| ARR vs MRR | ARR = MRR × 12 | MRR 50K mais ARR 700K (devrait etre 600K) |
| Croissance YoY | (N - N-1) / N-1 | "100% growth" mais 200K -> 350K (= 75%) |
| Unit economics | LTV > CAC × 3 | LTV 500EUR, CAC 2000EUR (ratio 0.25x) |
| Burn vs Runway | Runway = Cash / Burn | Cash 500K, Burn 50K/mois mais "18 mois runway" (= 10 mois) |
| Team cost | Headcount × salaire moyen | 10 employes, masse salariale 300K (= 30K/an/pers?) |
| Revenue per employee | Revenue / Headcount | 5M ARR, 50 employes = 100K/employe (faible pour SaaS) |

## 2. CHIFFRES QUI CHANGENT ENTRE SLIDES (type: "contradiction")

| Red flag | Description |
|----------|-------------|
| Double counting | Meme metrique avec valeurs differentes |
| Timeline gaps | Chiffres de periodes differentes presentes comme actuels |
| Rounding issues | 1.2M sur slide 5, 1.18M sur slide 12 |

## 3. DONNEES MANQUANTES CRITIQUES (type: "missing")

Pour un deck Seed/Series A, ces donnees sont OBLIGATOIRES:

| Stage | Donnees critiques |
|-------|-------------------|
| Pre-seed | Team background, Market size, Problem/Solution |
| Seed | ARR/MRR, Burn rate, Runway, Team size |
| Series A | Unit economics (CAC/LTV), Retention/Churn, Growth rate |

## 4. METRIQUES IMPOSSIBLES (type: "implausible")

| Metrique | Valeur suspecte | Pourquoi |
|----------|-----------------|----------|
| NRR | > 200% | Meme Slack/Snowflake sont a ~140% |
| Churn | < 0% | Mathematiquement impossible |
| CAC | Negatif | Impossible |
| Gross margin | > 95% (non-SaaS) | Suspect hors pure software |
| Growth rate | > 500% YoY sustenu | Extreme meme pour early stage |
| LTV/CAC | > 10x | Soit CAC sous-estime soit LTV surestime |

# SEVERITE DES PROBLEMES

## CRITICAL (severity: "critical")
- Incoherence arithmetique flagrante (>20% d'ecart)
- Chiffres contradictoires sur des metriques cles
- Donnees financieres de base manquantes pour le stage

## WARNING (severity: "warning")
- Ecart arithmetique modere (10-20%)
- Donnees secondaires manquantes
- Metriques a la limite du plausible

## INFO (severity: "info")
- Petits ecarts d'arrondi (<10%)
- Donnees nice-to-have manquantes
- Inconsistances mineures

# FORMAT DE SORTIE

Produis un JSON avec:
1. coherenceScore (0-100): 100 = parfaitement coherent, 0 = donnees totalement incoherentes
2. issues: Liste detaillee de chaque probleme
3. missingCriticalData: Liste des donnees manquantes critiques
4. analysisNotes: Notes sur l'analyse (ce qui a ete verifie, limitations)

# REGLES ABSOLUES

1. MONTRER les calculs - pas juste "incoherent" mais "MRR 50K × 12 = 600K, pas 700K"
2. CITER les sources - "Slide 5 vs Slide 12" ou "Page X"
3. TOUJOURS fournir une recommandation actionnable
4. Ne PAS inventer des problemes - si les donnees sont coherentes, le dire
5. Etre CONSTRUCTIF - l'objectif est d'aider, pas de descendre le deck`;
  }

  protected async execute(context: AgentContext): Promise<DeckCoherenceReport> {
    const { documents, extractedInfo } = this.prepareInput(context);

    if (documents.length === 0) {
      return this.createEmptyReport("Aucun document fourni");
    }

    const prompt = this.buildUserPrompt(documents, extractedInfo);
    const { data } = await this.llmCompleteJSON<LLMCoherenceResponse>(prompt);

    return this.normalizeResponse(data);
  }

  private prepareInput(context: AgentContext): DeckCoherenceInput {
    const documents: DeckCoherenceInput["documents"] = [];

    // Get documents from context
    if (context.documents && context.documents.length > 0) {
      for (const doc of context.documents) {
        if (doc.extractedText) {
          documents.push({
            id: doc.id,
            type: doc.type,
            content: doc.extractedText,
            name: doc.name,
          });
        }
      }
    }

    // Get extracted info from document-extractor if available
    const docExtractorResult = context.previousResults?.["document-extractor"] as (AgentResult & { data?: { extractedInfo?: ExtractedDealInfo } }) | undefined;
    const extractedInfo = docExtractorResult?.data?.extractedInfo;

    return { documents, extractedInfo };
  }

  private buildUserPrompt(documents: DeckCoherenceInput["documents"], extractedInfo?: ExtractedDealInfo): string {
    let prompt = `# VERIFICATION DE COHERENCE DU DECK

## DOCUMENTS FOURNIS

`;

    for (const doc of documents) {
      prompt += `### ${doc.name} (${doc.type})

${doc.content.slice(0, 30000)}

---

`;
    }

    // Add extracted info context if available
    if (extractedInfo) {
      // Group extracted info by category for better prompt
      const financial = {
        arr: extractedInfo.arr,
        mrr: extractedInfo.mrr,
        revenue: extractedInfo.revenue,
        growthRateYoY: extractedInfo.growthRateYoY,
        burnRate: extractedInfo.burnRate,
        runway: extractedInfo.runway,
        valuationPre: extractedInfo.valuationPre,
        valuationPost: extractedInfo.valuationPost,
        amountRaising: extractedInfo.amountRaising,
        previousRounds: extractedInfo.previousRounds,
        financialDataType: extractedInfo.financialDataType,
      };

      const team = {
        teamSize: extractedInfo.teamSize,
        founders: extractedInfo.founders,
      };

      const market = {
        sector: extractedInfo.sector,
        tam: extractedInfo.tam,
        sam: extractedInfo.sam,
        som: extractedInfo.som,
        markets: extractedInfo.markets,
        competitors: extractedInfo.competitors,
      };

      const metrics = {
        customers: extractedInfo.customers,
        users: extractedInfo.users,
        cac: extractedInfo.cac,
        ltv: extractedInfo.ltv,
        churnRate: extractedInfo.churnRate,
        nrr: extractedInfo.nrr,
      };

      prompt += `## DONNEES EXTRAITES (par document-extractor)

### Informations financieres
${JSON.stringify(financial, null, 2)}

### Informations equipe
${JSON.stringify(team, null, 2)}

### Informations marche
${JSON.stringify(market, null, 2)}

### Metriques business
${JSON.stringify(metrics, null, 2)}

---

`;
    }

    prompt += `## INSTRUCTIONS

1. VERIFIE la coherence arithmetique de TOUTES les metriques financieres
2. DETECTE les chiffres qui different entre slides/pages
3. IDENTIFIE les donnees critiques manquantes pour ce stage
4. SIGNALE les metriques implausibles

## OUTPUT ATTENDU

\`\`\`json
{
  "coherenceScore": 0-100,
  "issues": [
    {
      "type": "inconsistency|missing|implausible|contradiction",
      "severity": "critical|warning|info",
      "category": "financial|team|market|metrics|timeline",
      "title": "Titre court du probleme",
      "description": "Description detaillee avec calculs montres",
      "pages": [5, 12],
      "values": [
        {
          "metric": "ARR",
          "found": "700K EUR",
          "expected": "600K EUR (MRR 50K × 12)",
          "source": "Slide 5 vs calcul MRR Slide 3"
        }
      ],
      "recommendation": "Clarifier avec le fondateur quel chiffre est correct"
    }
  ],
  "missingCriticalData": ["Burn rate", "Runway", "Churn rate"],
  "analysisNotes": ["Notes sur ce qui a ete verifie"]
}
\`\`\``;

    return prompt;
  }

  private normalizeResponse(data: LLMCoherenceResponse): DeckCoherenceReport {
    const coherenceScore = Math.min(100, Math.max(0, data.coherenceScore ?? 70));

    // Normalize issues
    const validTypes = ["inconsistency", "missing", "implausible", "contradiction"] as const;
    const validSeverities = ["critical", "warning", "info"] as const;
    const validCategories = ["financial", "team", "market", "metrics", "timeline"] as const;

    const issues: CoherenceIssue[] = Array.isArray(data.issues)
      ? data.issues.map((issue, idx) => ({
          id: `COH-${String(idx + 1).padStart(3, "0")}`,
          type: validTypes.includes(issue.type as typeof validTypes[number])
            ? issue.type
            : "inconsistency",
          severity: validSeverities.includes(issue.severity as typeof validSeverities[number])
            ? issue.severity
            : "warning",
          category: validCategories.includes(issue.category as typeof validCategories[number])
            ? issue.category
            : "financial",
          title: issue.title ?? "Probleme detecte",
          description: issue.description ?? "",
          pages: Array.isArray(issue.pages) ? issue.pages : undefined,
          values: Array.isArray(issue.values)
            ? issue.values.map(v => ({
                metric: v.metric ?? "",
                found: v.found ?? "",
                expected: v.expected,
                source: v.source,
              }))
            : undefined,
          recommendation: issue.recommendation ?? "Verifier cette donnee avec le fondateur",
        }))
      : [];

    // Count by severity
    const criticalIssues = issues.filter(i => i.severity === "critical").length;
    const warningIssues = issues.filter(i => i.severity === "warning").length;
    const infoIssues = issues.filter(i => i.severity === "info").length;

    // Missing critical data
    const missingCriticalData = Array.isArray(data.missingCriticalData)
      ? data.missingCriticalData
      : [];

    // Calculate data completeness (rough estimate based on missing critical data)
    const expectedCriticalFields = 10; // ARR, MRR, Burn, Runway, Team size, etc.
    const dataCompletenessPercent = Math.max(0, Math.min(100,
      Math.round((1 - missingCriticalData.length / expectedCriticalFields) * 100)
    ));

    // Determine reliability grade
    const getGrade = (score: number, criticalCount: number): "A" | "B" | "C" | "D" | "F" => {
      if (criticalCount >= 3) return "F";
      if (criticalCount >= 2) return "D";
      if (score >= 85 && criticalCount === 0) return "A";
      if (score >= 70 && criticalCount <= 1) return "B";
      if (score >= 50) return "C";
      return "D";
    };

    // Determine recommendation
    const getRecommendation = (
      score: number,
      criticalCount: number
    ): DeckCoherenceReport["recommendation"] => {
      if (criticalCount >= 3) return "DATA_UNRELIABLE";
      if (criticalCount >= 1) return "REQUEST_CLARIFICATION";
      if (score >= 80) return "PROCEED";
      return "PROCEED_WITH_CAUTION";
    };

    return {
      coherenceScore,
      reliabilityGrade: getGrade(coherenceScore, criticalIssues),
      issues,
      missingCriticalData,
      summary: {
        criticalIssues,
        warningIssues,
        infoIssues,
        dataCompletenessPercent,
      },
      recommendation: getRecommendation(coherenceScore, criticalIssues),
    };
  }

  private createEmptyReport(reason: string): DeckCoherenceReport {
    return {
      coherenceScore: 0,
      reliabilityGrade: "F",
      issues: [{
        id: "COH-001",
        type: "missing",
        severity: "critical",
        category: "financial",
        title: "Aucune donnee a analyser",
        description: reason,
        recommendation: "Fournir un pitch deck ou des documents a analyser",
      }],
      missingCriticalData: ["Tous les champs - aucun document fourni"],
      summary: {
        criticalIssues: 1,
        warningIssues: 0,
        infoIssues: 0,
        dataCompletenessPercent: 0,
      },
      recommendation: "DATA_UNRELIABLE",
    };
  }
}

export const deckCoherenceChecker = new DeckCoherenceChecker();
