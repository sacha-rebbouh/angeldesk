# Angel Desk — Work In Progress (Session 2026-03-09)

Ce document capture l'intégralité des discussions stratégiques, décisions, et travaux en cours de la session. Il sert de mémoire persistante pour les prochaines sessions.

---

## TABLE DES MATIÈRES

1. [Contexte fondateur](#1-contexte-fondateur)
2. [Vision & positionnement stratégique](#2-vision--positionnement-stratégique)
3. [Différenciation & MOAT](#3-différenciation--moat)
4. [Anti-hallucination : 5 directives](#4-anti-hallucination--5-directives)
5. [Business model & pricing](#5-business-model--pricing)
6. [Add-ons détaillés](#6-add-ons-détaillés)
7. [Chantier documents startup](#7-chantier-documents-startup)
8. [Points ouverts à trancher](#8-points-ouverts-à-trancher)
9. [Travaux réalisés cette session](#9-travaux-réalisés-cette-session)

---

## 1. CONTEXTE FONDATEUR

- **Statut** : Entre pré-lancement et early stage. Commence à en parler.
- **Fundraising** : Pas de levée prévue (bootstrapping).
- **Équipe** : Solo founder.
- **Timeline documents** : Pas de deadline, qualité > vitesse.
- **Objectifs des documents** : Structurer la vision + Crédibilité/partenariats + Être prêt si opportunité + Accélérateur/grant (les 4).
- **Financials existants** : Rien. Pas de modèle financier. Le pricing actuel (249€/mois) est obsolète et va augmenter. Le business model même (SaaS vs pay-per-task vs hybrid) est à définir.
- **Documents à créer** : Pitch deck + Exec Summary, Data room complète, Business plan / financials.

---

## 2. VISION & POSITIONNEMENT STRATÉGIQUE

### Le concept central : l'IA sublimée

Angel Desk n'est pas "de l'IA qui analyse". C'est une **orchestration qui force l'IA à se dépasser**.

- **Le Board AI** en est l'incarnation : 4 modèles qui se challengent, se contredisent, défendent leurs positions avec des preuves. La pression du débat élimine la complaisance, les hallucinations, les biais d'enthousiasme.
- Ce n'est pas 4 avis juxtaposés, c'est une **intelligence collective émergente**.
- Concept clé du fondateur : **"sublimation"** — pousser l'IA au-delà de ce qu'elle aurait produit seule.

### Driving individuel vs collectif

- Un LLM seul = un avis, un biais, un pattern d'hallucination.
- 4 LLMs en débat = les biais se neutralisent, les hallucinations se font attraper, le consensus est structurellement plus fiable.
- C'est prouvé en théorie des groupes (wisdom of crowds).
- Ceci doit être un **pilier central** du messaging, pas juste un feature parmi d'autres.

### Les 3 niveaux de compétition

| | BA seul + ChatGPT | Dev qui réplique | Angel Desk |
|---|---|---|---|
| Profondeur | Surface | Moyenne | 41 agents en 4 tiers |
| Garde-fous | Zéro | Basiques | Par modèle, par agent, par tier |
| Challenge | Aucun (le LLM dit oui) | Limité | IAs qui se battent entre elles |
| Réactivité | One-shot | One-shot | Rebondit, accompagne, coache en live |
| Fiabilité | Hallucinations invisibles | Quelques checks | Cross-validation, sources, DB 5000+ deals |

### Élargissement du marché (DÉCISION CLÉ)

**Plus seulement BA solos.** Le positionnement devient : **le meilleur partenaire AI-powered d'aide à la décision d'investissement.**

Cibles :
- Business Angels (individuels)
- Angel clubs (5-10 membres)
- Fonds minoritaires
- Fonds majoritaires / PE
- M&A corporate (boîtes qui rachètent d'autres boîtes)
- VC funds

### Ce qu'Angel Desk fait que personne d'autre ne fait

Ce n'est pas un outil d'analyse statique. C'est un **partenaire qui réagit** :
- Analyse → puis rebondit sur les réponses du fondateur
- Coache en temps réel pendant les calls
- Détecte les contradictions entre ce qui est dit et ce qui est écrit
- Accompagne la négociation avec des données
- Multi-dimensionnel : pas juste "bon deal / mauvais deal" mais 7 dimensions scorées, croisées, challengées

### Positionnement claim

> "Angel Desk est le meilleur partenaire d'aide à la décision AI-powered dans l'investissement."

L'IA est poussée à l'extrême pour prendre la meilleure décision possible en connaissance de cause. C'est le must-have de la prise de décision dans l'investissement.

### Ce qu'Angel Desk vient remplacer/compléter

- Un analyste → oui mais Angel Desk mène aussi une discussion, crée un lien, ouvre différentes zones d'intervention
- Un comité d'investissement → le Board AI
- Un coach pendant les calls → le Live Coaching
- Un négociateur → les arguments de négociation chiffrés
- La prise de décision est multi-dimensionnelle et c'est la grande force

### Règle absolue : honnêteté

On peut faire du marketing et être plus vendeur mais on n'invente JAMAIS dans ce qu'on raconte de features, de modèles etc. Rien de pire que le mensonge.

---

## 3. DIFFÉRENCIATION & MOAT

### "Quels sont les réglages qu'un concurrent aurait la flemme de faire ?"

1. **5 directives anti-hallucination dans chaque prompt** (implémenté cette session)
2. **4 IAs mises face à face** (Board AI — débat, pas juxtaposition)
3. **Live coaching temps réel** (audio + vision + contexte DD pendant les calls)
4. **41 agents en 4 tiers** avec orchestration séquentielle et parallèle
5. **Garde-fous par modèle et par agent** (pas de one-size-fits-all)
6. **Cross-validation DB** (5,000+ deals comparables)
7. **Analyse vivante** (pas un snapshot, un organisme qui évolue avec le deal)
8. **22 experts sectoriels** (breadth surhumaine)
9. **Question persistence** (les questions non-répondues survivent entre analyses)
10. **Scoring déterministe** (formules, pas jugement LLM)

### Le MOAT qui compound (identifié par Claude, validé par le fondateur)

La DB est le moat qui **grandit avec le temps**. Chaque deal analysé enrichit les benchmarks. Chaque scoring calibre mieux le suivant. Un concurrent qui démarre dans 2 ans part avec zéro data. Angel Desk a 2 ans d'intelligence accumulée. C'est un network effect sur la donnée.

### L'argument anti-DIY : "Les 10 pièges de l'IA seule"

Argument marketing puissant — le BA ou le concurrent qui fait seul va se heurter à :
1. L'enthousiasme naturel du LLM (il dit toujours oui)
2. Les hallucinations (chiffres inventés, concurrents fantômes)
3. L'absence de contradiction (personne pour challenger)
4. La perte de contexte (one-shot, pas de mémoire)
5. La confidentialité (tu envoies ton deal à OpenAI...)
6. L'absence de benchmarks (pas de DB de comparables)
7. Le biais de confirmation (le LLM suit ton framing)
8. L'absence de garde-fous (pas de red flags systématiques)
9. La non-reproductibilité (score différent à chaque fois)
10. L'absence d'accompagnement (analyse morte, pas de suivi)

Le message : "Non seulement ça ne sera pas aussi profond mais en plus ça va être faux."

### Insights stratégiques additionnels (proposés par Claude)

**L'auditabilité / accountability** : Chaque affirmation est sourcée, chaque score a un breakdown, chaque red flag a une preuve. C'est de l'intelligence auditable. Pour un angel club qui doit justifier devant ses membres, pour un fonds devant ses LPs, c'est un requirement réglementaire (IR-PME, EIS). Angel Desk pourrait devenir le système d'audit trail officiel des décisions d'investissement.

**L'intelligence cross-deal** : Un BA voit 50 deals et investit dans 3. La comparaison entre deals en pipeline ("Deal A score 78 en Team mais 42 en Market, Deal B c'est l'inverse — lequel pour TON profil ?") = argument de rétention monstrueux.

**L'argument économique** : Un BA expérimenté vaut 500-2000€/h. Une DD = 16h = 8,000-32,000€ en coût de temps. Angel Desk même à 500€ l'analyse = 15-60x moins cher. Pour un fonds, un analyste junior = 60-80K€/an, Angel Desk fait 80% du travail.

**Pipeline complet** : PitchBook = data. Crunchbase = annuaire. Carta = cap table. Dealroom = market intel. Aucun ne fait : analyser → questionner → coacher → négocier → décider. Angel Desk est le seul à couvrir le cycle complet. C'est une **catégorie** créée.

**Quand l'IA se trompe** : "C'est exactement pour ça qu'on a construit la délibération multi-modèle, la cross-validation, le sourcing obligatoire et les scores de confiance. On n'élimine pas l'erreur IA — on la rend visible et traçable." Plus crédible que "notre IA ne se trompe pas".

**22 experts sectoriels** : Aucun analyste humain n'est expert en SaaS ET biotech ET fintech ET climate ET hardware. Angel Desk si. Capacité surhumaine.

### Questions qu'on va poser au fondateur (et réponses préparées)

- **"T'es solo founder, c'est un risque"** → Lean by design + AI-augmented development. L'outil est construit par quelqu'un qui comprend le problème de l'intérieur.
- **"Pourquoi PitchBook/Carta ne rajouterait pas cette feature ?"** → L'orchestration IA multi-modèle est une architecture core, pas un plugin. C'est comme demander pourquoi Excel ne devient pas Figma.
- **"Et si OpenAI construit ça ?"** → Couche application, pas couche modèle. De meilleurs modèles nous rendent meilleurs. Model-agnostic via OpenRouter.

---

## 4. ANTI-HALLUCINATION : 5 DIRECTIVES

### Contexte

Basé sur une recherche sur le coût asymétrique des erreurs LLM. L'insight : les modèles hallucinent parce qu'on ne leur dit jamais le coût de se tromper. Si on explicite que se tromper coûte plus cher que se taire, le comportement change.

Règle : les 5 directives sont **obligatoires dans chaque prompt, all guns blazing**.

### Les 5 directives (texte exact)

**1. Confidence Threshold**
> Answer only if you are >90% confident, since mistakes are penalised 9 points, while correct answers receive 1 point, and an answer of "I don't know" receives 0 points.

**2. Abstention Permission**
> It is perfectly acceptable (and preferred) for you to say "I don't know" or "I'm not confident enough to answer this." I would rather receive an honest "I'm unsure" than a confident answer that might be wrong. If you are uncertain about any part of your response, flag it clearly with [UNCERTAIN] so I know to verify it independently. Uncertainty is valued here, not penalised.

**3. Citation Demand**
> For every factual claim in your response: 1. Cite a specific, verifiable source (name, publication, date) 2. If you cannot cite a specific source, mark the claim as [UNVERIFIED] and explain why you believe it to be true 3. If you are relying on general training data rather than a specific source, say so explicitly. Do not present unverified information as established fact.

**4. Self-Audit**
> After completing your response, perform a self-audit: 1. Identify the 3 claims in your response that you are LEAST confident about 2. For each one, explain what could be wrong and what the alternative might be 3. Rate your overall response confidence: HIGH / MEDIUM / LOW. Be ruthlessly honest. I will not penalise you for uncertainty.

**5. Structured Uncertainty**
> Structure your response in three clearly labelled sections: **CONFIDENT:** Claims where you have strong evidence and high certainty (>90%) **PROBABLE:** Claims where you believe this is likely correct but acknowledge uncertainty (50-90%) **SPECULATIVE:** Claims where you are filling in gaps, making inferences, or relying on pattern-matching rather than direct knowledge (<50%). Every claim must be placed in one of these three categories. Do not present speculative claims as confident ones.

### Implémentation (réalisée cette session)

- **Injecté dans 60+ fichiers** couvrant tous les agents
- **Approche** : Directives 2-5 via méthodes héritées dans `base-agent.ts` pour les agents BaseAgent. Directive 1 directement dans chaque `buildSystemPrompt()`. Pour les agents non-BaseAgent (Tier 2, Board, Orchestration), les 5 directement.
- **Audit complet réalisé** : 4 agents en parallèle ont vérifié chaque fichier
- **7 manques trouvés et corrigés** :
  - `fact-extractor.ts` (prompt inline meta-eval) : manquait #1
  - `coaching-engine.ts` : manquait les 5
  - `post-call-generator.ts` : manquait les 5
  - `post-call-reanalyzer.ts` : manquait les 5
  - `transcript-condenser.ts` : manquait les 5
  - `visual-processor.ts` : manquait les 5
  - `negotiation/strategist.ts` : manquait les 5
- **CLAUDE.md mis à jour** avec le standard permanent
- **TypeScript compile sans erreur** après toutes les modifications

### Valeur stratégique

Ces directives sont un argument de différenciation : "Chaque agent a des garde-fous anti-hallucination à 5 niveaux. Chaque affirmation est classée par niveau de certitude. L'IA a le droit — et l'obligation — de dire 'je ne sais pas'." C'est le genre de réglage qu'un concurrent aurait la flemme de faire.

---

## 5. BUSINESS MODEL & PRICING

### Décision structurelle : Système de crédits avec packs mensuels

Ni SaaS pur, ni pay-per-task pur. Un **hybride crédit-based**.

**Pourquoi :**
- Pour le BA : il voit ce que chaque action coûte, paie pour ce qu'il utilise
- Pour le fonds : gros pack = budget mensuel prévisible
- Pour Angel Desk : packs auto-refill = MRR de facto
- Pour la scalabilité : nouvelle feature = nouveau coût en crédits

### Coûts réels par action

| Action | Coût réel | Détail |
|--------|----------|--------|
| Quick Scan (Tier 1) | ~0.80€ | 13 agents, ~$1 LLM |
| Deep Dive (Tier 1+2+3) | ~2.30€ | ~20 agents, ~$2-2.50 LLM + context engine |
| AI Board | ~12€ | 4 modèles × 3 rounds de débat |
| Live Coaching (30 min) | ~7€ | Deepgram (~0.13€) + visual (~2€) + LLM coaching (~5€) |
| Re-analysis | ~2€ | Réutilise partiellement les résultats précédents |
| Chat IA | ~3-6 centimes/msg | Sonnet. Pourrait passer à ~0.5 centime avec Haiku |
| PDF export | ~0.01€ | Négligeable |

**Infrastructure fixe : ~200-400€/mois** (Neon, Vercel, Redis, Ably, Clerk, Sentry)

### Grille de crédits par action — VALIDÉ

| Action | Crédits | Coût réel | Rationale |
|--------|---------|-----------|-----------|
| Quick Scan (Tier 1) | 1 | ~0.80€ | Screening rapide |
| Deep Dive (Tier 1+2+3) | 5 | ~2.30€ | DD complète, remplace 2 jours d'analyste |
| AI Board | 10 | ~12€ | 4 LLMs en débat, feature premium |
| Live Coaching | 8 | ~7€ | Coach senior temps réel pendant call |
| Re-analysis | 3 | ~2€ | Réutilise le contexte existant |
| Chat IA | Gratuit | ~3-6 cts/msg | Coût négligeable, retient l'utilisateur |
| PDF export | Gratuit | ~0.01€ | Négligeable |

**1 deal full package** = Deep Dive + Board + Live + Re-analysis = **26 crédits**

### Packs proposés

| Pack | Crédits | Prix | €/crédit | En concret |
|------|---------|------|----------|------------|
| Starter | 10 | 49€ | 4.90€ | 2 Deep Dives, ou 1 Deep Dive + 5 Quick Scans |
| Standard | 30 | 99€ | 3.30€ | 1 deal full package + 4 crédits restants |
| Pro | 60 | 179€ | 2.98€ | 2 deals full + 8 crédits de screening |
| Expert | 125 | 329€ | 2.63€ | 4 deals full + 21 crédits de screening |
| Fund | 300 | 749€ | 2.50€ | 11 deals full + 14 crédits |
| Institutional | Sur mesure | Sur mesure | <2€ | Volume illimité négocié |

**Auto-refill mensuel : -15% sur le prix** (incite à la récurrence)

### Marges par action (au prix Pro / 2.98€ par crédit)

| Action | Revenu | Coût | Marge |
|--------|--------|------|-------|
| Quick Scan (1cr) | 2.98€ | 0.80€ | 73% |
| Deep Dive (5cr) | 14.90€ | 2.30€ | 85% |
| AI Board (10cr) | 29.80€ | 12€ | 60% |
| Live Coaching (8cr) | 23.84€ | 7€ | 71% |
| Re-analysis (3cr) | 8.94€ | 2€ | 78% |

**Marge brute globale estimée : 70-85%** selon le mix d'usage.

### FREE tier

**Pas de crédits gratuits mensuels. Un essai one-shot :**

> 1 Deep Dive offert sur ton premier deal. Pas de carte bancaire. Tu crées un deal, tu uploades ton deck, et on te montre ce que 41 agents + 3 tiers d'analyse produisent.

Pourquoi :
- Le BA voit la vraie valeur (pas un Tier 1 édulcoré)
- Le moment de conversion est limpide
- Pas de freeloaders mensuels

### Valeur par segment (justification pricing)

| Segment | Ticket moyen | DD manuelle équivalente | Valeur Angel Desk |
|---------|-------------|------------------------|-------------------|
| BA solo | 25-50K€ | 1,000€ (2j × 500€/j) | 200-500€ |
| Angel club | 100-300K€ | 2,500€ (3-5j analyste) | 500-1,500€ |
| Fonds minoritaire | 1-5M€ | 60-80K€/an (1 analyste FT) | 2,000-5,000€/mois |
| PE / M&A | 10-100M€ | 200-500K€/an (équipe DD) | 5,000-20,000€/mois |

### Compétition pricing (référence)

- PitchBook : 20,000-50,000€/an (data only)
- CB Insights : 50,000€+/an
- Dealroom : 10,000-30,000€/an
- Angel Desk Fund (749€/mois) = 9,000€/an = **5-10x moins cher** que les alternatives institutionnelles

### Décisions prises

- [x] Crédits (pas SaaS pur) — **VALIDÉ**
- [x] Expiration des crédits : **6 mois** — VALIDÉ
- [x] Rollover sur auto-refill : **oui, jusqu'à 2x le pack** — VALIDÉ
- [x] Institutional : **"À partir de" + contact commercial** — VALIDÉ
- [x] Montants exacts des crédits par action — **VALIDÉ**
- [x] Prix exacts des packs — **VALIDÉ**
- [ ] Chat : switch vers Haiku ou rester Sonnet — **À DÉCIDER**

---

## 6. ADD-ONS DÉTAILLÉS

### Add-ons inclus par tier

| Add-on | Starter/Standard | Pro | Expert | Fund | Institutional |
|--------|-----------------|-----|--------|------|---------------|
| Chat IA illimité | ✓ | ✓ | ✓ | ✓ | ✓ |
| Export PDF | ✓ | ✓ | ✓ | ✓ | ✓ |
| Suivi red flags + résolutions | ✓ | ✓ | ✓ | ✓ | ✓ |
| Conditions & négociation | — | ✓ | ✓ | ✓ | ✓ |
| API v1 (REST + webhooks) | — | — | ✓ | ✓ | ✓ |
| Multi-utilisateurs | — | — | — | — | ✓ |
| Exports compliance / audit trail | — | — | — | — | ✓ |
| Rapports white-label | — | — | — | — | ✓ |
| Support dédié + SLA | — | — | — | — | ✓ |

### Add-ons payants

**1. Sièges supplémentaires** — 29€/mois par siège
- Chaque siège partage le pool de crédits du compte
- Disponible dès Pro
- Cas : angel club de 5 BAs → Pro (50 crédits, 179€) + 4 sièges (116€) = 295€/mois pour 5 personnes

**2. Accès API** — 49€/mois (gratuit dès Expert)
- Rate limits : 100 req/h (Standard), 500 req/h (Pro), 1000 req/h (Expert+)
- Cas : connecter Angel Desk à Notion ou CRM

**3. Data Room Watch** — 19€/mois par deal actif
- Re-analyse auto quand nouveau document uploadé
- Notifications push (email + Telegram) sur changement de red flags
- Cas : fonds qui suit 10 deals en pipeline

**4. Benchmark Premium** — 39€/mois
- Comparables détaillés (multiples, investisseurs, trajectoire post-raise)
- Historique de valorisation par round
- Tendances funding par secteur/géo en temps réel
- Cas : vérifier si la valo demandée est dans la fourchette marché

**5. Priority Processing** — 9€ par analyse (one-shot)
- Passe en tête de la queue
- Résultat en <3 min au lieu de 5-8 min
- Cas : BA au téléphone avec un fondateur, besoin du résultat maintenant

---

## 7. CHANTIER DOCUMENTS STARTUP

### Objectif

Créer un dossier `docs-private/` (jamais commit sur git) contenant tous les documents startup nécessaires.

### Documents à créer

1. **Pitch deck** (slides) — script/structure pour présentation
2. **Executive Summary** (2 pages) — résumé pour investisseurs/partenaires
3. **Business plan / financial model** — projections, unit economics, P&L
4. **Data room complète** — package investisseur complet
5. **Fichier de référence YAML** — source de vérité structurée pour alimenter tous les autres documents

### Format choisi

**YAML** pour le fichier de référence principal — lisible par humain, parsable programmatiquement, force une structure rigoureuse.

### Statut

- [x] Dossier `docs-private/` créé
- [x] Discussion vision/positionnement — avancée
- [x] Discussion pricing/business model — validé
- [x] Fichier de référence YAML — **FAIT** (`docs-private/reference.yaml`, ~1800 lignes, 34 sections)
- [x] Mega prompt Gemini TAM/SAM/SOM — **FAIT** (`docs-private/gemini-market-research-prompt.md`)
- [ ] Enrichissement profil fondateur via LinkedIn API — en attente (lancer via l'app)
- [x] Pitch deck — **FAIT** (`docs-private/pitch-deck.md` narratif + `docs-private/pitch-deck-slides.md` slide-ready)
- [x] Executive Summary — **FAIT** (`docs-private/exec-summary.md`, 2 pages, 9 sections)
- [ ] Business plan — pas commencé
- [ ] Data room — pas commencé

---

## 8. POINTS OUVERTS À TRANCHER

### Pricing (en discussion active)

1. **Montants exacts des crédits par action** — Le fondateur veut revisiter les ratios. Discussion en cours.
2. **Prix exacts des packs** — À finaliser après les crédits.
3. **Discount annuel** — Proposé 15% auto-refill. À confirmer si on fait aussi du annuel prépayé.
4. **Chat model** — Rester sur Sonnet (meilleure qualité) ou switch Haiku (10x moins cher) ?

### Produit

5. **Secret sauce prompts** — Le fondateur a mentionné vouloir ajouter "plusieurs choses dans absolument tous les prompts" au-delà des 5 anti-hallucination. Les 5 anti-hallucination ont été implémentées, mais il y a potentiellement d'autres ajouts à discuter.
6. **Qualité des tiers** — Le fondateur reconnaît que les tiers ne sont "pas encore au niveau" souhaité. Travail de qualité à faire sur les prompts et les outputs.

### Documents

7. **Contenu spécifique du pitch** — Le fondateur a des idées sur "comment présenter" la vision. À capturer.
8. **Financial model** — Partir de zéro, construire ensemble.

---

## 9. TRAVAUX RÉALISÉS CETTE SESSION

### 1. Lecture complète de la codebase

5 agents en parallèle ont lu l'intégralité des 659 fichiers :
- Documentation (investor.md, changes-log, specs, engines)
- Agents (41 agents Tier 0/1/2/3 + chat + board + orchestration)
- Frontend (composants, pages, UI)
- API (60+ routes) + lib (18 modules) + config
- Specs (4 waves, 102 failles) + engine docs (Consensus + Reflexion)

### 2. Injection des 5 directives anti-hallucination

- 60+ fichiers modifiés
- 7 manques trouvés lors de l'audit et corrigés
- CLAUDE.md mis à jour
- TypeScript compile sans erreur
- Couverture vérifiée à 100% par 4 agents d'audit en parallèle

### 3. Discussion stratégique complète

- Vision et positionnement redéfinis (IA sublimée, marché élargi)
- MOAT identifié et structuré (10 différenciateurs + data compound)
- Business model défini (crédits + packs)
- Pricing structuré (6 tiers de packs + add-ons)
- Arguments anti-DIY formalisés (10 pièges)
- Réponses aux objections préparées

### 4. Création du dossier docs-private/

- Dossier créé
- Ce fichier workinprogress.md comme mémoire persistante

---

## ANNEXE : ARCHITECTURE TECHNIQUE RÉSUMÉE

Pour référence rapide dans les futures sessions.

**Stack** : Next.js 16+ / TypeScript / Tailwind / shadcn/ui / PostgreSQL (Neon) / Prisma / Clerk / OpenRouter / Vercel Blob / Inngest / Ably / Sentry

**Agents** :
- Tier 0 (3) : document-extractor, fact-extractor, deck-coherence-checker
- Tier 1 (13) : financial-auditor, deck-forensics, team-investigator, market-intelligence, competitive-intel, exit-strategist, tech-stack-dd, tech-ops-dd, legal-regulatory, gtm-analyst, customer-intel, cap-table-auditor, question-master
- Tier 2 (22) : 21 sector experts + general-expert (saas, fintech, marketplace, ai, healthtech, deeptech, climate, consumer, hardware, gaming, blockchain, biotech, edtech, proptech, mobility, foodtech, hrtech, legaltech, cybersecurity, spacetech, creator)
- Tier 3 (6) : contradiction-detector, synthesis-deal-scorer, devils-advocate, scenario-modeler, memo-generator, conditions-analyst
- Autres : deal-scorer, red-flag-detector, board-member, deal-chat-agent

**Orchestration** : state-machine, message-bus, memory, consensus-engine, reflexion, tier3-coherence, finding-extractor

**DB** : ~1,500 deals (cible 5,000+), Prisma schema 2,067 lignes, 17+ modèles

**Features live** : Live coaching v2 (audio + visual + cumulative), AI Board (4 LLMs), Chat contextuel, Export PDF, API v1, Webhooks, Système de crédits

**Scoring** : Multi-dimensionnel (Team 25%, Market 20%, Product 20%, Timing 15%, Financials 20%), déterministe via calculateAgentScore(), labels analytiques (jamais prescriptifs)

**Positionnement produit** : Angel Desk ANALYSE et GUIDE, ne DÉCIDE JAMAIS. Ton analytique, pas prescriptif. Labels : "Signaux favorables" / "Signaux contrastés" / "Signaux d'alerte dominants" (jamais "Investir" / "Passer").
