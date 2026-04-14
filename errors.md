# Errors Log — Angel Desk

> Ce fichier est le registre centralisé de toutes les erreurs rencontrées, leurs causes racines et les solutions validées.
> **Règle** : Chaque agent / développeur DOIT consulter ce fichier AVANT d'écrire du code.

---

## Format d'entrée

```
### [DATE] — [CATÉGORIE] — [Titre court]
- **Fichier(s)** : chemin(s) concerné(s)
- **Erreur** : description précise
- **Cause racine** : pourquoi ça s'est produit
- **Solution validée** : ce qui a fonctionné (avec code si pertinent)
- **Ce qui N'A PAS fonctionné** : tentatives échouées (pour éviter de les retenter)
- **Agent/Auteur** : qui a détecté et corrigé
```

---

## Entrées

### 2026-03-12 — ARCHITECTURE — Fire-and-forget analyse sur Vercel serverless
- **Fichier(s)** : `src/app/api/analyze/route.ts:227-263`
- **Erreur** : L'analyse est lancée en fire-and-forget (`orchestrator.runAnalysis().then().catch()`). Sur Vercel serverless, le runtime tue les processus après retour de la réponse. Les analyses longues (20+ agents, 3-5 min) sont tronquées silencieusement.
- **Cause racine** : Le code Inngest existe (`src/lib/inngest.ts:292-326`) mais la route ne l'utilise pas.
- **Solution validée** : Migrer vers `inngest.send('analysis/deal.analyze', ...)` et faire polling depuis le client.
- **Ce qui N'A PAS fonctionné** : `maxDuration = 300` ne suffit pas (nécessite Vercel Pro et ne couvre pas tous les cas).
- **Agent/Auteur** : Agent Architecture

### 2026-03-12 — CREDITS — Fail-open en production (crédits illimités si DB down)
- **Fichier(s)** : `src/services/credits/usage-gate.ts:128-133, 372-386`
- **Erreur** : Quand les tables de crédit ne sont pas accessibles, le code retourne `success: true, balanceAfter: 9999` SANS vérifier `NODE_ENV`. Bypass total du paywall si la DB a un problème temporaire.
- **Cause racine** : Code de dev conçu pour faciliter le développement local sans migration, jamais protégé pour la prod.
- **Solution validée** : Ajouter `if (process.env.NODE_ENV === 'production') throw error;` avant le fail-open. En prod, retourner `{ success: false, error: 'Credit system unavailable' }`.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent QA + Agent Scoring

### 2026-03-12 — CREDITS — Double refund non protégé (idempotence manquante)
- **Fichier(s)** : `src/services/credits/usage-gate.ts:244-275`
- **Erreur** : `refundCredits()` n'a aucune protection d'idempotence. Un double appel donne 2x le remboursement. Confirmé par le test e2e.
- **Cause racine** : Pas de vérification d'unicité du refund.
- **Solution validée** : Ajouter un check `WHERE NOT EXISTS (creditTransaction WHERE dealId AND action='REFUND')` ou utiliser un refundId unique.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent Scoring

### 2026-03-12 — CREDITS — Race condition TOCTOU (check séparé du deduct)
- **Fichier(s)** : `src/app/api/analyze/route.ts:91 vs 207`
- **Erreur** : Le check des crédits (ligne 91) et la déduction (ligne 207) sont séparés par ~100 lignes de code et plusieurs requêtes DB. Deux requêtes concurrentes passent le check.
- **Cause racine** : Pattern check-then-act anti-pattern.
- **Solution validée** : Supprimer le check préalable, utiliser directement `deductCredits()` qui est atomique (`updateMany WHERE balance >= cost`). En cas d'échec, retourner 403.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent QA

### 2026-03-12 — SÉCURITÉ — SSRF dans website-crawler (pas de blocage IP privées)
- **Fichier(s)** : `src/services/context-engine/connectors/website-crawler.ts:167`, `website-resolver.ts:185`
- **Erreur** : Le crawler `fetch()` des URLs sans vérifier si elles pointent vers des adresses internes (localhost, 169.254.169.254). Un fondateur malveillant peut exfiltrer les métadonnées cloud.
- **Cause racine** : La validation SSRF existe pour les webhooks (`/api/v1/webhooks/route.ts:68-86`) mais n'est pas partagée avec le crawler.
- **Solution validée** : Créer une fonction `isPrivateUrl()` bloquant localhost, 127.0.0.1, 169.254.169.254, 10.*, 172.16-31.*, 192.168.*, etc. L'appliquer dans le crawler et le resolver.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent Sécurité

### 2026-03-12 — SÉCURITÉ — CRON_SECRET comparaison non timing-safe
- **Fichier(s)** : `src/app/api/cron/maintenance/cleaner/route.ts:24` (+ sourcer, completer, supervisor)
- **Erreur** : `authHeader === Bearer ${cronSecret}` utilise `===` au lieu de `timingSafeEqual`. Vulnerable aux timing attacks.
- **Cause racine** : Code simple sans prise en compte des side-channel attacks.
- **Solution validée** : Utiliser `crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))` avec vérification de longueur préalable.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent Sécurité

