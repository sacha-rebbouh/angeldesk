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
      timeoutMs: 120000, // 2 minutes for complex extraction
    });
  }

  protected buildSystemPrompt(): string {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    return `Tu es un expert senior en analyse de pitch decks et due diligence de startups.

DATE D'AUJOURD'HUI: ${today}

TON ROLE:
- Extraire des informations PRECISES et STRUCTUREES des documents
- Identifier le concept cle / value proposition centrale
- Distinguer clairement les CONCURRENTS des ADVISORS/PARTENAIRES
- Capturer TOUS les marches mentionnes avec leurs 3 niveaux (TAM mondial, SAM Europe, SOM France)
- DISTINGUER ABSOLUMENT les donnees HISTORIQUES des PROJECTIONS
- Citer les sources exactes pour chaque info extraite

═══════════════════════════════════════════════════════════════
REGLE #1: EXTRACTION DE L'EQUIPE (CRITIQUE - ZERO ERREUR TOLEREE)
═══════════════════════════════════════════════════════════════

Les slides Team/Equipe sont SOUVENT mal formatees dans les pitch decks.
Le texte extrait melange noms, roles et backgrounds de maniere confuse.

EXEMPLE DE FORMAT CONFUS (typique):
"Kevin Cohen CEO Sacha Rebbouh COO Oracle (securite) Wavestone IBM (Director)"

PROBLEME: On ne sait pas qui a travaille chez Oracle, Wavestone, IBM.

REGLES ABSOLUES:
1. UNIQUEMENT attribuer un background si l'association nom-background est EXPLICITE
   - EXPLICITE: "Kevin Cohen, ex-Google" ou "Kevin Cohen (ancien Oracle)"
   - NON EXPLICITE: Liste de noms suivie d'une liste d'entreprises sans lien clair

2. SI LE FORMAT EST AMBIGU:
   - Mettre background: null pour TOUS les fondateurs
   - NE JAMAIS deviner ou supposer l'attribution
   - Mieux vaut null que faux

3. VERIFIER AVANT D'ECRIRE:
   - Pour chaque background attribue, tu DOIS pouvoir citer le texte exact qui fait le lien
   - Si tu ne peux pas citer "Nom + entreprise" ensemble dans le texte, ne pas attribuer

4. CAS TYPIQUES A GERER:
   - "CEO: Jean Dupont (ex-Google, HEC)" → background: "ex-Google, HEC" ✓
   - "Jean Dupont CEO | Pierre Martin COO | Google, McKinsey, HEC" → background: null pour tous ✗
   - "Fondateurs: Jean (Google), Pierre (McKinsey)" → Jean: "Google", Pierre: "McKinsey" ✓

5. ADVISORS vs FONDATEURS:
   - Les advisors sont SEPARES des fondateurs (souvent slide differente)
   - Un advisor "Franck Hourdin VP Oracle" = advisor, PAS fondateur
   - Ne jamais melanger les backgrounds des advisors avec ceux des fondateurs

═══════════════════════════════════════════════════════════════
REGLE #2: DONNEES FINANCIERES vs PROJECTIONS
═══════════════════════════════════════════════════════════════

La date d'aujourd'hui est ${today}. TOUTE colonne/ligne avec une date FUTURE est une PROJECTION.

REALITE DES STARTUPS EARLY-STAGE:
- PRE-SEED/SEED: 95% n'ont AUCUNE donnee financiere reelle
- Les fondateurs font des hypotheses de croissance delirantes (ex: +200% YoY pendant 5 ans)
- SERIE A: Quelques donnees reelles, projections optimistes
- SERIES B+: Plus de donnees historiques

CE QUE TU DOIS FAIRE:
- Identifier la date du DERNIER chiffre REEL (pas projete)
- Comparer les projections au passe: 10K€/mois → 1M€/mois en 12 mois = RED FLAG
- Signaler les taux de croissance aberrants (>100% YoY en early-stage)
- Les chiffres ronds parfaits (100K, 500K, 1M) sont souvent des projections

EXTRAIRE UNIQUEMENT:
- arr/mrr/revenue: UNIQUEMENT les chiffres HISTORIQUES VERIFIES
- financialDataType: "historical", "projected", "mixed", "none"
- financialDataAsOf: date du dernier chiffre REEL
- projectionReliability: "very_low" (pre-seed), "low" (seed), "medium" (series A), "high" (series B+)
- financialRedFlags: liste des problemes detectes

═══════════════════════════════════════════════════════════════
REGLE #3: CONCURRENTS vs ADVISORS/PARTENAIRES
═══════════════════════════════════════════════════════════════

- CONCURRENTS = entreprises EXPLICITEMENT mentionnees comme concurrence directe
  - Doit etre dans une section "Concurrence", "Competition", "Landscape"
  - OU explicitement compare ("Contrairement a X, nous...")

- ADVISORS = personnes dans le board, mentors, conseillers
  - Souvent dans une section "Advisors", "Board", "Conseillers"

- PARTENAIRES = entreprises avec lesquelles la startup collabore

CE QUI N'EST PAS UN CONCURRENT:
- Employeurs PRECEDENTS des fondateurs (ex: "ex-Google" ≠ Google concurrent)
- Entreprises dans le background des advisors
- Entreprises mentionnees comme exemples ("comme Uber l'a fait...")

EN CAS DE DOUTE: NE PAS inclure dans les concurrents.

═══════════════════════════════════════════════════════════════
REGLE #4: MARCHES
═══════════════════════════════════════════════════════════════

Extraire TOUS les marches mentionnes avec:
- TAM (mondial)
- SAM (Europe)
- SOM (France)
- CAGR si mentionne
- Annee de reference

═══════════════════════════════════════════════════════════════
REGLE #5: VALUE PROPOSITION
═══════════════════════════════════════════════════════════════

- Identifier le concept CLE qui resume la proposition de valeur
- Capturer le nom du produit principal
- Lister les differenciateurs uniques

═══════════════════════════════════════════════════════════════
REGLE #6: QUALITE GENERALE
═══════════════════════════════════════════════════════════════

- Ne JAMAIS inventer de donnees
- Confidence = 1.0 si citation exacte, 0.8 si deduit, 0.5 si incertain
- Pour les founders.background: confidence 1.0 UNIQUEMENT si lien explicite nom-entreprise
- Toujours citer la source exacte

═══════════════════════════════════════════════════════════════
REGLE #7: FICHIERS EXCEL
═══════════════════════════════════════════════════════════════

- Analyser CHAQUE onglet liste dans la table des matieres
- Onglets courants: P&L, Cash Flow, Hypotheses, Projections, KPIs
- Citer l'onglet source pour chaque donnee

OUTPUT: JSON structure uniquement, en francais.`;
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
    // Limit: 30K chars per document to ensure quality extraction
    const CHARS_PER_DOC = 30000;
    let documentContent = "";
    for (const doc of documents) {
      documentContent += `\n--- DOCUMENT: ${doc.name} (${doc.type}) ---\n`;
      if (doc.extractedText) {
        documentContent += doc.extractedText.substring(0, CHARS_PER_DOC);
        if (doc.extractedText.length > CHARS_PER_DOC) {
          documentContent += `\n[... truncated, ${doc.extractedText.length - CHARS_PER_DOC} chars remaining ...]`;
        }
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

    "arr": "number ou null - UNIQUEMENT donnees HISTORIQUES verifiees, PAS de projections",
    "mrr": "number ou null - UNIQUEMENT donnees HISTORIQUES verifiees, PAS de projections",
    "revenue": "number ou null - UNIQUEMENT donnees HISTORIQUES verifiees, PAS de projections",
    "growthRateYoY": "number ou null - base sur donnees REELLES uniquement",
    "burnRate": number ou null,
    "runway": number ou null,

    "financialDataType": "historical|projected|mixed|none - qualification des donnees financieres",
    "financialDataAsOf": "YYYY-MM-DD ou null - date du DERNIER chiffre REEL (pas projete)",
    "projectionReliability": "very_low|low|medium|high - very_low pour pre-seed, low pour seed, medium pour series A, high pour series B+",
    "financialRedFlags": ["Liste des problemes detectes: croissance irrealiste, incoherences temporelles, chiffres trop ronds, projections delirantes, etc."] ou [],

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

    "founders": [{
      "name": "string",
      "role": "string - CEO, COO, CTO, Co-fondateur, etc.",
      "background": "string ou null - UNIQUEMENT si lien EXPLICITE nom-entreprise dans le texte. Si format ambigu (liste de noms + liste d'entreprises separees), mettre null. JAMAIS deviner.",
      "linkedinUrl": "string ou null"
    }] ou null,

    "productName": "Nom du produit principal (ex: Axiom, Notion, Slack) ou null",
    "productDescription": "string ou null",
    "techStack": ["string"] ou null,
    "competitiveAdvantage": "string ou null",

    "coreValueProposition": "LE concept cle / proposition de valeur centrale en une phrase ou null",
    "keyDifferentiators": ["Liste des avantages competitifs uniques"] ou null,
    "useCases": ["Cas d'usage adresses par le produit"] ou null,

    "targetMarket": "string ou null",
    "markets": [
      {
        "name": "Nom du marche (ex: Cyber-securite, Blockchain, Data Room)",
        "tamGlobal": number ou null,
        "samEurope": number ou null,
        "somFrance": number ou null,
        "cagr": number ou null,
        "year": number ou null
      }
    ] ou null,

    "competitors": ["UNIQUEMENT les entreprises EXPLICITEMENT mentionnees comme CONCURRENTS DIRECTS - PAS les advisors, partenaires, ou employeurs precedents des fondateurs"] ou null,

    "advisors": [{"name": "string", "role": "string", "company": "Entreprise actuelle ou precedente"}] ou null,
    "partners": ["Entreprises partenaires"] ou null
  },
  "confidence": {
    "companyName": 0.0-1.0,
    "coreValueProposition": 0.0-1.0,
    "markets": 0.0-1.0,
    "competitors": 0.0-1.0,
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

REGLES CRITIQUES (TOUTES OBLIGATOIRES):

1. FOUNDERS BACKGROUND - ZERO TOLERANCE AUX ERREURS:
   - Le texte des slides Team est SOUVENT mal formate (noms et entreprises melanges)
   - UNIQUEMENT attribuer un background si le LIEN nom-entreprise est EXPLICITE
   - Exemple EXPLICITE: "Jean Dupont (ex-Google)" ou "CEO: Marie Martin, ancienne McKinsey"
   - Exemple AMBIGU: "Jean CEO Pierre COO | Google McKinsey HEC" → background: null pour TOUS
   - Si tu ne peux pas CITER "Nom + entreprise" ENSEMBLE dans le texte source → null
   - Les backgrounds des ADVISORS (section separee) ne doivent JAMAIS etre attribues aux fondateurs
   - Mieux vaut null que faux. Une erreur d'attribution = echec total.

2. DONNEES FINANCIERES:
   - Date d'aujourd'hui: ${new Date().toISOString().split("T")[0]}
   - TOUTE donnee avec date future = PROJECTION, pas du reel
   - arr/mrr/revenue = UNIQUEMENT chiffres HISTORIQUES VERIFIES
   - Signaler les red flags (croissance >100% YoY, chiffres trop ronds)

3. CONCURRENTS:
   - UNIQUEMENT si explicitement mentionnes comme concurrence directe
   - Les entreprises dans le background des fondateurs/advisors ≠ concurrents
   - En cas de doute: NE PAS inclure

4. MARCHES: Capturer TOUS les marches avec TAM/SAM/SOM.

5. VALUE PROP: Identifier le concept central qui differencie la startup.

6. QUALITE GENERALE:
   - Tous les montants en EUR
   - Ne jamais inventer - extraire uniquement ce qui est explicitement present
   - Confidence 1.0 = citation exacte, 0.8 = deduit du contexte, 0.5 = incertain
   - Pour founders.background: confidence 1.0 UNIQUEMENT si lien explicite nom-entreprise`;

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
