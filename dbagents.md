# DB Agents - Système de Maintenance Automatisée

> Document de référence pour le système de maintenance automatisée de la base de données FullInvest.

**Version**: 1.2
**Dernière mise à jour**: 2026-01-26
**Status**: En cours d'implémentation (Tests validés)

---

## Document connexe: Exploitation de la DB

**IMPORTANT**: Ce document traite de la **maintenance** de la DB (nettoyage, import, enrichissement).

Pour l'**exploitation** de la DB par les agents d'analyse (Tier 1), voir:
→ **`DB-EXPLOITATION-SPEC.md`** - Spécification des usages de la DB pour:
  - Détection de concurrents
  - Benchmark valorisation
  - Validation market timing
  - Track record investisseurs

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture](#2-architecture)
3. [Les 4 agents](#3-les-4-agents)
4. [Supervisor](#4-supervisor)
5. [Bot Telegram](#5-bot-telegram)
6. [Notifications](#6-notifications)
7. [Schema Prisma](#7-schema-prisma)
8. [Structure des fichiers](#8-structure-des-fichiers)
9. [Configuration Cron](#9-configuration-cron)
10. [Variables d'environnement](#10-variables-denvironnement)
11. [Coûts estimés](#11-coûts-estimés)
12. [État d'implémentation](#12-état-dimplémentation)

---

## 1. Vue d'ensemble

### Problème résolu

La qualité des données est le fondement de FullInvest. Sans données propres et enrichies :
- Les analyses sont faussées
- Les comparaisons de deals sont incorrectes
- Les benchmarks sont inutiles

### Solution

4 agents autonomes qui maintiennent la DB propre et enrichie :

| Agent | Rôle | Fréquence |
|-------|------|-----------|
| **DB_CLEANER** | Nettoyer, dédupliquer, normaliser | Dimanche 03:00 |
| **DB_SOURCER** | Importer nouvelles données | Mardi 03:00 |
| **DB_COMPLETER** | Enrichir via web + LLM | Jeudi + Samedi 03:00 |
| **SUPERVISOR** | Vérifier, retry, alerter | +2h après chaque agent |

### Principe de supervision

Le SUPERVISOR vérifie **2 heures après** chaque agent :
- Si l'agent a bien tourné
- Si les résultats sont satisfaisants
- Relance automatiquement si échec (max 2 retries)
- Alerte par Telegram/Email si problème critique

---

## 2. Architecture

### Schéma global

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                TELEGRAM BOT                                  │
│                                                                              │
│   Commandes: /status /run /report /health /last /retry /cancel /help        │
│   Notifications: retries, recoveries, alertes, rapport hebdo                │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              VERCEL (API Routes)                             │
│                                                                              │
│   /api/telegram/webhook          ← Reçoit les commandes                     │
│   /api/cron/maintenance/*        ← Déclenche les agents                     │
│   /api/cron/supervisor/*         ← Déclenche les checks                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           4 AGENTS DE MAINTENANCE                            │
│                                                                              │
│   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                   │
│   │  DB_CLEANER   │  │  DB_SOURCER   │  │ DB_COMPLETER  │                   │
│   │  Dim 03:00    │  │  Mar 03:00    │  │ Jeu+Sam 03:00 │                   │
│   └───────────────┘  └───────────────┘  └───────────────┘                   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         SUPERVISOR                                   │   │
│   │   Vérifie +2h après chaque agent │ Retry si échec │ Rapport hebdo   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            PostgreSQL (Neon)                                 │
│                                                                              │
│   Company │ FundingRound │ MaintenanceRun │ SupervisorCheck │ WeeklyReport  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Planning hebdomadaire

```
LUNDI      MARDI       MERCREDI    JEUDI       VENDREDI    SAMEDI      DIMANCHE

08:00
┌──────┐
│REPORT│◀─── Rapport hebdo Email + Telegram
└──────┘

           03:00                   03:00                   03:00       03:00
           ┌──────┐                ┌──────┐                ┌──────┐    ┌──────┐
           │SOURCE│                │COMPLE│                │COMPLE│    │CLEAN │
           │R     │                │TER   │                │TER   │    │ER    │
           └──────┘                └──────┘                └──────┘    └──────┘

           05:00                   05:00                   05:00       05:00
           ┌──────┐                ┌──────┐                ┌──────┐    ┌──────┐
           │CHECK │◀── +2h        │CHECK │◀── +2h        │CHECK │    │CHECK │
           │SOURCER│               │COMPL.│               │COMPL.│    │CLEAN.│
           └──────┘                └──────┘                └──────┘    └──────┘
```

### Ordre logique

1. **CLEANER** (dimanche) → DB propre pour la semaine
2. **SOURCER** (mardi) → Nouvelles données sur base propre
3. **COMPLETER** (jeudi) → Enrichit le nouveau
4. **COMPLETER** (samedi) → Rattrape le reste
5. **REPORT** (lundi) → Bilan de la semaine

---

## 3. Les 4 agents

### 3.1 DB_CLEANER

**Mission** : Garantir l'intégrité et la propreté des données

**Fréquence** : Dimanche 03:00

**Coût** : ~$0 (pas de LLM, que du SQL)

#### Tâches

| Tâche | Description | Méthode |
|-------|-------------|---------|
| **Doublons Companies** | Fusionner les entrées similaires | Fuzzy matching sur `name` + `slug` (Levenshtein distance < 3) |
| **Doublons FundingRounds** | Éviter les duplicatas | Match sur `companySlug` + `amount` ±10% + `fundingDate` ±7 jours |
| **Données invalides** | Supprimer les entrées inutilisables | `WHERE industry IS NULL AND description IS NULL AND totalRaised IS NULL` |
| **Normalisation pays** | Uniformiser les noms de pays | "USA" → "United States", "uk" → "United Kingdom" |
| **Normalisation stages** | Uniformiser les stages | "pre-seed" → "PRE_SEED", "Serie A" → "SERIES_A" |
| **Normalisation devises** | Convertir en USD | EUR → USD au taux du jour de la levée |
| **Orphelins** | Nettoyer les relations cassées | FundingRounds sans Company valide |
| **Valeurs aberrantes** | Corriger les valeurs impossibles | `foundedYear > 2026`, `foundedYear < 1900`, `totalRaised < 0` |

#### Algorithme de déduplication Companies

```
1. Normaliser le nom (lowercase, remove accents, remove "SAS/SARL/Inc/Ltd")
2. Calculer le slug
3. Grouper par slug
4. Pour chaque groupe > 1:
   a. Calculer Levenshtein distance entre les noms
   b. Si distance < 3 ET même pays → candidat à fusion
   c. Fusionner vers l'entrée avec le plus de données
   d. Transférer les FundingRounds
   e. Logger dans CompanyEnrichment
   f. Supprimer le doublon
```

#### Algorithme de déduplication FundingRounds

```
1. Pour chaque Company:
   a. Récupérer tous les FundingRounds
   b. Grouper par (stage, amount ±10%, date ±7j)
   c. Pour chaque groupe > 1:
      - Garder celui avec le plus de données
      - Merger les infos (investors, etc.)
      - Supprimer les doublons
```

#### Output attendu

```json
{
  "duplicateCompaniesMerged": 23,
  "duplicateFundingRoundsMerged": 12,
  "invalidEntriesRemoved": 5,
  "countriesNormalized": 145,
  "stagesNormalized": 89,
  "orphansRemoved": 3,
  "aberrantValuesFixed": 2
}
```

---

### 3.2 DB_SOURCER

**Mission** : Importer de nouvelles données depuis des sources externes

**Fréquence** : Mardi 03:00

**Coût** : ~$0.10/run (scraping + parsing, pas de LLM)

#### Sources

| Source | Type | Région | URL | Méthode |
|--------|------|--------|-----|---------|
| **FrenchWeb** | News | France | frenchweb.fr | RSS + Scrape |
| **Maddyness** | News | France | maddyness.com | RSS + Scrape |
| **TechCrunch** | News | Global | techcrunch.com/tag/funding | RSS |
| **EU-Startups** | News | Europe | eu-startups.com | RSS |
| **Sifted** | News | Europe | sifted.eu | RSS |
| **Tech.eu** | News | Europe | tech.eu | RSS |

#### Flow de traitement

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ 1. FETCH     │────▶│ 2. PARSE     │────▶│ 3. DEDUP     │────▶│ 4. INSERT    │
│              │     │              │     │              │     │              │
│ RSS feeds    │     │ Extraire:    │     │ Check:       │     │ Créer:       │
│ ou scrape    │     │ - company    │     │ - slug       │     │ - Company    │
│ les sources  │     │ - amount     │     │ - amount     │     │ - FundingRnd │
│              │     │ - date       │     │ - date ±7j   │     │              │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

#### Parsing d'un article de levée

Extraction par regex/heuristiques (pas de LLM pour le sourcer) :

```typescript
interface ParsedFunding {
  companyName: string;        // Regex: première entreprise mentionnée
  amount: number | null;      // Regex: "lève X M€", "raises $X million"
  currency: string;           // EUR, USD, GBP
  stage: string | null;       // Regex: "seed", "série A", "Series B"
  investors: string[];        // Regex: "mené par X", "led by X"
  date: Date;                 // Date de l'article
  sourceUrl: string;
}
```

#### Règles de déduplication à l'import

```
Un funding est un doublon si:
- Même companySlug
- ET montant similaire (±10%)
- ET date proche (±7 jours)
- ET même stage (si connu)
```

#### Output attendu

```json
{
  "sourcesScraped": 6,
  "articlesFound": 156,
  "articlesParsed": 142,
  "duplicatesSkipped": 89,
  "newCompaniesCreated": 47,
  "newFundingRoundsCreated": 53,
  "errors": [
    { "source": "sifted", "error": "Timeout after 30s" }
  ]
}
```

---

### 3.3 DB_COMPLETER

**Mission** : Enrichir les données incomplètes via recherche web + LLM + **détection du statut d'activité**

**Fréquence** : Jeudi 03:00 + Samedi 03:00

**Coût** : ~$1.30/1000 companies (~$0.26/run de 200 companies)

#### Tests réalisés (2026-01-23)

Deux approches ont été testées sur 20 companies :

| Approche | Succès | Confidence | Complétude | Coût/1000 | Richesse données |
|----------|--------|------------|------------|-----------|------------------|
| **Option A: Brave Search + scraping multi-sources + DeepSeek** | 100% | 76% | 84% | ~$1.30 | ⭐⭐⭐⭐⭐ |
| Option B: Scraping sourceUrl seul + DeepSeek | 100% | 92% | - | ~$0.56 | ⭐⭐⭐ |

**Décision : Option A (Brave Search)**

Malgré un coût légèrement plus élevé, Option A est largement supérieure en richesse de données :
- **85% avec fondateurs** (vs ~20% avec Option B)
- **85% avec investisseurs**
- **85% avec année de fondation**
- **85% avec website**
- **60% avec concurrents**
- **3.3 sources scrapées par company** en moyenne

L'écart de coût (~$0.74/1000 companies) est négligeable face au gain en qualité de données.

#### Stack technique

| Composant | Service | Coût | Notes |
|-----------|---------|------|-------|
| **Recherche web** | Brave Search API | Gratuit | 2,000 req/mois (tier gratuit) |
| **LLM extraction** | DeepSeek Chat via OpenRouter | $0.0003/call | ~$0.0003 input, $0.0012 output per 1K tokens |

**Pourquoi Brave Search** : Gratuit (2000 req/mois suffisent), retourne titres + descriptions + URLs pour scraping.

**Pourquoi DeepSeek** : 100x moins cher que GPT-4, qualité suffisante pour extraction structurée JSON.

#### Flow de traitement

```
┌─────────────────┐
│ 1. SELECT       │
│                 │
│ Companies avec: │
│ - dataQuality<50│
│ - OU industry   │
│   IS NULL       │
│ - OU description│
│   IS NULL       │
│ - OU activitySta│
│   tus IS NULL   │
│                 │
│ ORDER BY:       │
│ - totalRaised   │
│   DESC          │
│ - lastRoundDate │
│   DESC          │
│                 │
│ LIMIT 200       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. BRAVE SEARCH │
│                 │
│ Query:          │
│ "{company}      │
│  startup levée  │
│  fonds funding" │
│                 │
│ API gratuite    │
│ 2000 req/mois   │
│ → 5 résultats   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. SCRAPE URLs  │
│                 │
│ • sourceUrl     │
│   (article orig)│
│ • Top 3 résult. │
│   Brave Search  │
│                 │
│ Extract texte   │
│ (max 3000 chars │
│  par source)    │
│                 │
│ Combiner tout   │
│ + descriptions  │
│ Brave (snippet) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4. LLM EXTRACT  │
│                 │
│ DeepSeek Chat   │
│ ~$0.0003/call   │
│                 │
│ Prompt structuré│
│ → JSON output   │
│                 │
│ INCLUT:         │
│ • activity_stat │
│   us detection  │
│ • founders      │
│ • investors     │
│ • competitors   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 5. VALIDATE     │
│                 │
│ - confidence>70?│
│ - industry dans │
│   taxonomie?    │
│ - foundedYear   │
│   plausible?    │
│ - activity_stat │
│   us valide?    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 6. UPDATE DB    │
│                 │
│ - Company       │
│   (activityStat │
│    us, etc.)    │
│ - CompanyEnrich │
│   ment log      │
│ - dataQuality++ │
└─────────────────┘
```

#### Prompt d'extraction LLM

```
Tu es un expert en startups et levées de fonds. Analyse ces informations et extrais le maximum de données sur l'entreprise.

## RÈGLES CRITIQUES
1. **JAMAIS INVENTER** : Si une info n'est pas présente → null
2. **COMBINER LES SOURCES** : Utilise toutes les infos disponibles (articles multiples)
3. **INDUSTRIE** : Utilise UNIQUEMENT la taxonomie ci-dessous
4. Si l'entreprise utilise l'IA comme OUTIL mais son produit est autre chose → classer dans le secteur du produit, PAS en "AI"
5. **STATUT D'ACTIVITÉ** : Cherche des indices (shutdown, acquisition, pivot, etc.)

## TAXONOMIE DES INDUSTRIES
- SaaS B2B, SaaS B2C, Developer Tools, Cloud Infrastructure, Data & Analytics
- AI Pure-Play (uniquement si l'IA EST le produit principal)
- Cybersecurity, Enterprise Software
- FinTech Payments, FinTech Banking, FinTech Lending, FinTech Insurance, FinTech WealthTech
- HealthTech, MedTech, BioTech, Pharma, Mental Health
- E-commerce, Marketplace B2C, Marketplace B2B, Retail Tech, D2C Brands
- MarTech, AdTech, Sales Tech
- HRTech, Recruiting, Future of Work, Corporate Learning
- PropTech, ConstructionTech, Smart Building
- Logistics, Delivery, Mobility, Automotive
- CleanTech, Energy, GreenTech, AgriTech, FoodTech
- EdTech, LegalTech, GovTech, SpaceTech, Defense
- Gaming, Entertainment, Social, Consumer Apps
- Hardware, DeepTech, Robotics, TravelTech

## FORMAT JSON UNIQUEMENT (pas de markdown)
{
  "company_name": "nom exact ou null",
  "activity_status": "active|shutdown|acquired|pivoted|null",
  "activity_status_details": "détails si shutdown/acquired (ex: 'acquis par Google en 2024') ou null",
  "industry": "UNE industrie de la liste ci-dessus",
  "sub_industry": "sous-catégorie plus précise ou null",
  "description": "2-3 phrases détaillées sur l'activité",
  "business_model": "SaaS|Marketplace|Transactional|Hardware|Services|null",
  "target_market": "B2B|B2C|B2B2C|null",
  "headquarters_country": "pays en anglais (France, Germany, United States, etc.)",
  "headquarters_city": "ville ou null",
  "founded_year": number ou null,
  "founders": [{"name": "string", "role": "string ou null"}],
  "employees": number ou null,
  "total_raised": "montant total levé (ex: '15M€') ou null",
  "last_round_amount": "dernier montant levé ou null",
  "last_round_stage": "seed|series_a|series_b|etc ou null",
  "investors": ["liste des investisseurs connus"],
  "competitors": ["concurrents mentionnés"],
  "notable_clients": ["clients mentionnés"],
  "website": "url du site ou null",
  "is_profitable": boolean ou null,
  "confidence": 0-100,
  "data_completeness": 0-100
}
```

#### Champs activity_status

| Statut | Description | Indices à chercher |
|--------|-------------|-------------------|
| `active` | Entreprise en activité normale | Récemment levée, recrute, news récentes |
| `shutdown` | Entreprise fermée | "a fermé", "liquidation", "ceased operations" |
| `acquired` | Rachetée par une autre entreprise | "acquis par", "racheté par", "merger" |
| `pivoted` | A changé significativement d'activité | "pivot", "nouvelle direction", rebrand majeur |
| `null` | Information non trouvée | Pas d'indice clair |

#### Champs à compléter (par priorité)

| Priorité | Champ | Impact | Raison |
|----------|-------|--------|--------|
| **P0** | `industry` | Critique | Benchmarks sectoriels |
| **P0** | `totalRaised` | Critique | Comparaisons de deals |
| **P0** | `activity_status` | Critique | Éviter d'analyser des boîtes mortes |
| **P1** | `founders` | Élevé | Due diligence équipe |
| **P1** | `investors` | Élevé | Qualité du tour de table |
| **P1** | `headquarters` | Élevé | Filtres géographiques |
| **P2** | `description` | Moyen | Contexte pour analyses |
| **P2** | `foundedYear` | Moyen | Calcul de maturité |
| **P2** | `website` | Moyen | Vérification et analyse |
| **P3** | `competitors` | Bas | Paysage concurrentiel |
| **P3** | `employees` | Bas | Efficacité/taille |

#### Output attendu

```json
{
  "companiesProcessed": 200,
  "companiesEnriched": 170,
  "companiesSkipped": 18,
  "companiesFailed": 12,
  "fieldsUpdated": {
    "industry": 165,
    "activity_status": 160,
    "description": 155,
    "founders": 145,
    "investors": 145,
    "headquarters": 158,
    "foundedYear": 140,
    "website": 140,
    "competitors": 100
  },
  "activityStatusBreakdown": {
    "active": 155,
    "shutdown": 8,
    "acquired": 5,
    "pivoted": 2,
    "unknown": 30
  },
  "avgConfidence": 76,
  "avgDataCompleteness": 84,
  "avgSourcesPerCompany": 3.3,
  "totalCost": 0.26,
  "llmCalls": 170,
  "braveSearches": 200
}
```

#### Métriques de succès (basées sur les tests)

| Métrique | Cible | Résultat test |
|----------|-------|---------------|
| Taux de succès extraction | >90% | 100% |
| Companies avec fondateurs | >80% | 85% |
| Companies avec investisseurs | >80% | 85% |
| Companies avec année fondation | >80% | 85% |
| Companies avec website | >80% | 85% |
| Companies avec concurrents | >50% | 60% |
| Confidence moyenne | >70% | 76% |
| Data completeness moyenne | >80% | 84% |

---

## 4. Supervisor

### Mission

Le Supervisor est le "gardien" du système. Il :
1. Vérifie que chaque agent a bien tourné
2. Analyse la qualité des résultats
3. Relance automatiquement en cas d'échec
4. Alerte si problème critique
5. Génère le rapport hebdomadaire

### Checks (+2h après chaque agent)

| Agent | Check à | Vérifie |
|-------|---------|---------|
| CLEANER | Dim 05:00 | Run terminé ? Items traités ? |
| SOURCER | Mar 05:00 | Run terminé ? Nouvelles companies ? |
| COMPLETER | Jeu 05:00 | Run terminé ? Companies enrichies ? |
| COMPLETER | Sam 05:00 | Run terminé ? Companies enrichies ? |

### State Machine

```
                              ┌──────────────┐
                              │   WAITING    │
                              │   (idle)     │
                              └──────┬───────┘
                                     │
                          Cron trigger (+2h après agent)
                                     │
                                     ▼
                              ┌──────────────┐
                              │  CHECKING    │
                              │              │
                              │ Vérifie le   │
                              │ dernier run  │
                              └──────┬───────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │                                  │
                    ▼                                  ▼
           ┌──────────────┐                   ┌──────────────┐
           │  SUCCESS     │                   │  FAILURE     │
           │              │                   │              │
           │ Log OK       │                   │ retry < 2 ?  │
           │ → WAITING    │                   └──────┬───────┘
           └──────────────┘                          │
                                        ┌────────────┴────────────┐
                                        │                         │
                                        ▼                         ▼
                               ┌──────────────┐          ┌──────────────┐
                               │  RETRYING    │          │  ALERTING    │
                               │              │          │  (max retry) │
                               │ Relance agent│          │              │
                               │ Telegram: 🔄  │          │ Telegram: 🚨  │
                               └──────┬───────┘          │ Email: 🚨     │
                                      │                  └──────────────┘
                               Attendre 2h
                                      │
                                      ▼
                               ┌──────────────┐
                               │ RE-CHECKING  │
                               │              │
                               │ Vérifie le   │
                               │ retry        │
                               └──────┬───────┘
                                      │
                         ┌────────────┴────────────┐
                         │                         │
                         ▼                         ▼
                ┌──────────────┐          ┌──────────────┐
                │ RETRY OK     │          │ RETRY FAIL   │
                │              │          │              │
                │ Telegram: ✅  │          │ retry++      │
                │ "Recovered"  │          │ → RETRYING   │
                └──────────────┘          │   ou ALERTING│
                                          └──────────────┘
```

### Logique de décision détaillée

```typescript
async function supervisorCheck(agent: MaintenanceAgent): Promise<CheckResult> {
  // 1. Chercher le run des 6 dernières heures
  const recentRun = await findRecentRun(agent, hoursAgo: 6);

  // Cas: Pas de run trouvé
  if (!recentRun) {
    return { status: 'MISSED', action: 'RETRY' };
  }

  // Cas: Run encore en cours
  if (recentRun.status === 'RUNNING') {
    const runtime = now() - recentRun.startedAt;
    if (runtime > 2 * HOUR) {
      await markAsTimeout(recentRun);
      return { status: 'TIMEOUT', action: 'RETRY' };
    }
    // Reprogrammer check dans 30min
    await scheduleDelayedCheck(agent, minutes: 30);
    return { status: 'PENDING', action: 'NONE' };
  }

  // Cas: Run FAILED
  if (recentRun.status === 'FAILED') {
    if (recentRun.retryAttempt < 2) {
      return { status: 'FAILED', action: 'RETRY' };
    }
    return { status: 'FAILED', action: 'ALERT_ONLY' };
  }

  // Cas: Run PARTIAL (terminé avec erreurs)
  if (recentRun.status === 'PARTIAL') {
    return { status: 'WARNING', action: 'ALERT_ONLY' };
  }

  // Cas: Run COMPLETED
  if (recentRun.status === 'COMPLETED') {
    // Vérifier les métriques de qualité
    const quality = await checkDataQualityDelta(recentRun);
    if (quality.degraded) {
      return { status: 'WARNING', action: 'ALERT_ONLY' };
    }
    return { status: 'PASSED', action: 'NONE' };
  }
}
```

### Retry flow

```
1. Notification Telegram:
   "🔄 Relance de {agent} (tentative {n}/2)..."

2. Créer MaintenanceRun:
   - agent: {agent}
   - triggeredBy: SUPERVISOR
   - parentRunId: {original_run_id}
   - retryAttempt: {n}

3. Déclencher l'agent via API interne

4. Programmer re-check dans 2h

5. Lors du re-check:
   - Si OK → Telegram: "✅ {agent} récupéré! {stats}"
   - Si FAIL et retry<2 → Retry again
   - Si retry>=2 → Telegram + Email: "🚨 ALERTE CRITIQUE"
```

---

## 5. Bot Telegram

### Configuration

```env
TELEGRAM_BOT_TOKEN=xxx:yyy
TELEGRAM_ADMIN_CHAT_ID=123456789
```

**Sécurité** : Seul le `TELEGRAM_ADMIN_CHAT_ID` peut envoyer des commandes.

### Commandes disponibles

| Commande | Description | Réponse |
|----------|-------------|---------|
| `/status` | État actuel de tous les agents | Dernier run, prochain run, status |
| `/run <agent>` | Lance manuellement un agent | Confirmation + notification quand terminé |
| `/report` | Génère le rapport hebdo maintenant | Rapport complet |
| `/health` | Métriques de qualité DB | Stats, %, alertes |
| `/last <agent>` | Détails du dernier run | Durée, items, erreurs |
| `/retry <agent>` | Force un retry | Confirmation |
| `/cancel` | Annule un run en cours | Confirmation |
| `/help` | Liste des commandes | Cette liste |

### Exemples d'interaction

#### /status

```
📊 *Status Maintenance*

🧹 CLEANER
└ Dernier: ✅ Dim 03:22 (23 merged)
└ Prochain: Dim 03:00

📥 SOURCER
└ Dernier: ✅ Mar 03:45 (+47 new)
└ Prochain: Mar 03:00

🔍 COMPLETER
└ Dernier: 🔄 EN COURS (47min)
└ Progress: 156/312 companies
└ Prochain: Sam 03:00
```

#### /health

```
📈 *Santé de la DB*

Companies: 3,247
Qualité moyenne: 67/100

✅ Avec industrie: 95.8%
✅ Doublons: 0.7%
⚠️ Données >30j: 15.2%

Dernier enrichissement: il y a 2h
```

#### /run cleaner

```
🔄 *CLEANER lancé manuellement*

Je te notifierai quand ce sera terminé.
(vérification dans 2h)
```

#### /last sourcer

```
📋 *Dernier run SOURCER*

Status: ✅ COMPLETED
Démarré: Mar 14/01 03:00
Durée: 42 min

📊 Résultats:
• Sources scrapées: 6
• Articles trouvés: 156
• Nouvelles companies: +47
• Nouveaux rounds: +53

💰 Coût: $0.08
```

### Architecture du webhook

```
┌─────────────────┐
│    Telegram     │
│    Servers      │
└────────┬────────┘
         │
         │ POST /api/telegram/webhook
         │ { update_id, message: { chat_id, text } }
         │
         ▼
┌─────────────────────────────────────────┐
│     /api/telegram/webhook/route.ts      │
│                                         │
│  1. Vérifier chat_id autorisé           │
│  2. Parser la commande                  │
│  3. Router vers le handler              │
│  4. Envoyer la réponse                  │
└─────────────────────────────────────────┘
```

---

## 6. Notifications

### Types de notifications

| Type | Canal | Quand |
|------|-------|-------|
| Agent démarré | Telegram | Début de chaque agent (optionnel) |
| Agent terminé | Telegram | Fin de chaque agent (succès) |
| Retry déclenché | Telegram | Supervisor relance un agent |
| Retry réussi | Telegram | Agent récupéré après retry |
| Alerte critique | Telegram + Email | Max retries atteint |
| Rapport hebdo | Telegram + Email | Lundi 08:00 |

### Format des notifications Telegram

#### Agent démarré (optionnel)

```
ℹ️ *FULLINVEST Maintenance*

🔍 DB_COMPLETER démarré
📅 Jeudi 16/01 03:00
```

#### Agent terminé

```
✅ *FULLINVEST Maintenance*

DB_SOURCER terminé
📊 +47 nouvelles companies
⏱ Durée: 42 min
💰 Coût: $0.08
```

#### Retry déclenché

```
⚠️ *FULLINVEST Maintenance*

DB_SOURCER a échoué
❌ Erreur: Timeout FrenchWeb API (30s)

🔄 Retry automatique dans 5 min...
Tentative 1/2
```

#### Retry réussi

```
✅ *FULLINVEST Maintenance*

DB_SOURCER récupéré avec succès!
📊 47 nouvelles companies importées
⏱ Durée: 42 min
```

#### Alerte critique

```
🚨 *FULLINVEST Maintenance*

⚠️ ALERTE CRITIQUE ⚠️

DB_COMPLETER a échoué après 2 tentatives

Dernière erreur:
> DeepSeek API rate limit exceeded

🔧 Action requise: vérifier les quotas API
```

### Rapport hebdo Telegram

```
📊 *FULLINVEST - Rapport Hebdo*
_Semaine du 13-19 Jan 2026_

━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏥 *SANTÉ: ✅ HEALTHY*
━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 *AGENTS*
┌────────────┬────────┬──────────┐
│ Agent      │ Status │ Résultat │
├────────────┼────────┼──────────┤
│ 🧹 CLEANER │ ✅ 1/1 │ -23 dupl │
│ 📥 SOURCER │ ✅ 1/1 │ +47 new  │
│ 🔍 COMPLET │ ✅ 2/2 │ +245 enr │
└────────────┴────────┴──────────┘

📈 *ÉVOLUTION DATA*
┌─────────────────┬────────┬────────┬───────┐
│ Métrique        │ Avant  │ Après  │ Delta │
├─────────────────┼────────┼────────┼───────┤
│ Companies       │ 3,200  │ 3,247  │ +47   │
│ Qualité moy     │ 62     │ 67     │ +5    │
│ Avec industrie  │ 89.2%  │ 95.8%  │ +6.6% │
│ Doublons        │ 45     │ 22     │ -23   │
│ Stale (>30j)    │ 18.4%  │ 12.1%  │ -6.3% │
└─────────────────┴────────┴────────┴───────┘

🔧 *INCIDENTS: 2*
• Mar: SOURCER timeout → retry ✅
• Sam: COMPLETER rate limit → retry ✅

💰 *COÛT: $1.99*
━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Email - Rapport hebdo (format HTML)

Le rapport email est plus détaillé avec :
- Tableau complet des runs
- Graphiques d'évolution (optionnel)
- Liste des erreurs détaillées
- Recommandations

---

## 7. Schema Prisma

### Modifications au modèle Company existant

```prisma
// Ajouter ces champs au modèle Company existant :

model Company {
  // ... champs existants ...

  // ===== NOUVEAU: Activity Status =====
  activityStatus        ActivityStatus?      // active, shutdown, acquired, pivoted
  activityStatusDetails String?              // "Acquis par Google en 2024", etc.
  activityStatusUpdatedAt DateTime?          // Dernière vérification du statut

  // ... reste des champs existants ...
}

// Nouvel enum à ajouter
enum ActivityStatus {
  ACTIVE      // Entreprise en activité normale
  SHUTDOWN    // Entreprise fermée/liquidée
  ACQUIRED    // Rachetée par une autre entreprise
  PIVOTED     // A changé significativement d'activité
}
```

### Nouveaux modèles

```prisma
// ============================================================================
// DATABASE MAINTENANCE SYSTEM - Automated Data Quality Agents
// ============================================================================

// MAINTENANCE RUN - Individual execution of a maintenance agent
model MaintenanceRun {
  id              String            @id @default(cuid())

  agent           MaintenanceAgent
  status          MaintenanceStatus @default(PENDING)

  // Trigger info
  triggeredBy     TriggerSource     @default(CRON)
  parentRunId     String?           // If retry, link to original run
  retryAttempt    Int               @default(0)  // 0 = original, 1 = 1st retry, etc.

  // Execution timing
  scheduledAt     DateTime?         // When it was supposed to run
  startedAt       DateTime?
  completedAt     DateTime?
  durationMs      Int?

  // Stats
  itemsProcessed  Int               @default(0)
  itemsUpdated    Int               @default(0)
  itemsCreated    Int               @default(0)
  itemsFailed     Int               @default(0)
  itemsSkipped    Int               @default(0)

  // Details (agent-specific)
  details         Json?             // { duplicatesMerged, sourcesScraped, companiesEnriched, ... }
  errors          Json?             // Array of { message, stack, itemId? }

  // Cost tracking
  totalCost       Decimal?          @db.Decimal(8, 4)
  llmCalls        Int               @default(0)
  webSearches     Int               @default(0)

  // Supervisor tracking
  supervisorCheck SupervisorCheck?

  createdAt       DateTime          @default(now())

  @@index([agent])
  @@index([status])
  @@index([startedAt])
  @@index([triggeredBy])
  @@index([agent, startedAt])
}

// SUPERVISOR CHECK - Verification of a maintenance run
model SupervisorCheck {
  id              String            @id @default(cuid())

  // Link to the run being checked
  runId           String            @unique
  run             MaintenanceRun    @relation(fields: [runId], references: [id], onDelete: Cascade)

  // Check result
  checkStatus     CheckStatus
  checkDetails    Json?             // { expectedMinItems, actualItems, qualityBefore, qualityAfter, ... }

  // Action taken
  actionTaken     SupervisorAction  @default(NONE)
  retryRunId      String?           // ID of the retry run if triggered

  // Notifications sent
  telegramSent    Boolean           @default(false)
  telegramMsgId   String?           // Message ID for potential updates
  emailSent       Boolean           @default(false)

  // For retry verification
  isRetryCheck    Boolean           @default(false)
  retryCheckAt    DateTime?         // When to check the retry result

  checkedAt       DateTime          @default(now())

  @@index([checkStatus])
  @@index([checkedAt])
  @@index([actionTaken])
}

// WEEKLY REPORT - Generated summary of maintenance activity
model WeeklyReport {
  id              String            @id @default(cuid())

  // Period covered
  weekStart       DateTime
  weekEnd         DateTime

  // Overall health assessment
  overallStatus   HealthStatus

  // Agent summaries (JSON for flexibility)
  cleanerSummary  Json              // { runs, successful, failed, itemsProcessed, ... }
  sourcerSummary  Json
  completerSummary Json

  // Data quality metrics comparison
  dataQualityStart Json             // Snapshot at week start
  dataQualityEnd   Json             // Snapshot at week end
  qualityDelta     Json             // Computed changes

  // Issues & recovery stats
  issuesDetected  Int               @default(0)
  retriesTriggered Int              @default(0)
  retriesSuccessful Int             @default(0)
  retriesFailed    Int              @default(0)

  // Cost summary
  totalCost       Decimal           @db.Decimal(8, 4) @default(0)
  costByAgent     Json?             // { cleaner: 0, sourcer: 0.12, completer: 1.87 }

  // Delivery tracking
  emailSent       Boolean           @default(false)
  emailSentAt     DateTime?
  telegramSent    Boolean           @default(false)
  telegramSentAt  DateTime?

  // Raw report content (for re-sending)
  reportHtml      String?           @db.Text
  reportText      String?           @db.Text

  generatedAt     DateTime          @default(now())

  @@unique([weekStart])
  @@index([overallStatus])
  @@index([generatedAt])
}

// DATA QUALITY SNAPSHOT - Point-in-time DB health metrics
model DataQualitySnapshot {
  id              String            @id @default(cuid())

  // Counts
  totalCompanies  Int
  totalFundingRounds Int

  // Quality metrics
  avgDataQuality  Float             // 0-100 average
  companiesWithIndustry Int
  companiesWithDescription Int
  companiesWithFounders Int
  companiesWithWebsite Int
  companiesWithInvestors Int        // NEW

  // Activity Status metrics (NEW)
  companiesActive    Int            @default(0)
  companiesShutdown  Int            @default(0)
  companiesAcquired  Int            @default(0)
  companiesPivoted   Int            @default(0)
  companiesStatusUnknown Int        @default(0)

  // Issues
  duplicateCompanies Int            @default(0)
  orphanedRounds     Int            @default(0)
  staleCompanies     Int            @default(0)  // Not enriched in 30+ days

  // Percentages (computed)
  withIndustryPct    Float
  withDescriptionPct Float
  withFoundersPct    Float
  withInvestorsPct   Float          // NEW
  withActivityStatusPct Float       // NEW
  stalePct           Float

  // Trigger (what caused this snapshot)
  trigger         String            @default("scheduled") // scheduled, before_agent, after_agent, manual
  relatedRunId    String?           // If triggered by agent run

  capturedAt      DateTime          @default(now())

  @@index([capturedAt])
  @@index([trigger])
}

// Enums for Maintenance System
enum MaintenanceAgent {
  DB_CLEANER
  DB_SOURCER
  DB_COMPLETER
}

enum MaintenanceStatus {
  PENDING      // Created, not yet started
  RUNNING      // Currently executing
  COMPLETED    // Finished successfully
  PARTIAL      // Finished but with some failures
  FAILED       // Total failure
  TIMEOUT      // Exceeded max duration (2h)
  CANCELLED    // Cancelled by supervisor or manual
}

enum TriggerSource {
  CRON         // Scheduled cron job
  SUPERVISOR   // Retry triggered by supervisor
  MANUAL       // Manual trigger via admin/telegram
  WEBHOOK      // External webhook
}

enum CheckStatus {
  PASSED       // All OK
  WARNING      // OK but degraded metrics
  FAILED       // The run failed
  MISSED       // The run didn't happen
  TIMEOUT      // The run timed out
  PENDING      // Check scheduled but not yet performed
}

enum SupervisorAction {
  NONE         // No action needed
  RETRY        // Triggered a retry
  ALERT_ONLY   // Alert sent (max retries reached)
  ESCALATE     // Critical escalation
}

enum HealthStatus {
  HEALTHY      // Everything OK
  DEGRADED     // Functional but minor issues
  CRITICAL     // Major problems
}
```

---

## 8. Structure des fichiers

```
src/
├── agents/
│   └── maintenance/
│       ├── types.ts                    # Types partagés pour tous les agents
│       ├── utils.ts                    # Utilitaires communs (normalization, etc.)
│       ├── db-cleaner/
│       │   ├── index.ts                # Point d'entrée
│       │   ├── duplicates.ts           # Logique de déduplication
│       │   ├── normalization.ts        # Normalisation des données
│       │   └── cleanup.ts              # Nettoyage orphelins/invalides
│       ├── db-sourcer/
│       │   ├── index.ts                # Point d'entrée
│       │   ├── sources/                # Connecteurs par source
│       │   │   ├── frenchweb.ts
│       │   │   ├── maddyness.ts
│       │   │   ├── techcrunch.ts
│       │   │   ├── eu-startups.ts
│       │   │   ├── sifted.ts
│       │   │   └── tech-eu.ts
│       │   ├── parser.ts               # Parsing des articles
│       │   └── dedup.ts                # Déduplication à l'import
│       ├── db-completer/
│       │   ├── index.ts                # Point d'entrée
│       │   ├── selector.ts             # Sélection des companies à enrichir
│       │   ├── web-search.ts           # Recherche web
│       │   ├── scraper.ts              # Scraping des URLs
│       │   ├── llm-extract.ts          # Extraction LLM
│       │   └── validator.ts            # Validation des résultats
│       └── supervisor/
│           ├── index.ts                # Point d'entrée
│           ├── check.ts                # Logique de vérification
│           ├── retry.ts                # Logique de retry
│           ├── weekly-report.ts        # Génération du rapport
│           └── quality-snapshot.ts     # Capture des métriques
├── services/
│   └── notifications/
│       ├── index.ts                    # Export unifié
│       ├── telegram.ts                 # Envoi de messages Telegram
│       ├── telegram-commands.ts        # Handlers des commandes
│       └── email.ts                    # Envoi d'emails (Resend)
├── app/
│   └── api/
│       ├── telegram/
│       │   └── webhook/
│       │       └── route.ts            # Webhook pour commandes Telegram
│       └── cron/
│           └── maintenance/
│               ├── cleaner/
│               │   └── route.ts        # Cron CLEANER
│               ├── sourcer/
│               │   └── route.ts        # Cron SOURCER
│               ├── completer/
│               │   └── route.ts        # Cron COMPLETER
│               └── supervisor/
│                   ├── check/
│                   │   └── route.ts    # Cron checks (+2h)
│                   └── weekly-report/
│                       └── route.ts    # Cron rapport hebdo
```

---

## 9. Configuration Cron

### vercel.json

```json
{
  "crons": [
    {
      "path": "/api/cron/maintenance/cleaner",
      "schedule": "0 3 * * 0"
    },
    {
      "path": "/api/cron/maintenance/sourcer",
      "schedule": "0 3 * * 2"
    },
    {
      "path": "/api/cron/maintenance/completer",
      "schedule": "0 3 * * 4"
    },
    {
      "path": "/api/cron/maintenance/completer",
      "schedule": "0 3 * * 6"
    },
    {
      "path": "/api/cron/maintenance/supervisor/check?agent=DB_CLEANER",
      "schedule": "0 5 * * 0"
    },
    {
      "path": "/api/cron/maintenance/supervisor/check?agent=DB_SOURCER",
      "schedule": "0 5 * * 2"
    },
    {
      "path": "/api/cron/maintenance/supervisor/check?agent=DB_COMPLETER",
      "schedule": "0 5 * * 4"
    },
    {
      "path": "/api/cron/maintenance/supervisor/check?agent=DB_COMPLETER",
      "schedule": "0 5 * * 6"
    },
    {
      "path": "/api/cron/maintenance/supervisor/weekly-report",
      "schedule": "0 8 * * 1"
    }
  ]
}
```

### Récapitulatif des horaires

| Cron | Jour | Heure | Description |
|------|------|-------|-------------|
| CLEANER | Dimanche | 03:00 | Nettoyage hebdo |
| CHECK CLEANER | Dimanche | 05:00 | Vérification +2h |
| SOURCER | Mardi | 03:00 | Import nouvelles données |
| CHECK SOURCER | Mardi | 05:00 | Vérification +2h |
| COMPLETER | Jeudi | 03:00 | Enrichissement #1 |
| CHECK COMPLETER | Jeudi | 05:00 | Vérification +2h |
| COMPLETER | Samedi | 03:00 | Enrichissement #2 |
| CHECK COMPLETER | Samedi | 05:00 | Vérification +2h |
| WEEKLY REPORT | Lundi | 08:00 | Rapport hebdomadaire |

---

## 10. Variables d'environnement

### Nouvelles variables requises

```env
# ============================================================================
# TELEGRAM BOT
# ============================================================================
# Token du bot (obtenu via @BotFather)
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz

# Ton chat ID personnel (seul autorisé à envoyer des commandes)
TELEGRAM_ADMIN_CHAT_ID=987654321

# ============================================================================
# EMAIL (Resend)
# ============================================================================
RESEND_API_KEY=re_xxxxxxxxxxxxx

# Email admin pour recevoir les rapports et alertes
ADMIN_EMAIL=sacha@fullinvest.io

# ============================================================================
# CRON SECURITY (optionnel mais recommandé)
# ============================================================================
# Secret pour authentifier les appels cron
CRON_SECRET=your-random-secret-here
```

### Variables existantes utilisées

```env
# Déjà configurées
OPENROUTER_API_KEY=sk-or-xxxxx          # Pour DeepSeek/LLM
DATABASE_URL=postgresql://...            # Neon DB
DIRECT_URL=postgresql://...              # Neon Direct
```

---

## 11. Coûts estimés

### Par agent (basé sur tests réels)

| Agent | Fréquence | Coût/run | Coût/mois |
|-------|-----------|----------|-----------|
| CLEANER | 1x/sem | $0 | $0 |
| SOURCER | 1x/sem | ~$0.10 | ~$0.40 |
| COMPLETER | 2x/sem | ~$0.26 | ~$2.10 |
| SUPERVISOR | 4x/sem | $0 | $0 |
| **TOTAL** | | | **~$2.50/mois** |

### Détail COMPLETER (testé sur 20 companies, extrapolé à 200)

```
Par run (200 companies) :
- Brave Search : $0 (gratuit, ~200 req sur 2000/mois)
- Scraping multi-sources : $0
- LLM DeepSeek Chat : 200 × $0.0013 = $0.26
  (basé sur test réel : $0.026 pour 20 companies)

Coût/1000 companies enrichies : ~$1.30
```

### Comparaison des options testées

| Option | Coût/1000 | Richesse données | Décision |
|--------|-----------|------------------|----------|
| **A: Brave + multi-sources + DeepSeek** | $1.30 | ⭐⭐⭐⭐⭐ (85% founders/investors) | ✅ Choisi |
| B: sourceUrl seul + DeepSeek | $0.56 | ⭐⭐⭐ (~20% founders) | ❌ |

### Budget Brave Search

```
Gratuit : 2,000 requêtes/mois

Avec 2 runs/semaine de 200 companies :
- 8 runs × 200 = 1,600 req/mois
- Reste 400 req pour retries/tests

OK pour le tier gratuit.
```

### Coût des retries

Les retries n'ajoutent pas de coût significatif car :
- CLEANER : $0
- SOURCER : ~$0.10/retry (rare)
- COMPLETER : ~$0.26/retry (rare)

Budget mensuel recommandé : **$5** (large marge de sécurité)

---

## 12. État d'implémentation

### Légende

- ⬜ Non commencé
- 🟡 En cours
- ✅ Terminé
- 🔴 Bloqué

### Checklist

#### Infrastructure

| Item | Status | Date | Notes |
|------|--------|------|-------|
| Schema Prisma (nouveaux modèles) | ⬜ | | |
| Migration Prisma | ⬜ | | |
| Variables d'environnement | ⬜ | | |
| Configuration vercel.json (crons) | ⬜ | | |

#### Services de notifications

| Item | Status | Date | Notes |
|------|--------|------|-------|
| Service Telegram (envoi messages) | ⬜ | | |
| Service Telegram (webhook handler) | ⬜ | | |
| Commande /status | ⬜ | | |
| Commande /run | ⬜ | | |
| Commande /report | ⬜ | | |
| Commande /health | ⬜ | | |
| Commande /last | ⬜ | | |
| Commande /retry | ⬜ | | |
| Commande /cancel | ⬜ | | |
| Commande /help | ⬜ | | |
| Service Email (Resend) | ⬜ | | |

#### Agents

| Item | Status | Date | Notes |
|------|--------|------|-------|
| Types partagés (types.ts) | ⬜ | | |
| Utilitaires (utils.ts) | ⬜ | | |
| DB_CLEANER - Déduplication companies | ⬜ | | |
| DB_CLEANER - Déduplication rounds | ⬜ | | |
| DB_CLEANER - Normalisation | ⬜ | | |
| DB_CLEANER - Cleanup orphelins | ⬜ | | |
| DB_CLEANER - Route API cron | ⬜ | | |
| DB_SOURCER - Connecteur FrenchWeb | ⬜ | | |
| DB_SOURCER - Connecteur Maddyness | ⬜ | | |
| DB_SOURCER - Connecteur TechCrunch | ⬜ | | |
| DB_SOURCER - Connecteur EU-Startups | ⬜ | | |
| DB_SOURCER - Connecteur Sifted | ⬜ | | |
| DB_SOURCER - Connecteur Tech.eu | ⬜ | | |
| DB_SOURCER - Parser articles | ⬜ | | |
| DB_SOURCER - Déduplication import | ⬜ | | |
| DB_SOURCER - Route API cron | ⬜ | | |
| DB_COMPLETER - Sélecteur companies | ⬜ | | |
| DB_COMPLETER - Web search | ⬜ | | |
| DB_COMPLETER - Scraper URLs | ⬜ | | |
| DB_COMPLETER - LLM extraction | ⬜ | | |
| DB_COMPLETER - Validation | ⬜ | | |
| DB_COMPLETER - Route API cron | ⬜ | | |

#### Supervisor

| Item | Status | Date | Notes |
|------|--------|------|-------|
| Quality snapshot | ⬜ | | |
| Check logic | ⬜ | | |
| Retry logic | ⬜ | | |
| Route API check | ⬜ | | |
| Weekly report generation | ⬜ | | |
| Weekly report Telegram format | ⬜ | | |
| Weekly report Email format | ⬜ | | |
| Route API weekly-report | ⬜ | | |

#### Tests & Documentation

| Item | Status | Date | Notes |
|------|--------|------|-------|
| Tests unitaires agents | ⬜ | | |
| Tests intégration | ⬜ | | |
| Documentation API | ⬜ | | |

---

## Historique des modifications

| Date | Version | Changements |
|------|---------|-------------|
| 2026-01-23 | 1.0 | Création du document |
| 2026-01-23 | 1.1 | Tests Option A vs Option B validés, décision Brave Search + DeepSeek, ajout activity_status detection |

---

## Notes pour les développeurs

### Comment lancer un agent manuellement

```bash
# Via curl (en local)
curl -X POST http://localhost:3003/api/cron/maintenance/cleaner \
  -H "Authorization: Bearer $CRON_SECRET"

# Via Telegram
/run cleaner
```

### Comment debugger un agent

1. Consulter les logs Vercel
2. Vérifier `MaintenanceRun` dans Prisma Studio
3. Regarder le champ `errors` du run
4. Utiliser `/last <agent>` sur Telegram

### Comment ajouter une nouvelle source au SOURCER

1. Créer `src/agents/maintenance/db-sourcer/sources/nouvelle-source.ts`
2. Implémenter l'interface `SourceConnector`
3. Ajouter au registry dans `db-sourcer/index.ts`
4. Tester avec `/run sourcer`

### Comment modifier le prompt du COMPLETER

Le prompt est dans `src/agents/maintenance/db-completer/llm-extract.ts`

**Attention** : Toute modification doit :
- Garder le format JSON attendu
- Respecter la taxonomie des industries
- Ne pas augmenter significativement la taille du prompt (coût)