### 2026-03-12 — POSITIONNEMENT — Termes prescriptifs dans l'UI visible (3 CRITICAL)
- **Fichier(s)** : `src/components/shared/severity-legend.tsx:10`, `severity-badge.tsx:29`, `src/components/chat/deal-chat-panel.tsx:85`
- **Erreur** : "avant d'investir" dans des textes visibles par le BA. Viole la règle N°1 : "Angel Desk ne DÉCIDE JAMAIS".
- **Cause racine** : Reformulation incomplète lors de la migration vers le ton analytique.
- **Solution validée** : Remplacer "avant d'investir" par "avant toute décision" dans les 3 fichiers.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent Conformité

### 2026-03-12 — POSITIONNEMENT — 12 violations dans les prompts agents
- **Fichier(s)** : `question-master.ts:368-420`, `legal-regulatory.ts:240`, `synthesis-deal-scorer.ts:360,647-648`, `conditions-analyst.ts:247`, `consensus-engine.ts:276`, `benchmark-tool.ts:346`, `early-warnings.ts:662`
- **Erreur** : "NO GO", "investir SI", "conditional_pass", "investir à l'aveugle", "dealbreakers" dans les prompts LLM. Le LLM reproduit ces termes dans ses réponses.
- **Cause racine** : Les exemples de "BON OUTPUT" contiennent eux-mêmes des termes interdits. Le LLM les reproduit.
- **Solution validée** : Reformuler chaque occurrence (cf. audit conformité complet). Remplacer les exemples par des formulations analytiques.
- **Ce qui N'A PAS fonctionné** : Le result-sanitizer filtre en sortie, mais le problème est en amont dans les prompts.
- **Agent/Auteur** : Agent Conformité

### 2026-03-12 — POSITIONNEMENT — Type verdict désynchronisé du schema Zod
- **Fichier(s)** : `src/agents/types.ts:3334`
- **Erreur** : Le type utilise `"strong_pass" | "pass" | "conditional_pass" | "weak_pass" | "no_go"` alors que le schema Zod utilise déjà `"very_favorable" | "favorable" | "contrasted" | "vigilance" | "alert_dominant"`.
- **Cause racine** : Le schema a été migré mais le type TypeScript n'a pas suivi.
- **Solution validée** : Synchroniser le type avec le schema Zod.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent Conformité

### 2026-03-12 — ANTI-HALLUCINATION — Directives manquantes dans les fallbacks legacy
- **Fichier(s)** : `src/agents/orchestration/consensus-engine.ts:1113,1233,1392,1597`, `reflexion.ts:882,942,1000`, `board-orchestrator.ts:925`, `fact-extractor.ts:1097`
- **Erreur** : 9 appels LLM (7 legacy fallbacks + 1 board dedup + 1 fact-extractor meta-eval) n'ont aucune ou seulement certaines des 5 directives anti-hallucination.
- **Cause racine** : Les prompts principaux (Zod-validated) sont conformes, mais les fallbacks legacy (exécutés quand Zod échoue) n'ont pas été mis à jour.
- **Solution validée** : Ajouter les 5 directives dans chaque fallback, ou mieux : supprimer les fallbacks legacy et forcer la validation Zod avec des defaults.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent Anti-Hallucination

### 2026-03-12 — ANTI-HALLUCINATION — Directives doublées dans Tier 3 + Chat
- **Fichier(s)** : `src/agents/tier3/*.ts`, `src/agents/chat/deal-chat-agent.ts`
- **Erreur** : Les directives 2-5 sont dans `buildSystemPrompt()` ET re-injectées par `buildFullSystemPrompt()`. Double tokens inutiles.
- **Cause racine** : Les agents Tier 3 ont ajouté les directives manuellement avant que BaseAgent ne les ajoute automatiquement.
- **Solution validée** : Retirer les appels explicites dans les `buildSystemPrompt()` des agents Tier 3 et Chat.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent Anti-Hallucination

### 2026-03-12 — UX — Dashboard "Plan: Gratuit / 3 deals/mois" obsolète
- **Fichier(s)** : `src/app/(dashboard)/dashboard/page.tsx:183-196`
- **Erreur** : La carte "Plan" affiche un système d'abonnement alors que le pricing est par crédits.
- **Cause racine** : Remnant de l'ancien modèle par abonnement.
- **Solution validée** : Remplacer par une carte "Crédits" affichant le solde actuel + lien vers /pricing.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent Persona BA + Agent UI/UX

### 2026-03-12 — UX — Page /analytics dans le sidebar → 404
- **Fichier(s)** : `src/components/layout/sidebar.tsx:49`
- **Erreur** : Le lien "Analytiques" pointe vers une page inexistante.
- **Cause racine** : Feature planifiée mais pas implémentée, lien laissé en place.
- **Solution validée** : Retirer le lien du sidebar ou créer une page minimale.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent UI/UX

