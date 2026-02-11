# Wave 3 - M3 : Analyse Enhancements

**Agent** : M3 - Analyse Enhancements
**Date** : 2026-02-11
**Failles** : F62, F63, F70, F71, F74, F75, F76, F77, F78, F79
**Statut** : Spec de correction detaillee

---

## F62 -- Document recent "fait foi"

### Probleme
Un fondateur peut uploader des addendums de plus en plus propres pour "eclipser" les documents anterieurs. Le systeme ne conserve pas l'historique versionne des documents et ne compare pas les versions entre elles. Le document-extractor et les agents d'analyse ne recoivent que le texte extrait le plus recent sans notion de versions precedentes.

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/app/api/documents/upload/route.ts`
- Lignes 114-127 : Le document est cree en base avec `prisma.document.create()` sans reference a un eventuel document precedent du meme type.
- Pas de champ `version`, `parentDocumentId`, ou `supersedes` dans le schema Prisma.

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/prisma/schema.prisma`
- Lignes 116-146 : Le modele `Document` n'a aucun champ de versionnage. Chaque upload est un document independant.

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/agents/base-agent.ts`
- Lignes 703+ : `formatContextEngineData()` ne distingue pas entre versions de documents. Tous les documents sont traites de maniere equivalente.

### Correction

#### 1. Migration Prisma -- Ajouter le versionnage

```prisma
// prisma/schema.prisma - model Document
model Document {
  // ... champs existants ...

  // Versionnage
  version            Int       @default(1)
  parentDocumentId   String?   // ID du document qu'il remplace
  parentDocument     Document? @relation("DocumentVersions", fields: [parentDocumentId], references: [id])
  childDocuments     Document[] @relation("DocumentVersions")
  supersededAt       DateTime? // Date a laquelle ce document a ete remplace
  isLatest           Boolean   @default(true)

  @@index([dealId, type, isLatest])
}
```

#### 2. Route upload -- Detecter les re-uploads

```typescript
// src/app/api/documents/upload/route.ts
// Apres la verification du deal (ligne ~65), ajouter :

// Detecter si un document du meme type existe deja pour ce deal
const existingDoc = await prisma.document.findFirst({
  where: {
    dealId,
    type: documentType ?? "OTHER",
    isLatest: true,
  },
  orderBy: { uploadedAt: "desc" },
});

let version = 1;
let parentDocumentId: string | null = null;
let reUploadWarning: string | null = null;

if (existingDoc) {
  version = (existingDoc.version ?? 1) + 1;
  parentDocumentId = existingDoc.id;
  reUploadWarning = `Ce document remplace une version precedente (v${existingDoc.version}, uploadee le ${existingDoc.uploadedAt.toISOString().slice(0, 10)}). Les deux versions seront conservees et comparees.`;

  // Marquer l'ancien document comme non-latest
  await prisma.document.update({
    where: { id: existingDoc.id },
    data: {
      isLatest: false,
      supersededAt: new Date(),
    },
  });
}

// Dans prisma.document.create(), ajouter :
const document = await prisma.document.create({
  data: {
    // ... champs existants ...
    version,
    parentDocumentId,
    isLatest: true,
  },
});
```

#### 3. Service de comparaison de documents

```typescript
// src/services/document-versioning.ts
export interface DocumentDiff {
  addedSections: string[];
  removedSections: string[];
  modifiedSections: { section: string; before: string; after: string }[];
  significantChanges: {
    description: string;
    severity: "INFO" | "WARNING" | "SUSPICIOUS";
    detail: string;
  }[];
}

/**
 * Compare deux versions d'un document pour detecter les changements significatifs.
 * Alerte si des informations defavorables ont ete retirees.
 */
export async function compareDocumentVersions(
  currentText: string,
  previousText: string,
  documentType: string
): Promise<DocumentDiff> {
  // Decouper en sections/paragraphes
  const currentSections = splitIntoSections(currentText);
  const previousSections = splitIntoSections(previousText);

  const added = currentSections.filter(s => !previousSections.some(p => similarity(s, p) > 0.8));
  const removed = previousSections.filter(s => !currentSections.some(c => similarity(s, c) > 0.8));
  const modified: DocumentDiff["modifiedSections"] = [];

  // Detecter les modifications significatives
  for (const prev of previousSections) {
    const match = currentSections.find(c => similarity(c, prev) > 0.5 && similarity(c, prev) < 0.95);
    if (match) {
      modified.push({ section: prev.slice(0, 100), before: prev, after: match });
    }
  }

  // Identifier les changements suspects
  const significantChanges: DocumentDiff["significantChanges"] = [];

  // Sections retirees contenant des mots-cles sensibles
  const sensitiveKeywords = ["risk", "risque", "churn", "burn", "loss", "perte", "dette", "debt",
    "litigation", "litige", "concurrent", "competitor", "probleme", "issue", "delay", "retard"];

  for (const section of removed) {
    const lower = section.toLowerCase();
    const matchedKeywords = sensitiveKeywords.filter(kw => lower.includes(kw));
    if (matchedKeywords.length > 0) {
      significantChanges.push({
        description: `Section retiree contenant: ${matchedKeywords.join(", ")}`,
        severity: "SUSPICIOUS",
        detail: section.slice(0, 300),
      });
    }
  }

  // Metriques modifiees a la hausse sans explication
  const metricPatterns = /(\d+[,.]?\d*)\s*(%|M€|K€|€|clients?|users?)/gi;
  for (const mod of modified) {
    const beforeMetrics = [...mod.before.matchAll(metricPatterns)];
    const afterMetrics = [...mod.after.matchAll(metricPatterns)];
    if (beforeMetrics.length > 0 && afterMetrics.length > 0) {
      significantChanges.push({
        description: `Metriques modifiees dans la section`,
        severity: "WARNING",
        detail: `Avant: "${mod.before.slice(0, 200)}" → Apres: "${mod.after.slice(0, 200)}"`,
      });
    }
  }

  return { addedSections: added, removedSections: removed, modifiedSections: modified, significantChanges };
}

function splitIntoSections(text: string): string[] {
  return text.split(/\n{2,}/).map(s => s.trim()).filter(s => s.length > 20);
}

