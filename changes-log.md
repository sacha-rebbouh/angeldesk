# Changes Log - FULLINVEST

## 2026-01-19 03:00 - UI TIER 1 IMPLEMENTEE

### Fichiers crees
- `src/components/deals/tier1-results.tsx` - **Composant complet d'affichage Tier 1** (~800 lignes)
  - 12 cards specialisees (une par agent)
  - ScoreBadge, StatusBadge, ExpandableSection reusables
  - Synthese avec score moyen et grille visuelle
  - Navigation par tabs: Vue d'ensemble, Business, Technique, Strategique

### Fichiers modifies
- `src/components/deals/analysis-panel.tsx`
  - Ajout `tier1_complete` dans ANALYSIS_TYPES
  - Ajout des 12 agents Tier 1 dans formatAgentName
  - Integration du composant Tier1Results
  - Details des agents collapsibles pour Tier 1

### Cards Tier 1 implementees
| Agent | Card | Score affiche |
|-------|------|---------------|
| financial-auditor | FinancialAuditCard | overallScore |
| team-investigator | TeamInvestigatorCard | overallTeamScore |
| competitive-intel | CompetitiveIntelCard | competitiveScore |
| deck-forensics | DeckForensicsCard | - |
| market-intelligence | MarketIntelCard | marketScore |
| technical-dd | TechnicalDDCard | technicalScore |
| legal-regulatory | LegalRegulatoryCard | legalScore |
| cap-table-auditor | CapTableAuditCard | capTableScore |
| gtm-analyst | GTMAnalystCard | gtmScore |
| customer-intel | CustomerIntelCard | customerScore |
| exit-strategist | ExitStrategistCard | exitScore |
| question-master | QuestionMasterCard | - |

### Organisation des tabs
- **Vue d'ensemble**: Financial, Team, Competitive, Market
- **Business**: GTM, Customer, Cap Table, Exit
- **Technique**: Technical, Legal, Deck Forensics
- **Strategique**: Question Master (full width)

### Comment tester
```bash
npm run dev -- -p 3003
# 1. Ouvrir http://localhost:3003/deals/[id]
# 2. Onglet "Analyse IA"
# 3. Selectionner "Investigation Tier 1"
# 4. Lancer l'analyse
```

---

## 2026-01-19 02:15 - ETAT PRECEDENT

### Resume du projet
**Infrastructure 100% + 16 Agents IA (4 base + 12 Tier 1) + PDF Extraction + Context Engine + Benchmarks + UI Tier 1**

### Pour lancer le projet
```bash
cd /Users/sacharebbouh/Desktop/fullinvest
npm run dev -- -p 3003
# Ouvrir http://localhost:3003/dashboard
```

### Credentials configures (.env.local)
- Clerk: ✅ (pk_test_... / sk_test_...)
- Neon PostgreSQL: ✅ (eu-central-1)
- OpenRouter: ✅ (sk-or-v1-...)
- BYPASS_AUTH=true (mode dev sans login)
- BLOB_READ_WRITE_TOKEN: (vide - storage local en dev)
- NEWS_API_KEY: (optionnel - pour news en temps reel)

### Ce qui fonctionne
1. **Dashboard** - http://localhost:3003/dashboard
2. **Creer un deal** - http://localhost:3003/deals/new
3. **Voir un deal** - http://localhost:3003/deals/[id]
4. **Lancer une analyse IA** - Onglet "Analyse IA" dans un deal
5. **API REST** - /api/deals, /api/analyze, /api/llm, /api/context
6. **Upload documents** - Storage local en dev, Vercel Blob en prod
7. **PDF Extraction** - Extraction automatique du texte des PDFs uploades
8. **Context Engine** - Enrichissement avec donnees externes (mock + APIs)
9. **Benchmarks** - 44 benchmarks pre-peuples (6 secteurs, 4 stages)
10. **Tier 1 Agents** - 12 agents d'investigation en parallele
11. **UI Tier 1** - Affichage detaille des 12 resultats avec scores et tabs

