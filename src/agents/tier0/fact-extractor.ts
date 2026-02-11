import { BaseAgent } from "../base-agent";
import { FACT_KEYS, getFactKeyDefinition, FACT_KEY_COUNT } from "@/services/fact-store/fact-keys";
import type { AgentContext } from "../types";
import type {
  ExtractedFact,
  ContradictionInfo,
  CurrentFact,
  FactCategory,
  FactSource,
} from "@/services/fact-store/types";
import { sanitizeForLLM, sanitizeName } from "@/lib/sanitize";

// ═══════════════════════════════════════════════════════════════════════════
// FACT EXTRACTOR AGENT - TIER 0
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fact Extractor Agent - TIER 0 (Pre-Analysis)
 *
 * Mission: Extraire les faits structures des documents avec confidence scoring rigoureux
 * Persona: Data Analyst Senior (15+ ans extraction structuree), ex-Big4
 * Standard: Chaque fait doit avoir extractedText (preuve), confidence scoring strict
 *
 * Inputs:
 * - Documents: Pitch deck, Data room, Financial model
 * - Existing Facts: Faits deja dans le store (pour detection contradictions)
 * - Founder Responses: Reponses aux questions (optionnel)
 *
 * Outputs:
 * - facts: ExtractedFact[] avec confidence scoring
 * - contradictions: ContradictionInfo[] detectees vs faits existants
 * - metadata: Stats d'extraction
 *
 * Execution: AVANT tous les autres agents (Tier 0)
 */

// ═══════════════════════════════════════════════════════════════════════════
// INPUT/OUTPUT INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface FactExtractorDocument {
  id: string;
  type: "PITCH_DECK" | "DATA_ROOM" | "FINANCIAL_MODEL" | "OTHER";
  content: string;
  name: string;
}

export interface FounderResponse {
  questionId: string;
  question: string;
  answer: string;
  category: string;
}

export interface FactExtractorInput {
  documents: FactExtractorDocument[];
  existingFacts: CurrentFact[];
  founderResponses?: FounderResponse[];
}

export interface IgnoredFactInfo {
  factKey: string;
  reason: string;
}