function similarity(a: string, b: string): number {
  // Jaccard similarity sur les bigrammes
  const bigramsA = new Set(getBigrams(a.toLowerCase()));
  const bigramsB = new Set(getBigrams(b.toLowerCase()));
  const intersection = new Set([...bigramsA].filter(x => bigramsB.has(x)));
  const union = new Set([...bigramsA, ...bigramsB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function getBigrams(str: string): string[] {
  const result: string[] = [];
  for (let i = 0; i < str.length - 1; i++) {
    result.push(str.slice(i, i + 2));
  }
  return result;
}
```

#### 4. Injection dans les agents

```typescript
// src/agents/base-agent.ts - dans formatDealContext() ou formatContextEngineData()
// Ajouter une section "Historique Documents" si des versions precedentes existent

protected formatDocumentHistory(context: EnrichedAgentContext): string {
  if (!context.documentHistory || context.documentHistory.length === 0) return "";

  let text = "\n## HISTORIQUE DES DOCUMENTS (ATTENTION)\n";
  text += "Des versions precedentes de documents existent pour ce deal.\n";
  text += "Le document le plus recent ne fait PAS automatiquement foi.\n\n";

  for (const entry of context.documentHistory) {
    text += `### ${entry.documentType} - v${entry.currentVersion} (${entry.versions.length} versions)\n`;
    if (entry.diff && entry.diff.significantChanges.length > 0) {
      text += "**CHANGEMENTS SUSPECTS detectes entre versions:**\n";
      for (const change of entry.diff.significantChanges) {
        text += `- [${change.severity}] ${change.description}\n  Detail: ${change.detail}\n`;
      }
    }
    text += "\n";
  }

  return text;
}
```

### Dependances
- F63 (cache 24h exploitable) : les deux failles sont liees a la gestion des documents

### Verification
- Uploader un pitch deck v1 avec un churn de 15%, puis un v2 avec le churn retire
- Verifier que le diff detecte la suppression de la section "churn"
- Verifier que les agents recoivent l'alerte "CHANGEMENT SUSPECT"

---

## F63 -- Cache 24h exploitable

### Probleme
Le Context Engine cache les resultats pendant 10 minutes (in-memory) et persiste les snapshots en DB indefiniment. Il n'y a aucun hash du document a l'upload. Un fondateur pourrait modifier ses documents apres une analyse favorable, et les analyses cachetees seraient reutilisees sans detecter le changement.

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/services/context-engine/index.ts`
- Ligne 86 : `CONTEXT_CACHE_TTL_MS = 10 * 60 * 1000` (10 min pour le context)
- Ligne 297-309 : Cache in-memory sans verification du hash des documents source
- Ligne 319-324 : Snapshot persistant en DB sans reference aux documents originaux

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/app/api/documents/upload/route.ts`
- Lignes 98-127 : Le buffer est lu mais aucun hash (SHA-256) n'est calcule ni stocke

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/prisma/schema.prisma`
- Lignes 116-146 : Pas de champ `contentHash` dans le modele Document

### Correction

#### 1. Migration Prisma -- Ajouter contentHash

```prisma
// prisma/schema.prisma - model Document
model Document {
  // ... champs existants ...
  contentHash    String?   // SHA-256 du contenu brut
  @@index([contentHash])
}
```

#### 2. Hash a l'upload

```typescript
// src/app/api/documents/upload/route.ts
// Apres ligne 100 (const buffer = Buffer.from(arrayBuffer);), ajouter :

import { createHash } from "crypto";

const contentHash = createHash("sha256").update(buffer).digest("hex");

// Verifier si un document identique existe deja
const duplicateDoc = await prisma.document.findFirst({
  where: { dealId, contentHash, isLatest: true },
});

if (duplicateDoc) {
  return NextResponse.json(
    { error: "Ce document est identique a un document deja uploade.", duplicateId: duplicateDoc.id },
    { status: 409 }
  );
}

// Dans prisma.document.create(), ajouter :
const document = await prisma.document.create({
  data: {
    // ... champs existants ...
    contentHash,
  },
});
```

#### 3. Invalidation du cache sur upload

```typescript
// src/app/api/documents/upload/route.ts
// Apres la creation du document, invalider les caches lies au deal :

import { invalidateDealContext } from "@/services/context-engine";

// Invalider le cache Context Engine pour ce deal
invalidateDealContext(dealId);

// Invalider aussi le cache des analyses si necessaire
// (les resultats d'analyse precedents ne sont plus valides)
await prisma.analysisResult.updateMany({
  where: {
    dealId,
    status: "COMPLETED",
  },
  data: {
    // Marquer comme potentiellement obsolete
    // On ne supprime pas mais on flag
    metadata: {
      set: { documentChanged: true, changedAt: new Date().toISOString() },
    },
  },
});
```

#### 4. Warning si re-upload detecte

```typescript
// Ajouter a la reponse de l'upload (avant return NextResponse):
if (existingDoc) {
  // Comparer les hashes
  if (existingDoc.contentHash && existingDoc.contentHash !== contentHash) {
    // Le contenu a change - WARNING
    response.warning = {
      type: "DOCUMENT_MODIFIED",
      message: `Le document "${file.name}" a ete modifie par rapport a la version precedente. Les analyses precedentes ont ete marquees comme potentiellement obsoletes.`,
      previousVersion: existingDoc.version,
      previousUploadDate: existingDoc.uploadedAt.toISOString(),
    };
  }
}
```

### Dependances
- F62 (document recent "fait foi") : correction complementaire

### Verification
- Uploader un document, lancer une analyse, re-uploader un document modifie
- Verifier que le hash est different et que les analyses sont marquees "documentChanged"
- Verifier que le cache Context Engine est invalide
- Verifier qu'un upload identique retourne 409

---

## F70 -- Biais geographique FR du Context Engine

### Probleme
Le Context Engine est tres riche en connecteurs francais (Pappers, Societe.com, BPI France, French Tech, Eldorado, FrenchWeb, Maddyness, incubateurs) mais n'a qu'un seul connecteur UK (Companies House) et les connecteurs US sont limites a des flux RSS (TechCrunch, etc.). Pour un deal UK, US ou allemand, les analyses manquent de profondeur sans avertissement.

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/services/context-engine/index.ts`
- Lignes 91-136 : Liste des connecteurs :
  - **FR** (9) : societeComConnector, pappersConnector, frenchTechConnector, bpiFranceConnector, incubatorsConnector, eldoradoConnector, frenchWebRssConnector, frenchWebApiConnector, maddynessApiConnector
  - **UK** (1) : companiesHouseConnector
  - **US** (1) : usFundingConnector (RSS uniquement)
  - **EU** (3) : euStartupsApiConnector, techEuConnector, seedtableConnector
  - **Global** (6) : fundingDbConnector, rapidapiLinkedInConnector, productHuntConnector, appStoresConnector, githubConnector, newsApiConnector

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/services/context-engine/types.ts`
- Ligne 259 : `geography?: string` dans ConnectorQuery -- le champ existe mais n'est pas utilise pour filtrer ou avertir

### Correction

#### 1. Service de detection geographique et couverture

```typescript
// src/services/context-engine/geography-coverage.ts

export interface GeographyCoverage {
  geography: string;
  coverageLevel: "FULL" | "PARTIAL" | "LIMITED" | "MINIMAL";
  availableConnectors: string[];
  missingCapabilities: string[];
  warning: string | null;
  recommendations: string[];
}

const GEOGRAPHY_CONNECTORS: Record<string, {
  connectors: string[];
  capabilities: string[];
  coverageLevel: GeographyCoverage["coverageLevel"];
}> = {
  FR: {
    connectors: ["pappers", "societe-com", "bpi-france", "french-tech", "eldorado", "frenchweb-api", "maddyness-api", "incubators", "frenchweb-rss"],
    capabilities: ["company_data", "legal_data", "funding_history", "grants", "ecosystem_validation", "news"],
    coverageLevel: "FULL",
  },
  UK: {
    connectors: ["companies-house"],
    capabilities: ["company_data", "filing_history", "officers"],
    coverageLevel: "PARTIAL",
  },
  US: {
    connectors: ["us-funding"],
    capabilities: ["funding_news_rss"],
    coverageLevel: "LIMITED",
  },
  DE: {
    connectors: [],
    capabilities: [],
    coverageLevel: "MINIMAL",
  },
  // Defaut pour les autres geographies
  DEFAULT: {
    connectors: [],
    capabilities: [],
    coverageLevel: "MINIMAL",
  },
};

const ALL_CAPABILITIES = [
  "company_data",       // Donnees legales d'entreprise (SIREN, immatriculation)
  "legal_data",         // Litiges, procedures, brevets
  "funding_history",    // Historique de levees
  "grants",             // Subventions publiques
  "ecosystem_validation", // Labels, incubateurs
  "news",               // Presse specialisee
  "filing_history",     // Comptes deposes
  "officers",           // Dirigeants et mandataires
];

export function detectGeography(deal: {
  geography?: string;
  country?: string;
  companyName?: string;
  sector?: string;
}): string {
  // Essayer de detecter la geographie
  const geo = (deal.geography || deal.country || "").toUpperCase().trim();
  if (geo === "FRANCE" || geo === "FR") return "FR";
  if (geo === "UK" || geo === "GB" || geo === "UNITED KINGDOM" || geo === "ENGLAND") return "UK";
  if (geo === "US" || geo === "USA" || geo === "UNITED STATES") return "US";
  if (geo === "DE" || geo === "GERMANY" || geo === "ALLEMAGNE" || geo === "DEUTSCHLAND") return "DE";
  return geo || "UNKNOWN";
}

export function getGeographyCoverage(geography: string): GeographyCoverage {
  const geo = geography.toUpperCase();
  const config = GEOGRAPHY_CONNECTORS[geo] || GEOGRAPHY_CONNECTORS.DEFAULT;

  const missingCapabilities = ALL_CAPABILITIES.filter(c => !config.capabilities.includes(c));

  let warning: string | null = null;
  const recommendations: string[] = [];

  if (config.coverageLevel === "LIMITED" || config.coverageLevel === "MINIMAL") {
    warning = `ATTENTION: La couverture de donnees pour la geographie "${geography}" est ${config.coverageLevel}. ` +
      `Les sources suivantes ne sont PAS disponibles: ${missingCapabilities.join(", ")}. ` +
      `L'analyse repose principalement sur les documents fournis et les sources globales (news, LinkedIn, GitHub).`;

    if (geo === "US") {
      recommendations.push("Ajouter connecteur SEC EDGAR pour les filings publics");
      recommendations.push("Verifier manuellement sur Crunchbase/PitchBook");
    }
    if (geo === "UK") {
      recommendations.push("Les donnees Companies House sont disponibles mais limitees aux filings legaux");
      recommendations.push("Verifier manuellement sur Beauhurst ou Dealroom");
    }
    if (geo === "DE") {
      recommendations.push("Ajouter connecteur Handelsregister (registre du commerce allemand)");
      recommendations.push("Verifier manuellement sur Startbase.de ou Crunchbase");
    }
  }

  return {
    geography,
    coverageLevel: config.coverageLevel,
    availableConnectors: config.connectors,
    missingCapabilities,
    warning,
    recommendations,
  };
}
```

#### 2. Injection du warning dans le contexte des agents

```typescript
// src/agents/base-agent.ts
// Ajouter dans formatContextEngineData() (apres ligne 707) :

protected formatGeographyCoverage(context: EnrichedAgentContext): string {
  const geography = context.deal.geography || context.deal.country;
  if (!geography) return "";

  // Import dynamique pour eviter les imports circulaires
  const { detectGeography, getGeographyCoverage } = require("@/services/context-engine/geography-coverage");
  const geo = detectGeography(context.deal);
  const coverage = getGeographyCoverage(geo);

  if (!coverage.warning) return "";

  let text = "\n## COUVERTURE GEOGRAPHIQUE - AVERTISSEMENT\n";
  text += `${coverage.warning}\n`;
  text += `\nNiveau de couverture: **${coverage.coverageLevel}**\n`;

  if (coverage.missingCapabilities.length > 0) {
    text += `Donnees manquantes: ${coverage.missingCapabilities.join(", ")}\n`;
  }

  if (coverage.recommendations.length > 0) {
    text += `\nRecommandations:\n`;
    for (const rec of coverage.recommendations) {
      text += `- ${rec}\n`;
    }
  }

  text += `\n**IMPORTANT**: Les affirmations non verifiables via les sources disponibles doivent etre marquees "NON VERIFIE - source limitee pour ${geography}".\n`;

  return text;
}
```

#### 3. Futur : Connecteurs SEC (US) et Handelsregister (DE)

Structure preparee pour les connecteurs futurs :

```typescript
// src/services/context-engine/connectors/sec-edgar.ts (placeholder)
// SEC EDGAR fournit : 10-K, 10-Q, 8-K filings pour les entreprises US enregistrees
// API gratuite : https://efts.sec.gov/LATEST/

// src/services/context-engine/connectors/handelsregister.ts (placeholder)
// Handelsregister.de fournit : registre du commerce allemand
// API : https://www.handelsregister.de/
```

### Dependances
- F79 (legal-regulatory sans acces aux registres) : partage la meme problematique de sources limitees

### Verification
- Creer un deal avec geography="US", lancer l'analyse
- Verifier que le warning "couverture LIMITED" est injecte dans le prompt des agents
- Verifier que les agents marquent les claims non verifies avec la mention appropriee

---

## F71 -- Traction produit non injectee dans les agents

### Probleme
Les connecteurs App Store, GitHub et Product Hunt existent et collectent des donnees de traction, mais ces donnees ne sont PAS systematiquement injectees dans les agents d'analyse pertinents (customer-intel, gtm-analyst). Le `formatContextEngineData()` dans base-agent.ts ne formate pas les donnees de traction produit (pas de section App Store, GitHub, ou Product Hunt).

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/agents/base-agent.ts`
- Lignes 703-850 : `formatContextEngineData()` formate :
  - Deal Intelligence (deals similaires, valorisation)
  - Market Data (benchmarks)
  - Competitive Landscape (concurrents)
  - People Graph (fondateurs)
  - News Sentiment
  - **MANQUANT** : Aucune section pour websiteContent (qui contient traction : clients, temoignages, openPositions, etc.)
  - **MANQUANT** : Aucune section pour les donnees App Store, GitHub, Product Hunt

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/agents/types.ts`
- Lignes 33-42 : `EnrichedAgentContext.contextEngine` ne contient pas de champ `tractionData` ou `websiteContent`
- Le type `DealContext` dans `src/services/context-engine/types.ts` (ligne 221) inclut `websiteContent?: WebsiteContent` mais ce n'est pas mappe dans `EnrichedAgentContext`

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier1/customer-intel.ts`
- Lignes 387-410 : `execute()` ne cherche pas les donnees de traction (App Store, GitHub, Product Hunt)

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier1/gtm-analyst.ts`
- Lignes 441-528 : `execute()` ne cherche pas les donnees de traction

### Correction

#### 1. Etendre EnrichedAgentContext

```typescript
// src/agents/types.ts - dans EnrichedAgentContext (apres ligne 42)
export interface EnrichedAgentContext extends AgentContext {
  contextEngine?: {
    dealIntelligence?: DealIntelligence;
    marketData?: MarketData;
    competitiveLandscape?: CompetitiveLandscape;
    newsSentiment?: NewsSentiment;
    peopleGraph?: PeopleGraph;
    enrichedAt?: string;
    completeness?: number;
    // NOUVEAU : Donnees de traction produit
    websiteContent?: WebsiteContent;
    tractionData?: {
      appStore?: {
        rating: number;
        reviewCount: number;
        downloads?: string;
        lastUpdate?: string;
        topComplaints?: string[];
      };
      googlePlay?: {
        rating: number;
        reviewCount: number;
        downloads?: string;
        lastUpdate?: string;
      };
      github?: {
        stars: number;
        forks: number;
        contributors: number;
        lastCommit?: string;
        openIssues?: number;
        language?: string;
      };
      productHunt?: {
        upvotes: number;
        rank?: number;
        launchDate?: string;
        comments?: number;
      };
    };
  };
  // ... reste inchange
};
```

#### 2. Formatter les donnees de traction dans base-agent

```typescript
// src/agents/base-agent.ts - ajouter apres la section News Sentiment dans formatContextEngineData()

// Traction Data (App Store, GitHub, Product Hunt)
if (contextEngine.tractionData) {
  const td = contextEngine.tractionData;
  text += "\n### Signaux de Traction Produit\n";

  if (td.appStore) {
    text += `\n**App Store iOS:**\n`;
    text += `- Rating: ${td.appStore.rating}/5 (${td.appStore.reviewCount} avis)\n`;
    if (td.appStore.downloads) text += `- Telechargements: ${td.appStore.downloads}\n`;
    if (td.appStore.lastUpdate) text += `- Derniere mise a jour: ${td.appStore.lastUpdate}\n`;
    if (td.appStore.topComplaints && td.appStore.topComplaints.length > 0) {
      text += `- Plaintes frequentes: ${td.appStore.topComplaints.join(", ")}\n`;
    }
  }

  if (td.googlePlay) {
    text += `\n**Google Play:**\n`;
    text += `- Rating: ${td.googlePlay.rating}/5 (${td.googlePlay.reviewCount} avis)\n`;
    if (td.googlePlay.downloads) text += `- Telechargements: ${td.googlePlay.downloads}\n`;
  }

  if (td.github) {
    text += `\n**GitHub:**\n`;
    text += `- Stars: ${td.github.stars} | Forks: ${td.github.forks} | Contributors: ${td.github.contributors}\n`;
    if (td.github.lastCommit) text += `- Dernier commit: ${td.github.lastCommit}\n`;
    if (td.github.openIssues) text += `- Issues ouvertes: ${td.github.openIssues}\n`;
  }

  if (td.productHunt) {
    text += `\n**Product Hunt:**\n`;
    text += `- Upvotes: ${td.productHunt.upvotes}`;
    if (td.productHunt.rank) text += ` (Rank #${td.productHunt.rank})`;
    text += `\n`;
    if (td.productHunt.launchDate) text += `- Date de launch: ${td.productHunt.launchDate}\n`;
  }
}

// Website Content (traction from website)
if (contextEngine.websiteContent?.insights) {
  const wi = contextEngine.websiteContent.insights;
  text += "\n### Donnees du Site Web\n";

  if (wi.clients.length > 0) {
    text += `- Clients mentionnes: ${wi.clients.slice(0, 10).join(", ")}\n`;
  }
  if (wi.clientCount) text += `- Nombre de clients: ${wi.clientCount}\n`;
  if (wi.testimonials.length > 0) {
    text += `- Temoignages: ${wi.testimonials.length} trouves\n`;
    for (const t of wi.testimonials.slice(0, 3)) {
      text += `  > "${t.quote.slice(0, 100)}..." - ${t.author}${t.company ? ` (${t.company})` : ""}\n`;
    }
  }
  if (wi.openPositions > 0) {
    text += `- Postes ouverts: ${wi.openPositions} (departements: ${wi.hiringDepartments.join(", ")})\n`;
  }
  if (wi.hasPricing) {
    text += `- Pricing: ${wi.pricingModel || "disponible"}`;
    if (wi.priceRange) text += ` (${wi.priceRange.min}-${wi.priceRange.max} ${wi.priceRange.currency})`;
    text += `\n`;
  }
}
```

#### 3. Passer les donnees dans l'orchestrateur

L'orchestrateur qui construit l'`EnrichedAgentContext` doit mapper les donnees de traction du `DealContext` vers le context des agents.

### Dependances
- Aucune directe, mais ameliore F75 (detection FOMO sur Product Hunt) et la qualite des analyses customer-intel/gtm-analyst

### Verification
- Analyser un deal avec une app mobile listee sur l'App Store
- Verifier que customer-intel recoit les ratings et avis
- Verifier que gtm-analyst recoit les donnees de traction Product Hunt/GitHub

---

## F74 -- Scenarios sans triggers d'execution specifiques

### Probleme
Le scenario-modeler produit 4 scenarios (BASE, BULL, BEAR, CATASTROPHIC) avec des trajectoires financieres generiques. Les `keyRisks` sont des descriptions textuelles sans triggers specifiques lies aux red flags detectes par les agents Tier 1. Il n'y a pas de lien entre "le CTO part" (red flag team-investigator) et un scenario BEAR.

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier3/scenario-modeler.ts`
- Lignes 47-200 : `LLMScenarioResponse` contient `keyRisks: { risk: string; source: string }[]` mais pas de structure pour des triggers contextuels
- Lignes 554-672 : `extractTier1Insights()` extrait les red flags en comptant le total (`totalRedFlags`, `criticalRedFlags`) mais ne les transmet pas individuellement comme triggers
- Ligne 668 : `insights.push("- Total: ${totalRedFlags} (dont ${criticalRedFlags} CRITICAL)")` -- seul un compteur est passe, pas les red flags eux-memes

### Correction

#### 1. Ajouter les triggers contextuels dans les types

```typescript
// src/agents/tier3/scenario-modeler.ts - dans LLMScenarioResponse.scenarios[]
// Ajouter a cote de keyRisks :

triggers: {
  trigger: string;           // "Le CTO quitte l'entreprise"
  source: string;            // "team-investigator: red flag HIGH - no vesting on CTO"
  impactOnScenario: string;  // "Passe de BASE a BEAR"
  probability: string;       // "MEDIUM - pas de vesting en place"
  mitigations: string[];     // ["Mettre du vesting", "Recruter un VP Engineering"]
}[];
```

#### 2. Modifier extractTier1Insights pour transmettre les red flags individuels

```typescript
// src/agents/tier3/scenario-modeler.ts - remplacer la section red flags (lignes 654-669) par :

// Extraire les red flags individuels comme triggers potentiels
const triggerRedFlags: Array<{ agent: string; severity: string; title: string; description: string }> = [];

for (const [agentName, result] of Object.entries(results)) {
  if (result?.success && "data" in result) {
    const d = result.data as { redFlags?: Array<{ severity?: string; title?: string; description?: string }> };
    if (Array.isArray(d.redFlags)) {
      for (const rf of d.redFlags) {
        if (rf.severity === "CRITICAL" || rf.severity === "HIGH") {
          triggerRedFlags.push({
            agent: agentName,
            severity: rf.severity ?? "HIGH",
            title: rf.title ?? "Unknown",
            description: (rf.description ?? "").slice(0, 200),
          });
        }
      }
    }
  }
}

if (triggerRedFlags.length > 0) {
  insights.push(`### Red Flags comme Triggers de Scenarios`);
  insights.push(`IMPORTANT: Utilise ces red flags comme TRIGGERS SPECIFIQUES dans chaque scenario.\n`);
  for (const rf of triggerRedFlags.slice(0, 10)) {
    insights.push(`- [${rf.severity}] (${rf.agent}) ${rf.title}: ${rf.description}`);
  }
  insights.push(`\nPour chaque scenario, indique quel(s) trigger(s) se materialisent et lesquels non.`);
}
```

#### 3. Modifier le prompt pour exiger des triggers

```typescript
// Dans buildSystemPrompt(), ajouter a la section "FORMAT DE SORTIE" :