### Agents IA disponibles (16 total)

#### Base Agents (4)
| Agent | Description |
|-------|-------------|
| deal-screener | Screening GO/NO-GO rapide |
| document-extractor | Extraction structuree des pitch decks |
| deal-scorer | Scoring multi-dimensionnel |
| red-flag-detector | Detection des risques |

#### Tier 1 Agents - Investigation (12)
| Agent | Description | Score Output |
|-------|-------------|--------------|
| financial-auditor | Audit metriques vs benchmarks | overallScore |
| team-investigator | Background check equipe | overallTeamScore |
| competitive-intel | Paysage concurrentiel | competitiveScore |
| deck-forensics | Analyse forensique du deck | - |
| market-intelligence | Verification claims marche | marketScore |
| technical-dd | Evaluation technique | technicalScore |
| legal-regulatory | Risques juridiques | legalScore |
| cap-table-auditor | Audit cap table | capTableScore |
| gtm-analyst | Go-to-market | gtmScore |
| customer-intel | Analyse clients | customerScore |
| exit-strategist | Scenarios de sortie | exitScore |
| question-master | Questions killer | - |

### Types d'analyse disponibles
| Type | Agents | Description | UI |
|------|--------|-------------|-----|
| `screening` | 1 | Screening rapide (~30s) | Liste basique |
| `extraction` | 1 | Extraction documents (~1min) | Liste basique |
| `full_dd` | 4 | DD complete sequentielle (~2min) | Liste basique |
| `tier1_complete` | 13 | Investigation parallele complete (~30-45s) | **Cards + Tabs** |

### Prochaines etapes prioritaires
1. ~~**PDF Text Extraction**~~ ✅ DONE
2. ~~**Context Engine**~~ ✅ DONE
3. ~~**Seed Benchmarks**~~ ✅ DONE (44 benchmarks)
4. ~~**12 Agents Tier 1**~~ ✅ DONE
5. ~~**UI Tier 1**~~ ✅ DONE (12 cards, tabs, synthese)
6. **Tier 2 Agents** - Agents de synthese (Thesis Builder, Investment Memo, etc.)
7. **Tier 3 Agents** - Output generation (PDF, Presentation)

---

## 2026-01-19 02:00

### Fichiers crees/modifies
**Implementation Tier 1 - 12 Agents Investigation**

#### Modifications de base
- `src/agents/types.ts` - Ajout EnrichedAgentContext + 12 Result types (~400 lignes)
- `src/agents/base-agent.ts` - Ajout formatContextEngineData() helper (~140 lignes)
- `src/agents/orchestrator.ts` - Support execution parallele avec tier1_complete (~200 lignes)
- `src/agents/index.ts` - Export des 12 nouveaux agents

#### Nouveaux agents (src/agents/tier1/)
- `financial-auditor.ts` - Audit metriques vs benchmarks sectoriels
- `team-investigator.ts` - Background check equipe, complementarite
- `competitive-intel.ts` - Map concurrents, moat assessment
- `deck-forensics.ts` - Analyse narrative, verification claims
- `market-intelligence.ts` - Validation TAM/SAM/SOM, timing
- `technical-dd.ts` - Stack, dette technique, risques
- `legal-regulatory.ts` - Structure juridique, compliance
- `cap-table-auditor.ts` - Dilution, terms, investisseurs
- `gtm-analyst.ts` - Strategie GTM, efficacite commerciale
- `customer-intel.ts` - Base clients, PMF signals
- `exit-strategist.ts` - Scenarios exit, ROI projection
- `question-master.ts` - Questions killer, points de negociation
- `index.ts` - Exports centralises

### Architecture execution parallele
```
                    document-extractor (si docs)
                            ↓
                    Context Engine (enrichissement)
                            ↓
            ┌───────────────┼───────────────┐
            ↓               ↓               ↓
     financial-     team-          market-
     auditor       investigator   intelligence
            ↓               ↓               ↓
    ... (tous les 12 agents en Promise.all) ...
            ↓               ↓               ↓
            └───────────────┼───────────────┘
                            ↓
                    Results aggreges
```

