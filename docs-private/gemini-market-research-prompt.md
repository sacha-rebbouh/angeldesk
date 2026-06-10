# Mega Prompt — Deep Research TAM/SAM/SOM pour Angel Desk

> Ce prompt est conçu pour être utilisé avec **Gemini Deep Research** (ou équivalent).
> Objectif : obtenir des données chiffrées, sourcées, et structurées pour alimenter la section marché du fichier `reference.yaml`.

---

## PROMPT À COPIER-COLLER

---

Tu es un analyste marché senior spécialisé dans l'investissement en startups et les outils de due diligence / investment intelligence. Je construis **Angel Desk**, une plateforme SaaS AI-powered d'aide à la décision pour investisseurs (Business Angels → PE/M&A). J'ai besoin d'une deep research exhaustive pour dimensionner mon marché (TAM/SAM/SOM) et comprendre le paysage concurrentiel.

### CONTEXTE PRODUIT (pour calibrer ta recherche)

- **Cible primaire** : Business Angels individuels, angel clubs/syndicats
- **Cible secondaire** : Fonds VC, fonds minoritaires, PE, M&A corporate, family offices
- **Produit** : Plateforme qui analyse les deals d'investissement via 44 agents IA en 4 tiers (extraction → analyse → expertise sectorielle → synthèse), avec Board AI (4 LLMs en débat), live coaching temps réel pendant les calls fondateur, négociation chiffrée, et base de données de 5000+ deals comparables
- **Pricing** : Système de crédits, packs de 49€ à 749€/mois (+ institutional sur mesure)
- **Géo initiale** : Europe (France en premier), puis expansion US, UK, Israel, MENA, APAC
- **Catégorie** : Investment Intelligence / AI-powered Due Diligence / Decision Support for Investors

---

### SECTION 1 — NOMBRE D'INVESTISSEURS PAR SEGMENT ET PAR GÉO

Pour chaque géographie (Europe, US/Canada, UK, Israel, MENA, APAC, Amérique Latine, Afrique), donne-moi :

1. **Business Angels actifs** (individus qui ont investi au moins 1x dans les 24 derniers mois)
   - Nombre total estimé
   - Ticket moyen d'investissement
   - Nombre moyen de deals par an par BA
   - Évolution sur 5 ans (croissance annuelle)
   - Sources : EBAN (Europe), ACA (US), UK Business Angels Association, etc.

2. **Angel clubs / syndicats / réseaux**
   - Nombre de clubs/réseaux actifs
   - Taille moyenne (nombre de membres)
   - Ticket syndiqué moyen
   - Exemples notables par géo
   - Sources : EBAN, AngelList, Gust, réseaux locaux

3. **Fonds VC** (early-stage à growth)
   - Nombre de fonds actifs
   - AUM moyen par catégorie (micro-VC, seed, Series A-C, growth)
   - Nombre de deals par an par fonds
   - Sources : NVCA, Invest Europe, PitchBook, Preqin

4. **Family Offices** investissant en VC/startups
   - Nombre estimé
   - % qui font du direct investing (vs fonds)
   - Ticket moyen
   - Sources : Campden Wealth, UBS/PwC Family Office Report

5. **PE / M&A corporates**
   - Nombre de fonds PE actifs (buyout, growth equity)
   - Volume de deals M&A par an
   - Nombre d'entreprises avec programme M&A actif
   - Sources : Preqin, Mergermarket, PitchBook

6. **Accelerateurs / Incubateurs**
   - Nombre actifs par géo
   - Nombre de startups accompagnées/an
   - Sources : F6S, Crunchbase, listes locales

---

### SECTION 2 — TAILLE DU MARCHÉ (TAM/SAM/SOM)

#### 2.1 — TAM (Total Addressable Market)

Calcule le TAM selon **2 méthodes** et compare :

**Méthode top-down :**
- Marché global "Investment Intelligence & Analytics" (inclut PitchBook, CB Insights, Dealroom, Crunchbase, S&P Capital IQ, etc.)
- Marché global "Due Diligence Software / Services"
- Marché global "Alternative Data for Investment"
- Sous-segment : outils IA pour l'investissement
- Projections 2024-2030 (CAGR)
- Sources : Grand View Research, Markets and Markets, Allied Market Research, Statista, Fortune Business Insights