// TRIGGERS CONTEXTUELS OBLIGATOIRES:
// Pour chaque scenario, identifie les TRIGGERS SPECIFIQUES:
// - Quels red flags Tier 1 se materialisent dans ce scenario?
// - Quel evenement externe pourrait declencher ce scenario? (concurrent leve 50M, regulation change)
// - Quel evenement interne pourrait declencher ce scenario? (CTO part, pivot force)
// Chaque trigger doit avoir: trigger, source, impactOnScenario, probability, mitigations
```

### Dependances
- F77 (risk framework non coherent) : les triggers doivent utiliser la taxonomie unifiee

### Verification
- Analyser un deal ou team-investigator detecte "pas de vesting sur CTO"
- Verifier que le scenario BEAR inclut un trigger "depart du CTO" avec source "team-investigator"
- Verifier que le scenario BASE inclut des triggers mitiges

---

## F75 -- Urgence artificielle / FOMO non detectee

### Probleme
Des techniques de pression ("round ferme dans 5 jours", "derniers tickets disponibles", "oversubscribed") sont courantes dans les deals early-stage. Aucun agent ne detecte ces patterns FOMO, ni le deck-forensics, ni le red-flag-detector.

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier1/deck-forensics.ts`
- Le prompt (accessible via `buildSystemPrompt()`) n'inclut pas de detection de patterns FOMO/urgence artificielle
- Les categories de claims sont : "market", "traction", "financials", "tech", "timing", "competition", "team" -- pas de categorie "pressure_tactics"

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/agents/red-flag-detector.ts`
- Ligne 53-60 : Les categories de red flags sont FOUNDER, FINANCIAL, MARKET, PRODUCT, DEAL_STRUCTURE -- pas de categorie PRESSURE_TACTICS

### Correction

#### 1. Ajouter la detection FOMO dans deck-forensics

```typescript
// src/agents/tier1/deck-forensics.ts
// Ajouter dans le buildSystemPrompt(), dans la section des red flags a detecter :