### Comment tester
```bash
# Lancer une analyse Tier 1 complete
curl -X POST http://localhost:3003/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"dealId":"<deal_id>","type":"tier1_complete"}'
```

---

## 2026-01-19 00:45 - ANCIEN ETAT

### Resume du projet
**Infrastructure 100% + 4 Agents IA + PDF Extraction + Context Engine + Benchmarks**

### Pour lancer le projet
```bash
cd /Users/sacharebbouh/Desktop/fullinvest
npm run dev -- -p 3003
# Ouvrir http://localhost:3003/dashboard
```

### Credentials configures (.env.local)
- Clerk: ✅ (pk_test_... / sk_test_...)
- Neon PostgreSQL: ✅ (eu-central-1)
- OpenRouter: ✅ (sk-or-v1-...)
- BYPASS_AUTH=true (mode dev sans login)
- BLOB_READ_WRITE_TOKEN: (vide - storage local en dev)
- NEWS_API_KEY: (optionnel - pour news en temps reel)

### Ce qui fonctionne
1. **Dashboard** - http://localhost:3003/dashboard
2. **Creer un deal** - http://localhost:3003/deals/new
3. **Voir un deal** - http://localhost:3003/deals/[id]
4. **Lancer une analyse IA** - Onglet "Analyse IA" dans un deal
5. **API REST** - /api/deals, /api/analyze, /api/llm, /api/context
6. **Upload documents** - Storage local en dev, Vercel Blob en prod
7. **PDF Extraction** - Extraction automatique du texte des PDFs uploades
8. **Context Engine** - Enrichissement avec donnees externes (mock + APIs)
9. **Benchmarks** - 44 benchmarks pre-peuples (6 secteurs, 4 stages)

### Benchmarks disponibles (44 total)
| Secteur | Benchmarks | Metriques |
|---------|------------|-----------|
| SaaS B2B | 22 | ARR Growth, NRR, CAC Payback, Burn Multiple, Valuation, LTV/CAC, Rule of 40 |
| Fintech | 7 | ARR Growth, NRR, Valuation, Take Rate |
| Healthtech | 5 | ARR Growth, Valuation, Gross Margin |
| AI/ML | 5 | ARR Growth, Valuation, Gross Margin |
| Marketplace | 3 | GMV Growth, Take Rate, Valuation |
| Deeptech | 2 | R&D %, Time to Revenue |

### Prochaines etapes prioritaires
1. ~~**PDF Text Extraction**~~ ✅ DONE
2. ~~**Context Engine**~~ ✅ DONE
3. ~~**Seed Benchmarks**~~ ✅ DONE (44 benchmarks)
4. **UI Context** - Afficher le contexte dans l'UI deals
5. **Integration Benchmarks** - Utiliser les benchmarks dans Deal Scorer
6. **23 agents restants** - Voir investor.md pour specs

---

## 2026-01-19 00:40

### Fichiers crees/modifies
**Seed Benchmarks - 44 benchmarks pre-peuples**

#### Script de seed
- `prisma/seed.ts` - Script de seed complet
  - 44 benchmarks realistes
  - 6 secteurs: SaaS B2B, Fintech, Healthtech, AI/ML, Marketplace, Deeptech
  - 4 stages: PRE_SEED, SEED, SERIES_A, SERIES_B
  - Sources: OpenView, Bessemer, SaaS Capital, KeyBanc, a16z, Rock Health, Menlo Ventures

#### Scripts package.json
- `npm run db:seed` - Executer le seed
- `npm run db:studio` - Ouvrir Prisma Studio

#### Metriques par secteur
**SaaS B2B** (22 benchmarks):
- ARR Growth YoY, Net Revenue Retention, Gross Margin
- CAC Payback, Burn Multiple, Valuation Multiple
- LTV/CAC Ratio, Magic Number, Rule of 40