export interface FactExtractorOutput {
  facts: ExtractedFact[];
  contradictions: ContradictionInfo[];
  metadata: {
    factsExtracted: number;
    contradictionsDetected: number;
    averageConfidence: number;
    processingTimeMs: number;
    documentsCovered: number;
    factKeysCovered: number;
    factsIgnored: number;
    ignoredDetails: IgnoredFactInfo[];
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LLM RESPONSE INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

interface LLMExtractedFact {
  factKey: string;
  category: FactCategory;
  value: unknown;
  displayValue: string;
  unit?: string;
  sourceDocumentId: string;
  sourceConfidence: number;
  extractedText: string;
  // Temporal fields
  validAt?: string; // ISO date string
  periodType?: 'POINT_IN_TIME' | 'QUARTER' | 'YEAR' | 'MONTH';
  periodLabel?: string; // "Q4 2024", "FY2024", "Dec 2024"
  // Data Reliability Classification
  reliability: 'AUDITED' | 'VERIFIED' | 'DECLARED' | 'PROJECTED' | 'ESTIMATED' | 'UNVERIFIABLE';
  reliabilityReasoning: string; // Why this classification
  isProjection: boolean; // true if data includes future projections
  documentDate?: string; // ISO date of document creation
  dataPeriodEnd?: string; // End of the data period (e.g., "2025-12-31" for annual 2025)
  projectionPercent?: number; // % of the period that is projected
}

interface LLMContradiction {
  factKey: string;
  newValue: unknown;
  existingValue: unknown;
  newSource: FactSource;
  existingSource: FactSource;
  deltaPercent?: number;
  significance: "MINOR" | "SIGNIFICANT" | "MAJOR";
  explanation: string;
}

interface LLMFactExtractorResponse {
  facts: LLMExtractedFact[];
  contradictions: LLMContradiction[];
  extractionNotes: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENT CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class FactExtractorAgent extends BaseAgent<FactExtractorOutput> {
  constructor() {
    super({
      name: "fact-extractor",
      description: "Extraction structuree des faits avec confidence scoring - Tier 0",
      modelComplexity: "simple", // Fast model for extraction
      maxRetries: 2,
      timeoutMs: 90000, // 90 seconds
      dependencies: [], // No dependencies - runs first
    });
  }

  protected buildSystemPrompt(): string {
    // Build the fact keys taxonomy for the prompt
    const factKeysTaxonomy = this.buildFactKeysTaxonomy();

    return `# ROLE ET EXPERTISE

Tu es un Data Analyst Senior avec 15+ ans d'experience en extraction structuree de donnees.
Tu as travaille chez les Big4 (Deloitte, PwC, EY, KPMG) sur des missions de due diligence.
Tu es rigoureux, methodique, et tu ne laisses RIEN passer.

# MISSION

Extraire TOUS les faits verifiables des documents fournis et les structurer selon la taxonomie de cles canoniques.
Chaque fait extrait doit avoir:
1. Une cle canonique valide (factKey)
2. Une valeur typee correctement
3. Une confidence calculee rigoureusement
4. Le texte source exact (extractedText) comme preuve

# TAXONOMIE DES CLES CANONIQUES (${FACT_KEY_COUNT} cles)

${factKeysTaxonomy}

# REGLES DE CONFIDENCE SCORING

Le confidence score mesure ta certitude sur la valeur extraite:

## 95-100: Valeur EXPLICITE avec source claire
- Le chiffre exact est mentionne dans le document
- La source est non ambigue (ex: "Notre ARR est de 500K EUR")
- Exemple: "ARR: 500,000 EUR" dans le financial model -> confidence 98

## 85-94: Valeur CALCULEE ou DEDUITE avec haute certitude
- Le chiffre peut etre calcule a partir de donnees explicites
- Exemple: MRR 42K EUR mentionne -> ARR = 42K x 12 = 504K EUR -> confidence 90
- Le calcul doit etre simple et sans ambiguite

## 70-84: Estimation RAISONNABLE basee sur indices
- Le chiffre n'est pas explicite mais deductible avec confiance moderee
- Exemple: "Nous avons 50 clients B2B a 10K EUR/an" -> ARR ~500K EUR -> confidence 75
- Attention: si les indices sont ambigus, ne pas extraire

## <70: NE PAS EXTRAIRE
- Si la confidence est inferieure a 70%, NE PAS inclure le fait
- Mieux vaut manquer un fait qu'en extraire un faux
- Tu peux mentionner dans extractionNotes ce qui n'a pas pu etre extrait

# EXTRACTION TEMPORELLE

Pour les metriques qui varient dans le temps (ARR, MRR, headcount, churn, etc.), TOUJOURS extraire:
- validAt: Date a laquelle cette valeur etait valide (format ISO: "2024-12-31")
- periodType: "POINT_IN_TIME" | "QUARTER" | "YEAR" | "MONTH"
- periodLabel: Label lisible ("Q4 2024", "Dec 2024", "FY2024")

Exemples:
- "Notre ARR a fin Q4 2024 est de 500K" -> validAt: "2024-12-31", periodType: "QUARTER", periodLabel: "Q4 2024"
- "En decembre, nous avions 50 clients" -> validAt: "2024-12-31", periodType: "MONTH", periodLabel: "Dec 2024"
- "Revenue 2024: 1.2M EUR" -> validAt: "2024-12-31", periodType: "YEAR", periodLabel: "FY2024"
- Si pas de date mentionnee, utiliser la date du document si disponible, sinon omettre ces champs

# CLASSIFICATION DE FIABILITE DES DONNEES (CRITIQUE)

CHAQUE fait extrait DOIT etre classifie selon sa fiabilite. C'est NON NEGOCIABLE.
L'objectif: ne JAMAIS traiter une projection comme un fait avere.

## Niveaux de fiabilite (du plus au moins fiable)

| Niveau | Description | Exemple |
|--------|-------------|---------|
| AUDITED | Confirme par audit externe, releves bancaires, comptes certifies | "Rapport CAC certifie: CA 2024 = 1.2M EUR" |
| VERIFIED | Recoupe par plusieurs sources independantes | ARR mentionne dans le deck ET confirme par Context Engine |
| DECLARED | Annonce dans un document sans verification independante possible | "Notre ARR est de 500K" dans le pitch deck |
| PROJECTED | Projection explicite ou implicite (Business Plan, forecast, periode future) | "CA 2025: 570K" dans un BP date d'aout 2025 |
| ESTIMATED | Calcule/deduit par l'IA a partir de donnees partielles | MRR 42K → ARR calcule = 504K |
| UNVERIFIABLE | Impossible a verifier ou falsifier | "Nous avons le meilleur produit du marche" |

## Regles de detection des PROJECTIONS (CRITIQUE)

### Detection temporelle automatique
1. Identifier la DATE DU DOCUMENT: metadata PDF, mention explicite ("BP Septembre 2025"), date d'upload
2. Identifier la PERIODE DES DONNEES: "CA 2025", "ARR Q4 2025", "Revenue FY2025"
3. Si la fin de la periode des donnees est APRES la date du document → c'est une PROJECTION

### Exemples concrets
- Document date aout 2025, "CA annuel 2025: 570K€" → La periode couvre jan-dec 2025, le doc date d'aout
  → 4 mois sur 12 sont dans le futur = 33% projection
  → reliability: "PROJECTED", projectionPercent: 33, isProjection: true
  → reasoning: "Document date d'aout 2025. Le CA 2025 couvre jan-dec. Sept-Dec (4 mois/12 = 33%) sont des projections."

- Document date mars 2026, "CA 2025: 1.2M€" → Toute la periode est dans le passe
  → reliability: "DECLARED" (pas de verification externe possible)
  → isProjection: false

- Document avec un tableau "Projections" ou "Business Plan" ou "Forecast"
  → TOUT ce qui est dans cette section = reliability: "PROJECTED"

- Chiffres ronds parfaits (100K, 500K, 1M) dans un deck pre-seed sans historique
  → Forte suspicion de projection, reliability: "PROJECTED" ou "ESTIMATED"

### Signaux de projection (meme sans date explicite)
- Mots: "prevu", "projete", "objectif", "target", "forecast", "budget", "plan"
- Colonnes: "2025E", "2026P", "Prev.", "Budget"
- Taux de croissance >100% sustenu = probablement des projections
- Chiffres qui augmentent de facon parfaitement lineaire ou exponentielle
- Section "Business Plan", "Plan financier", "Projections financieres"

## Champs obligatoires pour la classification

Pour CHAQUE fait extrait:
- reliability: AUDITED | VERIFIED | DECLARED | PROJECTED | ESTIMATED | UNVERIFIABLE
- reliabilityReasoning: Explication de pourquoi cette classification (1-2 phrases)
- isProjection: true si la donnee inclut des projections futures
- documentDate: date ISO du document source (si identifiable)
- dataPeriodEnd: date ISO de fin de la periode couverte par cette donnee
- projectionPercent: % de la periode qui est projetee (0 si historique pur, 100 si projection pure)

# REGLES D'EXTRACTION

## OBLIGATOIRE - extractedText
Chaque fait DOIT avoir un extractedText qui est la CITATION EXACTE du document source.
- Copier-coller le texte exact
- Si c'est un chiffre dans un tableau, decrire le contexte
- Format: "[Source: Document X, Page/Slide Y] Texte exact..."

## Types de valeurs
- currency: Nombre en euros (ex: 500000 pour 500K EUR)
- percentage: Nombre entre 0 et 100 (ex: 25 pour 25%)
- number: Nombre entier ou decimal
- string: Texte libre
- date: Format ISO YYYY-MM-DD
- boolean: true ou false
- array: Liste d'elements
- enum: Valeur parmi une liste predefinee

## Detection des contradictions
Si un fait existant est fourni et que tu trouves une valeur differente:
1. Compare les valeurs
2. Calcule le delta en pourcentage si applicable
3. Determine la significance:
   - MINOR: delta < 10%
   - SIGNIFICANT: delta 10-30%
   - MAJOR: delta > 30% ou valeur completement differente
4. Explique la contradiction

# FORMAT DE SORTIE

Produis un JSON avec cette structure exacte.
**IMPORTANT**: Pour sourceDocumentId, utilise les vrais IDs fournis dans "IDs DES DOCUMENTS", pas des IDs inventes.

\`\`\`json
{
  "facts": [
    {
      "factKey": "financial.arr",
      "category": "FINANCIAL",
      "value": 500000,
      "displayValue": "500K EUR",
      "unit": "EUR",
      "sourceDocumentId": "<ID_REEL_DU_DOCUMENT>",
      "sourceConfidence": 95,
      "extractedText": "[Source: Pitch Deck, Slide 8] Notre ARR atteint 500K EUR a fin Q4 2024",
      "validAt": "2024-12-31",
      "periodType": "QUARTER",
      "periodLabel": "Q4 2024",
      "reliability": "DECLARED",
      "reliabilityReasoning": "Chiffre annonce dans le pitch deck sans verification externe. Pas de releve bancaire ou audit.",
      "isProjection": false,
      "documentDate": "2025-01-15",
      "dataPeriodEnd": "2024-12-31",
      "projectionPercent": 0
    }
  ],
  "contradictions": [
    {
      "factKey": "financial.arr",
      "newValue": 500000,
      "existingValue": 450000,
      "newSource": "PITCH_DECK",
      "existingSource": "FINANCIAL_MODEL",
      "deltaPercent": 11.1,
      "significance": "SIGNIFICANT",
      "explanation": "Le pitch deck annonce 500K EUR d'ARR mais le financial model indiquait 450K EUR. Ecart de 11%."
    }
  ],
  "extractionNotes": [
    "CAC non trouve - aucune mention des couts d'acquisition",
    "Churn mentionne mais trop vague pour extraire ('faible churn')"
  ]
}
\`\`\`

# REGLES ABSOLUES

1. JAMAIS inventer de valeurs - si tu n'es pas sur, n'extrait pas
2. TOUJOURS inclure extractedText avec la citation exacte
3. TOUJOURS utiliser les cles canoniques de la taxonomie
4. Confidence < 70% = NE PAS EXTRAIRE
5. TOUJOURS verifier le type de valeur attendu par la cle
6. Si enum, verifier que la valeur est dans enumValues
7. Pour les devises, convertir en EUR si possible (sinon mentionner)
8. Les pourcentages doivent etre entre 0 et 100 (pas 0.25 pour 25%)
9. **CRITIQUE - sourceDocumentId**: Utiliser UNIQUEMENT les IDs reels fournis dans "IDs DES DOCUMENTS". NE JAMAIS inventer d'ID comme "doc-pitch-deck" ou "doc-financial-model".
10. **CHURN et METRIQUES - Interpretation periode**:
    - TOUJOURS regarder le contexte temporel du document (ex: "BP Février - Mai 2026" = période de 4 mois)
    - Si un churn est donné pour une période spécifique (ex: 6% sur 4 mois), CALCULER le churn mensuel:
      * churn_mensuel = churn_periode / nombre_mois (ex: 6% / 4 = 1.5% mensuel)
      * churn_annuel = 1 - (1 - churn_mensuel)^12 ou approximation: churn_mensuel × 12
    - Utiliser traction.churn_monthly pour le churn mensuel calculé
    - Utiliser traction.churn_annual pour le churn annualisé
    - INCLURE le calcul dans extractedText: "[Source: BP] 6% sur 4 mois (Fév-Mai) → 1.5% mensuel → ~18% annuel"
    - NE JAMAIS assumer qu'un churn sans contexte est mensuel (6% mensuel = 53% annuel = business mort)

# EXEMPLES (IDs illustratifs - utiliser les vrais IDs du deal)

## BON - Donnee historique verifiee
{
  "factKey": "financial.mrr",
  "category": "FINANCIAL",
  "value": 42000,
  "displayValue": "42K EUR",
  "unit": "EUR",
  "sourceDocumentId": "<UTILISER_VRAI_ID_DU_DOCUMENT>",
  "sourceConfidence": 98,
  "extractedText": "[Source: Financial Model, Onglet Dashboard] MRR Dec 2024: 42,000 EUR",
  "reliability": "DECLARED",
  "reliabilityReasoning": "Chiffre explicite dans le financial model. Source unique, pas d'audit externe.",
  "isProjection": false,
  "documentDate": "2025-01-10",
  "dataPeriodEnd": "2024-12-31",
  "projectionPercent": 0
}

## BON - Extraction calculee (ESTIMATED)
{
  "factKey": "financial.arr",
  "category": "FINANCIAL",
  "value": 504000,
  "displayValue": "504K EUR (calcule)",
  "unit": "EUR",
  "sourceDocumentId": "<UTILISER_VRAI_ID_DU_DOCUMENT>",
  "sourceConfidence": 90,
  "extractedText": "[Source: Financial Model, Onglet Dashboard] MRR Dec 2024: 42,000 EUR. ARR calcule = MRR x 12 = 504K EUR",
  "reliability": "ESTIMATED",
  "reliabilityReasoning": "ARR calcule a partir du MRR (42K x 12). Le MRR source est DECLARED, le calcul ajoute une couche d'incertitude.",
  "isProjection": false,
  "documentDate": "2025-01-10",
  "dataPeriodEnd": "2024-12-31",
  "projectionPercent": 0
}

## BON - Detection de projection (CAS SENSAI)
{
  "factKey": "financial.revenue",
  "category": "FINANCIAL",
  "value": 570000,
  "displayValue": "570K EUR",
  "unit": "EUR",
  "sourceDocumentId": "<UTILISER_VRAI_ID_DU_DOCUMENT>",
  "sourceConfidence": 85,
  "extractedText": "[Source: BP, Page 5] CA previsionnel 2025: 570K EUR",
  "validAt": "2025-12-31",
  "periodType": "YEAR",
  "periodLabel": "FY2025",
  "reliability": "PROJECTED",
  "reliabilityReasoning": "Business Plan date d'aout 2025. Le CA 2025 couvre jan-dec mais le BP est date d'aout. Sept-Dec (4 mois sur 12 = 33%) sont des projections. De plus, le document est un BP (forward-looking par nature).",
  "isProjection": true,
  "documentDate": "2025-08-15",
  "dataPeriodEnd": "2025-12-31",
  "projectionPercent": 33
}
}

## MAUVAIS - A NE PAS FAIRE
{
  "factKey": "financial.arr",
  "category": "FINANCIAL",
  "value": 500000,
  "displayValue": "~500K EUR",
  "sourceConfidence": 60,
  "extractedText": "Le revenue semble etre autour de 500K"
}
-> Confidence trop faible, pas de source precise, valeur estimee = NE PAS EXTRAIRE`;
  }

  protected async execute(context: AgentContext): Promise<FactExtractorOutput> {
    const startTime = Date.now();

    // Convert AgentContext documents to FactExtractorDocument format
    const documents: FactExtractorDocument[] = (context.documents ?? [])
      .filter(doc => doc.extractedText) // Only process documents with content
      .map(doc => ({
        id: doc.id,
        type: this.mapDocumentType(doc.type),
        content: doc.extractedText ?? "",
        name: doc.name,
      }));

    // Get existing facts from previousResults if available
    const existingFacts: CurrentFact[] = this.getExistingFactsFromContext(context);

    // Get founder responses if available
    const founderResponses: FounderResponse[] = this.getFounderResponsesFromContext(context);

    const input: FactExtractorInput = {
      documents,
      existingFacts,
      founderResponses,
    };

    // Validate input
    if (input.documents.length === 0) {
      return {
        facts: [],
        contradictions: [],
        metadata: {
          factsExtracted: 0,
          contradictionsDetected: 0,
          averageConfidence: 0,
          processingTimeMs: Date.now() - startTime,
          documentsCovered: 0,
          factKeysCovered: 0,
          factsIgnored: 0,
          ignoredDetails: [],
        },
      };
    }

    // Build the user prompt
    const prompt = this.buildUserPrompt(input);

    // Call LLM - model is selected by router based on complexity
    const { data } = await this.llmCompleteJSON<LLMFactExtractorResponse>(prompt, {
      temperature: 0.1, // Low temperature for precise extraction
    });

    // Normalize and validate response
    const result = this.normalizeResponse(data, input, startTime);

    return result;
  }

  /**
   * Map document type string to FactExtractorDocument type
   */
  private mapDocumentType(type: string): "PITCH_DECK" | "DATA_ROOM" | "FINANCIAL_MODEL" | "OTHER" {
    const normalizedType = type.toUpperCase().replace(/-/g, "_");
    switch (normalizedType) {
      case "PITCH_DECK":
        return "PITCH_DECK";
      case "DATA_ROOM":
        return "DATA_ROOM";
      case "FINANCIAL_MODEL":
        return "FINANCIAL_MODEL";
      default:
        return "OTHER";
    }
  }

  /**
   * Extract existing facts from context if available
   */
  private getExistingFactsFromContext(context: AgentContext): CurrentFact[] {
    // Check if there's a previous fact-extractor run
    const previousFactExtractor = context.previousResults?.["fact-extractor"];
    if (previousFactExtractor?.success && "data" in previousFactExtractor) {
      const data = previousFactExtractor.data as FactExtractorOutput | undefined;
      if (data?.facts) {
        // Convert ExtractedFact[] to CurrentFact[] format
        return data.facts.map(fact => ({
          dealId: context.dealId,
          factKey: fact.factKey,
          category: fact.category,
          currentValue: fact.value,
          currentDisplayValue: fact.displayValue,
          currentSource: fact.source,
          currentConfidence: fact.sourceConfidence,
          isDisputed: false,
          eventHistory: [],
          firstSeenAt: new Date(),
          lastUpdatedAt: new Date(),
        }));
      }
    }
    return [];
  }

  /**
   * Extract founder responses from context if available
   * These come from the /api/founder-responses endpoint stored as FOUNDER_RESPONSE facts
   */
  private getFounderResponsesFromContext(context: AgentContext): FounderResponse[] {
    // Check if founder responses are passed in the enriched context
    const enrichedContext = context as AgentContext & {
      founderResponses?: FounderResponse[];
    };

    if (enrichedContext.founderResponses && Array.isArray(enrichedContext.founderResponses)) {
      return enrichedContext.founderResponses;
    }

    return [];
  }

  // Constants for token management
  private static readonly MAX_TOTAL_CHARS = 150000; // ~37K tokens, safe for most models
  private static readonly DOC_TYPE_PRIORITY: Record<string, number> = {
    'FINANCIAL_MODEL': 1,
    'DATA_ROOM': 2,
    'PITCH_DECK': 3,
    'OTHER': 4,
  };

  /**
   * Intelligently truncate documents to fit within token budget.
   * Prioritizes FINANCIAL_MODEL > DATA_ROOM > PITCH_DECK > OTHER.
   */
  private truncateDocumentsForPrompt(
    documents: FactExtractorDocument[]
  ): { doc: FactExtractorDocument; truncatedContent: string; isTruncated: boolean }[] {
    // Sort by priority (most important first)
    const sorted = [...documents].sort((a, b) =>
      (FactExtractorAgent.DOC_TYPE_PRIORITY[a.type] ?? 5) - (FactExtractorAgent.DOC_TYPE_PRIORITY[b.type] ?? 5)
    );

    // Calculate total current size
    const totalChars = sorted.reduce((sum, doc) => sum + doc.content.length, 0);

    // If under budget, no truncation needed
    if (totalChars <= FactExtractorAgent.MAX_TOTAL_CHARS) {
      return sorted.map(doc => ({
        doc,
        truncatedContent: doc.content,
        isTruncated: false,
      }));
    }

    // Distribute budget based on priority
    const results: { doc: FactExtractorDocument; truncatedContent: string; isTruncated: boolean }[] = [];
    let remainingBudget = FactExtractorAgent.MAX_TOTAL_CHARS;

    for (let i = 0; i < sorted.length; i++) {
      const doc = sorted[i];
      const docsRemaining = sorted.length - i;

      // Higher priority docs get more space
      const priorityMultiplier = doc.type === 'FINANCIAL_MODEL' ? 2.0 :
                                 doc.type === 'DATA_ROOM' ? 1.5 : 1.0;
      const fairShare = Math.floor((remainingBudget / docsRemaining) * priorityMultiplier);
      const allocatedChars = Math.min(doc.content.length, fairShare, remainingBudget);

      const isTruncated = doc.content.length > allocatedChars;
      const truncatedContent = isTruncated
        ? doc.content.substring(0, allocatedChars) +
          `\n\n[... TRONQUE: ${doc.content.length - allocatedChars} caracteres restants. ` +
          `Priorisez les informations financieres et metriques cles. ...]`
        : doc.content;

      results.push({ doc, truncatedContent, isTruncated });
      remainingBudget -= truncatedContent.length;
    }

    // Log truncation info
    const truncatedDocs = results.filter(r => r.isTruncated);
    if (truncatedDocs.length > 0) {
      console.warn(
        `[FactExtractor] ${truncatedDocs.length}/${documents.length} documents truncated to fit token budget:`,
        truncatedDocs.map(r => `${r.doc.name}: ${r.doc.content.length} → ${r.truncatedContent.length} chars`)
      );
    }

    return results;
  }

  private buildUserPrompt(input: FactExtractorInput): string {
    let prompt = `# EXTRACTION DE FAITS - ANALYSE DES DOCUMENTS\n\n`;

    // Truncate documents intelligently
    const processedDocs = this.truncateDocumentsForPrompt(input.documents);

    // CRITICAL: List real document IDs upfront so LLM uses them
    prompt += `## IDs DES DOCUMENTS (UTILISER CES IDs EXACTS)\n\n`;
    prompt += `⚠️ CRITIQUE: Tu DOIS utiliser ces IDs exacts dans sourceDocumentId, PAS des IDs inventes.\n\n`;
    for (const { doc } of processedDocs) {
      prompt += `- **${doc.type}**: \`${doc.id}\` (${doc.name})\n`;
    }
    prompt += `\n`;

    prompt += `## DOCUMENTS A ANALYSER (${processedDocs.length})\n\n`;

    for (const { doc, truncatedContent, isTruncated } of processedDocs) {
      // Sanitize document name and content to prevent prompt injection
      const sanitizedName = sanitizeName(doc.name);
      const sanitizedType = sanitizeName(doc.type);
      const sanitizedContent = sanitizeForLLM(truncatedContent, {
        maxLength: 100000,
        preserveNewlines: true,
      });

      prompt += `### Document: ${sanitizedName} (ID: \`${doc.id}\`, Type: ${sanitizedType})`;
      if (isTruncated) {
        prompt += ` [TRONQUE]`;
      }
      prompt += `\n\`\`\`\n${sanitizedContent}\n\`\`\`\n\n`;
    }

    // Add existing facts for contradiction detection
    if (input.existingFacts && input.existingFacts.length > 0) {
      prompt += `## FAITS EXISTANTS (pour detection de contradictions)\n\n`;
      for (const fact of input.existingFacts) {
        prompt += `- ${fact.factKey}: ${fact.currentDisplayValue} (source: ${fact.currentSource}, confidence: ${fact.currentConfidence})\n`;
      }
      prompt += `\n`;
    }

    // Add founder responses if any (sanitize user-provided content)
    if (input.founderResponses && input.founderResponses.length > 0) {
      prompt += `## REPONSES DU FONDATEUR\n\n`;
      for (const response of input.founderResponses) {
        const sanitizedQuestion = sanitizeForLLM(response.question, { maxLength: 1000 });
        const sanitizedAnswer = sanitizeForLLM(response.answer, { maxLength: 5000 });
        const sanitizedCategory = sanitizeName(response.category);
        prompt += `**Q: ${sanitizedQuestion}**\n`;
        prompt += `A: ${sanitizedAnswer}\n`;
        prompt += `(Categorie: ${sanitizedCategory})\n\n`;
      }
    }

    // Instructions
    prompt += `## INSTRUCTIONS

1. Parcours TOUS les documents fournis
2. Extrait TOUS les faits qui correspondent a une cle canonique
3. Pour chaque fait, calcule la confidence selon les regles
4. N'extrait QUE les faits avec confidence >= 70
5. Detecte les contradictions avec les faits existants
6. Note ce qui n'a pas pu etre extrait dans extractionNotes
7. Pour les metriques temporelles (ARR, MRR, headcount...), extrait validAt/periodType/periodLabel

## OUTPUT ATTENDU

Produis le JSON avec:
- facts: Liste des faits extraits (avec extractedText obligatoire, et champs temporels si applicable)
- contradictions: Liste des contradictions detectees
- extractionNotes: Ce qui n'a pas pu etre extrait et pourquoi`;

    return prompt;
  }

  private buildFactKeysTaxonomy(): string {
    const categories: Record<string, string[]> = {};

    // Group fact keys by category
    for (const [key, def] of Object.entries(FACT_KEYS)) {
      const cat = def.category;
      if (!categories[cat]) {
        categories[cat] = [];
      }
      let line = `- \`${key}\` (${def.type})`;
      if (def.unit) line += ` [${def.unit}]`;
      if (def.description) line += `: ${def.description}`;
      if (def.enumValues) line += ` | Valeurs: ${def.enumValues.join(", ")}`;
      categories[cat].push(line);
    }

    // Format output
    let output = "";
    for (const [cat, keys] of Object.entries(categories)) {
      output += `\n### ${cat} (${keys.length} cles)\n`;
      output += keys.join("\n") + "\n";
    }

    return output;
  }

  private normalizeResponse(
    data: LLMFactExtractorResponse,
    input: FactExtractorInput,
    startTime: number
  ): FactExtractorOutput {
    // Validate and filter facts
    const validFacts: ExtractedFact[] = [];
    const seenFactKeys = new Set<string>();
    const ignoredFacts: IgnoredFactInfo[] = [];

    if (Array.isArray(data.facts)) {
      for (const fact of data.facts) {
        // Skip if missing required fields
        if (!fact.factKey || !fact.extractedText || fact.sourceConfidence === undefined) {
          ignoredFacts.push({
            factKey: fact.factKey || 'unknown',
            reason: 'Missing required fields (factKey, extractedText, or sourceConfidence)',
          });
          continue;
        }

        // Skip if confidence too low
        if (fact.sourceConfidence < 70) {
          ignoredFacts.push({
            factKey: fact.factKey,
            reason: `Confidence too low: ${fact.sourceConfidence}% (minimum: 70%)`,
          });
          continue;
        }

        // Validate fact key exists
        const factKeyDef = getFactKeyDefinition(fact.factKey);
        if (!factKeyDef) {
          ignoredFacts.push({
            factKey: fact.factKey,
            reason: 'Unknown factKey not in taxonomy',
          });
          continue;
        }

        // Validate category matches
        const category = fact.category || factKeyDef.category;
        if (category !== factKeyDef.category) {
          // Auto-correct category
        }

        // Skip duplicates (keep highest confidence)
        if (seenFactKeys.has(fact.factKey)) {
          const existingIdx = validFacts.findIndex(f => f.factKey === fact.factKey);
          if (existingIdx >= 0 && validFacts[existingIdx].sourceConfidence < fact.sourceConfidence) {
            validFacts.splice(existingIdx, 1);
          } else {
            continue;
          }
        }
        seenFactKeys.add(fact.factKey);

        // Map source document - CRITICAL: LLM may return incorrect sourceDocumentId
        // We need to find the actual document by ID, or fallback to matching by type
        let sourceDoc = input.documents.find(d => d.id === fact.sourceDocumentId);

        // If LLM returned an invalid ID (e.g. "doc-pitch-deck" from examples), try to match by type
        if (!sourceDoc && fact.sourceDocumentId) {
          // Extract type hint from LLM's fake ID (e.g. "doc-pitch-deck" -> "PITCH_DECK")
          const typeHint = fact.sourceDocumentId.toUpperCase().replace(/^DOC[-_]?/, '').replace(/-/g, '_');
          sourceDoc = input.documents.find(d => d.type === typeHint);

          // If still no match, use the first document of the inferred source type
          if (!sourceDoc) {
            const inferredType = typeHint.includes('FINANCIAL') ? 'FINANCIAL_MODEL' :
                                 typeHint.includes('DATA') ? 'DATA_ROOM' :
                                 typeHint.includes('PITCH') ? 'PITCH_DECK' : null;
            if (inferredType) {
              sourceDoc = input.documents.find(d => d.type === inferredType);
            }
          }

          // Last resort: use the first document
          if (!sourceDoc && input.documents.length > 0) {
            sourceDoc = input.documents[0];
          }

          if (sourceDoc) {
            console.warn(
              `[FactExtractor] Corrected invalid sourceDocumentId "${fact.sourceDocumentId}" → "${sourceDoc.id}" for fact ${fact.factKey}`
            );
          }
        }

        // Determine the actual sourceDocumentId to use (must be a valid document ID)
        const validSourceDocumentId = sourceDoc?.id ?? input.documents[0]?.id;

        // Skip this fact if we can't determine a valid document ID
        if (!validSourceDocumentId) {
          ignoredFacts.push({
            factKey: fact.factKey,
            reason: `Could not determine valid sourceDocumentId (LLM returned: ${fact.sourceDocumentId})`,
          });
          continue;
        }

        // Determine source type from actual document
        let source: FactSource = "PITCH_DECK";
        if (sourceDoc) {
          switch (sourceDoc.type) {
            case "PITCH_DECK":
              source = "PITCH_DECK";
              break;
            case "DATA_ROOM":
              source = "DATA_ROOM";
              break;
            case "FINANCIAL_MODEL":
              source = "FINANCIAL_MODEL";
              break;
            default:
              source = "PITCH_DECK";
          }
        }

        // Build reliability classification
        const reliabilityLevel = this.normalizeReliability(fact.reliability);
        const isProjection = fact.isProjection === true || reliabilityLevel === 'PROJECTED';

        validFacts.push({
          factKey: fact.factKey,
          category: factKeyDef.category,
          value: fact.value,
          displayValue: fact.displayValue || String(fact.value),
          unit: fact.unit || factKeyDef.unit,
          source,
          sourceDocumentId: validSourceDocumentId, // Use validated ID, not LLM's potentially fake ID
          sourceConfidence: Math.min(100, Math.max(70, fact.sourceConfidence)),
          extractedText: fact.extractedText,
          validAt: fact.validAt ? new Date(fact.validAt) : undefined,
          periodType: fact.periodType,
          periodLabel: fact.periodLabel,
          reliability: {
            reliability: reliabilityLevel,
            reasoning: fact.reliabilityReasoning || `Source: ${source}, classification automatique`,
            isProjection,
            temporalAnalysis: (fact.documentDate || fact.dataPeriodEnd) ? {
              documentDate: fact.documentDate,
              dataPeriodEnd: fact.dataPeriodEnd,
              projectionPercent: fact.projectionPercent,
              monthsOfProjection: fact.projectionPercent != null && fact.periodType === 'YEAR'
                ? Math.round((fact.projectionPercent / 100) * 12)
                : undefined,
            } : undefined,
          },
        });
      }
    }

    // Log ignored facts for debugging
    if (ignoredFacts.length > 0) {
      console.warn(
        `[FactExtractor] ${ignoredFacts.length} facts ignored:`,
        ignoredFacts.map(f => `${f.factKey}: ${f.reason}`).join('; ')
      );
    }

    // Validate contradictions
    const validContradictions: ContradictionInfo[] = [];

    if (Array.isArray(data.contradictions)) {
      for (const contradiction of data.contradictions) {
        if (!contradiction.factKey || contradiction.newValue === undefined) {
          continue;
        }

        // Validate significance
        const validSignificances = ["MINOR", "SIGNIFICANT", "MAJOR"] as const;
        const significance = validSignificances.includes(contradiction.significance as typeof validSignificances[number])
          ? contradiction.significance
          : "SIGNIFICANT";

        // Map source types
        const validSources: FactSource[] = ["DATA_ROOM", "FINANCIAL_MODEL", "FOUNDER_RESPONSE", "PITCH_DECK", "CONTEXT_ENGINE", "BA_OVERRIDE"];
        const newSource = validSources.includes(contradiction.newSource as FactSource)
          ? contradiction.newSource
          : "PITCH_DECK";
        const existingSource = validSources.includes(contradiction.existingSource as FactSource)
          ? contradiction.existingSource
          : "PITCH_DECK";

        validContradictions.push({
          factKey: contradiction.factKey,
          newValue: contradiction.newValue,
          existingValue: contradiction.existingValue,
          newSource,
          existingSource,
          deltaPercent: contradiction.deltaPercent,
          significance,
        });
      }
    }

    // Calculate metadata
    const averageConfidence = validFacts.length > 0
      ? validFacts.reduce((sum, f) => sum + f.sourceConfidence, 0) / validFacts.length
      : 0;

    const uniqueFactKeys = new Set(validFacts.map(f => f.factKey));

    // Log reliability stats
    const projectedFacts = validFacts.filter(f => f.reliability?.isProjection);
    const declaredFacts = validFacts.filter(f => f.reliability?.reliability === 'DECLARED');

    if (projectedFacts.length > 0) {
      console.warn(
        `[FactExtractor] ${projectedFacts.length} facts classified as PROJECTED: ${projectedFacts.map(f => f.factKey).join(', ')}`
      );
    }
    if (declaredFacts.length > 0) {
      console.info(
        `[FactExtractor] ${declaredFacts.length} facts classified as DECLARED (unverified): ${declaredFacts.map(f => f.factKey).join(', ')}`
      );
    }

    return {
      facts: validFacts,
      contradictions: validContradictions,
      metadata: {
        factsExtracted: validFacts.length,
        contradictionsDetected: validContradictions.length,
        averageConfidence: Math.round(averageConfidence * 10) / 10,
        processingTimeMs: Date.now() - startTime,
        documentsCovered: input.documents.length,
        factKeysCovered: uniqueFactKeys.size,
        factsIgnored: ignoredFacts.length,
        ignoredDetails: ignoredFacts,
      },
    };
  }

  /** Normalize reliability string from LLM to valid DataReliability */
  private normalizeReliability(value: string | undefined): import('@/services/fact-store/types').DataReliability {
    const valid = ['AUDITED', 'VERIFIED', 'DECLARED', 'PROJECTED', 'ESTIMATED', 'UNVERIFIABLE'] as const;
    const upper = (value || '').toUpperCase().trim();
    if (valid.includes(upper as typeof valid[number])) {
      return upper as typeof valid[number];
    }
    // Default: if we can't classify, assume DECLARED (stated without proof)
    return 'DECLARED';
  }
}

// Export singleton instance
export const factExtractorAgent = new FactExtractorAgent();