// ## DETECTION FOMO / URGENCE ARTIFICIELLE
//
// PATTERNS A DETECTER (red flag si present):
// - "Round ferme dans X jours" / "Round closing soon"
// - "Derniers tickets disponibles" / "Limited allocation"
// - "Oversubscribed" / "Round sursouscrit" (sans preuve)
// - "First come first served" / "Premier arrive premier servi"
// - "Le prix va augmenter" / "Terms will change"
// - "Un investisseur majeur a deja signe" (sans nommer)
// - "Ne ratez pas cette opportunite" / "Once in a lifetime"
// - Deadlines artificiellement courtes pour la due diligence
// - "Nous avons plusieurs term sheets" (sans preuve)
// - Reference a la FOMO d'autres investisseurs
//
// Si un ou plusieurs patterns detectes:
// - Red Flag severity: HIGH
// - Category: "pressure_tactics"
// - Impact: "Le fondateur utilise des techniques de pression pour precipiter votre decision.
//   Un deal de qualite n'a pas besoin de forcer la main des investisseurs."
// - Question: "Pouvez-vous nous laisser X semaines pour completer notre DD?
//   Si le round est vraiment oversubscribed, qui sont les autres investisseurs?"
```

#### 2. Ajouter la detection dans la ClaimVerification

```typescript
// src/agents/tier1/deck-forensics.ts
// Etendre l'interface ClaimVerification :

interface ClaimVerification {
  // ... champs existants ...
  category: "market" | "traction" | "financials" | "tech" | "timing" | "competition" | "team" | "pressure_tactics";
  // Nouveau status pour les claims FOMO :
  status: "VERIFIED" | "UNVERIFIED" | "CONTRADICTED" | "EXAGGERATED" | "MISLEADING" | "PROJECTION_AS_FACT" | "FOMO_TACTIC";
}
```

#### 3. Ajouter la categorie dans le red-flag-detector

```typescript
// src/agents/red-flag-detector.ts - ligne 53, ajouter dans le system prompt :

// 6. PRESSURE_TACTICS: Urgence artificielle, FOMO, deadline forcee, oversubscribed sans preuve
```

#### 4. Detecteur FOMO automatise (pre-LLM)

```typescript
// src/services/fomo-detector.ts

export interface FOMODetection {
  detected: boolean;
  patterns: {
    pattern: string;
    location: string; // "document text" or "email" or "chat"
    excerpt: string;
    severity: "HIGH" | "MEDIUM";
  }[];
  overallRisk: "NONE" | "LOW" | "MEDIUM" | "HIGH";
}

const FOMO_PATTERNS = [
  { regex: /round\s+(ferme|close|closing|clos)\s+(dans|in|within)\s+\d+\s+(jours?|days?|semaines?|weeks?)/gi, severity: "HIGH" as const },
  { regex: /derniers?\s+tickets?\s+(disponibles?|restants?)/gi, severity: "HIGH" as const },
  { regex: /last\s+(tickets?|spots?|allocations?)\s+(available|remaining|left)/gi, severity: "HIGH" as const },
  { regex: /over\s*subscri(bed|pt)/gi, severity: "MEDIUM" as const },
  { regex: /sur\s*souscri(t|ption)/gi, severity: "MEDIUM" as const },
  { regex: /first\s+come\s+first\s+serve/gi, severity: "HIGH" as const },
  { regex: /premier\s+arriv[ée]\s+premier\s+servi/gi, severity: "HIGH" as const },
  { regex: /prix\s+(va|vont)\s+(augmenter|changer)/gi, severity: "MEDIUM" as const },
  { regex: /(price|terms?)\s+will\s+(increase|change)/gi, severity: "MEDIUM" as const },
  { regex: /ne\s+(ratez|manquez)\s+pas\s+(cette|cette)\s+opportunit[ée]/gi, severity: "MEDIUM" as const },
  { regex: /once\s+in\s+a\s+lifetime/gi, severity: "MEDIUM" as const },
  { regex: /plusieurs\s+term\s*sheets?/gi, severity: "MEDIUM" as const },
  { regex: /multiple\s+term\s*sheets?/gi, severity: "MEDIUM" as const },
  { regex: /un\s+investisseur\s+(majeur|important)\s+(a\s+dej[àa]|has\s+already)/gi, severity: "MEDIUM" as const },
];