**Fintech** (7 benchmarks):
- ARR Growth YoY, NRR, Valuation Multiple, Take Rate

**AI/ML** (5 benchmarks):
- ARR Growth YoY, Valuation Multiple, Gross Margin

### Comment utiliser
```bash
# Re-seed la base (idempotent - upsert)
npm run db:seed

# Voir les benchmarks dans Prisma Studio
npm run db:studio
```

---

## 2026-01-19 00:25

### Fichiers crees
**Context Engine - Enrichissement des deals avec donnees externes**

#### Architecture
- `src/services/context-engine/types.ts` - Types complets du Context Engine
  - DealIntelligence (similar deals, funding context)
  - MarketData (benchmarks, trends)
  - PeopleGraph (founder backgrounds)
  - CompetitiveLandscape
  - NewsSentiment
  - Connector interface

- `src/services/context-engine/index.ts` - Service principal
  - `enrichDeal(query)` - Enrichit un deal avec contexte externe
  - `getFounderContext(name)` - Background d'un fondateur
  - Aggregation multi-sources

#### Connecteurs
- `src/services/context-engine/connectors/mock.ts` - **Mock Connector**
  - Donnees de test realistes (8 deals, benchmarks SaaS/Fintech/Healthtech)
  - Fonctionne sans config

- `src/services/context-engine/connectors/news-api.ts` - **News API Connector**
  - Integration NewsAPI.org (100 req/jour gratuit)
  - Analyse de sentiment
  - Config: `NEWS_API_KEY`

- `src/services/context-engine/connectors/web-search.ts` - **Web Search Connector**
  - Recherche web via Perplexity (OpenRouter)
  - Recherche competitors, founder background
  - Utilise `OPENROUTER_API_KEY` existant

#### API
- `src/app/api/context/route.ts` - **API d'enrichissement**
  - GET /api/context - Liste des connecteurs configures
  - POST /api/context - Enrichir un deal

### Comment tester
```bash
# Voir les connecteurs configures
curl http://localhost:3003/api/context

# Enrichir un deal
curl -X POST http://localhost:3003/api/context \
  -H "Content-Type: application/json" \
  -d '{"sector":"SaaS B2B","stage":"SEED","geography":"France"}'
```

---

## 2026-01-18 23:55

### Fichiers crees/modifies
**PDF Text Extraction + Storage Local - TESTE ET FONCTIONNEL**

#### Nouveau Service PDF
- `src/services/pdf/extractor.ts` - **Service d'extraction PDF**
  - Utilise `unpdf` (lib moderne, compatible Next.js Turbopack)
  - `extractTextFromPDF(buffer)` - extraction depuis un Buffer
  - `extractTextFromPDFUrl(url)` - extraction depuis une URL
  - Nettoyage automatique du texte
  - Retourne: text, pageCount, info (title, author, creationDate)

#### Nouveau Service Storage
- `src/services/storage/index.ts` - **Storage unifie**
  - Auto-detection: Vercel Blob si `BLOB_READ_WRITE_TOKEN` present, sinon local
  - En dev: fichiers stockes dans `public/uploads/`
  - En prod: Vercel Blob (a configurer au deploiement)
  - `uploadFile()`, `deleteFile()`, `getPublicUrl()`

#### API Modifiee
- `src/app/api/documents/upload/route.ts` - **Extraction automatique a l'upload**
  - Utilise le service storage unifie
  - Quand un PDF est uploade, extraction immediate du texte
  - Update du `processingStatus` (PENDING → PROCESSING → COMPLETED/FAILED)
  - Stockage dans `Document.extractedText`

#### Nouvelle API
- `src/app/api/documents/[documentId]/process/route.ts` - **Reprocessing**
  - POST pour relancer l'extraction sur un document existant
  - Utile si l'extraction a echoue ou pour les docs deja uploades