**Méthode bottom-up :**
- (Nombre total d'investisseurs par segment) × (ARPU estimé par segment) × 12 mois
- Utilise les données de la Section 1
- ARPU suggérés à utiliser :
  - BA solo : 100-200€/mois
  - Angel club : 300-500€/mois
  - Fonds VC : 1,000-3,000€/mois
  - Family Office : 1,000-5,000€/mois
  - PE/M&A : 5,000-20,000€/mois

#### 2.2 — SAM (Serviceable Addressable Market)

- Filtre par géo accessible (Europe + US + UK + Israel dans un premier temps)
- Filtre par profil tech-savvy / early adopter (% estimé par segment)
- Filtre par taille de ticket (exclure les BA qui investissent <5K€ — pas la cible)

#### 2.3 — SOM (Serviceable Obtainable Market)

- Projection réaliste Year 1, Year 2, Year 3
- Benchmarks de pénétration pour SaaS B2B dans le segment fintech/investissement
- Facteurs : solo founder, bootstrapped, product-led growth
- Comparables : quelle pénétration ont atteint des SaaS similaires dans leurs premières années ?

---

### SECTION 3 — PAYSAGE CONCURRENTIEL DÉTAILLÉ

Pour chaque concurrent/comparable, donne :
- Nom, date de création, siège, funding total
- Nombre d'employés estimé
- Revenue estimé (ARR si dispo)
- Nombre de clients estimé
- Pricing public
- Ce qu'ils font / ne font pas vs Angel Desk
- Forces / faiblesses

#### 3.1 — Plateformes de données investissement (data providers)
- PitchBook (Morningstar)
- CB Insights
- Crunchbase
- Dealroom.co
- S&P Capital IQ
- Bloomberg Terminal (segment PE/VC)
- Preqin
- Tracxn
- Beauhurst (UK)
- Harmonic.ai

#### 3.2 — Outils de Due Diligence
- Visible.vc
- Carta (cap table + data)
- Ansarada (data rooms + DD)
- Datasite (Merrill Corp)
- Midaxo
- DealRoom
- 4Degrees (CRM investisseurs)

#### 3.3 — Outils IA pour l'investissement (concurrents directs potentiels)
- Heron Finance (AI underwriting)
- SourceScrub (deal sourcing AI)
- Grata (company search AI)
- Brightflow AI
- Kensho (S&P)
- AlphaSense
- Tegus
- Hebbia (AI pour analystes)
- EarlyBird (deal flow AI)
- Tout autre outil IA de DD ou d'analyse de deals que tu trouves

#### 3.4 — Solutions adjacentes
- Notion + ChatGPT (le "DIY")
- Consultants DD freelance (Toptal, etc.)
- Big4 DD teams (Deloitte, PwC, EY, KPMG)
- Cabinets boutique DD

---

### SECTION 4 — DÉPENSE MOYENNE EN OUTILS PAR SEGMENT

Pour chaque segment d'investisseur, estime :
- Budget annuel moyen en outils/logiciels (data, CRM, DD, analytics)
- Répartition typique de ce budget
- Willingness to pay pour un outil AI de DD (si études/surveys existent)
- Part du budget qui va à la DD vs sourcing vs monitoring
- Sources : surveys NVCA, EBAN, ACA, rapports consulting

---

### SECTION 5 — TENDANCES ET DYNAMIQUES

1. **Adoption de l'IA par les investisseurs**
   - % qui utilisent déjà des outils IA dans leur process
   - Types d'usage (sourcing, screening, DD, monitoring)
   - Prédictions d'adoption 2025-2030
   - Barrières à l'adoption
   - Sources : surveys EY, Deloitte, McKinsey, PwC sur AI in PE/VC

2. **Croissance du marché BA**
   - Tendance du nombre de BAs (croissance/stagnation)
   - Professionnalisation des BAs (outils, clubs, formations)
   - Démocratisation (plateformes equity crowdfunding → BAs)
   - Impact post-COVID sur l'investissement angel

3. **Réglementation**
   - IR-PME (France) / EIS/SEIS (UK) / QSBS (US) — impact sur le nombre de BAs
   - Tendances réglementaires qui poussent ou freinent l'investissement angel
   - Exigences de documentation/compliance qui créent un besoin d'outils

4. **Consolidation du marché**
   - Acquisitions récentes (PitchBook par Morningstar, etc.)
   - Tendance à la plateforme unique vs best-of-breed
   - Opportunités pour un nouvel entrant

---

### SECTION 6 — COMPARABLES STARTUPS

Trouve des startups qui ont levé des fonds dans un espace similaire (AI for investment, DD automation, investor tools) :
- Nom, pays, date de création
- Montant levé, investisseurs, valorisation si disponible
- Produit/proposition de valeur
- Traction connue
- Ce qui les rapproche/différencie d'Angel Desk

---

### SECTION 7 — SOURCES À CITER OBLIGATOIREMENT

Utilise et cite explicitement ces sources (quand les données sont disponibles) :
- **EBAN** (European Business Angels Network) — Statistics Compendium
- **ACA** (Angel Capital Association) — Annual Report
- **NVCA** (National Venture Capital Association) — Yearbook
- **Invest Europe** — Annual Report
- **Preqin** — Global Alternatives Reports
- **PitchBook** — Annual Reports, Venture Monitor
- **CB Insights** — State of Venture
- **Crunchbase** — Annual Reports
- **Dealroom.co** — European Venture Report
- **OECD** — Financing SMEs and Entrepreneurs (Scoreboard)
- **World Bank** — Doing Business / ease of investing
- **Campden Wealth** — Global Family Office Report
- **UBS/PwC** — Billionaires Report, Family Office Report
- **EY / Deloitte / McKinsey / PwC** — rapports sur AI in PE/VC
- **Grand View Research / Markets and Markets / Statista** — market sizing
- **Beauhurst** (UK specific data)
- **France Angels** — rapports annuels
- **BPI France** — études sur l'écosystème startup français

---

### FORMAT DE RÉPONSE ATTENDU

Structure ta réponse EXACTEMENT comme suit :

```
## 1. INVESTISSEURS PAR SEGMENT ET GÉO
### 1.1 Business Angels
[Tableau par géo avec colonnes : Géo | Nombre | Ticket moyen | Deals/an | Croissance 5 ans | Source]
### 1.2 Angel Clubs
[Même structure]
...

## 2. TAM/SAM/SOM
### 2.1 TAM (Top-down)
[Chiffres + sources + CAGR]
### 2.2 TAM (Bottom-up)
[Calcul détaillé]
### 2.3 SAM
[Filtres appliqués + résultat]
### 2.4 SOM
[Y1/Y2/Y3 + hypothèses]

## 3. CONCURRENTS
### 3.1 Data Providers
[Fiche par concurrent]
...

## 4. DÉPENSE PAR SEGMENT
[Tableau segment × budget × répartition]

## 5. TENDANCES
### 5.1 IA dans l'investissement
...

## 6. STARTUPS COMPARABLES
[Fiche par startup]

## 7. SOURCES
[Liste complète avec liens, dates, et pages spécifiques]
```

### RÈGLES IMPÉRATIVES

1. **Chaque chiffre doit avoir une source.** Si tu ne trouves pas de source fiable, indique "ESTIMATION" et explique ta méthodologie.
2. **Distingue clairement** : données 2023 vs 2024 vs projections.
3. **Pas de chiffres ronds suspicieux** — si tu estimes, donne une fourchette (ex: 340,000-380,000 BAs actifs en Europe, pas "environ 400,000").
4. **Inclus les liens vers les rapports** quand disponibles.
5. **Convertis tout en EUR** (avec taux de change utilisé).
6. **Si une donnée n'existe tout simplement pas**, dis-le clairement plutôt que d'inventer.
7. **Priorise la récence** : données 2024 > 2023 > 2022. Signale quand une donnée date de plus de 2 ans.