export function detectFOMO(text: string, location: string = "document"): FOMODetection {
  const patterns: FOMODetection["patterns"] = [];

  for (const { regex, severity } of FOMO_PATTERNS) {
    const matches = text.matchAll(new RegExp(regex));
    for (const match of matches) {
      const start = Math.max(0, (match.index ?? 0) - 50);
      const end = Math.min(text.length, (match.index ?? 0) + match[0].length + 50);
      patterns.push({
        pattern: match[0],
        location,
        excerpt: text.slice(start, end).replace(/\n/g, " ").trim(),
        severity,
      });
    }
  }

  const highCount = patterns.filter(p => p.severity === "HIGH").length;
  const overallRisk: FOMODetection["overallRisk"] =
    highCount >= 2 ? "HIGH" :
    highCount >= 1 || patterns.length >= 3 ? "MEDIUM" :
    patterns.length > 0 ? "LOW" : "NONE";

  return { detected: patterns.length > 0, patterns, overallRisk };
}
```

### Dependances
- F62 (document recent) : un fondateur pourrait retirer les FOMO patterns entre versions

### Verification
- Uploader un deck contenant "Round ferme dans 5 jours, derniers tickets disponibles"
- Verifier que deck-forensics detecte le pattern et genere un red flag HIGH
- Verifier que le detecteur pre-LLM fonctionne sur les textes extraits

---

## F76 -- Pas de simulation waterfall de liquidation

### Probleme
Le cap-table-auditor a la structure pour `liquidationPreference` (type, multiple, participating) mais ne simule PAS le payout reel dans differents scenarios d'exit. Un BA ne sait pas combien il recevrait reellement en cas d'exit a 1x, 3x, 5x ou 10x la valorisation.

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier1/cap-table-auditor.ts`
- Lignes 116-122 : `liquidationPreference` est defini avec `multiple`, `type`, `cap`, `assessment`
- Lignes 478-645 : Le prompt demande au LLM d'analyser les terms mais ne demande PAS de simulation waterfall
- **ABSENT** : Aucune fonction TypeScript de simulation waterfall. Le LLM est sense calculer les retours mais sans formules explicites de distribution

### Correction

#### 1. Fonction TypeScript de simulation waterfall

```typescript
// src/services/waterfall-simulator.ts

export interface WaterfallInput {
  exitValuation: number;
  investors: {
    name: string;
    investedAmount: number;
    ownershipPercent: number;
    liquidationPreference: {
      multiple: number; // 1x, 2x, etc.
      type: "non_participating" | "participating" | "capped_participating";
      cap?: number; // Cap pour capped_participating (ex: 3x)
    };
    isBA: boolean; // Le Business Angel en question
  }[];
  founders: {
    name: string;
    ownershipPercent: number;
  }[];
  esopPercent: number; // Option pool non exerce
}

export interface WaterfallScenario {
  exitValuation: number;
  exitMultiple: number; // vs post-money valuation
  distributions: {
    name: string;
    role: "investor" | "founder" | "esop";
    amount: number;
    percentOfExit: number;
    returnMultiple: number | null; // null pour founders
    calculation: string;
  }[];
  baReturn: {
    amount: number;
    multiple: number;
    percentOfExit: number;
    calculation: string;
  } | null;
  warnings: string[];
}

export function simulateWaterfall(
  input: WaterfallInput,
  exitValuations: number[] // Ex: [1_000_000, 3_000_000, 5_000_000, 10_000_000, 20_000_000]
): WaterfallScenario[] {
  return exitValuations.map(exitVal => simulateSingleWaterfall(input, exitVal));
}

function simulateSingleWaterfall(input: WaterfallInput, exitValuation: number): WaterfallScenario {
  const totalInvested = input.investors.reduce((sum, inv) => sum + inv.investedAmount, 0);
  const postMoney = totalInvested / (input.investors.reduce((sum, inv) => sum + inv.ownershipPercent, 0) / 100);
  const exitMultiple = exitValuation / postMoney;

  let remaining = exitValuation;
  const distributions: WaterfallScenario["distributions"] = [];
  const warnings: string[] = [];

  // ETAPE 1: Liquidation Preferences (en ordre de priorite)
  // Trier par multiple decroissant (les seniors d'abord)
  const sortedInvestors = [...input.investors].sort(
    (a, b) => b.liquidationPreference.multiple - a.liquidationPreference.multiple
  );

  for (const inv of sortedInvestors) {
    const prefAmount = inv.investedAmount * inv.liquidationPreference.multiple;

    if (inv.liquidationPreference.type === "non_participating") {
      // Non-participating: MAX(pref, pro-rata)
      const proRata = exitValuation * (inv.ownershipPercent / 100);
      const payout = Math.min(remaining, Math.max(prefAmount, proRata));
      remaining -= payout;

      distributions.push({
        name: inv.name,
        role: "investor",
        amount: Math.round(payout),
        percentOfExit: (payout / exitValuation) * 100,
        returnMultiple: payout / inv.investedAmount,
        calculation: `MAX(pref=${formatK(prefAmount)}, pro-rata=${formatK(proRata)}) = ${formatK(payout)}`,
      });
    } else if (inv.liquidationPreference.type === "participating") {
      // Participating (double-dip): pref PLUS pro-rata sur le reste
      const pref = Math.min(remaining, prefAmount);
      remaining -= pref;

      const proRata = remaining * (inv.ownershipPercent / 100);
      remaining -= proRata;

      const totalPayout = pref + proRata;
      distributions.push({
        name: inv.name,
        role: "investor",
        amount: Math.round(totalPayout),
        percentOfExit: (totalPayout / exitValuation) * 100,
        returnMultiple: totalPayout / inv.investedAmount,
        calculation: `Pref ${formatK(pref)} + Pro-rata ${formatK(proRata)} = ${formatK(totalPayout)} (DOUBLE-DIP)`,
      });

      if (inv.liquidationPreference.multiple > 1) {
        warnings.push(`${inv.name} a une preference de liquidation ${inv.liquidationPreference.multiple}x PARTICIPATING - impact significatif sur le retour du BA.`);
      }
    } else if (inv.liquidationPreference.type === "capped_participating") {
      // Capped participating: pref + pro-rata, plafonne a cap*invested
      const pref = Math.min(remaining, prefAmount);
      remaining -= pref;

      const proRata = remaining * (inv.ownershipPercent / 100);
      const cap = (inv.liquidationPreference.cap ?? 3) * inv.investedAmount;
      const totalPayout = Math.min(pref + proRata, cap);
      const actualProRata = totalPayout - pref;
      remaining -= actualProRata;

      distributions.push({
        name: inv.name,
        role: "investor",
        amount: Math.round(totalPayout),
        percentOfExit: (totalPayout / exitValuation) * 100,
        returnMultiple: totalPayout / inv.investedAmount,
        calculation: `MIN(Pref ${formatK(pref)} + Pro-rata ${formatK(actualProRata)}, Cap ${formatK(cap)}) = ${formatK(totalPayout)}`,
      });
    }
  }

  // ETAPE 2: Founders et ESOP recoivent le reste au pro-rata
  const totalFounderESOPPct = input.founders.reduce((sum, f) => sum + f.ownershipPercent, 0) + input.esopPercent;

  for (const founder of input.founders) {
    const share = remaining * (founder.ownershipPercent / totalFounderESOPPct);
    distributions.push({
      name: founder.name,
      role: "founder",
      amount: Math.round(share),
      percentOfExit: (share / exitValuation) * 100,
      returnMultiple: null,
      calculation: `${(founder.ownershipPercent / totalFounderESOPPct * 100).toFixed(1)}% du reste (${formatK(remaining)}) = ${formatK(share)}`,
    });
  }

  if (input.esopPercent > 0) {
    const esopShare = remaining * (input.esopPercent / totalFounderESOPPct);
    distributions.push({
      name: "ESOP",
      role: "esop",
      amount: Math.round(esopShare),
      percentOfExit: (esopShare / exitValuation) * 100,
      returnMultiple: null,
      calculation: `${(input.esopPercent / totalFounderESOPPct * 100).toFixed(1)}% du reste = ${formatK(esopShare)}`,
    });
  }

  // Retour BA
  const baDistribution = distributions.find(d => input.investors.find(i => i.isBA && i.name === d.name));
  const baReturn = baDistribution ? {
    amount: baDistribution.amount,
    multiple: baDistribution.returnMultiple ?? 0,
    percentOfExit: baDistribution.percentOfExit,
    calculation: baDistribution.calculation,
  } : null;

  return {
    exitValuation,
    exitMultiple: Math.round(exitMultiple * 10) / 10,
    distributions,
    baReturn,
    warnings,
  };
}

function formatK(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return `${value.toFixed(0)}`;
}
```

#### 2. Integrer dans cap-table-auditor

```typescript
// src/agents/tier1/cap-table-auditor.ts
// Apres la reponse LLM (ligne 647), ajouter la simulation :

import { simulateWaterfall, type WaterfallInput } from "@/services/waterfall-simulator";

// Si on a les donnees de la cap table, simuler le waterfall
if (data.findings.roundTerms?.liquidationPreference && data.findings.ownershipBreakdown) {
  const postMoney = (deal.valuationPre ? Number(deal.valuationPre) : 0) + (deal.amountRequested ? Number(deal.amountRequested) : 0);
  const exitScenarios = [postMoney * 1, postMoney * 3, postMoney * 5, postMoney * 10];

  // Construire l'input waterfall a partir des donnees LLM
  // ... mapper data.findings vers WaterfallInput ...

  const waterfallResults = simulateWaterfall(waterfallInput, exitScenarios);
  // Injecter dans les findings
}
```

### Dependances
- F78 (IRR mal modelise) : la simulation waterfall doit utiliser les fonctions TS de calcul financier

### Verification
- Analyser un deal avec une preference 2x participating
- Verifier que la simulation montre le double-dip a chaque niveau d'exit
- Verifier que le BA voit clairement combien il recoit a 1x, 3x, 5x, 10x