#### Package ajoute
- `unpdf` - Extraction PDF moderne (sans problemes de worker)

#### Fichier modifie
- `.gitignore` - Ajout de `/public/uploads` (fichiers dev locaux)

### Flow complet TESTE
```
1. User upload PDF via /api/documents/upload
2. PDF stocke localement (dev) ou Vercel Blob (prod)
3. Document cree en DB avec status PENDING
4. Extraction lancee automatiquement
5. Texte extrait → Document.extractedText
6. Status → COMPLETED
7. Agents IA peuvent maintenant analyser le contenu
```

### Comment tester
1. Aller sur http://localhost:3003/deals/new
2. Creer un deal
3. Uploader un PDF (pitch deck)
4. Le texte sera extrait automatiquement
5. Lancer "Due Diligence complete" → l'agent aura acces au contenu

---

## 2026-01-18 23:35

### Fichiers crees/modifies
**Agents supplementaires + UI d'analyse**

#### Nouveaux Agents
- `src/agents/document-extractor.ts` - **Document Extractor Agent**
  - Extraction structuree des pitch decks
  - Champs: company, financials, fundraising, traction, team, product, market
  - Confidence score par champ + source references

- `src/agents/deal-scorer.ts` - **Deal Scorer Agent**
  - Scoring multi-dimensionnel (0-100)
  - 5 dimensions: Team (25%), Market (20%), Product (20%), Financials (20%), Timing (15%)
  - Breakdown detaille par facteur
  - Comparables et percentile ranking

#### Orchestrator mis a jour
- `src/agents/orchestrator.ts` - Ajout des nouveaux agents
  - Nouveau type d'analyse: `extraction`
  - `full_dd` inclut maintenant: extractor → screener → scorer → red-flags
  - Sauvegarde auto des scores dans le Deal

#### UI Components
- `src/components/deals/analysis-panel.tsx` - Panel d'analyse
  - Selection du type d'analyse
  - Bouton lancer analyse
  - Affichage resultats en temps reel
  - Historique des analyses

- `src/components/deals/score-display.tsx` - Affichage des scores
  - ScoreDisplay: score individuel avec barre de progression
  - ScoreGrid: grille complete des 5 dimensions
  - Code couleur: vert (80+), bleu (60+), jaune (40+), orange (20+), rouge

#### Page Deal mise a jour
- `src/app/(dashboard)/deals/[dealId]/page.tsx`
  - Nouvel onglet "Analyse IA"
  - Scores affiches avec barres de progression
  - Historique des analyses

### Types d'analyse disponibles
| Type | Agents | Description |
|------|--------|-------------|
| `screening` | Screener | Screening rapide (~30s) |
| `extraction` | Extractor | Extraction documents (~1min) |
| `full_dd` | Extractor → Screener → Scorer → RedFlags | DD complete (~2min) |

### Comment tester
1. Ouvrir http://localhost:3003/deals/new
2. Creer un deal avec des infos (ARR, croissance, valo, description)
3. Aller dans le deal → onglet "Analyse IA"
4. Selectionner "Due Diligence complete" → Lancer

### Prochaines etapes
1. Upload de documents PDF
2. Extraction de texte des PDFs
3. Integration des benchmarks
4. Questions strategiques agent

---

## 2026-01-18 23:15

### Fichiers crees
**Implementation des Agents IA**

#### Infrastructure Agents
- `src/agents/types.ts` - Types pour tous les agents (ScreeningResult, RedFlagResult, etc.)
- `src/agents/base-agent.ts` - Classe abstraite BaseAgent avec helpers LLM
- `src/agents/orchestrator.ts` - Orchestrateur pour executer les analyses
- `src/agents/index.ts` - Exports centralises

#### Agents Implementes
- `src/agents/deal-screener.ts` - **Deal Screener Agent**
  - Screening rapide (30s)
  - Output: shouldProceed, confidenceScore, strengths, concerns, missingInfo
  - Modele: medium complexity (Claude 3.5 Sonnet)