### 2026-03-12 — UX — Accents manquants dans toute l'UI Board + composants
- **Fichier(s)** : `vote-board.tsx`, `arena-view.tsx`, `chat-view.tsx`, `columns-view.tsx`, `timeline-view.tsx`, `board-teaser.tsx`, `first-deal-guide.tsx`, `error.tsx`
- **Erreur** : "Debat", "Majorite", "Echec", "Reduire", "deliberent", "Desaccords", "Reessayer", "Creez", "metriques" — tous sans accents.
- **Cause racine** : Développement rapide sans vérification linguistique.
- **Solution validée** : Corriger systématiquement tous les accents dans les fichiers UI.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent UI/UX

### 2026-03-12 — UX — ScoreBadge labels désalignés avec ui-configs.ts
- **Fichier(s)** : `src/components/shared/score-badge.tsx:33`
- **Erreur** : SCORE_SCALE utilise "Bon" alors que ui-configs.ts dit "Solide" pour 60-79.
- **Cause racine** : Deux sources de vérité pour les labels de score.
- **Solution validée** : Aligner SCORE_SCALE avec `getScoreLabel()` de ui-configs.ts.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent UI/UX

### 2026-03-12 — PERFORMANCE — Export PDF charge results depuis DB (30s+)
- **Fichier(s)** : `src/app/api/deals/[dealId]/export-pdf/route.ts:53-60`
- **Erreur** : L'export PDF charge `analysis.results` directement depuis la DB Neon (blob de plusieurs MB = 30s+) au lieu d'utiliser le Blob cache CDN (<1s).
- **Cause racine** : Le code de la route n'utilise pas `loadResults()` du service persistence.
- **Solution validée** : Remplacer par `loadResults(analysisId)` qui utilise le Blob cache.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent Performance

### 2026-03-12 — PERFORMANCE — Deal detail SSR charge extractedText inutilement
- **Fichier(s)** : `src/app/(dashboard)/deals/[dealId]/page.tsx:37-41`
- **Erreur** : `documents: true` charge toutes les colonnes incluant `extractedText` (@db.Text, potentiellement 200KB+). Ce texte n'est jamais affiché sur cette page.
- **Cause racine** : `include: true` au lieu de `select: { fields... }`.
- **Solution validée** : Utiliser `documents: { select: { id: true, name: true, type: true, ... }, orderBy: ... }` sans `extractedText`.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent Performance

### 2026-03-12 — ARCHITECTURE — Race condition BaseAgent état mutable singleton
- **Fichier(s)** : `src/agents/base-agent.ts:61-76`, `src/agents/orchestrator/agent-registry.ts:18-19`
- **Erreur** : Les champs `_totalCost`, `_llmCalls`, etc. sont des variables d'instance mutables. Les agents sont cachés comme singletons. Deux analyses concurrentes corrompent les métriques.
- **Cause racine** : Etat mutable dans un singleton + absence d'isolation par requête.
- **Solution validée** : Déplacer l'état mutable dans un objet `RunContext` créé à chaque appel de `run()`, ou utiliser `AsyncLocalStorage`.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent Architecture

### 2026-03-12 — SCORING — Incohérence poids Board vs Scoring Tier 3
- **Fichier(s)** : `src/agents/board/board-member.ts:155-160` vs `src/scoring/services/score-aggregator.ts:24-30`
- **Erreur** : Board = Team 40%, Market 25%, Product 20%, Financials 10%, Risques 5%. Scoring = Team 25%, Market 20%, Product 20%, Financials 20%, Timing 15%. Le Board est structurellement plus optimiste sur les deals "bonne équipe / mauvais financials".
- **Cause racine** : Deux systèmes de poids conçus indépendamment.
- **Solution validée** : Aligner les poids du Board avec `stage-weights.ts`, ou documenter explicitement la différence dans l'UI.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent Scoring

### 2026-03-12 — RGPD — Vercel Blob access "public" pour les pitch decks
- **Fichier(s)** : `src/services/storage/index.ts:109-111`
- **Erreur** : Les documents sont uploadés en mode `access: "public"`. N'importe qui avec l'URL peut télécharger le pitch deck sans authentification.
- **Cause racine** : Vercel Blob free tier ne supporte que "public". Jamais migré vers le tier payant.
- **Solution validée** : Passer au tier payant Vercel Blob avec `access: "private"`, ou implémenter un proxy authentifié.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent RGPD

### 2026-03-12 — QA — Orchestrator index.ts 3748 lignes / tier1-results.tsx 3978 lignes
- **Fichier(s)** : `src/agents/orchestrator/index.ts`, `src/components/deals/tier1-results.tsx`
- **Erreur** : Fichiers monolithiques impossibles à maintenir.
- **Cause racine** : Croissance organique sans refactoring.
- **Solution validée** : Décomposer en sous-modules thématiques.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent QA

### 2026-03-12 — QA — 120+ console.log non gardés en production
- **Fichier(s)** : 50+ fichiers dans `src/`
- **Erreur** : ~120 `console.log/warn/error` s'exécutent en production, polluant les logs et exposant potentiellement des données.
- **Cause racine** : Pas de logger centralisé avec niveaux.
- **Solution validée** : Adopter un logger centralisé (pino, winston) avec niveaux, désactiver debug/info en prod.
- **Ce qui N'A PAS fonctionné** : N/A
- **Agent/Auteur** : Agent QA