---

## F77 -- Risk framework non coherent

### Probleme
Les red flags sont distribues entre 13 agents Tier 1 avec des nomenclatures differentes. Il n'y a pas de matrice probabilite x impact unifiee. Les categories varient : "transparency" (cap-table), "structure" (legal), "retention" (customer-intel), "channel" (gtm-analyst), etc.

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/agents/types.ts`
- Ligne 330-342 : `AgentRedFlag` a un `category: string` libre (pas d'enum contraint)
- Ligne 333 : `severity: "CRITICAL" | "HIGH" | "MEDIUM"` -- la severite est standardisee mais pas la categorie

**Fichiers agents** (categories utilisees par chaque agent) :
- `cap-table-auditor.ts` : "transparency", "dilution", "terms", "governance", "investors"
- `legal-regulatory.ts` : "structure", "compliance", "ip", "contracts", "litigation"
- `customer-intel.ts` : "retention", "pmf", "concentration", "quality", "disclosure"
- `gtm-analyst.ts` : "channel", "motion", "economics", "scalability", "data"
- `deck-forensics.ts` : pas de categories formalisees
- `red-flag-detector.ts` : "FOUNDER", "FINANCIAL", "MARKET", "PRODUCT", "DEAL_STRUCTURE"

**MANQUANT** : Pas de taxonomie unifiee. Pas de probabilite. Pas de matrice consolidee.

### Correction

#### 1. Taxonomie unifiee des red flags

```typescript
// src/agents/red-flag-taxonomy.ts

/**
 * Taxonomie unifiee des red flags pour tous les agents.
 * Chaque agent DOIT utiliser ces categories et sous-categories.
 */

export const RED_FLAG_CATEGORIES = {
  // Equipe et fondateurs
  TEAM: {
    label: "Equipe & Fondateurs",
    subcategories: ["background", "vesting", "turnover", "conflicts", "competence", "transparency"],
  },
  // Financier
  FINANCIAL: {
    label: "Financier",
    subcategories: ["valuation", "metrics", "projections", "burn", "revenue", "unit_economics"],
  },
  // Marche et concurrence
  MARKET: {
    label: "Marche & Concurrence",
    subcategories: ["size", "timing", "competition", "barriers", "regulation"],
  },
  // Produit et technologie
  PRODUCT: {
    label: "Produit & Technologie",
    subcategories: ["differentiation", "tech_risk", "dependencies", "moat", "traction"],
  },
  // Structure du deal
  DEAL_STRUCTURE: {
    label: "Structure du Deal",
    subcategories: ["cap_table", "terms", "governance", "dilution", "investors"],
  },
  // Juridique et reglementaire
  LEGAL: {
    label: "Juridique & Reglementaire",
    subcategories: ["compliance", "ip", "contracts", "litigation", "structure"],
  },
  // Clients et PMF
  CUSTOMERS: {
    label: "Clients & PMF",
    subcategories: ["retention", "concentration", "pmf", "quality", "churn"],
  },
  // Commercial (GTM)
  GTM: {
    label: "Go-to-Market",
    subcategories: ["channels", "economics", "scalability", "motion"],
  },
  // Transparence et integrite
  INTEGRITY: {
    label: "Transparence & Integrite",
    subcategories: ["disclosure", "inconsistency", "exaggeration", "pressure_tactics", "data_quality"],
  },
} as const;

export type RedFlagCategory = keyof typeof RED_FLAG_CATEGORIES;
export type RedFlagSubcategory = typeof RED_FLAG_CATEGORIES[RedFlagCategory]["subcategories"][number];

/**
 * Severite : impact si le risque se materialise
 */
export type RedFlagSeverity = "CRITICAL" | "HIGH" | "MEDIUM";

/**
 * Probabilite : chance que le risque se materialise
 */
export type RedFlagProbability = "VERY_LIKELY" | "LIKELY" | "POSSIBLE" | "UNLIKELY";

/**
 * Red flag standardise avec matrice probabilite x impact
 */
export interface StandardizedRedFlag {
  id: string;
  category: RedFlagCategory;
  subcategory: string;
  severity: RedFlagSeverity;        // Impact
  probability: RedFlagProbability;   // Probabilite
  riskScore: number;                 // severity x probability (1-12)
  title: string;
  description: string;
  location: string;
  evidence: string;
  contextEngineData?: string;
  impact: string;
  question: string;
  redFlagIfBadAnswer: string;
  sourceAgent: string;               // Agent qui l'a detecte
}

/**
 * Calcule le score de risque (1-12)
 */
export function calculateRiskScore(severity: RedFlagSeverity, probability: RedFlagProbability): number {
  const severityMap: Record<RedFlagSeverity, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2 };
  const probabilityMap: Record<RedFlagProbability, number> = { VERY_LIKELY: 3, LIKELY: 2, POSSIBLE: 1.5, UNLIKELY: 1 };
  return Math.round(severityMap[severity] * probabilityMap[probability] * 10) / 10;
}

/**
 * Consolide les red flags de tous les agents dans une matrice unifiee
 */
export function consolidateRedFlags(
  agentResults: Record<string, { redFlags?: Array<{ id: string; category: string; severity: string; [key: string]: unknown }> }>
): StandardizedRedFlag[] {
  const allFlags: StandardizedRedFlag[] = [];

  for (const [agentName, result] of Object.entries(agentResults)) {
    if (!result.redFlags) continue;

    for (const rf of result.redFlags) {
      const mappedCategory = mapAgentCategory(agentName, rf.category);

      allFlags.push({
        id: rf.id as string,
        category: mappedCategory.category,
        subcategory: mappedCategory.subcategory,
        severity: (rf.severity as RedFlagSeverity) || "MEDIUM",
        probability: "POSSIBLE", // Default - sera enrichi par contradiction-detector
        riskScore: calculateRiskScore((rf.severity as RedFlagSeverity) || "MEDIUM", "POSSIBLE"),
        title: rf.title as string,
        description: rf.description as string,
        location: rf.location as string,
        evidence: rf.evidence as string,
        contextEngineData: rf.contextEngineData as string | undefined,
        impact: rf.impact as string,
        question: rf.question as string,
        redFlagIfBadAnswer: rf.redFlagIfBadAnswer as string,
        sourceAgent: agentName,
      });
    }
  }

  // Trier par riskScore decroissant
  return allFlags.sort((a, b) => b.riskScore - a.riskScore);
}

/**
 * Mappe les categories agents vers la taxonomie unifiee
 */
function mapAgentCategory(agentName: string, rawCategory: string): { category: RedFlagCategory; subcategory: string } {
  const mapping: Record<string, { category: RedFlagCategory; subcategory: string }> = {
    // cap-table-auditor
    "transparency": { category: "INTEGRITY", subcategory: "disclosure" },
    "dilution": { category: "DEAL_STRUCTURE", subcategory: "dilution" },
    "terms": { category: "DEAL_STRUCTURE", subcategory: "terms" },
    "governance": { category: "DEAL_STRUCTURE", subcategory: "governance" },
    "investors": { category: "DEAL_STRUCTURE", subcategory: "investors" },
    // legal-regulatory
    "structure": { category: "LEGAL", subcategory: "structure" },
    "compliance": { category: "LEGAL", subcategory: "compliance" },
    "ip": { category: "LEGAL", subcategory: "ip" },
    "contracts": { category: "LEGAL", subcategory: "contracts" },
    "litigation": { category: "LEGAL", subcategory: "litigation" },
    // customer-intel
    "retention": { category: "CUSTOMERS", subcategory: "retention" },
    "pmf": { category: "CUSTOMERS", subcategory: "pmf" },
    "concentration": { category: "CUSTOMERS", subcategory: "concentration" },
    "quality": { category: "CUSTOMERS", subcategory: "quality" },
    "disclosure": { category: "INTEGRITY", subcategory: "disclosure" },
    // gtm-analyst
    "channel": { category: "GTM", subcategory: "channels" },
    "motion": { category: "GTM", subcategory: "motion" },
    "economics": { category: "GTM", subcategory: "economics" },
    "scalability": { category: "GTM", subcategory: "scalability" },
    "data": { category: "INTEGRITY", subcategory: "data_quality" },
    // red-flag-detector
    "FOUNDER": { category: "TEAM", subcategory: "background" },
    "FINANCIAL": { category: "FINANCIAL", subcategory: "metrics" },
    "MARKET": { category: "MARKET", subcategory: "size" },
    "PRODUCT": { category: "PRODUCT", subcategory: "differentiation" },
    "DEAL_STRUCTURE": { category: "DEAL_STRUCTURE", subcategory: "terms" },
    // pressure_tactics
    "pressure_tactics": { category: "INTEGRITY", subcategory: "pressure_tactics" },
  };

  return mapping[rawCategory] ?? { category: "INTEGRITY", subcategory: "data_quality" };
}
```

### Dependances
- F74 (triggers de scenarios) : les triggers doivent reference les red flags standardises
- F75 (FOMO) : la categorie "pressure_tactics" doit etre dans la taxonomie

### Verification
- Analyser un deal et recuperer les red flags de tous les agents
- Verifier que `consolidateRedFlags()` produit une liste triee par riskScore
- Verifier que les categories sont unifiees et pas des strings libres

---

## F78 -- Dilution et IRR mal modelises

### Probleme
Le scenario-modeler demande au LLM de calculer IRR et dilutions via des formules dans les prompts. Il n'y a pas de verification mathematique post-LLM. Le fichier `financial-calculations.ts` contient `calculateCAGR` mais pas `calculateIRR` ni `calculateDilution`.

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/agents/orchestration/utils/financial-calculations.ts`
- 237 lignes : Contient `calculateARR`, `calculateGrossMargin`, `calculateCAGR`, `calculateLTVCACRatio`, `calculateRuleOf40`
- **ABSENT** : Pas de `calculateIRR` (Newton-Raphson), pas de `calculateDilution`, pas de `calculateOwnershipAtExit`

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier3/scenario-modeler.ts`
- Lignes 276-286 : Le prompt donne la formule IRR simplifiee `((Multiple)^(1/years) - 1) * 100` qui est une approximation (IRR annualise =/= vrai IRR avec cashflows multiples)
- Lignes 1095-1115 : `recalculateWeightedOutcome()` utilise la meme formule simplifiee
- Lignes 1034-1090 : `sanitizeExitValuations()` recalcule IRR apres cap mais toujours avec la formule simplifiee

### Correction

#### 1. Fonctions TypeScript pour IRR et Dilution

```typescript
// src/agents/orchestration/utils/financial-calculations.ts
// Ajouter les fonctions suivantes :