- `src/agents/red-flag-detector.ts` - **Red Flag Detector Agent**
  - Detection des red flags avec confidence > 80%
  - Categories: FOUNDER, FINANCIAL, MARKET, PRODUCT, DEAL_STRUCTURE
  - Severites: CRITICAL, HIGH, MEDIUM, LOW
  - Sauvegarde auto en DB

#### API
- `src/app/api/analyze/route.ts` - POST /api/analyze pour lancer une analyse

#### Modifications
- `src/lib/auth.ts` - Ajout mode BYPASS_AUTH pour dev sans Clerk
- `src/middleware.ts` - Support du mode dev bypass
- `.env.local` - Ajout BYPASS_AUTH=true

### Architecture des Agents
```
AgentContext (deal + documents)
       ↓
  Orchestrator
       ↓
  ┌────┴────┐
  ↓         ↓
Screener  RedFlag
  ↓         ↓
Results → DB Update
```

### Comment tester
```bash
# Creer un deal via l'UI ou API
curl -X POST http://localhost:3003/api/deals \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Deal","sector":"SaaS B2B","stage":"SEED"}'

# Lancer une analyse
curl -X POST http://localhost:3003/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"dealId":"<deal_id>","type":"screening"}'
```

### Prochaines etapes
1. Implementer Document Extractor (extraction PDF)
2. Ajouter Deal Scorer Agent
3. Integrer les benchmarks pour comparaison
4. UI pour afficher les resultats d'analyse

---

## 2026-01-18 22:55

### Fichiers modifies
- `.env.local` - Configuration des credentials

### Description du changement
**Configuration complete des services externes**

Services configures :
- **Clerk** : Authentification (pk_test_... / sk_test_...)
- **Neon** : Base de donnees PostgreSQL (eu-central-1)
- **OpenRouter** : LLM Gateway (sk-or-v1-...)

Actions effectuees :
1. Configuration du `.env.local` avec les vraies credentials
2. Installation de `dotenv-cli` pour charger les variables
3. Execution de `prisma migrate dev --name init` - tables creees
4. Demarrage du serveur de dev - **http://localhost:3000** operationnel

### Prochaines etapes
1. Tester l'authentification Clerk (login/register)
2. Creer un premier deal
3. Implementer le Context Engine
4. Creer le premier agent (Deal Screener)

---

## 2026-01-18 22:30

### Fichiers crees/modifies
**Infrastructure complete du projet Next.js**

#### Configuration projet
- `package.json` - Dependencies Next.js 14+, Prisma, Clerk, React Query, shadcn/ui
- `prisma/schema.prisma` - Schema complet avec 8 models (User, Deal, Founder, Document, RedFlag, Analysis, Benchmark)
- `.env.example` et `.env.local` - Variables d'environnement

#### Core lib
- `src/lib/prisma.ts` - Prisma singleton
- `src/lib/auth.ts` - Helpers d'authentification Clerk
- `src/lib/query-keys.ts` - Query key factory pattern pour React Query
- `src/lib/utils.ts` - Utilitaires (cn, etc.)

#### Services
- `src/services/openrouter/client.ts` - Client OpenRouter avec registry de modeles (Haiku, Sonnet, GPT-4o, Opus)
- `src/services/openrouter/router.ts` - Router LLM avec selection par complexite

#### API Routes
- `src/app/api/deals/route.ts` - GET/POST deals
- `src/app/api/deals/[dealId]/route.ts` - GET/PATCH/DELETE deal
- `src/app/api/documents/upload/route.ts` - Upload documents vers Vercel Blob
- `src/app/api/llm/route.ts` - Endpoint LLM via OpenRouter

#### Components
- `src/components/providers.tsx` - React Query provider
- `src/components/layout/header.tsx` - Header avec navigation
- `src/components/layout/sidebar.tsx` - Sidebar avec menu
- `src/components/ui/*` - 14 composants shadcn/ui (button, card, input, form, table, dialog, sheet, sonner, tabs, badge, avatar, dropdown-menu, label, select)

