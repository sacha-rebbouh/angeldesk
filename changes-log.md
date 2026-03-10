# Changes Log - Angel Desk

---
## 2026-03-10 — refonte: section MOAT & Différenciation (YAML + exec-summary)

**Contexte :** L'ancien moat ("2 ans de data d'avance + complexité technique") était faible — arguments d'exécution, pas moats structurels. Refonte complète avec le framing validé : (1) IA augmentée, (2) Sublimation, (3) Moats de renforcement.

**Fichiers modifiés (2) :**
- `docs-private/reference.yaml` — Section 20 entièrement réécrite. Hiérarchie : primary_moat (IA augmentée — 5 composants : anti-hallucination, guardrails per model, data reliability, deterministic scoring, multi-tier orchestration), sublimation_moat (Board AI, Consensus Engine, Reflexion, Devil's Advocate, driving individuel vs collectif), reinforcement_moats (cycle complet, analyse vivante, track record, data network effect). Comparaison BA+ChatGPT vs Dev vs Angel Desk mise à jour. 10 écueils DIY enrichis.
- `docs-private/exec-summary.md` — Section "Avantage défensif" renommée "Différenciation". Réécrite : IA augmentée (directives anti-hallucination, garde-fous, scoring déterministe), sublimation (4 modèles en tension, contradiction, devil's advocate), renforcement temporel (data, analyse vivante, track record).

---
## 2026-03-10 — feat: intégration données marché Gemini dans reference.yaml + exec-summary

**Contexte :** Les champs TAM/SAM/SOM étaient "TBD" dans le YAML. Intégration des données du rapport Gemini deep research (89 sources) avec données concurrentielles complètes.

**Fichiers modifiés (2) :**
- `docs-private/reference.yaml` — TAM (2.5-4.5B€), SAM (565M€), SOM (Y1 468K€ → Y3 13M€ ARR) avec détail par segment et sources. Ajout segment Family Offices (10-15K structures, 1-5M€ ticket, WTP 2-5K€/mois). Ajout Harmonic ($1.45B valo), Hebbia ($700M), AlphaSense ($4B, 400M$ ARR) au paysage concurrentiel.
- `docs-private/exec-summary.md` — Section Marché enrichie : TAM chiffré, SAM 565M€, SOM Y3 13M€, 850K BAs actifs, Family Offices, concurrents capitalisés (Harmonic/AlphaSense/Hebbia), positionnement différencié.

---
## 2026-03-10 — fix: "5 minutes" → "1 heure" partout (crédibilité marketing)

**Contexte :** Le claim "analyse en 5 minutes" n'est pas crédible. Remplacement par "1 heure" dans tous les textes marketing et user-facing. Les timeouts techniques (cache TTL, API, circuit breaker) ne sont pas touchés.

**Fichiers modifiés (14) :**
- `src/app/page.tsx` — 3 occurrences (hero, feature card, CTA)
- `src/app/layout.tsx` — meta description
- `src/app/(dashboard)/pricing/page.tsx` — sous-titre
- `src/components/onboarding/first-deal-guide.tsx` — guide premier deal
- `src/agents/tier3/memo-generator.ts` — mission prompt
- `CLAUDE.md` — value proposition
- `AGENT-REFONTE-PROMPT.md` — vision
- `docs-private/reference.yaml` — persona Marie
- `docs-private/exec-summary.md` — intro (modifié par l'utilisateur)
- `investor.md` — 4 occurrences (hero, persona, features, roadmap metrics)

---
## 2026-03-10 — feat: Executive Summary créé

**Fichier créé :**
- `docs-private/exec-summary.md` — Executive Summary 2 pages (9 sections). Problème, solution (44 agents, 4 tiers), différenciateurs (Board AI, Live Coaching, analyse vivante, pipeline complet), marché (4 segments), business model (crédits, 5 packs, marges 70-85%), MOAT (data network effect + complexité orchestration), fondateur, statut.

**Fichier modifié :**
- `docs-private/workinprogress.md` — Executive Summary marqué FAIT

---
## 2026-03-10 — feat: création du YAML de référence et du mega prompt Gemini TAM/SAM/SOM

**Fichiers créés :**
- `docs-private/reference.yaml` — Source de vérité unique pour tous les documents startup (~1800 lignes, 34 sections). Couvre : identité, fondateur, vision & positionnement, marché, problème, produit (44 agents détaillés), scoring, Board AI, live coaching, engines (consensus + reflexion), context engine, red flags, questions, négociation, chat, PDF export, API v1, anti-hallucination (5 directives texte exact), MOAT & différenciation (10 differentiators), pricing (crédits, 6 packs, marges), add-ons, stack technique, DB exploitation, DB maintenance (4 agents), règles de positionnement (table INTERDIT), persona, go-to-market, unit economics, legal/compliance, KPIs, roadmap.
- `docs-private/gemini-market-research-prompt.md` — Mega prompt structuré pour deep research Gemini sur TAM/SAM/SOM. 7 sections : investisseurs par segment/géo, sizing TAM/SAM/SOM (top-down + bottom-up), paysage concurrentiel (30+ concurrents), dépense par segment, tendances (IA, réglementation, consolidation), startups comparables, sources obligatoires (EBAN, ACA, NVCA, Preqin, etc.).

**Fichier modifié :**
- `docs-private/workinprogress.md` — §7 mis à jour (YAML et mega prompt marqués FAIT)
- `docs-private/reference.yaml` — Section `founder` enrichie via RapidAPI LinkedIn (éducation complète, 6 expériences détaillées, bio, skills, career summary)
- `scripts/fetch-founder-linkedin.ts` — Script standalone pour fetch profil LinkedIn fondateur

---
## 2026-03-09 — fix: ajout des 5 Anti-Hallucination Directives dans 6 fichiers manquants (live coaching + negotiation)

**Contexte :** 6 fichiers générant du contenu analytique visible par le Business Angel n'avaient pas les 5 directives anti-hallucination. Injection du bloc complet (Confidence Threshold, Abstention Permission, Citation Demand, Self-Audit, Structured Uncertainty) dans chaque system prompt.

**Fichiers modifiés :**
- `src/lib/live/coaching-engine.ts` — `COACHING_SYSTEM_PROMPT` (1 system prompt, avant `## Format JSON`)
- `src/lib/live/post-call-generator.ts` — `POST_CALL_SYSTEM_PROMPT` (1 system prompt, avant `FORMAT DE SORTIE`)
- `src/lib/live/post-call-reanalyzer.ts` — `DELTA_SYSTEM_PROMPT` (1 system prompt, avant `FORMAT DE SORTIE`)
- `src/lib/live/transcript-condenser.ts` — `CONDENSER_SYSTEM_PROMPT` (1 system prompt, avant `FORMAT`)
- `src/lib/live/visual-processor.ts` — `ANALYZE_PROMPT` (1 system prompt, avant `## Format JSON`)
- `src/services/negotiation/strategist.ts` — `SYSTEM_PROMPT` (1 system prompt, avant `# FORMAT DE SORTIE`)

---
## 2026-03-09 — fix: ajout Confidence Threshold manquant dans meta-eval LLM call de fact-extractor

**Fichier modifié :** `src/agents/tier0/fact-extractor.ts`

**Description :** L'appel LLM inline de meta-evaluation (~ligne 1097) avait la directive Self-Audit mais il manquait la directive Confidence Threshold. Ajout de la directive "Answer only if you are >90% confident..." avant le Self-Audit dans le systemPrompt de cet appel.

---
## 2026-03-09 — feat: 5 Anti-Hallucination Directives injectées dans TOUS les agents (40+)

**Contexte :** Injection de 5 directives anti-hallucination dans chaque system prompt de la codebase, basées sur la recherche sur le coût asymétrique des erreurs LLM. Standard non-négociable pour tous les agents présents et futurs.

**Les 5 directives :**
1. **Confidence Threshold** — Seuil 90%, pénalité 9:1 (erreur coûte 9x plus que répondre juste)
2. **Abstention Permission** — Permission explicite de dire "I don't know" + tag [UNCERTAIN]
3. **Citation Demand** — Chaque claim sourcé ou marqué [UNVERIFIED]
4. **Self-Audit** — 3 claims les moins sûrs + alternatives + rating global HIGH/MEDIUM/LOW
5. **Structured Uncertainty** — Claims classés CONFIDENT (>90%) / PROBABLE (50-90%) / SPECULATIVE (<50%)

**Couverture :**
- Tier 0 (2 agents), Tier 1 (13 agents), Tier 3 (6 agents), Chat : via `base-agent.ts` (méthodes héritées) + Confidence Threshold direct
- Tier 2 (22 experts) : injection directe dans chaque fichier + `base-sector-expert.ts`
- Board (board-member.ts) : injection directe (5/5)
- Orchestration (consensus-engine.ts, reflexion.ts) : injection directe dans debater, arbitrator, critic, improver (5/5 chaque prompt)

**Fichiers modifiés :** 51+ fichiers agents, `CLAUDE.md` mis à jour avec le standard permanent.

---
## 2026-03-09 — feat: Anti-Hallucination Directive — Abstention Permission (prompt 2/5) injecté dans tous les agents

**Contexte :** Deuxième prompt anti-hallucination. Autorise explicitement les agents LLM à répondre "I don't know" ou "I'm not confident enough" plutôt que de fabriquer des réponses. Les réponses incertaines doivent être marquées [UNCERTAIN].

**Architecture double :**

1. **BaseAgent (23+ agents couverts)** — Méthode `getAbstentionPermission()` dans `base-agent.ts`, chaînée dans `buildFullSystemPrompt()`. Couvre automatiquement Tier 0, Tier 1, Tier 3, Chat, et marketplace-expert.

2. **Tier 2 standalone (21 experts)** — Injection directe dans le system prompt de chaque expert (dans `buildSystemPrompt()` ou `buildXxxPrompt()` selon le pattern).

3. **base-sector-expert.ts** — Injection dans `buildSectorExpertPrompt()` pour les futurs experts utilisant ce template.

4. **board-member.ts** — Injection dans `buildSystemPrompt()` (ne hérite pas de BaseAgent).

**Fichiers modifiés :**
- `src/agents/base-agent.ts` — `getAbstentionPermission()` + chaînage dans `buildFullSystemPrompt()`
- `src/agents/tier2/base-sector-expert.ts` — directive dans le template partagé
- `src/agents/board/board-member.ts` — directive dans `buildSystemPrompt()`
- 21 Tier 2 experts : saas, fintech, blockchain, ai, healthtech, deeptech, climate, consumer, hardware, gaming, biotech, edtech, proptech, mobility, foodtech, hrtech, legaltech, cybersecurity, spacetech, creator, general

---
## 2026-03-09 — feat: Anti-Hallucination Directive — Self-Audit (prompt 4/5) injecte dans tous les agents

**Contexte :** Quatrieme prompt anti-hallucination. Oblige les agents a effectuer un auto-audit apres chaque reponse : identifier les 3 affirmations les moins fiables, expliquer les alternatives, et noter la confiance globale (HIGH / MEDIUM / LOW).

**Architecture double :**

1. **BaseAgent (26+ agents couverts)** — Methode `getSelfAuditDirective()` dans `base-agent.ts`, chainee dans `buildFullSystemPrompt()`. Couvre automatiquement Tier 0 (2), Tier 1 (13), Tier 3 (6), Chat (1), document-extractor, deal-scorer, red-flag-detector, marketplace-expert.

2. **Tier 2 standalone (21 experts)** — Injection directe dans le system prompt de chaque expert (dans `buildSystemPrompt()` ou inline prompt selon le pattern).

3. **base-sector-expert.ts** — Directive dans `buildSectorExpertPrompt()` pour les experts utilisant ce template.

4. **tier2/index.ts** — Variable `selfAudit` ajoutee au fallback sector expert runner.

5. **board-member.ts** — Directive dans `buildSystemPrompt()` (ne herite pas de BaseAgent).

6. **Orchestration** — Directive dans les 4 system prompts de `consensus-engine.ts` (debater + arbitrator) et `reflexion.ts` (critic + improver).

7. **fact-extractor.ts** — Directive dans le system prompt inline de meta-evaluation (en plus de la couverture BaseAgent pour le prompt principal).

**Fichiers modifies (28) :**
- `src/agents/base-agent.ts` — `getSelfAuditDirective()` + chainage
- `src/agents/tier2/index.ts` — variable + append
- `src/agents/tier2/base-sector-expert.ts` — directive dans template
- `src/agents/tier2/saas-expert.ts`, `ai-expert.ts`, `fintech-expert.ts`, `blockchain-expert.ts`, `climate-expert.ts`, `consumer-expert.ts`, `creator-expert.ts`, `cybersecurity-expert.ts`, `deeptech-expert.ts`, `edtech-expert.ts`, `foodtech-expert.ts`, `gaming-expert.ts`, `general-expert.ts`, `hardware-expert.ts`, `healthtech-expert.ts`, `hrtech-expert.ts`, `legaltech-expert.ts`, `mobility-expert.ts`, `proptech-expert.ts`, `spacetech-expert.ts`, `biotech-expert.ts`
- `src/agents/board/board-member.ts`
- `src/agents/tier0/fact-extractor.ts` (prompt inline meta-evaluation)
- `src/agents/orchestration/consensus-engine.ts` (2 prompts: debater + arbitrator)
- `src/agents/orchestration/reflexion.ts` (2 prompts: critic + improver)

**Fichiers couverts par BaseAgent (pas de modification separee) :**
- Tier 0 : `deck-coherence-checker.ts`, `fact-extractor.ts` (prompt principal)
- Tier 1 : `financial-auditor.ts`, `deck-forensics.ts`, `team-investigator.ts`, `market-intelligence.ts`, `competitive-intel.ts`, `exit-strategist.ts`, `tech-stack-dd.ts`, `tech-ops-dd.ts`, `legal-regulatory.ts`, `gtm-analyst.ts`, `customer-intel.ts`, `cap-table-auditor.ts`, `question-master.ts`
- Tier 3 : `contradiction-detector.ts`, `synthesis-deal-scorer.ts`, `devils-advocate.ts`, `scenario-modeler.ts`, `memo-generator.ts`, `conditions-analyst.ts`
- Chat : `deal-chat-agent.ts`
- Autres : `document-extractor.ts`, `deal-scorer.ts`, `red-flag-detector.ts`, `marketplace-expert.ts`

---
## 2026-03-09 — feat: Anti-Hallucination Directive — Structured Uncertainty (prompt 5/5) injecte dans tous les agents

**Contexte :** Cinquieme et dernier prompt anti-hallucination. Impose aux agents de structurer chaque reponse en trois categories de certitude : CONFIDENT (>90%), PROBABLE (50-90%), SPECULATIVE (<50%). Empeche les agents de presenter des inferences comme des certitudes.

**Architecture double :**

1. **BaseAgent (26+ agents couverts)** — Methode `getStructuredUncertaintyDirective()` dans `base-agent.ts`, chainee dans `buildFullSystemPrompt()`. Couvre automatiquement Tier 0 (2), Tier 1 (13), Tier 3 (6), Chat (1), document-extractor, deal-scorer, red-flag-detector, marketplace-expert.

2. **Tier 2 standalone (21 experts)** — Variable `structuredUncertainty` ajoutee et appendue au `systemPrompt` au call site (`systemPrompt: ... + citationDemand + structuredUncertainty`).

3. **base-sector-expert.ts** — Directive dans `buildSectorExpertPrompt()` pour les experts utilisant ce template.

4. **tier2/index.ts** — Variable `structuredUncertainty` ajoutee au fallback sector expert runner.

5. **board-member.ts** — Directive dans `buildSystemPrompt()` (ne herite pas de BaseAgent).

6. **Orchestration** — Directive dans les 4 system prompts de `consensus-engine.ts` (debater + arbitrator) et `reflexion.ts` (critic + improver).

**Fichiers modifies (28) :**
- `src/agents/base-agent.ts` — `getStructuredUncertaintyDirective()` + chainage
- `src/agents/tier2/index.ts` — variable + append
- `src/agents/tier2/base-sector-expert.ts` — directive dans template
- `src/agents/tier2/saas-expert.ts`, `ai-expert.ts`, `fintech-expert.ts`, `blockchain-expert.ts`, `climate-expert.ts`, `consumer-expert.ts`, `creator-expert.ts`, `cybersecurity-expert.ts`, `deeptech-expert.ts`, `edtech-expert.ts`, `foodtech-expert.ts`, `gaming-expert.ts`, `general-expert.ts`, `hardware-expert.ts`, `healthtech-expert.ts`, `hrtech-expert.ts`, `legaltech-expert.ts`, `mobility-expert.ts`, `proptech-expert.ts`, `spacetech-expert.ts`, `biotech-expert.ts`
- `src/agents/board/board-member.ts`
- `src/agents/orchestration/consensus-engine.ts` (2 prompts)
- `src/agents/orchestration/reflexion.ts` (2 prompts)

---
## 2026-03-09 — feat: Anti-Hallucination Directive — Confidence Threshold (prompt 1/5) injecté dans tous les agents

**Contexte :** Premier prompt anti-hallucination. Impose un seuil de confiance >90% avant de repondre. Le systeme de scoring asymetrique (erreur = -9pts, correct = +1pt, "I don't know" = 0pt) pousse les agents a s'abstenir plutot que risquer une hallucination.

**Approche :** Injection directe du bloc dans le system prompt de chaque fichier agent (49 fichiers). Place avant les sections OUTPUT FORMAT / JSON quand elles existent, sinon en fin de prompt.

**Fichiers modifies (49) :**
- Tier 0 (2) : `deck-coherence-checker.ts`, `fact-extractor.ts`
- Tier 1 (13) : `financial-auditor.ts`, `deck-forensics.ts`, `team-investigator.ts`, `market-intelligence.ts`, `competitive-intel.ts`, `exit-strategist.ts`, `tech-stack-dd.ts`, `tech-ops-dd.ts`, `legal-regulatory.ts`, `gtm-analyst.ts`, `customer-intel.ts`, `cap-table-auditor.ts`, `question-master.ts`
- Tier 2 (24) : `saas-expert.ts`, `ai-expert.ts`, `marketplace-expert.ts`, `healthtech-expert.ts`, `deeptech-expert.ts`, `climate-expert.ts`, `consumer-expert.ts`, `hardware-expert.ts`, `gaming-expert.ts`, `biotech-expert.ts`, `edtech-expert.ts`, `proptech-expert.ts`, `foodtech-expert.ts`, `hrtech-expert.ts`, `cybersecurity-expert.ts`, `spacetech-expert.ts`, `creator-expert.ts`, `general-expert.ts`, `base-sector-expert.ts`, `fintech-expert.ts`, `blockchain-expert.ts`, `mobility-expert.ts`, `legaltech-expert.ts`, `marketplace-expert.ts`
- Tier 3 (6) : `contradiction-detector.ts`, `synthesis-deal-scorer.ts`, `devils-advocate.ts`, `scenario-modeler.ts`, `memo-generator.ts`, `conditions-analyst.ts`
- Chat (1) : `deal-chat-agent.ts`
- Other (3) : `document-extractor.ts`, `deal-scorer.ts`, `red-flag-detector.ts`, `board-member.ts`

---
## 2026-03-09 — feat: Anti-Hallucination Directive — Abstention Permission (prompt 2/5) injecté dans tous les agents

**Contexte :** Deuxième prompt anti-hallucination. Autorise explicitement les agents LLM à répondre "I don't know" ou "I'm not confident enough" plutôt que de fabriquer des réponses. Les réponses incertaines doivent être marquées [UNCERTAIN].

**Architecture double :**

1. **BaseAgent (23+ agents couverts)** — Méthode `getAbstentionPermission()` dans `base-agent.ts`, chaînée dans `buildFullSystemPrompt()`. Couvre automatiquement Tier 0, Tier 1, Tier 3, Chat, et marketplace-expert.

2. **Tier 2 standalone (21 experts)** — Injection directe dans le system prompt de chaque expert (dans `buildSystemPrompt()` ou `buildXxxPrompt()` selon le pattern).

3. **base-sector-expert.ts** — Injection dans `buildSectorExpertPrompt()` pour les futurs experts utilisant ce template.

4. **board-member.ts** — Injection dans `buildSystemPrompt()` (ne hérite pas de BaseAgent).

**Fichiers modifiés :**
- `src/agents/base-agent.ts` — `getAbstentionPermission()` + chaînage dans `buildFullSystemPrompt()`
- `src/agents/tier2/base-sector-expert.ts` — directive dans le template partagé
- `src/agents/board/board-member.ts` — directive dans `buildSystemPrompt()`
- `src/agents/tier2/saas-expert.ts`
- `src/agents/tier2/fintech-expert.ts`
- `src/agents/tier2/blockchain-expert.ts`
- `src/agents/tier2/ai-expert.ts`
- `src/agents/tier2/healthtech-expert.ts`
- `src/agents/tier2/deeptech-expert.ts`
- `src/agents/tier2/climate-expert.ts`
- `src/agents/tier2/consumer-expert.ts`
- `src/agents/tier2/hardware-expert.ts`
- `src/agents/tier2/gaming-expert.ts`
- `src/agents/tier2/biotech-expert.ts`
- `src/agents/tier2/edtech-expert.ts`
- `src/agents/tier2/proptech-expert.ts`
- `src/agents/tier2/mobility-expert.ts`
- `src/agents/tier2/foodtech-expert.ts`
- `src/agents/tier2/hrtech-expert.ts`
- `src/agents/tier2/legaltech-expert.ts`
- `src/agents/tier2/cybersecurity-expert.ts`
- `src/agents/tier2/spacetech-expert.ts`
- `src/agents/tier2/creator-expert.ts`
- `src/agents/tier2/general-expert.ts`

---
## 2026-03-09 — feat: Anti-Hallucination Directive — Citation Demand (prompt 3/5) injecté dans tous les agents

**Contexte :** Troisième prompt anti-hallucination à injecter dans chaque agent LLM. Chaque claim factuel doit être sourcé (nom, publication, date), marqué [UNVERIFIED], ou explicitement identifié comme venant du training data.

**Architecture double :**

1. **BaseAgent (23 agents couverts)** — Ajout de `getCitationDemand()` dans `base-agent.ts`, chaîné dans `buildFullSystemPrompt()` après `getAbstentionPermission()` et avant `getSelfAuditDirective()`. Couvre automatiquement tous les agents Tier 0, Tier 1, Tier 3, Chat et marketplace-expert.

2. **Tier 2 standalone (21 experts)** — Chaque expert a son propre `run()` avec appel direct à `complete()`/`completeJSON()`. Le `citationDemand` est défini comme constante et appendu au system prompt avant l'appel LLM.

3. **Tier 2 index.ts (fallback)** — `wrapWithRun()` injecte aussi le directive pour tout futur expert qui n'aurait pas son propre `run()`.

**Fichiers modifiés :**
- `src/agents/base-agent.ts` — `getCitationDemand()` + chaînage dans `buildFullSystemPrompt()`
- `src/agents/tier2/index.ts` — injection dans `wrapWithRun()` fallback
- `src/agents/tier2/saas-expert.ts` — citationDemand dans `run()`
- `src/agents/tier2/fintech-expert.ts` — citationDemand dans `run()`
- `src/agents/tier2/blockchain-expert.ts` — citationDemand dans `run()`
- `src/agents/tier2/ai-expert.ts` — citationDemand dans `run()`
- `src/agents/tier2/healthtech-expert.ts` — citationDemand dans `run()`
- `src/agents/tier2/deeptech-expert.ts` — citationDemand dans `run()`
- `src/agents/tier2/climate-expert.ts` — citationDemand dans `run()`
- `src/agents/tier2/consumer-expert.ts` — citationDemand dans `run()`
- `src/agents/tier2/hardware-expert.ts` — citationDemand dans `run()`
- `src/agents/tier2/gaming-expert.ts` — citationDemand dans `run()`
- `src/agents/tier2/biotech-expert.ts` — citationDemand dans `run()`
- `src/agents/tier2/edtech-expert.ts` — citationDemand dans `run()`
- `src/agents/tier2/proptech-expert.ts` — citationDemand dans `run()`
- `src/agents/tier2/mobility-expert.ts` — citationDemand dans `run()`
- `src/agents/tier2/foodtech-expert.ts` — citationDemand dans `run()`
- `src/agents/tier2/hrtech-expert.ts` — citationDemand dans `run()`
- `src/agents/tier2/legaltech-expert.ts` — citationDemand dans `run()`
- `src/agents/tier2/cybersecurity-expert.ts` — citationDemand dans `run()`
- `src/agents/tier2/spacetech-expert.ts` — citationDemand dans `run()`
- `src/agents/tier2/creator-expert.ts` — citationDemand dans `run()`
- `src/agents/tier2/general-expert.ts` — citationDemand dans `run()`

---
## 2026-03-09 — feat: persistance cross-analyses des questions (plus de perte entre runs)

**Contexte :** D'une analyse à l'autre sur le même deal, des questions pertinentes (ex: un concurrent identifié) disparaissaient car chaque run du question-master générait ses questions from scratch sans mémoire des runs précédents.

**Solution — double mécanisme :**

1. **Côté serveur (orchestrateur + question-master)** :
   - `loadPreviousAnalysisQuestions()` charge les questions consolidées de la dernière analyse complétée
   - Les questions non-répondues sont injectées dans le contexte du question-master
   - Le system prompt du question-master interdit explicitement de perdre des questions non-répondues
   - Les questions déjà répondues (via FounderResponse/FactEvent) sont marquées pour ne pas être re-posées

2. **Côté UI (consolidation cross-analyses)** :
   - `consolidateAcrossAnalyses()` fusionne les questions de l'analyse courante + précédente
   - Déduplication par normalisation du texte (même clé = même question, pas de doublon)
   - Questions présentes dans les deux analyses reçoivent un bonus de score (+10)
   - Questions uniquement dans l'analyse précédente reçoivent un bonus de persistance (+15)

**Fichiers modifiés :**
- `src/agents/orchestrator/persistence.ts` — ajout `loadPreviousAnalysisQuestions()`
- `src/agents/types.ts` — ajout `previousAnalysisQuestions` dans `EnrichedAgentContext`
- `src/agents/orchestrator/index.ts` — injection dans les 2 code paths (tier1 + full analysis)
- `src/agents/tier1/question-master.ts` — section prompt cross-run + `formatPreviousQuestions()`
- `src/lib/question-consolidator.ts` — ajout `consolidateAcrossAnalyses()`
- `src/components/deals/analysis-panel.tsx` — utilisation de `consolidateAcrossAnalyses` dans le useMemo

---
## 2026-03-09 — fix: questions cross-run perdaient le détail structuré (triggerData, evaluation)

**Contexte :** Les questions précédentes étaient injectées dans le question-master avec seulement le texte, la priorité et la catégorie. Tout le détail qui fait la force de la question (triggerData, whyItMatters, goodAnswer, badAnswer, redFlagIfBadAnswer, followUpIfBad, timing) était perdu.

**Fix :**
- `PreviousAnalysisQuestion` enrichi avec `context` structuré (sourceAgent, redFlagId, triggerData, whyItMatters), `evaluation` (goodAnswer, badAnswer, redFlagIfBadAnswer, followUpIfBad), et `timing`
- `loadPreviousAnalysisQuestions()` extrait et préserve toute la structure des founderQuestions
- `formatPreviousQuestions()` injecte chaque question avec tout son détail dans le prompt

**Fichiers modifiés :**
- `src/agents/orchestrator/persistence.ts` — interface + extraction enrichies
- `src/agents/types.ts` — `previousAnalysisQuestions` type mis à jour
- `src/agents/tier1/question-master.ts` — formatage avec détail complet

---
## 2026-03-09 — fix: texte narratif incohérent avec le score corrigé (ex: score=46, texte dit "21/100")

**Contexte :** Le garde-fou corrige le score numérique quand le LLM diverge de ses propres dimensions (ex: LLM dit 21, dimensions pondérées donnent 46). Mais le texte `rationale` est généré par le LLM AVANT la correction — il mentionne encore l'ancien score ("Le score final est de 21/100"), créant une incohérence visible.

**Fix :** Après correction du score, `patchScoreInText()` remplace les mentions de l'ancien score LLM dans le texte rationale. Patterns patchés : "21/100", "score de 21", "score est de 21", "score final de 21".

**Fichier modifié :**
- `src/agents/tier3/synthesis-deal-scorer.ts` — `patchScoreInText()` dans `transformResponse()`

---
## 2026-03-09 — fix: score instable entre analyses (49 → 15 sans raison)

**Contexte :** Le `synthesis-deal-scorer` donnait un score de 15 alors que ses propres dimensions pondérées donnaient 40. Le LLM appliquait un `weaknessesDeduction` de 25 points subjectif, et le garde-fou (seuil de divergence > 25) le laissait passer (25 n'est pas > 25).

**Root cause :** Le LLM retourne un `overallScore` influencé par un "gut feeling" subjectif (scoreBreakdown.weaknessesDeduction) qui varie entre les runs. Le code faisait confiance au LLM si la divergence était ≤ 25 — trop permissif.

**Fix :**
- `src/agents/tier3/synthesis-deal-scorer.ts` — Seuil de divergence abaissé de 25 à 15. Au-delà de 15 points d'écart entre le score LLM et la somme pondérée de ses propres dimensions, on utilise toujours la somme pondérée (le LLM a "montré son travail" dans les dimensions, c'est plus fiable que son score global subjectif).

---
## 2026-03-09 — perf: page deal de 36s à ~2s + cache Blob pour résultats

**Contexte :** La page deal mettait 36s à s'afficher car le blob JSON `results` (plusieurs MB, 20+ agents) était chargé depuis Neon à chaque requête. Le transfert réseau du TOAST PostgreSQL (~10MB) prenait 30-35s.

**Architecture :**
1. Le poll `/analyses` ne charge JAMAIS le blob results (metadata only = ~200ms)
2. Les résultats sont uploadés en Vercel Blob / filesystem local à la fin de l'analyse
3. Le fetch `?id=xxx` lit depuis le cache Blob (<1s) avec fallback DB + backfill automatique
4. Le client fetch les résultats en background après détection de COMPLETED

**Fichiers modifiés :**
- `src/agents/orchestrator/persistence.ts` — `completeAnalysis()` upload les résultats en Blob après sauvegarde DB
- `src/app/api/deals/[dealId]/analyses/route.ts` — Poll = metadata only. `?id=xxx` = Blob cache → DB fallback avec backfill
- `src/app/(dashboard)/deals/[dealId]/page.tsx` — Suppression de `getLatestAnalysisResults` du SSR
- `src/components/deals/analysis-panel.tsx` — Fetch résultats via `?id=xxx` en background, `loadCompletedAnalysis` simplifié

---
## 2026-03-08 — fix: synthesis-deal-scorer timeout + score incohérent

**Contexte :** Le scorer timeout a 240s quand il doit retry (0 dimensions 1er appel) et que le calcul percentile DB (F37) hang pendant instabilite Neon. Score LLM=2 vs dimensions=50 (divergence 48pts).

**Fixes :**
- Timeout augmente de 240s → 300s (2 appels LLM + DB necessitent plus de marge)
- Calcul percentile DB (F37) enveloppe dans `Promise.race` avec timeout 10s — ne bloque plus quand Neon est instable
- Template JSON : score.value annote "ENTIER entre 0 et 100, PAS une note sur 5 ou 10", breakdown avec 2 exemples concrets (Team 72, Financials 58)
- Rappel ajouté : "score.value = Σ(breakdown weights × breakdown scores)"

**Fichiers modifies :**
- `src/agents/tier3/synthesis-deal-scorer.ts` — timeout 300s, Promise.race F37, template JSON clarifié, instruction score coherence

---
## 2026-03-08 — fix: extraction PDF Keynote (60% qualite → reconstruction spatiale)

**Contexte :** Les PDFs generees par Keynote/Apple fragmentent le texte en dizaines de micro-morceaux par ligne. L'extraction naive (`.join(" ")`) produisait du texte fragmente (mots coupes, espaces parasites), score qualite 60% avec warning "Text appears fragmented".

**Cause :** `pdfjs-dist` retourne chaque fragment avec ses coordonnees spatiales (x, y via `transform`), mais l'extracteur ignorait ces positions et concatenait tout avec un simple espace.

**Fix :** Nouvelle fonction `reconstructTextFromItems()` qui :
1. Trie les items par Y descendant (haut→bas) puis X croissant (gauche→droite)
2. Detecte les sauts de ligne quand le Y change de plus de 60% de la taille de police
3. Insere des espaces uniquement quand le gap horizontal depasse 25% de la taille de police
4. Estime la largeur via `item.width` ou fallback (longueur × fontSize × 0.5)

**Fichiers modifies :**
- `src/services/pdf/extractor.ts` — Remplacement `.join(" ")` par `reconstructTextFromItems()` avec reconstruction spatiale complete

---
## 2026-03-08 — fix: export PDF crash (null.toFixed) + null guards PDF sections

**Contexte :** L'export PDF crashait avec `Cannot read properties of null (reading 'toFixed')` sur `burn.burnMultiple` dans FinancialFindings. Le guard `!== undefined` ne protégeait pas contre `null` retourné par les agents.

**Fichiers modifiés :**
- `src/lib/pdf/pdf-sections/tier1-agents.tsx` — Remplacé tous les guards `!== undefined` par `!= null` avant `.toFixed()` (burn.monthlyBurn, burn.burnMultiple, burn.runway, investorReturn.multiple, investorReturn.irr, expectedMultiple, expectedIrr, downsideMultiple, upsideMultiple)
- `src/lib/pdf/pdf-sections/tier3-synthesis.tsx` — Idem pour weighted.expectedMultiple, irr, ret.multiple, ret.irr

---
## 2026-03-08 — fix: terminologie sectorielle (CTO/tech pour deals non-tech)

**Contexte :** Les agents utilisaient des termes tech (CTO, VP Engineering, dette technique) pour tous les deals, y compris non-tech (food, retail, mode). Perte de crédibilité quand l'analyse parle de "CTO inexistant" pour une marque de petfood.

**Fichiers modifiés :**
- `src/agents/tier1/team-investigator.ts` — Ajout section "ADAPTATION AU SECTEUR" avec rôles clés par secteur (tech, consumer, food, marketplace, biotech, services). "CEO/CTO" → "Rôles complémentaires". `rolesMissing` ne signale plus CTO si non-tech. Gaps critiques adaptés au secteur.
- `src/agents/tier3/synthesis-deal-scorer.ts` — Scoring rubric: "no CTO" → "rôle clé manquant selon le secteur". Exemples nettoyés.
- `src/agents/tier3/scenario-modeler.ts` — Ajout section "ADAPTATION AU SECTEUR" (métriques, comparables, triggers). Exemples: "CTO part" → "cofondateur clé quitte".
- `src/agents/tier3/devils-advocate.ts` — Ajout section "ADAPTATION AU SECTEUR" (kill reasons, comparables échecs du même secteur).
- `src/agents/tier3/memo-generator.ts` — Ajout section "ADAPTATION AU SECTEUR" (vocabulaire, métriques, rôles). Exemples nettoyés.

---
## 2026-03-08 — fix: agents ignoraient la date actuelle (contexte temporel)

**Contexte :** Les agents LLM n'avaient aucune notion de la date actuelle. Ils déduisaient la date depuis le contenu des documents analysés, ce qui causait des erreurs d'analyse (ex: penser qu'on est en sept 2025 alors qu'on est en mars 2026, considérer un CA annuel comme une projection alors qu'il est réalisé).

**Fichiers modifiés :**
- `src/agents/base-agent.ts` — Injection d'un bloc `CONTEXTE TEMPOREL` avec la date actuelle dans `buildFullSystemPrompt()`. Instruction explicite de ne jamais déduire la date depuis les documents. S'applique à TOUS les agents (Tier 1, 2, 3 + chat).

---
## 2026-03-08 — fix: competitive-intel JSON parse error + score=0 Tier 3

**Contexte :** Trois problèmes liés aux templates JSON des agents LLM :
1. `competitive-intel` crashait avec "Failed to parse LLM response" — template JSON trop verbeux (~160 lignes), le LLM générait du JSON invalide
2. `scenario-modeler` et `devils-advocate` retournaient `score=0` — `score` en fin de template, tronqué avant génération
3. `scenario-modeler` était sur `GEMINI_3_FLASH` au lieu de `GEMINI_PRO` (seul Tier 3 pas sur PRO)

**Fichiers modifiés :**
- `src/agents/tier1/competitive-intel.ts` — Template JSON compressé (160→30 lignes), `score` déplacé en 1er champ, ajout règle anti-troncation (5 competitors max, justifications courtes)
- `src/agents/tier3/scenario-modeler.ts` — `score`, `alertSignal`, `narrative`, `redFlags`, `questions` déplacés en DEBUT du template (avant `scenarios`). Fallback score dérivé depuis `probabilityWeightedOutcome.expectedMultiple` au lieu de 0.
- `src/agents/tier3/devils-advocate.ts` — `score` déplacé en 1er champ (avant `meta`). `alertSignal`, `narrative`, `redFlags`, `questions` aussi avant `findings`. Fallback score dérivé depuis kill reasons (count + severity).
- `src/services/openrouter/router.ts` — Ajout `scenario-modeler` au mapping `GEMINI_PRO`.

---
## 2026-03-08 — feat: instrument de financement + inférence automatique du stade

**Contexte :** Le stage du deal (Seed, Pre-seed...) et l'instrument de financement (SAFE, equity round...) sont deux concepts distincts. Le modèle ne distinguait pas les deux. De plus, beaucoup de decks ne mentionnent pas explicitement le stade — il faut l'inférer à partir des signaux (montant, instrument, cap, traction).

**Fichiers modifiés :**
- `prisma/schema.prisma` — Nouvel enum `FundingInstrument` (EQUITY, SAFE, BSA_AIR, CONVERTIBLE_NOTE, BRIDGE) + champ `instrument` sur `Deal`
- `src/lib/format-utils.ts` — Nouvelle fonction `getInstrumentLabel()` pour labels FR
- `src/types/index.ts` — Export `FundingInstrument`, ajout à `CreateDealInput`
- `src/agents/types.ts` — Ajout `instrument` à `ExtractedDealInfo`
- `src/app/api/deals/route.ts` — Validation `instrument` dans le schema de création
- `src/app/api/deals/[dealId]/route.ts` — Validation `instrument` dans le schema de mise à jour
- `src/app/api/v1/deals/route.ts` — Validation `instrument` dans l'API v1
- `src/app/(dashboard)/deals/new/page.tsx` — Sélecteur d'instrument dans le formulaire de création
- `src/app/(dashboard)/deals/[dealId]/page.tsx` — Passage du champ `instrument` au DealInfoCard
- `src/components/deals/deal-info-card.tsx` — Affichage + édition de l'instrument dans la fiche deal
- `src/agents/base-agent.ts` — Injection du `Funding Instrument` dans le contexte LLM des agents
- `src/agents/document-extractor.ts` — Extraction de l'instrument + règles d'inférence du stade (montant, instrument, valuation cap, traction, taille équipe)
- `src/agents/orchestrator/persistence.ts` — Persist l'instrument extrait sur le deal (auto-enrichissement)
- `src/agents/maintenance/types.ts` — Ajout SAFE, BSA-AIR et variantes dans `STAGE_NORMALIZATION`

---
## 2026-02-26 — feat: bouton "Réinviter le bot" + couverture complète scénarios

**Fichiers créés :**
- `src/app/api/live-sessions/[id]/reinvite/route.ts` — Redéploie un nouveau bot Recall sur le même meeting URL. Supprime le rapport intermédiaire. Autorisé depuis `live`, `bot_joining`, `processing`, `failed`, `completed`. Garde 2h max.

**Fichiers modifiés :**
- `src/app/api/live-sessions/[id]/start/route.ts` — Timeouts Recall plus tolérants : `waiting_room_timeout` 2min→5min, `noone_joined_timeout` 5min→10min, `everyone_left_timeout` 10s→30s
- `src/app/(dashboard)/deals/[dealId]/live/components/session-controls.tsx` — Bouton "Réinviter le bot" visible sur tous les status (live, bot_joining, processing, failed, completed)
- `src/components/deals/live-tab-content.tsx` — Fenêtre "recently completed" 10min→2h. Bandeau ambre "Le meeting est encore en cours ?" avec bouton réinviter sur les sessions completed/failed récentes. SessionControls rendu dans bot_joining et processing.
- `src/lib/live/post-call-generator.ts` — Protection race condition reinvite : `updateMany` avec guard `status: "processing"`

**Scénarios couverts :**
- Personne n'est là, bot attend seul → 10 min de patience (avant 5)
- Fondateur se déco 5 secondes → 30s de grace (avant 10s = mort)
- BA décale de 20 min → session completed + bandeau réinviter
- Waiting room Zoom → 5 min d'attente (avant 2)
- Crash bot Recall → bouton réinviter en status failed
- BA oublie de stop → auto-close quand tous les humains partent

---
## 2026-02-26 — fix: contexte COMPLET pour coaching + visual, auto-close session

**Fichiers modifiés :**
- `src/lib/live/types.ts` — `DealContext` enrichi : ajout `dealBasics` (ARR, valo, montant, croissance), `scores` (5 dimensions), `founderDetails` (LinkedIn, parcours, éducation, ventures), `allAgentFindings` (résultats de TOUS les agents), `negotiationStrategy`
- `src/lib/live/context-compiler.ts` — **Suppression de `serializeContextCompact`**. `compileDealContext()` enrichi : query Prisma étendue (founders avec linkedinUrl/verifiedInfo/previousVentures, analysis avec negotiationStrategy), extraction de TOUS les résultats d'agents (pas juste 5), détails LinkedIn des fondateurs. `serializeContext()` enrichi : scores par dimension, données financières brutes du deal, profils fondateurs complets, résultats de tous les agents, stratégie de négo.
- `src/lib/live/coaching-engine.ts` — Retour à `serializeContext` (contexte complet), timeout 5s→8s
- `src/lib/live/visual-processor.ts` — Retour à `serializeContext` (contexte complet), revert pending-frame → simple lock, maxTokens 600→800
- `src/app/api/live-sessions/[id]/webhook/route.ts` — Auto-close : quand tous les participants humains quittent le meeting (hors bot "AngelDesk Notes"), la session passe automatiquement en "processing" et le post-call report est généré. Le bot est aussi expulsé du meeting.
- `src/lib/live/__tests__/live-coaching.test.ts` — Mise à jour du mock `DealContext` pour les nouveaux champs

**Bugs corrigés :**
1. Visual pipeline cassé — revert du pending-frame pattern (race condition)
2. Coaching sans contexte — `serializeContextCompact` supprimé, retour au contexte COMPLET avec tous les agents, financials, LinkedIn, etc.
3. Session restait ouverte si l'utilisateur oubliait de cliquer "Stop"

---
## 2026-02-26 — perf: live coaching latency reduction (7 fixes)

**Fichiers modifiés :**
- `src/lib/live/context-compiler.ts` — ajout `serializeContextCompact()` (~1500 tokens vs 5-8K)
- `src/lib/live/coaching-engine.ts` — compact context, timeout 8s→5s
- `src/lib/live/visual-processor.ts` — compact context, processing lock → pending-frame pattern, maxTokens 800→600
- `src/lib/live/utterance-router.ts` — (inchangé, déjà optimisé)
- `src/app/api/live-sessions/[id]/webhook/route.ts` — buffer 8→5 mots, gap 3s→1.5s, `partial_data` auto-promote, `participant_events.join` handling, imports cleanés
- `src/app/api/live-sessions/[id]/start/route.ts` — ajout `transcript.partial_data`, `participant_events.join/leave` aux events per-bot
- `src/app/api/live-sessions/[id]/visual-frame/route.ts` — rate limit 2s→3s (match processing time)
- `src/components/deals/live-tab-content.tsx` — `useSessionRealtimeEvents` hook (Ably pendant bot_joining), `refetchIntervalInBackground: true`, `startedAtOverride` pour timer immédiat

**Impact attendu :**
- Transition bot_joining→live : ~20s → 2-5s (via participant.join + partial_data events + Ably instant)
- Participants : visibles dès l'event Ably participant.join (vs 20s avant)
- Coaching cards latence : 5-7s → 2-4s (compact context -70% tokens + buffer gap 1.5s)
- Visual pipeline : 15-18s → 5-8s (compact context + pending-frame pattern + rate limit 3s)
- Background tab : polling continue quand onglet inactif

---
## 2026-02-26 — perf+fix: visual pipeline single-stage HAIKU, per-contradiction questions, card quality

**Fichiers modifiés :**
- `src/lib/live/visual-processor.ts` — Fusion du pipeline 2-stage (Haiku classify 6s + Sonnet analyze 16s = 22s) en un seul appel HAIKU (~5-8s). Prompt remanié pour analyse BA-grade avec extraction chiffrée, contradictions avec question par écart, détection de nouveauté intégrée.
- `src/lib/live/types.ts` — Ajout `suggestedQuestion` optionnel par contradiction dans `VisualAnalysis`.
- `src/app/api/live-sessions/[id]/visual-frame/route.ts` — Fix bug : chaque carte contradiction utilise maintenant sa propre `suggestedQuestion` (au lieu de la question globale appliquée à toutes les cartes). Format carte professionnel ("Écart détecté — ...").

**Impact latence :** ~22s → ~5-8s pour l'analyse visuelle complète.

---
## 2026-02-25 — fix: 3 root causes WS relay + deploy fiabilisé

**Problème** : Recall.ai ne connectait jamais le WebSocket au relay Fly.io (0 connexions sur 12+ bots).

**Root causes identifiées** (agents de recherche dédiés) :
1. **Trailing `/` manquant dans l'URL WS** — les docs Recall exigent `wss://host/?param=value` (avec `/` avant `?`). Sans ça → HTTP 400 silencieux. Notre URL était `wss://host?param=value`.
2. **`video_separate_png.data` non supporté via webhook** — les docs Recall listent UNIQUEMENT `participant_events.*` et `transcript.*` pour les webhooks. Les events vidéo sont WebSocket-only. L'approche webhook essayée puis revertée.
3. **Fly.io machine auto-stop** — pas de `min_machines_running`, pas de `auto_stop_machines = "off"`. Recall retry 30× / 3s = 90s max. Si machine froide → toutes les retries échouent → endpoint marqué `failed` définitivement.
4. **Dockerfile `vips-dev` conflit sharp** — `apk add vips-dev` installe un libvips système qui entre en conflit avec le libvips bundlé par sharp 0.33+ sur Alpine.

**Fichiers modifiés** :
- `src/app/api/live-sessions/[id]/start/route.ts` — URL WS avec trailing `/` (`${wsRelayUrl}/?sessionId=${id}`), `gallery_view_v2` requis, `transcript.partial_data` retiré du webhook (immédiatement jeté dans le handler = trafic inutile)
- `services/ws-relay/fly.toml` — Migration `[[services]]` → `[http_service]`, `auto_stop_machines = "off"`, `min_machines_running = 1`, mémoire 256→512MB
- `services/ws-relay/Dockerfile` — Suppression `apk add vips-dev`, ajout `SHARP_IGNORE_GLOBAL_LIBVIPS=1`, support `package-lock.json`
- `services/ws-relay/package-lock.json` — Ajouté pour builds reproductibles

Relay redéployé sur Fly.io (v6). Tests trailing slash confirmés OK.

---
## 2026-02-25 — fix: variant web_4_core requis pour video_separate_png

**Fichiers modifiés** :
- `src/app/api/live-sessions/[id]/start/route.ts` — Ajout de `variant: { zoom: "web_4_core", google_meet: "web_4_core", microsoft_teams: "web_4_core" }` au bot config. Le per-participant video (`video_separate_png`) nécessite des bots 4-core — sans ça, Recall accepte la config mais ne connecte jamais le WebSocket. Fallback étendu pour gérer le rejet de `variant`/`web_4_core`.

**Source** : https://docs.recall.ai/docs/how-to-get-separate-videos-per-participant-realtime — "This is a compute heavy feature and we recommend using 4 core bots"

---
## 2026-02-25 — fix: réécriture complète relay WS (protocole Recall incorrect)

**Fichiers modifiés** :
- `services/ws-relay/index.js` — **Réécriture complète**. Le relay supposait un protocole binaire (`[4B participant_id][4B timestamp_ms][PNG brut]` + handshake init `{ protocol_version, bot_id }`) qui **n'existe pas**. Recall envoie des **messages JSON** : `{ event: "video_separate_png.data", data: { data: { buffer: "base64...", type: "webcam"|"screenshare", participant: {...}, timestamp: {...} } } }`. Changements :
  1. Parsing JSON au lieu de lecture binaire (`readUInt32LE` sur du JSON = crash silencieux)
  2. Suppression du handshake init (n'existe pas dans le protocole Recall)
  3. Décodage base64 → Buffer pour pHash et forwarding
  4. Filtrage `type === "screenshare"` uniquement (ignore webcam)
  5. State par sessionId (URL query param) au lieu de botId (init message)
  6. Logging amélioré (compteurs messages/forwards, log périodique)

**Source de vérité** : https://github.com/recallai/participant-live-video + https://docs.recall.ai/docs/how-to-get-separate-videos-per-participant-realtime

Relay redéployé sur Fly.io (`fly deploy`).

---
## 2026-02-25 — fix: coaching engine timeout + speed (HAIKU switch)

**Fichiers modifiés** :
- `src/lib/live/coaching-engine.ts` — **4 fixes critiques** :
  1. Modèle `SONNET` → `HAIKU` : latence ~1-2s au lieu de ~6s (critique pour le live coaching)
  2. Timeout de 5s → 8s : les cartes n'étaient JAMAIS publiées car Sonnet dépassait systématiquement le timeout de 5s
  3. maxTokens de 500 → 300 : réponses plus rapides, suffisant pour 1-2 phrases
  4. Temperature de 0.4 → 0.3 : réponses plus cohérentes

**Contexte** : Les logs montraient `[coaching-engine] 5s timeout exceeded. Skipping card.` pour CHAQUE carte — le coaching engine jetait 100% des réponses LLM.

**Note** : La limitation Recall (plan actuel ne supporte pas `video_separate_png` real-time streaming) bloque toujours l'analyse visuelle live. Le pipeline est prêt mais Recall ne connecte pas le WebSocket.

---
## 2026-02-25 — fix: pipeline visuel complet (3 bugs critiques)

**Fichiers modifiés** :
- `src/app/api/live-sessions/[id]/start/route.ts` — **Fix #1** : ajout de `video_mixed_layout: "gallery_view_v2"` dans `recording_config`. Requis par Recall pour activer le streaming `video_separate_png` via WebSocket. Sans ça, Recall accepte la config mais ne connecte jamais le WS. Doc : https://docs.recall.ai/docs/how-to-get-separate-videos-per-participant-realtime
- `src/app/api/live-sessions/[id]/visual-frame/route.ts` — **Fix #2** : suppression de `after()` qui faisait échouer silencieusement les appels LLM en dev (même bug que coaching cards). Le traitement visuel (Haiku classify → Sonnet analyze → DB + Ably + coaching cards) est maintenant inline.
- `services/ws-relay/index.js` — **Fix #3** : correction endianness de `readUInt32BE` → `readUInt32LE` pour participant_id et timestamp_ms (protocole Recall = little-endian). Relay redéployé sur Fly.io.
- `src/lib/live/recall-client.ts` — Suppression de `takeBotScreenshot()` (dead code, l'API Recall `/screenshot/` n'existe pas).
- Config Fly.io relay : `VERCEL_API_URL` mis à jour vers le tunnel ngrok dev, `RELAY_SECRET` synchronisé.

---
## 2026-02-25 — fix: capture slides/screen share via Recall API

**Fichiers modifiés** :
- `src/app/api/live-sessions/[id]/start/route.ts` — **Fix critique** : le champ `real_time_media.websocket_video_destination_url` n'existe pas dans l'API Recall. Remplacé par un endpoint `type: "websocket"` dans `realtime_endpoints` avec événement `video_separate_png.data` (format correct). Ajout fallback si Recall rejette `video_separate_png` (plan limitation).
- `src/lib/live/types.ts` — Ajout type `RecallMediaEvent` (`video_separate_png.data`, etc.), type endpoint mis à jour pour supporter `"websocket"` en plus de `"webhook"`. Suppression du champ invalide `real_time_media`.

---
## 2026-02-25 — feat: auto-populate participants depuis transcripts en temps réel

**Fichiers modifiés** :
- `src/app/api/live-sessions/[id]/webhook/route.ts` — Détection automatique des speakers depuis les chunks de transcript Recall.ai. Chaque nouveau speaker est ajouté au champ `participants` en DB avec rôle "other" + publication Ably `participant-joined` pour mise à jour UI temps réel.
- `src/components/deals/live-tab-content.tsx` — `LiveSessionView` écoute les événements Ably `participant-joined` et met à jour le compteur + le mapper en temps réel sans attendre le polling.

---
## 2026-02-25 — feat: participant mapper collapsible + auto-détection rôles

**Fichiers modifiés** :
- `src/app/(dashboard)/deals/[dealId]/page.tsx` — Passe `userName` et `founderNames` au LiveTabLoader
- `src/components/deals/live-tab-loader.tsx` — Accepte et forward `userName`/`founderNames`
- `src/components/deals/live-tab-content.tsx` — Nouveau composant `LiveSessionView` avec bouton "Participants" collapsible dans la barre de contrôles, remplace le mapper inline
- `src/app/(dashboard)/deals/[dealId]/live/components/participant-mapper.tsx` — Auto-détection : match nom Clerk → BA, match fondateurs deal → Fondateur, reste → Autre. Accepte props `userName`/`founderNames`

---
## 2026-02-25 — fix: coaching cards ne s'affichent pas en live

**Fichiers modifiés** :
- `src/app/api/live-sessions/[id]/webhook/route.ts` — Retrait de `after()` pour le processing des utterances. Les appels LLM (OpenRouter) ne fonctionnaient pas dans le contexte `after()` de Next.js, empêchant la génération de coaching cards. Processing inline maintenant.

---
## 2026-02-25 — fix: Recall API rejette real_time_media + croix disclaimer

**Fichiers modifiés** :
- `src/app/api/live-sessions/[id]/start/route.ts` — Fallback : si `real_time_media` rejeté par Recall API (400), retry sans. Permet de lancer le bot même sans support video frames.

---
## 2026-02-25 — fix: croix disclaimer cachée par bouton Chat IA

**Fichiers modifiés** :
- `src/components/shared/disclaimer-banner.tsx` — Croix de fermeture déplacée à gauche du bandeau + `pr-40` pour dégager le texte du FAB "Chat IA"

---
## 2026-02-25 — feat: chat IA enrichi avec contexte live sessions + UX bouton

**Fichiers modifiés** :
- `src/components/chat/chat-wrapper.tsx` — Bouton "Analyste IA" → "Chat IA" avec icône MessageCircle (plus clair que c'est un chat)
- `src/services/chat-context/index.ts` — Ajout `getCompletedLiveSessions()` + type `LiveSessionContextData`, injecté dans `getFullChatContext()`
- `src/agents/chat/deal-chat-agent.ts` — Nouveau bloc contexte "Sessions de coaching live" dans le prompt : résumé, points clés, nouvelles infos, contradictions deck/call, Q&A, questions restantes, delta confiance
- `src/app/api/chat/[dealId]/route.ts` — Passe `liveSessions` au `FullChatContext`

---
## 2026-02-25 — fix: rapports sessions précédentes accessibles au clic

**Fichiers modifiés** :
- `src/components/deals/live-tab-content.tsx` — SessionHistory : "Rapport disponible" transformé en expand/collapse cliquable avec PostCallReport inline. Ajout état `expandedId`, icônes ChevronDown/Up/FileText, hover state.

---
## 2026-02-25 — fix: audit complet live coaching — 17 bugs corrigés + 47 tests ajoutés

**Fichiers créés** : `src/lib/live/sanitize.ts`

**Fichiers modifiés** :
- `src/lib/live/__tests__/live-coaching.test.ts` — +47 tests (164 total) couvrant transcript-condenser, context-compiler enrichi, post-call reanalyzer, generateMarkdownReport, pipeline intégration
- `src/lib/live/post-call-generator.ts` — idempotency guard (empêche double rapport stop+recall race)
- `src/app/api/live-sessions/[id]/webhook/route.ts` — re-fetch session dans after() (fix stale closure), auto-stop vérifie updateMany result, parallélisation utterances, optimisation cards query
- `src/lib/live/context-compiler.ts` — limite cache à 50 entrées avec eviction
- `src/app/api/live-sessions/route.ts` — utilise canStartLiveSession() au lieu de checks inline dupliqués
- `src/app/api/live-sessions/[id]/visual-frame/route.ts` — timingSafeCompare via HMAC-SHA256 (fix length oracle)
- `src/lib/live/utterance-router.ts` — domain keywords avant small talk (fix masquage "Bonjour, MRR 5M")
- `src/lib/live/coaching-engine.ts` — import sanitize depuis module partagé
- `src/lib/live/auto-dismiss.ts` — import sanitize depuis module partagé
- `src/app/(dashboard)/deals/[dealId]/live/components/coaching-feed.tsx` — MERGE action (fix INIT loop/flickering), fix scroll layout (flex chain)
- `src/app/(dashboard)/deals/[dealId]/live/components/session-controls.tsx` — useRef guard double-click stop
- `src/app/(dashboard)/deals/[dealId]/live/components/participant-mapper.tsx` — React.memo wrapper
- `src/components/deals/live-tab-content.tsx` — React.memo wrapper
- `src/app/api/live-sessions/[id]/start/route.ts` — Ably publish try/catch (non-fatal)
- `services/ws-relay/index.js` — botState.delete dans error handler
- `src/app/(dashboard)/deals/[dealId]/live/components/coaching-card.tsx` — clamp relativeTime négatif

**Résumé des fixes** :
- CRITICAL: idempotency guard post-call (race stop+recall), MERGE remplace INIT (stop flickering feed)
- HIGH: stale session closure, unbounded cache, duplicated limit checks, timing side channel, scroll layout, React.memo, double-click stop
- MEDIUM: auto-stop error handling, utterance parallelization, cards query optimization
- LOW: shared sanitize module, small talk priority, Ably error handling, WS relay cleanup, negative time

---
## 2026-02-25 — feat: intelligence cumulative des calls + Phase 5 reanalysis

**Fichiers créés** : `src/lib/live/transcript-condenser.ts`

**Fichiers modifiés** : `src/lib/live/types.ts`, `src/lib/live/post-call-generator.ts`, `src/lib/live/context-compiler.ts`, `src/lib/live/post-call-reanalyzer.ts`, `prisma/schema.prisma`

- Nouveau type `CondensedTranscriptIntel` : intelligence structurée dense extraite de chaque call (faits, chiffres, engagements fondateur, insights concurrentiels, données visuelles, contradictions, réponses obtenues, actions)
- `transcript-condenser.ts` : moteur LLM (Sonnet) de condensation post-call (~$0.07/session)
- `DealContext.previousSessions` enrichi avec `duration` et `condensedIntel` (backward-compatible : null pour sessions legacy)
- `SessionSummary.condensedIntel` (Json?) ajouté au schema Prisma
- Pipeline post-call enrichi : condensation → enrichissement du document CALL_TRANSCRIPT → trigger reanalysis
- `context-compiler.ts` : charge et sérialise le condensedIntel des sessions précédentes pour le coaching live
- Le document CALL_TRANSCRIPT est enrichi avec une section "Intelligence structurée" (faits, financials, engagements, contradictions, etc.) pour consommation par les agents lors d'un re-run
- **Phase 5 complétée** : `triggerTargetedReanalysis()` connecté à l'orchestrator réel (`AgentOrchestrator.runAnalysis()` avec `forceRefresh: true, isUpdate: true`)
- Re-analyse fire-and-forget : ne bloque pas la complétion de la session

---
## 2026-02-25 — infra: Fly.io WS relay déployé et optimisé (free tier)

**Fichiers modifiés** : `services/ws-relay/fly.toml`

- Relay WebSocket déployé sur `angeldesk-ws-relay.fly.dev` (région CDG)
- fly.toml : `[http_service]` → `[[services]]` TCP pour support WebSocket
- Scale optimisé : 1 machine × shared-cpu-1x × 256MB (free tier)
- Secrets configurés : `RELAY_SECRET`, `VERCEL_API_URL` (ngrok dev)
- Env vars ajoutées dans `.env.local` : `WS_RELAY_URL`, `WS_RELAY_SECRET`
- Health check OK : `curl https://angeldesk-ws-relay.fly.dev/health` → `ok`

---
## 2026-02-25 — docs: LIVE-COACHING-SPEC.md mis à jour V2 (visual, sécurité, tests, coûts)

**Fichiers modifiés** : `LIVE-COACHING-SPEC.md`, `src/services/live-session-limits.ts` (JSDoc)

Ajouts/corrections dans la spec :
- §2 Architecture : pipeline visuel (Relay → Haiku → Sonnet)
- §3.2.6 Screen share analysis (nouveau)
- §5 Stack : Fly.io WS relay, visual processing
- §6 DB Schema : ScreenCapture model, screenShareActive, isVisualTrigger, totalCost, errorMessage
- §7 Structure fichiers : +10 fichiers (visual-processor, monitoring, visual-frame, retry-report, ably-provider, ws-relay, etc.)
- §8 Routes API : +visual-frame, +retry-report
- §10 Coûts : $2.40/h → $11/h (Recall.ai ~$7.50 + LLM ~$2.60 + visual ~$1.10)
- §11 Sécurité : +sanitization prompt injection (3 niveaux), +relay auth, +transitions atomiques, +rate limiting webhook
- §12 Erreurs : +transcript truncation 80K, +retry report, +double post-call prevention
- §13 Testing : 112 tests unitaires live coaching
- §14 Limites : "Pas de vidéo" remplacé par screen share analysis, +visual latence, +in-memory state caveat
- §15 Phases : toutes cochées ✅, +Phase 6 Visual V2
- Annexe B Ably : +visual-analysis, +screenshare-state events
- Date : 2026-02-24 → 2026-02-25

---
## 2026-02-25 — test: All 387 tests pass (22 files) including 112 Live Coaching tests

**Verification run**: `vitest --config vitest.unit.config.ts` — 387/387 passed, 0 failures. TypeScript `tsc --noEmit` clean.

---
## 2026-02-25 — test: Comprehensive test suite for Live Coaching feature (112 tests)

**Fichier** : `src/lib/live/__tests__/live-coaching.test.ts`

Suite de tests couvrant les comportements critiques du Live Coaching :
- **Utterance Router** (54 tests) : filler detection, small talk, financial/competitive/negotiation claims, shouldTriggerCoaching decision logic (role + classification matrix)
- **Sanitization** (19 tests) : auto-dismiss, coaching-engine, visual-processor — strip injection markers, enforce char limits
- **Post-call truncation** (3 tests) : head+tail strategy for >80K char transcripts
- **Card reducer** (12 tests) : ADD_CARD (with dedup), ADDRESS_CARD (active->addressed), INIT (split by status, sort newest-first)
- **Rate limiter** (4 tests) : sliding window 30 req/10s, per-key isolation, window expiry
- **Session limits** (6 tests) : canStartLiveSession max 1 active, max 3/day, short-circuit logic
- **Regex edge cases** (5 tests) : case insensitivity, trailing periods, word boundaries, embedded matches

Mocks : Prisma, OpenRouter, Ably, context-compiler, visual-processor, monitoring.

---
## 2026-02-25 — fix: Re-audit Live Coaching — 6 bugs résiduels corrigés (Loop 2)

Corrections post re-audit par 3 agents (backend, security, React UI).

- `webhook/route.ts` : ajout cap 2h max par session → auto-stop + post-call report (prévient coûts LLM illimités)
- `retry-report/route.ts` : transition atomique `updateMany WHERE status IN (failed, processing)` + guard count=0
- `webhooks/recall/route.ts` : TOUTES les transitions (live, processing, failed) sont maintenant atomiques avec `allowedSourceStatuses` map
- `participant-mapper.tsx` : useEffect sync pour nouveaux participants rejoignant mid-session
- `visual-processor.ts` : `sanitizeLLMOutput()` sur toutes les re-injections cross-stage (description → stage 2, visual context → coaching engine)
- `coaching-feed.tsx` : comparaison content-based (card IDs) au lieu de reference equality pour INIT dispatch — évite reset de state à chaque poll

---
## 2026-02-25 — fix: Audit complet Live Coaching — 25+ bugs corrigés (CRITICAL → MEDIUM)

Audit full-feature Live Coaching (35 fichiers) par 6 agents experts. Corrections systématiques.

### CRITICAL
- `stop/route.ts`, `retry-report/route.ts`, `webhooks/recall/route.ts` : remplacement `import().then()` par `after()` (Next.js 15 — background work survit sur Vercel)
- `stop/route.ts` + `webhooks/recall/route.ts` : transition atomique via `updateMany WHERE status IN (live, bot_joining)` — élimine la race condition double post-call report
- `route.ts` (create) : limite quotidienne corrigée de 50 → 3 sessions/24h (cohérent avec `live-session-limits.ts`)
- `utterance-router.ts` : ajout `sanitizeTranscriptText()` avant injection LLM (defense prompt injection)
- `auto-dismiss.ts` : ajout `sanitizeTranscriptText()` avant injection LLM
- `ably-provider.tsx` : correction memory leak retry — utilise `retryKey` + useEffect lifecycle au lieu de création manuelle dans onClick

### HIGH
- `webhook/route.ts` : ajout rate limiting per-session (30 req/10s) — prévient amplification coûts LLM
- `webhook/route.ts` : transition bot_joining→live atomique (updateMany empêche publishes Ably multiples)
- `webhook/route.ts` : correction champ `context` Ably — envoie l'utterance text (pas la reference)
- `post-call-generator.ts` : truncation transcript à 80K chars pour calls longs (head 30% + tail 70%)
- `post-call-generator.ts` : wire `recordSessionDuration()` pour suivi coûts
- `visual-frame/route.ts` : `maxDuration` 15→30s (pipeline Haiku+Sonnet peut dépasser 15s)
- `session-status-bar.tsx` : sync prop `initialStatus` via useEffect
- `coaching-card.tsx` : `relativeTime()` auto-update toutes les 10s
- `participant-mapper.tsx` : clear debounce timeout on unmount
- `coaching-feed.tsx` : lazy-load `AnalysisQuestionsTab` via `next/dynamic`
- `session-controls.tsx` : prévention double-click sur confirmation stop

### MEDIUM
- `route.ts` (list) : `coachingCards:true` conditionnel (`includeCards` query param) — réduit overfetch
- `live-tab-content.tsx` : `React.memo` sur `ActiveSessionView` + `SessionHistory`, `useMemo` sur `initialCards`
- `live-session-limits.ts` : `COST_PER_HOUR` corrigé $3.50→$11 (inclut Recall.ai ~$7.50)
- `webhook/route.ts` : screenshare DB updates via `updateMany` (safe si session déjà closed)

---
## 2026-02-25 — fix: Audit complet pipeline visual V2 — 30+ bugs corrigés

Corrections issues des 6 agents d'audit (sécurité, QA, backend, DevOps, data flow, Prisma).

### SÉCURITÉ (CRITICAL + HIGH)
- `src/middleware.ts` : ajout `/api/live-sessions/(.*)/visual-frame` aux routes publiques (bloqué par Clerk)
- `visual-frame/route.ts` : `timingSafeEqual` pour la comparaison Bearer (anti timing attack)
- `visual-frame/route.ts` : validation PNG magic bytes + limite taille 5MB
- `ws-relay/index.js` : validation CUID sessionId via `verifyClient`, maxPayload 10MB

### STABILITÉ (VERCEL SERVERLESS)
- `visual-frame/route.ts` : `void async` → `after()` (Next.js 15) pour background work
- `webhook/route.ts` : `void async` → `after()` — background work survit à la réponse HTTP
- `visual-processor.ts` : `getVisualContextWithFallback()` — fallback DB quand le cache in-memory est vide (cold start Vercel)
- `coaching-engine.ts` : pré-fetch async du visual context avec DB fallback

### DATA FLOW
- `visual-processor.ts` : coût classification Haiku inclus dans `totalCost` (était ignoré)
- `visual-processor.ts` : `frameId` unique avec suffixe aléatoire (évite collisions)
- `visual-processor.ts` : validation `contentType` contre la union VisualContentType
- `coaching-engine.ts` : empty `currentSlide` n'empêche plus l'injection des keyData/contradictions
- `coaching-engine.ts` : `.catch()` sur le promise leak du timeout 5s
- `prisma/schema.prisma` : ajout `suggestedQuestion` sur `ScreenCapture`
- `visual-frame/route.ts` : `suggestedQuestion` persisté en DB + inclus dans les cartes proactives
- `visual-frame/route.ts` : dedup des cartes contradiction visuelles (vérifie les existantes avant création)
- `types.ts` : ajout `screenCapturesAnalyzed?` dans `PostCallReport.sessionStats`

### WEBHOOK
- `webhook/route.ts` : fix bug buffer flush overwrite (array `toProcess[]` au lieu d'écraser `flushed`)
- `webhook/route.ts` : `.catch()` logué pour DB screenshare update (au lieu de `.catch(() => {})`)

### POST-CALL
- `post-call-generator.ts` : fetch `suggestedQuestion` dans les screen captures
- `post-call-generator.ts` : section visuelle markdown basée sur `screenCapturesAnalyzed` (remplace heuristique fragile `startsWith("Slide")`)

### WS RELAY (Fly.io)
- `index.js` : rate limiting (1 forward / 2s par session), retry avec backoff (2 tentatives), graceful shutdown SIGTERM/SIGINT
- `index.js` : validation PNG magic bytes, ping/pong keepalive, AbortSignal.timeout(10s) sur fetch
- `fly.toml` : `memory 256mb → 512mb`, `auto_stop "stop" → "suspend"`, `min_machines 0 → 1`
- `Dockerfile` : ajout `vips-dev` pour sharp sur Alpine

---
## 2026-02-25 — feat: Screen Capture & Visual Analysis — Live Coaching V2

Pipeline d'analyse visuelle en temps réel pour le screen share pendant les sessions de coaching live. Le bot voit maintenant ce qui est partagé à l'écran (slides, dashboards, demos).

### src/lib/live/types.ts
- Ajout types visuels : `ScreenShareState`, `VisualContentType`, `VisualClassification`, `VisualAnalysis`, `VisualContext`
- Ajout events Ably : `AblyVisualAnalysisEvent`, `AblyScreenShareStateEvent`
- Extension `CoachingInput` avec `visualContext?` et `sessionId?`
- Extension `RecallBotConfig` avec `real_time_media` (WebSocket video frames)
- Extension `RecallRealtimeEvent` avec `participant_events.screenshare_on/off`

### prisma/schema.prisma
- Nouveau modèle `ScreenCapture` (timestamp, contentType, description, keyData, contradictions, newInsights, perceptualHash, analysisCost)
- `LiveSession` : +`screenShareActive`, +relation `screenCaptures`
- `CoachingCard` : +`isVisualTrigger`

### src/services/openrouter/router.ts
- Nouvelle fonction `completeVisionJSON<T>()` : multimodal image+text → JSON structuré (même circuit breaker, rate limiter, cost tracking)

### services/ws-relay/ (NEW — service Fly.io)
- `index.js` : relay WebSocket Recall.ai → Vercel API avec pHash dedup (~95% frames identiques filtrées)
- `package.json`, `Dockerfile`, `fly.toml`, `.env.example`

### src/lib/live/visual-processor.ts (NEW)
- Pipeline 2 étapes : Haiku classify (~$0.002/frame) → Sonnet deep analysis si nouveau (~$0.02/frame)
- Cache in-memory du visual context par session (même pattern que context-compiler)
- `processVisualFrame()`, `getVisualContext()`, `setScreenShareState()`, `clearVisualState()`

### src/app/api/live-sessions/[id]/visual-frame/route.ts (NEW)
- Réception PNG frames du relay Fly.io (auth Bearer WS_RELAY_SECRET)
- Background processing → DB ScreenCapture + Ably publish + coaching cards proactives visuelles

### src/lib/live/ably-server.ts
- +`publishVisualAnalysis()`, +`publishScreenShareState()`

### src/lib/live/coaching-engine.ts
- System prompt étendu : RÈGLE N°3 — contexte visuel
- `buildCoachingPrompt()` : injection visual context entre utterance et conversation récente
- Import `getVisualContext` depuis visual-processor

### src/app/api/live-sessions/[id]/webhook/route.ts
- Handling events `participant_events.screenshare_on/off` : update DB + Ably + visual state
- `coachingInput` inclut maintenant `sessionId` pour visual context

### src/app/api/live-sessions/[id]/start/route.ts
- Events screen share ajoutés dans realtime_endpoints
- `real_time_media.websocket_video_destination_url` conditionnel (si `WS_RELAY_URL` défini)

### src/lib/live/post-call-generator.ts
- Fetch screenCaptures en parallèle dans `generatePostCallReport()`
- Section "Analyse visuelle" injectée dans le prompt LLM
- Section markdown "Analyse visuelle" dans le rapport

### src/services/live-session-limits.ts
- Coût/heure mis à jour : $2.40 → $3.50 (inclut analyse visuelle)

---
## 2026-02-25 — fix: 3 fuites de données visuelles dans le pipeline

Audit du flux visual → coaching → rapport → prochaine analyse : 3 problèmes identifiés et corrigés.

### src/lib/live/visual-processor.ts — getVisualContext()
- `newInsights` (faits nouveaux non couverts par l'analyse) étaient extraits par Sonnet mais jamais injectés dans le coaching prompt → ajoutés dans `keyDataFromVisual` avec tag `[new]`
- `suggestedQuestion` de l'analyse visuelle était perdue → ajoutée dans `keyDataFromVisual` avec tag `[question suggérée]`
- `recentSlideHistory` excluait la slide courante (doublon) → filtre `a !== last`

### src/lib/live/coaching-engine.ts — buildCoachingPrompt()
- `recentSlideHistory` était remonté par getVisualContext mais jamais injecté dans le prompt → section "Slides précédentes montrées" ajoutée

### src/lib/live/context-compiler.ts — compileDealContext()
- Les sessions précédentes ne remontaient que `keyPoints` + `remainingQuestions` → ajout fetch de `newInformation` et `contradictions` depuis SessionSummary
- Les nouvelles infos (y compris visuelles) sont maintenant injectées dans `keyFindings` avec tags `[Nouveau]` et `[Contradiction severity]`
- Limite `keyFindings` relevée de 5 → 10 pour absorber les findings visuels

---
## 2026-02-24 — fix: post-call report crash + retry + coaching pertinence + latence

### src/lib/live/post-call-generator.ts
- Fix crash `Cannot read properties of undefined (reading 'length')` : sanitisation du rapport LLM (tous les tableaux défaultés à [])
- Sécurisation de `generateMarkdownReport` : optional chaining sur tous les `.length`, defaults sur sous-champs

### src/app/api/live-sessions/[id]/retry-report/route.ts (NEW)
- Route POST pour relancer la génération du rapport sur sessions failed/processing
- Supprime le summary existant avant de relancer

### src/components/deals/live-tab-content.tsx
- Bouton "Relancer le rapport" sur les sessions failed dans l'historique
- useMutation + invalidation du cache sessions

---
## 2026-02-24 — fix: coaching pertinence + latence + polling UI

Refonte du coaching engine pour réactivité et pertinence. Le LLM réagit maintenant à ce qui est dit, pas aux données du deal.

### src/lib/live/coaching-engine.ts
- System prompt réécrit : RÈGLE N°1 = réactivité (carte DOIT réagir à l'utterance)
- Prompt restructuré : utterance EN PREMIER, deal context en référence à la fin
- Interdit explicitement les cartes génériques non liées à l'utterance

### src/app/api/live-sessions/[id]/webhook/route.ts
- Buffer abaissé de 15 à 8 mots (capture "je veux une valo à 25M" sans attendre plus)
- Gap timeout de 4s à 3s
- Ajout logging détaillé : timing pipeline, auto-promote, buffer flush, chaque webhook reçu

### src/components/deals/live-tab-content.tsx
- Polling agressif pour bot_joining et processing : 2s (au lieu de 15s)
- staleTime réduit à 2s

### src/app/api/live-sessions/[id]/start/route.ts
- Ajout `automatic_leave` config (timeouts waiting room, no one joined, everyone left)

### src/lib/live/utterance-router.ts
- Simplifié shouldTriggerCoaching : tout non-BA non-investor non-filler trigger coaching

---
## 2026-02-24 — fix: Recall.ai low latency config — transcription temps réel

Config critique Recall.ai : passage de `prioritize_accuracy` (3-10 min de délai) à `prioritize_low_latency` (~1-3s). Sans ce fix, le coaching live est inutilisable.

### src/app/api/live-sessions/[id]/start/route.ts
- Remplacement ancien format (`real_time_transcription` + `transcription_options`) par `recording_config`
- Activation `recallai_streaming.mode: "prioritize_low_latency"`
- Activation `realtime_endpoints` avec events `transcript.data` + `transcript.partial_data`

### src/app/api/live-sessions/[id]/webhook/route.ts
- Parsing du champ `event` pour distinguer `transcript.data` vs `transcript.partial_data`
- Les partial results sont ignorés côté coaching pipeline (skip costly LLM calls)
- TODO: publier les partials via Ably pour indicateur "qui parle" en temps réel

### src/lib/live/types.ts
- `RecallBotConfig` reécrit avec le nouveau format `recording_config` (Recall.ai API v1.10+)
- Ajout type `RecallRealtimeEvent` pour les events webhook

### LIVE-COACHING-SPEC.md
- Annexe A enrichie : documentation de la config low latency, tableau comparatif des modes, limitations FR, stratégie partial results

---
## 2026-02-24 — fix: live coaching display & orchestration — 8 fichiers frontend

Audit et correction des composants d'affichage et d'orchestration du coaching live.

### ui-constants.ts (NEW)
- Cr\u00e9ation de `src/lib/live/ui-constants.ts` avec constantes partag\u00e9es
- `SESSION_STATUS_LABELS`, `SESSION_STATUS_COLORS` (avec dark mode)
- `formatDuration()` utilitaire partag\u00e9
- `SEVERITY_CONFIG` avec dark mode (import\u00e9 par post-call-report, post-call-reanalysis)

### live-tab-content.tsx (CRITICAL)
- Fix "completed" state : sessions compl\u00e9t\u00e9es < 10min restent visibles comme actives
- Fix polling conditionnel : 5s (processing), 15s (active), off (idle) au lieu de 10s fixe
- Fix double refetch : suppression `queryClient.invalidateQueries` redondant dans `handleRefresh`
- Ajout dark mode sur erreur : `dark:border-red-800 dark:bg-red-950/50`, textes red-200/red-400
- Import constantes partag\u00e9es depuis `ui-constants.ts` (suppression duplication)
- Fix accents FR : "Cr\u00e9\u00e9e", "\u00c9chou\u00e9e", "R\u00e9essayer", "G\u00e9n\u00e9ration", "pr\u00e9c\u00e9dentes", "r\u00e9union"

### live-session-card.tsx
- Fix `ACTIVE_STATUSES` : ajout "created" et "processing" (alignement avec live-tab-content)
- Import `formatDuration` depuis `ui-constants.ts` (suppression duplication locale)
- Fix accents FR : "\u00c0 l\u2019instant", "Dur\u00e9e", "r\u00e9el"

### live-session-launcher.tsx
- Ajout dark mode sur badges plateformes : `dark:bg-blue-900 dark:text-blue-200`, etc.
- Ajout dark mode sur badges analyse : `dark:bg-green-900`, `dark:bg-yellow-900`
- Ajout dark mode sur erreur : `dark:bg-red-950/50 dark:border-red-800`
- Fix accents FR : "cr\u00e9er", "d\u00e9marrage", "compl\u00e8te", "r\u00e9union", "support\u00e9s", "Fran\u00e7ais", "S\u00e9lectionner"

### analysis-questions-tab.tsx
- Ajout dark mode sur priority badges : `dark:bg-red-900 dark:text-red-200`, etc.
- Ajout `aria-expanded` sur boutons collapsibles des cat\u00e9gories
- Fix accents FR : "\u00c9lev\u00e9e" (haute priorit\u00e9), "compl\u00e8te"

### post-call-report.tsx (CRITICAL)
- Fix bug dur\u00e9e : suppression division par 60 (`stats.duration` d\u00e9j\u00e0 en minutes)
- Import `SEVERITY_CONFIG` depuis `ui-constants.ts` (dark mode inclus)
- Ajout dark mode sur badges owner, coaching, confidence delta
- Ajout `aria-expanded` sur boutons `CollapsibleSection`
- Fix accents FR : "\u00c9lev\u00e9", "Points cl\u00e9s", "S\u00e9v\u00e9rit\u00e9", "Questions pos\u00e9es", "\u00c9ch\u00e9ance", "Dur\u00e9e", "R\u00e9sum\u00e9", "Apr\u00e8s", "Partag\u00e9"

### post-call-reanalysis.tsx
- Ajout cas neutre (diff = 0) pour delta confiance : styling gris au lieu de rouge
- Import `SEVERITY_CONFIG` depuis `ui-constants.ts` (dark mode inclus)
- Ajout dark mode sur erreurs et badges delta
- Fix accents FR : "r\u00e9-analyse", "cibl\u00e9e", "compl\u00e8te", "termin\u00e9e", "lanc\u00e9e", "r\u00e9solues", "impact\u00e9s"

### live/page.tsx
- Ajout redirect non-popout vers `/deals/[dealId]?tab=live`
- Page simplifi\u00e9e (ne sert plus que pour le mode pop-out)

**Validation :** `tsc --noEmit` OK (0 erreurs)

---
## 2026-02-24 — fix: live coaching real-time components — 6 fichiers frontend

Audit et correction des composants temps reel du coaching live.

### session-status-bar.tsx (CRITICAL)
- Fix canal Ably : `session:${sessionId}` -> `live-session:${sessionId}` (le serveur publie sur live-session:)
- Ajout dark mode : `dark:border-red-800 dark:bg-red-950/30` sur le container live
- Ajout `aria-hidden="true"` sur les dots decoratifs (pulsing red dot)
- Fix accents FR : "Preparation" -> "Preparation", "Generation" -> "Generation"

### coaching-feed.tsx
- Remplacement placeholder QuestionsTab par le vrai composant `AnalysisQuestionsTab`
- Ajout prop `dealId` (optionnel, fallback sur `useParams`)
- Ajout semantique ARIA tabs : `role="tablist"`, `role="tab"`, `aria-selected`, `role="tabpanel"`
- Ajout `aria-live="polite"` et `role="log"` sur le scroll container
- Limite addressed cards a 20 max dans le reducer
- Fix accents FR : "Abordes" -> "Abordes", "apparaitront" -> "apparaitront", "fenetre separee" -> "fenetre separee"

### coaching-card.tsx
- Fix relativeTime fige : suppression `useMemo` pour que le temps se mette a jour a chaque re-render
- Ajout `aria-hidden="true"` sur l'icone decorative
- Ajout `role="article"` et `aria-label` sur le wrapper de carte
- Fix accents FR : "Aborde" -> "Aborde", "a l'instant" -> "a l'instant", "Priorite" -> "Priorite", "Nego" -> "Nego"

### session-controls.tsx
- Suppression complete du bouton Pause (aucun effet server-side, trompeur pour l'utilisateur)
- Suppression state `isPaused` et `togglePause` inutilises
- Fix accents FR : "Arret" -> "Arret", "genere" -> "genere"

### ably-provider.tsx
- Ajout etat d'erreur avec bouton "Reessayer" quand connexion failed/closed (au lieu d'un spinner infini)
- Ajout dark mode sur le container d'erreur : `dark:border-red-800 dark:bg-red-950/50`
- Fix accents FR : "Connecte" -> "Connecte", "Deconnecte" -> "Deconnecte", "Ferme" -> "Ferme", "reel" -> "reel"

### participant-mapper.tsx
- Fix reference instable `debouncedSave` : utilisation `useRef` pour `saveMutation.mutate` (evite re-creation a chaque render)
- Ajout dark mode sur tous les badges de role : `dark:bg-X-900 dark:text-X-200 dark:border-X-700`
- Ajout `aria-label` sur chaque SelectTrigger : `Role de ${participant.name}`
- Fix accents FR : "detecte" -> "detecte", "Sauvegarde" -> "Sauvegarde", "roles" -> "roles"

---
## 2026-02-24 — fix: audit backend logic (src/lib/live/) — 5 fichiers, 1 suppression

Audit et correction de la logique backend dans `src/lib/live/`.

### post-call-generator.ts (CRITICAL)
- Ajout `generateAndSavePostCallReport()` — orchestrateur complet : generate -> markdown -> save -> status -> Ably notify
- Gestion erreur : session passe en "failed" avec message d'erreur en cas d'echec
- Merge des imports dupliques (`completeJSON` + `runWithLLMContext` en une seule ligne)
- Suppression import inutilise `MODELS`
- Ajout import `publishSessionStatus` depuis ably-server

### context-compiler.ts (CRITICAL)
- Ajout cache in-memory avec TTL de 5 minutes (`compileDealContextCached`)
- Ajout `getCachedSerializedContext()` pour acces sans DB call
- Ajout `clearContextCache()` pour invalidation apres reanalyse
- Evite ~100-150 appels DB identiques par session de 30min

### recall-client.ts (SECURITY)
- Remplacement boucle XOR manuelle par `crypto.timingSafeEqual` (timing attack prevention)
- `recallFetch` rendu prive (suppression export, usage interne uniquement)
- `detectPlatform` utilise `new URL()` pour validation stricte du hostname (au lieu de regex)
- Suppression du tableau PLATFORM_PATTERNS devenu inutile

### coaching-engine.ts (SECURITY)
- Ajout `sanitizeTranscriptText()` — strip ``` et balises system/user/assistant/INST
- Application aux textes de transcription dans `buildCoachingPrompt`
- `COACHING_SYSTEM_PROMPT` et `buildCoachingPrompt` rendus prives (suppression export, usage interne)

### deepgram-client.ts (CLEANUP)
- Fichier supprime entierement (stub jamais importe)

---
## 2026-02-24 — fix: audit API routes — post-call pipeline, webhook guards, rate limits, validation

**Fichiers modifies :**
- `src/app/api/live-sessions/[id]/stop/route.ts`
- `src/app/api/webhooks/recall/route.ts`
- `src/app/api/live-sessions/[id]/webhook/route.ts`
- `src/app/api/live-sessions/route.ts`
- `src/app/api/live-sessions/[id]/route.ts`
- `src/app/api/coaching/reanalyze/route.ts`

**Corrections appliquees :**
- **CRITICAL** : `generatePostCallReport` remplace par `generateAndSavePostCallReport` dans stop/route.ts et recall webhook (rapport etait genere mais jamais sauvegarde)
- **recall webhook** : generic 401 au lieu de 500 avec details internes quand RECALL_WEBHOOK_SECRET absent ; duplicate guard pour eviter double processing/completed
- **transcript webhook** : generic 401 pour secret manquant ; try-catch JSON.parse ; chunk limit guard (2000 max) ; import `compileDealContextCached` (cached) ; skip auto-dismiss pour filler/small_talk ; merge 2 card queries en 1 ; parallelize deal context dans Promise.all ; ecriture `context: text` dans CoachingCard
- **live-sessions GET** : validation dealId query param ; `coachingCards: true` toujours inclus
- **live-sessions POST** : rolling 24h au lieu de startOfDay pour daily limit (coherent avec live-session-limits.ts)
- **live-sessions/[id] PATCH** : `llmModel` valide par z.enum au lieu de z.string
- **coaching/reanalyze** : rate limit 3/h par user ajoute

**Validation :** tsc --noEmit 0 erreurs dans src/app/api/

---
## 2026-02-24 — fix: audit DB Live Coaching — cascades, indexes, precision, updatedAt

**Fichiers modifiés :**
- `prisma/schema.prisma`

**Corrections appliquées :**
- **C1** : `onDelete: SetNull` sur `LiveSession.deal` et `LiveSession.document`, `onDelete: Cascade` sur `LiveSession.user` (FK constraint errors on delete)
- **H1** : Indexes composites `[userId, status]`, `[userId, createdAt]` sur LiveSession ; `[sessionId, isFinal, classification]` sur TranscriptChunk
- **H2** : `updatedAt @updatedAt` ajouté sur TranscriptChunk et CoachingCard
- **H3** : `totalCost` precision `Decimal(6,4)` -> `Decimal(8,4)` sur LiveSession (aligné avec AIBoardSession)

**Validation :** prisma generate OK, db push OK, tsc --noEmit OK (0 erreurs)

---
## 2026-02-24 — feat: Live Coaching — implémentation complète (35 fichiers, 6 batches)

**Feature Live Coaching** : coaching IA temps réel pendant les calls BA/fondateur. Bot Recall.ai rejoint le meeting, transcrit, classifie les interventions, génère des suggestions contextuelles via Sonnet croisées avec l'analyse AngelDesk existante, push en temps réel via Ably.

### Infrastructure (12 fichiers)
- `src/lib/live/types.ts` — Types partagés (SessionStatus, DealContext, CoachingResponse, PostCallReport, Ably events, Recall.ai types)
- `src/lib/live/recall-client.ts` — Client Recall.ai (createBot, leaveMeeting, verifyWebhookSignature HMAC, detectPlatform)
- `src/lib/live/ably-server.ts` — Publisher Ably (singleton, publishCoachingCard, generateAblyToken scoped 60min)
- `src/lib/live/deepgram-client.ts` — Stub Deepgram (interface prête)
- `src/lib/live/context-compiler.ts` — Compile DealContext depuis DB (Promise.all, ~5-10K tokens)
- `src/lib/live/utterance-router.ts` — Classifieur hybride regex+Haiku, shouldTriggerCoaching
- `src/lib/live/speaker-detector.ts` — Détection BA fuzzy match, mapSpeakerToRole
- `src/lib/live/coaching-engine.ts` — Moteur coaching Sonnet, timeout 5s via Promise.race, getTranscriptBuffer
- `src/lib/live/auto-dismiss.ts` — Auto-détection sémantique Haiku, markCardsAsAddressed
- `src/lib/live/post-call-generator.ts` — Rapport post-call + saveReport (Document + SessionSummary en transaction)
- `src/lib/live/post-call-reanalyzer.ts` — Delta report, identifyImpactedAgents, triggerTargetedReanalysis
- `src/lib/live/monitoring.ts` — Logging structuré [LiveCoaching], latence, coûts, erreurs
- `src/services/live-session-limits.ts` — Limites (1 active, 3/jour), usage tracking, coût estimé

### Routes API (10 fichiers)
- `src/app/api/live-sessions/route.ts` — POST create + GET list (rate limit, ownership)
- `src/app/api/live-sessions/[id]/route.ts` — GET detail + PATCH update
- `src/app/api/live-sessions/[id]/start/route.ts` — POST deploy bot Recall.ai
- `src/app/api/live-sessions/[id]/stop/route.ts` — POST stop + fire-and-forget report
- `src/app/api/live-sessions/[id]/participants/route.ts` — PUT update participants roles
- `src/app/api/live-sessions/[id]/webhook/route.ts` — POST transcription chunks (CRITIQUE: store→classify→auto-dismiss→coaching→publish, fire-and-forget)
- `src/app/api/webhooks/recall/route.ts` — POST bot status events (in_call→live, done→processing, fatal→failed)
- `src/app/api/coaching/context/route.ts` — GET deal context compilé
- `src/app/api/coaching/ably-token/route.ts` — GET token Ably scopé
- `src/app/api/coaching/reanalyze/route.ts` — POST re-analyse (delta/targeted/full)

### Frontend (13 fichiers)
- `src/app/(dashboard)/deals/[dealId]/live/page.tsx` — Page shell server component (auth, data, state-based rendering, pop-out)
- `live/components/live-session-launcher.tsx` — Formulaire URL meeting + auto-detect plateforme + langue
- `live/components/participant-mapper.tsx` — Mapping rôles participants, fuzzy match BA, auto-save
- `live/components/ably-provider.tsx` — Wrapper Ably realtime (authCallback, connexion indicator)
- `live/components/coaching-feed.tsx` — Feed principal (useReducer + useChannel Ably, auto-scroll, pop-out)
- `live/components/coaching-card.tsx` — Carte coaching (4 types colorés, priorité, animation slide-in, état abordé)
- `live/components/analysis-questions-tab.tsx` — Questions analyse groupées par catégorie
- `live/components/session-status-bar.tsx` — Barre LIVE (dot rouge pulsant, timer, status Ably)
- `live/components/session-controls.tsx` — Pause/Stop avec AlertDialog confirmation
- `live/components/post-call-report.tsx` — Rapport 9 sections collapsibles
- `live/components/post-call-reanalysis.tsx` — Trigger re-analyse 3 modes
- `src/components/deals/live-tab-content.tsx` — Orchestrateur complet du flow (state machine → bons composants)
- `src/components/deals/live-session-card.tsx` — Mini-card overview deal

### Fichiers modifiés
- `prisma/schema.prisma` — +4 modèles (LiveSession, TranscriptChunk, CoachingCard, SessionSummary), +CALL_TRANSCRIPT enum, +relations Deal/User/Document
- `src/lib/query-keys.ts` — Section `live` (sessions, session, cards, context, summary)
- `src/app/(dashboard)/deals/[dealId]/page.tsx` — Onglet "Live" (5e tab, icône Radio, dynamic import ssr:false)

### Vérification : `npx tsc --noEmit` = 0 erreurs

---
## 2026-02-24 — feat: Live Coaching monitoring + error handling hardening

**Fichier cree :**
- `src/lib/live/monitoring.ts` — Structured logging pour live coaching. 4 fonctions : `logCoachingLatency` (latence par stage, warn si >5s), `logCoachingError` (erreurs structurees), `logSessionEvent` (evenements session avec data optionnelle JSON), `trackCoachingCost` (couts LLM par agent). Format `[LiveCoaching]` uniforme, console-based, pret pour migration vers service monitoring externe.

**Fichiers modifies :**
- `src/lib/live/coaching-engine.ts` — Fix timeout 5s : remplacement AbortController (signal jamais connecte a completeJSON) par `Promise.race` contre un timer. Si le timer gagne, retourne `NO_RESPONSE` et le call LLM est discard en background. Meme fail-safe : ne crashe jamais le pipeline.
- `src/app/api/live-sessions/[id]/webhook/route.ts` — (1) Import et integration monitoring a chaque etape du pipeline async (classify, auto-dismiss, coaching, full pipeline). (2) Try/catch individuel par etape : avant, un echec de classification empechait auto-dismiss et coaching d'executer. Maintenant chaque etape est independante avec fallback. Classification default `strategy_reveal` si LLM echoue (fail open). Import `UtteranceClassification` pour typage correct.

**Fichiers verifies (aucune modification) :**
- `src/lib/live/utterance-router.ts` — Fallback deja correct : catch sur LLM retourne `strategy_reveal` confidence 0.5 (fail open). Validation classification LLM deja presente.
- `src/app/api/webhooks/recall/route.ts` — Gestion status inconnus deja en place (default case log + ignore). Optional chaining sur tous les champs nullable. Try/catch global + fire-and-forget post-call avec .catch.

---
## 2026-02-24 — feat: Live session limits service, session card, live tab content orchestrator

**Fichiers crees :**
- `src/services/live-session-limits.ts` — Service de limites et usage des sessions live. `canStartLiveSession(userId)` verifie max 1 session active (status in created/bot_joining/live) et max 3 sessions par 24h. `getSessionUsage(userId)` retourne activeCount, todayCount, todayLimit pour affichage UI. `recordSessionDuration(sessionId, durationMinutes)` calcule et enregistre le cout estime ($2.40/h) dans `LiveSession.totalCost`. Import prisma depuis `@/lib/prisma`. `Promise.all` pour queries paralleles dans getSessionUsage.
- `src/components/deals/live-session-card.tsx` — Mini-card pour onglet overview deal. Props: `{ dealId }`. `useQuery` avec `queryKeys.live.sessions(dealId)`, refetch toutes les 60s. 3 etats d'affichage : session active (carte verte pulsante "Session live en cours" avec badge lien vers onglet Live), session completee recente (date relative + duree), aucune session (description courte). Helpers `formatRelativeDate` et `formatDuration`. Icone `Radio` de lucide-react. Skeleton loading. shadcn Card + Badge.
- `src/components/deals/live-tab-content.tsx` (UPDATE) — Remplacement du placeholder par orchestrateur complet du flow live. `useQuery` sessions avec `includeSummary=true`, refetch 10s. Check analyse via query separee. Rendering conditionnel par status: no session → `LiveSessionLauncher`, created/bot_joining → waiting + `ParticipantMapper`, live → `AblyProvider` wrapper + `SessionStatusBar` + `SessionControls` + `CoachingFeed`, processing → spinner + `PostCallReport`, completed → `PostCallReport` + `PostCallReanalysis`. Historique des sessions completees en bas. Import de 8 composants depuis live/components/. Error state avec bouton retry. Sub-components `ActiveSessionView` et `SessionHistory`.

---
## 2026-02-24 — feat: Live Coaching UI — 5 composants client (questions, status bar, controls, report, reanalysis)

**Fichiers crees :**
- `src/app/(dashboard)/deals/[dealId]/live/components/analysis-questions-tab.tsx` — Onglet "Questions analyse". `useQuery` avec `queryKeys.live.context(dealId)` pour fetch `/api/coaching/context`. Questions groupees par categorie avec headers collapsibles. Chaque question affiche texte, badge priorite (high=rouge, medium=ambre, low=bleu), tag categorie, contexte. Categories triees par nombre de questions haute priorite. Skeletons loading, error state, empty state. `React.memo` sur sous-composants `QuestionCard` et `CategorySection`.
- `src/app/(dashboard)/deals/[dealId]/live/components/session-status-bar.tsx` — Barre de status live en haut de session. Props: `sessionId`, `dealName`, `status`, `startedAt`. Indicateur rouge pulsant "LIVE" via `animate-ping`. Timer MM:SS mis a jour chaque seconde via `useEffect`+`setInterval` dans hook custom `useElapsedTimer`. Ecoute Ably `session-status` via `useChannel` pour MAJ dynamique du status. Status labels FR (Preparation, Bot en cours, En direct, Generation rapport). Responsive: deal name masque sur mobile. Import `Message` from `ably` pour typage correct.
- `src/app/(dashboard)/deals/[dealId]/live/components/session-controls.tsx` — Boutons pause/stop session. Pause = toggle local state (icones `Pause`/`Play`). Stop = `useMutation` POST `/api/live-sessions/${sessionId}/stop` + `AlertDialog` shadcn pour confirmation. Invalidation `queryKeys.live.session` et `queryKeys.live.sessions` on success. Disabled states pendant mutation. N'affiche rien si status !== 'live'.
- `src/app/(dashboard)/deals/[dealId]/live/components/post-call-report.tsx` — Rapport post-call complet. Props: `sessionId`, `summary?: PostCallReportData`. 9 sections collapsibles : resume executif, points cles (avec citations), nouvelles infos (avec impact + agents tags), contradictions (table deck vs call + severity badge), questions posees (badge "via coaching"), questions restantes, actions a suivre (owner badges BA/Fondateur/Partage), statistiques (duree, interventions, cards, couverture topics avec `Progress`), delta confiance (before/after + diff colore). Loading state avec spinner si pas de summary. `React.memo` sur chaque sous-section.
- `src/app/(dashboard)/deals/[dealId]/live/components/post-call-reanalysis.tsx` — Declencheur re-analyse post-call. 3 boutons : "Voir le delta" (mode delta), "Relancer analyse ciblee" (mode targeted), "Relancer analyse complete" (mode full). Chaque bouton = `useMutation` POST `/api/coaching/reanalyze`. Affichage inline des resultats : `DeltaReportDisplay` (newFacts, contradictions, resolvedQuestions, impactedAgents tags, confidence change), `AgentStatusDisplay` (badges agents + status). Calcul `impactedAgentCount` depuis `summary.newInformation`. Loading/error states par mutation. Disabled states pendant mutation.

**Patterns suivis :** `"use client"`, `React.memo` + `useCallback` + `useMemo`, `useQuery`/`useMutation` de TanStack Query, `queryKeys` factory, shadcn `Card`/`Badge`/`Table`/`AlertDialog`/`Progress`/`Skeleton`, `cn()` utility, `Message` from `ably` pour typage Ably, types depuis `@/lib/live/types`.

**Verification :** `npx tsc --noEmit` = 0 erreurs

---
## 2026-02-24 — feat: Live Coaching UI — coaching-feed + coaching-card (composants temps reel)

**Fichiers crees :**
- `src/app/(dashboard)/deals/[dealId]/live/components/coaching-card.tsx` — Composant client individuel pour carte de coaching. `React.memo`. Props: `card: AblyCoachingCardEvent`, `isAddressed?: boolean`. 4 types de cartes avec bordure gauche coloree (question=orange, contradiction=red, new_info=green, negotiation=violet). Icones lucide-react par type (HelpCircle, AlertTriangle, Lightbulb, Scale). Labels FR (Question, Contradiction, Nouveau, Nego). Indicateur de priorite : dot colore large (high), petit (medium), absent (low). Layout compact: header (icone+label+dot+timestamp), contenu (1-2 lignes), question suggeree en italique, reference en petit. Etat "aborde" : bg-muted/50, opacity-60, icone Check verte, label "Aborde". Timestamp relatif FR ("a l'instant", "il y a 2min"). Animation entree slide-in-from-top via tw-animate-css. Dark mode via CSS variables.
- `src/app/(dashboard)/deals/[dealId]/live/components/coaching-feed.tsx` — Composant client principal du feed de coaching temps reel. `React.memo`. Props: `sessionId`, `initialCards?`. 2 onglets legers (boutons simples, pas shadcn Tabs) : "Coaching" (feed live) et "Questions analyse" (placeholder). Abonnement temps reel Ably via `useChannel` (events: `coaching-card`, `card-addressed`). Gestion etat via `useReducer` (CardState: active/addressed, actions: ADD_CARD/ADDRESS_CARD/INIT). Auto-scroll vers le haut sur nouvelle carte sauf si l'utilisateur a scroll (detection via useRef + onScroll). Layout : cartes actives en haut (newest first), separateur "Abordes", cartes traitees en dessous (grayed out). Empty state avec animation pulse. Reconnect handling : dispatch INIT si initialCards change. Bouton pop-out via `window.open()` (400x700). Deduplication des cartes (idempotent sur reconnect). Import `Message` depuis `ably` pour typage correct des callbacks.

**Verification :** `npx tsc --noEmit` = 0 erreurs (dans les nouveaux fichiers)

---
## 2026-02-24 — feat: Live Coaching — 3 composants client (launcher, participant-mapper, ably-provider)

**Fichiers crees :**
- `src/app/(dashboard)/deals/[dealId]/live/components/live-session-launcher.tsx` — Composant client formulaire de lancement de session Live Coaching. Input URL de reunion avec auto-detection de plateforme (Zoom/Meet/Teams via regex, affichage Badge colore). Select langue (fr-en/fr/en, defaut fr-en). Badge status analyse (vert "Analyse complete" / jaune "Sans analyse" selon prop `hasAnalysis`). Submit via `useMutation` enchaine : POST `/api/live-sessions` (creation) puis POST `/api/live-sessions/${id}/start` (demarrage). Invalidation `queryKeys.live.sessions(dealId)` on success. Affichage erreur mutation sous le formulaire. Bouton desactive pendant le loading. shadcn: Card, Input, Select, Badge, Button.
- `src/app/(dashboard)/deals/[dealId]/live/components/participant-mapper.tsx` — Composant client mapping des roles participants. Affiche liste des participants detectes par Recall.ai avec nom + Badge role colore + dropdown Select role (ba/founder/co-founder/investor/lawyer/advisor/other). Auto-detection BA par fuzzy matching nom (normalize accents, check last-name). Auto-save debounce 500ms via `useRef` timeout + `useMutation` PUT `/api/live-sessions/${sessionId}/participants`. Indicateur sauvegarde reussie/erreur. Empty state si aucun participant.
- `src/app/(dashboard)/deals/[dealId]/live/components/ably-provider.tsx` — Wrapper client Ably realtime pour coaching en direct. Cree `Ably.Realtime` avec `authCallback` vers `/api/coaching/ably-token?sessionId=xxx`. Wrap children dans `<AblyProvider><ChannelProvider channelName="live-session:${sessionId}">`. Indicateur status connexion (vert connecte, jaune en cours, rouge deconnecte) via `connection.on()` state listener. Loading state avec animation pendant la connexion initiale. Cleanup client on unmount via `client.close()`.

**Patterns suivis :** `"use client"`, `useCallback` pour event handlers, `useMemo` pour calculs derives, `useMutation` de `@tanstack/react-query`, imports shadcn depuis `@/components/ui/...`, query keys depuis `@/lib/query-keys`, types depuis `@/lib/live/types`.

**Verification :** `npx tsc --noEmit` = 0 erreurs sur les 3 nouveaux fichiers

---
## 2026-02-24 — feat: Live Coaching UI — page shell + onglet Live dans deal page

**Fichiers crees :**
- `src/app/(dashboard)/deals/[dealId]/live/page.tsx` — Page server component Live Coaching. `requireAuth()` + verification ownership deal via `prisma.deal.findFirst`. Fetch session active (`status in created/bot_joining/live/processing`) avec `coachingCards` + `summary` inclus, et historique des 10 dernieres sessions terminees/echouees. Rendu conditionnel selon le status de session : placeholder launcher (pas de session), attente bot (created/bot_joining), coaching feed (live), generation rapport (processing). Support mode pop-out (`?popout=true`) avec layout minimal sans sidebar. Data attributes sur le conteneur session pour integration future des composants client. `Promise.all()` pour fetch active session + historique en parallele.
- `src/components/deals/live-tab-content.tsx` — Composant client placeholder pour l'onglet Live dans la page deal. Affiche icone Radio + titre + description. Props: `dealId`, `dealName`.

**Fichiers modifies :**
- `src/app/(dashboard)/deals/[dealId]/page.tsx` — Ajout onglet "Live" (5eme tab). Import `Radio` depuis lucide-react, `nextDynamic` depuis `next/dynamic` (renomme pour eviter conflit avec `export const dynamic`). `LiveTabContent` charge en `ssr: false` (composant client-only pour futur Ably realtime). TabsTrigger avec icone Radio + TabsContent delegant au composant dynamique.

**Verification :** `npx tsc --noEmit` = 0 erreurs

---
## 2026-02-24 — feat: Live Coaching Webhook Routes (2 endpoints critiques)

**Fichiers crees :**
- `src/app/api/live-sessions/[id]/webhook/route.ts` — Route POST recevant les chunks de transcription temps reel de Recall.ai. `maxDuration = 30`. Verification signature HMAC via `verifyWebhookSignature(rawBody, signature, secret)` (header `x-recall-signature`). Parse `data.transcript` avec `speaker`, `words[]`, `is_final`. Ignore les chunks partiels (`is_final: false`). Concatene les mots en texte complet. Lookup session par id (status `live` ou `bot_joining`). Determine le `speakerRole` via `mapSpeakerToRole()` (fuzzy matching participants). Store `TranscriptChunk` en DB immediatement. Retourne 200 instantanement a Recall.ai. Fire-and-forget async : (1) `classifyUtterance()` + update chunk classification en DB, (2) si speaker BA/investor : `checkAutoDismiss()` + `markCardsAsAddressed()` pour les cartes actives, (3) si `shouldTriggerCoaching()` : fetch en `Promise.all()` (transcriptBuffer, previousCards, addressedCards), compile dealContext (full ou cold mode), build `CoachingInput`, `generateCoachingSuggestion()`, si `shouldRespond` : create `CoachingCard` en DB + `publishCoachingCard()` via Ably. Tous les erreurs async catchees et loguees, jamais thrown.
- `src/app/api/webhooks/recall/route.ts` — Route POST recevant les evenements de status bot de Recall.ai. `maxDuration = 10`. Verification signature identique. Parse `event` + `data.bot_id` + `data.status.code`. Lookup session par `botId`. Mapping status codes : `in_call_recording`/`in_call_not_recording` -> `live` (set `startedAt`), `call_ended`/`done` -> `processing` (set `endedAt`, fire-and-forget `generatePostCallReport()`), `fatal` -> `failed` (store error message). Update session DB + publish Ably `session-status` event. Fire-and-forget pour post-call report via dynamic import pattern (identique a stop route).

**Patterns suivis :** `RouteContext` with `Promise<{ id: string }>`, `verifyWebhookSignature()`, `handleApiError()`, `isValidCuid()`, `void (async () => { ... })()` fire-and-forget, `Promise.all()` pour requetes paralleles, dynamic import pour `post-call-generator`.

**Verification :** `npx tsc --noEmit` = 0 erreurs

---
## 2026-02-24 — feat: Coaching support API routes (3 endpoints)

**Fichiers crees :**
- `src/app/api/coaching/context/route.ts` — GET `/api/coaching/context?dealId=xxx`. Compile le DealContext pour le coaching LLM. Auth via `requireAuth()`, validation `isValidCuid()`, verification ownership deal, appel `compileDealContext(dealId)`.
- `src/app/api/coaching/ably-token/route.ts` — GET `/api/coaching/ably-token?sessionId=xxx`. Genere un token Ably scope au channel de la session (subscribe+presence, 60min TTL). Auth, validation sessionId, verification ownership session (403 si non trouve/non proprietaire), appel `generateAblyToken(sessionId, userId)`.
- `src/app/api/coaching/reanalyze/route.ts` — POST `/api/coaching/reanalyze`. Declenche la re-analyse post-call. Zod schema `{ sessionId, mode: 'delta' | 'targeted' | 'full' }`. Verification session completed/processing + dealId present. Mode delta : `generateDeltaReport()` (comparaison legere). Mode targeted : reconstruit PostCallReport depuis SessionSummary, `identifyImpactedAgents()` + `triggerTargetedReanalysis()`. Mode full : `triggerTargetedReanalysis()` avec les 18 agents (13 Tier 1 + 5 Tier 3).

**Patterns suivis :** `requireAuth()`, `isValidCuid()`, `handleApiError()`, `NextRequest`/`NextResponse`, try/catch wrapping, `z.object()` pour POST body.

**Verification :** `npx tsc --noEmit` = 0 erreurs (dans les nouveaux fichiers)

---
## 2026-02-24 — feat: Live Coaching Phase 3 — Post-Call Report Generator + Reanalyzer

**Fichiers crees :**
- `src/lib/live/post-call-generator.ts` — Generation de rapport post-call structure. `generatePostCallReport(sessionId)` : fetch en `Promise.all()` (session+deal, transcriptChunks, coachingCards), compile le dealContext si dealId existe, construit la transcription complete, appel `completeJSON<PostCallReport>()` via Sonnet (maxTokens 4000), system prompt avec regle n1 appliquee (ton analytique, jamais prescriptif), ecrase sessionStats avec donnees reelles (anti-hallucination LLM). `generateMarkdownReport(report, sessionMeta)` : conversion en Markdown structure (header metadata, resume, points cles avec citations, informations nouvelles, contradictions en table, questions posees/restantes, actions a suivre avec owner labels FR, evolution confiance, stats). `saveReport(sessionId, report, markdown)` : transaction Prisma creant SessionSummary + Document (type CALL_TRANSCRIPT) + lien LiveSession.documentId.
- `src/lib/live/post-call-reanalyzer.ts` — Identification des agents impactes et re-analyse ciblee. `identifyImpactedAgents(report)` : mapping category-to-agent via keywords (financial/competitive/team/market/tech/legal/gtm/customer/exit/cap_table), detection depuis newInformation.agentsAffected + texte libre (fact+impact), detection depuis contradictions, toujours inclut contradiction-detector si contradictions, toujours inclut synthesis-deal-scorer + memo-generator (Tier 3). `triggerTargetedReanalysis(dealId, agentNames, sessionId)` : cree un record Analysis (type FULL_DD, mode post_call_reanalysis, status PENDING) avec metadata agents cibles — integration orchestrateur en Phase 5. `generateDeltaReport(sessionId, dealId)` : comparaison legere pre-call vs post-call via `completeJSON<DeltaReport>()` Sonnet (maxTokens 2000), system prompt regle n1, retourne newFacts/contradictions/resolvedQuestions/impactedAgents/confidenceChange.

**Verification :** `npx tsc --noEmit` = 0 erreurs

---
## 2026-02-24 — feat: Live Coaching API routes (5 endpoints)

**Fichiers crees :**
- `src/app/api/live-sessions/route.ts` — POST (create session) + GET (list sessions). Zod validation, platform detection via `detectPlatform()`, rate limit (max 1 active session, max 3/day), deal ownership check, query filters (dealId, status, includeSummary).
- `src/app/api/live-sessions/[id]/route.ts` — GET (session detail with optional transcript, coaching cards, summary) + PATCH (update language, llmModel, participants). Ownership verification via `findFirst` + userId.
- `src/app/api/live-sessions/[id]/start/route.ts` — POST: deploy Recall.ai bot via `createBot()`, update status to `bot_joining`, publish Ably session-status event. `maxDuration = 30`.
- `src/app/api/live-sessions/[id]/stop/route.ts` — POST: call `leaveMeeting()`, update status to `processing`, publish Ably event, fire-and-forget `generatePostCallReport()`. `maxDuration = 300`.
- `src/app/api/live-sessions/[id]/participants/route.ts` — PUT: update participants JSON field with Zod-validated `SpeakerRole` enum array.

**Patterns suivis :** `requireAuth()`, `isValidCuid()`, `handleApiError()`, `checkRateLimit()`, `RouteContext` with `Promise<{ id: string }>`, `NextRequest`/`NextResponse`, try/catch wrapping.

---
## 2026-02-24 — feat: Live Coaching Phase 2.3 — Coaching Engine + Auto-Dismiss

**Fichiers créés :**
- `src/lib/live/coaching-engine.ts` — Moteur de coaching temps réel. `COACHING_SYSTEM_PROMPT` : system prompt complet en français, positionné analytiquement (jamais prescriptif, règle n°1 CLAUDE.md appliquée), couvre les 4 types de cartes (question/contradiction/new_info/negotiation), 3 niveaux de priorité, format JSON strict, 8 règles de qualité (max 1 carte/utterance, contenu 1-2 phrases, pas de répétition). `buildCoachingPrompt(input)` : assemble le prompt utilisateur depuis dealContext sérialisé + 5 dernières utterances + utterance courante classifiée + 10 dernières cartes + sujets abordés. `generateCoachingSuggestion(input)` : appel Sonnet via `completeJSON<CoachingResponse>()`, temperature 0.4, maxTokens 500, hard timeout 5s via AbortController (retourne `shouldRespond: false` si timeout), validation type/priority/content, `runWithLLMContext({ agentName: 'coaching-engine' })` pour cost tracking. `getTranscriptBuffer(sessionId, limit)` : récupère les N derniers chunks significatifs depuis DB (exclut small_talk/filler), ordre chronologique.
- `src/lib/live/auto-dismiss.ts` — Détection automatique quand le BA aborde un sujet de carte coaching. `checkAutoDismiss(baUtterance, activeCards)` : comparaison sémantique via Haiku LLM (pas keyword matching), temperature 0.2, retourne les IDs des cartes adressées, validation que les IDs retournés existent dans les cartes actives, fail-safe (jamais de dismiss sur erreur). `markCardsAsAddressed(sessionId, cardIds)` : batch update DB (status='addressed', addressedAt, addressedBy='auto') + publish Ably `card-addressed` events en `Promise.all()`.

**Vérification :** `npx tsc --noEmit` = 0 erreurs

---

## 2026-02-24 — feat: Live Coaching Phase 2 — Context Compiler + Speaker Detector

**Fichiers créés :**
- `src/lib/live/context-compiler.ts` — Compile le DealContext depuis la DB pour injection LLM. `compileDealContext(dealId)` fetch en `Promise.all()` : deal (avec redFlags, documents, founders, factEvents), dernière analyse complétée, sessions live précédentes. Extrait les résultats agents (financial-auditor, team-investigator, market-intelligence, tech-stack-dd, question-master, contradiction-detector) depuis `Analysis.results` JSON. Calcule le profil de signal selon la grille CLAUDE.md. Gère gracieusement les données manquantes. `compileContextForColdMode()` retourne un contexte minimal générique. `serializeContext()` produit du texte lisible (pas de JSON dump) structuré en sections markdown.
- `src/lib/live/speaker-detector.ts` — Détection et mapping des participants. `detectBAFromParticipants()` : fuzzy match case-insensitive avec normalisation diacritiques, tokenization, exact match puis score-based avec threshold 50%. `mapSpeakerToRole()` : trouve le participant par nom et retourne son rôle. `suggestRoles()` : auto-détecte les fondateurs depuis dealContext (match noms founders vs participants), retourne des suggestions avec speakerId vide.

**Vérification :** `npx tsc --noEmit` = 0 erreurs

---


## 2026-02-24 — feat: Live Coaching Phase 2.2 — Utterance Router

**Fichier créé :**
- `src/lib/live/utterance-router.ts` — Classifieur hybride regex+LLM pour les chunks de transcription. Fast-path O(1) pour fillers (< 5 mots, regex FR/EN), small talk (salutations, météo, logistique), et mots-clés domaine (financier, concurrentiel, négociation). Fallback LLM via Haiku pour utterances ambiguës avec `runWithLLMContext()` pour cost tracking. Fonction `shouldTriggerCoaching()` : ne trigger pas pour fillers/small_talk/BA utterances, trigger pour founder/co-founder substantif.

**Vérification :** `npx tsc --noEmit` = 0 erreurs

---


## 2026-02-24 — feat: Live Coaching Phase 1 — infrastructure clients (Recall.ai, Ably, Deepgram)

**Fichiers créés :**
- `src/lib/live/recall-client.ts` — Client API Recall.ai : fetch authentifié, CRUD bot (create/status/leave/delete), récupération transcription complète, vérification HMAC-SHA256 des webhooks, détection plateforme meeting (Zoom/Meet/Teams)
- `src/lib/live/ably-server.ts` — Publisher Ably server-side : singleton REST client, channel naming par session, publishers pour coaching cards/card addressed/session status/participant joined-left, génération de tokens scopés (subscribe+presence, 60min TTL)
- `src/lib/live/deepgram-client.ts` — Stub client Deepgram STT : interfaces DeepgramConnection et DeepgramTranscriptEvent, factory createLiveTranscription (throws not implemented — Recall.ai transcription utilisée), TODO pour future implémentation WebSocket streaming

**Vérification :** `npx tsc --noEmit` = 0 erreurs

---

## 2026-02-24 — spec: Live Coaching — spécification complète

**Fichier créé :** `LIVE-COACHING-SPEC.md`

Spécification exhaustive de la feature Live Coaching : coaching IA temps réel pendant les calls BA/fondateurs. Couvre :
- Architecture server-side (Recall.ai bot + Ably realtime + Claude Sonnet 4.5/4.6)
- Pipeline 3 phases : pré-call (Deal Context Engine), live (Utterance Router + Coaching Engine), post-call (rapport + re-analyse)
- UI/UX minimaliste (flux de cartes coaching, zéro interaction manuelle, auto-détection des sujets abordés)
- Schéma DB (4 nouvelles tables : LiveSession, TranscriptChunk, CoachingCard, SessionSummary)
- Structure fichiers, routes API, intégration avec l'existant
- Coûts détaillés (~$2.40/h par session), sécurité, gestion d'erreurs, testing, limites
- 5 phases d'implémentation

---

---

## 2026-02-22 — refactor: enforcement complet du positionnement "analyse, pas décision" (UI + prompts Tier 3)

**Contexte :** Les agents Tier 3 généraient encore du texte prescriptif ("Ne pas investir", "Rejeter", "perte de temps") malgré le relabeling UI. Le MemoGeneratorCard affichait des préfixes bruts ([CRITICAL], [IMMEDIATE] [INVESTOR]) et des headers sans accents.

### UI — MemoGeneratorCard (tier3-results.tsx)
- **Accents** : "Probleme" → "Problème", "These" → "Thèse", "negociation" → "négociation", "completer" → "compléter", "etapes" → "étapes"
- **Red Flags stylés** : Parsing `[CRITICAL] texte (agent)` → Badge sévérité coloré + texte + source agent. Remplace les listes à puces brutes.
- **Next Steps stylés** : Parsing `[IMMEDIATE] [INVESTOR] texte` → Badge priorité (rouge/ambre/bleu) + badge owner + texte. Remplace le texte brut.
- **DD items** : Remplacement `list-disc list-inside` par cards individuelles full-width (plus de troncature)
- **Layout** : Grid 2-cols DD/RedFlags → stack vertical pour lisibilité

### Prompts agents Tier 3 — section TONALITÉ ajoutée aux 3 agents

**synthesis-deal-scorer.ts :**
- "PRODUIRE LA DÉCISION FINALE" → "PRODUIRE L'ANALYSE FINALE"
- "GO/NO-GO clair" → "PROFIL DE SIGNAL clair"
- Section TONALITÉ complète : interdits (Investir/Rejeter/GO/NO-GO/Dealbreaker), obligatoires (constater/rapporter/guider), exemples
- Règles spécifiques nextSteps (investigation, pas rejet) et forNegotiation (constats, pas ordres)

**memo-generator.ts :**
- Grille recommandation → profils de signal
- "Recommandation claire et assumée" → "Profil de signal clair, le BA décide"
- Section TONALITÉ complète avec règles par champ (investmentThesis, nextSteps, negotiationPoints, oneLiner)
- Ajout exemple "MAUVAIS OUTPUT PRESCRIPTIF"

**devils-advocate.ts :**
- Mission : "tu PROTEGES en INFORMANT — tu ne décides JAMAIS"
- Section TONALITÉ : interdits + obligatoires + ton "analyste rigoureux, pas prophète de malheur"
- Règle 8 : JAMAIS de langage prescriptif
- forNegotiation : constats factuels, pas d'ordres

### CLAUDE.md
- Ajout section "POSITIONNEMENT PRODUIT — RÈGLE N°1" : principe fondamental, tableau interdits/remplacements, grille profils de signal, labels de score, exemples avant/après, règle d'or, état implémentation

**Vérification :** `npx tsc --noEmit` = 0 erreurs

---

---

## 2026-02-22 — fix: devils-advocate prompt — langage analytique non-prescriptif

**Fichiers modifiés :**
- `src/agents/tier3/devils-advocate.ts` — Mise à jour du system prompt (`buildSystemPrompt()`) uniquement, aucune modification de types/interfaces/logique :
  - **Mission** : reformulée de "PROTEGER L'INVESTISSEUR en challengeant" → "Tu PROTEGES l'investisseur en l'INFORMANT des risques — tu ne decides JAMAIS a sa place"
  - **Nouvelle section TONALITE** : ajoutée après la mission — liste explicite des termes interdits ("Ne pas investir", "Fuir", "Ce deal est une arnaque", tout impératif), obligations (constater, questionner, condition sur chaque killReason, ton analyste rigoureux)
  - **Règle 8** : ajoutée dans REGLES ABSOLUES — "JAMAIS de langage prescriptif" avec exemples interdit/correct
  - **narrative.forNegotiation** : note ajoutée dans FORMAT DE SORTIE — "constats, pas d'ordres" avec exemple

**Raison :** Angel Desk analyse et guide, ne décide jamais. Le Devil's Advocate est naturellement analytique mais certaines sections du prompt pouvaient encore produire du langage prescriptif.

---

---

## 2026-02-22 — refactor: synthesis-deal-scorer — langage analytique non-prescriptif

**Fichier modifie :**
- `src/agents/tier3/synthesis-deal-scorer.ts`

**Changements dans le system prompt (`buildSystemPrompt`) :**
1. **Role description** — "PRODUIRE LA DECISION FINALE D'INVESTISSEMENT" remplace par "PRODUIRE L'ANALYSE FINALE DU DEAL"
2. **Verdict grid** — Descriptions reformulees en termes analytiques (signaux favorables, signaux contrastes, etc.)
3. **Regle ABSOLUE n5** — "GO/NO-GO clair" remplace par "PROFIL DE SIGNAL clair / SOIS INFORMATIF"
4. **Nouvelle section TONALITE** — Regle absolue anti-prescriptive ajoutee avant REGLES ABSOLUES : termes interdits (Investir/Rejeter/GO/NO-GO/Dealbreaker), formulations obligatoires (constats, signaux, questions), exemples BON/MAUVAIS
5. **Nouvelle section NEXT STEPS** — Regles de formulation : jamais "Rejeter"/"Classer le dossier", toujours "Verifier X"/"Clarifier Z"
6. **Nouvelle section FORNEGOTIATION** — Jamais "Refuser" comme action, points factuels uniquement
7. **Mission step 3/4** — "deal-breakers" remplace par "signaux d'alerte majeurs", "GO/NO-GO" par "profil de signal"

**Changements dans le user prompt (`execute`) :**
- RAPPELS CRITIQUES : "SOIS ACTIONNABLE — GO/NO-GO clair" remplace par "SOIS INFORMATIF — Profil de signal clair, le BA decide"

**Raison :** Angel Desk analyse et guide, il ne decide jamais a la place du Business Angel. Le scorer produisait du langage prescriptif ("Investir", "Ne pas investir", "GO/NO-GO"). Toutes les instructions prompt sont maintenant alignees avec le positionnement produit.

---

---

## 2026-02-22 — fix: memo-generator prompt — langage analytique non-prescriptif

**Fichiers modifiés :**
- `src/agents/tier3/memo-generator.ts` — Mise à jour du system prompt (`buildSystemPrompt`) et du prompt d'exécution (`execute`) pour imposer un ton analytique, jamais prescriptif :
  - Grille de recommandation : descriptions changées en profils de signal factuels (ex: "Vigilance requise, risques significatifs identifiés" au lieu de label GO/NO-GO)
  - Ajout section "TONALITE — REGLE ABSOLUE" avant REGLES ABSOLUES : liste exhaustive des formulations interdites (impératifs, jugements, ordres de ne pas investir) et obligatoires (constats factuels, actions d'investigation)
  - Règle 7 : "La recommandation doit être claire et assumée" remplacée par "Le profil de signal doit être clair (le BA décide, l'outil rapporte)"
  - Ajout exemple "MAUVAIS OUTPUT PRESCRIPTIF" (oneLiner/verdict prescriptifs) avec explication
  - Prompt execute : "La recommandation DOIT être claire et assumée" remplacée par "Le profil de signal DOIT être clair (l'outil rapporte, le BA décide)"

**Raison :** Angel Desk analyse et guide, il ne décide jamais à la place du Business Angel. Le memo-generator était le dernier agent Tier 3 à encore pouvoir générer du langage prescriptif ("Ne pas investir", "Deal à fuir", "Refuser la structure").

---

---

## 2026-02-22 — fix: MemoGeneratorCard — accents, red flags badges, next steps badges, layout DD

**Fichiers modifiés :**
- `src/components/deals/tier3-results.tsx` — MemoGeneratorCard uniquement :
  - **Accents manquants** : "Probleme" → "Problème", "These d'investissement" → "Thèse d'investissement", "Points de negociation" → "Points de négociation", "DD a completer" → "DD à compléter", "Prochaines etapes" → "Prochaines étapes"
  - **Red Flags parsés** : parsing du format `[SEVERITY] texte (agent-source)` → affichage avec severity badges colorés via `getSeverityStyle()` + source agent en sous-texte
  - **Next Steps parsés** : parsing du format `[PRIORITY] [OWNER] texte` → badges priority (IMMEDIATE=rouge, BEFORE_TERM_SHEET=ambre, DURING_DD=bleu) + badges owner (INVESTOR=slate, FOUNDER=violet)
  - **DD outstanding** : remplacement du `list-disc list-inside` tronqué par des cards individuelles avec padding correct
  - **Layout DD/Red Flags** : passage de `grid md:grid-cols-2` cramé à `space-y-4` vertical pour meilleure lisibilité
  - Import `getSeverityStyle` ajouté depuis `@/lib/ui-configs`
  - Helpers `parseRedFlag()`, `parseNextStep()` + configs `PRIORITY_BADGE_CONFIG`, `OWNER_BADGE_CONFIG` hoistés hors du composant
  - `useMemo` pour parsed arrays (pattern cohérent avec le reste du fichier)

---

---

## 2026-02-22 — doc: CLAUDE.md — ajout section positionnement produit (règle n°1)

**Fichiers modifiés :**
- `CLAUDE.md` — Ajout section "POSITIONNEMENT PRODUIT — RÈGLE N°1" entre les principes de développement et la stack technique. Contient : principe fondamental ("Angel Desk analyse et guide, ne décide jamais"), tableau des termes interdits avec remplacements, grille des profils de signal, labels de score, exemples de reformulation, règle d'or, liste des endroits d'application (prompts, UI, PDF, chat, landing), état de l'implémentation (fait vs reste à faire).

**Raison :** Chaque nouvelle conversation Claude Code démarrait sans contexte sur cette orientation critique. Le CLAUDE.md est lu automatiquement — cette section garantit que le positionnement "conseil, pas décision" est respecté dès le départ.

---

---

## 2026-02-22 — fix: CRITICAL — derniers vestiges de langage prescriptif + 100+ accents manquants

**Contexte :** Deuxième passe d'audit (2 agents audit parallèles) → 4 agents fix parallèles. Zéro CRITICAL restant, zéro prescriptif visible par l'utilisateur.

**Dernières corrections composants (13 edits) :**
- `deck-coherence-report.tsx` — "Equipe" → "Équipe", "Marche" → "Marché", "Metriques" → "Métriques", "Incoherence" → "Incohérence"
- `deal-comparison.tsx` — "Equipe" → "Équipe", "Marche" → "Marché"
- `score-display.tsx` — "Equipe" → "Équipe"
- `founder-responses.tsx` — "Equipe" → "Équipe", "Marche" → "Marché", "Legal" → "Légal"
- `conditions-analysis-cards.tsx` — "Eleve" → "Élevé", "Modere" → "Modéré"
- `percentile-comparator.tsx` — "Marche" → "Marché", "Eleve" → "Élevé", "Tres eleve" → "Très élevé"
- `suivi-dd-filters.tsx` — "Eleve" → "Élevé"
- `unified-alert.ts` — "Eleve" → "Élevé"
- `team-management.tsx` — "detecte(s)" → "détecté(s)", "succes" → "succès", "equipe" → "équipe", "detecter" → "détecter"

**CRITICAL fixes (5) :**
- `src/components/deals/partial-analysis-banner.tsx` — "dealbreakers" → "risques critiques" (teaser FREE users)
- `src/components/chat/deal-chat-panel.tsx` — "Red flags & dealbreakers" → "Red flags & risques critiques" (chat prompt)
- `src/components/deals/next-steps-guide.tsx` — "dealbreakers" → "risques critiques" + 8 accents manquants
- `src/app/(dashboard)/pricing/page.tsx` — "GO / NO-GO / NEED MORE INFO" → "votent et rendent un avis argumenté"
- `src/lib/pdf/pdf-sections/cover.tsx` — Raw verdict `verdict.replace(/_/g, " ")` → `recLabel(verdict)` + 4 accents

**HIGH fixes (100+ accents) — PDF files :**
- `negotiation.tsx` — 13 corrections (Stratégie, Négociation, Priorité, Amélioration, Résolution, Bénéfice, Résumé...)
- `tier3-synthesis.tsx` — 26 corrections (Sévérité, Probabilité, Scénario, Déclencheur, Délai, Préoccupations, Plausibilité...)
- `questions.tsx` — 16 corrections (Priorité, Catégorie, Déclencheur, réponse, évaluation, Criticité, Éléments...)
- `tier1-agents.tsx` — ~55 corrections (Sévérité x4, Catégorie x3, Crédibilité, Cohérence, Qualité, Complétude...)
- `tier2-expert.tsx` — ~45 corrections (Métriques clés, Préoccupation, IA véritable, Crédibilité technique, Dépendance API...)
- `early-warnings.tsx` — 2 corrections (Catégorie, détectée)
- `generate-analysis-pdf.tsx` — 2 corrections (Résumé dans métadonnées PDF)

**HIGH fixes (accents) — Composants :**
- `severity-badge.tsx` — 8 corrections (sérieux, réduire, Négocier, adressé, combiné, à d'autres, immédiate, sévérité)
- `severity-legend.tsx` — 2 corrections (sérieux, sévérité)

**Vérification :** `npx tsc --noEmit` = 0 erreurs. Grep global : 0 "dealbreaker" user-facing, 0 "GO/NO-GO" hors Board, 0 "INVESTIR"/"PASSER".

---

---

## 2026-02-22 — fix: accents manquants dans 3 fichiers PDF (questions, tier1-agents, tier2-expert)

**Fichiers modifies :**

- `src/lib/pdf/pdf-sections/questions.tsx` — "Priorite" -> "Priorite", "Categorie" -> "Categorie", "Declencheur" -> "Declencheur", "Bonne reponse" -> "Bonne reponse", "Mauvaise reponse" -> "Mauvaise reponse", "Guide d'evaluation" -> "Guide d'evaluation", "Personne ideale" -> "Personne ideale", "completes" -> "completes", "Elements bloques" -> "Elements bloques", "Criticite" -> "Criticite", "Reponses du Fondateur" -> "Reponses du Fondateur", "reponse(s) enregistree(s)" -> "reponse(s) enregistree(s)", "Verifications de references" -> "Verifications de references", "Total elements" -> "Total elements", "Element" -> "Element", "Detail" -> "Detail"
- `src/lib/pdf/pdf-sections/tier1-agents.tsx` — Correction de ~50 accents manquants dans labels/headers : "Severite" -> "Severite" (x4), "Categorie" -> "Categorie" (x3), "Critere", "Metrique", "Donnees", "Realistes", "Efficacite", "Coherence", "Credibilite", "Completude", "Retention", "Liquidite", "Fenetre", "Scenarios", "Resume", "Repartition", "Detention", "Reglementations", etc.
- `src/lib/pdf/pdf-sections/tier2-expert.tsx` — Correction de ~45 accents manquants : "Severite", "Categorie", "Priorite", "Preoccupation", "Metriques cles", "Metrique" (x3), "Median", "Detail", "Maturite", "Complexite", "Opportunites", "Modele", "Efficacite", "Completude", "Decentralisation", "Securite", "Sensibilite", "Resilience", etc.

---

---

## 2026-02-22 — fix: accents manquants dans 6 fichiers UI/PDF

**Fichiers modifiés :**

- `src/components/shared/severity-badge.tsx` — "serieux" → "sérieux", "reduire" → "réduire", "Negocier" → "Négocier", "adresse" → "adressé", "combine" → "combiné", "a d'autres" → "à d'autres", "A noter" → "À noter", "a prioriser" → "à prioriser", "immediate" → "immédiate", "severite" → "sévérité", "Evaluer" → "Évaluer"
- `src/components/shared/severity-legend.tsx` — "serieux" → "sérieux", "severite" → "sévérité"
- `src/components/deals/next-steps-guide.tsx` — "generees" → "générées", "Reponses" → "Réponses", "reponses" → "réponses", "complementaires" → "complémentaires", "specifiques" → "spécifiques", "connait" → "connaît", "resultats" → "résultats", "complete" → "complète", "scenarios" → "scénarios", "detecteur" → "détecteur", "memo" → "mémo", "Preparer" → "Préparer", "negociation" → "négociation", "identifie" → "identifié", "etapes" → "étapes", "recommandees" → "recommandées"
- `src/lib/pdf/pdf-sections/early-warnings.tsx` — "detectee(s)" → "détectée(s)", "Categorie" → "Catégorie"
- `src/lib/pdf/pdf-sections/cover.tsx` — "Analyse complete:" → "Analyse complète :", "Genere le" → "Généré le", "EQUIPE" → "ÉQUIPE", "DEMANDE" → "DEMANDÉ"
- `src/lib/pdf/generate-analysis-pdf.tsx` — "DD Resume" → "DD Résumé", "Resume Due Diligence" → "Résumé Due Diligence"

---

---

## 2026-02-22 — fix: accents manquants dans pdf-sections/tier3-synthesis.tsx

**Fichiers modifiés :**

- `src/lib/pdf/pdf-sections/tier3-synthesis.tsx` — Correction de tous les accents manquants dans les labels/headers PDF français : "Synthese" → "Synthèse", "Contradictions detectees" → "Contradictions détectées", "Severite" → "Sévérité", "Resolution probable" → "Résolution probable", "Lacunes de donnees identifiees" → "Lacunes de données identifiées", "Impact si ignore" → "Impact si ignoré", "Scenario catastrophe" → "Scénario catastrophe", "Probabilite" → "Probabilité", "Perte estimee" → "Perte estimée", "Declencheur" → "Déclencheur", "Delai" → "Délai", "Angles morts identifies" → "Angles morts identifiés", "Objections detaillees" → "Objections détaillées", "Echec comparable" → "Échec comparable", "Interpretation alternative" → "Interprétation alternative", "Plausibilite" → "Plausibilité", "Synthese des preoccupations" → "Synthèse des préoccupations", "Preoccupations serieuses" → "Préoccupations sérieuses", "Preoccupations mineures" → "Préoccupations mineures", "Scenarios d'investissement" → "Scénarios d'investissement", "Resultat probabiliste" → "Résultat probabiliste", "risque-ajustee" → "risque-ajustée", "Scenario" (table header) → "Scénario", "Scenario le + probable" → "Scénario le + probable", "sensibilite" → "sensibilité", "Evaluation burn" → "Évaluation burn"

---

---

## 2026-02-22 — fix: accents manquants dans pdf-sections/negotiation.tsx

**Fichiers modifiés :**

- `src/lib/pdf/pdf-sections/negotiation.tsx` — Correction de tous les accents manquants dans les labels/headers PDF français : "Strategie de Negociation" → "Stratégie de Négociation", "Arguments cles" → "Arguments clés" (x2), "Apres" → "Après", "Amelioration" → "Amélioration", "Points de negociation" → "Points de négociation" (x2), "Priorite" → "Priorité" (x2), "Resolution" → "Résolution", "Resolvable" → "Résolvable", "Benefice net" → "Bénéfice net", "Negociation — Resume" → "Négociation — Résumé"

---

---

## 2026-02-22 — fix: accents et langage — corrections HIGH+MEDIUM à travers la codebase

**Fichiers modifiés :**

- `src/lib/ui-configs.ts` — "Eleve" → "Élevé" (label sévérité HIGH)
- `src/components/deals/early-warnings-panel.tsx` — "Integrite Fondateurs" → "Intégrité Fondateurs", "Marche" → "Marché", "Questions a poser" → "Questions à poser", "Alertes Detectees" → "Alertes Détectées", phrase critique avec accents manquants corrigée
- `src/components/deals/suivi-dd/suivi-dd-alert-card.tsx` — "Conditionnel" → "Risque conditionnel", "Resolu" → "Résolu", "Accepte" → "Accepté", "Piste de resolution" → "Piste de résolution", "Argument de nego" → "Argument de négociation"
- `src/components/deals/tier3-results.tsx` — "Niveau de conviction" → "Niveau de scepticisme", "Investment Highlights" → "Points forts du deal", "Deals Compares" → "Deals Comparés", "Contradictions detectees" → "Contradictions détectées", "identifiee(s)" → "identifiée(s)", "incoherences" → "incohérences", "coherentes" → "cohérentes", "Analyse automatisee" → "Analyse automatisée", "Synthese Due Diligence" → "Synthèse Due Diligence", "Fiabilite donnees" → "Fiabilité données"
- `src/components/shared/severity-legend.tsx` — "Dealbreaker potentiel" → "Risque potentiellement bloquant"
- `src/components/shared/severity-badge.tsx` — CRITICAL: "Dealbreaker potentiel. Ce risque peut a lui seul justifier de passer le deal." → langage non-prescriptif avec accents
- `src/lib/pdf/pdf-sections/early-warnings.tsx` — "Alertes Precoces (Early Warnings)" → "Alertes Précoces", "Questions a poser" → "Questions à poser"
- `src/lib/pdf/pdf-sections/negotiation.tsx` — "Approche recommandee" → "Approche recommandée"
- `src/lib/pdf/pdf-sections/questions.tsx` — "Risques critiques identifies" → "Risques critiques identifiés", "Resolvabilite" → "Résolvabilité", "Red flag si mauvaise" → "Signal d'alerte si mauvaise réponse"
- `src/components/deals/tier2-results.tsx` — "Confidence:" → "Fiabilité :", "Top Strength" → "Point fort principal", "Top Concern" → "Point d'attention principal"

---

---

## 2026-02-22 — fix: CRITICAL+HIGH — prescriptive text, missing rec keys, raw internal keys in chat

**Fichiers modifies :**

- `src/lib/pdf/pdf-sections/tier3-synthesis.tsx` — "Raisons de ne PAS investir" -> "Signaux d'alerte critiques"
- `src/lib/pdf/pdf-helpers.ts` — recLabel() : ajout cases strong_invest, strong_pass, no_go, conditional_invest
- `src/lib/pdf/pdf-components.tsx` — RecommendationBadge : gestion complète de tous les keys (strong_invest, strong_pass, no_go, conditional_invest) avec bg/fg corrects
- `src/agents/orchestrator/summary.ts` — Ajout ACTION_LABELS, remplacement .toUpperCase() par labels FR, "Dealbreakers potentiels" -> "Risques critiques potentiels"
- `src/config/labels-fr.ts` — Suppression VERDICT_LABELS_FR (non utilisée, labels incorrects)
- `src/components/deals/tier2-results.tsx` — Renommage VERDICT_CONFIG -> SECTOR_FIT_CONFIG + mise a jour ref avec keyof typeof
- `src/lib/score-utils.ts` — extractDealRecommendation() : lit d'abord investmentRecommendation.action, fallback recommendation
- `src/components/deals/verdict-panel.tsx` — "Verdict" -> "Analyse globale" (h3 + empty-state)

---

---

## 2026-02-22 — fix: accessibility + performance — score-ring, verdict-panel, early-warnings, tier3, tier1, ui-configs

**Fichiers modifies :**

### Accessibility
- `src/components/ui/score-ring.tsx` — Ajout `role="img"` + `aria-label="Score: X sur 100"` sur le conteneur, `aria-hidden="true"` sur le SVG
- `src/components/deals/verdict-panel.tsx` — MiniBar : ajout prop `label`, `role="progressbar"`, `aria-valuenow/min/max`, `aria-label`. Call sites mis a jour avec `label={dim.label}`
- `src/components/deals/early-warnings-panel.tsx` — Bouton expand/collapse : ajout `aria-expanded={isExpanded}`

### Performance
- `src/components/deals/tier3-results.tsx` — Hoist `recommendationConfig` de `MemoGeneratorCard` vers module level (`MEMO_RECOMMENDATION_CONFIG`). Ajout `shrink-0` sur `RecommendationBadge` Badge className
- `src/lib/ui-configs.ts` — Ajout exports `ALERT_SIGNAL_LABELS` et `READINESS_LABELS` (source de verite unique)
- `src/components/deals/tier1-results.tsx` — Suppression constants locales `ALERT_SIGNAL_LABELS`/`READINESS_LABELS`, import depuis `@/lib/ui-configs`
- `src/lib/pdf/pdf-sections/tier1-agents.tsx` — Import `ALERT_SIGNAL_LABELS` depuis `@/lib/ui-configs`, remplacement de la chaine ternaire inline

---

---

## 2026-02-22 — refactor: repositionnement produit — de conseil à analyse (profils de signal)

**Contexte :** Réduction du risque juridique/réputationnel en éliminant le langage prescriptif (INVESTIR/PASSER/etc.) au profit de constats analytiques. Le BA reste le décideur, l'outil rapporte des signaux.

**Fichiers modifies :**

### Configs centrales
- `src/lib/ui-configs.ts` — RECOMMENDATION_CONFIG: INVESTIR→"Signaux favorables", PASSER→"Signaux d'alerte dominants", NEGOCIER→"Signaux contrastés", ATTENDRE→"Investigation complémentaire". VERDICT_CONFIG: Forte conviction→"Signaux très favorables", Ne pas investir→"Signaux d'alerte dominants". getScoreLabel: Bon→"Solide", Moyen→"À approfondir", Faible→"Points d'attention", Critique→"Zone d'alerte"
- `src/config/labels-fr.ts` — VERDICT_LABELS_FR aligné sur nouveau VERDICT_CONFIG

### Composants d'affichage
- `src/components/deals/early-warnings-panel.tsx` — "Dealbreaker probable/absolu"→"Risque majeur/critique détecté"
- `src/components/deals/tier1-results.tsx` — AlertSignal mapping (STOP→"ANOMALIE MAJEURE", INVESTIGATE_FURTHER→"INVESTIGATION REQUISE", etc.), readiness labels (DO_NOT_PROCEED→"Alertes critiques"), "Dealbreakers identifiés"→"Risques critiques identifiés"
- `src/components/deals/tier2-results.tsx` — Sector verdicts (NOT_RECOMMENDED→"Hors profil sectoriel"), valuation verdicts (excessive→"Nettement au-dessus")
- `src/components/deals/tier3-results.tsx` — "Dealbreakers"→"Risques critiques", "Pourquoi NO_GO"→"Signaux d'alerte dominants", memo recommendation labels
- `src/components/deals/suivi-dd/suivi-dd-alert-card.tsx` — "Dealbreaker"→"Risque critique"

### PDF
- `src/lib/pdf/pdf-helpers.ts` — recLabel() aligné sur profils de signal
- `src/lib/pdf/pdf-components.tsx` — RecommendationBadge aligné
- `src/lib/pdf/pdf-sections/early-warnings.tsx` — "DEALBREAKER ABSOLU/PROBABLE"→"RISQUE CRITIQUE/MAJEUR DÉTECTÉ"
- `src/lib/pdf/pdf-sections/negotiation.tsx` — "Dealbreakers"→"Risques critiques"
- `src/lib/pdf/pdf-sections/tier3-synthesis.tsx` — "Dealbreakers absolus/conditionnels"→"Risques critiques/conditionnels"
- `src/lib/pdf/pdf-sections/questions.tsx` — "Dealbreakers identifies"→"Risques critiques identifies"
- `src/lib/pdf/pdf-sections/tier1-agents.tsx` — alertSignal labels reformulés

### Prompts agents
- `src/agents/tier3/synthesis-deal-scorer.ts` — Grille verdict reformulée en profils de signal
- `src/agents/tier3/memo-generator.ts` — Grille recommandation reformulée
- `src/agents/tier3/devils-advocate.ts` — Kill reasons : ajout obligation de condition d'atténuation
- `src/agents/orchestrator/summary.ts` — "VERDICT FINAL"→"ANALYSE FINALE", "Recommandation"→"Signal"

### Landing + Pricing
- `src/app/page.tsx` — Badge: "Votre équipe d'analystes IA", CTA: "Vous décidez, vos analystes IA font le travail", "Votre prochain deal, analysé en 5 minutes"
- `src/app/(dashboard)/pricing/page.tsx` — Header: "Votre équipe d'analystes, toujours disponible", "GO/NO-GO en 2 min"→"Briefing express en 2 min", Tiers 2/3 inversés corrigés

### Divers
- `src/lib/glossary.ts` — "Dealbreaker" redéfini comme "Risque critique"

**Ce qui ne change PAS :** Types TS, Zod schemas, clés internes, Board GO/NO_GO, Prisma schema, logique de scoring

---

---

## 2026-02-22 — fix: prompt engineering conditions-analyst — tonalité valorisation + logique CCA vs BSA-AIR

**Fichiers modifies :**
- `src/agents/tier3/conditions-analyst.ts` — 3 corrections dans le system prompt :
  1. Section Valorisation : ajout tableau "Interprétation pour le BA" + règle de tonalité (score élevé = bonne nouvelle, formuler positivement). Interdit les formulations alarmantes pour une sous-évaluation favorable
  2. Section Conseils de négociation : ajout règle de vérification économique — chaque conseil doit bénéficier au BA (réduire coût ou augmenter protections), jamais l'inverse
  3. Section Multi-tranche : ajout règle critique comparaison CCA-nominal vs BSA-AIR-cap — le CCA au nominal est moins cher, convertir en BSA-AIR augmente le coût. Ne jamais recommander cette conversion

**Raison :** L'agent produisait (1) des rationales alarmants pour des valorisations sous-évaluées (score 85 mais texte "montant dérisoire"), et (2) des conseils absurdes comme "convertir CCA en BSA-AIR" alors que ça augmente le coût d'acquisition pour le BA.

---

---

## 2026-02-21 — refactor: refonte onglet Conditions — suppression duplication, hero card, UX formulaire

**Fichiers modifies :**
- `src/components/ui/score-ring.tsx` — CREE : composant ScoreRing partagé (extrait de verdict-panel)
- `src/components/deals/conditions/conditions-analysis-cards.tsx` — REECRIT : 7 cards → 5 cards consolidées (ConditionsHeroCard remplace VerdictSummary+ScoreCard, NegotiationAdviceCard+talkingPoints, CrossReferenceInsightsCard collapsible). Suppression 4 helpers de couleur locaux → imports ui-configs.ts
- `src/components/deals/conditions/conditions-tab.tsx` — Nouvel ordre des cards, AlertDialog warning mode switch, suppression topAdvice dupliqué
- `src/components/deals/conditions/simple-mode-form.tsx` — Auto-calcul dilution (formule + bouton Appliquer + avertissement écart)
- `src/components/deals/conditions/tranche-editor.tsx` — Suppression GripVertical (pas de drag-to-reorder)
- `src/components/deals/verdict-panel.tsx` — Import ScoreRing partagé
- `src/components/deals/score-display.tsx` — Import ScoreRing partagé (remplace MiniScoreRing inline)

**Raison :** Le score et le one-liner apparaissaient dans 2 cards distinctes, les top 3 négociation étaient dupliqués entre VerdictSummary et NegotiationAdviceCard. Information architecture repensée : Hero card unique (ScoreRing + verdict + breakdown compact + valuation) → Négociation → Questions → Red flags → Cross-refs collapsible.

---

---

## 2026-02-21 — fix: security hardening — Zod schema constraints on terms route

- **route.ts (terms)** : ajout `.max(100)` sur `instrumentType`, `liquidationPref`, `antiDilution`, `boardSeat` — `.max(500)` sur `instrumentDetails` — `.max(2000)` sur `customConditions`, `notes`
- **route.ts (terms)** : ajout `.max(1e15)` sur `valuationPre`, `amountRaised` pour borner les valeurs numeriques
- **route.ts (terms)** : trancheSchema — remplacement `z.string().default("PENDING")` par `z.enum(["PENDING", "ACTIVE", "CONVERTED", "EXPIRED", "CANCELLED"])` pour le champ `status`
- **route.ts (terms)** : trancheSchema — ajout `.max(200)` sur `label`, `.max(100)` sur `trancheType`, `.max(500)` sur `typeDetails`, `.max(1000)` sur `triggerDetails`, `.max(100)` sur `liquidationPref`/`antiDilution`

### Fichiers modifies
- `src/app/api/deals/[dealId]/terms/route.ts`

---

---

## 2026-02-21 — perf: React.memo + useCallback — conditions components

- **version-timeline.tsx** : `VersionDetails` enveloppe dans `React.memo` pour eviter re-renders inutiles quand le snapshot n'a pas change
- **conditions-tab.tsx** : inline `onApply` callback extrait en `handleApplyTermSheet` via `useCallback` (reference stable pour `TermSheetSuggestions`)
- **dilution-simulator.tsx** : ajout `useCallback` pour `handlePreMoneyChange`, `handleInvestmentChange`, `handleEsopChange` — remplacement des setters inline dans les 6 handlers (Input onChange + Slider onValueChange)

### Fichiers modifies
- `src/components/deals/conditions/version-timeline.tsx`
- `src/components/deals/conditions/conditions-tab.tsx`
- `src/components/deals/conditions/dilution-simulator.tsx`

---

---

## 2026-02-21 — fix: dark mode + empty state — conditions components

- **percentile-comparator.tsx** : ajout dark mode variants sur le gradient de la barre percentile (`dark:from-green-900/40 dark:via-blue-900/40 dark:via-yellow-900/40 dark:to-red-900/40`)
- **term-sheet-suggestions.tsx** : ajout dark mode variants sur les badges de confidence (`dark:text-green-400 dark:bg-green-900/30`, etc.)
- **conditions-tab.tsx** : ajout empty state quand l'analyse IA n'a pas encore ete lancee (icone Brain + message invitant a cliquer "Sauvegarder et analyser")

### Fichiers modifies
- `src/components/deals/conditions/percentile-comparator.tsx`
- `src/components/deals/conditions/term-sheet-suggestions.tsx`
- `src/components/deals/conditions/conditions-tab.tsx`

---

---

## 2026-02-21 — fix: conditions tab — types, validation, icons, verdict, questions

- **types.ts** : ajout types `QuestionItem`, `ValuationFindings`, `InstrumentFindings`, `ProtectionsFindings` — enrichissement `ConditionsFindings` avec champs types (valuation, instrument, protections) — ajout champ `questions` dans `TermsResponse`
- **terms-normalization.ts** : ajout mapping `questions` (lowercase priority) dans `buildTermsResponse`, retourne `questions` dans la reponse
- **conditions-tab.tsx** : fix icones dupliquees Simulateur/Comparateur (`BarChart3` remplace par `TrendingDown`/`Target`) — term sheet suggestions affiches meme si formulaire non vide — validation client-side avant sauvegarde (dilution 0-100%, cliff <= vesting, ESOP 0-100%, valo/montant positifs) — ajout `ConditionsVerdictSummary` en haut de l'analyse + `ConditionsQuestionsCard` — spacer `h-16` pour le bouton sticky

### Fichiers modifies
- `src/components/deals/conditions/types.ts`
- `src/services/terms-normalization.ts`
- `src/components/deals/conditions/conditions-tab.tsx`

---

---

## 2026-02-21 — feat: ConditionsVerdictSummary + ConditionsQuestionsCard + progress bar clamp

- **conditions-analysis-cards.tsx** : ajout composant `ConditionsVerdictSummary` — carte TL;DR en haut de l'analyse (score/verdict, valuation quick view, top 3 nego priorities, arguments de nego, boutons simulateur/comparateur)
- **conditions-analysis-cards.tsx** : ajout composant `ConditionsQuestionsCard` — carte expandable des questions a poser au fondateur (priority badge, context, whatToLookFor)
- **conditions-analysis-cards.tsx** : clamp progress bar width a `Math.min(score, 100)` dans `ConditionsScoreCard` et `StructuredAssessmentCard` pour eviter overflow
- **conditions-analysis-cards.tsx** : ajout import `QuestionItem` depuis `./types`
- **types.ts** : type `QuestionItem` deja present (id?, question, priority, context?, whatToLookFor?)

### Fichiers modifies
- `src/components/deals/conditions/conditions-analysis-cards.tsx`

---

---

## 2026-02-21 — fix: accessibility, responsive, performance — conditions components

- **simple-mode-form.tsx** : `aria-label` ajouté sur les 9 Switch (pro-rata, information rights, founder vesting, drag-along, tag-along, ratchet, pay-to-play, milestones, non-compete)
- **tranche-editor.tsx** : `aria-label="Pro-rata rights"` ajouté sur le Switch
- **dilution-simulator.tsx** : `aria-label` sur les 3 Sliders (pre-money, montant investi, ESOP)
- **dilution-simulator.tsx** : suppression dependance redondante `result` dans le `useMemo` scenarios
- **dilution-simulator.tsx** : hauteur chart responsive (`h-[160px] sm:h-[200px]`), largeurs Input responsive
- **percentile-comparator.tsx** : remplacement `.replace("bg-", "text-")` fragile par fonctions dediees `getPercentileTextColor` et `getPercentileLabel`
- **version-timeline.tsx** : indicateur de troncature quand > 20 champs affiches

### Fichiers modifies
- `src/components/deals/conditions/simple-mode-form.tsx`
- `src/components/deals/conditions/tranche-editor.tsx`
- `src/components/deals/conditions/dilution-simulator.tsx`
- `src/components/deals/conditions/percentile-comparator.tsx`
- `src/components/deals/conditions/version-timeline.tsx`

---

---

## 2026-02-21 — fix: UX conditions tab — empty state, extraction list, confidence colors

- **conditions-tab.tsx** : empty state redesigne avec grid de 2 cartes explicatives (Simple vs Structure) au lieu de 2 boutons generiques
- **term-sheet-suggestions.tsx** : max-height extraction list responsive (250px mobile / 350px desktop)
- **term-sheet-suggestions.tsx** : seuils `getConfidenceColor` plus granulaires (85/65/45) avec ajout niveau bleu intermediaire
- **conditions-help.ts** : audit tooltips — tous terminent deja par un point, aucun fix necessaire

### Fichiers modifies
- `src/components/deals/conditions/conditions-tab.tsx`
- `src/components/deals/conditions/term-sheet-suggestions.tsx`

---

---

## 2026-02-21 — fix: backend conditions-analyst + terms route race condition + timeout

- **analysis-constants.ts** : ajout `"conditions-analyst"` dans `TIER3_AGENTS` pour que `categorizeResults` classe correctement ses résultats en Tier 3
- **terms/route.ts** : timeout route aligné de 55s à 52s (2s buffer après le 50s agent timeout)
- **terms/route.ts** : fix race condition version numbering — `count()` remplacé par `findFirst(orderBy: desc)` pour éviter les conflits de numéro de version en cas de requêtes concurrentes
- **terms-normalization.ts** : ajout import `QuestionItem` depuis les types conditions

### Fichiers modifiés
- `src/lib/analysis-constants.ts`
- `src/app/api/deals/[dealId]/terms/route.ts`
- `src/services/terms-normalization.ts`

---

---

## 2026-02-20 — refonte Vue d'ensemble : suppression VerdictPanel, Scores en premier

- **VerdictPanel supprimé** de la Vue d'ensemble (redondant avec la card Scores)
- **Card Scores remontée** en première position (gauche), DealInfo à droite
- Variables mortes nettoyées : verdictScore, verdictRecommendation, verdictRedFlags, conditionIssues, pendingQuestionsCount
- Imports morts supprimés : VerdictPanel, extractDealScore, extractDealRecommendation
- Fichier modifié : `deals/[dealId]/page.tsx`

---

---

## 2026-02-20 — feat: AI Board en sous-onglet à côté de Suivi DD

- **AI Board** intégré comme sous-onglet dans l'AnalysisPanel : Résultats | Cohérence | Suivi DD | **AI Board**
- Dynamic import du AIBoardPanel directement dans analysis-panel.tsx (ssr: false, lazy-loaded)
- Suppression du BoardPanelWrapper standalone de la page deal (plus de composant séparé en bas)
- Props `dealName` ajoutée à AnalysisPanelWrapper → AnalysisPanel pour le board
- Fichiers modifiés : `analysis-panel.tsx`, `analysis-panel-wrapper.tsx`, `deals/[dealId]/page.tsx`

---

---

## 2026-02-20 — refonte UI: Verdict, Scores, DealInfo — design pro fintech

### Composants redesignés
- **VerdictPanel** — Score ring SVG animé, accent line colorée, layout horizontal score+détails, typographie uppercase tracking-wider pour labels, spacing et hiérarchie visuelle améliorés
- **ScoreDisplay/ScoreGrid** — Barres gradient avec fond teinté, mini score ring pour le score global, labels uppercase, meilleur espacement grid
- **DealInfoCard** — Layout avec icônes par champ (MapPin, Target, Banknote...), header séparé avec bordure, InfoRow component, suppression de la Card shadcn basique
- **Deal page** — Suppression des stat cards redondants (Valorisation/ARR dupliqués), section Scores custom container au lieu de Card générique, nettoyage imports inutilisés

### Fichiers modifiés
- `src/components/deals/verdict-panel.tsx`
- `src/components/deals/score-display.tsx`
- `src/components/deals/deal-info-card.tsx`
- `src/app/(dashboard)/deals/[dealId]/page.tsx`

---