/**
 * Calcule l'IRR (Internal Rate of Return) via Newton-Raphson.
 * Supporte des cashflows multiples (pas juste invest -> exit).
 *
 * @param cashflows - Array de cashflows [invest (negatif), ..., exit (positif)]
 * @param periods - Array de periodes en annees [0, 1, 2, ..., N]
 * @param maxIterations - Nombre max d'iterations Newton-Raphson
 * @returns IRR en pourcentage ou null si non convergent
 */
export function calculateIRR(
  cashflows: number[],
  periods: number[],
  maxIterations: number = 100
): CalculationResult | { error: string } {
  if (cashflows.length !== periods.length) {
    return { error: "cashflows et periods doivent avoir la meme taille" };
  }
  if (cashflows.length < 2) {
    return { error: "Au minimum 2 cashflows requis (investissement + sortie)" };
  }

  // Newton-Raphson pour trouver le taux r tel que NPV(r) = 0
  let rate = 0.1; // Guess initial: 10%
  const tolerance = 1e-7;

  for (let i = 0; i < maxIterations; i++) {
    let npv = 0;
    let derivative = 0;

    for (let j = 0; j < cashflows.length; j++) {
      const t = periods[j];
      const discountFactor = Math.pow(1 + rate, -t);
      npv += cashflows[j] * discountFactor;
      derivative -= t * cashflows[j] * Math.pow(1 + rate, -(t + 1));
    }

    if (Math.abs(npv) < tolerance) {
      const irr = rate * 100;
      const cfStr = cashflows.map((cf, idx) => `Y${periods[idx]}:${cf >= 0 ? "+" : ""}${formatCurrency(cf)}`).join(", ");
      return {
        value: Math.round(irr * 10) / 10,
        formula: "IRR via Newton-Raphson: NPV(r) = 0",
        inputs: cashflows.map((cf, idx) => ({
          name: `Cashflow Y${periods[idx]}`,
          value: cf,
          source: "Scenario projection",
        })),
        formatted: `${(Math.round(irr * 10) / 10).toFixed(1)}%`,
        calculation: `IRR(${cfStr}) = ${(Math.round(irr * 10) / 10).toFixed(1)}% (${i + 1} iterations)`,
      };
    }

    if (Math.abs(derivative) < 1e-10) {
      // Derivee trop proche de zero, ajuster le guess
      rate += 0.05;
      continue;
    }

    rate = rate - npv / derivative;

    // Garder le rate dans des bornes raisonnables
    if (rate < -0.99) rate = -0.99;
    if (rate > 10) rate = 10;
  }

  // Fallback: formule simplifiee si Newton-Raphson ne converge pas
  const totalInvest = Math.abs(cashflows[0]);
  const totalReturn = cashflows[cashflows.length - 1];
  const years = periods[periods.length - 1] - periods[0];

  if (totalInvest > 0 && totalReturn > 0 && years > 0) {
    const multiple = totalReturn / totalInvest;
    const approxIRR = (Math.pow(multiple, 1 / years) - 1) * 100;
    return {
      value: Math.round(approxIRR * 10) / 10,
      formula: "IRR approx = ((Multiple)^(1/years) - 1) x 100",
      inputs: [
        { name: "Investment", value: totalInvest, source: "Scenario" },
        { name: "Return", value: totalReturn, source: "Scenario" },
        { name: "Years", value: years, source: "Scenario" },
      ],
      formatted: `~${(Math.round(approxIRR * 10) / 10).toFixed(1)}% (approx)`,
      calculation: `((${(totalReturn / totalInvest).toFixed(1)}x)^(1/${years}) - 1) x 100 = ~${(Math.round(approxIRR * 10) / 10).toFixed(1)}%`,
    };
  }

  return { error: "IRR non convergent et fallback impossible" };
}

/**
 * Calcule la dilution cumulee a travers plusieurs rounds.
 *
 * @param rounds - Array de rounds avec % dilution par round
 * @returns Ownership final et dilution totale
 */
export function calculateCumulativeDilution(
  initialOwnership: number, // en % (ex: 2.0 = 2%)
  rounds: { name: string; dilutionPercent: number; source: string }[]
): CalculationResult {
  let currentOwnership = initialOwnership;
  const steps: string[] = [`Initial: ${initialOwnership.toFixed(2)}%`];

  for (const round of rounds) {
    const factor = 1 - round.dilutionPercent / 100;
    const newOwnership = currentOwnership * factor;
    steps.push(`Apres ${round.name} (-${round.dilutionPercent}%): ${currentOwnership.toFixed(2)}% x ${factor.toFixed(3)} = ${newOwnership.toFixed(3)}%`);
    currentOwnership = newOwnership;
  }

  const totalDilution = ((initialOwnership - currentOwnership) / initialOwnership) * 100;

  return {
    value: currentOwnership,
    formula: "Ownership = Initial x (1 - dil_1) x (1 - dil_2) x ...",
    inputs: [
      { name: "Initial ownership", value: initialOwnership, source: "Cap table" },
      ...rounds.map(r => ({ name: r.name, value: r.dilutionPercent, source: r.source })),
    ],
    formatted: `${currentOwnership.toFixed(3)}% (dilution totale: ${totalDilution.toFixed(1)}%)`,
    calculation: steps.join(" → "),
  };
}
```

#### 2. Verification post-LLM dans scenario-modeler

```typescript
// src/agents/tier3/scenario-modeler.ts
// Dans normalizeResponse(), apres le parsing LLM, ajouter :

import { calculateIRR, calculateCumulativeDilution } from "../orchestration/utils/financial-calculations";

// Pour chaque scenario, verifier et corriger les calculs LLM
for (const scenario of scenarios) {
  const ir = scenario.investorReturn;

  // Verifier l'IRR avec Newton-Raphson
  if (ir.initialInvestment > 0 && ir.grossProceeds > 0 && ir.holdingPeriodYears > 0) {
    const irrResult = calculateIRR(
      [-ir.initialInvestment, ir.grossProceeds],
      [0, ir.holdingPeriodYears]
    );

    if ("value" in irrResult) {
      const llmIRR = ir.irr;
      const tsIRR = irrResult.value;

      // Si ecart > 5 points, corriger
      if (Math.abs(llmIRR - tsIRR) > 5) {
        ir.irr = tsIRR;
        ir.irrCalculation = `${irrResult.calculation} [CORRIGE: LLM avait ${llmIRR.toFixed(1)}%]`;
      }
    }
  }

  // Verifier le multiple
  if (ir.initialInvestment > 0 && ir.grossProceeds > 0) {
    const correctMultiple = Math.round((ir.grossProceeds / ir.initialInvestment) * 10) / 10;
    if (Math.abs(ir.multiple - correctMultiple) > 0.2) {
      ir.multipleCalculation = `${ir.grossProceeds} / ${ir.initialInvestment} = ${correctMultiple}x [CORRIGE: LLM avait ${ir.multiple}x]`;
      ir.multiple = correctMultiple;
    }
  }
}
```

### Dependances
- F76 (waterfall de liquidation) : la simulation waterfall alimentera les grossProceeds corrects pour le calcul IRR

### Verification
- Analyser un deal et verifier que les IRR des scenarios sont calcules par Newton-Raphson
- Creer un test unitaire : investissement 50K, retour 400K sur 6 ans = IRR ~41.4%
- Verifier que si le LLM calcule un IRR errone, la correction post-LLM le rectifie

---

## F79 -- Legal-regulatory sans acces aux registres

### Probleme
L'agent legal-regulatory analyse uniquement le contenu du pitch deck. Il n'a pas d'acces aux registres publics (INPI pour les brevets, BODACC pour les procedures collectives, Societe.com pour les litiges) meme quand ces donnees sont disponibles via les connecteurs existants.

### Diagnostic

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/agents/tier1/legal-regulatory.ts`
- Lignes 398-648 : La methode `execute()` utilise `formatDealContext()` et `formatContextEngineData()` mais ne cherche pas specifiquement les donnees juridiques des connecteurs.
- Le prompt (lignes 230-396) mentionne l'analyse IP, la conformite, les litiges, mais sans donnees externes.
- Aucune reference a Pappers, Societe.com, ou Companies House pour les verifications legales.

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/services/context-engine/connectors/pappers.ts`
- Fournit des donnees d'entreprise FR mais les resultats ne sont pas specifiquement routes vers legal-regulatory.

**Fichier** : `/Users/sacharebbouh/Desktop/angeldesk/src/services/context-engine/connectors/societe-com.ts`
- Fournit des donnees FR par scraping mais meme probleme de routing.

### Correction

#### 1. Creer un service de verification registres

```typescript
// src/services/legal-registry-check.ts