#### Pages
- `src/app/page.tsx` - Landing page avec hero, features, CTA
- `src/app/layout.tsx` - Root layout avec Clerk, React Query, Toaster
- `src/app/(auth)/login/page.tsx` - Page de connexion Clerk
- `src/app/(auth)/register/page.tsx` - Page d'inscription Clerk
- `src/app/(dashboard)/layout.tsx` - Layout dashboard avec sidebar
- `src/app/(dashboard)/dashboard/page.tsx` - Dashboard avec stats et deals recents
- `src/app/(dashboard)/deals/page.tsx` - Liste des deals
- `src/app/(dashboard)/deals/new/page.tsx` - Formulaire creation deal
- `src/app/(dashboard)/deals/[dealId]/page.tsx` - Detail deal avec tabs (overview, documents, founders, red flags)

#### Middleware
- `src/middleware.ts` - Protection routes avec Clerk

#### Types
- `src/types/index.ts` - Types TypeScript (exports Prisma + types custom)

### Description du changement
**Setup infrastructure complete** selon le plan defini:
- Next.js 14+ avec App Router, TypeScript, Tailwind CSS
- Base de donnees PostgreSQL avec Prisma ORM (8 models)
- Authentification Clerk
- LLM Gateway via OpenRouter (5 modeles configures)
- React Query pour le data fetching
- shadcn/ui pour l'interface

### Stack technique
- Frontend/Backend: Next.js 14+
- Database: PostgreSQL + Prisma
- Auth: Clerk
- LLM: OpenRouter
- Storage: Vercel Blob
- UI: shadcn/ui + Tailwind CSS

### Prochaines etapes
1. Configurer les variables d'environnement reelles
2. Executer `npx prisma migrate dev --name init`
3. Tester l'authentification Clerk
4. Implementer le Context Engine
5. Creer le premier agent (Deal Screener)

---

## 2026-01-18 18:45

### Fichiers modifies
- `investor.md`
- `CLAUDE.md`

### Description du changement
**Recentrage sur les BUSINESS ANGELS comme cible principale (95%)**

Clarification majeure: le produit est destine aux Business Angels, pas aux fonds VC.

Modifications apportees:

1. **Nouveau tagline**: "La DD d'un fonds VC, accessible a un Business Angel solo."

2. **Nouvelle section "La Cible : Business Angels (95%)"**:
   - Problemes des BA (solo, pas le temps, pas de donnees, feeling)
   - Ce que Fullinvest leur apporte
   - Logique "qui peut le plus peut le moins"

3. **Persona type "Marie"**: BA de 45 ans, ex-directrice marketing, 25K€/deal

4. **Value prop reecrite pour BA**:
   - "Fait le travail d'un analyste"
   - "Donne acces aux donnees pro"
   - "Detecte les red flags"
   - "Prepare la negociation"
   - "Donne confiance"

5. **Tableau BA vs VC**: Pourquoi le besoin est CRITIQUE pour BA, nice-to-have pour VC

6. **CLAUDE.md mis a jour**: Description, cible, value prop centres sur BA

### Logique strategique
- BA = cas le plus exigeant (solo, pas de temps, pas de donnees)
- Si on construit pour eux, les autres (fonds, family offices) pourront aussi utiliser
- Cible secondaire (5%): petits fonds, family offices, syndics

---

## 2026-01-18 18:30

### Fichiers modifies
- `CLAUDE.md` (nouveau)

### Description du changement
**Creation du CLAUDE.md projet** pour que le contexte soit charge automatiquement.

Contient:
- Description du projet
- Reference vers `investor.md` (document principal)
- Principes de developpement
- Stack technique (a definir)

Maintenant, a chaque nouvelle session Claude dans ce projet, le CLAUDE.md sera lu automatiquement et indiquera de lire `investor.md`.

---

