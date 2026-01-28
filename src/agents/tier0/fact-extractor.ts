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

Produis un JSON avec cette structure exacte:

\`\`\`json
{
  "facts": [
    {
      "factKey": "financial.arr",
      "category": "FINANCIAL",
      "value": 500000,
      "displayValue": "500K EUR",
      "unit": "EUR",
      "sourceDocumentId": "doc-pitch-deck",
      "sourceConfidence": 95,
      "extractedText": "[Source: Pitch Deck, Slide 8] Notre ARR atteint 500K EUR a fin Q4 2024"
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

# EXEMPLES

## BON - Extraction avec haute confidence
{
  "factKey": "financial.mrr",
  "category": "FINANCIAL",
  "value": 42000,
  "displayValue": "42K EUR",
  "unit": "EUR",
  "sourceDocumentId": "doc-financial-model",
  "sourceConfidence": 98,
  "extractedText": "[Source: Financial Model, Onglet Dashboard] MRR Dec 2024: 42,000 EUR"
}

## BON - Extraction calculee
{
  "factKey": "financial.arr",
  "category": "FINANCIAL",
  "value": 504000,
  "displayValue": "504K EUR (calcule)",
  "unit": "EUR",
  "sourceDocumentId": "doc-financial-model",
  "sourceConfidence": 90,
  "extractedText": "[Source: Financial Model, Onglet Dashboard] MRR Dec 2024: 42,000 EUR. ARR calcule = MRR x 12 = 504K EUR"
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
   */
  private getFounderResponsesFromContext(_context: AgentContext): FounderResponse[] {
    // TODO: Implement when founder Q&A is integrated
    // This would come from a questionnaire system or previous agent results
    return [];
  }

  private buildUserPrompt(input: FactExtractorInput): string {
    let prompt = `# EXTRACTION DE FAITS - ANALYSE DES DOCUMENTS\n\n`;

    // Add documents
    prompt += `## DOCUMENTS A ANALYSER (${input.documents.length})\n\n`;
    for (const doc of input.documents) {
      prompt += `### Document: ${doc.name} (ID: ${doc.id}, Type: ${doc.type})\n`;
      // Limit content to avoid token overflow
      const maxChars = doc.type === "FINANCIAL_MODEL" ? 80000 : 30000;
      const content = doc.content.length > maxChars
        ? doc.content.substring(0, maxChars) + `\n[... tronque, ${doc.content.length - maxChars} caracteres restants ...]`
        : doc.content;
      prompt += `\`\`\`\n${content}\n\`\`\`\n\n`;
    }

    // Add existing facts for contradiction detection
    if (input.existingFacts && input.existingFacts.length > 0) {
      prompt += `## FAITS EXISTANTS (pour detection de contradictions)\n\n`;
      for (const fact of input.existingFacts) {
        prompt += `- ${fact.factKey}: ${fact.currentDisplayValue} (source: ${fact.currentSource}, confidence: ${fact.currentConfidence})\n`;
      }
      prompt += `\n`;
    }

    // Add founder responses if any
    if (input.founderResponses && input.founderResponses.length > 0) {
      prompt += `## REPONSES DU FONDATEUR\n\n`;
      for (const response of input.founderResponses) {
        prompt += `**Q: ${response.question}**\n`;
        prompt += `A: ${response.answer}\n`;
        prompt += `(Categorie: ${response.category})\n\n`;
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

## OUTPUT ATTENDU

Produis le JSON avec:
- facts: Liste des faits extraits (avec extractedText obligatoire)
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

    if (Array.isArray(data.facts)) {
      for (const fact of data.facts) {
        // Skip if missing required fields
        if (!fact.factKey || !fact.extractedText || fact.sourceConfidence === undefined) {
          continue;
        }

        // Skip if confidence too low
        if (fact.sourceConfidence < 70) {
          continue;
        }

        // Validate fact key exists
        const factKeyDef = getFactKeyDefinition(fact.factKey);
        if (!factKeyDef) {
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

        // Map source document type
        const sourceDoc = input.documents.find(d => d.id === fact.sourceDocumentId);
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

        validFacts.push({
          factKey: fact.factKey,
          category: factKeyDef.category,
          value: fact.value,
          displayValue: fact.displayValue || String(fact.value),
          unit: fact.unit || factKeyDef.unit,
          source,
          sourceDocumentId: fact.sourceDocumentId,
          sourceConfidence: Math.min(100, Math.max(70, fact.sourceConfidence)),
          extractedText: fact.extractedText,
        });
      }
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
      },
    };
  }
}

// Export singleton instance
export const factExtractorAgent = new FactExtractorAgent();