export interface RegistryCheckResult {
  geography: string;
  checks: {
    registry: string;
    status: "VERIFIED" | "NOT_FOUND" | "ERROR" | "NOT_AVAILABLE";
    data?: Record<string, unknown>;
    url?: string;
    warning?: string;
  }[];
  overallStatus: "VERIFIED" | "PARTIAL" | "NOT_VERIFIED";
  missingChecks: string[];
}

/**
 * Verifie les registres publics disponibles pour une entreprise.
 * Route vers le bon connecteur selon la geographie.
 */
export async function checkLegalRegistries(
  companyName: string,
  geography: string,
  sirenOrCompanyNumber?: string
): Promise<RegistryCheckResult> {
  const checks: RegistryCheckResult["checks"] = [];
  const missingChecks: string[] = [];

  const geo = geography.toUpperCase();

  if (geo === "FR" || geo === "FRANCE") {
    // Pappers - donnees legales FR
    try {
      // Utiliser le connecteur Pappers existant
      const pappersResult = await fetchPappersData(companyName, sirenOrCompanyNumber);
      checks.push({
        registry: "Pappers (FR - Registre du Commerce)",
        status: pappersResult ? "VERIFIED" : "NOT_FOUND",
        data: pappersResult ?? undefined,
        url: `https://www.pappers.fr/recherche?q=${encodeURIComponent(companyName)}`,
      });
    } catch {
      checks.push({
        registry: "Pappers (FR - Registre du Commerce)",
        status: "ERROR",
        warning: "Verification Pappers echouee - verifier manuellement",
      });
    }

    // BODACC - procedures collectives
    // TODO: Ajouter connecteur BODACC
    missingChecks.push("BODACC (procedures collectives) - connecteur non disponible");

    // INPI - brevets et marques
    // TODO: Ajouter connecteur INPI
    missingChecks.push("INPI (brevets, marques) - connecteur non disponible");

  } else if (geo === "UK" || geo === "GB") {
    // Companies House
    try {
      const chResult = await fetchCompaniesHouseData(companyName);
      checks.push({
        registry: "Companies House (UK)",
        status: chResult ? "VERIFIED" : "NOT_FOUND",
        data: chResult ?? undefined,
        url: `https://find-and-update.company-information.service.gov.uk/search?q=${encodeURIComponent(companyName)}`,
      });
    } catch {
      checks.push({
        registry: "Companies House (UK)",
        status: "ERROR",
        warning: "Verification Companies House echouee - verifier manuellement",
      });
    }

  } else if (geo === "US" || geo === "USA") {
    // SEC EDGAR - si la societe est enregistree
    // TODO: Ajouter connecteur SEC EDGAR
    missingChecks.push("SEC EDGAR (filings US) - connecteur non disponible");
    missingChecks.push("State SOS (Secretary of State) - connecteur non disponible");

  } else {
    missingChecks.push(`Aucun registre disponible pour la geographie "${geography}"`);
  }

  const verified = checks.filter(c => c.status === "VERIFIED").length;
  const total = checks.length + missingChecks.length;

  return {
    geography,
    checks,
    overallStatus: verified === total ? "VERIFIED" : verified > 0 ? "PARTIAL" : "NOT_VERIFIED",
    missingChecks,
  };
}

// Helpers pour appeler les connecteurs existants
async function fetchPappersData(companyName: string, siren?: string): Promise<Record<string, unknown> | null> {
  const { pappersConnector } = await import("@/services/context-engine/connectors/pappers");
  if (!pappersConnector.isConfigured()) return null;
  // Utiliser l'API Pappers pour chercher l'entreprise
  // ... implementation qui utilise le connecteur existant
  return null; // placeholder
}

async function fetchCompaniesHouseData(companyName: string): Promise<Record<string, unknown> | null> {
  const { companiesHouseConnector } = await import("@/services/context-engine/connectors/companies-house");
  if (!companiesHouseConnector.isConfigured()) return null;
  // Utiliser l'API Companies House
  // ... implementation qui utilise le connecteur existant
  return null; // placeholder
}
```

#### 2. Integrer dans legal-regulatory

```typescript
// src/agents/tier1/legal-regulatory.ts
// Dans execute() (apres ligne 401), ajouter :

import { checkLegalRegistries } from "@/services/legal-registry-check";

// Verifier les registres publics si geographie connue
let registrySection = "\n## VERIFICATION REGISTRES PUBLICS\n";
const geography = context.deal.geography || context.deal.country || "";

if (geography) {
  try {
    const registryResult = await checkLegalRegistries(
      context.deal.companyName || context.deal.name || "",
      geography,
      context.deal.siren || undefined
    );

    if (registryResult.checks.length > 0) {
      registrySection += `Geographie: ${registryResult.geography} | Status: ${registryResult.overallStatus}\n\n`;
      for (const check of registryResult.checks) {
        registrySection += `### ${check.registry}\n`;
        registrySection += `Status: ${check.status}\n`;
        if (check.data) {
          registrySection += `Donnees: ${JSON.stringify(check.data, null, 2)}\n`;
        }
        if (check.warning) {
          registrySection += `WARNING: ${check.warning}\n`;
        }
        if (check.url) {
          registrySection += `URL: ${check.url}\n`;
        }
      }
    }

    if (registryResult.missingChecks.length > 0) {
      registrySection += "\n### REGISTRES NON VERIFIES\n";
      registrySection += "Les registres suivants n'ont PAS ete verifies (source non disponible):\n";
      for (const missing of registryResult.missingChecks) {
        registrySection += `- ${missing}\n`;
      }
      registrySection += "\n**IMPORTANT**: Marquer toutes les conclusions legales comme 'NON VERIFIE' pour ces registres.\n";
    }
  } catch (err) {
    registrySection += "Verification des registres echouee. Toutes les conclusions legales sont NON VERIFIEES.\n";
  }
} else {
  registrySection += "Geographie du deal inconnue. AUCUN registre public n'a ete verifie.\n";
  registrySection += "**TOUTES les conclusions legales doivent etre marquees 'NON VERIFIE'.**\n";
}

// Injecter dans le prompt (ajouter registrySection au prompt)
const prompt = `# ANALYSE LEGAL & REGULATORY - ${context.deal.name}
...
${registrySection}
...`;
```

#### 3. Flag "NON VERIFIE" dans les findings

Le prompt doit instruire le LLM de marquer chaque finding IP/compliance/structure avec un niveau de verification :

```
Pour CHAQUE finding legal:
- Si verifie via registre public: marquer "VERIFIE (source: [registre])"
- Si base uniquement sur le deck: marquer "NON VERIFIE - base sur le deck uniquement"
- Si registre non disponible: marquer "NON VERIFIABLE - registre [X] non accessible"
```

### Dependances
- F70 (biais geographique) : la couverture geographique determine quels registres sont disponibles

### Verification
- Analyser un deal FR avec un SIREN connu, verifier que Pappers est appele
- Analyser un deal UK, verifier que Companies House est appele
- Analyser un deal US, verifier que les findings sont marques "NON VERIFIE"

---

## Resume des dependances entre failles

```
F62 (Document versionnage) <---> F63 (Cache invalidation)
F70 (Geo coverage)         <---> F79 (Legal registres)
F74 (Scenario triggers)    ----> F77 (Taxonomie unifiee)
F75 (FOMO detection)       ----> F77 (Categorie pressure_tactics)
F76 (Waterfall simulation) ----> F78 (IRR/Dilution TypeScript)
F71 (Traction injection)   ----> F75 (Traction pour detection FOMO)
```

## Ordre d'implementation recommande

1. **F77** - Taxonomie unifiee (prerequis pour F74, F75)
2. **F78** - Fonctions IRR/Dilution TypeScript (prerequis pour F76)
3. **F76** - Simulation waterfall (utilise F78)
4. **F63** - Hash + invalidation cache (simple, independant)
5. **F62** - Versionnage documents (etend F63)
6. **F70** - Couverture geographique (prerequis pour F79)
7. **F79** - Legal registres (utilise F70)
8. **F71** - Injection traction (independant)
9. **F75** - Detection FOMO (utilise F77)
10. **F74** - Triggers contextuels (utilise F77)