## 2026-01-18 18:15

### Fichiers modifies
- `investor.md`

### Description du changement
**Ajout de la section KILLER FEATURES complete (~1700 lignes)**

Suite a la discussion sur les killer features avec AskUserQuestion, ajout de :

1. **Vue d'ensemble des Killer Features** - Map visuelle avec Core Features, Moat Feature, et Moonshot Features

2. **FEATURE 1: Deal Scoring System** (~300 lignes)
   - Philosophie: Pas de probabilites ("tu passes pour un idiot si ca rate")
   - 5 dimensions: Team, Market, Product, Timing, Financials
   - Score global + positionnement comparatif
   - Output example complet

3. **FEATURE 2: Red Flags Automatiques** (~300 lignes)
   - 5 categories: Founder, Financial, Market, Product, Deal Structure
   - Chaque flag avec confidence score, evidence, impact, mitigation
   - Output example avec 2 critical, 1 high, 1 medium

4. **FEATURE 3: ROI Simulator** (~200 lignes)
   - Exit scenarios (early acquisition, growth+acquisition, IPO, failure)
   - Dilution path projection
   - Comparable exits (real data)
   - Monte Carlo distribution

5. **FEATURE 4: Questions Strategiques** (~200 lignes)
   - DD Checklist standard
   - Deal-specific questions (generees)
   - Founder Interview Prep
   - Reference Check Guide

6. **FEATURE 5: Challenge Partner** (~250 lignes)
   - Assumption Checker
   - Blind Spot Finder
   - Scenario Explorer
   - Output example complet

7. **FEATURE 6: Track Record Visible (MOAT)** (~100 lignes)
   - Dashboard public de precision
   - Predictions vs outcomes

8. **MOONSHOT FEATURES** (~150 lignes)
   - Deal Sourcing Proactif
   - Founder Matching
   - Market Timing Oracle
   - Portfolio Synergies

9. **DEALBREAKERS A EVITER** - Donnees obsoletes, faux positifs, analyses generiques

### Prochaines etapes
- Definir les priorites de developpement
- Commencer par les Core Features
- Integrer les sources de donnees

---

## 2026-01-18 17:45

### Fichiers modifies
- `investor.md`

### Description du changement
**Refonte majeure v4.0 → v5.0 : Focus sur la VALEUR IMMEDIATE**

Suite au feedback utilisateur ("les gens ne veulent pas utiliser la webapp pour qu'elle apprenne mais pour voir de la valeur"), refonte de la philosophie du document :

1. **Tagline mis a jour** : "Learning-based" → "Value-first"

2. **Executive summary** : "Apprend et s'ameliore" remplace par "Livre de la valeur des le premier deal - Pas de cold start. 50K+ deals pre-indexes"

3. **Nouvelle section "LA VALEUR IMMEDIATE"** ajoutee apres le tableau comparatif :
   - Visualisation de ce que l'utilisateur voit des son premier deal
   - Tableau des sources de donnees pre-populees (Crunchbase, Dealroom, PitchBook, etc.)
   - Message cle : "L'intelligence est deja la"

4. **Section "Learning & Feedback Loop" renommee** en "Internal Quality Engine (Background)" :
   - Note explicite : "100% interne - jamais expose au client"
   - Description : "Optimisation invisible - l'utilisateur voit la valeur, pas la tuyauterie"

5. **Tableau comparatif mis a jour** :
   - "Apprend et s'ameliore continuellement" → "50K+ deals, benchmarks actualises, intelligence pre-construite"

### Philosophie
L'apprentissage reste crucial pour l'optimisation interne du systeme, mais ce n'est PAS un argument de vente. La valeur pour le client est :
- Contexte riche des le premier deal
- Intelligence pre-construite (pas a "construire" par l'usage)
- Resultats ancres dans des donnees reelles

### Prochaines etapes
- Continuer a detailler le Context Engine et ses sources de donnees
- Definir les specs techniques pour l'integration des APIs de donnees
