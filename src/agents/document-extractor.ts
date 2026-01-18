import { BaseAgent } from "./base-agent";
import type { AgentContext, ExtractionResult, ExtractedDealInfo } from "./types";

interface ExtractionData {
  extractedInfo: ExtractedDealInfo;
  confidence: Partial<Record<keyof ExtractedDealInfo, number>>;
  sourceReferences: {
    field: string;
    quote: string;
    documentName: string;
  }[];
}

export class DocumentExtractorAgent extends BaseAgent<ExtractionData, ExtractionResult> {
  constructor() {
    super({
      name: "document-extractor",
      description: "Extracts structured information from pitch decks and documents",
      modelComplexity: "complex",
      maxRetries: 2,
      timeoutMs: 90000,
    });
  }

  protected buildSystemPrompt(): string {
    return `Tu es un expert en analyse de pitch decks et documents de startups.

TON ROLE:
- Extraire des informations structurees des documents
- Identifier les metriques cles, infos equipe, marche, produit
- Citer les sources exactes pour chaque info extraite
- Donner un score de confiance pour chaque champ

CHAMPS A EXTRAIRE:
1. COMPANY: nom, tagline, secteur, stade, geographie, annee creation, taille equipe
2. FINANCIALS: ARR, MRR, revenue, croissance YoY, burn rate, runway
3. FUNDRAISING: montant leve, valo pre/post, rounds precedents, investisseurs
4. TRACTION: clients, users, NRR, churn, CAC, LTV
5. TEAM: fondateurs (nom, role, background, LinkedIn)
6. PRODUCT: description, tech stack, avantage competitif
7. MARKET: marche cible, TAM, SAM, SOM, concurrents

REGLES:
- Ne jamais inventer de donnees - extraire uniquement ce qui est present
- Confidence = 1.0 si citation exacte, 0.8 si deduit, 0.5 si incertain
- Toujours citer la source (nom du document + quote)
- Si une info n'est pas trouvee, ne pas l'inclure

OUTPUT: JSON structure uniquement.`;
  }

  protected async execute(context: AgentContext): Promise<ExtractionData> {
    const { documents } = context;

    // Check if we have documents to extract from
    if (!documents || documents.length === 0) {
      return {
        extractedInfo: {},
        confidence: {},
        sourceReferences: [],
      };
    }

    // Build document content for the prompt
    let documentContent = "";
    for (const doc of documents) {
      documentContent += `\n--- DOCUMENT: ${doc.name} (${doc.type}) ---\n`;
      if (doc.extractedText) {
        documentContent += doc.extractedText.substring(0, 15000);
      } else {
        documentContent += "(Contenu non disponible)";
      }
      documentContent += "\n";
    }

    const prompt = `Analyse ces documents et extrais les informations structurees:

${documentContent}

Reponds en JSON avec cette structure exacte:
\`\`\`json
{
  "extractedInfo": {
    "companyName": "string ou null",
    "tagline": "string ou null",
    "sector": "string ou null",
    "stage": "PRE_SEED|SEED|SERIES_A|SERIES_B|SERIES_C|LATER ou null",
    "geography": "string ou null",
    "foundedYear": number ou null,
    "teamSize": number ou null,
    "arr": number ou null,
    "mrr": number ou null,
    "revenue": number ou null,
    "growthRateYoY": number ou null,
    "burnRate": number ou null,
    "runway": number ou null,
    "amountRaising": number ou null,
    "valuationPre": number ou null,
    "valuationPost": number ou null,
    "previousRounds": [{"date": "string", "amount": number, "valuation": number, "investors": ["string"]}] ou null,
    "customers": number ou null,
    "users": number ou null,
    "nrr": number ou null,
    "churnRate": number ou null,
    "cac": number ou null,
    "ltv": number ou null,
    "founders": [{"name": "string", "role": "string", "background": "string", "linkedinUrl": "string"}] ou null,
    "productDescription": "string ou null",
    "techStack": ["string"] ou null,
    "competitiveAdvantage": "string ou null",
    "targetMarket": "string ou null",
    "tam": number ou null,
    "sam": number ou null,
    "som": number ou null,
    "competitors": ["string"] ou null
  },
  "confidence": {
    "companyName": 0.0-1.0,
    ...
  },
  "sourceReferences": [
    {
      "field": "nom du champ",
      "quote": "citation exacte du document",
      "documentName": "nom du document source"
    }
  ]
}
\`\`\`

IMPORTANT:
- N'inclus que les champs trouves dans les documents
- Tous les montants en EUR
- Confidence 1.0 = citation exacte, 0.8 = deduit, 0.5 = incertain`;

    const { data } = await this.llmCompleteJSON<ExtractionData>(prompt);

    return {
      extractedInfo: data.extractedInfo ?? {},
      confidence: data.confidence ?? {},
      sourceReferences: Array.isArray(data.sourceReferences) ? data.sourceReferences : [],
    };
  }
}

// Export singleton instance
export const documentExtractor = new DocumentExtractorAgent();
