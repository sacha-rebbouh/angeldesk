# FACT-STORE-SPEC.md - Système de Mise à Jour d'Analyses

> **Version**: 1.0
> **Date**: 2026-01-28
> **Statut**: SPEC VALIDÉE - À IMPLÉMENTER

---

## TABLE DES MATIÈRES

1. [Vision et Problématique](#1-vision-et-problématique)
2. [Fact Store - Architecture](#2-fact-store---architecture)
3. [Agent fact-extractor (Tier 0)](#3-agent-fact-extractor-tier-0)
4. [Pipeline d'Extraction et Matching](#4-pipeline-dextraction-et-matching)
5. [Gestion des Contradictions](#5-gestion-des-contradictions)
6. [Intégration avec les Agents](#6-intégration-avec-les-agents)
7. [UI/UX](#7-uiux)
8. [Credit System](#8-credit-system)
9. [Plan d'Implémentation](#9-plan-dimplémentation)

---

## 1. VISION ET PROBLÉMATIQUE

### 1.1 Le Problème

Quand un BA reçoit des réponses du fondateur ou uploade de nouveaux documents :
- Comment intégrer ces nouvelles infos dans l'analyse existante ?
- Comment éviter que le score change "mystérieusement" entre deux runs (variabilité LLM) ?
- Comment garder un historique cohérent sur 4-5+ versions d'analyse ?

### 1.2 La Solution : Cumulative Fact Store

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ARCHITECTURE GLOBALE                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  SOURCES                           FACT STORE                           │
│  ───────                           ──────────                           │
│  • Pitch Deck V1, V2...    ──┐                                          │
│  • Data Room               ──┼──►  FACT-EXTRACTOR  ──►  FACTS DB        │
│  • Réponses Fondateur      ──┤     (Tier 0)            (Event Sourcing) │
│  • Context Engine (web)    ──┘                              │           │
│                                                              │           │
│                                                              ▼           │
│                                                     ┌───────────────┐   │
│                                                     │ CURRENT FACTS │   │
│                                                     │ (Vue agrégée) │   │
│                                                     └───────────────┘   │
│                                                              │           │
│                                                              ▼           │
│                                                     ┌───────────────┐   │
│                                                     │ AGENTS T1/T2/T3│   │
│                                                     │ (Analysent les │   │
│                                                     │  faits, pas    │   │
│                                                     │  les docs)     │   │
│                                                     └───────────────┘   │
│                                                              │           │
│                                                              ▼           │
│                                                     ┌───────────────┐   │
│                                                     │   ANALYSIS    │   │
│                                                     │   VERSIONS    │   │
│                                                     │   (3 max)     │   │
│                                                     └───────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Principes Clés

| Principe | Description |
|----------|-------------|
| **Faits immutables** | Une fois extrait, un fait ne change pas (il peut être supersédé) |
| **Event sourcing** | Chaque modification est un événement, jamais d'UPDATE |
| **Analyse sur faits** | Les agents analysent le Fact Store, pas les docs bruts |
| **Delta explicable** | Chaque changement de score est traçable à un fait |
| **Pas de régression mystérieuse** | Le score ne peut baisser que si un fait négatif est ajouté |

---

## 2. FACT STORE - ARCHITECTURE

### 2.1 Data Model (Event Sourcing)

```typescript
// ═══════════════════════════════════════════════════════════════════════
// TABLE: fact_events (append-only, jamais modifiée)
// ═══════════════════════════════════════════════════════════════════════

interface FactEvent {
  id: string;                    // UUID
  dealId: string;                // FK vers Deal

  // ─── Identification du fait ───
  factKey: string;               // Clé canonique (ex: "financial.arr")
  category: FactCategory;        // FINANCIAL | TEAM | MARKET | PRODUCT | LEGAL | COMPETITION

  // ─── Valeur ───
  value: any;                    // Valeur brute (number, string, object)
  displayValue: string;          // Version lisible ("535K€", "4%", "John Doe")
  unit?: string;                 // EUR, %, months, etc.

  // ─── Provenance ───
  source: FactSource;            // Hiérarchie de confiance
  sourceDocumentId?: string;     // FK vers Document (si applicable)
  sourceQuestionId?: string;     // FK vers Question (si réponse fondateur)
  sourceConfidence: number;      // 0-100
  extractedText?: string;        // Texte exact d'où le fait est extrait

  // ─── Event metadata ───
  eventType: FactEventType;
  supersedesEventId?: string;    // ID de l'event qu'il remplace
  createdAt: Date;
  createdBy: 'system' | 'ba';    // Qui a créé cet event
  reason?: string;               // Si BA override : justification
}

type FactCategory =
  | 'FINANCIAL'
  | 'TEAM'
  | 'MARKET'
  | 'PRODUCT'
  | 'LEGAL'
  | 'COMPETITION'
  | 'TRACTION'
  | 'OTHER';

type FactSource =
  | 'DATA_ROOM'           // 100% confiance
  | 'FINANCIAL_MODEL'     // 95%
  | 'FOUNDER_RESPONSE'    // 90%
  | 'PITCH_DECK'          // 80% (version agnostique)
  | 'CONTEXT_ENGINE'      // 60%
  | 'BA_OVERRIDE';        // 100% (le BA a vérifié)

type FactEventType =
  | 'CREATED'             // Nouveau fait
  | 'SUPERSEDED'          // Remplacé par un fait plus fiable
  | 'DISPUTED'            // Contradiction détectée
  | 'RESOLVED'            // Contradiction résolue
  | 'DELETED';            // Soft delete par BA

// ═══════════════════════════════════════════════════════════════════════
// VUE MATÉRIALISÉE: current_facts (recalculée après chaque event)
// ═══════════════════════════════════════════════════════════════════════

interface CurrentFact {
  dealId: string;
  factKey: string;
  category: FactCategory;

  // Valeur courante
  currentValue: any;
  currentDisplayValue: string;
  currentSource: FactSource;
  currentConfidence: number;

  // État
  isDisputed: boolean;           // Contradiction non résolue
  disputeDetails?: {
    conflictingValue: any;
    conflictingSource: FactSource;
  };

  // Historique
  eventHistory: FactEvent[];     // Tous les events pour ce factKey
  firstSeenAt: Date;
  lastUpdatedAt: Date;
}
```

### 2.2 Taxonomie des Fact Keys

```typescript
// ═══════════════════════════════════════════════════════════════════════
// FACT KEYS CANONIQUES (~80 clés standard)
// ═══════════════════════════════════════════════════════════════════════

const FACT_KEYS = {
  // ─── FINANCIAL ───
  'financial.arr': { type: 'currency', unit: 'EUR', category: 'FINANCIAL' },
  'financial.mrr': { type: 'currency', unit: 'EUR', category: 'FINANCIAL' },
  'financial.revenue_growth_yoy': { type: 'percentage', category: 'FINANCIAL' },
  'financial.burn_rate': { type: 'currency', unit: 'EUR/month', category: 'FINANCIAL' },
  'financial.runway_months': { type: 'number', category: 'FINANCIAL' },
  'financial.gross_margin': { type: 'percentage', category: 'FINANCIAL' },
  'financial.valuation': { type: 'currency', unit: 'EUR', category: 'FINANCIAL' },
  'financial.valuation_multiple': { type: 'number', category: 'FINANCIAL' },
  'financial.amount_raised': { type: 'currency', unit: 'EUR', category: 'FINANCIAL' },
  'financial.amount_raising': { type: 'currency', unit: 'EUR', category: 'FINANCIAL' },

  // ─── TRACTION ───
  'traction.churn_monthly': { type: 'percentage', category: 'TRACTION' },
  'traction.churn_annual': { type: 'percentage', category: 'TRACTION' },
  'traction.nrr': { type: 'percentage', category: 'TRACTION' },
  'traction.grr': { type: 'percentage', category: 'TRACTION' },
  'traction.cac': { type: 'currency', unit: 'EUR', category: 'TRACTION' },
  'traction.ltv': { type: 'currency', unit: 'EUR', category: 'TRACTION' },
  'traction.ltv_cac_ratio': { type: 'number', category: 'TRACTION' },
  'traction.customers_count': { type: 'number', category: 'TRACTION' },
  'traction.users_count': { type: 'number', category: 'TRACTION' },
  'traction.dau': { type: 'number', category: 'TRACTION' },
  'traction.mau': { type: 'number', category: 'TRACTION' },

  // ─── TEAM ───
  'team.size': { type: 'number', category: 'TEAM' },
  'team.founders_count': { type: 'number', category: 'TEAM' },
  'team.technical_ratio': { type: 'percentage', category: 'TEAM' },
  'team.ceo.name': { type: 'string', category: 'TEAM' },
  'team.ceo.background': { type: 'string', category: 'TEAM' },
  'team.ceo.linkedin': { type: 'url', category: 'TEAM' },
  'team.ceo.previous_exits': { type: 'number', category: 'TEAM' },
  'team.cto.name': { type: 'string', category: 'TEAM' },
  'team.cto.background': { type: 'string', category: 'TEAM' },
  'team.advisors': { type: 'array', category: 'TEAM' },
  'team.vesting_months': { type: 'number', category: 'TEAM' },
  'team.cliff_months': { type: 'number', category: 'TEAM' },

  // ─── MARKET ───
  'market.tam': { type: 'currency', unit: 'EUR', category: 'MARKET' },
  'market.sam': { type: 'currency', unit: 'EUR', category: 'MARKET' },
  'market.som': { type: 'currency', unit: 'EUR', category: 'MARKET' },
  'market.growth_rate': { type: 'percentage', category: 'MARKET' },
  'market.geography': { type: 'string', category: 'MARKET' },

  // ─── PRODUCT ───
  'product.name': { type: 'string', category: 'PRODUCT' },
  'product.stage': { type: 'enum', values: ['idea', 'mvp', 'beta', 'launched', 'scaling'], category: 'PRODUCT' },
  'product.launch_date': { type: 'date', category: 'PRODUCT' },
  'product.tech_stack': { type: 'array', category: 'PRODUCT' },

  // ─── COMPETITION ───
  'competition.main_competitor': { type: 'string', category: 'COMPETITION' },
  'competition.competitors_count': { type: 'number', category: 'COMPETITION' },
  'competition.competitors_list': { type: 'array', category: 'COMPETITION' },
  'competition.differentiation': { type: 'string', category: 'COMPETITION' },

  // ─── LEGAL ───
  'legal.incorporation_country': { type: 'string', category: 'LEGAL' },
  'legal.incorporation_date': { type: 'date', category: 'LEGAL' },
  'legal.patents_count': { type: 'number', category: 'LEGAL' },
  'legal.pending_litigation': { type: 'boolean', category: 'LEGAL' },
} as const;
```

### 2.3 Prisma Schema

```prisma
// À ajouter dans prisma/schema.prisma

model FactEvent {
  id                  String        @id @default(uuid())
  dealId              String
  deal                Deal          @relation(fields: [dealId], references: [id], onDelete: Cascade)

  // Identification
  factKey             String
  category            String        // FactCategory

  // Valeur
  value               Json
  displayValue        String
  unit                String?

  // Provenance
  source              String        // FactSource
  sourceDocumentId    String?
  sourceDocument      Document?     @relation(fields: [sourceDocumentId], references: [id])
  sourceQuestionId    String?
  sourceConfidence    Int           // 0-100
  extractedText       String?

  // Event
  eventType           String        // FactEventType
  supersedesEventId   String?
  supersedesEvent     FactEvent?    @relation("Supersession", fields: [supersedesEventId], references: [id])
  supersededBy        FactEvent[]   @relation("Supersession")

  createdAt           DateTime      @default(now())
  createdBy           String        // 'system' | 'ba'
  reason              String?

  @@index([dealId])
  @@index([dealId, factKey])
  @@index([dealId, category])
}

// Vue matérialisée gérée par le code, pas par Prisma
// On la recalcule après chaque FactEvent
```

---

## 3. AGENT FACT-EXTRACTOR (TIER 0)

### 3.1 Positionnement

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PIPELINE D'ANALYSE                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  TIER 0: FACT-EXTRACTOR (NOUVEAU)                                       │
│  ────────────────────────────────                                       │
│  • S'exécute AVANT tous les autres agents                               │
│  • Input: Documents bruts, réponses fondateur                           │
│  • Output: Faits structurés → Fact Store                                │
│  • Modèle: Gemini 3 Flash (rapide, pas cher)                            │
│                                                                          │
│  TIER 1: ANALYSE (12 agents) - Parallèle                                │
│  ────────────────────────────                                           │
│  • Input: Fact Store (pas les docs bruts)                               │
│  • Output: Analyses, red flags, questions                               │
│                                                                          │
│  TIER 2: EXPERTS SECTORIELS (21 agents) - Selon secteur                 │
│  ─────────────────────────────────────                                  │
│  • Input: Fact Store + Tier 1 outputs                                   │
│                                                                          │
│  TIER 3: SYNTHÈSE (5 agents) - Séquentiel                               │
│  ───────────────────────────                                            │
│  • Input: Fact Store + Tier 1 + Tier 2 outputs                          │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Spécification Agent

```typescript
// src/agents/tier0/fact-extractor.ts

/**
 * FACT-EXTRACTOR AGENT
 *
 * MISSION: Extraire TOUS les faits factuels des documents et réponses,
 * les structurer avec des clés canoniques, et détecter les contradictions.
 *
 * PERSONA: Data Analyst Senior (15+ ans) spécialisé en extraction d'information
 * structurée. Ex-Big4, expert en data quality et normalisation.
 *
 * RÈGLES ABSOLUES:
 * - Ne JAMAIS inventer un fait
 * - Toujours citer le texte source exact
 * - Assigner un confidence score réaliste
 * - Détecter les contradictions avec les faits existants
 */

const SYSTEM_PROMPT = `
Tu es un Data Analyst Senior avec 15+ ans d'expérience en extraction d'information structurée.
Ton travail : extraire TOUS les faits factuels d'un document ou d'une réponse fondateur.

## DÉFINITION D'UN FAIT

Un fait est une information OBJECTIVE et VÉRIFIABLE:
- Chiffres (ARR, churn, team size, valorisation...)
- Noms (fondateurs, investisseurs, concurrents...)
- Dates (création, levées, milestones...)
- Statuts (incorporated, revenue stage, product stage...)

Un fait n'est PAS:
- Une opinion ("le marché est prometteur")
- Une projection non sourcée ("on fera 10M€ l'an prochain")
- Une affirmation vague ("forte croissance")

## OUTPUT FORMAT

Pour chaque fait extrait:
{
  "factKey": "financial.arr",           // Clé canonique (voir taxonomie)
  "value": 535000,                       // Valeur brute
  "displayValue": "535K€",               // Version lisible
  "unit": "EUR",                         // Unité si applicable
  "confidence": 95,                      // 0-100
  "extractedText": "Notre ARR actuel est de 535K€",  // Texte source EXACT
  "reasoning": "Chiffre explicite mentionné par le fondateur"
}

## CONFIDENCE SCORING

- 95-100: Fait explicite, sans ambiguïté ("Notre ARR est de 535K€")
- 80-94: Fait clair mais nécessite léger calcul ("MRR de 45K€" → ARR ~540K€)
- 60-79: Fait implicite ou déductible ("équipe de 8 dont 5 devs" → ratio tech 62%)
- 40-59: Fait incertain, approximatif ("environ 500K€ de CA")
- <40: Trop incertain, NE PAS EXTRAIRE

## DÉTECTION DE CONTRADICTIONS

Tu recevras les faits existants du Fact Store.
Si un nouveau fait contredit un existant:
{
  "factKey": "financial.arr",
  "value": 535000,
  "existingValue": 500000,
  "existingSource": "PITCH_DECK",
  "contradiction": {
    "type": "VALUE_MISMATCH",
    "delta": "+7%",
    "significance": "MINOR",  // MINOR (<10%) | SIGNIFICANT (10-30%) | MAJOR (>30%)
    "recommendation": "SUPERSEDE"  // SUPERSEDE | FLAG_FOR_REVIEW | KEEP_BOTH
  }
}

## RÈGLES ABSOLUES

1. Ne JAMAIS inventer un fait qui n'est pas dans le texte
2. Toujours inclure extractedText avec le texte EXACT source
3. Si un chiffre est ambigu, utiliser confidence < 80
4. Si deux interprétations possibles, choisir la plus conservatrice
5. Extraire TOUS les faits, même ceux qui semblent mineurs
`;

const USER_PROMPT_TEMPLATE = `
## DOCUMENT À ANALYSER

Type: {{documentType}}
Source: {{source}}
Date: {{date}}

---
{{content}}
---

## FAITS EXISTANTS (Fact Store actuel)

{{existingFacts}}

## INSTRUCTIONS

1. Extrais TOUS les faits factuels du document
2. Assigne une factKey canonique à chaque fait
3. Compare avec les faits existants et signale les contradictions
4. Retourne un JSON array de faits

## OUTPUT

Retourne un JSON valide:
{
  "facts": [...],
  "contradictions": [...],
  "metadata": {
    "factsExtracted": number,
    "contradictionsDetected": number,
    "averageConfidence": number
  }
}
`;
```

### 3.3 Intégration dans le Pipeline

```typescript
// src/agents/orchestrator/index.ts

async function runAnalysisWithFactStore(dealId: string, options: AnalysisOptions) {

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 0: EXTRACTION DES FAITS
  // ═══════════════════════════════════════════════════════════════════

  // Récupérer les documents à analyser
  const documents = await getDocumentsToAnalyze(dealId, options);

  // Récupérer les faits existants
  const existingFacts = await getCurrentFacts(dealId);

  // Extraire les nouveaux faits
  const extractionResult = await factExtractor.extract({
    documents,
    existingFacts,
    founderResponses: options.founderResponses || [],
  });

  // Persister les nouveaux faits
  await persistFactEvents(dealId, extractionResult.facts);

  // Gérer les contradictions
  if (extractionResult.contradictions.length > 0) {
    await handleContradictions(dealId, extractionResult.contradictions);
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 1-3: ANALYSE (inchangée, mais input = Fact Store)
  // ═══════════════════════════════════════════════════════════════════

  // Récupérer le Fact Store mis à jour
  const factStore = await getCurrentFacts(dealId);

  // Les agents reçoivent le factStore au lieu des docs bruts
  const tier1Results = await runTier1Agents({ factStore, ...options });
  const tier2Results = await runTier2Agents({ factStore, tier1Results, ...options });
  const tier3Results = await runTier3Agents({ factStore, tier1Results, tier2Results, ...options });

  return { tier1Results, tier2Results, tier3Results };
}
```

---

## 4. PIPELINE D'EXTRACTION ET MATCHING

### 4.1 Flow Complet

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PIPELINE D'EXTRACTION                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. TRIGGER                                                              │
│  ─────────                                                               │
│  • Upload document (deck, data room, financial model)                   │
│  • Réponse fondateur à une question                                     │
│  • BA ajoute une note/override                                          │
│                                                                          │
│                          ▼                                               │
│                                                                          │
│  2. FACT-EXTRACTOR                                                       │
│  ─────────────────                                                       │
│  • Parse le contenu                                                      │
│  • Extrait les faits structurés                                         │
│  • Assigne les factKeys canoniques                                      │
│  • Calcule les confidence scores                                        │
│                                                                          │
│                          ▼                                               │
│                                                                          │
│  3. MATCHING ENGINE                                                      │
│  ─────────────────                                                       │
│  Pour chaque fait extrait:                                              │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ A. Exact Key Match?                                             │    │
│  │    factKey === existingFactKey                                  │    │
│  │    → OUI: Aller à Supersession Logic                            │    │
│  │    → NON: Continuer                                             │    │
│  │                                                                  │    │
│  │ B. Fuzzy Key Match?                                             │    │
│  │    "team.cto" vs "team.cto.name"                                │    │
│  │    → OUI: LLM Review pour décider                               │    │
│  │    → NON: Continuer                                             │    │
│  │                                                                  │    │
│  │ C. Semantic Match? (rare)                                       │    │
│  │    "churn 4%" vs "nous perdons 4% de clients"                   │    │
│  │    → LLM décide si c'est le même fait                           │    │
│  │    → NON: Nouveau fait                                          │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│                          ▼                                               │
│                                                                          │
│  4. SUPERSESSION LOGIC                                                   │
│  ─────────────────────                                                   │
│  Si match trouvé:                                                        │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ Source Priority:                                                │    │
│  │ DATA_ROOM (100) > FINANCIAL_MODEL (95) > FOUNDER_RESPONSE (90) │    │
│  │ > PITCH_DECK (80) > CONTEXT_ENGINE (60)                        │    │
│  │                                                                  │    │
│  │ Règles:                                                         │    │
│  │ • newSource > existingSource → SUPERSEDE                        │    │
│  │ • newSource == existingSource → Plus récent gagne               │    │
│  │ • newSource < existingSource → IGNORE (sauf BA_OVERRIDE)        │    │
│  │ • Contradiction majeure (>30% delta) → FLAG_FOR_REVIEW          │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│                          ▼                                               │
│                                                                          │
│  5. PERSIST EVENTS                                                       │
│  ───────────────                                                         │
│  • Créer FactEvent pour chaque fait                                     │
│  • Si supersession: lier avec supersedesEventId                         │
│  • Recalculer current_facts view                                        │
│  • Logger pour audit                                                    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Code de Matching

```typescript
// src/services/fact-store/matching.ts

interface MatchResult {
  type: 'NEW' | 'SUPERSEDE' | 'IGNORE' | 'REVIEW_NEEDED';
  existingFact?: CurrentFact;
  reason: string;
}

function matchFact(
  newFact: ExtractedFact,
  existingFacts: CurrentFact[]
): MatchResult {

  // 1. Exact key match
  const exactMatch = existingFacts.find(f => f.factKey === newFact.factKey);

  if (exactMatch) {
    return resolveSupersession(newFact, exactMatch);
  }

  // 2. Fuzzy key match (parent/child keys)
  const fuzzyMatch = existingFacts.find(f =>
    f.factKey.startsWith(newFact.factKey + '.') ||
    newFact.factKey.startsWith(f.factKey + '.')
  );

  if (fuzzyMatch) {
    return {
      type: 'REVIEW_NEEDED',
      existingFact: fuzzyMatch,
      reason: `Fuzzy match: ${newFact.factKey} vs ${fuzzyMatch.factKey}`
    };
  }

  // 3. No match → new fact
  return { type: 'NEW', reason: 'No existing fact with this key' };
}

function resolveSupersession(
  newFact: ExtractedFact,
  existing: CurrentFact
): MatchResult {

  const SOURCE_PRIORITY: Record<FactSource, number> = {
    'DATA_ROOM': 100,
    'FINANCIAL_MODEL': 95,
    'FOUNDER_RESPONSE': 90,
    'BA_OVERRIDE': 100,  // BA a toujours raison
    'PITCH_DECK': 80,
    'CONTEXT_ENGINE': 60,
  };

  const newPriority = SOURCE_PRIORITY[newFact.source];
  const existingPriority = SOURCE_PRIORITY[existing.currentSource];

  // Calculer le delta si valeurs numériques
  let delta: number | null = null;
  if (typeof newFact.value === 'number' && typeof existing.currentValue === 'number') {
    delta = Math.abs((newFact.value - existing.currentValue) / existing.currentValue);
  }

  // Contradiction majeure → review
  if (delta !== null && delta > 0.30) {
    return {
      type: 'REVIEW_NEEDED',
      existingFact: existing,
      reason: `Major contradiction: ${(delta * 100).toFixed(0)}% difference`
    };
  }

  // Nouvelle source plus fiable → supersede
  if (newPriority > existingPriority) {
    return {
      type: 'SUPERSEDE',
      existingFact: existing,
      reason: `Higher priority source: ${newFact.source} > ${existing.currentSource}`
    };
  }

  // Même priorité, plus récent → supersede
  if (newPriority === existingPriority) {
    return {
      type: 'SUPERSEDE',
      existingFact: existing,
      reason: `Same source, more recent`
    };
  }

  // Source moins fiable → ignore
  return {
    type: 'IGNORE',
    existingFact: existing,
    reason: `Lower priority source: ${newFact.source} < ${existing.currentSource}`
  };
}
```

---

## 5. GESTION DES CONTRADICTIONS

### 5.1 Types de Contradictions

| Type | Exemple | Résolution |
|------|---------|------------|
| **VALUE_MISMATCH** | ARR 500K€ (deck) vs 535K€ (data room) | Auto: source plus fiable gagne |
| **CLAIM_VS_DATA** | "Pas de concurrent" vs 5 concurrents DB | Flag RED FLAG + question fondateur |
| **INTERNAL** | Page 5: 8 personnes, Page 12: 10 personnes | Review BA |
| **TEMPORAL** | Deck Jan: ARR 500K€, Deck Fev: ARR 480K€ | Plus récent gagne, mais flag si baisse |

### 5.2 Flow de Résolution

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CONTRADICTION RESOLUTION                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  DÉTECTION                                                               │
│  ──────────                                                              │
│  fact-extractor détecte: ARR deck (500K€) ≠ ARR data room (535K€)       │
│                                                                          │
│                          ▼                                               │
│                                                                          │
│  CLASSIFICATION                                                          │
│  ──────────────                                                          │
│  • Delta: +7% → MINOR (<10%)                                            │
│  • Sources: DATA_ROOM > PITCH_DECK                                      │
│  • Décision: AUTO_RESOLVE                                               │
│                                                                          │
│                          ▼                                               │
│                                                                          │
│  RÉSOLUTION AUTO                                                         │
│  ───────────────                                                         │
│  • Créer event SUPERSEDED pour ancien fait                              │
│  • Créer event CREATED pour nouveau fait                                │
│  • Logger: "ARR mis à jour: 500K→535K (data room supersedes deck)"      │
│                                                                          │
│  ═══════════════════════════════════════════════════════════════════════ │
│                                                                          │
│  CAS 2: CONTRADICTION MAJEURE                                            │
│  ─────────────────────────────                                           │
│  Fondateur dit: "Pas de concurrent direct"                              │
│  Funding DB: 5 concurrents identifiés                                   │
│                                                                          │
│                          ▼                                               │
│                                                                          │
│  CLASSIFICATION                                                          │
│  ──────────────                                                          │
│  • Type: CLAIM_VS_DATA                                                  │
│  • Gravité: MAJOR                                                       │
│  • Décision: FLAG_FOR_REVIEW                                            │
│                                                                          │
│                          ▼                                               │
│                                                                          │
│  ACTIONS                                                                 │
│  ───────                                                                 │
│  1. Les DEUX faits conservés avec tag "disputed"                        │
│  2. contradiction-detector génère RED FLAG CRITICAL                     │
│  3. Question auto générée pour le fondateur                             │
│  4. UI affiche l'alerte au BA                                           │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ ⚠️ CONTRADICTION DÉTECTÉE                                          │ │
│  │                                                                     │ │
│  │ Le fondateur affirme: "Pas de concurrent direct"                   │ │
│  │ Notre DB contient: 5 concurrents (Acme, Beta, Gamma...)            │ │
│  │                                                                     │ │
│  │ [Voir détails]  [Fondateur a raison]  [DB a raison]  [Creuser]     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. INTÉGRATION AVEC LES AGENTS

### 6.1 Input des Agents Tier 1/2/3

Les agents ne reçoivent plus les documents bruts, mais le **Fact Store formaté** :

```typescript
// Format d'injection dans les prompts agents

function formatFactStoreForAgent(facts: CurrentFact[]): string {
  const grouped = groupBy(facts, 'category');

  let output = '## DONNÉES VÉRIFIÉES (Fact Store)\n\n';

  for (const [category, categoryFacts] of Object.entries(grouped)) {
    output += `### ${category}\n\n`;

    for (const fact of categoryFacts) {
      const confidence = fact.currentConfidence >= 90 ? '✓' :
                         fact.currentConfidence >= 70 ? '~' : '?';
      const disputed = fact.isDisputed ? ' ⚠️ DISPUTED' : '';

      output += `- **${fact.factKey}**: ${fact.currentDisplayValue} [${confidence}]${disputed}\n`;
      output += `  Source: ${fact.currentSource}\n`;
    }

    output += '\n';
  }

  return output;
}

// Exemple d'output:
`
## DONNÉES VÉRIFIÉES (Fact Store)

### FINANCIAL

- **financial.arr**: 535K€ [✓]
  Source: DATA_ROOM
- **financial.valuation**: 15M€ [✓]
  Source: PITCH_DECK
- **financial.burn_rate**: 45K€/mois [~]
  Source: FOUNDER_RESPONSE

### TEAM

- **team.size**: 8 [✓]
  Source: PITCH_DECK
- **team.ceo.name**: Jean Dupont [✓]
  Source: PITCH_DECK
- **team.cto.background**: Ex-Google [~]
  Source: CONTEXT_ENGINE

### TRACTION

- **traction.churn_monthly**: 4% [✓]
  Source: FOUNDER_RESPONSE
- **traction.nrr**: UNKNOWN ⚠️
  Source: N/A
`
```

### 6.2 Mise à Jour du Prompt des Agents

Chaque agent Tier 1/2/3 doit être mis à jour pour :
1. Recevoir le Fact Store au lieu des docs bruts
2. Baser son analyse sur les faits vérifiés
3. Signaler les faits manquants (UNKNOWN)

---

## 7. UI/UX

### 7.1 Timeline "Ligne de Métro"

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ANALYSE - Deal Antiopea                                     Score: 78  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  HISTORIQUE                                                              │
│                                                                          │
│  ●━━━━━━━━━━━●━━━━━━━━━━━●━━━━━━━━━━━◉                                   │
│  │           │           │           │                                   │
│  V1          V2          V3          V4 (current)                        │
│  15 jan      22 jan      25 jan      28 jan                              │
│  Score: 68   Score: 72   Score: 74   Score: 78                           │
│  ↓           ↓           ↓                                               │
│  Initial     +réponses   +data room                                      │
│                                                                          │
│  [Clic sur un point → affiche cette version en lecture seule]           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Highlights des Changements

Dans la version courante, les changements depuis V(n-1) sont mis en évidence :

| Élément | Style |
|---------|-------|
| Score/métrique changé | `↑+3` ou `↓-2` en vert/rouge discret |
| Texte modifié | Background vert très subtil (#f0fdf4) |
| Red flag résolu | Texte barré + badge "RÉSOLU" vert |
| Nouveau fait | Indicateur discret "New" ou bordure gauche verte |

### 7.3 Questions Répondues

```
┌─────────────────────────────────────────────────────────────────────────┐
│  QUESTIONS POUR LE FONDATEUR                                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  EN ATTENTE (3)                                               [Expand]  │
│  ──────────────────────────────────────────────────────────────────────  │
│  🔴 Quelle est votre runway actuelle ?                                  │
│  🟠 Comment justifiez-vous la valorisation 30x ARR ?                    │
│  🟡 Avez-vous des brevets déposés ?                                     │
│                                                                          │
│  ──────────────────────────────────────────────────────────────────────  │
│                                                                          │
│  ✅ RÉPONDUES (2)                                            [Collapse] │
│  ──────────────────────────────────────────────────────────────────────  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ ✓ Quel est votre churn mensuel ?                                   │ │
│  │   Réponse: "4% mensuel, en baisse vs 6% il y a 6 mois"            │ │
│  │   Impact: Score +3, Red Flag résolu                                │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.4 Input des Réponses (Hybride)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  📝 RÉPONSES DU FONDATEUR                                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  TEAM (2 questions)                                                      │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ Q: "Pourquoi le CTO est-il parti ?"                                │ │
│  │ ┌────────────────────────────────────────────────────────────────┐ │ │
│  │ │                                                                 │ │ │
│  │ └────────────────────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  FINANCIAL (1 question)                                                  │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ Q: "Quel est votre churn mensuel ?"                                │ │
│  │ ┌────────────────────────────────────────────────────────────────┐ │ │
│  │ │                                                                 │ │ │
│  │ └────────────────────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ──────────────────────────────────────────────────────────────────────  │
│                                                                          │
│  📎 NOTES LIBRES (optionnel)                                            │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ Collez vos notes de call, emails, etc.                            │ │
│  │ L'IA extraira automatiquement les informations pertinentes.       │ │
│  │                                                                    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  📄 Joindre un document                                                  │
│                                                                          │
│  ──────────────────────────────────────────────────────────────────────  │
│                                                                          │
│  [Soumettre les réponses]                                               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.5 Nudge de Mise à Jour

```
┌─────────────────────────────────────────────────────────────────────────┐
│  💡 MISE À JOUR DISPONIBLE                                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Depuis la dernière analyse:                                            │
│  • 3 réponses du fondateur ajoutées                                     │
│  • 1 nouveau document uploadé (Financial Model)                         │
│                                                                          │
│  [Mettre à jour l'analyse]                        [Plus tard]           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Note importante** : Jamais afficher de coût ni de prédiction d'impact score.

---

## 8. CREDIT SYSTEM

### 8.1 Vue d'Ensemble

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CREDIT SYSTEM                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  PLAN FREE                           PLAN PRO (249€/mois)               │
│  ────────────                        ─────────────────────               │
│                                                                          │
│  X crédits/mois (à définir)          Crédits illimités                  │
│                                                                          │
│  Actions coûteuses:                  Tout illimité:                     │
│  • Analyse initiale    5 cr          • Analyses                         │
│  • Update/Re-run       2 cr          • Updates                          │
│  • AI Board           10 cr          • AI Boards (5 inclus)             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Data Model

```typescript
// src/services/credits/types.ts

interface UserCredits {
  userId: string;

  // Solde actuel
  balance: number;

  // Allocation mensuelle (selon plan)
  monthlyAllocation: number;  // X pour FREE, Infinity pour PRO

  // Reset mensuel
  lastResetAt: Date;
  nextResetAt: Date;

  // Historique
  transactions: CreditTransaction[];
}

interface CreditTransaction {
  id: string;
  userId: string;

  // Type d'action
  type: CreditActionType;
  amount: number;  // négatif = dépense, positif = crédit

  // Contexte
  dealId?: string;
  analysisId?: string;

  // Metadata
  createdAt: Date;
  description: string;  // "Analyse initiale - Deal Antiopea"
}

type CreditActionType =
  | 'INITIAL_ANALYSIS'
  | 'UPDATE_ANALYSIS'
  | 'AI_BOARD'
  | 'MONTHLY_RESET'
  | 'BONUS'
  | 'REFUND';

const CREDIT_COSTS: Record<string, number> = {
  INITIAL_ANALYSIS: 5,
  UPDATE_ANALYSIS: 2,
  AI_BOARD: 10,
};
```

### 8.3 Prisma Schema

```prisma
model UserCredits {
  id                  String              @id @default(uuid())
  userId              String              @unique

  balance             Int                 @default(0)
  monthlyAllocation   Int                 @default(10)  // 10 pour FREE

  lastResetAt         DateTime            @default(now())
  nextResetAt         DateTime

  transactions        CreditTransaction[]

  createdAt           DateTime            @default(now())
  updatedAt           DateTime            @updatedAt
}

model CreditTransaction {
  id                  String        @id @default(uuid())
  userId              String
  userCredits         UserCredits   @relation(fields: [userId], references: [userId])

  type                String        // CreditActionType
  amount              Int           // négatif = dépense

  dealId              String?
  analysisId          String?

  description         String
  createdAt           DateTime      @default(now())

  @@index([userId])
  @@index([userId, createdAt])
}
```

### 8.4 Usage Gate (Abstraction)

```typescript
// src/services/usage-gate/index.ts

interface UsageGate {
  canPerform(userId: string, action: CreditActionType): Promise<CanPerformResult>;
  recordUsage(userId: string, action: CreditActionType, metadata?: any): Promise<void>;
  getBalance(userId: string): Promise<UserCredits>;
}

interface CanPerformResult {
  allowed: boolean;
  reason: 'OK' | 'INSUFFICIENT_CREDITS' | 'UPGRADE_REQUIRED';
  currentBalance?: number;
  cost?: number;
  resetsAt?: Date;
}

// Implémentation
class CreditUsageGate implements UsageGate {

  async canPerform(userId: string, action: CreditActionType): Promise<CanPerformResult> {
    const credits = await this.getBalance(userId);

    // PRO = illimité
    if (credits.monthlyAllocation === Infinity) {
      return { allowed: true, reason: 'OK' };
    }

    const cost = CREDIT_COSTS[action] || 0;

    if (credits.balance >= cost) {
      return {
        allowed: true,
        reason: 'OK',
        currentBalance: credits.balance,
        cost,
      };
    }

    return {
      allowed: false,
      reason: 'INSUFFICIENT_CREDITS',
      currentBalance: credits.balance,
      cost,
      resetsAt: credits.nextResetAt,
    };
  }

  async recordUsage(userId: string, action: CreditActionType, metadata?: any): Promise<void> {
    const cost = CREDIT_COSTS[action] || 0;

    await db.$transaction([
      db.userCredits.update({
        where: { userId },
        data: { balance: { decrement: cost } },
      }),
      db.creditTransaction.create({
        data: {
          userId,
          type: action,
          amount: -cost,
          dealId: metadata?.dealId,
          analysisId: metadata?.analysisId,
          description: `${action} - ${metadata?.dealName || 'N/A'}`,
        },
      }),
    ]);
  }
}
```

### 8.5 UI Crédits

```
┌─────────────────────────────────────────────────────────────────────────┐
│  HEADER (FREE users only)                                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Angel Desk                                    🪙 7 crédits restants    │
│                                                Renouvellement: 12 jours │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  MODAL AVANT ACTION COÛTEUSE                                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  🪙 Cette action utilise 2 crédits                                      │
│                                                                          │
│  Solde actuel: 7 crédits                                                │
│  Après: 5 crédits                                                       │
│                                                                          │
│  [Confirmer]                         [Annuler]                          │
│                                                                          │
│  ─────────────────────────────────────────────────────────────────────  │
│  💎 Passez à PRO pour des analyses illimitées                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  MODAL CRÉDITS INSUFFISANTS                                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  🪙 Crédits insuffisants                                                │
│                                                                          │
│  Cette action nécessite 5 crédits.                                      │
│  Vous avez 2 crédits.                                                   │
│                                                                          │
│  Vos crédits se renouvellent dans 12 jours.                             │
│                                                                          │
│  [Passer à PRO - Illimité]                                              │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. PLAN D'IMPLÉMENTATION

### 9.1 Ordre des Tâches

```
PHASE 1: FONDATIONS (3-4 jours)
═══════════════════════════════
├── 1.1 Prisma Schema
│   • Ajouter modèles FactEvent, UserCredits, CreditTransaction
│   • Migration DB
│
├── 1.2 Services de base
│   • src/services/fact-store/index.ts
│   • src/services/fact-store/matching.ts
│   • src/services/credits/index.ts
│   • src/services/usage-gate/index.ts
│
└── 1.3 Agent fact-extractor
    • src/agents/tier0/fact-extractor.ts
    • Tests unitaires

PHASE 2: INTÉGRATION PIPELINE (2-3 jours)
═════════════════════════════════════════
├── 2.1 Modifier Orchestrator
│   • Appeler fact-extractor en premier (Tier 0)
│   • Passer Fact Store aux agents Tier 1/2/3
│
├── 2.2 Adapter les agents
│   • Modifier les prompts pour utiliser Fact Store
│   • Tester avec quelques agents clés
│
└── 2.3 Intégrer Usage Gate
    • Hooks avant analyse/update
    • Décompte des crédits

PHASE 3: UI (3-4 jours)
═══════════════════════
├── 3.1 Timeline versions
│   • Composant TimelineVersions
│   • Navigation entre versions
│
├── 3.2 Highlights changements
│   • Badge deltas (↑↓)
│   • Background subtle pour texte modifié
│
├── 3.3 Input réponses
│   • Formulaire hybride (par question + notes libres)
│   • Section questions répondues
│
├── 3.4 UI Crédits
│   • Badge header (FREE users)
│   • Modal confirmation
│   • Modal insuffisant
│
└── 3.5 Nudge update
    • Banner "Mise à jour disponible"

PHASE 4: POLISH (1-2 jours)
═══════════════════════════
├── 4.1 Tests end-to-end
├── 4.2 Gestion erreurs
└── 4.3 Documentation utilisateur
```

### 9.2 Dépendances

```
fact-extractor ──────────────────────────────────────────────────┐
      │                                                           │
      ▼                                                           │
Fact Store (DB) ─────────────────────────────────────────────────┤
      │                                                           │
      ├──────────────────┬──────────────────┬────────────────────┤
      ▼                  ▼                  ▼                    │
Tier 1 Agents      Tier 2 Agents      Tier 3 Agents             │
      │                  │                  │                    │
      └──────────────────┴──────────────────┘                    │
                         │                                        │
                         ▼                                        │
              Analysis Versions ◄─────────────────────────────────┘
                         │
                         ▼
              UI (Timeline, Highlights)
                         │
                         ▼
              Credit System (gate avant actions)
```

### 9.3 Fichiers à Créer

```
src/
├── agents/
│   └── tier0/
│       └── fact-extractor.ts         [NOUVEAU]
│
├── services/
│   ├── fact-store/
│   │   ├── index.ts                  [NOUVEAU]
│   │   ├── types.ts                  [NOUVEAU]
│   │   ├── matching.ts               [NOUVEAU]
│   │   └── persistence.ts            [NOUVEAU]
│   │
│   ├── credits/
│   │   ├── index.ts                  [NOUVEAU]
│   │   └── types.ts                  [NOUVEAU]
│   │
│   └── usage-gate/
│       └── index.ts                  [NOUVEAU]
│
├── components/
│   ├── deals/
│   │   ├── timeline-versions.tsx     [NOUVEAU]
│   │   ├── fact-highlights.tsx       [NOUVEAU]
│   │   └── founder-responses.tsx     [NOUVEAU]
│   │
│   └── credits/
│       ├── credit-badge.tsx          [NOUVEAU]
│       ├── credit-modal.tsx          [NOUVEAU]
│       └── insufficient-modal.tsx    [NOUVEAU]
│
└── app/
    └── api/
        ├── facts/
        │   └── route.ts              [NOUVEAU]
        └── credits/
            └── route.ts              [NOUVEAU]
```

### 9.4 Fichiers à Modifier

```
prisma/
└── schema.prisma                     [MODIFIER: ajouter modèles]

src/
├── agents/
│   ├── orchestrator/
│   │   └── index.ts                  [MODIFIER: intégrer Tier 0]
│   ├── tier1/*.ts                    [MODIFIER: recevoir Fact Store]
│   ├── tier2/*.ts                    [MODIFIER: recevoir Fact Store]
│   └── tier3/*.ts                    [MODIFIER: recevoir Fact Store]
│
├── components/
│   └── deals/
│       ├── analysis-panel.tsx        [MODIFIER: timeline, highlights]
│       └── questions-section.tsx     [MODIFIER: réponses fondateur]
│
└── app/
    └── api/
        └── analyze/
            └── route.ts              [MODIFIER: usage gate]
```

---

## ANNEXES

### A. Décisions Clés Documentées

| Décision | Choix | Justification |
|----------|-------|---------------|
| Event sourcing vs table simple | Event sourcing | Audit trail, historique complet, reconstruction possible |
| Extraction: agent dédié vs distribué | Agent dédié (fact-extractor) | Spécialisation = qualité, réutilisable |
| Matching: clé vs embedding | Clé canonique + LLM fallback | Rapide et déterministe (99% cas), LLM pour edge cases |
| UI versions: diff vs timeline | Timeline "métro" | Plus simple, moins de bruit, BA consulte individuellement |
| Re-run trigger: auto vs manuel | Manuel avec nudge | BA contrôle ses crédits, pas de spam |
| Historique: combien de versions | 3 versions | Suffisant pour comparaison, pas trop de storage |
| Crédits: maintenant vs plus tard | Maintenant | Même fichiers touchés, évite refacto |

### B. Questions Ouvertes

| Question | Status | Notes |
|----------|--------|-------|
| Nombre de crédits FREE par mois | À définir | 5? 10? 15? À tester |
| Coût AI Board en crédits | À définir | 10 proposé, à valider |
| Export PDF: crédits ou gratuit ? | À définir | Probablement PRO-only |

---

**FIN DU DOCUMENT**
